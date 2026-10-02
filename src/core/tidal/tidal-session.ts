import { z } from 'zod';
import type { KeyValueStore } from '../cache/store';
import { challengeOf, randomString, type CryptoLike } from '../spotify/pkce';
import { TIDAL_AUTHORIZE_URL, TIDAL_CLIENT_ID, TIDAL_SCOPES, TIDAL_TOKEN_URL } from './config';
import { TidalError } from './errors';

export type TidalFetch = (url: string, init?: RequestInit) => Promise<Response>;

type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };

export type TidalSessionDeps = {
  store: KeyValueStore;
  fetch: TidalFetch;
  // Ouvre la page d'autorisation et rend l'URL de retour (extension : service worker ; APK : navigateur du téléphone).
  authorize: (authUrl: string) => Promise<string>;
  redirectUri: () => Promise<string>;
  now?: () => number;
  crypto?: CryptoLike;
};

const KEY = 'tidal-session';
// Marge avant l'expiration : on rafraîchit un peu tôt.
const MARGIN_MS = 60_000;

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number(),
});

// Le code de l'URL de retour ; un refus, un état différent ou une URL illisible annulent la liaison.
function parseRedirect(url: string, expectedState: string): string {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    throw new TidalError('auth-cancelled', 'URL de retour illisible');
  }
  const code = params.get('code');
  if (params.get('error') || params.get('state') !== expectedState || !code) {
    throw new TidalError('auth-cancelled', params.get('error') ?? 'retour invalide');
  }
  return code;
}

export function createTidalSession(deps: TidalSessionDeps) {
  const { store, fetch, authorize, redirectUri, now = () => Date.now(), crypto = globalThis.crypto } = deps;
  const listeners = new Set<() => void>();
  let refreshing: Promise<Tokens> | null = null;

  const notify = () => listeners.forEach((listener) => listener());

  // Client public : jamais de `client_secret`, l'identifiant suffit.
  const requestTokens = (params: Record<string, string>): Promise<Response> =>
    fetch(TIDAL_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: TIDAL_CLIENT_ID, ...params }).toString(),
    });

  async function save(response: Response, fallbackRefresh?: string): Promise<Tokens> {
    const parsed = tokenSchema.safeParse(await response.json());
    const refreshToken = parsed.success ? (parsed.data.refresh_token ?? fallbackRefresh) : undefined;
    if (!parsed.success || !refreshToken) throw new TidalError('http', 'Réponse Tidal inattendue');
    const tokens: Tokens = { accessToken: parsed.data.access_token, refreshToken, expiresAt: now() + parsed.data.expires_in * 1000 };
    await store.set(KEY, tokens);
    return tokens;
  }

  async function unlink(): Promise<void> {
    await store.set<Tokens | null>(KEY, null);
    notify();
  }

  async function refresh(current: Tokens): Promise<Tokens> {
    const response = await requestTokens({ grant_type: 'refresh_token', refresh_token: current.refreshToken });
    if (!response.ok) {
      // Jeton révoqué ou refusé : il faut relier le compte.
      if (response.status === 400 || response.status === 401) {
        // Un autre onglet a peut-être déjà renouvelé le jeton (rotation) : on reprend les siens, sans délier.
        const stored = await store.get<Tokens | null>(KEY);
        if (stored && stored.refreshToken !== current.refreshToken) return stored;
        await unlink();
        throw new TidalError('not-linked', 'Jeton de rafraîchissement refusé');
      }
      throw new TidalError('http', `Tidal : HTTP ${response.status}`);
    }
    return save(response, current.refreshToken);
  }

  return {
    async isLinked(): Promise<boolean> {
      return Boolean(await store.get<Tokens | null>(KEY));
    },

    async link(): Promise<void> {
      const verifier = randomString(64, crypto);
      const state = randomString(24, crypto);
      const redirect = await redirectUri();
      const params = new URLSearchParams({
        client_id: TIDAL_CLIENT_ID,
        response_type: 'code',
        redirect_uri: redirect,
        state,
        scope: TIDAL_SCOPES.join(' '),
        code_challenge_method: 'S256',
        code_challenge: await challengeOf(verifier, crypto),
      });
      const returned = await authorize(`${TIDAL_AUTHORIZE_URL}?${params.toString()}`);
      const code = parseRedirect(returned, state);
      const response = await requestTokens({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier });
      if (!response.ok) throw new TidalError('http', `Tidal : HTTP ${response.status}`);
      await save(response);
      notify();
    },

    unlink,

    // Jeton valide ; `force` : rafraîchissement immédiat (après un 401).
    async accessToken(force = false): Promise<string> {
      const tokens = await store.get<Tokens | null>(KEY);
      if (!tokens) throw new TidalError('not-linked', 'Compte Tidal non lié');
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

export type TidalSession = ReturnType<typeof createTidalSession>;
