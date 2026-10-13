import { describe, expect, it } from 'vitest';
import { createInitialState, migrateV6, parseLibraryState } from '../../../src/core/library/library-book';

const v6 = (layout: unknown[]) => ({ version: 6, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' },
  rooms: [{ id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout }] });
const st = (id: string, slot: number, shape = 'cd', shelfId = 'sh') => ({ id, kind: 'stored', shape, shelfId, slot, slug: `S_${id}` });

describe('migration v7 (rangement adaptatif)', () => {
  it('emplacement → tablette + ordre, sans perte (même tablette, même ordre)', () => {
    const s = parseLibraryState(v6([{ id: 'sh', kind: 'shelf', col: 0, row: 6 }, st('a', 0), st('b', 3, 'dvd'), st('c', 7, 'book'), st('d', 14, 'game')]));
    expect(s.version).toBe(7);
    const by = (id: string) => s.rooms[0]!.layout.find((p) => p.id === id);
    expect(by('a')).toEqual({ id: 'a', kind: 'stored', shape: 'cd', shelfId: 'sh', level: 0, order: 0, slug: 'S_a' });
    // Ordres compactés à la lecture : 0 puis 3 → 0, 1 (même ordre relatif).
    expect(by('b')).toMatchObject({ shelfId: 'sh', level: 0, order: 1 });
    expect(by('c')).toMatchObject({ level: 1, order: 0 });
    expect(by('d')).toMatchObject({ level: 2, order: 0 });
    expect(by('a')).not.toHaveProperty('slot');
    expect(by('a')).not.toHaveProperty('display');
  });

  it('migrateV6 seule : level = floor(slot / 5), order = slot % 5, le reste intact', () => {
    const out = migrateV6(v6([{ id: 'sh', kind: 'shelf', col: 0, row: 6 }, st('a', 12)])) as { version: number; rooms: { layout: unknown[] }[] };
    expect(out.version).toBe(7);
    expect(out.rooms[0]!.layout).toEqual([{ id: 'sh', kind: 'shelf', col: 0, row: 6 }, { id: 'a', kind: 'stored', shape: 'cd', shelfId: 'sh', level: 2, order: 2, slug: 'S_a' }]);
    // Déjà en v7 : inchangé.
    expect(migrateV6(out)).toBe(out);
  });

  it('idempotente', () => {
    const once = parseLibraryState(v6([{ id: 'sh', kind: 'shelf', col: 0, row: 6 }, st('a', 1), st('b', 6)]));
    expect(parseLibraryState(once)).toEqual(once);
  });

  it('une tablette convertie qui déborde garde tous ses objets', () => {
    // 5 CD de face : 5 × (14 + 1) = 75 cm > 74 cm.
    const s = parseLibraryState(v6([{ id: 'sh', kind: 'shelf', col: 0, row: 6 }, ...[0, 1, 2, 3, 4].map((i) => st(`c${i}`, i))]));
    const stored = s.rooms[0]!.layout.filter((p) => p.kind === 'stored');
    expect(stored.map((p) => [p.id, (p as { order: number }).order])).toEqual([['c0', 0], ['c1', 1], ['c2', 2], ['c3', 3], ['c4', 4]]);
  });

  it('état initial en v7 ; doublon tablette + ordre écarté', () => {
    expect(createInitialState().version).toBe(7);
    const s = parseLibraryState({ ...v6([]), version: 7, rooms: [{ ...v6([]).rooms[0], layout: [
      { id: 'sh', kind: 'shelf', col: 0, row: 6 },
      { id: 'a', kind: 'stored', shape: 'cd', shelfId: 'sh', level: 0, order: 0, slug: 'A' },
      { id: 'b', kind: 'stored', shape: 'cd', shelfId: 'sh', level: 0, order: 0, slug: 'B' },
      { id: 'c', kind: 'stored', shape: 'book', shelfId: 'sh', level: 1, order: 4, display: 'cover', slug: 'C' },
    ] }] });
    const layout = s.rooms[0]!.layout;
    expect(layout.map((p) => p.id)).toEqual(['sh', 'a', 'c']);
    expect(layout[2]).toMatchObject({ level: 1, order: 0, display: 'cover' });
  });
});
