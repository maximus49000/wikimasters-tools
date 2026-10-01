import { z } from 'zod';
import { getJson, parseWikibaseItems, usableClaims, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle } from '../market/market-book';

// Identifiants TMDB lus sur Wikidata ; champ absent = inconnu (la recherche par titre prend alors le relais).
export type CardScreen = { movieId?: number; tvId?: number; personId?: number };

const WIKIPEDIA = 'https://fr.wikipedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

const claimsResponse = z.object({
  entities: z.record(z.string(), z.object({ claims: z.record(z.string(), z.unknown()).optional() })),
});
const tmdbId = z.string().regex(/^\d+$/);

function firstId(claims: Record<string, unknown>, property: string): number | undefined {
  for (const claim of usableClaims(claims, property)) {
    const parsed = tmdbId.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success) return Number(parsed.data);
  }
  return undefined;
}

// Un format inattendu lève : il ne doit pas être enregistré comme « pas de valeur ».
export function parseCardScreen(json: unknown): Record<string, CardScreen> {
  const parsed = claimsResponse.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const result: Record<string, CardScreen> = {};
  for (const [id, entity] of Object.entries(parsed.data.entities)) {
    const claims = entity.claims ?? {};
    const movieId = firstId(claims, 'P4947');
    const tvId = firstId(claims, 'P4983');
    const personId = firstId(claims, 'P4985');
    result[id] = {
      ...(movieId !== undefined ? { movieId } : {}),
      ...(tvId !== undefined ? { tvId } : {}),
      ...(personId !== undefined ? { personId } : {}),
    };
  }
  return result;
}

// Un lot d'articles (50 au plus) : élément Wikidata, puis identifiants TMDB.
// Seuls les titres sont envoyés : aucune donnée du jeu ni du compte.
export async function fetchWikidataScreen(fetchFn: FetchLike, slugs: string[]): Promise<Record<string, CardScreen>> {
  const titles = slugs.map(slugToTitle);
  const pagesJson = await getJson(
    fetchFn,
    WIKIPEDIA,
    { action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', formatversion: '2', titles: titles.join('|') },
    'Wikipédia',
  );
  const items = parseWikibaseItems(pagesJson, titles);
  const itemIds = [...new Set(Object.values(items).filter((id): id is string => id !== null))];
  const byItem =
    itemIds.length > 0
      ? parseCardScreen(await getJson(fetchFn, WIKIDATA, { action: 'wbgetentities', props: 'claims', ids: itemIds.join('|') }, 'Wikidata'))
      : {};
  const result: Record<string, CardScreen> = {};
  slugs.forEach((slug, index) => {
    const id = items[titles[index] ?? ''];
    result[slug] = (id ? byItem[id] : undefined) ?? {};
  });
  return result;
}
