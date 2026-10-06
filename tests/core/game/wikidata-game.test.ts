import { describe, expect, it, vi } from 'vitest';
import { isVideoGame } from '../../../src/core/game/game-kinds';
import { fetchWikidataGame, parseCardGame } from '../../../src/core/game/wikidata-game';

const text = (value: string, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value } } });
const entities = (record: Record<string, Record<string, unknown[]>>) => ({
  entities: Object.fromEntries(Object.entries(record).map(([key, claims]) => [key, { claims }])),
});

describe('parseCardGame', () => {
  it("lit l'identifiant Steam (P1733) et le slug IGDB (P5794)", () => {
    const parsed = parseCardGame(entities({ Q1: { P1733: [text('1245620')], P5794: [text('elden-ring')] } }));
    expect(parsed.Q1).toEqual({ steamId: 1245620, igdbSlug: 'elden-ring' });
  });

  it('ignore une valeur mal formée et un rang déprécié', () => {
    const parsed = parseCardGame(entities({ Q1: { P1733: [text('abc'), text('1', 'deprecated'), text('2', 'preferred')], P5794: [text('Pas Un Slug!')] } }));
    expect(parsed.Q1).toEqual({ steamId: 2 });
  });

  it('rend un objet vide sans valeur, et lève sur un format inattendu', () => {
    expect(parseCardGame(entities({ Q1: {} })).Q1).toEqual({});
    expect(() => parseCardGame({ pas: 'wikidata' })).toThrow();
  });
});

describe('fetchWikidataGame', () => {
  it('rend une entrée par article', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      if (params.get('prop') === 'pageprops') {
        return Response.json({ query: { pages: [{ title: 'Elden Ring', pageprops: { wikibase_item: 'Q64826862' } }, { title: 'Inconnu' }] } });
      }
      return Response.json(entities({ Q64826862: { P1733: [text('1245620')] } }));
    });
    expect(await fetchWikidataGame(fetchFn, ['Elden_Ring', 'Inconnu'])).toEqual({ Elden_Ring: { steamId: 1245620 }, Inconnu: {} });
  });
});

describe('isVideoGame', () => {
  it('reconnaît la nature « jeu vidéo » (Q7889)', () => {
    expect(isVideoGame({ natures: ['Q7889'], occupations: [], genres: [] })).toBe(true);
    expect(isVideoGame({ natures: ['Q11424'], occupations: [], genres: [] })).toBe(false);
    expect(isVideoGame(undefined)).toBe(false);
  });
});
