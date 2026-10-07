# Catégorie « Livres » : changer de livre (⇄) — plan d'implémentation (plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Dans la section « Livre » d'une carte, un glyphe ⇄ « Changer de livre » ouvre une fenêtre pour corriger le livre : recherche Open Library préremplie avec le titre de la carte, aperçu, « Utiliser ce livre », « ∅ Aucun livre », « Revenir au choix automatique ». Le choix est mémorisé par carte (`book-choice-v1`), prime sur Wikidata et sur le repli par titre, **y compris pour la couverture** (le livre est alors vérifié par l'utilisateur), et la visite guidée peut enfin ouvrir une vraie carte de livre.

**Architecture :** calquée sur « Changer de jeu » (`GameChoiceDialog`, `createGameChoiceRepo`, `game-service.choose/chooseNone/reset`) : un dépôt de choix, des méthodes de service (`candidates`, `preview`, `choose`, `chooseNone`, `reset`, `onChoice`), une fenêtre en portail dans le shadow DOM de la surcouche (`useOverlayHost`), la section qui se recharge au changement. Pas d'onglet « Coller un lien » dans ce plan (voir Hors périmètre).

**Tech Stack :** TypeScript, React 19 (shadow DOM), zod, Vitest + jsdom, WXT.

**Spec :** `docs/superpowers/specs/2026-10-07-livres-design.md` (décisions de l'utilisateur : « glyphe ⇄ Changer de livre » comme pour les jeux ; sections « Résolution » et « Interface »). Modèle de comportement : `docs/superpowers/specs/2026-10-06-jeux-video-steam-igdb-design.md`, section « Changer de jeu ». Feuille de route : `docs/superpowers/plans/2026-10-07-livres-feuille-de-route.md` (plan n° 3).

## Global Constraints

- **Glyphes** de l'application (`Glyphs.tsx` : `swap` existe déjà, `search`, `close`, `book`) plutôt que du texte ou des émojis dans l'interface ; les fiches WikiHow utilisent des émojis (`glyph: '🔁'` pour la nouvelle étape).
- Zones tactiles de **44 px** (bouton ⇄, boutons de la fenêtre, lignes de résultat ≥ 56 px) ; même contenu sur bureau et mobile ; styles **en ligne** (shadow DOM).
- Textes de l'interface en **français** ; commentaires de code en français, sobres, dans le style du dépôt. **Écrire le français avec les vrais caractères UTF-8 (é è ê à ç ’ « » œ ∅ ×) via les outils Write/Edit, jamais via un chemin ASCII** (des accents ont déjà été perdus) ; vérifier par `grep` avant de committer.
- Libellés d'accessibilité exacts (les tests et la visite en dépendent) : bouton `aria-label="Changer de livre"` (attribut `data-wmt-book-switch`), fenêtre `role="dialog"` `aria-label="Changer de livre"`, champ `aria-label="Titre à chercher"`, bouton de recherche `aria-label="Chercher"`, ligne de résultat `aria-label="Choisir {titre} ({auteur ou « auteur inconnu »})"`, `aria-label="Utiliser ce livre"`, `aria-label="Aucun livre"`, `aria-label="Revenir au choix automatique"`, `aria-label="Fermer"`.
- Le choix est mémorisé par carte sous `book-choice-v1` : `{ workId: 'OL…W' }` ou `{ none: true }` ; il **prime** sur l'identifiant Wikidata et sur le repli par titre, pour la fiche **et** pour la couverture ; « Revenir au choix automatique » l'efface. Un choix n'est enregistré que pour un identifiant `^OL\d+W$`.
- Un autre livre choisi pour une carte : l'image mémorisée de la carte est à oublier (`images.forgetGameArt(slug)`, le même canal d'image « officiel » que les jeux) via `onChoice`.
- Un échec réseau de la recherche ou de l'aperçu ne casse pas la fenêtre : message discret `role="status"` ; un format de réponse inattendu lève (jamais mémorisé comme « absent »).
- `exactOptionalPropertyTypes` est actif : propriétés optionnelles ajoutées par `...(x ? { k: x } : {})`.
- Vérification : `npm run typecheck`, `npm test`, `npm run build`.

## Hors périmètre

- Onglet « Coller un lien » (adresse Open Library) : reporté (la recherche couvre le besoin ; à ajouter si l'utilisateur le demande).
- Concordance d'auteur pour la couverture automatique : reste décidée au plan 2 (couverture par identifiant Wikidata seulement) ; le choix manuel est maintenant le moyen de corriger.
- Prix, lecture gratuite, bibliographie : plans suivants.

## Structure des fichiers

Créer : `src/content/BookChoiceDialog.tsx`, `tests/content/BookChoiceDialog.test.tsx`.
Modifier : `src/core/book/book-detail.ts`, `src/core/book/book-format.ts`, `src/core/book/book-repo.ts`, `src/content/book-service.ts` (remplacé en entier ci-dessous), `src/content/BookSection.tsx`, `src/app/overlay.ts`, `src/core/whats-new/types.ts`, `src/core/whats-new/entries.ts` ; tests : `tests/core/book/book-repo.test.ts`, `tests/core/book/book-format.test.ts`, `tests/content/book-service.test.ts`, `tests/content/BookSection.test.tsx`, `tests/core/whats-new/pick-card.test.ts`.

---

### Task 0 : Branche de travail

**Files:** aucun.

- [ ] **Step 1 : Vérifier**

Run: `git branch --show-current && git status --short`
Expected: `feat/livres-changer` (créée depuis `main` après la fusion du plan 2) ; l'arbre ne contient que des fichiers non suivis qui ne sont pas les tiens (`docs/guides/`, `docs/superpowers/specs/2026-10-07-documentaire-histoire-design.md` appartiennent à une autre session : ne pas les toucher, ne pas les ajouter). Ne jamais utiliser `git stash -u`.

- [ ] **Step 2 : Commiter ce plan**

```bash
git add docs/superpowers/plans/2026-10-07-livres-changer.md
git commit -m "docs(livres): plan 3 (changer de livre)"
```

---

### Task 1 : Dépôt du choix (`book-choice-v1`) et miniature de couverture

**Files:**
- Modify: `src/core/book/book-detail.ts` (type `BookChoice`), `src/core/book/book-repo.ts` (`createBookChoiceRepo`), `src/core/book/book-format.ts` (`coverThumbUrl`)
- Test: `tests/core/book/book-repo.test.ts` (ajout), `tests/core/book/book-format.test.ts` (ajout)

**Interfaces:**
- Produces :
  - `type BookChoice = { workId: string } | { none: true }`
  - `createBookChoiceRepo(store: KeyValueStore)` → `{ load(): Promise<Record<string, BookChoice>>; save(slug: string, choice: BookChoice): Promise<void>; clear(slug: string): Promise<void> }`, `type BookChoiceRepo`
  - `coverThumbUrl(coverId: number): string` (miniature `-S.jpg`)

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à `tests/core/book/book-repo.test.ts` (ajouter `createBookChoiceRepo` à l'import existant de `book-repo`, ne pas toucher aux tests existants) :

```ts
describe('createBookChoiceRepo', () => {
  it('mémorise le livre choisi ou « aucun livre » par carte, et l’efface', async () => {
    const repo = createBookChoiceRepo(createMemoryStore());
    await repo.save('A', { workId: 'OL1W' });
    await repo.save('B', { none: true });
    expect(await repo.load()).toEqual({ A: { workId: 'OL1W' }, B: { none: true } });
    await repo.clear('A');
    expect(await repo.load()).toEqual({ B: { none: true } });
  });

  it('sérialise les écritures simultanées sans en perdre', async () => {
    const repo = createBookChoiceRepo(createMemoryStore());
    await Promise.all([repo.save('A', { workId: 'OL1W' }), repo.save('B', { workId: 'OL2W' }), repo.save('C', { none: true })]);
    expect(Object.keys(await repo.load()).sort()).toEqual(['A', 'B', 'C']);
  });

  it('un dépôt vide se lit comme un objet vide', async () => {
    expect(await createBookChoiceRepo(createMemoryStore()).load()).toEqual({});
  });
});
```

Ajouter à `tests/core/book/book-format.test.ts` (ajouter `coverThumbUrl` à l'import) :

```ts
it('construit l’adresse de la miniature de couverture', () => {
  expect(coverThumbUrl(13151269)).toBe('https://covers.openlibrary.org/b/id/13151269-S.jpg');
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/book/book-repo.test.ts tests/core/book/book-format.test.ts`
Expected: FAIL (`createBookChoiceRepo` et `coverThumbUrl` introuvables).

- [ ] **Step 3 : Implémenter**

`src/core/book/book-detail.ts` : ajouter à la suite de `BookFetch` :

```ts
// Choix de l'utilisateur pour une carte : une œuvre précise (identifiant Open Library), ou « aucun livre ».
export type BookChoice = { workId: string } | { none: true };
```

`src/core/book/book-format.ts` : ajouter sous `coverUrl` :

```ts
// Miniature (résultats de la fenêtre « Changer de livre »).
export const coverThumbUrl = (coverId: number): string => `${OPENLIBRARY_COVER_BASE}/${coverId}-S.jpg`;
```

`src/core/book/book-repo.ts` : ajouter l'import `import type { BookChoice } from './book-detail';` et, à la suite du fichier :

```ts
const CHOICE_KEY = 'book-choice-v1';

// Le livre choisi à la main pour chaque carte (ou « aucun livre ») : il prime sur la résolution automatique.
export function createBookChoiceRepo(store: KeyValueStore) {
  let tail: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<Record<string, BookChoice>> => (await store.get<Record<string, BookChoice>>(CHOICE_KEY)) ?? {};
  const update = (change: (state: Record<string, BookChoice>) => Record<string, BookChoice>): Promise<void> => {
    const run = tail.then(async () => store.set(CHOICE_KEY, change(await read())));
    tail = run.catch(() => undefined);
    return run;
  };
  return {
    load: read,
    save: (slug: string, choice: BookChoice): Promise<void> => update((state) => ({ ...state, [slug]: choice })),
    clear: (slug: string): Promise<void> =>
      update((state) => {
        const { [slug]: _removed, ...rest } = state;
        return rest;
      }),
  };
}
export type BookChoiceRepo = ReturnType<typeof createBookChoiceRepo>;
```

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/core/book && npm run typecheck`
Expected: PASS, aucune erreur de types.

- [ ] **Step 5 : Commit**

```bash
git add src/core/book tests/core/book
git commit -m "feat(book): dépôt du livre choisi à la main et miniature de couverture"
```

---

### Task 2 : Choix manuel dans `book-service`

**Files:**
- Modify (remplacement du fichier entier) : `src/content/book-service.ts`
- Test: `tests/content/book-service.test.ts` (ajouts + adaptation du `setup`)

**Interfaces:**
- Consumes: `BookChoiceRepo` (Task 1), `OlWork`, `OpenLibraryApi`, `isWorkId`, `BookError`.
- Produces (ajouts au service) :
  - `type BookView = … | { status: 'empty'; none?: true } | …` (`none: true` quand l'utilisateur a choisi « aucun livre »)
  - `type BookCandidates = { works: OlWork[]; message?: string }`, `type BookPreview = { work?: OlWork; message?: string }`
  - `candidates(query: string): Promise<BookCandidates>`, `preview(workId: string): Promise<BookPreview>`, `choose(slug: string, workId: string): Promise<void>`, `chooseNone(slug: string): Promise<void>`, `reset(slug: string): Promise<void>`
  - dépendances ajoutées : `choices: Pick<BookChoiceRepo, 'load' | 'save' | 'clear'>`, `onChoice?: (slug: string) => void`

- [ ] **Step 1 : Adapter le `setup` du test, puis écrire les tests qui échouent**

Dans `tests/content/book-service.test.ts` : importer `createBookChoiceRepo` (`../../src/core/book/book-repo`) ; dans `setup`, créer `const choices = createBookChoiceRepo(createMemoryStore()); const onChoice = vi.fn();`, les passer à `createBookService({ …, choices, onChoice })` et les ajouter à l'objet renvoyé : `return { service, openLibrary, intro, resolve, choices, onChoice };`. Les tests existants ne changent pas. Ajouter :

```ts
const autre: OlWork = { id: 'OL9W', title: 'Un autre livre', author: 'Quelqu’un', year: 2001, coverId: 4242, popularity: 5 };
const byWorkId = (openLibrary: { byWork: { mockImplementation: (fn: (id: string) => Promise<OlWork | null>) => unknown } }) =>
  openLibrary.byWork.mockImplementation(async (id: string) => (id === 'OL9W' ? autre : etranger));

describe('candidates et preview', () => {
  it('candidates cherche par titre nettoyé et rend les œuvres telles quelles', async () => {
    const { service, openLibrary } = setup({ search: [etranger, autre] });
    expect(await service.candidates('L’Étranger (roman)')).toEqual({ works: [etranger, autre] });
    expect(openLibrary.searchByTitle).toHaveBeenCalledTimes(1);
  });

  it('candidates rend une liste vide sans appel pour un titre vide, et un message si la recherche échoue', async () => {
    const { service, openLibrary } = setup();
    expect(await service.candidates('   ')).toEqual({ works: [] });
    expect(openLibrary.searchByTitle).not.toHaveBeenCalled();
    openLibrary.searchByTitle.mockRejectedValueOnce(new BookError('rate-limited', 'x'));
    const failed = await service.candidates('Titre jamais cherché');
    expect(failed.works).toEqual([]);
    expect(failed.message).toContain('patienter');
  });

  it('preview rend l’œuvre, ou un message pour une œuvre inconnue, un identifiant invalide ou une erreur', async () => {
    const { service, openLibrary } = setup();
    byWorkId(openLibrary);
    expect(await service.preview('OL9W')).toEqual({ work: autre });
    expect((await service.preview('../x')).message).toBe('Ce livre est introuvable.');
    openLibrary.byWork.mockResolvedValueOnce(null);
    expect((await service.preview('OL404W')).message).toBe('Ce livre est introuvable.');
    openLibrary.byWork.mockRejectedValueOnce(new BookError('http', 'x'));
    expect((await service.preview('OL500W')).message).toContain('Open Library');
  });
});

describe('choix manuel', () => {
  it('un livre choisi prime sur Wikidata et sur le repli par titre, pour la fiche et pour la couverture', async () => {
    const { service, openLibrary, onChoice } = setup({ ids: { workId: 'OL1230613W' } });
    byWorkId(openLibrary);
    await service.choose('Livre', 'OL9W');
    expect(onChoice).toHaveBeenCalledWith('Livre');
    const view = await service.view('Livre', 'L’Étranger');
    expect(view.status === 'detail' && view.detail.id).toBe('OL9W');
    expect(await service.cover('Livre', 'L’Étranger')).toEqual(['https://covers.openlibrary.org/b/id/4242-L.jpg']);
  });

  it('le livre choisi compte pour la couverture même sans identifiant Wikidata, et sans attendre Wikidata ni les natures', async () => {
    const { service, openLibrary, resolve } = setup({ ids: {}, kindsUnknown: true });
    byWorkId(openLibrary);
    await service.choose('Livre', 'OL9W');
    expect(await service.cover('Livre', 'X')).toEqual(['https://covers.openlibrary.org/b/id/4242-L.jpg']);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('« aucun livre » vide la fiche (none: true) et la couverture, sans appel à Open Library', async () => {
    const { service, openLibrary } = setup();
    await service.chooseNone('Livre');
    expect(await service.view('Livre', 'L’Étranger')).toEqual({ status: 'empty', none: true });
    expect(await service.cover('Livre', 'L’Étranger')).toEqual([]);
    expect(openLibrary.byWork).not.toHaveBeenCalled();
    expect(openLibrary.searchByTitle).not.toHaveBeenCalled();
  });

  it('un livre choisi qu’Open Library ne connaît plus donne une fiche vide (pas « aucun livre »)', async () => {
    const { service, openLibrary } = setup();
    openLibrary.byWork.mockResolvedValue(null);
    await service.choose('Livre', 'OL9W');
    expect(await service.view('Livre', 'L’Étranger')).toEqual({ status: 'empty' });
    expect(await service.cover('Livre', 'L’Étranger')).toEqual([]);
  });

  it('« revenir au choix automatique » efface le choix et prévient', async () => {
    const { service, openLibrary, onChoice, choices } = setup();
    byWorkId(openLibrary);
    await service.choose('Livre', 'OL9W');
    await service.reset('Livre');
    expect(await choices.load()).toEqual({});
    expect(onChoice).toHaveBeenCalledTimes(2);
    const view = await service.view('Livre', 'L’Étranger');
    expect(view.status === 'detail' && view.detail.id).toBe('OL1230613W');
  });

  it('refuse un identifiant mal formé sans rien enregistrer', async () => {
    const { service, choices, onChoice } = setup();
    await expect(service.choose('Livre', '../x')).rejects.toBeInstanceOf(BookError);
    expect(await choices.load()).toEqual({});
    expect(onChoice).not.toHaveBeenCalled();
  });

  it('un choix ne fait pas apparaître la section sur une carte qui n’est pas un livre', async () => {
    const { service } = setup({ natures: ['Q5'] });
    await service.chooseNone('Livre');
    expect(await service.view('Livre', 'Camus')).toEqual({ status: 'none' });
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/book-service.test.ts`
Expected: FAIL (`candidates`, `preview`, `choose`… inexistants ; `choices` non reconnu).

- [ ] **Step 3 : Remplacer `src/content/book-service.ts` par ce fichier**

```ts
// src/content/book-service.ts
import { articleUrl, coverUrl, isWorkId, normalizeTitle, workPageUrl } from '../core/book/book-format';
import type { BookDetail } from '../core/book/book-detail';
import { isBookCard } from '../core/book/book-kinds';
import type { BookChoiceRepo, BookRepo } from '../core/book/book-repo';
import { BookError, bookErrorMessage } from '../core/book/errors';
import type { OlWork, OpenLibraryApi } from '../core/book/openlibrary-api';
import type { TtlCache } from '../core/cache/ttl-cache';
import type { KnownCard } from '../core/collection/collection-book';
import { facetLabel, type KindsState } from '../core/kinds/kinds-book';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import type { CardKinds } from '../core/kinds/wikidata-kinds';
import { cleanTitle } from '../core/music/listen';

// `none: true` : l'utilisateur a choisi « aucun livre » pour cette carte.
export type BookView = { status: 'none' } | { status: 'empty'; none?: true } | { status: 'detail'; detail: BookDetail } | { status: 'error'; message: string };
export type BookCandidates = { works: OlWork[]; message?: string };
export type BookPreview = { work?: OlWork; message?: string };

export type BookServiceDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  books: Pick<BookRepo, 'resolve'>;
  choices: Pick<BookChoiceRepo, 'load' | 'save' | 'clear'>;
  openLibrary: Pick<OpenLibraryApi, 'byWork' | 'searchByTitle' | 'description'>;
  // Introduction de l'article Wikipédia FR de la carte (texte brut), null s'il n'y en a pas.
  intro: (slug: string) => Promise<string | null>;
  cache: Pick<TtlCache, 'getOrLoad'>;
  // Le livre d'une carte vient de changer : l'image retenue pour elle est à oublier.
  onChoice?: (slug: string) => void;
};

const MAX_GENRES = 5;

export function createBookService(deps: BookServiceDeps) {
  const { collection, kinds, books, choices, openLibrary, intro, cache, onChoice } = deps;

  // Le choix est enregistré, puis l'image mémorisée de la carte est oubliée.
  const changed = async (slug: string, saved: Promise<void>): Promise<void> => {
    await saved;
    onChoice?.(slug);
  };

  // Une aide facultative (synopsis) qui échoue ne doit pas faire échouer la fiche.
  const optional = async <T>(job: () => Promise<T | null>): Promise<T | null> => {
    try {
      return await job();
    } catch {
      return null;
    }
  };

  const workById = (workId: string): Promise<OlWork | null> => cache.getOrLoad(`book-work-v1-${workId}`, () => openLibrary.byWork(workId));
  const searchTitle = (query: string, wanted: string): Promise<OlWork[]> => cache.getOrLoad(`book-search-v1-${wanted}`, () => openLibrary.searchByTitle(query));
  const coverOf = (work: OlWork | null): string[] => (work?.coverId !== undefined ? [coverUrl(work.coverId)] : []);

  // L'œuvre de la carte : identifiant Wikidata d'abord ; sinon (si `byTitle`) recherche par titre, retenue seulement si le titre est égal
  // (accents, casse, ponctuation) ; à égalité, la plus connue (nombre d'éditions).
  async function workOf(workId: string | undefined, title: string, { byTitle }: { byTitle: boolean }): Promise<OlWork | null> {
    if (workId !== undefined) {
      const found = await workById(workId);
      if (found) return found;
    }
    if (!byTitle) return null;
    const query = cleanTitle(title);
    const wanted = normalizeTitle(query);
    if (wanted === '') return null;
    const candidates = await searchTitle(query, wanted);
    return candidates.filter((candidate) => normalizeTitle(candidate.title) === wanted).sort((a, b) => b.popularity - a.popularity)[0] ?? null;
  }

  // Synopsis : introduction de l'article Wikipédia de la carte, sinon description d'Open Library.
  async function synopsisOf(slug: string, work: OlWork): Promise<BookDetail['synopsis']> {
    const wiki = await optional(() => cache.getOrLoad(`book-intro-v1-${slug}`, () => intro(slug)));
    if (wiki) return { text: wiki, url: articleUrl(slug), source: 'wikipedia' };
    const description = await optional(() => cache.getOrLoad(`book-description-v1-${work.id}`, () => openLibrary.description(work.id)));
    return description ? { text: description, url: workPageUrl(work.id), source: 'openlibrary' } : undefined;
  }

  async function detailOf(slug: string, work: OlWork, state: KindsState, cardKinds: CardKinds | undefined): Promise<BookDetail> {
    const genres = (cardKinds?.genres ?? []).slice(0, MAX_GENRES).map((id) => facetLabel(state, id));
    const synopsis = await synopsisOf(slug, work);
    return {
      id: work.id,
      title: work.title,
      ...(work.author ? { author: work.author } : {}),
      ...(work.year !== undefined ? { year: work.year } : {}),
      ...(work.publisher ? { publisher: work.publisher } : {}),
      ...(work.pages !== undefined ? { pages: work.pages } : {}),
      ...(work.isbn ? { isbn: work.isbn } : {}),
      genres,
      ...(synopsis ? { synopsis } : {}),
      ...(work.coverId !== undefined ? { coverUrl: coverUrl(work.coverId) } : {}),
      pageUrl: workPageUrl(work.id),
    };
  }

  return {
    // Les cartes (parmi `cards`) dont la nature est une œuvre écrite : elles portent le glyphe livre. Nature seule, aucun appel à Open Library.
    async bookSlugs(cards: Pick<KnownCard, 'slug'>[]): Promise<Set<string>> {
      if (cards.length === 0) return new Set();
      await kinds.resolveMissing(cards.map((card) => card.slug));
      const loaded = await kinds.load();
      return new Set(cards.filter((card) => isBookCard(loaded.cards[card.slug])).map((card) => card.slug));
    },

    // Ce que la fiche d'une carte montre : rien (pas un livre), une fiche vide (livre introuvable ou « aucun livre »), un livre, ou une erreur.
    async view(slug: string, title: string): Promise<BookView> {
      try {
        if (!(await collection.list()).some((card) => card.slug === slug)) return { status: 'none' };
        await kinds.resolveMissing([slug]);
        const state = await kinds.load();
        const cardKinds = state.cards[slug];
        if (!isBookCard(cardKinds)) return { status: 'none' };
        const choice = (await choices.load())[slug];
        if (choice) {
          if ('none' in choice) return { status: 'empty', none: true };
          const chosen = await workById(choice.workId);
          return chosen ? { status: 'detail', detail: await detailOf(slug, chosen, state, cardKinds) } : { status: 'empty' };
        }
        const ids = (await books.resolve([slug]))[slug] ?? {};
        const work = await workOf(ids.workId, title, { byTitle: true });
        return work ? { status: 'detail', detail: await detailOf(slug, work, state, cardKinds) } : { status: 'empty' };
      } catch (error) {
        return { status: 'error', message: bookErrorMessage(error) };
      }
    },

    // Couvertures possibles de la carte : liste vide si ce n'est pas un livre ou si rien n'existe ;
    // `null` si une source n'a pas pu répondre (natures, Wikidata, Open Library) : à redemander plus tard, sans rien mémoriser.
    async cover(slug: string, title: string): Promise<string[] | null> {
      try {
        // Le livre choisi par l'utilisateur ne dépend ni de Wikidata ni des natures : il reste affiché, et sa couverture compte.
        const choice = (await choices.load())[slug];
        if (choice) return 'none' in choice ? [] : coverOf(await workById(choice.workId));
        await kinds.resolveMissing([slug]);
        const cardKinds = (await kinds.load()).cards[slug];
        if (cardKinds === undefined) return null;
        if (!isBookCard(cardKinds)) return [];
        const ids = (await books.resolve([slug]))[slug];
        if (ids === undefined) return null;
        // Jamais par titre : tant que l'auteur n'est pas vérifié, un homonyme ou un titre générique donnerait une mauvaise couverture par défaut,
        // pire que pas de couverture (la fiche, elle, garde le repli par titre et montre ce qu'elle a trouvé).
        return coverOf(await workOf(ids.workId, title, { byTitle: false }));
      } catch {
        return null;
      }
    },

    // Les propositions de la fenêtre « Changer de livre » : les œuvres d'Open Library dont le titre ressemble à la recherche.
    async candidates(query: string): Promise<BookCandidates> {
      const text = cleanTitle(query);
      const wanted = normalizeTitle(text);
      if (wanted === '') return { works: [] };
      try {
        return { works: await searchTitle(text, wanted) };
      } catch (error) {
        return { works: [], message: bookErrorMessage(error) };
      }
    },

    // Aperçu d'une œuvre proposée, avant validation.
    async preview(workId: string): Promise<BookPreview> {
      try {
        const work = isWorkId(workId) ? await workById(workId) : null;
        return work ? { work } : { message: 'Ce livre est introuvable.' };
      } catch (error) {
        return { message: bookErrorMessage(error) };
      }
    },

    choose(slug: string, workId: string): Promise<void> {
      if (!isWorkId(workId)) return Promise.reject(new BookError('not-found', 'identifiant d’œuvre invalide'));
      return changed(slug, choices.save(slug, { workId }));
    },
    chooseNone: (slug: string): Promise<void> => changed(slug, choices.save(slug, { none: true })),
    reset: (slug: string): Promise<void> => changed(slug, choices.clear(slug)),
  };
}

export type BookService = ReturnType<typeof createBookService>;
```

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/content/book-service.test.ts && npm run typecheck`
Expected: PASS (les 15 tests existants + les nouveaux), aucune erreur de types. Si `KindsState` n'est pas exporté de `kinds-book.ts` sous ce nom, lire le fichier (`export type KindsState`) : il l'est. Si un test existant échoue parce que `cover()` appelle maintenant `choices.load()` avant les natures, ne rien affaiblir : c'est le comportement voulu (le test « kindsUnknown → null » reste vrai tant qu'il n'y a aucun choix).

- [ ] **Step 5 : Commit**

```bash
git add src/content/book-service.ts tests/content/book-service.test.ts
git commit -m "feat(book): choix manuel du livre (recherche, aperçu, choisir, aucun livre, retour automatique)"
```

---

### Task 3 : Fenêtre « Changer de livre »

**Files:**
- Create: `src/content/BookChoiceDialog.tsx`
- Test: `tests/content/BookChoiceDialog.test.tsx`

**Interfaces:**
- Consumes: `BookService['candidates' | 'preview' | 'choose' | 'chooseNone' | 'reset']`, `OlWork`, `coverThumbUrl`, `useOverlayHost` (`./SoundtrackDialog`), `Glyph`.
- Produces: `BookChoiceDialog({ service, slug, title, currentId, onChanged, onClose })`.

- [ ] **Step 1 : Écrire le test qui échoue**

```tsx
// tests/content/BookChoiceDialog.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookChoiceDialog } from '../../src/content/BookChoiceDialog';
import type { BookService } from '../../src/content/book-service';
import type { OlWork } from '../../src/core/book/openlibrary-api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const etranger: OlWork = { id: 'OL1230613W', title: 'L’étranger', author: 'Albert Camus', year: 1942, coverId: 13151269, popularity: 468 };
const autre: OlWork = { id: 'OL9W', title: 'L’étranger au village', popularity: 3 };

function service(over: Record<string, unknown> = {}) {
  return {
    candidates: vi.fn(async () => ({ works: [etranger, autre] })),
    preview: vi.fn(async () => ({ work: { ...etranger, publisher: 'Gallimard', pages: 186 } })),
    choose: vi.fn(async () => undefined),
    chooseNone: vi.fn(async () => undefined),
    reset: vi.fn(async () => undefined),
    ...over,
  };
}

// La fenêtre vit dans un shadow DOM posé sur le <body>.
const dialog = (): ParentNode => Array.from(document.body.children).find((child) => child.shadowRoot)?.shadowRoot ?? document.createDocumentFragment();
const byLabel = (label: string) => dialog().querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const click = (element: HTMLElement) => act(async () => element.click());

async function show(svc: ReturnType<typeof service>, currentId: string | null = null, onChanged = vi.fn(), onClose = vi.fn()) {
  await act(async () =>
    root.render(<BookChoiceDialog service={svc as unknown as BookService} slug="L'Étranger" title="L’Étranger" currentId={currentId} onChanged={onChanged} onClose={onClose} />),
  );
  return { onChanged, onClose };
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('BookChoiceDialog', () => {
  it('lance la recherche avec le titre de la carte et liste les œuvres (titre, auteur, année)', async () => {
    const svc = service();
    await show(svc);
    expect(svc.candidates).toHaveBeenCalledWith('L’Étranger');
    expect(byLabel('Changer de livre').getAttribute('role')).toBe('dialog');
    const text = dialog().textContent ?? '';
    expect(text).toContain('L’étranger');
    expect(text).toContain('Albert Camus');
    expect(text).toContain('1942');
    expect(byLabel('Choisir L’étranger (Albert Camus)')).toBeTruthy();
    expect(byLabel('Choisir L’étranger au village (auteur inconnu)')).toBeTruthy();
  });

  it('une nouvelle recherche utilise le texte saisi', async () => {
    const svc = service();
    await show(svc);
    const input = byLabel('Titre à chercher') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'La peste');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(byLabel('Chercher'));
    expect(svc.candidates).toHaveBeenLastCalledWith('La peste');
  });

  it('sélectionner un résultat affiche un aperçu ; « Utiliser ce livre » garde le choix, prévient puis ferme', async () => {
    const svc = service();
    const { onChanged, onClose } = await show(svc);
    await click(byLabel('Choisir L’étranger (Albert Camus)'));
    expect(svc.preview).toHaveBeenCalledWith('OL1230613W');
    expect(dialog().textContent).toContain('Gallimard');
    await click(byLabel('Utiliser ce livre'));
    expect(svc.choose).toHaveBeenCalledWith("L'Étranger", 'OL1230613W');
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('le livre actuel est grisé et ne peut pas être rechoisi', async () => {
    const svc = service();
    await show(svc, 'OL1230613W');
    expect((byLabel('Choisir L’étranger (Albert Camus)') as HTMLButtonElement).disabled).toBe(true);
    expect(dialog().textContent).toContain('livre actuel');
  });

  it('« Aucun livre » et « Revenir au choix automatique »', async () => {
    const svc = service();
    const { onChanged } = await show(svc);
    await click(byLabel('Aucun livre'));
    expect(svc.chooseNone).toHaveBeenCalledWith("L'Étranger");
    await click(byLabel('Revenir au choix automatique'));
    expect(svc.reset).toHaveBeenCalledWith("L'Étranger");
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('une recherche sans résultat, un échec de recherche et un aperçu impossible restent lisibles', async () => {
    const empty = service({ candidates: vi.fn(async () => ({ works: [] })) });
    await show(empty);
    expect(dialog().textContent).toContain('Aucun résultat.');
    await act(async () => root.unmount());
    root = createRoot(container);
    const failing = service({ candidates: vi.fn(async () => ({ works: [], message: 'Open Library est indisponible pour le moment.' })), preview: vi.fn(async () => ({ message: 'Ce livre est introuvable.' })) });
    await show(failing);
    expect(dialog().querySelector('[role="status"]')?.textContent).toContain('indisponible');
  });

  it('un changement qui échoue garde la fenêtre ouverte avec un message', async () => {
    const svc = service({ chooseNone: vi.fn(async () => Promise.reject(new Error('x'))) });
    const { onClose, onChanged } = await show(svc);
    await click(byLabel('Aucun livre'));
    expect(onClose).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(dialog().querySelector('[role="status"]')?.textContent).toContain('réessaie');
  });

  it('le bouton de fermeture ferme la fenêtre', async () => {
    const { onClose } = await show(service());
    await click(byLabel('Fermer'));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/BookChoiceDialog.test.tsx`
Expected: FAIL (module introuvable).

- [ ] **Step 3 : Implémenter**

```tsx
// src/content/BookChoiceDialog.tsx
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { coverThumbUrl } from '../core/book/book-format';
import type { OlWork } from '../core/book/openlibrary-api';
import type { BookCandidates, BookPreview, BookService } from './book-service';
import { Glyph } from './Glyphs';
import { useOverlayHost } from './SoundtrackDialog';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const iconButton: CSSProperties = { width: 44, height: 44, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };
const wide: CSSProperties = { width: '100%', minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '600 14px system-ui, sans-serif' };
const field: CSSProperties = { flex: 1, minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: '0 10px', color: 'inherit', background: 'none', border, borderRadius: 8, font: '14px system-ui, sans-serif' };

type Props = {
  service: Pick<BookService, 'candidates' | 'preview' | 'choose' | 'chooseNone' | 'reset'>;
  slug: string;
  title: string;
  // Identifiant Open Library du livre actuellement affiché (grisé dans la liste), null s'il n'y en a pas.
  currentId: string | null;
  // Le choix de la carte a changé : la section se recharge.
  onChanged: () => void;
  onClose: () => void;
};

// « Changer de livre » : recherche sur Open Library, aperçu, puis « Utiliser ce livre » ; « Aucun livre » vide la section.
export function BookChoiceDialog({ service, slug, title, currentId, onChanged, onClose }: Props) {
  const [query, setQuery] = useState(title);
  const [found, setFound] = useState<BookCandidates | null>(null);
  const [selected, setSelected] = useState<OlWork | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Numéro de la dernière requête lancée : une réponse plus ancienne est ignorée.
  const latest = useRef(0);

  const search = async (text: string) => {
    if (text.trim() === '') return setMessage('Saisis un titre à chercher.');
    const request = ++latest.current;
    setBusy(true);
    setMessage(null);
    setSelected(null);
    const result = await service.candidates(text).catch((): BookCandidates => ({ works: [], message: 'La recherche a échoué.' }));
    if (request !== latest.current) return;
    setBusy(false);
    setFound(result);
    setMessage(result.message ?? (result.works.length === 0 ? 'Aucun résultat.' : null));
  };

  // Première recherche d'office, avec le titre de la carte.
  useEffect(() => {
    void search(title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preview = async (work: OlWork) => {
    const request = ++latest.current;
    setBusy(true);
    setMessage(null);
    const result = await service.preview(work.id).catch((): BookPreview => ({ message: 'Ce livre est introuvable.' }));
    if (request !== latest.current) return;
    setBusy(false);
    setSelected(result.work ?? null);
    if (!result.work) setMessage(result.message ?? 'Ce livre est introuvable.');
  };

  const done = async (action: () => Promise<void>) => {
    latest.current++;
    setBusy(true);
    try {
      await action();
    } catch {
      setBusy(false);
      setMessage('Le changement a échoué, réessaie.');
      return;
    }
    setBusy(false);
    onChanged();
    onClose();
  };

  const mountPoint = useOverlayHost();
  if (!mountPoint) return null;

  const row = (work: OlWork) => {
    const isCurrent = currentId === work.id;
    const author = work.author ?? 'auteur inconnu';
    return (
      <li key={work.id} style={{ borderTop: border, opacity: isCurrent ? 0.55 : 1 }}>
        <button
          type="button"
          disabled={busy || isCurrent}
          onClick={() => void preview(work)}
          aria-label={`Choisir ${work.title} (${author})`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 56, padding: '4px 8px', cursor: 'pointer', color: 'inherit', background: 'none', border: 0, textAlign: 'left', font: '13px system-ui, sans-serif' }}
        >
          <span style={{ flex: 'none', width: 36, height: 48, borderRadius: 5, background: work.coverId !== undefined ? `center / cover no-repeat url("${coverThumbUrl(work.coverId)}")` : 'rgba(148,163,184,0.25)' }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{work.title}</span>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, opacity: 0.7 }}>
              {[work.author, work.year, isCurrent ? 'livre actuel' : ''].filter(Boolean).join(' · ')}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Changer de livre"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(400px, 100%)', maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: '#0d1117', color: '#e6edf3', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <span>
            <strong style={{ fontSize: 16 }}>Changer de livre</strong>
            <span style={{ display: 'block', fontSize: 12, opacity: 0.7 }}>Carte « {title} »</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={iconButton}>
            <Glyph name="close" />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void search(query);
          }}
          style={{ display: 'flex', gap: 8, marginBottom: 4 }}
        >
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Titre à chercher" style={field} />
          <button type="submit" disabled={busy} aria-label="Chercher" title="Chercher" style={iconButton}>
            <Glyph name="search" />
          </button>
        </form>

        {found && found.works.length > 0 && (
          <div>
            <p style={{ margin: '8px 0 4px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7 }}>Open Library</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, border, borderRadius: 8, overflow: 'hidden' }}>{found.works.map(row)}</ul>
          </div>
        )}

        {selected && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: '1px solid var(--color-accent, #34d399)', borderRadius: 12 }}>
            <span>
              <b>{selected.title}</b>
              <span style={{ display: 'block', fontSize: 12, opacity: 0.7 }}>
                {[selected.author, selected.year, selected.publisher, selected.pages !== undefined ? `${selected.pages} pages` : ''].filter(Boolean).join(' · ')}
              </span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void done(() => service.choose(slug, selected.id))}
              aria-label="Utiliser ce livre"
              style={{ ...wide, color: '#04130c', background: 'var(--color-accent, #34d399)', border: 0 }}
            >
              Utiliser ce livre
            </button>
          </div>
        )}

        {message && (
          <p role="status" style={{ margin: '8px 0 0', fontSize: 12 }}>
            {message}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <button type="button" disabled={busy} onClick={() => void done(() => service.chooseNone(slug))} aria-label="Aucun livre" title="Cette carte n'a pas de livre" style={wide}>
            ∅ Aucun livre
          </button>
          <button type="button" disabled={busy} onClick={() => void done(() => service.reset(slug))} aria-label="Revenir au choix automatique" style={{ ...wide, border: 'none', fontWeight: 400, opacity: 0.8 }}>
            Revenir au choix automatique
          </button>
        </div>
      </div>
    </div>,
    mountPoint,
  );
}
```

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/content/BookChoiceDialog.test.tsx && npm run typecheck`
Expected: PASS (8 tests), aucune erreur de types. Si la saisie du champ ne se propage pas dans le test (React ne voit pas le changement), utiliser exactement la méthode `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')` du test (déjà utilisée) ; ne pas changer l'attente.

- [ ] **Step 5 : Commit**

```bash
git add src/content/BookChoiceDialog.tsx tests/content/BookChoiceDialog.test.tsx
git commit -m "feat(book): fenêtre « Changer de livre » (recherche, aperçu, aucun livre, retour automatique)"
```

---

### Task 4 : Glyphe ⇄ dans la section « Livre »

**Files:**
- Modify: `src/content/BookSection.tsx` (imports, composant `BookSection`, message de fiche vide)
- Test: `tests/content/BookSection.test.tsx` (ajouts)

**Interfaces:**
- Consumes: `BookChoiceDialog` (Task 3), `BookView.empty.none` (Task 2), `Glyph name="swap"`.
- Produces: bouton `aria-label="Changer de livre"` portant `data-wmt-book-switch` ; la section se recharge après un changement.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `tests/content/BookSection.test.tsx`, remplacer le service factice de `show` par un objet qui expose aussi les méthodes de la fenêtre (les tests existants gardent le même comportement) :

```tsx
const dialogService = () => ({
  candidates: vi.fn(async () => ({ works: [] })),
  preview: vi.fn(async () => ({})),
  choose: vi.fn(async () => undefined),
  chooseNone: vi.fn(async () => undefined),
  reset: vi.fn(async () => undefined),
});

async function show(view: BookView, extra: Record<string, unknown> = {}) {
  const service = { view: vi.fn(async () => view), ...dialogService(), ...extra };
  setBookService(service as unknown as BookService);
  await act(async () => root.render(<BookSection slug="L'Étranger" title="L'Étranger" />));
  return service;
}
const dialog = (): ParentNode => Array.from(document.body.children).find((child) => child.shadowRoot)?.shadowRoot ?? document.createDocumentFragment();
```

Ajouter :

```tsx
describe('BookSection — changer de livre', () => {
  it('le glyphe ⇄ est dans l’en-tête, pour un livre, une fiche vide et une erreur, mais pas pour une carte qui n’est pas un livre', async () => {
    for (const view of [{ status: 'detail', detail: etranger }, { status: 'empty' }, { status: 'error', message: 'x' }] as BookView[]) {
      await show(view);
      const button = container.querySelector<HTMLButtonElement>('[aria-label="Changer de livre"]');
      expect(button, view.status).not.toBeNull();
      expect(button?.hasAttribute('data-wmt-book-switch')).toBe(true);
    }
    await show({ status: 'none' });
    expect(container.querySelector('[aria-label="Changer de livre"]')).toBeNull();
  });

  it('le bouton ouvre la fenêtre ; un changement recharge la fiche', async () => {
    const service = await show({ status: 'detail', detail: etranger });
    expect(service.view).toHaveBeenCalledTimes(1);
    await act(async () => container.querySelector<HTMLElement>('[aria-label="Changer de livre"]')!.click());
    const open = dialog().querySelector('[role="dialog"][aria-label="Changer de livre"]');
    expect(open).not.toBeNull();
    await act(async () => dialog().querySelector<HTMLElement>('[aria-label="Aucun livre"]')!.click());
    expect(service.chooseNone).toHaveBeenCalledWith("L'Étranger");
    expect(service.view).toHaveBeenCalledTimes(2);
    expect(dialog().querySelector('[role="dialog"]')).toBeNull();
  });

  it('« aucun livre » se lit autrement qu’un livre introuvable', async () => {
    await show({ status: 'empty', none: true });
    expect(container.textContent).toContain('Aucun livre pour cette carte.');
    await show({ status: 'empty' });
    expect(container.textContent).toContain('Aucune fiche trouvée pour ce livre.');
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/BookSection.test.tsx`
Expected: FAIL (pas de bouton ⇄).

- [ ] **Step 3 : Implémenter dans `src/content/BookSection.tsx`**

Ajouter les imports `import { BookChoiceDialog } from './BookChoiceDialog';` (avec les autres imports locaux) et, si besoin, `type CSSProperties` est déjà importé. Ajouter, sous la constante `link` :

```tsx
const SIZE = 44; // cible tactile
const iconButton: CSSProperties = { width: SIZE, height: SIZE, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };
```

Remplacer le composant exporté `BookSection` (de `type Props` jusqu'à la fin du fichier) par :

```tsx
type Props = { slug: string; title: string };

// Section « livre » de la fiche native d'une carte : un livre (Open Library), ou une fiche vide avec le glyphe pour en choisir un ; rien pour les autres cartes.
export function BookSection({ slug, title }: Props) {
  const service = getBookService();
  const [view, setView] = useState<BookView | null>(null);
  const [version, setVersion] = useState(0);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    service
      .view(slug, title)
      .catch((): BookView => ({ status: 'error', message: 'Le livre est indisponible pour le moment.' }))
      .then((next) => !cancelled && setView(next));
    return () => {
      cancelled = true;
    };
  }, [service, slug, title, version]);

  if (!service || !view || view.status === 'none') return null;
  const current = view.status === 'detail' ? view.detail : null;

  return (
    <div data-wmt-book-card="" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
        <Glyph name="book" size={16} />
        <span style={{ flex: 1, minWidth: 0 }}>Livre</span>
        <button type="button" data-wmt-book-switch="" onClick={() => setChoosing(true)} aria-label="Changer de livre" title="Changer de livre" style={iconButton}>
          <Glyph name="swap" />
        </button>
      </div>
      {view.status === 'error' && (
        <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
          {view.message}
        </p>
      )}
      {view.status === 'empty' && <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>{view.none ? 'Aucun livre pour cette carte.' : 'Aucune fiche trouvée pour ce livre.'}</p>}
      {current && <Detail detail={current} />}
      {choosing && (
        <BookChoiceDialog service={service} slug={slug} title={title} currentId={current?.id ?? null} onChanged={() => setVersion((value) => value + 1)} onClose={() => setChoosing(false)} />
      )}
    </div>
  );
}
```

(Le test existant « l’hôte de la section porte l’attribut utilisé par la visite guidée » cherche `[data-wmt-book-card]` : l'attribut est conservé.)

- [ ] **Step 4 : Relancer**

Run: `npx vitest run tests/content/BookSection.test.tsx tests/content/BookChoiceDialog.test.tsx && npm run typecheck`
Expected: PASS (les 5 tests existants + 3 nouveaux), aucune erreur de types.

- [ ] **Step 5 : Commit**

```bash
git add src/content/BookSection.tsx tests/content/BookSection.test.tsx
git commit -m "feat(book): glyphe ⇄ « Changer de livre » dans la section"
```

---

### Task 5 : Câblage de la surcouche et visite guidée

**Files:**
- Modify: `src/app/overlay.ts` (création du service : `choices`, `onChoice` ; choix de la carte de la visite)
- Modify: `src/core/whats-new/types.ts` (`CardKind`), `src/core/whats-new/entries.ts` (fiche `livres` → `livres-v2` avec deux étapes)
- Test: `tests/core/whats-new/pick-card.test.ts` (ajout), `tests/core/whats-new/entries.test.ts` (existant)

**Interfaces:**
- Consumes: `createBookChoiceRepo` (Task 1), `images.forgetGameArt` (existant), `getBookService().bookSlugs`.
- Produces: `CardKind = 'game' | 'music' | 'screen' | 'book' | 'any'` ; la visite ouvre une vraie carte de livre.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `tests/core/whats-new/pick-card.test.ts` (lire d'abord le fichier : réutiliser l'aide de cartes et la forme de `slugsOf` qu'il emploie) :

```ts
it('choisit la première carte de la nature « book »', async () => {
  const cards = [{ slug: 'A', title: 'A' }, { slug: 'B', title: 'B' }, { slug: 'C', title: 'C' }];
  const slugsOf = vi.fn(async (kind: string) => (kind === 'book' ? new Set(['B', 'C']) : new Set<string>()));
  expect((await pickCard('book', cards, slugsOf))?.slug).toBe('B');
  expect(slugsOf).toHaveBeenCalledWith('book', cards);
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/whats-new/pick-card.test.ts && npm run typecheck`
Expected: échec de typecheck (`'book'` n'est pas un `CardKind`) ; le test ne compile pas.

- [ ] **Step 3 : Implémenter**

`src/core/whats-new/types.ts` : `export type CardKind = 'game' | 'music' | 'screen' | 'book' | 'any';`

`src/app/overlay.ts` : dans le bloc livres (`createBookService({ … })`), ajouter `choices: createBookChoiceRepo(store),` après `books: …,` et, après `cache: …,` :

```ts
      // Autre livre choisi pour une carte : son image mémorisée (canal d'image « officiel » des jeux) n'est plus la bonne.
      onChoice: (slug) => void images.forgetGameArt(slug),
```

ajouter `createBookChoiceRepo` à l'import de `'../core/book/book-repo'`, et dans le choix de carte de la visite (`pick: (kind, cards) => pickCard(kind, cards, async (nature, candidates) => …)`) remplacer l'expression par :

```ts
          (nature === 'game'
            ? await getGameService()?.gameSlugs(candidates)
            : nature === 'book'
              ? await getBookService()?.bookSlugs(candidates)
              : nature === 'music'
                ? await getMusicService()?.musicSlugs(candidates)
                : await getScreenService()?.screenSlugs(candidates)) ?? new Set<string>(),
```

`src/core/whats-new/entries.ts` : remplacer l'entrée `id: 'livres'` par ce qui suit (nouvel `id` : la fiche est modifiée, donc annoncée de nouveau ; garder la place juste après `jeux-video`) :

```ts
  {
    id: 'livres-v2',
    theme: 'fiche',
    glyph: '📖',
    title: 'Livres',
    summary: 'Synopsis, informations, couverture, et changer de livre',
    steps: [
      {
        target: '[data-wmt-book]',
        title: 'Fiche d’un livre',
        text: 'Sur une carte de roman, de poème, d’essai, de pièce de théâtre ou de bande dessinée, la fiche affiche l’auteur, l’année, l’éditeur, le nombre de pages, les genres et un synopsis en grand. La couverture du livre devient l’image de la carte quand elle existe.',
        details: [
          { label: 'D’où viennent les données', text: 'Wikidata pour reconnaître qu’une carte est un livre et retrouver son identifiant Open Library ; Open Library pour l’auteur, l’édition et la couverture ; l’introduction de l’article Wikipédia pour le synopsis (à défaut, la description d’Open Library).' },
          { label: 'Comment s’en servir', text: 'Faites défiler le synopsis dans son cadre ; « Lire l’article complet » ouvre Wikipédia. « Fiche Open Library » ouvre la page de l’œuvre. Un petit livre ouvert marque, dans les listes, les cartes de livres.' },
          { label: 'À savoir', text: 'Quand Wikidata ne donne pas l’identifiant, le livre est cherché par son titre exact : un homonyme peut se glisser, et la couverture automatique n’est alors pas posée. Prix, achat et lecture gratuite arriveront dans une prochaine version.' },
        ],
        scene: { card: 'book' },
        glyph: '📖',
      },
      {
        target: '[data-wmt-book-switch]',
        title: 'Changer de livre',
        text: 'Le bouton à double flèche, à droite de « Livre », permet de corriger le livre d’une carte : recherchez-le par son titre, choisissez-le, ou dites que la carte n’a pas de livre.',
        details: [
          { label: 'D’où viennent les données', text: 'La recherche interroge Open Library avec le titre de la carte (modifiable). Le livre que vous choisissez est gardé sur votre appareil, carte par carte.' },
          { label: 'Comment s’en servir', text: 'Touchez le bouton, relisez les résultats (couverture, titre, auteur, année), touchez un livre pour le voir en aperçu, puis « Utiliser ce livre ». « Aucun livre » vide la section ; « Revenir au choix automatique » efface votre choix.' },
          { label: 'À savoir', text: 'Votre choix passe avant la reconnaissance automatique, et sa couverture devient l’image de la carte : c’est le meilleur moyen de remplacer un mauvais livre ou d’obtenir une couverture quand l’identifiant Wikidata manque. Coller l’adresse d’une page Open Library n’est pas encore possible.' },
        ],
        scene: { card: 'book' },
        glyph: '🔁',
      },
    ],
  },
```

- [ ] **Step 4 : Vérifier**

Run: `npx vitest run tests/core/whats-new && npm run typecheck && npm test && npm run build`
Expected: tout passe (identifiants uniques, au moins deux paragraphes titrés par étape, une seule fiche `fresh`) ; `market-search-flow` est instable sous la charge de la suite complète : s'il est seul à échouer, le relancer isolément. Run: `grep -n "createBookChoiceRepo\|choices: createBookChoiceRepo\|onChoice\|nature === 'book'" src/app/overlay.ts` : une occurrence de chaque câblage.

- [ ] **Step 5 : Commit**

```bash
git add src/app/overlay.ts src/core/whats-new/types.ts src/core/whats-new/entries.ts tests/core/whats-new/pick-card.test.ts
git commit -m "feat(book): brancher le choix du livre dans la surcouche et la visite guidée (fiche « Livres » v2)"
```

---

### Task 6 : Vérification finale et livraison

**Files:** aucun (livraison).

- [ ] **Step 1 : Vérification complète**

Run: `npm run typecheck && npm test && npm run build`
Expected: tout passe.

- [ ] **Step 2 : Vérification manuelle dans Chrome (à faire par l'utilisateur ; ne pas la déclarer faite)**

Recharger l'extension. Ouvrir la fiche d'un livre de la Collection : le bouton ⇄ à droite de « Livre » ; la fenêtre s'ouvre avec le titre de la carte déjà cherché ; choisir un livre → aperçu → « Utiliser ce livre » : la section et **l'image de la carte** changent (couverture du livre choisi) ; « Aucun livre » vide la section (message « Aucun livre pour cette carte. ») ; « Revenir au choix automatique » restaure l'automatique. Vérifier aussi la visite guidée « Livres » (ouvre une vraie carte de livre, éclaire la section puis le bouton ⇄), le mobile (zones de 44 px, fenêtre à 85 % de hauteur) ; APK à la demande.

- [ ] **Step 3 : Pousser, ouvrir et fusionner la PR (règles du projet : sans demander)**

```bash
git push -u origin feat/livres-changer
gh pr create --title "feat(book): changer de livre ⇄ (recherche Open Library, aucun livre, retour automatique)" --body "Conception : docs/superpowers/specs/2026-10-07-livres-design.md ; plan : docs/superpowers/plans/2026-10-07-livres-changer.md (plan 3 sur la catégorie Livres).

- Glyphe ⇄ « Changer de livre » dans la section Livre ; fenêtre de recherche Open Library (titre de la carte prérempli), aperçu, « Utiliser ce livre », « Aucun livre », « Revenir au choix automatique ».
- Choix mémorisé par carte (book-choice-v1), prioritaire sur Wikidata et le repli par titre, y compris pour la couverture ; l'image mémorisée de la carte est oubliée au changement.
- La visite guidée ouvre une vraie carte de livre (CardKind 'book') ; fiche WikiHow « Livres » v2 (deux étapes).
- Hors périmètre : lien Open Library collé (reporté).

Vérifié : typecheck, tests, build. Reste la vérification manuelle dans Chrome ; APK à la demande.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --merge
```

- [ ] **Step 4 : Livrer en pré-prod (règle : sans demander après fusion)**

Run: `git switch main && git pull && npm run build && npm run preprod`
Expected: pre-release `preprod-N`. La production (`npm run promouvoir`) n'est **jamais** lancée sans ordre explicite de l'utilisateur.
