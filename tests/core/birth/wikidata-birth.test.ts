import { describe, expect, it } from 'vitest';
import { fetchWikidataBirths, parseBirthYears, parseWikibaseItems } from '../../../src/core/birth/wikidata-birth';

const claim = (time: string, precision: number, rank = 'normal') => ({
  rank,
  mainsnak: { datavalue: { value: { time, precision } } },
});
const entities = (record: Record<string, unknown[] | undefined>) => ({
  entities: Object.fromEntries(Object.entries(record).map(([id, claims]) => [id, { claims: claims ? { P569: claims } : {} }])),
});

describe('parseBirthYears', () => {
  it('lit la date de naissance, mois compris', () => {
    expect(parseBirthYears(entities({ Q1: [claim('+1889-04-20T00:00:00Z', 11)] })).Q1).toBeCloseTo(1889.25);
  });

  it("lit l'année seule quand la précision est l'année", () => {
    expect(parseBirthYears(entities({ Q1: [claim('+1889-01-01T00:00:00Z', 9)] }))).toEqual({ Q1: 1889 });
  });

  it('gère les dates avant J.-C.', () => {
    expect(parseBirthYears(entities({ Q1: [claim('-0384-01-01T00:00:00Z', 9)] }))).toEqual({ Q1: -384 });
  });

  it('préfère le rang préféré et ignore les rangs dépréciés', () => {
    const claims = [
      claim('+1900-01-01T00:00:00Z', 9, 'deprecated'),
      claim('+1901-01-01T00:00:00Z', 9),
      claim('+1902-01-01T00:00:00Z', 9, 'preferred'),
    ];
    expect(parseBirthYears(entities({ Q1: claims }))).toEqual({ Q1: 1902 });
  });

  it('ignore une date trop imprécise et renvoie null sans date', () => {
    expect(parseBirthYears(entities({ Q1: [claim('+1800-01-01T00:00:00Z', 8)], Q2: undefined }))).toEqual({ Q1: null, Q2: null });
  });

  it('lève pour une réponse inattendue', () => {
    expect(() => parseBirthYears({ error: { code: 'x' } })).toThrow();
  });
});

describe('parseWikibaseItems', () => {
  it('suit normalisations et redirections, et renvoie null sans élément', () => {
    const json = {
      query: {
        normalized: [{ from: 'charlie chaplin', to: 'Charlie chaplin' }],
        redirects: [{ from: 'Charlie chaplin', to: 'Charlie Chaplin' }],
        pages: [
          { title: 'Charlie Chaplin', pageprops: { wikibase_item: 'Q882' } },
          { title: 'Inconnu', missing: true },
        ],
      },
    };
    expect(parseWikibaseItems(json, ['charlie chaplin', 'Inconnu'])).toEqual({ 'charlie chaplin': 'Q882', Inconnu: null });
  });

  it('lève pour une réponse inattendue', () => {
    expect(() => parseWikibaseItems({ nope: 1 }, ['A'])).toThrow();
  });
});

describe('fetchWikidataBirths', () => {
  const pages = {
    query: { pages: [{ title: 'Charlie Chaplin', pageprops: { wikibase_item: 'Q882' } }, { title: 'Paris', pageprops: {} }] },
  };

  it('interroge Wikipédia puis Wikidata, une fois pour tout le lot', async () => {
    const urls: string[] = [];
    const result = await fetchWikidataBirths(async (url) => {
      urls.push(url);
      return new Response(JSON.stringify(url.includes('wikidata') ? entities({ Q882: [claim('+1889-01-01T00:00:00Z', 9)] }) : pages));
    }, ['Charlie_Chaplin', 'Paris']);

    expect(urls).toHaveLength(2);
    expect(new URL(urls[0] ?? '').searchParams.get('titles')).toBe('Charlie Chaplin|Paris');
    expect(new URL(urls[1] ?? '').searchParams.get('ids')).toBe('Q882');
    expect(result).toEqual({ Charlie_Chaplin: 1889, Paris: null });
  });

  it("n'appelle pas Wikidata quand aucun article n'a d'élément", async () => {
    let calls = 0;
    const result = await fetchWikidataBirths(async () => {
      calls += 1;
      return new Response(JSON.stringify({ query: { pages: [{ title: 'X', missing: true }] } }));
    }, ['X']);
    expect(calls).toBe(1);
    expect(result).toEqual({ X: null });
  });

  it('lève sur une erreur HTTP', async () => {
    await expect(fetchWikidataBirths(async () => new Response('', { status: 429 }), ['X'])).rejects.toThrow('429');
  });
});
