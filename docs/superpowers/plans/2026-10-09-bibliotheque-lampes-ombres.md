# Bibliothèque 8b — Lampes cliquables et ombres des meubles : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** On allume/éteint les lampes d'un clic, elles éclairent la pièce (inverse du carré de la distance, incidence, occultation), et les meubles projettent des ombres (soleil et lampes) avec bord doux.

**Architecture :** Moteur pur dans `src/core/library/light/` : meubles → boîtes AABB (`occluders.ts`), test rayon–boîte (`shadow.ts`), classification des pixels du calque en surfaces (`surfaces.ts`), éclairement des lampes (`lamps.ts`), puis `buildLightMap` (8a) étendu. `LightLayer`/`RoomView`/`LibraryPanel` ne font que passer les boîtes et lampes et gérer le clic. Le champ optionnel `lit?` sur les lampes est le seul ajout aux données (état reste v5).

**Tech Stack :** TypeScript, React, zod, vitest (jsdom), SVG. Lancer les tests de pièce avec `npx vitest run <fichier> --maxWorkers=4`.

**Spec :** `docs/superpowers/specs/2026-10-09-bibliotheque-lampes-ombres-design.md` (lire aussi `…-lumiere-design.md`, 8a).

## Global Constraints

- Français partout (commentaires, libellés, messages de commit) ; commits terminés par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **L'état Bibliothèque reste v5, aucune migration** : `lit?: boolean` optionnel, absent = allumée.
- Le moteur reste **pur, déterministe, sans React** ; aucun `Math.random` (jitter par table fixe).
- Réglage local `wmt:library-light` (8a) inchangé : Inactif = pas de calque, lampes dessinées sans halo.
- Le calque reste **un seul RGBA en fusion normale**, 1 px = `LIGHT_SCALE` (6) unités, au-dessus des meubles, redessiné ~4 Hz ; arrêts de 8a conservés (onglet caché, mouvement réduit, réglage Inactif).
- **En Visiter, l'appui long ne fait rien** (déjà corrigé dans cette branche, commit `402d153`) ; un clic sur une lampe la bascule.
- Glyphes plutôt que du texte dans les barres, sur extension ET mobile ; fiche WikiHow dans la même PR.
- Cibles : repère monde `x` = pixels de la pièce, profondeur `d` ∈ [0, `depthMax = wallH × ROOM_DEPTH_FACTOR`], hauteur `z` en pixels ; projection écran `y = wallH + d·k − z` avec `k = floorH / depthMax` (`floorH = height − wallH`).

---

## File Structure

- Modifier `src/core/library/library-types.ts`, `library-book.ts`, `room-grid.ts` : champ `lit`, `isLit`, `toggleLamp`.
- Créer `src/core/library/light/occluders.ts` : `Box`, table des primitives, `boxesOf(layout, geom)`, `lampsOf(layout, geom)`.
- Créer `src/core/library/light/shadow.ts` : `rayHitsBox`, `blockedFraction`, `sunReaches`.
- Créer `src/core/library/light/surfaces.ts` : `buildSurfaceMap`.
- Créer `src/core/library/light/lamps.ts` : `lampField`.
- Modifier `src/core/library/light/light-map.ts`, `index.ts`.
- Modifier `src/content/light-layer.tsx`, `RoomView.tsx`, `LibraryPanel.tsx`, `furniture-art-home.tsx`, `furniture-art-steampunk.tsx`, `furniture-icons.ts` (glyphe ampoule si absent).
- Modifier `src/core/whats-new/entries.ts` (fiche WikiHow).
- Tests : `tests/core/library/light-*.test.ts`, `tests/content/library-lamps.test.tsx`.

---

### Task 1 : donnée `lit` et bascule d'une lampe

**Files:**
- Modify: `src/core/library/library-types.ts` (types `Placed` standing + small)
- Modify: `src/core/library/library-book.ts` (`placedSchema` lignes ~22-25)
- Modify: `src/core/library/room-grid.ts` (ajouter `isLit`, `toggleLamp` en fin de la zone « petits objets »)
- Test: `tests/core/library/lamp-state.test.ts`

**Interfaces:**
- Produces : `isLit(p: Placed): boolean` (vrai si `p` n'est pas une lampe éteinte) ; `isLamp(p: Placed): boolean` (`kind === 'lamp'` ou `small` avec `item === 'lamp'`) ; `toggleLamp(layout: Layout, id: string): Layout` (inverse `lit`, renvoie le même tableau si l'id n'est pas une lampe).

- [ ] **Step 1 : test qui échoue** (`tests/core/library/lamp-state.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { parseLibraryState } from '../../../src/core/library/library-book';
import { isLamp, isLit, toggleLamp } from '../../../src/core/library/room-grid';
import type { Layout } from '../../../src/core/library/library-types';

const layout: Layout = [
  { id: 'f1', kind: 'lamp', col: 2, row: 12 },
  { id: 'f2', kind: 'desk', col: 6, row: 12 },
  { id: 'f3', kind: 'small', item: 'lamp', hostId: 'f2', slot: 0 },
  { id: 'f4', kind: 'small', item: 'plant', hostId: 'f2', slot: 3 },
];

describe('lampes', () => {
  it('reconnaît les lampes debout et posées', () => {
    expect(layout.map(isLamp)).toEqual([true, false, true, false]);
  });
  it('une lampe est allumée tant que lit n’est pas false', () => {
    expect(isLit(layout[0]!)).toBe(true);
    expect(isLit({ ...layout[0]!, lit: false } as never)).toBe(false);
  });
  it('toggleLamp bascule et rebascule', () => {
    const off = toggleLamp(layout, 'f1');
    expect(isLit(off.find((p) => p.id === 'f1')!)).toBe(false);
    expect(isLit(toggleLamp(off, 'f1').find((p) => p.id === 'f1')!)).toBe(true);
  });
  it('toggleLamp ignore un meuble qui n’est pas une lampe', () => {
    expect(toggleLamp(layout, 'f2')).toBe(layout);
    expect(toggleLamp(layout, 'zzz')).toBe(layout);
  });
  it('lit survit à la lecture de l’état et un champ lit sur un autre meuble est écarté', () => {
    const state = JSON.parse(JSON.stringify({
      version: 5, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' },
      rooms: [{ id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [],
        layout: [{ id: 'f1', kind: 'lamp', col: 2, row: 12, lit: false }, { id: 'f2', kind: 'desk', col: 6, row: 12, lit: false }] }],
    }));
    const room = parseLibraryState(state).rooms[0]!;
    expect((room.layout[0] as { lit?: boolean }).lit).toBe(false);
    expect('lit' in room.layout[1]!).toBe(false);
  });
});
```

- [ ] **Step 2 :** `npx vitest run tests/core/library/lamp-state.test.ts` → échec (exports absents).
- [ ] **Step 3 : implémenter.**
  - `library-types.ts` : `Placed` devient `| { id: string; kind: StandingKind; col: number; row: number; lit?: boolean }` et `| { id: string; kind: 'small'; item: SmallItem; hostId: string; slot: number; lit?: boolean }`.
  - `library-book.ts` : dans `placedSchema`, ajouter `lit: z.boolean().optional()` aux deux `z.object` concernés ; puis, dans `cleanLayout` (ou juste après le parse), retirer `lit` de tout meuble qui n'est pas une lampe : `.map((p) => (p.lit !== undefined && !isLamp(p) ? omitLit(p) : p))` où `omitLit` fait `const { lit: _lit, ...rest } = p; return rest as Placed;`. Importer `isLamp` depuis `room-grid`.
  - `room-grid.ts` :
```ts
export const isLamp = (p: Placed): boolean => p.kind === 'lamp' || (p.kind === 'small' && p.item === 'lamp');
export const isLit = (p: Placed): boolean => !isLamp(p) || (p as { lit?: boolean }).lit !== false;

// Allume ou éteint une lampe (debout ou posée) ; sans effet sur un autre meuble.
export function toggleLamp(layout: Layout, id: string): Layout {
  const target = layout.find((p) => p.id === id);
  if (!target || !isLamp(target)) return layout;
  return layout.map((p) => (p.id === id ? ({ ...p, lit: !isLit(p) } as Placed) : p));
}
```
- [ ] **Step 4 :** relancer le test → passe ; `npx tsc --noEmit` propre.
- [ ] **Step 5 : commit** `feat(bibliotheque): champ lit des lampes et bascule`.

---

### Task 2 : meubles → boîtes et lampes (`occluders.ts`)

**Files:**
- Create: `src/core/library/light/occluders.ts`
- Modify: `src/core/library/light/index.ts` (`export * from './occluders';`)
- Test: `tests/core/library/light-occluders.test.ts`

**Interfaces:**
- Consumes : `isStanding`, `rectOf`, `pxRect`, `computerRect`, `surfaceSlotRect`, `SURFACE_SLOTS`, `isLit`, `isLamp` (room-grid) ; `ROOM_DEPTH_FACTOR` (beam.ts).
- Produces :
```ts
export type Geom = { wallH: number; floorH: number };            // depthMax = wallH × ROOM_DEPTH_FACTOR, k = floorH / depthMax
export type Box = { owner: string; x0: number; x1: number; d0: number; d1: number; z0: number; z1: number };  // d0 = fond, d1 = devant
export type LampSource = { id: string; x: number; d: number; z: number; box: string };  // box = owner à exclure des occultations
export function boxesOf(layout: Layout, geom: Geom): Box[];
export function lampsOf(layout: Layout, geom: Geom): LampSource[];   // seulement les lampes allumées
export function layoutSignature(layout: Layout, geom: Geom): string; // change si boîtes ou lampes allumées changent
```

Règles (à appliquer exactement) :
- Pour un meuble debout de rectangle écran `r = pxRect(rectOf(p))` : `dFront = max(0, (r.y + r.h − wallH) / k)` ; profondeur `D = DEPTH[kind]` ; `h = r.h`. Chaque primitive `{ fx0, fx1, fz0, fz1, fd0, fd1 }` (fractions de largeur, hauteur, profondeur depuis l'**avant**) donne : `x0 = r.x + fx0·r.w`, `x1 = r.x + fx1·r.w`, `d1 = dFront − fd0·D`, `d0 = dFront − fd1·D`, `z0 = fz0·h`, `z1 = fz1·h`.
- `DEPTH` (px monde) : shelf 50, desk 70, chair 50, sofa 80, armchair 70, basket 60, bowl 30, kennel 90, charger 30, plant 40, lamp 30, coffee-table 70, globe 50, telescope 40, automaton 40. Tapis (`rug`) : aucune boîte.
- Primitives (`PRIMS: Record<Exclude<StandingKind,'rug'>, Prim[]>`), toutes les fractions de `[fx0,fx1,fz0,fz1,fd0,fd1]` :
  - desk : plateau `[0,1,.84,1,0,1]`, pieds `[0,.06,0,.84,0,.15]`, `[.94,1,0,.84,0,.15]`, `[0,.06,0,.84,.85,1]`, `[.94,1,0,.84,.85,1]`.
  - coffee-table : plateau `[0,1,.66,1,0,1]`, pieds `[.08,.14,0,.66,0,.2]`, `[.86,.92,0,.66,0,.2]`, `[.08,.14,0,.66,.8,1]`, `[.86,.92,0,.66,.8,1]`.
  - shelf : montants `[0,.04,0,1,0,1]`, `[.96,1,0,1,0,1]`, planches `[0,1,0,.03,0,1]`, `[0,1,.31,.34,0,1]`, `[0,1,.62,.65,0,1]`, `[0,1,.97,1,0,1]`.
  - chair : assise `[.1,.9,.4,.5,0,1]`, dossier `[.1,.9,.5,1,.85,1]`, pieds `[.1,.2,0,.4,0,.15]`, `[.8,.9,0,.4,0,.15]`, `[.1,.2,0,.4,.85,1]`, `[.8,.9,0,.4,.85,1]`.
  - sofa et armchair : base `[0,1,0,.5,0,1]`, dossier `[0,1,.5,1,.7,1]`, accoudoirs `[0,.12,.5,.72,0,.7]`, `[.88,1,.5,.72,0,.7]`.
  - basket, bowl : `[0,1,0,.5,0,1]`. kennel : corps `[0,1,0,.7,0,1]`, toit `[0,1,.7,1,0,1]`. charger : `[0,1,0,.3,0,1]`.
  - plant : pot `[.2,.8,0,.25,.2,.8]`, feuillage `[.1,.9,.25,1,.1,.9]`. lamp : pied `[.1,.9,0,.05,.2,.8]`, tige `[.45,.55,.05,.83,.45,.55]`, abat-jour `[0,1,.83,1,.2,.8]`.
  - globe, telescope, automaton : une boîte pleine `[.1,.9,0,1,.1,.9]`.
- `computer` : rectangle `computerRect(pxRect(rectOf(desk)))`, posé sur le dessus du bureau : `zBase = hauteur du plateau du bureau = 1 × r_desk.h`, boîte `[0,1]` en x, `z0 = zBase`, `z1 = zBase + rect.h`, profondeur `d1 = dFront_desk − 0.3·D_desk`, `d0 = dFront_desk − 0.7·D_desk`.
- `small` : rectangle `surfaceSlotRect(pxRect(rectOf(host)), SURFACE_SLOTS[host.kind], slot)`, `x` = milieu ± 10 px, `z0 = zBase_host` (haut de l'hôte), `z1 = z0 + 38`, profondeur `[dFront_host − 0.7·D, dFront_host − 0.3·D]`. Boîte `owner = p.id`.
- `LampSource` : lampe debout allumée → `x` centre, `d` = `dFront − 0.5·D`, `z = 0.92·h`, `box = p.id` ; petite lampe allumée → `x` centre du slot, `d` centre de l'hôte, `z = z0_host + 30`, `box = p.id`.
- Les boîtes dont l'`owner` est une lampe allumée ou non restent des occulteurs (une lampe éteinte occulte aussi).
- `layoutSignature` : concaténer `owner:x0,x1,d0,d1,z0,z1` arrondis à l'entier pour chaque boîte, puis `|` et `id:x,d,z` des lampes allumées.

- [ ] **Step 1 : tests** (`tests/core/library/light-occluders.test.ts`). Constantes : `geom = { wallH: 340, floorH: 170 }` (donc `depthMax = 680`, `k = 0.25`). Cas : (a) un bureau en `col 2,row 11` (cases 5×4 → `r = {x:60,y:311.1,w:150,h:113.3}`) donne 5 boîtes, dont un plateau dont `z1 ≈ 113.3` et `x0 = 60, x1 = 210` ; (b) une lampe en `col 2,row 8` donne 3 boîtes et une `LampSource` avec `z ≈ 0.92·h` ; avec `lit: false`, 3 boîtes mais zéro source ; (c) un tapis ne donne rien ; (d) une petite lampe sur un bureau donne une boîte dont `z0` égale le haut du bureau et une source ; (e) `layoutSignature` change quand une lampe s'éteint et quand un meuble bouge, pas quand rien ne change.
- [ ] **Step 2 :** lancer → échec. **Step 3 :** implémenter exactement les règles ci-dessus (une fonction `primBoxes(owner, kind, r, dFront)`, `PRIMS` et `DEPTH` en constantes en tête de fichier). **Step 4 :** tests + `tsc` verts. **Step 5 : commit** `feat(lumiere): meubles en boîtes et sources de lampes`.

---

### Task 3 : rayons et ombres douces (`shadow.ts`)

**Files:**
- Create: `src/core/library/light/shadow.ts`
- Modify: `index.ts` (export)
- Test: `tests/core/library/light-shadow.test.ts`

**Interfaces:**
- Consumes : `Box`, `Glass`.
- Produces :
```ts
export type V3 = { x: number; d: number; z: number };
export function segmentHitsBox(a: V3, b: V3, box: Box): boolean;          // le segment a→b traverse l'intérieur (marge 1e-6)
export const JITTER: ReadonlyArray<V3>;                                    // 5 décalages unitaires fixes : [0,0,0] puis 4 autour
export function litFraction(from: V3, source: V3, spread: number, boxes: readonly Box[], skip?: string): number; // part (0..1) des 5 sources décalées qui atteignent `from`
export function sunReaches(p: V3, glass: Glass & { zBottom: number; zTop: number }, tanElev: number, slope: number, boxes: readonly Box[]): number; // 0..1
```
Détails : `segmentHitsBox` = méthode des dalles sur 3 axes avec `t ∈ [ε, 1−ε]` (ε = 1e-4, pour ne pas compter la boîte sur laquelle `a` repose). `JITTER = [[0,0,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]` en (x,d,z) ; la source décalée = `source + spread·offset`. `litFraction` ignore les boîtes dont `owner === skip` (le corps de la lampe) et renvoie `(#non occultés)/5`. `sunReaches` : le rayon part de `p` vers le mur ; point d'impact sur le plan du mur `d = 0` : `xw = p.x − slope·p.d`, `zw = p.z + p.d·tanElev` ; la fenêtre éclaire si `glass.x ≤ xw ≤ glass.x + glass.w` et `zBottom ≤ zw ≤ zTop` (sinon 0). Sinon on tire 5 rayons vers `(xw + spread·offX, 0, zw + spread·offZ)` avec `spread = 6` et renvoie la part non occultée. (Les hauteurs de verre : `zBottom = wallH − (glass.y + glass.h)`, `zTop = wallH − glass.y`.)

- [ ] **Step 1 : tests** : (a) un segment qui traverse une boîte → vrai, qui passe à côté → faux, qui s'arrête avant → faux, qui part de la surface supérieure vers le haut → faux ; (b) `litFraction` vaut 1 sans boîte, 0 avec une grande boîte entre les deux, strictement entre 0 et 1 pour une arête de boîte qui coupe seulement une partie des décalages (construire la boîte pour qu'elle bloque exactement les décalages ±x d'un côté), ignore `skip` ; (c) `sunReaches` : point au sol à `d=100` avec `tanElev = 0.5` sous une fenêtre qui couvre le point d'impact → 1 ; point d'impact hors du verre → 0 ; avec une table (boîte) posée entre → < 1. Déterminisme : deux appels identiques donnent le même résultat.
- [ ] **Step 2-4** : échec, implémenter, vert + `tsc`. **Step 5 : commit** `feat(lumiere): occultation par boîtes avec bord doux`.

---

### Task 4 : surfaces visibles des pixels (`surfaces.ts`)

**Files:**
- Create: `src/core/library/light/surfaces.ts`
- Modify: `index.ts`
- Test: `tests/core/library/light-surfaces.test.ts`

**Interfaces:**
- Consumes : `Box`, `Geom`, `LIGHT_SCALE`.
- Produces :
```ts
export type SurfaceMap = { w: number; h: number; kind: Uint8Array; d: Float32Array; z: Float32Array };
export const SURF = { ground: 0, wall: 1, front: 2, top: 3 } as const;   // 0 = sol, 1 = mur du fond
export function buildSurfaceMap(boxes: readonly Box[], width: number, height: number, geom: Geom, scale: number): SurfaceMap;
```
Règle : pour chaque pixel `(i,j)` de centre `(x,y) = ((i+.5)·scale, (j+.5)·scale)` : par défaut, `y < wallH` → mur (`kind = wall`, `d = 0`, `z = wallH − y`) ; sinon sol (`kind = ground`, `d = (y − wallH)/k`, `z = 0`). Ensuite les boîtes sont **peintes de l'arrière vers l'avant** (tri par `d1` croissant) : pour une boîte, son rectangle écran est `x ∈ [x0,x1]`, `yTop = wallH + d1·k − z1`, `yBottom = wallH + d1·k − z0` (face avant) ; la bande du dessus occupe les `S = min((d1−d0)·k, 0.4·(yBottom−yTop))` premiers pixels du rectangle (`kind = top`, `z = z1`, `d` interpolé de `d0` en haut à `d1` en bas de la bande) ; sous la bande, `kind = front`, `d = d1`, `z = z1 − (y − (yTop + S))`. Un pixel dont le centre est hors du rectangle n'est pas peint.

- [ ] **Step 1 : tests** (géom 340/170, scale 6) : (a) sans boîte, pixel `y=100` → mur `z = 240`, pixel `y=400` → sol `d = 240`, `z = 0` ; (b) une boîte pleine (`d0=100,d1=200,z0=0,z1=100`) : pixel au milieu bas du rectangle → front avec `d = 200` ; pixel dans la bande du haut → top avec `z = 100` ; pixel hors rectangle inchangé ; (c) deux boîtes qui se recouvrent : la plus proche (d1 plus grand) gagne ; (d) boîte plus étroite qu'un pixel : ne plante pas.
- [ ] **Step 2-4** : échec, implémenter, vert. **Step 5 : commit** `feat(lumiere): carte des surfaces visibles`.

---

### Task 5 : lumière des lampes (`lamps.ts`)

**Files:**
- Create: `src/core/library/light/lamps.ts`
- Modify: `index.ts`
- Test: `tests/core/library/light-lamps.test.ts`

**Interfaces:**
- Consumes : `LampSource`, `Box`, `SurfaceMap`, `litFraction`, `SURF`.
- Produces :
```ts
export const LAMP_R0 = 90;      // distance où l'éclairement est divisé par 2
export const LAMP_RMAX = 420;   // portée : coupe lissée
export function lampIrradiance(r: number, cosTheta: number): number;   // cos · fade / (1 + (r/R0)²) ; fade = (1 − (r/RMAX)²)² (0 au-delà) ; 0 si cos ≤ 0
export function lampField(sources: readonly LampSource[], boxes: readonly Box[], surf: SurfaceMap): Float32Array;   // une valeur 0..1 par pixel (somme des lampes, clampée)
```
Normale par surface : `ground` et `top` → `(0,0,1)` ; `wall` et `front` → `(0,1,0)` (vers le spectateur, +d). Pour chaque pixel et chaque source à portée (`r < LAMP_RMAX`, vérifié d'abord sur la distance pour éviter le test de rayon) : point `P = (x, surf.d, surf.z)` avec `x` = centre du pixel ; sur `top`/`front` décaler `P` de 0,5 le long de la normale ; `v = L − P` ; `cos = n·v / |v|` ; irradiance × `litFraction(P, L, 6, boxes, source.box)`. `gain` global 1,6 appliqué avant clamp. Coût borné : n'itérer que sur la boîte englobante `[x ± RMAX]` des pixels de chaque source.

- [ ] **Step 1 : tests** : (a) `lampIrradiance` : décroît strictement avec `r`, vaut 0 au-delà de `RMAX`, 0 pour `cos ≤ 0`, divisé ~par 2 près de `R0` (avant fade) ; (b) `lampField` : une lampe au sol éclaire le sol à 60 px plus que celui à 200 px ; le mur derrière est éclairé ; un pixel derrière une grande boîte est plus sombre qu'au même éloignement sans boîte ; sans source → tout à 0 ; le corps de la lampe (`box`) n'occulte pas sa propre lumière.
- [ ] **Step 2-4**, **Step 5 : commit** `feat(lumiere): éclairement des lampes avec occultation`.

---

### Task 6 : `buildLightMap` avec ombres et lampes

**Files:**
- Modify: `src/core/library/light/light-map.ts`
- Test: `tests/core/library/light-map.test.ts` (ajouter) et ne pas casser les tests 8a existants (les champs ajoutés sont optionnels).

**Interfaces:**
- Consumes : `Box`, `LampSource`, `buildSurfaceMap`, `lampField`, `sunReaches`, `tan`.
- Produces : `LightInput` gagne `boxes?: readonly Box[]; lamps?: readonly LampSource[]; wallH` existe déjà. Sans `boxes` ni `lamps` la sortie est **identique bit à bit** à 8a (test de non-régression : le test existant « même résultat » et un nouveau test qui compare `buildLightMap(base)` à `buildLightMap({ ...base, boxes: [], lamps: [] })`).

Algorithme (remplace la boucle pixel de 8a, le reste inchangé) :
1. `geom = { wallH, floorH }` ; `surf = buildSurfaceMap(boxes, width, height, geom, LIGHT_SCALE)` (mémoïsé comme `skyField` : clé = signature des boîtes + dimensions ; ajouter un paramètre `boxesSig` n'est pas nécessaire : calculer la clé par `boxes.length` + hash des coordonnées arrondies).
2. `lampLight = lampField(lamps, boxes, surf)` mémoïsé par (clé des boîtes + des lampes + dimensions).
3. Pour chaque pixel hors verre : `b` (rayon direct) = 0 pour `front` et `wall` ; pour `ground` et `top` : max sur les fenêtres de `gain × fade × sunReaches(P, verre, tan(elev), pente, boxes)` où `P = (x, surf.d, surf.z)` (sur `top`, `P.z = z` du dessus + 0,5), `fade = 1 − 0,4·d/depthMax` (comme 8a) et `sunReaches` remplace le test `inQuad`/`beamPatch` (supprimer `inQuad` et `patches` s'ils deviennent inutilisés ; `beamPatch` reste exporté et testé).
4. Lumière : `light' = clamp01(light + 1.0·lampLight[idx]·need)` (où `need = lampNeed(...)` déjà calculé) ; `shade = (1 − light')·shadeGain` ; lueur chaude des lampes `glow = min(0.34, 0.34·lampLight[idx]·(0.35 + 0.65·need))` ajoutée comme second terme chaud : `a2 = min(0.38·b, 0.9·shade·b) ⊕ glow` (composition alpha « sur » : `a2 = a2 + glow·(1 − a2)`), teinte `WARM` ou `LAMP_WARM = hex('#FFD38A')` pondérée par alpha.
5. Sans ciel (`sunX === null`) les lampes continuent de fonctionner ; la nuit (`daylight = 0`) `need ≈ 1`.

- [ ] **Step 1 : tests** (ajouter) : (a) non-régression 8a (ci-dessus) ; (b) une boîte (table) posée sur la tache de soleil crée un trou dans la tache au sol derrière elle (alpha chaud plus faible qu'à côté), et son dessus reçoit de la lumière chaude alors que sa face avant n'en reçoit pas ; (c) une lampe allumée la nuit (`daylight 0`, `lamps:[…]`) rend des pixels voisins chauds et nettement moins sombres que loin d'elle ; en plein jour clair (`daylight 1`, `cloud 0`) la même lampe change presque rien (écart d'alpha < 0,05) ; (d) mémoïsation : deux appels consécutifs avec les mêmes boîtes donnent le même résultat et un second `buildLightMap` plus rapide n'est pas testé (pas de test de temps) — tester seulement l'égalité ; (e) scène sans soleil (`sunX null`) avec lampe : toujours de la lumière.
- [ ] **Step 2-4** : échec, implémenter, vert (`npx vitest run tests/core/library/light-*.test.ts tests/content/library-light*.test.tsx --maxWorkers=4`) + `tsc`. **Step 5 : commit** `feat(lumiere): ombres des meubles et lueur des lampes dans la carte de lumière`.

---

### Task 7 : branchement React, clic sur la lampe, dessin allumé/éteint

**Files:**
- Modify: `src/content/light-layer.tsx` (props `boxes`, `lamps`, `signature: string` ; entrée de `buildLightMap` ; la clé de repeinture inclut `signature` ; `useEffect` dépend aussi de `signature`)
- Modify: `src/content/RoomView.tsx` (prop `onToggleLamp?: (id: string) => void`, `useMemo` des boîtes/lampes depuis `room.layout` et `{ wallH, floorH: HEIGHT − wallH }`, rendu de `LightLayer` si `light` **et** (fenêtre avec météo **ou** au moins une boîte/lampe) ; `Lamp`/`SmallArt` reçoivent `lit`)
- Modify: `src/content/furniture-art-home.tsx` (+ `furniture-art-steampunk.tsx` pour la lampe) : prop `lit?: boolean` (défaut vrai) ; allumée : abat-jour clair (`p.shade`) + halo (`<ellipse>` translucide chaud) ; éteinte : abat-jour assombri (`opacity` 0,55 sur un overlay) sans halo
- Modify: `src/content/LibraryPanel.tsx` : en `onPick`, avant `if (press.consumeClick() || !editing) return;` insérer : si `!editing` et le meuble est une lampe (`isLamp`) et que ce n'est pas le clic qui suit un appui long (`press.consumeClick()` faux) → `void editLayout((l) => toggleLamp(l, id)); return;` ; dans la barre de sélection (bloc `selectedId && …`), si l'élément sélectionné est une lampe, ajouter `<Btn label={allumée ? 'Éteindre la lampe' : 'Allumer la lampe'} pressed={allumée} data={{ action: 'lamp' }} onClick={() => void editLayout((l) => toggleLamp(l, selectedId))}><Icon paths={ICONS.bulb ?? …} /></Btn>` avec le glyphe ampoule du réglage Lumière (réutiliser la même icône que le bouton ampoule de la rangée Ciel ; chercher `bulb`/`light` dans `LibraryPanel.tsx`)
- Test: `tests/content/library-lamps.test.tsx`

**Interfaces:**
- Consumes : `boxesOf`, `lampsOf`, `layoutSignature`, `toggleLamp`, `isLamp`, `isLit`.
- Produces : attributs `data-furniture="lamp"` existants + `aria-pressed` sur le groupe de la lampe (`role="button"`, `aria-label` « Lampe allumée »/« Lampe éteinte » via `<title>` ou attribut) ; bouton `[data-action="lamp"]`.

- [ ] **Step 1 : tests** (copier le montage de `tests/content/library-drag.test.tsx` / `library-light-ui.test.tsx`) : (a) pièce avec une lampe debout, mode Visiter : clic sur `[data-furniture="lamp"]` met `lit: false` dans l'état (relire `layoutNow()`), second clic le remet ; `aria-pressed` suit ; (b) mode Aménager : un clic sélectionne sans basculer, `[data-action="lamp"]` bascule ; (c) clic sur un meuble non lampe en Visiter ne change rien ; (d) l'appui long en Visiter ne passe pas en Aménager et ne bascule pas la lampe (non-régression du correctif) ; (e) `LightLayer` est rendu (`image[data-light]`) pour une pièce avec lampe mais sans fenêtre, réglage Lumière actif, et absent quand le réglage est Inactif ; (f) la lampe éteinte se dessine sans halo (`[data-lamp-halo]` absent), allumée avec.
- [ ] **Step 2-4** : échec, implémenter, `npx vitest run tests/content --maxWorkers=4` + `tsc` verts. **Step 5 : commit** `feat(bibliotheque): lampes cliquables et calque de lumière branché`.

---

### Task 8 : fiche WikiHow, livraison

**Files:**
- Modify: `src/core/whats-new/entries.ts` : **attention**, deux entrées portent déjà l'id `bibliotheque-v13` (météo ligne ~1323, lumière 8a ~1378). Renommer celle de la lumière 8a en `bibliotheque-v14`, ajouter la nôtre en `bibliotheque-v15` (même structure que la fiche v13/lumière : thème `collection`, glyphe 💡, 4 à 5 étapes avec `target`, `title`, `text`, `gesture`, `details` « Comment faire / À quoi ça sert / D'où viennent les données / Limites », `scene` identique) ; contenu : cliquer une lampe pour l'allumer/éteindre (Visiter) ; le bouton ampoule en Aménager ; les meubles font de l'ombre au soleil et aux lampes ; la lumière d'une lampe compte surtout la nuit ou par temps couvert (œil) ; limites (boîtes simplifiées, animaux sans ombre, un build ancien ignore l'état des lampes). Vérifier qu'un test d'unicité des ids existe (`tests/core/whats-new*.test.ts`) ; sinon en ajouter un.
- Test: ajuster les tests qui comptent les fiches ou citent `bibliotheque-v13`.

- [ ] **Step 1 :** écrire/adapter le test d'unicité des ids → échoue (doublon v13). **Step 2 :** corriger les ids, ajouter la fiche. **Step 3 :** `npx vitest run --maxWorkers=4` complet + `npx tsc --noEmit` + `npm run build`. **Step 4 : commit** `docs(wikihow): fiche lampes et ombres (v15), ids de fiche dédoublonnés`.
- [ ] **Step 5 (livraison)** : `git push -u origin feat/bibliotheque-lampes` ; PR vers `main` (titre « feat(bibliotheque): lampes cliquables et ombres des meubles (8b) + appui long en Visiter », corps : résumé, tests, reste la vérif. manuelle Chrome ; terminer par `🤖 Generated with [Claude Code](https://claude.com/claude-code)`) ; fusion immédiate ; pré-prod (`npm run preprod`, sans demander) ; mettre à jour la mémoire `project_bibliotheque` (8b fait, reste 8c, 6d, 7, 2c, vérif. manuelle Chrome : rendu des ombres, lisibilité des faces, coût pièce 96 colonnes avec beaucoup de meubles).

---

## Self-review (spec → tâches)

- Lampes cliquables, `lit?` sans migration : T1, T7. Appui long inerte en Visiter : déjà livré (402d153), couvert par T7(d).
- Inverse du carré, incidence, portée, adaptation de l'œil : T5, T6.
- Boîtes multi-primitives, AABB exact, bord doux 5 décalages : T2, T3.
- Faces (dessus éclairé par le rayon, avant ambiant seulement) : T4, T6.
- Mémoïsation des ombres/lampes : T6. Lampes sans ciel : T6(e), T7(e).
- Réglage Inactif, WikiHow : T7(e), T8.
- Types cohérents : `Box`, `LampSource`, `Geom`, `SurfaceMap`, `SURF`, `litFraction`, `sunReaches`, `lampField`, `boxesOf`, `lampsOf`, `layoutSignature`, `toggleLamp`, `isLamp`, `isLit`.
