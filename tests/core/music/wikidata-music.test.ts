import { describe, expect, it, vi } from 'vitest';
import { fetchWikidataMusic, parseCardMusic } from '../../../src/core/music/wikidata-music';

const id = (value: string) => ({ rank: 'normal', mainsnak: { datavalue: { value: { id: value } } } });
const text = (value: string, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value } } });
const entities = (record: Record<string, Record<string, unknown[]>>) => ({
  entities: Object.fromEntries(Object.entries(record).map(([key, claims]) => [key, { claims }])),
});
const SPOTIFY_ID = '4uLU6hMCjMI75M1A2tKUQC';

describe('parseCardMusic', () => {
  it("lit l'interprète et les identifiants Spotify", () => {
    const parsed = parseCardMusic(
      entities({ Q1: { P175: [id('Q15')], P2207: [text(SPOTIFY_ID)], P2205: [text('1DFixLWuPkv3KT3TnV35m3')], P1902: [text('3WrFJ7ztbogyGnTHbHJFl2')] } }),
    );
    expect(parsed.Q1).toEqual({
      performerQid: 'Q15',
      trackId: SPOTIFY_ID,
      albumId: '1DFixLWuPkv3KT3TnV35m3',
      artistId: '3WrFJ7ztbogyGnTHbHJFl2',
    });
  });

  it('ignore un identifiant Spotify mal formé et les rangs dépréciés, garde le rang préféré', () => {
    const parsed = parseCardMusic(
      entities({ Q1: { P2207: [text('pas-un-id'), text('A'.repeat(22), 'deprecated'), text(SPOTIFY_ID, 'preferred')] } }),
    );
    expect(parsed.Q1).toEqual({ trackId: SPOTIFY_ID });
  });

  it('rend un objet vide pour un élément sans valeur, et lève sur un format inattendu', () => {
    expect(parseCardMusic(entities({ Q1: {} })).Q1).toEqual({});
    expect(() => parseCardMusic({ pas: 'wikidata' })).toThrow();
  });
});

describe('fetchWikidataMusic', () => {
  it('rend une entrée par article, avec le libellé français de l\'interprète', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      if (params.get('prop') === 'pageprops') {
        return Response.json({ query: { pages: [{ title: 'Yesterday', pageprops: { wikibase_item: 'Q1' } }, { title: 'Inconnu' }] } });
      }
      if (params.get('props') === 'claims') return Response.json(entities({ Q1: { P175: [id('Q15')], P2207: [text(SPOTIFY_ID)] } }));
      return Response.json({ entities: { Q15: { labels: { fr: { value: 'The Beatles' }, en: { value: 'The Beatles (en)' } } } } });
    });
    expect(await fetchWikidataMusic(fetchFn, ['Yesterday', 'Inconnu'])).toEqual({
      Yesterday: { trackId: SPOTIFY_ID, performer: 'The Beatles' },
      Inconnu: {},
    });
  });
});
