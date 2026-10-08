import { describe, expect, it } from 'vitest';
import {
  MAX_ROOMS,
  activeRoom,
  addRoom,
  createInitialState,
  deleteRoom,
  extendRoom,
  nextFurnitureId,
  parseLibraryState,
  renameRoom,
  setActive,
  setHome,
  setOrientation,
  shrinkRoom,
  updateLayout,
} from '../../../src/core/library/library-book';

describe('état initial', () => {
  it('a une pièce horizontale vide de 24 colonnes', () => {
    const state = createInitialState();
    expect(state.rooms).toHaveLength(1);
    expect(activeRoom(state)).toMatchObject({ name: 'Pièce 1', orientation: 'landscape', style: 'scandinave', cols: 24, layout: [] });
    expect(state.homeRoomId).toBeNull();
  });
});

describe('pièces', () => {
  it("ajoute une pièce qui devient active et garde l'orientation précédente", () => {
    let state = setOrientation(createInitialState(), 'r1', 'portrait');
    state = addRoom(state);
    expect(state.rooms).toHaveLength(2);
    expect(state.activeRoomId).toBe('r2');
    expect(activeRoom(state).orientation).toBe('portrait');
    expect(activeRoom(state).cols).toBe(24);
  });

  it('limite à 12 pièces', () => {
    let state = createInitialState();
    for (let i = 0; i < 20; i++) state = addRoom(state);
    expect(state.rooms).toHaveLength(MAX_ROOMS);
  });

  it('renomme avec un nom propre', () => {
    const state = renameRoom(createInitialState(), 'r1', '  Salon  ');
    expect(state.rooms[0]?.name).toBe('Salon');
    expect(renameRoom(state, 'r1', '   ')).toBe(state);
    expect(renameRoom(state, 'r1', 'x'.repeat(50)).rooms[0]?.name).toHaveLength(30);
  });

  it("supprime une pièce et passe à sa voisine, en retirant l'accueil", () => {
    let state = addRoom(createInitialState());
    state = setHome(state, 'r2');
    state = deleteRoom(state, 'r2');
    expect(state.rooms.map((r) => r.id)).toEqual(['r1']);
    expect(state.activeRoomId).toBe('r1');
    expect(state.homeRoomId).toBeNull();
  });

  it('vide la dernière pièce au lieu de la supprimer', () => {
    let state = extendRoom(createInitialState(), 'r1', 'right');
    state = updateLayout(state, 'r1', () => [{ id: 'f1', kind: 'desk', col: 0, row: 8 }]);
    state = deleteRoom(state, 'r1');
    expect(state.rooms).toHaveLength(1);
    expect(activeRoom(state)).toMatchObject({ layout: [], cols: 24 });
  });

  it("n'accepte comme pièce d'accueil qu'une pièce qui existe", () => {
    const state = createInitialState();
    expect(setHome(state, 'zzz')).toBe(state);
    expect(setHome(state, 'r1').homeRoomId).toBe('r1');
    expect(setHome(setHome(state, 'r1'), null).homeRoomId).toBeNull();
  });

  it("ne change pas d'active vers une pièce inconnue", () => {
    const state = createInitialState();
    expect(setActive(state, 'zzz')).toBe(state);
  });
});

describe('agrandir et réduire', () => {
  it('ajoute une zone à droite sans toucher aux meubles', () => {
    let state = updateLayout(createInitialState(), 'r1', () => [{ id: 'f1', kind: 'desk', col: 2, row: 8 }]);
    state = extendRoom(state, 'r1', 'right');
    expect(activeRoom(state).cols).toBe(36);
    expect(activeRoom(state).layout).toEqual([{ id: 'f1', kind: 'desk', col: 2, row: 8 }]);
  });

  it('ajoute une zone à gauche en décalant les meubles de 12 colonnes', () => {
    let state = updateLayout(createInitialState(), 'r1', () => [{ id: 'f1', kind: 'desk', col: 2, row: 8 }]);
    state = extendRoom(state, 'r1', 'left');
    expect(activeRoom(state).cols).toBe(36);
    expect(activeRoom(state).layout).toEqual([{ id: 'f1', kind: 'desk', col: 14, row: 8 }]);
  });

  it('ne dépasse pas 96 colonnes', () => {
    let state = createInitialState();
    for (let i = 0; i < 12; i++) state = extendRoom(state, 'r1', 'right');
    expect(activeRoom(state).cols).toBe(96);
  });

  it('réduit une zone vide, à droite comme à gauche', () => {
    let state = extendRoom(createInitialState(), 'r1', 'right');
    state = shrinkRoom(state, 'r1', 'right');
    expect(activeRoom(state).cols).toBe(24);

    state = updateLayout(extendRoom(createInitialState(), 'r1', 'left'), 'r1', () => [{ id: 'f1', kind: 'desk', col: 20, row: 8 }]);
    state = shrinkRoom(state, 'r1', 'left');
    expect(activeRoom(state)).toMatchObject({ cols: 24, layout: [{ id: 'f1', kind: 'desk', col: 8, row: 8 }] });
  });

  it('refuse de réduire une zone occupée ou sous 24 colonnes', () => {
    const base = createInitialState();
    expect(shrinkRoom(base, 'r1', 'right')).toBe(base);
    let state = extendRoom(base, 'r1', 'right');
    state = updateLayout(state, 'r1', () => [{ id: 'f1', kind: 'shelf', col: 30, row: 4 }]);
    expect(shrinkRoom(state, 'r1', 'right')).toBe(state);
  });
});

describe('aménagement unique', () => {
  it("garde l'aménagement quand l'orientation change", () => {
    let state = updateLayout(createInitialState(), 'r1', () => [{ id: 'f1', kind: 'desk', col: 0, row: 8 }]);
    state = setOrientation(state, 'r1', 'portrait');
    expect(activeRoom(state).layout).toHaveLength(1);
    state = setOrientation(state, 'r1', 'landscape');
    expect(activeRoom(state).layout).toHaveLength(1);
  });

  it('transmet la largeur au changement et ignore un refus (null)', () => {
    const state = createInitialState();
    let seen = 0;
    updateLayout(state, 'r1', (_layout, cols) => {
      seen = cols;
      return null;
    });
    expect(seen).toBe(24);
    expect(updateLayout(state, 'r1', () => null)).toBe(state);
  });

  it('donne le premier identifiant libre', () => {
    expect(nextFurnitureId([])).toBe('f1');
    expect(nextFurnitureId([{ id: 'f1', kind: 'desk', col: 0, row: 8 }, { id: 'f3', kind: 'shelf', col: 8, row: 4 }])).toBe('f2');
  });
});

describe('parseLibraryState', () => {
  it('retombe sur une pièce vide quand le contenu est absent ou illisible', () => {
    expect(parseLibraryState(undefined).rooms).toHaveLength(1);
    expect(parseLibraryState('n importe quoi').rooms).toHaveLength(1);
    expect(parseLibraryState({ version: 2 }).rooms).toHaveLength(1);
  });

  it('relit un état valide', () => {
    let state = extendRoom(addRoom(createInitialState()), 'r2', 'left');
    state = setHome(state, 'r1');
    expect(parseLibraryState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('refuse une largeur qui n est pas un multiple de 12', () => {
    const state = createInitialState();
    const broken = { ...state, rooms: [{ ...state.rooms[0]!, cols: 30 }] };
    expect(parseLibraryState(broken)).toEqual(createInitialState());
  });

  it("corrige une pièce active ou d'accueil inconnue", () => {
    const broken = { ...createInitialState(), activeRoomId: 'zzz', homeRoomId: 'yyy' };
    const fixed = parseLibraryState(broken);
    expect(fixed.activeRoomId).toBe('r1');
    expect(fixed.homeRoomId).toBeNull();
  });
});
