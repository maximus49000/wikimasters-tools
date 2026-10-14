# Mobilier divers — lot A : meubles au sol

Date : 2026-10-14. Suite de [meubles aux vraies proportions](2026-10-13-meubles-vraies-proportions-design.md) (PR #303).

## 1. Contexte et décisions de l'utilisateur

L'utilisateur veut enrichir la pièce de la Bibliothèque avec du mobilier divers. 26 meubles ont été dessinés de face et **validés tels quels** : maquette `docs/superpowers/maquettes/mobilier-divers/mobilier-face.html`, captures `capture-scandinave.png` (page entière) et `capture-assises.png`. Dessin Opus : **Fable n'est pas passé** (gel Fable jusqu'au 2026-10-17), reprise Fable prévue.

Découpage validé en 4 lots, chacun avec sa spec, son plan et sa PR, dans cet ordre :

| Lot | Contenu |
|---|---|
| **A — meubles au sol (cette spec)** | 9 assises, commode, guéridon, arbre à chat, 5 plantes au sol, lanterne, lampadaire arc |
| B — petits objets | vase de tulipes, vase boule et eucalyptus, bonsaï ; le guéridon (1 place) et la commode (2 places) deviennent porteurs |
| C — mur et plafond | applique, guirlande, suspension, plante suspendue ; pose **libre au plafond, sans quadrillage visible** ; lumière partant du mur ou du plafond |
| D — comportements animaux | arbre à chat complet (3 plateformes, niche, griffoir, balle), balancement du rocking chair et du fauteuil œuf, sieste au pied de la lanterne allumée |

Autres décisions :
- Les animaux gardent les règles actuelles (chat : saut ≤ 150 cm ; robot : jamais sur un meuble). Le chien monte sur **tous les canapés** (une place, deux places, méridienne) et sur le **pouf poire** et le **pouf marocain**.
- Les 3D sont faites par Opus d'après les maquettes, avec la trace « Fable n'est pas passé » (consigne de l'utilisateur : pendant le gel Fable, les visuels faits par Opus portent cette trace pour être repris).
- Rangement du tiroir de construction validé (§ 5).

## 2. Les 19 meubles du lot A

Dimensions en cm, largeur × profondeur × hauteur, vue de face (repère des modèles : x largeur, y hauteur, z profondeur depuis l'avant).

| Type (`StandingKind`) | Nom | L × P × H | Particularités du modèle |
|---|---|---|---|
| `rocking-chair` | Rocking chair | 65 × 95 × 104 | patins courbes (vus de profil), dossier à barreaux, coussin ; `seat` 1, `perch` y = 52 |
| `club-chair` | Canapé une place (chauffeuse) | 90 × 85 × 80 | accoudoirs pleins arrondis ; `seat` 1, `perch` y = 49 |
| `loveseat` | Canapé deux places | 150 × 88 × 82 | 2 coussins d'assise et de dos ; `seat` 2, `sleep` 1, `hide` 1 (sol, sous l'avant), `perch` y = 49 |
| `daybed` | Méridienne | 165 × 70 × 85 | haut accoudoir à volute à gauche, dossier descendant ; `seat` 1, `sleep` 1, `perch` y = 49 |
| `egg-chair` | Fauteuil œuf suspendu | 100 × 100 × 195 | pied en arc + socle rond, œuf en rotin, coussin ; `seat` 1, `perch` y = 70 |
| `peacock-chair` | Fauteuil paon en rotin | 90 × 65 × 140 | dossier en éventail, pied en sablier ; `seat` 1, `perch` y = 49 |
| `pouf` | Pouf marocain | 55 × 55 × 40 | rond ; `seat` 1, `perch` y = 40 |
| `beanbag` | Pouf poire | 80 × 80 × 70 | rond, creux d'assise ; `sleep` 1, `perch` y = 35 |
| `bench` | Banc à coussin | 120 × 40 × 48 | dessous praticable (`under`) ; `seat` 2, `perch` y = 48 |
| `dresser` | Commode basse | 100 × 45 × 82 | 3 tiroirs, boutons ; `perch` y = 82 (plateau) |
| `side-table` | Guéridon | 50 × 50 × 60 | rond, pied central + trépied ; `under`, `perch` y = 60 |
| `cat-tree` | Arbre à chat | 62 × 50 × 150 | poteaux sisal, niche, 3 plateformes, balle ; **lot A : seul le plateau du haut** est un `perch` (y = 150) |
| `monstera` | Monstera | 85 × 70 × 120 | grandes feuilles en cœur découpées |
| `strelitzia` | Oiseau de paradis | 60 × 60 × 170 | feuilles en palette, une fleur orange et bleue |
| `palm` | Palmier areca | 100 × 100 × 190 | panier tressé, palmes arquées |
| `cactus` | Cactus cierge | 35 × 35 × 132 | colonne et deux bras, fleur rose |
| `pampas` | Grand vase et pampas | 42 × 30 × 122 | vase haut, 5 plumets |
| `paper-lantern` | Lanterne en papier | 45 × 45 × 61 | rond ; `glow` au centre du globe |
| `arc-lamp` | Lampadaire arc | 165 × 32 × 205 | socle 32 × 32 seul au sol ; `glow` dans le globe |

Les couleurs viennent de la palette du style (`wood`, `fabric`, `warm`, `leaf`, `shade`, `metal`…), comme sur la maquette. Quelques couleurs fixes (`color`) : marbre du socle (#E7E2D8), sisal (#D8BE86), fleurs (#F08A24, #3E6FD8, #EF6F9C), plumets (#EEDFBE), balle (#E0664A).

## 3. Moteur 3D : deux ajouts

### 3.1 Socle séparé (`base`)

`Model` reçoit un champ optionnel `base?: { x: number; z: number; w: number; d: number; round?: boolean }` (cm). Quand il est présent, `baseOf` (trace au sol, `furniture-render3d.ts`) utilise ce rectangle (ou son ellipse inscrite si `round`) au lieu de `w × d`. Conséquences :
- `floorCells` / `floorOffsets` ne comptent que les cases du socle ; `footClash` (`room-grid.ts`) laisse donc le globe du lampadaire arc surplomber un fauteuil, un rocking chair ou un canapé.
- Le rectangle de dessin (`drawSize`) reste celui du modèle entier : l'arc est dessiné en entier, l'ordre de dessin (pied le plus bas devant) est inchangé.
- La carte de marche des animaux (`buildWalkMap`) bloque seulement les cases du socle.
- Seul `arc-lamp` l'utilise dans ce lot. Les autres modèles ne changent pas.

### 3.2 Nouvelles formes de feuille

`Leaf` reçoit `form?: 'lance' | 'heart' | 'paddle'` (défaut `lance`, la feuille pointue actuelle) :
- `heart` : feuille large en cœur avec 3 paires de fentes (monstera). Les fentes sont des découpes du contour, pas des traits de couleur du mur.
- `paddle` : feuille en palette allongée, à bout arrondi (oiseau de paradis).

Les palmes du palmier sont des rangées de feuilles `lance` fines le long d'une nervure courbe (fonction d'aide dans `furniture-models.ts`). L'arc du lampadaire est une suite de tiges (`rod`) le long d'une courbe de Bézier.

### 3.3 Steampunk

`STEAMPUNK_TRIM` ajoute du laiton et des rivets à `paper-lantern` (cerclages) et `arc-lamp` (bague au pied de l'arc, embout du globe), comme pour `lamp`.

## 4. Animaux : table des rôles

Les règles écrites meuble par meuble dans `pets/brain.ts` (« `p.kind === 'sofa'` », « `shelf` ou `desk` ») sont remplacées par une table de rôles (nouveau `pets/roles.ts`) :

| Rôle | Effet | Meubles |
|---|---|---|
| `catSeat` | 🐈 dort sur les places `sleep` et se perche sur les places `seat` | chair, armchair, sofa, rocking-chair, club-chair, loveseat, daybed, egg-chair, peacock-chair, pouf, beanbag, bench |
| `dogCouch` | 🐕 y monte : dort sur les places `sleep` (sinon sur les `seat`), se pose sur les `seat` | sofa, club-chair, loveseat, daybed, pouf, beanbag |
| `catTop` | 🐈 se perche à un point au hasard du plateau | shelf, desk, dresser, side-table, cat-tree |
| `catHide` | 🐈 se cache dessous (jeu et orage) | sofa, loveseat |
| `catScratch` | 🐈 fait ses griffes contre un flanc | armchair |

- Les poids actuels sont gardés : `sofa` garde son poids de perchoir 0,5 (les autres sièges 1).
- Le chien ne monte que sur un meuble `dogCouch` et sans passer par un autre meuble (règle actuelle généralisée).
- L'orage (`storm.ts`) : le chat se cache sous un meuble `catHide` (le plus proche), le chien se blottit au pied d'un `dogCouch` ou d'un mur.
- `under` (passage dessous) est ajouté à `bench` et `side-table`.
- Plantes, lanterne et lampadaire arc : obstacles (cases au sol bloquées ; pour l'arc, seulement le socle).
- Le robot ne change pas.

## 5. Tiroir de construction

`CATEGORIES` / `SUBCATEGORIES` (`furniture-catalog.ts`) :

- **Rangement** : étagère, bureau, ordinateur, commode.
- **Assises** (nouvelles sous-catégories) :
  - Chaises et fauteuils : chaise, fauteuil, rocking chair, fauteuil œuf, fauteuil paon ;
  - Canapés : canapé, chauffeuse, canapé deux places, méridienne ;
  - Poufs et bancs : pouf marocain, pouf poire, banc.
- **Pour animaux** : panier, gamelle, niche, chargeur, **arbre à chat**.
- **Déco** :
  - Plantes : plante, petite plante, monstera, oiseau de paradis, palmier, cactus, pampas ;
  - Lumières : lampadaire, petite lampe, lanterne, lampadaire arc ;
  - Sol : tapis, table basse, guéridon ;
  - Murs : fenêtre (inchangé).

Tous les meubles sont proposés dans les 8 styles. Pose, rotation (8 angles), déplacement, bulle d'actions, Avancer/Reculer : comme les meubles existants. Les vignettes viennent du moteur 3D (`furniture-thumb.tsx`).

## 6. Lumières

`isLamp` (`room-grid.ts`) devient « le modèle a un `glow` » (au lieu de la liste `lamp` / `small-lamp`) ; `lampsOf` (`light/occluders.ts`) prend déjà la source au point `glow` du modèle. `paper-lantern` et `arc-lamp` :
- s'allument et s'éteignent d'un toucher en Visiter (`lit`), comme le lampadaire ;
- éclairent la pièce et font porter des ombres aux meubles avec les mêmes portées (`LAMP_R0`, `LAMP_RMAX`) ;
- montrent un halo autour de leur abat-jour (`haloOf`).

La lanterne a une lumière plus diffuse qu'un abat-jour, mais elle utilise la même portée dans ce lot.

## 7. Guide

Dans la même PR : nouvelle fiche WikiHow « De nouveaux meubles pour votre pièce » (nouvel id, `entries.ts`) en étapes text + how + tip :
- à quoi servent les nouveaux meubles et où les trouver dans le tiroir ;
- ce que font les animaux (le chien sur les canapés et les poufs, le chat partout où il peut grimper) ;
- le lampadaire arc au-dessus d'un fauteuil, la lanterne qui s'allume ;
- limites : balancements, arbre à chat complet et sieste près de la lanterne arrivent plus tard.

Annonce dans « Quoi de neuf » (id jamais annoncé).

## 8. Tests

Seulement les familles touchées : `scene-piece`, `scene-animaux`, `scene-lumiere`. Nouveaux fichiers rattachés à ces familles (`tests/familles.ts`).

- **Modèles** (`furniture-models.test.ts`) : chaque nouveau modèle a les dimensions du § 2 (pièces dans la boîte w × d × h), ses `perch`/`pois` dans la boîte, le bon nombre de places.
- **Socle** (`footprint.test.ts`, `room-grid*.test.ts`) : `arc-lamp` n'occupe que 2 cases à l'angle 0 (et à chaque angle, seulement les cases du socle) ; il se pose avec son globe au-dessus d'un fauteuil ; deux socles ne se chevauchent pas.
- **Feuilles** (`furniture-render3d.test.ts`) : `heart` et `paddle` produisent des polygones fermés et restent dans la boîte du modèle à tous les angles.
- **Rôles** (`pets-brain.test.ts`, `pets-roles.test.ts`) : le chien monte sur `loveseat` et `beanbag` mais pas sur `peacock-chair` ni `armchair` ; le chat se cache sous `loveseat` ; il se perche sur `dresser` ; le robot ne monte sur rien ; les anciens comportements (canapé, fauteuil, étagère, bureau) sont inchangés.
- **Lumières** (`library-lamps.test.ts`, `light-occluders.test.ts`) : `paper-lantern` et `arc-lamp` sont des lampes, s'éteignent (`lit: false`), donnent une source au bon point.
- **Tiroir** (`furniture-catalog.test.ts`) : arbre du catalogue conforme au § 5, chaque nouveau type présent une fois.

## 9. Vérification visuelle et livraison

- Banc de captures : chaque nouveau meuble à 3 angles (face, ¾, profil), en Scandinave et dans un style sombre (Néon ou Steampunk), et une pièce meublée avec animaux et lumières. Captures montrées à l'utilisateur avant la PR.
- Worktree `Wikimasters-mobilier`, branche `feat/mobilier-divers-a` depuis `origin/main`.
- PR ouverte et fusionnée, `npm run build`, pré-prod (`npm run preprod`) avec APK ; vérification sur le vrai téléphone ensuite.

## 10. Hors du lot A

- Petits objets et meubles porteurs (lot B), mur et plafond (lot C), comportements nouveaux (lot D).
- Pas de migration : nouveaux types seulement, les pièces restent en version 7.
- Reprise Fable des 19 modèles après le 17/10.
