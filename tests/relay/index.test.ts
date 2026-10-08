import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../../relay/src/index';
import { memoryKv } from './memory-kv';

const get = (path: string, env: Parameters<typeof worker.fetch>[1]) => worker.fetch(new Request(`https://relais.test${path}`), env);

describe('/status', () => {
  it('indique la présence des réglages sans jamais en montrer la valeur', async () => {
    const response = await get('/status', { YOUTUBE_API_KEY: 'SECRET-VALUE', DOC_CACHE: memoryKv() });
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ ok: true, config: { youtubeKey: true, kv: true, debugToken: false } });
    expect(text).not.toContain('SECRET-VALUE');
  });
  it('signale une clé absente', async () => {
    const body = await (await get('/status', { DOC_CACHE: memoryKv() })).json();
    expect(body).toMatchObject({ config: { youtubeKey: false, kv: true } });
  });
  it('sans KV, répond quand même avec une liste vide', async () => {
    expect(await (await get('/status', {})).json()).toMatchObject({ ok: true, config: { kv: false }, channels: [] });
  });
});

describe('/search sans réglages', () => {
  it('répond 503 quand la clé manque', async () => {
    const response = await get('/search?qid=Q1&kind=event&names=Verdun', { DOC_CACHE: memoryKv() });
    expect(response.status).toBe(503);
  });
});

const env = { TMDB_API_KEY: 'SECRET-TMDB', IGDB_CLIENT_ID: 'ID', IGDB_CLIENT_SECRET: 'SECRET-IGDB', GITHUB_ISSUES_TOKEN: 'SECRET-GH', GOOGLE_BOOKS_API_KEY: 'SECRET-BOOKS' };
let ipCounter = 0;
// Chaque test prend sa propre adresse : le limiteur du Worker garde son état d'un test à l'autre.
const call = (path: string, init: RequestInit = {}, withEnv: Parameters<typeof worker.fetch>[1] = env) => {
  ipCounter += 1;
  return worker.fetch(new Request(`https://relais.test${path}`, { ...init, headers: { 'cf-connecting-ip': `10.0.0.${ipCounter}`, ...(init.headers as Record<string, string>) } }), withEnv);
};
afterEach(() => vi.unstubAllGlobals());

describe('routes de transmission', () => {
  it('/tmdb transmet avec la clé et ajoute les en-têtes CORS', async () => {
    const upstream = vi.fn(async (_url: string) => new Response('{"id":603}', { status: 200 }));
    vi.stubGlobal('fetch', upstream);
    const response = await call('/tmdb/movie/603?language=fr-FR');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 603 });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(String(upstream.mock.calls[0]?.[0])).toContain('api_key=SECRET-TMDB');
  });
  it('/books transmet avec la clé', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"items":[]}', { status: 200 })));
    expect((await call('/books/volumes?q=Dune&country=FR&maxResults=10')).status).toBe(200);
  });
  it('/igdb accepte un POST texte valide et refuse le reste', async () => {
    const { detailQuery } = await import('../../src/core/game/igdb-queries');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.startsWith('https://id.twitch.tv/') ? Response.json({ access_token: 't', expires_in: 5_000_000 }) : new Response('[]', { status: 200 }))));
    expect((await call('/igdb/games', { method: 'POST', body: detailQuery({ id: 1 }), headers: { 'content-type': 'text/plain' } })).status).toBe(200);
    expect((await call('/igdb/games', { method: 'POST', body: 'fields *;' })).status).toBe(400);
    expect((await call('/igdb/games')).status).toBe(404);
  });
  it('/issues crée une issue depuis un POST', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ number: 9, html_url: 'https://github.com/o/r/issues/9' }), { status: 201 })));
    const response = await call('/issues', { method: 'POST', body: JSON.stringify({ title: 'Bug', body: 'x', labels: ['Nouveau'] }) });
    expect(await response.json()).toEqual({ ok: true, number: 9, url: 'https://github.com/o/r/issues/9' });
  });
  it('une exception en route donne un 502 neutre qui garde les en-têtes CORS', async () => {
    const broken = { ok: true, status: 200, headers: new Headers(), text: () => Promise.reject(new Error('coupé')) };
    vi.stubGlobal('fetch', vi.fn(async () => broken));
    const rejected = await call('/tmdb/movie/603');
    expect(rejected.status).toBe(502);
    expect(rejected.headers.get('access-control-allow-origin')).toBe('*');
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('synchrone'); }));
    const thrown = await call('/oembed?id=abcdefghijk');
    expect(thrown.status).toBe(502);
    expect(thrown.headers.get('access-control-allow-origin')).toBe('*');
    expect(await thrown.json()).toEqual({ ok: false, reason: 'upstream' });
  });
  it('un corps sans content-length plus gros que la limite est refusé sans tout lire', async () => {
    const upstream = vi.fn(async () => new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', upstream);
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new TextEncoder().encode('a'.repeat(4_000)));
        if (pulled >= 100) controller.close();
      },
    });
    const response = await call('/issues', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
    expect(pulled).toBeLessThan(100);
  });
  it('répond 503 quand le secret manque', async () => {
    expect((await call('/tmdb/movie/1', {}, {})).status).toBe(503);
  });
  it('limite le débit par adresse et annonce le délai', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const same = { headers: { 'cf-connecting-ip': '192.0.2.99' } };
    const send = () => worker.fetch(new Request('https://relais.test/issues', { method: 'POST', body: JSON.stringify({ title: 'a', body: 'b', labels: ['Nouveau'] }), ...same }), env);
    for (let i = 0; i < 5; i += 1) expect((await send()).status).not.toBe(429);
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await blocked.json()).toEqual({ ok: false, reason: 'rate-limited' });
  });
  it('répond au préambule CORS pour POST avec content-type', async () => {
    const response = await call('/issues', { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    expect(response.headers.get('access-control-allow-headers')).toContain('content-type');
    expect(response.headers.get('access-control-expose-headers')).toContain('retry-after');
  });
  it('/status montre la présence des secrets sans jamais leur valeur', async () => {
    const response = await call('/status');
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ config: { tmdbKey: true, igdb: true, issuesToken: true, booksKey: true } });
    for (const secret of ['SECRET-TMDB', 'SECRET-IGDB', 'SECRET-GH', 'SECRET-BOOKS']) expect(text).not.toContain(secret);
  });
});
