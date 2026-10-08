# Bibliothèque — morceau 3 : mobilier et pièce agrandie

Complète `2026-10-08-bibliotheque-design.md` (vision en 7 morceaux). Validé en discussion le 2026-10-08.

## Objectif

1. Ajouter 10 meubles au sol et 2 petits objets de surface, chacun avec ses points d'intérêt (pour les animaux du morceau 6).
2. Agrandir la pièce : plus de sol (profondeur) et plus de hauteur de mur, surtout en vue verticale.

## Pièce agrandie

| | Avant | Après |
|---|---|---|
| Lignes (`ROWS`) | 12 | **18** |
| Lignes de mur (`WALL_ROWS`) | 9 | **12** |
| Lignes de sol | 3 | **6** |
| Hauteur en px (`HEIGHT`) | 340 | **510** (cases inchangées : `CELL_H` ≈ 28,3) |
| Colonnes visibles, vertical | 14 | **16** |
| Colonnes visibles, horizontal | 24 | 24 |

- **Migration** : l'état passe de `version: 1` à `version: 2`. À la lecture d'un état v1, toute ligne (`row`) de tout objet est décalée de **+3** (mur et meubles), si bien que le sol d'origine reste contre le mur et que 3 lignes de sol neuves apparaissent devant. Un état v2 est lu tel quel ; un état corrompu donne une pièce vide, comme aujourd'hui.
- Un meuble au sol doit toujours avoir sa **ligne du bas** dans le sol (règle actuelle `floor` inchangée). Le mur reste réservé à l'accroché.
- Le rapport largeur/hauteur de la vue verticale passe de 14×12 à 16×18 : plus haute, moins écrasée.

## Catalogue des nouveaux meubles

Tailles en cases (largeur × hauteur). Couche `floor` sauf le tapis (`rug`).

| Meuble | Taille | Couche | Points d'intérêt |
|---|---|---|---|
| Chaise | 2×3 | floor | `seat` (assise) |
| Canapé | 6×3 | floor | `seat` ×3, `sleep` (coussin) |
| Fauteuil | 3×3 | floor | `seat` |
| Panier | 3×2 | floor | `curl` (creux) |
| Gamelle | 2×1 | floor | `eat` (bord) |
| Niche | 4×3 | floor | `sleep` (intérieur), `enter` (entrée) |
| Plante (sol) | 2×4 | floor | — |
| Lampe sur pied | 1×5 | floor | — |
| Table basse | 4×2 | floor | — (se pose sur le tapis, devant le canapé) |
| Tapis | 6×3 | rug | — |
| Petite plante | 2×2 | surface | — |
| Petite lampe | 1×2 | surface | — |

Les points d'intérêt sont de la **donnée pure** dans `furniture-catalog.ts` : `{ type: 'seat' | 'curl' | 'eat' | 'sleep' | 'enter', dx, dy }` en cases relatives au coin haut-gauche du meuble. Aucun animal dans ce morceau.

## Superposition

- Le **tapis** est plat : il se pose sur le sol et n'occupe pas de case « meuble » ; n'importe quel meuble `floor` peut être posé par-dessus, y compris à cheval. Deux tapis ne se chevauchent pas. Le tapis se dessine **sous** tous les meubles.
- Deux meubles `floor` ne se chevauchent pas (règle actuelle).
- Les **petits objets** (petite plante, petite lampe) se posent sur une surface : dessus d'un bureau ou d'une étagère (le haut du meuble). Un meuble porteur déclare ses emplacements de surface (bureau : 4, étagère : 3 sur le dessus), comme l'étagère déclare ses niveaux. Un petit objet suit son porteur (déplacé ou retiré avec lui, confirmation si le porteur porte des objets).
- L'ordinateur reste lié à son bureau (inchangé) et occupe un emplacement de surface du bureau.

## Interface

- Le sélecteur de meubles gagne des catégories : **Rangement** (étagère, bureau, ordinateur), **Assises** (chaise, canapé, fauteuil), **Animaux** (panier, gamelle, niche), **Déco** (table basse, plantes, lampes, tapis).
- Poser, déplacer (appui long puis glisser) et retirer fonctionnent comme aujourd'hui ; un petit objet se pose en touchant le dessus de son porteur.
- Rendu SVG/CSS de face, couleurs lues dans la palette du style (Scandinave seul pour l'instant, les autres styles arrivent au morceau 4). Les maquettes des 12 objets sont validées avant le plan.

## Cas limites

- Pas de porteur libre pour un petit objet : bouton grisé avec l'explication « Il faut d'abord un bureau ou une étagère avec de la place ».
- Retrait d'un meuble qui porte des objets : ils partent avec lui.
- État v1 avec objets accrochés : décalés de +3 comme le reste, ils restent sur le mur (le mur grandit vers le bas, pas vers le haut : rien ne sort de la pièce).
- Largeur de pièce, zones de 12 colonnes, défilement : inchangés.

## Tests (Vitest)

- Migration v1 → v2 : décalage de +3 pour chaque sorte d'objet, v2 relu tel quel, état corrompu.
- `furniture-catalog` : chaque meuble tient dans la grille de 18 lignes et ses points d'intérêt sont dans son emprise.
- `room-grid` : tapis sous un meuble accepté, deux tapis refusés, meuble sur meuble refusé, meuble au sol dont le bas est dans le mur refusé, petit objet sur une surface libre / occupée / hors dessus.
- `LibraryPanel` : catégories, pose d'un meuble de chaque catégorie, pose d'un petit objet, retrait d'un porteur.
- Vérification manuelle dans Chrome et l'APK (tactile, vue verticale agrandie, plein écran).

## Livrables

Fiche WikiHow `bibliotheque-v5`, PR fusionnée, pré-prod (conformément à la routine). APK à la demande.

## Hors périmètre

Animaux et leurs déplacements, autres styles, éclairage réel de la lampe (morceau 5), présentoir de boosters (mis de côté).
