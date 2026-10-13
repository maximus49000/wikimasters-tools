import { describe, expect, it } from 'vitest';
import { boxesOf, lampsOf, layoutSignature, rotatedPrims } from '../../../src/core/library/light/occluders';
import type { Layout } from '../../../src/core/library/library-types';
import { SURF, buildSurfaceMap } from '../../../src/core/library/light/surfaces';

const geom = { wallH: 340, floorH: 170 };
// Hauteur du rectangle du bureau (5 rangées) : les boîtes provisoires sont encore des fractions du rectangle.
const deskH = (510 / 18) * 5;

describe('boxesOf', () => {
  it('un bureau donne 5 boîtes dont un plateau', () => {
    const boxes = boxesOf([{ id: 'd', kind: 'desk', col: 2, row: 11 }], geom);
    expect(boxes).toHaveLength(5);
    const top = boxes[0]!;
    expect(top.z1).toBeCloseTo(deskH, 1);
    expect(top.x0).toBe(60);
    expect(top.x1).toBe(240);
  });
  it('le fond plein d’une étagère cache à la lumière le canapé posé derrière elle', () => {
    // Canapé (pieds en ligne 15) derrière une étagère posée plus bas (pieds en ligne 18) : le milieu d'une case montre l'étagère.
    const layout: Layout = [{ id: 'sofa', kind: 'sofa', col: 2, row: 12 }, { id: 'sh', kind: 'shelf', col: 5, row: 10 }];
    const boxes = boxesOf(layout, geom);
    const map = buildSurfaceMap(boxes, 720, 510, geom, 1);
    const shelfBack = Math.min(...boxes.filter((b) => b.owner === 'sh').map((b) => b.d0));
    // x = 190 (case de gauche de l'étagère, devant le canapé), y = 395 (case du milieu, à hauteur du canapé).
    const n = 395 * map.w + 190;
    expect(map.kind[n]).toBe(SURF.front);
    expect(map.d[n]).toBeGreaterThanOrEqual(shelfBack);
  });
  it('un tapis ne donne rien', () => {
    expect(boxesOf([{ id: 'r', kind: 'rug', col: 2, row: 12 }], geom)).toEqual([]);
  });
  it('une lampe donne 3 boîtes et une source, éteinte 3 boîtes sans source', () => {
    const on: Layout = [{ id: 'l', kind: 'lamp', col: 2, row: 8 }];
    const boxes = boxesOf(on, geom);
    expect(boxes).toHaveLength(3);
    const src = lampsOf(on, geom);
    expect(src).toHaveLength(1);
    expect(src[0]!.z).toBeCloseTo(0.92 * boxes[2]!.z1, 5);
    expect(src[0]!.box).toBe('l');
    const off: Layout = [{ id: 'l', kind: 'lamp', col: 2, row: 8, lit: false }];
    expect(boxesOf(off, geom)).toHaveLength(3);
    expect(lampsOf(off, geom)).toEqual([]);
  });
  it('une petite lampe repose sur le haut du bureau', () => {
    const l: Layout = [{ id: 'd', kind: 'desk', col: 2, row: 11 }, { id: 's', kind: 'small', item: 'lamp', hostId: 'd', slot: 0 }];
    const b = boxesOf(l, geom).filter((x) => x.owner === 's');
    expect(b).toHaveLength(1);
    expect(b[0]!.z0).toBeCloseTo(deskH, 5);
    expect(lampsOf(l, geom)).toHaveLength(1);
  });
  it('un ordinateur pose sa boîte sur le plateau', () => {
    const b = boxesOf([{ id: 'd', kind: 'desk', col: 2, row: 11 }, { id: 'c', kind: 'computer', deskId: 'd' }], geom).filter((x) => x.owner === 'c');
    expect(b).toHaveLength(1);
    expect(b[0]!.z0).toBeCloseTo(deskH, 5);
    expect(b[0]!.z1).toBeCloseTo(deskH + 56, 5);
  });
});

describe('layoutSignature', () => {
  const base: Layout = [{ id: 'l', kind: 'lamp', col: 2, row: 8 }];
  it('change quand la lampe s’éteint ou qu’un meuble bouge, pas sinon', () => {
    const s = layoutSignature(base, geom);
    expect(layoutSignature([...base], geom)).toBe(s);
    expect(layoutSignature([{ id: 'l', kind: 'lamp', col: 2, row: 8, lit: false }], geom)).not.toBe(s);
    expect(layoutSignature([{ id: 'l', kind: 'lamp', col: 5, row: 8 }], geom)).not.toBe(s);
  });
});

describe('rotatedPrims', () => {
  it('de profil, largeur et profondeur des primitives sont échangées', () => {
    const front = rotatedPrims('sofa', 0);
    const side = rotatedPrims('sofa', 2);
    expect(side).toHaveLength(front.length);
    // le dossier (profondeur 0,7→1 depuis l'avant) passe à droite, sur toute la largeur du profil
    expect(side[1]).toEqual([0.7, 1, 0.5, 1, 0, 1]);
  });
});
