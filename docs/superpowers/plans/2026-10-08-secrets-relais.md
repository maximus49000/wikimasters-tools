# Secrets côté serveur (relais Cloudflare) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plus aucune clé (TMDB, IGDB, GitHub, Google Livres) dans l'extension ni dans l'APK : le relais Cloudflare les détient et fait les appels.

**Architecture:** Quatre routes ajoutées au Worker existant (`GET /tmdb/*`, `GET /books/volumes`, `POST /igdb/games`, `POST /issues`), chacune dans son module de `relay/src/` (fonction pure + `fetch` injecté), avec liste blanche stricte et limite de débit en mémoire par IP. Les clients (`tmdb-api`, `google-books-api`, `igdb-api`, `postIssue`) appellent le relais avec le `fetch` de la page (le site n'a aucune CSP ; le relais a un CORS ouvert), sans clé.

**Tech Stack:** TypeScript, Cloudflare Workers (offre gratuite), vitest, zod, WXT (extension), Vite (APK).

**Spec:** `docs/superpowers/specs/2026-10-08-secrets-relais-design.md`

## Global Constraints

- Les secrets Cloudflare sont **déjà posés** (2026-10-08) : `TMDB_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, `GITHUB_ISSUES_TOKEN`, `GOOGLE_BOOKS_API_KEY`. Ne jamais afficher, journaliser ni commiter une valeur de secret ; ne jamais lire `.env.local` autrement que pour la vérification de la tâche 9 (qui n'imprime que des noms).
- Pas de cache côté relais (l'API Cache ne fonctionne pas sur `workers.dev`) ; pas de nouveau binding dans `wrangler.toml`.
- Limites de débit par IP et par route (compteurs en mémoire) : `/tmdb` 300 par minute, `/igdb` 120 par minute, `/books` 60 par minute, `/issues` 5 par heure. (Relevées par rapport à la spec : la grille lance une recherche d'affiche par carte et le client IGDB s'espace déjà à ~230 appels par minute ; 60/20 aurait bloqué l'usage normal.)
- Les anciennes clés ne sont pas révoquées (décision de l'utilisateur) : le relais reste additif, les anciens paquets continuent de marcher.
- Les textes visibles et les commentaires sont en français, comme le reste du code ; imiter la densité de commentaires existante.
- Tests : `npx vitest run <fichier>` ; avant chaque commit de fin de tâche, le fichier de test de la tâche passe. Contrôle global en tâche 9 : `npm test`, `npm run typecheck`, `npm run build`.
- Commits : message `type(secrets): …` en français, terminé par la ligne `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Travail sur la branche `feat/secrets-relais` (déjà créée, la spec y est commitée).

## File Structure

| Fichier | Rôle |
|---|---|
| `relay/src/limiter.ts` (créer) | Compteurs de fenêtre fixe en mémoire |
| `relay/src/proxy.ts` (créer) | Type `ProxyResult`, `failure()`, `forward()` (transmission d'une réponse amont) |
| `relay/src/tmdb.ts` (créer) | Liste blanche et transmission TMDB |
| `relay/src/books.ts` (créer) | Liste blanche et transmission Google Livres |
| `relay/src/igdb.ts` (créer) | Validation des requêtes IGDB, jeton Twitch, transmission |
| `relay/src/issues.ts` (créer) | Validation et création d'une issue GitHub |
| `relay/src/index.ts` (modifier) | Routage, CORS, limites, `/status` |
| `src/core/game/igdb-queries.ts` (créer) | Champs et fabrique des requêtes IGDB, **partagés** client/relais |
| `src/core/screen/tmdb-api.ts`, `config.ts` (modifier) | Client TMDB sans clé |
| `src/core/book/google-books-api.ts`, `config.ts` (modifier) | Client Google Livres sans clé |
| `src/core/game/igdb-api.ts`, `config.ts` (modifier) | Client IGDB sans secret ni jeton |
| `src/core/anomalies/anomaly.ts`, `config.ts` (modifier) | Envoi d'issue via le relais |
| `src/app/overlay.ts` (modifier) | Câblage sans clés |
| `src/core/telemetry/fetch-observer.ts` (modifier) | Service d'après le chemin du relais |
| `scripts/check-no-secrets.mjs` (créer) | Contrôle qu'aucun secret de `.env.local` n'est dans les paquets |
| `wxt.config.ts`, `src/core/spotify/transport.ts`, `MainActivity.java`, `src/android/native-http.ts`, `src/env.d.ts` (modifier) | Nettoyage des hôtes et variables devenus inutiles |

---

### Task 1: Limiteur de débit et socle de transmission

**Files:**
- Create: `relay/src/limiter.ts`, `relay/src/proxy.ts`
- Test: `tests/relay/limiter.test.ts`, `tests/relay/proxy.test.ts`

**Interfaces:**
- Produces: `createLimiter(now: () => number): { check(key: string, limit: number, windowMs: number): Verdict }` avec `type Verdict = { ok: boolean; retryAfterSec: number }` ; `type Fetcher = (url: string, init?: RequestInit) => Promise<Response>` ; `type ProxyResult = { status: number; body: string; retryAfter?: string }` ; `failure(status: number, reason: string): ProxyResult` ; `forward(doFetch: Fetcher, url: string, init?: RequestInit): Promise<ProxyResult>`.

- [ ] **Step 1: Écrire les tests**

`tests/relay/limiter.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createLimiter } from '../../relay/src/limiter';

describe('createLimiter', () => {
  it('laisse passer jusqu’à la limite puis refuse avec le délai restant', () => {
    let now = 1_000;
    const limiter = createLimiter(() => now);
    expect(limiter.check('a', 2, 60_000)).toEqual({ ok: true, retryAfterSec: 0 });
    expect(limiter.check('a', 2, 60_000).ok).toBe(true);
    now = 11_000;
    expect(limiter.check('a', 2, 60_000)).toEqual({ ok: false, retryAfterSec: 50 });
  });
  it('rouvre à la fenêtre suivante', () => {
    let now = 0;
    const limiter = createLimiter(() => now);
    limiter.check('a', 1, 1_000);
    expect(limiter.check('a', 1, 1_000).ok).toBe(false);
    now = 1_000;
    expect(limiter.check('a', 1, 1_000).ok).toBe(true);
  });
  it('compte chaque clé à part', () => {
    const limiter = createLimiter(() => 0);
    limiter.check('a', 1, 1_000);
    expect(limiter.check('b', 1, 1_000).ok).toBe(true);
  });
  it('purge les fenêtres expirées quand la table grossit', () => {
    let now = 0;
    const limiter = createLimiter(() => now);
    for (let i = 0; i < 6_000; i += 1) limiter.check(`k${i}`, 1, 1_000);
    now = 5_000;
    expect(limiter.check('k0', 1, 1_000).ok).toBe(true);
  });
});
```

`tests/relay/proxy.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { failure, forward } from '../../relay/src/proxy';

describe('forward', () => {
  it('transmet statut et corps d’une réponse normale', async () => {
    const result = await forward(async () => new Response('{"a":1}', { status: 200 }), 'https://x.test/');
    expect(result).toEqual({ status: 200, body: '{"a":1}' });
  });
  it('transmet un 404 et un 429 avec Retry-After', async () => {
    expect((await forward(async () => new Response('{}', { status: 404 }), 'https://x.test/')).status).toBe(404);
    const limited = await forward(async () => new Response('{}', { status: 429, headers: { 'retry-after': '7' } }), 'https://x.test/');
    expect(limited).toEqual({ status: 429, body: '{}', retryAfter: '7' });
  });
  it('cache les refus de clé et les pannes amont sous un 502 neutre', async () => {
    for (const status of [401, 403, 500, 503]) {
      expect(await forward(async () => new Response('secret-detail', { status }), 'https://x.test/')).toEqual(failure(502, 'upstream'));
    }
    expect(await forward(async () => Promise.reject(new Error('réseau')), 'https://x.test/')).toEqual(failure(502, 'upstream'));
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/relay/limiter.test.ts tests/relay/proxy.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Implémenter**

`relay/src/limiter.ts` :

```ts
// relay/src/limiter.ts
// Compteurs de fenêtre fixe en mémoire du Worker : par isolat, remis à zéro quand il est recyclé. C'est un filtre contre l'usage
// abusif, pas une garantie (l'API Cache de Cloudflare ne fonctionne pas sur workers.dev).
export type Verdict = { ok: boolean; retryAfterSec: number };

type Window = { start: number; count: number; windowMs: number };
const MAX_KEYS = 5_000;

export function createLimiter(now: () => number) {
  const windows = new Map<string, Window>();
  return {
    check(key: string, limit: number, windowMs: number): Verdict {
      const at = now();
      if (windows.size > MAX_KEYS) {
        for (const [name, window] of windows) if (at - window.start >= window.windowMs) windows.delete(name);
      }
      const current = windows.get(key);
      if (!current || at - current.start >= windowMs) {
        windows.set(key, { start: at, count: 1, windowMs });
        return { ok: true, retryAfterSec: 0 };
      }
      if (current.count >= limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((current.start + windowMs - at) / 1000)) };
      current.count += 1;
      return { ok: true, retryAfterSec: 0 };
    },
  };
}
```

`relay/src/proxy.ts` :

```ts
// relay/src/proxy.ts
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
// Résultat d'une route de transmission : `index.ts` en fait la réponse HTTP (en-têtes CORS compris).
export type ProxyResult = { status: number; body: string; retryAfter?: string };

export const failure = (status: number, reason: string): ProxyResult => ({ status, body: JSON.stringify({ ok: false, reason }) });

// Transmet la réponse d'un service amont. Un refus de clé (401/403) ou une panne (5xx) devient un 502 neutre : le client ne doit ni
// croire que sa clé est en cause ni lire le détail de l'amont.
export async function forward(doFetch: Fetcher, url: string, init?: RequestInit): Promise<ProxyResult> {
  let response: Response;
  try {
    response = await doFetch(url, init);
  } catch {
    return failure(502, 'upstream');
  }
  if (response.status === 401 || response.status === 403 || response.status >= 500) return failure(502, 'upstream');
  const retryAfter = response.headers.get('retry-after');
  return { status: response.status, body: await response.text(), ...(retryAfter ? { retryAfter } : {}) };
}
```

- [ ] **Step 4: Vérifier la réussite**

Run: `npx vitest run tests/relay/limiter.test.ts tests/relay/proxy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add relay/src/limiter.ts relay/src/proxy.ts tests/relay/limiter.test.ts tests/relay/proxy.test.ts
git commit -m "feat(secrets): limiteur de débit en mémoire et socle de transmission du relais"
```

---

### Task 2: Routes TMDB et Google Livres du relais

**Files:**
- Create: `relay/src/tmdb.ts`, `relay/src/books.ts`
- Test: `tests/relay/tmdb.test.ts`, `tests/relay/books.test.ts`

**Interfaces:**
- Consumes: `forward`, `failure`, `Fetcher`, `ProxyResult` de `relay/src/proxy.ts`.
- Produces: `proxyTmdb(url: URL, deps: { fetch: Fetcher; apiKey: string | undefined }): Promise<ProxyResult>` (l'URL entrante commence par `/tmdb`) ; `proxyBooks(url: URL, deps: { fetch: Fetcher; apiKey: string | undefined }): Promise<ProxyResult>` (chemin exact `/books/volumes`).

- [ ] **Step 1: Écrire les tests**

`tests/relay/tmdb.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { proxyTmdb } from '../../relay/src/tmdb';

const run = (path: string, apiKey: string | undefined = 'SECRET-TMDB') => {
  const fetchFn = vi.fn(async (_url: string) => new Response('{"id":1}', { status: 200 }));
  return { fetchFn, result: proxyTmdb(new URL(`https://relais.test${path}`), { fetch: fetchFn, apiKey }) };
};

describe('proxyTmdb', () => {
  it('ajoute la clé et transmet la réponse', async () => {
    const { fetchFn, result } = run('/tmdb/movie/603?language=fr-FR&append_to_response=videos,watch/providers&include_video_language=fr,en,null');
    expect(await result).toEqual({ status: 200, body: '{"id":1}' });
    const upstream = new URL(fetchFn.mock.calls[0]?.[0] ?? '');
    expect(upstream.origin + upstream.pathname).toBe('https://api.themoviedb.org/3/movie/603');
    expect(upstream.searchParams.get('api_key')).toBe('SECRET-TMDB');
    expect(upstream.searchParams.get('append_to_response')).toBe('videos,watch/providers');
  });
  it('accepte les chemins de recherche et de filmographie', async () => {
    for (const path of ['/tmdb/search/movie?query=Alien', '/tmdb/search/tv?query=x', '/tmdb/search/person?query=x', '/tmdb/search/multi?query=x', '/tmdb/person/6193/combined_credits', '/tmdb/tv/1399']) {
      const { fetchFn, result } = run(path);
      expect((await result).status).toBe(200);
      expect(fetchFn).toHaveBeenCalledOnce();
    }
  });
  it('refuse tout autre chemin sans appel amont', async () => {
    for (const path of ['/tmdb/account', '/tmdb/movie/abc', '/tmdb/movie/1/credits', '/tmdb/../3/account', '/tmdb/authentication/token/new']) {
      const { fetchFn, result } = run(path);
      expect((await result).status).toBe(404);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });
  it('ignore les paramètres inconnus et écrase api_key', async () => {
    const { fetchFn, result } = run('/tmdb/search/movie?query=Alien&api_key=PIRATE&include_adult=true');
    await result;
    const upstream = new URL(fetchFn.mock.calls[0]?.[0] ?? '');
    expect(upstream.searchParams.get('api_key')).toBe('SECRET-TMDB');
    expect(upstream.searchParams.has('include_adult')).toBe(false);
  });
  it('refuse une valeur de paramètre invalide', async () => {
    const { fetchFn, result } = run(`/tmdb/search/movie?query=${'a'.repeat(201)}`);
    expect((await result).status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('répond 503 sans clé configurée', async () => {
    const { fetchFn, result } = run('/tmdb/movie/1', undefined);
    expect((await result).status).toBe(503);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('ne laisse jamais le secret dans la réponse d’erreur', async () => {
    const fetchFn = async () => new Response('SECRET-TMDB mal formé', { status: 401 });
    const result = await proxyTmdb(new URL('https://relais.test/tmdb/movie/1'), { fetch: fetchFn, apiKey: 'SECRET-TMDB' });
    expect(result.status).toBe(502);
    expect(result.body).not.toContain('SECRET-TMDB');
  });
});
```

`tests/relay/books.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { proxyBooks } from '../../relay/src/books';

const run = (path: string, apiKey: string | undefined = 'SECRET-BOOKS') => {
  const fetchFn = vi.fn(async (_url: string) => new Response('{"items":[]}', { status: 200 }));
  return { fetchFn, result: proxyBooks(new URL(`https://relais.test${path}`), { fetch: fetchFn, apiKey }) };
};

describe('proxyBooks', () => {
  it('ajoute la clé et transmet', async () => {
    const { fetchFn, result } = run('/books/volumes?q=Dune%20Herbert&country=FR&maxResults=10');
    expect(await result).toEqual({ status: 200, body: '{"items":[]}' });
    const upstream = new URL(fetchFn.mock.calls[0]?.[0] ?? '');
    expect(upstream.origin + upstream.pathname).toBe('https://www.googleapis.com/books/v1/volumes');
    expect(upstream.searchParams.get('key')).toBe('SECRET-BOOKS');
    expect(upstream.searchParams.get('q')).toBe('Dune Herbert');
    expect(upstream.searchParams.get('maxResults')).toBe('10');
  });
  it('refuse un autre chemin, un autre pays, un maxResults hors 1-10, une requête vide ou trop longue', async () => {
    const cases: [string, number][] = [
      ['/books/other?q=a&country=FR&maxResults=5', 404],
      ['/books/volumes?q=a&country=US&maxResults=5', 400],
      ['/books/volumes?q=a&country=FR&maxResults=40', 400],
      ['/books/volumes?q=a&country=FR&maxResults=x', 400],
      ['/books/volumes?country=FR&maxResults=5', 400],
      [`/books/volumes?q=${'a'.repeat(201)}&country=FR&maxResults=5`, 400],
    ];
    for (const [path, status] of cases) {
      const { fetchFn, result } = run(path);
      expect((await result).status).toBe(status);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });
  it('écrase une clé fournie par le client et répond 503 sans clé', async () => {
    const { fetchFn, result } = run('/books/volumes?q=a&country=FR&maxResults=5&key=PIRATE');
    await result;
    expect(new URL(fetchFn.mock.calls[0]?.[0] ?? '').searchParams.get('key')).toBe('SECRET-BOOKS');
    expect((await run('/books/volumes?q=a&country=FR&maxResults=5', undefined).result).status).toBe(503);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/relay/tmdb.test.ts tests/relay/books.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Implémenter**

`relay/src/tmdb.ts` :

```ts
// relay/src/tmdb.ts
import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

const TMDB_BASE = 'https://api.themoviedb.org/3';
// Les seules routes TMDB que l'appli utilise (fiche, filmographie, recherches).
const PATHS = [/^\/movie\/\d{1,9}$/, /^\/tv\/\d{1,9}$/, /^\/person\/\d{1,9}\/combined_credits$/, /^\/search\/(?:movie|tv|person|multi)$/];
// Les seuls paramètres transmis, chacun avec sa forme ; tout autre paramètre est ignoré.
const PARAMS = new Map<string, (value: string) => boolean>([
  ['language', (value) => /^[a-z]{2}(?:-[A-Z]{2})?$/.test(value)],
  ['query', (value) => value.length >= 1 && value.length <= 200],
  ['append_to_response', (value) => /^[a-z/_,]{1,60}$/.test(value)],
  ['include_video_language', (value) => /^[a-z,]{1,20}$/.test(value)],
]);

export async function proxyTmdb(url: URL, deps: { fetch: Fetcher; apiKey: string | undefined }): Promise<ProxyResult> {
  const path = url.pathname.replace(/^\/tmdb/, '');
  if (!PATHS.some((allowed) => allowed.test(path))) return failure(404, 'not-found');
  if (!deps.apiKey) return failure(503, 'not-configured');
  const query = new URLSearchParams();
  for (const [name, value] of url.searchParams) {
    const valid = PARAMS.get(name);
    if (!valid) continue;
    if (!valid(value)) return failure(400, 'bad-request');
    query.set(name, value);
  }
  query.set('api_key', deps.apiKey);
  return forward(deps.fetch, `${TMDB_BASE}${path}?${query.toString()}`);
}
```

`relay/src/books.ts` :

```ts
// relay/src/books.ts
import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

const BOOKS_VOLUMES = 'https://www.googleapis.com/books/v1/volumes';

export async function proxyBooks(url: URL, deps: { fetch: Fetcher; apiKey: string | undefined }): Promise<ProxyResult> {
  if (url.pathname !== '/books/volumes') return failure(404, 'not-found');
  if (!deps.apiKey) return failure(503, 'not-configured');
  const q = url.searchParams.get('q') ?? '';
  const max = Number(url.searchParams.get('maxResults'));
  if (q.length < 1 || q.length > 200 || url.searchParams.get('country') !== 'FR' || !Number.isInteger(max) || max < 1 || max > 10) return failure(400, 'bad-request');
  const query = new URLSearchParams({ q, country: 'FR', maxResults: String(max), key: deps.apiKey });
  return forward(deps.fetch, `${BOOKS_VOLUMES}?${query.toString()}`);
}
```

- [ ] **Step 4: Vérifier la réussite**

Run: `npx vitest run tests/relay/tmdb.test.ts tests/relay/books.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add relay/src/tmdb.ts relay/src/books.ts tests/relay/tmdb.test.ts tests/relay/books.test.ts
git commit -m "feat(secrets): routes TMDB et Google Livres du relais (liste blanche, clé côté serveur)"
```

---

### Task 3: Requêtes IGDB partagées et route IGDB du relais

**Files:**
- Create: `src/core/game/igdb-queries.ts`, `relay/src/igdb.ts`
- Test: `tests/core/game/igdb-queries.test.ts`, `tests/relay/igdb.test.ts`

**Interfaces:**
- Consumes: `forward`, `failure`, `Fetcher`, `ProxyResult`.
- Produces: `DETAIL_FIELDS`, `SEARCH_FIELDS` (chaînes), `detailQuery(by: { id: number } | { slug: string }): string`, `searchQuery(title: string): string` dans `igdb-queries.ts` ; côté relais `type TokenState = { current: { token: string; expiresAt: number } | null }`, `isAllowedQuery(body: string): boolean`, `proxyIgdb(body: string, deps: { fetch: Fetcher; clientId: string | undefined; clientSecret: string | undefined; state: TokenState; now: () => number }): Promise<ProxyResult>`.

- [ ] **Step 1: Écrire les tests**

`tests/core/game/igdb-queries.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { detailQuery, searchQuery } from '../../../src/core/game/igdb-queries';

describe('requêtes IGDB', () => {
  it('construit la requête de détail par id et par slug', () => {
    expect(detailQuery({ id: 1000 })).toMatch(/^fields .+; where id = 1000; limit 1;$/);
    expect(detailQuery({ slug: 'super-metroid' })).toMatch(/where slug = "super-metroid"; limit 1;$/);
  });
  it('construit la recherche et neutralise guillemets, barres obliques inverses et points-virgules', () => {
    expect(searchQuery('Super "Metroid"; x\\y')).toMatch(/^search "Super  Metroid   x y"; fields .+; limit 10;$/);
  });
});
```

`tests/relay/igdb.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { detailQuery, searchQuery } from '../../src/core/game/igdb-queries';
import { isAllowedQuery, proxyIgdb, type TokenState } from '../../relay/src/igdb';

describe('isAllowedQuery', () => {
  it('accepte exactement les requêtes que fabrique le client', () => {
    expect(isAllowedQuery(detailQuery({ id: 1000 }))).toBe(true);
    expect(isAllowedQuery(detailQuery({ slug: 'super-metroid' }))).toBe(true);
    expect(isAllowedQuery(searchQuery('Super Metroid'))).toBe(true);
    expect(isAllowedQuery(searchQuery('Pokémon Rouge & Bleu'))).toBe(true);
  });
  it('refuse tout le reste', () => {
    for (const body of [
      'fields *; limit 500;',
      detailQuery({ id: 1 }).replace('limit 1', 'limit 500'),
      detailQuery({ id: 1 }).replace('fields ', 'fields age_ratings,'),
      `${searchQuery('x')} delete;`,
      searchQuery('x').replace('limit 10', 'limit 100'),
      'x'.repeat(1_000),
      '',
    ]) expect(isAllowedQuery(body)).toBe(false);
  });
});

function setup(over: { games?: (init: RequestInit) => Response; tokenStatus?: number } = {}) {
  const state: TokenState = { current: null };
  let now = 0;
  let tokens = 0;
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, ...(init ? { init } : {}) });
    if (url.startsWith('https://id.twitch.tv/')) {
      tokens += 1;
      return Response.json({ access_token: `jeton-${tokens}`, expires_in: 5_000_000 }, { status: over.tokenStatus ?? 200 });
    }
    return over.games ? over.games(init ?? {}) : new Response('[{"id":1}]', { status: 200 });
  });
  const run = (body: string) => proxyIgdb(body, { fetch: fetchFn, clientId: 'ID', clientSecret: 'SECRET-IGDB', state, now: () => now });
  return { run, calls, tokens: () => tokens, advance: (ms: number) => (now += ms) };
}

describe('proxyIgdb', () => {
  it('obtient un jeton, appelle IGDB avec les identifiants et transmet la réponse', async () => {
    const { run, calls } = setup();
    expect(await run(detailQuery({ id: 1 }))).toEqual({ status: 200, body: '[{"id":1}]' });
    const games = calls.find((call) => call.url === 'https://api.igdb.com/v4/games');
    const headers = games?.init?.headers as Record<string, string>;
    expect(headers['Client-ID']).toBe('ID');
    expect(headers.Authorization).toBe('Bearer jeton-1');
    expect(games?.init?.body).toBe(detailQuery({ id: 1 }));
  });
  it('garde le jeton jusqu’à une heure avant l’expiration, puis le renouvelle', async () => {
    const { run, tokens, advance } = setup();
    await run(detailQuery({ id: 1 }));
    await run(detailQuery({ id: 2 }));
    expect(tokens()).toBe(1);
    advance(5_000_000 * 1000);
    await run(detailQuery({ id: 3 }));
    expect(tokens()).toBe(2);
  });
  it('renouvelle le jeton une fois sur un 401 d’IGDB', async () => {
    let first = true;
    const { run, tokens } = setup({ games: () => (first ? ((first = false), new Response('{}', { status: 401 })) : new Response('[]', { status: 200 })) });
    expect((await run(detailQuery({ id: 1 }))).status).toBe(200);
    expect(tokens()).toBe(2);
  });
  it('refuse une requête hors liste sans rien appeler', async () => {
    const { run, calls } = setup();
    expect((await run('fields *;')).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it('répond 503 sans identifiants, 502 si Twitch refuse, et ne montre jamais le secret', async () => {
    const state: TokenState = { current: null };
    const none = await proxyIgdb(detailQuery({ id: 1 }), { fetch: vi.fn(), clientId: undefined, clientSecret: undefined, state, now: () => 0 });
    expect(none.status).toBe(503);
    const refused = await setup({ tokenStatus: 401 }).run(detailQuery({ id: 1 }));
    expect(refused.status).toBe(502);
    expect(refused.body).not.toContain('SECRET-IGDB');
  });
  it('transmet un 429 d’IGDB', async () => {
    const { run } = setup({ games: () => new Response('{}', { status: 429, headers: { 'retry-after': '2' } }) });
    expect(await run(detailQuery({ id: 1 }))).toEqual({ status: 429, body: '{}', retryAfter: '2' });
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/core/game/igdb-queries.test.ts tests/relay/igdb.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Implémenter**

`src/core/game/igdb-queries.ts` (source unique des requêtes, utilisée par le client et par la liste blanche du relais) :

```ts
// src/core/game/igdb-queries.ts
// Requêtes IGDB (langage « APIcalypse ») : le client les fabrique, le relais n'accepte que ces formes exactes.
export const DETAIL_FIELDS =
  'id,name,summary,first_release_date,url,genres.name,platforms.name,involved_companies.developer,involved_companies.company.name,aggregated_rating,aggregated_rating_count,total_rating,total_rating_count,videos.video_id,cover.image_id';
export const SEARCH_FIELDS = 'id,name,first_release_date,platforms.name,cover.image_id,total_rating_count';

// Les guillemets, les barres obliques inverses et les points-virgules casseraient la requête.
const clean = (text: string): string => text.replace(/[\\";]/g, ' ').trim();

export function detailQuery(by: { id: number } | { slug: string }): string {
  const where = 'id' in by ? `id = ${by.id}` : `slug = "${clean(by.slug)}"`;
  return `fields ${DETAIL_FIELDS}; where ${where}; limit 1;`;
}

export const searchQuery = (title: string): string => `search "${clean(title)}"; fields ${SEARCH_FIELDS}; limit 10;`;
```

Vérifier que la valeur de `DETAIL_FIELDS` est **identique caractère pour caractère** à celle actuellement dans `src/core/game/igdb-api.ts:36-37` (la copier depuis ce fichier si besoin) : la tâche 7 supprime l'ancienne.

`relay/src/igdb.ts` :

```ts
// relay/src/igdb.ts
import { DETAIL_FIELDS, SEARCH_FIELDS } from '../../src/core/game/igdb-queries';
import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const GAMES_URL = 'https://api.igdb.com/v4/games';
// Un jeton est renouvelé une heure avant son expiration.
const MARGIN_MS = 3_600_000;
const MAX_BODY = 600;

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DETAIL = new RegExp(`^fields ${escape(DETAIL_FIELDS)}; where (?:id = \\d{1,9}|slug = "[\\w.-]{1,120}"); limit 1;$`);
const SEARCH = new RegExp(`^search "[^"\\\\;]{1,100}"; fields ${escape(SEARCH_FIELDS)}; limit 10;$`);

// Seules les deux formes de requête du client passent (jamais de `fields *`, ni de `limit` libre).
export const isAllowedQuery = (body: string): boolean => body.length <= MAX_BODY && (DETAIL.test(body) || SEARCH.test(body));

// Jeton Twitch gardé en mémoire de l'isolat (pas de KV : 1 000 écritures par jour seulement).
export type TokenState = { current: { token: string; expiresAt: number } | null };

type Deps = { fetch: Fetcher; clientId: string | undefined; clientSecret: string | undefined; state: TokenState; now: () => number };

async function token(deps: Deps, renew: boolean): Promise<string | null> {
  const kept = deps.state.current;
  if (!renew && kept && kept.expiresAt - deps.now() > MARGIN_MS) return kept.token;
  const url = `${TOKEN_URL}?client_id=${encodeURIComponent(deps.clientId ?? '')}&client_secret=${encodeURIComponent(deps.clientSecret ?? '')}&grant_type=client_credentials`;
  let response: Response;
  try {
    response = await deps.fetch(url, { method: 'POST' });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const data = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') return null;
  deps.state.current = { token: data.access_token, expiresAt: deps.now() + data.expires_in * 1000 };
  return data.access_token;
}

export async function proxyIgdb(body: string, deps: Deps): Promise<ProxyResult> {
  if (!isAllowedQuery(body)) return failure(400, 'bad-request');
  if (!deps.clientId || !deps.clientSecret) return failure(503, 'not-configured');
  for (let attempt = 0; ; attempt += 1) {
    const bearer = await token(deps, attempt > 0);
    if (!bearer) return failure(502, 'upstream');
    const init = { method: 'POST', headers: { 'Client-ID': deps.clientId, Authorization: `Bearer ${bearer}`, Accept: 'application/json' }, body };
    // Un 401 d'IGDB (jeton refusé) est retenté une fois avec un jeton neuf.
    if (attempt === 0) {
      let probe: Response;
      try {
        probe = await deps.fetch(GAMES_URL, init);
      } catch {
        return failure(502, 'upstream');
      }
      if (probe.status !== 401) return forward(async () => probe, GAMES_URL);
      continue;
    }
    return forward(deps.fetch, GAMES_URL, init);
  }
}
```

- [ ] **Step 4: Vérifier la réussite**

Run: `npx vitest run tests/core/game/igdb-queries.test.ts tests/relay/igdb.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/game/igdb-queries.ts relay/src/igdb.ts tests/core/game/igdb-queries.test.ts tests/relay/igdb.test.ts
git commit -m "feat(secrets): route IGDB du relais (requêtes partagées, jeton Twitch côté serveur)"
```

---

### Task 4: Route des issues GitHub du relais

**Files:**
- Create: `relay/src/issues.ts`
- Test: `tests/relay/issues.test.ts`

**Interfaces:**
- Consumes: `forward`-style types de `proxy.ts` ; `NEW_ANOMALY_LABEL` (`src/core/anomalies/anomaly.ts`), `PROPOSAL_LABEL`, `FLAG_LABEL` (`src/core/documentary/proposal.ts`).
- Produces: `createIssue(raw: string, deps: { fetch: Fetcher; token: string | undefined }): Promise<ProxyResult>`. Succès : statut 200, corps `{"ok":true,"number":N,"url":"…"}` ; refus : 400/502/503 avec `{"ok":false,"reason":…}`.

- [ ] **Step 1: Écrire les tests**

`tests/relay/issues.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createIssue } from '../../relay/src/issues';

const draft = { title: 'Le bouton ne marche pas', body: 'Détails', labels: ['Nouveau'] };
const created = () => new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/o/r/issues/7' }), { status: 201 });

describe('createIssue', () => {
  it('crée l’issue avec le jeton du relais et rend numéro et lien', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => created());
    const result = await createIssue(JSON.stringify(draft), { fetch: fetchFn, token: 'SECRET-GH' });
    expect(result).toEqual({ status: 200, body: JSON.stringify({ ok: true, number: 7, url: 'https://github.com/o/r/issues/7' }) });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('https://api.github.com/repos/maximus49000/wikimasters-tools/issues');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer SECRET-GH');
    expect(JSON.parse(String(init?.body))).toEqual(draft);
  });
  it('accepte les étiquettes des propositions de documentaire', async () => {
    for (const label of ['Proposition documentaire', 'Documentaire non pertinent']) {
      const fetchFn = vi.fn(async () => created());
      expect((await createIssue(JSON.stringify({ ...draft, labels: [label] }), { fetch: fetchFn, token: 't' })).status).toBe(200);
    }
  });
  it('refuse sans appel GitHub : JSON invalide, champs absents, trop longs, étiquette inconnue', async () => {
    const bad = [
      'pas du json',
      JSON.stringify({ title: 'x' }),
      JSON.stringify({ ...draft, title: '' }),
      JSON.stringify({ ...draft, title: 'a'.repeat(201) }),
      JSON.stringify({ ...draft, body: 'a'.repeat(8_001) }),
      JSON.stringify({ ...draft, labels: ['bug', 'admin'] }),
      JSON.stringify({ ...draft, labels: [] }),
      JSON.stringify({ ...draft, labels: ['Nouveau', 'Nouveau', 'Nouveau', 'Nouveau'] }),
    ];
    for (const raw of bad) {
      const fetchFn = vi.fn();
      expect((await createIssue(raw, { fetch: fetchFn, token: 't' })).status).toBe(400);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });
  it('ne transmet que title, body et labels', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => created());
    await createIssue(JSON.stringify({ ...draft, assignees: ['x'], milestone: 1 }), { fetch: fetchFn, token: 't' });
    expect(Object.keys(JSON.parse(String(fetchFn.mock.calls[0]?.[1]?.body)))).toEqual(['title', 'body', 'labels']);
  });
  it('répond 503 sans jeton et 502 si GitHub refuse ou tombe, sans montrer le jeton', async () => {
    expect((await createIssue(JSON.stringify(draft), { fetch: vi.fn(), token: undefined })).status).toBe(503);
    const refused = await createIssue(JSON.stringify(draft), { fetch: async () => new Response('SECRET-GH', { status: 401 }), token: 'SECRET-GH' });
    expect(refused.status).toBe(502);
    expect(refused.body).not.toContain('SECRET-GH');
    expect((await createIssue(JSON.stringify(draft), { fetch: async () => Promise.reject(new Error('x')), token: 't' })).status).toBe(502);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/relay/issues.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

`relay/src/issues.ts` :

```ts
// relay/src/issues.ts
import { NEW_ANOMALY_LABEL } from '../../src/core/anomalies/anomaly';
import { FLAG_LABEL, PROPOSAL_LABEL } from '../../src/core/documentary/proposal';
import { failure, type Fetcher, type ProxyResult } from './proxy';

const ISSUES_URL = 'https://api.github.com/repos/maximus49000/wikimasters-tools/issues';
const ALLOWED_LABELS = new Set([NEW_ANOMALY_LABEL, PROPOSAL_LABEL, FLAG_LABEL]);
const TITLE_MAX = 200;
const BODY_MAX = 8_000;
const LABELS_MAX = 3;

type Draft = { title: string; body: string; labels: string[] };

function parseDraft(raw: string): Draft | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { title, body, labels } = data as Record<string, unknown>;
  if (typeof title !== 'string' || title.length < 1 || title.length > TITLE_MAX) return null;
  if (typeof body !== 'string' || body.length > BODY_MAX) return null;
  if (!Array.isArray(labels) || labels.length < 1 || labels.length > LABELS_MAX || !labels.every((label) => typeof label === 'string' && ALLOWED_LABELS.has(label))) return null;
  return { title, body, labels: labels as string[] };
}

// Crée une issue de ce dépôt avec le jeton du relais (jamais celui d'un client). Seuls title, body et labels sont transmis.
export async function createIssue(raw: string, deps: { fetch: Fetcher; token: string | undefined }): Promise<ProxyResult> {
  if (!deps.token) return failure(503, 'not-configured');
  const draft = parseDraft(raw);
  if (!draft) return failure(400, 'bad-request');
  let response: Response;
  try {
    response = await deps.fetch(ISSUES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${deps.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'wikimasters-tools-relay' },
      body: JSON.stringify({ title: draft.title, body: draft.body, labels: draft.labels }),
    });
  } catch {
    return failure(502, 'upstream');
  }
  if (!response.ok) return failure(502, 'upstream');
  const created = (await response.json()) as { number?: unknown; html_url?: unknown };
  if (typeof created.number !== 'number') return failure(502, 'upstream');
  return { status: 200, body: JSON.stringify({ ok: true, number: created.number, url: typeof created.html_url === 'string' ? created.html_url : '' }) };
}
```

- [ ] **Step 4: Vérifier la réussite**

Run: `npx vitest run tests/relay/issues.test.ts`
Expected: PASS. Si `tsc` se plaint que `anomaly.ts` importe `./config` (`import.meta.env`), c'est réglé à la tâche 7 ; le test vitest passe quand même.

- [ ] **Step 5: Commit**

```bash
git add relay/src/issues.ts tests/relay/issues.test.ts
git commit -m "feat(secrets): route de création d'issues du relais (étiquettes en liste blanche)"
```

---

### Task 5: Branchement des routes dans le Worker

**Files:**
- Modify: `relay/src/index.ts` (type `Env`, `HEADERS`, routage, `/status`)
- Test: `tests/relay/index.test.ts` (ajouter)

**Interfaces:**
- Consumes: tout ce que produisent les tâches 1 à 4.
- Produces: routes `GET /tmdb/*`, `GET /books/volumes`, `POST /igdb/games` (corps `text/plain`), `POST /issues` (corps JSON en `text/plain`) ; réponse 429 `{ok:false,reason:'rate-limited'}` + `Retry-After` ; `/status` ajoute `config.tmdbKey`, `config.igdb`, `config.issuesToken`, `config.booksKey` (booléens).

- [ ] **Step 1: Écrire les tests** (à ajouter à la fin de `tests/relay/index.test.ts`, en ajoutant `vi, afterEach` à l'import de vitest)

```ts
const env = { TMDB_API_KEY: 'SECRET-TMDB', IGDB_CLIENT_ID: 'ID', IGDB_CLIENT_SECRET: 'SECRET-IGDB', GITHUB_ISSUES_TOKEN: 'SECRET-GH', GOOGLE_BOOKS_API_KEY: 'SECRET-BOOKS' };
let ipCounter = 0;
// Chaque test prend sa propre adresse : le limiteur du Worker garde son état d'un test à l'autre.
const call = (path: string, init: RequestInit = {}, withEnv: Parameters<typeof worker.fetch>[1] = env) => {
  ipCounter += 1;
  return worker.fetch(new Request(`https://relais.test${path}`, { ...init, headers: { 'cf-connecting-ip': `10.0.0.${ipCounter}`, ...(init.headers as Record<string, string>) } }), withEnv);
};
afterEach(() => vi.unstubAllGlobals());

describe('routes de transmission', () => {
  it('/tmdb transmet avec la clé et ajoute les en-têtes CORS', async () => {
    const upstream = vi.fn(async (_url: string) => new Response('{"id":603}', { status: 200 }));
    vi.stubGlobal('fetch', upstream);
    const response = await call('/tmdb/movie/603?language=fr-FR');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 603 });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(String(upstream.mock.calls[0]?.[0])).toContain('api_key=SECRET-TMDB');
  });
  it('/books transmet avec la clé', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"items":[]}', { status: 200 })));
    expect((await call('/books/volumes?q=Dune&country=FR&maxResults=10')).status).toBe(200);
  });
  it('/igdb accepte un POST texte valide et refuse le reste', async () => {
    const { detailQuery } = await import('../../src/core/game/igdb-queries');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.startsWith('https://id.twitch.tv/') ? Response.json({ access_token: 't', expires_in: 5_000_000 }) : new Response('[]', { status: 200 }))));
    expect((await call('/igdb/games', { method: 'POST', body: detailQuery({ id: 1 }), headers: { 'content-type': 'text/plain' } })).status).toBe(200);
    expect((await call('/igdb/games', { method: 'POST', body: 'fields *;' })).status).toBe(400);
    expect((await call('/igdb/games')).status).toBe(404);
  });
  it('/issues crée une issue depuis un POST', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ number: 9, html_url: 'https://github.com/o/r/issues/9' }), { status: 201 })));
    const response = await call('/issues', { method: 'POST', body: JSON.stringify({ title: 'Bug', body: 'x', labels: ['Nouveau'] }) });
    expect(await response.json()).toEqual({ ok: true, number: 9, url: 'https://github.com/o/r/issues/9' });
  });
  it('répond 503 quand le secret manque', async () => {
    expect((await call('/tmdb/movie/1', {}, {})).status).toBe(503);
  });
  it('limite le débit par adresse et annonce le délai', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const same = { headers: { 'cf-connecting-ip': '192.0.2.99' } };
    const send = () => worker.fetch(new Request('https://relais.test/issues', { method: 'POST', body: JSON.stringify({ title: 'a', body: 'b', labels: ['Nouveau'] }), ...same }), env);
    for (let i = 0; i < 5; i += 1) expect((await send()).status).not.toBe(429);
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await blocked.json()).toEqual({ ok: false, reason: 'rate-limited' });
  });
  it('répond au préambule CORS pour POST avec content-type', async () => {
    const response = await call('/issues', { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    expect(response.headers.get('access-control-allow-headers')).toContain('content-type');
    expect(response.headers.get('access-control-expose-headers')).toContain('retry-after');
  });
  it('/status montre la présence des secrets sans jamais leur valeur', async () => {
    const response = await call('/status');
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ config: { tmdbKey: true, igdb: true, issuesToken: true, booksKey: true } });
    for (const secret of ['SECRET-TMDB', 'SECRET-IGDB', 'SECRET-GH', 'SECRET-BOOKS']) expect(text).not.toContain(secret);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/relay/index.test.ts`
Expected: FAIL (routes inconnues → 404).

- [ ] **Step 3: Implémenter** dans `relay/src/index.ts`

1. Imports en tête :

```ts
import { proxyBooks } from './books';
import { proxyIgdb, type TokenState } from './igdb';
import { createIssue } from './issues';
import { createLimiter } from './limiter';
import type { ProxyResult } from './proxy';
import { proxyTmdb } from './tmdb';
```

2. Type `Env` : ajouter `TMDB_API_KEY?: string; IGDB_CLIENT_ID?: string; IGDB_CLIENT_SECRET?: string; GITHUB_ISSUES_TOKEN?: string; GOOGLE_BOOKS_API_KEY?: string;`.

3. Remplacer `HEADERS` par :

```ts
const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'x-debug, content-type',
  // Retry-After lisible depuis une page web (l'APK n'a pas d'autre moyen de connaître l'attente).
  'access-control-expose-headers': 'retry-after',
  'cache-control': 'no-store',
};
```

4. Avant `export default`, ajouter :

```ts
// Limites par adresse (compteurs en mémoire, voir limiter.ts) : [nombre d'appels, fenêtre en ms].
const LIMITS = { tmdb: [300, 60_000], igdb: [120, 60_000], books: [60, 60_000], issues: [5, 3_600_000] } as const;
const limiter = createLimiter(() => Date.now());
const igdbToken: TokenState = { current: null };

const relayed = (result: ProxyResult): Response =>
  new Response(result.body, { status: result.status, headers: { ...HEADERS, ...(result.retryAfter ? { 'retry-after': result.retryAfter } : {}) } });

function limited(request: Request, route: keyof typeof LIMITS): Response | null {
  const [limit, windowMs] = LIMITS[route];
  const verdict = limiter.check(`${route}:${request.headers.get('cf-connecting-ip') ?? 'inconnue'}`, limit, windowMs);
  return verdict.ok ? null : new Response(JSON.stringify({ ok: false, reason: 'rate-limited' }), { status: 429, headers: { ...HEADERS, 'retry-after': String(verdict.retryAfterSec) } });
}

// Corps d'un POST : au plus MAX_BODY caractères, sinon null.
async function readBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY) return null;
  const body = await request.text();
  return body.length > MAX_BODY ? null : body;
}

const net = (target: string, init?: RequestInit): Promise<Response> => fetch(target, init);

// Routes qui transmettent un appel à un service tiers avec les secrets du relais ; null si l'adresse n'en fait pas partie.
async function relay(request: Request, url: URL, env: Env): Promise<Response | null> {
  const get = request.method === 'GET';
  const post = request.method === 'POST';
  if (get && url.pathname.startsWith('/tmdb/')) return limited(request, 'tmdb') ?? relayed(await proxyTmdb(url, { fetch: net, apiKey: env.TMDB_API_KEY }));
  if (get && url.pathname.startsWith('/books/')) return limited(request, 'books') ?? relayed(await proxyBooks(url, { fetch: net, apiKey: env.GOOGLE_BOOKS_API_KEY }));
  if (post && url.pathname === '/igdb/games') {
    return (
      limited(request, 'igdb') ??
      relayed(await proxyIgdb((await readBody(request)) ?? '', { fetch: net, clientId: env.IGDB_CLIENT_ID, clientSecret: env.IGDB_CLIENT_SECRET, state: igdbToken, now: () => Date.now() }))
    );
  }
  if (post && url.pathname === '/issues') return limited(request, 'issues') ?? relayed(await createIssue((await readBody(request)) ?? '', { fetch: net, token: env.GITHUB_ISSUES_TOKEN }));
  return null;
}
```

(`MAX_BODY` est déjà défini plus haut dans le fichier ; si la constante est déclarée après, la remonter.)

5. Dans `fetch`, juste après `const url = new URL(request.url);` :

```ts
    const relayedResponse = await relay(request, url, env);
    if (relayedResponse) return relayedResponse;
```

6. Dans `/status`, étendre `config` :

```ts
      const config = {
        youtubeKey: Boolean(env.YOUTUBE_API_KEY),
        kv: Boolean(env.DOC_CACHE),
        debugToken: Boolean(env.DEBUG_TOKEN),
        tmdbKey: Boolean(env.TMDB_API_KEY),
        igdb: Boolean(env.IGDB_CLIENT_ID) && Boolean(env.IGDB_CLIENT_SECRET),
        issuesToken: Boolean(env.GITHUB_ISSUES_TOKEN),
        booksKey: Boolean(env.GOOGLE_BOOKS_API_KEY),
      };
```

- [ ] **Step 4: Vérifier la réussite**

Run: `npx vitest run tests/relay`
Expected: PASS (tous les fichiers de `tests/relay`, y compris les anciens).

- [ ] **Step 5: Commit**

```bash
git add relay/src/index.ts tests/relay/index.test.ts
git commit -m "feat(secrets): routage TMDB, Livres, IGDB et issues dans le Worker, CORS POST, /status"
```

---

### Task 6: Clients TMDB et Google Livres sans clé

**Files:**
- Modify: `src/core/screen/tmdb-api.ts`, `src/core/screen/config.ts`, `src/core/book/google-books-api.ts`, `src/core/book/config.ts`, `src/app/overlay.ts` (lignes ~85, ~622-624, ~666-671)
- Test: `tests/core/screen/tmdb-api.test.ts`, `tests/core/book/google-books-api.test.ts`

**Interfaces:**
- Consumes: `RELAY_BASE` de `src/core/documentary/config.ts`.
- Produces: `createTmdbApi(deps: { fetch: TmdbFetch })` (plus de `apiKey`) ; `createGoogleBooksApi(deps: { fetch: BookFetch })` (plus de `key`) ; `TMDB_RELAY` et `GOOGLE_BOOKS_RELAY` dans les `config.ts`.

- [ ] **Step 1: Adapter les tests**

Dans `tests/core/screen/tmdb-api.test.ts` : retirer `apiKey: 'KEY'` de l'appel `createTmdbApi` (ligne 5), importer `RELAY_BASE` depuis `../../../src/core/documentary/config`, et ajouter :

```ts
describe('relais', () => {
  it('appelle le relais, sans jamais envoyer de clé', async () => {
    const { api: tmdb, fetchFn } = api(() => Response.json({ id: 1, title: 'X', overview: '' }));
    await tmdb.detail('movie', 1);
    const url = new URL(fetchFn.mock.calls[0]?.[0] ?? '');
    expect(`${url.origin}${url.pathname}`).toBe(`${RELAY_BASE}/tmdb/movie/1`);
    expect(url.searchParams.has('api_key')).toBe(false);
    expect(url.searchParams.get('language')).toBe('fr-FR');
  });
});
```

Puis `grep -n "api_key\|KEY\|themoviedb" tests/core/screen/*.test.ts` et corriger chaque assertion qui attend `api.themoviedb.org` ou `api_key` : l'hôte attendu devient celui du relais et le préfixe de chemin `/tmdb`.

Dans `tests/core/book/google-books-api.test.ts` : même méthode — retirer `key:` de la construction, attendre `${RELAY_BASE}/books/volumes` et l'absence du paramètre `key`, avec `country=FR` et `maxResults=10` toujours présents.

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/core/screen/tmdb-api.test.ts tests/core/book/google-books-api.test.ts`
Expected: FAIL (clé toujours envoyée / mauvais hôte).

- [ ] **Step 3: Implémenter**

`src/core/screen/config.ts` : remplacer les deux premières lignes (commentaire + `TMDB_API_KEY`, et `TMDB_BASE`) par :

```ts
import { RELAY_BASE } from '../documentary/config';

// TMDB (films et séries) passe par le relais Cloudflare, qui détient la clé API : l'extension et l'APK n'en contiennent aucune.
export const TMDB_RELAY = `${RELAY_BASE}/tmdb`;
```

(garder `TMDB_IMAGE_BASE` et `TMDB_POSTER_BASE`).

`src/core/screen/tmdb-api.ts` : importer `TMDB_RELAY` à la place de `TMDB_BASE` ; signature `createTmdbApi(deps: { fetch: TmdbFetch })` ; dans `get()` :

```ts
    const query = new URLSearchParams({ language: LANGUAGE, ...params });
    let response: Response;
    try {
      response = await deps.fetch(`${TMDB_RELAY}${path}?${query.toString()}`);
```

(la branche 401 → `auth` reste en place : le relais ne renvoie plus 401, elle est inoffensive.)

`src/core/book/config.ts` : supprimer `GOOGLE_BOOKS_API_KEY` ; remplacer `GOOGLE_BOOKS_BASE` par `export const GOOGLE_BOOKS_RELAY = `${RELAY_BASE}/books`;` avec `import { RELAY_BASE } from '../documentary/config';` en tête et un commentaire « Google Livres passe par le relais (la clé est côté serveur) ».

`src/core/book/google-books-api.ts` : `import { GOOGLE_BOOKS_RELAY } from './config';`, signature `createGoogleBooksApi(deps: { fetch: BookFetch })`, paramètres `new URLSearchParams({ q: query, country: 'FR', maxResults: '10' })`, appel `requestJson(deps.fetch, `${GOOGLE_BOOKS_RELAY}/volumes?${params}`, responseSchema)`.

`src/app/overlay.ts` :
- Supprimer l'import de `TMDB_API_KEY` (ligne ~85) ; remplacer `import { AMAZON_PRICE_ENABLED, GOOGLE_BOOKS_API_KEY } from '../core/book/config';` par `import { AMAZON_PRICE_ENABLED } from '../core/book/config';`.
- Bloc TMDB (~ligne 622) : enlever `if (TMDB_API_KEY) {` et son `}` fermant (garder le `try/catch` et le contenu), mettre à jour le commentaire d'en-tête (« Films, séries, acteurs et réalisateurs (TMDB) via le relais… ») et remplacer la création par `const tmdbApi = createTmdbApi({ fetch: (url) => fetch(url) });`.
- Livres (~ligne 671) : `const googleBooks = createGoogleBooksApi({ fetch: (url) => fetch(url) });` (le `platformFetch` reste pour Amazon).

- [ ] **Step 4: Vérifier la réussite**

Run: `npx vitest run tests/core/screen tests/core/book && npx tsc --noEmit`
Expected: PASS, aucune erreur de type liée à ces fichiers (les erreurs restantes éventuelles concernent IGDB/anomalies, traitées aux tâches 7 et 8).

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(secrets): TMDB et Google Livres via le relais, plus aucune clé dans le client"
```

---

### Task 7: Client IGDB sans secret ni jeton

**Files:**
- Modify: `src/core/game/igdb-api.ts`, `src/core/game/config.ts`, `src/app/overlay.ts` (import ligne ~92, création ligne ~652)
- Test: `tests/core/game/igdb-api.test.ts`

**Interfaces:**
- Consumes: `detailQuery`, `searchQuery` de `igdb-queries.ts` (tâche 3) ; `RELAY_BASE`.
- Produces: `createIgdbApi(deps: { fetch: GameFetch; sleep?: (ms: number) => Promise<void> })` ; `IGDB_RELAY` (`${RELAY_BASE}/igdb/games`) dans `config.ts`.

- [ ] **Step 1: Adapter les tests**

Dans `tests/core/game/igdb-api.test.ts`, remplacer la fonction `setup` par une version sans Twitch :

```ts
function setup(over: { games?: (body: string) => Response } = {}) {
  const calls: { url: string; body?: string; headers?: Record<string, string> }[] = [];
  const fetch = vi.fn(async (url: string, init?: { body?: string; headers?: Record<string, string> }) => {
    calls.push({ url, ...(init?.body ? { body: init.body } : {}), ...(init?.headers ? { headers: init.headers } : {}) });
    return over.games ? over.games(init?.body ?? '') : Response.json([row]);
  });
  const api = createIgdbApi({ fetch, sleep: async () => undefined });
  return { api, fetch, calls };
}
```

Supprimer les tests qui portent sur le jeton (renouvellement, `tokenStatus`, `tokens()`), et remplacer la recherche des appels par `calls[0]` ; les attentes de corps deviennent : `'where slug = "super-metroid"'`, `'search "Super  Metroid"'`. Ajouter :

```ts
  it('appelle le relais en POST texte, sans identifiant ni jeton', async () => {
    const { api, calls } = setup();
    await api.detail({ id: 1000 });
    expect(calls[0]?.url).toBe(`${RELAY_BASE}/igdb/games`);
    expect(calls[0]?.headers).toEqual({ 'Content-Type': 'text/plain' });
    expect(JSON.stringify(calls[0])).not.toMatch(/Bearer|Client-ID|secret/i);
  });
```

(importer `RELAY_BASE`). Les tests de format de détail et de recherche (genres, plateformes, note, vidéo, pochette, tri par popularité) restent inchangés.

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/core/game/igdb-api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

`src/core/game/config.ts` : remplacer les trois lignes d'identifiants et `TWITCH_TOKEN_URL`, `IGDB_BASE` par :

```ts
import { RELAY_BASE } from '../documentary/config';

// IGDB passe par le relais Cloudflare, qui détient les identifiants Twitch et le jeton : l'extension et l'APK n'en contiennent aucun.
export const IGDB_RELAY = `${RELAY_BASE}/igdb/games`;
```

(garder `STEAM_*`, `IGDB_COVER_BASE`, `IGDB_THUMB_BASE`.)

`src/core/game/igdb-api.ts` : supprimer `z`-schéma du jeton (`tokenSchema`), `StoredToken`, `TOKEN_KEY`, `TOKEN_MARGIN_MS`, les constantes `DETAIL_FIELDS`, `SEARCH_FIELDS` et `clean`, ainsi que la fonction `token()` ; importer `detailQuery`, `searchQuery` de `./igdb-queries` et `IGDB_RELAY` de `./config` ; signature `createIgdbApi(deps: { fetch: GameFetch; sleep?: (ms: number) => Promise<void> })` ; `query` devient :

```ts
  // Le relais ajoute les identifiants et le jeton : le client n'envoie que la requête, en texte simple (pas de préambule CORS).
  function query(body: string): Promise<Row[]> {
    return paced(() => requestJson('igdb', fetchFn, IGDB_RELAY, rows, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body }));
  }
```

`detail` utilise `query(detailQuery(by))` et `search` utilise `query(searchQuery(title))`. Conserver `GAP_MS`, `paced`, `toDetail`, `yearOf`, `dateText`, le schéma `row` et le tri. Retirer l'import `KeyValueStore` et `GameError`/`TWITCH_TOKEN_URL` devenus inutiles.

`src/app/overlay.ts` : retirer `IGDB_CLIENT_ID, IGDB_CLIENT_SECRET, IGDB_ENABLED` de l'import (ligne ~92, supprimer la ligne si elle ne contient plus rien) ; création : `igdb: createIgdbApi({ fetch: (url, init) => fetch(url, init) }),` ; ajuster le commentaire (« Jeux vidéo : Steam sans clé, IGDB via le relais… »). `gameFetch` reste pour Steam.

- [ ] **Step 4: Vérifier la réussite**

Run: `npx vitest run tests/core/game tests/relay/igdb.test.ts && npx tsc --noEmit`
Expected: PASS ; plus d'erreur de type sur IGDB.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(secrets): IGDB via le relais, plus d'identifiant ni de jeton dans le client"
```

---

### Task 8: Anomalies et propositions de documentaire via le relais

**Files:**
- Modify: `src/core/anomalies/anomaly.ts`, `src/core/anomalies/config.ts`, `src/app/overlay.ts` (lignes ~121, ~196, ~709, ~725)
- Test: `tests/core/anomalies/anomaly.test.ts`, et les tests des propositions de documentaire (`grep -rln "postIssue" tests src`)

**Interfaces:**
- Consumes: `RELAY_BASE`.
- Produces: `postIssue(doFetch: Fetch, draft: IssueDraft): Promise<AnomalyResult>` (plus de `token`) ; `createAnomalyReporter({ fetch })` (plus de `token`) ; `ISSUES_ENDPOINT` (`${RELAY_BASE}/issues`) dans `anomalies/config.ts`.

- [ ] **Step 1: Adapter les tests**

Dans `tests/core/anomalies/anomaly.test.ts`, remplacer le bloc `describe('createAnomalyReporter', …)` :

```ts
describe('createAnomalyReporter', () => {
  const input = { description: 'Bug', name: null, platform: 'x' };
  it('envoie l’issue au relais, sans jeton, et rend son numéro', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, number: 7, url: 'https://github.com/o/r/issues/7' }), { status: 200 }));
    const result = await createAnomalyReporter({ fetch }).report(input);
    expect(result).toEqual({ ok: true, number: 7, url: 'https://github.com/o/r/issues/7' });
    const [url, init] = fetch.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe(`${RELAY_BASE}/issues`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'text/plain' });
    expect(JSON.parse(init.body)).toMatchObject({ labels: ['Nouveau'] });
    expect(JSON.stringify(init)).not.toMatch(/Bearer|Authorization/);
  });
  it('refuse une description vide sans appel réseau', async () => {
    const fetch = vi.fn();
    expect((await createAnomalyReporter({ fetch }).report({ ...input, description: '  ' })).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('signale un refus du relais avec son code', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }));
    expect(await createAnomalyReporter({ fetch }).report(input)).toEqual({ ok: false, error: expect.stringContaining('429') });
  });
  it('signale une panne réseau', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    expect((await createAnomalyReporter({ fetch }).report(input)).ok).toBe(false);
  });
});
```

(importer `RELAY_BASE` de `../../../src/core/documentary/config`). Pour les autres appelants de `postIssue` listés par le `grep`, retirer l'argument `token` des appels de test.

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/core/anomalies`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

`src/core/anomalies/config.ts` devient :

```ts
import { RELAY_BASE } from '../documentary/config';

// Les issues sont créées par le relais Cloudflare, qui détient le jeton GitHub (limité aux issues de ce dépôt) : l'extension et l'APK n'en contiennent aucun.
export const ISSUES_ENDPOINT = `${RELAY_BASE}/issues`;
```

`src/core/anomalies/anomaly.ts` : remplacer l'import par `import { ISSUES_ENDPOINT } from './config';` ; réécrire `postIssue` et `createAnomalyReporter` :

```ts
// Envoie une issue au relais, qui la crée sur GitHub ; partagé par « Remonter une anomalie » et les propositions de documentaire.
// Corps JSON envoyé en texte simple : pas de préambule CORS.
export async function postIssue(doFetch: Fetch, draft: IssueDraft): Promise<AnomalyResult> {
  try {
    const response = await doFetch(ISSUES_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(draft) });
    if (!response.ok) return { ok: false, error: `L’envoi a été refusé (code ${response.status}).` };
    const created = (await response.json()) as { number?: unknown; url?: unknown };
    if (typeof created.number !== 'number') return { ok: false, error: 'Réponse inattendue du serveur.' };
    return { ok: true, number: created.number, url: typeof created.url === 'string' ? created.url : '' };
  } catch {
    return { ok: false, error: 'Envoi impossible : vérifiez la connexion.' };
  }
}

export function createAnomalyReporter({ fetch: doFetch }: { fetch: Fetch }) {
  return {
    async report(input: AnomalyInput): Promise<AnomalyResult> {
      if (input.description.trim().length === 0) return { ok: false, error: 'Décrivez l’anomalie avant d’envoyer.' };
      return postIssue(doFetch, buildIssue(input));
    },
  };
}
```

`src/app/overlay.ts` : retirer l'import de `GITHUB_ISSUES_TOKEN` (ligne ~121) ; ligne ~196 : `const anomalies = createAnomalyReporter({ fetch: (url, init) => fetch(url, init) });` (adapter le commentaire : « Les anomalies passent par le relais Cloudflare ») ; ligne ~709 : `const issueFetch = (url: string, init?: RequestInit) => fetch(url, init);` ; ligne ~725 : `issues: { send: (draft) => postIssue(issueFetch, draft) },`. Là où `anomalies` était testé `null` (l'entrée « Remonter une anomalie » masquée sans jeton), le comportement reste correct (jamais `null` désormais) ; ne rien supprimer d'autre.

- [ ] **Step 4: Vérifier la réussite**

Run: `npx vitest run tests/core/anomalies tests/relay/issues.test.ts && npx tsc --noEmit`
Expected: PASS ; plus d'erreur de type.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(secrets): anomalies et propositions de documentaire via le relais, plus de jeton GitHub dans le client"
```

---

### Task 9: Mesure d'usage, nettoyage des hôtes et contrôle anti-fuite

**Files:**
- Modify: `src/core/telemetry/fetch-observer.ts`, `wxt.config.ts` (host_permissions ~lignes 22-30), `src/core/spotify/transport.ts` (lignes ~39-49 et l'import `ANOMALY_API_PREFIX`), `android/app/src/main/java/io/github/maximus49000/wikimasterstools/MainActivity.java` (`HTTP_ALLOWED`), `src/android/native-http.ts` (`GAME_NATIVE_PREFIXES`), `src/env.d.ts`, `package.json` (script)
- Create: `scripts/check-no-secrets.mjs`
- Test: `tests/core/telemetry/fetch-observer.test.ts`, `tests/core/spotify/transport.test.ts`

**Interfaces:**
- Produces: `serviceOf` classe `/tmdb*` → `tmdb`, `/igdb*` → `igdb`, `/books*` → `googlebooks`, `/issues` → `github`, le reste du relais → `relais`, `/t` → `null` ; script `npm run verifier-secrets` (code de sortie 1 si une valeur de `.env.local` apparaît dans `.output/` ou `android/app/src/main/assets/`).

- [ ] **Step 1: Écrire / adapter les tests**

Dans `tests/core/telemetry/fetch-observer.test.ts`, dans `describe('serviceOf')`, ajouter (avec `const R = 'https://wikimasters-tools.maxime-protais-baumer.workers.dev'`) :

```ts
  it('classe les routes du relais par service', () => {
    expect(serviceOf(`${R}/tmdb/movie/603?language=fr-FR`)).toBe('tmdb');
    expect(serviceOf(`${R}/igdb/games`)).toBe('igdb');
    expect(serviceOf(`${R}/books/volumes?q=x`)).toBe('googlebooks');
    expect(serviceOf(`${R}/issues`)).toBe('github');
    expect(serviceOf(`${R}/search?q=1`)).toBe('relais');
  });
```

Dans `tests/core/spotify/transport.test.ts` : retirer toute attente qui demande que `api.themoviedb.org`, `id.twitch.tv`, `api.igdb.com`, `www.googleapis.com` ou `api.github.com` soient relayés ; ajouter une attente qu'une requête `fetch` vers `https://api.themoviedb.org/3/movie/1` est **refusée** par le service worker (`adresse refusée`).

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/core/telemetry/fetch-observer.test.ts tests/core/spotify/transport.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

`fetch-observer.ts` : dans `HOSTS`, supprimer les entrées `api.themoviedb.org`, `api.igdb.com`, `www.googleapis.com`, `api.github.com` (plus appelées directement) ; ajouter avant `serviceOf` :

```ts
// Routes du relais qui transmettent à un service tiers : on compte les erreurs sous le nom du service, pas sous « relais ».
const RELAY_ROUTES: [string, Service][] = [
  ['/tmdb', 'tmdb'],
  ['/igdb', 'igdb'],
  ['/books', 'googlebooks'],
  ['/issues', 'github'],
];
```

et remplacer la ligne du relais dans `serviceOf` par :

```ts
  if (parsed.host === RELAY_HOST) {
    if (parsed.pathname === '/t') return null;
    return RELAY_ROUTES.find(([route]) => parsed.pathname === route || parsed.pathname.startsWith(`${route}/`))?.[1] ?? 'relais';
  }
```

`wxt.config.ts` : retirer de `host_permissions` `https://api.themoviedb.org/*`, `https://id.twitch.tv/*`, `https://api.igdb.com/*`, `https://www.googleapis.com/*`, `https://api.github.com/*`. Avant de retirer `api.github.com`, `grep -rn "api.github.com\|raw.githubusercontent" src` pour confirmer qu'aucun autre appel (hors `raw.githubusercontent.com`, qui est un autre hôte) n'en dépend.

`transport.ts` : retirer de `FETCH_PREFIXES` `https://api.themoviedb.org/3/`, `https://id.twitch.tv/oauth2/token`, `https://api.igdb.com/v4/`, `https://www.googleapis.com/books/v1/`, `ANOMALY_API_PREFIX` ; supprimer l'import `ANOMALY_API_PREFIX` ; ajuster le commentaire au-dessus (TMDB, Twitch/IGDB, Google Books et GitHub n'y figurent plus).

`MainActivity.java` : `HTTP_ALLOWED` ne garde que les deux hôtes Steam ; mettre à jour le commentaire (« Hôtes Steam sans CORS… »). `native-http.ts` : `GAME_NATIVE_PREFIXES` ne garde que `https://store.steampowered.com/` et `https://api.steampowered.com/`.

`src/env.d.ts` : supprimer les lignes `WXT_TMDB_API_KEY`, `WXT_GITHUB_ISSUES_TOKEN`, `WXT_IGDB_CLIENT_ID`, `WXT_IGDB_CLIENT_SECRET`, `WXT_GOOGLE_BOOKS_API_KEY`.

`scripts/check-no-secrets.mjs` :

```js
// Vérifie qu'aucune valeur de `.env.local` (clés WXT_*) n'apparaît dans les paquets compilés. N'affiche que des NOMS de variables, jamais de valeur.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const raw = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const secrets = raw
  .split(/\r?\n/)
  .map((line) => /^(WXT_[A-Z0-9_]+)=(.*)$/.exec(line))
  .filter(Boolean)
  .map((match) => [match[1], match[2].trim().replace(/^['"]|['"]$/g, '')])
  .filter(([, value]) => value.length >= 8);
const roots = process.argv.length > 2 ? process.argv.slice(2) : ['.output', 'android/app/src/main/assets'];

function* walk(path) {
  if (!existsSync(path)) return;
  if (statSync(path).isFile()) return yield path;
  for (const name of readdirSync(path)) yield* walk(join(path, name));
}

let leaks = 0;
let scanned = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    scanned += 1;
    const text = readFileSync(file, 'latin1');
    for (const [name, value] of secrets) {
      if (text.includes(value)) {
        console.error(`FUITE : ${name} dans ${file}`);
        leaks += 1;
      }
    }
  }
}
console.log(`${secrets.length} secret(s) cherché(s) dans ${scanned} fichier(s) : ${leaks === 0 ? 'aucune fuite' : `${leaks} fuite(s)`}.`);
process.exit(leaks === 0 ? 0 : 1);
```

`package.json` : ajouter `"verifier-secrets": "node scripts/check-no-secrets.mjs"` aux scripts.

- [ ] **Step 4: Vérifier — suite complète, types, build, absence de fuite**

Run :

```bash
npm test
npm run typecheck
npm run build
npm run build:overlay
npm run verifier-secrets
```

Expected : tous les tests passent (le test `market-search-flow` peut être instable sous charge, le relancer seul s'il échoue) ; typecheck sans erreur ; build sans erreur ; `verifier-secrets` affiche `aucune fuite` (code 0). **Si une fuite est signalée**, chercher dans le source une référence restante à `import.meta.env.WXT_…` ou à `import.meta.env` en bloc (`grep -rn "import.meta.env" src`) et la supprimer ; ne pas continuer tant que le contrôle n'est pas propre. (`build:overlay` produit le bundle de l'APK dans `android/app/src/main/assets/` ; s'il n'y écrit pas, lancer le build de l'APK de la tâche 10 puis relancer le contrôle.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(secrets): mesure d'usage par route, hôtes inutiles retirés, contrôle anti-fuite des paquets"
```

---

### Task 10: Documentation, déploiement du relais, vérification en réel et livraison

**Files:**
- Modify: `docs/guides/cloudflare-relais.md`, `README.md`, `docs/INSTALLATION.md` (les passages qui demandent de créer `WXT_TMDB_API_KEY`, `WXT_IGDB_*`, `WXT_GITHUB_ISSUES_TOKEN`, `WXT_GOOGLE_BOOKS_API_KEY` dans `.env.local` : les remplacer par « secrets du relais, posés avec `npx wrangler secret put` » ; vérifier avec `grep -rn "WXT_TMDB\|WXT_IGDB\|WXT_GITHUB_ISSUES\|WXT_GOOGLE_BOOKS" README.md docs --include=*.md`), `.env.local` n'est plus lu par le build pour ces clés (ne pas le modifier).
- Memory (hors dépôt) : mettre à jour `project_wikimasters_tools`/`reference_tmdb_cle.md` et ajouter une entrée d'index.

- [ ] **Step 1: Documentation**

Dans `docs/guides/cloudflare-relais.md`, ajouter une section « Partie F — Secrets des services tiers (TMDB, IGDB, GitHub, Google Livres) » : liste des cinq secrets (`TMDB_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`, `GITHUB_ISSUES_TOKEN`, `GOOGLE_BOOKS_API_KEY`), la commande `npx wrangler secret put <NOM>` pour chacun, le fait que `/status` montre leur présence, le renouvellement du jeton GitHub avant 2027-10, et la limite connue (compteurs de débit en mémoire, pas de cache sur `workers.dev`). Mettre à jour `README.md` et `docs/INSTALLATION.md` selon le `grep` ci-dessus. Revue du guide WikiHow : `grep -n -i "clé|TMDB|IGDB|anomalie" src/core/guide/entries.ts` (ou le fichier `entries.ts` du projet) ; aucune fiche ne doit plus demander une clé ou une compilation avec `.env.local` ; si une phrase visible change, donner un nouvel `id` à la fiche (règle du projet) et le dire dans le compte rendu.

- [ ] **Step 2: Déployer le relais depuis la branche (additif : n'altère aucune route existante)**

Run: `npx wrangler deploy`
Expected: déploiement réussi du Worker `wikimasters-tools`.

- [ ] **Step 3: Vérifier en réel**

```bash
curl -s https://wikimasters-tools.maxime-protais-baumer.workers.dev/status
curl -s "https://wikimasters-tools.maxime-protais-baumer.workers.dev/tmdb/movie/603?language=fr-FR" | head -c 200
curl -s "https://wikimasters-tools.maxime-protais-baumer.workers.dev/books/volumes?q=Dune%20Herbert&country=FR&maxResults=3" | head -c 200
curl -s -X OPTIONS -i https://wikimasters-tools.maxime-protais-baumer.workers.dev/issues | head -12
curl -s "https://wikimasters-tools.maxime-protais-baumer.workers.dev/tmdb/account"
```

Expected : `/status` montre `tmdbKey`, `igdb`, `issuesToken`, `booksKey` à `true` ; TMDB renvoie la fiche de Matrix (« The Matrix ») ; Livres renvoie du JSON `items` ; l'OPTIONS annonce `POST` et `content-type` ; `/tmdb/account` renvoie `{"ok":false,"reason":"not-found"}`. Tester IGDB sans créer d'issue :

```bash
node --experimental-strip-types -e "import('./src/core/game/igdb-queries.ts').then(({ searchQuery }) => fetch('https://wikimasters-tools.maxime-protais-baumer.workers.dev/igdb/games', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: searchQuery('Super Metroid') }).then((r) => r.text()).then((t) => console.log(t.slice(0, 200))))"
```

Expected : un tableau JSON contenant « Super Metroid ». **Ne pas tester `/issues` en réel** (cela créerait une vraie issue) sans l'accord de l'utilisateur : la route est couverte par les tests ; si l'utilisateur veut un essai, créer une issue « test relais » et la fermer aussitôt avec `gh issue close`. Si une vérification échoue, corriger avant de continuer (secrets via `npx wrangler secret list`, journaux via `npx wrangler tail`).

- [ ] **Step 4: Commit, pull request, fusion**

```bash
git add -A
git commit -m "docs(secrets): guide Cloudflare et installation, secrets désormais côté relais"
git push -u origin feat/secrets-relais
gh pr create --fill --title "feat(secrets): secrets TMDB, IGDB, GitHub et Google Livres côté relais" --body "Les clés ne sont plus dans l'extension ni dans l'APK : le relais Cloudflare les détient (liste blanche, limite de débit). Spec : docs/superpowers/specs/2026-10-08-secrets-relais-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --merge --delete-branch
```

Puis, depuis le dépôt principal à jour (`git checkout main && git pull`), selon la routine du projet : `npm run build`, `npm run preprod` (publie la pré-production ; **jamais** `npm run promouvoir` sans ordre explicite de l'utilisateur), `npm run verifier-secrets`, et lier la PR avec les outils `ccd_pr` (`get_status`, `bind_pr` si besoin).

- [ ] **Step 5: Mémoire et compte rendu**

Écrire/mettre à jour dans le dossier de mémoire : une entrée « secrets côté relais » (PR, numéro de pré-production, les cinq secrets posés sur Cloudflare, l'absence de révocation décidée, la limite des compteurs en mémoire, le reste à vérifier manuellement : recharger l'extension, ouvrir une fiche de film, de jeu, un livre, envoyer une anomalie ; APK sur demande) et corriger `reference_tmdb_cle.md` (la clé n'est plus injectée au build). Compte rendu à l'utilisateur : numéro de la pré-production, résultat du contrôle `verifier-secrets`, ce qui reste manuel, rappel que les anciennes clés restent actives dans les anciens paquets.
