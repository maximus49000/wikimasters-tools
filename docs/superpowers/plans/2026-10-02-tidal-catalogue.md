# Tidal catalogue (phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Choisir Tidal dans Plus → Lecteur, lier un compte Tidal (PKCE, sans secret), trouver les pistes / l'album / les titres d'un artiste d'une carte musique, garder le résultat dans `listens-tidal-v1`, et proposer un lien « Ouvrir dans Tidal » par piste.

**Architecture:** Les modules Tidal vivent dans `src/core/tidal/` (config, erreurs, session PKCE, client JSON:API, résolution d'une carte). La logique « fiche d'une carte » de `music-service.ts` est extraite dans `listen-viewer.ts`, que Spotify et Tidal partagent. Un routeur (`platform-service.ts`) présente à l'interface un seul `MusicService` qui délègue à la plateforme choisie. L'interface `MusicProvider` de la spec n'est pas créée : le routeur + le viewer partagé jouent ce rôle avec moins de code. Pas de lecture dans l'appli ici (phase 3) : les pistes Tidal n'ont qu'un lien ↗.

**Tech Stack:** TypeScript, React 18, zod 4, Vitest + jsdom, WXT, Android (Java, WebView).

**Spec:** `docs/superpowers/specs/2026-10-02-tidal-design.md` (écart assumé : pas d'interface `MusicProvider`, voir Architecture).

## Global Constraints

- Textes en français, casse de phrase ; glyphes plutôt que texte ; cibles tactiles de 44 px ; tout visible sur l'extension ET l'APK.
- Spotify : comportement inchangé (tous ses tests existants restent verts après chaque tâche).
- **Aucun Client Secret dans le code, les tests ou les fixtures.** Seul le Client ID public `Js7eZgbN3qENNo9e` y figure.
- Scope demandé : `search.read` uniquement ; le reste du catalogue n'exige aucun scope.
- Redirect URIs déclarées chez Tidal : `https://dnekjpcnfghhalnipllhhidibhiimdbl.chromiumapp.org/` (Chrome) et `wikimasterstools://tidal` (APK).
- Clés de stockage : session `tidal-session` ; listes `listens-tidal-v1` ; pause `tidal-limit:catalog`. `listens-v1` (Spotify) n'est jamais lu ni écrit par Tidal.
- Formes de l'API réelles (sonde du 02/10/2026, `.superpowers/tidal-fixtures/`) : `GET https://openapi.tidal.com/v2/…`, en-tête `accept: application/vnd.api+json`, paramètre `countryCode` ; l'ordre de pertinence est celui de `data[0].relationships.<x>.data`, **pas** celui de `included` ; `externalLinks` donne `https://tidal.com/browse/{track|album|artist}/{id}` ; la recherche seule renvoie des homonymes (la 1ʳᵉ « The Beatles » d'une recherche d'artiste n'est pas forcément exacte) : toujours vérifier titre ET artiste.
- Commandes : `npx vitest run <fichier>`, `npm test`, `npm run typecheck`, `npm run build`. Chaque tâche finit par un commit en français avec la ligne `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Branche : `feat/tidal-catalogue`, créée depuis `feat/tidal-sonde` (qui contient la sonde).

---

### Task 1: Extraire la logique de fiche dans `listen-viewer.ts`

**Files:**
- Create: `src/content/listen-viewer.ts`
- Modify: `src/content/music-service.ts`
- Modify: `src/core/music/listen.ts` (exporter `normalize`)
- Test: `tests/content/listen-viewer.test.ts`

**Interfaces:**
- Produces:
  - `type ListenView` (déplacé tel quel depuis `music-service.ts`, toujours ré-exporté par lui)
  - `type ListenViewerDeps = { collection: { list(): Promise<KnownCard[]> }; kinds: Pick<KindsRepo,'resolveMissing'|'load'>; music: Pick<MusicRepo,'resolve'>; listens: Pick<ListenRepo,'load'|'save'>; session: { isLinked(): Promise<boolean> }; resolve(input: { title: string; kind: MusicKind; music: CardMusic }): Promise<Listen | null>; describeError(error: unknown): { message: string; retryAfterMs?: number } }`
  - `createListenViewer(deps): { listenOf(card: Pick<KnownCard,'slug'|'title'>, kind: MusicKind, kept: Map<string, Listen | null>, force?: boolean): Promise<Listen | null>; show(slug: string, title: string, force: boolean): Promise<ListenView> }`
  - `normalize` exporté par `src/core/music/listen.ts`.
  - `createMusicService` gagne `isLinked: () => Promise<boolean>` dans son objet retourné.

- [ ] **Step 1: Écrire le test qui échoue**

`tests/content/listen-viewer.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createListenViewer, type ListenViewerDeps } from '../../src/content/listen-viewer';
import { createMemoryStore } from '../../src/core/cache/store';
import { createListenRepo } from '../../src/core/music/listen-repo';

const album = { kind: 'album' as const, items: [{ uri: 'x:1', title: 'Come Together', artist: 'The Beatles' }], albumUri: 'x:album:1' };

function setup(over: Partial<ListenViewerDeps> = {}) {
  const resolve = vi.fn(async () => album as never);
  const viewer = createListenViewer({
    collection: { list: async () => [{ slug: 'Abbey_Road', title: 'Abbey_Road' }] },
    kinds: {
      resolveMissing: async () => undefined,
      load: async () => ({ cards: { Abbey_Road: { natures: ['Q482994'], occupations: [], genres: [] } }, labels: {} }) as never,
    },
    music: { resolve: async () => ({ Abbey_Road: { performer: 'The Beatles' } }) as never },
    listens: createListenRepo(createMemoryStore()),
    session: { isLinked: async () => true },
    resolve,
    describeError: (error) => ({ message: `échec : ${String(error)}` }),
    ...over,
  });
  return { viewer, resolve };
}

describe('createListenViewer', () => {
  it('rend la liste de resolve, puis la garde : resolve n\'est plus appelé', async () => {
    const { viewer, resolve } = setup();
    expect(await viewer.show('Abbey_Road', 'Abbey Road', false)).toEqual({ status: 'ready', listen: album });
    await viewer.show('Abbey_Road', 'Abbey Road', false);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ title: 'Abbey Road', kind: 'album', music: { performer: 'The Beatles' } });
  });

  it('rend none hors collection, unlinked sans compte, notfound quand resolve ne trouve rien', async () => {
    expect(await setup({ collection: { list: async () => [] } }).viewer.show('Abbey_Road', 'x', false)).toEqual({ status: 'none' });
    const unlinked = setup({ session: { isLinked: async () => false } });
    expect(await unlinked.viewer.show('Abbey_Road', 'x', false)).toEqual({ status: 'unlinked' });
    expect(unlinked.resolve).not.toHaveBeenCalled();
    expect(await setup({ resolve: async () => null }).viewer.show('Abbey_Road', 'x', false)).toEqual({ status: 'notfound' });
  });

  it('rend le message de describeError, avec retryAfterMs seulement quand il existe, et ne garde pas une erreur', async () => {
    const failing = setup({ resolve: vi.fn(async () => { throw new Error('boum'); }), describeError: () => ({ message: 'patiente', retryAfterMs: 4_000 }) });
    expect(await failing.viewer.show('Abbey_Road', 'x', false)).toEqual({ status: 'error', message: 'patiente', retryAfterMs: 4_000 });
    const plain = setup({ resolve: vi.fn(async () => { throw new Error('boum'); }), describeError: () => ({ message: 'panne' }) });
    expect(await plain.viewer.show('Abbey_Road', 'x', false)).toEqual({ status: 'error', message: 'panne' });
    await plain.viewer.show('Abbey_Road', 'x', false);
    expect(plain.resolve).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Vérifier qu'il échoue**

Run: `npx vitest run tests/content/listen-viewer.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémentation**

`src/core/music/listen.ts` : changer `const normalize =` en `export const normalize =`.

`src/content/listen-viewer.ts` :

```ts
import type { KnownCard } from '../core/collection/collection-book';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { Listen } from '../core/music/listen';
import type { ListenRepo } from '../core/music/listen-repo';
import { musicKindOf, type MusicKind } from '../core/music/music-kinds';
import type { MusicRepo } from '../core/music/music-repo';
import type { CardMusic } from '../core/music/wikidata-music';

export type ListenView =
  | { status: 'none' }
  | { status: 'notfound' }
  | { status: 'unlinked' }
  | { status: 'ready'; listen: Listen }
  // `retryAfterMs` : limite de la plateforme (429) ; la fiche recharge d'elle-même une fois ce délai passé.
  | { status: 'error'; message: string; retryAfterMs?: number };

export type ListenViewerDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  music: Pick<MusicRepo, 'resolve'>;
  // Les listes d'écoute déjà trouvées : la plateforme n'est interrogée qu'une fois par carte.
  listens: Pick<ListenRepo, 'load' | 'save'>;
  session: { isLinked(): Promise<boolean> };
  // Ce qu'on peut écouter d'une carte sur cette plateforme (recherche) ; `null` : rien trouvé.
  resolve(input: { title: string; kind: MusicKind; music: CardMusic }): Promise<Listen | null>;
  // Message à afficher pour une erreur, et délai avant la relance automatique quand la plateforme limite les appels.
  describeError(error: unknown): { message: string; retryAfterMs?: number };
};

// La fiche « Écouter » d'une carte, commune à toutes les plateformes.
export function createListenViewer(deps: ListenViewerDeps) {
  const { collection, kinds, music, listens, session, resolve, describeError } = deps;

  // `kept` : les listes gardées, lues une fois par l'appelant. `force` : redemander même si une liste est gardée.
  async function listenOf(card: Pick<KnownCard, 'slug' | 'title'>, kind: MusicKind, kept: Map<string, Listen | null>, force = false): Promise<Listen | null> {
    if (!force && kept.has(card.slug)) return kept.get(card.slug) ?? null;
    const state = await music.resolve([card.slug]);
    // Wikidata n'a pas répondu (panne, pause après échec) : sans l'interprète, « rien trouvé » ne serait pas une vraie réponse.
    const answered = Object.prototype.hasOwnProperty.call(state, card.slug);
    if (force && !answered && kept.has(card.slug)) return kept.get(card.slug) ?? null;
    const listen = await resolve({ title: card.title, kind, music: state[card.slug] ?? {} });
    if (answered) {
      // Un stockage plein ne doit pas priver la fiche de sa liste : elle sera simplement redemandée.
      await listens.save(card.slug, listen).catch((error: unknown) => console.warn('[wikimasters-tools]', 'liste d’écoute non gardée :', error));
    }
    return listen;
  }

  async function show(slug: string, title: string, force: boolean): Promise<ListenView> {
    try {
      if (!(await collection.list()).some((card) => card.slug === slug)) return { status: 'none' };
      await kinds.resolveMissing([slug]);
      const kind = musicKindOf((await kinds.load()).cards[slug]);
      if (!kind) return { status: 'none' };
      if (!(await session.isLinked())) return { status: 'unlinked' };
      const listen = await listenOf({ slug, title }, kind, await listens.load(), force);
      return listen ? { status: 'ready', listen } : { status: 'notfound' };
    } catch (error) {
      const { message, retryAfterMs } = describeError(error);
      return { status: 'error', message, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) };
    }
  }

  return { listenOf, show };
}

export type ListenViewer = ReturnType<typeof createListenViewer>;
```

`src/content/music-service.ts` : remplacer `import { resolveListen, sameTrack, type Listen } …` par la même ligne et ajouter `import { createListenViewer, type ListenView } from './listen-viewer';` ; supprimer la définition locale de `ListenView` et la remplacer par `export type { ListenView } from './listen-viewer';` ; supprimer les fonctions internes `listenOf` et `show` et créer, juste après `const sleep = …` :

```ts
  // Message d'une erreur Spotify ; une limite (429) annonce aussi son délai, pour la relance automatique de la fiche.
  const describeError = (error: unknown): { message: string; retryAfterMs?: number } => {
    const retryAfterMs = error instanceof SpotifyError && error.code === 'rate-limited' ? error.retryAfterMs : undefined;
    return { message: userMessage(error), ...(retryAfterMs === undefined ? {} : { retryAfterMs }) };
  };
  const viewer = createListenViewer({ collection, kinds, music, listens, session, resolve: (input) => resolveListen(api, input), describeError });
```

puis `playingSlugs` utilise `viewer.listenOf(card, kind, kept)`, `view: (slug, title) => viewer.show(slug, title, false)`, `refresh: (slug, title) => viewer.show(slug, title, true)`, et ajouter dans l'objet retourné `isLinked: () => session.isLinked(),`. Retirer les imports devenus inutiles (`musicKindOf`, `MusicKind` si non utilisés) selon le typecheck.

- [ ] **Step 4: Vérifier**

Run: `npx vitest run tests/content/listen-viewer.test.ts tests/content/music-service.test.ts tests/content/listen-rate-limit.test.tsx tests/content/listen-section.test.tsx tests/content/listen-refresh.test.tsx` puis `npm run typecheck`
Expected: PASS (les 50 tests de `music-service.test.ts` prouvent que Spotify n'a pas changé), typecheck propre.

- [ ] **Step 5: Commit**

```bash
git add src/content/listen-viewer.ts src/content/music-service.ts src/core/music/listen.ts tests/content/listen-viewer.test.ts
git commit -m "refactor: la fiche « Écouter » est extraite dans un viewer commun aux plateformes"
```

---

### Task 2: Configuration, erreurs et pays de Tidal

**Files:**
- Create: `src/core/tidal/config.ts`, `src/core/tidal/errors.ts`
- Test: `tests/core/tidal/config-errors.test.ts`

**Interfaces:**
- Produces:
  - `config.ts` : `TIDAL_CLIENT_ID`, `TIDAL_SCOPES: string[]`, `TIDAL_AUTHORIZE_URL`, `TIDAL_TOKEN_URL`, `TIDAL_API_URL`, `TIDAL_ANDROID_REDIRECT_URI`, `TIDAL_HOME_URL`, `countryOf(locale: string | undefined): string`
  - `errors.ts` : `type TidalErrorCode = 'not-linked' | 'rate-limited' | 'auth-cancelled' | 'http'`, `class TidalError(code, message, retryAfterMs?, retryAt?)`, `tidalMessage(error: unknown): string`

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import { TIDAL_ANDROID_REDIRECT_URI, TIDAL_CLIENT_ID, TIDAL_SCOPES, countryOf } from '../../../src/core/tidal/config';
import { TidalError, tidalMessage } from '../../../src/core/tidal/errors';

describe('config Tidal', () => {
  it("n'expose que l'identifiant public et le scope de recherche", () => {
    expect(TIDAL_CLIENT_ID).toBe('Js7eZgbN3qENNo9e');
    expect(TIDAL_SCOPES).toEqual(['search.read']);
    expect(TIDAL_ANDROID_REDIRECT_URI).toBe('wikimasterstools://tidal');
  });

  it('prend le pays de la langue de l\'appareil, FR à défaut', () => {
    expect(countryOf('fr-FR')).toBe('FR');
    expect(countryOf('en-GB')).toBe('GB');
    expect(countryOf('pt_br')).toBe('BR');
    expect(countryOf('en')).toBe('FR');
    expect(countryOf(undefined)).toBe('FR');
  });
});

describe('tidalMessage', () => {
  it('parle de Tidal, jamais de Spotify', () => {
    expect(tidalMessage(new TidalError('not-linked', 'x'))).toBe('Lie ton compte Tidal pour écouter.');
    expect(tidalMessage(new TidalError('rate-limited', 'x', 3_000))).toContain('Tidal demande de patienter');
    expect(tidalMessage(new TidalError('auth-cancelled', 'x'))).toBe('Liaison Tidal annulée.');
    expect(tidalMessage(new TidalError('http', 'x'))).toBe('Tidal est indisponible pour le moment.');
    expect(tidalMessage(new Error('inconnue'))).toBe('Tidal est indisponible pour le moment.');
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/core/tidal/config-errors.test.ts` — Expected : FAIL (modules introuvables).

- [ ] **Step 3: Implémentation**

`src/core/tidal/config.ts` :

```ts
// Identifiant public de l'application Tidal (PKCE : aucun secret côté client). Le Client Secret ne doit JAMAIS entrer ici.
export const TIDAL_CLIENT_ID = 'Js7eZgbN3qENNo9e';
// Rechercher dans le catalogue ; lire pistes, albums et artistes n'exige aucun scope.
export const TIDAL_SCOPES = ['search.read'];
export const TIDAL_AUTHORIZE_URL = 'https://login.tidal.com/authorize';
export const TIDAL_TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token';
export const TIDAL_API_URL = 'https://openapi.tidal.com/v2';
// Retour de l'autorisation dans l'application Android (filtre d'intent de MainActivity).
export const TIDAL_ANDROID_REDIRECT_URI = 'wikimasterstools://tidal';
export const TIDAL_HOME_URL = 'https://tidal.com';

// Pays du catalogue : celui de la langue de l'appareil (fr-FR donne FR), FR à défaut.
export const countryOf = (locale: string | undefined): string => /[-_]([A-Za-z]{2})$/.exec(locale ?? '')?.[1]?.toUpperCase() ?? 'FR';
```

`src/core/tidal/errors.ts` :

```ts
export type TidalErrorCode = 'not-linked' | 'rate-limited' | 'auth-cancelled' | 'http';

export class TidalError extends Error {
  constructor(
    readonly code: TidalErrorCode,
    message: string,
    // Pour `rate-limited` : durée de la pause restante au moment de l'erreur.
    readonly retryAfterMs?: number,
    // Pour `rate-limited` : heure (ms, absolue) à laquelle les appels pourront reprendre.
    readonly retryAt?: number,
  ) {
    super(message);
    this.name = 'TidalError';
  }
}

const MESSAGES: Record<TidalErrorCode, string> = {
  'not-linked': 'Lie ton compte Tidal pour écouter.',
  'rate-limited': 'Tidal demande de patienter un instant. Réessaie dans quelques secondes.',
  'auth-cancelled': 'Liaison Tidal annulée.',
  http: 'Tidal est indisponible pour le moment.',
};

export const tidalMessage = (error: unknown): string => (error instanceof TidalError ? MESSAGES[error.code] : MESSAGES.http);
```

- [ ] **Step 4:** `npx vitest run tests/core/tidal/config-errors.test.ts` — Expected : PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/tidal tests/core/tidal
git commit -m "feat: configuration, erreurs et pays de Tidal"
```

---

### Task 3: Session Tidal (PKCE, sans secret)

**Files:**
- Create: `src/core/tidal/tidal-session.ts`
- Test: `tests/core/tidal/tidal-session.test.ts`

**Interfaces:**
- Consumes: `randomString`, `challengeOf`, `CryptoLike` (`src/core/spotify/pkce`), `KeyValueStore`, `TidalError`, config.
- Produces: `type TidalFetch = (url: string, init?: RequestInit) => Promise<Response>`, `type TidalSessionDeps = { store: KeyValueStore; fetch: TidalFetch; authorize(authUrl: string): Promise<string>; redirectUri(): Promise<string>; now?: () => number; crypto?: CryptoLike }`, `createTidalSession(deps)` → `{ isLinked(): Promise<boolean>; link(): Promise<void>; unlink(): Promise<void>; accessToken(force?: boolean): Promise<string>; subscribe(listener): () => void }`, `type TidalSession`.

- [ ] **Step 1: Écrire le test qui échoue**

`tests/core/tidal/tidal-session.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { TidalError } from '../../../src/core/tidal/errors';
import { createTidalSession, type TidalFetch } from '../../../src/core/tidal/tidal-session';

const tokenResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const REDIRECT = 'wikimasterstools://tidal';

function setup(overrides: { fetch?: ReturnType<typeof vi.fn<TidalFetch>>; authorize?: ReturnType<typeof vi.fn<(authUrl: string) => Promise<string>>> } = {}) {
  let time = 1_000_000;
  const fetch = overrides.fetch ?? vi.fn<TidalFetch>(async () => tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 86_400 }));
  const authorize = overrides.authorize ?? vi.fn<(authUrl: string) => Promise<string>>(async (authUrl: string) => `${REDIRECT}?code=CODE&state=${new URL(authUrl).searchParams.get('state')}`);
  const session = createTidalSession({ store: createMemoryStore(), fetch, authorize, redirectUri: async () => REDIRECT, now: () => time });
  return { session, fetch, authorize, advance: (ms: number) => (time += ms) };
}

describe('createTidalSession', () => {
  it('lie le compte : autorisation PKCE sans secret, puis échange du code', async () => {
    const { session, fetch, authorize } = setup();
    expect(await session.isLinked()).toBe(false);
    await session.link();
    expect(await session.isLinked()).toBe(true);

    const authUrl = new URL(authorize.mock.calls[0]![0] as string);
    expect(`${authUrl.origin}${authUrl.pathname}`).toBe('https://login.tidal.com/authorize');
    expect(authUrl.searchParams.get('client_id')).toBe('Js7eZgbN3qENNo9e');
    expect(authUrl.searchParams.get('scope')).toBe('search.read');
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authUrl.searchParams.get('redirect_uri')).toBe(REDIRECT);

    const [url, init] = fetch.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://auth.tidal.com/v1/oauth2/token');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('CODE');
    expect(body.get('client_id')).toBe('Js7eZgbN3qENNo9e');
    expect(body.get('code_verifier')).toHaveLength(64);
    expect(body.has('client_secret')).toBe(false);
    expect(await session.accessToken()).toBe('A1');
  });

  it('ne lie rien quand la liaison est annulée, ou que l\'état ne correspond pas', async () => {
    const denied = setup({ authorize: vi.fn<(authUrl: string) => Promise<string>>(async () => `${REDIRECT}?error=access_denied`) });
    await expect(denied.session.link()).rejects.toMatchObject({ code: 'auth-cancelled' });
    const forged = setup({ authorize: vi.fn<(authUrl: string) => Promise<string>>(async () => `${REDIRECT}?code=C&state=autre`) });
    await expect(forged.session.link()).rejects.toMatchObject({ code: 'auth-cancelled' });
    expect(await forged.session.isLinked()).toBe(false);
  });

  it("rafraîchit le jeton expiré, en gardant le jeton de rafraîchissement quand Tidal n'en renvoie pas", async () => {
    const fetch = vi
      .fn<TidalFetch>()
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 86_400 }))
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A2', expires_in: 86_400 }));
    const { session, advance } = setup({ fetch });
    await session.link();
    advance(86_400_000);
    expect(await session.accessToken()).toBe('A2');
    const body = new URLSearchParams((fetch.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('R1');
    expect(body.get('client_id')).toBe('Js7eZgbN3qENNo9e');
  });

  it('regroupe les rafraîchissements simultanés, et force un rafraîchissement sur demande', async () => {
    const fetch = vi
      .fn<TidalFetch>()
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 86_400 }))
      .mockResolvedValue(tokenResponse({ access_token: 'A2', expires_in: 86_400 }));
    const { session, advance } = setup({ fetch });
    await session.link();
    advance(86_400_000);
    expect(await Promise.all([session.accessToken(), session.accessToken()])).toEqual(['A2', 'A2']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await session.accessToken(true)).toBe('A2');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('délie quand le jeton de rafraîchissement est refusé', async () => {
    const fetch = vi
      .fn<TidalFetch>()
      .mockResolvedValueOnce(tokenResponse({ access_token: 'A1', refresh_token: 'R1', expires_in: 86_400 }))
      .mockResolvedValueOnce(tokenResponse({ error: 'invalid_grant' }, 400));
    const { session, advance } = setup({ fetch });
    await session.link();
    advance(86_400_000);
    await expect(session.accessToken()).rejects.toMatchObject({ code: 'not-linked' });
    expect(await session.isLinked()).toBe(false);
  });

  it('lève not-linked sans compte, et prévient les abonnés à la liaison et à la déliaison', async () => {
    const { session } = setup();
    await expect(session.accessToken()).rejects.toBeInstanceOf(TidalError);
    const listener = vi.fn();
    session.subscribe(listener);
    await session.link();
    await session.unlink();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(await session.isLinked()).toBe(false);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/core/tidal/tidal-session.test.ts` — Expected : FAIL (module introuvable).

- [ ] **Step 3: Implémentation**

`src/core/tidal/tidal-session.ts` :

```ts
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
```

- [ ] **Step 4:** `npx vitest run tests/core/tidal/tidal-session.test.ts` — Expected : PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/tidal/tidal-session.ts tests/core/tidal/tidal-session.test.ts
git commit -m "feat: session Tidal (autorisation PKCE sans secret, jetons de 24 h rafraîchis)"
```

---

### Task 4: Client de catalogue Tidal (JSON:API)

**Files:**
- Modify: `src/core/spotify/limit-gate.ts` (préfixe de clé en option)
- Create: `src/core/tidal/tidal-api.ts`
- Create: `tests/core/tidal/fixtures/{search-tracks,search-albums,search-artists,album-items,artist-tracks}.json`
- Test: `tests/core/spotify/limit-gate.test.ts` (ajout), `tests/core/tidal/tidal-api.test.ts`

**Interfaces:**
- Consumes: `TidalSession` (`accessToken(force?)`), `TidalFetch`, `createCallQueue`, `createLimitGate`, `TidalError`, `TIDAL_API_URL`.
- Produces:
  - `createLimitGate(deps: { store; now?; prefix?: string })` : `prefix` vaut `'spotify-limit'` par défaut (clé = `${prefix}:${family}`).
  - `type TidalTrack = { id: string; title: string; artists: string[] }`, `type TidalAlbum = { id: string; title: string; artists: string[] }`, `type TidalArtist = { id: string; name: string }`
  - `createTidalApi({ session, fetch, store, countryCode, now?, gaps?, sleep? })` → `{ searchTracks(query, limit?): Promise<TidalTrack[]>; searchAlbums(query, limit?): Promise<TidalAlbum[]>; searchArtists(query, limit?): Promise<TidalArtist[]>; albumTracks(albumId): Promise<{ id: string; title: string }[]>; artistTracks(artistId, limit?): Promise<{ id: string; title: string }[]> }`, `type TidalApi`.
  - Un titre avec version s'écrit `Titre (Version)`.

- [ ] **Step 1: Préfixe du limit-gate (test puis code)**

Ajouter à `tests/core/spotify/limit-gate.test.ts`, dans le `describe` :

```ts
  it('un autre préfixe garde sa pause à part (Tidal) sans toucher celle de Spotify', async () => {
    const store = createMemoryStore();
    const spotify = createLimitGate({ store, now: () => 0 });
    const tidal = createLimitGate({ store, now: () => 0, prefix: 'tidal-limit' });
    await tidal.trip('catalog', 30_000);
    expect(await tidal.remainingMs('catalog')).toBe(30_000);
    expect(await spotify.remainingMs('catalog')).toBe(0);
    expect(await store.get('tidal-limit:catalog')).toBeTruthy();
  });
```

Run : `npx vitest run tests/core/spotify/limit-gate.test.ts` → FAIL. Puis dans `limit-gate.ts` : remplacer `const keyOf = (family: Family): string => \`spotify-limit:${family}\`;` par `const DEFAULT_PREFIX = 'spotify-limit';`, changer la signature en `createLimitGate(deps: { store: KeyValueStore; now?: () => number; prefix?: string })`, `const { store, now = () => Date.now(), prefix = DEFAULT_PREFIX } = deps;` et `const keyOf = (family: Family): string => \`${prefix}:${family}\`;` (déplacé dans la fonction). Run → PASS.

- [ ] **Step 2: Fixtures réelles allégées**

Run (depuis la racine ; les fichiers sources viennent de la sonde) :

```bash
python - <<'EOF'
import json, os
SRC='.superpowers/tidal-fixtures'; DST='tests/core/tidal/fixtures'
os.makedirs(DST, exist_ok=True)
def load(n): return json.load(open(f'{SRC}/{n}.json', encoding='utf-8'))['body']
def keep(body, relation, type_, n):
    # garde les n premiers résultats de la relation (ordre de pertinence) et leurs ressources incluses (+ artistes liés)
    d = body['data']
    root = d[0] if isinstance(d, list) else d
    if relation:
        root['relationships'][relation]['data'] = root['relationships'][relation]['data'][:n]
        ids = {x['id'] for x in root['relationships'][relation]['data']}
    else:
        body['data'] = d[:n]; ids = {x['id'] for x in body['data']}
    inc = [i for i in body.get('included', []) if i['type'] == type_ and i['id'] in ids]
    art = {a['id'] for i in inc for a in (i.get('relationships', {}).get('artists', {}).get('data') or [])}
    inc += [i for i in body.get('included', []) if i['type'] == 'artists' and i['id'] in art]
    body['included'] = inc
    body['links'] = {k: v for k, v in body.get('links', {}).items() if k == 'meta'}
    return body
out = {
  'search-tracks': keep(load('search-tracks-b'), 'tracks', 'tracks', 6),
  'search-albums': keep(load('search-albums'), 'albums', 'albums', 6),
  'search-artists': keep(load('search-artists'), 'artists', 'artists', 6),
  'album-items': keep(load('album-items'), None, 'tracks', 5),
  'artist-tracks': keep(load('artist-tracks'), None, 'tracks', 6),
}
for name, body in out.items():
    json.dump(body, open(f'{DST}/{name}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(name, len(json.dumps(body)), 'octets')
EOF
```

Expected : cinq fichiers de quelques Ko. Vérifier : `grep -ril "secret\|token" tests/core/tidal/fixtures` ne renvoie rien.

- [ ] **Step 3: Écrire le test du client qui échoue**

`tests/core/tidal/tidal-api.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createTidalApi } from '../../../src/core/tidal/tidal-api';
import albumItems from './fixtures/album-items.json';
import artistTracks from './fixtures/artist-tracks.json';
import searchAlbums from './fixtures/search-albums.json';
import searchArtists from './fixtures/search-artists.json';
import searchTracks from './fixtures/search-tracks.json';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/vnd.api+json', ...headers } });

function setup(respond: (url: string) => Response | Promise<Response>) {
  let time = 1_000;
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => respond(url));
  const session = { accessToken: vi.fn(async (_force?: boolean) => 'T') };
  const api = createTidalApi({
    session,
    fetch,
    store: createMemoryStore(),
    countryCode: 'FR',
    now: () => time,
    gaps: { page: 0 },
    sleep: async () => undefined,
  });
  return { api, fetch, session, advance: (ms: number) => (time += ms) };
}

describe('createTidalApi, recherche', () => {
  it('rend les titres dans l\'ordre de pertinence, avec leurs artistes et la version', async () => {
    const { api, fetch } = setup(() => json(searchTracks));
    const found = await api.searchTracks('Ghost Town The Specials');
    expect(found[0]).toEqual({ id: '233194655', title: 'Ghost Town', artists: ['The Specials'] });
    expect(found[1]).toMatchObject({ id: '233165577', title: 'Ghost Town (Extended Version)' });
    expect(found.length).toBeLessThanOrEqual(6);

    const [url, init] = fetch.mock.calls[0]!;
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe('https://openapi.tidal.com/v2/searchResults');
    expect(parsed.searchParams.get('filter[query]')).toBe('Ghost Town The Specials');
    expect(parsed.searchParams.get('include')).toBe('tracks,tracks.artists');
    expect(parsed.searchParams.get('countryCode')).toBe('FR');
    expect(init?.headers).toEqual({ accept: 'application/vnd.api+json', Authorization: 'Bearer T' });
  });

  it('suit l\'ordre de la relation et non celui de `included`', async () => {
    const reversed = { ...searchTracks, included: [...searchTracks.included].reverse() };
    const { api } = setup(() => json(reversed));
    expect((await api.searchTracks('x'))[0]!.id).toBe('233194655');
  });

  it('respecte la limite demandée', async () => {
    const { api } = setup(() => json(searchTracks));
    expect(await api.searchTracks('x', 2)).toHaveLength(2);
  });

  it('rend les albums avec leurs artistes, et les artistes', async () => {
    expect((await setup(() => json(searchAlbums)).api.searchAlbums('Abbey Road The Beatles'))[0]).toEqual({ id: '55130630', title: 'Abbey Road (Remastered)', artists: ['The Beatles'] });
    expect((await setup(() => json(searchArtists)).api.searchArtists('The Beatles'))[0]).toEqual({ id: '3634161', name: 'The Beatles' });
  });
});

describe('createTidalApi, pistes', () => {
  it("rend les pistes d'un album dans l'ordre de l'album", async () => {
    const { api, fetch } = setup(() => json(albumItems));
    const items = await api.albumTracks('11564033');
    expect(items[0]).toEqual({ id: '11564034', title: 'Love Me Do' });
    expect(items).toHaveLength(5);
    const parsed = new URL(fetch.mock.calls[0]![0]);
    expect(parsed.pathname).toBe('/v2/albums/11564033/relationships/items');
    expect(parsed.searchParams.get('include')).toBe('items');
  });

  it("suit les pages d'un grand album, au plus 5", async () => {
    const page = (cursor?: string) => ({ ...albumItems, links: cursor ? { meta: { nextCursor: cursor } } : {} });
    const { api, fetch } = setup((url) => json(new URL(url).searchParams.get('page[cursor]') === 'C2' ? page() : page('C2')));
    expect(await api.albumTracks('1')).toHaveLength(10);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(fetch.mock.calls[1]![0]).searchParams.get('page[cursor]')).toBe('C2');

    const endless = setup(() => json(page('C2')));
    await endless.api.albumTracks('1');
    expect(endless.fetch).toHaveBeenCalledTimes(5);
  });

  it("rend les titres d'un artiste, sans doublons de collapse, limités", async () => {
    const { api, fetch } = setup(() => json(artistTracks));
    const items = await api.artistTracks('116', 3);
    expect(items[0]).toEqual({ id: '37667986', title: 'Mrs. Robinson (From "The Graduate" Soundtrack)' });
    expect(items).toHaveLength(3);
    const parsed = new URL(fetch.mock.calls[0]![0]);
    expect(parsed.pathname).toBe('/v2/artists/116/relationships/tracks');
    expect(parsed.searchParams.get('collapseBy')).toBe('FINGERPRINT');
    expect(parsed.searchParams.get('include')).toBe('tracks');
  });
});

describe('createTidalApi, erreurs', () => {
  it('retente une fois avec un jeton neuf après un 401, puis délie logiquement', async () => {
    const answers = [json({}, 401), json(searchArtists)];
    const { api, session } = setup(() => answers.shift()!);
    await api.searchArtists('x');
    expect(session.accessToken.mock.calls.map((call) => call[0])).toEqual([false, true]);

    const refused = setup(() => json({}, 401));
    await expect(refused.api.searchArtists('x')).rejects.toMatchObject({ code: 'not-linked' });
  });

  it('un 429 met la recherche en pause (Retry-After lu), sans rien envoyer pendant la pause', async () => {
    const { api, fetch, advance } = setup(() => json({}, 429, { 'Retry-After': '30' }));
    await expect(api.searchArtists('x')).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 30_000 });
    await expect(api.searchArtists('x')).rejects.toMatchObject({ code: 'rate-limited' });
    expect(fetch).toHaveBeenCalledTimes(1);
    advance(30_001);
    await expect(api.searchArtists('x')).rejects.toMatchObject({ code: 'rate-limited' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('sans Retry-After lisible, l\'attente démarre à 5 s', async () => {
    const { api } = setup(() => json({}, 429));
    await expect(api.searchArtists('x')).rejects.toMatchObject({ code: 'rate-limited', retryAfterMs: 5_000 });
  });

  it('une réponse illisible ou une erreur serveur donne une erreur http', async () => {
    await expect(setup(() => json({ nimporte: 'quoi' })).api.searchArtists('x')).rejects.toMatchObject({ code: 'http' });
    await expect(setup(() => json({}, 500)).api.searchArtists('x')).rejects.toMatchObject({ code: 'http' });
  });
});
```

Si `resolveJsonModule` n'est pas actif, Vitest importe quand même les `.json` ; le typecheck suit `tsconfig` (vérifier `npm run typecheck` à l'étape 5).

- [ ] **Step 4:** `npx vitest run tests/core/tidal/tidal-api.test.ts` — Expected : FAIL (module introuvable).

- [ ] **Step 5: Implémentation**

`src/core/tidal/tidal-api.ts` :

```ts
import { z } from 'zod';
import type { KeyValueStore } from '../cache/store';
import { createCallQueue, type Priority } from '../spotify/call-queue';
import { createLimitGate } from '../spotify/limit-gate';
import { TIDAL_API_URL } from './config';
import { TidalError } from './errors';
import type { TidalFetch, TidalSession } from './tidal-session';

export type TidalTrack = { id: string; title: string; artists: string[] };
export type TidalAlbum = { id: string; title: string; artists: string[] };
export type TidalArtist = { id: string; name: string };
type Item = { id: string; title: string };

// Délai minimal entre deux appels : Tidal ne publie pas sa limite, estimation à ajuster à l'usage.
const PAGE_GAP_MS = 250;
const SEARCH_MAX = 10;
// Un album a rarement plus de 100 pistes : 5 pages de 20 suffisent.
const MAX_PAGES = 5;
const FAMILY = 'catalog' as const;

const linkSchema = z.object({ id: z.string(), type: z.string() });
const relationSchema = z.object({ data: z.union([z.array(linkSchema), linkSchema]).nullish() });
const resourceSchema = z.object({
  id: z.string(),
  type: z.string(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  relationships: z.record(z.string(), relationSchema).optional(),
});
const documentSchema = z.object({
  data: z.union([resourceSchema, z.array(resourceSchema)]),
  included: z.array(resourceSchema).optional(),
  links: z.object({ meta: z.object({ nextCursor: z.string().optional() }).optional() }).optional(),
});

type Resource = z.infer<typeof resourceSchema>;
type Doc = z.infer<typeof documentSchema>;
type Link = z.infer<typeof linkSchema>;
type Index = Map<string, Resource>;

const keyOf = (type: string, id: string): string => `${type}:${id}`;
const indexOf = (doc: Doc): Index => new Map((doc.included ?? []).map((resource) => [keyOf(resource.type, resource.id), resource] as const));
const linksOf = (resource: Resource | undefined, relation: string): Link[] => {
  const data = resource?.relationships?.[relation]?.data;
  return Array.isArray(data) ? data : data ? [data] : [];
};
const attribute = (resource: Resource, name: string): string | null => {
  const value = resource.attributes?.[name];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
};
// « Ghost Town » + version « Live » : « Ghost Town (Live) ».
const titled = (resource: Resource): string | null => {
  const title = attribute(resource, 'title');
  if (!title) return null;
  const version = attribute(resource, 'version');
  return version ? `${title} (${version})` : title;
};
const artistNames = (resource: Resource, index: Index): string[] =>
  linksOf(resource, 'artists').flatMap((link) => {
    const artist = index.get(keyOf('artists', link.id));
    const name = artist ? attribute(artist, 'name') : null;
    return name ? [name] : [];
  });
// Les ressources d'une relation, dans l'ordre de Tidal (la pertinence) : `included` n'est pas ordonné.
const ranked = (root: Resource | undefined, relation: string, type: string, index: Index): Resource[] =>
  linksOf(root, relation).flatMap((link) => {
    const resource = index.get(keyOf(type, link.id));
    return resource ? [resource] : [];
  });
const rootOf = (doc: Doc): Resource | undefined => (Array.isArray(doc.data) ? doc.data[0] : doc.data);

export function createTidalApi(deps: {
  session: Pick<TidalSession, 'accessToken'>;
  fetch: TidalFetch;
  store: KeyValueStore;
  countryCode: string;
  now?: () => number;
  // Remplaçables en test.
  gaps?: Partial<Record<Priority, number>>;
  sleep?: (ms: number) => Promise<void>;
}) {
  const { session, fetch, store, countryCode, now = () => Date.now(), gaps, sleep } = deps;
  const gate = createLimitGate({ store, now, prefix: 'tidal-limit' });
  const queue = createCallQueue({ gaps: { now: 0, page: PAGE_GAP_MS, image: PAGE_GAP_MS, ...gaps }, now, ...(sleep ? { sleep } : {}) });

  async function sendNow(path: string, query: Record<string, string>): Promise<Response> {
    const url = `${TIDAL_API_URL}${path}?${new URLSearchParams({ countryCode, ...query }).toString()}`;
    for (let attempt = 0; ; attempt += 1) {
      const token = await session.accessToken(attempt > 0);
      const response = await fetch(url, { headers: { accept: 'application/vnd.api+json', Authorization: `Bearer ${token}` } });
      // Toute autre réponse prouve que la limite est levée.
      if (response.status !== 429) await gate.success(FAMILY);
      if (response.status === 401) {
        // Un seul essai avec un jeton neuf.
        if (attempt === 0) continue;
        throw new TidalError('not-linked', 'Jeton Tidal refusé');
      }
      if (response.status === 429) {
        // `Retry-After` n'est lisible que par le service worker de l'extension (CORS : page web, WebView de l'APK).
        const seconds = Number(response.headers.get('Retry-After'));
        const { waitMs, until } = await gate.trip(FAMILY, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null);
        console.warn('[wikimasters-tools]', `Tidal : limite atteinte (${path}), pause de ${Math.round(waitMs / 1000)} s`);
        throw new TidalError('rate-limited', 'Trop de requêtes', waitMs, until);
      }
      if (!response.ok) throw new TidalError('http', `Tidal : HTTP ${response.status}`);
      return response;
    }
  }

  // Pendant la pause, un appel échoue tout de suite, sans rien envoyer.
  async function get(path: string, query: Record<string, string>): Promise<Doc> {
    const guard = async (): Promise<void> => {
      const remaining = await gate.remainingMs(FAMILY);
      if (remaining > 0) throw new TidalError('rate-limited', 'Limite Tidal atteinte', remaining, now() + remaining);
    };
    const response = await queue.run('page', () => sendNow(path, query), guard);
    const parsed = documentSchema.safeParse(await response.json());
    if (!parsed.success) throw new TidalError('http', 'Réponse Tidal inattendue');
    return parsed.data;
  }

  const search = (query: string, include: string) => get('/searchResults', { 'filter[query]': query, include });

  return {
    async searchTracks(query: string, limit = SEARCH_MAX): Promise<TidalTrack[]> {
      const doc = await search(query, 'tracks,tracks.artists');
      const index = indexOf(doc);
      return ranked(rootOf(doc), 'tracks', 'tracks', index)
        .flatMap((resource) => {
          const title = titled(resource);
          return title ? [{ id: resource.id, title, artists: artistNames(resource, index) }] : [];
        })
        .slice(0, limit);
    },

    async searchAlbums(query: string, limit = SEARCH_MAX): Promise<TidalAlbum[]> {
      const doc = await search(query, 'albums,albums.artists');
      const index = indexOf(doc);
      return ranked(rootOf(doc), 'albums', 'albums', index)
        .flatMap((resource) => {
          const title = titled(resource);
          return title ? [{ id: resource.id, title, artists: artistNames(resource, index) }] : [];
        })
        .slice(0, limit);
    },

    async searchArtists(query: string, limit = SEARCH_MAX): Promise<TidalArtist[]> {
      const doc = await search(query, 'artists');
      const index = indexOf(doc);
      return ranked(rootOf(doc), 'artists', 'artists', index)
        .flatMap((resource) => {
          const name = attribute(resource, 'name');
          return name ? [{ id: resource.id, name }] : [];
        })
        .slice(0, limit);
    },

    // Les pistes d'un album dans l'ordre de l'album (la relation `items`), page après page.
    async albumTracks(albumId: string): Promise<Item[]> {
      const items: Item[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const doc = await get(`/albums/${encodeURIComponent(albumId)}/relationships/items`, { include: 'items', ...(cursor ? { 'page[cursor]': cursor } : {}) });
        const index = indexOf(doc);
        for (const link of Array.isArray(doc.data) ? doc.data : []) {
          const resource = link.type === 'tracks' ? index.get(keyOf('tracks', link.id)) : undefined;
          const title = resource ? titled(resource) : null;
          if (title) items.push({ id: link.id, title });
        }
        cursor = doc.links?.meta?.nextCursor;
        if (!cursor) break;
      }
      return items;
    },

    // Les titres les plus en vue d'un artiste (Tidal les classe par pertinence), sans doublons de version identique.
    async artistTracks(artistId: string, limit = SEARCH_MAX): Promise<Item[]> {
      const doc = await get(`/artists/${encodeURIComponent(artistId)}/relationships/tracks`, { collapseBy: 'FINGERPRINT', include: 'tracks' });
      const index = indexOf(doc);
      return (Array.isArray(doc.data) ? doc.data : [])
        .flatMap((link) => {
          const resource = index.get(keyOf('tracks', link.id));
          const title = resource ? titled(resource) : null;
          return title ? [{ id: link.id, title }] : [];
        })
        .slice(0, limit);
    },
  };
}

export type TidalApi = ReturnType<typeof createTidalApi>;
```

- [ ] **Step 6: Vérifier**

Run : `npx vitest run tests/core/tidal/tidal-api.test.ts tests/core/spotify/limit-gate.test.ts` puis `npm run typecheck`
Expected : PASS ; si le typecheck refuse l'import des `.json`, ajouter `"resolveJsonModule": true` aux `compilerOptions` de `tsconfig.json` (à vérifier d'abord : WXT l'active souvent).

- [ ] **Step 7: Commit**

```bash
git add src/core/spotify/limit-gate.ts src/core/tidal/tidal-api.ts tests/core/spotify/limit-gate.test.ts tests/core/tidal
git commit -m "feat: client du catalogue Tidal (recherche, pistes d'un album, titres d'un artiste), pause sur 429"
```

---

### Task 5: Trouver l'écoute d'une carte sur Tidal

**Files:**
- Create: `src/core/tidal/tidal-listen.ts`
- Test: `tests/core/tidal/tidal-listen.test.ts`

**Interfaces:**
- Consumes: `TidalApi` (`searchTracks`, `searchAlbums`, `searchArtists`, `albumTracks`, `artistTracks`), `Listen`, `cleanTitle`, `normalize` (`src/core/music/listen`), `CardMusic`, `MusicKind`.
- Produces: `resolveTidalListen(api: TidalSearch, input: { title: string; kind: MusicKind; music: CardMusic }): Promise<Listen | null>` ; `tidalUrl(uri: string): string | null` ; `type TidalSearch = Pick<TidalApi, 'searchTracks'|'searchAlbums'|'searchArtists'|'albumTracks'|'artistTracks'>`. Les URI valent `tidal:track:{id}` et `tidal:album:{id}` ; `tidalUrl('tidal:track:1')` vaut `https://tidal.com/browse/track/1`.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { describe, expect, it, vi } from 'vitest';
import { resolveTidalListen, tidalUrl, type TidalSearch } from '../../../src/core/tidal/tidal-listen';

const api = (over: Partial<TidalSearch> = {}): TidalSearch => ({
  searchTracks: vi.fn(async () => []),
  searchAlbums: vi.fn(async () => []),
  searchArtists: vi.fn(async () => []),
  albumTracks: vi.fn(async () => []),
  artistTracks: vi.fn(async () => []),
  ...over,
});

describe('resolveTidalListen, titre', () => {
  it('prend le premier titre dont le nom et l\'artiste correspondent', async () => {
    const searchTracks = vi.fn(async () => [
      { id: '1', title: 'Ghost Town', artists: ['Reprise Band'] },
      { id: '2', title: 'Ghost Town', artists: ['The Specials'] },
    ]);
    const listen = await resolveTidalListen(api({ searchTracks }), { title: 'Ghost_Town_(chanson)', kind: 'track', music: { performer: 'The Specials' } });
    expect(searchTracks).toHaveBeenCalledWith('Ghost Town The Specials');
    expect(listen).toEqual({ kind: 'track', items: [{ uri: 'tidal:track:2', title: 'Ghost Town', artist: 'The Specials' }] });
  });

  it('accepte une version du titre, refuse un autre titre, et rend null sans interprète', async () => {
    const searchTracks = vi.fn(async () => [{ id: '9', title: 'Ghost Town (Live)', artists: ['The Specials'] }, { id: '8', title: 'Ghost Towns', artists: ['The Specials'] }]);
    expect((await resolveTidalListen(api({ searchTracks }), { title: 'Ghost Town', kind: 'track', music: { performer: 'The Specials' } }))?.items[0]?.uri).toBe('tidal:track:9');
    const none = api();
    expect(await resolveTidalListen(none, { title: 'Ghost Town', kind: 'track', music: {} })).toBeNull();
    expect(none.searchTracks).not.toHaveBeenCalled();
    expect(await resolveTidalListen(api(), { title: 'Ghost Town', kind: 'track', music: { performer: 'X' } })).toBeNull();
  });
});

describe('resolveTidalListen, album', () => {
  it('choisit l\'album du bon artiste, pas un hommage au titre voisin, et nomme les pistes d\'après l\'album', async () => {
    const searchAlbums = vi.fn(async () => [
      { id: 'L', title: 'Lucinda Williams Sings The Beatles From Abbey Road', artists: ['Lucinda Williams'] },
      { id: 'A', title: 'Abbey Road (Remastered)', artists: ['The Beatles'] },
    ]);
    const albumTracks = vi.fn(async () => [{ id: 't1', title: 'Come Together' }, { id: 't2', title: 'Something' }]);
    const listen = await resolveTidalListen(api({ searchAlbums, albumTracks }), { title: 'Abbey_Road', kind: 'album', music: { performer: 'The Beatles' } });
    expect(searchAlbums).toHaveBeenCalledWith('Abbey Road The Beatles');
    expect(albumTracks).toHaveBeenCalledWith('A');
    expect(listen).toEqual({
      kind: 'album',
      albumUri: 'tidal:album:A',
      items: [
        { uri: 'tidal:track:t1', title: 'Come Together', artist: 'The Beatles' },
        { uri: 'tidal:track:t2', title: 'Something', artist: 'The Beatles' },
      ],
    });
  });

  it('cherche par le seul titre sans interprète, et rend null sans album ou sans piste', async () => {
    const searchAlbums = vi.fn(async () => [{ id: 'A', title: 'Abbey Road', artists: ['The Beatles'] }]);
    await resolveTidalListen(api({ searchAlbums, albumTracks: async () => [{ id: 't', title: 'x' }] }), { title: 'Abbey Road', kind: 'album', music: {} });
    expect(searchAlbums).toHaveBeenCalledWith('Abbey Road');
    expect(await resolveTidalListen(api(), { title: 'Abbey Road', kind: 'album', music: { performer: 'The Beatles' } })).toBeNull();
    expect(await resolveTidalListen(api({ searchAlbums, albumTracks: async () => [] }), { title: 'Abbey Road', kind: 'album', music: {} })).toBeNull();
  });
});

describe('resolveTidalListen, artiste', () => {
  it("exige un artiste du même nom (la 1ʳᵉ réponse n'est pas toujours la bonne) et retire les titres en double", async () => {
    const searchArtists = vi.fn(async () => [{ id: '116', name: 'Simon & Garfunkel' }, { id: '3634161', name: 'The Beatles' }]);
    const artistTracks = vi.fn(async () => [
      { id: '1', title: 'Yesterday' },
      { id: '2', title: 'yesterday' },
      { id: '3', title: 'Help!' },
    ]);
    const listen = await resolveTidalListen(api({ searchArtists, artistTracks }), { title: 'The_Beatles', kind: 'artist', music: {} });
    expect(searchArtists).toHaveBeenCalledWith('The Beatles');
    expect(artistTracks).toHaveBeenCalledWith('3634161', 10);
    expect(listen).toEqual({
      kind: 'artist',
      items: [
        { uri: 'tidal:track:1', title: 'Yesterday', artist: 'The Beatles' },
        { uri: 'tidal:track:3', title: 'Help!', artist: 'The Beatles' },
      ],
    });
    expect(await resolveTidalListen(api({ searchArtists: async () => [{ id: '1', name: 'Autre' }] }), { title: 'The Beatles', kind: 'artist', music: {} })).toBeNull();
  });
});

describe('tidalUrl', () => {
  it("rend la page d'écoute Tidal d'une piste ou d'un album, null pour le reste", () => {
    expect(tidalUrl('tidal:track:118389958')).toBe('https://tidal.com/browse/track/118389958');
    expect(tidalUrl('tidal:album:11564033')).toBe('https://tidal.com/browse/album/11564033');
    expect(tidalUrl('spotify:track:1')).toBeNull();
    expect(tidalUrl('tidal:track:abc')).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/core/tidal/tidal-listen.test.ts` — Expected : FAIL.

- [ ] **Step 3: Implémentation**

`src/core/tidal/tidal-listen.ts` :

```ts
import { cleanTitle, normalize, type Listen } from '../music/listen';
import type { MusicKind } from '../music/music-kinds';
import type { CardMusic } from '../music/wikidata-music';
import type { TidalApi } from './tidal-api';

export type TidalSearch = Pick<TidalApi, 'searchTracks' | 'searchAlbums' | 'searchArtists' | 'albumTracks' | 'artistTracks'>;

const trackUri = (id: string): string => `tidal:track:${id}`;
const albumUri = (id: string): string => `tidal:album:${id}`;
const TOP_TRACKS = 10;

// La page d'écoute Tidal d'une piste ou d'un album (le ↗ de la fiche) ; null pour toute autre URI.
export function tidalUrl(uri: string): string | null {
  const match = /^tidal:(track|album):(\d+)$/.exec(uri);
  return match ? `https://tidal.com/browse/${match[1]}/${match[2]}` : null;
}

// « Abbey Road (Remastered) » compte pour « Abbey Road » ; « Ghost Towns » ou un hommage qui contient le titre, non.
const sameTitle = (candidate: string, wanted: string): boolean => {
  const found = normalize(candidate);
  const target = normalize(wanted);
  return found === target || found.startsWith(`${target} `);
};
// Un artiste qui en contient un autre (« A, B » et « A ») compte comme le même.
const hasArtist = (artists: string[], performer: string): boolean => {
  const target = normalize(performer);
  return artists.some((name) => {
    const found = normalize(name);
    return found.includes(target) || target.includes(found);
  });
};

// Ce qu'on peut écouter d'une carte sur Tidal : une recherche titre + interprète, vérifiée (la 1ʳᵉ réponse n'est pas toujours la bonne).
export async function resolveTidalListen(api: TidalSearch, input: { title: string; kind: MusicKind; music: CardMusic }): Promise<Listen | null> {
  const { kind, music } = input;
  const title = cleanTitle(input.title);
  const performer = music.performer;

  if (kind === 'track') {
    if (!performer) return null;
    const hit = (await api.searchTracks(`${title} ${performer}`)).find((track) => sameTitle(track.title, title) && hasArtist(track.artists, performer));
    return hit ? { kind, items: [{ uri: trackUri(hit.id), title: hit.title, artist: hit.artists.join(', ') }] } : null;
  }

  if (kind === 'album') {
    const hit = (await api.searchAlbums(performer ? `${title} ${performer}` : title)).find((album) => sameTitle(album.title, title) && (!performer || hasArtist(album.artists, performer)));
    if (!hit) return null;
    const items = await api.albumTracks(hit.id);
    const artist = hit.artists.join(', ');
    return items.length > 0 ? { kind, albumUri: albumUri(hit.id), items: items.map((item) => ({ uri: trackUri(item.id), title: item.title, artist })) } : null;
  }

  // Artiste : seulement un artiste du même nom, puis ses titres les plus en vue (un seul par titre).
  const artist = (await api.searchArtists(title)).find((candidate) => normalize(candidate.name) === normalize(title));
  if (!artist) return null;
  const seen = new Set<string>();
  const items = (await api.artistTracks(artist.id, TOP_TRACKS)).filter((track) => {
    const key = normalize(track.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return items.length > 0 ? { kind, items: items.map((track) => ({ uri: trackUri(track.id), title: track.title, artist: artist.name })) } : null;
}
```

- [ ] **Step 4:** `npx vitest run tests/core/tidal/tidal-listen.test.ts` — Expected : PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/tidal/tidal-listen.ts tests/core/tidal/tidal-listen.test.ts
git commit -m "feat: trouver l'écoute d'une carte sur Tidal (titre, album, artiste), avec vérification du nom et de l'artiste"
```

---

### Task 6: Service Tidal et routeur de plateforme

**Files:**
- Create: `src/content/tidal-service.ts`, `src/content/platform-service.ts`
- Test: `tests/content/tidal-service.test.ts`, `tests/content/platform-service.test.ts`

**Interfaces:**
- Consumes: `createListenViewer`, `resolveTidalListen`, `TidalSearch`, `TidalSession`, `tidalMessage`, `TidalError`, `PlatformSetting`, `Platform`, `MusicService`.
- Produces:
  - `createTidalService(deps: { collection; kinds; music; listens; session: Pick<TidalSession,'isLinked'|'link'|'unlink'|'subscribe'>; api: TidalSearch })` → `{ view; refresh; playingSlugs; play; link; unlink; subscribe; isLinked }` (mêmes signatures que `MusicService`).
  - `createPlatformMusicService(setting: PlatformSetting, services: Partial<Record<Platform, PlatformServiceLike>>): MusicService` ; `type PlatformServiceLike = Pick<MusicService, 'view'|'refresh'|'play'|'link'|'unlink'|'subscribe'|'isLinked'|'playingSlugs'>`. Une plateforme choisie mais absente de `services` retombe sur Spotify. `subscribe` prévient aussi quand le réglage change.

- [ ] **Step 1: Écrire les tests qui échouent**

`tests/content/tidal-service.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTidalService } from '../../src/content/tidal-service';
import { createMemoryStore } from '../../src/core/cache/store';
import { createListenRepo } from '../../src/core/music/listen-repo';
import { TidalError } from '../../src/core/tidal/errors';

function setup(over: { linked?: boolean; searchAlbums?: () => Promise<never[]> } = {}) {
  const store = createMemoryStore();
  const api = {
    searchTracks: vi.fn(async () => []),
    searchAlbums: vi.fn(over.searchAlbums ?? (async () => [{ id: 'A', title: 'Abbey Road', artists: ['The Beatles'] }] as never)),
    searchArtists: vi.fn(async () => []),
    albumTracks: vi.fn(async () => [{ id: 't1', title: 'Come Together' }]),
    artistTracks: vi.fn(async () => []),
  };
  const session = { isLinked: vi.fn(async () => over.linked ?? true), link: vi.fn(async () => undefined), unlink: vi.fn(async () => undefined), subscribe: vi.fn(() => () => undefined) };
  const service = createTidalService({
    collection: { list: async () => [{ slug: 'Abbey_Road', title: 'Abbey_Road' }] },
    kinds: { resolveMissing: async () => undefined, load: async () => ({ cards: { Abbey_Road: { natures: ['Q482994'], occupations: [], genres: [] } }, labels: {} }) as never },
    music: { resolve: async () => ({ Abbey_Road: { performer: 'The Beatles' } }) as never },
    listens: createListenRepo(store, () => Date.now(), 'listens-tidal-v1'),
    session,
    api,
  });
  return { service, api, session, store };
}

describe('createTidalService', () => {
  it("rend les pistes de l'album et les garde dans le dépôt Tidal, jamais dans celui de Spotify", async () => {
    const { service, api, store } = setup();
    const view = await service.view('Abbey_Road', 'Abbey Road');
    expect(view).toMatchObject({ status: 'ready', listen: { kind: 'album', albumUri: 'tidal:album:A' } });
    await service.view('Abbey_Road', 'Abbey Road');
    expect(api.searchAlbums).toHaveBeenCalledTimes(1);
    expect(await store.get('listens-tidal-v1')).toBeTruthy();
    expect(await store.get('listens-v1')).toBeUndefined();
  });

  it('rend unlinked sans compte, notfound sans résultat, et un message Tidal en cas d\'erreur', async () => {
    expect(await setup({ linked: false }).service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'unlinked' });
    expect(await setup({ searchAlbums: async () => [] }).service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'notfound' });
    const failing = setup();
    failing.api.searchAlbums.mockRejectedValueOnce(new TidalError('rate-limited', 'x', 4_000));
    expect(await failing.service.view('Abbey_Road', 'Abbey Road')).toEqual({ status: 'error', message: 'Tidal demande de patienter un instant. Réessaie dans quelques secondes.', retryAfterMs: 4_000 });
  });

  it('lie, délie et expose la liaison ; pas de titre « en cours » ni de lecture dans l\'appli', async () => {
    const { service, session } = setup();
    expect(await service.link()).toBeNull();
    await service.unlink();
    expect(session.link).toHaveBeenCalledTimes(1);
    expect(session.unlink).toHaveBeenCalledTimes(1);
    expect(await service.isLinked()).toBe(true);
    expect(await service.playingSlugs([{ slug: 'Abbey_Road', title: 'x' }], { uri: 'tidal:track:t1', title: 'x', artist: 'y' })).toEqual(new Set());
  });

  it('rend la cause d\'une liaison qui échoue', async () => {
    const { service, session } = setup();
    session.link.mockRejectedValueOnce(new TidalError('auth-cancelled', 'x'));
    expect(await service.link()).toBe('Liaison Tidal annulée.');
    session.link.mockRejectedValueOnce(new Error('adresse de retour refusée'));
    expect(await service.link()).toBe('Liaison Tidal impossible : adresse de retour refusée');
  });
});
```

`tests/content/platform-service.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createPlatformMusicService, type PlatformServiceLike } from '../../src/content/platform-service';
import { createPlatformSetting } from '../../src/core/music/platform';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
};

const fake = (name: string): PlatformServiceLike & { listeners: Set<() => void> } => {
  const listeners = new Set<() => void>();
  return {
    listeners,
    view: vi.fn(async () => ({ status: 'error' as const, message: name })),
    refresh: vi.fn(async () => ({ status: 'error' as const, message: `${name}+` })),
    play: vi.fn(async () => name),
    link: vi.fn(async () => name),
    unlink: vi.fn(async () => undefined),
    isLinked: vi.fn(async () => name === 'tidal'),
    playingSlugs: vi.fn(async () => new Set([name])),
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    }),
  };
};

describe('createPlatformMusicService', () => {
  it('délègue à la plateforme choisie, et suit le réglage', async () => {
    const spotify = fake('spotify');
    const tidal = fake('tidal');
    const setting = createPlatformSetting(memory());
    const service = createPlatformMusicService(setting, { spotify, tidal });
    expect(await service.view('S', 'T')).toEqual({ status: 'error', message: 'spotify' });
    expect(await service.isLinked()).toBe(false);
    setting.set('tidal');
    expect(await service.view('S', 'T')).toEqual({ status: 'error', message: 'tidal' });
    expect(await service.refresh('S', 'T')).toEqual({ status: 'error', message: 'tidal+' });
    expect(await service.link()).toBe('tidal');
    expect(await service.isLinked()).toBe(true);
    await service.unlink();
    expect(tidal.unlink).toHaveBeenCalledTimes(1);
    expect(spotify.unlink).not.toHaveBeenCalled();
    expect(await service.playingSlugs([], { uri: 'u', title: 't', artist: 'a' })).toEqual(new Set(['tidal']));
  });

  it('retombe sur Spotify quand la plateforme choisie n\'est pas disponible', async () => {
    const spotify = fake('spotify');
    const setting = createPlatformSetting(memory());
    setting.set('tidal');
    expect(await createPlatformMusicService(setting, { spotify }).view('S', 'T')).toEqual({ status: 'error', message: 'spotify' });
  });

  it('prévient les abonnés quand le réglage change ou qu\'un compte est lié, et se désabonne de tout', () => {
    const spotify = fake('spotify');
    const tidal = fake('tidal');
    const setting = createPlatformSetting(memory());
    const service = createPlatformMusicService(setting, { spotify, tidal });
    const listener = vi.fn();
    const off = service.subscribe(listener);
    setting.set('tidal');
    tidal.listeners.forEach((l) => l());
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    expect(spotify.listeners.size + tidal.listeners.size).toBe(0);
    setting.set('spotify');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/content/tidal-service.test.ts tests/content/platform-service.test.ts` — Expected : FAIL.

- [ ] **Step 3: Implémentation**

`src/content/tidal-service.ts` :

```ts
import type { KnownCard } from '../core/collection/collection-book';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { ListenRepo } from '../core/music/listen-repo';
import type { MusicRepo } from '../core/music/music-repo';
import { TidalError, tidalMessage } from '../core/tidal/errors';
import type { TidalSession } from '../core/tidal/tidal-session';
import { resolveTidalListen, type TidalSearch } from '../core/tidal/tidal-listen';
import { createListenViewer } from './listen-viewer';

export type TidalServiceDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  music: Pick<MusicRepo, 'resolve'>;
  // Les listes déjà trouvées sur Tidal (leur propre dépôt) : Tidal n'est interrogé qu'une fois par carte.
  listens: Pick<ListenRepo, 'load' | 'save'>;
  session: Pick<TidalSession, 'isLinked' | 'link' | 'unlink' | 'subscribe'>;
  api: TidalSearch;
};

// La fiche « Écouter » d'une carte pour Tidal : les pistes, avec leur lien d'écoute (la lecture dans l'appli viendra ensuite).
export function createTidalService(deps: TidalServiceDeps) {
  const { collection, kinds, music, listens, session, api } = deps;
  const viewer = createListenViewer({
    collection,
    kinds,
    music,
    listens,
    session,
    resolve: (input) => resolveTidalListen(api, input),
    describeError: (error) => {
      const retryAfterMs = error instanceof TidalError && error.code === 'rate-limited' ? error.retryAfterMs : undefined;
      return { message: tidalMessage(error), ...(retryAfterMs === undefined ? {} : { retryAfterMs }) };
    },
  });

  return {
    view: (slug: string, title: string) => viewer.show(slug, title, false),
    refresh: (slug: string, title: string) => viewer.show(slug, title, true),
    // Rien ne joue dans l'appli pour Tidal : aucune carte n'est « en cours ».
    playingSlugs: async (_cards?: unknown, _track?: unknown): Promise<Set<string>> => new Set<string>(),
    // Pas de lecture dans l'appli pour l'instant : le lien ↗ de chaque piste ouvre Tidal.
    play: async (): Promise<string | null> => 'Utilise le lien pour écouter sur Tidal.',
    async link(): Promise<string | null> {
      try {
        await session.link();
        return null;
      } catch (error) {
        // Une erreur hors Tidal (fenêtre d'autorisation refusée, adresse de retour non déclarée…) : on en montre la cause.
        if (error instanceof Error && !(error instanceof TidalError)) return `Liaison Tidal impossible : ${error.message}`;
        return tidalMessage(error);
      }
    },
    unlink: () => session.unlink(),
    isLinked: () => session.isLinked(),
    subscribe: (listener: () => void) => session.subscribe(listener),
  };
}

export type TidalService = ReturnType<typeof createTidalService>;
```

`src/content/platform-service.ts` :

```ts
import type { Platform, PlatformSetting } from '../core/music/platform';
import type { MusicService } from './music-service';

export type PlatformServiceLike = Pick<MusicService, 'view' | 'refresh' | 'play' | 'link' | 'unlink' | 'subscribe' | 'isLinked' | 'playingSlugs'>;

// Un seul service pour l'interface : il délègue à la plateforme choisie (Spotify si elle n'est pas disponible).
export function createPlatformMusicService(setting: PlatformSetting, services: Partial<Record<Platform, PlatformServiceLike>>): MusicService {
  const active = (): PlatformServiceLike => services[setting.current()] ?? (services.spotify as PlatformServiceLike);

  return {
    view: (slug, title) => active().view(slug, title),
    refresh: (slug, title) => active().refresh(slug, title),
    play: (item, listen, card) => active().play(item, listen, card),
    link: () => active().link(),
    unlink: () => active().unlink(),
    isLinked: () => active().isLinked(),
    playingSlugs: (cards, track) => active().playingSlugs(cards, track),
    // Le réglage change, ou un compte est lié ou délié : la fiche se recharge.
    subscribe: (listener) => {
      const offs = [setting.subscribe(listener), ...Object.values(services).map((service) => service.subscribe(listener))];
      return () => offs.forEach((off) => off());
    },
  };
}
```

- [ ] **Step 4:** `npx vitest run tests/content/tidal-service.test.ts tests/content/platform-service.test.ts` puis `npm run typecheck`
Expected : PASS ; si le routeur n'est pas assignable à `MusicService` (types déduits de `createMusicService`), ajuster les signatures du routeur aux siennes (ne rien changer à `createMusicService`).

- [ ] **Step 5: Commit**

```bash
git add src/content/tidal-service.ts src/content/platform-service.ts tests/content/tidal-service.test.ts tests/content/platform-service.test.ts
git commit -m "feat: service Tidal (fiche d'écoute) et routeur de plateforme"
```

---

### Task 7: Brancher Tidal dans l'extension et l'APK

**Files:**
- Modify: `src/core/spotify/transport.ts`, `wxt.config.ts`, `src/android/spotify-env.ts`, `src/app/overlay.ts`
- Modify: `android/app/src/main/java/io/github/maximus49000/wikimasterstools/MainActivity.java`, `android/app/src/main/AndroidManifest.xml`
- Test: `tests/core/spotify/transport.test.ts`, `tests/android/spotify-env.test.ts`

**Interfaces:**
- Consumes: `createTidalSession`, `createTidalApi`, `createTidalService`, `createPlatformMusicService`, `countryOf`, `TIDAL_ANDROID_REDIRECT_URI`.
- Produces: `SpotifyEnv.redirectUriFor?: (service: 'tidal') => Promise<string>` (absent dans l'extension : `redirectUri` vaut pour les deux) ; le service worker relaie `login.tidal.com/authorize?`, `auth.tidal.com/v1/oauth2/token` et `openapi.tidal.com/v2/` ; `MainActivity` accepte l'autorisation Tidal et le retour `wikimasterstools://tidal`.

- [ ] **Step 1: Tests qui échouent**

Ajouter à `tests/core/spotify/transport.test.ts` (dans un nouveau `describe`, en fin de fichier) :

```ts
describe('handleSpotifyMessage — Tidal', () => {
  it("lance l'autorisation vers login.tidal.com seulement", async () => {
    const d = deps();
    const url = 'https://login.tidal.com/authorize?client_id=x';
    expect(await handleSpotifyMessage({ type: 'wmt:spotify', op: 'auth', url }, d)).toMatchObject({ ok: true });
    expect(d.launchWebAuthFlow).toHaveBeenCalledWith(url);
    expect(await handleSpotifyMessage({ type: 'wmt:spotify', op: 'auth', url: 'https://login.tidal.com.evil.example/authorize?x=1' }, d)).toMatchObject({ ok: false });
  });

  it('relaie le catalogue et le jeton de Tidal, rien d’autre chez lui', async () => {
    const d = deps();
    const base: SpotifyRequest = { type: 'wmt:spotify', op: 'fetch', url: 'https://openapi.tidal.com/v2/searchResults?countryCode=FR' };
    expect(await handleSpotifyMessage(base, d)).toMatchObject({ ok: true });
    expect(await handleSpotifyMessage({ ...base, url: 'https://auth.tidal.com/v1/oauth2/token' }, d)).toMatchObject({ ok: true });
    expect(await handleSpotifyMessage({ ...base, url: 'https://auth.tidal.com/v1/oauth2/revoke' }, d)).toMatchObject({ ok: false });
    expect(await handleSpotifyMessage({ ...base, url: 'https://openapi.tidal.com/v1/x' }, d)).toMatchObject({ ok: false });
    expect(d.fetch).toHaveBeenCalledTimes(2);
  });
});
```

Ajouter à `tests/android/spotify-env.test.ts`, dans le `describe` :

```ts
  it("fournit l'adresse de retour de Tidal, distincte de celle de Spotify", async () => {
    const env = createAndroidSpotifyEnv(fakeWindow());
    expect(await env.redirectUri()).toBe('wikimasterstools://spotify');
    expect(await env.redirectUriFor?.('tidal')).toBe('wikimasterstools://tidal');
  });
```

Run : `npx vitest run tests/core/spotify/transport.test.ts tests/android/spotify-env.test.ts` — Expected : FAIL.

- [ ] **Step 2: Implémentation**

`src/core/spotify/transport.ts` :
- type `SpotifyEnv` : ajouter `// Adresse de retour propre à un autre service (l'APK en a une par service) ; absente : redirectUri vaut pour tous.` puis `redirectUriFor?: (service: 'tidal') => Promise<string>;`
- remplacer `const AUTH_PREFIX = 'https://accounts.spotify.com/authorize?';` par `const AUTH_PREFIXES = ['https://accounts.spotify.com/authorize?', 'https://login.tidal.com/authorize?'];`
- `FETCH_PREFIXES` : ajouter `'https://openapi.tidal.com/v2/'` et `'https://auth.tidal.com/v1/oauth2/token'`. Mettre à jour le commentaire : « Le service worker relaie aussi Tidal et TMDB… ».
- dans le bloc `op === 'auth'` :

```ts
        const authUrl = request.url;
        if (typeof authUrl !== 'string' || !AUTH_PREFIXES.some((prefix) => authUrl.startsWith(prefix))) return { ok: false, error: 'adresse refusée' };
        return { ok: true, value: await deps.launchWebAuthFlow(authUrl) };
```

`wxt.config.ts` : dans `host_permissions`, ajouter `'https://openapi.tidal.com/*'`, `'https://auth.tidal.com/*'`, `'https://login.tidal.com/*'` ; adapter les commentaires (`identity` : liaison des comptes Spotify et Tidal ; le service worker appelle Spotify et Tidal).

`src/android/spotify-env.ts` : importer `TIDAL_ANDROID_REDIRECT_URI` depuis `../core/tidal/config`, et dans l'objet retourné ajouter `redirectUriFor: async () => TIDAL_ANDROID_REDIRECT_URI,` sous `redirectUri`.

`MainActivity.java` :
- ajouter `private static final String TIDAL_AUTH_PREFIX = "https://login.tidal.com/authorize?";`
- dans `openAuth` : `if (url == null || !(url.startsWith(SPOTIFY_AUTH_PREFIX) || url.startsWith(TIDAL_AUTH_PREFIX))) return;` et mettre à jour les commentaires (« l'autorisation Spotify ou Tidal »).
- `onNewIntent` : inchangé (il transmet toute adresse `wikimasterstools://…` au rappel unique, l'état `state` distingue les tentatives).

`AndroidManifest.xml` : sous la ligne `<data android:scheme="wikimasterstools" android:host="spotify" />`, ajouter `<data android:scheme="wikimasterstools" android:host="tidal" />`.

`src/app/overlay.ts` : importer `createTidalSession` (`../core/tidal/tidal-session`), `createTidalApi` (`../core/tidal/tidal-api`), `countryOf` (`../core/tidal/config`), `createTidalService` (`../content/tidal-service`), `createPlatformMusicService` (`../content/platform-service`). Dans le bloc `if (spotify) { try { … } }` :
  1. Remplacer `setMusicService(createMusicService({...}));` par `const spotifyService = createMusicService({...});` (mêmes arguments), puis `const platformSetting = createPlatformSetting(window.localStorage);`, `setMusicService(spotifyService);` et remplacer `setPlatformChoice({ available: ['spotify'], setting: createPlatformSetting(window.localStorage) });` par `setPlatformChoice({ available: ['spotify'], setting: platformSetting });`.
  2. Juste après le `catch` de ce bloc (donc une panne de Tidal n'empêche jamais Spotify), mais toujours dans `if (spotify)`, ajouter un second bloc (qui a besoin de `spotifyService`, `musicRepo`, `platformSetting` : les déclarer avant le `try` avec `let`, ou déplacer le bloc Tidal à l'intérieur du `try` dans son propre `try` imbriqué — choisir l'imbrication) :

```ts
      // Tidal : seconde plateforme d'écoute, au choix (jamais mélangée à Spotify). Une panne ici laisse Spotify intact.
      try {
        const tidalSession = createTidalSession({
          store,
          fetch: spotify.fetch,
          authorize: spotify.authorize,
          redirectUri: spotify.redirectUriFor ? () => spotify.redirectUriFor!('tidal') : spotify.redirectUri,
        });
        const tidalApi = createTidalApi({ session: tidalSession, fetch: spotify.fetch, store, countryCode: countryOf(navigator.language) });
        const tidalService = createTidalService({
          collection: collectionRepo,
          kinds: kindsRepo,
          music: musicRepo,
          listens: createListenRepo(store, undefined, 'listens-tidal-v1'),
          session: tidalSession,
          api: tidalApi,
        });
        setMusicService(createPlatformMusicService(platformSetting, { spotify: spotifyService, tidal: tidalService }));
        setPlatformChoice({ available: ['spotify', 'tidal'], setting: platformSetting });
      } catch (error) {
        console.warn(LOG, 'Tidal indisponible :', error);
      }
```

- [ ] **Step 3: Vérifier**

Run : `npx vitest run tests/core/spotify/transport.test.ts tests/android/spotify-env.test.ts` puis `npm test` et `npm run typecheck`
Expected : PASS partout.

- [ ] **Step 4: Commit**

```bash
git add src/core/spotify/transport.ts wxt.config.ts src/android/spotify-env.ts src/app/overlay.ts android/app/src/main
git commit -m "feat: Tidal branché dans l'extension et l'APK (relais du service worker, retour wikimasterstools://tidal)"
```

---

### Task 8: Interface : lien ↗, marque Tidal, réglages et mini-lecteur

**Files:**
- Create: `src/content/usePlatform.ts`
- Modify: `src/content/ListenSection.tsx`, `src/content/PlayerSettings.tsx`, `src/content/SpotifyPlayer.tsx`
- Test: `tests/content/listen-section.test.tsx`, `tests/content/player-settings.test.tsx`, `tests/content/spotify-player.test.tsx`

**Interfaces:**
- Consumes: `getPlatformChoice`, `PLATFORM_LABEL`, `tidalUrl`, `TIDAL_HOME_URL`, `MusicService.isLinked`.
- Produces: `usePlatform(): Platform` (la plateforme choisie, jamais une plateforme indisponible : retombe sur `'spotify'`).

- [ ] **Step 1: `usePlatform` (test puis code)**

Test `tests/content/use-platform.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { setPlatformChoice } from '../../src/content/music-registry';
import { usePlatform } from '../../src/content/usePlatform';
import { createPlatformSetting } from '../../src/core/music/platform';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const memory = (initial?: string) => {
  const data = new Map<string, string>(initial === undefined ? [] : [['wmt:musicPlatform', initial]]);
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
};

function Show() {
  return <span>{usePlatform()}</span>;
}

async function shown(): Promise<string> {
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<Show />));
  const text = container.textContent ?? '';
  await act(async () => root.unmount());
  return text;
}

afterEach(() => setPlatformChoice(null));

describe('usePlatform', () => {
  it('vaut Spotify sans choix enregistré', async () => {
    expect(await shown()).toBe('spotify');
  });

  it('rend la plateforme choisie quand elle est disponible, Spotify sinon', async () => {
    setPlatformChoice({ available: ['spotify', 'tidal'], setting: createPlatformSetting(memory('tidal')) });
    expect(await shown()).toBe('tidal');
    setPlatformChoice({ available: ['spotify'], setting: createPlatformSetting(memory('tidal')) });
    expect(await shown()).toBe('spotify');
  });
});
```

Code `src/content/usePlatform.ts` :

```ts
import { useSyncExternalStore } from 'react';
import type { Platform } from '../core/music/platform';
import { getPlatformChoice } from './music-registry';

const noSubscribe = () => () => undefined;
const spotifyOnly = (): Platform => 'spotify';

// La plateforme d'écoute choisie ; une plateforme indisponible (Tidal a échoué au démarrage) retombe sur Spotify.
export function usePlatform(): Platform {
  const choice = getPlatformChoice();
  const snapshot = choice
    ? (): Platform => {
        const current = choice.setting.current();
        return choice.available.includes(current) ? current : 'spotify';
      }
    : spotifyOnly;
  return useSyncExternalStore(choice?.setting.subscribe ?? noSubscribe, snapshot);
}
```

Run `npx vitest run tests/content/use-platform.test.tsx` (FAIL avant le code, PASS après).

- [ ] **Step 2: Tests d'interface qui échouent**

Dans `tests/content/listen-section.test.tsx`, ajouter aux imports `import { setPlatformChoice } from '../../src/content/music-registry';` (fusionner avec l'import existant de `setMusicService`) et `import { createPlatformSetting } from '../../src/core/music/platform';`, dans l'`afterEach` ajouter `setPlatformChoice(null);`, puis en fin de fichier :

```tsx
describe('ListenSection, Tidal', () => {
  const memory = (initial: string) => {
    const data = new Map<string, string>([['wmt:musicPlatform', initial]]);
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
  };
  const tidalReady = (): ListenView => ({
    status: 'ready',
    listen: { kind: 'album', items: [{ uri: 'tidal:track:11564034', title: 'Love Me Do', artist: 'The Beatles' }], albumUri: 'tidal:album:11564033' },
  });
  const useTidal = () => setPlatformChoice({ available: ['spotify', 'tidal'], setting: createPlatformSetting(memory('tidal')) });

  it('propose un lien vers Tidal par piste (pas de lecture), et la mention Tidal', async () => {
    useTidal();
    serviceOf(vi.fn().mockResolvedValue(tidalReady()));
    await render();
    const link = container.querySelector<HTMLAnchorElement>('a[aria-label="Ouvrir Love Me Do dans Tidal"]');
    expect(link?.getAttribute('href')).toBe('https://tidal.com/browse/track/11564034');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(container.querySelector('button[aria-label="Lire Love Me Do"]')).toBeNull();
    const brand = [...container.querySelectorAll('a')].find((anchor) => anchor.textContent === 'Écoute sur TIDAL');
    expect(brand?.getAttribute('href')).toBe('https://tidal.com');
  });

  it('nomme Tidal quand le compte n\'est pas lié ou que la carte est introuvable', async () => {
    useTidal();
    serviceOf(vi.fn().mockResolvedValue({ status: 'unlinked' }));
    await render();
    expect(container.querySelector('button[aria-label="Lier Tidal pour écouter"]')).not.toBeNull();
    serviceOf(vi.fn().mockResolvedValue({ status: 'notfound' }));
    await relink();
    expect(text()).toContain('Introuvable sur Tidal.');
  });

  it('avec Spotify, la section reste celle d\'avant : ▶ et aucune mention Tidal', async () => {
    serviceOf(vi.fn().mockResolvedValue(ready('Come Together')));
    await render();
    expect(container.querySelector('button[aria-label="Lire Come Together"]')).not.toBeNull();
    expect(text()).not.toContain('TIDAL');
  });
});
```

Dans `tests/content/player-settings.test.tsx`, ajouter dans le `describe('PlayerSettings, plateforme', …)` :

```tsx
  it('avec Tidal : le compte et le bouton suivent Tidal (lié ou non), et le réglage du mini-lecteur Spotify disparaît', async () => {
    const { link } = serve();
    const isLinked = vi.fn(async () => false);
    setMusicService({ link, unlink: vi.fn(), isLinked, view: vi.fn(), play: vi.fn(), subscribe: () => () => undefined } as unknown as MusicService);
    setPlatformChoice({ available: ['spotify', 'tidal'], setting: createPlatformSetting({ getItem: () => 'tidal', setItem: () => undefined }) });
    await render(makeSource(true).source);
    expect(text()).toContain('Compte Tidal : non lié');
    expect(byLabel('Lier Tidal')).not.toBeNull();
    expect(container.querySelector('[aria-label="Affichage du lecteur"]')).toBeNull();
    isLinked.mockResolvedValue(true);
    await press(byLabel('Lier Tidal'));
    expect(link).toHaveBeenCalledTimes(1);
  });
```

Ajouter à `tests/content/spotify-player.test.tsx` (lire d'abord son début pour réutiliser ses helpers `render`/`makeSource`) un test : avec `setPlatformChoice({ available: ['spotify','tidal'], setting: createPlatformSetting({ getItem: () => 'tidal', setItem: () => undefined }) })`, le mini-lecteur d'un compte Spotify lié n'affiche rien (`container.textContent` vide) ; après `setPlatformChoice(null)` il s'affiche.

Run : `npx vitest run tests/content` — Expected : FAIL sur les nouveaux tests.

- [ ] **Step 3: Implémentation de l'interface**

`src/content/ListenSection.tsx` :
- imports : `import { PLATFORM_LABEL } from '../core/music/platform';`, `import { TIDAL_HOME_URL } from '../core/tidal/config';`, `import { tidalUrl } from '../core/tidal/tidal-listen';`, `import { usePlatform } from './usePlatform';`
- dans le composant, en tête (avant les `useState`) : `const platform = usePlatform();` et `const name = PLATFORM_LABEL[platform];`
- la clé de carte devient `const cardKey = \`${platform}\n${slug}\n${title}\`;` : l'utiliser dans l'effet de chargement (à la place de `const card = \`${slug}\n${title}\``), ajouter `platform` aux dépendances de cet effet (`[service, slug, title, platform, version]`) et utiliser `cardKey` aussi dans `refresh` (à la place de `const card = …`). Pour que la clé reste disponible dans l'effet sans changer ses dépendances inutilement, calculer `cardKey` avant l'effet.
- bouton « Lier » : `aria-label` et `title` valent `` `Lier ${name} pour écouter` `` ; le texte du bouton `<Glyph name="link" /> {name}`.
- `notfound` : `Introuvable sur {name}.`
- ligne de piste : remplacer le bouton ▶ par

```tsx
                {platform === 'tidal' ? (
                  <a
                    href={tidalUrl(item.uri) ?? TIDAL_HOME_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Ouvrir ${item.title} dans Tidal`}
                    title={`Ouvrir ${item.title} dans Tidal`}
                    style={{ ...iconButton, borderRadius: '50%', textDecoration: 'none' }}
                  >
                    <Glyph name="external" size={16} />
                  </a>
                ) : (
                  <button ...le bouton ▶ existant, inchangé... />
                )}
```

- sous la liste (dans le fragment `ready`, avant le bloc du bouton d'actualisation d'un artiste) :

```tsx
          {platform === 'tidal' && (
            <a href={TIDAL_HOME_URL} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'flex-end', fontSize: 11, opacity: 0.7, color: 'inherit' }}>
              Écoute sur TIDAL
            </a>
          )}
```

`src/content/PlayerSettings.tsx` : remplacer les lignes ajoutées en phase 1 (`platformChoice`, `noSubscribe`, `spotifyOnly`, `platform`) par `const platform = usePlatform();` et `const platformChoice = getPlatformChoice();` (encore utile pour la liste `available`) ; importer `useEffect` ; la liaison affichée devient celle de la plateforme :

```tsx
  const { enabled, linked: spotifyLinked } = useSyncExternalStore(source.subscribe, source.current);
  // Tidal : l'état de liaison vient du service (le lecteur Spotify ne sait que Spotify).
  const [tidalLinked, setTidalLinked] = useState(false);
  useEffect(() => {
    if (platform !== 'tidal' || !service) return;
    let cancelled = false;
    const load = () => void service.isLinked().then((value) => !cancelled && setTidalLinked(value));
    load();
    const off = service.subscribe(load);
    return () => {
      cancelled = true;
      off();
    };
  }, [platform, service]);
  const linked = platform === 'tidal' ? tidalLinked : spotifyLinked;
```

et n'afficher le paragraphe d'aide + le groupe « Affichage du lecteur » que si `platform === 'spotify'`. Retirer l'import de `PlatformSetting`/`Platform` devenus inutiles ; garder `PLATFORM_LABEL`.

`src/content/SpotifyPlayer.tsx` : importer `usePlatform` ; avec les autres hooks en tête de `SpotifyPlayer` : `const platform = usePlatform();` ; et au début des retours anticipés : `if (platform !== 'spotify' || !view.linked || !view.enabled) return null;`.

- [ ] **Step 4: Vérifier**

Run : `npx vitest run tests/content` puis `npm test` et `npm run typecheck`
Expected : PASS partout (aucun test Spotify existant ne doit changer).

- [ ] **Step 5: Commit**

```bash
git add src/content tests/content
git commit -m "feat: fiche d'écoute Tidal (lien ↗ par piste, mention TIDAL), réglages et mini-lecteur selon la plateforme"
```

---

### Task 9: Vérification, livraison et mémoire

**Files:** aucun nouveau (sauf `livrables/` si l'outillage est disponible).

- [ ] **Step 1:** `npm test` — Expected : tout passe. `npm run typecheck` — aucune erreur. `npm run build` — build WXT réussi ; vérifier dans `.output/chrome-mv3/manifest.json` que `host_permissions` contient les trois hôtes Tidal.
- [ ] **Step 2:** `git grep -n "HtbTIH\|client_secret"` sur tout le dépôt — Expected : aucune ligne (le seul `client_secret` admis est la mention `has('client_secret')` du test de session).
- [ ] **Step 3:** Pousser `feat/tidal-catalogue`, ouvrir la PR (corps : résumé, ce qui reste — phase 3 extrait + vérifications manuelles : recharger l'extension, relier Tidal dans Plus → Lecteur, ouvrir la fiche d'une carte, tester l'APK), puis la fusionner (routine du projet).
- [ ] **Step 4:** Reconstruire les livrables si l'outillage est présent : `npm run package` puis `npm run apk` ; sinon le dire à l'utilisateur.
- [ ] **Step 5:** Mettre à jour la mémoire du projet (`project_tidal.md` : phase 2 faite, forme réelle de l'API, pièges : ordre de pertinence, homonymes, ce qui reste manuel).

## Auto-revue

- Spec « sélecteur » → Task 6 (routeur), 7 (`available`), 8 (`usePlatform`, réglages). « Délier seulement dans Plus → Lecteur » → phase 1 ; Task 8 fait suivre le bouton à la plateforme. « Données par plateforme, jamais perdues » → Tasks 4, 6 (`listens-tidal-v1`, test qu'aucune écriture n'atteint `listens-v1`), 7. « Liaison PKCE sans secret » → Task 3 (test `has('client_secret')` faux). « Lien ouvrir dans Tidal » + « mention TIDAL » → Task 8. « Relais service worker » + « Redirect URIs » + Android → Task 7. « Pause sur 429 » → Task 4.
- Hors phase : extrait dans l'appli et pastille « Extrait » (phase 3).
- Types : `TidalSearch` (Task 5) = `Pick<TidalApi, …>` (Task 4) ; `createListenRepo(store, now, key)` (phase 1) ; `PlatformServiceLike` (Task 6) ⊂ `MusicService` dont `isLinked` est ajouté en Task 1 ; `usePlatform` (Task 8) lit `getPlatformChoice` (phase 1).
