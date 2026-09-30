// `rarity` et `imageUrl` viennent de l'API de la Collection : absents tant que le scan n'a pas
// vu la carte, et `imageUrl` reste absent pour une carte sans image.
export type KnownCard = { slug: string; title: string; rarity?: string; imageUrl?: string };

// Clé : slug de l'article Wikipédia.
export type CollectionState = Record<string, KnownCard>;

// Renvoie `state` lui-même quand rien ne change : l'appelant évite alors d'écrire pour rien.
export function mergeCards(state: CollectionState, cards: KnownCard[]): CollectionState {
  let next = state;
  for (const card of cards) {
    const known = next[card.slug];
    // Une observation sans rareté ni image (lecture de la page) ne doit pas effacer ce que l'API a donné.
    const merged: KnownCard = {
      slug: card.slug,
      title: card.title,
      ...(card.rarity ?? known?.rarity ? { rarity: card.rarity ?? known?.rarity } : {}),
      ...(card.imageUrl ?? known?.imageUrl ? { imageUrl: card.imageUrl ?? known?.imageUrl } : {}),
    };
    if (
      known?.title === merged.title &&
      known.rarity === merged.rarity &&
      known.imageUrl === merged.imageUrl
    ) {
      continue;
    }
    if (next === state) next = { ...state };
    next[card.slug] = merged;
  }
  return next;
}
