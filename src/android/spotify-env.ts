import { ANDROID_REDIRECT_URI } from '../core/spotify/config';
import type { SpotifyEnv } from '../core/spotify/transport';

// Ce que MainActivity.java expose à la page : `WmtSpotify.openAuth(url)` ouvre le navigateur du téléphone ;
// au retour sur `wikimasterstools://spotify?…`, l'activité appelle `window.__wmtSpotifyRedirect(url)`.
export type AndroidWindow = {
  WmtSpotify?: { openAuth(url: string): void };
  __wmtSpotifyRedirect?: (url: string) => void;
  fetch: typeof fetch;
};

// L'utilisateur a le temps de se connecter chez Spotify ; au-delà, on abandonne.
const AUTH_TIMEOUT_MS = 5 * 60_000;

export function createAndroidSpotifyEnv(win: AndroidWindow, timeoutMs: number = AUTH_TIMEOUT_MS): SpotifyEnv {
  return {
    fetch: (url, init) => win.fetch(url, init),
    redirectUri: async () => ANDROID_REDIRECT_URI,
    authorize: (authUrl) =>
      new Promise<string>((resolve, reject) => {
        const bridge = win.WmtSpotify;
        if (!bridge) {
          reject(new Error('pont Android absent'));
          return;
        }
        const timer = setTimeout(() => {
          delete win.__wmtSpotifyRedirect;
          reject(new Error('liaison annulée'));
        }, timeoutMs);
        win.__wmtSpotifyRedirect = (url) => {
          clearTimeout(timer);
          delete win.__wmtSpotifyRedirect;
          resolve(url);
        };
        bridge.openAuth(authUrl);
      }),
  };
}
