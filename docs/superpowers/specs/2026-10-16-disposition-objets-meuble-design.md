# Disposition des objets d'un meuble (vue Modifier) + zoom de la chaîne hi-fi

Date : 2026-10-16. Maquette validée par l'utilisateur le 2026-10-16 :
`docs/superpowers/maquettes/disposition-objets/index.html` (schéma interactif, dessins Opus — « Fable n'est pas passé »).

## Pourquoi

Aujourd'hui, dans Ma Pièce, les objets posés sur un meuble ont une **position figée** : un petit objet (lampe, plante, réveil,
horloge, météomètre, chaîne hi-fi) prend le **premier emplacement libre** parmi 4 (bureau) ou 3 (dessus d'étagère) ; une carte
rangée prend le premier bout libre d'une tablette. L'utilisateur veut **choisir lui-même** où va chaque objet, voir de près la
surface qu'il arrange, et décider de l'endroit exact où il pose une nouvelle carte. Il veut aussi **voir la chaîne hi-fi en
grand** : la pochette de l'album lisible et, à côté, le CD qui tourne.

## Objectifs

1. **Bouton dans la bulle d'un meuble porteur** : toucher, en Aménager, un meuble qui peut porter des objets (« porteur ») ouvre
   sa bulle d'actions avec deux **nouveaux** glyphes :
   - **✋ Modifier la disposition** → vue Modifier de ce meuble ;
   - **＋ Ajouter une carte ici** → même vue Modifier, en mode ajout.
2. **Vue Modifier** : zoom sur la surface du meuble, **vue de 3/4 au-dessus** (caméra plongeante, comme la maquette), où l'on
   glisse au doigt tout ce qui est posé dessus : cartes, chaîne hi-fi, lampe, plante, réveil, horloge, météomètre…
   - **Plateau** (bureau, dessus d'étagère — voir § Porteurs) : **position libre au centimètre**.
     Pendant le glissé, l'objet est soulevé et son **empreinte au sol** s'affiche : **verte** si la place est libre, **rouge**
     s'il chevauche un autre objet ou dépasse du plateau. Lâché en rouge, l'objet **revient à sa place**.
   - **Tablettes d'étagère** : on change l'**ordre**. Cartes **et petits objets** (lampe, plante, réveil…) s'y mélangent
     (décision utilisateur : « tout partout »). On glisse un objet sur une autre tablette, sur le dessus ou entre deux autres ; une
     **place verte** s'ouvre à l'endroit d'insertion (**rouge** si la tablette est pleine), les voisins se resserrent.
   - **✓** referme la vue ; la pièce montre aussitôt la nouvelle disposition. Chaque glissé réussi est enregistré tout de suite
     (pas de « annuler tout » à la fermeture).
3. **Ajout d'une carte à l'endroit exact** : ＋ ouvre la vue Modifier avec une **réglette 🃏** de cartes de la Collection en haut.
   Toucher une carte la fait apparaître sur le meuble **en attente** (halo doré) à la première place libre ; on la glisse à
   l'endroit exact (plateau : au cm ; tablette : tablette + rang). **✓** la pose, **✕** annule l'ajout. Toucher une autre carte
   de la réglette remplace la carte en attente.
4. **Cartes posées sur un plateau** (nouveau) : une carte (CD, DVD, jeu, livre) peut désormais être posée **sur un plateau**
   (bureau, dessus d'étagère), de face, sur un petit chevalet (comme dans la maquette), et plus seulement rangée sur une tablette.
   Réciproquement, un petit objet peut être rangé sur une tablette, dans l'ordre avec les cartes.
5. **Zoom de la chaîne hi-fi** : vue rapprochée de 3/4 au-dessus du poste : pochette de l'album **debout** à côté du poste,
   face à l'utilisateur, **grande et lisible** (décision utilisateur, variante « Pochette debout » de la maquette) et, à côté,
   le **CD qui tourne** dans le puits du poste ; afficheur qui fait défiler la piste. Le disque s'arrête en pause.
   - **Ouverture** (décision utilisateur) : hors Aménager, **toucher la chaîne ouvre directement le zoom** ; il **remplace**
     la petite bulle du lecteur (`HifiBubble`), dont **toutes les commandes passent dans le zoom**, en glyphes (⏸/▶, ⏏ et
     les autres glyphes actuels de la bulle), plus ⓘ et ✕.
   - Dans la pièce, la pochette reste couchée devant le poste comme aujourd'hui ; la pose debout n'existe que dans le zoom.

## Non-objectifs

- Pas de rotation libre des petits objets ni des cartes (ils restent de face).
- Pas d'empilement (un objet posé sur un autre objet).
- Pas de position libre **sur les tablettes** d'étagère : l'ordre suffit (les objets y restent alignés, compactés).
- Pas de nouveaux porteurs pour l'instant (table basse, guéridon, commode : plus tard, décision utilisateur).
- Pas de déplacement d'un objet **d'un meuble à un autre** depuis la vue Modifier : on arrange un seul meuble. Le passage d'un
  meuble à l'autre reste possible comme aujourd'hui (appui long dans la pièce).
- Pas de nouveaux dessins Fable (gel jusqu'au 2026-10-17) : visuels par Opus avec la trace « Fable n'est pas passé ».

## Anti-objectifs (échec même si « ça marche »)

- Un objet qui **saute** à une autre place que celle où on l'a lâché, ou deux objets qui se chevauchent après migration.
- Une disposition existante **perdue ou déplacée** à la mise à jour (la migration doit garder les positions visibles actuelles).
- Une vue Modifier dessinée « à part » qui ne ressemble pas à la pièce : elle doit réutiliser **les mêmes modèles 3D** (meubles,
  petits objets, boîtiers) que la pièce, seule la caméra change.
- Saccades au glissé sur le S26 (Android d'abord) : le glissé doit suivre le doigt.
- Un glyphe remplacé par du texte (règle du projet : glyphes, tout visible à l'écran).

## Porteurs

| Meuble | Surface | Mode |
|---|---|---|
| Bureau (`desk`) | plateau 120 × 60 cm | libre au cm |
| Étagère (`shelf`) — dessus | dessus 80 × 30 cm | libre au cm |
| Étagère (`shelf`) — 3 tablettes | tablettes | ordre (cartes + petits objets mélangés) |

L'ordinateur reste lié à son bureau et occupe **son empreinte réelle** sur le plateau (il remplace les « emplacements bloqués »
du milieu). Il n'est pas déplaçable dans la vue Modifier (son écran reste où il est), mais il compte pour les chevauchements.
La chaîne hi-fi reste réservée au bureau (règle actuelle).

- **Empreinte de la chaîne** *(choix de Claude)* : le poste **plus** une zone fixe devant lui pour la pochette couchée
  (toute la largeur du poste × 14,5 cm, la profondeur maximale actuelle `SLEEVE_MAX_D`), quelle que soit la carte jouée :
  aucune lecture ne peut créer de chevauchement. La pochette suit le poste où qu'on le pose.
- **Bibliothèques liées** *(choix de Claude)* : deux étagères liées s'ouvrent ensemble dans une seule vue Modifier (comme le
  zoom actuel) et l'on peut passer un objet de l'une à l'autre ; elles comptent comme un seul meuble.
- **Tablette pleine** *(choix de Claude)* : même règle qu'aujourd'hui (`shelfLayoutIn` : largeurs + 1 cm entre deux objets ≤
  largeur utile). Un dépôt qui ne tient pas est refusé (rouge). Un objet trop **haut** pour l'espace sous la tablette du dessus
  est refusé aussi. Une tablette qui déborde déjà avant la mise à jour est **tolérée** telle quelle (rien n'est déplacé).
- **Petit objet sur une tablette** : rangé de face, largeur = son empreinte réelle, à la place que donne l'ordre ; il garde ses
  comportements (lampe qui éclaire, horloge et météomètre vivants).

## Modèle de données

- **Petit objet** : le `slot` entier (0..3) devient une **position en cm dans le repère du plateau** du porteur
  (`x`, `z` du coin avant gauche de l'empreinte, repère local du meuble : elle suit la rotation du meuble à 45°).
- **Carte posée sur un plateau** : nouvelle forme de `Placed` (ou extension de `stored`) avec `hostId`, `x`, `z`, `slug`, `shape`.
- **Carte rangée sur une tablette** : inchangée (`shelfId`, `level`, `order`).
- **Petit objet rangé sur une tablette** : nouvelle variante avec `shelfId`, `level`, `order` (l'ordre est commun aux cartes et
  aux petits objets d'une même tablette).
- **Version 8** du stockage : `migrateV7` convertit chaque `slot` en `x`/`z` qui donnent **exactement** la position dessinée
  aujourd'hui (centre de l'emplacement, mi-profondeur) ; sauvegarde brute avant migration, comme pour v7.
- `cleanEntries` : la clé de doublon `hostId:small:slot` est remplacée par un contrôle de chevauchement ; un objet qui chevauche
  après lecture est replacé à la première place libre, un objet qui ne tient plus est retiré comme aujourd'hui.
- « Première place libre » (ajout depuis le tiroir, déplacement vers un autre meuble) : balayage du plateau de l'avant vers le
  fond, de gauche à droite, au pas de quelques cm.

## Interface

- **Bulle d'actions** (Aménager) d'un porteur : ✋ et ＋ ajoutés aux glyphes existants.
- **Vue Modifier** : couche plein écran au-dessus de la pièce (même endroit que les zooms actuels), en **paysage** comme
  l'ouverture d'objet. Coin haut gauche : pastille du mode (✋ ou ＋🃏) ; coin haut droit : ✓ (et ✕ seulement quand une carte
  est en attente). Fond : mur et sol de la pièce.
- **Glissé** : un doigt sur un objet le saisit tout de suite (pas d'appui long dans cette vue : on est là pour déplacer). Toucher
  sans glisser ne fait rien.
- **Ordre de dessin** dans la vue et dans la pièce : sur un plateau, l'objet le plus **proche** (z petit) passe devant.
- **Réglette 🃏** : cartes de la Collection pas encore dans la pièce, en vignettes (pochettes), défilante ; même source que le
  choix de carte actuel.
- Le **parcours actuel** « Ajouter une carte » du tiroir reste en place ; la cible « étagère » y devient « meuble », et après le
  choix on ouvre la vue Modifier ＋ de ce meuble avec la carte déjà en attente.
- **WikiHow** : nouvelle fiche (nouvel id) dans la même PR : vue Modifier, ajout à l'endroit exact, zoom de la chaîne. Les fiches
  `bibliotheque-v4` / `v5` qui parlent de « premier emplacement libre » sont à corriger par une nouvelle fiche, pas en place.

## Rendu

- La pièce garde sa caméra de face actuelle. La vue Modifier et le zoom de la chaîne utilisent une **caméra 3/4 plongeante**
  appliquée aux mêmes modèles 3D (paramétrer la projection de `furniture-render3d.ts`, aujourd'hui fixée par des constantes).
- Style cellulo (aplats, trait encré, ombre nette), comme les pantins, véhicules et meubles récents.
- Le CD tourne avec le lecteur réel (`hifiState`), comme le poste actuel.

## Découpage proposé

1. Données : positions en cm + migration v8 + chevauchements (cœur, tests).
2. Caméra 3/4 plongeante + vue Modifier d'un plateau (glissé libre).
3. Vue Modifier des tablettes (ordre).
4. Cartes posées sur un plateau + ajout ＋ avec réglette.
5. Zoom de la chaîne hi-fi.
6. WikiHow + Nouveautés.

Chaque morceau est livré par sa PR, puis en pré-prod.

## Tests

Familles touchées : `scene-piece` (et `scene-commun` pour l'ordre de dessin). Cœur : migration v7→v8 (positions visibles
identiques), chevauchements, première place libre, insertion sur tablette. UI : bulle (✋/＋), vue Modifier (glissé vert/rouge,
retour à la place), ajout (en attente, ✓, ✕), zoom de la chaîne. Validation finale sur le **téléphone** (S26) avant Chrome.

## Décisions

Utilisateur (2026-10-16) : maquette validée ; pochette **debout** dans le zoom de la chaîne ; toucher la chaîne = **zoom direct**
(remplace la bulle du lecteur) ; porteurs = **bureau + dessus d'étagère** seulement ; **tout partout** sur l'étagère (petits
objets et cartes mélangés sur les tablettes et le dessus).

Choix de Claude (à relire) : empreinte fixe de la pochette devant la chaîne ; bibliothèques liées = une seule vue, passage
permis ; règle de tablette pleine actuelle + refus des objets trop hauts + débordement ancien toléré ; un toucher sans glisser
ne fait rien dans la vue Modifier ; chaque glissé est enregistré tout de suite.

## Laissé au constructeur

Nom exact des types et fichiers, pas de balayage pour la première place libre, découpage des composants, détail de la caméra
(angle exact) tant qu'il ressemble à la maquette.

---

## Révision du 2026-10-17 (après les parties 1 et 2)

Les parties 1 (positions en cm, stockage **v9** — et non v8, prise entre-temps) et 2 (caméra plongeante, vue Modifier d'un
plateau, ✋) sont livrées (PR #327, #330). L'utilisateur a précisé trois points après avoir vu la vue Modifier. Cette révision
**remplace** les passages contraires plus haut (en particulier « un toucher sans glisser ne fait rien »).

### Pourquoi

La vue Modifier d'une étagère ne montrait que le dessus : l'utilisateur veut **tout le meuble** pour ranger ses cartes, les
choisir et les passer d'une tablette à l'autre. Il veut aussi des cartes **mises en valeur** sur un plateau (sur un trépied ou
couchées comme un disque qu'on vient de sortir), et pouvoir **corriger une carte** sur place : la bonne pochette, le bon format.

### R1. Toute l'étagère dans la vue Modifier, avec zoom

- ✋ sur une étagère ouvre la vue sur **le meuble entier** (dessus + 3 tablettes ; deux bibliothèques liées côte à côte).
- **Zoom comme le zoom d'étagère actuel** (`FurnitureZoom` / `ShelfBoardZoom`, `useFurnitureZoom.setLevel`) : toucher une tablette
  zoome dessus ; ▲ / ▼ (« Tablette du dessus / du dessous ») passent d'une tablette à l'autre ; le dessus d'étagère est un niveau
  de plus (au-dessus de la tablette 0) ; deux bibliothèques liées défilent ensemble. Retour Android : dézoome d'abord, puis ferme.
- **Glisser d'une tablette à l'autre en zoom** (décision utilisateur) : une carte tenue amenée au **bord haut ou bas** de l'écran
  fait passer la vue à la tablette voisine après un court instant ; on la lâche là. Au niveau « meuble entier », on lâche
  directement sur la tablette visée.
- Le bureau garde sa vue actuelle (plateau seul : il n'a pas d'autre niveau).

### R2. Deux poses pour une carte sur un plateau

Une carte posée sur un plateau (bureau, dessus d'étagère) a une **pose** :
- **trépied** : debout, de face, sur un petit trépied (la « carte posée sur chevalet » de la partie 4) ;
- **à plat** : couchée, pochette vers le haut, comme la pochette devant la chaîne hi-fi (décision utilisateur).
L'empreinte au sol dépend de la pose (à plat : la taille réelle de la couverture couchée ; trépied : largeur × profondeur du
trépied) ; le vert / rouge en tient compte. Changer de pose qui ne tient plus à cette place est **refusé** (rouge, message), la
carte ne bouge pas toute seule.

### R3. Modifier une carte depuis la vue

**Toucher une carte sans la glisser** ouvre sa **bulle** dans la vue Modifier (glisser déplace toujours ; toucher un petit objet
ne fait toujours rien). Boutons en glyphes :
- **Présentation** : sur une tablette, de face / sur la tranche / de dos (jeu) — l'existant ; sur un plateau, trépied / à plat.
- **Version de la pochette** :
  - jeu : choix de la boîte existant (`GameVersionDialog`, TheGamesDB) ;
  - livre : choix de l'édition existant (`BookChoiceDialog`, Open Library) ;
  - **CD : autres éditions de l'album** (nouveau) ;
  - **DVD : autres affiches / jaquettes du film** (nouveau).
- **Format de l'objet** : CD, DVD, jeu, livre — la même carte change de boîtier (le slug ne change pas). Format qui ne tient plus
  à sa place (tablette pleine, trop haut, chevauchement sur un plateau) : **refusé** avec le message habituel (« Plus de place sur
  cette tablette. »), rien ne bouge.
- **ⓘ** fiche de la carte, **🗑** retirer.

### Découpage révisé (remplace le découpage proposé)

1. ~~Données~~ — livré. 2. ~~Vue Modifier d'un plateau~~ — livré.
3. **Étagère entière + zoom par tablette** dans la vue Modifier, tablettes mixtes (cartes + petits objets), glissé d'une tablette à
   l'autre (bord d'écran en zoom).
4. **Cartes posées sur un plateau** (trépied / à plat) + ajout ＋ avec réglette.
5. **Bulle d'une carte** dans la vue : présentation, format, ⓘ, 🗑.
6. **Versions de pochette** CD et DVD (nouvelles sources) + branchement des choix jeu / livre existants.
7. Zoom de la chaîne hi-fi (inchangé).

Chaque partie : sa PR, sa fiche WikiHow (nouvel id), puis la pré-prod.

### Anti-objectifs ajoutés

- Une carte qui change de place quand on change sa pose, son format ou sa pochette.
- Une pochette « choisie » qui n'existe pas (image cassée, version inventée) : la source doit être réelle ; sans autre version, le
  bouton est grisé.
- Le zoom de la vue Modifier qui ne ressemble pas au zoom d'étagère qu'on connaît déjà.

### Décisions de la révision (2026-10-17)

Utilisateur :
- **Pochette et format choisis dans la pièce = seulement pour cet objet posé.** Ils ne changent ni la Collection, ni la fiche
  de la carte, ni les images de remplacement du site. Stockés sur l'objet du plan (champ(s) optionnel(s), version de stockage
  suivante). Les choix jeu (`GameVersionDialog`) et livre (`BookChoiceDialog`) existants gardent leur comportement global hors de
  la pièce ; dans la vue Modifier, le choix fait pour un jeu ou un livre est lui aussi propre à l'objet posé.
- **Versions de pochette d'un CD : Spotify d'abord** (il gère déjà les pochettes d'album, versions de l'album comprises),
  **Deezer seulement si Spotify n'a pas de pochette** pour cet album (ou sans compte Spotify lié). Deezer passe par le relais existant.
- Sans autre version disponible, le bouton est **grisé** (jamais de version inventée).

Choix de Claude (à relire) :
- **DVD : affiches de film TMDB** (plusieurs langues) via le relais (une adresse d'images à ajouter à la liste blanche du relais,
  redéploiement à la main).
- **Caméras** : meuble entier et tablettes **de face**, comme le zoom d'étagère actuel ; le **dessus** garde la vue plongeante au cm
  de la partie 2 (en plongée, chaque tablette serait cachée par celle du dessus).
- **Gestes** : au niveau « meuble entier », toucher une carte zoome sur sa tablette ; en zoom, toucher une carte ouvre sa bulle,
  la glisser la déplace ; balayer verticalement dans le vide change de tablette (comme aujourd'hui) ; toucher un petit objet ne fait rien.
- **Format / version pour une carte d'une autre nature** (un film rangé en CD…) : la version cherche dans la source du **format
  choisi** à partir du titre de la carte ; rien trouvé → bouton grisé.
- **Ordre des parties** : en partie 3, une carte lâchée sur le dessus d'étagère est refusée (rouge) ; la partie 4 l'autorise, pose
  par défaut **trépied**.

### Décision du 2026-10-18 — bulles unifiées (remplace « un doigt sur un objet le saisit tout de suite »)

Dans la vue Modifier, **toucher un objet posé** (carte ou petit objet, sur une tablette, un dessus ou un bureau) ouvre **sa
bulle**, la même que pour le mobilier classique dans la pièce (même apparence, mêmes glyphes). Le déplacement se lance
**seulement** par **✥ Déplacer** dans la bulle : l'objet est alors armé, on le glisse, il est posé **au lâcher** sur une place
verte (rouge : il revient). Aucun objet ne bouge par un geste direct. La bulle d'une carte garde présentation / pose, format,
ⓘ et 🗑 ; celle d'un petit objet reprend les actions de la pièce (🗑, allumer/éteindre une lampe, …). Au niveau « meuble
entier », toucher zoome toujours sur la tablette. La bulle ne cache jamais l'objet qu'elle concerne.
