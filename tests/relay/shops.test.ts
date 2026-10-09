import { describe, expect, it, vi } from 'vitest';
import { proxyShops, typesOfTags } from '../../relay/src/shops';

const element = (tags: Record<string, string>) => ({ type: 'node', id: Math.random(), tags });
const run = (path: string, elements: unknown[] = [], status = 200) => {
  const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ elements }), { status }));
  return { fetchFn, result: proxyShops(new URL(`https://relais.test${path}`), { fetch: fetchFn, now: () => 0 }) };
};

describe('typesOfTags', () => {
  it('range les étiquettes OSM dans les types du catalogue', () => {
    expect(typesOfTags({ amenity: 'pub' })).toEqual(['bar']);
    expect(typesOfTags({ amenity: 'nightclub' })).toEqual(['nightclub']);
    expect(typesOfTags({ amenity: 'restaurant', cuisine: 'pizza' })).toEqual(['pizzeria']);
    expect(typesOfTags({ amenity: 'fast_food', cuisine: 'kebab' })).toEqual(['kebab']);
    expect(typesOfTags({ amenity: 'restaurant', cuisine: 'sushi;japanese' })).toEqual(['sushi']);
    expect(typesOfTags({ amenity: 'restaurant', cuisine: 'french' })).toEqual(['restaurant']);
    expect(typesOfTags({ amenity: 'cafe', cuisine: 'tea' })).toEqual(['tearoom']);
    expect(typesOfTags({ shop: 'convenience' })).toEqual(['grocery', 'minimarket']);
    expect(typesOfTags({ shop: 'clothes', second_hand: 'only' })).toEqual(['thrift']);
    expect(typesOfTags({ shop: 'clothes' })).toEqual([]);
    expect(typesOfTags({ leisure: 'amusement_arcade' })).toEqual(['arcade']);
  });
});

describe('proxyShops', () => {
  it('interroge Overpass à 25 km autour de la position arrondie et regroupe les noms par type', async () => {
    const { fetchFn, result } = run('/shops?lat=47.4712&lon=-0.5518', [
      element({ amenity: 'pub', name: 'Le Welsh' }),
      element({ amenity: 'nightclub', name: 'La Chapelle' }),
      element({ amenity: 'pub', name: 'Le Welsh' }),
      element({ amenity: 'bar', name: 'Un nom beaucoup trop long pour une enseigne' }),
      element({ amenity: 'bar' }),
    ]);
    expect(JSON.parse((await result).body)).toEqual({ ok: true, names: { bar: ['Le Welsh'], nightclub: ['La Chapelle'] } });
    const body = String(fetchFn.mock.calls[0]?.[1]?.body ?? '');
    expect(decodeURIComponent(body)).toContain('around:25000,47.5,-0.6');
  });
  it('garde au plus 30 noms par type', async () => {
    const many = Array.from({ length: 50 }, (_, i) => element({ shop: 'bakery', name: `Boulangerie ${i}` }));
    const names = JSON.parse((await run('/shops?lat=47&lon=-0.5', many).result).body).names.bakery;
    expect(names).toHaveLength(30);
  });
  it('met la réponse en cache par case', async () => {
    const first = run('/shops?lat=46.01&lon=1.01', [element({ amenity: 'pub', name: 'A' })]);
    await first.result;
    const second = run('/shops?lat=46.04&lon=1.04', []);
    expect(JSON.parse((await second.result).body).names).toEqual({ bar: ['A'] });
    expect(second.fetchFn).not.toHaveBeenCalled();
  });
  it('refuse une position invalide et répond 502 si Overpass échoue', async () => {
    expect((await run('/shops?lat=x&lon=2').result).status).toBe(400);
    expect((await run('/shops?lat=45&lon=3', [], 504).result).status).toBe(502);
  });
  it('rejette une réponse 200 avec remark sans la mettre en cache, et envoie User-Agent et délai', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ elements: [element({ amenity: 'pub', name: 'A' })], remark: 'runtime error: timeout' }), { status: 200 }));
    const call = () => proxyShops(new URL('https://relais.test/shops?lat=10.01&lon=10.01'), { fetch: fetchFn, now: () => 0 });
    expect((await call()).status).toBe(502);
    expect((await call()).status).toBe(502);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const init = fetchFn.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>)['user-agent']).toBe('WikimastersTools/1.0 (relais)');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
