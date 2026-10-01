import { describe, expect, it, vi } from 'vitest';
import { createSpotifyApi } from '../../../src/core/spotify/spotify-api';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const empty = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers });

function setup(responses: Response[]) {
  const fetch = vi.fn();
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  const session = { accessToken: vi.fn(async () => 'TOKEN') };
  return { api: createSpotifyApi({ session, fetch }), fetch, session };
}

const call = (fetch: ReturnType<typeof vi.fn>, index = 0) => {
  const [url, init] = fetch.mock.calls[index]! as [string, RequestInit];
  return { url: new URL(url), init, headers: init.headers as Record<string, string> };
};

describe('createSpotifyApi', () => {
  it('cherche des titres et en tire les artistes', async () => {
    const { api, fetch } = setup([
      json({ tracks: { items: [{ uri: 'spotify:track:1', name: 'Yesterday', artists: [{ id: 'a1', name: 'The Beatles' }] }] } }),
    ]);
    expect(await api.searchTracks('track:"Yesterday"', 1)).toEqual([
      { uri: 'spotify:track:1', title: 'Yesterday', artist: 'The Beatles', artistIds: ['a1'], artists: ['The Beatles'] },
    ]);
    const { url, headers } = call(fetch);
    expect(url.pathname).toBe('/v1/search');
    expect(url.searchParams.get('type')).toBe('track');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.get('q')).toBe('track:"Yesterday"');
    expect(headers.Authorization).toBe('Bearer TOKEN');
  });

  it("donne la pochette d'un album, ou celle du disque d'un morceau", async () => {
    const { api, fetch } = setup([
      json({ albums: { items: [{ images: [{ url: 'https://i.scdn.co/big' }, { url: 'https://i.scdn.co/small' }] }] } }),
      json({ tracks: { items: [{ album: { images: [{ url: 'https://i.scdn.co/single' }] } }] } }),
      json({ albums: { items: [] } }),
    ]);
    expect(await api.findCover('album', 'Abbey Road', 'The Beatles')).toBe('https://i.scdn.co/big');
    expect(call(fetch, 0).url.searchParams.get('type')).toBe('album');
    expect(call(fetch, 0).url.searchParams.get('q')).toBe('album:"Abbey Road" artist:"The Beatles"');
    expect(await api.findCover('track', 'Yesterday')).toBe('https://i.scdn.co/single');
    expect(call(fetch, 1).url.searchParams.get('q')).toBe('track:"Yesterday"');
    expect(await api.findCover('album', 'Inconnu')).toBeNull();
  });

  it("donne la photo d'un artiste", async () => {
    const { api, fetch } = setup([json({ artists: { items: [{ images: [{ url: 'https://i.scdn.co/a' }] }] } }), json({ artists: { items: [] } })]);
    expect(await api.findArtistImage('The Beatles')).toBe('https://i.scdn.co/a');
    expect(call(fetch, 0).url.searchParams.get('type')).toBe('artist');
    expect(await api.findArtistImage('Inconnu')).toBeNull();
  });

  it('limite la recherche à 10 résultats, maximum de Spotify', async () => {
    const { api, fetch } = setup([json({ tracks: { items: [] } })]);
    await api.searchTracks('x', 50);
    expect(call(fetch).url.searchParams.get('limit')).toBe('10');
  });

  it("trouve l'identifiant d'un album, ou rien", async () => {
    const { api, fetch } = setup([json({ albums: { items: [{ id: 'alb1' }] } }), json({ albums: { items: [] } })]);
    expect(await api.searchAlbum('Abbey Road', 'The Beatles')).toBe('alb1');
    expect(call(fetch).url.searchParams.get('q')).toBe('album:"Abbey Road" artist:"The Beatles"');
    expect(await api.searchAlbum('Inconnu')).toBeNull();
  });

  it("liste les pistes d'un album", async () => {
    const { api, fetch } = setup([
      json({ items: [{ uri: 'spotify:track:9', name: 'Come Together', artists: [{ name: 'The Beatles' }] }] }),
    ]);
    expect(await api.albumTracks('alb1')).toEqual([{ uri: 'spotify:track:9', title: 'Come Together', artist: 'The Beatles' }]);
    expect(call(fetch).url.pathname).toBe('/v1/albums/alb1/tracks');
  });

  it("lance un morceau, un titre d'album dans son contexte, ou reprend la lecture", async () => {
    const { api, fetch } = setup([empty(204), empty(204), empty(204)]);
    await api.play({ uris: ['spotify:track:1'] });
    await api.play({ contextUri: 'spotify:album:alb1', offsetUri: 'spotify:track:9' });
    await api.play(null);
    expect(call(fetch, 0).init.method).toBe('PUT');
    expect(call(fetch, 0).url.pathname).toBe('/v1/me/player/play');
    expect(JSON.parse(call(fetch, 0).init.body as string)).toEqual({ uris: ['spotify:track:1'] });
    expect(JSON.parse(call(fetch, 1).init.body as string)).toEqual({
      context_uri: 'spotify:album:alb1',
      offset: { uri: 'spotify:track:9' },
    });
    expect(call(fetch, 2).init.body).toBeUndefined();
  });

  it("cible l'appareil visible quand aucun n'est actif (404), sans rien changer sinon", async () => {
    const { api, fetch } = setup([
      empty(404),
      json({ devices: [{ id: 'phone', type: 'Smartphone' }, { id: 'pc', type: 'Computer' }] }),
      empty(204),
    ]);
    await api.play({ uris: ['spotify:track:1'] });
    expect(call(fetch, 1).url.pathname).toBe('/v1/me/player/devices');
    expect(call(fetch, 2).url.pathname).toBe('/v1/me/player/play');
    expect(call(fetch, 2).url.searchParams.get('device_id')).toBe('pc');
    expect(JSON.parse(call(fetch, 2).init.body as string)).toEqual({ uris: ['spotify:track:1'] });
  });

  it("garde l'erreur « aucun appareil » quand Spotify n'en voit aucun", async () => {
    const { api, fetch } = setup([empty(404), json({ devices: [] })]);
    await expect(api.play(null)).rejects.toMatchObject({ code: 'no-device' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('met en pause', async () => {
    const { api, fetch } = setup([empty(204)]);
    await api.pause();
    expect(call(fetch).url.pathname).toBe('/v1/me/player/pause');
  });

  it("lit l'état du lecteur, ou null quand rien ne joue (204)", async () => {
    const { api } = setup([
      json({
        is_playing: true,
        item: { uri: 'spotify:track:S', name: 'Something', artists: [{ name: 'The Beatles' }], album: { images: [{ url: 'https://i/1.jpg' }] } },
      }),
      empty(204),
    ]);
    expect(await api.playerState()).toEqual({ playing: true, uri: 'spotify:track:S', title: 'Something', artist: 'The Beatles', imageUrl: 'https://i/1.jpg' });
    expect(await api.playerState()).toBeNull();
  });

  it('traduit les erreurs : 404 sans appareil, 403 sans Premium, 429 avec attente', async () => {
    const { api } = setup([empty(404), empty(403), empty(429, { 'Retry-After': '3' }), empty(500)]);
    await expect(api.pause()).rejects.toMatchObject({ code: 'no-device' });
    await expect(api.pause()).rejects.toMatchObject({ code: 'not-premium' });
    await expect(api.pause()).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 3000 });
    await expect(api.pause()).rejects.toMatchObject({ code: 'http' });
  });

  it('retente une fois avec un jeton neuf après un 401', async () => {
    const { api, fetch, session } = setup([empty(401), empty(204)]);
    await api.pause();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(session.accessToken).toHaveBeenNthCalledWith(1, false);
    expect(session.accessToken).toHaveBeenNthCalledWith(2, true);
  });

  it('abandonne après un second 401', async () => {
    const { api } = setup([empty(401), empty(401)]);
    await expect(api.pause()).rejects.toMatchObject({ code: 'not-linked' });
  });

  it('rejette une réponse de recherche inattendue', async () => {
    const { api } = setup([json({ rien: true })]);
    await expect(api.searchTracks('x')).rejects.toMatchObject({ code: 'http' });
  });
});
