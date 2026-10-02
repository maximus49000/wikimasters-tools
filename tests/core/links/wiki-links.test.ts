import { describe, expect, it, vi } from 'vitest';
import { fetchLeadLinks, parseLeadLinks } from '../../../src/core/links/wiki-links';

const respond = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const link = (title: string, extra: Record<string, unknown> = {}) => ({ ns: 0, title, exists: true, ...extra });

describe('parseLeadLinks', () => {
  it('rend les slugs des articles cités, sans doublon', () => {
    const links = parseLeadLinks({ parse: { title: 'Kamini', links: [link('Hip-hop français'), link('Édith Piaf'), link('Hip-hop français')] } });
    expect(links).toEqual(['Hip-hop_français', 'Édith_Piaf']);
  });

  it('ne garde que les articles : ni les autres espaces de noms, ni les liens rouges', () => {
    const links = parseLeadLinks({
      parse: {
        title: 'A',
        links: [link('Pop'), { ns: 14, title: 'Catégorie:Chanteur', exists: true }, { ns: 6, title: 'Fichier:A.jpg', exists: true }, link('Inexistant', { exists: false })],
      },
    });
    expect(links).toEqual(['Pop']);
  });

  it('rend une liste vide pour une introduction sans lien', () => {
    expect(parseLeadLinks({ parse: { title: 'A' } })).toEqual([]);
    expect(parseLeadLinks({ parse: { title: 'A', links: [] } })).toEqual([]);
  });

  it('rend une liste vide pour un article qui n’existe pas', () => {
    expect(parseLeadLinks({ error: { code: 'missingtitle', info: 'The page you specified doesn’t exist.' } })).toEqual([]);
  });

  it('lève sur une autre erreur ou une réponse inattendue (pour ne pas la mémoriser comme « sans lien »)', () => {
    expect(() => parseLeadLinks({ error: { code: 'internal_api_error_DBQueryError', info: 'boom' } })).toThrow('internal_api_error_DBQueryError');
    expect(() => parseLeadLinks({})).toThrow('Réponse Wikipédia inattendue');
    expect(() => parseLeadLinks({ parse: { links: [{ ns: 0 }] } })).toThrow();
  });
});

describe('fetchLeadLinks', () => {
  it('demande l’introduction de l’article, redirections suivies, et rend ses liens', async () => {
    const fetchFn = vi.fn(async (_url: string) => respond({ parse: { title: 'Édith Piaf', links: [link('Chanson française'), link('Paris')] } }));

    const links = await fetchLeadLinks(fetchFn, 'edith_piaf');

    expect(links).toEqual(['Chanson_française', 'Paris']);
    const url = new URL(fetchFn.mock.calls[0]?.[0] as string);
    expect(url.searchParams.get('action')).toBe('parse');
    expect(url.searchParams.get('prop')).toBe('links');
    expect(url.searchParams.get('section')).toBe('0');
    expect(url.searchParams.get('redirects')).toBe('1');
    expect(url.searchParams.get('page')).toBe('edith piaf');
  });

  it('n’envoie que le titre de l’article', async () => {
    const fetchFn = vi.fn(async (_url: string) => respond({ parse: { title: 'A', links: [] } }));
    await fetchLeadLinks(fetchFn, 'Kamini');
    const url = new URL(fetchFn.mock.calls[0]?.[0] as string);
    expect([...url.searchParams.keys()].sort()).toEqual(['action', 'disablelimitreport', 'format', 'formatversion', 'origin', 'page', 'prop', 'redirects', 'section']);
  });

  it('lève sur une erreur HTTP', async () => {
    await expect(fetchLeadLinks(vi.fn(async () => ({ ok: false, status: 429 }) as Response), 'A')).rejects.toThrow('429');
  });
});
