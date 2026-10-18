import { describe, expect, it } from 'vitest';
import { createInitialState, migrateV9, parseLibraryState } from '../../../src/core/library/library-book';

const state = (version: number, layout: unknown[]) => ({ version, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' },
  rooms: [{ id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout }] });
// Un aménagement v9 complet : bureau + écran, carte posée (jeu à boîte), petit objet en cm, étagère + objets rangés, objet du mur.
const V9_LAYOUT = [
  { id: 'd', kind: 'desk', col: 0, row: 10 },
  { id: 'pc', kind: 'computer', deskId: 'd', slug: 'Ecran' },
  { id: 'p', kind: 'posed', shape: 'game', hostId: 'd', x: 2, z: 0, box: 'gamecube', caseColor: '#112233', slug: 'Jeu' },
  { id: 'a', kind: 'small', item: 'alarm', hostId: 'd', x: 40, z: 0 },
  { id: 'sh', kind: 'shelf', col: 8, row: 6 },
  { id: 's1', kind: 'stored', shape: 'cd', shelfId: 'sh', level: 1, order: 0, slug: 'Disque' },
  { id: 's2', kind: 'stored', shape: 'book', shelfId: 'sh', level: 1, order: 1, display: 'cover', slug: 'Livre' },
  { id: 'w', kind: 'wall', shape: 'poster', col: 4, row: 2, slug: 'Affiche' },
];

describe('migration v10 (poses des cartes posées)', () => {
  it('migrateV9 seule : version 10, rien d’autre ne change, sans effet sur une autre version', () => {
    const v9 = state(9, V9_LAYOUT);
    expect(migrateV9(v9)).toEqual({ ...v9, version: 10 });
    const v8 = state(8, []);
    expect(migrateV9(v8)).toBe(v8);
    expect(migrateV9(null)).toBeNull();
  });

  it('un état v9 se relit à l’identique en v10, relecture idempotente', () => {
    const once = parseLibraryState(state(9, V9_LAYOUT));
    expect(once.version).toBe(10);
    expect(once.rooms[0]!.layout).toEqual(V9_LAYOUT);
    expect(parseLibraryState(once)).toEqual(once);
  });

  it('nouvel état : version 10', () => {
    expect(createInitialState().version).toBe(10);
  });
});
