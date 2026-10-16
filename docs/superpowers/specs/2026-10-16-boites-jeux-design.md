# Vraies boîtes de jeux vidéo dans la scène — design

Date : 2026-10-16 · Branche : `feat/boites-jeux` (worktree `Wikimasters-boites-jeux`, depuis `main` 933f1c46)

## But et pourquoi

Dans « Ma Pièce » (vue Bibliothèque), un jeu vidéo est aujourd'hui **une boîte noire unique** (13,5 × 19 × 1,5 cm,
bande rouge) avec la jaquette Steam/IGDB devant, sans dos, et le même boîtier bleu générique (135 × 170) une fois ouvert,
avec un disque de jeu même pour une cartouche. L'utilisateur veut que chaque jeu ressemble **à la vraie boîte de sa version** :
la bonne console, les vraies dimensions, le vrai devant et le vrai dos, et à l'intérieur le vrai support (disque ou cartouche).
C'est une collection : l'objet doit être reconnaissable comme celui qu'on aurait sur son étagère.

## Décisions prises avec l'utilisateur

| Sujet | Décision |
|---|---|
| Source des pochettes | **TheGamesDB** (devant **et** dos, vrais scans). Steam / IGDB restent en repli pour le devant. |
| Plusieurs versions | Si le jeu existe sur plusieurs consoles, **on choisit la version** ; toute la boîte (gabarit, couleur, support, images) suit la console de cette version. |
| Gabarit | La boîte respecte les **dimensions réelles** de la console, fermée **et ouverte**. Ouverte = deux moitiés **identiques**, chacune égale à la boîte fermée (elle doit pouvoir se refermer) ; la taille ne dépend **jamais** du contenu. |
| Boîte ouverte, droite | **Le support seul**, entier, calé dans son logement (disque ou cartouche selon la console), jamais coupé. Pas de livret, pas de notice. |
| Boîte ouverte, gauche | **Fiche courte** (titre, console, année, studio, note) + **description** sur 3 lignes avec « Lire la suite » + **bandes-annonces** + **BO** (le sélecteur actuel est gardé). La page défile si elle déborde. Maquette validée (`.superpowers/brainstorm/…/boite-ouverte-v5.html`). |
| Dos manquant | On fabrique un dos **avec des images du jeu**. |
| Dos dans l'armoire | Le dos est **visible dans l'armoire** (nouvelle présentation « de dos »). |
| Retourner la boîte | La boîte **arrive ouverte** comme aujourd'hui (déroulé de l'ouverture inchangé). Une **flèche ⟲ au-dessus de la boîte, centrée** la retourne d'un demi-tour : on voit l'**extérieur, toujours ouvert à plat** — **dos à gauche, tranche au milieu, devant à droite**. ⟲ à nouveau revient à l'intérieur. Maquette validée (`retourner-v3.html`). |
| Loupe sur le dos | Boîte retournée : une **loupe** sur le **dos (moitié gauche)** pour lire le texte qu'il porte. |

## TheGamesDB : ce qu'on sait (vérifié le 2026-10-16)

- API REST `https://api.thegamesdb.net` (spec : `/spec.yaml`), clé `apikey` obligatoire (sans clé : HTTP 418).
- `GET /v1.1/Games/ByGameName?name=…&include=boxart,platform&fields=overview,…` renvoie **toutes les versions** d'un titre
  (une fiche par console, parfois plusieurs par console : rééditions, éditions limitées, régions), avec leurs images de boîte
  (`boxart` : `side: front|back`, `filename: boxart/front/{id}-1.jpg`), en **une requête**. `filter[platform]` disponible.
- `GET /v1/Games/Images?games_id=…&filter[type]=screenshot,fanart,clearlogo,titlescreen` : images du jeu (pour le dos fabriqué).
- Images servies par `https://cdn.thegamesdb.net/images/{original|large|medium|small|thumb}/…` — **hors quota**, sans clé.
- Quota : clé publique ≈ **1 000 requêtes / mois / IP** (sources tierces) ; politique durcie le **17/02/2026** (« peut-être
  s'inscrire pour une clé privée ») — non vérifiable sans compte forum. Chaque réponse donne `remaining_monthly_allowance`.
- Clé : compte sur `thegamesdb.net` (Sign Up), puis menu API → **API Key** (`api.thegamesdb.net/key.php`, connecté) ; hausse de quota via **API Limit Increase** (`/increase_usage.php`). Le forum est désormais fermé (HTTP 401). À faire **par l'utilisateur**.
- Couverture mesurée (18 titres, 72 fiches) : **devant 72/72** ; **dos** présent sur la version principale de presque tous
  les jeux d'avant 2010, souvent absent pour les jeux récents/indés (Hollow Knight, Stardew Valley, Baldur's Gate 3, Minecraft),
  parfois présent sur une seule console (Elden Ring : Xbox One ; Celeste : PS4). Scans surtout **NTSC-U** (textes en anglais).
- Aucun type d'image pour cartouche, disque ou livret → le support est **dessiné**.

## Données et relais

- **Relais** (`relay/`) : nouvelle route `GET /tgdb/games?name=…` (et `/tgdb/images?ids=…`) sur le modèle de `proxyTmdb` :
  liste blanche de paramètres, secret `TGDB_API_KEY`, entrée dans `LIMITS`, statut dans `/status`.
  Réponses mémorisées **en KV sans expiration** (les scans ne changent pas) ; le quota mensuel n'est consommé qu'une fois par titre.
- **Rapprochement carte → TheGamesDB** : par titre (titre de la carte, puis titre du jeu choisi Steam/IGDB, puis titre original),
  normalisé ; on garde les fiches dont le titre correspond. Année de sortie IGDB/Steam pour départager. *(Appel du constructeur
  sur la règle exacte ; viser zéro faux positif plutôt que tout trouver.)*
- **Version choisie** (nouveau dépôt `game-version-v1`, `slug → { tgdbId, platformId }`), à côté de `game-choice-v1` (inchangé).
  **Version par défaut** *(choix Claude)* : parmi les fiches rapprochées, celle qui a un **dos**, sinon un devant, en préférant
  la plateforme du jeu Steam/IGDB choisi, puis la sortie la plus ancienne.
- **Où choisir la version** *(choix Claude)* : dans la section Jeu vidéo de la fiche, à côté du glyphe ⇄ existant, un glyphe
  console qui ouvre la liste des versions (console, région, vignette, ✓ si dos). Changer de version oublie les images mémorisées
  de la carte (comme `forgetGameArt`).
- **Images** (règle « API avant remplacement ») : devant = TheGamesDB de la version, sinon Steam/IGDB actuels ; dos = TheGamesDB,
  sinon **dos fabriqué**. Nouvelle source → incrémenter `ART_VERSION`.
- **Description** : Steam en français, sinon IGDB, sinon `overview` TheGamesDB (anglais).

## Gabarits par console

Une table pure `src/core/game/platform-boxes.ts` : plateforme TheGamesDB (id) → gabarit. Chaque gabarit donne
dimensions fermées (l × h × épaisseur, cm), couleur du plastique, forme (boîtier qui s'ouvre / boîte carton), support
(disque 12 cm, mini-disque, cartouche avec ses dimensions réelles), et le bandeau éventuel (logo console).
Valeurs indicatives relevées (les sources varient de quelques mm ; le constructeur les recoupe et note sa source) :

| Famille | Fermée (l × h × ép.) | Support |
|---|---|---|
| PS3 / PS4 / PS5 / Xbox One / Series (Blu-ray) | 13,5 × 17 × 1,4 | disque 12 cm |
| PS2 / Xbox / Xbox 360 / Wii / PC DVD / Wii U | 13,5 × 19 × 1,4 | disque 12 cm |
| GameCube | 13,5 × 19 × 1,4 | mini-disque 8 cm |
| Switch | 10,5 × 17 × 1,1 | cartouche ≈ 2,1 × 3,1 cm |
| DS / 3DS | 13,5 × 12,2 × 1,4 | cartouche ≈ 3,5 × 3,3 cm |
| PSP (UMD) | 11 × 18 × 1,4 | UMD ≈ 6,5 × 6,4 cm |
| PS1 / Saturn / Dreamcast (boîtier CD) | 14,2 × 12,5 × 1 | disque 12 cm |
| Boîtes carton (NES, SNES, N64, Game Boy, GBA, Mega Drive…) | **hors champ pour l'instant** → gabarit « Inconnue » | — |
| Inconnue | gabarit actuel 13,5 × 19 × 1,5 | disque 12 cm |

Le support est à **l'échelle réelle** de la boîte : une cartouche Switch occupe donc une petite place dans sa moitié, comme en vrai.

## Scène

### Armoire (rangé)
- Le modèle `game` de `ITEM_MODELS` prend les dimensions du gabarit de la version de la carte (aujourd'hui fixe par forme) :
  l'emprise (`itemFootprintCm`, `storedWidthCm`) dépend donc de l'objet. Un objet qui ne tient plus sur sa tablette après un
  changement de version reste où il est jusqu'au prochain déplacement *(appel du constructeur ; ne jamais perdre l'objet)*.
- Nouvelle présentation **« de dos »** : `StoredDisplay = 'cover' | 'spine' | 'back'` (+ bouton « Présenter de dos » dans
  `DisplayButtons`, bulle de sélection et barre de placement). Schéma du livre de la bibliothèque → **v8** + `migrateV7` (sans
  changement de données, l'ancienne version ne relit pas).
- Nouveau rôle de décalque `back:game` (face arrière) ; `ItemContent` reçoit `backUrl`. Le second zoom (`shelf-board-zoom`) montre
  le dos quand la présentation est « de dos ».
- Couleur du boîtier et bandeau selon la console (fini le rouge unique).

### Retourner (⟲)
- Dans la couche d'ouverture (`OpenedItemLayer`), pour les jeux : glyphe **⟲** (44 px) **au-dessus de la boîte ouverte, centré
  sur elle** (pas dans la rangée ⏯ ⓘ ✕ en haut à droite).
- Il fait pivoter la boîte ouverte de 180° autour de l'axe vertical (rotateY, ~700 ms ; fondu en mouvement réduit) :
  face extérieure = **dos | tranche | devant**, chacun à la taille d'une moitié (tranche = épaisseur du gabarit).
- Retournée, la vidéo éventuelle est arrêtée et le disque revient ; ⟲ ramène l'intérieur. Fermer (✕, retour) depuis l'extérieur
  referme la boîte normalement (retour à l'intérieur sans animation, puis fermeture habituelle).

### Loupe sur le dos
- Boîte retournée : glyphe **loupe** (44 px) posé sur la moitié gauche (le dos), toujours visible.
- Le toucher affiche **le dos entier, en grand**, ajusté à l'écran (rien de coupé) — décision utilisateur. Image dans sa **meilleure
  définition** (`images/original/` de TheGamesDB, souvent plus de 1 Mo ; repli `medium` pendant le chargement).
- **Zoom aux doigts** (pincer), glisser pour se déplacer une fois zoomé ; *(choix Claude)* double-toucher revient à l'ajustement.
- La **croix ✕** ramène à la **vue pochette intégrale** (boîte retournée : dos | tranche | devant) ; retour Android / Échap font pareil.
- Dos fabriqué : la loupe marche aussi (texte = description).

### Boîte ouverte
- `GEOMETRY['game-case']` fixe remplacé par une géométrie **calculée depuis le gabarit** : deux moitiés égales à la boîte
  fermée + charnière ; sélecteur à gauche, logement à droite dimensionné sur le support.
- Gauche : en-tête fiche courte + description (3 lignes, « Lire la suite » déplie) + lignes actuelles de `gameRows`
  (vidéo puis BO) ; défilement interne.
- Droite : disque (12 cm / 8 cm / UMD) ou **cartouche dessinée** (forme propre à la console, étiquette = devant de la version) ;
  la vidéo prend sa place comme aujourd'hui ; une BO envoie le disque au poste comme aujourd'hui (une cartouche y va aussi,
  `DiscFlight` apprend `game` / `cartridge`).
- Boîtes carton : **pas dans cette livraison** (décision utilisateur 2026-10-16) ; ces jeux gardent le boîtier plastique générique.

### Dos fabriqué
- Mise en page de dos de boîte au gabarit de la console : logo (`clearlogo` TheGamesDB) ou titre, 3 à 4 **captures du jeu**
  (TheGamesDB `screenshot`, sinon Steam/IGDB), début de la description, bandeau console. Rendu cellulo.

## Hors champ
- Livret, notice, papiers ; photos réelles de disques/cartouches.
- Boîtes en carton (NES, SNES, N64, Game Boy, GBA, Mega Drive…) : premier temps sans elles.
- Pochettes recto/verso des **livres** et des **albums** (Cover Art Archive) : chantiers séparés.
- Changer le déroulé validé de l'ouverture (poste, vidéo, BO) au-delà de ce qui est décrit ici.

## Anti-buts
- Une boîte dont la taille change avec son contenu, ou dont les deux moitiés diffèrent.
- Un support coupé ou débordant de son logement.
- Une mauvaise version affichée en silence (faux rapprochement) : mieux vaut le repli Steam/IGDB.
- Épuiser le quota TheGamesDB (appels non mémorisés, un appel par affichage).

## Livraison
- Extension **et** app Android ; validation d'abord sur le vrai téléphone (APK pré-prod).
- Visuels (cartouches, boîtiers, dos fabriqué) par Opus avec la trace « Fable n'est pas passé » (gel Fable jusqu'au 2026-10-17).
- Fiche WikiHow (`entries.ts`, nouvel id) dans la même PR ; capture de validation montrée à l'utilisateur.
- Tests : familles `scene-piece`, `fiche`, `relais`.
- Prérequis utilisateur : **clé TheGamesDB** posée en secret du relais (`wrangler secret put TGDB_API_KEY`).

## Choix de Claude (après relecture)
- Jeu sans correspondance TheGamesDB : gabarit déduit de la plateforme du jeu Steam/IGDB choisi (table nom IGDB → gabarit) ; Steam seul → boîtier PC DVD.
- Région : à dos égal, préférer la version **PAL / Europe** à NTSC-U.
- BO d'un jeu à cartouche : la cartouche se **pose couchée sur la chaîne**, sans tourner ; notes de musique comme d'habitude.
- Quota : TheGamesDB n'est interrogé que pour un jeu **affiché** (fiche, pièce visible), réponse mémorisée sans expiration ; jamais de pré-remplissage de toute la Collection.

## Laissé au constructeur
- Règle exacte de rapprochement par titre ; tri des doublons d'une même console.
- Dimensions précises de chaque gabarit et dessins des cartouches.
- Découpage en lots du plan.
