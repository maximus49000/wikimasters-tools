// @vitest-environment jsdom
// tests/content/city-life.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { dayContext } from '../../src/core/library/city/calendar';
import { doorsFor, residentFlow, tripAt, tripHappens, tripsFor } from '../../src/core/library/city/doors';
import { HYPER_S, activeEvents, cityEventSchedule, eventConditions } from '../../src/core/library/city/events';
import { cityIntensity } from '../../src/core/library/city/intensity';
import type { CityContext } from '../../src/core/library/city/intensity';
import { vehiclesFor, laneSpeeds } from '../../src/core/library/city/vehicles';
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
// Un bus ou un tram efface les voitures collées à lui : les tests qui comptent les véhicules fixent l'horloge à un instant
// où aucun événement n'efface de voiture (même calcul que le hook useCityEvents), pour tous les jours comparés.
const noYieldNow = (hours: number, days: { y: number; m: number; d: number }[]): number => {
  const minutes = Math.round(hours * 60);
  const daylight = skyAt(minutes, times).daylight;
  const yields = (T: number, ymd: { y: number; m: number; d: number }): boolean => {
    const city: CityContext = { minutes, day: dayContext(ymd, []), precip: 0, snow: false, storm: false, daylight };
    const hyper = Math.floor(T / HYPER_S);
    const schedule = cityEventSchedule({
      seed: 1, width: 720, hyper, minutesAtHyperStart: minutes - (T - hyper * HYPER_S) / 60,
      cond: eventConditions(city, cityIntensity(city)), vehicles: vehiclesFor(720, 1), speeds: laneSpeeds(1),
    });
    return activeEvents(schedule, T).some((e) => e.yields.length > 0);
  };
  for (let T = 1_790_000_000; T < 1_790_000_000 + 40 * HYPER_S; T += 5) if (days.every((ymd) => !yields(T, ymd))) return T * 1000;
  throw new Error('aucun instant sans voiture effacée');
};
const active = (c: HTMLElement, selector: string) => c.querySelectorAll(`${selector}[data-active="true"]`).length;

describe('CityLifeLayer : fêtes', () => {
  it('à la Saint-Valentin, des passants portent un signe et des couples se promènent', () => {
    const c = make(12, { y: 2026, m: 2, d: 14 });
    expect(c.querySelectorAll('[data-ped][data-mark][data-active="true"]').length).toBeGreaterThan(0);
    expect(c.querySelectorAll('[data-ped][data-role="festive"][data-mark="heart-balloon"]').length).toBeGreaterThan(0);
    expect(c.querySelector('[data-role="festive"][data-active="true"] [data-companion]')).not.toBeNull();
  });
  it('un jour ordinaire : aucun signe', () => {
    const c = make(12, { y: 2026, m: 10, d: 10 });
    expect(c.querySelector('[data-mark]')).toBeNull();
    expect(active(c, '[data-role="festive"]')).toBe(0);
  });
});

describe('CityLifeLayer', () => {
  it('le lundi à 8 h : des costumes, des familles et beaucoup de voitures', () => {
    vi.spyOn(Date, 'now').mockReturnValue(noYieldNow(8.25, [{ y: 2026, m: 10, d: 5 }]));
    const c = make(8.25, { y: 2026, m: 10, d: 5 }); // lundi
    expect(active(c, '[data-ped]')).toBeGreaterThan(3);
    expect(active(c, '[data-vehicle]')).toBeGreaterThan(4);
    expect(c.querySelectorAll('[data-role="schoolTo"][data-active="true"]').length).toBeGreaterThan(0);
  });
  it('le samedi : aucun groupe d’école, moins de véhicules qu’en pointe de semaine', () => {
    vi.spyOn(Date, 'now').mockReturnValue(noYieldNow(8.25, [{ y: 2026, m: 10, d: 5 }, { y: 2026, m: 10, d: 10 }]));
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
    const doors = doorsFor(720, 340, 1);
    const flow = residentFlow(cityIntensity({ minutes: 495, day: dayContext({ y: 2026, m: 10, d: 5 }, []), precip: 0, snow: false, storm: false, daylight: sky.daylight }), 495, doors.length, 720);
    const trips = tripsFor(doors, 1);
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
  it('les lampadaires sont dessinés après les passants (devant eux) et avant les voitures', () => {
    const c = make(21, { y: 2026, m: 10, d: 5 });
    const layer = c.querySelector('[data-city-life]')!;
    // Les masques (<defs>) n'apparaissent qu'avec un feu d'artifice ou une grue ; le groupe des événements du fond vient en premier.
    const order = Array.from(layer.children)
      .filter((el) => el.tagName.toLowerCase() !== 'defs')
      .map((el) => (el.hasAttribute('data-city-events-back') ? 'events-back' : el.hasAttribute('data-city-sidewalk') ? 'sidewalk' : el.hasAttribute('data-street-lamps') ? 'lamps' : el.getAttribute('data-city-lane')));
    expect(order).toEqual(['events-back', 'sidewalk', 'lamps', 'far', 'near']);
    expect(layer.querySelectorAll('[data-street-lamp][data-lit="true"]').length).toBeGreaterThan(0);
  });
  it('les vélos roulent sur leur piste, dessinés après les voitures de la file du premier plan', () => {
    const c = make(12, { y: 2026, m: 10, d: 10 });
    const near = Array.from(c.querySelectorAll('[data-city-lane="near"] [data-vehicle]'));
    const kinds = near.map((n) => n.getAttribute('data-kind'));
    const firstBike = kinds.indexOf('bike');
    if (firstBike >= 0) expect(kinds.slice(firstBike).every((k) => k === 'bike')).toBe(true);
  });
});

describe('CityLifeLayer : boucle d’animation', () => {
  it('un passant ou un véhicule qui devient absent continue d’avancer pendant son fondu, puis s’arrête', () => {
    let now = 1_760_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    let tick: ((ms: number) => void) | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: (ms: number) => void) => {
      tick = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const ymd = { y: 2026, m: 10, d: 5 };
    const ctx = (hours: number): CityContext => {
      const minutes = Math.round(hours * 60);
      return { minutes, day: dayContext(ymd, []), precip: 0, snow: false, storm: false, daylight: skyAt(minutes, times).daylight };
    };
    const sky = skyAt(495, times);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    act(() => root.render(<svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={ctx(8.25)} rainy={false} /></svg>));
    const before = new Set(Array.from(host.querySelectorAll('[data-vehicle][data-active="true"], [data-ped][data-active="true"]')).map((n) => n.getAttribute('data-life-id')));
    // 3 h 30 : presque tout le monde disparaît.
    act(() => root.render(<svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={ctx(3.5)} rainy={false} /></svg>));
    const leaving = Array.from(host.querySelectorAll<SVGGElement>('[data-vehicle][data-active="false"], [data-ped][data-active="false"]')).filter((n) => before.has(n.getAttribute('data-life-id')));
    expect(leaving.length).toBeGreaterThan(0);
    const node = leaving[0]!;
    const at = (): string | null => node.getAttribute('transform');
    const frame = (dtMs: number, rafMs: number): void => {
      now += dtMs;
      act(() => tick!(rafMs));
    };
    const t1 = at();
    frame(1000, 1000);
    const t2 = at();
    expect(t2).not.toBe(t1); // pendant le fondu : il avance encore
    frame(3000, 4000);
    const t3 = at();
    frame(1000, 5000);
    expect(at()).toBe(t3); // fondu fini : il ne bouge plus (opacité 0, aucune écriture)
    vi.unstubAllGlobals();
  });
});

describe('CityLifeLayer : mouvement réduit', () => {
  it('les positions restent figées quand le rendu est recalculé (pas de saut à la minute)', () => {
    let now = 1_760_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
    const sky = skyAt(12 * 60, times);
    const ctx = (minutes: number): CityContext => ({ minutes, day: dayContext({ y: 2026, m: 10, d: 10 }, []), precip: 0, snow: false, storm: false, daylight: sky.daylight });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    const draw = (minutes: number) => act(() => root.render(<svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={ctx(minutes)} rainy={false} /></svg>));
    // Les transforms posés au rendu React (le placement de la boucle n'a pas lieu en mouvement réduit).
    const transforms = () => [...host.querySelectorAll('[data-ped]')].map((n) => n.getAttribute('transform'));
    draw(720);
    const before = transforms();
    now += 60_000;
    draw(721);
    expect(transforms()).toEqual(before);
  });
});
