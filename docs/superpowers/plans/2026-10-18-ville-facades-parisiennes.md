# Ville Ghibli — façades parisiennes, fenêtres en travées et lumière de nuit — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** remplacer la grille de fenêtres des immeubles du premier plan par une mise en page haussmannienne / faubourg en travées (étages, balcons, lucarnes logiques, cage d'escalier, logements), redessiner les façades et toits en cellulo d'après la maquette, rendre la lumière de nuit naturelle (logements, « pièce seule », lueur qui retombe, vitres sombres) et corriger les fenêtres du fond visibles devant les immeubles proches.

**Architecture :** une fonction pure `facadeLayout` (nouveau `city/facade-layout.ts`) décrit chaque immeuble ; `cityFacades` en tire les fenêtres (`lamps`, désormais `FacadeWindow` avec taille, type, logement) sans toucher au tirage de `citySkyline`. Le décor fixe (pierre, fenêtres de jour, balcons, toits) est peint dans les tranches par deux peintres neufs (`paint/facade-painter.ts`, `paint/roof-painter.ts`) ; ce qui change avec l'heure (vitres sombres, fenêtres allumées, lueur, cage d'escalier) reste en SVG au-dessus, avec le fondu de 4 s. La logique d'allumage (logement, pièce seule, télé, étage atteint par la cage) est pure dans `city/window-lights.ts` et `city/hall-lights.ts`.

**Tech Stack :** TypeScript, React 19 (SVG), canvas 2D, vitest (environnement `node`, `// @vitest-environment jsdom` pour les tests DOM, `createRoot` + `act`, pas de @testing-library), WXT. Worktree `C:\Users\maxim\Downloads\Wikimasters-facades`, branche `feat/facades-parisiennes`.

**Spec :** `docs/superpowers/specs/2026-10-18-ville-facades-parisiennes-design.md` (à lire en entier avant chaque tâche ; elle fait autorité). **Source du dessin et des valeurs :** `docs/superpowers/maquettes/facades-parisiennes/notes.md` (valeurs) et `maquette.html` (code : `facadeLayout` l. 62-139, `splitBays` l. 140-145, `dormersFor` l. 146-167, `paintFacade` l. 175-210, `paintWindow` l. 243-309, `paintBalcony` l. 312-333, `paintRoof` l. 335-367, `paintChimney` l. 368-375, `paintDormer` l. 377-417). Les PNG du même dossier sont la référence visuelle validée.

## Global Constraints

- **Tirage intact :** `citySkyline` (`src/core/library/scene-world.ts:119-156`), `lampsOf` (l. 108-114) et le type `Lamp` (l. 94) ne changent pas d'un caractère : mêmes positions, largeurs, hauteurs, socles, lampes ; `shopSlotsFor` et `doorsFor` donnent les mêmes boutiques et portes. Le test d'empreinte de la tâche 1 le prouve à chaque tâche.
- **Classique (`classic-engine`) = moteur de référence :** la ville classique dessine les mêmes fenêtres que le Ghibli (rectangles simples à la taille de chaque fenêtre), même logique d'allumage.
- Générateur de la mise en page : `mulberry32(seed ^ hashString('facade') ^ Math.round(b.x * 8))` (x du lot entier, pas de la partie visible). Valeurs de `notes.md` §Mise en page sauf les écarts décidés par la spec §5.1 (seuils haussmann ramenés aux gabarits, travées de bord à 10 px des bords).
- Étage jamais sous **10 px** ; rez-de-chaussée `GROUND_FLOOR = 30` ; socle des jumeaux `PODIUM_H = 44` ; entresol 11 px, jamais allumé.
- Cheminées **dans la boîte `h`** de l'immeuble (pots compris) ; seule l'antenne existante dépasse (≤ 9 px).
- Couleurs de `notes.md` §Couleurs ; ombre `shade(c, t)` vers `#5A4A9C`, rehaut `light(c, t)` vers `#FFF6D0`, trait `INK #2A1A18` (`paint/cel.ts` inchangé). Lueur `rgba(255,214,130,0.22)` en deux paliers plats, vitre éteinte de nuit `#232D52` mélangée à 25 % au mur ambiant (`amb(c) = mix(c, #1E2A5A, 0.64)`), de jour `#7FB4E0` + reflet.
- Rien n'apparaît ni ne disparaît sur place : chaque fenêtre allumable a son nœud monté en permanence, seule l'opacité change (transition `opacity 4s ease`) ; pas de SMIL nouveau en Ghibli ; jamais de miroir (`scale(-1 1)`) d'une image cuite.
- Perfs Android : le décor fixe reste peint une fois par tranche ; le calque animé `[data-ghibli-windows]` n'a pas plus de nœuds qu'aujourd'hui (borne mesurée sur main, tâche 1) ; la cage d'escalier ajoute au plus quelques nœuds par porte.
- `PAINT_VERSION` (`paint/city-painter.ts:16`) 7 → 8 ; `SNOW_VERSION` (`paint/snow-painter.ts:12`) 3 → 4.
- Modèles : **Fable** uniquement pour dessiner (tâches 6, 7, 10 : port du code de la maquette, aucune signature ni branchement modifiés) ; **Opus** pour la logique, le moteur, les branchements, la neige, les tests DOM ; **Sonnet** pour le mécanique (tâche 1). Commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (tâches Fable : `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` ; tâche Sonnet : le nom exact du modèle qui l'exécute).
- Commentaires en français, densité et idiome du code voisin ; pas d'ESLint ; `describe/it` en français ; tout nouveau test entre dans une famille de `tests/familles.ts` (ici `scene-ville`, `scene-meteo`, `scene-pietons`, `scene-evenements`) ; commande : `npm run test:famille -- <noms>`.
- Une seule session lance des tests à la fois (vérifier qu'aucun vitest d'une autre session ne tourne) ; `git stash` interdit ; avant chaque commit `git branch --show-current` doit afficher `feat/facades-parisiennes`.
- Pièges du worktree : `node_modules` en jonction vers le dépôt principal ; `.wxt/` doit exister (le copier depuis le dépôt principal sinon `TSCONFIG_ERROR`) ; vitest avale `console.log` (`--silent=false`).
- Pas de fiche WikiHow ; pas de mesure téléphone par PR (campagne après G7).

## Review Focus

1. **Pièce qui s'élargit / lot coupé au bord du monde :** les immeubles entièrement visibles gardent exactement les mêmes fenêtres quand la pièce passe de 720 à 1440 px ; un lot coupé est mis en page sur sa partie visible, sans fenêtre hors du monde. → test tâche 3.
2. **Tour de jumeau très étroite (26 px) ou immeuble très bas :** aucune fenêtre ne chevauche sa voisine (écart ≥ 2 px), ni le bord (≥ 1 px), ni le rez-de-chaussée / le socle ; étage ≥ 10 px. → test de propriété tâche 2.
3. **Ciel couvert en plein jour (`gloom`, `dim` = 0,7 à midi) :** les fenêtres peuvent s'allumer, mais les vitres éteintes ne passent pas au bleu nuit (elles suivent l'obscurité du ciel, pas `dim`). → test tâche 9.
4. **Passage d'une heure à l'autre (pièce seule qui change) et mouvement réduit :** aucun nœud créé ni retiré, seule l'opacité bascule ; en mouvement réduit, la cage d'escalier n'a pas de transition. → tests tâches 9 et 11.
5. **Père Noël et événement « appartement » :** la fenêtre choisie est une fenêtre de logement (jamais cage ni entresol) et la lumière ajoutée prend sa taille réelle. → test tâche 3.

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/core/library/city/facade-layout.ts` (nouveau) | types `FacadeLayout`, `FacadeWindow`, `Home`, `Level`, `Roof`, `Dormer`, `Chimney` ; `facadeLayout`, `podiumLayout`, `splitBays`, `dormersFor`, `roofOutline` (pur, déterministe) |
| `src/core/library/city/facades.ts` (mod.) | `cityFacades` branché sur la mise en page ; `Facade` étendu ; `stairsFor` ; fenêtres du fond masquées ; `extraFloorWindows` et `podiumWindows` supprimées |
| `src/core/library/city/metrics.ts` (mod.) | accueille `GROUND_FLOOR` (réexporté par `facades.ts`) pour casser le cycle `facades → slots → facades` |
| `src/core/library/city/window-lights.ts` (mod.) | `nightness`, `soloShare`, `soloRoom`, `roomLit`, `roomTone` |
| `src/core/library/city/hall-lights.ts` (mod.) | `stairFloorsLit` |
| `src/core/library/paint/city-plan.ts` (mod.) | `PaintBuilding.layout`, `PaintPodium` d'après `podiumLayout`, mur/toit des jumeaux différenciés |
| `src/core/library/paint/facade-painter.ts` (nouveau) | `paintFacade`, `paintDayWindow`, `paintBalcony` (Fable) |
| `src/core/library/paint/roof-painter.ts` (nouveau) | `paintParisRoof`, `paintChimney`, `paintDormer`, antenne (Fable) |
| `src/core/library/paint/city-painter.ts` (mod.) | `paintBuilding` délègue aux deux peintres pour le premier plan ; `paintPodium` lit les fenêtres de `podiumLayout` |
| `src/core/library/paint/snow-painter.ts` (mod.) | ligne de toit lue dans `roofOutline`, cheminées et balcons de la mise en page |
| `src/content/ghibli-window-art.tsx` (nouveau) | dessins SVG `LitWindow`, `GlowDefs`, `NightGlass`, `StairWindow` (Fable) |
| `src/content/ghibli-windows.tsx` (réécrit) | calque : vitres de nuit par immeuble, fenêtres allumées par logement, fond corrigé (Opus) |
| `src/content/scene-city.tsx` (mod.) | vue classique à la taille de chaque fenêtre |
| `src/content/stair-lights.tsx` (nouveau) + `src/content/city-life.tsx` (mod.) | cage d'escalier dans le calque animé, à côté de `HallLights` |
| `src/core/library/city/santa.ts`, `src/content/santa-layer.tsx`, `src/core/library/city/event-place.ts` (mod.) | fenêtre de logement, taille réelle |

---

### Task 1 : empreinte du tirage et cycle d'import (Sonnet)

**Files :**
- Create : `tests/core/library/fixtures/city-skyline-empreinte.json`, `tests/content/empreinte.tmp.test.tsx` (temporaire, supprimé avant commit)
- Modify : `src/core/library/city/metrics.ts:18-20` (ajouter `GROUND_FLOOR = 30` et `BUILDING_STRETCH = 1.6` à côté de `DOOR_WIDTH`/`DOOR_MARGIN`, avec leurs commentaires), `src/core/library/city/facades.ts:9,11` (`export { BUILDING_STRETCH, GROUND_FLOOR } from './metrics'` : `facade-layout.ts` les lira sans cycle d'import), `src/core/library/city/shops/slots.ts:4` (importer `GROUND_FLOOR` depuis `../metrics`)
- Test : `tests/core/library/city-facades.test.ts` (nouveau `describe('empreinte du tirage')`)

**Interfaces :**
- Produces : fixture JSON `{ seeds: number[]; width: 1440; height: 340; skyline: Record<seed, {x,w,h,far,podium,lamps}[]>; slots: Record<seed, ShopSlot[]>; doors: Record<seed, Door[]>; ghibliWindowsNodes: number }` ; `GROUND_FLOOR` exporté par `city/metrics.ts` (et toujours par `city/facades.ts`).

- [ ] **Step 1 : prendre l'empreinte sur le code de main** (aucune modification de `src/` avant cette étape). Écrire `tests/content/empreinte.tmp.test.tsx` (jsdom) qui, pour les graines `[1, 5, 7, 42, 20261018]`, écrit avec `fs` dans la fixture : `citySkyline(1440, 340, s)`, `shopSlotsFor(1440, 340, s)`, `doorsFor(1440, 340, s)`, et `ghibliWindowsNodes` = nombre de descendants de `[data-ghibli-windows]` après rendu de `<svg><GhibliWindows buildings={cityFacades(720, 340, 5)} minutes={1320} day={undefined} daylight={0} gloom={false} dim={1} farLight={0.5} /></svg>`.
- [ ] **Step 2 : lancer** `npx vitest run tests/content/empreinte.tmp.test.tsx` ; vérifier que la fixture existe et que `ghibliWindowsNodes > 0` ; supprimer le fichier temporaire.
- [ ] **Step 3 : écrire le test d'empreinte** dans `city-facades.test.ts` :

```ts
describe('empreinte du tirage', () => {
  for (const s of empreinte.seeds) {
    it(`graine ${s} : immeubles, boutiques et portes identiques à main`, () => {
      expect(JSON.parse(JSON.stringify(citySkyline(1440, 340, s)))).toEqual(empreinte.skyline[s]);
      expect(shopSlotsFor(1440, 340, s)).toEqual(empreinte.slots[s]);
      expect(doorsFor(1440, 340, s)).toEqual(empreinte.doors[s]);
    });
  }
});
```

- [ ] **Step 4 : déplacer `GROUND_FLOOR` et `BUILDING_STRETCH`** dans `metrics.ts` (réexport dans `facades.ts`, import de `slots.ts` depuis `../metrics`).
- [ ] **Step 5 : lancer** `npm run test:famille -- scene-ville scene-commerces` → PASS (empreinte comprise) ; `npx tsc --noEmit` → aucune erreur.
- [ ] **Step 6 : commit** `test(ville): empreinte du tirage des immeubles, boutiques et portes`.

---

### Task 2 : mise en page des façades (Opus)

**Files :**
- Create : `src/core/library/city/facade-layout.ts`
- Modify : `tests/familles.ts:124-127` (ajouter `'city/facade-layout.*'` à la famille `scene-ville`)
- Test : `tests/core/library/city/facade-layout.test.ts`

**Interfaces :**
- Produces :
  ```ts
  export type WindowKind = 'std' | 'french' | 'top' | 'stair' | 'mezz' | 'dormer';
  // Fenêtre d'immeuble : `Lamp` (x, y = coin haut gauche ; u = seuil du logement ; blue = télé de la pièce principale) + taille.
  // home : index dans les logements de la façade (−1 : cage, entresol) ; key : clé stable du logement (−1 sinon) ;
  // main : pièce principale du logement ; box : jardinière (faubourg) ; level : index dans `levels` (−1 : lucarne).
  export type FacadeWindow = Lamp & { w: number; h: number; kind: WindowKind; level: number; bay: number; home: number; key: number; main: boolean; box: boolean };
  export type HomeTone = 'warm' | 'cream' | 'orange' | 'tv';
  export type Home = { key: number; level: number; bays: number[]; u: number; tone: HomeTone; curtain: { color: string; style: 'side' | 'voile' } | null; props: ('lamp' | 'plant' | 'shelf' | null)[]; main: number };
  export type Level = { y: number; h: number; level: 'mezz' | 'noble' | 'std' | 'top'; balcony: 'filant' | 'balconnet' | 'none' };
  export type Roof = { kind: 'mansard'; h: number; terrasson: 4; zinc: string } | { kind: 'zinc'; h: 11; zinc: string } | { kind: 'tile'; h: 12; tile: string };
  export type Dormer = { type: 'fronton-tri' | 'fronton-cintre' | 'oeil' | 'capucine' | 'tabatiere'; bay: number; cx: number; y: number; w: number; h: number };
  // Souche : [top, base] ; pots au-dessus, de top − 2,3 à top (toujours ≥ haut de l'immeuble).
  export type Chimney = { x: number; top: number; base: number };
  export type FacadeInput = { x: number; w: number; h: number; base: number; span: { x0: number; x1: number }; doorCx: number | null; podium: boolean };
  export type FacadeLayout = { x: number; w: number; top: number; eave: number; base: number; kind: 'haussmann' | 'faubourg'; roof: Roof; bays: number[]; winW: number; doorCx: number | null; doorBay: number | null; stairBay: number | null; levels: Level[]; windows: FacadeWindow[]; homes: Home[]; dormers: Dormer[]; chimneys: Chimney[]; wall: string; shutters: string | null; stairFloors: number };
  export type PodiumLayout = { bays: number[]; windows: FacadeWindow[]; homes: Home[] };
  export const HAUSSMANN: { minW: number; minH: number; p: number }; // départ : { minW: 26, minH: 80, p: 0.85 }
  export const ENTRESOL: { minH: number; p: number; h: 11 };          // départ : { minH: 130, p: 0.6, h: 11 }
  export const MIN_FLOOR = 10;
  export function facadeLayout(b: FacadeInput, ground: number, seed: number): FacadeLayout;
  export function podiumLayout(p: Podium, ground: number, seed: number, doorCx: number | null): PodiumLayout;
  export function splitBays(bays: readonly number[], rng: () => number): number[][];
  export function roofOutline(l: FacadeLayout): [number, number][];
  // Entrées de la mise en page, une par immeuble du premier plan, dans l'ordre de `citySkyline` (`index` = rang dans sa sortie).
  export function facadeInputs(width: number, height: number, seed: number): (FacadeInput & { index: number })[];
  ```
  `facadeInputs` : sol `cityMetrics(height).ground`, `h = b.h × BUILDING_STRETCH`, `base = ground − (podium ? PODIUM_H : GROUND_FLOOR)`, `span` = partie visible `[max(x, 0), min(x + w, width)]`, `doorCx` = `residentDoorX + DOOR_WIDTH / 2` du local de `shopSlotsFor` si ce centre tombe dans `[x, x + w]` (pour un jumeau : la tour du côté de la porte), sinon `null` (lot trop coupé : porte tirée au hasard par `doorsFor`, pas d'aplomb ni de cage).
  `windows` contient les fenêtres d'étage puis les lucarnes habitées (`kind: 'dormer'`, fronton et capucine) ; œils-de-bœuf et tabatières restent dans `dormers` seulement.

Décisions à porter (le reste suit `maquette.html` l. 62-167, mêmes tirages dans le même ordre quand rien n'est dit) :
- **Travées :** `ws = span.x1 − span.x0`, `n = clamp(round((ws − 6) / (haussmann ? 17 : 15)), 2, 5)`. Centres de `c0` à `c1` au pas `(c1 − c0) / (n − 1)`, avec `c0 = doorCx` si la porte est côté gauche sinon `span.x0 + 10`, `c1 = doorCx` si elle est côté droit sinon `span.x1 − 10` (aplomb exact sur la porte). `winW = clamp(round½(ws / n × 0.42), 5, 8)` plafonné à `pas − 3`, plancher 3,5.
- **Type :** haussmann si `w ≥ HAUSSMANN.minW && h ≥ HAUSSMANN.minH && rng() < HAUSSMANN.p` ; entresol si haussmann, sans socle, `h ≥ ENTRESOL.minH && rng() < ENTRESOL.p`. Ajuster `p`/`minH` (et seulement eux) pour que le test de proportion passe.
- **Étages :** `avail = base − (top + roof.h) − entresol` ; boucle de la maquette (noble ×1,25, dernier ×0,85, retrait tant qu'un étage < `MIN_FLOOR`) ; un seul étage si `avail < 2 × MIN_FLOOR`.
- **Cage :** `stairBay = doorBay` si `n ≥ 3` et `rng() < 0.65` *(seuil 4 → 3 : avec les gabarits gardés, 4 travées n'existent qu'au-delà de 65 px)* ; `stairFloors` = nombre d'étages hors entresol.
- **Logements :** `splitBays` sur les travées hors cage, par étage hors entresol ; `main` tiré dans le groupe ; `key = hashString(\`${Math.round(b.x * 8)}:${levelIndex}:${bays[0]}\`)` ; `u` de chaque fenêtre = `u` de son logement ; entresol et cage : `home = −1`, `key = −1`, `u = 1` (jamais allumés par la courbe). Lucarne habitée : logement d'une fenêtre (`main = true`).
- **Lucarnes :** règles `dormersFor` de la maquette, plus : si toutes les travées portent une lucarne (fronton ou œil), retirer celle d'une travée tirée qui n'est pas la seule à fronton. Capucine : `y = max(top + 3, ridgeAt(cx) − 1)`, `h = max(5, min(roof.h − 5, eave − y − 1))`, vitre `(cx − w/2, y + 1, w, h − 2)` — la fenêtre `dormer` porte la vitre, pas le cadre.
- **Contour du toit (`roofOutline`), seule source pour le peintre et la neige :** mansarde `[[x−1.5, eave], [x+2.5, top+4], [x+5, top+0.5], [x+w−5, top+0.5], [x+w−2.5, top+4], [x+w+1.5, eave]]` ; zinc/tuile `[[x−2, eave], [x+0.42w, top+0.5], [x+w+2, eave]]`.
- **Cheminées :** `x = b.x + 4 + rng() × 3`, seconde à `b.x + b.w − 8 − rng() × 3` si `w > 70 || rng() < 0.3` ; mansarde : `top = layoutTop + 2.3`, `base = layoutTop + 4 + 3` ; toit simple : `base` = contour en `x + 2`, `top = max(layoutTop + 2.3, base − 6)`.
- **Jardinière (`box`) :** fenêtres `std` de faubourg, 35 %, tirée ici (le peintre et le calque la lisent).
- **Socle (`podiumLayout`) :** générateur `mulberry32(seed ^ hashString('podium-floor') ^ Math.round(p.x * 8))`, travées par la même règle sur `[p.x, p.x + p.w]` (aplomb sur la porte du socle), une rangée `std` centrée dans la bande de 14 px du socle, logements par `splitBays`, pas de cage.

- [ ] **Step 1 : écrire les tests** (`describe('mise en page des façades')`), sur `layouts` = `facadeInputs(1440, 340, s).map((i) => facadeLayout(i, cityMetrics(340).ground, s))` pour les graines 1 à 20, plus une tour de 26 px et un immeuble de 64 px de haut construits à la main :

```ts
it('marges égales et aplomb sur la porte', () => {
  for (const l of layouts) {
    expect(Math.abs((l.bays[0]! - span(l).x0) - (span(l).x1 - l.bays.at(-1)!))).toBeLessThanOrEqual(0.1);
    if (l.doorCx !== null) expect(l.bays[l.doorBay!]).toBe(l.doorCx);
    for (const w of l.windows.filter((v) => v.kind !== 'dormer')) expect(w.x + w.w / 2).toBeCloseTo(l.bays[w.bay]!, 9);
  }
});
it('étages d’au moins 10 px, fenêtres dans la façade, sans chevauchement (écart ≥ 2 px)', () => { /* levels hors mezz h ≥ 10 ; x ≥ x0 + 1, x + w ≤ x1 − 1 ; y ≥ eave, y + h ≤ base ; même étage : écart ≥ 2 */ });
it('70 à 80 % de haussmanniens', () => { expect(share).toBeGreaterThanOrEqual(0.7); expect(share).toBeLessThanOrEqual(0.8); });
it('mansarde : au moins une lucarne habitée, jamais une par travée', () => { /* dormers hors tabatière sur des travées distinctes < bays.length ; windows dormer ≥ 1 */ });
it('lucarnes et cheminées dans la boîte de l’immeuble', () => { /* dormer.y ≥ top, y + h ≤ eave ; chimney.top − 2.3 ≥ top − 1e-9 */ });
it('fenêtres d’un logement : même seuil, une seule pièce principale', () => { /* groupBy home : u égaux, main unique */ });
it('cage d’escalier à l’aplomb de la porte, entresol jamais allumable', () => { /* stairBay === doorBay ; kind stair/mezz → home −1, u === 1 */ });
it('déterministe', () => { expect(facadeLayout(i, 238, 7)).toEqual(facadeLayout(i, 238, 7)); });
```

- [ ] **Step 2 : lancer** `npx vitest run tests/core/library/city/facade-layout.test.ts` → FAIL (module absent).
- [ ] **Step 3 : implémenter** `facade-layout.ts` (port de la maquette avec les décisions ci-dessus ; `pick`, `clamp` locaux comme dans `city-plan.ts`).
- [ ] **Step 4 : lancer** le test → PASS ; si la proportion sort de [0,7 ; 0,8], ajuster `HAUSSMANN.p` / `minH` et le noter en commentaire.
- [ ] **Step 5 : commit** `feat(ville): mise en page des façades en travées (haussmann, faubourg)`.

---

### Task 3 : façades branchées sur la mise en page et consommateurs du moteur (Opus)

**Files :**
- Modify : `src/core/library/city/facades.ts:17` (type `Facade`), `:23-42` (supprimer `extraFloorWindows`, `podiumWindows`), `:65-80` (`cityFacades`) ; ajouter `stairsFor`, `farWindowHidden`
- Modify : `src/core/library/city/santa.ts:16-18,46-56`, `src/content/santa-layer.tsx:229-232`, `src/core/library/city/event-place.ts:44-50,73`
- Test : `tests/core/library/city-facades.test.ts` (réécrit hors empreinte), `tests/core/library/city-santa.test.ts`, `tests/core/library/city-event-place.test.ts`

**Interfaces :**
- Consumes : `facadeInputs`, `facadeLayout`, `podiumLayout`, `FacadeWindow`, `Home` (tâche 2).
- Produces :
  ```ts
  export type Facade = Omit<Building, 'lamps'> & { lamps: FacadeWindow[]; homes: Home[]; farWindows: FarWindow[]; layout: FacadeLayout | null; podiumLayout: PodiumLayout | null };
  // Fenêtres de cage par porte (clé = centre x de la porte, le même que `data-hall-light`), du bas vers le haut.
  export function stairsFor(facades: readonly Facade[]): Map<number, FacadeWindow[]>;
  export function farWindowHidden(win: FarWindow, near: readonly { x: number; w: number; top: number }[]): boolean;
  // santa.ts : SantaRoof.lamp devient { x: number; y: number; w: number; h: number } | null
  ```
  `Facade.lamps` = fenêtres de `layout.windows` puis, sur la 1re tour d'un socle, celles de `podiumLayout` ; `home` réindexé dans `Facade.homes` (logements de la façade puis du socle). Façades du fond : `layout = null`, `lamps = []`, `farWindows` privées de celles que cache un immeuble ou un socle du premier plan (`farWindowHidden` : le rectangle 3,5 × 5 recoupe `[x, x + w] × [top, ground]`).

- [ ] **Step 1 : écrire les tests** :

```ts
it('les fenêtres sont celles de la mise en page, socle à la suite', () => { /* f.lamps.slice(0, n) toEqual f.layout.windows ; reste = podiumLayout.windows (home décalé de f.layout.homes.length) */ });
it('aucune fenêtre du fond sous un immeuble proche', () => { /* pour 5 graines : aucune farWindow ne recoupe un near (x, w, ground − h) ni un socle */ });
it('pièce élargie : les immeubles entièrement visibles gardent leurs fenêtres', () => { /* cityFacades(720) vs (1440) : façades avec x + w ≤ 700 → lamps toEqual */ });
it('lot coupé au bord : fenêtres dans la partie visible', () => { /* lamps x ≥ 0 et x + w ≤ width */ });
it('jumeaux : tour hors porte sans cage, rangée du socle sous le haut du socle', () => {});
it('stairsFor : une entrée par porte qui a une cage, clé = centre de la porte', () => { /* clés ⊂ doorsFor(...).map(d => d.x + DOOR_WIDTH / 2) ; fenêtres triées y décroissant */ });
// city-santa.test.ts
it('la fenêtre du père Noël est une fenêtre de logement, à sa taille', () => { /* roof.lamp a w/h ; correspond à une lamp home ≥ 0 */ });
// city-event-place.test.ts
it('appartement : fenêtre de logement, échelle = taille / 5 × 7', () => { /* sx = lamp.w / 5, sy = lamp.h / 7 */ });
```

- [ ] **Step 2 : lancer** `npx vitest run tests/core/library/city-facades.test.ts tests/core/library/city-santa.test.ts tests/core/library/city-event-place.test.ts` → FAIL.
- [ ] **Step 3 : implémenter** `cityFacades` (immeubles proches mis en page depuis `facadeInputs`, socle sur la 1re tour avec la porte du lot) ; `santaRoof` choisit parmi les `lamps` à `home ≥ 0` ; `santa-layer` dessine `roof.lamp.w × h` (halo + 4, + 4) ; `apartmentLamp` filtre `home ≥ 0` et `placeEvent` renvoie `sx: lamp.w / 5, sy: lamp.h / 7`.
- [ ] **Step 4 : lancer** `npm run test:famille -- scene-ville scene-evenements` → PASS (empreinte comprise). Les tests de `paint-city-plan`, `ghibli-city`, `paint-snow` qui lisent encore `5 × 7` ou `ROOF_H` peuvent échouer : ils sont repris aux tâches 5, 8, 9 ; noter la liste dans le message de commit.
- [ ] **Step 5 : commit** `feat(ville): façades en travées dans le moteur, fenêtres du fond masquées`.

---

### Task 4 : logique d'allumage — logement, pièce seule, télé, cage (Opus)

**Files :**
- Modify : `src/core/library/city/window-lights.ts:37-43`, `src/core/library/city/hall-lights.ts` (ajout en fin)
- Test : `tests/core/library/city/window-lights.test.ts`, `tests/core/library/city/hall-lights.test.ts` (ajouts ; créer s'il n'existe pas, il est déjà dans `scene-ville`)

**Interfaces :**
- Produces :
  ```ts
  export const nightness: (daylight: number) => number;      // l'actuelle `darkness` sans le mauvais temps, exportée
  export function soloShare(minutes: number): number;        // part des logements allumés qui n'éclairent qu'une pièce
  export function soloRoom(key: number, minutes: number): boolean; // déterministe en (logement, heure)
  export function roomLit(win: { u: number; key: number; main: boolean }, minutes: number, day: WindowDay | undefined, daylight: number, gloom: boolean): boolean;
  export function roomTone(home: { key: number; tone: HomeTone }, main: boolean, minutes: number): HomeTone;
  // hall-lights.ts : étage atteint (1..floors) pour le passage qui a relancé la minuterie `until` à la porte `doorX`.
  export function stairFloorsLit(doorX: number, until: number, floors: number): number;
  ```
  `soloShare` interpole `[[0, 0.5], [5, 0.4], [7, 0.25], [12, 0.3], [18, 0.25], [19.5, 0.2], [20.5, 0.2], [22, 0.5], [24, 0.5]]` (heures). `soloRoom` : `mulberry32(key ^ Math.imul(Math.floor(minutes / 60) + 1, 2654435761))() < soloShare(minutes)`. `roomLit` = `windowLit(u, …)` et (`main` ou non `soloRoom`). `roomTone` : `tv` seulement sur la pièce principale ; une pièce seule après 20 h prend `tv` si un tirage sur `key` < 0,3 ; sinon la teinte du logement (`tv` → `warm` hors pièce principale). `stairFloorsLit` : `1 + floor(mulberry32(hashString('stair') ^ Math.round(doorX * 8) ^ Math.floor(until * 2))() × floors)` *(le passage est identifié par la fin de sa minuterie)*.

- [ ] **Step 1 : écrire les tests** :

```ts
it('pièce seule : ≈ 20 % au dîner, ≈ 50 % après 22 h', () => { expect(soloShare(h(20))).toBeCloseTo(0.2); expect(soloShare(h(22.5))).toBeCloseTo(0.5); });
it('pièce seule déterministe et stable dans l’heure', () => { expect(soloRoom(123, h(22.1))).toBe(soloRoom(123, h(22.9))); });
it('un logement allumé allume toujours sa pièce principale ; les autres pièces suivent la pièce seule', () => { /* sur 500 clés à 22 h30 : main allumée ⇔ windowLit ; autres allumées ⇔ windowLit && !soloRoom */ });
it('le soir, une part des logements allumés n’éclaire qu’une pièce', () => { /* 1000 clés, 22 h30 : 40 % à 60 % solo */ });
it('télé seulement sur la pièce principale', () => { expect(roomTone({ key: 9, tone: 'tv' }, false, h(21))).not.toBe('tv'); });
it('cage : étage atteint entre 1 et floors, déterministe', () => {});
```

- [ ] **Step 2 : lancer** `npx vitest run tests/core/library/city/window-lights.test.ts tests/core/library/city/hall-lights.test.ts` → FAIL.
- [ ] **Step 3 : implémenter** (la courbe horaire `windowsLitFraction` et `windowLit` ne changent pas ; `darkness` devient `nightness(daylight)` + `gloom`).
- [ ] **Step 4 : lancer** → PASS ; tests existants de `window-lights` inchangés et verts.
- [ ] **Step 5 : commit** `feat(ville): allumage par logement, pièce seule et étage atteint par la cage`.

---

### Task 5 : plan peint et squelette des peintres (Opus)

**Files :**
- Modify : `src/core/library/paint/city-plan.ts:14,30,32,66-69,83-112,261-286`
- Create : `src/core/library/paint/facade-painter.ts`, `src/core/library/paint/roof-painter.ts` (signatures + dessin provisoire : aplat du mur, rectangles de vitre `#7FB4E0`, contour du toit en aplat zinc)
- Modify : `src/core/library/paint/city-painter.ts:16` (`PAINT_VERSION = 8`), `:86-151` (`roofPath`/`paintRoof` réservés au fond s'ils servent encore, sinon supprimés), `:153-331` (`paintBuilding` : fond inchangé ; premier plan → `paintFacade` puis `paintParisRoof`), `:551-607` (`paintPodium` lit `p.wins` issus de `podiumLayout`)
- Test : `tests/core/library/paint/paint-city-plan.test.ts`, `tests/core/library/paint/paint-city-painter.test.ts`

**Interfaces :**
- Consumes : `Facade.layout`, `Facade.podiumLayout`, `roofOutline` (tâches 2-3).
- Produces :
  ```ts
  // city-plan.ts
  export type Win = { x: number; y: number; w: number; h: number; dormer: boolean; curtain: boolean; kind?: WindowKind };
  export type PaintBuilding = { id: number; x: number; w: number; top: number; far: boolean; wins: Win[]; look: Look; podiumTop: number | null; layout: FacadeLayout | null; homes: Home[] };
  // facade-painter.ts — décor fixe d'un immeuble du premier plan, état de jour (la nuit vient du filtre + calque SVG)
  export function paintFacade(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding): void;
  export function paintDayWindow(ctx: PaintCtx, b: PaintBuilding, win: FacadeWindow): void;
  export function paintBalcony(ctx: PaintCtx, b: PaintBuilding, x: number, y: number, w: number, filant: boolean): void;
  // roof-painter.ts
  export function paintParisRoof(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding): void;
  export function paintChimney(ctx: PaintCtx, c: Chimney): void;
  export function paintDormer(ctx: PaintCtx, b: PaintBuilding, d: Dormer): void;
  ```
  Premier plan : `look.wall = hexRgb(layout.wall)`, `look.roofH = layout.roof.h` ; `lookOf` garde son tirage (antenne, gouttière, lierre, linge, jardinières lus seulement si `layout.kind === 'faubourg'` pour lierre/linge ; `roofKind`, `roof`, `balconyRow`, `chimney`, `shutters`, `boxes` ne servent plus qu'au fond — le dire en commentaire). Jumeaux : la 2e tour prend la teinte voisine (`differ`) dans `STONES`/`PLASTERS` et `ZINCS`/`TILES` de `notes.md` si elle égale la 1re. `wins` du premier plan = fenêtres d'étage de la mise en page (`kind` renseigné, `dormer: false`) ; `curtain` vient du logement.

- [ ] **Step 1 : mettre à jour les tests** : `paint-city-plan.test.ts` l. 26-28 (fenêtres de tour = `layout.windows` hors lucarnes, plus de `ROOF_H`), l. 59-61 (types de toit : mansarde, zinc, tuile au premier plan ; fond inchangé) ; ajouter :

```ts
it('les deux tours d’un socle n’ont ni le même mur ni le même toit', () => {});
it('PAINT_VERSION vaut 8 (cache des tranches invalidé)', () => { expect(tileKey(plan, 0).startsWith('8|')).toBe(true); });
```

  Les tests existants « rien au-dessus de la silhouette », « peint à l'identique quelle que soit la tranche », mitoyens (l. 174, lit `look.roofH`) restent et doivent passer avec le dessin provisoire.
- [ ] **Step 2 : lancer** `npx vitest run tests/core/library/paint/paint-city-plan.test.ts tests/core/library/paint/paint-city-painter.test.ts` → FAIL.
- [ ] **Step 3 : implémenter** le plan, les deux fichiers de peintres (dessin provisoire minimal, déterministe, dans la boîte) et le branchement de `paintBuilding` / `paintPodium`.
- [ ] **Step 4 : lancer** `npm run test:famille -- scene-ville` → PASS sauf `ghibli-city` (tâche 9) et `paint-snow` (tâche 8), à lister.
- [ ] **Step 5 : commit** `feat(ville): plan peint d'après la mise en page, squelette des peintres de façade et de toit`.

---

### Task 6 : peintre des façades (Fable)

**Files :**
- Modify : `src/core/library/paint/facade-painter.ts` (corps seulement)
- Test : `tests/core/library/paint/paint-city-painter.test.ts` (existants)

**Interfaces :**
- Consumes : signatures de la tâche 5 (inchangées) ; `PaintBuilding.layout` (niveaux, fenêtres, logements, `shutters`, `box`), primitives de `paint/cel.ts`.

Porter `paintFacade` (l. 175-210, sans `paintGroundFloor` : devantures et entrées restent celles de l'app ; garder le bandeau au-dessus du rez-de-chaussée), `paintWindow` dans son état **de jour éteint** (l. 259-309 hors branche `lit` : encadrement, vitre `#7FB4E0` + reflet blanc 0,72, rideaux du logement, menuiserie, volets et jardinière lus dans la mise en page), `paintBalcony` (l. 312-333 sans la lumière retombée). Garder du peintre actuel (`city-painter.ts:162-196,269-330` avant la tâche 5) : ombre portée du voisin de gauche, liseré clair, salissure du pied (pas sous une tour de jumeau), lierre et linge (faubourg seulement), gouttière, trait des mitoyens. Pas de `Math.random`, aucun tirage hors des générateurs par immeuble.

- [ ] **Step 1 : porter le dessin** ; capture au banc (jour 10 h, `art=ghibli`) postée à l'utilisateur sans attendre.
- [ ] **Step 2 : lancer** `npx vitest run tests/core/library/paint/paint-city-painter.test.ts` → PASS (silhouette, raccord de tranches, mitoyens).
- [ ] **Step 3 : commit** `feat(ville): façades haussmanniennes et de faubourg peintes en cellulo`.

---

### Task 7 : peintre des toits, lucarnes et cheminées (Fable)

**Files :**
- Modify : `src/core/library/paint/roof-painter.ts` (corps seulement)
- Test : `tests/core/library/paint/paint-city-painter.test.ts` (existants)

**Interfaces :**
- Consumes : `roofOutline(layout)` (le trait encré du toit suit exactement ce contour), `layout.dormers`, `layout.chimneys`, `look.antenna`.

Porter `paintRoof` (l. 335-367 : brisis, terrasson, joints debout ; toit simple à faîtage à 42 %), `paintChimney` (l. 368-375, aux coordonnées de `Chimney`, pots de `top − 2.3` à `top`), `paintDormer` (l. 377-417, état de jour : les vitres allumées sont au calque SVG) ; corniche sous le toit (l. 202-205) ; antenne existante (`city-painter.ts:213-226`) posée sur le nouveau contour.

- [ ] **Step 1 : porter le dessin** ; capture au banc (jour 10 h + zoom ×4 sur une mansarde) postée à l'utilisateur.
- [ ] **Step 2 : lancer** `npx vitest run tests/core/library/paint/paint-city-painter.test.ts` → PASS (rien au-dessus de la silhouette : cheminées dans la boîte, antenne ≤ 9 px).
- [ ] **Step 3 : commit** `feat(ville): toits en zinc, lucarnes et souches de cheminées peints en cellulo`.

---

### Task 8 : neige sur les nouveaux toits (Opus)

**Files :**
- Modify : `src/core/library/paint/snow-painter.ts:12` (`SNOW_VERSION = 4`), `:25-62` (`roofLineY`, `roofSpan`, `roofCuts` : premier plan lu dans `roofOutline(b.layout)`, fond inchangé ; `chimneyBox` → `chimneyBoxes(plan, b): { x0: number; x1: number; y0: number }[]` d'après `layout.chimneys`), `:110-115` (rebords : fenêtres `std`, `top`, `mezz`, `stair` ; dalles des balcons des niveaux `filant`/`balconnet` ; lucarnes : fronton et capucine sur leur petit toit)
- Test : `tests/core/library/paint/paint-snow.test.ts`

**Interfaces :**
- Consumes : `roofOutline`, `FacadeLayout.levels`, `chimneys`, `dormers`.

- [ ] **Step 1 : mettre à jour les tests** : l. 18 (`chimneyBoxes`), l. 24-33 (premier plan : `roofLineY` en x = milieu vaut `top + 0.5` ; aux extrémités du contour, `eave`) ; ajouter :

```ts
it('mansarde : neige sur le terrasson et le brisis, jamais au-dessus du contour', () => {});
it('neige sur les dalles des balcons filants', () => {});
```

  Les tests « neige seulement sur toits, cheminées, rebords… », « raccord », « toits du fond jamais peints sur un immeuble du premier plan » restent.
- [ ] **Step 2 : lancer** `npx vitest run tests/core/library/paint/paint-snow.test.ts` → FAIL.
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : lancer** `npm run test:famille -- scene-meteo` → PASS.
- [ ] **Step 5 : commit** `feat(ville): neige posée sur les mansardes, lucarnes, cheminées et balcons`.

---

### Task 9 : calque des fenêtres Ghibli et vue classique (Opus)

**Files :**
- Create : `src/content/ghibli-window-art.tsx` (composants de présentation, dessin provisoire : rectangles teintés)
- Modify : `src/content/ghibli-windows.tsx:1-49` (réécrit), `src/content/scene-city.tsx:103-125,243`
- Test : `tests/content/ghibli-city.test.tsx`, `tests/content/ghibli-windows.test.tsx` (nouveau ; ajouter `'ghibli-windows.*'` à `scene-ville` dans `tests/familles.ts:120-123`)

**Interfaces :**
- Consumes : `Facade.lamps`, `Facade.homes`, `Facade.layout`, `roomLit`, `roomTone`, `soloRoom`, `nightness` (tâches 3-4).
- Produces (dessinés par la tâche 10, signatures figées ici) :
  ```ts
  // Lueur qui retombe, une par taille de fenêtre : <path id={glowId(w, h)}> dans <defs>, réutilisé par <use>.
  export const glowId: (prefix: string, w: number, h: number) => string;
  export function GlowDefs({ prefix, sizes }: { prefix: string; sizes: readonly { w: number; h: number }[] }): ReactElement;
  // Vitres éteintes d'un immeuble la nuit : deux chemins (vitre sombre, reflet) couvrant toutes ses vitres et lucarnes.
  export function NightGlass({ layout, wall, opacity }: { layout: FacadeLayout; wall: string; opacity: number }): ReactElement;
  // Fenêtre allumée : lueur (<use>), vitre teintée, reflet, rideaux et accessoires du logement, menuiserie, garde-corps en
  // silhouette et dalle teintée devant une porte-fenêtre à balcon, appui et jardinière teintés.
  export function LitWindow({ win, home, level, tone, glow }: { win: FacadeWindow; home: Home | null; level: Level | null; tone: HomeTone; glow: string }): ReactElement;
  export function StairWindow({ win }: { win: FacadeWindow }): ReactElement;
  ```
  `GhibliWindows` garde ses props (`buildings, minutes, day, daylight, gloom, dim, farLight`). Ordre : lumières du fond (`farWindows` déjà filtrées), puis par immeuble proche `<g data-night-glass>` (opacité `nightness(daylight)`, fondu 4 s), puis un `<g data-lamp data-lit data-home>` par fenêtre allumable (`home ≥ 0`), opacité `roomLit(...) ? dim : 0`, transition `opacity 4s ease`. Cage et entresol absents de ce calque. Vue classique : un `<rect data-lamp>` par fenêtre allumable à `w × h`, même règle `roomLit`.

- [ ] **Step 1 : écrire les tests** (`ghibli-windows.test.tsx`, jsdom) :

```ts
it('les fenêtres d’un logement s’allument ensemble, sauf en pièce seule', () => {});
it('22 h ↔ 2 h ↔ 21 h59 / 22 h01 : même nombre de nœuds, seule l’opacité change', () => {});
it('pas plus de nœuds que sur main', () => { expect(count).toBeLessThanOrEqual(empreinte.ghibliWindowsNodes); });
it('midi sous un ciel couvert : vitres éteintes non assombries (opacité 0), fenêtres allumables', () => {});
it('aucune lumière du fond dans l’emprise d’un immeuble proche', () => {});
it('une seule définition de lueur par taille de fenêtre', () => { /* nombre de [data-glow-def] = tailles distinctes */ });
```

  et dans `ghibli-city.test.tsx` : l. 55 (compte des `data-lamp` = fenêtres allumables, plus `lamps.length`), l. 110-119 (nuit : fenêtres allumées hors filtre ; rien à midi).
- [ ] **Step 2 : lancer** `npx vitest run tests/content/ghibli-windows.test.tsx tests/content/ghibli-city.test.tsx` → FAIL.
- [ ] **Step 3 : implémenter** le calque, les composants provisoires et la vue classique.
- [ ] **Step 4 : lancer** `npm run test:famille -- scene-ville` → PASS (tout, empreinte comprise).
- [ ] **Step 5 : commit** `feat(ville): calque des fenêtres par logement, vitres sombres la nuit, fenêtres du fond corrigées`.

---

### Task 10 : dessin des fenêtres allumées, de la lueur et des vitres de nuit (Fable)

**Files :**
- Modify : `src/content/ghibli-window-art.tsx` (corps seulement)
- Test : `tests/content/ghibli-windows.test.tsx` (existants)

**Interfaces :**
- Consumes : signatures de la tâche 9 (inchangées).

Porter en SVG la branche allumée de `paintWindow` (l. 251-277 : lueur en trapèze à fond arrondi, deux paliers `rgba(255,214,130,0.22)`, `d = clamp(0.7 h, 4, 9)`, liseré 0,16 ; vitre teintée `#FFD86A`/`#FFF0C0`/`#FFB048`/`#9CC4FF` avec barre claire de télé ; voilage, rideaux latéraux, lampe/plante/étagère), la lumière retombée sur balcon (l. 315-331 : dalle et garde-corps teintés, barreaux en silhouette sur la vitre) et sur jardinière (l. 306) ; `NightGlass` d'après l. 279-284 (`#232D52` mêlé à 25 % au mur ambiant, reflet `rgba(150,170,230,0.22)`) ; `StairWindow` en `#F4F0D8`. Garder la silhouette `data-figure` existante dans les fenêtres allumées sans accessoire (les personnages viennent au chantier 2). Aucune animation, aucun dégradé, aucun filtre.

- [ ] **Step 1 : porter le dessin** ; captures au banc 19 h, 22 h (+ zoom ×4), 2 h, postées à l'utilisateur.
- [ ] **Step 2 : lancer** `npx vitest run tests/content/ghibli-windows.test.tsx` → PASS (borne de nœuds comprise).
- [ ] **Step 3 : commit** `feat(ville): fenêtres allumées, lueur qui retombe et vitres de nuit en cellulo`.

---

### Task 11 : cage d'escalier dans le calque animé (Opus)

**Files :**
- Create : `src/content/stair-lights.tsx`
- Modify : `src/content/city-life.tsx:288` (`stairsFor(facades)` mémorisé), `:667-674` (boucle : bascule des cages), `:766` (rendu à côté de `HallLights`)
- Test : `tests/content/hall-lights.test.tsx` (composant), `tests/content/city-life.test.tsx` (boucle, à côté de « la nuit, le hall s'allume après un passage… » l. 405)

**Interfaces :**
- Consumes : `stairsFor`, `StairWindow` (tâches 3, 10), `hallLit`, `stairFloorsLit` (tâche 4), `hallUntil` (ref existante).
- Produces : `StairLights({ stairs, ghibli, still, lit }: { stairs: Map<number, FacadeWindow[]>; ghibli: boolean; still: boolean; lit: (doorX: number, floor: number) => boolean }): ReactElement` — un `<g data-stair-light={doorX} data-floor={k}>` par fenêtre de cage (Ghibli : `StairWindow` ; classique : rect `#F4F0D8`). Boucle : allumé si `hallLit(hallUntil, x, t, hallDark) && k < stairFloorsLit(x, hallUntil.get(x)!, stairs.get(x)!.length)` ; allumage `opacity 0.3s ease ${k * 0.5}s` (étage par étage, du bas), extinction `opacity 1s ease` ; `still` : `none`. N'écrire qu'à la bascule, comme les halls.

- [ ] **Step 1 : écrire les tests** :

```ts
it('cage éteinte de jour et sans passage ; allumée du bas jusqu’à l’étage atteint après un passage de nuit', () => {});
it('étage par étage : délai croissant avec l’étage à l’allumage', () => {});
it('mouvement réduit : aucune transition', () => {});
it('jamais allumée en continu : éteinte quand la minuterie des halls est échue', () => {});
```

- [ ] **Step 2 : lancer** `npx vitest run tests/content/hall-lights.test.tsx tests/content/city-life.test.tsx` → FAIL.
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : lancer** `npm run test:famille -- scene-ville scene-pietons scene-evenements` → PASS.
- [ ] **Step 5 : commit** `feat(ville): cage d'escalier allumée étage par étage au passage des habitants`.

---

### Task 12 : banc, captures, comparaison avec la maquette, mesure CPU (Opus ; Fable pour les retouches de dessin)

**Files :**
- Modify : `.superpowers/harness-ville/*` (copié depuis le dépôt principal, non commité ; ajouter le paramètre `snow=1` → `city.snow = true`)
- Create : `.superpowers/captures-facades/` (PNG + `journal.md`)

- [ ] **Step 1 :** lancer le banc (`art=ghibli`, port libre ≥ 5226) ; script de captures dérivé de `cap.mjs` (attendre `[data-painted-city][data-ready=true]`).
- [ ] **Step 2 : captures** 1080 px, graine de la maquette et graine 5 : jour 10 h, 19 h, 22 h, 2 h, 22 h sous la pluie, neige à 10 h ; zooms ×4 sur une mansarde le jour et une façade à 22 h ; vue classique (`classic-engine`) à 22 h.
- [ ] **Step 3 :** comparer à `rue-jour-10h.png`, `rue-crepuscule-19h.png`, `rue-nuit-22h.png`, `rue-nuit-2h.png`, `lucarnes-planche.png` et à l'anti-objectif §4 de la spec (pas de grille, pas de lucarne par travée, pas de fenêtre collée au bord, pas de halo rectangulaire, pas de fenêtre du fond devant un immeuble proche) ; écarts dans `journal.md` ; retouches de dessin par Fable dans les fichiers des tâches 6, 7, 10 seulement.
- [ ] **Step 4 : mesure** (Chrome sans tête, CDP `Emulation.setCPUThrottlingRate { rate: 4 }`) sur main (worktree propre) et sur la branche, mêmes paramètres (1080 px, 22 h, pluie puis sans) : temps de peinture des tranches au premier affichage, puis `Performance.getMetrics` (`ScriptDuration` + `TaskDuration`) sur 20 s de rue animée ; 3 essais, médiane, dans `journal.md`. Régression > 15 % → profiler et corriger avant la PR.
- [ ] **Step 5 :** `npm run test:famille -- scene-ville scene-meteo scene-pietons scene-evenements scene-commerces` → PASS ; `npx tsc --noEmit` → aucune erreur.
- [ ] **Step 6 :** envoyer les captures à l'utilisateur ; commit des retouches `fix(ville): retouches des façades après comparaison avec la maquette`.

---

### Task 13 : revue finale, PR, fusion, pré-prod (Opus)

- [ ] **Step 1 :** revue de toute la branche (`git diff main...HEAD`) par un relecteur neuf ; corriger critiques et importants, noter les mineurs dans la PR.
- [ ] **Step 2 :** `git push -u origin feat/facades-parisiennes` ; PR vers `main` (`gh pr create --body-file`) : résumé didactique (à quoi ça sert, d'où viennent les données, comment ça marche, limites : gabarits gardés donc 2-4 travées, seuils haussmann ajustés, cage dès 3 travées, personnages au chantier 2), captures, mesures, mineurs reportés ; pied « 🤖 Generated with [Claude Code](https://claude.com/claude-code) ».
- [ ] **Step 3 :** fusionner la PR sans demander ; puis, dans le worktree qui a `main` extrait et propre (`git branch --show-current` = `main`, `git status` vide, `git pull`), `npm run preprod` puis `npm run build`.
- [ ] **Step 4 :** mettre à jour la mémoire du projet (PR, numéro de pré-prod, reste : vérification sur le S26).
