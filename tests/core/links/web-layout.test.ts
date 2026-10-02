import { describe, expect, it } from 'vitest';
import { createLayout, layoutWeb, type LayoutNode, type Point } from '../../../src/core/links/web-layout';

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

  it('ne superpose jamais deux nœuds, même dans un graphe dense', () => {
    const nodes: LayoutNode[] = [
      ...Array.from({ length: 120 }, (_, i) => ({ id: `c${i}`, radius: 22 })),
      ...Array.from({ length: 12 }, (_, i) => ({ id: `h${i}`, radius: 10 })),
    ];
    // Chaque carte cite les mêmes quelques points : tout pousse vers le même endroit.
    const edges = nodes.slice(0, 120).flatMap((card, i) => [0, 1, 2].map((k) => [card.id, `h${(i + k) % 12}`] as const));
    const positions = layoutWeb(nodes, edges);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i] as LayoutNode;
        const b = nodes[j] as LayoutNode;
        const minimum = (a.radius ?? 12) + (b.radius ?? 12);
        expect(dist(positions[a.id] as Point, positions[b.id] as Point)).toBeGreaterThanOrEqual(minimum - 0.5);
      }
    }
  });

  it('repart des positions précédentes et les rend telles quelles sans itération', () => {
    const positions = layoutWeb([{ id: 'a' }, { id: 'b' }], [['a', 'b']], { a: { x: 5, y: 7 } }, 0);
    expect(positions['a']).toEqual({ x: 5, y: 7 });
    expect(positions['b']).toBeDefined();
  });

  it('place un nouveau nœud près de ses voisins déjà placés', () => {
    const positions = layoutWeb([{ id: 'a' }, { id: 'b' }], [['a', 'b']], { a: { x: 400, y: -300 } }, 0);
    expect(dist(positions['b'] as Point, { x: 400, y: -300 })).toBeLessThan(80);
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

describe('createLayout', () => {
  it('donne le même dessin en plusieurs tranches de temps que d’un seul coup', () => {
    const { nodes, edges } = star('h', 20);
    const sliced = createLayout(nodes, edges);
    let calls = 0;
    // Un budget nul n'avance que d'une itération à la fois : le calcul est repris appel après appel.
    while (!sliced.run(0)) calls++;
    expect(calls).toBeGreaterThan(10);
    expect(sliced.positions()).toEqual(layoutWeb(nodes, edges));
  });

  it('rend des positions utilisables avant la fin du calcul', () => {
    const { nodes, edges } = star('h', 20);
    const layout = createLayout(nodes, edges);
    layout.run(0);
    const positions = layout.positions();
    expect(Object.keys(positions)).toHaveLength(nodes.length);
  });
});
