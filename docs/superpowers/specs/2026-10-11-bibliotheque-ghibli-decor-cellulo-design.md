# Bibliothèque : décor Ghibli façon cellulo (refonte du décor fixe, avant G4)

Refonte du décor fixe de la scène Ville (livré en G1 « au pinceau numérique ») en **cellulo** : aplats francs, un ton d'ombre à bord net teinté violet-bleu, un rehaut, trait encré brun foncé, couleurs saturées, pas de grain ni de vignettage. C'est le langage des pantins (G3) et des véhicules (V1-V5) déjà livrés : le décor rejoint les personnages.

Référence validée en conversation (2026-10-11) : maquette `.superpowers/brainstorm/26489-1791744498/content/decor-cellulo.html`, captures `.superpowers/captures-maquette-cellulo/` (midi, coucher, nuit, zoom ×3). Retour de l'utilisateur sur la maquette précédente (touches de gouache) : « pas l'effet carton-pâte mais plus l'effet dessin animé », avec deux références (collage de personnages Ghibli en cellulo, ville de Kiki : colline étagée de maisons, toits terracotta, lucarnes, tour-horloge, arbres entre les maisons, mouettes).

## Décisions

- **Périmètre** : décor fixe de la Ville seulement (fond, façades, toits, rue, arbres, mobilier peint) + fenêtres allumées + lumière des lampadaires la nuit. Commerces, entrées d'immeuble, lampadaires (sprite), passants, véhicules, événements restent tels quels (G4, G5). Graphisme classique strictement inchangé.
- **Géométrie inchangée** : mêmes immeubles (`cityFacades`), mêmes fenêtres (`lamps` 5 × 7, `farWindows` 3,5 × 5), mêmes entrées, locaux et mesures de rue. Question ouverte de la maquette (abaisser les immeubles pour voir plus de colline) : **non**, la hauteur des immeubles reste celle de l'app ; la colline se voit au-dessus des immeubles bas et dans les creux de la silhouette.
- **Une seule peinture de jour**, étalonnée par le filtre existant (`gradeFor`) : les ombres portées ont une longueur fixe (lumière de milieu de journée, haut gauche). La nuit ajoute par-dessus, en SVG hors filtre : fenêtres allumées (variées) et flaques de lumière des lampadaires. Le coucher reste rendu par le filtre doré.
- **Pas de parallaxe** : le décor fixe est recopié par `<use>` dans les fenêtres et ne défile pas ; le fond est peint dans les mêmes tranches que le premier plan.
- **Mobilier peint à hauteur du mur** (bancs, boîte aux lettres, vélo appuyé, affiches, pigeons) : jamais au bord du trottoir (il serait recouvert par les passants qui marchent devant le décor) ; bornes et lanternes restent au sprite animé des lampadaires (G5).
- **Même mécanique** : `cityPaintPlan` → `paintCityTile` → tranches PNG (data URL) → `<image>` par tranche, cache, filtre d'étalonnage, `GhibliWindows`. Seul le dessin change (`PAINT_VERSION` 2, `SNOW_VERSION` 3).

## Ce qui est peint (par tranche de 360 px, coordonnées du monde)

### Fond : colline de maisons empilées

- **Colline verte** du haut de la crête jusqu'au sol : crête ondulée déterministe (somme de deux sinus de phases tirées de la graine), entre 0,16 et 0,24 de la hauteur ; vert brumeux (`mix(#5E9A50, brume, 0,35)`). Au-dessus de la crête : transparent (ciel peint de G2 derrière, cumulus découpés par la nouvelle silhouette).
- **Trois rangs de maisons** (bases à 0,27, 0,35 et 0,43 de la hauteur ; échelle 0,5 / 0,62 / 0,76 ; brume 0,3 / 0,22 / 0,14) : murs crème/rose/ocre, toits terracotta (pignon, croupe ou mansarde ardoise), ombre du voisin à bord net, lucarnes, cheminées, fenêtres bleutées, bouquets d'arbres cernés entre deux maisons. Générés une fois pour toute la largeur dans le plan (`plan.hill`), de gauche à droite : agrandir la pièce n'en change pas le début.
- **Repères** : une tour-horloge (cadran blanc, flèche ardoise, boule rouge) et deux dômes, posés sur le premier rang, une fois par bande de 1080 px (position tirée de la graine, jamais deux fois la même).
- **Mouettes** : 3 à 5 par bande de 1080 px, au-dessus de la crête (traits encrés blancs).
- **Mur du fond existant** (`far` de `cityFacades`, contigu) : devient le **quatrième rang**, à l'échelle 0,9 et brume 0,06 : murs crème, toits terracotta ou ardoise, lucarnes, cheminées, ombre du voisin, fenêtres aux positions de `farWindows` (bleu sombre, le calque `GhibliWindows` les allume la nuit).

### Façades du premier plan

Portées de la maquette, à l'identique :

- Mur en aplat ; bande d'ombre nette sur les 28 % de droite ; **ombre portée du voisin de gauche** quand il est plus haut (triangle à bord net, pente 0,55) ; liseré clair côté soleil ; bande de salissure en pied ; lierre en masses cernées (3 verts) ; trait encré du contour.
- **Toits** dans la hauteur de l'immeuble (`ROOF_H`) : pignon tuiles (versant gauche clair, droit sombre, rangs de lignes, arête claire), mansarde ardoise (lignes), **zinc** (toit plat bas de 8 px, joints verticaux) ; trait encré ; ombre nette sous le toit ; cheminée à pots ; antenne ; gouttière verticale à colliers.
- **Fenêtres** (positions inchangées) : lucarnes à fronton ; vitre bleue avec reflet diagonal blanc et ombre du linteau ; volets à lames (clair à gauche, sombre à droite) ; appui clair + ombre ; jardinière à fleurs ; rideaux ; trait encré + meneau.
- **Linge** tendu entre deux fenêtres d'un même rang ; **balcon** à barreaux avec plante en pot.
- Rez-de-chaussée (30 px) : mur seul (les entrées et devantures restent des sprites ; G4 les redessine).

### Rue

- Trottoir en aplat, joints de dalles tous les 17 px, bordure rehaut/ombre/trait encré ; chaussée en pavés à **trois tons plats** (grille globale, tirage par case : raccord des tranches), ombre nette de la bordure sur la chaussée, bandes d'usure sur les deux voies, marquage de voie à la même place qu'aujourd'hui ; plaque d'égout et grille d'avaloir (une par ~400 px, positions tirées par case) ; trottoir d'en face avec ombre nette.

### Arbres et mobilier

- **Platanes** aux emplacements actuels (`treeSpots`) : tronc à ombre et taches d'écorce, branches encrées, feuillage en trois verts cernés d'un trait épais, ombre portée nette au sol.
- **Mobilier** à hauteur du mur, hors des entrées, des locaux et des arbres : banc (tous les ~450 px), boîte aux lettres jaune (une par ~900 px), vélo appuyé (un par ~700 px), affiche sur le mur d'un immeuble sans ornement, pigeons (2-3 par tranche).

### Nuit (SVG, hors filtre d'étalonnage)

- `GhibliWindows` enrichi : teinte par fenêtre (bleu froid 12 %, jaune 38 %, orange 30 %, crème 20 %, tirée de `u`), halo débordant, rideau en contre-jour, silhouette sombre dans ~12 % des fenêtres allumées ; fenêtres du fond inchangées.
- Nouveau `GhibliNightLight` : par lampadaire (`lampsFor`), flaque de lumière à deux tons sur le trottoir et la chaussée (ellipses à bord net), halo à deux tons autour de la lanterne, six reflets en traits sur les pavés ; opacité = `dim` × (allumé selon `lampLit`), transition de 4 s comme les fenêtres.
- Étalonnage nuit retouché pour suivre la maquette (bleu-violet moins écrasé) : `NIGHT` ≈ ×0,36 / 0,41 / 0,66.

### Neige et découpe des nuages

- `roofLineY` connaît le toit zinc (plat, débord 1 px) ; `skylinePoints` inclut les cassures du zinc et **la crête de la colline** (`hillCrestY`) : les cumulus passent derrière la colline.
- `paintSnowTile` : couche sur la crête de la colline (bande blanche à bord net le long de la crête) et sur les toits des maisons du fond ; le reste inchangé (`SNOW_VERSION` 3).

## Moteur

- `city-plan.ts` : `Look` étendu (`roofKind: 'gable' | 'mansard' | 'zinc'`, `antenna`, `pipe`, `laundry`, `chimneyPots`) ; `HillHouse`, `Landmark`, `Gull`, `Furniture` ; `plan.hill`, `plan.furniture` ; `hillCrestY(plan, x)`.
- `city-painter.ts` réécrit en cellulo (plus de `washRect`, `roofTiles`, `foliage`, `glass`, `cobbles` : `strokes.ts` est supprimé, `brush.ts` garde `dab`/`cellRng` pour le ciel et la neige) ; `PaintCtx` gagne `arc`, `strokeRect`, `translate` (le faux contexte des tests les enregistre).
- Déterminisme : chaque immeuble, maison du fond, arbre, meuble et case de sol a son générateur (graine ^ sel ^ position) ; aucune dépendance à `Math.random` ; peint depuis deux tranches, un élément à cheval est identique.

## Tests

- Plan : colline et repères déterministes, inchangés au début quand la pièce grandit ; mobilier hors des entrées, locaux et troncs ; `hillCrestY` dans [0,16 ; 0,24] × hauteur.
- Peintre : rien au-dessus de la silhouette **ni de la crête** (points autorisés : rue, immeubles, colline sous la crête, mouettes au-dessus de la crête dans une bande bornée) ; immeuble identique quelle que soit la tranche ; clé stable ; pas de `Math.random`.
- Ciel : `skylinePoints` ne descend jamais sous les toits ni sous la crête.
- Nuit : `GhibliNightLight` un groupe par lampadaire, opacité 0 de jour, > 0 la nuit ; `GhibliWindows` silhouettes présentes.

## Validation

Banc `.superpowers/harness-ville` (port 5221, `art=ghibli`), captures midi / 19 h 40 (coucher) / 22 h / brume, 1080 et 3456 px, zoom ×3 sur 360 px, comparées à la maquette ; captures dans `.superpowers/captures-ghibli-cellulo/`, montrées à l'utilisateur après la livraison. Pas de mesures téléphone (campagne après G7). Livraison : PR, fusion, pré-prod, extension reconstruite.

## Hors périmètre

Commerces, enseignes, entrées (G4) ; lampadaires, fêtes (G5) ; pièce (G6) ; animaux (G7) ; parallaxe ; ombres qui tournent avec l'heure ; fiche WikiHow (globale à la fin de G7).
