# Vue « Monde » de la Collection — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à la page Collection un interrupteur « Monde » (à côté de « Sélectionner ») qui remplace la grille par une carte Leaflet où les cartes connues sont des points, positionnés via Wikipédia ou à la main.

**Architecture:** Logique pure et stockage dans `src/core/` (collection connue, positions, coordonnées Wikipédia), repérage du DOM et interrupteur dans `src/content/` (structure/texte, jamais les classes CSS du site), carte Leaflet dans un shadow DOM inséré juste avant la grille masquée. Le branchement se fait par une seule fonction `sync()` appelée depuis le `run()` existant de `src/entrypoints/content.tsx`.

**Tech Stack:** WXT, React 19, zod 4, Vitest 5 (+ jsdom via `// @vitest-environment jsdom`), Leaflet 1.9 + `@types/leaflet`.

**Spec:** `docs/superpowers/specs/2026-09-30-collection-world-view-design.md`

## Global Constraints

- Extension en lecture seule : aucune requête ajoutée vers l'API du jeu, pas de crawl, jamais `/sales`. Seules requêtes nouvelles : Wikipédia (titre d'article uniquement) et les tuiles CARTO.
- Commande npm : `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" <args>` (le npm global 8.1.1 masque le bon ; pas de `npx`). Noté `NPM` ci-dessous.
- `noUncheckedIndexedAccess` est actif : les accès de tableau/objet indexé renvoient `T | undefined`.
- Fichiers créés avec l'outil Write (les heredocs Bash multi-blocs échouent parfois).
- Pas de classes CSS du site pour repérer des éléments ; pas de requête Wikipédia parallèle (une à la fois, 150 ms d'écart).
- Trailer de commit : `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Slug = titre avec espaces → `_`, normalisé NFC (cohérent avec `slugToTitle` et `reopenCard`).
- Clés de stockage `chrome.storage.local` (préfixe `wmt:` ajouté par le store) : `collection`, `geo`. Vue choisie : `localStorage` `wmt:collectionView`.

---

### Task 1: Cartes connues (titre → slug, fusion, dépôt)

**Files:**
- Modify: `src/core/market/market-book.ts` (ajouter `titleToSlug` après `slugToTitle`)
- Create: `src/core/collection/collection-book.ts`
- Create: `src/core/collection/collection-repo.ts`
- Test: `tests/core/market/title-slug.test.ts`
- Test: `tests/core/collection/collection-repo.test.ts`

**Interfaces:**
- Produces:
  - `titleToSlug(title: string): string` (dans `market-book.ts`)
  - `type KnownCard = { slug: string; title: string }`
  - `type CollectionState = Record<string, KnownCard>`
  - `mergeCards(state: CollectionState, cards: KnownCard[]): CollectionState` (renvoie le même objet si rien ne change)
  - `createCollectionRepo(store: KeyValueStore)` → `{ observe(cards): Promise<void>; subscribe(listener): () => void; list(): Promise<KnownCard[]> }` ; `type CollectionRepo = ReturnType<typeof createCollectionRepo>`

- [ ] **Step 1: Écrire les tests en échec**

`tests/core/market/title-slug.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { slugToTitle, titleToSlug } from '../../../src/core/market/market-book';

describe('titleToSlug', () => {
  it('remplace les espaces par des tirets bas', () => {
    expect(titleToSlug('Tour Eiffel')).toBe('Tour_Eiffel');
  });

  it('ignore les espaces en trop', () => {
    expect(titleToSlug('  Ted  Lasso ')).toBe('Ted_Lasso');
  });

  it('normalise en NFC', () => {
    expect(titleToSlug('E\u0301cole')).toBe('\u00C9cole');
  });

  it('est l’inverse de slugToTitle', () => {
    expect(slugToTitle(titleToSlug('Tour Eiffel'))).toBe('Tour Eiffel');
  });
});
```

`tests/core/collection/collection-repo.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { mergeCards } from '../../../src/core/collection/collection-book';
import { createCollectionRepo } from '../../../src/core/collection/collection-repo';

const PARIS = { slug: 'Paris', title: 'Paris' };
const EIFFEL = { slug: 'Tour_Eiffel', title: 'Tour Eiffel' };

describe('mergeCards', () => {
  it('ajoute les nouvelles cartes', () => {
    expect(mergeCards({}, [PARIS, EIFFEL])).toEqual({ Paris: PARIS, Tour_Eiffel: EIFFEL });
  });

  it('renvoie le même objet quand rien ne change', () => {
    const state = mergeCards({}, [PARIS]);
    expect(mergeCards(state, [PARIS])).toBe(state);
  });

  it('met à jour un titre modifié sans toucher l’état d’origine', () => {
    const state = mergeCards({}, [PARIS]);
    const next = mergeCards(state, [{ slug: 'Paris', title: 'Paris (ville)' }]);
    expect(next['Paris']?.title).toBe('Paris (ville)');
    expect(state['Paris']?.title).toBe('Paris');
  });
});

describe('createCollectionRepo', () => {
  it('persiste les cartes et les relit', async () => {
    const store = createMemoryStore();
    await createCollectionRepo(store).observe([PARIS, EIFFEL]);
    const cards = await createCollectionRepo(store).list();
    expect(cards.map((c) => c.slug).sort()).toEqual(['Paris', 'Tour_Eiffel']);
  });

  it('ne perd aucune carte quand plusieurs observations arrivent en même temps', async () => {
    const repo = createCollectionRepo(createMemoryStore());
    await Promise.all([repo.observe([PARIS]), repo.observe([EIFFEL])]);
    expect(await repo.list()).toHaveLength(2);
  });

  it('prévient les abonnés seulement quand une carte est nouvelle', async () => {
    const repo = createCollectionRepo(createMemoryStore());
    const listener = vi.fn();
    const unsubscribe = repo.subscribe(listener);

    await repo.observe([PARIS]);
    await repo.observe([PARIS]);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await repo.observe([EIFFEL]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `NPM test -- tests/core/market/title-slug.test.ts tests/core/collection/collection-repo.test.ts`
Expected: FAIL (`titleToSlug` et modules `collection-*` introuvables).

- [ ] **Step 3: Implémenter**

Dans `src/core/market/market-book.ts`, juste après `slugToTitle` :

```ts
export function titleToSlug(title: string): string {
  return title.trim().replace(/\s+/g, '_').normalize('NFC');
}
```

`src/core/collection/collection-book.ts` :

```ts
export type KnownCard = { slug: string; title: string };

// Clé : slug de l'article Wikipédia.
export type CollectionState = Record<string, KnownCard>;

// Renvoie `state` lui-même quand rien ne change : l'appelant évite alors d'écrire pour rien.
export function mergeCards(state: CollectionState, cards: KnownCard[]): CollectionState {
  let next = state;
  for (const card of cards) {
    if (next[card.slug]?.title === card.title) continue;
    if (next === state) next = { ...state };
    next[card.slug] = { slug: card.slug, title: card.title };
  }
  return next;
}
```

`src/core/collection/collection-repo.ts` :

```ts
import type { KeyValueStore } from '../cache/store';
import { mergeCards, type CollectionState, type KnownCard } from './collection-book';

const KEY = 'collection';

export function createCollectionRepo(store: KeyValueStore) {
  // Lecture-fusion-écriture sérialisées : deux observations simultanées ne s'écrasent pas.
  let tail: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  return {
    observe(cards: KnownCard[]): Promise<void> {
      const run = tail.then(async () => {
        const state = (await store.get<CollectionState>(KEY)) ?? {};
        const next = mergeCards(state, cards);
        if (next === state) return;
        await store.set(KEY, next);
        for (const listener of listeners) listener();
      });
      tail = run.catch(() => undefined);
      return run;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    async list(): Promise<KnownCard[]> {
      await tail;
      return Object.values((await store.get<CollectionState>(KEY)) ?? {});
    },
  };
}

export type CollectionRepo = ReturnType<typeof createCollectionRepo>;
```

- [ ] **Step 4: Vérifier le succès**

Run: `NPM test -- tests/core/market/title-slug.test.ts tests/core/collection/collection-repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/market/market-book.ts src/core/collection tests/core/market/title-slug.test.ts tests/core/collection
git commit -m "feat: cartes connues de la Collection (observation, fusion, stockage)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Positions (coordonnées Wikipédia, positions manuelles, dépôt)

**Files:**
- Create: `src/core/geo/wiki-coords.ts`
- Create: `src/core/geo/geo-book.ts`
- Create: `src/core/geo/geo-repo.ts`
- Test: `tests/core/geo/wiki-coords.test.ts`
- Test: `tests/core/geo/geo-book.test.ts`
- Test: `tests/core/geo/geo-repo.test.ts`

**Interfaces:**
- Consumes: `slugToTitle` (`core/market/market-book`), `KnownCard` (Task 1), `KeyValueStore` (`core/cache/store`).
- Produces:
  - `type LatLon = { lat: number; lon: number }`
  - `parseWikiCoords(json: unknown): LatLon | null` (lève `Error` si le format est inattendu)
  - `fetchWikiCoords(fetchFn: (url: string) => Promise<Response>, slug: string): Promise<LatLon | null>` (lève sur HTTP ≠ 2xx)
  - `type GeoState = { wiki: Record<string, LatLon | null>; manual: Record<string, LatLon> }`, `EMPTY_GEO: GeoState`
  - `type Position = LatLon & { source: 'wiki' | 'manual' }`
  - `resolvePosition(state, slug): Position | null`, `needsLookup(state, slug): boolean`
  - `setWiki(state, slug, coords: LatLon | null): GeoState`, `setManual(state, slug, pos: LatLon): GeoState`, `clearManual(state, slug): GeoState`
  - `partitionCards(cards: KnownCard[], state): { placed: { card: KnownCard; position: Position }[]; unplaced: KnownCard[] }` (triés par titre)
  - `createGeoRepo(store, fetchCoords: (slug) => Promise<LatLon | null>, sleep?, gapMs?)` → `{ subscribe; load(): Promise<GeoState>; setManual(slug, pos); clearManual(slug); resolveMissing(slugs: string[]): Promise<void> }` ; `type GeoRepo = ReturnType<typeof createGeoRepo>`

- [ ] **Step 1: Écrire les tests en échec**

`tests/core/geo/wiki-coords.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { fetchWikiCoords, parseWikiCoords } from '../../../src/core/geo/wiki-coords';

const FOUND = {
  query: {
    pages: [
      { pageid: 1, title: 'Tour Eiffel', coordinates: [{ lat: 48.8583, lon: 2.2945, primary: true, globe: 'earth' }] },
    ],
  },
};
const NONE = { query: { pages: [{ pageid: 2, title: 'Ted Lasso' }] } };
const MISSING = { query: { pages: [{ title: 'Zzz', missing: true }] } };

describe('parseWikiCoords', () => {
  it('lit les coordonnées principales', () => {
    expect(parseWikiCoords(FOUND)).toEqual({ lat: 48.8583, lon: 2.2945 });
  });

  it('renvoie null pour un article sans coordonnées ou inexistant', () => {
    expect(parseWikiCoords(NONE)).toBeNull();
    expect(parseWikiCoords(MISSING)).toBeNull();
  });

  it('lève pour une réponse au format inattendu (ne pas la confondre avec « aucune coordonnée »)', () => {
    expect(() => parseWikiCoords({ error: { code: 'x' } })).toThrow();
  });
});

describe('fetchWikiCoords', () => {
  it('interroge l’API Wikipédia avec le titre de l’article', async () => {
    const urls: string[] = [];
    const coords = await fetchWikiCoords(async (url) => {
      urls.push(url);
      return new Response(JSON.stringify(FOUND));
    }, 'Tour_Eiffel');

    const url = new URL(urls[0] ?? '');
    expect(url.origin + url.pathname).toBe('https://fr.wikipedia.org/w/api.php');
    expect(url.searchParams.get('titles')).toBe('Tour Eiffel');
    expect(url.searchParams.get('prop')).toBe('coordinates');
    expect(url.searchParams.get('origin')).toBe('*');
    expect(coords).toEqual({ lat: 48.8583, lon: 2.2945 });
  });

  it('lève sur une erreur HTTP', async () => {
    await expect(fetchWikiCoords(async () => new Response('', { status: 500 }), 'Paris')).rejects.toThrow('500');
  });
});
```

`tests/core/geo/geo-book.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
  clearManual,
  EMPTY_GEO,
  needsLookup,
  partitionCards,
  resolvePosition,
  setManual,
  setWiki,
} from '../../../src/core/geo/geo-book';

const PARIS = { lat: 48.85, lon: 2.35 };
const HOME = { lat: 1, lon: 2 };

describe('resolvePosition', () => {
  it('renvoie null quand rien n’est connu', () => {
    expect(resolvePosition(EMPTY_GEO, 'Paris')).toBeNull();
  });

  it('utilise la position Wikipédia', () => {
    expect(resolvePosition(setWiki(EMPTY_GEO, 'Paris', PARIS), 'Paris')).toEqual({ ...PARIS, source: 'wiki' });
  });

  it('préfère la position manuelle, et revient à Wikipédia quand on la retire', () => {
    const state = setManual(setWiki(EMPTY_GEO, 'Paris', PARIS), 'Paris', HOME);
    expect(resolvePosition(state, 'Paris')).toEqual({ ...HOME, source: 'manual' });
    expect(resolvePosition(clearManual(state, 'Paris'), 'Paris')).toEqual({ ...PARIS, source: 'wiki' });
  });

  it('traite « aucune coordonnée » Wikipédia comme non positionnée', () => {
    expect(resolvePosition(setWiki(EMPTY_GEO, 'Ted_Lasso', null), 'Ted_Lasso')).toBeNull();
  });

  it('ne confond pas un slug avec une propriété d’Object', () => {
    expect(resolvePosition(EMPTY_GEO, 'constructor')).toBeNull();
    expect(needsLookup(EMPTY_GEO, 'constructor')).toBe(true);
  });
});

describe('needsLookup', () => {
  it('ne redemande jamais un article déjà interrogé, même sans coordonnées', () => {
    expect(needsLookup(EMPTY_GEO, 'Paris')).toBe(true);
    expect(needsLookup(setWiki(EMPTY_GEO, 'Paris', null), 'Paris')).toBe(false);
  });
});

describe('état immuable', () => {
  it('ne modifie pas l’état d’origine', () => {
    setManual(EMPTY_GEO, 'Paris', HOME);
    setWiki(EMPTY_GEO, 'Paris', PARIS);
    expect(EMPTY_GEO).toEqual({ wiki: {}, manual: {} });
  });
});

describe('partitionCards', () => {
  it('sépare les cartes placées et à placer, triées par titre', () => {
    const cards = [
      { slug: 'Tour_Eiffel', title: 'Tour Eiffel' },
      { slug: 'Ted_Lasso', title: 'Ted Lasso' },
      { slug: 'Berlin', title: 'Berlin' },
    ];
    let state = setWiki(EMPTY_GEO, 'Tour_Eiffel', PARIS);
    state = setWiki(state, 'Berlin', { lat: 52.5, lon: 13.4 });

    const { placed, unplaced } = partitionCards(cards, state);
    expect(placed.map((p) => p.card.title)).toEqual(['Berlin', 'Tour Eiffel']);
    expect(unplaced.map((c) => c.title)).toEqual(['Ted Lasso']);
  });
});
```

`tests/core/geo/geo-repo.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createGeoRepo } from '../../../src/core/geo/geo-repo';

const noSleep = async () => undefined;

describe('createGeoRepo', () => {
  it('interroge Wikipédia une fois par article, y compris quand il n’a pas de coordonnées', async () => {
    const fetchCoords = vi.fn(async (slug: string) => (slug === 'Paris' ? { lat: 48.85, lon: 2.35 } : null));
    const repo = createGeoRepo(createMemoryStore(), fetchCoords, noSleep);

    await repo.resolveMissing(['Paris', 'Ted_Lasso']);
    await repo.resolveMissing(['Paris', 'Ted_Lasso']);

    expect(fetchCoords).toHaveBeenCalledTimes(2);
    const state = await repo.load();
    expect(state.wiki).toEqual({ Paris: { lat: 48.85, lon: 2.35 }, Ted_Lasso: null });
  });

  it('une seule requête à la fois, même si plusieurs demandes se chevauchent', async () => {
    let running = 0;
    let peak = 0;
    const fetchCoords = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;
      return null;
    };
    const repo = createGeoRepo(createMemoryStore(), fetchCoords, noSleep);

    await Promise.all([repo.resolveMissing(['A', 'B']), repo.resolveMissing(['C', 'D'])]);
    expect(peak).toBe(1);
  });

  it('s’arrête à la première erreur et laisse le reste à réessayer plus tard', async () => {
    const fetchCoords = vi
      .fn<(slug: string) => Promise<{ lat: number; lon: number } | null>>()
      .mockResolvedValueOnce({ lat: 1, lon: 2 })
      .mockRejectedValueOnce(new Error('hors ligne'));
    const repo = createGeoRepo(createMemoryStore(), fetchCoords, noSleep);

    await repo.resolveMissing(['A', 'B', 'C']);

    expect(fetchCoords).toHaveBeenCalledTimes(2);
    expect(Object.keys((await repo.load()).wiki)).toEqual(['A']);
  });

  it('espace les requêtes', async () => {
    const sleeps: number[] = [];
    const repo = createGeoRepo(createMemoryStore(), async () => null, async (ms) => void sleeps.push(ms), 150);
    await repo.resolveMissing(['A', 'B', 'C']);
    expect(sleeps).toEqual([150, 150]);
  });

  it('mémorise et retire les positions manuelles, et prévient les abonnés', async () => {
    const repo = createGeoRepo(createMemoryStore(), async () => null, noSleep);
    const listener = vi.fn();
    repo.subscribe(listener);

    await repo.setManual('Paris', { lat: 1, lon: 2 });
    expect((await repo.load()).manual).toEqual({ Paris: { lat: 1, lon: 2 } });

    await repo.clearManual('Paris');
    expect((await repo.load()).manual).toEqual({});
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `NPM test -- tests/core/geo`
Expected: FAIL (modules `core/geo/*` introuvables).

- [ ] **Step 3: Implémenter**

`src/core/geo/wiki-coords.ts` :

```ts
import { z } from 'zod';
import { slugToTitle } from '../market/market-book';

export type LatLon = { lat: number; lon: number };

const responseSchema = z.object({
  query: z.object({
    pages: z.array(
      z.object({
        coordinates: z.array(z.object({ lat: z.number(), lon: z.number() })).optional(),
      }),
    ),
  }),
});

// Un format inattendu lève : il ne doit pas être enregistré comme « article sans coordonnées ».
export function parseWikiCoords(json: unknown): LatLon | null {
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikipédia inattendue');
  const first = parsed.data.query.pages[0]?.coordinates?.[0];
  return first ? { lat: first.lat, lon: first.lon } : null;
}

export type FetchLike = (url: string) => Promise<Response>;

// Seul le titre de l'article est envoyé : aucune donnée du jeu ni du compte.
export async function fetchWikiCoords(fetchFn: FetchLike, slug: string): Promise<LatLon | null> {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'coordinates',
    titles: slugToTitle(slug),
    redirects: '1',
    coprimary: 'primary',
    format: 'json',
    formatversion: '2',
    origin: '*',
  });
  const response = await fetchFn(`https://fr.wikipedia.org/w/api.php?${params.toString()}`);
  if (!response.ok) throw new Error(`Wikipédia : HTTP ${response.status}`);
  return parseWikiCoords(await response.json());
}
```

`src/core/geo/geo-book.ts` :

```ts
import type { KnownCard } from '../collection/collection-book';
import type { LatLon } from './wiki-coords';

export type GeoState = {
  // null = article interrogé, sans coordonnées (on ne le redemande pas).
  wiki: Record<string, LatLon | null>;
  manual: Record<string, LatLon>;
};

export type Position = LatLon & { source: 'wiki' | 'manual' };

export const EMPTY_GEO: GeoState = { wiki: {}, manual: {} };

// `in` ou l'accès direct verraient « constructor » : on ne regarde que les clés propres.
function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

export function resolvePosition(state: GeoState, slug: string): Position | null {
  const manual = own(state.manual, slug);
  if (manual) return { lat: manual.lat, lon: manual.lon, source: 'manual' };
  const wiki = own(state.wiki, slug);
  return wiki ? { lat: wiki.lat, lon: wiki.lon, source: 'wiki' } : null;
}

export function needsLookup(state: GeoState, slug: string): boolean {
  return !Object.prototype.hasOwnProperty.call(state.wiki, slug);
}

export function setWiki(state: GeoState, slug: string, coords: LatLon | null): GeoState {
  return { ...state, wiki: { ...state.wiki, [slug]: coords } };
}

export function setManual(state: GeoState, slug: string, pos: LatLon): GeoState {
  return { ...state, manual: { ...state.manual, [slug]: { lat: pos.lat, lon: pos.lon } } };
}

export function clearManual(state: GeoState, slug: string): GeoState {
  const manual = { ...state.manual };
  delete manual[slug];
  return { ...state, manual };
}

export type PlacedCard = { card: KnownCard; position: Position };

const byTitle = (a: KnownCard, b: KnownCard) => a.title.localeCompare(b.title, 'fr');

export function partitionCards(
  cards: KnownCard[],
  state: GeoState,
): { placed: PlacedCard[]; unplaced: KnownCard[] } {
  const placed: PlacedCard[] = [];
  const unplaced: KnownCard[] = [];
  for (const card of [...cards].sort(byTitle)) {
    const position = resolvePosition(state, card.slug);
    if (position) placed.push({ card, position });
    else unplaced.push(card);
  }
  return { placed, unplaced };
}
```

`src/core/geo/geo-repo.ts` :

```ts
import type { KeyValueStore } from '../cache/store';
import {
  clearManual,
  EMPTY_GEO,
  needsLookup,
  setManual,
  setWiki,
  type GeoState,
} from './geo-book';
import type { LatLon } from './wiki-coords';

const KEY = 'geo';

export type CoordsFetcher = (slug: string) => Promise<LatLon | null>;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createGeoRepo(
  store: KeyValueStore,
  fetchCoords: CoordsFetcher,
  sleep: (ms: number) => Promise<void> = realSleep,
  gapMs = 150,
) {
  // Écritures sérialisées ; recherches Wikipédia sérialisées elles aussi (une requête à la fois).
  let writeTail: Promise<unknown> = Promise.resolve();
  let lookupTail: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  async function read(): Promise<GeoState> {
    return (await store.get<GeoState>(KEY)) ?? EMPTY_GEO;
  }

  function update(change: (state: GeoState) => GeoState): Promise<void> {
    const run = writeTail.then(async () => {
      await store.set(KEY, change(await read()));
      for (const listener of listeners) listener();
    });
    writeTail = run.catch(() => undefined);
    return run;
  }

  async function load(): Promise<GeoState> {
    await writeTail;
    return read();
  }

  async function lookupAll(slugs: string[]): Promise<void> {
    const state = await load();
    const todo = slugs.filter((slug) => needsLookup(state, slug));
    for (const [index, slug] of todo.entries()) {
      if (index > 0) await sleep(gapMs);
      try {
        const coords = await fetchCoords(slug);
        await update((current) => setWiki(current, slug, coords));
      } catch (error) {
        // Hors ligne, 429… : on s'arrête, le reste sera réessayé à la prochaine demande.
        console.warn('[wikimasters-tools]', 'coordonnées Wikipédia indisponibles :', error);
        return;
      }
    }
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load,
    setManual: (slug: string, pos: LatLon) => update((state) => setManual(state, slug, pos)),
    clearManual: (slug: string) => update((state) => clearManual(state, slug)),
    resolveMissing(slugs: string[]): Promise<void> {
      const run = lookupTail.then(() => lookupAll(slugs));
      lookupTail = run.catch(() => undefined);
      return run;
    },
  };
}

export type GeoRepo = ReturnType<typeof createGeoRepo>;
```

- [ ] **Step 4: Vérifier le succès**

Run: `NPM test -- tests/core/geo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/geo tests/core/geo
git commit -m "feat: positions des cartes (coordonnées Wikipédia et placement manuel)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Repérage du DOM de la Collection

**Files:**
- Create: `src/content/collection-dom.ts`
- Test: `tests/content/collection-dom.test.ts`

**Interfaces:**
- Consumes: `findCardMounts(root, isKnownTitle): {title, container}[]` (`content/card-finder`), `titleToSlug` et `KnownCard` (Task 1).
- Produces:
  - `findSelectButton(root: ParentNode): HTMLButtonElement | null`
  - `findCollectionRoot(button: HTMLElement): HTMLElement | null`
  - `scanCollectionCards(root: ParentNode): KnownCard[]`
  - `findCardGrid(root: ParentNode, button: HTMLElement): HTMLElement | null`
  - `setGridHidden(grid: HTMLElement, hidden: boolean): void`, `restoreHiddenGrids(root: ParentNode): void`

- [ ] **Step 1: Écrire les tests en échec**

`tests/content/collection-dom.test.ts` :

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findCardGrid,
  findCollectionRoot,
  findSelectButton,
  restoreHiddenGrids,
  scanCollectionCards,
  setGridHidden,
} from '../../src/content/collection-dom';

const SELECT =
  '<button type="button" class="px-3"><svg class="lucide lucide-square-check-big size-4"></svg>Sélectionner</button>';

function card(title: string): string {
  return `<div class="card"><div><img src="x.png"><h3>${title}</h3></div></div>`;
}

function page(cards: string[]): string {
  return `<main><h1>Collection</h1><div id="tools">${SELECT}</div><div id="grid">${cards.join('')}</div></main>`;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('findSelectButton', () => {
  it('repère le bouton par son texte', () => {
    document.body.innerHTML = '<button>Autre</button>' + SELECT;
    expect(findSelectButton(document)?.textContent).toBe('Sélectionner');
  });

  it('se rabat sur l’icône si le texte change', () => {
    document.body.innerHTML = '<button><svg class="lucide-square-check-big"></svg>Choisir</button>';
    expect(findSelectButton(document)?.textContent).toBe('Choisir');
  });

  it('renvoie null s’il est absent', () => {
    document.body.innerHTML = '<button>Autre</button>';
    expect(findSelectButton(document)).toBeNull();
  });
});

describe('scanCollectionCards', () => {
  it('lit le titre et le slug des cartes, sans doublon', () => {
    document.body.innerHTML = page([card('Tour Eiffel'), card('Paris'), card('Paris')]);
    const root = findCollectionRoot(findSelectButton(document) as HTMLElement) as HTMLElement;
    expect(scanCollectionCards(root)).toEqual([
      { slug: 'Tour_Eiffel', title: 'Tour Eiffel' },
      { slug: 'Paris', title: 'Paris' },
    ]);
  });
});

describe('findCollectionRoot', () => {
  it('renvoie le premier ancêtre du bouton qui contient des cartes', () => {
    document.body.innerHTML = page([card('Paris')]);
    const button = findSelectButton(document) as HTMLElement;
    expect(findCollectionRoot(button)?.tagName).toBe('MAIN');
  });

  it('renvoie null quand aucune carte n’est affichée', () => {
    document.body.innerHTML = page([]);
    expect(findCollectionRoot(findSelectButton(document) as HTMLElement)).toBeNull();
  });
});

describe('findCardGrid', () => {
  it('renvoie le conteneur commun des cartes', () => {
    document.body.innerHTML = page([card('Paris'), card('Berlin')]);
    const button = findSelectButton(document) as HTMLElement;
    expect(findCardGrid(findCollectionRoot(button) as HTMLElement, button)?.id).toBe('grid');
  });

  it('avec une seule carte, renvoie son parent', () => {
    document.body.innerHTML = page([card('Paris')]);
    const button = findSelectButton(document) as HTMLElement;
    expect(findCardGrid(findCollectionRoot(button) as HTMLElement, button)?.id).toBe('grid');
  });

  it('refuse un conteneur qui contient le bouton ou qui est la page entière', () => {
    document.body.innerHTML = `<main><div id="all">${SELECT}${card('Paris')}${card('Berlin')}</div></main>`;
    const button = findSelectButton(document) as HTMLElement;
    expect(findCardGrid(findCollectionRoot(button) as HTMLElement, button)).toBeNull();
  });
});

describe('setGridHidden / restoreHiddenGrids', () => {
  it('masque puis rétablit l’affichage d’origine', () => {
    document.body.innerHTML = '<div id="g" style="display:grid"></div>';
    const grid = document.getElementById('g') as HTMLElement;

    setGridHidden(grid, true);
    setGridHidden(grid, true);
    expect(grid.style.display).toBe('none');

    setGridHidden(grid, false);
    expect(grid.style.display).toBe('grid');
    expect(grid.hasAttribute('data-wmt-grid-hidden')).toBe(false);
  });

  it('restoreHiddenGrids rétablit toutes les grilles masquées', () => {
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    for (const id of ['a', 'b']) setGridHidden(document.getElementById(id) as HTMLElement, true);
    restoreHiddenGrids(document);
    expect(document.querySelectorAll('[data-wmt-grid-hidden]')).toHaveLength(0);
    expect((document.getElementById('a') as HTMLElement).style.display).toBe('');
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `NPM test -- tests/content/collection-dom.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

`src/content/collection-dom.ts` :

```ts
import type { KnownCard } from '../core/collection/collection-book';
import { titleToSlug } from '../core/market/market-book';
import { findCardMounts } from './card-finder';

const HIDDEN_ATTRIBUTE = 'data-wmt-grid-hidden';
const SELECT_LABEL = 'sélectionner';

function normalize(text: string | null): string {
  return (text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Repéré par son texte, sinon par son icône : pas de classes CSS que le site peut changer.
export function findSelectButton(root: ParentNode): HTMLButtonElement | null {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')];
  return (
    buttons.find((button) => normalize(button.textContent) === SELECT_LABEL) ??
    buttons.find((button) => button.querySelector('.lucide-square-check-big') !== null) ??
    null
  );
}

const allCards = () => true;

// Premier ancêtre du bouton qui contient des cartes : c'est la zone « Collection ».
export function findCollectionRoot(button: HTMLElement): HTMLElement | null {
  for (let node = button.parentElement; node; node = node.parentElement) {
    if (findCardMounts(node, allCards).length > 0) return node;
  }
  return null;
}

export function scanCollectionCards(root: ParentNode): KnownCard[] {
  const cards = new Map<string, KnownCard>();
  for (const { title } of findCardMounts(root, allCards)) {
    const slug = titleToSlug(title);
    if (!cards.has(slug)) cards.set(slug, { slug, title });
  }
  return [...cards.values()];
}

function commonAncestor(elements: HTMLElement[]): HTMLElement | null {
  const [first, ...rest] = elements;
  if (!first) return null;
  for (let node = first.parentElement; node; node = node.parentElement) {
    const candidate = node;
    if (rest.every((element) => candidate.contains(element))) return candidate;
  }
  return null;
}

// Conteneur commun des cartes, à masquer en vue Monde. On refuse tout ce qui contiendrait
// aussi le bouton (la barre d'outils disparaîtrait) ou la page entière.
export function findCardGrid(root: ParentNode, button: HTMLElement): HTMLElement | null {
  const grid = commonAncestor(findCardMounts(root, allCards).map((mount) => mount.container));
  if (!grid || ['MAIN', 'BODY', 'HTML'].includes(grid.tagName) || grid.contains(button)) return null;
  return grid;
}

export function setGridHidden(grid: HTMLElement, hidden: boolean): void {
  if (hidden) {
    if (grid.hasAttribute(HIDDEN_ATTRIBUTE)) return;
    grid.setAttribute(HIDDEN_ATTRIBUTE, grid.style.display);
    grid.style.display = 'none';
  } else if (grid.hasAttribute(HIDDEN_ATTRIBUTE)) {
    grid.style.display = grid.getAttribute(HIDDEN_ATTRIBUTE) ?? '';
    grid.removeAttribute(HIDDEN_ATTRIBUTE);
  }
}

export function restoreHiddenGrids(root: ParentNode): void {
  for (const grid of root.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTRIBUTE}]`)) {
    setGridHidden(grid, false);
  }
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `NPM test -- tests/content/collection-dom.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/collection-dom.ts tests/content/collection-dom.test.ts
git commit -m "feat: repérage du bouton Sélectionner, des cartes et de la grille de la Collection" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Interrupteur Liste / Monde

**Files:**
- Create: `src/content/collection-view.ts`
- Create: `src/content/world-toggle.ts`
- Test: `tests/content/world-toggle.test.ts`

**Interfaces:**
- Produces:
  - `type CollectionView = 'list' | 'world'`
  - `readView(storage: Pick<Storage, 'getItem'>): CollectionView` (défaut `'list'`, absorbe les erreurs de stockage)
  - `writeView(storage: Pick<Storage, 'setItem'>, view: CollectionView): void`
  - `ensureWorldToggle(selectButton: HTMLButtonElement, view: CollectionView, onToggle: () => void): HTMLButtonElement` (idempotent : réutilise le bouton déjà inséré juste après « Sélectionner »)

- [ ] **Step 1: Écrire les tests en échec**

`tests/content/world-toggle.test.ts` :

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readView, writeView } from '../../src/content/collection-view';
import { ensureWorldToggle } from '../../src/content/world-toggle';

function makeSelect(): HTMLButtonElement {
  document.body.innerHTML =
    '<div id="bar"><button type="button" class="px-3 rounded-lg">Sélectionner</button></div>';
  return document.querySelector('button') as HTMLButtonElement;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('readView / writeView', () => {
  it('vaut « list » par défaut et relit ce qui a été écrit', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
    expect(readView(storage)).toBe('list');
    writeView(storage, 'world');
    expect(readView(storage)).toBe('world');
    writeView(storage, 'list');
    expect(readView(storage)).toBe('list');
  });

  it('absorbe les erreurs de stockage', () => {
    const broken = {
      getItem: () => {
        throw new Error('bloqué');
      },
      setItem: () => {
        throw new Error('bloqué');
      },
    };
    expect(readView(broken)).toBe('list');
    expect(() => writeView(broken, 'world')).not.toThrow();
  });
});

describe('ensureWorldToggle', () => {
  it('insère un bouton « Monde » juste après « Sélectionner », avec son style', () => {
    const select = makeSelect();
    const toggle = ensureWorldToggle(select, 'list', () => undefined);

    expect(select.nextElementSibling).toBe(toggle);
    expect(toggle.className).toBe(select.className);
    expect(toggle.textContent).toBe('Monde');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('est idempotent et met à jour l’état affiché', () => {
    const select = makeSelect();
    const first = ensureWorldToggle(select, 'list', () => undefined);
    const second = ensureWorldToggle(select, 'world', () => undefined);

    expect(second).toBe(first);
    expect(document.querySelectorAll('[data-wmt-world-toggle]')).toHaveLength(1);
    expect(second.getAttribute('aria-pressed')).toBe('true');
  });

  it('appelle le dernier gestionnaire fourni au clic', () => {
    const select = makeSelect();
    const oldHandler = vi.fn();
    const newHandler = vi.fn();
    ensureWorldToggle(select, 'list', oldHandler);
    ensureWorldToggle(select, 'list', newHandler).click();

    expect(oldHandler).not.toHaveBeenCalled();
    expect(newHandler).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `NPM test -- tests/content/world-toggle.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Implémenter**

`src/content/collection-view.ts` :

```ts
export type CollectionView = 'list' | 'world';

const KEY = 'wmt:collectionView';

// Toute erreur de stockage (accès bloqué…) est absorbée : on reste en vue Liste.
export function readView(storage: Pick<Storage, 'getItem'>): CollectionView {
  try {
    return storage.getItem(KEY) === 'world' ? 'world' : 'list';
  } catch {
    return 'list';
  }
}

export function writeView(storage: Pick<Storage, 'setItem'>, view: CollectionView): void {
  try {
    storage.setItem(KEY, view);
  } catch {
    // stockage indisponible
  }
}
```

`src/content/world-toggle.ts` :

```ts
import type { CollectionView } from './collection-view';

export const TOGGLE_ATTRIBUTE = 'data-wmt-world-toggle';

// Icône « globe » (Lucide), même gabarit que l'icône du bouton voisin.
const GLOBE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4" ' +
  'aria-hidden="true"><circle cx="12" cy="12" r="10"></circle>' +
  '<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>';

// Le bouton reprend les classes de « Sélectionner » : il épouse le style du site sans en dépendre.
export function ensureWorldToggle(
  selectButton: HTMLButtonElement,
  view: CollectionView,
  onToggle: () => void,
): HTMLButtonElement {
  let toggle = selectButton.nextElementSibling;
  if (!(toggle instanceof HTMLButtonElement) || !toggle.hasAttribute(TOGGLE_ATTRIBUTE)) {
    toggle = selectButton.cloneNode(false) as HTMLButtonElement;
    toggle.setAttribute(TOGGLE_ATTRIBUTE, '');
    toggle.innerHTML = `${GLOBE_ICON}Monde`;
    toggle.title = 'Afficher la Collection sur une carte du monde';
    selectButton.insertAdjacentElement('afterend', toggle);
  }

  const button = toggle as HTMLButtonElement;
  const on = view === 'world';
  button.onclick = onToggle;
  button.setAttribute('aria-pressed', String(on));
  button.style.borderColor = on ? 'var(--color-accent, #34d399)' : '';
  button.style.color = on ? 'var(--color-accent, #34d399)' : '';
  return button;
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `NPM test -- tests/content/world-toggle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/collection-view.ts src/content/world-toggle.ts tests/content/world-toggle.test.ts
git commit -m "feat: interrupteur Monde à côté du bouton Sélectionner" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Carte Leaflet et panneau

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm)
- Create: `src/env.d.ts`
- Create: `src/content/map-theme.ts`
- Create: `src/content/world-map.ts`
- Create: `src/content/WorldPanel.tsx`
- Test: `tests/content/map-theme.test.ts`

**Interfaces:**
- Consumes: `CollectionRepo` (Task 1), `GeoRepo`, `partitionCards`, `EMPTY_GEO`, `GeoState` (Task 2).
- Produces:
  - `isDarkColor(css: string): boolean | null` (`null` : illisible ou transparent) et `pageIsDark(): boolean` (`map-theme.ts`)
  - `type MapPoint = { slug: string; title: string; lat: number; lon: number; manual: boolean }`
  - `type WorldMapHandlers = { onOpen(slug): void; onMove(slug, lat, lon): void; onRelease(slug): void; onPlace(lat, lon): void }`
  - `createWorldMap(container: HTMLElement, dark: boolean, handlers: WorldMapHandlers): WorldMap` avec `setPoints(points: MapPoint[])`, `setPlacing(on: boolean)`, `destroy()`
  - `WorldPanel` (React) : props `{ collection: CollectionRepo; geo: GeoRepo; onOpen: (slug: string) => void }`
  - `PANEL_CSS: string` (exporté par `WorldPanel.tsx`, styles à injecter dans le shadow DOM avec le CSS de Leaflet)

- [ ] **Step 1: Installer Leaflet**

Run:
```bash
NPM install leaflet@^1.9.4
NPM install -D @types/leaflet
```
Expected: `package.json` liste `leaflet` (dependencies) et `@types/leaflet` (devDependencies), sans erreur.

- [ ] **Step 2: Écrire le test en échec**

`tests/content/map-theme.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { isDarkColor } from '../../src/content/map-theme';

describe('isDarkColor', () => {
  it('reconnaît un fond sombre', () => {
    expect(isDarkColor('rgb(13, 17, 23)')).toBe(true);
    expect(isDarkColor('rgba(13, 17, 23, 1)')).toBe(true);
  });

  it('reconnaît un fond clair', () => {
    expect(isDarkColor('rgb(255, 255, 255)')).toBe(false);
  });

  it('renvoie null pour un fond transparent ou illisible', () => {
    expect(isDarkColor('rgba(0, 0, 0, 0)')).toBeNull();
    expect(isDarkColor('transparent')).toBeNull();
    expect(isDarkColor('')).toBeNull();
  });
});
```

- [ ] **Step 3: Vérifier l'échec**

Run: `NPM test -- tests/content/map-theme.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 4: Implémenter le thème**

`src/content/map-theme.ts` :

```ts
const RGB = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)/;

// null : couleur illisible ou transparente (on regarde alors l'élément parent).
export function isDarkColor(css: string): boolean | null {
  const match = RGB.exec(css);
  if (!match) return null;
  if (match[4] !== undefined && Number.parseFloat(match[4]) === 0) return null;
  const luminance = 0.299 * Number(match[1]) + 0.587 * Number(match[2]) + 0.114 * Number(match[3]);
  return luminance < 128;
}

// Le fond de carte suit le thème de la page, pas celui du système.
export function pageIsDark(): boolean {
  for (const element of [document.body, document.documentElement]) {
    const dark = isDarkColor(getComputedStyle(element).backgroundColor);
    if (dark !== null) return dark;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
```

- [ ] **Step 5: Déclarer l'import CSS et écrire la carte**

`src/env.d.ts` :

```ts
declare module '*.css?inline' {
  const css: string;
  export default css;
}
```

`src/content/world-map.ts` :

```ts
import * as L from 'leaflet';

export type MapPoint = { slug: string; title: string; lat: number; lon: number; manual: boolean };

export type WorldMapHandlers = {
  onOpen: (slug: string) => void;
  // Un marqueur a été glissé : nouvelle position manuelle.
  onMove: (slug: string, lat: number, lon: number) => void;
  // Clic droit sur un marqueur placé à la main : on retire le placement manuel.
  onRelease: (slug: string) => void;
  // Clic sur la carte pendant un placement.
  onPlace: (lat: number, lon: number) => void;
};

export type WorldMap = {
  setPoints(points: MapPoint[]): void;
  setPlacing(on: boolean): void;
  destroy(): void;
};

const PLACING_CLASS = 'wmt-placing';

export function createWorldMap(
  container: HTMLElement,
  dark: boolean,
  handlers: WorldMapHandlers,
): WorldMap {
  const map = L.map(container, { worldCopyJump: true, minZoom: 2, zoomSnap: 1 }).setView([25, 10], 2);
  L.tileLayer(
    `https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`,
    { subdomains: 'abcd', maxZoom: 19, attribution: '© OpenStreetMap © CARTO' },
  ).addTo(map);

  const markers = L.layerGroup().addTo(map);
  let placing = false;

  map.on('click', (event: L.LeafletMouseEvent) => {
    if (!placing) return;
    const { lat, lng } = event.latlng.wrap();
    handlers.onPlace(lat, lng);
  });

  // Le conteneur vient d'être inséré : Leaflet doit relire sa taille une fois la mise en page faite.
  const frame = requestAnimationFrame(() => map.invalidateSize());

  return {
    setPoints(points) {
      markers.clearLayers();
      for (const point of points) {
        const marker = L.marker([point.lat, point.lon], {
          icon: L.divIcon({
            className: point.manual ? 'wmt-pin wmt-pin-manual' : 'wmt-pin',
            iconSize: [14, 14],
          }),
          draggable: true,
        });
        marker.bindTooltip(point.title);
        marker.on('click', () => handlers.onOpen(point.slug));
        marker.on('dragend', () => {
          const { lat, lng } = marker.getLatLng().wrap();
          handlers.onMove(point.slug, lat, lng);
        });
        if (point.manual) marker.on('contextmenu', () => handlers.onRelease(point.slug));
        marker.addTo(markers);
      }
    },
    setPlacing(on) {
      placing = on;
      container.classList.toggle(PLACING_CLASS, on);
    },
    destroy() {
      cancelAnimationFrame(frame);
      map.remove();
    },
  };
}
```

- [ ] **Step 6: Écrire le panneau React**

`src/content/WorldPanel.tsx` :

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CollectionRepo } from '../core/collection/collection-repo';
import type { KnownCard } from '../core/collection/collection-book';
import { EMPTY_GEO, partitionCards, type GeoState } from '../core/geo/geo-book';
import type { GeoRepo } from '../core/geo/geo-repo';
import { pageIsDark } from './map-theme';
import { createWorldMap, type MapPoint, type WorldMap } from './world-map';

// Styles des marqueurs et du mode « placement » (le CSS de Leaflet est ajouté à part).
export const PANEL_CSS = `
.wmt-pin{background:#34d399;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.4)}
.wmt-pin-manual{background:#f59e0b}
.wmt-placing.leaflet-grab,.wmt-placing .leaflet-interactive{cursor:crosshair !important}
`;

type Props = {
  collection: CollectionRepo;
  geo: GeoRepo;
  onOpen: (slug: string) => void;
};

const box = {
  border: '1px solid var(--color-border, rgba(148,163,184,0.35))',
  borderRadius: 12,
  background: 'var(--color-surface, #0d1117)',
  color: 'var(--color-foreground, #e6edf3)',
  font: '14px/20px system-ui, sans-serif',
} as const;

export function WorldPanel({ collection, geo, onOpen }: Props) {
  const [cards, setCards] = useState<KnownCard[]>([]);
  const [geoState, setGeoState] = useState<GeoState>(EMPTY_GEO);
  const [placing, setPlacing] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<WorldMap | null>(null);
  // Les gestionnaires de la carte, créée une seule fois, lisent toujours l'état courant.
  const latest = useRef({ onOpen, geo, placing });
  latest.current = { onOpen, geo, placing };

  useEffect(() => {
    let alive = true;
    const loadCards = () => void collection.list().then((list) => alive && setCards(list));
    const loadGeo = () => void geo.load().then((state) => alive && setGeoState(state));
    loadCards();
    loadGeo();
    const offCollection = collection.subscribe(loadCards);
    const offGeo = geo.subscribe(loadGeo);
    return () => {
      alive = false;
      offCollection();
      offGeo();
    };
  }, [collection, geo]);

  useEffect(() => {
    if (cards.length > 0) void geo.resolveMissing(cards.map((card) => card.slug));
  }, [cards, geo]);

  const { placed, unplaced } = useMemo(() => partitionCards(cards, geoState), [cards, geoState]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = createWorldMap(container, pageIsDark(), {
      onOpen: (slug) => latest.current.onOpen(slug),
      onMove: (slug, lat, lon) => void latest.current.geo.setManual(slug, { lat, lon }),
      onRelease: (slug) => void latest.current.geo.clearManual(slug),
      onPlace: (lat, lon) => {
        const slug = latest.current.placing;
        if (!slug) return;
        void latest.current.geo.setManual(slug, { lat, lon });
        setPlacing(null);
      },
    });
    mapRef.current = map;
    return () => {
      map.destroy();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const points: MapPoint[] = placed.map(({ card, position }) => ({
      slug: card.slug,
      title: card.title,
      lat: position.lat,
      lon: position.lon,
      manual: position.source === 'manual',
    }));
    mapRef.current?.setPoints(points);
  }, [placed]);

  useEffect(() => {
    mapRef.current?.setPlacing(placing !== null);
  }, [placing]);

  const placingTitle = cards.find((card) => card.slug === placing)?.title;

  return (
    <div style={{ ...box, display: 'flex', gap: 12, padding: 12, margin: '12px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div ref={containerRef} style={{ height: '70vh', minHeight: 420, borderRadius: 8 }} />
        <p style={{ margin: '8px 0 0', opacity: 0.7, fontSize: 12 }}>
          {cards.length === 0
            ? 'Aucune carte connue : parcourez la Collection pour que l’extension les découvre.'
            : `${cards.length} cartes connues · ${placed.length} placées. Glissez un point pour le corriger, clic droit sur un point orange pour retirer votre placement.`}
        </p>
      </div>
      <aside style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong>À placer ({unplaced.length})</strong>
        {placingTitle && (
          <div style={{ fontSize: 12 }}>
            Cliquez sur la carte pour placer « {placingTitle} ».{' '}
            <button type="button" onClick={() => setPlacing(null)} style={linkButton}>
              Annuler
            </button>
          </div>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', maxHeight: '64vh' }}>
          {unplaced.map((card) => (
            <li key={card.slug}>
              <button
                type="button"
                onClick={() => setPlacing(card.slug)}
                style={{
                  ...linkButton,
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '4px 6px',
                  borderRadius: 6,
                  background: card.slug === placing ? 'rgba(52,211,153,0.15)' : 'none',
                }}
              >
                {card.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

const linkButton = {
  border: 0,
  background: 'none',
  cursor: 'pointer',
  font: 'inherit',
  color: 'var(--color-accent, #34d399)',
  padding: 0,
} as const;
```

- [ ] **Step 7: Vérifier le test et le typage**

Run: `NPM test -- tests/content/map-theme.test.ts` puis `NPM run typecheck`
Expected: PASS, puis typecheck sans erreur. Si `import * as L from 'leaflet'` échoue au typage, vérifier que `@types/leaflet` est bien installé (Step 1).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/env.d.ts src/content/map-theme.ts src/content/world-map.ts src/content/WorldPanel.tsx tests/content/map-theme.test.ts
git commit -m "feat: carte Leaflet de la vue Monde et panneau À placer" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Branchement dans le script de contenu

**Files:**
- Create: `src/content/collection-ui.tsx`
- Modify: `src/entrypoints/content.tsx`

**Interfaces:**
- Consumes: tout ce qui précède (`findSelectButton`, `findCollectionRoot`, `scanCollectionCards`, `findCardGrid`, `setGridHidden`, `restoreHiddenGrids`, `readView`, `writeView`, `ensureWorldToggle`, `WorldPanel`, `PANEL_CSS`, `CollectionRepo`, `GeoRepo`, `createCollectionRepo`, `createGeoRepo`, `fetchWikiCoords`), ainsi que `marketUi.reopenCard(slug: string): Promise<void>` (existant : rouvre la fiche, avec toast si introuvable).
- Produces: `createCollectionUi({ collection, geo, openCard })` → `{ sync(): void }`, idempotent, appelé depuis `run()`.

- [ ] **Step 1: Écrire `collection-ui.tsx`**

`src/content/collection-ui.tsx` :

```tsx
import leafletCss from 'leaflet/dist/leaflet.css?inline';
import { createRoot, type Root } from 'react-dom/client';
import type { CollectionRepo } from '../core/collection/collection-repo';
import type { GeoRepo } from '../core/geo/geo-repo';
import {
  findCardGrid,
  findCollectionRoot,
  findSelectButton,
  restoreHiddenGrids,
  scanCollectionCards,
  setGridHidden,
} from './collection-dom';
import { readView, writeView } from './collection-view';
import { PANEL_CSS, WorldPanel } from './WorldPanel';
import { ensureWorldToggle } from './world-toggle';

const LOG = '[wikimasters-tools]';
const PANEL_ATTRIBUTE = 'data-wmt-world-panel';

export type CollectionUiDeps = {
  collection: CollectionRepo;
  geo: GeoRepo;
  openCard: (slug: string) => void;
};

type Panel = { host: HTMLElement; root: Root; grid: HTMLElement };

export function createCollectionUi({ collection, geo, openCard }: CollectionUiDeps) {
  let panel: Panel | null = null;

  function unmountPanel(): void {
    if (!panel) return;
    panel.root.unmount();
    panel.host.remove();
    panel = null;
  }

  function mountPanel(grid: HTMLElement): void {
    const host = document.createElement('div');
    host.setAttribute(PANEL_ATTRIBUTE, '');
    host.style.display = 'block';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = leafletCss + PANEL_CSS;
    const mountPoint = document.createElement('div');
    shadow.append(style, mountPoint);
    grid.insertAdjacentElement('beforebegin', host);

    const root = createRoot(mountPoint);
    root.render(<WorldPanel collection={collection} geo={geo} onOpen={openCard} />);
    panel = { host, root, grid };
  }

  function showList(): void {
    unmountPanel();
    restoreHiddenGrids(document);
  }

  // Idempotent : appelé à chaque changement du DOM, il ne touche à rien quand tout est déjà en place.
  function sync(): void {
    const button = findSelectButton(document);
    if (!button) {
      showList();
      return;
    }

    const scope = findCollectionRoot(button);
    if (scope) {
      const cards = scanCollectionCards(scope);
      if (cards.length > 0) {
        collection.observe(cards).catch((error) => console.warn(LOG, 'collection non enregistrée :', error));
      }
    }

    const view = readView(window.localStorage);
    ensureWorldToggle(button, view, () => {
      const current = readView(window.localStorage);
      writeView(window.localStorage, current === 'world' ? 'list' : 'world');
      sync();
    });

    if (view !== 'world') {
      showList();
      return;
    }

    // On garde la grille déjà masquée tant qu'elle est dans la page : la carte garde son zoom.
    const grid = panel?.grid.isConnected ? panel.grid : scope ? findCardGrid(scope, button) : null;
    if (!grid) {
      showList();
      return;
    }
    setGridHidden(grid, true);
    if (!panel || panel.grid !== grid) {
      unmountPanel();
      mountPanel(grid);
    }
  }

  return { sync };
}
```

- [ ] **Step 2: Brancher dans `src/entrypoints/content.tsx`**

Ajouter aux imports :

```ts
import { createCollectionRepo } from '../core/collection/collection-repo';
import { fetchWikiCoords } from '../core/geo/wiki-coords';
import { createGeoRepo } from '../core/geo/geo-repo';
import { createCollectionUi } from '../content/collection-ui';
```

Après `const marketUi = createMarketUi(marketRepo);` ajouter :

```ts
    // Requête Wikipédia sans identifiants : rien du compte ni du jeu n'y est joint.
    const collectionUi = createCollectionUi({
      collection: createCollectionRepo(store),
      geo: createGeoRepo(store, (slug) => fetchWikiCoords((url) => fetch(url), slug)),
      openCard: (slug) => void marketUi.reopenCard(slug),
    });
```

Dans `run()`, dans le `try` juste après `const links = decorateMarketLinks(document, marketUi.mountLink);`, ajouter :

```ts
        try {
          collectionUi.sync();
        } catch (error) {
          console.warn(LOG, 'vue Monde indisponible :', error);
        }
```

- [ ] **Step 3: Vérifier typage, tests et build**

Run: `NPM run typecheck`, `NPM test`, `NPM run build`
Expected: typecheck sans erreur ; tous les tests passent (les 55 existants + les nouveaux) ; build OK. Si le build échoue sur `leaflet/dist/leaflet.css?inline`, vérifier `src/env.d.ts` (Task 5) et que `leaflet` est bien installé.

- [ ] **Step 4: Commit**

```bash
git add src/content/collection-ui.tsx src/entrypoints/content.tsx
git commit -m "feat: brancher la vue Monde sur la page Collection" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Vérification manuelle dans Chrome (par l'utilisateur)

**Files:** aucun (vérification). Mise à jour de `README.md` seulement si des étapes d'usage y existent déjà.

Les sessions ne peuvent pas piloter le site connecté ; l'utilisateur effectue ces vérifications, après `NPM run build` puis rechargement de l'extension (`chrome://extensions`, dossier `.output/chrome-mv3`).

- [ ] **Step 1: Interrupteur** — Sur la Collection, un bouton « Monde » apparaît juste à droite de « Sélectionner », avec le même style. OFF : la page est inchangée.
- [ ] **Step 2: Bascule** — Cliquer « Monde » : la grille disparaît, la carte apparaît à sa place (fond clair/sombre selon le thème du site, attribution CARTO visible). Recharger la page : la vue Monde est conservée. Re-cliquer : la grille revient, barre d'outils intacte.
- [ ] **Step 3: Positions** — Les cartes vues dans la Collection apparaissent comme points verts (lieux/monuments) ; les autres sont dans « À placer ». Parcourir d'autres pages de la Collection : le compteur « cartes connues » augmente.
- [ ] **Step 4: Placement manuel** — Cliquer une carte dans « À placer », puis un point de la carte : le marqueur orange apparaît. Le glisser le déplace ; clic droit dessus le retire. Un point vert (Wikipédia) glissé devient orange.
- [ ] **Step 5: Ouverture de la fiche** — Cliquer un point : la fiche du jeu s'ouvre (clic sur le titre dans la grille masquée, recherche si la carte est sur une autre page). Noter : le champ de recherche de la Collection reste rempli après coup.
- [ ] **Step 6: Non-régression** — Les pastilles `$`, le lien « Voir l'article sur le marché » et le popup marché fonctionnent toujours ; la console ne montre aucune erreur `[wikimasters-tools]` inattendue.
- [ ] **Step 7: Noter les écarts** — En cas d'échec (grille mal repérée, clic sur un titre masqué sans effet, tuiles bloquées), décrire le symptôme et le HTML concerné ; corriger dans une tâche dédiée.

---

## Self-Review (spec → tâches)

| Exigence de la spec | Tâche |
|---|---|
| Interrupteur à côté de « Sélectionner », idempotent, repli si introuvable | 3 (repérage), 4 (interrupteur), 6 (`sync` sans bouton → vue Liste) |
| Vue persistée | 4 (`readView`/`writeView`) |
| Carte Leaflet, tuiles CARTO clair/sombre | 5 |
| Positions manuelles > Wikipédia, cache y compris « aucune » | 2 |
| Requête Wikipédia : titre seul, une à la fois | 2 (`fetchWikiCoords`, `createGeoRepo`) |
| « À placer », placement, déplacement, retrait | 5 (`WorldPanel`, `world-map`) |
| Clic point → fiche du jeu | 6 (`openCard` = `marketUi.reopenCard`) |
| Cartes connues par observation passive | 1, 3, 6 |
| État vide, Wikipédia injoignable | 5 (message), 2 (arrêt au premier échec) |
| Tests Vitest logique pure / bascule | 1 à 5 |

**Écarts assumés par rapport à la spec** (à refléter dans la spec, voir commit suivant) :
- La fiche s'ouvre sur la même page : aucun mécanisme de retour n'est nécessaire (la vue Monde reste affichée).
- « Déplacer » = glisser le marqueur ; « Revenir à la position Wikipédia » = clic droit sur un marqueur orange.
- Pas d'image stockée pour les cartes connues (titre et slug suffisent) ; Leaflet est importé statiquement (WXT regroupe le script de contenu en un seul fichier).
- Plusieurs cartes à la même position se superposent (pas de clustering en V1).
