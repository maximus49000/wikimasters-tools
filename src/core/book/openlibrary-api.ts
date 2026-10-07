// src/core/book/openlibrary-api.ts
import { z } from 'zod';
import type { BookFetch } from './book-detail';
import { firstIsbn13, isWorkId } from './book-format';
import { OPENLIBRARY_BASE } from './config';
import { BookError } from './errors';
import { requestJson } from './http';

const FIELDS = 'key,title,author_name,first_publish_year,cover_i,isbn,publisher,number_of_pages_median,edition_count,ebook_access,ia';

const MAX_SCANS = 30;

const docSchema = z.object({
  key: z.string(),
  title: z.string(),
  author_name: z.array(z.string()).optional(),
  first_publish_year: z.number().optional(),
  cover_i: z.number().optional(),
  isbn: z.array(z.string()).optional(),
  publisher: z.array(z.string()).optional(),
  number_of_pages_median: z.number().optional(),
  edition_count: z.number().optional(),
  ebook_access: z.string().optional(),
  ia: z.array(z.string()).optional(),
});
const searchSchema = z.object({ docs: z.array(docSchema) });
const workSchema = z.object({ description: z.union([z.string(), z.object({ value: z.string() })]).optional() });

// Une œuvre d'Open Library ; `popularity` (nombre d'éditions) départage des titres identiques ; `scans` : identifiants Internet Archive
// (les 30 premiers) quand Open Library dit l'œuvre lisible en ligne (`ebook_access = public`), à filtrer encore (certains sont en prêt).
export type OlWork = { id: string; title: string; author?: string; year?: number; publisher?: string; pages?: number; isbn?: string; coverId?: number; popularity: number; scans?: string[] };

function toWork(row: z.infer<typeof docSchema>): OlWork {
  const isbn = firstIsbn13(row.isbn);
  return {
    id: row.key.replace(/^\/works\//, ''),
    title: row.title,
    ...(row.author_name?.[0] ? { author: row.author_name[0] } : {}),
    ...(row.first_publish_year !== undefined ? { year: row.first_publish_year } : {}),
    ...(row.publisher?.[0] ? { publisher: row.publisher[0] } : {}),
    ...(row.number_of_pages_median !== undefined ? { pages: row.number_of_pages_median } : {}),
    ...(isbn ? { isbn } : {}),
    ...(row.cover_i !== undefined ? { coverId: row.cover_i } : {}),
    popularity: row.edition_count ?? 0,
    ...(row.ebook_access === 'public' && row.ia?.length ? { scans: row.ia.slice(0, MAX_SCANS) } : {}),
  };
}

// Seules les œuvres (`/works/OL…W`) comptent : toute autre clé est ignorée.
const works = (rows: z.infer<typeof docSchema>[]): OlWork[] => rows.filter((row) => isWorkId(row.key.replace(/^\/works\//, ''))).map(toWork);

export function createOpenLibraryApi(deps: { fetch: BookFetch }) {
  const search = (params: Record<string, string>) => requestJson(deps.fetch, `${OPENLIBRARY_BASE}/search.json?${new URLSearchParams({ ...params, fields: FIELDS })}`, searchSchema);
  const checked = (workId: string): string => {
    if (!isWorkId(workId)) throw new BookError('not-found', 'identifiant d’œuvre invalide');
    return workId;
  };

  return {
    // L'œuvre d'un identifiant connu (lu sur Wikidata) ; null si Open Library ne la connaît pas.
    async byWork(workId: string): Promise<OlWork | null> {
      const data = await search({ q: `key:/works/${checked(workId)}`, limit: '1' });
      return works(data.docs)[0] ?? null;
    },

    // Recherche par titre : le choix (titre exact, le plus connu) est fait par le service.
    async searchByTitle(title: string): Promise<OlWork[]> {
      return works((await search({ title, limit: '10' })).docs);
    },

    // Description d'une œuvre (repli du synopsis) ; null si elle n'en a pas.
    async description(workId: string): Promise<string | null> {
      try {
        const data = await requestJson(deps.fetch, `${OPENLIBRARY_BASE}/works/${checked(workId)}.json`, workSchema);
        const text = typeof data.description === 'string' ? data.description : data.description?.value;
        return text?.trim() || null;
      } catch (error) {
        if (error instanceof BookError && error.code === 'not-found') return null;
        throw error;
      }
    },
  };
}
export type OpenLibraryApi = ReturnType<typeof createOpenLibraryApi>;
