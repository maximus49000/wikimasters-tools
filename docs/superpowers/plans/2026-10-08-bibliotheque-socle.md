# Bibliothèque, morceau 1 (socle) : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter la vue « Bibliothèque » à la Collection : plusieurs pièces extensibles à gauche et à droite, orientation horizontale ou verticale figée (fenêtre visible plus ou moins large, défilement), mode Visiter / Aménager, grille, étagère / bureau / ordinateur à poser, style Scandinave, pièce d'accueil ouverte au lancement, mémorisation locale.

**Architecture:** Un cœur pur et testé (`src/core/library/` : types, catalogue, grille, état, dépôt de stockage) et une interface React (`LibraryPanel` + `RoomView` SVG) montée par `collection-ui.tsx` comme les panneaux Monde / Toile. L'état est un seul document `wmt:library` lu et écrit par un dépôt à écritures sérialisées (modèle `geo-repo`).

**Tech Stack:** TypeScript, React 19, SVG, zod 4, Vitest (jsdom pour les composants), WXT.

**Spec:** `docs/superpowers/specs/2026-10-08-bibliotheque-design.md` (section « Morceau 1 : le socle »).

## Global Constraints

- Extension en lecture seule : aucune requête vers l'API du jeu ; tout est local (`KeyValueStore`, clé `library`, préfixe `wmt:` ajouté par le store).
- Même code pour l'extension et l'appli mobile : tout se fait au doigt (cibles d'au moins 40 px), pas de survol ni de clic droit.
- Commandes en glyphes (SVG) avec `aria-label` et `title` en français ; pas de texte seul.
- Dessin en SVG, aucune image à télécharger. Pièce de 12 lignes (mur = lignes 0-8, sol = 9-11), hauteur fixe 340, cases de 30 de large ; largeur = multiple de 12 colonnes, de 24 (départ) à 96. Fenêtre visible : 24 colonnes en horizontal (720 × 340), 14 en vertical (420 × 340) ; le reste se fait défiler.
- 12 pièces au maximum ; nom de 1 à 30 caractères ; la dernière pièce ne se supprime pas, elle se vide.
- Orientation figée par pièce ; **un seul aménagement** par pièce, l'orientation ne change que la fenêtre visible. Ajouter une zone à gauche décale les meubles de 12 colonnes ; retirer une zone du bord n'est permis que si elle est vide.
- Une seule pièce d'accueil (`homeRoomId`), appliquée une seule fois, à la première ouverture de la Collection après le démarrage.
- Messages et libellés en français, phrases courtes.
- Une fiche WikiHow (`src/core/whats-new/entries.ts`) est ajoutée dans la même PR (nouvel id, jamais annoncé).
- Après l'implémentation : `npm run build`, push, PR ouverte et fusionnée sans demander, puis `npm run preprod` (consignes durables du projet). Jamais `npm run promouvoir`.

## File Structure

| Fichier | Rôle |
| --- | --- |
| `src/core/library/library-types.ts` (créer) | Types `Orientation`, `StyleId`, `FurnitureKind`, `Placed`, `Layout`, `Room`, `LibraryState`. |
| `src/core/library/furniture-catalog.ts` (créer) | Tailles et libellés des meubles. |
| `src/core/library/styles.ts` (créer) | Palettes de style (seul Scandinave est livré). |
| `src/core/library/room-grid.ts` (créer) | Constantes de la grille, règles de pose, déplacement, retrait, décalage, zones de bord, rectangles en pixels, emplacements d'étagère. Pur. |
| `src/core/library/library-book.ts` (créer) | Opérations pures sur l'état (pièces, accueil, orientation, agrandir / réduire) et lecture sûre (`parseLibraryState`). |
| `src/core/library/library-repo.ts` (créer) | Dépôt : `load`, `current`, `subscribe`, `update` sérialisé. |
| `src/content/collection-view.ts` (modifier) | Ajoute la vue `library`. |
| `src/content/world-toggle.ts` (modifier) | Ajoute le bouton Bibliothèque au sélecteur de vues. |
| `src/content/furniture-art.tsx` (créer) | Dessin SVG de l'étagère, du bureau, de l'ordinateur. |
| `src/content/RoomView.tsx` (créer) | SVG de la pièce : mur, sol, meubles, grille, cases cliquables. |
| `src/content/LibraryPanel.tsx` (créer) | Barre des pièces, outils, catalogue, logique de pose, `LIBRARY_CSS`. |
| `src/content/library-launch.ts` (créer) | `createLaunchGate` : la pièce d'accueil s'applique une seule fois. |
| `src/content/collection-ui.tsx` (modifier) | Monte le panneau, applique la pièce d'accueil. |
| `src/app/overlay.ts` (modifier) | Crée le dépôt et le passe à `createCollectionUi`. |
| `src/core/whats-new/entries.ts` (modifier) | Fiche WikiHow « La Bibliothèque ». |

Tests : `tests/core/library/*.test.ts`, `tests/content/library-view.test.ts`, `tests/content/library-panel.test.tsx`, `tests/content/library-launch.test.ts`.

## Prérequis : branche

La spec et ce plan sont sur `docs/bibliotheque-spec`. Implémenter sur une branche créée depuis elle :

```bash
git checkout docs/bibliotheque-spec
git checkout -b feat/bibliotheque-socle
```

(`docs/analyse-scalabilite.md` non suivi appartient à une autre session : ne pas l'ajouter.)

---

### Task 1: Types, catalogue, styles et grille

**Files:**
- Create: `src/core/library/library-types.ts`
- Create: `src/core/library/furniture-catalog.ts`
- Create: `src/core/library/styles.ts`
- Create: `src/core/library/room-grid.ts`
- Test: `tests/core/library/room-grid.test.ts`

**Interfaces:**
- Produces (utilisés par toutes les tâches suivantes) :
  - `type Orientation = 'landscape' | 'portrait'`
  - `STYLE_IDS`, `type StyleId`
  - `type FurnitureKind = 'shelf' | 'desk' | 'computer'` ; `type StandingKind = 'shelf' | 'desk'`
  - `type Placed = { id: string; kind: 'shelf' | 'desk'; col: number; row: number } | { id: string; kind: 'computer'; deskId: string }`
  - `type Layout = Placed[]`
  - `type Room = { id: string; name: string; style: StyleId; orientation: Orientation; cols: number; layout: Layout }`
  - `type LibraryState = { version: 1; activeRoomId: string; homeRoomId: string | null; rooms: Room[] }`
  - `CATALOG`, `FURNITURE_KINDS`, `labelOf(kind)`, `sizeOf(kind: StandingKind): { w: number; h: number }`
  - `type Palette`, `paletteOf(id: StyleId): Palette`
  - Constantes : `ROWS = 12`, `WALL_ROWS = 9`, `CELL_W = 30`, `HEIGHT = 340`, `CELL_H = HEIGHT / ROWS`, `SECTION = 12`, `MIN_COLS = 24`, `MAX_COLS = 96`, `VISIBLE_COLS: Record<Orientation, number>` (`landscape: 24`, `portrait: 14`)
  - `type Cell`, `type Rect`, `type PxRect`, `type PlaceResult`
  - `isStanding(p)`, `rectOf(p)`, `canPlace(layout, cols, kind, col, row, ignoreId?)`, `placeStanding(layout, cols, kind, col, row, id)`, `moveStanding(layout, cols, id, col, row)`, `canPlaceComputer(layout, deskId, ignoreId?)`, `placeComputer(layout, deskId, id)`, `moveComputer(layout, id, deskId)`, `removeFurniture(layout, id)`, `shiftLayout(layout, delta)`, `sectionIsEmpty(layout, cols, side)`, `pxRect(rect)`, `computerRect(desk)`, `shelfSlots(shelf)`

- [ ] **Step 1: Créer les types**

`src/core/library/library-types.ts` :

```ts
// L'orientation ne change que la fenêtre visible sur la pièce (large en horizontal, étroite en vertical).
export type Orientation = 'landscape' | 'portrait';

// Les styles prévus ; seul `scandinave` a une palette dans ce morceau.
export const STYLE_IDS = ['scandinave', 'moderne', 'industriel', 'boheme', 'retro70', 'japandi', 'neon', 'steampunk'] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export type FurnitureKind = 'shelf' | 'desk' | 'computer';
export type StandingKind = 'shelf' | 'desk';

// Un meuble au sol : (col, row) est sa case en haut à gauche. L'ordinateur n'a pas de case : il suit son bureau.
export type Placed =
  | { id: string; kind: StandingKind; col: number; row: number }
  | { id: string; kind: 'computer'; deskId: string };

export type Layout = Placed[];

// `cols` : largeur de la pièce en colonnes (multiple de 12, de 24 à 96). Un seul aménagement, quelle que soit l'orientation.
export type Room = {
  id: string;
  name: string;
  style: StyleId;
  orientation: Orientation;
  cols: number;
  layout: Layout;
};

export type LibraryState = {
  version: 1;
  activeRoomId: string;
  homeRoomId: string | null;
  rooms: Room[];
};
```

- [ ] **Step 2: Créer le catalogue et les styles**

`src/core/library/furniture-catalog.ts` :

```ts
import type { FurnitureKind, StandingKind } from './library-types';

// Tailles en cases (largeur × hauteur). L'étagère a 3 niveaux de 5 emplacements (utilisés par le morceau « Cartes »).
export const CATALOG = {
  shelf: { label: 'Étagère', w: 6, h: 8, levels: 3, perLevel: 5 },
  desk: { label: 'Bureau', w: 5, h: 4 },
  computer: { label: 'Ordinateur' },
} as const;

export const FURNITURE_KINDS: FurnitureKind[] = ['shelf', 'desk', 'computer'];

export const labelOf = (kind: FurnitureKind): string => CATALOG[kind].label;

export function sizeOf(kind: StandingKind): { w: number; h: number } {
  const { w, h } = CATALOG[kind];
  return { w, h };
}
```

`src/core/library/styles.ts` :

```ts
import type { StyleId } from './library-types';

export type Palette = {
  wall: string;
  floor: string;
  skirt: string;
  wood: string;
  woodDark: string;
  desk: string;
  leg: string;
  edge: string;
  text: string;
};

const SCANDINAVE: Palette = {
  wall: '#EDE6DA',
  floor: '#D9BE95',
  skirt: '#FFFFFF',
  wood: '#D8C3A0',
  woodDark: '#B79F78',
  desk: '#E8D3AE',
  leg: '#FFFFFF',
  edge: '#C9B48E',
  text: '#8A8A8A',
};

// Les autres styles arrivent avec le morceau « Styles et décor » : en attendant, ils retombent sur Scandinave.
const PALETTES: Partial<Record<StyleId, Palette>> = { scandinave: SCANDINAVE };

export const paletteOf = (id: StyleId): Palette => PALETTES[id] ?? SCANDINAVE;
```

- [ ] **Step 3: Écrire le test de la grille (échoue)**

`tests/core/library/room-grid.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
  MAX_COLS,
  MIN_COLS,
  ROWS,
  SECTION,
  VISIBLE_COLS,
  WALL_ROWS,
  canPlace,
  canPlaceComputer,
  computerRect,
  moveComputer,
  moveStanding,
  placeComputer,
  placeStanding,
  pxRect,
  rectOf,
  removeFurniture,
  sectionIsEmpty,
  shelfSlots,
  shiftLayout,
} from '../../../src/core/library/room-grid';
import type { Layout } from '../../../src/core/library/library-types';

describe('constantes', () => {
  it('décrit la pièce et les fenêtres visibles', () => {
    expect([ROWS, WALL_ROWS, SECTION, MIN_COLS, MAX_COLS]).toEqual([12, 9, 12, 24, 96]);
    expect(VISIBLE_COLS).toEqual({ landscape: 24, portrait: 14 });
  });
});

describe('canPlace', () => {
  it('accepte un meuble dont le bas est au sol', () => {
    expect(canPlace([], 24, 'shelf', 0, 4).ok).toBe(true);
  });

  it('refuse un meuble dont le bas est sur le mur', () => {
    const res = canPlace([], 24, 'shelf', 0, 0);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('floor');
  });

  it('refuse un meuble qui dépasse de la pièce, selon sa largeur', () => {
    const res = canPlace([], 24, 'shelf', 20, 4);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('bounds');
    expect(canPlace([], 36, 'shelf', 20, 4).ok).toBe(true);
  });

  it('refuse un chevauchement et donne les cases en conflit', () => {
    const layout: Layout = [{ id: 'f1', kind: 'shelf', col: 0, row: 4 }];
    const res = canPlace(layout, 24, 'desk', 3, 8);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('taken');
      expect(res.cells.length).toBeGreaterThan(0);
    }
  });

  it('ignore le meuble déplacé', () => {
    const layout: Layout = [{ id: 'f1', kind: 'shelf', col: 0, row: 4 }];
    expect(canPlace(layout, 24, 'shelf', 1, 4, 'f1').ok).toBe(true);
  });
});

describe('pose, déplacement, retrait', () => {
  it('pose puis déplace un meuble', () => {
    const placed = placeStanding([], 24, 'desk', 2, 8, 'f1');
    expect(placed).toEqual([{ id: 'f1', kind: 'desk', col: 2, row: 8 }]);
    const moved = moveStanding(placed!, 24, 'f1', 10, 8);
    expect(moved).toEqual([{ id: 'f1', kind: 'desk', col: 10, row: 8 }]);
  });

  it('refuse un déplacement invalide', () => {
    const layout = placeStanding([], 24, 'desk', 2, 8, 'f1')!;
    expect(moveStanding(layout, 24, 'f1', 2, 2)).toBeNull();
  });

  it('ne pose un ordinateur que sur un bureau libre', () => {
    const layout = placeStanding([], 24, 'desk', 2, 8, 'f1')!;
    expect(canPlaceComputer(layout, 'inconnu')).toBe(false);
    const withPc = placeComputer(layout, 'f1', 'f2')!;
    expect(withPc).toHaveLength(2);
    expect(canPlaceComputer(withPc, 'f1')).toBe(false);
    expect(placeComputer(withPc, 'f1', 'f3')).toBeNull();
  });

  it("ne pose pas un ordinateur sur une étagère", () => {
    const layout = placeStanding([], 24, 'shelf', 2, 6, 'f1')!;
    expect(canPlaceComputer(layout, 'f1')).toBe(false);
  });

  it('déplace un ordinateur vers un autre bureau', () => {
    let layout = placeStanding([], 24, 'desk', 0, 8, 'f1')!;
    layout = placeStanding(layout, 24, 'desk', 10, 8, 'f2')!;
    layout = placeComputer(layout, 'f1', 'f3')!;
    const moved = moveComputer(layout, 'f3', 'f2');
    expect(moved?.find((p) => p.id === 'f3')).toEqual({ id: 'f3', kind: 'computer', deskId: 'f2' });
  });

  it("retire un bureau avec l'ordinateur qui y est posé", () => {
    let layout = placeStanding([], 24, 'desk', 0, 8, 'f1')!;
    layout = placeComputer(layout, 'f1', 'f2')!;
    expect(removeFurniture(layout, 'f1')).toEqual([]);
  });
});

describe('décalage et zones de bord', () => {
  it("décale les meubles au sol et laisse l'ordinateur suivre son bureau", () => {
    let layout = placeStanding([], 24, 'desk', 2, 8, 'f1')!;
    layout = placeComputer(layout, 'f1', 'f2')!;
    expect(shiftLayout(layout, 12)).toEqual([
      { id: 'f1', kind: 'desk', col: 14, row: 8 },
      { id: 'f2', kind: 'computer', deskId: 'f1' },
    ]);
  });

  it('dit si la zone du bord est vide', () => {
    const layout = placeStanding([], 24, 'desk', 2, 8, 'f1')!;
    expect(sectionIsEmpty(layout, 24, 'left')).toBe(false);
    expect(sectionIsEmpty(layout, 24, 'right')).toBe(true);
    const both = placeStanding(layout, 24, 'shelf', 18, 6, 'f2')!;
    expect(sectionIsEmpty(both, 24, 'right')).toBe(false);
  });

  it('compte un meuble à cheval sur la frontière comme occupant la zone', () => {
    const layout = placeStanding([], 36, 'desk', 10, 8, 'f1')!;
    expect(sectionIsEmpty(layout, 36, 'left')).toBe(false);
  });
});

describe('rectangles en pixels', () => {
  it('convertit un meuble en pixels', () => {
    const rect = rectOf({ id: 'f1', kind: 'desk', col: 2, row: 8 })!;
    expect(rect).toEqual({ col: 2, row: 8, w: 5, h: 4 });
    expect(pxRect(rect)).toMatchObject({ x: 60, w: 150 });
  });

  it("pose l'ordinateur sur le dessus du bureau", () => {
    const desk = pxRect({ col: 0, row: 8, w: 5, h: 4 });
    const pc = computerRect(desk);
    expect(pc.y + pc.h).toBeLessThanOrEqual(desk.y + 4);
    expect(pc.x).toBeGreaterThanOrEqual(desk.x);
    expect(pc.x + pc.w).toBeLessThanOrEqual(desk.x + desk.w);
  });

  it("donne 15 emplacements dans l'étagère", () => {
    const shelf = pxRect({ col: 0, row: 4, w: 6, h: 8 });
    const slots = shelfSlots(shelf);
    expect(slots).toHaveLength(15);
    for (const s of slots) {
      expect(s.x).toBeGreaterThanOrEqual(shelf.x);
      expect(s.y).toBeGreaterThanOrEqual(shelf.y);
      expect(s.x + s.w).toBeLessThanOrEqual(shelf.x + shelf.w);
      expect(s.y + s.h).toBeLessThanOrEqual(shelf.y + shelf.h);
    }
  });
});
```

- [ ] **Step 4: Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run tests/core/library/room-grid.test.ts`
Expected: FAIL (module `room-grid` introuvable).

- [ ] **Step 5: Implémenter la grille**

`src/core/library/room-grid.ts` :

```ts
import { sizeOf } from './furniture-catalog';
import type { Layout, Orientation, Placed, StandingKind } from './library-types';

export const ROWS = 12;
// Les lignes 0 à WALL_ROWS - 1 sont le mur, les suivantes le sol.
export const WALL_ROWS = 9;
export const CELL_W = 30;
export const HEIGHT = 340;
export const CELL_H = HEIGHT / ROWS;
// La pièce grandit et rétrécit par zones de 12 colonnes, de 24 à 96 colonnes.
export const SECTION = 12;
export const MIN_COLS = 24;
export const MAX_COLS = 96;
// Colonnes visibles d'un coup : l'orientation règle seulement cette fenêtre, le reste se fait défiler.
export const VISIBLE_COLS: Record<Orientation, number> = { landscape: 24, portrait: 14 };

export type Cell = { col: number; row: number };
export type Rect = { col: number; row: number; w: number; h: number };
export type PxRect = { x: number; y: number; w: number; h: number };

export type PlaceResult =
  | { ok: true }
  | { ok: false; reason: 'bounds' | 'floor' | 'taken'; cells: Cell[] };

type Standing = Extract<Placed, { kind: StandingKind }>;

export const isStanding = (p: Placed): p is Standing => p.kind !== 'computer';

export function rectOf(p: Placed): Rect | null {
  if (!isStanding(p)) return null;
  const { w, h } = sizeOf(p.kind);
  return { col: p.col, row: p.row, w, h };
}

function cellsOf(rect: Rect): Cell[] {
  const cells: Cell[] = [];
  for (let row = rect.row; row < rect.row + rect.h; row++) {
    for (let col = rect.col; col < rect.col + rect.w; col++) cells.push({ col, row });
  }
  return cells;
}

export function canPlace(layout: Layout, cols: number, kind: StandingKind, col: number, row: number, ignoreId?: string): PlaceResult {
  const { w, h } = sizeOf(kind);
  const cells = cellsOf({ col, row, w, h });
  const inRoom = (c: Cell): boolean => c.col >= 0 && c.row >= 0 && c.col < cols && c.row < ROWS;
  if (cells.some((c) => !inRoom(c))) return { ok: false, reason: 'bounds', cells: cells.filter(inRoom) };
  if (row + h - 1 < WALL_ROWS) return { ok: false, reason: 'floor', cells: cells.filter((c) => c.row === row + h - 1) };
  const taken = new Set<string>();
  for (const other of layout) {
    if (other.id === ignoreId) continue;
    const otherRect = rectOf(other);
    if (!otherRect) continue;
    for (const c of cellsOf(otherRect)) taken.add(`${c.col}-${c.row}`);
  }
  const clash = cells.filter((c) => taken.has(`${c.col}-${c.row}`));
  return clash.length > 0 ? { ok: false, reason: 'taken', cells: clash } : { ok: true };
}

export function placeStanding(layout: Layout, cols: number, kind: StandingKind, col: number, row: number, id: string): Layout | null {
  if (!canPlace(layout, cols, kind, col, row).ok) return null;
  return [...layout, { id, kind, col, row }];
}

export function moveStanding(layout: Layout, cols: number, id: string, col: number, row: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || !isStanding(item)) return null;
  if (!canPlace(layout, cols, item.kind, col, row, id).ok) return null;
  return layout.map((p) => (p.id === id ? { id, kind: item.kind, col, row } : p));
}

// Un ordinateur se pose sur un bureau qui n'en porte pas déjà un (le sien, en cas de déplacement, ne compte pas).
export function canPlaceComputer(layout: Layout, deskId: string, ignoreId?: string): boolean {
  const desk = layout.find((p) => p.id === deskId);
  if (!desk || desk.kind !== 'desk') return false;
  return !layout.some((p) => p.kind === 'computer' && p.deskId === deskId && p.id !== ignoreId);
}

export function placeComputer(layout: Layout, deskId: string, id: string): Layout | null {
  if (!canPlaceComputer(layout, deskId)) return null;
  return [...layout, { id, kind: 'computer', deskId }];
}

export function moveComputer(layout: Layout, id: string, deskId: string): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'computer' || !canPlaceComputer(layout, deskId, id)) return null;
  return layout.map((p) => (p.id === id ? { id, kind: 'computer', deskId } : p));
}

// Retirer un bureau retire aussi l'ordinateur qui y est posé.
export function removeFurniture(layout: Layout, id: string): Layout {
  return layout.filter((p) => p.id !== id && !(p.kind === 'computer' && p.deskId === id));
}

// Ajouter une zone à gauche décale les colonnes de tous les meubles ; l'ordinateur suit son bureau.
export function shiftLayout(layout: Layout, delta: number): Layout {
  return layout.map((p) => (isStanding(p) ? { id: p.id, kind: p.kind, col: p.col + delta, row: p.row } : p));
}

// La zone de 12 colonnes au bord est vide quand aucun meuble ne la touche (même à cheval sur sa frontière).
export function sectionIsEmpty(layout: Layout, cols: number, side: 'left' | 'right'): boolean {
  return layout.every((p) => {
    const rect = rectOf(p);
    if (!rect) return true;
    return side === 'left' ? rect.col >= SECTION : rect.col + rect.w <= cols - SECTION;
  });
}

export function pxRect(rect: Rect): PxRect {
  return { x: rect.col * CELL_W, y: rect.row * CELL_H, w: rect.w * CELL_W, h: rect.h * CELL_H };
}

const COMPUTER_W = 84;
const COMPUTER_H = 56;

// L'ordinateur est centré sur le plateau du bureau, son pied appuyé dessus.
export function computerRect(desk: PxRect): PxRect {
  return { x: desk.x + desk.w / 2 - COMPUTER_W / 2, y: desk.y - COMPUTER_H + 4, w: COMPUTER_W, h: COMPUTER_H };
}

const SHELF_MARGIN = 6;
const SHELF_LEVELS = 3;
const SHELF_PER_LEVEL = 5;

// Les 15 emplacements d'une étagère, du haut vers le bas puis de gauche à droite.
export function shelfSlots(shelf: PxRect): PxRect[] {
  const levelH = (shelf.h - 2 * SHELF_MARGIN) / SHELF_LEVELS;
  const slotW = (shelf.w - 2 * SHELF_MARGIN) / SHELF_PER_LEVEL;
  const slots: PxRect[] = [];
  for (let i = 0; i < SHELF_LEVELS; i++) {
    for (let j = 0; j < SHELF_PER_LEVEL; j++) {
      slots.push({ x: shelf.x + SHELF_MARGIN + j * slotW + 2, y: shelf.y + SHELF_MARGIN + i * levelH + 4, w: slotW - 4, h: levelH - 8 });
    }
  }
  return slots;
}
```

- [ ] **Step 6: Lancer le test, vérifier qu'il passe**

Run: `npx vitest run tests/core/library/room-grid.test.ts`
Expected: PASS (tous les tests).

- [ ] **Step 7: Typecheck et commit**

```bash
npm run typecheck
git add src/core/library tests/core/library
git commit -m "feat(bibliotheque): types, catalogue, styles et règles de la grille"
```

---

### Task 2: État des pièces (opérations pures)

**Files:**
- Create: `src/core/library/library-book.ts`
- Test: `tests/core/library/library-book.test.ts`

**Interfaces:**
- Consumes: `Room`, `LibraryState`, `Layout`, `Orientation`, `STYLE_IDS` (Task 1) ; `MIN_COLS`, `MAX_COLS`, `SECTION`, `shiftLayout`, `sectionIsEmpty` (Task 1, `room-grid`).
- Produces :
  - `MAX_ROOMS = 12`, `MAX_NAME = 30`
  - `createInitialState(): LibraryState`
  - `activeRoom(state): Room`
  - `addRoom(state)`, `renameRoom(state, id, name)`, `deleteRoom(state, id)`, `setActive(state, id)`, `setHome(state, id | null)`, `setOrientation(state, id, o)`
  - `extendRoom(state, id, side: 'left' | 'right')`, `shrinkRoom(state, id, side)`
  - `updateLayout(state, roomId, change: (layout: Layout, cols: number) => Layout | null): LibraryState`
  - `nextFurnitureId(layout): string`
  - `parseLibraryState(raw: unknown): LibraryState`

- [ ] **Step 1: Écrire le test (échoue)**

`tests/core/library/library-book.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
  MAX_ROOMS,
  activeRoom,
  addRoom,
  createInitialState,
  deleteRoom,
  extendRoom,
  nextFurnitureId,
  parseLibraryState,
  renameRoom,
  setActive,
  setHome,
  setOrientation,
  shrinkRoom,
  updateLayout,
} from '../../../src/core/library/library-book';

describe('état initial', () => {
  it('a une pièce horizontale vide de 24 colonnes', () => {
    const state = createInitialState();
    expect(state.rooms).toHaveLength(1);
    expect(activeRoom(state)).toMatchObject({ name: 'Pièce 1', orientation: 'landscape', style: 'scandinave', cols: 24, layout: [] });
    expect(state.homeRoomId).toBeNull();
  });
});

describe('pièces', () => {
  it("ajoute une pièce qui devient active et garde l'orientation précédente", () => {
    let state = setOrientation(createInitialState(), 'r1', 'portrait');
    state = addRoom(state);
    expect(state.rooms).toHaveLength(2);
    expect(state.activeRoomId).toBe('r2');
    expect(activeRoom(state).orientation).toBe('portrait');
    expect(activeRoom(state).cols).toBe(24);
  });

  it('limite à 12 pièces', () => {
    let state = createInitialState();
    for (let i = 0; i < 20; i++) state = addRoom(state);
    expect(state.rooms).toHaveLength(MAX_ROOMS);
  });

  it('renomme avec un nom propre', () => {
    const state = renameRoom(createInitialState(), 'r1', '  Salon  ');
    expect(state.rooms[0]?.name).toBe('Salon');
    expect(renameRoom(state, 'r1', '   ')).toBe(state);
    expect(renameRoom(state, 'r1', 'x'.repeat(50)).rooms[0]?.name).toHaveLength(30);
  });

  it("supprime une pièce et passe à sa voisine, en retirant l'accueil", () => {
    let state = addRoom(createInitialState());
    state = setHome(state, 'r2');
    state = deleteRoom(state, 'r2');
    expect(state.rooms.map((r) => r.id)).toEqual(['r1']);
    expect(state.activeRoomId).toBe('r1');
    expect(state.homeRoomId).toBeNull();
  });

  it('vide la dernière pièce au lieu de la supprimer', () => {
    let state = extendRoom(createInitialState(), 'r1', 'right');
    state = updateLayout(state, 'r1', () => [{ id: 'f1', kind: 'desk', col: 0, row: 8 }]);
    state = deleteRoom(state, 'r1');
    expect(state.rooms).toHaveLength(1);
    expect(activeRoom(state)).toMatchObject({ layout: [], cols: 24 });
  });

  it("n'accepte comme pièce d'accueil qu'une pièce qui existe", () => {
    const state = createInitialState();
    expect(setHome(state, 'zzz')).toBe(state);
    expect(setHome(state, 'r1').homeRoomId).toBe('r1');
    expect(setHome(setHome(state, 'r1'), null).homeRoomId).toBeNull();
  });

  it("ne change pas d'active vers une pièce inconnue", () => {
    const state = createInitialState();
    expect(setActive(state, 'zzz')).toBe(state);
  });
});

describe('agrandir et réduire', () => {
  it('ajoute une zone à droite sans toucher aux meubles', () => {
    let state = updateLayout(createInitialState(), 'r1', () => [{ id: 'f1', kind: 'desk', col: 2, row: 8 }]);
    state = extendRoom(state, 'r1', 'right');
    expect(activeRoom(state).cols).toBe(36);
    expect(activeRoom(state).layout).toEqual([{ id: 'f1', kind: 'desk', col: 2, row: 8 }]);
  });

  it('ajoute une zone à gauche en décalant les meubles de 12 colonnes', () => {
    let state = updateLayout(createInitialState(), 'r1', () => [{ id: 'f1', kind: 'desk', col: 2, row: 8 }]);
    state = extendRoom(state, 'r1', 'left');
    expect(activeRoom(state).cols).toBe(36);
    expect(activeRoom(state).layout).toEqual([{ id: 'f1', kind: 'desk', col: 14, row: 8 }]);
  });

  it('ne dépasse pas 96 colonnes', () => {
    let state = createInitialState();
    for (let i = 0; i < 12; i++) state = extendRoom(state, 'r1', 'right');
    expect(activeRoom(state).cols).toBe(96);
  });

  it('réduit une zone vide, à droite comme à gauche', () => {
    let state = extendRoom(createInitialState(), 'r1', 'right');
    state = shrinkRoom(state, 'r1', 'right');
    expect(activeRoom(state).cols).toBe(24);

    state = updateLayout(extendRoom(createInitialState(), 'r1', 'left'), 'r1', () => [{ id: 'f1', kind: 'desk', col: 20, row: 8 }]);
    state = shrinkRoom(state, 'r1', 'left');
    expect(activeRoom(state)).toMatchObject({ cols: 24, layout: [{ id: 'f1', kind: 'desk', col: 8, row: 8 }] });
  });

  it('refuse de réduire une zone occupée ou sous 24 colonnes', () => {
    const base = createInitialState();
    expect(shrinkRoom(base, 'r1', 'right')).toBe(base);
    let state = extendRoom(base, 'r1', 'right');
    state = updateLayout(state, 'r1', () => [{ id: 'f1', kind: 'shelf', col: 30, row: 4 }]);
    expect(shrinkRoom(state, 'r1', 'right')).toBe(state);
  });
});

describe('aménagement unique', () => {
  it("garde l'aménagement quand l'orientation change", () => {
    let state = updateLayout(createInitialState(), 'r1', () => [{ id: 'f1', kind: 'desk', col: 0, row: 8 }]);
    state = setOrientation(state, 'r1', 'portrait');
    expect(activeRoom(state).layout).toHaveLength(1);
    state = setOrientation(state, 'r1', 'landscape');
    expect(activeRoom(state).layout).toHaveLength(1);
  });

  it('transmet la largeur au changement et ignore un refus (null)', () => {
    const state = createInitialState();
    let seen = 0;
    updateLayout(state, 'r1', (_layout, cols) => {
      seen = cols;
      return null;
    });
    expect(seen).toBe(24);
    expect(updateLayout(state, 'r1', () => null)).toBe(state);
  });

  it('donne le premier identifiant libre', () => {
    expect(nextFurnitureId([])).toBe('f1');
    expect(nextFurnitureId([{ id: 'f1', kind: 'desk', col: 0, row: 8 }, { id: 'f3', kind: 'shelf', col: 8, row: 4 }])).toBe('f2');
  });
});

describe('parseLibraryState', () => {
  it('retombe sur une pièce vide quand le contenu est absent ou illisible', () => {
    expect(parseLibraryState(undefined).rooms).toHaveLength(1);
    expect(parseLibraryState('n importe quoi').rooms).toHaveLength(1);
    expect(parseLibraryState({ version: 2 }).rooms).toHaveLength(1);
  });

  it('relit un état valide', () => {
    let state = extendRoom(addRoom(createInitialState()), 'r2', 'left');
    state = setHome(state, 'r1');
    expect(parseLibraryState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('refuse une largeur qui n est pas un multiple de 12', () => {
    const state = createInitialState();
    const broken = { ...state, rooms: [{ ...state.rooms[0]!, cols: 30 }] };
    expect(parseLibraryState(broken)).toEqual(createInitialState());
  });

  it("corrige une pièce active ou d'accueil inconnue", () => {
    const broken = { ...createInitialState(), activeRoomId: 'zzz', homeRoomId: 'yyy' };
    const fixed = parseLibraryState(broken);
    expect(fixed.activeRoomId).toBe('r1');
    expect(fixed.homeRoomId).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/library/library-book.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

`src/core/library/library-book.ts` :

```ts
import { z } from 'zod';
import { STYLE_IDS, type Layout, type LibraryState, type Orientation, type Room } from './library-types';
import { MAX_COLS, MIN_COLS, SECTION, sectionIsEmpty, shiftLayout } from './room-grid';

export const MAX_ROOMS = 12;
export const MAX_NAME = 30;

const placedSchema = z.union([
  z.object({ id: z.string(), kind: z.enum(['shelf', 'desk']), col: z.number().int(), row: z.number().int() }),
  z.object({ id: z.string(), kind: z.literal('computer'), deskId: z.string() }),
]);
const roomSchema = z.object({
  id: z.string(),
  name: z.string(),
  style: z.enum(STYLE_IDS),
  orientation: z.enum(['landscape', 'portrait']),
  cols: z.number().int().min(MIN_COLS).max(MAX_COLS).refine((cols) => cols % SECTION === 0),
  layout: z.array(placedSchema),
});
const stateSchema = z.object({
  version: z.literal(1),
  activeRoomId: z.string(),
  homeRoomId: z.string().nullable(),
  rooms: z.array(roomSchema).min(1).max(MAX_ROOMS),
});

function nextId(prefix: string, taken: string[]): string {
  let n = 1;
  while (taken.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

const makeRoom = (id: string, name: string, orientation: Orientation, style: Room['style'] = 'scandinave'): Room => ({
  id,
  name,
  style,
  orientation,
  cols: MIN_COLS,
  layout: [],
});

export function createInitialState(): LibraryState {
  return { version: 1, activeRoomId: 'r1', homeRoomId: null, rooms: [makeRoom('r1', 'Pièce 1', 'landscape')] };
}

export function activeRoom(state: LibraryState): Room {
  return state.rooms.find((room) => room.id === state.activeRoomId) ?? state.rooms[0]!;
}

// Une lecture sûre : un contenu absent, d'une autre version ou abîmé redonne une pièce vide (comme `readView`).
export function parseLibraryState(raw: unknown): LibraryState {
  const parsed = stateSchema.safeParse(raw);
  if (!parsed.success) return createInitialState();
  const state = parsed.data;
  const ids = state.rooms.map((room) => room.id);
  return {
    ...state,
    activeRoomId: ids.includes(state.activeRoomId) ? state.activeRoomId : ids[0]!,
    homeRoomId: state.homeRoomId !== null && ids.includes(state.homeRoomId) ? state.homeRoomId : null,
  };
}

const mapRoom = (state: LibraryState, id: string, change: (room: Room) => Room): LibraryState => ({
  ...state,
  rooms: state.rooms.map((room) => (room.id === id ? change(room) : room)),
});

export function addRoom(state: LibraryState): LibraryState {
  if (state.rooms.length >= MAX_ROOMS) return state;
  const current = activeRoom(state);
  const id = nextId('r', state.rooms.map((room) => room.id));
  const room = makeRoom(id, `Pièce ${state.rooms.length + 1}`, current.orientation, current.style);
  return { ...state, rooms: [...state.rooms, room], activeRoomId: id };
}

export function renameRoom(state: LibraryState, id: string, name: string): LibraryState {
  const clean = name.trim().slice(0, MAX_NAME);
  if (clean === '' || !state.rooms.some((room) => room.id === id)) return state;
  return mapRoom(state, id, (room) => ({ ...room, name: clean }));
}

export function deleteRoom(state: LibraryState, id: string): LibraryState {
  if (!state.rooms.some((room) => room.id === id)) return state;
  if (state.rooms.length === 1) return mapRoom(state, id, (room) => ({ ...room, cols: MIN_COLS, layout: [] }));
  const index = state.rooms.findIndex((room) => room.id === id);
  const rooms = state.rooms.filter((room) => room.id !== id);
  const activeRoomId = state.activeRoomId === id ? rooms[Math.min(index, rooms.length - 1)]!.id : state.activeRoomId;
  return { ...state, rooms, activeRoomId, homeRoomId: state.homeRoomId === id ? null : state.homeRoomId };
}

export function setActive(state: LibraryState, id: string): LibraryState {
  if (!state.rooms.some((room) => room.id === id) || state.activeRoomId === id) return state;
  return { ...state, activeRoomId: id };
}

export function setHome(state: LibraryState, id: string | null): LibraryState {
  if (id !== null && !state.rooms.some((room) => room.id === id)) return state;
  return { ...state, homeRoomId: id };
}

export function setOrientation(state: LibraryState, id: string, orientation: Orientation): LibraryState {
  return mapRoom(state, id, (room) => ({ ...room, orientation }));
}

// Une zone de 12 colonnes de plus ; à gauche, les meubles se décalent pour rester où ils sont dans la pièce.
export function extendRoom(state: LibraryState, id: string, side: 'left' | 'right'): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === id);
  if (!room || room.cols + SECTION > MAX_COLS) return state;
  return mapRoom(state, id, (r) => ({ ...r, cols: r.cols + SECTION, layout: side === 'left' ? shiftLayout(r.layout, SECTION) : r.layout }));
}

// Retire la zone du bord si elle est entièrement vide et si la pièce reste d'au moins 24 colonnes.
export function shrinkRoom(state: LibraryState, id: string, side: 'left' | 'right'): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === id);
  if (!room || room.cols - SECTION < MIN_COLS || !sectionIsEmpty(room.layout, room.cols, side)) return state;
  return mapRoom(state, id, (r) => ({ ...r, cols: r.cols - SECTION, layout: side === 'left' ? shiftLayout(r.layout, -SECTION) : r.layout }));
}

// Applique un changement à l'aménagement de la pièce ; `null` = changement refusé, rien ne bouge.
export function updateLayout(state: LibraryState, roomId: string, change: (layout: Layout, cols: number) => Layout | null): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === roomId);
  if (!room) return state;
  const next = change(room.layout, room.cols);
  if (next === null) return state;
  return mapRoom(state, roomId, (r) => ({ ...r, layout: next }));
}

export function nextFurnitureId(layout: Layout): string {
  return nextId('f', layout.map((placed) => placed.id));
}
```

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `npx vitest run tests/core/library/library-book.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck et commit**

```bash
npm run typecheck
git add src/core/library/library-book.ts tests/core/library/library-book.test.ts
git commit -m "feat(bibliotheque): état des pièces (création, accueil, orientation, agrandir et réduire, lecture sûre)"
```

---

### Task 3: Dépôt de stockage

**Files:**
- Create: `src/core/library/library-repo.ts`
- Test: `tests/core/library/library-repo.test.ts`

**Interfaces:**
- Consumes: `KeyValueStore` (`src/core/cache/store.ts`), `parseLibraryState`, `LibraryState`.
- Produces: `createLibraryRepo(store): { current(): LibraryState | null; subscribe(l): () => void; load(): Promise<LibraryState>; update(change: (s: LibraryState) => LibraryState): Promise<void> }` et `type LibraryRepo`.

- [ ] **Step 1: Écrire le test (échoue)**

`tests/core/library/library-repo.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { addRoom, renameRoom } from '../../../src/core/library/library-book';
import { createLibraryRepo } from '../../../src/core/library/library-repo';

describe('createLibraryRepo', () => {
  it('charge une pièce vide quand rien n est enregistré', async () => {
    const repo = createLibraryRepo(createMemoryStore());
    expect(repo.current()).toBeNull();
    const state = await repo.load();
    expect(state.rooms).toHaveLength(1);
    expect(repo.current()).toEqual(state);
  });

  it('enregistre les changements et les relit', async () => {
    const store = createMemoryStore();
    const repo = createLibraryRepo(store);
    await repo.update(addRoom);
    const again = await createLibraryRepo(store).load();
    expect(again.rooms).toHaveLength(2);
  });

  it('sérialise deux changements simultanés', async () => {
    const repo = createLibraryRepo(createMemoryStore());
    await Promise.all([repo.update(addRoom), repo.update((s) => renameRoom(s, 'r1', 'Salon'))]);
    const state = await repo.load();
    expect(state.rooms).toHaveLength(2);
    expect(state.rooms[0]?.name).toBe('Salon');
  });

  it('prévient les abonnés et permet de se désabonner', async () => {
    const repo = createLibraryRepo(createMemoryStore());
    const listener = vi.fn();
    const off = repo.subscribe(listener);
    await repo.update(addRoom);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    await repo.update(addRoom);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reste utilisable après un échec d écriture', async () => {
    const store = createMemoryStore();
    const failing = { get: store.get.bind(store), set: vi.fn().mockRejectedValueOnce(new Error('plein')).mockImplementation(store.set.bind(store)) };
    const repo = createLibraryRepo(failing);
    await expect(repo.update(addRoom)).rejects.toThrow('plein');
    await repo.update(addRoom);
    expect((await repo.load()).rooms).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/library/library-repo.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter**

`src/core/library/library-repo.ts` :

```ts
import type { KeyValueStore } from '../cache/store';
import { parseLibraryState } from './library-book';
import type { LibraryState } from './library-types';

const KEY = 'library';

export function createLibraryRepo(store: KeyValueStore) {
  // Écritures sérialisées : deux changements simultanés ne s'écrasent pas (comme `geo-repo`).
  let writeTail: Promise<unknown> = Promise.resolve();
  // Dernier état lu ou écrit : le panneau, remonté, repart de là sans attendre le stockage.
  let latest: LibraryState | null = null;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const read = async (): Promise<LibraryState> => parseLibraryState(await store.get<unknown>(KEY));

  return {
    current: (): LibraryState | null => latest,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async load(): Promise<LibraryState> {
      await writeTail;
      latest = await read();
      notify();
      return latest;
    },
    update(change: (state: LibraryState) => LibraryState): Promise<void> {
      const run = writeTail.then(async () => {
        const next = change(await read());
        await store.set(KEY, next);
        latest = next;
        notify();
      });
      writeTail = run.catch(() => undefined);
      return run;
    },
  };
}

export type LibraryRepo = ReturnType<typeof createLibraryRepo>;
```

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `npx vitest run tests/core/library/library-repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/core/library/library-repo.ts tests/core/library/library-repo.test.ts
git commit -m "feat(bibliotheque): dépôt de stockage des pièces"
```

---

### Task 4: Vue « library » et bouton du sélecteur

**Files:**
- Modify: `src/content/collection-view.ts`
- Modify: `src/content/world-toggle.ts`
- Test: `tests/content/library-view.test.ts`

**Interfaces:**
- Produces: `CollectionView` accepte `'library'` ; `ensureViewSwitch` crée un bouton `[data-wmt-view="library"]` (label « Bibliothèque : ranger ses cartes dans des pièces »).

- [ ] **Step 1: Écrire le test (échoue)**

`tests/content/library-view.test.ts` :

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { readView, writeView } from '../../src/content/collection-view';
import { ensureViewSwitch } from '../../src/content/world-toggle';

describe('vue library', () => {
  it('est écrite puis relue', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    writeView(storage, 'library');
    expect(readView(storage)).toBe('library');
  });

  it('retombe sur homemade quand le stockage est bloqué', () => {
    expect(readView({ getItem: () => { throw new Error('bloqué'); } })).toBe('homemade');
  });

  it('apparaît dans le sélecteur et se choisit', () => {
    document.body.innerHTML = '<div><button id="anchor">Sélectionner</button></div>';
    const anchor = document.getElementById('anchor') as HTMLButtonElement;
    const onSelect = vi.fn();
    const group = ensureViewSwitch(anchor, anchor, 'library', onSelect);
    const button = group.querySelector<HTMLButtonElement>('[data-wmt-view="library"]');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.getAttribute('aria-label')).toContain('Bibliothèque');
    button?.click();
    expect(onSelect).toHaveBeenCalledWith('library');
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/library-view.test.ts`
Expected: FAIL (`library` non reconnue : la relecture renvoie `homemade`).

- [ ] **Step 3: Modifier `collection-view.ts`**

Remplacer le type et la lecture :

```ts
export type CollectionView = 'homemade' | 'world' | 'timeline' | 'web' | 'library' | 'list';
```

et dans `readView` :

```ts
    return value === 'list' || value === 'world' || value === 'timeline' || value === 'web' || value === 'library' || value === 'homemade' ? value : 'homemade';
```

- [ ] **Step 4: Modifier `world-toggle.ts`**

Ajouter le glyphe après `GANTT` (icône Lucide « book-open ») :

```ts
const BOOK = [
  'M12 7v14',
  'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z',
];
```

et l'entrée dans `VIEWS`, entre `web` et `list` :

```ts
  { view: 'library', label: 'Bibliothèque : ranger ses cartes dans des pièces', glyph: BOOK },
```

Mettre aussi à jour le commentaire au-dessus des icônes : ajouter « book-open » à la liste.

- [ ] **Step 5: Lancer, vérifier le succès**

Run: `npx vitest run tests/content/library-view.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck et commit**

`npm run typecheck` signalera les endroits où le type `CollectionView` est traité exhaustivement : les corriger (aucun ne devrait exister hors `collection-ui.tsx`, traité en Task 7).

```bash
git add src/content/collection-view.ts src/content/world-toggle.ts tests/content/library-view.test.ts
git commit -m "feat(bibliotheque): vue library et bouton dans le sélecteur de vues"
```

---

### Task 5: Dessin de la pièce (RoomView)

**Files:**
- Create: `src/content/furniture-art.tsx`
- Create: `src/content/RoomView.tsx`

**Interfaces:**
- Consumes: `Room`, `Placed`, `paletteOf`, `CELL_W`, `CELL_H`, `HEIGHT`, `ROWS`, `WALL_ROWS`, `VISIBLE_COLS`, `pxRect`, `rectOf`, `computerRect`, `shelfSlots`, `Cell`, `PxRect`.
- Produces:
  - `export type Tool = { type: 'new'; kind: FurnitureKind } | { type: 'move'; id: string } | null` (dans `RoomView.tsx`)
  - `RoomView` props : `{ room: Room; editing: boolean; cellsActive: boolean; selectedId: string | null; blink: Cell[]; onCell: (col: number, row: number) => void; onPick: (id: string) => void }`
  - Le SVG dessine toute la pièce (`cols × 30` de large, 340 de haut) ; sa largeur CSS vaut `cols / colonnes visibles` fois celle du conteneur, ce qui fait apparaître la fenêtre voulue (24 ou 14 colonnes). Le conteneur qui défile est fourni par `LibraryPanel` (Task 6).
  - Attributs de test : `[data-cell="col-row"]`, `[data-furniture="shelf|desk|computer"]` (avec `data-id`).

Ce composant n'a pas de test unitaire propre : il est exercé par les tests de `LibraryPanel` (Task 6).

- [ ] **Step 1: Créer le dessin des meubles**

`src/content/furniture-art.tsx` :

```tsx
import type { PxRect } from '../core/library/room-grid';
import { shelfSlots } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';

type ArtProps = { rect: PxRect; palette: Palette };

export function ShelfArt({ rect, palette, showSlots }: ArtProps & { showSlots: boolean }) {
  const { x, y, w, h } = rect;
  const boardH = 5;
  const inner = 6;
  const levelH = (h - 2 * inner) / 3;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={palette.wood} stroke={palette.edge} strokeWidth={1.5} />
      <rect x={x + inner} y={y + inner} width={w - 2 * inner} height={h - 2 * inner} fill={palette.woodDark} />
      {[1, 2].map((i) => (
        <rect key={i} x={x + inner} y={y + inner + i * levelH - boardH / 2} width={w - 2 * inner} height={boardH} fill={palette.wood} />
      ))}
      {showSlots &&
        shelfSlots(rect).map((slot, i) => (
          <rect key={i} x={slot.x} y={slot.y} width={slot.w} height={slot.h} rx={2} fill="none" stroke={palette.text} strokeWidth={1} strokeDasharray="3 3" />
        ))}
    </g>
  );
}

export function DeskArt({ rect, palette }: ArtProps) {
  const { x, y, w, h } = rect;
  return (
    <g>
      <rect x={x} y={y} width={w} height={8} rx={3} fill={palette.desk} stroke={palette.edge} strokeWidth={1} />
      <rect x={x + 10} y={y + 8} width={6} height={h - 8} fill={palette.leg} stroke={palette.edge} strokeWidth={1} />
      <rect x={x + w - 16} y={y + 8} width={6} height={h - 8} fill={palette.leg} stroke={palette.edge} strokeWidth={1} />
    </g>
  );
}

// Écran vide pour l'instant : le morceau « Cartes » y affichera une carte.
export function ComputerArt({ rect }: { rect: PxRect }) {
  const { x, y, w, h } = rect;
  const screenH = h - 12;
  return (
    <g>
      <rect x={x} y={y} width={w} height={screenH} rx={5} fill="#1D1D22" />
      <rect x={x + 5} y={y + 5} width={w - 10} height={screenH - 10} rx={2} fill="#A8C5E6" />
      <rect x={x + w / 2 - 4} y={y + screenH} width={8} height={h - screenH - 4} fill="#555555" />
      <rect x={x + w / 2 - 17} y={y + h - 4} width={34} height={4} rx={2} fill="#555555" />
    </g>
  );
}
```

- [ ] **Step 2: Créer RoomView**

`src/content/RoomView.tsx` :

```tsx
import type { ReactElement } from 'react';
import type { FurnitureKind, Placed, Room } from '../core/library/library-types';
import { CELL_H, CELL_W, HEIGHT, ROWS, VISIBLE_COLS, WALL_ROWS, computerRect, pxRect, rectOf, type Cell, type PxRect } from '../core/library/room-grid';
import { paletteOf } from '../core/library/styles';
import { ComputerArt, DeskArt, ShelfArt } from './furniture-art';

export type Tool = { type: 'new'; kind: FurnitureKind } | { type: 'move'; id: string } | null;

type Props = {
  room: Room;
  editing: boolean;
  // Les cases captent les touchers (une pose ou un déplacement est en cours) ; sinon ce sont les meubles.
  cellsActive: boolean;
  selectedId: string | null;
  blink: Cell[];
  onCell: (col: number, row: number) => void;
  onPick: (id: string) => void;
};

export function RoomView({ room, editing, cellsActive, selectedId, blink, onCell, onPick }: Props) {
  const palette = paletteOf(room.style);
  const width = room.cols * CELL_W;
  const wallH = WALL_ROWS * CELL_H;
  const blinking = new Set(blink.map((c) => `${c.col}-${c.row}`));

  const deskRects = new Map<string, PxRect>();
  for (const placed of room.layout) {
    const rect = rectOf(placed);
    if (rect && placed.kind === 'desk') deskRects.set(placed.id, pxRect(rect));
  }
  const outline = (rect: PxRect) => (
    <rect x={rect.x - 3} y={rect.y - 3} width={rect.w + 6} height={rect.h + 6} rx={6} fill="none" stroke="#378ADD" strokeWidth={2.5} strokeDasharray="6 4" />
  );

  function renderPlaced(placed: Placed): ReactElement | null {
    let rect: PxRect;
    let art: ReactElement;
    if (placed.kind === 'computer') {
      const desk = deskRects.get(placed.deskId);
      if (!desk) return null;
      rect = computerRect(desk);
      art = <ComputerArt rect={rect} />;
    } else {
      const cells = rectOf(placed);
      if (!cells) return null;
      rect = pxRect(cells);
      art = placed.kind === 'shelf' ? <ShelfArt rect={rect} palette={palette} showSlots={editing} /> : <DeskArt rect={rect} palette={palette} />;
    }
    return (
      <g
        key={placed.id}
        data-furniture={placed.kind}
        data-id={placed.id}
        onClick={editing ? () => onPick(placed.id) : undefined}
        style={{ cursor: editing ? 'pointer' : 'default' }}
      >
        {art}
        {editing && selectedId === placed.id && outline(rect)}
        {editing && <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="transparent" />}
      </g>
    );
  }

  // Les ordinateurs se dessinent après les bureaux, pour rester dessus.
  const ordered = [...room.layout.filter((p) => p.kind !== 'computer'), ...room.layout.filter((p) => p.kind === 'computer')];

  const cells: ReactElement[] = [];
  if (editing) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < room.cols; col++) {
        const key = `${col}-${row}`;
        cells.push(
          <rect
            key={key}
            data-cell={key}
            x={col * CELL_W}
            y={row * CELL_H}
            width={CELL_W}
            height={CELL_H}
            fill={blinking.has(key) ? '#E24B4A' : 'transparent'}
            fillOpacity={blinking.has(key) ? 0.45 : 1}
            stroke={palette.text}
            strokeOpacity={0.25}
            strokeWidth={0.5}
            style={{ pointerEvents: cellsActive ? 'all' : 'none' }}
            onClick={cellsActive ? () => onCell(col, row) : undefined}
          />,
        );
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img"
      aria-label={room.name}
      style={{ aspectRatio: `${width} / ${HEIGHT}`, width: `${(room.cols / VISIBLE_COLS[room.orientation]) * 100}%`, flexShrink: 0, display: 'block' }}
    >
      <rect width={width} height={HEIGHT} fill={palette.wall} />
      <rect y={wallH} width={width} height={HEIGHT - wallH} fill={palette.floor} />
      <rect y={wallH - 4} width={width} height={5} fill={palette.skirt} opacity={0.6} />
      {ordered.map(renderPlaced)}
      {cells}
    </svg>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/content/furniture-art.tsx src/content/RoomView.tsx
git commit -m "feat(bibliotheque): dessin SVG de la pièce et des meubles"
```

---

### Task 6: Panneau de la Bibliothèque

**Files:**
- Create: `src/content/LibraryPanel.tsx`
- Test: `tests/content/library-panel.test.tsx`

**Interfaces:**
- Consumes: `LibraryRepo`, toutes les fonctions de `library-book` et `room-grid`, `RoomView`, `Tool`.
- Produces: `LibraryPanel({ library }: { library: LibraryRepo })`, `LIBRARY_CSS: string`.
- Attributs de test : `[data-wmt-library]`, `[data-room="rN"]`, `[data-action="add-room|visit|edit|home|delete-room|remove|move|extend-left|extend-right|shrink-left|shrink-right"]`, `[data-orient="landscape|portrait"]`, `[data-kind="shelf|desk|computer"]`, `[role="status"]`, `[data-scroll]` (conteneur qui défile).

- [ ] **Step 1: Écrire le test (échoue)**

`tests/content/library-panel.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStore, type KeyValueStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { LibraryPanel } from '../../src/content/LibraryPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let store: KeyValueStore;
let repo: LibraryRepo;

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const q = (selector: string) => container.querySelector<SVGElement | HTMLElement>(selector);
async function click(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}

beforeEach(async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  store = createMemoryStore();
  repo = createLibraryRepo(store);
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('LibraryPanel', () => {
  it('montre la première pièce vide', () => {
    expect(q('[data-room="r1"]')?.getAttribute('aria-selected')).toBe('true');
    expect(q('svg[role="img"]')).not.toBeNull();
    expect(q('[data-furniture]')).toBeNull();
  });

  it('crée une pièce et la rend active', async () => {
    await click('[data-action="add-room"]');
    expect(q('[data-room="r2"]')?.getAttribute('aria-selected')).toBe('true');
    expect(q('[data-room="r1"]')?.getAttribute('aria-selected')).toBe('false');
  });

  it('pose une étagère au sol puis la retire', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-10"]');
    expect(q('[data-furniture="shelf"]')).not.toBeNull();
    await click('[data-furniture="shelf"]');
    await click('[data-action="remove"]');
    expect(q('[data-furniture="shelf"]')).toBeNull();
  });

  it('refuse un meuble posé sur le mur et le dit', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-5"]');
    expect(q('[data-furniture]')).toBeNull();
    expect(q('[role="status"]')?.textContent).toContain('sol');
  });

  it("pose un ordinateur sur un bureau, une seule fois", async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-11"]');
    await click('[data-kind="computer"]');
    await click('[data-furniture="desk"]');
    expect(q('[data-furniture="computer"]')).not.toBeNull();
    await click('[data-kind="computer"]');
    await click('[data-furniture="desk"]');
    expect(container.querySelectorAll('[data-furniture="computer"]')).toHaveLength(1);
    expect(q('[role="status"]')?.textContent).toContain('déjà');
  });

  it("garde le même aménagement dans les deux orientations, avec une fenêtre différente", async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-11"]');
    const width = () => (q('svg[role="img"]') as unknown as SVGElement).style.width;
    expect(width()).toBe('100%');
    await click('[data-orient="portrait"]');
    expect(q('[data-furniture="desk"]')).not.toBeNull();
    expect(width().startsWith('171.4')).toBe(true);
    await click('[data-orient="landscape"]');
    expect(q('[data-furniture="desk"]')).not.toBeNull();
    expect(width()).toBe('100%');
  });

  it('agrandit la pièce à droite, puis la réduit', async () => {
    await click('[data-action="edit"]');
    expect(q('[data-cell="30-10"]')).toBeNull();
    await click('[data-action="extend-right"]');
    expect(q('[data-cell="30-10"]')).not.toBeNull();
    await click('[data-action="shrink-right"]');
    expect(q('[data-cell="30-10"]')).toBeNull();
  });

  it('agrandit la pièce à gauche en décalant les meubles', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-11"]');
    await click('[data-action="extend-left"]');
    expect(repo.current()?.rooms[0]?.layout[0]).toMatchObject({ kind: 'desk', col: 14 });
  });

  it('refuse de réduire sous 24 colonnes ou une zone occupée, et le dit', async () => {
    await click('[data-action="edit"]');
    await click('[data-action="shrink-right"]');
    expect(q('[role="status"]')?.textContent).toContain('24');
    await click('[data-action="extend-right"]');
    await click('[data-kind="shelf"]');
    await click('[data-cell="30-10"]');
    await click('[data-action="shrink-right"]');
    expect(q('[role="status"]')?.textContent).toContain('meubles');
    expect(repo.current()?.rooms[0]?.cols).toBe(36);
  });

  it("définit puis retire la pièce d'accueil", async () => {
    await click('[data-action="home"]');
    expect(repo.current()?.homeRoomId).toBe('r1');
    expect(q('[data-action="home"]')?.getAttribute('aria-pressed')).toBe('true');
    await click('[data-action="home"]');
    expect(repo.current()?.homeRoomId).toBeNull();
  });

  it('mémorise les pièces et les relit au remontage', async () => {
    await click('[data-action="add-room"]');
    const again = createLibraryRepo(store);
    await act(async () => { root.render(<LibraryPanel library={again} />); });
    await settle();
    expect(q('[data-room="r2"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/library-panel.test.tsx`
Expected: FAIL (module `LibraryPanel` introuvable).

- [ ] **Step 3: Implémenter le panneau**

`src/content/LibraryPanel.tsx` :

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  activeRoom,
  addRoom,
  deleteRoom,
  extendRoom,
  nextFurnitureId,
  renameRoom,
  setActive,
  setHome,
  setOrientation,
  shrinkRoom,
  updateLayout,
} from '../core/library/library-book';
import { FURNITURE_KINDS, labelOf, sizeOf } from '../core/library/furniture-catalog';
import type { FurnitureKind, LibraryState, Orientation, StandingKind } from '../core/library/library-types';
import type { LibraryRepo } from '../core/library/library-repo';
import {
  MAX_COLS,
  MIN_COLS,
  SECTION,
  VISIBLE_COLS,
  canPlace,
  canPlaceComputer,
  moveComputer,
  moveStanding,
  placeComputer,
  placeStanding,
  removeFurniture,
  sectionIsEmpty,
  type Cell,
} from '../core/library/room-grid';
import { RoomView, type Tool } from './RoomView';

export const LIBRARY_CSS = `
.wmt-lib{display:flex;flex-direction:column;gap:10px;padding:12px;margin:12px 0;border:1px solid var(--color-border,rgba(148,163,184,.35));border-radius:12px;background:var(--color-surface,#0d1117);color:var(--color-foreground,#e6edf3);font:14px/20px system-ui,sans-serif}
.wmt-lib-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.wmt-lib-btn{min-width:40px;min-height:40px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 12px;border-radius:999px;border:1px solid var(--color-border,rgba(148,163,184,.35));background:transparent;color:inherit;font:inherit;cursor:pointer}
.wmt-lib-btn[aria-pressed="true"],.wmt-lib-btn[aria-selected="true"]{border-color:var(--color-accent,#34d399);color:var(--color-accent,#34d399)}
.wmt-lib-name{min-height:40px;box-sizing:border-box;padding:0 10px;border-radius:8px;border:1px solid var(--color-border,rgba(148,163,184,.35));background:transparent;color:inherit;font:inherit}
.wmt-lib-scroll{display:flex;overflow-x:auto;width:100%;margin:0 auto;border-radius:12px;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity}
.wmt-lib-msg{min-height:20px;font-size:13px;opacity:.85}
.wmt-lib-sep{flex:1}
`;

function Icon({ paths }: { paths: readonly string[] }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const ICONS = {
  plus: ['M5 12h14', 'M12 5v14'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  pencil: ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z', 'm15 5 4 4'],
  star: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
  trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2', 'M10 11v6', 'M14 11v6'],
  landscape: ['M3 7h18a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z'],
  portrait: ['M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z'],
  move: ['M5 9l-3 3 3 3', 'M9 5l3-3 3 3', 'M15 19l-3 3-3-3', 'M19 9l3 3-3 3', 'M2 12h20', 'M12 2v20'],
  shelf: ['M5 3v18', 'M19 3v18', 'M5 8h14', 'M5 14h14'],
  desk: ['M3 8h18', 'M5 8v12', 'M19 8v12'],
  computer: ['M3 4h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M8 20h8', 'M12 16v4'],
  extendLeft: ['M4 4v16', 'M9 12h10', 'M14 7v10'],
  extendRight: ['M20 4v16', 'M5 12h10', 'M10 7v10'],
  shrinkLeft: ['M4 4v16', 'M9 12h10'],
  shrinkRight: ['M20 4v16', 'M5 12h10'],
} as const;

const KIND_ICON: Record<FurnitureKind, readonly string[]> = { shelf: ICONS.shelf, desk: ICONS.desk, computer: ICONS.computer };

function Btn({ label, pressed, onClick, data, children }: { label: string; pressed?: boolean; onClick: () => void; data?: Record<string, string>; children: ReactNode }) {
  const attrs = Object.fromEntries(Object.entries(data ?? {}).map(([key, value]) => [`data-${key}`, value]));
  return (
    <button type="button" className="wmt-lib-btn" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick} {...attrs}>
      {children}
    </button>
  );
}

const REFUSALS = {
  bounds: 'Ça ne rentre pas dans la pièce.',
  floor: 'Un meuble se pose au sol : touchez une case du sol.',
  taken: 'Cet emplacement est déjà occupé.',
} as const;

export function LibraryPanel({ library }: { library: LibraryRepo }) {
  const [lib, setLib] = useState<LibraryState | null>(library.current());
  const [mode, setMode] = useState<'visit' | 'edit'>('visit');
  const [tool, setTool] = useState<Tool>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [blink, setBlink] = useState<Cell[]>([]);
  const [message, setMessage] = useState('');
  const blinkTimer = useRef<number | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    const off = library.subscribe(() => {
      const current = library.current();
      if (alive && current) setLib(current);
    });
    void library.load().then((state) => {
      if (alive) setLib(state);
    });
    return () => {
      alive = false;
      off();
      window.clearTimeout(blinkTimer.current);
    };
  }, [library]);

  if (!lib) return <div className="wmt-lib" data-wmt-library />;

  const room = activeRoom(lib);
  const layout = room.layout;
  const editing = mode === 'edit';
  const portrait = room.orientation === 'portrait';
  const editLayout = (change: Parameters<typeof updateLayout>[2]) => library.update((state) => updateLayout(state, room.id, change));

  const reset = (): void => {
    setTool(null);
    setSelectedId(null);
    setBlink([]);
    setMessage('');
  };
  const refuse = (text: string, cells: Cell[] = []): void => {
    setMessage(text);
    setBlink(cells);
    window.clearTimeout(blinkTimer.current);
    blinkTimer.current = window.setTimeout(() => setBlink([]), 700);
  };

  const movingItem = tool?.type === 'move' ? layout.find((p) => p.id === tool.id) : undefined;
  const targetsDesk = (tool?.type === 'new' && tool.kind === 'computer') || movingItem?.kind === 'computer';
  const cellsActive = tool !== null && !targetsDesk;

  async function onCell(col: number, row: number): Promise<void> {
    if (!tool) return;
    const kind: StandingKind | null = tool.type === 'new' ? (tool.kind === 'computer' ? null : tool.kind) : movingItem && movingItem.kind !== 'computer' ? movingItem.kind : null;
    if (!kind) return;
    // La case touchée est la case en bas à gauche du meuble.
    const top = row - sizeOf(kind).h + 1;
    const check = canPlace(layout, room.cols, kind, col, top, tool.type === 'move' ? tool.id : undefined);
    if (!check.ok) return refuse(REFUSALS[check.reason], check.cells);
    await editLayout((l, cols) => (tool.type === 'new' ? placeStanding(l, cols, kind, col, top, nextFurnitureId(l)) : moveStanding(l, cols, tool.id, col, top)));
    reset();
  }

  async function onPick(id: string): Promise<void> {
    const item = layout.find((p) => p.id === id);
    if (!item) return;
    if (tool?.type === 'new' && tool.kind === 'computer') {
      if (item.kind !== 'desk') return refuse('Un ordinateur se pose sur un bureau.');
      if (!canPlaceComputer(layout, id)) return refuse('Ce bureau a déjà un ordinateur.');
      await editLayout((l) => placeComputer(l, id, nextFurnitureId(l)));
      return reset();
    }
    if (tool?.type === 'move' && movingItem?.kind === 'computer') {
      if (item.kind !== 'desk') return refuse('Un ordinateur se pose sur un bureau.');
      if (!canPlaceComputer(layout, id, movingItem.id)) return refuse('Ce bureau a déjà un ordinateur.');
      await editLayout((l) => moveComputer(l, movingItem.id, id));
      return reset();
    }
    setTool(null);
    setSelectedId(id === selectedId ? null : id);
    setMessage('');
  }

  const startNew = (kind: FurnitureKind): void => {
    setSelectedId(null);
    setBlink([]);
    setTool({ type: 'new', kind });
    setMessage(kind === 'computer' ? 'Touchez un bureau pour y poser l’ordinateur.' : `Touchez une case du sol pour poser : ${labelOf(kind).toLowerCase()}.`);
  };
  const startMove = (): void => {
    if (!selectedId) return;
    const item = layout.find((p) => p.id === selectedId);
    setTool({ type: 'move', id: selectedId });
    setMessage(item?.kind === 'computer' ? 'Touchez le bureau où le poser.' : 'Touchez la case du sol où le poser.');
  };
  const removeSelected = async (): Promise<void> => {
    if (!selectedId) return;
    await editLayout((l) => removeFurniture(l, selectedId));
    reset();
  };

  // Agrandir à gauche décale les meubles : le défilement suit pour garder la même vue.
  async function extend(side: 'left' | 'right'): Promise<void> {
    if (room.cols + SECTION > MAX_COLS) return refuse('La pièce ne peut pas être plus large.');
    setMessage('');
    await library.update((state) => extendRoom(state, room.id, side));
    const el = scrollRef.current;
    if (side === 'left' && el) el.scrollLeft += (el.clientWidth * SECTION) / VISIBLE_COLS[room.orientation];
  }
  async function shrink(side: 'left' | 'right'): Promise<void> {
    if (room.cols - SECTION < MIN_COLS) return refuse(`La pièce ne peut pas être plus étroite que ${MIN_COLS} colonnes.`);
    if (!sectionIsEmpty(layout, room.cols, side)) return refuse('Retirez d’abord les meubles de cette zone.');
    setMessage('');
    const el = scrollRef.current;
    await library.update((state) => shrinkRoom(state, room.id, side));
    if (side === 'left' && el) el.scrollLeft = Math.max(0, el.scrollLeft - (el.clientWidth * SECTION) / VISIBLE_COLS[room.orientation]);
  }

  const setMode2 = (next: 'visit' | 'edit'): void => {
    reset();
    setMode(next);
  };
  const chooseRoom = (id: string): void => {
    reset();
    void library.update((state) => setActive(state, id));
  };
  const chooseOrientation = (orientation: Orientation): void => {
    reset();
    void library.update((state) => setOrientation(state, room.id, orientation));
  };
  const onDeleteRoom = (): void => {
    const question = lib.rooms.length > 1 ? `Supprimer « ${room.name} » ?` : 'Vider cette pièce ?';
    if (!window.confirm(question)) return;
    reset();
    void library.update((state) => deleteRoom(state, room.id));
  };

  return (
    <div className="wmt-lib" data-wmt-library>
      <div className="wmt-lib-row" role="tablist" aria-label="Pièces">
        {lib.rooms.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            className="wmt-lib-btn"
            aria-selected={r.id === lib.activeRoomId}
            data-room={r.id}
            onClick={() => chooseRoom(r.id)}
          >
            {r.id === lib.homeRoomId && <Icon paths={ICONS.star} />}
            {r.name}
          </button>
        ))}
        <Btn label="Ajouter une pièce" data={{ action: 'add-room' }} onClick={() => { reset(); void library.update(addRoom); }}>
          <Icon paths={ICONS.plus} />
        </Btn>
      </div>

      <div className="wmt-lib-row">
        <Btn label="Visiter" pressed={!editing} data={{ action: 'visit' }} onClick={() => setMode2('visit')}>
          <Icon paths={ICONS.eye} />
        </Btn>
        <Btn label="Aménager" pressed={editing} data={{ action: 'edit' }} onClick={() => setMode2('edit')}>
          <Icon paths={ICONS.pencil} />
        </Btn>
        <Btn label="Pièce horizontale" pressed={room.orientation === 'landscape'} data={{ orient: 'landscape' }} onClick={() => chooseOrientation('landscape')}>
          <Icon paths={ICONS.landscape} />
        </Btn>
        <Btn label="Pièce verticale" pressed={portrait} data={{ orient: 'portrait' }} onClick={() => chooseOrientation('portrait')}>
          <Icon paths={ICONS.portrait} />
        </Btn>
        <Btn
          label="Pièce d’accueil : s’ouvre au lancement"
          pressed={lib.homeRoomId === room.id}
          data={{ action: 'home' }}
          onClick={() => void library.update((state) => setHome(state, state.homeRoomId === room.id ? null : room.id))}
        >
          <Icon paths={ICONS.star} />
        </Btn>
        <span className="wmt-lib-sep" />
        {editing && (
          <input
            key={room.id}
            className="wmt-lib-name"
            aria-label="Nom de la pièce"
            defaultValue={room.name}
            maxLength={30}
            onBlur={(event) => void library.update((state) => renameRoom(state, room.id, event.currentTarget.value))}
          />
        )}
        {editing && (
          <Btn label={lib.rooms.length > 1 ? 'Supprimer la pièce' : 'Vider la pièce'} data={{ action: 'delete-room' }} onClick={onDeleteRoom}>
            <Icon paths={ICONS.trash} />
          </Btn>
        )}
      </div>

      {editing && (
        <div className="wmt-lib-row">
          {FURNITURE_KINDS.map((kind) => (
            <Btn
              key={kind}
              label={`Poser : ${labelOf(kind)}`}
              pressed={tool?.type === 'new' && tool.kind === kind}
              data={{ kind }}
              onClick={() => startNew(kind)}
            >
              <Icon paths={KIND_ICON[kind]} />
            </Btn>
          ))}
          {selectedId && (
            <>
              <Btn label="Déplacer" pressed={tool?.type === 'move'} data={{ action: 'move' }} onClick={startMove}>
                <Icon paths={ICONS.move} />
              </Btn>
              <Btn label="Retirer" data={{ action: 'remove' }} onClick={() => void removeSelected()}>
                <Icon paths={ICONS.trash} />
              </Btn>
            </>
          )}
          <span className="wmt-lib-sep" />
          <Btn label="Agrandir la pièce à gauche" data={{ action: 'extend-left' }} onClick={() => void extend('left')}>
            <Icon paths={ICONS.extendLeft} />
          </Btn>
          <Btn label="Réduire la pièce à gauche" data={{ action: 'shrink-left' }} onClick={() => void shrink('left')}>
            <Icon paths={ICONS.shrinkLeft} />
          </Btn>
          <Btn label="Réduire la pièce à droite" data={{ action: 'shrink-right' }} onClick={() => void shrink('right')}>
            <Icon paths={ICONS.shrinkRight} />
          </Btn>
          <Btn label="Agrandir la pièce à droite" data={{ action: 'extend-right' }} onClick={() => void extend('right')}>
            <Icon paths={ICONS.extendRight} />
          </Btn>
        </div>
      )}

      <div className="wmt-lib-msg" role="status">
        {message}
      </div>

      <div className="wmt-lib-scroll" data-scroll ref={scrollRef} style={{ maxWidth: portrait ? 480 : 960 }}>
        <RoomView
          room={room}
          editing={editing}
          cellsActive={cellsActive}
          selectedId={selectedId}
          blink={blink}
          onCell={(col, row) => void onCell(col, row)}
          onPick={(id) => void onPick(id)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `npx vitest run tests/content/library-panel.test.tsx`
Expected: PASS. Si un test d'interaction échoue parce que `dispatchEvent` sur un élément SVG ne déclenche pas le gestionnaire React, vérifier que l'événement a `bubbles: true` (déjà le cas) et que le conteneur est bien rattaché à `document.body`.

- [ ] **Step 5: Typecheck et commit**

```bash
npm run typecheck
git add src/content/LibraryPanel.tsx tests/content/library-panel.test.tsx
git commit -m "feat(bibliotheque): panneau des pièces (modes, orientation, agrandissement, pose et retrait de meubles)"
```

---

### Task 7: Branchement dans la Collection et pièce d'accueil

**Files:**
- Create: `src/content/library-launch.ts`
- Modify: `src/content/collection-ui.tsx`
- Modify: `src/app/overlay.ts`
- Test: `tests/content/library-launch.test.ts`

**Interfaces:**
- Consumes: `LibraryRepo`, `setActive`, `LibraryPanel`, `LIBRARY_CSS`.
- Produces: `createLaunchGate(): { take(state: LibraryState | null): string | null }` ; `CollectionUiDeps.library: LibraryRepo`.

- [ ] **Step 1: Écrire le test du lancement (échoue)**

`tests/content/library-launch.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createLaunchGate } from '../../src/content/library-launch';
import { createInitialState, setHome } from '../../src/core/library/library-book';

describe('createLaunchGate', () => {
  it("n'a rien à donner tant que l'état n'est pas chargé, et attend", () => {
    const gate = createLaunchGate();
    expect(gate.take(null)).toBeNull();
    expect(gate.take(setHome(createInitialState(), 'r1'))).toBe('r1');
  });

  it("ne donne la pièce d'accueil qu'une seule fois", () => {
    const gate = createLaunchGate();
    const state = setHome(createInitialState(), 'r1');
    expect(gate.take(state)).toBe('r1');
    expect(gate.take(state)).toBeNull();
  });

  it("sans pièce d'accueil, ne donne rien et ne redemande pas", () => {
    const gate = createLaunchGate();
    expect(gate.take(createInitialState())).toBeNull();
    expect(gate.take(setHome(createInitialState(), 'r1'))).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/library-launch.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémenter la porte de lancement**

`src/content/library-launch.ts` :

```ts
import type { LibraryState } from '../core/library/library-types';

// La pièce d'accueil s'applique à la première ouverture de la Collection après le démarrage, une seule fois :
// ensuite le joueur navigue librement. Tant que l'état n'est pas chargé, on attend sans consommer le passage.
export function createLaunchGate() {
  let done = false;
  return {
    take(state: LibraryState | null): string | null {
      if (done || state === null) return null;
      done = true;
      return state.homeRoomId;
    },
  };
}
```

- [ ] **Step 4: Lancer, vérifier le succès**

Run: `npx vitest run tests/content/library-launch.test.ts`
Expected: PASS.

- [ ] **Step 5: Modifier `collection-ui.tsx`**

1. Imports (avec les autres) :

```tsx
import type { LibraryRepo } from '../core/library/library-repo';
import { setActive } from '../core/library/library-book';
import { LIBRARY_CSS, LibraryPanel } from './LibraryPanel';
import { createLaunchGate } from './library-launch';
```

2. Dans `CollectionUiDeps`, après `geo: GeoRepo;` :

```tsx
  // Pièces de la vue Bibliothèque.
  library: LibraryRepo;
```

3. Dans la signature de `createCollectionUi`, ajouter `library` après `geo`.

4. Juste après `let scanStarted = false;` :

```tsx
  // Pièce d'accueil : appliquée une fois, à la première ouverture de la Collection après le démarrage.
  const launch = createLaunchGate();
```

5. Dans `mountPanel`, remplacer la ligne du style par :

```tsx
    style.textContent = leafletCss + clusterCss + clusterDefaultCss + PANEL_CSS + LIBRARY_CSS;
```

et dans la chaîne conditionnelle, avant le panneau Homemade (le `: (` final), ajouter la branche :

```tsx
        ) : view === 'library' ? (
          <LibraryPanel library={library} />
        ) : (
```

(la branche `view === 'web'` se termine par `/>` puis `) : view === 'library' ? (` ; le `) : (` d'origine qui précède `<HomemadePanel` est conservé.)

6. Dans `sync()`, juste avant `const view = readView(window.localStorage);` (ligne ~219) :

```tsx
    const home = launch.take(library.current());
    if (home !== null) {
      void library.update((state) => setActive(state, home));
      writeView(window.localStorage, 'library');
    }
```

7. Après la définition de `sync` (fin de la fonction), lancer le chargement des pièces et rejouer `sync` quand elles sont prêtes :

```tsx
  library.load().then(() => sync()).catch((error) => console.warn(LOG, 'pièces de la Bibliothèque non chargées :', error));
```

Si `sync` est déclarée avec `function sync()` plus bas dans `createCollectionUi`, cette ligne peut se placer juste avant le `return` de la fonction (les déclarations de fonction sont remontées). Vérifier que `sync()` ne fait rien sur une page autre que la Collection (elle retourne tôt quand le bouton « Sélectionner » est introuvable) ; sinon ajouter la même garde que celle des autres appels.

- [ ] **Step 6: Modifier `overlay.ts`**

Ajouter l'import et le dépôt :

```ts
import { createLibraryRepo } from '../core/library/library-repo';
```

et dans l'appel `createCollectionUi({ ... })`, après la ligne `geo: ...` :

```ts
    library: createLibraryRepo(store),
```

- [ ] **Step 7: Typecheck, suite complète, commit**

Run: `npm run typecheck && npm test`
Expected: tout passe.

```bash
git add src/content/library-launch.ts src/content/collection-ui.tsx src/app/overlay.ts tests/content/library-launch.test.ts
git commit -m "feat(bibliotheque): montage dans la Collection et pièce d'accueil au lancement"
```

---

### Task 8: Fiche WikiHow, vérification et livraison

**Files:**
- Modify: `src/core/whats-new/entries.ts`
- Test: `tests/core/whats-new/entries.test.ts` (existant, doit continuer à passer)

- [ ] **Step 1: Lire les contraintes de la fiche**

Run: `npx vitest run tests/core/whats-new/entries.test.ts`
Lire `tests/core/whats-new/entries.test.ts` pour connaître les règles vérifiées (identifiants uniques, présence de `details`, glyphes, cibles…) et s'y conformer.

- [ ] **Step 2: Ajouter la fiche**

Dans `ENTRIES` de `src/core/whats-new/entries.ts`, avant le `];` final :

```ts
  {
    id: 'bibliotheque-v1',
    theme: 'collection',
    glyph: '📚',
    title: 'La Bibliothèque',
    summary: 'Aménager des pièces pour ranger vos cartes',
    steps: [
      {
        target: '[data-wmt-view="library"]',
        title: 'Ouvrir la Bibliothèque',
        text: 'Le bouton livre, dans les vues de la Collection, ouvre la Bibliothèque : des pièces que vous aménagez avec des meubles, vues de face.',
        gesture: 'tap',
        details: [
          { label: 'À quoi ça sert', text: 'C’est une façon de présenter votre collection comme une vraie pièce. Dans cette première version, vous créez vos pièces et placez les meubles ; les cartes y viendront ensuite.' },
          { label: 'D’où viennent les données', text: 'Les pièces sont créées par vous et gardées sur cet appareil, comme vos autres réglages : rien n’est envoyé au jeu ni partagé.' },
          { label: 'Limites', text: 'Jusqu’à 12 pièces. Elles ne sont pas synchronisées entre vos appareils.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
      {
        target: '[data-wmt-library] [data-action="edit"]',
        title: 'Aménager une pièce',
        text: 'Le crayon passe en mode Aménager : une grille apparaît et le catalogue de meubles s’affiche. L’œil revient au mode Visiter, où rien ne bouge par erreur.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Touchez un meuble du catalogue (étagère, bureau, ordinateur), puis une case du sol : la case touchée est le bas du meuble. L’ordinateur se pose en touchant un bureau.' },
          { label: 'Déplacer ou retirer', text: 'Touchez un meuble déjà posé : les boutons Déplacer et Retirer apparaissent. Retirer un bureau retire aussi l’ordinateur qui est dessus.' },
          { label: 'Si ça ne se pose pas', text: 'Les cases fautives clignotent en rouge et un message explique pourquoi : un meuble se pose au sol, sans en recouvrir un autre ni sortir de la pièce.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
      {
        target: '[data-wmt-library] [data-orient="portrait"]',
        title: 'Horizontal ou vertical',
        text: 'Chaque pièce s’affiche en horizontal ou en vertical, selon votre choix : elle ne tourne pas quand vous tournez l’appareil.',
        gesture: 'tap',
        details: [
          { label: 'Ce que ça change', text: 'La pièce reste la même, avec les mêmes meubles. Seule la fenêtre change : large en horizontal, plus étroite et plus proche en vertical. Ce qui dépasse se découvre en faisant défiler la pièce vers la droite ou la gauche.' },
          { label: 'À savoir', text: 'Passer de l’un à l’autre ne perd rien et ne déplace rien.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
      {
        target: '[data-wmt-library] [data-action="extend-right"]',
        title: 'Agrandir la pièce',
        text: 'En mode Aménager, les boutons aux extrémités de la barre ajoutent une zone vide à gauche ou à droite de la pièce, que vous remplissez ensuite de meubles. Les boutons moins retirent la zone du bord.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Chaque zone ajoute 12 colonnes. Une pièce fait de 24 à 96 colonnes. Ajouter à gauche décale vos meubles pour qu’ils restent à leur place dans la pièce.' },
          { label: 'Limites', text: 'On ne retire une zone que si elle est entièrement vide : retirez d’abord ses meubles, ou déplacez-les.' },
        ],
        scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library] [data-action="edit"]'] },
      },
      {
        target: '[data-wmt-library] [data-action="home"]',
        title: 'Choisir la pièce d’accueil',
        text: 'L’étoile fait de la pièce affichée votre pièce d’accueil : c’est elle qui s’ouvre dès l’ouverture de la Collection, après le lancement de l’application.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Touchez l’étoile pour la définir, touchez-la encore pour la retirer. Une seule pièce à la fois peut être l’accueil.' },
          { label: 'À savoir', text: 'Le réglage ne joue qu’à la première ouverture après le démarrage : vous naviguez ensuite librement.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
    ],
  },
```

- [ ] **Step 3: Lancer la suite complète**

Run: `npm run typecheck && npm test`
Expected: tout passe. Corriger la fiche si `entries.test.ts` signale une règle non respectée (cibles, longueurs, glyphes).

- [ ] **Step 4: Vérification des secrets et build**

```bash
npm run verifier-secrets
npm run build
```
Expected: les deux réussissent.

- [ ] **Step 5: Commit, push, PR et fusion**

```bash
git add src/core/whats-new/entries.ts
git commit -m "docs(wikihow): fiche « La Bibliothèque »"
git push -u origin feat/bibliotheque-socle
gh pr create --title "feat: vue Bibliothèque (morceau 1, socle)" --body "Implémente le morceau 1 de la spec docs/superpowers/specs/2026-10-08-bibliotheque-design.md : vue Bibliothèque, pièces multiples, orientation figée par pièce, mode Visiter/Aménager, étagère/bureau/ordinateur, style Scandinave, pièce d'accueil au lancement, fiche WikiHow.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Puis, selon les consignes durables du projet : lier la PR (`mcp__ccd_pr__get_status` puis `bind_pr` si besoin), lire la CI, fusionner la PR sans demander, puis lancer `npm run preprod`. Ne jamais lancer `npm run promouvoir`.

- [ ] **Step 6: Vérification manuelle (à noter pour l'utilisateur)**

Recharger l'extension dans Chrome, ouvrir la Collection, choisir le bouton livre : créer une pièce, passer en Aménager, poser une étagère, un bureau, un ordinateur, déplacer, retirer ; basculer horizontal / vertical ; définir la pièce d'accueil, recharger la page. Même parcours dans l'appli mobile (APK sur demande).

---

## Self-review

- **Spec (morceau 1)** : vue et bouton (Task 4) ; pièces multiples, nom, suppression, vidage de la dernière, limite 12 (Tasks 2, 6) ; modes Visiter / Aménager (Task 6) ; catalogue étagère / bureau / ordinateur (Tasks 1, 5, 6) ; grille et règles de pose (Task 1) ; emplacements d'étagère définis et affichés en pointillés (Tasks 1, 5) ; orientation figée, un seul aménagement, fenêtre visible 24 / 14 colonnes, pièce extensible par zones de 12 colonnes avec défilement (Tasks 1, 2, 5, 6) ; style Scandinave (Task 1) ; pièce d'accueil, une seule fois (Tasks 2, 6, 7) ; mémorisation et lecture sûre (Tasks 2, 3) ; fiche WikiHow (Task 8). La retenue « retrait d'un bureau retire l'ordinateur » est couverte (Task 1). La confirmation « si des cartes y sont posées » dépend du morceau 2 : non applicable ici.
- **Écart connu avec la spec** : l'ordinateur n'a pas de case propre (il suit son bureau) ; la spec le prévoit sur « la case d'emplacement prévue ». Le comportement vu par le joueur est identique.
- **Cohérence des noms** : `placeStanding`, `moveStanding`, `placeComputer`, `moveComputer`, `removeFurniture`, `canPlace`, `canPlaceComputer`, `shiftLayout`, `sectionIsEmpty`, `extendRoom`, `shrinkRoom`, `nextFurnitureId`, `updateLayout`, `setHome`, `setActive`, `setOrientation`, `createLaunchGate` sont les mêmes dans les tâches qui les définissent et celles qui les utilisent.
