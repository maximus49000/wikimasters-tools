// tests/core/book/openlibrary-api.test.ts
import { describe, expect, it, vi } from 'vitest';
import { BookError } from '../../../src/core/book/errors';
import { createOpenLibraryApi } from '../../../src/core/book/openlibrary-api';

// Forme réelle de search.json (champs demandés seulement).
const etranger = {
  key: '/works/OL1230613W',
  title: 'L’étranger',
  author_name: ['Albert Camus'],
  first_publish_year: 1942,
  cover_i: 13151269,
  isbn: ['2070360024', '9782070360024'],
  publisher: ['Gallimard'],
  number_of_pages_median: 186,
  edition_count: 468,
};

const json = (body: unknown, status = 200) => vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));

describe('createOpenLibraryApi', () => {
  it('byWork interroge la recherche par clé et convertit la première œuvre', async () => {
    const fetchFn = json({ docs: [etranger] });
    const work = await createOpenLibraryApi({ fetch: fetchFn }).byWork('OL1230613W');
    expect(work).toEqual({ id: 'OL1230613W', title: 'L’étranger', author: 'Albert Camus', year: 1942, publisher: 'Gallimard', pages: 186, isbn: '9782070360024', coverId: 13151269, popularity: 468 });
    const url = new URL(fetchFn.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe('https://openlibrary.org/search.json');
    expect(url.searchParams.get('q')).toBe('key:/works/OL1230613W');
  });

  it('byWork rend null sans résultat et refuse un identifiant mal formé sans appel réseau', async () => {
    expect(await createOpenLibraryApi({ fetch: json({ docs: [] }) }).byWork('OL1W')).toBeNull();
    const fetchFn = json({ docs: [] });
    await expect(createOpenLibraryApi({ fetch: fetchFn }).byWork('../x')).rejects.toBeInstanceOf(BookError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('ignore les lignes dont la clé n’est pas une œuvre', async () => {
    const api = createOpenLibraryApi({ fetch: json({ docs: [{ key: '/books/OL1M', title: 'Édition' }, etranger] }) });
    expect((await api.searchByTitle('x')).map((work) => work.id)).toEqual(['OL1230613W']);
    expect(await createOpenLibraryApi({ fetch: json({ docs: [{ key: '/books/OL1M', title: 'Édition' }] }) }).byWork('OL1W')).toBeNull();
  });

  it('une œuvre sans auteur, sans couverture ni ISBN reste valide', async () => {
    const work = await createOpenLibraryApi({ fetch: json({ docs: [{ key: '/works/OL9W', title: 'Anonyme' }] }) }).byWork('OL9W');
    expect(work).toEqual({ id: 'OL9W', title: 'Anonyme', popularity: 0 });
  });

  it('searchByTitle cherche par titre et rend toutes les œuvres', async () => {
    const fetchFn = json({ docs: [etranger, { key: '/works/OL16033130W', title: 'Novels (La chute / L’Étranger)' }] });
    const works = await createOpenLibraryApi({ fetch: fetchFn }).searchByTitle('L’étranger');
    expect(works.map((work) => work.id)).toEqual(['OL1230613W', 'OL16033130W']);
    expect(new URL(fetchFn.mock.calls[0]![0]).searchParams.get('title')).toBe('L’étranger');
  });

  it('description lit une chaîne ou un objet { value }, et rend null si absente ou introuvable', async () => {
    expect(await createOpenLibraryApi({ fetch: json({ description: ' Un roman. ' }) }).description('OL1W')).toBe('Un roman.');
    expect(await createOpenLibraryApi({ fetch: json({ description: { type: '/type/text', value: 'Autre' } }) }).description('OL1W')).toBe('Autre');
    expect(await createOpenLibraryApi({ fetch: json({}) }).description('OL1W')).toBeNull();
    expect(await createOpenLibraryApi({ fetch: json({}, 404) }).description('OL1W')).toBeNull();
  });

  it('un échec autre que « introuvable » remonte', async () => {
    await expect(createOpenLibraryApi({ fetch: json({}, 429) }).description('OL1W')).rejects.toMatchObject({ code: 'rate-limited' });
  });
});
