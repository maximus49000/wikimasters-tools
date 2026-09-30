export type KnownCard = { slug: string; title: string };

// Clé : slug de l'article Wikipédia.
export type CollectionState = Record<string, KnownCard>;

// Renvoie `state` lui-même quand rien ne change : l'appelant évite alors d'écrire pour rien.
export function mergeCards(state: CollectionState, cards: KnownCard[]): CollectionState {
  let next = state;
  for (const card of cards) {
    if (next[card.slug]?.title === card.title) continue;
    if (next === state) next = { ...state };
    next[card.slug] = { slug: card.slug, title: card.title };
  }
  return next;
}
