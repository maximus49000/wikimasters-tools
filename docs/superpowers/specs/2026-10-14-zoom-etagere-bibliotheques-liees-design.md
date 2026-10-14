# Second zoom sur une étagère et bibliothèques liées — design

Date : 2026-10-14 · Suite de [rotation + zoom des meubles](2026-10-13-rotation-zoom-meubles-design.md) (PR #302) et des [meubles aux vraies proportions](2026-10-13-meubles-vraies-proportions-design.md) (PR #303).

## But

1. **Lire les cartes en grand** : depuis la vue de face d'une bibliothèque (premier zoom), toucher une étagère zoome sur **cette seule tablette**, cartes au plus grand avec leur titre.
2. **Lier deux bibliothèques** posées côte à côte : elles s'ouvrent **ensemble** à l'écran, au premier zoom (les deux meubles) comme au second (la même tablette des deux meubles, à la suite).

Tout est commun à l'extension et à l'app Android (même code). Validation d'abord sur le vrai téléphone.

## Décisions de l'utilisateur

- Le second zoom sert d'abord à **lire les cartes** (pochette grande + titre).
- Lien **automatique à la pose**, avec un bouton pour **délier** (et relier).
- Premier zoom d'une bibliothèque liée : **les deux meubles côte à côte**.
- **Deux bibliothèques au maximum** dans un lien.
- Navigation dans le second zoom : **flèches ↑ ↓ + glissement vertical**, sans repasser par la vue de face.
- **Titre sous chaque pochette** dans le second zoom.

## 1. Le lien entre deux bibliothèques

### Règle (calculée, jamais enregistrée)

Deux bibliothèques A et B sont liées quand :

- elles ont **le même angle** ;
- B est **exactement bord à bord** avec A **dans l'axe de leur face** : le décalage (col, row) de B par rapport à A est le vecteur « largeur du meuble » tourné selon l'angle (calculé depuis le modèle 3D, arrondi aux cases), vers la droite ou vers la gauche de la face ; aucun décalage en profondeur ;
- aucune des deux n'est marquée **déliée** (`unlinked: true`) ;
- **deux au maximum** : dans une rangée de 3 bibliothèques ou plus, les liens se forment par paires de gauche à droite (vu de face) : A–B liées, C seule (ou C–D).

`linkedPartnerOf(layout, shelfId)` (pur, `src/core/library/shelf-link.ts`) renvoie `{ partnerId, side: 'left' | 'right' } | null`. `shelfGroupOf(layout, shelfId)` renvoie les ids dans l'ordre gauche → droite vu de face (1 ou 2).

Conséquences : écarter, tourner ou supprimer un meuble défait le lien sans rien à nettoyer ; les rapprocher le refait.

### Délier / relier

- Bouton **⛓** dans la bulle d'actions d'une bibliothèque en mode **Aménager**, affiché seulement si une voisine remplit la règle géométrique.
- Liée → l'appui pose `unlinked: true` sur la bibliothèque touchée (glyphe ⛓‍💥 « délier »). Déliée → l'appui retire le drapeau des deux bibliothèques concernées (glyphe ⛓ « relier »).
- Le champ `unlinked?: true` s'ajoute sur le placement `shelf` ; absent = comportement par défaut. Pas de migration (champ facultatif ignoré par l'ancien code).
- Repère visuel en Aménager : quand une bibliothèque liée est sélectionnée, sa partenaire reçoit le même contour de sélection en pointillés.

### Cartes

Chaque carte reste rangée **dans sa propre bibliothèque** (`shelfId`) : pas de rangement à cheval, pas de débordement d'un meuble à l'autre. Le lien ne change que l'affichage.

## 2. Premier zoom (vue de face)

- Toucher une bibliothèque liée, ou une carte rangée dedans, ouvre la vue de face **des deux meubles côte à côte** (ordre gauche → droite), dès que **l'un des deux** range au moins une carte.
- `zoomTargetOf` renvoie `{ kind: 'shelf'; ids: [string] | [string, string] }` (bureau inchangé : `{ kind: 'desk'; id }`). Le cadre final utilise les proportions de la paire (double largeur) ; `zoomRectOf` limite déjà à 90 % de la largeur.
- La caméra vise le rectangle englobant des deux meubles.
- Une bibliothèque seule : comportement actuel inchangé.
- **Changement** : dans la vue de face, toucher une carte **zoome sur sa tablette** (second zoom) au lieu d'ouvrir directement sa fiche. Toucher n'importe où ailleurs sur une tablette (vide ou pleine) fait de même.

## 3. Second zoom (une tablette)

### Entrée (≈ 400 ms, `ease-out`)

La vue de face s'agrandit autour de la tablette touchée (même principe caméra : translation + agrandissement), les autres tablettes sortent du cadre puis la vue de la tablette s'installe nette.

### Contenu

- La tablette `level` de chaque bibliothèque du groupe, **à la suite**, séparées par le montant dessiné.
- Cartes à leur place et à leurs proportions réelles (mêmes positions en cm que `shelfLayoutIn`), agrandies au plus grand que permet l'écran (largeur de la tablette ou des deux tablettes à ≈ 94 % de la largeur, hauteur bornée pour laisser la place aux titres).
- **Titre sous chaque pochette** (objets de face : CD, DVD, jeu, livre de face), sur 2 lignes au plus, coupé avec « … ». Objets **sur la tranche** (livres) : titre écrit **verticalement sur la tranche**, coupé avec « … ».
- Emplacement libre : dessiné vide, sans action.
- Toucher une carte ouvre sa **fiche** (`CardPopup`) par-dessus ; fermer la fiche ramène au second zoom.

### Navigation

- Flèches **↑ ↓** à droite de l'écran, grisées sur la tablette du haut / du bas.
- **Glissement vertical** du doigt (seuil ≈ 40 px, vers le haut = tablette du dessous) : même effet.
- Changement de tablette : glissement vertical de la vue (≈ 250 ms).
- **←** (même bouton qu'aujourd'hui), retour Android, Échap, toucher le fond flouté : retour au **premier zoom** (animation inverse), puis un second appui revient à la pièce.

### Blocages

Mêmes blocages que le premier zoom (pas de vue fenêtre, pas de passage en Aménager, tiroir et menus masqués). Changer de pièce ou quitter le plein écran ferme tout sans animation.

## 4. Composants

- `src/core/library/shelf-link.ts` (pur) : `linkedPartnerOf`, `shelfGroupOf`, `canLink` (règle géométrique sans le drapeau, pour afficher le bouton).
- `src/core/library/zoom-target.ts` : cible `shelf` à 1 ou 2 ids ; rectangle englobant pour la caméra.
- `src/content/furniture-zoom.tsx` : état du zoom étendu d'un niveau (`face` | `board` + `level`), ← à deux étages, vue de face à deux meubles.
- `src/content/shelf-board-zoom.tsx` (nouveau) : vue d'une tablette (1 ou 2 bibliothèques), titres, ↑ ↓, glissement.
- Bulle d'actions (Aménager) : bouton ⛓ / ⛓‍💥.
- `MainActivity` (Android) : le retour ferme d'abord le second zoom (déjà routé vers la fermeture du zoom côté page : vérifier que la page gère les deux étages).
- Dessins : Opus, avec la trace « dessin provisoire Opus — Fable n'est pas passé, reprise prévue » (Fable gelé jusqu'au 17/10).

## 5. Tests

- Purs (`shelf-link`) : liées de face et pour chacun des 8 angles ; écart d'une case → non liées ; angles différents → non ; décalage en profondeur → non ; rangée de 3 → A–B liées, C seule ; `unlinked` → non ; ordre gauche/droite.
- Purs (`zoom-target`) : bibliothèque liée dont seule la partenaire a des cartes → cible à 2 ids ; seule → 1 id.
- jsdom : premier zoom à deux meubles ; toucher une tablette → second zoom sur ce niveau ; ↑ ↓ et glissement ; flèches grisées aux bords ; ← deux fois → pièce ; carte touchée dans le second zoom → fiche, fermer → second zoom ; bouton ⛓ présent seulement avec une voisine, délier puis relier.
- Familles de tests : seulement les familles touchées (bibliothèque / placement / scene-*).
- Banc visuel : captures téléphone (portrait et paysage) du premier zoom à deux, du second zoom seul et à deux, montrées à l'utilisateur pour validation.

## 6. Guide

Nouvelle fiche WikiHow (prochain id `bibliotheque-v…` libre) : à quoi sert le second zoom (lire les cartes en grand), comment lier deux bibliothèques (côte à côte, même sens, ⛓ pour délier), d'où viennent les titres, limites (deux bibliothèques au maximum, cartes non partagées entre meubles, dessins provisoires).

## Hors champ

- Plus de deux bibliothèques liées, défilement horizontal d'une longue étagère.
- Rangement de cartes à cheval sur deux meubles.
- Second zoom pour le bureau.
- Reprise des dessins par Fable.
