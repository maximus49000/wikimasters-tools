import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { SpotifyError } from '../../../src/core/spotify/errors';
import { createSpotifySession, type SpotifyFetch } from '../../../src/core/spotify/spotify-session';

const tokenResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function setup(overrides: { fetch?: ReturnType<typeof vi.fn<SpotifyFetch>>; authorize?: ReturnType<typeof vi.fn<(authUrl: string) => Promise<string>>> } = {}) {
  let time = 1_000_000;
  const fetch =
    overrides.fetch ??
    vi.fn<SpotifyFetch>(async () => tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600 }));
  const authorize =
    overrides.authorize ??
    vi.fn<(authUrl: string) => Promise<string>>(async (authUrl: string) => `wikimasterstools://spotify?code=CODE&state=${new URL(authUrl).searchParams.get('state')}`);
  const session = createSpotifySession({
    store: createMemoryStore(),
    fetch,
    authorize,
    redirectUri: async () => 'wikimasterstools://spotify',
    now: () => time,
  });
  return { session, fetch, authorize, advance: (ms: number) => (time += ms) };
}

describe('createSpotifySession', () => {
  it('lie le compte : autorisation PKCE puis échange du code', async () => {
    const { session, fetch, authorize } = setup();
    expect(await session.isLinked()).toBe(false);
    await session.link();
    expect(await session.isLinked()).toBe(true);

    const authUrl = new URL(authorize.mock.calls[0]![0] as string);
    expect(authUrl.searchParams.get('client_id')).toBe('53483f8dd5374f1889f994488d989283');
    expect(authUrl.searchParams.get('scope')).toBe('user-modify-playback-state user-read-playback-state');

    const [url, init] = fetch.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://accounts.spotify.com/api/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('CODE');
    expect(body.get('redirect_uri')).toBe('wikimasterstools://spotify');
    expect(body.get('code_verifier')).toHaveLength(64);
    expect(await session.accessToken()).toBe('A1');
  });

  it('ne lie rien quand la liaison est annulée', async () => {
    const { session } = setup({ authorize: vi.fn<(authUrl: string) => Promise<string>>(async () => 'wikimasterstools://spotify?error=access_denied') });
    await expect(session.link()).rejects.toMatchObject({ code: 'auth-cancelled' });
    expect(await session.isLinked()).toBe(false);
  });

  it('rafraîchit le jeton expiré, en gardant le jeton de rafraîchissement si Spotify n\'en renvoie pas', async () => {
    const fetch = vi
      .fn<SpotifyFetch>()
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600 }))
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A2', expires_in: 3600 }));
    const { session, advance } = setup({ fetch });
    await session.link();
    advance(3600_000);
    expect(await session.accessToken()).toBe('A2');
    const body = new URLSearchParams((fetch.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('R1');
  });

  it('regroupe les rafraîchissements simultanés en une seule requête', async () => {
    const fetch = vi
      .fn<SpotifyFetch>()
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600 }))
      .mockResolvedValue(tokenResponse({ access_token: 'A2', expires_in: 3600 }));
    const { session, advance } = setup({ fetch });
    await session.link();
    advance(3600_000);
    expect(await Promise.all([session.accessToken(), session.accessToken()])).toEqual(['A2', 'A2']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('force un rafraîchissement même si le jeton est valide', async () => {
    const fetch = vi
      .fn<SpotifyFetch>()
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600 }))
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A2', expires_in: 3600 }));
    const { session } = setup({ fetch });
    await session.link();
    expect(await session.accessToken(true)).toBe('A2');
  });

  it('délie quand le jeton de rafraîchissement est refusé', async () => {
    const fetch = vi
      .fn<SpotifyFetch>()
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600 }))
      .mockResolvedValueOnce(tokenResponse({ error: 'invalid_grant' }, 400));
    const { session, advance } = setup({ fetch });
    await session.link();
    advance(3600_000);
    await expect(session.accessToken()).rejects.toMatchObject({ code: 'not-linked' });
    expect(await session.isLinked()).toBe(false);
  });

  it('lève not-linked sans compte lié, et prévient les abonnés à la liaison et à la déliaison', async () => {
    const { session } = setup();
    await expect(session.accessToken()).rejects.toBeInstanceOf(SpotifyError);
    const listener = vi.fn();
    session.subscribe(listener);
    await session.link();
    await session.unlink();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(await session.isLinked()).toBe(false);
  });

  it("reprend les jetons renouvelés par un autre onglet au lieu de délier (400 après rotation)", async () => {
    const store = createMemoryStore();
    const responses = [
      tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600 }),
      tokenResponse({ error: 'invalid_grant' }, 400),
    ];
    let time = 1_000_000;
    const make = (fetch: SpotifyFetch) =>
      createSpotifySession({ store, fetch, authorize: async (u) => `wikimasterstools://spotify?code=C&state=${new URL(u).searchParams.get('state')}`, redirectUri: async () => 'wikimasterstools://spotify', now: () => time });
    const tabA = make(async () => responses.shift()!);
    await tabA.link();
    time += 3600_000;
    const tabB = make(async () => {
      // Pendant l'appel de l'onglet B, l'onglet A a renouvelé : le store contient un nouveau jeton.
      await store.set('spotify-session', { accessToken: 'A2', refreshToken: 'R2', expiresAt: time + 3600_000 });
      return responses.shift()!;
    });
    expect(await tabB.accessToken()).toBe('A2');
    expect(await tabB.isLinked()).toBe(true);
  });
});
