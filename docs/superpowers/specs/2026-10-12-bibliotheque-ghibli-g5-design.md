# Bibliothèque Ghibli — G5 : mobilier de rue, lampadaires, fêtes et événements

Date : 2026-10-12. Statut : **maquette VALIDÉE par l'utilisateur** (Fable, `docs/superpowers/maquettes/g5-fetes/` : `index.html` animée, captures PNG, `pantins.js`, et `notes.md` qui donne la correspondance avec les sprites classiques et les chorégraphies). Prochaine étape : le plan d'implémentation, puis le code.

Suite de la refonte Ghibli (spec générale `2026-10-10-bibliotheque-ghibli-design.md`). Sont déjà fusionnés : G1 et G2, le décor cellulo, G3 (humains), les véhicules V1 à V5, G4a (décor des commerces), les immeubles larges et G4b (interactions dans les commerces). G5 redessine en cellulo **tout ce qui reste au dessin classique dans la scène Ville quand le graphisme Ghibli est activé**, hors pièce (G6) et animaux de la pièce (G7).

## Décisions de l'utilisateur (2026-10-12)

- **Une seule G5** : une seule maquette Fable couvre tout le périmètre. Le tout est implémenté en un seul passage et livré dans une seule PR, comme G4b.
- **Le chien du promeneur** (événement `dog-walker`) est fait en G5, avec les événements.
- Comme pour les livraisons précédentes, les visuels et les chorégraphies sont faits par Fable, et le portage reprend le code de la maquette.
- Le graphisme classique reste strictement inchangé.
- **Lumière de nuit naturelle** (validée sur la deuxième passe) : la ville est peinte deux fois (nuit bleue et version éclairée ambre), et la version éclairée est révélée par un masque à décroissance douce autour des lampadaires et des vitrines. Pas de voile ajouté, seulement un bloom serré au verre. Les acteurs reçoivent une ombre portée à l'opposé de la lampe et un liseré chaud ; sous la pluie, des colonnes de reflets apparaissent. Ce rendu remplace la lumière de `ghibli-night.tsx`.
- **Père Noël** : refait avec le vrai pantin, avec une tenue complète (barbe et moustache qui suivent la tête, fourrure, ceinture, bonnet à pompon, bottes, gants). Ces ajouts sont faits dans le moteur du pantin.
- **Concert de la Fête de la musique** : un vrai éclairage de concert le soir. Projecteurs de couleur qui balaient en rythme, brume de scène, contre-jour, public et façades éclairés par la couleur du moment. La scène reste éteinte le jour.
- **Engins du ciel** (avion, avion à banderole, hélicoptère, montgolfière, drone, cerf-volant, ballons) : volumes, assiette et balancement naturels, rotors et hélices qui tournent, brûleur à bouffées, traînée de condensation qui s'effiloche, feux à éclats la nuit.
- **Mouettes** : les mouettes figées peintes dans le décor de la colline sont retirées. Elles sont remplacées par des volées animées qui traversent le ciel de temps en temps, avec battements, planés, virages et parfois une pause sur un toit.
- **Feux du passage piéton** : chaque poteau est placé avant le passage, pour les voitures de sa voie. C'est corrigé dans l'appli, dans les deux graphismes (`lightPoleX`, commit à part).

## Reprise (pour la prochaine conversation)

- **Validation** : l'utilisateur a validé l'ensemble le 2026-10-12 (« Je valide tout »). Pour les questions ouvertes de Fable qu'il n'a pas tranchées une à une, on retient les propositions de la maquette :
  - **Chiens** : six races tirées de la graine, trois robes chacune, marche continue (pas d'arrêt pour renifler).
  - **Rennes** : galop de 0,55 s ; souffle blanc quand ils sont posés.
  - **Cheval** : corps fixe au pas, comme le classique.
  - **Lampadaire** : fonte vert-de-gris à lanterne à pans.
  - **Feux d'artifice** : couleurs et positions du classique, gerbes redessinées.
  - **Lieu de pose du père Noël** : en arrière-plan, sur une maison de la colline, comme le recommande Fable (`santa-far.png`, `santa-far-seq.png`). La maison doit recevoir la teinte de nuit : sur la maquette elle reste aux couleurs de jour, à corriger au portage.
- **Source du portage** : `notes.md` de la maquette :
  - §1 à §4 : sprites ;
  - §5 : lumière de nuit ;
  - §6 : pantin du père Noël (`Shape.santa`, cases `beard/fur/belt/buckle/glove/nose/cheek`, `SANTA_K` 0,55) ;
  - §7 : pose et `santa.ts` ;
  - §8 : concert ;
  - §9 : engins du ciel ;
  - §10 : mouettes.
- **Script de cuisson des pantins** de la maquette : il était dans le dossier temporaire de la session et n'est pas conservé. Le portage se fait dans `src/core/library/figure/`, à partir de la description de `notes.md` §6.
- **Déjà fait dans l'appli** : les feux du passage piéton sont placés avant le passage (`lightPoleX`, engine.ts).

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
