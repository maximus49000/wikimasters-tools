import { describe, expect, it, vi } from 'vitest';
import { createExtensionEnv, handleSpotifyMessage, type BackgroundDeps, type SpotifyRequest } from '../../../src/core/spotify/transport';

const deps = (over: Partial<BackgroundDeps> = {}): BackgroundDeps => ({
  launchWebAuthFlow: vi.fn(async () => 'https://abc.chromiumapp.org/?code=C&state=S'),
  getRedirectUrl: () => 'https://abc.chromiumapp.org/',
  fetch: vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'Retry-After': '7' } })),
  ...over,
});

describe('handleSpotifyMessage', () => {
  it("ignore ce qui n'est pas pour Spotify", () => {
    expect(handleSpotifyMessage({ type: 'autre' }, deps())).toBeNull();
    expect(handleSpotifyMessage(null, deps())).toBeNull();
  });

  it("rend l'URL de retour de l'extension", async () => {
    expect(await handleSpotifyMessage({ type: 'wmt:spotify', op: 'redirect-uri' }, deps())).toEqual({ ok: true, value: 'https://abc.chromiumapp.org/' });
  });

  it("lance l'autorisation, seulement vers accounts.spotify.com", async () => {
    const d = deps();
    const url = 'https://accounts.spotify.com/authorize?client_id=x';
    expect(await handleSpotifyMessage({ type: 'wmt:spotify', op: 'auth', url }, d)).toEqual({ ok: true, value: 'https://abc.chromiumapp.org/?code=C&state=S' });
    expect(d.launchWebAuthFlow).toHaveBeenCalledWith(url);
    const refused = await handleSpotifyMessage({ type: 'wmt:spotify', op: 'auth', url: 'https://evil.example/authorize' }, d);
    expect(refused).toMatchObject({ ok: false });
    expect(d.launchWebAuthFlow).toHaveBeenCalledTimes(1);
  });

  it('relaie une requête vers api.spotify.com ou accounts.spotify.com, rien d’autre', async () => {
    const d = deps();
    const request: SpotifyRequest = { type: 'wmt:spotify', op: 'fetch', url: 'https://api.spotify.com/v1/me/player', init: { method: 'GET', headers: { Authorization: 'Bearer T' } } };
    expect(await handleSpotifyMessage(request, d)).toEqual({ ok: true, value: { status: 200, retryAfter: '7', body: '{"ok":true}' } });
    expect(await handleSpotifyMessage({ ...request, url: 'https://accounts.spotify.com/api/token' }, d)).toMatchObject({ ok: true });
    expect(await handleSpotifyMessage({ ...request, url: 'https://www.wiki-masters.com/api/x' }, d)).toMatchObject({ ok: false });
    expect(d.fetch).toHaveBeenCalledTimes(2);
  });

  it("rend l'erreur plutôt que de lever", async () => {
    const d = deps({ launchWebAuthFlow: vi.fn(async () => { throw new Error('annulé'); }) });
    expect(await handleSpotifyMessage({ type: 'wmt:spotify', op: 'auth', url: 'https://accounts.spotify.com/authorize?x=1' }, d)).toEqual({ ok: false, error: 'annulé' });
  });
});

describe('createExtensionEnv', () => {
  it('reconstitue une vraie Response, y compris sans corps (204)', async () => {
    const send = vi.fn(async (request: SpotifyRequest) =>
      request.op === 'fetch' ? ({ ok: true, value: { status: 204, retryAfter: null, body: '' } } as const) : ({ ok: true, value: 'https://abc.chromiumapp.org/' } as const),
    );
    const env = createExtensionEnv(send);
    const response = await env.fetch('https://api.spotify.com/v1/me/player', { method: 'GET', headers: { Authorization: 'Bearer T' } });
    expect(response.status).toBe(204);
    expect(await env.redirectUri()).toBe('https://abc.chromiumapp.org/');
  });

  it('transmet Retry-After et fait échouer une réponse en erreur', async () => {
    const env = createExtensionEnv(async (request) =>
      request.op === 'fetch' ? { ok: true, value: { status: 429, retryAfter: '3', body: '' } } : { ok: false, error: 'annulé' },
    );
    expect((await env.fetch('https://api.spotify.com/v1/x')).headers.get('Retry-After')).toBe('3');
    await expect(env.authorize('https://accounts.spotify.com/authorize?x=1')).rejects.toThrow('annulé');
  });
});

describe('handleSpotifyMessage — TMDB', () => {
  it("relaie une requête vers l'API TMDB", async () => {
    const d = deps();
    const reply = await handleSpotifyMessage({ type: 'wmt:spotify', op: 'fetch', url: 'https://api.themoviedb.org/3/movie/1?api_key=x' }, d);
    expect(reply).toMatchObject({ ok: true, value: { status: 200, body: '{"ok":true}' } });
    expect(d.fetch).toHaveBeenCalledOnce();
  });

  it("refuse une autre adresse que l'API TMDB v3", async () => {
    const d = deps();
    const reply = await handleSpotifyMessage({ type: 'wmt:spotify', op: 'fetch', url: 'https://api.themoviedb.org.evil.test/3/x' }, d);
    expect(reply).toEqual({ ok: false, error: 'adresse refusée' });
    expect(d.fetch).not.toHaveBeenCalled();
  });
});

describe('handleSpotifyMessage — Jeux vidéo', () => {
  it.each([
    'https://store.steampowered.com/api/appdetails?appids=1',
    'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=1',
    'https://id.twitch.tv/oauth2/token?client_id=x',
    'https://api.igdb.com/v4/games',
  ])('relaie les jeux vidéo : %s', async (url) => {
    const d = deps();
    const reply = await handleSpotifyMessage({ type: 'wmt:spotify', op: 'fetch', url }, d);
    expect(reply).toMatchObject({ ok: true });
  });

  it("refuse un faux hôte de jeux vidéo", async () => {
    const reply = await handleSpotifyMessage({ type: 'wmt:spotify', op: 'fetch', url: 'https://store.steampowered.com.evil.test/x' }, deps());
    expect(reply).toEqual({ ok: false, error: 'adresse refusée' });
  });
});

describe('handleSpotifyMessage — Tidal', () => {
  it("lance l'autorisation vers login.tidal.com seulement", async () => {
    const d = deps();
    const url = 'https://login.tidal.com/authorize?client_id=x';
    expect(await handleSpotifyMessage({ type: 'wmt:spotify', op: 'auth', url }, d)).toMatchObject({ ok: true });
    expect(d.launchWebAuthFlow).toHaveBeenCalledWith(url);
    expect(await handleSpotifyMessage({ type: 'wmt:spotify', op: 'auth', url: 'https://login.tidal.com.evil.example/authorize?x=1' }, d)).toMatchObject({ ok: false });
  });

  it('relaie le catalogue et le jeton de Tidal, rien d’autre chez lui', async () => {
    const d = deps();
    const base: SpotifyRequest = { type: 'wmt:spotify', op: 'fetch', url: 'https://openapi.tidal.com/v2/searchResults?countryCode=FR' };
    expect(await handleSpotifyMessage(base, d)).toMatchObject({ ok: true });
    expect(await handleSpotifyMessage({ ...base, url: 'https://auth.tidal.com/v1/oauth2/token' }, d)).toMatchObject({ ok: true });
    expect(await handleSpotifyMessage({ ...base, url: 'https://auth.tidal.com/v1/oauth2/revoke' }, d)).toMatchObject({ ok: false });
    expect(await handleSpotifyMessage({ ...base, url: 'https://openapi.tidal.com/v1/x' }, d)).toMatchObject({ ok: false });
    expect(d.fetch).toHaveBeenCalledTimes(2);
  });
});
