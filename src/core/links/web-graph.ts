import type { KnownCard } from '../collection/collection-book';
import { slugToTitle } from '../market/market-book';
import { linksOf, type LinksState } from './links-book';

export const MIN_SHARED = 2;
// Au-delà, le dessin devient illisible et lent : on garde les points les plus partagés.
export const MAX_HUBS = 300;

export type WebHub = { slug: string; title: string; cards: string[] };
export type WebGraph = {
  // Cartes visibles ayant au moins un trait.
  cards: KnownCard[];
  hubs: WebHub[];
  // Une carte en cite une autre : paires de slugs triées, sans doublon.
  cardLinks: [string, string][];
  // Points partagés non affichés à cause de la limite.
  hiddenHubs: number;
};

export const cardId = (slug: string): string => `c:${slug}`;
export const hubId = (slug: string): string => `h:${slug}`;

const EMPTY_WEB: WebGraph = { cards: [], hubs: [], cardLinks: [], hiddenHubs: 0 };

// Cartes (filtrées par `visible`) reliées par les articles qu'elles citent en commun, ou en se citant entre elles.
// Un article qui est une carte de la Collection n'est jamais un point : il est une carte, ou rien si le filtre l'écarte.
export function buildWeb(
  cards: KnownCard[],
  links: LinksState,
  visible: ReadonlySet<string> | null,
  limits: { minShared: number; maxHubs: number } = { minShared: MIN_SHARED, maxHubs: MAX_HUBS },
): WebGraph {
  const shown = visible ? cards.filter((card) => visible.has(card.slug)) : cards;
  const shownSlugs = new Set(shown.map((card) => card.slug));
  const owned = new Set(cards.map((card) => card.slug));
  const citedBy = new Map<string, string[]>();
  const pairs = new Set<string>();
  const cardLinks: [string, string][] = [];

  for (const card of shown) {
    for (const link of linksOf(links, card.slug)) {
      if (shownSlugs.has(link)) {
        const [a, b] = card.slug < link ? [card.slug, link] : [link, card.slug];
        const key = `${a}\u0000${b}`;
        if (!pairs.has(key)) {
          pairs.add(key);
          cardLinks.push([a, b]);
        }
      } else if (!owned.has(link)) {
        const list = citedBy.get(link);
        if (list) list.push(card.slug);
        else citedBy.set(link, [card.slug]);
      }
    }
  }
  if (citedBy.size === 0 && cardLinks.length === 0) return EMPTY_WEB;

  const shared = [...citedBy]
    .filter(([, list]) => list.length >= limits.minShared)
    .sort(([slugA, a], [slugB, b]) => b.length - a.length || slugA.localeCompare(slugB, 'fr'));
  const hubs = shared.slice(0, limits.maxHubs).map(([slug, list]) => ({ slug, title: slugToTitle(slug), cards: list }));

  const linked = new Set<string>();
  for (const hub of hubs) for (const slug of hub.cards) linked.add(slug);
  for (const [a, b] of cardLinks) {
    linked.add(a);
    linked.add(b);
  }
  return {
    cards: shown.filter((card) => linked.has(card.slug)),
    hubs,
    cardLinks,
    hiddenHubs: shared.length - hubs.length,
  };
}

export type Focus = { kind: 'card' | 'hub'; slug: string };

// Ce qui reste allumé quand on touche un nœud : lui-même et ses voisins directs.
export function neighborhood(graph: WebGraph, focus: Focus): { focusId: string; lit: Set<string> } {
  if (focus.kind === 'hub') {
    const hub = graph.hubs.find((candidate) => candidate.slug === focus.slug);
    const focusId = hubId(focus.slug);
    return { focusId, lit: new Set([focusId, ...(hub?.cards ?? []).map(cardId)]) };
  }
  const focusId = cardId(focus.slug);
  const lit = new Set([focusId]);
  for (const hub of graph.hubs) if (hub.cards.includes(focus.slug)) lit.add(hubId(hub.slug));
  for (const [a, b] of graph.cardLinks) {
    if (a === focus.slug) lit.add(cardId(b));
    else if (b === focus.slug) lit.add(cardId(a));
  }
  return { focusId, lit };
}
