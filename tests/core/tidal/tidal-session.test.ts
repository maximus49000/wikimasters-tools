import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { TidalError } from '../../../src/core/tidal/errors';
import { createTidalSession, type TidalFetch } from '../../../src/core/tidal/tidal-session';

const tokenResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const REDIRECT = 'wikimasterstools://tidal';

function setup(overrides: { fetch?: ReturnType<typeof vi.fn<TidalFetch>>; authorize?: ReturnType<typeof vi.fn<(authUrl: string) => Promise<string>>> } = {}) {
  let time = 1_000_000;
  const fetch = overrides.fetch ?? vi.fn<TidalFetch>(async () => tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 86_400 }));
  const authorize = overrides.authorize ?? vi.fn<(authUrl: string) => Promise<string>>(async (authUrl: string) => `${REDIRECT}?code=CODE&state=${new URL(authUrl).searchParams.get('state')}`);
  const session = createTidalSession({ store: createMemoryStore(), fetch, authorize, redirectUri: async () => REDIRECT, now: () => time });
  return { session, fetch, authorize, advance: (ms: number) => (time += ms) };
}

describe('createTidalSession', () => {
  it('lie le compte : autorisation PKCE sans secret, puis échange du code', async () => {
    const { session, fetch, authorize } = setup();
    expect(await session.isLinked()).toBe(false);
    await session.link();
    expect(await session.isLinked()).toBe(true);

    const authUrl = new URL(authorize.mock.calls[0]![0] as string);
    expect(`${authUrl.origin}${authUrl.pathname}`).toBe('https://login.tidal.com/authorize');
    expect(authUrl.searchParams.get('client_id')).toBe('Js7eZgbN3qENNo9e');
    expect(authUrl.searchParams.get('scope')).toBe('search.read');
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authUrl.searchParams.get('redirect_uri')).toBe(REDIRECT);

    const [url, init] = fetch.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://auth.tidal.com/v1/oauth2/token');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('CODE');
    expect(body.get('client_id')).toBe('Js7eZgbN3qENNo9e');
    expect(body.get('code_verifier')).toHaveLength(64);
    expect(body.has('client_secret')).toBe(false);
    expect(await session.accessToken()).toBe('A1');
  });

  it("ne lie rien quand la liaison est annulée, ou que l'état ne correspond pas", async () => {
    const denied = setup({ authorize: vi.fn<(authUrl: string) => Promise<string>>(async () => `${REDIRECT}?error=access_denied`) });
    await expect(denied.session.link()).rejects.toMatchObject({ code: 'auth-cancelled' });
    const forged = setup({ authorize: vi.fn<(authUrl: string) => Promise<string>>(async () => `${REDIRECT}?code=C&state=autre`) });
    await expect(forged.session.link()).rejects.toMatchObject({ code: 'auth-cancelled' });
    expect(await forged.session.isLinked()).toBe(false);
  });

  it("rafraîchit le jeton expiré, en gardant le jeton de rafraîchissement quand Tidal n'en renvoie pas", async () => {
    const fetch = vi
      .fn<TidalFetch>()
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 86_400 }))
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A2', expires_in: 86_400 }));
    const { session, advance } = setup({ fetch });
    await session.link();
    advance(86_400_000);
    expect(await session.accessToken()).toBe('A2');
    const body = new URLSearchParams((fetch.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('R1');
    expect(body.get('client_id')).toBe('Js7eZgbN3qENNo9e');
  });

  it('regroupe les rafraîchissements simultanés, et force un rafraîchissement sur demande', async () => {
    const fetch = vi
      .fn<TidalFetch>()
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 86_400 }))
      .mockImplementation(async () => tokenResponse({ access_token: 'A2', expires_in: 86_400 }));
    const { session, advance } = setup({ fetch });
    await session.link();
    advance(86_400_000);
    expect(await Promise.all([session.accessToken(), session.accessToken()])).toEqual(['A2', 'A2']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await session.accessToken(true)).toBe('A2');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('délie quand le jeton de rafraîchissement est refusé', async () => {
    const fetch = vi
      .fn<TidalFetch>()
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 86_400 }))
      .mockResolvedValueOnce(tokenResponse({ error: 'invalid_grant' }, 400));
    const { session, advance } = setup({ fetch });
    await session.link();
    advance(86_400_000);
    await expect(session.accessToken()).rejects.toMatchObject({ code: 'not-linked' });
    expect(await session.isLinked()).toBe(false);
  });

  it('lève not-linked sans compte, et prévient les abonnés à la liaison et à la déliaison', async () => {
    const { session } = setup();
    await expect(session.accessToken()).rejects.toBeInstanceOf(TidalError);
    const listener = vi.fn();
    session.subscribe(listener);
    await session.link();
    await session.unlink();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(await session.isLinked()).toBe(false);
  });
});
