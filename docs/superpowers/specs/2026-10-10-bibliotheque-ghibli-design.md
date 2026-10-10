# Bibliothèque : graphisme Ghibli (vision G1 à G7, détail de G1)

Refonte visuelle de la vue Bibliothèque dans l'esprit des décors peints des films du studio Ghibli : gouache, cumulus modelés par la lumière, enduits, tuiles, verdure, ombres violettes, personnages au trait encré avec une ombre franche. Les maquettes validées en conversation (2026-10-10) sont la référence : rue peinte « au pinceau numérique » (touches de couleur par dizaines de milliers, grain de papier, lumière dorée en haut à gauche) et étude de personnages (jeune fille, boulanger).

Aucune image n'est extraite des films ni copiée : tout est dessiné par le code, « dans l'esprit de ».

## Décisions générales

- **Bascule globale** « Graphisme Ghibli », désactivée par défaut, réglage local de l'appareil. Elle s'applique à toutes les pièces et à toutes les villes à la fois.
- **La ville actuelle reste intacte** et sert de modèle : la version Ghibli réutilise toute la mécanique (immeubles, entrées, commerces, horaires, passants, fêtes, météo) et ne change que le dessin. Désactiver la bascule rend exactement la ville actuelle.
- **Périmètre final** : scène Ville, intérieur de la pièce, animaux (chat, chien, robot). Les cinq autres paysages (campagne, montagne, mer, espace, Terre) gardent leur dessin actuel, même bascule activée.
- **Ambiance** : ville européenne (enduits pastel, toits de tuiles, cheminées, volets, jardinières, auvents rayés, rue pavée), cohérente avec les commerces et les fêtes françaises déjà en place.
- **Échelle** : les passants gardent leur taille actuelle ; le style passe par la silhouette, le trait, les deux tons et les couleurs, avec un visage simplifié à cette taille.
- **Livraison au fil de l'eau** : un élément sans version Ghibli garde son dessin actuel ; la ville est donc mixte tant que toutes les PR ne sont pas livrées.

## Règles pour les humains (G3 et toute figure humaine ensuite)

- **En 3D** : chaque humain est un pantin 3D (squelette articulé : bassin, colonne, épaules, coudes, poignets, hanches, genoux, chevilles, cou, tête) habillé de volumes, projeté à plat et rendu au trait Ghibli en SVG (contour encré, aplat, une ombre franche du côté opposé à la lumière). Il peut être vu de face, de dos, de profil, de trois-quarts, et se tourner de façon continue (entrer dans une porte, faire la queue, regarder la rue). Jamais une silhouette unique retournée en miroir.
- **Mouvement naturel** : marche calculée en 3D (genoux qui plient, bras en opposition, rotation du bassin et des épaules, rebond du buste, tête qui accompagne). Jamais une silhouette figée qui glisse ni des jambes raides en ciseaux.
- **Entrées et sorties naturelles** (règle déjà en vigueur) : on arrive et on repart en marchant depuis un bord, une entrée ou un véhicule, jamais par un fondu sur place.
- Le visage et les cheveux sont dessinés à part et glissent selon l'orientation de la tête. Maquette animée du pantin (marche, demi-tour, vue de dos) obligatoire au début de G3, avant tout code.

## Découpage

| PR | Contenu |
|---|---|
| **G1** | Bascule, moteur de pinceau, décor fixe de la ville peint, étalonnage jour/soir/nuit, fenêtres allumées (détaillé ci-dessous) |
| G2 | Ciel vivant : texture peinte du ciel, cumulus peints qui défilent, soleil et lune, étoiles, pluie, neige (y compris la neige sur les toits), brume, éclairs |
| G3 | Humains : pantin 3D, passants, personnel, clients, foules |
| G4 | Commerces : devantures, enseignes, stores, 32 intérieurs, entrées d'immeuble |
| G5 | Véhicules, événements, fêtes (camions, cortège, scènes, stands, père Noël…) et lampadaires |
| G6 | Intérieur de la pièce : murs, sols, meubles, cadres ; la place des 8 styles de pièce sous la bascule sera décidée dans la spec de G6 |
| G7 | Animaux : chat, chien, robot |

Chaque PR a sa mini-spec, une maquette validée avant le code, son plan, sa fiche WikiHow et des captures validées par l'utilisateur avant la PR.

## G1 en détail

### Ce qui est peint

Le peintre lit exactement les mêmes données que la ville actuelle : `cityFacades` (position, largeur, hauteur étirée, fenêtres), `doorsFor`, les emplacements des commerces (`useStreetShops`), `cityMetrics`. Rien ne bouge dans la mécanique : portes, vitrines, terrasses, files, toits du père Noël et masques des toits tombent au même endroit.

- **Immeubles du fond** : tons bleutés et brumeux (perspective atmosphérique), toits simples.
- **Façades du premier plan** : enduit en touches de gouache dans la couleur de l'immeuble (palette pastel tirée de la graine), modelé de lumière venant de la gauche, coulures sous les fenêtres, salissure en pied de façade, ombre sous le toit. Selon la graine : volets, jardinières fleuries, balcon, lierre.
- **Toits** (tuiles posées rang par rang, versant gauche éclairé, cheminées, lucarnes) peints **à l'intérieur** de la hauteur de l'immeuble : le haut de la façade devient le toit, la silhouette contre le ciel reste identique.
- **Fenêtres éteintes** : cadre, verre qui reflète le ciel (dégradé + reflet en diagonale), rideaux. Positions = celles de `lamps` / `farWindows`.
- **Trottoir et rue pavée** : dalles du trottoir, bordure, pavés dont la taille grandit vers le premier plan, marquage de voie peint à la même place qu'aujourd'hui (le `data-lane-mark` SVG n'existe que dans la ville actuelle).
- **Arbres** : quelques arbres au feuillage peint par masses (sombre, moyen, clair en haut à gauche, trouées de ciel), posés seulement là où ils ne masquent ni une entrée ni une vitrine.
- **Transparent au-dessus des toits** : le ciel, le soleil, la lune, les étoiles et la météo actuels restent visibles derrière (le ciel peint arrive en G2).

Restent dessinés comme aujourd'hui en G1 : devantures et intérieurs des commerces, entrées d'immeuble, lampadaires, passants, véhicules, événements.

### Moteur de pinceau (`src/core/library/paint/`)

Fonctions pures et déterministes qui écrivent dans une interface de dessin minimale (sous-ensemble de `CanvasRenderingContext2D` : chemins, remplissage, `save`/`restore`, `clip`, transformations, dégradés). Tout tirage passe par un générateur dérivé de la graine (`mulberry32`), jamais `Math.random`.

- `dab` (touche irrégulière orientée), `wash` (zone couverte de touches avec variation de teinte), `tiles` (rangs de tuiles), `cobbles` (pavés en rangs croissants), `foliage` (masses de feuillage éclairées), `grain` (grain de papier, tiré de la graine).
- Palette et utilitaires de couleur (mélange, variation).

### Peintre de la ville (`src/core/library/paint/city-painter.ts`)

- `paintCityTile(ctx, { tile, width, height, seed, facades, doors, shops, metrics })` peint la tranche `[tile × 360, (tile + 1) × 360)` du monde, avec un débord pour les éléments à cheval (immeuble, arbre) afin que les tranches se raccordent sans couture.
- `treeSpots(...)` : emplacements des arbres, testables (jamais devant une entrée ni une vitrine).

### Calque React (`src/content/ghibli-city-layer.tsx`)

- Une image `<image>` par tranche dans le décor fixe (le groupe recopié par les fenêtres en `<use>`) : aucune repeinture par fenêtre ni par image d'animation.
- Peinture dans un canvas hors écran pendant les temps morts (`requestIdleCallback`, repli `setTimeout`), une tranche par créneau. Résolution = `devicePixelRatio` plafonné à 2. Résultat converti en URL d'objet (`toBlob`).
- Cache mémoire par clé (version du dessin, graine, hauteur, numéro de tranche) : agrandir la pièce ne peint que les nouvelles tranches. URL d'objet libérée à l'éviction (cache plafonné en nombre de tranches).
- Tant que les tranches visibles ne sont pas toutes prêtes, la ville actuelle reste affichée ; ensuite fondu d'une seconde vers la ville peinte (et dans l'autre sens à la désactivation). Sous jsdom et sans canvas : on reste sur la ville actuelle.
- Mouvement réduit : pas de fondu, bascule directe.

### Heure du jour : étalonnage

- On peint un seul dessin, de jour. L'heure est rendue par un filtre SVG (`feColorMatrix` / `feComponentTransfer`) sur les images peintes, dont les réglages dérivent de `sky.daylight` et `sky.twilight` : plus sombre et bleu la nuit, doré au lever et au coucher. Ciel très couvert (`gloom`) : légèrement désaturé et assombri. Réglages mis à jour à la minute, comme le reste du décor fixe.
- **Fenêtres allumées** : lueurs chaudes en SVG par-dessus la peinture, mêmes positions et même logique qu'aujourd'hui (`lampLit`, `gloom`, transition de 4 s, `data-lamp` / `data-far-lamp` / `data-lit` conservés), dessinées à la Ghibli (lueur douce, croisillon, rideau en contre-jour). Fenêtres du fond atténuées (`FAR_LIGHT`).
- **Risque** : coût du filtre sur Android. La première tâche du plan le mesure sur le banc (processeur ralenti ×4, pièce de 96 colonnes). Repli si trop lent : deux peintures (jour et nuit) fondues l'une dans l'autre selon `daylight`.

### Bascule

- `src/content/art-setting.ts` sur le modèle de `light-setting.ts` : clé `wmt:library-art`, valeurs `classic` / `ghibli`, défaut `classic` (valeur inconnue ou stockage inaccessible → `classic`), hook `useArtStyle()`. Aucune migration, aucun changement de l'état de la bibliothèque (reste v5).
- Bouton 🎨 dans la rangée Ciel, à côté de l'ampoule, sur l'extension et le mobile : bascule au clic, à Entrée et à Espace ; état actif visible ; étiquette accessible « Graphisme Ghibli : activé » / « désactivé ».
- En G1, seule la scène Ville réagit à la bascule.

### Tests

- Moteur : déterminisme (même graine → mêmes appels sur un faux contexte qui les enregistre ; graine différente → appels différents), bornes des touches dans la zone demandée.
- Peintre : aucune touche de toit au-dessus de `ground - h` ; arbres jamais devant une entrée ni une vitrine ; raccord des tranches (un immeuble à cheval est peint des deux côtés à l'identique) ; aucune dépendance à `Math.random`.
- Calque : ville actuelle tant que la peinture n'est pas prête (et sous jsdom), cache réutilisé quand la largeur grandit, réglages d'étalonnage selon `daylight` / `twilight` / `gloom`, fenêtres allumées avec les mêmes attributs.
- Réglage et bouton : lecture, écriture, défaut, stockage inaccessible, clavier, étiquette.

### Validation

- Banc `.superpowers/harness-ville` : paramètre `art=ghibli`. Captures à midi, au coucher du soleil, à 22 h et sous un ciel couvert, sur une pièce étroite et une pièce de 96 colonnes ; validées par l'utilisateur avant la PR.
- Mesures sur le banc (processeur ralenti ×4) : temps de peinture d'une tranche, coût du filtre d'étalonnage, mémoire du cache.

### Fiche WikiHow `bibliotheque-v27`

Trois étapes : à quoi ça sert (un décor peint à la main façon film d'animation, sur la vue Ville) ; comment c'est fait (peint une fois au pinceau numérique dans l'appareil puis teinté selon l'heure, rien n'est envoyé sur Internet, bouton 🎨 dans la rangée Ciel) ; limites (ville mixte tant que passants, commerces et véhicules ne sont pas redessinés ; la première peinture prend quelques secondes ; seule la Ville change pour l'instant).

### Livraison

PR, fusion, pré-prod (`npm run preprod`), extension reconstruite ; APK à la demande.

### Hors périmètre de G1

Ciel peint, nuages, météo, neige (G2) ; humains (G3) ; commerces et entrées (G4) ; véhicules, événements, fêtes, lampadaires (G5) ; pièce (G6) ; animaux (G7) ; cache persistant entre les sessions.
