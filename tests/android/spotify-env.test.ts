import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAndroidSpotifyEnv, type AndroidWindow } from '../../src/android/spotify-env';

function fakeWindow(): AndroidWindow & { WmtSpotify: { openAuth: ReturnType<typeof vi.fn> } } {
  return { WmtSpotify: { openAuth: vi.fn() }, fetch: vi.fn() } as never;
}

describe('createAndroidSpotifyEnv', () => {
  afterEach(() => vi.useRealTimers());

  it('un second authorize rejette la tentative précédente ; la seconde se résout', async () => {
    const win = fakeWindow();
    const env = createAndroidSpotifyEnv(win);
    const first = env.authorize('https://accounts.spotify.com/authorize?x=1');
    const firstRejected = expect(first).rejects.toThrow('liaison remplacée');
    const second = env.authorize('https://accounts.spotify.com/authorize?x=2');
    await firstRejected;
    win.__wmtSpotifyRedirect?.('wikimasterstools://spotify?code=C&state=S');
    expect(await second).toBe('wikimasterstools://spotify?code=C&state=S');
    expect(win.__wmtSpotifyRedirect).toBeUndefined();
  });

  it("nettoie quand le pont lève à l'ouverture", async () => {
    const win = fakeWindow();
    win.WmtSpotify.openAuth.mockImplementation(() => {
      throw new Error('boum');
    });
    await expect(createAndroidSpotifyEnv(win).authorize('https://accounts.spotify.com/authorize?x=1')).rejects.toThrow('boum');
    expect(win.__wmtSpotifyRedirect).toBeUndefined();
  });

  it("donne l'adresse de retour de l'application", async () => {
    expect(await createAndroidSpotifyEnv(fakeWindow()).redirectUri()).toBe('wikimasterstools://spotify');
  });

  it("prend le schéma de retour du canal installé (pré-production)", async () => {
    const win = { ...fakeWindow(), WmtSpotify: { openAuth: vi.fn(), scheme: () => 'wikimasterstools-preprod' } };
    const env = createAndroidSpotifyEnv(win);
    expect(await env.redirectUri()).toBe('wikimasterstools-preprod://spotify');
    expect(await env.redirectUriFor?.('tidal')).toBe('wikimasterstools-preprod://tidal');
  });

  it("ouvre l'autorisation dans le navigateur et attend l'URL de retour", async () => {
    const win = fakeWindow();
    const env = createAndroidSpotifyEnv(win);
    const pending = env.authorize('https://accounts.spotify.com/authorize?x=1');
    expect(win.WmtSpotify.openAuth).toHaveBeenCalledWith('https://accounts.spotify.com/authorize?x=1');
    win.__wmtSpotifyRedirect?.('wikimasterstools://spotify?code=C&state=S');
    expect(await pending).toBe('wikimasterstools://spotify?code=C&state=S');
    expect(win.__wmtSpotifyRedirect).toBeUndefined();
  });

  it("abandonne après le délai quand l'utilisateur ne revient pas", async () => {
    vi.useFakeTimers();
    const env = createAndroidSpotifyEnv(fakeWindow(), 1000);
    const pending = env.authorize('https://accounts.spotify.com/authorize?x=1');
    const assertion = expect(pending).rejects.toThrow('liaison annulée');
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });

  it("échoue clairement sans le pont Java (navigateur ordinaire)", async () => {
    const env = createAndroidSpotifyEnv({ fetch: vi.fn() } as never);
    await expect(env.authorize('https://accounts.spotify.com/authorize?x=1')).rejects.toThrow('pont Android absent');
  });

  it('relaie fetch tel quel', async () => {
    const win = fakeWindow();
    (win.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{}'));
    await createAndroidSpotifyEnv(win).fetch('https://api.spotify.com/v1/x', { method: 'GET' });
    expect(win.fetch).toHaveBeenCalledWith('https://api.spotify.com/v1/x', { method: 'GET' });
  });

  it("fournit l'adresse de retour de Tidal, distincte de celle de Spotify", async () => {
    const env = createAndroidSpotifyEnv(fakeWindow());
    expect(await env.redirectUri()).toBe('wikimasterstools://spotify');
    expect(await env.redirectUriFor?.('tidal')).toBe('wikimasterstools://tidal');
  });
});
