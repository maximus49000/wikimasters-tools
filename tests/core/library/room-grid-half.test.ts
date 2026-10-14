import { describe, expect, it } from 'vitest';
import { drawSize, floorOffsets } from '../../../src/core/library/footprint';
import { createInitialState, parseLibraryState } from '../../../src/core/library/library-book';
import type { Layout } from '../../../src/core/library/library-types';
import { buildWalkMap, isFree } from '../../../src/core/library/pets/walk-map';
import { ROWS, canHangRect, canPlace, placeStanding, snapHalf } from '../../../src/core/library/room-grid';

const COLS = 24;
// Ligne du haut qui pose le meuble au fond de la pièce (sa dernière ligne sur la dernière ligne du sol).
const TOP = { shelf: ROWS - drawSize('shelf', 0).h, sofa: ROWS - drawSize('sofa', 0).h };
// Largeur au sol (en cases) d'un meuble de face, depuis sa première case au sol.
const footSpan = (kind: 'shelf' | 'sofa'): { first: number; width: number } => {
  const cols = floorOffsets(kind, 0).map((c) => c.col);
  return { first: Math.min(...cols), width: Math.max(...cols) - Math.min(...cols) + 1 };
};

describe('positions à la demi-case', () => {
  it('arrondit à la demi-case la plus proche', () => {
    expect(snapHalf(3.2)).toBe(3);
    expect(snapHalf(3.3)).toBe(3.5);
    expect(snapHalf(3.74)).toBe(3.5);
    expect(snapHalf(3.76)).toBe(4);
  });

  it('pose un meuble à une demi-colonne', () => {
    const layout = placeStanding([], COLS, 'shelf', 2.5, TOP.shelf, 'f1');
    expect(layout?.[0]).toMatchObject({ col: 2.5 });
  });

  it('refuse un chevauchement d’une demi-case, accepte bord à bord', () => {
    const { width } = footSpan('shelf');
    const layout = placeStanding([], COLS, 'shelf', 2.5, TOP.shelf, 'f1')!;
    const over = canPlace(layout, COLS, 'shelf', 2.5 + width - 0.5, TOP.shelf);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe('taken');
    expect(canPlace(layout, COLS, 'shelf', 2.5 + width, TOP.shelf).ok).toBe(true);
  });

  it('centre un meuble de largeur impaire entre deux meubles', () => {
    const w = drawSize('sofa', 0).w;
    // Deux étagères qui laissent entre elles un espace de w + 1 colonnes : le canapé y tient décalé d'une demi-case de chaque côté.
    const { first, width } = footSpan('shelf');
    const left = 0;
    const gapStart = left + first + width;
    const rightCol = gapStart + w + 1 - first;
    const layout: Layout = [
      { id: 's1', kind: 'shelf', col: left, row: TOP.shelf },
      { id: 's2', kind: 'shelf', col: rightCol, row: TOP.shelf },
    ];
    expect(canPlace(layout, COLS, 'sofa', gapStart + 0.5, TOP.sofa).ok).toBe(true);
  });

  it('refuse de dépasser le bord de la pièce d’une demi-case', () => {
    const w = drawSize('shelf', 0).w;
    expect(canPlace([], COLS, 'shelf', COLS - w, TOP.shelf).ok).toBe(true);
    const right = canPlace([], COLS, 'shelf', COLS - w + 0.5, TOP.shelf);
    expect(right.ok).toBe(false);
    if (!right.ok) expect(right.reason).toBe('bounds');
    expect(canPlace([], COLS, 'shelf', -0.5, TOP.shelf).ok).toBe(false);
    expect(canPlace([], COLS, 'shelf', 0.5, TOP.shelf).ok).toBe(true);
  });

  it('accroche au mur à une demi-colonne, sans chevaucher un voisin', () => {
    const layout: Layout = [{ id: 'w1', kind: 'window', col: 2, row: 2, w: 4, h: 4 }];
    expect(canHangRect(layout, COLS, 2, 2, 5.5, 2).ok).toBe(false);
    expect(canHangRect(layout, COLS, 2, 2, 6, 2).ok).toBe(true);
    expect(canHangRect([], COLS, 3, 2, 10.5, 2).ok).toBe(true);
  });

  it('la sauvegarde garde les demi-colonnes et écarte les autres fractions', () => {
    const raw = (col: number) => {
      const state = createInitialState();
      return { ...state, rooms: [{ ...state.rooms[0]!, layout: [{ id: 'f1', kind: 'shelf', col, row: TOP.shelf }] }] };
    };
    const kept = parseLibraryState(raw(3.5));
    expect(kept.rooms[0]!.layout[0]).toMatchObject({ col: 3.5 });
    const bad = parseLibraryState(raw(3.25));
    expect(bad.rooms[0]!.layout.some((p) => (p as { col?: number }).col === 3.25)).toBe(false);
  });

  it('un meuble à une demi-colonne bloque les deux cases qu’il touche pour les animaux', () => {
    const { first } = footSpan('shelf');
    const layout = placeStanding([], COLS, 'shelf', 2.5, TOP.shelf, 'f1')!;
    const row = Math.max(...floorOffsets('shelf', 0).map((c) => c.row)) + TOP.shelf;
    const map = buildWalkMap(layout, COLS);
    expect(isFree(map, 2 + first, row)).toBe(false);
    expect(isFree(map, 3 + first, row)).toBe(false);
  });
});
