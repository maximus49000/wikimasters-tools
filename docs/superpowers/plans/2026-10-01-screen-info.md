# Films, séries et filmographies dans la fiche — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher dans la fiche (`CardPopup`) d'une carte de la Collection : bande-annonce + note + description pour un film ou une série, filmographie cliquable pour un acteur ou réalisateur.

**Architecture:** Wikidata reconnaît la nature de la carte (`core/kinds`) et fournit les identifiants TMDB ; un client TMDB (zod, `fetch` injecté, cache TTL) rend le contenu ; un service (`screen-service`) et une section React (`ScreenSection`) sur le modèle de `music-service` / `ListenSection`. TMDB passe par le service worker dans l'extension (comme Spotify) et par `window.fetch` dans l'APK.

**Tech Stack:** TypeScript, React 19, zod 4, vitest (environnement node), WXT (extension), Vite (bundle APK).

**Spec:** `docs/superpowers/specs/2026-10-01-screen-info-design.md`

## Global Constraints

- Collection seulement : slug présent dans `wmt:collection` ; rien dans la grille, la map ou la frise.
- Texte de l'interface en français, glyphes SVG plutôt que du texte (`Glyphs.tsx`), cibles tactiles ≥ 44 px, sans survol.
- Aucune iframe YouTube avant le clic sur ▶.
- Clé TMDB v3 lue de `WXT_TMDB_API_KEY` (`.env.local`, ignoré par git) ; sans clé la section n'apparaît pas.
- Mention d'attribution : « Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB. »
- Filmographie : 40 titres au plus, dédoublonnée par `(media_type, id)`, du plus récent au plus ancien, sans date en dernier.
- Une carte sans identifiant TMDB sûr (titre identique) n'affiche rien plutôt qu'un mauvais film.
- Commentaires du code en français, sobres, comme dans le reste du dépôt. Commits en français, terminés par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Écarts assumés avec la spec

- Une seule requête TMDB pour les bandes-annonces : `append_to_response=videos` avec `include_video_language=fr,en,null` ; le français est préféré à l'anglais dans le tri (au lieu d'une seconde requête de repli).
- Une iframe bloquée par la CSP ne déclenche aucun événement détectable : un bouton « ouvrir sur YouTube » reste donc toujours visible à côté du lecteur, au lieu d'un repli automatique.

## Structure des fichiers

| Fichier | Rôle |
| --- | --- |
| `src/core/screen/config.ts` | clé et adresses TMDB |
| `src/core/screen/screen-kinds.ts` | `screenKindOf`, `personRoles` |
| `src/core/screen/wikidata-screen.ts` | identifiants TMDB lus sur Wikidata |
| `src/core/screen/screen-repo.ts` | persistance `screen-v1` |
| `src/core/screen/tmdb-api.ts` | client TMDB, erreurs, types |
| `src/core/screen/screen-format.ts` | adresses d'images/vidéo, note formatée |
| `src/content/screen-service.ts` | `view` / `detail` |
| `src/content/screen-registry.ts` | service global lu par la fiche |
| `src/content/TrailerPlayer.tsx` | miniature, ▶, iframe, lien externe |
| `src/content/ScreenSection.tsx` | détail, filmographie, retour |
| `src/content/Glyphs.tsx`, `CardPopup.tsx` | modifiés |
| `src/app/overlay.ts` | câblage |
| `src/core/spotify/transport.ts`, `wxt.config.ts`, `vite.android.config.ts` | accès réseau et variable d'environnement |

---

### Task 1: Configuration et accès réseau TMDB

**Files:**
- Create: `src/core/screen/config.ts`
- Modify: `src/core/spotify/transport.ts` (constante `FETCH_PREFIXES`)
- Modify: `wxt.config.ts` (`host_permissions`)
- Modify: `vite.android.config.ts`
- Test: `tests/core/spotify/transport.test.ts`

**Interfaces:**
- Produces: `TMDB_API_KEY: string` (vide si absente), `TMDB_BASE = 'https://api.themoviedb.org/3'`, `TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w92'`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin de `tests/core/spotify/transport.test.ts` (les imports `describe`, `expect`, `it`, `vi` et `handleSpotifyMessage` existent déjà ; vérifier avec un `Read` et ajouter ceux qui manquent) :

```ts
describe('handleSpotifyMessage — TMDB', () => {
  const deps = () => ({
    launchWebAuthFlow: vi.fn(),
    getRedirectUrl: vi.fn(),
    fetch: vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
  });

  it("relaie une requête vers l'API TMDB", async () => {
    const d = deps();
    const reply = await handleSpotifyMessage({ type: 'wmt:spotify', op: 'fetch', url: 'https://api.themoviedb.org/3/movie/1?api_key=x' }, d);
    expect(reply).toMatchObject({ ok: true, value: { status: 200, body: '{"ok":true}' } });
    expect(d.fetch).toHaveBeenCalledOnce();
  });

  it("refuse une autre adresse que l'API TMDB v3", async () => {
    const d = deps();
    const reply = await handleSpotifyMessage({ type: 'wmt:spotify', op: 'fetch', url: 'https://api.themoviedb.org.evil.test/3/x' }, d);
    expect(reply).toEqual({ ok: false, error: 'adresse refusée' });
    expect(d.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer le test, il doit échouer**

Run: `npx vitest run tests/core/spotify/transport.test.ts`
Expected: FAIL (« adresse refusée » pour la première requête).

- [ ] **Step 3: Implémenter**

`src/core/spotify/transport.ts`, remplacer la ligne `FETCH_PREFIXES` par :

```ts
// Le service worker relaie aussi TMDB (films et séries) : même contournement de la CSP du site.
const FETCH_PREFIXES = ['https://api.spotify.com/', 'https://accounts.spotify.com/api/token', 'https://api.themoviedb.org/3/'];
```

`src/core/screen/config.ts` :

```ts
// Clé API TMDB (v3, lecture seule) injectée à la compilation depuis `.env.local` ; vide : la fonction est désactivée.
export const TMDB_API_KEY: string = import.meta.env.WXT_TMDB_API_KEY ?? '';
export const TMDB_BASE = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w92';
```

`wxt.config.ts`, dans `host_permissions`, après la ligne `'https://accounts.spotify.com/*',` :

```ts
      'https://api.themoviedb.org/*',
```

`vite.android.config.ts` : ajouter la clé `envPrefix: ['VITE_', 'WXT_'],` juste après `define: …,` (le bundle APK lit ainsi `WXT_TMDB_API_KEY` dans `.env.local`, comme WXT).

- [ ] **Step 4: Vérifier**

Run: `npx vitest run tests/core/spotify/transport.test.ts` → PASS.
Run: `npm run typecheck` → sans erreur. Si `import.meta.env.WXT_TMDB_API_KEY` n'est pas typé, ajouter `src/env.d.ts` :

```ts
interface ImportMetaEnv {
  readonly WXT_TMDB_API_KEY?: string;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/core/screen/config.ts src/core/spotify/transport.ts wxt.config.ts vite.android.config.ts tests/core/spotify/transport.test.ts src/env.d.ts
git commit -m "feat: accès réseau TMDB (service worker, clé d'environnement)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(Si `src/env.d.ts` n'existe pas, l'omettre de `git add`.)

---

### Task 2: Reconnaissance film / série / personne

**Files:**
- Create: `src/core/screen/screen-kinds.ts`
- Test: `tests/core/screen/screen-kinds.test.ts`

**Interfaces:**
- Consumes: `CardKinds` de `src/core/kinds/wikidata-kinds.ts` (`{ natures: string[]; occupations: string[]; genres: string[] }`).
- Produces: `type ScreenKind = 'film' | 'series' | 'person'`, `screenKindOf(kinds: CardKinds | undefined): ScreenKind | null`, `personRoles(kinds: CardKinds | undefined): { acting: boolean; directing: boolean }`.

- [ ] **Step 1: Vérifier les identifiants Wikidata**

Run :
```bash
curl -s "https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels&languages=fr&format=json&ids=Q11424|Q24862|Q202866|Q506240|Q5398426|Q581714|Q1259759|Q33999|Q10800557|Q10798782|Q2405480|Q2526255|Q2059704"
```
Expected : chaque identifiant porte le libellé attendu (film, court métrage, film d'animation, téléfilm, série télévisée, série d'animation, mini-série, acteur, acteur de cinéma, acteur de télévision, acteur de doublage, réalisateur, réalisateur de télévision). Remplacer dans l'étape 3 tout identifiant dont le libellé ne correspond pas (chercher le bon sur wikidata.org).

- [ ] **Step 2: Écrire le test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import { personRoles, screenKindOf } from '../../../src/core/screen/screen-kinds';

const kinds = (natures: string[], occupations: string[] = []) => ({ natures, occupations, genres: [] });

describe('screenKindOf', () => {
  it('reconnaît un film et une série', () => {
    expect(screenKindOf(kinds(['Q11424']))).toBe('film');
    expect(screenKindOf(kinds(['Q24862']))).toBe('film');
    expect(screenKindOf(kinds(['Q5398426']))).toBe('series');
  });

  it('reconnaît un acteur et un réalisateur (humain) mais pas un autre métier', () => {
    expect(screenKindOf(kinds(['Q5'], ['Q33999']))).toBe('person');
    expect(screenKindOf(kinds(['Q5'], ['Q2526255']))).toBe('person');
    expect(screenKindOf(kinds(['Q5'], ['Q177220']))).toBeNull();
    expect(screenKindOf(kinds(['Q515'], ['Q33999']))).toBeNull();
  });

  it('rend null sans information ou pour une carte sans rapport', () => {
    expect(screenKindOf(undefined)).toBeNull();
    expect(screenKindOf(kinds(['Q482994']))).toBeNull();
  });

  it("préfère l'œuvre quand la nature est un film", () => {
    expect(screenKindOf(kinds(['Q11424', 'Q5'], ['Q33999']))).toBe('film');
  });
});

describe('personRoles', () => {
  it('distingue acteur, réalisateur, ou les deux', () => {
    expect(personRoles(kinds(['Q5'], ['Q33999']))).toEqual({ acting: true, directing: false });
    expect(personRoles(kinds(['Q5'], ['Q2526255']))).toEqual({ acting: false, directing: true });
    expect(personRoles(kinds(['Q5'], ['Q10800557', 'Q2059704']))).toEqual({ acting: true, directing: true });
    expect(personRoles(undefined)).toEqual({ acting: false, directing: false });
  });
});
```

- [ ] **Step 3: Lancer le test (échec), puis implémenter**

Run: `npx vitest run tests/core/screen/screen-kinds.test.ts` → FAIL (module absent).

`src/core/screen/screen-kinds.ts` :

```ts
import type { CardKinds } from '../kinds/wikidata-kinds';

export type ScreenKind = 'film' | 'series' | 'person';

// Natures Wikidata : film, court métrage, film d'animation, téléfilm ; série télévisée, série d'animation, mini-série.
const FILM = new Set(['Q11424', 'Q24862', 'Q202866', 'Q506240']);
const SERIES = new Set(['Q5398426', 'Q581714', 'Q1259759']);
const HUMAN = 'Q5';
// Métiers : acteur, acteur de cinéma, de télévision, de doublage ; réalisateur, réalisateur de télévision.
const ACTING = new Set(['Q33999', 'Q10800557', 'Q10798782', 'Q2405480']);
const DIRECTING = new Set(['Q2526255', 'Q2059704']);

// Ce que la fiche peut raconter d'une carte : film, série, ou personne de cinéma ; null si rien.
export function screenKindOf(kinds: CardKinds | undefined): ScreenKind | null {
  if (!kinds) return null;
  if (kinds.natures.some((id) => FILM.has(id))) return 'film';
  if (kinds.natures.some((id) => SERIES.has(id))) return 'series';
  const roles = personRoles(kinds);
  if (kinds.natures.includes(HUMAN) && (roles.acting || roles.directing)) return 'person';
  return null;
}

// Les filmographies à montrer : rôles d'acteur, réalisations, ou les deux.
export function personRoles(kinds: CardKinds | undefined): { acting: boolean; directing: boolean } {
  const occupations = kinds?.occupations ?? [];
  return { acting: occupations.some((id) => ACTING.has(id)), directing: occupations.some((id) => DIRECTING.has(id)) };
}
```

- [ ] **Step 4: Vérifier**

Run: `npx vitest run tests/core/screen/screen-kinds.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/screen/screen-kinds.ts tests/core/screen/screen-kinds.test.ts
git commit -m "feat: reconnaissance film, série, acteur et réalisateur

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Identifiants TMDB depuis Wikidata et persistance

**Files:**
- Create: `src/core/screen/wikidata-screen.ts`, `src/core/screen/screen-repo.ts`
- Test: `tests/core/screen/wikidata-screen.test.ts`, `tests/core/screen/screen-repo.test.ts`

**Interfaces:**
- Consumes: `getJson`, `parseWikibaseItems`, `usableClaims`, `FetchLike` (`core/birth/wikidata-birth`), `slugToTitle` (`core/market/market-book`), `KeyValueStore` (`core/cache/store`).
- Produces: `type CardScreen = { movieId?: number; tvId?: number; personId?: number }`, `parseCardScreen(json): Record<string, CardScreen>` (clé : identifiant Q), `fetchWikidataScreen(fetchFn, slugs): Promise<Record<string, CardScreen>>` (clé : slug), `createScreenRepo(store, fetchScreen, now?)` → `{ load(), resolve(slugs) }`, `type ScreenRepo`.

- [ ] **Step 1: Tests qui échouent**

`tests/core/screen/wikidata-screen.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { fetchWikidataScreen, parseCardScreen } from '../../../src/core/screen/wikidata-screen';

const text = (value: string, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value } } });
const entities = (record: Record<string, Record<string, unknown[]>>) => ({
  entities: Object.fromEntries(Object.entries(record).map(([key, claims]) => [key, { claims }])),
});

describe('parseCardScreen', () => {
  it('lit les identifiants TMDB film, série et personne', () => {
    const parsed = parseCardScreen(entities({ Q1: { P4947: [text('27205')], P4983: [text('1396')], P4985: [text('6193')] } }));
    expect(parsed.Q1).toEqual({ movieId: 27205, tvId: 1396, personId: 6193 });
  });

  it('ignore une valeur mal formée et un rang déprécié, garde le rang préféré', () => {
    const parsed = parseCardScreen(entities({ Q1: { P4947: [text('abc'), text('1', 'deprecated'), text('2', 'preferred')] } }));
    expect(parsed.Q1).toEqual({ movieId: 2 });
  });

  it('rend un objet vide sans valeur, et lève sur un format inattendu', () => {
    expect(parseCardScreen(entities({ Q1: {} })).Q1).toEqual({});
    expect(() => parseCardScreen({ pas: 'wikidata' })).toThrow();
  });
});

describe('fetchWikidataScreen', () => {
  it('rend une entrée par article', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      if (params.get('prop') === 'pageprops') {
        return Response.json({
          query: { pages: [{ title: 'Inception', pageprops: { wikibase_item: 'Q25188' } }, { title: 'Inconnu' }] },
        });
      }
      return Response.json(entities({ Q25188: { P4947: [text('27205')] } }));
    });
    const result = await fetchWikidataScreen(fetchFn, ['Inception', 'Inconnu']);
    expect(result).toEqual({ Inception: { movieId: 27205 }, Inconnu: {} });
  });
});
```

`tests/core/screen/screen-repo.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createScreenRepo } from '../../../src/core/screen/screen-repo';

describe('createScreenRepo', () => {
  it("n'interroge Wikidata que pour les articles jamais vus, et mémorise un article vide", async () => {
    const fetchScreen = vi.fn(async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, slug === 'A' ? { movieId: 1 } : {}])));
    const repo = createScreenRepo(createMemoryStore(), fetchScreen);
    expect(await repo.resolve(['A', 'B'])).toEqual({ A: { movieId: 1 }, B: {} });
    await repo.resolve(['A', 'B']);
    expect(fetchScreen).toHaveBeenCalledTimes(1);
  });

  it('ne mémorise rien après un échec et attend avant de réessayer', async () => {
    let t = 0;
    const fetchScreen = vi.fn(async () => {
      throw new Error('429');
    });
    const repo = createScreenRepo(createMemoryStore(), fetchScreen, () => t);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await repo.resolve(['A'])).toEqual({});
    t = 10_000;
    await repo.resolve(['A']);
    expect(fetchScreen).toHaveBeenCalledTimes(1);
    t = 70_000;
    await repo.resolve(['A']);
    expect(fetchScreen).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Lancer (échec)**

Run: `npx vitest run tests/core/screen` → FAIL (modules absents).

- [ ] **Step 3: Implémenter**

`src/core/screen/wikidata-screen.ts` :

```ts
import { z } from 'zod';
import { getJson, parseWikibaseItems, usableClaims, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle } from '../market/market-book';

// Identifiants TMDB lus sur Wikidata ; champ absent = inconnu (la recherche par titre prend alors le relais).
export type CardScreen = { movieId?: number; tvId?: number; personId?: number };

const WIKIPEDIA = 'https://fr.wikipedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';

const claimsResponse = z.object({
  entities: z.record(z.string(), z.object({ claims: z.record(z.string(), z.unknown()).optional() })),
});
const tmdbId = z.string().regex(/^\d+$/);

function firstId(claims: Record<string, unknown>, property: string): number | undefined {
  for (const claim of usableClaims(claims, property)) {
    const parsed = tmdbId.safeParse(claim.mainsnak.datavalue?.value);
    if (parsed.success) return Number(parsed.data);
  }
  return undefined;
}

// Un format inattendu lève : il ne doit pas être enregistré comme « pas de valeur ».
export function parseCardScreen(json: unknown): Record<string, CardScreen> {
  const parsed = claimsResponse.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikidata inattendue');
  const result: Record<string, CardScreen> = {};
  for (const [id, entity] of Object.entries(parsed.data.entities)) {
    const claims = entity.claims ?? {};
    const movieId = firstId(claims, 'P4947');
    const tvId = firstId(claims, 'P4983');
    const personId = firstId(claims, 'P4985');
    result[id] = {
      ...(movieId !== undefined ? { movieId } : {}),
      ...(tvId !== undefined ? { tvId } : {}),
      ...(personId !== undefined ? { personId } : {}),
    };
  }
  return result;
}

// Un lot d'articles (50 au plus) : élément Wikidata, puis identifiants TMDB.
// Seuls les titres sont envoyés : aucune donnée du jeu ni du compte.
export async function fetchWikidataScreen(fetchFn: FetchLike, slugs: string[]): Promise<Record<string, CardScreen>> {
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
      ? parseCardScreen(await getJson(fetchFn, WIKIDATA, { action: 'wbgetentities', props: 'claims', ids: itemIds.join('|') }, 'Wikidata'))
      : {};
  const result: Record<string, CardScreen> = {};
  slugs.forEach((slug, index) => {
    const id = items[titles[index] ?? ''];
    result[slug] = (id ? byItem[id] : undefined) ?? {};
  });
  return result;
}
```

`src/core/screen/screen-repo.ts` :

```ts
import type { KeyValueStore } from '../cache/store';
import type { CardScreen } from './wikidata-screen';

export type ScreenState = Record<string, CardScreen>;
export type ScreenFetcher = (slugs: string[]) => Promise<Record<string, CardScreen>>;

const KEY = 'screen-v1';
// Après un échec (429, hors ligne), on laisse Wikidata respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

export function createScreenRepo(store: KeyValueStore, fetchScreen: ScreenFetcher, now: () => number = () => Date.now()) {
  // Lectures et écritures sérialisées.
  let tail: Promise<unknown> = Promise.resolve();
  let failedAt: number | undefined;

  const read = async (): Promise<ScreenState> => (await store.get<ScreenState>(KEY)) ?? {};

  return {
    load: read,

    // Interroge Wikidata pour les articles jamais vus (un article sans valeur est mémorisé vide) ; rend l'état à jour.
    resolve(slugs: string[]): Promise<ScreenState> {
      const run = tail.then(async () => {
        const state = await read();
        const missing = slugs.filter((slug) => !Object.prototype.hasOwnProperty.call(state, slug));
        if (missing.length === 0) return state;
        if (failedAt !== undefined && now() - failedAt < COOLDOWN_MS) return state;
        try {
          const next = { ...state, ...(await fetchScreen(missing)) };
          await store.set(KEY, next);
          return next;
        } catch (error) {
          console.warn('[wikimasters-tools]', 'identifiants TMDB Wikidata indisponibles :', error);
          failedAt = now();
          return state;
        }
      });
      tail = run.catch(() => undefined);
      return run;
    },
  };
}

export type ScreenRepo = ReturnType<typeof createScreenRepo>;
```

- [ ] **Step 4: Vérifier**

Run: `npx vitest run tests/core/screen` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/screen tests/core/screen
git commit -m "feat: identifiants TMDB lus sur Wikidata et mémorisés

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Client TMDB

**Files:**
- Create: `src/core/screen/tmdb-api.ts`
- Test: `tests/core/screen/tmdb-api.test.ts`

**Interfaces:**
- Consumes: `ScreenKind` (Task 2).
- Produces:
  - `type MediaType = 'movie' | 'tv'`, `type TmdbFetch = (url: string) => Promise<Response>`
  - `type ScreenDetail = { mediaType: MediaType; id: number; title: string; year?: number; overview: string; rating?: { average: number; votes: number }; trailerKey?: string }`
  - `type FilmographyItem = { mediaType: MediaType; id: number; title: string; year?: number; rating?: number; posterPath?: string }`
  - `class TmdbError extends Error { code: 'auth' | 'not-found' | 'rate-limited' | 'http' }`, `userMessage(error: unknown): string`
  - `MAX_FILMOGRAPHY = 40`
  - `createTmdbApi({ fetch, apiKey })` → `{ detail(mediaType, id): Promise<ScreenDetail>; person(id, roles: { acting: boolean; directing: boolean }): Promise<FilmographyItem[]>; search(kind: ScreenKind, query: string): Promise<number | null> }`

- [ ] **Step 1: Test qui échoue**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTmdbApi, TmdbError, userMessage } from '../../../src/core/screen/tmdb-api';

const api = (handler: (url: URL) => Response | Promise<Response>) => {
  const fetchFn = vi.fn(async (url: string) => handler(new URL(url)));
  return { api: createTmdbApi({ fetch: fetchFn, apiKey: 'KEY' }), fetchFn };
};

describe('detail', () => {
  it('lit titre, année, note, description et la bande-annonce française officielle de préférence', async () => {
    const { api: tmdb, fetchFn } = api(() =>
      Response.json({
        id: 27205,
        title: 'Inception',
        release_date: '2010-07-16',
        overview: 'Un rêve.',
        vote_average: 8.369,
        vote_count: 37000,
        videos: {
          results: [
            { site: 'YouTube', type: 'Trailer', key: 'EN_OFFICIAL', official: true, iso_639_1: 'en' },
            { site: 'YouTube', type: 'Trailer', key: 'FR', official: false, iso_639_1: 'fr' },
            { site: 'Vimeo', type: 'Trailer', key: 'VIMEO', iso_639_1: 'fr' },
            { site: 'YouTube', type: 'Teaser', key: 'TEASER', iso_639_1: 'fr' },
          ],
        },
      }),
    );
    const detail = await tmdb.detail('movie', 27205);
    expect(detail).toEqual({
      mediaType: 'movie',
      id: 27205,
      title: 'Inception',
      year: 2010,
      overview: 'Un rêve.',
      rating: { average: 8.4, votes: 37000 },
      trailerKey: 'FR',
    });
    const url = new URL(fetchFn.mock.calls[0]![0]);
    expect(url.pathname).toBe('/3/movie/27205');
    expect(url.searchParams.get('api_key')).toBe('KEY');
    expect(url.searchParams.get('language')).toBe('fr-FR');
    expect(url.searchParams.get('append_to_response')).toBe('videos');
    expect(url.searchParams.get('include_video_language')).toBe('fr,en,null');
  });

  it('lit une série (name, first_air_date) ; sans vote, sans bande-annonce : rien de ces champs', async () => {
    const { api: tmdb } = api(() => Response.json({ id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20', overview: '', vote_average: 0, vote_count: 0 }));
    expect(await tmdb.detail('tv', 1396)).toEqual({ mediaType: 'tv', id: 1396, title: 'Breaking Bad', year: 2008, overview: '' });
  });
});

describe('person', () => {
  const credits = {
    cast: [
      { id: 1, media_type: 'movie', title: 'A', release_date: '2024-01-01', vote_average: 7.44, vote_count: 10 },
      { id: 2, media_type: 'tv', name: 'B', first_air_date: '2010-05-01', vote_average: 0, vote_count: 0 },
      { id: 3, media_type: 'movie', title: 'Sans date' },
      { id: 1, media_type: 'movie', title: 'A', release_date: '2024-01-01' },
      { id: 9, media_type: 'person', name: 'Pas un titre' },
    ],
    crew: [
      { id: 1, media_type: 'movie', title: 'A', release_date: '2024-01-01', job: 'Director' },
      { id: 4, media_type: 'movie', title: 'D', release_date: '2020-01-01', job: 'Director', poster_path: '/d.jpg' },
      { id: 5, media_type: 'movie', title: 'Produit', release_date: '2019-01-01', job: 'Producer' },
    ],
  };

  it("acteur : ses rôles, dédoublonnés, du plus récent au plus ancien, sans date en dernier", async () => {
    const { api: tmdb } = api(() => Response.json(credits));
    const items = await tmdb.person(7, { acting: true, directing: false });
    expect(items.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(items[0]).toEqual({ mediaType: 'movie', id: 1, title: 'A', year: 2024, rating: 7.4 });
    expect(items[1]).toEqual({ mediaType: 'tv', id: 2, title: 'B', year: 2010 });
  });

  it('réalisateur : seulement ses réalisations ; les deux rôles : réunis sans doublon', async () => {
    const { api: tmdb } = api(() => Response.json(credits));
    expect((await tmdb.person(7, { acting: false, directing: true })).map((item) => item.id)).toEqual([1, 4]);
    expect((await tmdb.person(7, { acting: true, directing: true })).map((item) => item.id)).toEqual([1, 4, 2, 3]);
    const director = (await tmdb.person(7, { acting: false, directing: true })).find((item) => item.id === 4);
    expect(director?.posterPath).toBe('/d.jpg');
  });

  it('plafonne à 40 titres', async () => {
    const cast = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, media_type: 'movie', title: `F${i}`, release_date: `${1950 + i}-01-01` }));
    const { api: tmdb } = api(() => Response.json({ cast, crew: [] }));
    expect(await tmdb.person(7, { acting: true, directing: false })).toHaveLength(40);
  });
});

describe('search', () => {
  it("n'accepte que le résultat dont le titre est identique (accents et casse ignorés)", async () => {
    const { api: tmdb, fetchFn } = api(() => Response.json({ results: [{ id: 5, title: 'Autre' }, { id: 6, title: 'Amélie' }] }));
    expect(await tmdb.search('film', 'amelie')).toBe(6);
    expect(new URL(fetchFn.mock.calls[0]![0]).pathname).toBe('/3/search/movie');
    expect(await tmdb.search('film', 'Inconnu')).toBeNull();
  });

  it('interroge /search/tv pour une série et /search/person pour une personne (nom)', async () => {
    const { api: tmdb, fetchFn } = api(() => Response.json({ results: [{ id: 1, name: 'Marion Cotillard' }] }));
    expect(await tmdb.search('person', 'Marion Cotillard')).toBe(1);
    expect(await tmdb.search('series', 'Marion Cotillard')).toBe(1);
    expect(fetchFn.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/3/search/person', '/3/search/tv']);
  });
});

describe('erreurs', () => {
  it('type les codes HTTP et un format inattendu', async () => {
    for (const [status, code] of [[401, 'auth'], [404, 'not-found'], [429, 'rate-limited'], [500, 'http']] as const) {
      const { api: tmdb } = api(() => new Response('{}', { status }));
      await expect(tmdb.detail('movie', 1)).rejects.toMatchObject({ code });
    }
    const { api: tmdb } = api(() => Response.json({ rien: true }));
    await expect(tmdb.detail('movie', 1)).rejects.toBeInstanceOf(TmdbError);
  });

  it('un échec réseau devient une erreur http, et userMessage rend toujours une phrase', async () => {
    const tmdb = createTmdbApi({ fetch: async () => Promise.reject(new TypeError('offline')), apiKey: 'K' });
    await expect(tmdb.detail('movie', 1)).rejects.toMatchObject({ code: 'http' });
    expect(userMessage(new TmdbError('rate-limited', 'x'))).toMatch(/patienter/);
    expect(userMessage(new Error('?'))).toMatch(/indisponible/);
  });
});
```

- [ ] **Step 2: Lancer (échec)**

Run: `npx vitest run tests/core/screen/tmdb-api.test.ts` → FAIL.

- [ ] **Step 3: Implémenter `src/core/screen/tmdb-api.ts`**

```ts
import { z } from 'zod';
import { TMDB_BASE } from './config';
import type { ScreenKind } from './screen-kinds';

export type MediaType = 'movie' | 'tv';
export type TmdbFetch = (url: string) => Promise<Response>;

export type ScreenDetail = {
  mediaType: MediaType;
  id: number;
  title: string;
  year?: number;
  overview: string;
  rating?: { average: number; votes: number };
  trailerKey?: string;
};
export type FilmographyItem = { mediaType: MediaType; id: number; title: string; year?: number; rating?: number; posterPath?: string };

export const MAX_FILMOGRAPHY = 40;
const LANGUAGE = 'fr-FR';

export type TmdbErrorCode = 'auth' | 'not-found' | 'rate-limited' | 'http';

export class TmdbError extends Error {
  constructor(
    readonly code: TmdbErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TmdbError';
  }
}

const MESSAGES: Record<TmdbErrorCode, string> = {
  auth: 'La clé TMDB est refusée.',
  'not-found': 'Introuvable sur TMDB.',
  'rate-limited': 'TMDB demande de patienter un instant. Réessaie dans quelques secondes.',
  http: 'TMDB est indisponible pour le moment.',
};

export const userMessage = (error: unknown): string => (error instanceof TmdbError ? MESSAGES[error.code] : MESSAGES.http);

const video = z.object({ site: z.string(), type: z.string(), key: z.string(), official: z.boolean().optional(), iso_639_1: z.string().nullish() });
const detailSchema = z.object({
  id: z.number(),
  title: z.string().optional(),
  name: z.string().optional(),
  release_date: z.string().optional(),
  first_air_date: z.string().optional(),
  overview: z.string().optional(),
  vote_average: z.number().optional(),
  vote_count: z.number().optional(),
  videos: z.object({ results: z.array(video) }).optional(),
});
const credit = z.object({
  id: z.number(),
  media_type: z.string(),
  title: z.string().optional(),
  name: z.string().optional(),
  release_date: z.string().optional(),
  first_air_date: z.string().optional(),
  vote_average: z.number().optional(),
  vote_count: z.number().optional(),
  poster_path: z.string().nullish(),
  job: z.string().optional(),
});
const creditsSchema = z.object({ cast: z.array(credit).optional(), crew: z.array(credit).optional() });
const searchSchema = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      title: z.string().optional(),
      name: z.string().optional(),
      original_title: z.string().optional(),
      original_name: z.string().optional(),
    }),
  ),
});

const yearOf = (date: string | undefined): number | undefined => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : undefined);
const roundRating = (value: number): number => Math.round(value * 10) / 10;
const normalize = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Français d'abord, puis officielle : la première bande-annonce YouTube.
function pickTrailer(videos: z.infer<typeof video>[]): string | undefined {
  const score = (item: z.infer<typeof video>) => (item.iso_639_1 === 'fr' ? 2 : 0) + (item.official ? 1 : 0);
  const candidates = videos.filter((item) => item.site === 'YouTube' && item.type === 'Trailer');
  return [...candidates].sort((a, b) => score(b) - score(a))[0]?.key;
}

export function createTmdbApi(deps: { fetch: TmdbFetch; apiKey: string }) {
  async function get<S extends z.ZodType>(path: string, params: Record<string, string>, schema: S): Promise<z.infer<S>> {
    const query = new URLSearchParams({ api_key: deps.apiKey, language: LANGUAGE, ...params });
    let response: Response;
    try {
      response = await deps.fetch(`${TMDB_BASE}${path}?${query.toString()}`);
    } catch {
      throw new TmdbError('http', 'TMDB injoignable');
    }
    if (response.status === 401) throw new TmdbError('auth', 'clé refusée');
    if (response.status === 404) throw new TmdbError('not-found', 'introuvable');
    if (response.status === 429) throw new TmdbError('rate-limited', 'limite atteinte');
    if (!response.ok) throw new TmdbError('http', `HTTP ${response.status}`);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new TmdbError('http', 'Réponse TMDB inattendue');
    return parsed.data;
  }

  return {
    async detail(mediaType: MediaType, id: number): Promise<ScreenDetail> {
      const data = await get(`/${mediaType}/${id}`, { append_to_response: 'videos', include_video_language: 'fr,en,null' }, detailSchema);
      const year = yearOf(data.release_date ?? data.first_air_date);
      const trailerKey = pickTrailer(data.videos?.results ?? []);
      return {
        mediaType,
        id,
        title: data.title ?? data.name ?? '',
        ...(year !== undefined ? { year } : {}),
        overview: data.overview ?? '',
        ...(data.vote_count && data.vote_count > 0 ? { rating: { average: roundRating(data.vote_average ?? 0), votes: data.vote_count } } : {}),
        ...(trailerKey ? { trailerKey } : {}),
      };
    },

    // Filmographie : rôles d'acteur et/ou réalisations, sans doublon, du plus récent au plus ancien.
    async person(id: number, roles: { acting: boolean; directing: boolean }): Promise<FilmographyItem[]> {
      const data = await get(`/person/${id}/combined_credits`, {}, creditsSchema);
      const entries = [...(roles.acting ? (data.cast ?? []) : []), ...(roles.directing ? (data.crew ?? []).filter((entry) => entry.job === 'Director') : [])];
      const seen = new Set<string>();
      const items: { date: string; item: FilmographyItem }[] = [];
      for (const entry of entries) {
        if (entry.media_type !== 'movie' && entry.media_type !== 'tv') continue;
        const title = entry.title ?? entry.name;
        const key = `${entry.media_type}:${entry.id}`;
        if (!title || seen.has(key)) continue;
        seen.add(key);
        const date = entry.release_date || entry.first_air_date || '';
        const year = yearOf(date);
        items.push({
          date,
          item: {
            mediaType: entry.media_type,
            id: entry.id,
            title,
            ...(year !== undefined ? { year } : {}),
            ...(entry.vote_count && entry.vote_count > 0 && entry.vote_average ? { rating: roundRating(entry.vote_average) } : {}),
            ...(entry.poster_path ? { posterPath: entry.poster_path } : {}),
          },
        });
      }
      return items
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, MAX_FILMOGRAPHY)
        .map(({ item }) => item);
    },

    // Recherche par titre quand Wikidata n'a pas d'identifiant : on ne retient qu'un titre strictement identique.
    async search(kind: ScreenKind, query: string): Promise<number | null> {
      const path = kind === 'film' ? '/search/movie' : kind === 'series' ? '/search/tv' : '/search/person';
      const data = await get(path, { query }, searchSchema);
      const wanted = normalize(query);
      const found = data.results.find((result) =>
        [result.title, result.name, result.original_title, result.original_name].some((label) => label !== undefined && normalize(label) === wanted),
      );
      return found?.id ?? null;
    },
  };
}

export type TmdbApi = ReturnType<typeof createTmdbApi>;
```

Note : `config.ts` importe `import.meta.env` ; sous vitest cela fonctionne (Vite).

- [ ] **Step 4: Vérifier**

Run: `npx vitest run tests/core/screen/tmdb-api.test.ts` → PASS. Si le tri « les deux rôles » attend `[1, 4, 2, 3]` : 1 (2024), 4 (2020), 2 (2010), 3 (sans date) ; corriger l'implémentation, pas l'attente, si l'ordre diffère.

- [ ] **Step 5: Commit**

```bash
git add src/core/screen/tmdb-api.ts tests/core/screen/tmdb-api.test.ts
git commit -m "feat: client TMDB (détail, filmographie, recherche par titre)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Service de la fiche

**Files:**
- Create: `src/content/screen-service.ts`, `src/content/screen-registry.ts`
- Test: `tests/content/screen-service.test.ts`

**Interfaces:**
- Consumes: `KnownCard` (`core/collection/collection-book`), `KindsRepo` (`resolveMissing`, `load`), `ScreenRepo.resolve` (Task 3), `TmdbApi` (`detail`, `person`, `search`), `screenKindOf`/`personRoles` (Task 2), `userMessage` (Task 4), `cleanTitle` (`core/music/listen`), `TtlCache.getOrLoad<T>(key, loader)` (`core/cache/ttl-cache`).
- Produces:
  - `type ScreenView = { status: 'none' } | { status: 'detail'; detail: ScreenDetail } | { status: 'filmography'; items: FilmographyItem[] } | { status: 'error'; message: string }`
  - `type ScreenDetailResult = { status: 'detail'; detail: ScreenDetail } | { status: 'error'; message: string }`
  - `createScreenService(deps)` → `{ view(slug, title): Promise<ScreenView>; detail(mediaType, id): Promise<ScreenDetailResult> }`, `type ScreenService`
  - `setScreenService(next: ScreenService | null): void`, `getScreenService(): ScreenService | null`

- [ ] **Step 1: Test qui échoue**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createScreenService } from '../../src/content/screen-service';
import { TmdbError } from '../../src/core/screen/tmdb-api';

const detail = { mediaType: 'movie' as const, id: 27205, title: 'Inception', overview: 'x' };

function setup(over: { collection?: string[]; natures?: string[]; occupations?: string[]; ids?: object; search?: number | null; hasKey?: boolean } = {}) {
  const api = {
    detail: vi.fn(async () => detail),
    person: vi.fn(async () => [{ mediaType: 'movie' as const, id: 1, title: 'A' }]),
    search: vi.fn(async () => (over.search === undefined ? null : over.search)),
  };
  const service = createScreenService({
    hasKey: over.hasKey ?? true,
    collection: { list: async () => (over.collection ?? ['Inception']).map((slug) => ({ slug, title: slug })) },
    kinds: {
      resolveMissing: vi.fn(async () => undefined),
      load: async () => ({ cards: { Inception: { natures: over.natures ?? ['Q11424'], occupations: over.occupations ?? [], genres: [] } }, labels: {} }),
    },
    screen: { resolve: async () => ({ Inception: over.ids ?? { movieId: 27205 } }) },
    api,
    cache: { getOrLoad: (_key, loader) => loader() },
  });
  return { service, api };
}

describe('createScreenService.view', () => {
  it("rend le détail d'un film de la collection avec l'identifiant Wikidata", async () => {
    const { service, api } = setup();
    expect(await service.view('Inception', 'Inception')).toEqual({ status: 'detail', detail });
    expect(api.detail).toHaveBeenCalledWith('movie', 27205);
    expect(api.search).not.toHaveBeenCalled();
  });

  it('une série utilise tvId', async () => {
    const { service, api } = setup({ natures: ['Q5398426'], ids: { tvId: 1396 } });
    await service.view('Inception', 'Inception');
    expect(api.detail).toHaveBeenCalledWith('tv', 1396);
  });

  it("repli : recherche par titre nettoyé quand Wikidata n'a pas d'identifiant", async () => {
    const { service, api } = setup({ ids: {}, search: 99 });
    await service.view('Inception', 'Inception_(film)');
    expect(api.search).toHaveBeenCalledWith('film', 'Inception');
    expect(api.detail).toHaveBeenCalledWith('movie', 99);
  });

  it('rien : sans clé, hors collection, carte sans rapport, ou aucun identifiant sûr', async () => {
    expect(await setup({ hasKey: false }).service.view('Inception', 'Inception')).toEqual({ status: 'none' });
    expect(await setup({ collection: [] }).service.view('Inception', 'Inception')).toEqual({ status: 'none' });
    expect(await setup({ natures: ['Q482994'] }).service.view('Inception', 'Inception')).toEqual({ status: 'none' });
    expect(await setup({ ids: {}, search: null }).service.view('Inception', 'Inception')).toEqual({ status: 'none' });
  });

  it("une personne rend sa filmographie selon ses métiers", async () => {
    const { service, api } = setup({ natures: ['Q5'], occupations: ['Q33999', 'Q2526255'], ids: { personId: 6193 } });
    expect(await service.view('Inception', 'Leonardo DiCaprio')).toEqual({ status: 'filmography', items: [{ mediaType: 'movie', id: 1, title: 'A' }] });
    expect(api.person).toHaveBeenCalledWith(6193, { acting: true, directing: true });
  });

  it('une panne TMDB devient un message', async () => {
    const { service, api } = setup();
    api.detail.mockRejectedValueOnce(new TmdbError('rate-limited', 'x'));
    expect(await service.view('Inception', 'Inception')).toMatchObject({ status: 'error', message: expect.stringContaining('patienter') });
  });
});

describe('createScreenService.detail', () => {
  it("rend la fiche d'un titre de la filmographie, ou un message", async () => {
    const { service, api } = setup();
    expect(await service.detail('movie', 1)).toEqual({ status: 'detail', detail });
    api.detail.mockRejectedValueOnce(new TmdbError('not-found', 'x'));
    expect(await service.detail('movie', 2)).toMatchObject({ status: 'error' });
  });
});
```

- [ ] **Step 2: Lancer (échec)**, puis **implémenter**

Run: `npx vitest run tests/content/screen-service.test.ts` → FAIL.

`src/content/screen-service.ts` :

```ts
import type { KnownCard } from '../core/collection/collection-book';
import type { TtlCache } from '../core/cache/ttl-cache';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { cleanTitle } from '../core/music/listen';
import { personRoles, screenKindOf } from '../core/screen/screen-kinds';
import type { ScreenRepo } from '../core/screen/screen-repo';
import { userMessage, type FilmographyItem, type MediaType, type ScreenDetail, type TmdbApi } from '../core/screen/tmdb-api';

export type ScreenView =
  | { status: 'none' }
  | { status: 'detail'; detail: ScreenDetail }
  | { status: 'filmography'; items: FilmographyItem[] }
  | { status: 'error'; message: string };

export type ScreenDetailResult = { status: 'detail'; detail: ScreenDetail } | { status: 'error'; message: string };

export type ScreenServiceDeps = {
  hasKey: boolean;
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  screen: Pick<ScreenRepo, 'resolve'>;
  api: Pick<TmdbApi, 'detail' | 'person' | 'search'>;
  cache: Pick<TtlCache, 'getOrLoad'>;
};

const normalize = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function createScreenService(deps: ScreenServiceDeps) {
  const { hasKey, collection, kinds, screen, api, cache } = deps;

  const detailOf = (mediaType: MediaType, id: number) => cache.getOrLoad(`screen-detail-${mediaType}-${id}`, () => api.detail(mediaType, id));

  return {
    // Ce que la fiche d'une carte montre : rien, le détail d'un film ou d'une série, une filmographie, ou une erreur.
    async view(slug: string, title: string): Promise<ScreenView> {
      if (!hasKey) return { status: 'none' };
      try {
        if (!(await collection.list()).some((card) => card.slug === slug)) return { status: 'none' };
        await kinds.resolveMissing([slug]);
        const cardKinds = (await kinds.load()).cards[slug];
        const kind = screenKindOf(cardKinds);
        if (!kind) return { status: 'none' };
        const ids = (await screen.resolve([slug]))[slug] ?? {};
        const known = kind === 'film' ? ids.movieId : kind === 'series' ? ids.tvId : ids.personId;
        const query = cleanTitle(title);
        const id =
          known ?? (await cache.getOrLoad(`screen-search-${kind}-${normalize(query)}`, () => api.search(kind, query))) ?? undefined;
        if (id === undefined) return { status: 'none' };
        if (kind === 'person') {
          const roles = personRoles(cardKinds);
          const items = await cache.getOrLoad(`screen-person-${id}-${roles.acting ? 1 : 0}${roles.directing ? 1 : 0}`, () => api.person(id, roles));
          return { status: 'filmography', items };
        }
        return { status: 'detail', detail: await detailOf(kind === 'film' ? 'movie' : 'tv', id) };
      } catch (error) {
        return { status: 'error', message: userMessage(error) };
      }
    },

    // Fiche d'un titre ouvert depuis une filmographie.
    async detail(mediaType: MediaType, id: number): Promise<ScreenDetailResult> {
      try {
        return { status: 'detail', detail: await detailOf(mediaType, id) };
      } catch (error) {
        return { status: 'error', message: userMessage(error) };
      }
    },
  };
}

export type ScreenService = ReturnType<typeof createScreenService>;
```

`src/content/screen-registry.ts` :

```ts
import type { ScreenService } from './screen-service';

// Le service est créé une fois par la surcouche ; les fiches de carte (CardPopup) le lisent ici.
let service: ScreenService | null = null;

export const setScreenService = (next: ScreenService | null): void => {
  service = next;
};
export const getScreenService = (): ScreenService | null => service;
```

- [ ] **Step 3: Vérifier**

Run: `npx vitest run tests/content/screen-service.test.ts` → PASS ; `npm run typecheck` → sans erreur.

- [ ] **Step 4: Commit**

```bash
git add src/content/screen-service.ts src/content/screen-registry.ts tests/content/screen-service.test.ts
git commit -m "feat: service de la fiche film, série et filmographie

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Interface de la fiche (glyphes, lecteur, section, CardPopup)

**Files:**
- Create: `src/core/screen/screen-format.ts`, `src/content/TrailerPlayer.tsx`, `src/content/ScreenSection.tsx`
- Modify: `src/content/Glyphs.tsx`, `src/content/CardPopup.tsx`
- Test: `tests/core/screen/screen-format.test.ts`

**Interfaces:**
- Consumes: `ScreenView`, `ScreenDetailResult` (Task 5), `getScreenService` (Task 5), `FilmographyItem`, `ScreenDetail` (Task 4), `TMDB_IMAGE_BASE` (Task 1).
- Produces: `embedUrl(key)`, `thumbnailUrl(key)`, `watchUrl(key)`, `posterUrl(path)`, `formatRating(average)`, `formatVotes(votes)`, composants `TrailerPlayer({ trailerKey })`, `ScreenSection({ slug, title, onHeight })`.

- [ ] **Step 1: Test qui échoue** (`tests/core/screen/screen-format.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { embedUrl, formatRating, formatVotes, posterUrl, thumbnailUrl, watchUrl } from '../../../src/core/screen/screen-format';

describe('screen-format', () => {
  it('construit les adresses YouTube sans cookies et la miniature', () => {
    expect(embedUrl('abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123?autoplay=1&rel=0');
    expect(thumbnailUrl('abc123')).toBe('https://img.youtube.com/vi/abc123/hqdefault.jpg');
    expect(watchUrl('abc123')).toBe('https://www.youtube.com/watch?v=abc123');
  });

  it("encode la clé et n'accepte que des caractères de clé YouTube", () => {
    expect(embedUrl('a b/c')).toBeNull();
    expect(watchUrl('<x>')).toBeNull();
    expect(thumbnailUrl('../x')).toBeNull();
  });

  it('formate la note avec une virgule et les votes avec des espaces', () => {
    expect(formatRating(7.8)).toBe('7,8');
    expect(formatRating(8)).toBe('8,0');
    expect(formatVotes(12450)).toBe('12 450');
    expect(formatVotes(37)).toBe('37');
  });

  it("construit l'adresse d'une affiche", () => {
    expect(posterUrl('/d.jpg')).toBe('https://image.tmdb.org/t/p/w92/d.jpg');
    expect(posterUrl(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer (échec), puis implémenter `src/core/screen/screen-format.ts`**

```ts
import { TMDB_IMAGE_BASE } from './config';

// Clé de vidéo YouTube : lettres, chiffres, tiret, souligné. Autre chose : on n'en fait pas une adresse.
const VIDEO_KEY = /^[\w-]{3,32}$/;

export const embedUrl = (key: string): string | null =>
  VIDEO_KEY.test(key) ? `https://www.youtube-nocookie.com/embed/${key}?autoplay=1&rel=0` : null;
export const thumbnailUrl = (key: string): string | null => (VIDEO_KEY.test(key) ? `https://img.youtube.com/vi/${key}/hqdefault.jpg` : null);
export const watchUrl = (key: string): string | null => (VIDEO_KEY.test(key) ? `https://www.youtube.com/watch?v=${key}` : null);

export const posterUrl = (path: string | undefined): string | null => (path ? `${TMDB_IMAGE_BASE}${path}` : null);

export const formatRating = (average: number): string => average.toFixed(1).replace('.', ',');
export const formatVotes = (votes: number): string => String(votes).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
```

Run: `npx vitest run tests/core/screen/screen-format.test.ts` → PASS.

- [ ] **Step 3: Glyphes** — dans `src/content/Glyphs.tsx`, ajouter dans `PATHS`, avant `} as const;` :

```tsx
  star: <polygon points="12,3 14.8,9 21,9.8 16.4,14.2 17.6,21 12,17.8 6.4,21 7.6,14.2 3,9.8 9.2,9" />,
  back: (
    <>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12,5 5,12 12,19" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="7" y1="4" x2="7" y2="20" />
      <line x1="17" y1="4" x2="17" y2="20" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <line x1="20" y1="4" x2="11" y2="13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
```

- [ ] **Step 4: `src/content/TrailerPlayer.tsx`**

```tsx
import { useState } from 'react';
import { embedUrl, thumbnailUrl, watchUrl } from '../core/screen/screen-format';
import { Glyph } from './Glyphs';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const HEIGHT = 'min(130px, 20vh)';

// Miniature + ▶ ; l'iframe YouTube (sans cookies) n'est chargée qu'au clic. Le lien externe reste là si le site la bloque.
export function TrailerPlayer({ trailerKey }: { trailerKey: string }) {
  const [playing, setPlaying] = useState(false);
  const embed = embedUrl(trailerKey);
  const thumb = thumbnailUrl(trailerKey);
  const watch = watchUrl(trailerKey);
  if (!embed || !watch) return null;

  return (
    <div style={{ position: 'relative', width: '100%', height: HEIGHT, borderRadius: 8, overflow: 'hidden', background: '#000', border }}>
      {playing ? (
        <iframe
          src={embed}
          title="Bande-annonce"
          allow="autoplay; encrypted-media; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ width: '100%', height: '100%', border: 0 }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label="Lire la bande-annonce"
          title="Lire la bande-annonce"
          style={{
            width: '100%',
            height: '100%',
            cursor: 'pointer',
            border: 0,
            padding: 0,
            color: '#fff',
            background: thumb ? `center / cover no-repeat url(${thumb})` : '#1b2330',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name="play" size={22} />
          </span>
        </button>
      )}
      <a
        href={watch}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Ouvrir sur YouTube"
        title="Ouvrir sur YouTube"
        style={{ position: 'absolute', top: 4, right: 4, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Glyph name="external" size={16} />
      </a>
    </div>
  );
}
```

- [ ] **Step 5: `src/content/ScreenSection.tsx`**

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatRating, formatVotes, posterUrl } from '../core/screen/screen-format';
import type { FilmographyItem, ScreenDetail } from '../core/screen/tmdb-api';
import { Glyph } from './Glyphs';
import { getScreenService } from './screen-registry';
import type { ScreenDetailResult, ScreenView } from './screen-service';
import { TrailerPlayer } from './TrailerPlayer';

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
const STAR = '#fbbf24';

type Opened = { item: FilmographyItem; result: ScreenDetailResult | null };
type Props = { slug: string; title: string; onHeight: (px: number) => void };

function Rating({ detail }: { detail: ScreenDetail }) {
  if (!detail.rating) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      <span style={{ color: STAR, display: 'inline-flex' }}>
        <Glyph name="star" size={16} />
      </span>
      <b style={{ fontSize: 15 }}>{formatRating(detail.rating.average)}</b>
      <span style={{ opacity: 0.7 }}>/10 · {formatVotes(detail.rating.votes)} votes</span>
    </div>
  );
}

function Detail({ detail }: { detail: ScreenDetail }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {detail.trailerKey && <TrailerPlayer trailerKey={detail.trailerKey} />}
      <Rating detail={detail} />
      {detail.overview && <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, maxHeight: 'min(96px, 15vh)', overflowY: 'auto' }}>{detail.overview}</p>}
    </div>
  );
}

// Section « film, série ou filmographie » de la fiche d'une carte de la collection ; rien pour les autres cartes.
export function ScreenSection({ slug, title, onHeight }: Props) {
  const service = getScreenService();
  const [view, setView] = useState<ScreenView | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const token = useRef(0);

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    setOpened(null);
    void service.view(slug, title).then((next) => !cancelled && setView(next));
    return () => {
      cancelled = true;
    };
  }, [service, slug, title]);

  // La fiche se replace selon la hauteur réelle de la section.
  useLayoutEffect(() => {
    onHeight(view && view.status !== 'none' ? (ref.current?.offsetHeight ?? 0) : 0);
  }, [view, opened, onHeight]);

  if (!service || !view || view.status === 'none') return null;

  const open = (item: FilmographyItem) => {
    const mine = ++token.current;
    setOpened({ item, result: null });
    void service.detail(item.mediaType, item.id).then((result) => {
      if (mine === token.current) setOpened({ item, result });
    });
  };
  const back = () => {
    token.current += 1;
    setOpened(null);
  };

  return (
    <div ref={ref} style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {view.status === 'error' && <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{view.message}</p>}
      {view.status === 'detail' && <Detail detail={view.detail} />}
      {view.status === 'filmography' && (
        <>
          {opened && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button type="button" onClick={back} aria-label="Retour à la filmographie" title="Retour à la filmographie" style={iconButton}>
                  <Glyph name="back" />
                </button>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600 }}>
                  {opened.item.title}
                  {opened.item.year && <span style={{ fontWeight: 400, opacity: 0.7 }}> {opened.item.year}</span>}
                </span>
              </div>
              {opened.result === null && <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>Chargement…</p>}
              {opened.result?.status === 'error' && <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{opened.result.message}</p>}
              {opened.result?.status === 'detail' && <Detail detail={opened.result.detail} />}
            </>
          )}
          {/* Liste masquée (pas retirée) pendant la fiche d'un titre : le défilement est conservé au retour. */}
          <div style={{ display: opened ? 'none' : 'block' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
              <Glyph name="film" size={16} /> Filmographie <span style={{ fontWeight: 400, opacity: 0.7 }}>· {view.items.length}</span>
            </div>
            {view.items.length === 0 && <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.7 }}>Aucun titre connu.</p>}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 'min(180px, 28vh)', overflowY: 'auto' }}>
              {view.items.map((item) => {
                const poster = posterUrl(item.posterPath);
                return (
                  <li key={`${item.mediaType}-${item.id}`} style={{ borderBottom: border }}>
                    <button
                      type="button"
                      onClick={() => open(item)}
                      aria-label={`Ouvrir ${item.title}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: SIZE, padding: '2px 0', cursor: 'pointer', color: 'inherit', background: 'none', border: 0, textAlign: 'left', font: '13px system-ui, sans-serif' }}
                    >
                      <span style={{ width: 26, height: 38, flex: 'none', borderRadius: 3, background: poster ? `center / cover no-repeat url(${poster})` : 'rgba(148,163,184,0.25)' }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                        {item.year && <span style={{ fontSize: 11, opacity: 0.6 }}>{item.year}</span>}
                      </span>
                      {item.rating !== undefined && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: STAR, fontSize: 12 }}>
                          <Glyph name="star" size={13} /> {formatRating(item.rating)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
      <p style={{ margin: 0, fontSize: 10, opacity: 0.6 }}>Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.</p>
    </div>
  );
}
```

- [ ] **Step 6: `src/content/CardPopup.tsx`** — modifications :

1. Import : après `import { ListenSection } from './ListenSection';` ajouter `import { ScreenSection } from './ScreenSection';`
2. Remplacer
```tsx
  // Hauteur de la section « Écouter » : réservée dans le calcul de l'échelle de la carte.
  const [listenHeight, setListenHeight] = useState(0);
```
par
```tsx
  // Hauteur des sections « Écouter » et « Film / série » : réservée dans le calcul de l'échelle de la carte.
  const [listenHeight, setListenHeight] = useState(0);
  const [screenHeight, setScreenHeight] = useState(0);
  const extraHeight = listenHeight + screenHeight;
```
3. Dans le calcul `cardScale`, remplacer `- listenHeight)` par `- extraHeight)` ; dans les dépendances `[anchor, preview, listenHeight]` mettre `[anchor, preview, extraHeight]`.
4. Après la ligne `{slug && <ListenSection … />}` ajouter :
```tsx
      {slug && <ScreenSection slug={slug} title={preview.title} onHeight={setScreenHeight} />}
```
5. Mettre à jour le commentaire de la prop `slug` : « active les sections « Écouter » et « film / série » des cartes de la collection ».

- [ ] **Step 7: Vérifier**

Run: `npm run typecheck` → sans erreur ; `npm test` → tous les tests passent.

- [ ] **Step 8: Commit**

```bash
git add src/core/screen/screen-format.ts src/content/TrailerPlayer.tsx src/content/ScreenSection.tsx src/content/Glyphs.tsx src/content/CardPopup.tsx tests/core/screen/screen-format.test.ts
git commit -m "feat: section film, série et filmographie dans la fiche de la carte

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Câblage dans la surcouche

**Files:**
- Modify: `src/app/overlay.ts`

**Interfaces:**
- Consumes: `createScreenRepo`, `fetchWikidataScreen`, `createTmdbApi`, `createScreenService`, `setScreenService`, `createTtlCache`, `TMDB_API_KEY`.

- [ ] **Step 1: Imports** — dans `src/app/overlay.ts`, près des imports `createMusicRepo` / `createMusicService` :

```ts
import { createTtlCache } from '../core/cache/ttl-cache';
import { TMDB_API_KEY } from '../core/screen/config';
import { createScreenRepo } from '../core/screen/screen-repo';
import { createTmdbApi } from '../core/screen/tmdb-api';
import { fetchWikidataScreen } from '../core/screen/wikidata-screen';
import { createScreenService } from '../content/screen-service';
import { setScreenService } from '../content/screen-registry';
```
(Vérifier d'abord avec `Grep` qu'aucun n'est déjà importé : `createTtlCache` l'est peut-être.)

- [ ] **Step 2: Bloc de câblage** — juste après le bloc `if (spotify) { … }` (avant le commentaire « Relevé du marché ») :

```ts
  // Films, séries, acteurs et réalisateurs (TMDB) : absent sans clé. TMDB passe par le même `fetch` que Spotify
  // (service worker dans l'extension, `window.fetch` dans l'APK). Une panne ici ne doit jamais empêcher la surcouche.
  if (TMDB_API_KEY) {
    try {
      setScreenService(
        createScreenService({
          hasKey: true,
          collection: collectionRepo,
          kinds: kindsRepo,
          screen: createScreenRepo(store, (slugs) => fetchWikidataScreen((url) => fetch(url), slugs)),
          api: createTmdbApi({ fetch: (url) => (spotify ? spotify.fetch(url) : fetch(url)), apiKey: TMDB_API_KEY }),
          cache: createTtlCache(store, { ttlMs: 24 * 3_600_000 }),
        }),
      );
    } catch (error) {
      console.warn(LOG, 'films et séries indisponibles :', error);
    }
  }
```

- [ ] **Step 3: Vérifier**

Run: `npm run typecheck && npm test` → tout passe. Run: `npm run build` → build WXT sans erreur.

- [ ] **Step 4: Commit**

```bash
git add src/app/overlay.ts
git commit -m "feat: câblage de la section film et série dans la surcouche

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Documentation, vérification dans Chrome, livraison

**Files:**
- Modify: `README.md`, `docs/INSTALLATION.md` (mention de la clé pour qui recompile)

- [ ] **Step 1: README** — après la section « Écouter la musique d'une carte (Spotify) », ajouter :

```markdown
### Films, séries, acteurs et réalisateurs (TMDB)

Sur la fiche d'une carte **de votre Collection** qui est un film ou une série, la fiche affiche la bande-annonce
(lecteur YouTube sans cookies, chargé seulement au clic ▶ ; un bouton ouvre aussi YouTube), la note ★ sur 10 avec le
nombre de votes, et la description. Pour un acteur ou un réalisateur, elle affiche sa filmographie (40 titres au
plus, du plus récent au plus ancien) ; un clic sur un titre ouvre sa fiche, « ← » revient à la liste.

L'extension reconnaît la carte grâce à Wikidata (nature, métier, identifiant TMDB) puis lit [TMDB](https://www.themoviedb.org).
Seuls des titres et des identifiants partent vers TMDB, jamais de donnée du jeu ou de votre compte. La clé API
TMDB (v3) se place dans `.env.local` : `WXT_TMDB_API_KEY=…` ; sans clé la section n'apparaît pas.

Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.
```

Dans `docs/INSTALLATION.md`, ajouter une courte note : pour recompiler, créer `.env.local` avec `WXT_TMDB_API_KEY`.

- [ ] **Step 2: Vérification automatique**

Run: `npm run typecheck && npm test && npm run build && npm run build:firefox` → tout passe.

- [ ] **Step 3: Vérification manuelle dans Chrome** (`.output/chrome-mv3`, extension rechargée)

Sur wiki-masters.com, ouvrir la fiche : (a) un film de la Collection → miniature + ▶, note, description, ▶ lit la vidéo dans la fiche ; (b) une série ; (c) un acteur → filmographie, clic sur un titre → détail, « ← » → liste au même défilement ; (d) un réalisateur ; (e) une carte hors Collection et une carte musique → aucune section film. Noter si l'iframe YouTube ou les affiches sont bloquées par le site (le lien externe doit alors suffire). Vérifier aussi que la section « Écouter » des cartes musique n'a pas changé.

- [ ] **Step 4: APK** — Run: `npm run apk` ; copier l'APK dans `livrables/` (le script le fait déjà). Noter que l'iframe et les affiches dans la WebView sont à vérifier sur le téléphone.

- [ ] **Step 5: Commit, push, PR, fusion** (consigne permanente de l'utilisateur : PR ouverte et fusionnée sans demander)

```bash
git add README.md docs/INSTALLATION.md
git commit -m "docs: films, séries et filmographies (TMDB)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin feat/screen-info
gh pr create --base main --title "feat: films, séries et filmographies dans la fiche (TMDB)" --body "Bande-annonce, note et description des films et séries ; filmographie cliquable des acteurs et réalisateurs. Wikidata reconnaît la carte, TMDB fournit le contenu.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --merge
```
Puis lier la PR avec les outils `ccd_pr` (`get_status`, `bind_pr` si besoin).

---

## Auto-relecture

- Couverture de la spec : reconnaissance (T2), identifiants Wikidata + repli (T3, T5), client TMDB, plafond 40, rôles (T4), service et collection seulement (T5), UI, lecteur au clic, retour, attribution (T6), câblage (T7), réseau, clé, permission (T1), docs, vérification, APK, PR (T8).
- Cohérence des types : `ScreenKind`, `FilmographyItem`, `ScreenDetail`, `ScreenView`, `ScreenDetailResult`, `createTmdbApi` utilisés avec les mêmes noms dans T4 à T7.
- Points à vérifier à l'exécution : identifiants Q (T2 étape 1), typage de `import.meta.env` (T1 étape 4), expression exacte des imports déjà présents dans `overlay.ts` (T7 étape 1).
