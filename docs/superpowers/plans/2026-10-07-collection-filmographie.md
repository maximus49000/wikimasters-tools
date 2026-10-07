# Ma collection dans la filmographie — plan d'implémentation (plan 1 sur 5 de la catégorie Livres)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Dans la filmographie d'un acteur ou d'un réalisateur, repérer les films et séries dont on possède la carte (miniature en cadre de rareté, pastille ×N, bouton « Voir ma carte », résumé « N / M dans ma collection », interrupteur « Seulement ma collection »), avec un composant de liste partagé que la bibliographie des écrivains réutilisera (plan 5).

**Architecture :** une fonction pure inverse `screen-v1` (identifiant TMDB → carte possédée) ; un petit service `collection-marks` la tient à jour (abonné à la Collection, résout en arrière-plan les identifiants TMDB des cartes de cinéma) ; `WorkList` (présentation pure) remplace la liste en dur de `ScreenSection.tsx`, qui lui fournit les lignes. La miniature de carte de `LinkedCards.tsx` est extraite en `CardThumb`.

**Tech Stack :** TypeScript, React 19 (rendu dans un shadow DOM), Vitest + jsdom, WXT.

**Spec :** `docs/superpowers/specs/2026-10-07-livres-design.md`, section « Ma collection dans les listes (bibliographie et filmographie) » ; maquette (non versionnée) `.superpowers/maquette-livres.html`, section 3.

## Global Constraints

- Zones tactiles de **44 px** ; glyphes de l'application (`Glyphs.tsx`) plutôt que du texte ou des émojis ; même contenu sur bureau et mobile.
- Textes de l'interface en **français** ; commentaires de code en français, sobres, dans le style du dépôt.
- Le rendu de la filmographie pour les cartes **non possédées** ne change pas (liste `maxHeight: min(180px, 28vh)`, ligne de 44 px minimum, affiche 26×38, ★ note).
- Rien n'est inventé : une œuvre n'est « possédée » que si sa carte est dans la Collection (`KnownCard`) et que son identifiant TMDB est connu par `screen-v1` ; `copies` à 0 ou moins = non possédée, `copies` inconnu = possédée sans pastille.
- Résolution en arrière-plan par lots de **50** articles, sans bloquer l'affichage (limite Wikipédia/Wikidata : 200 requêtes par minute et par IP).
- Un échec réseau n'affiche rien d'anormal : la liste reste celle sans repères (jamais d'erreur visible pour les repères).
- `exactOptionalPropertyTypes` est actif : propriétés optionnelles ajoutées par `...(x ? { k: x } : {})`.
- Commandes de vérification : `npm run typecheck`, `npm test`, `npm run build`.

---

### Task 0 : Branche de travail

**Files:** aucun.

- [ ] **Step 1 : Vérifier la branche et l'état du dépôt**

Run: `git branch --show-current && git status --short`
Expected: branche `docs/livres-conception` (contient la spec et ce plan), arbre propre. Une autre session peut travailler dans le même dossier : si la branche ou l'arbre diffère, **ne pas utiliser `git stash -u`** ; créer un worktree hors du dépôt (`git worktree add ../Wikimasters-livres -b feat/collection-filmographie docs/livres-conception`) et y travailler.

- [ ] **Step 2 : Créer la branche de l'implémentation**

Run: `git switch -c feat/collection-filmographie`
Expected: `Switched to a new branch 'feat/collection-filmographie'`

---

### Task 1 : Logique pure « œuvre possédée »

**Files:**
- Create: `src/core/collection/work-marks.ts`
- Test: `tests/core/collection/work-marks.test.ts`

**Interfaces:**
- Consumes: `KnownCard` (`src/core/collection/collection-book.ts`), `ScreenState` (`src/core/screen/screen-repo.ts`), `MediaType` (`src/core/screen/tmdb-api.ts`).
- Produces :
  - `type ScreenOwnership = { movie: ReadonlyMap<number, KnownCard>; tv: ReadonlyMap<number, KnownCard> }`
  - `const EMPTY_OWNERSHIP: ScreenOwnership`
  - `screenOwnership(cards: readonly KnownCard[], screen: ScreenState): ScreenOwnership`
  - `ownedCardOf(ownership: ScreenOwnership, mediaType: MediaType, id: number): KnownCard | undefined`
  - `ownershipSignature(ownership: ScreenOwnership): string`
  - `rarityName(rarity: string | undefined): string | undefined`

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
// tests/core/collection/work-marks.test.ts
import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../../src/core/collection/collection-book';
import { EMPTY_OWNERSHIP, ownedCardOf, ownershipSignature, rarityName, screenOwnership } from '../../../src/core/collection/work-marks';

const card = (slug: string, extra: Partial<KnownCard> = {}): KnownCard => ({ slug, title: slug, ...extra });

describe('screenOwnership', () => {
  it('associe chaque identifiant TMDB à la carte qui le porte', () => {
    const cards = [card('Inception', { rarity: 'L', copies: 2 }), card('Breaking_Bad', { rarity: 'SR', copies: 1 }), card('Paris')];
    const screen = { Inception: { movieId: 27205 }, Breaking_Bad: { tvId: 1396 }, Paris: {} };
    const ownership = screenOwnership(cards, screen);
    expect(ownedCardOf(ownership, 'movie', 27205)?.slug).toBe('Inception');
    expect(ownedCardOf(ownership, 'tv', 1396)?.slug).toBe('Breaking_Bad');
    expect(ownedCardOf(ownership, 'movie', 1396)).toBeUndefined();
  });

  it('ignore une carte sans identifiant connu ou absente de screen-v1', () => {
    const ownership = screenOwnership([card('Inconnue'), card('Vide')], { Vide: {} });
    expect(ownership.movie.size + ownership.tv.size).toBe(0);
  });

  it('ignore une carte dont le nombre d’exemplaires est nul, garde celle dont il est inconnu', () => {
    const cards = [card('Vendue', { copies: 0 }), card('Sans_compte')];
    const ownership = screenOwnership(cards, { Vendue: { movieId: 1 }, Sans_compte: { movieId: 2 } });
    expect(ownedCardOf(ownership, 'movie', 1)).toBeUndefined();
    expect(ownedCardOf(ownership, 'movie', 2)?.slug).toBe('Sans_compte');
  });

  it('garde la première carte quand deux cartes portent le même identifiant', () => {
    const ownership = screenOwnership([card('A'), card('B')], { A: { movieId: 7 }, B: { movieId: 7 } });
    expect(ownedCardOf(ownership, 'movie', 7)?.slug).toBe('A');
  });
});

describe('ownershipSignature', () => {
  it('change quand une rareté ou un nombre d’exemplaires change, pas autrement', () => {
    const base = screenOwnership([card('A', { rarity: 'R', copies: 1 })], { A: { movieId: 1 } });
    const same = screenOwnership([card('A', { rarity: 'R', copies: 1 })], { A: { movieId: 1 } });
    const more = screenOwnership([card('A', { rarity: 'R', copies: 2 })], { A: { movieId: 1 } });
    expect(ownershipSignature(same)).toBe(ownershipSignature(base));
    expect(ownershipSignature(more)).not.toBe(ownershipSignature(base));
    expect(ownershipSignature(EMPTY_OWNERSHIP)).toBe('');
  });
});

describe('rarityName', () => {
  it('donne le nom français d’une rareté, renvoie le code inconnu tel quel, rien sans rareté', () => {
    expect(rarityName('L')).toBe('Légendaire');
    expect(rarityName('PC')).toBe('Peu commune');
    expect(rarityName('XX')).toBe('XX');
    expect(rarityName(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run tests/core/collection/work-marks.test.ts`
Expected: FAIL (`Failed to resolve import "../../../src/core/collection/work-marks"`).

- [ ] **Step 3 : Écrire l'implémentation minimale**

```ts
// src/core/collection/work-marks.ts
import type { MediaType } from '../screen/tmdb-api';
import type { ScreenState } from '../screen/screen-repo';
import type { KnownCard } from './collection-book';

// Les films et séries dont on possède la carte, par identifiant TMDB (même principe que les identifiants de `screen-v1`).
export type ScreenOwnership = { movie: ReadonlyMap<number, KnownCard>; tv: ReadonlyMap<number, KnownCard> };

export const EMPTY_OWNERSHIP: ScreenOwnership = { movie: new Map(), tv: new Map() };

// Une carte sans exemplaire (vendue, échangée) n'est pas possédée ; un nombre inconnu compte comme possédée.
export function screenOwnership(cards: readonly KnownCard[], screen: ScreenState): ScreenOwnership {
  const movie = new Map<number, KnownCard>();
  const tv = new Map<number, KnownCard>();
  for (const card of cards) {
    if (card.copies !== undefined && card.copies <= 0) continue;
    const ids = screen[card.slug];
    if (!ids) continue;
    if (ids.movieId !== undefined && !movie.has(ids.movieId)) movie.set(ids.movieId, card);
    if (ids.tvId !== undefined && !tv.has(ids.tvId)) tv.set(ids.tvId, card);
  }
  return { movie, tv };
}

export const ownedCardOf = (ownership: ScreenOwnership, mediaType: MediaType, id: number): KnownCard | undefined =>
  (mediaType === 'movie' ? ownership.movie : ownership.tv).get(id);

// Empreinte de ce que l'affichage montre (carte, rareté, exemplaires, image) : un nouvel objet n'est publié que si elle change.
export function ownershipSignature(ownership: ScreenOwnership): string {
  const part = (kind: string, map: ReadonlyMap<number, KnownCard>) =>
    [...map].map(([id, card]) => `${kind}${id}:${card.slug}:${card.rarity ?? ''}:${card.copies ?? ''}:${card.imageUrl ?? ''}`);
  return [...part('m', ownership.movie), ...part('t', ownership.tv)].join('|');
}

const RARITY_NAMES: Record<string, string> = { L: 'Légendaire', UR: 'Ultra rare', SR: 'Super rare', R: 'Rare', PC: 'Peu commune', C: 'Commune' };

export const rarityName = (rarity: string | undefined): string | undefined => (rarity ? (RARITY_NAMES[rarity] ?? rarity) : undefined);
```

- [ ] **Step 4 : Relancer le test, vérifier qu'il passe**

Run: `npx vitest run tests/core/collection/work-marks.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/core/collection/work-marks.ts tests/core/collection/work-marks.test.ts
git commit -m "feat(collection): repérer les films et séries possédés par identifiant TMDB"
```

---

### Task 2 : Extraire la miniature de carte (`CardThumb`)

**Files:**
- Create: `src/content/CardThumb.tsx`
- Modify: `src/content/LinkedCards.tsx` (supprimer `Thumb` local lignes 30-57 environ et ses imports devenus inutiles ; utiliser `CardThumb`)
- Test: `tests/content/card-thumb.test.tsx`

**Interfaces:**
- Consumes: `getImageService()` (`./image-registry`), `rarityKey` (`./card-rarity`), `KnownCard`.
- Produces: `CardThumb({ card, width?, height? }: { card: KnownCard; width?: number; height?: number })` — mêmes rendu et abonnement aux images que l'ancien `Thumb` ; tailles par défaut 34×48.

- [ ] **Step 1 : Écrire le test qui échoue**

```tsx
// tests/content/card-thumb.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CardThumb } from '../../src/content/CardThumb';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CardThumb', () => {
  it('prend la taille par défaut 34×48, ou celle demandée', async () => {
    await act(async () => root.render(<CardThumb card={{ slug: 'A', title: 'A', rarity: 'SR' }} />));
    const small = container.firstElementChild as HTMLElement;
    expect([small.style.width, small.style.height]).toEqual(['34px', '48px']);
    await act(async () => root.render(<CardThumb card={{ slug: 'A', title: 'A', rarity: 'SR' }} width={30} height={42} />));
    const custom = container.firstElementChild as HTMLElement;
    expect([custom.style.width, custom.style.height]).toEqual(['30px', '42px']);
  });

  it('colore le cadre selon la rareté et affiche l’image de la carte', async () => {
    await act(async () => root.render(<CardThumb card={{ slug: 'A', title: 'A', rarity: 'L', imageUrl: 'https://x/a.png' }} />));
    const thumb = container.firstElementChild as HTMLElement;
    expect(thumb.style.border).toContain('--color-rarity-l');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://x/a.png');
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run tests/content/card-thumb.test.tsx`
Expected: FAIL (`Failed to resolve import "../../src/content/CardThumb"`).

- [ ] **Step 3 : Créer `CardThumb.tsx` (copie de `Thumb`, tailles en paramètres)**

```tsx
// src/content/CardThumb.tsx
import { useSyncExternalStore } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import { rarityKey } from './card-rarity';
import { getImageService } from './image-registry';

const noSubscribe = () => () => undefined;

// Miniature : couleur de rareté en cadre et en fond, image en haut (celle du jeu, sinon l'image de remplacement déjà trouvée).
export function CardThumb({ card, width = 34, height = 48 }: { card: KnownCard; width?: number; height?: number }) {
  const images = getImageService();
  // S'abonne aux images qui arrivent (affiche du jeu vidéo, couverture, image de remplacement).
  const url = useSyncExternalStore(images?.subscribe ?? noSubscribe, () => (images ? images.displayUrl(card.slug, card.imageUrl) : card.imageUrl));
  const color = card.rarity ? `var(--color-rarity-${rarityKey(card.rarity)}, #94a3b8)` : '#94a3b8';
  return (
    <span
      aria-hidden="true"
      style={{
        flex: 'none',
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 5,
        border: `1.5px solid ${color}`,
        boxShadow: `0 0 6px color-mix(in srgb, ${color} 60%, transparent)`,
        background: `linear-gradient(160deg, ${color}, #0d1117 140%)`,
      }}
    >
      {url ? <img src={url} alt="" referrerPolicy="no-referrer" style={{ position: 'absolute', inset: '0 0 50% 0', width: '100%', height: '50%', objectFit: 'cover' }} /> : null}
    </span>
  );
}
```

- [ ] **Step 4 : Brancher `LinkedCards.tsx` sur `CardThumb`**

Dans `src/content/LinkedCards.tsx` : supprimer la fonction `Thumb` (le commentaire « Miniature : couleur de rareté… » et tout le corps jusqu'à l'accolade fermante), remplacer `<Thumb card={card} />` par `<CardThumb card={card} />`, ajouter `import { CardThumb } from './CardThumb';`, et retirer les imports devenus inutiles : `useSyncExternalStore` n'est **pas** inutile (utilisé par `LinkedBlock`), `rarityKey` et `getImageService` le deviennent s'ils ne sont plus utilisés ailleurs dans le fichier (le vérifier avec la commande suivante). `noSubscribe` reste (utilisé par `LinkedCardsWindow`).

Run: `grep -n "rarityKey\|getImageService\|Thumb" src/content/LinkedCards.tsx`
Expected: plus aucune occurrence de `rarityKey` ni `getImageService` ; seules `CardThumb` (import + usage) restent. Retirer les imports orphelins sinon.

- [ ] **Step 5 : Vérifier tests et types**

Run: `npx vitest run tests/content/card-thumb.test.tsx tests/content/linked-cards.test.tsx && npm run typecheck`
Expected: PASS (les tests existants des cartes liées passent sans changement), aucune erreur de types.

- [ ] **Step 6 : Commit**

```bash
git add src/content/CardThumb.tsx src/content/LinkedCards.tsx tests/content/card-thumb.test.tsx
git commit -m "refactor(content): extraire la miniature de carte en CardThumb"
```

---

### Task 3 : Service `collection-marks` et son registre

**Files:**
- Create: `src/content/collection-marks.ts`, `src/content/collection-marks-registry.ts`
- Test: `tests/content/collection-marks.test.ts`

**Interfaces:**
- Consumes: `screenOwnership`, `ownershipSignature`, `EMPTY_OWNERSHIP`, `ScreenOwnership` (Task 1) ; `CollectionRepo['list' | 'subscribe']` ; `ScreenRepo['load' | 'resolve']` ; `ScreenService['screenSlugs']`.
- Produces :
  - `type CollectionMarks = { subscribe(listener: () => void): () => void; ownership(): ScreenOwnership; ensure(): void }`
  - `createCollectionMarks(deps: { collection: Pick<CollectionRepo, 'list' | 'subscribe'>; screen: Pick<ScreenRepo, 'load' | 'resolve'>; screenSlugs: (cards: KnownCard[]) => Promise<Set<string>> }): CollectionMarks`
  - `setCollectionMarks(next: CollectionMarks | null): void`, `getCollectionMarks(): CollectionMarks | null`

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
// tests/content/collection-marks.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createCollectionMarks } from '../../src/content/collection-marks';
import type { KnownCard } from '../../src/core/collection/collection-book';
import { ownedCardOf } from '../../src/core/collection/work-marks';
import type { ScreenState } from '../../src/core/screen/screen-repo';

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

function setup(cards: KnownCard[], initial: ScreenState, wikidata: ScreenState) {
  let state = initial;
  let collectionListener: (() => void) | undefined;
  const resolve = vi.fn(async (slugs: string[]) => {
    state = { ...state, ...Object.fromEntries(slugs.filter((slug) => wikidata[slug]).map((slug) => [slug, wikidata[slug]!])) };
    return state;
  });
  const marks = createCollectionMarks({
    collection: { list: async () => cards, subscribe: (listener) => ((collectionListener = listener), () => undefined) },
    screen: { load: async () => state, resolve },
    screenSlugs: async (list) => new Set(list.filter((card) => card.slug !== 'Paris').map((card) => card.slug)),
  });
  return { marks, resolve, notify: () => collectionListener?.() };
}

describe('createCollectionMarks', () => {
  it('rend l’état déjà connu, puis complète par Wikidata en arrière-plan', async () => {
    const cards = [{ slug: 'Inception', title: 'Inception', rarity: 'L', copies: 1 }, { slug: 'Paris', title: 'Paris' }];
    const { marks, resolve } = setup(cards, {}, { Inception: { movieId: 27205 } });
    const listener = vi.fn();
    marks.subscribe(listener);
    expect(marks.ownership().movie.size).toBe(0);
    marks.ensure();
    await flush();
    expect(ownedCardOf(marks.ownership(), 'movie', 27205)?.slug).toBe('Inception');
    expect(listener).toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith(['Inception']); // « Paris » n'est pas une carte de cinéma
  });

  it('ne publie un nouvel objet que si ce qui s’affiche change', async () => {
    const { marks, notify } = setup([{ slug: 'A', title: 'A', copies: 1 }], { A: { movieId: 1 } }, {});
    marks.ensure();
    await flush();
    const first = marks.ownership();
    notify();
    await flush();
    expect(marks.ownership()).toBe(first);
  });

  it('ne lance la résolution qu’une fois, même après plusieurs appels', async () => {
    const { marks, resolve } = setup([{ slug: 'A', title: 'A' }], {}, {});
    marks.ensure();
    marks.ensure();
    await flush();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('résout par lots de 50 articles', async () => {
    const cards = Array.from({ length: 120 }, (_, i) => ({ slug: `C${i}`, title: `C${i}` }));
    const { marks, resolve } = setup(cards, {}, {});
    marks.ensure();
    await flush();
    expect(resolve.mock.calls.map(([batch]) => batch.length)).toEqual([50, 50, 20]);
  });

  it('survit à un échec réseau sans lever', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const marks = createCollectionMarks({
      collection: { list: async () => [{ slug: 'A', title: 'A' }], subscribe: () => () => undefined },
      screen: { load: async () => ({}), resolve: async () => Promise.reject(new Error('429')) },
      screenSlugs: async () => new Set(['A']),
    });
    marks.ensure();
    await flush();
    expect(marks.ownership().movie.size).toBe(0);
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run tests/content/collection-marks.test.ts`
Expected: FAIL (`Failed to resolve import "../../src/content/collection-marks"`).

- [ ] **Step 3 : Écrire le service et le registre**

```ts
// src/content/collection-marks.ts
import type { KnownCard } from '../core/collection/collection-book';
import type { CollectionRepo } from '../core/collection/collection-repo';
import { EMPTY_OWNERSHIP, ownershipSignature, screenOwnership, type ScreenOwnership } from '../core/collection/work-marks';
import type { ScreenRepo } from '../core/screen/screen-repo';

const BATCH = 50;
const LOG = '[wikimasters-tools]';

export type CollectionMarks = {
  subscribe(listener: () => void): () => void;
  // Les films et séries possédés : même objet tant que rien de visible ne change, pour un rendu stable.
  ownership(): ScreenOwnership;
  // Lance (une seule fois) la lecture des identifiants TMDB des cartes de cinéma de la Collection, en arrière-plan.
  ensure(): void;
};

// Repère, dans les listes d'œuvres (filmographie, plus tard bibliographie), les cartes que l'on possède.
export function createCollectionMarks(deps: {
  collection: Pick<CollectionRepo, 'list' | 'subscribe'>;
  screen: Pick<ScreenRepo, 'load' | 'resolve'>;
  screenSlugs: (cards: KnownCard[]) => Promise<Set<string>>;
}): CollectionMarks {
  const { collection, screen, screenSlugs } = deps;
  let current: ScreenOwnership = EMPTY_OWNERSHIP;
  let signature = '';
  let started = false;
  const listeners = new Set<() => void>();

  const refresh = async (): Promise<void> => {
    const next = screenOwnership(await collection.list(), await screen.load());
    const nextSignature = ownershipSignature(next);
    if (nextSignature === signature) return;
    signature = nextSignature;
    current = next;
    for (const listener of listeners) listener();
  };

  const resolveAll = async (): Promise<void> => {
    const cinema = [...(await screenSlugs(await collection.list()))];
    for (let i = 0; i < cinema.length; i += BATCH) {
      await screen.resolve(cinema.slice(i, i + BATCH));
      await refresh();
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    ownership: () => current,
    ensure() {
      if (started) return;
      started = true;
      collection.subscribe(() => void refresh().catch(() => undefined));
      void (async () => {
        try {
          await refresh();
          await resolveAll();
        } catch (error) {
          console.warn(LOG, 'repérage de la Collection dans les listes indisponible :', error);
        }
      })();
    },
  };
}
```

```ts
// src/content/collection-marks-registry.ts
import type { CollectionMarks } from './collection-marks';

// Créé une fois par la surcouche ; les listes d'œuvres des fiches le lisent ici.
let marks: CollectionMarks | null = null;

export const setCollectionMarks = (next: CollectionMarks | null): void => {
  marks = next;
};
export const getCollectionMarks = (): CollectionMarks | null => marks;
```

- [ ] **Step 4 : Relancer le test, vérifier qu'il passe**

Run: `npx vitest run tests/content/collection-marks.test.ts && npm run typecheck`
Expected: PASS (5 tests), aucune erreur de types. Si `subscribe` du test ne type pas (`(listener) => ((collectionListener = listener), () => undefined)`), le remplacer par une fonction à corps explicite : `subscribe: (listener: () => void) => { collectionListener = listener; return () => undefined; }`.

- [ ] **Step 5 : Commit**

```bash
git add src/content/collection-marks.ts src/content/collection-marks-registry.ts tests/content/collection-marks.test.ts
git commit -m "feat(content): service de repérage de la Collection dans les listes d'œuvres"
```

---

### Task 4 : Composants `WorkList`, `WorkBack`, `OwnedNotice`

**Files:**
- Create: `src/content/WorkList.tsx`
- Test: `tests/content/work-list.test.tsx`

**Interfaces:**
- Consumes: `CardThumb` (Task 2), `rarityName` (Task 1), `Glyph` / `GlyphName` (`./Glyphs`, glyphes existants : `film`, `card`, `back`, `star`), `KnownCard`.
- Produces :
  - `type WorkItem = { key: string; title: string; year?: number; rating?: string; thumbUrl?: string; owned?: KnownCard }`
  - `WorkList({ glyph, label, items, emptyText, hidden?, onOpen, onOpenCard? })` — `onOpen(item: WorkItem): void`, `onOpenCard?(slug: string): void`
  - `WorkBack({ title, year?, label, onBack })`
  - `OwnedNotice({ card, onOpenCard? })`
  - Attributs de test : conteneur de liste `data-wmt-work-list`, lignes `li`, bouton d'ouverture `aria-label="Ouvrir {titre}"`, bouton carte `aria-label="Voir ma carte {titre}"`, interrupteur `aria-pressed`.

- [ ] **Step 1 : Écrire le test qui échoue**

```tsx
// tests/content/work-list.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OwnedNotice, WorkBack, WorkList, type WorkItem } from '../../src/content/WorkList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const items: WorkItem[] = [
  { key: 'movie-1', title: 'Les Petits Mouchoirs', year: 2010, rating: '7,0' },
  { key: 'movie-2', title: 'Inception', year: 2010, rating: '8,4', owned: { slug: 'Inception', title: 'Inception', rarity: 'L', copies: 1 } },
  { key: 'movie-3', title: 'La Môme', year: 2007, owned: { slug: 'La_Môme', title: 'La Môme', rarity: 'SR', copies: 3 } },
];
const onOpen = vi.fn();
const onOpenCard = vi.fn();
const show = (list: WorkItem[] = items, withCards = true) =>
  act(async () => root.render(<WorkList glyph="film" label="Filmographie" items={list} emptyText="Aucun titre connu." onOpen={onOpen} {...(withCards ? { onOpenCard } : {})} />));
const rows = () => [...container.querySelectorAll('li')];
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const toggle = () => [...container.querySelectorAll('button')].find((b) => b.hasAttribute('aria-pressed'));

beforeEach(() => {
  onOpen.mockReset();
  onOpenCard.mockReset();
});

describe('WorkList', () => {
  it('une liste sans carte possédée est celle d’avant : ni résumé, ni interrupteur, ni bouton carte', async () => {
    await show(items.slice(0, 1));
    expect(container.textContent).toContain('Filmographie');
    expect(container.textContent).toContain('· 1');
    expect(container.textContent).not.toContain('dans ma collection');
    expect(toggle()).toBeUndefined();
    expect(container.querySelector('button[aria-label^="Voir ma carte"]')).toBeNull();
  });

  it('résume « 2 / 3 dans ma collection » et marque les lignes possédées (rareté, ×N)', async () => {
    await show();
    expect(container.textContent).toContain('2 / 3 dans ma collection');
    expect(rows()).toHaveLength(3);
    expect(rows()[1]?.textContent).toContain('Légendaire');
    expect(rows()[2]?.textContent).toContain('×3');
    expect(rows()[0]?.textContent).not.toContain('×');
  });

  it('un appui sur la ligne ouvre l’œuvre ; le bouton carte ouvre la carte', async () => {
    await show();
    await act(async () => button('Ouvrir Inception')?.click());
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ key: 'movie-2' }));
    await act(async () => button('Voir ma carte Inception')?.click());
    expect(onOpenCard).toHaveBeenCalledWith('Inception');
  });

  it('sans action de carte, pas de bouton carte', async () => {
    await show(items, false);
    expect(container.querySelector('button[aria-label^="Voir ma carte"]')).toBeNull();
  });

  it('« Seulement ma collection » ne garde que les cartes possédées, et se désactive d’un appui', async () => {
    await show();
    await act(async () => toggle()?.click());
    expect(toggle()?.getAttribute('aria-pressed')).toBe('true');
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Inception'), expect.stringContaining('La Môme')]);
    expect(container.textContent).toContain('2 sur 3');
    await act(async () => toggle()?.click());
    expect(rows()).toHaveLength(3);
  });

  it('une liste vide affiche le texte prévu', async () => {
    await show([]);
    expect(container.textContent).toContain('Aucun titre connu.');
  });
});

describe('WorkBack et OwnedNotice', () => {
  it('la flèche de retour porte le libellé et rappelle le titre', async () => {
    const onBack = vi.fn();
    await act(async () => root.render(<WorkBack title="Inception" year={2010} label="Retour à la filmographie" onBack={onBack} />));
    expect(container.textContent).toContain('Inception');
    await act(async () => button('Retour à la filmographie')?.click());
    expect(onBack).toHaveBeenCalled();
  });

  it('le rappel « Tu possèdes cette carte » donne rareté et exemplaires, et ouvre la carte', async () => {
    await act(async () => root.render(<OwnedNotice card={{ slug: 'Inception', title: 'Inception', rarity: 'L', copies: 2 }} onOpenCard={onOpenCard} />));
    expect(container.textContent).toContain('Tu possèdes cette carte');
    expect(container.textContent).toContain('Légendaire');
    expect(container.textContent).toContain('×2');
    await act(async () => button('Ouvrir ma carte Inception')?.click());
    expect(onOpenCard).toHaveBeenCalledWith('Inception');
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run tests/content/work-list.test.tsx`
Expected: FAIL (`Failed to resolve import "../../src/content/WorkList"`).

- [ ] **Step 3 : Écrire `WorkList.tsx`**

```tsx
// src/content/WorkList.tsx
import { useState, type CSSProperties } from 'react';
import type { KnownCard } from '../core/collection/collection-book';
import { rarityName } from '../core/collection/work-marks';
import { CardThumb } from './CardThumb';
import { Glyph, type GlyphName } from './Glyphs';

const SIZE = 44; // cible tactile
const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const STAR = '#fbbf24';
const GOLD = '#facc15';
const iconButton: CSSProperties = { width: SIZE, height: SIZE, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8 };

// Une œuvre d'une liste (film, série, livre) ; `owned` = la carte de la Collection qui la représente.
export type WorkItem = { key: string; title: string; year?: number; rating?: string; thumbUrl?: string; owned?: KnownCard };

type ListProps = {
  glyph: GlyphName;
  label: string;
  items: readonly WorkItem[];
  emptyText: string;
  // Liste masquée (pas retirée) pendant la fiche d'une œuvre : le défilement est conservé au retour.
  hidden?: boolean;
  onOpen: (item: WorkItem) => void;
  // Ouvre la carte possédée ; sans lui, pas de bouton carte.
  onOpenCard?: (slug: string) => void;
};

function OwnedThumb({ card }: { card: KnownCard }) {
  return (
    <span style={{ position: 'relative', flex: 'none', display: 'inline-flex' }}>
      <CardThumb card={card} width={30} height={42} />
      {card.copies !== undefined && (
        <span style={{ position: 'absolute', right: -6, bottom: -6, minWidth: 18, height: 16, padding: '0 4px', borderRadius: 8, background: '#000', border: `1px solid ${GOLD}`, color: '#fff', font: '700 10px/14px system-ui, sans-serif', textAlign: 'center' }}>×{card.copies}</span>
      )}
    </span>
  );
}

// Liste d'œuvres d'une personne (filmographie, bibliographie) : les cartes possédées sont repérées, un interrupteur ne garde qu'elles.
export function WorkList({ glyph, label, items, emptyText, hidden = false, onOpen, onOpenCard }: ListProps) {
  const [mineOnly, setMineOnly] = useState(false);
  const ownedCount = items.filter((item) => item.owned).length;
  const filtering = mineOnly && ownedCount > 0;
  const shown = filtering ? items.filter((item) => item.owned) : items;
  return (
    <div data-wmt-work-list="" style={{ display: hidden ? 'none' : 'block' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13, fontWeight: 600 }}>
        <Glyph name={glyph} size={16} /> {label} <span style={{ fontWeight: 400, opacity: 0.7 }}>· {filtering ? `${shown.length} sur ${items.length}` : items.length}</span>
        {ownedCount > 0 && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, color: GOLD }}>
            <Glyph name="card" size={15} /> {ownedCount} / {items.length} dans ma collection
          </span>
        )}
      </div>
      {ownedCount > 0 && (
        <button
          type="button"
          aria-pressed={filtering}
          onClick={() => setMineOnly((value) => !value)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, margin: '6px 0', padding: '0 12px', cursor: 'pointer', color: filtering ? GOLD : 'inherit', background: filtering ? 'rgba(250,204,21,0.14)' : 'none', border: `1px solid ${filtering ? GOLD : 'var(--color-border, rgba(148,163,184,0.5))'}`, borderRadius: 999, font: '600 12px system-ui, sans-serif' }}
        >
          <Glyph name="card" size={15} /> Seulement ma collection
        </button>
      )}
      {items.length === 0 && <p style={{ margin: '6px 0 0', fontSize: 12, opacity: 0.7 }}>{emptyText}</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 'min(180px, 28vh)', overflowY: 'auto' }}>
        {shown.map((item) => {
          const owned = item.owned;
          return (
            <li key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: border, ...(owned ? { background: 'rgba(250,204,21,0.07)', borderRadius: 8 } : {}) }}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                aria-label={`Ouvrir ${item.title}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, minHeight: SIZE, padding: '2px 0', cursor: 'pointer', color: 'inherit', background: 'none', border: 0, textAlign: 'left', font: '13px system-ui, sans-serif' }}
              >
                {owned ? (
                  <OwnedThumb card={owned} />
                ) : (
                  <span style={{ width: 26, height: 38, flex: 'none', borderRadius: 3, background: item.thumbUrl ? `center / cover no-repeat url(${item.thumbUrl})` : 'rgba(148,163,184,0.25)' }} />
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: owned ? 600 : 400 }}>{item.title}</span>
                  {(item.year || owned) && (
                    <span style={{ fontSize: 11, opacity: 0.6 }}>
                      {item.year}
                      {owned?.rarity ? `${item.year ? ' · ' : ''}${rarityName(owned.rarity)}` : ''}
                    </span>
                  )}
                </span>
                {item.rating !== undefined && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: STAR, fontSize: 12 }}>
                    <Glyph name="star" size={13} /> {item.rating}
                  </span>
                )}
              </button>
              {owned && onOpenCard && (
                <button type="button" onClick={() => onOpenCard(owned.slug)} aria-label={`Voir ma carte ${item.title}`} title="Voir ma carte" style={{ ...iconButton, color: GOLD, borderColor: GOLD }}>
                  <Glyph name="card" size={20} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// En-tête d'une œuvre ouverte dans la section : flèche de retour à la liste, titre et année.
export function WorkBack({ title, year, label, onBack }: { title: string; year?: number | undefined; label: string; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button type="button" onClick={onBack} aria-label={label} title={label} style={iconButton}>
        <Glyph name="back" />
      </button>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600 }}>
        {title}
        {year && <span style={{ fontWeight: 400, opacity: 0.7 }}> {year}</span>}
      </span>
    </div>
  );
}

// Rappel dans la fiche d'une œuvre dont on possède la carte.
export function OwnedNotice({ card, onOpenCard }: { card: KnownCard; onOpenCard?: ((slug: string) => void) | undefined }) {
  const rarity = rarityName(card.rarity);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 12px', border: `1px solid ${GOLD}`, borderRadius: 10, background: 'rgba(250,204,21,0.08)', fontSize: 13, fontWeight: 600 }}>
      <span style={{ color: GOLD, display: 'inline-flex' }}>
        <Glyph name="card" size={22} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        Tu possèdes cette carte{rarity ? ` · ${rarity}` : ''}{card.copies !== undefined ? ` · ×${card.copies}` : ''}
      </span>
      {onOpenCard && (
        <button type="button" onClick={() => onOpenCard(card.slug)} aria-label={`Ouvrir ma carte ${card.title}`} title="Ouvrir ma carte" style={{ ...iconButton, color: GOLD, borderColor: GOLD }}>
          <Glyph name="external" size={18} />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4 : Relancer le test, vérifier qu'il passe**

Run: `npx vitest run tests/content/work-list.test.tsx && npm run typecheck`
Expected: PASS (8 tests), aucune erreur de types.

- [ ] **Step 5 : Commit**

```bash
git add src/content/WorkList.tsx tests/content/work-list.test.tsx
git commit -m "feat(content): liste d'œuvres partagée avec repérage des cartes possédées"
```

---

### Task 5 : Porter la filmographie sur `WorkList` et brancher le tout

**Files:**
- Modify: `src/content/ScreenSection.tsx` (remplacement complet, ci-dessous)
- Modify: `src/content/mount.tsx:172` (passer `host` et l'ouverture de carte)
- Modify: `src/app/overlay.ts:533-545` (créer et enregistrer `collection-marks`)
- Test: `tests/content/screen-section.test.tsx` (nouveau ; `ScreenSection` n'avait aucun test)

**Interfaces:**
- Consumes: `WorkList`, `WorkBack`, `OwnedNotice`, `WorkItem` (Task 4) ; `getCollectionMarks` (Task 3) ; `ownedCardOf`, `EMPTY_OWNERSHIP` (Task 1) ; `ScreenService['screenSlugs']`.
- Produces: `ScreenSection({ slug, title, onOpenCard? })` ; `setCollectionMarks(createCollectionMarks(...))` appelé à la création du service d'écran.

- [ ] **Step 1 : Écrire le test qui échoue**

```tsx
// tests/content/screen-section.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCollectionMarks } from '../../src/content/collection-marks-registry';
import { setMusicService } from '../../src/content/music-registry';
import { ScreenSection } from '../../src/content/ScreenSection';
import { setScreenService } from '../../src/content/screen-registry';
import type { ScreenService, ScreenView } from '../../src/content/screen-service';
import type { KnownCard } from '../../src/core/collection/collection-book';
import { screenOwnership } from '../../src/core/collection/work-marks';
import type { FilmographyItem, ScreenDetail } from '../../src/core/screen/tmdb-api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const items: FilmographyItem[] = [
  { mediaType: 'movie', id: 1, title: 'Les Petits Mouchoirs', year: 2010, rating: 7 },
  { mediaType: 'movie', id: 27205, title: 'Inception', year: 2010, rating: 8.4 },
];
const detail: ScreenDetail = { mediaType: 'movie', id: 27205, title: 'Inception', genres: [], overview: 'Un voleur de rêves.' } as unknown as ScreenDetail;
const inception: KnownCard = { slug: 'Inception', title: 'Inception', rarity: 'L', copies: 2 };
const onOpenCard = vi.fn();

async function show(view: ScreenView, owned: KnownCard[] = []) {
  const service = { view: vi.fn(async () => view), detail: vi.fn(async () => ({ status: 'detail', detail })) } as unknown as ScreenService;
  setScreenService(service);
  const ownership = screenOwnership(owned, { Inception: { movieId: 27205 } });
  setCollectionMarks({ subscribe: () => () => undefined, ownership: () => ownership, ensure: vi.fn() });
  await act(async () => root.render(<ScreenSection slug="Marion_Cotillard" title="Marion Cotillard" onOpenCard={onOpenCard} />));
}
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  setMusicService(null);
  onOpenCard.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setScreenService(null);
  setCollectionMarks(null);
});

describe('ScreenSection — filmographie', () => {
  it('sans carte possédée : la filmographie d’avant, sans résumé ni interrupteur', async () => {
    await show({ status: 'filmography', items });
    expect(container.textContent).toContain('Filmographie');
    expect(container.textContent).toContain('Les Petits Mouchoirs');
    expect(container.textContent).not.toContain('dans ma collection');
  });

  it('repère le film dont on possède la carte et ouvre la carte', async () => {
    await show({ status: 'filmography', items }, [inception]);
    expect(container.textContent).toContain('1 / 2 dans ma collection');
    expect(container.textContent).toContain('×2');
    await act(async () => button('Voir ma carte Inception')?.click());
    expect(onOpenCard).toHaveBeenCalledWith('Inception');
  });

  it('ouvrir un film affiche son détail, le rappel de la carte possédée, et le retour restaure la liste', async () => {
    await show({ status: 'filmography', items }, [inception]);
    await act(async () => button('Ouvrir Inception')?.click());
    expect(container.textContent).toContain('Un voleur de rêves.');
    expect(container.textContent).toContain('Tu possèdes cette carte');
    expect((container.querySelector('[data-wmt-work-list]') as HTMLElement).style.display).toBe('none');
    await act(async () => button('Retour à la filmographie')?.click());
    expect((container.querySelector('[data-wmt-work-list]') as HTMLElement).style.display).toBe('block');
    expect(container.textContent).not.toContain('Tu possèdes cette carte');
  });

  it('un film non possédé s’ouvre sans rappel de carte', async () => {
    await show({ status: 'filmography', items }, [inception]);
    await act(async () => button('Ouvrir Les Petits Mouchoirs')?.click());
    expect(container.textContent).not.toContain('Tu possèdes cette carte');
  });

  it('fonctionne sans service de repérage', async () => {
    setScreenService({ view: async () => ({ status: 'filmography', items }), detail: async () => ({ status: 'detail', detail }) } as unknown as ScreenService);
    setCollectionMarks(null);
    await act(async () => root.render(<ScreenSection slug="X" title="X" />));
    expect(container.textContent).toContain('Les Petits Mouchoirs');
  });

  it('rien pour une carte sans cinéma', async () => {
    await show({ status: 'none' });
    expect(container.innerHTML).toBe('');
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run tests/content/screen-section.test.tsx`
Expected: FAIL (le résumé « dans ma collection » et `onOpenCard` n'existent pas encore).

- [ ] **Step 3 : Remplacer `src/content/ScreenSection.tsx`**

```tsx
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { EMPTY_OWNERSHIP, ownedCardOf } from '../core/collection/work-marks';
import { formatRating, formatVotes, posterUrl } from '../core/screen/screen-format';
import type { FilmographyItem, ScreenDetail } from '../core/screen/tmdb-api';
import { getCollectionMarks } from './collection-marks-registry';
import { Glyph } from './Glyphs';
import { getScreenService } from './screen-registry';
import type { ScreenDetailResult, ScreenView } from './screen-service';
import { SoundtrackButton } from './SoundtrackButton';
import { TrailerPlayer } from './TrailerPlayer';
import { WatchProviders } from './WatchProviders';
import { OwnedNotice, WorkBack, WorkList, type WorkItem } from './WorkList';

const STAR = '#fbbf24';
const noSubscribe = () => () => undefined;
const keyOf = (item: FilmographyItem): string => `${item.mediaType}-${item.id}`;

type Opened = { item: FilmographyItem; result: ScreenDetailResult | null };
// `onOpenCard` : ouvre la carte d'un film ou d'une série possédé (fournie par la fiche native qui porte la section).
type Props = { slug: string; title: string; onOpenCard?: (slug: string) => void };

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
      <SoundtrackButton soundtrackKey={`${detail.mediaType}:${detail.id}`} title={detail.title} {...(detail.originalTitle ? { originalTitle: detail.originalTitle } : {})} />
      {detail.trailerKey && <TrailerPlayer trailerKey={detail.trailerKey} />}
      {detail.watch && <WatchProviders watch={detail.watch} />}
      <Rating detail={detail} />
      {detail.overview && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, maxHeight: 'min(180px, 26vh)', overflowY: 'auto' }}>{detail.overview}</p>}
    </div>
  );
}

// Section « film, série ou filmographie » de la fiche native d'une carte de la collection ; rien pour les autres cartes.
export function ScreenSection({ slug, title, onOpenCard }: Props) {
  const service = getScreenService();
  const marks = getCollectionMarks();
  const [view, setView] = useState<ScreenView | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const token = useRef(0);
  // Les films et séries dont on possède la carte : se complète à mesure que leurs identifiants TMDB sont lus.
  const ownership = useSyncExternalStore(marks?.subscribe ?? noSubscribe, () => marks?.ownership() ?? EMPTY_OWNERSHIP);

  useEffect(() => marks?.ensure(), [marks]);

  useEffect(() => {
    if (!service) return;
    let cancelled = false;
    setOpened(null);
    void service.view(slug, title).then((next) => !cancelled && setView(next));
    return () => {
      cancelled = true;
    };
  }, [service, slug, title]);

  if (!service || !view || view.status === 'none') return null;

  // La mention JustWatch n'est due que lorsque des offres sont affichées (fiche d'un titre, ouverte ou non depuis une filmographie).
  const shown = opened?.result ?? view;
  const showsWatch = shown.status === 'detail' && shown.detail.watch !== undefined;

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

  const toWork = (item: FilmographyItem): WorkItem => {
    const poster = posterUrl(item.posterPath);
    const owned = ownedCardOf(ownership, item.mediaType, item.id);
    return {
      key: keyOf(item),
      title: item.title,
      ...(item.year ? { year: item.year } : {}),
      ...(item.rating !== undefined ? { rating: formatRating(item.rating) } : {}),
      ...(poster ? { thumbUrl: poster } : {}),
      ...(owned ? { owned } : {}),
    };
  };
  const ownedOpen = opened ? ownedCardOf(ownership, opened.item.mediaType, opened.item.id) : undefined;

  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {view.status === 'error' && (
        <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
          {view.message}
        </p>
      )}
      {view.status === 'detail' && <Detail detail={view.detail} />}
      {view.status === 'filmography' && (
        <>
          {opened && (
            <>
              <WorkBack title={opened.item.title} year={opened.item.year} label="Retour à la filmographie" onBack={back} />
              {ownedOpen && <OwnedNotice card={ownedOpen} onOpenCard={onOpenCard} />}
              {opened.result === null && (
                <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
                  Chargement…
                </p>
              )}
              {opened.result?.status === 'error' && (
                <p role="status" style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
                  {opened.result.message}
                </p>
              )}
              {opened.result?.status === 'detail' && <Detail detail={opened.result.detail} />}
            </>
          )}
          <WorkList
            glyph="film"
            label="Filmographie"
            items={view.items.map(toWork)}
            emptyText="Aucun titre connu."
            hidden={opened !== null}
            onOpen={(work) => {
              const item = view.items.find((candidate) => keyOf(candidate) === work.key);
              if (item) open(item);
            }}
            {...(onOpenCard ? { onOpenCard } : {})}
          />
        </>
      )}
      <p style={{ margin: 0, fontSize: 10, opacity: 0.6 }}>
        {showsWatch && 'Disponibilités : JustWatch · '}Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.
      </p>
    </div>
  );
}
```

- [ ] **Step 4 : Passer l'ouverture de carte depuis `mount.tsx`**

Dans `src/content/mount.tsx`, remplacer la ligne 172 :

```tsx
const screenSections = createNativeSections(SCREEN_HOST_ATTRIBUTE, '0', (slug, title) => <ScreenSection slug={slug} title={title} />);
```

par :

```tsx
const screenSections = createNativeSections(SCREEN_HOST_ATTRIBUTE, '0', (slug, title, host) => (
  <ScreenSection slug={slug} title={title} onOpenCard={(target) => getLinkedService()?.open(host, target)} />
));
```

(`getLinkedService` est déjà importé dans ce fichier ; c'est la même action que le choix d'une carte liée : la fiche actuelle est refermée, celle de la carte s'ouvre.)

- [ ] **Step 5 : Créer et enregistrer le service dans `overlay.ts`**

Dans `src/app/overlay.ts`, ajouter les imports (près de ceux de `screen-registry`, ligne 76) :

```ts
import { createCollectionMarks } from '../content/collection-marks';
import { setCollectionMarks } from '../content/collection-marks-registry';
```

et remplacer le bloc `setScreenService(createScreenService({...}))` (lignes 533-545) par :

```ts
      const screenService = createScreenService({
        hasKey: true,
        collection: collectionRepo,
        kinds: kindsRepo,
        screen: screenRepo,
        api: tmdbApi,
        cache: createTtlCache(store, { ttlMs: 24 * 3_600_000 }),
      });
      setScreenService(screenService);
      // Repère, dans les filmographies, les films et séries dont on possède la carte.
      setCollectionMarks(createCollectionMarks({ collection: collectionRepo, screen: screenRepo, screenSlugs: (cards) => screenService.screenSlugs(cards) }));
```

Run: `sed -n 525,550p src/app/overlay.ts` avant de modifier, pour vérifier que les arguments de `createScreenService` sont bien ceux ci-dessus (copier exactement ceux du fichier si l'un diffère).

- [ ] **Step 6 : Vérifier tests, types et build**

Run: `npx vitest run tests/content/screen-section.test.tsx tests/content/work-list.test.tsx tests/content/collection-marks.test.ts tests/content/linked-cards.test.tsx && npm run typecheck`
Expected: PASS, aucune erreur de types.

Run: `npm test`
Expected: toute la suite passe. Le test `market-search-flow` est connu pour être instable sous la charge de la suite complète : s'il échoue seul dans la suite, le relancer isolément (`npx vitest run tests/content/market-search-flow.test.ts`) ; il doit passer.

Run: `npm run build`
Expected: build réussi sans erreur.

- [ ] **Step 7 : Commit**

```bash
git add src/content/ScreenSection.tsx src/content/mount.tsx src/app/overlay.ts tests/content/screen-section.test.tsx
git commit -m "feat(screen): repérer dans la filmographie les films et séries de ma collection"
```

---

### Task 6 : Fiche WikiHow

**Files:**
- Modify: `src/core/whats-new/entries.ts` (nouvelle fiche, juste après `films-v2`)
- Test: `tests/core/whats-new/entries.test.ts` (existant : valide la forme et le caractère didactique de toutes les fiches)

**Interfaces:** `Entry` / `TourStep` (`src/core/whats-new/types.ts`). La fiche est nouvelle : un nouvel `id` jamais annoncé, donc elle apparaît dans « Quoi de neuf ».

- [ ] **Step 1 : Lire l'entrée voisine pour copier les champs exacts**

Run: `sed -n 335,368p src/core/whats-new/entries.ts`
Expected: la fiche `films-v2` (champs `id`, `theme`, `glyph`, `title`, `summary`, `steps`).

- [ ] **Step 2 : Ajouter la fiche après `films-v2`**

Insérer, au même niveau que les autres éléments du tableau `ENTRIES` :

```ts
  {
    id: 'collection-filmographie',
    theme: 'fiche',
    glyph: '🃏',
    title: 'Mes cartes dans la filmographie',
    summary: 'Repérer les films et séries que vous possédez',
    steps: [
      {
        target: '[data-wmt-work-list]',
        title: 'Filmographie et ma collection',
        text: 'Dans la filmographie d’un acteur ou d’un réalisateur, les films et séries dont vous possédez la carte sont repérés : miniature à la couleur de la rareté, nombre d’exemplaires, ligne en surbrillance.',
        details: [
          { label: 'D’où viennent les données', text: 'La liste vient de TMDB. Votre Collection est celle que l’extension a lue pendant ses parcours ; un film est reconnu quand l’identifiant TMDB de sa carte est connu (lu sur Wikidata, en arrière-plan).' },
          { label: 'Comment s’en servir', text: 'Le résumé en haut indique « N / M dans ma collection ». « Seulement ma collection » ne garde que vos cartes. Le bouton carte à droite d’une ligne ouvre votre carte ; toucher le reste de la ligne ouvre la fiche du film.' },
          { label: 'À savoir', text: 'Seules les cartes déjà connues de la Collection sont repérées : lancez un parcours complet de la Collection pour toutes les voir. Un film dont l’identifiant n’est pas encore lu apparaît un peu plus tard.' },
        ],
        scene: { card: 'screen' },
        glyph: '🃏',
        optional: true,
      },
    ],
  },
```

- [ ] **Step 3 : Vérifier**

Run: `npx vitest run tests/core/whats-new && npm run typecheck`
Expected: PASS (identifiant unique, champs renseignés, au moins deux paragraphes titrés par étape).

- [ ] **Step 4 : Commit**

```bash
git add src/core/whats-new/entries.ts
git commit -m "docs(wikihow): fiche « Mes cartes dans la filmographie »"
```

---

### Task 7 : Vérification finale et livraison

**Files:** aucun (livraison).

- [ ] **Step 1 : Vérification complète**

Run: `npm run typecheck && npm test && npm run build`
Expected: tout passe (voir la remarque sur `market-search-flow` en Task 5, Step 6).

- [ ] **Step 2 : Vérification manuelle dans Chrome (à faire par l'utilisateur ; ne pas la déclarer faite)**

Recharger l'extension (`chrome://extensions` → recharger), ouvrir la fiche d'un acteur de la Collection : le résumé « N / M dans ma collection » apparaît quand au moins un de ses films est possédé ; miniature en cadre de rareté, ×N ; « Seulement ma collection » filtre ; le bouton carte ouvre la carte ; toucher une ligne ouvre le film avec le rappel « Tu possèdes cette carte » ; la flèche ← revient à la liste (défilement conservé). Mobile : vérifier les zones de 44 px (APK à la demande seulement).

- [ ] **Step 3 : Pousser, ouvrir et fusionner la PR (règles du projet : sans demander)**

```bash
git push -u origin feat/collection-filmographie
gh pr create --title "feat(screen): repérer ma collection dans la filmographie (liste d'œuvres partagée)" --body "Spec : docs/superpowers/specs/2026-10-07-livres-design.md (conception Livres, validée). Plan 1 sur 5 : composant WorkList partagé, repérage des cartes possédées (cadre de rareté, ×N, bouton carte, résumé, interrupteur), CardThumb extrait, fiche WikiHow. Reste la vérification manuelle dans Chrome.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --merge
```

- [ ] **Step 4 : Livrer en pré-prod (règle : sans demander après fusion)**

Run: `git switch main && git pull && npm run build && npm run preprod`
Expected: livraison pré-prod réussie. La production (`npm run promouvoir`) n'est **jamais** lancée sans ordre explicite de l'utilisateur.
