import { describe, expect, it } from 'vitest';
import { parseLibraryState } from '../../../src/core/library/library-book';
import { canPlace, rectOf } from '../../../src/core/library/room-grid';

const v5 = (layout: unknown[]) => ({ version: 5, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' },
  rooms: [{ id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout }] });

describe('migration v6', () => {
  it('garde la colonne et la dernière rangée au sol, prend la nouvelle taille', () => {
    const s = parseLibraryState(v5([{ id: 'a', kind: 'shelf', col: 0, row: 6 }]));
    expect(s.version).toBe(6);
    const shelf = s.rooms[0]!.layout[0]!;
    const r = rectOf(shelf)!;
    expect(r.col).toBe(0);
    expect(r.row + r.h - 1).toBe(13); // ancienne dernière rangée : 6 + 8 − 1
  });
  it('un meuble agrandi qui déborde est déplacé à la place libre la plus proche, jamais supprimé', () => {
    const s = parseLibraryState(v5([{ id: 'a', kind: 'sofa', col: 18, row: 14 }]));
    const sofa = s.rooms[0]!.layout.find((p) => p.id === 'a')!;
    const r = rectOf(sofa)!;
    expect(r.col + r.w).toBeLessThanOrEqual(24);
  });
  it('deux meubles qui se chevauchent après agrandissement sont séparés quand une place existe', () => {
    const s = parseLibraryState(v5([{ id: 'a', kind: 'sofa', col: 0, row: 14 }, { id: 'b', kind: 'armchair', col: 7, row: 14 }]));
    const layout = s.rooms[0]!.layout;
    const b = layout.find((p) => p.id === 'b')!;
    expect(canPlace(layout, 24, 'armchair', (b as { col: number }).col, (b as { row: number }).row, 'b').ok).toBe(true);
  });
  it('sans aucune place, le meuble est gardé tel quel', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, kind: 'sofa', col: (i % 4) * 6, row: 12 + Math.floor(i / 4) * 2 }));
    const s = parseLibraryState(v5(many));
    expect(s.rooms[0]!.layout).toHaveLength(12);
  });
  it('idempotente', () => {
    const once = parseLibraryState(v5([{ id: 'a', kind: 'sofa', col: 0, row: 14 }, { id: 'b', kind: 'chair', col: 12, row: 13 }]));
    expect(parseLibraryState(once)).toEqual(once);
  });
});
