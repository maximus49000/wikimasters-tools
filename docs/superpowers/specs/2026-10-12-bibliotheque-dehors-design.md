# Bibliothèque — « Aller dehors » : regarder la ville en entier, zoomer, suivre un passant

Date : 2026-10-12 — branche `feat/bibliotheque-dehors` — visuels faits **sans Fable** (décision de l'utilisateur pour cette étape).

## Demande

> Je pourrais « aller dehors » depuis un bouton qu'on ajoutera et visible à l'écran autant en mode plein écran que non. Le bouton permettra de rentrer aussi à l'intérieur. Je pourrais zoomer pour regarder la vie dans la ville.

Choix validés :
- **Vue dehors = la même rue, sans le mur** (approche A : on retire les murs de la pièce, pas de nouvelle vue).
- **Zoom ×1 → ×4.**
- **Suivre un passant** : toucher un personnage, la caméra le suit.

## Constat

Le décor de la scène (ville, mer, montagne, espace…) est un monde unique de `width × wallH` (largeur de la pièce × hauteur du mur, `WALL_ROWS * CELL_H` = 340), rendu une seule fois dans `RoomView` dans un `<svg data-window-views>` découpé au rectangle englobant les vitres ; les fenêtres ne sont que des trous. Les personnages sont des nœuds `[data-figure]` (et leurs groupes) que des boucles d'animation déplacent par `setAttribute('transform')` sans re-rendu React. Une pièce **sans fenêtre** ne rend pas du tout le monde (`viewBox` nul).

## Comportement

### Bouton « Sortir / Rentrer »
- Pastille ronde flottante en **haut à gauche de la scène** (`.wmt-lib-stage`, `position:absolute; top:8; left:8`), même style sombre translucide que les boutons plein écran (`rgba(0,0,0,0.65)`, 36 px, icône blanche).
- Visible **en vue normale et en plein écran**, à l'intérieur comme dehors. Masquée en mode **Aménager** (et Aménager est indisponible dehors).
- Intérieur : icône **porte entrouverte**, libellé accessible « Sortir ». Dehors : icône **maison**, « Rentrer ». `data-action="outside"` / `"inside"`.
- État non persistant : chaque ouverture de la bibliothèque commence **à l'intérieur**. Changer de pièce ramène à l'intérieur.

### Vue dehors
- On voit **tout le monde de la scène** : la pièce n'est plus dessinée (mur, décor de style, meubles, cartes, animaux, lumières, bulles, grille). Le ciel, les acteurs et la météo continuent **sans interruption** : ce sont les mêmes nœuds, simplement plus découpés par les vitres.
- Fonctionne aussi pour une pièce sans fenêtre, et pour toutes les scènes (pas seulement la ville).
- La boîte d'affichage garde la taille de la scène visible (vue normale : la largeur du panneau, hauteur actuelle de la pièce ; plein écran : tout l'écran). Le défilement horizontal de la pièce est remplacé par la caméra.

### Caméra
- `zoom = 1` : la hauteur du monde (`wallH`) remplit la hauteur de la boîte. `zoom` borné à **[1, 4]**.
- Si le monde est plus étroit que la boîte à zoom 1 (cas rare : le monde fait au moins 720 × 340), il est centré horizontalement, le fond du panneau visible de part et d'autre ; pas d'agrandissement forcé.
- Gestes :
  - **glisser** (un doigt / souris) : déplacer ;
  - **pincer** (deux doigts) : zoomer autour du point médian ;
  - **molette** (PC) : zoomer autour du curseur (facteur 1,15 par cran) ;
  - **double appui** : ×1 ↔ ×2,5 autour du point touché (animé 300 ms).
- La caméra est **bornée** aux bords du monde (jamais de vide hors du décor).
- Caméra appliquée en écrivant le `viewBox` du `<svg>` racine directement (réf. DOM, pas de re-rendu React par geste).

### Entrée et sortie (transition)
- Sortir : on part de la vue actuelle de la pièce ; le mur et les meubles s'estompent (opacité 1 → 0, 400 ms) pendant que la caméra glisse vers le cadre dehors initial = **zoom 1 centré sur la fenêtre la plus proche du centre de l'écran** (sans fenêtre : centre du monde). Durée totale 600 ms, `ease-in-out`.
- Rentrer : animation inverse, puis retour à la position de défilement d'origine de la pièce.
- Mouvement réduit (`prefers-reduced-motion`) : bascule instantanée.

### Suivre un passant
- Un **appui court** (sans glisser > 8 px) sur un personnage démarre le suivi. Le personnage visé est le `[data-figure]` **visible** dont la boîte écran contient le point touché, sinon le plus proche à moins de 24 px ; parmi plusieurs, le plus en avant (dernier dans l'ordre du document). Couvre passants, habitants, clients, employés, conducteurs, figurants d'événements.
- Pendant le suivi : à chaque image, la caméra recentre en douceur sur le centre du personnage (lissage exponentiel, constante 250 ms), zoom inchangé, toujours bornée. Un **repère** (petit triangle blanc cerné de sombre, qui flotte doucement) est dessiné au-dessus de sa tête, dans le repère du monde.
- Arrêt du suivi : glisser, pincer, toucher le vide, ou Rentrer.
- Le personnage entre dans une boutique : on continue (il reste visible derrière la vitrine). Il **disparaît** (nœud caché ou retiré, boîte vide) pendant plus de 1 s : le suivi s'arrête, la caméra reste où elle est.
- Le zoom par pincement pendant le suivi l'arrête (règle simple).

## Architecture

- **`src/core/library/outside-camera.ts`** (pur, testé) : type `Camera = { x: number; y: number; zoom: number }` (x, y = coin haut-gauche dans le monde) et fonctions :
  - `viewSize(box, world, zoom)` → largeur/hauteur visibles dans le monde ;
  - `clampCamera(cam, box, world)` ; `zoomAt(cam, box, world, factor, point)` ; `pan(cam, box, world, dxPx, dyPx)` ;
  - `centerOn(cam, box, world, worldPoint)` ; `follow(cam, box, world, target, dtMs)` (lissage) ;
  - `initialCamera(box, world, windowsRects, scrollCenterX)` ; `viewBoxOf(cam, box, world)` → chaîne `viewBox`.
- **`src/content/outside/use-outside-camera.ts`** : gestes (pointer events, pincement à deux pointeurs, molette, double appui), boucle `requestAnimationFrame` active seulement en suivi ou en animation, écrit le `viewBox`.
- **`src/content/outside/pick-figure.ts`** : `pickFigure(root, clientX, clientY)` → élément `[data-figure]` visé (règles ci-dessus) ; `figureCenter(el, svg)` → point dans le repère du monde (via `getBBox` + `getCTM`).
- **`src/content/outside/FollowMarker.tsx`** : repère posé par la boucle (transform écrit directement).
- **`RoomView`** : nouvelle prop `outside?: boolean` (+ réf. du `<svg>` exposée). Dehors : le `<svg data-window-views>` couvre `0 0 width wallH` (même si aucune fenêtre), les couches de la pièce sont non rendues (après la transition), le `<svg>` racine prend `width:100%; height:100%` avec `preserveAspectRatio="xMidYMid slice"` et un viewBox piloté par la caméra. Les nœuds du monde ne sont **pas** démontés en passant dehors (même arbre React, seuls les frères changent) ; à vérifier par un test (même nœud DOM avant/après).
- **`LibraryPanel`** : état `outside`, bouton, désactive Aménager et l'élargissement auto plein écran dehors ; repasse à l'intérieur au changement de pièce ; la boîte de scène reçoit `touchAction:'none'` dehors.

## Tests
- `outside-camera` : bornes de zoom, bornage des bords, zoom autour d'un point (le point reste sous le doigt), pan, centre initial sur la fenêtre la plus proche / centre sans fenêtre, monde plus étroit que la boîte (centré), lissage du suivi qui converge.
- `pick-figure` : choisit la figure sous le point, la plus en avant, la plus proche à moins de 24 px, ignore les cachées, rien au-delà.
- `LibraryPanel` / `RoomView` : bouton visible en vue normale et plein écran, absent en Aménager ; bascule Sortir/Rentrer (libellés, `data-action`) ; dehors, pas de meubles ni de mur, monde rendu même sans fenêtre ; nœud du monde conservé à la bascule ; changement de pièce → intérieur.
- Test de geste : glisser change le viewBox ; appui sur une figure → suivi (repère présent), glisser → suivi arrêté.

## Hors périmètre
- Nouvelle vue « trottoir » ; rendu plus net des vitrines au zoom (les intérieurs de boutiques sont des images : un peu flous à ×4, accepté).
- Mémoriser la vue dehors.
- Mesures téléphone : reportées à la fin de la migration Ghibli (consigne).

## Visuels
Faits sans Fable (décision de l'utilisateur), à noter dans `docs/superpowers/notes/2026-10-11-visuels-sans-fable.md`. Maquette HTML à valider avant le code (bouton, transition, repère de suivi).
