import { describe, expect, it } from 'vitest';
import {
  MAX_COLS,
  MIN_COLS,
  ROWS,
  SECTION,
  VISIBLE_COLS,
  WALL_ROWS,
  canPlace,
  canPlaceComputer,
  computerRect,
  moveComputer,
  moveStanding,
  placeComputer,
  placeStanding,
  pxRect,
  rectOf,
  removeFurniture,
  sectionIsEmpty,
  shelfSlots,
  shiftLayout,
} from '../../../src/core/library/room-grid';
import type { Layout } from '../../../src/core/library/library-types';

describe('constantes', () => {
  it('décrit la pièce et les fenêtres visibles', () => {
    expect([ROWS, WALL_ROWS, SECTION, MIN_COLS, MAX_COLS]).toEqual([12, 9, 12, 24, 96]);
    expect(VISIBLE_COLS).toEqual({ landscape: 24, portrait: 14 });
  });
});

describe('canPlace', () => {
  it('accepte un meuble dont le bas est au sol', () => {
    expect(canPlace([], 24, 'shelf', 0, 4).ok).toBe(true);
  });

  it('refuse un meuble dont le bas est sur le mur', () => {
    const res = canPlace([], 24, 'shelf', 0, 0);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('floor');
  });

  it('refuse un meuble qui dépasse de la pièce, selon sa largeur', () => {
    const res = canPlace([], 24, 'shelf', 20, 4);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('bounds');
    expect(canPlace([], 36, 'shelf', 20, 4).ok).toBe(true);
  });

  it('refuse un chevauchement et donne les cases en conflit', () => {
    const layout: Layout = [{ id: 'f1', kind: 'shelf', col: 0, row: 4 }];
    const res = canPlace(layout, 24, 'desk', 3, 8);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('taken');
      expect(res.cells.length).toBeGreaterThan(0);
    }
  });

  it('ignore le meuble déplacé', () => {
    const layout: Layout = [{ id: 'f1', kind: 'shelf', col: 0, row: 4 }];
    expect(canPlace(layout, 24, 'shelf', 1, 4, 'f1').ok).toBe(true);
  });
});

describe('pose, déplacement, retrait', () => {
  it('pose puis déplace un meuble', () => {
    const placed = placeStanding([], 24, 'desk', 2, 8, 'f1');
    expect(placed).toEqual([{ id: 'f1', kind: 'desk', col: 2, row: 8 }]);
    const moved = moveStanding(placed!, 24, 'f1', 10, 8);
    expect(moved).toEqual([{ id: 'f1', kind: 'desk', col: 10, row: 8 }]);
  });

  it('refuse un déplacement invalide', () => {
    const layout = placeStanding([], 24, 'desk', 2, 8, 'f1')!;
    expect(moveStanding(layout, 24, 'f1', 2, 2)).toBeNull();
  });

  it('ne pose un ordinateur que sur un bureau libre', () => {
    const layout = placeStanding([], 24, 'desk', 2, 8, 'f1')!;
    expect(canPlaceComputer(layout, 'inconnu')).toBe(false);
    const withPc = placeComputer(layout, 'f1', 'f2')!;
    expect(withPc).toHaveLength(2);
    expect(canPlaceComputer(withPc, 'f1')).toBe(false);
    expect(placeComputer(withPc, 'f1', 'f3')).toBeNull();
  });

  it("ne pose pas un ordinateur sur une étagère", () => {
    const layout = placeStanding([], 24, 'shelf', 2, 4, 'f1')!;
    expect(canPlaceComputer(layout, 'f1')).toBe(false);
  });

  it('déplace un ordinateur vers un autre bureau', () => {
    let layout = placeStanding([], 24, 'desk', 0, 8, 'f1')!;
    layout = placeStanding(layout, 24, 'desk', 10, 8, 'f2')!;
    layout = placeComputer(layout, 'f1', 'f3')!;
    const moved = moveComputer(layout, 'f3', 'f2');
    expect(moved?.find((p) => p.id === 'f3')).toEqual({ id: 'f3', kind: 'computer', deskId: 'f2' });
  });

  it("retire un bureau avec l'ordinateur qui y est posé", () => {
    let layout = placeStanding([], 24, 'desk', 0, 8, 'f1')!;
    layout = placeComputer(layout, 'f1', 'f2')!;
    expect(removeFurniture(layout, 'f1')).toEqual([]);
  });
});

describe('décalage et zones de bord', () => {
  it("décale les meubles au sol et laisse l'ordinateur suivre son bureau", () => {
    let layout = placeStanding([], 24, 'desk', 2, 8, 'f1')!;
    layout = placeComputer(layout, 'f1', 'f2')!;
    expect(shiftLayout(layout, 12)).toEqual([
      { id: 'f1', kind: 'desk', col: 14, row: 8 },
      { id: 'f2', kind: 'computer', deskId: 'f1' },
    ]);
  });

  it('dit si la zone du bord est vide', () => {
    const layout = placeStanding([], 24, 'desk', 2, 8, 'f1')!;
    expect(sectionIsEmpty(layout, 24, 'left')).toBe(false);
    expect(sectionIsEmpty(layout, 24, 'right')).toBe(true);
    const both = placeStanding(layout, 24, 'shelf', 18, 4, 'f2')!;
    expect(sectionIsEmpty(both, 24, 'right')).toBe(false);
  });

  it('compte un meuble à cheval sur la frontière comme occupant la zone', () => {
    const layout = placeStanding([], 36, 'desk', 10, 8, 'f1')!;
    expect(sectionIsEmpty(layout, 36, 'left')).toBe(false);
  });
});

describe('rectangles en pixels', () => {
  it('convertit un meuble en pixels', () => {
    const rect = rectOf({ id: 'f1', kind: 'desk', col: 2, row: 8 })!;
    expect(rect).toEqual({ col: 2, row: 8, w: 5, h: 4 });
    expect(pxRect(rect)).toMatchObject({ x: 60, w: 150 });
  });

  it("pose l'ordinateur sur le dessus du bureau", () => {
    const desk = pxRect({ col: 0, row: 8, w: 5, h: 4 });
    const pc = computerRect(desk);
    expect(pc.y + pc.h).toBeLessThanOrEqual(desk.y + 4);
    expect(pc.x).toBeGreaterThanOrEqual(desk.x);
    expect(pc.x + pc.w).toBeLessThanOrEqual(desk.x + desk.w);
  });

  it("donne 15 emplacements dans l'étagère", () => {
    const shelf = pxRect({ col: 0, row: 4, w: 6, h: 8 });
    const slots = shelfSlots(shelf);
    expect(slots).toHaveLength(15);
    for (const s of slots) {
      expect(s.x).toBeGreaterThanOrEqual(shelf.x);
      expect(s.y).toBeGreaterThanOrEqual(shelf.y);
      expect(s.x + s.w).toBeLessThanOrEqual(shelf.x + shelf.w);
      expect(s.y + s.h).toBeLessThanOrEqual(shelf.y + shelf.h);
    }
  });
});
