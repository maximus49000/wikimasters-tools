import { describe, expect, it } from 'vitest';
import { layoutWeb, type Point } from '../../../src/core/links/web-layout';

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const star = (hub: string, leaves: number) => ({
  nodes: [{ id: hub }, ...Array.from({ length: leaves }, (_, i) => ({ id: `${hub}-${i}` }))],
  edges: Array.from({ length: leaves }, (_, i) => [hub, `${hub}-${i}`] as const),
});

describe('layoutWeb', () => {
  it('rend un objet vide sans nœud et un point fini pour un seul nœud', () => {
    expect(layoutWeb([], [])).toEqual({});
    const alone = layoutWeb([{ id: 'a' }], [])['a'];
    expect(Number.isFinite(alone?.x)).toBe(true);
    expect(Number.isFinite(alone?.y)).toBe(true);
  });

  it('est déterministe', () => {
    const { nodes, edges } = star('h', 6);
    expect(layoutWeb(nodes, edges)).toEqual(layoutWeb(nodes, edges));
  });

  it('rapproche les nœuds reliés et éloigne les groupes sans lien', () => {
    const a = star('a', 5);
    const b = star('b', 5);
    const positions = layoutWeb([...a.nodes, ...b.nodes], [...a.edges, ...b.edges]);
    const near = (hub: string, leaf: string) => dist(positions[hub] as Point, positions[leaf] as Point);
    const own = Array.from({ length: 5 }, (_, i) => near('a', `a-${i}`));
    const other = Array.from({ length: 5 }, (_, i) => near('b', `a-${i}`));
    const mean = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / list.length;
    expect(mean(own)).toBeLessThan(mean(other));
  });

  it('ne superpose pas deux nœuds', () => {
    const { nodes, edges } = star('h', 12);
    const positions = layoutWeb(nodes, edges);
    const points = nodes.map((node) => positions[node.id] as Point);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) expect(dist(points[i] as Point, points[j] as Point)).toBeGreaterThan(8);
    }
  });

  it('repart des positions précédentes et les rend telles quelles sans itération', () => {
    const positions = layoutWeb([{ id: 'a' }, { id: 'b' }], [['a', 'b']], { a: { x: 5, y: 7 } }, 0);
    expect(positions['a']).toEqual({ x: 5, y: 7 });
    expect(positions['b']).toBeDefined();
  });

  it('garde les anciens nœuds près de leur place quand un nouveau arrive', () => {
    const { nodes, edges } = star('h', 6);
    const first = layoutWeb(nodes, edges);
    const grown = layoutWeb([...nodes, { id: 'h-6' }], [...edges, ['h', 'h-6'] as const], first);
    const moved = nodes.map((node) => dist(first[node.id] as Point, grown[node.id] as Point));
    expect(Math.max(...moved)).toBeLessThan(120);
  });

  it('ignore une arête vers un nœud inconnu', () => {
    const positions = layoutWeb([{ id: 'a' }, { id: 'b' }], [['a', 'zzz'], ['a', 'b']]);
    expect(Object.keys(positions).sort()).toEqual(['a', 'b']);
  });

  it('place un grand graphe en restant fini', { timeout: 20_000 }, () => {
    const nodes = Array.from({ length: 1000 }, (_, i) => ({ id: `n${i}` }));
    const edges = Array.from({ length: 3000 }, (_, i) => [`n${i % 1000}`, `n${(i * 7 + 13) % 1000}`] as const);
    const positions = layoutWeb(nodes, edges);
    for (const node of nodes) {
      const point = positions[node.id] as Point;
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    }
  });
});
