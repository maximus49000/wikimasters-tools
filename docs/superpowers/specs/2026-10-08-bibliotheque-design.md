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
| Boosters | Un **présentoir de boosters** se pose sur une surface (table, étagère, commode…). Il contient **exactement le nombre de boosters à ouvrir** dans l'application. Toucher un booster l'ouvre : il sort du présentoir, tremble, se déchire, puis la fenêtre d'ouverture existante s'affiche. Dix styles de présentoir au choix (voir morceau 2). |
| Pièce d'accueil | Le joueur peut définir **une pièce comme ouverte au lancement**. Dans ce cas, c'est cette pièce qui s'affiche dès l'ouverture de l'application. |
| Orientation | Chaque pièce s'affiche en **horizontal ou en vertical**, au choix du joueur ; l'orientation est **figée** (elle ne suit pas la rotation de l'appareil). Une pièce n'a **qu'un seul aménagement**, sur une bande de **même hauteur** dont la largeur peut grandir : l'orientation ne change que la **fenêtre visible** (large en horizontal, étroite en vertical). Ce qui dépasse de la fenêtre s'atteint en **faisant défiler** à droite ou à gauche. |
| Styles | Au choix : Scandinave, Moderne, Industriel, Bohème, Rétro 70s, Japandi, Néon gaming, **Steampunk** (laiton, cuivre, cuir et rivets ; mobilier et fenêtre dédiés, voir morceaux 4, 5 et 7). |
| Placement d'une carte | On choisit **d'abord la carte, puis la forme**. |
| Formes au mur | Poster (image de la carte) ; vinyle (étiquette ronde avec image rognée et texte, couleur du disque au choix) ; pochette (carrée, ronde, cadre). |
| Formes en étagère | CD, DVD, jeu vidéo, livre : dos avec petite image et titre. |
| Ordinateur | Une carte peut s'afficher à l'écran. |
| Carte murale | Une carte du monde accrochée au mur, dont le zoom est choisi par le joueur, qui affiche plusieurs points de la Collection que le joueur sélectionne. |
| Ouverture | Toucher un objet rangé le sort de l'étagère, l'ouvre, et révèle **la fiche existante de la carte** (aucun écran de contenu nouveau). |
| Fenêtre | Scènes : ville, campagne, montagne, mer, espace, Terre. Météo aléatoire ou forcée, sur les scènes terrestres seulement. Au moins 15 événements par scène. |
| Météo | Valeurs continues avec transitions de 20 à 60 s, jamais de bascule brute. |
| Heure | Réelle, jour forcé, nuit forcée ou manuelle. Lever et coucher du soleil calculés pour la position de l'appareil. |
| Animaux | Chat, chien et **robot** (compagnon mécanique), **ensemble dans la même pièce** (un de chaque espèce au plus) et capables d'**interagir entre eux**, environ 15 comportements chacun, qui dépendent des meubles posés. Déplacements continus (marche, saut en arc), jamais de téléportation. |

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
- **Pièce d'accueil** : une étoile sur l'onglet (ou dans le menu de la pièce) la définit comme pièce d'accueil ; une seule à la fois, et toucher l'étoile de la pièce d'accueil retire ce réglage. Au lancement (première ouverture de la Collection après le démarrage de l'extension ou de l'appli mobile), si une pièce d'accueil est définie, la vue passe directement en **Bibliothèque** sur cette pièce, avec son orientation et son défilement d'origine. Le joueur navigue ensuite librement ; le réglage ne s'applique qu'à ce premier affichage. Sans pièce d'accueil, la vue mémorisée habituelle est conservée.
- Une nouvelle pièce est vide : mur et sol Scandinave, rien d'autre.
- Deux modes, par un interrupteur crayon / œil :
  - **Visiter** : on voit la pièce, rien ne se déplace par erreur.
  - **Aménager** : la grille apparaît en filigrane. Un bouton **+ Meuble** ouvre le catalogue ; on touche un meuble, puis une case libre pour le poser ; toucher un meuble posé permet de le **déplacer** (puis toucher la nouvelle case) ou de le **retirer** (poubelle).
- Catalogue du morceau 1 : **Étagère** (3 niveaux), **Bureau**, **Ordinateur** (posé sur un bureau).
- Un sélecteur **horizontal / vertical** (glyphes) règle l'orientation de la pièce active. Une nouvelle pièce prend l'orientation de la pièce précédente (horizontale la première fois).
- La pièce est entièrement dessinée en SVG, de hauteur fixe (340). La **fenêtre visible** fait 24 colonnes en horizontal (720 × 340) et 14 colonnes en vertical (420 × 340) : la même pièce, vue de plus près en vertical. Quand l'appareil est tourné dans l'autre sens, la fenêtre **garde son orientation** et se réduit pour tenir, sans pivoter.
- Une pièce plus large que la fenêtre se **fait défiler** horizontalement (glissement du doigt ou barre de défilement). Aux deux extrémités, un bouton **+** ajoute une **zone vide de 12 colonnes** (mur et sol prolongés), qu'on remplit ensuite de meubles. Un bouton **−** retire la zone du bord quand elle est entièrement vide. Une pièce fait de 24 à 96 colonnes.

## Grille

- La pièce fait **12 lignes** de haut : lignes 0 à 8 de **mur**, 9 à 11 de **sol** ; sa largeur est un multiple de 12 colonnes (**24 au départ**, 96 au plus). Les colonnes se comptent depuis le bord gauche ; ajouter une zone à gauche décale tous les meubles de 12 colonnes.
- Une pièce a **un seul aménagement**. Changer d'orientation ne le modifie pas : seule la fenêtre visible change (24 ou 14 colonnes). Rien n'est perdu en passant de l'un à l'autre.
- Un meuble déclare sa **zone** (`wall` ou `floor`), sa **taille** en cases, et ses **emplacements** (voir plus bas). Il se pose si toutes ses cases sont libres dans la bonne zone ; sinon la pose est refusée et les cases fautives clignotent.
- L'ordinateur a pour zone `desk` : il ne se pose que sur un bureau, sur la case d'emplacement prévue.
- Les emplacements (slots) servent au morceau 2 : une étagère déclare 3 niveaux de 8 emplacements, un bureau 1 emplacement d'écran via l'ordinateur. Dans le morceau 1 ils sont définis et affichés en pointillés en mode Aménager, sans accepter de carte.

## Composants

### Cœur (`src/core/library/`)

- `library-types.ts` : types `Room` (nom, style, `orientation`, `cols`, `layout`), `Placed`, `FurnitureKind`, `StyleId`, `Orientation`, `LibraryState`.
- `furniture-catalog.ts` : la définition de chaque meuble (id, zone, taille, slots, fonction de dessin SVG). Un meuble ajouté plus tard = une entrée dans ce fichier.
- `room-grid.ts` : fonctions pures `canPlace`, `place`, `move`, `remove` sur l'aménagement d'une pièce, selon sa largeur en colonnes. Aucune dépendance au DOM.
- `styles.ts` : palettes de style (variables CSS : mur, sol, bois, métal…). Le morceau 1 ne livre que `scandinave` ; le type admet déjà les 7 identifiants.
- `library-book.ts` : état persistant `{ version: 1, activeRoomId, homeRoomId: string | null, rooms: Room[] }`, `createRoom`, `renameRoom`, `deleteRoom`, `setActive`. Clé `wmt:library` ; tout accès au stockage est protégé par try/catch et retombe sur « une pièce vide » (comme `readView`). Un champ `version` prévoit les migrations.

### Interface (`src/content/`)

- `LibraryPanel.tsx` : barre de pièces, interrupteur Visiter / Aménager, catalogue, état du mode.
- `RoomView.tsx` : le SVG de la pièce. Il lit la pièce et le style, dessine le mur, le sol, les meubles et, en mode Aménager, la grille.
- `collection-view.ts` : ajoute `'library'` au type et à `readView`.
- `world-toggle.ts` : ajoute l'entrée `{ view: 'library', label: 'Bibliothèque : ranger ses cartes dans des pièces', glyph: BOOK }`.
- `collection-ui.tsx` : une branche `view === 'library'` dans `mountPanel`, avec le même habillage (RecountGate, shadow DOM, `PANEL_CSS`).

## Cas limites

- Stockage indisponible ou corrompu : une pièce vide par défaut, sans erreur affichée.
- Dernière pièce : on ne peut pas la supprimer, seulement la vider.
- Suppression de la pièce d'accueil : le réglage est retiré.
- Suppression d'une pièce : confirmation, puis la pièce voisine devient active.
- Un meuble qui ne rentre pas (bord de la grille, case occupée) : refus et clignotement des cases.
- Retrait d'un bureau qui porte un ordinateur : l'ordinateur est retiré avec lui (confirmation si des cartes y sont posées, dès le morceau 2).
- Rotation de l'appareil : sans effet sur l'orientation de la pièce ; seule la taille d'affichage change.
- Retrait d'une zone du bord : refusé tant qu'un meuble s'y trouve (ou le recouvre) ; la largeur ne descend pas sous 24 colonnes. Un meuble posé à cheval sur la frontière de deux zones est permis.
- Ajout à gauche : les meubles se décalent de 12 colonnes et la vue reste sur les mêmes meubles.
- Très petit écran : la pièce se réduit (ratio fixe) ; les cibles tactiles de la barre font au moins 40 px.
- Thème sombre du site : la pièce garde son propre style ; seuls les contrôles (barre, boutons) suivent les variables du site.

## Tests (Vitest)

- `room-grid` : grille de 12 lignes et largeur variable, pose valide, hors zone, collision, déplacement, retrait, ordinateur uniquement sur un bureau.
- `library-book` : agrandir et réduire une pièce (décalage à gauche, refus si zone occupée, bornes 24 et 96), pièce d'accueil (définir, retirer, suppression de la pièce d'accueil), création, renommage, suppression de la dernière pièce refusée, limite de 12, sérialisation et lecture d'un état corrompu.
- `furniture-catalog` : chaque meuble tient dans la grille et ses emplacements sont dans sa surface.
- (morceau 6) coordinateur de compagnons : une place réservée n'est jamais occupée par deux compagnons, une interaction refusée n'a aucun effet, les déplacements restent continus pendant une interaction.
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
- **Présentoir de boosters** : petit coffret ouvert (environ 4 × 2 cases en paysage), posé sur une surface (table, étagère, commode, tout meuble qui déclare une surface). Les paquets sont rangés **entièrement à l'intérieur**, sur deux rangées, légèrement inclinés et à des hauteurs un peu différentes ; seules leurs têtes dépassent de la face avant, qui porte le logo Wikimasters. Il en montre au plus 8, puis un badge « +N » ; à zéro boosters, le présentoir est vide. Le nombre vient du jeu (à relever à l'implémentation : où l'extension lit le nombre de boosters à ouvrir, et comment lancer la fenêtre d'ouverture existante). Ouverture : le paquet sort du présentoir et vient au centre, tremble, son emballage se déchire dans un éclat de lumière, puis la fenêtre d'ouverture du jeu s'affiche ; au retour, il en reste un de moins. **Dix styles** au choix, mémorisés par présentoir : Classique (violet et or), Carton kraft, Bois, Métal brossé, Acrylique (face transparente), Néon, Arcade rétro, Minimal blanc, Marbre et or, Pixel 8-bit. Le logo Wikimasters est un fichier à fournir (un « W » doré sert de repère en attendant).
- **Carte murale** : un cadre au mur (grande taille en cases) qui montre une carte du monde, réutilisant les positions de la vue Monde (`geo-book`). Le joueur règle le **centre et le zoom** (glisser, pincer, boutons + et −) en mode Aménager, puis choisit **les cartes de la Collection** à y afficher comme points (liste à cocher). En mode Visiter, la carte est figée à ce cadrage ; toucher un point fait naître une **bulle de pensée de bande dessinée** : trois petites bulles montent du point (apparition en cascade avec léger rebond), puis un nuage se gonfle et révèle l'image, le titre, le type de la carte et un bouton « Voir la fiche » qui ouvre la fiche existante. Le nuage se place au-dessus du point (en dessous si le point est en haut du cadre) et reste dans le cadre ; il flotte doucement. Toucher ailleurs le referme (les bulles se dégonflent). Une seule bulle à la fois. Le cadrage et la liste de cartes sont mémorisés par cadre (plusieurs cartes murales possibles, chacune avec son cadrage). Les cartes sans position sont proposées dans « À placer », comme dans la vue Monde.
- Animation d'ouverture (maquette validée avant écriture du plan) : l'objet s'efface de l'étagère, se retourne face au joueur en pivotant sur lui-même, puis s'ouvre sur la charnière (couverture pour le livre, boîtier pour le DVD, le CD et le jeu) ; la face intérieure montre un disque ou des pages, et la fiche de la carte apparaît en fondu à droite. « Ranger » rejoue l'animation à l'envers jusqu'à l'emplacement d'origine.
- Ouverture : le dos se soulève, l'objet se retourne, la fiche existante de la carte apparaît (même mécanisme que les autres vues, `onOpen`).
- Les cartes sont référencées par leur slug ; une carte qui n'est plus connue s'affiche en grisé.

## Morceau 3 : le mobilier

Chaises, canapé, fauteuil, panier, gamelle, niche, plantes, tapis, lampe… Chaque meuble déclare ses **points d'intérêt** pour les animaux (assise du canapé, creux du panier, bord de la gamelle).

## Morceau 4 : styles et décor

Huit styles (palette, bois, métal, cadres, éclairage), tapisserie, sol. Le style Néon gaming ajoute un liseré lumineux aux meubles.

**Steampunk** : mur vert sombre à bandeaux de laiton, tuyaux de cuivre au plafond et le long du mur avec vannes qui laissent échapper de la vapeur, sol en plaques rivetées. Engrenages qui tournent, manomètre à aiguille, horloge à l'heure réelle. Mobilier dédié : l'**ordinateur** devient une machine analytique (écran à tube dans un coffre de cuivre, cadrans, clavier à touches rondes) ; le bureau est un établi de laiton ; fauteuil club en cuir, globe terrestre mécanique, lampe à gaz qui vacille, télescope, automate de bureau, tube pneumatique (pour les boosters). Le présentoir de boosters prend l'aspect d'un coffret de laiton.

## Morceau 5 : fenêtre, ciel, météo

- Scènes : ville, campagne, montagne, mer, espace, Terre, et **Cité de dirigeables** (propre au style Steampunk : fenêtre arrondie à cadre de laiton, cheminées qui fument ; jour ambré, crépuscule orangé, nuit étoilée aux fenêtres allumées ; clair, smog, pluie, orage avec éclairs de tours Tesla).
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

**Cohabitation** : les trois compagnons peuvent être dans la même pièce (un de chaque espèce au plus). Chacun garde sa propre machine à états ; un **coordinateur** de la pièce gère ce qui se partage :
- **Places réservées** : un emplacement (panier, niche, station de charge, gamelle, assise du canapé) n'accueille qu'un compagnon à la fois ; le canapé a deux places. Un compagnon qui trouve la place prise choisit autre chose ou attend.
- **Interactions à deux** : un compagnon peut en inviter un autre (tirage pondéré selon les affinités et la situation). L'invité accepte ou esquive ; si les deux sont d'accord, ils jouent un petit scénario commun en deux temps : approche (chacun marche vers un point de rencontre, jamais de téléportation), puis animation conjointe, puis séparation.
- Un compagnon occupé (il dort, il mange, il est en court-circuit) ne peut être invité qu'à certaines interactions (par exemple dormir à côté de lui).

Interactions entre compagnons (au moins 12) : le chat et le chien dorment côte à côte sur le canapé ; le chien poursuit le chat, qui s'enfuit en sautant sur l'étagère ou sous le canapé, puis le regarde de haut ; le chat chasse le chien, qui se couche ; les deux jouent à la balle, que le robot leur lance ; le chat et le chien mangent côte à côte à la gamelle ; le chien aboie après le robot, le chat l'observe, curieux ; le chat monte sur le dos du robot et se fait promener ; le robot distribue des croquettes dans la gamelle ; le robot recharge ou répare l'autre compagnon qui a un souci (fatigue, collier cassé) ; le chien flaire le robot qui le scanne ; cache-cache autour des meubles ; le robot ramène la balle au chien qui la lui reprend ; chat, chien et robot se serrent tous les trois pendant l'orage ; le chat s'endort sur le chien couché ; le robot fait danser le chien.

**Robot** (compagnon mécanique, même exigence : une quinzaine de comportements, mêmes règles de déplacement continu, mêmes réactions au contexte). Il roule ou marche selon le style (chenilles ou roulettes, laiton à engrenages en Steampunk, chrome en Moderne…). Comportements : se recharger sur sa station (à la place de dormir : le panier ou la niche servent de station de charge) ; veille la nuit, yeux éteints ; faire le plein d'huile à la gamelle ; se faire cliqueter les articulations (étirement) ; se polir ; sauter à ressort sur le canapé et en redescendre ; danser et courir en rond ; scanner la pièce (antenne qui tourne) ; taper sur l'ordinateur du bureau ; ranger un objet sur l'étagère ; arroser la plante ; balayer le sol ; chasser une mouche au laser ; jouer à la balle ; réparer un engrenage ; regarder par la fenêtre et suivre les événements ; se mettre à l'abri sous un parapluie par temps de pluie et s'arrêter net pendant l'orage (court-circuit : étincelles, puis redémarrage).

## Morceau 7 : événements (au moins 15 par scène)

- **Ville** : avion, hélicoptère, drone, ballon, cerf-volant, avion à banderole, bus, tram, ambulance, camion-poubelle, livreur à vélo, passants sous parapluie (pluie), promeneur de chien, grue, enseigne néon, appartement qui s'allume, feu d'artifice (nuit).
- **Campagne** : tracteur, moissonneuse, troupeau de moutons, vache qui broute, cheval au galop, renard, lapin, cerf à l'aube, cigogne, corbeaux, montgolfière, moulin à vent, papillons, fumée de cheminée, arc-en-ciel (après la pluie), lucioles et hibou (nuit), étoile filante.
- **Montagne** : aigle, parapente, télécabine, skieur, randonneur, bouquetins, chamois, marmotte, hélicoptère de secours, avalanche lointaine, cascade, nuage accroché au sommet, train à crémaillère, dameuse (nuit), loup qui hurle à la lune, refuge qui s'allume, aurore boréale, étoile filante.
- **Mer** : voilier, ferry, cargo, bateau de pêche, kayak, surfeur, ski nautique, hydravion, mouettes, dauphins, baleine qui souffle, banc de poissons, tortue, périscope de sous-marin, bateau fantôme dans la brume, faisceau du phare (nuit), feu d'artifice sur la plage, tempête avec grosses vagues.
- **Espace** : station Mir, ISS, satellite, fusée, capsule, astronaute à la dérive, astéroïde, comète, pluie de météores, supernova, OVNI, sonde Voyager, éclipse, nébuleuse, planète avec lune qui passe, aurore, trou noir qui déforme les étoiles.
- **Cité de dirigeables** (Steampunk) : dirigeable, flotte de dirigeables, ornithoptère, train à vapeur sur le viaduc, tour Tesla qui crépite, montgolfière à vapeur, volée d'oiseaux mécaniques, horloge géante qui sonne, automate géant en marche, cargo volant, bateau à aubes volant, pigeon voyageur mécanique, lampadaires à gaz qui s'allument, pluie d'étincelles de l'usine, comète de laiton, sous-marin dans le canal, fanfare à vapeur.
- **Terre vue d'en haut** : station orbitale, train de satellites, navette ou Soyouz, fusée au décollage, astronaute en sortie, étoile filante, lune qui passe, lever de soleil orbital, ouragan, orage vu d'en haut, aurore polaire, villes lumineuses la nuit, éruption de volcan, débris spatiaux, capsule cargo, ballon-sonde.

Chaque événement est une petite description (apparition, trajet, durée, conditions météo et heure). Un tirage pondéré choisit parmi ceux qui sont possibles dans la situation (pas de feu d'artifice en plein jour ni de parapluies sans pluie).

## Risques et points ouverts

- **Boosters** : source du nombre de boosters à ouvrir et déclenchement de la fenêtre d'ouverture à vérifier dans le code de l'extension avant le morceau 2 ; logo Wikimasters à obtenir.
- **Volume** : plus de 90 événements et une trentaine de comportements. Les livrer par vagues, avec une même mécanique (descriptions de données plus un moteur), plutôt que du code spécifique à chaque événement.
- **Performance sur mobile** : limiter les éléments SVG animés ; suspendre les animations quand la vue n'est pas visible ou que la page est en arrière-plan.
- **Géolocalisation** : accord du joueur requis ; repli sur le fuseau horaire ; heures calculées sur l'appareil, rien n'est envoyé.
- **Fiche d'une carte absente** : une carte rangée puis disparue de la Collection s'affiche en grisé et n'ouvre pas de fiche.
- **Taille de l'état** : une pièce pleine reste très petite (identifiants et coordonnées) ; pas de risque pour le stockage local.
