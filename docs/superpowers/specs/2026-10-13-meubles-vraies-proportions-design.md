# Meubles aux vraies proportions, vrai modèle 3D — design

Date : 2026-10-13 · Suite de [rotation et zoom de face](2026-10-13-rotation-zoom-meubles-design.md) (PR #302).

## Problème (retour de l'utilisateur)

« La vision 3D des meubles n'est pas bonne du tout : chaise qui ne ressemble pas à l'originale, bibliothèque trop grande… Respecter les proportions du vrai sujet dans la vraie vie, de manière naturelle. »

Causes constatées :
1. Les angles tournés sont déduits de la taille de face et des rangées du pied (`footprint.ts`) : de ¾, l'étagère passe de 8 à 9 rangées de haut.
2. Le dessin « de face » de la chaise est en réalité une chaise vue de côté ; les volumes (`furniture-volumes.ts`) la traitent comme vue de face : deux objets différents.
3. Pas d'échelle réelle : canapé et étagère font la même largeur (6 cases), la profondeur est devinée.

## Décisions de l'utilisateur

- Les vraies proportions s'appliquent à **tous les angles, face comprise** : chaque meuble prend sa vraie taille à l'échelle de la pièce et les 8 angles sortent du même modèle.
- Échelle et tableau des dimensions ci-dessous : validés (« on va le tenter »).
- **Maquette d'abord** (16 meubles × 8 angles) à valider par captures ; **rien n'est intégré avant son accord**. Ensuite intégration complète.
- Dessins par Opus (rendu 3D simplifié, style cellulo) ; reprise Fable possible plus tard, en s'appuyant sur ce modèle.

## 1. Échelle

- Mur : 12 rangées ≈ 2,50 m sous plafond. Une case ≈ **21 cm** (largeur `CELL_W` = 30 px et hauteur `CELL_H` ≈ 28,3 px).
- Sol : 6 rangées ≈ 3 m de profondeur → **50 cm par rangée de sol**.
- Conversion : taille en cases = `max(1, round(cm / 21))` pour la largeur et la hauteur dessinées ; profondeur au sol en rangées = `max(1, round(cm / 50))`.

## 2. Catalogue en cm

Constante unique `FURNITURE_MODELS` (nouveau fichier `src/core/library/furniture-models.ts`) : dimensions réelles + volumes.

| Meuble | L × P × H (cm) | Face (cases) |
|---|---|---|
| Étagère (`shelf`) | 80 × 30 × 180 | 4 × 9 |
| Bureau (`desk`) | 120 × 60 × 75 | 6 × 4 |
| Chaise (`chair`) | 45 × 50 × 90 | 2 × 4 |
| Canapé (`sofa`) | 200 × 90 × 85 | 10 × 4 |
| Fauteuil (`armchair`) | 80 × 80 × 90 | 4 × 4 |
| Table basse (`coffee-table`) | 100 × 55 × 45 | 5 × 2 |
| Lampe sur pied (`lamp`) | 40 × 40 × 160 | 2 × 8 |
| Plante (`plant`) | 45 × 45 × 110 | 2 × 5 |
| Tapis (`rug`) | 200 × 140 × 1 | 10 × 3 (au sol) |
| Panier (`basket`) | 60 × 45 × 25 | 3 × 1 |
| Gamelle (`bowl`) | 20 × 20 × 8 | 1 × 1 |
| Niche (`kennel`) | 70 × 90 × 75 | 3 × 4 |
| Station de recharge (`charger`) | 40 × 30 × 10 | 2 × 1 |
| Globe (`globe`) | 50 × 50 × 100 | 2 × 5 |
| Télescope (`telescope`) | 60 × 60 × 130 | 3 × 6 |
| Automate (`automaton`) | 45 × 40 × 110 | 2 × 5 |

La « face (cases) » du tableau est indicative : la valeur exacte est celle calculée par la projection (§3) à l'angle 0, rectangle englobant compris (dessus visible).

## 3. Modèle 3D et projection

**Volumes.** Chaque meuble est une liste de pièces en cm dans son repère propre (x largeur de gauche à droite vue de face, z profondeur de l'avant vers l'arrière, y hauteur depuis le sol) : boîtes (`box`), cylindres verticaux (`cyl` : pieds, pot, tige de lampe, montant) et formes arrondies (`round` : coussins, abat-jour, feuillage, globe) — chaque pièce avec sa couleur (clé de `Palette`). Les volumes reprennent le dessin de face actuel de chaque meuble (mêmes éléments, mêmes couleurs : la chaise a 4 pieds, une assise et un dossier à barreaux ; le canapé ses accoudoirs, son dossier et ses coussins ; l'étagère ses montants, ses 3 tablettes et son fond).

**Rotation.** Vraie rotation autour de l'axe vertical, θ = angle × 45° (0 face, 1 ¾ avant gauche, 2 profil gauche, … mêmes conventions que la PR #302 : ⟲ +1, ⟳ −1).

**Projection** (même perspective que la pièce, vue de face légèrement plongeante) : pour un point (x, y, z) tourné en (x', z') :
- écran x = x' × `PX_PER_CM` (30 px / 21 cm) ;
- écran y = − y × `PY_PER_CM` (28,3 px / 21 cm) − z' × `DEPTH_PX_PER_CM` (28,3 px / 50 cm : un point plus profond est plus haut à l'écran, comme le sol de la pièce).
Faces visibles seulement (normale tournée vers le spectateur ou le haut), tri du plus loin au plus proche, ombrage par orientation (face, côté, dessus). Rendu : aplats + trait encré + ombre nette (style cellulo, cf. `docs/superpowers/maquettes/decor-cellulo.html`).

**Rectangle de dessin.** Rectangle englobant des faces projetées, arrondi aux cases ; le meuble est posé de façon que le **point le plus en avant de son pied** tombe sur le bas de sa dernière rangée au sol.

**Empreinte au sol.** Trace du pied du meuble tourné (polygone de base x/z, pieds compris pour les meubles sur pieds = rectangle de base) posée sur la grille : une case est occupée si le polygone en couvre **plus de 50 %** (colonnes de 21 cm × rangées de 50 cm). Le tapis occupe sa trace entière. La chaise sous un meuble creux et le tapis restent les exceptions de collision (inchangé).

**Points d'intérêt (animaux)** et **occulteurs (lumière)** : tirés des mêmes volumes (assise, coussins, dessus de table ; boîtes des pièces), tournés avec le meuble — fin des silhouettes provisoires.

**Étagère et bureau** : emplacements des cartes rangées (3 niveaux × 5) et de l'écran calculés sur la face avant **projetée** (visible de face et de ¾ seulement, inchangé) ; le zoom de face utilise le modèle à l'angle 0 en grand.

## 4. Étape A — maquette (à valider avant toute intégration)

- Banc `.superpowers/harness-modeles/` : page qui dessine les 16 meubles × 8 angles à l'échelle de la pièce (une ligne par meuble), avec leur empreinte au sol en surimpression et, en tête de ligne, leur dessin de face actuel pour comparaison ; plus une pièce type meublée de face et tournée.
- Captures téléphone (portrait et paysage) envoyées à l'utilisateur ; ajustements des volumes/dimensions jusqu'à validation explicite.
- Le code du modèle et du projecteur de la maquette est le code définitif (`furniture-models.ts`, `furniture-render3d.ts`), testé ; seule l'intégration attend la validation.

## 5. Étape B — intégration (après validation)

- `footprint.ts` : `drawSize`, `drawRect`, `floorOffsets`, `floorCells`, `poisAt`, `frontFaceRect` calculés depuis le modèle tourné (remplace « profondeur comptée à moitié » et l'escalier calculé) ; `sizeOf`/`footOf` du catalogue dérivés du modèle.
- `RoomView` / vignettes du tiroir / zoom : tous les angles (0 compris) dessinés par le nouveau rendu ; les anciens dessins de face (`furniture-art-home.tsx`, `ShelfArt`, `DeskArt`, `SteampunkArt` pour les meubles debout) ne servent plus aux meubles debout. `furniture-volumes.ts` et `furniture-projection.ts` sont retirés. Variantes Steampunk : mêmes modèles, palette et pièces décoratives Steampunk (laiton, rivets) quand la pièce est Steampunk.
- Ordinateur, petits objets : posés sur le dessus projeté de leur bureau/étagère.
- Lumière : occulteurs depuis les volumes ; animaux : points d'intérêt et plateformes (dessus) depuis les volumes.
- **Migration des pièces existantes** (état `version` 5 → 6, une seule fois) : chaque meuble debout garde sa colonne et sa **dernière rangée au sol**, prend sa nouvelle taille ; dans l'ordre du plan, un meuble qui ne tient plus (bord, collision) est déplacé vers la **place libre la plus proche** (même angle) ; s'il n'y en a aucune, il est gardé tel quel (chevauchement toléré, comme les anciens). Rien n'est supprimé. Cartes rangées et petits objets suivent leur porteur.
- Validation : captures de la pièce réelle de face et tournée, montrées à l'utilisateur, avant PR.

## Tests

- Projecteur : faces finies et dans le rectangle à chaque angle ; symétrie (7 miroir de 1 pour les meubles symétriques) ; hauteur dessinée constante quelle que soit l'angle (± 1 case) ; dimensions de face conformes au tableau (± 1 case).
- Empreinte : étagère de profil = 1 colonne × 1 rangée ; canapé de face = 10 × 2 ; canapé en diagonale = escalier ; règle des 50 %.
- Migration : pièce v5 typique → v6 sans perte, sans nouveau chevauchement quand une place existe ; idempotente.
- Familles : `scene-piece`, `scene-animaux`, `scene-lumiere` (mise à jour des empreintes de référence de la lumière, justifiée).

## Hors champ

- Reprise artistique Fable (plus tard).
- WikiHow (reporté, comme la PR #302).
- Changement d'échelle des fenêtres, objets accrochés, cartes.
