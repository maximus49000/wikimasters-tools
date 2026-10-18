# Habitants 3D — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** rendre tous les humains Ghibli en habitants 3D générés (garde-robe, peaux, visages), pilotés par le squelette du
pantin, avec repli sur le pantin et retour arrière par une constante.

**Architecture :** le pantin calcule toujours la pose (`poseOf`) ; un nouveau moteur `citizens` oriente les os Mixamo
d'un modèle AutoSprite allégé, l'habille (coques, jupes, coiffures générées par le code), le rend hors écran avec three.js
(caméra orthographique 12°, aplats + trait) en `data:` PNG, et le `FigureRegistry` sert ces images à la place de celles du
pantin quand elles sont prêtes. Modèles servis par le relais (fichiers statiques du Worker) et gardés sur l'appareil.

**Tech Stack :** TypeScript, React, three.js `0.160.0` (exact), `@gltf-transform/cli` (dev, hors ligne), vitest, Cloudflare
Workers (static assets).

**Spec :** `docs/superpowers/specs/2026-10-18-habitants-3d-design.md`. **Prototype de référence (à porter, pas à
réinventer) :** `C:\Users\maxim\Downloads\Wikimasters tools\.superpowers\autosprite\garde-robe\banc\` (`wardrobe.js`,
`catalogue.js`, `face.js`, `face-layer.js`, `dress.html`) et `..\..\base-*\` (`model.glb`, `base.png`, `prompt.json`).

## Global Constraints

- Interrupteur : `CITIZENS_3D` dans `src/content/figure/citizen-config.ts` ; `false` = comportement et clés de sprites
  **identiques** à aujourd'hui, aucun module three.js importé au chargement (import dynamique derrière la constante).
- L'ancien pantin n'est ni supprimé ni modifié dans son rendu ; ses tests restent verts.
- Première ouverture, option (b) : un passant (`waitFor3D`) n'est pas affiché tant que son image 3D n'est pas prête ;
  une figure fixe affiche le pantin puis bascule.
- Android ET extension Chrome reçoivent la 3D.
- Pas d'URL `blob:` (CSP de l'hôte) : sprites en `data:` PNG ; textures décodées par `createImageBitmap(blob)`, jamais
  d'`URL.createObjectURL`.
- Pas de mesure S26 bloquante : pré-prod après tests + captures ; retour arrière = `CITIZENS_3D = false`.
- Règles de la garde-robe (spec) : pas de jupe/robe pour les hommes, barbe seulement hommes adultes et papy, pas de barbe
  pour l'enfant, pas de casquette pour papy/mamie ; 8 teintes `PEAUX` ; cheveux selon peau et âge (`hairFor`).
- Visage : clignement 70/40/130 ms, intervalle 2–6 s, double 15 % ; 7 émotions, transition 0,4 s.
- Commentaires et textes en français, dans le style du code existant ; familles de tests seulement touchées
  (`npm run test:famille -- …`) ; envois AutoSprite toujours validés par l'utilisateur (`/autosprite`).

## Review Focus

1. Modèles injoignables (relais en panne, hors ligne au premier lancement) → la ville reste celle d'aujourd'hui (pantins),
   sans erreur ni passant fantôme bloqué ; les passants `waitFor3D` retombent sur le pantin après un délai (Task 9).
2. Palette de nuit / pluie qui change à la minute → pas de rafale de rendus 3D : la clé 3D ne change qu'aux paliers de
   lumière existants (1/8), l'imperméable n'apparaît que pour les hauts légers (Task 9).
3. Allures rares (`perch`, `mount`, `climb`, `crouch`, `seated`) et gestes à deux mains (`hold-child`, `plates`, `carry`)
   → segments 3D alignés au pantin et objets tenus dans les mains 3D (Task 7, Task 9).
4. Mémoire : changement de pièce répété → rigs, géométries, textures et contextes WebGL libérés (un seul renderer
   partagé ; LRU de rigs) (Task 8).
5. Enfants mis à l'échelle 0,6 par les scènes → l'enfant 3D est rendu à la hauteur normale du pantin (pas de double
   réduction) (Task 8).

---

## Fichiers

- `src/content/figure/citizen-config.ts` — interrupteur, constantes (budget, URL du relais).
- `src/core/citizens/catalogue.ts` — palette, peaux, pièces, règles par type, `citizen()`, `citizenFromOutfit()`, clé.
- `src/core/citizens/wardrobe.ts` — analyse du corps, coques, jupes, coiffures, barbes, casquette, accessoires, travail.
- `src/core/citizens/face.ts` — repères du visage (hors ligne) + calque d'expression, émotions, clignement, table
  geste → émotion.
- `src/core/citizens/retarget.ts` — pose du pantin → os Mixamo.
- `src/content/citizens/model-cache.ts` — téléchargement et cache local des modèles (Cache Storage `wmt-persos-v1`).
- `src/content/citizens/citizen-renderer.ts` — rig cache, rendu hors écran, accroches projetées.
- `src/content/figure/figure-host.tsx`, `ghibli-figure.tsx` — branchement (palette, file, repli, accroches, props).
- `scripts/citizens/build-models.mjs` — allègement hors ligne + manifeste ; `relay/public/persos/*` ; `wrangler.toml`
  (racine et `relay/`) section `[assets]` ; `relay/public/_headers`.
- Tests : `tests/core/citizens/*.test.ts`, `tests/content/citizens/*.test.ts`, `tests/content/figure/figure-host-3d.test.tsx` ;
  famille `scene-habitants3d` dans `tests/familles.ts`.

---

### Task 1 : Interrupteur, dépendance three.js, famille de tests

**Files :** Create `src/content/figure/citizen-config.ts`, `tests/content/citizens/config.test.ts` ; Modify
`package.json` (three `0.160.0` exact, `@types/three` correspondant), `tests/familles.ts`.

**Interfaces — Produces :** `export const CITIZENS_3D: boolean` (true) ; `export const RELAY_PERSOS: string`
(`${RELAY_BASE}/persos`, réutiliser `RELAY_BASE` existant) ; `export const RENDER_BUDGET_MS = 6` ;
`export const WAIT3D_FALLBACK_MS = 4000`.

- [ ] Test : `config.test.ts` vérifie `typeof CITIZENS_3D === 'boolean'`, `RELAY_PERSOS` finit par `/persos`.
- [ ] Ajouter la famille `scene-habitants3d` (fichiers `citizens/**` côté content et core, `figure-host-3d.*`).
- [ ] `npm install three@0.160.0 @types/three@0.160.0 --save-exact` ; `npm run test:famille -- scene-habitants3d` vert.
- [ ] Commit `feat(habitants3d): interrupteur et dépendance three.js`.

### Task 2 : Modèles allégés et hébergés sur le relais

**Files :** Create `scripts/citizens/build-models.mjs`, `relay/public/persos/manifest.json`, `relay/public/_headers`,
`tests/core/citizens/manifest.test.ts` ; Modify `wrangler.toml`, `relay/wrangler.toml`, `package.json` (devDependency
`@gltf-transform/cli` exact).

**Interfaces — Produces :** pour chaque base `B` ∈ {`homme-fort`, `homme-maigre`, `femme-frele`, `papy`, `mamie`,
`enfant`} : `persos/B.glb` (sans image embarquée) + `persos/B.png` (512 px) ; `manifest.json` :
`{ version: 1, bases: { [B]: { glb, png, metres, aged?: true, child?: true, face: FaceMarks } } }` avec `FaceMarks` =
`{ eyes: [Mark, Mark], brows: [Mark, Mark], mouthU: number, lidSkin, browSkin, mouthSkin }`, `Mark = {s,u,w,h}` (repère
crâne, comme `face.js`).

- [ ] Test `manifest.test.ts` : le manifeste se lit avec un schéma zod ; 6 bases ; `metres` = 1.70, 1.82, 1.62, 1.66,
  1.54, 1.25 ; `enfant.child === true` ; `papy.aged && mamie.aged`.
- [ ] Script : `gltf-transform simplify` (ratio visant ≈ 8 000 triangles, erreur 0,001), `resize` 512, texture extraite
  en PNG à part, GLB sans images. Repères du visage : calculés au banc (`face.js` sur les modèles pleine résolution,
  page `dress.html`, POST `/save/`) puis recopiés par le script dans le manifeste.
- [ ] `[assets] directory = "./relay/public"` (racine) et `"./public"` (relay/) ; `_headers` : `/persos/*` →
  `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=31536000, immutable`.
- [ ] Vérifier `npx wrangler deploy --dry-run` sans erreur ; famille `relais` verte.
- [ ] Commit `feat(habitants3d): modèles allégés servis par le relais`.

### Task 3 : Téléchargement et cache local des modèles

**Files :** Create `src/content/citizens/model-cache.ts`, `tests/content/citizens/model-cache.test.ts`.

**Interfaces — Produces :** `export type BaseModel = { name: string; scene: THREE.Group; body: THREE.SkinnedMesh;
texture: THREE.Texture; metres: number; child: boolean; aged: boolean; face: FaceMarks }` ;
`export function loadBase(name: string, deps?: { fetch; caches; decode }): Promise<BaseModel | null>` (null si
injoignable) ; `export function loadManifest(deps?): Promise<Manifest | null>`.

- [ ] Tests (fetch et caches simulés) : 2e appel sans réseau (lu dans `wmt-persos-v1`) ; réponse 404 → `null` sans
  exception ; aucune utilisation de `URL.createObjectURL` (espion) ; même promesse partagée pour deux appels simultanés.
- [ ] Implémenter : `GLTFLoader.parse(arrayBuffer)` ; texture via `createImageBitmap(blob)` → `THREE.Texture`
  (`flipY = false`, `SRGBColorSpace`).
- [ ] Commit `feat(habitants3d): modèles gardés sur l'appareil`.

### Task 4 : Catalogue et générateur d'habitants

**Files :** Create `src/core/citizens/catalogue.ts`, `tests/core/citizens/catalogue.test.ts`.

**Interfaces — Produces :**
`export type CitizenKind = 'adult' | 'child' | 'aged' | 'any'` ;
`export type CitizenDesc = { base: string; skin: string; height: number; hair: [string, string] | null;
beard: [string, string] | null; cap: [string, string] | null; items: Item[]; mood: Emotion }` ;
`export function citizen(seed: number): CitizenDesc` (port de `catalogue.js`) ;
`export function citizenFromOutfit(seed: number, o: Outfit, opts: { work?: Work; umbrella?: boolean; kind?: CitizenKind }): CitizenDesc` ;
`export function citizenKey(d: CitizenDesc): string` (chaîne stable, ordre fixe) ;
`export function expand(d: CitizenDesc): Piece[]` (pièces pour la garde-robe).
Correspondance `Outfit` → pièces : cheveux `short/long/bun/cap/beanie/bald` → style compatible du type (casquette =
`cap`, bonnet = nouvelle pièce `bonnet`), haut `tee/sweater/jacket/coat/shirt/suit/jersey` → `tee/pull/manteau/
manteauLong/chemise/chemise+col (costume)/tee`, bas `pants/jeans/skirt/shorts/dress/jogging` →
`pantalon/pantalon jean/jupe/short/robe/pantalon` ; couleurs de l'`Outfit` reprises ; `skirt/dress` impose une base
femme ; `kind: 'child'` impose `enfant`.

- [ ] Tests : déterministe (même graine → même `citizenKey`) ; sur 2 000 graines aucune barbe hors `homme-*`/`papy`,
  aucune jupe/robe hors femmes/mamie/enfant, aucune casquette pour `papy`/`mamie` ; `work: 'vest'` ajoute une pièce
  `gilet` ; `kind: 'child'` → base `enfant` ; `Outfit` à jupe → base femme ; les 8 peaux apparaissent.
- [ ] Commit `feat(habitants3d): générateur d'habitants`.

### Task 5 : Garde-robe (géométrie)

**Files :** Create `src/core/citizens/wardrobe.ts`, `tests/core/citizens/wardrobe.test.ts`,
`tests/core/citizens/fixtures/humanoid.ts` (petit corps skinné synthétique en T, os Mixamo, ~2 000 sommets).

**Interfaces — Produces :** `export function analyse(body: THREE.SkinnedMesh): BodyInfo` ;
`export function dressRig(info: BodyInfo, pieces: Piece[], skin: string): THREE.Object3D[]` (toutes les pièces
liées au squelette, matériaux `toon`). Porter tel quel du banc : `shell` (coupe par champ continu, normales lissées,
`bindPos`), `skirt` (plis), `hair` (15 styles), `beard` (4), `cap`, `garments` (top avec col et aisance, bottom, socks,
shoes/boots avec semelle, skin). Ajouter : `gilet` (travail, orange `#F28C28` + bande `#E8E8E0`), `tablier` (`#F4F1EA`,
devant seulement), `bonnet`, accessoires `sacADos`, `sac`, `mallette`, `ballon`, `echarpe` (liés à la main droite / au
torse), `parapluie` (main droite).

- [ ] Tests sur le corps synthétique : chaque pièce produit une géométrie non vide liée au même `skeleton` ; coque
  `top` coupée : aucun sommet sous `hemY` ; `skirt` : poids bassin = 1 en haut, somme des poids = 1 partout ;
  `hair('afro')` liée à 100 % à l'os de tête.
- [ ] Commit `feat(habitants3d): garde-robe générée`.

### Task 6 : Visage (repères, expressions, clignement)

**Files :** Create `src/core/citizens/face.ts`, `tests/core/citizens/face.test.ts`.

**Interfaces — Produces :** `export type Emotion = 'neutre' | 'content' | 'heureux' | 'triste' | 'surpris' | 'fache' |
'inquiet'` ; `export const EMOTIONS` (réglages de `face-layer.js`) ; `export function faceLayer(info, marks: FaceMarks,
skin: string, baseSkin: string): THREE.Mesh` avec `userData.set(e: Emotion, blink: number)` (état figé pour un sprite) ;
`export function blinkAt(t: number, seed: number): number` (0→1→0, mêmes durées) ;
`export function emotionFor(arms: ArmPose, mood: Emotion): Emotion` ; `export function faceState(e, blink): string`
(clé courte, `''` pour neutre ouvert).
Table `emotionFor` : `pay-card`, `pay-cash`, `take`, `give`, `wave` → `content` ; `toast-1`, `toast-2`, `cheer`,
`raise` → `heureux` ; `sneeze` → `surpris` ; `crossed`, `chin` → `inquiet` ; autres → `mood`.

- [ ] Tests : `blinkAt` vaut 0 hors clignement, 1 entre 70 et 110 ms, revient à 0 à 240 ms ; intervalle entre deux
  débuts ∈ [2 s, 6 s] hors doubles ; `emotionFor('toast-1','neutre') === 'heureux'` ; `faceState('neutre', 0) === ''`.
- [ ] Commit `feat(habitants3d): visages animés`.

### Task 7 : Le pantin pilote les os

**Files :** Create `src/core/citizens/retarget.ts`, `tests/core/citizens/retarget.test.ts`.

**Interfaces — Consumes :** `poseOf(yaw, phase, gait, opts)` et `Pose` (`skeleton.ts`). **Produces :**
`export function applyPose(rig: THREE.Object3D, bones: BoneMap, pose: Pose, unitsToRig: number): void` ;
`export function boneMap(skeleton: THREE.Skeleton): BoneMap`.
Méthode : de la racine vers les extrémités, faire pointer chaque segment du rig (hanche→genou, genou→cheville,
cheville→orteil, épaule→coude, coude→main, cou→tête) dans la direction du segment du pantin (repère du pantin : x
droite, y haut, z vers le spectateur), bassin placé au `pelvis` × `unitsToRig`, tronc tourné par `pelvisTurn`,
`shoulderTurn`, `lean`, tête par `headFrame`. Directions copiées, longueurs du modèle conservées.

- [ ] Test : sur le corps synthétique, pour chaque `Gait` × `ArmPose` ∈ {`swing`, `pay-card`, `pour`, `scissors-1`,
  `hold-child`, `handlebar`, `overhead`} × yaw ∈ {0, 4, 8, 12} × phase ∈ {0, 3, 6, 9}, l'angle entre chaque segment du
  rig et le segment du pantin est < 3°.
- [ ] Commit `feat(habitants3d): pantin → os Mixamo`.

### Task 8 : Rendu hors écran

**Files :** Create `src/content/citizens/citizen-renderer.ts`, `tests/content/citizens/citizen-renderer.test.ts`.

**Interfaces — Consumes :** Tasks 3–7. **Produces :**
`export class CitizenRenderer { constructor(opts: { pxPerUnit: number; makeRenderer?: () => RendererLike });
ready(desc: CitizenDesc): boolean; prepare(desc): void; render(desc, key: FigureKey, light: number, face: string):
{ url: string; anchors: Record<Anchor | 'hands', readonly [number, number]> } | null; dispose(): void }`.
Un seul `WebGLRenderer` partagé (canvas `SPRITE_BOX.w·px × SPRITE_BOX.h·px`), caméra orthographique cadrée sur
`SPRITE_BOX` (unités du pantin, pieds à l'origine), élévation 12° (`geometry.ts`), toon 2 tons + `OutlineEffect`
(épaisseur du corps réduite comme au banc), lumière multipliée par `light`. Échelle : adulte = `37.5 × metres / 1.70`
unités, enfant = 37,5 (les scènes réduisent déjà à 0,6). LRU de 48 rigs habillés (dispose des géométries et matériaux à
l'éviction). Accroches : projection des os main droite/gauche, tête, haut de tête, nuque, bassin.

- [ ] Tests (renderer simulé) : `render` rend `null` tant que `ready` est faux ; projection : un point à (0, 0, 0) tombe
  à `(-x0·px, -y0·px)` du canvas ; LRU : 49e rig → `dispose` appelé sur le 1er ; enfant → hauteur 37,5 unités.
- [ ] Contrôle visuel : page de banc qui rend 6 bases × 4 tenues ; capture montrée à l'utilisateur.
- [ ] Commit `feat(habitants3d): rendu des habitants en images`.

### Task 9 : Branchement dans le registre des figures

**Files :** Modify `src/content/figure/figure-host.tsx`, `src/content/figure/ghibli-figure.tsx` ; Create
`tests/content/figure/figure-host-3d.test.tsx`.

**Interfaces — Consumes :** `CitizenRenderer`, `citizenFromOutfit`, `citizenKey`, `emotionFor`, `faceState`.
**Produces :**
- `GhibliFigure` : props facultatives `citizen?: number` (graine ; défaut = hachage stable de l'`Outfit`),
  `kind?: CitizenKind`, `waitFor3D?: boolean`, `emotion?: Emotion`.
- `figurePalette(o, sky, rainy, c3d?: { key: string; light: number })` ajoute `c3d` et `c3d-light` (palier 1/8) à la
  palette quand `CITIZENS_3D` ; `PALETTE_ORDER` étendu en fin (clés inchangées sans 3D).
- `FigureRegistry` : `flush()` traite d'abord les sprites pantin (inchangé), puis les rendus 3D tant que
  `performance.now()` reste sous `RENDER_BUDGET_MS` ; `anchors(sk)` rend les accroches 3D d'un sprite ou `null` ;
  `request()` sur une palette 3D sert le sprite 3D s'il existe, sinon le sprite pantin (repli), sauf si la figure est en
  `waitFor3D` : rien (figure cachée) jusqu'à l'image 3D ou `WAIT3D_FALLBACK_MS`.
- `heldTransforms`, `figureHeadTop`, `rideFrame` utilisent `reg.anchors(sk) ?? anchorsOf(key)`.
- Options du constructeur : `{ max?, perFrame?, pxPerUnit?: number (défaut SPRITE_PX), faces?: boolean (défaut false) }` ;
  sans `faces`, l'état du visage est toujours `''` (neutre, yeux ouverts).

- [ ] Tests : `CITIZENS_3D=false` (mock du module) → clés de palette et de sprite identiques à aujourd'hui (instantané
  sur 3 tenues) ; 3D pas prête → sprite pantin servi ; prête → sprite 3D au `flush` suivant ; `waitFor3D` → aucune image
  avant la 3D, pantin après 4 000 ms ; budget : renderer simulé de 4 ms → au plus 2 rendus 3D par `flush` ; accroche
  `handR` d'une figure 3D = celle du rendu 3D ; `loadBase` → `null` (relais injoignable) → pantins partout, aucune
  exception, passants `waitFor3D` visibles en pantin après 4 000 ms ; palette recalculée à chaque minute du crépuscule →
  même clé `c3d-light` tant que le palier 1/8 ne change pas ; pluie : imperméable seulement sur `tee/sweater/jacket/shirt`.
- [ ] Familles `scene-pietons`, `scene-commerces`, `scene-circulation`, `scene-evenements`, `scene-habitants3d` vertes.
- [ ] Commit `feat(habitants3d): les figures passent par la 3D`.

### Task 10 : Identités, enfants, émotions dans les scènes

**Files :** Modify les sites de l'annexe A de la spec (au minimum `people.ts`/`city-life.tsx` passants,
`shops/customers.ts`, `shops/scene/cast.ts`, `city-shops-life.tsx` personnel et ouvriers, `vehicles.ts`,
`traffic/engine.ts`, `traffic/cars.ts`, `moving-truck.tsx`, `shop-terrace.tsx`) ; registre des vues zoomées
(`RoomView.tsx`) : `new FigureRegistry(…, { pxPerUnit: 6, faces: true })`.

**Interfaces — Consumes :** props de la Task 9.
- Passants de la rue : `waitFor3D`, `citizen` = hachage de leur id, enfants `kind: 'child'`.
- Scènes des commerces : `emotion = emotionFor(arms, mood)` ; personnel avec ses couleurs de tenue.
- Visages : variantes (émotion, clignement via `blinkAt`) seulement dans les registres `faces: true`.

- [ ] Tests : un passant garde la même `citizenKey` d'un rendu à l'autre ; les enfants du défilé et de `cast` ont
  `kind: 'child'` ; une scène de caisse produit `content` au geste `pay-card`.
- [ ] Familles touchées vertes ; captures rue / commerce / zoom montrées à l'utilisateur.
- [ ] Commit `feat(habitants3d): identités et émotions dans les scènes`.

### Task 11 : Deux silhouettes de femme supplémentaires

**Files :** `relay/public/persos/femme-forte.*`, `femme-grande.*`, `manifest.json`, `catalogue.ts` (poids des types).

- [ ] Rédiger avec l'utilisateur les textes (skill `/autosprite`, même partie commune que les autres bases), **montrer
  chaque bloc d'envoi et attendre son accord**, puis `create_character` (3 crédits) et `generate_character_3d_model`
  (50 crédits) pour chacune.
- [ ] Passer les modèles dans `build-models.mjs`, ajouter au manifeste (`metres` 1,65 et 1,76), répartir le poids de
  `femme-frele` entre les trois.
- [ ] Test du catalogue : les trois bases femme apparaissent sur 2 000 graines.
- [ ] Commit `feat(habitants3d): deux silhouettes de femme`.

### Task 12 : Planches, WikiHow, pré-prod

- [ ] Planches : 56 gestes × chaque base (rendu de la Task 8) envoyées à l'utilisateur.
- [ ] Fiche WikiHow (`src/core/whats-new/entries.ts`, nouvel id `habitants-3d-2026-10`) : à quoi ça sert, d'où viennent
  les personnages, comment ils sont tirés au hasard, limites (cheveux rigides, premier lancement qui télécharge).
- [ ] Familles touchées vertes, PR ouverte puis fusionnée, pré-prod publiée (`npm run preprod`), modèles vérifiés en
  ligne sur le relais (`/persos/manifest.json` 200 + CORS).
