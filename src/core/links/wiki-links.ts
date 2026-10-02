import { z } from 'zod';
import { getJson, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle, titleToSlug } from '../market/market-book';

const WIKIPEDIA = 'https://fr.wikipedia.org/w/api.php';
// Limite de l'API : 50 titres par requête.
export const LEAD_BATCH = 50;
// Garde-fou pour la suite d'une réponse trop grosse (une introduction pèse quelques ko : cela n'arrive presque jamais).
const MAX_REQUESTS = 10;
// Les titres sont dans l'adresse de la requête, qui ne doit pas dépasser environ 8 000 caractères : au-delà de cette longueur
// (encodée), un lot est coupé en plusieurs requêtes.
const MAX_TITLES_LENGTH = 6000;

function splitByLength(titles: string[]): string[][] {
  const groups: string[][] = [];
  let group: string[] = [];
  let length = 0;
  for (const title of titles) {
    // `|` s'encode en `%7C` : trois caractères de plus par titre.
    const size = encodeURIComponent(title).length + 3;
    if (group.length > 0 && length + size > MAX_TITLES_LENGTH) {
      groups.push(group);
      group = [];
      length = 0;
    }
    group.push(title);
    length += size;
  }
  if (group.length > 0) groups.push(group);
  return groups;
}

// Préfixes qui ne sont pas des articles : espaces de noms (fr, en) et autres wikis. « Star Wars : Épisode IV » n'en est pas un (espace avant « : »).
const NOT_ARTICLES = new Set([
  'fichier', 'file', 'image', 'catégorie', 'category', 'modèle', 'template', 'wikipédia', 'wikipedia', 'aide', 'help', 'portail', 'portal',
  'discussion', 'talk', 'utilisateur', 'user', 'mediawiki', 'spécial', 'special', 'média', 'media', 'projet', 'module', 'référence',
  'commons', 'wikt', 'wiktionary', 'd', 'wikidata', 'w', 's', 'q', 'b', 'v', 'n', 'voy', 'species', 'meta', 'm', 'mw',
  'en', 'de', 'es', 'it', 'pt', 'nl', 'ru', 'ja', 'zh', 'ar', 'sv', 'pl', 'uk', 'ca', 'simple', 'fr',
]);

function isArticle(target: string): boolean {
  const colon = target.indexOf(':');
  if (colon <= 0) return true;
  const prefix = target.slice(0, colon);
  return /\s/.test(prefix) || !NOT_ARTICLES.has(prefix.toLowerCase());
}

// Les articles liés dans un wikitexte (slugs, sans doublon) : les liens écrits `[[Cible]]` ou `[[Cible|texte]]`, y compris dans les
// paramètres d'une infobox. Ni les fichiers et catégories, ni les liens vers un autre wiki, ni les commentaires ; les notes de bas de page
// (références, souvent un journal ou un identifiant) sont ignorées : ce ne sont pas elles qui disent le sujet de l'article.
export function extractLeadLinks(wikitext: string): string[] {
  const text = wikitext
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<nowiki>[\s\S]*?<\/nowiki>/gi, '')
    .replace(/<ref\b[^>]*\/>/gi, '')
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, '');
  const slugs = new Set<string>();
  // On ne lit que la cible : un lien imbriqué dans une légende de fichier est trouvé lui aussi.
  for (const match of text.matchAll(/\[\[([^[\]|#\n]+)/g)) {
    let target = (match[1] ?? '').trim();
    // `[[:Catégorie:X]]` et `[[:en:X]]` sont des liens explicites vers un autre espace de noms ou un autre wiki.
    if (target.startsWith(':')) target = target.slice(1).trim();
    if (!target || !isArticle(target)) continue;
    // MediaWiki met la première lettre en majuscule : `[[rock]]` et `[[Rock]]` sont le même article.
    const slug = titleToSlug(target);
    slugs.add(slug.charAt(0).toUpperCase() + slug.slice(1));
  }
  return [...slugs];
}

const renames = z.array(z.object({ from: z.string(), to: z.string() }));
const pageSchema = z.object({
  title: z.string(),
  revisions: z.array(z.object({ slots: z.object({ main: z.object({ content: z.string().optional() }) }) })).optional(),
});
const responseSchema = z.union([
  z.object({
    continue: z.record(z.string(), z.string()).optional(),
    query: z.object({ normalized: renames.optional(), redirects: renames.optional(), pages: z.array(pageSchema) }),
  }),
  z.object({ error: z.object({ code: z.string() }) }),
]);

// Les liens de l'introduction (résumé et infobox) de plusieurs articles, en UNE requête : par article, la liste des slugs cités.
// Wikipédia limite chaque IP à 200 requêtes par minute : lire un article par requête (2233 cartes) prendrait douze minutes et se
// heurterait à cette limite ; 50 articles par requête n'en demandent que 45. Un article inexistant, invalide ou sans introduction
// donne une liste vide. Une réponse inattendue lève : elle ne doit pas être enregistrée comme « articles sans lien ».
// Seuls les titres sont envoyés : aucune donnée du jeu ni du compte.
export async function fetchLeadLinks(fetchFn: FetchLike, slugs: string[]): Promise<Record<string, string[]>> {
  if (slugs.length === 0) return {};
  if (slugs.length > LEAD_BATCH) throw new Error(`Wikipédia : au plus ${LEAD_BATCH} articles par requête`);
  const titles = slugs.map(slugToTitle);
  const normalized = new Map<string, string>();
  const redirects = new Map<string, string>();
  // Titre de la page → wikitexte de son introduction (null : page inexistante ou sans contenu lisible).
  const contents = new Map<string, string | null>();
  for (const group of splitByLength(titles)) {
    let next: Record<string, string> | null = {};
    for (let requests = 0; next; requests++) {
      if (requests >= MAX_REQUESTS) throw new Error('Wikipédia : trop de pages de liens');
      const json = await getJson(
        fetchFn,
        WIKIPEDIA,
        { action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', rvsection: '0', redirects: '1', formatversion: '2', titles: group.join('|'), ...next },
        'Wikipédia',
      );
      const parsed = responseSchema.safeParse(json);
      if (!parsed.success) throw new Error('Réponse Wikipédia inattendue');
      const body = parsed.data;
      if ('error' in body) throw new Error(`Wikipédia : ${body.error.code}`);
      for (const { from, to } of body.query.normalized ?? []) normalized.set(from, to);
      for (const { from, to } of body.query.redirects ?? []) redirects.set(from, to);
      for (const page of body.query.pages) {
        const content = page.revisions?.[0]?.slots.main.content;
        // Une page rendue sans contenu à la suite d'une première réponse ne remplace pas celui déjà lu.
        if (content !== undefined) contents.set(page.title, content);
        else if (!contents.has(page.title)) contents.set(page.title, null);
      }
      next = body.continue ?? null;
    }
  }
  const step = (map: Map<string, string>, title: string) => map.get(title) ?? title;
  const result: Record<string, string[]> = {};
  slugs.forEach((slug, index) => {
    const title = titles[index] ?? '';
    result[slug] = extractLeadLinks(contents.get(step(redirects, step(normalized, title))) ?? '');
  });
  return result;
}
