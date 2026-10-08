# Bibliothèque, morceau 2a : les cartes dans la pièce — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ranger des cartes de la Collection dans la pièce : au mur (poster, vinyle, pochette), en étagère (CD, DVD, jeu vidéo, livre), à l'écran de l'ordinateur ; toucher un objet en mode Visiter ouvre la fiche existante de la carte.

**Architecture:** Le `Layout` gagne deux éléments (`wall` : objet accroché sur la grille du mur ; `stored` : objet rangé dans un emplacement d'étagère) et l'ordinateur gagne un `slug` optionnel (carte à l'écran). Toute la logique de pose reste dans des fonctions pures de `room-grid.ts` (testées sans DOM) ; `RoomView` dessine, `LibraryPanel` orchestre, un `CardPickerDialog` choisit la carte (liste filtrable de la Collection) puis la forme.

**Tech Stack:** TypeScript, React 18, zod, Vitest (jsdom pour les composants). SVG/CSS, aucune image embarquée.

**Spec:** `docs/superpowers/specs/2026-10-08-bibliotheque-design.md` (« Morceau 2 : les cartes »).

## Découpage du morceau 2 (décision de ce plan)

Le morceau 2 de la spec est trop gros pour une PR. Il est coupé en trois :

- **2a (ce plan)** : cartes au mur / en étagère / à l'écran + ouverture de la fiche (animation d'ouverture simple : l'objet se soulève) + déplacement des objets à l'appui long en mode Aménager.
- **2b : MIS DE CÔTÉ sur décision de l'utilisateur (2026-10-08)** : présentoir de boosters. Ne pas le replanifier tant qu'il ne le redemande pas.
- **2c (plan à part)** : carte murale (carte du monde, cadrage, points, bulle de pensée) et animation d'ouverture complète (retournement, charnière).

## Global Constraints

- Extension en lecture seule : aucune requête ajoutée vers l'API du jeu ; les cartes viennent de `CollectionRepo` (`collection.list()`).
- Tout est local (`wmt:library`), même code Chrome et mobile : tout se manipule au doigt, sans survol ni clic droit.
- Dessin vectoriel SVG + CSS, aucune image à télécharger autre que celles des cartes (affichées via `getImageService().displayUrl`, l'image de l'API passe avant les images de remplacement).
- Glyphes plutôt que du texte dans les contrôles ; cibles tactiles d'au moins 40 px.
- Les cartes sont référencées par leur slug ; une carte inconnue de la Collection s'affiche en grisé et n'ouvre pas de fiche.
- Le `version` de l'état reste `1` : les champs ajoutés sont des unions/optionnels, un ancien état se lit sans migration.
- Une carte ne peut être posée qu'**une fois par pièce** (décision de ce plan, pour que « Ranger » reste sans ambiguïté).
- Dans la même PR : fiche WikiHow (`src/core/whats-new/entries.ts`, nouvel id `bibliotheque-v4`) et annonce « Quoi de neuf ».
- Déplacement : en mode Aménager, un **appui long** sur un objet (meuble, objet accroché, objet rangé) le soulève et le fait glisser, comme pour les meubles (PR #200) ; un appui long en mode Visiter passe en Aménager et soulève. L'écran d'un ordinateur n'est pas soulevable à part : l'appui long soulève l'ordinateur (et sa carte).
- Après fusion : `npm run build`, puis livraison en pré-prod (`npm run preprod`) sans demander ; jamais `npm run promouvoir` sans ordre explicite.

---

## File Structure

- Modifier `src/core/library/library-types.ts` : types `WallShape`, `ShelfShape`, `VinylColor`, éléments `wall` et `stored`, `slug?` sur l'ordinateur.
- Modifier `src/core/library/furniture-catalog.ts` : tailles des formes murales, formes d'étagère par catégorie.
- Modifier `src/core/library/room-grid.ts` : `isStanding`/`rectOf` étendus, `canHang`, `hang`, `moveHung`, `storeCard`, `unstoreCard`, `setScreenCard`, `placedSlugs`, `firstFreeSlot`, `removeFurniture` (retire aussi les objets rangés), `shiftLayout` (décale les objets accrochés).
- Modifier `src/core/library/library-book.ts` : schéma zod des nouveaux éléments, nettoyage à la lecture (objet rangé sans étagère retiré).
- Créer `src/core/library/shape-suggest.ts` : `suggestShape(category)` (forme conseillée selon la catégorie de la carte).
- Créer `src/content/card-art.tsx` : dessin SVG des formes (poster, vinyle, pochettes, CD, DVD, jeu, livre, écran).
- Modifier `src/content/furniture-art.tsx` : `ComputerArt` accepte une image d'écran.
- Modifier `src/content/RoomView.tsx` : dessine les éléments `wall` et `stored`, l'écran, et les rend touchables.
- Créer `src/content/CardPickerDialog.tsx` : choix de la carte (recherche) puis de la forme.
- Modifier `src/content/furniture-drag.ts` : `dropTargetFor` gère les objets accrochés et rangés (cible de dépôt, fantôme).
- Modifier `src/content/LibraryPanel.tsx` : outil « + Carte », visite = ouverture de la fiche, retrait, props `collection`, `kinds`, `onOpenCard`.
- Modifier `src/content/collection-ui.tsx` : passe les nouvelles props.
- Modifier `src/core/whats-new/entries.ts` : fiche et annonce.
- Tests : `tests/core/library/room-grid-cards.test.ts`, `tests/core/library/library-book-cards.test.ts`, `tests/core/library/shape-suggest.test.ts`, `tests/content/library-cards.test.tsx`.

---

### Task 1: Types et catalogue des formes

**Files:**
- Modify: `src/core/library/library-types.ts`
- Modify: `src/core/library/furniture-catalog.ts`
- Test: `tests/core/library/room-grid-cards.test.ts` (créé ici, complété aux tâches 2 et 3)

**Interfaces:**
- Produces:
  - `type WallShape = 'poster' | 'vinyl' | 'sleeve-square' | 'sleeve-round' | 'sleeve-frame'`
  - `type ShelfShape = 'cd' | 'dvd' | 'game' | 'book'`
  - `type VinylColor = 'black' | 'red' | 'blue' | 'green' | 'gold'`
  - `Placed` gagne `{ id; kind: 'wall'; shape: WallShape; col; row; slug; color?: VinylColor }`, `{ id; kind: 'stored'; shape: ShelfShape; shelfId; slot; slug }`, et `computer` gagne `slug?: string`.
  - `WALL_SIZES: Record<WallShape, { w: number; h: number }>`, `wallSizeOf(shape)`, `SHELF_SHAPES: ShelfShape[]`, `WALL_SHAPES: WallShape[]`, `VINYL_COLORS: VinylColor[]`.

- [ ] **Step 1: Écrire le test du catalogue**

```ts
// tests/core/library/room-grid-cards.test.ts
import { describe, expect, it } from 'vitest';
import { WALL_SHAPES, wallSizeOf } from '../../../src/core/library/furniture-catalog';
import { WALL_ROWS } from '../../../src/core/library/room-grid';

describe('catalogue des formes', () => {
  it('chaque forme murale tient dans la hauteur du mur', () => {
    for (const shape of WALL_SHAPES) {
      const { w, h } = wallSizeOf(shape);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeLessThanOrEqual(WALL_ROWS);
    }
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/core/library/room-grid-cards.test.ts` : FAIL (`WALL_SHAPES` n'existe pas).

- [ ] **Step 3: Implémenter**

Dans `library-types.ts`, remplacer le type `Placed` par :

```ts
export type WallShape = 'poster' | 'vinyl' | 'sleeve-square' | 'sleeve-round' | 'sleeve-frame';
export type ShelfShape = 'cd' | 'dvd' | 'game' | 'book';
export type VinylColor = 'black' | 'red' | 'blue' | 'green' | 'gold';

// Un meuble au sol : (col, row) est sa case en haut à gauche. L'ordinateur n'a pas de case : il suit son bureau (et peut afficher une carte).
// `wall` : objet accroché au mur (case en haut à gauche). `stored` : objet rangé dans l'emplacement `slot` (0 à 14) d'une étagère.
export type Placed =
  | { id: string; kind: StandingKind; col: number; row: number }
  | { id: string; kind: 'computer'; deskId: string; slug?: string }
  | { id: string; kind: 'wall'; shape: WallShape; col: number; row: number; slug: string; color?: VinylColor }
  | { id: string; kind: 'stored'; shape: ShelfShape; shelfId: string; slot: number; slug: string };
```

Dans `furniture-catalog.ts`, ajouter :

```ts
import type { ShelfShape, VinylColor, WallShape } from './library-types';

export const WALL_SHAPES: WallShape[] = ['poster', 'vinyl', 'sleeve-square', 'sleeve-round', 'sleeve-frame'];
export const SHELF_SHAPES: ShelfShape[] = ['cd', 'dvd', 'game', 'book'];
export const VINYL_COLORS: VinylColor[] = ['black', 'red', 'blue', 'green', 'gold'];

// Tailles en cases (largeur × hauteur) des objets accrochés.
const WALL_SIZES: Record<WallShape, { w: number; h: number }> = {
  poster: { w: 3, h: 4 },
  vinyl: { w: 3, h: 3 },
  'sleeve-square': { w: 3, h: 3 },
  'sleeve-round': { w: 3, h: 3 },
  'sleeve-frame': { w: 4, h: 4 },
};
export const wallSizeOf = (shape: WallShape): { w: number; h: number } => WALL_SIZES[shape];
```

(L'import existant en tête du fichier reste ; fusionner les imports de `library-types`.)

- [ ] **Step 4: Vérifier** — `npx vitest run tests/core/library/room-grid-cards.test.ts` : PASS. Puis `npx tsc --noEmit` : les erreurs de narrowing de `Placed` dans `room-grid.ts` etc. sont attendues et corrigées aux tâches suivantes ; si `tsc` casse ailleurs que dans `src/core/library` et `src/content/{RoomView,LibraryPanel,furniture-drag}`, s'arrêter et corriger.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(bibliotheque): types et catalogue des formes de cartes"`

---

### Task 2: Pose des objets accrochés au mur (pur)

**Files:**
- Modify: `src/core/library/room-grid.ts`
- Test: `tests/core/library/room-grid-cards.test.ts`

**Interfaces:**
- Consumes: `wallSizeOf`, `WallShape`, `VinylColor` (tâche 1).
- Produces (tous dans `room-grid.ts`) :
  - `isStanding(p: Placed): p is Extract<Placed, { kind: StandingKind }>` (corrigé : `shelf` ou `desk`)
  - `rectOf(p: Placed): Rect | null` (couvre aussi `wall`)
  - `canHang(layout: Layout, cols: number, shape: WallShape, col: number, row: number, ignoreId?: string): PlaceResult` (nouveaux motifs : `'wall'` = hors du mur)
  - `hang(layout, cols, shape, col, row, slug, id, color?): Layout | null`
  - `moveHung(layout, cols, id, col, row): Layout | null`
  - `shiftLayout` décale aussi les objets `wall`.
  - `sectionIsEmpty` tient compte des objets `wall` (via `rectOf`).

`PlaceResult` devient : `{ ok: true } | { ok: false; reason: 'bounds' | 'floor' | 'taken' | 'wall'; cells: Cell[] }`.

- [ ] **Step 1: Écrire les tests**

```ts
import { canHang, hang, moveHung, placeStanding, shiftLayout, sectionIsEmpty } from '../../../src/core/library/room-grid';

describe('objets accrochés', () => {
  it("s'accroche sur un mur libre", () => {
    const layout = hang([], 24, 'poster', 2, 1, 'Paris', 'f1');
    expect(layout).toEqual([{ id: 'f1', kind: 'wall', shape: 'poster', col: 2, row: 1, slug: 'Paris' }]);
  });

  it('refuse ce qui dépasse sur le sol', () => {
    const r = canHang([], 24, 'poster', 2, 6);
    expect(r).toMatchObject({ ok: false, reason: 'wall' });
  });

  it('refuse hors de la pièce', () => {
    expect(canHang([], 24, 'poster', 22, 1)).toMatchObject({ ok: false, reason: 'bounds' });
  });

  it('refuse sur un autre objet accroché', () => {
    const layout = hang([], 24, 'poster', 2, 1, 'A', 'f1')!;
    expect(canHang(layout, 24, 'vinyl', 3, 2)).toMatchObject({ ok: false, reason: 'taken' });
  });

  it('refuse derrière une étagère', () => {
    const layout = placeStanding([], 24, 'shelf', 2, 4, 'f1')!;
    expect(canHang(layout, 24, 'vinyl', 2, 1).ok).toBe(true);
    expect(canHang(layout, 24, 'vinyl', 2, 3)).toMatchObject({ ok: false, reason: 'taken' });
  });

  it('un meuble ne se pose pas sur un objet accroché', () => {
    const layout = hang([], 24, 'poster', 2, 5, 'A', 'f1')!;
    expect(placeStanding(layout, 24, 'shelf', 2, 4, 'f2')).toBeNull();
  });

  it('se déplace, sans se bloquer lui-même', () => {
    const layout = hang([], 24, 'poster', 2, 1, 'A', 'f1')!;
    expect(moveHung(layout, 24, 'f1', 3, 1)).toEqual([{ id: 'f1', kind: 'wall', shape: 'poster', col: 3, row: 1, slug: 'A' }]);
  });

  it('suit le décalage vers la gauche et compte pour la zone du bord', () => {
    const layout = hang([], 24, 'poster', 2, 1, 'A', 'f1')!;
    expect(shiftLayout(layout, 12)[0]).toMatchObject({ col: 14 });
    expect(sectionIsEmpty(layout, 24, 'left')).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/core/library/room-grid-cards.test.ts` : FAIL.

- [ ] **Step 3: Implémenter** dans `room-grid.ts` :

```ts
import { sizeOf, wallSizeOf } from './furniture-catalog';
import type { Layout, Orientation, Placed, StandingKind, VinylColor, WallShape } from './library-types';

export type PlaceResult =
  | { ok: true }
  | { ok: false; reason: 'bounds' | 'floor' | 'taken' | 'wall'; cells: Cell[] };

type Standing = Extract<Placed, { kind: StandingKind }>;

export const isStanding = (p: Placed): p is Standing => p.kind === 'shelf' || p.kind === 'desk';

export function rectOf(p: Placed): Rect | null {
  if (isStanding(p)) {
    const { w, h } = sizeOf(p.kind);
    return { col: p.col, row: p.row, w, h };
  }
  if (p.kind === 'wall') {
    const { w, h } = wallSizeOf(p.shape);
    return { col: p.col, row: p.row, w, h };
  }
  return null;
}

const inRoomCell = (cols: number) => (c: Cell): boolean => c.col >= 0 && c.row >= 0 && c.col < cols && c.row < ROWS;

function takenKeys(layout: Layout, ignoreId?: string): Set<string> {
  const taken = new Set<string>();
  for (const other of layout) {
    if (other.id === ignoreId) continue;
    const otherRect = rectOf(other);
    if (!otherRect) continue;
    for (const c of cellsOf(otherRect)) taken.add(`${c.col}-${c.row}`);
  }
  return taken;
}
```

Réécrire `canPlace` pour utiliser `inRoomCell` et `takenKeys` (même comportement), puis :

```ts
export function canHang(layout: Layout, cols: number, shape: WallShape, col: number, row: number, ignoreId?: string): PlaceResult {
  const { w, h } = wallSizeOf(shape);
  const cells = cellsOf({ col, row, w, h });
  const inRoom = inRoomCell(cols);
  if (cells.some((c) => !inRoom(c))) return { ok: false, reason: 'bounds', cells: cells.filter(inRoom) };
  if (row + h > WALL_ROWS) return { ok: false, reason: 'wall', cells: cells.filter((c) => c.row >= WALL_ROWS) };
  const taken = takenKeys(layout, ignoreId);
  const clash = cells.filter((c) => taken.has(`${c.col}-${c.row}`));
  return clash.length > 0 ? { ok: false, reason: 'taken', cells: clash } : { ok: true };
}

export function hang(layout: Layout, cols: number, shape: WallShape, col: number, row: number, slug: string, id: string, color?: VinylColor): Layout | null {
  if (!canHang(layout, cols, shape, col, row).ok) return null;
  return [...layout, { id, kind: 'wall', shape, col, row, slug, ...(color ? { color } : {}) }];
}

export function moveHung(layout: Layout, cols: number, id: string, col: number, row: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'wall' || !canHang(layout, cols, item.shape, col, row, id).ok) return null;
  return layout.map((p) => (p.id === id ? { ...item, col, row } : p));
}
```

`shiftLayout` : `isStanding(p) || p.kind === 'wall' ? { ...p, col: p.col + delta } : p`. `moveStanding` : le `map` doit conserver le type (`{ id, kind: item.kind, col, row }` reste valide car `item` est `Standing`).

- [ ] **Step 4: Vérifier** — `npx vitest run tests/core/library` : tous les tests (anciens compris) passent. `npx tsc --noEmit` : corriger les erreurs de narrowing restantes dans `furniture-drag.ts` (utiliser `isStanding`).

- [ ] **Step 5: Commit** — `git commit -am "feat(bibliotheque): objets accrochés au mur (pose, déplacement, décalage)"`

---

### Task 3: Rangement en étagère, écran, doublons (pur)

**Files:**
- Modify: `src/core/library/room-grid.ts`
- Test: `tests/core/library/room-grid-cards.test.ts`

**Interfaces:**
- Consumes: `ShelfShape`, `Placed` (tâche 1).
- Produces (dans `room-grid.ts`) :
  - `SHELF_SLOTS = 15`
  - `placedSlugs(layout: Layout): Set<string>` (slugs déjà posés : accrochés, rangés, à l'écran)
  - `firstFreeSlot(layout: Layout, shelfId: string): number | null`
  - `storeCard(layout, shelfId, slot, shape, slug, id): Layout | null` (refuse : étagère inconnue, `slot` hors 0–14 ou occupé, carte déjà posée)
  - `setScreenCard(layout, computerId, slug: string | null): Layout | null` (refuse : ordinateur inconnu, carte déjà posée ailleurs)
  - `unplaceCard(layout, id): Layout` (retire un objet accroché ou rangé ; pour l'ordinateur, vide l'écran)
  - `removeFurniture` retire aussi les objets rangés dans l'étagère retirée.
  - `hang` refuse une carte déjà posée (mettre à jour `hang` de la tâche 2 : `if (placedSlugs(layout).has(slug)) return null`).

- [ ] **Step 1: Écrire les tests**

```ts
import { firstFreeSlot, placedSlugs, removeFurniture, setScreenCard, storeCard, unplaceCard, placeComputer } from '../../../src/core/library/room-grid';

describe('étagère et écran', () => {
  const shelf = placeStanding([], 24, 'shelf', 0, 4, 'f1')!;

  it('range dans le premier emplacement libre', () => {
    expect(firstFreeSlot(shelf, 'f1')).toBe(0);
    const a = storeCard(shelf, 'f1', 0, 'cd', 'A', 'f2')!;
    expect(firstFreeSlot(a, 'f1')).toBe(1);
  });

  it('refuse un emplacement occupé, hors étagère ou une carte déjà posée', () => {
    const a = storeCard(shelf, 'f1', 0, 'cd', 'A', 'f2')!;
    expect(storeCard(a, 'f1', 0, 'dvd', 'B', 'f3')).toBeNull();
    expect(storeCard(a, 'f1', 15, 'dvd', 'B', 'f3')).toBeNull();
    expect(storeCard(a, 'zz', 1, 'dvd', 'B', 'f3')).toBeNull();
    expect(storeCard(a, 'f1', 1, 'dvd', 'A', 'f3')).toBeNull();
  });

  it('renvoie null quand l’étagère est pleine', () => {
    let layout = shelf;
    for (let i = 0; i < 15; i++) layout = storeCard(layout, 'f1', i, 'book', `C${i}`, `s${i}`)!;
    expect(firstFreeSlot(layout, 'f1')).toBeNull();
  });

  it('retirer l’étagère retire ses objets', () => {
    const a = storeCard(shelf, 'f1', 0, 'cd', 'A', 'f2')!;
    expect(removeFurniture(a, 'f1')).toEqual([]);
  });

  it('affiche une carte à l’écran, une seule fois', () => {
    const desk = placeStanding([], 24, 'desk', 8, 8, 'f1')!;
    const withPc = placeComputer(desk, 'f1', 'f2')!;
    const shown = setScreenCard(withPc, 'f2', 'A')!;
    expect(placedSlugs(shown).has('A')).toBe(true);
    expect(setScreenCard(shown, 'f2', 'B')).toEqual(expect.arrayContaining([expect.objectContaining({ slug: 'B' })]));
    expect(unplaceCard(shown, 'f2')[1]).toEqual({ id: 'f2', kind: 'computer', deskId: 'f1' });
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/core/library/room-grid-cards.test.ts` : FAIL.

- [ ] **Step 3: Implémenter**

```ts
export const SHELF_SLOTS = 15;

export function placedSlugs(layout: Layout): Set<string> {
  const slugs = new Set<string>();
  for (const p of layout) {
    if ((p.kind === 'wall' || p.kind === 'stored' || p.kind === 'computer') && p.slug) slugs.add(p.slug);
  }
  return slugs;
}

export function firstFreeSlot(layout: Layout, shelfId: string): number | null {
  const used = new Set(layout.filter((p) => p.kind === 'stored' && p.shelfId === shelfId).map((p) => (p as Extract<Placed, { kind: 'stored' }>).slot));
  for (let i = 0; i < SHELF_SLOTS; i++) if (!used.has(i)) return i;
  return null;
}

export function storeCard(layout: Layout, shelfId: string, slot: number, shape: ShelfShape, slug: string, id: string): Layout | null {
  const shelf = layout.find((p) => p.id === shelfId);
  if (!shelf || shelf.kind !== 'shelf' || !Number.isInteger(slot) || slot < 0 || slot >= SHELF_SLOTS) return null;
  if (layout.some((p) => p.kind === 'stored' && p.shelfId === shelfId && p.slot === slot)) return null;
  if (placedSlugs(layout).has(slug)) return null;
  return [...layout, { id, kind: 'stored', shape, shelfId, slot, slug }];
}

export function setScreenCard(layout: Layout, computerId: string, slug: string | null): Layout | null {
  const pc = layout.find((p) => p.id === computerId);
  if (!pc || pc.kind !== 'computer') return null;
  if (slug !== null && pc.slug !== slug && placedSlugs(layout).has(slug)) return null;
  return layout.map((p) => {
    if (p.id !== computerId || p.kind !== 'computer') return p;
    return slug === null ? { id: p.id, kind: 'computer', deskId: p.deskId } : { ...p, slug };
  });
}

// Ranger : retire un objet accroché ou rangé ; sur l'ordinateur, vide seulement l'écran.
export function unplaceCard(layout: Layout, id: string): Layout {
  const item = layout.find((p) => p.id === id);
  if (item?.kind === 'computer') return setScreenCard(layout, id, null) ?? layout;
  if (item?.kind === 'wall' || item?.kind === 'stored') return layout.filter((p) => p.id !== id);
  return layout;
}
```

`removeFurniture` : ajouter `&& !(p.kind === 'stored' && p.shelfId === id)` au filtre. `hang` : ajouter le refus de carte déjà posée. Ajouter `ShelfShape` à l'import des types.

- [ ] **Step 4: Vérifier** — `npx vitest run tests/core/library` : PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(bibliotheque): rangement en étagère, carte à l'écran, une fois par pièce"`

---

### Task 4: Mémorisation (zod) et forme conseillée

**Files:**
- Modify: `src/core/library/library-book.ts` (schéma `placedSchema`, nettoyage dans `parseLibraryState`)
- Create: `src/core/library/shape-suggest.ts`
- Test: `tests/core/library/library-book-cards.test.ts`, `tests/core/library/shape-suggest.test.ts`

**Interfaces:**
- Consumes: `Category` de `src/core/kinds/kinds-category.ts` (`'music' | 'film' | 'games' | 'books' | 'other'`).
- Produces: `suggestShape(category: Category): { shelf: ShelfShape; wall: WallShape }`.

- [ ] **Step 1: Écrire les tests**

```ts
// tests/core/library/shape-suggest.test.ts
import { describe, expect, it } from 'vitest';
import { suggestShape } from '../../../src/core/library/shape-suggest';

describe('forme conseillée', () => {
  it('suit la catégorie de la carte', () => {
    expect(suggestShape('music')).toEqual({ shelf: 'cd', wall: 'vinyl' });
    expect(suggestShape('film')).toEqual({ shelf: 'dvd', wall: 'poster' });
    expect(suggestShape('games')).toEqual({ shelf: 'game', wall: 'poster' });
    expect(suggestShape('books')).toEqual({ shelf: 'book', wall: 'sleeve-frame' });
    expect(suggestShape('other')).toEqual({ shelf: 'book', wall: 'poster' });
  });
});
```

```ts
// tests/core/library/library-book-cards.test.ts
import { describe, expect, it } from 'vitest';
import { createInitialState, parseLibraryState } from '../../../src/core/library/library-book';

const withLayout = (layout: unknown[]) => {
  const state = createInitialState();
  return { ...state, rooms: [{ ...state.rooms[0]!, layout }] };
};

describe('lecture des cartes rangées', () => {
  it('relit les objets accrochés, rangés et l’écran', () => {
    const raw = withLayout([
      { id: 'f1', kind: 'shelf', col: 0, row: 4 },
      { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'f1', slot: 0, slug: 'A' },
      { id: 'f3', kind: 'wall', shape: 'vinyl', col: 8, row: 1, slug: 'B', color: 'red' },
      { id: 'f4', kind: 'desk', col: 10, row: 8 },
      { id: 'f5', kind: 'computer', deskId: 'f4', slug: 'C' },
    ]);
    expect(parseLibraryState(raw).rooms[0]!.layout).toHaveLength(5);
  });

  it('écarte un objet rangé dont l’étagère a disparu et une carte en double', () => {
    const raw = withLayout([
      { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'zz', slot: 0, slug: 'A' },
      { id: 'f3', kind: 'wall', shape: 'poster', col: 1, row: 1, slug: 'B' },
      { id: 'f4', kind: 'wall', shape: 'poster', col: 6, row: 1, slug: 'B' },
    ]);
    expect(parseLibraryState(raw).rooms[0]!.layout.map((p) => p.id)).toEqual(['f3']);
  });

  it('retombe sur une pièce vide pour une forme inconnue', () => {
    const raw = withLayout([{ id: 'f1', kind: 'wall', shape: 'banane', col: 1, row: 1, slug: 'B' }]);
    expect(parseLibraryState(raw).rooms[0]!.layout).toEqual([]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/core/library/library-book-cards.test.ts tests/core/library/shape-suggest.test.ts`.

- [ ] **Step 3: Implémenter**

`shape-suggest.ts` :

```ts
import type { Category } from '../kinds/kinds-category';
import type { ShelfShape, WallShape } from './library-types';

// Forme conseillée selon la catégorie de la carte (musique → CD ou vinyle, film → DVD, jeu → jeu vidéo, livre → livre).
export function suggestShape(category: Category): { shelf: ShelfShape; wall: WallShape } {
  switch (category) {
    case 'music':
      return { shelf: 'cd', wall: 'vinyl' };
    case 'film':
      return { shelf: 'dvd', wall: 'poster' };
    case 'games':
      return { shelf: 'game', wall: 'poster' };
    case 'books':
      return { shelf: 'book', wall: 'sleeve-frame' };
    default:
      return { shelf: 'book', wall: 'poster' };
  }
}
```

`library-book.ts` : étendre `placedSchema` :

```ts
const placedSchema = z.union([
  z.object({ id: z.string(), kind: z.enum(['shelf', 'desk']), col: z.number().int(), row: z.number().int() }),
  z.object({ id: z.string(), kind: z.literal('computer'), deskId: z.string(), slug: z.string().optional() }),
  z.object({
    id: z.string(),
    kind: z.literal('wall'),
    shape: z.enum(['poster', 'vinyl', 'sleeve-square', 'sleeve-round', 'sleeve-frame']),
    col: z.number().int(),
    row: z.number().int(),
    slug: z.string(),
    color: z.enum(['black', 'red', 'blue', 'green', 'gold']).optional(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('stored'),
    shape: z.enum(['cd', 'dvd', 'game', 'book']),
    shelfId: z.string(),
    slot: z.number().int().min(0).max(14),
    slug: z.string(),
  }),
]);
```

Dans `parseLibraryState`, après le filtre de l'ordinateur : retirer les `stored` dont `shelfId` n'est pas une étagère de la pièce, retirer les doublons d'emplacement (même `shelfId`+`slot`), et retirer toute carte dont le `slug` a déjà été vu (ordre du tableau). Écrire ce nettoyage dans une fonction `cleanLayout(layout: Layout): Layout` locale.

- [ ] **Step 4: Vérifier** — `npx vitest run tests/core/library` : PASS ; `npx tsc --noEmit` sans erreur dans `src/core`.

- [ ] **Step 5: Commit** — `git commit -am "feat(bibliotheque): mémorisation des cartes rangées et forme conseillée"`

---

### Task 5: Dessin des formes et de l'écran

**Files:**
- Create: `src/content/card-art.tsx`
- Modify: `src/content/furniture-art.tsx` (`ComputerArt` accepte `imageUrl?: string`)
- Modify: `src/content/RoomView.tsx`
- Test: `tests/content/library-cards.test.tsx` (début)

**Interfaces:**
- Consumes: `Placed`, `KnownCard`, `wallSizeOf`, `shelfSlots`, `pxRect`, `getImageService()` (`displayUrl(slug, imageUrl)`).
- Produces:
  - `WallArt({ rect: PxRect; shape: WallShape; color?: VinylColor; title: string; imageUrl?: string; missing: boolean })`
  - `ShelfItemArt({ rect: PxRect; shape: ShelfShape; title: string; imageUrl?: string; missing: boolean })` (dos de l'objet dans son emplacement)
  - `RoomView` reçoit la prop `cards: Record<string, { title: string; imageUrl?: string }>` (indexée par slug) ; un slug absent de `cards` = carte inconnue, objet grisé (`opacity .35`, attribut `data-missing="true"`).
  - Chaque objet accroché/rangé est un `<g data-card="<slug>" data-id="<id>">` touchable, avec `onCardTap(id)` ; l'écran de l'ordinateur est `<g data-screen="<computerId>">`.

- [ ] **Step 1: Écrire le test de rendu**

```tsx
// tests/content/library-cards.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import type { Room } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const room: Room = {
  id: 'r1', name: 'Pièce 1', style: 'scandinave', orientation: 'landscape', cols: 24,
  layout: [
    { id: 'f1', kind: 'shelf', col: 0, row: 4 },
    { id: 'f2', kind: 'stored', shape: 'cd', shelfId: 'f1', slot: 0, slug: 'Daft_Punk' },
    { id: 'f3', kind: 'wall', shape: 'poster', col: 10, row: 1, slug: 'Paris' },
    { id: 'f4', kind: 'wall', shape: 'vinyl', col: 14, row: 1, slug: 'Inconnue' },
  ],
};

function mount(onCardTap = vi.fn()) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <RoomView room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined}
        cards={{ Daft_Punk: { title: 'Daft Punk' }, Paris: { title: 'Paris' } }} onCardTap={onCardTap} />,
    );
  });
  return { container, onCardTap };
}

describe('cartes dans la pièce', () => {
  it('dessine les objets rangés et accrochés', () => {
    const { container } = mount();
    expect(container.querySelector('[data-card="Daft_Punk"]')).not.toBeNull();
    expect(container.querySelector('[data-card="Paris"]')).not.toBeNull();
  });

  it('grise une carte inconnue', () => {
    const { container } = mount();
    expect(container.querySelector('[data-card="Inconnue"]')?.getAttribute('data-missing')).toBe('true');
  });

  it('un toucher signale l’objet', () => {
    const { container, onCardTap } = mount();
    act(() => { container.querySelector('[data-card="Paris"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onCardTap).toHaveBeenCalledWith('f3');
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/content/library-cards.test.tsx` : FAIL.

- [ ] **Step 3: Implémenter**

`card-art.tsx` : composants SVG purs. Contrat de dessin (valeurs à reprendre telles quelles) :
- `poster` : rectangle blanc cassé (`#F7F3EA`, trait `#C9B48E`) avec l'image dans un `<image>` de 80 % de la surface ; sans image, un aplat `#A8C5E6` ; le titre en bas, `font-size 9`, tronqué à 14 caractères.
- `vinyl` : disque (cercle) de la couleur (`black #1B1B1F, red #C0392B, blue #2E6DB4, green #2F8F5B, gold #C9A227`) avec sillons (2 cercles `stroke-opacity .25`), étiquette centrale ronde (rayon 36 % ) contenant l'image rognée par `clipPath` et le titre en 7 px sous l'étiquette.
- `sleeve-square` : carré blanc, image pleine. `sleeve-round` : image rognée en cercle. `sleeve-frame` : cadre en `palette.woodDark` (largeur 5) autour d'un passe-partout blanc et de l'image.
- `ShelfItemArt` : `cd` = boîtier fin (largeur 38 % de l'emplacement, gris clair, titre vertical 6 px) ; `dvd` = boîtier mince bleu foncé (largeur 46 %) ; `game` = boîtier noir (largeur 46 %, bandeau coloré en haut) ; `book` = dos coloré (couleur dérivée du slug : `hsl(<somme des codes du slug % 360> 35% 45%)`), largeur 40 %. Tous : petite image carrée de 14 px en haut, titre en `writing-mode: vertical-rl` (`<text transform="rotate(90)">`), hauteur 90 % de l'emplacement, posés au bas de l'emplacement.
- Carte inconnue (`missing`) : le parent applique `opacity .35` et n'affiche ni image ni titre.
- Les `<image>` utilisent `href`, `referrerPolicy="no-referrer"`, `preserveAspectRatio="xMidYMid slice"`.

`ComputerArt` : ajouter `imageUrl?: string` ; quand il est fourni, remplacer le `rect` bleu de l'écran par `<image href=… preserveAspectRatio="xMidYMid slice">` rogné dans l'écran.

`RoomView` : ajouter `cards`, `onCardTap` ; après le dessin des meubles, dessiner dans cet ordre les `wall`, puis les `stored` (position = `shelfSlots(rectDeLÉtagère)[slot]`, étagère introuvable = non dessiné). Chaque objet est enveloppé dans `<g data-card={slug} data-id={id} data-missing={…} onClick={() => onCardTap?.(id)}>` avec un `<rect fill="transparent">` pour la zone de toucher ; les écrans sont `<g data-screen={computerId} data-card={slug}>`. `imageUrl` : `getImageService()?.displayUrl(slug, cards[slug]?.imageUrl) ?? cards[slug]?.imageUrl`. En mode Aménager, l'objet sélectionné reçoit le contour `outline` déjà présent. Les emplacements en pointillés des étagères (`showSlots`) ne sont dessinés que pour les emplacements vides.

- [ ] **Step 4: Vérifier** — `npx vitest run tests/content/library-cards.test.tsx tests/content` : PASS (les tests existants du panneau passent toujours : `cards` et `onCardTap` sont optionnelles, valeurs par défaut `{}` et `undefined`).

- [ ] **Step 5: Commit** — `git commit -am "feat(bibliotheque): dessin des cartes au mur, en étagère et à l'écran"`

---

### Task 6: Choix de la carte puis de la forme

**Files:**
- Create: `src/content/CardPickerDialog.tsx`
- Test: `tests/content/library-cards.test.tsx`

**Interfaces:**
- Consumes: `KnownCard[]`, `categoryOf` + `KindsState` (`kinds-book`), `suggestShape`, `placedSlugs`, `WALL_SHAPES`, `SHELF_SHAPES`, `VINYL_COLORS`, `CardThumb`.
- Produces:
  ```ts
  export type CardChoice =
    | { target: 'wall'; shape: WallShape; slug: string; color?: VinylColor }
    | { target: 'shelf'; shape: ShelfShape; slug: string }
    | { target: 'screen'; slug: string };
  export function CardPickerDialog(props: {
    cards: KnownCard[];
    taken: Set<string>;                 // cartes déjà posées dans la pièce (grisées, non choisissables)
    categoryOf: (slug: string) => Category;
    allowed: Array<'wall' | 'shelf' | 'screen'>;   // cibles possibles selon l'outil
    onChoose: (choice: CardChoice) => void;
    onClose: () => void;
  }): JSX.Element;
  ```

Comportement : étape 1 = champ de recherche (filtre insensible à la casse et aux accents sur le titre) + liste de `CardThumb` + titre (max 60 affichées, « … » pour affiner) ; une carte de `taken` est désactivée. Étape 2 = rangée de formes (boutons à glyphe, la forme conseillée marquée `data-suggested="true"`) ; pour le vinyle, 5 pastilles de couleur ; la cible (`wall`/`shelf`/`screen`) est celle d'`allowed` (si plusieurs, un sélecteur de cible glyphes avant les formes ; l'écran n'a pas de forme et valide aussitôt). Attributs de test : `data-card-option="<slug>"`, `data-shape="<shape>"`, `data-color="<color>"`, `data-target="<target>"`.

- [ ] **Step 1: Tests**

```tsx
it('choisit la carte puis la forme conseillée', async () => {
  const onChoose = vi.fn();
  // monter CardPickerDialog avec cards=[{slug:'Daft_Punk',title:'Daft Punk'}], categoryOf=()=>'music', allowed=['shelf'], taken=new Set()
  // cliquer [data-card-option="Daft_Punk"], vérifier que [data-shape="cd"] porte data-suggested="true", cliquer dessus
  expect(onChoose).toHaveBeenCalledWith({ target: 'shelf', shape: 'cd', slug: 'Daft_Punk' });
});

it('grise une carte déjà posée', () => {
  // taken=new Set(['Daft_Punk']) : [data-card-option="Daft_Punk"] a l'attribut disabled
});

it('filtre par la recherche sans tenir compte des accents', () => {
  // cards=[Éric Satie, Daft Punk] ; saisir « eric » : seul Éric Satie reste
});
```

(Écrire les corps complets en suivant le gabarit de `tests/content/library-panel.test.tsx` : `act`, `createRoot`, helper `click`.)

- [ ] **Step 2: Vérifier l'échec**, **Step 3: Implémenter** le composant (style : classes `wmt-lib-*` existantes + `.wmt-lib-dialog` ajouté à `LIBRARY_CSS` : `position:fixed; inset:0; z-index:2147483000; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center` et un panneau `max-width:min(92vw,480px); max-height:80vh; overflow:auto`), **Step 4: Vérifier** `npx vitest run tests/content/library-cards.test.tsx`.

- [ ] **Step 5: Commit** — `git commit -am "feat(bibliotheque): choix de la carte puis de la forme"`

---

### Task 7: Brancher dans le panneau (poser, déplacer, ranger, ouvrir)

**Files:**
- Modify: `src/content/LibraryPanel.tsx`, `src/content/collection-ui.tsx`, `src/content/RoomView.tsx` (si besoin du `Tool`)
- Test: `tests/content/library-cards.test.tsx`, `tests/content/library-panel.test.tsx` (props)

**Interfaces:**
- `LibraryPanel` props : `{ library: LibraryRepo; collection?: CollectionRepo; kinds?: KindsRepo; onOpenCard?: (slug: string) => void }` (tout optionnel : les tests existants ne changent pas).
- `Tool` gagne `{ type: 'card' }` : le bouton « + Carte » (glyphe `card`, visible en mode Aménager) ouvre le `CardPickerDialog` ; le choix devient un **outil de pose en attente** (`pending: CardChoice`) :
  - `target: 'screen'` : toucher un ordinateur → `setScreenCard` ; refus « Choisissez un ordinateur. ».
  - `target: 'shelf'` : toucher une étagère → `storeCard` au `firstFreeSlot` ; refus « Cette étagère est pleine. ».
  - `target: 'wall'` : toucher une case du mur (la case est le coin **bas-gauche** comme pour les meubles) → `hang` ; refus par `canHang` avec clignotement des cases (messages `wall`: « Un objet mural s'accroche au mur. »).
- Mode **Visiter** : toucher un objet (`onCardTap`) → `onOpenCard(slug)` ; carte inconnue → rien.
- Mode **Aménager** : toucher un objet le sélectionne (barre d'actions existante : Déplacer, Retirer). « Retirer » sur un objet appelle `unplaceCard` ; « Déplacer » d'un objet accroché pose via `moveHung` sur la case touchée ; le déplacement à l'appui long est traité à la tâche 8. Une carte d'écran se change ou se retire en touchant l'ordinateur (« + Carte » ou « Retirer »).
- Retirer un bureau qui porte un ordinateur affichant une carte, ou une étagère contenant des cartes : demander confirmation (`window.confirm('Retirer aussi les cartes rangées ?')`, comme la suppression de pièce).
- `collection-ui.tsx` : `<LibraryPanel library={library} collection={collection} kinds={kinds} onOpenCard={openGameCard} />` — **vérifier d'abord** que `openGameCard(slug)` ouvre la fiche existante comme `onOpenCard` des autres vues (c'est la même prop `onOpenCard: openGameCard` dans `common`).
- Le panneau charge `collection.list()` (abonné aux changements comme `WorldPanel`) et construit `cards: Record<slug, {title, imageUrl}>` et `categoryOf` via `kinds` (`kinds.current()`/`subscribe` — reprendre le crochet `useKindState` de `WorldPanel`).

- [ ] **Step 1: Tests** (dans `library-cards.test.tsx`, avec un `CollectionRepo` factice et un `LibraryRepo` en mémoire) :
  1. En Aménager, « + Carte » → choisir « Paris » → forme `poster` → toucher une case du mur : `repo.current()` contient un `wall` `Paris`.
  2. Même parcours vers une étagère posée : un `stored` à l'emplacement 0.
  3. Écran : un `computer` avec `slug`.
  4. En Visiter, toucher `[data-card="Paris"]` appelle `onOpenCard('Paris')`.
  5. « Retirer » sur un objet le supprime ; retirer une étagère garnie demande confirmation et supprime ses cartes.
  6. Une carte déjà posée est grisée dans le sélecteur.
- [ ] **Step 2: Vérifier l'échec.**
- [ ] **Step 3: Implémenter** en suivant les gabarits existants de `onCell` / `onPick` / `refuse` dans `LibraryPanel.tsx` (le glisser-déposer des objets est la tâche 8).
- [ ] **Step 4: Vérifier** — `npx vitest run` complet, `npx tsc --noEmit`, `npm run lint` s'il existe.
- [ ] **Step 5: Commit** — `git commit -am "feat(bibliotheque): poser, ouvrir et ranger des cartes dans la pièce"`

---

### Task 8: Déplacer les cartes à l'appui long

**Files:**
- Modify: `src/core/library/room-grid.ts` (`moveStored`, `slotAt`)
- Modify: `src/content/furniture-drag.ts` (`dropTargetFor` étendu, `DropTarget.ghostPx`)
- Modify: `src/content/RoomView.tsx` (objets soulevables, fantôme en pixels)
- Modify: `src/content/LibraryPanel.tsx` (`dropLifted`, appui long sur un objet)
- Test: `tests/core/library/room-grid-cards.test.ts`, `tests/content/furniture-drag.test.ts`, `tests/content/library-cards.test.tsx`

**Interfaces:**
- Consumes: `canHang`, `moveHung`, `shelfSlots`, `pxRect`, `rectOf`, `isStanding` (tâches 2-3), mécanique d'appui long de PR #200 (`createLongPress`, `Drag`, `DragLive`, `onFurnitureDown/Move/Up`).
- Produces:
  - `slotAt(layout: Layout, x: number, y: number): { shelfId: string; slot: number } | null` (emplacement d'étagère sous le point `x, y` du dessin, en pixels)
  - `moveStored(layout: Layout, id: string, shelfId: string, slot: number): Layout | null` (refuse : objet non rangé, étagère inconnue, emplacement hors 0–14 ou occupé par un autre objet ; déposer sur son propre emplacement est permis)
  - `DropReason` gagne `'slot-busy' | 'not-slot' | 'wall'` ; `DropTarget` gagne `ghostPx?: PxRect`, `shelfId?: string`, `slot?: number`.
  - `dropTargetFor(layout, cols, id, col, row, x?, y?)` : `x, y` (pixels du dessin) servent à viser un emplacement (par défaut le coin de la case). Objet `wall` : mêmes règles que les meubles (la case touchée est le coin **bas-gauche**, `top = row - h + 1`, contrôle `canHang(..., id)`). Objet `stored` : vise `slotAt(x, y)` ; `ok` si l'emplacement est libre ou le sien, sinon `slot-busy` (pas d'échange), `not-slot` si le doigt n'est sur aucun emplacement ; le fantôme est l'emplacement visé (`ghostPx`).

- [ ] **Step 1: Écrire les tests**

```ts
// room-grid-cards.test.ts
import { moveStored, slotAt, shelfSlots, pxRect, rectOf } from '../../../src/core/library/room-grid';

describe('déplacer un objet rangé', () => {
  const shelf = placeStanding([], 24, 'shelf', 0, 4, 'f1')!;
  const a = storeCard(shelf, 'f1', 0, 'cd', 'A', 'f2')!;

  it('change d’emplacement', () => {
    expect(moveStored(a, 'f2', 'f1', 7)![1]).toMatchObject({ id: 'f2', slot: 7, shelfId: 'f1' });
  });
  it('refuse un emplacement occupé, accepte le sien', () => {
    const b = storeCard(a, 'f1', 1, 'dvd', 'B', 'f3')!;
    expect(moveStored(b, 'f2', 'f1', 1)).toBeNull();
    expect(moveStored(b, 'f2', 'f1', 0)).not.toBeNull();
  });
  it('passe d’une étagère à l’autre', () => {
    const two = placeStanding(a, 24, 'shelf', 8, 4, 'f9')!;
    expect(moveStored(two, 'f2', 'f9', 3)!.find((p) => p.id === 'f2')).toMatchObject({ shelfId: 'f9', slot: 3 });
  });
  it('retrouve l’emplacement sous un point', () => {
    const slot = shelfSlots(pxRect(rectOf(shelf[0]!)!))[4]!;
    expect(slotAt(shelf, slot.x + 2, slot.y + 2)).toEqual({ shelfId: 'f1', slot: 4 });
    expect(slotAt(shelf, 500, 5)).toBeNull();
  });
});
```

```ts
// furniture-drag.test.ts : ajouter
it('un objet accroché se vise comme un meuble (coin bas gauche) et refuse le sol', () => {
  const layout = hang([], 24, 'poster', 2, 1, 'A', 'f1')!;
  expect(dropTargetFor(layout, 24, 'f1', 6, 4)).toMatchObject({ ok: true, col: 6, top: 1 });
  expect(dropTargetFor(layout, 24, 'f1', 6, 10)).toMatchObject({ ok: false, reason: 'wall' });
});
it('un objet rangé vise un emplacement libre, pas un emplacement occupé', () => {
  // étagère f1 en (0,4), objets f2 (slot 0) et f3 (slot 1) ; viser le centre du slot 1 (x, y en pixels)
  // attendu : { ok: false, reason: 'slot-busy' } ; viser le slot 2 : { ok: true, shelfId: 'f1', slot: 2, ghostPx: <rect> }
  // viser le vide du mur : { ok: false, reason: 'not-slot' }
});
```

```tsx
// library-cards.test.tsx : ajouter (mise en place copiée de tests/content/library-drag.test.tsx : pointerdown, faux timers pour le délai du createLongPress, pointermove, pointerup)
it('un appui long sur un objet accroché le déplace sur le mur', async () => { /* poster en (2,1) → lâcher sur une case libre : layout mis à jour dans le repo */ });
it('un appui long sur un objet rangé le déplace dans un autre emplacement', async () => { /* slot 0 → slot 4 */ });
it('lâcher un objet sur un emplacement occupé le laisse en place et affiche un message', async () => { /* … */ });
it('un appui long sur un ordinateur qui affiche une carte déplace l’ordinateur et sa carte', async () => { /* … */ });
```

(Écrire les corps complets, sans laisser de commentaire à la place du code.)

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/core/library/room-grid-cards.test.ts tests/content/furniture-drag.test.ts tests/content/library-cards.test.tsx`.

- [ ] **Step 3: Implémenter**

`room-grid.ts` :

```ts
export function slotAt(layout: Layout, x: number, y: number): { shelfId: string; slot: number } | null {
  for (const p of layout) {
    if (p.kind !== 'shelf') continue;
    const rect = rectOf(p);
    if (!rect) continue;
    const slots = shelfSlots(pxRect(rect));
    const i = slots.findIndex((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
    if (i >= 0) return { shelfId: p.id, slot: i };
  }
  return null;
}

export function moveStored(layout: Layout, id: string, shelfId: string, slot: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  const shelf = layout.find((p) => p.id === shelfId);
  if (!item || item.kind !== 'stored' || !shelf || shelf.kind !== 'shelf') return null;
  if (!Number.isInteger(slot) || slot < 0 || slot >= SHELF_SLOTS) return null;
  if (layout.some((p) => p.kind === 'stored' && p.id !== id && p.shelfId === shelfId && p.slot === slot)) return null;
  return layout.map((p) => (p.id === id ? { ...item, shelfId, slot } : p));
}
```

`furniture-drag.ts` : dans `dropTargetFor`, remplacer le test `if (!isStanding(item))` par trois branches : `item.kind === 'computer'` (comportement actuel), `item.kind === 'wall'` (calcul de `top`, `canHang`, fantôme `Rect`), `item.kind === 'stored'` (via `slotAt(layout, x, y)` ; `ghostPx` = rectangle de l'emplacement donné par `shelfSlots`). Dans `LibraryPanel.locate`, passer le `x` et le `y` déjà calculés par `pointerToCell`.

`RoomView.tsx` : extraire de `renderPlaced` la logique « soulevé » (filigrane à 0,3 + copie à 1,08 qui suit `drag.x/y`) dans une fonction `withLift(id, rect, art)` ; l'appliquer aux objets `wall` et `stored`, avec les mêmes gestionnaires que les meubles (`onPointerDown={onFurnitureDown?.(id, e)}`, `onPointerMove`, `onPointerUp`, `onPointerLeave`, `onPointerCancel`, `onContextMenu preventDefault`, `WebkitTouchCallout:'none'`). Dessiner `drag.ghostPx` (même style vert/rouge que `ghost`) quand il existe.

`LibraryPanel.tsx` : `dropLifted` gère `wall` (`moveHung(l, cols, id, target.col, target.top)`) et `stored` (`moveStored(l, id, target.shelfId, target.slot)`). Messages de refus : `slot-busy` « Cet emplacement est déjà pris. », `not-slot` « Déposez l'objet dans un emplacement de l'étagère. », `wall` « Un objet mural s'accroche au mur. ». Le clic qui suit un appui long reste ignoré (`press.consumeClick`) ; le toucher court en mode Visiter garde son rôle (ouvrir la fiche).

- [ ] **Step 4: Vérifier** — les tests ci-dessus, puis `npx vitest run` complet (les tests de glisser des meubles de PR #200 doivent rester verts) et `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git commit -am "feat(bibliotheque): déplacer les cartes accrochées ou rangées à l'appui long"`

---

### Task 9: Fiche WikiHow, annonce, vérification, PR

**Files:**
- Modify: `src/core/whats-new/entries.ts`
- Modify: `docs/superpowers/specs/2026-10-08-bibliotheque-design.md` (section « Morceau 2 » : découpage 2a/2b/2c et décision « une carte par pièce »)

- [ ] **Step 1:** Ajouter la fiche `bibliotheque-v4` (étapes `text` + `how` + `tip`, ton didactique : à quoi ça sert, d'où viennent les cartes — la Collection déjà chargée, rien n'est envoyé —, comment poser/retirer, limites : une carte une fois par pièce, appui long pour déplacer un objet (l'écran suit son ordinateur), animation d'ouverture simple). Suivre le format des fiches `bibliotheque-v2` et `bibliotheque-v3` de ce fichier. Annonce « Quoi de neuf » avec un id jamais annoncé.
- [ ] **Step 2:** `npm run build` doit réussir ; `npx vitest run` : tout passe.
- [ ] **Step 3: Vérification manuelle** (Chrome, recharger l'extension) : poser un poster, un vinyle, une pochette ; ranger 1 CD, 1 DVD, 1 jeu, 1 livre ; afficher une carte sur l'écran ; Visiter → toucher → la fiche s'ouvre ; déplacer à l'appui long un poster, un objet rangé (autre emplacement, autre étagère), un ordinateur avec sa carte ; retirer une étagère garnie ; recharger la page : tout est mémorisé ; carte supprimée de la Collection → grisée. Rapporter honnêtement ce qui n'a pas pu être vérifié.
- [ ] **Step 4:** Commit, push, ouvrir la PR (corps terminé par la ligne d'attribution), la fusionner sans demander, `npm run build`, `npm run preprod`, mettre à jour la mémoire du projet (morceau 2a fait, 2b et 2c restants).

---

## Self-review

- **Couverture de la spec (morceau 2)** : mur (poster, vinyle + 5 couleurs, 3 pochettes) → tâches 1, 2, 5, 6, 7 ; étagère (CD, DVD, jeu, livre, forme conseillée) → 1, 3, 4, 5, 6, 7 ; écran → 3, 5, 7 ; ouverture avec la fiche existante → 7 ; carte inconnue grisée → 5 ; liste filtrable → 6. **Reportés** (assumés, détaillés en tête) : présentoir de boosters (2b), carte murale et animation d'ouverture complète (2c).
- **Écart avec la spec** : l'ouverture se limite à ouvrir la fiche (sans retournement/charnière). Déplacement à l'appui long couvert par la tâche 8 (pas d'échange entre deux objets rangés : un emplacement occupé refuse le dépôt).
- **Cohérence des noms** : `canHang`, `hang`, `moveHung`, `storeCard`, `firstFreeSlot`, `setScreenCard`, `unplaceCard`, `placedSlugs`, `suggestShape`, `CardChoice`, `data-card`, `data-screen` sont utilisés à l'identique dans toutes les tâches.
