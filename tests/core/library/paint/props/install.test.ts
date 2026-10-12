import { describe, expect, it } from 'vitest';
import { PROPS } from '../../../../../src/core/library/paint/props/index';
import '../../../../../src/core/library/paint/props/install';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { recordingCtx } from '../recording-ctx';
import { touched } from './replay';

const ARGS: Record<string, Record<string, string | number | boolean>> = {
  barrier: {},
  'stage-floor': {},
  'stage-frame': {},
  'stage-spots': {},
  'held-truss': {},
  'held-spot': {},
  'flag-crate': { n: 3, w: 14 },
  'lift-bucket': {},
  'cargo-bike': { flags: 3, ladder: true },
  'flatbed-load': { floor: 1, frame: 1, spots: 1, counters: 2, rolls: 2 },
  'stowed-ladder': { len: 30 },
};

const paint = (id: string, a: Record<string, string | number | boolean>, lit = false): ReturnType<typeof recordingCtx> => {
  const c = recordingCtx();
  PROPS[id]!.paint(tintedCtx(c, (s) => s), a, { day: 1, lit, dir: 1, frame: 0 });
  return c;
};

function inFrame(id: string, a: Record<string, string | number | boolean>, lit = false): void {
  const [x, y, w, h] = PROPS[id]!.box(a);
  const c1 = paint(id, a, lit);
  const c2 = paint(id, a, lit);
  expect(c1.ops.length).toBeGreaterThan(0);
  expect(c1.ops).toEqual(c2.ops);
  const pts = touched(c1.ops);
  expect(pts.length).toBeGreaterThan(0);
  for (const [px, py] of pts) {
    expect(px, `${id} x`).toBeGreaterThanOrEqual(x - 1); expect(px, `${id} x`).toBeLessThanOrEqual(x + w + 1);
    expect(py, `${id} y`).toBeGreaterThanOrEqual(y - 1); expect(py, `${id} y`).toBeLessThanOrEqual(y + h + 1);
  }
}

describe('installations cellulo (barrières, scène, nacelle, triporteur, chargements)', () => {
  for (const [id, a] of Object.entries(ARGS)) {
    it(`${id} : dans son cadre et déterministe`, () => inFrame(id, a));
  }
  it('projecteurs allumés : dans le cadre aussi (halos) ; la lentille passe par glowing, pas éteinte', () => {
    inFrame('stage-spots', {}, true);
    const count = (lit: boolean): number => {
      const t = tintedCtx(recordingCtx(), (c) => c);
      let n = 0;
      const g = t.glowing;
      t.glowing = (fn) => { n++; g(fn); };
      PROPS['stage-spots']!.paint(t, {}, { day: 0, lit, dir: 1, frame: 0 });
      return n;
    };
    expect(count(true)).toBeGreaterThan(0);
    expect(count(false)).toBe(0);
  });
  it('caisse de drapeaux : autant de hampes que de drapeaux, aucune à vide ; largeur suivie par le cadre', () => {
    const poles = (n: number, w: number): number => touched(paint('flag-crate', { n, w }).ops).filter(([, y]) => Math.abs(y + 11) < 1e-6).length;
    expect(poles(0, 14)).toBe(0);
    expect(poles(3, 14)).toBeGreaterThan(poles(1, 14));
    inFrame('flag-crate', { n: 0, w: 14 });
    inFrame('flag-crate', { n: 5, w: 20 });
    expect(PROPS['flag-crate']!.box({ n: 3, w: 20 })[2]).toBeGreaterThan(PROPS['flag-crate']!.box({ n: 3, w: 14 })[2]);
  });
  it('triporteur : sans échelle ni drapeaux, moins de traits ; chargement du plateau : chaque pièce ajoute du dessin', () => {
    const n = (id: string, a: Record<string, string | number | boolean>): number => paint(id, a).ops.length;
    expect(n('cargo-bike', { flags: 3, ladder: true })).toBeGreaterThan(n('cargo-bike', { flags: 0, ladder: false }));
    inFrame('cargo-bike', { flags: 0, ladder: false });
    const base = { floor: 0, frame: 0, spots: 0, counters: 0, rolls: 0 };
    expect(n('flatbed-load', base)).toBe(0);
    for (const k of Object.keys(base)) expect(n('flatbed-load', { ...base, [k]: 1 }), k).toBeGreaterThan(0);
    inFrame('flatbed-load', { floor: 1, frame: 1, spots: 1, counters: 3, rolls: 3 });
    // Rue large : jusqu'à 8 stands (beerStandsFor) ; la rangée de fûts dépasse les projecteurs, le cadre suit.
    inFrame('flatbed-load', { floor: 1, frame: 1, spots: 1, counters: 8, rolls: 8 });
    expect(PROPS['flatbed-load']!.box({ counters: 8 })[2]).toBeGreaterThan(PROPS['flatbed-load']!.box({ counters: 2 })[2]);
  });
  it('échelle couchée : la longueur fixe le cadre et le nombre de barreaux', () => {
    const b = PROPS['stowed-ladder']!;
    expect(b.box({ len: 34 })[2]).toBeGreaterThan(b.box({ len: 25 })[2]);
    inFrame('stowed-ladder', { len: 34 });
    inFrame('stowed-ladder', { len: 25 });
    expect(paint('stowed-ladder', { len: 34 }).ops.length).toBeGreaterThan(paint('stowed-ladder', { len: 25 }).ops.length);
  });
});
