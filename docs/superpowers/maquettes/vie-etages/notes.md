# La vie au-dessus de la rue — notes de la maquette (2026-10-19)

Maquette jetable : `maquette.html` (canvas 2D, aucune dépendance, assemblée depuis `src/*.js` par `node build.mjs`).
**Toute la scène est une fonction pure de l'heure T** (+ date, jour de semaine, événement) : pas d'état caché, les captures
sont déterministes et une même heure redonne toujours la même image. Les volets, rideaux, lumières, poses, marcheurs, chat,
pigeons, fumées, feux sont tous calculés depuis T.

- Galerie des captures : `maquette.html` sans paramètre. Mode animé : `?h=7&speed=60` (minutes de scène par seconde réelle ;
  `date=2026-10-13`, `event=feux|demenagement|sirene|musique`, `zoom=1` pour l'immeuble héros ; espace = pause, ← → = ±10 min,
  + − = vitesse ; le HUD affiche l'heure et le nombre de fenêtres animées). Débogage : `?T=18.98&view=x0,y0,w,h,scale`.
- Captures (`captures/`, ×2 ; `*-zoom.png` = ×4 sur l'immeuble héros ; `retour-seq-1..6.png` ×4) : `matin-7h`, `jour-11h`,
  `retour-19h`, `soir-21h`, `nuit-0h30`, `samedi-10h`, `14juillet-22h30`, `decembre-18h`, `demenagement-10h`, `planche-poses` (×3).
- Échelle : 1 px de maquette = 1 px de scène (façades du chantier 1 reprises à l'identique : `facadeLayout`, `paintFacade`…).
  Date par défaut **mardi 13 octobre** : à 7 h il fait encore nuit (lever 8 h 10) donc les cuisines allumées se voient, et à 19 h
  c'est le crépuscule (le retour s'y lit bien). En mai, les mêmes scènes se jouent mais les lumières ne se voient pas.

## Ce qui a été fait (par rapport à la liste validée)
- **Foyers fixes par logement** (`householdFor`) : couple 25 %, famille 20 %, retraité 18 %, étudiant 12 %, coloc 10 %, solo 15 %.
  Un logement = 2-3 travées → pièces `cuisine / (chambre) / salon` ; le salon donne sur le balcon filant quand il y en a un.
- **Emploi du temps** (`buildSchedule`) par type, semaine / week-end, avec deux aléas par foyer (`jitter` 0-36 min le matin,
  `jitter2` 0-72 min le soir) pour que rien ne se fasse en même temps. Lumières par **pièce** (plus par logement).
- **Façade vivante** : persiennes repliables (haussmann) et volets battants (faubourg) qui s'ouvrent / se ferment (1,2 min,
  jamais tous ensemble, la lumière filtre par les lames quand c'est allumé derrière), rideaux tirés / ouverts (voile ou
  rideaux de côté), battant gauche qui s'ouvre, jardinières de saison, pots du balcon, **sapin** clignotant en décembre,
  **fumées** de cheminée en hiver, **chat** (tabatière → terrasson → assis contre la souche, 3 sorties/jour : 10 h 47, 16 h 06,
  23 h 03), **pigeons** (2 vols, cycle 14 min : posés 10,5 min, envol 25 s, absents, retour), **couvreur** mardi/jeudi 9 h-16 h 30.
- **Réactions à la rue** : 14 juillet (fusées + gerbes 22 h 25-23 h, tout le monde aux fenêtres ouvertes ou au balcon, salons
  éteints pour mieux voir), Nouvel An (fête + feux à minuit), 21 juin (fenêtres ouvertes, danse), déménagement (camion,
  navette du déménageur, voisins penchés), sirène (`event=sirene`, 45 % des foyers présents se penchent 1 min).
- **Règle « rien n'apparaît sur place »** : chaque scène intérieure commence par une entrée en marchant depuis la pièce voisine
  (11 s) et finit par une sortie ; le balcon se gagne par la porte-fenêtre ouverte (on traverse le plan de la vitre) ; le
  retour passe par la rue → porte (vantail qui pivote, hall éclairé) → cage (minuterie 3 min, silhouette qui monte palier par
  palier dans les petites fenêtres) → logement ; le chat sort de la tabatière et y rentre ; les pigeons arrivent et repartent en vol.
- **Jour / nuit** : de jour, reflet à 72 % sur la vitre fermée (silhouette à 30 %), intérieur visible seulement par le battant
  ouvert (pièce sombre `#4A3C44`) ou penché / au balcon (pantin couleur) ; la nuit, silhouette `#1A1422` en contre-jour
  dans la pièce allumée, ombre à 28 % derrière un rideau tiré, pantin sombre sur le balcon d'une pièce éteinte.

## Catalogue des scènes (déclencheur · durée · poses · entrée / sortie)
| Scène | Déclencheur | Durée | Poses (planche) | Entrée → sortie |
|---|---|---|---|---|
| Cuisine du matin | réveil | 7-9 min | `cook` (bras devant, remue), plan de cuisson | marche depuis la pièce voisine |
| Ouvrir les volets | réveil + 8 min (salon), + 0,4 min (cuisine : `armsUp` court) | 3,4 min (×1,5 retraité) | marche → `stand`→`armsUp` (volets 1→2,3 min) → `reach` (battant) → `lean` 20 s | penché puis repart |
| Petit-déjeuner | +15 min | 20-30 min | `sitTable` ×n face à face, table + assiettes | chacun arrive à 30 s d'écart |
| Enfant regarde la rue | départ − 13 min | 4 min | `lean` taille 0,62 | — |
| Départ | heure de sortie | — | cage allumée depuis −climb, silhouette descend, porte, marcheur jusqu'au bord | sort du cadre |
| Arroser | 10 h 43 + aléa (retraité) | 4,2 min | `water` sur 3 pots successifs, filet d'eau, arrosoir | porte-fenêtre |
| Secouer le tapis | 11 h 15 + aléa (retraité) | 1,5 min | `shake` penché, tapis ondulant + poussière | fenêtre ouverte |
| Regarder la rue | 14 h, 16 h 30 (retraité), WE | 6-22 min | `lean` (fenêtre) ou `leanRail` (balcon), tête qui tourne | — |
| Retour | 16 h 50 famille, 18 h 30-19 h 40 couple/solo/coloc, 20 h-0 h 30 étudiant | — | marche (7,6 px/s) → porte 14 s → cage → `cross` devant les fenêtres → `drawCurtains` 1 min | — |
| Dîner | 19 h-19 h 30 retraité/famille, 20 h 25-21 h couple/coloc | 35-42 min | `sitTable` | — |
| Télé | après le dîner → 21 h 30 / 23 h / minuit | 2-3 h | `sitTv` + écran qui scintille, teinte `tv` | — |
| Fumer | 21 h 15 ± (40 % des couples/solos, coloc, étudiant 21 h et 23 h 30) | 3,5-4,6 min | `smokeDown`↔`smokeUp` (cycle 11 s), braise, volute | balcon ou fenêtre ouverte |
| Fermer les volets | tombée de la nuit (retraité), coucher (autres) | 1,6 min | `reach` (battant) → `armsUp` | — |
| Extinction | pièce par pièce (cuisine, salon, chambre 15-20 min après) | — | `stand` dans la chambre | — |
| Fête (coloc samedi, Nouvel An) | 21 h 30 → 2 h | — | `dance` ×5, fumeurs qui alternent au balcon toutes les 25 min | — |
| Feux | 22 h 25-23 h (14/07), 0 h-0 h 20 (01/01) | — | `lean` ×2 / `leanRail` ×3 par balcon, salons éteints | ouverture des fenêtres 2 min avant |
| Chat | 10 h 47, 16 h 06, 23 h 03 | 40-55 min | émerge 20 s, marche 50 s, assis (queue qui bouge, yeux verts la nuit) | tabatière |
| Pigeons | cycle 14 min décalé par vol | — | posés (picorent), envol en arc, retour | vol |

## Emploi du temps type (semaine ; le week-end décale le matin de +2 h, ajoute un déjeuner 12 h 30-13 h, une sortie 14 h 30-15 h, du monde aux fenêtres 10 h-11 h)
- **Couple** : 6 h 47 + j cuisine ; 6 h 55 volets salon ; 7 h 02 petit-déj ; départs 7 h 39 et 7 h 53 ; retour 18 h 30 + j2 puis
  + 35-50 min ; rideaux 1 min après l'arrivée ; dîner 20 h 27 + j2/2 (42 min) ; télé 21 h 12 → 23 h 03 ; fumeur 21 h 15 ;
  volets 23 h 05 ; chambre 23 h 06-23 h 30.
- **Famille** : 6 h 35 ; enfant à la fenêtre 7 h 22 ; départs 7 h 35 (enfant + parent A) et 8 h 03 ; retour 16 h 51 (enfant +
  A, devoirs à la chambre 55 min), B 18 h 40-19 h 10 ; dîner 19 h 27 ; chambre enfant éteinte 20 h 35 (volets par un parent) ;
  télé 20 h 15-22 h 33 ; volets 22 h 35 ; tout éteint 22 h 45.
- **Retraité** : 7 h 42 ; volets lents 7 h 46 / 7 h 53 ; petit-déj 8 h 04 ; arrosage 10 h 43 + j ; tapis 11 h 15 + j ; fenêtre
  13 h 57 ; balcon 16 h 24 (22 min) ; cuisine 18 h ; dîner 19 h ; volets à la tombée de la nuit (max(coucher + 20 min, 18 h 06)) ;
  télé 19 h 45-21 h 33 ; chambre 21 h 30-21 h 57.
- **Étudiant** : 8 h 27 ; rideaux, penché 6 min ; départ 8 h 59 ; retour 19 h 36 ou 20 h 24 (50 %) ; bureau (lumière froide) ;
  fumeur à la fenêtre 21 h et 23 h 30 ; rideaux 23 h 54 ; éteint 1 h 27. Jamais de volets.
- **Coloc** : réveils 7 h 18 / 7 h 48 / 8 h 30, départs +38 min ; retours 18 h 09 / 19 h 30 / 21 h ; dîner 20 h 30 ; deux fumeurs au
  balcon 20 h 54 ; télé jusqu'à minuit ; rideaux 23 h 30 ; extinctions 0 h 06 / 0 h 24 / 0 h 42. Samedi : fête.
- **Solo** : 7 h 03 ; départ 7 h 51 ; retour 19 h 27 + j2 ; rideaux ; dîner 20 h 06 (seul) ; télé 20 h 39-23 h 21 ; volets 23 h 23.

## Règles de choix (combien à la fois, priorités) — `cullAnimated`
- **Borne proposée : 8 fenêtres animées en même temps** (`MAX_ANIM`). Ne comptent que les chorégraphies qui bougent (marche,
  volets, rideaux, arrosage, tapis, fumeur, danse, cuisine) ; les poses fixes (table, télé, penché, balcon immobile) sont
  gratuites et ne sont pas bornées. Dans la maquette, à 7 h 05 on en compte 5, à 19 h 3, à 21 h 6, le 14 juillet 2 (le reste
  est immobile).
- Priorité : réaction à un événement 5 > retour (traversée, rideaux) 4 > volets, arrosage, tapis, fumeur 3 > penchés / balcon
  2 > danse 2 > cuisine 1 ; à priorité égale, la fenêtre la plus proche du centre de l'écran gagne. Une scène écartée garde sa
  lumière et ses volets (l'état ne dépend pas de l'animation), seul le pantin n'est pas dessiné.
- Entrée / sortie : 11 s de marche, ou tout le début/fin d'une scène courte (max 30 % de la scène).
- Vitesse de marche dans la rue 7,6 px/s (1,3 m/s à 5,9 px/m) ; montée 0,35 min + 0,22 min par étage ; minuterie 3 min.

## Couleurs (ajouts au chantier 1)
Silhouette contre-jour `#1A1422` · pièce sombre de jour `#4A3C44` · lumière froide (bureau/laptop) `#C8DCFF` · persiennes
`#C4CCC8 #B8C0B4 #CCC4AC` (lames éclairées `rgba(255,216,106,0.7)`) · chemises des pantins `#C85A3A #2E4A6E #8A5A8E #3F8A3A
#E8C060 #5A7AA8 #B8705A #D86C7A #F4F0E0`, pantalons `#2E3A4A #5A3A2E #3A4A3A #8A7A6A #2A2A3A`, peaux `#F2C9A0 #D9A070 #8A5A3A
#F6D8B8 #C8906A` · chat de jour `#8A6A4A`, de nuit `#4A3E48` + yeux `#C8FF8A` · pigeon `#8A8FA0` · fumée `rgba(235,235,242,a)`
(nuit `rgba(200,205,225,a)`) · braise `#FF6A2A` · tapis `#B8503A` + `#E8C060` · arrosoir `#5A8A5A` · sapin `#2F5A3A`
(`#1E3A2A` à contre-jour) + guirlande `#FF6A6A #FFD86A #8AF0FF #C8FF8A #FFA0E0` · feux `#FFD86A #FF6A6A #8AF0FF #C8FF8A
#FFA0E0 #FFFFFF` · fleurs : printemps `#F6C62E #E8A0C8 #FFF`, été `#E8456B #F6C62E #FFF #E070C0 #3F8A3A`, automne
`#D88A2E #B85A3A #E8C060 #8A5A8E`, hiver terre `#6A5A48 #5A6A48`.

## Fonctions de `maquette.html` à porter
- `src/02-layout.js` : `householdFor`, `makeHousehold` (+ `rooms`, `balcony`, `floorIdx`, `climb` sur chaque logement)
  → `city/households.ts` ; `facadeLayout(…, force)` reste celle du chantier 1.
- `src/03-temps.js` : `SUNS`, `dayness`, `dayContext`, `setEnvAt` (ambiance continue selon le soleil du mois, à la place des
  paliers 10 h / 19 h / 22 h), `paintFireworks` → `city/daylight.ts`, `paint/sky.ts`.
- `src/04-emplois.js` : `buildSchedule` (segments `lit / shut / curt / win / act / return / depart / sapin / party / dim`)
  → `city/schedules.ts` ; à calculer une fois par jour de scène et par logement (≈ 60 logements × 40 segments).
- `src/05-etat.js` : `trackValue`, `homeState`, `streetEvents`, `cullAnimated` (`MAX_ANIM`) → `city/home-state.ts`.
- `src/06-pantins.js` : `POSE`, `walkPose`, `dancePose`, `mixPose`, `figurePts`, `drawFigure`, `choreo`, `balconyInOut`
  → `paint/figures.ts` (même cinématique que les pantins de la rue : à fusionner avec l'existant plutôt que dupliquer).
- `src/07a-facade.js` : `paintWindow` (état), `paintSash`, `paintShutters`, `paintLeaner`, `paintFlowerBox`, `paintSapin`,
  `paintInteriorProp`, `paintHandProps`, `paintGroundFloor` (porte qui s'ouvre, hall) → `paint/city-painter.ts`.
- `src/07b-balcon-toit.js` : `paintBalcony` (occupants avant le garde-corps), `catState`/`paintCat`, `flockState`/`flockPaint`/
  `paintPigeon`, `paintSmoke`, `paintRoofer`, `paintRoofLife` → `paint/roof-life.ts`.
- `src/08-scenes.js` : `paintWalkers` (entrée dans la porte : coupé par l'arche, s'enfonce), `paintStairFigure`, `paintTruck`,
  ordre de peinture de `renderScene` (ciel → feux → fond → façade par façade avec sa cage → pigeons en vol → rue → camion → marcheurs).

## Choix faits seul, à valider
1. **Persiennes métalliques repliables** pour l'haussmannien (deux vantaux qui se replient dans l'embrasure, lames éclairées
   quand la pièce est allumée) ; volets battants seulement en faubourg. Les portes-fenêtres ont aussi des persiennes.
2. **Minuterie** : la cage ne s'allume que quand quelqu'un entre ou sort (3 min), jamais « au hasard » le soir. L'imposte et le
   hall s'allument avec.
3. **Deux foyers par étage** sur l'immeuble héros (5 travées dont la cage) ; les types y sont imposés (retraité à l'étage noble,
   couple fumeur au 2ᵉ, famille, étudiant sous les toits) pour que chaque capture montre la scène attendue. Ailleurs, tirage.
4. La **lumière de jour** n'est pas dessinée (pas de fenêtre « allumée » tant que `dark ≤ 0,2`) : en été, les routines du matin
   se jouent sans lumière visible ; seules les silhouettes aux fenêtres ouvertes et aux balcons restent.
5. **Salons éteints pendant les feux** (on regarde dehors) : la rue est plus sombre le 14 juillet qu'un soir ordinaire.
6. Le **chat** n'existe que sur les toits à la Mansart avec tabatière (ici l'immeuble héros) ; le couvreur mardi et jeudi.
7. **Borne 8 animées** + poses fixes illimitées ; la priorité favorise les scènes liées à la rue (retour, événement).
8. Le **tapis** est secoué depuis la porte-fenêtre du balcon quand le retraité est à l'étage noble (il se penche au-dessus du
   garde-corps) ; le pot arrosé « brille » 1 px pendant l'arrosage.
9. Taille des pantins : 0,66 × hauteur d'étage (≈ 12 px à ×1, 48 px au zoom ×4) ; enfants 0,62, retraités 0,94.
10. Le week-end, les mêmes foyers ont des horaires décalés mais la coloc fait la fête seulement le samedi (pas le vendredi).
