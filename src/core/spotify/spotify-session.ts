import { z } from 'zod';
import type { KeyValueStore } from '../cache/store';
import { ACCOUNTS_URL, SPOTIFY_CLIENT_ID, SPOTIFY_SCOPES } from './config';
import { SpotifyError } from './errors';
import { buildAuthUrl, challengeOf, parseRedirect, randomString, type CryptoLike } from './pkce';

export type SpotifyFetch = (url: string, init?: RequestInit) => Promise<Response>;

type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };

export type SessionDeps = {
  store: KeyValueStore;
  fetch: SpotifyFetch;
  // Ouvre la page d'autorisation et rend l'URL de retour (extension : service worker ; APK : navigateur du téléphone).
  authorize: (authUrl: string) => Promise<string>;
  redirectUri: () => Promise<string>;
  now?: () => number;
  crypto?: CryptoLike;
};

const KEY = 'spotify-session';
// Marge avant l'expiration : on rafraîchit un peu tôt.
const MARGIN_MS = 60_000;

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number(),
});

export function createSpotifySession(deps: SessionDeps) {
  const { store, fetch, authorize, redirectUri, now = () => Date.now(), crypto = globalThis.crypto } = deps;
  const listeners = new Set<() => void>();
  let refreshing: Promise<Tokens> | null = null;

  const notify = () => listeners.forEach((listener) => listener());

  async function requestTokens(params: Record<string, string>): Promise<Response> {
    return fetch(`${ACCOUNTS_URL}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, ...params }).toString(),
    });
  }

  async function save(response: Response, fallbackRefresh?: string): Promise<Tokens> {
    const parsed = tokenSchema.safeParse(await response.json());
    const refreshToken = parsed.success ? (parsed.data.refresh_token ?? fallbackRefresh) : undefined;
    if (!parsed.success || !refreshToken) throw new SpotifyError('http', 'Réponse Spotify inattendue');
    const tokens: Tokens = {
      accessToken: parsed.data.access_token,
      refreshToken,
      expiresAt: now() + parsed.data.expires_in * 1000,
    };
    await store.set(KEY, tokens);
    return tokens;
  }

  async function refresh(current: Tokens): Promise<Tokens> {
    const response = await requestTokens({ grant_type: 'refresh_token', refresh_token: current.refreshToken });
    if (!response.ok) {
      // Jeton révoqué ou refusé : il faut relier le compte.
      if (response.status === 400 || response.status === 401) {
        await unlink();
        throw new SpotifyError('not-linked', 'Jeton de rafraîchissement refusé');
      }
      throw new SpotifyError('http', `Spotify : HTTP ${response.status}`);
    }
    return save(response, current.refreshToken);
  }

  async function unlink(): Promise<void> {
    await store.set<Tokens | null>(KEY, null);
    notify();
  }

  return {
    async isLinked(): Promise<boolean> {
      return Boolean(await store.get<Tokens | null>(KEY));
    },

    async link(): Promise<void> {
      const verifier = randomString(64, crypto);
      const state = randomString(24, crypto);
      const redirect = await redirectUri();
      const returned = await authorize(
        buildAuthUrl({ clientId: SPOTIFY_CLIENT_ID, redirectUri: redirect, state, challenge: await challengeOf(verifier, crypto), scopes: SPOTIFY_SCOPES }),
      );
      const code = parseRedirect(returned, state);
      const response = await requestTokens({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier });
      if (!response.ok) throw new SpotifyError('http', `Spotify : HTTP ${response.status}`);
      await save(response);
      notify();
    },

    unlink,

    // Jeton valide ; `force` : rafraîchissement immédiat (après un 401).
    async accessToken(force = false): Promise<string> {
      const tokens = await store.get<Tokens | null>(KEY);
      if (!tokens) throw new SpotifyError('not-linked', 'Compte Spotify non lié');
      if (!force && tokens.expiresAt - MARGIN_MS > now()) return tokens.accessToken;
      refreshing ??= refresh(tokens).finally(() => {
        refreshing = null;
      });
      return (await refreshing).accessToken;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type SpotifySession = ReturnType<typeof createSpotifySession>;
