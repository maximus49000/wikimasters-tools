import { z } from 'zod';
import { slugToTitle } from '../market/market-book';

// Limite des API MediaWiki / Wikidata pour un utilisateur anonyme.
export const BATCH_SIZE = 50;

// Années décimales (1889.25 ≈ avril 1889) ; null : l'information n'existe pas sur Wikidata.
// `birth`/`death` servent aux personnes ; `start`/`end` aux évènements et aux bâtiments (construction, ouverture).
export type CardDates = { birth: number | null; death: number | null; start: number | null; end: number | null };

const NO_DATES: CardDates = { birth: null, death: null, start: null, end: null };

const timeSchema = z.object({ time: z.string(), precision: z.number() });
const snakSchema = z.object({ datavalue: z.object({ value: z.unknown() }).optional() });

const claimSchema = z.object({
  rank: z.string().optional(),
  mainsnak: snakSchema,
  qualifiers: z.record(z.string(), z.array(snakSchema)).optional(),
});
type Claim = z.infer<typeof claimSchema>;

// Seules les propriétés utiles sont lues (les autres ont d'autres formats) : chacune est validée à part.
const claimsSchema = z.record(z.string(), z.unknown());
const claimListSchema = z.array(claimSchema);

const entitiesSchema = z.object({
  entities: z.record(z.string(), z.object({ claims: claimsSchema.optional() })),
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

// Une date, au moins à l'année près.
function yearOfValue(value: unknown): number | null {
  const parsed = timeSchema.safeParse(value);
  return parsed.success && parsed.data.precision >= 9 ? toYear(parsed.data.time, parsed.data.precision) : null;
}

// Rang « préféré » d'abord, rangs dépréciés ignorés.
export function usableClaims(claims: Record<string, unknown>, property: string): Claim[] {
  const list = claimListSchema.safeParse(claims[property] ?? []);
  const usable = (list.success ? list.data : []).filter((claim) => claim.rank !== 'deprecated');
  return [...usable.filter((c) => c.rank === 'preferred'), ...usable.filter((c) => c.rank !== 'preferred')];
}

// Toutes les dates d'une propriété, dans l'ordre de préférence.
function yearsOf(claims: Record<string, unknown>, property: string): number[] {
  return usableClaims(claims, property).flatMap((claim) => {
    const year = yearOfValue(claim.mainsnak.datavalue?.value);
    return year === null ? [] : [year];
  });
}

const first = (years: number[]): number | null => years[0] ?? null;
const earliest = (years: number[]): number | null => (years.length > 0 ? Math.min(...years) : null);
const latest = (years: number[]): number | null => (years.length > 0 ? Math.max(...years) : null);

const CONSTRUCTION = 'Q385378';

// Période de construction : évènement notable « construction » (P793), avec ses qualificatifs début (P580) et fin (P582).
function constructionSpan(claims: Record<string, unknown>): { start: number | null; end: number | null } {
  const starts: number[] = [];
  const ends: number[] = [];
  for (const claim of usableClaims(claims, 'P793')) {
    const value = claim.mainsnak.datavalue?.value;
    if (typeof value !== 'object' || value === null || (value as { id?: unknown }).id !== CONSTRUCTION) continue;
    for (const [property, into] of [['P580', starts], ['P582', ends]] as const) {
      for (const snak of claim.qualifiers?.[property] ?? []) {
        const year = yearOfValue(snak.datavalue?.value);
        if (year !== null) into.push(year);
      }
    }
  }
  return { start: earliest(starts), end: latest(ends) };
}

// Un format inattendu lève : il ne doit pas être enregistré comme « pas de date ».
export function parseCardDates(json: unknown): Record<string, CardDates> {
  const parsed = entitiesSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const dates: Record<string, CardDates> = {};
  for (const [id, entity] of Object.entries(parsed.data.entities)) {
    const claims = entity.claims ?? {};
    const construction = constructionSpan(claims);
    const creation = yearsOf(claims, 'P571');
    // Début : début, sinon début de construction, sinon date de l'évènement, sinon (la plus ancienne) création.
    // Fin : fin, sinon fin de construction, sinon dissolution, sinon ouverture, sinon (la plus récente) de plusieurs créations.
    dates[id] = {
      birth: first(yearsOf(claims, 'P569')),
      death: first(yearsOf(claims, 'P570')),
      start: first(yearsOf(claims, 'P580')) ?? construction.start ?? first(yearsOf(claims, 'P585')) ?? earliest(creation),
      end:
        first(yearsOf(claims, 'P582')) ??
        construction.end ??
        first(yearsOf(claims, 'P576')) ??
        first(yearsOf(claims, 'P1619')) ??
        (creation.length > 1 ? latest(creation) : null),
    };
  }
  return dates;
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

export async function getJson(fetchFn: FetchLike, base: string, params: Record<string, string>, name: string): Promise<unknown> {
  const response = await fetchFn(`${base}?${new URLSearchParams({ format: 'json', origin: '*', ...params }).toString()}`);
  if (!response.ok) throw new Error(`${name} : HTTP ${response.status}`);
  return response.json();
}

// Un lot d'articles en deux requêtes (élément Wikidata, puis dates).
// Seuls les titres sont envoyés : aucune donnée du jeu ni du compte.
export async function fetchWikidataDates(fetchFn: FetchLike, slugs: string[]): Promise<Record<string, CardDates>> {
  const titles = slugs.map(slugToTitle);
  const pagesJson = await getJson(
    fetchFn,
    'https://fr.wikipedia.org/w/api.php',
    { action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', formatversion: '2', titles: titles.join('|') },
    'Wikipédia',
  );
  const items = parseWikibaseItems(pagesJson, titles);
  const ids = [...new Set(Object.values(items).filter((id): id is string => id !== null))];
  let dates: Record<string, CardDates> = {};
  if (ids.length > 0) {
    dates = parseCardDates(
      await getJson(fetchFn, 'https://www.wikidata.org/w/api.php', { action: 'wbgetentities', props: 'claims', ids: ids.join('|') }, 'Wikidata'),
    );
  }
  const result: Record<string, CardDates> = {};
  slugs.forEach((slug, index) => {
    const id = items[titles[index] ?? ''];
    result[slug] = (id ? dates[id] : undefined) ?? NO_DATES;
  });
  return result;
}
