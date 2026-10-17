import { describe, expect, it } from 'vitest';
import { createInitialState, migrateV6, parseLibraryState } from '../../../src/core/library/library-book';
import { SHELF_INNER_CM, shelfLayoutOf } from '../../../src/core/library/room-grid';

const v6 = (layout: unknown[]) => ({ version: 6, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' },
  rooms: [{ id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout }] });
const st = (id: string, slot: number, shape = 'cd', shelfId = 'sh') => ({ id, kind: 'stored', shape, shelfId, slot, slug: `S_${id}` });

describe('migration v7 (rangement adaptatif)', () => {
  it('emplacement → tablette + ordre, sans perte (même tablette, même ordre)', () => {
    const s = parseLibraryState(v6([{ id: 'sh', kind: 'shelf', col: 0, row: 6 }, st('a', 0), st('b', 3, 'dvd'), st('c', 7, 'book'), st('d', 14, 'game')]));
    expect(s.version).toBe(8);
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

  it('une tablette v6 de 5 CD de face migre sans déborder (5 × 14 + 4 = 74 cm)', () => {
    const s = parseLibraryState(v6([{ id: 'sh', kind: 'shelf', col: 0, row: 6 }, ...[0, 1, 2, 3, 4].map((i) => st(`c${i}`, i))]));
    const layout = s.rooms[0]!.layout;
    expect(layout.filter((p) => p.kind === 'stored').map((p) => [p.id, (p as { order: number }).order])).toEqual([['c0', 0], ['c1', 1], ['c2', 2], ['c3', 3], ['c4', 4]]);
    const boxes = shelfLayoutOf(layout, 'sh');
    const last = boxes[boxes.length - 1]!;
    expect(last.x0Cm + last.wCm).toBeLessThanOrEqual(SHELF_INNER_CM);
  });

  it('une tablette qui déborde (6 CD de face, 89 cm) garde tous ses objets à la lecture', () => {
    const six = [0, 1, 2, 3, 4, 5].map((i) => ({ id: `c${i}`, kind: 'stored', shape: 'cd', shelfId: 'sh', level: 0, order: i, slug: `S${i}` }));
    const s = parseLibraryState({ ...v6([]), version: 7, rooms: [{ ...v6([]).rooms[0], layout: [{ id: 'sh', kind: 'shelf', col: 0, row: 6 }, ...six] }] });
    expect(s.rooms[0]!.layout.filter((p) => p.kind === 'stored').map((p) => p.id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5']);
  });

  it('deux pièces, plusieurs étagères, emplacements non contigus sur les trois tablettes : sans perte, même ordre', () => {
    const shelves = (prefix: string) => [{ id: `${prefix}A`, kind: 'shelf', col: 0, row: 6 }, { id: `${prefix}B`, kind: 'shelf', col: 10, row: 6 }];
    const roomA = [...shelves('a'), st('a1', 13, 'dvd', 'aA'), st('a2', 1, 'cd', 'aA'), st('a3', 6, 'book', 'aA'), st('a4', 4, 'game', 'aA'), st('a5', 9, 'cd', 'aA'), st('a6', 11, 'cd', 'aA'),
      st('a7', 2, 'cd', 'aB'), st('a8', 14, 'dvd', 'aB'), st('a9', 7, 'book', 'aB')];
    const roomB = [...shelves('b'), st('b1', 3, 'cd', 'bA'), st('b2', 0, 'cd', 'bA'), st('b3', 12, 'game', 'bA'), st('b4', 5, 'dvd', 'bB'), st('b5', 8, 'cd', 'bB'), st('b6', 10, 'book', 'bB')];
    const raw = v6(roomA);
    raw.rooms.push({ ...raw.rooms[0]!, id: 'r2', name: 'Q', layout: roomB });
    const s = parseLibraryState(raw);
    expect(s.rooms).toHaveLength(2);
    // Attendu : pour chaque étagère et chaque tablette (slot / 5), les objets triés par slot, rangs 0..n−1.
    for (const [i, src] of [roomA, roomB].entries()) {
      const layout = s.rooms[i]!.layout;
      const stored = src.filter((p) => p.kind === 'stored') as ReturnType<typeof st>[];
      expect(layout.filter((p) => p.kind === 'stored')).toHaveLength(stored.length);
      for (const p of stored) {
        const peers = stored.filter((q) => q.shelfId === p.shelfId && Math.floor(q.slot / 5) === Math.floor(p.slot / 5)).sort((x, y) => x.slot - y.slot);
        expect(layout.find((q) => q.id === p.id), p.id).toMatchObject({ shelfId: p.shelfId, shape: p.shape, slug: p.slug, level: Math.floor(p.slot / 5), order: peers.indexOf(p) });
      }
    }
    expect(parseLibraryState(s)).toEqual(s);
  });

  it('état initial en v7 ; doublon tablette + ordre écarté', () => {
    expect(createInitialState().version).toBe(8);
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
