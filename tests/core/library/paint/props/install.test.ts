import { describe, expect, it } from 'vitest';
import { PROPS } from '../../../../../src/core/library/paint/props/index';
import '../../../../../src/core/library/paint/props/install';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { recordingCtx, type Op } from '../recording-ctx';

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

// Points touchés, en coordonnées du sprite : les peintres des installations posent des pièces par translate/rotate (têtes de
// projecteur inclinées, drapeaux de la caisse), que le faux contexte n'applique pas ; on rejoue donc ses appels avec une
// pile de transformations et le rognage (`clip` borne les bandes d'ombre et de rehaut de `cel` à la forme).
type M = readonly [number, number, number, number, number, number];
type Box = [number, number, number, number] | null;
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
function touched(ops: readonly Op[]): [number, number][] {
  const out: [number, number][] = [];
  let m: M = [1, 0, 0, 1, 0, 0];
  let clip: Box = null;
  const stack: { m: M; clip: Box }[] = [];
  let path: [number, number][] = [];
  const pt = (x: number, y: number): void => {
    const p: [number, number] = [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    path.push(p);
    out.push(clip ? [Math.min(clip[2], Math.max(clip[0], p[0])), Math.min(clip[3], Math.max(clip[1], p[1]))] : p);
  };
  const box = (x: number, y: number, w: number, h: number): void => {
    pt(x, y); pt(x + w, y); pt(x, y + h); pt(x + w, y + h);
  };
  for (const { op, args: a } of ops) {
    switch (op) {
      case 'save': stack.push({ m, clip }); break;
      case 'restore': ({ m, clip } = stack.pop() ?? { m, clip }); break;
      case 'translate': m = mul(m, [1, 0, 0, 1, a[0]!, a[1]!]); break;
      case 'scale': m = mul(m, [a[0]!, 0, 0, a[1]!, 0, 0]); break;
      case 'rotate': { const c = Math.cos(a[0]!); const s = Math.sin(a[0]!); m = mul(m, [c, s, -s, c, 0, 0]); break; }
      case 'beginPath': path = []; break;
      case 'moveTo': case 'lineTo': pt(a[0]!, a[1]!); break;
      case 'quadraticCurveTo': pt(a[0]!, a[1]!); pt(a[2]!, a[3]!); break;
      case 'bezierCurveTo': pt(a[0]!, a[1]!); pt(a[2]!, a[3]!); pt(a[4]!, a[5]!); break;
      case 'arc': box(a[0]! - a[2]!, a[1]! - a[2]!, 2 * a[2]!, 2 * a[2]!); break;
      // Boîte exacte d'une ellipse droite ; tournée, le carré du grand rayon (comme recording-ctx).
      case 'ellipse': { const [rx, ry] = a[4] ? [Math.max(a[2]!, a[3]!), Math.max(a[2]!, a[3]!)] : [a[2]!, a[3]!]; box(a[0]! - rx, a[1]! - ry, 2 * rx, 2 * ry); break; }
      case 'rect': case 'roundRect': case 'fillRect': case 'strokeRect': box(a[0]!, a[1]!, a[2]!, a[3]!); break;
      case 'clip': {
        if (!path.length) break;
        const b: Box = [Math.min(...path.map((p) => p[0])), Math.min(...path.map((p) => p[1])), Math.max(...path.map((p) => p[0])), Math.max(...path.map((p) => p[1]))];
        clip = clip ? [Math.max(clip[0], b[0]), Math.max(clip[1], b[1]), Math.min(clip[2], b[2]), Math.min(clip[3], b[3])] : b;
        break;
      }
      default: break;
    }
  }
  return out;
}

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
