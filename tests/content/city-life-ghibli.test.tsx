// @vitest-environment jsdom
// tests/content/city-life-ghibli.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY, writeArt } from '../../src/content/art-setting';
import { CityLifeLayer, WARM_AHEAD_S, pedPose } from '../../src/content/city-life';
import { markPhase } from '../../src/content/festive-marks';
import { dayContext } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { pedestriansFor } from '../../src/core/library/city/people';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import { FigureContext, FigureRegistry, type Citizen3D, type SpriteAnchors } from '../../src/content/figure/figure-host';
import { cityIntensity } from '../../src/core/library/city/intensity';
import { doorsFor, residentFlow, tripAt, tripHappens, tripsFor } from '../../src/core/library/city/doors';
import { keyString } from '../../src/core/library/figure/bake';
import { citizenKey, type CitizenDesc } from '../../src/core/citizens/catalogue';
import { citizenSeed } from '../../src/core/citizens/identity';

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
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  localStorage.removeItem(ART_KEY);
  vi.unstubAllGlobals();
});
const ANCHORS: SpriteAnchors = { handR: [7.5, -21], handL: [-7.5, -21], hands: [0, -21], head: [0, -40], headTop: [0, -47.5], nape: [0, -34], seat: [0, -19] };
const times = sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120);
const make = (minutes = 12 * 60): HTMLDivElement => {
  const sky = skyAt(minutes, times);
  const city: CityContext = { minutes, day: dayContext({ y: 2026, m: 10, d: 9 }, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };
  return render(<svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={city} rainy={false} /></svg>);
};

describe('passants Ghibli', () => {
  it('classique : aucun pantin', () => {
    const c = make();
    expect(c.querySelectorAll('[data-ped] [data-figure]').length).toBe(0);
  });
  it('Ghibli : chaque passant est un pantin, sans miroir', () => {
    writeArt('ghibli');
    const c = make();
    const peds = [...c.querySelectorAll('[data-ped]')];
    expect(peds.length).toBeGreaterThan(0);
    for (const p of peds) {
      expect(p.querySelector(':scope > [data-figure]')).not.toBeNull();
      expect(p.getAttribute('transform')).not.toMatch(/scale\(-/);
    }
  });
  it('Ghibli : un nœud inactif (passant, habitant chez lui, seuil vide) n’a pas de href ; un nœud actif en a un', () => {
    writeArt('ghibli');
    const c = make();
    const nodes = [...c.querySelectorAll('[data-ped], [data-resident], svg[data-resident-door]')];
    const off = nodes.filter((n) => n.getAttribute('data-active') === 'false');
    const on = nodes.filter((n) => n.getAttribute('data-active') === 'true');
    expect(off.length).toBeGreaterThan(0);
    expect(on.length).toBeGreaterThan(0);
    for (const n of off) for (const u of n.querySelectorAll('[data-figure] > image')) expect(u.hasAttribute('href')).toBe(false);
    const lit = on.flatMap((n) => [...n.querySelectorAll('[data-figure] > image')]);
    expect(lit.length).toBeGreaterThan(0);
    for (const u of lit) expect(u.getAttribute('href')).toMatch(/^data:image\/png/);
  });
  it('bascule classique → Ghibli pendant que la scène tourne', () => {
    const c = make();
    act(() => writeArt('ghibli'));
    expect(c.querySelectorAll('[data-ped] [data-figure]').length).toBeGreaterThan(0);
  });
  it('pose : profil selon le sens, phase liée à la distance', () => {
    const m = cityMetrics(340);
    const p = pedestriansFor(720, 1)[0]!;
    const a = pedPose(p, m, 100);
    expect(a.yaw).toBe(p.dir > 0 ? 0 : 8);
    expect(a.gait).toBe('walk');
    expect(a.phase).toBeGreaterThanOrEqual(0);
    expect(a.phase).toBeLessThan(12);
  });
  it('mouvement réduit : passants et habitants debout (stand, phase 0), de profil dans le sens de marche', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
    const m = cityMetrics(340);
    const p = pedestriansFor(720, 1)[0]!;
    expect(pedPose(p, m, 100, true)).toEqual({ yaw: p.dir > 0 ? 0 : 8, gait: 'stand', phase: 0, head: 0 });
    writeArt('ghibli');
    const c = make();
    const keyed = [...c.querySelectorAll('[data-ped] [data-figure][data-key], [data-resident] [data-figure][data-key], svg[data-resident-door] [data-figure][data-key]')];
    expect(keyed.length).toBeGreaterThan(0);
    // data-key = palette # sig|yaw|gait|phase|head|arms|lean
    for (const f of keyed) expect(f.getAttribute('data-key')!.split('#').pop()!.split('|').slice(2, 4)).toEqual(['stand', '0']);
    for (const f of c.querySelectorAll('[data-ped] [data-figure][data-key]')) expect(['0', '8']).toContain(f.getAttribute('data-key')!.split('#').pop()!.split('|')[1]);
  });
});

describe('ombres portées des passants la nuit (Ghibli)', () => {
  it('nuit : une ombre en multiply à dégradé partagé (id de l’instance) sous chaque passant proche d’une lampe allumée', () => {
    writeArt('ghibli');
    const c = make(23 * 60);
    const layer = c.querySelector('[data-actor-shades]');
    expect(layer).not.toBeNull();
    const shades = [...layer!.querySelectorAll('polygon[data-shade-for]')];
    expect(shades.length).toBe(c.querySelectorAll('[data-ped]').length);
    const shown = shades.filter((s) => Number(s.getAttribute('opacity')) > 0);
    expect(shown.length).toBeGreaterThan(0);
    expect((layer as SVGElement).style.mixBlendMode).toBe('multiply');
    for (const s of shown) {
      const id = s.getAttribute('fill')!.match(/^url\(#(.+)\)$/)![1]!;
      expect(c.querySelector(`linearGradient[id="${id}"]`)).not.toBeNull();
      expect(id).not.toBe('wmt-actor-shade');
      // Seuls les passants présents ont une ombre.
      const ped = c.querySelector(`[data-ped][data-life-id="${s.getAttribute('data-shade-for')}"]`)!;
      expect(ped.getAttribute('data-active')).toBe('true');
    }
  });
  it('midi et dessin classique : aucune ombre de lampe', () => {
    writeArt('ghibli');
    expect(make(12 * 60).querySelector('[data-actor-shades]')).toBeNull();
    localStorage.removeItem(ART_KEY);
    expect(make(23 * 60).querySelector('[data-actor-shades]')).toBeNull();
  });
});

describe('signes festifs tenus : décalage du cycle', () => {
  it('phase en cycles (fraction de [0, 1[), propre à chaque passant et stable', () => {
    const peds = pedestriansFor(1000, 3);
    const phases = peds.map((p) => markPhase(p.id));
    for (const f of phases) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
    expect(new Set(phases.map((f) => f.toFixed(3))).size).toBeGreaterThan(peds.length / 2);
    expect(markPhase(peds[0]!.id)).toBe(phases[0]);
  });
});

describe('habitants 3D des passants', () => {
  // Faux rendu 3D (base pas encore prête) : le registre retient les habitants, les figures restent en attente ou en pantin.
  const fake: Citizen3D = { ready: () => false, prepare() {}, render: () => null, dispose() {} };
  it('graine = id du passant, même clé d’habitant d’un rendu à l’autre ; enfants en corps d’enfant ; waitFor3D', () => {
    writeArt('ghibli');
    const reg = new FigureRegistry('t3d', { citizens: () => fake });
    const spy = vi.spyOn(reg, 'citizen');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    const draw = (minutes: number): Map<number, CitizenDesc> => {
      spy.mockClear();
      const sky = skyAt(minutes, times);
      const city: CityContext = { minutes, day: dayContext({ y: 2026, m: 10, d: 9 }, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };
      act(() => root.render(<FigureContext.Provider value={reg}><svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={city} rainy={false} /></svg></FigureContext.Provider>));
      return new Map(spy.mock.calls.map(([d, seed]) => [seed, d] as const));
    };
    const first = draw(12 * 60);
    const second = draw(12 * 60 + 47);
    const peds = pedestriansFor(720, 1);
    for (const p of peds) {
      const a = first.get(citizenSeed(p.id));
      expect(a, p.id).toBeDefined();
      expect(citizenKey(second.get(citizenSeed(p.id))!)).toBe(citizenKey(a!));
      expect(a!.base === 'enfant').toBe(p.profile === 'child');
      p.companions.forEach((_, k) => expect(first.get(citizenSeed(`${p.id}+${k}`))!.base === 'enfant').toBe(!p.pair));
    }
    const figs = [...host.querySelectorAll('[data-ped] [data-figure]')];
    expect(figs.length).toBeGreaterThan(0);
    for (const f of figs) expect(f.hasAttribute('data-wait3d')).toBe(true);
  });
});

// Retour du téléphone (pré-prod 1729) : « aucun personnage nouveau ne sort des portes des maisons ». Les habitants n'ont pas
// d'attente waitFor3D (ils apparaissent en place, sur le seuil) : leur cycle 3D n'était demandé qu'une fois visibles, à la
// priorité des nouveaux cycles, et le seuil (≈ 1 s) puis la rue (un autre nœud, une autre orientation) passaient en pantin.
describe('habitants 3D qui sortent de leur porte', () => {
  it('trajet préparé d’avance : l’habitant apparaît sur son seuil en 3D, puis dans la rue en 3D, jamais en pantin', () => {
    writeArt('ghibli');
    const minutes = 480;
    const sky = skyAt(minutes, times);
    const city: CityContext = { minutes, day: dayContext({ y: 2026, m: 10, d: 9 }, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };
    const doors = doorsFor(720, 340, 1);
    const flow = residentFlow(cityIntensity(city), minutes, doors.length, 720);
    const T0 = 1.8e9;
    let found: { id: string; t: number } | null = null;
    for (const trip of tripsFor(doors, 1, 720)) {
      if (trip.kind !== 'out') continue;
      for (let t = T0 + 20; t < T0 + 600 && !found; t += 0.25) if (tripAt(trip, 720, t)?.stage === 'threshold' && tripHappens(trip, t, flow.out)) found = { id: trip.id, t };
      if (found) break;
    }
    expect(found).not.toBeNull();
    let now = (found!.t - WARM_AHEAD_S) * 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    let pending: ((ms: number) => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: (ms: number) => void) => (pending.push(cb), pending.length));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    // Rendu 3D de 5 ms (un par image au budget de 6 ms), habillage compris : comme un téléphone, en plus rapide.
    const clock = { t: 0 };
    let n = 0;
    const fake: Citizen3D = { ready: () => true, prepare() {}, render: (_d, k) => ((clock.t += 5), { url: `data:image/png;base64,3D${n++}|${keyString(k)}`, anchors: ANCHORS }), dispose() {} };
    const reg = new FigureRegistry('t', { citizens: () => fake, now: () => clock.t });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    act(() => root.render(<FigureContext.Provider value={reg}><svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={city} rainy={false} /></svg></FigureContext.Provider>));
    const door = host.querySelector(`svg[data-resident-door][data-trip-id="${found!.id}"]`)!;
    const street = host.querySelector(`[data-resident][data-trip-id="${found!.id}"]`)!;
    const seen = { door: [] as string[], street: [] as string[] };
    const look = (e: Element): string | null => {
      if (e.getAttribute('data-active') !== 'true') return null;
      const f = e.querySelector('[data-figure]')!;
      if (!f.firstElementChild!.getAttribute('href')) return 'vide';
      return f.getAttribute('data-key')!.includes('@3d') ? '3d' : 'pantin';
    };
    // 60 images par seconde jusqu'à 6 s après l'arrivée sur le seuil.
    for (let i = 0; i < 60 * (WARM_AHEAD_S + 6); i++) {
      now += 1000 / 60;
      clock.t += 1000 / 60;
      const run = pending;
      pending = [];
      act(() => run.forEach((cb) => cb(now)));
      const d = look(door);
      const s = look(street);
      if (d) seen.door.push(d);
      if (s) seen.street.push(s);
    }
    expect(seen.door.length).toBeGreaterThan(0);
    expect(seen.street.length).toBeGreaterThan(0);
    expect(new Set(seen.door)).toEqual(new Set(['3d']));
    expect(new Set(seen.street)).toEqual(new Set(['3d']));
  });
});
