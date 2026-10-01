import { z } from 'zod';
import { getJson, parseWikibaseItems, usableClaims, type FetchLike } from '../birth/wikidata-birth';
import { parseLabels } from '../kinds/wikidata-kinds';
import { slugToTitle } from '../market/market-book';

// Identifiants Spotify (base 62, 22 caractères) et libellé de l'interprète ; rien n'est inventé : champ absent = inconnu.
export type CardMusic = { trackId?: string; albumId?: string; artistId?: string; performer?: string };
type ItemMusic = { trackId?: string; albumId?: string; artistId?: string; performerQid?: string };

const WIKIPEDIA = 'https://fr.wikipedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

const claimsResponse = z.object({
  entities: z.record(z.string(), z.object({ claims: z.record(z.string(), z.unknown()).optional() })),
});
const spotifyId = z.string().regex(/^[0-9A-Za-z]{22}$/);
const entityValue = z.object({ id: z.string().regex(/^Q\d+$/) });

function firstSpotifyId(claims: Record<string, unknown>, property: string): string | undefined {
  for (const claim of usableClaims(claims, property)) {
    const parsed = spotifyId.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

function firstEntity(claims: Record<string, unknown>, property: string): string | undefined {
  for (const claim of usableClaims(claims, property)) {
    const parsed = entityValue.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success) return parsed.data.id;
  }
  return undefined;
}

// Un format inattendu lève : il ne doit pas être enregistré comme « pas de valeur ».
export function parseCardMusic(json: unknown): Record<string, ItemMusic> {
  const parsed = claimsResponse.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const result: Record<string, ItemMusic> = {};
  for (const [id, entity] of Object.entries(parsed.data.entities)) {
    const claims = entity.claims ?? {};
    const trackId = firstSpotifyId(claims, 'P2207');
    const albumId = firstSpotifyId(claims, 'P2205');
    const artistId = firstSpotifyId(claims, 'P1902');
    const performerQid = firstEntity(claims, 'P175');
    result[id] = {
      ...(trackId ? { trackId } : {}),
      ...(albumId ? { albumId } : {}),
      ...(artistId ? { artistId } : {}),
      ...(performerQid ? { performerQid } : {}),
    };
  }
  return result;
}

// Un lot d'articles (50 au plus) : élément Wikidata, valeurs, puis libellé des interprètes.
// Seuls les titres sont envoyés : aucune donnée du jeu ni du compte.
export async function fetchWikidataMusic(fetchFn: FetchLike, slugs: string[]): Promise<Record<string, CardMusic>> {
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
      ? parseCardMusic(await getJson(fetchFn, WIKIDATA, { action: 'wbgetentities', props: 'claims', ids: itemIds.join('|') }, 'Wikidata'))
      : {};

  const performerIds = [...new Set(Object.values(byItem).flatMap((item) => (item.performerQid ? [item.performerQid] : [])))];
  const labels =
    performerIds.length > 0
      ? parseLabels(
          await getJson(fetchFn, WIKIDATA, { action: 'wbgetentities', props: 'labels', languages: 'fr|en', ids: performerIds.join('|') }, 'Wikidata'),
        )
      : {};

  const result: Record<string, CardMusic> = {};
  slugs.forEach((slug, index) => {
    const item = byItem[items[titles[index] ?? ''] ?? ''];
    const performer = item?.performerQid ? labels[item.performerQid] : undefined;
    result[slug] = {
      ...(item?.trackId ? { trackId: item.trackId } : {}),
      ...(item?.albumId ? { albumId: item.albumId } : {}),
      ...(item?.artistId ? { artistId: item.artistId } : {}),
      ...(performer ? { performer } : {}),
    };
  });
  return result;
}
