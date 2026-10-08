import { describe, expect, it, vi } from 'vitest';
import { detailQuery, searchQuery } from '../../src/core/game/igdb-queries';
import { isAllowedQuery, proxyIgdb, type TokenState } from '../../relay/src/igdb';

describe('isAllowedQuery', () => {
  it('accepte exactement les requêtes que fabrique le client', () => {
    expect(isAllowedQuery(detailQuery({ id: 1000 }))).toBe(true);
    expect(isAllowedQuery(detailQuery({ slug: 'super-metroid' }))).toBe(true);
    expect(isAllowedQuery(searchQuery('Super Metroid'))).toBe(true);
    expect(isAllowedQuery(searchQuery('Pokémon Rouge & Bleu'))).toBe(true);
  });
  it('refuse tout le reste', () => {
    for (const body of [
      'fields *; limit 500;',
      detailQuery({ id: 1 }).replace('limit 1', 'limit 500'),
      detailQuery({ id: 1 }).replace('fields ', 'fields age_ratings,'),
      `${searchQuery('x')} delete;`,
      searchQuery('x').replace('limit 10', 'limit 100'),
      'x'.repeat(1_000),
      '',
    ]) expect(isAllowedQuery(body)).toBe(false);
  });
});

function setup(over: { games?: (init: RequestInit) => Response; tokenStatus?: number } = {}) {
  const state: TokenState = { current: null };
  let now = 0;
  let tokens = 0;
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init ? { init } : {}) });
    if (url.startsWith('https://id.twitch.tv/')) {
      tokens += 1;
      return Response.json({ access_token: `jeton-${tokens}`, expires_in: 5_000_000 }, { status: over.tokenStatus ?? 200 });
    }
    return over.games ? over.games(init ?? {}) : new Response('[{"id":1}]', { status: 200 });
  });
  const run = (body: string) => proxyIgdb(body, { fetch: fetchFn, clientId: 'ID', clientSecret: 'SECRET-IGDB', state, now: () => now });
  return { run, calls, tokens: () => tokens, advance: (ms: number) => (now += ms) };
}

describe('proxyIgdb', () => {
  it('obtient un jeton, appelle IGDB avec les identifiants et transmet la réponse', async () => {
    const { run, calls } = setup();
    expect(await run(detailQuery({ id: 1 }))).toEqual({ status: 200, body: '[{"id":1}]' });
    const games = calls.find((call) => call.url === 'https://api.igdb.com/v4/games');
    const headers = games?.init?.headers as Record<string, string>;
    expect(headers['Client-ID']).toBe('ID');
    expect(headers.Authorization).toBe('Bearer jeton-1');
    expect(games?.init?.body).toBe(detailQuery({ id: 1 }));
  });
  it('garde le jeton jusqu’à une heure avant l’expiration, puis le renouvelle', async () => {
    const { run, tokens, advance } = setup();
    await run(detailQuery({ id: 1 }));
    await run(detailQuery({ id: 2 }));
    expect(tokens()).toBe(1);
    advance(5_000_000 * 1000);
    await run(detailQuery({ id: 3 }));
    expect(tokens()).toBe(2);
  });
  it('renouvelle le jeton une fois sur un 401 d’IGDB', async () => {
    let first = true;
    const { run, tokens } = setup({ games: () => (first ? ((first = false), new Response('{}', { status: 401 })) : new Response('[]', { status: 200 })) });
    expect((await run(detailQuery({ id: 1 }))).status).toBe(200);
    expect(tokens()).toBe(2);
  });
  it('refuse une requête hors liste sans rien appeler', async () => {
    const { run, calls } = setup();
    expect((await run('fields *;')).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it('répond 503 sans identifiants, 502 si Twitch refuse, et ne montre jamais le secret', async () => {
    const state: TokenState = { current: null };
    const none = await proxyIgdb(detailQuery({ id: 1 }), { fetch: vi.fn(), clientId: undefined, clientSecret: undefined, state, now: () => 0 });
    expect(none.status).toBe(503);
    const refused = await setup({ tokenStatus: 401 }).run(detailQuery({ id: 1 }));
    expect(refused.status).toBe(502);
    expect(refused.body).not.toContain('SECRET-IGDB');
  });
  it('répond 502 si Twitch répond 200 avec un corps qui n’est pas du JSON', async () => {
    const state: TokenState = { current: null };
    const fetchFn = vi.fn(async () => new Response('<html>', { status: 200 }));
    const result = await proxyIgdb(detailQuery({ id: 1 }), { fetch: fetchFn, clientId: 'ID', clientSecret: 'S', state, now: () => 0 });
    expect(result.status).toBe(502);
  });
  it('transmet un 429 d’IGDB', async () => {
    const { run } = setup({ games: () => new Response('{}', { status: 429, headers: { 'retry-after': '2' } }) });
    expect(await run(detailQuery({ id: 1 }))).toEqual({ status: 429, body: '{}', retryAfter: '2' });
  });
});
