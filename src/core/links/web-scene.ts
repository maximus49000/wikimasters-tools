import { cardId, hubId, type WebGraph } from './web-graph';
import { buildGrid, type Grid } from './web-grid';
import type { Point } from './web-layout';
import { NO_THEME, type BigModel, type Theme } from './web-themes';
import type { Bounds, Transform } from './web-view';

// Au-delà de ce nombre de cartes reliées, la toile passe en mode grand (canvas) ; en dessous, le SVG actuel est conservé.
export const BIG_GRAPH = 1500;
// Au plus tant de cartes à l'écran : des cartes (avec images) ; jusqu'à DOTS_MAX : des points ; au-delà : des regroupements.
export const CARDS_MAX = 350;
export const DOTS_MAX = 20000;
// En regroupements, seuls les plus gros articles sont dessinés.
export const CLUSTER_HUBS = 40;
export const GRID_CELL = 16;
const HIT_PX = 16;
const OFFSET = 32768;

export type Level = 'clusters' | 'dots' | 'cards';
export const levelFor = (visible: number): Level => (visible <= CARDS_MAX ? 'cards' : visible <= DOTS_MAX ? 'dots' : 'clusters');

export type SceneHub = { slug: string; title: string; x: number; y: number; cards: number; theme: number; added: boolean };
export type Scene = {
  slugs: string[];
  titles: string[];
  xs: Float32Array;
  ys: Float32Array;
  theme: Int8Array;
  // Indices (dans `hubs`) des deux premiers articles de chaque carte, -1 s'il n'y en a pas.
  hub1: Int16Array;
  hub2: Int16Array;
  cardIndex: Map<string, number>;
  hubs: SceneHub[];
  hubIndex: Map<string, number>;
  // Indices des articles, du plus au moins gros.
  hubOrder: number[];
  hubLinks: [number, number][];
  themes: Theme[];
  // Où écrire le nom de chaque thème : la moyenne de ses articles, pondérée par leur nombre de cartes.
  themeCentres: { x: number; y: number; name: string; color: string }[];
  grid: Grid;
  bounds: Bounds | null;
};

export function buildScene(graph: WebGraph, positions: Record<string, Point>, model: BigModel): Scene {
  const hubIndex = new Map<string, number>();
  const hubs: SceneHub[] = [];
  for (const hub of graph.hubs) {
    const at = positions[hubId(hub.slug)];
    if (!at) continue;
    hubIndex.set(hub.slug, hubs.length);
    hubs.push({
      slug: hub.slug,
      title: hub.title,
      x: at.x,
      y: at.y,
      cards: hub.cards.length,
      theme: model.themes.ofHub.get(hub.slug) ?? NO_THEME,
      added: graph.path?.added.has(hubId(hub.slug)) ?? false,
    });
  }

  const members = graph.cards.filter((card) => positions[cardId(card.slug)]);
  const n = members.length;
  const slugs: string[] = new Array(n);
  const titles: string[] = new Array(n);
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  const theme = new Int8Array(n);
  const hub1 = new Int16Array(n);
  const hub2 = new Int16Array(n);
  const cardIndex = new Map<string, number>();
  members.forEach((card, i) => {
    const at = positions[cardId(card.slug)]!;
    slugs[i] = card.slug;
    titles[i] = card.title;
    xs[i] = at.x;
    ys[i] = at.y;
    theme[i] = model.themes.ofCard.get(card.slug) ?? NO_THEME;
    const list = model.hubsOf.get(card.slug) ?? [];
    hub1[i] = list[0] === undefined ? -1 : (hubIndex.get(list[0]) ?? -1);
    hub2[i] = list[1] === undefined ? -1 : (hubIndex.get(list[1]) ?? -1);
    cardIndex.set(card.slug, i);
  });

  const seen = new Set<string>();
  const hubLinks: [number, number][] = [];
  const addLink = (a: string, b: string) => {
    const i = hubIndex.get(a);
    const j = hubIndex.get(b);
    if (i === undefined || j === undefined || seen.has(`${i}:${j}`)) return;
    seen.add(`${i}:${j}`);
    hubLinks.push([i, j]);
  };
  for (const edge of model.edges) addLink(edge.a, edge.b);
  for (const [a, b] of graph.hubLinks ?? []) addLink(a, b);

  const sums = model.themes.list.map(() => ({ x: 0, y: 0, weight: 0 }));
  for (const hub of hubs) {
    const sum = sums[hub.theme];
    if (!sum) continue;
    sum.x += hub.x * hub.cards;
    sum.y += hub.y * hub.cards;
    sum.weight += hub.cards;
  }
  const themeCentres = model.themes.list.map((entry, t) => ({
    x: sums[t]!.x / Math.max(sums[t]!.weight, 1),
    y: sums[t]!.y / Math.max(sums[t]!.weight, 1),
    name: entry.name,
    color: entry.color,
  }));

  // Étendue calculée avec des nombres seuls : pas d'objet par carte (jusqu'à 200 000).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const hub of hubs) {
    if (hub.x < minX) minX = hub.x;
    if (hub.x > maxX) maxX = hub.x;
    if (hub.y < minY) minY = hub.y;
    if (hub.y > maxY) maxY = hub.y;
  }
  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const bounds: Bounds | null = hubs.length + n === 0 ? null : { minX, minY, maxX, maxY };

  return {
    slugs,
    titles,
    xs,
    ys,
    theme,
    hub1,
    hub2,
    cardIndex,
    hubs,
    hubIndex,
    hubOrder: hubs.map((_, i) => i).sort((a, b) => hubs[b]!.cards - hubs[a]!.cards || a - b),
    hubLinks,
    themes: model.themes.list,
    themeCentres,
    grid: buildGrid(xs, ys, GRID_CELL),
    bounds,
  };
}

export type Cluster = { x: number; y: number; n: number; theme: number };
type Clusters = { cell: number; items: Cluster[]; max: number };
const clusterCache = new WeakMap<Scene, Clusters>();

// Taille d'une cellule de regroupement (unités du dessin) : entre 32 et 64 px à l'écran, par puissances de 2 (peu de recalculs en zoomant).
export const clusterCell = (k: number): number => 2 ** Math.ceil(Math.log2(32 / k));

// Les paquets de cartes par cellule, sur TOUTE la toile (le glissement ne les recalcule pas, seul un changement de cellule le fait).
export function clustersFor(scene: Scene, cell: number): Clusters {
  const cached = clusterCache.get(scene);
  if (cached && cached.cell === cell) return cached;
  const slots = scene.themes.length + 1;
  const groups = new Map<number, { n: number; x: number; y: number; votes: number[] }>();
  for (let i = 0; i < scene.xs.length; i++) {
    const key = (Math.floor(scene.xs[i]! / cell) + OFFSET) * 65536 + (Math.floor(scene.ys[i]! / cell) + OFFSET);
    let group = groups.get(key);
    if (!group) {
      group = { n: 0, x: 0, y: 0, votes: new Array(slots).fill(0) };
      groups.set(key, group);
    }
    group.n += 1;
    group.x += scene.xs[i]!;
    group.y += scene.ys[i]!;
    group.votes[scene.theme[i]! < 0 ? slots - 1 : scene.theme[i]!]! += 1;
  }
  const items: Cluster[] = [];
  let max = 1;
  for (const group of groups.values()) {
    let best = 0;
    for (let s = 1; s < slots; s++) if (group.votes[s]! > group.votes[best]!) best = s;
    items.push({ x: group.x / group.n, y: group.y / group.n, n: group.n, theme: best === slots - 1 ? NO_THEME : best });
    max = Math.max(max, group.n);
  }
  const result = { cell, items, max };
  clusterCache.set(scene, result);
  return result;
}

export type Hit = { kind: 'hub' | 'card'; slug: string };

// Ce que touche le doigt en (px, py) (pixels de la zone) : un article d'abord, puis une carte (jamais en regroupements : elles n'y sont pas dessinées).
export function pickAt(scene: Scene, t: Transform, level: Level, px: number, py: number): Hit | null {
  const count = level === 'clusters' ? Math.min(CLUSTER_HUBS, scene.hubOrder.length) : scene.hubOrder.length;
  let best = -1;
  let bestSquared = HIT_PX * HIT_PX;
  for (let o = 0; o < count; o++) {
    const i = scene.hubOrder[o]!;
    const hub = scene.hubs[i]!;
    const dx = t.x + hub.x * t.k - px;
    const dy = t.y + hub.y * t.k - py;
    const squared = dx * dx + dy * dy;
    if (squared < bestSquared) {
      bestSquared = squared;
      best = i;
    }
  }
  if (best >= 0) return { kind: 'hub', slug: scene.hubs[best]!.slug };
  if (level === 'clusters') return null;
  const card = scene.grid.nearest((px - t.x) / t.k, (py - t.y) / t.k, HIT_PX / t.k);
  return card >= 0 ? { kind: 'card', slug: scene.slugs[card]! } : null;
}
