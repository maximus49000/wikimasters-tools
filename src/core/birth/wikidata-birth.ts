import { z } from 'zod';
import { slugToTitle } from '../market/market-book';

// Limite des API MediaWiki / Wikidata pour un utilisateur anonyme.
export const BATCH_SIZE = 50;

const claimSchema = z.object({
  rank: z.string().optional(),
  mainsnak: z.object({
    datavalue: z.object({ value: z.object({ time: z.string(), precision: z.number() }) }).optional(),
  }),
});

const entitiesSchema = z.object({
  entities: z.record(
    z.string(),
    z.object({ claims: z.object({ P569: z.array(claimSchema).optional() }).optional() }),
  ),
});

const pagesSchema = z.object({
  query: z.object({
    normalized: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
    redirects: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
    pages: z.array(z.object({ title: z.string(), pageprops: z.object({ wikibase_item: z.string().optional() }).optional() })),
  }),
});

// « +1889-04-20T00:00:00Z » → année décimale (1889.3) ; « -0384-… » → -384 (le mois n'est lu qu'au jour ou au mois près).
function toYear(time: string, precision: number): number | null {
  const match = /^([+-])(\d+)-(\d{2})-/.exec(time);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const year = sign * Number(match[2]);
  const month = precision >= 10 ? Number(match[3]) : 0;
  return year + (month > 0 ? (month - 1) / 12 : 0);
}

// Un format inattendu lève : il ne doit pas être enregistré comme « pas de date de naissance ».
export function parseBirthYears(json: unknown): Record<string, number | null> {
  const parsed = entitiesSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const years: Record<string, number | null> = {};
  for (const [id, entity] of Object.entries(parsed.data.entities)) {
    const claims = (entity.claims?.P569 ?? []).filter((claim) => claim.rank !== 'deprecated');
    // Rang « préféré » d'abord, sinon la première date connue (au moins à l'année près).
    const ordered = [...claims.filter((c) => c.rank === 'preferred'), ...claims.filter((c) => c.rank !== 'preferred')];
    years[id] = null;
    for (const claim of ordered) {
      const value = claim.mainsnak.datavalue?.value;
      const year = value && value.precision >= 9 ? toYear(value.time, value.precision) : null;
      if (year !== null) {
        years[id] = year;
        break;
      }
    }
  }
  return years;
}

// Titre demandé → identifiant Wikidata (null : article inexistant ou sans élément), en suivant normalisations et redirections.
export function parseWikibaseItems(json: unknown, titles: string[]): Record<string, string | null> {
  const parsed = pagesSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikipédia inattendue');
  const { normalized = [], redirects = [], pages } = parsed.data.query;
  const step = (list: { from: string; to: string }[], title: string) => list.find((entry) => entry.from === title)?.to ?? title;
  const items = new Map(pages.map((page) => [page.title, page.pageprops?.wikibase_item ?? null]));
  const result: Record<string, string | null> = {};
  for (const title of titles) result[title] = items.get(step(redirects, step(normalized, title))) ?? null;
  return result;
}

export type FetchLike = (url: string) => Promise<Response>;

async function getJson(fetchFn: FetchLike, base: string, params: Record<string, string>, name: string): Promise<unknown> {
  const response = await fetchFn(`${base}?${new URLSearchParams({ format: 'json', origin: '*', ...params }).toString()}`);
  if (!response.ok) throw new Error(`${name} : HTTP ${response.status}`);
  return response.json();
}

// Un lot d'articles en deux requêtes (élément Wikidata, puis dates de naissance).
// Seuls les titres sont envoyés : aucune donnée du jeu ni du compte.
export async function fetchWikidataBirths(fetchFn: FetchLike, slugs: string[]): Promise<Record<string, number | null>> {
  const titles = slugs.map(slugToTitle);
  const pagesJson = await getJson(
    fetchFn,
    'https://fr.wikipedia.org/w/api.php',
    { action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', formatversion: '2', titles: titles.join('|') },
    'Wikipédia',
  );
  const items = parseWikibaseItems(pagesJson, titles);
  const ids = [...new Set(Object.values(items).filter((id): id is string => id !== null))];
  let years: Record<string, number | null> = {};
  if (ids.length > 0) {
    years = parseBirthYears(
      await getJson(fetchFn, 'https://www.wikidata.org/w/api.php', { action: 'wbgetentities', props: 'claims', ids: ids.join('|') }, 'Wikidata'),
    );
  }
  const result: Record<string, number | null> = {};
  slugs.forEach((slug, index) => {
    const id = items[titles[index] ?? ''];
    result[slug] = id ? (years[id] ?? null) : null;
  });
  return result;
}
