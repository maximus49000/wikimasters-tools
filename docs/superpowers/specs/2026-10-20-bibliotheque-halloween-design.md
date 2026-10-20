# Bibliothèque, scène Ville : Halloween (décors des habitants et de la mairie, nuit du 31)

Suite de `2026-10-09-bibliotheque-ville-vivante-design.md` (tableau des fêtes, « Décors de longue durée », « Déguisements
d'Halloween ») et des vagues de fêtes déjà livrées (`2026-10-10-bibliotheque-fetes-*`). Halloween n'existe pas encore dans le
code : ni fête dans `FESTIVITIES`, ni jeu de décor, ni déguisement. Maquette des décors :
`docs/superpowers/maquettes/halloween/` (notes et captures).

Tout reste calculé depuis la date, l'heure et la graine : aucun état ajouté, aucun `Math.random`.

## 0. Décisions (conversation du 2026-10-20)

| Sujet | Décision |
| --- | --- |
| Livraison | Deux PR. **PR 1 avant le samedi 24 octobre** : calendrier et décors (pose, présence, retrait). **PR 2 avant le samedi 31** : la nuit d'Halloween. |
| Qui pose | Les **habitants** décorent fenêtres, balcons et entrées (à la main, à l'escabeau pour ce qui est en hauteur). La **mairie** décore les lampadaires au camion-nacelle, comme les drapeaux. |
| Décors des habitants | Citrouille en fenêtre, toile ou fantôme à l'entrée, décors de balcon (sorcière, squelette, corbeau, araignée géante). **Pas** de guirlande de façade. |
| Lampadaires | Pose le samedi 24 octobre de 9 h à 17 h, retrait le mardi 3 novembre de 9 h à 17 h (le 1er est férié, le 2 tombe un lundi). |
| Nuit du 31 (PR 2) | « Grand spectacle » : beaucoup de passants déguisés, enfants accompagnés qui vont d'entrée en entrée, habitants qui ouvrent et donnent des bonbons, farces des jeunes (sonner et s'enfuir, faire peur à un passant). |
| Pluie le 31 | Moins de monde, parapluies ; les farces continuent. |
| Animaux | Comme le promeneur de chien (vague 1c) : quand un groupe déguisé passe devant la fenêtre, le chien éveillé court à la fenêtre et aboie, le chat sursaute. Un animal qui dort ne réagit pas. |
| Hors périmètre | Ciel (chauves-souris, sorcière devant la lune), décor dans la pièce, entrée « Quoi de neuf ». |
| Maquette | Maquette rapide des décors (celle-ci) avant la PR 1 ; maquette des déguisés et des farces pendant que la PR 1 avance, avant la PR 2. |

## Écarts décidés à l'implémentation (PR 1)

- **Pas de chaudron** : il n'était pas dans la liste validée, et un aller-retour à la main n'apportait rien.
- **Entrées** : le décor est posé par « un habitant de l'immeuble » qui n'est pas relié à un foyer précis. Sa tenue est
  tirée de la porte et son heure vient du plan des entrées (`install.ts`, transport `door`, sans véhicule). Il sort par
  la porte (fondu à l'encadrement) avec une petite échelle (16 unités), accroche le décor et rentre ; le geste dure
  12 minutes.
- **Pluie** : on décore quel que soit le temps (point à valider n° 1, choix par défaut).

## 1. Calendrier (`city/calendar.ts`)

- `FestivityId` gagne `halloween` ; ligne `{ id: 'halloween', m: 10, d: 31, hours: [[1020, 1380]] }` (17 h à 23 h). Le
  « coucher du soleil » de la spec d'origine est lu sur la lumière du jour par l'intensité (PR 2), la plage ne fait que borner.
- **Édition** : l'année du 31 octobre (Halloween ne chevauche pas deux années). Graine des choix :
  `seed ^ hashString('halloween' + année)`. Placement, styles, visages et horaires sont identiques pendant toute la période et
  changent d'une année à l'autre.
- **Période des habitants** : pose étalée du **24 au 31 octobre**, retrait étalé du **1er au 8 novembre**, chaque foyer à son
  jour et à son heure (§3.2). **Période de la mairie** : §4.
- `decorSetsFor(date)` ne regarde aujourd'hui que la veille, le jour et le lendemain de la fête. Les fenêtres d'Halloween sont
  à −7 et +3 jours du 31 : le balayage passe à `k ∈ [−maxRemove, +maxInstall]` calculé sur les jeux connus (ici −3…+7). Coût :
  quelques `festivitiesOn` de plus par jour, mémoïsés par `dayKey` dans `install-layer.tsx`.

## 2. Ce qu'on voit (catalogue, en données)

Chaque façade tire un **style dominant** (`citrouilles`, `sorcellerie`, `macabre`) qui pondère ses décors : un style et un
ou deux accents, pas un mélange au hasard (la rue reste lisible).

| Décor | Où | Qui, comment | Lumière la nuit |
| --- | --- | --- | --- |
| Citrouille sculptée | appui d'une fenêtre ordinaire ; rambarde d'un balconnet ; rambarde d'un balcon filant (logement sans fenêtre ordinaire) | habitant, penché à la fenêtre ou depuis le balcon | oui, indépendante de la pièce, plus tard qu'elle |
| Sorcière (silhouette découpée) et balai contre le mur | dalle d'un balcon filant, derrière le garde-corps | habitant, depuis la porte-fenêtre | non |
| Squelette assis, jambes pendantes | rambarde d'un balcon filant | idem | non |
| Corbeau perché (tourne la tête) | rambarde d'un balcon filant | idem | non |
| Araignée géante au bout de son fil (balancement lent) | sous la dalle d'un balcon filant | habitant penché à la rambarde, il la descend | yeux rouges |
| Toile d'araignée (une ou deux) | angle de l'encadrement de l'entrée d'immeuble | habitant, à l'escabeau | non (fils plus clairs) |
| Fantôme en drap | pendu à l'imposte de l'entrée | habitant, à l'escabeau | légère lueur |
| Chaudron | au pied de l'entrée, sur le trottoir | habitant, à la main | lueur verte et bulles |
| Lanterne citrouille | potence sur le fût du lampadaire | mairie, camion-nacelle | allumée avec le lampadaire |
| Guirlande de chauves-souris | festons depuis la lanterne du lampadaire | mairie, camion-nacelle | yeux orange avec le lampadaire |

- **Les citrouilles ne se ressemblent pas** : teinte (cinq orangés), aplatissement, inclinaison de la tige et visage
  (triangles et dents en zigzag, yeux ronds et sourire à deux dents, yeux méchants et dents carrées, non sculptée) tirés par
  citrouille. Assemblées par couches comme les sapins, jamais copiées d'une fenêtre à l'autre.
- **Proportions** (plan de la rue de la maquette, à vérifier au banc) : citrouille ≈ une fenêtre sur huit, jamais toutes ;
  décor de balcon sur environ un balcon filant sur trois ; décor d'entrée sur 50 à 75 % des entrées selon le style ; chaudron
  rare (20 à 70 % des entrées décorées). Taux par type de foyer (famille en tête, retraité en queue) :

| Foyer | Citrouille | Décor de balcon |
| --- | --- | --- |
| famille | 0,40 | 0,50 |
| coloc | 0,25 | 0,45 |
| couple | 0,20 | 0,30 |
| étudiant, solo | 0,14 | 0,20 |
| retraité | 0,10 | 0,15 |

  Multiplicateur du style : citrouilles × 1,4, autres × 0,85.
- **Lumières de fête** : allumées quand il fait nuit (`daylight < DARK`), du soir de la pose jusqu'à la nuit du 31 au
  1er novembre ; extinction tirée entre 0 h 20 et 1 h 30, **plus tard que les pièces**. À partir du 1er novembre au matin,
  ce qui reste n'est plus allumé (comme le dernier jour de Noël). La lanterne et la guirlande des lampadaires suivent
  `lampLit` pendant toute leur présence.

## 3. Décors des habitants (`city/halloween.ts`, pur)

### 3.1 Plan

`halloweenPlan(dwellings, facades, doors, seed, year)` rend la liste des décors de l'édition :
`{ id, kind, dwelling, member, gesture: 'lean' | 'balcony' | 'door' | 'stoop', window | door, x, v, off, installDay, removeDay }`.

- Logement (`cityDwellings`) : tirage de la citrouille et du décor de balcon (§2), fenêtre ou emplacement, `v` (dessin), `off`
  (extinction). Le membre qui décore est un adulte du foyer.
- Entrée (`doorsFor`) : tirage du décor (style), puis du foyer qui s'en charge (une famille de l'immeuble de préférence) ;
  chaudron tiré à part, posé par le même foyer juste après.
- Jour de pose tiré parmi le 24 → 31 (poids : sam. 24 et dim. 25 : 3 ; 26, 27, 29 : 1 ; 28 : 1,2 ; 30 : 1,4 ; 31 : 1,6) ;
  jour de retrait parmi le 1er → 8 novembre (1er : 2 ; 2, 3, 5, 6 : 1 ; 4 : 1,2 ; sam. 7 : 2,2 ; dim. 8 : 1,2). Un foyer pose
  tous ses décors le même jour, l'un après l'autre (fenêtre, balcon, puis la porte et le chaudron), et les retire de même.
- **Absence** : si le foyer est parti la semaine tirée (`Presence = 'away'`, vacances de la Toussaint comprises), la pose glisse
  au premier jour de présence de la fenêtre ; absent toute la fenêtre, il ne décore pas cette année. Le retrait glisse au
  premier jour de présence après le 1er novembre, même après le 8.

### 3.2 Heure et emploi du temps

- Heure de tendance : en journée le week-end et le 1er novembre (10 h à 17 h), après le retour du travail en semaine (18 h à
  20 h 12), le 31 entre 10 h et 15 h (avant la soirée).
- La pose est une **scène de l'emploi du temps** (`schedules.ts`) du jour de pose : posée comme les scènes courtes, au
  premier moment libre du membre (règle `SHIFT`), donc jamais pendant une autre scène ni quand il est dehors. L'état d'un décor
  se lit sur cette scène le jour même, et vaut « posé » les jours suivants jusqu'au jour de retrait (idem au retrait).
- Nouvelles chorégraphies (`Choreo`, `window-choreo.ts`) :

| Geste | Durée | Déroulé | Objet posé (montage) / repris (démontage) |
| --- | --- | --- | --- |
| `decorLean` (fenêtre ordinaire, balconnet) | 1 min 12 | la fenêtre s'ouvre (`win`), il se penche, pose la citrouille sur l'appui ou la rambarde, se redresse, referme | à 50 % |
| `decorBalcony` (balcon filant) | 2 min 12 | la porte-fenêtre s'ouvre, il sort avec l'objet, va à l'emplacement, le pose (l'araignée : penché à la rambarde, il la descend), rentre | à 55 % |
| `decorDoor` (entrée) | 4 min | **sortie par la porte** (cage, hall éclairé la nuit, fondu à l'encadrement) avec l'**escabeau replié** sous le bras et le décor, il déplie l'escabeau à côté de la porte, monte, accroche, descend, replie, **rentre** | à 60 % |
| `decorStoop` (chaudron) | 1 min 18 | aller-retour à la main depuis la porte, il s'accroupit pour poser ou reprendre | à 50 % |

- **Rien n'apparaît sur place** : l'objet est dans les mains avant le geste au montage, après au démontage ; l'escabeau sort
  de l'immeuble et y rentre. Les gestes de porte réutilisent la sortie et le retour existants (`door-passage.ts`, minuterie
  de la cage, `hall-lights.ts`).
- Météo : la pose et le retrait ne dépendent pas de la météo. Sinon l'état d'un jour dépendrait de la pluie des jours passés
  (et des prévisions, qui changent). Sous la pluie, le geste a lieu quand même, en parapluie pour la porte (voir « Points à
  valider »).
- Priorité de la borne `MAX_ANIM` : 4 (comme la traversée et les rideaux) : un geste de décor n'est pas coupé par une danse.

### 3.3 Rendu

- Fenêtres (`ghibli-window-art.tsx`, `window-life.tsx`) : citrouille sur l'appui (`paintPumpkin`, lueur hors filtre
  d'étalonnage comme les lumières de fenêtre), habitant penché qui la tient (`HeldProp` nouveau : `pumpkin`).
- Balcons : sorcière avant le garde-corps (`RAIL_H`), squelette, corbeau et araignée après ; même ordre que les occupants de
  balcon.
- Entrées (`city-sprites.tsx` / `EntranceSprite`) : toile, fantôme ; chaudron au pied, sur le trottoir ; escabeau (nouveau
  `StepladderSprite`, porté replié ou déplié en A).
- Mouvement réduit : les décors posés sont dessinés à leur état, aucun geste animé (l'habitant n'est pas dessiné), pas de
  balancement d'araignée ni de bulles.
- Sans fenêtre dans la pièce, rien n'est calculé.

## 4. Lampadaires (mairie, `city/install.ts`)

- Nouveau jeu `lamps-halloween` : `equipment: 'lift'`, `transport: 'lift'`, un élément par lampadaire (`lampsFor`), de
  type `lamp-pumpkin` ou `lamp-bats` tiré par lampadaire (55 / 45). Pose `{ dayOffset: −7, from: 540, to: 1020 }` (samedi
  24 octobre), retrait `{ dayOffset: +3, from: 540, to: 1020 }` (mardi 3 novembre). Même moteur que les drapeaux : créneaux
  dans l'ordre de `u`, étapes `arrive, deploy, rise, fix, lower, stow, leave`, élément visible à la fin de `fix`, caisse de
  décors sur le plateau (`LIFT_FETCH`).
- `ItemKind` gagne `lamp-pumpkin` et `lamp-bats` ; sprites dans `install-sprites.tsx` (repère du lampadaire, comme
  `LampFlag`).

## 5. PR 2 : la nuit du 31 (à détailler après la maquette des déguisés)

- `CityIntensity.festive` pour `halloween` : affluence forte du coucher du soleil à 23 h, part de déguisés élevée ; veille
  et lendemain : quelques déguisés isolés. Sous la pluie : affluence réduite, parapluies.
- Couche « déguisement » du passant (sorcière, fantôme, squelette, vampire, momie, zombie, diable, citrouille, chat noir,
  super-héros), portée par-dessus la tenue, choisie par `p.u < festive.share` (aucun tirage de plus).
- Enfants accompagnés, seau à bonbons, **d'entrée en entrée** ; à certaines entrées décorées, un habitant ouvre (hall éclairé)
  et donne des bonbons.
- Farces : **sonner et s'enfuir** (le hall s'allume, personne n'est là, la porte se referme) ; **faire peur** (un jeune
  déguisé surgit d'une entrée, le passant sursaute).
- Animaux (vague 1c) : déclencheur « groupe déguisé dans l'axe d'une fenêtre », même plan qu'au promeneur de chien.

## 6. Tests

- Calendrier : `halloween` actif le 31 de 17 h à 23 h seulement ; `decorSetsFor` rend `lamps-halloween` du 24 octobre au
  3 novembre et rien le 23 ni le 4.
- Plan : déterminisme (même graine et même année : même plan), autre année : autre plan ; part des fenêtres à citrouille entre
  1/12 et 1/6 sur plusieurs graines ; jamais de décor de balcon sans balcon filant ; un style par façade.
- Horaires : pose entre le 24 et le 31, retrait entre le 1er et le 8 (sauf absence), jamais pendant une autre scène du membre ;
  absent toute la semaine : pas de décor.
- États : absent avant la pose, posé à la fin du geste, présent les jours suivants, retiré après le geste de retrait ; objet en
  main exactement pendant la partie du geste prévue ; porte ouverte pendant la sortie et le retour.
- Lumières : citrouille allumée la nuit même pièce éteinte, éteinte entre 0 h 20 et 1 h 30, jamais allumée le jour ni après la
  nuit du 31 au 1er ; lanterne de lampadaire allumée avec lui.
- Rendu (jsdom) : sprites présents à l'état voulu, aucune erreur en mouvement réduit, aucun habitant dessiné en mouvement réduit.

## 7. Livraison

1. Spec et maquette des décors (ce document).
2. **PR 1** : plan, calendrier, moteur (`halloween.ts`, `install.ts`), scènes de l'emploi du temps, rendu, tests, captures au
   banc `.superpowers/harness-ville` (`date=2026-10-24`, `2026-10-31`, `2026-11-03`).
3. Maquette des déguisés et des farces.
4. **PR 2** : nuit du 31, réaction des animaux.

## Points à valider

1. **Pluie pendant un geste** : la règle « l'état d'un jour ne dépend que de la date » interdit de reporter un geste selon la
   météo réelle. Proposition retenue par défaut : on décore quel que soit le temps (gestes courts, parapluie posé contre la
   porte pendant le geste d'escabeau). Autre choix possible : pas de geste de porte ni de balcon un jour de pluie *prévue au
   moment du calcul*, au prix d'un décor qui peut « changer de jour » si la prévision change.
2. **Retrait jusqu'au 8 novembre** (une semaine et un jour, pour couvrir le second week-end).
3. **La mairie le samedi 24** (pose) : garder le samedi, ou avancer au vendredi 23 ?
4. Proportions et taux du §2, à juger sur les captures (`nuit-31oct-21h`).
