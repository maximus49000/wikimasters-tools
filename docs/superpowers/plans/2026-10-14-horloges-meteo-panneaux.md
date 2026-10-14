# Horloges, météomètres et panneaux — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à la pièce de la Bibliothèque des horloges (à aiguilles, numérique, réveil, pendulette), des météomètres (station, baromètre, station de table) et des panneaux à texte libre et taille réglable (ardoise, lettres, néon, liège).

**Architecture:** Un nouveau type d'objet placé `deco` (au mur, rectangle de cases, réglages propres : ville, texte, couleur) passe par les mêmes règles que la fenêtre (`canHangRect`). Les objets de table sont de nouveaux petits objets (`small`) dont le cadran est un décalque (`decal` rôle `face`) du modèle 3D. Le dessin est en SVG pur (`deco-art.tsx`), alimenté par l'heure de la scène, la météo de la scène et un minuteur partagé d'une seconde.

**Tech Stack:** TypeScript, React 18 (SVG), zod, vitest + jsdom, WXT (extension) + WebView Android (même code), `Intl.DateTimeFormat` pour les fuseaux, polices @fontsource (OFL) intégrées en `?inline`.

**Spec:** `docs/superpowers/specs/2026-10-14-horloges-meteo-panneaux-design.md` — maquette de référence du dessin : `docs/superpowers/maquettes/horloges-meteo-panneau/horloges-meteo-panneau.html`.

## Global Constraints

- Travail dans le worktree `C:/Users/maxim/Downloads/Wikimasters-horloges`, branche `feat/horloges-meteo-panneau` (jamais dans `Wikimasters tools` : une autre session y travaille).
- Pas de changement de version de l'état : on reste en `version: 7`.
- Texte d'un panneau : **140 caractères au plus**.
- Panneaux : de **2 × 2 à 12 × 8 cases**, défaut **4 × 3** (néon **5 × 2**).
- Tailles fixes : horloge à aiguilles 2 × 2, horloge numérique 2 × 1, station météo 2 × 1, baromètre 2 × 3.
- Couleurs du néon : `pink #FF4FD8`, `cyan #00E5FF`, `yellow #FFE14F`, `green #3DFF8B`, `white #FFFFFF` ; défaut `pink`.
- Interface : glyphes plutôt que du texte dans les boutons (`Btn` + `Icon` de `library-ui.tsx`), libellé dans `label` (aria).
- Tout dessin fait par Opus porte en tête de fichier le commentaire `// Dessin provisoire Opus : Fable n'est pas passé (gel jusqu'au 2026-10-17), reprise Fable prévue.`
- Tests : ne jouer que les familles touchées, `npm run test:famille -- scene-piece scene-meteo` ; tout nouveau fichier de test doit correspondre à une famille de `tests/familles.ts`.
- Vérifications avant chaque commit : `npx tsc --noEmit` sans erreur, tests de la tâche verts.
- Commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Ancienne pièce relue** : une pièce enregistrée sans aucun objet `deco` doit se relire à l'identique (aucun champ ajouté, aucune perte) — test dans la tâche 1.
2. **Objet `deco` abîmé** (texte de 500 caractères, taille 1 × 1, fuseau inventé) : seul cet objet disparaît, la pièce et ses meubles restent — test dans la tâche 1.
3. **Saisie dans la fenêtre de texte** : taper Échap ou des touches dans la zone de texte ne doit ni annuler le mode placement ni déclencher les raccourcis de la pièce — test dans la tâche 8.
4. **Passage de minuit et changement d'heure** : une ville à +7 h alors qu'il est 22 h à la scène affiche 5 h (pas 29 h) ; Tokyo est à +7 h de Paris en octobre et +8 h en janvier — test dans la tâche 2.
5. **Panneau agrandi contre un voisin ou le bord** : l'agrandissement est refusé (cases qui clignotent, message) au lieu de chevaucher une fenêtre ou de dépasser le mur — test dans la tâche 7.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/core/library/deco.ts` (nouveau) | types `DecoKind`/`NeonColor`/`CityTime`, tailles, bornes, couleurs du néon, prédicats |
| `src/core/library/clock-cities.ts` (nouveau) | ~150 villes, recherche, heure d'une ville, `isKnownTz` |
| `src/core/library/deco-weather.ts` (nouveau) | température affichée, angle du baromètre, pictogramme jour/nuit |
| `src/core/library/text-fit.ts` (nouveau) | retour à la ligne + taille maximale (mesure injectée) |
| `src/content/deco-art.tsx` (nouveau) | dessin SVG des 8 objets muraux + faces des 3 objets de table |
| `src/content/use-clock-tick.ts` (nouveau) | minuteur partagé de 1 s |
| `src/content/deco-fonts.ts` (nouveau) | 4 polices intégrées, déclarées une fois dans le document |
| `src/content/CityPickerDialog.tsx`, `src/content/DecoTextDialog.tsx` (nouveaux) | fenêtres 🌐 et ✏️ |
| `library-types.ts`, `library-book.ts`, `room-grid.ts` | type `deco`, schéma, règles de pose |
| `furniture-catalog.ts`, `furniture-thumb.tsx`, `build-drawer.tsx` | tiroir et vignettes |
| `placement.ts`, `furniture-drag.ts` | pose, déplacement, taille |
| `item-models.ts`, `carried-items.ts`, `model3d-art.tsx` | objets de table (modèle + décalque `face`) |
| `use-weather.ts`, `RoomView.tsx`, `LibraryPanel.tsx` | météo exposée, rendu, bulle, fenêtres |
| `src/core/whats-new/entries.ts` | fiche WikiHow |

---

### Task 1: Type `deco`, schéma et règles du mur

**Files:**
- Create: `src/core/library/deco.ts`
- Modify: `src/core/library/library-types.ts:20-48`, `src/core/library/library-book.ts:15-47` et `:328-344`, `src/core/library/room-grid.ts:37-62` et `:407-410`, `src/core/library/depth-order.ts:39`, `src/content/pet-context.ts:21`
- Test: `tests/core/library/room-grid-deco.test.ts`, `tests/core/library/library-book-deco.test.ts`

**Interfaces:**
- Produces (`deco.ts`) : `DECO_KINDS`, `type DecoKind`, `PANEL_KINDS`, `CLOCK_KINDS`, `type NeonColor`, `NEON_COLORS: Record<NeonColor,string>`, `type CityTime = { name: string; tz: string }`, `PANEL_MIN = {w:2,h:2}`, `PANEL_MAX = {w:12,h:8}`, `MAX_PANEL_TEXT = 140`, `decoDefaultSize(deco): {w,h}`, `isPanel(deco): boolean`, `isWallClock(deco): boolean`.
- Produces (`library-types.ts`) : membre `{ id; kind: 'deco'; deco: DecoKind; col; row; w?; h?; city?: CityTime; text?: string; neon?: NeonColor }` de `Placed` ; alias `DecoPlaced`.
- Produces (`room-grid.ts`) : `decoSizeOf(p: DecoPlaced): {w,h}`, `hangDeco(layout, cols, deco, col, row, id): Layout | null`, `moveDeco(layout, cols, id, col, row): Layout | null`, `decoFit(layout, cols, id, w, h): PlaceResult`, `resizeDeco(layout, cols, id, w, h): Layout | null`, `setDecoSettings(layout, id, patch: { city?: CityTime | null; text?: string; neon?: NeonColor }): Layout`.

- [ ] **Step 1: Écrire `deco.ts`**

```ts
// Objets décoratifs du mur : horloges, météomètres et panneaux à texte (spec 2026-10-14-horloges-meteo-panneaux).
export const PANEL_KINDS = ['panel-chalk', 'panel-letter', 'panel-neon', 'panel-cork'] as const;
export const CLOCK_KINDS = ['wall-clock', 'digital-clock'] as const;
export const DECO_KINDS = [...CLOCK_KINDS, 'weather-station', 'barometer', ...PANEL_KINDS] as const;
export type DecoKind = (typeof DECO_KINDS)[number];
export type NeonColor = 'pink' | 'cyan' | 'yellow' | 'green' | 'white';
export const NEON_COLORS: Record<NeonColor, string> = { pink: '#FF4FD8', cyan: '#00E5FF', yellow: '#FFE14F', green: '#3DFF8B', white: '#FFFFFF' };
// Ville d'une horloge : nom affiché et fuseau IANA (absent = heure de la scène).
export type CityTime = { name: string; tz: string };

export const PANEL_MIN = { w: 2, h: 2 } as const;
export const PANEL_MAX = { w: 12, h: 8 } as const;
export const MAX_PANEL_TEXT = 140;

const FIXED: Record<Exclude<DecoKind, (typeof PANEL_KINDS)[number]>, { w: number; h: number }> = {
  'wall-clock': { w: 2, h: 2 },
  'digital-clock': { w: 2, h: 1 },
  'weather-station': { w: 2, h: 1 },
  barometer: { w: 2, h: 3 },
};

export const isPanel = (deco: DecoKind): deco is (typeof PANEL_KINDS)[number] => (PANEL_KINDS as readonly string[]).includes(deco);
export const isWallClock = (deco: DecoKind): boolean => (CLOCK_KINDS as readonly string[]).includes(deco);
// Taille à la pose : fixe, ou défaut du panneau (néon plus large que haut).
export const decoDefaultSize = (deco: DecoKind): { w: number; h: number } => (isPanel(deco) ? (deco === 'panel-neon' ? { w: 5, h: 2 } : { w: 4, h: 3 }) : FIXED[deco]);
```

- [ ] **Step 2: Étendre `Placed`**

Dans `library-types.ts`, importer `import type { CityTime, DecoKind, NeonColor } from './deco';`, ajouter au commentaire de `Placed` la ligne « `deco` : horloge, météomètre ou panneau accroché (case en haut à gauche) ; `w`/`h` pour un panneau, `city` pour une horloge, `text`/`neon` pour un panneau. », puis le membre :

```ts
  | { id: string; kind: 'deco'; deco: DecoKind; col: number; row: number; w?: number; h?: number; city?: CityTime; text?: string; neon?: NeonColor }
```

et après `Layout` : `export type DecoPlaced = Extract<Placed, { kind: 'deco' }>;`

- [ ] **Step 3: Écrire les tests de la grille (échouent)**

`tests/core/library/room-grid-deco.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { Layout } from '../../../src/core/library/library-types';
import { decoFit, decoSizeOf, depthOf, hangDeco, moveDeco, rectOf, resizeDeco, setDecoSettings, shiftLayout } from '../../../src/core/library/room-grid';

const COLS = 24;
const win: Layout[number] = { id: 'w1', kind: 'window', col: 8, row: 1, w: 6, h: 5 };

describe('objets décoratifs du mur', () => {
  it('une horloge à aiguilles se pose en 2×2 au niveau du mur', () => {
    const layout = hangDeco([], COLS, 'wall-clock', 2, 1, 'f1')!;
    expect(layout).toEqual([{ id: 'f1', kind: 'deco', deco: 'wall-clock', col: 2, row: 1 }]);
    expect(rectOf(layout[0]!)).toEqual({ col: 2, row: 1, w: 2, h: 2 });
    expect(depthOf(layout, layout[0]!)).toBe(0);
  });

  it('un panneau se pose à sa taille par défaut (4×3, néon 5×2)', () => {
    const chalk = hangDeco([], COLS, 'panel-chalk', 0, 0, 'f1')![0]!;
    expect(chalk).toMatchObject({ w: 4, h: 3 });
    const neon = hangDeco([], COLS, 'panel-neon', 0, 0, 'f2')![0]!;
    expect(decoSizeOf(neon as Extract<Layout[number], { kind: 'deco' }>)).toEqual({ w: 5, h: 2 });
  });

  it('refuse le sol, le bord et une fenêtre', () => {
    expect(hangDeco([], COLS, 'barometer', 0, 10, 'f1')).toBeNull();
    expect(hangDeco([], COLS, 'wall-clock', 23, 0, 'f1')).toBeNull();
    expect(hangDeco([win], COLS, 'wall-clock', 9, 2, 'f1')).toBeNull();
  });

  it('se déplace sans se bloquer lui-même', () => {
    const layout = hangDeco([], COLS, 'digital-clock', 2, 1, 'f1')!;
    expect(moveDeco(layout, COLS, 'f1', 3, 1)![0]).toMatchObject({ col: 3, row: 1 });
  });

  it('un panneau change de taille dans ses bornes, jamais contre un voisin ni hors du mur', () => {
    const layout = [...hangDeco([], COLS, 'panel-cork', 2, 1, 'f1')!, win];
    expect(resizeDeco(layout, COLS, 'f1', 5, 3)![0]).toMatchObject({ w: 5, h: 3 });
    expect(decoFit(layout, COLS, 'f1', 1, 3).ok).toBe(false);
    expect(decoFit(layout, COLS, 'f1', 13, 3).ok).toBe(false);
    expect(decoFit(layout, COLS, 'f1', 7, 3)).toMatchObject({ ok: false, reason: 'taken' });
    expect(decoFit(layout, COLS, 'f1', 4, 12)).toMatchObject({ ok: false });
  });

  it('une horloge ne change pas de taille', () => {
    const layout = hangDeco([], COLS, 'wall-clock', 2, 1, 'f1')!;
    expect(resizeDeco(layout, COLS, 'f1', 3, 3)).toBeNull();
  });

  it('enregistre et retire les réglages', () => {
    const layout = hangDeco([], COLS, 'wall-clock', 2, 1, 'f1')!;
    const tokyo = setDecoSettings(layout, 'f1', { city: { name: 'Tokyo', tz: 'Asia/Tokyo' } });
    expect(tokyo[0]).toMatchObject({ city: { name: 'Tokyo', tz: 'Asia/Tokyo' } });
    expect(setDecoSettings(tokyo, 'f1', { city: null })[0]).not.toHaveProperty('city');
    const panel = hangDeco([], COLS, 'panel-neon', 0, 0, 'p1')!;
    expect(setDecoSettings(panel, 'p1', { text: 'x'.repeat(200), neon: 'cyan' })[0]).toMatchObject({ text: 'x'.repeat(140), neon: 'cyan' });
  });

  it('suit la pièce agrandie à gauche', () => {
    const layout = hangDeco([], COLS, 'wall-clock', 2, 1, 'f1')!;
    expect(shiftLayout(layout, 12)[0]).toMatchObject({ col: 14 });
  });
});
```

- [ ] **Step 4: Lancer pour voir l'échec**

Run: `npx vitest run tests/core/library/room-grid-deco.test.ts`
Expected: FAIL (`hangDeco` n'existe pas).

- [ ] **Step 5: Implémenter dans `room-grid.ts`**

Imports : `import { MAX_PANEL_TEXT, PANEL_MAX, PANEL_MIN, decoDefaultSize, isPanel, type CityTime, type DecoKind, type NeonColor } from './deco';` et `DecoPlaced` depuis `library-types`.

Dans `rectOf`, avant le `return null` :

```ts
  if (p.kind === 'deco') return { col: p.col, row: p.row, ...decoSizeOf(p) };
```

Dans `depthOf` : `if (p.kind === 'window' || p.kind === 'wall' || p.kind === 'deco') return 0;`

Dans `shiftLayout` : remplacer `p.kind === 'wall' || p.kind === 'window'` par `p.kind === 'wall' || p.kind === 'window' || p.kind === 'deco'`.

Après `resizeWindow`, ajouter :

```ts
// Taille d'un objet décoratif : la sienne pour un panneau (sinon le défaut), fixe pour le reste.
export const decoSizeOf = (p: DecoPlaced): { w: number; h: number } =>
  isPanel(p.deco) && p.w !== undefined && p.h !== undefined ? { w: p.w, h: p.h } : decoDefaultSize(p.deco);

export function hangDeco(layout: Layout, cols: number, deco: DecoKind, col: number, row: number, id: string): Layout | null {
  const { w, h } = decoDefaultSize(deco);
  if (!canHangRect(layout, cols, w, h, col, row).ok) return null;
  return [...layout, { id, kind: 'deco', deco, col, row, ...(isPanel(deco) ? { w, h } : {}) }];
}

export function moveDeco(layout: Layout, cols: number, id: string, col: number, row: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'deco') return null;
  const { w, h } = decoSizeOf(item);
  if (!canHangRect(layout, cols, w, h, col, row, id).ok) return null;
  return layout.map((p) => (p.id === id ? { ...item, col, row } : p));
}

// Un panneau garde son coin haut-gauche ; sa taille reste dans les bornes, sur le mur et sur des cases libres. Les autres objets ont une taille fixe.
export function decoFit(layout: Layout, cols: number, id: string, w: number, h: number): PlaceResult {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'deco' || !isPanel(item.deco)) return { ok: false, reason: 'bounds', cells: [] };
  const inRange = Number.isInteger(w) && Number.isInteger(h) && w >= PANEL_MIN.w && w <= PANEL_MAX.w && h >= PANEL_MIN.h && h <= PANEL_MAX.h;
  if (!inRange) return { ok: false, reason: 'bounds', cells: [] };
  return canHangRect(layout, cols, w, h, item.col, item.row, id);
}

export function resizeDeco(layout: Layout, cols: number, id: string, w: number, h: number): Layout | null {
  const item = layout.find((p) => p.id === id);
  if (!item || item.kind !== 'deco' || !decoFit(layout, cols, id, w, h).ok) return null;
  return layout.map((p) => (p.id === id ? { ...item, w, h } : p));
}

// Ville (null la retire : heure de la scène), texte (coupé à 140 caractères) ou couleur du néon d'un objet décoratif ou d'un petit objet horloge.
export function setDecoSettings(layout: Layout, id: string, patch: { city?: CityTime | null; text?: string; neon?: NeonColor }): Layout {
  return layout.map((p) => {
    if (p.id !== id || (p.kind !== 'deco' && p.kind !== 'small')) return p;
    let next: Placed = p;
    if (patch.city !== undefined) {
      const { city: _, ...rest } = next as DecoPlaced;
      next = (patch.city ? { ...rest, city: patch.city } : rest) as Placed;
    }
    if (p.kind === 'deco' && patch.text !== undefined) next = { ...(next as DecoPlaced), text: patch.text.slice(0, MAX_PANEL_TEXT) };
    if (p.kind === 'deco' && patch.neon !== undefined) next = { ...(next as DecoPlaced), neon: patch.neon };
    return next;
  });
}
```

Le `small` reçoit `city?` à la tâche 9 ; d'ici là, le cast passe le typage parce que `setDecoSettings` ne pose `city` que si l'appelant le demande.

- [ ] **Step 6: Lancer les tests de la grille**

Run: `npx vitest run tests/core/library/room-grid-deco.test.ts`
Expected: PASS.

- [ ] **Step 7: Écrire les tests de sauvegarde (échouent)**

`tests/core/library/library-book-deco.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createInitialState, parseStoredLibraryState } from '../../../src/core/library/library-book';

const withLayout = (layout: unknown[]) => {
  const state = createInitialState();
  return { ...state, rooms: state.rooms.map((r, i) => (i === 0 ? { ...r, layout } : r)) };
};
const clock = { id: 'f1', kind: 'deco', deco: 'wall-clock', col: 2, row: 1, city: { name: 'Tokyo', tz: 'Asia/Tokyo' } };
const panel = { id: 'f2', kind: 'deco', deco: 'panel-neon', col: 6, row: 1, w: 5, h: 2, text: 'Good vibes', neon: 'cyan' };
const shelf = { id: 'f3', kind: 'shelf', col: 0, row: 8 };

describe('sauvegarde des objets décoratifs', () => {
  it('relit une horloge et un panneau à l identique', () => {
    const read = parseStoredLibraryState(withLayout([clock, panel]));
    expect(read?.rooms[0]?.layout).toEqual([clock, panel]);
  });

  it('une pièce sans objet décoratif est inchangée', () => {
    const raw = withLayout([shelf]);
    expect(parseStoredLibraryState(raw)?.rooms[0]?.layout).toEqual([shelf]);
  });

  it('retire seulement l objet abîmé (texte trop long, taille hors bornes, fuseau inconnu, type inconnu)', () => {
    const bad = [
      { ...panel, id: 'b1', text: 'x'.repeat(500) },
      { ...panel, id: 'b2', w: 1, h: 1 },
      { ...clock, id: 'b3', city: { name: 'Atlantide', tz: 'Ocean/Atlantis' } },
      { ...clock, id: 'b4', deco: 'cuckoo' },
    ];
    const read = parseStoredLibraryState(withLayout([shelf, ...bad, clock]));
    expect(read).not.toBeNull();
    expect(read!.rooms[0]!.layout.map((p) => p.id)).toEqual(['f3', 'f1']);
  });
});
```

Le test « fuseau inconnu » dépend de `isKnownTz` (tâche 2). **Faire la tâche 2 avant l'étape 9**, ou garder ce cas en `it.todo` et l'activer à la fin de la tâche 2.

- [ ] **Step 8: Lancer pour voir l'échec**

Run: `npx vitest run tests/core/library/library-book-deco.test.ts`
Expected: FAIL (le `deco` n'est pas dans l'union : la pièce entière est refusée, `read` est `null`).

- [ ] **Step 9: Implémenter le schéma**

Dans `library-book.ts`, après `windowSchema` :

```ts
const citySchema = z.object({ name: z.string().min(1).max(60), tz: z.string().refine(isKnownTz) });
const decoSchema = z.object({
  id: z.string(),
  kind: z.literal('deco'),
  deco: z.enum(DECO_KINDS),
  col: z.number().int(),
  row: z.number().int(),
  w: z.number().int().min(PANEL_MIN.w).max(PANEL_MAX.w).optional(),
  h: z.number().int().min(PANEL_MIN.h).max(PANEL_MAX.h).optional(),
  city: citySchema.optional(),
  text: z.string().max(MAX_PANEL_TEXT).optional(),
  neon: z.enum(['pink', 'cyan', 'yellow', 'green', 'white']).optional(),
});
```

(imports : `DECO_KINDS, MAX_PANEL_TEXT, PANEL_MAX, PANEL_MIN` depuis `./deco`, `isKnownTz` depuis `./clock-cities`). Ajouter `decoSchema` dans `placedSchema`. Remplacer `dropBadWindows` par un filtre plus général (garder le nom de la fonction appelante cohérent : renommer en `dropBadWallItems` et mettre à jour l'appel dans `parseStoredLibraryState`) :

```ts
// Une fenêtre ou un objet décoratif impossible (dimensions hors bornes, texte trop long, fuseau inconnu…) est ignoré sans faire perdre la pièce.
function dropBadWallItems(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { rooms?: unknown }).rooms)) return raw;
  const ok = (p: unknown): boolean => {
    const kind = (p as { kind?: unknown } | null)?.kind;
    if (kind === 'window') return windowSchema.safeParse(p).success;
    if (kind === 'deco') return decoSchema.safeParse(p).success;
    return true;
  };
  const rooms = (raw as { rooms: unknown[] }).rooms.map((room) =>
    typeof room === 'object' && room !== null && Array.isArray((room as { layout?: unknown }).layout) ? { ...room, layout: (room as { layout: unknown[] }).layout.filter(ok) } : room,
  );
  return { ...(raw as object), rooms };
}
```

Dans `fitRoomWidth`, rien à changer (`fitsWithin` passe par `rectOf`). Dans `depth-order.ts:39`, ajouter `|| p.kind === 'deco'` au filtre de la couche du fond ; dans `pet-context.ts:21`, ne rien changer (les animaux ne voient que les fenêtres) mais vérifier que `isWindow` ne casse pas sur le nouveau type.

- [ ] **Step 10: Lancer les tests et la famille**

Run: `npx tsc --noEmit && npx vitest run tests/core/library/room-grid-deco.test.ts tests/core/library/library-book-deco.test.ts && npm run test:famille -- scene-piece`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/core/library/deco.ts src/core/library/library-types.ts src/core/library/library-book.ts src/core/library/room-grid.ts src/core/library/depth-order.ts tests/core/library/room-grid-deco.test.ts tests/core/library/library-book-deco.test.ts
git commit -m "feat(bibliotheque): objets décoratifs du mur (type deco, pose, taille, sauvegarde)"
```

---

### Task 2: Villes et heure d'une ville

**Files:**
- Create: `src/core/library/clock-cities.ts`
- Test: `tests/core/library/clock-cities.test.ts`

**Interfaces:**
- Produces : `type City = { name: string; country: string; tz: string }`, `CITIES: readonly City[]`, `isKnownTz(tz: string): boolean`, `searchCities(query: string): City[]`, `tzOffsetMinutes(tz: string, at: Date): number`, `cityMinutes(sceneMinutes: number, tz: string, now: Date): number`, `cityClock(sceneMinutes: number, city: CityTime | undefined, now: Date): { h: number; m: number; s: number }`.

- [ ] **Step 1: Écrire les tests (échouent)**

```ts
import { describe, expect, it } from 'vitest';
import { CITIES, cityClock, cityMinutes, isKnownTz, searchCities, tzOffsetMinutes } from '../../../src/core/library/clock-cities';

describe('villes des horloges', () => {
  it('couvre au moins 120 villes, toutes à fuseau valide et sans doublon', () => {
    expect(CITIES.length).toBeGreaterThanOrEqual(120);
    for (const c of CITIES) expect(() => new Intl.DateTimeFormat('fr', { timeZone: c.tz })).not.toThrow();
    expect(new Set(CITIES.map((c) => `${c.name}|${c.country}`)).size).toBe(CITIES.length);
  });

  it('cherche sans accents ni majuscules, par ville ou par pays', () => {
    expect(searchCities('seoul').map((c) => c.name)).toContain('Séoul');
    expect(searchCities('JAPON').map((c) => c.name)).toContain('Tokyo');
    expect(searchCities('')).toHaveLength(CITIES.length);
  });

  it('reconnaît les fuseaux de la liste seulement', () => {
    expect(isKnownTz('Asia/Tokyo')).toBe(true);
    expect(isKnownTz('Ocean/Atlantis')).toBe(false);
  });

  it('Tokyo est à +7 h de Paris en octobre et +8 h en janvier', () => {
    const oct = new Date('2026-10-14T10:00:00Z');
    const jan = new Date('2026-01-14T10:00:00Z');
    expect(tzOffsetMinutes('Asia/Tokyo', oct) - tzOffsetMinutes('Europe/Paris', oct)).toBe(7 * 60);
    expect(tzOffsetMinutes('Asia/Tokyo', jan) - tzOffsetMinutes('Europe/Paris', jan)).toBe(8 * 60);
  });

  it('garde l écart quand l heure de la scène est choisie, et repasse minuit', () => {
    const now = new Date('2026-10-14T10:00:00Z');
    const device = -now.getTimezoneOffset();
    const tokyo = tzOffsetMinutes('Asia/Tokyo', now);
    // 22 h dans la scène → 22 h + (Tokyo − appareil), ramené dans 0..1439.
    expect(cityMinutes(22 * 60, 'Asia/Tokyo', now)).toBe((((22 * 60 + tokyo - device) % 1440) + 1440) % 1440);
    expect(cityMinutes(22 * 60, 'Asia/Tokyo', now)).toBeLessThan(1440);
  });

  it('sans ville, l horloge donne l heure de la scène et les secondes de l appareil', () => {
    const now = new Date('2026-10-14T10:00:42Z');
    expect(cityClock(13 * 60 + 5, undefined, now)).toEqual({ h: 13, m: 5, s: 42 });
  });
});
```

- [ ] **Step 2: Lancer pour voir l'échec**

Run: `npx vitest run tests/core/library/clock-cities.test.ts`
Expected: FAIL (module absent).

- [ ] **Step 3: Implémenter**

```ts
import type { CityTime } from './deco';

// Grandes villes pour l'heure d'une horloge : nom et pays en français, fuseau IANA. Calcul local par Intl, sans réseau.
export type City = { name: string; country: string; tz: string };

export const CITIES: readonly City[] = [
  // Europe
  { name: 'Paris', country: 'France', tz: 'Europe/Paris' },
  { name: 'Londres', country: 'Royaume-Uni', tz: 'Europe/London' },
  // … liste complète ci-dessous
];
```

La liste doit contenir **au moins ces 130 villes** (nom, pays, fuseau), dans cet ordre de régions :

- Europe : Paris/France/Europe/Paris, Lyon/France/Europe/Paris, Marseille/France/Europe/Paris, Bruxelles/Belgique/Europe/Brussels, Genève/Suisse/Europe/Zurich, Zurich/Suisse/Europe/Zurich, Luxembourg/Luxembourg/Europe/Luxembourg, Londres/Royaume-Uni/Europe/London, Édimbourg/Royaume-Uni/Europe/London, Dublin/Irlande/Europe/Dublin, Lisbonne/Portugal/Europe/Lisbon, Madrid/Espagne/Europe/Madrid, Barcelone/Espagne/Europe/Madrid, Rome/Italie/Europe/Rome, Milan/Italie/Europe/Rome, Berlin/Allemagne/Europe/Berlin, Munich/Allemagne/Europe/Berlin, Amsterdam/Pays-Bas/Europe/Amsterdam, Copenhague/Danemark/Europe/Copenhagen, Oslo/Norvège/Europe/Oslo, Stockholm/Suède/Europe/Stockholm, Helsinki/Finlande/Europe/Helsinki, Reykjavik/Islande/Atlantic/Reykjavik, Varsovie/Pologne/Europe/Warsaw, Prague/Tchéquie/Europe/Prague, Vienne/Autriche/Europe/Vienna, Budapest/Hongrie/Europe/Budapest, Athènes/Grèce/Europe/Athens, Bucarest/Roumanie/Europe/Bucharest, Kyiv/Ukraine/Europe/Kyiv, Istanbul/Turquie/Europe/Istanbul, Moscou/Russie/Europe/Moscow.
- Afrique : Le Caire/Égypte/Africa/Cairo, Casablanca/Maroc/Africa/Casablanca, Alger/Algérie/Africa/Algiers, Tunis/Tunisie/Africa/Tunis, Dakar/Sénégal/Africa/Dakar, Abidjan/Côte d'Ivoire/Africa/Abidjan, Lagos/Nigeria/Africa/Lagos, Kinshasa/RD Congo/Africa/Kinshasa, Nairobi/Kenya/Africa/Nairobi, Addis-Abeba/Éthiopie/Africa/Addis_Ababa, Johannesbourg/Afrique du Sud/Africa/Johannesburg, Le Cap/Afrique du Sud/Africa/Johannesburg, Antananarivo/Madagascar/Indian/Antananarivo, Saint-Denis/La Réunion/Indian/Reunion, Port-Louis/Maurice/Indian/Mauritius.
- Moyen-Orient et Asie : Jérusalem/Israël/Asia/Jerusalem, Beyrouth/Liban/Asia/Beirut, Riyad/Arabie saoudite/Asia/Riyadh, Dubaï/Émirats arabes unis/Asia/Dubai, Doha/Qatar/Asia/Qatar, Téhéran/Iran/Asia/Tehran, Kaboul/Afghanistan/Asia/Kabul, Karachi/Pakistan/Asia/Karachi, Bombay/Inde/Asia/Kolkata, New Delhi/Inde/Asia/Kolkata, Katmandou/Népal/Asia/Kathmandu, Dacca/Bangladesh/Asia/Dhaka, Rangoun/Birmanie/Asia/Yangon, Bangkok/Thaïlande/Asia/Bangkok, Hanoï/Viêt Nam/Asia/Ho_Chi_Minh, Hô Chi Minh-Ville/Viêt Nam/Asia/Ho_Chi_Minh, Phnom Penh/Cambodge/Asia/Phnom_Penh, Kuala Lumpur/Malaisie/Asia/Kuala_Lumpur, Singapour/Singapour/Asia/Singapore, Jakarta/Indonésie/Asia/Jakarta, Bali/Indonésie/Asia/Makassar, Manille/Philippines/Asia/Manila, Hong Kong/Chine/Asia/Hong_Kong, Pékin/Chine/Asia/Shanghai, Shanghai/Chine/Asia/Shanghai, Taipei/Taïwan/Asia/Taipei, Séoul/Corée du Sud/Asia/Seoul, Tokyo/Japon/Asia/Tokyo, Osaka/Japon/Asia/Tokyo, Oulan-Bator/Mongolie/Asia/Ulaanbaatar, Almaty/Kazakhstan/Asia/Almaty, Tachkent/Ouzbékistan/Asia/Tashkent, Novossibirsk/Russie/Asia/Novosibirsk, Vladivostok/Russie/Asia/Vladivostok.
- Océanie : Perth/Australie/Australia/Perth, Darwin/Australie/Australia/Darwin, Adélaïde/Australie/Australia/Adelaide, Brisbane/Australie/Australia/Brisbane, Sydney/Australie/Australia/Sydney, Melbourne/Australie/Australia/Melbourne, Nouméa/Nouvelle-Calédonie/Pacific/Noumea, Auckland/Nouvelle-Zélande/Pacific/Auckland, Fidji/Fidji/Pacific/Fiji, Papeete/Polynésie française/Pacific/Tahiti, Honolulu/États-Unis/Pacific/Honolulu.
- Amériques : Anchorage/États-Unis/America/Anchorage, Vancouver/Canada/America/Vancouver, Seattle/États-Unis/America/Los_Angeles, San Francisco/États-Unis/America/Los_Angeles, Los Angeles/États-Unis/America/Los_Angeles, Las Vegas/États-Unis/America/Los_Angeles, Phoenix/États-Unis/America/Phoenix, Denver/États-Unis/America/Denver, Mexico/Mexique/America/Mexico_City, Chicago/États-Unis/America/Chicago, Houston/États-Unis/America/Chicago, La Nouvelle-Orléans/États-Unis/America/Chicago, Atlanta/États-Unis/America/New_York, Miami/États-Unis/America/New_York, Washington/États-Unis/America/New_York, New York/États-Unis/America/New_York, Boston/États-Unis/America/New_York, Toronto/Canada/America/Toronto, Montréal/Canada/America/Toronto, Québec/Canada/America/Toronto, Halifax/Canada/America/Halifax, Saint-Pierre/Saint-Pierre-et-Miquelon/America/Miquelon, La Havane/Cuba/America/Havana, Port-au-Prince/Haïti/America/Port-au-Prince, Fort-de-France/Martinique/America/Martinique, Pointe-à-Pitre/Guadeloupe/America/Guadeloupe, Cayenne/Guyane/America/Cayenne, Bogota/Colombie/America/Bogota, Lima/Pérou/America/Lima, Caracas/Venezuela/America/Caracas, Quito/Équateur/America/Guayaquil, La Paz/Bolivie/America/La_Paz, Santiago/Chili/America/Santiago, Buenos Aires/Argentine/America/Argentina/Buenos_Aires, Montevideo/Uruguay/America/Montevideo, São Paulo/Brésil/America/Sao_Paulo, Rio de Janeiro/Brésil/America/Sao_Paulo, Manaus/Brésil/America/Manaus, Nuuk/Groenland/America/Nuuk.

Fonctions :

```ts
const KNOWN = new Set(CITIES.map((c) => c.tz));
export const isKnownTz = (tz: string): boolean => KNOWN.has(tz);

const fold = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function searchCities(query: string): City[] {
  const q = fold(query.trim());
  return q ? CITIES.filter((c) => fold(`${c.name} ${c.country}`).includes(q)) : [...CITIES];
}

// Décalage d'un fuseau sur UTC à l'instant donné, en minutes (heure d'été comprise). Formateurs mis en cache par fuseau.
const formatters = new Map<string, Intl.DateTimeFormat>();
export function tzOffsetMinutes(tz: string, at: Date): number {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    formatters.set(tz, f);
  }
  const parts = Object.fromEntries(f.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!);
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

// Heure d'une ville : heure de la scène décalée de l'écart entre la ville et l'appareil (la scène suit l'heure locale de l'appareil).
export function cityMinutes(sceneMinutes: number, tz: string, now: Date): number {
  const delta = tzOffsetMinutes(tz, now) - -now.getTimezoneOffset();
  return (((sceneMinutes + delta) % 1440) + 1440) % 1440;
}

export function cityClock(sceneMinutes: number, city: CityTime | undefined, now: Date): { h: number; m: number; s: number } {
  const m = city ? cityMinutes(sceneMinutes, city.tz, now) : ((Math.round(sceneMinutes) % 1440) + 1440) % 1440;
  return { h: Math.floor(m / 60), m: m % 60, s: now.getSeconds() };
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run tests/core/library/clock-cities.test.ts`
Expected: PASS. Puis activer le cas « fuseau inconnu » de la tâche 1 s'il était en `it.todo`, et relancer `npx vitest run tests/core/library/library-book-deco.test.ts` → PASS.

- [ ] **Step 5: Rattacher et committer**

Dans `tests/familles.ts`, famille `scene-piece`, ajouter `'clock-cities.*', 'deco.*', 'deco-weather.*', 'text-fit.*'` à la liste `lib(...)` et `'deco-art.*', 'library-deco*', 'city-picker-dialog.*', 'deco-text-dialog.*'` à la liste `c(...)`. Run `npx vitest run tests/familles.test.ts` → PASS.

```bash
git add src/core/library/clock-cities.ts tests/core/library/clock-cities.test.ts tests/familles.ts
git commit -m "feat(bibliotheque): villes et heure d'une ville pour les horloges"
```

---

### Task 3: Météo affichée (température, baromètre, pictogramme)

**Files:**
- Create: `src/core/library/deco-weather.ts`
- Modify: `src/content/use-weather.ts:9` et `:98-104`
- Test: `tests/core/library/deco-weather.test.ts`

**Interfaces:**
- Consumes : `plausibleTempC(lat, date)` (`weather/weather-plan.ts`), `WeatherState` (`library-types.ts`).
- Produces : `type DecoWeather = { state: WeatherState; label: string; tempC: number; night: boolean }`, `shownTempC(input: { realTempC: number | null; lat: number; now: Date; state: WeatherState; night: boolean }): number`, `BAROMETER_ANGLE: Record<WeatherState, number>`, `iconOf(state, night): 'sun' | 'moon' | WeatherState`. `WeatherView` reçoit `state: WeatherState`.

- [ ] **Step 1: Écrire les tests (échouent)**

```ts
import { describe, expect, it } from 'vitest';
import { BAROMETER_ANGLE, iconOf, shownTempC } from '../../../src/core/library/deco-weather';
import { plausibleTempC } from '../../../src/core/library/weather/weather-plan';

const now = new Date('2026-10-14T12:00:00Z');
const base = { realTempC: null, lat: 47.47, now, state: 'cloudy' as const, night: false };

describe('météo des météomètres', () => {
  it('la mesure réelle passe avant la température plausible', () => {
    expect(shownTempC({ ...base, realTempC: 9.6 })).toBe(10);
  });
  it('sinon, la température plausible du lieu, arrondie, plus fraîche la nuit', () => {
    expect(shownTempC(base)).toBe(Math.round(plausibleTempC(47.47, now)));
    expect(shownTempC({ ...base, night: true })).toBe(Math.round(plausibleTempC(47.47, now) - 2));
  });
  it('jamais au-dessus de 0 °C quand il neige', () => {
    expect(shownTempC({ ...base, state: 'snow' })).toBeLessThanOrEqual(0);
  });
  it('angle du baromètre par état, du plus mauvais au plus beau', () => {
    expect(BAROMETER_ANGLE).toEqual({ storm: -118, rain: -70, snow: -55, drizzle: -45, fog: -20, cloudy: 0, sun: 70 });
  });
  it('lune à la place du soleil la nuit', () => {
    expect(iconOf('sun', true)).toBe('moon');
    expect(iconOf('sun', false)).toBe('sun');
    expect(iconOf('rain', true)).toBe('rain');
  });
});
```

- [ ] **Step 2: Lancer pour voir l'échec**

Run: `npx vitest run tests/core/library/deco-weather.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

```ts
import type { WeatherState } from './library-types';
import { plausibleTempC } from './weather/weather-plan';

// Ce que montrent les météomètres : état, libellé, température et nuit (lune au lieu du soleil).
export type DecoWeather = { state: WeatherState; label: string; tempC: number; night: boolean };

// Mesure réelle si on l'a (météo réelle) ; sinon température plausible du lieu et de la saison, −2 °C la nuit, 0 °C au plus sous la neige.
export function shownTempC(input: { realTempC: number | null; lat: number; now: Date; state: WeatherState; night: boolean }): number {
  if (input.realTempC !== null) return Math.round(input.realTempC);
  const t = Math.round(plausibleTempC(input.lat, input.now) - (input.night ? 2 : 0));
  return input.state === 'snow' ? Math.min(0, t) : t;
}

// Position de l'aiguille du baromètre (degrés, 0 = « Variable » en haut), de « Tempête » (−120°) à « Très sec » (+120°).
export const BAROMETER_ANGLE: Record<WeatherState, number> = { storm: -118, rain: -70, snow: -55, drizzle: -45, fog: -20, cloudy: 0, sun: 70 };

export const iconOf = (state: WeatherState, night: boolean): 'moon' | WeatherState => (state === 'sun' && night ? 'moon' : state);
```

Dans `use-weather.ts` : ajouter `state: WeatherState` à `WeatherView`, tenir un état `const [state, setState] = useState<WeatherState>('cloudy')` mis à jour dans `sync()` à côté de `setLabel` (`const s = nearestState(w); setState(s); setLabel(WEATHER_LABEL[s]);`), et le renvoyer. Vérifier que `tests/content/use-weather.test.*` passe toujours.

- [ ] **Step 4: Lancer les tests**

Run: `npx tsc --noEmit && npx vitest run tests/core/library/deco-weather.test.ts && npm run test:famille -- scene-meteo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/deco-weather.ts src/content/use-weather.ts tests/core/library/deco-weather.test.ts
git commit -m "feat(bibliotheque): température et aiguille des météomètres"
```

---

### Task 4: Ajustement du texte des panneaux

**Files:**
- Create: `src/core/library/text-fit.ts`
- Test: `tests/core/library/text-fit.test.ts`

**Interfaces:**
- Produces : `type Measure = (text: string, size: number) => number` (largeur à la taille `size`), `fitText(text: string, box: { w: number; h: number }, measure: Measure, lineHeight: number): { size: number; lines: string[] }`.

- [ ] **Step 1: Écrire les tests (échouent)**

```ts
import { describe, expect, it } from 'vitest';
import { fitText } from '../../../src/core/library/text-fit';

// Police à chasse fixe : chaque caractère fait 0,5 × la taille.
const mono = (text: string, size: number) => text.length * size * 0.5;

describe('texte des panneaux', () => {
  it('garde une ligne courte en grand', () => {
    const r = fitText('Bonjour', { w: 100, h: 40 }, mono, 1.2);
    expect(r.lines).toEqual(['Bonjour']);
    expect(r.size).toBeGreaterThan(25);
  });
  it('passe à la ligne aux espaces et respecte les retours voulus', () => {
    const r = fitText('Menu du jour\nSoupe de potiron et tarte', { w: 60, h: 60 }, mono, 1.2);
    expect(r.lines[0]).toBe('Menu du jour');
    expect(r.lines.length).toBeGreaterThanOrEqual(3);
    for (const l of r.lines) expect(mono(l, r.size)).toBeLessThanOrEqual(60 + 1e-9);
    expect(r.lines.length * r.size * 1.2).toBeLessThanOrEqual(60 + 1e-9);
  });
  it('la taille diminue quand le texte s allonge et augmente quand le panneau grandit', () => {
    const short = fitText('Salut', { w: 80, h: 40 }, mono, 1.2).size;
    const long = fitText('Salut à toute la famille réunie', { w: 80, h: 40 }, mono, 1.2).size;
    const bigger = fitText('Salut à toute la famille réunie', { w: 160, h: 80 }, mono, 1.2).size;
    expect(long).toBeLessThan(short);
    expect(bigger).toBeGreaterThan(long);
  });
  it('un mot trop long reste seul sur sa ligne à la taille minimale', () => {
    const r = fitText('Anticonstitutionnellement', { w: 10, h: 10 }, mono, 1.2);
    expect(r.lines).toEqual(['Anticonstitutionnellement']);
    expect(r.size).toBe(1.5);
  });
  it('texte vide : aucune ligne', () => {
    expect(fitText('   ', { w: 50, h: 50 }, mono, 1.2).lines).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer pour voir l'échec**

Run: `npx vitest run tests/core/library/text-fit.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

```ts
// Mesure d'une ligne (largeur) à une taille de police donnée, fournie par l'appelant (canevas caché dans la pièce, chasse fixe en test).
export type Measure = (text: string, size: number) => number;

const MIN_SIZE = 1.5;
const STEP = 0.25;

function wrap(text: string, w: number, size: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (!cur || measure(next, size) <= w) cur = next;
      else {
        lines.push(cur);
        cur = word;
      }
    }
    lines.push(cur);
  }
  // Lignes vides en bout de texte retirées ; une ligne vide au milieu (double retour) est gardée.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// Plus grande taille (pas de 0,25) à laquelle le texte, passé à la ligne aux espaces, tient dans la boîte ; à défaut, la taille minimale.
export function fitText(text: string, box: { w: number; h: number }, measure: Measure, lineHeight: number): { size: number; lines: string[] } {
  if (!text.trim()) return { size: MIN_SIZE, lines: [] };
  for (let size = Math.floor(box.h / STEP) * STEP; size >= MIN_SIZE; size -= STEP) {
    const lines = wrap(text, box.w, size, measure);
    if (lines.length * size * lineHeight <= box.h && lines.every((l) => measure(l, size) <= box.w)) return { size, lines };
  }
  return { size: MIN_SIZE, lines: wrap(text, box.w, MIN_SIZE, measure) };
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run tests/core/library/text-fit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/text-fit.ts tests/core/library/text-fit.test.ts
git commit -m "feat(bibliotheque): ajustement du texte des panneaux"
```

---

### Task 5: Polices intégrées et dessin SVG des objets muraux

**Files:**
- Create: `src/content/deco-fonts.ts`, `src/content/deco-art.tsx`
- Modify: `package.json` (dépendances `@fontsource/caveat`, `@fontsource/oswald`, `@fontsource/pacifico`, `@fontsource/patrick-hand`)
- Test: `tests/content/deco-art.test.tsx`

**Interfaces:**
- Consumes : `DecoPlaced`, `decoSizeOf` (tâche 1), `cityClock` (tâche 2), `DecoWeather`, `BAROMETER_ANGLE`, `iconOf` (tâche 3), `fitText` (tâche 4), `Palette`/`StyleId` (`styles.ts`), `PxRect` (`room-grid.ts`).
- Produces :
  - `deco-fonts.ts` : `PANEL_FONTS: Record<'panel-chalk'|'panel-letter'|'panel-neon'|'panel-cork', { family: string; weight: number; lineHeight: number; fallback: string; upper?: true }>`, `ensureDecoFonts(doc?: Document): void`, `measureWith(family: string, weight: number): Measure`.
  - `deco-art.tsx` : `type DecoView = { time: { h: number; m: number; s: number }; city?: string; weather: DecoWeather; daylight: number; editing: boolean }`, `DecoArt({ placed, rect, style, palette, view }): ReactElement`, et les faces de table `TableFace({ item: 'alarm'|'clock'|'station', w, h, style, view }): ReactElement` (cadre propre `0 0 w h`).

- [ ] **Step 1: Ajouter les polices**

Run: `npm install --save @fontsource/caveat@5 @fontsource/oswald@5 @fontsource/pacifico@5 @fontsource/patrick-hand@5`

`deco-fonts.ts` :

```ts
import caveat from '@fontsource/caveat/files/caveat-latin-600-normal.woff2?inline';
import oswald from '@fontsource/oswald/files/oswald-latin-500-normal.woff2?inline';
import pacifico from '@fontsource/pacifico/files/pacifico-latin-400-normal.woff2?inline';
import patrick from '@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff2?inline';
import type { Measure } from '../core/library/text-fit';

// Polices des panneaux (licence OFL), réduites au latin et intégrées au paquet (extension et Android). Déclarées dans le document de la page
// (une déclaration dans une racine fantôme ne charge pas de police) ; si la page les refuse, `fallback` garde le panneau lisible.
export const PANEL_FONTS = {
  'panel-chalk': { family: 'WMT Caveat', weight: 600, lineHeight: 1.05, fallback: '"Segoe Print", "Comic Sans MS", cursive' },
  'panel-letter': { family: 'WMT Oswald', weight: 500, lineHeight: 1.25, fallback: '"Arial Narrow", "Roboto Condensed", sans-serif', upper: true },
  'panel-neon': { family: 'WMT Pacifico', weight: 400, lineHeight: 1.25, fallback: '"Brush Script MT", cursive' },
  'panel-cork': { family: 'WMT Patrick Hand', weight: 400, lineHeight: 1.15, fallback: '"Segoe Print", cursive' },
} as const;

const FACES: [string, number, string][] = [['WMT Caveat', 600, caveat], ['WMT Oswald', 500, oswald], ['WMT Pacifico', 400, pacifico], ['WMT Patrick Hand', 400, patrick]];
const STYLE_ID = 'wmt-deco-fonts';

export function ensureDecoFonts(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = FACES.map(([family, weight, url]) => `@font-face{font-family:"${family}";font-weight:${weight};font-display:swap;src:url(${url}) format("woff2");}`).join('');
  (doc.head ?? doc.documentElement).append(style);
}

// Mesure d'une ligne par un canevas caché (unité : celle de `size`) ; sans canevas (tests), chasse moyenne de 0,55.
let ctx: CanvasRenderingContext2D | null | undefined;
export function measureWith(family: string, weight: number): Measure {
  return (text, size) => {
    if (ctx === undefined) ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext?.('2d') ?? null : null;
    if (!ctx) return text.length * size * 0.55;
    ctx.font = `${weight} ${size * 10}px "${family}"`;
    return ctx.measureText(text).width / 10;
  };
}
```

Si TypeScript refuse l'import `?inline`, ajouter dans `src/env.d.ts` (ou le fichier de déclarations existant) : `declare module '*.woff2?inline' { const src: string; export default src; }`. Vérifier que `vite.android.config.ts` construit aussi ces imports (Vite gère `?inline` nativement).

- [ ] **Step 2: Écrire les tests du dessin (échouent)**

`tests/content/deco-art.test.tsx` :

```tsx
// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DecoArt, TableFace, type DecoView } from '../../src/content/deco-art';
import { DECO_KINDS } from '../../src/core/library/deco';
import { STYLE_IDS } from '../../src/core/library/library-types';
import { paletteOf } from '../../src/core/library/styles';

const view: DecoView = { time: { h: 10, m: 10, s: 30 }, weather: { state: 'sun', label: 'Soleil', tempC: 18, night: false }, daylight: 1, editing: false };
const rect = { x: 0, y: 0, w: 120, h: 90 };
const draw = (placed: Parameters<typeof DecoArt>[0]['placed'], style = 'scandinave' as (typeof STYLE_IDS)[number], v = view) =>
  renderToStaticMarkup(<svg><DecoArt placed={placed} rect={rect} style={style} palette={paletteOf(style)} view={v} /></svg>);

describe('dessin des objets décoratifs', () => {
  it('chaque objet se dessine dans les 8 styles', () => {
    for (const style of STYLE_IDS) for (const deco of DECO_KINDS) {
      const html = draw({ id: 'f1', kind: 'deco', deco, col: 0, row: 0 }, style);
      expect(html).toContain(`data-deco="${deco}"`);
    }
  });
  it('le nom de la ville n apparaît que si elle est choisie', () => {
    expect(draw({ id: 'f1', kind: 'deco', deco: 'wall-clock', col: 0, row: 0 })).not.toContain('data-city');
    expect(draw({ id: 'f1', kind: 'deco', deco: 'wall-clock', col: 0, row: 0 }, 'scandinave', { ...view, city: 'Tokyo' })).toContain('TOKYO');
  });
  it('l horloge numérique a des tubes Nixie en Steampunk', () => {
    expect(draw({ id: 'f1', kind: 'deco', deco: 'digital-clock', col: 0, row: 0 }, 'steampunk')).toContain('data-nixie');
  });
  it('la station affiche la température et la lune la nuit', () => {
    const night = { ...view, weather: { ...view.weather, night: true } };
    const html = draw({ id: 'f1', kind: 'deco', deco: 'weather-station', col: 0, row: 0 }, 'scandinave', night);
    expect(html).toContain('18°');
    expect(html).toContain('data-icon="moon"');
  });
  it('le néon a un halo de sa couleur seulement quand il fait sombre', () => {
    const neon = { id: 'f1', kind: 'deco' as const, deco: 'panel-neon' as const, col: 0, row: 0, w: 5, h: 2, text: 'Hello', neon: 'cyan' as const };
    expect(draw(neon, 'scandinave', { ...view, daylight: 0 })).toMatch(/data-neon-halo[^>]*#00E5FF|#00E5FF[^>]*data-neon-halo/);
    expect(draw(neon, 'scandinave', { ...view, daylight: 1 })).not.toContain('data-neon-halo');
  });
  it('un panneau vide invite à écrire en Aménager seulement', () => {
    const empty = { id: 'f1', kind: 'deco' as const, deco: 'panel-chalk' as const, col: 0, row: 0, w: 4, h: 3 };
    expect(draw(empty, 'scandinave', { ...view, editing: true })).toContain('Touchez pour écrire');
    expect(draw(empty)).not.toContain('Touchez pour écrire');
  });
  it('le tableau à lettres écrit en capitales', () => {
    expect(draw({ id: 'f1', kind: 'deco', deco: 'panel-letter', col: 0, row: 0, w: 4, h: 3, text: 'Bienvenue' })).toContain('BIENVENUE');
  });
  it('les faces de table se dessinent', () => {
    for (const item of ['alarm', 'clock', 'station'] as const) {
      expect(renderToStaticMarkup(<svg><TableFace item={item} w={150} h={70} style="neon" view={view} /></svg>)).toContain(`data-table-face="${item}"`);
    }
  });
});
```

- [ ] **Step 3: Lancer pour voir l'échec**

Run: `npx vitest run tests/content/deco-art.test.tsx`
Expected: FAIL (module absent).

- [ ] **Step 4: Écrire `deco-art.tsx`**

Porter en composants React SVG les fonctions de dessin de la maquette validée (`docs/superpowers/maquettes/horloges-meteo-panneau/horloges-meteo-panneau.html`), **à l'identique de forme et de couleurs** (l'utilisateur veut coller à la maquette) :

| Maquette (JS) | Composant / fonction (`deco-art.tsx`) | Remarques |
|---|---|---|
| `wallClock` + `hands` | `WallClock` + `Hands` | variantes par style : `k` = `StyleId` (`scandinave`, `moderne`, `industriel`, `boheme`, `retro70`, `japandi`, `neon`, `steampunk`) |
| `digitalClock` + `digit` + `sevenTime` + `ledColors` | `DigitalClock`, `Seven`, `ledColorsOf(style)` | Steampunk : groupe `data-nixie=""` ; deux points visibles quand `s` est pair |
| `weatherStation` + `screenTheme` + `wicon` | `WeatherStation`, `screenThemeOf(style)`, `WeatherIcon` | `WeatherIcon` porte `data-icon={iconOf(state, night)}` ; texte `${tempC}°` |
| `barometer` | `Barometer` | angle = `BAROMETER_ANGLE[state]` ; `style={{ transition: 'transform .6s' }}` sur l'aiguille (rotation par `transform`) |
| `panel` + `textBlock` | `Panel` + `PanelText` | `PanelText` utilise `fitText(text, box, measureWith(font.family, font.weight), font.lineHeight)` avec `fontFamily={`"${font.family}", ${font.fallback}`}` ; `upper` → `text.toUpperCase()` |
| `deskAlarm`, `deskClock`, `deskStation` | `TableFace` | seulement la face (écran ou cadran) dans un cadre `0 0 w h` : le corps est le modèle 3D (tâche 9) |

Règles de portage :
- Unités : la maquette dessine en cm ; ici chaque objet est dessiné dans son `rect` (px) par un `<g transform={`translate(${rect.x} ${rect.y}) scale(${rect.w / W} ${rect.h / H})`}>` où `W × H` est la taille en cm de la maquette (horloge 32 × 32, numérique 40 × 16, station 34 × 22, baromètre 26 × 50, panneau `w·21 × h·21`). Le dessin est centré si le rapport diffère.
- Couleurs de la palette : `palette.wood`, `palette.woodDark`, `palette.metal`… via `paletteOf(style)` (mêmes noms que la maquette ; si un nom manque dans `Palette`, prendre la couleur fixe de la maquette).
- Trait encré : `stroke="#3A2620"`, `strokeWidth={1.3}`, `vectorEffect="non-scaling-stroke"` ; ombre nette : même chemin en `rgba(30,20,40,.22)` décalé de `(1.1, 1.4)` cm, dessiné avant.
- `color-mix(...)` de la maquette : le remplacer par une couleur calculée (`mix(hexA, hexB, k)`, petite fonction locale), car `color-mix` n'est pas sûr sur le WebView Android 113.
- `filter: drop-shadow` (lueurs) : remplacé par un second tracé plus épais à `opacity 0.35` dessous (pas de filtre : coûteux sur Android).
- Halo du néon : `<ellipse data-neon-halo="" fill={NEON_COLORS[neon]} opacity={0.35 * (1 - daylight)} …>` derrière la plaque, rendu seulement si `daylight < 0.95`, `pointerEvents="none"`.
- Nom de ville : `<text data-city="">{city.toUpperCase()}</text>` seulement si `view.city`.
- Panneau vide (`!text?.trim()`) et `view.editing` : texte gris « ✏️ Touchez pour écrire ».
- Racine de chaque objet : `<g data-deco={placed.deco}>`.
- En tête du fichier : le commentaire « Dessin provisoire Opus… » des contraintes globales.

`DecoArt` :

```tsx
export function DecoArt({ placed, rect, style, palette, view }: { placed: DecoPlaced; rect: PxRect; style: StyleId; palette: Palette; view: DecoView }): ReactElement {
  switch (placed.deco) {
    case 'wall-clock': return <WallClock rect={rect} style={style} palette={palette} view={view} />;
    case 'digital-clock': return <DigitalClock rect={rect} style={style} palette={palette} view={view} />;
    case 'weather-station': return <WeatherStation rect={rect} style={style} palette={palette} view={view} />;
    case 'barometer': return <Barometer rect={rect} style={style} palette={palette} view={view} />;
    default: return <Panel placed={placed} rect={rect} palette={palette} view={view} />;
  }
}
```

- [ ] **Step 5: Lancer les tests**

Run: `npx tsc --noEmit && npx vitest run tests/content/deco-art.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/content/deco-fonts.ts src/content/deco-art.tsx src/env.d.ts tests/content/deco-art.test.tsx
git commit -m "feat(bibliotheque): dessin des horloges, météomètres et panneaux (dessin Opus, Fable n'est pas passé)"
```

---

### Task 6: Rendu dans la pièce (heure, météo, minuteur)

**Files:**
- Create: `src/content/use-clock-tick.ts`
- Modify: `src/content/RoomView.tsx:53-58` (`SceneView`), `:256-305` (`artOf`), `:518-523` (`wallLevel`), `:580-590` (copie sélectionnée) ; `src/content/LibraryPanel.tsx:287-295` (`sceneView`)
- Test: `tests/content/library-deco-room.test.tsx`

**Interfaces:**
- Consumes : `DecoArt`, `DecoView` (tâche 5), `cityClock` (tâche 2), `shownTempC` (tâche 3), `currentPosition()` (`scene-position.ts`), `WeatherView.state/label/tempC`.
- Produces : `useClockTick(active: boolean): Date` (nouvelle date chaque seconde quand `active` et la page visible) ; `SceneView.deco?: { state: WeatherState; label: string; tempC: number | null }`.

- [ ] **Step 1: Écrire le test (échoue)**

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { createMemoryStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import { updateLayout } from '../../src/core/library/library-book';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let repo: LibraryRepo;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 9, 14, 10, 10, 0));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
  await repo.update((s) => updateLayout(s, s.rooms[0]!.id, (l) => [...l,
    { id: 'c1', kind: 'deco', deco: 'digital-clock', col: 2, row: 1 },
    { id: 'c2', kind: 'deco', deco: 'digital-clock', col: 6, row: 1, city: { name: 'Tokyo', tz: 'Asia/Tokyo' } },
    { id: 'm1', kind: 'deco', deco: 'weather-station', col: 10, row: 1 },
  ]));
  await settle();
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

describe('objets décoratifs dans la pièce', () => {
  it('sont dessinés au niveau du mur', () => {
    const wall = container.querySelector('[data-depth="0"]')!;
    expect(wall.querySelectorAll('[data-deco]')).toHaveLength(3);
    expect(container.querySelector('[data-id="c1"] [data-deco="digital-clock"]')).not.toBeNull();
  });
  it('l horloge de la scène et celle de Tokyo n affichent pas la même heure', () => {
    const label = (id: string) => container.querySelector(`[data-id="${id}"] [data-time]`)!.getAttribute('data-time');
    expect(label('c1')).toBe('10:10');
    expect(label('c2')).not.toBe('10:10');
    expect(container.querySelector('[data-id="c2"]')!.textContent).toContain('TOKYO');
  });
  it('les secondes avancent avec le minuteur', async () => {
    const sec = () => container.querySelector('[data-id="c1"] [data-seconds]')!.getAttribute('data-seconds');
    const before = sec();
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(sec()).not.toBe(before);
  });
});
```

(`DigitalClock` et `WallClock` posent `data-time="HH:MM"` et `data-seconds={s}` sur leur racine : l'ajouter à la tâche 5 si ce n'est pas fait.)

- [ ] **Step 2: Lancer pour voir l'échec**

Run: `npx vitest run tests/content/library-deco-room.test.tsx`
Expected: FAIL (aucun `[data-deco]` dans la pièce).

- [ ] **Step 3: Écrire `use-clock-tick.ts`**

```ts
import { useEffect, useState } from 'react';

// Date relue chaque seconde tant que `active` (une horloge est dans la pièce affichée) et que la page est visible ; sinon figée (aucun minuteur).
export function useClockTick(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    let timer: number | undefined;
    const start = () => { if (timer === undefined && document.visibilityState !== 'hidden') timer = window.setInterval(() => setNow(new Date()), 1000); };
    const stop = () => { if (timer !== undefined) window.clearInterval(timer); timer = undefined; };
    const onVis = () => { if (document.visibilityState === 'hidden') stop(); else { setNow(new Date()); start(); } };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [active]);
  return now;
}
```

- [ ] **Step 4: Brancher la météo et l'heure**

`LibraryPanel.tsx`, dans le `useMemo` de `sceneView`, ajouter `deco: { state: weather.state, label: weather.label, tempC: weather.tempC }` et `weather.state, weather.label, weather.tempC` aux dépendances. `RoomView.tsx` : `SceneView` reçoit `deco?: { state: WeatherState; label: string; tempC: number | null }`.

Dans `RoomView`, avant `artOf` :

```tsx
  const hasDeco = room.layout.some((p) => p.kind === 'deco' || (p.kind === 'small' && (p.item === 'alarm' || p.item === 'clock' || p.item === 'station')));
  const now = useClockTick(hasDeco);
  const night = view.sky.phase === 'night';
  const decoWeather: DecoWeather = {
    state: view.deco?.state ?? 'cloudy',
    label: view.deco?.label ?? '',
    night,
    tempC: shownTempC({ realTempC: view.deco?.tempC ?? null, lat: currentPosition().lat, now, state: view.deco?.state ?? 'cloudy', night }),
  };
  const decoView = (city?: CityTime): DecoView => ({ time: cityClock(view.minutes, city, now), city: city?.name, weather: decoWeather, daylight: view.sky.daylight, editing });
```

(`view` est le nom local de `sceneView ?? DEFAULT_VIEW` dans `RoomView` ; reprendre le nom réel du fichier.) Les hooks doivent être appelés avant tout `return` anticipé du composant.

Dans `artOf`, avant `const cells = rectOf(placed)` :

```tsx
    if (placed.kind === 'deco') {
      const rect = pxRect(rectOf(placed)!);
      return { rect, art: <DecoArt placed={placed} rect={rect} style={room.style} palette={palette} view={decoView(placed.city)} /> };
    }
```

Dans `wallLevel`, après les fenêtres : `{room.layout.map((p) => (p.kind === 'deco' ? renderPlaced(p) : null))}`. Dans la copie sélectionnée (L580-590), traiter `deco` comme `window` (même branche `renderPlaced`).

- [ ] **Step 5: Lancer les tests**

Run: `npx tsc --noEmit && npx vitest run tests/content/library-deco-room.test.tsx && npm run test:famille -- scene-piece`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/content/use-clock-tick.ts src/content/RoomView.tsx src/content/LibraryPanel.tsx tests/content/library-deco-room.test.tsx
git commit -m "feat(bibliotheque): horloges et météomètres vivants dans la pièce"
```

---

### Task 7: Tiroir, pose, déplacement et taille des panneaux

**Files:**
- Modify: `src/core/library/library-types.ts:21` (`FurnitureKind`), `src/core/library/furniture-catalog.ts:58-130` (`LABELS`, `CATEGORIES`, `SUBCATEGORIES`, `Subcategory`), `src/content/furniture-thumb.tsx`, `src/content/placement.ts:46-150`, `src/content/furniture-drag.ts:96-125`, `src/content/LibraryPanel.tsx:755-783` et `:1033-1105`
- Test: `tests/content/library-deco-place.test.tsx`, `tests/core/library/furniture-catalog.test.ts` (mise à jour)

**Interfaces:**
- Consumes : `hangDeco`, `moveDeco`, `decoFit`, `resizeDeco`, `decoSizeOf` (tâche 1), `DecoArt` (tâche 5).
- Produces : `FurnitureKind` inclut `DecoKind` ; `isDecoKind(kind: FurnitureKind): kind is DecoKind` (`furniture-catalog.ts`) ; sous-catégorie `'clocks'` (« Horloges et météo ») ; `Edit` `size` s'applique aussi aux panneaux.

- [ ] **Step 1: Écrire les tests (échouent)**

Dans `tests/core/library/furniture-catalog.test.ts`, ajouter :

```ts
it('range les horloges, météomètres et panneaux dans Déco', () => {
  const deco = catalogTree('scandinave').find((c) => c.id === 'deco')!;
  expect(deco.subcategories.find((s) => s.id === 'clocks')).toMatchObject({ label: 'Horloges et météo', kinds: ['wall-clock', 'digital-clock', 'weather-station', 'barometer', 'small-alarm', 'small-clock', 'small-station'] });
  expect(deco.subcategories.find((s) => s.id === 'walls')!.kinds).toEqual(['window', 'panel-chalk', 'panel-letter', 'panel-neon', 'panel-cork']);
  expect(labelOf('panel-letter')).toBe('Tableau à lettres');
});
```

(Les kinds `small-*` arrivent à la tâche 9 : jusque-là, écrire le test sans eux et les ajouter à la tâche 9.)

`tests/content/library-deco-place.test.tsx` (même installation que `tests/content/library-window-furniture.test.tsx` : copier son `beforeEach`, `click`, `confirm`) :

```tsx
it('pose un panneau ardoise depuis le tiroir, case touchée = coin bas-gauche', async () => {
  await click('[data-category="deco"]');
  await click('[data-subcategory="walls"]');
  await click('[data-kind="panel-chalk"]');
  await click('[data-cell="3-6"]');
  await confirm();
  const panel = layout().find((p) => p.kind === 'deco');
  expect(panel).toMatchObject({ deco: 'panel-chalk', col: 3, row: 4, w: 4, h: 3 });
});

it('agrandit et rétrécit un panneau avec la bulle, dans ses bornes', async () => {
  await addPanelAt(3, 6); // pose comme ci-dessus
  await click(`[data-id="${panelId()}"]`);
  await click('[data-action="deco-w+"]');
  expect(panel()).toMatchObject({ w: 5, h: 3 });
  for (let i = 0; i < 5; i++) await click('[data-action="deco-h-"]');
  expect(panel()).toMatchObject({ h: 2 });
  expect(container.textContent).toContain('Le panneau ne peut pas être plus petit.');
});

it('refuse d agrandir un panneau contre une fenêtre (cases qui clignotent)', async () => {
  await addWindowAt(8, 6);
  await addPanelAt(3, 6);
  await click(`[data-id="${panelId()}"]`);
  for (let i = 0; i < 2; i++) await click('[data-action="deco-w+"]');
  expect(panel()!.w).toBeLessThanOrEqual(5);
  expect(container.querySelector('[data-blink]')).not.toBeNull();
});

it('une horloge n a pas de boutons de taille', async () => {
  await click('[data-category="deco"]');
  await click('[data-subcategory="clocks"]');
  await click('[data-kind="wall-clock"]');
  await click('[data-cell="3-6"]');
  await confirm();
  await click(`[data-id="${layout().find((p) => p.kind === 'deco')!.id}"]`);
  expect(container.querySelector('[data-action="deco-w+"]')).toBeNull();
});
```

Écrire les petits utilitaires du fichier (`layout()`, `panel()`, `panelId()`, `addPanelAt(col,row)`, `addWindowAt(col,row)`) en lisant l'état du `repo` comme le fait `library-window-furniture.test.tsx`. Vérifier le nom réel de l'attribut des cases qui clignotent dans `RoomView` (`blink`) et adapter `[data-blink]`.

- [ ] **Step 2: Lancer pour voir l'échec**

Run: `npx vitest run tests/content/library-deco-place.test.tsx tests/core/library/furniture-catalog.test.ts`
Expected: FAIL.

- [ ] **Step 3: Catalogue et vignettes**

- `library-types.ts` : `export type FurnitureKind = StandingKind | 'computer' | 'window' | SmallKind | DecoKind;`
- `furniture-catalog.ts` :
  - `LABELS` : `'wall-clock': 'Horloge à aiguilles'`, `'digital-clock': 'Horloge numérique'`, `'weather-station': 'Station météo'`, `barometer: 'Baromètre'`, `'panel-chalk': 'Ardoise'`, `'panel-letter': 'Tableau à lettres'`, `'panel-neon': 'Néon'`, `'panel-cork': 'Tableau en liège'`.
  - `CATEGORIES` `deco` : ajouter les 8 kinds après `'window'`.
  - `Subcategory` : ajouter `'clocks'` ; `SUBCATEGORIES.deco` : insérer `{ id: 'clocks', label: 'Horloges et météo', kinds: ['wall-clock', 'digital-clock', 'weather-station', 'barometer'] }` avant `walls`, et `walls.kinds = ['window', 'panel-chalk', 'panel-letter', 'panel-neon', 'panel-cork']`.
  - `export const isDecoKind = (kind: FurnitureKind): kind is DecoKind => (DECO_KINDS as readonly string[]).includes(kind);`
- `furniture-thumb.tsx` : `cellsOf` → `if (isDecoKind(kind)) return decoDefaultSize(kind);` ; `artOf` → `if (isDecoKind(kind)) return <DecoArt placed={{ id: 'thumb', kind: 'deco', deco: kind, col: 0, row: 0, ...(isPanel(kind) ? { ...decoDefaultSize(kind), text: 'Abc' } : {}) }} rect={rect} style={style} palette={palette} view={THUMB_VIEW} />;` avec `const THUMB_VIEW: DecoView = { time: { h: 10, m: 10, s: 0 }, weather: { state: 'sun', label: 'Soleil', tempC: 18, night: false }, daylight: 1, editing: false };`

- [ ] **Step 4: Pose et déplacement (`placement.ts`, `furniture-drag.ts`)**

`placement.ts` :
- `probeOf` : `if (isDecoKind(kind)) return { id: DRAFT_ID, kind: 'deco', deco: kind, col: 0, row: 0, ...(isPanel(kind) ? decoDefaultSize(kind) : {}) };`
- `build`, branche `move` : `if (item.kind === 'deco') return withItemAt(base, p.id, t.col, t.top);` (comme la fenêtre : la taille retouchée est rejouée ensuite).
- `build`, objet neuf : `if (isDecoKind(kind)) return t.col !== undefined && t.top !== undefined ? withItemAt(withProbe(base, p.probe), DRAFT_ID, t.col, t.top) : null;`
- `applyEdit` `size` : `return layout.find((x) => x.id === id)?.kind === 'deco' ? resizeDeco(layout, cols, id, e.w, e.h) : resizeWindow(layout, cols, id, e.w, e.h);`

`furniture-drag.ts`, `dropTargetFor`, après la branche `window` :

```ts
  if (item.kind === 'deco') {
    const { w, h } = decoSizeOf(item);
    const top = row - h + 1;
    const ghost: Rect = { col, row: top, w, h };
    const check = canHangRect(layout, cols, w, h, col, top, id);
    if (check.ok) return { ok: true, cells: [], ghost, col, top };
    return { ok: false, reason: check.reason, cells: check.cells, ghost, col, top };
  }
```

- [ ] **Step 5: Boutons de taille (`LibraryPanel.tsx`)**

À côté de `selectedWindow` :

```tsx
  const selectedPanel = editing ? layout.find((p): p is DecoPlaced => p.id === selectedId && p.kind === 'deco' && isPanel(p.deco)) : undefined;
  const resizePanel = (dw: number, dh: number): void => {
    if (!selectedPanel) return;
    const { w: w0, h: h0 } = decoSizeOf(selectedPanel);
    const [w, h] = [w0 + dw, h0 + dh];
    const check = decoFit(layout, room.cols, selectedPanel.id, w, h);
    if (!check.ok) {
      const limit = w < PANEL_MIN.w || h < PANEL_MIN.h ? 'Le panneau ne peut pas être plus petit.' : w > PANEL_MAX.w || h > PANEL_MAX.h ? 'Le panneau ne peut pas être plus grand.' : REASONS[check.reason];
      return refuse(limit, check.cells);
    }
    setMessage('');
    void editLayout((l, cols) => resizeDeco(l, cols, selectedPanel.id, w, h));
  };
```

Dans la bulle (après le bloc `selectedWindow`) :

```tsx
            {selectedPanel && (
              <>
                <Btn label="Panneau plus étroit" data={{ action: 'deco-w-' }} onClick={() => resizePanel(-1, 0)}><Icon paths={ICONS.widthMinus} /></Btn>
                <Btn label="Panneau plus large" data={{ action: 'deco-w+' }} onClick={() => resizePanel(1, 0)}><Icon paths={ICONS.widthPlus} /></Btn>
                <Btn label="Panneau moins haut" data={{ action: 'deco-h-' }} onClick={() => resizePanel(0, -1)}><Icon paths={ICONS.heightMinus} /></Btn>
                <Btn label="Panneau plus haut" data={{ action: 'deco-h+' }} onClick={() => resizePanel(0, 1)}><Icon paths={ICONS.heightPlus} /></Btn>
              </>
            )}
```

Et dans la barre de placement (`PlacementBar`), le même groupe avec `editPlacing({ type: 'size', w, h })` pour `placingItem?.kind === 'deco' && isPanel(placingItem.deco)`.

- [ ] **Step 6: Lancer les tests**

Run: `npx tsc --noEmit && npx vitest run tests/content/library-deco-place.test.tsx tests/core/library/furniture-catalog.test.ts && npm run test:famille -- scene-piece`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/library/library-types.ts src/core/library/furniture-catalog.ts src/content/furniture-thumb.tsx src/content/placement.ts src/content/furniture-drag.ts src/content/LibraryPanel.tsx tests/content/library-deco-place.test.tsx tests/core/library/furniture-catalog.test.ts
git commit -m "feat(bibliotheque): tiroir, pose et taille des horloges, météomètres et panneaux"
```

---

### Task 8: Fenêtres « ville » et « écrire » (bulle et Visiter)

**Files:**
- Create: `src/content/CityPickerDialog.tsx`, `src/content/DecoTextDialog.tsx`
- Modify: `src/content/LibraryPanel.tsx` (`onPick` L700-712, bulle L1033-1074, rendu des fenêtres près de L1112), `src/content/library-ui.tsx` (`ICONS.globe`, `ICONS.pencil`)
- Test: `tests/content/library-deco-dialogs.test.tsx`

**Interfaces:**
- Consumes : `searchCities`, `cityMinutes`, `type City` (tâche 2), `setDecoSettings` (tâche 1), `NEON_COLORS`, `MAX_PANEL_TEXT` (tâche 1).
- Produces : `CityPickerDialog({ current?: CityTime; sceneMinutes: number; onChoose(city: CityTime | null): void; onClose(): void })`, `DecoTextDialog({ title: string; text: string; neon?: NeonColor; onSave(text: string, neon?: NeonColor): void; onClose(): void })`.

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/content/library-deco-dialogs.test.tsx` (installation comme `library-deco-room.test.tsx` de la tâche 6, avec une horloge `c1` et un néon `p1` posés) :

```tsx
it('🌐 en Aménager choisit puis retire une ville', async () => {
  await click('[data-action="edit"]');
  await click('[data-id="c1"]');
  await click('[data-action="deco-city"]');
  await type('[data-city-search]', 'tok');
  await click('[data-city-tz="Asia/Tokyo"]');
  expect(item('c1')).toMatchObject({ city: { name: 'Tokyo', tz: 'Asia/Tokyo' } });
  await click('[data-id="c1"]');
  await click('[data-action="deco-city"]');
  await click('[data-city-tz=""]');
  expect(item('c1')).not.toHaveProperty('city');
});

it('toucher une horloge en Visiter ouvre directement le choix de ville', async () => {
  await click('[data-id="c1"]');
  expect(container.querySelector('[data-city-search]')).not.toBeNull();
});

it('✏️ enregistre le texte et la couleur du néon', async () => {
  await click('[data-action="edit"]');
  await click('[data-id="p1"]');
  await click('[data-action="deco-write"]');
  await type('[data-deco-text]', 'Bonne nuit');
  await click('[data-neon="green"]');
  await click('[data-action="deco-text-ok"]');
  expect(item('p1')).toMatchObject({ text: 'Bonne nuit', neon: 'green' });
});

it('Échap ferme la fenêtre de texte sans enregistrer ni quitter le mode placement', async () => {
  await click('[data-action="edit"]');
  await click('[data-id="p1"]');
  await click('[data-action="deco-write"]');
  await type('[data-deco-text]', 'Brouillon');
  await act(async () => { container.querySelector('[data-deco-text]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(container.querySelector('[data-deco-text]')).toBeNull();
  expect(item('p1')).not.toMatchObject({ text: 'Brouillon' });
  expect(container.querySelector('[data-action="deco-write"]')).not.toBeNull(); // la bulle est toujours là
});

it('la zone de texte limite à 140 caractères', async () => {
  await click('[data-action="edit"]');
  await click('[data-id="p1"]');
  await click('[data-action="deco-write"]');
  expect(container.querySelector('[data-deco-text]')!.getAttribute('maxlength')).toBe('140');
});
```

`type(selector, value)` : poser `value` via le setter natif (`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype ou HTMLInputElement.prototype, 'value').set.call(el, value)`) puis `dispatchEvent(new Event('input', { bubbles: true }))`, dans `act`.

- [ ] **Step 2: Lancer pour voir l'échec**

Run: `npx vitest run tests/content/library-deco-dialogs.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Écrire `CityPickerDialog.tsx`**

Reprendre la structure et les classes de `CardPickerDialog.tsx` (classe `.wmt-lib-dialog`, champ de recherche L153). Contenu :

```tsx
export function CityPickerDialog({ current, sceneMinutes, onChoose, onClose }: Props): ReactElement {
  const [query, setQuery] = useState('');
  const now = new Date();
  const cities = searchCities(query);
  // Échap ferme la fenêtre et ne remonte pas (il annulerait le placement ou le zoom).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); };
  return (
    <div className="wmt-lib-dialog" role="dialog" aria-label="Heure de quelle ville ?" onKeyDown={onKeyDown}>
      <div className="wmt-lib-dialog-box">
        <header>Heure de quelle ville ?<Btn label="Fermer" data={{ action: 'deco-city-close' }} onClick={onClose}><Icon paths={ICONS.close} /></Btn></header>
        <input type="search" data-city-search="" placeholder="Chercher une ville…" value={query} onChange={(e) => setQuery(e.currentTarget.value)} autoFocus />
        <div className="wmt-city-list">
          <button type="button" data-city-tz="" aria-pressed={!current} onClick={() => onChoose(null)}>📍 Heure de la scène <span>{formatMinutes(sceneMinutes)}</span></button>
          {cities.map((c) => (
            <button type="button" key={`${c.name}|${c.country}`} data-city-tz={c.tz} aria-pressed={current?.tz === c.tz && current.name === c.name} onClick={() => onChoose({ name: c.name, tz: c.tz })}>
              {c.name}, {c.country} <span>{formatMinutes(cityMinutes(sceneMinutes, c.tz, now))}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

Le style des lignes (`.wmt-city-list button` : pleine largeur, 44 px de haut minimum pour le doigt, heure alignée à droite, police chiffres tabulaires) va dans le CSS de `LibraryPanel` à côté de `.wmt-lib-dialog` (L123). Vérifier le nom réel de l'icône de fermeture dans `ICONS` et l'utiliser.

- [ ] **Step 4: Écrire `DecoTextDialog.tsx`**

Même cadre que ci-dessus, avec :
- `<textarea data-deco-text="" maxLength={MAX_PANEL_TEXT} rows={4} defaultValue={text} />` (état local `draft`) ;
- compteur `{draft.length}/140` ;
- si `neon !== undefined` : une pastille par couleur `<button data-neon={key} aria-pressed={key === color} style={{ background: NEON_COLORS[key] }} aria-label={NEON_LABEL[key]} />` (`NEON_LABEL` : Rose, Bleu, Jaune, Vert, Blanc) ;
- bouton ✓ `data-action="deco-text-ok"` → `onSave(draft, color)` ;
- `onKeyDown` : `stopPropagation()` sur toutes les touches, et Échap → `onClose()`.

Sur Android, le clavier peut recouvrir la fenêtre : la boîte est alignée en haut (`align-items: flex-start; padding-top: 8vh`) dans le CSS, et la zone de texte ne prend pas le focus automatiquement (l'utilisateur la touche).

- [ ] **Step 5: Brancher dans `LibraryPanel.tsx`**

- Icônes : ajouter `globe` et `pencil` dans `ICONS` (`library-ui.tsx`), en tracés SVG 24 × 24 dans le style des autres icônes.
- État : `const [decoDialog, setDecoDialog] = useState<{ type: 'city' | 'text'; id: string } | null>(null);`
- `onPick`, branche Visiter, avant le test des lampes :

```tsx
      const tapped = layout.find((p) => p.id === id);
      if (tapped && hasCitySetting(tapped)) return setDecoDialog({ type: 'city', id });
      if (tapped?.kind === 'deco' && isPanel(tapped.deco)) return setDecoDialog({ type: 'text', id });
```

  avec `hasCitySetting(p) = (p.kind === 'deco' && isWallClock(p.deco)) || (p.kind === 'small' && (p.item === 'alarm' || p.item === 'clock'))` (défini dans `deco.ts`, les `small` arrivent à la tâche 9 : la fonction compile déjà car `item` est une chaîne).
- Bulle : `{selectedItem && hasCitySetting(selectedItem) && <Btn label="Choisir la ville" data={{ action: 'deco-city' }} onClick={() => setDecoDialog({ type: 'city', id: selectedItem.id })}><Icon paths={ICONS.globe} /></Btn>}` et `{selectedPanel && <Btn label="Écrire" data={{ action: 'deco-write' }} onClick={() => setDecoDialog({ type: 'text', id: selectedPanel.id })}><Icon paths={ICONS.pencil} /></Btn>}`.
- Rendu, près de `CardPickerDialog` :

```tsx
        {decoDialog?.type === 'city' && (
          <CityPickerDialog current={(layout.find((p) => p.id === decoDialog.id) as { city?: CityTime } | undefined)?.city} sceneMinutes={sceneTime.minutes}
            onChoose={(city) => { void editLayout((l) => setDecoSettings(l, decoDialog.id, { city })); setDecoDialog(null); }} onClose={() => setDecoDialog(null)} />
        )}
        {decoDialog?.type === 'text' && (() => {
          const p = layout.find((x) => x.id === decoDialog.id) as DecoPlaced | undefined;
          return p ? (
            <DecoTextDialog title={labelOf(p.deco)} text={p.text ?? ''} neon={p.deco === 'panel-neon' ? (p.neon ?? 'pink') : undefined}
              onSave={(text, neon) => { void editLayout((l) => setDecoSettings(l, p.id, { text, ...(neon ? { neon } : {}) })); setDecoDialog(null); }} onClose={() => setDecoDialog(null)} />
          ) : null;
        })()}
```

  `editLayout` doit fonctionner aussi en mode Visiter (comme `toggleLamp`) : vérifier qu'il n'exige pas `editing`.
- Les écouteurs d'Échap sur `window` (L371 zoom, L441 placement) : ne rien faire si `decoDialog !== null` (ajouter ce test en tête des deux écouteurs).

- [ ] **Step 6: Lancer les tests**

Run: `npx tsc --noEmit && npx vitest run tests/content/library-deco-dialogs.test.tsx && npm run test:famille -- scene-piece`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/content/CityPickerDialog.tsx src/content/DecoTextDialog.tsx src/content/LibraryPanel.tsx src/content/library-ui.tsx src/core/library/deco.ts tests/content/library-deco-dialogs.test.tsx
git commit -m "feat(bibliotheque): choisir la ville d'une horloge et écrire sur un panneau"
```

---

### Task 9: Objets de table (réveil, pendulette, station)

**Files:**
- Modify: `src/core/library/library-types.ts:16-19` et `:44`, `src/core/library/library-book.ts:27`, `src/core/library/furniture-catalog.ts` (`LABELS`, `SMALL_ITEM_OF`, `SUBCATEGORIES.deco.clocks`), `src/core/library/item-models.ts` (`ItemShape`, `ITEM_MODELS`, test `stored` L115), `src/core/library/carried-items.ts` (`SMALL_SHAPE`), `src/content/model3d-art.tsx` (`ItemContent`, `DecalArt`, mémo de `CarriedItem3D`), `src/content/RoomView.tsx:260-268`, `src/content/furniture-thumb.tsx` (`ITEM_SHAPE`)
- Test: `tests/core/library/item-models.test.ts` (ajouts), `tests/content/library-deco-table.test.tsx`

**Interfaces:**
- Consumes : `TableFace`, `DecoView` (tâche 5), `cityClock` (tâche 2), `decoView(city)` de `RoomView` (tâche 6), `setDecoSettings` (tâche 1).
- Produces : `SMALL_ITEMS = ['plant', 'lamp', 'alarm', 'clock', 'station']`, `SmallKind` + `'small-alarm' | 'small-clock' | 'small-station'`, `small.city?: CityTime`, `ItemShape` + `'small-alarm' | 'small-clock' | 'small-station'`, `ItemContent.face?: { key: string; draw: (w: number, h: number) => ReactElement }`.

- [ ] **Step 1: Écrire les tests (échouent)**

`tests/core/library/item-models.test.ts`, ajouter :

```ts
it('réveil, pendulette et station de table ont leurs dimensions et une face décorée', () => {
  expect([ITEM_MODELS['small-alarm'].w, ITEM_MODELS['small-alarm'].d, ITEM_MODELS['small-alarm'].h]).toEqual([18, 7, 9]);
  expect([ITEM_MODELS['small-clock'].w, ITEM_MODELS['small-clock'].d, ITEM_MODELS['small-clock'].h]).toEqual([14, 6, 16]);
  expect([ITEM_MODELS['small-station'].w, ITEM_MODELS['small-station'].d, ITEM_MODELS['small-station'].h]).toEqual([15, 6, 11]);
  for (const shape of ['small-alarm', 'small-clock', 'small-station'] as const) {
    const decals = ITEM_MODELS[shape].pieces.flatMap((p) => ('decals' in p && p.decals) || []);
    expect(decals).toContainEqual({ face: 'front', key: `face:${shape.slice(6)}` });
  }
});
```

`tests/content/library-deco-table.test.tsx` (installation comme la tâche 6 ; un bureau `d1` posé au sol, puis un réveil `s1` dessus) :

```tsx
it('le réveil se pose sur un bureau et affiche l heure sur sa face', async () => {
  await repo.update((s) => updateLayout(s, s.rooms[0]!.id, () => [
    { id: 'd1', kind: 'desk', col: 4, row: 13 },
    { id: 's1', kind: 'small', item: 'alarm', hostId: 'd1', slot: 0 },
  ]));
  await settle();
  expect(container.querySelector('[data-id="s1"] [data-table-face="alarm"]')).not.toBeNull();
  expect(container.querySelector('[data-id="s1"] [data-time]')!.getAttribute('data-time')).toBe('10:10');
});

it('le réveil garde sa ville après relecture', async () => {
  await repo.update((s) => updateLayout(s, s.rooms[0]!.id, () => [
    { id: 'd1', kind: 'desk', col: 4, row: 13 },
    { id: 's1', kind: 'small', item: 'alarm', hostId: 'd1', slot: 0, city: { name: 'Tokyo', tz: 'Asia/Tokyo' } },
  ]));
  await settle();
  expect(container.querySelector('[data-id="s1"]')!.textContent).toContain('TOKYO');
});

it('se pose depuis le tiroir sur un bureau', async () => {
  // bureau posé, puis Déco › Horloges et météo › Réveil numérique, toucher le bureau, ✓ (comme les tests de la petite lampe)
});
```

Le dernier test : reprendre exactement le scénario de pose d'une petite lampe depuis le tiroir (`tests/content/room-carried*.test.tsx` ou `library-placement.test.tsx`, chercher `small-lamp`) en remplaçant `small-lamp` par `small-alarm` et la sous-catégorie `lights` par `clocks`.

- [ ] **Step 2: Lancer pour voir l'échec**

Run: `npx vitest run tests/core/library/item-models.test.ts tests/content/library-deco-table.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Données et modèles**

- `library-types.ts` : `SMALL_ITEMS = ['plant', 'lamp', 'alarm', 'clock', 'station'] as const;` ; `SmallKind = 'small-plant' | 'small-lamp' | 'small-alarm' | 'small-clock' | 'small-station';` ; membre `small` : ajouter `city?: CityTime`.
- `library-book.ts:27` : `city: citySchema.optional()` sur la branche `small` (déplacer `citySchema` avant `placedSchema`).
- `furniture-catalog.ts` : `LABELS` `'small-alarm': 'Réveil numérique'`, `'small-clock': 'Pendulette'`, `'small-station': 'Station de table'` ; `SMALL_ITEM_OF` : `'small-alarm': 'alarm', 'small-clock': 'clock', 'small-station': 'station'` ; `CATEGORIES.deco` et `SUBCATEGORIES.deco.clocks` : ajouter les 3 kinds (et compléter le test du catalogue de la tâche 7).
- `item-models.ts` : `ItemShape` + les 3 formes ; dans `ITEM_MODELS` (commentaire « Dessin provisoire Opus… ») :

```ts
  // Réveil numérique : boîtier 18 × 7 × 9 cm à face légèrement inclinée (on la dessine droite), écran en décalque `face:alarm`.
  'small-alarm': { w: 18, d: 7, h: 9, pieces: [box(0, 0, 0, 18, 9, 7, '#3A3A40', [{ face: 'front', key: 'face:alarm' }])] },
  // Pendulette : corps 14 × 6 × 13 cm, cadran en décalque `face:clock`, deux cloches sur le dessus.
  'small-clock': {
    w: 14, d: 6, h: 16,
    pieces: [
      box(0, 0, 0, 14, 13, 6, '#B79F78', [{ face: 'front', key: 'face:clock' }]),
      { shape: 'cyl', cx: 3.5, cz: 3, y: 13, r: 2.2, h: 3, fill: 'metal' },
      { shape: 'cyl', cx: 10.5, cz: 3, y: 13, r: 2.2, h: 3, fill: 'metal' },
    ],
  },
  // Station de table : boîtier 15 × 6 × 11 cm sur pied, écran en décalque `face:station`.
  'small-station': { w: 15, d: 6, h: 11, pieces: [box(4, 0, 1, 7, 1.2, 4, '#55555C'), box(0, 1.2, 0, 15, 9.8, 6, '#D8C3A0', [{ face: 'front', key: 'face:station' }])] },
```

  Vérifier que `box(...)` accepte `fill` palette (`'metal'` en dur aujourd'hui) : la couleur passée en `color` suffit. Dans le test « stored » (L115), ajouter les 3 formes à la liste des objets non rangés.
- `carried-items.ts` : `SMALL_SHAPE` : `alarm: 'small-alarm', clock: 'small-clock', station: 'small-station'`.
- `furniture-thumb.tsx` : `ITEM_SHAPE` : les 3 nouveaux kinds.

- [ ] **Step 4: Face en décalque (`model3d-art.tsx`, `RoomView.tsx`)**

- `ItemContent` : `{ url?: string; title?: string; lit?: boolean; face?: { key: string; draw: (w: number, h: number) => ReactElement } }`.
- `DecalArt`, avant la branche `screen` : `if (role === 'face') return content?.face ? content.face.draw(w, h) : <rect width={w} height={h} fill="#1D1F22" />;`
- Mémo de `CarriedItem3D` : ajouter `&& a.content?.face?.key === b.content?.face?.key`.
- `RoomView.artOf`, branche `small` : quand `placed.item` vaut `alarm`, `clock` ou `station`,

```tsx
      const v = decoView(placed.city);
      const faceKey = `${placed.item}|${v.time.h}:${v.time.m}:${v.time.s}|${v.city ?? ''}|${v.weather.state}|${v.weather.tempC}|${v.weather.night}|${room.style}`;
      const content = { face: { key: faceKey, draw: (w: number, h: number) => <TableFace item={placed.item as 'alarm' | 'clock' | 'station'} w={w} h={h} style={room.style} view={v} /> } };
```

  (les autres `small` gardent `{ lit: isLit(placed) }`). Le décalque n'est dessiné que si la face est assez grande à l'écran (règle existante `area >= 2`) : de profil, on voit le boîtier sans écran, c'est voulu.
- `TableFace` (tâche 5) pose `data-time` et `data-table-face` sur sa racine.

- [ ] **Step 5: Lancer les tests**

Run: `npx tsc --noEmit && npx vitest run tests/core/library/item-models.test.ts tests/content/library-deco-table.test.tsx tests/core/library/furniture-catalog.test.ts && npm run test:famille -- scene-piece`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/library/library-types.ts src/core/library/library-book.ts src/core/library/furniture-catalog.ts src/core/library/item-models.ts src/core/library/carried-items.ts src/content/model3d-art.tsx src/content/RoomView.tsx src/content/furniture-thumb.tsx tests/core/library/item-models.test.ts tests/content/library-deco-table.test.tsx tests/core/library/furniture-catalog.test.ts
git commit -m "feat(bibliotheque): réveil, pendulette et station de table (dessin Opus, Fable n'est pas passé)"
```

---

### Task 10: Polices dans la page, fiche WikiHow, captures et livraison

**Files:**
- Modify: `src/content/LibraryPanel.tsx` (appel de `ensureDecoFonts`), `src/core/whats-new/entries.ts`
- Test: `tests/content/deco-art.test.tsx` (ajout), test existant des fiches WikiHow (`npm run test:famille` de la famille qui couvre `entries.ts`)

**Interfaces:**
- Consumes : `ensureDecoFonts` (tâche 5).

- [ ] **Step 1: Test de la déclaration des polices (échoue)**

Dans `tests/content/deco-art.test.tsx` :

```tsx
import { ensureDecoFonts } from '../../src/content/deco-fonts';
it('déclare les 4 polices une seule fois dans le document', () => {
  ensureDecoFonts(document);
  ensureDecoFonts(document);
  const styles = document.querySelectorAll('#wmt-deco-fonts');
  expect(styles).toHaveLength(1);
  for (const f of ['WMT Caveat', 'WMT Oswald', 'WMT Pacifico', 'WMT Patrick Hand']) expect(styles[0]!.textContent).toContain(f);
});
```

Run: `npx vitest run tests/content/deco-art.test.tsx` → PASS si la tâche 5 est complète (sinon corriger `ensureDecoFonts`).

- [ ] **Step 2: Appeler `ensureDecoFonts` au montage**

Dans `LibraryPanel.tsx` : `useEffect(() => { if (layout.some((p) => p.kind === 'deco' && isPanel(p.deco))) ensureDecoFonts(); }, [layout]);`. Puis, dans `PanelText` (tâche 5), relancer le calcul de taille quand les polices sont prêtes : `const [, bump] = useReducer((n: number) => n + 1, 0); useEffect(() => { void document.fonts?.ready.then(bump); }, []);` (mesure faite avec la vraie police après chargement).

- [ ] **Step 3: Fiche WikiHow**

Lire la forme d'une fiche existante dans `src/core/whats-new/entries.ts` (par exemple celle de la fenêtre ou de la petite lampe) et ajouter une fiche **avec un nouvel id** `horloges-meteo-panneaux-2026-10` :
- titre : « Horloges, météo et panneaux » ;
- étapes (`text` + `how` + `tip`, comme les autres fiches) :
  1. À quoi ça sert : donner l'heure, la météo du moment, ou écrire un mot au mur de sa pièce.
  2. Poser : Aménager › Déco › « Horloges et météo » (horloges, station, baromètre, réveil, pendulette, station de table) ou « Murs » (ardoise, tableau à lettres, néon, liège). Les objets de table se posent sur un bureau ou une étagère.
  3. Heure d'une autre ville : toucher l'horloge (ou 🌐 dans la bulle en Aménager), chercher la ville ; « 📍 Heure de la scène » revient à l'heure du menu ☁️. D'où vient l'heure : celle de la scène, ou celle de la ville calculée sur l'appareil, sans internet.
  4. Météo : les météomètres montrent la météo du visuel (menu ☁️). La température est la vraie en météo réelle (position activée), sinon une température plausible pour la saison.
  5. Écrire : toucher le panneau (ou ✏️), 140 caractères ; le texte s'ajuste seul. Taille du panneau : boutons ↔ ↕ de la bulle, de 2 × 2 à 12 × 8 cases. Le néon : couleur au choix, il éclaire un peu le mur la nuit.
  6. Limites : pas de nom pour l'heure de la scène (la position n'est jamais traduite en adresse) ; si le site refuse les polices intégrées, le panneau prend une police standard.

Run: la famille de tests qui couvre `entries.ts` (chercher `whats-new` dans `tests/familles.ts`) → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/content/LibraryPanel.tsx src/content/deco-art.tsx src/core/whats-new/entries.ts tests/content/deco-art.test.tsx
git commit -m "feat(bibliotheque): polices des panneaux et fiche WikiHow horloges, météo et panneaux"
```

- [ ] **Step 5: Vérification complète des familles touchées**

Run: `npx tsc --noEmit && npm run test:famille -- scene-piece scene-meteo` (et la famille WikiHow)
Expected: tout PASS. En cas d'échec : `superpowers:systematic-debugging`, pas de correctif au hasard.

- [ ] **Step 6: Captures pour l'utilisateur**

Avec le banc de captures de la pièce (voir `.superpowers/harness-mobilier`, vite port 5270, `?view=room`) ou en lançant l'extension : une pièce Scandinave de jour et une pièce Néon de nuit, avec les 8 objets muraux, un bureau portant réveil + pendulette + station, une horloge réglée sur Tokyo et un panneau de chaque modèle. Captures montrées à l'utilisateur pour validation **avant** la PR.

- [ ] **Step 7: Livraison**

```bash
git push -u origin feat/horloges-meteo-panneau
gh pr create --base main --title "feat(bibliotheque): horloges, météomètres et panneaux" --body "<résumé + captures + mention « Dessin Opus : Fable n'est pas passé » + 🤖 Generated with [Claude Code](https://claude.com/claude-code)>"
```

Puis fusion de la PR (règle du projet : ouvrir ET fusionner sans demander), `npm run build`, `npm run preprod` (pré-prod avec APK), et mise à jour de la mémoire du projet (fichier `project_horloges_meteo_panneaux.md` + ligne dans `MEMORY.md`). Vérification manuelle ensuite sur le vrai téléphone (Android d'abord).
