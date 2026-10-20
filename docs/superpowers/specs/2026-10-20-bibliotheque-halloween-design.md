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

## 5. PR 2 : la nuit du 31

Maquette : `docs/superpowers/maquettes/halloween/` (`capture.mjs nuit=1`, notes « Nuit du 31 »). Décision du 2026-10-20 :
la réaction des animaux (vague 1c, jamais codée jusqu'ici) est construite **dans cette PR**, pour les groupes déguisés et
pour le promeneur de chien.

### 5.1 Ce que le code a déjà, ce qui manque

- Les passants (`people.ts`) bouclent en ligne droite (`loopX`) sans jamais s'arrêter ; `p.u` sert de **porte de présence**
  (`p.u < pedestrianGate`). Un déguisement tiré par `p.u` lierait « déguisé » à « présent » : on tire comme les signes de fête,
  par un hachage de l'id (`costumeU(id)`, comme `markU`).
- `FESTIVE_SHARE.halloween = 0`, `FESTIVE_CROWD.halloween = { mult: 1, floor: 0 }` : à remplir. `kids` tombe à zéro la nuit :
  les enfants du 31 ont leur propre plan.
- Portes : `doorway.ts` (`passageAt`, seuil), `door-passage.ts` (`placeSill`, fondu dans l'encadrement), minuterie du hall
  (`hallUntil`, `HALL_TIMER_S = 120`), `EntranceSprite`. Personne ne s'arrête à une porte aujourd'hui.
- Entrées décorées : dans `install.ts` (`halloweenSets`, privé). À exposer : `halloweenDoors(date, width, height, seed)`.
- Animaux : `PetAction` a `hiss`, `cower`, `hide`, pas d'aboiement ni de sursaut ; modèle d'interruption : l'orage
  (`runner.ts` `stormStrikes`, `storm.ts` `stormPlan`). Aucun lien entre la rue et la pièce.

### 5.2 Affluence et déguisements des passants (`intensity.ts`, `people.ts`)

- `FESTIVE_SHARE.halloween = 0.45`, `FESTIVE_CROWD.halloween = { mult: 1.5, floor: 0.45 }` pendant la plage du 31
  (17 h-23 h) ; la veille et le lendemain soir (19 h-minuit), une part de 0,06 sans hausse d'affluence (quelques déguisés
  isolés) : nouvelle plage `halloween-eve` dans le calendrier, ou lecture de la date dans `cityIntensity`.
- Déguisement d'un passant ordinaire : `costumeU(p.id) < festive.share` ; costume tiré du même hachage dans la liste adulte
  (sorcière, vampire, diable, squelette, zombie, momie, chat noir) ; sinon un accessoire (chapeau pointu, cornes, oreilles)
  pour une partie. Les accompagnateurs d'enfants : 30 % d'accessoire.
- Pluie : la baisse existante (`weatherWalk`) s'applique ; parapluies comme aujourd'hui (`intensity.umbrellas`).

### 5.3 Le plan de la soirée (`city/halloween-night.ts`, pur, nouveau)

Comme la maquette : `halloweenNight(day, doors, decorated, width, seed, wet)` rend, pour la soirée, une liste de **groupes**
(familles, jeunes, adultes déguisés) et de **farces**, tirés par minute de 16 h à minuit (`seed ^ hashString('halloween-night' +
date)`). Chaque groupe a un trajet d'un bord à l'autre fait de pièces `walk | stop | run` ; on lit sa position à la seconde.
Les passants ordinaires restent ceux de `people.ts` (avec leur déguisement §5.2) : le plan n'ajoute que les groupes qui
s'arrêtent.

| Groupe | Heures, débit par minute pour 900 px | Composition | Arrêts |
| --- | --- | --- | --- |
| Famille | 17 h 15 → 20 h 45, 1,4 au plus fort | 1-3 enfants déguisés (taille 0,55-0,7), seau citrouille ou sac ; un adulte derrière | entrée décorée 80 %, immeuble à citrouille allumée 35 % ; on ouvre 85 % (50 % sans décor) |
| Jeunes | 18 h 50 → 23 h 15, 1,8 | 2-4 déguisés (90 %) | 18 % sonnent et s'enfuient une fois |
| Adultes déguisés | 18 h 50 → 23 h 55, 1,4 | deux, au moins un déguisé | aucun |
| Faire peur | 20 h 30 → 22 h 45, ≈ 1 / 7 min | un jeune tapi dans une entrée, un passant | — |

- Débits ramenés à la largeur (comme `pedestriansFor`) ; pluie : familles × 0,35, jeunes × 0,7, adultes × 0,6.
- **Une porte, une scène à la fois** : créneaux occupés par porte ; une bande qui arrive pendant celui d'une autre passe.
- Costumes (enfants) : sorcière 2, super-héros 1,6, fantôme 1,5, citrouille 1,5, squelette 1,2, chat 1,2, diable 1,
  vampire 0,8, momie 0,6, zombie 0,6 ; (jeunes) zombie 2, squelette 1,5, vampire 1,2, puis les autres, pas de citrouille.
- Budget : les groupes comptent dans le budget des passants (≈ 14 groupes / 720 px) ; au-delà, les plus éloignés du centre
  ne sont pas dessinés (le plan ne change pas).

### 5.4 Les scènes à la porte

| Scène | Durée | Déroulé (secondes depuis l'arrêt) | Porte et hall |
| --- | --- | --- | --- |
| Bonbons | 24 s | enfants au pas de la porte (0-2,4), l'aîné sonne (2,6), attente ; l'habitant tient une coupe, donne à chaque enfant à son tour (9 + 2,4 k), bonbons qui volent au seau tendu, « merci » (17-19), retour vers l'adulte resté au bord du trottoir | hall allumé à 4,5 (minuterie 2 min), porte ouverte de 7,5 à 20,5, habitant dans l'embrasure |
| Pas de réponse | 13 s | sonnent deux fois (2,6 et 7), se regardent, repartent | rien |
| Sonner et s'enfuir | 4 s + course | un jeune file à la porte, sonne (1,5), revient en courant ; la bande accroupie détale en riant (× 2,6 sur 42 unités) | hall allumé à 8, porte ouverte de 12 à 19,5, l'habitant regarde à gauche et à droite, personne |
| Faire peur | ≈ 12 s | jeune tapi dans l'embrasure entrouverte (dans l'ombre, dès 22 s avant) ; il surgit (5,5, « bouh »), le passant sursaute, recule, main au cœur, repart plus vite ; le jeune rit et rentre | porte entrouverte puis refermée |

- L'habitant qui ouvre n'est pas relié à un foyer : tenue tirée de la porte (comme l'habitant des décors d'entrée, PR 1), 30 %
  avec un chapeau pointu ; il apparaît dans l'embrasure par le seuil existant (`door-passage.ts`), hall éclairé derrière lui.
- Hall : l'événement pose `hallUntil` comme un passage d'habitant (`HALL_TIMER_S`), donc la cage s'éteint seule.
- Rendu : nouvelle couche `content/halloween-night-layer.tsx` dans `city-life.tsx` (après les passants, avant les
  véhicules), figures `GhibliFigure` avec `costume` (pantin 2D forcé, comme `santa`) et objets tenus (`held` : seau, sac,
  coupe, parapluie) ; classique : `PersonSprite` avec `costume`.

### 5.5 Déguisements (dessin, `figure/costumes.tsx`)

Couche par-dessus le pantin (planche `planche-deguisements`) : couleurs de base remplacées (tenue, peau, cheveux), pièces
derrière le corps (capes de vampire et de super-héros, queues de diable et de chat) et devant (chapeau de sorcière, robe,
os, bandelettes, haillons, cornes, oreilles, boule de citrouille, masque, insigne). Fantôme : un drap remplace le pantin
(bas qui ondule et traîne, trous des yeux, pieds dessous). Zombie : bras tendus en marchant. Vus de dos au pas de la porte :
pas de visage.

### 5.6 Animaux (vague 1c, `pets/`)

- **Déclencheur** : un groupe déguisé (§5.3), un passant déguisé ou le promeneur de chien (`events.ts`) qui passe **dans
  l'axe d'une fenêtre de la pièce**. Pont rue → pièce : la scène Ville publie les passages (`{ id, x, at }`, x en unités de
  la rue) ; la pièce connaît la plage de la rue vue par chaque fenêtre (`sceneView`) et en tire un événement `outside`
  dans `PetContext` (`{ id, since, window }`), un tirage par passage.
- **Chien** éveillé (toute action sauf `sleep`) : interrompt son plan, court à la fenêtre (cellule `window` du plan de la
  pièce), se dresse (pattes sur l'appui) et **aboie** 3 à 5 s (`bark`, nouvelle action), puis reprend. **Chat** éveillé à
  moins de quelques cellules d'un chien qui aboie : **sursaut** (`startle`, dos rond, nouvelle action), puis une fois sur
  trois `hiss` et `hide` sous un meuble. Robot : rien. Endormi : rien.
- Plans à heure absolue comme l'orage (`barkPlan`, `startlePlan`), donc un rechargement retrouve le même état ;
  mouvement réduit : pas de réaction.

### 5.7 Mouvement réduit, budget, nuit

- Mouvement réduit : groupes dessinés à leur place, debout ; aucune scène de porte, aucune farce, aucune réaction animale.
- Les figures de la rue restent lisibles la nuit (elles sont sous les lampadaires, comme les passants aujourd'hui).
- Après 23 h 55, plus de groupe ; les derniers finissent leur traversée.

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
3. Maquette des déguisés et des farces (`capture.mjs nuit=1`).
4. **PR 2** : nuit du 31 (§5), réaction des animaux (vague 1c) ; tests (§6 bis) et captures au banc (`date=2026-10-31`,
   `h=18.5`, `h=21.2`, pluie).

## 6 bis. Tests de la PR 2

- Plan de la soirée : déterminisme ; aucun groupe avant 16 h ni après minuit ; familles seulement de 17 h 15 à 20 h 45 ;
  arrêts seulement devant des entrées décorées ou des immeubles à citrouille ; jamais deux scènes en même temps à une porte ;
  pluie : moins de groupes, mêmes farces possibles.
- Scènes : porte ouverte et hall allumé exactement aux instants prévus ; pas de réponse : aucune lumière ; position des
  figures continue d'une pièce de trajet à l'autre.
- Passants : part de déguisés ≈ `share` sur plusieurs graines ; `p.u` (présence) inchangé ; aucun tirage déplacé.
- Animaux : chien éveillé → `bark` à la fenêtre ; endormi → rien ; chat près d'un chien qui aboie → `startle` ; mouvement
  réduit → rien ; même plan après rechargement.
- Rendu (jsdom) : dix déguisements sans erreur, pantin 2D forcé, vu de dos sans visage.

## Points à valider

1. **Pluie pendant un geste** : la règle « l'état d'un jour ne dépend que de la date » interdit de reporter un geste selon la
   météo réelle. Proposition retenue par défaut : on décore quel que soit le temps (gestes courts, parapluie posé contre la
   porte pendant le geste d'escabeau). Autre choix possible : pas de geste de porte ni de balcon un jour de pluie *prévue au
   moment du calcul*, au prix d'un décor qui peut « changer de jour » si la prévision change.
2. **Retrait jusqu'au 8 novembre** (une semaine et un jour, pour couvrir le second week-end).
3. **La mairie le samedi 24** (pose) : garder le samedi, ou avancer au vendredi 23 ?
4. Proportions et taux du §2, à juger sur les captures (`nuit-31oct-21h`).
5. **PR 2** : débits du §5.3 (« grand spectacle » sans saturer le trottoir), part des passants déguisés (0,45), fréquence de
   « faire peur » (une fois toutes les 7 min), et l'habitant qui ouvre avec un chapeau pointu une fois sur trois.
