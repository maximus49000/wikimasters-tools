import { z } from 'zod';
import { getJson, parseWikibaseItems, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle, titleToSlug } from '../market/market-book';
import { normalizeTitle } from './book-format';
import { WIKIPEDIA_API } from './config';

const SPARQL = 'https://query.wikidata.org/sparql';

// Une œuvre de la bibliographie d'un écrivain. `slug` : article Wikipédia FR de l'œuvre (= carte du livre quand elle existe) ;
// `workId` : œuvre Open Library (P648 de type `OL…W` seulement), dont `writerThumbUrl` donne la couverture sans appel de plus.
export type WriterWork = { id: string; title: string; year?: number; slug?: string; workId?: string };

const MAX_WORKS = 40;
// Œuvres les plus connues d'abord (nombre de versions de l'article dans les langues de Wikipédia) ; peu d'œuvres : seuil abaissé.
const THRESHOLDS = [8, 3] as const;
const ENOUGH = 6;

const rows = z.object({
  results: z.object({
    bindings: z.array(
      z.object({
        w: z.object({ value: z.string() }),
        wLabel: z.object({ value: z.string() }).optional(),
        sitelinks: z.object({ value: z.string() }).optional(),
        date: z.object({ value: z.string() }).optional(),
        olid: z.object({ value: z.string() }).optional(),
        frTitle: z.object({ value: z.string() }).optional(),
      }),
    ),
  }),
});

const itemId = (uri: string): string | undefined => /\/(Q\d+)$/.exec(uri)?.[1];

function yearOf(date: string | undefined): number | undefined {
  const match = /^(-?\d{1,4})-/.exec(date ?? '');
  const year = match ? Number(match[1]) : undefined;
  return year !== undefined && year > 0 ? year : undefined;
}

export const writerQuery = (writerId: string, threshold: number): string =>
  `SELECT ?w ?wLabel (MAX(?sl) AS ?sitelinks) (MIN(?pub) AS ?date) (SAMPLE(?ol) AS ?olid) (SAMPLE(?title) AS ?frTitle) WHERE {
  ?w wdt:P50 wd:${writerId} ; wikibase:sitelinks ?sl .
  FILTER(?sl >= ${threshold})
  OPTIONAL { ?w wdt:P577 ?pub }
  OPTIONAL { ?w wdt:P648 ?ol }
  OPTIONAL { ?art schema:about ?w ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?title }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}
GROUP BY ?w ?wLabel ORDER BY DESC(?sitelinks) LIMIT 100`;

// Les lignes de la réponse → œuvres : une seule par titre (éditions regroupées, la plus connue gardée), 40 au plus,
// puis du plus récent au plus ancien (sans date en dernier). Une réponse de forme inattendue lève.
export function parseWriterWorks(json: unknown): WriterWork[] {
  const parsed = rows.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const seen = new Set<string>();
  const works: WriterWork[] = [];
  for (const row of parsed.data.results.bindings) {
    const id = itemId(row.w.value);
    const label = row.wLabel?.value;
    // Sans titre lisible, Wikidata renvoie l'identifiant (Q…) : ni titre, ni ligne.
    if (!id || !label || /^Q\d+$/.test(label)) continue;
    const key = normalizeTitle(label);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    const year = yearOf(row.date?.value);
    const olid = row.olid?.value;
    works.push({
      id,
      title: label,
      ...(year !== undefined ? { year } : {}),
      ...(row.frTitle?.value ? { slug: titleToSlug(row.frTitle.value) } : {}),
      ...(olid && /^OL\d+W$/.test(olid) ? { workId: olid } : {}),
    });
    if (works.length === MAX_WORKS) break;
  }
  return works
    .map((work, index) => ({ work, index }))
    .sort((a, b) => (b.work.year ?? -Infinity) - (a.work.year ?? -Infinity) || a.index - b.index)
    .map(({ work }) => work);
}

// La bibliographie de l'écrivain d'une carte : élément Wikidata de l'article, puis une requête SPARQL (deux au plus : seuil 8, puis 3).
// Rend [] quand l'article n'a pas d'élément Wikidata ; une erreur réseau ou de format lève (rien n'est alors mémorisé).
export async function fetchWriterWorks(fetchFn: FetchLike, slug: string): Promise<WriterWork[]> {
  const title = slugToTitle(slug);
  const pagesJson = await getJson(fetchFn, WIKIPEDIA_API, { action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', formatversion: '2', titles: title }, 'Wikipédia');
  const id = parseWikibaseItems(pagesJson, [title])[title];
  if (!id || !/^Q\d+$/.test(id)) return [];
  let works: WriterWork[] = [];
  for (const threshold of THRESHOLDS) {
    const response = await fetchFn(`${SPARQL}?${new URLSearchParams({ query: writerQuery(id, threshold), format: 'json' })}`);
    if (!response.ok) throw new Error(`Wikidata (requête) : HTTP ${response.status}`);
    works = parseWriterWorks(await response.json());
    if (works.length >= ENOUGH) break;
  }
  return works;
}

// Couverture d'une œuvre d'après son identifiant Open Library ; `default=false` : pas d'image de remplacement quand elle n'existe pas.
export const writerThumbUrl = (workId: string): string => `https://covers.openlibrary.org/w/olid/${workId}-S.jpg?default=false`;
