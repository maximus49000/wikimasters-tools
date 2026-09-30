import { describe, expect, it } from 'vitest';
import { fetchWikidataBirth, parseWikidataBirth } from '../../../src/core/birth/wikidata-birth';

const claim = (time: string, precision: number, rank = 'normal') => ({
  rank,
  mainsnak: { datavalue: { value: { time, precision } } },
});
const entity = (...claims: unknown[]) => ({ entities: { Q1: { claims: { P569: claims } } } });

describe('parseWikidataBirth', () => {
  it('lit la date de naissance, mois compris', () => {
    expect(parseWikidataBirth(entity(claim('+1889-04-20T00:00:00Z', 11)))).toBeCloseTo(1889.25);
  });

  it("lit l'année seule quand la précision est l'année", () => {
    expect(parseWikidataBirth(entity(claim('+1889-01-01T00:00:00Z', 9)))).toBe(1889);
  });

  it('gère les dates avant J.-C.', () => {
    expect(parseWikidataBirth(entity(claim('-0384-01-01T00:00:00Z', 9)))).toBe(-384);
  });

  it('préfère le rang préféré et ignore les rangs dépréciés', () => {
    const json = entity(
      claim('+1900-01-01T00:00:00Z', 9, 'deprecated'),
      claim('+1901-01-01T00:00:00Z', 9),
      claim('+1902-01-01T00:00:00Z', 9, 'preferred'),
    );
    expect(parseWikidataBirth(json)).toBe(1902);
  });

  it('ignore une date trop imprécise (décennie, siècle)', () => {
    expect(parseWikidataBirth(entity(claim('+1800-01-01T00:00:00Z', 8)))).toBeNull();
  });

  it('renvoie null sans date ou pour un article inconnu', () => {
    expect(parseWikidataBirth({ entities: { Q2: { claims: {} } } })).toBeNull();
    expect(parseWikidataBirth({ entities: { '-1': { missing: '' } } })).toBeNull();
  });

  it('lève pour une réponse inattendue', () => {
    expect(() => parseWikidataBirth({ error: { code: 'x' } })).toThrow();
  });
});

describe('fetchWikidataBirth', () => {
  it("interroge Wikidata avec le titre de l'article", async () => {
    const urls: string[] = [];
    const year = await fetchWikidataBirth(async (url) => {
      urls.push(url);
      return new Response(JSON.stringify(entity(claim('+1889-01-01T00:00:00Z', 9))));
    }, 'Charlie_Chaplin');
    const url = new URL(urls[0] ?? '');
    expect(url.origin + url.pathname).toBe('https://www.wikidata.org/w/api.php');
    expect(url.searchParams.get('sites')).toBe('frwiki');
    expect(url.searchParams.get('titles')).toBe('Charlie Chaplin');
    expect(year).toBe(1889);
  });

  it('lève sur une erreur HTTP', async () => {
    await expect(fetchWikidataBirth(async () => new Response('', { status: 429 }), 'X')).rejects.toThrow('429');
  });
});
