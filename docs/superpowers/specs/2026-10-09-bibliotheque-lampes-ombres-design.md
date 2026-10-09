# Bibliothèque — morceau 8b : lampes cliquables et ombres des meubles

Suite de `2026-10-09-bibliotheque-lumiere-design.md` (8a, fusionné : rayons des fenêtres, lumière ambiante, calque canvas basse résolution). Décisions de rendu validées sur maquettes : `docs/superpowers/notes/2026-10-09-lumiere-interieure-decisions.md`. 8c (ombres des animaux, mobiles) reste à part.

## Objectif

1. On **allume et éteint une lampe en cliquant dessus** ; une lampe allumée éclaire sol, mur et dessus des meubles proches, avec une décroissance réaliste (inverse du carré de la distance, angle d'incidence), pas un disque.
2. Les **meubles projettent des ombres** : le rayon de soleil et la lumière des lampes sont occultés par les meubles (et par les objets posés dessus), avec un bord doux.
3. Les **faces des meubles** reçoivent la lumière selon leur orientation, pas celle de la tache au sol : le dessus est éclairé si le rayon l'atteint, la face avant (vue de face) ne reçoit que la lumière ambiante.

## Hors périmètre

Ombres des animaux (8c) ; lampes de la scène Steampunk avec lueur animée ; ombres portées sur la vue extérieure ; lumière des écrans d'ordinateur ; réglage de l'intensité des lampes.

## Données

- Champ optionnel **`lit?: boolean`** sur les `Placed` de type `lamp` (debout) et `small` avec `item: 'lamp'`. Absent = **allumée** (une lampe posée sert tout de suite la nuit ; de jour par ciel clair l'adaptation de l'œil la rend négligeable). `false` = éteinte.
- **L'état reste v5, pas de migration** : champ optionnel. Un build antérieur ignore le champ (lampes toujours « allumées »). L'écriture passe par `repo.update` (la pièce notifie, le dessin de la lampe change).
- Réglage local `wmt:library-light` (8a) inchangé : Inactif coupe aussi lampes et ombres (le calque disparaît), les lampes se dessinent alors sans lueur.

## Interaction

- **Visiter** : un clic (ou toucher) sur une lampe la bascule. **L'appui long ne fait plus rien en Visiter** (il ne bascule plus vers Aménager, correctif livré avec ce morceau) : seul le bouton « Aménager » ouvre l'aménagement, et l'appui long pour déplacer ne marche qu'en Aménager.
- **Aménager** : un clic sélectionne comme pour tout meuble ; la bascule se fait aussi par un petit bouton ampoule dans la barre de la sélection (même glyphe que le réglage Lumière).
- Dessin : abat-jour clair et halo quand allumée, abat-jour sombre sans halo quand éteinte (`furniture-art-home.tsx`, version Steampunk incluse). Libellé accessible « Lampe allumée / éteinte », `aria-pressed`.

## Moteur pur (`src/core/library/light/`, testé)

Repère monde : `x` identique aux pixels de la pièce, profondeur `d` de 0 (mur) à `depthMax = wallH × ROOM_DEPTH_FACTOR`, hauteur `z` en pixels. Le sol dessiné est l'écrasement linéaire de `d` dans la bande `wallH…height` (comme `beamPatch`).

- `occluders.ts` : transforme la pièce (`Layout`) en **boîtes alignées sur les axes (AABB)**. Une boîte = `{ x0, x1, d0, d1, z0, z1, top: boolean }`. Table `PRIMITIVES` par type de meuble, en multi-primitives : table/bureau = plateau + 4 pieds fins ; lampe = pied + tige + abat-jour ; canapé = assise + dossier + accoudoirs ; plante = pot + feuillage ; étagère = montants + planches, etc. L'empreinte au sol vient de `rectOf` (colonnes) et de la rangée basse du meuble ; la profondeur d'un meuble est une constante par type (en cases), sa hauteur vient de la hauteur dessinée. Les petits objets (`small`) et la carte posée sur un bureau ajoutent leur boîte à la hauteur du dessus de leur support. Tapis : aucune boîte.
- `shadow.ts` : test rayon–AABB exact (méthode des dalles). `blocked(point, dir, boxes)` renvoie vrai si le segment du point vers la source rencontre une boîte. **Bord doux** : 5 décalages (jitter) déterministes du point source (soleil : léger écart d'azimut ; lampe : léger écart de position), le résultat est la fraction non occultée.
- `lamps.ts` : une lampe allumée est une source ponctuelle au centre de l'abat-jour `(x, d, z)`. Éclairement d'une surface = `I · max(0, cosθ) / (1 + (r/r0)²)` avec `r` la distance, `cosθ` l'angle avec la normale (sol : +z ; mur du fond : +d ; dessus de meuble : +z). Portée limitée (coupe nette à `Rmax`, lissée) pour borner le coût. Intensité modulée par `lampNeed` (8a) : adaptation de l'œil, donc quasi nulle en plein jour clair. Lampe de plafond : plus douce, sans base blanche brûlée ; lampadaire : comme validé en maquette.
- `faces.ts` : pour chaque boîte, deux faces visibles : **dessus** (éclairé par le soleil si le rayon l'atteint à travers le verre, et par les lampes) et **avant** (ambiant seulement, plus la lumière d'une lampe située devant). La carte de lumière 8a, qui peignait le rayon sur toute la projection sol, **masque** désormais cette tache sous la silhouette des faces avant des meubles (le rayon ne « traverse » plus un canapé) et l'applique aux dessus.
- `light-map.ts` (étendu) : l'entrée gagne `boxes` et `lamps` ; pour chaque pixel on détermine la surface (mur, sol, dessus ou avant d'une boîte), on additionne soleil (occulté) + lampes (occultées) + ambiant. Le calcul des **ombres du soleil** est mémorisé : il ne dépend que de (élévation, pentes par fenêtre, boîtes), donc seulement recalculé quand la clé change (déjà quantifiée en 8a), pas à chaque tick. Les lampes ne changent qu'au clic ou au déplacement d'un meuble : mêmes règles de mémoïsation, signature = boîtes + lampes allumées.

## Rendu

- Même calque unique de 8a (`LightLayer`) : l'`<image>` reste au-dessus des meubles. Les lueurs de lampe sont des teintes chaudes translucides, les ombres des teintes froides translucides, dans le même RGBA (pas de fusion additive, comme décidé en 8a).
- `LightLayer` reçoit `boxes` et `lamps` en props (calculés dans `RoomView` par un `useMemo` sur le `layout`), et le calque se redessine aussi au changement de la signature (clic sur une lampe, meuble déplacé), pas seulement au tick.
- Les règles d'arrêt de 8a (onglet caché, mouvement réduit = image figée mise à jour sur changement, réglage Inactif, scènes sans ciel terrestre) sont conservées. Dans une scène sans ciel terrestre (espace, Terre), **les lampes fonctionnent quand même** (la pièce est éclairée par elles, sans soleil).

## Tests

- Unitaires : AABB (traversée, effleurement, derrière la source), table des primitives (une table = plateau + 4 pieds, une lampe = 3 boîtes), jitter déterministe, décroissance en carré inverse, cosinus d'incidence, portée, adaptation (lampe quasi nulle de jour clair, utile à la pluie et la nuit), ombre d'un meuble qui coupe la tache au sol, face avant sans tache, dessus avec tache, mémoïsation (clé identique = pas de recalcul).
- Données : `lit` absent = allumée, `lit: false` éteinte, ancien état valide, champ inconnu sur un meuble non-lampe écarté.
- Composant : clic en Visiter bascule `lit` et `aria-pressed` ; clic en Aménager sélectionne seulement ; bouton ampoule dans la barre de sélection ; réglage Inactif = pas de lueur.
- **Vérification manuelle Chrome** à prévoir (rendu de l'ombre au sol, lisibilité des faces, bord doux, coût sur pièce de 96 colonnes avec beaucoup de meubles), puis APK à la demande.

## Écarts assumés

- Les boîtes sont des approximations de la forme dessinée (pas de courbes) ; les ombres sont celles de ces boîtes.
- La vue de face écrase la profondeur : l'ombre au sol est juste en géométrie monde mais sa lecture à l'écran dépend du facteur d'écrasement ; à ajuster à la vérification manuelle.
- Les ombres des animaux (mobiles, par image) sont en 8c ; en 8b les animaux ne projettent rien.

## Livraison

Fiche WikiHow `bibliotheque-v14` (à quoi servent les lampes et les ombres, d'où viennent les données — soleil, météo, meubles posés —, comment ça marche, limites). Méthode : subagent-driven dans le worktree `..\Wikimasters-bibliotheque`, branche `feat/bibliotheque-lampes`. PR, fusion, pré-prod, mémoire.
