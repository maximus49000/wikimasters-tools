// @vitest-environment jsdom
// tests/content/santa-ghibli.test.tsx — père Noël au pantin (Ghibli), descente du traîneau et de la cheminée sans apparition
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FigureContext, FigureRegistry } from '../../src/content/figure/figure-host';
import { SANTA_K, SANTA_OUTFIT, SantaLayer } from '../../src/content/santa-layer';
import { cityFacades } from '../../src/core/library/city/facades';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { SANTA_SEAT, SANTA_SUNK, SANTA_WINDOW_S, santaPassFor, santaRoof, santaStepAt } from '../../src/core/library/city/santa';
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

describe('père Noël Ghibli', () => {
  it('tenue rouge, bonnet rouge', () => {
    expect(SANTA_OUTFIT).toMatchObject({ topColor: '#C0302B', bottomColor: '#C0302B', hair: 'beanie', hatColor: '#C0302B' });
  });
  it('à bord en vol : un pantin dans le traîneau, hotte tenue, jamais en miroir', () => {
    const c = mount(at(0.1), true);
    const where = c.querySelector('[data-santa-figure]')!;
    expect(where.getAttribute('data-santa-where')).toBe('aboard');
    const fig = where.querySelector('[data-figure]')!;
    expect(fig).not.toBeNull();
    expect(fig.querySelector('[data-held="hands"] [data-santa-sack]')).not.toBeNull();
    expect(where.getAttribute('transform')).toContain(`scale(${(pass.dir * SANTA_K).toFixed(3)} ${SANTA_K.toFixed(3)})`);
    expect(keyParts(fig)[5]).toBe('carry');
  });
  it('descend du traîneau en grimpant, puis marche avec la hotte', () => {
    const climb = mount(at(0.3) + 1.2, true).querySelector('[data-santa-figure] [data-figure]')!;
    expect(keyParts(climb)[2]).toBe('climb');
    const step = santaStepAt(pass, roof, at(0.3) + 2.6)!;
    expect(step.gait).toBe('walk');
    const walk = mount(at(0.3) + 2.6, true).querySelector('[data-santa-figure]')!;
    expect(keyParts(walk.querySelector('[data-figure]')!)[2]).toBe('walk');
    expect(translateOf(walk)[0]).toBeCloseTo(step.x, 1);
  });
  it('caché derrière la cheminée : aucun personnage', () => {
    expect(mount(at(0.5), true).querySelector('[data-santa-figure]')).toBeNull();
  });
  it('le personnage est rogné au toit (svg imbriqué au repère du traîneau : viewBox = cadre), sans id', () => {
    const c = mount(at(0.3) + 6, true);
    const clip = c.querySelector('svg[data-santa-clip]')!;
    expect(clip.querySelector('[data-santa-figure]')).not.toBeNull();
    // Sans viewBox, l'origine des enfants serait le coin (x, y) du cadre : le père Noël serait à 200 unités du traîneau.
    expect(clip.getAttribute('viewBox')!.split(' ').map(Number)).toEqual(['x', 'y', 'width', 'height'].map((k) => Number(clip.getAttribute(k))));
    // Coupe au niveau du toit : bas du cadre à y = 0.
    expect(Number(clip.getAttribute('y')) + Number(clip.getAttribute('height'))).toBe(0);
    expect(c.querySelector('[data-santa] [id]')).toBeNull();
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
