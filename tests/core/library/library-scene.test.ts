import { describe, expect, it } from 'vitest';
import { activeRoom, createInitialState, parseLibraryState, setRoomScene, setTimeSetting, updateLayout } from '../../../src/core/library/library-book';

describe('scène et heure', () => {
  it('démarre en ville, heure réelle, version 3', () => {
    const state = createInitialState();
    expect(state.version).toBe(3);
    expect(state.time).toEqual({ mode: 'real' });
    expect(activeRoom(state).scene).toBe('city');
  });

  it('change la scène d’une pièce seulement', () => {
    const state = setRoomScene(createInitialState(), 'r1', 'sea');
    expect(activeRoom(state).scene).toBe('sea');
    expect(setRoomScene(state, 'zz', 'space')).toBe(state);
  });

  it('règle l’heure globale et borne la minute manuelle', () => {
    expect(setTimeSetting(createInitialState(), { mode: 'night' }).time).toEqual({ mode: 'night' });
    expect(setTimeSetting(createInitialState(), { mode: 'manual', minutes: 1500 }).time).toEqual({ mode: 'manual', minutes: 1439 });
    expect(setTimeSetting(createInitialState(), { mode: 'manual', minutes: -4 }).time).toEqual({ mode: 'manual', minutes: 0 });
  });

  it('migre un état v2 : ville et heure réelle', () => {
    const v2 = { version: 2, activeRoomId: 'r1', homeRoomId: null, rooms: [{ id: 'r1', name: 'Salon', style: 'neon', orientation: 'landscape', cols: 24, layout: [{ id: 'f1', kind: 'chair', col: 3, row: 15 }] }] };
    const state = parseLibraryState(v2);
    expect(state.version).toBe(3);
    expect(state.time).toEqual({ mode: 'real' });
    expect(activeRoom(state).scene).toBe('city');
    expect(activeRoom(state).name).toBe('Salon');
    expect(activeRoom(state).layout).toHaveLength(1);
  });

  it('migre un état v1 jusqu’à la v3', () => {
    const v1 = { version: 1, activeRoomId: 'r1', homeRoomId: null, rooms: [{ id: 'r1', name: 'P', style: 'scandinave', orientation: 'landscape', cols: 24, layout: [{ id: 'f1', kind: 'chair', col: 1, row: 8 }] }] };
    const state = parseLibraryState(v1);
    expect(state.version).toBe(3);
    expect(activeRoom(state).layout[0]).toMatchObject({ row: 11 });
  });

  it('lit une fenêtre valide et écarte une fenêtre hors bornes', () => {
    const base = updateLayout(createInitialState(), 'r1', () => [
      { id: 'f1', kind: 'window', col: 2, row: 1, w: 6, h: 5 },
      { id: 'f2', kind: 'window', col: 12, row: 1, w: 2, h: 5 },
    ]);
    const parsed = parseLibraryState(JSON.parse(JSON.stringify(base)));
    expect(activeRoom(parsed).layout.map((p) => p.id)).toEqual(['f1']);
  });

  it('écarte une fenêtre aux dimensions ou position non entières sans perdre la pièce', () => {
    const base = updateLayout(createInitialState(), 'r1', () => [
      { id: 'f1', kind: 'chair', col: 1, row: 13 },
      { id: 'f2', kind: 'window', col: 2, row: 1, w: 6.5, h: 5 },
      { id: 'f3', kind: 'window', col: 2.5, row: 1, w: 6, h: 5 },
      { id: 'f4', kind: 'window', col: 12, row: 1, w: 6, h: 5 },
    ]);
    const renamed = { ...base, rooms: base.rooms.map((r) => ({ ...r, name: 'Salon' })) };
    const parsed = parseLibraryState(JSON.parse(JSON.stringify(renamed)));
    expect(activeRoom(parsed).name).toBe('Salon');
    expect(activeRoom(parsed).layout.map((p) => p.id)).toEqual(['f1', 'f4']);
  });

  it('une scène inconnue redonne un état initial', () => {
    const bad = { ...createInitialState(), rooms: [{ ...activeRoom(createInitialState()), scene: 'lune' }] };
    expect(parseLibraryState(JSON.parse(JSON.stringify(bad)))).toEqual(createInitialState());
  });
});
