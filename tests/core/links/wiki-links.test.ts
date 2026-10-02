import { describe, expect, it, vi } from 'vitest';
import { fetchWikiLinks, parseLinksPage } from '../../../src/core/links/wiki-links';

const respond = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const noSleep = async () => undefined;
const links = (...titles: string[]) => titles.map((title) => ({ title }));

describe('parseLinksPage', () => {
  it('lit les liens par page, la suite de la pagination, les normalisations et les redirections', () => {
    const page = parseLinksPage({
      continue: { plcontinue: '12|0|Pop', continue: '||' },
      query: {
        normalized: [{ from: 'piaf', to: 'Piaf' }],
        redirects: [{ from: 'Piaf', to: 'Édith Piaf' }],
        pages: [{ title: 'Édith Piaf', links: links('Pop', 'Paris') }, { title: 'Vide' }],
      },
    });
    expect(page.next).toEqual({ plcontinue: '12|0|Pop', continue: '||' });
    expect(page.normalized.get('piaf')).toBe('Piaf');
    expect(page.redirects.get('Piaf')).toBe('Édith Piaf');
    expect(page.links.get('Édith Piaf')).toEqual(['Pop', 'Paris']);
    expect(page.links.get('Vide')).toEqual([]);
  });

  it('lève sur une réponse inattendue (pour ne pas la mémoriser comme « sans lien »)', () => {
    expect(() => parseLinksPage({})).toThrow('Réponse Wikipédia inattendue');
    expect(() => parseLinksPage({ query: {} })).toThrow();
  });
});

describe('fetchWikiLinks', () => {
  it('rend, pour chaque article demandé, les slugs des articles cités, et une liste vide sans lien', async () => {
    const fetchFn = vi.fn(async (_url: string) =>
      respond({ query: { pages: [{ title: 'Kamini', links: links('Pop', 'Édith Piaf', 'Pop') }, { title: 'Inconnue', missing: true }] } }),
    );

    const result = await fetchWikiLinks(fetchFn, ['Kamini', 'Inconnue'], { sleep: noSleep });

    expect(result).toEqual({ Kamini: ['Pop', 'Édith_Piaf'], Inconnue: [] });
    const url = new URL(fetchFn.mock.calls[0]?.[0] as string);
    expect(url.searchParams.get('prop')).toBe('links');
    expect(url.searchParams.get('plnamespace')).toBe('0');
    expect(url.searchParams.get('pllimit')).toBe('max');
    expect(url.searchParams.get('redirects')).toBe('1');
    expect(url.searchParams.get('titles')).toBe('Kamini|Inconnue');
  });

  it('suit la pagination en renvoyant plcontinue, et réunit les liens des différentes pages', async () => {
    const fetchFn = vi
      .fn<(url: string) => Promise<Response>>()
      .mockResolvedValueOnce(respond({ continue: { plcontinue: 'abc', continue: '||' }, query: { pages: [{ title: 'A', links: links('Pop') }] } }))
      .mockResolvedValueOnce(respond({ query: { pages: [{ title: 'A', links: links('Rock', 'Pop') }] } }));
    const sleep = vi.fn(noSleep);

    const result = await fetchWikiLinks(fetchFn, ['A'], { sleep, gapMs: 150 });

    expect(result).toEqual({ A: ['Pop', 'Rock'] });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const second = new URL(fetchFn.mock.calls[1]?.[0] as string);
    expect(second.searchParams.get('plcontinue')).toBe('abc');
    expect(second.searchParams.get('continue')).toBe('||');
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(150);
  });

  it('rattache les liens à l’article demandé malgré normalisation et redirection', async () => {
    const fetchFn = vi.fn(async () =>
      respond({
        query: {
          normalized: [{ from: 'edith piaf', to: 'Edith piaf' }],
          redirects: [{ from: 'Edith piaf', to: 'Édith Piaf' }],
          pages: [{ title: 'Édith Piaf', links: links('Pop') }],
        },
      }),
    );
    expect(await fetchWikiLinks(fetchFn, ['edith_piaf'], { sleep: noSleep })).toEqual({ edith_piaf: ['Pop'] });
  });

  it('lève sur une erreur HTTP et sur une réponse inattendue', async () => {
    await expect(fetchWikiLinks(vi.fn(async () => ({ ok: false, status: 429 }) as Response), ['A'], { sleep: noSleep })).rejects.toThrow('429');
    await expect(fetchWikiLinks(vi.fn(async () => respond({})), ['A'], { sleep: noSleep })).rejects.toThrow('inattendue');
  });

  it('abandonne si la pagination ne se termine jamais', async () => {
    const fetchFn = vi.fn(async () => respond({ continue: { plcontinue: 'x', continue: '||' }, query: { pages: [{ title: 'A', links: links('Pop') }] } }));
    await expect(fetchWikiLinks(fetchFn, ['A'], { sleep: noSleep })).rejects.toThrow('trop de pages');
  });
});
