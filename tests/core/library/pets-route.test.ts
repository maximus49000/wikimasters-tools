import { describe, expect, it } from 'vitest';
import type { Layout, Segment } from '../../../src/core/library/library-types';
import { planRoute } from '../../../src/core/library/pets/route';
import { buildWalkMap, standPoint } from '../../../src/core/library/pets/walk-map';

const contiguous = (segs: Segment[]): boolean => segs.every((s, i) => i === 0 || (s.from.x === segs[i - 1]!.to.x && s.from.y === segs[i - 1]!.to.y));

describe('planRoute', () => {
  it('marche au sol vers un point libre', () => {
    const map = buildWalkMap([], 24);
    const segs = planRoute(map, { pt: standPoint(0, 14), on: null }, { pt: standPoint(10, 16), on: null })!;
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.every((s) => s.kind === 'walk' && s.on === null)).toBe(true);
  });

  it('monte sur le canapé par un seul saut', () => {
    const layout: Layout = [{ id: 'a', kind: 'sofa', col: 2, row: 12 }];
    const map = buildWalkMap(layout, 24);
    const plat = map.platforms[0]!;
    const dest = { x: 3.5 * 30, y: plat.y };
    const segs = planRoute(map, { pt: standPoint(0, 16), on: null }, { pt: dest, on: 'a' })!;
    const jumps = segs.filter((s) => s.kind === 'jump');
    expect(jumps).toHaveLength(1);
    expect(jumps[0]).toMatchObject({ fromOn: null, on: 'a' });
    expect(segs[segs.length - 1]!.to).toEqual(dest);
    expect(contiguous(segs)).toBe(true);
  });

  it('descend du canapé au sol', () => {
    const layout: Layout = [{ id: 'a', kind: 'sofa', col: 2, row: 12 }];
    const map = buildWalkMap(layout, 24);
    const plat = map.platforms[0]!;
    const segs = planRoute(map, { pt: { x: 100, y: plat.y }, on: 'a' }, { pt: standPoint(12, 16), on: null })!;
    expect(segs.filter((s) => s.kind === 'jump')).toHaveLength(1);
    expect(segs[segs.length - 1]!.on).toBeNull();
    expect(contiguous(segs)).toBe(true);
  });

  it('atteint le haut d une étagère en passant par le bureau voisin', () => {
    const layout: Layout = [
      // Bureau (75 cm) et étagère (180 cm) côte à côte, pieds sur la même ligne 16 : 105 cm d'écart, un saut de chat (1,5 m au plus).
      { id: 'd', kind: 'desk', col: 14, row: 12 },
      { id: 's', kind: 'shelf', col: 20, row: 7 },
    ];
    const map = buildWalkMap(layout, 36);
    const shelf = map.platforms.find((p) => p.id === 's')!;
    const segs = planRoute(map, { pt: standPoint(2, 16), on: null }, { pt: { x: (shelf.x0 + shelf.x1) / 2, y: shelf.y }, on: 's' })!;
    const jumps = segs.filter((s) => s.kind === 'jump');
    expect(jumps.map((j) => j.on)).toEqual(['d', 's']);
    expect(contiguous(segs)).toBe(true);
  });

  it('ne saute pas plus haut qu un chat : de la table basse (45 cm) à l étagère (180 cm) oui, du sol non', () => {
    const near: Layout = [{ id: 't', kind: 'coffee-table', col: 15, row: 13 }, { id: 's', kind: 'shelf', col: 20, row: 7 }];
    const map = buildWalkMap(near, 36);
    const shelf = map.platforms.find((p) => p.id === 's')!;
    const segs = planRoute(map, { pt: standPoint(2, 16), on: null }, { pt: { x: (shelf.x0 + shelf.x1) / 2, y: shelf.y }, on: 's' })!;
    expect(segs.filter((s) => s.kind === 'jump').map((j) => j.on)).toEqual(['t', 's']);
  });

  it('renvoie null quand l étagère n a aucun marchepied', () => {
    const map = buildWalkMap([{ id: 's', kind: 'shelf', col: 20, row: 7 }], 36);
    const shelf = map.platforms[0]!;
    expect(planRoute(map, { pt: standPoint(2, 16), on: null }, { pt: { x: shelf.x0 + 10, y: shelf.y }, on: 's' })).toBeNull();
  });
});
