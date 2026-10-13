// @vitest-environment jsdom
// tests/content/city-events-layer.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { FIXED_FADE_S, fixedFade } from '../../src/core/library/city/event-place';
import { dayContext } from '../../src/core/library/city/calendar';
import type { YMD } from '../../src/core/library/city/calendar';
import { HYPER_S, MAX_EVENTS, STILL_EVENTS, activeEvents, cityEventSchedule, eventConditions, hyperStartMinute, type CityEvent } from '../../src/core/library/city/events';
import { cityIntensity, type CityContext } from '../../src/core/library/city/intensity';
import { cityMetrics } from '../../src/core/library/city/metrics';
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
const contextAt = (hours: number, date: YMD = { y: 2026, m: 10, d: 5 }): { city: CityContext; sky: ReturnType<typeof skyAt> } => {
  const minutes = Math.round(hours * 60);
  const sky = skyAt(minutes, times);
  return { sky, city: { minutes, day: dayContext(date, []), precip: 0, snow: false, storm: false, daylight: sky.daylight } };
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
// Événements de rue : entrent dans le moteur de circulation (traffic-layer.tsx) et sont dessinés comme ses véhicules.
const STREET = new Set<string>(['bus', 'tram', 'ambulance', 'garbage-truck', 'delivery-bike']);
const METRICS = cityMetrics(340);
// Ordonnée d'un véhicule (transform posé au montage, à l'instant T).
const yOfNode = (n: Element): number => Number(/translate\([^ ]+ ([^)]+)\)/.exec(n.getAttribute('transform') ?? '')![1]);
// Ambulance dans une voie, 1 à 5 s après son départ : indices de dessin de l'ambulance et des voitures rangées au bord
// (décalage latéral vers le trottoir, au-delà de l'ondulation ordinaire). Premier plan : bord = plus bas à l'écran ; fond :
// plus haut. Parcourt les passages d'ambulance jusqu'à en trouver un qui fait ranger au moins une voiture.
const ambulanceLane = (lane: 'near' | 'far'): { amb: number; pulled: number[] } => {
  const { city } = contextAt(10);
  const gap = METRICS.laneY.near - METRICS.laneY.far;
  const edge = lane === 'near' ? (y: number): boolean => y > METRICS.laneY.near + 0.2 * gap : (y: number): boolean => y < METRICS.laneY.far - 0.2 * gap;
  let from = 0;
  for (let tries = 0; tries < 6; tries++) {
    const start = findWhen(city, (evs, t) => t > from && evs.some((e) => e.id === 'ambulance' && e.track === lane && t - e.start >= 0 && t - e.start < 1), 400);
    from = start + 60;
    for (let d = 1; d <= 5; d++) {
      const c = mount(start + d, 10);
      const children = [...c.querySelector(`[data-traffic-lane="${lane}"]`)!.children];
      const amb = children.findIndex((n) => n.getAttribute('data-kind') === 'ambulance');
      const pulled = children.flatMap((n, i) => (n.getAttribute('data-lane') === lane && n.getAttribute('data-kind') !== 'ambulance' && edge(yOfNode(n)) ? [i] : []));
      if (amb >= 0 && pulled.length > 0) {
        for (const i of pulled) expect(children[i]!.getAttribute('data-active')).toBe('true');
        return { amb, pulled };
      }
    }
  }
  throw new Error('aucun passage d’ambulance ne fait ranger de voiture');
};
const mount = (T: number, hours: number, still = false, date?: YMD): HTMLDivElement => {
  vi.spyOn(Date, 'now').mockReturnValue(T * 1000);
  // jsdom n'a pas matchMedia : même bouchon que tests/content/city-life.test.tsx.
  if (still) vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  const { city, sky } = contextAt(hours, date);
  return render(<svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={city} rainy={false} /></svg>);
};

describe('événements dans la couche de la ville', () => {
  it('dessine les événements actifs : ceux de la rue comme véhicules du moteur, les autres comme événements', () => {
    const { city } = contextAt(10);
    // Un événement de rue parti depuis 2 s : il est entré dans la voie (démarrage à chaud du moteur jusqu'à T).
    const T = findWhen(city, (evs, t) => evs.some((e) => STREET.has(e.id) && t - e.start >= 2 && t - e.start < 3));
    const active = expected(T, city);
    const c = mount(T, 10);
    const ids = [...c.querySelectorAll('[data-event]')].map((n) => n.getAttribute('data-event')).sort();
    expect(ids).toEqual(active.filter((e) => !STREET.has(e.id)).map((e) => e.id).sort());
    expect(active.length).toBeLessThanOrEqual(MAX_EVENTS);
    for (const e of active.filter((x) => STREET.has(x.id))) {
      const agent = c.querySelector(`[data-traffic-lane] > [data-vehicle][data-kind="${e.id}"]`)!;
      expect(agent).not.toBeNull();
      expect(agent.querySelector(`[data-event-sprite="${e.id}"]`)).not.toBeNull();
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
  // Le bus et la benne ne font plus disparaître les voitures (ancien `yieldsFor`) : ce sont des véhicules du moteur, les autres
  // gardent leurs distances. L'ambulance fait ranger les voitures au bord (sans fondu) ; l'ordre de dessin suit la profondeur.
  it('aucune voiture ne s’efface : tous les véhicules du moteur restent dessinés', () => {
    const { city } = contextAt(8.25);
    const T = findWhen(city, (evs, t) => evs.some((e) => (e.id === 'garbage-truck' || e.id === 'delivery-bike') && t - e.start >= 4 && t - e.start < 5), 400);
    const c = mount(T, 8.25);
    const vehicles = [...c.querySelectorAll('[data-traffic-lane] > [data-vehicle]')];
    expect(vehicles.some((n) => ['bus', 'garbage-truck', 'delivery-bike'].includes(n.getAttribute('data-kind') ?? ''))).toBe(true);
    expect(vehicles.filter((n) => n.getAttribute('data-kind') === 'car').length).toBeGreaterThan(0);
    for (const n of vehicles) {
      expect(n.getAttribute('data-active')).toBe('true');
      expect(n.hasAttribute('data-yield')).toBe(false);
      expect(n.hasAttribute('opacity')).toBe(false);
    }
  });
  it('file du premier plan : l’ambulance est dessinée sous les voitures rangées au bord pour elle', () => {
    const { amb, pulled } = ambulanceLane('near');
    expect(pulled.length).toBeGreaterThan(0);
    for (const p of pulled) expect(amb).toBeLessThan(p);
  });
  it('file du fond : l’ambulance est dessinée après les voitures rangées au bord pour elle', () => {
    const { amb, pulled } = ambulanceLane('far');
    expect(pulled.length).toBeGreaterThan(0);
    for (const p of pulled) expect(amb).toBeGreaterThan(p);
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
  describe('événements de fête', () => {
    const EASTER: YMD = { y: 2026, m: 4, d: 5 };
    it('les cloches de Pâques passent au fond, avec le ciel', () => {
      const { city } = contextAt(11, EASTER);
      const T = findTime(city, (ids) => ids.includes('bells'));
      const node = mount(T, 11, false, EASTER).querySelector('[data-event="bells"]')!;
      expect(node).not.toBeNull();
      expect(node.closest('[data-city-events-back]')).not.toBeNull();
    });
  });
});
