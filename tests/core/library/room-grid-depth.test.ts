// tests/core/library/room-grid-depth.test.ts
import { describe, expect, it } from 'vitest';
import type { Layout } from '../../../src/core/library/library-types';
import { canHang, canPlace, canShiftDepth, depthOf, freeDepth, moveStanding, placeStanding, shiftDepth, shiftLayout } from '../../../src/core/library/room-grid';
import { depthDefault, footOf, underOf } from '../../../src/core/library/furniture-catalog';

describe('niveaux de profondeur', () => {
  it('donne le niveau par défaut du type', () => {
    expect(depthDefault('shelf')).toBe(1);
    expect(depthDefault('armchair')).toBe(2);
    expect(depthDefault('coffee-table')).toBe(3);
    expect(footOf('shelf')).toBe(2);
    expect(underOf('coffee-table')).toBe(true);
    expect(underOf('sofa')).toBe(false);
  });

  it('lit une pièce ancienne (sans depth) au niveau par défaut', () => {
    const layout: Layout = [{ id: 'a', kind: 'shelf', col: 0, row: 8 }];
    expect(depthOf(layout, layout[0]!)).toBe(1);
  });

  it('met fenêtres et objets accrochés au niveau 0, les objets portés au niveau du porteur', () => {
    const layout: Layout = [
      { id: 'w', kind: 'window', col: 0, row: 1, w: 6, h: 5 },
      { id: 'p', kind: 'wall', shape: 'poster', col: 8, row: 1, slug: 'Paris' },
      { id: 'd', kind: 'desk', col: 10, row: 13, depth: 3 },
      { id: 'c', kind: 'computer', deskId: 'd' },
      { id: 's', kind: 'small', item: 'plant', hostId: 'd', slot: 0 },
      { id: 'sh', kind: 'shelf', col: 20, row: 8 },
      { id: 'st', kind: 'stored', shape: 'book', shelfId: 'sh', slot: 0, slug: 'X' },
    ];
    const at = (id: string) => depthOf(layout, layout.find((p) => p.id === id)!);
    expect([at('w'), at('p'), at('c'), at('s'), at('st')]).toEqual([0, 0, 3, 3, 1]);
  });

  it('superpose une bibliothèque, un fauteuil et une table basse sur les mêmes cases', () => {
    let layout = placeStanding([], 24, 'shelf', 0, 8, 'a')!;
    layout = placeStanding(layout, 24, 'armchair', 1, 13, 'b')!;
    layout = placeStanding(layout, 24, 'coffee-table', 0, 14, 'c')!;
    expect(layout).toHaveLength(3);
    expect(layout.map((p) => depthOf(layout, p))).toEqual([1, 2, 3]);
    // Le niveau par défaut n'est pas écrit.
    expect(layout.every((p) => !('depth' in p))).toBe(true);
  });

  it('se replie sur le niveau libre le plus proche (à égalité, celui de devant)', () => {
    const layout = placeStanding([], 24, 'armchair', 0, 13, 'a')!;
    expect(freeDepth(layout, 24, 'armchair', 0, 13, 2)).toBe(3);
    const placed = placeStanding(layout, 24, 'armchair', 0, 13, 'b')!;
    expect(placed.find((p) => p.id === 'b')).toMatchObject({ depth: 3 });
  });

  it('refuse quand les niveaux 1, 2 et 3 sont pris', () => {
    const layout: Layout = [
      { id: 'a', kind: 'armchair', col: 0, row: 13, depth: 1 },
      { id: 'b', kind: 'armchair', col: 0, row: 13 },
      { id: 'c', kind: 'armchair', col: 0, row: 13, depth: 3 },
    ];
    const res = canPlace(layout, 24, 'chair', 1, 13);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('taken');
    expect(freeDepth(layout, 24, 'chair', 1, 13, 2)).toBeNull();
  });

  it('accroche une affiche derrière une étagère, mais pas sur une autre affiche', () => {
    const layout: Layout = [
      { id: 'a', kind: 'shelf', col: 0, row: 4 },
      { id: 'p', kind: 'wall', shape: 'poster', col: 10, row: 1, slug: 'Paris' },
    ];
    expect(canHang(layout, 24, 'poster', 1, 4).ok).toBe(true);
    expect(canHang(layout, 24, 'poster', 11, 2).ok).toBe(false);
  });

  it('garde son niveau en déplacement s’il est libre, sinon se replie', () => {
    const layout: Layout = [
      { id: 'a', kind: 'armchair', col: 0, row: 13, depth: 3 },
      { id: 'b', kind: 'armchair', col: 10, row: 13, depth: 3 },
    ];
    expect(moveStanding(layout, 24, 'a', 4, 13)!.find((p) => p.id === 'a')).toMatchObject({ depth: 3 });
    const moved = moveStanding(layout, 24, 'a', 10, 13)!.find((p) => p.id === 'a')!;
    expect(depthOf(layout, moved)).toBe(2);
    expect('depth' in moved).toBe(false);
  });

  it('avance et recule dans les bornes 1 à 3, si le niveau visé est libre', () => {
    const layout: Layout = [
      { id: 'a', kind: 'armchair', col: 0, row: 13 },
      { id: 'b', kind: 'coffee-table', col: 0, row: 14 },
    ];
    expect(canShiftDepth(layout, 'a', 1)).toBe(false); // la table basse occupe le niveau 3
    expect(canShiftDepth(layout, 'a', -1)).toBe(true);
    const back = shiftDepth(layout, 'a', -1)!;
    expect(back.find((p) => p.id === 'a')).toMatchObject({ depth: 1 });
    expect(canShiftDepth(back, 'a', -1)).toBe(false); // jamais au niveau 0
    expect(shiftDepth(back, 'a', 1)!.find((p) => p.id === 'a')).not.toHaveProperty('depth');
  });

  it('garde depth quand la pièce est décalée', () => {
    const layout: Layout = [{ id: 'a', kind: 'armchair', col: 12, row: 13, depth: 3 }];
    expect(shiftLayout(layout, -12)[0]).toMatchObject({ col: 0, depth: 3 });
  });
});
