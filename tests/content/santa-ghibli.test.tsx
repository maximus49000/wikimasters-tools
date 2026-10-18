// @vitest-environment jsdom
// tests/content/santa-ghibli.test.tsx — père Noël au pantin (Ghibli), descente du traîneau et de la cheminée sans apparition
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FigureContext, FigureRegistry } from '../../src/content/figure/figure-host';
import { SANTA_K, SANTA_OUTFIT, SantaLayer } from '../../src/content/santa-layer';
import { cityFacades } from '../../src/core/library/city/facades';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { SANTA_SEAT, SANTA_SUNK, SANTA_WINDOW_S, landDx, roofSurface, santaHillRoof, santaHillSackGround, santaHillScale, santaHillStepAt, santaHillWindow, santaPassFor, santaRoof, santaStepAt, visibleHillHouses } from '../../src/core/library/city/santa';
import { cityPaintPlan } from '../../src/core/library/paint/city-plan';
import { REINDEER_CYCLE_S, REINDEER_IDLE_S, TRAIL_CYCLE_S } from '../../src/core/library/paint/props/santa';
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
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const W = 720;
const H = 340;
const SEED = 1;
const facades = cityFacades(W, H, SEED);
const ground = cityMetrics(H).ground;
const night = skyAt(0, sunTimes({ y: 2026, m: 12, d: 24 }, { lat: 48.85, lon: 2.35 }, 60));
const T0 = 1_790_000_000 / 900;
const found = ((): { pass: ReturnType<typeof santaPassFor>; roof: NonNullable<ReturnType<typeof santaRoof>> } => {
  for (let n = Math.floor(T0); ; n++) {
    const pass = santaPassFor(n, SEED);
    const roof = pass.deliver ? santaRoof(pass, facades, ground, W) : null;
    if (roof) return { pass, roof };
  }
})();
const { pass, roof } = found;
const at = (p: number): number => pass.start + p * SANTA_WINDOW_S;
const mount = (T: number, ghibli: boolean): HTMLDivElement => {
  vi.spyOn(Date, 'now').mockReturnValue(T * 1000);
  return render(
    <FigureContext.Provider value={new FigureRegistry('t9s', { perFrame: 200 })}>
      <svg>
        <SantaLayer width={W} height={H} seed={SEED} sky={night} facades={facades} ground={ground} fests={['christmas-eve']} daylight={0} still={false} frozenT={T} ghibli={ghibli} />
      </svg>
    </FigureContext.Provider>,
  );
};
const keyParts = (f: Element): string[] => f.getAttribute('data-key')!.split('#').pop()!.split('|');
const translateOf = (n: Element): [number, number] => {
  const m = /translate\((-?[\d.]+) (-?[\d.]+)\)/.exec(n.getAttribute('transform') ?? '')!;
  return [Number(m[1]), Number(m[2])];
};

describe('script du père Noël (pur)', () => {
  it('à bord : assis à sa place ; caché pendant la livraison ; rien hors fenêtre', () => {
    expect(santaStepAt(pass, roof, at(0.27))).toMatchObject({ x: SANTA_SEAT.x, y: SANTA_SEAT.y, gait: 'stand' });
    expect(santaStepAt(pass, roof, at(0.1))).toMatchObject({ x: SANTA_SEAT.x, y: SANTA_SEAT.y });
    expect(santaStepAt(pass, roof, at(0.5))).toBeNull();
    expect(santaStepAt(pass, roof, pass.end + 1)).toBeNull();
  });
  it('continu de l’atterrissage au départ : pas de saut, demi-tours pas à pas, caché seulement une fois enfoncé', () => {
    let prev = santaStepAt(pass, roof, at(0.25))!;
    let climbs = 0;
    let sunk = false;
    for (let t = at(0.25) + 0.05; t < at(0.75); t += 0.05) {
      const s = santaStepAt(pass, roof, t);
      if (s === null) {
        // Disparition : seulement après être descendu entièrement dans la cheminée.
        expect(prev.y).toBeGreaterThanOrEqual(SANTA_SUNK);
        sunk = true;
        continue;
      }
      if (sunk) expect(s.y).toBeGreaterThanOrEqual(SANTA_SUNK - 3);
      sunk = false;
      expect(Math.hypot(s.x - prev.x, s.y - prev.y)).toBeLessThan(2.5);
      const d = (((s.yaw - prev.yaw) % 16) + 16) % 16;
      expect(Math.min(d, 16 - d)).toBeLessThanOrEqual(2);
      if (s.gait === 'climb') climbs++;
      prev = s;
    }
    expect(climbs).toBeGreaterThan(10);
    expect(prev).toMatchObject({ x: SANTA_SEAT.x, y: SANTA_SEAT.y });
  });
});

describe('toit étroit', () => {
  it('toit de 28 px : il ne pose jamais le pied hors du toit (pied du traîneau et cheminée ramenés dessus)', () => {
    const narrow = { ...roof, w: 28 };
    let seen = 0;
    for (let t = at(0.25); t < at(0.75); t += 0.05) {
      const s = santaStepAt(pass, narrow, t);
      // Sur le toit ou dans la cheminée (pas à sa place dans le traîneau, ni en l'air pendant l'enjambée).
      if (!s || s.y < 0) continue;
      seen++;
      // Repère du dessin posé : recentré de −14 sur le toit.
      expect(Math.abs(s.x - 14)).toBeLessThanOrEqual(14);
    }
    expect(seen).toBeGreaterThan(20);
  });
});

describe('toits ordinaires', () => {
  it.each([40, 54])('toit de %i px : quelques pas visibles hors de la caisse du traîneau', (w) => {
    const r = { ...roof, w };
    const walked: number[] = [];
    let seen = 0;
    for (let t = at(0.25); t < at(0.75); t += 0.05) {
      const s = santaStepAt(pass, r, t);
      if (!s) continue;
      if (s.gait === 'walk') walked.push(s.x);
      // Debout sur le toit ou dans la cheminée : jamais dans la caisse (x de −20 à 13 dans le repère du dessin).
      if (s.y >= 0) {
        seen++;
        expect(s.x < -20 || s.x > 13).toBe(true);
        expect(Math.abs(s.x - 14)).toBeLessThanOrEqual(w / 2);
      }
    }
    expect(seen).toBeGreaterThan(20);
    expect(Math.max(...walked) - Math.min(...walked)).toBeGreaterThanOrEqual(6);
  });
  it('toit large : le chemin d’origine, derrière le traîneau', () => {
    const xs: number[] = [];
    for (let t = at(0.3); t < at(0.4); t += 0.05) {
      const s = santaStepAt(pass, { ...roof, w: 120 }, t);
      if (s && s.gait === 'walk') xs.push(s.x);
    }
    expect(Math.min(...xs)).toBeLessThan(-29);
    expect(Math.max(...xs)).toBeGreaterThan(-24);
  });
});

// Ghibli (G5) : la livraison se fait sur une maison de la colline peinte (santaHillRoof), le passage simple dans le ciel.
const houses = visibleHillHouses(cityPaintPlan(W, H, SEED).hill.houses, facades, ground);
// Première tranche (bornée : 400 quarts d'heure) qui livre sur une maison, et première qui ne livre pas.
const MAX_TRANCHES = 400;
const hillFound = ((): { pass: ReturnType<typeof santaPassFor>; hill: NonNullable<ReturnType<typeof santaHillRoof>> } => {
  for (let n = Math.floor(T0); n < Math.floor(T0) + MAX_TRANCHES; n++) {
    const pass = santaPassFor(n, SEED);
    const hill = pass.deliver ? santaHillRoof(pass, houses, 0, W) : null;
    if (hill) return { pass, hill };
  }
  throw new Error(`aucune livraison sur la colline en ${MAX_TRANCHES} tranches (graine ${SEED}, ${houses.length} maisons visibles)`);
})();
const simplePass = ((): ReturnType<typeof santaPassFor> => {
  for (let n = Math.floor(T0); n < Math.floor(T0) + MAX_TRANCHES; n++) {
    const pass = santaPassFor(n, SEED);
    if (!pass.deliver) return pass;
  }
  throw new Error(`aucun passage simple en ${MAX_TRANCHES} tranches`);
})();
const hAt = (p: number): number => hillFound.pass.start + p * SANTA_WINDOW_S;
const displayed = (n: Element | null): boolean => n !== null && n.getAttribute('display') !== 'none';

describe('père Noël Ghibli', () => {
  it('tenue rouge, bonnet rouge ; échelle des passants', () => {
    expect(SANTA_OUTFIT).toMatchObject({ topColor: '#C0302B', bottomColor: '#C0302B', hair: 'beanie', hatColor: '#C0302B' });
    expect(SANTA_K).toBe(0.55);
  });
  it('passage simple dans le ciel : attelage peint (rennes au galop, traînée), pantin assis les rênes en main, hotte à la nuque, jamais en miroir', () => {
    const c = mount(simplePass.start + 10, true);
    expect(c.querySelector('[data-santa-hill]')).toBeNull();
    expect(c.querySelector('mask')).toBeNull();
    const where = c.querySelector('[data-santa-figure]')!;
    expect(where.getAttribute('data-santa-where')).toBe('aboard');
    expect(where.getAttribute('transform')).toContain(`scale(${(simplePass.dir * SANTA_K).toFixed(3)} ${SANTA_K.toFixed(3)})`);
    const fig = where.querySelector('[data-figure]')!;
    expect(fig.getAttribute('data-sig')!.endsWith('.s')).toBe(true);
    expect(keyParts(fig)[2]).toBe('seated');
    expect(keyParts(fig)[5]).toBe('handlebar');
    // Hotte peinte derrière le corps (le repli SantaSack tant que l'image n'est pas cuite).
    expect(displayed(where.querySelector('[data-santa-sack-nape="back"]'))).toBe(true);
    expect(displayed(where.querySelector('[data-santa-sack-nape="front"]'))).toBe(false);
    expect(where.querySelector('[data-santa-sack-nape="back"] [data-santa-sack]')).not.toBeNull();
    // Cinq rennes cycliques au galop, traînée cyclique.
    const reindeer = [...c.querySelectorAll('[data-santa-reindeer] [data-prop-cycle]')];
    expect(reindeer.length).toBe(5);
    expect(reindeer.map((r) => r.getAttribute('data-prop-cycle'))).toEqual(Array<string>(5).fill(String(REINDEER_CYCLE_S)));
    expect(c.querySelector(`[data-santa-trail] [data-prop-cycle="${TRAIL_CYCLE_S}"]`)).not.toBeNull();
    expect(c.querySelector('[data-santa] [id]')).toBeNull();
  });
  it('livraison : sur une maison de la colline, derrière les immeubles (masque), repère local du toit retourné avec le sens, à l’échelle 0,55·s', () => {
    const { pass: hp, hill } = hillFound;
    const c = mount(hAt(0.27), true);
    const hillG = c.querySelector('[data-santa-hill]')!;
    expect(hillG).not.toBeNull();
    const maskRef = /url\(#(.+)\)/.exec(hillG.getAttribute('mask') ?? '')![1]!;
    const mask = c.querySelector(`mask[id="${maskRef}"]`)!;
    expect(mask.querySelectorAll('rect').length).toBe(facades.length + 1);
    expect(c.querySelector('[data-santa] [id]')).toBeNull();
    expect(c.querySelector('[data-santa-roof]')!.getAttribute('transform')).toBe(`translate(${hill.cx.toFixed(1)} ${hill.y.toFixed(1)}) scale(${hp.dir} 1)`);
    const train = c.querySelector<SVGGElement>('[data-santa-roof] > g')!;
    expect(train.getAttribute('display')).toBe('inline');
    const [u, y] = translateOf(train);
    expect(u).toBeCloseTo(landDx(hill), 1);
    expect(y).toBeCloseTo(roofSurface(hill, hill.cx + landDx(hill)) - hill.y, 1);
    // Incliné comme la pente, pas de traînée, rennes posés (poses de vie), pantin assis à l'échelle du traîneau.
    expect(c.querySelector('[data-santa-body]')!.parentElement!.getAttribute('transform')).toContain('rotate(');
    expect(c.querySelector('[data-santa-trail]')).toBeNull();
    expect([...c.querySelectorAll('[data-santa-reindeer] [data-prop-cycle]')].map((r) => r.getAttribute('data-prop-cycle'))).toEqual(Array<string>(5).fill(String(REINDEER_IDLE_S)));
    const k = santaHillScale(hill);
    const where = c.querySelector('[data-santa-figure]')!;
    expect(where.getAttribute('transform')).toContain(`scale(${(hp.dir * k).toFixed(3)} ${k.toFixed(3)})`);
    expect(keyParts(where.querySelector('[data-figure]')!)[2]).toBe('seated');
    expect(c.querySelector('[data-santa-window]')).toBeNull();
  });
  it('à pied sur le toit : marche penchée la hotte à l’épaule, pose la hotte, descend dans la cheminée (rogné à sa bouche), fenêtre allumée quand il est dedans', () => {
    const { pass: hp, hill } = hillFound;
    const walk = mount(hAt(0.3) + 3, true).querySelector('[data-santa-figure]')!;
    const step = santaHillStepAt(hp, hill, hAt(0.3) + 3)!;
    expect(step.gait).toBe('walk');
    expect(keyParts(walk.querySelector('[data-figure]')!)[2]).toBe('walk');
    expect(keyParts(walk.querySelector('[data-figure]')!)[5]).toBe('phone');
    // Penché vers l'amont : au début de la marche (pied du traîneau), il est sur le versant quel que soit le toit.
    const t1 = hAt(0.3) + 1.25;
    const onSlope = santaHillStepAt(hp, hill, t1)!;
    expect(onSlope.gait).toBe('walk');
    expect(onSlope.slope).toBeLessThan(0);
    const leaning = mount(t1, true).querySelector('[data-santa-figure]')!.getAttribute('transform')!;
    expect(leaning).toContain(`rotate(${(-0.45 * onSlope.slope * (180 / Math.PI)).toFixed(2)})`);
    expect(translateOf(walk)[0]).toBeCloseTo(step.x, 1);
    expect(displayed(walk.querySelector('[data-santa-sack-nape="back"]'))).toBe(true);
    // Pose la hotte : elle est au sol, plus à la nuque.
    const reach = mount(hAt(0.3) + 1.2 + 4.5 + 0.4, true);
    expect(keyParts(reach.querySelector('[data-figure]')!)[5]).toBe('reach');
    expect(displayed(reach.querySelector('[data-santa-sack-ground]'))).toBe(true);
    expect(displayed(reach.querySelector('[data-santa-sack-nape="back"]'))).toBe(false);
    // Dans la cheminée : grimpe de dos, cadre du svg imbriqué coupé à la bouche de la cheminée (hauteur < 400), viewBox = cadre.
    const sink = mount(hAt(0.3) + 1.2 + 4.5 + 0.9 + 0.7, true);
    const clip = sink.querySelector('svg[data-santa-clip]')!;
    expect(keyParts(clip.querySelector('[data-figure]')!)[2]).toBe('climb');
    expect(Number(clip.getAttribute('height'))).toBeLessThan(400);
    expect(clip.getAttribute('viewBox')!.split(' ').map(Number)).toEqual(['x', 'y', 'width', 'height'].map((k) => Number(clip.getAttribute(k))));
    // Caché : aucun personnage, fenêtre de la maison allumée.
    const hidden = mount(hAt(0.5), true);
    // La hotte reste posée sur le toit pendant qu'il est dans la maison.
    const ground = santaHillSackGround(hp, hill);
    const sg = hidden.querySelector('[data-santa-sack-ground]')!;
    expect(displayed(sg)).toBe(true);
    expect(translateOf(sg)[0]).toBeCloseTo(ground.x, 1);
    expect(hidden.querySelector('[data-santa-figure]')).toBeNull();
    const win = hidden.querySelector('[data-santa-window]')!;
    expect(Number(win.getAttribute('data-x'))).toBeCloseTo(santaHillWindow(hill).x);
    // Fenêtre lisible (notes §5, réveillon) : vitre ambre opaque comme les fenêtres allumées de la ville, et halo radial en
    // screen de rayon 9·s (pas un voile crème).
    const glass = win.querySelector('[data-santa-window-glass]')!;
    expect(glass.getAttribute('fill')).toBe('#FFD27A');
    const halo = win.querySelector('circle[data-santa-window-halo]')!;
    expect(Number(halo.getAttribute('r'))).toBeCloseTo(9 * hill.s, 1);
    expect(halo.getAttribute('fill')).toMatch(/^url\(#/);
    expect((halo as SVGElement).style.mixBlendMode).toBe('screen');
  });
  it('brume et teinte de nuit du groupe posé : palette du pantin différente de celle du passage simple, harnais et givre teints', () => {
    const far = mount(hAt(0.27), true);
    const near = mount(simplePass.start + 10, true);
    expect(far.querySelector('[data-figure]')!.getAttribute('data-palette')).not.toBe(near.querySelector('[data-figure]')!.getAttribute('data-palette'));
    const strokes = [...far.querySelectorAll('[data-santa-harness] path')].map((p) => p.getAttribute('stroke'));
    expect(strokes).not.toContain('#A02030');
    expect(strokes).not.toContain('#2A1A18');
    expect(far.querySelector('[data-santa-frost] circle')!.getAttribute('fill')).not.toBe('#FFFFFF');
    // Le masque couvre l'antenne (8 px) et le débord des pignons (2 px).
    const r = far.querySelector('mask rect:nth-of-type(2)')!;
    expect(Number(r.getAttribute('x'))).toBeCloseTo(facades[0]!.x - 2);
    expect(Number(r.getAttribute('y'))).toBeCloseTo(ground - facades[0]!.h - 9);
  });
  it('livraison sans maison visible : retombe en passage simple dans le ciel', () => {
    const { pass: hp } = hillFound;
    vi.spyOn(Date, 'now').mockReturnValue(hAt(0.5) * 1000);
    // Une façade qui couvre toute la scène : aucune maison de la colline n'est visible.
    const wall = [{ ...facades[0]!, x: 0, w: W, h: H }];
    const c = render(
      <FigureContext.Provider value={new FigureRegistry('t9w', { perFrame: 200 })}>
        <svg>
          <SantaLayer width={W} height={H} seed={SEED} sky={night} facades={wall} ground={ground} fests={['christmas-eve']} daylight={0} still={false} frozenT={hAt(0.5)} ghibli />
        </svg>
      </FigureContext.Provider>,
    );
    expect(c.querySelector('[data-santa-hill]')).toBeNull();
    expect(c.querySelector('[data-santa-window]')).toBeNull();
    const train = c.querySelector<SVGGElement>('[data-santa] > g')!;
    expect(train.getAttribute('display')).toBe('inline');
    expect(train.getAttribute('transform')).toContain(`scale(${hp.dir} 1)`);
    expect(c.querySelector('[data-santa-trail]')).not.toBeNull();
    expect(c.querySelector('[data-santa-figure]')!.getAttribute('data-santa-where')).toBe('aboard');
  });
  it('mouvement réduit : le groupe posé, à bord, sans pose cyclique', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
    vi.spyOn(Date, 'now').mockReturnValue(hAt(0.1) * 1000);
    const c = render(
      <FigureContext.Provider value={new FigureRegistry('t9r', { perFrame: 200 })}>
        <svg>
          <SantaLayer width={W} height={H} seed={SEED} sky={night} facades={facades} ground={ground} fests={['christmas-eve']} daylight={0} still frozenT={hAt(0.1)} ghibli />
        </svg>
      </FigureContext.Provider>,
    );
    vi.unstubAllGlobals();
    expect(c.querySelector('[data-santa-roof] > g')!.getAttribute('display')).toBe('inline');
    expect(c.querySelector('[data-prop-cycle]')).toBeNull();
    expect(c.querySelectorAll('[data-santa-reindeer]').length).toBe(5);
    expect(keyParts(c.querySelector('[data-figure]')!)[2]).toBe('seated');
  });
});

describe('père Noël classique : même chemin, même dessin', () => {
  it('à bord : dessin d’origine, pas de pantin', () => {
    const c = mount(at(0.1), false);
    expect(c.querySelector('[data-figure]')).toBeNull();
    expect(c.querySelector('[data-santa-where="aboard"]')).not.toBeNull();
  });
  it('à pied : suit le chemin du script (plus de saut de la place à la cheminée)', () => {
    const t = at(0.3) + 2.6;
    const s = santaStepAt(pass, roof, t)!;
    const n = mount(t, false).querySelector('[data-santa-where="walking"]')!;
    expect(translateOf(n)).toEqual([Number(s.x.toFixed(1)), Number(s.y.toFixed(1))]);
  });
});
