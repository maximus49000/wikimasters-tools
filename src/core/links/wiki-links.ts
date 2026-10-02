import { z } from 'zod';
import { getJson, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle, titleToSlug } from '../market/market-book';

const WIKIPEDIA = 'https://fr.wikipedia.org/w/api.php';
// Garde-fou : 50 articles de ~1000 liens tiennent en une centaine de pages de 500 liens.
const MAX_REQUESTS = 300;

const renames = z.array(z.object({ from: z.string(), to: z.string() }));
const responseSchema = z.object({
  continue: z.record(z.string(), z.string()).optional(),
  query: z.object({
    normalized: renames.optional(),
    redirects: renames.optional(),
    pages: z.array(z.object({ title: z.string(), links: z.array(z.object({ title: z.string() })).optional() })),
  }),
});

export type LinksPage = {
  // Paramètres à renvoyer pour obtenir la suite ; null : c'était la dernière page.
  next: Record<string, string> | null;
  normalized: Map<string, string>;
  redirects: Map<string, string>;
  // Titre de la page → titres des articles cités dans cette page de résultats.
  links: Map<string, string[]>;
};

// Un format inattendu lève : il ne doit pas être enregistré comme « article sans lien ».
export function parseLinksPage(json: unknown): LinksPage {
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikipédia inattendue');
  const { query } = parsed.data;
  const toMap = (list: { from: string; to: string }[] = []) => new Map(list.map((entry) => [entry.from, entry.to]));
  return {
    next: parsed.data.continue ?? null,
    normalized: toMap(query.normalized),
    redirects: toMap(query.redirects),
    links: new Map(query.pages.map((page) => [page.title, (page.links ?? []).map((link) => link.title)])),
  };
}

export type FetchOptions = { gapMs?: number; sleep?: (ms: number) => Promise<void> };

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Les liens sortants (articles seulement) d'un lot d'articles. Seuls les titres sont envoyés : aucune donnée du jeu ni du compte.
export async function fetchWikiLinks(
  fetchFn: FetchLike,
  slugs: string[],
  { gapMs = 150, sleep = realSleep }: FetchOptions = {},
): Promise<Record<string, string[]>> {
  const titles = slugs.map(slugToTitle);
  const normalized = new Map<string, string>();
  const redirects = new Map<string, string>();
  const linked = new Map<string, Set<string>>();
  let next: Record<string, string> | null = {};
  for (let requests = 0; next; requests++) {
    if (requests >= MAX_REQUESTS) throw new Error('Wikipédia : trop de pages de liens');
    if (requests > 0) await sleep(gapMs);
    const page = parseLinksPage(
      await getJson(
        fetchFn,
        WIKIPEDIA,
        { action: 'query', prop: 'links', plnamespace: '0', pllimit: 'max', redirects: '1', formatversion: '2', titles: titles.join('|'), ...next },
        'Wikipédia',
      ),
    );
    for (const [from, to] of page.normalized) normalized.set(from, to);
    for (const [from, to] of page.redirects) redirects.set(from, to);
    for (const [title, list] of page.links) {
      const set = linked.get(title) ?? new Set<string>();
      for (const link of list) set.add(titleToSlug(link));
      linked.set(title, set);
    }
    next = page.next;
  }
  const step = (map: Map<string, string>, title: string) => map.get(title) ?? title;
  const result: Record<string, string[]> = {};
  slugs.forEach((slug, index) => {
    const title = titles[index] ?? '';
    result[slug] = [...(linked.get(step(redirects, step(normalized, title))) ?? [])];
  });
  return result;
}
