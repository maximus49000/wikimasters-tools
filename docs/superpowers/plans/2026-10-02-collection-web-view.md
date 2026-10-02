# Vue « Toile d'araignée » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à la page Collection une cinquième vue, « Toile », qui relie les cartes par les articles Wikipédia qu'elles citent, sur l'extension et sur l'application Android.

**Architecture:** Un dépôt `links` (calqué sur `geo` / `kinds`) lit par lots de 50 cartes leurs liens sortants vers des articles Wikipédia FR et les mémorise sous `links-v1`. Des fonctions pures construisent le graphe (cartes + articles partagés par au moins 2 cartes) puis le placent (forces, déterministe). Un panneau React rend le graphe en SVG zoomable ; toucher une carte ouvre `CardPopup`, comme dans la vue Monde.

**Tech Stack:** TypeScript, React 19, zod, vitest (+ jsdom pour les panneaux), WXT. Aucune nouvelle dépendance.

**Spec:** `docs/superpowers/specs/2026-10-02-collection-web-view-design.md`

## Global Constraints

- Sentence case et français partout ; boutons en glyphes seuls (avec `aria-label` et `title`), jamais en texte (retour utilisateur « Toutes les interfaces »).
- Code commun à l'extension et à l'APK : rien dans `src/entrypoints` ni `src/android` ; le seul point d'entrée partagé est `src/app/overlay.ts`.
- Requêtes Wikipédia sans identifiants : seuls des titres d'articles partent (`origin=*`, pas de cookies), via `fetch((url) => fetch(url))` comme `geo` et `kinds`.
- Un article n'est jamais relu avant 30 jours ; après un échec (429, hors ligne), pause de 60 s ; 150 ms entre deux requêtes.
- Un point (article hors collection) n'est affiché que s'il relie au moins 2 cartes visibles ; au plus 300 points affichés (les plus partagés).
- Les liens d'une carte sont limités à 600 (le stockage de l'appli Android, `localStorage`, est borné).
- Clé de stockage : `links-v1`. Aucune autre clé n'est touchée.
- Les vues respectent les filtres existants (site : rareté, étiquette ; nature / occupation ; ×2) exactement comme Monde et Chronologique.
- Avant chaque `git commit` : `git branch --show-current` doit rendre `feat/vue-toile` (une autre session peut partager le dossier).

---

## File Structure

| Fichier | Rôle |
| --- | --- |
| `src/core/links/wiki-links.ts` (créer) | Requête et lecture de l'API Wikipédia `prop=links` (pagination, redirections). |
| `src/core/links/links-book.ts` (créer) | État mémorisé (dictionnaire de titres + identifiants par carte), fraîcheur 30 jours. |
| `src/core/links/links-repo.ts` (créer) | Dépôt : stockage, file d'attente, lots de 50, pause après échec, abonnés. |
| `src/core/links/web-graph.ts` (créer) | `buildWeb` (cartes, points partagés, liens carte à carte) et `neighborhood` (mise en avant). |
| `src/core/links/web-layout.ts` (créer) | `layoutWeb` : placement par forces, déterministe, repart des positions précédentes. |
| `src/core/links/web-view.ts` (créer) | Maths du zoom et du déplacement (`zoomAt`, `pinch`, `fitTransform`, `boundsOf`). |
| `src/content/useFilteredCards.ts` (créer) | Cartes de la Collection et ensemble des cartes qui passent les filtres. |
| `src/content/WebPanel.tsx` (créer) | Panneau de la vue Toile. |
| `src/content/collection-view.ts` (modifier) | Ajoute `'web'`. |
| `src/content/world-toggle.ts` (modifier) | Ajoute le bouton (glyphe « network » de Lucide). |
| `src/content/collection-ui.tsx` (modifier) | Dépendance `links`, montage de `WebPanel`. |
| `src/app/overlay.ts` (modifier) | Crée le dépôt de liens. |
| `tests/core/links/*.test.ts`, `tests/content/web-panel.test.tsx` (créer) | Tests. |
| `tests/content/world-toggle.test.ts` (modifier) | Cinq boutons au lieu de quatre. |
| `README.md`, `docs/INSTALLATION.md` (modifier) | Documentation de la vue. |

Interfaces partagées entre tâches (définies une fois, reprises telles quelles) :

```ts
// links-book.ts
export type LinksState = { titles: string[]; cards: Record<string, { at: number; links: number[] }> };
export const EMPTY_LINKS: LinksState;
export const LINKS_MAX_AGE_MS: number;       // 30 jours
export const MAX_LINKS_PER_CARD: number;     // 600
export function needsLinksLookup(state: LinksState, slug: string, now: number): boolean;
export function setLinks(state: LinksState, fetched: Record<string, string[]>, now: number): LinksState;
export function linksOf(state: LinksState, slug: string): string[];   // slugs d'articles, [] si inconnu

// links-repo.ts
export type LinksFetcher = (slugs: string[]) => Promise<Record<string, string[]>>;
export function createLinksRepo(store: KeyValueStore, fetchLinks: LinksFetcher, sleep?: (ms: number) => Promise<void>, gapMs?: number, now?: () => number): {
  subscribe(listener: () => void): () => void;
  load(): Promise<LinksState>;
  resolveMissing(slugs: string[]): Promise<void>;
  failed(): boolean;
};
export type LinksRepo = ReturnType<typeof createLinksRepo>;

// web-graph.ts
export type WebHub = { slug: string; title: string; cards: string[] };
export type WebGraph = { cards: KnownCard[]; hubs: WebHub[]; cardLinks: [string, string][]; hiddenHubs: number };
export const cardId: (slug: string) => string;   // 'c:' + slug
export const hubId: (slug: string) => string;    // 'h:' + slug
export function buildWeb(cards: KnownCard[], links: LinksState, visible: ReadonlySet<string> | null, limits?: { minShared: number; maxHubs: number }): WebGraph;
export type Focus = { kind: 'card' | 'hub'; slug: string };
export function neighborhood(graph: WebGraph, focus: Focus): { focusId: string; lit: Set<string> };

// web-layout.ts
export type Point = { x: number; y: number };
export function layoutWeb(nodes: { id: string }[], edges: readonly (readonly [string, string])[], previous?: Record<string, Point>, iterations?: number): Record<string, Point>;

// web-view.ts
export type Transform = { x: number; y: number; k: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
```

---

### Task 1: Lecture des liens Wikipédia

**Files:**
- Create: `src/core/links/wiki-links.ts`
- Test: `tests/core/links/wiki-links.test.ts`

**Interfaces:**
- Consumes: `getJson`, `FetchLike` (`src/core/birth/wikidata-birth.ts`), `slugToTitle`, `titleToSlug` (`src/core/market/market-book.ts`).
- Produces: `fetchWikiLinks(fetchFn: FetchLike, slugs: string[], options?: { gapMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<Record<string, string[]>>` — pour chaque slug demandé (toujours présent dans le résultat), la liste sans doublon des slugs d'articles cités (espace de noms principal). Lève sur toute réponse inattendue ou erreur HTTP. `parseLinksPage(json: unknown): LinksPage`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/links/wiki-links.test.ts
import { describe, expect, it, vi } from 'vitest';
import { fetchWikiLinks, parseLinksPage } from '../../../src/core/links/wiki-links';

const respond = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const noSleep = async () => undefined;
const links = (...titles: string[]) => titles.map((title) => ({ title }));

describe('parseLinksPage', () => {
  it('lit les liens par page, la suite de la pagination, les normalisations et les redirections', () => {
    const page = parseLinksPage({
      continue: { plcontinue: '12|0|Pop', continue: '||' },
      query: {
        normalized: [{ from: 'piaf', to: 'Piaf' }],
        redirects: [{ from: 'Piaf', to: 'Édith Piaf' }],
        pages: [{ title: 'Édith Piaf', links: links('Pop', 'Paris') }, { title: 'Vide' }],
      },
    });
    expect(page.next).toEqual({ plcontinue: '12|0|Pop', continue: '||' });
    expect(page.normalized.get('piaf')).toBe('Piaf');
    expect(page.redirects.get('Piaf')).toBe('Édith Piaf');
    expect(page.links.get('Édith Piaf')).toEqual(['Pop', 'Paris']);
    expect(page.links.get('Vide')).toEqual([]);
  });

  it('lève sur une réponse inattendue (pour ne pas la mémoriser comme « sans lien »)', () => {
    expect(() => parseLinksPage({})).toThrow('Réponse Wikipédia inattendue');
    expect(() => parseLinksPage({ query: {} })).toThrow();
  });
});

describe('fetchWikiLinks', () => {
  it('rend, pour chaque article demandé, les slugs des articles cités, et une liste vide sans lien', async () => {
    const fetchFn = vi.fn(async () =>
      respond({ query: { pages: [{ title: 'Kamini', links: links('Pop', 'Édith Piaf', 'Pop') }, { title: 'Inconnue', missing: true }] } }),
    );

    const result = await fetchWikiLinks(fetchFn, ['Kamini', 'Inconnue'], { sleep: noSleep });

    expect(result).toEqual({ Kamini: ['Pop', 'Édith_Piaf'], Inconnue: [] });
    const url = new URL(fetchFn.mock.calls[0]?.[0] as string);
    expect(url.searchParams.get('prop')).toBe('links');
    expect(url.searchParams.get('plnamespace')).toBe('0');
    expect(url.searchParams.get('pllimit')).toBe('max');
    expect(url.searchParams.get('redirects')).toBe('1');
    expect(url.searchParams.get('titles')).toBe('Kamini|Inconnue');
  });

  it('suit la pagination en renvoyant plcontinue, et réunit les liens des différentes pages', async () => {
    const fetchFn = vi
      .fn<(url: string) => Promise<Response>>()
      .mockResolvedValueOnce(respond({ continue: { plcontinue: 'abc', continue: '||' }, query: { pages: [{ title: 'A', links: links('Pop') }] } }))
      .mockResolvedValueOnce(respond({ query: { pages: [{ title: 'A', links: links('Rock', 'Pop') }] } }));
    const sleep = vi.fn(noSleep);

    const result = await fetchWikiLinks(fetchFn, ['A'], { sleep, gapMs: 150 });

    expect(result).toEqual({ A: ['Pop', 'Rock'] });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const second = new URL(fetchFn.mock.calls[1]?.[0] as string);
    expect(second.searchParams.get('plcontinue')).toBe('abc');
    expect(second.searchParams.get('continue')).toBe('||');
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(150);
  });

  it('rattache les liens à l’article demandé malgré normalisation et redirection', async () => {
    const fetchFn = vi.fn(async () =>
      respond({
        query: {
          normalized: [{ from: 'edith piaf', to: 'Edith piaf' }],
          redirects: [{ from: 'Edith piaf', to: 'Édith Piaf' }],
          pages: [{ title: 'Édith Piaf', links: links('Pop') }],
        },
      }),
    );
    expect(await fetchWikiLinks(fetchFn, ['edith_piaf'], { sleep: noSleep })).toEqual({ edith_piaf: ['Pop'] });
  });

  it('lève sur une erreur HTTP et sur une réponse inattendue', async () => {
    await expect(fetchWikiLinks(vi.fn(async () => ({ ok: false, status: 429 }) as Response), ['A'], { sleep: noSleep })).rejects.toThrow('429');
    await expect(fetchWikiLinks(vi.fn(async () => respond({})), ['A'], { sleep: noSleep })).rejects.toThrow('inattendue');
  });

  it('abandonne si la pagination ne se termine jamais', async () => {
    const fetchFn = vi.fn(async () => respond({ continue: { plcontinue: 'x', continue: '||' }, query: { pages: [{ title: 'A', links: links('Pop') }] } }));
    await expect(fetchWikiLinks(fetchFn, ['A'], { sleep: noSleep })).rejects.toThrow('trop de pages');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/links/wiki-links.test.ts`
Expected: FAIL (module `wiki-links` introuvable).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/links/wiki-links.ts
import { z } from 'zod';
import { getJson, type FetchLike } from '../birth/wikidata-birth';
import { slugToTitle, titleToSlug } from '../market/market-book';

const WIKIPEDIA = 'https://fr.wikipedia.org/w/api.php';
// Garde-fou : 50 articles de ~1000 liens tiennent en une centaine de pages de 500 liens.
const MAX_REQUESTS = 300;

const renames = z.array(z.object({ from: z.string(), to: z.string() }));
const responseSchema = z.object({
  continue: z.record(z.string(), z.string()).optional(),
  query: z.object({
    normalized: renames.optional(),
    redirects: renames.optional(),
    pages: z.array(z.object({ title: z.string(), links: z.array(z.object({ title: z.string() })).optional() })),
  }),
});

export type LinksPage = {
  // Paramètres à renvoyer pour obtenir la suite ; null : c'était la dernière page.
  next: Record<string, string> | null;
  normalized: Map<string, string>;
  redirects: Map<string, string>;
  // Titre de la page → titres des articles cités dans cette page de résultats.
  links: Map<string, string[]>;
};

// Un format inattendu lève : il ne doit pas être enregistré comme « article sans lien ».
export function parseLinksPage(json: unknown): LinksPage {
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) throw new Error('Réponse Wikipédia inattendue');
  const { query } = parsed.data;
  const toMap = (list: { from: string; to: string }[] = []) => new Map(list.map((entry) => [entry.from, entry.to]));
  return {
    next: parsed.data.continue ?? null,
    normalized: toMap(query.normalized),
    redirects: toMap(query.redirects),
    links: new Map(query.pages.map((page) => [page.title, (page.links ?? []).map((link) => link.title)])),
  };
}

export type FetchOptions = { gapMs?: number; sleep?: (ms: number) => Promise<void> };

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Les liens sortants (articles seulement) d'un lot d'articles. Seuls les titres sont envoyés : aucune donnée du jeu ni du compte.
export async function fetchWikiLinks(
  fetchFn: FetchLike,
  slugs: string[],
  { gapMs = 150, sleep = realSleep }: FetchOptions = {},
): Promise<Record<string, string[]>> {
  const titles = slugs.map(slugToTitle);
  const normalized = new Map<string, string>();
  const redirects = new Map<string, string>();
  const linked = new Map<string, Set<string>>();
  let next: Record<string, string> | null = {};
  for (let requests = 0; next; requests++) {
    if (requests >= MAX_REQUESTS) throw new Error('Wikipédia : trop de pages de liens');
    if (requests > 0) await sleep(gapMs);
    const page = parseLinksPage(
      await getJson(
        fetchFn,
        WIKIPEDIA,
        { action: 'query', prop: 'links', plnamespace: '0', pllimit: 'max', redirects: '1', formatversion: '2', titles: titles.join('|'), ...next },
        'Wikipédia',
      ),
    );
    for (const [from, to] of page.normalized) normalized.set(from, to);
    for (const [from, to] of page.redirects) redirects.set(from, to);
    for (const [title, list] of page.links) {
      const set = linked.get(title) ?? new Set<string>();
      for (const link of list) set.add(titleToSlug(link));
      linked.set(title, set);
    }
    next = page.next;
  }
  const step = (map: Map<string, string>, title: string) => map.get(title) ?? title;
  const result: Record<string, string[]> = {};
  slugs.forEach((slug, index) => {
    const title = titles[index] ?? '';
    result[slug] = [...(linked.get(step(redirects, step(normalized, title))) ?? [])];
  });
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/links/wiki-links.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/core/links/wiki-links.ts tests/core/links/wiki-links.test.ts
git commit -m "feat: lecture des liens Wikipédia d'un lot d'articles"
```

---

### Task 2: État mémorisé des liens

**Files:**
- Create: `src/core/links/links-book.ts`
- Test: `tests/core/links/links-book.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `LinksState`, `EMPTY_LINKS`, `LINKS_MAX_AGE_MS`, `MAX_LINKS_PER_CARD`, `needsLinksLookup`, `setLinks`, `linksOf` (signatures ci-dessus).

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/links/links-book.test.ts
import { describe, expect, it } from 'vitest';
import { EMPTY_LINKS, LINKS_MAX_AGE_MS, MAX_LINKS_PER_CARD, linksOf, needsLinksLookup, setLinks } from '../../../src/core/links/links-book';

describe('setLinks / linksOf', () => {
  it('partage les titres entre les cartes et rend les liens dans l’ordre reçu, sans doublon', () => {
    const state = setLinks(EMPTY_LINKS, { Kamini: ['Pop', 'Paris', 'Pop'], ChansonB: ['Pop'] }, 1000);
    expect(state.titles).toEqual(['Pop', 'Paris']);
    expect(linksOf(state, 'Kamini')).toEqual(['Pop', 'Paris']);
    expect(linksOf(state, 'ChansonB')).toEqual(['Pop']);
    expect(state.cards.Kamini?.at).toBe(1000);
  });

  it('ignore un lien de la carte vers elle-même', () => {
    expect(linksOf(setLinks(EMPTY_LINKS, { Kamini: ['Kamini', 'Pop'] }, 1), 'Kamini')).toEqual(['Pop']);
  });

  it('garde les entrées déjà connues et remplace celle d’une carte relue', () => {
    const first = setLinks(EMPTY_LINKS, { A: ['X'], B: ['Y'] }, 1);
    const second = setLinks(first, { A: ['Z'] }, 2);
    expect(linksOf(second, 'A')).toEqual(['Z']);
    expect(linksOf(second, 'B')).toEqual(['Y']);
    expect(second.cards.A?.at).toBe(2);
    expect(first.cards.A?.at).toBe(1);
  });

  it('plafonne les liens d’une carte', () => {
    const many = Array.from({ length: MAX_LINKS_PER_CARD + 50 }, (_, i) => `L${i}`);
    expect(linksOf(setLinks(EMPTY_LINKS, { A: many }, 1), 'A')).toHaveLength(MAX_LINKS_PER_CARD);
  });

  it('rend une liste vide pour une carte inconnue, même nommée comme une propriété d’objet', () => {
    expect(linksOf(EMPTY_LINKS, 'constructor')).toEqual([]);
    expect(linksOf(EMPTY_LINKS, 'Inconnue')).toEqual([]);
  });
});

describe('needsLinksLookup', () => {
  it('demande une carte jamais lue, mais pas une carte lue sans aucun lien', () => {
    const state = setLinks(EMPTY_LINKS, { Vide: [] }, 1000);
    expect(needsLinksLookup(state, 'Autre', 1000)).toBe(true);
    expect(needsLinksLookup(state, 'Vide', 1000)).toBe(false);
  });

  it('redemande une carte après 30 jours', () => {
    const state = setLinks(EMPTY_LINKS, { A: ['X'] }, 0);
    expect(needsLinksLookup(state, 'A', LINKS_MAX_AGE_MS - 1)).toBe(false);
    expect(needsLinksLookup(state, 'A', LINKS_MAX_AGE_MS)).toBe(true);
  });

  it('ne confond pas une carte nommée « constructor » avec une propriété d’objet', () => {
    expect(needsLinksLookup(EMPTY_LINKS, 'constructor', 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/links/links-book.test.ts`
Expected: FAIL (module `links-book` introuvable).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/links/links-book.ts
export type LinksState = {
  // Dictionnaire partagé : l'indice d'un titre d'article (slug) est son identifiant. Il ne rétrécit jamais.
  titles: string[];
  // Par carte : date de lecture et identifiants des articles cités. Liste vide = carte lue, sans lien (on ne la redemande pas).
  cards: Record<string, { at: number; links: number[] }>;
};

export const EMPTY_LINKS: LinksState = { titles: [], cards: {} };

export const LINKS_MAX_AGE_MS = 30 * 24 * 3_600_000;
// Garde-fou : le stockage de l'appli Android (localStorage) est borné, un article très long ne doit pas le remplir.
export const MAX_LINKS_PER_CARD = 600;

// `in` ou l'accès direct verraient « constructor » : on ne regarde que les clés propres.
function entryOf(state: LinksState, slug: string): LinksState['cards'][string] | undefined {
  return Object.prototype.hasOwnProperty.call(state.cards, slug) ? state.cards[slug] : undefined;
}

export function needsLinksLookup(state: LinksState, slug: string, now: number): boolean {
  const entry = entryOf(state, slug);
  return entry === undefined || now - entry.at >= LINKS_MAX_AGE_MS;
}

export function setLinks(state: LinksState, fetched: Record<string, string[]>, now: number): LinksState {
  const titles = [...state.titles];
  const index = new Map(titles.map((title, id) => [title, id]));
  const cards = { ...state.cards };
  for (const [slug, list] of Object.entries(fetched)) {
    const ids = new Set<number>();
    for (const link of list) {
      if (link === slug) continue;
      let id = index.get(link);
      if (id === undefined) {
        id = titles.length;
        titles.push(link);
        index.set(link, id);
      }
      ids.add(id);
      if (ids.size >= MAX_LINKS_PER_CARD) break;
    }
    cards[slug] = { at: now, links: [...ids] };
  }
  return { titles, cards };
}

// Les articles cités par une carte (slugs), dans l'ordre mémorisé.
export function linksOf(state: LinksState, slug: string): string[] {
  const entry = entryOf(state, slug);
  return entry ? entry.links.flatMap((id) => state.titles[id] ?? []) : [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/links/links-book.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/core/links/links-book.ts tests/core/links/links-book.test.ts
git commit -m "feat: état mémorisé des liens (dictionnaire de titres, fraîcheur 30 jours)"
```

---

### Task 3: Dépôt des liens

**Files:**
- Create: `src/core/links/links-repo.ts`
- Test: `tests/core/links/links-repo.test.ts`

**Interfaces:**
- Consumes: `KeyValueStore`, `BATCH_SIZE`, `EMPTY_LINKS`, `needsLinksLookup`, `setLinks`, `LinksState`.
- Produces: `createLinksRepo`, `LinksRepo`, `LinksFetcher` (signatures ci-dessus). `failed()` vaut `true` pendant les 60 s qui suivent un échec ; les abonnés sont prévenus à chaque écriture **et** à chaque échec.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/links/links-repo.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { LINKS_MAX_AGE_MS, linksOf } from '../../../src/core/links/links-book';
import { createLinksRepo } from '../../../src/core/links/links-repo';

const noSleep = async () => undefined;
const answer = async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, slug === 'Vide' ? [] : ['Pop', `Lien_${slug}`]]));

describe('createLinksRepo', () => {
  it('lit chaque article une fois, y compris sans lien, par lots', async () => {
    const fetchLinks = vi.fn(answer);
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep);

    await repo.resolveMissing(['Kamini', 'Vide']);
    await repo.resolveMissing(['Kamini', 'Vide']);

    expect(fetchLinks).toHaveBeenCalledTimes(1);
    const state = await repo.load();
    expect(linksOf(state, 'Kamini')).toEqual(['Pop', 'Lien_Kamini']);
    expect(Object.keys(state.cards).sort()).toEqual(['Kamini', 'Vide']);
  });

  it('découpe en lots de 50 articles', async () => {
    const fetchLinks = vi.fn(answer);
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep);
    await repo.resolveMissing(Array.from({ length: 120 }, (_, i) => `A${i}`));
    expect(fetchLinks.mock.calls.map(([batch]) => batch.length)).toEqual([50, 50, 20]);
  });

  it('s’arrête à la première erreur, prévient les abonnés, puis attend avant de réessayer', async () => {
    let time = 0;
    const fetchLinks = vi
      .fn<(slugs: string[]) => Promise<Record<string, string[]>>>()
      .mockRejectedValueOnce(new Error('hors ligne'))
      .mockImplementation(answer);
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep, 0, () => time);
    const listener = vi.fn();
    repo.subscribe(listener);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await repo.resolveMissing(['A', 'B']);
    expect(repo.failed()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    await repo.resolveMissing(['A', 'B']);
    expect(fetchLinks).toHaveBeenCalledTimes(1);
    expect((await repo.load()).cards).toEqual({});

    time = 61_000;
    expect(repo.failed()).toBe(false);
    await repo.resolveMissing(['A', 'B']);
    expect(Object.keys((await repo.load()).cards).sort()).toEqual(['A', 'B']);
  });

  it('prévient les abonnés à chaque écriture', async () => {
    const repo = createLinksRepo(createMemoryStore(), answer, noSleep);
    const listener = vi.fn();
    repo.subscribe(listener);
    await repo.resolveMissing(Array.from({ length: 60 }, (_, i) => `A${i}`));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('relit une carte au bout de 30 jours', async () => {
    let time = 0;
    const fetchLinks = vi.fn(answer);
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep, 0, () => time);
    await repo.resolveMissing(['A']);
    time = LINKS_MAX_AGE_MS;
    await repo.resolveMissing(['A']);
    expect(fetchLinks).toHaveBeenCalledTimes(2);
  });

  it('stocke sous sa propre clé, sans toucher aux autres', async () => {
    const store = createMemoryStore();
    await store.set('kinds-v1', { cards: {}, labels: {} });
    const repo = createLinksRepo(store, answer, noSleep);
    await repo.resolveMissing(['A']);
    expect(await store.get('kinds-v1')).toEqual({ cards: {}, labels: {} });
    expect(await store.get('links-v1')).toBeDefined();
  });

  it('traite un stockage plein comme un échec, sans lever', async () => {
    const full = { get: async () => undefined, set: async () => { throw new Error('quota'); } };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const repo = createLinksRepo(full, answer, noSleep);
    await expect(repo.resolveMissing(['A'])).resolves.toBeUndefined();
    expect(repo.failed()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/links/links-repo.test.ts`
Expected: FAIL (module `links-repo` introuvable).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/links/links-repo.ts
import { BATCH_SIZE } from '../birth/wikidata-birth';
import type { KeyValueStore } from '../cache/store';
import { EMPTY_LINKS, needsLinksLookup, setLinks, type LinksState } from './links-book';

const KEY = 'links-v1';
// Après un échec (429, hors ligne, stockage plein), on laisse Wikipédia respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

export type LinksFetcher = (slugs: string[]) => Promise<Record<string, string[]>>;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createLinksRepo(
  store: KeyValueStore,
  fetchLinks: LinksFetcher,
  sleep: (ms: number) => Promise<void> = realSleep,
  gapMs = 150,
  now: () => number = () => Date.now(),
) {
  // Écritures sérialisées ; lectures Wikipédia regroupées en un seul parcours à la fois.
  let writeTail: Promise<unknown> = Promise.resolve();
  const pending = new Set<string>();
  let current: Promise<void> | null = null;
  let failedAt: number | undefined;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  async function read(): Promise<LinksState> {
    return (await store.get<LinksState>(KEY)) ?? EMPTY_LINKS;
  }

  function update(change: (state: LinksState) => LinksState): Promise<void> {
    const run = writeTail.then(async () => {
      await store.set(KEY, change(await read()));
      notify();
    });
    writeTail = run.catch(() => undefined);
    return run;
  }

  async function load(): Promise<LinksState> {
    await writeTail;
    return read();
  }

  async function lookupAll(): Promise<void> {
    try {
      let first = true;
      for (;;) {
        const state = await load();
        const batch = [...pending].filter((candidate) => needsLinksLookup(state, candidate, now())).slice(0, BATCH_SIZE);
        if (batch.length === 0) {
          pending.clear();
          return;
        }
        for (const slug of batch) pending.delete(slug);
        if (!first) await sleep(gapMs);
        first = false;
        try {
          const fetched = await fetchLinks(batch);
          await update((latest) => setLinks(latest, fetched, now()));
        } catch (error) {
          // Hors ligne, 429, stockage plein… : on s'arrête, le reste sera réessayé après le délai de repos.
          console.warn('[wikimasters-tools]', 'liens Wikipédia indisponibles :', error);
          failedAt = now();
          pending.clear();
          notify();
          return;
        }
      }
    } finally {
      current = null;
    }
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load,
    // Vrai pendant la pause qui suit un échec : la vue le signale.
    failed: (): boolean => failedAt !== undefined && now() - failedAt < COOLDOWN_MS,
    resolveMissing(slugs: string[]): Promise<void> {
      if (failedAt !== undefined && now() - failedAt < COOLDOWN_MS) return current ?? Promise.resolve();
      for (const slug of slugs) pending.add(slug);
      current ??= lookupAll();
      return current;
    },
  };
}

export type LinksRepo = ReturnType<typeof createLinksRepo>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/links/links-repo.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/core/links/links-repo.ts tests/core/links/links-repo.test.ts
git commit -m "feat: dépôt des liens Wikipédia (lots de 50, pause après échec)"
```

---

### Task 4: Graphe de la toile

**Files:**
- Create: `src/core/links/web-graph.ts`
- Test: `tests/core/links/web-graph.test.ts`

**Interfaces:**
- Consumes: `KnownCard` (`src/core/collection/collection-book.ts`), `LinksState`, `linksOf` (Task 2), `slugToTitle`.
- Produces: `buildWeb`, `neighborhood`, `cardId`, `hubId`, `WebGraph`, `WebHub`, `Focus`, `MIN_SHARED = 2`, `MAX_HUBS = 300` (signatures ci-dessus). `WebGraph.cards` = les cartes visibles qui ont au moins un trait (point partagé retenu, ou lien vers une autre carte visible), dans l'ordre reçu. `hubs` triés par nombre de cartes décroissant puis titre. `cardLinks` = paires de slugs triées (a < b), sans doublon.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/links/web-graph.test.ts
import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import { EMPTY_LINKS, setLinks } from '../../../src/core/links/links-book';
import { buildWeb, cardId, hubId, neighborhood } from '../../../src/core/links/web-graph';

const card = (slug: string): KnownCard => ({ slug, title: slug.replace(/_/g, ' ') });
const cards = ['Kamini', 'ChansonB', 'Daft_Punk', 'Isolee'].map(card);
const state = setLinks(
  EMPTY_LINKS,
  {
    Kamini: ['Pop', 'Paris', 'France'],
    ChansonB: ['Pop', 'France', 'Daft_Punk'],
    Daft_Punk: ['France', 'Musique_électronique'],
    Isolee: ['Solo'],
  },
  1,
);

describe('buildWeb', () => {
  it('ne garde que les articles cités par au moins deux cartes', () => {
    const web = buildWeb(cards, state, null);
    expect(web.hubs.map((hub) => [hub.slug, hub.cards])).toEqual([
      ['France', ['Kamini', 'ChansonB', 'Daft_Punk']],
      ['Pop', ['Kamini', 'ChansonB']],
    ]);
    expect(web.hubs[0]?.title).toBe('France');
  });

  it('relie deux cartes quand l’une cite l’autre, une seule fois', () => {
    const both = setLinks(state, { Daft_Punk: ['France', 'ChansonB'] }, 2);
    expect(buildWeb(cards, both, null).cardLinks).toEqual([['ChansonB', 'Daft_Punk']]);
  });

  it('ne dessine que les cartes qui ont au moins un trait', () => {
    expect(buildWeb(cards, state, null).cards.map((c) => c.slug)).toEqual(['Kamini', 'ChansonB', 'Daft_Punk']);
  });

  it('ne compte que les cartes visibles : un point qui ne relie plus deux cartes disparaît', () => {
    const web = buildWeb(cards, state, new Set(['Kamini', 'Daft_Punk', 'Isolee']));
    expect(web.hubs.map((hub) => hub.slug)).toEqual(['France']);
    expect(web.cards.map((c) => c.slug)).toEqual(['Kamini', 'Daft_Punk']);
  });

  it('ignore une carte filtrée : ce n’est ni une carte ni un point', () => {
    const web = buildWeb(cards, state, new Set(['Kamini', 'ChansonB']));
    expect(web.cardLinks).toEqual([]);
    expect(web.hubs.map((hub) => hub.slug)).toEqual(['France', 'Pop']);
    expect(web.hubs.flatMap((hub) => hub.cards)).not.toContain('Daft_Punk');
  });

  it('limite le nombre de points affichés aux plus partagés et compte les autres', () => {
    const web = buildWeb(cards, state, null, { minShared: 2, maxHubs: 1 });
    expect(web.hubs.map((hub) => hub.slug)).toEqual(['France']);
    expect(web.hiddenHubs).toBe(1);
    expect(web.cards.map((c) => c.slug)).toEqual(['Kamini', 'ChansonB', 'Daft_Punk']);
  });

  it('rend un graphe vide sans lien connu', () => {
    expect(buildWeb(cards, EMPTY_LINKS, null)).toEqual({ cards: [], hubs: [], cardLinks: [], hiddenHubs: 0 });
  });
});

describe('neighborhood', () => {
  const web = buildWeb(cards, setLinks(state, { Daft_Punk: ['France', 'ChansonB'] }, 2), null);

  it('met en avant un point et ses cartes', () => {
    const { focusId, lit } = neighborhood(web, { kind: 'hub', slug: 'Pop' });
    expect(focusId).toBe(hubId('Pop'));
    expect([...lit].sort()).toEqual([cardId('ChansonB'), cardId('Kamini'), hubId('Pop')].sort());
  });

  it('met en avant une carte, ses points et les cartes qu’elle relie directement', () => {
    const { focusId, lit } = neighborhood(web, { kind: 'card', slug: 'ChansonB' });
    expect(focusId).toBe(cardId('ChansonB'));
    expect([...lit].sort()).toEqual([cardId('ChansonB'), cardId('Daft_Punk'), hubId('France'), hubId('Pop')].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/links/web-graph.test.ts`
Expected: FAIL (module `web-graph` introuvable).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/links/web-graph.ts
import type { KnownCard } from '../collection/collection-book';
import { slugToTitle } from '../market/market-book';
import { linksOf, type LinksState } from './links-book';

export const MIN_SHARED = 2;
// Au-delà, le dessin devient illisible et lent : on garde les points les plus partagés.
export const MAX_HUBS = 300;

export type WebHub = { slug: string; title: string; cards: string[] };
export type WebGraph = {
  // Cartes visibles ayant au moins un trait.
  cards: KnownCard[];
  hubs: WebHub[];
  // Une carte en cite une autre : paires de slugs triées, sans doublon.
  cardLinks: [string, string][];
  // Points partagés non affichés à cause de la limite.
  hiddenHubs: number;
};

export const cardId = (slug: string): string => `c:${slug}`;
export const hubId = (slug: string): string => `h:${slug}`;

const EMPTY_WEB: WebGraph = { cards: [], hubs: [], cardLinks: [], hiddenHubs: 0 };

// Cartes (filtrées par `visible`) reliées par les articles qu'elles citent en commun, ou en se citant entre elles.
// Un article qui est une carte de la Collection n'est jamais un point : il est une carte, ou rien si le filtre l'écarte.
export function buildWeb(
  cards: KnownCard[],
  links: LinksState,
  visible: ReadonlySet<string> | null,
  limits: { minShared: number; maxHubs: number } = { minShared: MIN_SHARED, maxHubs: MAX_HUBS },
): WebGraph {
  const shown = visible ? cards.filter((card) => visible.has(card.slug)) : cards;
  const shownSlugs = new Set(shown.map((card) => card.slug));
  const owned = new Set(cards.map((card) => card.slug));
  const citedBy = new Map<string, string[]>();
  const pairs = new Set<string>();
  const cardLinks: [string, string][] = [];

  for (const card of shown) {
    for (const link of linksOf(links, card.slug)) {
      if (shownSlugs.has(link)) {
        const [a, b] = card.slug < link ? [card.slug, link] : [link, card.slug];
        const key = `${a}\u0000${b}`;
        if (!pairs.has(key)) {
          pairs.add(key);
          cardLinks.push([a, b]);
        }
      } else if (!owned.has(link)) {
        const list = citedBy.get(link);
        if (list) list.push(card.slug);
        else citedBy.set(link, [card.slug]);
      }
    }
  }
  if (citedBy.size === 0 && cardLinks.length === 0) return EMPTY_WEB;

  const shared = [...citedBy]
    .filter(([, list]) => list.length >= limits.minShared)
    .sort(([slugA, a], [slugB, b]) => b.length - a.length || slugA.localeCompare(slugB, 'fr'));
  const hubs = shared.slice(0, limits.maxHubs).map(([slug, list]) => ({ slug, title: slugToTitle(slug), cards: list }));

  const linked = new Set<string>();
  for (const hub of hubs) for (const slug of hub.cards) linked.add(slug);
  for (const [a, b] of cardLinks) {
    linked.add(a);
    linked.add(b);
  }
  return {
    cards: shown.filter((card) => linked.has(card.slug)),
    hubs,
    cardLinks,
    hiddenHubs: shared.length - hubs.length,
  };
}

export type Focus = { kind: 'card' | 'hub'; slug: string };

// Ce qui reste allumé quand on touche un nœud : lui-même et ses voisins directs.
export function neighborhood(graph: WebGraph, focus: Focus): { focusId: string; lit: Set<string> } {
  if (focus.kind === 'hub') {
    const hub = graph.hubs.find((candidate) => candidate.slug === focus.slug);
    const focusId = hubId(focus.slug);
    return { focusId, lit: new Set([focusId, ...(hub?.cards ?? []).map(cardId)]) };
  }
  const focusId = cardId(focus.slug);
  const lit = new Set([focusId]);
  for (const hub of graph.hubs) if (hub.cards.includes(focus.slug)) lit.add(hubId(hub.slug));
  for (const [a, b] of graph.cardLinks) {
    if (a === focus.slug) lit.add(cardId(b));
    else if (b === focus.slug) lit.add(cardId(a));
  }
  return { focusId, lit };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/links/web-graph.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/core/links/web-graph.ts tests/core/links/web-graph.test.ts
git commit -m "feat: graphe de la toile (points partagés, liens entre cartes)"
```

---

### Task 5: Placement du graphe

**Files:**
- Create: `src/core/links/web-layout.ts`
- Test: `tests/core/links/web-layout.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `layoutWeb(nodes, edges, previous = {}, iterations = 220): Record<string, Point>` et `Point`. Déterministe (aucun hasard). Les nœuds présents dans `previous` partent de leur ancienne position (avec une température plus basse) ; les arêtes vers un identifiant inconnu sont ignorées ; avec `iterations = 0` les positions de `previous` sont rendues telles quelles.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/links/web-layout.test.ts
import { describe, expect, it } from 'vitest';
import { layoutWeb, type Point } from '../../../src/core/links/web-layout';

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const star = (hub: string, leaves: number) => ({
  nodes: [{ id: hub }, ...Array.from({ length: leaves }, (_, i) => ({ id: `${hub}-${i}` }))],
  edges: Array.from({ length: leaves }, (_, i) => [hub, `${hub}-${i}`] as const),
});

describe('layoutWeb', () => {
  it('rend un objet vide sans nœud et un point fini pour un seul nœud', () => {
    expect(layoutWeb([], [])).toEqual({});
    const alone = layoutWeb([{ id: 'a' }], [])['a'];
    expect(Number.isFinite(alone?.x)).toBe(true);
    expect(Number.isFinite(alone?.y)).toBe(true);
  });

  it('est déterministe', () => {
    const { nodes, edges } = star('h', 6);
    expect(layoutWeb(nodes, edges)).toEqual(layoutWeb(nodes, edges));
  });

  it('rapproche les nœuds reliés et éloigne les groupes sans lien', () => {
    const a = star('a', 5);
    const b = star('b', 5);
    const positions = layoutWeb([...a.nodes, ...b.nodes], [...a.edges, ...b.edges]);
    const near = (hub: string, leaf: string) => dist(positions[hub] as Point, positions[leaf] as Point);
    const own = Array.from({ length: 5 }, (_, i) => near('a', `a-${i}`));
    const other = Array.from({ length: 5 }, (_, i) => near('b', `a-${i}`));
    const mean = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / list.length;
    expect(mean(own)).toBeLessThan(mean(other));
  });

  it('ne superpose pas deux nœuds', () => {
    const { nodes, edges } = star('h', 12);
    const positions = layoutWeb(nodes, edges);
    const points = nodes.map((node) => positions[node.id] as Point);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) expect(dist(points[i] as Point, points[j] as Point)).toBeGreaterThan(8);
    }
  });

  it('repart des positions précédentes et les rend telles quelles sans itération', () => {
    const positions = layoutWeb([{ id: 'a' }, { id: 'b' }], [['a', 'b']], { a: { x: 5, y: 7 } }, 0);
    expect(positions['a']).toEqual({ x: 5, y: 7 });
    expect(positions['b']).toBeDefined();
  });

  it('garde les anciens nœuds près de leur place quand un nouveau arrive', () => {
    const { nodes, edges } = star('h', 6);
    const first = layoutWeb(nodes, edges);
    const grown = layoutWeb([...nodes, { id: 'h-6' }], [...edges, ['h', 'h-6'] as const], first);
    const moved = nodes.map((node) => dist(first[node.id] as Point, grown[node.id] as Point));
    expect(Math.max(...moved)).toBeLessThan(120);
  });

  it('ignore une arête vers un nœud inconnu', () => {
    const positions = layoutWeb([{ id: 'a' }, { id: 'b' }], [['a', 'zzz'], ['a', 'b']]);
    expect(Object.keys(positions).sort()).toEqual(['a', 'b']);
  });

  it('place un grand graphe en restant fini', { timeout: 20_000 }, () => {
    const nodes = Array.from({ length: 1000 }, (_, i) => ({ id: `n${i}` }));
    const edges = Array.from({ length: 3000 }, (_, i) => [`n${i % 1000}`, `n${(i * 7 + 13) % 1000}`] as const);
    const positions = layoutWeb(nodes, edges);
    for (const node of nodes) {
      const point = positions[node.id] as Point;
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/links/web-layout.test.ts`
Expected: FAIL (module `web-layout` introuvable).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/links/web-layout.ts
export type Point = { x: number; y: number };

// Distance idéale entre deux nœuds reliés ; deux nœuds éloignés de plus de trois fois cette distance ne se repoussent plus
// (la repousse se calcule par cases, pas pour toutes les paires).
const SPRING = 46;
const CUTOFF = 3 * SPRING;
// Rappel vers le centre : garde ensemble les groupes sans lien.
const GRAVITY = 0.02;
const GOLDEN_ANGLE = 2.399963229728653;

const cellKey = (cx: number, cy: number): number => (cx + 4096) * 8192 + (cy + 4096);

// Placement « forces » (Fruchterman et Reingold), sans hasard : le même graphe donne toujours le même dessin.
// Les nœuds déjà placés (`previous`) repartent de leur position, pour que la toile se complète sans tout rebattre.
export function layoutWeb(
  nodes: { id: string }[],
  edges: readonly (readonly [string, string])[],
  previous: Record<string, Point> = {},
  iterations = 220,
): Record<string, Point> {
  const n = nodes.length;
  if (n === 0) return {};
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  let seeded = false;
  nodes.forEach((node, i) => {
    const before = Object.prototype.hasOwnProperty.call(previous, node.id) ? previous[node.id] : undefined;
    if (before) {
      xs[i] = before.x;
      ys[i] = before.y;
      seeded = true;
    } else {
      // Spirale de tournesol : répartition régulière, sans superposition au départ.
      const radius = SPRING * 0.7 * Math.sqrt(i + 1);
      xs[i] = radius * Math.cos(i * GOLDEN_ANGLE);
      ys[i] = radius * Math.sin(i * GOLDEN_ANGLE);
    }
  });

  const from: number[] = [];
  const to: number[] = [];
  for (const [a, b] of edges) {
    const i = index.get(a);
    const j = index.get(b);
    if (i !== undefined && j !== undefined && i !== j) {
      from.push(i);
      to.push(j);
    }
  }

  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const startTemperature = seeded ? SPRING * 0.8 : SPRING * 3;
  for (let step = 0; step < iterations; step++) {
    dx.fill(0);
    dy.fill(0);
    const temperature = startTemperature * (1 - step / iterations) + 0.5;

    const cells = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const key = cellKey(Math.floor(xs[i]! / CUTOFF), Math.floor(ys[i]! / CUTOFF));
      const list = cells.get(key);
      if (list) list.push(i);
      else cells.set(key, [i]);
    }
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(xs[i]! / CUTOFF);
      const cy = Math.floor(ys[i]! / CUTOFF);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const list = cells.get(cellKey(gx, gy));
          if (!list) continue;
          for (const j of list) {
            if (j <= i) continue;
            let ddx = xs[i]! - xs[j]!;
            let ddy = ys[i]! - ys[j]!;
            let squared = ddx * ddx + ddy * ddy;
            if (squared > CUTOFF * CUTOFF) continue;
            if (squared < 1e-6) {
              // Deux nœuds au même endroit : écart minuscule, mais toujours le même.
              ddx = 0.01 + ((i - j) % 7) * 0.001;
              ddy = 0.01;
              squared = ddx * ddx + ddy * ddy;
            }
            const distance = Math.sqrt(squared);
            const force = (SPRING * SPRING) / distance;
            const fx = (ddx / distance) * force;
            const fy = (ddy / distance) * force;
            dx[i]! += fx;
            dy[i]! += fy;
            dx[j]! -= fx;
            dy[j]! -= fy;
          }
        }
      }
    }
    for (let e = 0; e < from.length; e++) {
      const a = from[e]!;
      const b = to[e]!;
      const ddx = xs[a]! - xs[b]!;
      const ddy = ys[a]! - ys[b]!;
      const distance = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
      const force = (distance * distance) / SPRING;
      const fx = (ddx / distance) * force;
      const fy = (ddy / distance) * force;
      dx[a]! -= fx;
      dy[a]! -= fy;
      dx[b]! += fx;
      dy[b]! += fy;
    }
    for (let i = 0; i < n; i++) {
      dx[i]! -= xs[i]! * GRAVITY;
      dy[i]! -= ys[i]! * GRAVITY;
      const length = Math.hypot(dx[i]!, dy[i]!);
      if (length > 0) {
        const scale = Math.min(length, temperature) / length;
        xs[i]! += dx[i]! * scale;
        ys[i]! += dy[i]! * scale;
      }
    }
  }

  const positions: Record<string, Point> = {};
  nodes.forEach((node, i) => {
    positions[node.id] = { x: xs[i]!, y: ys[i]! };
  });
  return positions;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/links/web-layout.test.ts`
Expected: PASS (8 tests). Si « rapproche les nœuds reliés » échoue, ajuster `GRAVITY` / `SPRING` (jamais le test) puis relancer.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/core/links/web-layout.ts tests/core/links/web-layout.test.ts
git commit -m "feat: placement par forces du graphe de la toile"
```

---

### Task 6: Zoom et déplacement

**Files:**
- Create: `src/core/links/web-view.ts`
- Test: `tests/core/links/web-view.test.ts`

**Interfaces:**
- Consumes: `Point` (Task 5).
- Produces: `Transform`, `Bounds`, `IDENTITY`, `MIN_ZOOM`, `MAX_ZOOM`, `ZOOM_STEP`, `clampZoom`, `boundsOf(points: Point[]): Bounds | null`, `zoomAt(t, factor, cx, cy)`, `pinch(start, from, to)`, `fitTransform(bounds, width, height, margin?)`. Convention : un point `p` du graphe s'affiche en `(t.x + p.x * t.k, t.y + p.y * t.k)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/links/web-view.test.ts
import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, boundsOf, clampZoom, fitTransform, pinch, zoomAt } from '../../../src/core/links/web-view';

describe('zoomAt', () => {
  it('garde sous le point visé le point du graphe qui s’y trouvait', () => {
    const before = { x: 30, y: -10, k: 1 };
    const after = zoomAt(before, 2, 100, 80);
    const graphPoint = { x: (100 - before.x) / before.k, y: (80 - before.y) / before.k };
    expect(after.k).toBe(2);
    expect(after.x + graphPoint.x * after.k).toBeCloseTo(100);
    expect(after.y + graphPoint.y * after.k).toBeCloseTo(80);
  });

  it('borne le zoom', () => {
    expect(zoomAt({ x: 0, y: 0, k: 1 }, 1000, 0, 0).k).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, k: 1 }, 0.0001, 0, 0).k).toBe(MIN_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });
});

describe('boundsOf / fitTransform', () => {
  it('rend null sans point', () => {
    expect(boundsOf([])).toBeNull();
  });

  it('cadre l’ensemble des points au centre de la zone', () => {
    const bounds = boundsOf([{ x: -100, y: -50 }, { x: 100, y: 50 }]);
    expect(bounds).toEqual({ minX: -100, minY: -50, maxX: 100, maxY: 50 });
    const t = fitTransform(bounds, 400, 300, 0);
    expect(t.k).toBeCloseTo(1.5);
    expect(t.x + 0 * t.k).toBeCloseTo(200);
    expect(t.y + 0 * t.k).toBeCloseTo(150);
  });

  it('ne dépasse pas un zoom confortable pour un petit graphe et centre une zone vide', () => {
    const t = fitTransform(boundsOf([{ x: 5, y: 5 }]), 400, 300);
    expect(t.k).toBeLessThanOrEqual(1.5);
    expect(fitTransform(null, 400, 300)).toEqual({ x: 200, y: 150, k: 1 });
  });
});

describe('pinch', () => {
  const start = { x: 10, y: 20, k: 1 };
  const from: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 100, y: 100 }, { x: 200, y: 100 }];

  it('ne change rien quand les doigts ne bougent pas', () => {
    expect(pinch(start, from, from)).toEqual(start);
  });

  it('déplace quand les doigts glissent ensemble', () => {
    const to: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 130, y: 90 }, { x: 230, y: 90 }];
    expect(pinch(start, from, to)).toEqual({ x: 40, y: 10, k: 1 });
  });

  it('zoome quand les doigts s’écartent, autour de leur milieu', () => {
    const to: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 50, y: 100 }, { x: 250, y: 100 }];
    const t = pinch(start, from, to);
    expect(t.k).toBe(2);
    const graphPoint = { x: (150 - start.x) / start.k, y: (100 - start.y) / start.k };
    expect(t.x + graphPoint.x * t.k).toBeCloseTo(150);
    expect(t.y + graphPoint.y * t.k).toBeCloseTo(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/links/web-view.test.ts`
Expected: FAIL (module `web-view` introuvable).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/links/web-view.ts
import type { Point } from './web-layout';

// Un point `p` du graphe s'affiche en (x + p.x * k, y + p.y * k).
export type Transform = { x: number; y: number; k: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export const IDENTITY: Transform = { x: 0, y: 0, k: 1 };
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const ZOOM_STEP = 1.4;
// Un petit graphe n'est pas agrandi au-delà : il resterait énorme et creux.
const MAX_FIT_ZOOM = 1.5;

export const clampZoom = (k: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

export function boundsOf(points: Point[]): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

// Zoom autour d'un point de l'écran : le point du graphe qui s'y trouve y reste.
export function zoomAt(t: Transform, factor: number, cx: number, cy: number): Transform {
  const k = clampZoom(t.k * factor);
  const ratio = k / t.k;
  return { k, x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio };
}

// Deux doigts : l'écart règle le zoom, le déplacement de leur milieu règle le glissement.
export function pinch(start: Transform, from: [Point, Point], to: [Point, Point]): Transform {
  const before = Math.hypot(from[1].x - from[0].x, from[1].y - from[0].y);
  const after = Math.hypot(to[1].x - to[0].x, to[1].y - to[0].y);
  const k = clampZoom(start.k * (before < 1 ? 1 : after / before));
  const ratio = k / start.k;
  const fromMid = { x: (from[0].x + from[1].x) / 2, y: (from[0].y + from[1].y) / 2 };
  const toMid = { x: (to[0].x + to[1].x) / 2, y: (to[0].y + to[1].y) / 2 };
  return { k, x: toMid.x - (fromMid.x - start.x) * ratio, y: toMid.y - (fromMid.y - start.y) * ratio };
}

// Tout le graphe visible, centré dans la zone.
export function fitTransform(bounds: Bounds | null, width: number, height: number, margin = 48): Transform {
  if (!bounds) return { x: width / 2, y: height / 2, k: 1 };
  const w = Math.max(bounds.maxX - bounds.minX, 1);
  const h = Math.max(bounds.maxY - bounds.minY, 1);
  const k = clampZoom(Math.min((width - 2 * margin) / w, (height - 2 * margin) / h, MAX_FIT_ZOOM));
  return { k, x: width / 2 - (bounds.minX + w / 2) * k, y: height / 2 - (bounds.minY + h / 2) * k };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/links/web-view.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/core/links/web-view.ts tests/core/links/web-view.test.ts
git commit -m "feat: zoom et déplacement de la toile (pincer, molette, cadrage)"
```

---

### Task 7: Panneau de la vue Toile

**Files:**
- Create: `src/content/useFilteredCards.ts`
- Create: `src/content/WebPanel.tsx`
- Test: `tests/content/web-panel.test.tsx`

**Interfaces:**
- Consumes: Tasks 2–6 ; `CollectionRepo`, `CollectionScanner`, `KindsRepo`, `KindFilterSource`, `CollectionFilterSource`, `MarketSource`, `PriceBook`, `CardPopup`, `toCardPreview`, `cardMarket`, `useWantPrices`, `useNowPlayingSlugs`, `useKindState`, `createThrottledLoader`, `filterLocally`, `kindSlugs`, `intersectSlugs`, `IDLE_SCAN`.
- Produces: `WebPanel(props: Props)` avec `Props = { collection; links: LinksRepo; kinds; kindFilterSource; scanner; book; market; filterSource; loadFiltered; onOpen(slug); onOpenCard(slug); onWantCards(cards) }` ; `useFilteredCards(args)` → `{ cards: KnownCard[]; visible: Set<string> | null; filtering: boolean; filterError: boolean }`.
- DOM testable : chaque carte dessinée est un `<g data-card="<slug>">`, chaque point un `<g data-hub="<slug>">` ; le panneau est dans un `<div data-wmt-web>`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/content/web-panel.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnownCard } from '../../src/core/collection/collection-book';
import type { CollectionRepo } from '../../src/core/collection/collection-repo';
import { IDLE_SCAN, type CollectionScanner } from '../../src/core/collection/collection-scan';
import { EMPTY_KINDS } from '../../src/core/kinds/kinds-book';
import type { KindsRepo } from '../../src/core/kinds/kinds-repo';
import { EMPTY_LINKS, setLinks, type LinksState } from '../../src/core/links/links-book';
import type { LinksRepo } from '../../src/core/links/links-repo';
import type { CollectionFilterSource } from '../../src/content/collection-filter';
import { createKindFilterSource } from '../../src/content/kind-filter';
import { createMarketSource } from '../../src/content/market-source';
import { WebPanel } from '../../src/content/WebPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cards: KnownCard[] = ['Kamini', 'ChansonB', 'Daft_Punk', 'Air', 'Isolee'].map((slug) => ({ slug, title: slug.replace(/_/g, ' '), rarity: 'C' }));
const linked: LinksState = setLinks(
  EMPTY_LINKS,
  { Kamini: ['Pop'], ChansonB: ['Pop'], Daft_Punk: ['Musique_électronique'], Air: ['Musique_électronique'], Isolee: ['Solo'] },
  Date.now(),
);

let container: HTMLDivElement;
let root: Root;
const onOpen = vi.fn();
const onOpenCard = vi.fn();
const resolveMissing = vi.fn(async () => undefined);

async function mount(state: LinksState = linked, failed = false, collected: KnownCard[] = cards) {
  const noSubscribe = () => () => undefined;
  root = createRoot(container);
  await act(async () => {
    root.render(
      <WebPanel
        collection={{ snapshot: () => collected, list: async () => collected, subscribe: noSubscribe } as unknown as CollectionRepo}
        links={{ load: async () => state, subscribe: noSubscribe, resolveMissing, failed: () => failed } as unknown as LinksRepo}
        scanner={{ snapshot: () => IDLE_SCAN, state: async () => IDLE_SCAN, subscribe: noSubscribe } as unknown as CollectionScanner}
        kinds={{ load: async () => EMPTY_KINDS, subscribe: noSubscribe } as unknown as KindsRepo}
        kindFilterSource={createKindFilterSource({ getItem: () => null, setItem: () => undefined })}
        book={null}
        market={createMarketSource().source}
        filterSource={{ current: () => '', subscribe: noSubscribe } as unknown as CollectionFilterSource}
        loadFiltered={async () => new Set()}
        onOpen={onOpen}
        onOpenCard={onOpenCard}
        onWantCards={vi.fn()}
      />,
    );
  });
}

const click = (element: Element | null) => act(async () => (element as SVGElement | HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })));
const card = (slug: string) => container.querySelector(`[data-card="${slug}"]`);
const hub = (slug: string) => container.querySelector(`[data-hub="${slug}"]`);

beforeEach(() => {
  onOpen.mockClear();
  onOpenCard.mockClear();
  resolveMissing.mockClear();
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('WebPanel', () => {
  it('dessine les cartes reliées par un article partagé, sans la carte isolée', async () => {
    await mount();
    expect([...container.querySelectorAll('[data-card]')].map((el) => el.getAttribute('data-card')).sort()).toEqual(['Air', 'ChansonB', 'Daft_Punk', 'Kamini']);
    expect([...container.querySelectorAll('[data-hub]')].map((el) => el.getAttribute('data-hub')).sort()).toEqual(['Musique_électronique', 'Pop']);
    expect(container.querySelectorAll('line')).toHaveLength(4);
  });

  it('demande la lecture des liens des cartes pas encore lues', async () => {
    await mount(setLinks(EMPTY_LINKS, { Kamini: ['Pop'] }, Date.now()));
    expect(resolveMissing).toHaveBeenCalledWith(['ChansonB', 'Daft_Punk', 'Air', 'Isolee']);
  });

  it('annonce la progression de la lecture', async () => {
    await mount(setLinks(EMPTY_LINKS, { Kamini: ['Pop'], ChansonB: ['Pop'] }, Date.now()));
    expect(container.textContent).toContain('2 / 5');
  });

  it('signale quand Wikipédia est indisponible', async () => {
    await mount(EMPTY_LINKS, true);
    expect(container.textContent).toContain('indisponible');
  });

  it('toucher une carte affiche la carte comme dans la vue Monde, avec le marché et la carte du jeu', async () => {
    await mount();
    await click(card('Kamini'));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-label')).toBe('Kamini');

    await click(document.querySelector('button[aria-label="Ouvrir la carte"]'));
    expect(onOpenCard).toHaveBeenCalledWith('Kamini');
    await click(card('Kamini'));
    await click(document.querySelector('button[aria-label="Voir le marché"]'));
    expect(onOpen).toHaveBeenCalledWith('Kamini');
  });

  it('toucher un point met en avant ses cartes et atténue le reste', async () => {
    await mount();
    await click(hub('Pop'));
    expect((card('Kamini') as SVGElement).style.opacity).toBe('1');
    expect((card('Air') as SVGElement).style.opacity).toBe('0.2');
    expect(container.textContent).toContain('Pop');
    expect(container.textContent).toContain('Kamini, ChansonB');
    await click(container.querySelector('svg'));
    expect((card('Air') as SVGElement).style.opacity).toBe('1');
  });

  it('invite à parcourir la Collection quand aucune carte n’est connue', async () => {
    await mount(EMPTY_LINKS, false, []);
    expect(container.textContent).toContain('Aucune carte connue');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/web-panel.test.tsx`
Expected: FAIL (module `WebPanel` introuvable).

- [ ] **Step 3: Write minimal implementation**

`src/content/useFilteredCards.ts` — la logique de filtre de `TimelinePanel` / `WorldPanel`, reprise à l'identique :

```ts
// src/content/useFilteredCards.ts
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import type { CollectionRepo } from '../core/collection/collection-repo';
import { IDLE_SCAN, type CollectionScanner, type ScanState } from '../core/collection/collection-scan';
import { filterLocally } from '../core/collection/local-filter';
import { intersectSlugs, kindSlugs } from '../core/kinds/kinds-filter';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { CollectionFilterSource } from './collection-filter';
import type { KindFilterSource } from './kind-filter';
import { createThrottledLoader } from './throttle';
import { useKindState } from './useKindState';

type Args = {
  collection: CollectionRepo;
  scanner: CollectionScanner;
  kinds: KindsRepo;
  kindFilterSource: KindFilterSource;
  filterSource: CollectionFilterSource;
  loadFiltered: (filter: string, isCancelled: () => boolean) => Promise<Set<string>>;
};

// Les cartes de la Collection, et celles qui passent les filtres de la page (site, nature / occupation, ×2).
// `visible` vaut null tant qu'aucun filtre n'est actif (ou que sa lecture n'est pas finie) : toutes les cartes.
export function useFilteredCards({ collection, scanner, kinds, kindFilterSource, filterSource, loadFiltered }: Args) {
  const [cards, setCards] = useState<KnownCard[]>([]);
  const [scan, setScan] = useState<ScanState>(IDLE_SCAN);
  const [filter, setFilter] = useState(() => filterSource.current());
  const [allowed, setAllowed] = useState<{ filter: string; slugs: Set<string> } | null>(null);
  const [filterError, setFilterError] = useState(false);

  useEffect(() => {
    let alive = true;
    const loadCards = () => void collection.list().then((list) => alive && setCards(list));
    const loadScan = () => void scanner.state().then((state) => alive && setScan(state));
    const cardsReload = createThrottledLoader(loadCards, 1000);
    loadCards();
    loadScan();
    const offCollection = collection.subscribe(cardsReload.call);
    const offScan = scanner.subscribe(loadScan);
    return () => {
      alive = false;
      cardsReload.cancel();
      offCollection();
      offScan();
    };
  }, [collection, scanner]);

  useEffect(() => filterSource.subscribe(() => setFilter(filterSource.current())), [filterSource]);

  // Collection entièrement scannée et filtre simple (rareté, étiquette) : les cartes sont déjà connues, pas de requête.
  const localSlugs = useMemo(
    () => (filter && scan.status === 'done' ? filterLocally(cards, filter) : null),
    [filter, scan.status, cards],
  );
  // Une sélection déjà lue est gardée : la retrouver est instantané.
  const filterCache = useRef(new Map<string, Set<string>>());

  useEffect(() => {
    setFilterError(false);
    if (!filter || localSlugs) return;
    const cached = filterCache.current.get(filter);
    if (cached) {
      setAllowed({ filter, slugs: cached });
      return;
    }
    let cancelled = false;
    loadFiltered(filter, () => cancelled)
      .then((slugs) => {
        if (cancelled) return;
        filterCache.current.set(filter, slugs);
        setAllowed({ filter, slugs });
      })
      .catch(() => !cancelled && setFilterError(true));
    return () => {
      cancelled = true;
    };
  }, [filter, loadFiltered, localSlugs]);

  const nativeVisible = localSlugs ?? (filter && allowed?.filter === filter ? allowed.slugs : null);
  const { kindsState, kindFilter } = useKindState(kinds, kindFilterSource);
  const kindVisible = useMemo(() => kindSlugs(cards, kindsState, kindFilter), [cards, kindsState, kindFilter]);
  // Filtre du site (étiquette, rareté) et filtre nature / occupation : une carte doit passer les deux.
  const visible = useMemo(() => intersectSlugs(nativeVisible, kindVisible), [nativeVisible, kindVisible]);
  const filtering = Boolean(filter) && nativeVisible === null && !filterError;
  return { cards, visible, filtering, filterError };
}
```

`src/content/WebPanel.tsx` :

```tsx
// src/content/WebPanel.tsx
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import { cardMarket, toCardPreview } from '../core/collection/card-preview';
import type { CollectionRepo } from '../core/collection/collection-repo';
import type { CollectionScanner } from '../core/collection/collection-scan';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { EMPTY_LINKS, needsLinksLookup, type LinksState } from '../core/links/links-book';
import type { LinksRepo } from '../core/links/links-repo';
import { buildWeb, cardId, hubId, neighborhood, type Focus, type WebGraph } from '../core/links/web-graph';
import { layoutWeb, type Point } from '../core/links/web-layout';
import { ZOOM_STEP, boundsOf, fitTransform, pinch, zoomAt, type Transform } from '../core/links/web-view';
import type { PriceBook } from '../core/pricing/price-book';
import type { Rect } from './card-popup-position';
import { CardPopup } from './CardPopup';
import type { CollectionFilterSource } from './collection-filter';
import type { KindFilterSource } from './kind-filter';
import type { MarketSource } from './market-source';
import { createThrottledLoader } from './throttle';
import { useFilteredCards } from './useFilteredCards';
import { useNowPlayingSlugs } from './useNowPlayingSlugs';
import { useWantPrices } from './useWantPrices';

type Props = {
  collection: CollectionRepo;
  links: LinksRepo;
  kinds: KindsRepo;
  kindFilterSource: KindFilterSource;
  scanner: CollectionScanner;
  book: PriceBook | null;
  market: MarketSource;
  filterSource: CollectionFilterSource;
  loadFiltered: (filter: string, isCancelled: () => boolean) => Promise<Set<string>>;
  // Fiche de marché de la carte.
  onOpen: (slug: string) => void;
  onOpenCard: (slug: string) => void;
  // Cartes affichées dont les prix du marché sont à relever.
  onWantCards: (cards: KnownCard[]) => void;
};

const CARD = 34;
const RETRY_MS = 30_000;
// Au-delà de cette distance (px), un doigt ou une souris qui bouge déplace la toile au lieu de toucher un nœud.
const DRAG_SLOP = 5;
const FADED = 0.2;
// Les plus partagés gardent leur nom même dézoomés.
const ALWAYS_LABELLED = 12;

const box = {
  border: '1px solid var(--color-border, rgba(148,163,184,0.35))',
  borderRadius: 12,
  background: 'var(--color-surface, #0d1117)',
  color: 'var(--color-foreground, #e6edf3)',
  font: '14px/20px system-ui, sans-serif',
} as const;

const glyphButton = {
  width: 40,
  height: 40,
  cursor: 'pointer',
  font: '600 18px/1 system-ui, sans-serif',
  color: 'inherit',
  background: 'var(--color-surface, #0d1117)',
  border: '1px solid var(--color-border, rgba(148,163,184,0.5))',
  borderRadius: 8,
} as const;

const rarityColor = (card: KnownCard) => (card.rarity ? `var(--color-rarity-${card.rarity.toLowerCase()}, #34d399)` : '#34d399');
const initials = (title: string) => title.slice(0, 2);
const halo = { paintOrder: 'stroke', stroke: 'var(--color-surface, #0d1117)', strokeWidth: 3, strokeLinejoin: 'round' } as const;

type GraphProps = {
  graph: WebGraph;
  positions: Record<string, Point>;
  focusId: string | null;
  lit: ReadonlySet<string> | null;
  // 0 : dézoomé, 1 : zoom moyen, 2 : zoomé (plus il y a de zoom, plus il y a de noms).
  labels: 0 | 1 | 2;
  onCard: (slug: string, target: Element) => void;
  onHub: (slug: string) => void;
};

// Les nœuds ne se redessinent que si le graphe, le placement, la mise en avant ou le niveau de noms changent : glisser ne les touche pas.
const WebGraphView = memo(function WebGraphView({ graph, positions, focusId, lit, labels, onCard, onHub }: GraphProps) {
  const at = (id: string): Point => positions[id] ?? { x: 0, y: 0 };
  const opacityOf = (id: string) => (lit && !lit.has(id) ? FADED : 1);
  return (
    <>
      <g stroke="rgba(148,163,184,0.45)" strokeWidth={1} style={{ vectorEffect: 'non-scaling-stroke' }}>
        {graph.hubs.flatMap((hub) =>
          hub.cards.map((slug) => {
            const a = at(hubId(hub.slug));
            const b = at(cardId(slug));
            const on = focusId === hubId(hub.slug) || focusId === cardId(slug);
            return (
              <line
                key={`${hub.slug}\u0000${slug}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                style={{ vectorEffect: 'non-scaling-stroke', opacity: lit ? (on ? 1 : 0.06) : 1 }}
                stroke={on ? 'var(--color-accent, #34d399)' : undefined}
              />
            );
          }),
        )}
        {graph.cardLinks.map(([first, second]) => {
          const a = at(cardId(first));
          const b = at(cardId(second));
          const on = focusId === cardId(first) || focusId === cardId(second);
          return (
            <line
              key={`${first}\u0000${second}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              strokeDasharray="4 3"
              style={{ vectorEffect: 'non-scaling-stroke', opacity: lit ? (on ? 1 : 0.06) : 1 }}
              stroke={on ? 'var(--color-accent, #34d399)' : undefined}
            />
          );
        })}
      </g>
      {graph.hubs.map((hub, index) => {
        const { x, y } = at(hubId(hub.slug));
        const radius = Math.min(14, 4 + 2 * Math.sqrt(hub.cards.length));
        const named = index < ALWAYS_LABELLED || labels >= 2 || (labels >= 1 && hub.cards.length >= 3) || lit?.has(hubId(hub.slug));
        return (
          <g
            key={hub.slug}
            data-hub={hub.slug}
            transform={`translate(${x} ${y})`}
            style={{ cursor: 'pointer', opacity: opacityOf(hubId(hub.slug)) }}
            onClick={(event) => {
              event.stopPropagation();
              onHub(hub.slug);
            }}
          >
            <title>{`${hub.title} · ${hub.cards.length} cartes`}</title>
            <circle r={radius} fill="var(--color-hub, #8b949e)" stroke="var(--color-surface, #0d1117)" strokeWidth={1.5} />
            {named && (
              <text y={-radius - 4} textAnchor="middle" fontSize={11} fill="currentColor" style={halo}>
                {hub.title}
              </text>
            )}
          </g>
        );
      })}
      {graph.cards.map((card) => {
        const { x, y } = at(cardId(card.slug));
        const named = labels >= 2 || lit?.has(cardId(card.slug));
        return (
          <g
            key={card.slug}
            data-card={card.slug}
            transform={`translate(${x} ${y})`}
            style={{ cursor: 'pointer', opacity: opacityOf(cardId(card.slug)) }}
            onClick={(event) => {
              event.stopPropagation();
              onCard(card.slug, event.currentTarget);
            }}
          >
            <title>{card.title}</title>
            <rect x={-CARD / 2} y={-CARD / 2} width={CARD} height={CARD} fill="rgba(148,163,184,0.25)" />
            {card.imageUrl ? (
              <image href={card.imageUrl} x={-CARD / 2} y={-CARD / 2} width={CARD} height={CARD} preserveAspectRatio="xMidYMid slice" />
            ) : (
              <text textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600} fill="currentColor">
                {initials(card.title)}
              </text>
            )}
            <rect x={-CARD / 2} y={-CARD / 2} width={CARD} height={CARD} fill="none" stroke={rarityColor(card)} strokeWidth={2} />
            {named && (
              <text y={CARD / 2 + 13} textAnchor="middle" fontSize={11} fill="currentColor" style={halo}>
                {card.title}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
});

export function WebPanel({ collection, links, kinds, kindFilterSource, scanner, book, market, filterSource, loadFiltered, onOpen, onOpenCard, onWantCards }: Props) {
  const { cards, visible, filtering, filterError } = useFilteredCards({ collection, scanner, kinds, kindFilterSource, filterSource, loadFiltered });
  const [linksState, setLinksState] = useState<LinksState>(EMPTY_LINKS);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [picked, setPicked] = useState<{ slug: string; anchor: Rect } | null>(null);
  // null : la toile est cadrée toute seule (elle grandit pendant la lecture) ; sinon, le zoom et le glissement de l'utilisateur.
  const [view, setView] = useState<Transform | null>(null);
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () => void links.load().then((state) => alive && setLinksState(state));
    const reload = createThrottledLoader(load, 1000);
    load();
    const off = links.subscribe(reload.call);
    return () => {
      alive = false;
      reload.cancel();
      off();
    };
  }, [links]);

  // Lecture des liens : les cartes affichées d'abord, puis le reste de la Collection ; nouvel essai régulier après un échec.
  const missing = useMemo(() => {
    const now = Date.now();
    const ordered = visible ? [...cards.filter((card) => visible.has(card.slug)), ...cards.filter((card) => !visible.has(card.slug))] : cards;
    return ordered.filter((card) => needsLinksLookup(linksState, card.slug, now)).map((card) => card.slug);
  }, [cards, visible, linksState]);
  useEffect(() => {
    if (missing.length === 0) return;
    void links.resolveMissing(missing);
    const timer = window.setInterval(() => void links.resolveMissing(missing), RETRY_MS);
    return () => window.clearInterval(timer);
  }, [missing, links]);

  const graph = useMemo(() => buildWeb(cards, linksState, visible), [cards, linksState, visible]);

  // Le nouveau placement repart du précédent : la toile se complète sans tout rebattre.
  const previous = useRef<Record<string, Point>>({});
  const positions = useMemo(() => {
    const nodes = [...graph.cards.map((card) => ({ id: cardId(card.slug) })), ...graph.hubs.map((hub) => ({ id: hubId(hub.slug) }))];
    const edges = [
      ...graph.hubs.flatMap((hub) => hub.cards.map((slug) => [hubId(hub.slug), cardId(slug)] as const)),
      ...graph.cardLinks.map(([a, b]) => [cardId(a), cardId(b)] as const),
    ];
    return layoutWeb(nodes, edges, previous.current);
  }, [graph]);
  useEffect(() => {
    previous.current = positions;
  }, [positions]);

  const transform = useMemo(
    () => view ?? fitTransform(boundsOf(Object.values(positions)), size.width, size.height),
    [view, positions, size],
  );
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // Taille réelle de la zone (pixels écran) : le dessin et les gestes se calculent dans la même unité.
  useLayoutEffect(() => {
    const measure = () => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) setSize({ width: rect.width, height: rect.height });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Ctrl + molette (ou pincer du pavé tactile) : zoom ; la molette seule fait défiler la page.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      setView(zoomAt(transformRef.current, event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, event.clientX - rect.left, event.clientY - rect.top));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  // Glisser (un doigt ou la souris) et pincer (deux doigts) ; un geste qui a bougé ne compte pas comme un toucher.
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ start: Transform; from: Point[]; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };
  const restart = () => {
    gesture.current = pointers.current.size > 0 ? { start: transformRef.current, from: [...pointers.current.values()], moved: false } : null;
  };
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (pointers.current.size === 0) dragged.current = false;
    pointers.current.set(event.pointerId, local(event));
    restart();
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = gesture.current;
    if (!current || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, local(event));
    const now = [...pointers.current.values()];
    if (now.length >= 2 && current.from.length >= 2) {
      dragged.current = true;
      setView(pinch(current.start, [current.from[0] as Point, current.from[1] as Point], [now[0] as Point, now[1] as Point]));
    } else if (now.length === 1 && current.from.length === 1) {
      const dx = (now[0] as Point).x - (current.from[0] as Point).x;
      const dy = (now[0] as Point).y - (current.from[0] as Point).y;
      if (!current.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
      current.moved = true;
      dragged.current = true;
      setView({ ...current.start, x: current.start.x + dx, y: current.start.y + dy });
    }
  };
  const onPointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (pointers.current.delete(event.pointerId)) restart();
  };

  const zoomBy = (factor: number) => setView(zoomAt(transform, factor, size.width / 2, size.height / 2));

  // Identité stable : sinon `WebGraphView` (mémoïsée) se redessinerait à chaque glissement.
  const onCard = useCallback((slug: string, target: Element) => {
    if (dragged.current) return;
    const { left, right, top, bottom } = target.getBoundingClientRect();
    setFocus(null);
    setPicked({ slug, anchor: { left, right, top, bottom } });
  }, []);
  const onHub = useCallback((slug: string) => {
    if (dragged.current) return;
    setPicked(null);
    setFocus((current) => (current?.kind === 'hub' && current.slug === slug ? null : { kind: 'hub', slug }));
  }, []);

  const lighting = useMemo(() => {
    const active: Focus | null = picked ? { kind: 'card', slug: picked.slug } : focus;
    return active ? neighborhood(graph, active) : null;
  }, [graph, focus, picked]);

  const pickedCard = picked ? cards.find((card) => card.slug === picked.slug) : undefined;
  const marketNow = useSyncExternalStore(market.subscribe, market.snapshot);
  const pickedCards = useMemo(() => (pickedCard ? [pickedCard] : []), [pickedCard]);
  const nowPlaying = useNowPlayingSlugs(pickedCards);
  const pickedPreview = useMemo(
    () =>
      pickedCard
        ? toCardPreview(
            pickedCard,
            book?.byTitle(pickedCard.title) ?? null,
            cardMarket(marketNow.history, marketNow.pending, pickedCard.slug, Date.now()),
            nowPlaying.has(pickedCard.slug),
          )
        : null,
    [pickedCard, book, marketNow, nowPlaying],
  );
  // Toutes les cartes affichées (filtre compris) ont leurs prix relevés, sans parcourir les pages à la main.
  const shown = useMemo(() => (visible ? cards.filter((card) => visible.has(card.slug)) : cards), [cards, visible]);
  useWantPrices(shown, onWantCards);

  const focusedHub = focus?.kind === 'hub' ? graph.hubs.find((hub) => hub.slug === focus.slug) : undefined;
  const titleOf = (slug: string) => cards.find((card) => card.slug === slug)?.title ?? slug;
  const read = cards.length - cards.filter((card) => needsLinksLookup(linksState, card.slug, Date.now())).length;
  const labels = transform.k >= 1.6 ? 2 : transform.k >= 0.9 ? 1 : 0;

  return (
    <div data-wmt-web="" style={{ ...box, padding: 12, margin: '12px 0' }}>
      <div style={{ position: 'relative', height: '70vh', minHeight: 420, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border, rgba(148,163,184,0.25))' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${size.width} ${size.height}`}
          width="100%"
          height="100%"
          role="group"
          aria-label="Toile des cartes de la Collection"
          style={{ display: 'block', touchAction: 'none', userSelect: 'none', cursor: 'grab' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={onPointerEnd}
          onClick={() => {
            if (dragged.current) return;
            setFocus(null);
            setPicked(null);
          }}
        >
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
            <WebGraphView
              graph={graph}
              positions={positions}
              focusId={lighting?.focusId ?? null}
              lit={lighting?.lit ?? null}
              labels={labels}
              onCard={onCard}
              onHub={onHub}
            />
          </g>
        </svg>
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button type="button" aria-label="Zoomer" title="Zoomer (Ctrl + molette)" onClick={() => zoomBy(ZOOM_STEP)} style={glyphButton}>
            +
          </button>
          <button type="button" aria-label="Dézoomer" title="Dézoomer (Ctrl + molette)" onClick={() => zoomBy(1 / ZOOM_STEP)} style={glyphButton}>
            −
          </button>
          <button type="button" aria-label="Tout voir" title="Tout voir" onClick={() => setView(null)} style={glyphButton}>
            ⤢
          </button>
        </div>
      </div>
      {focusedHub && (
        <p style={{ margin: '8px 0 0', fontSize: 13 }}>
          <strong>{focusedHub.title}</strong> relie {focusedHub.cards.length} cartes : {focusedHub.cards.map(titleOf).join(', ')}.
        </p>
      )}
      <p style={{ margin: '8px 0 0', opacity: 0.7, fontSize: 12 }}>
        {filtering && 'Filtre en cours de lecture… '}
        {filterError && 'Filtre illisible : toutes les cartes sont affichées. '}
        {visible && `Filtre actif : ${visible.size} cartes. `}
        {cards.length === 0
          ? 'Aucune carte connue : parcourez la Collection pour que l’extension les découvre.'
          : `Liens lus : ${read} / ${cards.length} cartes. ${graph.cards.length} cartes reliées par ${graph.hubs.length} articles partagés${graph.cardLinks.length > 0 ? ` et ${graph.cardLinks.length} liens entre cartes` : ''}.`}
        {graph.hiddenHubs > 0 && ` ${graph.hiddenHubs} articles moins partagés ne sont pas affichés.`}
        {cards.length > 0 && read < cards.length && (links.failed() ? ' Wikipédia est indisponible pour l’instant : nouvel essai automatique.' : ' Lecture en cours…')}
        {cards.length > 0 && read === cards.length && graph.cards.length === 0 && ' Aucun article n’est cité par au moins deux de vos cartes pour l’instant.'}
      </p>
      {picked && pickedCard && pickedPreview && (
        <CardPopup
          preview={pickedPreview}
          anchor={picked.anchor}
          onOpen={() => {
            setPicked(null);
            onOpen(pickedCard.slug);
          }}
          onOpenCard={() => {
            setPicked(null);
            onOpenCard(pickedCard.slug);
          }}
          onClose={() => setPicked(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/content/web-panel.test.tsx && npm run typecheck`
Expected: PASS (7 tests) puis typecheck sans erreur. Si un test échoue à cause de jsdom (ex. `getBoundingClientRect` à zéro), corriger le code de production (pas le test) tant que le comportement visé est respecté.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/content/useFilteredCards.ts src/content/WebPanel.tsx tests/content/web-panel.test.tsx
git commit -m "feat: panneau de la vue Toile (SVG zoomable, fiche de la carte au toucher)"
```

---

### Task 8: Brancher la vue (sélecteur, montage, dépôt)

**Files:**
- Modify: `src/content/collection-view.ts`
- Modify: `src/content/world-toggle.ts` (l.12-29)
- Modify: `src/content/collection-ui.tsx` (imports, `CollectionUiDeps`, `createCollectionUi`, `mountPanel`)
- Modify: `src/app/overlay.ts` (imports l.8-13 et création du dépôt l.141-147)
- Test: `tests/content/world-toggle.test.ts`

**Interfaces:**
- Consumes: `WebPanel` (Task 7), `LinksRepo` / `createLinksRepo` (Task 3), `fetchWikiLinks` (Task 1).
- Produces: `CollectionView` accepte `'web'` ; `CollectionUiDeps.links: LinksRepo` ; le sélecteur compte cinq boutons (`homemade`, `world`, `timeline`, `web`, `list`).

- [ ] **Step 1: Write the failing test** — mettre à jour `tests/content/world-toggle.test.ts` :

```ts
// readView / writeView : ajouter, après la ligne `expect(readView(storage)).toBe('timeline');`
    writeView(storage, 'web');
    expect(readView(storage)).toBe('web');

// describe('ensureViewSwitch') :
  const NAMES = ['Homemade', 'Monde', 'Chronologique', 'Toile', 'Grille'];

  it("insère cinq boutons en glyphes juste après l'ancre, Homemade en tête et la Grille à droite", () => {
    // …corps inchangé, avec :
    expect(buttons.map((b) => b.getAttribute('data-wmt-view'))).toEqual(['homemade', 'world', 'timeline', 'web', 'list']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false']);
  });

  it("est idempotent et met à jour la vue active", () => {
    // …corps inchangé, avec :
    expect([...second.querySelectorAll('button[data-wmt-view]')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true', 'false', 'false']);
  });

  it('un clic sur le bouton Toile choisit la vue web', () => {
    const select = makeSelect();
    const handler = vi.fn();
    const group = ensureViewSwitch(select, select, 'homemade', handler);
    (group.querySelector('[data-wmt-view="web"]') as HTMLButtonElement).click();
    expect(handler).toHaveBeenCalledWith('web');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/world-toggle.test.ts`
Expected: FAIL (`'web'` inconnu : `readView` rend `homemade`, quatre boutons seulement).

- [ ] **Step 3: Write minimal implementation**

`src/content/collection-view.ts` :

```ts
// `list` : la grille du site, inchangée ; `homemade` : notre grille paginée et filtrable (vue par défaut).
export type CollectionView = 'homemade' | 'world' | 'timeline' | 'web' | 'list';

const KEY = 'wmt:collectionView';

// Toute erreur de stockage (accès bloqué…) est absorbée : on reste en vue Homemade.
export function readView(storage: Pick<Storage, 'getItem'>): CollectionView {
  try {
    const value = storage.getItem(KEY);
    return value === 'list' || value === 'world' || value === 'timeline' || value === 'web' || value === 'homemade' ? value : 'homemade';
  } catch {
    return 'homemade';
  }
}
```
(`writeView` inchangée.)

`src/content/world-toggle.ts` — après `GANTT` :

```ts
// Lucide « network » : trois nœuds reliés (les rectangles sont tracés en chemins, comme ceux de GRID).
const NETWORK = [
  'M17 16h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z',
  'M3 16h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z',
  'M10 2h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z',
  'M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3',
  'M12 12V8',
];
```
mettre à jour le commentaire d'icônes (« …, « network », … »), et dans `VIEWS`, entre `timeline` et `list` :

```ts
  { view: 'web', label: 'Toile : les cartes reliées par les articles Wikipédia qu’elles citent', glyph: NETWORK },
```

`src/content/collection-ui.tsx` :

```tsx
import type { LinksRepo } from '../core/links/links-repo';
import { WebPanel } from './WebPanel';
// CollectionUiDeps : ajouter
  links: LinksRepo;
// signature : createCollectionUi({ collection, geo, birth, kinds, links, kindFilterSource, … })
// mountPanel, dans la chaîne de rendu :
        {view === 'timeline' ? (
          <TimelinePanel {...common} birth={birth} kinds={kinds} kindFilterSource={kindFilterSource} />
        ) : view === 'world' ? (
          <WorldPanel {...common} geo={geo} kinds={kinds} kindFilterSource={kindFilterSource} />
        ) : view === 'web' ? (
          <WebPanel {...common} links={links} kinds={kinds} kindFilterSource={kindFilterSource} />
        ) : (
```

`src/app/overlay.ts` :

```ts
import { createLinksRepo } from '../core/links/links-repo';
import { fetchWikiLinks } from '../core/links/wiki-links';
// dans createCollectionUi({ … }), après `birth:` :
    links: createLinksRepo(store, (slugs) => fetchWikiLinks((url) => fetch(url), slugs)),
```

- [ ] **Step 4: Run tests, typecheck and full suite**

Run: `npx vitest run tests/content/world-toggle.test.ts && npm run typecheck && npm test`
Expected: PASS partout (toute la suite, pas seulement ce fichier) ; typecheck sans erreur.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/content/collection-view.ts src/content/world-toggle.ts src/content/collection-ui.tsx src/app/overlay.ts tests/content/world-toggle.test.ts
git commit -m "feat: la vue Toile rejoint le sélecteur de vues de la Collection"
```

---

### Task 9: Vérification dans un navigateur, documentation, construction

**Files:**
- Modify: `README.md` (après le paragraphe « Scan de la Collection »)
- Modify: `docs/INSTALLATION.md` (section « Usage sur mobile »)
- Modify: `docs/superpowers/specs/2026-10-02-collection-web-view-design.md` (précisions)
- Scratch (hors dépôt) : banc d'essai dans le dossier temporaire de la session.

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: rien de nouveau dans le code ; la preuve que la vue fonctionne dans un vrai navigateur, à largeur d'écran de bureau et de mobile.

- [ ] **Step 1: Banc d'essai visuel** — monter `WebPanel` avec de fausses données (≈ 60 cartes, ≈ 25 articles partagés, quelques liens entre cartes, images absentes) dans une page servie par vite depuis le dossier temporaire de la session (jamais dans le dépôt), l'ouvrir dans le navigateur intégré, puis vérifier : toile cadrée et lisible ; glisser, pincer / Ctrl + molette, boutons + − ⤢ ; toucher un point (mise en avant + phrase), toucher une carte (fiche `CardPopup` avec 📈 🃏 ✕) ; largeur mobile (375 px) : fiche entière à l'écran, boutons accessibles. Corriger le code de production si un défaut apparaît (nouveau test d'abord quand il est testable).

- [ ] **Step 2: Documentation** — `README.md` : un paragraphe « Vue Toile » (ce qu'elle montre, que seuls des titres d'articles partent vers Wikipédia, que les liens sont relus après 30 jours, la limite de 300 articles affichés et de 600 liens par carte). `docs/INSTALLATION.md` : un point sur mobile (glisser pour déplacer, pincer pour zoomer, toucher une carte ouvre sa fiche). Spec : ajouter une section « Précisions d'implémentation » (liens carte à carte en pointillés, stockage par dictionnaire `links-v1`, 600 liens par carte, repli en cas d'échec d'écriture, nouvel essai toutes les 30 s).

- [ ] **Step 3: Vérification finale**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck sans erreur, toute la suite verte, `.output/chrome-mv3` produit.

- [ ] **Step 4: Commit, pousser, PR, fusion**

```bash
git branch --show-current
git add README.md docs
git commit -m "docs: la vue Toile (README, installation, précisions du design)"
git push -u origin feat/vue-toile
gh pr create --base main --title "feat: vue Toile d'araignée" --body-file <corps>
gh pr merge --merge
```
Puis `git checkout main && git pull`, `npm run build`, et mettre à jour la mémoire du projet (décisions, reste la vérification manuelle sur Chrome et sur l'APK).
