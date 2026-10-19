// @vitest-environment jsdom
// tests/content/parade-crowd.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY, writeArt } from '../../src/content/art-setting';
import { ParadeCrowd, SHOULDER_SCALE, SHOULDER_SEAT } from '../../src/content/parade-crowd';
import { collectCycles, placeCycles, PropContext, PropRegistry, propKey, type PropSpec } from '../../src/content/prop/prop-host';
import { FLAG_CYCLE_S } from '../../src/core/library/paint/props/install';
import { anchorsOf, type FigureKey } from '../../src/core/library/figure/bake';
import { phaseIndexOf } from '../../src/core/library/figure/gait';
import { DOOR_WIDTH, STREET_SCALE, cityMetrics } from '../../src/core/library/city/metrics';
import { CROWD_ROW_DEPTH, crowdFor, spectatorAt, spectatorYaw, type Spectator, type SpectatorPos } from '../../src/core/library/city/parade';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import { FigureContext, FigureRegistry, type Citizen3D } from '../../src/content/figure/figure-host';
import { citizenSeed } from '../../src/core/citizens/identity';

// Ces tests couvrent le rendu 3D : interrupteur forcé à vrai (il est coupé dans le code depuis le 2026-10-19, style à retravailler).
vi.mock('../../src/content/figure/citizen-config', async (orig) => ({ ...(await orig<object>()), CITIZENS_3D: true }));

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const W = 720;
const M = cityMetrics(340);
const DOOR_LEFTS = [34, 144, 254, 414, 524, 654];
const SEED = 1;
// Début du jour de la scène : multiple de 60 (minute de la scène = secondes depuis D0 / 60).
const D0 = Math.floor(1_790_000_000 / 60) * 60;
const times = sunTimes({ y: 2026, m: 7, d: 14 }, { lat: 48.85, lon: 2.35 }, 120);
// Même foule que la vue (le rang du fond s'écarte devant une entrée).
const CROWD = crowdFor(SEED, W, DOOR_LEFTS.map((d) => d + DOOR_WIDTH / 2)).filter((s) => !(s.row === 2 && DOOR_LEFTS.some((d) => Math.abs(d + DOOR_WIDTH / 2 - s.x) < DOOR_WIDTH / 2 + 2)));

const mount = (t: number, ghibli: boolean, still = false, reg?: FigureRegistry): HTMLDivElement => {
  if (ghibli) writeArt('ghibli');
  vi.spyOn(Date, 'now').mockReturnValue(t * 1000);
  if (still) vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  const minutes = Math.floor((t - D0) / 60);
  const sky = skyAt(minutes, times);
  const crowd = (
    <svg>
      <ParadeCrowd width={W} seed={SEED} sky={sky} still={still} rainy={false} dayFests={['bastille']} minutes={minutes} metrics={M} doorXs={DOOR_LEFTS} ghibli={ghibli} />
    </svg>
  );
  return render(reg ? <FigureContext.Provider value={reg}>{crowd}</FigureContext.Provider> : crowd);
};
const at = (h: number): number => D0 + h * 3600;
const byId = (id: string): Spectator => CROWD.find((s) => s.id === id)!;
// Clé de pose d'un nœud de figure (data-key = palette#clé ; la palette contient elle-même des « # »).
const keyOf = (fig: Element): FigureKey => {
  const [sig, yaw, gait, phase, head, arms, lean] = fig.getAttribute('data-key')!.split('#').pop()!.split('|');
  return { sig: sig!, yaw: Number(yaw), gait: gait as FigureKey['gait'], phase: Number(phase), head: Number(head), arms: arms as FigureKey['arms'], lean: Number(lean) };
};
const adultOf = (node: Element): Element => node.querySelector('[data-spectator-body] > [data-figure]')!;
const translateOf = (tr: string): [number, number] => {
  const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(tr)!;
  return [Number(m[1]), Number(m[2])];
};
const spectators = (c: Element): Element[] => [...c.querySelectorAll('[data-parade-crowd] [data-spectator]')];

// G5 (tâche 8) : drapeaux et téléphones des spectateurs en images cellulo `crowd-prop` ; registre à cuisson manuelle dont
// l'« image » est la clé (jsdom n'a pas de canvas).
class KeyedRegistry extends PropRegistry {
  override want(k: string, _paint: () => string, done: () => void): () => void {
    return super.want(k, () => `url:${k}`, done);
  }
}
const gMount = (t: number, still = false): { host: HTMLDivElement; jobs: (() => void)[]; reg: PropRegistry; day: number } => {
  writeArt('ghibli');
  vi.spyOn(Date, 'now').mockReturnValue(t * 1000);
  if (still) vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  const minutes = Math.floor((t - D0) / 60);
  const sky = skyAt(minutes, times);
  const jobs: (() => void)[] = [];
  const reg = new KeyedRegistry('t', { schedule: (cb) => jobs.push(cb) });
  const host = render(
    <PropContext.Provider value={reg}>
      <svg>
        <ParadeCrowd width={W} seed={SEED} sky={sky} still={still} rainy={false} dayFests={['bastille']} minutes={minutes} metrics={M} doorXs={DOOR_LEFTS} ghibli />
      </svg>
    </PropContext.Provider>,
  );
  return { host, jobs, reg, day: sky.daylight };
};
const bake = async (jobs: (() => void)[]): Promise<void> => {
  while (jobs.length) await act(async () => jobs.shift()!());
};
const count = (c: Element, sel: string): number => c.querySelectorAll(sel).length;
// Une seule entrée de seuil : trouve un instant où un spectateur passe le seuil d'une porte (profondeur ≈ 0,5).
function sillMoment(arriving: boolean): { t: number; s: Spectator; p: SpectatorPos } {
  for (let t = at(arriving ? 8.5 : 12.25); t < at(arriving ? 10 : 13.3); t += 0.25) {
    for (const s of CROWD) {
      const p = spectatorAt(s, t, D0);
      if (p.sill !== undefined && p.sill > 0.4 && p.sill < 0.6) return { t, s, p };
    }
  }
  throw new Error('aucun seuil');
}

describe('foule du 14 juillet en Ghibli', () => {
  it('spectateurs debout : pantins sans miroir, de trois quarts vers la chaussée, bras levé avec leur objet à la main', () => {
    const c = mount(at(11), true);
    const nodes = spectators(c);
    expect(nodes.length).toBeGreaterThanOrEqual(50);
    const seen = new Set<string>();
    for (const n of nodes) {
      const s = byId(n.getAttribute('data-spectator-id')!);
      expect(n.getAttribute('transform')).not.toMatch(/scale\(-/);
      const fig = adultOf(n);
      const key = keyOf(fig);
      expect(key.gait).toBe('stand');
      expect(key.yaw).toBe(spectatorYaw(s));
      expect([2, 6]).toContain(key.yaw);
      if (s.prop === 'none') {
        expect(['down', 'swing']).toContain(key.arms);
        expect(fig.querySelector('[data-held]')).toBeNull();
      } else {
        expect(key.arms).toBe('raise');
        const held = fig.querySelector(':scope > [data-held="handR"]')!;
        expect(held.querySelector(`[data-prop="${s.prop}"]`)).not.toBeNull();
        const [hx, hy] = anchorsOf(key).handR;
        expect(translateOf(held.getAttribute('transform')!)).toEqual([hx, hy]);
        // Le drapeau (et la main ouverte) s'agite autour de la main ; le téléphone reste immobile.
        expect(held.querySelectorAll('animateTransform').length).toBe(s.prop === 'phone' ? 0 : 1);
        seen.add(s.prop);
      }
      // Aucun dessin de bras levé du graphisme classique.
      expect(n.querySelector('[data-arm]')).toBeNull();
    }
    expect([...seen].sort()).toEqual(['flag', 'phone', 'wave']);
  });
  it('enfant sur les épaules : pantin enfant assis, à la nuque de l adulte, dessiné avant lui', () => {
    const c = mount(at(11), true);
    const carriers = spectators(c).filter((n) => n.getAttribute('data-kind') === 'shoulders');
    expect(carriers.length).toBeGreaterThan(0);
    for (const n of carriers) {
      const kid = n.querySelector('[data-spectator-body] > [data-shoulders]')!;
      const kidFig = kid.querySelector(':scope > [data-figure]')!;
      const adult = adultOf(n);
      expect(kid.compareDocumentPosition(adult) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const kk = keyOf(kidFig);
      const ak = keyOf(adult);
      expect(kk.gait).toBe('seated');
      expect(kk.yaw).toBe(ak.yaw);
      const [nx, ny] = anchorsOf(ak).nape;
      const [x, y] = translateOf(kid.getAttribute('transform')!);
      expect(x).toBeCloseTo(nx, 2);
      expect(y).toBeCloseTo(ny + SHOULDER_SEAT * SHOULDER_SCALE, 2);
      expect(kid.getAttribute('transform')).toContain(`scale(${SHOULDER_SCALE})`);
    }
  });
  it('scène chargée pendant l arrivée : chacun à sa place (debout à son rang, marcheur sur son chemin), pas de fondu', () => {
    for (const ghibli of [false, true]) {
      const t = at(9.3);
      const c = mount(t, ghibli);
      const nodes = spectators(c);
      const present = CROWD.filter((s) => spectatorAt(s, t, D0).mode !== 'absent');
      expect(nodes.length).toBe(present.length);
      for (const n of nodes) {
        const s = byId(n.getAttribute('data-spectator-id')!);
        const p = spectatorAt(s, t, D0);
        expect(n.getAttribute('data-mode')).toBe(p.mode);
        expect(n.getAttribute('opacity')).toBeNull();
        if (p.sill !== undefined) {
          expect(n.tagName).toBe('svg');
          continue;
        }
        const [x, y] = translateOf(n.getAttribute('transform')!);
        expect(x).toBeCloseTo(p.x, 0);
        const depth = p.mode === 'standing' ? CROWD_ROW_DEPTH[s.row] + s.jitter * 1.2 : p.depth;
        expect(y).toBeCloseTo(M.curb - depth * M.unit, 0);
        if (ghibli) expect(keyOf(adultOf(n)).yaw).toBe(p.yaw);
      }
      for (const root of mounted.splice(0)) {
        act(() => root.root.unmount());
        root.host.remove();
      }
      localStorage.removeItem(ART_KEY);
      vi.restoreAllMocks();
    }
  });
  it('marcheurs : pas réglé sur la distance, drapeau porté haut sans l agiter, autres bras au balancement', () => {
    const t = at(9.3);
    const c = mount(t, true);
    const walkers = spectators(c).filter((n) => n.getAttribute('data-mode') === 'walking' && n.tagName !== 'svg');
    expect(walkers.length).toBeGreaterThan(0);
    for (const n of walkers) {
      const s = byId(n.getAttribute('data-spectator-id')!);
      const p = spectatorAt(s, t, D0);
      const key = keyOf(adultOf(n));
      expect(key.gait).toBe(p.gait);
      const k = M.unit * STREET_SCALE.person * (s.kind === 'child' ? 0.7 : 1);
      if (p.gait === 'walk') expect(key.phase).toBe(phaseIndexOf(p.walked / k));
      expect(key.arms).toBe(s.prop === 'flag' ? 'raise' : 'swing');
      expect(n.querySelectorAll('animateTransform').length).toBe(0);
      if (s.prop === 'flag') expect(n.querySelector('[data-held="handR"] [data-prop="flag"]')).not.toBeNull();
    }
  });
  it('mouvement réduit : pantins immobiles, aucune animation', () => {
    const c = mount(at(11), true, true);
    expect(spectators(c).length).toBeGreaterThanOrEqual(50);
    expect(c.querySelectorAll('[data-parade-crowd] animate, [data-parade-crowd] animateTransform').length).toBe(0);
    for (const n of spectators(c)) expect(keyOf(adultOf(n)).gait).toBe('stand');
  });
  it('G5 : drapeaux en image `crowd-prop` cyclique (période de la vague, phase du spectateur), téléphones en image fixe, repli SVG avant cuisson ; la boucle pose le tissu de l’instant', async () => {
    const { host, jobs, reg, day } = gMount(at(11));
    const flags = [...host.querySelectorAll('[data-prop="flag"] > [data-prop-cycle]')];
    const phones = [...host.querySelectorAll('[data-prop="phone"]')];
    expect(flags.length).toBeGreaterThan(0);
    expect(phones.length).toBeGreaterThan(0);
    expect(count(host, '[data-prop="phone"] [data-prop-cycle]')).toBe(0);
    for (const f of flags) {
      expect(Number(f.getAttribute('data-prop-cycle'))).toBeCloseTo(FLAG_CYCLE_S, 9);
      expect(JSON.parse(f.getAttribute('data-cycle-spec')!)).toEqual({ id: 'crowd-prop', args: { kind: 'flag' }, day });
    }
    expect(new Set(flags.map((f) => f.getAttribute('data-cycle-phase'))).size).toBeGreaterThan(1);
    // Repli : le drapeau SVG (hampe + trois bandes) tant que l'image n'est pas cuite ; le balancement autour de la main reste.
    expect(count(host, '[data-prop="flag"] rect')).toBe(flags.length * 3);
    expect(count(host, '[data-prop="flag"] image')).toBe(0);
    expect(count(host, '[data-prop="flag"] > animateTransform')).toBe(flags.length);
    await bake(jobs);
    expect(count(host, '[data-prop="flag"] image')).toBe(flags.length);
    expect(count(host, '[data-prop="flag"] rect')).toBe(0);
    expect(count(host, '[data-prop="phone"] image')).toBe(phones.length);
    expect(count(host, '[data-prop="phone"] rect')).toBe(0);
    // Deux images au plus pour tous les téléphones et drapeaux à la pose 0.
    expect(reg.size()).toBeLessThanOrEqual(2);
    // Boucle : à t = 3/8 de période, chaque drapeau montre la pose (3 + 8·phase) mod 8 ; au plus 8 images de tissu pour toute la foule.
    const cycles = collectCycles(host);
    expect(cycles).toHaveLength(flags.length);
    const t = (3 / 8) * FLAG_CYCLE_S;
    placeCycles(cycles, t, reg);
    await bake(jobs);
    placeCycles(cycles, t, reg);
    for (const f of flags) {
      const u = t / FLAG_CYCLE_S + Number(f.getAttribute('data-cycle-phase'));
      const frame = Math.floor((u - Math.floor(u)) * 8);
      expect(f.querySelector(':scope > image')!.getAttribute('href')).toBe(`url:${propKey({ id: 'crowd-prop', args: { kind: 'flag' }, day, frame })}`);
    }
    expect(reg.size()).toBeLessThanOrEqual(2 + 8);
  });
  it('G5 : mouvement réduit : drapeaux plats (args still), aucun nœud cyclique', async () => {
    const { host, jobs, reg, day } = gMount(at(11), true);
    expect(count(host, '[data-prop-cycle]')).toBe(0);
    expect(count(host, '[data-prop="flag"]')).toBeGreaterThan(0);
    await bake(jobs);
    expect(count(host, '[data-prop="flag"] image')).toBeGreaterThan(0);
    const spec: PropSpec = { id: 'crowd-prop', args: { kind: 'flag', still: true }, day };
    expect(reg.get(propKey(spec))).not.toBeNull();
  });
});

describe('foule du 14 juillet : portes d immeuble (les deux graphismes)', () => {
  for (const ghibli of [false, true]) {
    const style = ghibli ? 'Ghibli' : 'classique';
    it(`${style} : sortie d immeuble par le seuil de la porte (ombre de l entrée, rogné, sans id), jamais de fondu de groupe`, () => {
      const { t, s, p } = sillMoment(true);
      const c = mount(t, ghibli);
      const node = c.querySelector(`[data-spectator-id="${s.id}"]`)!;
      expect(node.tagName).toBe('svg');
      expect(node.getAttribute('data-door')).toBe('true');
      expect(node.getAttribute('opacity')).toBeNull();
      expect(node.querySelector(':scope > rect[data-door-dark]')).not.toBeNull();
      const fig = node.querySelector(':scope > [data-door-fig]')!;
      expect(Number(fig.getAttribute('opacity'))).toBeCloseTo(1 - p.sill!, 1);
      expect(c.querySelectorAll('[data-parade-crowd] [id], [data-parade-crowd] clipPath, [data-parade-crowd] mask').length).toBe(0);
      if (ghibli) expect(keyOf(adultOf(node)).yaw).toBe(4);
      // Personne d'autre n'a d'opacité intermédiaire.
      for (const n of spectators(c)) expect(n.getAttribute('opacity')).toBeNull();
    });
    it(`${style} : rentrée par le seuil de dos`, () => {
      const { t, s } = sillMoment(false);
      const c = mount(t, ghibli);
      const node = c.querySelector(`[data-spectator-id="${s.id}"]`)!;
      expect(node.tagName).toBe('svg');
      if (ghibli) expect(keyOf(adultOf(node)).yaw).toBe(12);
    });
  }
  it('classique : les spectateurs debout gardent leur dessin (bras levé, profil retourné)', () => {
    const c = mount(at(11), false);
    expect(c.querySelectorAll('[data-parade-crowd] [data-figure]').length).toBe(0);
    expect(c.querySelectorAll('[data-parade-crowd] [data-arm]').length).toBeGreaterThan(0);
    expect(spectators(c).some((n) => /scale\(-/.test(n.getAttribute('transform') ?? ''))).toBe(true);
  });
});

describe('habitants 3D de la foule', () => {
  it('enfants (au premier rang ou sur les épaules) : corps d’enfant ; adultes : jamais ; graine = id du spectateur', () => {
    const fake: Citizen3D = { ready: () => false, prepare() {}, render: () => null, dispose() {} };
    const reg = new FigureRegistry('t3d', { citizens: () => fake });
    const spy = vi.spyOn(reg, 'citizen');
    mount(at(11), true, false, reg);
    const bySeed = new Map(spy.mock.calls.map(([d, seed]) => [seed, d] as const));
    const shown = CROWD.filter((s) => bySeed.has(citizenSeed(s.id)));
    expect(shown.some((s) => s.kind === 'child')).toBe(true);
    expect(shown.some((s) => s.kind === 'shoulders')).toBe(true);
    for (const s of shown) {
      expect(bySeed.get(citizenSeed(s.id))!.base === 'enfant', s.id).toBe(s.kind === 'child');
      if (s.kind === 'shoulders') expect(bySeed.get(citizenSeed(`${s.id}:epaules`))!.base).toBe('enfant');
    }
  });
});
