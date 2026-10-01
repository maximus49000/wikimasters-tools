import { z } from 'zod';
import type { KnownCard } from '../collection/collection-book';
import { titleToSlug } from '../market/market-book';
import { ApiFormatError } from './errors';

// `filter` : les filtres de la page (« rarity=UR&tag_id=… »), pour lire la même sélection que le site.
// `sort` : « rarity » (défaut) ou « added » (date d'obtention, la plus récente d'abord).
export const collectionEndpoint = (page: number, filter = '', sort: 'rarity' | 'added' = 'rarity'): string =>
  `/api/my-collection?sort=${sort}${filter ? `&${filter}` : ''}&page=${page}&stats=0`;

// On ne déclare que la carte (titre, rareté, image…) et les étiquettes (identifiant, nom, couleur) : ni identifiant// de joueur, ni pseudo n'est conservé. Rareté et image sont facultatives : une valeur inattendue ne fait pas écarter la carte.
const entrySchema = z.object({
  // Date d'obtention (ISO) : facultative, une date illisible ne fait pas écarter la carte.
  obtained_at: z.string().min(1).nullish().catch(undefined),
  tags: z
    .array(z.object({ id: z.string().min(1).nullish().catch(undefined), name: z.string().min(1), color: z.string().min(1).nullish().catch(undefined) }))
    .nullish()
    .catch(undefined),
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
  // Une ligne par entrée valide, dans l'ordre reçu : sert au scan incrémental (tri par date d'ajout).
  obtained?: { slug: string; at?: number }[];
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
  const obtained: { slug: string; at?: number }[] = [];
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
    const tags = parsed.data.tags?.map(({ id, name, color }) => ({ ...(id ? { id } : {}), name, ...(color ? { color } : {}) }));
    const slug = titleToSlug(title);
    const at = parsed.data.obtained_at ? Date.parse(parsed.data.obtained_at) : Number.NaN;
    obtained.push(Number.isNaN(at) ? { slug } : { slug, at });
    const known = cards.get(slug);
    if (known) known.copies = (known.copies ?? 1) + 1;
    else {
      cards.set(slug, {
        slug,
        copies: 1,
        title,
        ...(rarity ? { rarity } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(extract ? { extract } : {}),
        ...(attack != null ? { attack } : {}),
        ...(defense != null ? { defense } : {}),
        ...(tags ? { tags } : {}),
      });
    }
  }
  return { cards: [...cards.values()], obtained, entries: raw.length, skipped };
}

const MAX_DEPTH = 6;

// Cartes décrites dans une réponse quelconque du jeu (ouverture d'un pack, achat) : tout objet portant un
// `wikipedia_title` est lu comme une carte, quelle que soit la forme exacte de la réponse.
export function extractCards(json: unknown): KnownCard[] {
  const found = new Map<string, KnownCard>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > MAX_DEPTH || typeof value !== 'object' || value === null) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.wikipedia_title === 'string') {
      const parsed = entrySchema.safeParse({ card: record });
      if (parsed.success) {
        const { wikipedia_title: title, rarity, image_url: imageUrl, category, atk, def } = parsed.data.card;
        const extract = parsed.data.card.extract ?? category;
        const slug = titleToSlug(title);
        if (!found.has(slug)) {
          found.set(slug, {
            slug,
            title,
            ...(rarity ? { rarity } : {}),
            ...(imageUrl ? { imageUrl } : {}),
            ...(extract ? { extract } : {}),
            ...(atk != null ? { attack: atk } : {}),
            ...(def != null ? { defense: def } : {}),
          });
        }
      }
      return;
    }
    for (const item of Object.values(record)) visit(item, depth + 1);
  };
  visit(json, 0);
  return [...found.values()];
}
