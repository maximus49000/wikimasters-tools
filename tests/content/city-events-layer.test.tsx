// @vitest-environment jsdom
// tests/content/city-events-layer.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { dayContext } from '../../src/core/library/city/calendar';
import { HYPER_S, MAX_EVENTS, STILL_EVENTS, activeEvents, cityEventSchedule, eventConditions } from '../../src/core/library/city/events';
import { cityIntensity, type CityContext } from '../../src/core/library/city/intensity';
import { laneSpeeds, vehiclesFor } from '../../src/core/library/city/vehicles';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: { root: Root; host: HTMLDivElement }[] = [];
const render = (node: ReactNode): HTMLDivElement => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  mounted.push({ root, host });
  return host;
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const times = sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120);
const contextAt = (hours: number): { city: CityContext; sky: ReturnType<typeof skyAt> } => {
  const minutes = Math.round(hours * 60);
  const sky = skyAt(minutes, times);
  return { sky, city: { minutes, day: dayContext({ y: 2026, m: 10, d: 5 }, []), precip: 0, snow: false, storm: false, daylight: sky.daylight } };
};
// Même calcul que le hook : programme du grand créneau, minutes ramenées au début du grand créneau.
const expected = (T: number, city: CityContext) => {
  const hyper = Math.floor(T / HYPER_S);
  const schedule = cityEventSchedule({
    seed: 1, width: 720, hyper, minutesAtHyperStart: city.minutes - (T - hyper * HYPER_S) / 60,
    cond: eventConditions(city, cityIntensity(city)), vehicles: vehiclesFor(720, 1), speeds: laneSpeeds(1),
  });
  return activeEvents(schedule, T);
};
const findTime = (city: CityContext, ok: (ids: string[]) => boolean): number => {
  for (let T = 1_790_000_000; T < 1_790_000_000 + 40 * HYPER_S; T += 5) if (ok(expected(T, city).map((e) => e.id))) return T;
  throw new Error('aucun instant trouvé');
};
const mount = (T: number, hours: number, still = false): HTMLDivElement => {
  vi.spyOn(Date, 'now').mockReturnValue(T * 1000);
  // jsdom n'a pas matchMedia : même bouchon que tests/content/city-life.test.tsx.
  if (still) vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  const { city, sky } = contextAt(hours);
  return render(<svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={city} rainy={false} /></svg>);
};

describe('événements dans la couche de la ville', () => {
  it('dessine exactement les événements actifs, au plus deux', () => {
    const { city } = contextAt(10);
    const T = findTime(city, (ids) => ids.length > 0);
    const c = mount(T, 10);
    const ids = [...c.querySelectorAll('[data-event]')].map((n) => n.getAttribute('data-event')).sort();
    expect(ids).toEqual(expected(T, city).map((e) => e.id).sort());
    expect(ids.length).toBeLessThanOrEqual(MAX_EVENTS);
  });
  it('un bus ou un tram efface les voitures collées à lui', () => {
    const { city } = contextAt(8.25);
    const T = findTime(city, (ids) => ids.includes('bus') || ids.includes('tram'));
    const ev = expected(T, city).find((e) => e.id === 'bus' || e.id === 'tram')!;
    const c = mount(T, 8.25);
    for (const id of ev.yields) {
      const node = c.querySelector(`[data-life-id="${id}"]`)!;
      expect(node.getAttribute('data-active')).toBe('false');
      expect(node.getAttribute('data-yield')).toBe('true');
    }
  });
  it('le feu d’artifice est masqué par les immeubles', () => {
    const { city } = contextAt(22.5);
    const T = findTime(city, (ids) => ids.includes('fireworks'));
    const c = mount(T, 22.5);
    const fw = c.querySelector('[data-event="fireworks"]')!;
    const masked = fw.closest('[data-event-mask="skyline"]')!;
    expect(masked).not.toBeNull();
    const maskId = masked.getAttribute('mask')!.replace(/^url\(#(.*)\)$/, '$1');
    expect(c.querySelector(`mask[id="${maskId}"]`)).not.toBeNull();
  });
  it('en mouvement réduit, seuls les événements fixes autorisés restent', () => {
    const { city } = contextAt(10);
    const T = findTime(city, (ids) => ids.length > 0);
    const c = mount(T, 10, true);
    for (const n of c.querySelectorAll('[data-event]')) expect(STILL_EVENTS.has(n.getAttribute('data-event') as never)).toBe(true);
    expect(c.querySelectorAll('animate, animateTransform')).toHaveLength(0);
  });
});
