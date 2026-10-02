import type { KnownCard } from '../collection/collection-book';
import { slugToTitle } from '../market/market-book';
import { linksOf, type LinksState } from './links-book';
import { cardId, hubId, type WebGraph, type WebHub } from './web-graph';

const pairKey = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

// La toile avec, en plus, le chemin trouvé entre deux cartes : ses articles qui ne sont pas des cartes deviennent des points, reliés
// à leurs voisins du chemin ; chaque point est aussi relié aux cartes de la Collection qu'il cite ou qui le citent (liens déjà lus).
// Les cartes du chemin sont ajoutées même si elles n'avaient aucun trait ou si le filtre les écarte.
export function withPath(graph: WebGraph, cards: KnownCard[], links: LinksState, path: string[]): WebGraph {
  if (path.length === 0) return graph;
  const owned = new Map(cards.map((card) => [card.slug, card]));
  const shownCards = new Map(graph.cards.map((card) => [card.slug, card]));
  const hubs = new Map<string, WebHub>(graph.hubs.map((hub) => [hub.slug, { ...hub, cards: [...hub.cards] }]));
  const cardLinks = new Map(graph.cardLinks.map(([a, b]) => [`${a}\u0000${b}`, [a, b] as [string, string]]));
  const hubLinks = new Map((graph.hubLinks ?? []).map(([a, b]) => [`${a}\u0000${b}`, [a, b] as [string, string]]));
  const added = new Set<string>();

  const showCard = (slug: string) => {
    const card = owned.get(slug);
    if (card) shownCards.set(slug, card);
  };
  const hubOf = (slug: string): WebHub => {
    let hub = hubs.get(slug);
    if (!hub) {
      hub = { slug, title: slugToTitle(slug), cards: [] };
      hubs.set(slug, hub);
      added.add(hubId(slug));
    }
    return hub;
  };
  const attach = (hub: WebHub, cardSlug: string) => {
    if (!hub.cards.includes(cardSlug)) hub.cards.push(cardSlug);
    showCard(cardSlug);
  };

  for (const slug of path) {
    if (owned.has(slug)) showCard(slug);
    else hubOf(slug);
  }
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i] as string;
    const b = path[i + 1] as string;
    const ownedA = owned.has(a);
    const ownedB = owned.has(b);
    if (ownedA && ownedB) {
      const [x, y] = pairKey(a, b);
      cardLinks.set(`${x}\u0000${y}`, [x, y]);
    } else if (ownedA || ownedB) {
      attach(hubOf(ownedA ? b : a), ownedA ? a : b);
    } else {
      const [x, y] = pairKey(a, b);
      hubLinks.set(`${x}\u0000${y}`, [x, y]);
    }
  }

  // Les liaisons nouvelles avec la Collection : les cartes qui citent un article du chemin, et les cartes que cet article cite.
  const pathHubs = path.filter((slug) => !owned.has(slug));
  if (pathHubs.length > 0) {
    const wanted = new Set(pathHubs);
    for (const card of cards) {
      for (const link of linksOf(links, card.slug)) if (wanted.has(link)) attach(hubOf(link), card.slug);
    }
    for (const slug of pathHubs) for (const link of linksOf(links, slug)) if (owned.has(link)) attach(hubOf(slug), link);
  }

  const nodeId = (slug: string) => (owned.has(slug) ? cardId(slug) : hubId(slug));
  const ids = new Set(path.map(nodeId));
  const edges = new Set<string>();
  for (let i = 0; i + 1 < path.length; i++) {
    const a = nodeId(path[i] as string);
    const b = nodeId(path[i + 1] as string);
    edges.add(`${a}\u0000${b}`);
    edges.add(`${b}\u0000${a}`);
  }
  return {
    ...graph,
    cards: [...shownCards.values()],
    hubs: [...hubs.values()],
    cardLinks: [...cardLinks.values()],
    hubLinks: [...hubLinks.values()],
    path: { ids, edges, added },
  };
}
