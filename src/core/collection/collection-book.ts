// `rarity` et `imageUrl` viennent de l'API de la Collection : absents tant que le scan n'a pas
// vu la carte, et `imageUrl` reste absent pour une carte sans image.
// Étiquette posée par le joueur sur la carte (nom et couleur du site, ex. « #818cf8 »).
export type CardTag = { id?: string; name: string; color?: string };

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
  // Nombre d'exemplaires possédés, compté par le scan de la Collection (absent tant qu'il ne l'a pas fait).
  copies?: number;
};

// Clé : slug de l'article Wikipédia.
export type CollectionState = Record<string, KnownCard>;

// Renvoie `state` lui-même quand rien ne change : l'appelant évite alors d'écrire pour rien.
// `addCopies` : le `copies` des cartes reçues s'ajoute à celui déjà connu (scan page par page) au lieu de le remplacer.
export function mergeCards(state: CollectionState, cards: KnownCard[], addCopies = false): CollectionState {
  let next = state;
  for (const card of cards) {
    const known = next[card.slug];
    // Une observation sans rareté ni image (lecture de la page) ne doit pas effacer ce que l'API a donné.
    const copies = card.copies === undefined ? known?.copies : addCopies ? (known?.copies ?? 0) + card.copies : card.copies;
    const merged: KnownCard = {
      slug: card.slug,
      title: card.title,
      ...(card.rarity ?? known?.rarity ? { rarity: card.rarity ?? known?.rarity } : {}),
      ...(card.imageUrl ?? known?.imageUrl ? { imageUrl: card.imageUrl ?? known?.imageUrl } : {}),
      ...(card.extract ?? known?.extract ? { extract: card.extract ?? known?.extract } : {}),
      ...(card.attack ?? known?.attack ? { attack: card.attack ?? known?.attack } : {}),
      ...(card.defense ?? known?.defense ? { defense: card.defense ?? known?.defense } : {}),
      ...((card.tags ?? known?.tags) ? { tags: card.tags ?? known?.tags } : {}),
      ...(copies !== undefined ? { copies } : {}),
    };
    if (
      known?.title === merged.title &&
      known.rarity === merged.rarity &&
      known.imageUrl === merged.imageUrl &&
      known.extract === merged.extract &&
      known.attack === merged.attack &&
      known.defense === merged.defense &&
      known.copies === merged.copies &&
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
  a === b || (a !== undefined && b !== undefined && a.length === b.length && a.every((tag, i) => tag.id === b[i]?.id && tag.name === b[i]?.name && tag.color === b[i]?.color));
