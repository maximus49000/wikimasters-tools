import type { WebGraph } from './web-graph';

export type Theme = { name: string; color: string };
export type Themes = { list: Theme[]; ofHub: Map<string, number>; ofCard: Map<string, number> };
export type HubEdge = { a: string; b: string; weight: number };
export type BigModel = { edges: HubEdge[]; themes: Themes; hubsOf: Map<string, string[]> };

export const NO_THEME = -1;
export const MAX_THEMES = 8;
// Lisibles sur fond clair et sombre ; l'ordre est celui des thèmes (du plus gros au plus petit).
export const THEME_COLORS = ['#7F77DD', '#D4537E', '#1D9E75', '#BA7517', '#D85A30', '#378ADD', '#639922', '#888780'];
// Un article en relie d'autres par les cartes qu'ils ont en commun : on ne regarde que les trois articles les plus partagés de chaque carte.
const PER_CARD_HUBS = 3;
// Chaque article garde ses liens les plus forts : le dessin et la détection de thèmes restent lisibles.
const PER_HUB_EDGES = 4;
const ROUNDS = 12;

const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

// Les articles de chaque carte, dans l'ordre de `graph.hubs` (du plus au moins partagé).
export function cardHubs(graph: WebGraph): Map<string, string[]> {
  const hubsOf = new Map<string, string[]>();
  for (const hub of graph.hubs) {
    for (const slug of hub.cards) {
      const list = hubsOf.get(slug);
      if (!list) hubsOf.set(slug, [hub.slug]);
      else if (list.length < PER_CARD_HUBS) list.push(hub.slug);
    }
  }
  return hubsOf;
}

export function hubEdges(graph: WebGraph, hubsOf: Map<string, string[]> = cardHubs(graph)): HubEdge[] {
  const weights = new Map<string, number>();
  for (const list of hubsOf.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const key = pairKey(list[i]!, list[j]!);
        weights.set(key, (weights.get(key) ?? 0) + 1);
      }
    }
  }
  const all: HubEdge[] = [...weights].map(([key, weight]) => {
    const [a, b] = key.split('\u0000') as [string, string];
    return { a, b, weight };
  });
  const byHub = new Map<string, HubEdge[]>();
  for (const edge of all) {
    for (const slug of [edge.a, edge.b]) {
      const list = byHub.get(slug);
      if (list) list.push(edge);
      else byHub.set(slug, [edge]);
    }
  }
  // Un lien n'est gardé que s'il fait partie des plus forts de ses DEUX articles : aucun article ne dépasse ainsi PER_HUB_EDGES liens.
  const votes = new Map<HubEdge, number>();
  for (const list of byHub.values()) {
    list.sort((x, y) => y.weight - x.weight || (pairKey(x.a, x.b) < pairKey(y.a, y.b) ? -1 : 1));
    for (const edge of list.slice(0, PER_HUB_EDGES)) votes.set(edge, (votes.get(edge) ?? 0) + 1);
  }
  const kept = [...votes].filter(([, count]) => count === 2).map(([edge]) => edge);
  return kept.sort((x, y) => (pairKey(x.a, x.b) < pairKey(y.a, y.b) ? -1 : 1));
}

// Thèmes = communautés d'articles (propagation d'étiquettes, sans hasard : mêmes données, mêmes thèmes).
export function assignThemes(graph: WebGraph, edges: HubEdge[]): Themes {
  const slugs = graph.hubs.map((hub) => hub.slug);
  const index = new Map(slugs.map((slug, i) => [slug, i]));
  const neighbors: [number, number][][] = slugs.map(() => []);
  for (const edge of edges) {
    const i = index.get(edge.a);
    const j = index.get(edge.b);
    if (i === undefined || j === undefined) continue;
    neighbors[i]!.push([j, edge.weight]);
    neighbors[j]!.push([i, edge.weight]);
  }

  const label = slugs.map((_, i) => i);
  for (let round = 0; round < ROUNDS; round++) {
    let changed = false;
    for (let i = 0; i < slugs.length; i++) {
      if (neighbors[i]!.length === 0) continue;
      const score = new Map<number, number>();
      for (const [j, weight] of neighbors[i]!) score.set(label[j]!, (score.get(label[j]!) ?? 0) + weight);
      let best = label[i]!;
      let bestScore = -1;
      for (const [candidate, value] of score) {
        if (value > bestScore || (value === bestScore && candidate < best)) {
          best = candidate;
          bestScore = value;
        }
      }
      if (best !== label[i]) {
        label[i] = best;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Les groupes, du plus gros (en cartes) au plus petit : les MAX_THEMES premiers sont les thèmes.
  const groups = new Map<number, { hubs: number[]; cards: number }>();
  graph.hubs.forEach((hub, i) => {
    const group = groups.get(label[i]!) ?? { hubs: [], cards: 0 };
    group.hubs.push(i);
    group.cards += hub.cards.length;
    groups.set(label[i]!, group);
  });
  const ranked = [...groups.values()].sort((x, y) => y.cards - x.cards || x.hubs[0]! - y.hubs[0]!);
  const themeOfHub: number[] = slugs.map(() => NO_THEME);
  const list: Theme[] = [];
  ranked.slice(0, MAX_THEMES).forEach((group, t) => {
    for (const i of group.hubs) themeOfHub[i] = t;
    // Les articles sont triés du plus au moins partagé : le premier du groupe donne son nom au thème.
    list.push({ name: graph.hubs[group.hubs[0]!]!.title, color: THEME_COLORS[t]! });
  });
  // Un petit groupe rejoint le thème de son voisin le plus lié, sinon le plus gros thème.
  for (const group of ranked.slice(MAX_THEMES)) {
    for (const i of group.hubs) {
      let best = 0;
      let bestWeight = -1;
      for (const [j, weight] of neighbors[i]!) {
        const t = themeOfHub[j]!;
        if (t !== NO_THEME && weight > bestWeight) {
          best = t;
          bestWeight = weight;
        }
      }
      themeOfHub[i] = best;
    }
  }

  const ofHub = new Map<string, number>();
  slugs.forEach((slug, i) => {
    if (themeOfHub[i] !== NO_THEME) ofHub.set(slug, themeOfHub[i]!);
  });
  // Une carte prend le thème de son article principal (le plus partagé).
  const ofCard = new Map<string, number>();
  for (const hub of graph.hubs) {
    const theme = ofHub.get(hub.slug);
    if (theme === undefined) continue;
    for (const slug of hub.cards) if (!ofCard.has(slug)) ofCard.set(slug, theme);
  }
  return { list, ofHub, ofCard };
}

export function buildBigModel(graph: WebGraph): BigModel {
  const hubsOf = cardHubs(graph);
  const edges = hubEdges(graph, hubsOf);
  return { edges, themes: assignThemes(graph, edges), hubsOf };
}
