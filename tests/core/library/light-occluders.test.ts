import { describe, expect, it } from 'vitest';
import { boxesOf, kOf, lampsOf, layoutSignature } from '../../../src/core/library/light/occluders';
import type { Layout } from '../../../src/core/library/library-types';
import { SURF, buildSurfaceMap } from '../../../src/core/library/light/surfaces';
import { DEPTH_PX_PER_CM, PX_PER_CM_X, PX_PER_CM_Y } from '../../../src/core/library/furniture-render3d';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { COMPUTER_H, computerRectOn, pxRect, rectOf, surfaceSlotRectOn } from '../../../src/core/library/room-grid';

const geom = { wallH: 340, floorH: 170 };
// Dessus du bureau (75 cm) en px de hauteur, et bord avant d'un meuble dont le rectangle commence en `row` (bas en row + rows).
const deskTop = 75 * PX_PER_CM_Y;
const dFrontOf = (row: number, rows: number): number => ((row + rows) * (510 / 18) - geom.wallH) / kOf(geom);

describe('boxesOf', () => {
  it('un bureau donne une boîte par pièce de son modèle : plateau en haut, sur toute la largeur et la profondeur', () => {
    const boxes = boxesOf([{ id: 'd', kind: 'desk', col: 2, row: 11 }], geom);
    expect(boxes).toHaveLength(FURNITURE_MODELS.desk.pieces.length);
    const top = boxes.find((b) => b.z1 > deskTop - 1e-6)!;
    expect(top.z1).toBeCloseTo(deskTop, 6);
    expect(top.z0).toBeCloseTo(72 * PX_PER_CM_Y, 6);
    // 120 cm centrés dans 6 colonnes (180 px) en x = 60.
    const off = (180 - 120 * PX_PER_CM_X) / 2;
    expect(top.x0).toBeCloseTo(60 + off, 6);
    expect(top.x1).toBeCloseTo(240 - off, 6);
    const dFront = dFrontOf(11, 5);
    expect(top.d1).toBeCloseTo(dFront, 6);
    expect(top.d0).toBeCloseTo(dFront - (60 * DEPTH_PX_PER_CM) / kOf(geom), 6);
  });
  it('de profil, l’étagère est étroite et profonde : largeur et profondeur échangées', () => {
    const face = boxesOf([{ id: 's', kind: 'shelf', col: 2, row: 7 }], geom);
    const side = boxesOf([{ id: 's', kind: 'shelf', col: 2, row: 6, angle: 2 }], geom);
    const span = (bs: typeof face, a: 'x' | 'd') => Math.max(...bs.map((b) => b[`${a}1`])) - Math.min(...bs.map((b) => b[`${a}0`]));
    const k = kOf(geom);
    expect(span(face, 'x')).toBeCloseTo(80 * PX_PER_CM_X, 6);
    expect(span(face, 'd')).toBeCloseTo((30 * DEPTH_PX_PER_CM) / k, 6);
    expect(span(side, 'x')).toBeCloseTo(30 * PX_PER_CM_X, 6);
    expect(span(side, 'd')).toBeCloseTo((80 * DEPTH_PX_PER_CM) / k, 6);
  });
  it('le fond plein d’une étagère cache à la lumière le canapé posé derrière elle', () => {
    // Canapé (pied en lignes 14-15) derrière une étagère posée plus bas (rangées 8 à 17, pied en ligne 17) : le milieu de l'étagère montre son fond.
    const layout: Layout = [{ id: 'sofa', kind: 'sofa', col: 2, row: 10 }, { id: 'sh', kind: 'shelf', col: 5, row: 8 }];
    const boxes = boxesOf(layout, geom);
    const map = buildSurfaceMap(boxes, 720, 510, geom, 1);
    const shelfBack = Math.min(...boxes.filter((b) => b.owner === 'sh').map((b) => b.d0));
    // x = 190 (milieu de l'étagère, devant le canapé), y = 395 (entre deux tablettes, à hauteur du dossier du canapé).
    const n = 395 * map.w + 190;
    expect(map.kind[n]).toBe(SURF.front);
    expect(map.d[n]).toBeGreaterThanOrEqual(shelfBack);
  });
  it('un tapis ne donne rien', () => {
    expect(boxesOf([{ id: 'r', kind: 'rug', col: 2, row: 12 }], geom)).toEqual([]);
  });
  it('une lampe donne 4 boîtes et une source dans l’abat-jour ; éteinte, 4 boîtes sans source', () => {
    const on: Layout = [{ id: 'l', kind: 'lamp', col: 2, row: 8 }];
    const boxes = boxesOf(on, geom);
    expect(boxes).toHaveLength(4);
    const src = lampsOf(on, geom);
    expect(src).toHaveLength(1);
    const shade = boxes.reduce((a, b) => (b.z1 > a.z1 ? b : a));
    expect(src[0]!.z).toBeGreaterThan(shade.z0);
    expect(src[0]!.z).toBeLessThan(shade.z1);
    expect(src[0]!.x).toBeCloseTo((shade.x0 + shade.x1) / 2, 6);
    expect(src[0]!.d).toBeCloseTo((shade.d0 + shade.d1) / 2, 6);
    expect(src[0]!.box).toBe('l');
    const off: Layout = [{ id: 'l', kind: 'lamp', col: 2, row: 8, lit: false }];
    expect(boxesOf(off, geom)).toHaveLength(4);
    expect(lampsOf(off, geom)).toEqual([]);
  });
  it('une petite lampe repose sur le dessus du bureau, sur son emplacement, à mi-profondeur', () => {
    const l: Layout = [{ id: 'd', kind: 'desk', col: 2, row: 11 }, { id: 's', kind: 'small', item: 'lamp', hostId: 'd', slot: 0 }];
    const b = boxesOf(l, geom).filter((x) => x.owner === 's');
    expect(b).toHaveLength(1);
    expect(b[0]!.z0).toBeCloseTo(deskTop, 6);
    const slot = surfaceSlotRectOn(pxRect(rectOf(l[0]!)!), 'desk', 0, 0);
    expect((b[0]!.x0 + b[0]!.x1) / 2).toBeCloseTo(slot.x + slot.w / 2, 6);
    const mid = dFrontOf(11, 5) - (30 * DEPTH_PX_PER_CM) / kOf(geom);
    expect((b[0]!.d0 + b[0]!.d1) / 2).toBeCloseTo(mid, 6);
    const src = lampsOf(l, geom);
    expect(src).toHaveLength(1);
    expect(src[0]!.z).toBeGreaterThan(deskTop);
  });
  it('un ordinateur pose sa boîte sur le plateau, sous l’écran dessiné (bureau tourné compris)', () => {
    const l: Layout = [{ id: 'd', kind: 'desk', col: 2, row: 11, angle: 1 }, { id: 'c', kind: 'computer', deskId: 'd' }];
    const b = boxesOf(l, geom).filter((x) => x.owner === 'c');
    expect(b).toHaveLength(1);
    expect(b[0]!.z0).toBeCloseTo(deskTop, 6);
    expect(b[0]!.z1).toBeCloseTo(deskTop + COMPUTER_H - 2, 6);
    const c = computerRectOn(pxRect(rectOf(l[0]!)!), 1);
    expect(b[0]!.x0).toBeCloseTo(c.x, 6);
    expect(b[0]!.x1).toBeCloseTo(c.x + c.w, 6);
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
  it('change quand un meuble tourne', () => {
    const sofa: Layout = [{ id: 's', kind: 'sofa', col: 2, row: 9 }];
    expect(layoutSignature([{ id: 's', kind: 'sofa', col: 2, row: 9, angle: 1 }], geom)).not.toBe(layoutSignature(sofa, geom));
  });
});
