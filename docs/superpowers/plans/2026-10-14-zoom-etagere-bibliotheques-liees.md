# Second zoom sur une étagère et bibliothèques liées — plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Depuis la vue de face d'une bibliothèque, toucher une tablette zoome sur elle (cartes en grand + titres, ↑ ↓ / glissement) ; deux bibliothèques collées bord à bord se lient automatiquement (⛓ pour délier) et s'ouvrent ensemble.

**Architecture:** Le lien est **calculé** à partir des positions (`shelf-link.ts`, pur) : même angle + coin avant gauche de B sur le coin avant droit de A (au sol, en cm, à une demi-case près), paires de gauche à droite, drapeau `unlinked` pour refuser. La cible du zoom d'étagère devient une liste d'ids (1 ou 2). L'état du zoom gagne un `level` (null = vue de face) ; une nouvelle vue `ShelfBoardZoom` dessine la tablette en cm, à plat.

**Tech Stack:** TypeScript, React 19, SVG, Vitest (jsdom), zod, WXT.

**Spec:** `docs/superpowers/specs/2026-10-14-zoom-etagere-bibliotheques-liees-design.md`

## Global Constraints

- Même code pour l'extension et l'app Android ; validation d'abord sur le vrai téléphone.
- Glyphes plutôt que du texte dans les boutons (`Icon` + `ICONS`), libellé dans `aria-label`/`title`.
- Deux bibliothèques au maximum par lien ; une carte reste rangée dans sa propre bibliothèque (`shelfId`).
- Nouveaux dessins : commentaire « Dessin provisoire Opus — Fable n'est pas passé, reprise prévue. »
- Tests : seulement les familles touchées — `npm run test:famille -- scene-piece` (et `socle` pour la fiche WikiHow). Tout nouveau fichier de test est ajouté à la famille `scene-piece` dans `tests/familles.ts`.
- Dossier de travail : worktree `C:\Users\maxim\Downloads\Wikimasters-zoom-etagere`, branche `feat/zoom-etagere-liee` (`node_modules` et `.wxt` déjà présents).
- Commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Rangée de 3 bibliothèques** : A–B liées, C seule ; délier A puis rapprocher ne doit jamais produire de groupe de 3 ni de lien « fantôme » quand on écarte un meuble (test dans la tâche 1).
- **Bouton ⛓ sans effet** : il ne doit apparaître que si l'appui change vraiment quelque chose (C dans A–B–C n'a pas de bouton) (tâche 1 `canToggleShelfLink` + tâche 2).
- **Retour Android dans le second zoom** : il ramène à la vue de face sans fermer le zoom ni laisser d'entrée d'historique orpheline (tâche 5).
- **Glissement qui finit sur une carte** : il ne doit pas ouvrir la fiche (tâche 4 : clic avalé après un glissement).
- **Seule la partenaire a des cartes** : toucher la bibliothèque vide d'une paire ouvre quand même la vue des deux (tâche 3).

---

### Task 1: Lien entre bibliothèques (pur) + drapeau `unlinked`

**Files:**
- Create: `src/core/library/shelf-link.ts`
- Modify: `src/core/library/library-types.ts` (membre « meuble au sol » de `Placed`)
- Modify: `src/core/library/library-book.ts:24-25` (schéma)
- Modify: `tests/familles.ts` (famille `scene-piece`)
- Test: `tests/core/library/shelf-link.test.ts`

**Interfaces:**
- Produces:
  - `touchesRight(a: Standing, b: Standing): boolean`
  - `linkCandidateOf(layout: Layout, id: string): string | null`
  - `shelfGroupOf(layout: Layout, id: string): string[]` (ids gauche → droite vus de face ; `[]` si `id` n'est pas une étagère)
  - `toggleShelfLink(layout: Layout, id: string): Layout`
  - `canToggleShelfLink(layout: Layout, id: string): boolean`
  - champ `unlinked?: true` sur les meubles au sol.

Mesures relevées sur le modèle (étagère 80 × 30 cm) : position de B « collée à droite » de A posée en (col, row), pour chaque angle — `0:(+4,0) 1:(+3,+1) 2:(0,+2) 3:(−3,+1) 4:(−4,0) 5:(−3,−1) 6:(0,−2) 7:(+3,−1)` ; aucune ne chevauche A au sol.

- [ ] **Step 1: Écrire les tests**

```ts
// tests/core/library/shelf-link.test.ts
import { describe, expect, it } from 'vitest';
import type { Angle } from '../../../src/core/library/footprint';
import { parseLibraryState, createInitialState } from '../../../src/core/library/library-book';
import type { Layout, Placed } from '../../../src/core/library/library-types';
import { canToggleShelfLink, linkCandidateOf, shelfGroupOf, toggleShelfLink, touchesRight } from '../../../src/core/library/shelf-link';
import type { Standing } from '../../../src/core/library/room-grid';

const RIGHT: Record<Angle, [number, number]> = { 0: [4, 0], 1: [3, 1], 2: [0, 2], 3: [-3, 1], 4: [-4, 0], 5: [-3, -1], 6: [0, -2], 7: [3, -1] };
const shelf = (id: string, col: number, row: number, angle: Angle = 0, extra: Partial<Standing> = {}): Standing =>
  ({ id, kind: 'shelf', col, row, ...(angle ? { angle } : {}), ...extra }) as Standing;

describe('touchesRight', () => {
  for (const a of [0, 1, 2, 3, 4, 5, 6, 7] as Angle[]) {
    it(`angle ${a} : collée à droite → liée ; une case plus loin → non`, () => {
      const [dc, dr] = RIGHT[a];
      const A = shelf('a', 20, 10, a);
      expect(touchesRight(A, shelf('b', 20 + dc, 10 + dr, a))).toBe(true);
      expect(touchesRight(shelf('b', 20 + dc, 10 + dr, a), A)).toBe(false);
      const far = dc === 0 ? [0, dr + Math.sign(dr)] : [dc + Math.sign(dc), dr];
      expect(touchesRight(A, shelf('b', 20 + far[0]!, 10 + far[1]!, a))).toBe(false);
    });
  }
  it('angles différents → non ; décalée en profondeur → non', () => {
    expect(touchesRight(shelf('a', 0, 6), shelf('b', 4, 6, 1))).toBe(false);
    expect(touchesRight(shelf('a', 0, 6), shelf('b', 4, 7))).toBe(false);
  });
});

describe('shelfGroupOf', () => {
  it('deux collées : groupe gauche → droite, depuis l’une ou l’autre', () => {
    const l: Layout = [shelf('b', 4, 6), shelf('a', 0, 6)];
    expect(shelfGroupOf(l, 'a')).toEqual(['a', 'b']);
    expect(shelfGroupOf(l, 'b')).toEqual(['a', 'b']);
  });
  it('rangée de 3 : A–B liées, C seule ; de 4 : A–B et C–D', () => {
    const l3: Layout = [shelf('a', 0, 6), shelf('b', 4, 6), shelf('c', 8, 6)];
    expect(shelfGroupOf(l3, 'c')).toEqual(['c']);
    expect(shelfGroupOf(l3, 'b')).toEqual(['a', 'b']);
    const l4: Layout = [...l3, shelf('d', 12, 6)];
    expect(shelfGroupOf(l4, 'c')).toEqual(['c', 'd']);
  });
  it('déliée → seule ; pas une étagère → []', () => {
    expect(shelfGroupOf([shelf('a', 0, 6, 0, { unlinked: true }), shelf('b', 4, 6)], 'b')).toEqual(['b']);
    expect(shelfGroupOf([{ id: 'x', kind: 'sofa', col: 0, row: 14 }], 'x')).toEqual([]);
  });
});

describe('délier / relier', () => {
  it('délier pose le drapeau ; relier le retire des deux', () => {
    const l: Layout = [shelf('a', 0, 6), shelf('b', 4, 6)];
    const off = toggleShelfLink(l, 'b');
    expect(off.find((p) => p.id === 'b')).toMatchObject({ unlinked: true });
    expect(shelfGroupOf(off, 'a')).toEqual(['a']);
    const on = toggleShelfLink(off, 'a');
    expect(on.some((p) => 'unlinked' in p)).toBe(false);
    expect(shelfGroupOf(on, 'a')).toEqual(['a', 'b']);
  });
  it('bouton seulement si l’appui change quelque chose', () => {
    expect(canToggleShelfLink([shelf('a', 0, 6)], 'a')).toBe(false);
    expect(canToggleShelfLink([shelf('a', 0, 6), shelf('b', 4, 6)], 'a')).toBe(true);
    // C dans A–B–C : relier C ne ferait rien (A–B gardent leur paire).
    expect(canToggleShelfLink([shelf('a', 0, 6), shelf('b', 4, 6), shelf('c', 8, 6)], 'c')).toBe(false);
    expect(linkCandidateOf([shelf('a', 0, 6), shelf('b', 4, 6)], 'b')).toBe('a');
  });
  it('écarter un meuble défait le lien sans rien nettoyer', () => {
    expect(shelfGroupOf([shelf('a', 0, 6), shelf('b', 5, 6)], 'a')).toEqual(['a']);
  });
});

describe('stockage', () => {
  it('le drapeau unlinked survit à la relecture', () => {
    const state = createInitialState();
    const layout: Placed[] = [shelf('a', 0, 6, 0, { unlinked: true })];
    const raw = JSON.parse(JSON.stringify({ ...state, rooms: state.rooms.map((r) => ({ ...r, layout })) }));
    expect(parseLibraryState(raw).rooms[0]!.layout[0]).toMatchObject({ unlinked: true });
  });
});
```

- [ ] **Step 2: Ajouter le fichier à la famille et vérifier l'échec**

Dans `tests/familles.ts`, famille `scene-piece`, ajouter `'shelf-link.*'` dans `lib(...)` (après `'zoom-target.*'`).

Run: `npx vitest run tests/core/library/shelf-link.test.ts --project=scene-piece`
Expected: FAIL (module `shelf-link` introuvable).

- [ ] **Step 3: Type et schéma**

`src/core/library/library-types.ts`, membre « meuble au sol » de `Placed` :

```ts
  | { id: string; kind: StandingKind; col: number; row: number; lit?: boolean; depth?: StandDepth; angle?: Angle; unlinked?: true }
```

et dans le commentaire au-dessus, ajouter la ligne :

```ts
// `unlinked` (étagères) : refuse le lien automatique avec une étagère collée (shelf-link.ts) ; absent = liée si collée.
```

`src/core/library/library-book.ts` ligne 24 : ajouter `unlinked: z.literal(true).optional()` à l'objet des meubles au sol :

```ts
  z.object({ id: z.string(), kind: z.enum(STANDING_KINDS), col: z.number().int(), row: z.number().int(), lit: z.boolean().optional(), angle: z.unknown().optional(), unlinked: z.literal(true).optional() })
```

(le `.transform` qui suit garde `rest` tel quel : rien d'autre à changer.)

- [ ] **Step 4: Écrire `shelf-link.ts`**

```ts
import { drawSize } from './footprint';
import { FURNITURE_MODELS } from './furniture-models';
import { localPointOf } from './furniture-render3d';
import type { Layout } from './library-types';
import { angleOf, type Standing } from './room-grid';

// Deux bibliothèques collées bord à bord, tournées pareil, s'affichent ensemble (zoom). Le lien n'est jamais enregistré : il se lit
// dans les positions ; seul le refus (`unlinked`) l'est. Deux au maximum : une rangée se lie par paires de gauche à droite (vu de face).

const MODEL = FURNITURE_MODELS.shelf;
// Tolérance : une demi-case (21 cm de large, 50 cm de profondeur) ; en diagonale les cases arrondissent le pas de 80 cm.
const TOL_X = 10.5;
const TOL_Z = 25;

const isShelf = (p: Layout[number]): p is Standing => p.kind === 'shelf';

// Coin avant (x = 0 : gauche, x = MODEL.w : droit, vus de face) posé au sol, en cm de la pièce : x vers la droite, z vers le fond.
function corner(s: Standing, x: number): [number, number] {
  const a = angleOf(s);
  const l = localPointOf(MODEL, a, [x, 0, 0]);
  return [s.col * 21 + l.x, l.z - (s.row + drawSize('shelf', a).h - 1) * 50];
}

// `b` est collée à droite de `a` (vu de face) : même angle, coin avant gauche de `b` sur le coin avant droit de `a`.
export function touchesRight(a: Standing, b: Standing): boolean {
  if (a.id === b.id || angleOf(a) !== angleOf(b)) return false;
  const [ax, az] = corner(a, MODEL.w);
  const [bx, bz] = corner(b, 0);
  return Math.abs(bx - ax) < TOL_X && Math.abs(bz - az) < TOL_Z;
}

// Voisine collée (à droite d'abord, sinon à gauche), drapeaux ignorés : celle que le bouton ⛓ relierait.
export function linkCandidateOf(layout: Layout, id: string): string | null {
  const self = layout.find((p) => p.id === id);
  if (!self || !isShelf(self)) return null;
  const all = layout.filter(isShelf);
  return (all.find((b) => touchesRight(self, b)) ?? all.find((b) => touchesRight(b, self)))?.id ?? null;
}

// Bibliothèques affichées avec `id`, de gauche à droite (1 ou 2) ; [] si `id` n'est pas une étagère.
export function shelfGroupOf(layout: Layout, id: string): string[] {
  const self = layout.find((p) => p.id === id);
  if (!self || !isShelf(self)) return [];
  if (self.unlinked) return [id];
  const all = layout.filter((p): p is Standing => isShelf(p) && !p.unlinked);
  const right = (a: Standing) => all.find((b) => touchesRight(a, b));
  const left = (a: Standing) => all.find((b) => touchesRight(b, a));
  // Tête de la rangée, puis la rangée entière ; on la découpe en paires depuis la tête.
  let head = self;
  const seen = new Set([head.id]);
  for (let l = left(head); l && !seen.has(l.id); l = left(head)) {
    head = l;
    seen.add(l.id);
  }
  const chain = [head];
  for (let r = right(head); r && !chain.some((c) => c.id === r!.id); r = right(chain[chain.length - 1]!)) chain.push(r);
  const i = chain.findIndex((c) => c.id === id);
  const start = i - (i % 2);
  return chain.slice(start, start + 2).map((c) => c.id);
}

// ⛓ : liée → refuse le lien sur cette étagère ; sinon retire le refus d'elle et de sa voisine collée.
export function toggleShelfLink(layout: Layout, id: string): Layout {
  if (shelfGroupOf(layout, id).length === 2) return layout.map((p) => (p.id === id && isShelf(p) ? { ...p, unlinked: true as const } : p));
  const other = linkCandidateOf(layout, id);
  if (!other) return layout;
  return layout.map((p) => {
    if ((p.id !== id && p.id !== other) || !isShelf(p) || !p.unlinked) return p;
    const { unlinked: _, ...rest } = p;
    return rest;
  });
}

// Le bouton ⛓ n'a de sens que si l'appui change le groupe affiché.
export function canToggleShelfLink(layout: Layout, id: string): boolean {
  if (shelfGroupOf(layout, id).length === 2) return true;
  return shelfGroupOf(toggleShelfLink(layout, id), id).length === 2;
}
```

- [ ] **Step 5: Lancer les tests**

Run: `npx vitest run tests/core/library/shelf-link.test.ts --project=scene-piece`
Expected: PASS (11 tests). Si `RIGHT` diffère pour un angle, corriger la table du test d'après `touchesRight` (les mesures ci-dessus viennent d'une sonde sur le modèle réel) — jamais la tolérance.

Run: `npx tsc --noEmit -p .`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add src/core/library/shelf-link.ts src/core/library/library-types.ts src/core/library/library-book.ts tests/core/library/shelf-link.test.ts tests/familles.ts
git commit -m "feat(bibliotheque): lien calculé entre deux bibliothèques collées"
```

---

### Task 2: Bouton ⛓ dans la bulle (Aménager) + contour de la partenaire

**Files:**
- Modify: `src/content/library-ui.tsx:14-20` (ICONS)
- Modify: `src/content/LibraryPanel.tsx` (bulle d'actions vers la ligne 1012, `<RoomView` vers la ligne 961)
- Modify: `src/content/RoomView.tsx` (Props ~l.67, `outline` l.236, l.338, l.360)
- Test: `tests/content/library-zoom.test.tsx` (nouveau `describe`)

**Interfaces:**
- Consumes: `shelfGroupOf`, `toggleShelfLink`, `canToggleShelfLink` (tâche 1).
- Produces: `ICONS.link`, `ICONS.unlink`, `ICONS.up`, `ICONS.down` ; prop `linkedId?: string | null` de `RoomView` ; `data-outline="selected" | "linked"` sur les contours.

- [ ] **Step 1: Tests jsdom**

Ajouter à la fin de `tests/content/library-zoom.test.tsx` :

```tsx
describe('bibliothèques liées (Aménager)', () => {
  const PAIR: Layout = [{ id: 'a', kind: 'shelf', col: 0, row: 6 }, { id: 'b', kind: 'shelf', col: 4, row: 6 }];
  it('⛓ seulement avec une voisine collée ; délier puis relier', async () => {
    await seed([{ id: 'a', kind: 'shelf', col: 0, row: 6 }]);
    await click('[data-action="edit"]');
    await click('[data-id="a"]');
    expect(q('[data-action="shelf-link"]')).toBeNull();
    // La sélection survit au changement de plan : « a » reste sélectionnée (si ce n'est pas le cas, la resélectionner en touchant le fond puis « a »).
    await seed(PAIR);
    expect(q('[data-action="shelf-link"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-outline="linked"]')).not.toBeNull();
    await click('[data-action="shelf-link"]');
    expect(repo.current()!.rooms[0]!.layout.find((p) => p.id === 'a')).toMatchObject({ unlinked: true });
    expect(q('[data-action="shelf-link"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(q('[data-outline="linked"]')).toBeNull();
    await click('[data-action="shelf-link"]');
    expect(repo.current()!.rooms[0]!.layout.some((p) => 'unlinked' in p)).toBe(false);
  });
});
```

(Si `repo.current()` n'existe pas sous ce nom, utiliser l'accesseur d'état du repo employé ailleurs dans `tests/content/library-panel.test.tsx`.)

Run: `npx vitest run tests/content/library-zoom.test.tsx --project=scene-piece`
Expected: FAIL (pas de bouton `shelf-link`).

- [ ] **Step 2: Icônes**

Dans `ICONS` (`src/content/library-ui.tsx`) :

```ts
  link: ['M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7', 'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
  unlink: ['M18.8 12.3l1.7-1.7a5 5 0 0 0-7-7l-1.7 1.7', 'M5.2 11.7l-1.7 1.7a5 5 0 0 0 7 7l1.7-1.7', 'M8 2v3', 'M2 8h3', 'M16 22v-3', 'M22 16h-3'],
  up: ['M12 19V5', 'M5 12l7-7 7 7'],
  down: ['M12 5v14', 'M19 12l-7 7-7-7'],
```

- [ ] **Step 3: Contour de la partenaire dans `RoomView`**

Props : ajouter après `selectedId: string | null;`

```ts
  // Bibliothèque liée à celle sélectionnée (Aménager) : même contour, pour voir le lien.
  linkedId?: string | null;
```

Déstructurer `linkedId = null` dans la signature de `RoomView`. Remplacer `outline` :

```tsx
  const outline = (rect: PxRect, kind: 'selected' | 'linked' = 'selected') => (
    <rect data-outline={kind} x={rect.x - 3} y={rect.y - 3} width={rect.w + 6} height={rect.h + 6} rx={6} fill="none" stroke="#378ADD" strokeWidth={2.5} strokeDasharray="6 4" />
  );
```

Ligne 338 :

```tsx
          {editing && selectedId === placed.id && outline(rect)}
          {editing && linkedId === placed.id && outline(rect, 'linked')}
```

- [ ] **Step 4: Bulle et `RoomView` dans `LibraryPanel`**

Import : `import { canToggleShelfLink, shelfGroupOf, toggleShelfLink } from '../core/library/shelf-link';`

Près de `selectedStanding` (l.730) :

```ts
  // Bibliothèque sélectionnée : sa partenaire liée (contour) et le bouton ⛓ quand l'appui change quelque chose.
  const selectedShelf = selectedItem?.kind === 'shelf' ? selectedItem : undefined;
  const linkedToSelected = selectedShelf ? (shelfGroupOf(layout, selectedShelf.id).find((id) => id !== selectedShelf.id) ?? null) : null;
```

Sur `<RoomView`, après `selectedId={selectedId}` : `linkedId={editing ? linkedToSelected : null}`.

Dans la bulle, juste après le bloc ⟲ ⟳ :

```tsx
            {selectedShelf && canToggleShelfLink(layout, selectedShelf.id) && (
              <Btn label={linkedToSelected ? 'Délier les bibliothèques' : 'Relier les bibliothèques'} pressed={linkedToSelected !== null} data={{ action: 'shelf-link' }} onClick={() => void editLayout((l) => toggleShelfLink(l, selectedShelf.id))}>
                <Icon paths={linkedToSelected ? ICONS.link : ICONS.unlink} />
              </Btn>
            )}
```

- [ ] **Step 5: Tests**

Run: `npx vitest run tests/content/library-zoom.test.tsx tests/content/library-sims-ui.test.tsx --project=scene-piece`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/content/library-ui.tsx src/content/LibraryPanel.tsx src/content/RoomView.tsx tests/content/library-zoom.test.tsx
git commit -m "feat(bibliotheque): bouton ⛓ délier/relier et contour de la bibliothèque liée"
```

---

### Task 3: Cible de zoom à deux bibliothèques + vue de face côte à côte

**Files:**
- Modify: `src/core/library/zoom-target.ts`
- Modify: `src/content/furniture-zoom.tsx` (réécriture ci-dessous)
- Modify: `src/content/use-furniture-zoom.ts`
- Modify: `src/content/LibraryPanel.tsx` (`tryZoom` l.666, `<FurnitureZoom` l.1080)
- Create: `src/content/shelf-board-zoom.tsx` (squelette ici, contenu en tâche 4)
- Test: `tests/core/library/zoom-target.test.ts`, `tests/content/furniture-zoom.test.tsx`, `tests/content/library-zoom.test.tsx`

**Interfaces:**
- Consumes: `shelfGroupOf` (tâche 1).
- Produces:
  - `type ZoomTarget = { kind: 'shelf'; ids: string[] } | { kind: 'desk'; id: string }`
  - `zoomIdsOf(t: ZoomTarget): string[]`
  - `unionBox(boxes: (Box | null)[]): Box | null`
  - `ZoomState = { target; from; phase; level: ShelfLevel | null }`, `useFurnitureZoom` renvoie aussi `setLevel(level: ShelfLevel | null): void`
  - props de `FurnitureZoom` : `level: ShelfLevel | null`, `onLevel: (level: ShelfLevel) => void` (en plus des existantes)
  - attributs : `data-zoom-piece={id}` (un par bibliothèque), `data-zoom-board={level}` (zone touchable d'une tablette), `data-zoom-level`.

- [ ] **Step 1: Tests purs**

Dans `tests/core/library/zoom-target.test.ts`, remplacer les attentes `{ kind: 'shelf', id: 's' }` par `{ kind: 'shelf', ids: ['s'] }` et ajouter :

```ts
  it('bibliothèques liées : les deux, même si seule la partenaire range une carte', () => {
    const l: Layout = [{ id: 'a', kind: 'shelf', col: 0, row: 6 }, { id: 'b', kind: 'shelf', col: 4, row: 6 }, { id: 'c', kind: 'stored', shape: 'cd', shelfId: 'b', level: 1, order: 0, slug: 'Paris' }];
    expect(zoomTargetOf(l, 'a')).toEqual({ kind: 'shelf', ids: ['a', 'b'] });
    expect(zoomTargetOf(l, 'c')).toEqual({ kind: 'shelf', ids: ['a', 'b'] });
    expect(zoomTargetOf([l[0]!, l[1]!], 'a')).toBeNull();
  });
  it('unionBox : rectangle englobant, null ignorés', () => {
    expect(unionBox([{ x: 0, y: 10, w: 10, h: 10 }, null, { x: 20, y: 0, w: 5, h: 5 }])).toEqual({ x: 0, y: 0, w: 25, h: 20 });
    expect(unionBox([null])).toBeNull();
  });
```

(importer `unionBox`.)

Run: `npx vitest run tests/core/library/zoom-target.test.ts --project=scene-piece` → FAIL.

- [ ] **Step 2: `zoom-target.ts`**

```ts
import type { Layout } from './library-types';
import { shelfGroupOf } from './shelf-link';

// Meuble qui ouvre la vue zoomée : une étagère (avec sa partenaire liée) dont l'une range au moins une carte,
// ou un bureau dont l'ordinateur affiche une carte.
export type ZoomTarget = { kind: 'shelf'; ids: string[] } | { kind: 'desk'; id: string };
export type Box = { x: number; y: number; w: number; h: number };

export const zoomIdsOf = (t: ZoomTarget): string[] => (t.kind === 'shelf' ? t.ids : [t.id]);

// Toucher une carte rangée vise son étagère, toucher un ordinateur vise son bureau.
export function zoomTargetOf(layout: Layout, id: string): ZoomTarget | null {
  const item = layout.find((p) => p.id === id);
  if (!item) return null;
  if (item.kind === 'stored') return zoomTargetOf(layout, item.shelfId);
  if (item.kind === 'computer') return zoomTargetOf(layout, item.deskId);
  if (item.kind === 'shelf') {
    const ids = shelfGroupOf(layout, id);
    return layout.some((p) => p.kind === 'stored' && ids.includes(p.shelfId)) ? { kind: 'shelf', ids } : null;
  }
  if (item.kind === 'desk') return layout.some((p) => p.kind === 'computer' && p.deskId === id && p.slug) ? { kind: 'desk', id } : null;
  return null;
}

// Rectangle englobant (caméra sur deux bibliothèques) ; null si aucun n'est mesuré.
export function unionBox(boxes: (Box | null)[]): Box | null {
  const b = boxes.filter((x): x is Box => x !== null);
  if (b.length === 0) return null;
  const x = Math.min(...b.map((r) => r.x));
  const y = Math.min(...b.map((r) => r.y));
  return { x, y, w: Math.max(...b.map((r) => r.x + r.w)) - x, h: Math.max(...b.map((r) => r.y + r.h)) - y };
}
```

(garder `cameraOf` et `zoomRectOf` inchangés en dessous.)

- [ ] **Step 3: `use-furniture-zoom.ts` — niveau**

```ts
import type { ShelfLevel } from '../core/library/library-types';
export type ZoomState = { target: ZoomTarget; from: Box | null; phase: ZoomPhase; level: ShelfLevel | null };
```

Dans `open` : `setZoom({ target, from, phase: 'opening', level: null });`. Ajouter :

```ts
  // Second zoom : la tablette `level` (null : retour à la vue de face). Pas d'entrée d'historique en plus : le retour Android
  // passe par onBeforeClose, qui ramène à la vue de face.
  const setLevel = (level: ShelfLevel | null) => setZoom((z) => (z ? { ...z, level } : z));
```

Type de retour et `return { zoom, open, close, reset, setLevel };`.

- [ ] **Step 4: Squelette `shelf-board-zoom.tsx`**

```tsx
// Dessin provisoire Opus — Fable n'est pas passé, reprise prévue.
import type { ReactElement } from 'react';
import type { Room, ShelfLevel } from '../core/library/library-types';

export type ShelfBoardProps = {
  shelfIds: string[];
  level: ShelfLevel;
  room: Room;
  cards: Record<string, { title: string; imageUrl?: string }>;
  imageOf: (slug: string) => string | undefined;
  onCard: (slug: string) => void;
  onLevel: (level: ShelfLevel) => void;
};

export function ShelfBoardZoom({ level }: ShelfBoardProps): ReactElement {
  return <div className="wmt-lib-board" data-shelf-board={level} />;
}
```

- [ ] **Step 5: Réécrire `furniture-zoom.tsx`**

Remplacer le fichier par :

```tsx
// Dessin provisoire Opus — reprise Fable prévue.
import { useEffect, useId, useMemo, useState, type ReactElement } from 'react';
import { drawSize, faceFrame, type Angle } from '../core/library/footprint';
import { FURNITURE_MODELS } from '../core/library/furniture-models';
import { openingOf } from '../core/library/furniture-render3d';
import type { Placed, Room, ShelfLevel } from '../core/library/library-types';
import { boxOfQuad, cardQuad, carriedPlacementOf, placementDepth, placementRectPx, storedDrawOrder, storedPlacementsOf } from '../core/library/carried-items';
import type { ItemPlacement } from '../core/library/item-models';
import { CELL_H, CELL_W, angleOf, isLit, shelfBoardsIn, shelfFreeIn, type PxRect } from '../core/library/room-grid';
import { paletteOf } from '../core/library/styles';
import { zoomIdsOf, zoomRectOf, type Box, type ZoomTarget } from '../core/library/zoom-target';
import { CarriedItem3D, Model3DArt, type ItemContent } from './model3d-art';
import { Icon, ICONS } from './library-ui';
import { reducedMotion } from './ghibli-sky';
import { ShelfBoardZoom } from './shelf-board-zoom';

export type ZoomPhase = 'opening' | 'open' | 'closing';
type Cards = Record<string, { title: string; imageUrl?: string }>;
type Props = {
  target: ZoomTarget;
  room: Room;
  cards: Cards;
  imageOf: (slug: string) => string | undefined;
  phase: ZoomPhase;
  // Rectangle du meuble (ou des deux bibliothèques liées) dans la scène au moment du toucher (départ du pivot) ; null : apparition au centre.
  from: Box | null;
  stage: { w: number; h: number };
  // Tablette zoomée (second zoom) ; null : vue de face.
  level: ShelfLevel | null;
  onCard: (slug: string) => void;
  // Toucher une tablette ou une carte rangée (vue de face), ↑ ↓ ou glisser (second zoom) : afficher cette tablette.
  onLevel: (level: ShelfLevel) => void;
  onBack: () => void;
};
type Garnish = { p: Placed; pl: ItemPlacement; content: ItemContent };

// Durées : 500 ms (moitié pour se refermer de profil, moitié pour s'ouvrir de face) ; 150 ms en mouvement réduit.
export const ZOOM_MS = 500;
export const ZOOM_REDUCED_MS = 150;

// Objets portés posés en 3D dans le repère du meuble (cartes rangées, écran, petits objets) et leur contenu, comme dans la pièce.
function garnishOf(layout: Placed[], item: Placed, cards: Cards, imageOf: (slug: string) => string | undefined): Garnish[] {
  const out: Garnish[] = [];
  const shelved = item.kind === 'shelf' ? storedPlacementsOf(layout, item.id) : new Map<string, ItemPlacement>();
  for (const p of layout) {
    const pl = p.kind === 'stored' ? (p.shelfId === item.id ? shelved.get(p.id) : undefined) : (() => { const at = carriedPlacementOf(layout, p); return at?.hostId === item.id ? at.placement : undefined; })();
    if (!pl) continue;
    const slug = p.kind === 'stored' || p.kind === 'computer' ? p.slug : undefined;
    const info = slug ? cards[slug] : undefined;
    out.push({ p, pl, content: p.kind === 'small' ? { lit: isLit(p) } : info && slug ? { url: imageOf(slug), title: info.title } : {} });
  }
  return out;
}

export function FurnitureZoom({ target, room, cards, imageOf, phase, from, stage, level, onCard, onLevel, onBack }: Props): ReactElement | null {
  const ids = zoomIdsOf(target);
  const key = ids.join('+');
  const items = ids.map((id) => room.layout.find((p) => p.id === id)).filter((p): p is Placed => p !== undefined);
  const item = items[0];
  const palette = paletteOf(room.style);
  const steampunk = room.style === 'steampunk';
  // Deux bibliothèques liées ont toujours le même angle.
  const angle = item ? angleOf(item) : 0;
  const reduced = reducedMotion();
  const [face, setFace] = useState<'angled' | 'front'>(reduced || phase === 'open' || angle === 0 ? 'front' : phase === 'opening' ? 'angled' : 'front');
  const [arrived, setArrived] = useState(phase === 'open');
  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setArrived(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    if (reduced || angle === 0 || phase === 'open') {
      setFace('front');
      return;
    }
    const half = ZOOM_MS / 2;
    const t = window.setTimeout(() => setFace(phase === 'opening' ? 'front' : 'angled'), half);
    return () => window.clearTimeout(t);
  }, [phase, angle, reduced, key]);
  const garnishes = useMemo(() => items.map((it) => garnishOf(room.layout, it, cards, imageOf)), [room.layout, key, cards, imageOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const clipId = `wm-zoom-open-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (!item || (item.kind !== 'shelf' && item.kind !== 'desk')) return null;

  const host = item.kind;
  const n = items.length;
  const { w, h } = drawSize(host, 0);
  const art: PxRect = { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H };
  // Écran et petits objets dépassent du dessus du meuble : le cadre monte jusqu'au plus haut d'entre eux.
  const tops = garnishes.flat().filter(({ p }) => p.kind !== 'stored').map(({ pl }) => placementRectPx(host, 0, art, pl, steampunk).y);
  const pad = tops.length > 0 ? Math.max(0, art.y - Math.min(...tops)) + 8 : 0;
  // Bibliothèques liées : côte à côte, chacune dans sa largeur.
  const view = { x: 0, y: -pad, w: art.w * n, h: art.h + pad };
  const frame = host === 'shelf' ? faceFrame('shelf', 0, art) : null;
  const turned = drawSize(host, angle);
  const fit = Math.min(1, art.w / (turned.w * CELL_W), view.h / (turned.h * CELL_H));
  const tw = turned.w * CELL_W * fit;
  const th = turned.h * CELL_H * fit;
  const turnedRectAt = (i: number): PxRect => ({ x: i * art.w + (art.w - tw) / 2, y: art.h - th, w: tw, h: th });
  const end = zoomRectOf(stage, view.w / view.h);
  const start = from ?? end;
  const ms = reduced ? ZOOM_REDUCED_MS : ZOOM_MS;
  const at = reduced ? end
    : angle === 0 ? (phase === 'closing' || !arrived ? start : end)
    : phase === 'open' || (phase === 'opening' && face === 'front') ? end : start;
  const move = angle === 0 ? ms : ms / 2;
  const hidden = reduced && (phase === 'closing' || (phase === 'opening' && !arrived));

  const cardTap = (slug: string) => () => { if (cards[slug]) onCard(slug); };
  const hitOf = (p: Placed, pl: ItemPlacement): PxRect | null => {
    const quad = cardQuad(p, 0, art, pl, steampunk);
    return quad && quad.length > 0 ? boxOfQuad(quad) : null;
  };

  // Le meuble sous l'angle `a` dans `rect`, garni de ses objets.
  const garnished = (a: Angle, rect: PxRect, garnish: Garnish[], tag: string): ReactElement => {
    const opening = host === 'shelf' ? openingOf(FURNITURE_MODELS.shelf, a) : null;
    const { w: cw, h: ch } = drawSize(host, a);
    const draw = ({ p, pl, content }: Garnish) => <CarriedItem3D key={p.id} host={host} angle={a} rect={rect} placement={pl} palette={palette} steampunk={steampunk} content={content} />;
    const shelved = storedDrawOrder(garnish.filter((g): g is Garnish & { p: Extract<Placed, { kind: 'stored' }> } => g.p.kind === 'stored').map((g) => ({ ...g, level: g.p.level, order: g.p.order })), a);
    const depth = new Map(garnish.map((g) => [g.p.id, placementDepth(host, a, g.pl, steampunk)]));
    const onTop = garnish.filter((g) => g.p.kind !== 'stored').sort((x, y) => depth.get(y.p.id)! - depth.get(x.p.id)!);
    return (
      <g>
        <Model3DArt kind={host} angle={a} rect={rect} palette={palette} steampunk={steampunk} />
        {opening && shelved.length > 0 && (
          <>
            <clipPath id={`${clipId}-${tag}-${a}`}><polygon points={opening.map(([x, y]) => `${rect.x + (x * rect.w) / (cw * CELL_W)},${rect.y + (y * rect.h) / (ch * CELL_H)}`).join(' ')} /></clipPath>
            <g clipPath={`url(#${clipId}-${tag}-${a})`}>{shelved.map(draw)}</g>
          </>
        )}
        {onTop.map(draw)}
      </g>
    );
  };

  const frontArt = (
    <g>
      {items.map((it, i) => {
        const garnish = garnishes[i] ?? [];
        const free = frame ? shelfFreeIn(frame, room.layout, it.id) : [];
        return (
          <g key={it.id} data-zoom-piece={it.id} transform={i > 0 ? `translate(${i * art.w} 0)` : undefined}>
            {garnished(0, art, garnish, it.id)}
            {frame && free.map(({ level: lv, local }) => (
              <g key={`free-${lv}`} transform={`matrix(${frame.m.join(' ')})`}>
                <rect data-shelf-free={lv} x={local.x} y={local.y} width={local.w} height={local.h} rx={2} fill="none" stroke={palette.text} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              </g>
            ))}
            {/* Toute la tablette est touchable : elle mène au second zoom (sous les cartes, qui y mènent aussi). */}
            {frame && shelfBoardsIn(frame).map((b) => (
              <g key={`board-${b.level}`} data-zoom-board={b.level} transform={`matrix(${frame.m.join(' ')})`} onClick={() => onLevel(b.level)} style={{ cursor: 'pointer' }}>
                <rect x={b.local.x} y={b.local.y} width={b.local.w} height={b.local.h} fill="transparent" />
              </g>
            ))}
            {garnish.map(({ p, pl }) => {
              const slug = p.kind === 'stored' || p.kind === 'computer' ? p.slug : undefined;
              const hit = slug ? hitOf(p, pl) : null;
              if (!slug || !hit) return null;
              // Carte rangée : second zoom sur sa tablette ; écran du bureau : la fiche (carte inconnue : sans effet).
              const tap = p.kind === 'stored' ? () => onLevel(p.level) : cardTap(slug);
              return (
                <g key={p.id} data-zoom-card={slug} onClick={tap} style={{ cursor: p.kind === 'stored' || cards[slug] ? 'pointer' : 'default' }}>
                  <rect x={hit.x} y={hit.y} width={hit.w} height={hit.h} fill="transparent" />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
  const angledArt = <g>{items.map((it, i) => <g key={it.id}>{garnished(angle, turnedRectAt(i), garnishes[i] ?? [], it.id)}</g>)}</g>;
  const label = host === 'desk' ? 'Bureau vu de face' : n > 1 ? 'Bibliothèques vues de face' : 'Étagère vue de face';
  const onBoard = host === 'shelf' && level !== null && phase !== 'closing';
  return (
    <div className="wmt-lib-zoom" data-furniture-zoom="" data-zoom-phase={phase} data-zoom-face={face} data-zoom-level={level ?? undefined} style={reduced ? { opacity: hidden ? 0 : 1, transition: `opacity ${ms}ms ease-out` } : undefined} role="dialog" aria-label={label}>
      <div className="wmt-lib-zoom-backdrop" data-zoom-backdrop="" onClick={onBack} style={{ opacity: phase === 'closing' ? 0 : 1, transition: `opacity ${ms}ms ease-out` }} />
      {!onBoard && (
        <div
          className="wmt-lib-zoom-piece"
          style={{
            left: at.x, top: at.y, width: at.w, height: at.h,
            transition: `left ${move}ms ease-out, top ${move}ms ease-out, width ${move}ms ease-out, height ${move}ms ease-out`,
            animation: angle !== 0 && phase !== 'open' && !reduced ? `wmt-zoom-pivot ${ms}ms ease-in-out` : undefined,
          }}
        >
          <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
            {face === 'front' ? frontArt : angledArt}
          </svg>
        </div>
      )}
      {onBoard && level !== null && <ShelfBoardZoom shelfIds={ids} level={level} room={room} cards={cards} imageOf={imageOf} onCard={onCard} onLevel={onLevel} />}
      <button type="button" className="wmt-lib-fab" data-action="zoom-back" aria-label={level !== null ? 'Retour à la vue de face' : 'Retour à la pièce'} title={level !== null ? 'Retour à la vue de face' : 'Retour à la pièce'} onClick={onBack} style={{ left: 8, top: 8 }}>
        <Icon paths={ICONS.back} />
      </button>
    </div>
  );
}
```

- [ ] **Step 6: `LibraryPanel` — cible, caméra, props**

Imports : `import { cameraOf, unionBox, zoomIdsOf, zoomTargetOf, type Box } from '../core/library/zoom-target';`.
Destructuration du hook : `const { zoom, open: openZoom, close: closeZoom, reset: resetZoom, setLevel: setZoomLevel } = useFurnitureZoom(...)` (le rappel est complété en tâche 5).

`tryZoom` :

```ts
    openZoom(target, unionBox(zoomIdsOf(target).map(boxInStage)));
```

`<FurnitureZoom` : `key={zoomIdsOf(zoom.target).join('+')}`, ajouter `level={zoom.level}` et `onLevel={(lv) => setZoomLevel(lv)}`.

- [ ] **Step 7: Mettre à jour les tests existants**

`tests/content/furniture-zoom.test.tsx` :
- partout : `target={{ kind: 'shelf', id: 's' }}` → `target={{ kind: 'shelf', ids: ['s'] }}` ; ajouter `level={null} onLevel={onLevel}` aux deux montages (`mount` reçoit `onLevel = vi.fn()` en 5ᵉ paramètre et le renvoie ; `zoomOf` prend `target: ZoomTarget` et passe `level={null} onLevel={vi.fn()}`) ; les appels `zoomOf(room, { kind: 'shelf', id: 's' })` → `{ kind: 'shelf', ids: ['s'] }`.
- remplacer le test « toucher une carte connue la signale ; une inconnue ne fait rien » par :

```tsx
  it('vue de face d’une étagère : toucher une carte (connue ou non) ou la tablette mène au second zoom de son niveau', () => {
    const { container, onCard, onLevel } = mount('open');
    act(() => { container.querySelector('[data-zoom-card="Daft_Punk"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { container.querySelector('[data-zoom-card="Inconnue"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    act(() => { container.querySelector('[data-zoom-board="2"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onLevel.mock.calls).toEqual([[0], [0], [2]]);
    expect(onCard).not.toHaveBeenCalled();
  });
  it('deux bibliothèques liées : deux meubles côte à côte, cadre deux fois plus large', () => {
    const pair: Room = { ...room, layout: [{ id: 's', kind: 'shelf', col: 0, row: 6 }, { id: 't', kind: 'shelf', col: 4, row: 6 }, room.layout[1]!] };
    const container = document.createElement('div');
    document.body.append(container);
    act(() => {
      createRoot(container).render(
        <FurnitureZoom target={{ kind: 'shelf', ids: ['s', 't'] }} room={pair} cards={{}} imageOf={() => undefined} phase="open" from={null} stage={{ w: 800, h: 400 }} level={null} onCard={vi.fn()} onLevel={vi.fn()} onBack={vi.fn()} />,
      );
    });
    expect(container.querySelectorAll('[data-zoom-piece]')).toHaveLength(2);
    const vb = container.querySelector('.wmt-lib-zoom-piece svg')!.getAttribute('viewBox')!.split(' ').map(Number);
    expect(vb[2]).toBeCloseTo(2 * drawSize('shelf', 0).w * CELL_W);
    expect(container.querySelector('[data-furniture-zoom]')!.getAttribute('aria-label')).toBe('Bibliothèques vues de face');
  });
  it('niveau choisi : la vue de la tablette remplace la vue de face', () => {
    const container = document.createElement('div');
    document.body.append(container);
    act(() => {
      createRoot(container).render(
        <FurnitureZoom target={{ kind: 'shelf', ids: ['s'] }} room={room} cards={{}} imageOf={() => undefined} phase="open" from={null} stage={{ w: 800, h: 400 }} level={1} onCard={vi.fn()} onLevel={vi.fn()} onBack={vi.fn()} />,
      );
    });
    expect(container.querySelector('[data-shelf-board="1"]')).not.toBeNull();
    expect(container.querySelector('.wmt-lib-zoom-piece')).toBeNull();
    expect(container.querySelector('[data-action="zoom-back"]')!.getAttribute('aria-label')).toBe('Retour à la vue de face');
  });
```

`tests/content/library-zoom.test.tsx`, test « toucher une carte dans le zoom ouvre la fiche ; la fermer revient au zoom » : remplacer `await click('[data-zoom-card="Daft_Punk"]');` par :

```tsx
    await click('[data-zoom-card="Daft_Punk"]');
    expect(q('[data-shelf-board="0"]')).not.toBeNull();
    await click('[data-board-card="Daft_Punk"]');
```

(`data-board-card` arrive en tâche 4 : ce test reste rouge jusque-là, c'est attendu ; le noter dans le commit.)

Ajouter dans `describe('zoom sur un meuble')` :

```tsx
  it('bibliothèques liées : toucher la vide ouvre les deux', async () => {
    await seed([{ id: 'a', kind: 'shelf', col: 0, row: 6 }, { id: 'b', kind: 'shelf', col: 4, row: 6 }, { id: 'c', kind: 'stored', shape: 'cd', shelfId: 'b', level: 0, order: 0, slug: 'Daft_Punk' }]);
    await click('[data-id="a"]');
    expect(container.querySelectorAll('[data-zoom-piece]')).toHaveLength(2);
  });
```

- [ ] **Step 8: Lancer**

Run: `npx vitest run tests/core/library/zoom-target.test.ts tests/content/furniture-zoom.test.tsx tests/content/library-zoom.test.tsx --project=scene-piece`
Expected: tout PASS sauf « toucher une carte dans le zoom ouvre la fiche » (attend `data-board-card`, tâche 4).

Run: `npx tsc --noEmit -p .` → aucune erreur.

- [ ] **Step 9: Commit**

```bash
git add src/core/library/zoom-target.ts src/content/furniture-zoom.tsx src/content/use-furniture-zoom.ts src/content/shelf-board-zoom.tsx src/content/LibraryPanel.tsx tests/core/library/zoom-target.test.ts tests/content/furniture-zoom.test.tsx tests/content/library-zoom.test.tsx
git commit -m "feat(bibliotheque): vue de face des bibliothèques liées, tablettes touchables (test fiche en attente de la tâche 4)"
```

---

### Task 4: Vue d'une tablette (`ShelfBoardZoom`)

**Files:**
- Modify: `src/content/shelf-board-zoom.tsx` (remplace le squelette)
- Modify: `src/content/LibraryPanel.tsx` (bloc CSS vers la ligne 185)
- Modify: `tests/familles.ts` (`'shelf-board-zoom.*'` dans `c(...)` de `scene-piece`)
- Test: `tests/content/shelf-board-zoom.test.tsx`

**Interfaces:**
- Consumes: `ShelfBoardProps` (tâche 3), `ICONS.up` / `ICONS.down` (tâche 2), `shelfBoardsIn`, `shelfLayoutIn`, `displayOf`, `isShelfLevel`, `SHELF_INNER_CM`, `SHELF_LEVELS`, `type Stored` (room-grid).
- Produces: `titleLines(title: string, max: number, lines?: number): string[]`, `SWIPE_PX = 40` ; attributs `data-shelf-board={level}`, `data-board-shelf={id}`, `data-board-card={slug}`, `data-board-display="cover" | "spine"`, `data-board-title`, `data-board-enter`, boutons `data-action="board-up" | "board-down"`.

- [ ] **Step 1: Tests**

```tsx
// tests/content/shelf-board-zoom.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ShelfBoardZoom, titleLines } from '../../src/content/shelf-board-zoom';
import type { Room, ShelfLevel } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const room: Room = {
  id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [],
  layout: [
    { id: 's', kind: 'shelf', col: 0, row: 6 }, { id: 't', kind: 'shelf', col: 4, row: 6 },
    { id: 'c1', kind: 'stored', shape: 'cd', shelfId: 's', level: 0, order: 0, slug: 'Daft_Punk' },
    { id: 'c2', kind: 'stored', shape: 'book', shelfId: 's', level: 0, order: 1, slug: 'Le_Petit_Prince' },
    { id: 'c3', kind: 'stored', shape: 'cd', shelfId: 't', level: 0, order: 0, slug: 'Inconnue' },
    { id: 'c4', kind: 'stored', shape: 'cd', shelfId: 's', level: 1, order: 0, slug: 'Paris' },
  ],
};
const cards = { Daft_Punk: { title: 'Daft Punk' }, Le_Petit_Prince: { title: 'Le Petit Prince' }, Paris: { title: 'Paris' } };

function mount(level: ShelfLevel, ids = ['s', 't']) {
  const onCard = vi.fn();
  const onLevel = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  act(() => { createRoot(container).render(<ShelfBoardZoom shelfIds={ids} level={level} room={room} cards={cards} imageOf={() => undefined} onCard={onCard} onLevel={onLevel} />); });
  return { container, onCard, onLevel };
}
const fire = (el: Element, type: string, init: MouseEventInit = {}) => act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init })); });

describe('titleLines', () => {
  it('mots entiers sur deux lignes, « … » si ça déborde', () => {
    expect(titleLines('Daft Punk', 12)).toEqual(['Daft Punk']);
    expect(titleLines('Le Seigneur des anneaux', 10)).toEqual(['Le', 'Seigneur…']);
    expect(titleLines('Supercalifragilistic', 6)).toEqual(['Super…']);
    expect(titleLines('', 10)).toEqual([]);
    expect(titleLines('Le Petit Prince', 40, 1)).toEqual(['Le Petit Prince']);
  });
});

describe('vue d’une tablette', () => {
  it('la tablette des deux bibliothèques, cartes du niveau seulement, titres', () => {
    const { container } = mount(0);
    expect(container.querySelectorAll('[data-board-shelf]')).toHaveLength(2);
    expect([...container.querySelectorAll('[data-board-card]')].map((e) => e.getAttribute('data-board-card'))).toEqual(['Daft_Punk', 'Le_Petit_Prince', 'Inconnue']);
    expect(container.querySelector('[data-board-card="Le_Petit_Prince"]')!.getAttribute('data-board-display')).toBe('spine');
    const titles = [...container.querySelectorAll('[data-board-title]')].map((t) => t.textContent);
    expect(titles.join(' ')).toContain('Daft');
    expect(titles.join(' ')).toContain('Inconnue');
  });
  it('toucher une carte connue ouvre la fiche ; inconnue : rien', () => {
    const { container, onCard } = mount(0);
    fire(container.querySelector('[data-board-card="Daft_Punk"]')!, 'click');
    fire(container.querySelector('[data-board-card="Inconnue"]')!, 'click');
    expect(onCard.mock.calls).toEqual([['Daft_Punk']]);
  });
  it('↑ ↓ : niveau voisin, grisés aux bords', () => {
    const top = mount(0);
    expect((top.container.querySelector('[data-action="board-up"]') as HTMLButtonElement).disabled).toBe(true);
    fire(top.container.querySelector('[data-action="board-down"]')!, 'click');
    expect(top.onLevel).toHaveBeenCalledWith(1);
    const bottom = mount(2);
    expect((bottom.container.querySelector('[data-action="board-down"]') as HTMLButtonElement).disabled).toBe(true);
    fire(bottom.container.querySelector('[data-action="board-up"]')!, 'click');
    expect(bottom.onLevel).toHaveBeenCalledWith(1);
  });
  it('glisser vers le haut : tablette du dessous ; le clic qui suit n’ouvre pas la fiche', () => {
    const { container, onLevel, onCard } = mount(0);
    const board = container.querySelector('[data-shelf-board]')!;
    const card = container.querySelector('[data-board-card="Daft_Punk"]')!;
    fire(card, 'pointerdown', { clientY: 300 });
    fire(card, 'pointerup', { clientY: 240 });
    fire(card, 'click');
    expect(onLevel).toHaveBeenCalledWith(1);
    expect(onCard).not.toHaveBeenCalled();
    fire(board, 'pointerdown', { clientY: 100 });
    fire(board, 'pointerup', { clientY: 120 });
    expect(onLevel).toHaveBeenCalledTimes(1);
  });
});
```

Ajouter `'shelf-board-zoom.*'` à `c(...)` de `scene-piece` dans `tests/familles.ts`.

Run: `npx vitest run tests/content/shelf-board-zoom.test.tsx --project=scene-piece` → FAIL.

- [ ] **Step 2: Écrire `shelf-board-zoom.tsx`**

```tsx
// Dessin provisoire Opus — Fable n'est pas passé, reprise prévue.
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import type { Matrix } from '../core/library/footprint';
import { FURNITURE_MODELS } from '../core/library/furniture-models';
import type { Room, ShelfLevel } from '../core/library/library-types';
import { SHELF_INNER_CM, SHELF_LEVELS, displayOf, isShelfLevel, shelfBoardsIn, shelfLayoutIn, type Stored } from '../core/library/room-grid';
import { paletteOf } from '../core/library/styles';
import { reducedMotion } from './ghibli-sky';
import { Icon, ICONS } from './library-ui';

export type ShelfBoardProps = {
  shelfIds: string[];
  level: ShelfLevel;
  room: Room;
  cards: Record<string, { title: string; imageUrl?: string }>;
  imageOf: (slug: string) => string | undefined;
  onCard: (slug: string) => void;
  onLevel: (level: ShelfLevel) => void;
};

// Face de l'étagère en cm (repère identité) : tablettes et objets rangés y gardent leurs mesures réelles (mêmes calculs que la pièce).
const FACE = { w: SHELF_INNER_CM, h: FURNITURE_MODELS.shelf.face!.h, m: [1, 0, 0, 1, 0, 0] as Matrix };
const POST_CM = 3; // montants (bords et entre deux bibliothèques)
const PLANK_CM = 2;
const TITLE_CM = 8; // place des titres sous la tablette (2 lignes)
const TITLE_FONT_CM = 2.4;
// Largeur moyenne d'un caractère, en fraction de la taille de police.
const CHAR_W = 0.55;
export const SWIPE_PX = 40;

// Titre en `lines` lignes d'au plus `max` caractères (mots entiers ; un mot trop long est coupé), « … » si ça ne tient pas.
export function titleLines(title: string, max: number, lines = 2): string[] {
  const cap = Math.max(1, Math.floor(max));
  let rest = title.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  while (rest.length > 0 && out.length < lines) {
    let line = rest[0]!;
    let k = 1;
    while (k < rest.length && `${line} ${rest[k]}`.length <= cap) line = `${line} ${rest[k++]}`;
    out.push(line);
    rest = rest.slice(k);
  }
  const cut = (s: string) => (s.length <= cap ? s : `${s.slice(0, Math.max(0, cap - 1))}…`);
  const res = out.map(cut);
  if (rest.length > 0 && res.length > 0) {
    const last = res[res.length - 1]!;
    if (!last.endsWith('…')) res[res.length - 1] = last.length + 1 <= cap ? `${last}…` : `${last.slice(0, Math.max(0, cap - 1))}…`;
  }
  return res;
}

// Second zoom : une tablette (de une ou deux bibliothèques liées, à la suite), cartes au plus grand avec leur titre ;
// ↑ ↓ ou glisser verticalement pour changer de tablette.
export function ShelfBoardZoom({ shelfIds, level, room, cards, imageOf, onCard, onLevel }: ShelfBoardProps): ReactElement {
  const palette = paletteOf(room.style);
  const board = shelfBoardsIn(FACE)[level]!;
  const top = board.local.y;
  const boardH = board.local.h;
  const width = shelfIds.length * SHELF_INNER_CM + (shelfIds.length + 1) * POST_CM;
  const height = boardH + PLANK_CM + TITLE_CM;
  // Entrée : la tablette du dessous monte, celle du dessus descend ; la première s'agrandit.
  const prev = useRef(level);
  const enter = level > prev.current ? 'below' : level < prev.current ? 'above' : 'in';
  useEffect(() => { prev.current = level; }, [level]);
  const startY = useRef<number | null>(null);
  // Le clic qui suit un glissement n'ouvre pas de fiche.
  const swiped = useRef(false);
  const go = (d: 1 | -1): void => {
    const next = level + d;
    if (isShelfLevel(next)) onLevel(next);
  };
  const onPointerDown = (e: ReactPointerEvent): void => { startY.current = e.clientY; swiped.current = false; };
  const onPointerUp = (e: ReactPointerEvent): void => {
    const s = startY.current;
    startY.current = null;
    if (s === null) return;
    const dy = e.clientY - s;
    if (Math.abs(dy) < SWIPE_PX) return;
    swiped.current = true;
    go(dy < 0 ? 1 : -1);
  };
  const stored = new Map(room.layout.filter((p): p is Stored => p.kind === 'stored').map((p) => [p.id, p]));
  const last = SHELF_LEVELS[SHELF_LEVELS.length - 1]!;
  const reduced = reducedMotion();

  return (
    <div className="wmt-lib-board" data-shelf-board={level} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { startY.current = null; }}>
      <svg key={level} data-board-enter={enter} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={reduced ? undefined : { animation: `wmt-board-${enter} ${enter === 'in' ? 400 : 250}ms ease-out` }}>
        <rect x={0} y={boardH} width={width} height={PLANK_CM} fill={palette.wood} />
        {shelfIds.map((id, i) => {
          const x0 = POST_CM + i * (SHELF_INNER_CM + POST_CM);
          const boxes = shelfLayoutIn(FACE, room.layout, id).filter((b) => b.level === level);
          return (
            <g key={id} data-board-shelf={id}>
              <rect x={x0} y={0} width={SHELF_INNER_CM} height={boardH} fill={palette.woodDark} />
              <rect x={x0 - POST_CM} y={0} width={POST_CM} height={boardH + PLANK_CM} fill={palette.wood} />
              {i === shelfIds.length - 1 && <rect x={x0 + SHELF_INNER_CM} y={0} width={POST_CM} height={boardH + PLANK_CM} fill={palette.wood} />}
              {boxes.map((b) => {
                const p = stored.get(b.id);
                if (!p) return null;
                const info = cards[p.slug];
                const title = info?.title ?? p.slug.replace(/_/g, ' ');
                const url = info ? imageOf(p.slug) : undefined;
                const x = x0 + b.local.x;
                const y = b.local.y - top;
                const w = b.local.w;
                const h = b.local.h;
                const spine = displayOf(p) === 'spine';
                const spineFont = Math.min(w * 0.6, TITLE_FONT_CM);
                return (
                  <g
                    key={p.id}
                    data-board-card={p.slug}
                    data-board-display={spine ? 'spine' : 'cover'}
                    onClick={() => {
                      if (swiped.current) { swiped.current = false; return; }
                      if (info) onCard(p.slug);
                    }}
                    style={{ cursor: info ? 'pointer' : 'default' }}
                  >
                    <rect x={x} y={y} width={w} height={h} fill="#e8e2d6" stroke={palette.text} strokeWidth={0.3} />
                    {!spine && url && <image href={url} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" />}
                    {spine
                      ? <text data-board-title="" transform={`translate(${x + w / 2} ${y + h - 1}) rotate(-90)`} fontSize={spineFont} dominantBaseline="middle" fill={palette.text}>{titleLines(title, (h - 2) / (spineFont * CHAR_W), 1)[0]}</text>
                      : titleLines(title, w / (TITLE_FONT_CM * CHAR_W)).map((line, k) => (
                        <text key={k} data-board-title="" x={x + w / 2} y={boardH + PLANK_CM + TITLE_FONT_CM * (k + 1)} fontSize={TITLE_FONT_CM} textAnchor="middle" fill={palette.text}>{line}</text>
                      ))}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="wmt-lib-board-nav">
        <button type="button" className="wmt-lib-fab" data-action="board-up" aria-label="Tablette du dessus" title="Tablette du dessus" disabled={level === 0} onClick={() => go(-1)} style={{ position: 'static' }}>
          <Icon paths={ICONS.up} />
        </button>
        <button type="button" className="wmt-lib-fab" data-action="board-down" aria-label="Tablette du dessous" title="Tablette du dessous" disabled={level === last} onClick={() => go(1)} style={{ position: 'static' }}>
          <Icon paths={ICONS.down} />
        </button>
      </div>
    </div>
  );
}
```

Vérifier que `palette.wood` et `palette.woodDark` existent (`Fill = keyof Palette` dans `furniture-render3d.ts`, le modèle d'étagère utilise `'wood'` et `'woodDark'`) ; sinon prendre les deux tons bois de `paletteOf` utilisés par `Model3DArt`.

- [ ] **Step 3: CSS** (bloc de styles de `LibraryPanel.tsx`, après `@keyframes wmt-zoom-pivot`)

```css
.wmt-lib-board{position:absolute;left:3%;right:64px;top:10%;bottom:10%;display:flex;align-items:center;justify-content:center;touch-action:none}
.wmt-lib-board svg{width:100%;height:100%;filter:drop-shadow(0 8px 18px rgba(0,0,0,.45))}
.wmt-lib-board-nav{position:absolute;right:-56px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:12px}
.wmt-lib-board-nav .wmt-lib-fab:disabled{opacity:.35;cursor:default}
@keyframes wmt-board-in{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@keyframes wmt-board-below{from{opacity:0;transform:translateY(40%)}to{opacity:1;transform:none}}
@keyframes wmt-board-above{from{opacity:0;transform:translateY(-40%)}to{opacity:1;transform:none}}
```

- [ ] **Step 4: Lancer**

Run: `npx vitest run tests/content/shelf-board-zoom.test.tsx tests/content/furniture-zoom.test.tsx tests/content/library-zoom.test.tsx --project=scene-piece`
Expected: PASS (y compris le test de la fiche resté rouge en tâche 3).

- [ ] **Step 5: Commit**

```bash
git add src/content/shelf-board-zoom.tsx src/content/LibraryPanel.tsx tests/content/shelf-board-zoom.test.tsx tests/familles.ts
git commit -m "feat(bibliotheque): second zoom sur une tablette (cartes en grand, titres, ↑ ↓, glisser)"
```

---

### Task 5: Retour à deux étages (←, Échap, fond, retour Android)

**Files:**
- Modify: `src/content/LibraryPanel.tsx` (rappel du hook l.218, Échap l.350, `onBack` de `<FurnitureZoom`)
- Test: `tests/content/library-zoom.test.tsx`

**Interfaces:**
- Consumes: `setLevel` (tâche 3), `zoom.level`.

- [ ] **Step 1: Tests** (dans `describe('zoom sur un meuble')`)

```tsx
  it('second zoom : ← revient à la vue de face, puis à la pièce', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    await click('[data-furniture="shelf"]');
    await advance(500);
    await click('[data-zoom-board="1"]');
    expect(q('[data-shelf-board="1"]')).not.toBeNull();
    await click('[data-action="zoom-back"]');
    expect(q('[data-shelf-board]')).toBeNull();
    expect(q('[data-furniture-zoom]')?.getAttribute('data-zoom-phase')).toBe('open');
    await click('[data-action="zoom-back"]');
    await advance(500);
    expect(q('[data-furniture-zoom]')).toBeNull();
  });
  it('second zoom : Échap et le fond reviennent à la vue de face', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    await click('[data-furniture="shelf"]');
    await advance(500);
    await click('[data-zoom-board="0"]');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(q('[data-shelf-board]')).toBeNull();
    expect(q('[data-furniture-zoom]')).not.toBeNull();
    await click('[data-zoom-board="0"]');
    await click('[data-zoom-backdrop]');
    expect(q('[data-shelf-board]')).toBeNull();
    expect(q('[data-furniture-zoom]')?.getAttribute('data-zoom-phase')).toBe('open');
  });
  it('second zoom : retour Android → vue de face, le zoom reste et garde son entrée d’historique', async () => {
    await seed(SHELF);
    vi.useFakeTimers();
    const push = vi.spyOn(history, 'pushState');
    await click('[data-furniture="shelf"]');
    await advance(500);
    await click('[data-zoom-board="0"]');
    await act(async () => { history.replaceState(null, ''); window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
    expect(q('[data-shelf-board]')).toBeNull();
    expect(q('[data-furniture-zoom]')?.getAttribute('data-zoom-phase')).toBe('open');
    expect(history.state).toMatchObject({ wmtZoom: true });
    expect(push).toHaveBeenCalledTimes(2);
  });
```

Run: `npx vitest run tests/content/library-zoom.test.tsx --project=scene-piece` → FAIL (← ferme tout).

- [ ] **Step 2: Implémentation**

Rappel du hook (l.218) :

```ts
  // Le retour Android/navigateur ferme d'abord la fiche ouverte par-dessus le zoom, puis le second zoom (retour à la vue de face).
  const { zoom, open: openZoom, close: closeZoom, reset: resetZoom, setLevel: setZoomLevel } = useFurnitureZoom(() => {
    if (viewingRef.current) {
      setViewing(null);
      return true;
    }
    if (zoomRef.current?.level != null) {
      setZoomLevel(null);
      return true;
    }
    return false;
  });
```

Juste après `zoomRef.current = zoom;` :

```ts
  // ←, Échap, fond : du second zoom à la vue de face, puis de la vue de face à la pièce.
  const zoomBack = (): void => {
    if (zoomRef.current?.level != null) setZoomLevel(null);
    else closeZoom();
  };
```

Échap (l.350) : `closeZoom()` → `zoomBack()`. `<FurnitureZoom … onBack={zoomBack}`.

- [ ] **Step 3: Lancer**

Run: `npx vitest run tests/content/library-zoom.test.tsx tests/content/furniture-zoom.test.tsx tests/content/shelf-board-zoom.test.tsx --project=scene-piece` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/content/LibraryPanel.tsx tests/content/library-zoom.test.tsx
git commit -m "feat(bibliotheque): retour du second zoom vers la vue de face (←, Échap, fond, retour Android)"
```

---

### Task 6: Fiche WikiHow, familles, build, captures

**Files:**
- Modify: `src/core/whats-new/entries.ts` (nouvelle entrée après `bibliotheque-v30`)
- Test: famille `socle` (contrôles des fiches) + `scene-piece`

- [ ] **Step 1: Fiche** — prendre le prochain id libre (`git grep -o "id: 'bibliotheque-v[0-9]*'" src/core/whats-new/entries.ts` ; a priori `bibliotheque-v31`) et ajouter, sur le modèle de `bibliotheque-v30` :

```ts
  {
    id: 'bibliotheque-v31',
    theme: 'collection',
    glyph: '🔍',
    title: 'Zoomer sur une étagère, lier deux bibliothèques',
    summary: 'Dans la vue de face d’une bibliothèque, touchez une étagère pour lire ses cartes en grand ; deux bibliothèques collées s’ouvrent ensemble',
    steps: [
      {
        target: '[data-wmt-library-entry]',
        gesture: 'tap',
        title: 'Une étagère en grand',
        text: 'En mode Visiter, touchez une bibliothèque qui range des cartes : elle s’affiche de face. Touchez ensuite une de ses étagères : seules ses cartes restent à l’écran, en grand, avec leur titre. Les flèches ↑ ↓, ou un glissement du doigt, passent à l’étagère du dessus ou du dessous.',
        details: [
          { label: 'À quoi ça sert', text: 'À lire les pochettes et les titres sur un téléphone, où la vue de face de la bibliothèque entière est trop petite.' },
          { label: 'D’où viennent les données', text: 'Les cartes sont celles que vous avez rangées sur l’étagère ; les titres et les images viennent de votre collection Wikimasters.' },
          { label: 'Comment ça marche', text: 'Les cartes gardent leur place et leurs proportions réelles. Touchez une carte pour ouvrir sa fiche ; ← (ou le retour du téléphone) revient à la vue de face, puis à la pièce.' },
          { label: 'Limites', text: 'Les livres rangés sur la tranche montrent leur titre sur la tranche, souvent coupé. Dessins provisoires, une version plus soignée viendra.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
      {
        target: '[data-wmt-library-entry]',
        title: 'Deux bibliothèques côte à côte',
        text: 'Posez deux bibliothèques bord à bord, tournées dans le même sens : elles se lient toutes seules et s’ouvrent ensemble, comme une grande bibliothèque. En mode Aménager, le bouton ⛓ de la bulle les délie (ou les relie).',
        details: [
          { label: 'À quoi ça sert', text: 'À parcourir d’un coup une collection qui ne tient pas dans un seul meuble.' },
          { label: 'Comment ça marche', text: 'Le lien se lit dans la position des meubles : écartez-en un, il disparaît ; rapprochez-les, il revient (sauf si vous l’avez délié). La bibliothèque liée est entourée en pointillés quand l’autre est sélectionnée.' },
          { label: 'Limites', text: 'Deux bibliothèques au maximum : dans une rangée de trois, les deux de gauche sont liées. Chaque carte reste rangée dans sa propre bibliothèque.' },
        ],
        scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library-entry]'] },
      },
    ],
  },
```

(Garder exactement la forme des entrées voisines : si un champ obligatoire comme `date` ou `version` y figure, le reprendre.)

- [ ] **Step 2: Familles touchées**

Run: `npm run test:famille -- scene-piece socle`
Expected: PASS. Puis `npx tsc --noEmit -p .` et `npm run lint` s'il existe → sans erreur.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build sans erreur.

- [ ] **Step 4: Captures de validation** — avec le banc de captures du worktree rotation (`.superpowers/harness-rotation`, `node cap.mjs [landscape]`, port 5262) adapté à ce worktree, ou le harnais existant : capturer en portrait et en paysage (1) la vue de face de deux bibliothèques liées, (2) le second zoom d'une tablette seule, (3) le second zoom de deux tablettes liées avec CD et livres ; les montrer à l'utilisateur.

- [ ] **Step 5: Commit**

```bash
git add src/core/whats-new/entries.ts
git commit -m "docs(wikihow): fiche second zoom et bibliothèques liées"
```

Ensuite : PR vers `main`, fusion, `npm run preprod` (routine du projet) ; APK de production seulement sur demande.
