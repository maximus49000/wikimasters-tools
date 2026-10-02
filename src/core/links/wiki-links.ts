import { z } from 'zod';
import { getJson, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle, titleToSlug } from '../market/market-book';

const WIKIPEDIA = 'https://fr.wikipedia.org/w/api.php';

const responseSchema = z.union([
  z.object({
    parse: z.object({ links: z.array(z.object({ ns: z.number(), title: z.string(), exists: z.boolean().optional() })).optional() }),
  }),
  z.object({ error: z.object({ code: z.string() }) }),
]);

// Les liens vers des articles dans l'introduction (résumé et infobox) d'une page `parse`.
// Un format inattendu lève : il ne doit pas être enregistré comme « article sans lien ».
export function parseLeadLinks(json: unknown): string[] {
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikipédia inattendue');
  const body = parsed.data;
  if ('error' in body) {
    // Article supprimé ou renommé depuis : plus rien à lire, on ne le redemande pas avant 30 jours.
    if (body.error.code === 'missingtitle') return [];
    throw new Error(`Wikipédia : ${body.error.code}`);
  }
  const slugs = new Set<string>();
  // Seuls les articles existants (espace de noms principal) : ni fichiers, ni catégories, ni liens rouges.
  for (const { ns, title, exists } of body.parse.links ?? []) if (ns === 0 && exists !== false) slugs.add(titleToSlug(title));
  return [...slugs];
}

// Les liens de l'introduction d'un article : ce qui définit son sujet (genre, métier, lieu, époque…). Les références, les
// bibliographies et les notices d'autorité du reste de l'article (un millier de liens, du bruit) ne sont pas lus.
// Seul le titre de l'article est envoyé : aucune donnée du jeu ni du compte.
export async function fetchLeadLinks(fetchFn: FetchLike, slug: string): Promise<string[]> {
  return parseLeadLinks(
    await getJson(
      fetchFn,
      WIKIPEDIA,
      { action: 'parse', prop: 'links', section: '0', redirects: '1', formatversion: '2', disablelimitreport: '1', page: slugToTitle(slug) },
      'Wikipédia',
    ),
  );
}
