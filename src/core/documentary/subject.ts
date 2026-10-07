import { z } from 'zod';
import { getJson, parseCardDates, parseWikibaseItems, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle } from '../market/market-book';
import { subjectNames } from './score';

// Ce que la recherche de documentaire sait d'une carte : élément Wikidata, noms (fr, en, alias fr) et années (entières).
export type SubjectInfo = { qid: string; names: string[]; birth: number | null; death: number | null; start: number | null; end: number | null };

const entitiesSchema = z.object({
  entities: z.record(
    z.string(),
    z.object({
      labels: z.record(z.string(), z.object({ value: z.string() })).optional(),
      aliases: z.record(z.string(), z.array(z.object({ value: z.string() }))).optional(),
    }),
  ),
});

const whole = (year: number | null): number | null => (year === null ? null : Math.floor(year));

// Deux requêtes (élément, puis noms et dates) ; seul le titre de l'article est envoyé. Une panne lève : elle ne doit pas être mémorisée.
export async function fetchSubject(fetchFn: FetchLike, slug: string): Promise<SubjectInfo | null> {
  const title = slugToTitle(slug);
  const pagesJson = await getJson(fetchFn, 'https://fr.wikipedia.org/w/api.php', { action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', formatversion: '2', titles: title }, 'Wikipédia');
  const qid = parseWikibaseItems(pagesJson, [title])[title] ?? null;
  if (qid === null) return null;
  const json = await getJson(fetchFn, 'https://www.wikidata.org/w/api.php', { action: 'wbgetentities', props: 'labels|aliases|claims', languages: 'fr|en', ids: qid }, 'Wikidata');
  const parsed = entitiesSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const entity = parsed.data.entities[qid];
  const dates = parseCardDates(json)[qid];
  if (!entity || !dates) return null;
  const names = subjectNames([entity.labels?.fr?.value ?? '', entity.labels?.en?.value ?? '', ...(entity.aliases?.fr ?? []).map((alias) => alias.value)]);
  return { qid, names, birth: whole(dates.birth), death: whole(dates.death), start: whole(dates.start), end: whole(dates.end) };
}
