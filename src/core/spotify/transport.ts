import type { SpotifyFetch } from './spotify-session';
import { ANOMALY_API_PREFIX } from '../anomalies/config';

// Ce dont la surcouche a besoin pour parler à Spotify ; l'extension et l'APK le fournissent chacun à leur façon.
export type SpotifyEnv = {
  fetch: SpotifyFetch;
  authorize: (authUrl: string) => Promise<string>;
  redirectUri: () => Promise<string>;
  // Ouvre l'application Spotify (lecture demandée alors qu'elle est fermée) ; absent si la plateforme ne sait pas.
  launchApp?: () => void;
  // Types d'appareil Spotify où lancer la lecture, par ordre de préférence (l'appareil sur lequel on joue à Wikimasters).
  deviceTypes?: readonly string[];
  // Adresse de retour propre à un autre service (l'APK en a une par service) ; absente : `redirectUri` vaut pour tous.
  redirectUriFor?: (service: 'tidal') => Promise<string>;
};

type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };
export type SpotifyRequest =
  | { type: 'wmt:spotify'; op: 'redirect-uri' }
  | { type: 'wmt:spotify'; op: 'auth'; url: string }
  | { type: 'wmt:spotify'; op: 'fetch'; url: string; init?: FetchInit };

export type FetchValue = { status: number; retryAfter: string | null; body: string };
export type SpotifyReply = { ok: true; value: string | FetchValue } | { ok: false; error: string };

export type BackgroundDeps = {
  launchWebAuthFlow: (url: string) => Promise<string>;
  getRedirectUrl: () => string;
  fetch: (url: string, init?: FetchInit) => Promise<Response>;
};

const AUTH_PREFIXES = ['https://accounts.spotify.com/authorize?', 'https://login.tidal.com/authorize?'];
// Le service worker relaie aussi Tidal (catalogue, jeton), TMDB (films et séries), les jeux vidéo (Steam, IGDB), les livres (Amazon.fr, Google Books) et GitHub (anomalies) : même contournement de la CSP du site.
const FETCH_PREFIXES = [
  'https://api.spotify.com/',
  'https://accounts.spotify.com/api/token',
  'https://openapi.tidal.com/v2/',
  'https://auth.tidal.com/v1/oauth2/token',
  'https://api.themoviedb.org/3/',
  // Jeux vidéo : Steam (boutique, joueurs en ligne), Twitch (jeton) et IGDB (catalogue).
  'https://store.steampowered.com/',
  'https://api.steampowered.com/',
  'https://id.twitch.tv/oauth2/token',
  'https://api.igdb.com/v4/',
  // Livres : prix papier (page produit d'Amazon.fr) et prix de l'ebook (Google Books) ; même contournement de la CSP du site.
  'https://www.amazon.fr/dp/',
  'https://www.googleapis.com/books/v1/',
  // Anomalies remontées par l'utilisateur : issues de ce dépôt seulement.
  ANOMALY_API_PREFIX,
];

// Côté service worker : ne répond qu'aux messages Spotify, et seulement vers les adresses de Spotify.
export function handleSpotifyMessage(message: unknown, deps: BackgroundDeps): Promise<SpotifyReply> | null {
  const request = message as Partial<SpotifyRequest> | null;
  if (!request || request.type !== 'wmt:spotify') return null;
  return (async (): Promise<SpotifyReply> => {
    try {
      if (request.op === 'redirect-uri') return { ok: true, value: deps.getRedirectUrl() };
      if (request.op === 'auth') {
        const authUrl = request.url;
        if (typeof authUrl !== 'string' || !AUTH_PREFIXES.some((prefix) => authUrl.startsWith(prefix))) return { ok: false, error: 'adresse refusée' };
        return { ok: true, value: await deps.launchWebAuthFlow(authUrl) };
      }
      if (request.op === 'fetch') {
        const url = request.url;
        if (typeof url !== 'string' || !FETCH_PREFIXES.some((prefix) => url.startsWith(prefix))) {
          return { ok: false, error: 'adresse refusée' };
        }
        const response = await deps.fetch(url, request.init);
        return { ok: true, value: { status: response.status, retryAfter: response.headers.get('Retry-After'), body: await response.text() } };
      }
      return { ok: false, error: 'opération inconnue' };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })();
}

const NO_BODY = new Set([101, 204, 205, 304]);

// Côté script de contenu : un `fetch` et une autorisation qui passent par le service worker.
export function createExtensionEnv(send: (request: SpotifyRequest) => Promise<SpotifyReply>, launchApp?: () => void): SpotifyEnv {
  async function ask(request: SpotifyRequest): Promise<string | FetchValue> {
    const reply = await send(request);
    if (!reply.ok) throw new Error(reply.error);
    return reply.value;
  }
  return {
    deviceTypes: ['Computer'],
    ...(launchApp ? { launchApp } : {}),
    redirectUri: async () => (await ask({ type: 'wmt:spotify', op: 'redirect-uri' })) as string,
    authorize: async (url) => (await ask({ type: 'wmt:spotify', op: 'auth', url })) as string,
    fetch: async (url, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      const value = (await ask({
        type: 'wmt:spotify',
        op: 'fetch',
        url,
        init: {
          ...(init?.method ? { method: init.method } : {}),
          ...(headers ? { headers } : {}),
          ...(typeof init?.body === 'string' ? { body: init.body } : {}),
        },
      })) as FetchValue;
      return new Response(NO_BODY.has(value.status) ? null : value.body, {
        status: value.status,
        ...(value.retryAfter ? { headers: { 'Retry-After': value.retryAfter } } : {}),
      });
    },
  };
}
