import { describe, expect, it } from 'vitest';
import { fetchWikidataDates, parseCardDates, parseWikibaseItems } from '../../../src/core/birth/wikidata-birth';

const claim = (time: string, precision: number, rank = 'normal') => ({
  rank,
  mainsnak: { datavalue: { value: { time, precision } } },
});
const entities = (record: Record<string, Record<string, unknown[]>>) => ({
  entities: Object.fromEntries(Object.entries(record).map(([id, claims]) => [id, { claims }])),
});
const none = { birth: null, death: null, start: null, end: null };

describe('parseCardDates', () => {
  it('lit la date de naissance, mois compris', () => {
    const dates = parseCardDates(entities({ Q1: { P569: [claim('+1889-04-20T00:00:00Z', 11)] } }));
    expect(dates.Q1?.birth).toBeCloseTo(1889.25);
  });

  it("lit l'année seule quand la précision est l'année, et les dates avant J.-C.", () => {
    expect(parseCardDates(entities({ Q1: { P569: [claim('+1889-01-01T00:00:00Z', 9)] } })).Q1?.birth).toBe(1889);
    expect(parseCardDates(entities({ Q1: { P569: [claim('-0384-01-01T00:00:00Z', 9)] } })).Q1?.birth).toBe(-384);
  });

  it('lit le début et la fin d’un évènement', () => {
    const json = entities({
      Q1: { P580: [claim('+1939-09-01T00:00:00Z', 11)], P582: [claim('+1945-09-02T00:00:00Z', 11)] },
    });
    const dates = parseCardDates(json).Q1;
    expect(dates?.start).toBeCloseTo(1939.67, 1);
    expect(dates?.end).toBeCloseTo(1945.67, 1);
    expect(dates?.birth).toBeNull();
  });

  it('se rabat sur la date ponctuelle, puis la création, quand il n’y a pas de début', () => {
    expect(parseCardDates(entities({ Q1: { P585: [claim('+1969-01-01T00:00:00Z', 9)] } })).Q1?.start).toBe(1969);
    expect(parseCardDates(entities({ Q1: { P571: [claim('+1889-01-01T00:00:00Z', 9)] } })).Q1?.start).toBe(1889);
    expect(parseCardDates(entities({ Q1: { P576: [claim('+1991-01-01T00:00:00Z', 9)] } })).Q1?.end).toBe(1991);
  });

  it('préfère le rang préféré et ignore les rangs dépréciés', () => {
    const claims = [
      claim('+1900-01-01T00:00:00Z', 9, 'deprecated'),
      claim('+1901-01-01T00:00:00Z', 9),
      claim('+1902-01-01T00:00:00Z', 9, 'preferred'),
    ];
    expect(parseCardDates(entities({ Q1: { P569: claims } })).Q1?.birth).toBe(1902);
  });

  it('ignore une date trop imprécise et renvoie null sans date', () => {
    expect(parseCardDates(entities({ Q1: { P569: [claim('+1800-01-01T00:00:00Z', 8)] }, Q2: {} }))).toEqual({ Q1: none, Q2: none });
  });

  it('lit la date de mort', () => {
    const dates = parseCardDates(entities({ Q1: { P569: [claim('+1889-01-01T00:00:00Z', 9)], P570: [claim('+1977-12-25T00:00:00Z', 11)] } }));
    expect(dates.Q1?.birth).toBe(1889);
    expect(dates.Q1?.death).toBeCloseTo(1977.92, 1);
  });

  describe('bâtiments', () => {
    const construction = (start?: string, end?: string, id = 'Q385378') => ({
      mainsnak: { datavalue: { value: { id }, type: 'wikibase-entityid' } },
      qualifiers: {
        ...(start ? { P580: [{ datavalue: { value: { time: start, precision: 9 } } }] } : {}),
        ...(end ? { P582: [{ datavalue: { value: { time: end, precision: 9 } } }] } : {}),
      },
    });

    it('préfère la période de construction (plusieurs phases : début le plus tôt, fin la plus tardive)', () => {
      const json = entities({
        Q1: {
          P571: [claim('+1888-01-01T00:00:00Z', 9)],
          P793: [construction('+1882-00-00T00:00:00Z', '+1883-00-00T00:00:00Z'), construction('+1883-00-00T00:00:00Z', '+1926-00-00T00:00:00Z'), construction(undefined, undefined, 'Q5')],
        },
      });
      expect(parseCardDates(json).Q1).toMatchObject({ start: 1882, end: 1926 });
    });

    it('sans période de construction : création jusqu’à l’ouverture', () => {
      const json = entities({ Q1: { P571: [claim('+1861-01-01T00:00:00Z', 9)], P1619: [claim('+1875-01-01T00:00:00Z', 9)] } });
      expect(parseCardDates(json).Q1).toMatchObject({ start: 1861, end: 1875 });
    });

    it('plusieurs créations : la première est le début, la dernière la fin', () => {
      const json = entities({ Q1: { P571: [claim('+1889-01-01T00:00:00Z', 9), claim('+1887-01-01T00:00:00Z', 9)] } });
      expect(parseCardDates(json).Q1).toMatchObject({ start: 1887, end: 1889 });
    });

    it('une seule création : pas de fin', () => {
      const json = entities({ Q1: { P571: [claim('+1036-01-01T00:00:00Z', 9)] } });
      expect(parseCardDates(json).Q1).toMatchObject({ start: 1036, end: null });
    });
  });

  it('ignore les autres propriétés, quel que soit leur format (texte, identifiant d’élément…)', () => {
    const json = entities({
      Q1: {
        P31: [{ mainsnak: { snaktype: 'value', datavalue: { value: { 'entity-type': 'item', id: 'Q5' }, type: 'wikibase-entityid' } } }],
        P18: [{ mainsnak: { datavalue: { value: 'Image.jpg', type: 'string' } } }],
        P569: [claim('+1889-01-01T00:00:00Z', 9)],
        P580: [{ mainsnak: { snaktype: 'somevalue' } }],
      },
    });
    expect(parseCardDates(json)).toEqual({ Q1: { birth: 1889, death: null, start: null, end: null } });
  });

  it('lève pour une réponse inattendue', () => {
    expect(() => parseCardDates({ error: { code: 'x' } })).toThrow();
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

describe('fetchWikidataDates', () => {
  const pages = {
    query: { pages: [{ title: 'Charlie Chaplin', pageprops: { wikibase_item: 'Q882' } }, { title: 'Paris', pageprops: {} }] },
  };

  it('interroge Wikipédia puis Wikidata, une fois pour tout le lot', async () => {
    const urls: string[] = [];
    const result = await fetchWikidataDates(async (url) => {
      urls.push(url);
      return new Response(JSON.stringify(url.includes('wikidata') ? entities({ Q882: { P569: [claim('+1889-01-01T00:00:00Z', 9)] } }) : pages));
    }, ['Charlie_Chaplin', 'Paris']);

    expect(urls).toHaveLength(2);
    expect(new URL(urls[0] ?? '').searchParams.get('titles')).toBe('Charlie Chaplin|Paris');
    expect(new URL(urls[1] ?? '').searchParams.get('ids')).toBe('Q882');
    expect(result).toEqual({ Charlie_Chaplin: { birth: 1889, death: null, start: null, end: null }, Paris: none });
  });

  it("n'appelle pas Wikidata quand aucun article n'a d'élément", async () => {
    let calls = 0;
    const result = await fetchWikidataDates(async () => {
      calls += 1;
      return new Response(JSON.stringify({ query: { pages: [{ title: 'X', missing: true }] } }));
    }, ['X']);
    expect(calls).toBe(1);
    expect(result).toEqual({ X: none });
  });

  it('lève sur une erreur HTTP', async () => {
    await expect(fetchWikidataDates(async () => new Response('', { status: 429 }), ['X'])).rejects.toThrow('429');
  });
});
