import { describe, expect, it } from 'vitest';
import { drawRect, drawSize, floorCells, floorOffsets, frontFaceRect, isAngle, poisAt, rotateAngle } from '../../../src/core/library/footprint';

const keys = (cells: { col: number; row: number }[]) => cells.map((c) => `${c.col}-${c.row}`).sort();

describe('angles', () => {
  it('tourne modulo 8', () => {
    expect(rotateAngle(0, 1)).toBe(1);
    expect(rotateAngle(0, -1)).toBe(7);
    expect(rotateAngle(7, 1)).toBe(0);
  });
  it('reconnaît un angle valide', () => {
    expect([0, 3, 7].every(isAngle)).toBe(true);
    expect([8, -1, 1.5, '2', null].some(isAngle)).toBe(false);
  });
});

describe('face et dos', () => {
  it('gardent le rectangle et les rangées du pied', () => {
    expect(drawSize('sofa', 0)).toEqual({ w: 6, h: 3 });
    expect(drawSize('sofa', 4)).toEqual({ w: 6, h: 3 });
    // étagère 6×8, pied 2 : les deux rangées du bas
    expect(floorOffsets('shelf', 0)).toHaveLength(12);
    expect(floorOffsets('shelf', 0).every((c) => c.row >= 6)).toBe(true);
  });
  it('le tapis occupe tout son rectangle', () => {
    expect(floorOffsets('rug', 0)).toHaveLength(18);
  });
});

describe('profil', () => {
  it('canapé 6×3 pied 3 → 3 colonnes × 3 lignes au sol', () => {
    expect(drawSize('sofa', 2)).toEqual({ w: 3, h: 3 });
    expect(floorOffsets('sofa', 2)).toHaveLength(9);
    expect(drawSize('sofa', 6)).toEqual({ w: 3, h: 3 });
  });
  it('étagère 6×8 pied 2 → 2 colonnes, 3 lignes au sol, 9 de haut', () => {
    expect(drawSize('shelf', 2)).toEqual({ w: 2, h: 9 });
    expect(floorOffsets('shelf', 2).every((c) => c.row >= 6)).toBe(true);
  });
});

describe('diagonale', () => {
  it('escalier qui descend vers la droite pour 1 et 3, vers la gauche pour 5 et 7', () => {
    // canapé : largeur 7, 3 lignes au sol, segments de 4 cases
    expect(drawSize('sofa', 1)).toEqual({ w: 7, h: 3 });
    const one = floorOffsets('sofa', 1);
    expect(keys(one)).toEqual(keys([
      ...[0, 1, 2, 3].map((c) => ({ col: c, row: 0 })),
      ...[2, 3, 4, 5].map((c) => ({ col: c, row: 1 })),
      ...[3, 4, 5, 6].map((c) => ({ col: c, row: 2 })),
    ]));
    const seven = floorOffsets('sofa', 7);
    expect(keys(seven)).toEqual(keys(one.map((c) => ({ col: 6 - c.col, row: c.row }))));
    expect(keys(floorOffsets('sofa', 3))).toEqual(keys(one));
    expect(keys(floorOffsets('sofa', 5))).toEqual(keys(seven));
  });
});

describe('positions absolues', () => {
  it('drawRect et floorCells décalent par (col, row)', () => {
    expect(drawRect('sofa', 2, 4, 13)).toEqual({ col: 4, row: 13, w: 3, h: 3 });
    expect(floorCells('bowl', 0, 5, 16)).toEqual([{ col: 5, row: 16 }, { col: 6, row: 16 }]);
  });
});

describe('points d’intérêt', () => {
  it('restent dans le rectangle de l’angle', () => {
    for (const a of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
      const { w, h } = drawSize('sofa', a);
      for (const p of poisAt('sofa', a)) {
        expect(p.dx).toBeGreaterThanOrEqual(0);
        expect(p.dx).toBeLessThan(w);
        expect(p.dy).toBeGreaterThanOrEqual(0);
        expect(p.dy).toBeLessThan(h);
      }
    }
  });
  it('face : inchangés', () => {
    expect(poisAt('chair', 0)).toEqual([{ type: 'seat', dx: 1, dy: 1 }]);
  });
});

describe('face visible', () => {
  const r = { x: 0, y: 0, w: 100, h: 200 };
  it('face entière à 0, 70 % à gauche à 1, à droite à 7, aucune sinon', () => {
    expect(frontFaceRect(0, r)).toEqual(r);
    expect(frontFaceRect(1, r)).toEqual({ x: 0, y: 20, w: 70, h: 180 });
    expect(frontFaceRect(7, r)).toEqual({ x: 30, y: 20, w: 70, h: 180 });
    for (const a of [2, 3, 4, 5, 6] as const) expect(frontFaceRect(a, r)).toBeNull();
  });
});
