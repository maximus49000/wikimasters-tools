import { z } from 'zod';
import { BATCH_SIZE, getJson, parseWikibaseItems, usableClaims, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle } from '../market/market-book';

// Identifiants Wikidata (Q…) : nature (P31), occupations (P106, personnes) et genres (P136, œuvres).
export type CardKinds = { natures: string[]; occupations: string[]; genres: string[] };

export const NO_KINDS: CardKinds = { natures: [], occupations: [], genres: [] };

export type KindsFetch = {
  // Par slug d'article ; toutes les listes vides = article sans valeur (on ne le redemande pas).
  kinds: Record<string, CardKinds>;
  // Libellé de chaque identifiant rencontré (français, sinon anglais).
  labels: Record<string, string>;
};

const WIKIPEDIA = 'https://fr.wikipedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

const claimsResponse = z.object({
  entities: z.record(z.string(), z.object({ claims: z.record(z.string(), z.unknown()).optional() })),
});
const labelsResponse = z.object({
  entities: z.record(z.string(), z.object({ labels: z.record(z.string(), z.object({ value: z.string() })).optional() })),
});
const entityValue = z.object({ id: z.string().regex(/^Q\d+$/) });

// Valeurs de type élément d'une propriété, rang préféré d'abord, sans doublon.
function idsOf(claims: Record<string, unknown>, property: string): string[] {
  const ids: string[] = [];
  for (const claim of usableClaims(claims, property)) {
    const parsed = entityValue.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success && !ids.includes(parsed.data.id)) ids.push(parsed.data.id);
  }
  return ids;
}

// Un format inattendu lève : il ne doit pas être enregistré comme « pas de valeur ».
export function parseCardKinds(json: unknown): Record<string, CardKinds> {
  const parsed = claimsResponse.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const result: Record<string, CardKinds> = {};
  for (const [id, entity] of Object.entries(parsed.data.entities)) {
    const claims = entity.claims ?? {};
    result[id] = { natures: idsOf(claims, 'P31'), occupations: idsOf(claims, 'P106'), genres: idsOf(claims, 'P136') };
  }
  return result;
}

export function parseLabels(json: unknown): Record<string, string> {
  const parsed = labelsResponse.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const result: Record<string, string> = {};
  for (const [id, entity] of Object.entries(parsed.data.entities)) {
    const label = entity.labels?.fr?.value ?? entity.labels?.en?.value;
    if (label) result[id] = label;
  }
  return result;
}

// Un lot d'articles : élément Wikidata, valeurs (une requête `claims`), puis libellés (par lots de 50).
// Seuls les titres sont envoyés : aucune donnée du jeu ni du compte.
export async function fetchWikidataKinds(fetchFn: FetchLike, slugs: string[]): Promise<KindsFetch> {
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
      ? parseCardKinds(await getJson(fetchFn, WIKIDATA, { action: 'wbgetentities', props: 'claims', ids: itemIds.join('|') }, 'Wikidata'))
      : {};

  const wanted = new Set<string>();
  for (const kinds of Object.values(byItem)) for (const id of [...kinds.natures, ...kinds.occupations, ...kinds.genres]) wanted.add(id);
  const labels: Record<string, string> = {};
  const list = [...wanted];
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const json = await getJson(
      fetchFn,
      WIKIDATA,
      { action: 'wbgetentities', props: 'labels', languages: 'fr|en', ids: list.slice(i, i + BATCH_SIZE).join('|') },
      'Wikidata',
    );
    Object.assign(labels, parseLabels(json));
  }

  const kinds: Record<string, CardKinds> = {};
  slugs.forEach((slug, index) => {
    const id = items[titles[index] ?? ''];
    kinds[slug] = (id ? byItem[id] : undefined) ?? NO_KINDS;
  });
  return { kinds, labels };
}
