import { z } from 'zod';
import { getJson, parseCardDates, parseWikibaseItems, usableClaims, type FetchLike } from '../birth/wikidata-birth';
import { WIKIPEDIA_API } from './config';
import { slugToTitle } from '../market/market-book';

// Ce que Wikidata dit du livre d'une carte ; champ absent = inconnu.
// workId : Open Library, œuvre (P648, `OL…W`) ; wikisource : titre de la page Wikisource FR ; gutenberg : identifiant (P2034) ;
// authorDeath : année de décès de l'auteur (P50 puis P570).
export type CardBook = { workId?: string; wikisource?: string; gutenberg?: string; authorDeath?: number };
// Lecture intermédiaire : l'élément Wikidata de l'auteur, à interroger ensuite pour sa date de décès.
type ParsedBook = CardBook & { authorId?: string };

const WIKIDATA = 'https://www.wikidata.org/w/api.php';

const claimsResponse = z.object({
  entities: z.record(
    z.string(),
    z.object({
      claims: z.record(z.string(), z.unknown()).optional(),
      sitelinks: z.record(z.string(), z.object({ title: z.string() })).optional(),
    }),
  ),
});
const workId = z.string().regex(/^OL\d+W$/);
const gutenbergId = z.string().regex(/^\d+$/);
const itemId = z.object({ id: z.string().regex(/^Q\d+$/) });

function firstWorkId(claims: Record<string, unknown>): string | undefined {
  for (const claim of usableClaims(claims, 'P648')) {
    const parsed = workId.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

function firstValid<T>(claims: Record<string, unknown>, property: string, schema: z.ZodType<T>): T | undefined {
  for (const claim of usableClaims(claims, property)) {
    const parsed = schema.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

// Un format inattendu lève : il ne doit pas être enregistré comme « pas de valeur ».
export function parseCardBook(json: unknown): Record<string, ParsedBook> {
  const parsed = claimsResponse.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const result: Record<string, ParsedBook> = {};
  for (const [id, entity] of Object.entries(parsed.data.entities)) {
    const claims = entity.claims ?? {};
    const id648 = firstWorkId(claims);
    const gutenberg = firstValid(claims, 'P2034', gutenbergId);
    const author = firstValid(claims, 'P50', itemId);
    const wikisource = entity.sitelinks?.frwikisource?.title;
    result[id] = {
      ...(id648 !== undefined ? { workId: id648 } : {}),
      ...(wikisource ? { wikisource } : {}),
      ...(gutenberg !== undefined ? { gutenberg } : {}),
      ...(author ? { authorId: author.id } : {}),
    };
  }
  return result;
}

// Un lot d'articles (50 au plus) : élément Wikidata, puis identifiants (Open Library, Gutenberg), page Wikisource et décès de l'auteur.
// Seuls les titres sont envoyés.
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
    itemIds.length > 0
      ? parseCardBook(await getJson(fetchFn, WIKIDATA, { action: 'wbgetentities', props: 'claims|sitelinks', sitefilter: 'frwikisource', ids: itemIds.join('|') }, 'Wikidata'))
      : {};
  // Décès des auteurs : une seconde interrogation, seulement pour les auteurs vus (au plus un par article du lot).
  const authorIds = [...new Set(Object.values(byItem).flatMap((book) => (book.authorId ? [book.authorId] : [])))];
  const deaths = authorIds.length > 0 ? parseCardDates(await getJson(fetchFn, WIKIDATA, { action: 'wbgetentities', props: 'claims', ids: authorIds.join('|') }, 'Wikidata')) : {};
  const result: Record<string, CardBook> = {};
  slugs.forEach((slug, index) => {
    const id = items[titles[index] ?? ''];
    const { authorId, ...book } = (id ? byItem[id] : undefined) ?? {};
    const death = authorId ? deaths[authorId]?.death : undefined;
    result[slug] = { ...book, ...(death !== null && death !== undefined ? { authorDeath: Math.floor(death) } : {}) };
  });
  return result;
}
