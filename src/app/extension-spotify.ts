import { browser } from 'wxt/browser';
import { createExtensionEnv, type SpotifyEnv, type SpotifyRequest, type SpotifyReply } from '../core/spotify/transport';

// Spotify depuis l'extension : tout passe par le service worker (voir entrypoints/background.ts).
// Le lien `spotify:` démarre l'application de bureau si elle est installée (le navigateur peut demander une confirmation).
function openDesktopApp(): void {
  const link = document.createElement('a');
  link.href = 'spotify:';
  link.rel = 'noopener';
  link.click();
}

export const createChromeSpotifyEnv = (): SpotifyEnv =>
  createExtensionEnv((request: SpotifyRequest) => browser.runtime.sendMessage(request) as Promise<SpotifyReply>, openDesktopApp);
