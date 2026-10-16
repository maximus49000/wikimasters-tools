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
