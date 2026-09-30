import { z } from 'zod';
import type { KnownCard } from '../collection/collection-book';
import { titleToSlug } from '../market/market-book';
import { ApiFormatError } from './errors';

export const collectionEndpoint = (page: number): string =>
  `/api/my-collection?sort=rarity&page=${page}&stats=0`;

// On ne déclare que la carte (titre, rareté, image) : ni identifiant de joueur, ni étiquettes, ni pseudo
// n'est conservé. Rareté et image sont facultatives : une valeur inattendue ne fait pas écarter la carte.
const entrySchema = z.object({
  card: z.object({
    wikipedia_title: z.string().min(1),
    rarity: z.string().min(1).nullish().catch(undefined),
    image_url: z.string().min(1).nullish().catch(undefined),
    extract: z.string().min(1).nullish().catch(undefined),
    category: z.string().min(1).nullish().catch(undefined),
    atk: z.number().nullish().catch(undefined),
    def: z.number().nullish().catch(undefined),
  }),
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
    const { wikipedia_title: title, rarity, image_url: imageUrl, category, atk: attack, def: defense } = parsed.data.card;
    // Sans extrait, le jeu affiche la description courte de la carte (`category`).
    const extract = parsed.data.card.extract ?? category;
    const slug = titleToSlug(title);
    if (!cards.has(slug)) {
      cards.set(slug, {
        slug,
        title,
        ...(rarity ? { rarity } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(extract ? { extract } : {}),
        ...(attack != null ? { attack } : {}),
        ...(defense != null ? { defense } : {}),
      });
    }
  }
  return { cards: [...cards.values()], entries: raw.length, skipped };
}
