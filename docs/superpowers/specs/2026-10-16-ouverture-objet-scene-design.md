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
| Poste à musique | Nouvel objet de la pièce. Choisir une piste **sort le disque** et le fait tourner **sur le poste** ; la pochette est posée à côté ; changer d'album range l'ancien et pose le nouveau (voir § Poste à musique). |
| Sans poste dans la pièce | Le disque tourne dans le boîtier ouvert ; un glyphe propose d'ajouter un poste. |
| Un poste pour tout | Une seule chaîne : CD, vinyles, BO des films et des jeux. |
| Apparence | **Joli et naturel**, jamais un polygone grossier : vrai modèle en cm + décalques cellulo détaillés, dessinés par Fable. |

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
Rotation du disque **dans le boîtier** (seulement quand la pièce n'a pas de poste ; sinon il part au poste) : `transform: rotate` sur un calque intérieur (le plateau ne bouge pas), avec un reflet
asymétrique et la pochette pour que la rotation se voie ; elle s'arrête quand la lecture est en pause ou finie
(état lu dans `getPlayerSource()` : piste en cours appartenant à cet objet et non en pause).

Style : cellulo (aplats + trait encré + ombre nette), comme les pantins et véhicules. Les visuels finaux
des boîtiers et la séquence d'animation sont **à faire par Fable** (gel jusqu'au 2026-10-17) ;
si l'implémentation passe avant, Opus pose une version simple et laisse la trace « Fable n'est pas passé ».

## Poste à musique

Maquette de déroulé validée le 2026-10-16 (le dessin de la maquette n'est qu'un schéma ; l'apparence finale suit § Apparence).

### Déroulé

1. On ouvre un boîtier (album, vinyle, DVD/jeu pour sa BO) et on choisit une piste.
2. Le **boîtier reste ouvert** : seul le **disque sort du plateau** et vole jusqu'à l'endroit du poste à l'écran, **par-dessus le boîtier**
   (qui reste en grand, centré, à sa taille), en rapetissant, et s'y pose ; le poste étant souvent caché par le boîtier, on le voit
   tourner une fois la pochette fermée. Si le poste est hors de l'écran, le disque part vers le bord de son côté. Le plateau est
   alors vide et la piste en cours est marquée dans le sélecteur ; on peut choisir une autre piste du même album sans que rien ne bouge.
   **On ferme le boîtier à la main** (✕, retour) : il vole alors se poser **devant le poste** (couché sur le bureau, légèrement de biais), pas sur l'étagère.
   La place d'origine (étagère, présentoir ou mur) reste **vide** tant que l'objet est au poste. Un boîtier dont le disque n'est pas
   au poste retourne à sa place d'origine en se fermant.
3. **Toucher le poste** : bulle « En lecture » — piste, album, ⏯ (pause/lecture), ⏏ (éjecter : arrête la lecture, le disque rentre
   dans son boîtier qui retourne à sa place), ✕.
4. **Toucher la pochette posée** : rouvre le boîtier **avec le même effet d'ouverture** (vol depuis la place près du poste,
   couvercle qui pivote) pour changer de piste dans le même album. Le **plateau est vide** (moyeu seul, « le disque est sur le poste ») :
   le disque reste sur le poste et continue de tourner ; la piste en cours est marquée dans le sélecteur.
5. **Choisir une piste d'un autre album** (son boîtier ouvert) : l'ancien disque quitte le poste et rentre dans son boîtier posé à côté,
   qui retourne à sa place d'origine ; puis le nouveau disque sort du boîtier ouvert et va au poste. Le nouveau boîtier reste ouvert
   jusqu'à ce qu'on le ferme, puis se pose devant le poste.
6. Les **vidéos** (bande-annonce, vidéos Steam) ne vont pas au poste : elles se lisent toujours dans le boîtier ouvert.

### État

Le poste **reflète le lecteur réel** (`getPlayerSource()`), sans état mémorisé à part : l'album au poste est celui de la piste en cours ;
le disque tourne si elle n'est pas en pause. Une musique lancée ailleurs (fiche du site, mini-lecteur) dont l'album est dans la pièce
va aussi au poste ; sinon le poste reste vide mais sa bulle affiche la lecture en cours. Lecture finie ou arrêtée : le disque reste
posé, immobile, jusqu'à ⏏ ou au prochain album. Plusieurs postes dans la pièce : seul le **premier posé** sert.

### Objet

- Nouveau petit objet `small-hifi` (« Chaîne hi-fi »), posé **sur un bureau uniquement, sur 2 emplacements (60 cm)** — un emplacement de petit objet ne fait que 30 cm —, rangé dans la catégorie Déco
  (sous-groupe à créer « Musique »). La pochette se couche **devant** le poste, sur le bureau, sans chevaucher un autre objet.
- Mini-chaîne aux **vraies proportions** (≈ 56 × 26 × 18 cm, à affiner par Fable) : corps central ~30 cm avec, sur le dessus,
  une **platine** (plateau rond, bras, couvercle fumé relevé) et un **puits CD à chargement par le haut** ; deux enceintes ~13 cm de large
  de part et d'autre. Le disque posé est vu en perspective (ellipse) et sa rotation se voit grâce à
  l'étiquette (pochette) et au reflet.
- **Apparence** : style cellulo (aplats + trait encré + ombre nette), comme les pantins, véhicules et meubles récents ; décalques détaillés
  (tissu des enceintes, boutons, molette de volume, afficheur qui fait défiler le titre de la piste, voyant allumé pendant la lecture).
  Pas de forme brute : volumes arrondis par les décalques, comme les autres petits objets. **Réalisé par Fable** (gel jusqu'au 2026-10-17).
- Ajout d'un poste : glyphe proposé dans le boîtier ouvert quand la pièce n'en a pas → ouvre le mode Aménager sur l'objet `small-hifi`.

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
- `src/core/library/hifi.ts` (pur, testé) : quel poste sert (premier posé), quel objet de la pièce est au poste d'après la piste en cours,
  places vidées, ordre des gestes (ranger l'ancien puis poser le nouveau).
- `src/core/library/item-models.ts` + `furniture-catalog.ts` + `library-types.ts` : objet `small-hifi` (modèle en cm, emprise avec la place de la pochette,
  catalogue) ; migration du livre de la bibliothèque si le schéma l'exige.
- `src/content/hifi/` : décalques du poste (Fable), disque posé qui tourne, boîtier couché, bulle « En lecture », vols boîtier ↔ poste ↔ place d'origine.
- `LibraryPanel.tsx` : `onCard` du second zoom et le toucher d'un vinyle/pochette au mur ouvrent la couche
  quand `openingOf(shape)` n'est pas `null`, sinon `setViewing` comme avant.

## Tests

- Unitaires : `opened-item` (formes ouvrables, modèle du sélecteur, cas « rien trouvé »), couche (phases, ⓘ, ✕,
  retour, mouvement réduit, disque qui tourne selon l'état du lecteur, disque non décalé), sélecteurs.
- Poste : choix du poste (premier posé), objet au poste d'après la piste en cours (lancée ici ou ailleurs), place vidée puis rendue,
  changement d'album (ancien rangé puis nouveau posé), ⏏, pause = disque immobile, sans poste = disque dans le boîtier, emprise sans chevauchement.
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
- Les visuels définitifs (boîtiers, poste, séquences d'animation) dépendent du passage de Fable.
- Le poste suit le lecteur de l'appareil : pour Tidal (lien externe, pas de lecteur intégré), le poste ne peut pas savoir ce qui joue ;
  le disque y est posé au choix de la piste et tourne sans pouvoir suivre la pause.
- Le poste ne se pose que sur un bureau, sur 2 emplacements contigus libres ; sinon le placement le refuse comme pour les autres objets.

## Découpage en lots (pour le plan)

1. Couche d'ouverture + album (CD/vinyle) avec le disque qui tourne dans le boîtier.
2. Poste à musique (objet, déroulé, bulle) — visuels Fable.
3. Film et jeu (vidéo à la place du disque, BO vers le poste).
4. Livre.
