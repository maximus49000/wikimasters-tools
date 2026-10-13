# Rotation des meubles et vue zoomée de face — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tourner les meubles debout par pas de 45° (8 angles, dessins par angle, empreinte au sol par angle, sans chevauchement) et ouvrir, en Visiter, une vue zoomée de face de l'étagère ou du bureau pour choisir la carte à ouvrir.

**Architecture:** Un module pur `footprint.ts` décrit, pour chaque meuble et chaque angle, le rectangle de dessin, les cases au sol et les points d'intérêt ; `rectOf` et la collision passent par lui. Les dessins des angles 1 à 7 sont produits par un petit projecteur 2,5D (`furniture-projection.ts`) à partir de volumes par meuble (`furniture-volumes.ts`) ; l'angle 0 garde les dessins actuels. Le zoom est un calque (`furniture-zoom.tsx`) piloté par un hook d'état (`use-furniture-zoom.ts`) dans `LibraryPanel`, la caméra étant une transformation CSS du conteneur de la pièce.

**Tech Stack:** TypeScript, React 18 (SVG), Vitest + jsdom, zod (lecture de l'état), WXT (extension) + build Android (Vite).

**Spec:** `docs/superpowers/specs/2026-10-13-rotation-zoom-meubles-design.md`

## Global Constraints

- Tout se fait dans le worktree `C:/Users/maxim/Downloads/Wikimasters-rotation`, branche `feat/rotation-zoom-meubles` (une autre session travaille dans le dossier principal : ne pas y toucher).
- Code, commentaires, libellés et messages en **français**, même densité de commentaires que le code voisin.
- Angles : `0` face, `1` ¾ avant gauche, `2` profil gauche, `3` ¾ dos gauche, `4` dos, `5` ¾ dos droit, `6` profil droit, `7` ¾ avant droit. Champ `angle` absent = 0. **⟲ Tourner à gauche = +1**, **⟳ Tourner à droite = −1** (modulo 8).
- Exceptions au non-chevauchement : tapis (couche `rug`) ; chaise sous un meuble `under: true` qui n'est pas une chaise (bureau, table basse, télescope).
- Zoom seulement en Visiter, seulement étagère avec ≥ 1 carte rangée ou bureau dont l'ordinateur a une carte. Pendant le zoom : aucune vue fenêtre (pas de passage dehors), interrupteur 👁|✏️, barre du haut et défilement masqués/figés.
- Dessins : provisoires Opus, commentaire `// Dessin provisoire Opus — reprise Fable prévue.` en tête des nouveaux fichiers de dessin.
- Glyphes (icônes) plutôt que texte dans l'interface ; `aria-label` + `title` en français.
- Tests : `npm run test:famille -- scene-piece` (et `scene-animaux`, `scene-lumiere` quand touchés) ; jamais le TNR global sauf demande. Chaque nouveau fichier de test est ajouté à une famille dans `tests/familles.ts`.
- Commits : messages en français, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nouvelle fiche WikiHow `bibliotheque-v31` dans `src/core/whats-new/entries.ts` (étapes : text + « À quoi ça sert » + « Comment ça marche » + « Limites »).

## Review Focus

- Pièce enregistrée avant cette version (aucun champ `angle`, chevauchements anciens) : elle s'affiche exactement comme avant et ses chevauchements restent tolérés tant qu'on ne touche pas les meubles → test « chevauchement ancien toléré, refusé au déplacement » (Tâche 3).
- Valeur d'angle abîmée dans le stockage (`angle: 9`, `-1`, `1.5`, `'2'`) : le meuble est lu avec l'angle 0, pas supprimé → test de lecture (Tâche 2).
- Rotation près du bord ou du mur (le profil/diagonale déborde de la pièce ou remonte sur le mur) : fantôme rouge avec la raison `bounds`/`floor`, ✓ grisé, aucun plantage → test placement (Tâche 4).
- Toucher une étagère dont toutes les cartes sont inconnues (slug absent de la collection) : le zoom s'ouvre quand même (il y a des cartes rangées), toucher une carte inconnue ne fait rien → test zoom (Tâche 10).
- Bouton retour Android / navigateur pendant le zoom, puis à nouveau hors zoom : le premier ferme le zoom, le second fait le retour normal (pas de double fermeture, pas d'entrée d'historique orpheline) → test historique (Tâche 10).

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/core/library/footprint.ts` (nouveau) | Types `Angle`, `View` ; `rotateAngle`, `drawSize`, `drawRect`, `floorCells`, `poisAt`, `frontFaceRect` |
| `src/core/library/library-types.ts` | `angle?: Angle` sur le meuble debout |
| `src/core/library/library-book.ts` | Lecture zod de `angle` (abîmé → 0) |
| `src/core/library/room-grid.ts` | `rectOf` par angle, collision par cases au sol, chaise sous meuble creux, `placeStanding`/`moveStanding` avec angle, `setAngle`, `shelfSlotsOf`, ordre de dessin |
| `src/core/library/depth-order.ts`, `pets/brain.ts`, `pets/storm.ts`, `pets/walk-map.ts`, `light/occluders.ts` | Passent par `rectOf`/`floorCells`/`poisAt` (angle) |
| `src/content/furniture-drag.ts` | `dropTargetFor` par angle, `floor` (cases au sol) dans `DropTarget` |
| `src/content/placement.ts` | `angle` dans `Placement`, `rotatePlacement`, `floor` dans `PlacingView` |
| `src/core/library/furniture-volumes.ts` (nouveau) | Volumes colorés par meuble (fractions largeur/hauteur/profondeur) |
| `src/core/library/furniture-projection.ts` (nouveau) | Projecteur pur volumes → faces (polygones) pour les angles 1 à 7 |
| `src/content/furniture-angled.tsx` (nouveau) | `AngledFurnitureArt`, `ComputerBackArt` |
| `src/content/RoomView.tsx` | Dessin par angle, cartes rangées/écran selon l'angle, cases au sol du fantôme |
| `src/content/library-ui.tsx` | Icônes `rotateLeft`, `rotateRight`, `back` |
| `src/content/LibraryPanel.tsx` | ⟲ ⟳ (barre + bulle), zoom (ouverture, blocages, caméra, historique) |
| `src/core/library/zoom-target.ts` (nouveau) | `zoomTargetOf`, `cameraOf`, `zoomRectOf` (purs) |
| `src/content/use-furniture-zoom.ts` (nouveau) | Hook d'état du zoom (phases, minuteries, historique) |
| `src/content/furniture-zoom.tsx` (nouveau) | Calque du zoom : pivot, vue de face, bouton ←, cartes |
| `src/core/whats-new/entries.ts` | Fiche `bibliotheque-v31` |
| `tests/familles.ts` | Nouveaux tests dans `scene-piece` |

---

### Task 1: Module pur des empreintes par angle

**Files:**
- Create: `src/core/library/footprint.ts`
- Test: `tests/core/library/footprint.test.ts`
- Modify: `tests/familles.ts` (ajouter `'footprint.*'` dans `lib(...)` de `scene-piece`)

**Interfaces:**
- Consumes: `sizeOf`, `footOf`, `layerOf`, `poisOf`, `type Poi` de `furniture-catalog.ts` ; `type Cell, Rect, PxRect` de `room-grid.ts` (import type seulement).
- Produces:
  - `export type Angle = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;`
  - `export const isAngle = (v: unknown): v is Angle`
  - `export const rotateAngle = (a: Angle, dir: 1 | -1): Angle`
  - `export function drawSize(kind: StandingKind, angle: Angle): { w: number; h: number }`
  - `export function drawRect(kind: StandingKind, angle: Angle, col: number, row: number): Rect`
  - `export function floorOffsets(kind: StandingKind, angle: Angle): Cell[]` (relatives au coin haut-gauche du rectangle de dessin)
  - `export function floorCells(kind: StandingKind, angle: Angle, col: number, row: number): Cell[]`
  - `export function poisAt(kind: StandingKind, angle: Angle): Poi[]`
  - `export const FACE_MARGIN = 0.1;` et `export function frontFaceRect(angle: Angle, rect: PxRect): PxRect | null`

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/library/footprint.test.ts
import { describe, expect, it } from 'vitest';
import { drawRect, drawSize, floorCells, floorOffsets, frontFaceRect, isAngle, poisAt, rotateAngle } from '../../../src/core/library/footprint';

const keys = (cells: { col: number; row: number }[]) => cells.map((c) => `${c.col}-${c.row}`).sort();

describe('angles', () => {
  it('tourne modulo 8', () => {
    expect(rotateAngle(0, 1)).toBe(1);
    expect(rotateAngle(0, -1)).toBe(7);
    expect(rotateAngle(7, 1)).toBe(0);
  });
  it('reconnaît un angle valide', () => {
    expect([0, 3, 7].every(isAngle)).toBe(true);
    expect([8, -1, 1.5, '2', null].some(isAngle)).toBe(false);
  });
});

describe('face et dos', () => {
  it('gardent le rectangle et les rangées du pied', () => {
    expect(drawSize('sofa', 0)).toEqual({ w: 6, h: 3 });
    expect(drawSize('sofa', 4)).toEqual({ w: 6, h: 3 });
    // étagère 6×8, pied 2 : les deux rangées du bas
    expect(floorOffsets('shelf', 0)).toHaveLength(12);
    expect(floorOffsets('shelf', 0).every((c) => c.row >= 6)).toBe(true);
  });
  it('le tapis occupe tout son rectangle', () => {
    expect(floorOffsets('rug', 0)).toHaveLength(18);
  });
});

describe('profil', () => {
  it('canapé 6×3 pied 3 → 3 colonnes × 3 lignes au sol', () => {
    expect(drawSize('sofa', 2)).toEqual({ w: 3, h: 3 });
    expect(floorOffsets('sofa', 2)).toHaveLength(9);
    expect(drawSize('sofa', 6)).toEqual({ w: 3, h: 3 });
  });
  it('étagère 6×8 pied 2 → 2 colonnes, 3 lignes au sol, 9 de haut', () => {
    expect(drawSize('shelf', 2)).toEqual({ w: 2, h: 9 });
    expect(floorOffsets('shelf', 2).every((c) => c.row >= 6)).toBe(true);
  });
});

describe('diagonale', () => {
  it('escalier qui descend vers la droite pour 1 et 3, vers la gauche pour 5 et 7', () => {
    // canapé : largeur 7, 3 lignes au sol, segments de 4 cases
    expect(drawSize('sofa', 1)).toEqual({ w: 7, h: 3 });
    const one = floorOffsets('sofa', 1);
    expect(keys(one)).toEqual(keys([
      ...[0, 1, 2, 3].map((c) => ({ col: c, row: 0 })),
      ...[2, 3, 4, 5].map((c) => ({ col: c, row: 1 })),
      ...[3, 4, 5, 6].map((c) => ({ col: c, row: 2 })),
    ]));
    const seven = floorOffsets('sofa', 7);
    expect(keys(seven)).toEqual(keys(one.map((c) => ({ col: 6 - c.col, row: c.row }))));
    expect(keys(floorOffsets('sofa', 3))).toEqual(keys(one));
    expect(keys(floorOffsets('sofa', 5))).toEqual(keys(seven));
  });
});

describe('positions absolues', () => {
  it('drawRect et floorCells décalent par (col, row)', () => {
    expect(drawRect('sofa', 2, 4, 13)).toEqual({ col: 4, row: 13, w: 3, h: 3 });
    expect(floorCells('bowl', 0, 5, 16)).toEqual([{ col: 5, row: 16 }, { col: 6, row: 16 }]);
  });
});

describe('points d’intérêt', () => {
  it('restent dans le rectangle de l’angle', () => {
    for (const a of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
      const { w, h } = drawSize('sofa', a);
      for (const p of poisAt('sofa', a)) {
        expect(p.dx).toBeGreaterThanOrEqual(0);
        expect(p.dx).toBeLessThan(w);
        expect(p.dy).toBeGreaterThanOrEqual(0);
        expect(p.dy).toBeLessThan(h);
      }
    }
  });
  it('face : inchangés', () => {
    expect(poisAt('chair', 0)).toEqual([{ type: 'seat', dx: 1, dy: 1 }]);
  });
});

describe('face visible', () => {
  const r = { x: 0, y: 0, w: 100, h: 200 };
  it('face entière à 0, 70 % à gauche à 1, à droite à 7, aucune sinon', () => {
    expect(frontFaceRect(0, r)).toEqual(r);
    expect(frontFaceRect(1, r)).toEqual({ x: 0, y: 20, w: 70, h: 180 });
    expect(frontFaceRect(7, r)).toEqual({ x: 30, y: 20, w: 70, h: 180 });
    for (const a of [2, 3, 4, 5, 6] as const) expect(frontFaceRect(a, r)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/library/footprint.test.ts`
Expected: FAIL — `Cannot find module '../../../src/core/library/footprint'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/library/footprint.ts
import { footOf, layerOf, poisOf, sizeOf, type Poi } from './furniture-catalog';
import type { StandingKind } from './library-types';
import type { Cell, PxRect, Rect } from './room-grid';

// Huit angles par pas de 45° : 0 face, 1 ¾ avant gauche, 2 profil gauche, 3 ¾ dos gauche, 4 dos, 5 ¾ dos droit, 6 profil droit, 7 ¾ avant droit.
export type Angle = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const isAngle = (v: unknown): v is Angle => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 7;
export const rotateAngle = (a: Angle, dir: 1 | -1): Angle => (((a + dir) % 8) + 8) % 8 as Angle;

const isSide = (a: Angle): boolean => a === 2 || a === 6;
const isDiagonal = (a: Angle): boolean => a % 2 === 1;
// L'escalier d'une diagonale descend vers la droite (1, 3) ou vers la gauche (5, 7).
const descendsRight = (a: Angle): boolean => a === 1 || a === 3;

// Rangées au sol de face : le pied (au moins une, au plus la hauteur) ; un tapis est entièrement au sol.
function footRows(kind: StandingKind): number {
  const { h } = sizeOf(kind);
  return layerOf(kind) === 'rug' ? h : Math.min(h, Math.max(1, footOf(kind)));
}

// De profil ou en diagonale, la largeur devient de la profondeur, comptée à moitié (perspective du sol).
const depthRows = (kind: StandingKind): number => Math.max(1, Math.ceil(sizeOf(kind).w / 2));

export function drawSize(kind: StandingKind, angle: Angle): { w: number; h: number } {
  const { w, h } = sizeOf(kind);
  if (!isSide(angle) && !isDiagonal(angle)) return { w, h };
  const foot = footRows(kind);
  const depth = depthRows(kind);
  const width = isSide(angle) ? foot : Math.ceil((w + foot) * 0.75);
  return { w: width, h: h - foot + depth };
}

export function drawRect(kind: StandingKind, angle: Angle, col: number, row: number): Rect {
  return { col, row, ...drawSize(kind, angle) };
}

export function floorOffsets(kind: StandingKind, angle: Angle): Cell[] {
  const { w: W, h: H } = drawSize(kind, angle);
  const cells: Cell[] = [];
  if (!isDiagonal(angle)) {
    const rows = isSide(angle) ? depthRows(kind) : footRows(kind);
    for (let row = H - rows; row < H; row++) for (let col = 0; col < W; col++) cells.push({ col, row });
    return cells;
  }
  const D = depthRows(kind);
  const T = Math.max(1, Math.min(W, Math.ceil(W / D) + 1));
  for (let r = 0; r < D; r++) {
    const start = D === 1 ? 0 : Math.round((r * (W - T)) / (D - 1));
    for (let c = start; c < start + T; c++) cells.push({ col: descendsRight(angle) ? c : W - 1 - c, row: H - D + r });
  }
  return cells;
}

export function floorCells(kind: StandingKind, angle: Angle, col: number, row: number): Cell[] {
  return floorOffsets(kind, angle).map((c) => ({ col: col + c.col, row: row + c.row }));
}

// Points d'intérêt (animaux) recalés dans le rectangle de l'angle : même distance au bas du meuble, colonne à la même proportion.
export function poisAt(kind: StandingKind, angle: Angle): Poi[] {
  const pois = poisOf(kind);
  if (angle === 0) return [...pois];
  const front = sizeOf(kind);
  const { w, h } = drawSize(kind, angle);
  const mirror = angle >= 4;
  return pois.map((p) => {
    const fromBottom = front.h - 1 - p.dy;
    const u = (mirror ? front.w - 1 - p.dx : p.dx) / Math.max(1, front.w);
    return { ...p, dx: Math.min(w - 1, Math.max(0, Math.floor(u * w))), dy: Math.min(h - 1, Math.max(0, h - 1 - fromBottom)) };
  });
}

// Marge du haut d'un dessin tourné (le dessus du meuble remonte vers le fond) ; même valeur que le projecteur.
export const FACE_MARGIN = 0.1;

// Face avant visible (où se dessinent les cartes rangées et l'écran) : toute la face à 0, 70 % à gauche à 1, à droite à 7 ; null sinon.
export function frontFaceRect(angle: Angle, rect: PxRect): PxRect | null {
  if (angle === 0) return rect;
  if (angle !== 1 && angle !== 7) return null;
  const top = rect.h * FACE_MARGIN;
  return { x: angle === 1 ? rect.x : rect.x + rect.w * 0.3, y: rect.y + top, w: rect.w * 0.7, h: rect.h - top };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/library/footprint.test.ts`
Expected: PASS (tous). Si l'escalier du canapé diffère, corriger `floorOffsets` (pas le test : les valeurs viennent de la spec).

- [ ] **Step 5: Ajouter le test à la famille et commit**

Dans `tests/familles.ts`, famille `scene-piece`, ajouter `'footprint.*'` à la liste `lib(...)`.

```bash
git add src/core/library/footprint.ts tests/core/library/footprint.test.ts tests/familles.ts
git commit -m "feat(bibliotheque): empreintes des meubles par angle (8 angles, escalier en diagonale)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Angle dans les données et rectangle par angle

**Files:**
- Modify: `src/core/library/library-types.ts` (type `Placed`, variante meuble debout)
- Modify: `src/core/library/library-book.ts:23` (schéma zod)
- Modify: `src/core/library/room-grid.ts` (`rectOf`, `byDrawOrder`)
- Modify: `src/core/library/depth-order.ts:6`, `src/core/library/pets/brain.ts:96`, `src/core/library/pets/storm.ts:52`
- Test: `tests/core/library/room-grid-angle.test.ts` (nouveau, famille `scene-piece` via `room-grid*`)

**Interfaces:**
- Consumes: `Angle`, `isAngle`, `drawRect` (Tâche 1).
- Produces: `Placed` debout = `{ id; kind: StandingKind; col; row; lit?; depth?; angle?: Angle }` ; `export const angleOf = (p: Placed): Angle` dans `room-grid.ts` ; `rectOf(p)` renvoie `drawRect(kind, angleOf(p), col, row)` pour un meuble debout.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/library/room-grid-angle.test.ts
import { describe, expect, it } from 'vitest';
import { parseLibraryState } from '../../../src/core/library/library-book';
import { angleOf, byDrawOrder, isStanding, rectOf, type Standing } from '../../../src/core/library/room-grid';
import type { Layout } from '../../../src/core/library/library-types';

describe('angle d’un meuble', () => {
  it('absent = 0, rectangle de face inchangé', () => {
    const p = { id: 'a', kind: 'sofa', col: 2, row: 14 } as const;
    expect(angleOf(p)).toBe(0);
    expect(rectOf(p)).toEqual({ col: 2, row: 14, w: 6, h: 3 });
  });
  it('de profil, le rectangle est celui de l’angle', () => {
    expect(rectOf({ id: 'a', kind: 'sofa', col: 2, row: 14, angle: 2 })).toEqual({ col: 2, row: 14, w: 3, h: 3 });
  });
});

describe('lecture de l’angle', () => {
  const stateWith = (angle: unknown) => ({
    version: 5, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' },
    rooms: [{ id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout: [{ id: 'f1', kind: 'sofa', col: 2, row: 14, angle }] }],
  });
  it('garde un angle valide', () => {
    expect(parseLibraryState(stateWith(3)).rooms[0]!.layout[0]).toMatchObject({ angle: 3 });
  });
  it.each([9, -1, 1.5, '2'])('un angle abîmé (%s) donne un meuble de face, conservé', (bad) => {
    const placed = parseLibraryState(stateWith(bad)).rooms[0]!.layout[0]!;
    expect(placed).toMatchObject({ id: 'f1', kind: 'sofa' });
    expect(angleOf(placed)).toBe(0);
  });
});

describe('ordre de dessin', () => {
  it('trie par le bas du rectangle de l’angle', () => {
    // étagère de profil : 9 de haut depuis la ligne 6 → bas 15 ; canapé de face ligne 13 → bas 16
    const layout: Layout = [{ id: 'sofa', kind: 'sofa', col: 0, row: 13 }, { id: 'shelf', kind: 'shelf', col: 8, row: 6, angle: 2 }];
    const order = byDrawOrder(layout, layout.filter((p): p is Standing => isStanding(p))).map((p) => p.id);
    expect(order).toEqual(['shelf', 'sofa']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/library/room-grid-angle.test.ts`
Expected: FAIL — `angleOf` n'est pas exporté.

- [ ] **Step 3: Implementation**

`library-types.ts` — variante debout de `Placed` (et commentaire au-dessus) :

```ts
// `angle` (meubles debout) : rotation par pas de 45° (footprint.ts) ; absent = de face.
  | { id: string; kind: StandingKind; col: number; row: number; lit?: boolean; depth?: StandDepth; angle?: Angle }
```
avec `import type { Angle } from './footprint';` en tête.

`library-book.ts` — la ligne 23 devient (un angle abîmé est écarté, le meuble est gardé) :

```ts
  z.object({ id: z.string(), kind: z.enum(STANDING_KINDS), col: z.number().int(), row: z.number().int(), lit: z.boolean().optional(), angle: z.unknown().optional() })
    .transform(({ angle, ...rest }) => (isAngle(angle) && angle !== 0 ? { ...rest, angle } : rest)),
```
avec `import { isAngle } from './footprint';`. Vérifier que le type inféré reste assignable à `Placed` (sinon caster comme le reste du fichier le fait déjà).

`room-grid.ts` :

```ts
import { drawRect, type Angle } from './footprint';

// Angle d'un objet : celui d'un meuble debout, 0 pour le reste.
export const angleOf = (p: Placed): Angle => (isStanding(p) ? (p.angle ?? 0) : 0);

export function rectOf(p: Placed): Rect | null {
  if (isStanding(p)) return drawRect(p.kind, angleOf(p), p.col, p.row);
  // … (objets accrochés et fenêtres : inchangé)
}
```

Dans `byDrawOrder`, remplacer `b: p.row + sizeOf(p.kind).h` par `b: p.row + rectOf(p)!.h`.
Dans `depth-order.ts:6` : `const bottom = (p: Standing): number => p.row + rectOf(p)!.h;` (retirer l'import `sizeOf` s'il ne sert plus).
Dans `pets/brain.ts:96` : remplacer `sizeOf(p.kind).w` par `rectOf(p)!.w` (importer `rectOf` depuis `../room-grid`).
Dans `pets/storm.ts:52` : remplacer `sofa.row + sizeOf(sofa.kind).h` par `sofa.row + rectOf(sofa)!.h`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/library/room-grid-angle.test.ts` → PASS.
Run: `npm run test:famille -- scene-piece scene-animaux` → PASS (aucune régression : tout est à l'angle 0).

- [ ] **Step 5: Commit**

```bash
git add src/core/library tests/core/library/room-grid-angle.test.ts
git commit -m "feat(bibliotheque): angle des meubles dans les données, rectangle par angle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Collision par cases au sol tournées, chaise sous meuble creux, pose avec angle

**Files:**
- Modify: `src/core/library/room-grid.ts` (`footRect`→`floorCells`, `footClash`, `freeDepth`, `canPlace`, `placeStanding`, `moveStanding`, nouveau `setAngle`, nouveau `shelfSlotsOf`, `slotAt`)
- Test: `tests/core/library/room-grid-angle.test.ts` (compléter)

**Interfaces:**
- Consumes: `floorCells`, `frontFaceRect`, `Angle` (Tâche 1) ; `angleOf` (Tâche 2) ; `underOf` du catalogue.
- Produces:
  - `canPlace(layout, cols, kind, col, row, ignoreId?, angle: Angle = 0): PlaceResult`
  - `freeDepth(layout, cols, kind, col, row, from, ignoreId?, angle: Angle = 0)`
  - `placeStanding(layout, cols, kind, col, row, id, angle: Angle = 0): Layout | null` (écrit `angle` seulement s'il ≠ 0)
  - `moveStanding(layout, cols, id, col, row, angle?: Angle): Layout | null` (angle absent = celui du meuble)
  - `setAngle(layout: Layout, id: string, angle: Angle): Layout` (sans vérification ; meuble debout seulement)
  - `shelfSlotsOf(shelf: Placed): PxRect[]` (emplacements sur la face visible ; rectangle entier si la face n'est pas visible)

- [ ] **Step 1: Write the failing tests** (ajouter au fichier de la Tâche 2)

```ts
import { canPlace, moveStanding, placeStanding, setAngle, shelfSlotsOf, pxRect, shelfSlots } from '../../../src/core/library/room-grid';

const COLS = 24;

describe('collision par cases au sol', () => {
  it('deux canapés de face sur la même ligne se refusent, l’un de profil à côté passe', () => {
    const one = placeStanding([], COLS, 'sofa', 0, 14, 'a')!;
    expect(canPlace(one, COLS, 'sofa', 3, 14).ok).toBe(false);
    expect(canPlace(one, COLS, 'sofa', 6, 14, undefined, 2).ok).toBe(true);
  });
  it('en diagonale, seules les cases de l’escalier comptent', () => {
    // canapé angle 1 en (0,14) : ligne 16 occupée par les colonnes 3 à 6 seulement
    const diag = placeStanding([], COLS, 'sofa', 0, 14, 'a', 1)!;
    expect(canPlace(diag, COLS, 'bowl', 0, 16).ok).toBe(true);
    expect(canPlace(diag, COLS, 'bowl', 4, 16).ok).toBe(false);
  });
  it('le tapis reste dessous', () => {
    const rug = placeStanding([], COLS, 'rug', 0, 14, 'r', 1)!;
    expect(canPlace(rug, COLS, 'sofa', 0, 14, undefined, 1).ok).toBe(true);
  });
  it('une chaise se glisse sous un bureau, pas sous un canapé', () => {
    const desk = placeStanding([], COLS, 'desk', 2, 11, 'd')!;
    expect(canPlace(desk, COLS, 'chair', 3, 12).ok).toBe(true);
    const sofa = placeStanding([], COLS, 'sofa', 2, 13, 's')!;
    expect(canPlace(sofa, COLS, 'chair', 3, 13).ok).toBe(false);
  });
  it('un profil qui sort de la pièce est refusé (bounds)', () => {
    expect(canPlace([], COLS, 'shelf', 23, 9, undefined, 2)).toMatchObject({ ok: false, reason: 'bounds' });
  });
});

describe('chevauchement ancien', () => {
  const old = [{ id: 'a', kind: 'sofa', col: 0, row: 14 }, { id: 'b', kind: 'sofa', col: 2, row: 14 }] as const;
  it('toléré tant qu’on n’y touche pas : un autre meuble se pose ailleurs', () => {
    expect(placeStanding([...old], COLS, 'bowl', 12, 16, 'c')).not.toBeNull();
  });
  it('refusé dès qu’on déplace ou tourne l’un des deux sur place', () => {
    expect(moveStanding([...old], COLS, 'b', 2, 14)).toBeNull();
    expect(moveStanding([...old], COLS, 'b', 2, 14, 2)).toBeNull(); // tourné sur place, il touche encore « a »
    expect(moveStanding([...old], COLS, 'b', 10, 14)).not.toBeNull(); // déplacé ailleurs : accepté
  });
});

describe('pose avec angle', () => {
  it('placeStanding écrit l’angle seulement s’il n’est pas 0', () => {
    expect(placeStanding([], COLS, 'sofa', 0, 14, 'a', 0)![0]).not.toHaveProperty('angle');
    expect(placeStanding([], COLS, 'sofa', 0, 14, 'a', 3)![0]).toMatchObject({ angle: 3 });
  });
  it('moveStanding garde l’angle du meuble par défaut', () => {
    const l = placeStanding([], COLS, 'sofa', 0, 14, 'a', 2)!;
    expect(moveStanding(l, COLS, 'a', 5, 14)![0]).toMatchObject({ col: 5, angle: 2 });
  });
  it('setAngle tourne sans vérifier et retire le champ à 0', () => {
    const l = placeStanding([], COLS, 'sofa', 0, 14, 'a')!;
    expect(setAngle(l, 'a', 5)[0]).toMatchObject({ angle: 5 });
    expect(setAngle(setAngle(l, 'a', 5), 'a', 0)[0]).not.toHaveProperty('angle');
  });
});

describe('emplacements d’une étagère tournée', () => {
  it('de face : comme avant ; ¾ : sur la face visible ; profil : le rectangle', () => {
    const front = { id: 's', kind: 'shelf', col: 0, row: 6 } as const;
    expect(shelfSlotsOf(front)).toEqual(shelfSlots(pxRect(rectOf(front)!)));
    const three = { ...front, angle: 1 as const };
    const slots = shelfSlotsOf(three);
    const r = pxRect(rectOf(three)!);
    expect(Math.max(...slots.map((s) => s.x + s.w))).toBeLessThanOrEqual(r.x + r.w * 0.7 + 0.001);
    expect(shelfSlotsOf({ ...front, angle: 2 })).toHaveLength(15);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/library/room-grid-angle.test.ts`
Expected: FAIL — `setAngle`/`shelfSlotsOf` non exportés, `canPlace` ignore l'angle.

- [ ] **Step 3: Implementation** (`room-grid.ts`)

Remplacer `footRect` et `footClash` par :

```ts
// Deux meubles peuvent partager des cases au sol seulement si l'un est une chaise et l'autre un meuble creux (bureau, table basse, télescope).
const chairUnder = (a: StandingKind, b: StandingKind): boolean => (a === 'chair' && b !== 'chair' && underOf(b)) || (b === 'chair' && a !== 'chair' && underOf(a));

// Les cases au sol de ce meuble (à cet angle) déjà prises par un autre meuble debout (hors tapis), quel que soit son niveau :
// un meuble peut passer devant un autre (pieds plus bas), jamais au même endroit.
function footClash(layout: Layout, kind: StandingKind, col: number, row: number, ignoreId: string | undefined, angle: Angle): Cell[] {
  const taken = new Set<string>();
  for (const other of layout) {
    if (other.id === ignoreId || !isStanding(other) || layerOf(other.kind) !== 'floor' || chairUnder(kind, other.kind)) continue;
    for (const c of floorCells(other.kind, angleOf(other), other.col, other.row)) taken.add(`${c.col}-${c.row}`);
  }
  return floorCells(kind, angle, col, row).filter((c) => taken.has(`${c.col}-${c.row}`));
}

// Cases au sol des tapis (sauf `ignoreId`) : deux tapis ne se chevauchent pas.
function rugClash(layout: Layout, cells: Cell[], ignoreId: string | undefined): Cell[] {
  const taken = new Set<string>();
  for (const other of layout) {
    if (other.id === ignoreId || !isStanding(other) || layerOf(other.kind) !== 'rug') continue;
    for (const c of floorCells(other.kind, angleOf(other), other.col, other.row)) taken.add(`${c.col}-${c.row}`);
  }
  return cells.filter((c) => taken.has(`${c.col}-${c.row}`));
}
```

`freeDepth` et `canPlace` prennent `angle: Angle = 0` en dernier paramètre :

```ts
export function freeDepth(layout: Layout, cols: number, kind: StandingKind, col: number, row: number, from: StandDepth, ignoreId?: string, angle: Angle = 0): StandDepth | null {
  if (layerOf(kind) === 'rug') return rugClash(layout, floorCells(kind, angle, col, row), ignoreId).length === 0 ? from : null;
  return footClash(layout, kind, col, row, ignoreId, angle).length === 0 ? from : null;
}

export function canPlace(layout: Layout, cols: number, kind: StandingKind, col: number, row: number, ignoreId?: string, angle: Angle = 0): PlaceResult {
  const cells = cellsOf(drawRect(kind, angle, col, row));
  const floor = floorCells(kind, angle, col, row);
  const inRoom = inRoomCell(cols);
  if (cells.some((c) => !inRoom(c))) return { ok: false, reason: 'bounds', cells: cells.filter(inRoom) };
  if (floor.some((c) => c.row < WALL_ROWS)) return { ok: false, reason: 'floor', cells: floor.filter((c) => c.row < WALL_ROWS) };
  if (freeDepth(layout, cols, kind, col, row, depthDefault(kind), ignoreId, angle) !== null) return { ok: true };
  const clash = layerOf(kind) === 'rug' ? rugClash(layout, floor, ignoreId) : footClash(layout, kind, col, row, ignoreId, angle);
  return { ok: false, reason: 'taken', cells: clash };
}
```

(Le refus `floor` couvre l'ancien test « bas sur le mur » et l'ancien test « tapis sur le mur ». Si un test existant de `room-grid*.test.ts` attend d'autres `cells` pour `floor`, l'adapter : la règle est maintenant « toutes les cases au sol sur le sol ».)

Pose et rotation :

```ts
// Écrit `angle` seulement s'il diffère de 0 (et le retire sinon).
function withAngle(item: Standing, angle: Angle): Standing {
  const { angle: _, ...rest } = item;
  return angle === 0 ? rest : { ...rest, angle };
}

export function placeStanding(layout: Layout, cols: number, kind: StandingKind, col: number, row: number, id: string, angle: Angle = 0): Layout | null {
  if (!canPlace(layout, cols, kind, col, row, undefined, angle).ok) return null;
  const d = freeDepth(layout, cols, kind, col, row, depthDefault(kind), undefined, angle);
  if (d === null) return null;
  return [...layout, withAngle(withDepth({ id, kind, col, row }, d), angle)];
}

export function moveStanding(layout: Layout, cols: number, id: string, col: number, row: number, angle?: Angle): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || !isStanding(item)) return null;
  const a = angle ?? angleOf(item);
  if (!canPlace(layout, cols, item.kind, col, row, id, a).ok) return null;
  const d = freeDepth(layout, cols, item.kind, col, row, depthOf(layout, item) as StandDepth, id, a);
  if (d === null) return null;
  return layout.map((p) => (p.id === id ? withAngle(withDepth({ ...item, col, row }, d), a) : p));
}

// Tourne un meuble debout sans vérifier la place (le placement vérifie ensuite).
export function setAngle(layout: Layout, id: string, angle: Angle): Layout {
  return layout.map((p) => (p.id === id && isStanding(p) ? withAngle(p, angle) : p));
}

// Emplacements d'une étagère sur sa face visible (¾ : face rétrécie) ; de profil ou de dos, le rectangle entier (cartes non dessinées).
export function shelfSlotsOf(shelf: Placed): PxRect[] {
  const r = rectOf(shelf);
  if (!r) return [];
  const px = pxRect(r);
  return shelfSlots(frontFaceRect(angleOf(shelf), px) ?? px);
}
```

`slotAt` : remplacer le calcul `shelfSlots(pxRect(rectOf(shelf)))` par `shelfSlotsOf(shelf)`. `shiftRow` ne change pas (`moveStanding` garde l'angle).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/library/room-grid-angle.test.ts` → PASS.
Run: `npm run test:famille -- scene-piece` → PASS (adapter seulement les attentes de cases `floor` si nécessaire, en le notant dans le commit).

- [ ] **Step 5: Commit**

```bash
git add src/core/library/room-grid.ts tests/core/library
git commit -m "feat(bibliotheque): collision par cases au sol tournées, chaise sous meuble creux, pose avec angle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Rotation dans le glisser et le mode placement

**Files:**
- Modify: `src/content/furniture-drag.ts` (`DropTarget.floor`, `dropTargetFor` par angle, `shelfSlotsOf`)
- Modify: `src/content/placement.ts` (`Placement.angle`, `rotatePlacement`, `build`, `force`, `PlacingView.floor`, emplacements via `shelfSlotsOf`)
- Test: `tests/content/placement.test.ts` (compléter)

**Interfaces:**
- Consumes: `angleOf`, `setAngle`, `placeStanding(..., angle)`, `moveStanding(..., angle)`, `shelfSlotsOf` (Tâche 3) ; `drawSize`, `floorCells`, `rotateAngle`, `Angle` (Tâche 1).
- Produces:
  - `DropTarget.floor?: Cell[]` (cases au sol de l'objet debout visé)
  - `Placement.angle: Angle` (angle courant de l'objet ; 0 pour ce qui ne tourne pas)
  - `export function rotatePlacement(p: Placement, cols: number, dir: 1 | -1): Placement | null` (null si l'objet ne tourne pas)
  - `export const canRotate = (p: Placement): boolean`
  - `PlacingView.floor?: Cell[]`

- [ ] **Step 1: Write the failing tests** (dans `tests/content/placement.test.ts`)

```ts
import { canRotate, rotatePlacement } from '../../src/content/placement';

describe('rotation pendant le placement', () => {
  it('⟲ tourne d’un cran vers la gauche (+1), ⟳ vers la droite (−1)', () => {
    const p = startPlacement([], COLS, { type: 'new', kind: 'sofa' }, CENTER);
    expect(canRotate(p)).toBe(true);
    const left = rotatePlacement(p, COLS, 1)!;
    expect(left.angle).toBe(1);
    expect(left.draft.find((x) => x.id === DRAFT_ID)).toMatchObject({ angle: 1 });
    expect(rotatePlacement(p, COLS, -1)!.angle).toBe(7);
  });
  it('l’angle suit le fantôme quand on le déplace, et ✓ l’enregistre', () => {
    const p = rotatePlacement(startPlacement([], COLS, { type: 'new', kind: 'sofa' }, CENTER), COLS, 1)!;
    const moved = movePlacement(p, COLS, spotAt(4, 16));
    expect(moved.target.ok).toBe(true);
    expect(commitPlacement(moved)!.find((x) => x.kind === 'sofa')).toMatchObject({ angle: 1 });
  });
  it('un angle qui ne tient pas : fantôme tourné, rouge, ✓ refusé', () => {
    // étagère contre le bord droit : de profil elle tient (2 colonnes), en diagonale (6 colonnes) elle déborde
    const p = movePlacement(startPlacement([], COLS, { type: 'new', kind: 'shelf' }, CENTER), COLS, spotAt(22, 14));
    const side = rotatePlacement(rotatePlacement(p, COLS, 1)!, COLS, 1)!;
    expect(side.angle).toBe(2);
    expect(side.target.ok).toBe(true);
    const diag = rotatePlacement(side, COLS, -1)!;
    expect(diag.angle).toBe(1);
    expect(diag.target).toMatchObject({ ok: false, reason: 'bounds' });
    expect(diag.draft.find((x) => x.id === DRAFT_ID)).toMatchObject({ angle: 1 });
    expect(commitPlacement(diag)).toBeNull();
  });
  it('déplacer un meuble tourné garde son angle', () => {
    const l = placeStanding([], COLS, 'sofa', 0, 14, 'f1', 2)!;
    const p = startPlacement(l, COLS, { type: 'move', id: 'f1' }, CENTER);
    expect(p.angle).toBe(2);
    expect(commitPlacement(movePlacement(p, COLS, spotAt(10, 16)))![0]).toMatchObject({ angle: 2 });
  });
  it('les cases au sol du fantôme sont exposées (escalier compris)', () => {
    const p = rotatePlacement(startPlacement([], COLS, { type: 'new', kind: 'sofa' }, CENTER), COLS, 1)!;
    expect(placingView(p).floor).toHaveLength(12);
  });
  it('une fenêtre, une carte ou un ordinateur ne tournent pas', () => {
    expect(canRotate(startPlacement([], COLS, { type: 'new', kind: 'window' }, CENTER))).toBe(false);
    expect(rotatePlacement(startPlacement(desk, COLS, { type: 'new', kind: 'computer' }, CENTER), COLS, 1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/content/placement.test.ts`
Expected: FAIL — `rotatePlacement` non exporté.

- [ ] **Step 3: Implementation**

`furniture-drag.ts` — dans `DropTarget`, ajouter :

```ts
  // Meuble debout : ses cases au sol à l'arrivée (escalier compris en diagonale).
  floor?: Cell[];
```

Fin de `dropTargetFor` (meuble debout) :

```ts
  const angle = angleOf(item);
  const { w, h } = drawSize(item.kind, angle);
  const top = row - h + 1;
  const ghost: Rect = { col, row: top, w, h };
  const floor = floorCells(item.kind, angle, col, top);
  const check = canPlace(layout, cols, item.kind, col, top, id, angle);
  if (check.ok) return { ok: true, cells: [], ghost, floor, col, top };
  return { ok: false, reason: check.reason, cells: check.cells, ghost, floor, col, top };
```

et dans la branche `stored`, `shelfSlots(pxRect(shelfRect))[hit.slot]` devient `shelfSlotsOf(shelf)[hit.slot]` (retirer `sizeOf` des imports s'il ne sert plus).

`placement.ts` :

```ts
export type Placement = {
  // … champs existants …
  // Angle de l'objet (meubles debout) ; 0 pour ce qui ne tourne pas.
  angle: Angle;
};
export type PlacingView = { id: string; ok: boolean; ghost: Rect | null; ghostPx?: PxRect; floor?: Cell[] };
```

- `startPlacement` : `angle: subject.type === 'move' ? angleOf(layout.find((x) => x.id === subject.id) ?? layout[0]!) : 0` — écrire plutôt :
  ```ts
  const moved = subject.type === 'move' ? layout.find((x) => x.id === subject.id) : undefined;
  // … p0 = { …, angle: moved ? angleOf(moved) : 0 }
  ```
- `build` : `return moveStanding(base, cols, p.id, t.col, t.top, p.angle);` et `placeStanding(base, cols, kind, t.col, t.top, DRAFT_ID, p.angle)`.
- `force` : après `withItemAt(...)`, appliquer `setAngle(…, p.id, p.angle)` si l'objet est debout :
  ```ts
  if (item && 'col' in item && t.col !== undefined && t.top !== undefined) return setAngle(withItemAt(fresh, p.id, t.col, t.top), p.id, p.angle);
  ```
- `probeOf` reste à l'angle 0 (le `settle` remet l'angle par `setAngle` ci-dessous).
- `settle` : viser avec l'angle courant :
  ```ts
  function settle(p: Placement, cols: number, spot: Spot): Placement {
    const aimAt = setAngle(withProbe(p.draft, p.probe), p.id, p.angle);
    const target = aim(aimAt, cols, p, spot);
    // … reste inchangé
  }
  ```
  et dans `startPlacement`, la boucle `candidates` vise aussi `setAngle(aimAt, p0.id, p0.angle)`.
- Nouvelles fonctions :
  ```ts
  // Seuls les meubles debout tournent (pas les fenêtres, cartes, ordinateurs ni petits objets).
  export function canRotate(p: Placement): boolean {
    const item = withProbe(p.draft, p.probe).find((x) => x.id === p.id);
    return item !== undefined && isStanding(item);
  }

  // ⟲ (+1) / ⟳ (−1) : l'objet tourne sur place ; s'il ne tient pas à cet angle, il est dessiné tourné et refusé.
  export function rotatePlacement(p: Placement, cols: number, dir: 1 | -1): Placement | null {
    if (!canRotate(p)) return null;
    const angle = rotateAngle(p.angle, dir);
    return settle({ ...p, angle, draft: setAngle(p.draft, p.id, angle) }, cols, p.spot);
  }
  ```
- `placingView` : ajouter `...(p.target.floor ? { floor: p.target.floor } : {})`.
- `anchorOf`, `candidates`, `moveToItem` : remplacer `shelfSlots(pxRect(r))` par `shelfSlotsOf(shelf)` (avec l'objet étagère sous la main).

Note : `settle` garde `spot` comme case du coin bas gauche ; si le nouvel angle est plus large, il s'étend à droite.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/content/placement.test.ts` → PASS.
Run: `npm run test:famille -- scene-piece` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/furniture-drag.ts src/content/placement.ts tests/content/placement.test.ts
git commit -m "feat(bibliotheque): rotation pendant le placement (angle suivi, refus rouge, cases au sol du fantôme)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Animaux et lumière suivent l'angle

**Files:**
- Modify: `src/core/library/pets/walk-map.ts:24-31` (cases au sol), `src/core/library/pets/brain.ts:95,112,141` (`poisAt`)
- Modify: `src/core/library/light/occluders.ts` (`primBoxes` tourne les primitives)
- Test: `tests/core/library/pets-angle.test.ts` (nouveau ; famille `scene-animaux` : ajouter `'pets-angle.*'` dans sa liste), `tests/core/library/light-occluders.test.ts` (compléter, famille `scene-lumiere`)

**Interfaces:**
- Consumes: `floorCells`, `poisAt` (Tâche 1) ; `angleOf`, `rectOf` (Tâche 2).
- Produces: `buildWalkMap` bloque exactement les `floorCells` des meubles non creux ; `export function rotatedPrims(kind: Kind, angle: Angle): Prim[]` dans `occluders.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/core/library/pets-angle.test.ts
import { describe, expect, it } from 'vitest';
import { buildWalkMap } from '../../../src/core/library/pets/walk-map';
import { WALL_ROWS } from '../../../src/core/library/room-grid';

describe('carte de marche d’un meuble tourné', () => {
  it('bloque l’escalier, laisse libres les cases hors escalier', () => {
    const map = buildWalkMap([{ id: 'a', kind: 'sofa', col: 0, row: 14, angle: 1 }], 24);
    expect(map.blocked[16 - WALL_ROWS]![0]).toBe(false);
    expect(map.blocked[16 - WALL_ROWS]![4]).toBe(true);
    expect(map.blocked[14 - WALL_ROWS]![0]).toBe(true);
  });
});
```

Dans `tests/core/library/light-occluders.test.ts` :

```ts
import { rotatedPrims } from '../../../src/core/library/light/occluders';

it('de profil, largeur et profondeur des primitives sont échangées', () => {
  const front = rotatedPrims('sofa', 0);
  const side = rotatedPrims('sofa', 2);
  expect(side).toHaveLength(front.length);
  // le dossier (profondeur 0,7→1 depuis l'avant) passe à droite, sur toute la largeur du profil
  expect(side[1]).toEqual([0.7, 1, 0.5, 1, 0, 1]);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/core/library/pets-angle.test.ts tests/core/library/light-occluders.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementation**

`walk-map.ts` — remplacer la double boucle de blocage par :

```ts
      if (!underOf(p.kind)) {
        for (const c of floorCells(p.kind, angleOf(p), p.col, p.row)) {
          if (c.row >= WALL_ROWS && c.row < ROWS && c.col >= 0 && c.col < cols) blocked[c.row - WALL_ROWS]![c.col] = true;
        }
      }
```

`brain.ts` — partout où `poisOf(p.kind)` sert à placer un point (`p.col + q.dx`, `p.row + q.dy`), utiliser `poisAt(p.kind, angleOf(p))` (lignes 95, 112, 141).

`occluders.ts` :

```ts
// Primitives tournées (silhouette provisoire en attendant les dessins de Fable) : de profil, largeur et profondeur s'échangent
// (2 : l'avant à gauche, 6 : l'avant à droite) ; de dos, tout est retourné ; en diagonale, la silhouette de face.
export function rotatedPrims(kind: Kind, angle: Angle): Prim[] {
  const prims = PRIMS[kind];
  if (angle === 2) return prims.map(([x0, x1, z0, z1, d0, d1]) => [d0, d1, z0, z1, 1 - x1, 1 - x0] as const);
  if (angle === 6) return prims.map(([x0, x1, z0, z1, d0, d1]) => [1 - d1, 1 - d0, z0, z1, x0, x1] as const);
  if (angle === 4) return prims.map(([x0, x1, z0, z1, d0, d1]) => [1 - x1, 1 - x0, z0, z1, 1 - d1, 1 - d0] as const);
  return [...prims];
}
```

et `primBoxes(owner, kind, r, dFront, angle)` lit `rotatedPrims(kind, angle)` ; l'appel dans `boxesOf` passe `angleOf(p)`.

- [ ] **Step 4: Run tests**

Run: `npm run test:famille -- scene-animaux scene-lumiere` → PASS (les empreintes de référence de la lumière ne bougent pas : tout est à l'angle 0).

- [ ] **Step 5: Commit**

```bash
git add src/core/library/pets src/core/library/light tests/core/library tests/familles.ts
git commit -m "feat(bibliotheque): animaux et ombres suivent l'angle des meubles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Volumes et projecteur des angles

**Files:**
- Create: `src/core/library/furniture-volumes.ts`, `src/core/library/furniture-projection.ts`
- Test: `tests/core/library/furniture-projection.test.ts` (famille `scene-piece` : ajouter `'furniture-projection.*'`)

**Interfaces:**
- Consumes: `Angle`, `FACE_MARGIN` (Tâche 1) ; `type Palette` de `styles.ts` ; `PxRect`.
- Produces:
  - `export type Part = { u0: number; u1: number; h0: number; h1: number; d0: number; d1: number; fill: keyof Palette; round?: boolean }` (u : largeur depuis la gauche, h : hauteur depuis le sol, d : profondeur depuis l'avant ; fractions 0-1)
  - `export const VOLUMES: Record<StandingKind, Part[]>`
  - `export type Face = { points: [number, number][]; fill: keyof Palette; shade: number; round: boolean }`
  - `export function projectParts(parts: readonly Part[], angle: Angle, rect: PxRect): Face[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/library/furniture-projection.test.ts
import { describe, expect, it } from 'vitest';
import { STANDING_KINDS } from '../../../src/core/library/library-types';
import { VOLUMES } from '../../../src/core/library/furniture-volumes';
import { projectParts } from '../../../src/core/library/furniture-projection';

const rect = { x: 100, y: 50, w: 180, h: 120 };
const ANGLES = [1, 2, 3, 4, 5, 6, 7] as const;

describe('projecteur', () => {
  it.each(STANDING_KINDS)('%s : faces finies, dans le rectangle, à chaque angle', (kind) => {
    for (const a of ANGLES) {
      const faces = projectParts(VOLUMES[kind], a, rect);
      expect(faces.length).toBeGreaterThan(0);
      for (const f of faces) for (const [x, y] of f.points) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(rect.x - 0.001);
        expect(x).toBeLessThanOrEqual(rect.x + rect.w + 0.001);
        expect(y).toBeGreaterThanOrEqual(rect.y - 0.001);
        expect(y).toBeLessThanOrEqual(rect.y + rect.h + 0.001);
      }
    }
  });
  it('7 est le miroir de 1, 3 celui de 5', () => {
    const mirror = (pts: [number, number][]) => pts.map(([x, y]) => [Math.round((2 * rect.x + rect.w - x) * 1000) / 1000, Math.round(y * 1000) / 1000]);
    const round = (pts: [number, number][]) => pts.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
    const one = projectParts(VOLUMES.sofa, 1, rect).map((f) => mirror(f.points));
    const seven = projectParts(VOLUMES.sofa, 7, rect).map((f) => round(f.points));
    expect(seven).toEqual(one);
    const five = projectParts(VOLUMES.sofa, 5, rect).map((f) => mirror(f.points));
    expect(projectParts(VOLUMES.sofa, 3, rect).map((f) => round(f.points))).toEqual(five);
  });
  it('de profil, aucune face avant ; en ¾, la face avant du corps occupe 70 % à gauche', () => {
    expect(projectParts(VOLUMES.shelf, 2, rect).some((f) => f.shade === 1)).toBe(false);
    const box = [{ u0: 0, u1: 1, h0: 0, h1: 1, d0: 0, d1: 1, fill: 'wood' as const }];
    const fronts = projectParts(box, 1, rect).filter((f) => f.shade === 1);
    expect(Math.max(...fronts.flatMap((f) => f.points.map(([x]) => x)))).toBeCloseTo(rect.x + rect.w * 0.7, 3);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/core/library/furniture-projection.test.ts` → FAIL (modules absents).

- [ ] **Step 3: Implementation**

```ts
// src/core/library/furniture-volumes.ts
// Dessin provisoire Opus — reprise Fable prévue.
import type { StandingKind } from './library-types';
import type { Palette } from './styles';

// Un volume d'un meuble : u largeur depuis la gauche, h hauteur depuis le sol, d profondeur depuis l'avant (fractions 0-1).
export type Part = { u0: number; u1: number; h0: number; h1: number; d0: number; d1: number; fill: keyof Palette; round?: boolean };

const P = (u0: number, u1: number, h0: number, h1: number, d0: number, d1: number, fill: keyof Palette, round = false): Part => ({ u0, u1, h0, h1, d0, d1, fill, round });

const legs = (h: number, fill: keyof Palette, inset = 0.04, size = 0.06): Part[] => [
  P(inset, inset + size, 0, h, 0, 0.15, fill), P(1 - inset - size, 1 - inset, 0, h, 0, 0.15, fill),
  P(inset, inset + size, 0, h, 0.85, 1, fill), P(1 - inset - size, 1 - inset, 0, h, 0.85, 1, fill),
];
const seat = (body: keyof Palette, light: keyof Palette, dark: keyof Palette): Part[] => [
  P(0, 1, 0, 0.5, 0, 1, body, true), P(0, 1, 0.5, 1, 0.7, 1, body, true),
  P(0, 0.12, 0.5, 0.72, 0, 0.7, dark, true), P(0.88, 1, 0.5, 0.72, 0, 0.7, dark, true),
  P(0.12, 0.88, 0.5, 0.6, 0, 0.7, light, true),
];

export const VOLUMES: Record<StandingKind, Part[]> = {
  shelf: [
    P(0, 1, 0, 1, 0.92, 1, 'woodDark'), P(0, 0.05, 0, 1, 0, 1, 'wood'), P(0.95, 1, 0, 1, 0, 1, 'wood'),
    P(0, 1, 0.97, 1, 0, 1, 'wood'), P(0, 1, 0.64, 0.67, 0, 1, 'wood'), P(0, 1, 0.32, 0.35, 0, 1, 'wood'), P(0, 1, 0, 0.03, 0, 1, 'wood'),
  ],
  desk: [...legs(0.84, 'leg'), P(0, 1, 0.84, 1, 0, 1, 'desk')],
  chair: [...legs(0.4, 'leg', 0.1, 0.1), P(0.1, 0.9, 0.4, 0.5, 0, 1, 'desk'), P(0.1, 0.9, 0.5, 1, 0.85, 1, 'wood')],
  sofa: seat('fabric', 'fabricLight', 'fabricDark'),
  armchair: seat('warm', 'warmLight', 'warmDark'),
  basket: [P(0, 1, 0, 0.5, 0, 1, 'warm', true), P(0.1, 0.9, 0.35, 0.5, 0.1, 0.9, 'fabricLight', true)],
  bowl: [P(0, 1, 0, 0.5, 0, 1, 'metal', true)],
  kennel: [P(0, 1, 0, 0.7, 0, 1, 'wood'), P(0, 1, 0.7, 1, 0, 1, 'door'), P(0.35, 0.65, 0, 0.5, 0, 0.02, 'woodDark')],
  charger: [P(0, 1, 0, 0.3, 0, 1, 'metal')],
  plant: [P(0.2, 0.8, 0, 0.25, 0.2, 0.8, 'warm'), P(0.1, 0.9, 0.25, 1, 0.1, 0.9, 'leaf', true)],
  lamp: [P(0.1, 0.9, 0, 0.05, 0.2, 0.8, 'metal'), P(0.45, 0.55, 0.05, 0.83, 0.45, 0.55, 'metal'), P(0, 1, 0.83, 1, 0.2, 0.8, 'shade', true)],
  'coffee-table': [...legs(0.66, 'leg', 0.08), P(0, 1, 0.66, 1, 0, 1, 'desk')],
  rug: [P(0, 1, 0, 0.04, 0, 1, 'rug')],
  globe: [P(0.2, 0.8, 0, 0.08, 0.2, 0.8, 'wood'), P(0.45, 0.55, 0.08, 0.35, 0.45, 0.55, 'wood'), P(0.1, 0.9, 0.35, 1, 0.1, 0.9, 'metal', true)],
  telescope: [P(0.3, 0.7, 0, 0.55, 0.3, 0.7, 'wood'), P(0, 1, 0.55, 0.8, 0.35, 0.65, 'metal', true)],
  automaton: [P(0.25, 0.75, 0, 0.25, 0.3, 0.7, 'woodDark'), P(0.2, 0.8, 0.25, 0.75, 0.2, 0.8, 'metal'), P(0.3, 0.7, 0.75, 1, 0.3, 0.7, 'metal', true)],
};
```

```ts
// src/core/library/furniture-projection.ts
import { FACE_MARGIN, type Angle } from './footprint';
import type { Part } from './furniture-volumes';
import type { PxRect } from './room-grid';
import type { Palette } from './styles';

// Une face projetée : polygone, couleur, ombrage (1 face avant, 0,82 côté, 1,12 dessus).
export type Face = { points: [number, number][]; fill: keyof Palette; shade: number; round: boolean };

const SHADE = { front: 1, side: 0.82, top: 1.12 } as const;

// Retourner le meuble d'un demi-tour (dos face à nous) : gauche ↔ droite et avant ↔ arrière.
const flip = (p: Part): Part => ({ ...p, u0: 1 - p.u1, u1: 1 - p.u0, d0: 1 - p.d1, d1: 1 - p.d0 });

// Vues de base : 0 face, 1 ¾ (face 70 %, côté droit 30 %), 2 profil (côté droit seul, avant à gauche).
// x = u·F + d·S (en largeur), y monte avec la profondeur (le fond est plus haut, comme le sol de la pièce).
function project(parts: readonly Part[], base: 0 | 1 | 2, r: PxRect): Face[] {
  const F = base === 0 ? 1 : base === 1 ? 0.7 : 0;
  const S = base === 0 ? 0 : base === 1 ? 0.3 : 1;
  const M = base === 0 ? 0 : FACE_MARGIN * r.h;
  const pt = (u: number, d: number, h: number): [number, number] => [r.x + r.w * (u * F + d * S), r.y + r.h - d * M - h * (r.h - M)];
  // Du plus loin au plus proche : le fond d'abord, puis de gauche à droite, puis de bas en haut.
  const order = [...parts].sort((a, b) => b.d1 - a.d1 || a.u1 - b.u1 || a.h0 - b.h0);
  const faces: Face[] = [];
  for (const p of order) {
    const round = p.round ?? false;
    if (M > 0) faces.push({ points: [pt(p.u0, p.d0, p.h1), pt(p.u1, p.d0, p.h1), pt(p.u1, p.d1, p.h1), pt(p.u0, p.d1, p.h1)], fill: p.fill, shade: SHADE.top, round });
    if (S > 0) faces.push({ points: [pt(p.u1, p.d0, p.h0), pt(p.u1, p.d1, p.h0), pt(p.u1, p.d1, p.h1), pt(p.u1, p.d0, p.h1)], fill: p.fill, shade: SHADE.side, round });
    if (F > 0) faces.push({ points: [pt(p.u0, p.d0, p.h0), pt(p.u1, p.d0, p.h0), pt(p.u1, p.d0, p.h1), pt(p.u0, p.d0, p.h1)], fill: p.fill, shade: SHADE.front, round });
  }
  return faces;
}

const mirrorFaces = (faces: Face[], r: PxRect): Face[] =>
  faces.map((f) => ({ ...f, points: f.points.map(([x, y]) => [2 * r.x + r.w - x, y] as [number, number]) }));

// 0-2 : vues de base ; 4-6 : les mêmes, meuble retourné ; 7 = miroir de 1, 3 = miroir de 5.
export function projectParts(parts: readonly Part[], angle: Angle, rect: PxRect): Face[] {
  if (angle <= 2) return project(parts, angle as 0 | 1 | 2, rect);
  if (angle >= 4 && angle <= 6) return project(parts.map(flip), (angle - 4) as 0 | 1 | 2, rect);
  return mirrorFaces(projectParts(parts, angle === 7 ? 1 : 5, rect), rect);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/library/furniture-projection.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/furniture-volumes.ts src/core/library/furniture-projection.ts tests/core/library/furniture-projection.test.ts tests/familles.ts
git commit -m "feat(bibliotheque): volumes et projecteur des 7 angles tournés (dessins provisoires Opus)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Dessin des meubles tournés dans la pièce

**Files:**
- Create: `src/content/furniture-angled.tsx`
- Modify: `src/content/RoomView.tsx` (`artOf`, `cardArtOf`, `shelfRects` → `shelfSlotsOf`, fantôme `floor`)
- Test: `tests/content/room-angle.test.tsx` (nouveau ; famille `scene-piece` : ajouter `'room-angle.*'` dans `c(...)`)

**Interfaces:**
- Consumes: `projectParts`, `VOLUMES` (Tâche 6) ; `angleOf`, `shelfSlotsOf` (Tâche 3) ; `frontFaceRect` (Tâche 1) ; `PlacingView.floor`, `DropTarget.floor` (Tâche 4).
- Produces:
  - `export function AngledFurnitureArt({ kind, angle, rect, palette, lit }: { kind: StandingKind; angle: Angle; rect: PxRect; palette: Palette; lit?: boolean }): ReactElement`
  - `export function ComputerBackArt({ rect, side }: { rect: PxRect; side: boolean }): ReactElement`
  - `export function shadeHex(hex: string, factor: number): string`
  - `RoomView` : attribut `data-angle` sur le groupe `[data-furniture]` d'un meuble debout tourné ; rectangles `[data-floor-cell]` pour les cases au sol du fantôme. `DragView` gagne `floor?: Cell[]`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/content/room-angle.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import type { Layout, Room } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(layout: Layout, extra: Partial<Parameters<typeof RoomView>[0]> = {}) {
  const room: Room = { id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout };
  const container = document.createElement('div');
  document.body.append(container);
  act(() => {
    createRoot(container).render(
      <RoomView room={room} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined}
        cards={{ Daft_Punk: { title: 'Daft Punk' }, Paris: { title: 'Paris' } }} {...extra} />,
    );
  });
  return container;
}

describe('meubles tournés', () => {
  it('un canapé tourné est dessiné par le projecteur (polygones) avec son angle', () => {
    const c = mount([{ id: 'a', kind: 'sofa', col: 2, row: 14, angle: 1 }]);
    const g = c.querySelector('[data-furniture="sofa"]')!;
    expect(g.getAttribute('data-angle')).toBe('1');
    expect(g.querySelectorAll('polygon, path[data-face]').length).toBeGreaterThan(3);
  });
  it('de face : le dessin d’origine, sans data-angle', () => {
    const c = mount([{ id: 'a', kind: 'sofa', col: 2, row: 14 }]);
    expect(c.querySelector('[data-furniture="sofa"]')!.hasAttribute('data-angle')).toBe(false);
  });
  it('les cartes rangées sont visibles de face et de ¾, cachées de profil', () => {
    const stored = { id: 'c', kind: 'stored', shape: 'cd', shelfId: 's', slot: 0, slug: 'Daft_Punk' } as const;
    expect(mount([{ id: 's', kind: 'shelf', col: 0, row: 6, angle: 1 }, stored]).querySelector('[data-card="Daft_Punk"]')).not.toBeNull();
    expect(mount([{ id: 's', kind: 'shelf', col: 0, row: 6, angle: 2 }, stored]).querySelector('[data-card="Daft_Punk"]')).toBeNull();
  });
  it('l’écran d’un bureau de dos n’est ni dessiné ni touchable', () => {
    const c = mount([{ id: 'd', kind: 'desk', col: 2, row: 11, angle: 4 }, { id: 'pc', kind: 'computer', deskId: 'd', slug: 'Paris' }]);
    expect(c.querySelector('[data-screen]')).toBeNull();
    expect(c.querySelector('[data-computer-back]')).not.toBeNull();
  });
  it('le fantôme montre ses cases au sol', () => {
    const c = mount([{ id: 'a', kind: 'sofa', col: 2, row: 14, angle: 1 }], {
      editing: true,
      placing: { id: 'a', ok: false, ghost: { col: 2, row: 14, w: 7, h: 3 }, floor: [{ col: 2, row: 14 }, { col: 3, row: 14 }] },
    });
    expect(c.querySelectorAll('[data-floor-cell="refused"]')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/content/room-angle.test.tsx` → FAIL.

- [ ] **Step 3: Implementation**

```tsx
// src/content/furniture-angled.tsx
// Dessin provisoire Opus — reprise Fable prévue.
import type { ReactElement } from 'react';
import type { Angle } from '../core/library/footprint';
import { projectParts } from '../core/library/furniture-projection';
import { VOLUMES } from '../core/library/furniture-volumes';
import type { StandingKind } from '../core/library/library-types';
import type { PxRect } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';

// Éclaircit (> 1) ou assombrit (< 1) une couleur #RRGGBB.
export function shadeHex(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

// Meuble tourné (angles 1 à 7) : faces projetées, aplats + trait encré (style cellulo).
export function AngledFurnitureArt({ kind, angle, rect, palette, lit = true }: { kind: StandingKind; angle: Angle; rect: PxRect; palette: Palette; lit?: boolean }): ReactElement {
  if (kind === 'rug') {
    // Tapis : un losange au sol en diagonale, un rectangle sinon.
    const { x, y, w, h } = rect;
    const pts = angle % 2 === 1 ? `${x + w * 0.25},${y} ${x + w},${y + h * 0.3} ${x + w * 0.75},${y + h} ${x},${y + h * 0.7}` : `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`;
    return <polygon points={pts} fill={palette.rug} stroke={palette.edge} strokeWidth={1.5} strokeLinejoin="round" />;
  }
  const faces = projectParts(VOLUMES[kind], angle, rect);
  return (
    <g>
      {faces.map((f, i) => (
        <polygon key={i} data-face="" points={f.points.map(([px, py]) => `${px},${py}`).join(' ')}
          fill={shadeHex(kind === 'lamp' && f.fill === 'shade' && lit ? '#FFE9A8' : palette[f.fill], f.shade)}
          stroke={palette.edge} strokeWidth={1.2} strokeLinejoin="round" />
      ))}
    </g>
  );
}

// Écran vu de dos (gris, sans image) ou de profil (tranche fine).
export function ComputerBackArt({ rect, side }: { rect: PxRect; side: boolean }): ReactElement {
  const w = side ? 6 : rect.w;
  const x = rect.x + (rect.w - w) / 2;
  const screenH = rect.h - 12;
  return (
    <g data-computer-back="">
      <rect x={x} y={rect.y} width={w} height={screenH} rx={3} fill="#3A3A40" stroke="#1D1D22" strokeWidth={1} />
      <rect x={rect.x + rect.w / 2 - 4} y={rect.y + screenH} width={8} height={rect.h - screenH - 4} fill="#555555" />
      <rect x={rect.x + rect.w / 2 - (side ? 6 : 17)} y={rect.y + rect.h - 4} width={side ? 12 : 34} height={4} rx={2} fill="#555555" />
    </g>
  );
}
```

`RoomView.tsx` :

1. Imports : `angleOf, shelfSlotsOf` depuis `room-grid` ; `frontFaceRect` depuis `../core/library/footprint` ; `AngledFurnitureArt, ComputerBackArt` depuis `./furniture-angled` ; `Cell` est déjà importé.
2. Dans `artOf`, juste après `const rect = pxRect(cells);` (meubles debout) :
   ```tsx
   const angle = angleOf(placed);
   if (angle !== 0) {
     // Meuble Steampunk dans une autre pièce : pas dessiné (comme de face).
     if (!steampunk && (placed.kind === 'globe' || placed.kind === 'telescope' || placed.kind === 'automaton')) return null;
     return { rect, art: <AngledFurnitureArt kind={placed.kind} angle={angle} rect={rect} palette={palette} lit={isLit(placed)} /> };
   }
   ```
3. Ordinateur dans `artOf` : remplacer le calcul de `rect` par :
   ```tsx
   const deskItem = room.layout.find((p) => p.id === placed.deskId);
   const deskAngle = deskItem ? angleOf(deskItem) : 0;
   const face = frontFaceRect(deskAngle, desk);
   if (!face) return { rect: computerRect(desk), art: <ComputerBackArt rect={computerRect(desk)} side={deskAngle === 2 || deskAngle === 6} /> };
   const rect = computerRect(face);
   ```
4. `cardArtOf` : objet rangé → `const shelf = room.layout.find((p) => p.id === placed.shelfId); if (!shelf || !frontFaceRect(angleOf(shelf), { x: 0, y: 0, w: 1, h: 1 })) return null; const rect = shelfSlotsOf(shelf)[placed.slot];` ; écran → même calcul `face` que ci-dessus, `return null` si `face` est null, sinon `const full = computerRect(face);`.
5. `ShelfArt` (angle 0) garde `shelfSlots(rect)` ; la map `shelfRects` reste pour l'ancrage de la copie soulevée.
6. Sur le `<g data-furniture>` de `renderPlaced` : `data-angle={isStanding(placed) && angleOf(placed) !== 0 ? angleOf(placed) : undefined}`.
7. `DragView` : ajouter `floor?: Cell[]`. Avant le rectangle `ghostView.ghost`, dessiner les cases au sol :
   ```tsx
   {ghostView?.floor?.map((c) => (
     <rect key={`floor-${c.col}-${c.row}`} data-floor-cell={ghostView.ok ? 'ok' : 'refused'} x={c.col * CELL_W + 1} y={c.row * CELL_H + 1} width={CELL_W - 2} height={CELL_H - 2} rx={3}
       fill={ghostView.ok ? '#3BB273' : '#E24B4A'} fillOpacity={0.35} style={{ pointerEvents: 'none' }} />
   ))}
   ```
   et le contour `ghostView.ghost` passe en `fillOpacity={0.08}` quand `ghostView.floor` existe (les cases au sol portent la couleur).
8. Dans `LibraryPanel.tsx`, là où `DragView` est construit à partir d'un `DropTarget` (glisser), recopier `floor`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/content/room-angle.test.tsx` → PASS ; `npm run test:famille -- scene-piece` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/furniture-angled.tsx src/content/RoomView.tsx src/content/LibraryPanel.tsx tests/content/room-angle.test.tsx tests/familles.ts
git commit -m "feat(bibliotheque): dessin des meubles tournés, cartes et écran selon l'angle, cases au sol du fantôme

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sélecteurs ⟲ ⟳ dans la barre de placement et la bulle

**Files:**
- Modify: `src/content/library-ui.tsx` (`ICONS.rotateLeft`, `ICONS.rotateRight`, `ICONS.back`)
- Modify: `src/content/LibraryPanel.tsx` (barre `PlacementBar`, bulle `ActionBubble`)
- Test: `tests/content/library-placement.test.tsx` (compléter)

**Interfaces:**
- Consumes: `rotatePlacement`, `canRotate` (Tâche 4).
- Produces: boutons `[data-action="rotate-left"]` et `[data-action="rotate-right"]` ; `ICONS.back` (utilisé Tâche 9).

- [ ] **Step 1: Write the failing tests** (reprendre les aides `click`, `seed`, `layoutNow`, `confirm` déjà présentes dans `library-placement.test.tsx` ; les ajouter si absentes, comme dans `library-cards.test.tsx`)

```tsx
describe('rotation', () => {
  it('⟲ dans la barre tourne le meuble neuf, ✓ enregistre l’angle', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="sofa"]');
    await click('[data-action="rotate-left"]');
    await click('[data-action="place-confirm"]');
    expect(layoutNow().find((p) => p.kind === 'sofa')).toMatchObject({ angle: 1 });
  });
  it('⟳ tourne vers la droite (angle 7)', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="sofa"]');
    await click('[data-action="rotate-right"]');
    await click('[data-action="place-confirm"]');
    expect(layoutNow().find((p) => p.kind === 'sofa')).toMatchObject({ angle: 7 });
  });
  it('la bulle d’un meuble posé propose ⟲ ⟳ ; ils ouvrent le placement déjà tourné, rien n’est enregistré avant ✓', async () => {
    await seed([{ id: 'f1', kind: 'sofa', col: 2, row: 14 }]);
    await click('[data-action="edit"]');
    await click('[data-furniture="sofa"]');
    await click('[data-action="rotate-left"]');
    expect(layoutNow()[0]).not.toHaveProperty('angle');
    expect(q('[data-placement-bar]')).not.toBeNull();
    await click('[data-action="place-confirm"]');
    expect(layoutNow()[0]).toMatchObject({ angle: 1 });
  });
  it('pas de ⟲ ⟳ pour une fenêtre', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="window"]');
    expect(q('[data-action="rotate-left"]')).toBeNull();
  });
});
```

(Les sélecteurs `[data-kind="sofa"]` et `[data-kind="window"]` sont ceux des vignettes du tiroir ; vérifier le nom exact dans `build-drawer.tsx` et l'onglet à ouvrir — les canapés sont dans l'onglet `seats` : ajouter `await click('[data-category="seats"]')` si nécessaire.)

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/content/library-placement.test.tsx` → FAIL (bouton introuvable).

- [ ] **Step 3: Implementation**

`library-ui.tsx`, dans `ICONS` :

```ts
  rotateLeft: ['M3 12a9 9 0 1 0 3-6.7', 'M3 3v6h6'],
  rotateRight: ['M21 12a9 9 0 1 1-3-6.7', 'M21 3v6h-6'],
  back: ['M19 12H5', 'M12 19l-7-7 7-7'],
```

`LibraryPanel.tsx` :

```tsx
  // ⟲ / ⟳ pendant le placement : tourne le fantôme d'un cran (refusé en rouge s'il ne tient pas).
  const rotatePlacing = (dir: 1 | -1): void => {
    if (!placement) return;
    const next = rotatePlacement(placement, room.cols, dir);
    if (next) showPlacement(next);
  };
  // ⟲ / ⟳ dans la bulle : ouvre le placement du meuble sélectionné, déjà tourné.
  const rotateSelected = (dir: 1 | -1): void => {
    if (!selectedId) return;
    const start = startPlacement(layout, room.cols, { type: 'move', id: selectedId }, centerSpot());
    reset();
    showPlacement(rotatePlacement(start, room.cols, dir) ?? start);
  };
```

Dans `PlacementBar`, en premier enfant :

```tsx
            {canRotate(placement) && (
              <>
                <Btn label="Tourner à gauche" data={{ action: 'rotate-left' }} onClick={() => rotatePlacing(1)}><Icon paths={ICONS.rotateLeft} /></Btn>
                <Btn label="Tourner à droite" data={{ action: 'rotate-right' }} onClick={() => rotatePlacing(-1)}><Icon paths={ICONS.rotateRight} /></Btn>
              </>
            )}
```

Dans `ActionBubble`, après « Retirer », pour tout meuble debout sélectionné, tapis compris (`selectedItem && isStanding(selectedItem)`) :

```tsx
            {selectedItem && isStanding(selectedItem) && (
              <>
                <Btn label="Tourner à gauche" data={{ action: 'rotate-left' }} onClick={() => rotateSelected(1)}><Icon paths={ICONS.rotateLeft} /></Btn>
                <Btn label="Tourner à droite" data={{ action: 'rotate-right' }} onClick={() => rotateSelected(-1)}><Icon paths={ICONS.rotateRight} /></Btn>
              </>
            )}
```

(`rotateSelected` appelle `reset()` après avoir calculé `start`, car `reset` efface `selectedId`.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/content/library-placement.test.tsx tests/content/placement-bar.test.tsx` → PASS ; `npm run test:famille -- scene-piece` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/library-ui.tsx src/content/LibraryPanel.tsx tests/content/library-placement.test.tsx
git commit -m "feat(bibliotheque): sélecteurs tourner à gauche / à droite (barre de placement et bulle)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Cible, caméra et calque du zoom

**Files:**
- Create: `src/core/library/zoom-target.ts`
- Create: `src/content/furniture-zoom.tsx`
- Test: `tests/core/library/zoom-target.test.ts` (famille `scene-piece` : `'zoom-target.*'` dans `lib(...)`), `tests/content/furniture-zoom.test.tsx` (`'furniture-zoom.*'` dans `c(...)`)

**Interfaces:**
- Consumes: `angleOf`, `rectOf`, `pxRect`, `shelfSlots`, `computerRect`, `SURFACE_SLOTS`, `surfaceSlotRect` (room-grid) ; `sizeOf` ; `AngledFurnitureArt` (Tâche 7) ; `ShelfArt`, `DeskArt`, `ComputerArt` ; `SteampunkArt`, `AnalyticalEngineArt` ; `SmallArt` ; `ShelfItemArt` ; `ICONS.back` (Tâche 8).
- Produces:
  - `export type ZoomTarget = { kind: 'shelf' | 'desk'; id: string }`
  - `export function zoomTargetOf(layout: Layout, id: string): ZoomTarget | null`
  - `export type Box = { x: number; y: number; w: number; h: number }`
  - `export function cameraOf(stage: { w: number; h: number }, target: Box, scale?: number): { tx: number; ty: number; scale: number }`
  - `export function zoomRectOf(stage: { w: number; h: number }, aspect: number): Box`
  - `export type ZoomPhase = 'opening' | 'open' | 'closing'`
  - `export function FurnitureZoom(props: ZoomProps): ReactElement` avec
    `type ZoomProps = { target: ZoomTarget; room: Room; cards: Record<string, { title: string; imageUrl?: string }>; imageOf: (slug: string) => string | undefined; phase: ZoomPhase; from: Box | null; stage: { w: number; h: number }; onCard: (slug: string) => void; onBack: () => void }`
  - Attributs : `[data-furniture-zoom]` (avec `data-zoom-phase`, `data-zoom-face="angled"|"front"`), `[data-action="zoom-back"]`, `[data-zoom-card=<slug>]`, `[data-zoom-backdrop]`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/core/library/zoom-target.test.ts
import { describe, expect, it } from 'vitest';
import { cameraOf, zoomRectOf, zoomTargetOf } from '../../../src/core/library/zoom-target';
import type { Layout } from '../../../src/core/library/library-types';

const shelf = { id: 's', kind: 'shelf', col: 0, row: 6 } as const;
const desk = { id: 'd', kind: 'desk', col: 8, row: 11 } as const;

describe('zoomTargetOf', () => {
  it('étagère avec une carte (même inconnue) → zoom ; vide → rien', () => {
    expect(zoomTargetOf([shelf], 's')).toBeNull();
    const l: Layout = [shelf, { id: 'c', kind: 'stored', shape: 'cd', shelfId: 's', slot: 0, slug: 'Inconnue' }];
    expect(zoomTargetOf(l, 's')).toEqual({ kind: 'shelf', id: 's' });
    expect(zoomTargetOf(l, 'c')).toEqual({ kind: 'shelf', id: 's' });
  });
  it('bureau : seulement si son ordinateur affiche une carte ; l’ordinateur vise son bureau', () => {
    expect(zoomTargetOf([desk, { id: 'pc', kind: 'computer', deskId: 'd' }], 'd')).toBeNull();
    const l: Layout = [desk, { id: 'pc', kind: 'computer', deskId: 'd', slug: 'Paris' }];
    expect(zoomTargetOf(l, 'd')).toEqual({ kind: 'desk', id: 'd' });
    expect(zoomTargetOf(l, 'pc')).toEqual({ kind: 'desk', id: 'd' });
  });
  it('autres meubles, cartes au mur, id inconnu → rien', () => {
    expect(zoomTargetOf([{ id: 'a', kind: 'sofa', col: 0, row: 14 }], 'a')).toBeNull();
    expect(zoomTargetOf([{ id: 'w', kind: 'wall', shape: 'poster', col: 0, row: 2, slug: 'Paris' }], 'w')).toBeNull();
    expect(zoomTargetOf([], 'x')).toBeNull();
  });
});

describe('caméra et cadre', () => {
  it('amène le centre du meuble au centre de la scène', () => {
    const cam = cameraOf({ w: 800, h: 400 }, { x: 100, y: 100, w: 100, h: 100 });
    expect(cam.scale).toBe(1.6);
    expect(150 * cam.scale + cam.tx).toBeCloseTo(400);
    expect(150 * cam.scale + cam.ty).toBeCloseTo(200);
  });
  it('cadre final : 80 % de la hauteur, largeur bornée à 90 %, centré', () => {
    expect(zoomRectOf({ w: 800, h: 400 }, 0.75)).toEqual({ x: 280, y: 40, w: 240, h: 320 });
    const wide = zoomRectOf({ w: 300, h: 400 }, 2);
    expect(wide.w).toBeCloseTo(270);
    expect(wide.x).toBeCloseTo(15);
  });
});
```

```tsx
// tests/content/furniture-zoom.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { FurnitureZoom } from '../../src/content/furniture-zoom';
import type { Room } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const room: Room = {
  id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [],
  layout: [
    { id: 's', kind: 'shelf', col: 0, row: 6, angle: 2 },
    { id: 'c1', kind: 'stored', shape: 'cd', shelfId: 's', slot: 0, slug: 'Daft_Punk' },
    { id: 'c2', kind: 'stored', shape: 'book', shelfId: 's', slot: 4, slug: 'Inconnue' },
  ],
};

function mount(phase: 'opening' | 'open' | 'closing', onCard = vi.fn(), onBack = vi.fn()) {
  const container = document.createElement('div');
  document.body.append(container);
  act(() => {
    createRoot(container).render(
      <FurnitureZoom target={{ kind: 'shelf', id: 's' }} room={room} cards={{ Daft_Punk: { title: 'Daft Punk' } }} imageOf={() => undefined}
        phase={phase} from={{ x: 10, y: 20, w: 60, h: 160 }} stage={{ w: 800, h: 400 }} onCard={onCard} onBack={onBack} />,
    );
  });
  return { container, onCard, onBack };
}

describe('calque du zoom', () => {
  it('ouvert : vue de face avec les 15 emplacements et les cartes, même si l’étagère est de profil', () => {
    const { container } = mount('open');
    const zoom = container.querySelector('[data-furniture-zoom]')!;
    expect(zoom.getAttribute('data-zoom-face')).toBe('front');
    expect(container.querySelector('[data-zoom-card="Daft_Punk"]')).not.toBeNull();
    expect(container.querySelector('[data-zoom-card="Inconnue"]')).not.toBeNull();
  });
  it('toucher une carte connue la signale ; une inconnue ne fait rien', () => {
    const { container, onCard } = mount('open');
    act(() => { container.querySelector('[data-zoom-card="Daft_Punk"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onCard).toHaveBeenCalledWith('Daft_Punk');
    act(() => { container.querySelector('[data-zoom-card="Inconnue"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onCard).toHaveBeenCalledTimes(1);
  });
  it('← et le fond flouté appellent onBack', () => {
    const { container, onBack } = mount('open');
    act(() => { container.querySelector<HTMLButtonElement>('[data-action="zoom-back"]')!.click(); });
    act(() => { container.querySelector('[data-zoom-backdrop]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onBack).toHaveBeenCalledTimes(2);
  });
  it('à l’ouverture d’un meuble tourné, la première moitié montre le meuble sous son angle', () => {
    const { container } = mount('opening');
    expect(container.querySelector('[data-furniture-zoom]')!.getAttribute('data-zoom-face')).toBe('angled');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/core/library/zoom-target.test.ts tests/content/furniture-zoom.test.tsx` → FAIL.

- [ ] **Step 3: Implementation**

```ts
// src/core/library/zoom-target.ts
import type { Layout } from './library-types';

// Meuble qui ouvre la vue zoomée : une étagère qui range au moins une carte, ou un bureau dont l'ordinateur affiche une carte.
export type ZoomTarget = { kind: 'shelf' | 'desk'; id: string };
export type Box = { x: number; y: number; w: number; h: number };

// Toucher une carte rangée vise son étagère, toucher un ordinateur vise son bureau.
export function zoomTargetOf(layout: Layout, id: string): ZoomTarget | null {
  const item = layout.find((p) => p.id === id);
  if (!item) return null;
  if (item.kind === 'stored') return zoomTargetOf(layout, item.shelfId);
  if (item.kind === 'computer') return zoomTargetOf(layout, item.deskId);
  if (item.kind === 'shelf') return layout.some((p) => p.kind === 'stored' && p.shelfId === id) ? { kind: 'shelf', id } : null;
  if (item.kind === 'desk') return layout.some((p) => p.kind === 'computer' && p.deskId === id && p.slug) ? { kind: 'desk', id } : null;
  return null;
}

// Caméra : translation puis agrandissement (origine en haut à gauche) qui amène le centre du meuble au centre de la scène.
export function cameraOf(stage: { w: number; h: number }, target: Box, scale = 1.6): { tx: number; ty: number; scale: number } {
  return { tx: stage.w / 2 - (target.x + target.w / 2) * scale, ty: stage.h / 2 - (target.y + target.h / 2) * scale, scale };
}

// Cadre final de la vue de face : 80 % de la hauteur, largeur selon les proportions (au plus 90 % de la largeur), centré.
export function zoomRectOf(stage: { w: number; h: number }, aspect: number): Box {
  let h = stage.h * 0.8;
  let w = h * aspect;
  if (w > stage.w * 0.9) {
    w = stage.w * 0.9;
    h = w / aspect;
  }
  return { x: (stage.w - w) / 2, y: (stage.h - h) / 2, w, h };
}
```

```tsx
// src/content/furniture-zoom.tsx
// Dessin provisoire Opus — reprise Fable prévue.
import { useEffect, useState, type ReactElement } from 'react';
import { sizeOf } from '../core/library/furniture-catalog';
import type { Placed, Room } from '../core/library/library-types';
import { CELL_H, CELL_W, SURFACE_SLOTS, angleOf, computerRect, shelfSlots, surfaceSlotRect, type PxRect } from '../core/library/room-grid';
import { paletteOf } from '../core/library/styles';
import { zoomRectOf, type Box, type ZoomTarget } from '../core/library/zoom-target';
import { AngledFurnitureArt } from './furniture-angled';
import { ComputerArt, DeskArt, ShelfArt } from './furniture-art';
import { SmallArt } from './furniture-art-home';
import { AnalyticalEngineArt, SteampunkArt } from './furniture-art-steampunk';
import { ShelfItemArt } from './library-card-art';
import { Icon, ICONS } from './library-ui';
import { reducedMotion } from './ghibli-sky';

export type ZoomPhase = 'opening' | 'open' | 'closing';
type Props = {
  target: ZoomTarget;
  room: Room;
  cards: Record<string, { title: string; imageUrl?: string }>;
  imageOf: (slug: string) => string | undefined;
  phase: ZoomPhase;
  // Rectangle du meuble dans la scène au moment du toucher (départ du pivot) ; null : apparition au centre.
  from: Box | null;
  stage: { w: number; h: number };
  onCard: (slug: string) => void;
  onBack: () => void;
};

// Durées : 500 ms (moitié pour se refermer de profil, moitié pour s'ouvrir de face) ; 150 ms en mouvement réduit.
export const ZOOM_MS = 500;
export const ZOOM_REDUCED_MS = 150;

export function FurnitureZoom({ target, room, cards, imageOf, phase, from, stage, onCard, onBack }: Props): ReactElement | null {
  const item = room.layout.find((p) => p.id === target.id);
  const palette = paletteOf(room.style);
  const steampunk = room.style === 'steampunk';
  const angle = item ? angleOf(item) : 0;
  // Première moitié de l'ouverture (et seconde de la fermeture) : le meuble sous son angle ; ensuite de face.
  const [face, setFace] = useState<'angled' | 'front'>(phase === 'open' || angle === 0 ? 'front' : phase === 'opening' ? 'angled' : 'front');
  useEffect(() => {
    if (angle === 0 || phase === 'open') return setFace('front');
    const half = (reducedMotion() ? ZOOM_REDUCED_MS : ZOOM_MS) / 2;
    const t = window.setTimeout(() => setFace(phase === 'opening' ? 'front' : 'angled'), half);
    return () => window.clearTimeout(t);
  }, [phase, angle]);
  if (!item || (item.kind !== 'shelf' && item.kind !== 'desk')) return null;

  const { w, h } = sizeOf(item.kind);
  const art: PxRect = { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H };
  // Bureau : on montre aussi l'écran au-dessus du dessus, donc un cadre plus haut.
  const pad = item.kind === 'desk' ? computerRect(art).h + 8 : 0;
  const view = { x: 0, y: -pad, w: art.w, h: art.h + pad };
  const end = zoomRectOf(stage, view.w / view.h);
  const start = from ?? end;
  const at = phase === 'open' || (phase === 'opening' && face === 'front') ? end : start;
  const ms = reducedMotion() ? ZOOM_REDUCED_MS : ZOOM_MS;

  const carried = room.layout.filter((p) => (p.kind === 'stored' && p.shelfId === item.id) || (p.kind === 'computer' && p.deskId === item.id) || (p.kind === 'small' && p.hostId === item.id));
  const cardTap = (slug: string) => () => { if (cards[slug]) onCard(slug); };

  const frontArt = (
    <g>
      {item.kind === 'shelf' ? <ShelfArt rect={art} palette={palette} showSlots occupied={new Set(carried.flatMap((p) => (p.kind === 'stored' ? [p.slot] : [])))} />
        : steampunk ? <SteampunkArt kind="desk" rect={art} palette={palette} /> : <DeskArt rect={art} palette={palette} />}
      {carried.map((p: Placed) => {
        if (p.kind === 'small' && (item.kind === 'desk' || item.kind === 'shelf')) {
          return <SmallArt key={p.id} item={p.item} rect={surfaceSlotRect(art, SURFACE_SLOTS[item.kind], p.slot)} palette={palette} lit={p.lit !== false} />;
        }
        if (p.kind === 'stored') {
          const slot = shelfSlots(art)[p.slot];
          if (!slot) return null;
          const info = cards[p.slug];
          return (
            <g key={p.id} data-zoom-card={p.slug} onClick={cardTap(p.slug)} style={{ cursor: info ? 'pointer' : 'default' }} opacity={info ? 1 : 0.35}>
              <ShelfItemArt rect={slot} shape={p.shape} slug={p.slug} title={info?.title ?? ''} imageUrl={imageOf(p.slug)} missing={!info} />
              <rect x={slot.x} y={slot.y} width={slot.w} height={slot.h} fill="transparent" />
            </g>
          );
        }
        if (p.kind === 'computer') {
          const screen = computerRect(art);
          const url = p.slug && cards[p.slug] ? imageOf(p.slug) : undefined;
          return (
            <g key={p.id} {...(p.slug ? { 'data-zoom-card': p.slug, onClick: cardTap(p.slug) } : {})} style={{ cursor: 'pointer' }}>
              {steampunk ? <AnalyticalEngineArt rect={screen} imageUrl={url} /> : <ComputerArt rect={screen} imageUrl={url} />}
            </g>
          );
        }
        return null;
      })}
    </g>
  );

  return (
    <div className="wmt-lib-zoom" data-furniture-zoom="" data-zoom-phase={phase} data-zoom-face={face} role="dialog" aria-label={item.kind === 'shelf' ? 'Étagère vue de face' : 'Bureau vu de face'}>
      <div className="wmt-lib-zoom-backdrop" data-zoom-backdrop="" onClick={onBack} style={{ opacity: phase === 'closing' ? 0 : 1, transition: `opacity ${ms}ms ease-out` }} />
      <div
        className="wmt-lib-zoom-piece"
        style={{
          left: at.x, top: at.y, width: at.w, height: at.h,
          transition: `left ${ms / 2}ms ease-out, top ${ms / 2}ms ease-out, width ${ms / 2}ms ease-out, height ${ms / 2}ms ease-out`,
          animation: angle !== 0 && phase !== 'open' && !reducedMotion() ? `wmt-zoom-pivot ${ms}ms ease-in-out` : undefined,
        }}
      >
        <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          {face === 'front' ? frontArt : <AngledFurnitureArt kind={item.kind} angle={angle} rect={art} palette={palette} />}
        </svg>
      </div>
      <button type="button" className="wmt-lib-fab" data-action="zoom-back" aria-label="Retour à la pièce" title="Retour à la pièce" onClick={onBack} style={{ left: 8, top: 8 }}>
        <Icon paths={ICONS.back} />
      </button>
    </div>
  );
}
```

CSS à ajouter dans `LIBRARY_CSS` (`LibraryPanel.tsx`) :

```css
.wmt-lib-zoom{position:absolute;inset:0;z-index:30}
.wmt-lib-zoom-backdrop{position:absolute;inset:0;background:transparent}
.wmt-lib-zoom-piece{position:absolute;filter:drop-shadow(0 8px 18px rgba(0,0,0,.45))}
@keyframes wmt-zoom-pivot{0%{transform:scaleX(1)}50%{transform:scaleX(0)}100%{transform:scaleX(1)}}
```

(Vérifier que `reducedMotion` est bien exporté par `ghibli-sky.ts`, comme dans `RoomView.tsx` ; `RoomCardDialog` doit avoir un `z-index` supérieur à 30 pour passer par-dessus le zoom — le vérifier dans `LIBRARY_CSS` et le relever si besoin.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/library/zoom-target.test.ts tests/content/furniture-zoom.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/zoom-target.ts src/content/furniture-zoom.tsx src/content/LibraryPanel.tsx tests/core/library/zoom-target.test.ts tests/content/furniture-zoom.test.tsx tests/familles.ts
git commit -m "feat(bibliotheque): calque de zoom de face (étagère, bureau), caméra et cadre

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Zoom dans la pièce : ouverture, blocages, retour (← / Android / Échap)

**Files:**
- Create: `src/content/use-furniture-zoom.ts`
- Modify: `src/content/LibraryPanel.tsx` (`onPick`, `onCardTap`, rendu, `goOutside`, conteneur de défilement, barre du haut, interrupteur, effets de fermeture)
- Test: `tests/content/library-zoom.test.tsx` (nouveau ; famille `scene-piece` : `'library-zoom.*'` dans `c(...)`)

**Interfaces:**
- Consumes: `zoomTargetOf`, `cameraOf`, `type Box`, `type ZoomTarget` (Tâche 9) ; `FurnitureZoom`, `ZOOM_MS`, `ZOOM_REDUCED_MS`, `type ZoomPhase` (Tâche 9) ; `reducedMotion`.
- Produces:
  - `export function useFurnitureZoom(): { zoom: { target: ZoomTarget; from: Box | null; phase: ZoomPhase } | null; open: (target: ZoomTarget, from: Box | null) => void; close: () => void; reset: () => void }`
  - Dans `LibraryPanel` : `zoomRef` (zoom courant lu par `goOutside`), attribut `data-zoom-open` sur `.wmt-lib-stage`.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/content/library-zoom.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import type { CollectionRepo } from '../../src/core/collection/collection-repo';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { updateLayout } from '../../src/core/library/library-book';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import type { Layout } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Même collection factice que tests/content/library-cards.test.tsx (copier `known` et `fakeCollection` de ce fichier).
const known = [{ slug: 'Paris', title: 'Paris' }, { slug: 'Daft_Punk', title: 'Daft Punk' }];
const fakeCollection = { list: async () => known, subscribe: () => () => undefined } as unknown as CollectionRepo;

let container: HTMLDivElement;
let root: Root;
let repo: LibraryRepo;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const q = (s: string) => container.querySelector<HTMLElement | SVGElement>(s);
async function click(s: string) {
  const el = q(s) ?? document.querySelector<HTMLElement>(s);
  if (!el) throw new Error(`introuvable : ${s}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}
async function seed(layout: Layout) { await repo.update((st) => updateLayout(st, 'r1', () => layout)); await settle(); }
const advance = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });

const SHELF: Layout = [{ id: 's', kind: 'shelf', col: 0, row: 6, angle: 1 }, { id: 'c', kind: 'stored', shape: 'cd', shelfId: 's', slot: 0, slug: 'Daft_Punk' }];

beforeEach(async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} collection={fakeCollection} />); });
  await settle();
});
afterEach(() => { vi.useRealTimers(); act(() => root.unmount()); container.remove(); history.replaceState(null, ''); });

describe('zoom sur un meuble', () => {
  it('en Visiter, toucher une étagère avec cartes ouvre le zoom ; il passe « open » après 500 ms', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    await click('[data-furniture="shelf"]');
    expect(q('[data-furniture-zoom]')?.getAttribute('data-zoom-phase')).toBe('opening');
    await advance(500);
    expect(q('[data-furniture-zoom]')?.getAttribute('data-zoom-phase')).toBe('open');
  });
  it('toucher une carte rangée dans la pièce ouvre aussi le zoom (pas la fiche)', async () => {
    await seed([{ id: 's', kind: 'shelf', col: 0, row: 6 }, SHELF[1]!]);
    await click('[data-card="Daft_Punk"]');
    expect(q('[data-furniture-zoom]')).not.toBeNull();
    expect(document.querySelector('[data-room-card]')).toBeNull();
  });
  it('étagère vide : pas de zoom ; en Aménager : pas de zoom', async () => {
    await seed([{ id: 's', kind: 'shelf', col: 0, row: 6 }]);
    await click('[data-furniture="shelf"]');
    expect(q('[data-furniture-zoom]')).toBeNull();
    await seed(SHELF);
    await click('[data-action="edit"]');
    await click('[data-furniture="shelf"]');
    expect(q('[data-furniture-zoom]')).toBeNull();
  });
  it('pendant le zoom : pas de bouton Sortir (vue fenêtre), pas d’interrupteur ni de barre du haut, défilement figé', async () => {
    await seed(SHELF);
    await click('[data-furniture="shelf"]');
    expect(q('[data-action="outside"]')).toBeNull();
    expect(q('[data-mode-switch]')).toBeNull();
    expect(q('[data-menu-button="sky"]')).toBeNull();
    expect((q('[data-scroll]') as HTMLElement).style.overflow).toBe('hidden');
    expect(q('[data-stage]')!.hasAttribute('data-zoom-open')).toBe(true);
  });
  it('toucher une carte dans le zoom ouvre la fiche ; la fermer revient au zoom', async () => {
    await seed(SHELF);
    await click('[data-furniture="shelf"]');
    await click('[data-zoom-card="Daft_Punk"]');
    expect(document.querySelector('[data-room-card="Daft_Punk"]')).not.toBeNull();
    await click('[data-action="close"]');
    expect(document.querySelector('[data-room-card]')).toBeNull();
    expect(q('[data-furniture-zoom]')).not.toBeNull();
  });
  it('← ferme le zoom après l’animation et rend le bouton Sortir', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    await click('[data-furniture="shelf"]');
    await advance(500);
    await click('[data-action="zoom-back"]');
    expect(q('[data-furniture-zoom]')?.getAttribute('data-zoom-phase')).toBe('closing');
    await advance(500);
    expect(q('[data-furniture-zoom]')).toBeNull();
    expect(q('[data-action="outside"]')).not.toBeNull();
  });
  it('Échap ferme le zoom', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    await click('[data-furniture="shelf"]');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await advance(500);
    expect(q('[data-furniture-zoom]')).toBeNull();
  });
  it('retour Android/navigateur (popstate) ferme le zoom une seule fois, sans entrée d’historique orpheline', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    const before = history.length;
    await click('[data-furniture="shelf"]');
    expect(history.state).toMatchObject({ wmtZoom: true });
    await act(async () => { history.replaceState(null, ''); window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
    await advance(500);
    expect(q('[data-furniture-zoom]')).toBeNull();
    expect(history.length).toBe(before + 1);
    // un second retour hors zoom ne rouvre rien et ne plante pas
    await act(async () => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
    expect(q('[data-furniture-zoom]')).toBeNull();
  });
});
```

(Si `known` dans `library-cards.test.tsx` a une autre forme, la recopier telle quelle ; l'important est que `Daft_Punk` soit une carte connue.)

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/content/library-zoom.test.tsx` → FAIL.

- [ ] **Step 3: Implementation**

```ts
// src/content/use-furniture-zoom.ts
import { useEffect, useRef, useState } from 'react';
import type { Box, ZoomTarget } from '../core/library/zoom-target';
import { ZOOM_MS, ZOOM_REDUCED_MS, type ZoomPhase } from './furniture-zoom';
import { reducedMotion } from './ghibli-sky';

export type ZoomState = { target: ZoomTarget; from: Box | null; phase: ZoomPhase };

// État du zoom sur un meuble : ouverture (500 ms), ouvert, fermeture (500 ms). Une entrée d'historique est posée à l'ouverture,
// pour que le retour Android (WebView.goBack) ou celui du navigateur ferme le zoom ; ← et Échap la retirent eux-mêmes.
export function useFurnitureZoom(): { zoom: ZoomState | null; open: (target: ZoomTarget, from: Box | null) => void; close: () => void; reset: () => void } {
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const timer = useRef(0);
  const ours = useRef(false);
  const duration = () => (reducedMotion() ? ZOOM_REDUCED_MS : ZOOM_MS);
  const later = (fn: () => void) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(fn, duration()); };

  const finishClose = () => later(() => setZoom(null));
  const open = (target: ZoomTarget, from: Box | null) => {
    setZoom({ target, from, phase: 'opening' });
    later(() => setZoom((z) => (z ? { ...z, phase: 'open' } : z)));
    history.pushState({ ...(history.state ?? {}), wmtZoom: true }, '');
    ours.current = true;
  };
  // ← / Échap / fond : retire notre entrée d'historique (le popstate qui suit est ignoré), puis anime la fermeture.
  const close = () => {
    setZoom((z) => (z && z.phase !== 'closing' ? { ...z, phase: 'closing' } : z));
    finishClose();
    if (ours.current) {
      ours.current = false;
      if (history.state?.wmtZoom) history.back();
    }
  };
  // Changement de pièce, sortie du plein écran : fermeture immédiate.
  const reset = () => {
    window.clearTimeout(timer.current);
    setZoom(null);
    if (ours.current) {
      ours.current = false;
      if (history.state?.wmtZoom) history.back();
    }
  };

  useEffect(() => {
    // Retour Android / navigateur : notre entrée vient d'être retirée, on ferme sans toucher à l'historique.
    const onPop = () => {
      if (!ours.current) return;
      ours.current = false;
      setZoom((z) => (z && z.phase !== 'closing' ? { ...z, phase: 'closing' } : z));
      finishClose();
    };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); window.clearTimeout(timer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { zoom, open, close, reset };
}
```

Note : avec ← la fermeture appelle `history.back()` ; le `popstate` qui en résulte trouve `ours.current === false` et ne fait rien → pas de double fermeture.

`LibraryPanel.tsx` :

1. `const { zoom, open: openZoom, close: closeZoom, reset: resetZoom } = useFurnitureZoom();` et `const zoomRef = useRef(zoom); zoomRef.current = zoom;`.
2. Mesure du rectangle de départ :
   ```ts
   // Rectangle d'un meuble dans la scène (départ du pivot) ; null si non mesurable (tests).
   const boxInStage = (id: string): Box | null => {
     const stageEl = stage.ref.current;
     const el = scrollRef.current?.querySelector(`[data-id="${id}"]`);
     if (!stageEl || !el) return null;
     const s = stageEl.getBoundingClientRect();
     const r = el.getBoundingClientRect();
     return r.width === 0 ? null : { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
   };
   const tryZoom = (id: string): boolean => {
     const target = zoomTargetOf(layout, id);
     if (!target) return false;
     openZoom(target, boxInStage(target.id));
     return true;
   };
   ```
3. `onPick`, branche `!editing` :
   ```ts
   if (!editing) {
     if (press.consumeClick()) return;
     if (zoomRef.current) return;
     if (tryZoom(id)) return;
     if (layout.some((p) => p.id === id && isLamp(p))) void editLayout((l) => toggleLamp(l, id));
     return;
   }
   ```
4. `onCardTap`, branche `!editing` :
   ```ts
   if (!editing) {
     if (zoomRef.current) return;
     if ((item.kind === 'stored' || item.kind === 'computer') && tryZoom(item.id)) return;
     const slug = item.kind === 'wall' || item.kind === 'stored' || item.kind === 'computer' ? item.slug : undefined;
     if (slug && roomCards.cards[slug]) setViewing(slug);
     return;
   }
   ```
5. `goOutside` : première ligne `if (zoomRef.current) return;` (aucune transition meuble → extérieur).
6. Échap : nouvel effet
   ```ts
   const zoomOpen = zoom !== null;
   useEffect(() => {
     if (!zoomOpen) return;
     const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape' && !viewingRef.current) closeZoom(); };
     window.addEventListener('keydown', onKey);
     return () => window.removeEventListener('keydown', onKey);
   }, [zoomOpen]); // eslint-disable-line react-hooks/exhaustive-deps
   ```
   avec `const viewingRef = useRef(viewing); viewingRef.current = viewing;` (Échap sur la fiche ouverte ferme la fiche seulement).
7. Fermetures immédiates : ajouter `resetZoom()` dans le `useLayoutEffect` de changement de pièce (`[roomIdNow]`) et dans celui de `[editingNow]` ; nouvel effet `useEffect(() => { if (!stage.active) resetZoom(); }, [stage.active]);` — seulement à la sortie du plein écran (garder une ref de la valeur précédente pour ne pas fermer à l'entrée).
8. Rendu :
   - `<div className="wmt-lib-stage" … data-zoom-open={zoom ? '' : undefined}>`.
   - Conteneur `data-scroll` : ajouter au `style`
     ```ts
     ...(zoom ? (() => {
       const box = boxInStage(zoom.target.id);
       const cam = box ? cameraOf({ w: stage.ref.current?.clientWidth ?? 0, h: stage.ref.current?.clientHeight ?? 0 }, box) : null;
       const on = zoom.phase !== 'closing';
       return {
         overflow: 'hidden', touchAction: 'none',
         transformOrigin: '0 0',
         transform: on && cam ? `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.scale})` : 'none',
         filter: on ? 'blur(6px) brightness(0.55)' : 'none',
         transition: `transform ${ZOOM_MS}ms ease-out, filter ${ZOOM_MS}ms ease-out`,
       };
     })() : {}),
     ```
     (calculer `box` une fois par ouverture : mémoriser `zoom.from` plutôt que remesurer — utiliser `zoom.from` à la place de `boxInStage(...)` ici.)
   - Barre du haut (`<LibraryTopbar …/>`) : rendue seulement si `!zoom`.
   - Bouton Sortir/Rentrer : condition `!editing && !zoom`.
   - Interrupteur `data-mode-switch` : condition `stage.active && !zoom`.
   - Bouton « Quitter le plein écran » : condition `stage.active && !zoom`.
   - Le calque, juste avant `{viewing && …<RoomCardDialog …/>}` (pour que la fiche passe par-dessus) :
     ```tsx
     {zoom && !editing && (
       <FurnitureZoom target={zoom.target} room={room} cards={roomCards.cards} imageOf={imageOfCard} phase={zoom.phase} from={zoom.from}
         stage={{ w: stage.ref.current?.clientWidth ?? 0, h: stage.ref.current?.clientHeight ?? 0 }}
         onCard={(slug) => setViewing(slug)} onBack={closeZoom} />
     )}
     ```
     où `imageOfCard = (slug: string) => { const url = roomCards.cards[slug]?.imageUrl; return getImageService()?.displayUrl(slug, url) ?? url; }` (même règle que `imageOf` de `RoomView` ; importer `getImageService` depuis `./image-registry`).
     Le calque doit être un enfant de `.wmt-lib-stage` et **frère** de `.wmt-lib-scroll` (il ne doit pas hériter du flou ni de la transformation).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/content/library-zoom.test.tsx` → PASS.
Run: `npm run test:famille -- scene-piece` → PASS. Le test existant « en Visiter, toucher une carte ouvre sa fiche » (cartes au mur) doit rester vert ; un test existant qui touche une carte **rangée** en Visiter pour ouvrir la fiche doit être adapté (le toucher ouvre désormais le zoom, puis `[data-zoom-card]` ouvre la fiche) — c'est la règle validée par la spec.

- [ ] **Step 5: Commit**

```bash
git add src/content/use-furniture-zoom.ts src/content/LibraryPanel.tsx tests/content/library-zoom.test.tsx tests/familles.ts tests/content
git commit -m "feat(bibliotheque): zoom de face sur l'étagère et le bureau en Visiter (caméra, blocage de la vue fenêtre, retour)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Fiche WikiHow, familles, build et captures de validation

**Files:**
- Modify: `src/core/whats-new/entries.ts` (nouvelle entrée `bibliotheque-v31` après `bibliotheque-v30`)
- Test: tests existants de `entries` (famille qui couvre `whats-new` — la trouver dans `tests/familles.ts`)

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: fiche `bibliotheque-v31` ; build extension + Android vert ; captures téléphone.

- [ ] **Step 1: Ajouter la fiche** (même forme que `bibliotheque-v30`)

```ts
  {
    id: 'bibliotheque-v31',
    theme: 'collection',
    glyph: '🛋️',
    title: 'Tourner les meubles et regarder une étagère de près',
    summary: 'Chaque meuble tourne par pas de 45° ; en Visiter, toucher une étagère ou un bureau ouvre sa vue de face pour choisir une carte',
    steps: [
      {
        target: '[data-wmt-library-entry]',
        gesture: 'tap',
        title: 'Tourner un meuble',
        text: 'Dans Ma Pièce, en Aménager, touchez un meuble puis ⟲ (tourner à gauche) ou ⟳ (tourner à droite) : il pivote de 45° à chaque appui, jusqu’à huit angles (face, trois-quarts, profil, dos…). Rien n’est enregistré avant la coche verte.',
        details: [
          { label: 'À quoi ça sert', text: 'À placer un canapé de profil contre un mur, une étagère en biais dans un coin, ou un fauteuil tourné vers la table.' },
          { label: 'Comment ça marche', text: 'Chaque angle a sa propre empreinte au sol : de profil, le meuble est moins large mais plus profond ; en diagonale, ses cases au sol forment un escalier. Deux meubles ne partagent jamais une case au sol, sauf le tapis (on pose tout dessus) et la chaise glissée sous un bureau ou une table basse.' },
          { label: 'Limites', text: 'Si l’angle ne tient pas à cet endroit (bord de la pièce, mur, autre meuble), l’empreinte devient rouge et la coche reste grisée : déplacez le meuble. Les dessins des angles sont provisoires et seront redessinés.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
      {
        target: '[data-wmt-library-entry]',
        gesture: 'tap',
        title: 'Zoomer sur une étagère ou un bureau',
        text: 'En Visiter, touchez une étagère qui range des cartes, ou un bureau dont l’écran affiche une carte : la caméra s’avance, le meuble pivote et se montre de face en grand. Touchez une carte pour ouvrir sa fiche, puis ← (ou le bouton retour du téléphone) pour revenir à la pièce.',
        details: [
          { label: 'À quoi ça sert', text: 'À choisir facilement la carte à ouvrir, même quand l’étagère est tournée de profil ou de dos.' },
          { label: 'Comment ça marche', text: 'Les cartes viennent de votre pièce : celles rangées dans l’étagère ou affichées à l’écran. La pièce reste animée derrière le flou.' },
          { label: 'Limites', text: 'Un meuble sans carte ne zoome pas. Pendant le zoom, impossible de sortir par la fenêtre ou de passer en Aménager : revenez d’abord à la pièce.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
    ],
  },
```

- [ ] **Step 2: Lancer les familles touchées**

Run: `npm run test:famille -- scene-piece scene-animaux scene-lumiere` puis la famille qui contient les tests de `whats-new` (lire `tests/familles.ts`).
Expected: tout PASS. Noter le résultat exact dans le compte rendu.

- [ ] **Step 3: Typecheck et build**

Run: `npx tsc --noEmit` puis `npm run build`.
Expected: aucune erreur. (Le build Android est fait par `npm run preprod` après fusion, selon la routine du projet.)

- [ ] **Step 4: Captures de validation**

Avec le banc visuel de Ma Pièce (reprendre `.superpowers/harness-sims` d'un worktree existant, cf. mémoire, ou servir le build) en largeur téléphone : capturer (a) un canapé et une étagère aux angles 0, 1, 2, 4, 7 avec leurs cases au sol en mode placement, (b) l'étagère zoomée de face avec des cartes, (c) le bureau zoomé avec la carte à l'écran. Les envoyer à l'utilisateur (SendUserFile) pour validation.

- [ ] **Step 5: Commit**

```bash
git add src/core/whats-new/entries.ts
git commit -m "docs(wikihow): fiche rotation des meubles et zoom de face (bibliotheque-v31)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Ensuite : superpowers:finishing-a-development-branch (PR vers `main`, fusion, `npm run preprod`, selon la routine du projet).
