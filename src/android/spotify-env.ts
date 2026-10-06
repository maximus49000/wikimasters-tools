import { ANDROID_REDIRECT_URI } from '../core/spotify/config';
import { TIDAL_ANDROID_REDIRECT_URI } from '../core/tidal/config';
import type { SpotifyEnv } from '../core/spotify/transport';

// Ce que MainActivity.java expose à la page : `WmtSpotify.openAuth(url)` ouvre le navigateur du téléphone ;
// au retour sur `wikimasterstools://spotify?…`, l'activité appelle `window.__wmtSpotifyRedirect(url)`.
export type AndroidWindow = {
  // `scheme()` : schéma de retour du canal installé (production : wikimasterstools, pré-production : wikimasterstools-preprod).
  WmtSpotify?: { openAuth(url: string): void; openApp?(): void; scheme?(): string };
  __wmtSpotifyRedirect?: (url: string) => void;
  fetch: typeof fetch;
};

// L'utilisateur a le temps de se connecter chez Spotify ; au-delà, on abandonne.
const AUTH_TIMEOUT_MS = 5 * 60_000;

// Remplace le schéma par celui du canal (l'APK de pré-production s'installe à côté de celui de production).
function withScheme(uri: string, win: AndroidWindow): string {
  const scheme = win.WmtSpotify?.scheme?.();
  return scheme ? uri.replace(/^[^:]+:/, `${scheme}:`) : uri;
}

export function createAndroidSpotifyEnv(win: AndroidWindow, timeoutMs: number = AUTH_TIMEOUT_MS): SpotifyEnv {
  // Tentative en cours : un second `authorize` la remplace et la rejette.
  let abandon: (() => void) | null = null;
  return {
    fetch: (url, init) => win.fetch(url, init),
    deviceTypes: ['Smartphone', 'Tablet'],
    redirectUri: async () => withScheme(ANDROID_REDIRECT_URI, win),
    redirectUriFor: async () => withScheme(TIDAL_ANDROID_REDIRECT_URI, win),
    launchApp: () => win.WmtSpotify?.openApp?.(),
    authorize: (authUrl) => {
      abandon?.();
      return new Promise<string>((resolve, reject) => {
        const bridge = win.WmtSpotify;
        if (!bridge) {
          reject(new Error('pont Android absent'));
          return;
        }
        // Libère la tentative ; le rappel global n'est retiré que s'il est encore le nôtre.
        const cleanup = () => {
          clearTimeout(timer);
          if (win.__wmtSpotifyRedirect === callback) delete win.__wmtSpotifyRedirect;
          if (abandon === replaced) abandon = null;
        };
        const replaced = () => {
          cleanup();
          reject(new Error('liaison remplacée'));
        };
        const callback = (url: string) => {
          cleanup();
          resolve(url);
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('liaison annulée'));
        }, timeoutMs);
        abandon = replaced;
        win.__wmtSpotifyRedirect = callback;
        try {
          bridge.openAuth(authUrl);
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    },
  };
}
