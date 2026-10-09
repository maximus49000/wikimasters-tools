# Bibliothèque — morceau 8c : ombres des animaux

Suite de `2026-10-09-bibliotheque-lampes-ombres-design.md` (8b, fusionné : lampes cliquables, ombres des meubles). Décision de départ (notes de la lumière intérieure) : les animaux projettent des ombres selon les mêmes règles que les meubles, mais **mobiles**, recalculées à partir de leur position à chaque repeinture.

## Objectif

Chat, chien et robot (3 au plus par pièce) occultent le soleil et les lampes : leur ombre se dessine sur le sol, sur le support qui les porte (bureau, étagère, assise, dos du robot) et sur les meubles voisins, avec le même bord doux que les meubles, et suit l'animal quand il bouge.

## Hors périmètre

Ombre de l'animal sur son propre sprite ; reflets ; animal masquant la lueur d'une lampe sur le mur du fond (seules les surfaces sol, dessus et face avant de la carte des surfaces reçoivent l'ombre) ; réglage dédié (l'ampoule existante coupe tout le calque).

## Boîtes par espèce et par pose

Nouveau module pur `src/core/library/light/pet-boxes.ts` : `petBoxesOf(frames, layout, geom)` → `Box[]` (même type `Box` que les meubles, `owner` = id de l'animal).

- **Chat** : corps (boîte basse allongée), tête, **queue** (fine, relevée ou couchée selon la pose).
- **Chien** : corps plus long et plus haut, tête, **queue** (fine, en panache), pattes assez fines pour ne pas faire un bloc plein.
- **Robot** : châssis de 28 × 26 px, plus une **antenne** très fine montant à 40 px ; pas de queue. Endormi par un chat (`ride`) : le chat est posé à `RIDE_LIFT` au-dessus de lui, les deux boîtes se cumulent.
- Poses (table `SHAPE` de `pet-boxes.ts`, trois silhouettes) : debout (`stand`) = `walk`, `jump`, `greet`, `play`, `sniff`, `eat`, `hiss`, `scan`, `beep` ; assis (`sit`) = `sit`, `groom`, `yawn`, `scratch`, `purr`, `pant` ; couché (`lie`) = `sleep`, `stretch`, `cower`, `standby`, `charge` ; **`hide` = aucune boîte** (l'animal est dans son panier ou sa niche, qui est déjà un meuble).
- Le sens (`facing`) retourne la queue et la tête en x. La table est en fractions d'une taille de référence par espèce, comme `PRIMS` des meubles.
- Hauteur de base : au sol, `z = 0` plus la levée `max(0, depthY − pos.y)` (dos du robot) ; la profondeur `d` se déduit de `depthY` avec la même inversion que `dFrontOf`. Sur un bureau ou une étagère (`top`), `z0` = hauteur du dessus (`hostOf`), au milieu du support. **Règle d'assise** : tout animal dont `on` désigne un meuble qui n'est ni bureau ni étagère (canapé, fauteuil, chaise, table basse : `top` est faux, `pos.y` est la hauteur écran de l'assise) est posé au milieu du support (`dFront − D/2`, via `supportOf`) et levé de `wallH + d·k − pos.y` (écran `y = wallH + d·k − z`), au lieu d'être lu à tort comme un point du sol.

## Calcul : un passage « animaux » sans invalider les meubles

Les champs mémorisés des meubles (`surfaceOf`, `sunReachField`, `lampLightOf`) restent calculés **sans** les animaux : ajouter les animaux aux boîtes changerait leur signature à chaque image.

- `buildLightMap` gagne une entrée optionnelle `pets?: readonly Box[]`. Absente ou vide : sortie **identique bit à bit** à 8b (test de régression).
- Avec des boîtes d'animaux, un passage `pet-shade.ts` (`sunPetTransmission`, `lampPetTransmission`) calcule, sur toute la carte mais seulement pour les pixels déjà éclairés (`sun` > 0, lueur de lampe > 0) de sol ou de dessus, deux facteurs de transmission : `sunPet` (rayon du soleil vers chaque verre, test `sunReaches` contre les seules boîtes des animaux) et un facteur par lampe (même fonction que `lamps.ts`, boîtes des animaux seulement). Le passage multiplie `sunField[n]` et `lampLight[n]` avant le tracé. Équivalent à un calcul complet pour un bord doux (produit de deux transmissions).
- Les pixels non éclairés ne sont pas touchés. Coût : une pièce de 96 colonnes avec 3 animaux reste sous 60 ms à chaud (test de rapidité de `light-map`).
- Une lampe n'est pas occultée par un animal dont une boîte contient son point ou le frôle à `LAMP_SPREAD` près (chat sur le même bureau qu'une lampe de bureau) : ces boîtes sont écartées pour cette lampe.
- Un animal sur un support (`top`) : ses pixels sont sur la surface « dessus » de la carte des surfaces ; le test d'occultation utilise la hauteur du support, sans changer la carte.

## Cadence et branchement

- `usePetSim` expose les images courantes via `sim.frames` ; `RoomView` reçoit `petFrames` et en tire un accesseur stable `getPetBoxes` (mémorisé, `petBoxesOf(petFrames(), layout, geom)`) passé à `LightLayer`. Aucun rendu React par image.
- `LightLayer` lit `getPetBoxes()` à chaque repeinture et compare une **signature quantifiée** (boîtes à 2 px près) à la précédente : inchangée = on saute la repeinture, comme pour le ciel.
- Cadence : **4 Hz au repos** (inchangé) ; **~12 Hz tant qu'au moins un animal a bougé** à la repeinture précédente, puis retour à 4 Hz à l'immobilité. **Garde adaptative** : la durée de chaque repeinture qui a construit une carte est mesurée (`performance.now`) et la cadence rapide n'a lieu que si `maintenant − dernière repeinture ≥ max(83 ms, 4 × durée)` ; un appareil lent retombe donc vers 4 Hz au lieu de saturer le fil principal. Mouvement réduit : pas d'intervalle supplémentaire, un contrôle à la seconde, avec repeinture seulement si la signature a changé.
- Onglet masqué ou pièce changée : même garde que le reste (`document.visibilityState`, rechargement du calque).
- **Ordre du calque (tranché)** : `RoomView` dessine le calque de lumière APRÈS les animaux (`middle`, `topPets`) et avant les bulles. Les sprites sont donc éclairés et assombris comme les meubles ; on ne déplace rien et il n'y a pas de masque de silhouette. L'ombre au sol d'un animal tombe devant ou à côté de lui, elle n'assombrit pas visiblement son propre sprite.
- **Hauteur d'un animal** : `PetFrame` gagne `on` (support à cet instant). Voir la règle d'assise plus haut. Au sol, levée = `max(0, depthY − pos.y)` (~26 pour le chat couché sur un robot, ~0 en saut car `depthY` = `pos.y`) : pendant un saut l'ombre suit la position à l'écran sans hauteur dédiée (simplification assumée).
- **Approximations du passage animaux** : (a) soleil : transmission = meilleure fenêtre, c'est-à-dire le max, sur les fenêtres dont la projection contient le pixel, de la part non occultée par les animaux seuls (exact pour une seule fenêtre) ; (b) lampes : moyenne des transmissions par lampe pondérée par l'éclairement (exact quand les meubles ne gênent pas). Aucune ne s'applique au mur du fond.
- **Robot, honnêtement** : un châssis de 28 × 26 px (dos à 26 px, car le chat dort dessus) plus une fine antenne montant à 40 px ; il est donc un peu plus haut que le chat debout. Un chat couché dessus projette son ombre depuis plus haut (levée de ~26 px) ; l'ombre ne tombe pas « sur le dos du robot » (la carte des surfaces ne contient que des meubles).

## Tests

- `light-pet-boxes.test.ts` : silhouettes par pose (`shapeOf`), `hide` = vide, couché < assis < debout, queue chat/chien et robot sans queue, robot (châssis, plus large que haut), miroir selon `facing`, levée `depthY − pos.y`, perché sur un bureau, assis sur un canapé (règle d'assise), support introuvable.
- `light-pet-shade.test.ts` : transmission des lampes (1 sans animal, ombre derrière et pas sur le côté, pixels sans lueur intacts, lampe au pied de l'animal non occultée, deux lampes) et du soleil.
- `light-map.test.ts` : identique bit à bit sans animal, ne change que les pixels proches, l'ombre bouge avec l'animal, animaux seuls / lampe seule, assombrissement derrière l'animal, rapidité.
- `library-light.test.tsx` : repeinture rapide tant que l'animal bouge, garde adaptative (cycles sautés après une repeinture lente), pas de repeinture à l'arrêt ni sous 2 px, mouvement réduit.
- `room-pet-shadows.test.tsx` : `getPetBoxes` fourni (ou non) à `LightLayer`, identité stable d'un rendu à l'autre.

## Fiche WikiHow

Mise à jour dans la même PR (`entries.ts`) : nouvelle fiche `bibliotheque-v17` (« L'ombre des animaux », après `bibliotheque-v15`, avec une étape crayon avant le bouton Lumière, qui n'existe qu'en mode Aménager), qui indique que les animaux projettent aussi une ombre (étapes `text + détails`, et les limites : pas d'ombre sur le sprite, pas d'ombre dans un panier ou une niche).

## Limites connues, à annoncer

Boîtes simplifiées (pas d'oreilles ni de pattes individuelles), ombre non projetée sur le mur du fond, coût mesuré seulement en jsdom tant que la vérification manuelle Chrome n'est pas faite.
