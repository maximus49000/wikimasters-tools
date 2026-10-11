# Bibliothèque — immeubles plus larges, jumeaux, mitoyens et baie vitrée

Date : 2026-10-12 · Maquette validée : `docs/superpowers/maquettes/batiments-larges/rue.html` (+ `rue.png`), dessinée par Fable.

## But

Des magasins plus grands dans la rue de la Ville, et pouvoir voir toute la ville (trottoir de devant + arrêt de bus) à travers une fenêtre.

## 1. Génération du premier plan par lots (`citySkyline`, scene-world.ts)

- Le rang du fond (`far`) ne change pas (même tirage par tranche de 360).
- Le premier plan n'est plus tiré par tranche : une seule suite de **lots** de gauche à droite (générateur `mulberry32(seed ^ hashString('city-lots'))`), de x = 12 jusqu'à `width + CHUNK` (même couverture qu'aujourd'hui). Plus de chevauchements aux bords de tranche.
- **Lot simple (60 %)** : un immeuble de **40 à 70 u** de large ; hauteur tirée comme aujourd'hui (40 + r·60, étirée ×1,6 dans facades.ts).
- **Lot jumeaux (40 %)** : deux tours de **26 à 44 u** chacune, séparées par un retrait de **0 à 8 u**, hauteurs écartées d'au moins 20 u (avant étirement ÷1,6 : 12,5), look (mur, toit) forcé différent ; posées sur un **socle commun** de hauteur **44 u** (`GROUND_FLOOR` 30 + 1 rangée de 14), couvrant les deux tours et le retrait. Hauteur minimale d'une tour : socle + toit + 1 rangée (72 u étirés).
- **Entre deux lots** : 45 % mitoyens (écart 0), 55 % écart de 8 à 22 u.
- Type : `Building` gagne `podium?: Podium` avec `Podium = { id: number; x: number; w: number; h: number }`, partagé (même objet) par les deux tours d'un lot jumeaux.
- Fenêtres (`lamps`, `extraFloorWindows`) : pour une tour sur socle, aucune fenêtre sous le haut du socle ; le socle reçoit sa rangée de fenêtres, centrée sur sa largeur (`podiumWindows`, générateur propre).

## 2. Boutiques et entrées

- `shopSlotsFor` et `doorsFor` itèrent sur des **lots visibles** (un simple, ou un socle de jumeaux) au lieu d'immeubles.
- Jumeaux : un seul local sur la largeur visible du socle, une seule entrée d'habitants au bord tiré (règle `doorSide` inchangée : porte du magasin à l'opposé).
- Simple : règle actuelle (local si largeur visible ≥ 38 u).
- Devanture : au-delà de 30 u de vitrine, montants verticaux réguliers (environ tous les 12 u) dans la vitre.
- Arbres et mobilier : `silhouetteTop` tient compte des socles ; `blocked` inchangé (locaux + entrées).

## 3. Dessin Ghibli du socle et des mitoyens (visuel — Fable)

- Socle : pierre claire (#EDE2C8 et teintes voisines), assises, corniche saillante (rehaut dessus, ombre nette violet-bleu dessous, trait #2A1A18), rangée de fenêtres encadrées ; les tours démarrent au-dessus de la corniche (pas de salissure de pied).
- Mitoyens : trait encré appuyé à la jonction ; l'ombre portée du voisin de gauche reste (`leftOf` trouve le voisin à écart 0).
- Le rendu de secours non peint (scene-city.tsx) dessine le socle comme un rectangle de la couleur du mur.
- Visuels faits par Opus faute de jetons Fable → trace dans `docs/superpowers/notes/2026-10-11-visuels-sans-fable.md`.

## 4. Baie vitrée

- `WINDOW_MAX` passe à `{ w: 24, h: WALL_ROWS }` (12) ; la fenêtre reste bornée par la pièce (`canHangRect`).
- Montants : vitre ≥ 120 px de large → montants verticaux environ tous les 4 colonnes (120 px), au lieu d'un seul au centre ; la barre horizontale n'est posée que pour une vitre de moins de 11 rangées.
- Une fenêtre de 12 rangées montre la scène de haut en bas : le trottoir de devant et l'arrêt de bus sont visibles (perte de `GLASS_INSET` px seulement).
- Les fenêtres existantes restent valides (bornes élargies seulement).

## 5. Hors périmètre

Pas de fiche WikiHow (décision utilisateur). Pas de changement du rang du fond, des véhicules, des passants.

## 6. Tests et validation

- Tests mis à jour : scene-world, city-facades, city-doors, city-shops-slots, paint-city-plan, room-grid / library-book (bornes de fenêtre).
- Nouveaux cas : socle partagé par deux tours ; un seul local par jumeaux ; lots mitoyens à écart 0 ; pas de chevauchement entre lots ; fenêtre 24 × 12 acceptée, 25 refusée.
- Capture de validation (rue entière + zoom jumeaux + baie vitrée) montrée à l'utilisateur ; PR fusionnée puis `npm run preprod`.
