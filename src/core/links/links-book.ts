export type LinksState = {
  // Dictionnaire partagé : l'indice d'un titre d'article (slug) est son identifiant. Il ne rétrécit jamais.
  titles: string[];
  // Par carte : date de lecture et identifiants des articles cités. Liste vide = carte lue, sans lien (on ne la redemande pas).
  cards: Record<string, { at: number; links: number[] }>;
  // Identifiants des articles liés au moins une fois en minuscule (`[[football]]`) : des notions générales, pas des noms propres.
  concepts?: number[];
};

export const EMPTY_LINKS: LinksState = { titles: [], cards: {} };

// Une lecture de liens : par article, les slugs cités. La clé symbole (invisible pour `Object.entries`) porte en plus les articles
// liés en minuscule, quand le lecteur les connaît.
export const CONCEPTS: unique symbol = Symbol('concepts');
export type FetchedLinks = Record<string, string[]> & { [CONCEPTS]?: string[] };

export const LINKS_MAX_AGE_MS = 30 * 24 * 3_600_000;
// Garde-fou : le stockage de l'appli Android (localStorage) est borné. Une introduction compte en moyenne 85 liens (250 pour
// les plus longues) : la limite ne joue presque jamais.
export const MAX_LINKS_PER_CARD = 400;

// `in` ou l'accès direct verraient « constructor » : on ne regarde que les clés propres.
function entryOf(state: LinksState, slug: string): LinksState['cards'][string] | undefined {
  return Object.prototype.hasOwnProperty.call(state.cards, slug) ? state.cards[slug] : undefined;
}

export function needsLinksLookup(state: LinksState, slug: string, now: number): boolean {
  const entry = entryOf(state, slug);
  return entry === undefined || now - entry.at >= LINKS_MAX_AGE_MS;
}

export function setLinks(state: LinksState, fetched: FetchedLinks, now: number): LinksState {
  const titles = [...state.titles];
  const index = new Map(titles.map((title, id) => [title, id]));
  const idOf = (link: string): number => {
    let id = index.get(link);
    if (id === undefined) {
      id = titles.length;
      titles.push(link);
      index.set(link, id);
    }
    return id;
  };
  const cards = { ...state.cards };
  for (const [slug, list] of Object.entries(fetched)) {
    const ids = new Set<number>();
    for (const link of list) {
      if (link === slug) continue;
      ids.add(idOf(link));
      if (ids.size >= MAX_LINKS_PER_CARD) break;
    }
    cards[slug] = { at: now, links: [...ids] };
  }
  const fresh = fetched[CONCEPTS] ?? [];
  if (fresh.length === 0 && state.concepts === undefined) return { titles, cards };
  const concepts = new Set(state.concepts);
  for (const concept of fresh) concepts.add(idOf(concept));
  return { titles, cards, concepts: [...concepts] };
}

// Les articles liés au moins une fois en minuscule (slugs).
export function conceptsOf(state: LinksState): Set<string> {
  return new Set((state.concepts ?? []).flatMap((id) => state.titles[id] ?? []));
}

// Les articles cités par une carte (slugs), dans l'ordre mémorisé.
export function linksOf(state: LinksState, slug: string): string[] {
  const entry = entryOf(state, slug);
  return entry ? entry.links.flatMap((id) => state.titles[id] ?? []) : [];
}

// Les cartes lues dont l'introduction cite cet article (slugs).
export function citersOf(state: LinksState, slug: string): string[] {
  const id = state.titles.indexOf(slug);
  if (id < 0) return [];
  return Object.entries(state.cards).flatMap(([citer, entry]) => (citer !== slug && entry.links.includes(id) ? [citer] : []));
}
