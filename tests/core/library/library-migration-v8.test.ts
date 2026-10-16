import { describe, expect, it } from 'vitest';
import { createInitialState, migrateV7, parseLibraryState } from '../../../src/core/library/library-book';

const state = (version: number, layout: unknown[]) => ({ version, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' },
  rooms: [{ id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout }] });
const sh = { id: 'sh', kind: 'shelf', col: 0, row: 6 };
const st = (id: string, shape: string, extra: object = {}) => ({ id, kind: 'stored', shape, shelfId: 'sh', level: 0, order: Number(id.slice(1)), slug: `S_${id}`, ...extra });

describe('migration v8 (format de boîte, présentation de dos)', () => {
  it('un état v7 migre à l’identique avec version 8', () => {
    const layout = [sh, st('a0', 'game'), st('a1', 'cd', { display: 'spine' })];
    const s = parseLibraryState(state(7, layout));
    expect(s.version).toBe(8);
    expect(s.rooms[0]!.layout).toEqual(layout);
    expect(createInitialState().version).toBe(8);
  });

  it('migrateV7 seule : version 8, idempotente', () => {
    const out = migrateV7(state(7, [])) as { version: number };
    expect(out.version).toBe(8);
    expect(migrateV7(out)).toBe(out);
  });

  it('box, caseColor et dos d’un jeu sont relus', () => {
    const s = parseLibraryState(state(8, [sh, st('a0', 'game', { display: 'back', box: 'switch', caseColor: '#107C10' })]));
    expect(s.rooms[0]!.layout[1]).toMatchObject({ display: 'back', box: 'switch', caseColor: '#107C10' });
  });

  it('dos sur un CD : relu en couverture ; box sur un CD écartée', () => {
    const s = parseLibraryState(state(8, [sh, st('a0', 'cd', { display: 'back', box: 'switch', caseColor: '#107C10' })]));
    const cd = s.rooms[0]!.layout[1]!;
    expect(cd).toMatchObject({ display: 'cover' });
    expect(cd).not.toHaveProperty('box');
    expect(cd).not.toHaveProperty('caseColor');
  });

  it('format ou couleur invalides : champ écarté, l’objet reste', () => {
    const s = parseLibraryState(state(8, [sh, st('a0', 'game', { box: 'wii', caseColor: 'rouge' })]));
    const g = s.rooms[0]!.layout[1]!;
    expect(g).toMatchObject({ id: 'a0', shelfId: 'sh' });
    expect(g).not.toHaveProperty('box');
    expect(g).not.toHaveProperty('caseColor');
  });

  it('idempotente', () => {
    const once = parseLibraryState(state(7, [sh, st('a0', 'game', { box: 'ds' })]));
    expect(parseLibraryState(once)).toEqual(once);
  });
});
