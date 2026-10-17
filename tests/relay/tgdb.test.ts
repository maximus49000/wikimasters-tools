import { describe, expect, it, vi } from 'vitest';
import { proxyTgdb } from '../../relay/src/tgdb';
import { memoryKv } from './memory-kv';

const setup = (status = 200, kv: ReturnType<typeof memoryKv> | null = memoryKv(), body = '{"code":200}') => {
  const fetchFn = vi.fn(async (_url: string) => new Response(body, { status }));
  const call = (path: string, apiKey: string | null = 'SECRET') => proxyTgdb(new URL(`https://relais.test${path}`), { fetch: fetchFn, apiKey: apiKey ?? undefined, kv: kv ?? undefined });
  return { fetchFn, kv, call };
};

describe('proxyTgdb', () => {
  it('ajoute la clé et transmet', async () => {
    const { fetchFn, call } = setup();
    expect(await call('/tgdb/games?name=Hollow Knight')).toEqual({ status: 200, body: '{"code":200}' });
    const upstream = new URL(fetchFn.mock.calls[0]?.[0] ?? '');
    expect(upstream.origin + upstream.pathname).toBe('https://api.thegamesdb.net/v1.1/Games/ByGameName');
    expect(upstream.searchParams.get('apikey')).toBe('SECRET');
    expect(upstream.searchParams.get('name')).toBe('Hollow Knight');
    expect(upstream.searchParams.get('include')).toBe('boxart,platform');
  });
  it('garde la réponse en KV sans expiration et ne rappelle pas l’amont', async () => {
    const { fetchFn, kv, call } = setup();
    const put = vi.spyOn(kv!, 'put');
    await call('/tgdb/games?name=Hollow%20%20Knight');
    const again = await call('/tgdb/games?name=hollow knight');
    expect(again).toEqual({ status: 200, body: '{"code":200}' });
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(kv!.data.has('tgdb:games:hollow knight')).toBe(true);
    expect(put).toHaveBeenCalledWith('tgdb:games:hollow knight', '{"code":200}');
  });
  it('ne garde pas une réponse en échec', async () => {
    const { kv, call } = setup(500);
    expect((await call('/tgdb/games?name=Zelda')).status).toBe(502);
    expect(kv!.data.size).toBe(0);
  });
  it('ne garde pas une réponse amont non 200 (ex. 429)', async () => {
    const { kv, call } = setup(429);
    expect((await call('/tgdb/games?name=Zelda')).status).toBe(429);
    expect(kv!.data.size).toBe(0);
  });
  it('refuse sans appel amont', async () => {
    const { fetchFn, call } = setup();
    expect((await call('/tgdb/autre')).status).toBe(404);
    expect((await call('/tgdb/games?name=')).status).toBe(400);
    expect((await call('/tgdb/games')).status).toBe(400);
    expect((await call(`/tgdb/games?name=${'a'.repeat(121)}`)).status).toBe(400);
    expect((await call('/tgdb/images?ids=abc')).status).toBe(400);
    expect((await call('/tgdb/images?ids=')).status).toBe(400);
    expect((await call(`/tgdb/images?ids=${Array.from({ length: 21 }, (_, i) => i + 1).join(',')}`)).status).toBe(400);
    const none = await call('/tgdb/games?name=x', null);
    expect(none.status).toBe(503);
    expect(none.body).toContain('not-configured');
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('images : ids triés pour la clé KV', async () => {
    const { fetchFn, kv, call } = setup();
    expect((await call('/tgdb/images?ids=55247,42293')).status).toBe(200);
    const upstream = new URL(fetchFn.mock.calls[0]?.[0] ?? '');
    expect(upstream.pathname).toBe('/v1/Games/Images');
    expect(upstream.searchParams.get('games_id')).toBe('55247,42293');
    expect(upstream.searchParams.get('filter[type]')).toBe('screenshot,clearlogo');
    expect(kv!.data.has('tgdb:images:42293,55247')).toBe(true);
  });
  it('fonctionne sans KV', async () => {
    const { fetchFn, call } = setup(200, null);
    expect((await call('/tgdb/games?name=x')).status).toBe(200);
    expect(fetchFn).toHaveBeenCalledOnce();
  });
  it('ne laisse jamais la clé dans la réponse ni dans le KV', async () => {
    const echo = JSON.stringify({ code: 200, data: { games: [] }, pages: { previous: null, current: 'https://api.thegamesdb.net/v1.1/Games/ByGameName?apikey=SECRET&name=x', next: 'https://x/?name=x&apikey=SECRET&page=2' }, other: 'u?apikey=SECRET&z=1' });
    const { kv, call } = setup(200, memoryKv(), echo);
    const result = await call('/tgdb/games?name=x');
    expect(result.status).toBe(200);
    expect(result.body).not.toContain('SECRET');
    expect(JSON.parse(result.body).data).toEqual({ games: [] });
    expect([...kv!.data.values()].join()).not.toContain('SECRET');
  });
  it('n’accepte pas un 200 illisible ou dont le code n’est pas 200', async () => {
    for (const body of ['pas du json', '{"code":403}']) {
      const { kv, call } = setup(200, memoryKv(), body);
      expect((await call('/tgdb/games?name=x')).status).toBe(502);
      expect(kv!.data.size).toBe(0);
    }
  });
});
