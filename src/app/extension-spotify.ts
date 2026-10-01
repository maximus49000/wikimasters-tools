import { browser } from 'wxt/browser';
import { createExtensionEnv, type SpotifyEnv, type SpotifyRequest, type SpotifyReply } from '../core/spotify/transport';

// Spotify depuis l'extension : tout passe par le service worker (voir entrypoints/background.ts).
export const createChromeSpotifyEnv = (): SpotifyEnv =>
  createExtensionEnv((request: SpotifyRequest) => browser.runtime.sendMessage(request) as Promise<SpotifyReply>);
