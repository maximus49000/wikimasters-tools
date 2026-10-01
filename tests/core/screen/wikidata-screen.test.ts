import { describe, expect, it, vi } from 'vitest';
import { fetchWikidataScreen, parseCardScreen } from '../../../src/core/screen/wikidata-screen';

const text = (value: string, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value } } });
const entities = (record: Record<string, Record<string, unknown[]>>) => ({
  entities: Object.fromEntries(Object.entries(record).map(([key, claims]) => [key, { claims }])),
});

describe('parseCardScreen', () => {
  it('lit les identifiants TMDB film, série et personne', () => {
    const parsed = parseCardScreen(entities({ Q1: { P4947: [text('27205')], P4983: [text('1396')], P4985: [text('6193')] } }));
    expect(parsed.Q1).toEqual({ movieId: 27205, tvId: 1396, personId: 6193 });
  });

  it('ignore une valeur mal formée et un rang déprécié, garde le rang préféré', () => {
    const parsed = parseCardScreen(entities({ Q1: { P4947: [text('abc'), text('1', 'deprecated'), text('2', 'preferred')] } }));
    expect(parsed.Q1).toEqual({ movieId: 2 });
  });

  it('rend un objet vide sans valeur, et lève sur un format inattendu', () => {
    expect(parseCardScreen(entities({ Q1: {} })).Q1).toEqual({});
    expect(() => parseCardScreen({ pas: 'wikidata' })).toThrow();
  });
});

describe('fetchWikidataScreen', () => {
  it('rend une entrée par article', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      if (params.get('prop') === 'pageprops') {
        return Response.json({
          query: { pages: [{ title: 'Inception', pageprops: { wikibase_item: 'Q25188' } }, { title: 'Inconnu' }] },
        });
      }
      return Response.json(entities({ Q25188: { P4947: [text('27205')] } }));
    });
    const result = await fetchWikidataScreen(fetchFn, ['Inception', 'Inconnu']);
    expect(result).toEqual({ Inception: { movieId: 27205 }, Inconnu: {} });
  });
});
