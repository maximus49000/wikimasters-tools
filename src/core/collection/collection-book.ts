// `rarity` et `imageUrl` viennent de l'API de la Collection : absents tant que le scan n'a pas
// vu la carte, et `imageUrl` reste absent pour une carte sans image.
// Étiquette posée par le joueur sur la carte (nom et couleur du site, ex. « #818cf8 »).
export type CardTag = { name: string; color?: string };

export type KnownCard = {
  slug: string;
  title: string;
  rarity?: string;
  imageUrl?: string;
  extract?: string;
  attack?: number;
  defense?: number;
  // Absent tant que l'API ne l'a pas donné ; `[]` = carte sans étiquette (efface d'anciennes étiquettes).
  tags?: CardTag[];
};

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
      ...(card.extract ?? known?.extract ? { extract: card.extract ?? known?.extract } : {}),
      ...(card.attack ?? known?.attack ? { attack: card.attack ?? known?.attack } : {}),
      ...(card.defense ?? known?.defense ? { defense: card.defense ?? known?.defense } : {}),
      ...((card.tags ?? known?.tags) ? { tags: card.tags ?? known?.tags } : {}),
    };
    if (
      known?.title === merged.title &&
      known.rarity === merged.rarity &&
      known.imageUrl === merged.imageUrl &&
      known.extract === merged.extract &&
      known.attack === merged.attack &&
      known.defense === merged.defense &&
      sameTags(known.tags, merged.tags)
    ) {
      continue;
    }
    if (next === state) next = { ...state };
    next[card.slug] = merged;
  }
  return next;
}

const sameTags = (a: CardTag[] | undefined, b: CardTag[] | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && a.length === b.length && a.every((tag, i) => tag.name === b[i]?.name && tag.color === b[i]?.color));
