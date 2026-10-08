import { describe, expect, it } from 'vitest';
import { createInitialState, parseLibraryState } from '../../../src/core/library/library-book';

const withLayout = (layout: unknown[]) => {
  const state = createInitialState();
  return { ...state, rooms: [{ ...state.rooms[0]!, layout }] };
};

describe('lecture des cartes rangées', () => {
  it('relit les objets accrochés, rangés et l’écran', () => {
    const raw = withLayout([
      { id: 'f1', kind: 'shelf', col: 0, row: 4 },
      { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'f1', slot: 0, slug: 'A' },
      { id: 'f3', kind: 'wall', shape: 'vinyl', col: 8, row: 1, slug: 'B', color: 'red' },
      { id: 'f4', kind: 'desk', col: 10, row: 8 },
      { id: 'f5', kind: 'computer', deskId: 'f4', slug: 'C' },
    ]);
    expect(parseLibraryState(raw).rooms[0]!.layout).toHaveLength(5);
  });

  it('écarte un objet rangé dont l’étagère a disparu et une carte en double', () => {
    const raw = withLayout([
      { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'zz', slot: 0, slug: 'A' },
      { id: 'f3', kind: 'wall', shape: 'poster', col: 1, row: 1, slug: 'B' },
      { id: 'f4', kind: 'wall', shape: 'poster', col: 6, row: 1, slug: 'B' },
    ]);
    expect(parseLibraryState(raw).rooms[0]!.layout.map((p) => p.id)).toEqual(['f3']);
  });

  it('retombe sur une pièce vide pour une forme inconnue', () => {
    const raw = withLayout([{ id: 'f1', kind: 'wall', shape: 'banane', col: 1, row: 1, slug: 'B' }]);
    expect(parseLibraryState(raw).rooms[0]!.layout).toEqual([]);
  });

  it('écarte un emplacement doublé et une carte déjà sur un écran', () => {
    const raw = withLayout([
      { id: 'f1', kind: 'shelf', col: 0, row: 4 },
      { id: 'f4', kind: 'desk', col: 10, row: 8 },
      { id: 'f5', kind: 'computer', deskId: 'f4', slug: 'C' },
      { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'f1', slot: 0, slug: 'A' },
      { id: 'f3', kind: 'stored', shape: 'dvd', shelfId: 'f1', slot: 0, slug: 'B' },
      { id: 'f6', kind: 'wall', shape: 'poster', col: 1, row: 1, slug: 'C' },
    ]);
    expect(parseLibraryState(raw).rooms[0]!.layout.map((p) => p.id)).toEqual(['f1', 'f4', 'f5', 'f2']);
  });
});
