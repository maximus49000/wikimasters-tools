# Vue Bibliothèque : ranger ses cartes dans des pièces

Date : 2026-10-08. Branche : `docs/bibliotheque-spec`.

## Objectif

Ajouter à la Collection une quatrième vue, **Bibliothèque**, à côté de Homemade, Monde, Chronologie et Toile. Le joueur y aménage une ou plusieurs **pièces** vues de face : style de décoration, meubles, cartes accrochées au mur ou rangées dans des étagères, une fenêtre animée, et des animaux qui vivent dans la pièce.

C'est un projet de plusieurs semaines. Cette spec fixe la **vision d'ensemble et les décisions**, puis détaille **le morceau 1 (socle)**. Chaque morceau suivant aura sa propre mini-spec complétée, son plan et sa PR.

## Contraintes héritées

- Extension en lecture seule : aucune requête ajoutée vers l'API du jeu. Les cartes viennent de la Collection déjà connue (`collection-book`).
- Tout est **local** (comme `wmt:geo`) : les pièces ne sont pas partagées entre appareils.
- Même code pour l'extension Chrome et l'appli mobile (Android) : tout doit se manipuler au doigt, sans survol ni clic droit. Tout est visible à l'écran, glyphes plutôt que du texte.
- Le dessin est **vectoriel (SVG + CSS)**, sans image à télécharger : léger sur mobile, animable.
- Une fiche WikiHow (`entries.ts`) et une annonce « Quoi de neuf » sont ajoutées dans la même PR que chaque morceau fonctionnel.

## Décisions prises avec l'utilisateur

| Sujet | Décision |
| --- | --- |
| Placement | **Emplacements sur grille** (pas de placement libre au pixel). |
| Style graphique | Vue de face en SVG/CSS, rendu moderne (aplats doux, coins arrondis). |
| Pièces | Plusieurs pièces par joueur, chacune avec son style, ses meubles, ses cartes. |
| Styles | Au choix : Scandinave, Moderne, Industriel, Bohème, Rétro 70s, Japandi, Néon gaming. |
| Placement d'une carte | On choisit **d'abord la carte, puis la forme**. |
| Formes au mur | Poster (image de la carte) ; vinyle (étiquette ronde avec image rognée et texte, couleur du disque au choix) ; pochette (carrée, ronde, cadre). |
| Formes en étagère | CD, DVD, jeu vidéo, livre : dos avec petite image et titre. |
| Ordinateur | Une carte peut s'afficher à l'écran. |
| Carte murale | Une carte du monde accrochée au mur, dont le zoom est choisi par le joueur, qui affiche plusieurs points de la Collection que le joueur sélectionne. |
| Ouverture | Toucher un objet rangé le sort de l'étagère, l'ouvre, et révèle **la fiche existante de la carte** (aucun écran de contenu nouveau). |
| Fenêtre | Scènes : ville, campagne, montagne, mer, espace, Terre. Météo aléatoire ou forcée, sur les scènes terrestres seulement. Au moins 15 événements par scène. |
| Météo | Valeurs continues avec transitions de 20 à 60 s, jamais de bascule brute. |
| Heure | Réelle, jour forcé, nuit forcée ou manuelle. Lever et coucher du soleil calculés pour la position de l'appareil. |
| Animaux | Chat et chien, environ 15 comportements chacun, qui dépendent des meubles posés. Déplacements continus (marche, saut en arc), jamais de téléportation. |

## Découpage

| # | Morceau | Contenu |
| --- | --- | --- |
| 1 | **Socle** (détaillé ci-dessous) | Vue, pièces multiples, grille, mode Visiter/Aménager, étagère, bureau, ordinateur vides, style Scandinave, mémorisation. |
| 2 | Cartes | Choix carte puis forme, mur / étagère / écran, ouverture avec la fiche existante. |
| 3 | Mobilier | Chaises, canapé, panier, gamelle, niche, plantes, tapis… |
| 4 | Styles et décor | Les 6 autres styles, la tapisserie, le sol. |
| 5 | Fenêtre, ciel, météo | Les 6 scènes, l'heure, le soleil réel, les transitions, les événements. |
| 6 | Animaux | Chat, chien, machine à états, déplacements, comportements, réactions au contexte. |
| 7 | Événements aléatoires | Complément des listes d'événements par scène (voir « Événements » en fin de spec). |

Ordre conseillé : 1, 2, 3, 4, puis 5 (qui sert à 6 et 7).

---

# Morceau 1 : le socle

## Ce que voit le joueur

- Dans le sélecteur de vues de la Collection, un nouveau glyphe **livre** : Bibliothèque. Le choix est mémorisé comme les autres vues (`wmt:collectionView` = `library`).
- Une bande de **pièces** en haut : un onglet par pièce, un bouton **+** pour en créer. Appui long (ou bouton ✎) sur un onglet : renommer, supprimer (avec confirmation). 12 pièces au maximum.
- Une nouvelle pièce est vide : mur et sol Scandinave, rien d'autre.
- Deux modes, par un interrupteur crayon / œil :
  - **Visiter** : on voit la pièce, rien ne se déplace par erreur.
  - **Aménager** : la grille apparaît en filigrane. Un bouton **+ Meuble** ouvre le catalogue ; on touche un meuble, puis une case libre pour le poser ; toucher un meuble posé permet de le **déplacer** (puis toucher la nouvelle case) ou de le **retirer** (poubelle).
- Catalogue du morceau 1 : **Étagère** (3 niveaux), **Bureau**, **Ordinateur** (posé sur un bureau).
- La pièce est entièrement dessinée en SVG et s'adapte à la largeur de l'écran (ratio fixe 720 × 340), y compris sur téléphone.

## Grille

- La pièce fait **24 colonnes × 12 lignes**. Les lignes 0 à 8 sont le **mur** ; les lignes 9 à 11 sont le **sol**.
- Un meuble déclare sa **zone** (`wall` ou `floor`), sa **taille** en cases, et ses **emplacements** (voir plus bas). Il se pose si toutes ses cases sont libres dans la bonne zone ; sinon la pose est refusée et les cases fautives clignotent.
- L'ordinateur a pour zone `desk` : il ne se pose que sur un bureau, sur la case d'emplacement prévue.
- Les emplacements (slots) servent au morceau 2 : une étagère déclare 3 niveaux de 8 emplacements, un bureau 1 emplacement d'écran via l'ordinateur. Dans le morceau 1 ils sont définis et affichés en pointillés en mode Aménager, sans accepter de carte.

## Composants

### Cœur (`src/core/library/`)

- `library-types.ts` : types `Room`, `Placed`, `FurnitureKind`, `StyleId`, `LibraryState`.
- `furniture-catalog.ts` : la définition de chaque meuble (id, zone, taille, slots, fonction de dessin SVG). Un meuble ajouté plus tard = une entrée dans ce fichier.
- `room-grid.ts` : fonctions pures `canPlace`, `place`, `move`, `remove` sur une pièce. Aucune dépendance au DOM.
- `styles.ts` : palettes de style (variables CSS : mur, sol, bois, métal…). Le morceau 1 ne livre que `scandinave` ; le type admet déjà les 7 identifiants.
- `library-book.ts` : état persistant `{ version: 1, activeRoomId, rooms: Room[] }`, `createRoom`, `renameRoom`, `deleteRoom`, `setActive`. Clé `wmt:library` ; tout accès au stockage est protégé par try/catch et retombe sur « une pièce vide » (comme `readView`). Un champ `version` prévoit les migrations.

### Interface (`src/content/`)

- `LibraryPanel.tsx` : barre de pièces, interrupteur Visiter / Aménager, catalogue, état du mode.
- `RoomView.tsx` : le SVG de la pièce. Il lit la pièce et le style, dessine le mur, le sol, les meubles et, en mode Aménager, la grille.
- `collection-view.ts` : ajoute `'library'` au type et à `readView`.
- `world-toggle.ts` : ajoute l'entrée `{ view: 'library', label: 'Bibliothèque : ranger ses cartes dans des pièces', glyph: BOOK }`.
- `collection-ui.tsx` : une branche `view === 'library'` dans `mountPanel`, avec le même habillage (RecountGate, shadow DOM, `PANEL_CSS`).

## Cas limites

- Stockage indisponible ou corrompu : une pièce vide par défaut, sans erreur affichée.
- Dernière pièce : on ne peut pas la supprimer, seulement la vider.
- Suppression d'une pièce : confirmation, puis la pièce voisine devient active.
- Un meuble qui ne rentre pas (bord de la grille, case occupée) : refus et clignotement des cases.
- Retrait d'un bureau qui porte un ordinateur : l'ordinateur est retiré avec lui (confirmation si des cartes y sont posées, dès le morceau 2).
- Très petit écran : la pièce se réduit (ratio fixe) ; les cibles tactiles de la barre font au moins 40 px.
- Thème sombre du site : la pièce garde son propre style ; seuls les contrôles (barre, boutons) suivent les variables du site.

## Tests (Vitest)

- `room-grid` : pose valide, hors zone, collision, déplacement, retrait, ordinateur uniquement sur un bureau.
- `library-book` : création, renommage, suppression de la dernière pièce refusée, limite de 12, sérialisation et lecture d'un état corrompu.
- `furniture-catalog` : chaque meuble tient dans la grille et ses emplacements sont dans sa surface.
- `collection-view` et `world-toggle` : la valeur `library` est lue, écrite et proposée dans le sélecteur.
- `LibraryPanel` : créer / renommer / supprimer une pièce, basculer Visiter / Aménager, poser et retirer un meuble.
- Vérification manuelle dans Chrome (recharger l'extension) et dans l'appli mobile (tactile, rotation).

## Hors périmètre du morceau 1

Cartes dans la pièce, autres meubles, autres styles, fenêtre, météo, animaux, événements. Le sélecteur de style et le bouton fenêtre n'apparaissent pas encore.

---

# Vision des morceaux suivants

## Morceau 2 : les cartes

Choix de la carte (liste filtrable de la Collection), puis de la forme.
- Mur : poster, vinyle (couleurs : noir, rouge, bleu, vert, or), pochette (carrée, ronde, cadre).
- Étagère : CD, DVD, jeu vidéo, livre. Le dos affiche une petite image et le titre ; la forme conseillée dépend du type de la carte (musique → CD ou vinyle, film → DVD, jeu → jeu vidéo, livre → livre).
- Écran de l'ordinateur : une carte affichée.
- **Carte murale** : un cadre au mur (grande taille en cases) qui montre une carte du monde, réutilisant les positions de la vue Monde (`geo-book`). Le joueur règle le **centre et le zoom** (glisser, pincer, boutons + et −) en mode Aménager, puis choisit **les cartes de la Collection** à y afficher comme points (liste à cocher). En mode Visiter, la carte est figée à ce cadrage ; toucher un point ouvre la fiche de la carte. Le cadrage et la liste de cartes sont mémorisés par cadre (plusieurs cartes murales possibles, chacune avec son cadrage). Les cartes sans position sont proposées dans « À placer », comme dans la vue Monde.
- Animation d'ouverture (maquette validée avant écriture du plan) : l'objet s'efface de l'étagère, se retourne face au joueur en pivotant sur lui-même, puis s'ouvre sur la charnière (couverture pour le livre, boîtier pour le DVD, le CD et le jeu) ; la face intérieure montre un disque ou des pages, et la fiche de la carte apparaît en fondu à droite. « Ranger » rejoue l'animation à l'envers jusqu'à l'emplacement d'origine.
- Ouverture : le dos se soulève, l'objet se retourne, la fiche existante de la carte apparaît (même mécanisme que les autres vues, `onOpen`).
- Les cartes sont référencées par leur slug ; une carte qui n'est plus connue s'affiche en grisé.

## Morceau 3 : le mobilier

Chaises, canapé, fauteuil, panier, gamelle, niche, plantes, tapis, lampe… Chaque meuble déclare ses **points d'intérêt** pour les animaux (assise du canapé, creux du panier, bord de la gamelle).

## Morceau 4 : styles et décor

Sept styles (palette, bois, métal, cadres, éclairage), tapisserie, sol. Le style Néon gaming ajoute un liseré lumineux aux meubles.

## Morceau 5 : fenêtre, ciel, météo

- Scènes : ville, campagne, montagne, mer, espace, Terre.
- **Météo** : états aléatoires ou forcés (soleil, nuageux, bruine, pluie, orage, neige, brume), modélisés par des valeurs continues (couverture nuageuse, précipitation, humidité du sol, vent, brume, luminosité). Les transitions passent par des états logiques (soleil, nuageux, bruine, pluie, orage ; au retour, éclaircie, arc-en-ciel). Les flaques se forment et sèchent ; la neige s'accumule et fond.
- **Pluie vivante** : nuages sombres qui défilent, deux profondeurs de gouttes, gouttes qui glissent sur la vitre, ondulations, éclairs, phares et fenêtres allumées.
- **Heure** : réelle, jour, nuit ou manuelle. Le lever et le coucher du soleil sont calculés **localement** (formule astronomique, sans service externe) pour la position de l'appareil. La position vient de la géolocalisation du navigateur (avec accord du joueur) ; à défaut, du fuseau horaire.
- Les scènes spatiales (espace, Terre) n'ont pas de météo : seulement des événements.

## Morceau 6 : animaux

Machine à états : choisir un but selon les meubles présents, marcher jusqu'à l'approche, éventuellement sauter, jouer le comportement, repartir. Les déplacements sont continus : marche à vitesse constante, saut en arc de parabole, jamais de téléportation. Un meuble retiré replanifie l'animal.

Comportements (environ 15 par espèce) :
- Communs : dormir (panier, canapé, niche), manger, boire, se toiletter, s'étirer, bâiller, se rouler, courir en rond, monter et descendre du canapé.
- Chat : griffer un fauteuil, pétrir un coussin, bondir sur son ombre, jouer avec une pelote, chasser une mouche, se lover sur le bureau, grimper sur l'étagère, se cacher sous le canapé, suivre les oiseaux à la fenêtre, « zoomies » la nuit.
- Chien : rapporter une balle, creuser le tapis, se gratter, gratter la porte, enterrer un os, remuer la queue ou aboyer à la fenêtre, lécher la vitre, hurler à la lune, se secouer après la pluie.
- Contexte : dormir la nuit, se coucher dans la tache de soleil le jour, se cacher pendant l'orage, regarder les événements de la fenêtre.

## Morceau 7 : événements (au moins 15 par scène)

- **Ville** : avion, hélicoptère, drone, ballon, cerf-volant, avion à banderole, bus, tram, ambulance, camion-poubelle, livreur à vélo, passants sous parapluie (pluie), promeneur de chien, grue, enseigne néon, appartement qui s'allume, feu d'artifice (nuit).
- **Campagne** : tracteur, moissonneuse, troupeau de moutons, vache qui broute, cheval au galop, renard, lapin, cerf à l'aube, cigogne, corbeaux, montgolfière, moulin à vent, papillons, fumée de cheminée, arc-en-ciel (après la pluie), lucioles et hibou (nuit), étoile filante.
- **Montagne** : aigle, parapente, télécabine, skieur, randonneur, bouquetins, chamois, marmotte, hélicoptère de secours, avalanche lointaine, cascade, nuage accroché au sommet, train à crémaillère, dameuse (nuit), loup qui hurle à la lune, refuge qui s'allume, aurore boréale, étoile filante.
- **Mer** : voilier, ferry, cargo, bateau de pêche, kayak, surfeur, ski nautique, hydravion, mouettes, dauphins, baleine qui souffle, banc de poissons, tortue, périscope de sous-marin, bateau fantôme dans la brume, faisceau du phare (nuit), feu d'artifice sur la plage, tempête avec grosses vagues.
- **Espace** : station Mir, ISS, satellite, fusée, capsule, astronaute à la dérive, astéroïde, comète, pluie de météores, supernova, OVNI, sonde Voyager, éclipse, nébuleuse, planète avec lune qui passe, aurore, trou noir qui déforme les étoiles.
- **Terre vue d'en haut** : station orbitale, train de satellites, navette ou Soyouz, fusée au décollage, astronaute en sortie, étoile filante, lune qui passe, lever de soleil orbital, ouragan, orage vu d'en haut, aurore polaire, villes lumineuses la nuit, éruption de volcan, débris spatiaux, capsule cargo, ballon-sonde.

Chaque événement est une petite description (apparition, trajet, durée, conditions météo et heure). Un tirage pondéré choisit parmi ceux qui sont possibles dans la situation (pas de feu d'artifice en plein jour ni de parapluies sans pluie).

## Risques et points ouverts

- **Volume** : plus de 90 événements et une trentaine de comportements. Les livrer par vagues, avec une même mécanique (descriptions de données plus un moteur), plutôt que du code spécifique à chaque événement.
- **Performance sur mobile** : limiter les éléments SVG animés ; suspendre les animations quand la vue n'est pas visible ou que la page est en arrière-plan.
- **Géolocalisation** : accord du joueur requis ; repli sur le fuseau horaire ; heures calculées sur l'appareil, rien n'est envoyé.
- **Fiche d'une carte absente** : une carte rangée puis disparue de la Collection s'affiche en grisé et n'ouvre pas de fiche.
- **Taille de l'état** : une pièce pleine reste très petite (identifiants et coordonnées) ; pas de risque pour le stockage local.
