import { layoutWeb, type LayoutNode, type Point } from './web-layout';
import { cardId, hubId, type WebGraph } from './web-graph';
import type { BigModel } from './web-themes';

// Écart de la spirale entre deux cartes d'un même endroit, en unités du dessin : à fort zoom (64), cela fait plus de 40 px.
export const SPACING = 7;
// Aucune paire de cartes ne reste plus proche que cela après la dernière passe d'écartement.
export const MIN_DIST = 5;
const GOLDEN_ANGLE = 2.399963229728653;
const ANCHOR_CELL = 24;
const SEPARATE_PASSES = 4;
const OFFSET = 32768;

const keyOf = (cx: number, cy: number): number => (cx + OFFSET) * 65536 + (cy + OFFSET);

// Écarte à la main les points plus proches que `minDist` (comme la dernière passe du placement par forces) ; les points figés ne bougent pas.
export function separate(xs: Float64Array, ys: Float64Array, pinned: Uint8Array, minDist: number, passes: number): void {
  const n = xs.length;
  const heads = new Map<number, number>();
  const next = new Int32Array(n);
  const min2 = minDist * minDist;
  for (let pass = 0; pass < passes; pass++) {
    heads.clear();
    for (let i = 0; i < n; i++) {
      const key = keyOf(Math.floor(xs[i]! / minDist), Math.floor(ys[i]! / minDist));
      next[i] = heads.get(key) ?? -1;
      heads.set(key, i);
    }
    let moved = false;
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(xs[i]! / minDist);
      const cy = Math.floor(ys[i]! / minDist);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          for (let j = heads.get(keyOf(gx, gy)) ?? -1; j !== -1; j = next[j]!) {
            if (j <= i || (pinned[i] && pinned[j])) continue;
            let ddx = xs[i]! - xs[j]!;
            let ddy = ys[i]! - ys[j]!;
            let squared = ddx * ddx + ddy * ddy;
            if (squared >= min2) continue;
            if (squared < 1e-9) {
              ddx = 0.01 + ((i - j) % 7) * 0.001;
              ddy = 0.01;
              squared = ddx * ddx + ddy * ddy;
            }
            const distance = Math.sqrt(squared);
            const push = pinned[i] || pinned[j] ? minDist - distance + 0.01 : (minDist - distance) / 2 + 0.01;
            if (!pinned[i]) {
              xs[i]! += (ddx / distance) * push;
              ys[i]! += (ddy / distance) * push;
            }
            if (!pinned[j]) {
              xs[j]! -= (ddx / distance) * push;
              ys[j]! -= (ddy / distance) * push;
            }
            moved = true;
          }
        }
      }
    }
    if (!moved) break;
  }
}

// Les cartes autour de leurs articles : au milieu de leurs (deux premiers) articles, puis en spirale pour ne pas se superposer.
// Une carte déjà placée (`previous`) garde sa place ; les nouvelles prennent les places suivantes de la spirale.
export function placeCards(
  graph: WebGraph,
  hubs: Record<string, Point>,
  hubsOf: Map<string, string[]>,
  previous: Record<string, Point> = {},
): Record<string, Point> {
  const linked = new Map<string, string[]>();
  for (const [a, b] of graph.cardLinks) {
    (linked.get(a) ?? linked.set(a, []).get(a)!).push(b);
    (linked.get(b) ?? linked.set(b, []).get(b)!).push(a);
  }
  const n = graph.cards.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const pinned = new Uint8Array(n);
  const crowd = new Map<number, number>();
  const placed = new Map<string, number>();

  graph.cards.forEach((card, i) => {
    let ax = 0;
    let ay = 0;
    let known = 0;
    for (const slug of (hubsOf.get(card.slug) ?? []).slice(0, 2)) {
      const hub = hubs[hubId(slug)];
      if (!hub) continue;
      ax += hub.x;
      ay += hub.y;
      known += 1;
    }
    if (known === 0) {
      // Sans article : au milieu des cartes qu'elle cite et qui sont déjà posées.
      for (const other of linked.get(card.slug) ?? []) {
        const at = placed.get(other);
        if (at === undefined) continue;
        ax += xs[at]!;
        ay += ys[at]!;
        known += 1;
      }
    }
    if (known > 0) {
      ax /= known;
      ay /= known;
    }
    const key = keyOf(Math.floor(ax / ANCHOR_CELL), Math.floor(ay / ANCHOR_CELL));
    const slot = crowd.get(key) ?? 0;
    crowd.set(key, slot + 1);
    const before = previous[cardId(card.slug)];
    if (before) {
      xs[i] = before.x;
      ys[i] = before.y;
      pinned[i] = 1;
    } else {
      const angle = slot * GOLDEN_ANGLE;
      const radius = SPACING * Math.sqrt(slot);
      xs[i] = ax + radius * Math.cos(angle);
      ys[i] = ay + radius * Math.sin(angle);
    }
    placed.set(card.slug, i);
  });

  separate(xs, ys, pinned, MIN_DIST, SEPARATE_PASSES);

  const out: Record<string, Point> = {};
  graph.cards.forEach((card, i) => {
    out[cardId(card.slug)] = pinned[i] ? (previous[cardId(card.slug)] as Point) : { x: xs[i]!, y: ys[i]! };
  });
  return out;
}

// Un article a besoin de place pour son nuage de cartes : sa taille dans le placement croît avec la racine de son nombre de cartes.
const hubRoom = (cards: number): number => Math.min(300, 0.5 * SPACING * Math.sqrt(cards)) + 8;

// Placement du mode grand : les articles par forces (≤ 300 nœuds : coût borné, quel que soit le nombre de cartes), les cartes autour.
export function layoutBig(graph: WebGraph, previous: Record<string, Point>, model: BigModel): Record<string, Point> {
  const nodes: LayoutNode[] = graph.hubs.map((hub) => ({ id: hubId(hub.slug), radius: hubRoom(hub.cards.length) }));
  const edges: [string, string][] = [
    ...model.edges.map((edge): [string, string] => [hubId(edge.a), hubId(edge.b)]),
    ...(graph.hubLinks ?? []).map(([a, b]): [string, string] => [hubId(a), hubId(b)]),
  ];
  const hubPrevious: Record<string, Point> = {};
  for (const hub of graph.hubs) {
    const before = previous[hubId(hub.slug)];
    if (before) hubPrevious[hubId(hub.slug)] = before;
  }
  const hubs = nodes.length === 0 ? {} : layoutWeb(nodes, edges, hubPrevious);
  return { ...hubs, ...placeCards(graph, hubs, model.hubsOf, previous) };
}
