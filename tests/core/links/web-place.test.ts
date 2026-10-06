import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import type { WebGraph } from '../../../src/core/links/web-graph';
import type { Point } from '../../../src/core/links/web-layout';
import { MIN_DIST, layoutBig, placeCards, separate } from '../../../src/core/links/web-place';
import { buildBigModel } from '../../../src/core/links/web-themes';

const card = (slug: string) => ({ slug, title: slug }) as KnownCard;
const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const graph = (hubs: Record<string, string[]>): WebGraph => ({
  cards: [...new Set(Object.values(hubs).flat())].map(card),
  hubs: Object.entries(hubs).map(([slug, cards]) => ({ slug, title: slug, cards })),
  cardLinks: [],
  hiddenHubs: 0,
});
const minDistance = (positions: Record<string, Point>, prefix: string) => {
  const list = Object.entries(positions).filter(([id]) => id.startsWith(prefix)).map(([, p]) => p);
  let min = Infinity;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) min = Math.min(min, Math.hypot(list[i]!.x - list[j]!.x, list[i]!.y - list[j]!.y));
  return min;
};

describe('separate', () => {
  it('écarte des points superposés sans bouger les points figés', () => {
    const xs = new Float64Array([0, 0, 0.5, 100]);
    const ys = new Float64Array([0, 0, 0, 100]);
    const pinned = new Uint8Array([1, 0, 0, 0]);
    separate(xs, ys, pinned, 10, 20);
    expect([xs[0], ys[0]]).toEqual([0, 0]);
    expect(Math.hypot(xs[1]! - xs[0]!, ys[1]! - ys[0]!)).toBeGreaterThanOrEqual(9.9);
    expect(Math.hypot(xs[2]! - xs[1]!, ys[2]! - ys[1]!)).toBeGreaterThanOrEqual(9.9);
    expect([xs[3], ys[3]]).toEqual([100, 100]);
  });
});

describe('placeCards', () => {
  const g = graph({ A: many('a', 60), B: many('b', 60) });
  const hubs = { 'h:A': { x: 0, y: 0 }, 'h:B': { x: 2000, y: 0 } };
  const hubsOf = buildBigModel(g).hubsOf;

  it('place chaque carte près de son article, sans chevauchement', () => {
    const placed = placeCards(g, hubs, hubsOf);
    expect(Object.keys(placed)).toHaveLength(120);
    for (let i = 0; i < 60; i++) {
      const p = placed[`c:a${i}`]!;
      expect(Math.hypot(p.x, p.y)).toBeLessThan(250);
    }
    expect(minDistance(placed, 'c:')).toBeGreaterThanOrEqual(MIN_DIST * 0.9);
  });

  it('pose une carte reliée à deux articles entre eux', () => {
    const shared = graph({ A: [...many('a', 5), 'x'], B: [...many('b', 5), 'x'] });
    const placed = placeCards(shared, hubs, buildBigModel(shared).hubsOf);
    expect(placed['c:x']!.x).toBeGreaterThan(500);
    expect(placed['c:x']!.x).toBeLessThan(1500);
  });

  it('est déterministe', () => {
    expect(placeCards(g, hubs, hubsOf)).toEqual(placeCards(g, hubs, hubsOf));
  });

  it('ne déplace aucune carte déjà placée quand une carte s\'ajoute', () => {
    const before = placeCards(g, hubs, hubsOf);
    const grown = graph({ A: [...many('a', 60), 'nouvelle'], B: many('b', 60) });
    const after = placeCards(grown, hubs, buildBigModel(grown).hubsOf, before);
    for (const [id, p] of Object.entries(before)) expect(after[id]).toEqual(p);
    expect(after['c:nouvelle']).toBeDefined();
  });
});

describe('layoutBig', () => {
  const g = graph({ A: many('a', 80), B: many('b', 80), C: many('c', 30) });
  const model = buildBigModel(g);

  it('place les articles et toutes les cartes, avec des nombres finis', () => {
    const positions = layoutBig(g, {}, model);
    expect(Object.keys(positions)).toHaveLength(3 + 190);
    for (const p of Object.values(positions)) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('est déterministe et stable quand la toile grandit', () => {
    const first = layoutBig(g, {}, model);
    expect(layoutBig(g, {}, model)).toEqual(first);
    const grown = graph({ A: [...many('a', 80), 'n1', 'n2'], B: many('b', 80), C: many('c', 30) });
    const next = layoutBig(grown, first, buildBigModel(grown));
    for (const [id, p] of Object.entries(first)) expect(next[id]).toEqual(p);
  });
});
