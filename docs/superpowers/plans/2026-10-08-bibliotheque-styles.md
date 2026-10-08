# Bibliothèque — morceau 4 (styles et décor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer les 8 styles de pièce (7 nouveaux) avec sélecteur, décor propre à chacun, liseré Néon, et le Steampunk complet (décor animé, meubles redessinés, 3 meubles exclusifs).

**Architecture:** `styles.ts` porte les palettes et un descripteur de décor par style. Un composant `RoomBackdrop` dessine mur, sol et plinthe en motifs SVG (`<pattern>`), le décor Steampunk animé est un composant à part. Le catalogue filtre les meubles exclusifs par style. Aucun changement de version de l'état.

**Tech Stack:** React 18, SVG/SMIL, zod, Vitest (jsdom), TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-08-bibliotheque-styles-design.md` (vision : `2026-10-08-bibliotheque-design.md`, morceau 4).

## Global Constraints

- Texte d'interface en français, glyphes SVG plutôt que du texte dans les boutons (les `Btn` ont `aria-label` + `title`).
- Aucun accès réseau, aucune image externe : tout est dessiné en SVG.
- Un état existant (`version: 2`) reste lisible tel quel ; `Room.style` existe déjà.
- Le style d'une pièce ne change pas les cartes (affiches, dos, écran) : seul leur cadre suit la palette.
- Animations : SMIL/CSS uniquement, coupées si `prefers-reduced-motion: reduce`, mises en pause quand `document.hidden`.
- Code lisible comme l'existant : commentaires en français, courts, sur le « pourquoi ».
- Vérifications avant chaque commit de tâche : `npx vitest run <fichiers de test de la tâche>` puis `npm run typecheck`.
- Commits : message `feat(bibliotheque): …` ou `test(…)`, terminés par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: Palettes et descripteurs de décor des 8 styles

**Files:**
- Modify: `src/core/library/styles.ts`
- Create: `tests/core/library/styles.test.ts`

**Interfaces:**
- Produces: `STYLE_LABELS: Record<StyleId, string>`, `type WallPattern`, `type FloorPattern`, `type Decor = { wall: WallPattern; floor: FloorPattern; accent: string; glow?: string }`, `decorOf(id: StyleId): Decor`, `paletteOf(id)` (inchangé, mais renvoie la palette propre de chaque style).

- [ ] **Step 1: Écrire le test**

```ts
import { describe, expect, it } from 'vitest';
import { STYLE_IDS } from '../../../src/core/library/library-types';
import { STYLE_LABELS, decorOf, paletteOf } from '../../../src/core/library/styles';

describe('styles', () => {
  it('chaque style a une palette complète et distincte de Scandinave', () => {
    const base = paletteOf('scandinave');
    for (const id of STYLE_IDS) {
      const palette = paletteOf(id);
      for (const key of Object.keys(base) as (keyof typeof base)[]) {
        expect(palette[key], `${id}.${key}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
      if (id !== 'scandinave') expect(palette.wall, id).not.toBe(base.wall);
    }
  });

  it('chaque style a un nom et un décor ; seul Néon a un halo', () => {
    for (const id of STYLE_IDS) {
      expect(STYLE_LABELS[id], id).not.toBe('');
      expect(decorOf(id).accent, id).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    expect(STYLE_IDS.filter((id) => decorOf(id).glow !== undefined)).toEqual(['neon']);
    expect(decorOf('steampunk')).toMatchObject({ wall: 'brass', floor: 'plates' });
  });
});
```

- [ ] **Step 2: Lancer et constater l'échec**

Run: `npx vitest run tests/core/library/styles.test.ts` — Expected: FAIL (`STYLE_LABELS` absent).

- [ ] **Step 3: Implémenter** — dans `styles.ts`, remplacer le bloc `PALETTES` final (et son commentaire « en attendant ») par :

```ts
const variant = (overrides: Partial<Palette>): Palette => ({ ...SCANDINAVE, ...overrides });

const PALETTES: Record<StyleId, Palette> = {
  scandinave: SCANDINAVE,
  moderne: variant({ wall: '#E9ECEF', floor: '#B8BEC6', skirt: '#FFFFFF', wood: '#9AA3AD', woodDark: '#7C8691', desk: '#F2F4F6', leg: '#4A5058', edge: '#AEB6BF', text: '#6B737C', fabric: '#4A6FA5', fabricLight: '#6283B8', fabricDark: '#3A5A8A', warm: '#2F3A46', warmLight: '#46525F', warmDark: '#222B34', leaf: '#4FA37C', leafDark: '#3F8C69', rug: '#CBD3DC', shade: '#FFF3C4', metal: '#C0C6CC', door: '#38424C' }),
  industriel: variant({ wall: '#8C8C88', floor: '#5E5A55', skirt: '#3E3C39', wood: '#8B6B4A', woodDark: '#6C5238', desk: '#A27C55', leg: '#2B2B2B', edge: '#4D4A46', text: '#D9D9D6', fabric: '#6B4F3A', fabricLight: '#80614A', fabricDark: '#57402F', warm: '#7A5A3C', warmLight: '#92704F', warmDark: '#5F442C', leaf: '#6E8F5B', leafDark: '#587349', rug: '#4F4B47', shade: '#E8C77A', metal: '#2F2F2F', door: '#2E2A26' }),
  boheme: variant({ wall: '#EBD3B5', floor: '#A9744F', skirt: '#7C4F34', wood: '#B5835A', woodDark: '#8F6542', desk: '#C99A6B', leg: '#7C4F34', edge: '#8F6542', text: '#7A5A44', fabric: '#C2603F', fabricLight: '#D47A59', fabricDark: '#A24C2F', warm: '#D9A441', warmLight: '#E5BA67', warmDark: '#B8862B', leaf: '#4E8B5A', leafDark: '#3C6F47', rug: '#C77D5A', shade: '#F6D58E', metal: '#B08D57', door: '#6B3F2A' }),
  retro70: variant({ wall: '#F2D49B', floor: '#8A5A2B', skirt: '#5E3B1B', wood: '#A8702E', woodDark: '#7E5222', desk: '#C98B3A', leg: '#5E3B1B', edge: '#7E5222', text: '#6B4A22', fabric: '#D96B1E', fabricLight: '#E8863E', fabricDark: '#B5540F', warm: '#8A9A2B', warmLight: '#A3B346', warmDark: '#6E7C1D', leaf: '#7A9A32', leafDark: '#617D24', rug: '#E0A93B', shade: '#FFE08A', metal: '#9C7A3C', door: '#5E3B1B' }),
  japandi: variant({ wall: '#EFEAE0', floor: '#C8B08A', skirt: '#F7F4EC', wood: '#CBB48F', woodDark: '#A38C68', desk: '#DCC8A4', leg: '#3E3A35', edge: '#B49C77', text: '#7E7A72', fabric: '#9AA394', fabricLight: '#ADB5A7', fabricDark: '#838C7D', warm: '#B9A58A', warmLight: '#CBB9A0', warmDark: '#9E8B70', leaf: '#7F9B6E', leafDark: '#68825A', rug: '#DAD3C2', shade: '#F3E6C4', metal: '#4A4640', door: '#5A4A38' }),
  neon: variant({ wall: '#14142B', floor: '#1E1E3A', skirt: '#2B2B52', wood: '#2A2A4D', woodDark: '#1C1C38', desk: '#34345E', leg: '#0F0F22', edge: '#00E5FF', text: '#7FE9FF', fabric: '#5B2A86', fabricLight: '#7A3DB0', fabricDark: '#431F66', warm: '#8A1F5C', warmLight: '#B02C78', warmDark: '#661545', leaf: '#14C77A', leafDark: '#0E9E60', rug: '#2A1F5C', shade: '#FF4FD8', metal: '#8A8AB8', door: '#0F0F22' }),
  steampunk: variant({ wall: '#2F4A3B', floor: '#4A3426', skirt: '#B5833A', wood: '#7A4E2D', woodDark: '#58361D', desk: '#B5833A', leg: '#8A5A2A', edge: '#D9A441', text: '#E8C57A', fabric: '#6B3A24', fabricLight: '#84492E', fabricDark: '#4F2917', warm: '#8C4A2B', warmLight: '#A5603D', warmDark: '#6E3820', leaf: '#5E8A4A', leafDark: '#486E37', rug: '#5A2E2A', shade: '#FFD27A', metal: '#B87333', door: '#3A2418' }),
};

export const paletteOf = (id: StyleId): Palette => PALETTES[id] ?? SCANDINAVE;

export const STYLE_LABELS: Record<StyleId, string> = {
  scandinave: 'Scandinave',
  moderne: 'Moderne',
  industriel: 'Industriel',
  boheme: 'Bohème',
  retro70: 'Rétro 70s',
  japandi: 'Japandi',
  neon: 'Néon gaming',
  steampunk: 'Steampunk',
};

// Motifs de tapisserie et de sol, dessinés en SVG par `RoomBackdrop`. `accent` : couleur des traits du motif ; `glow` : liseré lumineux des meubles.
export type WallPattern = 'plain' | 'bands' | 'bricks' | 'leaves' | 'stripes' | 'slats' | 'brass';
export type FloorPattern = 'plain' | 'boards' | 'concrete' | 'checker' | 'tatami' | 'tiles' | 'plates';
export type Decor = { wall: WallPattern; floor: FloorPattern; accent: string; glow?: string };

const DECORS: Record<StyleId, Decor> = {
  scandinave: { wall: 'plain', floor: 'boards', accent: '#C9B48E' },
  moderne: { wall: 'bands', floor: 'plain', accent: '#C9D0D8' },
  industriel: { wall: 'bricks', floor: 'concrete', accent: '#6E6E6A' },
  boheme: { wall: 'leaves', floor: 'boards', accent: '#4E8B5A' },
  retro70: { wall: 'stripes', floor: 'checker', accent: '#E0A93B' },
  japandi: { wall: 'slats', floor: 'tatami', accent: '#B49C77' },
  neon: { wall: 'plain', floor: 'tiles', accent: '#00E5FF', glow: '#00E5FF' },
  steampunk: { wall: 'brass', floor: 'plates', accent: '#D9A441' },
};

export const decorOf = (id: StyleId): Decor => DECORS[id] ?? DECORS.scandinave;
```

- [ ] **Step 4: Lancer** — `npx vitest run tests/core/library/styles.test.ts` puis `npm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit** — `git add src/core/library/styles.ts tests/core/library/styles.test.ts && git commit -m "feat(bibliotheque): palettes et décors des 8 styles"`

---

### Task 2: Données — meubles exclusifs Steampunk, catalogue filtré, `setRoomStyle`

**Files:**
- Modify: `src/core/library/library-types.ts` (STANDING_KINDS), `src/core/library/furniture-catalog.ts`, `src/core/library/library-book.ts`, `src/content/furniture-icons.ts`
- Modify: `tests/core/library/furniture-catalog.test.ts` (liste des types attendus), créer `tests/core/library/library-style.test.ts`

**Interfaces:**
- Consumes: `StyleId` (`library-types.ts`).
- Produces: `STANDING_KINDS` gagne `'globe' | 'telescope' | 'automaton'` ; `Category` gagne `'steampunk'` ; `STEAMPUNK_ONLY: readonly StandingKind[]` ; `categoriesFor(style: StyleId): typeof CATEGORIES` (la catégorie `steampunk` n'est incluse que pour le style `steampunk`) ; `setRoomStyle(state: LibraryState, roomId: string, style: StyleId): LibraryState` (en quittant `steampunk`, retire du `layout` les meubles dont le `kind` est dans `STEAMPUNK_ONLY`) ; `countExclusive(room: Room): number` (nombre de meubles exclusifs posés, pour la confirmation).

- [ ] **Step 1: Écrire les tests** `tests/core/library/library-style.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { categoriesFor, STEAMPUNK_ONLY, sizeOf, poisOf } from '../../../src/core/library/furniture-catalog';
import { MIN_COLS, ROWS } from '../../../src/core/library/room-grid';
import { activeRoom, countExclusive, createInitialState, setRoomStyle, updateLayout } from '../../../src/core/library/library-book';

describe('styles de pièce', () => {
  it('la catégorie Steampunk n’existe que dans une pièce Steampunk', () => {
    expect(categoriesFor('scandinave').map((c) => c.id)).toEqual(['storage', 'seats', 'pets', 'deco']);
    expect(categoriesFor('steampunk').map((c) => c.id)).toEqual(['storage', 'seats', 'pets', 'deco', 'steampunk']);
    expect(categoriesFor('steampunk').at(-1)!.kinds).toEqual(['globe', 'telescope', 'automaton']);
  });

  it('les trois meubles exclusifs tiennent dans la pièce', () => {
    for (const kind of STEAMPUNK_ONLY) {
      const { w, h } = sizeOf(kind);
      expect(w).toBeLessThanOrEqual(MIN_COLS);
      expect(h).toBeLessThanOrEqual(ROWS);
      expect(poisOf(kind)).toEqual([]);
    }
  });

  it('setRoomStyle change le style de la pièce', () => {
    const state = setRoomStyle(createInitialState(), 'r1', 'neon');
    expect(activeRoom(state).style).toBe('neon');
  });

  it('quitter Steampunk retire les meubles exclusifs et eux seuls', () => {
    let state = setRoomStyle(createInitialState(), 'r1', 'steampunk');
    state = updateLayout(state, 'r1', () => [
      { id: 'f1', kind: 'globe', col: 0, row: 14 },
      { id: 'f2', kind: 'chair', col: 6, row: 15 },
    ]);
    expect(countExclusive(activeRoom(state))).toBe(1);
    const left = setRoomStyle(state, 'r1', 'moderne');
    expect(activeRoom(left).layout.map((p) => p.id)).toEqual(['f2']);
    const stay = setRoomStyle(state, 'r1', 'steampunk');
    expect(activeRoom(stay).layout).toHaveLength(2);
  });

  it('un identifiant de pièce inconnu ne change rien', () => {
    const state = createInitialState();
    expect(setRoomStyle(state, 'zz', 'neon')).toBe(state);
  });
});
```

Dans `furniture-catalog.test.ts`, le test « les catégories couvrent chaque type une seule fois » doit attendre aussi les trois nouveaux types (ils sont dans `STANDING_KINDS`) : ajouter `'globe', 'telescope', 'automaton'` à la liste `all` si le test les additionne à la main.

- [ ] **Step 2: Constater l'échec** — `npx vitest run tests/core/library/library-style.test.ts` : FAIL.

- [ ] **Step 3: Implémenter**
  - `library-types.ts` : ajouter `'globe', 'telescope', 'automaton'` à la fin de `STANDING_KINDS` (le schéma zod de l'état les accepte via `z.enum(STANDING_KINDS)`).
  - `furniture-catalog.ts` :
    - `Category` = `'storage' | 'seats' | 'pets' | 'deco' | 'steampunk'`.
    - `FOOTPRINTS` : `globe: { w: 3, h: 4, layer: 'floor', pois: [] }`, `telescope: { w: 3, h: 5, layer: 'floor', pois: [] }`, `automaton: { w: 2, h: 3, layer: 'floor', pois: [] }` (les points d'intérêt sont vides : le morceau 6 les ajoutera avec les comportements).
    - `LABELS` : `globe: 'Globe mécanique'`, `telescope: 'Télescope'`, `automaton: 'Automate'`.
    - `CATEGORIES` : ajouter en dernier `{ id: 'steampunk', label: 'Steampunk', kinds: ['globe', 'telescope', 'automaton'] }`.
    - Exporter `export const STEAMPUNK_ONLY: readonly StandingKind[] = ['globe', 'telescope', 'automaton'];` et `export const categoriesFor = (style: StyleId) => CATEGORIES.filter((c) => c.id !== 'steampunk' || style === 'steampunk');` (importer `StyleId`).
  - `library-book.ts` :

```ts
export function setRoomStyle(state: LibraryState, id: string, style: StyleId): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === id);
  if (!room || room.style === style) return state;
  // Les meubles exclusifs n'ont de sens qu'en Steampunk : ils partent avec le style.
  const layout = style === 'steampunk' ? room.layout : room.layout.filter((p) => !isExclusive(p));
  return mapRoom(state, id, (r) => ({ ...r, style, layout }));
}

const isExclusive = (placed: Placed): boolean => (STEAMPUNK_ONLY as readonly string[]).includes(placed.kind);
export const countExclusive = (room: Room): number => room.layout.filter(isExclusive).length;
```

    (importer `STEAMPUNK_ONLY` depuis `furniture-catalog`, `Placed` et `StyleId` depuis `library-types`.) Si `furniture-catalog` importe déjà `library-book` (cycle), placer `STEAMPUNK_ONLY` dans `library-types.ts` et le ré-exporter depuis le catalogue.
  - `furniture-icons.ts` : `KIND_ICON` gagne `globe: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z', 'M3 12h18', 'M12 3c3 3 3 15 0 18', 'M12 3c-3 3-3 15 0 18']`, `telescope: ['M4 14l12-6 2 4-12 6z', 'M12 15l-3 6', 'M12 15l3 6']`, `automaton: ['M8 5h8v6H8z', 'M10 8h.01', 'M14 8h.01', 'M7 11h10v7H7z', 'M9 18v3', 'M15 18v3']` ; `CATEGORY_ICON.steampunk = ['M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z', 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M5 5l2 2', 'M17 17l2 2', 'M19 5l-2 2', 'M7 17l-2 2']`.

- [ ] **Step 4: Lancer** — `npx vitest run tests/core/library` puis `npm run typecheck`. Le typecheck signale tout `Record<StandingKind, …>` à compléter ailleurs (par ex. `ARTS` de `furniture-art-home.tsx` n'est pas concerné car typé `Exclude<…>` : en ce cas, exclure aussi les trois nouveaux types de `HomeKind` en attendant la tâche 6, et faire que `RoomView` ne plante pas sur un `kind` sans dessin — retourner `null` pour ces trois types jusqu'à la tâche 6).

- [ ] **Step 5: Commit** — `git commit -m "feat(bibliotheque): meubles exclusifs Steampunk, catalogue par style, setRoomStyle"`

---

### Task 3: Fond de pièce (tapisserie, sol, plinthe) et liseré Néon

**Files:**
- Create: `src/content/room-backdrop.tsx`
- Modify: `src/content/RoomView.tsx` (remplacer les trois `<rect>` de fond ; ajouter `data-style` sur le `<svg>` ; liseré Néon)
- Test: `tests/content/room-backdrop.test.tsx`

**Interfaces:**
- Consumes: `paletteOf`, `decorOf`, `WallPattern`, `FloorPattern` (Task 1).
- Produces: `RoomBackdrop({ style, width, height, wallH }: { style: StyleId; width: number; height: number; wallH: number })` — dessine mur, motif de mur, sol, motif de sol, plinthe ; `NeonDefs()` (le `<filter id="wmt-neon-glow">`) ; `neonOutline(rect: PxRect, color: string)` renvoie le `<rect>` de liseré.

- [ ] **Step 1: Test** `tests/content/room-backdrop.test.tsx` (jsdom, pattern des autres tests : `createRoot` + `act`) :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { STYLE_IDS } from '../../src/core/library/library-types';
import { decorOf } from '../../src/core/library/styles';
import { RoomBackdrop } from '../../src/content/room-backdrop';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('fond de pièce', () => {
  it('dessine un mur, un sol et une plinthe pour chaque style, avec les motifs du décor', async () => {
    for (const style of STYLE_IDS) {
      const host = document.createElement('div');
      const root = createRoot(host);
      await act(async () => { root.render(<svg><RoomBackdrop style={style} width={720} height={510} wallH={340} /></svg>); });
      expect(host.querySelector('[data-backdrop="wall"]'), style).not.toBeNull();
      expect(host.querySelector('[data-backdrop="floor"]'), style).not.toBeNull();
      expect(host.querySelector('[data-backdrop="skirt"]'), style).not.toBeNull();
      const decor = decorOf(style);
      expect(host.querySelector(`[data-wall-pattern="${decor.wall}"]`), style).not.toBeNull();
      expect(host.querySelector(`[data-floor-pattern="${decor.floor}"]`), style).not.toBeNull();
      act(() => root.unmount());
    }
  });
});
```

- [ ] **Step 2: Constater l'échec.**

- [ ] **Step 3: Implémenter `room-backdrop.tsx`.** Règles :
  - `RoomBackdrop` rend, dans l'ordre : `<rect data-backdrop="wall" fill={palette.wall}>`, un `<rect data-wall-pattern={decor.wall} fill="url(#wmt-wall-pat)">` couvrant le mur (omis pour `plain`, mais l'attribut doit exister : pour `plain` rendre un `<rect>` sans remplissage `fill="none"`), `<rect data-backdrop="floor" y={wallH} …>`, un `<rect data-floor-pattern={decor.floor} fill="url(#wmt-floor-pat)">` couvrant le sol, `<rect data-backdrop="skirt" y={wallH-4} height={5} fill={palette.skirt} opacity={0.6}>`. Les `<defs>` contiennent les deux `<pattern id=… patternUnits="userSpaceOnUse">`.
  - Motifs de mur (traits en `decor.accent`, `strokeWidth` 1.5, `opacity` ≈ 0.35 sauf mention) — pattern `width × height` : `bands` 10×60 (rect 10×4 en haut) ; `bricks` 60×30 (`M0 0H60M0 15H60M0 30H60M30 0V15M0 15V30M60 15V30`) ; `leaves` 48×48 (deux ellipses `rx=4 ry=9` en (12,12) et (36,36), inclinées de ±30°) ; `stripes` 40×10 (rect 20×10 plein) ; `slats` 14×10 (trait vertical en x=0) ; `brass` 120×`wallH` (bandeau de laiton vertical x 0–8 plein `decor.accent`, rivets `circle r=1.6` en y=20, 60, 100… tous les 40 px, fond `palette.wall` conservé).
  - Motifs de sol : `boards` 80×16 (`M0 0H80M0 8H80M20 0V8M60 8V16`) ; `concrete` 30×30 (3 petits cercles `r=1` opacité 0.4) ; `checker` 40×20 (deux rects 20×10 en diagonale, plein `decor.accent`, opacité 0.45) ; `tatami` 120×30 (rect de bordure `120×30`, trait milieu `M60 0V30`) ; `tiles` 40×20 (contour de rect, `stroke=decor.accent`, opacité 0.5) ; `plates` 60×30 (contour de rect + rivets `r=1.4` aux quatre coins, laiton) ; `plain` : rien.
  - `NeonDefs` : `<defs><filter id="wmt-neon-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`. `neonOutline(rect, color)` : `<rect data-neon-outline x=… rx={4} fill="none" stroke={color} strokeWidth={2} filter="url(#wmt-neon-glow)" style={{ pointerEvents: 'none' }} />` autour du rectangle (marge 1 px).
  - `RoomView.tsx` : remplacer les trois `<rect>` de fond par `<RoomBackdrop style={room.style} width={width} height={HEIGHT} wallH={wallH} />` ; ajouter `data-style={room.style}` au `<svg>` ; si `decor.glow`, rendre `<NeonDefs />` et, dans `renderPlaced`, ajouter `{decor.glow && neonOutline(rect, decor.glow)}` dans le groupe du meuble (pas pour le tapis, `kind === 'rug'`).

- [ ] **Step 4: Lancer** — `npx vitest run tests/content/room-backdrop.test.tsx tests/content` puis `npm run typecheck`. Les tests existants de `RoomView` ne doivent pas régresser.

- [ ] **Step 5: Commit** — `git commit -m "feat(bibliotheque): tapisserie, sol et plinthe par style, liseré Néon"`

---

### Task 4: Sélecteur de style dans le panneau

**Files:**
- Modify: `src/content/LibraryPanel.tsx` (+ ses styles `PANEL_CSS` si les pastilles en demandent)
- Test: `tests/content/library-style-selector.test.tsx`

**Interfaces:**
- Consumes: `STYLE_IDS`, `STYLE_LABELS`, `paletteOf` (Task 1) ; `setRoomStyle`, `countExclusive` (Task 2) ; `categoriesFor` (Task 2).
- Produces: boutons `data-style="<id>"` (un par style) dans une rangée `role="group" aria-label="Style de la pièce"`, visible seulement en mode Aménager ; le panneau n'utilise plus `CATEGORIES` mais `categoriesFor(room.style)`.

- [ ] **Step 1: Test** (même gabarit que `tests/content/library-furniture.test.tsx` : repo mémoire, `click('[data-action="edit"]')`) :
  1. Les 8 boutons `[data-style]` existent en mode Aménager et n'existent pas en mode Visiter.
  2. Cliquer `[data-style="neon"]` met `aria-pressed="true"` sur ce bouton, `repo.current()` a `style === 'neon'`, et le `<svg>` porte `data-style="neon"`.
  3. La catégorie `[data-category="steampunk"]` n'existe pas en Scandinave ; après `[data-style="steampunk"]` elle existe, et cliquer dessus propose `[data-kind="globe"]`, `[data-kind="telescope"]`, `[data-kind="automaton"]`.
  4. Poser un globe (catégorie Steampunk → globe → case du sol), puis cliquer `[data-style="moderne"]` avec `vi.spyOn(window, 'confirm').mockReturnValue(false)` : le style reste `steampunk` et le globe reste posé ; avec `mockReturnValue(true)` : le style devient `moderne` et le globe a disparu.
  5. Quitter Steampunk sans meuble exclusif ne demande pas de confirmation (`confirm` non appelé).

- [ ] **Step 2: Constater l'échec.**

- [ ] **Step 3: Implémenter** :
  - Une rangée « Style de la pièce » (visible si `editing`), placée juste avant la rangée des catégories. Chaque `Btn` : `label={STYLE_LABELS[id]}`, `pressed={room.style === id}`, `data={{ style: id }}`, enfant : une pastille `<span className="wmt-lib-swatch" style={{ background: …wall, borderColor: …floor }} />` (CSS : 16×16, `border-radius: 50%`, bordure 4 px) puis un `<span>` du nom abrégé non nécessaire (le nom est dans `aria-label`/`title` ; seule la pastille est affichée, selon la règle « glyphes plutôt que texte »).
  - `chooseStyle(id)` : si `room.style === 'steampunk' && id !== 'steampunk'` et `countExclusive(room) > 0`, `window.confirm('Retirer les meubles Steampunk (globe, télescope, automate) de cette pièce ?')` ; si refusé, retour sans rien changer. Sinon `reset()`, et si la catégorie courante est `'steampunk'` et que `id !== 'steampunk'`, `setCategory('storage')` ; puis `void library.update((state) => setRoomStyle(state, room.id, id))`.
  - Remplacer `CATEGORIES.map` et `CATEGORIES.find` par `categoriesFor(room.style)`.
  - `Category` accepte maintenant `'steampunk'` : adapter l'état `category` si son type est restreint.

- [ ] **Step 4: Lancer** — `npx vitest run tests/content tests/core/library` puis `npm run typecheck`.

- [ ] **Step 5: Commit** — `git commit -m "feat(bibliotheque): sélecteur de style et catalogue Steampunk"`

---

### Task 5: Décor Steampunk animé du mur

**Files:**
- Create: `src/content/room-steampunk-decor.tsx`
- Modify: `src/content/RoomView.tsx` (rendu du décor entre le fond et les meubles quand `room.style === 'steampunk'`)
- Test: `tests/content/room-steampunk-decor.test.tsx`

**Interfaces:**
- Consumes: `CELL_W`, `SECTION`, `CELL_H`, `WALL_ROWS` (`room-grid.ts`), `paletteOf('steampunk')`.
- Produces: `SteampunkDecor({ cols, wallH, now?: () => Date }: { cols: number; wallH: number; now?: () => Date })` — groupe `<g data-steampunk-decor>`.

- [ ] **Step 1: Test** : rendre `<svg><SteampunkDecor cols={24} wallH={340} now={() => new Date(2026, 9, 8, 3, 15, 0)} /></svg>` (jsdom) et vérifier : `[data-steampunk-decor]` existe ; 2 tuyaux verticaux (`[data-pipe="vertical"]`) pour 24 colonnes (un par section de 12) et 4 pour 48 ; au moins une vanne `[data-valve]` ; un manomètre `[data-gauge]` ; une horloge `[data-clock]` dont la grande aiguille `[data-hand="minute"]` a `transform="rotate(90 …)"` (15 min → 90°) et la petite `[data-hand="hour"]` `rotate(97.5 …)` (3 h 15 → 3×30+7.5) ; sous `window.matchMedia('(prefers-reduced-motion: reduce)')` simulé à `matches: true`, aucun élément `animate`/`animateTransform` n'est rendu.

- [ ] **Step 2: Constater l'échec.**

- [ ] **Step 3: Implémenter.** Le composant répète par section de `SECTION * CELL_W` px (i = 0…cols/12 − 1), x0 = i × largeur de section :
  - **Plafond** : un tuyau horizontal de cuivre sur toute la largeur (`y = 12`, hauteur 10, `fill #B87333`, reflet clair `#E3A272` de 3 px, brides tous les 90 px).
  - **Tuyau vertical** `data-pipe="vertical"` à `x0 + 24`, de `y = 22` jusqu'à `wallH − 8`, largeur 9, avec une **vanne** `data-valve` (roue : cercle r=7 + quatre rayons) à `y = wallH × 0.45` ; une volute de **vapeur** : trois cercles (`r` 4→7, blancs, opacité 0.5) qui montent de 28 px en 3 s avec `<animate attributeName="cy" …>` et `<animate attributeName="opacity" values="0.55;0" …>`, décalés d'1 s, répétition indéfinie.
  - **Engrenage** : un rond denté (cercle r=18 + 8 dents `rect` en rotation, laiton) à `x0 + 96, y = 70`, tourne via `<animateTransform attributeName="transform" type="rotate" from="0 cx cy" to="360 cx cy" dur="20s" repeatCount="indefinite">` ; un second plus petit (r=11) à côté tourne en sens inverse (`dur="13s"`, de 360 à 0).
  - **Manomètre** `data-gauge` (sections impaires, ou section 0 si une seule) : cadran laiton r=20, graduations, aiguille qui oscille ±35° autour de −20° (`<animateTransform … values="-55 cx cy;15 cx cy;-55 cx cy" dur="6s" repeatCount="indefinite">`).
  - **Horloge** `data-clock` (section 1 si elle existe, sinon section 0) à `x0 + 60, y = 62` : cadran r=26 avec 12 repères, aiguille des heures `data-hand="hour"` et des minutes `data-hand="minute"` en `transform="rotate(angle cx cy)"` calculés depuis `now()` : minutes = 6 × m, heures = 30 × (h % 12) + m / 2. Le composant se re-rend toutes les 30 s (`useState` + `setInterval`, nettoyé au démontage, arrêté quand `document.hidden`).
  - **Mouvement réduit** : si `window.matchMedia?.('(prefers-reduced-motion: reduce)').matches`, ne rendre aucun `<animate*>`.
  - **Pause en arrière-plan** : un `useEffect` appelle `svg.pauseAnimations()` / `unpauseAnimations()` sur l'`ownerSVGElement` du groupe (garde `typeof … === 'function'` : jsdom ne l'implémente pas) selon `document.visibilitychange`.
  - Dans `RoomView.tsx`, juste après `<RoomBackdrop … />` : `{room.style === 'steampunk' && <SteampunkDecor cols={room.cols} wallH={wallH} />}` ; tout le groupe a `style={{ pointerEvents: 'none' }}`.

- [ ] **Step 4: Lancer** — `npx vitest run tests/content/room-steampunk-decor.test.tsx tests/content` puis `npm run typecheck`.

- [ ] **Step 5: Commit** — `git commit -m "feat(bibliotheque): décor Steampunk animé (tuyaux, vapeur, engrenages, manomètre, horloge)"`

---

### Task 6: Meubles Steampunk (redessinés et exclusifs)

**Files:**
- Create: `src/content/furniture-art-steampunk.tsx`
- Modify: `src/content/RoomView.tsx` (choisir le dessin Steampunk), `src/content/furniture-art.tsx` (`ComputerArt` accepte `steampunk?: boolean`) — ou faire dessiner la machine analytique par le nouveau fichier
- Test: `tests/content/library-steampunk-furniture.test.tsx`

**Interfaces:**
- Consumes: `Palette` (Task 1), `PxRect`, les types des meubles (Task 2).
- Produces: `SteampunkArt({ kind, rect, palette }: { kind: 'desk' | 'armchair' | 'lamp' | 'globe' | 'telescope' | 'automaton'; rect: PxRect; palette: Palette })` ; `AnalyticalEngineArt({ rect, imageUrl }: { rect: PxRect; imageUrl?: string })` (machine analytique, affiche l'image de la carte dans l'écran à tube) ; `STEAMPUNK_REDRAWN: readonly StandingKind[]` (`['desk', 'armchair', 'lamp']`).

- [ ] **Step 1: Test** : dans une pièce Steampunk (repo mémoire + `setRoomStyle`) avec un bureau, un ordinateur, un fauteuil, une lampe, un globe, un télescope et un automate posés (via `updateLayout` à des cases valides, bas du meuble dans le sol : `row + h − 1 ≥ WALL_ROWS`), le `<svg>` contient pour chacun un groupe `[data-furniture="…"]` qui contient `[data-steampunk-art="<kind>"]` (y compris `computer` → `analytical-engine`). Dans la même pièce passée en `scandinave`, aucun `[data-steampunk-art]` n'existe pour le bureau, le fauteuil, la lampe, l'ordinateur ; les trois exclusifs ont disparu (voir Task 2). Les cases `[data-kind="globe"]` etc. posent bien un meuble dont la taille est celle du catalogue.

- [ ] **Step 2: Constater l'échec.**

- [ ] **Step 3: Implémenter** — chaque dessin est un `<g data-steampunk-art="<nom>">`, en couleurs de palette (`p.metal` cuivre, `p.edge` laiton, `p.fabric` cuir…), proportions relatives au `rect` comme dans `furniture-art-home.tsx` :
  - `desk` (établi de laiton) : plateau épais `p.edge` avec bordure `p.woodDark`, deux pieds en tubes `p.metal` avec brides, une étagère basse entre les pieds, 4 rivets sur le plateau.
  - `armchair` (club en cuir) : dossier arrondi `p.fabric`, assise `p.fabricLight`, accoudoirs `p.fabricDark`, rangées de clous de laiton (`circle r=1.4`, `p.edge`) sur le dossier, pieds en boules.
  - `lamp` (lampe à gaz) : pied et tige de cuivre, globe de verre `p.shade` avec **vacillement** (`<animate attributeName="opacity" values="1;0.8;0.95;0.75;1" dur="2.4s" repeatCount="indefinite">`, absent en mouvement réduit), petit halo.
  - `globe` (3×4) : socle, pied, méridien de laiton (cercle incliné), sphère `p.fabricLight` avec continents (`p.leaf`), engrenage au pied.
  - `telescope` (3×5) : trépied de laiton, tube de cuivre incliné avec bagues, oculaire.
  - `automaton` (2×3) : petit automate de bureau : tête ronde à lunettes, corps de laiton, manivelle sur le côté qui tourne lentement (`animateTransform`, 6 s, absente en mouvement réduit), clé de remontage dans le dos.
  - `AnalyticalEngineArt` : coffre de cuivre, écran à tube (rect arrondi sombre `#1D1D22`, image de la carte dedans si `imageUrl`, `preserveAspectRatio="xMidYMid slice"`, attribut `referrerPolicy: 'no-referrer'` comme `ComputerArt`), cadrans ronds à droite, clavier à touches rondes (rangée de cercles) sous l'écran.
  - Rendu `data-steampunk-art` : `desk`, `armchair`, `lamp`, `globe`, `telescope`, `automaton`, `analytical-engine`.
  - `RoomView.tsx` : quand `room.style === 'steampunk'`, pour `desk`, `armchair`, `lamp`, `globe`, `telescope`, `automaton`, utiliser `SteampunkArt` au lieu de `DeskArt`/`HomeArt` ; pour `computer`, `AnalyticalEngineArt`. Les trois exclusifs, jusqu'ici sans dessin (Task 2), obtiennent leur dessin ici. Hors Steampunk, ces trois types ne sont pas posables (catalogue filtré) ; s'ils apparaissent dans un état lu (donnée abîmée), les ignorer au dessin (`null`).
  - Le soulèvement par appui long et la zone de dépôt ne changent pas (mêmes rectangles que les autres meubles).

- [ ] **Step 4: Lancer** — `npx vitest run tests/content tests/core/library` puis `npm run typecheck`.

- [ ] **Step 5: Commit** — `git commit -m "feat(bibliotheque): meubles Steampunk (machine analytique, établi, fauteuil club, lampe à gaz, globe, télescope, automate)"`

---

### Task 7: Fiche WikiHow, annonce « Quoi de neuf » et vérification finale

**Files:**
- Modify: `src/core/whats-new/entries.ts` (nouvelle entrée `bibliotheque-v6`, à la suite de `bibliotheque-v5` ; la fiche et l'annonce sont la même entrée dans ce projet : suivre le gabarit de `bibliotheque-v5`)
- Test: les tests existants `tests/core/whats-new/*.test.ts` doivent passer ; ajouter, si le fichier `entries.test.ts` contient une liste d'ids ou de cibles, `bibliotheque-v6` à cette liste.

**Interfaces:**
- Consumes: sélecteurs `[data-wmt-library] [data-style="steampunk"]`, `[data-wmt-library] [data-action="edit"]`, `[data-wmt-library] [data-category="steampunk"]` (Tasks 4 et 6).

- [ ] **Step 1: Entrée** `bibliotheque-v6`, thème `collection`, glyphe `🎨`, titre « Changer le style de sa pièce », résumé « Huit styles, du Scandinave au Steampunk ». Trois étapes (même structure `target`, `title`, `text`, `gesture: 'tap'`, `details` avec « Comment faire » / « À quoi ça sert » / « Limites », `scene: { page: '/collection', closeWindows: true, reveal: [...] }`) :
  1. cible `[data-wmt-library] [data-action="edit"]` : « Choisir un style » — en mode Aménager, une rangée de pastilles de couleur propose Scandinave, Moderne, Industriel, Bohème, Rétro 70s, Japandi, Néon gaming et Steampunk ; chaque pièce a son style ; *À quoi ça sert* : ambiance et décor de chaque pièce ; *Limites* : les cartes (posters, dos, écran) gardent leurs couleurs.
  2. cible `[data-wmt-library] [data-style="neon"]` : « Le style Néon gaming » — liseré lumineux autour des meubles.
  3. cible `[data-wmt-library] [data-style="steampunk"]` : « Le style Steampunk » — décor de tuyaux, vapeur, engrenages, manomètre, horloge à l'heure réelle ; meubles redessinés ; catégorie Steampunk (globe mécanique, télescope, automate) ; *Limites* : en quittant le style Steampunk, ces trois meubles sont retirés après confirmation.
  Textes en français, ton des entrées voisines, apostrophes typographiques `’`.

- [ ] **Step 2: Vérifications complètes** — `npm test`, `npm run typecheck`, `npm run build` : tout doit passer (noter toute régression préexistante sans la masquer).

- [ ] **Step 3: Commit** — `git commit -m "docs(bibliotheque): fiche WikiHow bibliotheque-v6 (styles et décor)"`
