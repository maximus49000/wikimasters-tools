# Rotation des meubles et vue zoomée de face — design

Date : 2026-10-13 · Suite de [mode placement façon Sims](2026-10-13-sims-placement-design.md) et du PR #301 (emprise au sol).

## But

Dans « Ma Pièce » (vue Bibliothèque), pouvoir :
1. **tourner un meuble** par pas de 45° (8 angles), chaque angle ayant son dessin ;
2. garantir qu'**aucun meuble ne chevauche un autre** en ne comparant que les **cases au sol** réellement occupées (escalier de cases pour un meuble en diagonale) ;
3. pour les meubles qui **génèrent une action** (ouvrir une carte), **zoomer sur le meuble vu de face** avec un effet, choisir la carte à ouvrir, puis **revenir** à la pièce par un bouton retour ;
4. pendant le zoom, **aucune vue fenêtre** (pas de transition meuble → extérieur).

Tout est commun à l'extension et à l'app Android (même code). Validation d'abord sur le vrai téléphone.

## Décisions de l'utilisateur

- **8 angles**, pas de 45°.
- Exceptions à la règle de non-chevauchement : **le tapis** (on pose tout dessus) et **la chaise sous un meuble creux** (bureau, table basse, télescope).
- Meubles à zoom : **étagère** et **bureau + ordinateur** uniquement (pas les cartes au mur, pas les lampes).
- Effet : **caméra + pivot**.
- Dessins : **Opus dessine tous les angles maintenant** (les dessins actuels viennent déjà d'Opus) ; une **reprise de l'intérieur par Fable** viendra plus tard pour un rendu plus joli. On code **l'intégralité** de ce qui est décrit ici.
- Commandes : en plus de déplacer / supprimer / valider ✓ / annuler ✗, deux sélecteurs **⟲ tourner à gauche** et **⟳ tourner à droite**.

## 1. Rotation

### Données

`Placed` (meuble debout) gagne `angle?: Angle` avec `type Angle = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7` :

| angle | vue |
|---|---|
| 0 | face (défaut, champ absent) |
| 1 | ¾ avant gauche |
| 2 | profil gauche |
| 3 | ¾ dos gauche |
| 4 | dos |
| 5 | ¾ dos droit (miroir de 3) |
| 6 | profil droit (miroir de 2) |
| 7 | ¾ avant droit (miroir de 1) |

Champ absent = 0 : les pièces enregistrées ne changent pas, aucune migration. Seuls les meubles debout (`STANDING_KINDS`) tournent ; fenêtres, objets accrochés, petits objets, cartes rangées et ordinateur n'ont pas d'angle propre (l'ordinateur suit son bureau, les petits objets suivent leur porteur). Le tapis tourne aussi (dessin au sol).

### Empreinte par angle

Nouveau module pur `src/core/library/footprint.ts` :

- `drawRect(kind, angle, col, row): Rect` — rectangle de dessin (cases) ; `(col, row)` reste la case en haut à gauche de ce rectangle.
- `floorCells(kind, angle, col, row): Cell[]` — cases au sol occupées.

Règles de calcul à partir du catalogue actuel (largeur `w`, hauteur `h`, pied `foot`) :
- **Face / dos (0, 4)** : rectangle `w × h`, cases au sol = les `foot` lignes du bas sur `w` colonnes (comportement actuel du PR #301).
- **Profil (2, 6)** : la largeur devient de la profondeur **comptée à moitié** (perspective). Largeur dessinée = `max(1, foot)` colonnes ; lignes au sol = `max(1, ceil(w / 2))` ; hauteur dessinée = `h − foot + lignes au sol`. Ex. canapé 6×3 pied 3 → 3 colonnes × 3 lignes au sol.
- **Diagonale (1, 3, 5, 7)** : largeur dessinée = `ceil((w + foot) × 0.75)` ; les cases au sol forment un **escalier** : une bande de `foot` cases d'épaisseur qui descend d'une ligne toutes les ~2 colonnes, sens selon le côté (gauche : descend vers la droite ; droite : miroir). Nombre de lignes au sol = `ceil(w / 2)`.
- Le catalogue peut **surcharger** un angle d'un meuble (`overrides?: Partial<Record<Angle, { w; h; cells }>>`) quand le calcul ne colle pas au dessin.
- Les cases au sol doivent toutes être sur le sol (lignes ≥ `WALL_ROWS`) et dans la pièce ; sinon refus `bounds` / `floor`.

`rectOf`, `sizeOf` et `footRect` (room-grid) passent par ce module avec l'angle du meuble. Tous les appelants de `sizeOf`/`rectOf` (dessin, glisser, placement, lumière, animaux, ordre de dessin, ville/commerces) reçoivent le rectangle de l'angle courant.

### Collision

`footClash` compare `floorCells` (et non plus un rectangle) :
- deux meubles debout de la couche `floor` ne partagent **aucune case au sol**, quel que soit leur niveau ;
- **tapis** : couche `rug`, ignoré par les meubles (inchangé) ; deux tapis ne se chevauchent pas (comparaison de leurs cases au sol tournées) ;
- **chaise sous un meuble creux** : une `chair` peut partager des cases avec un meuble dont le catalogue a `under: true` **et** qui n'est pas lui-même une chaise (bureau, table basse, télescope) ; la réciproque vaut (poser le bureau sur une chaise est permis). Exception nouvelle (n'existe pas aujourd'hui).
- **Chevauchements déjà enregistrés** : tolérés tant qu'on ne touche pas les meubles concernés ; dès qu'on déplace ou tourne l'un d'eux, la règle s'applique (empreinte rouge, ✓ refusé).
- Les niveaux de profondeur ne servent plus à superposer ; Avancer/Reculer (une ligne) reste.

### Commande (mode placement et bulle)

- L'angle courant est gardé dans l'état du placement (`Placement.angle`) et appliqué à chaque déplacement du fantôme ; `rotatePlacement(p, cols, dir)` tourne d'un cran (angle `(a + dir + 8) % 8`), `setAngle` (room-grid) tourne sans vérifier.
- Si le nouvel angle ne tient pas à l'endroit visé : le fantôme est dessiné tourné, empreinte **rouge**, ✓ désactivé (même comportement qu'un refus de pose). Le fantôme montre les cases au sol exactes (escalier compris).
- **Barre du mode placement** : deux glyphes **⟲** (tourner à gauche, `dir +1` : face → ¾ avant gauche) et **⟳** (tourner à droite, `dir −1`), à côté de déplacer / supprimer / ✗ / ✓, pour tout meuble debout.
- **Bulle d'actions** d'un meuble posé : mêmes ⟲ ⟳ ; ils ouvrent le mode placement sur ce meuble avec la retouche déjà appliquée (rien n'est enregistré avant ✓).
- Les vignettes du tiroir restent de face ; un meuble neuf arrive à l'angle 0.

### Dessins (Opus)

- Pour chaque meuble debout : **5 vues dessinées** — face (existante), ¾ avant, profil, ¾ dos, dos. Les angles 5, 6, 7 sont le **miroir horizontal** de 3, 2, 1 (`transform="scale(-1,1)"` autour du rectangle).
- Pour les deux styles de dessins (maison et steampunk) : 16 meubles × 4 vues neuves.
- Style : celui des dessins actuels (aplats + trait encré + ombre nette, cf. style cellulo). Le rendu Ghibli reste le seul rendu ; les nouvelles vues s'y insèrent comme les vues de face.
- **Étagère** : cartes rangées visibles de face et de ¾ (emplacements projetés) ; de profil et de dos, non visibles (toujours accessibles par le zoom).
- **Bureau + ordinateur** : l'ordinateur est dessiné selon l'angle du bureau ; la carte à l'écran est visible de face et de ¾ seulement.
- Trace dans le code : commentaire « dessin provisoire Opus — reprise Fable prévue ».

### Effets de bord

- **Animaux** : les points d'intérêt (`pois`, relatifs au coin haut-gauche de face) sont transformés par l'angle (fonction `poisAt(kind, angle)` dans footprint.ts) : rotation des cases au sol, puis recalage dans le rectangle de l'angle. Les cartes de marche (`walk-map`) utilisent `floorCells`.
- **Lumière** : les occulteurs d'un meuble tourné = silhouette de son rectangle de l'angle (provisoire, à affiner avec Fable) ; face inchangée.
- **Ordre de dessin** (`byDrawOrder`) : ligne du bas = dernière ligne de `floorCells` (la plus basse).
- **Ville / commerces** (`cast.ts`) : non concernés (pas de rotation hors de Ma Pièce), on passe `angle 0`.

## 2. Vue zoomée de face

### Quand

- Uniquement en mode **Visiter** (plein écran ou non).
- Toucher une **étagère qui contient au moins une carte rangée**, ou un **bureau dont l'ordinateur affiche une carte** (toucher le bureau ou l'écran : même effet).
- Sans carte : pas d'action, donc pas de zoom (rien ne se passe, comme aujourd'hui pour un meuble sans action).
- En mode Aménager : toucher sélectionne (inchangé).
- Toucher une carte rangée **dans la pièce** (hors zoom) ouvre désormais le zoom de l'étagère au lieu d'ouvrir directement la fiche. Les cartes **au mur** ouvrent toujours directement leur fiche.

### Effet d'entrée (≈ 500 ms, `ease-out`)

1. **Caméra** : le conteneur de la pièce reçoit une transformation CSS `translate + scale` qui amène le meuble au centre et l'agrandit (~1,6×), avec `filter: blur(6px) brightness(0.55)` qui monte progressivement.
2. **Pivot** : un calque au-dessus montre le meuble ; il part de son rectangle à l'écran et de son angle courant, se compresse horizontalement (`scaleX` → 0) puis s'ouvre sur la **vue de face en grand** (`scaleX` 0 → 1) en grandissant jusqu'à sa taille finale (≈ 80 % de la hauteur visible, centré). Un meuble déjà de face ne fait que grandir.
3. Le bouton **←** apparaît en fondu.

Si `prefers-reduced-motion` : fondu simple de 150 ms, sans pivot.

### Retour

- Bouton **←** (glyphe) en haut à gauche, toujours visible pendant le zoom ; aussi : bouton retour Android, touche Échap, toucher le fond flouté.
- Animation inverse : la vue de face rapetisse vers le rectangle du meuble, se compresse et se rouvre sur son angle, la pièce redevient nette et reprend sa place (même défilement qu'avant).

### Contenu

- **Étagère** : grande vue de face, 3 niveaux × 5 emplacements, vraies images des cartes (CD, DVD, jeu, livre selon la forme). Toucher une carte ouvre sa **fiche** (`CardPopup`, musique, etc.) par-dessus le zoom ; fermer la fiche ramène au zoom. Emplacements vides : dessinés vides, sans action.
- **Bureau** : grande vue de face du bureau et de l'écran avec la carte affichée ; petits objets posés (lampe, plante) dessinés, sans action. Toucher l'écran ouvre la fiche, même enchaînement.

### Blocages pendant le zoom

- **Aucune vue fenêtre** : les fenêtres ne sont plus touchables, aucune transition vers l'extérieur ne peut démarrer (garde dans `LibraryPanel`, l'état extérieur ne peut pas passer à `leaving` tant que le zoom est ouvert).
- Pas de passage en Aménager (interrupteur 👁 | ✏️ masqué) ; tiroir et menus ☁️ 🐾 ⋯ masqués ; défilement de la pièce figé.
- Les animaux, la météo et la lumière continuent derrière le flou.
- Changer de pièce ou quitter le plein écran ferme le zoom sans animation.

### Composants

- `src/content/furniture-zoom.tsx` : calque de zoom (état `closed | opening | open | closing`, rectangle de départ, meuble, angle), bouton ←, contenu selon le type.
- `src/content/zoom-art.tsx` : vues de face en grand de l'étagère et du bureau (Opus).
- `src/core/library/zoom-target.ts` (pur) : `zoomTargetOf(layout, id): { kind: 'shelf' | 'desk'; id } | null` (applique les règles « au moins une carte »), calcul de la transformation caméra à partir du rectangle et de la taille visible.
- `LibraryPanel` : état du zoom, garde de la vue fenêtre, masquage des contrôles, gestion du retour Android/Échap.
- `RoomView` : `onFurnitureTap` en Visiter pour étagère/bureau/ordinateur ; transformation caméra appliquée au conteneur.

## Tests

- `footprint` : `drawRect`, `floorCells` pour chaque angle (face, profil, diagonale en escalier, miroirs), surcharges, `poisAt`.
- `room-grid` : collision par cases au sol tournées, tapis, chaise sous meuble creux (et pas sous un canapé), chevauchement existant toléré puis refusé au déplacement, `rotateStanding`.
- `placement` : retouche `rotate` rejouée après déplacement, refus rouge si l'angle ne tient pas, ✓ enregistre l'angle.
- jsdom (`library-panel`) : ⟲ ⟳ dans la barre et la bulle ; toucher une étagère avec cartes en Visiter ouvre le zoom, sans carte non, en Aménager non ; ← / Échap ferme ; fenêtre non touchable et pas d'extérieur pendant le zoom ; toucher une carte dans le zoom ouvre la fiche, la fermer revient au zoom.
- Familles de tests : jouer seulement les familles touchées (bibliothèque / placement / scene-*).
- Banc visuel : captures téléphone de chaque angle d'un meuble et du zoom (étagère, bureau), montrées à l'utilisateur pour validation.

## Guide

Nouvelle fiche WikiHow (nouvel id `bibliotheque-v31`) : à quoi servent la rotation et le zoom, comment ça marche (⟲ ⟳, cases au sol, zoom en Visiter sur étagère/bureau, ←), limites (dessins provisoires, pas de zoom sans carte, pas de vue fenêtre pendant le zoom).

## Hors champ

- Reprise des dessins par Fable (plus tard).
- Zoom pour les cartes au mur, les lampes ou d'autres meubles.
- « Changer la carte » du mode placement (sujet séparé).
