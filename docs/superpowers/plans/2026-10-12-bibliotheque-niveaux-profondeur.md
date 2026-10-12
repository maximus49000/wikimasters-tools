# Bibliothèque — niveaux de profondeur : plan de développement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** superposer les objets de la pièce sur quatre niveaux de profondeur (mur, fond, milieu, avant), et laisser les animaux passer partout où il y a la place (sous les tables, derrière un meuble décollé du mur).

**Architecture :** le modèle vit dans le cœur (`src/core/library`). Le catalogue donne trois choses par type : le niveau par défaut, les rangées d'appui et le dessous libre. `room-grid` vérifie l'occupation niveau par niveau. Un nouveau module `depth-order.ts` fixe l'ordre de dessin, la place d'un animal dans cet ordre et la sélection en pile. `RoomView` dessine dans cet ordre et ajoute les ombres de contact. `LibraryPanel` ajoute les boutons ⤒/⤓ et le toucher répété. `walk-map` ne bloque plus que les appuis des meubles pleins.

**Tech Stack :** TypeScript, React 18 (SVG), Vitest (+ jsdom pour les rendus), WXT (extension) et WebView Android (même code `src/content`).

**Spec :** `docs/superpowers/specs/2026-10-12-bibliotheque-niveaux-profondeur-design.md`

## Global Constraints

- Une case = au plus un objet **par niveau** ; tapis (`layer: 'rug'`) inchangés, toujours dessous.
- Niveaux : 0 Mur (fenêtres + objets `wall` uniquement), 1 Fond, 2 Milieu, 3 Avant. Meubles debout : 1 à 3 seulement.
- Niveaux par défaut : `shelf`, `lamp`, `plant` → 1 ; `desk`, `chair`, `armchair`, `sofa`, `globe`, `telescope`, `automaton`, `kennel` → 2 ; `coffee-table`, `basket`, `bowl`, `charger` → 3 ; `rug` → 1 (sans effet, couche à part).
- `Placed` debout : champ optionnel `depth?: 1 | 2 | 3`, écrit seulement s'il diffère du défaut. Une pièce enregistrée sans `depth` se charge à l'identique.
- `computer`, `small`, `stored` prennent le niveau de leur porteur et se dessinent juste après lui.
- Appuis (`foot`) et dessous libre (`under`) : `shelf` 2/non · `desk` 2/oui · `chair` 1/oui · `coffee-table` 2/oui · `telescope` 1/oui · `sofa`, `armchair`, `kennel` 2/non · `basket`, `bowl`, `plant`, `lamp`, `globe`, `automaton`, `charger` 1/non · `rug` 0/oui.
- Pas de fiche WikiHow (demande explicite de l'utilisateur).
- Pas de perspective : tailles et positions inchangées.
- Code partagé extension + Android : rien de spécifique à une plateforme. Validation d'abord sur le téléphone (règle « Android d'abord »).
- Commentaires en français, densité du code voisin ; tests `describe`/`it` en français.
- Fable gelé jusqu'au 2026-10-17 : ce plan n'a que du code (ombre = simple bande), Opus/Sonnet suffisent.

## Review Focus

1. **Pièce déjà enregistrée** (aucun `depth`) : elle doit s'afficher et se manier exactement comme avant. L'ordre peut changer seulement là où les niveaux par défaut l'imposent. → Tâche 1 (`depthOf` sans champ) et Tâche 2 (ordre d'une pièce type).
2. **Glisser un meuble vers un endroit où son niveau est pris** : le fantôme vert doit annoncer le repli de niveau, pas un refus. → Tâche 1 (`moveStanding` qui replie) et Tâche 4 (`furniture-drag` reste `ok`).
3. **`shiftLayout` / décalage de la pièce** : le champ `depth` doit survivre au décalage des colonnes. → Tâche 1.
4. **Toucher un objet seul déjà sélectionné** : il se désélectionne comme aujourd'hui, sans boucle infinie. → Tâche 2 (`nextInStack`).
5. **Petit objet ou ordinateur posé sur un bureau de niveau 2, avec une table basse de niveau 3 devant** : le petit objet doit rester derrière la table. → Tâche 3.

---

### Task 1: Modèle — niveaux, appuis et occupation par niveau

**Files :**
- Modify : `src/core/library/library-types.ts` (variante debout de `Placed`)
- Modify : `src/core/library/furniture-catalog.ts` (`Footprint`, `FOOTPRINTS`, accesseurs)
- Modify : `src/core/library/room-grid.ts` (`takenKeys`, `canPlace`, `canHangRect`, `placeStanding`, `moveStanding`, + `depthOf`, `freeDepth`, `canShiftDepth`, `shiftDepth`)
- Test : `tests/core/library/room-grid-depth.test.ts` (nouveau) ; ajuster `tests/core/library/room-grid.test.ts` seulement là où un test affirme qu'on ne peut pas accrocher derrière un meuble (comportement voulu par la spec).

**Interfaces :**
- Produces :
  - `type Depth = 0 | 1 | 2 | 3` et `type StandDepth = 1 | 2 | 3` (exportés de `library-types.ts`)
  - `depthDefault(kind: StandingKind): StandDepth`, `footOf(kind: StandingKind): number`, `underOf(kind: StandingKind): boolean` (catalogue)
  - `depthOf(layout: Layout, p: Placed): Depth` (room-grid)
  - `freeDepth(layout, cols, kind, col, row, from: StandDepth, ignoreId?): StandDepth | null` : le niveau libre le plus proche de `from`, à égalité celui de devant
  - `canPlace(...)` : même signature et même `PlaceResult` ; `ok` dès qu'un niveau est libre
  - `canShiftDepth(layout, id, delta: 1 | -1): boolean`, `shiftDepth(layout, id, delta: 1 | -1): Layout | null`

- [ ] **Step 1 : écrire les tests qui échouent**

```ts
// tests/core/library/room-grid-depth.test.ts
import { describe, expect, it } from 'vitest';
import type { Layout } from '../../../src/core/library/library-types';
import { canHang, canPlace, canShiftDepth, depthOf, freeDepth, moveStanding, placeStanding, shiftDepth, shiftLayout } from '../../../src/core/library/room-grid';
import { depthDefault, footOf, underOf } from '../../../src/core/library/furniture-catalog';

describe('niveaux de profondeur', () => {
  it('donne le niveau par défaut du type', () => {
    expect(depthDefault('shelf')).toBe(1);
    expect(depthDefault('armchair')).toBe(2);
    expect(depthDefault('coffee-table')).toBe(3);
    expect(footOf('shelf')).toBe(2);
    expect(underOf('coffee-table')).toBe(true);
    expect(underOf('sofa')).toBe(false);
  });

  it('lit une pièce ancienne (sans depth) au niveau par défaut', () => {
    const layout: Layout = [{ id: 'a', kind: 'shelf', col: 0, row: 8 }];
    expect(depthOf(layout, layout[0]!)).toBe(1);
  });

  it('met fenêtres et objets accrochés au niveau 0, les objets portés au niveau du porteur', () => {
    const layout: Layout = [
      { id: 'w', kind: 'window', col: 0, row: 1, w: 6, h: 5 },
      { id: 'p', kind: 'wall', shape: 'poster', col: 8, row: 1, slug: 'Paris' },
      { id: 'd', kind: 'desk', col: 10, row: 13, depth: 3 },
      { id: 'c', kind: 'computer', deskId: 'd' },
      { id: 's', kind: 'small', item: 'plant', hostId: 'd', slot: 0 },
      { id: 'sh', kind: 'shelf', col: 20, row: 8 },
      { id: 'st', kind: 'stored', shape: 'book', shelfId: 'sh', slot: 0, slug: 'X' },
    ];
    const at = (id: string) => depthOf(layout, layout.find((p) => p.id === id)!);
    expect([at('w'), at('p'), at('c'), at('s'), at('st')]).toEqual([0, 0, 3, 3, 1]);
  });

  it('superpose une bibliothèque, un fauteuil et une table basse sur les mêmes cases', () => {
    let layout = placeStanding([], 24, 'shelf', 0, 8, 'a')!;
    layout = placeStanding(layout, 24, 'armchair', 1, 13, 'b')!;
    layout = placeStanding(layout, 24, 'coffee-table', 0, 14, 'c')!;
    expect(layout).toHaveLength(3);
    expect(layout.map((p) => depthOf(layout, p))).toEqual([1, 2, 3]);
    // Le niveau par défaut n'est pas écrit.
    expect(layout.every((p) => !('depth' in p))).toBe(true);
  });

  it('se replie sur le niveau libre le plus proche (à égalité, celui de devant)', () => {
    const layout = placeStanding([], 24, 'armchair', 0, 13, 'a')!;
    expect(freeDepth(layout, 24, 'armchair', 0, 13, 2)).toBe(3);
    const placed = placeStanding(layout, 24, 'armchair', 0, 13, 'b')!;
    expect(placed.find((p) => p.id === 'b')).toMatchObject({ depth: 3 });
  });

  it('refuse quand les niveaux 1, 2 et 3 sont pris', () => {
    const layout: Layout = [
      { id: 'a', kind: 'armchair', col: 0, row: 13, depth: 1 },
      { id: 'b', kind: 'armchair', col: 0, row: 13 },
      { id: 'c', kind: 'armchair', col: 0, row: 13, depth: 3 },
    ];
    const res = canPlace(layout, 24, 'chair', 1, 13);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('taken');
    expect(freeDepth(layout, 24, 'chair', 1, 13, 2)).toBeNull();
  });

  it('accroche une affiche derrière une étagère, mais pas sur une autre affiche', () => {
    const layout: Layout = [
      { id: 'a', kind: 'shelf', col: 0, row: 4 },
      { id: 'p', kind: 'wall', shape: 'poster', col: 10, row: 1, slug: 'Paris' },
    ];
    expect(canHang(layout, 24, 'poster', 1, 4).ok).toBe(true);
    expect(canHang(layout, 24, 'poster', 11, 2).ok).toBe(false);
  });

  it('garde son niveau en déplacement s’il est libre, sinon se replie', () => {
    const layout: Layout = [
      { id: 'a', kind: 'armchair', col: 0, row: 13, depth: 3 },
      { id: 'b', kind: 'armchair', col: 10, row: 13, depth: 3 },
    ];
    expect(moveStanding(layout, 24, 'a', 4, 13)!.find((p) => p.id === 'a')).toMatchObject({ depth: 3 });
    const moved = moveStanding(layout, 24, 'a', 10, 13)!.find((p) => p.id === 'a')!;
    expect(depthOf(layout, moved)).toBe(2);
    expect('depth' in moved).toBe(false);
  });

  it('avance et recule dans les bornes 1 à 3, si le niveau visé est libre', () => {
    const layout: Layout = [
      { id: 'a', kind: 'armchair', col: 0, row: 13 },
      { id: 'b', kind: 'coffee-table', col: 0, row: 14 },
    ];
    expect(canShiftDepth(layout, 'a', 1)).toBe(false); // la table basse occupe le niveau 3
    expect(canShiftDepth(layout, 'a', -1)).toBe(true);
    const back = shiftDepth(layout, 'a', -1)!;
    expect(back.find((p) => p.id === 'a')).toMatchObject({ depth: 1 });
    expect(canShiftDepth(back, 'a', -1)).toBe(false); // jamais au niveau 0
    expect(shiftDepth(back, 'a', 1)!.find((p) => p.id === 'a')).not.toHaveProperty('depth');
  });

  it('garde depth quand la pièce est décalée', () => {
    const layout: Layout = [{ id: 'a', kind: 'armchair', col: 12, row: 13, depth: 3 }];
    expect(shiftLayout(layout, -12)[0]).toMatchObject({ col: 0, depth: 3 });
  });
});
```

- [ ] **Step 2 : lancer et voir échouer**

Run : `npx vitest run tests/core/library/room-grid-depth.test.ts`
Expected : FAIL (`depthDefault` / `depthOf` non exportés).

- [ ] **Step 3 : implémenter**

`library-types.ts` :

```ts
// Niveau de profondeur : 0 mur (fenêtres, objets accrochés), 1 fond, 2 milieu, 3 avant.
export type Depth = 0 | 1 | 2 | 3;
export type StandDepth = 1 | 2 | 3;
// … dans Placed :
  | { id: string; kind: StandingKind; col: number; row: number; lit?: boolean; depth?: StandDepth }
```

Ajouter au commentaire de `Placed` : « `depth` : niveau choisi s'il diffère du niveau par défaut du type ».

`furniture-catalog.ts` : étendre `Footprint` avec `depth: StandDepth; foot: number; under: boolean` et renseigner chaque entrée avec les valeurs exactes des Global Constraints, puis :

```ts
export const depthDefault = (kind: StandingKind): StandDepth => FOOTPRINTS[kind].depth;
// Rangées du bas de l'emprise qui touchent vraiment le sol ; au-dessus, c'est l'espace entre le meuble et le mur.
export const footOf = (kind: StandingKind): number => FOOTPRINTS[kind].foot;
// Vrai si un animal passe dessous (table, bureau, chaise, trépied).
export const underOf = (kind: StandingKind): boolean => FOOTPRINTS[kind].under;
```

`room-grid.ts` :

```ts
// Niveau d'un objet : 0 pour le mur, le champ `depth` ou le défaut du type pour un meuble, celui du porteur pour un objet porté.
export function depthOf(layout: Layout, p: Placed): Depth {
  if (p.kind === 'window' || p.kind === 'wall') return 0;
  if (isStanding(p)) return p.depth ?? depthDefault(p.kind);
  const hostId = p.kind === 'computer' ? p.deskId : p.kind === 'small' ? p.hostId : p.shelfId;
  const host = layout.find((q) => q.id === hostId);
  return host && isStanding(host) ? depthOf(layout, host) : 1;
}
```

- `takenKeys(layout, ignoreId, layer, depth: Depth)` : ne compte que les objets de la même couche **et** du même `depthOf`. Les tapis gardent leur couche (`depth` ignoré pour `rug`).
- `canHangRect` utilise `takenKeys(layout, ignoreId, 'floor', 0)`.
- `freeDepth` : candidats dans l'ordre `[from, from+1, from-1, from+2, from-2]` filtrés dans 1..3. Le premier sans case prise au niveau gagne. Les tapis renvoient toujours `from` quand leur couche est libre.
- `canPlace` : les contrôles `bounds`/`floor` sont inchangés ; ensuite `freeDepth(…, depthDefault(kind), ignoreId)`. Si la fonction renvoie `null`, le refus est `taken` avec les cellules prises au niveau par défaut.
- `placeStanding` : `const d = freeDepth(..., depthDefault(kind))` ; on écrit `depth` seulement si `d !== depthDefault(kind)`.
- `moveStanding` : idem, avec `from = depthOf(layout, item)`. Le nouvel objet est `{ ...item, col, row }` avec `depth` mis ou retiré selon la même règle (`const { depth: _, ...rest } = item`).
- `canShiftDepth` / `shiftDepth` : meuble debout hors tapis, `next = depthOf + delta`, dans 1..3, cases libres à `next` (en ignorant l'objet). `shiftDepth` écrit `depth` ou le retire si `next` est le défaut.

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run tests/core/library/room-grid-depth.test.ts tests/core/library/room-grid.test.ts tests/core/library/room-grid-layers.test.ts tests/core/library/room-grid-window.test.ts tests/core/library/room-grid-small.test.ts tests/core/library/room-grid-cards.test.ts && npx tsc --noEmit`
Expected : PASS. Si un ancien test affirme « accrocher derrière un meuble = `taken` », le remplacer par l'affirmation inverse et le signaler dans le rapport. Aucun autre ancien test ne doit changer.

- [ ] **Step 5 : commit**

```bash
git add src/core/library tests/core/library/room-grid-depth.test.ts tests/core/library/room-grid.test.ts
git commit -m "feat(bibliotheque): niveaux de profondeur — une case = un objet par niveau"
```

---

### Task 2: Ordre de dessin, place des animaux, sélection en pile (cœur)

**Files :**
- Create : `src/core/library/depth-order.ts`
- Modify : `src/core/library/pets/depth.ts` (remplacer `depthKey`/`depthIndex` par `petSlot`)
- Modify : `src/core/library/pets/runner.ts:239-247` (appel de `petSlot`)
- Test : `tests/core/library/depth-order.test.ts` (nouveau) ; `tests/core/library/pets-runner.test.ts` à ajuster si un test lit `behind`

**Interfaces :**
- Consumes : `depthOf`, `rectOf`, `isStanding`, `CELL_H`, `CELL_W` (Tâche 1)
- Produces :
  - `drawOrder(layout: Layout): Standing[]` : meubles debout hors tapis, triés par `depthOf` puis par rangée du bas (`row + h`), ordre stable
  - `petSlot(layout: Layout, state: PetState): number` : nombre d'éléments de `drawOrder` dessinés AVANT l'animal (même sens que l'ancien `behind`)
  - `stackAt(layout: Layout, id: string): string[]` : ids des objets (meubles debout hors tapis, fenêtres, objets accrochés) dont le rectangle chevauche celui de `id`, du plus en avant au plus en arrière, `id` compris
  - `nextInStack(layout: Layout, selectedId: string | null, tappedId: string): string | null`

- [ ] **Step 1 : tests qui échouent**

```ts
// tests/core/library/depth-order.test.ts
import { describe, expect, it } from 'vitest';
import type { Layout } from '../../../src/core/library/library-types';
import { drawOrder, nextInStack, petSlot, stackAt } from '../../../src/core/library/depth-order';
import { CELL_H, CELL_W } from '../../../src/core/library/room-grid';
import type { PetState } from '../../../src/core/library/pets/motion';

const layout: Layout = [
  { id: 'tab', kind: 'coffee-table', col: 0, row: 14 }, // niveau 3, bas = 16
  { id: 'sh', kind: 'shelf', col: 0, row: 10 },          // niveau 1, bas = 18
  { id: 'arm', kind: 'armchair', col: 1, row: 13 },      // niveau 2, bas = 16
  { id: 'win', kind: 'window', col: 0, row: 1, w: 6, h: 5 },
];
const feet = (col: number, row: number): PetState => ({ pos: { x: (col + 0.5) * CELL_W, y: (row + 1) * CELL_H - 3 }, depthHosts: [] } as unknown as PetState);

describe('ordre de dessin', () => {
  it('trie par niveau d’abord, même si le bas du fond est plus bas', () => {
    expect(drawOrder(layout).map((p) => p.id)).toEqual(['sh', 'arm', 'tab']);
  });
});

describe('place d’un animal', () => {
  it('à découvert : niveau 2, derrière la table basse, devant l’étagère', () => {
    expect(petSlot(layout, feet(10, 17))).toBe(2);
  });
  it('sous la table basse : juste derrière elle', () => {
    const only: Layout = [{ id: 'tab', kind: 'coffee-table', col: 0, row: 14 }];
    expect(petSlot(only, feet(1, 15))).toBe(0);
  });
  it('derrière une étagère décollée du mur : juste derrière elle', () => {
    const only: Layout = [{ id: 'sh', kind: 'shelf', col: 0, row: 10 }];
    expect(petSlot(only, feet(2, 14))).toBe(0);
  });
  it('porté par le fauteuil : juste devant lui', () => {
    const onArm = { ...feet(2, 14), depthHosts: ['arm'] } as unknown as PetState;
    expect(petSlot(layout, onArm)).toBe(2);
  });
});

describe('sélection en pile', () => {
  it('liste les objets superposés, de l’avant vers le fond', () => {
    expect(stackAt(layout, 'tab')).toEqual(['tab', 'arm', 'sh']);
  });
  it('un nouveau toucher passe à l’objet derrière, puis revient au premier', () => {
    expect(nextInStack(layout, null, 'tab')).toBe('tab');
    expect(nextInStack(layout, 'tab', 'tab')).toBe('arm');
    // Le toucher arrive toujours à l'objet de devant : la pile continue.
    expect(nextInStack(layout, 'arm', 'tab')).toBe('sh');
    expect(nextInStack(layout, 'sh', 'tab')).toBe('tab');
  });
  it('un objet seul déjà sélectionné se désélectionne', () => {
    const alone: Layout = [{ id: 'x', kind: 'chair', col: 20, row: 15 }];
    expect(nextInStack(alone, 'x', 'x')).toBeNull();
  });
});
```

La pile ne contient que les objets qui chevauchent le rectangle de l'objet touché. La fenêtre (rangées 1 à 5) ne chevauche pas la table (rangées 14-15) : elle n'est pas dans `stackAt('tab')`.

- [ ] **Step 2 : lancer et voir échouer**

Run : `npx vitest run tests/core/library/depth-order.test.ts`
Expected : FAIL (module absent).

- [ ] **Step 3 : implémenter `depth-order.ts`**

```ts
import { sizeOf } from './furniture-catalog';
import type { Layout, Placed } from './library-types';
import { CELL_H, CELL_W, depthOf, isStanding, rectOf, type Rect } from './room-grid';
import type { PetState } from './pets/motion';

type Standing = Extract<Placed, { col: number; row: number }> & { kind: Exclude<Placed['kind'], 'computer' | 'small' | 'stored' | 'wall' | 'window'> };

const bottom = (p: Standing): number => p.row + sizeOf(p.kind).h;

// Meubles debout (hors tapis) dans l'ordre de dessin : niveau d'abord, puis le bas le plus haut d'abord.
export function drawOrder(layout: Layout): Standing[] {
  const items = layout.filter((p): p is Standing => isStanding(p) && p.kind !== 'rug');
  return items
    .map((p, i) => ({ p, i, d: depthOf(layout, p), b: bottom(p) }))
    .sort((a, b) => a.d - b.d || a.b - b.b || a.i - b.i)
    .map((e) => e.p);
}

const contains = (r: Rect, x: number, y: number): boolean =>
  x >= r.col * CELL_W && x < (r.col + r.w) * CELL_W && y >= r.row * CELL_H && y <= (r.row + r.h) * CELL_H;

// Nombre de meubles dessinés avant l'animal. Porté : juste devant son porteur. Pieds dans l'emprise d'un meuble
// (dessous ou derrière lui) : juste derrière le premier dessiné d'entre eux. Sinon niveau 2, à sa ligne de pieds.
export function petSlot(layout: Layout, state: PetState): number {
  const order = drawOrder(layout);
  const hosts = state.depthHosts.filter((id): id is string => id !== null);
  if (hosts.length > 0) {
    const at = Math.max(...hosts.map((id) => order.findIndex((p) => p.id === id)));
    if (at >= 0) return at + 1;
  }
  const { x, y } = state.pos;
  const covering = order.findIndex((p) => contains(rectOf(p)!, x, y));
  if (covering >= 0) return covering;
  return order.filter((p) => {
    const d = depthOf(layout, p);
    return d < 2 || (d === 2 && bottom(p) * CELL_H <= y);
  }).length;
}
```

Remarque : `Standing` est déjà défini dans `room-grid.ts` (`Extract<Placed, { kind: StandingKind }>`). L'exporter de là et l'importer, plutôt que de recopier le type ci-dessus.

`stackAt` : les candidats sont `drawOrder(layout)` plus les fenêtres et les objets `wall`, ordonnés « niveau 0 d'abord, puis `drawOrder` ». On garde ceux dont `rectOf` intersecte le rectangle de `id`, puis on inverse l'ordre (l'avant d'abord).

```ts
export function nextInStack(layout: Layout, selectedId: string | null, tappedId: string): string | null {
  const stack = stackAt(layout, tappedId);
  const at = selectedId ? stack.indexOf(selectedId) : -1;
  if (at < 0) return tappedId;
  if (stack.length === 1) return null;
  return stack[(at + 1) % stack.length]!;
}
```

`pets/depth.ts` : supprimer `depthKey` et `depthIndex` (plus d'appelants après ce changement) et réexporter `petSlot` depuis `depth-order.ts`, ou bien modifier l'import du runner. `runner.ts` : `let behind = petSlot(room.layout, state);` et, pour le robot porteur, `behind = petSlot(room.layout, robotState);`. `depthY` reste comme avant.

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run tests/core/library/depth-order.test.ts tests/core/library/pets-runner.test.ts tests/core/library/pets-scenes.test.ts tests/core/library/library-pets.test.ts && npx tsc --noEmit`
Expected : PASS. Si un test du runner fixait `behind` avec l'ancien tri par le bas seul, recalculer la valeur attendue avec la nouvelle règle et l'expliquer dans le rapport.

- [ ] **Step 5 : commit**

```bash
git add src/core/library/depth-order.ts src/core/library/pets tests/core/library/depth-order.test.ts tests/core/library/pets-runner.test.ts
git commit -m "feat(bibliotheque): ordre de dessin par niveau, place des animaux, sélection en pile"
```

---

### Task 3: Rendu de la pièce par niveaux (RoomView)

**Files :**
- Modify : `src/content/RoomView.tsx` (assemblage des couches, l. ~274-300 et ~470-480)
- Test : `tests/content/room-depth.test.tsx` (nouveau), à partir du gabarit de `tests/content/library-furniture-view.test.tsx` (en-tête jsdom, `IS_REACT_ACT_ENVIRONMENT`, `mount()`)

**Interfaces :**
- Consumes : `drawOrder`, `depthOf` (Tâches 1-2) ; `PetView.behind` vaut désormais `petSlot`
- Produces : dans le DOM, chaque meuble garde `data-furniture` et `data-id` ; nouveaux attributs `data-depth="0|1|2|3"` sur le groupe de chaque objet dessiné, `data-contact-shadow={id}` sur l'ombre, `data-selected-copy` sur la copie de l'objet sélectionné

Ordre final à produire dans `<svg>` (remplace `backLayer`, `wallLayer`, `middle`, `computers`, `smalls`, `cardLayer`) :
1. tapis ;
2. niveau 0 : fenêtres (comme aujourd'hui), puis objets `wall` (`wallLayer`) ;
3. pour chaque meuble de `drawOrder(layout)` : son ombre de contact (Tâche 5), le meuble, puis **ses** objets portés (ordinateur, petits objets, cartes rangées de cette étagère, écran de cet ordinateur), les animaux non perchés insérés à leur rang `behind` comme aujourd'hui ;
4. animaux perchés (`topPets`), lumière, bulles, cases, fantômes (inchangés).

- [ ] **Step 1 : tests qui échouent**

```tsx
// tests/content/room-depth.test.tsx — même gabarit que library-furniture-view.test.tsx
const room: Room = {
  id: 'r1', name: 'Salon', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [],
  layout: [
    { id: 'tab', kind: 'coffee-table', col: 0, row: 14 },
    { id: 'sh', kind: 'shelf', col: 0, row: 10 },
    { id: 'pl', kind: 'small', item: 'plant', hostId: 'sh', slot: 0 },
    { id: 'arm', kind: 'armchair', col: 1, row: 13 },
    { id: 'pos', kind: 'wall', shape: 'poster', col: 1, row: 7, slug: 'Paris' },
  ],
};

it('dessine du fond vers l’avant, chaque objet porté juste après son porteur', () => {
  const svg = mount();
  const ids = [...svg.querySelectorAll('[data-id]')].map((n) => n.getAttribute('data-id'));
  expect(ids.indexOf('pos')).toBeLessThan(ids.indexOf('sh'));
  expect(ids.indexOf('sh')).toBeLessThan(ids.indexOf('pl'));
  expect(ids.indexOf('pl')).toBeLessThan(ids.indexOf('arm'));
  expect(ids.indexOf('arm')).toBeLessThan(ids.indexOf('tab'));
});

it('marque le niveau de chaque objet', () => {
  const svg = mount();
  expect(svg.querySelector('[data-id="tab"]')!.closest('[data-depth]')!.getAttribute('data-depth')).toBe('3');
  expect(svg.querySelector('[data-id="pos"]')!.closest('[data-depth]')!.getAttribute('data-depth')).toBe('0');
});

it('redessine l’objet sélectionné par-dessus, sans capter le toucher', () => {
  const svg = mount({ editing: true, selectedId: 'sh' });
  const copy = svg.querySelector('[data-selected-copy]')!;
  expect(copy.getAttribute('pointer-events')).toBe('none');
  // La copie vient après la table basse.
  const all = [...svg.querySelectorAll('[data-id="tab"], [data-selected-copy]')];
  expect(all.at(-1)).toBe(copy);
});
```

(Ajouter à `mount` des options `{ editing?: boolean; selectedId?: string | null }` passées à `RoomView`.)

- [ ] **Step 2 : lancer et voir échouer**

Run : `npx vitest run tests/content/room-depth.test.tsx`
Expected : FAIL (les petits objets passent après tout le reste, `data-depth` absent).

- [ ] **Step 3 : implémenter**

- Remplacer `sortedStanding` par `drawOrder(room.layout)`.
- Construire, par porteur, la liste de ses objets portés : `carried.get(hostId)` à partir de `computer` (`deskId`), `small` (`hostId`), `stored` (`shelfId`) et des écrans. On réutilise `renderPlaced` pour les ordinateurs et les petits objets, et `cardGroup` pour les cartes rangées et les écrans (déplacer leur construction dans une fonction `cardOf(placed)` appelée par porteur).
- Envelopper chaque meuble et ses objets portés dans `<g data-depth={depthOf(...)}>`. Envelopper aussi le niveau 0 dans un `<g data-depth="0">`.
- Les animaux : même `splice` qu'aujourd'hui, mais sur la liste des groupes « meuble + objets portés », de sorte que `behind` compte des meubles.
- Objet sélectionné (`editing && selectedId`, meuble debout ou objet accroché) : une copie `<g data-selected-copy="" pointer-events="none">{art + outline}</g>` est ajoutée juste après les animaux non perchés. Factoriser la construction de `art` de `renderPlaced` dans une fonction `artOf(placed, rect)` pour éviter de recopier.
- Le contour actuel (`outline`) reste sur l'objet lui-même.

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run tests/content/room-depth.test.tsx tests/content/library-furniture-view.test.tsx tests/content/library-furniture.test.tsx tests/content/room-pet-shadows.test.tsx tests/content/library-steampunk-furniture.test.tsx tests/content/library-window-furniture.test.tsx tests/content/room-window.test.tsx && npx tsc --noEmit`
Expected : PASS. Mettre à jour un instantané seulement si le seul changement est l'ordre ou le `<g data-depth>` ajouté, et le dire dans le rapport.

- [ ] **Step 5 : commit**

```bash
git add src/content/RoomView.tsx tests/content/room-depth.test.tsx
git commit -m "feat(bibliotheque): pièce dessinée par niveaux, objets portés avec leur meuble"
```

---

### Task 4: Boutons ⤒/⤓ et toucher répété (LibraryPanel)

**Files :**
- Modify : `src/content/LibraryPanel.tsx` (`onPick` l. ~644, `onCardTap` l. ~589, barre de l'objet sélectionné l. ~1043)
- Modify : `src/content/furniture-icons.ts` (ou l'endroit où `ICONS` est défini) : icônes `depthFront`, `depthBack`
- Test : `tests/content/library-panel.test.tsx` (ajouter un `describe('niveaux')` en suivant les montages existants du fichier)

**Interfaces :**
- Consumes : `nextInStack`, `canShiftDepth`, `shiftDepth` (Tâches 1-2)

- [ ] **Step 1 : tests qui échouent** (dans le style du fichier : monter le panneau sur une pièce `[shelf sh (0,10), armchair arm (1,13)]`, passer en Aménager)

```tsx
describe('niveaux', () => {
  it('avancer / reculer change le niveau du meuble sélectionné', async () => {
    // toucher le fauteuil → la barre montre « Avancer » et « Reculer »
    // « Reculer » grisé (l'étagère occupe le niveau 1 sur ces cases), « Avancer » actif
    // clic « Avancer » → la pièce enregistrée contient { id: 'arm', depth: 3 }
  });
  it('un second toucher sélectionne l’objet derrière', async () => {
    // toucher le fauteuil : sélectionné ; le toucher encore : l'étagère est sélectionnée (contour sur sh)
  });
});
```

Écrire ces deux tests avec les helpers réels du fichier, en clic sur `[data-id="arm"]` et en boutons `[data-action="depth-front"]` / `[data-action="depth-back"]`. Les vérifications portent sur l'attribut `disabled` et sur la pièce enregistrée par le faux dépôt du fichier.

- [ ] **Step 2 : lancer et voir échouer**

Run : `npx vitest run tests/content/library-panel.test.tsx -t niveaux`
Expected : FAIL.

- [ ] **Step 3 : implémenter**

- Dans `onPick` et `onCardTap`, remplacer `setSelectedId(id === selectedId ? null : id)` par `setSelectedId(nextInStack(layout, selectedId, id))`.
- Dans la barre, pour un meuble debout hors tapis sélectionné :

```tsx
<Btn label="Avancer" data={{ action: 'depth-front' }} disabled={!canShiftDepth(layout, selectedId, 1)} onClick={() => void editLayout((l) => shiftDepth(l, selectedId, 1))}><Icon paths={ICONS.depthFront} /></Btn>
<Btn label="Reculer" data={{ action: 'depth-back' }} disabled={!canShiftDepth(layout, selectedId, -1)} onClick={() => void editLayout((l) => shiftDepth(l, selectedId, -1))}><Icon paths={ICONS.depthBack} /></Btn>
```

Si `Btn` n'a pas de `disabled`, l'ajouter : attribut HTML `disabled` et opacité réduite, comme les autres boutons grisés du projet. Les icônes sont des tracés SVG dans le style des autres (24×24, trait) : une flèche vers le haut sur une barre (⤒) et une flèche vers le bas sur une barre (⤓).
- `furniture-drag.ts` reste inchangé : `canPlace` est `ok` dès qu'un niveau est libre, et `moveStanding` (Tâche 1) choisit le repli.

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run tests/content/library-panel.test.tsx tests/content/furniture-drag.test.ts tests/content/furniture-drag-home.test.ts tests/content/furniture-drag-window.test.ts && npx tsc --noEmit`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/content/LibraryPanel.tsx src/content/furniture-icons.ts tests/content/library-panel.test.tsx
git commit -m "feat(bibliotheque): avancer / reculer un meuble, toucher répété pour l'objet derrière"
```

---

### Task 5: Ombres de contact + l'animal passe là où il y a la place

**Files :**
- Modify : `src/content/RoomView.tsx` (ombre de contact avant chaque meuble)
- Modify : `src/core/library/pets/walk-map.ts:18-35` (`buildWalkMap`)
- Test : `tests/core/library/pets-walk-map.test.ts` (ajouts ; corriger les attentes qui supposaient une emprise entièrement bloquée) ; `tests/content/room-depth.test.tsx` (ajout)

**Interfaces :**
- Consumes : `footOf`, `underOf`, `depthOf`, `drawOrder`

- [ ] **Step 1 : tests qui échouent**

```ts
// pets-walk-map.test.ts
describe('passer là où il y a la place', () => {
  it('bloque l’appui d’une étagère, laisse libre l’espace derrière elle', () => {
    const map = buildWalkMap([{ id: 'sh', kind: 'shelf', col: 0, row: 10 }], 24); // sol 12-17, appui 16-17
    expect(isFree(map, 1, 17)).toBe(false);
    expect(isFree(map, 1, 13)).toBe(true);
  });
  it('étagère contre le mur : aucune case derrière', () => {
    const map = buildWalkMap([{ id: 'sh', kind: 'shelf', col: 0, row: 6 }], 24); // sol 12-13 = appui
    expect(isFree(map, 1, 12)).toBe(false);
    expect(isFree(map, 1, 13)).toBe(false);
  });
  it('passe sous une table basse, même avec une chaise collée', () => {
    const map = buildWalkMap([
      { id: 't', kind: 'coffee-table', col: 4, row: 15 },
      { id: 'c', kind: 'chair', col: 8, row: 14 },
    ], 24);
    const path = groundPath(map, { col: 2, row: 16 }, { col: 11, row: 16 });
    expect(path).not.toBeNull();
    expect(path!.every((c) => c.row === 16)).toBe(true); // tout droit, sous la table puis sous la chaise
  });
  it('deux étagères collées ne laissent rien entre elles', () => {
    const map = buildWalkMap([
      { id: 'a', kind: 'shelf', col: 0, row: 10 },
      { id: 'b', kind: 'shelf', col: 6, row: 10 },
    ], 24);
    expect(isFree(map, 5, 17)).toBe(false);
    expect(isFree(map, 6, 17)).toBe(false);
  });
});
```

Vérifier la signature réelle de `groundPath` dans `walk-map.ts` et l'utiliser telle quelle. Si elle prend des `Pt`, passer `standPoint(col, row)`.

```tsx
// room-depth.test.tsx
it('ombre de contact seulement là où un objet est derrière', () => {
  const svg = mount();
  expect(svg.querySelector('[data-contact-shadow="tab"]')).not.toBeNull();   // l'étagère et le fauteuil sont derrière
  const alone = mount({ layout: [{ id: 'x', kind: 'chair', col: 20, row: 15 }] });
  expect(alone.querySelector('[data-contact-shadow]')).toBeNull();
});
```

- [ ] **Step 2 : lancer et voir échouer**

Run : `npx vitest run tests/core/library/pets-walk-map.test.ts tests/content/room-depth.test.tsx`
Expected : FAIL.

- [ ] **Step 3 : implémenter**

`buildWalkMap` : pour un meuble `floor`, ne bloquer que ses rangées d'appui `[row + h - foot, row + h - 1]`, et seulement si `!underOf(kind)`. Le reste de l'emprise est praticable, et les plateformes sont inchangées. Mettre à jour le commentaire du type `WalkMap`.

Ombre de contact (`RoomView`) : pour chaque meuble M de `drawOrder`, on cherche les objets de niveau inférieur (meubles déjà dessinés, fenêtres, objets accrochés) dont le rectangle intersecte `rect(M)` décalé de (+5 px, +5 px). S'il y en a :

```tsx
<clipPath id={`${worldId}-cs-${M.id}`}>{behindRects.map((r, i) => <rect key={i} {...r} />)}</clipPath>
<rect data-contact-shadow={M.id} x={rect.x + 5} y={rect.y + 5} width={rect.w} height={rect.h} rx={3}
  fill={palette.text} fillOpacity={0.18} clipPath={`url(#${worldId}-cs-${M.id})`} style={{ pointerEvents: 'none' }} />
```

Ce rectangle se dessine juste avant M, dans son `<g data-depth>`. Il ne faut aucun filtre de flou : c'est coûteux sur Android.

**Ruling (écart à la spec) :** l'intérieur de la pièce n'a pas de mode Ghibli (le Ghibli ne s'applique qu'à la vue par la fenêtre). On utilise donc une seule ombre nette, translucide, à la couleur d'encre de la palette du style, au lieu de « violet en Ghibli / flou en classique ».

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run tests/core/library/pets-walk-map.test.ts tests/core/library/pets-route.test.ts tests/core/library/pets-brain.test.ts tests/core/library/pets-scenes.test.ts tests/content/room-depth.test.tsx tests/content/room-pet-shadows.test.tsx && npx tsc --noEmit`
Expected : PASS. Les attentes de `pets-walk-map` / `pets-route` qui supposaient une emprise entièrement bloquée sont recalculées avec la règle d'appui et listées dans le rapport.

- [ ] **Step 5 : commit**

```bash
git add src/core/library/pets/walk-map.ts src/content/RoomView.tsx tests/core/library/pets-walk-map.test.ts tests/core/library/pets-route.test.ts tests/content/room-depth.test.tsx
git commit -m "feat(bibliotheque): ombres de contact, l'animal passe sous les tables et derrière les meubles décollés"
```

---

### Task 6: Vérification, PR, pré-prod, capture

**Files :** aucun fichier de code. Mise à jour de la mémoire du projet (`project_bibliotheque.md`).

- [ ] **Step 1 :** `npx tsc --noEmit` (0) et `npx vitest run tests/core/library tests/content/room-depth.test.tsx tests/content/library-*.test.tsx tests/content/room-*.test.tsx tests/content/furniture-drag*.test.ts`. Relever les échecs préexistants connus, qui sont hors sujet (délais d'`install-layer`, `install-ghibli` « phase suit la hauteur »).
- [ ] **Step 2 :** relecture de toute la branche (modèle le plus capable), avec une seule vague de corrections.
- [ ] **Step 3 :** pousser, ouvrir la PR (sans WikiHow), la fusionner, puis `npm run preprod` et `npm run build`.
- [ ] **Step 4 :** capture sur le téléphone (pré-prod) d'une pièce « fenêtre + bibliothèque devant + fauteuil + table basse » et d'un chat sous la table, puis l'envoyer à l'utilisateur pour validation (règles « Android d'abord » et « capture de validation »).
- [ ] **Step 5 :** mettre à jour la mémoire (`project_bibliotheque.md` + ligne de `MEMORY.md`) avec le n° de la PR, le n° de la pré-prod et ce qui reste à vérifier à la main.
