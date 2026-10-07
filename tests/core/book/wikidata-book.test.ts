import { describe, expect, it, vi } from 'vitest';
import { fetchWikidataBook, parseCardBook } from '../../../src/core/book/wikidata-book';

const text = (value: string, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value } } });
const entities = (record: Record<string, Record<string, unknown[]>>) => ({
  entities: Object.fromEntries(Object.entries(record).map(([key, claims]) => [key, { claims }])),
});

describe('parseCardBook', () => {
  it('lit l’identifiant Open Library de l’œuvre (P648)', () => {
    expect(parseCardBook(entities({ Q1: { P648: [text('OL1063588W')] } })).Q1).toEqual({ workId: 'OL1063588W' });
  });
  it('ignore une valeur mal formée (édition, auteur, adresse) et un rang déprécié, préfère le rang préféré', () => {
    const parsed = parseCardBook(entities({ Q1: { P648: [text('OL123M'), text('../x'), text('OL1W', 'deprecated'), text('OL2W', 'preferred')] } }));
    expect(parsed.Q1).toEqual({ workId: 'OL2W' });
  });
  it('rend un objet vide sans valeur, et lève sur un format inattendu', () => {
    expect(parseCardBook(entities({ Q1: {} })).Q1).toEqual({});
    expect(() => parseCardBook({ pas: 'wikidata' })).toThrow();
  });
});

describe('parseCardBook (lecture libre)', () => {
  const entity = { claims: { P2034: [text('135'), text('abc')], P50: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q7243' } } } }] }, sitelinks: { frwikisource: { title: 'Les Misérables' } } };
  it('lit la page Wikisource, l’identifiant Gutenberg valide et l’élément de l’auteur', () => {
    expect(parseCardBook({ entities: { Q1: entity } }).Q1).toEqual({ wikisource: 'Les Misérables', gutenberg: '135', authorId: 'Q7243' });
  });
  it('ignore un identifiant Gutenberg mal formé', () => {
    expect(parseCardBook({ entities: { Q1: { claims: { P2034: [text('x/../1')] } } } }).Q1).toEqual({});
  });
});

describe('fetchWikidataBook', () => {
  it('ajoute les sources libres et l’année de décès de l’auteur', async () => {
    const calls: URLSearchParams[] = [];
    const fetchFn = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      calls.push(params);
      if (params.get('prop') === 'pageprops') return Response.json({ query: { pages: [{ title: 'Les Misérables', pageprops: { wikibase_item: 'Q180736' } }] } });
      if (params.get('ids') === 'Q7243') {
        return Response.json({ entities: { Q7243: { claims: { P570: [{ rank: 'normal', mainsnak: { datavalue: { value: { time: '+1885-05-22T00:00:00Z', precision: 11 } } } }] } } } });
      }
      return Response.json({
        entities: { Q180736: { claims: { P648: [text('OL1063588W')], P2034: [text('135')], P50: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q7243' } } } }] }, sitelinks: { frwikisource: { title: 'Les Misérables' } } } },
      });
    });
    expect(await fetchWikidataBook(fetchFn, ['Les_Misérables'])).toEqual({
      Les_Misérables: { workId: 'OL1063588W', wikisource: 'Les Misérables', gutenberg: '135', authorDeath: 1885 },
    });
    expect(calls.some((params) => params.get('sitefilter') === 'frwikisource')).toBe(true);
  });

  it('rend une entrée par article, vide quand l’article n’a pas d’élément Wikidata', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      if (params.get('prop') === 'pageprops') {
        return Response.json({ query: { pages: [{ title: 'Les Misérables', pageprops: { wikibase_item: 'Q180736' } }, { title: 'Inconnu' }] } });
      }
      return Response.json(entities({ Q180736: { P648: [text('OL1063588W')] } }));
    });
    expect(await fetchWikidataBook(fetchFn, ['Les_Misérables', 'Inconnu'])).toEqual({ Les_Misérables: { workId: 'OL1063588W' }, Inconnu: {} });
  });
});
