import { z } from 'zod';
import { getJson, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle } from '../market/market-book';
import { WIKIPEDIA_API } from './config';

const introSchema = z.object({ query: z.object({ pages: z.array(z.object({ extract: z.string().optional() })) }) });

// Introduction de l'article Wikipédia FR de la carte, en texte brut ; null si l'article n'existe pas ou n'a pas de texte.
// Un format inattendu lève (le synopsis se rabat alors sur Open Library sans rien mémoriser d'erroné).
export async function fetchWikipediaIntro(fetchFn: FetchLike, slug: string): Promise<string | null> {
  const json = await getJson(
    fetchFn,
    WIKIPEDIA_API,
    { action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', redirects: '1', formatversion: '2', titles: slugToTitle(slug) },
    'Wikipédia',
  );
  const parsed = introSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikipédia inattendue');
  const text = parsed.data.query.pages[0]?.extract?.trim();
  return text ? text : null;
}
