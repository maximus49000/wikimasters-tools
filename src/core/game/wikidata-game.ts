import { z } from 'zod';
import { getJson, parseWikibaseItems, usableClaims, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle } from '../market/market-book';

// Identifiants lus sur Wikidata : Steam (P1733, numérique) et IGDB (P5794, le slug du jeu, ex. `elden-ring`) ; champ absent = inconnu.
export type CardGame = { steamId?: number; igdbSlug?: string };

const WIKIPEDIA = 'https://fr.wikipedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

const claimsResponse = z.object({
  entities: z.record(z.string(), z.object({ claims: z.record(z.string(), z.unknown()).optional() })),
});
const steamId = z.string().regex(/^\d+$/);
const igdbSlug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);

function firstSteamId(claims: Record<string, unknown>): number | undefined {
  for (const claim of usableClaims(claims, 'P1733')) {
    const parsed = steamId.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success) return Number(parsed.data);
  }
  return undefined;
}

function firstSlug(claims: Record<string, unknown>): string | undefined {
  for (const claim of usableClaims(claims, 'P5794')) {
    const parsed = igdbSlug.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

// Un format inattendu lève : il ne doit pas être enregistré comme « pas de valeur ».
export function parseCardGame(json: unknown): Record<string, CardGame> {
  const parsed = claimsResponse.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const result: Record<string, CardGame> = {};
  for (const [id, entity] of Object.entries(parsed.data.entities)) {
    const claims = entity.claims ?? {};
    const steam = firstSteamId(claims);
    const slug = firstSlug(claims);
    result[id] = { ...(steam !== undefined ? { steamId: steam } : {}), ...(slug !== undefined ? { igdbSlug: slug } : {}) };
  }
  return result;
}

// Un lot d'articles (50 au plus) : élément Wikidata, puis identifiants Steam et IGDB.
// Seuls les titres sont envoyés : aucune donnée du jeu ni du compte.
export async function fetchWikidataGame(fetchFn: FetchLike, slugs: string[]): Promise<Record<string, CardGame>> {
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
    itemIds.length > 0 ? parseCardGame(await getJson(fetchFn, WIKIDATA, { action: 'wbgetentities', props: 'claims', ids: itemIds.join('|') }, 'Wikidata')) : {};
  const result: Record<string, CardGame> = {};
  slugs.forEach((slug, index) => {
    const id = items[titles[index] ?? ''];
    result[slug] = (id ? byItem[id] : undefined) ?? {};
  });
  return result;
}
