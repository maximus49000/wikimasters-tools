import { z } from 'zod';
import type { KeyValueStore } from '../cache/store';
import { normalizeClientId } from './client-id';
import { ACCOUNTS_URL, CLIENT_ID_KEY, SESSION_KEY, SPOTIFY_SCOPES } from './config';
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

  // La clé est relue à chaque opération : un autre onglet peut l'avoir changée.
  const readClientId = async (): Promise<string | null> => (await store.get<string | null>(CLIENT_ID_KEY)) ?? null;

  async function requestTokens(clientId: string, params: Record<string, string>): Promise<Response> {
    return fetch(`${ACCOUNTS_URL}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, ...params }).toString(),
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
    await store.set(SESSION_KEY, tokens);
    return tokens;
  }

  async function refresh(current: Tokens): Promise<Tokens> {
    const clientId = await readClientId();
    if (!clientId) {
      await unlink();
      throw new SpotifyError('not-linked', 'Clé Spotify absente');
    }
    const response = await requestTokens(clientId, { grant_type: 'refresh_token', refresh_token: current.refreshToken });
    if (!response.ok) {
      // Jeton révoqué ou refusé : il faut relier le compte.
      if (response.status === 400 || response.status === 401) {
        // Un autre onglet a peut-être déjà renouvelé le jeton (rotation) : on reprend les siens, sans délier.
        const stored = await store.get<Tokens | null>(SESSION_KEY);
        if (stored && stored.refreshToken !== current.refreshToken) return stored;
        await unlink();
        throw new SpotifyError('not-linked', 'Jeton de rafraîchissement refusé');
      }
      throw new SpotifyError('http', `Spotify : HTTP ${response.status}`);
    }
    return save(response, current.refreshToken);
  }

  async function unlink(): Promise<void> {
    await store.set<Tokens | null>(SESSION_KEY, null);
    notify();
  }

  return {
    async isLinked(): Promise<boolean> {
      return Boolean(await store.get<Tokens | null>(SESSION_KEY));
    },

    async link(): Promise<void> {
      const verifier = randomString(64, crypto);
      const state = randomString(24, crypto);
      const clientId = await readClientId();
      if (!clientId) throw new SpotifyError('no-client-id', 'Aucune clé Spotify enregistrée');
      const redirect = await redirectUri();
      const returned = await authorize(
        buildAuthUrl({ clientId, redirectUri: redirect, state, challenge: await challengeOf(verifier, crypto), scopes: SPOTIFY_SCOPES }),
      );
      const code = parseRedirect(returned, state);
      const response = await requestTokens(clientId, { grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier });
      if (!response.ok) throw new SpotifyError('http', `Spotify : HTTP ${response.status}`);
      await save(response);
      notify();
    },

    unlink,

    clientId: readClientId,

    // Enregistre la clé de l'utilisateur. Les jetons appartiennent à l'ancienne clé : changer de clé délie le compte.
    async setClientId(value: string): Promise<'saved' | 'invalid' | 'unlinked' | 'same'> {
      const id = normalizeClientId(value);
      if (!id) return 'invalid';
      if ((await readClientId()) === id) return 'same';
      await store.set(CLIENT_ID_KEY, id);
      const wasLinked = Boolean(await store.get(SESSION_KEY));
      if (wasLinked) await store.set<Tokens | null>(SESSION_KEY, null);
      notify();
      return wasLinked ? 'unlinked' : 'saved';
    },

    async clearClientId(): Promise<void> {
      await store.set<string | null>(CLIENT_ID_KEY, null);
      await store.set<Tokens | null>(SESSION_KEY, null);
      notify();
    },

    // Jeton valide ; `force` : rafraîchissement immédiat (après un 401).
    async accessToken(force = false): Promise<string> {
      const tokens = await store.get<Tokens | null>(SESSION_KEY);
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
