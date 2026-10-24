# Ville sans clignotement (zoom et déplacement en vue rue) : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** plus de flash clair ni de ville noire quand on zoome ou déplace la vue rue sur Android.

**Constat (S26, 2026-10-24, `.superpowers/captures-flash*/`, enregistrement image par image par `Page.startScreencast`) :**
pendant un zoom de la vue rue (le viewBox du `<svg>` change à chaque image), Chrome Android (1) n'applique plus un instant
le filtre SVG d'étalonnage `feColorMatrix` du groupe des tranches (`scene-city.tsx`, `<g filter=url(#grade)>`) : la ville
apparaît non assombrie (« beau temps ») ; (2) n'a pas le temps de redessiner les grandes `<image>` peintes : la ville
disparaît (8 images noires sur ~130 par zoom), il ne reste que fenêtres, vitrines, arbres de la rue (toile) et pluie (toile).
Un prototype qui dessine les tranches sur UNE toile dans un `<foreignObject>` supprime les images noires (0 sur 130) ; le
filtre, lui, saute encore. Aucun nœud des tranches n'est modifié pendant le geste (MutationObserver) : c'est le rendu.

**Architecture :** les tranches peintes (et la neige posée, même mécanisme) sont dessinées sur une toile 2D dans un
`<foreignObject>` (comme `street-trees.tsx`, `rain-canvas.tsx`), avec l'étalonnage **appliqué aux pixels** (`gradePixels` de
`src/core/library/paint/rue-sprites.ts`, matrice `gradeFor`) au lieu du filtre SVG. La toile n'est redessinée que quand une
tranche ou l'étalonnage arrondi change ; jamais à chaque image.

**Tech Stack :** TypeScript, React, Canvas 2D, Vitest.

## Global Constraints

- Rendu identique à aujourd'hui à l'arrêt (mêmes couleurs : l'étalonnage aux pixels reproduit `feColorMatrix` en sRGB).
- Étalonnage arrondi au vingtième (`q20` de `street-trees.tsx` : même pas que les arbres de la rue, qui sont déjà cuits ainsi).
- Rien n'apparaît ni ne disparaît sur place : une tranche à repeindre garde son image jusqu'à la nouvelle (comme aujourd'hui) ;
  la ville peinte reste masquée (décor classique) tant que toutes les tranches ne sont pas DESSINÉES sur la toile (`ready`).
- Toile : résolution = celle des tranches (`min(2, devicePixelRatio)` px par unité), plafonnée à 6 Mpx (au-delà, réduite).
- Images en data URL (CSP du site : pas de blob:) ; décodage par `new Image()` + `decode()`.
- Aucune écriture dans le SVG de la scène pendant un geste.
- Graphisme classique, `classic-engine` et banc : inchangés. Sans canvas (jsdom) : la toile est rendue, rien n'est dessiné.
- Android d'abord : vérification finale au S26 (`.superpowers/captures-ghibli-g3b/outils/pan.sh` + `lum.mjs`).
- Commits/PR en français, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ; tests par familles touchées.

## Review Focus

1. Crépuscule : un changement d'arrondi ne doit pas faire clignoter la toile (l'ancienne image reste jusqu'à la nouvelle).
2. Repeinte d'une tranche (nouvelle clé) : pas de trou pendant le décodage.
3. Arbres de la rue et tranches : même arrondi d'étalonnage → même teinte (pas de décalage de couleur entre les deux).
4. Vue zoomée ×4 : netteté identique à aujourd'hui (même résolution de tranche).
5. Fenêtre soulevée (copie `<use>`) : limite connue des toiles (comme la pluie), à noter.

---

### Task 1 : toile des images peintes étalonnée aux pixels

**Files :**
- Create : `src/content/painted-canvas.tsx`
- Modify : `src/content/scene-city.tsx` (tranches : `<g filter>` + `<image>` → `PaintedCanvas`), `src/content/scene-weather.tsx`
  (neige posée : même chose, l'opacité du groupe `data-wx="snow-cover"` reste animée par la boucle météo)
- Test : `tests/content/painted-canvas.test.tsx` (famille `scene-ville` : ajouter le motif dans `tests/familles.ts`) ; adapter
  les tests existants qui cherchent `[data-painted-tile]` ou le filtre d'étalonnage.

**Interfaces :**
- Produces :
  - `export type CanvasImage = { x: number; y: number; w: number; h: number; url: string };`
  - `export function PaintedCanvas(p: { box: { x: number; y: number; w: number; h: number }; images: readonly CanvasImage[]; grade: Grade | null; onReady?: (ready: boolean) => void; tag: string }): ReactElement`
    — rend `<foreignObject data-painted-canvas={tag} …><canvas/></foreignObject>` ; `data-images` = nombre d'images
    dessinées, `data-grade` = étalonnage arrondi (diagnostic) ; `onReady(true)` quand toutes les images de la liste sont
    dessinées avec l'étalonnage courant.
  - `export function gradeKey(daylight: number, twilight: number, gloom: boolean): { key: string; grade: Grade | null }` —
    arrondi au vingtième ; `grade` null quand jour plein sans voile (identité).
- Règles :
  - Cache module : image décodée par url ; copie étalonnée par (url, clé d'étalonnage), au plus 2 générations par image.
  - Dessin : quand la liste ou la clé change, préparer HORS écran toutes les images manquantes (décodage + étalonnage),
    puis effacer et redessiner la toile d'un coup (jamais une toile à moitié vide). Échec de décodage : réessayer 3 fois,
    puis garder l'ancienne image.
  - `scene-city.tsx` : la ville peinte n'est `ready` que si les tranches sont prêtes ET la toile dessinée (comme les arbres).
- [ ] Tests rouges : rendu jsdom (pas de dessin) ; `gradeKey` (arrondi, null de jour) ; avec un faux canvas (comme
  `tests/content/street-trees.test.tsx`) : une tranche remplacée garde l'ancienne image dessinée jusqu'au décodage de la
  nouvelle ; `onReady` ne passe à vrai qu'après le dessin ; plus aucun `feColorMatrix` d'étalonnage sur les tranches ni la neige.
- [ ] Implémentation, vert ; `npm run test:famille -- scene-ville scene-meteo`.
- [ ] Commit `fix(ville): tranches peintes sur une toile étalonnée (plus de flash au zoom)`.

### Task 2 : vérification au S26 et livraison (contrôleur)

- [ ] APK de mesure, `pan.sh` (zoom molette + glissés) : aucune image < 30 de luminosité, aucun saut > 20 hors changement
  de cadrage ; captures envoyées à l'utilisateur.
- [ ] Si le ciel (nuages peints `<image>` de `scene-weather.tsx`) disparaît encore au zoom : noter et proposer la suite.
- [ ] Banc : `still=1` identique à `origin/main` à 2 niveaux de gris près (graine 7, 7 juillet 15 h et 23 h).
- [ ] `npx tsc --noEmit`, familles, `npm run build`, PR, fusion, `npm run preprod`.
