# Lecture Spotify depuis les cartes musique — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Lancer depuis la fiche d'une carte musique de la collection (morceau, album, artiste) la lecture sur Spotify Connect, avec un mini-lecteur flottant masquable sur toutes les pages du jeu, dans l'extension (Chrome, Firefox) et dans l'APK.

**Architecture :** Un noyau `core/spotify/` indépendant de la plateforme (PKCE, jetons, client d'API) reçoit un `fetch`, un stockage et une fonction `authorize` injectés. L'extension fournit ces trois éléments par un service worker (qui seul appelle Spotify et lance `identity.launchWebAuthFlow`) ; l'APK les fournit par `window.fetch` et un pont Java (`WmtSpotify`) qui ouvre le navigateur du téléphone et renvoie l'URL de retour `wikimasterstools://spotify`. `core/music/` lit Wikidata (interprète, identifiants Spotify) et résout une carte en liste de pistes ; `content/` affiche la section « Écouter » dans `CardPopup` et le mini-lecteur.

**Tech Stack :** TypeScript strict (`noUncheckedIndexedAccess`), React 19, zod 4, Vitest 5, WXT 0.21 (MV3), Android (Java, WebView).

**Spec :** [docs/superpowers/specs/2026-10-01-spotify-playback-design.md](../specs/2026-10-01-spotify-playback-design.md)

## Global Constraints

- Client ID Spotify : `53483f8dd5374f1889f994488d989283` (public, PKCE, aucun secret).
- Droits demandés : `user-modify-playback-state`, `user-read-playback-state`, rien d'autre.
- Redirect URI APK : `wikimasterstools://spotify`. Extension : `identity.getRedirectURL()` (Chrome `https://<id>.chromiumapp.org/`, Firefox `https://<hash>.extensions.allizom.org/`).
- Lecture = Spotify Connect (`PUT /me/player/play`), jamais de lecteur intégré. Pas d'appareil actif (404) : message, pas de transfert automatique.
- Artiste : 10 titres au plus par recherche (`limit=10`, maximum de Spotify) ; `/artists/{id}/top-tracks` est supprimé, ne pas l'utiliser.
- Seules les cartes de la collection (`wmt:collection`) ont la section « Écouter ».
- Clé de stockage Wikidata : `music-v1` (distincte de `kinds-v1`, `dates-v2`). Mini-lecteur masqué : `wmt:spotifyPlayerHidden`. Session Spotify : `spotify-session` (préfixe `wmt:` ajouté par le store).
- Aucune API propre à Chrome hors `browser.*` de WXT ; UI utilisable au tactile (cibles ≥ 44 px, pas de survol, écran étroit) ; boutons en glyphes avec `aria-label` et `title`.
- Textes de l'interface en français, ton sobre ; commentaires de code en français, comme le dépôt.
- Les écritures de stockage absorbent les erreurs (`try/catch`) quand elles servent à une préférence d'affichage.
- Commandes : tests `node node_modules/vitest/vitest.mjs run <chemin>` ; types `node node_modules/typescript/bin/tsc --noEmit` ; build `node node_modules/wxt/bin/wxt.mjs build` (le npm global 8.1.1 masque le npm de Node : ne pas utiliser `npm` / `npx` directement, voir mémoire du projet).
- Commits : message en français préfixé (`feat:`, `test:`, `docs:`), terminé par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/core/spotify/config.ts` | Client ID, droits, URLs, redirect APK |
| `src/core/spotify/errors.ts` | `SpotifyError`, messages utilisateur |
| `src/core/spotify/pkce.ts` | Vérificateur/défi PKCE, URL d'autorisation, lecture de l'URL de retour |
| `src/core/spotify/spotify-session.ts` | Liaison, jetons, rafraîchissement, déliaison |
| `src/core/spotify/spotify-api.ts` | Client d'API (recherche, pistes d'album, play, pause, état) |
| `src/core/spotify/transport.ts` | Type `SpotifyEnv`, protocole message extension (service worker ↔ content script) |
| `src/core/music/music-kinds.ts` | Nature Wikidata → `track` / `album` / `artist` |
| `src/core/music/wikidata-music.ts` | Lecture P175, P2207, P2205, P1902 |
| `src/core/music/music-repo.ts` | Stockage `music-v1` |
| `src/core/music/listen.ts` | Carte → liste de pistes à lire |
| `src/content/music-service.ts` | Vue « Écouter » d'une carte, lecture, liaison |
| `src/content/player-source.ts` | État et sondage du mini-lecteur |
| `src/content/music-registry.ts` | Service partagé lu par `CardPopup` |
| `src/content/Glyphs.tsx` | Glyphes SVG (lecture, pause, flèches, note) |
| `src/content/ListenSection.tsx` | Section « Écouter » de la fiche |
| `src/content/SpotifyPlayer.tsx` + `mount-player.tsx` | Mini-lecteur flottant |
| `src/entrypoints/background.ts` | Service worker de l'extension |
| `src/app/extension-spotify.ts` | `SpotifyEnv` de l'extension (messages vers le service worker) |
| `src/android/spotify-env.ts` | `SpotifyEnv` de l'APK (pont Java) |
| `scripts/chrome-extension-id.mjs` | Clé et identifiant Chrome stables |

---

### Task 1 : Configuration, erreurs et PKCE

**Files :**
- Create: `src/core/spotify/config.ts`, `src/core/spotify/errors.ts`, `src/core/spotify/pkce.ts`
- Test: `tests/core/spotify/pkce.test.ts`, `tests/core/spotify/errors.test.ts`

**Interfaces :**
- Produces:
  - `SPOTIFY_CLIENT_ID`, `SPOTIFY_SCOPES: string[]`, `ACCOUNTS_URL`, `API_URL`, `ANDROID_REDIRECT_URI`
  - `type SpotifyErrorCode = 'not-linked' | 'no-device' | 'not-premium' | 'rate-limited' | 'auth-cancelled' | 'http'`
  - `class SpotifyError extends Error { code; retryAfterMs?: number }`, `userMessage(error: unknown): string`
  - `type CryptoLike`, `randomString(length: number, crypto?: CryptoLike): string`, `challengeOf(verifier: string, crypto?: CryptoLike): Promise<string>`
  - `buildAuthUrl(args: { clientId; redirectUri; state; challenge; scopes: string[] }): string`
  - `parseRedirect(url: string, expectedState: string): string` (renvoie le `code`, lève `SpotifyError('auth-cancelled')`)

- [ ] **Step 1 : écrire les tests**

`tests/core/spotify/pkce.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { SpotifyError } from '../../../src/core/spotify/errors';
import { buildAuthUrl, challengeOf, parseRedirect, randomString } from '../../../src/core/spotify/pkce';

describe('pkce', () => {
  it('calcule le défi S256 du vecteur de la RFC 7636', async () => {
    expect(await challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('génère une chaîne aléatoire de la longueur demandée, sans caractère interdit', () => {
    const value = randomString(64);
    expect(value).toHaveLength(64);
    expect(value).toMatch(/^[A-Za-z0-9\-._~]+$/);
    expect(randomString(64)).not.toBe(value);
  });

  it("construit l'URL d'autorisation PKCE", () => {
    const url = new URL(
      buildAuthUrl({ clientId: 'abc', redirectUri: 'wikimasterstools://spotify', state: 's1', challenge: 'ch', scopes: ['a', 'b'] }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'abc',
      response_type: 'code',
      redirect_uri: 'wikimasterstools://spotify',
      state: 's1',
      scope: 'a b',
      code_challenge_method: 'S256',
      code_challenge: 'ch',
    });
  });

  it("lit le code de l'URL de retour", () => {
    expect(parseRedirect('wikimasterstools://spotify?code=XYZ&state=s1', 's1')).toBe('XYZ');
    expect(parseRedirect('https://abc.chromiumapp.org/?state=s1&code=Q', 's1')).toBe('Q');
  });

  it('refuse un refus, un état différent ou une URL sans code', () => {
    for (const url of [
      'wikimasterstools://spotify?error=access_denied&state=s1',
      'wikimasterstools://spotify?code=XYZ&state=autre',
      'wikimasterstools://spotify?state=s1',
      'pas une url',
    ]) {
      expect(() => parseRedirect(url, 's1')).toThrowError(SpotifyError);
    }
  });
});
```

`tests/core/spotify/errors.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { SpotifyError, userMessage } from '../../../src/core/spotify/errors';

describe('userMessage', () => {
  it('donne un message clair par cas', () => {
    expect(userMessage(new SpotifyError('no-device', 'x'))).toBe("Ouvre Spotify sur un de tes appareils, puis réessaie.");
    expect(userMessage(new SpotifyError('not-premium', 'x'))).toBe('Spotify Premium est nécessaire pour lancer la lecture.');
    expect(userMessage(new SpotifyError('not-linked', 'x'))).toBe('Lie ton compte Spotify pour écouter.');
    expect(userMessage(new SpotifyError('rate-limited', 'x', 3000))).toBe('Spotify demande de patienter un instant. Réessaie dans quelques secondes.');
    expect(userMessage(new SpotifyError('auth-cancelled', 'x'))).toBe('Liaison Spotify annulée.');
    expect(userMessage(new SpotifyError('http', 'x'))).toBe('Spotify est indisponible pour le moment.');
    expect(userMessage(new Error('boom'))).toBe('Spotify est indisponible pour le moment.');
  });
});
```

- [ ] **Step 2 : lancer les tests, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/core/spotify`
Expected: FAIL (modules introuvables).

- [ ] **Step 3 : écrire le code**

`src/core/spotify/config.ts` :

```ts
// Identifiant public de l'application Spotify (PKCE : aucun secret côté client).
export const SPOTIFY_CLIENT_ID = '53483f8dd5374f1889f994488d989283';
// Piloter la lecture et lire son état, rien d'autre.
export const SPOTIFY_SCOPES = ['user-modify-playback-state', 'user-read-playback-state'];
export const ACCOUNTS_URL = 'https://accounts.spotify.com';
export const API_URL = 'https://api.spotify.com/v1';
// Retour de l'autorisation dans l'application Android (filtre d'intent de MainActivity).
export const ANDROID_REDIRECT_URI = 'wikimasterstools://spotify';
```

`src/core/spotify/errors.ts` :

```ts
export type SpotifyErrorCode = 'not-linked' | 'no-device' | 'not-premium' | 'rate-limited' | 'auth-cancelled' | 'http';

export class SpotifyError extends Error {
  constructor(
    readonly code: SpotifyErrorCode,
    message: string,
    // Pour `rate-limited` : durée demandée par Spotify (Retry-After).
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'SpotifyError';
  }
}

const MESSAGES: Record<SpotifyErrorCode, string> = {
  'no-device': 'Ouvre Spotify sur un de tes appareils, puis réessaie.',
  'not-premium': 'Spotify Premium est nécessaire pour lancer la lecture.',
  'not-linked': 'Lie ton compte Spotify pour écouter.',
  'rate-limited': 'Spotify demande de patienter un instant. Réessaie dans quelques secondes.',
  'auth-cancelled': 'Liaison Spotify annulée.',
  http: 'Spotify est indisponible pour le moment.',
};

export function userMessage(error: unknown): string {
  return error instanceof SpotifyError ? MESSAGES[error.code] : MESSAGES.http;
}
```

`src/core/spotify/pkce.ts` :

```ts
import { ACCOUNTS_URL } from './config';
import { SpotifyError } from './errors';

export type CryptoLike = {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  subtle: { digest(algorithm: string, data: BufferSource): Promise<ArrayBuffer> };
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export function randomString(length: number, crypto: CryptoLike = globalThis.crypto): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function challengeOf(verifier: string, crypto: CryptoLike = globalThis.crypto): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export function buildAuthUrl(args: { clientId: string; redirectUri: string; state: string; challenge: string; scopes: string[] }): string {
  const params = new URLSearchParams({
    client_id: args.clientId,
    response_type: 'code',
    redirect_uri: args.redirectUri,
    state: args.state,
    scope: args.scopes.join(' '),
    code_challenge_method: 'S256',
    code_challenge: args.challenge,
  });
  return `${ACCOUNTS_URL}/authorize?${params.toString()}`;
}

// Le code de l'URL de retour ; un refus, un état différent ou une URL illisible annulent la liaison.
export function parseRedirect(url: string, expectedState: string): string {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    throw new SpotifyError('auth-cancelled', 'URL de retour illisible');
  }
  const code = params.get('code');
  if (params.get('error') || params.get('state') !== expectedState || !code) {
    throw new SpotifyError('auth-cancelled', params.get('error') ?? 'retour invalide');
  }
  return code;
}
```

- [ ] **Step 4 : lancer les tests, vérifier le succès**

Run: `node node_modules/vitest/vitest.mjs run tests/core/spotify`
Expected: PASS.

- [ ] **Step 5 : commit**

```bash
git add src/core/spotify tests/core/spotify
git commit -m "feat: configuration, erreurs et PKCE de Spotify"
```

---

### Task 2 : Session Spotify (liaison, jetons, rafraîchissement)

**Files :**
- Create: `src/core/spotify/spotify-session.ts`
- Test: `tests/core/spotify/spotify-session.test.ts`

**Interfaces :**
- Consumes: `KeyValueStore` (`src/core/cache/store.ts`), `SpotifyError`, `buildAuthUrl`, `challengeOf`, `parseRedirect`, `randomString`, config (Task 1).
- Produces:
  - `type SpotifyFetch = (url: string, init?: RequestInit) => Promise<Response>`
  - `type SessionDeps = { store: KeyValueStore; fetch: SpotifyFetch; authorize: (authUrl: string) => Promise<string>; redirectUri: () => Promise<string>; now?: () => number; crypto?: CryptoLike }`
  - `createSpotifySession(deps): { isLinked(): Promise<boolean>; link(): Promise<void>; unlink(): Promise<void>; accessToken(force?: boolean): Promise<string>; subscribe(listener: () => void): () => void }`
  - `type SpotifySession = ReturnType<typeof createSpotifySession>`

- [ ] **Step 1 : écrire le test**

`tests/core/spotify/spotify-session.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { SpotifyError } from '../../../src/core/spotify/errors';
import { createSpotifySession } from '../../../src/core/spotify/spotify-session';

const tokenResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function setup(overrides: { fetch?: ReturnType<typeof vi.fn>; authorize?: ReturnType<typeof vi.fn> } = {}) {
  let time = 1_000_000;
  const fetch =
    overrides.fetch ??
    vi.fn(async () => tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600 }));
  const authorize =
    overrides.authorize ??
    vi.fn(async (authUrl: string) => `wikimasterstools://spotify?code=CODE&state=${new URL(authUrl).searchParams.get('state')}`);
  const session = createSpotifySession({
    store: createMemoryStore(),
    fetch,
    authorize,
    redirectUri: async () => 'wikimasterstools://spotify',
    now: () => time,
  });
  return { session, fetch, authorize, advance: (ms: number) => (time += ms) };
}

describe('createSpotifySession', () => {
  it('lie le compte : autorisation PKCE puis échange du code', async () => {
    const { session, fetch, authorize } = setup();
    expect(await session.isLinked()).toBe(false);
    await session.link();
    expect(await session.isLinked()).toBe(true);

    const authUrl = new URL(authorize.mock.calls[0]![0] as string);
    expect(authUrl.searchParams.get('client_id')).toBe('53483f8dd5374f1889f994488d989283');
    expect(authUrl.searchParams.get('scope')).toBe('user-modify-playback-state user-read-playback-state');

    const [url, init] = fetch.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://accounts.spotify.com/api/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('CODE');
    expect(body.get('redirect_uri')).toBe('wikimasterstools://spotify');
    expect(body.get('code_verifier')).toHaveLength(64);
    expect(await session.accessToken()).toBe('A1');
  });

  it('ne lie rien quand la liaison est annulée', async () => {
    const { session } = setup({ authorize: vi.fn(async () => 'wikimasterstools://spotify?error=access_denied') });
    await expect(session.link()).rejects.toMatchObject({ code: 'auth-cancelled' });
    expect(await session.isLinked()).toBe(false);
  });

  it('rafraîchit le jeton expiré, en gardant le jeton de rafraîchissement si Spotify n\'en renvoie pas', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600 }))
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A2', expires_in: 3600 }));
    const { session, advance } = setup({ fetch });
    await session.link();
    advance(3600_000);
    expect(await session.accessToken()).toBe('A2');
    const body = new URLSearchParams((fetch.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('R1');
  });

  it('regroupe les rafraîchissements simultanés en une seule requête', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600 }))
      .mockResolvedValue(tokenResponse({ access_token: 'A2', expires_in: 3600 }));
    const { session, advance } = setup({ fetch });
    await session.link();
    advance(3600_000);
    expect(await Promise.all([session.accessToken(), session.accessToken()])).toEqual(['A2', 'A2']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('force un rafraîchissement même si le jeton est valide', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600 }))
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A2', expires_in: 3600 }));
    const { session } = setup({ fetch });
    await session.link();
    expect(await session.accessToken(true)).toBe('A2');
  });

  it('délie quand le jeton de rafraîchissement est refusé', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600 }))
      .mockResolvedValueOnce(tokenResponse({ error: 'invalid_grant' }, 400));
    const { session, advance } = setup({ fetch });
    await session.link();
    advance(3600_000);
    await expect(session.accessToken()).rejects.toMatchObject({ code: 'not-linked' });
    expect(await session.isLinked()).toBe(false);
  });

  it('lève not-linked sans compte lié, et prévient les abonnés à la liaison et à la déliaison', async () => {
    const { session } = setup();
    await expect(session.accessToken()).rejects.toBeInstanceOf(SpotifyError);
    const listener = vi.fn();
    session.subscribe(listener);
    await session.link();
    await session.unlink();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(await session.isLinked()).toBe(false);
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/core/spotify/spotify-session.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : écrire le code**

`src/core/spotify/spotify-session.ts` :

```ts
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
```

- [ ] **Step 4 : lancer le test, vérifier le succès**

Run: `node node_modules/vitest/vitest.mjs run tests/core/spotify`
Expected: PASS.

- [ ] **Step 5 : commit**

```bash
git add src/core/spotify/spotify-session.ts tests/core/spotify/spotify-session.test.ts
git commit -m "feat: session Spotify (liaison PKCE, jetons, rafraîchissement)"
```

---

### Task 3 : Client d'API Spotify

**Files :**
- Create: `src/core/spotify/spotify-api.ts`
- Test: `tests/core/spotify/spotify-api.test.ts`

**Interfaces :**
- Consumes: `SpotifyFetch`, `SpotifySession` (`accessToken(force?)`), `SpotifyError`, `API_URL`.
- Produces:
  - `type Track = { uri: string; title: string; artist: string }`
  - `type FoundTrack = Track & { artistIds: string[]; artists: string[] }`
  - `type PlayTarget = { uris: string[] } | { contextUri: string; offsetUri: string } | null` (`null` = reprendre)
  - `type PlayerState = { playing: boolean; title: string; artist: string; imageUrl: string | null } | null`
  - `createSpotifyApi({ session: Pick<SpotifySession, 'accessToken'>, fetch: SpotifyFetch }): { searchTracks(query: string, limit?: number): Promise<FoundTrack[]>; searchAlbum(title: string, performer?: string): Promise<string | null>; albumTracks(albumId: string): Promise<Track[]>; play(target: PlayTarget): Promise<void>; pause(): Promise<void>; playerState(): Promise<PlayerState> }`
  - `type SpotifyApi = ReturnType<typeof createSpotifyApi>`

- [ ] **Step 1 : écrire le test**

`tests/core/spotify/spotify-api.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createSpotifyApi } from '../../../src/core/spotify/spotify-api';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const empty = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers });

function setup(responses: Response[]) {
  const fetch = vi.fn();
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  const session = { accessToken: vi.fn(async () => 'TOKEN') };
  return { api: createSpotifyApi({ session, fetch }), fetch, session };
}

const call = (fetch: ReturnType<typeof vi.fn>, index = 0) => {
  const [url, init] = fetch.mock.calls[index]! as [string, RequestInit];
  return { url: new URL(url), init, headers: init.headers as Record<string, string> };
};

describe('createSpotifyApi', () => {
  it('cherche des titres et en tire les artistes', async () => {
    const { api, fetch } = setup([
      json({ tracks: { items: [{ uri: 'spotify:track:1', name: 'Yesterday', artists: [{ id: 'a1', name: 'The Beatles' }] }] } }),
    ]);
    expect(await api.searchTracks('track:"Yesterday"', 1)).toEqual([
      { uri: 'spotify:track:1', title: 'Yesterday', artist: 'The Beatles', artistIds: ['a1'], artists: ['The Beatles'] },
    ]);
    const { url, headers } = call(fetch);
    expect(url.pathname).toBe('/v1/search');
    expect(url.searchParams.get('type')).toBe('track');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.get('q')).toBe('track:"Yesterday"');
    expect(headers.Authorization).toBe('Bearer TOKEN');
  });

  it("limite la recherche à 10 résultats, maximum de Spotify", async () => {
    const { api, fetch } = setup([json({ tracks: { items: [] } })]);
    await api.searchTracks('x', 50);
    expect(call(fetch).url.searchParams.get('limit')).toBe('10');
  });

  it("trouve l'identifiant d'un album, ou rien", async () => {
    const { api, fetch } = setup([json({ albums: { items: [{ id: 'alb1' }] } }), json({ albums: { items: [] } })]);
    expect(await api.searchAlbum('Abbey Road', 'The Beatles')).toBe('alb1');
    expect(call(fetch).url.searchParams.get('q')).toBe('album:"Abbey Road" artist:"The Beatles"');
    expect(await api.searchAlbum('Inconnu')).toBeNull();
  });

  it("liste les pistes d'un album", async () => {
    const { api, fetch } = setup([
      json({ items: [{ uri: 'spotify:track:9', name: 'Come Together', artists: [{ name: 'The Beatles' }] }] }),
    ]);
    expect(await api.albumTracks('alb1')).toEqual([{ uri: 'spotify:track:9', title: 'Come Together', artist: 'The Beatles' }]);
    expect(call(fetch).url.pathname).toBe('/v1/albums/alb1/tracks');
  });

  it('lance un morceau, un titre d’album dans son contexte, ou reprend la lecture', async () => {
    const { api, fetch } = setup([empty(204), empty(204), empty(204)]);
    await api.play({ uris: ['spotify:track:1'] });
    await api.play({ contextUri: 'spotify:album:alb1', offsetUri: 'spotify:track:9' });
    await api.play(null);
    expect(call(fetch, 0).init.method).toBe('PUT');
    expect(call(fetch, 0).url.pathname).toBe('/v1/me/player/play');
    expect(JSON.parse(call(fetch, 0).init.body as string)).toEqual({ uris: ['spotify:track:1'] });
    expect(JSON.parse(call(fetch, 1).init.body as string)).toEqual({
      context_uri: 'spotify:album:alb1',
      offset: { uri: 'spotify:track:9' },
    });
    expect(call(fetch, 2).init.body).toBeUndefined();
  });

  it('met en pause', async () => {
    const { api, fetch } = setup([empty(204)]);
    await api.pause();
    expect(call(fetch).url.pathname).toBe('/v1/me/player/pause');
  });

  it("lit l'état du lecteur, ou null quand rien ne joue (204)", async () => {
    const { api } = setup([
      json({
        is_playing: true,
        item: { name: 'Something', artists: [{ name: 'The Beatles' }], album: { images: [{ url: 'https://i/1.jpg' }] } },
      }),
      empty(204),
    ]);
    expect(await api.playerState()).toEqual({ playing: true, title: 'Something', artist: 'The Beatles', imageUrl: 'https://i/1.jpg' });
    expect(await api.playerState()).toBeNull();
  });

  it('traduit les erreurs : 404 sans appareil, 403 sans Premium, 429 avec attente', async () => {
    const { api } = setup([empty(404), empty(403), empty(429, { 'Retry-After': '3' }), empty(500)]);
    await expect(api.pause()).rejects.toMatchObject({ code: 'no-device' });
    await expect(api.pause()).rejects.toMatchObject({ code: 'not-premium' });
    await expect(api.pause()).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 3000 });
    await expect(api.pause()).rejects.toMatchObject({ code: 'http' });
  });

  it('retente une fois avec un jeton neuf après un 401', async () => {
    const { api, fetch, session } = setup([empty(401), empty(204)]);
    await api.pause();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(session.accessToken).toHaveBeenNthCalledWith(1, false);
    expect(session.accessToken).toHaveBeenNthCalledWith(2, true);
  });

  it('abandonne après un second 401', async () => {
    const { api } = setup([empty(401), empty(401)]);
    await expect(api.pause()).rejects.toMatchObject({ code: 'not-linked' });
  });

  it('rejette une réponse de recherche inattendue', async () => {
    const { api } = setup([json({ rien: true })]);
    await expect(api.searchTracks('x')).rejects.toMatchObject({ code: 'http' });
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/core/spotify/spotify-api.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : écrire le code**

`src/core/spotify/spotify-api.ts` :

```ts
import { z } from 'zod';
import { API_URL } from './config';
import { SpotifyError } from './errors';
import type { SpotifyFetch, SpotifySession } from './spotify-session';

export type Track = { uri: string; title: string; artist: string };
export type FoundTrack = Track & { artistIds: string[]; artists: string[] };
// `null` : reprendre la lecture en cours.
export type PlayTarget = { uris: string[] } | { contextUri: string; offsetUri: string } | null;
export type PlayerState = { playing: boolean; title: string; artist: string; imageUrl: string | null } | null;

// Maximum accepté par Spotify pour les applications en mode développement (février 2026).
const SEARCH_MAX = 10;

const artistSchema = z.object({ id: z.string().optional(), name: z.string() });
const trackSchema = z.object({ uri: z.string(), name: z.string(), artists: z.array(artistSchema) });
const searchTracksSchema = z.object({ tracks: z.object({ items: z.array(trackSchema) }) });
const searchAlbumsSchema = z.object({ albums: z.object({ items: z.array(z.object({ id: z.string() })) }) });
const albumTracksSchema = z.object({ items: z.array(trackSchema) });
const stateSchema = z.object({
  is_playing: z.boolean(),
  item: z
    .object({ name: z.string(), artists: z.array(artistSchema), album: z.object({ images: z.array(z.object({ url: z.string() })) }).optional() })
    .nullish(),
});

const joinArtists = (artists: { name: string }[]): string => artists.map((artist) => artist.name).join(', ');

function parse<T>(schema: z.ZodType<T>, json: unknown): T {
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new SpotifyError('http', 'Réponse Spotify inattendue');
  return parsed.data;
}

export function createSpotifyApi(deps: { session: Pick<SpotifySession, 'accessToken'>; fetch: SpotifyFetch }) {
  const { session, fetch } = deps;

  async function send(method: string, path: string, options: { query?: Record<string, string>; body?: unknown } = {}): Promise<Response> {
    const url = `${API_URL}${path}${options.query ? `?${new URLSearchParams(options.query).toString()}` : ''}`;
    for (let attempt = 0; ; attempt += 1) {
      const token = await session.accessToken(attempt > 0);
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
      if (response.status === 401) {
        // Un seul essai avec un jeton neuf.
        if (attempt === 0) continue;
        throw new SpotifyError('not-linked', 'Jeton Spotify refusé');
      }
      if (response.status === 404 && path.startsWith('/me/player')) throw new SpotifyError('no-device', 'Aucun appareil Spotify actif');
      if (response.status === 403) throw new SpotifyError('not-premium', 'Spotify Premium requis');
      if (response.status === 429) {
        const seconds = Number(response.headers.get('Retry-After'));
        throw new SpotifyError('rate-limited', 'Trop de requêtes', Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5000);
      }
      if (!response.ok) throw new SpotifyError('http', `Spotify : HTTP ${response.status}`);
      return response;
    }
  }

  return {
    async searchTracks(query: string, limit = SEARCH_MAX): Promise<FoundTrack[]> {
      const response = await send('GET', '/search', { query: { q: query, type: 'track', limit: String(Math.min(limit, SEARCH_MAX)) } });
      return parse(searchTracksSchema, await response.json()).tracks.items.map((item) => ({
        uri: item.uri,
        title: item.name,
        artist: joinArtists(item.artists),
        artistIds: item.artists.flatMap((artist) => (artist.id ? [artist.id] : [])),
        artists: item.artists.map((artist) => artist.name),
      }));
    },

    async searchAlbum(title: string, performer?: string): Promise<string | null> {
      const q = `album:"${title}"${performer ? ` artist:"${performer}"` : ''}`;
      const response = await send('GET', '/search', { query: { q, type: 'album', limit: '1' } });
      return parse(searchAlbumsSchema, await response.json()).albums.items[0]?.id ?? null;
    },

    async albumTracks(albumId: string): Promise<Track[]> {
      const response = await send('GET', `/albums/${encodeURIComponent(albumId)}/tracks`, { query: { limit: '50' } });
      return parse(albumTracksSchema, await response.json()).items.map((item) => ({
        uri: item.uri,
        title: item.name,
        artist: joinArtists(item.artists),
      }));
    },

    async play(target: PlayTarget): Promise<void> {
      const body = !target ? undefined : 'uris' in target ? { uris: target.uris } : { context_uri: target.contextUri, offset: { uri: target.offsetUri } };
      await send('PUT', '/me/player/play', body ? { body } : {});
    },

    async pause(): Promise<void> {
      await send('PUT', '/me/player/pause');
    },

    async playerState(): Promise<PlayerState> {
      const response = await send('GET', '/me/player');
      // 204 : aucun appareil ne joue ni n'a joué récemment.
      if (response.status === 204) return null;
      const state = parse(stateSchema, await response.json());
      if (!state.item) return null;
      return {
        playing: state.is_playing,
        title: state.item.name,
        artist: joinArtists(state.item.artists),
        imageUrl: state.item.album?.images[0]?.url ?? null,
      };
    },
  };
}

export type SpotifyApi = ReturnType<typeof createSpotifyApi>;
```

- [ ] **Step 4 : lancer le test, vérifier le succès**

Run: `node node_modules/vitest/vitest.mjs run tests/core/spotify`
Expected: PASS (tous les tests de `tests/core/spotify`).

- [ ] **Step 5 : commit**

```bash
git add src/core/spotify/spotify-api.ts tests/core/spotify/spotify-api.test.ts
git commit -m "feat: client d'API Spotify (recherche, pistes, lecture, état)"
```

---

### Task 4 : Données Wikidata de la musique (nature, interprète, identifiants Spotify)

**Files :**
- Create: `src/core/music/music-kinds.ts`, `src/core/music/wikidata-music.ts`, `src/core/music/music-repo.ts`
- Test: `tests/core/music/music-kinds.test.ts`, `tests/core/music/wikidata-music.test.ts`, `tests/core/music/music-repo.test.ts`

**Interfaces :**
- Consumes: `CardKinds` (`src/core/kinds/wikidata-kinds.ts`), `parseLabels`, `BATCH_SIZE`, `getJson`, `parseWikibaseItems`, `usableClaims`, `FetchLike` (`wikidata-birth.ts`), `slugToTitle`, `KeyValueStore`.
- Produces:
  - `type MusicKind = 'track' | 'album' | 'artist'`, `musicKindOf(kinds: CardKinds | undefined): MusicKind | null`
  - `type CardMusic = { trackId?: string; albumId?: string; artistId?: string; performer?: string }`
  - `parseCardMusic(json: unknown): Record<string, { trackId?: string; albumId?: string; artistId?: string; performerQid?: string }>` (par identifiant d'élément Q)
  - `fetchWikidataMusic(fetchFn: FetchLike, slugs: string[]): Promise<Record<string, CardMusic>>`
  - `createMusicRepo(store, fetchMusic, now?): { load(): Promise<MusicState>; resolve(slugs: string[]): Promise<MusicState> }`, `type MusicState = Record<string, CardMusic>`

- [ ] **Step 1 : écrire les tests**

`tests/core/music/music-kinds.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { musicKindOf } from '../../../src/core/music/music-kinds';

const kinds = (natures: string[], occupations: string[] = []) => ({ natures, occupations, genres: [] });

describe('musicKindOf', () => {
  it('reconnaît un morceau, un single, un album', () => {
    expect(musicKindOf(kinds(['Q7366']))).toBe('track');
    expect(musicKindOf(kinds(['Q134556']))).toBe('track');
    expect(musicKindOf(kinds(['Q482994']))).toBe('album');
    expect(musicKindOf(kinds(['Q208569']))).toBe('album');
  });

  it('reconnaît un groupe, et une personne musicienne ou chanteuse', () => {
    expect(musicKindOf(kinds(['Q215380']))).toBe('artist');
    expect(musicKindOf(kinds(['Q5'], ['Q177220']))).toBe('artist');
    expect(musicKindOf(kinds(['Q5'], ['Q33999', 'Q639669']))).toBe('artist');
  });

  it("ignore les autres cartes, dont les personnes sans métier musical, ou sans donnée", () => {
    expect(musicKindOf(kinds(['Q5'], ['Q33999']))).toBeNull();
    expect(musicKindOf(kinds(['Q11424']))).toBeNull();
    expect(musicKindOf(undefined)).toBeNull();
  });

  it('donne la priorité à l’œuvre quand plusieurs natures coexistent', () => {
    expect(musicKindOf(kinds(['Q482994', 'Q7366']))).toBe('album');
  });
});
```

`tests/core/music/wikidata-music.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { fetchWikidataMusic, parseCardMusic } from '../../../src/core/music/wikidata-music';

const id = (value: string) => ({ rank: 'normal', mainsnak: { datavalue: { value: { id: value } } } });
const text = (value: string, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value } } });
const entities = (record: Record<string, Record<string, unknown[]>>) => ({
  entities: Object.fromEntries(Object.entries(record).map(([key, claims]) => [key, { claims }])),
});
const SPOTIFY_ID = '4uLU6hMCjMI75M1A2tKUQC';

describe('parseCardMusic', () => {
  it("lit l'interprète et les identifiants Spotify", () => {
    const parsed = parseCardMusic(
      entities({ Q1: { P175: [id('Q15')], P2207: [text(SPOTIFY_ID)], P2205: [text('1DFixLWuPkv3KT3TnV35m3')], P1902: [text('3WrFJ7ztbogyGnTHbHJFl2')] } }),
    );
    expect(parsed.Q1).toEqual({
      performerQid: 'Q15',
      trackId: SPOTIFY_ID,
      albumId: '1DFixLWuPkv3KT3TnV35m3',
      artistId: '3WrFJ7ztbogyGnTHbHJFl2',
    });
  });

  it('ignore un identifiant Spotify mal formé et les rangs dépréciés, garde le rang préféré', () => {
    const parsed = parseCardMusic(
      entities({ Q1: { P2207: [text('pas-un-id'), text('A'.repeat(22), 'deprecated'), text(SPOTIFY_ID, 'preferred')] } }),
    );
    expect(parsed.Q1).toEqual({ trackId: SPOTIFY_ID });
  });

  it('rend un objet vide pour un élément sans valeur, et lève sur un format inattendu', () => {
    expect(parseCardMusic(entities({ Q1: {} })).Q1).toEqual({});
    expect(() => parseCardMusic({ pas: 'wikidata' })).toThrow();
  });
});

describe('fetchWikidataMusic', () => {
  it('rend une entrée par article, avec le libellé français de l’interprète', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      if (params.get('prop') === 'pageprops') {
        return Response.json({ query: { pages: [{ title: 'Yesterday', pageprops: { wikibase_item: 'Q1' } }, { title: 'Inconnu' }] } });
      }
      if (params.get('props') === 'claims') return Response.json(entities({ Q1: { P175: [id('Q15')], P2207: [text(SPOTIFY_ID)] } }));
      return Response.json({ entities: { Q15: { labels: { fr: { value: 'The Beatles' }, en: { value: 'The Beatles (en)' } } } } });
    });
    expect(await fetchWikidataMusic(fetchFn, ['Yesterday', 'Inconnu'])).toEqual({
      Yesterday: { trackId: SPOTIFY_ID, performer: 'The Beatles' },
      Inconnu: {},
    });
  });
});
```

`tests/core/music/music-repo.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createMusicRepo } from '../../../src/core/music/music-repo';
import type { CardMusic } from '../../../src/core/music/wikidata-music';

describe('createMusicRepo', () => {
  it('interroge chaque article une fois, même sans valeur', async () => {
    const fetchMusic = vi.fn(async (slugs: string[]): Promise<Record<string, CardMusic>> =>
      Object.fromEntries(slugs.map((slug) => [slug, slug === 'Yesterday' ? { performer: 'The Beatles' } : {}])),
    );
    const repo = createMusicRepo(createMemoryStore(), fetchMusic);
    await repo.resolve(['Yesterday', 'Paris']);
    const state = await repo.resolve(['Yesterday', 'Paris']);
    expect(fetchMusic).toHaveBeenCalledTimes(1);
    expect(state).toEqual({ Yesterday: { performer: 'The Beatles' }, Paris: {} });
    expect(await repo.load()).toEqual(state);
  });

  it("n'enregistre rien en cas d'échec, puis attend 60 s avant de réessayer", async () => {
    let time = 0;
    const fetchMusic = vi
      .fn<(slugs: string[]) => Promise<Record<string, CardMusic>>>()
      .mockRejectedValueOnce(new Error('hors ligne'))
      .mockResolvedValue({ A: {} });
    const repo = createMusicRepo(createMemoryStore(), fetchMusic, () => time);
    expect(await repo.resolve(['A'])).toEqual({});
    time = 30_000;
    expect(await repo.resolve(['A'])).toEqual({});
    expect(fetchMusic).toHaveBeenCalledTimes(1);
    time = 61_000;
    expect(await repo.resolve(['A'])).toEqual({ A: {} });
    expect(fetchMusic).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2 : lancer les tests, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/core/music`
Expected: FAIL (modules introuvables).

- [ ] **Step 3 : écrire le code**

`src/core/music/music-kinds.ts` :

```ts
import type { CardKinds } from '../kinds/wikidata-kinds';

export type MusicKind = 'track' | 'album' | 'artist';

// Natures Wikidata d'une œuvre musicale : chanson, single, composition ; albums (studio, live, compilation, EP).
const TRACK = new Set(['Q7366', 'Q134556', 'Q105543609']);
const ALBUM = new Set(['Q482994', 'Q208569', 'Q209939', 'Q222910']);
// Groupe musical ; ou personne dont un métier est musical (chanteur, musicien, compositeur, rappeur, DJ, guitariste…).
const BAND = new Set(['Q215380']);
const HUMAN = 'Q5';
const MUSIC_OCCUPATIONS = new Set(['Q177220', 'Q639669', 'Q36834', 'Q488205', 'Q2252262', 'Q130857', 'Q855091', 'Q386854', 'Q158852']);

// Ce qu'on peut écouter d'une carte : son morceau, son album ou ses titres ; null si ce n'est pas de la musique.
export function musicKindOf(kinds: CardKinds | undefined): MusicKind | null {
  if (!kinds) return null;
  if (kinds.natures.some((id) => ALBUM.has(id))) return 'album';
  if (kinds.natures.some((id) => TRACK.has(id))) return 'track';
  if (kinds.natures.some((id) => BAND.has(id))) return 'artist';
  if (kinds.natures.includes(HUMAN) && kinds.occupations.some((id) => MUSIC_OCCUPATIONS.has(id))) return 'artist';
  return null;
}
```

`src/core/music/wikidata-music.ts` :

```ts
import { z } from 'zod';
import { getJson, parseWikibaseItems, usableClaims, type FetchLike } from '../birth/wikidata-birth';
import { parseLabels } from '../kinds/wikidata-kinds';
import { slugToTitle } from '../market/market-book';

// Identifiants Spotify (base 62, 22 caractères) et libellé de l'interprète ; rien n'est inventé : champ absent = inconnu.
export type CardMusic = { trackId?: string; albumId?: string; artistId?: string; performer?: string };
type ItemMusic = { trackId?: string; albumId?: string; artistId?: string; performerQid?: string };

const WIKIPEDIA = 'https://fr.wikipedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

const claimsResponse = z.object({
  entities: z.record(z.string(), z.object({ claims: z.record(z.string(), z.unknown()).optional() })),
});
const spotifyId = z.string().regex(/^[0-9A-Za-z]{22}$/);
const entityValue = z.object({ id: z.string().regex(/^Q\d+$/) });

function firstSpotifyId(claims: Record<string, unknown>, property: string): string | undefined {
  for (const claim of usableClaims(claims, property)) {
    const parsed = spotifyId.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

function firstEntity(claims: Record<string, unknown>, property: string): string | undefined {
  for (const claim of usableClaims(claims, property)) {
    const parsed = entityValue.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success) return parsed.data.id;
  }
  return undefined;
}

// Un format inattendu lève : il ne doit pas être enregistré comme « pas de valeur ».
export function parseCardMusic(json: unknown): Record<string, ItemMusic> {
  const parsed = claimsResponse.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const result: Record<string, ItemMusic> = {};
  for (const [id, entity] of Object.entries(parsed.data.entities)) {
    const claims = entity.claims ?? {};
    const trackId = firstSpotifyId(claims, 'P2207');
    const albumId = firstSpotifyId(claims, 'P2205');
    const artistId = firstSpotifyId(claims, 'P1902');
    const performerQid = firstEntity(claims, 'P175');
    result[id] = {
      ...(trackId ? { trackId } : {}),
      ...(albumId ? { albumId } : {}),
      ...(artistId ? { artistId } : {}),
      ...(performerQid ? { performerQid } : {}),
    };
  }
  return result;
}

// Un lot d'articles (50 au plus) : élément Wikidata, valeurs, puis libellé des interprètes.
// Seuls les titres sont envoyés : aucune donnée du jeu ni du compte.
export async function fetchWikidataMusic(fetchFn: FetchLike, slugs: string[]): Promise<Record<string, CardMusic>> {
  const titles = slugs.map(slugToTitle);
  const pagesJson = await getJson(
    fetchFn,
    WIKIPEDIA,
    { action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1', formatversion: '2', titles: titles.join('|') },
    'Wikipédia',
  );
  const items = parseWikibaseItems(pagesJson, titles);
  const itemIds = [...new Set(Object.values(items).filter((id): id is string => id !== null))];
  const byItem =
    itemIds.length > 0
      ? parseCardMusic(await getJson(fetchFn, WIKIDATA, { action: 'wbgetentities', props: 'claims', ids: itemIds.join('|') }, 'Wikidata'))
      : {};

  const performerIds = [...new Set(Object.values(byItem).flatMap((item) => (item.performerQid ? [item.performerQid] : [])))];
  const labels =
    performerIds.length > 0
      ? parseLabels(
          await getJson(fetchFn, WIKIDATA, { action: 'wbgetentities', props: 'labels', languages: 'fr|en', ids: performerIds.join('|') }, 'Wikidata'),
        )
      : {};

  const result: Record<string, CardMusic> = {};
  slugs.forEach((slug, index) => {
    const item = byItem[items[titles[index] ?? ''] ?? ''];
    const performer = item?.performerQid ? labels[item.performerQid] : undefined;
    result[slug] = {
      ...(item?.trackId ? { trackId: item.trackId } : {}),
      ...(item?.albumId ? { albumId: item.albumId } : {}),
      ...(item?.artistId ? { artistId: item.artistId } : {}),
      ...(performer ? { performer } : {}),
    };
  });
  return result;
}
```

`src/core/music/music-repo.ts` :

```ts
import type { KeyValueStore } from '../cache/store';
import type { CardMusic } from './wikidata-music';

export type MusicState = Record<string, CardMusic>;
export type MusicFetcher = (slugs: string[]) => Promise<Record<string, CardMusic>>;

const KEY = 'music-v1';
// Après un échec (429, hors ligne), on laisse Wikidata respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

export function createMusicRepo(store: KeyValueStore, fetchMusic: MusicFetcher, now: () => number = () => Date.now()) {
  // Lectures et écritures sérialisées.
  let tail: Promise<unknown> = Promise.resolve();
  let failedAt: number | undefined;

  const read = async (): Promise<MusicState> => (await store.get<MusicState>(KEY)) ?? {};

  return {
    load: read,

    // Interroge Wikidata pour les articles jamais vus (un article sans valeur est mémorisé vide) ; rend l'état à jour.
    resolve(slugs: string[]): Promise<MusicState> {
      const run = tail.then(async () => {
        const state = await read();
        const missing = slugs.filter((slug) => !Object.prototype.hasOwnProperty.call(state, slug));
        if (missing.length === 0) return state;
        if (failedAt !== undefined && now() - failedAt < COOLDOWN_MS) return state;
        try {
          const next = { ...state, ...(await fetchMusic(missing)) };
          await store.set(KEY, next);
          return next;
        } catch (error) {
          console.warn('[wikimasters-tools]', 'musique Wikidata indisponible :', error);
          failedAt = now();
          return state;
        }
      });
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

export type MusicRepo = ReturnType<typeof createMusicRepo>;
```

- [ ] **Step 4 : lancer les tests, vérifier le succès**

Run: `node node_modules/vitest/vitest.mjs run tests/core/music`
Expected: PASS. Si `parseLabels` n'est pas exporté depuis `wikidata-kinds.ts`, il l'est déjà (vérifié : `export function parseLabels`).

- [ ] **Step 5 : commit**

```bash
git add src/core/music tests/core/music
git commit -m "feat: lecture Wikidata de la musique (interprète, identifiants Spotify)"
```

---

### Task 5 : Résolution d'une carte en pistes à lire

**Files :**
- Create: `src/core/music/listen.ts`
- Test: `tests/core/music/listen.test.ts`

**Interfaces :**
- Consumes: `MusicKind`, `CardMusic`, `SpotifyApi` (`searchTracks`, `searchAlbum`, `albumTracks`), `Track`.
- Produces:
  - `type Listen = { kind: MusicKind; items: Track[]; albumUri?: string }`
  - `resolveListen(api: Pick<SpotifyApi, 'searchTracks' | 'searchAlbum' | 'albumTracks'>, input: { title: string; kind: MusicKind; music: CardMusic }): Promise<Listen | null>`
  - `cleanTitle(title: string): string` (retire « (chanson) », « (album) » en fin de titre, remplace `_` par espace)

- [ ] **Step 1 : écrire le test**

`tests/core/music/listen.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { cleanTitle, resolveListen } from '../../../src/core/music/listen';

const found = (title: string, artists: { id: string; name: string }[]) => ({
  uri: `spotify:track:${title}`,
  title,
  artist: artists.map((a) => a.name).join(', '),
  artistIds: artists.map((a) => a.id),
  artists: artists.map((a) => a.name),
});

function api(overrides: Partial<Record<'searchTracks' | 'searchAlbum' | 'albumTracks', ReturnType<typeof vi.fn>>> = {}) {
  return {
    searchTracks: vi.fn(async () => []),
    searchAlbum: vi.fn(async () => null),
    albumTracks: vi.fn(async () => []),
    ...overrides,
  } as never;
}

describe('cleanTitle', () => {
  it('retire la précision entre parenthèses et les soulignés', () => {
    expect(cleanTitle('Yesterday_(chanson)')).toBe('Yesterday');
    expect(cleanTitle('Abbey Road (album)')).toBe('Abbey Road');
    expect(cleanTitle('Queen')).toBe('Queen');
  });
});

describe('resolveListen', () => {
  it("morceau avec identifiant Spotify : pas d'appel à l'API, titre de la carte", async () => {
    const deps = api();
    const listen = await resolveListen(deps, { title: 'Yesterday (chanson)', kind: 'track', music: { trackId: 'T'.repeat(22), performer: 'The Beatles' } });
    expect(listen).toEqual({ kind: 'track', items: [{ uri: `spotify:track:${'T'.repeat(22)}`, title: 'Yesterday', artist: 'The Beatles' }] });
    expect(deps.searchTracks).not.toHaveBeenCalled();
  });

  it('morceau sans identifiant : recherche titre + interprète, premier résultat', async () => {
    const searchTracks = vi.fn(async () => [found('Yesterday', [{ id: 'a', name: 'The Beatles' }])]);
    const listen = await resolveListen(api({ searchTracks }), { title: 'Yesterday', kind: 'track', music: { performer: 'The Beatles' } });
    expect(searchTracks).toHaveBeenCalledWith('track:"Yesterday" artist:"The Beatles"', 1);
    expect(listen?.items).toEqual([{ uri: 'spotify:track:Yesterday', title: 'Yesterday', artist: 'The Beatles' }]);
  });

  it('morceau sans identifiant ni interprète : rien à lire', async () => {
    expect(await resolveListen(api(), { title: 'Yesterday', kind: 'track', music: {} })).toBeNull();
  });

  it("album : toutes les pistes, avec le contexte de l'album", async () => {
    const albumTracks = vi.fn(async () => [{ uri: 'spotify:track:1', title: 'Come Together', artist: 'The Beatles' }]);
    const listen = await resolveListen(api({ albumTracks }), { title: 'Abbey Road', kind: 'album', music: { albumId: 'A'.repeat(22) } });
    expect(albumTracks).toHaveBeenCalledWith('A'.repeat(22));
    expect(listen).toEqual({ kind: 'album', items: [{ uri: 'spotify:track:1', title: 'Come Together', artist: 'The Beatles' }], albumUri: `spotify:album:${'A'.repeat(22)}` });
  });

  it("album sans identifiant : recherche de l'album par titre et interprète, ou rien", async () => {
    const searchAlbum = vi.fn(async () => 'B'.repeat(22));
    const albumTracks = vi.fn(async () => [{ uri: 'spotify:track:1', title: 'x', artist: 'y' }]);
    const listen = await resolveListen(api({ searchAlbum, albumTracks }), { title: 'Abbey Road', kind: 'album', music: { performer: 'The Beatles' } });
    expect(searchAlbum).toHaveBeenCalledWith('Abbey Road', 'The Beatles');
    expect(listen?.albumUri).toBe(`spotify:album:${'B'.repeat(22)}`);
    expect(await resolveListen(api(), { title: 'Abbey Road', kind: 'album', music: { performer: 'The Beatles' } })).toBeNull();
    expect(await resolveListen(api(), { title: 'Abbey Road', kind: 'album', music: {} })).toBeNull();
  });

  it("artiste : 10 titres de lui seul (les reprises par d'autres sont écartées)", async () => {
    const searchTracks = vi.fn(async () => [
      found('Bohemian Rhapsody', [{ id: 'q', name: 'Queen' }]),
      found('Reprise', [{ id: 'z', name: 'Autre' }]),
      found('Under Pressure', [{ id: 'q', name: 'Queen' }, { id: 'd', name: 'David Bowie' }]),
    ]);
    const listen = await resolveListen(api({ searchTracks }), { title: 'Queen_(groupe)', kind: 'artist', music: {} });
    expect(searchTracks).toHaveBeenCalledWith('artist:"Queen"', 10);
    expect(listen?.items.map((item) => item.title)).toEqual(['Bohemian Rhapsody', 'Under Pressure']);
    expect(listen?.albumUri).toBeUndefined();
  });

  it("artiste avec identifiant Spotify : on filtre sur l'identifiant", async () => {
    const searchTracks = vi.fn(async () => [found('A', [{ id: 'q', name: 'Queen' }]), found('B', [{ id: 'other', name: 'Queen' }])]);
    const listen = await resolveListen(api({ searchTracks }), { title: 'Queen', kind: 'artist', music: { artistId: 'q' } });
    expect(listen?.items.map((item) => item.title)).toEqual(['A']);
  });

  it('artiste sans aucun titre trouvé : rien à lire', async () => {
    expect(await resolveListen(api(), { title: 'Inconnu', kind: 'artist', music: {} })).toBeNull();
  });

  it('retire les guillemets du titre dans les requêtes', async () => {
    const searchTracks = vi.fn(async () => []);
    await resolveListen(api({ searchTracks }), { title: 'Say "Hello"', kind: 'track', music: { performer: 'X' } });
    expect(searchTracks).toHaveBeenCalledWith('track:"Say Hello" artist:"X"', 1);
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/core/music/listen.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : écrire le code**

`src/core/music/listen.ts` :

```ts
import type { SpotifyApi, Track } from '../spotify/spotify-api';
import type { MusicKind } from './music-kinds';
import type { CardMusic } from './wikidata-music';

export type Listen = { kind: MusicKind; items: Track[]; albumUri?: string };

// « Yesterday_(chanson) » → « Yesterday » : la précision de Wikipédia nuit à la recherche Spotify.
export const cleanTitle = (title: string): string =>
  title.replaceAll('_', ' ').replace(/\s*\([^)]*\)\s*$/, '').trim();

// Les guillemets casseraient la requête de recherche.
const quoted = (text: string): string => text.replaceAll('"', '').trim();
const normalize = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

type Api = Pick<SpotifyApi, 'searchTracks' | 'searchAlbum' | 'albumTracks'>;

// Ce qu'on peut écouter d'une carte : l'identifiant Spotify de Wikidata d'abord, sinon une recherche titre + interprète.
export async function resolveListen(api: Api, input: { title: string; kind: MusicKind; music: CardMusic }): Promise<Listen | null> {
  const { kind, music } = input;
  const title = quoted(cleanTitle(input.title));

  if (kind === 'track') {
    if (music.trackId) {
      return { kind, items: [{ uri: `spotify:track:${music.trackId}`, title, artist: music.performer ?? '' }] };
    }
    if (!music.performer) return null;
    const [first] = await api.searchTracks(`track:"${title}" artist:"${quoted(music.performer)}"`, 1);
    return first ? { kind, items: [{ uri: first.uri, title: first.title, artist: first.artist }] } : null;
  }

  if (kind === 'album') {
    const albumId = music.albumId ?? (music.performer ? await api.searchAlbum(title, quoted(music.performer)) : null);
    if (!albumId) return null;
    const items = await api.albumTracks(albumId);
    return items.length > 0 ? { kind, items, albumUri: `spotify:album:${albumId}` } : null;
  }

  // Artiste : ses titres les plus pertinents pour Spotify (le classement officiel n'est plus disponible).
  const found = await api.searchTracks(`artist:"${title}"`, 10);
  const wanted = normalize(title);
  const own = found.filter((track) => (music.artistId ? track.artistIds.includes(music.artistId) : track.artists.some((name) => normalize(name) === wanted)));
  return own.length > 0 ? { kind, items: own.map(({ uri, title: name, artist }) => ({ uri, title: name, artist })) } : null;
}
```

- [ ] **Step 4 : lancer le test, vérifier le succès**

Run: `node node_modules/vitest/vitest.mjs run tests/core/music`
Expected: PASS.

- [ ] **Step 5 : commit**

```bash
git add src/core/music/listen.ts tests/core/music/listen.test.ts
git commit -m "feat: résolution d'une carte musique en pistes Spotify"
```

---

### Task 6 : Service « Écouter » et source du mini-lecteur

**Files :**
- Create: `src/content/music-service.ts`, `src/content/player-source.ts`, `src/content/music-registry.ts`
- Test: `tests/content/music-service.test.ts`, `tests/content/player-source.test.ts`

**Interfaces :**
- Consumes: `KnownCard`, `KindsRepo` (`resolveMissing`, `load`), `MusicRepo` (`resolve`), `SpotifySession` (`isLinked`, `link`, `unlink`, `subscribe`), `SpotifyApi` (`play`, `pause`, `playerState`, + ceux de `resolveListen`), `musicKindOf`, `resolveListen`, `Listen`, `userMessage`, `SpotifyError`.
- Produces:
  - `type ListenView = { status: 'none' } | { status: 'unlinked' } | { status: 'ready'; listen: Listen } | { status: 'error'; message: string }`
  - `createMusicService(deps): { view(slug: string, title: string): Promise<ListenView>; play(item: Track, listen: Listen): Promise<string | null>; link(): Promise<string | null>; unlink(): Promise<void>; subscribe(listener: () => void): () => void }` (`play`/`link` rendent `null` si tout va bien, sinon le message à afficher)
  - `type MusicService = ReturnType<typeof createMusicService>`
  - `type PlayerView = { linked: boolean; track: { title: string; artist: string; imageUrl: string | null; playing: boolean } | null; hidden: boolean }`
  - `createPlayerSource(deps): { current(): PlayerView; subscribe(l): () => void; start(): void; stop(): void; refresh(): Promise<void>; toggle(): Promise<void>; setHidden(hidden: boolean): void }`
  - `setMusicService(service: MusicService | null)`, `getMusicService(): MusicService | null` (registre)

- [ ] **Step 1 : écrire les tests**

`tests/content/music-service.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMusicService } from '../../src/content/music-service';
import { SpotifyError } from '../../src/core/spotify/errors';

const card = (slug: string) => ({ slug, title: slug });

function setup(over: { linked?: boolean; collection?: string[]; natures?: string[]; music?: Record<string, object> } = {}) {
  const api = {
    searchTracks: vi.fn(async () => []),
    searchAlbum: vi.fn(async () => null),
    albumTracks: vi.fn(async () => [{ uri: 'spotify:track:1', title: 'Come Together', artist: 'The Beatles' }]),
    play: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
  };
  const session = {
    isLinked: vi.fn(async () => over.linked ?? true),
    link: vi.fn(async () => undefined),
    unlink: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
  };
  const service = createMusicService({
    collection: { list: async () => (over.collection ?? ['Abbey_Road']).map(card) },
    kinds: {
      resolveMissing: vi.fn(async () => undefined),
      load: async () => ({ cards: { Abbey_Road: { natures: over.natures ?? ['Q482994'], occupations: [], genres: [] } }, labels: {} }),
    },
    music: { resolve: async () => ({ Abbey_Road: { albumId: 'A'.repeat(22), ...(over.music?.Abbey_Road ?? {}) } }) },
    session,
    api: api as never,
    onPlayed: vi.fn(),
  });
  return { service, api, session };
}

describe('createMusicService.view', () => {
  it('rend les pistes pour une carte album de la collection quand le compte est lié', async () => {
    const { service } = setup();
    const view = await service.view('Abbey_Road', 'Abbey Road');
    expect(view).toMatchObject({ status: 'ready', listen: { kind: 'album', albumUri: `spotify:album:${'A'.repeat(22)}` } });
  });

  it('rend none pour une carte hors collection ou non musicale', async () => {
    expect(await setup({ collection: [] }).service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'none' });
    expect(await setup({ natures: ['Q11424'] }).service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'none' });
  });

  it("rend unlinked sans appel à Spotify quand le compte n'est pas lié", async () => {
    const { service, api } = setup({ linked: false });
    expect(await service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'unlinked' });
    expect(api.albumTracks).not.toHaveBeenCalled();
  });

  it('rend none quand rien ne se retrouve sur Spotify, et error avec un message en cas de panne', async () => {
    const empty = setup();
    empty.api.albumTracks.mockResolvedValueOnce([]);
    expect(await empty.service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'none' });

    const down = setup();
    down.api.albumTracks.mockRejectedValueOnce(new SpotifyError('rate-limited', 'x', 1000));
    expect(await down.service.view('Abbey_Road', 'Abbey Road')).toEqual({
      status: 'error',
      message: 'Spotify demande de patienter un instant. Réessaie dans quelques secondes.',
    });
  });
});

describe('createMusicService.play', () => {
  const track = { uri: 'spotify:track:1', title: 'Come Together', artist: 'The Beatles' };

  it('lance une piste d’album dans son contexte et prévient le lecteur', async () => {
    const { service, api } = setup();
    expect(await service.play(track, { kind: 'album', items: [track], albumUri: 'spotify:album:AAA' })).toBeNull();
    expect(api.play).toHaveBeenCalledWith({ contextUri: 'spotify:album:AAA', offsetUri: 'spotify:track:1' });
  });

  it('lance un morceau seul', async () => {
    const { service, api } = setup();
    await service.play(track, { kind: 'artist', items: [track] });
    expect(api.play).toHaveBeenCalledWith({ uris: ['spotify:track:1'] });
  });

  it("rend le message d'erreur, par exemple sans appareil", async () => {
    const { service, api } = setup();
    api.play.mockRejectedValueOnce(new SpotifyError('no-device', 'x'));
    expect(await service.play(track, { kind: 'track', items: [track] })).toBe('Ouvre Spotify sur un de tes appareils, puis réessaie.');
  });
});

describe('createMusicService.link', () => {
  it('lie le compte, ou rend le message de refus', async () => {
    const { service, session } = setup();
    expect(await service.link()).toBeNull();
    session.link.mockRejectedValueOnce(new SpotifyError('auth-cancelled', 'x'));
    expect(await service.link()).toBe('Liaison Spotify annulée.');
  });
});
```

`tests/content/player-source.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createPlayerSource } from '../../src/content/player-source';
import { SpotifyError } from '../../src/core/spotify/errors';

const playing = { playing: true, title: 'Something', artist: 'The Beatles', imageUrl: null };

function setup(over: { linked?: boolean; hidden?: string | null } = {}) {
  const scheduled: { fn: () => void; ms: number }[] = [];
  const stored = new Map<string, string>(over.hidden ? [['wmt:spotifyPlayerHidden', over.hidden]] : []);
  const api = {
    playerState: vi.fn(async () => playing as typeof playing | null),
    play: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
  };
  let linked = over.linked ?? true;
  const listeners = new Set<() => void>();
  const session = {
    isLinked: async () => linked,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  const source = createPlayerSource({
    api,
    session,
    storage: { getItem: (k) => stored.get(k) ?? null, setItem: (k, v) => void stored.set(k, v) },
    schedule: (fn, ms) => {
      const entry = { fn, ms };
      scheduled.push(entry);
      return () => void scheduled.splice(scheduled.indexOf(entry), 1);
    },
  });
  return { source, api, scheduled, stored, setLinked: (value: boolean) => { linked = value; listeners.forEach((l) => l()); } };
}

describe('createPlayerSource', () => {
  it('commence masqué selon la valeur mémorisée, et mémorise le choix', () => {
    const { source, stored } = setup({ hidden: '1' });
    expect(source.current().hidden).toBe(true);
    source.setHidden(false);
    expect(source.current().hidden).toBe(false);
    expect(stored.get('wmt:spotifyPlayerHidden')).toBe('0');
  });

  it("interroge l'état puis reprogramme : 5 s en lecture, 15 s sinon", async () => {
    const { source, api, scheduled } = setup();
    source.start();
    await vi.waitFor(() => expect(source.current().track).toEqual({ title: 'Something', artist: 'The Beatles', imageUrl: null, playing: true }));
    expect(source.current().linked).toBe(true);
    expect(scheduled.at(-1)?.ms).toBe(5000);
    api.playerState.mockResolvedValueOnce({ ...playing, playing: false });
    scheduled.at(-1)!.fn();
    await vi.waitFor(() => expect(source.current().track?.playing).toBe(false));
    expect(scheduled.at(-1)?.ms).toBe(15000);
  });

  it("n'interroge pas Spotify quand le compte n'est pas lié, et démarre à la liaison", async () => {
    const { source, api, setLinked } = setup({ linked: false });
    source.start();
    await vi.waitFor(() => expect(source.current().linked).toBe(false));
    expect(api.playerState).not.toHaveBeenCalled();
    setLinked(true);
    await vi.waitFor(() => expect(api.playerState).toHaveBeenCalled());
  });

  it('attend la durée demandée après un 429, et efface le lecteur si le compte est délié', async () => {
    const { source, api, scheduled, setLinked } = setup();
    api.playerState.mockRejectedValueOnce(new SpotifyError('rate-limited', 'x', 8000));
    source.start();
    await vi.waitFor(() => expect(scheduled.at(-1)?.ms).toBe(8000));
    setLinked(false);
    await vi.waitFor(() => expect(source.current()).toMatchObject({ linked: false, track: null }));
  });

  it('bascule lecture/pause selon l’état courant', async () => {
    const { source, api } = setup();
    source.start();
    await vi.waitFor(() => expect(source.current().track?.playing).toBe(true));
    await source.toggle();
    expect(api.pause).toHaveBeenCalled();
    api.playerState.mockResolvedValue({ ...playing, playing: false });
    await source.refresh();
    await source.toggle();
    expect(api.play).toHaveBeenCalledWith(null);
  });

  it("arrête le sondage à l'arrêt", async () => {
    const { source, scheduled } = setup();
    source.start();
    await vi.waitFor(() => expect(scheduled).toHaveLength(1));
    source.stop();
    expect(scheduled).toHaveLength(0);
  });
});
```

- [ ] **Step 2 : lancer les tests, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/content/music-service.test.ts tests/content/player-source.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 3 : écrire le code**

`src/content/music-service.ts` :

```ts
import type { KnownCard } from '../core/collection/collection-book';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { resolveListen, type Listen } from '../core/music/listen';
import { musicKindOf } from '../core/music/music-kinds';
import type { MusicRepo } from '../core/music/music-repo';
import { userMessage } from '../core/spotify/errors';
import type { SpotifyApi, Track } from '../core/spotify/spotify-api';
import type { SpotifySession } from '../core/spotify/spotify-session';

export type ListenView =
  | { status: 'none' }
  | { status: 'unlinked' }
  | { status: 'ready'; listen: Listen }
  | { status: 'error'; message: string };

export type MusicServiceDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  music: Pick<MusicRepo, 'resolve'>;
  session: Pick<SpotifySession, 'isLinked' | 'link' | 'unlink' | 'subscribe'>;
  api: Pick<SpotifyApi, 'searchTracks' | 'searchAlbum' | 'albumTracks' | 'play'>;
  // Après un lancement : le mini-lecteur relit l'état tout de suite.
  onPlayed: () => void;
};

export function createMusicService(deps: MusicServiceDeps) {
  const { collection, kinds, music, session, api, onPlayed } = deps;

  return {
    // Ce que la fiche d'une carte propose d'écouter : rien, lier le compte, des pistes, ou une erreur.
    async view(slug: string, title: string): Promise<ListenView> {
      try {
        if (!(await collection.list()).some((card) => card.slug === slug)) return { status: 'none' };
        await kinds.resolveMissing([slug]);
        const kind = musicKindOf((await kinds.load()).cards[slug]);
        if (!kind) return { status: 'none' };
        if (!(await session.isLinked())) return { status: 'unlinked' };
        const cardMusic = (await music.resolve([slug]))[slug] ?? {};
        const listen = await resolveListen(api, { title, kind, music: cardMusic });
        return listen ? { status: 'ready', listen } : { status: 'none' };
      } catch (error) {
        return { status: 'error', message: userMessage(error) };
      }
    },

    // Lance une piste ; rend null si tout va bien, sinon le message à afficher.
    async play(item: Track, listen: Listen): Promise<string | null> {
      try {
        await api.play(listen.albumUri ? { contextUri: listen.albumUri, offsetUri: item.uri } : { uris: [item.uri] });
        onPlayed();
        return null;
      } catch (error) {
        return userMessage(error);
      }
    },

    async link(): Promise<string | null> {
      try {
        await session.link();
        return null;
      } catch (error) {
        return userMessage(error);
      }
    },

    unlink: () => session.unlink(),
    subscribe: (listener: () => void) => session.subscribe(listener),
  };
}

export type MusicService = ReturnType<typeof createMusicService>;
```

`src/content/music-registry.ts` :

```ts
import type { MusicService } from './music-service';

// Le service musique est créé une fois par la surcouche ; les fiches de carte (CardPopup) le lisent ici.
let service: MusicService | null = null;

export const setMusicService = (next: MusicService | null): void => {
  service = next;
};
export const getMusicService = (): MusicService | null => service;
```

`src/content/player-source.ts` :

```ts
import { SpotifyError } from '../core/spotify/errors';
import type { SpotifyApi } from '../core/spotify/spotify-api';
import type { SpotifySession } from '../core/spotify/spotify-session';

export type PlayerTrack = { title: string; artist: string; imageUrl: string | null; playing: boolean };
export type PlayerView = { linked: boolean; track: PlayerTrack | null; hidden: boolean };

const HIDDEN_KEY = 'wmt:spotifyPlayerHidden';
const PLAYING_MS = 5_000;
const IDLE_MS = 15_000;

export type PlayerSourceDeps = {
  api: Pick<SpotifyApi, 'playerState' | 'play' | 'pause'>;
  session: Pick<SpotifySession, 'isLinked' | 'subscribe'>;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  // Programme `fn` dans `ms` ; rend la fonction qui l'annule.
  schedule?: (fn: () => void, ms: number) => () => void;
};

const realSchedule = (fn: () => void, ms: number) => {
  const id = window.setTimeout(fn, ms);
  return () => window.clearTimeout(id);
};

export function createPlayerSource(deps: PlayerSourceDeps) {
  const { api, session, storage, schedule = realSchedule } = deps;
  const listeners = new Set<() => void>();
  let cancel: (() => void) | null = null;
  let unsubscribe: (() => void) | null = null;
  let running = false;

  let hidden = false;
  try {
    hidden = storage.getItem(HIDDEN_KEY) === '1';
  } catch {
    // Stockage inaccessible : lecteur visible.
  }
  let view: PlayerView = { linked: false, track: null, hidden };

  const set = (next: Partial<PlayerView>) => {
    view = { ...view, ...next };
    listeners.forEach((listener) => listener());
  };

  // Un tour : lit l'état, puis reprogramme selon ce qu'on a vu.
  async function poll(): Promise<void> {
    cancel?.();
    cancel = null;
    let wait = IDLE_MS;
    try {
      if (!(await session.isLinked())) {
        set({ linked: false, track: null });
        return;
      }
      const state = await api.playerState();
      set({ linked: true, track: state });
      wait = state?.playing ? PLAYING_MS : IDLE_MS;
    } catch (error) {
      if (error instanceof SpotifyError && error.code === 'not-linked') {
        set({ linked: false, track: null });
        return;
      }
      if (error instanceof SpotifyError && error.code === 'rate-limited') wait = error.retryAfterMs ?? wait;
    }
    if (running) cancel = schedule(() => void poll(), wait);
  }

  return {
    current: (): PlayerView => view,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    start(): void {
      if (running) return;
      running = true;
      // Une liaison ou une déliaison relance ou arrête le sondage aussitôt.
      unsubscribe = session.subscribe(() => void poll());
      void poll();
    },
    stop(): void {
      running = false;
      cancel?.();
      cancel = null;
      unsubscribe?.();
      unsubscribe = null;
    },
    refresh: poll,
    async toggle(): Promise<void> {
      try {
        if (view.track?.playing) await api.pause();
        else await api.play(null);
      } catch (error) {
        console.warn('[wikimasters-tools]', 'Spotify :', error);
      }
      await poll();
    },
    setHidden(next: boolean): void {
      try {
        storage.setItem(HIDDEN_KEY, next ? '1' : '0');
      } catch {
        // Préférence d'affichage : on garde le choix pour la page en cours seulement.
      }
      set({ hidden: next });
    },
  };
}

export type PlayerSource = ReturnType<typeof createPlayerSource>;
```

- [ ] **Step 4 : lancer les tests, vérifier le succès**

Run: `node node_modules/vitest/vitest.mjs run tests/content/music-service.test.ts tests/content/player-source.test.ts`
Expected: PASS. Si un test de `player-source` est instable à cause de l'ordre des promesses, utiliser `vi.waitFor` comme dans le test (déjà prévu), sans `setTimeout` réel.

- [ ] **Step 5 : commit**

```bash
git add src/content/music-service.ts src/content/music-registry.ts src/content/player-source.ts tests/content/music-service.test.ts tests/content/player-source.test.ts
git commit -m "feat: service « Écouter » et source du mini-lecteur Spotify"
```

---

### Task 7 : Interface (glyphes, section « Écouter », mini-lecteur, fiche de carte)

**Files :**
- Create: `src/content/Glyphs.tsx`, `src/content/ListenSection.tsx`, `src/content/SpotifyPlayer.tsx`, `src/content/mount-player.tsx`
- Modify: `src/content/CardPopup.tsx`, `src/content/HomemadePanel.tsx`, `src/content/WorldPanel.tsx`, `src/content/TimelinePanel.tsx`
- Test: aucun test unitaire de rendu (le dépôt teste la logique, pas le rendu React) ; vérification par `tsc` et build, puis manuelle en Task 10.

**Interfaces :**
- Consumes: `MusicService`, `ListenView`, `getMusicService`, `PlayerSource`, `PlayerView`, `Listen`, `Track`.
- Produces:
  - `Glyph` : `<Glyph name="play" | "pause" | "chevron-down" | "chevron-up" | "note" | "link" | "unlink" size?: number />`
  - `<ListenSection slug title onHeight />` : `onHeight(px: number)` prévient le parent de sa hauteur (pour replacer la fiche)
  - `<SpotifyPlayer source />`
  - `mountSpotifyPlayer(source: PlayerSource): void`
  - `CardPopup` : nouvelle prop facultative `slug?: string`

- [ ] **Step 1 : glyphes**

`src/content/Glyphs.tsx` :

```tsx
// Glyphes en ligne (trait, héritent la couleur du texte) : le texte tient mal sur mobile.
const PATHS = {
  play: <polygon points="7,4 20,12 7,20" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none" />
      <rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none" />
    </>
  ),
  'chevron-down': <polyline points="6,9 12,15 18,9" />,
  'chevron-up': <polyline points="6,15 12,9 18,15" />,
  note: (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  unlink: (
    <>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </>
  ),
} as const;

export type GlyphName = keyof typeof PATHS;

export function Glyph({ name, size = 18 }: { name: GlyphName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
```

- [ ] **Step 2 : section « Écouter »**

`src/content/ListenSection.tsx` :

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Track } from '../core/spotify/spotify-api';
import type { Listen } from '../core/music/listen';
import { Glyph } from './Glyphs';
import { getMusicService } from './music-registry';
import type { ListenView } from './music-service';

const SIZE = 44; // cible tactile
const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

const iconButton = {
  width: SIZE,
  height: SIZE,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  cursor: 'pointer',
  color: 'inherit',
  background: 'none',
  border,
  borderRadius: 8,
} as const;

type Props = { slug: string; title: string; onHeight: (px: number) => void };

// Section « Écouter » de la fiche d'une carte musique de la collection ; rien pour les autres cartes.
export function ListenSection({ slug, title, onHeight }: Props) {
  const service = getMusicService();
  const [view, setView] = useState<ListenView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    void service.view(slug, title).then((next) => !cancelled && setView(next));
    // Liaison ou déliaison pendant que la fiche est ouverte : on recharge.
    const off = service.subscribe(() => setVersion((value) => value + 1));
    return () => {
      cancelled = true;
      off();
    };
  }, [service, slug, title, version]);

  // La fiche se replace selon la hauteur réelle de la section.
  useLayoutEffect(() => {
    onHeight(view && view.status !== 'none' ? (ref.current?.offsetHeight ?? 0) : 0);
  }, [view, message, onHeight]);

  if (!service || !view || view.status === 'none') return null;

  const play = async (item: Track, listen: Listen) => setMessage(await service.play(item, listen));
  const link = async () => setMessage(await service.link());

  return (
    <div ref={ref} style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {view.status === 'unlinked' && (
        <button type="button" onClick={link} aria-label="Lier Spotify pour écouter" title="Lier Spotify pour écouter" style={{ ...iconButton, width: '100%', gap: 8, font: '600 13px system-ui, sans-serif' }}>
          <Glyph name="link" /> Spotify
        </button>
      )}
      {view.status === 'error' && <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{view.message}</p>}
      {view.status === 'ready' && (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 'min(160px, 25vh)', overflowY: 'auto' }}>
            {view.listen.items.map((item, index) => (
              <li key={item.uri} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: SIZE, borderBottom: border, fontSize: 13 }}>
                {view.listen.kind !== 'track' && <span style={{ width: 18, opacity: 0.6, fontSize: 11 }}>{index + 1}</span>}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title}
                  {view.listen.kind === 'artist' && item.artist && <span style={{ opacity: 0.6 }}> · {item.artist}</span>}
                </span>
                <button type="button" onClick={() => void play(item, view.listen)} aria-label={`Lire ${item.title}`} title={`Lire ${item.title}`} style={{ ...iconButton, width: 36, height: 36, borderRadius: '50%' }}>
                  <Glyph name="play" size={16} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => void service.unlink()} aria-label="Délier Spotify" title="Délier Spotify" style={{ ...iconButton, width: 28, height: 28, alignSelf: 'flex-end', opacity: 0.6 }}>
            <Glyph name="unlink" size={14} />
          </button>
        </>
      )}
      {message && <p role="status" style={{ margin: 0, fontSize: 12 }}>{message}</p>}
    </div>
  );
}
```

- [ ] **Step 3 : mini-lecteur**

`src/content/SpotifyPlayer.tsx` :

```tsx
import { useSyncExternalStore } from 'react';
import { Glyph } from './Glyphs';
import type { PlayerSource } from './player-source';

const BTN = 44; // cible tactile
const base = {
  width: BTN,
  height: BTN,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  cursor: 'pointer',
  color: 'inherit',
  background: 'none',
  border: 'none',
} as const;

export function SpotifyPlayer({ source }: { source: PlayerSource }) {
  const view = useSyncExternalStore(source.subscribe, source.current);
  // Visible seulement s'il y a une lecture à montrer.
  if (!view.linked || !view.track) return null;
  const { track } = view;
  const toggle = (
    <button type="button" onClick={() => void source.toggle()} aria-label={track.playing ? 'Pause' : 'Lecture'} title={track.playing ? 'Pause' : 'Lecture'} style={{ ...base, borderRadius: '50%', background: 'var(--color-accent, #34d399)', color: '#0d1117' }}>
      <Glyph name={track.playing ? 'pause' : 'play'} size={20} />
    </button>
  );
  const shell = {
    position: 'fixed',
    zIndex: 2147483000,
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
    display: 'flex',
    alignItems: 'center',
    borderRadius: 999,
    border: '1px solid var(--color-border, rgba(148,163,184,0.5))',
    background: 'var(--color-surface, #0d1117)',
    color: 'var(--color-foreground, #e6edf3)',
    font: '500 13px/1.2 system-ui, sans-serif',
  } as const;

  if (view.hidden) {
    return (
      <div style={{ ...shell, right: 12, paddingLeft: 8 }}>
        <Glyph name="note" size={16} />
        {toggle}
        <button type="button" onClick={() => source.setHidden(false)} aria-label="Afficher le lecteur" title="Afficher le lecteur" style={base}>
          <Glyph name="chevron-up" />
        </button>
      </div>
    );
  }
  return (
    <div style={{ ...shell, left: 12, right: 12, margin: '0 auto', maxWidth: 420, paddingLeft: 14 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{track.title}</div>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.65, fontSize: 11 }}>{track.artist}</div>
      </div>
      {toggle}
      <button type="button" onClick={() => source.setHidden(true)} aria-label="Masquer le lecteur" title="Masquer le lecteur" style={base}>
        <Glyph name="chevron-down" />
      </button>
    </div>
  );
}
```

`src/content/mount-player.tsx` :

```tsx
import { createRoot } from 'react-dom/client';
import { SpotifyPlayer } from './SpotifyPlayer';
import type { PlayerSource } from './player-source';

const PLAYER_HOST_ATTRIBUTE = 'data-wmt-spotify-player';

// Mini-lecteur monté une fois sur la page, hors du DOM du jeu (shadow DOM) ; il s'efface seul sans lecture.
export function mountSpotifyPlayer(source: PlayerSource): void {
  if (document.querySelector(`[${PLAYER_HOST_ATTRIBUTE}]`)) return;
  const host = document.createElement('div');
  host.setAttribute(PLAYER_HOST_ATTRIBUTE, '');
  const shadow = host.attachShadow({ mode: 'open' });
  const mountPoint = document.createElement('div');
  shadow.appendChild(mountPoint);
  document.body.appendChild(host);
  createRoot(mountPoint).render(<SpotifyPlayer source={source} />);
}
```

- [ ] **Step 4 : intégrer la section dans `CardPopup`**

Dans `src/content/CardPopup.tsx` :

1. Imports : ajouter `useState` à l'import de `react`, et `import { ListenSection } from './ListenSection';`.
2. Type `Props` : ajouter `// Slug de l'article : active la section « Écouter » des cartes musique de la collection.\n  slug?: string;`.
3. Signature : `export function CardPopup({ preview, anchor, slug, onOpen, onOpenCard, onClose }: Props) {`.
4. Après `closeRef.current = onClose;` ajouter :

```tsx
  // Hauteur de la section « Écouter » : réservée dans le calcul de l'échelle de la carte.
  const [listenHeight, setListenHeight] = useState(0);
```

5. Dans le premier calcul d'échelle, remplacer `(viewport.height - 2 * EDGE - 2 * PADDING - ROW_HEIGHT) / natural.height,` par `(viewport.height - 2 * EDGE - 2 * PADDING - ROW_HEIGHT - listenHeight) / natural.height,` et remplacer les dépendances `}, [anchor, preview]);` du second `useLayoutEffect` par `}, [anchor, preview, listenHeight]);`.
6. Fermeture au défilement : le défilement de la liste de pistes ne doit pas fermer la fiche. Remplacer `window.addEventListener('scroll', close, true);` par :

```tsx
    const onScroll = (event: Event) => {
      const el = ref.current;
      if (!el || !event.composedPath().includes(el)) close();
    };
    window.addEventListener('scroll', onScroll, true);
```

et `window.removeEventListener('scroll', close, true);` par `window.removeEventListener('scroll', onScroll, true);`.

7. Après la `<div style={{ display: 'flex', gap: ROW_GAP, marginTop: ROW_GAP }}>…</div>` des boutons, avant la fermeture du `div` racine, ajouter :

```tsx
      {slug && <ListenSection slug={slug} title={preview.title} onHeight={setListenHeight} />}
```

Dans `src/content/HomemadePanel.tsx` : sur `<CardPopup`, ajouter `slug={tip.slug}`. Dans `WorldPanel.tsx` : `slug={pickedCard.slug}`. Dans `TimelinePanel.tsx` : `slug={tipCard.slug}`.

Attention : `setListenHeight` est stable (setState), donc `onHeight` ne relance pas l'effet de `ListenSection` en boucle.

- [ ] **Step 5 : vérifier les types**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6 : lancer toute la suite de tests**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: PASS (aucun test existant cassé).

- [ ] **Step 7 : commit**

```bash
git add src/content
git commit -m "feat: section « Écouter » de la fiche et mini-lecteur Spotify"
```

---

### Task 8 : Câblage de la surcouche et extension (service worker, manifeste, identifiant Chrome)

**Files :**
- Create: `src/core/spotify/transport.ts`, `src/entrypoints/background.ts`, `src/app/extension-spotify.ts`, `scripts/chrome-extension-id.mjs`
- Modify: `src/app/overlay.ts`, `src/entrypoints/content.tsx`, `wxt.config.ts`
- Test: `tests/core/spotify/transport.test.ts`

**Interfaces :**
- Consumes: `SpotifyFetch`, `createSpotifySession`, `createSpotifyApi`, `createMusicRepo`, `fetchWikidataMusic`, `createMusicService`, `createPlayerSource`, `setMusicService`, `mountSpotifyPlayer`.
- Produces:
  - `type SpotifyEnv = { fetch: SpotifyFetch; authorize: (authUrl: string) => Promise<string>; redirectUri: () => Promise<string> }` (dans `transport.ts`)
  - `type SpotifyRequest`, `type SpotifyReply`, `handleSpotifyMessage(message: unknown, deps: BackgroundDeps): Promise<SpotifyReply> | null`, `createExtensionEnv(send: (request: SpotifyRequest) => Promise<SpotifyReply>): SpotifyEnv`
  - `startOverlay(store: KeyValueStore, spotify?: SpotifyEnv): Promise<void>`

- [ ] **Step 1 : écrire le test du protocole**

`tests/core/spotify/transport.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createExtensionEnv, handleSpotifyMessage, type BackgroundDeps, type SpotifyRequest } from '../../../src/core/spotify/transport';

const deps = (over: Partial<BackgroundDeps> = {}): BackgroundDeps => ({
  launchWebAuthFlow: vi.fn(async () => 'https://abc.chromiumapp.org/?code=C&state=S'),
  getRedirectUrl: () => 'https://abc.chromiumapp.org/',
  fetch: vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'Retry-After': '7' } })),
  ...over,
});

describe('handleSpotifyMessage', () => {
  it("ignore ce qui n'est pas pour Spotify", () => {
    expect(handleSpotifyMessage({ type: 'autre' }, deps())).toBeNull();
    expect(handleSpotifyMessage(null, deps())).toBeNull();
  });

  it("rend l'URL de retour de l'extension", async () => {
    expect(await handleSpotifyMessage({ type: 'wmt:spotify', op: 'redirect-uri' }, deps())).toEqual({ ok: true, value: 'https://abc.chromiumapp.org/' });
  });

  it("lance l'autorisation, seulement vers accounts.spotify.com", async () => {
    const d = deps();
    const url = 'https://accounts.spotify.com/authorize?client_id=x';
    expect(await handleSpotifyMessage({ type: 'wmt:spotify', op: 'auth', url }, d)).toEqual({ ok: true, value: 'https://abc.chromiumapp.org/?code=C&state=S' });
    expect(d.launchWebAuthFlow).toHaveBeenCalledWith(url);
    const refused = await handleSpotifyMessage({ type: 'wmt:spotify', op: 'auth', url: 'https://evil.example/authorize' }, d);
    expect(refused).toMatchObject({ ok: false });
    expect(d.launchWebAuthFlow).toHaveBeenCalledTimes(1);
  });

  it('relaie une requête vers api.spotify.com ou accounts.spotify.com, rien d’autre', async () => {
    const d = deps();
    const request: SpotifyRequest = { type: 'wmt:spotify', op: 'fetch', url: 'https://api.spotify.com/v1/me/player', init: { method: 'GET', headers: { Authorization: 'Bearer T' } } };
    expect(await handleSpotifyMessage(request, d)).toEqual({ ok: true, value: { status: 200, retryAfter: '7', body: '{"ok":true}' } });
    expect(await handleSpotifyMessage({ ...request, url: 'https://accounts.spotify.com/api/token' }, d)).toMatchObject({ ok: true });
    expect(await handleSpotifyMessage({ ...request, url: 'https://www.wiki-masters.com/api/x' }, d)).toMatchObject({ ok: false });
    expect(d.fetch).toHaveBeenCalledTimes(2);
  });

  it("rend l'erreur plutôt que de lever", async () => {
    const d = deps({ launchWebAuthFlow: vi.fn(async () => { throw new Error('annulé'); }) });
    expect(await handleSpotifyMessage({ type: 'wmt:spotify', op: 'auth', url: 'https://accounts.spotify.com/authorize?x=1' }, d)).toEqual({ ok: false, error: 'annulé' });
  });
});

describe('createExtensionEnv', () => {
  it('reconstitue une vraie Response, y compris sans corps (204)', async () => {
    const send = vi.fn(async (request: SpotifyRequest) =>
      request.op === 'fetch' ? ({ ok: true, value: { status: 204, retryAfter: null, body: '' } } as const) : ({ ok: true, value: 'https://abc.chromiumapp.org/' } as const),
    );
    const env = createExtensionEnv(send);
    const response = await env.fetch('https://api.spotify.com/v1/me/player', { method: 'GET', headers: { Authorization: 'Bearer T' } });
    expect(response.status).toBe(204);
    expect(await env.redirectUri()).toBe('https://abc.chromiumapp.org/');
  });

  it('transmet Retry-After et fait échouer une réponse en erreur', async () => {
    const env = createExtensionEnv(async (request) =>
      request.op === 'fetch' ? { ok: true, value: { status: 429, retryAfter: '3', body: '' } } : { ok: false, error: 'annulé' },
    );
    expect((await env.fetch('https://api.spotify.com/v1/x')).headers.get('Retry-After')).toBe('3');
    await expect(env.authorize('https://accounts.spotify.com/authorize?x=1')).rejects.toThrow('annulé');
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/core/spotify/transport.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : écrire le protocole**

`src/core/spotify/transport.ts` :

```ts
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
        if (typeof request.url !== 'string' || !FETCH_PREFIXES.some((prefix) => request.url!.startsWith(prefix))) {
          return { ok: false, error: 'adresse refusée' };
        }
        const response = await deps.fetch(request.url, request.init);
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
```

- [ ] **Step 4 : lancer le test, vérifier le succès**

Run: `node node_modules/vitest/vitest.mjs run tests/core/spotify`
Expected: PASS.

- [ ] **Step 5 : service worker et environnement de l'extension**

`src/entrypoints/background.ts` :

```ts
import { handleSpotifyMessage } from '../core/spotify/transport';

// Seul le service worker peut lancer `identity.launchWebAuthFlow` ; il fait aussi les appels à Spotify (hors des règles CSP du site).
export default defineBackground(() => {
  // Utile pour déclarer l'adresse de retour dans le tableau de bord Spotify (surtout sous Firefox).
  console.info('[wikimasters-tools]', 'adresse de retour Spotify :', browser.identity.getRedirectURL());

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const reply = handleSpotifyMessage(message, {
      launchWebAuthFlow: async (url) => {
        const returned = await browser.identity.launchWebAuthFlow({ url, interactive: true });
        if (!returned) throw new Error('liaison annulée');
        return returned;
      },
      getRedirectUrl: () => browser.identity.getRedirectURL(),
      fetch: (url, init) => fetch(url, init),
    });
    if (!reply) return false;
    void reply.then(sendResponse);
    // Réponse asynchrone.
    return true;
  });
});
```

`src/app/extension-spotify.ts` :

```ts
import { browser } from 'wxt/browser';
import { createExtensionEnv, type SpotifyEnv, type SpotifyRequest, type SpotifyReply } from '../core/spotify/transport';

// Spotify depuis l'extension : tout passe par le service worker (voir entrypoints/background.ts).
export const createChromeSpotifyEnv = (): SpotifyEnv =>
  createExtensionEnv((request: SpotifyRequest) => browser.runtime.sendMessage(request) as Promise<SpotifyReply>);
```

`src/entrypoints/content.tsx` :

```tsx
import { createChromeLocalStore } from '../core/cache/store';
import { startOverlay } from '../app/overlay';
import { createChromeSpotifyEnv } from '../app/extension-spotify';

export default defineContentScript({
  matches: ['https://www.wiki-masters.com/*'],
  async main() {
    await startOverlay(createChromeLocalStore(), createChromeSpotifyEnv());
  },
});
```

- [ ] **Step 6 : câbler `startOverlay`**

Dans `src/app/overlay.ts` :

1. Imports à ajouter :

```ts
import { createMusicRepo } from '../core/music/music-repo';
import { fetchWikidataMusic } from '../core/music/wikidata-music';
import { createSpotifyApi } from '../core/spotify/spotify-api';
import { createSpotifySession } from '../core/spotify/spotify-session';
import type { SpotifyEnv } from '../core/spotify/transport';
import { createMusicService } from '../content/music-service';
import { setMusicService } from '../content/music-registry';
import { createPlayerSource } from '../content/player-source';
import { mountSpotifyPlayer } from '../content/mount-player';
```

2. Signature : `export async function startOverlay(store: KeyValueStore, spotify?: SpotifyEnv): Promise<void> {`.

3. Le `createKindsRepo(...)` est aujourd'hui créé en ligne dans `createCollectionUi({...})`. Le sortir pour le partager : avant `const collectionUi = createCollectionUi({`, ajouter `const kindsRepo = createKindsRepo(store, (slugs) => fetchWikidataKinds((url) => fetch(url), slugs));` et remplacer la propriété `kinds: createKindsRepo(store, (slugs) => fetchWikidataKinds((url) => fetch(url), slugs)),` par `kinds: kindsRepo,`.

4. Juste après la création de `collectionUi` (avant `// Historique du marché chargé en mémoire`), ajouter :

```ts
  // Spotify : télécommande de l'appli Spotify (voir la spec). Absent si la plateforme ne le fournit pas.
  if (spotify) {
    const session = createSpotifySession({ store, ...spotify });
    const api = createSpotifyApi({ session, fetch: spotify.fetch });
    const player = createPlayerSource({ api, session, storage: window.localStorage });
    setMusicService(
      createMusicService({
        collection: collectionRepo,
        kinds: kindsRepo,
        music: createMusicRepo(store, (slugs) => fetchWikidataMusic((url) => fetch(url), slugs)),
        session,
        api,
        onPlayed: () => void player.refresh(),
      }),
    );
    mountSpotifyPlayer(player);
    player.start();
  }
```

(`spotify` contient `fetch`, `authorize`, `redirectUri` : `createSpotifySession({ store, ...spotify })` convient au type `SessionDeps`.)

- [ ] **Step 7 : manifeste, permissions et identifiant Chrome stable**

`scripts/chrome-extension-id.mjs` :

```js
// Génère une clé publique Chrome (champ `key` du manifeste) et l'identifiant d'extension qui en découle.
// L'identifiant devient stable d'une installation à l'autre : l'adresse de retour Spotify (https://<id>.chromiumapp.org/) ne change plus.
// Usage : node scripts/chrome-extension-id.mjs            → génère une paire, affiche la clé et l'identifiant
//         node scripts/chrome-extension-id.mjs <clé>      → affiche l'identifiant d'une clé existante
import { createHash, generateKeyPairSync } from 'node:crypto';

const given = process.argv[2];
let key = given;
if (!key) {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  key = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}
const digest = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
const id = [...digest].map((char) => String.fromCharCode('a'.charCodeAt(0) + parseInt(char, 16))).join('');
console.log(`key: ${key}`);
console.log(`id: ${id}`);
console.log(`redirect URI Spotify : https://${id}.chromiumapp.org/`);
```

Générer la clé et noter la sortie :

Run: `node scripts/chrome-extension-id.mjs`
Expected: trois lignes (`key:`, `id:`, `redirect URI Spotify :`). Copier la valeur de `key:` pour le manifeste, **ne pas** conserver de clé privée (non générée) : seule la clé publique est nécessaire. Garder l'adresse `redirect URI Spotify` pour la Task 10.

Dans `wxt.config.ts`, remplacer le bloc `manifest` par :

```ts
  manifest: ({ browser }) => ({
    name: 'Wikimasters Tools (non officiel)',
    description:
      'Outils en lecture seule pour WikiMasters : prix estimés à partir de vos propres transactions.',
    // `identity` : liaison du compte Spotify (écoute des cartes musique).
    permissions: ['storage', 'identity'],
    // Le service worker appelle Spotify (jamais le site du jeu).
    host_permissions: [
      'https://api.spotify.com/*',
      'https://accounts.spotify.com/*',
      // Firefox MV3 : l'accès au site est une permission d'hôte à accorder (demandée à l'installation).
      ...(browser === 'firefox' ? ['https://www.wiki-masters.com/*'] : []),
    ],
    // Chrome : clé publique qui fixe l'identifiant de l'extension (donc l'adresse de retour Spotify).
    ...(browser !== 'firefox' && { key: '<COLLER ICI LA VALEUR key: DU SCRIPT>' }),
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'wikimasters-tools-unofficial@maximus49000.github.io',
          // data_collection_permissions n'est reconnu qu'à partir de Firefox 140 (142 sur Android).
          strict_min_version: '140.0',
          // Champ exigé par addons.mozilla.org : l'extension ne collecte ni n'envoie de données personnelles.
          data_collection_permissions: { required: ['none'] },
        },
        gecko_android: { strict_min_version: '142.0' },
      },
    }),
  }),
```

Remplacer `<COLLER ICI LA VALEUR key: DU SCRIPT>` par la clé réelle affichée à l'étape précédente (chaîne base64, une seule ligne). Le mot « COLLER » ne doit pas rester dans le fichier.

- [ ] **Step 8 : vérifier types, tests et build**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: aucune erreur.

Run: `node node_modules/vitest/vitest.mjs run`
Expected: PASS.

Run: `node node_modules/wxt/bin/wxt.mjs build`
Expected: build Chrome réussi ; `.output/chrome-mv3/manifest.json` contient `"key"`, `identity`, et `background.js` existe. Puis `node node_modules/wxt/bin/wxt.mjs build -b firefox --mv3` : réussi, `manifest.json` sans `key`, avec les trois `host_permissions`.

- [ ] **Step 9 : commit**

```bash
git add src scripts wxt.config.ts tests
git commit -m "feat: Spotify dans l'extension (service worker, identity, câblage de la surcouche)"
```

---

### Task 9 : APK Android (pont Java, adresse de retour, câblage)

**Files :**
- Create: `src/android/spotify-env.ts`
- Modify: `src/android/entry.ts`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/io/github/maximus49000/wikimasterstools/MainActivity.java`
- Test: `tests/android/spotify-env.test.ts`

**Interfaces :**
- Consumes: `SpotifyEnv`, `ANDROID_REDIRECT_URI`.
- Produces: `createAndroidSpotifyEnv(win: AndroidWindow, timeoutMs?: number): SpotifyEnv` ; côté Java l'interface JavaScript `WmtSpotify.openAuth(String url)` et l'appel retour `window.__wmtSpotifyRedirect(url)`.

- [ ] **Step 1 : écrire le test**

`tests/android/spotify-env.test.ts` :

```ts
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
```

- [ ] **Step 2 : lancer le test, vérifier l'échec**

Run: `node node_modules/vitest/vitest.mjs run tests/android`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : écrire l'environnement APK**

`src/android/spotify-env.ts` :

```ts
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
```

- [ ] **Step 4 : lancer le test, vérifier le succès**

Run: `node node_modules/vitest/vitest.mjs run tests/android`
Expected: PASS.

- [ ] **Step 5 : câbler l'entrée Android**

Dans `src/android/entry.ts`, ajouter l'import `import { createAndroidSpotifyEnv, type AndroidWindow } from './spotify-env';` et remplacer la ligne `const start = ...` par :

```ts
  const start = () => void startOverlay(createLocalStorageStore(), createAndroidSpotifyEnv(window as unknown as AndroidWindow));
```

- [ ] **Step 6 : côté Java et manifeste Android**

`android/app/src/main/AndroidManifest.xml` : dans `<activity …>` ajouter l'attribut `android:launchMode="singleTask"` (l'activité garde sa WebView au retour de l'autorisation) et, après l'`intent-filter` existant, un second :

```xml
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="wikimasterstools" android:host="spotify" />
            </intent-filter>
```

`MainActivity.java` :

1. Imports à ajouter : `import android.webkit.JavascriptInterface;` et `import org.json.JSONObject;`.
2. Constantes en tête de classe :

```java
    private static final String SPOTIFY_AUTH_PREFIX = "https://accounts.spotify.com/authorize?";
    private static final String SPOTIFY_REDIRECT_SCHEME = "wikimasterstools";
```

3. Dans `onCreate`, après `cookies.setAcceptThirdPartyCookies(webView, true);`, ajouter :

```java
        webView.addJavascriptInterface(new SpotifyBridge(), "WmtSpotify");
```

4. Ajouter dans la classe (avant `readAsset`) :

```java
    // Pont vers la surcouche : ouvre l'autorisation Spotify dans le navigateur du téléphone (jamais dans la WebView).
    // Seule l'adresse d'autorisation de Spotify est acceptée.
    private final class SpotifyBridge {
        @JavascriptInterface
        public void openAuth(String url) {
            if (url == null || !url.startsWith(SPOTIFY_AUTH_PREFIX)) return;
            runOnUiThread(() -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))));
        }
    }

    // Retour de l'autorisation (wikimasterstools://spotify?code=…) : transmis à la surcouche, qui termine la liaison.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri uri = intent.getData();
        if (uri == null || !SPOTIFY_REDIRECT_SCHEME.equals(uri.getScheme())) return;
        webView.evaluateJavascript(
                "window.__wmtSpotifyRedirect && window.__wmtSpotifyRedirect(" + JSONObject.quote(uri.toString()) + ")", null);
    }
```

- [ ] **Step 7 : vérifier**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: aucune erreur.

Run: `node node_modules/vitest/vitest.mjs run`
Expected: PASS.

Run: `node scripts/build-apk.mjs`
Expected: bundle Vite réussi, `assembleRelease` réussi, ligne `APK : livrables/wikimasters-tools-0.1.0-android.apk`. En cas d'erreur Java (import manquant), corriger avant de continuer.

- [ ] **Step 8 : commit**

```bash
git add src/android android tests/android
git commit -m "feat: Spotify dans l'APK (pont Java, retour d'autorisation, câblage)"
```

---

### Task 10 : Documentation, vérification manuelle, livraison

**Files :**
- Modify: `README.md`, `docs/superpowers/specs/2026-10-01-spotify-playback-design.md` (ajustements notés ci-dessous)
- Create: aucun

- [ ] **Step 1 : aligner la spec sur ce qui a été construit**

Dans la spec : (a) section 5, remplacer « Sondage `GET /me/player` toutes les 5 s tant que le lecteur est visible et lié ; en pause ou masqué, 15 s. » par « Sondage `GET /me/player` toutes les 5 s pendant une lecture, 15 s sinon (lecteur visible ou masqué, tant que le compte est lié). » ; (b) section 3, remplacer le paragraphe « À vérifier en tout premier… » par la mention de la vérification manuelle de la Task 10 ; (c) section Hors périmètre, ajouter « Cartes hors collection ».

- [ ] **Step 2 : README**

Dans `README.md`, après la section sur le relevé du marché et avant « Ce qu'elle ne fait pas », ajouter :

```markdown
### Écouter la musique d'une carte (Spotify)

Sur la fiche d'une carte **de votre Collection** qui est un morceau, un album ou un artiste, une section « Écouter »
propose un bouton ▶ par morceau (album : toutes les pistes ; artiste : jusqu'à 10 titres trouvés par recherche Spotify).
L'extension **pilote votre appli Spotify** (Spotify Connect) : il faut **Spotify Premium** et l'appli ouverte sur un appareil.
La musique continue quand vous changez de page ; un mini-lecteur (titre, ▶/⏸, masquable) reste affiché sur le site.

Le lien avec votre compte se fait par l'autorisation officielle de Spotify (PKCE, sans mot de passe ni secret) ; seuls
les droits « lire l'état de la lecture » et « contrôler la lecture » sont demandés. L'icône ⨯ de la section « Écouter »
délie le compte. Les titres retrouvés viennent de Wikidata (interprète, identifiants Spotify), puis d'une recherche Spotify.
```

- [ ] **Step 3 : déclarer les adresses de retour dans le tableau de bord Spotify (par l'utilisateur)**

Demander à l'utilisateur d'ouvrir https://developer.spotify.com/dashboard → l'application → *Settings* → *Redirect URIs* et d'ajouter, puis *Save* :
- `wikimasterstools://spotify` (APK) ;
- l'adresse Chrome affichée par `node scripts/chrome-extension-id.mjs <clé>` (Task 8) : `https://<id>.chromiumapp.org/` ;
- l'adresse Firefox : charger l'extension Firefox (`node node_modules/wxt/bin/wxt.mjs -b firefox --mv3`), ouvrir `about:debugging` → *Inspecter* l'extension, lire dans la console la ligne « adresse de retour Spotify ».

Cette étape bloque la vérification : ne pas l'ignorer.

- [ ] **Step 4 : vérification manuelle dans Chrome (extension)**

Charger `.output/chrome-mv3` dans Chrome (mode développeur), ouvrir https://www.wiki-masters.com/collection, ouvrir la Collection (vue Homemade), puis :
1. Ouvrir la fiche d'une carte album de la collection : la section « Écouter » affiche « Spotify » (lier). La fiche reste entière à l'écran.
2. Lier : la fenêtre Spotify s'ouvre, accepter ; la section affiche les pistes.
3. Appli Spotify ouverte sur le PC, ▶ sur une piste : la musique démarre ; le mini-lecteur apparaît avec titre et ⏸.
4. Changer de page du jeu : la musique continue, le mini-lecteur reste ; ⏸ arrête ; ▶ reprend ; masquer/afficher fonctionne et est mémorisé après rechargement.
5. Carte artiste : ≤ 10 titres de lui seul. Carte morceau : un seul ▶. Carte hors musique ou hors collection : aucune section.
6. Fermer Spotify (aucun appareil actif) puis ▶ : message « Ouvre Spotify sur un de tes appareils… ».
7. Console de la page : aucune erreur CSP ou réseau pendant ces étapes. Faire défiler la liste de pistes ne ferme pas la fiche.

Relever tout écart ; corriger avant de poursuivre. Même vérification sous Firefox si l'adresse Firefox a été déclarée.

- [ ] **Step 5 : vérification manuelle sur l'APK**

Installer `livrables/wikimasters-tools-0.1.0-android.apk` sur le téléphone, appli Spotify installée et connectée (Premium) :
1. Fiche d'une carte album → « Spotify » → le navigateur du téléphone s'ouvre sur l'autorisation, accepter, retour dans l'application : les pistes s'affichent. **Si l'appel à `api.spotify.com` échoue (CSP/CORS du site) : s'arrêter et le signaler (le plan prévoit alors un pont natif, hors de ce plan).**
2. ▶ : la musique démarre dans l'appli Spotify ; le mini-lecteur apparaît en bas, ne masque pas les boutons de navigation du jeu (sinon ajuster `bottom` dans `SpotifyPlayer.tsx`).
3. Quitter la page du jeu : la musique continue ; ⏸ du mini-lecteur l'arrête.
4. Refus à l'autorisation ou retour sans valider : message « Liaison Spotify annulée. », aucun plantage.

- [ ] **Step 6 : build final, mémoire, PR**

Run: `node node_modules/typescript/bin/tsc --noEmit` puis `node node_modules/vitest/vitest.mjs run` puis `node node_modules/wxt/bin/wxt.mjs build`
Expected: tout au vert.

Livraisons (mémoire du projet) : l'APK reconstruit fait partie des livraisons ; vérifier que `livrables/` contient l'APK à jour (`node scripts/build-apk.mjs`), puis `npm run package` équivalent (`node node_modules/wxt/bin/wxt.mjs zip` et `... zip -b firefox --mv3`) si les archives sont suivies dans `livrables/`.

Commit puis PR et fusion (routine du projet : ouvrir et fusionner la PR sans redemander) :

```bash
git add README.md docs livrables
git commit -m "docs: README et spec alignés sur l'écoute Spotify"
git push -u origin feat/spotify-playback
gh pr create --title "feat: écouter la musique des cartes via Spotify" --body "$(cat <<'EOF'
## Résumé
- Section « Écouter » sur la fiche des cartes musique de la collection (morceau, album, artiste), lecture par Spotify Connect.
- Mini-lecteur flottant masquable sur toutes les pages du jeu.
- Liaison du compte (PKCE) dans l'extension (service worker, `identity`) et dans l'APK (pont Java).

## Vérification
tsc, vitest, build Chrome/Firefox, APK ; vérification manuelle Chrome et APK (voir le plan).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Puis lier la PR avec les outils `ccd_pr` (`get_status`, `bind_pr` si besoin), fusionner (`gh pr merge --squash` ou le mode habituel du dépôt), et mettre à jour la mémoire du projet (Spotify : état et pièges rencontrés).
