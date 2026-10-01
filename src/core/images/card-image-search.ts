import { z } from 'zod';

export type FetchLike = (url: string) => Promise<Response>;

// Nombre de candidats gardés par carte : assez pour « Mauvaise image » sans alourdir le stockage.
export const MAX_CANDIDATES = 6;
const THUMB_WIDTH = 600;
const IMAGE_MIME = /^image\/(jpeg|png|webp)$/;

const pageImageSchema = z.object({
  query: z.object({
    pages: z.array(
      z.object({
        title: z.string().optional(),
        index: z.number().optional(),
        missing: z.boolean().optional(),
        thumbnail: z.object({ source: z.string().min(1) }).optional(),
      }),
    ),
  }),
});

const commonsSchema = z.object({
  query: z
    .object({
      pages: z.array(
        z.object({
          index: z.number().optional(),
          imageinfo: z.array(z.object({ thumburl: z.string().optional(), url: z.string().optional(), mime: z.string().optional() })).optional(),
        }),
      ),
    })
    .optional(),
});

// Un format inattendu lève : il ne doit pas être enregistré comme « aucune image ».
export function parsePageImage(json: unknown): string | null {
  const parsed = pageImageSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikipédia inattendue');
  return parsed.data.query.pages[0]?.thumbnail?.source ?? null;
}

// `true` : le titre exact n'existe pas sur Wikipédia (casse différente, ex. « Frise Orientale » pour « Frise orientale »).
export const isMissingPage = (json: unknown): boolean => {
  const parsed = pageImageSchema.safeParse(json);
  return parsed.success && parsed.data.query.pages[0]?.missing === true;
};

const sameTitle = (a: string, b: string): boolean => a.normalize('NFC').toLowerCase() === b.normalize('NFC').toLowerCase();

// Recherche d'article : on ne garde que celui dont le titre est identique à la casse près, jamais un article voisin.
export function parseSearchedPageImage(json: unknown, title: string): string | null {
  const parsed = pageImageSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikipédia inattendue');
  const match = parsed.data.query.pages.find((page) => page.title !== undefined && sameTitle(page.title, title));
  return match?.thumbnail?.source ?? null;
}

export function parseCommonsImages(json: unknown): string[] {
  const parsed = commonsSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikimedia Commons inattendue');
  const pages = [...(parsed.data.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const urls: string[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    const url = info?.thumburl ?? info?.url;
    if (url && info?.mime && IMAGE_MIME.test(info.mime)) urls.push(url);
  }
  return urls;
}

async function getJson(fetchFn: FetchLike, base: string, params: Record<string, string>): Promise<unknown> {
  const response = await fetchFn(`${base}?${new URLSearchParams({ ...params, format: 'json', formatversion: '2', origin: '*' }).toString()}`);
  if (!response.ok) throw new Error(`Wikimedia : HTTP ${response.status}`);
  return response.json();
}

// Image principale de l'article Wikipédia, quand il en a une.
export async function fetchPageImage(fetchFn: FetchLike, title: string): Promise<string | null> {
  const api = 'https://fr.wikipedia.org/w/api.php';
  const thumb = { prop: 'pageimages', piprop: 'thumbnail', pithumbsize: String(THUMB_WIDTH) };
  const exact = await getJson(fetchFn, api, { action: 'query', ...thumb, titles: title, redirects: '1' });
  if (!isMissingPage(exact)) return parsePageImage(exact);
  return parseSearchedPageImage(
    await getJson(fetchFn, api, { action: 'query', ...thumb, generator: 'search', gsrsearch: title, gsrnamespace: '0', gsrlimit: '3' }),
    title,
  );
}

// Images de Wikimedia Commons dont le nom ou la description parle du titre (photos seulement, pas de SVG ni de PDF).
export async function fetchCommonsImages(fetchFn: FetchLike, title: string, offset = 0): Promise<string[]> {
  return parseCommonsImages(
    await getJson(fetchFn, 'https://commons.wikimedia.org/w/api.php', {
      action: 'query',
      generator: 'search',
      gsrsearch: `${title} filetype:bitmap`,
      gsrnamespace: '6',
      gsrlimit: String(MAX_CANDIDATES + 2),
      gsroffset: String(offset),
      prop: 'imageinfo',
      iiprop: 'url|mime',
      iiurlwidth: String(THUMB_WIDTH),
    }),
  );
}

// Candidats pour une carte sans image : l'image de l'article d'abord, puis la recherche Commons.
// `skip` : nombre de résultats Commons déjà proposés (une nouvelle recherche passe aux suivants).
export async function searchCardImages(fetchFn: FetchLike, title: string, skip = 0): Promise<string[]> {
  const found: string[] = [];
  if (skip === 0) {
    const page = await fetchPageImage(fetchFn, title);
    if (page) found.push(page);
  }
  const commons = await fetchCommonsImages(fetchFn, title, skip);
  for (const url of commons) if (!found.includes(url)) found.push(url);
  return found.slice(0, MAX_CANDIDATES);
}
