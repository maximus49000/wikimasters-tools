// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayContext, YMD } from '../../src/core/library/city/calendar';
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
  window.localStorage.clear();
  vi.restoreAllMocks();
});
afterEach(() => {
  unmount?.();
  unmount = null;
});

describe('useCityDay', () => {
  it('rend tout de suite un contexte de jour (repli approché) et le raffine avec le relais', async () => {
    writeZone('C');
    const reply = { ok: true, zone: 'C', periods: [{ name: 'Vacances de la Toussaint', start: '2026-10-17', end: '2026-11-02' }] };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(reply), { status: 200 })));
    const result = renderCityDay({ y: 2026, m: 10, d: 20 });
    expect(result.current.kind).toBeDefined();
    await waitFor(() => expect(result.current.kind).toBe('holiday'));
  });
  it('reconnaît un jour férié sans relais', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 502 })));
    const result = renderCityDay({ y: 2026, m: 5, d: 14 });
    expect(result.current.kind).toBe('public-holiday');
  });
});
