import { afterEach, describe, expect, it } from 'vitest';
import { boardTopCm, carriedPlacementOf } from '../../../src/core/library/carried-items';
import { ITEM_MODELS } from '../../../src/core/library/item-models';
import { boxesOf, lampsOf } from '../../../src/core/library/light/occluders';
import { createInitialState, parseLibraryState } from '../../../src/core/library/library-book';
import type { Layout, Placed, ShelfLevel, SmallOnBoard } from '../../../src/core/library/library-types';
import {
  SHELF_FULL_MESSAGE, boardClearCm, boardHeightCm, boardItems, boardUsedCm, boardWidthCm, dropOnShelf, firstFreeBoard, isLamp, moveStored, moveToBoard, moveToTop,
  placeStanding, removeFurniture, shelfLayoutOf, storeCard,
} from '../../../src/core/library/room-grid';

type Stored = Extract<Placed, { kind: 'stored' }>;
const shelf = placeStanding([], 24, 'shelf', 0, 7, 'f1')!;
const cd = (i: number, level: ShelfLevel, order: number, shelfId = 'f1'): Stored => ({ id: `c${i}`, kind: 'stored', shape: 'cd', shelfId, level, order, slug: `S${i}` });
const lamp = (level: ShelfLevel, order: number, hostId = 'f1'): SmallOnBoard => ({ id: 'l', kind: 'small', item: 'lamp', hostId, level, order });
const order = (layout: Layout, level: ShelfLevel, shelfId = 'f1') => boardItems(layout, shelfId, level).map((p) => [p.id, p.order]);

describe('tablettes mixtes : cartes et petits objets', () => {
  it('CD (14) + lampe (15) : 30 cm occupés, la lampe à 15 cm du bord gauche', () => {
    const layout: Layout = [...shelf, cd(0, 1, 0), lamp(1, 1)];
    expect(boardItems(layout, 'f1', 1).map((p) => p.id)).toEqual(['c0', 'l']);
    expect(boardWidthCm({ item: 'lamp' })).toBe(15);
    expect(boardHeightCm({ item: 'lamp' })).toBe(30);
    expect(boardHeightCm({ shape: 'dvd' })).toBe(19);
    expect(boardUsedCm(boardItems(layout, 'f1', 1))).toBe(30);
    expect(shelfLayoutOf(layout, 'f1').find((b) => b.id === 'l')).toMatchObject({ level: 1, order: 1, x0Cm: 15, wCm: 15 });
  });

  it('hauteur libre de chaque tablette, lue dans le modèle : 56, 57, 50 cm', () => {
    expect([boardClearCm(0), boardClearCm(1), boardClearCm(2)]).toEqual([56, 57, 50]);
  });

  describe('dropOnShelf', () => {
    const plantH = ITEM_MODELS['small-plant'].h;
    afterEach(() => {
      ITEM_MODELS['small-plant'].h = plantH;
    });

    it('au-delà de 74 cm : « shelf-full » ; à 74 cm tout juste : accepté', () => {
      // 4 CD = 59 cm : la lampe (1 + 15) ferait 75 cm.
      const four: Layout = [...shelf, cd(0, 0, 0), cd(1, 0, 1), cd(2, 0, 2), cd(3, 0, 3)];
      expect(dropOnShelf(four, 'f1', 0, 999, { item: 'lamp' })).toEqual({ ok: false, reason: 'shelf-full', message: SHELF_FULL_MESSAGE });
      // 3 CD + lampe = 44 + 1 + 15 = 60 cm.
      expect(dropOnShelf(four.slice(0, -1), 'f1', 0, 999, { item: 'lamp' })).toEqual({ ok: true, order: 3 });
      // Lampe + 4 CD de face = 15 + 4 × 15 = 75 cm : le CD est refusé à son tour.
      expect(dropOnShelf([...shelf, lamp(0, 0), cd(0, 0, 1), cd(1, 0, 2), cd(2, 0, 3)], 'f1', 0, 999, { shape: 'cd' })).toMatchObject({ ok: false, reason: 'shelf-full' });
    });

    it('plus haut que la hauteur libre : « too-high » ; la chaîne hi-fi : refusée', () => {
      ITEM_MODELS['small-plant'].h = 51;
      expect(dropOnShelf(shelf, 'f1', 2, 0, { item: 'plant' })).toMatchObject({ ok: false, reason: 'too-high' });
      expect(dropOnShelf(shelf, 'f1', 1, 0, { item: 'plant' })).toEqual({ ok: true, order: 0 });
      expect(firstFreeBoard(shelf, 'f1', { item: 'plant' })).toEqual({ level: 0, order: 0 });
      ITEM_MODELS['small-plant'].h = 57.5;
      expect(firstFreeBoard(shelf, 'f1', { item: 'plant' })).toBeNull();
      expect(dropOnShelf(shelf, 'f1', 0, 0, { item: 'hifi' })).toMatchObject({ ok: false, reason: 'not-shelf' });
      expect(firstFreeBoard(shelf, 'f1', { item: 'hifi' })).toBeNull();
    });
  });

  it('tablette qui débordait : rien n’est retiré à la lecture, un objet déjà dessus peut changer de rang', () => {
    // 5 CD (74 cm) + la lampe : 90 cm.
    const over: Layout = [...shelf, cd(0, 0, 0), cd(1, 0, 1), cd(2, 0, 2), cd(3, 0, 3), cd(4, 0, 4), lamp(0, 5)];
    const state = createInitialState();
    const raw = JSON.parse(JSON.stringify({ ...state, rooms: [{ ...state.rooms[0]!, layout: over }] }));
    const read = parseLibraryState(raw).rooms[0]!.layout;
    expect(order(read, 0)).toEqual([['c0', 0], ['c1', 1], ['c2', 2], ['c3', 3], ['c4', 4], ['l', 5]]);
    expect(dropOnShelf(read, 'f1', 0, 0, { id: 'l', item: 'lamp' })).toEqual({ ok: true, order: 0 });
    const moved = moveToBoard(read, 'l', 'f1', 0, 0)!;
    expect(order(moved, 0)).toEqual([['l', 0], ['c0', 1], ['c1', 2], ['c2', 3], ['c3', 4], ['c4', 5]]);
    // Un nouvel objet, lui, n'y entre pas.
    expect(moveToBoard([...read, cd(9, 1, 0)], 'c9', 'f1', 0, 0)).toBeNull();
  });

  it('moveToBoard d’une lampe du dessus : tablette 1, rang 0, plus de x/z, voisins décalés', () => {
    const layout: Layout = [...shelf, cd(0, 1, 0), cd(1, 1, 1), { id: 'l', kind: 'small', item: 'lamp', hostId: 'f1', x: 4, z: 2, lit: false }];
    const next = moveToBoard(layout, 'l', 'f1', 1, 0)!;
    expect(next.find((p) => p.id === 'l')).toEqual({ id: 'l', kind: 'small', item: 'lamp', hostId: 'f1', level: 1, order: 0, lit: false });
    expect(order(next, 1)).toEqual([['l', 0], ['c0', 1], ['c1', 2]]);
  });

  it('moveToBoard d’une chaîne hi-fi : refusé', () => {
    const layout: Layout = [...shelf, { id: 'd1', kind: 'desk', col: 12, row: 12 }, { id: 'h', kind: 'small', item: 'hifi', hostId: 'd1', x: 0, z: 0 }];
    expect(moveToBoard(layout, 'h', 'f1', 1, 0)).toBeNull();
  });

  it('moveToBoard d’une carte posée : elle devient rangée (même slug, forme, boîte, couleur)', () => {
    const layout: Layout = [...shelf, { id: 'p', kind: 'posed', shape: 'game', hostId: 'f1', x: 0, z: 0, box: 'switch', caseColor: '#123456', slug: 'Zelda' }];
    const next = moveToBoard(layout, 'p', 'f1', 2, 0)!;
    expect(next.find((p) => p.id === 'p')).toEqual({ id: 'p', kind: 'stored', shape: 'game', shelfId: 'f1', level: 2, order: 0, box: 'switch', caseColor: '#123456', slug: 'Zelda' });
  });

  it('storeCard et moveStored passent par les nouvelles règles (petits objets comptés)', () => {
    const layout: Layout = [...shelf, lamp(0, 0), cd(0, 0, 1), cd(1, 0, 2), cd(2, 0, 3)];
    expect(storeCard(layout, 'f1', 0, 4, 'cd', 'N', 'n')).toBeNull();
    expect(moveStored([...layout, cd(5, 1, 0)], 'c5', 'f1', 0, 0)).toBeNull();
    expect(order(moveStored(layout, 'c2', 'f1', 0, 0)!, 0)).toEqual([['c2', 0], ['l', 1], ['c0', 2], ['c1', 3]]);
  });

  it('moveToTop : carte posée sur trépied (v10) ; lampe de tablette posée sur le dessus, la tablette se recompacte', () => {
    const layout: Layout = [...shelf, lamp(1, 0), cd(0, 1, 1)];
    const card = moveToTop(layout, 'c0', 'f1', 0, 0)!;
    expect(card.find((p) => p.id === 'c0')).toEqual({ id: 'c0', kind: 'posed', shape: 'cd', hostId: 'f1', x: 0, z: 0, slug: 'S0' });
    expect(order(card, 1)).toEqual([['l', 0]]);
    const next = moveToTop(layout, 'l', 'f1', 0, 0)!;
    expect(next.find((p) => p.id === 'l')).toEqual({ id: 'l', kind: 'small', item: 'lamp', hostId: 'f1', x: 0, z: 0 });
    expect(order(next, 1)).toEqual([['c0', 0]]);
    // Hors du plateau : refusé.
    expect(moveToTop(layout, 'l', 'f1', 70, 0)).toBeNull();
  });

  it('étagères liées : un CD passe de A à B ; retirer A n’emporte que ce qui reste sur A', () => {
    const two = placeStanding(placeStanding([], 24, 'shelf', 0, 7, 'A')!, 24, 'shelf', 4, 7, 'B')!;
    const layout: Layout = [...two, cd(0, 0, 0, 'A'), cd(1, 0, 1, 'A'), lamp(1, 0, 'A')];
    const moved = moveToBoard(layout, 'c0', 'B', 0, 0)!;
    expect(moved.find((p) => p.id === 'c0')).toMatchObject({ shelfId: 'B', level: 0, order: 0 });
    expect(order(moved, 0, 'A')).toEqual([['c1', 0]]);
    const rest = removeFurniture(moved, 'A');
    expect(rest.map((p) => p.id).sort()).toEqual(['B', 'c0']);
  });

  it('carriedPlacementOf d’une lampe de tablette : posée sur la planche, toujours une lampe', () => {
    const layout: Layout = [...shelf, cd(0, 1, 0), lamp(1, 1)];
    const at = carriedPlacementOf(layout, layout.find((p) => p.id === 'l')!);
    expect(at).toMatchObject({ hostId: 'f1', hostKind: 'shelf', placement: { key: 'l', shape: 'small-lamp', y: boardTopCm(1) } });
    expect(at!.placement.x).toBe(3 + 15);
    expect(isLamp(layout.find((p) => p.id === 'l')!)).toBe(true);
  });

  it('lumière : une lampe de tablette éclaire et a ses propres boîtes ; les cartes qui l’entourent forment deux suites', () => {
    const layout: Layout = [...shelf, cd(0, 1, 0), lamp(1, 1), cd(1, 1, 2)];
    const geom = { wallH: 340, floorH: 170 };
    expect(lampsOf(layout, geom).map((l) => l.id)).toEqual(['l']);
    const owners = new Set(boxesOf(layout, geom).map((b) => b.owner));
    expect(owners.has('l')).toBe(true);
    expect(owners.has('f1#1')).toBe(true);
    expect(owners.has('f1#1.1')).toBe(true);
  });
});
