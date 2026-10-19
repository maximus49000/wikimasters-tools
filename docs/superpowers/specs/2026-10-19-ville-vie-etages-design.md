# Ville Ghibli — la vie au-dessus de la rue (design)

Date : 2026-10-19. Chantier 2 sur 3 de la refonte « naturelle et logique » de la scène Ville (1 : façades parisiennes,
PR #342 ; 3 : fond de la ville). Maquette validée par l'utilisateur : `docs/superpowers/maquettes/vie-etages/`
(`maquette.html` assemblée depuis `src/*.js`, captures PNG, `notes.md` = catalogue, horaires, règles, couleurs, fonctions à
porter). Elle reprend les façades du chantier 1 à l'identique.

## 1. Intention

L'utilisateur veut « plus de vie au-dessus de la rue principale » et « des animations de personnages derrière les fenêtres »,
« logiques ». Les étages et les toits sont aujourd'hui un décor mort : seuls les logements s'allument (chantier 1). Ce
chantier donne à chaque logement des habitants dont on voit la vie au fil de la journée, du calendrier et de la rue, et
anime les façades et les toits (volets, rideaux, fleurs, chat, pigeons, fumées, couvreur).

## 2. Objectifs (conformes à la maquette validée)

1. **Foyers fixes** par logement (couple, famille, retraité, étudiant, colocation, personne seule — proportions de
   `notes.md`), avec pièces (cuisine, chambre, salon ; le salon donne sur le balcon quand il y en a un).
2. **Emploi du temps** par type de foyer, semaine / week-end, avec aléas par foyer pour que rien ne se fasse en même temps
   (horaires de `notes.md` §Emploi du temps) ; les **lumières suivent la présence par pièce**.
3. **Scènes** du catalogue (`notes.md` §Catalogue) : cuisine du matin, ouvrir / fermer volets ou persiennes, petit-déjeuner,
   enfant à la fenêtre, départ, arroser, secouer le tapis, regarder la rue, retour, dîner, télé, fumer, extinction pièce par
   pièce, fête (coloc le samedi, Nouvel An), réactions aux événements (feux du 14 juillet et du Nouvel An, Fête de la
   musique, déménagement, sirène), sapin en décembre.
4. **Façade et toits vivants** : persiennes métalliques repliables (haussmannien) et volets battants (faubourg) qui
   s'ouvrent / se ferment un à un ; rideaux tirés / ouverts ; battant qui s'ouvre ; fleurs de saison ; chat (tabatière →
   terrasson → assis contre la souche) ; pigeons sur les corniches qui s'envolent et reviennent ; couvreur certains jours ;
   fumées de cheminée en hiver.
5. **Retour logique** : un habitant qui rentre passe la porte de l'immeuble, la cage d'escalier s'éclaire avec sa silhouette
   qui monte palier par palier, puis son logement s'allume, il passe devant la fenêtre et tire les rideaux.
6. **Jour / nuit** : de jour, reflet de la vitre (on voit surtout les gens fenêtre ouverte, penchés ou au balcon) ; la nuit,
   silhouettes en contre-jour dans les pièces allumées, ombre derrière un rideau tiré.

## 3. Non-objectifs

- Le fond (mur du fond, colline) n'est **pas** modifié (chantier 3) — condition explicite de la validation par l'utilisateur.
- Pas d'habitants 3D derrière les vitres ; pas de nouveaux gabarits d'immeubles ; pas de fiche WikiHow (fin de G7) ; pas de
  mesures téléphone par PR (campagne après G7).
- La maquette remplaçait l'ambiance jour/nuit par la sienne (`setEnvAt`) : on **garde** le ciel et la lumière de l'app.

## 4. Anti-objectifs

- Un personnage, un chat ou un pigeon qui apparaît ou disparaît sur place (règle du projet : entrée et sortie en marchant,
  par la porte-fenêtre, la lucarne ou en vol).
- Une ville synchrone (tous les volets en même temps, tout le monde à table à la même minute).
- Une ville prévisible : les mêmes scènes aux mêmes heures chaque jour, ou un logement qui refait exactement la même soirée.
- Une baisse de fluidité sur Android (le chantier 1 a doublé les images/s au banc : ne pas reperdre ce gain).
- Un état qui dépend de l'animation : une scène écartée par la borne garde sa lumière et ses volets, seul le pantin n'est
  pas dessiné.

## 5. Ce qui est décidé

### 5.1 Logique (moteur)

- **Aléatoire et imprévisible, mais logique** (consigne de l'utilisateur, 2026-10-19) : les scènes et les lumières ne doivent
  pas se répéter d'un jour à l'autre ni suivre un horaire fixe reconnaissable. Chaque jour de scène retire tout : quels foyers
  sont présents (absents en vacances, malades à la maison, invités, rentré tard…), les heures de chaque routine (fortes
  variations autour des horaires types de `notes.md`, qui deviennent des tendances et non des rendez-vous), les scènes
  facultatives (arroser, tapis, fumer, regarder la rue, fête, télé ou lecture…), l'ordre des extinctions. La logique, elle,
  reste celle de la vie réelle et de la situation : heure, jour de semaine / week-end / férié / vacances scolaires
  (`city/calendar.ts`, `school-calendar.ts`), saison, météo (moins de balcons sous la pluie), événements de la rue. Techniquement,
  le tirage est déterministe à partir de (graine de la ville, date, logement) pour que les tests restent reproductibles, mais
  la date change tout chaque jour : rien n'est prévisible pour l'utilisateur. L'état à l'instant t reste une fonction de
  (date, heure), sans état caché.
- **Feux d'artifice** *(choix de Claude, d'après la même consigne)* : les jours de fête, un spectacle a lieu dans une fenêtre
  logique (14 juillet vers 22 h 15-23 h, Nouvel An autour de minuit) avec un début, une durée et un rythme de salves tirés au
  hasard ; les habitants ouvrent les fenêtres et éteignent le salon quand il commence, pas à heure fixe. Hors fête, les salves
  isolées actuelles restent.
- Foyers : `householdFor` / `makeHousehold` portés dans un module `city/households.ts`, tirés depuis les `homes` de
  `facadeLayout` (chantier 1), sans changer le tirage de la rue ni la mise en page.
- Emplois du temps : `buildSchedule` porté dans `city/schedules.ts`, calculé **une fois par jour de scène et par logement**
  (pas à chaque image).
- État d'un logement à l'instant t (`homeState` : pièces allumées, volets, rideaux, battant, scène en cours) dans
  `city/home-state.ts`.
- **Lumières** *(choix de Claude)* : elles découlent désormais de la présence par pièce (emplois du temps), et non plus du
  seuil aléatoire `home.u` du chantier 1 ; la courbe horaire de `window-lights.ts` sert de cible de calibrage (un test vérifie
  que la part des fenêtres allumées dans la ville reste proche de cette courbe aux heures clés). La « pièce seule » du
  chantier 1 devient naturelle (un seul occupant dans une pièce, télé au salon).
- **Retour** *(choix de Claude)* : il est accroché aux passages réels des habitants aux portes que la ville gère déjà
  (`city/doorway.ts`, minuterie des halls et de la cage du chantier 1) : un passage entrant à l'heure de retour d'un foyer de
  cet immeuble devient son retour (cage, logement, rideaux) ; pas de nouveaux marcheurs dans la rue.
- **Retour et départ, précisions** *(choix de Claude)* : l'emploi du temps garde ses heures (la scène reste pure) et le
  logement s'allume à l'heure prévue même sans passage visible (l'habitant est entré sans être vu : porte fermée par
  l'intensité, mouvement réduit). Quand un passage entrant réel tombe à cette porte dans la fenêtre de retour d'un foyer, il
  devient son retour et la cage s'allume jusqu'à **l'étage de ce foyer** (au lieu d'un étage tiré au hasard). Un retour à
  plusieurs (famille) se contente d'un seul marcheur visible. Les départs du matin s'accrochent de la même façon aux passages
  sortants. Le marcheur de la rue (habitant 3D) et le pantin qui traverse la fenêtre n'ont pas la même tenue : accepté, car
  de jour la vitre ne laisse voir qu'une silhouette à 30 % sous le reflet, et la nuit le contre-jour masque l'écart.
- **Déménagement** *(choix de Claude)* : les voisins curieux réagissent au déménagement existant (celui des commerces,
  `shops/moving.ts`, 8 h-10 h) ; un vrai déménagement de logement (camion, porteurs, logement qui se vide) reste hors de ce
  chantier. La capture « déménagement » est prise pendant celui des commerces.
- **Sirène** : réaction aux passages réels des véhicules d'urgence (courte, seule exception à la pureté).
- **Réactions** branchées sur les événements existants (feux du 14 juillet et du Nouvel An, Fête de la musique, déménagement,
  sirène des véhicules d'urgence).
- **Borne** : au plus **8 scènes animées** à la fois (`cullAnimated`, priorités de `notes.md`) ; les poses fixes (table, télé,
  penché, balcon immobile) ne sont pas bornées.

### 5.2 Rendu

- Personnages : **même cinématique que les pantins de la rue** (moteur `figure/`), à fusionner avec l'existant plutôt que
  dupliquer ; poses clés (`POSE` de la maquette) cuites et réutilisées ; silhouette `#1A1422` en contre-jour la nuit ; taille
  0,66 × hauteur d'étage (enfants 0,62, retraités 0,94 relatifs).
- **Volets et persiennes** deviennent dynamiques : leur état change dans la journée, ils ne peuvent plus être peints dans les
  tranches fixes du décor ; ils passent dans un calque dynamique (poses clés d'ouverture), le décor fixe garde l'embrasure.
  Les persiennes laissent filtrer la lumière par les lames quand la pièce est allumée.
- Toits : chat, pigeons, couvreur et fumées dans un calque des toits, sous le ciel animé, au-dessus des tranches.
- Ordre de dessin, couleurs, scènes : ceux de la maquette (`notes.md` §Couleurs, §Fonctions à porter), en langage cellulo.
- Perfs : calques à nœuds constants (seule l'opacité / la pose change), boucle qui n'écrit qu'aux bascules, emplois du temps
  précalculés ; mesure au banc contre main à largeur égale, régression ≤ 15 %.

### 5.3 Choix validés avec la maquette

Persiennes repliables (haussmannien) et volets battants (faubourg) ; minuterie de cage 3 min au passage ; borne 8 animées ;
salons éteints pendant les feux ; chat sur les toits à la Mansart avec tabatière ; couvreur mardi et jeudi ; fête de la
coloc le samedi seulement ; pas de lumière dessinée de jour (`dark ≤ 0,2`).

## 6. Laissé au constructeur

- Découpage des fichiers et types, tant que les modules ci-dessus existent et restent purs.
- Technique de rendu des pantins aux fenêtres (sprites cuits du moteur `figure/` recommandés) et du calque des volets.
- Placement exact des foyers imposés de la maquette (« immeuble héros ») : dans l'app, tout est tiré.

## 7. Vérification

- Tests purs : foyers déterministes, emplois du temps sans chevauchement absurde, état identique pour une même (date, heure), deux jours différents donnent des journées différentes pour un même logement (heures et scènes), borne 8
  respectée, part allumée proche de la courbe horaire, aucune entrée / sortie sur place (chaque scène commence et finit par
  une marche ou une porte).
- Tests DOM : nœuds constants, aucune création / suppression au fil des heures, fond inchangé.
- Captures au banc (7 h, 11 h, 19 h, 21 h, 0 h 30, samedi 10 h, 14 juillet 22 h 30, décembre 18 h, déménagement) comparées à
  la maquette et envoyées à l'utilisateur ; mesure CPU ×4 contre main.
