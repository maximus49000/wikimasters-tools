import { describe, expect, it, vi } from 'vitest';
import { fetchWikipediaIntro } from '../../../src/core/book/wikipedia-intro';

const page = (extra: object) => vi.fn(async (_url: string) => Response.json({ query: { pages: [{ title: 'Les Misérables', ...extra }] } }));

describe('fetchWikipediaIntro', () => {
  it('rend l’introduction de l’article (texte brut) et interroge le bon titre', async () => {
    const fetchFn = page({ extract: ' Les Misérables est un roman de Victor Hugo.\nIl décrit… ' });
    expect(await fetchWikipediaIntro(fetchFn, 'Les_Misérables')).toBe('Les Misérables est un roman de Victor Hugo.\nIl décrit…');
    const url = new URL(fetchFn.mock.calls[0]![0]);
    expect(url.searchParams.get('titles')).toBe('Les Misérables');
    expect(url.searchParams.get('exintro')).toBe('1');
    expect(url.searchParams.get('explaintext')).toBe('1');
  });
  it('rend null pour un article absent ou sans texte', async () => {
    expect(await fetchWikipediaIntro(page({ missing: true }), 'Inconnu')).toBeNull();
    expect(await fetchWikipediaIntro(page({ extract: '  ' }), 'Vide')).toBeNull();
  });
  it('lève sur un format inattendu ou une erreur HTTP', async () => {
    await expect(fetchWikipediaIntro(async () => Response.json({ pas: 'wikipédia' }), 'X')).rejects.toThrow();
    await expect(fetchWikipediaIntro(async () => new Response('', { status: 500 }), 'X')).rejects.toThrow();
  });
});
