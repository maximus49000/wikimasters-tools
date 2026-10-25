import { describe, expect, it } from 'vitest';
import { faceFrame, frontFaceRect, invertFace } from '../../../src/core/library/footprint';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { projectOf } from '../../../src/core/library/furniture-render3d';
import type { Layout, Placed } from '../../../src/core/library/library-types';
import {
  CELL_H, CELL_W, SHELF_FULL_MESSAGE, SHELF_INNER_CM, boardAt, boardItems, dropOnShelf, firstFreeBoard, moveStored, placeStanding, pxRect, rectOf,
  shelfBoardsOf, shelfFreeIn, shelfLayoutIn, shelfLayoutOf, storeCard,
} from '../../../src/core/library/room-grid';
import { drawSize } from '../../../src/core/library/footprint';

type Stored = Extract<Placed, { kind: 'stored' }>;
const shelf = placeStanding([], 24, 'shelf', 0, 7, 'f1')!;
const cd = (i: number, level: 0 | 1 | 2, order: number, extra: Partial<Stored> = {}): Stored =>
  ({ id: `c${i}`, kind: 'stored', shape: 'cd', shelfId: 'f1', level, order, slug: `S${i}`, ...extra });

describe('rangement adaptatif d’une tablette', () => {
  it('largeur utile : la face de l’étagère, 74 cm', () => {
    expect(SHELF_INNER_CM).toBe(74);
  });

  it('5 CD de face tiennent (5 × 14 + 4 écarts = 74 cm), le 6e est refusé (« Plus de place sur cette tablette. »)', () => {
    let layout: Layout = shelf;
    for (let i = 0; i < 5; i++) {
      const r = dropOnShelf(layout, 'f1', 0, 999, { shape: 'cd' });
      expect(r).toEqual({ ok: true, order: i });
      layout = storeCard(layout, 'f1', 0, i, 'cd', `S${i}`, `c${i}`)!;
      expect(layout).not.toBeNull();
    }
    expect(dropOnShelf(layout, 'f1', 0, 999, { shape: 'cd' })).toEqual({ ok: false, reason: 'shelf-full', message: SHELF_FULL_MESSAGE });
    expect(SHELF_FULL_MESSAGE).toBe('Plus de place sur cette tablette.');
    expect(storeCard(layout, 'f1', 0, 5, 'cd', 'S5', 'c5')).toBeNull();
    // Même un CD sur la tranche (1 cm + 1 cm d'écart) n'y entre plus.
    expect(dropOnShelf(layout, 'f1', 0, 999, { shape: 'cd', display: 'spine' })).toMatchObject({ ok: false, reason: 'shelf-full' });
    // Les autres tablettes restent libres.
    expect(dropOnShelf(layout, 'f1', 1, 0, { shape: 'cd' })).toEqual({ ok: true, order: 0 });
  });

  it('30 CD sur la tranche tiennent sur une tablette (30 + 29 = 59 cm)', () => {
    let layout: Layout = shelf;
    for (let i = 0; i < 30; i++) {
      layout = storeCard(layout, 'f1', 2, i, 'cd', `S${i}`, `c${i}`, 'spine')!;
      expect(layout, `CD ${i}`).not.toBeNull();
    }
    expect(boardItems(layout, 'f1', 2)).toHaveLength(30);
  });

  it('un livre est sur la tranche par défaut (3 cm), un CD de face (14 cm)', () => {
    const books = shelfLayoutOf([...shelf, { ...cd(0, 0, 0), shape: 'book' }, cd(1, 0, 1)], 'f1');
    expect(books.map((b) => b.wCm)).toEqual([3, 14]);
    // Le premier contre le bord gauche, 1 cm d'écart entre deux objets.
    expect(books.map((b) => b.x0Cm)).toEqual([0, 4]);
  });

  it('insertion au milieu : décale les suivants ; retrait : compacte', () => {
    const layout: Layout = [...shelf, cd(0, 0, 0), cd(1, 0, 1), cd(2, 0, 2)];
    const before = shelfLayoutOf(layout, 'f1');
    // Lâcher entre le 1er et le 2e (centres 7 cm et 22 cm).
    const r = dropOnShelf(layout, 'f1', 0, 15, { shape: 'cd', display: 'spine' });
    expect(r).toEqual({ ok: true, order: 1 });
    const next = storeCard(layout, 'f1', 0, 1, 'cd', 'N', 'n', 'spine')!;
    expect(boardItems(next, 'f1', 0).map((p) => [p.id, p.order])).toEqual([['c0', 0], ['n', 1], ['c1', 2], ['c2', 3]]);
    const after = shelfLayoutOf(next, 'f1');
    const x = (id: string, l: typeof after) => l.find((b) => b.id === id)!.x0Cm;
    expect(x('c0', after)).toBe(x('c0', before));
    expect(x('c1', after)).toBe(x('c1', before) + 2);
    expect(x('c2', after)).toBe(x('c2', before) + 2);
    // Retirer le nouveau : les ordres se recompactent.
    const moved = moveStored(next, 'n', 'f1', 1, 0)!;
    expect(boardItems(moved, 'f1', 0).map((p) => [p.id, p.order])).toEqual([['c0', 0], ['c1', 1], ['c2', 2]]);
    expect(boardItems(moved, 'f1', 1).map((p) => [p.id, p.order])).toEqual([['n', 0]]);
  });

  it('déplacement entre tablettes et entre étagères', () => {
    const two = placeStanding([...shelf, cd(0, 0, 0), cd(1, 0, 1)], 24, 'shelf', 8, 7, 'f9')!;
    const a = moveStored(two, 'c0', 'f9', 2, 0)!;
    expect(a.find((p) => p.id === 'c0')).toMatchObject({ shelfId: 'f9', level: 2, order: 0 });
    expect(a.find((p) => p.id === 'c1')).toMatchObject({ shelfId: 'f1', level: 0, order: 0 });
    // Dans la même tablette : passe en tête.
    const b = moveStored([...shelf, cd(0, 0, 0), cd(1, 0, 1), cd(2, 0, 2)], 'c2', 'f1', 0, 0)!;
    expect(boardItems(b, 'f1', 0).map((p) => p.id)).toEqual(['c2', 'c0', 'c1']);
    // Refus : tablette pleine, étagère inconnue, objet non rangé, tablette hors bornes.
    const full: Layout = [...shelf, ...[0, 1, 2, 3, 4].map((i) => cd(i, 0, i)), cd(5, 1, 0)];
    expect(moveStored(full, 'c5', 'f1', 0, 5)).toBeNull();
    expect(moveStored(full, 'c5', 'zz', 0, 0)).toBeNull();
    expect(moveStored(full, 'f1', 'f1', 0, 0)).toBeNull();
    expect(moveStored(full, 'c5', 'f1', 3 as 0, 0)).toBeNull();
  });

  it('une tablette qui déborde (convertie) garde ses objets et y laisse déplacer les siens', () => {
    // 6 CD de face : 6 × 14 + 5 = 89 cm > 74 cm.
    const over: Layout = [...shelf, ...[0, 1, 2, 3, 4, 5].map((i) => cd(i, 0, i))];
    expect(shelfLayoutOf(over, 'f1')).toHaveLength(6);
    expect(moveStored(over, 'c5', 'f1', 0, 0)).not.toBeNull();
    expect(storeCard(over, 'f1', 0, 0, 'cd', 'N', 'n', 'spine')).toBeNull();
  });

  it('première tablette libre pour un objet (la suite de la tablette)', () => {
    const full: Layout = [...shelf, ...[0, 1, 2, 3, 4].map((i) => cd(i, 0, i))];
    const four: Layout = full.filter((p) => p.id !== 'c4');
    expect(firstFreeBoard(shelf, 'f1', { shape: 'cd' })).toEqual({ level: 0, order: 0 });
    expect(firstFreeBoard(full, 'f1', { shape: 'cd' })).toEqual({ level: 1, order: 0 });
    expect(firstFreeBoard(full, 'f1', { shape: 'cd', display: 'spine' })).toEqual({ level: 1, order: 0 });
    // 4 CD = 59 cm : un livre sur la tranche (1 + 3 cm) tient encore à la suite.
    expect(firstFreeBoard(four, 'f1', { shape: 'book' })).toEqual({ level: 0, order: 4 });
  });

  it('refuse une carte déjà posée ou une étagère inconnue', () => {
    const a = storeCard(shelf, 'f1', 0, 0, 'cd', 'A', 'x')!;
    expect(storeCard(a, 'f1', 0, 1, 'dvd', 'A', 'y')).toBeNull();
    expect(storeCard(a, 'zz', 0, 0, 'dvd', 'B', 'y')).toBeNull();
    // Ordre au-delà de la fin : posé en dernier.
    expect(storeCard(a, 'f1', 0, 9, 'dvd', 'B', 'y')!.find((p) => p.id === 'y')).toMatchObject({ order: 1 });
  });
});

describe('positions sur la face projetée', () => {
  const front = { id: 'f1', kind: 'shelf', col: 0, row: 6 } as const;
  const items: Layout = [front, cd(0, 0, 0), cd(1, 1, 0, { display: 'spine' }), { ...cd(2, 2, 0), shape: 'dvd' }];

  it('de face : chaque objet posé sur sa tablette, à sa largeur réelle', () => {
    const rect = pxRect(rectOf(front)!);
    // perspective G6 : positions attendues = projection des points de la face (était une règle de trois sur le rectangle de la face).
    const at = (x: number, cm: number): [number, number] => { const [px, py] = projectOf(FURNITURE_MODELS.shelf, 0, [3 + x, cm, 0]); return [rect.x + px, rect.y + py]; };
    const boxes = shelfLayoutOf(items, 'f1');
    expect(boxes).toHaveLength(3);
    [121, 61, 8].forEach((cm, i) => expect(boxes[i]!.y + boxes[i]!.h).toBeCloseTo(at(0, cm)[1], 1));
    // CD de face (14 cm) contre le bord gauche de la tablette du haut ; la tranche (1 cm) à la suite ; DVD (19 cm de haut) en bas.
    expect(boxes[0]!.quad[3]![0]).toBeCloseTo(at(0, 121)[0], 3);
    expect(boxes[0]!.quad[2]![0] - boxes[0]!.quad[3]![0]).toBeCloseTo(at(14, 121)[0] - at(0, 121)[0], 3);
    expect(boxes[1]!.quad[2]![0] - boxes[1]!.quad[3]![0]).toBeCloseTo(at(1, 61)[0] - at(0, 61)[0], 3);
    expect(boxes[2]!.quad[3]![1] - boxes[2]!.quad[0]![1]).toBeCloseTo(at(0, 8)[1] - at(0, 27)[1], 3);
  });

  it('¾ : positions dans le parallélogramme de la face ; aucune de profil ni de dos', () => {
    for (const angle of [1, 7] as const) {
      const three: Layout = [{ ...front, angle }, ...items.slice(1)];
      const box = frontFaceRect(angle, pxRect(rectOf(three[0]!)!), 'shelf')!;
      const frame = faceFrame('shelf', angle, pxRect(rectOf(three[0]!)!))!;
      const boxes = shelfLayoutOf(three, 'f1');
      expect(boxes).toHaveLength(3);
      for (const b of boxes) {
        expect(Math.abs(b.quad[1]![1] - b.quad[0]![1]), 'bord du haut incliné').toBeGreaterThan(0.1);
        for (const [x, y] of b.quad) {
          expect(x).toBeGreaterThanOrEqual(box.x - 1e-6); expect(x).toBeLessThanOrEqual(box.x + box.w + 1e-6);
          expect(y).toBeGreaterThanOrEqual(box.y - 1e-6); expect(y).toBeLessThanOrEqual(box.y + box.h + 1e-6);
          const [u, v] = invertFace(frame, x, y); // perspective G6 : repère exact de la face (était invertMatrix(frame.m))
          expect(u).toBeGreaterThanOrEqual(-1e-6); expect(u).toBeLessThanOrEqual(frame.w + 1e-6);
          expect(v).toBeGreaterThanOrEqual(-1e-6); expect(v).toBeLessThanOrEqual(frame.h + 1e-6);
        }
      }
      expect(shelfBoardsOf(three[0]!)).toHaveLength(3);
    }
    for (const angle of [2, 3, 4, 5, 6] as const) {
      expect(shelfLayoutOf([{ ...front, angle }, ...items.slice(1)], 'f1')).toEqual([]);
      expect(shelfBoardsOf({ ...front, angle })).toEqual([]);
    }
  });

  it('le zoom (face, autre taille) et la pièce partagent les mêmes positions', () => {
    const { w, h } = drawSize('shelf', 0);
    const zoom = shelfLayoutIn(faceFrame('shelf', 0, { x: 0, y: 0, w: w * CELL_W * 2.5, h: h * CELL_H * 2.5 })!, items, 'f1');
    const room = shelfLayoutIn(faceFrame('shelf', 0, pxRect(rectOf(front)!))!, items, 'f1');
    expect(zoom.map((b) => [b.id, b.level, b.order, b.x0Cm, b.wCm])).toEqual(room.map((b) => [b.id, b.level, b.order, b.x0Cm, b.wCm]));
    zoom.forEach((z, i) => {
      expect(z.local.x / 2.5).toBeCloseTo(room[i]!.local.x, 6);
      expect(z.local.w / 2.5).toBeCloseTo(room[i]!.local.w, 6);
      expect(z.local.y / 2.5).toBeCloseTo(room[i]!.local.y, 6);
    });
  });

  it('touche une tablette sous un point (x en cm sur la face) ; espace libre de chaque tablette', () => {
    const boards = shelfBoardsOf(front);
    const b = boards[1]!;
    const hit = boardAt([front], b.x + b.w / 2, b.y + b.h / 2)!;
    expect(hit).toMatchObject({ shelfId: 'f1', level: 1 });
    expect(hit.xCm).toBeCloseTo(37, 0);
    expect(boardAt([front], 600, 5)).toBeNull();
    const frame = faceFrame('shelf', 0, pxRect(rectOf(front)!))!;
    const free = shelfFreeIn(frame, items, 'f1');
    expect(free.map((f) => f.level)).toEqual([0, 1, 2]);
    expect(free[0]!.local.x).toBeCloseTo((14 / 74) * frame.w, 3);
    expect(free[1]!.local.x).toBeCloseTo((1 / 74) * frame.w, 3);
    expect(free[0]!.local.x + free[0]!.local.w).toBeCloseTo(frame.w, 3);
  });
});

describe('viser sa propre tablette', () => {
  it('un objet visé à sa place garde son rang, même suivi d’un voisin plus étroit', () => {
    const layout: Layout = [
      { id: 's', kind: 'shelf', col: 2, row: 6 },
      ...[0, 1, 2, 3].map((order): Placed => ({ id: `c${order}`, kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order, slug: `cd${order}` })),
      { id: 'b', kind: 'stored', shape: 'book', shelfId: 's', level: 0, order: 4, slug: 'Dune' },
    ];
    const c3 = layout.find((p) => p.id === 'c3') as Extract<Placed, { kind: 'stored' }>;
    // Centre de c3 : 45 + 7 = 52 cm ; le livre (3 cm) est vu à 60–63 cm, à sa droite.
    expect(dropOnShelf(layout, 's', 0, 52, c3)).toEqual({ ok: true, order: 3 });
    expect(dropOnShelf(layout, 's', 0, 62, c3)).toEqual({ ok: true, order: 4 });
    expect(dropOnShelf(layout, 's', 0, 20, c3)).toEqual({ ok: true, order: 1 });
  });
});
