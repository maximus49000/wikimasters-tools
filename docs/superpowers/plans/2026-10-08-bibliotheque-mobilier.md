# Bibliothèque, morceau 3 : mobilier et pièce agrandie — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrandir la pièce (18 lignes : 12 de mur, 6 de sol), ajouter 10 meubles au sol (dont un tapis posé sous les autres) et 2 petits objets à poser sur un bureau ou une étagère, avec leurs points d'intérêt pour les futurs animaux.

**Architecture:** La logique de pose reste dans des fonctions pures (`room-grid.ts`, `library-book.ts`), testées sans DOM. Le catalogue (`furniture-catalog.ts`) devient la source unique des tailles, couches (`floor` / `rug`), libellés, catégories et points d'intérêt. L'état passe en `version: 2` avec une migration à la lecture (+3 lignes). `RoomView` dessine (nouveau fichier `furniture-art-home.tsx`), `LibraryPanel` orchestre (catégories + pose sur un porteur).

**Tech Stack:** TypeScript, React 18, zod, Vitest (jsdom pour les composants), SVG/CSS.

**Spec:** `docs/superpowers/specs/2026-10-08-bibliotheque-mobilier-design.md` (et `2026-10-08-bibliotheque-design.md` pour la vision d'ensemble).

## Écarts assumés avec la spec

- Les petits objets n'ont pas de taille « en cases » : ils occupent un **emplacement de surface** (bureau : 4, étagère : 3) dessiné dans une boîte de 44 px de haut au-dessus du porteur. Les tailles 2×2 et 1×2 de la spec sont donc sans objet.
- Le bouton d'un petit objet n'est pas grisé quand aucun porteur n'a de place : l'appuyer affiche le message « Il faut d'abord un bureau ou une étagère avec de la place. » (le composant `Btn` n'a pas d'état désactivé).
- L'ordinateur couvre les emplacements **1 et 2** (les deux du milieu) de la surface de son bureau ; il n'occupe pas d'emplacement « à lui ».

## Global Constraints

- Extension en lecture seule : aucune requête réseau ajoutée.
- Tout est local (`wmt:library`), même code Chrome et mobile : tout se manipule au doigt, sans survol ni clic droit.
- Dessin vectoriel SVG + CSS, couleurs lues dans la palette du style (Scandinave seul pour l'instant).
- Glyphes plutôt que du texte dans les contrôles ; cibles tactiles d'au moins 40 px (classe `wmt-lib-btn`).
- `ROWS = 18`, `WALL_ROWS = 12`, `HEIGHT = 510`, cases inchangées (`CELL_W = 30`, `CELL_H = 28,33`), fenêtre visible en vertical : 16 colonnes (24 en horizontal).
- État `version: 2` ; un état v1 est lu en décalant de **+3** la ligne (`row`) de chaque objet qui en a une.
- Un meuble au sol a toujours sa ligne du bas dans le sol ; le tapis est entièrement sur le sol ; le tapis ne bloque aucun meuble et aucun meuble ne bloque un tapis ; deux meubles au sol ou deux tapis ne se chevauchent pas.
- Dans la même PR : fiche WikiHow `bibliotheque-v5` dans `src/core/whats-new/entries.ts`.
- Après fusion : `npm run build`, puis `npm run preprod` sans demander ; jamais `npm run promouvoir` sans ordre explicite.
- Chaque message de commit se termine par la ligne d'attribution donnée par la session.

---

## Préparation (à faire une fois, avant la tâche 1)

Travailler dans un worktree hors dépôt (une autre session peut écrire dans le dossier principal) :

```powershell
git fetch origin
git worktree add ..\Wikimasters-bibliotheque -b feat/bibliotheque-mobilier origin/main
cd ..\Wikimasters-bibliotheque
New-Item -ItemType Junction -Path node_modules -Target "..\Wikimasters tools\node_modules"
git checkout docs/bibliotheque-spec -- docs/superpowers/specs/2026-10-08-bibliotheque-mobilier-design.md docs/superpowers/plans/2026-10-08-bibliotheque-mobilier.md
git add docs && git commit -m "docs(bibliotheque): spec et plan du morceau 3 (mobilier)"
```

Les tests se lancent avec `npx vitest run --maxWorkers=4` (le test `library-drag` est instable en parallélisme total).

## File Structure

- Modifier `src/core/library/library-types.ts` : `version: 2`, `STANDING_KINDS`, `SMALL_ITEMS`, types `StandingKind`, `SmallItem`, `SmallKind`, `FurnitureKind`, variante `small` de `Placed`.
- Modifier `src/core/library/furniture-catalog.ts` : empreintes (taille, couche, points d'intérêt), libellés, catégories, aides `layerOf`, `poisOf`, `isStandingKind`, `isSmallKind`, `SMALL_ITEM_OF`.
- Modifier `src/core/library/room-grid.ts` : constantes 18/12/510/16, couches dans `canPlace`, surfaces (`SURFACE_SLOTS`, `firstFreeSurfaceSlot`, `placeSmall`, `moveSmall`, `surfaceSlotRect`, `hasFreeHost`), `removeFurniture`, `canPlaceComputer`.
- Modifier `src/core/library/library-book.ts` : migration v1 → v2, schéma zod, nettoyage des petits objets.
- Modifier `src/core/library/styles.ts` : couleurs de tissu, plantes, tapis, lampe.
- Modifier `src/content/furniture-drag.ts` : `hostAtCell`, cible de dépôt d'un petit objet.
- Créer `src/content/furniture-art-home.tsx` : dessins des 10 meubles et des 2 petits objets.
- Créer `src/content/furniture-icons.ts` : glyphes de chaque type et de chaque catégorie.
- Modifier `src/content/RoomView.tsx` : ordre de dessin (tapis, meubles par profondeur, petits objets, ordinateurs).
- Modifier `src/content/LibraryPanel.tsx` : catégories, pose des petits objets, retrait avec confirmation.
- Modifier `src/core/whats-new/entries.ts` : fiche `bibliotheque-v5`.
- Tests : `tests/core/library/library-migration.test.ts`, `furniture-catalog.test.ts`, `room-grid-layers.test.ts`, `room-grid-small.test.ts` ; `tests/content/furniture-drag-home.test.ts`, `library-furniture-view.test.tsx`, `library-furniture.test.tsx` ; ajustements des tests existants (lignes +3).

---

### Task 1: Pièce de 18 lignes et migration v1 → v2

**Files:**
- Modify: `src/core/library/room-grid.ts:4-15`
- Modify: `src/core/library/library-types.ts` (`LibraryState.version`)
- Modify: `src/core/library/library-book.ts` (`stateSchema`, `createInitialState`, `parseLibraryState`)
- Create: `tests/core/library/library-migration.test.ts`
- Modify (tests existants) : `tests/core/library/room-grid.test.ts`, `room-grid-cards.test.ts`, `library-book.test.ts`, `library-book-cards.test.ts`, `library-repo.test.ts`, `tests/content/library-*.test.*`

**Interfaces:**
- Produces: `ROWS = 18`, `WALL_ROWS = 12`, `HEIGHT = 510`, `CELL_H = 510 / 18`, `VISIBLE_COLS = { landscape: 24, portrait: 16 }` (exports de `room-grid.ts`) ; `LibraryState.version: 2` ; `parseLibraryState(raw)` lit v1 (migré) et v2.

- [ ] **Step 1: Écrire le test de migration**

`tests/core/library/library-migration.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState, parseLibraryState } from '../../../src/core/library/library-book';

const v1 = (layout: unknown[]) => ({
  version: 1,
  activeRoomId: 'r1',
  homeRoomId: null,
  rooms: [{ id: 'r1', name: 'Salon', style: 'scandinave', orientation: 'landscape', cols: 24, layout }],
});

describe('migration v1 → v2', () => {
  it('descend de 3 lignes chaque objet qui a une ligne (mur et sol)', () => {
    const state = parseLibraryState(
      v1([
        { id: 'f1', kind: 'shelf', col: 2, row: 4 },
        { id: 'f2', kind: 'desk', col: 10, row: 8 },
        { id: 'f3', kind: 'computer', deskId: 'f2' },
        { id: 'f4', kind: 'wall', shape: 'poster', col: 15, row: 1, slug: 'Paris' },
        { id: 'f5', kind: 'stored', shape: 'cd', shelfId: 'f1', slot: 0, slug: 'Daft_Punk' },
      ]),
    );
    expect(state.version).toBe(2);
    const byId = (id: string) => state.rooms[0]!.layout.find((p) => p.id === id);
    expect(byId('f1')).toMatchObject({ row: 7, col: 2 });
    expect(byId('f2')).toMatchObject({ row: 11, col: 10 });
    expect(byId('f4')).toMatchObject({ row: 4, col: 15 });
    expect(byId('f3')).toEqual({ id: 'f3', kind: 'computer', deskId: 'f2' });
    expect(byId('f5')).toMatchObject({ shelfId: 'f1', slot: 0 });
  });

  it('lit un état v2 tel quel', () => {
    const initial = createInitialState();
    expect(parseLibraryState(initial)).toEqual(initial);
  });

  it('une pièce vide commence en v2', () => {
    expect(createInitialState().version).toBe(2);
  });

  it('un état inconnu ou abîmé donne une pièce vide', () => {
    expect(parseLibraryState({ version: 3 })).toEqual(createInitialState());
    expect(parseLibraryState(null)).toEqual(createInitialState());
    expect(parseLibraryState({ version: 1, rooms: 'x' })).toEqual(createInitialState());
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run tests/core/library/library-migration.test.ts`
Expected: FAIL (`version` vaut 1, lignes non décalées).

- [ ] **Step 3: Constantes de la pièce** — dans `src/core/library/room-grid.ts`, remplacer les lignes des constantes :

```ts
export const ROWS = 18;
// Les lignes 0 à WALL_ROWS - 1 sont le mur, les suivantes le sol.
export const WALL_ROWS = 12;
export const CELL_W = 30;
export const HEIGHT = 510;
export const CELL_H = HEIGHT / ROWS;
```

et `VISIBLE_COLS` :

```ts
export const VISIBLE_COLS: Record<Orientation, number> = { landscape: 24, portrait: 16 };
```

- [ ] **Step 4: Version et migration** — dans `library-types.ts`, `LibraryState` : `version: 2;`.

Dans `library-book.ts` : changer `version: z.literal(1)` en `version: z.literal(2)`, `createInitialState` en `version: 2`, puis ajouter avant `parseLibraryState` :

```ts
// Une pièce v1 avait 12 lignes (9 de mur, 3 de sol) ; la v2 en a 18 (12 + 6). Tout descend de 3 lignes : le sol d'origine reste contre le mur.
const V1_ROW_SHIFT = 3;
function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 1) return raw;
  const state = raw as { rooms?: unknown };
  if (!Array.isArray(state.rooms)) return raw;
  const rooms = state.rooms.map((room: unknown) => {
    const layout = typeof room === 'object' && room !== null ? (room as { layout?: unknown }).layout : undefined;
    if (!Array.isArray(layout)) return room;
    const shifted = layout.map((p: unknown) =>
      typeof p === 'object' && p !== null && typeof (p as { row?: unknown }).row === 'number' ? { ...p, row: (p as { row: number }).row + V1_ROW_SHIFT } : p,
    );
    return { ...(room as object), layout: shifted };
  });
  return { ...state, version: 2, rooms };
}
```

et dans `parseLibraryState` : `const parsed = stateSchema.safeParse(migrate(raw));`.

- [ ] **Step 5: Lancer le test de migration**

Run: `npx vitest run tests/core/library/library-migration.test.ts`
Expected: PASS.

- [ ] **Step 6: Corriger les tests existants** — chercher ce qui dépend de la géométrie : `npx vitest run --maxWorkers=4` puis `rg -n "WALL_ROWS|ROWS|HEIGHT|version: 1|\[12, 9|portrait: 14|data-cell=" tests src`. Règle générale : **ajouter 3 à chaque ligne** (`row`, `data-cell="col-row"`) des tests, exactement comme la migration ; `[12, 9, 12, 24, 96]` devient `[18, 12, 12, 24, 96]` ; `portrait: 14` devient `portrait: 16` ; `version: 1` devient `version: 2` dans les états construits à la main. Vérifier aussi les usages de `HEIGHT`/`ROWS`/`CELL_H` dans `src` (`rg -n "HEIGHT|ROWS|CELL_H" src`) : ils lisent les constantes, rien à changer. Relancer jusqu'à ce que tout passe.

Run: `npx vitest run --maxWorkers=4` puis `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(bibliotheque): pièce de 18 lignes et migration de l'état en v2"
```

---

### Task 2: Types, catalogue et couches (sol / tapis)

**Files:**
- Modify: `src/core/library/library-types.ts`
- Rewrite: `src/core/library/furniture-catalog.ts`
- Modify: `src/core/library/room-grid.ts` (`isStanding`, `takenKeys`, `canPlace`)
- Modify: `src/core/library/library-book.ts` (`placedSchema`)
- Create: `tests/core/library/furniture-catalog.test.ts`, `tests/core/library/room-grid-layers.test.ts`

**Interfaces:**
- Produces (library-types): `STANDING_KINDS` (tuple), `StandingKind`, `SMALL_ITEMS`, `SmallItem`, `SmallKind = 'small-plant' | 'small-lamp'`, `FurnitureKind = StandingKind | 'computer' | SmallKind`, variante `{ id; kind: 'small'; item: SmallItem; hostId: string; slot: number }` de `Placed`.
- Produces (catalogue): `labelOf(kind: FurnitureKind): string`, `sizeOf(kind: StandingKind): {w,h}`, `layerOf(kind: StandingKind): 'floor' | 'rug'`, `poisOf(kind: StandingKind): readonly Poi[]`, `isStandingKind(kind: FurnitureKind): kind is StandingKind`, `isSmallKind(kind: FurnitureKind): kind is SmallKind`, `SMALL_ITEM_OF: Record<SmallKind, SmallItem>`, `CATEGORIES: { id: Category; label: string; kinds: FurnitureKind[] }[]`, `FURNITURE_KINDS`, `type Category = 'storage' | 'seats' | 'pets' | 'deco'`, `type Poi = { type: PoiType; dx: number; dy: number }`.
- Produces (room-grid): `canPlace` tient compte de la couche ; `isStanding(p)` vrai pour les 12 types au sol.

- [ ] **Step 1: Écrire les tests**

`tests/core/library/furniture-catalog.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { CATEGORIES, FURNITURE_KINDS, SMALL_ITEM_OF, isSmallKind, isStandingKind, labelOf, layerOf, poisOf, sizeOf } from '../../../src/core/library/furniture-catalog';
import { STANDING_KINDS } from '../../../src/core/library/library-types';
import { MIN_COLS, ROWS, WALL_ROWS } from '../../../src/core/library/room-grid';

describe('catalogue', () => {
  it('chaque meuble tient dans la pièce', () => {
    for (const kind of STANDING_KINDS) {
      const { w, h } = sizeOf(kind);
      expect(w, kind).toBeLessThanOrEqual(MIN_COLS);
      expect(h, kind).toBeLessThanOrEqual(layerOf(kind) === 'rug' ? ROWS - WALL_ROWS : ROWS);
    }
  });

  it('les points d’intérêt sont dans l’emprise du meuble', () => {
    for (const kind of STANDING_KINDS) {
      const { w, h } = sizeOf(kind);
      for (const poi of poisOf(kind)) {
        expect(poi.dx, kind).toBeGreaterThanOrEqual(0);
        expect(poi.dx, kind).toBeLessThan(w);
        expect(poi.dy, kind).toBeGreaterThanOrEqual(0);
        expect(poi.dy, kind).toBeLessThan(h);
      }
    }
  });

  it('les meubles pour animaux et les assises déclarent leurs points', () => {
    expect(poisOf('sofa').filter((p) => p.type === 'seat')).toHaveLength(3);
    expect(poisOf('basket').map((p) => p.type)).toEqual(['curl']);
    expect(poisOf('bowl').map((p) => p.type)).toEqual(['eat']);
    expect(poisOf('kennel').map((p) => p.type).sort()).toEqual(['enter', 'sleep']);
  });

  it('seul le tapis est sur la couche tapis', () => {
    expect(STANDING_KINDS.filter((k) => layerOf(k) === 'rug')).toEqual(['rug']);
  });

  it('les catégories couvrent chaque type une seule fois', () => {
    const all = [...STANDING_KINDS, 'computer', 'small-plant', 'small-lamp'].sort();
    expect([...FURNITURE_KINDS].sort()).toEqual(all);
    expect(CATEGORIES.map((c) => c.id)).toEqual(['storage', 'seats', 'pets', 'deco']);
  });

  it('chaque type a un libellé et les aides de type répondent', () => {
    for (const kind of FURNITURE_KINDS) expect(labelOf(kind).length).toBeGreaterThan(0);
    expect(isStandingKind('sofa')).toBe(true);
    expect(isStandingKind('computer')).toBe(false);
    expect(isSmallKind('small-lamp')).toBe(true);
    expect(SMALL_ITEM_OF['small-plant']).toBe('plant');
  });
});
```

`tests/core/library/room-grid-layers.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { Layout } from '../../../src/core/library/library-types';
import { canPlace, isStanding, moveStanding, placeStanding } from '../../../src/core/library/room-grid';

describe('tapis', () => {
  it('se pose entièrement sur le sol', () => {
    const res = canPlace([], 24, 'rug', 0, 11);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('floor');
    expect(canPlace([], 24, 'rug', 0, 12).ok).toBe(true);
    expect(canPlace([], 24, 'rug', 0, 15).ok).toBe(true);
  });

  it('accepte un meuble par-dessus', () => {
    const layout = placeStanding([], 24, 'rug', 2, 15, 'f1')!;
    expect(canPlace(layout, 24, 'sofa', 2, 14).ok).toBe(true);
    expect(canPlace(layout, 24, 'coffee-table', 3, 16).ok).toBe(true);
  });

  it('accepte un tapis sous un meuble déjà posé', () => {
    const layout = placeStanding([], 24, 'sofa', 2, 14, 'f1')!;
    expect(canPlace(layout, 24, 'rug', 2, 15).ok).toBe(true);
  });

  it('refuse deux tapis qui se chevauchent', () => {
    const layout = placeStanding([], 24, 'rug', 2, 15, 'f1')!;
    const res = canPlace(layout, 24, 'rug', 5, 15);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('taken');
    expect(canPlace(layout, 24, 'rug', 8, 15).ok).toBe(true);
  });

  it('un tapis ne gêne pas le déplacement d’un meuble', () => {
    const layout: Layout = [
      { id: 'f1', kind: 'rug', col: 2, row: 15 },
      { id: 'f2', kind: 'sofa', col: 12, row: 14 },
    ];
    expect(moveStanding(layout, 24, 'f2', 3, 14)).not.toBeNull();
  });
});

describe('meubles au sol', () => {
  it('deux meubles au sol ne se chevauchent pas', () => {
    const layout = placeStanding([], 24, 'sofa', 2, 14, 'f1')!;
    const res = canPlace(layout, 24, 'armchair', 6, 14);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('taken');
  });

  it('une table basse se pose devant le canapé', () => {
    const layout = placeStanding([], 24, 'sofa', 2, 12, 'f1')!;
    expect(canPlace(layout, 24, 'coffee-table', 3, 15).ok).toBe(true);
  });

  it('refuse un meuble dont le bas est dans le mur', () => {
    const res = canPlace([], 24, 'plant', 3, 5);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('floor');
  });

  it('isStanding reconnaît les types au sol et pas les autres', () => {
    expect(isStanding({ id: 'a', kind: 'rug', col: 0, row: 15 })).toBe(true);
    expect(isStanding({ id: 'b', kind: 'computer', deskId: 'a' })).toBe(false);
    expect(isStanding({ id: 'c', kind: 'small', item: 'plant', hostId: 'a', slot: 0 })).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npx vitest run tests/core/library/furniture-catalog.test.ts tests/core/library/room-grid-layers.test.ts`
Expected: FAIL (exports manquants).

- [ ] **Step 3: Types** — dans `library-types.ts`, supprimer les lignes `export type FurnitureKind = ...` et `export type StandingKind = ...`, puis ajouter à leur place :

```ts
export const STANDING_KINDS = ['shelf', 'desk', 'chair', 'sofa', 'armchair', 'basket', 'bowl', 'kennel', 'plant', 'lamp', 'coffee-table', 'rug'] as const;
export type StandingKind = (typeof STANDING_KINDS)[number];

// Petits objets posés sur la surface d'un bureau ou d'une étagère.
export const SMALL_ITEMS = ['plant', 'lamp'] as const;
export type SmallItem = (typeof SMALL_ITEMS)[number];
export type SmallKind = 'small-plant' | 'small-lamp';

export type FurnitureKind = StandingKind | 'computer' | SmallKind;
```

et ajouter la variante à `Placed` (avant `wall`) :

```ts
  | { id: string; kind: 'small'; item: SmallItem; hostId: string; slot: number }
```

avec ce commentaire ajouté au-dessus du type : `// `small` : petit objet posé sur l'emplacement `slot` de la surface du bureau ou de l'étagère `hostId`.`

- [ ] **Step 4: Catalogue** — remplacer tout `furniture-catalog.ts` par :

```ts
import type { FurnitureKind, ShelfShape, SmallItem, SmallKind, StandingKind, VinylColor, WallShape } from './library-types';

export type Category = 'storage' | 'seats' | 'pets' | 'deco';
export type PoiType = 'seat' | 'curl' | 'eat' | 'sleep' | 'enter';
// Point d'intérêt d'un meuble pour les animaux : une case relative au coin haut-gauche du meuble.
export type Poi = { type: PoiType; dx: number; dy: number };

type Footprint = { w: number; h: number; layer: 'floor' | 'rug'; pois: readonly Poi[] };

// Tailles en cases (largeur × hauteur). L'étagère a 3 niveaux de 5 emplacements (voir `shelfSlots`).
const FOOTPRINTS: Record<StandingKind, Footprint> = {
  shelf: { w: 6, h: 8, layer: 'floor', pois: [] },
  desk: { w: 5, h: 4, layer: 'floor', pois: [] },
  chair: { w: 2, h: 3, layer: 'floor', pois: [{ type: 'seat', dx: 1, dy: 1 }] },
  sofa: {
    w: 6,
    h: 3,
    layer: 'floor',
    pois: [
      { type: 'seat', dx: 1, dy: 1 },
      { type: 'seat', dx: 2, dy: 1 },
      { type: 'seat', dx: 4, dy: 1 },
      { type: 'sleep', dx: 3, dy: 1 },
    ],
  },
  armchair: { w: 3, h: 3, layer: 'floor', pois: [{ type: 'seat', dx: 1, dy: 1 }] },
  basket: { w: 3, h: 2, layer: 'floor', pois: [{ type: 'curl', dx: 1, dy: 1 }] },
  bowl: { w: 2, h: 1, layer: 'floor', pois: [{ type: 'eat', dx: 0, dy: 0 }] },
  kennel: {
    w: 4,
    h: 3,
    layer: 'floor',
    pois: [
      { type: 'enter', dx: 2, dy: 2 },
      { type: 'sleep', dx: 2, dy: 1 },
    ],
  },
  plant: { w: 2, h: 4, layer: 'floor', pois: [] },
  lamp: { w: 1, h: 5, layer: 'floor', pois: [] },
  'coffee-table': { w: 4, h: 2, layer: 'floor', pois: [] },
  rug: { w: 6, h: 3, layer: 'rug', pois: [] },
};

const LABELS: Record<FurnitureKind, string> = {
  shelf: 'Étagère',
  desk: 'Bureau',
  computer: 'Ordinateur',
  chair: 'Chaise',
  sofa: 'Canapé',
  armchair: 'Fauteuil',
  basket: 'Panier',
  bowl: 'Gamelle',
  kennel: 'Niche',
  'coffee-table': 'Table basse',
  plant: 'Plante',
  lamp: 'Lampe',
  'small-plant': 'Petite plante',
  'small-lamp': 'Petite lampe',
  rug: 'Tapis',
};

export const CATEGORIES: { id: Category; label: string; kinds: FurnitureKind[] }[] = [
  { id: 'storage', label: 'Rangement', kinds: ['shelf', 'desk', 'computer'] },
  { id: 'seats', label: 'Assises', kinds: ['chair', 'sofa', 'armchair'] },
  { id: 'pets', label: 'Animaux', kinds: ['basket', 'bowl', 'kennel'] },
  { id: 'deco', label: 'Déco', kinds: ['coffee-table', 'plant', 'lamp', 'small-plant', 'small-lamp', 'rug'] },
];

export const FURNITURE_KINDS: FurnitureKind[] = CATEGORIES.flatMap((category) => category.kinds);

export const SMALL_ITEM_OF: Record<SmallKind, SmallItem> = { 'small-plant': 'plant', 'small-lamp': 'lamp' };

export const isStandingKind = (kind: FurnitureKind): kind is StandingKind => kind in FOOTPRINTS;
export const isSmallKind = (kind: FurnitureKind): kind is SmallKind => kind in SMALL_ITEM_OF;

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

export const labelOf = (kind: FurnitureKind): string => LABELS[kind];

export function sizeOf(kind: StandingKind): { w: number; h: number } {
  const { w, h } = FOOTPRINTS[kind];
  return { w, h };
}
export const layerOf = (kind: StandingKind): 'floor' | 'rug' => FOOTPRINTS[kind].layer;
export const poisOf = (kind: StandingKind): readonly Poi[] => FOOTPRINTS[kind].pois;
```

Vérifier ensuite `rg -n "CATALOG" src tests` : s'il reste un usage de l'ancien `CATALOG`, le remplacer par `sizeOf` / `labelOf`.

- [ ] **Step 5: Couches dans `room-grid.ts`** — importer `layerOf` avec `sizeOf, wallSizeOf` depuis le catalogue et `STANDING_KINDS` depuis les types, puis :

Remplacer `isStanding` par :

```ts
export const isStanding = (p: Placed): p is Standing => (STANDING_KINDS as readonly string[]).includes(p.kind);
```

Remplacer `takenKeys` par :

```ts
const layerOfPlaced = (p: Placed): 'floor' | 'rug' => (isStanding(p) ? layerOf(p.kind) : 'floor');

// Les cases occupées d'une couche (meubles debout et objets accrochés pour `floor`, tapis pour `rug`), sauf celles de `ignoreId`.
function takenKeys(layout: Layout, ignoreId?: string, layer: 'floor' | 'rug' = 'floor'): Set<string> {
  const taken = new Set<string>();
  for (const other of layout) {
    if (other.id === ignoreId || layerOfPlaced(other) !== layer) continue;
    const otherRect = rectOf(other);
    if (!otherRect) continue;
    for (const c of cellsOf(otherRect)) taken.add(`${c.col}-${c.row}`);
  }
  return taken;
}
```

Dans `canPlace`, après le test `row + h - 1 < WALL_ROWS` et avant `takenKeys`, ajouter le test du tapis et passer la couche :

```ts
  const layer = layerOf(kind);
  if (layer === 'rug' && row < WALL_ROWS) return { ok: false, reason: 'floor', cells: cells.filter((c) => c.row < WALL_ROWS) };
  const taken = takenKeys(layout, ignoreId, layer);
```

(`canHang` garde `takenKeys(layout, ignoreId)` : couche `floor` par défaut.)

- [ ] **Step 6: Schéma zod** — dans `library-book.ts`, importer `SMALL_ITEMS, STANDING_KINDS` depuis `./library-types` ; première variante : `kind: z.enum(STANDING_KINDS)` ; ajouter avant la variante `wall` :

```ts
  z.object({ id: z.string(), kind: z.literal('small'), item: z.enum(SMALL_ITEMS), hostId: z.string(), slot: z.number().int().min(0).max(3) }),
```

- [ ] **Step 7: Lancer**

Run: `npx vitest run --maxWorkers=4` puis `npm run typecheck`
Expected: PASS. Les erreurs de type viennent des endroits qui supposaient `StandingKind = 'shelf' | 'desk'` (`KIND_ICON` dans `LibraryPanel.tsx`, `RoomView.tsx`, `furniture-drag.ts`) : elles sont traitées aux tâches 4, 5 et 6 ; en attendant, ne corriger ici que ce qui empêche les tests du cœur de passer (`KIND_ICON: Record<FurnitureKind, …>` peut être élargi provisoirement par `as Record<FurnitureKind, readonly string[]>` jusqu'à la tâche 6).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(bibliotheque): catalogue de 10 meubles, couche tapis et points d'intérêt"
```

---

### Task 3: Petits objets sur une surface (pur)

**Files:**
- Modify: `src/core/library/room-grid.ts`
- Modify: `src/core/library/library-book.ts` (`cleanLayout`)
- Create: `tests/core/library/room-grid-small.test.ts`

**Interfaces:**
- Consumes: `Placed` variante `small`, `SmallItem` (tâche 2).
- Produces (room-grid) :
  - `SURFACE_SLOTS = { desk: 4, shelf: 3 } as const`
  - `firstFreeSurfaceSlot(layout, hostId, ignoreId?): number | null`
  - `hasFreeHost(layout): boolean`
  - `placeSmall(layout, hostId, item: SmallItem, id): Layout | null`
  - `moveSmall(layout, id, hostId): Layout | null`
  - `surfaceSlotRect(host: PxRect, slotCount: number, slot: number): PxRect`
  - `removeFurniture` retire aussi les petits objets du porteur ; `canPlaceComputer` refuse un bureau dont les emplacements 1 ou 2 portent un petit objet.

- [ ] **Step 1: Écrire les tests**

`tests/core/library/room-grid-small.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { parseLibraryState } from '../../../src/core/library/library-book';
import type { Layout } from '../../../src/core/library/library-types';
import {
  SURFACE_SLOTS,
  canPlaceComputer,
  firstFreeSurfaceSlot,
  hasFreeHost,
  moveSmall,
  placeSmall,
  removeFurniture,
  shiftLayout,
  surfaceSlotRect,
} from '../../../src/core/library/room-grid';

const base: Layout = [
  { id: 'f1', kind: 'desk', col: 2, row: 14 },
  { id: 'f2', kind: 'shelf', col: 12, row: 10 },
];

describe('surfaces', () => {
  it('un bureau a 4 emplacements et une étagère 3', () => {
    expect(SURFACE_SLOTS).toEqual({ desk: 4, shelf: 3 });
  });

  it('pose dans le premier emplacement libre', () => {
    const one = placeSmall(base, 'f1', 'plant', 'f3')!;
    expect(one.find((p) => p.id === 'f3')).toMatchObject({ kind: 'small', item: 'plant', hostId: 'f1', slot: 0 });
    const two = placeSmall(one, 'f1', 'lamp', 'f4')!;
    expect(two.find((p) => p.id === 'f4')).toMatchObject({ slot: 1 });
  });

  it('refuse quand le porteur est plein ou n’en est pas un', () => {
    let layout = base;
    for (let i = 0; i < 3; i++) layout = placeSmall(layout, 'f2', 'plant', `s${i}`)!;
    expect(firstFreeSurfaceSlot(layout, 'f2')).toBeNull();
    expect(placeSmall(layout, 'f2', 'plant', 'sx')).toBeNull();
    expect(placeSmall(base, 'inconnu', 'plant', 'sx')).toBeNull();
  });

  it('l’ordinateur couvre les emplacements du milieu du bureau', () => {
    const withPc: Layout = [...base, { id: 'f9', kind: 'computer', deskId: 'f1' }];
    const a = placeSmall(withPc, 'f1', 'plant', 'a')!;
    const b = placeSmall(a, 'f1', 'lamp', 'b')!;
    expect(b.find((p) => p.id === 'a')).toMatchObject({ slot: 0 });
    expect(b.find((p) => p.id === 'b')).toMatchObject({ slot: 3 });
    expect(placeSmall(b, 'f1', 'plant', 'c')).toBeNull();
  });

  it('refuse un ordinateur sur un bureau dont le milieu est pris', () => {
    const layout: Layout = [...base, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', slot: 1 }];
    expect(canPlaceComputer(layout, 'f1')).toBe(false);
    const edge: Layout = [...base, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', slot: 0 }];
    expect(canPlaceComputer(edge, 'f1')).toBe(true);
  });

  it('hasFreeHost dit s’il reste une place quelque part', () => {
    expect(hasFreeHost([])).toBe(false);
    expect(hasFreeHost(base)).toBe(true);
    let layout = base;
    for (let i = 0; i < 4; i++) layout = placeSmall(layout, 'f1', 'plant', `d${i}`)!;
    for (let i = 0; i < 3; i++) layout = placeSmall(layout, 'f2', 'plant', `e${i}`)!;
    expect(hasFreeHost(layout)).toBe(false);
  });
});

describe('déplacer un petit objet', () => {
  const layout: Layout = [...base, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', slot: 2 }];

  it('garde son emplacement sur le même porteur', () => {
    expect(moveSmall(layout, 's', 'f1')!.find((p) => p.id === 's')).toMatchObject({ hostId: 'f1', slot: 2 });
  });

  it('prend le premier emplacement libre d’un autre porteur', () => {
    expect(moveSmall(layout, 's', 'f2')!.find((p) => p.id === 's')).toMatchObject({ hostId: 'f2', slot: 0 });
  });

  it('refuse un porteur inconnu ou plein', () => {
    expect(moveSmall(layout, 's', 'x')).toBeNull();
    let full = layout;
    for (let i = 0; i < 3; i++) full = placeSmall(full, 'f2', 'lamp', `p${i}`)!;
    expect(moveSmall(full, 's', 'f2')).toBeNull();
  });
});

describe('retrait et décalage', () => {
  it('retirer un porteur retire ses petits objets', () => {
    const layout: Layout = [...base, { id: 's', kind: 'small', item: 'lamp', hostId: 'f2', slot: 0 }];
    expect(removeFurniture(layout, 'f2').map((p) => p.id)).toEqual(['f1']);
  });

  it('décaler la pièce ne touche pas les petits objets', () => {
    const small = { id: 's', kind: 'small', item: 'lamp', hostId: 'f2', slot: 0 } as const;
    expect(shiftLayout([...base, small], 12).find((p) => p.id === 's')).toEqual(small);
  });
});

describe('surfaceSlotRect', () => {
  it('découpe le dessus du porteur en emplacements de 44 px de haut', () => {
    expect(surfaceSlotRect({ x: 60, y: 400, w: 150, h: 113 }, 4, 1)).toEqual({ x: 97.5, y: 358, w: 37.5, h: 44 });
  });
});

describe('lecture : nettoyage des petits objets', () => {
  const state = (layout: unknown[]) => ({
    version: 2,
    activeRoomId: 'r1',
    homeRoomId: null,
    rooms: [{ id: 'r1', name: 'Salon', style: 'scandinave', orientation: 'landscape', cols: 24, layout }],
  });
  const read = (layout: unknown[]) => parseLibraryState(state(layout)).rooms[0]!.layout.map((p) => p.id);
  const host = [{ id: 'f1', kind: 'desk', col: 2, row: 14 }, { id: 'f2', kind: 'shelf', col: 12, row: 10 }];

  it('garde un petit objet valide', () => {
    expect(read([...host, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', slot: 3 }])).toContain('s');
  });

  it('ignore un petit objet sans porteur, hors emplacements ou en double', () => {
    const ids = read([
      ...host,
      { id: 'a', kind: 'small', item: 'plant', hostId: 'absent', slot: 0 },
      { id: 'b', kind: 'small', item: 'plant', hostId: 'f2', slot: 3 },
      { id: 'c', kind: 'small', item: 'lamp', hostId: 'f1', slot: 0 },
      { id: 'd', kind: 'small', item: 'lamp', hostId: 'f1', slot: 0 },
    ]);
    expect(ids).toEqual(['f1', 'f2', 'c']);
  });

  it('ignore un petit objet sur le milieu d’un bureau qui porte un ordinateur', () => {
    const ids = read([...host, { id: 'pc', kind: 'computer', deskId: 'f1' }, { id: 's', kind: 'small', item: 'plant', hostId: 'f1', slot: 1 }]);
    expect(ids).not.toContain('s');
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/library/room-grid-small.test.ts`
Expected: FAIL (exports manquants).

- [ ] **Step 3: Implémenter dans `room-grid.ts`** — ajouter (après `removeFurniture`) et modifier `canPlaceComputer`, `removeFurniture` :

```ts
type SmallPlaced = Extract<Placed, { kind: 'small' }>;

// Un bureau porte 4 petits objets, une étagère 3 (sur son dessus).
export const SURFACE_SLOTS = { desk: 4, shelf: 3 } as const;
type HostKind = keyof typeof SURFACE_SLOTS;
const isHost = (p: Placed): p is Extract<Placed, { kind: HostKind }> => p.kind === 'desk' || p.kind === 'shelf';

// L'ordinateur d'un bureau couvre les deux emplacements du milieu.
const COMPUTER_SLOTS: ReadonlySet<number> = new Set([1, 2]);
const SMALL_H = 44;

function blockedSlots(layout: Layout, hostId: string): ReadonlySet<number> {
  return layout.some((p) => p.kind === 'computer' && p.deskId === hostId) ? COMPUTER_SLOTS : new Set<number>();
}

export function firstFreeSurfaceSlot(layout: Layout, hostId: string, ignoreId?: string): number | null {
  const host = layout.find((p) => p.id === hostId);
  if (!host || !isHost(host)) return null;
  const used = new Set(layout.filter((p): p is SmallPlaced => p.kind === 'small' && p.hostId === hostId && p.id !== ignoreId).map((p) => p.slot));
  const blocked = blockedSlots(layout, hostId);
  for (let i = 0; i < SURFACE_SLOTS[host.kind]; i++) if (!used.has(i) && !blocked.has(i)) return i;
  return null;
}

// Reste-t-il une place pour un petit objet sur un bureau ou une étagère quelconque ?
export const hasFreeHost = (layout: Layout): boolean => layout.some((p) => isHost(p) && firstFreeSurfaceSlot(layout, p.id) !== null);

export function placeSmall(layout: Layout, hostId: string, item: SmallItem, id: string): Layout | null {
  const slot = firstFreeSurfaceSlot(layout, hostId);
  if (slot === null) return null;
  return [...layout, { id, kind: 'small', item, hostId, slot }];
}

// Sur le même porteur, l'objet garde son emplacement ; sur un autre, il prend le premier libre.
export function moveSmall(layout: Layout, id: string, hostId: string): Layout | null {
  const small = layout.find((p) => p.id === id);
  if (!small || small.kind !== 'small') return null;
  const slot = small.hostId === hostId ? small.slot : firstFreeSurfaceSlot(layout, hostId, id);
  if (slot === null) return null;
  return layout.map((p) => (p.id === id ? { ...small, hostId, slot } : p));
}

// La boîte d'un emplacement de surface : le dessus du porteur, divisé en `slotCount` emplacements de 44 px de haut.
export function surfaceSlotRect(host: PxRect, slotCount: number, slot: number): PxRect {
  const w = host.w / slotCount;
  return { x: host.x + slot * w, y: host.y - SMALL_H + 2, w, h: SMALL_H };
}
```

Importer `SmallItem` dans l'import de types en tête du fichier. Dans `canPlaceComputer`, après le contrôle `desk.kind !== 'desk'` :

```ts
  if (layout.some((p) => p.kind === 'small' && p.hostId === deskId && COMPUTER_SLOTS.has(p.slot))) return false;
```

`removeFurniture` devient :

```ts
export function removeFurniture(layout: Layout, id: string): Layout {
  return layout.filter(
    (p) => p.id !== id && !(p.kind === 'computer' && p.deskId === id) && !(p.kind === 'stored' && p.shelfId === id) && !(p.kind === 'small' && p.hostId === id),
  );
}
```

Mettre à jour le commentaire : « Retirer un bureau retire aussi l'ordinateur et les petits objets qui y sont posés ; retirer une étagère, les objets rangés et posés dessus. »

- [ ] **Step 4: `cleanLayout` dans `library-book.ts`** — importer `SURFACE_SLOTS` depuis `./room-grid` ; dans le `filter` final de `cleanLayout`, avant le bloc des slugs, ajouter :

```ts
    if (p.kind === 'small') {
      const host = unique.find((q) => q.id === p.hostId);
      if (!host || (host.kind !== 'desk' && host.kind !== 'shelf') || p.slot >= SURFACE_SLOTS[host.kind]) return false;
      const key = `${p.hostId}:small:${p.slot}`;
      if (slots.has(key)) return false;
      if (host.kind === 'desk' && (p.slot === 1 || p.slot === 2) && unique.some((q) => q.kind === 'computer' && q.deskId === host.id)) return false;
      slots.add(key);
    }
```

(le jeu `slots` existe déjà ; sa clé `…:small:…` ne peut pas entrer en collision avec `shelfId:slot`.)

- [ ] **Step 5: Lancer**

Run: `npx vitest run tests/core/library --maxWorkers=4` puis `npm run typecheck`
Expected: PASS (hors erreurs d'interface traitées plus loin, voir tâche 2 étape 7).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(bibliotheque): petits objets sur la surface d'un bureau ou d'une étagère"
```

---

### Task 4: Cibles de dépôt (glissé) pour les nouveaux types

**Files:**
- Modify: `src/content/furniture-drag.ts`
- Create: `tests/content/furniture-drag-home.test.ts`

**Interfaces:**
- Consumes: `firstFreeSurfaceSlot` (tâche 3), `canPlace` avec couches (tâche 2).
- Produces: `hostAtCell(layout, col, row): string | null` (bureau ou étagère contenant la case) ; `DropReason` gagne `'host-busy' | 'not-host'` ; `DropTarget` gagne `hostId?: string` ; `dropTargetFor` gère `item.kind === 'small'`.

- [ ] **Step 1: Écrire les tests** — `tests/content/furniture-drag-home.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { dropTargetFor, hostAtCell } from '../../src/content/furniture-drag';
import type { Layout } from '../../src/core/library/library-types';

const layout: Layout = [
  { id: 'f1', kind: 'desk', col: 2, row: 14 },
  { id: 'f2', kind: 'small', item: 'plant', hostId: 'f1', slot: 0 },
  { id: 'f3', kind: 'shelf', col: 12, row: 10 },
  { id: 'r', kind: 'rug', col: 0, row: 15 },
  { id: 's', kind: 'sofa', col: 20, row: 14 },
];

describe('hostAtCell', () => {
  it('trouve le bureau ou l’étagère qui contient la case', () => {
    expect(hostAtCell(layout, 3, 15)).toBe('f1');
    expect(hostAtCell(layout, 13, 12)).toBe('f3');
    expect(hostAtCell(layout, 8, 15)).toBeNull();
  });
});

describe('dropTargetFor : petit objet', () => {
  it('se pose sur une étagère', () => {
    const target = dropTargetFor(layout, 48, 'f2', 13, 12);
    expect(target).toMatchObject({ ok: true, hostId: 'f3' });
  });

  it('reste valable sur son propre porteur', () => {
    expect(dropTargetFor(layout, 48, 'f2', 3, 15)).toMatchObject({ ok: true, hostId: 'f1' });
  });

  it('refuse hors d’un porteur', () => {
    expect(dropTargetFor(layout, 48, 'f2', 8, 15)).toMatchObject({ ok: false, reason: 'not-host' });
  });

  it('refuse un porteur plein', () => {
    let full: Layout = layout;
    for (let i = 0; i < 3; i++) full = [...full, { id: `x${i}`, kind: 'small', item: 'lamp', hostId: 'f3', slot: i }];
    expect(dropTargetFor(full, 48, 'f2', 13, 12)).toMatchObject({ ok: false, reason: 'host-busy' });
  });
});

describe('dropTargetFor : meubles et tapis', () => {
  it('un canapé se dépose avec le bas sur la case visée', () => {
    expect(dropTargetFor(layout, 48, 's', 10, 16)).toMatchObject({ ok: true, col: 10, top: 14 });
  });

  it('un tapis refuse le mur', () => {
    expect(dropTargetFor(layout, 48, 'r', 3, 5)).toMatchObject({ ok: false, reason: 'floor' });
  });

  it('un meuble peut être déposé sur un tapis', () => {
    expect(dropTargetFor(layout, 48, 's', 3, 17)).toMatchObject({ ok: true });
  });
});
```

Note : le dernier test dépose le canapé (bas en ligne 17, haut en 15) sur le tapis (lignes 15 à 17, colonnes 0 à 5) à la colonne 3 : les cases du bureau (`col 2 à 6, lignes 14 à 17`) le chevauchent. Remplacer alors `3, 17` par `8, 17` (colonnes 8 à 13, ligne 15 à 17, libres) si le test échoue pour `taken` ; le but est seulement de vérifier que le tapis ne bloque pas.

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/furniture-drag-home.test.ts`
Expected: FAIL (`hostAtCell` absent).

- [ ] **Step 3: Implémenter** — dans `furniture-drag.ts` : importer `firstFreeSurfaceSlot` depuis `room-grid` ; ajouter après `deskAtCell` :

```ts
// Le bureau ou l'étagère dont une case contient (col, row), ou null : ils portent les petits objets.
export function hostAtCell(layout: Layout, col: number, row: number): string | null {
  for (const placed of layout) {
    if (placed.kind !== 'desk' && placed.kind !== 'shelf') continue;
    const r = rectOf(placed);
    if (r && col >= r.col && col < r.col + r.w && row >= r.row && row < r.row + r.h) return placed.id;
  }
  return null;
}
```

`DropReason` : ajouter `| 'host-busy' | 'not-host'`. `DropTarget` : ajouter, après `deskId?: string;`, `// Petit objet : porteur d'arrivée.` et `hostId?: string;`. Dans `dropTargetFor`, après la branche `computer` et avant le calcul du meuble debout :

```ts
  if (item.kind === 'small') {
    const hostId = hostAtCell(layout, col, row);
    if (!hostId) return { ok: false, reason: 'not-host', cells: [{ col, row }], ghost: { col, row, w: 1, h: 1 } };
    const host = layout.find((p) => p.id === hostId);
    const ghost = host ? rectOf(host) : null;
    const room = hostId === item.hostId || firstFreeSurfaceSlot(layout, hostId, id) !== null;
    return room ? { ok: true, cells: [], ghost, hostId } : { ok: false, reason: 'host-busy', cells: [], ghost, hostId };
  }
```

- [ ] **Step 4: Lancer**

Run: `npx vitest run tests/content/furniture-drag-home.test.ts tests/content/library-drag.test.tsx` puis `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(bibliotheque): cibles de dépôt des petits objets, tapis et nouveaux meubles"
```

---

### Task 5: Dessin des meubles et ordre d'affichage

**Files:**
- Modify: `src/core/library/styles.ts`
- Create: `src/content/furniture-art-home.tsx`
- Modify: `src/content/RoomView.tsx`
- Create: `tests/content/library-furniture-view.test.tsx`

**Interfaces:**
- Consumes: `surfaceSlotRect`, `SURFACE_SLOTS`, `isStanding`, `sizeOf` (tâches 2 et 3).
- Produces: `HomeArt({ kind, rect, palette })` pour les 10 types hors étagère/bureau ; `SmallArt({ item, rect, palette })` ; chaque meuble est un `<g data-furniture="<kind>" data-id>` (petit objet : `data-furniture="small"`).

- [ ] **Step 1: Écrire le test** — `tests/content/library-furniture-view.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import type { Room } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const room: Room = {
  id: 'r1',
  name: 'Salon',
  style: 'scandinave',
  orientation: 'landscape',
  cols: 48,
  layout: [
    { id: 'a', kind: 'sofa', col: 2, row: 14 },
    { id: 'b', kind: 'rug', col: 2, row: 15 },
    { id: 'c', kind: 'desk', col: 12, row: 14 },
    { id: 'd', kind: 'small', item: 'plant', hostId: 'c', slot: 0 },
    { id: 'e', kind: 'computer', deskId: 'c' },
    { id: 'f', kind: 'chair', col: 20, row: 15 },
    { id: 'g', kind: 'armchair', col: 24, row: 14 },
    { id: 'h', kind: 'basket', col: 28, row: 16 },
    { id: 'i', kind: 'bowl', col: 32, row: 17 },
    { id: 'j', kind: 'kennel', col: 34, row: 14 },
    { id: 'k', kind: 'plant', col: 40, row: 14 },
    { id: 'l', kind: 'lamp', col: 43, row: 13 },
    { id: 'm', kind: 'coffee-table', col: 3, row: 17 },
    { id: 'n', kind: 'shelf', col: 44, row: 10 },
    { id: 'o', kind: 'small', item: 'lamp', hostId: 'n', slot: 2 },
  ],
};

function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<RoomView room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} />);
  });
  return container;
}

describe('RoomView : mobilier', () => {
  it('dessine chaque type de meuble', () => {
    const container = mount();
    for (const kind of ['sofa', 'rug', 'desk', 'small', 'computer', 'chair', 'armchair', 'basket', 'bowl', 'kennel', 'plant', 'lamp', 'coffee-table', 'shelf']) {
      expect(container.querySelector(`[data-furniture="${kind}"]`), kind).not.toBeNull();
    }
    expect(container.querySelectorAll('[data-furniture="small"]')).toHaveLength(2);
  });

  it('dessine le tapis sous les meubles et les petits objets sur leur porteur', () => {
    const order = [...mount().querySelectorAll('[data-furniture]')].map((el) => `${el.getAttribute('data-furniture')}:${el.getAttribute('data-id')}`);
    const at = (id: string) => order.findIndex((entry) => entry.endsWith(`:${id}`));
    expect(at('b')).toBeLessThan(at('a'));
    expect(at('c')).toBeLessThan(at('d'));
    expect(at('d')).toBeLessThan(at('e'));
    expect(at('n')).toBeLessThan(at('o'));
  });

  it('dessine le meuble le plus proche du spectateur en dernier', () => {
    const order = [...mount().querySelectorAll('[data-furniture]')].map((el) => el.getAttribute('data-id'));
    // la table basse (bas en ligne 18) passe devant le canapé (bas en ligne 17)
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('m'));
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/library-furniture-view.test.tsx`
Expected: FAIL (meubles non dessinés).

- [ ] **Step 3: Palette** — dans `styles.ts`, ajouter au type `Palette` les champs `fabric, fabricLight, fabricDark, warm, warmLight, warmDark, leaf, leafDark, rug, shade, metal, door: string;` et à `SCANDINAVE` :

```ts
  fabric: '#8FA3A8',
  fabricLight: '#A3B6BA',
  fabricDark: '#7F9398',
  warm: '#C9A98C',
  warmLight: '#D8BDA2',
  warmDark: '#B8977A',
  leaf: '#7DA57A',
  leafDark: '#6A9568',
  rug: '#B9C9C2',
  shade: '#F4E3B5',
  metal: '#8A8A8A',
  door: '#6B5B45',
```

- [ ] **Step 4: Dessins** — créer `src/content/furniture-art-home.tsx` :

```tsx
import type { ReactElement } from 'react';
import type { SmallItem, StandingKind } from '../core/library/library-types';
import type { PxRect } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';

type Props = { rect: PxRect; palette: Palette };

function Chair({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <rect x={x + w * 0.1} y={y} width={w * 0.1} height={h} fill={p.wood} />
      <rect x={x + w * 0.1} y={y + h * 0.05} width={w * 0.6} height={h * 0.08} fill={p.wood} />
      <rect x={x + w * 0.1} y={y + h * 0.15} width={w * 0.6} height={h * 0.08} fill={p.wood} />
      <rect x={x + w * 0.05} y={y + h * 0.5} width={w * 0.85} height={h * 0.1} rx={3} fill={p.desk} stroke={p.edge} />
      <rect x={x + w * 0.78} y={y + h * 0.6} width={w * 0.09} height={h * 0.4} fill={p.leg} stroke={p.edge} />
    </g>
  );
}

function Sofa({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <rect x={x} y={y + h * 0.05} width={w} height={h * 0.62} rx={h * 0.2} fill={p.fabric} />
      <rect x={x + w * 0.05} y={y + h * 0.4} width={w * 0.9} height={h * 0.42} rx={h * 0.14} fill={p.fabricLight} />
      <rect x={x} y={y + h * 0.3} width={w * 0.12} height={h * 0.55} rx={h * 0.15} fill={p.fabricDark} />
      <rect x={x + w * 0.88} y={y + h * 0.3} width={w * 0.12} height={h * 0.55} rx={h * 0.15} fill={p.fabricDark} />
      <line x1={x + w * 0.37} y1={y + h * 0.44} x2={x + w * 0.37} y2={y + h * 0.8} stroke={p.fabric} strokeWidth={1.5} />
      <line x1={x + w * 0.63} y1={y + h * 0.44} x2={x + w * 0.63} y2={y + h * 0.8} stroke={p.fabric} strokeWidth={1.5} />
      <rect x={x + w * 0.06} y={y + h * 0.85} width={w * 0.035} height={h * 0.15} fill={p.leg} />
      <rect x={x + w * 0.905} y={y + h * 0.85} width={w * 0.035} height={h * 0.15} fill={p.leg} />
    </g>
  );
}

function Armchair({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <rect x={x + w * 0.02} y={y + h * 0.05} width={w * 0.96} height={h * 0.7} rx={h * 0.2} fill={p.warm} />
      <rect x={x + w * 0.14} y={y + h * 0.45} width={w * 0.72} height={h * 0.35} rx={h * 0.1} fill={p.warmLight} />
      <rect x={x} y={y + h * 0.35} width={w * 0.18} height={h * 0.5} rx={h * 0.15} fill={p.warmDark} />
      <rect x={x + w * 0.82} y={y + h * 0.35} width={w * 0.18} height={h * 0.5} rx={h * 0.15} fill={p.warmDark} />
      <rect x={x + w * 0.1} y={y + h * 0.85} width={w * 0.07} height={h * 0.15} fill={p.leg} />
      <rect x={x + w * 0.83} y={y + h * 0.85} width={w * 0.07} height={h * 0.15} fill={p.leg} />
    </g>
  );
}

function Basket({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <path d={`M${x + w * 0.02} ${y + h} Q${x} ${y + h * 0.3} ${x + w * 0.12} ${y + h * 0.2} L${x + w * 0.88} ${y + h * 0.2} Q${x + w} ${y + h * 0.3} ${x + w * 0.98} ${y + h} Z`} fill={p.warm} stroke={p.warmDark} />
      <ellipse cx={x + w / 2} cy={y + h * 0.22} rx={w * 0.38} ry={h * 0.14} fill={p.warmLight} />
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={x + w * f} y1={y + h * 0.45} x2={x + w * f} y2={y + h * 0.95} stroke={p.warmDark} strokeWidth={1} />
      ))}
    </g>
  );
}

function Bowl({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <path d={`M${x + w * 0.05} ${y + h * 0.15} L${x + w * 0.95} ${y + h * 0.15} L${x + w * 0.85} ${y + h} L${x + w * 0.15} ${y + h} Z`} fill={p.fabric} stroke={p.fabricDark} />
      <ellipse cx={x + w / 2} cy={y + h * 0.17} rx={w * 0.45} ry={h * 0.15} fill={p.warmLight} />
    </g>
  );
}

function Kennel({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <rect x={x + w * 0.05} y={y + h * 0.3} width={w * 0.9} height={h * 0.7} fill={p.wood} stroke={p.woodDark} />
      <path d={`M${x} ${y + h * 0.36} L${x + w / 2} ${y} L${x + w} ${y + h * 0.36}`} fill="none" stroke={p.woodDark} strokeWidth={6} strokeLinejoin="round" />
      <path d={`M${x + w * 0.35} ${y + h} L${x + w * 0.35} ${y + h * 0.62} Q${x + w / 2} ${y + h * 0.4} ${x + w * 0.65} ${y + h * 0.62} L${x + w * 0.65} ${y + h} Z`} fill={p.door} />
    </g>
  );
}

function Plant({ rect: { x, y, w, h }, palette: p }: Props) {
  const cx = x + w / 2;
  const potTop = y + h * 0.68;
  return (
    <g>
      <path d={`M${x + w * 0.2} ${y + h} L${x + w * 0.8} ${y + h} L${x + w * 0.9} ${potTop} L${x + w * 0.1} ${potTop} Z`} fill={p.leg} stroke={p.edge} />
      <ellipse cx={cx} cy={y + h * 0.38} rx={w * 0.14} ry={h * 0.32} fill={p.leaf} />
      <ellipse cx={cx} cy={y + h * 0.46} rx={w * 0.12} ry={h * 0.26} fill={p.leaf} transform={`rotate(-28 ${cx} ${potTop})`} />
      <ellipse cx={cx} cy={y + h * 0.46} rx={w * 0.12} ry={h * 0.26} fill={p.leaf} transform={`rotate(28 ${cx} ${potTop})`} />
      <ellipse cx={cx} cy={y + h * 0.52} rx={w * 0.1} ry={h * 0.2} fill={p.leafDark} transform={`rotate(-55 ${cx} ${potTop})`} />
      <ellipse cx={cx} cy={y + h * 0.52} rx={w * 0.1} ry={h * 0.2} fill={p.leafDark} transform={`rotate(55 ${cx} ${potTop})`} />
    </g>
  );
}

function Lamp({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <rect x={x + w * 0.1} y={y + h - 7} width={w * 0.8} height={7} rx={3} fill={p.metal} />
      <rect x={x + w / 2 - 1.5} y={y + h * 0.17} width={3} height={h * 0.83 - 6} fill={p.metal} />
      <path d={`M${x} ${y + h * 0.17} L${x + w} ${y + h * 0.17} L${x + w * 0.8} ${y} L${x + w * 0.2} ${y} Z`} fill={p.shade} stroke={p.edge} />
    </g>
  );
}

function CoffeeTable({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <rect x={x + w * 0.08} y={y + h * 0.3} width={w * 0.06} height={h * 0.7} fill={p.leg} stroke={p.edge} />
      <rect x={x + w * 0.86} y={y + h * 0.3} width={w * 0.06} height={h * 0.7} fill={p.leg} stroke={p.edge} />
      <rect x={x} y={y} width={w} height={h * 0.34} rx={4} fill={p.desk} stroke={p.edge} />
    </g>
  );
}

function Rug({ rect: { x, y, w, h }, palette: p }: Props) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={p.rug} />
      <rect x={x + 8} y={y + 8} width={w - 16} height={h - 16} rx={5} fill="none" stroke={p.skirt} strokeWidth={2} strokeDasharray="6 4" />
    </g>
  );
}

type HomeKind = Exclude<StandingKind, 'shelf' | 'desk'>;
const ARTS: Record<HomeKind, (props: Props) => ReactElement> = {
  chair: Chair,
  sofa: Sofa,
  armchair: Armchair,
  basket: Basket,
  bowl: Bowl,
  kennel: Kennel,
  plant: Plant,
  lamp: Lamp,
  'coffee-table': CoffeeTable,
  rug: Rug,
};

export function HomeArt({ kind, rect, palette }: Props & { kind: HomeKind }) {
  const Art = ARTS[kind];
  return <Art rect={rect} palette={palette} />;
}

// Petit objet posé sur une surface : centré dans sa boîte, le pied appuyé sur le dessus du porteur.
export function SmallArt({ item, rect, palette: p }: Props & { item: SmallItem }) {
  const cx = rect.x + rect.w / 2;
  const base = rect.y + rect.h - 2;
  if (item === 'plant') {
    return (
      <g>
        <path d={`M${cx - 9} ${base} L${cx + 9} ${base} L${cx + 11} ${base - 13} L${cx - 11} ${base - 13} Z`} fill={p.leg} stroke={p.edge} />
        <ellipse cx={cx - 5} cy={base - 22} rx={4} ry={11} fill={p.leaf} transform={`rotate(-25 ${cx - 5} ${base - 22})`} />
        <ellipse cx={cx + 5} cy={base - 22} rx={4} ry={11} fill={p.leafDark} transform={`rotate(25 ${cx + 5} ${base - 22})`} />
        <ellipse cx={cx} cy={base - 25} rx={4} ry={12} fill={p.leaf} />
      </g>
    );
  }
  return (
    <g>
      <rect x={cx - 8} y={base - 3} width={16} height={3} rx={1.5} fill={p.metal} />
      <rect x={cx - 1.5} y={base - 22} width={3} height={20} fill={p.metal} />
      <path d={`M${cx - 12} ${base - 22} L${cx + 12} ${base - 22} L${cx + 8} ${base - 38} L${cx - 8} ${base - 38} Z`} fill={p.shade} stroke={p.edge} />
    </g>
  );
}
```

- [ ] **Step 5: `RoomView.tsx`** — imports : ajouter `isStanding, SURFACE_SLOTS, surfaceSlotRect` à l'import de `room-grid`, `sizeOf` depuis `../core/library/furniture-catalog`, et `import { HomeArt, SmallArt } from './furniture-art-home';`.

Remplacer la boucle `deskRects` par :

```ts
  const deskRects = new Map<string, PxRect>();
  // Bureaux et étagères : ils portent les petits objets.
  const hostRects = new Map<string, PxRect>();
  for (const placed of room.layout) {
    const rect = rectOf(placed);
    if (!rect) continue;
    if (placed.kind === 'desk') deskRects.set(placed.id, pxRect(rect));
    if (placed.kind === 'desk' || placed.kind === 'shelf') hostRects.set(placed.id, pxRect(rect));
  }
```

Dans `renderPlaced`, remplacer le bloc `else { const cells = rectOf(placed); … }` par :

```tsx
    } else if (placed.kind === 'small') {
      const hostRect = hostRects.get(placed.hostId);
      const host = room.layout.find((p) => p.id === placed.hostId);
      if (!hostRect || (host?.kind !== 'desk' && host?.kind !== 'shelf')) return null;
      rect = surfaceSlotRect(hostRect, SURFACE_SLOTS[host.kind], placed.slot);
      art = <SmallArt item={placed.item} rect={rect} palette={palette} />;
    } else {
      const cells = rectOf(placed);
      if (!cells || !isStanding(placed)) return null;
      rect = pxRect(cells);
      art =
        placed.kind === 'shelf' ? (
          <ShelfArt rect={rect} palette={palette} showSlots={editing} occupied={occupiedSlots.get(placed.id)} />
        ) : placed.kind === 'desk' ? (
          <DeskArt rect={rect} palette={palette} />
        ) : (
          <HomeArt kind={placed.kind} rect={rect} palette={palette} />
        );
    }
```

Les lignes `lifted` / `liftedCopy` suivantes deviennent :

```tsx
    const lifted = drag !== null && (drag.id === placed.id || (placed.kind === 'computer' && drag.id === placed.deskId) || (placed.kind === 'small' && drag.id === placed.hostId));
    const liftedCopy = lifted ? liftedCopyOf(rect, art, drag.id === placed.id ? rect : (hostRects.get(drag.id) ?? rect)) : null;
```

Remplacer le calcul de `furniture` / `ordered` par :

```ts
  // Ordre de dessin : les tapis en dessous, puis les meubles du plus loin au plus proche (bas le plus haut d'abord),
  // puis les petits objets sur leur porteur, puis les ordinateurs sur les bureaux.
  const standing = room.layout.filter(isStanding);
  const bottomRow = (p: (typeof standing)[number]): number => p.row + sizeOf(p.kind).h;
  const ordered = [
    ...standing.filter((p) => p.kind === 'rug'),
    ...standing.filter((p) => p.kind !== 'rug').sort((a, b) => bottomRow(a) - bottomRow(b)),
    ...room.layout.filter((p) => p.kind === 'small'),
    ...room.layout.filter((p) => p.kind === 'computer'),
  ];
```

- [ ] **Step 6: Lancer**

Run: `npx vitest run tests/content --maxWorkers=4` puis `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(bibliotheque): dessin des meubles, du tapis et des petits objets"
```

---

### Task 6: Panneau : catégories, pose, déplacement et retrait

**Files:**
- Create: `src/content/furniture-icons.ts`
- Modify: `src/content/LibraryPanel.tsx`
- Create: `tests/content/library-furniture.test.tsx`

**Interfaces:**
- Consumes: `CATEGORIES`, `isStandingKind`, `isSmallKind`, `SMALL_ITEM_OF`, `labelOf` (tâche 2) ; `placeSmall`, `moveSmall`, `firstFreeSurfaceSlot`, `hasFreeHost` (tâche 3) ; `DropTarget.hostId` (tâche 4).
- Produces: boutons `[data-category="storage|seats|pets|deco"]` (la catégorie « Rangement » est ouverte par défaut) et `[data-kind="<kind>"]` pour les types de la catégorie ouverte.

- [ ] **Step 1: Écrire les tests** — `tests/content/library-furniture.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { LibraryPanel } from '../../src/content/LibraryPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
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
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
  await click('[data-action="edit"]');
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('mobilier dans le panneau', () => {
  it('propose quatre catégories et leurs meubles', async () => {
    expect(q('[data-kind="shelf"]')).not.toBeNull();
    for (const [category, kind] of [['seats', 'sofa'], ['pets', 'basket'], ['deco', 'rug'], ['storage', 'desk']] as const) {
      await click(`[data-category="${category}"]`);
      expect(q(`[data-kind="${kind}"]`), kind).not.toBeNull();
    }
  });

  it('pose un tapis puis un canapé dessus', async () => {
    await click('[data-category="deco"]');
    await click('[data-kind="rug"]');
    await click('[data-cell="2-17"]');
    expect(q('[data-furniture="rug"]')).not.toBeNull();
    await click('[data-category="seats"]');
    await click('[data-kind="sofa"]');
    await click('[data-cell="2-16"]');
    expect(q('[data-furniture="sofa"]')).not.toBeNull();
  });

  it('refuse un tapis sur le mur', async () => {
    await click('[data-category="deco"]');
    await click('[data-kind="rug"]');
    await click('[data-cell="3-5"]');
    expect(q('[data-furniture]')).toBeNull();
    expect(q('[role="status"]')?.textContent).toContain('sol');
  });

  it('explique qu’il faut un porteur pour un petit objet', async () => {
    await click('[data-category="deco"]');
    await click('[data-kind="small-plant"]');
    expect(q('[role="status"]')?.textContent).toContain('bureau');
    expect(q('[data-furniture]')).toBeNull();
  });

  it('pose une petite plante sur un bureau', async () => {
    await click('[data-kind="desk"]');
    await click('[data-cell="2-17"]');
    await click('[data-category="deco"]');
    await click('[data-kind="small-plant"]');
    await click('[data-furniture="desk"]');
    expect(q('[data-furniture="small"]')).not.toBeNull();
  });

  it('retire le bureau et sa petite plante après confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click('[data-kind="desk"]');
    await click('[data-cell="2-17"]');
    await click('[data-category="deco"]');
    await click('[data-kind="small-lamp"]');
    await click('[data-furniture="desk"]');
    await click('[data-furniture="desk"]');
    await click('[data-action="remove"]');
    expect(window.confirm).toHaveBeenCalled();
    expect(q('[data-furniture]')).toBeNull();
  });

  it('garde le bureau si on refuse la confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click('[data-kind="desk"]');
    await click('[data-cell="2-17"]');
    await click('[data-category="deco"]');
    await click('[data-kind="small-lamp"]');
    await click('[data-furniture="desk"]');
    await click('[data-furniture="desk"]');
    await click('[data-action="remove"]');
    expect(q('[data-furniture="desk"]')).not.toBeNull();
    expect(q('[data-furniture="small"]')).not.toBeNull();
  });
});
```

Note : après la pose d'un petit objet, l'outil est remis à zéro (`reset`) ; le premier clic sur `[data-furniture="desk"]` des deux derniers tests sélectionne le bureau (le même que celui où la lampe vient d'être posée n'est donc pas déjà sélectionné) et le second **désélectionne** : si le test échoue pour cette raison, ne cliquer qu'une fois (après `reset`, rien n'est sélectionné). Adapter selon le comportement constaté, le but est « bureau sélectionné, puis Retirer ».

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/library-furniture.test.tsx`
Expected: FAIL (boutons de catégories absents).

- [ ] **Step 3: Glyphes** — créer `src/content/furniture-icons.ts` :

```ts
import type { Category } from '../core/library/furniture-catalog';
import type { FurnitureKind } from '../core/library/library-types';

// Glyphes (viewBox 24) de chaque type de meuble et de chaque catégorie.
export const KIND_ICON: Record<FurnitureKind, readonly string[]> = {
  shelf: ['M5 3v18', 'M19 3v18', 'M5 8h14', 'M5 14h14'],
  desk: ['M3 8h18', 'M5 8v12', 'M19 8v12'],
  computer: ['M3 4h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M8 20h8', 'M12 16v4'],
  chair: ['M7 3v18', 'M7 4h9', 'M6 13h12', 'M17 13v8'],
  sofa: ['M4 11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6H4z', 'M2 12v5h2', 'M22 12v5h-2', 'M6 17v3', 'M18 17v3'],
  armchair: ['M6 10a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v8H6z', 'M3 12v6h3', 'M21 12v6h-3', 'M7 18v3', 'M17 18v3'],
  basket: ['M3 11h18', 'M5 11l1.5 9h11L19 11'],
  bowl: ['M3 12h18', 'M5 12a7 7 0 0 0 14 0'],
  kennel: ['M3 11l9-7 9 7', 'M5 10v10h14V10', 'M10 20v-5a2 2 0 0 1 4 0v5'],
  'coffee-table': ['M4 9h16', 'M6 9l-2 10', 'M18 9l2 10'],
  plant: ['M12 21v-8', 'M12 13c-4 0-6-3-6-7 4 0 6 3 6 7z', 'M12 15c4 0 6-3 6-7-4 0-6 3-6 7z', 'M8 21h8'],
  lamp: ['M12 21V9', 'M8 21h8', 'M8 9l1.5-6h5L16 9z'],
  'small-plant': ['M12 18v-5', 'M12 13c-3 0-4.5-2.5-4.5-5 3 0 4.5 2.5 4.5 5z', 'M12 14c3 0 4.5-2.5 4.5-5-3 0-4.5 2.5-4.5 5z', 'M9 18h6', 'M5 21h14'],
  'small-lamp': ['M12 17v-6', 'M9 17h6', 'M9 11l1-4h4l1 4z', 'M5 21h14'],
  rug: ['M3 8h18v8H3z', 'M6 11h12'],
};

export const CATEGORY_ICON: Record<Category, readonly string[]> = {
  storage: KIND_ICON.shelf,
  seats: KIND_ICON.sofa,
  pets: KIND_ICON.kennel,
  deco: KIND_ICON.plant,
};
```

- [ ] **Step 4: `LibraryPanel.tsx`** — appliquer ces modifications (les ancres sont du code existant) :

a) Imports. Remplacer `import { FURNITURE_KINDS, labelOf, sizeOf, wallSizeOf } from '../core/library/furniture-catalog';` par :

```ts
import { CATEGORIES, SMALL_ITEM_OF, isSmallKind, isStandingKind, labelOf, sizeOf, wallSizeOf, type Category } from '../core/library/furniture-catalog';
```

Ajouter `firstFreeSurfaceSlot, hasFreeHost, moveSmall, placeSmall,` à l'import de `../core/library/room-grid`. Ajouter `import { CATEGORY_ICON, KIND_ICON } from './furniture-icons';`. Supprimer la ligne locale `const KIND_ICON: Record<FurnitureKind, readonly string[]> = { shelf: …, desk: …, computer: … };` (et, si elles ne servent plus ailleurs, les entrées `shelf`, `desk`, `computer` de `ICONS`).

b) État. Après `const [tool, setTool] = …` : `const [category, setCategory] = useState<Category>('storage');`

c) Raisons. Dans `const REASONS = { ...REFUSALS, … }` ajouter `'host-busy': 'Plus de place sur ce meuble.', 'not-host': 'Déposez l’objet sur un bureau ou une étagère.'`.

d) Lâcher d'un meuble soulevé (`dropLifted`) : après la branche `item?.kind === 'computer' && target.deskId`, ajouter

```ts
      } else if (item?.kind === 'small' && target.hostId) {
        const { hostId } = target;
        void editLayout((l) => moveSmall(l, id, hostId));
```

e) Cibles. Remplacer les deux lignes `targetsDesk` / `cellsActive` par :

```ts
  // Un ordinateur ou un petit objet vise un porteur (bureau, étagère) : les cases ne captent pas le toucher.
  const targetsHost = (tool?.type === 'new' && (tool.kind === 'computer' || isSmallKind(tool.kind))) || movingItem?.kind === 'computer' || movingItem?.kind === 'small';
  const placing = tool?.type === 'card' ? pending : null;
  // Les cases captent les touchers pour un meuble ou un objet mural ; poser une carte sur une étagère ou un écran vise les meubles.
  const cellsActive = tool !== null && !targetsHost && (tool.type !== 'card' || placing?.target === 'wall');
```

(en supprimant l'ancienne ligne `const placing = …` pour ne pas la dupliquer).

f) `onCell` : remplacer la ligne `const kind: StandingKind | null = …` par :

```ts
    const kind: StandingKind | null = tool.type === 'new' ? (isStandingKind(tool.kind) ? tool.kind : null) : movingItem && isStanding(movingItem) ? movingItem.kind : null;
```

g) `onPick` : après le bloc `if (tool?.type === 'move' && movingItem?.kind === 'computer') { … }`, ajouter

```ts
    if (tool?.type === 'new' && isSmallKind(tool.kind)) {
      if (item.kind !== 'desk' && item.kind !== 'shelf') return refuse('Un petit objet se pose sur un bureau ou une étagère.');
      if (firstFreeSurfaceSlot(layout, id) === null) return refuse('Plus de place sur ce meuble.');
      const small = SMALL_ITEM_OF[tool.kind];
      await editLayout((l) => placeSmall(l, id, small, nextFurnitureId(l)));
      return reset();
    }
    if (tool?.type === 'move' && movingItem?.kind === 'small') {
      if (item.kind !== 'desk' && item.kind !== 'shelf') return refuse('Un petit objet se pose sur un bureau ou une étagère.');
      if (item.id !== movingItem.hostId && firstFreeSurfaceSlot(layout, id, movingItem.id) === null) return refuse('Plus de place sur ce meuble.');
      await editLayout((l) => moveSmall(l, movingItem.id, id));
      return reset();
    }
```

h) `startNew` : remplacer par

```ts
  const startNew = (kind: FurnitureKind): void => {
    setSelectedId(null);
    setBlink([]);
    if (isSmallKind(kind) && !hasFreeHost(layout)) {
      setTool(null);
      return refuse('Il faut d’abord un bureau ou une étagère avec de la place.');
    }
    setTool({ type: 'new', kind });
    setMessage(
      kind === 'computer'
        ? 'Touchez un bureau pour y poser l’ordinateur.'
        : isSmallKind(kind)
          ? `Touchez un bureau ou une étagère pour y poser : ${labelOf(kind).toLowerCase()}.`
          : `Touchez une case du sol pour poser : ${labelOf(kind).toLowerCase()}.`,
    );
  };
```

i) `startMove` : dans le message, ajouter le cas du petit objet : `item?.kind === 'small' ? 'Touchez le bureau ou l’étagère où le poser.' :` avant le cas `'computer'`.

j) `removeSelected` : remplacer le calcul de `holdsCards` et sa confirmation par

```ts
    // Un meuble qui porte quelque chose (cartes rangées, carte à l'écran, petits objets) demande confirmation : tout part avec lui.
    const holdsMore =
      (item?.kind === 'shelf' && layout.some((p) => (p.kind === 'stored' && p.shelfId === item.id) || (p.kind === 'small' && p.hostId === item.id))) ||
      (item?.kind === 'desk' && layout.some((p) => (p.kind === 'computer' && p.deskId === item.id && p.slug) || (p.kind === 'small' && p.hostId === item.id)));
    if (holdsMore && !window.confirm('Retirer aussi ce qui est posé dessus ?')) return;
```

k) Barre d'outils. Juste avant `<div className="wmt-lib-row">` de la ligne des meubles (celle qui contient `FURNITURE_KINDS.map`), insérer la ligne des catégories, et remplacer `FURNITURE_KINDS.map((kind) => (` par `(CATEGORIES.find((c) => c.id === category)?.kinds ?? []).map((kind) => (` :

```tsx
      {editing && (
        <div className="wmt-lib-row" role="group" aria-label="Catégories de meubles">
          {CATEGORIES.map((c) => (
            <Btn key={c.id} label={c.label} pressed={category === c.id} data={{ category: c.id }} onClick={() => setCategory(c.id)}>
              <Icon paths={CATEGORY_ICON[c.id]} />
            </Btn>
          ))}
        </div>
      )}
```

- [ ] **Step 5: Lancer toute la suite**

Run: `npx vitest run --maxWorkers=4` puis `npm run typecheck` puis `npm run build`
Expected: PASS ; build sans erreur.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(bibliotheque): catégories de meubles, petits objets et retrait confirmé"
```

---

### Task 7: Fiche WikiHow, vérification, PR et livraison

**Files:**
- Modify: `src/core/whats-new/entries.ts`

- [ ] **Step 1: Ajouter la fiche** — dans `entries.ts`, après la fiche `bibliotheque-v4` (même forme : `id`, `theme: 'collection'`, `glyph`, `title`, `summary`, `steps` avec `target`, `title`, `text`, `gesture`, `details` en `{ label, text }`, `scene`). Fiche `bibliotheque-v5`, glyphe `🛋️`, titre « Meubler la Bibliothèque », résumé « Canapé, plantes, tapis… et une pièce plus grande », quatre étapes (ton didactique : à quoi ça sert, comment faire, limites) :

1. cible `[data-wmt-library] [data-category="seats"]` — « Choisir un meuble par catégorie » : en mode Aménager, quatre boutons (Rangement, Assises, Animaux, Déco) ouvrent la liste des meubles ; détails : *À quoi ça sert* (aménager une vraie pièce), *Comment faire* (touchez la catégorie, le meuble, puis une case du sol : la case touchée est le coin bas gauche), *Limites* (un meuble au sol ne se chevauche pas ; il doit avoir son bas sur le sol).
2. cible `[data-wmt-library] [data-category="deco"]` — « Un tapis sous les meubles » : le tapis se pose sur le sol et laisse poser n'importe quel meuble par-dessus ; détails : *À savoir* (deux tapis ne se chevauchent pas ; un meuble peut être posé sur un tapis ou un tapis sous un meuble déjà là).
3. cible `[data-wmt-library] [data-category="deco"]` — « Des petits objets sur un bureau ou une étagère » : petite plante et petite lampe se posent en touchant le meuble porteur ; détails : *Comment faire* (touchez la petite plante ou la petite lampe, puis le bureau ou l’étagère), *Limites* (4 emplacements sur un bureau — l’ordinateur couvre ceux du milieu —, 3 sur le dessus d’une étagère ; retirer le meuble retire ce qui est posé dessus, après confirmation).
4. cible `[data-wmt-library] [data-action="edit"]` — « Une pièce plus grande » : la pièce a maintenant plus de sol (6 lignes) et plus de hauteur ; détails : *À savoir* (vos anciennes pièces sont conservées : tout est simplement descendu pour laisser de la place devant), *D’où viennent les données* (tout reste sur cet appareil, rien n’est envoyé).

Chaque `scene` : `{ page: '/collection', closeWindows: true, reveal: ['[data-wmt-view="library"]', '[data-wmt-library] [data-action="edit"]'] }`. Utiliser un `id` jamais annoncé (`bibliotheque-v5`).

- [ ] **Step 2: Vérifier**

Run: `npx vitest run --maxWorkers=4` puis `npm run typecheck` puis `npm run build`
Expected: PASS ; build réussi.

- [ ] **Step 3: Vérification manuelle** (Chrome, recharger l'extension, onglet Collection → vue Bibliothèque) : une pièce créée avant la mise à jour garde ses meubles à la même place visuelle (sol d'origine contre le mur) ; poser un exemplaire de chaque meuble ; tapis sous un canapé ; table basse devant le canapé ; petite plante et petite lampe sur un bureau, puis sur une étagère ; ordinateur sur un bureau déjà garni (milieu pris → refus ; bords pris → accepté) ; déplacer à l'appui long un meuble, un petit objet (autre bureau), un bureau avec ses petits objets ; retirer un bureau garni (confirmation) ; vue verticale (fenêtre de 16 colonnes, plus haute) et plein écran ; recharger la page : tout est mémorisé. Rapporter honnêtement ce qui n'a pas pu être vérifié (l'APK se fait à la demande).

- [ ] **Step 4: Commit, PR, fusion, livraison**

```bash
git add -A
git commit -m "docs(bibliotheque): fiche WikiHow bibliotheque-v5 (mobilier et pièce agrandie)"
git push -u origin feat/bibliotheque-mobilier
```

Ouvrir la PR (corps terminé par la ligne d'attribution), la fusionner sans demander, puis `npm run build` et `npm run preprod` ; mettre à jour la mémoire du projet (morceau 3 fait ; restent 2c et 4 à 7 ; vérification manuelle Chrome + APK à la demande).

---

## Self-review

- **Couverture de la spec** : pièce agrandie 18/12/6/510/16 et migration +3 → tâche 1 ; 10 meubles + tailles + couches + points d'intérêt + catégories + libellés → tâche 2 ; petits objets, emplacements 4/3, ordinateur couvrant le milieu, retrait avec le porteur, nettoyage à la lecture → tâche 3 ; déplacement par appui long des nouveaux types et des petits objets → tâche 4 (cibles) et 6 (branchement) ; rendu SVG des 12 objets et ordre tapis → meubles → petits objets → tâche 5 ; sélecteur à catégories, message « il faut un porteur », confirmation de retrait → tâche 6 ; WikiHow `bibliotheque-v5`, PR, pré-prod → tâche 7. Tests demandés par la spec (migration, catalogue, `room-grid`, `LibraryPanel`) tous présents.
- **Écarts assumés** (en tête) : pas de taille en cases pour les petits objets ; bouton non grisé mais message ; l'ordinateur couvre les emplacements 1 et 2 sans occuper d'emplacement propre.
- **Cohérence des noms** : `STANDING_KINDS`, `SMALL_ITEMS`, `SmallKind`, `layerOf`, `poisOf`, `isStandingKind`, `isSmallKind`, `SMALL_ITEM_OF`, `CATEGORIES`, `SURFACE_SLOTS`, `firstFreeSurfaceSlot`, `hasFreeHost`, `placeSmall`, `moveSmall`, `surfaceSlotRect`, `hostAtCell`, `HomeArt`, `SmallArt`, `KIND_ICON`, `CATEGORY_ICON`, `data-category`, `data-kind`, `data-furniture="small"` sont utilisés à l'identique partout.
- **Point de vigilance** : la tâche 1 modifie beaucoup de tests existants (règle : +3 sur chaque ligne) ; la tâche 2 laisse des erreurs de type provisoires dans les fichiers traités aux tâches 4 à 6 (indiquées à l'étape 7 de la tâche 2). Tests tactiles de l'appui long non écrits (déjà couverts par `library-drag.test.tsx` pour les meubles) : à vérifier à la main pour les petits objets.
