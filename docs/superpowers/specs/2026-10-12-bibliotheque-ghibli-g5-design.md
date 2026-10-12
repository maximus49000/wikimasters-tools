# Bibliothèque Ghibli — G5 : mobilier de rue, lampadaires, fêtes et événements

Date : 2026-10-12. Statut : **brouillon, maquette en cours** (Fable, `docs/superpowers/maquettes/g5-fetes/`). Rien n'est codé avant la validation de la maquette par l'utilisateur.

Suite de la refonte Ghibli (spec générale `2026-10-10-bibliotheque-ghibli-design.md`). Sont déjà fusionnés : G1 et G2, le décor cellulo, G3 (humains), les véhicules V1 à V5, G4a (décor des commerces), les immeubles larges et G4b (interactions dans les commerces). G5 redessine en cellulo **tout ce qui reste au dessin classique dans la scène Ville quand le graphisme Ghibli est activé**, hors pièce (G6) et animaux de la pièce (G7).

## Décisions de l'utilisateur (2026-10-12)

- **Une seule G5** : une seule maquette Fable couvre tout le périmètre. Le tout est implémenté en un seul passage et livré dans une seule PR, comme G4b.
- **Le chien du promeneur** (événement `dog-walker`) est fait en G5, avec les événements.
- Comme pour les livraisons précédentes, les visuels et les chorégraphies sont faits par Fable, et le portage reprend le code de la maquette.
- Le graphisme classique reste strictement inchangé.

## 1. Périmètre (inventaire du 2026-10-12)

| Groupe | Éléments (sprite classique) |
|---|---|
| Lampadaires | `LampSprite` (`city-sprites.tsx`) : mât, crosse, lanterne allumée la nuit, raccordée aux flaques de `ghibli-night.tsx` |
| Circulation | feu tricolore et boîtier à bouton (`traffic-layer.tsx` `pole`), arrêt de bus (`busStop`), passage piéton (`Crosswalk`) |
| Commerces | mobilier de terrasse (table, chaise, parasol, tablier), cordon de la boîte de nuit, changement d'enseigne (enseigne et panneau portés, « À vendre », échelle), accessoires tenus (`AccessorySprite`) |
| Installations | drapeaux (lampadaire, porte), barrières, scène (plancher, structure, spots, faisceaux), éléments portés, bras et panier de la nacelle, caisses, échelles rangées, cadre du triporteur, chargement du plateau |
| Fête de la musique | fût, comptoir et auvent des stands, gobelets, comptoir et rouleau portés, instruments de scène |
| 14 juillet | cheval du cavalier, drapeaux tricolores, instruments de la fanfare, fusils, coiffes, accessoires des spectateurs |
| Réveillon | rennes (en vol et posés), harnais, traîneau, lanterne, traînée, hotte |
| Déménagement | hayon, meubles et cartons |
| Signes festifs | couronne, ballon cœur, panier, muguet, drapeau, coquelicot, serpentin, note |
| Événements | avion, hélicoptère, drone, montgolfière, avion à banderole, cerf-volant, grue, lueur d'appartement, ballons de fête, cloches de Pâques, feux d'artifice ; caisse du camion-poubelle, vélo de livraison (livreur en pantin), **chien du promeneur** |

## 2. Règles de portage

- **Géométrie et mécanique inchangées** : mêmes ancrages, tailles, positions, horaires, tirages et transitions. Seul le dessin change. Chaque sprite Ghibli occupe le cadre de son équivalent classique, et la correspondance est tenue dans `maquettes/g5-fetes/notes.md`.
- **Langage** : celui des commerces et des voitures. Aplat, ombre nette teintée de violet du côté opposé à la lumière (venue du haut à gauche), rehaut, trait encré brun. La nuit, les éléments lumineux (lanternes, feux, spots, vitres, fusées) sont peints « allumés », avec un halo à bord net hors filtre.
- **Jamais de miroir** pour ce qui a un sens de lumière, comme pour les voitures : les deux sens sont peints séparément.

## 3. Architecture (à confirmer après la maquette)

- **Éléments fixes** (lampadaires, feux et leur boîtier, arrêt de bus, marquage du passage piéton) : peints dans les tranches du décor (`paintCityTile`), comme les entrées d'immeuble. `PAINT_VERSION` est incrémenté. Les parties qui changent (lanterne allumée, couleur du feu, voyant du bouton) sont posées par-dessus en SVG hors filtre, comme les impostes allumées. Le `LampSprite` classique reste affiché tant que la tranche n'est pas prête.
- **Accessoires mobiles ou temporaires** (installations, stands, cortège, père Noël, déménagement, signes, accessoires tenus, événements) : un registre d'images `prop/prop-host.tsx`, conçu comme `car-host` et `shop-host`. Peinture à la demande sur un canvas hors écran, PNG en data URL, lumière au 1/8 de jour, plafond d'images et budget de peintures par image. Les peintres purs vivent dans `src/core/library/paint/props/` (un fichier par groupe) et utilisent les primitives `paint/shop/cel.ts`.
- **Animations** (cheval au pas, rennes au galop, chien, drapeaux, cerf-volant) : poses clés cuites chacune en image, comme les pantins. La boucle existante choisit la pose selon la distance parcourue ou le temps. Il n'y a pas d'animation SMIL nouvelle en Ghibli.
- **Feux d'artifice** : restent vectoriels, car ce sont des particules, mais sont redessinés en cellulo (gerbes à bord net, traînées encrées, couleurs saturées). Le masque derrière la silhouette des immeubles est inchangé.

## 4. Vérification

- **Tests unitaires** :
  - déterminisme de chaque peintre, vérifié sur le faux contexte enregistreur ;
  - cadres identiques aux sprites classiques ;
  - clés de cache distinctes par pose, sens et lumière ;
  - éléments fixes peints dans leur seule tranche.
- **Banc** (`.superpowers/harness-ville`, `art=ghibli`) : captures de chaque fête (14 juillet, Fête de la musique, réveillon, Pâques, Saint-Valentin, Nouvel An), de jour et de nuit, d'une installation, d'un déménagement et des événements du ciel. Comparaison avec la maquette.
- **Mesures** :
  - temps de peinture par image d'accessoire ;
  - nombre d'images en cache ;
  - ms par image à 8 h et 21 h un soir de 14 juillet, sans régression notable.
- **Captures validées par l'utilisateur** avant la PR. Ensuite, fusion et `npm run preprod`.

## 5. Hors périmètre

Intérieur de la pièce (G6) ; chat, chien et robot de la pièce (G7) ; fiche WikiHow (globale à la fin de G7) ; nouveaux éléments qui n'existent pas aujourd'hui (guirlandes de Noël, sono, décor d'Halloween).
