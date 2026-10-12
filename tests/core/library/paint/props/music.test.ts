import { describe, expect, it } from 'vitest';
import { PROPS } from '../../../../../src/core/library/paint/props/index';
import '../../../../../src/core/library/paint/props/music';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { recordingCtx } from '../recording-ctx';
import { touched } from './replay';

type Args = Record<string, string | number | boolean>;
const ARGS: Record<string, Args> = {
  keg: {},
  'beer-cup': {},
  'stand-counter': {},
  'stand-awning': { garland: true },
  'carried-counter': {},
  'held-roll': {},
  'stage-prop': { kind: 'guitar', dx: 9, dy: -2, foot: 0 },
  'stage-extras': {},
  'stage-glow': { pal: 0 },
};

const paint = (id: string, a: Args, lit = false, dir: 1 | -1 = 1): ReturnType<typeof recordingCtx> => {
  const c = recordingCtx();
  PROPS[id]!.paint(tintedCtx(c, (s) => s), a, { day: 1, lit, dir, frame: 0 });
  return c;
};

function inFrame(id: string, a: Args, lit = false): void {
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
// Passages par glowing() (parties lumineuses, non teintes).
const glows = (id: string, a: Args, lit: boolean): number => {
  const t = tintedCtx(recordingCtx(), (c) => c);
  let n = 0;
  const g = t.glowing;
  t.glowing = (fn) => { n++; g(fn); };
  PROPS[id]!.paint(t, a, { day: 0, lit, dir: 1, frame: 0 });
  return n;
};

describe('Fête de la musique cellulo (fût, gobelet, comptoir, auvent, instruments, extras de concert)', () => {
  for (const [id, a] of Object.entries(ARGS)) {
    it(`${id} : dans son cadre et déterministe`, () => inFrame(id, a));
  }
  it('comptoir : les fûts sont du côté −x (dir = side retourne l’image côté opposé à la file)', () => {
    const xs = touched(paint('stand-counter', {}).ops).map(([x]) => x);
    expect(Math.min(...xs)).toBeLessThan(-35);
    expect(Math.max(...xs)).toBeLessThan(31);
    inFrame('stand-counter', {}, false);
    // Peint retourné : même nombre d'appels (le canvas de l'hôte est retourné, pas le dessin).
    expect(paint('stand-counter', {}, false, -1).ops.length).toBe(paint('stand-counter', {}).ops.length);
  });
  it('auvent : la guirlande ajoute des ampoules ; allumée la nuit, elle passe par glowing, jamais éteinte ni sans guirlande', () => {
    expect(paint('stand-awning', { garland: true }).ops.length).toBeGreaterThan(paint('stand-awning', { garland: false }).ops.length);
    inFrame('stand-awning', { garland: false });
    inFrame('stand-awning', { garland: true }, true);
    expect(glows('stand-awning', { garland: true }, true)).toBeGreaterThan(0);
    expect(glows('stand-awning', { garland: true }, false)).toBe(0);
    expect(glows('stand-awning', { garland: false }, true)).toBe(0);
  });
  it('instruments : guitare, micro et caisse claire à leurs accroches (mains du pantin), cadre qui suit les arguments', () => {
    for (const kind of ['guitar', 'mic', 'drum']) {
      inFrame('stage-prop', { kind, dx: 9, dy: -2, foot: 24 });
      inFrame('stage-prop', { kind, dx: -8.5, dy: 1, foot: 9 });
    }
    const box = (a: Args): readonly [number, number, number, number] => PROPS['stage-prop']!.box(a);
    // Le pied du micro et de la caisse claire descend jusqu'à `foot` : le cadre s'allonge.
    expect(box({ kind: 'mic', dx: 9, dy: -2, foot: 24 })[3]).toBeGreaterThan(box({ kind: 'mic', dx: 9, dy: -2, foot: 9 })[3]);
    expect(box({ kind: 'drum', dx: 9, dy: -2, foot: 24 })[3]).toBeGreaterThan(box({ kind: 'drum', dx: 9, dy: -2, foot: 9 })[3]);
    // Manche de la guitare vers la main gauche : le cadre suit dx.
    expect(box({ kind: 'guitar', dx: 12, dy: -2, foot: 0 })[2]).toBeGreaterThan(box({ kind: 'guitar', dx: 6, dy: -2, foot: 0 })[2]);
    // Le pied du micro touche `foot`.
    const ys = touched(paint('stage-prop', { kind: 'mic', dx: 9, dy: -2, foot: 24 }).ops).map(([, y]) => y);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(24);
  });
  it('extras de concert : éteints de jour ; allumés, lentilles des lyres, contre-jours et rampe LED dans glowing', () => {
    inFrame('stage-extras', {}, true);
    expect(glows('stage-extras', {}, false)).toBe(0);
    expect(glows('stage-extras', {}, true)).toBeGreaterThan(0);
    expect(paint('stage-extras', {}, true).ops.length).toBeGreaterThan(paint('stage-extras', {}, false).ops.length);
  });
  it('plancher révélé : peint non teint (glowing) dans la couleur de la palette, masqué par un dégradé (destination-in)', () => {
    for (let pal = 0; pal < 4; pal++) inFrame('stage-glow', { pal });
    expect(glows('stage-glow', { pal: 1 }, false)).toBeGreaterThan(0);
    const c = paint('stage-glow', { pal: 2 });
    expect(c.ops.some((o) => o.op === 'gradient')).toBe(true);
    expect(c.fills.some((f) => f.startsWith('#'))).toBe(true);
    // Deux palettes, deux peintures différentes.
    expect(paint('stage-glow', { pal: 0 }).fills).not.toEqual(paint('stage-glow', { pal: 2 }).fills);
  });
});
