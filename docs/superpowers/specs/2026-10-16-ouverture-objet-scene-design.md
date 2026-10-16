# Ouverture d'un objet dans la scène — design

Date : 2026-10-16 · Branche : `feat/ouverture-objet` (worktree `Wikimasters-ouverture`)

## But

Dans la scène « Ma Pièce » (vue Bibliothèque), toucher un album, un film, un jeu vidéo ou un livre rangé
**ouvre l'objet** au lieu d'ouvrir la fiche : le boîtier sort de l'étagère, grossit, son couvercle pivote
sur sa charnière et devient le **sélecteur** (à gauche) ; le **disque** (ou la couverture du livre) est à droite.
L'utilisateur choisit dans le sélecteur ce qu'il veut écouter, regarder ou lire.

Maquette validée en discussion (2026-10-16) : boîtier qui s'ouvre, sélecteur à gauche, disque à droite,
disque qui tourne pendant la lecture, **disque centré dans son plateau (aucun glissement vers la droite)**.

## Décisions prises avec l'utilisateur

| Sujet | Décision |
|---|---|
| Où | Dans la scène (Ma Pièce), pas dans la fiche native du site. |
| Fiche actuelle (`RoomCardDialog`) | **Remplacée** par l'ouverture pour les objets ouvrables ; reste accessible par le glyphe ⓘ, qui l'ouvre par-dessus. |
| Contenus | Ceux qui existent déjà dans la fiche, mêmes sources (voir tableau ci-dessous). |
| Téléphone en portrait | **Forcer le paysage.** |
| Vidéo (film, jeu) | Se lit **à la place du disque**, à droite ; ⛶ passe en plein écran ; à la fin ou en changeant de choix, le disque revient. |
| Disque | Centré dans le plateau, ne glisse pas. Tourne tant qu'une piste de cet objet est en lecture. |

## Objets concernés

Déclencheur : un objet **rangé** (`kind: 'stored'`) touché dans le second zoom de l'étagère (`shelf-board-zoom`,
callback `onCard`), et un **vinyle** ou une **pochette** accrochés au mur (`WallShape` `vinyl` / `sleeve-*`,
touchés via `onCardTap` → aujourd'hui `setViewing`). Les posters, écrans d'ordinateur et autres objets gardent la fiche actuelle.

| Forme (`shape`) | Objet ouvert | Gauche : sélecteur | Droite |
|---|---|---|---|
| `cd` | Boîtier cristal, couvercle à charnière | Pistes Spotify/Tidal (`getMusicService().view`) | CD avec la pochette sur l'étiquette |
| `vinyl`, `sleeve-*` (mur) | Pochette carton qui s'ouvre | Pistes | Vinyle avec la pochette au centre |
| `dvd` | Boîtier DVD | Bande-annonce (`getScreenService().view` → `trailerKey`), pistes de la BO (`SoundtrackButton` / service BO) | DVD ; vidéo à sa place quand choisie |
| `game` | Boîtier de jeu | Vidéo(s) (`getGameService().view` → `detail.trailer` HLS Steam ou YouTube IGDB), pistes de la BO | Disque de jeu ; vidéo à sa place quand choisie |
| `book` | Le livre s'ouvre (couverture qui pivote) | Synopsis + liens de lecture (`getBookService().view` puis `.reading`) | Couverture du livre |

La forme stockée fait foi (pas de recalcul de catégorie) ; une carte dont le service répond `{status:'none'}`
ou échoue ouvre quand même l'objet, avec un sélecteur qui le dit (« Aucune piste trouvée », « Pas de bande-annonce »…)
et le glyphe ⓘ pour la fiche.

## Image

Sur le disque ou la couverture : l'image de l'API d'abord (règle « API avant remplacement ») — `createMediaArt`
(`primary` puis `fallback`, `src/content/media-art.ts`) — puis l'image de la carte (`imageOfCard`, `LibraryPanel.tsx`).
Sans image : aplat de couleur de la carte + titre, comme les dos de livres (`bookColor(slug)`).

## Animation

Phases : `opening` → `open` → `closing` → fermé (même modèle que `use-furniture-zoom.ts`).

1. **Vol** (~500 ms) : l'objet part du rectangle de sa carte dans le second zoom (ou sur le mur), grossit et se centre.
2. **Ouverture** (~700 ms) : le couvercle (ou la couverture du livre) pivote de 180° autour de sa charnière gauche ;
   sa face intérieure est le sélecteur. Le disque reste en place, centré dans le plateau.
3. **Fermeture** : chemin inverse jusqu'à la place d'origine, puis retour au second zoom.

Mouvement réduit (`reducedMotion()`) : fondu de 150 ms, sans vol ni pivot.
Rotation du disque : `transform: rotate` sur un calque intérieur (le plateau ne bouge pas), avec un reflet
asymétrique et la pochette pour que la rotation se voie ; elle s'arrête quand la lecture est en pause ou finie
(état lu dans `getPlayerSource()` : piste en cours appartenant à cet objet et non en pause).

Style : cellulo (aplats + trait encré + ombre nette), comme les pantins et véhicules. Les visuels finaux
des boîtiers et la séquence d'animation sont **à faire par Fable** (gel jusqu'au 2026-10-17) ;
si l'implémentation passe avant, Opus pose une version simple et laisse la trace « Fable n'est pas passé ».

## Paysage forcé

À l'ouverture : `lockOrientation('landscape')` (`src/content/orientation-lock.ts`) ; à la fermeture, on rend
l'orientation de la pièce si la scène est en plein écran (`lockOrientation(orientationNow)`), sinon `unlockOrientation()`.
Le verrou n'est accordé qu'en plein écran : si l'écran reste en hauteur, la couche est **tournée de 90° en CSS**
(on incline le téléphone), dimensions largeur/hauteur échangées.

## Interface

- Couche DOM en `position:absolute; inset:0` au-dessus de la scène (même endroit que `.wmt-lib-zoom`, z-index au-dessus du zoom).
- En haut à droite, des glyphes (pas de texte) : ⏸/▶ (si une piste de l'objet est en lecture), ⓘ (fiche actuelle par-dessus), ✕ (refermer).
- Retour Android / Échap : ferme d'abord la fiche ⓘ si ouverte, sinon referme l'objet (historique comme `use-furniture-zoom`).
- Cibles tactiles 44 px ; le sélecteur défile seul si la liste est longue.
- Lecture : toucher une piste appelle `service.play(track, listen, card)` comme `ListenSection` ; Tidal ouvre le lien externe comme aujourd'hui.

## Découpage du code

- `src/core/library/opened-item.ts` (pur, testé) : `openingOf(shape)` → type d'objet ouvert ou `null` ;
  modèle du sélecteur par catégorie (lignes : piste / vidéo / BO / lien de lecture / synopsis) à partir des réponses des services ;
  géométrie de la couche (paysage ou tourné de 90°).
- `src/content/opened-item/OpenedItemLayer.tsx` : la couche, les phases, l'historique, l'orientation, les glyphes.
- `src/content/opened-item/item-case.tsx` : boîtiers CD / vinyle / DVD / jeu / livre et disque (CSS 3D).
- `src/content/opened-item/selectors.tsx` : sélecteurs musique, film, jeu, livre (réutilisent les services,
  `TrailerPlayer`, `HlsTrailerPlayer` pour la vidéo à droite).
- `LibraryPanel.tsx` : `onCard` du second zoom et le toucher d'un vinyle/pochette au mur ouvrent la couche
  quand `openingOf(shape)` n'est pas `null`, sinon `setViewing` comme avant.

## Tests

- Unitaires : `opened-item` (formes ouvrables, modèle du sélecteur, cas « rien trouvé »), couche (phases, ⓘ, ✕,
  retour, mouvement réduit, disque qui tourne selon l'état du lecteur, disque non décalé), sélecteurs.
- Nouveaux tests rangés dans la famille `scene-piece` ; jouer `npm run test:famille -- scene-piece fiche`.
- Capture d'écran de validation (album, film, jeu, livre) montrée à l'utilisateur.
- Validation d'abord sur le vrai téléphone (APK pré-prod), puis l'extension.

## Livraison

- Extension **et** app Android (même surcouche).
- Fiche WikiHow (`entries.ts`, nouvel id) dans la même PR : à quoi ça sert, d'où viennent les données, comment, limites.
- PR vers `main`, fusion, `npm run build`, pré-prod (`npm run preprod`) ; pas de production sans ordre explicite.

## Limites connues

- Pas de nouvelle source : un objet sans pistes / vidéo / lien affiche un sélecteur vide qui le dit.
- Une seule bande-annonce pour les films (TMDB `trailerKey`) ; pour les jeux, les vidéos fournies par `detail.trailer`.
- Le paysage forcé par le verrou ne marche qu'en plein écran ; ailleurs, la rotation CSS demande d'incliner le téléphone.
- Les visuels définitifs dépendent du passage de Fable.
