# Ville Ghibli — PR 3 : verdure de la rue, arbres au vent (+ découpe des nuages au pixel) — plan d'exécution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** la rue principale reçoit sa verdure (arbres en fosse, bacs, parterres, grimpantes, pots, herbe, feuilles mortes) au
calendrier réel, les arbres de rue bougent au vent de la météo (sprites cuits, transformations à 15 Hz), et les nuages ne sont
plus découpés en rectangles au-dessus des toits du fond.

**Architecture:** tout ce qui est fixe se peint dans les tranches (`paintCityTile`) ; les arbres en fosse vivent dans un calque
SVG `arbres-rue` à nœuds constants (images cuites par masse, une transformation par masse) placé au-dessus des fenêtres
allumées. Le champ de vent est une fonction pure `(x, t, météo)`. La découpe des nuages lit la silhouette réelle des tranches
peintes (premier pixel non transparent par colonne).

**Tech Stack:** TypeScript, React (SVG), canvas 2D hors écran, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-ville-fond-design.md` (§3 « Verdure », « Arbres », §3 bis « Performance
Android »), maquette validée `docs/superpowers/maquettes/fond-ville/` : `notes.md` §3 bis, §3 c, §3 d, §3 e, §3 ter ; code de
référence à porter : `src/03a-arbres.js`, `src/03b-rue-verte.js`, `src/04a-vent.js`, `src/01-outils.js` (`bedState`,
`leavesOnGround`). Plan général : `docs/superpowers/plans/2026-10-20-ville-fond.md` § PR 3.

## Global Constraints

- Graphisme classique strictement inchangé (rien de ce plan ne touche `data-classic-city` ni le tirage `citySkyline`).
- Naturel ; rien n'apparaît ni ne disparaît sur place (particules nées au houppier, oiseaux entrent et sortent par un bord).
- Saisons respectées : calendrier `notes.md` §3 ter, progressif, décalage ± 7 j par arbre.
- Le tronc ne change jamais de taille (squelette tiré de la clé seule ; test des 365 jours).
- Feuillage en masses, jamais en points (blobs lobés de `hill-trees.ts`).
- Pas de baisse de fluidité sur Android : nœuds constants, rien n'est repeint à chaque image, 15 Hz (`FRAME_MS = 66`).
- Mouvement réduit (`prefers-reduced-motion`) : arbres immobiles, aucune particule, aucun oiseau.
- Couloir des passants libre (`doorY` → `walkY`) ; interdits : entrées ± 4 (+2), lampadaires ± 9, arbres du plan ± (r + 6),
  mobilier ± 3, 8 px à chaque bout d'un local, autres éléments ± 3.
- Rue : arbres espacés de 70 à 110 px (décision du 2026-10-20) ; grimpantes sur 15 % des façades.
- Commentaires, commits et PR en français, avec les lignes d'attribution de la session.
- Tests : ne jouer que les familles touchées (`npm run test:famille -- scene-ville scene-commun scene-meteo`).

## Review Focus

1. Scène étroite (largeur < 360 px, une seule tranche) ou très large (2 880 px) : verdure et découpe des nuages cohérentes
   aux bords (aucun arbre coupé net à x = 0 / W, aucune colonne non mesurée dans la silhouette).
2. Tranche pas encore peinte ou peinture en échec (`failed`) : la découpe des nuages retombe sur la ligne analytique, jamais
   un ciel sans découpe (nuages devant les façades).
3. Neige posée (`usePaintedSnow`) sur les toits : la découpe ne doit pas laisser un nuage passer DEVANT une calotte de neige.
4. Changement de jour pendant que la scène tourne (minuit, balayage de 7 h 30, pluie qui commence) : sprites recuits sans
   que l'arbre disparaisse (l'ancien sprite reste affiché jusqu'au nouveau).
5. Nuit : les fenêtres allumées ne transparaissent pas à travers un houppier (calque au-dessus de `GhibliWindows`), et le
   houppier reçoit l'étalonnage de nuit (pas un arbre de plein jour sur une rue de nuit).

---

### Task 1: Découpe des nuages au pixel (bogue signalé le 2026-10-24)

Constat (capture de l'utilisateur) : au-dessus de la crête, les nuages sont coupés par des rectangles bleu ciel. Cause :
`skylinePath` (sky-clip.ts) suit `hillTopY`, qui prend les boîtes conservatrices `plan.hill.tops` (`fondTops`, city-plan.ts)
de chaque arbre, maison, chapelle ; le calque des nuages (scene-weather.tsx, `data-wx-clip="sky"`) est AU-DESSUS de la ville,
donc tout le rectangle est privé de nuages alors que la tranche y est transparente.

**Files:**
- Modify: `src/content/painted-city.ts` (profil du haut de chaque tranche), `src/core/library/paint/sky-clip.ts`,
  `src/content/scene-weather.tsx:403-410,505-512`
- Test: `tests/core/library/paint/paint-sky-clip.test.ts`, `tests/content/painted-city*.test.ts` (fichier existant de
  painted-city, sinon le créer dans `tests/content/`)

**Interfaces:**
- Produces: `export function alphaTopProfile(data: Uint8ClampedArray, w: number, h: number, dpr: number): Float32Array` (sky-clip.ts :
  pour chaque colonne de px CSS, le plus petit y CSS où un pixel a un alpha > 0 dans les `dpr` colonnes de pixels qu'elle
  couvre ; `h / dpr` si la colonne est vide) ;
  `export function skylinePathFromProfile(plan: Plan, profile: Float32Array | null, extra?: readonly TopBox[]): string`
  (même forme que `skylinePath` : `M0 0 L… L W 0 Z`) ; profil `null` → exactement `skylinePath(plan)` ;
  `painted-city.ts` : `export function usePaintedSkyline(plan: CityPaintPlan | null): Float32Array | null` (profil de toute la
  largeur, assemblé à partir des tranches AFFICHÉES ; `null` tant qu'une tranche manque).

- [ ] **Step 1: tests de `alphaTopProfile`** : image 4 × 6 à dpr 2 (2 colonnes CSS) dont la colonne 0 a un pixel alpha 10 à y
  pixel 5 et la colonne 1 rien → `[2.5, 3]` ; pixel alpha 255 à y 0 → `0`.
- [ ] **Step 2: tests de `skylinePathFromProfile`** :
  - profil `null` → égal à `skylinePath(plan)` ;
  - plan de la graine 7 à 1 440 px, profil = tableau constant `100` sauf `[600..620) = 40` → tous les sommets y du chemin
    entre x 600 et 620 valent `≤ 40` et, hors de cette fenêtre et hors des immeubles du premier plan, `≥ 99.9`
    (plus aucune boîte de `hill.tops` ne marque le chemin) ;
  - un immeuble du premier plan garde sa ligne de toit analytique (`roofLineY`) quand elle est plus haute que le profil ;
  - `extra = [[300, 320, 20]]` (ailes du moulin) → sommets entre 300 et 320 `≤ 20`.
- [ ] **Step 3: vérifier l'échec** — `npx vitest run tests/core/library/paint/paint-sky-clip.test.ts` : FAIL (fonctions absentes).
- [ ] **Step 4: implémenter** dans sky-clip.ts. Sommets à chaque px CSS là où le profil sert (le haut vaut
  `min(profil(x), lignes de toit analytiques des immeubles qui couvrent x, boîtes extra)`), y arrondi vers le haut comme
  `skylinePath`. `hillTopY` et `hill.tops` ne servent plus que de repli (profil `null`).
- [ ] **Step 5: profil des tranches** : dans `canvasTilePainter`, après `paintCityTile`, lire `getImageData` (le contexte est
  déjà `willReadFrequently`) et ranger `alphaTopProfile(...)` dans une table `profiles: Map<string, Float32Array>` à côté du
  cache d'URL (même clé, même éviction). `usePaintedSkyline` assemble les profils des tranches montées (abonnement au même
  `bump` que `usePaintedCity`, via un petit émetteur de module). Le peintre de test (`setTilePainterForTests`) ne fournit pas
  de profil → `null` (repli).
- [ ] **Step 6: scene-weather** : `skyline = skylinePathFromProfile(cityPlan, usePaintedSkyline(cityPlan), animatedTops(cityPlan))`
  où `animatedTops` (sky-clip.ts) rend les boîtes des éléments du calque `vie-fond` qui dépassent la crête et ne sont pas dans
  les tranches : ailes des moulins (disque de rayon `9 × s + 2` autour du moyeu `m.x − 0,5 s, m.y − 13 s`), grue (flèche).
  Neige posée : le profil de la tranche de neige (`usePaintedSnow`) s'ajoute s'il est disponible ; sinon les toits gardent
  `roofLineY` qui inclut déjà la neige (vérifier dans snow-painter.ts et l'écrire dans le test du Step 2 si oui).
- [ ] **Step 7: tests verts** — `npm run test:famille -- scene-meteo scene-ville` ; `npx tsc --noEmit`.
- [ ] **Step 8: capture au banc** `.superpowers/harness-fond` (mode `vie=1`) ou appli : ciel nuageux, crête graine 7, avant /
  après, envoyée à l'utilisateur.
- [ ] **Step 9: commit** `fix(ville): nuages découpés au pixel derrière les toits du fond (plus de rectangles)`.

### Task 1b: Le tapis secoué à la fenêtre disparaît (bogue signalé le 2026-10-24)

Constat (capture de l'utilisateur, lucarne d'un toit mansardé) : un habitant penché bat son tapis ; pendant l'animation le
tapis disparaît. Code : `src/content/window-life.tsx` (accessoires tenus `held`, `OUTSIDE_HELD`, `TWO_HANDS`, lignes
≈ 1245-1286 : `clip-path` = `pageClip`, `display` selon `pose.props`), `src/content/window-life-art.tsx` `HeldProp` 'rug'
(tapis de 4,2 px qui pend SOUS les mains), poses `shake-*` (`core/library/figure/skeleton.ts`, `window-choreo.ts`).
Pistes à vérifier (superpowers:systematic-debugging, sans corriger avant d'avoir la cause) : le tapis, qui pend sous l'appui,
est coupé par le `<clipPath>` rectangulaire de la vitre ou du cadre du penché (surtout une lucarne, dont le cadre est court) ;
ou bien une phase de la chorégraphie `shake` n'a pas `rug` dans `pose.props` (le nœud passe à `display="none"`).

**Files:** `src/content/window-life.tsx`, éventuellement `window-choreo.ts` ; Test `tests/content/window-life.test.tsx`.

- [ ] Reproduire dans un test jsdom : logement avec une activité `shake` à une lucarne et à une fenêtre ordinaire ; à chaque
  pas de 0,25 s pendant toute l'activité, le nœud `[data-wl-held="rug"]` est `display="inline"` et son `clip-path` (s'il en
  a un) contient la boîte du tapis (main ± 1,6 px en x, main → main + 5 px en y).
- [ ] Échec constaté, cause écrite dans le commit, correction minimale (le tapis tenu dehors n'est pas coupé par le cadre de
  la fenêtre : il est par-dessus la façade, comme la cigarette et l'arrosoir), vert
  (`npm run test:famille -- scene-ville`), commit `fix(ville): le tapis secoué à la fenêtre ne disparaît plus`.

### Task 2: Calendrier des parterres et des feuilles mortes

**Files:** Modify `src/core/library/paint/fond-time.ts` ; Test `tests/core/library/paint/paint-city-fond.test.ts`
(nouveau `describe('calendrier de la rue')`).

**Interfaces — Produces:**
- `export type BedState = { kind: Season | 'bare'; bloom: number; faded: number; shoots?: number }`
- `export function bedState(D: Pick<FondMoment, 'doy'>): BedState` — port exact de `01-outils.js` (bornes 73/151/156/279/283/335/340).
- `export function leavesOnGround(D: Pick<FondMoment, 'y' | 'month' | 'day'>, T: number, seed: number): number` — port exact
  (30 jours en arrière, balayage `fondRng(seed, 'balayage', date)() < 0.35` à 7 h 30).
- `export function sweptKey(D, T, seed): string` — `'b'` si un balayage a eu lieu aujourd'hui avant T, sinon `''` (pour la clé
  des tranches).

- [ ] Tests : `bedState` aux jours 80 (spring, shoots > 0), 120 (spring, bloom 1), 153 (bare), 200 (summer), 281 (bare),
  300 (autumn), 337 (bare), 10 (winter) ; `leavesOnGround` = 0 en juillet, > 0 le 10 novembre pour au moins une graine sur 1..20,
  `0` à 7 h 31 un jour de balayage et `> 0` à 7 h 29 le même jour si des feuilles tombaient ; déterminisme.
- [ ] Échec, implémentation, vert (`npx vitest run tests/core/library/paint/paint-city-fond.test.ts`), commit
  `feat(ville): calendrier des parterres et des feuilles mortes de la rue`.

### Task 3: Plan de la verdure de la rue (`streetVerdure`)

**Files:** Create `src/core/library/paint/rue-verte-plan.ts` ; Modify `src/core/library/paint/city-plan.ts` (champ `rue`
dans `CityPaintPlan`, calculé dans `cityPaintPlan` APRÈS `trees`, `furniture` et `doors`, sans changer leur tirage) ;
Test `tests/core/library/paint/paint-city-rue.test.ts` (famille scene-ville : `paint/paint-city-*` déjà couvert).

**Interfaces — Produces:**
```ts
export type RueSpecies = 'platane' | 'tilleul' | 'marronnier' | 'cerisier';
export type RuePit = { kind: 'pit'; x: number; x0: number; x1: number; y: number; empty: boolean; young: boolean; species: RueSpecies; h: number; r: number; lean: number; flowers: boolean; flowerSeed: number };
export type RueBox = { kind: 'bac' | 'parterre'; x0: number; x1: number; y: number; w: number; h: number; tall?: boolean; hedge?: boolean; flowerSeed: number };
export type RueClimber = { kind: 'grimpante'; x: number; top: number; bottom: number; plant: 'glycine' | 'vigne'; flowerSeed: number };
export type RuePots = { kind: 'pots'; x: number; both: boolean; flowerSeed: number };
export type RueGrass = { kind: 'herbe'; x: number; y: number; n: number };
export type RueItem = RuePit | RueBox | RueClimber | RuePots | RueGrass;
export function streetVerdure(plan: Omit<CityPaintPlan, 'rue'>, width: number): RueItem[];
```
Port de `03b-rue-verte.js` `streetVerdure` : lampadaires de `lampsFor` (même fonction que la maquette : `grep -rn "lampsFor" src`),
tirages `fondRng(seed, 'rue-arbres' | 'rue-bacs' | 'rue-grimpantes' | 'rue-pots' | 'rue-herbe')`, pas des arbres 70-110 px
(décision du 2026-10-20 : `x += 70 + rng() * 40`), dimensions × `plan.unit`.

- [ ] Tests (graines 1, 7, 42 × largeurs 720, 1 440, 2 880) :
  - déterminisme (deux appels égaux) ;
  - aucune fosse à moins de 6 px (+2) d'une entrée (`plan.doors`), à moins de 9 px d'un lampadaire, chevauchant un arbre du
    plan (± r + 6) ou un mobilier (± 3) ; les 8 px de bout de chaque local libres ;
  - toutes les fosses entre `curb − 5` et `curb` ; bacs, parterres et pots entre `ground` et `ground + 3,5` → couloir
    `[doorY, walkY]` vide (lire `doorY`/`walkY` dans les métriques du plan) ;
  - deux fosses consécutives séparées de 56 à 124 px (70-110 ± 7 de décalage d'essai) ;
  - aucun élément hors `[0, width]` ;
  - `trees`, `furniture`, `doors`, `buildings` du plan identiques à ceux d'avant la tâche (empreinte JSON sur la graine 7
    calculée avant modification et collée dans le test).
- [ ] Échec, implémentation, vert, commit `feat(ville): plan de la verdure de la rue (fosses, bacs, parterres, grimpantes)`.

### Task 4: Peinture de la verdure fixe dans les tranches

**Files:** Create `src/core/library/paint/rue-verte-painter.ts` ; Modify `src/core/library/paint/city-painter.ts`
(`tileItems` + `rue`, `tileKey`/`momentKey`, `paintCityTile`, `PAINT_VERSION` 12 → 13), `src/core/library/paint/hill-trees.ts`
(options de la rue) ; Test `tests/core/library/paint/paint-city-rue.test.ts`, `tests/core/library/paint/paint-city-painter.test.ts`.

**Interfaces:**
- Consumes: `RueItem` (Task 3), `bedState`, `leavesOnGround`, `sweptKey` (Task 2), `foliageOf`, `bloomOf`.
- Produces:
  - `export function paintRueVerdure(ctx: PaintCtx, plan: CityPaintPlan, items: readonly RueItem[], D: FondMoment, x0: number, x1: number): void`
    — feuilles mortes, herbe, pots, bacs, parterres, grimpantes, fosses (grille, fleurs, flaque si pluie, ombre portée du
    fût). **Pas les arbres** (calque Task 6).
  - `export function rueTreeModel(v: RuePit): TreeModel` — `treeModelOf('rue' + Math.round(v.x), v.species, { x: v.x, y: v.y }, v.h, v.r * 2, v.young ? 3 : 4, v.r * (v.young ? 0.42 : 0.3), v.young ? 20 : 60)` avec un fût `v.young ? 0.7 : 1.3 + v.r * 0.07` (ajouter le paramètre `trunkW` à `treeModelOf`).
  - hill-trees.ts : `paintTrunk(ctx, m, bark, hz = 0, wet = 0)` ; `paintLeaves(ctx, m, f, D, hz = 0, opts?: LeafOpts)` avec
    `type LeafOpts = { which?: number; wet?: number; part?: 'leaves' | 'shadow' | 'hi'; pale?: boolean; loose?: boolean; shiftX?: number; shiftY?: number }`
    (port des options de `03a-arbres.js` : grappes, pluie, ombre, rehauts, touffes lâches) ; `tuftState` rend aussi `loose`.
    Le rendu de la colline (appel sans `opts`) reste identique au pixel près.
- [ ] Tests :
  - `paintCityTile` sans changement pour la colline : le test d'empreinte existant de la colline (paint-hill / paint-city-fond)
    reste vert sans mise à jour de ses attendus ;
  - `tileKey` change entre le 10 novembre 7 h 29 et 7 h 31 un jour de balayage, change entre deux dates, ne change pas entre
    15 h et 15 h 10 en juillet sans pluie ; change quand `meteo.precip` passe de 0 à 0,6 (flaques) ;
  - test des 365 jours sur les fosses des graines 1, 7, 42 : `rueTreeModel(v).trunkBox` et `span` identiques chaque jour ;
  - enregistreur (`recording-ctx.ts`) : une fosse vide ne peint ni tronc ni feuilles ; aucun appel de peinture dans le
    couloir des passants.
- [ ] Échec, implémentation, vert (`npm run test:famille -- scene-ville`), commit
  `feat(ville): verdure de la rue peinte dans les tranches (calendrier réel)`.

### Task 5: Champ de vent

**Files:** Create `src/core/library/paint/fond-vent.ts` ; Test `tests/core/library/paint/paint-city-vent.test.ts`.

**Interfaces — Produces:**
- `export type Wind = { wind: number; dir: 1 | -1; wet: number; storm: boolean }` (tiré de `FondMeteo` : `windOf(meteo, storm)`).
- `export function windAt(x: number, t: number, w: Wind, width: number): number` — port de `04a-vent.js` (`gustsAt`, `gustX`) ;
  `0` si `w.wind ≤ 0.02`.
- `export const STIFF: Record<string, number>` (peuplier 1,6 ; cerisier 1,1 ; tilleul 1 ; marronnier 0,8 ; chêne 0,75 ;
  platane 0,7 ; cyprès 0,5 ; bouquet 1) ; `export function bendOf(species: string, young: boolean, wind: number, w: Wind): number`
  borné à ± 0,55 (jeune 1,8 ; pluie × (1 + 0,25 wet) ; orage × 1,3 ; × 0,09).
- `export function massAmp(m: TreeModel, k: number): number`.
- [ ] Tests : déterminisme ; `|windAt| ≤ 2,5 × wind` ; calme → 0 ; deux arbres à 40 px d'écart ne sont pas en phase (corrélation
  de `windAt` sur 60 s < 0,95) ; une rafale traverse dans le sens du vent (le maximum local avance de `50 + 60 × wind` px/s ± 20 %).
- [ ] Échec, implémentation, vert, commit `feat(ville): champ de vent (rafales qui traversent la scène)`.

### Task 6: Calque `arbres-rue` (sprites cuits, vent à 15 Hz)

**Files:** Create `src/core/library/paint/rue-sprites.ts` (cuisson pure sur un `PaintCtx`), `src/content/street-trees.tsx`
(calque) ; Modify `src/content/scene-city.tsx` (montage après `<GhibliWindows …/>`, dans `data-painted-city`) ;
Test `tests/content/street-trees.test.tsx` (famille scene-ville : ajouter `street-trees.*` à la liste `c(...)` de scene-ville
dans `tests/familles.ts`).

**Interfaces:**
- Consumes: `rueTreeModel`, `paintTrunk`, `paintBranches`, `paintLeaves` (Task 4), `windAt`, `bendOf`, `massAmp` (Task 5),
  `gradeFor` (grade.ts), `useWallClockLoop`.
- Produces:
  - `export type RueLayerName = 'shadow' | 'trunk' | 'twigs' | 'c0' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'hi' | 'pale'`
  - `export function rueSpriteBox(v: RuePit): { x: number; y: number; w: number; h: number }` (boîte fixe : envergure du modèle
    + marge `0,6 r + 6`)
  - `export function paintRueLayer(ctx: PaintCtx, v: RuePit, layer: RueLayerName, D: FondMoment): void`
  - `export function rueTreePose(v: RuePit, m: TreeModel, t: number, w: Wind): { twigShear: number; masses: { dx: number; dy: number }[]; hiAlpha: number; paleAlpha: number }`
    (port de `paintArbresRue` : rameaux 3 % de b autour de `rootY`, grappes `b × massAmp × osc`, frémissement > 0,04,
    face claire > 0,9) ; `t` ignoré et pose nulle quand `still`.
  - `<StreetTrees plan moment daylight twilight gloom dim minutes still? at? />`.
- Rendu : un `<g data-rue-arbre>` par fosse non vide, contenant dans l'ordre `shadow`, `trunk`, `twigs` (transform de
  cisaillement), `c0…c(n−1)` (translate), `hi`, `pale` (opacité) : nœuds constants pour la vie de la scène. Cuisson dans un
  canvas hors écran par (fosse, date, pluie, neige, étalonnage arrondi à 0,05 près du `daylight`), en temps mort (`idle` de
  paint-queue), image en blob URL ; l'ancienne image reste jusqu'à la nouvelle. Étalonnage appliqué à la cuisson (matrice
  `gradeFor` sur les pixels), pas de filtre SVG animé. Lavis chaud des lampadaires allumés (port de `paintLightsRue`) cuit dans
  `trunk`/`c*` la nuit. Écriture des attributs seulement s'ils changent (même `setIfChanged` que fond-life.tsx : le déplacer
  dans un module partagé `src/content/svg-write.ts`).
- [ ] Tests (jsdom, peintre de sprites remplacé par une fonction de test comme `setTilePainterForTests`) :
  - autant de `<g data-rue-arbre>` que de fosses non vides ; nombre de nœuds identique à 0 h, 8 h, 15 h, 23 h ;
  - `still` : aucun attribut `transform` ne change entre deux appels de la boucle ;
  - `rueTreePose` : calme → toutes les translations nulles ; vent 0,8 → `|dx|` des grappes hautes > grappes basses ; fût jamais
    transformé (pas de pose pour `trunk`).
- [ ] Échec, implémentation, vert (`npm run test:famille -- scene-ville scene-commun`), `npx tsc --noEmit`, commit
  `feat(ville): arbres de la rue au vent (calque arbres-rue, sprites cuits)`.

### Task 7: Particules et oiseaux des arbres de rue

**Files:** Modify `src/content/street-trees.tsx`, `src/core/library/paint/rue-sprites.ts` ;
Test `tests/core/library/paint/paint-city-vent.test.ts`.

**Interfaces — Produces:** `export function rueParticles(items: readonly RuePit[], D: FondMoment, t: number, w: Wind, width: number): RueParticle[]`
avec `type RueParticle = { kind: 'feuille' | 'petale' | 'goutte' | 'neige' | 'graine'; x: number; y: number; rot: number; color: string }`,
plafonds `{ feuilles: 40, petales: 30, gouttes: 24, neige: 16, graines: 20 }` ; `export function rueBird(items, D, t, dark, width): { x: number; y: number; flying: boolean; flap: number } | null`
(port de `paintParticlesArbre` / `paintBirdsArbre`). Pool fixe de `<rect>` (130) + 1 `<path>` d'oiseau, opacité 0 si inactif.
- [ ] Tests : plafonds respectés sur 600 s de vent 1 en novembre et en avril ; aucune particule hors `[−5, W + 5]` ; une
  feuille naît à la position d'une touffe lâche (distance ≤ `tf.rr`) ; oiseau absent la nuit et sous `precip > 0,4`, entre et
  sort par un bord (x < 0 ou > W au début et à la fin) ; `still` → aucune particule.
- [ ] Échec, implémentation, vert, commit `feat(ville): feuilles, pétales, gouttes et oiseaux des arbres de la rue`.

### Task 8: Mesure au banc et décision pour la colline

**Files:** Create `.superpowers/harness-fond/perf3.mjs` ; Modify `docs/superpowers/notes/2026-10-24-etat-des-lieux-fond-ville.md`.

- [ ] Script Windows : `playwright-core` (installé dans un dossier hors dépôt, `npm i playwright-core` dans le scratchpad)
  avec le Chrome installé (`channel: 'chrome'`), CDP `Emulation.setCPUThrottlingRate { rate: 4 }`, page `app.html?w=1440&T=15`
  servie par `npx vite .superpowers/harness-fond`, 10 s de trace `Performance.getMetrics` (TaskDuration) ; branche contre
  `origin/main` (worktree hors dépôt) ; vent 0,2 et 0,9 ; `pop=0` et peuplé.
- [ ] Budget : décor seul ≤ +30 ms de tâches par seconde par rapport à main (même ordre que la PR 2b). Noter les chiffres.
- [ ] Décision écrite dans l'état des lieux : si le budget le permet, **Task 9** (colline au vent par tranches de 96 px,
  240 px sur Android) part dans une PR 3b ; sinon repli validé (rue et échappée seulement) et Task 9 ne porte que l'échappée.
- [ ] Commit `docs(ville): mesure du vent des arbres au banc (PR 3)`.

### Task 9: Captures et livraison

- [ ] Captures au banc `vie=1` (graine 7, 1 440 px) : 15 avril (cerisiers), 7 juillet 15 h, 10 novembre 10 h (chute, feuilles
  au sol), 10 novembre 7 h 31 jour de balayage, 15 janvier sous la neige, pluie de septembre, nuit de juillet 23 h ;
  `docs/superpowers/maquettes/fond-ville/pr3-*.png`, comparées à `captures/` de la maquette ; envoyées à l'utilisateur au fil
  de l'eau.
- [ ] `npm run test:famille -- scene-ville scene-commun scene-meteo`, `npx tsc --noEmit`, `npm run build`.
- [ ] Mise à jour de l'état des lieux et du plan général ; PR, fusion, `npm run preprod`.
