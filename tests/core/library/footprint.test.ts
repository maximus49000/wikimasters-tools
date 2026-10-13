import { describe, expect, it } from 'vitest';
import { drawRect, drawSize, floorCells, floorOffsets, frontFaceRect, isAngle, poisAt, rotateAngle } from '../../../src/core/library/footprint';
import { footOf, poisOf, sizeOf } from '../../../src/core/library/furniture-catalog';

const keys = (cells: { col: number; row: number }[]) => cells.map((c) => `${c.col}-${c.row}`).sort();
const ANGLES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

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

// Tailles tirées des modèles 3D : une colonne = 21 cm, une rangée de sol = 50 cm de profondeur.
describe('face et dos', () => {
  it('canapé 200 × 90 cm : 10 colonnes, 2 rangées au sol, même rectangle de dos', () => {
    expect(drawSize('sofa', 0)).toEqual({ w: 10, h: 6 });
    expect(drawSize('sofa', 4)).toEqual({ w: 10, h: 6 });
    const floor = floorOffsets('sofa', 0);
    expect(floor).toHaveLength(20);
    expect(floor.every((c) => c.row >= 4)).toBe(true);
  });
  it('étagère 80 × 30 cm : 4 colonnes, une seule rangée au sol (la dernière)', () => {
    expect(drawSize('shelf', 0)).toEqual({ w: 4, h: 10 });
    expect(keys(floorOffsets('shelf', 0))).toEqual(keys([0, 1, 2, 3].map((col) => ({ col, row: 9 }))));
  });
  it('le tapis occupe toute sa trace', () => {
    expect(drawSize('rug', 0)).toEqual({ w: 10, h: 3 });
    expect(floorOffsets('rug', 0)).toHaveLength(30);
  });
});

describe('profil', () => {
  it('canapé : 90 cm de large (4 colonnes), 200 cm de profondeur (4 rangées au sol)', () => {
    expect(drawSize('sofa', 2)).toEqual({ w: 4, h: 8 });
    expect(drawSize('sofa', 6)).toEqual({ w: 4, h: 8 });
    expect(floorOffsets('sofa', 2)).toHaveLength(16);
  });
  it('étagère : 30 cm de large (1 colonne), 80 cm de profondeur (2 rangées au sol)', () => {
    expect(drawSize('shelf', 2)).toEqual({ w: 1, h: 11 });
    expect(keys(floorOffsets('shelf', 2))).toEqual(['0-10', '0-9']);
  });
});

describe('diagonale', () => {
  it('canapé : escalier qui descend vers la droite à 1 (et 5), vers la gauche à 7 (et 3)', () => {
    expect(drawSize('sofa', 1)).toEqual({ w: 10, h: 9 });
    const one = floorOffsets('sofa', 1);
    expect(keys(one)).toEqual(keys([
      ...[2, 3, 4].map((col) => ({ col, row: 5 })),
      ...[1, 2, 3, 4, 5, 6].map((col) => ({ col, row: 6 })),
      ...[3, 4, 5, 6, 7, 8].map((col) => ({ col, row: 7 })),
      ...[6, 7].map((col) => ({ col, row: 8 })),
    ]));
    const seven = floorOffsets('sofa', 7);
    expect(keys(seven)).toEqual(keys(one.map((c) => ({ col: 9 - c.col, row: c.row }))));
    // La trace d'un rectangle est la même après un demi-tour.
    expect(keys(floorOffsets('sofa', 5))).toEqual(keys(one));
    expect(keys(floorOffsets('sofa', 3))).toEqual(keys(seven));
  });
});

describe('gamelle', () => {
  it('une seule case à tous les angles', () => {
    for (const a of ANGLES) {
      expect(drawSize('bowl', a)).toEqual({ w: 1, h: 1 });
      expect(floorOffsets('bowl', a)).toEqual([{ col: 0, row: 0 }]);
    }
  });
});

describe('positions absolues', () => {
  it('drawRect et floorCells décalent par (col, row)', () => {
    expect(drawRect('sofa', 2, 4, 13)).toEqual({ col: 4, row: 13, w: 4, h: 8 });
    expect(floorCells('bowl', 0, 5, 16)).toEqual([{ col: 5, row: 16 }]);
    expect(floorCells('charger', 0, 5, 16)).toEqual([{ col: 5, row: 17 }, { col: 6, row: 17 }]);
  });
  it('les cases rendues sont des copies (le cache ne se modifie pas)', () => {
    floorOffsets('chair', 0)[0]!.col = 99;
    expect(floorOffsets('chair', 0)[0]!.col).not.toBe(99);
  });
});

describe('catalogue dérivé des modèles', () => {
  it('sizeOf = rectangle de face, footOf = rangées au sol de face', () => {
    expect(sizeOf('sofa')).toEqual({ w: 10, h: 6 });
    expect(footOf('sofa')).toBe(2);
    expect(footOf('shelf')).toBe(1);
    expect(footOf('rug')).toBe(3);
    expect(poisOf('chair')).toEqual(poisAt('chair', 0));
  });
});

describe('points d’intérêt', () => {
  it('restent dans le rectangle de l’angle', () => {
    for (const kind of ['sofa', 'chair', 'kennel', 'basket', 'charger'] as const) {
      for (const a of ANGLES) {
        const { w, h } = drawSize(kind, a);
        for (const p of poisAt(kind, a)) {
          expect(p.dx).toBeGreaterThanOrEqual(0);
          expect(p.dx).toBeLessThan(w);
          expect(p.dy).toBeGreaterThanOrEqual(0);
          expect(p.dy).toBeLessThan(h);
        }
      }
    }
  });
  it('tirés du modèle : assise de la chaise de face', () => {
    expect(poisAt('chair', 0)).toEqual([{ type: 'seat', dx: 0, dy: 3 }]);
  });
});

describe('face visible', () => {
  const r = { x: 0, y: 0, w: 100, h: 200 };
  it('sans meuble (ancien calcul) : face entière à 0, 70 % à gauche à 1, à droite à 7, aucune sinon', () => {
    expect(frontFaceRect(0, r)).toEqual(r);
    expect(frontFaceRect(1, r)).toEqual({ x: 0, y: 20, w: 70, h: 180 });
    expect(frontFaceRect(7, r)).toEqual({ x: 30, y: 20, w: 70, h: 180 });
    for (const a of [2, 3, 4, 5, 6] as const) expect(frontFaceRect(a, r)).toBeNull();
  });
  it('avec le meuble : face projetée du modèle, mise à l’échelle et décalée dans le rectangle', () => {
    // Étagère de face : 4 × 10 cases = 120 × 283,3 px ; rectangle deux fois plus grand, décalé de (10, 20).
    const { w, h } = drawSize('shelf', 0);
    const big = { x: 10, y: 20, w: w * 30 * 2, h: h * (510 / 18) * 2 };
    const face = frontFaceRect(0, big, 'shelf')!;
    // Face du modèle : x 3 cm (+ 2 cm : 80 cm centrés dans 4 colonnes de 21 cm) → 5 × 30/21 px, largeur 74 cm → 74 × 30/21 px, × 2.
    expect(face.x).toBeCloseTo(10 + ((5 * 30) / 21) * 2);
    expect(face.w).toBeCloseTo(((74 * 30) / 21) * 2);
    expect(face.y + face.h).toBeLessThanOrEqual(big.y + big.h);
    expect(face.y).toBeGreaterThanOrEqual(big.y);
    for (const a of [2, 3, 4, 5, 6] as const) expect(frontFaceRect(a, big, 'shelf')).toBeNull();
    // À ¾ gauche, la face part du bord gauche et ne couvre pas tout le rectangle.
    const r1 = drawSize('shelf', 1);
    const q = frontFaceRect(1, { x: 0, y: 0, w: r1.w * 30, h: r1.h * (510 / 18) }, 'shelf')!;
    expect(q.x).toBeLessThan(15);
    expect(q.w).toBeLessThan(r1.w * 30);
  });
});
