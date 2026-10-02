import type { KnownCard } from '../collection/collection-book';
import { slugToTitle, titleToSlug } from '../market/market-book';
import { linksOf, type LinksState } from './links-book';
import type { LayoutNode } from './web-layout';

export const MIN_SHARED = 2;
// Au-delà, le dessin devient illisible et lent : on garde les points les plus partagés.
export const MAX_HUBS = 300;
// Un point cité par plus de cette part des cartes affichées (et par au moins GENERIC_MIN cartes) est « générique » : « France » relie
// tout et n'apprend rien. Il passe après les autres et n'est affiché que s'il reste de la place sous la limite.
export const GENERIC_SHARE = 0.3;
export const GENERIC_MIN = 30;

// Pages citées dans les références de l'introduction, qui ne disent rien du sujet d'un article : identifiants, bibliothèques, archives,
// prononciation (« API a », « API o »…).
const IGNORED = new Set(
  [
    'International Standard Book Number',
    'International Standard Serial Number',
    'Digital Object Identifier',
    'Internet Archive',
    "Autorité (sciences de l'information)",
    'Bibliothèque nationale de France',
    'Système universitaire de documentation',
    'Virtual International Authority File',
    'WorldCat',
    'Wikidata',
    'Wikimedia Commons',
    'Alphabet phonétique international',
  ].map(titleToSlug),
);
const isIgnored = (slug: string): boolean => IGNORED.has(slug) || /^API_.{1,2}$/.test(slug);

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

// Taille des nœuds dans le dessin : une carte est un carré de 34, un point un disque d'autant plus gros qu'il relie de cartes.
export const CARD_SIZE = 34;
export const hubRadius = (cards: number): number => Math.min(14, 4 + 2 * Math.sqrt(cards));
// Rayon réservé autour d'une carte ou d'un point dans le placement : le nœud, plus la marge de son cadre.
const CARD_ROOM = 22;
const HUB_ROOM = 3;

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
      } else if (!owned.has(link) && !isIgnored(link)) {
        const list = citedBy.get(link);
        if (list) list.push(card.slug);
        else citedBy.set(link, [card.slug]);
      }
    }
  }
  if (citedBy.size === 0 && cardLinks.length === 0) return EMPTY_WEB;

  const generic = Math.max(GENERIC_MIN, GENERIC_SHARE * shown.length);
  const shared = [...citedBy]
    .filter(([, list]) => list.length >= limits.minShared)
    .sort(
      ([slugA, a], [slugB, b]) =>
        Number(a.length > generic) - Number(b.length > generic) || b.length - a.length || slugA.localeCompare(slugB, 'fr'),
    );
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

// Ce que le placement reçoit : un nœud par carte et par point, une arête par trait.
export function webNodes(graph: WebGraph): LayoutNode[] {
  return [
    ...graph.cards.map((card) => ({ id: cardId(card.slug), radius: CARD_ROOM })),
    ...graph.hubs.map((hub) => ({ id: hubId(hub.slug), radius: hubRadius(hub.cards.length) + HUB_ROOM })),
  ];
}

export function webEdges(graph: WebGraph): [string, string][] {
  return [
    ...graph.hubs.flatMap((hub) => hub.cards.map((slug): [string, string] => [hubId(hub.slug), cardId(slug)])),
    ...graph.cardLinks.map(([a, b]): [string, string] => [cardId(a), cardId(b)]),
  ];
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
