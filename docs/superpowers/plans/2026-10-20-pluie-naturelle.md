# Pluie naturelle — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** remplacer la pluie en hachures SVG par une pluie naturelle en canvas (gouttes variées, sol vivant en vue rue) et des gouttes qui perlent et coulent sur les vitres en vue pièce, intensité pilotée par la météo réelle.

**Architecture :** deux moteurs purs et déterministes (`weather/rain-drops.ts` pour la pluie dehors, `weather/glass-rain.ts` pour la vitre), un module de dessin porté de la maquette (`content/rain-art.ts`), et des composants canvas insérés par `<foreignObject>` aux bons endroits du `<svg>` existant (sol sous les acteurs, air au-dessus, vitre sous les châssis), chacun avec sa boucle `requestAnimationFrame` qui s'arrête quand il ne pleut plus.

**Tech Stack :** TypeScript, React 19 (SVG + canvas 2D), vitest (`// @vitest-environment jsdom` pour le DOM, `createRoot` + `act`), WXT. Worktree `C:\Users\maxim\Downloads\Wikimasters-vie-finitions`, branche `feat/pluie-naturelle`.

**Spec :** `docs/superpowers/specs/2026-10-20-pluie-naturelle-design.md` (fait autorité). **Valeurs :** `docs/superpowers/maquettes/pluie-naturelle/notes.md` (formules par `precip`/vent, couleurs, tailles, vitesses, budgets Android) et `maquette.html` (code à porter : `RainOutside`, `GlassRain`, `drawDrop`, `lightAt`).

## Global Constraints

- Intensité = météo réelle : `Weather.precip` (si `kind === 'rain'`), `Weather.wind`, `Weather.lightning`, `Weather.wet`, `sky.daylight` ; aucun réglage indépendant.
- Valeurs de `notes.md` §Tout découle de precip et §Valeurs ; budgets « téléphone » de `notes.md` §Android (350 gouttes dehors en basse définition, 80 éclaboussures, 40 anneaux, 220 gouttes posées et 12 coulures pour toute la pièce) ; sur grand écran, valeurs de la maquette (`round(P^1,25 × 900)`, 160 éclaboussures, 90 anneaux, `90 + 220 P` gouttes posées).
- Ordre de dessin (spec §5) : vue pièce → scène, acteurs, pluie, vitre, puis châssis, meubles, lumière de pièce, interface ; vue rue → sol mouillé sous les acteurs, pluie au-dessus.
- Pas de `ctx.filter` ni de flou CSS ; pas de `clip-path` CSS ; pas de SMIL nouveau.
- Rien n'apparaît ni ne disparaît sur place ; la boucle s'arrête (canvas vidé) quand `precip = 0` et que la vitre n'a plus de gouttes.
- Mouvement réduit : une image fixe, aucune boucle.
- Neige, nuages, brouillard, arc-en-ciel, rayons et éclair existants inchangés.
- Perfs : régression ≤ 15 % des images/s au banc (CPU ×4, 1080 px) contre `main` sous averse de nuit, vue pièce et vue rue.
- Modèles : Fable pour le dessin (tâche 4) ; Opus pour moteurs, intégration, mesures ; Sonnet pour les re-relectures. Commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (Fable : `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`).
- Commentaires en français, idiome du code voisin ; `describe/it` en français ; tests dans la famille `scene-meteo` (`tests/familles.ts`, ajouter les motifs `weather/rain-drops.*`, `weather/glass-rain.*`, `rain-*`) ; `npm run test:famille -- scene-meteo` (+ `scene-ville`, `scene-piece` si touchés). Échecs admis : `install-ghibli` « échelle », `city-life-ghibli` « ombres portées », `scene-panorama` « pluie » sous charge, `traffic-layer` 3D sous charge.
- `git stash` interdit ; une seule session lance des tests à la fois ; ne pas toucher au worktree `Wikimasters-habitants-3d` ni aux ports 5250/5251 ; banc `.superpowers/harness-ville` (non commité).

## Review Focus

1. **Pluie qui s'arrête puis reprend** : les gouttes de vitre restent et sèchent/coulent, rien ne disparaît d'un coup ; à la reprise, les gouttes dehors arrivent progressivement. → tests tâches 2 et 3.
2. **Neige** : aucune goutte, aucun canvas actif (boucle arrêtée). → test tâche 5.
3. **Pièce sans fenêtre, ou baie très large et plusieurs fenêtres** : pas de plantage ; budgets répartis au prorata, total respecté. → test tâche 3.
4. **Largeur qui change (rotation du téléphone)** : canvas redimensionné, simulation recréée sans saut visible. → test tâche 5.
5. **Scènes campagne, montagne, mer** : pluie et vitre présentes, aucun élément de bâti (bords, caniveau) ; en mer pas d'éclaboussures au sol. → test tâche 5.

---

### Task 1 : Essai de faisabilité — canvas dans le `<svg>` par `<foreignObject>` (Opus)

**Files :** branche jetable `spike/pluie-canvas` (pas de fusion) ; rapport `.superpowers/sdd/<plan>/task-1-report.md`.

- [ ] **Step 1 :** dans `WeatherLayer` (src/content/scene-weather.tsx), à la place des rects `rain-far`/`rain-near`, monter un `<foreignObject>` plein cadre contenant un `<canvas>` qui dessine 600 traits animés (rAF) ; idem un second dans le groupe sol, et un troisième dans `RoomView` à l'emplacement des `GlassDrops` (src/content/RoomView.tsx ~l.843) découpé aux vitres par `ctx.clip()`.
- [ ] **Step 2 :** mesurer au banc (CPU ×4, 1080 px, 21 h, pluie forte, médiane de 5 paires alternées contre `main`, machine au calme), vue rue et vue pièce ; vérifier visuellement l'ordre de dessin (pluie sous les châssis et meubles, sol sous les passants) et la netteté (devicePixelRatio).
- [ ] **Step 3 :** conclure dans le rapport : `<foreignObject>` retenu (coût ≤ 5 % pour le canvas vide animé) ou repli (découper le `<svg>` de `RoomView` en couches scène / pluie / pièce, avec la description précise des couches et de l'alignement). Ne rien fusionner.

### Task 2 : Moteur pur de la pluie dehors (Opus)

**Files :** Create `src/core/library/weather/rain-drops.ts` ; Test `tests/core/library/weather/rain-drops.test.ts`.

**Interfaces — Produces :**
```ts
export type RainEnv = { precip: number; wind: number; daylight: number; t: number };
export type RainBudget = { drops: number; splashes: number; ripples: number };
export const RAIN_BUDGET_PHONE: RainBudget;   // { drops: 350, splashes: 80, ripples: 40 }
export const RAIN_BUDGET_WIDE: RainBudget;    // { drops: 900, splashes: 160, ripples: 90 }
export type RainWorld = { width: number; height: number; groundTop: number; groundBottom: number; puddles: readonly { x: number; y: number; rx: number }[];
  drips: readonly { x: number; y: number; kind: 'auvent' | 'corniche' | 'toit' | 'gouttiere' }[]; gutter: { y: number; grateX: number } | null; splashGround: boolean };
export type RainSim = { /* gouttes (couche 0/1/2, x, y, v, len, a, w, tilt, big, ground), splashes, ripples, drips en chute, minuteries, rng */ };
export function createRainSim(world: RainWorld, seed: number, opts: { soft: boolean; budget: RainBudget }): RainSim;
export function stepRain(sim: RainSim, env: RainEnv, dt: number): void;
export function rainTarget(precip: number, budget: RainBudget, soft: boolean): number;  // min(round(P^1,25 × 900) × (soft ? 0,7 : 1), budget.drops)
export const gust: (t: number) => number;     // formule de la maquette
```
- Règles : porter `RainOutside.step` de la maquette (couches `LAYERS`, éclaboussures, anneaux sur `world.puddles`, gouttes des bords sur `world.drips`, orage exclu) ; la population monte/descend progressivement vers la cible (au plus +40/s, pas de coupe brutale : les gouttes en trop finissent leur chute) ; `splashGround = false` (mer) → aucune éclaboussure au sol.
- [ ] **Step 1 : tests qui échouent** : `it('nombre de gouttes : cible P^1,25 × 900 plafonnée au budget, ×0,7 en doux')` ; `it('inclinaisons dispersées : écart-type des tilts > 0,02')` ; `it('P passe à 0 : plus de nouvelles gouttes, les présentes finissent leur chute, puis 0')` (Review Focus 1) ; `it('éclaboussures et anneaux jamais au-dessus du budget')` ; `it('mer : aucune éclaboussure au sol')` ; `it('déterministe à graine égale')`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 :** commit `feat(pluie): moteur de la pluie dehors`.

### Task 3 : Moteur pur de la vitre (Opus)

**Files :** Create `src/core/library/weather/glass-rain.ts` ; Test `tests/core/library/weather/glass-rain.test.ts`.

**Interfaces — Produces :**
```ts
export type Pane = { x: number; y: number; w: number; h: number };
export type GlassBudget = { statics: number; runners: number };
export const GLASS_BUDGET_PHONE: GlassBudget;  // { statics: 220, runners: 12 } pour toute la pièce
export const GLASS_BUDGET_WIDE: GlassBudget;   // { statics: 310, runners: 30 }
export type GlassDrop = { pane: number; x: number; y: number; r: number };
export type GlassRunner = GlassDrop & { vy: number; wait: number; trail: { x: number; y: number; r: number; age: number }[] };
export type GlassSim = { panes: Pane[]; statics: GlassDrop[]; runners: GlassRunner[]; trails: GlassRunner['trail'][]; /* rng, accumulateurs */ };
export function createGlassSim(panes: readonly Pane[], seed: number, budget: GlassBudget): GlassSim;
export function stepGlass(sim: GlassSim, env: { precip: number; wind: number; t: number }, dt: number): void;
export function glassActive(sim: GlassSim): boolean;   // vrai tant qu'il reste des gouttes, coulures ou traces
```
- Règles : porter `GlassRain.step` (gouttes posées qui arrivent une à une jusqu'à `90 + 220 P`, grossissent, se décrochent à 4 px ; coulures par à-coups qui absorbent, sèment des perles, fusionnent, zigzaguent ; traces 8 s) ; la buée (masque raster) reste au renderer : le moteur fournit les traces ; budgets répartis entre vitres au prorata de leur surface ; à `P = 0` : plus aucune naissance, les gouttes posées sèchent (rétrécissent puis disparaissent en 20-60 s tirés), les coulures finissent leur course.
- [ ] **Step 1 : tests qui échouent** : `it('gouttes posées : arrivent progressivement, jamais plus que le budget de la pièce')` ; `it('les coulures descendent et absorbent les gouttes sur leur passage')` ; `it('deux coulures qui se touchent fusionnent')` ; `it('pluie arrêtée : gouttes qui sèchent progressivement, glassActive finit à faux')` (Review Focus 1) ; `it('plusieurs vitres : budget réparti au prorata, total respecté ; aucune vitre : aucun plantage')` (Review Focus 3) ; `it('déterministe à graine égale')`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 :** commit `feat(pluie): moteur des gouttes sur la vitre`.

### Task 4 : Dessin de la pluie (Fable)

**Files :** Create `src/content/rain-art.ts` ; Test `tests/content/rain-art.test.ts` (canvas simulé : nombre d'appels, aucune exception).

**Interfaces — Consumes :** `RainSim`, `RainEnv`, `RainWorld` (tâche 2) ; `GlassSim`, `Pane` (tâche 3). **Produces :**
```ts
export type RainLight = { x: number; y: number; w: number; color: string; k: number };   // lampadaire (w ≤ 10) ou vitrine
export type LightField = { lightAt(x: number, y: number): number; colorAt(x: number, y: number): string };
export function makeLightField(lights: readonly RainLight[], sky: { top: string; bottom: string }, height: number): LightField;
export function drawRainGround(ctx: CanvasRenderingContext2D, sim: RainSim, world: RainWorld, env: RainEnv, field: LightField): void;  // éclaboussures, anneaux, caniveau, reflets
export function drawRainAir(ctx: CanvasRenderingContext2D, sim: RainSim, world: RainWorld, env: RainEnv, field: LightField): void;     // gouttes 3 couches, gouttes des bords, halos, brume
export function drawGlass(ctx: CanvasRenderingContext2D, sim: GlassSim, env: { precip: number; daylight: number }, field: LightField, fog: FogMask): void;
export type FogMask = { erase(trail: readonly { x: number; y: number; r: number }[]): void; regrow(dt: number): void; draw(ctx: CanvasRenderingContext2D, pane: Pane, env: { precip: number; daylight: number }): void };
export function createFogMask(panes: readonly Pane[]): FogMask;
```
- Règles : porter `paint` de `RainOutside` (sans l'éclair, sans le flash), `drawDrop`/`paint` de `GlassRain` et `lightAt` de la maquette, couleurs et formules de `notes.md` ; la couleur réfractée vient de `field.colorAt` (pas d'échantillon raster) ; sprites des gouttes de vitre précalculés par (rayon arrondi au demi-pixel, teinte) et réutilisés ; aucune `ctx.filter`.
- [ ] **Step 1 :** tests (canvas simulé, jsdom) : `it('drawRainAir dessine autant de traits que de gouttes visibles')` ; `it('sprites de vitre réutilisés (pas de nouveau canvas après la première image)')` ; `it('aucun appel à ctx.filter')`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 :** planche de rendu (page de test sur le banc : pluie dehors jour/nuit, vitre jour/nuit) → `.superpowers/captures-pluie/planche.png` ; commit `feat(pluie): dessin de la pluie et des gouttes de vitre`.

### Task 5 : Intégration dans la scène et la pièce (Opus)

**Files :** Create `src/content/rain-canvas.tsx` ; Modify `src/content/scene-weather.tsx` (retirer `rain-far`/`rain-near` des motifs et du DOM, monter les canvas sol/air), `src/content/RoomView.tsx` (canvas vitre à la place de `GlassDrops`, lumières, fenêtre soulevée), `src/content/window-art.tsx` (`GlassDrops` supprimé si plus utilisé) ; Test `tests/content/rain-canvas.test.tsx`.

**Interfaces — Consumes :** tâches 2 à 4 ; technique retenue en tâche 1 (rapport). **Produces :**
```ts
export function RainGroundCanvas(p: { width: number; height: number; scene: SceneId; seed: number; clock: { read(nowMs: number): Weather }; sky: Sky; lights: readonly RainLight[]; world: RainWorld }): ReactElement;
export function RainAirCanvas(p: same props): ReactElement;
export function RainGlassCanvas(p: { panes: readonly Pane[]; seed: number; clock: { read(nowMs: number): Weather }; sky: Sky; lights: readonly RainLight[]; hidden: boolean }): ReactElement;
export function rainWorldFor(scene: SceneId, width: number, height: number, seed: number): RainWorld;   // Ville : bords qui gouttent (corniches et toits de cityFacades, auvents des boutiques), caniveau à la bordure, une grille tirée ; autres scènes : sans bâti ; mer : splashGround false
export function rainLightsFor(scene: SceneId, width: number, height: number, seed: number, minutes: number, daylight: number): RainLight[];  // lampadaires allumés (lampsFor/lampLit), vitrines ouvertes ; vide hors Ville
```
- Règles : une seule simulation partagée par les canvas sol et air d'une même vue ; la vue rue (`outside`) n'a pas de canvas vitre ; budget téléphone si `Math.min(screen.width, screen.height) < 600` (ou équivalent documenté), sinon grand écran ; boucle arrêtée et canvas vidés quand `precip = 0` et `!glassActive` ; neige → aucune boucle ; mouvement réduit → une image fixe ; fenêtre soulevée pendant un glissé → `hidden` ; résolution au plus `min(devicePixelRatio, 2)` ; largeur qui change → canvas redimensionné, simulation recréée à la même graine et préremplie (pas de vide visible).
- [ ] **Step 1 : tests DOM qui échouent** : `it('plus de motifs rain-far / rain-near')` ; `it('vue rue : canvas sol sous les acteurs et air au-dessus, aucun canvas vitre')` ; `it('vue pièce : canvas vitre avant les châssis et les meubles')` ; `it('neige ou temps sec : aucune boucle active')` (Review Focus 2) ; `it('mouvement réduit : aucune boucle')` ; `it('largeur qui change : redimensionnement sans remontage du composant')` (Review Focus 4) ; `it('campagne, montagne, mer : pas de bâti ; mer sans éclaboussures au sol')` (Review Focus 5) ; `it('fenêtre soulevée : pas de gouttes sur sa copie')`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** `npm run test:famille -- scene-meteo scene-ville scene-piece` PASS (hors échecs admis).
- [ ] **Step 5 :** captures au banc (pièce jour bruine, pièce nuit averse, rue nuit averse, rue jour bruine, rue nuit orage) → `.superpowers/captures-pluie/` ; commit `feat(pluie): pluie naturelle dans la scène et sur les vitres`.

### Task 6 : Mesure et captures de validation (Opus)

- [ ] **Step 1 :** mesure CPU ×4, 1080 px, médiane de 5 paires alternées contre `main` (worktree temporaire supprimé après), averse de nuit, vue rue et vue pièce ; images/s et temps de script par image. Cible ≤ 15 %. Si dépassé : décrire où part le temps (profil) dans le rapport, sans optimiser.
- [ ] **Step 2 :** captures finales comparées à la maquette, rangées dans `.superpowers/captures-pluie/` ; familles `scene-meteo scene-ville scene-piece scene-pietons` PASS ; `npx tsc --noEmit` propre.
