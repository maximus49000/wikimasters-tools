// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayContext, YMD } from '../../src/core/library/city/calendar';
const pos = vi.hoisted(() => ({ known: false, value: { lat: 48.6, lon: 7.7 } }));
vi.mock('../../src/content/scene-position', () => ({
  currentPosition: () => pos.value,
  isPositionKnown: () => pos.known,
  subscribePosition: () => () => undefined,
}));

import { useCityDay } from '../../src/content/use-city-calendar';
import { writeZone } from '../../src/content/zone-setting';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let unmount: (() => void) | null = null;

// @testing-library/react n'est pas installé : petit banc maison (même résultat : `current` suit le dernier rendu).
function renderCityDay(date: YMD): { current: DayContext } {
  const out = { current: undefined as unknown as DayContext };
  function Probe() {
    out.current = useCityDay(date);
    return null;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(<Probe />));
  unmount = () => act(() => root.unmount());
  return out;
}

async function waitFor(check: () => void): Promise<void> {
  let last: unknown;
  for (let i = 0; i < 50; i += 1) {
    try {
      check();
      return;
    } catch (e) {
      last = e;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
    }
  }
  throw last;
}

beforeEach(() => {
  pos.known = false;
  window.localStorage.clear();
  vi.restoreAllMocks();
});
afterEach(() => {
  unmount?.();
  unmount = null;
});

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
const period = (zone: string) => ({ ok: true, zone, periods: [{ name: 'Vacances de test', start: '2026-03-02', end: '2026-03-10' }] });
// Relais simulé : /department répond `dept`, /school-calendar répond une période propre à la zone demandée.
function relay(dept: string | null) {
  return vi.fn(async (url: string) => {
    if (url.includes('/department')) return dept ? json({ ok: true, dept }) : new Response('x', { status: 502 });
    return json(period(new URL(url).searchParams.get('zone') ?? ''));
  });
}
const calls = (f: ReturnType<typeof vi.fn>, part: string): string[] => f.mock.calls.map((c) => String(c[0])).filter((u) => u.includes(part));
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });

describe('useCityDay', () => {
  it('rend tout de suite un contexte de jour (repli approché) et le raffine avec le relais', async () => {
    writeZone('C');
    const f = relay(null);
    vi.stubGlobal('fetch', f);
    // Mardi 3 mars 2026 : jour d'école dans le repli approché, vacances seulement dans la réponse du relais.
    const result = renderCityDay({ y: 2026, m: 3, d: 3 });
    expect(result.current.kind).toBe('school');
    await waitFor(() => expect(result.current.kind).toBe('holiday'));
    expect(calls(f, 'school-calendar')).toHaveLength(1);
  });
  it('reconnaît un jour férié sans relais', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 502 })));
    const result = renderCityDay({ y: 2026, m: 5, d: 14 });
    expect(result.current.kind).toBe('public-holiday');
  });
  it('position connue : département 67 → Alsace-Moselle et zone du 67 pour le calendrier', async () => {
    pos.known = true;
    const f = relay('67');
    vi.stubGlobal('fetch', f);
    // Vendredi 3 avril 2026 : le Vendredi saint n'est férié qu'en Alsace-Moselle.
    const result = renderCityDay({ y: 2026, m: 4, d: 3 });
    await waitFor(() => expect(result.current.publicHoliday).not.toBeNull());
    expect(calls(f, 'department')).toHaveLength(1);
    expect(calls(f, 'department')[0]).toContain('lat=48.6&lon=7.7');
    await waitFor(() => expect(calls(f, 'school-calendar').some((u) => u.includes('zone=B'))).toBe(true));
  });
  it('réglage manuel : aucune requête de département', async () => {
    pos.known = true;
    writeZone('A');
    const f = relay('67');
    vi.stubGlobal('fetch', f);
    renderCityDay({ y: 2026, m: 3, d: 3 });
    await waitFor(() => expect(calls(f, 'school-calendar').some((u) => u.includes('zone=A'))).toBe(true));
    expect(calls(f, 'department')).toHaveLength(0);
  });
  it('le département est mis en cache 30 jours : pas de seconde requête', async () => {
    pos.known = true;
    const f = relay('67');
    vi.stubGlobal('fetch', f);
    renderCityDay({ y: 2026, m: 3, d: 3 });
    await waitFor(() => expect(calls(f, 'school-calendar').some((u) => u.includes('zone=B'))).toBe(true));
    unmount?.();
    renderCityDay({ y: 2026, m: 3, d: 3 });
    await settle();
    expect(calls(f, 'department')).toHaveLength(1);
  });
  it('un échec du relais de département est mémorisé : pas de nouvel essai le jour même', async () => {
    pos.known = true;
    const f = relay(null);
    vi.stubGlobal('fetch', f);
    renderCityDay({ y: 2026, m: 3, d: 3 });
    await waitFor(() => expect(calls(f, 'department')).toHaveLength(1));
    unmount?.();
    renderCityDay({ y: 2026, m: 3, d: 3 });
    await settle();
    expect(calls(f, 'department')).toHaveLength(1);
  });
  it('sans position connue : zone par défaut C, aucune requête de département', async () => {
    const f = relay('67');
    vi.stubGlobal('fetch', f);
    renderCityDay({ y: 2026, m: 3, d: 3 });
    await waitFor(() => expect(calls(f, 'school-calendar').some((u) => u.includes('zone=C'))).toBe(true));
    expect(calls(f, 'department')).toHaveLength(0);
  });
});
