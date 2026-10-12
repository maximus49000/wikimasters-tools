# Bibliothèque — superposer les objets sur des niveaux de profondeur

Date : 2026-10-12 · Validé en conversation (sans fiche WikiHow, à la demande de l'utilisateur).

## But

Pouvoir superposer des objets de la pièce sur les mêmes cases, par exemple une fenêtre, une bibliothèque devant, puis un fauteuil et une table basse. La profondeur vient de l'empilement. Aujourd'hui (`src/core/library/room-grid.ts`), une case ne porte qu'un objet de la couche `floor`, en plus des tapis. On ne peut donc même pas accrocher une affiche derrière une étagère.

## Règle

**Une case = au plus un objet par niveau.** Les tapis restent dans leur couche `rug`, inchangée, sous tout le reste.

| Niveau | Nom | Objets par défaut | Qui peut y être |
|---|---|---|---|
| 0 | Mur | fenêtre, objets accrochés (`wall` : affiches, vinyles, pochettes) | les objets accrochés uniquement |
| 1 | Fond | `shelf`, `lamp`, `plant` | les meubles debout |
| 2 | Milieu | `desk`, `chair`, `armchair`, `sofa`, `globe`, `telescope`, `automaton`, `kennel` | les meubles debout |
| 3 | Avant | `coffee-table`, `basket`, `bowl`, `charger` | les meubles debout |

- Les meubles debout vont du niveau 1 au niveau 3. Le niveau 0 est réservé au mur, et un objet accroché y reste toujours.
- Le niveau par défaut est donné par le catalogue (`furniture-catalog.ts`, nouveau champ `depth` à côté de `layer`).
- `computer`, `small` (petit objet posé) et `stored` (objet rangé) n'ont pas de niveau propre : ils prennent celui de leur porteur.

## Données

- `Placed` debout : champ optionnel `depth?: 1 | 2 | 3`. Absent = niveau par défaut du type. Les pièces déjà enregistrées se chargent donc à l'identique, sans migration ni déplacement.
- Fonction `depthOf(p: Placed): 0 | 1 | 2 | 3` : 0 pour `window` et `wall` ; pour un meuble debout, `p.depth ?? défaut du type` ; pour les objets portés, le niveau du porteur.
- `takenKeys` devient par niveau : les cases occupées **au même niveau**, sauf `ignoreId`. `canPlace`, `canHangRect`, `canHang`, `windowFit` et les fonctions de déplacement ne comparent qu'un niveau.

## Pose et déplacement

1. **Pose d'un meuble** : on essaie d'abord son niveau par défaut. S'il est occupé sur ces cases, on prend le niveau libre le plus proche (à égalité, celui de devant). Le niveau choisi n'est enregistré dans `depth` que s'il diffère du défaut. Si les trois niveaux sont pris, le refus est `taken`, avec les cases fautives en rouge, comme aujourd'hui.
2. **Déplacement d'un meuble** : il garde son niveau si celui-ci est libre à destination, sinon il suit la règle 1, en partant de son niveau actuel.
3. **Objets accrochés et fenêtres** : ils ne se heurtent qu'aux autres objets du niveau 0. On peut donc les poser derrière une étagère.
4. **Avancer / reculer** : deux boutons ⤒ (avancer) et ⤓ (reculer) dans la barre de l'objet sélectionné, pour les meubles debout hors tapis. Ils passent au niveau voisin, dans les bornes 1 à 3, seulement s'il est libre sur les cases du meuble. Sinon le bouton est grisé. Mêmes glyphes et même barre sur l'extension et sur Android.
5. **Sélection d'un objet caché** : un toucher sélectionne l'objet le plus en avant sous le doigt. Un nouveau toucher au même endroit, objet déjà sélectionné, passe à l'objet suivant derrière lui, puis revient au premier. L'objet sélectionné est déjà mis en avant (contour) ; il se dessine en plus par-dessus pendant la sélection pour rester visible.

## Rendu (`src/content/RoomView.tsx`)

- **Ordre** : tapis, puis niveau 0 (fenêtres, objets accrochés), puis niveaux 1, 2, 3. À l'intérieur d'un niveau, l'ordre actuel est conservé (bas le plus haut d'abord).
- **Objets portés** : chaque ordinateur, petit objet posé ou objet rangé se dessine juste après son porteur, dans le même niveau. Aujourd'hui, les petits objets passent après tout le reste ; sinon une plante posée sur l'étagère passerait devant la table basse placée devant.
- **Ombre de contact** : un objet de niveau N projette une ombre douce sur ce qui est derrière lui. C'est une bande sombre semi-transparente décalée vers le bas à droite (lumière venue du haut à gauche), dessinée juste avant l'objet. En Ghibli, c'est un aplat net violet (`COOL`) ; en classique, une ombre floue grise. Elle n'apparaît que là où un objet d'un niveau inférieur se trouve dessous (découpe aux rectangles des objets derrière). Sur le mur nu, il n'y a pas d'ombre en plus de celles qui existent déjà.
- Pas de perspective : les tailles et positions ne changent pas, et chaque objet tombe toujours pile sur ses cases.

## Animaux et robot (`src/core/library/pets/depth.ts`, `RoomView`)

- Un animal **porté** par un meuble (assis, couché, dedans ou dessus : `depthHosts`) prend le niveau de ce meuble et se dessine juste devant lui.
- **L'animal passe là où il y a la place, pas ailleurs.** La règle est physique. Le dessin d'un meuble couvre des cases du sol, mais il ne touche vraiment le sol que par ses **rangées d'appui** : les `foot` rangées du bas de son emprise. Chaque type dit aussi s'il a un **dessous libre** (`under`). Deux champs sont ajoutés au catalogue :

  | Type | `foot` (rangées d'appui) | `under` (on passe dessous) |
  |---|---|---|
  | `shelf` | 2 | non |
  | `desk` | 2 | oui |
  | `chair` | 1 | oui |
  | `coffee-table` | 2 | oui |
  | `telescope` (trépied) | 1 | oui |
  | `sofa`, `armchair`, `kennel` | 2 | non |
  | `basket`, `bowl`, `plant`, `lamp`, `globe`, `automaton`, `charger` | 1 | non |

  Les valeurs sont à ajuster sur les dessins pendant le développement. Dans `walk-map.ts`, une case du sol est :
  - **bloquée** si elle est dans les rangées d'appui d'un meuble sans dessous libre (le pied de la bibliothèque, le canapé) ;
  - **praticable et cachée** si elle est dans les rangées d'appui d'un meuble à dessous libre (sous la table basse, sous le bureau, entre les pieds de la chaise) ;
  - **praticable et cachée** si elle est couverte par le dessin d'un meuble **au-dessus de ses rangées d'appui**. C'est l'espace entre le meuble et le mur : l'animal passe derrière la bibliothèque.
  - **Meuble contre le mur** : quand ses rangées d'appui commencent à la première rangée du sol (`WALL_ROWS`), il ne reste aucune case derrière lui, donc aucun passage. Le chat fait le tour, comme aujourd'hui.
  - Deux meubles accolés ne laissent pas de passage entre eux : il faut au moins une case libre.
  - Les dessus de meubles (`platforms`, sauts, assises) ne changent pas. Tout cela vaut aussi pour le robot.
- **Niveau d'un animal qui marche** : si ses pieds sont dans l'emprise au sol d'un ou plusieurs meubles, il se dessine juste derrière le meuble de plus bas niveau parmi eux. Il est donc caché par la table basse quand il est dessous, et par la bibliothèque quand il passe derrière. Sinon, il est au niveau 2 : derrière les meubles de niveau 3, devant ceux des niveaux 0 et 1. Parmi les meubles de niveau 2, l'ordre actuel par la ligne des pieds s'applique (`depthIndex` restreint au niveau).
- Les animaux perchés (`top`) et les bulles restent tout en haut, comme aujourd'hui.
- Les pauses au sol (assis, couché, toilette) peuvent tomber sous une table ou derrière un meuble. L'animal y reste caché en partie, et c'est voulu.

## Lumière

`light/occluders.ts` garde les mêmes rectangles. L'ordre des niveaux ne change pas les ombres de lumière intérieure dans ce lot.

## Hors périmètre

- Fiche WikiHow : non demandée.
- Perspective (réduction de taille des niveaux du fond).
- Plus d'un objet par niveau sur une même case.

## Essais

- `room-grid` : pose au niveau par défaut ; repli sur le niveau libre le plus proche ; refus quand 1, 2 et 3 sont pris ; affiche posée derrière une étagère ; deux affiches toujours en conflit ; avancer/reculer libre et bloqué ; pièce ancienne sans `depth` lue au niveau par défaut.
- `depthOf` des objets portés = niveau du porteur.
- Rendu (jsdom) : ordre des nœuds (niveau 1 avant niveau 3 même si son bas est plus bas) ; petit objet posé juste après son étagère ; toucher répété qui fait défiler les objets superposés.
- Animaux : chat sur un fauteuil de niveau 2 dessiné avant une table basse de niveau 3 ; chat qui marche à découvert dessiné après une étagère et avant une table basse ; chat sous la table basse dessiné juste avant elle ; chat derrière une étagère dessiné juste avant elle ; carte de marche : appui d'une bibliothèque bloqué, dessous d'une table basse praticable, case derrière une bibliothèque éloignée du mur praticable, bibliothèque contre le mur sans passage derrière (le chat fait le tour).
- Graphisme classique et Ghibli. Capture de validation de la pièce (fenêtre + bibliothèque + fauteuil + table basse) montrée à l'utilisateur, d'abord sur le téléphone.
