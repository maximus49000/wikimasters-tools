import { describe, expect, it } from 'vitest';
import { createLayout, layoutWeb, samePositions, type LayoutNode, type Point } from '../../../src/core/links/web-layout';

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

  it('ne bouge pas les nœuds déjà placés quand la toile grandit, et place les nouveaux sans chevauchement', () => {
    const { nodes, edges } = star('h', 30);
    const first = layoutWeb(nodes, edges);
    const grownNodes = [...nodes, ...Array.from({ length: 6 }, (_, i) => ({ id: `new-${i}` }))];
    const grownEdges = [...edges, ...Array.from({ length: 6 }, (_, i) => ['h', `new-${i}`] as const)];
    const grown = layoutWeb(grownNodes, grownEdges, first);

    for (const node of nodes) expect(grown[node.id]).toEqual(first[node.id]);
    const added = grownNodes.slice(nodes.length);
    for (const node of added) {
      for (const other of grownNodes) {
        if (other.id !== node.id) expect(dist(grown[node.id] as Point, grown[other.id] as Point)).toBeGreaterThan(20);
      }
    }
  });

  it('rend le même dessin quand le graphe n’a pas changé, relance après relance', () => {
    const { nodes, edges } = star('h', 20);
    let positions = layoutWeb(nodes, edges);
    const first = positions;
    for (let run = 0; run < 3; run++) positions = layoutWeb(nodes, edges, positions);
    expect(positions).toEqual(first);
  });

  it('repart de zéro quand le graphe change beaucoup (un filtre ne garde que quelques nœuds)', () => {
    const { nodes, edges } = star('h', 60);
    const wide = layoutWeb(nodes, edges);
    const kept = nodes.slice(0, 8);
    const keptEdges = edges.filter(([, leaf]) => kept.some((node) => node.id === leaf));
    const narrow = layoutWeb(kept, keptEdges, wide);

    const extent = (positions: Record<string, Point>, ids: string[]) => {
      const xs = ids.map((id) => (positions[id] as Point).x);
      return Math.max(...xs) - Math.min(...xs);
    };
    const ids = kept.map((node) => node.id);
    expect(extent(narrow, ids)).toBeLessThan(extent(wide, ids) / 2);
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

describe('layoutWeb, grande toile qui grandit', () => {
  it('ajoute quelques nœuds à un grand graphe sans rien bouger ni tout recalculer', { timeout: 30_000 }, () => {
    const nodes = Array.from({ length: 1500 }, (_, i) => ({ id: `n${i}` }));
    const edges = Array.from({ length: 4500 }, (_, i) => [`n${i % 1500}`, `n${(i * 7 + 13) % 1500}`] as const);
    const first = layoutWeb(nodes, edges);

    const more = [...nodes, ...Array.from({ length: 12 }, (_, i) => ({ id: `m${i}` }))];
    const moreEdges = [...edges, ...Array.from({ length: 24 }, (_, i) => [`m${i % 12}`, `n${(i * 31) % 1500}`] as const)];
    const start = performance.now();
    const grown = layoutWeb(more, moreEdges, first);
    const ms = performance.now() - start;

    for (const node of nodes) expect(grown[node.id]).toEqual(first[node.id]);
    expect(Object.keys(grown)).toHaveLength(1512);
    // Seuls les nouveaux nœuds se calculent : bien moins que la première fois.
    expect(ms).toBeLessThan(3000);
  });
});

describe('samePositions', () => {
  it('reconnaît deux placements identiques, et le moindre écart', () => {
    const a = { x: { x: 1, y: 2 }, y: { x: 3, y: 4 } };
    expect(samePositions(a, { x: { x: 1, y: 2 }, y: { x: 3, y: 4 } })).toBe(true);
    expect(samePositions(a, { x: { x: 1, y: 2 }, y: { x: 3, y: 4.5 } })).toBe(false);
    expect(samePositions(a, { x: { x: 1, y: 2 } })).toBe(false);
    expect(samePositions(a, { x: { x: 1, y: 2 }, z: { x: 3, y: 4 } })).toBe(false);
    expect(samePositions({}, {})).toBe(true);
  });
});
