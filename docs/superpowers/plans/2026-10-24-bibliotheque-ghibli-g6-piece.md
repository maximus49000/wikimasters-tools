# G6 — La pièce façon Ghibli — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** redessiner tout l'intérieur de la pièce (36 meubles, objets portés, faces dessinées, décors et objets muraux, mur, sol, fenêtres, lumière) en cellulo Ghibli, chaque meuble étant un vrai volume 3D arrondi rendu en dessin animé sous ses 8 angles dans la perspective de la maquette, avec un mobilier qui réagit quand un animal s'en sert.

**Architecture :** un moteur cellulo pur (`src/core/library/cel/`, portage du mini-moteur de la maquette : maillages arrondis, z-buffer logiciel, deux tons + rehaut, encre de silhouette et d'arêtes, ombre portée) rend chaque meuble en image RGBA ; la projection de la pièce devient la caméra en perspective de la maquette (`f = 650`, `pitch` 0,24, `yaw` par 45°) dans `furniture-render3d.ts`, ce qui recalcule toute la géométrie en pixels sans toucher la grille ni les données enregistrées. Un hôte de sprites (`src/content/furniture/`) peint ces images par tranches de temps, les garde en data URL (LRU + plafond d'octets) et les pose en `<image>` dans `RoomView` ; tant qu'un sprite n'est pas prêt, l'ancien dessin `Model3DArt` (même projection) reste affiché. Les décalques des cartes restent en SVG par-dessus. La lumière garde son moteur et passe en deux tons nets ; le mobilier vivant est un livre d'événements pur (`furniture-life.ts`) qui choisit des paliers précalculés et décale l'animal porté.

**Tech Stack :** TypeScript, React 19 (SVG), canvas 2D (`putImageData` + `toDataURL`, jamais `blob:`), vitest (jsdom, `createRoot` + `act`, pas de @testing-library), WXT, Vite (banc), playwright-core + Chrome (captures).

**Spec :** `docs/superpowers/specs/2026-10-24-bibliotheque-ghibli-g6-piece-design.md` (à lire en entier avant chaque tâche). **Source du portage :** `docs/superpowers/maquettes/g6-piece/piece-ghibli.html` (validée v3) — numéros de ligne cités ci-dessous : couleurs `tone/sh/li` 44-49, maillages `superEll` 54, `lathe` 63, `tube` 72, `leaf` 83, `finish` 93, `smooth` 104, `place` 112, `part` 118, rendu `render` 120-172, styles 174-181, chat 184-230, rocking-chair `chair` 231-247 (`RUN_R = 95`), canapé `sofa` 248-283, `arcLamp` 284, `gueridon` 297, `palm` 304, `beanbag` 321, `monstera` 326, `lantern` 342, `catTree` 351, fond `drawBackground` 365-421, `curtain` 422-433, réglages de la pièce `ROOM` 438, chronologie du chat et loi de bascule `timeline` 466-480, tour du meuble `TOUR` 498. Les PNG du même dossier sont la référence visuelle validée.

## Global Constraints

- **Une seule PR** vers `main`, depuis la branche `feat/bibliotheque-ghibli-g6` (créée depuis `origin/main` à l'exécution, `origin/maquettes/g6-piece` y est fusionnée : maquette + spec + ce plan).
- **Modèle par tâche** (règle du 2026-10-17) : indiqué dans le titre de chaque tâche. Fable = volumes et dessin, fond, décors, chorégraphie ; Opus = moteur, caméra, géométrie en pixels, caches, RoomView, lumière, animaux qui suivent ; Sonnet = banc, tests, vignettes, captures. Sans jetons Fable : Opus fait la tâche et le note dans `docs/superpowers/notes/2026-10-11-visuels-sans-fable.md`. Commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (Fable : `Claude Fable 5.1 <noreply@anthropic.com>` ; Sonnet : sa propre ligne).
- **Langage cellulo** (spec §3) : aplat, UN ton d'ombre à bord net teinté violet (`COOL #5A4A9C`), rehaut (`SUN #FFF6D0`) sur les arrondis, encre `#2A1A18` épaisse en silhouette et fine sur les arêtes ; ni grain, ni vignettage, ni flou. Constantes reprises de `src/core/library/paint/cel.ts` (`COOL`, `SUN`, `INK`), jamais redéfinies.
- **Caméra** : `f = 650` (cm), `pitch = 0,24` rad, `yaw = −angle × π/4` (convention de `turn` dans `furniture-render3d.ts:132` : angle 1 = la face avant tourne vers la gauche). Vue plongeante : même modèle, `pitch = 0,97` (départ, réglé au banc). Échelle : `PX_PER_CM_X` (30/21 px par cm) au point d'ancrage.
- **Aucune donnée enregistrée ne migre** : `drawSize` (cases), `floorOffsets`, `floorCells`, colonne/rangée/demi-case/angle et l'ordre de dessin (`byDrawOrder`) restent identiques à `main` pour les 36 meubles × 8 angles. Les modèles en cm (`FURNITURE_MODELS`) gardent `w/d/h`, `pois`, `face`, `perch`, `glow`, `base`.
- **Sprites** : une image par (meuble, angle, style, côté de lumière, caméra, résolution, état de vie, allumé) et une par objet porté ; data URL PNG ; `SPRITE_PX = 3` px d'image par px de pièce, suréchantillonnage `SPRITE_SS = 2` ; cache LRU 220 images et 48 Mo de data URL au plus ; peinture par tranches de 6 ms par image d'animation ; jamais de `blob:` ; aucune image de site tiers ne passe dans un canvas (les URL de cartes n'entrent jamais dans une clé ni dans un peintre).
- **Une seule direction de lumière par pièce** pour le modelé des sprites : côté de la plus grande vitre (`left`/`right`), `left` sans fenêtre ; vecteur `[±0,62, 0,72, −0,14]` (maquette `ROOM`, l. 438, seuil `thr = −0,18`). Jamais de miroir d'image : chaque angle est rendu. Les sprites ne sont jamais assombris : la luminosité est l'affaire du seul calque de lumière.
- **Repli** : tant que le sprite d'un meuble n'est pas prêt, `Model3DArt` (même projection) ; vitest garde le classique par défaut (`__WMT_ART_DEFAULT__`) : le rendu par sprites ne monte qu'en Ghibli (`useArtStyle()[0] === 'ghibli'`).
- **Mobilier vivant** : réaction seulement à l'usage par un animal (actions existantes `perch`, `sleep`, `hide`, `scratch`, `eat`/`drink`, `charge`) ; aucune réaction en Aménager/Modifier ; aucun meuble repeint à chaque image (paliers précalculés) ; l'animal porté reçoit le même décalage et la même rotation que le meuble.
- **Tests** : ne jouer que les familles touchées (`npm run test:famille -- scene-piece scene-lumiere scene-animaux` etc.) ; tout nouveau fichier de test entre dans une famille EXISTANTE (motifs ajoutés à `tests/familles.ts` : `furniture-cel*` et `furniture-life*` dans `scene-piece` côté `lib`, `furniture-sprite*` dans `scene-piece` côté `c`, `light-cel.*` dans `scene-lumiere`) ; pas de TNR global sauf demande. Les tests qui figent des pixels sont mis à jour, jamais désactivés. Tests en `describe/it` français, commentaires en français.
- **Pièges du worktree** : `node_modules` = jonction vers le dépôt principal ET copie de `.wxt/` depuis le dépôt principal (sinon `TSCONFIG_ERROR`) ; vitest avale `console.log` (`--silent=false --reporter=verbose`) ; le `node_modules` du dépôt principal n'a ni `three` ni `@fontsource` : la pré-prod se lance depuis `C:\Users\maxim\Downloads\Wikimasters-mobilier` (node_modules complet) ; `gh pr create --body-file` (jamais `--body`). Avant chaque commit : `git branch --show-current` = `feat/bibliotheque-ghibli-g6`. Pas de `git stash` nu.
- **Quota** : avant chaque tâche, lire l'usage du quota 5 h (`/usage` ou barre d'état). À 99 % : finir la tâche en cours, noter l'état dans `.superpowers/sdd/2026-10-24-bibliotheque-ghibli-g6/progress.md` et dans la mémoire `project_ghibli.md`, programmer un réveil (`send_later`) à la remise à zéro, puis reprendre automatiquement à la tâche suivante.
- **Captures au fil de l'eau** : chaque tâche visuelle se termine par des PNG du banc publiés sur la branche `captures/g6-piece` (tâche 4) et postés dans la conversation, sans attendre de validation.
- Hors périmètre (spec §6 et §9) : aucun nouveau meuble, aucun humain, aucun nouveau point d'usage ; animaux dessinés comme aujourd'hui (G7) ; gamelle qui se vide, entrée par la niche et gestes d'animaux laissés à G7.
- Pas de fiche WikiHow. Pas de mesure téléphone par PR (campagne après G7) ; mesure au banc CPU ×4 comparée à `main` + validation visuelle sur le S26 (tâche 20).

## Review Focus

1. **Sprite absent au premier affichage, évincé du cache, ou clé changée** (changement d'angle, de style, lampe allumée, palier de vie) : le dernier sprite montré du même meuble reste à sa place, sinon `Model3DArt` au même endroit ; jamais de trou, de saut de position ni de clignotement. → tests de la tâche 3 (« garde la dernière image », « repli à la même place »).
2. **Pièces enregistrées existantes** (demi-cases, 8 angles, bibliothèques liées, lampadaire arc en surplomb) : mêmes cases au sol, même ordre de dessin, même rangée de surplomb ; aucun meuble ne « descend » d'une rangée. → test « la grille ne bouge pas » de la tâche 2 (instantané pris sur `main`).
3. **Couvertures de sites tiers** sur une étagère ou un écran : elles s'affichent par-dessus le sprite à leur cadre exact et ne passent jamais dans un canvas (sinon `toDataURL` lève `SecurityError` et le meuble ne s'affiche plus). → test « aucune URL dans une clé ni un peintre » de la tâche 3 et test des cadres de décalques de la tâche 11.
4. **Animal sur un meuble qui bouge, puis meuble déplacé, pièce passée en Aménager ou animal parti en plein balancement** : le meuble finit au repos, l'animal ne flotte ni ne s'enfonce (écart pieds/assise ≤ 0,5 px), aucune réaction pendant l'aménagement. → tests de la tâche 15.
5. **Nuit sans lampe / nuit avec lampe sous la pluie / pièce sans fenêtre** : la pièce n'est assombrie qu'une fois (aucun filtre ni opacité sur les sprites), la flaque de la lampe a deux tons nets et un fondu court à l'allumage, la lumière des sprites vient du haut-gauche sans fenêtre. → tests de la tâche 14 et test `roomLightSide` de la tâche 1.

---

## Mise en place (avant la tâche 1, par l'exécutant)

1. `git -C "C:\Users\maxim\Downloads\Wikimasters tools" fetch origin` puis `git worktree add C:\Users\maxim\Downloads\Wikimasters-g6 -b feat/bibliotheque-ghibli-g6 origin/main` ; dans ce worktree : `git merge --no-ff origin/maquettes/g6-piece -m "Merge maquettes/g6-piece (maquette, spec, plan G6)"`.
2. Jonction `node_modules` : `cmd /c mklink /J node_modules "C:\Users\maxim\Downloads\Wikimasters tools\node_modules"` ; copie de `.wxt/` depuis le dépôt principal. Contrôle : `npm run test:famille -- scene-piece` → vert (état de départ, noter les durées).
3. Worktree des captures : `git worktree add --orphan -b captures/g6-piece C:\Users\maxim\Downloads\Wikimasters-g6-captures` (dossier `g6/` + `g6/README.md` vide), poussé une fois (`git push -u origin captures/g6-piece`).
4. Journal SDD : créer `.superpowers/sdd/2026-10-24-bibliotheque-ghibli-g6/progress.md` (une ligne par tâche : état, commit, captures publiées, écarts).
5. playwright-core hors dépôt : `npm i playwright-core` dans `%TEMP%\pw-g6` ; navigateur `C:/Program Files/Google/Chrome/Application/chrome.exe` (même montage que `.superpowers/harness-fond/perf3.mjs`).

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/core/library/cel/mesh.ts` | maillages arrondis (`superEll`, `lathe`, `tube`, `leaf`, `smooth`, `place`, `part`) |
| `src/core/library/cel/tone.ts` | `Tone` (base, ombre, rehaut) à partir de `paint/cel.ts` |
| `src/core/library/cel/camera.ts` | caméras en perspective, `yawOf`, `centeredOf`, `viewPoint` |
| `src/core/library/cel/light.ts` | `LightSide`, `lightVector`, `roomLightSide` |
| `src/core/library/cel/raster.ts` | rendu cellulo pur (z-buffer, tons, encre, ombre), par tranches |
| `src/core/library/cel/life-state.ts` | `LifeState` (état de vie d'un meuble) et `REST_LIFE` |
| `src/core/library/cel/convert.ts` | `celFromModel` : modèle à boîtes → maillages arrondis (repli de dessin tant qu'un meuble n'est pas redessiné) |
| `src/core/library/cel/looks.ts` | `CelLook` des 8 styles (couleurs + variantes de pièces) |
| `src/core/library/cel/models/{index,seating,wood,storage,plants,lights-pets,steampunk,items}.ts` | dessin 3D par familles (`CEL_MODELS`, `CEL_ITEMS`) |
| `src/core/library/cel/sprite-key.ts` | spécifications et clés de sprite (`CEL_VERSION`) |
| `src/core/library/furniture-render3d.ts` (mod.) | projection en perspective dans `layoutOf`, `faceQuadOf`, `HEIGHT_PX_PER_CM` |
| `src/core/library/footprint.ts`, `room-grid.ts`, `light/occluders.ts`, `carried-items.ts` (mod.) | géométrie en pixels recalculée |
| `src/core/library/furniture-life.ts`, `furniture-life-specs.ts` | livre des réactions, lois de mouvement, l'animal suit le meuble |
| `src/core/library/light/cel-light.ts` | calque de lumière en deux tons nets |
| `src/content/furniture/sprite-paint.ts` | peinture d'un sprite (canvas `willReadFrequently`, data URL) |
| `src/content/furniture/sprite-host.tsx` | `SpriteRegistry`, `SpriteContext`, `useSprite`, `FurnitureSprite`, `CarriedSprite`, `DecalLayer` |
| `src/content/furniture/life-host.ts` | `LifeContext`, pose imperative des paliers (href) et des décalages d'animaux |
| `.superpowers/harness-piece/*` | banc de la pièce (pièce par style, heure, météo, animal ; planche 8 angles ; captures ; publication) |

Fichiers de branchement modifiés (Ghibli seulement sauf mention) : `RoomView.tsx`, `pet-sim.ts`, `light-layer.tsx`, `room-backdrop.tsx`, `window-art.tsx`, `room-steampunk-decor.tsx`, `deco-art.tsx`, `deco-live.tsx`, `library-card-art.tsx`, `game-spine.tsx`, `hifi/hifi-art.tsx`, `furniture-zoom.tsx`, `shelf-board-zoom.tsx`, `hifi/HifiZoom.tsx`, `arrange/ArrangeView.tsx`, `furniture-thumb.tsx`, `opened-item/*`. La projection (tâche 2) change pour tous les rendus, classique compris.

**Décisions de portage (écarts motivés à la spec) :**
- *Ancrage du sprite* : le milieu avant de la trace au sol tombe au milieu du bas du rectangle de grille (là où sont aujourd'hui les pieds avant) ; la perspective tasse la profondeur (0,34 px/cm au lieu de 0,567 px/cm de la grille), donc le dos d'un meuble profond est dessiné un peu plus bas que la rangée de grille du fond. On garde la grille (spec : rien ne migre) ; le sprite peut déborder au-dessus du rectangle, la zone de toucher suit le dessin.
- *Objets portés* : chacun garde son propre sprite (rendu avec la caméra de son porteur, à sa position), au lieu d'être cuit dans le sprite du meuble : le glissé, le filigrane, la découpe à l'ouverture et le toucher par objet restent ceux d'aujourd'hui.
- *Peinture* dans le fil principal par tranches de temps (pas de worker : la CSP du site bloque les workers `blob:` d'un script de contenu).
- *Décalques* : matrice affine par décalque (petites faces, écart ≤ 1 px) ; la face de l'étagère, grande, passe par une homographie (`applyFace`/`invertFace`) pour le toucher et les emplacements.

---

### Task 1 : moteur cellulo pur et caméra en perspective (Opus)

**Files :**
- Create : `src/core/library/cel/mesh.ts`, `tone.ts`, `camera.ts`, `light.ts`, `raster.ts`
- Modify : `tests/familles.ts` (motifs `furniture-cel*`, `furniture-life*`, `furniture-sprite*`, `light-cel.*`)
- Test : `tests/core/library/furniture-cel-raster.test.ts`, `tests/core/library/furniture-cel-camera.test.ts`

**Interfaces :**
- Produces :
  ```ts
  // mesh.ts — repère « centré » de la maquette : x à droite, y en haut, z vers le spectateur, origine au centre de la base, cm
  export type Vec3 = [number, number, number];
  export type Mesh = { v: Vec3[]; n: Vec3[]; t: [number, number, number][] };
  export type Deform = (x: number, y: number, z: number) => Vec3;
  export function superEll(a: number, b: number, c: number, e1: number, e2: number, nu?: number, nv?: number, deform?: Deform): Mesh;
  export function lathe(profile: [number, number][], nv?: number, deform?: Deform, opt?: { caps?: boolean }): Mesh;
  export function tube(pts: Vec3[], r: number, nv?: number): Mesh;
  export function leaf(outline: [number, number][], th?: number, deform?: Deform, center?: [number, number]): Mesh;
  export function smooth(pts: Vec3[], k: number): Vec3[];
  export type Placement = { rx?: number; ry?: number; rz?: number; s?: number | Vec3; t?: Vec3 };
  export function place(m: Mesh, o: Placement): Mesh;
  export type CelPart = { m: Mesh; col: Tone; crease?: boolean; creaseThr?: number; flat?: boolean; noshadow?: boolean; hi?: boolean; glow?: boolean; interior?: boolean }; // interior : visible à travers une ouverture (fond, dessus des tablettes)
  export const part: (m: Mesh, col: Tone, o?: Omit<CelPart, 'm' | 'col'>) => CelPart;
  // tone.ts
  export type Tone = { base: string; shade: string; hi: string };
  export function tone(c: string, o?: { s?: number; h?: number }): Tone; // shade = mix(c, COOL, s ?? 0,32), hi = mix(c, SUN, h ?? 0,4)
  export const WARM_LIT: Tone; // { base: '#FFE9B0', shade: '#FFE9B0', hi: '#FFF6D0' } : abat-jour allumé, non ombré
  // camera.ts
  export type PerspCamera = { id: 'room' | 'plunge'; f: number; pitch: number; scale: number };
  export const ROOM_CAMERA: PerspCamera;   // { id: 'room', f: 650, pitch: 0.24, scale: 30 / 21 }
  export const PLUNGE_PERSP: PerspCamera;  // { id: 'plunge', f: 650, pitch: 0.97, scale: 30 / 21 }
  export const yawOf: (angle: Angle) => number; // −angle·π/4
  export function viewPoint(cam: PerspCamera, yaw: number, p: Vec3): Vec3; // [x px, y px vers le BAS, profondeur] relatifs à l'origine ; k = f/(f − z')
  export function centeredOf(model: { w: number; d: number }, p: readonly [number, number, number]): Vec3; // (x − w/2, y, d/2 − z)
  // light.ts
  export type LightSide = 'left' | 'right';
  export const lightVector: (side: LightSide) => Vec3;  // left: [-0.62, 0.72, -0.14], right: [0.62, 0.72, -0.14] (repère monde)
  export function roomLightSide(glasses: readonly { x: number; w: number }[], roomWidth: number): LightSide; // centre de la plus grande vitre < roomWidth/2 → 'left' ; aucune vitre → 'left'
  // raster.ts
  export type CelView = { cam: PerspCamera; yaw: number; side: LightSide; px: number; ss: number; thr?: number; thrD?: number;
    shadow?: { color: string; alpha: number } | null; pre?: (p: Vec3) => Vec3; preN?: (n: Vec3) => Vec3 };
  export type CelImage = { w: number; h: number; rgba: Uint8ClampedArray; ox: number; oy: number }; // (ox, oy) : pixel de l'origine (0,0,0)
  export function celJob(parts: readonly CelPart[], view: CelView): { step(budgetMs: number, now?: () => number): boolean; image(): CelImage };
  export function renderCel(parts: readonly CelPart[], view: CelView): CelImage; // celJob mené à terme
  ```
  Valeurs par défaut de `CelView` : `thr = −0,18`, `thrD = 2,2`, ombre `{ color: '#2A1A3C', alpha: 0.22 }` (translucide : elle se pose sur le tapis ou le parquet sans le masquer). La taille de l'image est le cadre englobant des sommets projetés et de l'ombre, + 3 px de marge, à `px` ; rendu interne à `px × ss` puis réduction par moyenne de blocs.

- [ ] **Step 1 : tests du rendu** (`furniture-cel-raster.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { place, part, superEll } from '../../../src/core/library/cel/mesh';
import { celJob, renderCel } from '../../../src/core/library/cel/raster';
import { ROOM_CAMERA } from '../../../src/core/library/cel/camera';
import { tone } from '../../../src/core/library/cel/tone';

const T = tone('#C9744F');
const ball = () => [part(place(superEll(20, 20, 20, 1, 1), { t: [0, 20, 0] }), T)];
const view = { cam: ROOM_CAMERA, yaw: 0, side: 'right' as const, px: 2, ss: 1 };
const hex = (img: { rgba: Uint8ClampedArray }, i: number) => '#' + [0, 1, 2].map((k) => img.rgba[i * 4 + k]!.toString(16).padStart(2, '0')).join('').toUpperCase();
const opaque = (img: { rgba: Uint8ClampedArray; w: number; h: number }) => Array.from({ length: img.w * img.h }, (_, i) => i).filter((i) => img.rgba[i * 4 + 3] === 255);

describe('moteur cellulo', () => {
  it('déterministe', () => expect(renderCel(ball(), view).rgba).toEqual(renderCel(ball(), view).rgba));
  it('à ss = 1, un corps n’a que base, ombre, rehaut et encre', () => {
    const img = renderCel(ball(), { ...view, shadow: null });
    expect(new Set(opaque(img).map((i) => hex(img, i)))).toEqual(new Set([T.base, T.shade, T.hi, '#2A1A18'].map((c) => c.toUpperCase())));
  });
  it('silhouette encrée : le premier pixel opaque de chaque ligne est de l’encre', () => {
    const img = renderCel(ball(), { ...view, shadow: null });
    for (let y = 0; y < img.h; y++) {
      const x = [...Array(img.w).keys()].find((x) => img.rgba[(y * img.w + x) * 4 + 3] === 255);
      if (x !== undefined) expect(hex(img, y * img.w + x)).toBe('#2A1A18');
    }
  });
  it('ombre portée à l’opposé de la lumière, translucide', () => {
    const img = renderCel(ball(), view);
    const shade = [...Array(img.w * img.h).keys()].filter((i) => img.rgba[i * 4 + 3]! > 0 && img.rgba[i * 4 + 3]! < 255);
    const cx = shade.reduce((s, i) => s + (i % img.w), 0) / shade.length;
    expect(cx).toBeLessThan(img.ox); // lumière à droite → ombre à gauche
  });
  it('z-buffer : la boule de devant cache celle de derrière', () => {
    const front = part(place(superEll(10, 10, 10, 1, 1), { t: [0, 20, 30] }), tone('#2F7D64'));
    const img = renderCel([...ball(), front], { ...view, shadow: null });
    const centre = Math.round(img.oy - 20 * view.px) * img.w + Math.round(img.ox);
    expect([tone('#2F7D64').base, tone('#2F7D64').shade, tone('#2F7D64').hi].map((c) => c.toUpperCase())).toContain(hex(img, centre));
  });
  it('jamais de miroir : yaw et −yaw ne donnent pas deux images symétriques', () => {
    const asym = () => [...ball(), part(place(superEll(6, 6, 6, 1, 1), { t: [18, 30, 10] }), tone('#2F7D64'))];
    const a = renderCel(asym(), { ...view, yaw: Math.PI / 4 });
    const b = renderCel(asym(), { ...view, yaw: -Math.PI / 4 });
    const mirrored = new Uint8ClampedArray(b.rgba.length);
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) mirrored.set(b.rgba.subarray((y * b.w + b.w - 1 - x) * 4, (y * b.w + b.w - x) * 4), (y * b.w + x) * 4);
    expect(a.w === b.w && a.rgba.every((v, i) => v === mirrored[i])).toBe(false);
  });
  it('par tranches = d’un coup', () => {
    const job = celJob(ball(), view);
    let clock = 0;
    while (!job.step(1, () => (clock += 0.4)));
    expect(job.image().rgba).toEqual(renderCel(ball(), view).rgba);
  });
});
```

- [ ] **Step 2 : tests de la caméra** (`furniture-cel-camera.test.ts`) : `yawOf(2)` = −π/2 ; un point avant (`centeredOf({w:80,d:40},[40,50,0])`) à l'angle 2 sort à gauche de l'origine (`viewPoint(...)[0] < 0`) ; à l'angle 0, un point plus haut est plus large (`|viewPoint(cam,0,[40,180,0])[0]| > |viewPoint(cam,0,[40,0,0])[0]|`) ; un point du fond est plus haut à l'écran qu'un point de devant (`y` plus petit) ; `roomLightSide([], 600)` = `'left'`, `roomLightSide([{ x: 400, w: 120 }, { x: 40, w: 60 }], 600)` = `'right'`.
- [ ] **Step 3 : lancer** `npx vitest run tests/core/library/furniture-cel-raster.test.ts tests/core/library/furniture-cel-camera.test.ts` → FAIL (modules absents).
- [ ] **Step 4 : porter** `mesh.ts` (maquette l. 51-118, maillages `finish` compris), `tone.ts` (l. 44-49 sur `mixRgb` de `paint/color`), `camera.ts`, `light.ts`, `raster.ts` (l. 120-172 sur tableaux typés, sans `ImageData` ni `document` ; `lightSpace = 'world'` toujours ; la tranche = un lot de triangles puis la passe d'encre et de couleurs ligne à ligne ; `glow: true` → couleur `base` sans ombrage ni ombre portée).
- [ ] **Step 5 : relancer** → PASS ; ajouter les motifs à `tests/familles.ts` puis `npm run test:famille -- scene-piece` → PASS (le contrôle des familles voit les nouveaux fichiers).
- [ ] **Step 6 : commit** `feat(bibliotheque): G6 — moteur cellulo et caméra en perspective (core pur)`.

---

### Task 2 : géométrie de la pièce en perspective (Opus)

**Files :**
- Modify : `src/core/library/furniture-render3d.ts:64-77` (type `Camera`, `FACE_CAMERA`, `PLUNGE_CAMERA`, `cameraKey`), `:174-190` (`layoutOf`), `:266` (`visible` avec la direction de vue inclinée), `:819-860` (`frontFaceOf`, `topCornersOf`, `faceCornersOf`, `openingOf`), `:907` (`projectOf`), `:957` (`perchOf`) ; `src/core/library/footprint.ts:77-125` (`topPoint`, `faceFrame`), `:137-147` (`applyFace`, `invertFace`) ; `src/core/library/room-grid.ts:96-118` (`overhangRow`, `hitRectOf`) et les appels `applyMatrix`/`invertMatrix` sur un `faceFrame` d'étagère ; `src/core/library/light/occluders.ts:37-39` (`wz` à `HEIGHT_PX_PER_CM`) ; `src/core/library/carried-items.ts:105-127`, `src/core/library/arrange.ts:13`, `src/core/library/hifi-zoom.ts:52`
- Create : `tests/core/library/fixtures/grille-main.json` (instantané pris sur `main`)
- Test : `tests/core/library/furniture-cel-geometry.test.ts` ; mises à jour de valeurs en pixels dans `footprint.test.ts`, `furniture-render3d.test.ts`, `room-grid*.test.ts`, `light-occluders.test.ts`, `light-perf-golden.test.ts`, `pets-walk-map.test.ts`, `carried-items.test.ts`, `arrange.test.ts`, `hifi.test.ts` et les tests de contenu de `scene-piece` qui lisent des coordonnées

**Interfaces :**
- Consumes : tâche 1 (`PerspCamera`, `ROOM_CAMERA`, `PLUNGE_PERSP`, `yawOf`, `viewPoint`, `centeredOf`).
- Produces :
  ```ts
  // furniture-render3d.ts
  export type Camera = PerspCamera;
  export const FACE_CAMERA: Camera;      // = ROOM_CAMERA
  export const PLUNGE_CAMERA: Camera;    // = PLUNGE_PERSP
  export const cameraKey: (cam: Camera) => string; // '' pour FACE_CAMERA, ':plunge' sinon
  export const HEIGHT_PX_PER_CM: number; // ROOM_CAMERA.scale × cos(pitch) : hauteur écran d'un cm au point d'ancrage
  export function faceQuadOf(model: Model, angle: Angle, cam?: Camera): [[number, number], [number, number], [number, number], [number, number]] | null; // tl, tr, br, bl
  // footprint.ts
  export type Homography = [number, number, number, number, number, number, number, number, number];
  export type FaceFrame = { w: number; h: number; m: Matrix; quad: [number, number][]; hom: Homography }; // m : meilleure affine (moindres carrés sur les 4 coins)
  export function applyFace(f: FaceFrame, u: number, v: number): [number, number];
  export function invertFace(f: FaceFrame, x: number, y: number): [number, number];
  ```
  Règle de `layoutOf` (seul endroit où la projection est définie) : `cols` inchangé ; pour `FACE_CAMERA`, `rows` garde la formule actuelle (`model.h × PX_PER_CM_Y + traceD × DEPTH_PX_PER_CM`) — contrat de la grille ; pour une autre caméra, `rows = ceil(hauteur projetée / CELL_H)`. `toPx(p) = [cols·CELL_W/2, rows·CELL_H] + viewPoint(cam, yawOf(angle), c(p)) − viewPoint(cam, yawOf(angle), c(A))` où `c = centeredOf(model, ·)` et `A` est le milieu avant de la trace tournée (`(0, 0, −traceD/2)` dans le repère tourné, ramené au repère du modèle). `faceFrame`, `topPoint`, `poiPoint`, `perchAt`, `groundTrace`, `openingOf`, `overhangRow`, `hostNativePx` passent tous par `toPx` ; `topPoint` projette le point exact `(u·w, h, v·d)` au lieu d'interpoler 3 coins ; `hitRectOf` = cadre englobant des sommets projetés du modèle (inchangé pour un meuble à socle).

- [ ] **Step 1 : instantané sur `main`** : script jetable (`npx tsx`) qui écrit `{ [kind]: { [angle]: { size: drawSize(k,a), floor: floorOffsets(k,a) } } }` pour les 36 meubles × 8 angles dans `tests/core/library/fixtures/grille-main.json`, lancé AVANT toute modification ; commit du JSON seul.
- [ ] **Step 2 : tests** (`furniture-cel-geometry.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import GRILLE from './fixtures/grille-main.json';
import { applyFace, drawSize, faceFrame, floorOffsets, invertFace, topPoint, type Angle } from '../../../src/core/library/footprint';
import { CELL_H, CELL_W, faceQuadOf, projectOf, PLUNGE_CAMERA } from '../../../src/core/library/furniture-render3d';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { STANDING_KINDS } from '../../../src/core/library/library-types';
import { hitRectOf, pxRect } from '../../../src/core/library/room-grid';

const ANGLES = [0, 1, 2, 3, 4, 5, 6, 7] as Angle[];
describe('pièce en perspective', () => {
  it('la grille ne bouge pas : cases et emprise identiques à main', () => {
    for (const k of STANDING_KINDS) for (const a of ANGLES) {
      expect(drawSize(k, a)).toEqual((GRILLE as any)[k][a].size);
      expect(floorOffsets(k, a)).toEqual((GRILLE as any)[k][a].floor);
    }
  });
  it('le haut de la face d’une étagère vue de face est plus large que le bas', () => {
    const [tl, tr, br, bl] = faceQuadOf(FURNITURE_MODELS.shelf, 0)!;
    expect(tr[0] - tl[0]).toBeGreaterThan(br[0] - bl[0] + 2);
  });
  it('faceFrame : les 4 coins exacts, aller-retour au centième de pixel', () => {
    const rect = { x: 30, y: 40, w: 4 * CELL_W, h: 10 * CELL_H };
    const f = faceFrame('shelf', 1, rect)!;
    expect(applyFace(f, f.w, f.h)[0]).toBeCloseTo(f.quad[2]![0], 2);
    const [u, v] = invertFace(f, ...applyFace(f, 12.5, 40));
    expect(u).toBeCloseTo(12.5, 2); expect(v).toBeCloseTo(40, 2);
  });
  it('topPoint = projection exacte du dessus du bureau', () => {
    const m = FURNITURE_MODELS.desk; const { w, h } = drawSize('desk', 1);
    const rect = { x: 0, y: 0, w: w * CELL_W, h: h * CELL_H };
    expect(topPoint('desk', 1, rect, 0.3, 0.6)).toEqual(projectOf(m, 1, [0.3 * m.w, m.h, 0.6 * m.d]).map((v) => expect.closeTo(v, 6)));
  });
  it('la zone de toucher contient tout le dessin', () => {
    const p = { id: 's', kind: 'shelf', col: 2, row: 1, angle: 0 } as const;
    const hit = hitRectOf(p as any); const r = pxRect({ col: 2, row: 1, ...drawSize('shelf', 0) });
    const top = projectOf(FURNITURE_MODELS.shelf, 0, [0, FURNITURE_MODELS.shelf.h, 0]);
    expect(hit.y).toBeLessThanOrEqual(r.y + top[1]);
  });
  it('vue plongeante : on voit bien plus le dessus du bureau', () => {
    const depth = (cam?: typeof PLUNGE_CAMERA) => projectOf(FURNITURE_MODELS.desk, 0, [0, FURNITURE_MODELS.desk.h, 0], cam)[1] - projectOf(FURNITURE_MODELS.desk, 0, [0, FURNITURE_MODELS.desk.h, FURNITURE_MODELS.desk.d], cam)[1];
    expect(depth(PLUNGE_CAMERA)).toBeGreaterThan(2 * depth());
  });
});
```

- [ ] **Step 3 : lancer** → FAIL ; **Step 4 : implémenter** selon la règle de `layoutOf` ci-dessus ; `faceFrame.hom` par la méthode des 4 points (DLT normalisée) ; remplacer dans `room-grid.ts` les `applyMatrix`/`invertMatrix` appliqués à un `faceFrame` par `applyFace`/`invertFace` ; `occluders.ts` : hauteur `y × HEIGHT_PX_PER_CM × sy` (la profondeur garde `DEPTH_PX_PER_CM` : la lumière vit dans le repère de la grille).
- [ ] **Step 5 : relancer** le fichier → PASS ; puis `npm run test:famille -- scene-piece scene-lumiere scene-animaux` : mettre à jour chaque valeur en pixels figée (commentaire `// perspective G6` à côté), sans désactiver aucun test ; l'empreinte de `light-perf-golden.test.ts` est régénérée et le diff noté dans le journal SDD → PASS.
- [ ] **Step 6 : commit** `feat(bibliotheque): G6 — la pièce passe à la perspective de la maquette (grille et données inchangées)`.

---

### Task 3 : hôte de sprites et branchement dans RoomView (Opus)

**Files :**
- Create : `src/core/library/cel/life-state.ts`, `cel/convert.ts`, `cel/looks.ts`, `cel/models/index.ts`, `cel/sprite-key.ts`, `src/content/furniture/sprite-paint.ts`, `src/content/furniture/sprite-host.tsx`
- Modify : `src/content/RoomView.tsx:361-432` (`artOf`), `:696-708` (`groundShadow`), `:796-806` (fournir `SpriteContext` à côté de `PropContext`), `carriedOf`/`carriedArtOf` (objets portés)
- Test : `tests/core/library/furniture-cel-convert.test.ts`, `tests/core/library/furniture-cel-checks.ts` (aide partagée, sans `.test`), `tests/content/furniture-sprite-host.test.tsx`, `tests/content/furniture-sprite-room.test.tsx`

**Interfaces :**
- Consumes : tâches 1 et 2.
- Produces :
  ```ts
  // cel/life-state.ts — état de vie d'un meuble (le dessin s'en sert, la tâche 15 le fait évoluer)
  export type LifeState = { tilt: number; dent: number; sway: number; sag: number; tassel: number; rustle: number; skirt: number; tremble: number }; // rad, 0..1, rad, cm, rad, 0..1, 0..1, cm
  export const REST_LIFE: LifeState; // tout à 0
  // cel/looks.ts
  export type CelLook = { style: StyleId; tones: Record<Fill, Tone>; floor: string; variant: CelVariant };
  export type CelVariant = { legs: 'taper' | 'straight' | 'turned' | 'hairpin' | 'block' | 'claw'; tufted: boolean; rivets: boolean; throw: 'none' | 'plain' | 'fringed'; pattern: 'none' | 'diamonds' | 'stripes' | 'neon-edge' };
  export function lookOf(style: StyleId): CelLook; // ici : tons depuis paletteOf(style), variante neutre ; la tâche 10 remplit les 8 styles
  // cel/models/index.ts
  export type CelBuilder = (look: CelLook, life: LifeState) => CelPart[];
  export const CEL_MODELS: Partial<Record<StandingKind, CelBuilder>>;     // rempli par les tâches 5 à 10
  export function celPartsOf(kind: StandingKind, look: CelLook, life: LifeState, opts?: { lit?: boolean; part?: 'base' | 'overhang' }): CelPart[]; // CEL_MODELS[kind] ?? celFromModel ; garniture steampunk ; abat-jour `glow` si allumé ; `part` : socle ou surplomb (règle d'overhangOf)
  export type CelItemBuilder = (look: CelLook, pl: ItemPlacement) => CelPart[];
  export const CEL_ITEMS: Partial<Record<ItemShape, CelItemBuilder>>;     // rempli par la tâche 11
  export function celItemPartsOf(pl: ItemPlacement, look: CelLook, steampunk: boolean): CelPart[];
  // cel/convert.ts
  export function celFromModel(model: Model, look: CelLook): CelPart[]; // box → superEll arrondi (e = 0,15), cyl/lathe → lathe, rod → tube, ball → superEll(1,1), foliage → leaf, prism → extrusion ; même encombrement
  // cel/sprite-key.ts
  export const CEL_VERSION = 1;
  export type FurnitureSpriteSpec = { kind: StandingKind; angle: Angle; style: StyleId; side: LightSide; cam: 'room' | 'plunge'; res: number; lit: boolean; life: string; part?: 'base' | 'overhang' };
  export type ItemSpriteSpec = { item: string /* itemsKey([pl]) */; host: 'desk' | 'shelf'; hostAngle: Angle; style: StyleId; side: LightSide; cam: 'room' | 'plunge'; res: number; lit: boolean };
  export function spriteKey(s: FurnitureSpriteSpec | ItemSpriteSpec): string; // `cel${CEL_VERSION}|…` ; `res` arrondi au 1/4
  // sprite-paint.ts
  export type PaintedSprite = { url: string; box: { x: number; y: number; w: number; h: number } }; // box en px de pièce, relatif au point d'ancrage (milieu avant de la trace)
  export function spriteJob(parts: CelPart[], view: CelView): { step(budgetMs: number): boolean; finish(): PaintedSprite };
  // sprite-host.tsx
  export const SPRITE_PX = 3; export const SPRITE_SS = 2;
  export class SpriteRegistry { constructor(label: string, opts?: { max?: number; maxBytes?: number; budgetMs?: number; schedule?: (cb: () => void) => void; now?: () => number });
    get(k: string): PaintedSprite | null; want(k: string, job: () => ReturnType<typeof spriteJob>, done: () => void): () => void; size(): number; bytes(): number }
  export const SpriteContext: React.Context<SpriteRegistry | null>;
  export function useSprite(key: string | null, job: () => ReturnType<typeof spriteJob>): PaintedSprite | null; // garde la dernière image du même meuble tant que la nouvelle n'est pas prête
  export function FurnitureSprite(props: Model3DArtProps /* type `Props` de model3d-art.tsx:292, exporté sous ce nom */ & { style: StyleId; side: LightSide; life?: LifeState; lifeKey?: string; res?: number }): ReactElement; // <g data-furniture-sprite> <image> + <DecalLayer> ; repli <g data-sprite-fallback><Model3DArt/></g>
  export function CarriedSprite(props: CarriedItem3DProps /* type `CarriedProps` de model3d-art.tsx:352, exporté sous ce nom */ & { style: StyleId; side: LightSide; res?: number }): ReactElement;   // repli CarriedItem3D
  export function DecalLayer(props: { kind: StandingKind; angle: Angle; rect: PxRect; content?: Record<string, ItemContent>; items?: ItemPlacement[]; camera?: Camera }): ReactElement; // décalques seuls, mêmes cadres que Model3DArt, découpés à l'ouverture
  ```
  `SpriteRegistry` reprend la file de `PaintRegistry` (`src/content/paint-registry.ts:7`) mais mène des tâches par tranches : à chaque `schedule`, avance la plus ancienne tâche demandée jusqu'à `budgetMs` (6 ms), la termine sur plusieurs images au besoin ; LRU sur `max` (220) et `maxBytes` (48e6, somme des longueurs de data URL). Surface : canvas partagé `getContext('2d', { willReadFrequently: true })` (comme `figure-host.tsx:54`), `putImageData` puis `toDataURL('image/png')`.

- [ ] **Step 1 : aide de contrôle** `tests/core/library/furniture-cel-checks.ts` : `checkCelModel(kind, look = lookOf('scandinave'), life = REST_LIFE)` vérifie (a) cadre englobant des maillages ⊂ boîte `w × h × d` du modèle à 2 cm près, et chaque dimension ≥ 85 % de celle du modèle ; (b) dessus du `perch` à ±1,5 cm du maillage le plus haut sous son centre ; (c) déterminisme de `renderCel` aux 8 angles ; (d) à chaque angle, ombre (`shade`) entre 8 % et 65 % des pixels opaques et encre > 0,5 % ; (e) pour un modèle à `face`, aucun sommet d'une pièce non `interior` dans la boîte d'ouverture (face rétrécie de 2 cm, de `z = 0` au fond moins 2 cm).
- [ ] **Step 2 : tests de conversion** (`furniture-cel-convert.test.ts`) : `for (const k of STANDING_KINDS) checkCelModel(k)` avec `CEL_MODELS` vide (tout passe par `celFromModel`) ; `celPartsOf('lamp', look, REST_LIFE, { lit: true })` contient une pièce `glow` ; `celPartsOf('arc-lamp', …, { part: 'overhang' })` ne contient que l'arc et le dôme.
- [ ] **Step 3 : tests de l'hôte** (`furniture-sprite-host.test.tsx`, `schedule` manuel, `spriteJob` remplacé par un double qui compte les tranches)

```tsx
describe('hôte des sprites de meubles', () => {
  it('repli Model3DArt à la même place, puis l’image ; l’ancienne reste au changement de clé', async () => { /* rend <FurnitureSprite kind="sofa" …/> : [data-sprite-fallback] puis, après les tranches, <image> dont x/y/width/height = box mise à l'échelle du rect ; changer `lit` : l'<image> reste, pas de [data-sprite-fallback] */ });
  it('une tâche longue est menée sur plusieurs images sans dépasser le budget', () => { /* double à 3 tranches de 4 ms, budgetMs 6 : 3 appels de schedule avant `done` */ });
  it('LRU : au-delà de max ou de maxBytes, la moins récemment lue part', () => { /* max 2 / maxBytes 100 */ });
  it('aucune URL de carte dans une clé ni dans un peintre', () => { /* spriteKey de toutes les specs d'une étagère garnie (content.url = 'https://x/y.jpg') : aucune ne contient 'http' ; le peintre reçoit des CelPart sans chaîne 'http' */ });
  it('jamais de blob:', () => { /* toutes les href posées commencent par 'data:image/png' */ });
});
```
- [ ] **Step 4 : tests dans la pièce** (`furniture-sprite-room.test.tsx`, `writeArt('ghibli')`, `SpriteContext` à `schedule` manuel) : en Ghibli, chaque meuble debout rend un `[data-furniture-sprite]` (repli avant cuisson, `<image>` après) ; le `polygon[data-ground-shadow]` disparaît dès que le sprite est là (l'ombre est dans l'image) ; une étagère garnie garde ses décalques (`[data-item3d]` pour les objets, `<image href=…couverture>` à la même matrice qu'en classique) ; en classique (défaut vitest) le rendu ne change pas (aucun `[data-furniture-sprite]`) ; `data-furniture`, `data-id`, `data-angle`, `data-hifi`, la zone de toucher et le contour de sélection sont toujours là.
- [ ] **Step 5 : lancer** → FAIL ; **Step 6 : implémenter** `life-state.ts`, `looks.ts`, `convert.ts`, `models/index.ts`, `sprite-key.ts`, `sprite-paint.ts`, `sprite-host.tsx` ; dans `RoomView.tsx`, en Ghibli, `artOf` rend `FurnitureSprite` (repli = le `Model3DArt` actuel), `side = roomLightSide(glasses, width)` calculé une fois par rendu, objets portés par `CarriedSprite` ; le `SpriteRegistry` vit au niveau de `RoomView` (comme `ShopRegistry`).
- [ ] **Step 7 : relancer** les quatre fichiers puis `npm run test:famille -- scene-piece` → PASS.
- [ ] **Step 8 : commit** `feat(bibliotheque): G6 — sprites cellulo des meubles posés dans la pièce (repli classique)`.

---

### Task 4 : banc d'essai de la pièce, captures et publication (Sonnet)

**Files :**
- Create : `.superpowers/harness-piece/vite.config.ts` (racine = dépôt, port 5183, `strictPort`), `index.html` + `piece.tsx` (pièce meublée), `planche.html` + `planche.ts` (catalogue sous 8 angles), `fixtures.ts`, `shot.mjs`, `perf.mjs`, `publish.mjs`, `README.md` (mode d'emploi en 10 lignes)

**Interfaces :**
- Consumes : `RoomView` (tâche 3), `celPartsOf`, `celItemPartsOf`, `renderCel`, `lookOf`.
- Produces :
  - `piece.html?style=<StyleId>&h=<heure décimale>&meteo=soleil|nuages|pluie|neige&pet=chat|chien|robot&scene=<nom>&w=1440` : une pièce meublée par style (`fixtures.ts : benchRoom(style)` — canapé, rocking-chair, étagère garnie, bureau + écran, lampadaire arc, lanterne, plantes, arbre à chat, fenêtre, décors muraux, tapis) ; `scene` rejoue une chronologie d'animal scriptée (`rock` : le chat saute sur le rocking-chair puis repart, reprise de `timeline` l. 466-480 ; `nap` : sieste sur le canapé ; `hide` ; `scratch` ; `brush` : passage contre les plantes ; `tree` : saut sur l'arbre à chat ; `egg`) ; `t=<s>` fige l'instant ; `window.done = true` quand `document.querySelectorAll('[data-sprite-fallback]').length === 0`.
  - `planche.html?kind=<kind|all>&style=<StyleId>&res=1` : grille kinds × 8 angles rendue par le moteur seul (canvas), étiquettes « 0 face … 7 ¾ avant droit ».
  - `node .superpowers/harness-piece/shot.mjs <url-de-base> <sortie> <requête>...` : un PNG par requête (attend `window.done`, 30 s).
  - `node .superpowers/harness-piece/perf.mjs <url> [secondes]` : CPU ×4 (`Emulation.setCPUThrottlingRate`), images par seconde, temps de peinture moyen/max par sprite (lus sur `window.__spriteStats`, exposé par le banc), taille du cache.
  - `node .superpowers/harness-piece/publish.mjs <dossier-de-png> <sous-dossier>` : copie dans `C:\Users\maxim\Downloads\Wikimasters-g6-captures\g6\<sous-dossier>\`, met à jour `g6/README.md` (titre + images en `![]()`), commit, `git push`, affiche le lien `https://github.com/maximus49000/wikimasters-tools/tree/captures/g6-piece/g6/<sous-dossier>`.

- [ ] **Step 1 : écrire le banc** (modèle : `.superpowers/harness-fond/` ; navigateur et playwright-core de la mise en place) ; lancer `npx vite --config .superpowers/harness-piece/vite.config.ts`.
- [ ] **Step 2 : vérifier** : `node shot.mjs http://127.0.0.1:5183/.superpowers/harness-piece/piece.html out/ "style=scandinave&h=10"` produit un PNG non vide en moins de 30 s ; la planche `kind=all&style=scandinave` aussi ; `perf.mjs` affiche des nombres.
- [ ] **Step 3 : première publication** : pièce scandinave à 10 h et 21 h, planche du catalogue (rendu `celFromModel`) → `publish.mjs … 04-banc` ; poster les PNG dans la conversation ; ligne dans le journal SDD.
- [ ] **Step 4 : commit** `chore(bibliotheque): G6 — banc d'essai de la pièce (pièce par style, planche 8 angles, captures, mesure)`.

---

### Tâches 5 à 9 : le catalogue en volumes arrondis (Fable)

Règles communes (spec §3-§5) : un fichier par famille dans `src/core/library/cel/models/`, une fonction par meuble enregistrée dans `CEL_MODELS` (`CelBuilder`), écrite dans le repère centré de la maquette et dans son idiome (`superEll` à creux pour les coussins, `tube` pour les patins et arcs, `lathe` pour pieds et pots, `leaf` pour le feuillage). Encombrement, `perch`, `face`, `pois`, `glow`, `base` du modèle en cm conservés (contrôlés par `checkCelModel`). Couleurs prises dans `look.tones` (clés `Fill` de la palette) ; variantes de style lues dans `look.variant` sans changer le volume. Toutes les assises de la spec §6 lisent `dent` (sofa, loveseat, armchair, club-chair, chair, daybed, bench, pouf, square-pouf, beanbag, coussin du panier, galette du rocking-chair, egg-chair, peacock-chair). Chaque meuble lit `life` pour ses déformations prévues par la spec §6 (déclarées ici, animées à la tâche 15) : `dent` creuse le coussin (forme `dent` de `sofa`, l. 250), `tilt` est appliqué par l'appelant (pas par le peintre). Logique de chaque angle pensée avant le dessin (dos et profils soignés : dos de canapé capitonné ou tendu, arrière d'étagère en panneau, revers des feuilles). Chaque tâche se termine par : planche 8 angles de chaque meuble en scandinave + pièce du banc, publiées (`publish.mjs … NN-<famille>`) et postées.

Test de chaque tâche (`tests/core/library/furniture-cel-models-<famille>.test.ts`) :

```ts
import { describe, it } from 'vitest';
import '../../../src/core/library/cel/models/<famille>';
import { checkCelModel } from './furniture-cel-checks';
const KINDS = [/* les meubles de la tâche */] as const;
describe('<famille> en cellulo', () => {
  for (const k of KINDS) it(`${k} : encombrement, dessus, tons, encre, 8 angles`, () => checkCelModel(k));
  it('chaque meuble a son dessin propre (pas de repli celFromModel)', () => { for (const k of KINDS) expect(CEL_MODELS[k]).toBeDefined(); });
});
```
Étapes de chaque tâche : **1** test → **2** FAIL → **3** dessiner (porter d'abord ce qui existe dans la maquette) → **4** PASS + `npm run test:famille -- scene-piece` → **5** captures publiées → **6** commit `feat(bibliotheque): G6 — <famille> en volumes arrondis`.

### Task 5 : assises en tissu (Fable)
**Files :** Create `src/core/library/cel/models/seating.ts` ; Test `tests/core/library/furniture-cel-models-seating.test.ts`.
**Meubles :** `sofa` (porter `sofa` l. 248-283 : pieds, assise, dossier, accoudoirs, coussins à creux, plaid), `loveseat`, `armchair`, `club-chair`, `daybed`, `bench`, `pouf`, `square-pouf`, `beanbag` (porter `beanbag` l. 321 : affaissé, plis, creux au sommet).
**Interfaces :** Produces `CEL_MODELS.{sofa, loveseat, armchair, club-chair, daybed, bench, pouf, square-pouf, beanbag}` ; chacun creuse `dent ∈ [0, 1]` à sa zone d'assise (profondeur max 3,2 cm au centre, gaussienne σ 15 cm) et `skirt` (canapé : jupe/tissu bas qui ondule de ±1 cm) ; le pouf poire s'affaisse de 4 cm à `dent = 1`.
- [ ] Étapes 1-6 ci-dessus ; test en plus : `dent = 1` abaisse le dessus de l'assise de 2,5 à 4 cm sans changer l'encombrement au sol.

### Task 6 : bois, bascule, suspension et arbre à chat (Fable)
**Files :** Create `src/core/library/cel/models/wood.ts` ; Test `furniture-cel-models-wood.test.ts`.
**Meubles :** `rocking-chair` (porter `chair` l. 231-247 : patins en arc de rayon `RUN_R = 95` cm, barreaux, galette à creux), `chair`, `egg-chair` (coque suspendue à son pied, coussin), `peacock-chair` (rotin en éventail), `cat-tree` (porter `catTree` l. 351 : sisal, plateaux en feutre, pompon suspendu).
**Interfaces :** Produces `CEL_MODELS.{rocking-chair, chair, egg-chair, peacock-chair, cat-tree}` et, dans `src/core/library/furniture-life-specs.ts` (créé ici, complété à la tâche 15), les données générales de mouvement : `rocking-chair: { rock: { pivot: [0, RUN_R, 0], radius: RUN_R } }`, `egg-chair: { swing: { pivot: <point d'accroche en cm centré> } }`, `cat-tree: { sag: { board: <index du plateau>, max: 1.2 }, tassel: { pivot: <accroche du pompon> } }` (type `LifeSpec`, voir tâche 15).
- [ ] Étapes 1-6 ; test en plus : à l'angle 2, les patins du rocking-chair dessinent un arc (au moins 5 pixels d'encre de patin sur 3 lignes successives décalées).

### Task 7 : rangements, tables et tapis (Fable)
**Files :** Create `src/core/library/cel/models/storage.ts` ; Test `furniture-cel-models-storage.test.ts`.
**Meubles :** `shelf` (montants et tablettes aux arêtes adoucies, ouverture libre pour les objets rangés, fond en panneau vu de dos), `desk`, `dresser` (tiroirs, poignées), `side-table` (porter `gueridon` l. 297), `coffee-table`, `rug` (tapis plat à bords roulottés ou franges selon `look.variant.throw`, pas d'ombre portée : `noshadow`).
**Interfaces :** Produces `CEL_MODELS.{shelf, desk, dresser, side-table, coffee-table, rug}` ; les pièces visibles à travers l'ouverture de l'étagère (fond, dessus des tablettes) portent `interior: true` (champ de `CelPart`, tâche 1).
- [ ] Étapes 1-6 ; test en plus : `levelsOf(FURNITURE_MODELS.shelf)` inchangé et chaque tablette dessinée à ±1 cm de sa hauteur du modèle.

### Task 8 : plantes (Fable)
**Files :** Create `src/core/library/cel/models/plants.ts` ; Test `furniture-cel-models-plants.test.ts`.
**Meubles :** `plant`, `monstera` (porter `monstera` l. 326 : feuilles en cœur fendues, place validée v3), `strelitzia` (palettes), `palm` (porter `palm` l. 304 : kentia, rachis en `tube`, folioles), `cactus`, `pampas` (plumeaux).
**Interfaces :** Produces `CEL_MODELS.{plant, monstera, strelitzia, palm, cactus, pampas}` ; `rustle ∈ [0, 1]` fait fléchir chaque feuille d'au plus 6° autour de sa base, avec une phase propre par feuille (indice de la feuille), pour 4 poses.
- [ ] Étapes 1-6 ; test en plus : deux valeurs de `rustle` donnent deux images différentes et le même pot.

### Task 9 : lampes et coin des animaux (Fable)
**Files :** Create `src/core/library/cel/models/lights-pets.ts` ; Test `furniture-cel-models-lights-pets.test.ts`.
**Meubles :** `lamp`, `arc-lamp` (porter `arcLamp` l. 284 ; arc et dôme = surplomb, socle seul au sol), `paper-lantern` (porter `lantern` l. 342), `basket` (coussin à creux), `bowl`, `kennel` (toit, ouverture), `charger`.
**Interfaces :** Produces `CEL_MODELS.{lamp, arc-lamp, paper-lantern, basket, bowl, kennel, charger}` ; l'abat-jour est une pièce `glow` en `WARM_LIT` (lanterne : ton papier `{ base: '#FBE4A6', shade: '#EACB8A', hi: '#FFF2C8' }`, l. 180) quand `opts.lit`, sinon ombré normalement.
- [ ] Étapes 1-6 ; test en plus : `celPartsOf('arc-lamp', …, { part: 'base' })` et `{ part: 'overhang' }` se partagent toutes les pièces sans doublon.

---

### Task 10 : les 8 styles et le steampunk (Fable)

**Files :**
- Modify : `src/core/library/cel/looks.ts` ; les fichiers de modèles des tâches 5 à 9 (lecture des variantes)
- Create : `src/core/library/cel/models/steampunk.ts` (`globe`, `telescope`, `automaton` + garnitures cellulo équivalentes à `STEAMPUNK_TRIM`, `furniture-models.ts:592`)
- Test : `tests/core/library/furniture-cel-looks.test.ts`

**Interfaces :**
- Consumes : `CelLook`, `CelVariant` (tâche 3), `paletteOf`, `decorOf`.
- Produces : `lookOf(style)` complet pour `scandinave, moderne, industriel, boheme, retro70, japandi, neon, steampunk` (tons tirés de la palette du style, sol = `palette.floor`, variantes : scandinave pieds fuselés + plaid uni ; moderne pieds droits fins ; industriel pieds épingle + métal ; bohème plaid à franges + losanges ; rétro 70 pieds compas + rayures ; japandi pieds blocs bas ; néon liseré `neon-edge` ; steampunk capitons, rivets laiton, pieds griffes — reprise des styles l. 174-178) ; `CEL_MODELS.{globe, telescope, automaton}` ; `celPartsOf(…, look steampunk)` ajoute les garnitures cellulo.

- [ ] **Step 1 : test**

```ts
describe('styles cellulo', () => {
  it('8 styles × 36 meubles : construits sans erreur, même volume à 1 cm près', () => {
    for (const k of STANDING_KINDS) {
      const ref = boundsOf(celPartsOf(k, lookOf('scandinave'), REST_LIFE));
      for (const s of STYLE_IDS) if (s === 'steampunk' || !STEAMPUNK_ONLY.includes(k)) expect(boundsOf(celPartsOf(k, lookOf(s), REST_LIFE))).toEqual(ref.map((v) => expect.closeTo(v, 0)));
    }
  });
  it('les couleurs viennent de la palette du style', () => { expect(lookOf('boheme').tones.fabric.base).toBe(paletteOf('boheme').fabric); });
  it('globe, télescope, automate : dessin propre, contrôles du modèle', () => { for (const k of ['globe', 'telescope', 'automaton'] as const) checkCelModel(k, lookOf('steampunk')); });
});
```
(`boundsOf` : aide ajoutée à `furniture-cel-checks.ts`, cadre `[x0, x1, y0, y1, z0, z1]` des maillages ; tolérance de 1 cm sauf rivets/franges/garnitures, comptés à part.)
- [ ] **Step 2 : FAIL** ; **Step 3 : dessiner** ; **Step 4 : PASS** + `npm run test:famille -- scene-piece`.
- [ ] **Step 5 : captures** : planche `kind=sofa|rocking-chair|shelf|lamp` dans les 8 styles + pièce du banc par style à 10 h → `publish.mjs … 10-styles`, postées.
- [ ] **Step 6 : commit** `feat(bibliotheque): G6 — les 8 styles en cellulo, globe, télescope et automate`.

---

### Task 11 : objets portés, présentoir, décalques et faces dessinées (Fable ; cadres de décalques : Opus)

**Files :**
- Create : `src/core/library/cel/models/items.ts`
- Modify : `src/content/game-spine.tsx` (`GameSpine` :98), `src/content/hifi/hifi-art.tsx` (`HifiFace` :122, `HifiTop` :213, `HifiGrille` :310, `HifiDisc` :68, `SleeveArt` :362), `src/content/deco-art.tsx` (`TableFace` :551), `src/content/model3d-art.tsx` (`DecalArt` : bords et charnières en encre `#2A1A18`) — variantes Ghibli, classique inchangé
- Test : `tests/core/library/furniture-cel-models-items.test.ts`, `tests/content/furniture-sprite-decals.test.tsx`

**Interfaces :**
- Consumes : `CEL_ITEMS`, `celItemPartsOf`, `CarriedSprite`, `DecalLayer` (tâche 3) ; `ITEM_MODELS` (`item-models.ts:28`), `standPieces` (`item-models.ts:166`, penché `STAND_LEAN_DEG = 14`).
- Produces : `CEL_ITEMS.{monitor, small-plant, small-lamp, small-alarm, small-clock, small-station, small-hifi, cd, dvd, game, book}` (boîtiers aux coins adoucis, livre au dos arrondi, écran à cadre, hi-fi à façade) ; présentoir incliné en cellulo (socle, rebord, béquille) ; les faces dessinées gardent leurs signatures et reçoivent la prop `ghibli?: boolean` (aplats + encre, pas de dégradé).

- [ ] **Step 1 : tests** — items : `checkCelModel` adapté aux objets (`checkCelItem(shape)` dans l'aide : encombrement de `itemModel(shape)` à 1 cm, tons, encre) pour chaque forme ; présentoir : boîtier penché de 14° ± 0,5°. Décalques (`furniture-sprite-decals.test.tsx`, Ghibli) : pour une étagère garnie à l'angle 1, la couverture d'un CD (`<image href="https://…">`) est posée à la matrice de son décalque (coins à 1 px près des coins projetés par `projectOf` du boîtier), dans le groupe découpé par l'ouverture ; aucune `href` de carte dans les data URL des sprites.
- [ ] **Step 2 : FAIL** ; **Step 3 : dessiner** les objets et redessiner les faces (Fable) ; vérifier les cadres par décalque sous perspective (Opus : la matrice de chaque décalque vient des 3 coins projetés de SA face, écart du 4ᵉ coin ≤ 1 px testé) ; **Step 4 : PASS** + `npm run test:famille -- scene-piece`.
- [ ] **Step 5 : captures** : étagère garnie (CD, DVD, jeux, livres, présentoir) de face et de ¾, bureau + écran allumé, hi-fi (lecture en cours), réveil/pendulette/station → `publish.mjs … 11-objets`, postées.
- [ ] **Step 6 : commit** `feat(bibliotheque): G6 — objets portés, présentoir, hi-fi, tranches et cadrans en cellulo`.

---

### Task 12 : fond de pièce — mur, sol, plinthe, fenêtres, rideaux, steampunk, néon (Fable)

**Files :**
- Modify : `src/content/room-backdrop.tsx` (`RoomBackdrop` :85, `NeonDefs` :103, `neonOutline` :115), `src/content/window-art.tsx` (`WindowArt` :25), `src/content/room-steampunk-decor.tsx` (`SteampunkDecor` :96) — branche Ghibli, classique inchangé
- Test : `tests/content/room-backdrop.test.tsx`, `tests/content/window-art.test.tsx` (ajouts, famille `scene-ville`/`scene-piece` existantes), `tests/content/room-steampunk-decor.test.tsx` (ajouts)

**Interfaces :**
- Consumes : `decorOf(style)` (`styles.ts:93` : motifs de mur et de sol), `paletteOf`, `LightSide` (tâche 1).
- Produces : `RoomBackdrop` reçoit `ghibli?: boolean` et `side?: LightSide` ; en Ghibli : mur à cimaise (porter `drawBackground` l. 365-421 SANS le pan de mur gauche ni les traits d'enduit épars), enduit en larges aplats, léger dégradé vers le côté `side`, plinthe, sol du style (parquet à lames l. 384-391, béton, damier, tatami, carreaux, plaques), motif de mur du style ; `WindowArt` en Ghibli : embrasure, cadre, croisillons, appui, tringle et rideaux (porter `curtain` l. 422-433) ; les rideaux reçoivent `breath: number` (−1..1) posé par la boucle existante de la pièce (`data-curtain` + `transform`, pas de rendu React par image) : amplitude 1,5 px, période 7 s, ×2 si le vent dehors dépasse 20 km/h ; `SteampunkDecor` et `neonOutline` en cellulo (tuyaux et engrenages modelés, néon en double trait net).

- [ ] **Step 1 : tests** : en Ghibli, `[data-backdrop-cimaise]`, `[data-backdrop-plinthe]`, `[data-floor-pattern=<motif du style>]` présents pour les 8 styles ; **aucune tache** : aucun élément du fond plus petit que 4 × 4 px ni d'opacité < 0,1 ; aucun pan de mur en fuite (aucun `polygon` du mur non rectangulaire) ; rideaux : `[data-curtain]` ×2 par fenêtre, `breath` 0 et 1 donnent deux ourlets différents ; classique : sorties identiques aux tests existants.
- [ ] **Step 2 : FAIL** ; **Step 3 : dessiner** ; **Step 4 : PASS** + `npm run test:famille -- scene-piece scene-ville`.
- [ ] **Step 5 : captures** : pièce vide puis meublée par style à 10 h, fenêtre avec rideaux (2 instants), steampunk animé, néon → `publish.mjs … 12-fond`, postées.
- [ ] **Step 6 : commit** `feat(bibliotheque): G6 — mur, sol, fenêtres et rideaux façon Ghibli`.

---

### Task 13 : décors muraux et objets muraux (Fable)

**Files :**
- Modify : `src/content/deco-art.tsx` (`WallClock` :106, `DigitalClock` :209, `WeatherStation` :349, `Barometer` :364, `Panel` :466, `DecoArt` :539), `src/content/deco-live.tsx` (animations conservées), `src/content/library-card-art.tsx` (`WallArt` :21 : poster, vinyl, sleeve-square, sleeve-round, sleeve-frame)
- Test : `tests/content/deco-art.test.tsx`, `tests/content/library-deco-*.test.tsx` (ajouts Ghibli)

**Interfaces :**
- Produces : prop `ghibli?: boolean` sur `DecoArt` et `WallArt` (passée par `RoomView` en Ghibli) ; cellulo : cadre modelé (aplat + ombre nette + rehaut), encre `#2A1A18`, vitre en aplat clair à reflet net ; aiguilles, chiffres, panneaux craie/lettres/néon/liège et leurs animations (`deco-live.tsx`) inchangés en logique.

- [ ] **Step 1 : tests** : en Ghibli, chaque décor (`wall-clock, digital-clock, weather-station, barometer, panel-chalk, panel-letter, panel-neon, panel-cork`) et chaque objet mural (`poster, vinyl, sleeve-square, sleeve-round, sleeve-frame`) a un contour `stroke="#2A1A18"` et aucun `filter`/dégradé radial ; l'horloge murale tourne toujours (tests `library-deco-tick` verts) ; l'image de la carte reste un `<image>` SVG (pas de canvas).
- [ ] **Step 2 : FAIL** ; **Step 3 : dessiner** ; **Step 4 : PASS** + `npm run test:famille -- scene-piece`.
- [ ] **Step 5 : captures** : mur avec tous les décors et objets muraux, de jour et de nuit, par 3 styles → `publish.mjs … 13-murs`, postées.
- [ ] **Step 6 : commit** `feat(bibliotheque): G6 — décors et objets muraux en cellulo`.

---

### Task 14 : lumière en cellulo (Opus)

**Files :**
- Create : `src/core/library/light/cel-light.ts`
- Modify : `src/core/library/light/light-map.ts:138` (option `split`), `src/core/library/light/occluders.ts:15` (`LampSource.level`), `src/content/light-layer.tsx` (prop `cel`, fondu des lampes), `src/content/RoomView.tsx:894` (passer `cel` en Ghibli ; sprites allumé/éteint en fondu)
- Test : `tests/core/library/light-cel.test.ts`, `tests/content/library-light*.test.tsx` (ajouts)

**Interfaces :**
- Consumes : `buildLightMap`, `LightInput`, `LightMap`, `LIGHT_SCALE` ; `FurnitureSprite` (tâche 3).
- Produces :
  ```ts
  // light-map.ts : sortie par défaut inchangée ; avec { split: true }, la carte porte aussi les deux composantes
  export function buildLightMap(input: LightInput, opts?: { split?: boolean }): LightMap & { warm?: Float32Array; shade?: Float32Array };
  // cel-light.ts
  export const CEL_UP = 3;              // la carte est suréchantillonnée ×3 (bilinéaire) AVANT le seuillage : bords nets, pas en escalier
  export const CEL_WARM = [0.25, 0.6] as const; // seuils (fraction du pic local) : rien / ton 1 / ton 2
  export const CEL_SHADE_STEP = 0.06;   // l'ombre ambiante est posée en aplats de 0,06 d'alpha
  export function celLightMap(map: LightMap & { warm: Float32Array; shade: Float32Array }, up?: number): LightMap;
  // occluders.ts
  export type LampSource = { id: string; x: number; d: number; z: number; box: string; level?: number }; // 0..1, défaut 1
  ```
  `LightLayer` avec `cel` : construit la carte en `split`, la passe par `celLightMap`, l'image est posée à la taille de la pièce (`image-rendering` normal). Fondu des lampes : `level` passe de 0 à 1 (ou l'inverse) en 350 ms, repeint au pas `FAST_MS` ; le sprite allumé et l'éteint se superposent avec une opacité complémentaire pendant le fondu.

- [ ] **Step 1 : tests** (`light-cel.test.ts`)

```ts
describe('lumière en cellulo', () => {
  it('flaque de lampe : au plus 3 alphas chauds distincts (rien, ton 1, ton 2)', () => { /* buildLightMap(nuit + 1 lampe, { split: true }) → celLightMap → Set des alphas des pixels chauds ≤ 3 */ });
  it('bords nets : entre deux tons, aucune rampe de plus d’un pixel', () => { /* coupe horizontale au centre de la flaque */ });
  it('sortie par défaut identique (empreinte de référence inchangée)', () => { /* buildLightMap(input) === buildLightMap(input, {}) */ });
  it('la nuit, une lampe éclaire plus qu’en plein jour', () => { /* pic chaud nuit > pic chaud midi */ });
  it('level 0,5 : flaque à moitié de l’allumée', () => { /* pic(level .5) ≈ 0,5 × pic(level 1) ± 0,05 */ });
});
```
- [ ] **Step 2 : tests de la pièce** (Ghibli) : aucun `filter`, `opacity` < 1 ni `mix-blend-mode` posé selon l'heure sur `[data-furniture-sprite]` (un seul assombrissement : le calque) ; un clic sur la lampe ne bascule pas l'image d'un coup : pendant 350 ms, deux `<image>` (allumée, éteinte) à opacités complémentaires ; pièce sans fenêtre : `side = 'left'` dans la clé des sprites.
- [ ] **Step 3 : FAIL** ; **Step 4 : implémenter** ; **Step 5 : PASS** + `npm run test:famille -- scene-lumiere scene-piece`.
- [ ] **Step 6 : captures** : même pièce à 8 h, 13 h, 19 h, 23 h (lampes allumées), 23 h sans lampe, 14 h sous la pluie → `publish.mjs … 14-lumiere`, postées.
- [ ] **Step 7 : commit** `feat(bibliotheque): G6 — lumière en deux tons nets, fondu des lampes`.

---

### Task 15 : mobilier vivant — moteur des réactions et l'animal suit le meuble (Opus)

**Files :**
- Create : `src/core/library/furniture-life.ts`, `src/content/furniture/life-host.ts`
- Modify : `src/core/library/furniture-life-specs.ts` (tâche 6), `src/content/pet-sim.ts:19` (`place` compose le décalage), `src/content/RoomView.tsx` (`LifeContext`, paliers des sprites), `src/content/furniture/sprite-host.tsx` (`FurnitureSprite` lit le palier courant hors React)
- Test : `tests/core/library/furniture-life.test.ts`, `tests/core/library/pets-follow.test.ts`, `tests/content/furniture-sprite-life.test.tsx`

**Interfaces :**
- Consumes : `LifeState`, `REST_LIFE` (tâche 3), `PetFrame` (`pets/runner.ts:16`), `perchAt`, `projectOf`, `celPartsOf`.
- Produces :
  ```ts
  // furniture-life-specs.ts — « le meuble bouge ainsi quand on s'y pose » (réutilisable par un humain plus tard)
  export type LifeSpec = { rock?: { pivot: Vec3; radius: number }; dent?: { at: Vec3; r: number; depth: number }[]; swing?: { pivot: Vec3 }; sag?: { board: number; max: number }; tassel?: { pivot: Vec3 }; rustle?: true; skirt?: true; tremble?: true };
  export const LIFE_SPECS: Partial<Record<StandingKind, LifeSpec>>;
  // furniture-life.ts
  export type LifeEvent = { id: string; kind: StandingKind; type: 'arrive' | 'leave' | 'brush' | 'hide-in' | 'hide-out' | 'scratch-start' | 'scratch-end'; at: number };
  export function lifeEvents(prev: readonly PetFrame[], next: readonly PetFrame[], layout: Layout, t: number): LifeEvent[]; // arrive/leave : `on` change ; hide : pose 'hide' ; scratch : pose 'scratch' ; brush : animal en marche dont les pieds entrent dans l'emprise d'une plante ou frôlent le pompon de l'arbre à chat
  export class LifeBook { push(e: LifeEvent): void; stateOf(id: string, kind: StandingKind, t: number): LifeState; clear(): void; forget(id: string): void; settled(id: string, t: number): boolean }
  export function lifeKey(kind: StandingKind, s: LifeState): string; // paliers : tilt 0,5°, dent 1/4, sway 0,5°, sag 0,3 cm, tassel 2°, rustle 1/4 (4 poses), skirt 1/3, tremble 2 poses ; '' au repos
  export type Follow = { dx: number; dy: number; rot: number; cx: number; cy: number }; // px de pièce ; rotation en degrés autour de (cx, cy)
  export function followOf(kind: StandingKind, angle: Angle, rect: PxRect, s: LifeState): Follow | null; // point du perch transformé comme le meuble (bascule autour du pivot, creux, plateau, oscillation), projeté ; null au repos
  // life-host.ts
  export const LifeContext: React.Context<{ book: LifeBook; editing: boolean } | null>;
  ```
  Lois (valeurs de départ, réglées par la tâche 16) : bascule `tilt(u) = A·e^(−0,55u)·sin(2πu/1,75)`, A = 6,5° à l'arrivée, 2,4° au départ (maquette l. 468) ; rotation du meuble autour de `rock.pivot` (centre de courbure des patins), donc précalculée dans le sprite via `CelView.pre/preN` (comme `chairSprite`, l. 455) ; creux : 0 → 1 en 0,4 s à l'arrivée, gardé 4 s après le départ, puis retour en 6 s (lissé) ; œuf : A = 3°, période 2,2 s, amortissement 0,6 s⁻¹ ; plateau : ressort amorti 1,2 cm, période 0,5 s, amortissement 3 s⁻¹ ; pompon : 12°, 1,4 s, 0,5 s⁻¹ ; feuilles : `rustle` 1 → 0 en e^(−1,2u) ; jupe du canapé : une onde de 0,8 s à l'entrée et à la sortie ; griffes : `tremble` alterné à 8 Hz pendant la pose `scratch`. Aucun événement n'est accepté quand `editing` ; `clear()` à l'entrée en Aménager ; `forget(id)` quand un meuble est déplacé, tourné ou retiré.

- [ ] **Step 1 : tests du livre** (`furniture-life.test.ts`)

```ts
describe('mobilier vivant', () => {
  it('rocking-chair : immobile inoccupé, bascule à l’arrivée puis s’amortit', () => {
    const b = new LifeBook();
    expect(b.stateOf('r', 'rocking-chair', 1000).tilt).toBe(0);
    b.push({ id: 'r', kind: 'rocking-chair', type: 'arrive', at: 0 });
    const peak = Math.max(...Array.from({ length: 40 }, (_, i) => Math.abs(b.stateOf('r', 'rocking-chair', i * 50).tilt)));
    expect(peak).toBeGreaterThan((5 * Math.PI) / 180);
    expect(Math.abs(b.stateOf('r', 'rocking-chair', 8000).tilt)).toBeLessThan((0.3 * Math.PI) / 180);
    expect(b.settled('r', 12000)).toBe(true);
  });
  it('le coussin garde le creux un moment puis reprend sa forme', () => {
    const b = new LifeBook();
    b.push({ id: 's', kind: 'sofa', type: 'arrive', at: 0 }); b.push({ id: 's', kind: 'sofa', type: 'leave', at: 5000 });
    expect(b.stateOf('s', 'sofa', 7000).dent).toBeCloseTo(1, 1);
    expect(b.stateOf('s', 'sofa', 20000).dent).toBe(0);
  });
  it('une bascule entière tient en moins de 30 paliers', () => {
    const b = new LifeBook(); b.push({ id: 'r', kind: 'rocking-chair', type: 'arrive', at: 0 });
    expect(new Set(Array.from({ length: 400 }, (_, i) => lifeKey('rocking-chair', b.stateOf('r', 'rocking-chair', i * 25)))).size).toBeLessThan(30);
  });
  it('événements : arrivée, départ, cachette, griffes, frôlement d’une plante', () => { /* deux listes de PetFrame → les LifeEvent attendus */ });
});
```
- [ ] **Step 2 : tests de l'animal porté** (`pets-follow.test.ts`) : rocking-chair à l'angle 1 incliné de 5° : le point d'assise du sprite (perch transformé puis projeté) et `pos + followOf` coïncident à 0,5 px ; même chose pour `dent = 1` (l'animal descend avec le creux) et pour le plateau de l'arbre à chat ; `followOf` est `null` au repos.
- [ ] **Step 3 : tests de la pièce** (`furniture-sprite-life.test.tsx`, Ghibli) : pendant une bascule, l'`href` du sprite change sans rendu React du meuble (compteur de rendu stable) et retombe sur le sprite de repos à la fin ; en Aménager, une arrivée d'animal ne change rien ; déplacer le meuble pendant la bascule le remet au repos ; le palier demandé et pas encore peint est remplacé par le palier prêt le plus proche (jamais un trou).
- [ ] **Step 4 : FAIL** ; **Step 5 : implémenter** (boucle : celle de `usePetSim`, qui pousse `lifeEvents` dans le livre puis pose `href` et `transform` ; `place` de `pet-sim.ts` compose `translate(pos + d) rotate(rot cx cy)`) ; **Step 6 : PASS** + `npm run test:famille -- scene-animaux scene-piece`.
- [ ] **Step 7 : captures** : scènes du banc `rock`, `nap`, `tree`, `egg` en planches de 8 instants → `publish.mjs … 15-vivant`, postées.
- [ ] **Step 8 : commit** `feat(bibliotheque): G6 — mobilier qui réagit à l'animal, l'animal suit le meuble`.

---

### Task 16 : chorégraphie des réactions (Fable)

**Files :**
- Modify : `src/core/library/furniture-life.ts` (constantes des lois), `src/core/library/furniture-life-specs.ts` (pivots, zones de creux, accroches), les modèles des tâches 5 à 9 (déformations par état)
- Test : `tests/core/library/furniture-life.test.ts` (bornes), `tests/core/library/furniture-cel-models-*.test.ts` (états)

**Interfaces :** Consumes les lois et `LifeState` de la tâche 15 ; Produces les valeurs finales (aucune nouvelle signature).

- [ ] **Step 1 : tests de bornes** ajoutés : bascule max ≤ 8° et repos (< 0,3°) en moins de 7 s ; œuf ≤ 4° ; plateau ≤ 1,5 cm ; feuilles ≤ 6° ; creux remis à 0 en moins de 15 s ; pour chaque meuble animé et chaque palier de `lifeKey`, `checkCelModel` passe encore (le volume déformé reste dans l'encombrement, ne traverse ni le sol ni le mur).
- [ ] **Step 2 : régler** à l'œil au banc (scènes `rock`, `nap`, `hide`, `scratch`, `brush`, `tree`, `egg`, rideaux au vent) : inertie, amortissement, nombre de paliers (aucune saccade visible au premier plan à 60 i/s) ; noter les valeurs retenues et pourquoi dans le journal SDD.
- [ ] **Step 3 : PASS** + `npm run test:famille -- scene-animaux scene-piece`.
- [ ] **Step 4 : captures** : planches de chaque réaction (8 instants) → `publish.mjs … 16-choregraphie`, postées.
- [ ] **Step 5 : commit** `feat(bibliotheque): G6 — chorégraphie des réactions du mobilier`.

---

### Task 17 : zooms, vue Modifier et zoom de la hi-fi (Opus)

**Files :**
- Modify : `src/content/furniture-zoom.tsx` (`GarnishedPiece` :73, `FurnitureZoom` :97), `src/content/shelf-board-zoom.tsx` (`ShelfBoardZoom` :108 : montants et tablettes en cellulo SVG, `BOARD_FACE` inchangé), `src/content/hifi/HifiZoom.tsx:83-107`, `src/content/arrange/ArrangeView.tsx:75-90, 222-260`
- Test : `tests/content/furniture-zoom.test.tsx`, `shelf-board-zoom.test.tsx`, `hifi-zoom.test.tsx`, `arrange-view.test.tsx` (ajouts Ghibli)

**Interfaces :**
- Consumes : `FurnitureSprite`, `CarriedSprite` (prop `res`), `PLUNGE_CAMERA` (tâche 2).
- Produces : en Ghibli, les zooms posent `FurnitureSprite`/`CarriedSprite` avec `res = SPRITE_PX × échelle du zoom` (bornée pour que l'image fasse au plus 2400 px de côté) ; Modifier et hi-fi avec `camera = PLUNGE_CAMERA` (clé `cam: 'plunge'`).

- [ ] **Step 1 : tests** : zoom d'étagère en Ghibli → `[data-furniture-sprite]` dont la clé porte `res ≥ 2 ×` la taille affichée et ≤ 2400 px ; Modifier et hi-fi → clé `plunge` ; repli `Model3DArt` avant cuisson ; les décalques (couvertures, façade hi-fi, disque qui tourne) restent cliquables aux mêmes cadres ; second zoom d'étagère : titres sur bandeau et glissé inchangés.
- [ ] **Step 2 : FAIL** ; **Step 3 : implémenter** ; régler `PLUNGE_PERSP.pitch` au banc (vue Modifier lisible, dessus du bureau visible) ; **Step 4 : PASS** + `npm run test:famille -- scene-piece`.
- [ ] **Step 5 : captures** : zoom d'étagère, second zoom, zoom hi-fi en lecture, vue Modifier du bureau → `publish.mjs … 17-zooms`, postées.
- [ ] **Step 6 : commit** `feat(bibliotheque): G6 — zooms, vue Modifier et hi-fi en cellulo`.

---

### Task 18 : vignettes du catalogue (Sonnet)

**Files :**
- Modify : `src/content/furniture-thumb.tsx:39-53` (`FurnitureThumb`)
- Test : `tests/content/furniture-thumb.test.tsx` (ajouts Ghibli)

**Interfaces :** Consumes `FurnitureSprite`, `CarriedSprite` ; Produces `FurnitureThumb` en Ghibli : sprite à l'angle 0 (comme aujourd'hui), `res` adaptée à la vignette, côté de lumière `left`, repli `Model3DArt`/`Item3DArt`.

- [ ] **Step 1 : test** : en Ghibli, la vignette de chaque meuble du catalogue rend un `[data-furniture-sprite]` (ou son repli) ; en classique, rendu inchangé ; un meuble steampunk-only n'apparaît que pour le style steampunk (règle existante).
- [ ] **Step 2 : FAIL** ; **Step 3 : implémenter** ; **Step 4 : PASS** + `npm run test:famille -- scene-piece`.
- [ ] **Step 5 : captures** : tiroir de construction (Meubles) ouvert, 2 styles → `publish.mjs … 18-vignettes`, postées.
- [ ] **Step 6 : commit** `feat(bibliotheque): G6 — vignettes du catalogue en cellulo`.

---

### Task 19 : objet ouvert en cellulo (Fable)

**Files :**
- Modify : `src/content/opened-item/item-case.tsx`, `back-magnifier.tsx`, `disc-flight.tsx`, `game-outside.tsx` (styles de la boîte ouverte en CSS 3D : aplats, ombre nette, encre `#2A1A18`, sans dégradé ni flou), en Ghibli seulement
- Test : `tests/content/opened-item-layer.test.tsx`, `disc-flight.test.tsx` (ajouts Ghibli)

**Interfaces :** Produces une prop `ghibli?: boolean` sur `OpenedItemLayer` (passée par `LibraryPanel`/`RoomView`) ; logique d'ouverture, vol du disque et loupe inchangés.

- [ ] **Step 1 : test** : en Ghibli, aucun `box-shadow` flou ni `linear-gradient` sur la boîte ouverte, bords en `#2A1A18` ; les tests existants de l'objet ouvert restent verts.
- [ ] **Step 2 : FAIL** ; **Step 3 : dessiner** ; **Step 4 : PASS** + `npm run test:famille -- scene-piece`.
- [ ] **Step 5 : captures** : CD, DVD, jeu et livre ouverts → `publish.mjs … 19-objet-ouvert`, postées.
- [ ] **Step 6 : commit** `feat(bibliotheque): G6 — objet ouvert en cellulo`.

---

### Task 20 : validation — catalogue sous 8 angles et 8 styles, mesure au banc, S26 (Sonnet ; retouches : Fable)

**Files :**
- Create : `.superpowers/sdd/2026-10-24-bibliotheque-ghibli-g6/validation.md` (tableau famille × style, écarts, mesures)

- [ ] **Step 1 : captures complètes** : planche de chaque famille (tâches 5 à 10 + objets) sous les 8 angles × les 8 styles (64 planches), pièce du banc par style à 10 h et 22 h, chaque scène de réaction → `publish.mjs … 20-validation/<style>` ; lien du `README.md` posté dans la conversation.
- [ ] **Step 2 : relecture contre les anti-objectifs** (spec §9) : pour chaque planche, noter dans `validation.md` tout meuble beau de face et raté de dos ou de profil, rendu « 3D lisse » ou « peint », bloc cubique, agitation sans raison, saccade, tache sur le mur, objet qui en traverse un autre ; chaque écart corrigé par Fable (commit `fix(bibliotheque): G6 — retouche <meuble>`) et recapturé, jusqu'à ce que chaque écart restant soit une limite assumée.
- [ ] **Step 3 : mesure au banc** (`perf.mjs`, CPU ×4, 1440 × 600) sur `main` et sur la branche, même pièce par style : images par seconde (scène `rock` et pièce immobile), temps de peinture moyen et max par sprite, temps jusqu'à `window.done`, taille du cache après 2 min. Régression > 15 % des images par seconde → profiler et corriger avant de continuer ; si la peinture moyenne dépasse 150 ms par sprite, réduire `SPRITE_SS` à 1,5 avant `SPRITE_PX`. Résultats dans `validation.md`.
- [ ] **Step 4 : S26** (validation visuelle, pas de mesure de performance) : APK pré-prod debuggable construit depuis `C:\Users\maxim\Downloads\Wikimasters-mobilier` sur la branche (`npm run apk:preprod`), installé par adb sans fil (voir mémoire « Mesure sur téléphone ») ; captures plein écran paysage de la pièce dans les 8 styles et sous plusieurs angles, scène du rocking-chair filmée → publiées (`20-s26`) ; défauts notés et corrigés comme au Step 2.
- [ ] **Step 5 : jouer les familles touchées** : `npm run test:famille -- scene-piece scene-lumiere scene-animaux scene-commun scene-ville` → PASS (lancer seuls les fichiers en délai si la charge en fait échouer).
- [ ] **Step 6 : commit** `docs(bibliotheque): G6 — validation sous 8 angles et 8 styles, mesures au banc`.

---

### Task 21 : PR, fusion, pré-prod, build (Opus)

- [ ] **Step 1 : relecture de branche** : `superpowers:requesting-code-review` sur toute la branche (modèle le plus capable) ; corriger les remarques fondées.
- [ ] **Step 2 : PR** : `git push -u origin feat/bibliotheque-ghibli-g6` ; corps dans un fichier (`gh pr create --base main --title "G6 — la pièce façon Ghibli" --body-file <fichier>`) : à quoi ça sert, d'où viennent les données (modèles en cm inchangés, rendu 3D cellulo), comment (moteur, perspective, sprites, repli, lumière, mobilier vivant), limites (perspective vs grille sur les meubles profonds, décalques par-dessus le sprite, peinture dans le fil principal, mesure téléphone après G7), lien des captures `captures/g6-piece`, résultats du banc ; se termine par `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 3 : fusion** sans attendre (règle « PR automatique ») : `gh pr merge --merge`, puis `git -C "C:\Users\maxim\Downloads\Wikimasters tools" pull`.
- [ ] **Step 4 : pré-prod** depuis `C:\Users\maxim\Downloads\Wikimasters-mobilier` mis à jour sur `main` : `npm run preprod` → numéro de pré-prod noté ; **puis** `npm run build` → OK.
- [ ] **Step 5 : mémoire** : `project_ghibli.md` (G6 fusionnée, PR, pré-prod, reste : vérif. S26 à la demande, G7 animaux), ligne d'index dans `MEMORY.md` ; journal SDD clos ; captures finales postées à l'utilisateur pour validation.
