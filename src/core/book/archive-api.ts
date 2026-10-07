import { z } from 'zod';
import type { BookFetch } from './book-detail';
import { requestJson } from './http';

const ARCHIVE_SEARCH = 'https://archive.org/advancedsearch.php';

const searchSchema = z.object({ response: z.object({ docs: z.array(z.object({ identifier: z.string() })) }) });

// Open Library liste les scans d'une œuvre sans dire lesquels sont libres : les autres sont en prêt (compte requis).
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function createArchiveApi(deps: { fetch: BookFetch }) {
  return {
    // Le premier (dans l'ordre d'Open Library) des scans qui se lisent librement ; null s'il n'y en a aucun.
    async firstFree(identifiers: string[]): Promise<string | null> {
      const ids = identifiers.filter((id) => SAFE_ID.test(id));
      if (ids.length === 0) return null;
      const params = new URLSearchParams({ q: `identifier:(${ids.join(' OR ')}) AND NOT access-restricted-item:true`, rows: String(ids.length), output: 'json' });
      params.append('fl[]', 'identifier');
      const data = await requestJson(deps.fetch, `${ARCHIVE_SEARCH}?${params}`, searchSchema);
      const free = new Set(data.response.docs.map((doc) => doc.identifier));
      return ids.find((id) => free.has(id)) ?? null;
    },
  };
}
export type ArchiveApi = ReturnType<typeof createArchiveApi>;
