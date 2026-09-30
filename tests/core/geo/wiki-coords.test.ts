import { describe, expect, it } from 'vitest';
import { fetchWikiCoords, parseWikiCoords } from '../../../src/core/geo/wiki-coords';

const FOUND = {
  query: {
    pages: [
      { pageid: 1, title: 'Tour Eiffel', coordinates: [{ lat: 48.8583, lon: 2.2945, primary: true, globe: 'earth' }] },
    ],
  },
};
const NONE = { query: { pages: [{ pageid: 2, title: 'Ted Lasso' }] } };
const MISSING = { query: { pages: [{ title: 'Zzz', missing: true }] } };

describe('parseWikiCoords', () => {
  it('lit les coordonnées principales', () => {
    expect(parseWikiCoords(FOUND)).toEqual({ lat: 48.8583, lon: 2.2945 });
  });

  it('renvoie null pour un article sans coordonnées ou inexistant', () => {
    expect(parseWikiCoords(NONE)).toBeNull();
    expect(parseWikiCoords(MISSING)).toBeNull();
  });

  it('lève pour une réponse au format inattendu (ne pas la confondre avec « aucune coordonnée »)', () => {
    expect(() => parseWikiCoords({ error: { code: 'x' } })).toThrow();
  });
});

describe('fetchWikiCoords', () => {
  it('interroge l\'API Wikipédia avec le titre de l\'article', async () => {
    const urls: string[] = [];
    const coords = await fetchWikiCoords(async (url) => {
      urls.push(url);
      return new Response(JSON.stringify(FOUND));
    }, 'Tour_Eiffel');

    const url = new URL(urls[0] ?? '');
    expect(url.origin + url.pathname).toBe('https://fr.wikipedia.org/w/api.php');
    expect(url.searchParams.get('titles')).toBe('Tour Eiffel');
    expect(url.searchParams.get('prop')).toBe('coordinates');
    expect(url.searchParams.get('origin')).toBe('*');
    expect(coords).toEqual({ lat: 48.8583, lon: 2.2945 });
  });

  it('lève sur une erreur HTTP', async () => {
    await expect(fetchWikiCoords(async () => new Response('', { status: 500 }), 'Paris')).rejects.toThrow('500');
  });
});
