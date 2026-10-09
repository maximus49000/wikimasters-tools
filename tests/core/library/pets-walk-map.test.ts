import { describe, expect, it } from 'vitest';
import { CELL_H } from '../../../src/core/library/room-grid';
import type { Layout } from '../../../src/core/library/library-types';
import { buildWalkMap, cellOf, groundLeg, groundPath, isFree, standPoint, toSegments } from '../../../src/core/library/pets/walk-map';

const sofa: Layout = [{ id: 'a', kind: 'sofa', col: 2, row: 12 }];

describe('buildWalkMap', () => {
  it('bloque les cases des meubles au sol, pas celles des tapis ni du mur', () => {
    const map = buildWalkMap([...sofa, { id: 'r', kind: 'rug', col: 2, row: 15 }, { id: 's', kind: 'shelf', col: 12, row: 10 }], 24);
    expect(isFree(map, 2, 12)).toBe(false);
    expect(isFree(map, 7, 14)).toBe(false);
    expect(isFree(map, 8, 14)).toBe(true);
    expect(isFree(map, 2, 15)).toBe(true);
    expect(isFree(map, 12, 12)).toBe(false);
    expect(isFree(map, 12, 11)).toBe(false);
    expect(isFree(map, -1, 15)).toBe(false);
    expect(isFree(map, 24, 15)).toBe(false);
  });

  it('crée une plateforme au dessus du canapé', () => {
    const [plat] = buildWalkMap(sofa, 24).platforms;
    expect(plat!.id).toBe('a');
    expect(plat!.y).toBeCloseTo((12 + 3 * 0.45) * CELL_H, 5);
    expect(plat!.x0).toBe(2 * 30 + 6);
    expect(plat!.x1).toBe(8 * 30 - 6);
  });

  it('standPoint et cellOf sont inverses', () => {
    expect(cellOf(standPoint(5, 14))).toEqual({ col: 5, row: 14 });
  });
});

describe('groundPath', () => {
  const map = buildWalkMap(sofa, 24);

  it('contourne le canapé, case libre par case libre', () => {
    const path = groundPath(map, { col: 0, row: 13 }, { col: 9, row: 13 })!;
    expect(path[0]).toEqual({ col: 0, row: 13 });
    expect(path[path.length - 1]).toEqual({ col: 9, row: 13 });
    expect(path.every((c) => isFree(map, c.col, c.row))).toBe(true);
    for (let i = 1; i < path.length; i++) {
      expect(Math.abs(path[i]!.col - path[i - 1]!.col)).toBeLessThanOrEqual(1);
      expect(Math.abs(path[i]!.row - path[i - 1]!.row)).toBeLessThanOrEqual(1);
    }
  });

  it('refuse une arrivée bloquée', () => {
    expect(groundPath(map, { col: 0, row: 13 }, { col: 3, row: 13 })).toBeNull();
  });
});

describe('segments de marche', () => {
  it('fusionne les points alignés', () => {
    const segs = toSegments([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }], null);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.to).toEqual({ x: 100, y: 0 });
    expect(segs[0]!.ms).toBe(Math.round((100 / 70) * 1000));
  });

  it('marche jusqu une destination dans un meuble, sans trou entre segments', () => {
    const map = buildWalkMap([{ id: 'b', kind: 'basket', col: 10, row: 16 }], 24);
    const from = standPoint(0, 14);
    const to = standPoint(11, 17);
    const segs = groundLeg(map, from, to)!;
    expect(segs[0]!.from).toEqual(from);
    expect(segs[segs.length - 1]!.to).toEqual(to);
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.from).toEqual(segs[i - 1]!.to);
  });

  it('un trajet de longueur nulle donne zéro segment', () => {
    const map = buildWalkMap([], 24);
    expect(groundLeg(map, standPoint(3, 14), standPoint(3, 14))).toEqual([]);
  });
});
