// @vitest-environment jsdom
// tests/content/city-life.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer, SHOW_FREE_MIN, pedEdgePad, showEvents, towerColumns, towerSilhouettes } from '../../src/content/city-life';
import { lifeStates, sharedSceneLife } from '../../src/content/use-scene-life';
import { fireworksShow } from '../../src/core/library/city/fireworks-show';
import { dayContext } from '../../src/core/library/city/calendar';
import { doorsFor, residentFlow, tripAt, tripHappens, tripsFor } from '../../src/core/library/city/doors';
import { HYPER_S, activeEvents, cityEventSchedule, eventConditions } from '../../src/core/library/city/events';
import { cityIntensity } from '../../src/core/library/city/intensity';
import type { CityContext } from '../../src/core/library/city/intensity';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { pedestriansFor } from '../../src/core/library/city/people';
import { WORLD_MARGIN } from '../../src/core/library/scene-world';
import { vehiclesFor, laneSpeeds } from '../../src/core/library/city/vehicles';
import { THRESHOLD_S, entranceOpening } from '../../src/core/library/city/doorway';
import { DOOR_WIDTH } from '../../src/core/library/city/doors';
import { DOOR_SILL_HALF, DOOR_SILL_TOP } from '../../src/content/door-passage';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import { HALL_TIMER_S, crossingDoorX, seedHallTimers, stairFloorsLit } from '../../src/core/library/city/hall-lights';
import { cityFacades, stairsFor } from '../../src/core/library/city/facades';

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
    const trips = tripsFor(doors, 1, 720);
    const nodes = c.querySelectorAll('[data-resident]');
    expect(nodes).toHaveLength(trips.length);
    const t = now / 1000;
    let expected = 0;
    for (const trip of trips) {
      const node = c.querySelector(`[data-resident][data-life-id="${trip.id}"]`)!;
      // Le nœud de rue n'est actif qu'en rue ou en demi-tour : au seuil, c'est le nœud de porte qui l'est.
      const pos = tripAt(trip, 720, t);
      const on = pos !== null && pos.stage !== 'threshold' && tripHappens(trip, t, trip.kind === 'out' ? flow.out : flow.in);
      if (on) expected++;
      expect(node.getAttribute('data-active')).toBe(on ? 'true' : 'false');
      if (!on) expect(node.getAttribute('opacity')).toBe('0.00');
      // Absent : caché (display none, pas peint à opacité 0) ; présent : montré.
      expect(node.getAttribute('display')).toBe(on ? null : 'none');
    }
    expect(active(c, '[data-resident]')).toBe(expected);
  });
  it('nœuds de la vie à opacité 0 cachés (display none) : passants, habitants, seuils, ombres ; visibles montrés', () => {
    const c = make(8.25, { y: 2026, m: 10, d: 5 });
    const nodes = [...c.querySelectorAll('[data-ped], [data-resident], svg[data-resident-door], [data-shade-for], [data-door-dark], [data-door-fig]')];
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.some((n) => Number(n.getAttribute('opacity')) === 0)).toBe(true);
    for (const n of nodes) expect(n.getAttribute('display') === 'none').toBe(Number(n.getAttribute('opacity')) === 0);
  });
  it('habitants : aucune transition CSS ; nœud de porte rogné par un <svg> imbriqué', () => {
    const c = make(8, { y: 2026, m: 10, d: 9 });
    for (const r of c.querySelectorAll<SVGGElement>('[data-resident]')) expect(r.style.transition).toBe('');
    const doorsNodes = c.querySelectorAll('svg[data-resident-door]');
    expect(doorsNodes.length).toBeGreaterThan(0);
    for (const d of doorsNodes) {
      expect(d.getAttribute('overflow')).toBe('hidden');
      expect(d.querySelector('[data-door-dark]')).not.toBeNull();
    }
  });
  it('habitant au seuil (horloge figée) : nœud de porte visible, nœud de rue caché', () => {
    const sky = skyAt(480, times);
    const doors = doorsFor(720, 340, 1);
    const flow = residentFlow(cityIntensity({ minutes: 480, day: dayContext({ y: 2026, m: 10, d: 9 }, []), precip: 0, snow: false, storm: false, daylight: sky.daylight }), 480, doors.length, 720);
    const T0 = 1.8e9;
    let found: { id: string; t: number } | null = null;
    for (const trip of tripsFor(doors, 1, 720)) {
      for (let t = T0; t < T0 + 600 && !found; t += 0.25) {
        if (tripAt(trip, 720, t)?.stage === 'threshold' && tripHappens(trip, t, trip.kind === 'out' ? flow.out : flow.in)) found = { id: trip.id, t };
      }
      if (found) break;
    }
    expect(found).not.toBeNull();
    vi.spyOn(Date, 'now').mockReturnValue(found!.t * 1000);
    const c = make(8, { y: 2026, m: 10, d: 9 });
    expect(c.querySelector(`[data-resident-door][data-trip-id="${found!.id}"]`)!.getAttribute('data-active')).toBe('true');
    expect(c.querySelector(`[data-resident][data-trip-id="${found!.id}"]`)!.getAttribute('data-active')).toBe('false');
    expect(THRESHOLD_S).toBeGreaterThan(0);
  });
  it('habitant au seuil : cadre large (parapluie compris) au bord du trottoir, l’ouverture dès 0,4 de profondeur, pieds sur m.doorY', () => {
    const sky = skyAt(480, times);
    const m = cityMetrics(340);
    const doors = doorsFor(720, 340, 1);
    const flow = residentFlow(cityIntensity({ minutes: 480, day: dayContext({ y: 2026, m: 10, d: 9 }, []), precip: 0, snow: false, storm: false, daylight: sky.daylight }), 480, doors.length, 720);
    const T0 = 1.8e9;
    // Un instant au seuil près du trottoir (profondeur < 0,02) et un autre au fond (≥ 0,4), pour des habitants qui sortent ce tour-ci.
    const find = (ok: (depth: number) => boolean): { trip: ReturnType<typeof tripsFor>[number]; t: number } => {
      for (const trip of tripsFor(doors, 1, 720)) {
        for (let t = T0; t < T0 + 600; t += 0.01) {
          const p = tripAt(trip, 720, t);
          if (p?.stage === 'threshold' && ok(p.depth) && tripHappens(trip, t, trip.kind === 'out' ? flow.out : flow.in)) return { trip, t };
        }
      }
      throw new Error('aucun seuil');
    };
    const box = (at: { trip: ReturnType<typeof tripsFor>[number]; t: number }) => {
      vi.spyOn(Date, 'now').mockReturnValue(at.t * 1000);
      const c = make(8, { y: 2026, m: 10, d: 9 });
      const svg = c.querySelector(`[data-resident-door][data-trip-id="${at.trip.id}"]`)!;
      expect(svg.getAttribute('data-active')).toBe('true');
      const dark = svg.querySelector('[data-door-dark]')!;
      const fig = svg.querySelector('[data-door-fig]')!;
      const p = tripAt(at.trip, 720, at.t)!;
      const center = p.x === at.trip.doorX || at.trip.endDoorX === null ? at.trip.doorX : at.trip.endDoorX;
      const o = entranceOpening(center - DOOR_WIDTH / 2, m);
      const n = (e: Element, a: string): number => Number(e.getAttribute(a));
      const [, , fy] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(fig.getAttribute('transform')!)!.map(Number);
      return { x: n(svg, 'x'), y: n(svg, 'y'), w: n(svg, 'width'), darkX: n(svg, 'x') + n(dark, 'x'), darkY: n(svg, 'y') + n(dark, 'y'), feet: n(svg, 'y') + fy!, depth: p.depth, o, k: m.unit * 0.55 * at.trip.scale };
    };
    const sill = box(find((d) => d < 0.02));
    expect(sill.w).toBeGreaterThanOrEqual(2 * DOOR_SILL_HALF - 0.5);
    expect(sill.y).toBeLessThanOrEqual(m.doorY - DOOR_SILL_TOP * sill.k * (1 - sill.depth / 0.4) + 0.05);
    expect(Math.abs(sill.feet + sill.depth * 3 * m.unit - m.doorY)).toBeLessThan(0.1);
    expect(sill.darkX).toBeCloseTo(sill.o.x, 1);
    expect(sill.darkY).toBeCloseTo(sill.o.y, 1);
    vi.restoreAllMocks();
    const deep = box(find((d) => d >= 0.45 && d < 0.9));
    expect(deep.x).toBeCloseTo(deep.o.x, 1);
    expect(deep.y).toBeCloseTo(deep.o.y, 1);
    expect(deep.w).toBeCloseTo(deep.o.w, 1);
    expect(deep.darkX).toBeCloseTo(deep.o.x, 1);
  });
  it('les lampadaires sont dessinés après les passants (devant eux) et avant les voitures', () => {
    const c = make(21, { y: 2026, m: 10, d: 5 });
    const layer = c.querySelector('[data-city-life]')!;
    // Les masques (<defs>) n'apparaissent qu'avec un feu d'artifice ou une grue ; le groupe des événements du fond vient en premier.
    const order = Array.from(layer.children)
      .filter((el) => el.tagName.toLowerCase() !== 'defs')
      .map((el) =>
        el.hasAttribute('data-city-events-back') ? 'events-back'
        : el.hasAttribute('data-city-sidewalk') ? 'sidewalk'
        : el.hasAttribute('data-city-curb') ? 'curb'
        : el.hasAttribute('data-street-lamps') ? 'lamps'
        : el.hasAttribute('data-install-part') ? `install-${el.getAttribute('data-install-part')}`
        : el.hasAttribute('data-crosswalk') ? 'crosswalk'
        : el.hasAttribute('data-traffic-fixtures') ? `fixtures-${el.getAttribute('data-traffic-fixtures')}`
        : el.hasAttribute('data-crossing') ? `crossing-${el.getAttribute('data-crossing')}`
        : el.hasAttribute('data-bus-riders') ? `riders-${el.getAttribute('data-bus-riders')}`
        : el.hasAttribute('data-front-sidewalk') ? 'front-sidewalk'
        : el.getAttribute('data-city-lane'));
    // Décors de fête du devant (drapeaux de lampadaires, camions élévateurs) : juste après les lampadaires ; puis la chaussée de
    // la rue privatisée (Fête de la musique), le passage piéton et le trottoir des immeubles (poteaux), les files, enfin les
    // piétons du passage et les poteaux du trottoir d'en face, devant tout. Voyageurs des arrêts de bus : ceux du trottoir des
    // immeubles derrière leur poteau, la marche du premier plan derrière sa file, ceux du trottoir d'en face devant leur poteau.
    // Piétons du passage : sur le trottoir des immeubles derrière les voitures (`crossing-far`), sur la chaussée et en face devant.
    expect(order).toEqual(['events-back', 'sidewalk', 'curb', 'lamps', 'install-front', 'install-street', 'crosswalk', 'riders-far', 'crossing-far', 'fixtures-near', 'far', 'riders-near-step', 'near', 'crossing-near', 'fixtures-far', 'riders-near', 'front-sidewalk']);
    expect(layer.querySelectorAll('[data-street-lamp][data-lit="true"]').length).toBeGreaterThan(0);
  });
  it('les vélos roulent avec la file du premier plan (jamais sur la voie du fond)', () => {
    // Profondeur (revue du 2026-10-13) : un vélo au bord du trottoir est devant les voitures, un vélo qui double par le
    // milieu passe derrière la voiture doublée ; l'ordre se lit donc au décalage latéral (moteur), pas à la sorte.
    const c = make(12, { y: 2026, m: 10, d: 10 });
    expect(c.querySelectorAll('[data-city-lane="far"] [data-vehicle][data-kind="bike"]').length).toBe(0);
  });
});

describe('CityLifeLayer : boucle d’animation', () => {
  it('circulation : plus de boucle ni de fondu, chaque véhicule avance puis sort par le bord (moteur de circulation)', () => {
    let now = 1_760_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    // Toutes les boucles d'animation (une par calque) : chaque image les rappelle toutes.
    let pending: ((ms: number) => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: (ms: number) => void) => {
      pending.push(cb);
      return pending.length;
    });
    const tick = (ms: number): void => {
      const run = pending;
      pending = [];
      for (const cb of run) cb(ms);
    };
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const ymd = { y: 2026, m: 10, d: 5 };
    const minutes = 8 * 60 + 15;
    const sky = skyAt(minutes, times);
    const city: CityContext = { minutes, day: dayContext(ymd, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    act(() => root.render(<svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={city} rainy={false} /></svg>));
    const cars = Array.from(host.querySelectorAll<SVGGElement>('[data-vehicle]'));
    expect(cars.length).toBeGreaterThan(2);
    for (const c of cars) {
      expect(c.getAttribute('opacity')).toBeNull();
      expect(c.style.transition).toBe('');
    }
    const at = (id: string | null): string | null => host.querySelector(`[data-life-id="${id}"]`)?.getAttribute('transform') ?? null;
    const before = new Map(cars.map((c) => [c.getAttribute('data-life-id'), at(c.getAttribute('data-life-id'))] as const));
    now += 1000;
    act(() => tick(1000));
    // Au moins un véhicule a avancé (d'autres peuvent attendre au feu ou derrière un bus).
    const moved = [...before].filter(([k, v]) => at(k) !== v).map(([k]) => k);
    expect(moved.length).toBeGreaterThan(0);
    const id = moved[0]!;
    // Deux minutes plus tard, il est sorti par le bord (nœud retiré), sans fondu.
    for (let i = 0; i < 120; i++) {
      now += 1000;
      act(() => tick(2000 + i * 1000));
    }
    expect(host.querySelector(`[data-life-id="${id}"]`)).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('CityLifeLayer : présence des passants', () => {
  it('passants : aucune transition d’opacité (ils entrent et sortent par les bords)', () => {
    const c = make(12, { y: 2026, m: 10, d: 9 });
    const peds = c.querySelectorAll<SVGGElement>('[data-ped]');
    expect(peds.length).toBeGreaterThan(0);
    for (const p of peds) {
      expect(p.style.transition).toBe('');
      expect(['0', '1']).toContain(p.getAttribute('opacity'));
    }
  });
  it('un passant dont la présence voulue tombe en pleine rue reste affiché (bascule différée au bord)', () => {
    const now = 1_760_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
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
    const draw = (hours: number) => act(() => root.render(<svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={ctx(hours)} rainy={false} /></svg>));
    draw(8.25);
    const before = [...host.querySelectorAll('[data-ped][data-active="true"]')].map((n) => n.getAttribute('data-life-id')!);
    expect(before.length).toBeGreaterThan(3);
    // 3 h 30 : presque plus personne n'est voulu, mais les passants affichés finissent leur traversée.
    draw(3.5);
    const still = before.filter((id) => host.querySelector(`[data-ped][data-life-id="${id}"]`)!.getAttribute('data-active') === 'true');
    expect(still.length).toBeGreaterThan(0);
    for (const id of still) expect(host.querySelector(`[data-ped][data-life-id="${id}"]`)!.getAttribute('opacity')).toBe('1');
  });
});

describe('CityLifeLayer : présence des passants (suite)', () => {
  it('la marge de bascule d’un groupe (accompagnants compris) reste sous la marge du monde', () => {
    for (const h of [340, 500]) {
      const m = cityMetrics(h);
      for (let seed = 1; seed <= 5; seed++) {
        const peds = pedestriansFor(3456, seed);
        expect(peds.some((p) => p.companions.length > 0)).toBe(true);
        for (const p of peds) {
          expect(pedEdgePad(p, m)).toBeGreaterThanOrEqual(12);
          expect(pedEdgePad(p, m)).toBeLessThan(WORLD_MARGIN);
        }
      }
    }
  });
  it('la présence mémorisée est remise à zéro quand la population change (largeur)', () => {
    const now = 1_760_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const sky = skyAt(495, times);
    const ymd = { y: 2026, m: 10, d: 5 };
    const city = (minutes: number): CityContext => ({ minutes, day: dayContext(ymd, []), precip: 0, snow: false, storm: false, daylight: sky.daylight });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    const draw = (width: number, minutes: number) => act(() => root.render(<svg><CityLifeLayer width={width} height={340} sky={sky} seed={1} city={city(minutes)} rainy={false} /></svg>));
    draw(720, 495);
    draw(1440, 210); // autre population + presque personne voulu : rien n'est repris de l'ancienne
    const fresh = render(<svg><CityLifeLayer width={1440} height={340} sky={sky} seed={1} city={city(210)} rainy={false} /></svg>).container;
    const flags = (h: Element) => [...h.querySelectorAll('[data-ped]')].map((n) => n.getAttribute('data-active'));
    expect(flags(host)).toEqual(flags(fresh));
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

describe('CityLifeLayer : minuterie des halls', () => {
  const night = 20.5;
  const ymd = { y: 2026, m: 10, d: 9 };
  const litDoors = (c: HTMLElement): string[] => [...c.querySelectorAll('[data-hall-light][data-lit="true"]')].map((n) => n.getAttribute('data-hall-light')!);
  // Premier habitant au seuil (la nuit) après T0, avec sa porte.
  const crossing = (only: (door: number) => boolean = () => true) => {
    const minutes = Math.round(night * 60);
    const sky = skyAt(minutes, times);
    const doors = doorsFor(720, 340, 1);
    const flow = residentFlow(cityIntensity({ minutes, day: dayContext(ymd, []), precip: 0, snow: false, storm: false, daylight: sky.daylight }), minutes, doors.length, 720);
    const trips = tripsFor(doors, 1, 720);
    const gateOf = (trip: (typeof trips)[number]): number => (trip.kind === 'out' ? flow.out : flow.in);
    for (let t = 1.8e9; t < 1.8e9 + 1200; t += 0.5) {
      for (const trip of trips) {
        const pos = tripAt(trip, 720, t);
        if (pos?.stage === 'threshold' && tripHappens(trip, t, gateOf(trip)) && only(crossingDoorX(trip, pos))) return { t, door: crossingDoorX(trip, pos), trips, gateOf };
      }
    }
    throw new Error('aucun passage');
  };

  it('la nuit, le hall s’allume après un passage et suit la minuterie de 2 minutes', () => {
    const { t, door, trips, gateOf } = crossing();
    vi.spyOn(Date, 'now').mockReturnValue((t + 30) * 1000);
    const c = make(night, ymd);
    expect(litDoors(c)).toContain(String(door));
    // Chaque hall suit exactement sa minuterie (passages des 2 dernières minutes).
    const until = seedHallTimers(trips, 720, t + 30, gateOf);
    for (const n of c.querySelectorAll('[data-hall-light]')) {
      const x = Number(n.getAttribute('data-hall-light'));
      expect(n.getAttribute('data-lit')).toBe((until.get(x) ?? -Infinity) > t + 30 ? 'true' : 'false');
    }
    expect(HALL_TIMER_S).toBe(120);
  });

  it('pas de lumière continue : la plupart des halls sont éteints, et aucun de jour', () => {
    const { t } = crossing();
    vi.spyOn(Date, 'now').mockReturnValue((t + 30) * 1000);
    const c = make(night, ymd);
    expect(litDoors(c).length).toBeLessThan(c.querySelectorAll('[data-hall-light]').length);
    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue((t + 30) * 1000);
    const day = make(13, ymd);
    expect(litDoors(day)).toHaveLength(0);
  });
  // Cage d'escalier : fenêtres d'une porte, étage 0 en bas ; allumées attendues d'après la minuterie (même calcul que la boucle).
  const stairs = stairsFor(cityFacades(720, 340, 1));
  const stairLit = (c: HTMLElement, x: number): string[] =>
    [...c.querySelectorAll(`[data-stair-light="${x}"]`)]
      .sort((a, b) => Number(a.getAttribute('data-floor')) - Number(b.getAttribute('data-floor')))
      .map((n) => n.getAttribute('opacity')!);
  const expectedStair = (until: Map<number, number>, x: number, at: number, dark: boolean): string[] => {
    const n = stairs.get(x)!.length;
    const on = dark && (until.get(x) ?? -Infinity) > at;
    const floors = on ? stairFloorsLit(x, until.get(x)!, n) : 0;
    return stairs.get(x)!.map((_, k) => (k < floors ? '1' : '0'));
  };

  it('cage éteinte de jour et sans passage ; allumée du bas jusqu’à l’étage atteint après un passage de nuit', () => {
    expect(stairs.size).toBeGreaterThan(0);
    const { t, door, trips, gateOf } = crossing((x) => stairs.has(x));
    vi.spyOn(Date, 'now').mockReturnValue((t + 30) * 1000);
    const c = make(night, ymd);
    const until = seedHallTimers(trips, 720, t + 30, gateOf);
    // La porte du passage : au moins le premier étage allumé, du bas, contigu.
    const lit = stairLit(c, door);
    expect(lit).toEqual(expectedStair(until, door, t + 30, true));
    expect(lit[0]).toBe('1');
    expect(lit.join('')).toMatch(/^1+0*$/);
    // Toutes les cages suivent leur minuterie.
    for (const x of stairs.keys()) expect(stairLit(c, x)).toEqual(expectedStair(until, x, t + 30, true));
    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue((t + 30) * 1000);
    const day = make(13, ymd);
    expect(day.querySelectorAll('[data-stair-light][opacity="1"]')).toHaveLength(0);
    expect(day.querySelectorAll('[data-stair-light]').length).toBe([...stairs.values()].reduce((s, w) => s + w.length, 0));
  });

  it('pendant le passage (seuil complet, image par image) : un seul étage tiré, une seule écriture par fenêtre', () => {
    // Passages à une porte à cage (≥ 3 fenêtres) éteinte jusque-là ; plusieurs, pour que le tirage ne tombe pas juste par hasard.
    const minutes = Math.round(night * 60);
    const sky = skyAt(minutes, times);
    const doors = doorsFor(720, 340, 1);
    const city: CityContext = { minutes, day: dayContext(ymd, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };
    const flow = residentFlow(cityIntensity(city), minutes, doors.length, 720);
    const trips = tripsFor(doors, 1, 720);
    const gateOf = (trip: (typeof trips)[number]): number => (trip.kind === 'out' ? flow.out : flow.in);
    const found: { t: number; door: number }[] = [];
    for (let t = 1.8e9; t < 1.8e9 + 40000 && found.length < 4; t += 0.5) {
      if (found.length && t - found.at(-1)!.t < 10) continue;
      for (const trip of trips) {
        const pos = tripAt(trip, 720, t);
        if (pos?.stage !== 'threshold' || !tripHappens(trip, t, gateOf(trip))) continue;
        const x = crossingDoorX(trip, pos);
        if ((stairs.get(x)?.length ?? 0) < 3 || (seedHallTimers(trips, 720, t - 1, gateOf).get(x) ?? -Infinity) > t - 1) continue;
        found.push({ t, door: x });
        break;
      }
    }
    expect(found.length).toBe(4);
    // La boucle doit tourner : pas de mouvement réduit laissé par un test précédent (matchMedia simulé).
    vi.unstubAllGlobals();
    for (const { t, door } of found) {
      let now = (t - 1) * 1000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      let pending: ((ms: number) => void)[] = [];
      vi.stubGlobal('requestAnimationFrame', (cb: (ms: number) => void) => {
        pending.push(cb);
        return pending.length;
      });
      vi.stubGlobal('cancelAnimationFrame', () => undefined);
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      mounted.push({ root, host });
      act(() => root.render(<svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={city} rainy={false} /></svg>));
      const wins = [...host.querySelectorAll<SVGElement>(`[data-stair-light="${door}"]`)];
      expect(stairLit(host, door).every((o) => o === '0')).toBe(true);
      const writes = wins.map(() => 0);
      wins.forEach((n, k) => {
        const set = n.setAttribute.bind(n);
        n.setAttribute = (name: string, value: string) => {
          if (name === 'opacity') writes[k]!++;
          set(name, value);
        };
      });
      const floors = new Set<number>();
      // Une image toutes les 1/30 s, de 1 s avant le seuil à 2 s après son début (seuil = 1 s).
      for (let i = 1; i <= 90; i++) {
        now += 1000 / 30;
        const run = pending;
        pending = [];
        act(() => run.forEach((cb) => cb(i * 40)));
        const lit = stairLit(host, door).filter((o) => o === '1').length;
        if (lit > 0) floors.add(lit);
      }
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      expect(host.querySelector(`[data-hall-light="${door}"]`)!.getAttribute('data-lit')).toBe('true');
      expect(floors.size, `porte ${door} à ${t}`).toBe(1);
      const n = [...floors][0]!;
      // Les n fenêtres du bas : une seule bascule (allumage) ; celles du dessus : aucune écriture.
      expect(writes).toEqual(wins.map((_, k) => (k < n ? 1 : 0)));
    }
  });

  it('jamais allumée en continu : éteinte quand la minuterie des halls est échue', () => {
    const { t, door, trips, gateOf } = crossing((x) => stairs.has(x));
    // Premier instant après le passage où la minuterie de cette porte est échue (pas de nouveau passage depuis 2 min).
    let at = t + HALL_TIMER_S + 1;
    while ((seedHallTimers(trips, 720, at, gateOf).get(door) ?? -Infinity) > at) at += 30;
    vi.spyOn(Date, 'now').mockReturnValue(at * 1000);
    const c = make(night, ymd);
    expect(stairLit(c, door)).toEqual(stairs.get(door)!.map(() => '0'));
    expect(c.querySelector(`[data-hall-light="${door}"]`)!.getAttribute('data-lit')).toBe('false');
  });
});

describe('passants : contournement léger (revue du 2026-10-13)', () => {
  it('dodgeY : ligne de contournement dans la zone, retour en douceur à leur ligne au-delà', async () => {
    const { dodgeY } = await import('../../src/content/city-life');
    const zones = [{ x0: 100, x1: 140, y: 50 }];
    expect(dodgeY(120, 60, zones, 1)).toBe(50);
    expect(dodgeY(100, 60, zones, 1)).toBe(50);
    expect(dodgeY(80, 60, zones, 1)).toBe(60); // à 20 > 12 unités : sa ligne
    const mid = dodgeY(94, 60, zones, 1);
    expect(mid).toBeGreaterThan(50);
    expect(mid).toBeLessThan(60);
    // Continu : pas de saut d'un pas au suivant.
    for (let x = 70; x < 170; x += 0.5) expect(Math.abs(dodgeY(x + 0.5, 60, zones, 1) - dodgeY(x, 60, zones, 1))).toBeLessThan(0.7);
  });
});

describe('CityLifeLayer : réactions aux événements de la rue (vie au-dessus de la rue, tâche 11)', () => {
  // Instant mural multiple de 60 s, sans rapport avec l'heure de la scène (heure fixée par le réglage) : 3 h du matin.
  const NOW_S = Math.floor(1.8e9 / 86400) * 86400 + 3 * 3600;
  const at = (minutes: number, ymd: { y: number; m: number; d: number }) => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_S * 1000);
    const sky = skyAt(minutes, sunTimes(ymd, { lat: 48.85, lon: 2.35 }, 120));
    const city: CityContext = { minutes, day: dayContext(ymd, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };
    return render(
      <svg>
        <CityLifeLayer width={720} height={340} sky={sky} seed={1} city={city} rainy={false} />
      </svg>,
    ).container;
  };
  const showNodes = (c: HTMLElement): Element[] => [...c.querySelectorAll('[data-event="fireworks"]')].filter((n) => n.getAttribute('data-life-id')!.startsWith('show-'));

  it('14 juillet : salves pendant le spectacle tiré, salons éteints, habitants aux fenêtres', () => {
    const D = { y: 2026, m: 7, d: 14 };
    const show = fireworksShow(1, D)!;
    const minutes = Math.floor(show.start) + 4;
    const c = at(minutes, D);
    // Salves actives à cet instant (repère : minute de scène `minutes` à l'instant mural NOW_S).
    const want = showEvents(show, minutes, NOW_S, 720).filter((e) => e.start <= NOW_S && NOW_S < e.end).map((e) => e.key);
    expect(want.length).toBeGreaterThan(0);
    const got = showNodes(c);
    expect(got.map((n) => n.getAttribute('data-life-id')).sort()).toEqual([...want].sort());
    // Mêmes sprites et même masque des toits que les salves isolées ; plus ou moins hautes, jamais plus bas qu'elles (y = 0).
    // Aucune salve dans la colonne d'une tour-horloge du fond (élargie de la portée du dessin).
    const towers = towerColumns(720, 340, 1);
    expect(towers.length).toBeGreaterThan(0);
    for (const n of got) {
      expect(n.closest('[data-event-mask="skyline"]')).not.toBeNull();
      const [, x, y] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(n.getAttribute('transform')!)!.map(Number);
      expect(y).toBeLessThanOrEqual(0);
      for (const [a, b] of towers) expect(x! <= a + 0.1 || x! >= b - 0.1, `salve à x = ${x} dans la tour [${a}, ${b}]`).toBe(true);
    }
    // Toutes les salves du spectacle (pas seulement celles de l'instant) évitent les tours, et gardent leur nombre.
    const all = showEvents(show, minutes, NOW_S, 1080, towerColumns(1080, 340, 1));
    expect(all).toHaveLength(show.bursts.length);
    for (const e of all) for (const [a, b] of towerColumns(1080, 340, 1)) expect(e.x0 <= a || e.x0 >= b).toBe(true);
    // Les fusées latérales d'une salve qui tombent sur une tour passent derrière elle : la tour est dans le masque.
    expect(c.querySelectorAll('[data-event-mask="skyline"]').length).toBeGreaterThan(0);
    expect(c.querySelectorAll('mask [data-tower-mask]').length).toBe(towerSilhouettes(720, 340, 1).length);
    // Avant le spectacle : aucune salve.
    expect(showNodes(at(Math.floor(show.start) - 3, D))).toHaveLength(0);
    // Salons éteints et habitants penchés ou au balcon (emplois du temps du jour de fête).
    const life = sharedSceneLife(cityFacades(720, 340, 1), dayContext(D, []), false, 1, false);
    let dim = 0, watchers = 0;
    for (const [id, st] of lifeStates(life, minutes)) {
      if (st.dim) {
        dim++;
        expect(st.lit.salon ?? false, id).toBe(false);
      }
      watchers += st.actors.filter((a) => a.where !== 'in' && (a.choreo === 'lean' || a.choreo === 'leanRail')).length;
    }
    expect(dim).toBeGreaterThan(0);
    expect(watchers).toBeGreaterThan(0);
  });


  it('écran étroit (téléphone en portrait) : toutes les salves, dispersées, même quand une tour est visible', () => {
    const show = fireworksShow(1, { y: 2026, m: 7, d: 14 })!;
    for (const width of [390, 430]) {
      // Graines dont une tour-horloge du fond est dans l'écran.
      const seeds = Array.from({ length: 200 }, (_, i) => i + 1).filter((s) => towerColumns(width, 340, s).some(([a, b]) => b > 40 && a < width - 40)).slice(0, 5);
      expect(seeds.length).toBeGreaterThan(0);
      for (const seed of seeds) {
        const avoid = towerColumns(width, 340, seed);
        const all = showEvents(show, 1360, NOW_S, width, avoid);
        expect(all).toHaveLength(show.bursts.length);
        const xs = all.map((e) => e.x0);
        const span = width - 80;
        // Dispersion : les x0 couvrent plus de la moitié de la plage, et pas plus d'un quart des salves collées à un bord.
        expect(Math.max(...xs) - Math.min(...xs), `largeur ${width}, graine ${seed}`).toBeGreaterThan(span * 0.5);
        expect(xs.filter((x) => x < 45 || x > width - 45).length).toBeLessThan(xs.length / 4);
        // Exclusion gardée quand il reste assez de place ; ignorée sinon (filet).
        const free = span - avoid.reduce((s, [a, b]) => s + Math.max(0, Math.min(b, width - 40) - Math.max(a, 40)), 0);
        if (free >= SHOW_FREE_MIN * span) for (const x of xs) for (const [a, b] of avoid) expect(x <= a || x >= b).toBe(true);
      }
    }
  });
  it('Nouvel An : le spectacle du 31 décembre continue après minuit', () => {
    const show = fireworksShow(1, { y: 2026, m: 12, d: 31 })!;
    // Après minuit (le 1er janvier n'a pas de spectacle à lui) : minute de scène du lendemain.
    const minutes = Math.max(1, Math.ceil(show.end - 1440) - 2);
    expect(show.end - 1440).toBeGreaterThan(minutes);
    const want = showEvents(show, minutes + 1440, NOW_S, 720).filter((e) => e.start <= NOW_S && NOW_S < e.end).map((e) => e.key);
    expect(want.length).toBeGreaterThan(0);
    expect(showNodes(at(minutes, { y: 2027, m: 1, d: 1 })).map((n) => n.getAttribute('data-life-id')).sort()).toEqual([...want].sort());
  });

  it('jour ordinaire : aucune salve de spectacle', () => {
    for (const minutes of [1335, 1350, 1380, 1439]) expect(showNodes(at(minutes, { y: 2026, m: 10, d: 10 }))).toHaveLength(0);
    expect(showNodes(at(5, { y: 2026, m: 10, d: 11 }))).toHaveLength(0);
  });

  it('déménagement : des voisins regardent entre 8 h et 10 h', () => {
    const D = { y: 2026, m: 10, d: 13 };
    const facades = cityFacades(2000, 340, 1);
    // Règle de la pièce (CityScene et city-life) : un commerce de la rue change aujourd'hui.
    const looks = (moving: boolean) => {
      const life = sharedSceneLife(facades, dayContext(D, []), false, 1, moving);
      expect(life.day.moving).toBe(moving);
      return life.dwellings.flatMap((d) => life.today.get(d.id)!.segments.filter((g) => g.k === 'act' && g.event && (g.choreo === 'lean' || g.choreo === 'leanRail')));
    };
    const seen = looks(true);
    expect(seen.length).toBeGreaterThan(2);
    for (const g of seen) {
      if (g.k !== 'act') continue;
      expect(g.t0).toBeGreaterThanOrEqual(480);
      expect(g.t1).toBeLessThanOrEqual(600);
    }
    expect(looks(false)).toHaveLength(0);
  });
});
