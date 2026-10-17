import { describe, expect, it } from 'vitest';
import { HEAVY_PIECES } from '../../../../../src/core/library/city/shops/moving-crew';
import { FESTIVE_MARKS } from '../../../../../src/core/library/city/people';
import { PROPS } from '../../../../../src/core/library/paint/props/index';
import { MARK_CYCLE_S, MARK_FRAMES, PIECE_LEN } from '../../../../../src/core/library/paint/props/moving';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { recordingCtx } from '../recording-ctx';
import { touched } from './replay';

type Args = Record<string, string | number | boolean>;
const ARGS: Record<string, Args[]> = {
  tailgate: [{ open: 0 }, { open: 0.5 }, { open: 1 }, { open: 0.3 }],
  piece: HEAVY_PIECES.map((kind) => ({ kind, len: PIECE_LEN })),
  box: [{}],
  mark: [...FESTIVE_MARKS.map((kind) => ({ kind })), { kind: 'flag', still: true }],
};

const paint = (id: string, a: Args, frame = 0, dir: 1 | -1 = 1): ReturnType<typeof recordingCtx> => {
  const c = recordingCtx();
  PROPS[id]!.paint(tintedCtx(c, (s) => s), a, { day: 1, lit: false, dir, frame });
  return c;
};
const pts = (id: string, a: Args, frame = 0): [number, number][] => touched(paint(id, a, frame).ops);

// Dans le cadre du peintre (à 1 u près) pour chaque pose déclarée, et déterministe.
function inFrame(id: string, a: Args): void {
  const [x, y, w, h] = PROPS[id]!.box(a);
  const n = PROPS[id]!.frames ?? 1;
  for (let frame = 0; frame < n; frame++) {
    const c1 = paint(id, a, frame);
    expect(c1.ops.length).toBeGreaterThan(0);
    expect(c1.ops).toEqual(paint(id, a, frame).ops);
    const p = touched(c1.ops);
    expect(p.length).toBeGreaterThan(0);
    for (const [px, py] of p) {
      expect(px, `${id} ${JSON.stringify(a)} x (pose ${frame})`).toBeGreaterThanOrEqual(x - 1); expect(px, `${id} ${JSON.stringify(a)} x (pose ${frame})`).toBeLessThanOrEqual(x + w + 1);
      expect(py, `${id} ${JSON.stringify(a)} y (pose ${frame})`).toBeGreaterThanOrEqual(y - 1); expect(py, `${id} ${JSON.stringify(a)} y (pose ${frame})`).toBeLessThanOrEqual(y + h + 1);
    }
  }
}

describe('déménagement et signes festifs cellulo (hayon, meubles portés, carton, signes tenus)', () => {
  for (const [id, list] of Object.entries(ARGS)) {
    it(`${id} : dans son cadre et déterministe, à chaque pose`, () => {
      for (const a of list) inFrame(id, a);
    });
  }
  it('hayon : fermé, panneau vertical au-dessus de la charnière ; ouvert, rampe à plat vers l’arrière (−x) ; ouverture quantifiée au 1/8', () => {
    const closed = pts('tailgate', { open: 0 });
    expect(Math.min(...closed.map(([, y]) => y))).toBeLessThan(-26);
    expect(Math.min(...closed.map(([x]) => x))).toBeGreaterThan(-3);
    const open = pts('tailgate', { open: 1 });
    expect(Math.min(...open.map(([x]) => x))).toBeLessThan(-26);
    expect(Math.min(...open.map(([, y]) => y))).toBeGreaterThan(-3);
    expect(paint('tailgate', { open: 0.5 }).ops).toEqual(paint('tailgate', { open: 0.52 }).ops);
    expect(paint('tailgate', { open: 0.5 }).ops).not.toEqual(paint('tailgate', { open: 0.75 }).ops);
  });
  it('meubles : centrés sur x = 0, posés sur les mains (y ≤ 0,5) ; chaque genre a son dessin', () => {
    const seen = new Set<string>();
    for (const kind of HEAVY_PIECES) {
      const p = pts('piece', { kind, len: PIECE_LEN });
      const xs = p.map(([x]) => x);
      expect(Math.min(...xs), kind).toBeLessThan(-PIECE_LEN / 2 + 1);
      expect(Math.max(...xs), kind).toBeGreaterThan(PIECE_LEN / 2 - 1);
      for (const [, y] of p) expect(y, kind).toBeLessThanOrEqual(0.5);
      const sig = JSON.stringify(paint('piece', { kind, len: PIECE_LEN }).ops);
      expect(seen.has(sig), kind).toBe(false);
      seen.add(sig);
    }
  });
  it('carton : à la place du carton classique (4,5..13,5 × −27..−20), marqué « FRAGILE » (texte redressé à −1 aussi)', () => {
    const p = pts('box', {});
    expect(Math.min(...p.map(([x]) => x))).toBeGreaterThan(3.5);
    expect(Math.max(...p.map(([x]) => x))).toBeLessThan(14.5);
    expect(paint('box', {}).texts).toContain('FRAGILE');
    expect(paint('box', {}, 0, -1).texts).toContain('FRAGILE');
  });
  it('signes : 8 poses ; ballon, note, serpentin et drapeau bougent d’une pose à l’autre, les autres non ; drapeau `still` figé ; périodes de la maquette', () => {
    expect(PROPS.mark!.frames).toBe(MARK_FRAMES);
    expect(MARK_FRAMES).toBe(8);
    for (const kind of FESTIVE_MARKS) {
      const same = paint('mark', { kind }, 0).ops.length === paint('mark', { kind }, 3).ops.length && JSON.stringify(paint('mark', { kind }, 0).ops) === JSON.stringify(paint('mark', { kind }, 3).ops);
      expect(same, kind).toBe(MARK_CYCLE_S[kind] === null);
    }
    expect(paint('mark', { kind: 'flag', still: true }, 0).ops).toEqual(paint('mark', { kind: 'flag', still: true }, 5).ops);
    expect(MARK_CYCLE_S['heart-balloon']).toBeCloseTo((2 * Math.PI) / 1.6, 6);
    expect(MARK_CYCLE_S.note).toBeCloseTo(Math.PI, 6);
    expect(MARK_CYCLE_S.streamer).toBeCloseTo(Math.PI / 2, 6);
    expect(MARK_CYCLE_S.crown).toBeNull();
  });
  it('signes : repère du passant (couronne sur la tête à −37..−42, coquelicot au revers vers −24) ; serpentin en main (bâtonnet à l’origine)', () => {
    const crown = pts('mark', { kind: 'crown' });
    expect(Math.max(...crown.map(([, y]) => y))).toBeLessThan(-36);
    expect(Math.min(...crown.map(([, y]) => y))).toBeGreaterThan(-43.5);
    const poppy = pts('mark', { kind: 'poppy' });
    for (const [, y] of poppy) expect(y).toBeGreaterThan(-27);
    for (const [, y] of poppy) expect(y).toBeLessThan(-21);
    const streamer = pts('mark', { kind: 'streamer' });
    expect(Math.max(...streamer.map(([, y]) => y))).toBeGreaterThan(0);
    expect(Math.min(...streamer.map(([, y]) => y))).toBeLessThan(-15);
  });
});
