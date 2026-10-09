# Bibliothèque — morceau 8c : ombres des animaux

Suite de `2026-10-09-bibliotheque-lampes-ombres-design.md` (8b, fusionné : lampes cliquables, ombres des meubles). Décision de départ (notes de la lumière intérieure) : les animaux projettent des ombres selon les mêmes règles que les meubles, mais **mobiles**, recalculées à partir de leur position à chaque repeinture.

## Objectif

Chat, chien et robot (3 au plus par pièce) occultent le soleil et les lampes : leur ombre se dessine sur le sol, sur le support qui les porte (bureau, étagère, dos du robot) et sur les meubles voisins, avec le même bord doux que les meubles, et suit l'animal quand il bouge.

## Hors périmètre

Ombre de l'animal sur son propre sprite ; reflets ; animal masquant la lueur d'une lampe sur le mur du fond (seules les surfaces sol, dessus et face avant de la carte des surfaces reçoivent l'ombre) ; réglage dédié (l'ampoule existante coupe tout le calque).

## Boîtes par espèce et par pose

Nouveau module pur `src/core/library/light/pet-boxes.ts` : `petBoxes(frame, geom, supportTop)` → `Box[]` (même type `Box` que les meubles, `owner` = id de l'animal).

- **Chat** : corps (boîte basse allongée), tête, **queue** (fine, relevée ou couchée selon la pose).
- **Chien** : corps plus long et plus haut, tête, **queue** (fine, en panache), pattes assez fines pour ne pas faire un bloc plein.
- **Robot** : boîte **plate et large** (châssis sur chenilles, hauteur bien inférieure à celle d'un chat), plus une **antenne** très fine ; pas de queue. Endormi par un chat (`ride`) : le chat est posé à `RIDE_LIFT` au-dessus de lui, les deux boîtes se cumulent.
- Poses : `walk`/`jump`/`greet`/`play`/`pant`/`sniff`/`scan`/`beep` = debout (le saut ajoute la hauteur de l'arc à `z`) ; `sit`/`purr`/`groom`/`yawn`/`eat`/`scratch`/`hiss`/`cower`/`stretch` = assis ou accroupi (plus court, plus haut devant) ; `sleep`/`standby`/`charge` = couché (plat) ; **`hide` = aucune boîte** (l'animal est dans son panier ou sa niche, qui est déjà un meuble).
- Le sens (`facing`) retourne la queue et la tête en x. La table est en fractions d'une taille de référence par espèce, comme `PRIMS` des meubles.
- Hauteur de base : `z = 0` au sol ; sur un bureau ou une étagère (`top`), `z0` = hauteur du dessus du support, lue comme pour un petit objet. Position en profondeur `d` déduite de l'ordonnée écran des pieds (`pos.y`) avec la même inversion que `dFrontOf`.

## Calcul : un passage « animaux » sans invalider les meubles

Les champs mémorisés des meubles (`surfaceOf`, `sunReachField`, `lampLightOf`) restent calculés **sans** les animaux : ajouter les animaux aux boîtes changerait leur signature à chaque image.

- `buildLightMap` gagne une entrée optionnelle `pets?: readonly Box[]`. Absente ou vide : sortie **identique bit à bit** à 8b (test de régression).
- Avec des boîtes d'animaux, un passage `petShade` calcule, pour chaque pixel d'une **zone utile** (boîte englobante de chaque animal, étendue le long de l'ombre portée du soleil — au plus la longueur donnée par l'élévation — et à la portée des lampes allumées proches), deux facteurs de transmission : `sunPet` (rayon du soleil vers chaque verre, test `sunReaches` contre les seules boîtes des animaux) et un facteur par lampe (même fonction que `lamps.ts`, boîtes des animaux seulement). Le passage multiplie `sunField[n]` et `lampLight[n]` avant le tracé. Équivalent à un calcul complet pour un bord doux (produit de deux transmissions).
- Les pixels hors zone utile ne sont pas touchés. Coût visé : une pièce de 96 colonnes avec 3 animaux doit rester sous la moitié du coût d'un recalcul complet.
- Un animal sur un support (`top`) : ses pixels sont sur la surface « dessus » de la carte des surfaces ; le test d'occultation utilise la hauteur du support, sans changer la carte.

## Cadence et branchement

- `usePetSim` expose les images courantes (`frames.current`) via un accesseur stable `getPets()` ; `RoomView` le passe à `LightLayer` (prop `pets?: () => readonly PetFrame[]`). Aucun rendu React par image.
- `LightLayer` lit `getPets()` à chaque repeinture et compare une **signature quantifiée** (position à 2 px près, pose, sens, support) à la précédente : inchangée = on saute la repeinture, comme pour le ciel.
- Cadence : **4 Hz au repos** (inchangé) ; **~12 Hz tant qu'au moins un animal a bougé** à la repeinture précédente, puis retour à 4 Hz après 1 s d'immobilité. Mouvement réduit : pas d'intervalle supplémentaire, un recalcul à la minute comme aujourd'hui (les animaux y changent de place rarement).
- Onglet masqué ou pièce changée : même garde que le reste (`document.visibilityState`, rechargement du calque).
- Le calque doit rester **sous** les animaux ou les ombrer de façon cohérente : à vérifier dans `RoomView` en écrivant le plan (ordre de dessin du `<image data-light>` par rapport aux nœuds `petAttach`) ; si le calque est au-dessus, l'ombre au sol s'étend sans assombrir le sprite lui-même grâce à un masque de silhouette ou en déplaçant le calque sous la couche des animaux.

## Tests

- `pet-boxes.test.ts` : une espèce × pose donne les bonnes boîtes (queue chat/chien, robot plus bas que chat), `hide` = vide, miroir selon `facing`, support élevé, saut surélevé, cumul robot + chat (`ride`).
- `light-map` : régression identique à 8b sans animaux ; l'ombre d'un animal se déplace avec l'azimut du soleil ; ombre sur un bureau ; deux animaux qui se croisent (transmissions multipliées, pas d'artefact) ; les pixels hors zone utile sont inchangés par rapport au calcul sans animaux.
- `light-layer.test.tsx` : repeinture rapide quand un animal bouge, retour à 4 Hz au repos, signature inchangée = pas de repeinture, pas de calque sans lampe ni fenêtre-météo (inchangé).

## Fiche WikiHow

Mise à jour dans la même PR (`entries.ts`) : la fiche de la lumière indique que les animaux projettent aussi une ombre (nouvel id `bibliotheque-v17`, étapes `text + how + tip`, et les limites : pas d'ombre sur le sprite, pas d'ombre dans un panier ou une niche).

## Limites connues, à annoncer

Boîtes simplifiées (pas d'oreilles ni de pattes individuelles), ombre non projetée sur le mur du fond, coût mesuré seulement en jsdom tant que la vérification manuelle Chrome n'est pas faite.
