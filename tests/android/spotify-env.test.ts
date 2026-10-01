import { describe, expect, it, vi } from 'vitest';
import { createAndroidSpotifyEnv, type AndroidWindow } from '../../src/android/spotify-env';

function fakeWindow(): AndroidWindow & { WmtSpotify: { openAuth: ReturnType<typeof vi.fn> } } {
  return { WmtSpotify: { openAuth: vi.fn() }, fetch: vi.fn() } as never;
}

describe('createAndroidSpotifyEnv', () => {
  it("donne l'adresse de retour de l'application", async () => {
    expect(await createAndroidSpotifyEnv(fakeWindow()).redirectUri()).toBe('wikimasterstools://spotify');
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
    vi.useRealTimers();
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
});
