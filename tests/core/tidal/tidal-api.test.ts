import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createTidalApi } from '../../../src/core/tidal/tidal-api';
import albumItems from './fixtures/album-items.json';
import artistTracks from './fixtures/artist-tracks.json';
import searchAlbums from './fixtures/search-albums.json';
import searchArtists from './fixtures/search-artists.json';
import searchTracks from './fixtures/search-tracks.json';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/vnd.api+json', ...headers } });

function setup(respond: (url: string) => Response | Promise<Response>) {
  let time = 1_000;
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => respond(url));
  const session = { accessToken: vi.fn(async (_force?: boolean) => 'T') };
  const api = createTidalApi({
    session,
    fetch,
    store: createMemoryStore(),
    countryCode: 'FR',
    now: () => time,
    gaps: { page: 0 },
    sleep: async () => undefined,
  });
  return { api, fetch, session, advance: (ms: number) => (time += ms) };
}

describe('createTidalApi, recherche', () => {
  it("rend les titres dans l'ordre de pertinence, avec leurs artistes et la version", async () => {
    const { api, fetch } = setup(() => json(searchTracks));
    const found = await api.searchTracks('Ghost Town The Specials');
    expect(found[0]).toEqual({ id: '233194655', title: 'Ghost Town', artists: ['The Specials'] });
    expect(found[1]).toMatchObject({ id: '233165577', title: 'Ghost Town (Extended Version)' });
    expect(found.length).toBeLessThanOrEqual(6);

    const [url, init] = fetch.mock.calls[0]!;
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe('https://openapi.tidal.com/v2/searchResults');
    expect(parsed.searchParams.get('filter[query]')).toBe('Ghost Town The Specials');
    expect(parsed.searchParams.get('include')).toBe('tracks,tracks.artists');
    expect(parsed.searchParams.get('countryCode')).toBe('FR');
    expect(init?.headers).toEqual({ accept: 'application/vnd.api+json', Authorization: 'Bearer T' });
  });

  it("suit l'ordre de la relation et non celui de `included`", async () => {
    const reversed = { ...searchTracks, included: [...searchTracks.included].reverse() };
    const { api } = setup(() => json(reversed));
    expect((await api.searchTracks('x'))[0]!.id).toBe('233194655');
  });

  it('respecte la limite demandée', async () => {
    const { api } = setup(() => json(searchTracks));
    expect(await api.searchTracks('x', 2)).toHaveLength(2);
  });

  it('rend les albums avec leurs artistes, et les artistes', async () => {
    expect((await setup(() => json(searchAlbums)).api.searchAlbums('Abbey Road The Beatles'))[0]).toEqual({
      id: '55130630',
      title: 'Abbey Road (Remastered)',
      artists: ['The Beatles'],
    });
    expect((await setup(() => json(searchArtists)).api.searchArtists('The Beatles'))[0]).toEqual({ id: '3634161', name: 'The Beatles' });
  });
});

describe('createTidalApi, pistes', () => {
  it("rend les pistes d'un album dans l'ordre de l'album", async () => {
    const { api, fetch } = setup(() => json(albumItems));
    const items = await api.albumTracks('11564033');
    expect(items[0]).toEqual({ id: '11564034', title: 'Love Me Do' });
    expect(items).toHaveLength(5);
    const parsed = new URL(fetch.mock.calls[0]![0]);
    expect(parsed.pathname).toBe('/v2/albums/11564033/relationships/items');
    expect(parsed.searchParams.get('include')).toBe('items');
  });

  it("suit les pages d'un grand album, au plus 5", async () => {
    const page = (cursor?: string) => ({ ...albumItems, links: cursor ? { meta: { nextCursor: cursor } } : {} });
    const { api, fetch } = setup((url) => json(new URL(url).searchParams.get('page[cursor]') === 'C2' ? page() : page('C2')));
    expect(await api.albumTracks('1')).toHaveLength(10);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(fetch.mock.calls[1]![0]).searchParams.get('page[cursor]')).toBe('C2');

    const endless = setup(() => json(page('C2')));
    await endless.api.albumTracks('1');
    expect(endless.fetch).toHaveBeenCalledTimes(5);
  });

  it("rend les titres d'un artiste, limités", async () => {
    const { api, fetch } = setup(() => json(artistTracks));
    const items = await api.artistTracks('116', 3);
    expect(items[0]).toEqual({ id: '37667986', title: 'Mrs. Robinson (From "The Graduate" Soundtrack)' });
    expect(items).toHaveLength(3);
    const parsed = new URL(fetch.mock.calls[0]![0]);
    expect(parsed.pathname).toBe('/v2/artists/116/relationships/tracks');
    expect(parsed.searchParams.get('collapseBy')).toBe('FINGERPRINT');
    expect(parsed.searchParams.get('include')).toBe('tracks');
  });
});

describe('createTidalApi, erreurs', () => {
  it('retente une fois avec un jeton neuf après un 401, puis rend not-linked', async () => {
    const answers = [json({}, 401), json(searchArtists)];
    const { api, session } = setup(() => answers.shift()!);
    await api.searchArtists('x');
    expect(session.accessToken.mock.calls.map((call) => call[0])).toEqual([false, true]);

    const refused = setup(() => json({}, 401));
    await expect(refused.api.searchArtists('x')).rejects.toMatchObject({ code: 'not-linked' });
  });

  it('un 429 met les appels en pause (Retry-After lu), sans rien envoyer pendant la pause', async () => {
    const { api, fetch, advance } = setup(() => json({}, 429, { 'Retry-After': '30' }));
    await expect(api.searchArtists('x')).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 30_000 });
    await expect(api.searchArtists('x')).rejects.toMatchObject({ code: 'rate-limited' });
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(30_001);
    await expect(api.searchArtists('x')).rejects.toMatchObject({ code: 'rate-limited' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("sans Retry-After lisible, l'attente démarre à 5 s", async () => {
    const { api } = setup(() => json({}, 429));
    await expect(api.searchArtists('x')).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 5_000 });
  });

  it('une réponse illisible ou une erreur serveur donne une erreur http', async () => {
    await expect(setup(() => json({ nimporte: 'quoi' })).api.searchArtists('x')).rejects.toMatchObject({ code: 'http' });
    await expect(setup(() => json({}, 500)).api.searchArtists('x')).rejects.toMatchObject({ code: 'http' });
  });
});
