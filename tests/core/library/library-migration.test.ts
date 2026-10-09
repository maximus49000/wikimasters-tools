import { describe, expect, it } from 'vitest';
import { createInitialState, parseLibraryState } from '../../../src/core/library/library-book';

const v1 = (layout: unknown[]) => ({
  version: 1,
  activeRoomId: 'r1',
  homeRoomId: null,
  rooms: [{ id: 'r1', name: 'Salon', style: 'scandinave', orientation: 'landscape', cols: 24, layout }],
});

describe('migration v1 → v2', () => {
  it('descend de 3 lignes chaque objet qui a une ligne (mur et sol)', () => {
    const state = parseLibraryState(
      v1([
        { id: 'f1', kind: 'shelf', col: 2, row: 4 },
        { id: 'f2', kind: 'desk', col: 10, row: 8 },
        { id: 'f3', kind: 'computer', deskId: 'f2' },
        { id: 'f4', kind: 'wall', shape: 'poster', col: 15, row: 1, slug: 'Paris' },
        { id: 'f5', kind: 'stored', shape: 'cd', shelfId: 'f1', slot: 0, slug: 'Daft_Punk' },
      ]),
    );
    expect(state.version).toBe(5);
    const byId = (id: string) => state.rooms[0]!.layout.find((p) => p.id === id);
    expect(byId('f1')).toMatchObject({ row: 7, col: 2 });
    expect(byId('f2')).toMatchObject({ row: 11, col: 10 });
    expect(byId('f4')).toMatchObject({ row: 4, col: 15 });
    expect(byId('f3')).toEqual({ id: 'f3', kind: 'computer', deskId: 'f2' });
    expect(byId('f5')).toMatchObject({ shelfId: 'f1', slot: 0 });
  });

  it('lit un état v2 tel quel', () => {
    const initial = createInitialState();
    expect(parseLibraryState(initial)).toEqual(initial);
  });

  it('une pièce vide commence en v4', () => {
    expect(createInitialState().version).toBe(5);
  });

  it('un état inconnu ou abîmé donne une pièce vide', () => {
    expect(parseLibraryState({ version: 3 })).toEqual(createInitialState());
    expect(parseLibraryState(null)).toEqual(createInitialState());
    expect(parseLibraryState({ version: 1, rooms: 'x' })).toEqual(createInitialState());
  });
});
