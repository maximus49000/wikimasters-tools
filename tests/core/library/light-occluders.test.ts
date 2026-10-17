import { describe, expect, it } from 'vitest';
import { boxesOf, kOf, lampsOf, signatureOf } from '../../../src/core/library/light/occluders';
import type { Layout } from '../../../src/core/library/library-types';
import { SURF, buildSurfaceMap } from '../../../src/core/library/light/surfaces';
import { DEPTH_PX_PER_CM, PX_PER_CM_X, PX_PER_CM_Y } from '../../../src/core/library/furniture-render3d';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { pxRect, rectOf, topRectOn } from '../../../src/core/library/room-grid';
import { computerPlacement, placementRectPx } from '../../../src/core/library/carried-items';
import { ITEM_MODELS } from '../../../src/core/library/item-models';
import { drawSize } from '../../../src/core/library/footprint';

const geom = { wallH: 340, floorH: 170 };
// Dessus du bureau (75 cm) en px de hauteur, et bord avant d'un meuble dont le rectangle commence en `row` (bas en row + rows).
const deskTop = 75 * PX_PER_CM_Y;
const dFrontOf = (row: number, rows: number): number => ((row + rows) * (510 / 18) - geom.wallH) / kOf(geom);

describe('nouvelles lampes', () => {
  it('la lanterne et le lampadaire arc allumés sont des sources ; éteints, non', () => {
    const on: Layout = [{ id: 'l1', kind: 'paper-lantern', col: 2, row: 14 }, { id: 'l2', kind: 'arc-lamp', col: 6, row: 7 }];
    expect(lampsOf(on, geom).map((l) => l.id).sort()).toEqual(['l1', 'l2']);
    expect(lampsOf(on.map((p) => ({ ...p, lit: false })) as Layout, geom)).toEqual([]);
  });
});

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
  it('une petite lampe repose sur le dessus du bureau, sur son emplacement, à mi-profondeur, à la taille de son modèle', () => {
    const l: Layout = [{ id: 'd', kind: 'desk', col: 2, row: 11 }, { id: 's', kind: 'small', item: 'lamp', hostId: 'd', x: 7.5, z: 22.5 }];
    const b = boxesOf(l, geom).filter((x) => x.owner === 's');
    expect(b.length).toBeGreaterThan(0);
    const [z0, z1] = [Math.min(...b.map((x) => x.z0)), Math.max(...b.map((x) => x.z1))];
    expect(z0).toBeCloseTo(deskTop, 6);
    // Jusqu'au haut de l'abat-jour (l'embout, minuscule, ne compte pas pour la lumière).
    expect(z1).toBeGreaterThan(deskTop + 28 * PX_PER_CM_Y);
    expect(z1).toBeLessThanOrEqual(deskTop + ITEM_MODELS['small-lamp'].h * PX_PER_CM_Y + 1e-6);
    const slot = topRectOn(pxRect(rectOf(l[0]!)!), 'desk', 0, { x: 7.5, z: 22.5, w: 15, d: 15 });
    const [x0, x1] = [Math.min(...b.map((x) => x.x0)), Math.max(...b.map((x) => x.x1))];
    expect((x0 + x1) / 2).toBeCloseTo(slot.x + slot.w / 2, 6);
    const [d0, d1] = [Math.min(...b.map((x) => x.d0)), Math.max(...b.map((x) => x.d1))];
    const mid = dFrontOf(11, 5) - (30 * DEPTH_PX_PER_CM) / kOf(geom);
    expect((d0 + d1) / 2).toBeCloseTo(mid, 6);
    const src = lampsOf(l, geom);
    expect(src).toHaveLength(1);
    // Ampoule dans l'abat-jour du modèle.
    expect(src[0]!.z).toBeGreaterThan(deskTop + 17.5 * PX_PER_CM_Y);
    expect(src[0]!.z).toBeLessThan(z1);
  });
  it('un ordinateur pose les boîtes de son écran 3D sur le plateau (bureau tourné compris), aussi large que son dessin', () => {
    const l: Layout = [{ id: 'd', kind: 'desk', col: 2, row: 11, angle: 1 }, { id: 'c', kind: 'computer', deskId: 'd' }];
    const b = boxesOf(l, geom).filter((x) => x.owner === 'c');
    expect(b.length).toBeGreaterThan(0);
    expect(Math.min(...b.map((x) => x.z0))).toBeCloseTo(deskTop, 6);
    expect(Math.max(...b.map((x) => x.z1))).toBeCloseTo(deskTop + ITEM_MODELS.monitor.h * PX_PER_CM_Y, 6);
    const drawn = placementRectPx('desk', 1, pxRect(rectOf(l[0]!)!), computerPlacement('c'));
    // Dans le rectangle de son dessin (8 coins de son encombrement), presque aussi large.
    const [x0, x1] = [Math.min(...b.map((x) => x.x0)), Math.max(...b.map((x) => x.x1))];
    expect(x0).toBeGreaterThanOrEqual(drawn.x - 0.5);
    expect(x1).toBeLessThanOrEqual(drawn.x + drawn.w + 0.5);
    expect(x1 - x0).toBeGreaterThan(drawn.w * 0.8);
  });
  it('les objets rangés d’une tablette font une boîte (de leur premier au dernier, à la hauteur du plus haut) ; de profil, aucune', () => {
    const items: Layout = [
      { id: 'a', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'x' },
      { id: 'b', kind: 'stored', shape: 'book', shelfId: 's', level: 0, order: 1, slug: 'y' },
      { id: 'c', kind: 'stored', shape: 'dvd', shelfId: 's', level: 2, order: 0, slug: 'z' },
    ];
    const boxes = boxesOf([{ id: 's', kind: 'shelf', col: 2, row: 7 }, ...items], geom);
    const top = boxes.filter((x) => x.owner === 's#0');
    const low = boxes.filter((x) => x.owner === 's#2');
    expect(top).toHaveLength(1);
    expect(low).toHaveLength(1);
    expect(top[0]!.z0).toBeCloseTo(121 * PX_PER_CM_Y, 6);
    expect(top[0]!.z1).toBeCloseTo((121 + 23) * PX_PER_CM_Y, 6); // le livre, plus haut que le CD
    // Du bord gauche de la face (3 cm) à la fin du livre (3 + 14 + 1 + 3 = 21 cm), centrés dans l'étagère.
    const sw = drawSize('shelf', 0).w * 30;
    const off = (sw - 80 * PX_PER_CM_X) / 2;
    expect(top[0]!.x0).toBeCloseTo(60 + off + 3 * PX_PER_CM_X, 6);
    expect(top[0]!.x1).toBeCloseTo(60 + off + 21 * PX_PER_CM_X, 6);
    // Près du bord avant : de 2 cm à 17 cm (le livre sur la tranche, 15 cm de profondeur), pas jusqu'au fond.
    expect(top[0]!.d1 - top[0]!.d0).toBeCloseTo((15 * DEPTH_PX_PER_CM) / kOf(geom), 6);
    expect(top[0]!.d1).toBeCloseTo(dFrontOf(7, drawSize('shelf', 0).h) - (2 * DEPTH_PX_PER_CM) / kOf(geom), 6);
    expect(boxes.some((x) => x.owner === 's#1')).toBe(false);
    const side = boxesOf([{ id: 's', kind: 'shelf', col: 2, row: 7, angle: 2 }, ...items], geom);
    expect(side.some((x) => x.owner.startsWith('s#'))).toBe(false);
  });
});

describe('signatureOf', () => {
  const layoutSignature = (layout: Layout, g: typeof geom): string => signatureOf(boxesOf(layout, g), lampsOf(layout, g));
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
