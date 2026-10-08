# Bibliothèque morceau 5a — fenêtre, six scènes, heure — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à la Bibliothèque une fenêtre de taille réglable ouverte sur un décor continu (ville, campagne, montagne, mer, espace, Terre), avec heure globale, soleil/lune calculés localement, lumières et passants qui suivent l'heure.

**Architecture:** Logique pure dans `src/core/library/` (grille, état v3, ciel, activité, géométrie du monde), rendu SVG dans `src/content/`. Le décor est un `<g>` unique dans `<defs>` ; chaque fenêtre est un `clipPath` qui l'affiche avec `<use>`, ce qui garantit la continuité entre fenêtres. Les éléments mobiles sont positionnés dans ce repère monde par une horloge murale unique (`Date.now()`), mise à jour par un `requestAnimationFrame` sans re-rendu React.

**Tech Stack:** TypeScript, React 18 (SVG), zod, vitest (+ jsdom), WXT.

**Spec:** `docs/superpowers/specs/2026-10-08-bibliotheque-fenetre-design.md`

## Global Constraints

- Branche `feat/bibliotheque-fenetre`, worktree `C:\Users\maxim\Downloads\Wikimasters-bibliotheque` (jonction `node_modules` déjà en place). Toujours `git branch --show-current` avant chaque commit.
- Exécuter les tests avec `npx vitest run --maxWorkers=4` (le test `library-drag.test.tsx` est instable en parallélisme total).
- Fenêtre : `w` de 3 à 12, `h` de 3 à 10, défaut 6×5 ; mur = 12 lignes (`WALL_ROWS`), cellule 30 × 28,33 px (`CELL_W`, `CELL_H`), pièce de 24 à 96 colonnes.
- État `LibraryState.version` passe à `3` ; `Room.scene` défaut `'city'` ; `LibraryState.time` défaut `{ mode: 'real' }`.
- Position : géolocalisation seulement après un choix explicite de « Heure réelle » ; repli fuseau (`lon = décalage_minutes / 4`, `lat = 45`) ; rien n'est envoyé ni stocké.
- Une horloge par pièce, ~30 images/s, suspendue si l'onglet est caché ; mouvement réduit (`prefers-reduced-motion`) = décor figé à l'heure courante.
- Tout bouton est un glyphe avec `aria-label`/`title` (mémoire projet : glyphes au lieu de texte). Les textes sont en français, sans tutoiement.
- Chaque `feat` met à jour la fiche WikiHow (`src/core/whats-new/entries.ts`) dans la même PR : nouvel id `bibliotheque-v7`.
- Commits : message en français `type(bibliotheque): …`, terminé par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File Structure

| Fichier | Rôle |
|---|---|
| `src/core/library/library-types.ts` (modif) | `SceneId`, `TimeSetting`, `Placed` fenêtre, `Room.scene`, `LibraryState` v3 |
| `src/core/library/furniture-catalog.ts` (modif) | type `window` : libellé, catégorie Déco, tailles min/max/défaut |
| `src/core/library/room-grid.ts` (modif) | `rectOf` fenêtre, `canHangRect`, `placeWindow`, `moveWindow`, `resizeWindow`, `shiftLayout` |
| `src/core/library/library-book.ts` (modif) | schéma v3, migration, `setRoomScene`, `setTimeSetting` |
| `src/core/library/sky.ts` (nouveau) | `sunTimes`, `skyAt`, `positionFromTimezone`, `mixHex` |
| `src/core/library/activity.ts` (nouveau) | `activityAt`, `lampLit`, `actorActive` |
| `src/core/library/time-setting.ts` (nouveau) | `minutesFor`, `formatMinutes` |
| `src/core/library/scene-world.ts` (nouveau) | rng à graine, bâtiments, acteurs, `actorX`, `actorsFor` |
| `src/content/scene-position.ts` (nouveau) | position de l'appareil (géolocalisation + repli fuseau) |
| `src/content/use-scene-time.ts` (nouveau) | hook : minute courante + ciel |
| `src/content/scene-panorama.tsx` (nouveau) | décor : ciel, astres, acteurs, boucle d'animation |
| `src/content/scene-city.tsx`, `scene-nature.tsx`, `scene-space.tsx` (nouveaux) | dessin des six scènes |
| `src/content/window-art.tsx` (nouveau) | cadre de la fenêtre (vitre, croisillons, Steampunk) |
| `src/content/RoomView.tsx` (modif) | affiche les fenêtres et le décor |
| `src/content/furniture-drag.ts` (modif) | cible de dépôt d'une fenêtre |
| `src/content/furniture-icons.ts` (modif) | glyphe de la fenêtre |
| `src/content/LibraryPanel.tsx` (modif) | pose, déplacement, redimensionnement, panneau « Ciel » |
| `src/core/whats-new/entries.ts` (modif) | fiche `bibliotheque-v7` |

---

### Task 1: Modèle de la fenêtre dans la grille

**Files:**
- Modify: `src/core/library/library-types.ts`, `src/core/library/furniture-catalog.ts`, `src/core/library/room-grid.ts`, `src/content/furniture-icons.ts`
- Test: `tests/core/library/room-grid-window.test.ts` (nouveau)

**Interfaces:**
- Produces (room-grid.ts): `canHangRect(layout: Layout, cols: number, w: number, h: number, col: number, row: number, ignoreId?: string): PlaceResult`, `placeWindow(layout, cols, col, row, id): Layout | null` (6×5 au coin haut-gauche `(col,row)`), `moveWindow(layout, cols, id, col, row): Layout | null`, `windowFit(layout, cols, id, w, h): PlaceResult`, `resizeWindow(layout, cols, id, w, h): Layout | null`.
- Produces (furniture-catalog.ts): `WINDOW_MIN = { w: 3, h: 3 }`, `WINDOW_MAX = { w: 12, h: 10 }`, `WINDOW_DEFAULT = { w: 6, h: 5 }`.
- Produces (library-types.ts): `FurnitureKind` inclut `'window'` ; `Placed` inclut `{ id: string; kind: 'window'; col: number; row: number; w: number; h: number }`.

- [ ] **Step 1: Écrire les tests qui échouent**

`tests/core/library/room-grid-window.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { Layout } from '../../../src/core/library/library-types';
import { WINDOW_DEFAULT, WINDOW_MAX, WINDOW_MIN, labelOf } from '../../../src/core/library/furniture-catalog';
import { moveWindow, placeWindow, rectOf, resizeWindow, shiftLayout, windowFit } from '../../../src/core/library/room-grid';

const COLS = 24;
const win = (over: Partial<Extract<Layout[number], { kind: 'window' }>> = {}): Layout[number] => ({ id: 'w1', kind: 'window', col: 2, row: 1, w: 6, h: 5, ...over });

describe('fenêtre dans la grille', () => {
  it('a un libellé et des bornes de taille', () => {
    expect(labelOf('window')).toBe('Fenêtre');
    expect(WINDOW_MIN).toEqual({ w: 3, h: 3 });
    expect(WINDOW_MAX).toEqual({ w: 12, h: 10 });
    expect(WINDOW_DEFAULT).toEqual({ w: 6, h: 5 });
  });

  it('se pose en 6×5 sur le mur', () => {
    const layout = placeWindow([], COLS, 2, 1, 'f1');
    expect(layout).toEqual([{ id: 'f1', kind: 'window', col: 2, row: 1, w: 6, h: 5 }]);
    expect(rectOf(layout![0]!)).toEqual({ col: 2, row: 1, w: 6, h: 5 });
  });

  it('refuse un chevauchement, le sol et le bord', () => {
    const base = [win()];
    expect(placeWindow(base, COLS, 4, 2, 'f2')).toBeNull();
    expect(placeWindow([], COLS, 2, 9, 'f2')).toBeNull();
    expect(placeWindow([], COLS, 20, 1, 'f2')).toBeNull();
  });

  it('se déplace sans se bloquer lui-même', () => {
    expect(moveWindow([win()], COLS, 'w1', 3, 1)).toEqual([win({ col: 3 })]);
    expect(moveWindow([win(), win({ id: 'w2', col: 12 })], COLS, 'w1', 10, 1)).toBeNull();
  });

  it('se redimensionne dans les bornes', () => {
    expect(resizeWindow([win()], COLS, 'w1', 7, 5)).toEqual([win({ w: 7 })]);
    expect(resizeWindow([win()], COLS, 'w1', 2, 5)).toBeNull();
    expect(resizeWindow([win()], COLS, 'w1', 13, 5)).toBeNull();
    expect(resizeWindow([win()], COLS, 'w1', 6, 11)).toBeNull();
  });

  it('refuse un agrandissement qui chevauche un autre objet et signale les cases', () => {
    const layout = [win(), win({ id: 'w2', col: 8, row: 1, w: 3, h: 3 })];
    const check = windowFit(layout, COLS, 'w1', 7, 5);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.cells.length).toBeGreaterThan(0);
    expect(resizeWindow(layout, COLS, 'w1', 7, 5)).toBeNull();
    expect(resizeWindow(layout, COLS, 'w1', 5, 5)).not.toBeNull();
  });

  it('refuse un agrandissement qui sort du mur', () => {
    expect(resizeWindow([win({ row: 4 })], COLS, 'w1', 6, 9)).toBeNull();
  });

  it('suit le décalage de la pièce', () => {
    expect(shiftLayout([win()], 12)).toEqual([win({ col: 14 })]);
  });
});
```

- [ ] **Step 2: Lancer pour voir l'échec**

Run: `npx vitest run tests/core/library/room-grid-window.test.ts`
Expected: FAIL (import `placeWindow` etc. introuvable ; `labelOf('window')` indéfini).

- [ ] **Step 3: Types et catalogue**

`library-types.ts` : remplacer `export type FurnitureKind = StandingKind | 'computer' | SmallKind;` par
`export type FurnitureKind = StandingKind | 'computer' | 'window' | SmallKind;` et ajouter dans l'union `Placed` (après la ligne `wall`) :

```ts
  | { id: string; kind: 'window'; col: number; row: number; w: number; h: number }
```

`furniture-catalog.ts` : dans `LABELS` ajouter `window: 'Fenêtre',` ; dans `CATEGORIES`, la ligne `deco` devient
`kinds: ['coffee-table', 'plant', 'lamp', 'small-plant', 'small-lamp', 'rug', 'window']` ; après `wallSizeOf` ajouter :

```ts
export const WINDOW_MIN = { w: 3, h: 3 } as const;
export const WINDOW_MAX = { w: 12, h: 10 } as const;
export const WINDOW_DEFAULT = { w: 6, h: 5 } as const;
```

`furniture-icons.ts` : dans `KIND_ICON` ajouter `window: ['M4 3h16v18H4z', 'M12 3v18', 'M4 12h16'],`.

- [ ] **Step 4: Grille**

`room-grid.ts` :
1. Importer `WINDOW_DEFAULT, WINDOW_MAX, WINDOW_MIN` depuis `./furniture-catalog`.
2. Dans `rectOf`, avant le `return null` final : `if (p.kind === 'window') return { col: p.col, row: p.row, w: p.w, h: p.h };`
3. Remplacer le corps de `canHang` par une généralisation :

```ts
export function canHangRect(layout: Layout, cols: number, w: number, h: number, col: number, row: number, ignoreId?: string): PlaceResult {
  const cells = cellsOf({ col, row, w, h });
  const inRoom = inRoomCell(cols);
  if (cells.some((c) => !inRoom(c))) return { ok: false, reason: 'bounds', cells: cells.filter(inRoom) };
  if (row + h > WALL_ROWS) return { ok: false, reason: 'wall', cells: cells.filter((c) => c.row >= WALL_ROWS) };
  const taken = takenKeys(layout, ignoreId);
  const clash = cells.filter((c) => taken.has(`${c.col}-${c.row}`));
  return clash.length > 0 ? { ok: false, reason: 'taken', cells: clash } : { ok: true };
}

// Un objet accroché doit tenir entièrement sur le mur et sur des cases libres (derrière une étagère, c'est pris).
export function canHang(layout: Layout, cols: number, shape: WallShape, col: number, row: number, ignoreId?: string): PlaceResult {
  const { w, h } = wallSizeOf(shape);
  return canHangRect(layout, cols, w, h, col, row, ignoreId);
}
```

4. Ajouter après `moveHung` :

```ts
export function placeWindow(layout: Layout, cols: number, col: number, row: number, id: string): Layout | null {
  const { w, h } = WINDOW_DEFAULT;
  if (!canHangRect(layout, cols, w, h, col, row).ok) return null;
  return [...layout, { id, kind: 'window', col, row, w, h }];
}

export function moveWindow(layout: Layout, cols: number, id: string, col: number, row: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'window' || !canHangRect(layout, cols, item.w, item.h, col, row, id).ok) return null;
  return layout.map((p) => (p.id === id ? { ...item, col, row } : p));
}

// La fenêtre garde son coin haut-gauche ; la taille doit rester dans les bornes, sur le mur et sur des cases libres.
export function windowFit(layout: Layout, cols: number, id: string, w: number, h: number): PlaceResult {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'window') return { ok: false, reason: 'bounds', cells: [] };
  const inRange = Number.isInteger(w) && Number.isInteger(h) && w >= WINDOW_MIN.w && w <= WINDOW_MAX.w && h >= WINDOW_MIN.h && h <= WINDOW_MAX.h;
  if (!inRange) return { ok: false, reason: 'bounds', cells: [] };
  return canHangRect(layout, cols, w, h, item.col, item.row, id);
}

export function resizeWindow(layout: Layout, cols: number, id: string, w: number, h: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'window' || !windowFit(layout, cols, id, w, h).ok) return null;
  return layout.map((p) => (p.id === id ? { ...item, w, h } : p));
}
```

5. Dans `shiftLayout`, remplacer `p.kind === 'wall' ? ...` par `p.kind === 'wall' || p.kind === 'window' ? { ...p, col: p.col + delta } : p`.

- [ ] **Step 5: Lancer les tests**

Run: `npx vitest run tests/core/library --maxWorkers=4` puis `npx tsc --noEmit`
Expected: PASS. Si `tsc` signale un `Record<FurnitureKind, …>` incomplet, ajouter l'entrée `window` (c'est `KIND_ICON` et `LABELS`, déjà couverts). Si un test existant liste la catégorie `deco` sans `window`, mettre à jour la liste attendue.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add src/core/library src/content/furniture-icons.ts tests/core/library/room-grid-window.test.ts
git commit -m "feat(bibliotheque): fenêtre de taille réglable dans la grille" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: État v3 — scène par pièce, heure globale, fenêtres validées

**Files:**
- Modify: `src/core/library/library-types.ts`, `src/core/library/library-book.ts`
- Test: `tests/core/library/library-scene.test.ts` (nouveau) ; mettre à jour `tests/core/library/library-migration.test.ts`, `tests/core/library/library-book.test.ts`, `tests/core/library/room-grid-small.test.ts` (ligne `version: 2`) selon les échecs.

**Interfaces:**
- Produces (library-types.ts):
  ```ts
  export const SCENE_IDS = ['city', 'countryside', 'mountain', 'sea', 'space', 'earth'] as const;
  export type SceneId = (typeof SCENE_IDS)[number];
  export type TimeSetting = { mode: 'real' } | { mode: 'day' } | { mode: 'night' } | { mode: 'manual'; minutes: number };
  ```
  `Room.scene: SceneId` ; `LibraryState = { version: 3; activeRoomId; homeRoomId; time: TimeSetting; rooms }`.
- Produces (library-book.ts): `setRoomScene(state, id, scene): LibraryState`, `setTimeSetting(state, time): LibraryState`.

- [ ] **Step 1: Tests qui échouent** — `tests/core/library/library-scene.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { activeRoom, createInitialState, parseLibraryState, setRoomScene, setTimeSetting, updateLayout } from '../../../src/core/library/library-book';

describe('scène et heure', () => {
  it('démarre en ville, heure réelle, version 3', () => {
    const state = createInitialState();
    expect(state.version).toBe(3);
    expect(state.time).toEqual({ mode: 'real' });
    expect(activeRoom(state).scene).toBe('city');
  });

  it('change la scène d’une pièce seulement', () => {
    const state = setRoomScene(createInitialState(), 'r1', 'sea');
    expect(activeRoom(state).scene).toBe('sea');
    expect(setRoomScene(state, 'zz', 'space')).toBe(state);
  });

  it('règle l’heure globale et borne la minute manuelle', () => {
    expect(setTimeSetting(createInitialState(), { mode: 'night' }).time).toEqual({ mode: 'night' });
    expect(setTimeSetting(createInitialState(), { mode: 'manual', minutes: 1500 }).time).toEqual({ mode: 'manual', minutes: 1439 });
    expect(setTimeSetting(createInitialState(), { mode: 'manual', minutes: -4 }).time).toEqual({ mode: 'manual', minutes: 0 });
  });

  it('migre un état v2 : ville et heure réelle', () => {
    const v2 = { version: 2, activeRoomId: 'r1', homeRoomId: null, rooms: [{ id: 'r1', name: 'Salon', style: 'neon', orientation: 'landscape', cols: 24, layout: [{ id: 'f1', kind: 'chair', col: 3, row: 15 }] }] };
    const state = parseLibraryState(v2);
    expect(state.version).toBe(3);
    expect(state.time).toEqual({ mode: 'real' });
    expect(activeRoom(state).scene).toBe('city');
    expect(activeRoom(state).name).toBe('Salon');
    expect(activeRoom(state).layout).toHaveLength(1);
  });

  it('migre un état v1 jusqu’à la v3', () => {
    const v1 = { version: 1, activeRoomId: 'r1', homeRoomId: null, rooms: [{ id: 'r1', name: 'P', style: 'scandinave', orientation: 'landscape', cols: 24, layout: [{ id: 'f1', kind: 'chair', col: 1, row: 8 }] }] };
    const state = parseLibraryState(v1);
    expect(state.version).toBe(3);
    expect(activeRoom(state).layout[0]).toMatchObject({ row: 11 });
  });

  it('lit une fenêtre valide et écarte une fenêtre hors bornes', () => {
    const base = updateLayout(createInitialState(), 'r1', () => [
      { id: 'f1', kind: 'window', col: 2, row: 1, w: 6, h: 5 },
      { id: 'f2', kind: 'window', col: 12, row: 1, w: 2, h: 5 },
    ]);
    const parsed = parseLibraryState(JSON.parse(JSON.stringify(base)));
    expect(activeRoom(parsed).layout.map((p) => p.id)).toEqual(['f1']);
  });

  it('une scène inconnue redonne un état initial', () => {
    const bad = { ...createInitialState(), rooms: [{ ...activeRoom(createInitialState()), scene: 'lune' }] };
    expect(parseLibraryState(JSON.parse(JSON.stringify(bad)))).toEqual(createInitialState());
  });
});
```

- [ ] **Step 2: Lancer** — `npx vitest run tests/core/library/library-scene.test.ts` → FAIL.

- [ ] **Step 3: Types** — dans `library-types.ts` ajouter `SCENE_IDS`, `SceneId`, `TimeSetting` (code ci-dessus) ; `Room` gagne `scene: SceneId;` ; `LibraryState` devient :

```ts
export type LibraryState = {
  version: 3;
  activeRoomId: string;
  homeRoomId: string | null;
  // Heure globale de la Bibliothèque (toutes les pièces).
  time: TimeSetting;
  rooms: Room[];
};
```

- [ ] **Step 4: Schéma, migration, fonctions** — dans `library-book.ts` :

1. Importer `SCENE_IDS, WINDOW_MAX, WINDOW_MIN`(le second depuis `./furniture-catalog`, déjà importé pour `STEAMPUNK_ONLY`) et `type SceneId, type TimeSetting`.
2. Dans `placedSchema` ajouter, après l'objet `wall` :
```ts
  z.object({
    id: z.string(),
    kind: z.literal('window'),
    col: z.number().int(),
    row: z.number().int(),
    w: z.number().int().min(WINDOW_MIN.w).max(WINDOW_MAX.w),
    h: z.number().int().min(WINDOW_MIN.h).max(WINDOW_MAX.h),
  }),
```
Attention : `z.union` essaie les schémas dans l'ordre ; l'objet `standing` (kind enum) n'accepte pas `'window'`, donc pas d'ambiguïté. Une fenêtre hors bornes fait échouer toute la lecture (`safeParse`) → pour écarter seulement la fenêtre fautive, filtrer avant : voir le point 6.
3. `roomSchema` gagne `scene: z.enum(SCENE_IDS),`.
4. `stateSchema` : `version: z.literal(3)`, ajouter
```ts
  time: z.union([
    z.object({ mode: z.literal('real') }),
    z.object({ mode: z.literal('day') }),
    z.object({ mode: z.literal('night') }),
    z.object({ mode: z.literal('manual'), minutes: z.number().int().min(0).max(1439) }),
  ]),
```
5. `makeRoom` : ajouter un paramètre `scene: SceneId = 'city'` après `style` et `scene` dans l'objet ; `createInitialState` → `{ version: 3, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, rooms: [...] }` ; dans `addRoom` passer `current.scene`.
6. `migrate` : enchaîner v1 → v2 → v3. Remplacer la fonction par :

```ts
function migrateV1(raw: unknown): unknown { /* corps actuel de migrate, inchangé, avec le test version === 1 */ }

// La v3 ajoute la scène de chaque pièce (ville) et l'heure globale (réelle).
function migrateV2(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 2) return raw;
  const state = raw as { rooms?: unknown };
  const rooms = Array.isArray(state.rooms) ? state.rooms.map((room: unknown) => (typeof room === 'object' && room !== null ? { ...room, scene: 'city' } : room)) : state.rooms;
  return { ...state, version: 3, time: { mode: 'real' }, rooms };
}

const migrate = (raw: unknown): unknown => migrateV2(migrateV1(raw));
```
(renommer l'ancienne `migrate` en `migrateV1` sans toucher à son corps.)
Pour qu'une fenêtre hors bornes soit écartée sans tout perdre, ajouter avant `stateSchema.safeParse` dans `parseLibraryState` une étape `dropBadWindows(migrate(raw))` :

```ts
// Une fenêtre aux dimensions impossibles est ignorée sans faire perdre la pièce.
function dropBadWindows(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { rooms?: unknown }).rooms)) return raw;
  const ok = (p: unknown): boolean => {
    if (typeof p !== 'object' || p === null || (p as { kind?: unknown }).kind !== 'window') return true;
    const { w, h } = p as { w?: unknown; h?: unknown };
    return typeof w === 'number' && typeof h === 'number' && w >= WINDOW_MIN.w && w <= WINDOW_MAX.w && h >= WINDOW_MIN.h && h <= WINDOW_MAX.h;
  };
  const rooms = (raw as { rooms: unknown[] }).rooms.map((room) =>
    typeof room === 'object' && room !== null && Array.isArray((room as { layout?: unknown }).layout) ? { ...room, layout: (room as { layout: unknown[] }).layout.filter(ok) } : room,
  );
  return { ...(raw as object), rooms };
}
```
et `const parsed = stateSchema.safeParse(dropBadWindows(migrate(raw)));`.
7. Ajouter :

```ts
export function setRoomScene(state: LibraryState, id: string, scene: SceneId): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === id);
  if (!room || room.scene === scene) return state;
  return mapRoom(state, id, (r) => ({ ...r, scene }));
}

export function setTimeSetting(state: LibraryState, time: TimeSetting): LibraryState {
  if (time.mode !== 'manual') return { ...state, time };
  return { ...state, time: { mode: 'manual', minutes: Math.min(1439, Math.max(0, Math.round(time.minutes))) } };
}
```

- [ ] **Step 5: Mettre à jour les tests existants** — `npx vitest run tests/core/library --maxWorkers=4` : corriger les attentes `version: 2`/état initial dans `library-migration.test.ts`, `library-book.test.ts` (ligne 151 : `parseLibraryState({ version: 2 })` reste valide, c'est un état invalide), `room-grid-small.test.ts` (ligne 106 : `version: 3` et ajouter `time`/`scene` dans le littéral). Tout test qui construit un `Room` à la main doit recevoir `scene: 'city'`. Puis `npx tsc --noEmit` doit être propre.

- [ ] **Step 6: Lancer** — `npx vitest run tests/core tests/content --maxWorkers=4` → PASS.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add src/core/library tests/core/library
git commit -m "feat(bibliotheque): état v3 (scène par pièce, heure globale, fenêtres validées)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ciel — soleil, lune, lever et coucher

**Files:**
- Create: `src/core/library/sky.ts`, `src/core/library/time-setting.ts`
- Test: `tests/core/library/sky.test.ts`, `tests/core/library/time-setting.test.ts`

**Interfaces:**
- Produces (sky.ts):
  ```ts
  export type Position = { lat: number; lon: number };
  export type Ymd = { y: number; m: number; d: number };   // m de 1 à 12
  export type SunTimes = { kind: 'normal'; sunrise: number; sunset: number } | { kind: 'polar'; polar: 'day' | 'night' };
  export type Phase = 'night' | 'dawn' | 'day' | 'dusk';
  export type Sky = { phase: Phase; daylight: number; twilight: number; sunFrac: number | null; moonFrac: number | null; stars: number; top: string; bottom: string };
  export function sunTimes(ymd: Ymd, pos: Position, tzOffsetMin: number): SunTimes;
  export function skyAt(minutes: number, times: SunTimes): Sky;
  export function positionFromTimezone(tzOffsetMin: number): Position;
  export function mixHex(a: string, b: string, t: number): string;
  ```
  Les minutes sont des minutes locales depuis minuit (0 à 1439), `tzOffsetMin` = minutes à l'est de UTC (Paris été = 120).
- Produces (time-setting.ts): `minutesFor(setting: TimeSetting, now: Date): number`, `formatMinutes(minutes: number): string` (`'06:12'`).

- [ ] **Step 1: Tests qui échouent**

`tests/core/library/sky.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { mixHex, positionFromTimezone, skyAt, sunTimes } from '../../../src/core/library/sky';

const PARIS = { lat: 48.85, lon: 2.35 };
const near = (value: number, expected: number, tol = 8) => expect(Math.abs(value - expected)).toBeLessThanOrEqual(tol);

describe('sunTimes', () => {
  it('Paris au solstice d’été : lever ≈ 5 h 47, coucher ≈ 21 h 58', () => {
    const t = sunTimes({ y: 2024, m: 6, d: 21 }, PARIS, 120);
    expect(t.kind).toBe('normal');
    if (t.kind === 'normal') {
      near(t.sunrise, 5 * 60 + 47);
      near(t.sunset, 21 * 60 + 58);
    }
  });

  it('Paris au solstice d’hiver : lever ≈ 8 h 42, coucher ≈ 16 h 55', () => {
    const t = sunTimes({ y: 2024, m: 12, d: 21 }, PARIS, 60);
    if (t.kind !== 'normal') throw new Error('attendu normal');
    near(t.sunrise, 8 * 60 + 42);
    near(t.sunset, 16 * 60 + 55);
  });

  it('soleil de minuit et nuit polaire', () => {
    expect(sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 78, lon: 15 }, 120)).toEqual({ kind: 'polar', polar: 'day' });
    expect(sunTimes({ y: 2024, m: 12, d: 21 }, { lat: 78, lon: 15 }, 60)).toEqual({ kind: 'polar', polar: 'night' });
  });
});

describe('positionFromTimezone', () => {
  it('déduit la longitude du fuseau, latitude 45', () => {
    expect(positionFromTimezone(120)).toEqual({ lat: 45, lon: 30 });
    expect(positionFromTimezone(-300)).toEqual({ lat: 45, lon: -75 });
  });
});

describe('mixHex', () => {
  it('mélange deux couleurs', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#102030', '#102030', 0.3)).toBe('#102030');
    expect(mixHex('#000000', '#ffffff', 2)).toBe('#ffffff');
  });
});

describe('skyAt', () => {
  const times = { kind: 'normal', sunrise: 360, sunset: 1200 } as const;

  it('plein jour à midi : soleil visible, pas d’étoiles', () => {
    const sky = skyAt(780, times);
    expect(sky.phase).toBe('day');
    expect(sky.daylight).toBe(1);
    expect(sky.stars).toBe(0);
    expect(sky.sunFrac).toBeCloseTo(0.5, 1);
    expect(sky.moonFrac).toBeNull();
  });

  it('nuit à minuit : étoiles, lune, pas de soleil', () => {
    const sky = skyAt(0, times);
    expect(sky.phase).toBe('night');
    expect(sky.daylight).toBe(0);
    expect(sky.stars).toBe(1);
    expect(sky.sunFrac).toBeNull();
    expect(sky.moonFrac).not.toBeNull();
  });

  it('au lever du soleil : aube, crépuscule fort', () => {
    const sky = skyAt(360, times);
    expect(sky.phase).toBe('dawn');
    expect(sky.twilight).toBeGreaterThan(0.8);
  });

  it('au coucher : crépuscule du soir', () => {
    expect(skyAt(1200, times).phase).toBe('dusk');
  });

  it('les couleurs changent avec la lumière', () => {
    expect(skyAt(780, times).top).not.toBe(skyAt(0, times).top);
  });

  it('polaire : jour permanent ou nuit permanente', () => {
    expect(skyAt(0, { kind: 'polar', polar: 'day' }).daylight).toBe(1);
    expect(skyAt(780, { kind: 'polar', polar: 'night' }).daylight).toBe(0);
  });
});
```

`tests/core/library/time-setting.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { formatMinutes, minutesFor } from '../../../src/core/library/time-setting';

describe('minutesFor', () => {
  const now = new Date(2024, 5, 21, 14, 37);
  it('réelle : heure de l’appareil', () => expect(minutesFor({ mode: 'real' }, now)).toBe(14 * 60 + 37));
  it('jour : midi', () => expect(minutesFor({ mode: 'day' }, now)).toBe(720));
  it('nuit : minuit', () => expect(minutesFor({ mode: 'night' }, now)).toBe(0));
  it('manuelle : la minute choisie', () => expect(minutesFor({ mode: 'manual', minutes: 301 }, now)).toBe(301));
});

describe('formatMinutes', () => {
  it('formate hh:mm', () => {
    expect(formatMinutes(372)).toBe('06:12');
    expect(formatMinutes(0)).toBe('00:00');
    expect(formatMinutes(1439)).toBe('23:59');
  });
});
```

- [ ] **Step 2: Lancer** — `npx vitest run tests/core/library/sky.test.ts tests/core/library/time-setting.test.ts` → FAIL (modules absents).

- [ ] **Step 3: Écrire `src/core/library/time-setting.ts`**

```ts
import type { TimeSetting } from './library-types';

// Minute locale (0 à 1439) que montre la Bibliothèque : réelle, jour forcé (midi), nuit forcée (minuit) ou choisie.
export function minutesFor(setting: TimeSetting, now: Date): number {
  switch (setting.mode) {
    case 'real':
      return now.getHours() * 60 + now.getMinutes();
    case 'day':
      return 720;
    case 'night':
      return 0;
    case 'manual':
      return setting.minutes;
  }
}

export function formatMinutes(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Écrire `src/core/library/sky.ts`**

```ts
export type Position = { lat: number; lon: number };
export type Ymd = { y: number; m: number; d: number };
export type SunTimes = { kind: 'normal'; sunrise: number; sunset: number } | { kind: 'polar'; polar: 'day' | 'night' };
export type Phase = 'night' | 'dawn' | 'day' | 'dusk';
export type Sky = {
  phase: Phase;
  // 0 = nuit, 1 = plein jour, continu (la lumière monte et descend sur une heure autour du lever et du coucher).
  daylight: number;
  // 1 au lever et au coucher, 0 en plein jour et en pleine nuit : force de la teinte orangée.
  twilight: number;
  // Avancement du soleil (0 au lever, 1 au coucher) ou null s'il est couché ; idem pour la lune pendant la nuit.
  sunFrac: number | null;
  moonFrac: number | null;
  stars: number;
  top: string;
  bottom: string;
};

const RAD = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function dayOfYear({ y, m, d }: Ymd): number {
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}

// Formule astronomique simplifiée (déclinaison + équation du temps), calculée sur l'appareil. Minutes locales depuis minuit.
export function sunTimes(ymd: Ymd, pos: Position, tzOffsetMin: number): SunTimes {
  const n = dayOfYear(ymd);
  const decl = 23.44 * Math.sin(((2 * Math.PI) / 365) * (284 + n));
  const b = ((2 * Math.PI) / 364) * (n - 81);
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const cosH0 = (Math.sin(-0.833 * RAD) - Math.sin(pos.lat * RAD) * Math.sin(decl * RAD)) / (Math.cos(pos.lat * RAD) * Math.cos(decl * RAD));
  if (cosH0 <= -1) return { kind: 'polar', polar: 'day' };
  if (cosH0 >= 1) return { kind: 'polar', polar: 'night' };
  const h0 = Math.acos(cosH0) / RAD;
  const noonUtc = 720 - 4 * pos.lon - eot;
  return { kind: 'normal', sunrise: noonUtc - 4 * h0 + tzOffsetMin, sunset: noonUtc + 4 * h0 + tzOffsetMin };
}

// Sans position connue : longitude déduite du fuseau (15° par heure), latitude moyenne.
export const positionFromTimezone = (tzOffsetMin: number): Position => ({ lat: 45, lon: tzOffsetMin / 4 });

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const k = clamp(t, 0, 1);
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const to = (x: number, y: number): string => Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
  return `#${to(ar, br)}${to(ag, bg)}${to(ab, bb)}`;
}

const DAY = { top: '#6FB1E8', bottom: '#BFE0F5' };
const NIGHT = { top: '#0B1030', bottom: '#1B2250' };
const TWILIGHT = { top: '#4A4A8A', bottom: '#F29A5E' };

export function skyAt(minutes: number, times: SunTimes): Sky {
  const m = ((minutes % 1440) + 1440) % 1440;
  let daylight: number;
  let sunFrac: number | null = null;
  let moonFrac: number | null = null;
  let noon = 720;
  if (times.kind === 'polar') {
    daylight = times.polar === 'day' ? 1 : 0;
    if (daylight === 1) sunFrac = m / 1440;
    else moonFrac = m / 1440;
  } else {
    const { sunrise, sunset } = times;
    noon = (sunrise + sunset) / 2;
    daylight = clamp(Math.min((m - (sunrise - 30)) / 60, (sunset + 30 - m) / 60), 0, 1);
    if (m >= sunrise - 15 && m <= sunset + 15) sunFrac = clamp((m - sunrise) / (sunset - sunrise), 0, 1);
    else {
      const nightLen = 1440 - (sunset - sunrise);
      moonFrac = clamp((((m - sunset) % 1440) + 1440) % 1440 / nightLen, 0, 1);
    }
  }
  const twilight = times.kind === 'polar' ? 0 : clamp(1 - Math.abs(daylight - 0.5) * 2, 0, 1) * (daylight > 0 && daylight < 1 ? 1 : 0);
  const phase: Phase = daylight >= 0.95 ? 'day' : daylight <= 0.05 ? 'night' : m < noon ? 'dawn' : 'dusk';
  const base = { top: mixHex(NIGHT.top, DAY.top, daylight), bottom: mixHex(NIGHT.bottom, DAY.bottom, daylight) };
  return {
    phase,
    daylight,
    twilight,
    sunFrac,
    moonFrac,
    stars: clamp(1 - daylight * 1.6, 0, 1),
    top: mixHex(base.top, TWILIGHT.top, twilight * 0.8),
    bottom: mixHex(base.bottom, TWILIGHT.bottom, twilight * 0.8),
  };
}
```

Remarque : à l'instant exact du lever (`m = sunrise`), `daylight = 0.5` → `twilight = 1`, `phase = 'dawn'` ; au coucher `daylight = 0.5` et `m > noon` → `'dusk'`.

- [ ] **Step 5: Lancer** — `npx vitest run tests/core/library/sky.test.ts tests/core/library/time-setting.test.ts` → PASS. Si un seuil de lever/coucher dépasse la tolérance de 8 minutes, vérifier l'équation du temps avant de relever la tolérance (le calcul manuel donne 5 h 47 et 21 h 57 pour Paris au solstice d'été).

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add src/core/library/sky.ts src/core/library/time-setting.ts tests/core/library
git commit -m "feat(bibliotheque): ciel (lever, coucher, soleil, lune, couleurs) et réglage de l'heure" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Activité humaine selon l'heure

**Files:**
- Create: `src/core/library/activity.ts`
- Test: `tests/core/library/activity.test.ts`

**Interfaces:**
- Produces: `activityAt(minutes: number): number` (0 à 1) ; `lampLit(u: number, minutes: number): boolean` (`u` ∈ [0,1) propre à la fenêtre d'immeuble) ; `actorActive(u: number, minutes: number): boolean` (`u` ∈ [0,1) propre au passant, `u < 0` = toujours actif).

- [ ] **Step 1: Tests qui échouent**

```ts
import { describe, expect, it } from 'vitest';
import { activityAt, actorActive, lampLit } from '../../../src/core/library/activity';

const h = (hours: number): number => hours * 60;

describe('activityAt', () => {
  it('reste entre 0 et 1 et boucle sur 24 h', () => {
    for (let m = 0; m < 1440; m += 15) {
      const a = activityAt(m);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    expect(activityAt(0)).toBeCloseTo(activityAt(1440), 5);
  });

  it('est maximale en début de soirée et minimale vers 4 h', () => {
    expect(activityAt(h(21))).toBeGreaterThan(activityAt(h(0)));
    expect(activityAt(h(0))).toBeGreaterThan(activityAt(h(3.5)));
    expect(activityAt(h(21))).toBeGreaterThan(0.9);
    expect(activityAt(h(4))).toBeLessThan(0.1);
  });

  it('est faible en journée', () => {
    expect(activityAt(h(13))).toBeLessThan(0.2);
  });
});

describe('lampLit et actorActive', () => {
  it('beaucoup de fenêtres allumées à 21 h, presque aucune à 4 h', () => {
    const us = Array.from({ length: 100 }, (_, i) => i / 100);
    const count = (m: number): number => us.filter((u) => lampLit(u, m)).length;
    expect(count(h(21))).toBeGreaterThan(80);
    expect(count(h(4))).toBeLessThan(8);
    expect(count(h(21))).toBeGreaterThan(count(h(1)));
    expect(count(h(1))).toBeGreaterThan(count(h(4)));
  });

  it('une fenêtre insomniaque reste allumée toute la nuit', () => {
    expect(lampLit(0.01, h(4))).toBe(true);
  });

  it('les passants suivent la même courbe, un acteur à u négatif est toujours actif', () => {
    expect(actorActive(0.5, h(21))).toBe(true);
    expect(actorActive(0.5, h(3))).toBe(false);
    expect(actorActive(-1, h(3))).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer** → FAIL.

- [ ] **Step 3: Écrire `src/core/library/activity.ts`**

```ts
// Niveau d'activité humaine de la ville (0 à 1) selon l'heure locale : pic de début de soirée, creux vers 4 h.
const KEYS: readonly (readonly [number, number])[] = [
  [0, 0.3],
  [1, 0.2],
  [2, 0.12],
  [3, 0.06],
  [4, 0.04],
  [5, 0.1],
  [6, 0.3],
  [7, 0.45],
  [8, 0.25],
  [10, 0.1],
  [14, 0.08],
  [17, 0.3],
  [19, 0.85],
  [21, 1],
  [22, 0.9],
  [23, 0.55],
  [24, 0.3],
];

export function activityAt(minutes: number): number {
  const hours = (((minutes % 1440) + 1440) % 1440) / 60;
  for (let i = 1; i < KEYS.length; i++) {
    const [h1, a1] = KEYS[i]!;
    const [h0, a0] = KEYS[i - 1]!;
    if (hours <= h1) return a0 + ((a1 - a0) * (hours - h0)) / (h1 - h0);
  }
  return KEYS[KEYS.length - 1]![1];
}

// Chaque fenêtre d'immeuble a un seuil u ∈ [0,1) tiré de sa graine : elle est allumée quand l'activité dépasse ce seuil.
// Au crépuscule les lumières s'allument donc en cascade ; vers 4 h il ne reste que les seuils les plus bas (insomniaques).
export const lampLit = (u: number, minutes: number): boolean => u < activityAt(minutes) * 0.92;

// Même principe pour les passants et les véhicules ; u < 0 : toujours présent (nuages, oiseaux, satellites).
export const actorActive = (u: number, minutes: number): boolean => u < 0 || u < activityAt(minutes);
```

- [ ] **Step 4: Lancer** — `npx vitest run tests/core/library/activity.test.ts` → PASS. (À 4 h : `activityAt(240)=0.04`, `*0.92 = 0.037` → seuils 0 à 0,03 allumés = 4 sur 100 ; à 21 h : 0,92 → 93 sur 100.)

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/core/library/activity.ts tests/core/library/activity.test.ts
git commit -m "feat(bibliotheque): courbe d'activité de la ville (lumières et passants)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Géométrie du monde et acteurs (continuité)

**Files:**
- Create: `src/core/library/scene-world.ts`
- Test: `tests/core/library/scene-world.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function mulberry32(seed: number): () => number;
  export function hashString(text: string): number;
  export type ActorKind = 'cloud' | 'walker' | 'car' | 'sheep' | 'tractor' | 'hiker' | 'eagle' | 'boat' | 'gull' | 'satellite' | 'probe' | 'station';
  export type Actor = { id: string; kind: ActorKind; y: number; speed: number; phase: number; u: number; scale: number };
  export const WORLD_MARGIN = 80;
  export function actorX(actor: Actor, width: number, t: number): number;   // t en secondes
  export function actorsFor(scene: SceneId, width: number, height: number, seed: number): Actor[];
  export type Building = { x: number; w: number; h: number; far: boolean; lamps: { x: number; y: number; u: number; blue: boolean }[] };
  export function citySkyline(width: number, height: number, seed: number): Building[];
  ```
  `speed` en px/s, signé (négatif = vers la gauche). Positions en px du repère de la pièce (largeur = `cols * 30`, hauteur = `WALL_ROWS * CELL_H` = 340).

- [ ] **Step 1: Tests qui échouent**

```ts
import { describe, expect, it } from 'vitest';
import { WORLD_MARGIN, actorX, actorsFor, citySkyline, hashString, mulberry32, type Actor } from '../../../src/core/library/scene-world';
import { SCENE_IDS } from '../../../src/core/library/library-types';

const WIDTH = 720;
const HEIGHT = 340;

describe('générateur à graine', () => {
  it('donne la même suite pour la même graine', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(hashString('city')).toBe(hashString('city'));
    expect(hashString('city')).not.toBe(hashString('sea'));
  });
});

describe('actorX — continuité entre fenêtres', () => {
  const walker: Actor = { id: 'w', kind: 'walker', y: 250, speed: 30, phase: 0, u: 0.1, scale: 1 };

  it('avance à vitesse constante et boucle', () => {
    expect(actorX(walker, WIDTH, 0)).toBeCloseTo(-WORLD_MARGIN, 5);
    expect(actorX(walker, WIDTH, 10) - actorX(walker, WIDTH, 0)).toBeCloseTo(300, 5);
    const loop = (WIDTH + 2 * WORLD_MARGIN) / 30;
    expect(actorX(walker, WIDTH, loop)).toBeCloseTo(actorX(walker, WIDTH, 0), 5);
  });

  it('le délai entre deux points est distance ÷ vitesse', () => {
    const xA = 120;
    const xB = 470;
    const tA = (xA + WORLD_MARGIN) / walker.speed;
    const tB = (xB + WORLD_MARGIN) / walker.speed;
    expect(actorX(walker, WIDTH, tA)).toBeCloseTo(xA, 5);
    expect(actorX(walker, WIDTH, tB)).toBeCloseTo(xB, 5);
    expect(tB - tA).toBeCloseTo((xB - xA) / walker.speed, 5);
  });

  it('un acteur qui va vers la gauche entre par la droite', () => {
    const back: Actor = { ...walker, speed: -30 };
    expect(actorX(back, WIDTH, 0)).toBeCloseTo(WIDTH + WORLD_MARGIN, 5);
    expect(actorX(back, WIDTH, 5)).toBeCloseTo(WIDTH + WORLD_MARGIN - 150, 5);
  });
});

describe('actorsFor', () => {
  it('est déterministe et proportionnel à la largeur', () => {
    const small = actorsFor('city', 720, HEIGHT, 7);
    expect(actorsFor('city', 720, HEIGHT, 7)).toEqual(small);
    expect(actorsFor('city', 2880, HEIGHT, 7).length).toBeGreaterThan(small.length);
  });

  it('chaque scène a des acteurs, tous dans la hauteur, identifiants uniques', () => {
    for (const scene of SCENE_IDS) {
      const actors = actorsFor(scene, 1440, HEIGHT, 3);
      expect(actors.length).toBeGreaterThan(0);
      expect(new Set(actors.map((a) => a.id)).size).toBe(actors.length);
      for (const a of actors) {
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeLessThanOrEqual(HEIGHT);
        expect(a.speed).not.toBe(0);
      }
    }
  });

  it('la ville a des passants et des voitures liés à l’activité, des nuages toujours présents', () => {
    const actors = actorsFor('city', 1440, HEIGHT, 3);
    expect(actors.some((a) => a.kind === 'walker' && a.u >= 0)).toBe(true);
    expect(actors.some((a) => a.kind === 'car' && a.u >= 0)).toBe(true);
    expect(actors.filter((a) => a.kind === 'cloud').every((a) => a.u < 0)).toBe(true);
  });

  it('l’espace n’a ni nuage ni passant', () => {
    const kinds = new Set(actorsFor('space', 1440, HEIGHT, 3).map((a) => a.kind));
    expect(kinds.has('cloud')).toBe(false);
    expect(kinds.has('walker')).toBe(false);
  });
});

describe('citySkyline', () => {
  it('est déterministe, couvre la largeur, et la première bande ne change pas quand la pièce grandit à droite', () => {
    const a = citySkyline(720, HEIGHT, 5);
    expect(citySkyline(720, HEIGHT, 5)).toEqual(a);
    const wide = citySkyline(1080, HEIGHT, 5);
    const firstChunk = (list: typeof a) => list.filter((b) => b.x < 360);
    expect(firstChunk(wide)).toEqual(firstChunk(a));
    expect(Math.max(...a.map((b) => b.x + b.w))).toBeGreaterThanOrEqual(720);
  });

  it('les lampes ont un seuil entre 0 et 1', () => {
    for (const b of citySkyline(720, HEIGHT, 5)) for (const lamp of b.lamps) expect(lamp.u >= 0 && lamp.u < 1).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer** → FAIL.

- [ ] **Step 3: Écrire `src/core/library/scene-world.ts`**

```ts
import type { SceneId } from './library-types';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export type ActorKind = 'cloud' | 'walker' | 'car' | 'sheep' | 'tractor' | 'hiker' | 'eagle' | 'boat' | 'gull' | 'satellite' | 'probe' | 'station';
// `u` ∈ [0,1) : seuil d'activité (voir activity.ts) ; u < 0 = toujours présent. `phase` : décalage de départ en px.
export type Actor = { id: string; kind: ActorKind; y: number; speed: number; phase: number; u: number; scale: number };

export const WORLD_MARGIN = 80;

const positiveMod = (a: number, n: number): number => ((a % n) + n) % n;

// Position horizontale (repère de la pièce) d'un acteur à l'instant t (secondes) : il traverse tout le monde puis recommence.
// Tous les cadres montrent le même monde, donc un acteur passe d'une fenêtre à l'autre après distance ÷ vitesse.
export function actorX(actor: Actor, width: number, t: number): number {
  const loop = width + 2 * WORLD_MARGIN;
  const travelled = positiveMod(actor.phase + Math.abs(actor.speed) * t, loop);
  return actor.speed > 0 ? travelled - WORLD_MARGIN : width + WORLD_MARGIN - travelled;
}

type Spec = { kind: ActorKind; every: number; yMin: number; yMax: number; speedMin: number; speedMax: number; active: boolean; scale: [number, number] };

// Un acteur tous les `every` px de largeur. `y` en fraction de la hauteur.
const SPECS: Record<SceneId, Spec[]> = {
  city: [
    { kind: 'cloud', every: 420, yMin: 0.06, yMax: 0.3, speedMin: 5, speedMax: 11, active: false, scale: [0.8, 1.5] },
    { kind: 'walker', every: 170, yMin: 0.8, yMax: 0.82, speedMin: 16, speedMax: 28, active: true, scale: [0.9, 1.1] },
    { kind: 'car', every: 380, yMin: 0.88, yMax: 0.9, speedMin: 55, speedMax: 90, active: true, scale: [0.9, 1.1] },
  ],
  countryside: [
    { kind: 'cloud', every: 380, yMin: 0.06, yMax: 0.28, speedMin: 5, speedMax: 12, active: false, scale: [0.8, 1.6] },
    { kind: 'sheep', every: 300, yMin: 0.84, yMax: 0.92, speedMin: 3, speedMax: 6, active: false, scale: [0.8, 1.1] },
    { kind: 'tractor', every: 900, yMin: 0.78, yMax: 0.8, speedMin: 14, speedMax: 20, active: true, scale: [1, 1.2] },
  ],
  mountain: [
    { kind: 'cloud', every: 420, yMin: 0.05, yMax: 0.25, speedMin: 4, speedMax: 9, active: false, scale: [0.8, 1.5] },
    { kind: 'hiker', every: 700, yMin: 0.86, yMax: 0.9, speedMin: 8, speedMax: 14, active: true, scale: [0.9, 1.1] },
    { kind: 'eagle', every: 800, yMin: 0.15, yMax: 0.4, speedMin: 25, speedMax: 40, active: false, scale: [0.9, 1.3] },
  ],
  sea: [
    { kind: 'cloud', every: 400, yMin: 0.05, yMax: 0.25, speedMin: 5, speedMax: 11, active: false, scale: [0.8, 1.5] },
    { kind: 'boat', every: 600, yMin: 0.6, yMax: 0.7, speedMin: 8, speedMax: 16, active: true, scale: [0.9, 1.3] },
    { kind: 'gull', every: 700, yMin: 0.15, yMax: 0.4, speedMin: 22, speedMax: 36, active: false, scale: [0.9, 1.1] },
  ],
  space: [
    { kind: 'satellite', every: 900, yMin: 0.15, yMax: 0.7, speedMin: 12, speedMax: 22, active: false, scale: [0.9, 1.2] },
    { kind: 'probe', every: 1600, yMin: 0.2, yMax: 0.6, speedMin: 30, speedMax: 50, active: false, scale: [1, 1.3] },
  ],
  earth: [
    { kind: 'station', every: 1400, yMin: 0.2, yMax: 0.5, speedMin: 18, speedMax: 26, active: false, scale: [1, 1.2] },
    { kind: 'satellite', every: 700, yMin: 0.1, yMax: 0.6, speedMin: 14, speedMax: 24, active: false, scale: [0.8, 1.1] },
  ],
};

export function actorsFor(scene: SceneId, width: number, height: number, seed: number): Actor[] {
  const rng = mulberry32(seed ^ hashString(`actors-${scene}`));
  const actors: Actor[] = [];
  for (const spec of SPECS[scene]) {
    const count = Math.max(1, Math.round(width / spec.every));
    for (let i = 0; i < count; i++) {
      const dir = rng() < 0.5 ? 1 : -1;
      actors.push({
        id: `${spec.kind}-${i}`,
        kind: spec.kind,
        y: Math.round((spec.yMin + rng() * (spec.yMax - spec.yMin)) * height),
        speed: dir * (spec.speedMin + rng() * (spec.speedMax - spec.speedMin)),
        phase: rng() * (width + 2 * WORLD_MARGIN),
        u: spec.active ? rng() : -1,
        scale: spec.scale[0] + rng() * (spec.scale[1] - spec.scale[0]),
      });
    }
  }
  return actors;
}

export type Lamp = { x: number; y: number; u: number; blue: boolean };
export type Building = { x: number; w: number; h: number; far: boolean; lamps: Lamp[] };

export const CHUNK = 360;

// Immeubles de la ville, tirés par bandes de 360 px (une zone de pièce) : agrandir la pièce à droite ne change pas ce qui existe déjà.
export function citySkyline(width: number, height: number, seed: number): Building[] {
  const ground = height * 0.78;
  const out: Building[] = [];
  for (let chunk = 0; chunk * CHUNK < width + CHUNK; chunk++) {
    const rng = mulberry32(seed ^ Math.imul(chunk + 1, 2654435761));
    for (const far of [true, false]) {
      let x = chunk * CHUNK + (far ? 0 : 12);
      const end = (chunk + 1) * CHUNK;
      while (x < end) {
        const w = (far ? 34 : 28) + rng() * (far ? 30 : 26);
        const h = (far ? 50 : 40) + rng() * (far ? 70 : 60);
        const lamps: Lamp[] = [];
        if (!far) {
          for (let r = 0; r < Math.floor(h / 14); r++) {
            for (let c = 0; c < Math.floor(w / 10); c++) {
              lamps.push({ x: x + 4 + c * 10, y: ground - h + 4 + r * 14, u: rng(), blue: rng() < 0.15 });
            }
          }
        }
        out.push({ x, w, h, far, lamps });
        x += w + (far ? -4 : 8 + rng() * 14);
      }
    }
  }
  return out;
}
```

Remarque : la dernière bande dépasse `width` ; le rendu coupe via le `clipPath` des fenêtres, aucun débordement visible.

- [ ] **Step 4: Lancer** — `npx vitest run tests/core/library/scene-world.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/core/library/scene-world.ts tests/core/library/scene-world.test.ts
git commit -m "feat(bibliotheque): géométrie du monde, acteurs continus et immeubles à graine" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Position de l'appareil et horloge de la scène

**Files:**
- Create: `src/content/scene-position.ts`, `src/content/use-scene-time.ts`
- Test: `tests/content/scene-position.test.ts` (jsdom), `tests/content/use-scene-time.test.tsx` (jsdom)

**Interfaces:**
- Produces (scene-position.ts): `currentPosition(): Position` (dernier connu, sinon repli fuseau), `requestPosition(): Promise<Position>` (déclenche la demande d'accord ; sans API, refus ou délai de 8 s → repli), `resetPositionForTests(): void`, `subscribePosition(listener: () => void): () => void`.
- Produces (use-scene-time.ts): `useSceneTime(setting: TimeSetting): { minutes: number; sky: Sky; times: SunTimes }`.

- [ ] **Step 1: Tests qui échouent**

`tests/content/scene-position.test.ts` :

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentPosition, requestPosition, resetPositionForTests } from '../../src/content/scene-position';

const setGeo = (value: unknown) => Object.defineProperty(navigator, 'geolocation', { value, configurable: true });

beforeEach(() => resetPositionForTests());
afterEach(() => vi.restoreAllMocks());

describe('position de l’appareil', () => {
  it('sans accord, déduit la position du fuseau horaire', () => {
    const tz = -new Date().getTimezoneOffset();
    expect(currentPosition()).toEqual({ lat: 45, lon: tz / 4 });
  });

  it('retient la position donnée par le navigateur', async () => {
    setGeo({ getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: 48.85, longitude: 2.35 } }) });
    await expect(requestPosition()).resolves.toEqual({ lat: 48.85, lon: 2.35 });
    expect(currentPosition()).toEqual({ lat: 48.85, lon: 2.35 });
  });

  it('un refus garde le repli fuseau sans erreur', async () => {
    setGeo({ getCurrentPosition: (_ok: unknown, ko: (e: unknown) => void) => ko({ code: 1 }) });
    const tz = -new Date().getTimezoneOffset();
    await expect(requestPosition()).resolves.toEqual({ lat: 45, lon: tz / 4 });
  });

  it('sans API de géolocalisation, garde le repli', async () => {
    setGeo(undefined);
    const tz = -new Date().getTimezoneOffset();
    await expect(requestPosition()).resolves.toEqual({ lat: 45, lon: tz / 4 });
  });
});
```

`tests/content/use-scene-time.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSceneTime } from '../../src/content/use-scene-time';
import type { TimeSetting } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let last: ReturnType<typeof useSceneTime> | null = null;

function Probe({ setting }: { setting: TimeSetting }) {
  last = useSceneTime(setting);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2024, 5, 21, 14, 37));
  container = document.createElement('div');
  root = createRoot(container);
  last = null;
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe('useSceneTime', () => {
  it('heure réelle : suit l’horloge et se met à jour', () => {
    act(() => root.render(<Probe setting={{ mode: 'real' }} />));
    expect(last!.minutes).toBe(14 * 60 + 37);
    act(() => { vi.setSystemTime(new Date(2024, 5, 21, 14, 50)); vi.advanceTimersByTime(31000); });
    expect(last!.minutes).toBe(14 * 60 + 50);
  });

  it('nuit forcée : minuit et ciel de nuit', () => {
    act(() => root.render(<Probe setting={{ mode: 'night' }} />));
    expect(last!.minutes).toBe(0);
    expect(last!.sky.phase).toBe('night');
  });

  it('jour forcé : midi et plein jour', () => {
    act(() => root.render(<Probe setting={{ mode: 'day' }} />));
    expect(last!.minutes).toBe(720);
    expect(last!.sky.daylight).toBe(1);
  });
});
```

- [ ] **Step 2: Lancer** → FAIL.

- [ ] **Step 3: `src/content/scene-position.ts`**

```ts
import { positionFromTimezone, type Position } from '../core/library/sky';

// La position n'est jamais stockée ni envoyée : elle ne sert qu'au calcul du lever et du coucher, sur l'appareil.
let known: Position | null = null;
const listeners = new Set<() => void>();

const fallback = (): Position => positionFromTimezone(-new Date().getTimezoneOffset());

export function currentPosition(): Position {
  return known ?? fallback();
}

export function subscribePosition(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function resetPositionForTests(): void {
  known = null;
}

// À appeler seulement après un choix explicite de « Heure réelle » : le navigateur demande alors l'accord du joueur.
export function requestPosition(): Promise<Position> {
  return new Promise((resolve) => {
    const geo = typeof navigator === 'undefined' ? undefined : navigator.geolocation;
    if (!geo) return resolve(currentPosition());
    const timer = window.setTimeout(() => resolve(currentPosition()), 8000);
    geo.getCurrentPosition(
      (p) => {
        window.clearTimeout(timer);
        known = { lat: p.coords.latitude, lon: p.coords.longitude };
        for (const listener of listeners) listener();
        resolve(known);
      },
      () => {
        window.clearTimeout(timer);
        resolve(currentPosition());
      },
      { maximumAge: 3600000, timeout: 7000 },
    );
  });
}
```

- [ ] **Step 4: `src/content/use-scene-time.ts`**

```ts
import { useEffect, useMemo, useSyncExternalStore, useState } from 'react';
import type { TimeSetting } from '../core/library/library-types';
import { skyAt, sunTimes, type Sky, type SunTimes } from '../core/library/sky';
import { minutesFor } from '../core/library/time-setting';
import { currentPosition, subscribePosition } from './scene-position';

export type SceneTime = { minutes: number; sky: Sky; times: SunTimes };

// Minute courante, ciel et heures de lever/coucher du jour. En heure réelle la minute est relue toutes les 30 s.
export function useSceneTime(setting: TimeSetting): SceneTime {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    setNow(new Date());
    if (setting.mode !== 'real') return;
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, [setting.mode]);
  // La position change quand le joueur accorde la géolocalisation ; on la lit à l'identique tant qu'elle ne change pas.
  const position = useSyncExternalStore(subscribePosition, () => currentPosition(), () => currentPosition());
  const minutes = minutesFor(setting, now);
  return useMemo(() => {
    const times = sunTimes({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }, position, -now.getTimezoneOffset());
    return { minutes, times, sky: skyAt(minutes, times) };
    // `now` n'entre que par sa date : la minute vient de `minutes`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes, position.lat, position.lon, now.getFullYear(), now.getMonth(), now.getDate()]);
}
```

Attention : `useSyncExternalStore` exige un snapshot stable. `currentPosition()` renvoie un nouvel objet de repli à chaque appel tant que rien n'est connu → boucle de rendu. Corriger `scene-position.ts` en mémorisant le repli :

```ts
let cachedFallback: Position | null = null;
const fallback = (): Position => (cachedFallback ??= positionFromTimezone(-new Date().getTimezoneOffset()));
```
et `resetPositionForTests` remet aussi `cachedFallback = null`. (Le test « sans accord » reste vrai.)

- [ ] **Step 5: Lancer** — `npx vitest run tests/content/scene-position.test.ts tests/content/use-scene-time.test.tsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add src/content/scene-position.ts src/content/use-scene-time.ts tests/content/scene-position.test.ts tests/content/use-scene-time.test.tsx
git commit -m "feat(bibliotheque): position de l'appareil (accord + repli fuseau) et horloge de la scène" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Panorama — ciel, astres, acteurs, boucle d'animation, ville

**Files:**
- Create: `src/content/scene-panorama.tsx`, `src/content/scene-city.tsx`, `src/content/scene-sprites.tsx`
- Test: `tests/content/scene-panorama.test.tsx` (jsdom)

**Interfaces:**
- Consumes: `Sky`, `mixHex` (Task 3), `lampLit`, `actorActive` (Task 4), `Actor`, `actorsFor`, `actorX`, `citySkyline`, `hashString` (Task 5), `SceneId`.
- Produces:
  ```tsx
  export type PanoramaProps = { scene: SceneId; width: number; height: number; sky: Sky; minutes: number; seed: number; clipId?: undefined };
  export function ScenePanorama(props: PanoramaProps): ReactElement;   // un <g data-panorama data-scene>, à placer dans <defs><g id=…>
  export type SceneBodyProps = { width: number; height: number; sky: Sky; minutes: number; seed: number };
  export function CityScene(props: SceneBodyProps): ReactElement;      // scene-city.tsx
  export function ActorSprite(props: { kind: ActorKind; sky: Sky }): ReactElement;   // scene-sprites.tsx, dessiné autour de (0,0)
  ```
  Les tâches 8 et 9 ajoutent `NatureScene`/`SpaceScene` et les branchent dans le même `switch`.

Contrat DOM (testé) : `<g data-panorama data-scene="city">` contient `<rect data-sky>`, `<g data-celestial>`, `<g data-scene-body>`, `<g data-actors>` ; chaque acteur est `<g data-actor="<id>" data-kind="<kind>" data-u="<u>">`.

- [ ] **Step 1: Tests qui échouent**

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenePanorama } from '../../src/content/scene-panorama';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
const render = (minutes: number, scene: 'city' = 'city') =>
  act(() =>
    root.render(
      <svg>
        <ScenePanorama scene={scene} width={720} height={340} sky={skyAt(minutes, times)} minutes={minutes} seed={5} />
      </svg>,
    ),
  );

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('ScenePanorama (ville)', () => {
  it('contient le ciel, les astres, le décor et les acteurs', () => {
    render(13 * 60);
    expect(container.querySelector('[data-panorama][data-scene="city"]')).not.toBeNull();
    expect(container.querySelector('[data-sky]')).not.toBeNull();
    expect(container.querySelector('[data-celestial]')).not.toBeNull();
    expect(container.querySelector('[data-scene-body]')).not.toBeNull();
    expect(container.querySelectorAll('[data-actor]').length).toBeGreaterThan(0);
  });

  it('le soleil se voit le jour, la lune et les étoiles la nuit', () => {
    render(13 * 60);
    expect(container.querySelector('[data-sun]')).not.toBeNull();
    expect(container.querySelector('[data-moon]')).toBeNull();
    render(0);
    expect(container.querySelector('[data-sun]')).toBeNull();
    expect(container.querySelector('[data-moon]')).not.toBeNull();
    expect(container.querySelectorAll('[data-star]').length).toBeGreaterThan(10);
  });

  it('beaucoup de fenêtres allumées à 21 h, presque aucune à 4 h', () => {
    const lit = (minutes: number): number => {
      render(minutes);
      return Array.from(container.querySelectorAll<SVGElement>('[data-lamp]')).filter((el) => el.getAttribute('data-lit') === 'true').length;
    };
    const evening = lit(21 * 60);
    const deepNight = lit(4 * 60);
    expect(evening).toBeGreaterThan(deepNight * 5);
    expect(deepNight).toBeLessThan(evening / 5 + 1);
  });

  it('les acteurs humains sont présents le soir, presque absents à 4 h (opacité cible)', () => {
    const present = (minutes: number): number => {
      render(minutes);
      return Array.from(container.querySelectorAll<SVGElement>('[data-actor][data-kind="walker"]')).filter((el) => el.getAttribute('data-active') === 'true').length;
    };
    expect(present(21 * 60)).toBeGreaterThan(present(4 * 60));
  });

  it('place les acteurs au montage (transform) même sans animation', () => {
    render(13 * 60);
    const first = container.querySelector<SVGElement>('[data-actor]')!;
    expect(first.getAttribute('transform')).toMatch(/translate\(/);
  });
});
```

(Pour que « transform au montage » soit vrai sans rAF, le composant applique `transform` dans le JSX initial via `actorX(actor, width, Date.now()/1000)`, et la boucle la met à jour ensuite par le DOM.)

- [ ] **Step 2: Lancer** → FAIL (modules absents).

- [ ] **Step 3: `src/content/scene-sprites.tsx`** — sprites autour de (0,0), `y` positif vers le bas, la plupart posés sur la ligne y = 0.

```tsx
import type { ReactElement } from 'react';
import type { ActorKind } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { mixHex } from '../core/library/sky';

type Props = { kind: ActorKind; sky: Sky };

// Silhouettes simples : plus sombres la nuit, pour rester lisibles sur le ciel.
export function ActorSprite({ kind, sky }: Props): ReactElement {
  const dark = (day: string, night: string): string => mixHex(night, day, sky.daylight);
  switch (kind) {
    case 'cloud':
      return (
        <g fill={dark('#FFFFFF', '#3A4170')} opacity={0.9}>
          <ellipse cx={0} cy={0} rx={30} ry={11} />
          <ellipse cx={-16} cy={-6} rx={16} ry={10} />
          <ellipse cx={10} cy={-9} rx={18} ry={12} />
        </g>
      );
    case 'walker':
      return (
        <g>
          <circle cx={0} cy={-26} r={4.5} fill="#E8B88A" />
          <rect x={-4.5} y={-21} width={9} height={14} rx={2} fill={dark('#C0463A', '#6C7AB8')} />
          <rect x={-4} y={-7} width={3} height={8} fill={dark('#2F3340', '#1A1D33')} />
          <rect x={1} y={-7} width={3} height={8} fill={dark('#2F3340', '#1A1D33')} />
        </g>
      );
    case 'car':
      return (
        <g>
          <rect x={-18} y={-12} width={36} height={9} rx={3} fill={dark('#3B6FD6', '#2A3566')} />
          <rect x={-10} y={-19} width={20} height={9} rx={3} fill={dark('#3B6FD6', '#2A3566')} />
          <circle cx={-10} cy={-3} r={4} fill="#222" />
          <circle cx={10} cy={-3} r={4} fill="#222" />
          <circle cx={18} cy={-8} r={2.5} fill={sky.daylight < 0.5 ? '#FFE9A0' : '#EEE'} />
        </g>
      );
    case 'sheep':
      return (
        <g>
          <ellipse cx={0} cy={-8} rx={9} ry={6} fill={dark('#F4F1EA', '#8E94B8')} />
          <circle cx={9} cy={-9} r={3.5} fill={dark('#3B3733', '#1A1D33')} />
          <rect x={-5} y={-3} width={2} height={5} fill="#3B3733" />
          <rect x={3} y={-3} width={2} height={5} fill="#3B3733" />
        </g>
      );
    case 'tractor':
      return (
        <g>
          <rect x={-16} y={-16} width={22} height={10} rx={2} fill={dark('#3C8F3C', '#25502A')} />
          <rect x={-2} y={-24} width={10} height={9} fill={dark('#3C8F3C', '#25502A')} />
          <circle cx={-10} cy={-5} r={7} fill="#2A2A2A" />
          <circle cx={9} cy={-3} r={4.5} fill="#2A2A2A" />
        </g>
      );
    case 'hiker':
      return (
        <g>
          <circle cx={0} cy={-22} r={3.5} fill="#E8B88A" />
          <rect x={-4} y={-18} width={8} height={11} rx={2} fill={dark('#D95F2B', '#6C5A8A')} />
          <rect x={-3} y={-7} width={2.5} height={7} fill="#2F3340" />
          <rect x={1} y={-7} width={2.5} height={7} fill="#2F3340" />
          <rect x={5} y={-22} width={1.5} height={22} fill="#7A5A3A" />
        </g>
      );
    case 'eagle':
    case 'gull':
      return <path d="M-14 2 Q-7 -8 0 0 Q7 -8 14 2 Q7 -3 0 3 Q-7 -3 -14 2z" fill={dark(kind === 'gull' ? '#FFFFFF' : '#3B2F26', '#1A1D33')} />;
    case 'boat':
      return (
        <g>
          <path d="M-26 0h52l-8 10h-36z" fill={dark('#7A3B2A', '#2A2A3A')} />
          <rect x={-1.5} y={-32} width={3} height={32} fill="#CCC" />
          <path d="M3 -32l20 26h-20z" fill={dark('#FFFFFF', '#9AA3C8')} />
        </g>
      );
    case 'satellite':
      return (
        <g>
          <rect x={-5} y={-3} width={10} height={6} fill="#D8D8D8" />
          <rect x={-22} y={-4} width={14} height={8} fill="#3B6FD6" />
          <rect x={8} y={-4} width={14} height={8} fill="#3B6FD6" />
        </g>
      );
    case 'probe':
      return (
        <g>
          <circle cx={0} cy={0} r={5} fill="#E0E0E0" />
          <path d="M-8 0 L-26 -10 L-26 10z" fill="#9AA3C8" />
          <rect x={5} y={-1} width={16} height={2} fill="#BBB" />
        </g>
      );
    case 'station':
      return (
        <g>
          <rect x={-30} y={-1.5} width={60} height={3} fill="#BBB" />
          <rect x={-8} y={-6} width={16} height={12} rx={2} fill="#E0E0E0" />
          <rect x={-28} y={-8} width={10} height={16} fill="#3B6FD6" />
          <rect x={18} y={-8} width={10} height={16} fill="#3B6FD6" />
        </g>
      );
  }
}
```

- [ ] **Step 4: `src/content/scene-city.tsx`**

```tsx
import type { ReactElement } from 'react';
import { lampLit } from '../core/library/activity';
import { citySkyline } from '../core/library/scene-world';
import { mixHex } from '../core/library/sky';
import type { SceneBodyProps } from './scene-panorama';

export function CityScene({ width, height, sky, minutes, seed }: SceneBodyProps): ReactElement {
  const ground = height * 0.78;
  const far = mixHex('#232B5C', '#9FB4C8', sky.daylight);
  const near = mixHex('#141A3E', '#7C8FA3', sky.daylight);
  const street = mixHex('#2A2D4A', '#B7B2A6', sky.daylight);
  const walk = mixHex('#3A3D5E', '#CFC9BB', sky.daylight);
  const dim = 1 - sky.daylight;
  const buildings = citySkyline(width, height, seed);
  return (
    <g data-scene-body>
      {buildings.filter((b) => b.far).map((b, i) => (
        <rect key={`f${i}`} x={b.x} y={ground - b.h} width={b.w} height={b.h} fill={far} />
      ))}
      {buildings.filter((b) => !b.far).map((b, i) => (
        <g key={`n${i}`}>
          <rect x={b.x} y={ground - b.h} width={b.w} height={b.h} fill={near} />
          {b.lamps.map((lamp, j) => {
            const lit = lampLit(lamp.u, minutes);
            return (
              <rect
                key={j}
                data-lamp=""
                data-lit={lit ? 'true' : 'false'}
                x={lamp.x}
                y={lamp.y}
                width={5}
                height={7}
                fill={lamp.blue ? '#9FC4FF' : '#FFD27A'}
                opacity={lit ? dim : 0}
                style={{ transition: 'opacity 4s ease' }}
              />
            );
          })}
        </g>
      ))}
      <rect x={0} y={ground} width={width} height={height - ground} fill={street} />
      <rect x={0} y={ground} width={width} height={height * 0.07} fill={walk} />
      <rect x={0} y={ground - 2} width={width} height={3} fill="#00000022" />
    </g>
  );
}
```

- [ ] **Step 5: `src/content/scene-panorama.tsx`**

```tsx
import { memo, useEffect, useId, useMemo, useRef, type ReactElement } from 'react';
import { actorActive } from '../core/library/activity';
import type { SceneId } from '../core/library/library-types';
import { actorX, actorsFor, hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { CityScene } from './scene-city';
import { ActorSprite } from './scene-sprites';

export type SceneBodyProps = { width: number; height: number; sky: Sky; minutes: number; seed: number };
export type PanoramaProps = SceneBodyProps & { scene: SceneId };

const FRAME_MS = 33;

function SkyAndStars({ width, height, sky, seed }: SceneBodyProps): ReactElement {
  const gradientId = useId();
  const stars = useMemo(() => {
    const rng = mulberry32(seed ^ 0x57a45);
    return Array.from({ length: Math.round(width / 9) }, (_, i) => ({ i, x: rng() * width, y: rng() * height * 0.65, r: 0.7 + rng() * 1.3 }));
  }, [width, height, seed]);
  return (
    <g data-sky-layer>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky.top} />
          <stop offset="1" stopColor={sky.bottom} />
        </linearGradient>
      </defs>
      <rect data-sky x={0} y={0} width={width} height={height} fill={`url(#${gradientId})`} />
      <g opacity={sky.stars} style={{ transition: 'opacity 4s ease' }}>
        {sky.stars > 0 && stars.map((s) => <circle key={s.i} data-star="" cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" />)}
      </g>
    </g>
  );
}

// Soleil et lune traversent toute la largeur du monde : ils passent d'une fenêtre à l'autre au fil de la journée.
function Celestial({ width, height, sky }: SceneBodyProps): ReactElement {
  const place = (frac: number): { x: number; y: number } => ({ x: width * (0.04 + 0.92 * frac), y: height * 0.7 - Math.sin(Math.PI * frac) * height * 0.55 });
  const sun = sky.sunFrac === null ? null : place(sky.sunFrac);
  const moon = sky.moonFrac === null ? null : place(sky.moonFrac);
  return (
    <g data-celestial>
      {sun && (
        <g data-sun="" transform={`translate(${sun.x} ${sun.y})`}>
          <circle r={34} fill="#FFE27A" opacity={0.25} />
          <circle r={22} fill={sky.twilight > 0.4 ? '#FF9A4A' : '#FFE27A'} />
        </g>
      )}
      {moon && (
        <g data-moon="" transform={`translate(${moon.x} ${moon.y})`}>
          <circle r={18} fill="#E8ECFF" />
          <circle cx={6} cy={-4} r={16} fill={sky.bottom} opacity={0.35} />
        </g>
      )}
    </g>
  );
}

// Boucle d'animation : met les acteurs à leur place sans re-rendu React. Les positions viennent de l'horloge murale :
// toutes les fenêtres (copies <use> du même groupe) voient donc le même instant.
function useActorLoop(root: React.RefObject<SVGGElement | null>, scene: SceneId, width: number, height: number, seed: number): void {
  const actors = useMemo(() => actorsFor(scene, width, height, seed), [scene, width, height, seed]);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const nodes = new Map<string, SVGGElement>();
    for (const actor of actors) {
      const node = el.querySelector<SVGGElement>(`[data-actor="${actor.id}"]`);
      if (node) nodes.set(actor.id, node);
    }
    const place = (): void => {
      const t = Date.now() / 1000;
      for (const actor of actors) nodes.get(actor.id)?.setAttribute('transform', `translate(${actorX(actor, width, t).toFixed(1)} ${actor.y}) scale(${actor.speed < 0 ? -actor.scale : actor.scale} ${actor.scale})`);
    };
    place();
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number): void => {
      frame = window.requestAnimationFrame(tick);
      if (document.visibilityState === 'hidden' || now - last < FRAME_MS) return;
      last = now;
      place();
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [actors, width, root]);
}

function ScenePanoramaView({ scene, width, height, sky, minutes, seed }: PanoramaProps): ReactElement {
  const root = useRef<SVGGElement | null>(null);
  const actors = useMemo(() => actorsFor(scene, width, height, seed), [scene, width, height, seed]);
  useActorLoop(root, scene, width, height, seed);
  const props = { width, height, sky, minutes, seed };
  const t0 = Date.now() / 1000;
  return (
    <g data-panorama="" data-scene={scene} ref={root}>
      <SkyAndStars {...props} />
      <Celestial {...props} />
      {scene === 'city' && <CityScene {...props} />}
      <g data-actors>
        {actors.map((actor) => {
          const active = actorActive(actor.u, minutes);
          return (
            <g
              key={actor.id}
              data-actor={actor.id}
              data-kind={actor.kind}
              data-active={active ? 'true' : 'false'}
              transform={`translate(${actorX(actor, width, t0).toFixed(1)} ${actor.y}) scale(${actor.speed < 0 ? -actor.scale : actor.scale} ${actor.scale})`}
              opacity={active ? 1 : 0}
              style={{ transition: 'opacity 3s ease' }}
            >
              <ActorSprite kind={actor.kind} sky={sky} />
            </g>
          );
        })}
      </g>
    </g>
  );
}

// Le décor ne se redessine que si la scène, la taille ou la minute changent.
export const ScenePanorama = memo(ScenePanoramaView);
export { hashString };
```

Retirer l'export `hashString` inutile si le linter le refuse (il sert seulement aux appelants pour calculer la graine : `hashString(room.id)`; le conserver comme `export { hashString } from '../core/library/scene-world'` n'est pas nécessaire — les appelants importent directement depuis `scene-world`). **Supprimer** la dernière ligne et l'import `hashString` de ce fichier.

- [ ] **Step 6: Lancer** — `npx vitest run tests/content/scene-panorama.test.tsx` → PASS ; `npx tsc --noEmit` propre. Le test des lampes compte `data-lit="true"` : à 21 h `lampLit` vaut vrai pour ~93 % des seuils, à 4 h pour ~4 %.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add src/content/scene-*.tsx tests/content/scene-panorama.test.tsx
git commit -m "feat(bibliotheque): panorama (ciel, astres, acteurs animés) et scène Ville" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Scènes Campagne, Montagne et Mer

**Files:**
- Create: `src/content/scene-nature.tsx`
- Modify: `src/content/scene-panorama.tsx` (branche les trois scènes)
- Test: `tests/content/scene-nature.test.tsx` (jsdom)

**Interfaces:**
- Consumes: `SceneBodyProps`, `lampLit` (activité), `mulberry32`, `CHUNK`, `mixHex`.
- Produces: `CountrysideScene`, `MountainScene`, `SeaScene` : `(props: SceneBodyProps) => ReactElement`, chacun racine `<g data-scene-body data-scene-art="<id>">`.

- [ ] **Step 1: Tests qui échouent**

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenePanorama } from '../../src/content/scene-panorama';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import type { SceneId } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
const render = (scene: SceneId, minutes: number) =>
  act(() => root.render(<svg><ScenePanorama scene={scene} width={1080} height={340} sky={skyAt(minutes, times)} minutes={minutes} seed={9} /></svg>));

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe.each([['countryside', 'sheep'], ['mountain', 'hiker'], ['sea', 'boat']] as const)('scène %s', (scene, kind) => {
  it('dessine son décor et ses acteurs propres', () => {
    render(scene, 13 * 60);
    expect(container.querySelector(`[data-scene-art="${scene}"]`)).not.toBeNull();
    expect(container.querySelector(`[data-actor][data-kind="${kind}"]`)).not.toBeNull();
    expect(container.querySelector('[data-sun]')).not.toBeNull();
  });

  it('de nuit : lune, étoiles, pas de soleil', () => {
    render(scene, 0);
    expect(container.querySelector('[data-moon]')).not.toBeNull();
    expect(container.querySelector('[data-sun]')).toBeNull();
  });
});

describe('lumières nocturnes', () => {
  it('la campagne a des fermes éclairées le soir, plus rares à 4 h', () => {
    const lit = (m: number): number => { render('countryside', m); return container.querySelectorAll('[data-lamp][data-lit="true"]').length; };
    expect(lit(21 * 60)).toBeGreaterThan(lit(4 * 60));
  });
  it('la mer a des lumières de port qui suivent l’activité', () => {
    const lit = (m: number): number => { render('sea', m); return container.querySelectorAll('[data-lamp][data-lit="true"]').length; };
    expect(lit(21 * 60)).toBeGreaterThan(lit(4 * 60));
  });
});
```

- [ ] **Step 2: Lancer** → FAIL.

- [ ] **Step 3: `src/content/scene-nature.tsx`** — trois composants. Structure commune : `ground = height * 0.78`, couleurs via `mixHex(nuit, jour, sky.daylight)`. Écrire :

```tsx
import type { ReactElement } from 'react';
import { lampLit } from '../core/library/activity';
import { CHUNK, mulberry32 } from '../core/library/scene-world';
import { mixHex } from '../core/library/sky';
import type { SceneBodyProps } from './scene-panorama';

const tone = (day: string, night: string, daylight: number): string => mixHex(night, day, daylight);

// Une lampe (fenêtre de ferme, refuge, feu de port) : allumée selon l'activité, visible seulement quand il fait sombre.
function Lamp({ x, y, w = 5, h = 6, u, minutes, dim, color = '#FFD27A' }: { x: number; y: number; w?: number; h?: number; u: number; minutes: number; dim: number; color?: string }): ReactElement {
  const lit = lampLit(u, minutes);
  return <rect data-lamp="" data-lit={lit ? 'true' : 'false'} x={x} y={y} width={w} height={h} fill={color} opacity={lit ? dim : 0} style={{ transition: 'opacity 4s ease' }} />;
}

// Collines ondulées : une courbe par bande de 360 px, déterministe.
function hills(width: number, base: number, amp: number, seed: number): string {
  let d = `M0 ${base}`;
  for (let chunk = 0; chunk * CHUNK <= width; chunk++) {
    const rng = mulberry32(seed ^ Math.imul(chunk + 7, 2246822519));
    const x0 = chunk * CHUNK;
    d += ` Q${x0 + CHUNK * 0.25} ${base - rng() * amp} ${x0 + CHUNK * 0.5} ${base - rng() * amp * 0.4} T${x0 + CHUNK} ${base}`;
  }
  return `${d} L${(Math.ceil(width / CHUNK) + 1) * CHUNK} 340 L0 340z`;
}

export function CountrysideScene({ width, height, sky, minutes, seed }: SceneBodyProps): ReactElement {
  const ground = height * 0.78;
  const dim = 1 - sky.daylight;
  const farHills = tone('#8DB88B', '#1F3B3A', sky.daylight);
  const nearHills = tone('#6FA463', '#17332F', sky.daylight);
  const field = tone('#9CC46E', '#1E3A2C', sky.daylight);
  const rng = mulberry32(seed ^ 0xfa12);
  const farms = Array.from({ length: Math.max(1, Math.round(width / 520)) }, (_, i) => ({ i, x: 80 + i * 520 + rng() * 200, u: 0.15 + rng() * 0.5 }));
  const trees = Array.from({ length: Math.round(width / 70) }, (_, i) => ({ i, x: rng() * width, h: 16 + rng() * 14 }));
  return (
    <g data-scene-body data-scene-art="countryside">
      <path d={hills(width, ground - 36, 40, seed)} fill={farHills} />
      <path d={hills(width, ground - 12, 26, seed + 1)} fill={nearHills} />
      <rect x={0} y={ground} width={width} height={height - ground} fill={field} />
      {Array.from({ length: Math.ceil(width / 90) }, (_, i) => (
        <rect key={i} x={i * 90} y={ground} width={45} height={height - ground} fill={tone('#B2D27C', '#254432', sky.daylight)} opacity={0.5} />
      ))}
      {trees.map((t) => (
        <g key={t.i}>
          <rect x={t.x - 1.5} y={ground - t.h * 0.4} width={3} height={t.h * 0.4} fill={tone('#6B4A2E', '#2A1F18', sky.daylight)} />
          <circle cx={t.x} cy={ground - t.h * 0.6} r={t.h * 0.45} fill={tone('#3F7F3F', '#16301F', sky.daylight)} />
        </g>
      ))}
      {farms.map((f) => (
        <g key={f.i}>
          <rect x={f.x} y={ground - 22} width={34} height={22} fill={tone('#C9553E', '#4A2A33', sky.daylight)} />
          <path d={`M${f.x - 3} ${ground - 22} L${f.x + 17} ${ground - 36} L${f.x + 37} ${ground - 22}z`} fill={tone('#7A3B2A', '#2F1B20', sky.daylight)} />
          <Lamp x={f.x + 8} y={ground - 15} u={f.u} minutes={minutes} dim={dim} />
          <Lamp x={f.x + 21} y={ground - 15} u={f.u + 0.05} minutes={minutes} dim={dim} />
        </g>
      ))}
    </g>
  );
}

export function MountainScene({ width, height, sky, minutes, seed }: SceneBodyProps): ReactElement {
  const ground = height * 0.82;
  const dim = 1 - sky.daylight;
  const peaks = (base: number, hMin: number, hMax: number, salt: number): { x: number; w: number; h: number }[] => {
    const out: { x: number; w: number; h: number }[] = [];
    for (let chunk = 0; chunk * CHUNK <= width; chunk++) {
      const rng = mulberry32(seed ^ Math.imul(chunk + salt, 2654435761));
      let x = chunk * CHUNK;
      while (x < (chunk + 1) * CHUNK) {
        const w = 120 + rng() * 140;
        out.push({ x, w, h: hMin + rng() * (hMax - hMin) });
        x += w * 0.6;
      }
    }
    return out;
  };
  const far = peaks(ground, 90, 170, 3);
  const near = peaks(ground, 60, 120, 11);
  const rng = mulberry32(seed ^ 0xbe11);
  const refuges = Array.from({ length: Math.max(1, Math.round(width / 900)) }, (_, i) => ({ i, x: 140 + i * 900 + rng() * 300, u: 0.3 + rng() * 0.4 }));
  const pines = Array.from({ length: Math.round(width / 40) }, (_, i) => ({ i, x: rng() * width, h: 18 + rng() * 16 }));
  const rock = (day: string, night: string): string => tone(day, night, sky.daylight);
  return (
    <g data-scene-body data-scene-art="mountain">
      {far.map((p, i) => (
        <g key={`f${i}`}>
          <path d={`M${p.x - p.w / 2} ${ground} L${p.x} ${ground - p.h} L${p.x + p.w / 2} ${ground}z`} fill={rock('#8C9BB5', '#252B52')} />
          <path d={`M${p.x - p.w * 0.1} ${ground - p.h * 0.8} L${p.x} ${ground - p.h} L${p.x + p.w * 0.1} ${ground - p.h * 0.8}z`} fill={rock('#FFFFFF', '#6C76A8')} />
        </g>
      ))}
      {near.map((p, i) => (
        <path key={`n${i}`} d={`M${p.x - p.w / 2} ${ground} L${p.x} ${ground - p.h} L${p.x + p.w / 2} ${ground}z`} fill={rock('#5F7A66', '#17261F')} />
      ))}
      <rect x={0} y={ground} width={width} height={height - ground} fill={rock('#4F7F4A', '#14291D')} />
      {pines.map((t) => (
        <path key={t.i} d={`M${t.x - 7} ${ground + 4} L${t.x} ${ground + 4 - t.h} L${t.x + 7} ${ground + 4}z`} fill={rock('#2F5F3A', '#0F2118')} />
      ))}
      {refuges.map((r) => (
        <g key={r.i}>
          <rect x={r.x} y={ground - 16} width={26} height={16} fill={rock('#8A5A3A', '#2E2018')} />
          <path d={`M${r.x - 3} ${ground - 16} L${r.x + 13} ${ground - 28} L${r.x + 29} ${ground - 16}z`} fill={rock('#5E3B26', '#20150F')} />
          <Lamp x={r.x + 9} y={ground - 11} u={r.u} minutes={minutes} dim={dim} />
        </g>
      ))}
    </g>
  );
}

export function SeaScene({ width, height, sky, minutes, seed }: SceneBodyProps): ReactElement {
  const horizon = height * 0.5;
  const dim = 1 - sky.daylight;
  const water = tone('#3F8CC4', '#16224A', sky.daylight);
  const deep = tone('#2F78B0', '#0F1838', sky.daylight);
  const rng = mulberry32(seed ^ 0x5ea);
  const waves = Array.from({ length: Math.round(width / 28) }, (_, i) => ({ i, x: rng() * width, y: horizon + 8 + rng() * (height - horizon - 12), w: 18 + rng() * 34 }));
  const quay = Array.from({ length: Math.max(1, Math.round(width / 260)) }, (_, i) => ({ i, x: 40 + i * 260 + rng() * 120, u: rng() * 0.8 }));
  return (
    <g data-scene-body data-scene-art="sea">
      <rect x={0} y={horizon} width={width} height={height - horizon} fill={water} />
      <rect x={0} y={horizon + (height - horizon) * 0.45} width={width} height={(height - horizon) * 0.55} fill={deep} />
      <rect x={0} y={horizon} width={width} height={2} fill="#FFFFFF" opacity={0.35} />
      {waves.map((w) => (
        <rect key={w.i} x={w.x} y={w.y} width={w.w} height={2} fill="#FFFFFF" opacity={0.3 + 0.2 * sky.daylight} />
      ))}
      {/* Reflet du soleil ou de la lune : bande claire sous l'astre le plus haut */}
      <g opacity={0.25}>
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={width * (0.04 + 0.92 * (sky.sunFrac ?? sky.moonFrac ?? 0.5)) - 20 + i * 2} y={horizon + 4 + i * 14} width={40 - i * 3} height={3} fill="#FFF3B8" />
        ))}
      </g>
      {quay.map((q) => (
        <g key={q.i}>
          <rect x={q.x} y={horizon - 10} width={6} height={10} fill={tone('#6B5B45', '#241D18', sky.daylight)} />
          <Lamp x={q.x + 1} y={horizon - 9} w={4} h={4} u={q.u} minutes={minutes} dim={dim} color="#FFE08A" />
          <rect x={q.x + 12} y={horizon - 6} width={22} height={6} fill={tone('#8B7355', '#2A2118', sky.daylight)} />
        </g>
      ))}
    </g>
  );
}
```

- [ ] **Step 4: Brancher dans `scene-panorama.tsx`** — importer `{ CountrysideScene, MountainScene, SeaScene } from './scene-nature'` et remplacer `{scene === 'city' && <CityScene {...props} />}` par :

```tsx
      {scene === 'city' && <CityScene {...props} />}
      {scene === 'countryside' && <CountrysideScene {...props} />}
      {scene === 'mountain' && <MountainScene {...props} />}
      {scene === 'sea' && <SeaScene {...props} />}
```

- [ ] **Step 5: Lancer** — `npx vitest run tests/content/scene-nature.test.tsx tests/content/scene-panorama.test.tsx` → PASS. Remarque : l'import circulaire `scene-panorama` ↔ `scene-nature` n'est qu'un import de **type** (`SceneBodyProps`), sans effet à l'exécution.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add src/content/scene-nature.tsx src/content/scene-panorama.tsx tests/content/scene-nature.test.tsx
git commit -m "feat(bibliotheque): scènes Campagne, Montagne et Mer" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Scènes Espace et Terre

**Files:**
- Create: `src/content/scene-space.tsx`
- Modify: `src/content/scene-panorama.tsx`
- Test: `tests/content/scene-space.test.tsx` (jsdom)

**Interfaces:**
- Produces: `SpaceScene`, `EarthScene` : `(props: SceneBodyProps) => ReactElement`.

Règles : en Espace et Terre le ciel dégradé est remplacé par un fond noir fixe et les étoiles restent visibles quelle que soit l'heure ; ni soleil ni lune. `ScenePanorama` ne dessine donc `SkyAndStars`/`Celestial` que pour les scènes terrestres ; l'Espace et la Terre dessinent leurs propres étoiles.

- [ ] **Step 1: Tests qui échouent**

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenePanorama } from '../../src/content/scene-panorama';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import type { SceneId } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
const render = (scene: SceneId, minutes: number) =>
  act(() => root.render(<svg><ScenePanorama scene={scene} width={1080} height={340} sky={skyAt(minutes, times)} minutes={minutes} seed={9} /></svg>));

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Espace', () => {
  it('reste étoilé et sans soleil quelle que soit l’heure', () => {
    for (const minutes of [0, 13 * 60]) {
      render('space', minutes);
      expect(container.querySelector('[data-scene-art="space"]')).not.toBeNull();
      expect(container.querySelectorAll('[data-star]').length).toBeGreaterThan(20);
      expect(container.querySelector('[data-sun]')).toBeNull();
      expect(container.querySelector('[data-moon]')).toBeNull();
    }
  });
  it('a un satellite et une sonde', () => {
    render('space', 0);
    expect(container.querySelector('[data-actor][data-kind="satellite"]')).not.toBeNull();
  });
});

describe('Terre vue d’en haut', () => {
  it('montre la planète et la station', () => {
    render('earth', 13 * 60);
    expect(container.querySelector('[data-scene-art="earth"] [data-earth]')).not.toBeNull();
    expect(container.querySelector('[data-actor][data-kind="station"]')).not.toBeNull();
  });
  it('les villes lumineuses du côté nuit suivent l’activité', () => {
    const lit = (m: number): number => { render('earth', m); return container.querySelectorAll('[data-lamp][data-lit="true"]').length; };
    expect(lit(21 * 60)).toBeGreaterThan(lit(4 * 60));
  });
  it('la face éclairée change entre le jour et la nuit', () => {
    render('earth', 13 * 60);
    const day = container.querySelector('[data-earth]')!.getAttribute('fill');
    render('earth', 0);
    expect(container.querySelector('[data-earth]')!.getAttribute('fill')).not.toBe(day);
  });
});
```

- [ ] **Step 2: Lancer** → FAIL.

- [ ] **Step 3: `src/content/scene-space.tsx`**

```tsx
import type { ReactElement } from 'react';
import { lampLit } from '../core/library/activity';
import { mulberry32 } from '../core/library/scene-world';
import { mixHex } from '../core/library/sky';
import type { SceneBodyProps } from './scene-panorama';

function StarField({ width, height, seed, density = 8 }: { width: number; height: number; seed: number; density?: number }): ReactElement {
  const rng = mulberry32(seed ^ 0x57a2);
  const stars = Array.from({ length: Math.round(width / density) }, (_, i) => ({ i, x: rng() * width, y: rng() * height, r: 0.6 + rng() * 1.5, a: 0.5 + rng() * 0.5 }));
  return (
    <g>
      {stars.map((s) => (
        <circle key={s.i} data-star="" cx={s.x} cy={s.y} r={s.r} fill="#FFFFFF" opacity={s.a} />
      ))}
    </g>
  );
}

export function SpaceScene({ width, height, seed }: SceneBodyProps): ReactElement {
  const rng = mulberry32(seed ^ 0xa11);
  const bodies = Array.from({ length: Math.max(2, Math.round(width / 600)) }, (_, i) => ({ i, x: rng() * width, y: height * (0.15 + rng() * 0.55), r: 14 + rng() * 34, hue: ['#C9B28A', '#7FA8C9', '#C98A7F', '#9AC99F'][Math.floor(rng() * 4)]! }));
  return (
    <g data-scene-body data-scene-art="space">
      <rect x={0} y={0} width={width} height={height} fill="#050714" />
      <StarField width={width} height={height} seed={seed} />
      {bodies.map((b) => (
        <g key={b.i}>
          <circle cx={b.x} cy={b.y} r={b.r} fill={b.hue} />
          <circle cx={b.x - b.r * 0.3} cy={b.y - b.r * 0.2} r={b.r * 0.7} fill="#FFFFFF" opacity={0.12} />
          {b.i % 2 === 0 && <ellipse cx={b.x} cy={b.y} rx={b.r * 1.7} ry={b.r * 0.3} fill="none" stroke="#E8DCC0" strokeWidth={2} opacity={0.6} />}
        </g>
      ))}
    </g>
  );
}

// La Terre vue d'en haut : un grand disque au bas du monde. La face éclairée suit la lumière du jour ;
// côté nuit, des villes lumineuses s'allument et s'éteignent comme les fenêtres d'immeuble.
export function EarthScene({ width, height, sky, minutes, seed }: SceneBodyProps): ReactElement {
  const radius = Math.max(width, 900);
  const cx = width / 2;
  const cy = height + radius * 0.82;
  const rng = mulberry32(seed ^ 0xea27);
  const lands = Array.from({ length: Math.round(width / 70) }, (_, i) => ({ i, x: cx + (rng() - 0.5) * width, rx: 20 + rng() * 40, ry: 6 + rng() * 12, dy: 6 + rng() * 60 }));
  const cities = Array.from({ length: Math.round(width / 26) }, (_, i) => ({ i, x: cx + (rng() - 0.5) * width * 0.98, dy: 8 + rng() * 80, u: rng() }));
  const dim = 1 - sky.daylight;
  const surface = mixHex('#0E1A3A', '#2F6FB5', sky.daylight);
  const land = mixHex('#14281F', '#4E9A5A', sky.daylight);
  return (
    <g data-scene-body data-scene-art="earth">
      <rect x={0} y={0} width={width} height={height} fill="#03040C" />
      <StarField width={width} height={height} seed={seed} />
      <circle cx={cx} cy={cy} r={radius * 1.04} fill="#6FA8FF" opacity={0.18 + 0.2 * sky.daylight} />
      <circle data-earth="" cx={cx} cy={cy} r={radius} fill={surface} />
      {lands.map((l) => (
        <ellipse key={l.i} cx={l.x} cy={height - l.dy + 4} rx={l.rx} ry={l.ry} fill={land} />
      ))}
      {cities.map((c) => {
        const lit = lampLit(c.u, minutes);
        return <circle key={c.i} data-lamp="" data-lit={lit ? 'true' : 'false'} cx={c.x} cy={height - c.dy} r={1.4} fill="#FFD27A" opacity={lit ? dim : 0} style={{ transition: 'opacity 4s ease' }} />;
      })}
    </g>
  );
}
```

Note : le test « villes lumineuses » exige `lit(21h) > lit(4h)` — à 21 h, `dim = 1 - daylight` vaut 1 mais `data-lit` ne dépend que de l'activité (indépendant du jour), le test compte donc bien l'attribut.

- [ ] **Step 4: Brancher dans `scene-panorama.tsx`** — importer `{ EarthScene, SpaceScene }` ; ne rendre `SkyAndStars` et `Celestial` que pour les scènes terrestres :

```tsx
  const terrestrial = scene !== 'space' && scene !== 'earth';
  ...
      {terrestrial && <SkyAndStars {...props} />}
      {terrestrial && <Celestial {...props} />}
      ...
      {scene === 'space' && <SpaceScene {...props} />}
      {scene === 'earth' && <EarthScene {...props} />}
```

Adapter le test « contient le ciel » de la ville : inchangé (ville terrestre).

- [ ] **Step 5: Lancer** — `npx vitest run tests/content/scene-space.test.tsx tests/content/scene-panorama.test.tsx tests/content/scene-nature.test.tsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add src/content/scene-space.tsx src/content/scene-panorama.tsx tests/content/scene-space.test.tsx
git commit -m "feat(bibliotheque): scènes Espace et Terre vue d'en haut" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: La fenêtre dans la pièce (cadre, vitre sur le décor continu)

**Files:**
- Create: `src/content/window-art.tsx`
- Modify: `src/content/RoomView.tsx`, `src/content/furniture-drag.ts`
- Test: `tests/content/room-window.test.tsx` (jsdom), `tests/content/furniture-drag-window.test.ts`

**Interfaces:**
- Consumes: `ScenePanorama` (Tasks 7-9), `SceneTime` (Task 6), `hashString`.
- Produces:
  - `RoomView` accepte `sceneView?: { sky: Sky; minutes: number }` (sans lui : ciel d'après-midi par défaut). Le décor est tiré de `room.scene`, la graine de `hashString(room.id)`.
  - `WindowArt({ rect, palette, steampunk, worldId, clipId }: …)` dans `window-art.tsx`.
  - `dropTargetFor` gère `item.kind === 'window'` (même logique que `wall`, avec `item.w`/`item.h`).

- [ ] **Step 1: Tests qui échouent**

`tests/content/furniture-drag-window.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { Layout } from '../../src/core/library/library-types';
import { dropTargetFor } from '../../src/content/furniture-drag';

const layout: Layout = [
  { id: 'w1', kind: 'window', col: 2, row: 1, w: 6, h: 5 },
  { id: 'p1', kind: 'wall', shape: 'poster', col: 14, row: 1, slug: 'a' },
];

describe('dropTargetFor — fenêtre', () => {
  it('la case visée est le coin bas-gauche, la fenêtre garde sa taille', () => {
    const target = dropTargetFor(layout, 24, 'w1', 4, 6);
    expect(target.ok).toBe(true);
    expect(target.ghost).toEqual({ col: 4, row: 2, w: 6, h: 5 });
    expect(target.col).toBe(4);
    expect(target.top).toBe(2);
  });

  it('refuse un chevauchement avec un autre objet mural', () => {
    const target = dropTargetFor(layout, 24, 'w1', 14, 5);
    expect(target.ok).toBe(false);
    expect(target.reason).toBe('taken');
    expect(target.cells.length).toBeGreaterThan(0);
  });

  it('refuse un dépôt dans le sol', () => {
    expect(dropTargetFor(layout, 24, 'w1', 4, 16).ok).toBe(false);
  });
});
```

`tests/content/room-window.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomView } from '../../src/content/RoomView';
import { createInitialState, activeRoom, setRoomScene, updateLayout } from '../../src/core/library/library-book';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function show(windows: number, scene: 'city' | 'sea' = 'city') {
  let state = setRoomScene(createInitialState(), 'r1', scene);
  state = updateLayout(state, 'r1', () => Array.from({ length: windows }, (_, i) => ({ id: `w${i}`, kind: 'window' as const, col: 2 + i * 10, row: 1, w: 6 + i * 2, h: 5 })));
  act(() =>
    root.render(<RoomView room={activeRoom(state)} editing={false} cellsActive={false} selectedId={null} blink={[]} onCell={() => undefined} onPick={() => undefined} sceneView={{ sky: skyAt(13 * 60, times), minutes: 13 * 60 }} />),
  );
}

describe('RoomView — fenêtres', () => {
  it('sans fenêtre, aucun décor n’est dessiné', () => {
    show(0);
    expect(container.querySelector('[data-panorama]')).toBeNull();
  });

  it('deux fenêtres partagent UN SEUL décor', () => {
    show(2);
    expect(container.querySelectorAll('[data-panorama]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-furniture="window"]')).toHaveLength(2);
    const uses = container.querySelectorAll('use[data-window-view]');
    expect(uses).toHaveLength(2);
    expect(uses[0]!.getAttribute('href')).toBe(uses[1]!.getAttribute('href'));
  });

  it('chaque vitre est découpée à la taille de sa fenêtre', () => {
    show(2);
    const clips = Array.from(container.querySelectorAll('clipPath rect'));
    expect(clips).toHaveLength(2);
    const widths = clips.map((r) => Number(r.getAttribute('width')));
    expect(widths[1]!).toBeGreaterThan(widths[0]!);
  });

  it('le décor suit la scène de la pièce', () => {
    show(1, 'sea');
    expect(container.querySelector('[data-panorama][data-scene="sea"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Lancer** → FAIL.

- [ ] **Step 3: `dropTargetFor`** — dans `furniture-drag.ts`, importer `canHangRect` et ajouter avant le test `item.kind === 'wall'` :

```ts
  if (item.kind === 'window') {
    const top = row - item.h + 1;
    const ghost: Rect = { col, row: top, w: item.w, h: item.h };
    const check = canHangRect(layout, cols, item.w, item.h, col, top, id);
    if (check.ok) return { ok: true, cells: [], ghost, col, top };
    return { ok: false, reason: check.reason, cells: check.cells, ghost, col, top };
  }
```

- [ ] **Step 4: `src/content/window-art.tsx`**

```tsx
import type { ReactElement } from 'react';
import type { PxRect } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';

const GLASS_INSET = 7;

// Zone de la vitre (là où le décor se voit), en pixels de la pièce.
export const glassRect = (rect: PxRect): PxRect => ({ x: rect.x + GLASS_INSET, y: rect.y + GLASS_INSET, w: rect.w - 2 * GLASS_INSET, h: rect.h - 2 * GLASS_INSET });

type Props = { rect: PxRect; palette: Palette; steampunk: boolean; worldHref: string; clipId: string };

// Une fenêtre : le décor commun vu à travers un cadre. Le décor est le MÊME `<g>` pour toutes les fenêtres (`<use>`) :
// ce qu'on voit à gauche et à droite se raccorde, et un passant traverse l'une puis l'autre.
export function WindowArt({ rect, palette, steampunk, worldHref, clipId }: Props): ReactElement {
  const glass = glassRect(rect);
  const frame = steampunk ? '#B5833A' : palette.skirt;
  const edge = steampunk ? '#6E4A1E' : palette.edge;
  const bars: ReactElement[] = [];
  if (glass.w >= 120) bars.push(<rect key="v" x={glass.x + glass.w / 2 - 2} y={glass.y} width={4} height={glass.h} fill={frame} />);
  if (glass.h >= 110) bars.push(<rect key="h" x={glass.x} y={glass.y + glass.h / 2 - 2} width={glass.w} height={4} fill={frame} />);
  const rivets: ReactElement[] = steampunk
    ? [
        [rect.x + 3.5, rect.y + 3.5],
        [rect.x + rect.w - 3.5, rect.y + 3.5],
        [rect.x + 3.5, rect.y + rect.h - 3.5],
        [rect.x + rect.w - 3.5, rect.y + rect.h - 3.5],
      ].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={2} fill="#E8C57A" stroke={edge} strokeWidth={0.6} />)
    : [];
  return (
    <g data-window-art="">
      <rect x={glass.x} y={glass.y} width={glass.w} height={glass.h} fill="#9CC4E8" />
      <g clipPath={`url(#${clipId})`}>
        <use data-window-view="" href={worldHref} />
      </g>
      {bars}
      <rect x={rect.x + 3} y={rect.y + 3} width={rect.w - 6} height={rect.h - 6} rx={steampunk ? 14 : 3} fill="none" stroke={frame} strokeWidth={GLASS_INSET - 1} />
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={steampunk ? 16 : 4} fill="none" stroke={edge} strokeWidth={1.2} />
      <rect x={rect.x - 6} y={rect.y + rect.h} width={rect.w + 12} height={7} rx={2} fill={frame} stroke={edge} strokeWidth={1} />
      {rivets}
    </g>
  );
}
```

Remarque : pour la fenêtre Steampunk le `clipPath` doit lui aussi être arrondi — voir Step 5 (le `rx` du clip suit `steampunk`).

- [ ] **Step 5: `RoomView.tsx`**

1. Imports : `useId` depuis `react`, `ScenePanorama` depuis `./scene-panorama`, `WindowArt, glassRect` depuis `./window-art`, `hashString` depuis `../core/library/scene-world`, type `Sky` depuis `../core/library/sky`.
2. Props : `sceneView?: { sky: Sky; minutes: number };`. Dans le composant, après `const wallH = …` :

```tsx
  const worldId = `${useId()}-world`.replace(/:/g, '');
  const windows = room.layout.filter((p): p is Extract<Placed, { kind: 'window' }> => p.kind === 'window');
  // Sans heure fournie (test, premier rendu) : milieu d'après-midi.
  const view = sceneView ?? { sky: skyAt(15 * 60, { kind: 'normal', sunrise: 360, sunset: 1200 }), minutes: 15 * 60 };
```
(importer `skyAt` depuis `../core/library/sky` ; le hook `useId` doit être appelé avant tout retour anticipé — il n'y en a pas dans `RoomView`.)
3. Dans `renderPlaced`, avant la branche `else` qui lit `rectOf(placed)` pour un meuble debout, ajouter (au même niveau que `computer` et `small`) :

```tsx
    } else if (placed.kind === 'window') {
      rect = pxRect({ col: placed.col, row: placed.row, w: placed.w, h: placed.h });
      art = <WindowArt rect={rect} palette={palette} steampunk={steampunk} worldHref={`#${worldId}`} clipId={`${worldId}-clip-${placed.id}`} />;
    } else {
```
4. `ordered` : placer les fenêtres en premier : `const ordered = [...room.layout.filter((p) => p.kind === 'window'), ...standing.filter(rug), …]`.
5. Dans le `<svg>`, juste après `<RoomBackdrop …/>` et le décor Steampunk, ajouter :

```tsx
      {windows.length > 0 && (
        <defs>
          <g id={worldId}>
            <ScenePanorama scene={room.scene} width={width} height={wallH} sky={view.sky} minutes={view.minutes} seed={hashString(room.id)} />
          </g>
          {windows.map((w) => {
            const glass = glassRect(pxRect({ col: w.col, row: w.row, w: w.w, h: w.h }));
            return (
              <clipPath key={w.id} id={`${worldId}-clip-${w.id}`}>
                <rect x={glass.x} y={glass.y} width={glass.w} height={glass.h} rx={steampunk ? 10 : 0} />
              </clipPath>
            );
          })}
        </defs>
      )}
```
Les `clipPath` sont dans `<defs>` avant les `<use>` rendus dans `ordered`.

- [ ] **Step 6: Lancer** — `npx vitest run tests/content/room-window.test.tsx tests/content/furniture-drag-window.test.ts tests/content --maxWorkers=4` → PASS ; `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add src/content tests/content
git commit -m "feat(bibliotheque): fenêtre ouverte sur le décor continu de la pièce" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Poser, déplacer, redimensionner la fenêtre ; panneau « Ciel »

**Files:**
- Modify: `src/content/LibraryPanel.tsx`
- Test: `tests/content/library-window.test.tsx` (jsdom) — attention : `src/content/library-window.tsx` existe déjà et concerne une autre fonction (« Ma Pièce ») ; nommer le test `library-window-furniture.test.tsx`.

**Interfaces:**
- Consumes: `placeWindow`, `moveWindow`, `resizeWindow`, `windowFit`, `canHangRect` (T1), `setRoomScene`, `setTimeSetting` (T2), `useSceneTime` (T6), `requestPosition` (T6), `formatMinutes` (T3), `SCENE_IDS`.
- Produces (DOM, utilisé par les tests et la visite guidée) : boutons `data-kind="window"`, `data-action="win-w-"`, `"win-w+"`, `"win-h-"`, `"win-h+"` (visibles quand une fenêtre est sélectionnée en Aménager) ; groupe `role="group" aria-label="Ciel"` avec `button[data-scene="city|countryside|mountain|sea|space|earth"]`, `button[data-time="real|day|night|manual"]`, `input[data-time-slider]` (visible en heure manuelle) et `[data-sun-times]`.

- [ ] **Step 1: Tests qui échouent** — `tests/content/library-window-furniture.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import { activeRoom } from '../../src/core/library/library-book';
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
const room = () => activeRoom(repo.current()!);
const windows = () => room().layout.filter((p) => p.kind === 'window');

beforeEach(async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
  await click('[data-action="edit"]');
});
afterEach(() => {
  vi.unstubAllGlobals();
  act(() => root.unmount());
  container.remove();
});

async function placeWindow() {
  await click('[data-category="deco"]');
  await click('[data-kind="window"]');
  await click('[data-cell="3-6"]');
}

describe('fenêtre — pose et taille', () => {
  it('se pose en 6×5 : la case touchée est son coin bas-gauche', async () => {
    await placeWindow();
    expect(windows()).toEqual([{ id: 'f1', kind: 'window', col: 3, row: 2, w: 6, h: 5 }]);
  });

  it('se sélectionne et s’agrandit / se réduit avec les boutons', async () => {
    await placeWindow();
    await click('[data-furniture="window"]');
    await click('[data-action="win-w+"]');
    await click('[data-action="win-h+"]');
    expect(windows()[0]).toMatchObject({ w: 7, h: 6 });
    await click('[data-action="win-w-"]');
    await click('[data-action="win-h-"]');
    expect(windows()[0]).toMatchObject({ w: 6, h: 5 });
  });

  it('refuse de rétrécir sous 3×3 et de dépasser 12×10', async () => {
    await placeWindow();
    await click('[data-furniture="window"]');
    for (let i = 0; i < 6; i++) await click('[data-action="win-w-"]');
    expect(windows()[0]!.w).toBe(3);
    for (let i = 0; i < 12; i++) await click('[data-action="win-w+"]');
    expect(windows()[0]!.w).toBe(12);
  });

  it('refuse un agrandissement qui chevauche un autre objet et fait clignoter les cases', async () => {
    await placeWindow();
    await click('[data-kind="window"]');
    await click('[data-cell="12-6"]');
    expect(windows()).toHaveLength(2);
    await click('[data-furniture="window"][data-id="f1"]');
    for (let i = 0; i < 3; i++) await click('[data-action="win-w+"]');
    expect(windows().find((w) => w.id === 'f1')!.w).toBeLessThan(10);
    expect(q('[role="status"]')!.textContent).toMatch(/occupé|place/i);
  });

  it('se retire', async () => {
    await placeWindow();
    await click('[data-furniture="window"]');
    await click('[data-action="remove"]');
    expect(windows()).toHaveLength(0);
  });

  it('se déplace avec « Déplacer »', async () => {
    await placeWindow();
    await click('[data-furniture="window"]');
    await click('[data-action="move"]');
    await click('[data-cell="15-6"]');
    expect(windows()[0]).toMatchObject({ col: 15, row: 2 });
  });
});

describe('panneau Ciel', () => {
  it('change la scène de la pièce', async () => {
    expect(q('[role="group"][aria-label="Ciel"]')).not.toBeNull();
    await click('[data-scene="sea"]');
    expect(room().scene).toBe('sea');
  });

  it('règle l’heure globale et montre le curseur en heure manuelle', async () => {
    expect(q('[data-time-slider]')).toBeNull();
    await click('[data-time="manual"]');
    expect(repo.current()!.time.mode).toBe('manual');
    expect(q('[data-time-slider]')).not.toBeNull();
    await click('[data-time="night"]');
    expect(repo.current()!.time).toEqual({ mode: 'night' });
  });

  it('affiche le lever et le coucher du jour', () => {
    expect(q('[data-sun-times]')!.textContent).toMatch(/\d\d:\d\d.*\d\d:\d\d/s);
  });

  it('choisir « Heure réelle » demande la position (accord du joueur)', async () => {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    await click('[data-time="night"]');
    await click('[data-time="real"]');
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('le panneau n’existe qu’en mode Aménager', async () => {
    await click('[data-action="visit"]');
    expect(q('[role="group"][aria-label="Ciel"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer** → FAIL.

- [ ] **Step 3: `LibraryPanel.tsx` — imports et état de l'heure**

1. Imports ajoutés : `setRoomScene, setTimeSetting` (library-book) ; `WINDOW_MAX, WINDOW_MIN` (furniture-catalog) ; `SCENE_IDS, type SceneId, type TimeSetting` (library-types) ; `canHangRect, moveWindow, placeWindow, resizeWindow, windowFit` (room-grid) ; `formatMinutes` (`../core/library/time-setting`) ; `sunTimes`-lié : le hook renvoie `times` ; `useSceneTime` et `requestPosition`.
2. Le hook doit être appelé **avant** `if (!lib) return …` : après `useEffect(() => press.cancel, [press]);` ajouter
   `const sceneTime = useSceneTime(lib?.time ?? { mode: 'real' });`
3. Icônes dans `ICONS` (viewBox 24) :
```ts
  sun: ['M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z'],
  clock: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  sliders: ['M4 6h10', 'M18 6h2', 'M4 12h2', 'M10 12h10', 'M4 18h12', 'M20 18h0', 'M14 4v4', 'M6 10v4', 'M16 16v4'],
  widthMinus: ['M3 12h6', 'M21 12h-6', 'M9 8l-4 4 4 4', 'M15 8l4 4-4 4'],
  widthPlus: ['M9 12H3', 'M15 12h6', 'M5 8l4 4-4 4', 'M19 8l-4 4 4 4'],
  heightMinus: ['M12 3v6', 'M12 21v-6', 'M8 9l4-4 4 4', 'M8 15l4 4 4-4'],
  heightPlus: ['M12 9V3', 'M12 15v6', 'M8 5l4 4 4-4', 'M8 19l4-4 4 4'],
```
   (glyphes de flèches : largeur − = flèches vers l'intérieur, + = vers l'extérieur.) Ajouter une table `SCENE_ICON: Record<SceneId, readonly string[]>` :
```ts
const SCENE_ICON: Record<SceneId, readonly string[]> = {
  city: ['M4 21V9h6v12', 'M10 21V4h6v17', 'M16 21v-8h4v8', 'M3 21h18'],
  countryside: ['M2 18c4-6 8-6 10-2 2-4 6-4 10 2', 'M3 21h18', 'M12 6v4', 'M10 8h4'],
  mountain: ['M2 20l7-12 4 6 3-4 6 10z', 'M9 8l2 3'],
  sea: ['M2 14c3-3 5 3 8 0s5 3 8 0 3-1 4 0', 'M2 19c3-3 5 3 8 0s5 3 8 0 3-1 4 0', 'M16 5a3 3 0 1 0 0 0.1'],
  space: ['M12 3l2 5 5 .5-4 3.5 1.5 5L12 14l-4.5 3 1.5-5L5 8.5 10 8z'],
  earth: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z', 'M3 12h18', 'M12 3c3 3 3 15 0 18', 'M12 3c-3 3-3 15 0 18'],
};
const SCENE_LABEL: Record<SceneId, string> = { city: 'Ville', countryside: 'Campagne', mountain: 'Montagne', sea: 'Mer', space: 'Espace', earth: 'Terre vue d’en haut' };
```

- [ ] **Step 4: Pose, déplacement, dépôt**

1. `REASONS` : inchangé (les raisons de `canHangRect` sont les mêmes).
2. `dropLifted` : avant la branche `item?.kind === 'wall'`, ajouter
```ts
      } else if (item?.kind === 'window' && target.col !== undefined && target.top !== undefined) {
        const { col, top } = target;
        void editLayout((l, cols) => moveWindow(l, cols, id, col, top));
```
3. `placeWall(col,row)` ne gère que des formes de carte ; ajouter une fonction à côté :

```ts
  // Fenêtre posée (outil « new ») ou déplacée : la case touchée est son coin bas-gauche.
  async function placeWindowAt(col: number, row: number): Promise<void> {
    if (!tool) return;
    const moving = tool.type === 'move' && movingItem?.kind === 'window' ? movingItem : null;
    const { w, h } = moving ?? { w: 6, h: 5 };
    const top = row - h + 1;
    const check = canHangRect(layout, room.cols, w, h, col, top, moving?.id);
    if (!check.ok) return refuse(REASONS[check.reason], check.cells);
    if (moving) await editLayout((l, cols) => moveWindow(l, cols, moving.id, col, top));
    else await editLayout((l, cols) => placeWindow(l, cols, col, top, nextFurnitureId(l)));
    reset();
  }
```
   Pour que `{w,h}` par défaut ne soit pas codé en dur, importer `WINDOW_DEFAULT` et écrire `?? WINDOW_DEFAULT`.
4. `onCell` : après `if (!tool) return;` ajouter
```ts
    if ((tool.type === 'new' && tool.kind === 'window') || movingItem?.kind === 'window') return placeWindowAt(col, row);
```
5. `startNew` : le message final devient, pour la fenêtre, `Touchez la case du mur où poser la fenêtre (son coin bas gauche).` : ajouter `kind === 'window' ? '…' :` dans la chaîne conditionnelle existante, avant le dernier cas.
6. `startMove` : `item?.kind === 'window'` suit la branche mur (`item?.kind === 'wall' || item?.kind === 'window'`).

- [ ] **Step 5: Redimensionnement** — dans le composant, après `removeSelected` :

```ts
  const selectedWindow = editing ? layout.find((p) => p.id === selectedId && p.kind === 'window') : undefined;
  const resizeSelected = (dw: number, dh: number): void => {
    if (!selectedWindow || selectedWindow.kind !== 'window') return;
    const w = selectedWindow.w + dw;
    const h = selectedWindow.h + dh;
    const check = windowFit(layout, room.cols, selectedWindow.id, w, h);
    if (!check.ok) {
      const limit = w < WINDOW_MIN.w || h < WINDOW_MIN.h ? 'La fenêtre ne peut pas être plus petite.' : w > WINDOW_MAX.w || h > WINDOW_MAX.h ? 'La fenêtre ne peut pas être plus grande.' : REASONS[check.reason];
      return refuse(limit, check.cells);
    }
    setMessage('');
    void editLayout((l, cols) => resizeWindow(l, cols, selectedWindow.id, w, h));
  };
```
   et dans la rangée d'outils, après les boutons « Déplacer »/« Retirer » (dans le bloc `{selectedId && (…)}`), ajouter quand `selectedWindow` :

```tsx
              {selectedWindow && (
                <>
                  <Btn label="Fenêtre plus étroite" data={{ action: 'win-w-' }} onClick={() => resizeSelected(-1, 0)}><Icon paths={ICONS.widthMinus} /></Btn>
                  <Btn label="Fenêtre plus large" data={{ action: 'win-w+' }} onClick={() => resizeSelected(1, 0)}><Icon paths={ICONS.widthPlus} /></Btn>
                  <Btn label="Fenêtre moins haute" data={{ action: 'win-h-' }} onClick={() => resizeSelected(0, -1)}><Icon paths={ICONS.heightMinus} /></Btn>
                  <Btn label="Fenêtre plus haute" data={{ action: 'win-h+' }} onClick={() => resizeSelected(0, 1)}><Icon paths={ICONS.heightPlus} /></Btn>
                </>
              )}
```

- [ ] **Step 6: Panneau « Ciel »** — après la rangée « Style de la pièce » (même condition `editing`) :

```tsx
      {editing && (
        <div className="wmt-lib-row" role="group" aria-label="Ciel">
          {SCENE_IDS.map((id) => (
            <Btn key={id} label={SCENE_LABEL[id]} pressed={room.scene === id} data={{ scene: id }} onClick={() => void library.update((state) => setRoomScene(state, room.id, id))}>
              <Icon paths={SCENE_ICON[id]} />
            </Btn>
          ))}
          <span className="wmt-lib-sep" />
          {(
            [
              ['real', 'Heure réelle', ICONS.clock],
              ['day', 'Toujours le jour', ICONS.sun],
              ['night', 'Toujours la nuit', ICONS.moon],
              ['manual', 'Choisir l’heure', ICONS.sliders],
            ] as const
          ).map(([mode, label, icon]) => (
            <Btn key={mode} label={label} pressed={lib.time.mode === mode} data={{ time: mode }} onClick={() => chooseTime(mode)}>
              <Icon paths={icon} />
            </Btn>
          ))}
          {lib.time.mode === 'manual' && (
            <input
              type="range"
              data-time-slider=""
              aria-label="Heure"
              min={0}
              max={1439}
              step={5}
              value={lib.time.minutes}
              onChange={(event) => { const minutes = Number(event.currentTarget.value); void library.update((state) => setTimeSetting(state, { mode: 'manual', minutes })); }}
            />
          )}
          <span className="wmt-lib-msg" data-sun-times="">
            {sceneTime.times.kind === 'normal' ? `☀ ${formatMinutes(sceneTime.times.sunrise)} → ${formatMinutes(sceneTime.times.sunset)}` : sceneTime.times.polar === 'day' ? '☀ jour permanent' : '☾ nuit permanente'}
            {` · ${formatMinutes(sceneTime.minutes)}`}
          </span>
        </div>
      )}
```

   Fonction `chooseTime` (près de `chooseOrientation`) :

```ts
  const chooseTime = (mode: TimeSetting['mode']): void => {
    reset();
    const next: TimeSetting = mode === 'manual' ? { mode, minutes: sceneTime.minutes } : { mode };
    // « Heure réelle » : le navigateur demande alors l'accord de position (sans accord, le fuseau horaire suffit).
    if (mode === 'real') void requestPosition();
    void library.update((state) => setTimeSetting(state, next));
  };
```

   Le test « choisir Heure réelle » : la valeur initiale est déjà `real` ; le test passe d'abord par `night` puis `real`, donc `requestPosition` est appelé exactement une fois.

- [ ] **Step 7: Passer le ciel à la pièce** — dans le `<RoomView … />` ajouter `sceneView={{ sky: sceneTime.sky, minutes: sceneTime.minutes }}`.

- [ ] **Step 8: Lancer** — `npx vitest run tests/content/library-window-furniture.test.tsx tests/content --maxWorkers=4` puis `npx tsc --noEmit` → PASS. Si un test existant du sélecteur de style compte les groupes `role="group"` en Aménager, ajuster (le groupe « Ciel » est nouveau).

- [ ] **Step 9: Commit**

```bash
git branch --show-current
git add src/content/LibraryPanel.tsx tests/content/library-window-furniture.test.tsx
git commit -m "feat(bibliotheque): poser, déplacer et redimensionner la fenêtre, panneau Ciel (scène et heure)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Fiche WikiHow `bibliotheque-v7`, vérification, build, PR

**Files:**
- Modify: `src/core/whats-new/entries.ts` (ajout d'une entrée à la fin du tableau, après `bibliotheque-v6`)
- Test: les tests existants des entrées (`npx vitest run tests/core/whats-new`)

- [ ] **Step 1: Ajouter l'entrée** avant le `];` final :

```ts
  {
    id: 'bibliotheque-v7',
    theme: 'collection',
    glyph: '🪟',
    title: 'Une fenêtre sur le monde',
    summary: 'Fenêtre réglable, six décors, heure et vie de la ville',
    steps: [
      {
        target: '[data-wmt-library] button[data-kind="window"]',
        title: 'Poser une fenêtre',
        text: 'La catégorie Déco propose une fenêtre. Elle s’accroche au mur comme un poster, en 6 cases sur 5 ; touchez la case du mur qui sera son coin bas gauche.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Passez en mode Aménager, ouvrez la catégorie Déco, touchez la fenêtre puis une case du mur. Touchez ensuite la fenêtre posée : quatre boutons la rendent plus large, plus étroite, plus haute ou moins haute (de 3×3 à 12×10 cases).' },
          { label: 'À quoi ça sert', text: 'À ouvrir votre pièce sur un paysage. Plusieurs fenêtres donnent sur un seul et même décor : un passant qui sort par l’une apparaît dans l’autre après le délai que prend la distance.' },
          { label: 'Limites', text: 'Une fenêtre ne peut pas chevaucher un autre objet mural ni un meuble. Agrandir la pièce à gauche décale les fenêtres, mais pas le paysage.' },
        ],
        scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library-entry]', '[data-wmt-library] [data-action="edit"]'] },
      },
      {
        target: '[data-wmt-library] [role="group"][aria-label="Ciel"]',
        title: 'Choisir le paysage et l’heure',
        text: 'En mode Aménager, la rangée Ciel propose six paysages (ville, campagne, montagne, mer, espace, Terre vue d’en haut) et l’heure : réelle, toujours le jour, toujours la nuit, ou choisie au curseur.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Touchez un paysage pour la pièce affichée ; l’heure, elle, est la même pour toute la Bibliothèque. En heure réelle, le navigateur peut demander votre position pour calculer le lever et le coucher du soleil.' },
          { label: 'À quoi ça sert', text: 'Le soleil et la lune traversent le ciel, et le lever et le coucher du jour sont affichés. Les calculs se font sur votre appareil, rien n’est envoyé ; sans position, le fuseau horaire sert de repli.' },
          { label: 'Limites', text: 'Pas encore de météo ni d’événements : ils arrivent plus tard. L’espace et la Terre ne suivent pas le soleil.' },
        ],
        scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library-entry]', '[data-wmt-library] [data-action="edit"]'] },
      },
      {
        target: '[data-wmt-library] button[data-time="manual"]',
        title: 'La ville vit selon l’heure',
        text: 'En ville, les fenêtres des immeubles s’allument et s’éteignent selon l’heure : beaucoup de lumières en début de soirée, presque plus vers trois heures du matin. Les passants et les voitures suivent la même courbe.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Touchez le curseur d’heure (le glyphe à curseurs) puis faites-le glisser pour voir les lumières s’allumer en cascade au crépuscule et s’éteindre dans la nuit.' },
          { label: 'À quoi ça sert', text: 'À une pièce qui change vraiment au fil de la journée, sans rien à faire.' },
        ],
        scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library-entry]', '[data-wmt-library] [data-action="edit"]'] },
      },
    ],
  },
```

- [ ] **Step 2: Suite complète** — `npx vitest run --maxWorkers=4` puis `npx tsc --noEmit` puis `npm run build`. Expected: tout vert. Corriger les tests de comptage d'entrées de visite/WikiHow si besoin.

- [ ] **Step 3: Vérification visuelle (navigateur)** — après `npm run build`, charger `.output/chrome-mv3` dans Chrome (ou le banc `.superpowers/harness` s'il existe), ouvrir Collection → Ma Pièce → Aménager : poser deux fenêtres de tailles différentes, vérifier le raccord du décor, les six scènes, le curseur d'heure (lumières en cascade, lune et soleil qui traversent), le redimensionnement, l'accord de position. Noter ce qui reste à vérifier à la main (APK, rendu sur mobile).

- [ ] **Step 4: Commit, PR, fusion, pré-prod** (mémoire projet : PR ouverte ET fusionnée sans demander, puis `npm run preprod`)

```bash
git branch --show-current
git add src/core/whats-new/entries.ts
git commit -m "docs(bibliotheque): fiche WikiHow bibliotheque-v7 (fenêtre, paysages, heure)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin feat/bibliotheque-fenetre
gh pr create --title "feat(bibliotheque): fenêtre, six décors, heure et vie de la ville (morceau 5a)" --body "Implémente docs/superpowers/specs/2026-10-08-bibliotheque-fenetre-design.md. Fenêtre de taille réglable (3×3 à 12×10) sur un décor continu partagé, six scènes, heure globale (réelle, jour, nuit, manuelle) avec lever/coucher calculés localement, lumières et passants selon l'heure. Reste : vérification manuelle Chrome + APK à la demande. 🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
Puis fusionner la PR, `git checkout --detach origin/main`, relancer les tests sur le résultat fusionné, `npm run build`, `npm run preprod`, et mettre à jour la mémoire `project_bibliotheque.md` (morceau 5a fusionné, pré-prod, ce qui reste).

---

## Self-Review

- **Couverture de la spec** : fenêtre + taille (T1, T11), état v3 + migration + fenêtres validées (T2), ciel/lever/coucher/repli fuseau (T3, T6), activité lumières/passants (T4, T7–T9), décor continu et délai entre fenêtres (T5, T7, T10), six scènes (T7–T9), panneau Ciel, heure globale, géolocalisation sur choix explicite (T11), cadre Steampunk (T10), performance (une horloge murale, rAF 30 i/s, pause onglet caché, mouvement réduit : T7), WikiHow (T12). Hors périmètre respecté (météo, dirigeables, événements).
- **Écart assumé avec la spec** : la spec dit que « accord donné » est conservé ; ici le navigateur retient lui-même l'autorisation et l'extension ne stocke rien (plus simple, même effet).
- **Limite connue** : agrandir la pièce à gauche décale les fenêtres mais pas le paysage (les bandes sont indexées depuis le bord gauche) ; agrandir à droite ne change rien à l'existant. À signaler dans la fiche (fait en T12).
- **Cohérence des types** : `Sky`, `SunTimes`, `Actor`, `SceneBodyProps`, `PanoramaProps`, `canHangRect`, `windowFit`, `resizeWindow` utilisés avec les mêmes noms dans toutes les tâches.
