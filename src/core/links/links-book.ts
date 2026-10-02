export type LinksState = {
  // Dictionnaire partagé : l'indice d'un titre d'article (slug) est son identifiant. Il ne rétrécit jamais.
  titles: string[];
  // Par carte : date de lecture et identifiants des articles cités. Liste vide = carte lue, sans lien (on ne la redemande pas).
  cards: Record<string, { at: number; links: number[] }>;
};

export const EMPTY_LINKS: LinksState = { titles: [], cards: {} };

export const LINKS_MAX_AGE_MS = 30 * 24 * 3_600_000;
// Garde-fou : le stockage de l'appli Android (localStorage) est borné, un article très long ne doit pas le remplir.
export const MAX_LINKS_PER_CARD = 600;

// `in` ou l'accès direct verraient « constructor » : on ne regarde que les clés propres.
function entryOf(state: LinksState, slug: string): LinksState['cards'][string] | undefined {
  return Object.prototype.hasOwnProperty.call(state.cards, slug) ? state.cards[slug] : undefined;
}

export function needsLinksLookup(state: LinksState, slug: string, now: number): boolean {
  const entry = entryOf(state, slug);
  return entry === undefined || now - entry.at >= LINKS_MAX_AGE_MS;
}

export function setLinks(state: LinksState, fetched: Record<string, string[]>, now: number): LinksState {
  const titles = [...state.titles];
  const index = new Map(titles.map((title, id) => [title, id]));
  const cards = { ...state.cards };
  for (const [slug, list] of Object.entries(fetched)) {
    const ids = new Set<number>();
    for (const link of list) {
      if (link === slug) continue;
      let id = index.get(link);
      if (id === undefined) {
        id = titles.length;
        titles.push(link);
        index.set(link, id);
      }
      ids.add(id);
      if (ids.size >= MAX_LINKS_PER_CARD) break;
    }
    cards[slug] = { at: now, links: [...ids] };
  }
  return { titles, cards };
}

// Les articles cités par une carte (slugs), dans l'ordre mémorisé.
export function linksOf(state: LinksState, slug: string): string[] {
  const entry = entryOf(state, slug);
  return entry ? entry.links.flatMap((id) => state.titles[id] ?? []) : [];
}
