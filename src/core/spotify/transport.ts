import type { SpotifyFetch } from './spotify-session';

// Ce dont la surcouche a besoin pour parler à Spotify ; l'extension et l'APK le fournissent chacun à leur façon.
export type SpotifyEnv = {
  fetch: SpotifyFetch;
  authorize: (authUrl: string) => Promise<string>;
  redirectUri: () => Promise<string>;
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

const AUTH_PREFIX = 'https://accounts.spotify.com/authorize?';
const FETCH_PREFIXES = ['https://api.spotify.com/', 'https://accounts.spotify.com/api/token'];

// Côté service worker : ne répond qu'aux messages Spotify, et seulement vers les adresses de Spotify.
export function handleSpotifyMessage(message: unknown, deps: BackgroundDeps): Promise<SpotifyReply> | null {
  const request = message as Partial<SpotifyRequest> | null;
  if (!request || request.type !== 'wmt:spotify') return null;
  return (async (): Promise<SpotifyReply> => {
    try {
      if (request.op === 'redirect-uri') return { ok: true, value: deps.getRedirectUrl() };
      if (request.op === 'auth') {
        if (typeof request.url !== 'string' || !request.url.startsWith(AUTH_PREFIX)) return { ok: false, error: 'adresse refusée' };
        return { ok: true, value: await deps.launchWebAuthFlow(request.url) };
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
export function createExtensionEnv(send: (request: SpotifyRequest) => Promise<SpotifyReply>): SpotifyEnv {
  async function ask(request: SpotifyRequest): Promise<string | FetchValue> {
    const reply = await send(request);
    if (!reply.ok) throw new Error(reply.error);
    return reply.value;
  }
  return {
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
