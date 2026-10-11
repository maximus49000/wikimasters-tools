// @vitest-environment jsdom
// tests/content/music-street.test.tsx — rue de la Fête de la musique au pantin (G3b) : danseurs, buveurs, serveurs, clients,
// seuils des portes, dans les deux graphismes.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY } from '../../src/content/art-setting';
import { MusicStreet, fanArms } from '../../src/content/music-street';
import { beerSchedule, beerServers, customerAt, serverAt, type BeerCustomer, type BeerServer } from '../../src/core/library/city/beer';
import type { YMD } from '../../src/core/library/city/calendar';
import { doorsFor } from '../../src/core/library/city/doors';
import { absMinute, beerStandsFor, stageXs } from '../../src/core/library/city/install';
import { DOOR_WIDTH, cityMetrics } from '../../src/core/library/city/metrics';
import { musicCrowdAt, musicCrowdFor, type MusicSpectator } from '../../src/core/library/city/music-crowd';
import { dayNumber } from '../../src/core/library/city/shops/hours';
import { anchorsOf, type FigureKey } from '../../src/core/library/figure/bake';
import { shapeOf, signatureOf } from '../../src/core/library/figure/dress';
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
const unmountAll = (): void => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
};
afterEach(() => {
  unmountAll();
  localStorage.removeItem(ART_KEY);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const W = 1080;
const H = 340;
const SEED = 1;
const M = cityMetrics(H);
const U = M.unit;
const MUSIC: YMD = { y: 2026, m: 6, d: 21 };
const DAY = dayNumber(MUSIC);
const times = sunTimes(MUSIC, { lat: 48.85, lon: 2.35 }, 120);
// Début du jour de la scène : multiple de 60 (minute de la scène = secondes depuis D0 / 60).
const D0 = Math.floor(1_790_000_000 / 60) * 60;
const STANDS = beerStandsFor(W, H, SEED);
const DOORS = doorsFor(W, H, SEED).map((d) => d.x + DOOR_WIDTH / 2);
const CROWD = musicCrowdFor({ seed: SEED, width: W, day: DAY, stages: stageXs(W, SEED), stands: STANDS, doors: DOORS, unit: U });
const SCHEDS = STANDS.map((stand) => beerSchedule({ seed: SEED, stand, day: DAY, width: W, unit: U, doors: DOORS }));
const CUSTOMERS = new Map(SCHEDS.flatMap((s) => s.customers.map((c) => [c.id, [s, c] as const] as const)));
const SERVERS = STANDS.flatMap((stand) => beerServers({ seed: SEED, stand, day: DAY, width: W, unit: U, doors: DOORS }));
const fanOf = (id: string): MusicSpectator => CROWD.find((s) => s.id === id)!;
const serverOf = (id: string): BeerServer => SERVERS.find((v) => v.id === id)!;
// Instant de l'horloge murale (s) → minute absolue du moteur.
const absOf = (t: number): number => absMinute(DAY, 0) + (t - D0) / 60;
const at = (h: number): number => D0 + h * 3600;

const mount = (t: number, ghibli: boolean, still = false): HTMLDivElement => {
  vi.spyOn(Date, 'now').mockReturnValue(t * 1000);
  if (still) vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  const minutes = Math.floor((t - D0) / 60);
  return render(
    <svg>
      <MusicStreet width={W} height={H} seed={SEED} sky={skyAt(minutes, times)} still={still} rainy={false} date={MUSIC} minutes={minutes} metrics={M} extra={[]} ghibli={ghibli} />
    </svg>,
  );
};
// Clé de pose d'un nœud de figure (data-key = palette#clé ; la palette contient elle-même des « # »).
const keyOf = (fig: Element): FigureKey => {
  const [sig, yaw, gait, phase, head, arms, lean] = fig.getAttribute('data-key')!.split('#').pop()!.split('|');
  return { sig: sig!, yaw: Number(yaw), gait: gait as FigureKey['gait'], phase: Number(phase), head: Number(head), arms: arms as FigureKey['arms'], lean: Number(lean) };
};
const figOf = (n: Element): Element => n.querySelector('[data-figure]')!;
const translateOf = (tr: string): [number, number] => {
  const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(tr)!;
  return [Number(m[1]), Number(m[2])];
};
const humans = (c: Element): Element[] => [...c.querySelectorAll('[data-music-spectator], [data-beer-server], [data-queue-person]')];

describe('Fête de la musique en Ghibli : la foule', () => {
  it('21 h : danseurs et buveurs au pantin, sans miroir, tournés selon le moteur ; rebond SMIL sur le groupe porteur', () => {
    const t = at(21);
    const c = mount(t, true);
    const fans = [...c.querySelectorAll('[data-music-spectator][data-mode="standing"]')];
    expect(fans.length).toBeGreaterThanOrEqual(100);
    const arms = new Set<string>();
    for (const n of fans) {
      const s = fanOf(n.getAttribute('data-fan-id')!);
      const p = musicCrowdAt(s, absOf(t));
      expect(n.getAttribute('transform')).not.toMatch(/scale\(-/);
      const fig = figOf(n);
      const key = keyOf(fig);
      expect([key.yaw, key.gait]).toEqual([s.yaw, 'stand']);
      // Premier rendu : gobelet à la poitrine ; les gorgées des buveurs (`data-drinker`) sont posées par la boucle.
      expect(key.arms).toBe(fanArms(s, p.dance, t, true));
      expect(n.hasAttribute('data-drinker')).toBe(s.beer && !p.dance);
      arms.add(key.arms);
      if (s.beer) {
        const held = fig.querySelector(':scope > [data-held="handR"]')!;
        expect(held.querySelector('[data-beer-cup]')).not.toBeNull();
        expect(translateOf(held.getAttribute('transform')!)).toEqual([...anchorsOf(key).handR]);
      } else expect(fig.querySelector('[data-held]')).toBeNull();
      // Rebond : sur le groupe porteur du pantin, jamais sur la figure elle-même.
      const bounce = n.querySelectorAll(':scope > g > animateTransform');
      expect(bounce.length).toBe(p.dance ? 1 : 0);
      expect(fig.querySelectorAll('animate, animateTransform').length).toBe(0);
      expect(n.querySelector('[data-arm], [data-hand-cup]')).toBeNull();
    }
    expect([...arms].filter((x) => ['cheer', 'raise', 'swing', 'cup'].includes(x)).length).toBe(4);
  });
  it('bras : gobelet (gorgée cup ↔ up s’il ne danse pas), danseurs cheer un sur trois, raise, sinon swing', () => {
    const beer = { beer: true, phase: 0.1 };
    const seen = new Set<string>();
    for (let t = 0; t < 5; t += 0.1) seen.add(fanArms(beer, false, t, false));
    expect([...seen].sort()).toEqual(['cup', 'up']);
    for (let t = 0; t < 5; t += 0.1) expect(fanArms(beer, true, t, false)).toBe('cup');
    for (let t = 0; t < 5; t += 0.1) expect(fanArms(beer, false, t, true)).toBe('cup');
    expect(fanArms({ beer: false, phase: 0.2 }, true, 0, false)).toBe('cheer');
    expect(fanArms({ beer: false, phase: 0.5 }, true, 0, false)).toBe('raise');
    expect(fanArms({ beer: false, phase: 0.8 }, true, 0, false)).toBe('swing');
    expect(fanArms({ beer: false, phase: 0.2 }, false, 0, false)).toBe('swing');
  });
  it('arrivée (18 h) dans les deux graphismes : chacun à la place du moteur, aucune opacité de groupe ; marcheurs au pas', () => {
    let seen = 0;
    for (const [ghibli, t] of [false, true].flatMap((g) => [18, 18.5, 19, 19.5].map((h) => [g, at(h) + 17] as const))) {
      const c = mount(t, ghibli);
      const walkers = [...c.querySelectorAll('[data-music-spectator][data-mode="walking"]')];
      seen += walkers.length;
      for (const n of humans(c)) expect(n.getAttribute('opacity'), n.outerHTML.slice(0, 80)).toBeNull();
      for (const n of walkers) {
        const s = fanOf(n.getAttribute('data-fan-id')!);
        const p = musicCrowdAt(s, absOf(t));
        expect(n.tagName === 'svg').toBe(p.sill !== undefined);
        if (p.sill !== undefined) continue;
        const [x, y] = translateOf(n.getAttribute('transform')!);
        expect(x).toBeCloseTo(p.x, 0);
        expect(y).toBeCloseTo(M.curb + p.depth * U, 0);
        if (!ghibli) continue;
        const key = keyOf(figOf(n));
        expect([key.yaw, key.gait, key.arms]).toEqual([p.yaw, p.gait, s.beer ? 'cup' : 'swing']);
        expect(n.getAttribute('transform')).not.toMatch(/scale\(-/);
      }
      unmountAll();
    }
    expect(seen).toBeGreaterThanOrEqual(4);
  }, 60000);
  it('mouvement réduit : pantins immobiles, gobelet fixe, aucune animation ni marcheur', () => {
    const c = mount(at(21), true, true);
    expect(c.querySelectorAll('animate, animateTransform').length).toBe(0);
    expect(c.querySelectorAll('[data-mode="walking"], [data-mode="walking-in"], [data-mode="leaving"]').length).toBe(0);
    const fans = [...c.querySelectorAll('[data-music-spectator]')];
    expect(fans.length).toBeGreaterThanOrEqual(100);
    for (const n of fans) if (fanOf(n.getAttribute('data-fan-id')!).beer) expect(keyOf(figOf(n)).arms).toBe('cup');
  });
  it('classique inchangé : dessin à plat, bras levés et gobelets, profils retournés', () => {
    const c = mount(at(21), false);
    expect(c.querySelectorAll('[data-figure]').length).toBe(0);
    expect(c.querySelectorAll('[data-music-spectator] [data-arm]').length).toBeGreaterThan(0);
    expect(c.querySelectorAll('[data-music-spectator] [data-hand-cup]').length).toBeGreaterThan(0);
    expect(c.querySelectorAll('[data-beer-server] [data-server-arm]').length).toBeGreaterThan(0);
    expect([...c.querySelectorAll('[data-music-spectator]')].some((n) => /scale\(-/.test(n.getAttribute('transform') ?? ''))).toBe(true);
  });
});

describe('Fête de la musique en Ghibli : stands de bière', () => {
  it('20 h : serveurs en tablier, de face ; à la tireuse (work) ou tendant le gobelet (hold, gobelet visible)', () => {
    let work = 0;
    let hold = 0;
    for (let k = 0; k < 4; k++) {
      const t = at(20) + 7 + k * 4;
      const c = mount(t, true);
      for (const n of c.querySelectorAll('[data-beer-server][data-serving]')) {
        const v = serverOf(n.getAttribute('data-beer-server')!);
        const fig = figOf(n);
        expect(fig.getAttribute('data-sig')).toBe(signatureOf(shapeOf(v.outfit, false, 'apron')));
        const key = keyOf(fig);
        expect([key.yaw, key.gait]).toEqual([serverAt(v, absOf(t)).yaw, 'stand']);
        expect(['work', 'hold', 'down']).toContain(key.arms);
        if (key.arms === 'work') work++;
        if (key.arms === 'hold') hold++;
        const cup = fig.querySelector('[data-held="handR"] [data-server-cup]')!;
        expect(cup.getAttribute('visibility')).toBe(key.arms === 'hold' ? null : 'hidden');
        expect(n.querySelector('[data-server-arm]')).toBeNull();
      }
      unmountAll();
    }
    expect(work).toBeGreaterThan(0);
    expect(hold).toBeGreaterThan(0);
  }, 60000);
  it('20 h : file tournée vers le comptoir, client au comptoir de dos ; ceux qui repartent ont le gobelet à la main', () => {
    let leaving = 0;
    for (let k = 0; k < 4; k++) {
      const t = at(20) + 9 + k * 5;
      const c = mount(t, true);
      for (const n of c.querySelectorAll('[data-queue-person]')) {
        if (n.tagName === 'svg') continue;
        const [sc, cu] = CUSTOMERS.get(n.getAttribute('data-queue-person')!)! as readonly [(typeof SCHEDS)[number], BeerCustomer];
        const p = customerAt(sc, cu, absOf(t));
        const key = keyOf(figOf(n));
        expect([key.yaw, key.gait], p.mode).toEqual([p.yaw, p.gait]);
        expect(n.getAttribute('transform')).not.toMatch(/scale\(-/);
        if (p.mode === 'leaving') {
          leaving++;
          expect(key.arms).toBe('cup');
          expect(figOf(n).querySelector('[data-held="handR"] [data-beer-cup]')).not.toBeNull();
        }
        if (p.mode === 'waiting') expect(key.yaw === 0 || key.yaw === 8).toBe(true);
      }
      unmountAll();
    }
    expect(leaving).toBeGreaterThan(0);
  }, 60000);
});

describe('Fête de la musique : portes d’immeuble (les deux graphismes)', () => {
  // Un instant où une personne (spectateur, client ou serveur) passe le seuil d'une porte, à mi-seuil.
  function sillMoment(out: boolean): { t: number; id: string; sill: number } {
    for (let t = at(out ? 23.55 : 17.1); t < at(out ? 23.99 : 19.9); t += 0.5) {
      for (const s of CROWD) {
        const p = musicCrowdAt(s, absOf(t));
        if (p.sill !== undefined && p.sill > 0.4 && p.sill < 0.6 && (out ? s.toDoor : s.fromDoor) && (out ? absOf(t) > s.leave : absOf(t) < s.arrive)) return { t, id: s.id, sill: p.sill };
      }
    }
    throw new Error('aucun seuil');
  }
  for (const ghibli of [false, true]) {
    const style = ghibli ? 'Ghibli' : 'classique';
    it(`${style} : sortie d’immeuble par le seuil (ombre de l’entrée, rogné, sans id), rentrée de dos, jamais de fondu`, () => {
      for (const out of [false, true]) {
        const { t, id, sill } = sillMoment(out);
        const minutes = Math.floor((t - D0) / 60);
        // Après minuit, la scène est au lendemain : on reste avant 24 h pour garder la même date.
        expect(minutes).toBeLessThan(1440);
        const c = mount(t, ghibli);
        const node = c.querySelector(`[data-fan-id="${id}"]`)!;
        expect(node.tagName).toBe('svg');
        expect(node.getAttribute('data-door')).toBe('true');
        expect(node.getAttribute('opacity')).toBeNull();
        expect(node.querySelector(':scope > rect[data-door-dark]')).not.toBeNull();
        expect(Number(node.querySelector(':scope > [data-door-fig]')!.getAttribute('opacity'))).toBeCloseTo(1 - sill, 1);
        expect(c.querySelectorAll('[data-music-street] [id], [data-music-street] clipPath, [data-music-street] mask').length).toBe(0);
        if (ghibli) expect(keyOf(figOf(node)).yaw).toBe(out ? 12 : 4);
        for (const n of humans(c)) expect(n.getAttribute('opacity')).toBeNull();
        unmountAll();
      }
    }, 30000);
  }
});
