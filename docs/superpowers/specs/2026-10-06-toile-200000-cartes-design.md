# Vue Toile : rester fluide jusqu'à 200 000 cartes

## Problème

La toile dessine un élément SVG par nœud et par trait. Mesuré dans le banc d'essai (`.superpowers/harness`, `?mode=full&cards=N`) :

| Cartes | Éléments SVG | Glissement (par image) | Zoom (par image) |
| --- | --- | --- | --- |
| 2 000 | 24 000 | 55 ms (4 ms après PR #122) | ~50 ms |
| 6 000 | 68 000 | 152 ms | 220 ms |
| 6 000 (après PR #124, traits regroupés) | 37 500 | 46 ms | 49 ms |

Le placement en forces coûte 0,6 s à 2 000 cartes et 2,5 s à 6 000 (découpé en tranches de 12 ms, donc sans figer la page). Le coût croît plus vite que linéairement : à 200 000 cartes il serait de plusieurs minutes.

## Objectif

Avec 200 000 cartes, glisser et zoomer restent fluides (budget : moins de 16 ms par image, mesuré dans le banc d'essai à 200 000 cartes synthétiques). La page ne se fige jamais.

## Décisions prises avec l'utilisateur

- Vue d'ensemble : des **regroupements**, le détail apparaît au zoom (comme une carte géographique). La toile ne montre pas chaque carte d'un coup d'œil.
- Dessin : des **points de couleur, la couleur étant celle du thème de la carte** (pas sa rareté : la maquette validée montrait que la rareté ne dit rien du sujet). Les **images ne se chargent que lorsque le zoom montre assez peu de cartes pour les gérer** ; avant, jamais.
- Cartes non placées par forces : un aspect un peu différent d'aujourd'hui est accepté.

- Maquette validée (v2, 2026-10-06) : territoires nommés par thème en vue d'ensemble, points colorés par thème avec leurs **liens visibles** (carte → articles, article → article voisin), clic sur un article = isoler ses cartes et ses liens (comme aujourd'hui).

## Conception

### 0. Thèmes (`web-themes.ts`, nouveau)

- Les articles partagés (≤ 300) sont regroupés en **thèmes** par détection de communautés (propagation d'étiquettes, déterministe) sur le graphe article ↔ article construit par les cartes qu'ils ont en commun. 8 thèmes au plus ; les plus petits sont fondus dans le voisin le plus lié.
- Chaque thème a une couleur (palette fixe de 8 teintes lisibles en clair et en sombre) et un **nom** : celui de son article le plus partagé.
- Une carte prend le thème de son article principal (le plus partagé parmi les siens) ; une carte de deux thèmes est posée entre eux.
- Les thèmes servent à : la couleur des points et des traits, les cellules des regroupements (couleur du thème dominant), les noms écrits en grand sur les territoires en vue d'ensemble, la légende.

### 1. Placement en deux niveaux (`web-layout.ts`, nouveau `web-place.ts`)

- Seuls les **articles partagés** (au plus `MAX_HUBS` = 300) et leurs liens entre eux sont placés par forces, avec `createLayout` tel qu'il est (coût borné, indépendant du nombre de cartes).
- Chaque **carte** est posée au barycentre de ses articles partagés (au milieu de ses cartes liées si elle n'en a pas), puis écartée de ses voisines par une spirale déterministe (suite de tournesol) : aucune carte ne recouvre une autre à fort zoom. Coût linéaire.
- Déterministe et stable : une carte ajoutée ne déplace aucune carte déjà placée (même principe que le placement incrémental actuel).
- En dessous de `SMALL_GRAPH` cartes (valeur à régler sur les mesures, ~1 500), on garde le placement en forces actuel : les petites Collections ne changent pas.

### 2. Index spatial (`web-index.ts`)

Grille de cellules sur les positions des cartes : retrouver les cartes d'un rectangle (l'écran) et le nœud le plus proche d'un point (toucher) sans parcourir les 200 000.

### 3. Rendu `<canvas>` à niveaux de détail (`WebCanvas.tsx`, remplace `WebGraphView`)

- Le canvas redessine à chaque image pendant un geste (`requestAnimationFrame`), à budget borné.
- **Dézoomé** : une pastille par cellule de la grille (taille : nombre de cartes ; couleur : thème dominant), le nom des thèmes sur leurs territoires, les principaux articles et les liens entre articles voisins.
- **Zoomé** : seules les cartes de l'écran sont dessinées, en points de la couleur de leur thème, avec leurs traits vers leurs articles (échantillonnés au-delà de 5 000 traits ; quand un article est mis en avant, tous ses traits sont tracés et le reste est estompé).
- **Images** : seulement quand le nombre de cartes à l'écran passe sous `IMAGE_MAX_VISIBLE` (~300) ; chargées à ce moment-là, pas avant (le service d'images actuel et `peek` sont réutilisés).
- Noms : `chooseLabels` sur les seuls nœuds visibles.

### 4. Interactions

Mêmes comportements qu'aujourd'hui : glisser, pincer, Ctrl + molette, boutons ＋ − ⤢, toucher une carte (barre 📈🃏), toucher un point (mise en avant des voisins), filtre, chemin entre deux cartes, sélection. Le toucher passe par l'index spatial. Les zones tactiles gardent 44 px.

### 5. Données (à profiler, pas de refonte prévue)

`missing` et `needsLinksLookup` sont recalculés sur toute la liste à chaque rendu ; `buildWeb`, `neighborhood` (`hub.cards.includes`) et `useFilteredCards` sont à profiler à 200 000 cartes et à corriger s'ils dépassent le budget. La lecture des liens de 200 000 cartes (200 requêtes par minute, 50 titres par requête) prend ~20 minutes : la toile doit rester utilisable pendant, et grandir sans rebattre.

## Hors périmètre

- Web Worker : le calcul reste découpé en tranches sur le fil principal (le dépôt n'a pas de Worker, et un Worker en script de contenu demande une configuration d'extension à part). À reprendre seulement si la mesure l'exige.
- WebGL : écarté (lourd à écrire et à tester, incertain dans la WebView Android). À reconsidérer seulement si le Canvas 2D ne tient pas le budget.

## Vérification

- Tests unitaires : placement des cartes (déterminisme, stabilité à l'ajout, aucun chevauchement), index spatial (rectangle, plus proche), choix du niveau de détail.
- Banc d'essai à 6 000, 50 000 et 200 000 cartes : temps par image du glissement et du zoom, temps de construction, mémoire.
- Vérification manuelle dans Chrome (recharger l'extension) et dans l'APK.
