// @vitest-environment jsdom
// tests/content/city-life.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { dayContext } from '../../src/core/library/city/calendar';
import { doorsFor, residentFlow, tripAt, tripHappens, tripsFor } from '../../src/core/library/city/doors';
import { cityIntensity } from '../../src/core/library/city/intensity';
import type { CityContext } from '../../src/core/library/city/intensity';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Rendu minimal (le dépôt n'a pas @testing-library/react) : un conteneur par appel, démonté après chaque test.
const mounted: { root: Root; host: HTMLDivElement }[] = [];
const render = (node: ReactNode): { container: HTMLDivElement } => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  mounted.push({ root, host });
  return { container: host };
};
afterEach(() => {
  vi.restoreAllMocks();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

// Graine 1 : avec la graine 5 du plan, le tirage ne laisse que 4 véhicules sur 8 sous le seuil à 8 h 15 (hasard, pas règle).
const times = sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120);
const make = (hours: number, ymd: { y: number; m: number; d: number }, extra: Partial<CityContext> = {}) => {
  const minutes = Math.round(hours * 60);
  const sky = skyAt(minutes, times);
  const city: CityContext = { minutes, day: dayContext(ymd, []), precip: 0, snow: false, storm: false, daylight: sky.daylight, ...extra };
  return render(
    <svg>
      <CityLifeLayer width={720} height={340} sky={sky} seed={1} city={city} rainy={(extra.precip ?? 0) > 0.2} />
    </svg>,
  ).container;
};
const active = (c: HTMLElement, selector: string) => c.querySelectorAll(`${selector}[data-active="true"]`).length;

describe('CityLifeLayer', () => {
  it('le lundi à 8 h : des costumes, des familles et beaucoup de voitures', () => {
    const c = make(8.25, { y: 2026, m: 10, d: 5 }); // lundi
    expect(active(c, '[data-ped]')).toBeGreaterThan(3);
    expect(active(c, '[data-vehicle]')).toBeGreaterThan(4);
    expect(c.querySelectorAll('[data-role="schoolTo"][data-active="true"]').length).toBeGreaterThan(0);
  });
  it('le samedi : aucun groupe d’école, moins de véhicules qu’en pointe de semaine', () => {
    const sat = make(8.25, { y: 2026, m: 10, d: 10 });
    expect(sat.querySelectorAll('[data-role="schoolTo"][data-active="true"]')).toHaveLength(0);
    expect(active(sat, '[data-vehicle]')).toBeLessThan(active(make(8.25, { y: 2026, m: 10, d: 5 }), '[data-vehicle]'));
  });
  it('sous la pluie, les piétons actifs portent un parapluie et il y a moins de monde', () => {
    const dry = make(12, { y: 2026, m: 10, d: 10 });
    const wet = make(12, { y: 2026, m: 10, d: 10 }, { precip: 0.8 });
    expect(active(wet, '[data-ped]')).toBeLessThan(active(dry, '[data-ped]'));
    for (const node of wet.querySelectorAll('[data-ped][data-active="true"]')) expect(node.querySelector('[data-umbrella]')).not.toBeNull();
  });
  it('la nuit : presque personne', () => {
    expect(active(make(3.5, { y: 2026, m: 10, d: 5 }), '[data-ped]')).toBeLessThanOrEqual(1);
  });
  it('la file du fond roule à gauche, celle du premier plan à droite (échelle x)', () => {
    const c = make(12, { y: 2026, m: 10, d: 5 });
    const far = c.querySelector('[data-vehicle][data-lane="far"]')!;
    const near = c.querySelector('[data-vehicle][data-lane="near"]')!;
    expect(far.getAttribute('transform')).toMatch(/scale\(-/);
    expect(near.getAttribute('transform')).not.toMatch(/scale\(-/);
  });
  it('les habitants : présence au premier rendu = tirage du tour de cycle, opacité 0 quand absent', () => {
    const now = 1_760_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const c = make(8.25, { y: 2026, m: 10, d: 5 });
    const sky = skyAt(495, times);
    const flow = residentFlow(cityIntensity({ minutes: 495, day: dayContext({ y: 2026, m: 10, d: 5 }, []), precip: 0, snow: false, storm: false, daylight: sky.daylight }), 495);
    const trips = tripsFor(doorsFor(720, 340, 1), 1);
    const nodes = c.querySelectorAll('[data-resident]');
    expect(nodes).toHaveLength(trips.length);
    const t = now / 1000;
    let expected = 0;
    for (const trip of trips) {
      const node = c.querySelector(`[data-resident][data-life-id="${trip.id}"]`)!;
      const on = tripAt(trip, 720, t) !== null && tripHappens(trip, t, trip.kind === 'out' ? flow.out : flow.in);
      if (on) expected++;
      expect(node.getAttribute('data-active')).toBe(on ? 'true' : 'false');
      if (!on) expect(node.getAttribute('opacity')).toBe('0.00');
    }
    expect(active(c, '[data-resident]')).toBe(expected);
  });
});
