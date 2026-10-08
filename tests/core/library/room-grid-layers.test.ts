import { describe, expect, it } from 'vitest';
import type { Layout } from '../../../src/core/library/library-types';
import { canPlace, isStanding, moveStanding, placeStanding } from '../../../src/core/library/room-grid';

describe('tapis', () => {
  it('se pose entièrement sur le sol', () => {
    const res = canPlace([], 24, 'rug', 0, 11);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('floor');
    expect(canPlace([], 24, 'rug', 0, 12).ok).toBe(true);
    expect(canPlace([], 24, 'rug', 0, 15).ok).toBe(true);
  });

  it('accepte un meuble par-dessus', () => {
    const layout = placeStanding([], 24, 'rug', 2, 15, 'f1')!;
    expect(canPlace(layout, 24, 'sofa', 2, 14).ok).toBe(true);
    expect(canPlace(layout, 24, 'coffee-table', 3, 16).ok).toBe(true);
  });

  it('accepte un tapis sous un meuble déjà posé', () => {
    const layout = placeStanding([], 24, 'sofa', 2, 14, 'f1')!;
    expect(canPlace(layout, 24, 'rug', 2, 15).ok).toBe(true);
  });

  it('refuse deux tapis qui se chevauchent', () => {
    const layout = placeStanding([], 24, 'rug', 2, 15, 'f1')!;
    const res = canPlace(layout, 24, 'rug', 5, 15);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('taken');
    expect(canPlace(layout, 24, 'rug', 8, 15).ok).toBe(true);
  });

  it('un tapis ne gêne pas le déplacement d’un meuble', () => {
    const layout: Layout = [
      { id: 'f1', kind: 'rug', col: 2, row: 15 },
      { id: 'f2', kind: 'sofa', col: 12, row: 14 },
    ];
    expect(moveStanding(layout, 24, 'f2', 3, 14)).not.toBeNull();
  });
});

describe('meubles au sol', () => {
  it('deux meubles au sol ne se chevauchent pas', () => {
    const layout = placeStanding([], 24, 'sofa', 2, 14, 'f1')!;
    const res = canPlace(layout, 24, 'armchair', 6, 14);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('taken');
  });

  it('une table basse se pose devant le canapé', () => {
    const layout = placeStanding([], 24, 'sofa', 2, 12, 'f1')!;
    expect(canPlace(layout, 24, 'coffee-table', 3, 15).ok).toBe(true);
  });

  it('refuse un meuble dont le bas est dans le mur', () => {
    const res = canPlace([], 24, 'plant', 3, 5);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('floor');
  });

  it('isStanding reconnaît les types au sol et pas les autres', () => {
    expect(isStanding({ id: 'a', kind: 'rug', col: 0, row: 15 })).toBe(true);
    expect(isStanding({ id: 'b', kind: 'computer', deskId: 'a' })).toBe(false);
    expect(isStanding({ id: 'c', kind: 'small', item: 'plant', hostId: 'a', slot: 0 })).toBe(false);
  });
});
