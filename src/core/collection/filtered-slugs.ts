import type { CollectionPage } from '../api/collection-schemas';

const MAX_PAGES = 200;

// Toutes les cartes que le site affiche pour ces filtres (une page à la fois, comme le scan).
export async function loadFilteredSlugs(
  api: { getCollectionPage(page: number, filter?: string, sort?: string): Promise<CollectionPage> },
  filter: string,
  isCancelled: () => boolean = () => false,
): Promise<Set<string>> {
  const slugs = new Set<string>();
  for (let page = 0; page < MAX_PAGES && !isCancelled(); page += 1) {
    const result = await api.getCollectionPage(page, filter);
    if (result.entries === 0) break;
    for (const card of result.cards) slugs.add(card.slug);
  }
  return slugs;
}

// Les cartes dans l'ordre que le site donne pour ce tri (Nom, Favoris, Date d'ajout…), filtres compris.
export async function loadOrderedSlugs(
  api: { getCollectionPage(page: number, filter?: string, sort?: string): Promise<CollectionPage> },
  filter: string,
  sort: string,
  isCancelled: () => boolean = () => false,
): Promise<string[]> {
  const slugs = new Set<string>();
  for (let page = 0; page < MAX_PAGES && !isCancelled(); page += 1) {
    const result = await api.getCollectionPage(page, filter, sort);
    if (result.entries === 0) break;
    for (const card of result.cards) slugs.add(card.slug);
  }
  return [...slugs];
}
