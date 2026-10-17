import { describe, expect, it } from 'vitest';
import { parseLibraryState } from '../../../src/core/library/library-book';
import type { Layout } from '../../../src/core/library/library-types';
import {
  canPlaceComputer,
  hasFreeHost,
  moveSmall,
  placeSmall,
  removeFurniture,
  shiftLayout,
  pxRect,
  topRectOn,
} from '../../../src/core/library/room-grid';
import { computerTopRect, firstFreeTopSpot, topRectsOf, topsApart } from '../../../src/core/library/surface';
import { drawSize, frontFaceRect, type Angle } from '../../../src/core/library/footprint';

const base: Layout = [
  { id: 'f1', kind: 'desk', col: 2, row: 14 },
  { id: 'f2', kind: 'shelf', col: 12, row: 10 },
];
// Dessus d'étagère (80 × 30 cm) rempli de 10 plantes de 15 × 15 : il reste une bande de 5 cm, trop étroite pour tout petit objet.
const fullShelf = (layout: Layout, hostId = 'f2'): Layout => [
  ...layout,
  ...Array.from({ length: 10 }, (_, i): Layout[number] => ({ id: `e${i}`, kind: 'small', item: 'plant', hostId, x: (i % 5) * 15, z: Math.floor(i / 5) * 15 })),
];

describe('plateaux en cm', () => {
  it('pose à la première place libre (de l’avant vers le fond, de gauche à droite)', () => {
    const one = placeSmall(base, 'f1', 'plant', 'f3')!;
    expect(one.find((p) => p.id === 'f3')).toEqual({ id: 'f3', kind: 'small', item: 'plant', hostId: 'f1', x: 0, z: 0 });
    const two = placeSmall(one, 'f1', 'lamp', 'f4')!;
    expect(two.find((p) => p.id === 'f4')).toMatchObject({ x: 16, z: 0 });
  });

  it('refuse quand le porteur est plein ou n’en est pas un', () => {
    const layout = fullShelf(base);
    expect(firstFreeTopSpot(layout, 'f2', { item: 'alarm' })).toBeNull();
    expect(placeSmall(layout, 'f2', 'plant', 'sx')).toBeNull();
    expect(placeSmall(base, 'inconnu', 'plant', 'sx')).toBeNull();
  });

  it('les petits objets ne se posent jamais sur l’empreinte de l’écran', () => {
    let layout: Layout = [...base, { id: 'f9', kind: 'computer', deskId: 'f1' }];
    for (let i = 0; i < 40; i++) layout = placeSmall(layout, 'f1', 'plant', `p${i}`) ?? layout;
    const screen = computerTopRect();
    const rects = topRectsOf(layout, 'f1').filter((r) => r !== screen);
    expect(rects.length).toBeGreaterThan(15);
    for (const r of rects) expect(topsApart(r, screen)).toBe(true);
    expect(placeSmall(layout, 'f1', 'plant', 'trop')).toBeNull();
  });

  it('refuse un ordinateur sur un bureau dont l’emplacement de l’écran est pris', () => {
    const layout: Layout = [...base, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', x: 40, z: 35 }];
    expect(canPlaceComputer(layout, 'f1')).toBe(false);
    const edge: Layout = [...base, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', x: 7.5, z: 22.5 }];
    expect(canPlaceComputer(edge, 'f1')).toBe(true);
    // Une petite plante à l'ancien emplacement 1 (mi-profondeur) laisse la place à l'écran, posé vers le fond.
    expect(canPlaceComputer([...base, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', x: 37.5, z: 22.5 }], 'f1')).toBe(true);
  });

  it('hasFreeHost dit s’il reste une place quelque part', () => {
    expect(hasFreeHost([])).toBe(false);
    expect(hasFreeHost(base)).toBe(true);
    expect(hasFreeHost(fullShelf([base[1]!]))).toBe(false);
  });
});

describe('déplacer un petit objet', () => {
  const layout: Layout = [...base, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', x: 67.5, z: 22.5 }];

  it('garde sa place sur le même porteur', () => {
    expect(moveSmall(layout, 's', 'f1')!.find((p) => p.id === 's')).toEqual({ id: 's', kind: 'small', item: 'plant', hostId: 'f1', x: 67.5, z: 22.5 });
  });

  it('prend la première place libre d’un autre porteur', () => {
    expect(moveSmall(layout, 's', 'f2')!.find((p) => p.id === 's')).toMatchObject({ hostId: 'f2', x: 0, z: 0 });
  });

  it('garde son réglage (lampe éteinte) en changeant de porteur', () => {
    const lamp: Layout = [...base, { id: 'l', kind: 'small', item: 'lamp', hostId: 'f1', x: 0, z: 0, lit: false }];
    expect(moveSmall(lamp, 'l', 'f2')!.find((p) => p.id === 'l')).toEqual({ id: 'l', kind: 'small', item: 'lamp', hostId: 'f2', x: 0, z: 0, lit: false });
  });

  it('refuse un porteur inconnu ou plein', () => {
    expect(moveSmall(layout, 's', 'x')).toBeNull();
    expect(moveSmall(fullShelf(layout), 's', 'f2')).toBeNull();
  });
});

describe('retrait et décalage', () => {
  it('retirer un porteur retire ses petits objets et ses cartes posées', () => {
    const layout: Layout = [...base, { id: 's', kind: 'small', item: 'lamp', hostId: 'f2', x: 0, z: 0 }, { id: 'c', kind: 'posed', shape: 'cd', hostId: 'f2', x: 20, z: 0, slug: 'Paris' }];
    expect(removeFurniture(layout, 'f2').map((p) => p.id)).toEqual(['f1']);
  });

  it('décaler la pièce ne touche pas les petits objets', () => {
    const small = { id: 's', kind: 'small', item: 'lamp', hostId: 'f2', x: 5.833333333333334, z: 7.5 } as const;
    expect(shiftLayout([...base, small], 12).find((p) => p.id === 's')).toEqual(small);
  });
});

describe('visée du plateau projeté du porteur', () => {
  const rectFor = (kind: 'desk' | 'shelf', angle: Angle) => pxRect({ col: 2, row: 6, ...drawSize(kind, angle) });
  it('le plateau d’une étagère est sur son dessus, de gauche à droite de face, inversé de dos', () => {
    const shelf = rectFor('shelf', 0);
    const face = frontFaceRect(0, shelf, 'shelf')!;
    const whole = topRectOn(shelf, 'shelf', 0, { x: 0, z: 0, w: 80, d: 30 });
    expect(whole.y + whole.h).toBeGreaterThan(shelf.y);
    expect(whole.y + whole.h).toBeLessThan(face.y);
    expect(whole.h).toBeGreaterThanOrEqual(42);
    const left = topRectOn(shelf, 'shelf', 0, { x: 0, z: 10, w: 15, d: 15 });
    const right = topRectOn(shelf, 'shelf', 0, { x: 60, z: 10, w: 15, d: 15 });
    expect(left.x).toBeLessThan(right.x);
    for (const r of [left, right]) {
      expect(r.x).toBeGreaterThanOrEqual(whole.x);
      expect(r.x + r.w).toBeLessThanOrEqual(whole.x + whole.w + 1e-9);
    }
    const back = rectFor('shelf', 4);
    expect(topRectOn(back, 'shelf', 4, { x: 0, z: 10, w: 15, d: 15 }).x).toBeGreaterThan(topRectOn(back, 'shelf', 4, { x: 60, z: 10, w: 15, d: 15 }).x);
  });
});

describe('lecture : nettoyage des petits objets', () => {
  const state = (layout: unknown[]) => ({
    version: 5,
    weather: { mode: 'random' },
    time: { mode: 'real' },
    activeRoomId: 'r1',
    homeRoomId: null,
    rooms: [{ id: 'r1', name: 'Salon', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, layout, pets: [] }],
  });
  const readLayout = (layout: unknown[]) => parseLibraryState(state(layout)).rooms[0]!.layout;
  const read = (layout: unknown[]) => readLayout(layout).map((p) => p.id);
  const host = [{ id: 'f1', kind: 'desk', col: 2, row: 14 }, { id: 'f2', kind: 'shelf', col: 12, row: 10 }];

  it('garde un petit objet valide', () => {
    expect(read([...host, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', x: 97.5, z: 22.5 }])).toContain('s');
  });

  it('ignore un petit objet sans porteur ; replace celui qui dépasse du plateau ou chevauche un autre', () => {
    const layout = readLayout([
      ...host,
      { id: 'a', kind: 'small', item: 'plant', hostId: 'absent', slot: 0 },
      { id: 'b', kind: 'small', item: 'plant', hostId: 'f2', x: 85.83333333333333, z: 7.5 },
      { id: 'c', kind: 'small', item: 'lamp', hostId: 'f1', x: 7.5, z: 22.5 },
      { id: 'd', kind: 'small', item: 'lamp', hostId: 'f1', x: 7.5, z: 22.5 },
    ]);
    expect(layout.map((p) => p.id)).toEqual(['f1', 'f2', 'b', 'c', 'd']);
    expect(layout[2]).toMatchObject({ hostId: 'f2', x: 0, z: 0 });
    expect(layout[3]).toMatchObject({ x: 7.5, z: 22.5 });
    expect(layout[4]).toMatchObject({ x: 0, z: 0 });
  });

  it('replace un petit objet posé sur l’empreinte de l’écran', () => {
    const layout = readLayout([...host, { id: 'pc', kind: 'computer', deskId: 'f1' }, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', x: 40, z: 40 }]);
    expect(layout.find((p) => p.id === 's')).toMatchObject({ x: 0, z: 0 });
  });
});
