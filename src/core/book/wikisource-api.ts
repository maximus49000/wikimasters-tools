import { z } from 'zod';
import type { BookFetch } from './book-detail';
import { normalizeTitle } from './book-format';
import { requestJson } from './http';

const WIKISOURCE_API = 'https://fr.wikisource.org/w/api.php';

const searchSchema = z.object({ query: z.object({ search: z.array(z.object({ title: z.string() })) }) });

// Une parenthèse finale précise l'auteur ou l'édition : « Le Dormeur du val (Rimbaud) ».
const PARENTHESIS = /\s*\(([^)]*)\)\s*$/;

// La page principale d'un texte : titre égal (accents, casse, ponctuation), jamais une sous-page (« …/Tome 2 »), et, quand la page
// précise un auteur ou une édition entre parenthèses, l'auteur du livre doit y figurer (nom de famille). Sans parenthèse, la page est retenue.
export function pickText(titles: string[], wanted: string, author?: string): string | null {
  const surname = normalizeTitle(author?.split(/\s+/).pop() ?? '');
  const candidates = titles.flatMap((title) => {
    if (title.includes('/')) return [];
    const match = PARENTHESIS.exec(title);
    if (normalizeTitle(title.replace(PARENTHESIS, '')) !== wanted) return [];
    if (!match) return [{ title, rank: 0 }];
    return surname !== '' && normalizeTitle(match[1] ?? '').includes(surname) ? [{ title, rank: 1 }] : [];
  });
  return candidates.sort((a, b) => a.rank - b.rank)[0]?.title ?? null;
}

export function createWikisourceApi(deps: { fetch: BookFetch }) {
  return {
    // Le titre de la page Wikisource FR du texte, ou null quand rien ne concorde strictement.
    async find(title: string, author?: string): Promise<string | null> {
      const wanted = normalizeTitle(title);
      if (wanted === '') return null;
      const params = new URLSearchParams({ action: 'query', list: 'search', srsearch: title, srnamespace: '0', srlimit: '10', format: 'json', formatversion: '2', origin: '*' });
      const data = await requestJson(deps.fetch, `${WIKISOURCE_API}?${params}`, searchSchema);
      return pickText(data.query.search.map((row) => row.title), wanted, author);
    },
  };
}
export type WikisourceApi = ReturnType<typeof createWikisourceApi>;
