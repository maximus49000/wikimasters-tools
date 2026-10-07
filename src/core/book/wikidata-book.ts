import { z } from 'zod';
import { getJson, parseWikibaseItems, usableClaims, type FetchLike } from '../birth/wikidata-birth';
import { WIKIPEDIA_API } from './config';
import { slugToTitle } from '../market/market-book';

// Identifiant lu sur Wikidata : Open Library, œuvre (P648, `OL…W`) ; champ absent = inconnu.
export type CardBook = { workId?: string };

const WIKIDATA = 'https://www.wikidata.org/w/api.php';

const claimsResponse = z.object({
  entities: z.record(z.string(), z.object({ claims: z.record(z.string(), z.unknown()).optional() })),
});
const workId = z.string().regex(/^OL\d+W$/);

function firstWorkId(claims: Record<string, unknown>): string | undefined {
  for (const claim of usableClaims(claims, 'P648')) {
    const parsed = workId.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

// Un format inattendu lève : il ne doit pas être enregistré comme « pas de valeur ».
export function parseCardBook(json: unknown): Record<string, CardBook> {
  const parsed = claimsResponse.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const result: Record<string, CardBook> = {};
  for (const [id, entity] of Object.entries(parsed.data.entities)) {
    const id648 = firstWorkId(entity.claims ?? {});
    result[id] = id648 !== undefined ? { workId: id648 } : {};
  }
  return result;
}

// Un lot d'articles (50 au plus) : élément Wikidata, puis identifiant Open Library. Seuls les titres sont envoyés.
export async function fetchWikidataBook(fetchFn: FetchLike, slugs: string[]): Promise<Record<string, CardBook>> {
  const titles = slugs.map(slugToTitle);
  const pagesJson = await getJson(
    fetchFn,
    WIKIPEDIA_API,
    { action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', formatversion: '2', titles: titles.join('|') },
    'Wikipédia',
  );
  const items = parseWikibaseItems(pagesJson, titles);
  const itemIds = [...new Set(Object.values(items).filter((id): id is string => id !== null))];
  const byItem =
    itemIds.length > 0 ? parseCardBook(await getJson(fetchFn, WIKIDATA, { action: 'wbgetentities', props: 'claims', ids: itemIds.join('|') }, 'Wikidata')) : {};
  const result: Record<string, CardBook> = {};
  slugs.forEach((slug, index) => {
    const id = items[titles[index] ?? ''];
    result[slug] = (id ? byItem[id] : undefined) ?? {};
  });
  return result;
}
