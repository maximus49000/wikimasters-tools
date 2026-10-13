// tests/core/library/room-grid-depth.test.ts
import { describe, expect, it } from 'vitest';
import type { Layout } from '../../../src/core/library/library-types';
import { canHang, canPlace, canShiftRow, depthOf, freeDepth, moveStanding, placeStanding, shiftLayout, shiftRow } from '../../../src/core/library/room-grid';
import { depthDefault, footOf, underOf } from '../../../src/core/library/furniture-catalog';

describe('niveaux de profondeur', () => {
  it('donne le niveau par défaut du type', () => {
    expect(depthDefault('shelf')).toBe(1);
    expect(depthDefault('armchair')).toBe(2);
    expect(depthDefault('coffee-table')).toBe(3);
    expect(footOf('shelf')).toBe(2);
    expect(footOf('sofa')).toBe(3);
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

  it('refuse un meuble sur le pied d’un autre (quel que soit le niveau), accepte devant ou derrière', () => {
    // Étagère : lignes 7 à 14, pieds en lignes 13-14.
    const layout = placeStanding([], 24, 'shelf', 0, 7, 'a')!;
    // Fauteuil (pieds sur ses 3 lignes) en 13-15 : il chevauche les pieds de l'étagère.
    expect(placeStanding(layout, 24, 'armchair', 1, 13, 'b')).toBeNull();
    const res = canPlace(layout, 24, 'armchair', 1, 13);
    expect(res).toMatchObject({ ok: false, reason: 'taken' });
    if (!res.ok) expect(res.cells).toEqual(expect.arrayContaining([{ col: 1, row: 13 }, { col: 1, row: 14 }]));
    // Devant (lignes 15-17) ou derrière (lignes 10-12, devant le mur) : permis.
    expect(placeStanding(layout, 24, 'armchair', 1, 15, 'b')).not.toBeNull();
    expect(placeStanding(layout, 24, 'armchair', 1, 10, 'b')).not.toBeNull();
    // Table basse (pieds sur ses 2 lignes) juste devant l'étagère : permis ; le niveau par défaut n'est pas écrit.
    const withTable = placeStanding(layout, 24, 'coffee-table', 0, 15, 'c')!;
    expect(withTable.every((p) => !('depth' in p))).toBe(true);
  });

  it('deux fauteuils ne se posent jamais au même endroit', () => {
    const layout = placeStanding([], 24, 'armchair', 0, 13, 'a')!;
    expect(freeDepth(layout, 24, 'armchair', 0, 13, 2)).toBeNull();
    expect(placeStanding(layout, 24, 'armchair', 0, 13, 'b')).toBeNull();
    expect(placeStanding(layout, 24, 'armchair', 3, 13, 'b')).not.toBeNull();
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

  it('garde son niveau en déplacement, refuse le pied d’un autre meuble', () => {
    const layout: Layout = [
      { id: 'a', kind: 'armchair', col: 0, row: 13, depth: 3 },
      { id: 'b', kind: 'armchair', col: 10, row: 13, depth: 3 },
    ];
    expect(moveStanding(layout, 24, 'a', 4, 13)!.find((p) => p.id === 'a')).toMatchObject({ depth: 3 });
    expect(moveStanding(layout, 24, 'a', 10, 13)).toBeNull();
    expect(moveStanding(layout, 24, 'a', 9, 15)).toBeNull();
  });

  it('avance (une ligne plus bas) et recule (une ligne plus haut), pieds sur le sol et dans la pièce', () => {
    const layout: Layout = [{ id: 'a', kind: 'armchair', col: 0, row: 14 }]; // pieds en ligne 16
    expect(shiftRow(layout, 24, 'a', 1)!.find((p) => p.id === 'a')).toMatchObject({ row: 15 });
    expect(shiftRow(layout, 24, 'a', -1)!.find((p) => p.id === 'a')).toMatchObject({ row: 13 });
    const bottom: Layout = [{ id: 'a', kind: 'armchair', col: 0, row: 15 }]; // pieds sur la dernière ligne
    expect(canShiftRow(bottom, 24, 'a', 1)).toBe(false);
    const wall: Layout = [{ id: 'a', kind: 'armchair', col: 0, row: 10 }]; // pieds sur la première ligne du sol
    expect(canShiftRow(wall, 24, 'a', -1)).toBe(false);
  });

  it('n’avance pas sur le pied d’un autre meuble', () => {
    const layout: Layout = [
      { id: 'a', kind: 'armchair', col: 0, row: 12 },
      { id: 'b', kind: 'armchair', col: 0, row: 15 },
    ];
    expect(canShiftRow(layout, 24, 'a', 1)).toBe(false);
    expect(canShiftRow(layout, 24, 'a', -1)).toBe(true);
  });

  it('un tapis n’avance ni ne recule', () => {
    const layout: Layout = [{ id: 'r', kind: 'rug', col: 0, row: 14 }];
    expect(canShiftRow(layout, 24, 'r', 1)).toBe(false);
  });

  it('garde depth quand la pièce est décalée', () => {
    const layout: Layout = [{ id: 'a', kind: 'armchair', col: 12, row: 13, depth: 3 }];
    expect(shiftLayout(layout, -12)[0]).toMatchObject({ col: 0, depth: 3 });
  });
});
