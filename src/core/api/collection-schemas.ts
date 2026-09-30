import { z } from 'zod';
import type { KnownCard } from '../collection/collection-book';
import { titleToSlug } from '../market/market-book';
import { ApiFormatError } from './errors';

export const collectionEndpoint = (page: number): string =>
  `/api/my-collection?sort=rarity&page=${page}&stats=0`;

// On ne déclare que le titre : ni identifiant de joueur, ni étiquettes, ni pseudo n'est conservé.
const entrySchema = z.object({
  card: z.object({ wikipedia_title: z.string().min(1) }),
});

export type CollectionPage = {
  cards: KnownCard[];
  // Entrées brutes reçues (0 = fin de la collection : l'API ne donne ni total ni `hasMore`).
  entries: number;
  skipped: number;
};

// Tolérant : une entrée invalide est écartée. Mais une réponse sans tableau `collection` lève,
// pour ne pas la confondre avec la fin de la collection.
export function parseCollectionPage(json: unknown, endpoint: string): CollectionPage {
  const raw = (json as { collection?: unknown } | null)?.collection;
  if (!Array.isArray(raw)) throw new ApiFormatError(endpoint, 'tableau « collection » absent');

  const cards = new Map<string, KnownCard>();
  let skipped = 0;
  for (const item of raw) {
    const parsed = entrySchema.safeParse(item);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }
    const title = parsed.data.card.wikipedia_title;
    const slug = titleToSlug(title);
    if (!cards.has(slug)) cards.set(slug, { slug, title });
  }
  return { cards: [...cards.values()], entries: raw.length, skipped };
}
