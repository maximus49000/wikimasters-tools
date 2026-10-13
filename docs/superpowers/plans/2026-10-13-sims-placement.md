# Interrupteur plein écran, habillage Sims et mode placement — plan d'implémentation

> **Pour les agents :** sous-skill requis : superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans, pour exécuter ce plan tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**But :** en plein écran, un interrupteur 👁 | ✏️ fait passer de Visiter à Aménager ; le tiroir, la bulle et les boutons prennent l'habillage du mode Achat des Sims 4 ; poser ou déplacer un objet passe par un mode placement (objet fantôme, ✗ rouge, ✓ vert), sans rien enregistrer avant ✓.

**Architecture :** un module pur `src/content/placement.ts` tient le brouillon du placement. Il vise avec `dropTargetFor`, construit le brouillon avec les fonctions de pose existantes et rejoue les retouches. `LibraryPanel` remplace son état `tool`/`pending`/`drag` par un état `placement`. `RoomView` dessine le brouillon : l'objet à 80 % et l'empreinte verte ou rouge. Une barre de placement et une poignée ✥ (HTML) sont positionnées sur l'objet comme l'est déjà la bulle d'actions. L'habillage Sims n'est que du CSS.

**Pile technique :** React 18, TypeScript, Vitest (jsdom), WXT (extension) et l'APK Android (WebView).

**Spec :** `docs/superpowers/specs/2026-10-13-sims-placement-design.md`. Maquette : `docs/superpowers/maquettes/sims-plein-ecran/tiroir-sims.html`.

## Contraintes globales

- Rien n'est enregistré avant ✓ (`data-action="place-confirm"`). ✗ (`data-action="place-cancel"`), Échap, l'interrupteur 👁, un changement de pièce et la sortie dans la rue abandonnent sans rien écrire.
- Les règles et les messages de refus restent ceux d'aujourd'hui (`REFUSALS`, `REASONS`), plus un seul nouveau : `'not-screen'` → « Touchez un ordinateur. ».
- Glyphes et non du texte pour les boutons (icônes `ICONS`), avec `aria-label`.
- Variables CSS : `--sims-panel: rgba(250,252,255,.94)`, `--sims-line: #a9c6e8`, `--sims-blue: #2f7fd6`, `--sims-blue-dark: #1d5aa3`, `--sims-tile-top: #fff`, `--sims-tile-bot: #dce8f6`, `--sims-green: #4cc23a`, `--sims-red: #d23b2f`, `--sims-text: #2b3f5c`.
- Police : `ui-rounded, 'Nunito', 'Varela Round', system-ui, sans-serif`, graisse 700 à 800, sans police embarquée.
- L'interrupteur n'existe qu'en plein écran (`stage.active`), enveloppé dans `[data-mode-switch]`.
- Tests : seulement les familles touchées. `npm run test:famille -- scene-piece` pour toutes les tâches ; `scene-lumiere` en plus pour les tâches 4 et 5 (lampes) ; et `npx vitest run tests/core/whats-new` pour la tâche 8.
- Commits en français, conventionnels (`feat(bibliotheque): …`), terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Dossier de travail : `C:\Users\maxim\Downloads\Wikimasters-sims-placement`, branche `feat/sims-placement`.

## Écarts assumés par rapport à la spec

- **On glisse l'objet par sa poignée ✥.** On ne le glisse pas directement par son dessin : pendant un placement, les cases de la pièce sont au-dessus des meubles et captent le toucher. La poignée est posée au centre de l'objet. Toucher une case reste possible.
- **Boutons ronds Sims.** Plutôt qu'ajouter une variante à `FullscreenButton` (partagé avec les lecteurs vidéo), Ma Pièce dessine ses propres boutons ronds (`.wmt-lib-fab`). Le bouton des lecteurs vidéo reste intact.
- **La garde Steampunk reste dans `startNew`.** On ne peut pas lancer le placement d'un objet Steampunk hors d'une pièce Steampunk. `commitPlacement` ne connaît donc pas le style de la pièce.

## À surveiller en revue

- Toucher une case en dehors de la pièce, ou sur le mur pour un meuble au sol : le fantôme y va en rouge, ✓ est grisé, et rien ne plante (testé dans la tâche 1).
- Un placement en cours quand la pièce change (changement de pièce, passage en Visiter, sortie) : il est abandonné, rien n'est écrit (testé dans la tâche 4).
- Une lampe allumée ou éteinte puis déplacée pendant le placement garde son état, sans double bascule (testé dans la tâche 1).
- Une fenêtre agrandie puis déplacée garde sa taille au ✓ (testé dans la tâche 1).
- Un appui long suivi d'un lâcher hors de la pièce : le placement reste ouvert, en rouge, et rien n'est déplacé (testé dans la tâche 5).

---

### Tâche 1 : module pur du placement

**Fichiers :**
- Modifier : `src/content/furniture-drag.ts` (types `DropReason` et `DropTarget`)
- Créer : `src/content/placement.ts`
- Tester : `tests/content/placement.test.ts`
- Modifier : `tests/familles.ts` (ajouter `'placement.*'` à la liste `c(...)` de la famille `scene-piece`)

**Interfaces :**
- Utilise : `dropTargetFor`, `deskAtCell` (furniture-drag) ; `CardChoice` (CardPickerDialog) ; les fonctions de pose de `room-grid` ; `nextFurnitureId` (library-book).
- Fournit, pour les tâches 2 à 5 :
  - `DRAFT_ID`
  - `type Subject`, `type Edit`, `type Spot`, `type Placement`, `type PlacingView`
  - `startPlacement(layout, cols, subject, center): Placement`
  - `movePlacement(p, cols, spot): Placement`
  - `moveToItem(p, cols, itemId): Placement`
  - `editPlacement(p, cols, edit): Placement | null`
  - `commitPlacement(p): Layout | null`
  - `placingView(p): PlacingView`
  - `spotAt(col, row): Spot`

- [ ] **Étape 1 : étendre `DropTarget`**

Dans `src/content/furniture-drag.ts`, ajouter `'not-screen'` à `DropReason` et un champ à `DropTarget` :

```ts
export type DropReason = 'bounds' | 'floor' | 'taken' | 'wall' | 'not-desk' | 'desk-busy' | 'desk-middle' | 'slot-busy' | 'not-slot' | 'host-busy' | 'not-host' | 'not-screen';
```

```ts
  // Carte d'écran : ordinateur visé.
  computerId?: string;
```

(à placer juste après `hostId?: string;`).

- [ ] **Étape 2 : écrire les tests qui échouent**

Créer `tests/content/placement.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { nextFurnitureId } from '../../src/core/library/library-book';
import type { Layout } from '../../src/core/library/library-types';
import { moveStanding, placeComputer, placeSmall, placeStanding, placeWindow, setScreenCard, storeCard, hang } from '../../src/core/library/room-grid';
import { DRAFT_ID, commitPlacement, editPlacement, movePlacement, moveToItem, placingView, spotAt, startPlacement } from '../../src/content/placement';

const COLS = 24;
const CENTER = spotAt(12, 15);
const desk: Layout = placeStanding([], COLS, 'desk', 2, 11, 'f1')!;

describe('startPlacement', () => {
  it('pose un meuble neuf à la place libre la plus proche du centre', () => {
    const p = startPlacement([], COLS, { type: 'new', kind: 'shelf' }, CENTER);
    expect(p.target.ok).toBe(true);
    expect(p.draft.some((x) => x.id === DRAFT_ID && x.kind === 'shelf')).toBe(true);
    const placed = p.draft.find((x) => x.id === DRAFT_ID)! as { col: number };
    expect(Math.abs(placed.col - 12)).toBeLessThanOrEqual(3);
  });

  it('sans aucune place, le fantôme est au centre et refusé', () => {
    const p = startPlacement([], COLS, { type: 'new', kind: 'computer' }, CENTER);
    expect(p.target.ok).toBe(false);
    expect(p.target.reason).toBe('not-desk');
    expect(commitPlacement(p)).toBeNull();
  });

  it('un objet déplacé part de sa place actuelle, valide', () => {
    const p = startPlacement(desk, COLS, { type: 'move', id: 'f1' }, CENTER);
    expect(p.target.ok).toBe(true);
    expect(p.draft).toEqual(desk);
  });

  it('un ordinateur neuf va sur le bureau libre', () => {
    const p = startPlacement(desk, COLS, { type: 'new', kind: 'computer' }, CENTER);
    expect(p.target).toMatchObject({ ok: true, deskId: 'f1' });
  });

  it('une carte d’écran vise un ordinateur', () => {
    const withPc = placeComputer(desk, 'f1', 'f2')!;
    const p = startPlacement(withPc, COLS, { type: 'card', choice: { target: 'screen', slug: 'Paris' } }, CENTER);
    expect(p.target).toMatchObject({ ok: true, computerId: 'f2' });
    expect(placingView(p).id).toBe('f2');
  });
});

describe('movePlacement', () => {
  it('donne la même raison que dropTargetFor sur le mur', () => {
    const p = movePlacement(startPlacement([], COLS, { type: 'new', kind: 'shelf' }, CENTER), COLS, spotAt(3, 8));
    expect(p.target).toMatchObject({ ok: false, reason: 'floor' });
    // Le fantôme est dessiné là où on l'a mis, même refusé.
    expect(p.draft.find((x) => x.id === DRAFT_ID)).toMatchObject({ col: 3 });
    expect(commitPlacement(p)).toBeNull();
  });

  it('hors de la pièce : refusé sans planter', () => {
    const p = movePlacement(startPlacement([], COLS, { type: 'new', kind: 'shelf' }, CENTER), COLS, spotAt(40, 15));
    expect(p.target.ok).toBe(false);
    expect(commitPlacement(p)).toBeNull();
  });

  it('un déplacement refusé ne change rien à la disposition de départ', () => {
    const p = movePlacement(startPlacement(desk, COLS, { type: 'move', id: 'f1' }, CENTER), COLS, spotAt(12, 8));
    expect(p.target.ok).toBe(false);
    expect(p.base).toEqual(desk);
  });
});

describe('commitPlacement : mêmes dispositions que les anciennes fonctions de pose', () => {
  const id = nextFurnitureId(desk);

  it('meuble debout', () => {
    const p = movePlacement(startPlacement(desk, COLS, { type: 'new', kind: 'shelf' }, CENTER), COLS, spotAt(14, 14));
    expect(commitPlacement(p)).toEqual(placeStanding(desk, COLS, 'shelf', p.target.col!, p.target.top!, id));
  });

  it('fenêtre', () => {
    const p = movePlacement(startPlacement(desk, COLS, { type: 'new', kind: 'window' }, CENTER), COLS, spotAt(12, 9));
    expect(commitPlacement(p)).toEqual(placeWindow(desk, COLS, p.target.col!, p.target.top!, id));
  });

  it('ordinateur', () => {
    const p = startPlacement(desk, COLS, { type: 'new', kind: 'computer' }, CENTER);
    expect(commitPlacement(p)).toEqual(placeComputer(desk, 'f1', id));
  });

  it('petit objet', () => {
    const p = startPlacement(desk, COLS, { type: 'new', kind: 'small-plant' }, CENTER);
    expect(commitPlacement(p)).toEqual(placeSmall(desk, 'f1', 'plant', id));
  });

  it('carte au mur', () => {
    const choice = { target: 'wall', shape: 'frame', slug: 'Paris' } as const;
    const p = movePlacement(startPlacement(desk, COLS, { type: 'card', choice }, CENTER), COLS, spotAt(14, 8));
    expect(commitPlacement(p)).toEqual(hang(desk, COLS, 'frame', p.target.col!, p.target.top!, 'Paris', id));
  });

  it('carte sur une étagère', () => {
    const shelf = placeStanding([], COLS, 'shelf', 2, 6, 'f1')!;
    const choice = { target: 'shelf', shape: 'book', slug: 'Paris' } as const;
    const p = startPlacement(shelf, COLS, { type: 'card', choice }, CENTER);
    expect(p.target.ok).toBe(true);
    expect(commitPlacement(p)).toEqual(storeCard(shelf, 'f1', p.target.slot!, 'book', 'Paris', nextFurnitureId(shelf)));
  });

  it('carte à l’écran', () => {
    const withPc = placeComputer(desk, 'f1', 'f2')!;
    const p = startPlacement(withPc, COLS, { type: 'card', choice: { target: 'screen', slug: 'Paris' } }, CENTER);
    expect(commitPlacement(p)).toEqual(setScreenCard(withPc, 'f2', 'Paris'));
  });

  it('déplacement', () => {
    const p = movePlacement(startPlacement(desk, COLS, { type: 'move', id: 'f1' }, CENTER), COLS, spotAt(12, 14));
    expect(commitPlacement(p)).toEqual(moveStanding(desk, COLS, 'f1', 12, 11));
  });

  it('toucher un bureau amène le petit objet dessus', () => {
    const two = placeStanding(desk, COLS, 'desk', 12, 11, 'f2')!;
    const p = moveToItem(startPlacement(two, COLS, { type: 'new', kind: 'small-plant' }, spotAt(3, 14)), COLS, 'f2');
    expect(p.target).toMatchObject({ ok: true, hostId: 'f2' });
  });
});

describe('retouches pendant le placement', () => {
  it('une lampe éteinte puis déplacée reste éteinte (pas de double bascule)', () => {
    let p = startPlacement([], COLS, { type: 'new', kind: 'lamp' }, CENTER);
    p = editPlacement(p, COLS, { type: 'lamp' })!;
    p = movePlacement(p, COLS, spotAt(5, 15));
    p = movePlacement(p, COLS, spotAt(8, 15));
    expect(commitPlacement(p)!.find((x) => x.kind === 'lamp')).toMatchObject({ lit: false });
  });

  it('une fenêtre agrandie puis déplacée garde sa taille', () => {
    let p = movePlacement(startPlacement([], COLS, { type: 'new', kind: 'window' }, CENTER), COLS, spotAt(4, 9));
    const before = p.draft.find((x) => x.id === DRAFT_ID) as { w: number; h: number };
    p = editPlacement(p, COLS, { type: 'size', w: before.w + 1, h: before.h })!;
    p = movePlacement(p, COLS, spotAt(14, 9));
    expect(commitPlacement(p)!.find((x) => x.kind === 'window')).toMatchObject({ w: before.w + 1, h: before.h });
  });

  it('la profondeur choisie est gardée au commit', () => {
    let p = movePlacement(startPlacement([], COLS, { type: 'new', kind: 'chair' }, CENTER), COLS, spotAt(10, 15));
    const next = editPlacement(p, COLS, { type: 'depth', delta: -1 });
    expect(next).not.toBeNull();
    p = next!;
    const committed = commitPlacement(p)!.find((x) => x.kind === 'chair') as { depth?: number };
    expect(committed.depth).toBeDefined();
  });

  it('une retouche impossible renvoie null', () => {
    const p = startPlacement([], COLS, { type: 'new', kind: 'computer' }, CENTER);
    expect(editPlacement(p, COLS, { type: 'lamp' })).toBeNull();
  });
});
```

Avant l'étape 3, vérifier dans `furniture-catalog.ts` que `'frame'` est bien un `WallShape`, `'book'` un `ShelfShape` et `'chair'` un `StandingKind` qui peut reculer. Sinon, remplacer par les identifiants réels (`grep -n "WallShape\|ShelfShape" src/core/library/library-types.ts`).

- [ ] **Étape 3 : lancer les tests pour vérifier qu'ils échouent**

Lancer : `npx vitest run tests/content/placement.test.ts`
Attendu : ÉCHEC, « Failed to resolve import "../../src/content/placement" ».

- [ ] **Étape 4 : écrire `src/content/placement.ts`**

```ts
import type { CardChoice } from './CardPickerDialog';
import { deskAtCell, dropTargetFor, type DropTarget } from './furniture-drag';
import { SMALL_ITEM_OF, WINDOW_DEFAULT, isSmallKind, isStandingKind } from '../core/library/furniture-catalog';
import { nextFurnitureId } from '../core/library/library-book';
import type { FurnitureKind, Layout, Placed } from '../core/library/library-types';
import {
  CELL_H, CELL_W, ROWS, firstFreeSlot, hang, moveComputer, moveHung, moveSmall, moveStanding, moveStored, moveWindow, placeComputer, placeSmall,
  placeStanding, pxRect, rectOf, resizeWindow, setScreenCard, shelfSlots, shiftDepth, storeCard, stretchWindow, toggleLamp, type PxRect, type Rect,
} from '../core/library/room-grid';

// Id de l'objet neuf tant qu'il n'est pas enregistré (renommé au ✓).
export const DRAFT_ID = '__draft__';

// Ce qu'on place : une vignette du tiroir, une carte choisie, ou un objet déjà posé.
export type Subject = { type: 'new'; kind: FurnitureKind } | { type: 'card'; choice: CardChoice } | { type: 'move'; id: string };
// Retouches faites pendant le placement, rejouées après chaque déplacement du fantôme.
export type Edit = { type: 'depth'; delta: 1 | -1 } | { type: 'lamp' } | { type: 'size'; w: number; h: number } | { type: 'stretch'; axis: 'width' | 'height' };
// Point visé : case (col, row) et position dans le dessin (x, y).
export type Spot = { col: number; row: number; x: number; y: number };
export type Placement = {
  subject: Subject;
  id: string;
  // Disposition enregistrée au début du placement.
  base: Layout;
  // Forme de l'objet neuf, pour viser avant qu'il soit posé (null pour un déplacement ou une carte d'écran).
  probe: Placed | null;
  spot: Spot;
  target: DropTarget;
  edits: Edit[];
  // Ce qu'on dessine : la disposition avec l'objet à la position visée (de force si elle est refusée).
  draft: Layout;
};
export type PlacingView = { id: string; ok: boolean; ghost: Rect | null; ghostPx?: PxRect };

export const spotAt = (col: number, row: number): Spot => ({ col, row, x: col * CELL_W + CELL_W / 2, y: row * CELL_H + CELL_H / 2 });
const spotOfPx = (x: number, y: number): Spot => ({ col: Math.floor(x / CELL_W), row: Math.floor(y / CELL_H), x, y });

const isScreen = (s: Subject): boolean => s.type === 'card' && s.choice.target === 'screen';

function probeOf(subject: Subject): Placed | null {
  if (subject.type === 'move') return null;
  if (subject.type === 'card') {
    const c = subject.choice;
    if (c.target === 'wall') return { id: DRAFT_ID, kind: 'wall', shape: c.shape, col: 0, row: 0, slug: c.slug, ...(c.color ? { color: c.color } : {}) };
    if (c.target === 'shelf') return { id: DRAFT_ID, kind: 'stored', shape: c.shape, shelfId: '', slot: 0, slug: c.slug };
    return null;
  }
  const kind = subject.kind;
  if (kind === 'window') return { id: DRAFT_ID, kind: 'window', col: 0, row: 0, ...WINDOW_DEFAULT };
  if (kind === 'computer') return { id: DRAFT_ID, kind: 'computer', deskId: '' };
  if (isSmallKind(kind)) return { id: DRAFT_ID, kind: 'small', item: SMALL_ITEM_OF[kind], hostId: '', slot: 0 };
  if (isStandingKind(kind)) return { id: DRAFT_ID, kind, col: 0, row: 0 };
  return null;
}

const withProbe = (layout: Layout, probe: Placed | null): Layout => (!probe || layout.some((x) => x.id === probe.id) ? layout : [...layout, probe]);

// Pose de force (sans vérification) d'un objet à case : meuble debout, fenêtre, objet accroché.
function withItemAt(layout: Layout, id: string, col: number, top: number): Layout {
  return layout.map((x) => (x.id === id && 'col' in x ? ({ ...x, col, row: top } as Placed) : x));
}

// Le rectangle d'un objet, ou celui de son porteur (ordinateur, petit objet, carte rangée).
function rectFor(layout: Layout, item: Placed): Rect | null {
  const own = rectOf(item);
  if (own) return own;
  const hostId = item.kind === 'computer' ? item.deskId : item.kind === 'small' ? item.hostId : item.kind === 'stored' ? item.shelfId : null;
  const host = hostId ? layout.find((x) => x.id === hostId) : undefined;
  return host ? rectOf(host) : null;
}

// Carte d'écran : l'ordinateur posé sur le bureau qui contient la case.
function screenTarget(layout: Layout, spot: Spot): DropTarget {
  const deskId = deskAtCell(layout, spot.col, spot.row);
  const pc = deskId ? layout.find((x) => x.kind === 'computer' && x.deskId === deskId) : undefined;
  const desk = deskId ? layout.find((x) => x.id === deskId) : undefined;
  if (!pc || !desk) return { ok: false, reason: 'not-screen', cells: [{ col: spot.col, row: spot.row }], ghost: { col: spot.col, row: spot.row, w: 1, h: 1 } };
  return { ok: true, cells: [], ghost: rectOf(desk), computerId: pc.id };
}

function aim(layout: Layout, cols: number, p: Placement, spot: Spot): DropTarget {
  if (isScreen(p.subject)) return screenTarget(layout, spot);
  return dropTargetFor(layout, cols, p.id, spot.col, spot.row, spot.x, spot.y);
}

// Construit la disposition avec l'objet à la cible valide, par les fonctions de pose existantes ; null si elles refusent.
function build(p: Placement, cols: number, t: DropTarget): Layout | null {
  const base = p.base;
  const s = p.subject;
  if (s.type === 'move') {
    const item = base.find((x) => x.id === p.id);
    if (!item) return null;
    if (item.kind === 'computer') return t.deskId ? moveComputer(base, p.id, t.deskId) : null;
    if (item.kind === 'small') return t.hostId ? moveSmall(base, p.id, t.hostId) : null;
    if (item.kind === 'stored') return t.shelfId !== undefined && t.slot !== undefined ? moveStored(base, p.id, t.shelfId, t.slot) : null;
    if (t.col === undefined || t.top === undefined) return null;
    if (item.kind === 'window') return moveWindow(base, cols, p.id, t.col, t.top);
    if (item.kind === 'wall') return moveHung(base, cols, p.id, t.col, t.top);
    return moveStanding(base, cols, p.id, t.col, t.top);
  }
  if (s.type === 'card') {
    const c = s.choice;
    if (c.target === 'screen') return t.computerId ? setScreenCard(base, t.computerId, c.slug) : null;
    if (c.target === 'shelf') return t.shelfId !== undefined && t.slot !== undefined ? storeCard(base, t.shelfId, t.slot, c.shape, c.slug, DRAFT_ID) : null;
    return t.col !== undefined && t.top !== undefined ? hang(base, cols, c.shape, t.col, t.top, c.slug, DRAFT_ID, c.color) : null;
  }
  const kind = s.kind;
  // Fenêtre neuve : posée de force à la cible (validée avec sa taille courante), la taille est rejouée ensuite.
  if (kind === 'window') return t.col !== undefined && t.top !== undefined ? withItemAt(withProbe(base, p.probe), DRAFT_ID, t.col, t.top) : null;
  if (kind === 'computer') return t.deskId ? placeComputer(base, t.deskId, DRAFT_ID) : null;
  if (isSmallKind(kind)) return t.hostId ? placeSmall(base, t.hostId, SMALL_ITEM_OF[kind], DRAFT_ID) : null;
  if (isStandingKind(kind)) return t.col !== undefined && t.top !== undefined ? placeStanding(base, cols, kind, t.col, t.top, DRAFT_ID) : null;
  return null;
}

// Fantôme refusé : un objet à case est dessiné là où on l'a mis ; un objet à porteur n'est pas dessiné (seule l'empreinte rouge l'est).
function force(p: Placement, t: DropTarget): Layout {
  const fresh = withProbe(p.base, p.probe);
  const item = fresh.find((x) => x.id === p.id);
  if (item && 'col' in item && t.col !== undefined && t.top !== undefined) return withItemAt(fresh, p.id, t.col, t.top);
  return p.base;
}

function applyEdit(layout: Layout, cols: number, id: string, e: Edit): Layout | null {
  if (!layout.some((x) => x.id === id)) return null;
  if (e.type === 'depth') return shiftDepth(layout, id, e.delta);
  if (e.type === 'lamp') {
    const next = toggleLamp(layout, id);
    return next === layout ? null : next;
  }
  if (e.type === 'size') return resizeWindow(layout, cols, id, e.w, e.h);
  const r = stretchWindow(layout, cols, id, e.axis);
  return r.ok ? r.layout : null;
}

const replay = (layout: Layout, cols: number, id: string, edits: Edit[]): Layout =>
  edits.reduce((l, e) => applyEdit(l, cols, id, e) ?? l, layout);

function settle(p: Placement, cols: number, spot: Spot): Placement {
  const target = aim(withProbe(p.draft, p.probe), cols, p, spot);
  const built = target.ok ? build(p, cols, target) : null;
  const shown = replay(built ?? force(p, target), cols, p.id, p.edits);
  return { ...p, spot, target: built ? target : { ...target, ok: false }, draft: shown };
}

// Où se trouve aujourd'hui un objet posé (pour partir de sa place).
function anchorOf(layout: Layout, id: string): Spot | null {
  const item = layout.find((x) => x.id === id);
  if (!item) return null;
  if (item.kind === 'stored') {
    const shelf = layout.find((x) => x.id === item.shelfId);
    const r = shelf ? rectOf(shelf) : null;
    const box = r ? shelfSlots(pxRect(r))[item.slot] : undefined;
    return box ? spotOfPx(box.x + box.w / 2, box.y + box.h / 2) : null;
  }
  const r = rectFor(layout, item);
  return r ? spotAt(r.col, r.row + r.h - 1) : null;
}

// Points à essayer, du plus proche au plus loin du centre ; les emplacements d'étagère en plus pour une carte rangée.
function candidates(layout: Layout, cols: number, subject: Subject, center: Spot): Spot[] {
  const spots: Spot[] = [];
  for (let col = 0; col < cols; col++) for (let row = 0; row < ROWS; row++) spots.push(spotAt(col, row));
  if (subject.type === 'card' && subject.choice.target === 'shelf') {
    for (const shelf of layout.filter((x) => x.kind === 'shelf')) {
      const r = rectOf(shelf);
      if (r) for (const b of shelfSlots(pxRect(r))) spots.push(spotOfPx(b.x + b.w / 2, b.y + b.h / 2));
    }
  }
  const d = (s: Spot): number => (s.x - center.x) ** 2 + (s.y - center.y) ** 2;
  return spots.sort((a, b) => d(a) - d(b));
}

export function startPlacement(layout: Layout, cols: number, subject: Subject, center: Spot): Placement {
  const p0: Placement = {
    subject,
    id: subject.type === 'move' ? subject.id : DRAFT_ID,
    base: layout,
    probe: probeOf(subject),
    spot: center,
    target: { ok: false, cells: [], ghost: null },
    edits: [],
    draft: layout,
  };
  if (subject.type === 'move') {
    const here = anchorOf(layout, subject.id);
    if (here) return settle(p0, cols, here);
  }
  const aimAt = withProbe(layout, p0.probe);
  for (const spot of candidates(layout, cols, subject, center)) {
    if (!aim(aimAt, cols, p0, spot).ok) continue;
    const s = settle(p0, cols, spot);
    if (s.target.ok) return s;
  }
  return settle(p0, cols, center);
}

export const movePlacement = (p: Placement, cols: number, spot: Spot): Placement => settle(p, cols, spot);

// Toucher un meuble pendant le placement : le fantôme vise ce meuble (porteur, étagère, ordinateur) ou sa case du bas à gauche.
export function moveToItem(p: Placement, cols: number, itemId: string): Placement {
  const item = p.base.find((x) => x.id === itemId);
  if (!item) return p;
  const r = rectFor(p.base, item);
  if (!r) return p;
  const wantsSlot = (p.subject.type === 'card' && p.subject.choice.target === 'shelf') || p.base.find((x) => x.id === p.id)?.kind === 'stored';
  if (wantsSlot && item.kind === 'shelf') {
    const slot = firstFreeSlot(p.base, item.id);
    const box = slot === null ? undefined : shelfSlots(pxRect(r))[slot];
    if (box) return settle(p, cols, spotOfPx(box.x + box.w / 2, box.y + box.h / 2));
  }
  const px = pxRect(r);
  return settle(p, cols, { col: r.col, row: r.row + r.h - 1, x: px.x + px.w / 2, y: px.y + px.h / 2 });
}

export function editPlacement(p: Placement, cols: number, edit: Edit): Placement | null {
  const next = applyEdit(p.draft, cols, p.id, edit);
  if (!next) return null;
  return settle({ ...p, draft: next, edits: [...p.edits, edit] }, cols, p.spot);
}

// Disposition finale à enregistrer, l'id provisoire remplacé ; null si la cible est refusée.
export function commitPlacement(p: Placement): Layout | null {
  if (!p.target.ok) return null;
  if (!p.draft.some((x) => x.id === DRAFT_ID)) return p.draft;
  const id = nextFurnitureId(p.base);
  return p.draft.map((x) => (x.id === DRAFT_ID ? ({ ...x, id } as Placed) : x));
}

export const placingView = (p: Placement): PlacingView => ({
  id: isScreen(p.subject) ? (p.target.computerId ?? '') : p.id,
  ok: p.target.ok,
  ghost: p.target.ghost,
  ...(p.target.ghostPx ? { ghostPx: p.target.ghostPx } : {}),
});
```

Note sur `editPlacement` : la retouche est appliquée au brouillon puis rejouée par `settle`. Comme `build` repart de `base` et rejoue toutes les retouches, la lampe n'est jamais basculée deux fois. Pour une fenêtre neuve, `build` part de `withProbe(base)` (taille par défaut) puis rejoue la taille.

- [ ] **Étape 5 : lancer les tests jusqu'à ce qu'ils passent**

Lancer : `npx vitest run tests/content/placement.test.ts`
Attendu : tout passe. Si une fonction de pose a un nom ou une signature différente de ce qui est écrit ici (vérifier avec `grep -n "export function" src/core/library/room-grid.ts`), corriger l'appel dans `placement.ts`, mais jamais l'attente du test.

- [ ] **Étape 6 : ajouter le fichier à la famille et commiter**

Dans `tests/familles.ts`, famille `scene-piece`, ajouter `'placement.*'` dans `c(...)`. Puis :

```bash
npx vitest run tests/familles.test.ts
git add src/content/furniture-drag.ts src/content/placement.ts tests/content/placement.test.ts tests/familles.ts
git commit -m "feat(bibliotheque): module pur du mode placement (brouillon, visée, retouches, validation)"
```

---

### Tâche 2 : RoomView dessine le fantôme du placement

**Fichiers :**
- Modifier : `src/content/RoomView.tsx` (Props, `renderPlaced`, `cardGroup`, contours fantômes en fin de dessin)
- Tester : `tests/content/library-furniture-view.test.tsx` (ajouter un `describe`)

**Interfaces :**
- Utilise : `PlacingView` (tâche 1).
- Fournit : la prop `placing?: PlacingView | null` de `RoomView`. L'objet visé porte `data-placing="ok|refused"` et `opacity` 0.8, et le contour d'empreinte porte `data-drag-ghost="ok|refused"` comme pour le glissé.

- [ ] **Étape 1 : test qui échoue**

Ouvrir `tests/content/library-furniture-view.test.tsx` et réutiliser son rendu de `RoomView` (même fabrique de pièce et mêmes props). Ajouter :

```tsx
describe('RoomView : fantôme du placement', () => {
  it('estompe l’objet placé et dessine son empreinte verte', () => {
    renderRoom({ layout: [{ id: 'f1', kind: 'shelf', col: 2, row: 6 }], placing: { id: 'f1', ok: true, ghost: { col: 2, row: 6, w: 3, h: 9 } } });
    const g = container.querySelector('[data-id="f1"]')!;
    expect(g.getAttribute('data-placing')).toBe('ok');
    expect(g.getAttribute('opacity')).toBe('0.8');
    expect(container.querySelector('[data-drag-ghost="ok"]')).not.toBeNull();
  });

  it('empreinte rouge quand c’est refusé', () => {
    renderRoom({ layout: [], placing: { id: '__draft__', ok: false, ghost: { col: 2, row: 6, w: 1, h: 1 } } });
    expect(container.querySelector('[data-drag-ghost="refused"]')).not.toBeNull();
  });
});
```

Si le fichier n'a pas de fonction `renderRoom`, en écrire une en tête du `describe`, avec les props minimales déjà utilisées par ses tests (`room`, `editing: true`, `cellsActive: false`, `selectedId: null`, `blink: []`, `onCell`, `onPick`) et `placing` en plus.

- [ ] **Étape 2 : vérifier l'échec**

Lancer : `npx vitest run tests/content/library-furniture-view.test.tsx`
Attendu : ÉCHEC, `data-placing` vaut null.

- [ ] **Étape 3 : implémenter**

Dans `RoomView.tsx` :
1. Importer `import type { PlacingView } from './placement';`, ajouter à `Props` :
   ```ts
   // Mode placement : l'objet en cours de placement (estompé) et son empreinte (verte si valide, rouge sinon).
   placing?: PlacingView | null;
   ```
   et ajouter `placing = null` à la déstructuration des props.
2. Dans `renderPlaced` et dans `cardGroup`, sur le `<g data-id=…>` :
   ```tsx
   data-placing={placing?.id === placed.id ? (placing.ok ? 'ok' : 'refused') : undefined}
   opacity={lifted ? 0.3 : placing?.id === placed.id ? 0.8 : /* valeur actuelle */ 1}
   ```
   Dans `cardGroup`, la valeur actuelle est `missing ? 0.35 : 1`.
3. En fin de dessin, remplacer les deux blocs `{drag?.ghostPx && …}` et `{drag?.ghost && …}` par la même chose sur `const ghostView = drag ?? placing;`, déclarée juste avant le `return` du composant, en remplaçant `drag.` par `ghostView.` dans ces deux blocs.

- [ ] **Étape 4 : vérifier le passage**

Lancer : `npx vitest run tests/content/library-furniture-view.test.tsx tests/content/library-drag.test.tsx`
Attendu : tout passe (le glissé existant n'a pas changé).

- [ ] **Étape 5 : commiter**

```bash
git add src/content/RoomView.tsx tests/content/library-furniture-view.test.tsx
git commit -m "feat(bibliotheque): RoomView dessine le fantôme et l'empreinte du placement"
```

---

### Tâche 3 : barre de placement et poignée ✥

**Fichiers :**
- Modifier : `src/content/action-bubble.tsx` (extraire le calcul de position dans un hook)
- Créer : `src/content/placement-bar.tsx`
- Tester : `tests/content/placement-bar.test.tsx` ; ajouter `'placement-bar.*'` à la famille `scene-piece` dans `tests/familles.ts`

**Interfaces :**
- Fournit :
  - `useAnchor(stage, scroll, targetId, mode: 'above' | 'center')`, qui renvoie `{ ref, pos }` ;
  - `PlacementBar({ stage, scroll, targetId, ok, onCancel, onConfirm, children })` ;
  - `PlacementGrip({ stage, scroll, targetId, onGrab })`, où `onGrab` reçoit l'événement `pointerdown` React.
- Sélecteurs : `[data-placement-bar]`, `[data-action="place-cancel"]`, `[data-action="place-confirm"]` (`disabled` si `!ok`), `[data-action="place-grip"]`.

- [ ] **Étape 1 : test qui échoue**

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlacementBar } from '../../src/content/placement-bar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('PlacementBar', () => {
  it('✓ grisé quand refusé, ✗ toujours actif', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    await act(async () => { root.render(<PlacementBar stage={null} scroll={null} targetId="f1" ok={false} onCancel={onCancel} onConfirm={onConfirm}><span data-extra /></PlacementBar>); });
    const confirm = container.querySelector<HTMLButtonElement>('[data-action="place-confirm"]')!;
    expect(confirm.disabled).toBe(true);
    container.querySelector<HTMLButtonElement>('[data-action="place-cancel"]')!.click();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-extra]')).not.toBeNull();
  });

  it('✓ actif quand l’emplacement est valide', async () => {
    const onConfirm = vi.fn();
    await act(async () => { root.render(<PlacementBar stage={null} scroll={null} targetId="f1" ok onCancel={() => undefined} onConfirm={onConfirm}>{null}</PlacementBar>); });
    container.querySelector<HTMLButtonElement>('[data-action="place-confirm"]')!.click();
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Étape 2 : vérifier l'échec**

Lancer : `npx vitest run tests/content/placement-bar.test.tsx` → ÉCHEC (import introuvable).

- [ ] **Étape 3 : extraire le hook dans `action-bubble.tsx`**

Remplacer le contenu par :

```tsx
import { useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

const GAP = 8;

// Position d'un élément flottant sur l'objet `targetId`, dans le repère de la scène : au-dessus (en dessous s'il touche le haut),
// ou centré sur l'objet. Bornée à la largeur de la scène ; recalée à chaque rendu, au défilement de la pièce et au redimensionnement.
export function useAnchor(stage: HTMLElement | null, scroll: HTMLElement | null, targetId: string, mode: 'above' | 'center') {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 8, top: 8 });
  useLayoutEffect(() => {
    const place = (): void => {
      const box = ref.current;
      const target = Array.from(scroll?.querySelectorAll('[data-id]') ?? []).find((el) => el.getAttribute('data-id') === targetId);
      if (!stage || !box || !target) return;
      const s = stage.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const centerX = t.left - s.left + t.width / 2;
      const top = mode === 'center'
        ? t.top - s.top + t.height / 2 - b.height / 2
        : t.top - s.top - b.height - GAP >= 0 ? t.top - s.top - b.height - GAP : t.bottom - s.top + GAP;
      const left = Math.min(Math.max(0, centerX - b.width / 2), Math.max(0, s.width - b.width));
      setPos((p) => (p.left === left && p.top === top ? p : { left, top }));
    };
    place();
    scroll?.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      scroll?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  });
  return { ref, pos };
}

// Bulle d'actions posée au-dessus de l'objet sélectionné.
export function ActionBubble({ stage, scroll, targetId, children }: { stage: HTMLElement | null; scroll: HTMLElement | null; targetId: string; children: ReactNode }): ReactElement {
  const { ref, pos } = useAnchor(stage, scroll, targetId, 'above');
  return (
    <div ref={ref} className="wmt-lib-bubble" data-action-bubble role="toolbar" aria-label="Actions sur l’objet" style={{ left: pos.left, top: pos.top }}>
      {children}
    </div>
  );
}
```

- [ ] **Étape 4 : écrire `placement-bar.tsx`**

```tsx
import type { PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from 'react';
import { useAnchor } from './action-bubble';
import { Btn, Icon, ICONS } from './library-ui';

type Anchor = { stage: HTMLElement | null; scroll: HTMLElement | null; targetId: string };

// Barre du mode placement, au-dessus de l'objet : ses boutons propres, puis ✗ (annuler) et ✓ (valider, grisé si l'emplacement est refusé).
export function PlacementBar({ stage, scroll, targetId, ok, onCancel, onConfirm, children }: Anchor & { ok: boolean; onCancel: () => void; onConfirm: () => void; children: ReactNode }): ReactElement {
  const { ref, pos } = useAnchor(stage, scroll, targetId, 'above');
  return (
    <div ref={ref} className="wmt-lib-bubble wmt-lib-placebar" data-placement-bar role="toolbar" aria-label="Placement de l’objet" style={{ left: pos.left, top: pos.top }}>
      {children}
      <span className="wmt-lib-placebar-sep" />
      <Btn className="wmt-lib-cancel" label="Annuler" data={{ action: 'place-cancel' }} onClick={onCancel}>
        <Icon paths={ICONS.close} />
      </Btn>
      <Btn className="wmt-lib-confirm" label="Valider" disabled={!ok} data={{ action: 'place-confirm' }} onClick={onConfirm}>
        <Icon paths={ICONS.check} />
      </Btn>
    </div>
  );
}

// Poignée ✥ au centre de l'objet : on la fait glisser pour déplacer le fantôme.
export function PlacementGrip({ stage, scroll, targetId, onGrab }: Anchor & { onGrab: (event: ReactPointerEvent<HTMLButtonElement>) => void }): ReactElement {
  const { ref, pos } = useAnchor(stage, scroll, targetId, 'center');
  return (
    <div ref={ref} className="wmt-lib-grip-box" style={{ left: pos.left, top: pos.top }}>
      <button type="button" className="wmt-lib-grip" data-action="place-grip" aria-label="Glisser pour déplacer" title="Glisser pour déplacer" onPointerDown={onGrab} style={{ touchAction: 'none' }}>
        <Icon paths={ICONS.move} />
      </button>
    </div>
  );
}
```

- [ ] **Étape 5 : vérifier le passage, ajouter à la famille, commiter**

```bash
npx vitest run tests/content/placement-bar.test.tsx tests/content/library-sims-ui.test.tsx tests/familles.test.ts
git add src/content/action-bubble.tsx src/content/placement-bar.tsx tests/content/placement-bar.test.tsx tests/familles.ts
git commit -m "feat(bibliotheque): barre de placement (✗ / ✓) et poignée, positionnées comme la bulle"
```

(Ajouter `'placement-bar.*'` à `scene-piece` avant le commit.)

---

### Tâche 4 : LibraryPanel passe au mode placement (toucher)

**Fichiers :**
- Modifier : `src/content/LibraryPanel.tsx`
- Modifier les tests : `tests/content/library-panel.test.tsx`, `library-furniture.test.tsx`, `library-cards.test.tsx`, `library-lamps.test.tsx`, `library-light-ui.test.tsx`, `library-window-furniture.test.tsx`, `library-steampunk-furniture.test.tsx`, `library-style-selector.test.tsx`, `library-sims-ui.test.tsx`, et tout autre fichier que `grep -ln 'data-kind="\|data-action="move"\|add-card' tests/content` désigne, sauf `library-drag.test.tsx` (traité dans la tâche 5)
- Créer les tests : `tests/content/library-placement.test.tsx` ; l'ajouter à `scene-piece`

**Interfaces :**
- Utilise : la tâche 1 (`startPlacement`, `movePlacement`, `moveToItem`, `editPlacement`, `commitPlacement`, `placingView`, `spotAt`, `type Placement`, `type Edit`), la tâche 2 (prop `placing`) et la tâche 3 (`PlacementBar`).
- Fournit, pour la tâche 5 :
  - l'état `placement` ;
  - `startPlacementFor(subject)` ;
  - `cancelPlacement()` ;
  - `confirmPlacement()` ;
  - `centerSpot()`.

- [ ] **Étape 1 : tests du parcours qui échouent**

Créer `tests/content/library-placement.test.tsx`, avec le même en-tête que `library-drag.test.tsx` (`settle`, `q`, `click`, `layoutNow`, `stubSvgRect`, `beforeEach`/`afterEach`), puis :

```tsx
const confirm = () => click('[data-action="place-confirm"]');

describe('mode placement', () => {
  it('une vignette ouvre le placement : tiroir caché, barre visible, rien d’enregistré', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    expect((q('[data-drawer]') as HTMLElement).hidden).toBe(true);
    expect(q('[data-placement-bar]')).not.toBeNull();
    expect(layoutNow()).toHaveLength(0);
  });

  it('✓ enregistre l’objet et rouvre le tiroir', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-13"]');
    await confirm();
    expect(layoutNow()).toEqual([expect.objectContaining({ kind: 'shelf' })]);
    expect((q('[data-drawer]') as HTMLElement).hidden).toBe(false);
    expect(q('[data-placement-bar]')).toBeNull();
  });

  it('✗ et Échap n’enregistrent rien', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-action="place-cancel"]');
    expect(layoutNow()).toHaveLength(0);
    await click('[data-kind="shelf"]');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await settle();
    expect(q('[data-placement-bar]')).toBeNull();
    expect(layoutNow()).toHaveLength(0);
  });

  it('✓ grisé et raison affichée sur un emplacement refusé', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-cell="3-8"]');
    expect((q('[data-action="place-confirm"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q('[role="status"]')?.textContent).toContain('sol');
  });

  it('« Déplacer » puis ✗ laisse l’objet en place', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="desk"]');
    await click('[data-cell="2-14"]');
    await confirm();
    await click('[data-furniture="desk"]');
    await click('[data-action="move"]');
    await click('[data-cell="12-14"]');
    expect(layoutNow()[0]).toMatchObject({ col: 2 });
    await click('[data-action="place-cancel"]');
    expect(layoutNow()[0]).toMatchObject({ col: 2 });
  });

  it('passer en Visiter ou changer de pièce abandonne le placement', async () => {
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-action="visit"]');
    expect(q('[data-placement-bar]')).toBeNull();
    await click('[data-action="edit"]');
    await click('[data-kind="shelf"]');
    await click('[data-action="add-room"]');
    expect(q('[data-placement-bar]')).toBeNull();
    expect(repo.current()!.rooms[0]!.layout).toHaveLength(0);
  });

  it('la barre propose 💡 pour une lampe, et la bascule est gardée au ✓', async () => {
    await click('[data-action="edit"]');
    await click('[data-category="deco"]');
    await click('[data-subcategory="lights"]');
    await click('[data-kind="lamp"]');
    await click('[data-placement-bar] [data-action="lamp"]');
    await confirm();
    expect(layoutNow().find((p) => p.kind === 'lamp')).toMatchObject({ lit: false });
  });
});
```

Lancer : `npx vitest run tests/content/library-placement.test.tsx`. Attendu : ÉCHEC (`[data-placement-bar]` introuvable).

- [ ] **Étape 2 : brancher l'état dans `LibraryPanel.tsx`**

1. **Imports** : `startPlacement, movePlacement, moveToItem, editPlacement, commitPlacement, placingView, spotAt, type Placement, type Edit, type Subject` depuis `./placement`, et `PlacementBar` depuis `./placement-bar`.
2. **État** : ajouter `const [placement, setPlacement] = useState<Placement | null>(null);`. Dans `reset()`, ajouter `setPlacement(null);`. Tous les chemins d'abandon (mode, pièce, style, onglet du tiroir, météo…) passent déjà par `reset()`. Ajouter aussi `setPlacement(null)` dans `goOutside`.
3. **Centre de la zone visible** :
   ```ts
   // Case au centre de la partie visible de la pièce (au milieu de la pièce si elle n'est pas mesurable, par exemple dans les tests).
   const centerSpot = () => {
     const sc = scrollRef.current;
     const svg = sc?.querySelector('svg[role="img"]');
     const s = svg?.getBoundingClientRect();
     if (!sc || !s || s.width === 0 || s.height === 0) return spotAt(Math.floor(room.cols / 2), ROWS - 3);
     const x = ((sc.scrollLeft + sc.clientWidth / 2) / s.width) * room.cols * CELL_W;
     const y = ((sc.scrollTop + sc.clientHeight / 2) / s.height) * HEIGHT;
     return spotAt(Math.floor(x / CELL_W), Math.min(ROWS - 1, Math.floor(y / CELL_H)));
   };
   ```
   Importer `ROWS` et `CELL_H` depuis `../core/library/room-grid` s'ils ne le sont pas déjà.
4. **Messages** : ajouter `'not-screen': 'Touchez un ordinateur.'` à `REASONS`, puis :
   ```ts
   const HINT = 'Glissez ✥ ou touchez l’endroit voulu.';
   const showPlacement = (next: Placement): void => {
     setPlacement(next);
     setMessage(next.target.ok ? HINT : next.target.reason ? REASONS[next.target.reason] : '');
     setBlink(next.target.ok ? [] : next.target.cells);
   };
   const startPlacementFor = (subject: Subject): void => {
     reset();
     showPlacement(startPlacement(layout, room.cols, subject, centerSpot()));
   };
   const cancelPlacement = (): void => reset();
   const confirmPlacement = async (): Promise<void> => {
     if (!placement) return;
     const done = commitPlacement(placement);
     if (!done) return;
     const keep = placement.subject.type === 'move' ? placement.id : null;
     await editLayout(() => done);
     reset();
     if (keep) setSelectedId(keep);
   };
   const editPlacing = (edit: Edit): void => {
     if (!placement) return;
     const next = editPlacement(placement, room.cols, edit);
     if (next) showPlacement(next);
     else refuse('Impossible ici.');
   };
   ```
5. **Points d'entrée** :
   - `startNew(kind)` garde sa garde Steampunk (`if ((STEAMPUNK_ONLY as readonly string[]).includes(kind) && room.style !== 'steampunk') return reset();`), puis appelle `startPlacementFor({ type: 'new', kind })`. On supprime l'ancien refus `hasFreeHost` et l'ancien `setTool`/`setMessage`.
   - `chooseCard(choice)` : `setPicking(false); startPlacementFor({ type: 'card', choice });`
   - `startMove()` : on garde les gardes (`selectedId`, refus de `stored` « Appui long pour la déplacer. »), puis `startPlacementFor({ type: 'move', id: selectedId })`.
   - `startCard()` : on supprime le cas « rappuyer annule » (`tool?.type === 'card'`), puis `reset(); setPicking(true);`.
6. **Touchers pendant un placement** :
   - au début de `onCell` : `if (placement) return showPlacement(movePlacement(placement, room.cols, spotAt(col, row)));`
   - au début de `onPick`, après le cas `!editing` et `press.consumeClick()` : `if (placement) { if (id !== placingView(placement).id) showPlacement(moveToItem(placement, room.cols, id)); return; }`
   - dans `onCardTap`, en mode édition : `if (placement) return void onPick(item.kind === 'stored' ? item.shelfId : item.id);`
   
   Supprimer ensuite le code des anciens outils devenu mort : les branches `tool?.type === 'new'`/`'move'`/`'card'` de `onPick` et de `onCell`, ainsi que `placeWindowAt`, `placeWall`, `placeOnFurniture`, `movingItem`, `targetsHost`, `placing` (l'ancien), l'état `tool` et l'état `pending`. Remplacer `cellsActive` par :
   ```ts
   const hostKind = placement !== null && (
     (placement.subject.type === 'new' && (placement.subject.kind === 'computer' || isSmallKind(placement.subject.kind)))
     || (placement.subject.type === 'card' && placement.subject.choice.target !== 'wall')
     || (placement.subject.type === 'move' && ['computer', 'small', 'stored'].includes(placement.base.find((p) => p.id === placement.id)?.kind ?? '')));
   const cellsActive = placement !== null && !hostKind;
   ```
7. **Échap** pendant un placement :
   ```ts
   useEffect(() => {
     if (!placement) return;
     const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') reset(); };
     window.addEventListener('keydown', onKey);
     return () => window.removeEventListener('keydown', onKey);
   }, [placement !== null]);
   ```
   `reset` est recréé à chaque rendu, mais il ne fait qu'appeler des fonctions `set…`, qui sont stables. Ajouter `// eslint-disable-next-line react-hooks/exhaustive-deps` au-dessus du tableau de dépendances.
8. **Rendu** :
   - `<RoomView room={placement ? { ...room, layout: placement.draft } : room} … placing={placement ? placingView(placement) : null} />`
   - Le tiroir reste rendu mais il est caché : passer `hidden={placement !== null}` à `BuildDrawer`. Dans `build-drawer.tsx`, ajouter `hidden?: boolean` aux props et le poser sur les deux `div` racines (`hidden={props.hidden}`).
   - Le tiroir reçoit `activeKind={null}` et `cardActive={false}`. Ces props et leur `aria-pressed` sont retirés de `BuildDrawer` (voir la spec, « Ce qui disparaît »).
   - La bulle `ActionBubble` ne s'affiche que si `!placement`.
   - Pendant un placement, à l'intérieur de la pièce :
     ```tsx
     {editing && !outside && placement && (
       <PlacementBar stage={stage.ref.current} scroll={scrollRef.current} targetId={placingView(placement).id} ok={placement.target.ok} onCancel={cancelPlacement} onConfirm={() => void confirmPlacement()}>
         {placingStanding && (
           <>
             <Btn label="Avancer" data={{ action: 'depth-front' }} disabled={!canShiftDepth(placement.draft, placement.id, 1)} onClick={() => editPlacing({ type: 'depth', delta: 1 })}><Icon paths={ICONS.depthFront} /></Btn>
             <Btn label="Reculer" data={{ action: 'depth-back' }} disabled={!canShiftDepth(placement.draft, placement.id, -1)} onClick={() => editPlacing({ type: 'depth', delta: -1 })}><Icon paths={ICONS.depthBack} /></Btn>
           </>
         )}
         {placingLamp && (
           <Btn label={placingLamp.on ? 'Éteindre la lampe' : 'Allumer la lampe'} pressed={placingLamp.on} data={{ action: 'lamp' }} onClick={() => editPlacing({ type: 'lamp' })}><Icon paths={ICONS.bulb} /></Btn>
         )}
         {placingWindow && (
           <>
             <Btn label="Fenêtre plus étroite" data={{ action: 'win-w-' }} onClick={() => editPlacing({ type: 'size', w: placingWindow.w - 1, h: placingWindow.h })}><Icon paths={ICONS.widthMinus} /></Btn>
             <Btn label="Fenêtre plus large" data={{ action: 'win-w+' }} onClick={() => editPlacing({ type: 'size', w: placingWindow.w + 1, h: placingWindow.h })}><Icon paths={ICONS.widthPlus} /></Btn>
             <Btn label="Fenêtre moins haute" data={{ action: 'win-h-' }} onClick={() => editPlacing({ type: 'size', w: placingWindow.w, h: placingWindow.h - 1 })}><Icon paths={ICONS.heightMinus} /></Btn>
             <Btn label="Fenêtre plus haute" data={{ action: 'win-h+' }} onClick={() => editPlacing({ type: 'size', w: placingWindow.w, h: placingWindow.h + 1 })}><Icon paths={ICONS.heightPlus} /></Btn>
             <Btn label="Fenêtre sur toute la largeur du mur" data={{ action: 'win-w-full' }} onClick={() => editPlacing({ type: 'stretch', axis: 'width' })}><Icon paths={ICONS.widthFull} /></Btn>
             <Btn label="Fenêtre sur toute la hauteur du mur" data={{ action: 'win-h-full' }} onClick={() => editPlacing({ type: 'stretch', axis: 'height' })}><Icon paths={ICONS.heightFull} /></Btn>
           </>
         )}
       </PlacementBar>
     )}
     ```
     avec, calculés juste avant le `return` :
     ```ts
     const placingItem = placement?.draft.find((p) => p.id === placement.id);
     const placingStanding = placingItem && isStanding(placingItem) && placingItem.kind !== 'rug' ? placingItem : undefined;
     const placingLamp = placingItem && isLamp(placingItem) ? { on: isLit(placingItem) } : null;
     const placingWindow = placingItem?.kind === 'window' ? placingItem : undefined;
     ```
   - Les messages en plein écran (`STAGE_MESSAGE`) restent rendus quand `message` est non vide. La tâche 7 les habille.
9. **Appui long (provisoire, la tâche 5 le remplace)** : `startDragRef.current = (id) => { setMode('edit'); startPlacementFor({ type: 'move', id }); };`. Supprimer l'état `drag`, `locate`, l'effet du glissé, `dropLifted` et `live`. Ne plus passer `drag` à `RoomView`.

- [ ] **Étape 3 : faire passer les nouveaux tests**

Lancer : `npx vitest run tests/content/library-placement.test.tsx`
Attendu : tout passe. Corriger l'implémentation, jamais les attentes.

- [ ] **Étape 4 : adapter les tests existants**

Règle mécanique : après chaque pose par « vignette (`data-kind`) ou carte choisie, puis toucher d'une case ou d'un meuble », et après chaque « `data-action="move"` puis toucher », ajouter `await click('[data-action="place-confirm"]');`. Dans chaque fichier, définir une fois `const confirm = () => click('[data-action="place-confirm"]');`.

Cas particuliers :
- Les tests de **refus** (« refuse un meuble posé sur le mur… ») gardent leur toucher et leur attente sur `[role="status"]`. En revanche, l'attente « aucun meuble » devient `expect(layoutNow()).toHaveLength(0)`, parce que le fantôme refusé est dessiné. Si le fichier n'a pas `layoutNow`, l'ajouter : `const layoutNow = () => repo.current()?.rooms[0]?.layout ?? [];`.
- « pose un ordinateur sur un bureau, une seule fois » : pour le second ordinateur, pas de ✓. On vérifie que `[data-action="place-confirm"]` est désactivé, que le message contient « déjà » et qu'il n'y a qu'un ordinateur dans `layoutNow()`.
- Les tests qui comptent les `[data-furniture=…]` pendant un placement doivent compter après ✓ ou ✗.
- Les tests qui vérifiaient `aria-pressed` sur une vignette ou sur « Ajouter une carte » sont supprimés (comportement retiré par la spec).
- Les tests du « rappuyer sur Carte annule » sont supprimés (comportement retiré).
- **Petit objet sans porteur** : l'ancien test « Il faut d'abord un bureau… » devient : le placement s'ouvre, ✓ est désactivé et le message contient « bureau ».

Lancer : `npm run test:famille -- scene-piece scene-lumiere`
Attendu : tout passe, sauf `library-drag.test.tsx` (tâche 5). Noter ses échecs sans les corriger ici.

- [ ] **Étape 5 : commiter**

```bash
git add -A src tests
git commit -m "feat(bibliotheque): mode placement au toucher (fantôme, barre, ✗ annule, ✓ enregistre)"
```

---

### Tâche 5 : glisser le fantôme, et l'appui long mène au placement

**Fichiers :**
- Créer : `src/content/pointer-follow.ts` (le suivi du doigt extrait de l'ancien effet du glissé, avec le défilement aux bords)
- Modifier : `src/content/LibraryPanel.tsx`
- Réécrire : `tests/content/library-drag.test.tsx`

**Interfaces :**
- Utilise : la tâche 4 (`placement`, `showPlacement`, `startPlacementFor`), la tâche 1 (`movePlacement`, `spotAt`), la tâche 3 (`PlacementGrip`), et `pointerToCell` (furniture-drag).
- Fournit : `followPointer({ scroll, onMove, onEnd }): () => void`, qui renvoie la fonction d'arrêt.

- [ ] **Étape 1 : réécrire les tests du glissé**

Dans `tests/content/library-drag.test.tsx`, on garde l'en-tête, `withDesk` (avec `await confirm()` après la pose du bureau) et `longPress`. Les tests « déplacement par appui long » deviennent :

```tsx
const confirm = () => click('[data-action="place-confirm"]');

describe('appui long → placement', () => {
  it('appui long, glisser, relâcher : le fantôme attend ✓, puis le bureau est déplacé', async () => {
    await withDesk();
    await longPress('[data-furniture="desk"]', 95, 385);
    await pointer('pointermove', window, 365, 405);
    await pointer('pointerup', window, 365, 405);
    await settle();
    expect(layoutNow()[0]).toMatchObject({ col: 2, row: 11 });
    expect(q('[data-placement-bar]')).not.toBeNull();
    await confirm();
    expect(layoutNow()[0]).toMatchObject({ kind: 'desk', col: 12, row: 11 });
  });

  it('un bureau déplacé emmène son ordinateur', async () => {
    await withDesk();
    await click('[data-kind="computer"]');
    await confirm();
    await longPress('[data-furniture="desk"]', 95, 385);
    await pointer('pointerup', window, 365, 405);
    await settle();
    await confirm();
    expect(layoutNow().find((p) => p.kind === 'computer')).toMatchObject({ deskId: layoutNow()[0]!.id });
    expect(layoutNow()[0]).toMatchObject({ col: 12 });
  });

  it('lâcher hors de la pièce : placement ouvert en rouge, rien de déplacé', async () => {
    await withDesk();
    await longPress('[data-furniture="desk"]', 95, 385);
    await pointer('pointerup', window, 365, 265);
    await settle();
    expect((q('[data-action="place-confirm"]') as HTMLButtonElement).disabled).toBe(true);
    expect(q('[role="status"]')?.textContent).toContain('sol');
    await click('[data-action="place-cancel"]');
    expect(layoutNow()[0]).toMatchObject({ col: 2, row: 11 });
  });

  it('la poignée ✥ fait glisser le fantôme', async () => {
    await withDesk();
    await click('[data-furniture="desk"]');
    await click('[data-action="move"]');
    await pointer('pointerdown', q('[data-action="place-grip"]')!, 95, 385);
    await pointer('pointermove', window, 365, 405);
    await pointer('pointerup', window, 365, 405);
    await settle();
    await confirm();
    expect(layoutNow()[0]).toMatchObject({ col: 12 });
  });

  it('en mode Visiter, l’appui long ne fait rien', async () => {
    await withDesk();
    await click('[data-action="visit"]');
    await longPress('[data-furniture="desk"]', 95, 385);
    expect(q('[data-action="edit"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(q('[data-placement-bar]')).toBeNull();
  });
});
```

Les autres tests du fichier (petit objet glissé vers un autre bureau, cartes rangées…) suivent la même règle : on ajoute `await confirm()` après le `pointerup`. Les tests « Échap annule » et « pointercancel annule » deviennent : après Échap, `[data-placement-bar]` est absent et l'objet n'a pas bougé ; après `pointercancel`, le placement reste ouvert à la dernière position, et ✗ remet l'objet à sa place.

Lancer : `npx vitest run tests/content/library-drag.test.tsx`. Attendu : ÉCHEC.

- [ ] **Étape 2 : extraire `pointer-follow.ts`**

```ts
// Suit le doigt (ou la souris) jusqu'au relâcher : la page ne défile pas sous le doigt, et les bords de la pièce la font défiler.
const EDGE_ZONE = 40;
const EDGE_SPEED = 8;

export function followPointer({ scroll, onMove, onEnd }: { scroll: () => HTMLElement | null; onMove: (x: number, y: number) => void; onEnd: (x: number, y: number) => void }): () => void {
  let last = { x: 0, y: 0 };
  const move = (event: PointerEvent): void => {
    last = { x: event.clientX, y: event.clientY };
    onMove(last.x, last.y);
  };
  const up = (event: PointerEvent): void => {
    stop();
    onEnd(event.clientX, event.clientY);
  };
  const cancel = (): void => {
    stop();
    onEnd(last.x, last.y);
  };
  const touch = (event: TouchEvent): void => {
    if (event.cancelable) event.preventDefault();
  };
  let frame = 0;
  const tick = (): void => {
    const el = scroll();
    if (el) {
      const box = el.getBoundingClientRect();
      const step = last.x < box.left + EDGE_ZONE ? -EDGE_SPEED : last.x > box.right - EDGE_ZONE ? EDGE_SPEED : 0;
      if (step !== 0 && last.x !== 0) {
        const before = el.scrollLeft;
        el.scrollLeft = before + step;
        if (el.scrollLeft !== before) onMove(last.x, last.y);
      }
    }
    frame = window.requestAnimationFrame(tick);
  };
  frame = window.requestAnimationFrame(tick);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('touchmove', touch, { passive: false });
  function stop(): void {
    window.cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('touchmove', touch);
  }
  return stop;
}
```

Reprendre les valeurs `EDGE_ZONE` et `EDGE_SPEED` de `LibraryPanel.tsx` (et y supprimer les constantes devenues inutiles). Si leurs valeurs diffèrent de 40 et 8, garder celles de `LibraryPanel`.

- [ ] **Étape 3 : brancher dans `LibraryPanel.tsx`**

```ts
// Glissé du fantôme : chaque position du doigt déplace le fantôme ; au relâcher, le placement reste ouvert en attendant ✓.
const placementRef = useRef<Placement | null>(null);
placementRef.current = placement;
const stopFollow = useRef<(() => void) | null>(null);
useEffect(() => () => stopFollow.current?.(), []);
const spotOfPointer = (clientX: number, clientY: number) => {
  const svg = scrollRef.current?.querySelector('svg[role="img"]');
  if (!svg) return null;
  const { col, row, x, y } = pointerToCell(svg.getBoundingClientRect(), room.cols * CELL_W, HEIGHT, clientX, clientY);
  return { col, row, x, y };
};
const followPlacement = (): void => {
  stopFollow.current?.();
  const track = (clientX: number, clientY: number): void => {
    const current = placementRef.current;
    const spot = spotOfPointer(clientX, clientY);
    if (current && spot && (spot.col !== current.spot.col || spot.row !== current.spot.row || current.subject.type !== 'move' || current.base.find((p) => p.id === current.id)?.kind === 'stored')) {
      showPlacement(movePlacement(current, room.cols, spot));
    }
  };
  stopFollow.current = followPointer({
    scroll: () => scrollRef.current,
    onMove: track,
    onEnd: (x, y) => {
      track(x, y);
      stopFollow.current = null;
      window.setTimeout(press.consumeClick, 0);
    },
  });
};
```

- **Appui long** : `startDragRef.current = (id) => { setMode('edit'); startPlacementFor({ type: 'move', id }); followPlacement(); };`
- **Poignée** : rendre `<PlacementGrip stage={stage.ref.current} scroll={scrollRef.current} targetId={placingView(placement).id} onGrab={(event) => { event.preventDefault(); followPlacement(); }} />`, à côté de `PlacementBar`, seulement si `placingItem` existe (sinon l'objet n'est pas dessiné).
- Dans `reset()`, ajouter `stopFollow.current?.(); stopFollow.current = null;`.

Note : `showPlacement` lit `REASONS`, qui est stable. `room.cols` est lu au rendu courant, et pendant un placement le tiroir de la pièce est caché, donc `cols` ne change pas.

- [ ] **Étape 4 : faire passer les tests**

Lancer : `npx vitest run tests/content/library-drag.test.tsx tests/content/library-placement.test.tsx`, puis `npm run test:famille -- scene-piece scene-lumiere`.
Attendu : tout passe.

- [ ] **Étape 5 : commiter**

```bash
git add -A src tests
git commit -m "feat(bibliotheque): glisser le fantôme (poignée, appui long) en mode placement"
```

---

### Tâche 6 : interrupteur Visiter / Aménager en plein écran

**Fichiers :**
- Modifier : `src/content/LibraryPanel.tsx`
- Tester : `tests/content/library-sims-ui.test.tsx` (ajouter un `describe` avec le `stubFullscreen` repris de `library-outside.test.tsx`)

- [ ] **Étape 1 : test qui échoue**

```tsx
describe('interrupteur en plein écran', () => {
  it('n’existe qu’en plein écran et bascule entre Visiter et Aménager', async () => {
    stubFullscreen();
    expect(q('[data-mode-switch]')).toBeNull();
    await click('[data-action="fullscreen"]');
    const sw = q('[data-mode-switch]')!;
    expect(sw.querySelector('[data-action="visit"]')?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { (sw.querySelector('[data-action="edit"]') as HTMLElement).click(); });
    await settle();
    expect(q('[data-mode-switch] [data-action="edit"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(q('[data-drawer]')).not.toBeNull();
  });

  it('passer en 👁 pendant un placement l’annule sans rien enregistrer', async () => {
    stubFullscreen();
    await click('[data-action="fullscreen"]');
    await act(async () => { (q('[data-mode-switch] [data-action="edit"]') as HTMLElement).click(); });
    await settle();
    await click('[data-kind="shelf"]');
    await act(async () => { (q('[data-mode-switch] [data-action="visit"]') as HTMLElement).click(); });
    await settle();
    expect(q('[data-placement-bar]')).toBeNull();
    expect(repo.current()!.rooms[0]!.layout).toHaveLength(0);
  });
});
```

Copier `stubFullscreen` depuis `tests/content/library-outside.test.tsx` en tête du fichier, et ajouter `vi.unstubAllGlobals()` dans `afterEach` si on stubbe `matchMedia`. Si `[data-action="fullscreen"]` n'est pas le bouton de la barre du haut dans ce fichier, utiliser `q('.wmt-lib-topbar [data-action="fullscreen"]')`.

Lancer : `npx vitest run tests/content/library-sims-ui.test.tsx`. Attendu : ÉCHEC.

- [ ] **Étape 2 : implémenter**

Dans le rendu de `wmt-lib-stage`, à côté du bouton pour quitter le plein écran :

```tsx
{stage.active && (
  <div className="wmt-lib-switch" data-mode-switch role="group" aria-label="Mode">
    <button type="button" data-action="visit" aria-pressed={!editing} aria-label="Visiter" title="Visiter" onClick={() => setMode2('visit')}><Icon paths={ICONS.eye} /></button>
    <button type="button" data-action="edit" aria-pressed={editing} aria-label="Aménager" title="Aménager" onClick={() => setMode2('edit')}><Icon paths={ICONS.pencil} /></button>
  </div>
)}
```

`setMode2` appelle déjà `reset()`, ce qui abandonne le placement. Déplacer `FIT_BUTTON` à `right: 148` pour qu'il ne passe pas sous l'interrupteur.

Vérifier que les tests qui visent `[data-action="edit"]` hors plein écran visent encore la barre du haut. Hors plein écran, l'interrupteur n'est pas rendu, donc il n'y a pas d'ambiguïté.

- [ ] **Étape 3 : vérifier et commiter**

```bash
npm run test:famille -- scene-piece
git add src/content/LibraryPanel.tsx tests/content/library-sims-ui.test.tsx
git commit -m "feat(bibliotheque): interrupteur Visiter / Aménager en plein écran"
```

---

### Tâche 7 : habillage Sims (CSS), boutons ronds et paysage

**Fichiers :**
- Modifier : `src/content/LibraryPanel.tsx` (bloc `CSS`, `DOOR_BUTTON`, bouton pour quitter le plein écran, `STAGE_MESSAGE`)
- Modifier : `src/content/build-drawer.tsx` (structure des catégories en colonne, libellés des onglets, titre de catégorie)
- Tester : `tests/content/library-sims-ui.test.tsx`

- [ ] **Étape 1 : tests de structure qui échouent**

```tsx
describe('habillage Sims', () => {
  it('le tiroir range les catégories en colonne à gauche et nomme la catégorie', async () => {
    await click('[data-action="edit"]');
    expect(q('.wmt-lib-drawer-body .wmt-lib-cats [data-category="storage"]')).not.toBeNull();
    expect(q('.wmt-lib-cat-title')?.textContent).toBe('Rangement');
    expect(q('[data-drawer-tab="furniture"]')?.textContent).toContain('Meubles');
  });

  it('la feuille de style déclare les couleurs Sims', () => {
    expect(LIBRARY_CSS).toContain('--sims-panel');
    expect(LIBRARY_CSS).toContain('.wmt-lib-confirm');
    expect(LIBRARY_CSS).toContain('.wmt-lib-switch');
  });
});
```

(Vérifier que le libellé de la catégorie `storage` est bien « Rangement » avec `labelOf`/`catalogTree`. Sinon, utiliser le libellé réel.)

Lancer : `npx vitest run tests/content/library-sims-ui.test.tsx`. Attendu : ÉCHEC.

- [ ] **Étape 2 : structure du tiroir**

Dans `build-drawer.tsx`, panneau `furniture` :

```tsx
<div className="wmt-lib-drawer-panel" data-drawer-panel="furniture" hidden={tab !== 'furniture'}>
  <div className="wmt-lib-drawer-body">
    <div className="wmt-lib-cats" role="group" aria-label="Catégories de meubles">
      {tree.map((c) => (
        <Btn key={c.id} className="wmt-lib-cat" label={c.label} pressed={node.id === c.id} data={{ category: c.id }} onClick={() => onState({ ...state, category: c.id, sub: null })}>
          <Icon paths={CATEGORY_ICON[c.id]} />
        </Btn>
      ))}
    </div>
    <div className="wmt-lib-drawer-right">
      {node.subcategories.length > 0 ? (
        <div className="wmt-lib-chips wmt-lib-subchips" role="group" aria-label={`Sous-catégories : ${node.label}`}>
          {/* sous-catégories inchangées */}
        </div>
      ) : (
        <div className="wmt-lib-cat-title">{node.label}</div>
      )}
      <div className="wmt-lib-thumbs">{/* vignettes inchangées */}</div>
    </div>
  </div>
</div>
```

Les onglets affichent leur libellé : `<Icon paths={t.icon} /><span className="wmt-lib-tab-label">{t.label}</span>`.

- [ ] **Étape 3 : CSS**

Ajouter à la fin du bloc `CSS` de `LibraryPanel.tsx` (les nouvelles règles l'emportent sur les anciennes par l'ordre) :

```css
.wmt-lib-stage{--sims-panel:rgba(250,252,255,.94);--sims-line:#a9c6e8;--sims-blue:#2f7fd6;--sims-blue-dark:#1d5aa3;--sims-tile-top:#fff;--sims-tile-bot:#dce8f6;--sims-green:#4cc23a;--sims-red:#d23b2f;--sims-text:#2b3f5c;--sims-font:ui-rounded,'Nunito','Varela Round',system-ui,sans-serif}
.wmt-lib-drawer{left:6px;right:6px;bottom:6px;gap:6px;padding:0;background:transparent;border:0;box-shadow:none;font-family:var(--sims-font);font-weight:700;color:var(--sims-text)}
.wmt-lib-drawer-tabs{display:flex;align-items:center;gap:6px}
.wmt-lib-tabs-pill{display:flex;gap:2px;padding:3px;border-radius:18px;background:var(--sims-panel);border:2px solid var(--sims-line);box-shadow:0 2px 6px rgba(0,0,0,.3)}
.wmt-lib-tabs-pill [role="tab"]{min-height:30px;border:0;border-radius:14px;padding:0 10px;color:#5d7594;font-weight:800;font-size:12px}
.wmt-lib-tabs-pill [role="tab"][aria-selected="true"]{background:linear-gradient(#4a97e8,var(--sims-blue));color:#fff}
.wmt-lib-drawer-tabs [data-action="drawer-reduce"]{margin-left:auto;width:36px;height:36px;padding:0;border-radius:50%;background:var(--sims-panel);border:2px solid var(--sims-line);color:var(--sims-blue)}
.wmt-lib-drawer-panel{padding:6px;border-radius:14px;background:var(--sims-panel);border:2px solid var(--sims-line);box-shadow:0 4px 14px rgba(0,0,0,.35)}
.wmt-lib-drawer-body{display:flex;gap:6px}
.wmt-lib-cats{display:flex;flex-direction:column;gap:4px;padding-right:6px;border-right:2px solid #e1ebf7}
.wmt-lib-cat{width:40px;height:40px;min-width:40px;min-height:40px;padding:0;border-radius:10px;color:#6c86a8;background:linear-gradient(var(--sims-tile-top),#edf3fb);border:1.5px solid #d4e2f3}
.wmt-lib-cat[aria-pressed="true"]{color:#fff;background:linear-gradient(#4a97e8,var(--sims-blue));border-color:var(--sims-blue-dark)}
.wmt-lib-drawer-right{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.wmt-lib-cat-title{font-weight:800;font-size:13px;color:var(--sims-blue-dark)}
.wmt-lib-subchips .wmt-lib-chip{min-height:24px;padding:0 9px;font-size:11px;font-weight:700;color:#5d7594;background:#eef4fb;border:1.5px solid #d4e2f3}
.wmt-lib-subchips .wmt-lib-chip[aria-pressed="true"]{background:#fff;color:var(--sims-blue);border-color:var(--sims-blue)}
.wmt-lib-thumbs{display:grid;grid-auto-flow:column;grid-template-rows:repeat(2,64px);grid-auto-columns:60px;gap:6px;overflow-x:auto}
.wmt-lib-thumb{width:auto;height:auto;border-radius:9px;color:#4e6687;background:linear-gradient(var(--sims-tile-top),var(--sims-tile-bot));border:1.5px solid #c9dbf0;box-shadow:0 1px 2px rgba(40,70,110,.25)}
.wmt-lib-thumb-name{font-size:9.5px;font-weight:800}
.wmt-lib-drawer-panel .wmt-lib-btn:not(.wmt-lib-cat):not(.wmt-lib-thumb):not(.wmt-lib-chip){color:var(--sims-blue);border-color:var(--sims-line);background:#fff}
.wmt-lib-drawer-reduced{bottom:0}
.wmt-lib-drawer-reduced .wmt-lib-btn{width:96px;min-height:30px;background:var(--sims-panel);color:var(--sims-blue);border:2px solid var(--sims-line);border-bottom:0;border-radius:16px 16px 0 0;box-shadow:0 -2px 8px rgba(0,0,0,.3)}
.wmt-lib-bubble{gap:2px;padding:4px;border-radius:12px;background:var(--sims-panel);border:2px solid var(--sims-line);box-shadow:0 4px 10px rgba(0,0,0,.35);color:var(--sims-blue)}
.wmt-lib-bubble .wmt-lib-btn{min-width:34px;min-height:34px;padding:0;border:0;border-radius:9px;color:var(--sims-blue)}
.wmt-lib-bubble .wmt-lib-btn[aria-pressed="true"]{background:#e4effb}
.wmt-lib-bubble [data-action="remove"]{color:var(--sims-red)}
.wmt-lib-placebar{align-items:center;flex-wrap:nowrap}
.wmt-lib-placebar-sep{width:2px;height:26px;margin:0 3px;background:#dbe6f3}
.wmt-lib-bubble .wmt-lib-cancel{border-radius:50%;color:#fff;background:linear-gradient(#ef6a5f,var(--sims-red))}
.wmt-lib-bubble .wmt-lib-confirm{min-width:40px;min-height:40px;border-radius:50%;color:#fff;background:linear-gradient(#6fdc5c,#3ea92f);box-shadow:inset 0 -2px 0 rgba(0,0,0,.18)}
.wmt-lib-bubble .wmt-lib-confirm:disabled{opacity:1;background:#c9d3de;color:#eef2f6}
.wmt-lib-grip-box{position:absolute;z-index:6}
.wmt-lib-grip{width:32px;height:32px;padding:0;border-radius:50%;display:grid;place-items:center;cursor:grab;background:var(--sims-panel);border:2px solid var(--sims-line);color:var(--sims-blue);box-shadow:0 2px 5px rgba(0,0,0,.3)}
.wmt-lib-fab{position:absolute;top:8px;z-index:7;width:38px;height:38px;padding:0;border-radius:50%;display:grid;place-items:center;cursor:pointer;background:var(--sims-panel);border:2px solid var(--sims-line);color:var(--sims-blue);box-shadow:0 2px 6px rgba(0,0,0,.35)}
.wmt-lib-switch{position:absolute;top:8px;right:54px;z-index:7;display:flex;gap:2px;padding:3px;border-radius:19px;background:var(--sims-panel);border:2px solid var(--sims-line);box-shadow:0 2px 6px rgba(0,0,0,.35)}
.wmt-lib-switch button{width:34px;height:28px;padding:0;border:0;border-radius:14px;display:grid;place-items:center;cursor:pointer;background:transparent;color:#7d93b0}
.wmt-lib-switch button[aria-pressed="true"]{background:linear-gradient(#4a97e8,var(--sims-blue));color:#fff}
.wmt-lib-stage-msg{position:absolute;top:56px;left:50%;transform:translateX(-50%);z-index:7;max-width:80%;padding:6px 12px;border-radius:14px;font:800 12px/16px var(--sims-font);color:var(--sims-text);background:var(--sims-panel);border:2px solid var(--sims-line);box-shadow:0 2px 6px rgba(0,0,0,.3)}
@media (orientation:landscape){.wmt-lib-stage:fullscreen .wmt-lib-drawer:not(.wmt-lib-drawer-reduced){left:auto;width:min(470px,70%)}.wmt-lib-stage:fullscreen .wmt-lib-thumbs{grid-template-rows:58px}.wmt-lib-stage:fullscreen .wmt-lib-cats{display:grid;grid-template-columns:repeat(2,30px);align-content:start;gap:3px}.wmt-lib-stage:fullscreen .wmt-lib-cat{width:30px;height:30px;min-width:30px;min-height:30px}}
```

Dans `build-drawer.tsx`, envelopper les trois onglets dans `<span className="wmt-lib-tabs-pill">…</span>` (le `role="tablist"` reste sur `.wmt-lib-drawer-tabs`). Le bouton de réduction reste hors de la pilule : c'est un rond séparé, à droite (`margin-left:auto`).

- [ ] **Étape 4 : boutons ronds et message**

- La porte : remplacer `style={DOOR_BUTTON}` par `className="wmt-lib-fab" style={{ left: 8 }}` et supprimer `DOOR_BUTTON`.
- Quitter le plein écran : remplacer `<FullscreenButton active onClick={stage.toggle} right={8} />` par :
  ```tsx
  <button type="button" className="wmt-lib-fab" style={{ right: 8 }} data-action="exit-fullscreen" aria-label="Quitter le plein écran" title="Quitter le plein écran" onClick={stage.toggle}><Icon paths={ICONS.fullscreen} /></button>
  ```
  Retirer `FullscreenButton` de l'import si ce n'est plus utilisé.
- Le message en plein écran : `<div aria-live="polite" className="wmt-lib-stage-msg">{message}</div>` à la place de `style={STAGE_MESSAGE}`, et supprimer `STAGE_MESSAGE`.

Chercher dans les tests les usages de « Quitter le plein écran » (`grep -rn "Quitter le plein écran" tests`) et vérifier qu'ils trouvent encore le bouton (même `aria-label`).

- [ ] **Étape 5 : tests, capture au banc, commit**

Lancer : `npm run test:famille -- scene-piece`. Attendu : tout passe.

Lancer l'extension en développement, ouvrir Ma Pièce dans le navigateur intégré à 375×812 puis en paysage, et faire des captures de : Visiter en plein écran, Aménager tiroir ouvert, placement valide, placement refusé, tiroir réduit. Les comparer à la maquette ; corriger les écarts visibles (espacements, tailles) dans le CSS.

```bash
git add src/content/LibraryPanel.tsx src/content/build-drawer.tsx tests/content/library-sims-ui.test.tsx
git commit -m "feat(bibliotheque): habillage façon Sims du tiroir, de la bulle, de la barre de placement et des boutons du plein écran"
```

---

### Tâche 8 : fiche WikiHow `bibliotheque-v28`

**Fichiers :**
- Modifier : `src/core/whats-new/entries.ts` (nouvelle entrée après `bibliotheque-v27`)
- Tester : `tests/core/whats-new/entries.test.ts`

- [ ] **Étape 1 : test qui échoue**

```ts
it('la fiche bibliotheque-v28 présente l’interrupteur, le mode placement, ✓ / ✗ et leurs limites', () => {
  const entry = ENTRIES.find((e) => e.id === 'bibliotheque-v28');
  expect(entry).toBeDefined();
  const text = JSON.stringify(entry);
  for (const word of ['plein écran', 'fantôme', 'Valider', 'Annuler', 'Déplacer', 'appui long']) expect(text).toContain(word);
  expect(entry!.steps.every((s) => s.details?.some((d) => d.label === 'Limites'))).toBe(true);
  expect(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v28')).toBeGreaterThan(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v27'));
});
```

Lancer : `npx vitest run tests/core/whats-new/entries.test.ts`. Attendu : ÉCHEC.

- [ ] **Étape 2 : écrire l'entrée**

```ts
  {
    id: 'bibliotheque-v28',
    theme: 'collection',
    glyph: '✏️',
    title: 'Placer un meuble comme dans les Sims',
    summary: 'Un interrupteur en plein écran, un objet fantôme à ajuster, puis Valider ou Annuler',
    steps: [
      {
        target: '[data-wmt-library-entry]',
        gesture: 'tap',
        title: 'L’interrupteur en plein écran',
        text: 'En plein écran, Ma Pièce affiche en haut à droite un interrupteur œil | crayon : l’œil pour Visiter, le crayon pour Aménager. Le tiroir de construction s’ouvre en bas dès qu’on passe au crayon.',
        details: [
          { label: 'À quoi ça sert', text: 'À meubler sa pièce sans quitter le plein écran, où la barre du haut n’est pas affichée.' },
          { label: 'Comment faire', text: 'Ouvrez Ma Pièce, touchez le bouton plein écran, puis la moitié crayon de l’interrupteur. Touchez l’œil pour revenir à la visite.' },
          { label: 'Limites', text: 'Hors plein écran, ce sont les boutons Visiter et Aménager de la barre du haut qui servent. Repasser à l’œil pendant un placement l’annule.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
      {
        target: '[data-wmt-library-entry]',
        title: 'Le mode placement',
        text: 'Touchez une vignette du tiroir : le tiroir s’efface et l’objet apparaît en fantôme à la première place libre, au milieu de ce que vous voyez. Son empreinte au sol est verte si l’endroit convient, rouge sinon, avec la raison en haut.',
        details: [
          { label: 'À quoi ça sert', text: 'À voir l’objet en place et à l’ajuster avant de le poser, comme dans le mode Achat des Sims.' },
          { label: 'Comment faire', text: 'Faites glisser la poignée au centre de l’objet, ou touchez l’endroit voulu (une case, un bureau, une étagère, un ordinateur). La barre au-dessus de l’objet propose ses réglages : Avancer et Reculer, allumer la lampe, la taille de la fenêtre.' },
          { label: 'Comment ça marche', text: 'Les règles sont celles d’avant : un meuble au sol, un cadre au mur, un ordinateur sur un bureau. Rien n’est enregistré tant que vous n’avez pas validé.' },
          { label: 'Limites', text: 'Pas de rotation. Un petit objet ou un ordinateur sans bureau ni étagère libre reste rouge : posez d’abord un meuble porteur.' },
        ],
        scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library-entry]'] },
      },
      {
        target: '[data-wmt-library-entry]',
        title: 'Valider ou Annuler, et Déplacer',
        text: 'La coche verte (Valider) pose l’objet et rouvre le tiroir là où vous l’aviez laissé. La croix rouge (Annuler) renonce : rien ne change. « Déplacer » dans la bulle d’un objet posé, ou un appui long sur lui, ouvre le même mode placement.',
        details: [
          { label: 'À quoi ça sert', text: 'À ne jamais poser ou déplacer un objet par erreur.' },
          { label: 'Comment faire', text: 'Ajustez l’objet, puis touchez la coche. Pour un déplacement, la croix remet l’objet à sa place. Échap annule aussi sur ordinateur.' },
          { label: 'Limites', text: 'La coche est grisée tant que l’endroit est refusé. Changer de pièce, sortir dans la rue ou repasser en Visiter annule le placement en cours.' },
        ],
        scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library-entry]'] },
      },
    ],
  },
```

- [ ] **Étape 3 : vérifier et commiter**

```bash
npx vitest run tests/core/whats-new
git add src/core/whats-new/entries.ts tests/core/whats-new/entries.test.ts
git commit -m "feat(bibliotheque): fiche WikiHow Placer un meuble comme dans les Sims"
```

---

### Tâche 9 : vérification finale et livraison

- [ ] **Étape 1 : familles touchées + types + build**

```bash
npm run test:famille -- scene-piece scene-lumiere
npx vitest run tests/core/whats-new tests/content/fullscreen.test.tsx
npx tsc --noEmit
npm run build
```

Attendu : tout passe et le build réussit. En cas d'échec, corriger avant d'aller plus loin.

- [ ] **Étape 2 : capture de validation**

Sur le vrai téléphone (S26 Ultra, APK pré-prod, après fusion et `npm run preprod`), puis sur l'extension : faire les captures de ①, ②, ⑥, ⑦ et ⑤ (paysage), et les montrer à l'utilisateur.

- [ ] **Étape 3 : PR, fusion, pré-prod**

Pousser `feat/sims-placement`, ouvrir la PR vers `main` (avec la description et la ligne « 🤖 Generated with [Claude Code](https://claude.com/claude-code) »), la fusionner, puis `npm run preprod` (sans demander, selon la règle du projet). Pas de production sans ordre explicite.
