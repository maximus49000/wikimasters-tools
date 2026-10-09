// @vitest-environment jsdom
// tests/content/city-events-layer.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { FIXED_FADE_S, fixedFade } from '../../src/core/library/city/event-place';
import { dayContext } from '../../src/core/library/city/calendar';
import { HYPER_S, MAX_EVENTS, STILL_EVENTS, activeEvents, cityEventSchedule, eventConditions, hyperStartMinute, type CityEvent } from '../../src/core/library/city/events';
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
// Même calcul que le hook : programme du grand créneau, minute de la scène ramenée au début du grand créneau.
// Programmes mis en cache (par ville, grand créneau et minute de début) : les recherches parcourent des milliers d'instants.
const cache = new WeakMap<CityContext, Map<string, CityEvent[]>>();
const expected = (T: number, city: CityContext): CityEvent[] => {
  const hyper = Math.floor(T / HYPER_S);
  const anchor = hyperStartMinute(city.minutes, T, hyper);
  let byKey = cache.get(city);
  if (!byKey) cache.set(city, (byKey = new Map()));
  const k = `${hyper}:${anchor}`;
  let schedule = byKey.get(k);
  if (!schedule) {
    schedule = cityEventSchedule({
      seed: 1, width: 720, hyper, minutesAtHyperStart: anchor,
      cond: eventConditions(city, cityIntensity(city)), vehicles: VEHICLES, speeds: laneSpeeds(1),
    });
    byKey.set(k, schedule);
  }
  return activeEvents(schedule, T);
};
const VEHICLES = vehiclesFor(720, 1);
const findTime = (city: CityContext, ok: (ids: string[]) => boolean): number => findWhen(city, (evs) => ok(evs.map((e) => e.id)));
const findWhen = (city: CityContext, ok: (evs: CityEvent[], T: number) => boolean, span = 40): number => {
  for (let T = 1_790_000_000; T < 1_790_000_000 + span * HYPER_S; T += 1) if (ok(expected(T, city), T)) return T;
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
    const withYields = (e: CityEvent): boolean => (e.id === 'bus' || e.id === 'tram') && e.yields.length > 0;
    const T = findWhen(city, (evs) => evs.some(withYields), 400);
    const ev = expected(T, city).find(withYields)!;
    expect(ev.yields.length).toBeGreaterThan(0);
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
    // Un événement figé (grue, cerf-volant…) et un autre qui, lui, ne doit pas être dessiné.
    const T = findTime(city, (ids) => ids.some((id) => STILL_EVENTS.has(id as never)) && ids.some((id) => !STILL_EVENTS.has(id as never)));
    const c = mount(T, 10, true);
    const drawn = c.querySelectorAll('[data-event]');
    expect(drawn.length).toBeGreaterThan(0);
    for (const n of drawn) {
      expect(STILL_EVENTS.has(n.getAttribute('data-event') as never)).toBe(true);
      expect(n.getAttribute('opacity')).toBe('1');
    }
    expect(drawn.length).toBe(expected(T, city).filter((e) => STILL_EVENTS.has(e.id)).length);
    expect(c.querySelectorAll('animate, animateTransform')).toHaveLength(0);
  });
  it('file du premier plan : l’ambulance est dessinée sous les voitures qui se rangent', () => {
    const { city } = contextAt(10);
    const T = findWhen(city, (evs) => evs.some((e) => e.id === 'ambulance' && e.track === 'near'), 400);
    const c = mount(T, 10);
    const lane = c.querySelector('[data-city-lane="near"]')!;
    const children = [...lane.children];
    const amb = children.findIndex((n) => n.getAttribute('data-event') === 'ambulance');
    const firstCar = children.findIndex((n) => n.hasAttribute('data-vehicle'));
    expect(amb).toBeGreaterThanOrEqual(0);
    expect(amb).toBeLessThan(firstCar);
  });
  it('file du fond : l’ambulance reste dessinée après les voitures', () => {
    const { city } = contextAt(10);
    const T = findWhen(city, (evs) => evs.some((e) => e.id === 'ambulance' && e.track === 'far'), 400);
    const c = mount(T, 10);
    const children = [...c.querySelector('[data-city-lane="far"]')!.children];
    const amb = children.findIndex((n) => n.getAttribute('data-event') === 'ambulance');
    const lastCar = children.map((n) => n.hasAttribute('data-vehicle')).lastIndexOf(true);
    expect(amb).toBeGreaterThan(lastCar);
  });
  it('un événement fixe apparaît en fondu (2 s), sans fondu en mouvement réduit', () => {
    const { city } = contextAt(10);
    const isFixed = (e: CityEvent): boolean => e.id === 'crane' || e.id === 'kite';
    const T = findWhen(city, (evs, t) => evs.some((e) => isFixed(e) && t - e.start < FIXED_FADE_S), 400);
    const e = expected(T, city).find(isFixed)!;
    const fade = fixedFade(e, T);
    expect(fade).toBeLessThan(1);
    const moving = mount(T, 10).querySelector(`[data-event="${e.id}"]`)!;
    expect(moving.getAttribute('opacity')).toBe(fade.toFixed(2));
    const still = mount(T, 10, true).querySelector(`[data-event="${e.id}"]`)!;
    expect(still.getAttribute('opacity')).toBe('1');
  });
});
