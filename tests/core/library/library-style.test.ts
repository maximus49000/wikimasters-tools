import { describe, expect, it } from 'vitest';
import { categoriesFor, STEAMPUNK_ONLY, sizeOf, poisOf } from '../../../src/core/library/furniture-catalog';
import { MIN_COLS, ROWS } from '../../../src/core/library/room-grid';
import { activeRoom, countExclusive, createInitialState, setRoomStyle, updateLayout } from '../../../src/core/library/library-book';

describe('styles de pièce', () => {
  it('la catégorie Steampunk n’existe que dans une pièce Steampunk', () => {
    expect(categoriesFor('scandinave').map((c) => c.id)).toEqual(['storage', 'seats', 'pets', 'deco']);
    expect(categoriesFor('steampunk').map((c) => c.id)).toEqual(['storage', 'seats', 'pets', 'deco', 'steampunk']);
    expect(categoriesFor('steampunk').at(-1)!.kinds).toEqual(['globe', 'telescope', 'automaton']);
  });

  it('les trois meubles exclusifs tiennent dans la pièce', () => {
    for (const kind of STEAMPUNK_ONLY) {
      const { w, h } = sizeOf(kind);
      expect(w).toBeLessThanOrEqual(MIN_COLS);
      expect(h).toBeLessThanOrEqual(ROWS);
      expect(poisOf(kind)).toEqual([]);
    }
  });

  it('setRoomStyle change le style de la pièce', () => {
    const state = setRoomStyle(createInitialState(), 'r1', 'neon');
    expect(activeRoom(state).style).toBe('neon');
  });

  it('quitter Steampunk retire les meubles exclusifs et eux seuls', () => {
    let state = setRoomStyle(createInitialState(), 'r1', 'steampunk');
    state = updateLayout(state, 'r1', () => [
      { id: 'f1', kind: 'globe', col: 0, row: 14 },
      { id: 'f2', kind: 'chair', col: 6, row: 15 },
    ]);
    expect(countExclusive(activeRoom(state))).toBe(1);
    const left = setRoomStyle(state, 'r1', 'moderne');
    expect(activeRoom(left).layout.map((p) => p.id)).toEqual(['f2']);
    const stay = setRoomStyle(state, 'r1', 'steampunk');
    expect(activeRoom(stay).layout).toHaveLength(2);
  });

  it('un identifiant de pièce inconnu ne change rien', () => {
    const state = createInitialState();
    expect(setRoomStyle(state, 'zz', 'neon')).toBe(state);
  });
});
