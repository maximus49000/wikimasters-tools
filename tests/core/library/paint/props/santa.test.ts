import { describe, expect, it } from 'vitest';
import { PROPS } from '../../../../../src/core/library/paint/props/index';
import { REINDEER_CYCLE_S, REINDEER_IDLE_S, TRAIL_CYCLE_S } from '../../../../../src/core/library/paint/props/santa';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { recordingCtx } from '../recording-ctx';
import { touched } from './replay';

type Args = Record<string, string | number | boolean>;
const ARGS: Record<string, Args[]> = {
  reindeer: [{ lead: false, landed: false }, { lead: true, landed: false }, { lead: false, landed: true }, { lead: true, landed: true, far: 0.28 }],
  sleigh: [{}, { far: 0.28 }],
  'santa-trail': [{}, { far: 0.28 }],
  'santa-sack': [{}, { far: 0.28 }],
};

const paint = (id: string, a: Args, frame = 0, lit = false): ReturnType<typeof recordingCtx> => {
  const c = recordingCtx();
  PROPS[id]!.paint(tintedCtx(c, (s) => s), a, { day: 0, lit, dir: 1, frame });
  return c;
};
const pts = (id: string, a: Args, frame = 0): [number, number][] => touched(paint(id, a, frame).ops);

// Dans le cadre du peintre (à 1 u près) pour chaque pose déclarée, allumé ou non, et déterministe.
function inFrame(id: string, a: Args): void {
  const [x, y, w, h] = PROPS[id]!.box(a);
  const n = PROPS[id]!.frames ?? 1;
  for (let frame = 0; frame < n; frame++) {
    for (const lit of [false, true]) {
      const c1 = paint(id, a, frame, lit);
      expect(c1.ops.length).toBeGreaterThan(0);
      expect(c1.ops).toEqual(paint(id, a, frame, lit).ops);
      const p = touched(c1.ops);
      expect(p.length).toBeGreaterThan(0);
      for (const [px, py] of p) {
        expect(px, `${id} ${JSON.stringify(a)} x (pose ${frame})`).toBeGreaterThanOrEqual(x - 1); expect(px, `${id} x (pose ${frame})`).toBeLessThanOrEqual(x + w + 1);
        expect(py, `${id} ${JSON.stringify(a)} y (pose ${frame})`).toBeGreaterThanOrEqual(y - 1); expect(py, `${id} y (pose ${frame})`).toBeLessThanOrEqual(y + h + 1);
      }
    }
  }
}
// Passages par glowing().
const glows = (id: string, a: Args, lit: boolean): number => {
  const t = tintedCtx(recordingCtx(), (c) => c);
  let n = 0;
  const g = t.glowing;
  t.glowing = (fn) => { n++; g(fn); };
  PROPS[id]!.paint(t, a, { day: 0, lit, dir: 1, frame: 1 });
  return n;
};

describe('père Noël cellulo (rennes, traîneau, traînée, hotte)', () => {
  for (const [id, list] of Object.entries(ARGS)) {
    it(`${id} : dans son cadre et déterministe, à chaque pose`, () => {
      for (const a of list) inFrame(id, a);
    });
  }
  it('renne : 8 poses de galop sur 0,55 s ; détente (pose 0) et rassemblé (pose 4) n’ont pas les sabots aux mêmes endroits', () => {
    expect(PROPS.reindeer!.frames).toBe(8);
    expect(REINDEER_CYCLE_S).toBe(0.55);
    expect(REINDEER_IDLE_S).toBeGreaterThan(1);
    const a = { lead: false, landed: false };
    expect(pts('reindeer', a, 0)).not.toEqual(pts('reindeer', a, 4));
    // Le corps s'allonge à la détente : l'ellipse du corps de la pose 0 est plus large que celle de la pose 4.
    const body = (f: number): number => paint('reindeer', a, f).ops.find((o) => o.op === 'ellipse' && o.args[3] === 2.8)!.args[2]!;
    expect(body(0)).toBeGreaterThan(body(4));
  });
  it('renne posé : 4 poses de vie (la 5e répète la 1re), pattes d’aplomb, souffle blanc', () => {
    const a = { lead: false, landed: true };
    expect(paint('reindeer', a, 0).ops).toEqual(paint('reindeer', a, 4).ops);
    expect(paint('reindeer', a, 1).ops).not.toEqual(paint('reindeer', a, 0).ops);
    expect(paint('reindeer', a, 1).fills.some((f) => f.startsWith('rgba(255,255,255'))).toBe(true);
  });
  it('meneur : nez rouge lumineux (glowing) la nuit ; les autres rennes n’ont rien de lumineux', () => {
    expect(glows('reindeer', { lead: true, landed: false }, true)).toBeGreaterThan(0);
    expect(glows('reindeer', { lead: true, landed: false }, false)).toBe(0);
    expect(glows('reindeer', { lead: false, landed: false }, true)).toBe(0);
  });
  it('traîneau : la lanterne allumée passe par glowing, pas éteinte', () => {
    expect(glows('sleigh', {}, true)).toBeGreaterThan(0);
    expect(glows('sleigh', {}, false)).toBe(0);
  });
  it('traînée : 8 poses qui bouclent, étoiles lumineuses la nuit', () => {
    expect(PROPS['santa-trail']!.frames).toBe(8);
    expect(TRAIL_CYCLE_S).toBeGreaterThan(0);
    expect(pts('santa-trail', {}, 0)).not.toEqual(pts('santa-trail', {}, 3));
    expect(glows('santa-trail', {}, true)).toBeGreaterThan(0);
  });
  it('teinte lointaine : les couleurs du renne lointain sont bleuies (différentes du proche)', () => {
    const near = paint('reindeer', { lead: false, landed: false }).fills;
    const far = paint('reindeer', { lead: false, landed: false, far: 0.28 }).fills;
    expect(far).not.toEqual(near);
    expect(far.length).toBe(near.length);
  });
});
