import { describe, expect, it } from 'vitest';
import { BREEDS, collarOf, DOG_CYCLE_S, dogOf } from '../../../../../src/core/library/paint/props/dog';
import { PROPS } from '../../../../../src/core/library/paint/props/index';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { recordingCtx } from '../recording-ctx';
import { touched } from './replay';

type Args = Record<string, string | number | boolean>;
const paint = (a: Args, frame = 0, lit = false): ReturnType<typeof recordingCtx> => {
  const c = recordingCtx();
  PROPS.dog!.paint(tintedCtx(c, (s) => s), a, { day: 0, lit, dir: 1, frame });
  return c;
};
const pts = (a: Args, frame = 0): [number, number][] => touched(paint(a, frame).ops);

// Dans le cadre du peintre (à 1 u près) pour chaque pose déclarée, allumé ou non, et déterministe.
function inFrame(a: Args): void {
  const [x, y, w, h] = PROPS.dog!.box(a);
  const n = PROPS.dog!.frames ?? 1;
  for (let frame = 0; frame < n; frame++) {
    for (const lit of [false, true]) {
      const c1 = paint(a, frame, lit);
      expect(c1.ops.length).toBeGreaterThan(0);
      expect(c1.ops).toEqual(paint(a, frame, lit).ops);
      const p = touched(c1.ops);
      expect(p.length).toBeGreaterThan(0);
      for (const [px, py] of p) {
        expect(px, `dog ${JSON.stringify(a)} x (pose ${frame})`).toBeGreaterThanOrEqual(x - 1); expect(px, `dog ${JSON.stringify(a)} x (pose ${frame})`).toBeLessThanOrEqual(x + w + 1);
        expect(py, `dog ${JSON.stringify(a)} y (pose ${frame})`).toBeGreaterThanOrEqual(y - 1); expect(py, `dog ${JSON.stringify(a)} y (pose ${frame})`).toBeLessThanOrEqual(y + h + 1);
      }
    }
  }
}

describe('chien du promeneur cellulo (six races, trois robes)', () => {
  it('BREEDS : six races aux proportions de la maquette (labrador 1/1 … bouledogue 0,85/0,82)', () => {
    expect(BREEDS.map((b) => [b.id, b.L, b.H])).toEqual([
      ['labrador', 1, 1], ['teckel', 1.35, 0.72], ['terrier', 0.85, 0.85], ['caniche', 0.9, 1], ['berger', 1.1, 1.08], ['bouledogue', 0.85, 0.82],
    ]);
  });
  it('dogOf : déterministe, et 200 graines couvrent les 6 races et les 3 robes', () => {
    const breeds = new Set<number>();
    const coats = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const d = dogOf(seed);
      expect(d).toEqual(dogOf(seed));
      expect(Number.isInteger(d.breed) && d.breed >= 0 && d.breed < 6).toBe(true);
      expect(Number.isInteger(d.coat) && d.coat >= 0 && d.coat < 3).toBe(true);
      breeds.add(d.breed);
      coats.add(d.coat);
    }
    expect(breeds.size).toBe(6);
    expect(coats.size).toBe(3);
  });
  it('collarOf : le collier du labrador est à (4,6, −9,2) ; celui du teckel suit ses proportions', () => {
    expect(collarOf(0)).toEqual([4.6, -9.2]);
    const [cx, cy] = collarOf(1);
    expect(cx).toBeCloseTo(4.6 * 1.35, 6);
    expect(cy).toBeCloseTo(-9.2 * 0.72, 6);
  });
  it('dog : dans son cadre et déterministe, à chaque pose, pour les 6 races × 3 robes', () => {
    for (let breed = 0; breed < 6; breed++) for (let coat = 0; coat < 3; coat++) inFrame({ breed, coat });
  });
  it('dog : 8 poses de marche sur 0,5 s ; les poses 0 et 4 n’ont pas les pattes aux mêmes endroits', () => {
    expect(PROPS.dog!.frames).toBe(8);
    expect(DOG_CYCLE_S).toBe(0.5);
    for (let breed = 0; breed < 6; breed++) expect(pts({ breed, coat: 0 }, 0)).not.toEqual(pts({ breed, coat: 0 }, 4));
  });
  it('dog : la robe change les couleurs posées, la race change la silhouette', () => {
    expect(paint({ breed: 0, coat: 0 }).fills).not.toEqual(paint({ breed: 0, coat: 1 }).fills);
    expect(pts({ breed: 0, coat: 0 })).not.toEqual(pts({ breed: 1, coat: 0 }));
  });
});
