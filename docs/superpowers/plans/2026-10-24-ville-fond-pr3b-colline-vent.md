# PR 3b — Colline au vent : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** le feuillage des arbres de la colline ondule au vent, par bandes verticales, sans toucher au SVG de la scène ; maisons,
fûts et branches restent immobiles.

**Architecture :** chaque tranche de 360 px est peinte SANS les houppiers des arbres de la colline ; à côté, pour chacun des 3
groupes d'arbres (crête, rang 0, rang 1 + échappées), deux images rognées au houppier : le **feuillage** du groupe et l'**écran**
(alpha de tout ce que la tranche peint APRÈS ce feuillage : maisons des rangs suivants, mur du fond, immeubles, rue). Un calque
`colline-vent` (UNE toile 2D dans un `<foreignObject>`, comme `street-trees.tsx` et `rain-canvas.tsx`) redessine à 15 Hz, par
groupe : le feuillage découpé en bandes de 96 px (240 px sur Android), chaque bande translatée et cisaillée par le vent local ;
puis l'écran du groupe en `destination-out` ; puis le résultat sur la toile. Étalonnage jour/nuit appliqué aux pixels du
feuillage (`gradePixels`), pas de filtre SVG animé.

**Tech Stack :** TypeScript, React, Canvas 2D, Vitest (`recordingCtx`).

**Spec :** `docs/superpowers/specs/2026-10-20-ville-fond-design.md` §3 (« Performance Android » : colline par tranches de 240 px
sur Android) ; maquette `docs/superpowers/maquettes/fond-ville/notes.md` §3 c (« Colline : les trois calques d'arbres … tranches
de 96 px cisaillées autour de la base du rang (facteur 0,9 / 1 / 1,1) ») et code de référence
`docs/superpowers/maquettes/fond-ville/src/04a-vent.js` `drawHillCanopy`, `src/03-fond-peint.js` (`part` 'trunk' | 'canopy',
calques `T0k T0c Hc H0 T1k T1c H1 T2k T2c H2`), `src/05-scene.js` l. 74-75.

## Global Constraints

- Naturel ; rien n'apparaît ni ne disparaît sur place ; jamais de saut ; saisons respectées ; le tronc ne change jamais de taille.
- Maisons, fûts, charpentières et rameaux de la colline **immobiles** ; seul le feuillage (masses, rehauts, feuilles sèches
  accrochées, neige posée sur le feuillage) bouge.
- Déplacement d'une bande : `dx` borné à ± 2 px, cisaillement `s` borné à ± 0,03 ; écart de `dx` entre deux bandes voisines
  ≤ 0,75 px à tout instant (pas de déchirure visible d'un houppier coupé par une limite de bande).
- Bandes : 96 px sur ordinateur, 240 px sur Android (`/Android/i.test(navigator.userAgent)`).
- Vent : `windAt(x, t, wind, width)` de `src/core/library/paint/fond-vent.ts` (même champ que la rue, rafales qui traversent).
- Mouvement réduit (`prefers-reduced-motion` ou `still`) et graphisme classique : tranches peintes COMPLÈTES (houppiers compris),
  aucun calque, aucune boucle — rendu identique à aujourd'hui.
- Aucune écriture dans le SVG de la scène à chaque image (leçon PR 3 : ~40 ms/image à CPU ×4).
- Images de la scène en data URL (CSP du site : pas de blob:) ; les images internes de la toile restent des canvas.
- Android d'abord : mesure sur le S26 (`.superpowers/captures-ghibli-g3b/outils/abc2.sh`, paysage plein écran, sans tap).
- Commits et PR en français, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ; tests par familles touchées
  (`npm run test:famille -- …`), une seule session de tests à la fois.

## Review Focus

1. Ordre de profondeur : une maison du rang 1 devant un arbre du rang 0 doit le rester quand le feuillage bouge (écran du groupe).
2. Découpe des nuages (`usePaintedSkyline`) : les houppiers de la crête comptent toujours dans le profil (sinon nuages devant).
3. Tranche repeinte (nouvelle clé : jour, neige, volets) : feuillage et tranche changent ensemble, sans trou ni double.
4. Bord d'une tranche de 360 px : un houppier à cheval sur deux tranches ondule d'un seul bloc dans sa bande.
5. Nuit et crépuscule : feuillage étalonné comme la tranche (pas de feuillage clair sur une colline sombre).

---

### Task 1 : peindre la colline en parties (tranche sans houppiers, feuillage par groupe, écran par groupe)

**Files :**
- Modify : `src/core/library/paint/fond-painter.ts` (`paintTreeAll`, `paintBouquetModel`, `paintVerdure`, `paintFond`)
- Modify : `src/core/library/paint/city-painter.ts` (`paintCityTile`, `PAINT_VERSION` 14 → 15)
- Test : `tests/core/library/paint/paint-city-colline-vent.test.ts` (nouveau, famille `scene-ville` via `paint-city-*`)

**Interfaces :**
- Produces :
  - `export type HillPart = 'all' | 'base' | { canopy: 0 | 1 | 2 } | { after: 0 | 1 | 2 }` (city-painter.ts).
  - `paintCityTile(ctx, plan, tile, moment = DEFAULT_MOMENT, part: HillPart = 'all'): void`.
  - `paintFond(ctx, plan, x0, x1, D, landmarks, part: HillPart = 'all')`.
  - `paintVerdure(ctx, v, hz0, D, T, part: 'all' | 'trunk' | 'canopy' = 'all')`.
  - `export function hillCanopyBox(plan: CityPaintPlan, tile: number, group: 0 | 1 | 2): { x: number; y: number; w: number; h: number } | null`
    — boîte monde (px CSS) des houppiers du groupe dont le dessin touche la tranche, élargie de 3 px de chaque côté et 2 px
    en haut/bas, rognée à la tranche en x ; `null` si le groupe n'a aucun arbre dans la tranche.
- Groupes : 0 = arbres de `it.crest` (`isTree`) ; 1 = arbres de `it.rows[0]` ; 2 = arbres de `it.rows[1]` + arbres des
  `it.escapes[].verdure` (ceux peints au rang 1, l. 870 actuelle). Les arbres de jardin des maisons (`h.trees`) ne bougent pas
  (dessinés avec la maison).
- `part` d'un arbre : `'trunk'` = `paintTrunk` + `paintBranches` coarse + fine (gui compris) ; `'canopy'` = `paintDryLeaves` +
  `paintLeaves`. Le tirage du gui (`rk`) doit donner le même résultat quel que soit `part` (le tirer avant le branchement).
- Sens de `HillPart` pour la tranche :
  - `'all'` : comme aujourd'hui (le flux d'appels de dessin est **identique** à celui d'avant la PR) ;
  - `'base'` : tout, sauf la partie `'canopy'` des arbres des 3 groupes ;
  - `{ canopy: g }` : seulement la partie `'canopy'` des arbres du groupe g (rien d'autre : ni sol, ni maisons, ni ville) ;
  - `{ after: g }` : tout ce que `'base'` peint APRÈS le DERNIER élément (arbre ou autre) de la liste qui porte le groupe g
    (`it.crest`, `it.rows[0]`, `it.rows[1]` + verdure des échappées) dans l'ordre de `'all'` (maisons et rangs suivants, mur
    du fond, immeubles, rue, verdure de la rue) — sert d'écran (seul l'alpha compte). Limite acceptée : à l'intérieur d'un
    même groupe, un feuillage passe devant les fûts et les petits éléments peints après lui dans la liste (écart de 2 px
    au plus avec l'ordre exact).

- [ ] **Step 1 : tests rouges** (`recordingCtx` de `tests/core/library/paint/recording-ctx.ts`), graines 1, 7, 42 ; 1 440 px ;
  hauteur 340 ; moments : 7 juillet 15 h, 10 novembre 10 h, 15 janvier neige (`fondMoment` comme `paint-city-rue.test.ts`) :
  - `'all'` donne le même flux d'opérations qu'avant la PR (empreinte : relevez `hashString(JSON.stringify(ops))` de chaque
    tranche sur `origin/main` AVANT de modifier le code et figez-la dans le test) ;
  - le flux de `'all'` est exactement l'entrelacement de `'base'` et des trois `{ canopy: g }` : en retirant de `'all'` les
    opérations de `{canopy:0}`, `{canopy:1}`, `{canopy:2}` (sous-suites contiguës, à leur place), on obtient `'base'` ;
  - `{ after: g }` est un suffixe de `'base'`, et `{after:2}` ⊂ `{after:1}` ⊂ `{after:0}` (suffixes de plus en plus longs) ;
  - `hillCanopyBox` contient tous les points dessinés par `{ canopy: g }` dans la tranche (boîtes des `arc`, `moveTo`,
    `lineTo`, `bezierCurveTo` du flux, transformées) et vaut `null` quand ce flux est vide ;
  - `PAINT_VERSION === 15`.
- [ ] **Step 2 :** lancer `npx vitest run tests/core/library/paint/paint-city-colline-vent.test.ts` → échec attendu.
- [ ] **Step 3 :** implémenter (un seul parcours, un drapeau par élément ; pas de second peintre recopié).
- [ ] **Step 4 :** vert ; puis `npm run test:famille -- scene-ville` (les empreintes de tranches existantes changent seulement
  par `PAINT_VERSION` ; si une autre empreinte bouge, c'est un bogue).
- [ ] **Step 5 :** commit `feat(ville): colline peinte en parties (tranche sans houppiers, feuillage et écran par groupe)`.

### Task 2 : mouvement des bandes de colline (pur)

**Files :**
- Create : `src/core/library/paint/hill-wind.ts`
- Test : `tests/core/library/paint/paint-city-colline-vent.test.ts` (même fichier, nouveau `describe`)

**Interfaces :**
- Consumes : `windAt`, `Wind` (`fond-vent.ts`), `HILL_ROWS`, `hillCrestY` (`city-plan.ts`).
- Produces :
  - `export const HILL_SLICE_DESKTOP = 96; export const HILL_SLICE_ANDROID = 240;`
  - `export const HILL_FACTOR = [0.9, 1, 1.1] as const;` (crête, rang 0, rang 1)
  - `export type SliceMove = { x0: number; x1: number; dx: number; s: number; pivot: number };`
  - `export function hillSlices(plan: CityPaintPlan, group: 0 | 1 | 2, slice: number, t: number, w: Wind): SliceMove[]` —
    bandes [x0, x1) couvrant [0, largeur) ; `pivot` = pied du rang (`plan.height * HILL_ROWS[g-1].y` pour g = 1, 2 ; pour la
    crête : `hillCrestY(plan, centre de la bande)`) ; `dx = clamp(windAt(cx) × facteur × 1,1 × osc, ±2)`,
    `s = clamp(windAt(cx) × facteur × 0,015, ±0,03)`, `osc = 0,75 + 0,25 sin(2,9 t + 0,01 cx)` (phase spatiale 0,01 au lieu
    de 0,05 de la maquette : continuité entre bandes).
- [ ] **Step 1 : tests rouges** :
  - bandes contiguës, première à 0, dernière à la largeur, largeur `slice` sauf la dernière ;
  - bornes : sur une grille t ∈ [0, 600 s] pas de 0,25 s, vent 0 / 0,5 / 1 / orage (`windOf`), toutes graines 1, 7, 42 :
    `|dx| ≤ 2`, `|s| ≤ 0,03`, et `|dx(i) − dx(i+1)| ≤ 0,75` pour deux bandes voisines (96 et 240 px) ;
  - vent nul (`CALM`) → `dx = 0`, `s = 0` partout ;
  - pas de saut dans le temps : `|dx(t + 1/15) − dx(t)| ≤ 0,5` sur la même grille.
- [ ] **Step 2-4 :** rouge, implémentation, vert.
- [ ] **Step 5 :** commit `feat(ville): mouvement des bandes de la colline au vent (pur)`.

### Task 3 : tranches en parties et calque `colline-vent`

**Contexte nouveau (PR #359, fusionnée dans la branche) :** les tranches ne sont plus des `<image>` sous un filtre SVG ; elles
sont dessinées par `PaintedCanvas` (`src/content/painted-canvas.tsx`) sur une toile dans un `<foreignObject>`, étalonnage
appliqué aux pixels (`gradeKey`, `gradePixels`, arrondi au vingtième). Le calque de la colline suit EXACTEMENT ce modèle.

**Files :**
- Modify : `src/content/painted-city.ts` (peintre de tranche, cache, couches de la colline publiées avec l'image affichée)
- Create : `src/content/hill-wind-layer.tsx`
- Modify : `src/content/scene-city.tsx` (calque juste après la `PaintedCanvas` des tranches, avant `FondLife` ; prêt de la
  ville peinte = tranches ET toile des tranches ET calque de la colline, comme les arbres de la rue)
- Test : `tests/content/hill-wind-layer.test.tsx` (nouveau ; motif ajouté à la famille `scene-ville` dans `tests/familles.ts`)

**Interfaces :**
- Consumes : `paintCityTile(…, part)`, `hillCanopyBox` (Task 1) ; `hillSlices`, `HILL_SLICE_*` (Task 2) ; `gradeKey`, le cache
  décodé / étalonné et le pilote de test de `painted-canvas.tsx` ; `gradePixels` ; `useWallClockLoop` ; `windOf` ; le modèle de
  `street-trees.tsx` (remesure au zoom toutes les 30 images, mouvement réduit, `data-*` de diagnostic, tampons rendus au démontage).
- Produces :
  - `export type HillLayer = { group: 0 | 1 | 2; box: { x: number; y: number; w: number; h: number }; canopy: string; screen: string };`
    (data URL PNG, comme les tranches ; décodées et étalonnées par le cache de `painted-canvas.tsx`).
  - `PaintedImage` gagne `hill?: HillLayer[]` ; `PaintedTile` gagne `hill: HillLayer[]` (vide sans vent / mouvement réduit).
  - `export function hillWindEnabled(): boolean` (faux si mouvement réduit, `still`, ou sans canvas).
  - `HillWindLayer({ plan, tiles, moment, daylight, twilight, gloom, onReady }): ReactElement | null`.
- Règles :
  - Clé de tranche : `tileKey` + `|v` quand `hillWindEnabled()`.
  - Peintre avec vent : tranche = `'base'` ; pour chaque groupe dont le flux `{canopy: g}` dessine quelque chose (relecture de
    la tâche 1 : en hiver un groupe nu n'a rien à dessiner → aucune couche), deux images rognées à `hillCanopyBox`, à la
    résolution de la tranche : `{canopy: g}` et `{after: g}` ; **profil** des nuages calculé APRÈS avoir dessiné les feuillages
    sur le canvas de la tranche (le `toDataURL` de la tranche est pris avant) : la crête compte dans la découpe.
  - Cache : les couches suivent la tranche (même clé, même éviction) ; `usePaintedCity` renvoie les couches de l'image
    AFFICHÉE (celles de l'ancienne tant que la nouvelle n'est pas prête).
  - Calque : UNE toile couvrant [0, largeur] × [haut des boîtes, bas des boîtes] ; à 15 Hz, pour g = 0, 1, 2 : toile de
    travail du groupe effacée, bandes dessinées (clip `x0 − 6 … x1 + 6`, transformation `(1, 0, s, 1, −s·pivot + dx, 0)`)
    depuis les feuillages ÉTALONNÉS (même `gradeKey` que les tranches) des tranches qui touchent la bande, puis les écrans du
    groupe en `destination-out`, puis la toile de travail sur la toile visible. Pas de redessin si toutes les bandes gardent
    `dx`, `s` au centième et que l'étalonnage et les couches n'ont pas changé. Préparation (décodage, étalonnage) hors écran,
    jamais une toile à moitié vide ; tampons rendus au démontage.
  - `onReady(true)` quand toutes les couches de la liste sont dessinées ; la ville peinte attend ce signal (sinon des tranches
    sans houppiers seraient montrées sans leur feuillage).
  - Mouvement réduit / sans canvas : `null` et tranches complètes ('all') : rien ne manque.
- [ ] **Step 1 : tests rouges** (jsdom, peintre de test via `setTilePainterForTests`, pilote de toile de test comme
  `tests/content/painted-canvas.test.tsx`) :
  - avec vent, clé `|v` et couches reçues ; sans (mouvement réduit), clé sans `|v`, `hill` vide, calque `null` ;
  - groupe sans feuillage (hiver) : aucune couche pour ce groupe ;
  - le calque est après la toile des tranches et avant `vie-fond` dans `scene-city` ;
  - tranche repeinte : le calque garde les couches de l'ancienne image jusqu'à la nouvelle ;
  - la ville peinte n'est prête qu'après `onReady(true)` du calque ;
  - aucune écriture d'attribut dans le SVG de la scène pendant 30 images de boucle (MutationObserver sur le `<svg>`) ;
  - par vent calme, aucune image redessinée après la première.
- [ ] **Step 2-4 :** rouge, implémentation, vert ; `npm run test:famille -- scene-ville scene-meteo`.
- [ ] **Step 5 :** commit `feat(ville): la colline ondule au vent (calque colline-vent)`.

### Task 4 : captures, mesures, livraison

- [ ] Banc `.superpowers/harness-fond` (`app.html`, `wind=`, `still=1`) : captures 1 440 px graine 7 à vent 0 / 0,5 / 1, le
  10 novembre 10 h, le 7 juillet 15 h, une nuit de juillet 23 h, sous la neige ; séquence de 4 images à 0,2 s (vent 0,8)
  recadrée sur la colline ; `still=1` identique pixel pour pixel à `origin/main` (graine 7, 7 juillet 15 h).
- [ ] Mesure CPU ×4 (`perf3.mjs`) contre `origin/main` à vent 0 / 0,5 / 1 ; budget : ≤ +40 ms/s de tâches à vent 0,5.
- [ ] Mesure S26 (paysage plein écran, `abc2.sh`, version actuelle contre la branche) ; si le S26 perd des images (moins de
  110 images/s), repli : groupe 2 seul animé sur Android.
- [ ] `npx tsc --noEmit`, familles `scene-ville scene-meteo scene-commun`, `npm run build` ; état des lieux mis à jour ;
  PR, fusion, `npm run preprod` ; captures envoyées à l'utilisateur.
