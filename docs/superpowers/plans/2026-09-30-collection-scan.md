# Scan de la Collection en arrière plan — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Au premier chargement de la Collection, récupérer toutes les cartes du joueur en arrière plan (page par page, via l'API du site) pour que la vue Monde les affiche au fur et à mesure.

**Architecture:** `createGameApi` (file séquentielle, espacement, backoff 429, déjà existant) gagne `getCollectionPage(page)`. Un `createCollectionScanner` parcourt les pages, alimente `CollectionRepo.observe` page après page (le panneau se recharge déjà sur `subscribe`) et mémorise sa progression dans le stockage pour reprendre après une interruption. `collection-ui` le lance une fois par chargement de page `/collection` ; `WorldPanel` affiche l'état et un bouton pour relancer.

**Tech Stack:** WXT, React 19, zod 4, Vitest 5 (jsdom via docblock).

**Spec:** `docs/superpowers/specs/2026-09-30-collection-world-view-design.md` (section « Scan de la Collection », ajoutée avec ce plan) ; contexte API : `docs/superpowers/specs/2026-09-30-wikimasters-tools-design.md` §2.

## Global Constraints

- Décision explicite de l'utilisateur (30/09/2026) : scan **automatique, en arrière plan**, au premier chargement. Les règles du jeu interdisent l'automatisation : le risque est assumé par l'utilisateur et rappelé dans le README (Task 3).
- Endpoint exact : `GET /api/my-collection?sort=rarity&page=N&stats=0` (page **0-indexée**, `sort` obligatoire). Réponse : `{ collection: [...], total: null, rarityCounts: {}, tagOptions: [], pendingTradeCardIds: [] }` ; aucun `hasMore` : **une page vide marque la fin**. Chaque entrée a `card.wikipedia_title`, `card.wikipedia_url`, `card.lang`, `is_shiny`, `count`, `tags`, `user_id`.
- Une requête à la fois, espacée de **1500 ms** (`minIntervalMs: 1500`), backoff 429 déjà géré par `createGameApi`. Le scan s'arrête à la première erreur (non connecté, 429 persistant, format inattendu) sans réessayer en boucle ; la reprise se fait au chargement suivant.
- On ne conserve **que** `slug` et `title` (aucun identifiant de joueur, aucun tag, aucun pseudo). Slug = `titleToSlug(card.wikipedia_title)` (même clé que le repérage DOM existant).
- Le scan passe par la même instance de `CollectionRepo` que le panneau (les abonnements dépendent de l'instance).
- Commande npm : `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" <args>` (noté `NPM`) ; pas de `npx`. Fichiers créés avec l'outil Write. `noUncheckedIndexedAccess` actif.
- Fixtures **anonymisées** : aucun vrai identifiant ni pseudo de joueur dans le dépôt.
- Trailer de commit : `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: API `getCollectionPage` et lecture tolérante de la page

**Files:**
- Create: `src/core/api/collection-schemas.ts`
- Modify: `src/core/api/game-api.ts`
- Create: `tests/fixtures/collection-response.json`
- Test: `tests/core/api/collection-page.test.ts`

**Interfaces:**
- Consumes: `KnownCard` (`core/collection/collection-book`), `titleToSlug` (`core/market/market-book`), `ApiFormatError` (`core/api/errors`).
- Produces:
  - `collectionEndpoint(page: number): string` → `/api/my-collection?sort=rarity&page=${page}&stats=0`
  - `type CollectionPage = { cards: KnownCard[]; entries: number; skipped: number }` (`entries` = nombre brut d'entrées reçues, `cards` dédoublonnées par slug)
  - `parseCollectionPage(json: unknown, endpoint: string): CollectionPage` (lève `ApiFormatError` si `collection` n'est pas un tableau : on ne doit pas le confondre avec une page vide)
  - `createGameApi(...).getCollectionPage(page: number): Promise<CollectionPage>`

- [ ] **Step 1: Écrire la fixture et les tests en échec**

`tests/fixtures/collection-response.json` :

```json
{
  "collection": [
    {
      "id": "entry-1",
      "card": {
        "id": "card-1",
        "lang": "fr",
        "rarity": "L",
        "category": "série télévisée américaine",
        "image_url": null,
        "wikipedia_url": "https://fr.wikipedia.org/wiki/Ted_Lasso",
        "wikipedia_title": "Ted Lasso"
      },
      "tags": [],
      "count": 1,
      "card_id": "card-1",
      "starred": false,
      "user_id": "user-1",
      "is_shiny": false,
      "obtained_at": "2026-09-28T20:07:30.85111+00:00"
    },
    {
      "id": "entry-2",
      "card": {
        "id": "card-2",
        "lang": "fr",
        "rarity": "UR",
        "category": null,
        "image_url": null,
        "wikipedia_url": "https://fr.wikipedia.org/wiki/Tenture_de_l%27Apocalypse",
        "wikipedia_title": "Tenture de l'Apocalypse"
      },
      "tags": [],
      "count": 1,
      "card_id": "card-2",
      "starred": false,
      "user_id": "user-1",
      "is_shiny": false,
      "obtained_at": "2026-09-28T14:07:03.547446+00:00"
    },
    {
      "id": "entry-3",
      "card": {
        "id": "card-3",
        "lang": "fr",
        "rarity": "SR",
        "category": "financier",
        "image_url": null,
        "wikipedia_url": "https://fr.wikipedia.org/wiki/Paul_de_Gr%C3%A8ce_(1967)",
        "wikipedia_title": "Paul de Grèce (1967)"
      },
      "tags": [],
      "count": 1,
      "card_id": "card-3",
      "starred": false,
      "user_id": "user-1",
      "is_shiny": false,
      "obtained_at": "2026-09-29T19:51:14.639354+00:00"
    }
  ],
  "total": null,
  "rarityCounts": {},
  "tagOptions": [],
  "pendingTradeCardIds": []
}
```

`tests/core/api/collection-page.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/collection-response.json';
import { collectionEndpoint, parseCollectionPage } from '../../../src/core/api/collection-schemas';
import { ApiFormatError } from '../../../src/core/api/errors';
import { createGameApi, type FetchLike } from '../../../src/core/api/game-api';

const ENDPOINT = '/api/my-collection?sort=rarity&page=0&stats=0';

describe('collectionEndpoint', () => {
  it('construit l’adresse paginée (page 0-indexée, tri obligatoire)', () => {
    expect(collectionEndpoint(0)).toBe(ENDPOINT);
    expect(collectionEndpoint(12)).toBe('/api/my-collection?sort=rarity&page=12&stats=0');
  });
});

describe('parseCollectionPage', () => {
  it('lit le titre et le slug de chaque carte, sans rien garder du joueur', () => {
    const page = parseCollectionPage(fixture, ENDPOINT);
    expect(page.entries).toBe(3);
    expect(page.skipped).toBe(0);
    expect(page.cards).toEqual([
      { slug: 'Ted_Lasso', title: 'Ted Lasso' },
      { slug: "Tenture_de_l'Apocalypse", title: "Tenture de l'Apocalypse" },
      { slug: 'Paul_de_Grèce_(1967)', title: 'Paul de Grèce (1967)' },
    ]);
  });

  it('dédoublonne une carte présente en normal et en shiny, mais compte les deux entrées', () => {
    const entry = fixture.collection[0];
    const page = parseCollectionPage({ collection: [entry, { ...entry, id: 'shiny', is_shiny: true }] }, ENDPOINT);
    expect(page.entries).toBe(2);
    expect(page.cards).toHaveLength(1);
  });

  it('écarte une entrée invalide sans faire échouer les autres', () => {
    const page = parseCollectionPage({ collection: [fixture.collection[0], { id: 'x' }] }, ENDPOINT);
    expect(page.entries).toBe(2);
    expect(page.skipped).toBe(1);
    expect(page.cards).toHaveLength(1);
  });

  it('renvoie une page vide pour une collection vide (fin du parcours)', () => {
    expect(parseCollectionPage({ collection: [] }, ENDPOINT)).toEqual({ cards: [], entries: 0, skipped: 0 });
  });

  it('lève si « collection » est absente : ce n’est pas une page vide', () => {
    expect(() => parseCollectionPage({ error: 'x' }, ENDPOINT)).toThrow(ApiFormatError);
    expect(() => parseCollectionPage(null, ENDPOINT)).toThrow(ApiFormatError);
  });
});

describe('createGameApi.getCollectionPage', () => {
  it('appelle l’endpoint de la page demandée et renvoie les cartes', async () => {
    const calls: string[] = [];
    const fetch: FetchLike = async (input) => {
      calls.push(input);
      return new Response(JSON.stringify(fixture), { status: 200 });
    };
    const api = createGameApi({ fetch, sleep: async () => undefined, now: () => 0, minIntervalMs: 0 });

    const page = await api.getCollectionPage(2);

    expect(calls).toEqual(['/api/my-collection?sort=rarity&page=2&stats=0']);
    expect(page.cards).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `NPM test -- tests/core/api/collection-page.test.ts`
Expected: FAIL (module `collection-schemas` introuvable).

- [ ] **Step 3: Implémenter**

`src/core/api/collection-schemas.ts` :

```ts
import { z } from 'zod';
import type { KnownCard } from '../collection/collection-book';
import { titleToSlug } from '../market/market-book';
import { ApiFormatError } from './errors';

export const collectionEndpoint = (page: number): string =>
  `/api/my-collection?sort=rarity&page=${page}&stats=0`;

// On ne déclare que le titre : ni identifiant de joueur, ni étiquettes, ni pseudo n'est conservé.
const entrySchema = z.object({
  card: z.object({ wikipedia_title: z.string().min(1) }),
});

export type CollectionPage = {
  cards: KnownCard[];
  // Entrées brutes reçues (0 = fin de la collection : l'API ne donne ni total ni `hasMore`).
  entries: number;
  skipped: number;
};

// Tolérant : une entrée invalide est écartée. Mais une réponse sans tableau `collection` lève,
// pour ne pas la confondre avec la fin de la collection.
export function parseCollectionPage(json: unknown, endpoint: string): CollectionPage {
  const raw = (json as { collection?: unknown } | null)?.collection;
  if (!Array.isArray(raw)) throw new ApiFormatError(endpoint, 'tableau « collection » absent');

  const cards = new Map<string, KnownCard>();
  let skipped = 0;
  for (const item of raw) {
    const parsed = entrySchema.safeParse(item);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }
    const title = parsed.data.card.wikipedia_title;
    const slug = titleToSlug(title);
    if (!cards.has(slug)) cards.set(slug, { slug, title });
  }
  return { cards: [...cards.values()], entries: raw.length, skipped };
}
```

Dans `src/core/api/game-api.ts` :
- ajouter l'import `import { collectionEndpoint, parseCollectionPage, type CollectionPage } from './collection-schemas';`
- dans l'objet renvoyé par `createGameApi`, après `getMine`, ajouter :

```ts
    getCollectionPage: (page: number): Promise<CollectionPage> =>
      enqueue(async () => {
        const path = collectionEndpoint(page);
        return parseCollectionPage(await requestJson(path), path);
      }),
```

- [ ] **Step 4: Vérifier le succès**

Run: `NPM test -- tests/core/api/collection-page.test.ts` puis `NPM run typecheck`
Expected: PASS, typecheck sans erreur.

- [ ] **Step 5: Commit**

```bash
git add src/core/api tests/fixtures/collection-response.json tests/core/api/collection-page.test.ts
git commit -m "feat: lecture d'une page de la Collection via l'API du jeu" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Scanner de la Collection (parcours, progression, reprise)

**Files:**
- Create: `src/core/collection/collection-scan.ts`
- Test: `tests/core/collection/collection-scan.test.ts`

**Interfaces:**
- Consumes: `CollectionPage` (Task 1), `CollectionRepo` (`core/collection/collection-repo`, méthode `observe(cards): Promise<void>`), `KeyValueStore`.
- Produces:
  - `type ScanState = { status: 'idle' | 'running' | 'done' | 'error'; nextPage: number; entries: number; updatedAt: number; error?: string }`, `IDLE_SCAN: ScanState`
  - `createCollectionScanner({ api: { getCollectionPage(page: number): Promise<CollectionPage> }, collection: Pick<CollectionRepo, 'observe'>, store: KeyValueStore, now?: () => number, maxPages?: number })` →
    `{ run(options?: { force?: boolean }): Promise<void>; state(): Promise<ScanState>; subscribe(listener: () => void): () => void }`
  - `type CollectionScanner = ReturnType<typeof createCollectionScanner>`
  - Clé de stockage : `collectionScan`.
- Règles : `run()` ne fait rien si le scan est `done` (sauf `force`), si un scan d'un autre onglet est `running` avec `updatedAt` de moins de 60 000 ms, ou si ce scanner est déjà actif. Un scan `error` ou `running` périmé reprend à `nextPage`. `force` repart de la page 0. Une page à `entries === 0` termine (`done`). Toute erreur → `status: 'error'`, `nextPage` conservé, pas de nouvelle tentative. `maxPages` (200 par défaut) atteint → `error` « limite de pages atteinte ».

- [ ] **Step 1: Écrire les tests en échec**

`tests/core/collection/collection-scan.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import type { CollectionPage } from '../../../src/core/api/collection-schemas';
import { NotAuthenticatedError } from '../../../src/core/api/errors';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createCollectionRepo } from '../../../src/core/collection/collection-repo';
import { createCollectionScanner, type ScanState } from '../../../src/core/collection/collection-scan';

const card = (name: string) => ({ slug: name, title: name });
const page = (...names: string[]): CollectionPage => ({ cards: names.map(card), entries: names.length, skipped: 0 });
const EMPTY = page();

function setup(pages: (CollectionPage | Error)[], options: { maxPages?: number } = {}) {
  const store = createMemoryStore();
  const collection = createCollectionRepo(store);
  const getCollectionPage = vi.fn(async (index: number) => {
    const next = pages[index] ?? EMPTY;
    if (next instanceof Error) throw next;
    return next;
  });
  const scanner = createCollectionScanner({
    api: { getCollectionPage },
    collection,
    store,
    now: () => 1_000_000,
    ...options,
  });
  return { store, collection, scanner, getCollectionPage };
}

describe('createCollectionScanner', () => {
  it('parcourt les pages jusqu’à une page vide et alimente la collection page par page', async () => {
    const { scanner, collection, getCollectionPage } = setup([page('A', 'B'), page('C')]);

    await scanner.run();

    expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 1, 2]);
    expect((await collection.list()).map((c) => c.slug).sort()).toEqual(['A', 'B', 'C']);
    expect(await scanner.state()).toMatchObject({ status: 'done', entries: 3, nextPage: 2 });
  });

  it('ne refait rien une fois terminé, sauf avec force (repart de la page 0)', async () => {
    const { scanner, getCollectionPage } = setup([page('A')]);
    await scanner.run();
    getCollectionPage.mockClear();

    await scanner.run();
    expect(getCollectionPage).not.toHaveBeenCalled();

    await scanner.run({ force: true });
    expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 1]);
  });

  it('s’arrête à la première erreur, garde sa place et reprend à cette page', async () => {
    const { scanner, collection, getCollectionPage } = setup([page('A'), new NotAuthenticatedError('/x', 401), page('C')]);

    await scanner.run();
    expect(await scanner.state()).toMatchObject({ status: 'error', nextPage: 1, entries: 1 });
    expect((await scanner.state()).error).toContain('Non connecté');
    expect(getCollectionPage).toHaveBeenCalledTimes(2);

    getCollectionPage.mockClear();
    getCollectionPage.mockImplementation(async (index: number) => (index === 1 ? page('B') : EMPTY));
    await scanner.run();

    expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([1, 2]);
    expect((await collection.list()).map((c) => c.slug).sort()).toEqual(['A', 'B']);
    expect(await scanner.state()).toMatchObject({ status: 'done' });
  });

  it('laisse un scan récent d’un autre onglet tranquille, mais reprend un scan périmé', async () => {
    const fresh: ScanState = { status: 'running', nextPage: 4, entries: 200, updatedAt: 1_000_000 - 10_000 };
    const stale: ScanState = { status: 'running', nextPage: 4, entries: 200, updatedAt: 1_000_000 - 120_000 };

    const a = setup([]);
    await a.store.set('collectionScan', fresh);
    await a.scanner.run();
    expect(a.getCollectionPage).not.toHaveBeenCalled();

    const b = setup([]);
    await b.store.set('collectionScan', stale);
    await b.scanner.run();
    expect(b.getCollectionPage.mock.calls[0]?.[0]).toBe(4);
  });

  it('ne lance pas deux parcours en même temps dans le même onglet', async () => {
    const { scanner, getCollectionPage } = setup([page('A')]);
    await Promise.all([scanner.run(), scanner.run()]);
    expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 1]);
  });

  it('s’arrête sur la limite de pages', async () => {
    const { scanner, getCollectionPage } = setup([page('A'), page('B'), page('C')], { maxPages: 2 });
    await scanner.run();
    expect(getCollectionPage).toHaveBeenCalledTimes(2);
    expect(await scanner.state()).toMatchObject({ status: 'error', nextPage: 2 });
    expect((await scanner.state()).error).toContain('limite');
  });

  it('prévient les abonnés à chaque changement d’état, jusqu’au désabonnement', async () => {
    const { scanner } = setup([page('A')]);
    const listener = vi.fn();
    const unsubscribe = scanner.subscribe(listener);
    await scanner.run();
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(3);

    unsubscribe();
    listener.mockClear();
    await scanner.run({ force: true });
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `NPM test -- tests/core/collection/collection-scan.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

`src/core/collection/collection-scan.ts` :

```ts
import type { CollectionPage } from '../api/collection-schemas';
import type { KeyValueStore } from '../cache/store';
import type { CollectionRepo } from './collection-repo';

const KEY = 'collectionScan';
// Un autre onglet qui a écrit son état il y a moins longtemps est considéré comme toujours en cours.
const LOCK_MS = 60_000;

export type ScanState = {
  status: 'idle' | 'running' | 'done' | 'error';
  // Prochaine page à lire (0-indexée) : c'est là que la reprise repart.
  nextPage: number;
  // Entrées lues depuis le début du parcours en cours.
  entries: number;
  updatedAt: number;
  error?: string;
};

export const IDLE_SCAN: ScanState = { status: 'idle', nextPage: 0, entries: 0, updatedAt: 0 };

export type ScannerDeps = {
  api: { getCollectionPage(page: number): Promise<CollectionPage> };
  collection: Pick<CollectionRepo, 'observe'>;
  store: KeyValueStore;
  now?: () => number;
  maxPages?: number;
};

export function createCollectionScanner({
  api,
  collection,
  store,
  now = () => Date.now(),
  maxPages = 200,
}: ScannerDeps) {
  const listeners = new Set<() => void>();
  let active = false;

  async function state(): Promise<ScanState> {
    return (await store.get<ScanState>(KEY)) ?? IDLE_SCAN;
  }

  async function write(next: ScanState): Promise<void> {
    await store.set(KEY, next);
    for (const listener of listeners) listener();
  }

  // Une page à la fois (l'espacement et le backoff 429 sont ceux de l'API). Aucune nouvelle
  // tentative en boucle : à la première erreur on s'arrête, la reprise se fait au prochain appel.
  async function run({ force = false }: { force?: boolean } = {}): Promise<void> {
    if (active) return;
    active = true;
    let page = 0;
    let entries = 0;
    try {
      const saved = await state();
      if (!force && saved.status === 'done') return;
      if (saved.status === 'running' && now() - saved.updatedAt < LOCK_MS) return;
      if (!force) {
        page = saved.nextPage;
        entries = saved.entries;
      }

      while (page < maxPages) {
        await write({ status: 'running', nextPage: page, entries, updatedAt: now() });
        const result = await api.getCollectionPage(page);
        if (result.entries === 0) {
          await write({ status: 'done', nextPage: page, entries, updatedAt: now() });
          return;
        }
        await collection.observe(result.cards);
        entries += result.entries;
        page += 1;
      }
      await write({
        status: 'error',
        nextPage: page,
        entries,
        updatedAt: now(),
        error: 'limite de pages atteinte',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await write({ status: 'error', nextPage: page, entries, updatedAt: now(), error: message }).catch(
        () => undefined,
      );
    } finally {
      active = false;
    }
  }

  return {
    run,
    state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type CollectionScanner = ReturnType<typeof createCollectionScanner>;
```

- [ ] **Step 4: Vérifier le succès**

Run: `NPM test -- tests/core/collection/collection-scan.test.ts` puis `NPM run typecheck`
Expected: PASS, typecheck sans erreur.

- [ ] **Step 5: Commit**

```bash
git add src/core/collection/collection-scan.ts tests/core/collection/collection-scan.test.ts
git commit -m "feat: scanner de la Collection (parcours page par page, progression, reprise)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Branchement (lancement, état dans le panneau, README)

**Files:**
- Modify: `src/entrypoints/content.tsx`
- Modify: `src/content/collection-ui.tsx`
- Modify: `src/content/WorldPanel.tsx`
- Modify: `README.md` (si une section « limites / règles du jeu » existe, y ajouter la note ; sinon l'ajouter en fin de fichier)

**Interfaces:**
- Consumes: `createCollectionScanner`, `CollectionScanner`, `ScanState`, `IDLE_SCAN` (Task 2) ; `api.getCollectionPage` (Task 1) ; `CollectionUiDeps`, `WorldPanel` props existants.
- Produces: `CollectionUiDeps` gagne `scanner: CollectionScanner` ; `WorldPanel` gagne la prop `scanner: CollectionScanner`.

Pas de test unitaire ajouté (câblage DOM/React ; le module importe le CSS Leaflet et React) — vérification par `typecheck` + `build`, puis manuelle dans Chrome.

- [ ] **Step 1: `content.tsx`**

1. Import : `import { createCollectionScanner } from '../core/collection/collection-scan';`
2. Dans `createGameApi({...})`, ajouter l'option `minIntervalMs: 1500,` (à côté de `fetch`).
3. Remplacer la création inline du dépôt et de l'UI par un dépôt partagé et le scanner :

```ts
    const collectionRepo = createCollectionRepo(store);
    const collectionUi = createCollectionUi({
      collection: collectionRepo,
      geo: createGeoRepo(store, (slug) => fetchWikiCoords((url) => fetch(url), slug)),
      scanner: createCollectionScanner({ api, collection: collectionRepo, store }),
      openCard: (slug) => void marketUi.reopenCard(slug),
    });
```

(garder le commentaire existant sur la requête Wikipédia sans identifiants ; la requête du scan, elle, part avec la session du joueur via `api`, comme `getMine`.)

- [ ] **Step 2: `collection-ui.tsx`**

1. Importer le type : `import type { CollectionScanner } from '../core/collection/collection-scan';`
2. `CollectionUiDeps` : ajouter `scanner: CollectionScanner;` ; le destructurer dans `createCollectionUi({ collection, geo, scanner, openCard })`.
3. Ajouter une variable `let scanStarted = false;` avec `panel`.
4. Dans `sync()`, juste après la garde `/collection` et avant `findSelectButton`, ajouter :

```ts
    // Premier chargement : le scan tourne en arrière plan (une fois par chargement de page ;
    // il ne refait rien s'il est déjà terminé, et reprend où il s'était arrêté sinon).
    if (!scanStarted) {
      scanStarted = true;
      scanner.run().catch((error) => console.warn(LOG, 'scan de la Collection interrompu :', error));
    }
```

5. Passer le scanner au panneau : `<WorldPanel collection={collection} geo={geo} scanner={scanner} onOpen={openCard} />`.

- [ ] **Step 3: `WorldPanel.tsx`**

1. Imports : `import { IDLE_SCAN, type CollectionScanner, type ScanState } from '../core/collection/collection-scan';`
2. `Props` : ajouter `scanner: CollectionScanner;` ; destructurer `scanner`.
3. État : `const [scan, setScan] = useState<ScanState>(IDLE_SCAN);`
4. Remplacer l'effet de chargement/abonnement existant par une version qui **regroupe** les rechargements déclenchés par les abonnements (le scan et la résolution Wikipédia notifient souvent ; sans ça la carte reconstruirait tous ses marqueurs à chaque notification) et suit le scan :

```tsx
  useEffect(() => {
    let alive = true;
    const loadCards = () => void collection.list().then((list) => alive && setCards(list));
    const loadGeo = () => void geo.load().then((state) => alive && setGeoState(state));
    const loadScan = () => void scanner.state().then((state) => alive && setScan(state));
    // Rechargement groupé : au plus un par seconde, le dernier événement gagne.
    const grouped = (load: () => void) => {
      let timer: number | undefined;
      return {
        call: () => {
          window.clearTimeout(timer);
          timer = window.setTimeout(load, 1000);
        },
        cancel: () => window.clearTimeout(timer),
      };
    };
    const cardsReload = grouped(loadCards);
    const geoReload = grouped(loadGeo);
    loadCards();
    loadGeo();
    loadScan();
    const offCollection = collection.subscribe(cardsReload.call);
    const offGeo = geo.subscribe(geoReload.call);
    const offScan = scanner.subscribe(loadScan);
    return () => {
      alive = false;
      cardsReload.cancel();
      geoReload.cancel();
      offCollection();
      offGeo();
      offScan();
    };
  }, [collection, geo, scanner]);
```

5. Dans le JSX, juste au-dessus de la ligne de texte `{cards.length === 0 ? ... }` du bloc de la carte, afficher l'état du scan et le bouton :

```tsx
        <p style={{ margin: '8px 0 0', fontSize: 12 }}>
          {scan.status === 'running' && `Scan de la Collection en cours… page ${scan.nextPage + 1}, ${scan.entries} cartes lues.`}
          {scan.status === 'done' && `Collection scannée (${scan.entries} cartes lues). `}
          {scan.status === 'error' && `Scan interrompu : ${scan.error ?? 'erreur inconnue'}. `}
          {scan.status === 'idle' && 'Scan de la Collection pas encore lancé. '}
          {scan.status !== 'running' && (
            <button
              type="button"
              onClick={() => void scanner.run({ force: scan.status === 'done' })}
              style={linkButton}
            >
              {scan.status === 'done' ? 'Re-scanner' : scan.status === 'error' ? 'Reprendre' : 'Lancer le scan'}
            </button>
          )}
        </p>
```

(`linkButton` est déjà défini en bas du fichier.)

- [ ] **Step 4: README**

Ajouter (ou compléter) une note : « Au premier chargement de la Collection, l'extension lit toutes les pages de votre Collection en arrière plan (une requête toutes les 1,5 s, avec votre session), pour alimenter la vue Monde. Les règles du jeu interdisent l'automatisation : ce scan est un choix de l'utilisateur, à ses risques. Bouton « Re-scanner » dans la vue Monde ; aucune donnée n'est envoyée ailleurs (seuls les titres d'articles partent vers Wikipédia). »

- [ ] **Step 5: Vérifier**

Run: `NPM run typecheck`, `NPM test`, `NPM run build`
Expected: typecheck sans erreur ; tous les tests passent (179 existants + ceux des tâches 1 et 2) ; build OK.

- [ ] **Step 6: Commit**

```bash
git add src/entrypoints/content.tsx src/content/collection-ui.tsx src/content/WorldPanel.tsx README.md
git commit -m "feat: scan de la Collection en arrière plan, état et relance dans la vue Monde" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review (demande → tâches)

| Exigence | Tâche |
|---|---|
| Parcours de toutes les pages au premier chargement | 2 (scanner, état `done` mémorisé), 3 (lancement dans `sync`) |
| En arrière plan (option A : API directe, pas de clic sur le site) | 1 (`getCollectionPage`), 3 |
| Afficher ce qu'on peut page par page, recharger à chaque page | 2 (`observe` par page), 3 (rechargement groupé du panneau, 1 s) |
| Pas de tri par date d'ajout (toute la collection est chargée) | sans objet |
| Fin de collection sans `total`/`hasMore` | 1 (`entries`), 2 (page vide = fin) |
| Débit prudent, arrêt à la première erreur, reprise | 2, 3 (`minIntervalMs: 1500`) |
| Données minimales conservées (slug, titre) | 1 |
| Bouton pour relancer | 3 |
| Risque vis-à-vis des règles du jeu assumé et documenté | Global Constraints, 3 (README) |

**Coût connu :** la résolution des coordonnées Wikipédia reste une requête par carte (une à la fois, 150 ms d'écart). Avec une grande collection (plusieurs centaines de cartes) elle prend plusieurs minutes, à l'ouverture de la vue Monde uniquement ; la carte se remplit au fur et à mesure. Un regroupement par lots de 50 titres serait l'amélioration suivante si c'est trop lent.
