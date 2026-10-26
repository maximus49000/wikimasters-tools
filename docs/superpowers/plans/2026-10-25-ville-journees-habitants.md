# Ville : journées des habitants et leur rendu (lots 2 + 3) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** chaque habitant a, chaque jour, sa propre journée (travail en services, congés et RTT, école, sorties, sommeil,
rendez-vous) dans le respect du droit du travail ; la scène la montre : lumières par pièce selon qui est là et où,
habitants et visiteurs identifiés qui passent la porte de l'immeuble, une tenue par personne et par jour (pyjama le matin
et au coucher).

**Architecture :** un modèle pur, porté de `modele.js`, découpé par responsabilité (droit du travail, congés, journée de
travail, école, sorties, journée de la personne, pièces occupées, visiteurs) calcule `HouseholdDays` une fois par jour et
par logement. `schedules.ts` ne compose plus la journée par type de foyer décalée par `dayDraw` : il pose les segments
(`lit`, `act`, `depart` / `return`…) à partir des pièces occupées par chacun. Les portes ne bouclent plus toutes les 160 s :
chaque `depart` / `return` d'un membre et chaque visite devient un trajet unique, étalé sous le plafond mobile ; la tenue
du jour suit la personne partout.

**Tech Stack :** TypeScript, React (calques SVG de la scène), Vitest.

**Spec :** `docs/superpowers/specs/2026-10-25-ville-journees-habitants-design.md` (lots 2 et 3, « Réponses de
l'utilisateur », « Choix du concepteur ») ; règles et valeurs : `docs/superpowers/maquettes/lever-habitants/notes.md` ;
modèle de référence à porter : `docs/superpowers/maquettes/lever-habitants/modele.js` (fonctions citées par leur nom).

## Global Constraints

- Une seule PR pour les lots 2 et 3 ; pas d'adaptateur vers l'ancien décalage par foyer (`DayDraw.wake/back/evening/bed`
  et `Presence` `'sick' | 'late'` disparaissent).
- Déterminisme : (graine de la ville, logement, membre, date) → même journée ; tirages par flux nommé
  `dayRng(hh.seed, m, iso, usage)` ; aucun état mémorisé d'un jour à l'autre : la veille est recalculée (profondeur 1 jour).
- Android d'abord : `householdDays` / `buildSchedule` calculés une fois par jour et par logement (cache de
  `use-scene-life`), jamais par image ni par minute ; la boucle d'animation ne fait que lire des tableaux déjà prêts.
- Rien n'apparaît ni ne disparaît sur place : on entre et sort par la porte en marchant ; une lumière ne s'allume que si
  quelqu'un est dans la pièce (tolérance : 10 min d'extinction après le dernier occupant) ; le changement de tenue se fait
  hors de toute scène visible.
- Droit du travail (`LAW`, minutes) : effectif/jour ≤ 600 ; période sans pause ≤ 360 ; pause ≥ 20 ; amplitude ≤ 660
  (≤ 780 en horaires coupés) ; repos quotidien ≥ 660 depuis la fin du dernier service ; repos hebdomadaire ≥ 2100 d'affilée ;
  ≤ 2880 par semaine ISO ; CP ≥ 25 jours ouvrés par an.
- Travail : cadre début trait 510–570 ± 15 par jour (pas de 5) ; effectif trait 450–510 ; pause trait 45–90 ± 15 par jour,
  bornée [45, 90], déjeuner entre 720 et 780 ; journée longue 12 % (+ 30–60) ; fin cadre ≤ 1170 ; non-cadre début 390–480
  fixe, pause 30 après 210–270 min ; HCR services [660, 870] et [1110, 1350], mardi → samedi, retour à la maison pendant la
  coupure 75 % ; préparation ± 5 par jour ; `continuousDay` : matin borné [120, 360], effectif ≤ min(600, matin + 360).
- Congés : RTT/an 35h 0, 39h 11, forfait 11, fonction publique 15, hcr 0, particulier 0 ; semaines ISO de vacances
  scolaires : hiver 8–9, printemps 16–17, été 28–35, Toussaint 43–44, Noël 52 ; parents : 3 semaines d'été consécutives
  (début 28–33) + 52 + une de {8, 9, 16, 17, 43, 44} ; sans enfant : 2 (50 %) ou 3 semaines consécutives débutant en
  27..(35 − n) + une de {52, 1, 7, 8, 9} ; jours épars et RTT : semaine 1–52 tirée, vendredi 60 %, lundi 20 %, mardi–jeudi 20 %.
- École : dépose 500, sortie 990, 10 min à pied, préparation de l'enfant 40, garderie jusqu'à 1110 au plus ; nounou arrive
  965, rentre avec les enfants 1000, repart 5–10 min après le retour d'un parent ; collège autonome dès 11 ans, 15 min à pied,
  mercredi fini à 720 ; crèche (moins de 3 ans) 510, tous les jours ouvrés y compris les vacances scolaires.
- Sommeil : rattrapage = coucher + besoin + [−30, +10], au plus 780 ; respect du sommeil 85 % ; coucher habituel ± 25,
  + 20 sans obligation le lendemain ; lever libre retraité lève-tôt [405, 450] sinon [450, 570] ; chômeur [450, 600] ;
  actif libre [480, 630] ; étudiant libre [540, 690] ; enfant < 11 [420, 495], ≥ 11 [510, 630] ; parent d'enfants < 11 un jour
  libre : debout 0–10 min après eux.
- Rendez-vous (jours ouvrés) : chômeur 0,2 à [525, 600], 60 min, trajet 15–35 ; retraité 0,1 à [510, 630], 45 min, trajet
  10–25.
- Soirées (`modele.js`, groupe « soir ») : jeune lendemain libre 0,45 (boîte 35 % : départ [1350, 1410], retour
  [1650, 1740] ; sinon bar [1170, 1260] → [1470, 1560]) ; lendemain travaillé bar 0,12 ([1170, 1230] → [1365, 1440]) ;
  jeudi boîte 0,10 de plus ([1350, 1395] → [1605, 1665]) ; adulte libre 0,25 ([1185, 1215] → [1380, 1455]), sinon 0,06
  (→ [1350, 1410]) ; senior samedi 0,30, vendredi 0,15, sinon 0,06, départ [1155, 1185], retour ≤ 1380 ; famille samedi 0,15
  et seulement avec nounou.
- Sorties de jour : retraité matin 0,65 / après-midi 0,5 ; chômeur 0,35 / 0,40 ; week-end ou congé 0,55 / 0,50 ; autre jour
  libre 0,2 / 0,25 ; famille un jour libre : parc tous ensemble 0,7 (début [900, 930], 90–120 min), courses d'un adulte 0,6
  ([630, 675], 45–75 min).
- Propositions du constructeur (à confirmer, voir rapport) : malade 1,5 % par adulte et par jour (enfants jamais) ; départ
  en vacances (`away`) : tous les actifs en CP toute la semaine ISO + tirage 0,6 (famille en vacances scolaires 0,8) ; foyer
  sans actif 0,04 par semaine (× 1,5 en juillet-août ; étudiants 0,3 en vacances scolaires) ; départ le samedi d'avant
  [600, 690], retour le dernier dimanche [960, 1140] ; visites : dîner (probabilités `GUESTS` actuelles, 1–2 amis), ami
  0,08 un jour libre (60–120 min), famille le dimanche 0,10 (90–150 min), livreur 0,10 par jour ouvré (2–4 min), vendeur
  0,008 et commercial 0,008 par jour ouvré (5–25 min) ; pyjama porté : enfants toujours, adultes 80 %.
- Portes : au plus `RESIDENT_CAP_PER_720 = 6` trajets en cours à la fois par 720 px de monde ; un trajet n'est jamais
  supprimé : un départ est montré plus tard, un retour plus tôt, de 15 min au plus.
- Textes en français ; commits en français terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ;
  tests par familles : `npm run test:famille -- scene-ville` (et `scene-pietons` dès que `city-life` est touché) ; une
  seule session de tests à la fois sur la machine (vérifier qu'aucun vitest d'une autre session ne tourne) ; chaque nouveau
  fichier de test est ajouté à la liste `lib(...)` de la famille `scene-ville` dans `tests/familles.ts`.

## Review Focus

1. Jeunes enfants (< 11 ans) seuls : à aucune minute un enfant < 11 ans n'est au logement, éveillé, sans un adulte du foyer
   ni la nounou (mercredi après-midi, garderie, sortie du samedi, parent malade compris) — test dans la tâche 7.
2. Semaine de vacances : le foyer sort ensemble le samedi et rentre le dimanche par la porte ; entre les deux, aucune
   lumière, aucun trajet, aucun décor d'Halloween posé — tests dans les tâches 3, 10 et 11.
3. Retours de nuit (boîte, 3 h – 5 h) : ils viennent de l'emploi du temps de la veille, passent la porte une seule fois
   (même id avant et après minuit), allument la chambre une dizaine de minutes — tests dans les tâches 10 et 12.
4. Heure de pointe (8 h en semaine, monde dense) : ≤ 6 trajets en cours par 720 px, autant de trajets que de
   `depart` / `return` de logements à porte, aucun retour montré après son heure, décalage ≤ 15 min — test dans la tâche 12.
5. Changement de tenue jamais vu : aucune scène `act` d'un membre ne chevauche `dressAt` ou `undressAt`, aucun trajet de
   porte en pyjama, un visiteur a la même tenue à la fenêtre et à la porte — tests dans les tâches 10, 14 et 15.

---

### Task 1 : traits complétés et flux du jour

**Files :** Modify `src/core/library/city/person-traits.ts` ; Test `tests/core/library/city/person-traits.test.ts`.

**Interfaces :**
- Consumes : `traitsOf`, `PersonTraits` (lot 1).
- Produces : `PersonTraits` gagne `commute: number; walk: boolean; prep: number; pause: number` au premier niveau (pour
  tous : étudiant, chômeur, retraité ont aussi un trajet et une préparation ; `pause` 45–90 pour un cadre, 30 sinon) et
  `school.end: number[]` (lundi → vendredi, −1 sans cours) ; `export function dayRng(seed: number, m: number, iso: string, use: string): () => number`
  (`mulberry32((seed ^ hashString(iso + '|' + use) ^ Math.imul(m + 1, 0x9e3779b1)) >>> 0)`).
- Ordre des tirages : la pause du cadre prend la place du `rng()` muet qui suit l'effectif (même nombre de tirages) ;
  `school.end` est tiré APRÈS tout le reste (collège : mercredi 720, sinon début + 390–480 borné à 1050 ; fac : début +
  180–480 borné à 1110) : les traits du lot 1 ne bougent pas.

- [ ] **Step 1 : tests rouges** : `traits du lot 1 inchangés` (empreinte JSON des anciens champs pour 3 graines, figée avant
  la modification dans `tests/core/library/fixtures/person-traits-lot1.json`) ; `pause cadre dans [45, 90], 30 sinon` ;
  `fin des cours après le début, collège fini à 12 h le mercredi` ; `dayRng : mêmes arguments → même suite, usage différent → autre suite`.
- [ ] **Step 2 : lancer** `npx vitest run tests/core/library/city/person-traits.test.ts` → échec.
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : vert.**
- [ ] **Step 5 : commit** `feat(ville): traits de journée complétés (pause, fin des cours, flux du jour)`.

### Task 2 : contrôle du droit du travail

**Files :** Create `src/core/library/city/labour-law.ts` ; Test `tests/core/library/city/labour-law.test.ts`.

**Interfaces :**
- Produces : `export type Shift = readonly [number, number]` (minutes du jour) ;
  `export const LAW = { dayMax: 600, noBreakMax: 360, breakMin: 20, spanMax: 660, splitSpanMax: 780, dailyRest: 660, weeklyRest: 2100, weekMax: 2880, paidLeaveMin: 25 } as const` ;
  `export function checkLabourLaw(days: readonly { iso: string; shifts: readonly Shift[] }[], split: boolean, who: string): string[]`
  (jours consécutifs ; erreurs en français, vide si tout va bien ; port de `verifierDroit` : repos quotidien compté depuis
  le dernier service, repos hebdomadaire = plus long intervalle sans travail qui touche chaque semaine ISO complète de la
  plage, bornes de la plage comprises) ;
  `export function checkPaidLeave(plan: ReadonlyMap<string, 'CP' | 'RTT'>, rtt: number, who: string): string[]`.

- [ ] **Step 1 : tests rouges** : `semaine type de Karim (39 h, 5 × [[480, 714], [744, 978]]) : aucune erreur` ;
  `10 h 30 effectives → erreur « travail effectif »` ; `service de 6 h 30 → erreur « sans pause »` ; `pause de 15 min → erreur` ;
  `amplitude 11 h 30 continue → erreur, 11 h 30 coupée → aucune` ; `fin 22 h 30 puis reprise 9 h → erreur repos quotidien` ;
  `Sarah HCR mardi → samedi : aucune erreur (repos dimanche + lundi à cheval sur deux semaines)` ;
  `six jours de 8 h 30 → erreur 48 h` ; `24 CP → erreur, 25 → aucune ; RTT différents du contrat → erreur`.
- [ ] **Step 2 : lancer** → échec (module absent).
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : vert.**
- [ ] **Step 5 : commit** `feat(ville): contrôle du droit du travail (journée, repos, semaine, congés)`.

### Task 3 : plan de congés et départs en vacances

**Files :** Create `src/core/library/city/leave-plan.ts` ; Modify `src/core/library/city/scene-day.ts` (retrait de
`awayInWeek`), `src/core/library/city/halloween.ts` (`presentOn`) ; Test `tests/core/library/city/leave-plan.test.ts`,
adapter `tests/core/library/city/halloween.test.ts`.

**Interfaces :**
- Consumes : `traitsOf`, `Household`, `publicHolidays`, `isoWeek`, `checkPaidLeave`.
- Produces : `export const SCHOOL_WEEKS = { hiver: [8, 9], printemps: [16, 17], ete: [28, 29, 30, 31, 32, 33, 34, 35], toussaint: [43, 44], noel: [52] } as const` ;
  `export function leavePlanOf(hh: Household, m: number, isoYear: number): ReadonlyMap<string, 'CP' | 'RTT'>` (vide pour un
  non-actif ; mémoïsée par foyer) ; `export function nannyLeavePlan(hh: Household, isoYear: number): ReadonlyMap<string, 'CP'>`
  (semaines calées sur celles du couple) ; `export type AwayState = 'home' | 'leaves' | 'away' | 'returns'` ;
  `export function awayState(d: Pick<Dwelling, 'key' | 'hh'>, seed: number, date: YMD, periods: readonly HolidayPeriod[]): { state: AwayState; at?: number }`
  (`at` : heure de départ le samedi `leaves`, de retour le dimanche `returns`).
- Règles : port de `planConges` ; les **semaines** de CP d'un couple (membres 0 et 1 conjoints) sont tirées une fois sur
  `hh.seed ^ hashString('leave') ^ isoYear` et partagées, les jours épars et RTT sont propres à chacun ; jours travaillés
  HCR = mardi → samedi ; un jour férié n'est jamais un CP ; année = année ISO de la date (31 décembre 2026 → semaine 53 de
  2026). `away` : valeurs de Global Constraints ; semaine W partie ⇒ samedi d'avant `leaves`, dimanche d'avant et jours de W
  jusqu'au samedi `away`, dimanche de W `returns` si W + 1 ne l'est pas (sinon `away`).

- [ ] **Step 1 : tests rouges** : `25 CP et les RTT du contrat pour chaque actif de 3 graines, sur 2026 et 2027` ;
  `aucun CP un samedi, un dimanche ni un jour férié (HCR : aucun le lundi ni le dimanche)` ; `parents : 3 semaines d'été
  consécutives dans 28–35 et la semaine 52` ; `RTT : ≥ 50 % des jours isolés un vendredi sur l'ensemble des actifs` ;
  `conjoints : mêmes semaines de CP` ; `away : jamais sans que tous les actifs soient en CP toute la semaine ;
  samedi leaves → away → dimanche returns, sans trou` ; `31 décembre et 1er janvier lus sur le plan de l'année ISO` ;
  `Halloween : aucun décor posé un jour away` (halloween.test).
- [ ] **Step 2 : lancer** → échec.
- [ ] **Step 3 : implémenter** ; supprimer `awayInWeek` et ses constantes `AWAY` de `scene-day.ts`, `presentOn` lit
  `awayState(...).state !== 'away'`.
- [ ] **Step 4 : vert** (`leave-plan.test.ts`, `halloween.test.ts`).
- [ ] **Step 5 : commit** `feat(ville): congés payés et RTT par contrat, départs en vacances tirés des congés`.

### Task 4 : journée de travail du jour

**Files :** Create `src/core/library/city/work-day.ts` ; Test `tests/core/library/city/work-day.test.ts`.

**Interfaces :**
- Consumes : `traitsOf`, `dayRng`, `leavePlanOf`, `Shift`, `LAW`, `DayContext`.
- Produces : `export type WorkDay = { shifts: Shift[]; start: number; end: number; effective: number; commute: number; prep: number; walk: boolean; split: boolean; homeAtBreak: boolean; long: boolean; drop: boolean }` ;
  `export type Duty = { kind: 'work'; w: WorkDay } | { kind: 'leave'; leave: 'CP' | 'RTT' } | { kind: 'sick' } | { kind: 'off' }`
  (`off` : week-end, férié, jour de repos HCR) ; `export function dutyOf(hh: Household, m: number, day: DayContext): Duty | null`
  (null : pas actif) ; `export function sickOn(hh: Household, m: number, iso: string): boolean` (adultes 1,5 %, enfants jamais) ;
  `export function continuousDay(o: { start: number; effective: number; pause: number; morning: number; commute: number; prep: number; walk: boolean; cadre: boolean; long: boolean }): WorkDay`
  (port de `journee` + `amenage`) ; `export function withDrop(w: WorkDay, cadre: boolean): WorkDay` (début repoussé à
  `500 + commute`, matin raccourci d'autant, recalculé par `continuousDay`, `drop: true`).
- Flux : `dayRng(hh.seed, m, iso, 'work')` dans l'ordre de `travailDuJour` (préparation, flex, journée longue, pause, midi).

- [ ] **Step 1 : tests rouges** : `jamais de travail le week-end ni un jour férié, sauf HCR le samedi` ; `CP / RTT du plan →
  Duty leave` ; `cadre : fin ≤ 19 h 30, déjeuner entre 12 h et 13 h` ; `non-cadre : début fixe d'un jour à l'autre` ;
  `HCR : deux services, homeAtBreak tiré` ; `withDrop : début ≥ 8 h 20 + trajet et checkLabourLaw vide sur la journée` ;
  `sickOn : jamais un enfant, ≈ 1,5 % des jours adultes sur 3 graines × 1 an (± 0,5 point)`.
- [ ] **Step 2 : lancer** → échec.
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : vert.**
- [ ] **Step 5 : commit** `feat(ville): journée de travail en services, pause et horaires coupés`.

### Task 5 : école, dépose, sortie, nounou, garderie

**Files :** Create `src/core/library/city/school-run.ts` ; Test `tests/core/library/city/school-run.test.ts`.

**Interfaces :**
- Consumes : `traitsOf` (`school`), `Duty`, `withDrop`, `Household.nanny`, `nannyLeavePlan`, `DayContext` (`schoolOn`,
  `kind`).
- Produces : `export const SCHOOL = { drop: 500, pickup: 990, walk: 10, kidPrep: 40, garderieMax: 1110, nannyArrive: 965, nannyHome: 1000, nannyLeave: [5, 10], collegeWalk: 15, crecheStart: 510, autonomousAge: 11 } as const` ;
  `export type SchoolDay = { kind: SchoolKind; start: number; end: number; autonomous: boolean; wednesday: boolean }` ;
  `export function schoolDayOf(hh: Household, m: number, day: DayContext): SchoolDay | null` (enfant et étudiant ; fac : jours
  ouvrés seulement) ;
  `export type Pickup = { by: 'parent'; m: number } | { by: 'nanny'; until: number; relay: number } | { by: 'garderie'; m: number; at: number }` ;
  `export type SchoolRun = { drop: number | null; pickup: Pickup }` ;
  `export function schoolRunOf(hh: Household, day: DayContext, duties: readonly (Duty | null)[]): { run: SchoolRun | null; duties: (Duty | null)[] }`
  (port de la logistique `LOG` : dépose par un parent libre, sinon un cadre (`withDrop`), sinon un non-cadre qui commence
  assez tard ; sortie par un parent libre ou rentré ≤ 980, sinon la nounou si elle n'est pas en congé, sinon garderie
  jusqu'au premier retour, au plus 1110 ; flux `dayRng(hh.seed, 0, iso, 'ecole')`).

- [ ] **Step 1 : tests rouges** : `un seul parent à la dépose et un seul à la sortie` ; `parent cadre qui dépose : début
  ≥ 500 + trajet, checkLabourLaw vide` ; `deux parents rentrés après 16 h 20 et nounou → nounou, jusqu'au retour du premier` ;
  `sans nounou → garderie, heure ≤ 18 h 30` ; `nounou en congé → garderie` ; `parent en RTT → il dépose et va chercher` ;
  `collégien : autonome, aucun accompagnement` ; `crèche ouverte pendant les vacances scolaires, fermée un jour férié` ;
  `mercredi : sortie à 16 h 30 (centre de loisirs)`.
- [ ] **Step 2 : lancer** → échec.
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : vert.**
- [ ] **Step 5 : commit** `feat(ville): logistique de l'école (dépose, sortie, nounou, garderie)`.

### Task 6 : sorties et rendez-vous

**Files :** Create `src/core/library/city/outings.ts` ; Test `tests/core/library/city/outings.test.ts`.

**Interfaces :**
- Consumes : `Household`, `dayRng`, `DayContext`, `traitsOf`.
- Produces : `export type LifeProfile = 'jeune' | 'adulte' | 'senior' | 'famille' | 'enfant'` ;
  `export function lifeProfileOf(hh: Household, m: number): LifeProfile` (port de `profil`) ;
  `export type Outing = { kind: 'bar' | 'boite' | 'resto' | 'theatre' | 'amis'; dep: number; ret: number }` ;
  `export function eveningOuting(hh: Household, group: readonly number[], day: DayContext, nextFree: boolean): Outing | null`
  (groupes : couple ou famille ensemble, coloc et solo chacun ; flux `dayRng(hh.seed, group[0], iso, 'soir')`) ;
  `export function outingGroups(hh: Household): number[][]` ;
  `export type Appointment = { at: number; dur: number; commute: number; label: string }` ;
  `export function appointmentOf(hh: Household, m: number, day: DayContext): Appointment | null` ;
  `export type Block = { a: number; b: number; k: 'commute' | 'work' | 'pause' | 'escort' | 'school' | 'class' | 'rdv' | 'out' | 'outing' | 'nanny' | 'trip'; label: string }`
  (hors du logement, minutes du jour, peut dépasser 1440) ;
  `export function dayErrands(hh: Household, m: number, day: DayContext, wake: number, busy: readonly Block[], mustPickAt: number | null): Block[]`
  et `export function familyErrands(hh: Household, day: DayContext): { all: Block | null; one: { m: number; b: Block } | null }`.
- Valeurs : Global Constraints (§ Soirées, § Sorties de jour, § Rendez-vous) ; senior : retour ≤ 1380 toujours ; famille sans
  nounou : jamais de sortie du soir.

- [ ] **Step 1 : tests rouges** (statistiques sur 3 graines × 1 an) : `jeunes : sorties plus fréquentes avant un jour
  libre (ratio ≥ 3)` ; `boîte seulement chez les jeunes, retour entre 2 h 45 et 5 h` ; `seniors : retour ≤ 23 h, plus de
  sorties le samedi` ; `familles sans nounou : aucune sortie du soir` ; `rendez-vous : jours ouvrés seulement, chômeur
  ≈ 20 %, retraité ≈ 10 % (± 4 points)` ; `dayErrands : aucun bloc qui chevauche busy, fin ≤ sortie d'école − 20 si
  mustPickAt`.
- [ ] **Step 2 : lancer** → échec.
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : vert.**
- [ ] **Step 5 : commit** `feat(ville): sorties du soir et de jour, rendez-vous`.

### Task 7 : journée de chaque personne (+ droit du travail sur un an)

**Files :** Create `src/core/library/city/person-day.ts` ; Test `tests/core/library/city/person-day.test.ts`,
`tests/core/library/city/labour-year.test.ts`.

**Interfaces :**
- Consumes : tâches 1 à 6, `awayState`, `Household.nanny`, `dayContext`, `addDays`.
- Produces :
  `export type PersonDay = { m: number; wake: number; bed: number; prevBed: number; why: string; prepEnd: number | null; dressAt: number; undressAt: number; duty: Duty | null; school: SchoolDay | null; outing: Outing | null; appointment: Appointment | null; sick: boolean; blocks: Block[]; out: [number, number][] }`
  (`bed` peut dépasser 1440 ; `prevBed` relatif à 0 h du jour, souvent négatif ; `out` : intervalles hors du logement, de
  la sortie par la porte au retour, blocs fusionnés quand moins d'1 min les sépare, triés ; `why` : explication du lever,
  comme `expl`) ;
  `export type NannyDay = { visitor: Visitor; visits: { arrive: number; leave: number; reason: 'sortie' | 'soir' }[]; shifts: Shift[] }` ;
  `export type HouseholdDays = { iso: string; away: { state: AwayState; at?: number }; people: PersonDay[]; run: SchoolRun | null; nanny: NannyDay | null }` ;
  `export function householdDays(d: Dwelling, day: DayContext, seed: number): HouseholdDays` (veille et lendemain par
  `dayContext(addDays(day.date, ±1), day.periods ?? [])`).
- Algorithme (port de la boucle de `modele.js`, étapes 1-5) : obligations de J − 1, J, J + 1 (devoir, école, cours,
  rendez-vous, logistique) ; lever = obligation stricte, sinon min(obligation, libre après rattrapage) ; parent qui se lève
  avec les petits ; blocs hors du logement ; sorties de jour ; sortie du soir d'après le lendemain ; coucher ; nounou.
  **Invariant de profondeur 1 :** `bed` ne dépend ni du lever du jour ni des sorties de jour (seulement des obligations de
  J et J + 1, de la sortie du soir et du flux `coucher`) ; le départ d'une sortie du soir = max(départ tiré, fin des
  blocs d'obligation avant 1170 + 30) ; ainsi `prevBed` de J = `bed` de J − 1 − 1440, exactement.
  `dressAt` = `prepEnd − 12` s'il y a un départ du matin, sinon lever + 25–75 (pas de 5), et toujours ≤ premier départ − 12 ;
  `undressAt` = coucher − 15 (− 10 après un retour de nuit) ; foyer `away` : `out` couvre [0, 1800] ; `leaves` : tous
  sortent ensemble à `at` ; `returns` : dehors de 0 à `at`.

- [ ] **Step 1 : tests rouges** (`person-day.test.ts`, 3 graines, villes de 1440 px, novembre 2026 avec les vacances de
  `approximatePeriods(2026)`) :
  `lever d'un jour travaillé = début − trajet − préparation, stable à ± 10 min sur la semaine` ;
  `retraités : une partie debout avant 7 h 30 le dimanche, pas tous, pas les mêmes chaque dimanche` ;
  `rendez-vous → lever plus tôt que le lever libre du même jour sans rendez-vous` ;
  `rattrapage : lendemain de boîte sans obligation, lever ≥ coucher + besoin − 30 et ≤ 13 h` ;
  `minorité : ≥ 80 % des veilles d'obligation couchées à temps (lever − coucher ≥ besoin − 30)` ;
  `profondeur 1 : householdDays(J).people[m].prevBed === householdDays(J − 1).people[m].bed − 1440 pour tous, 60 jours` ;
  `enfants < 11 jamais seuls au logement éveillés (adulte du foyer ou nounou présents à chaque minute)` (Review Focus 1) ;
  `nounou : arrive à 16 h 05 à pied, rentre à 16 h 40 avec les enfants, repart 5-10 min après le premier parent` ;
  `samedi resto de la famille avec nounou : nounou arrive dep − 10, repart ret + 5-10` ;
  `dressAt < premier départ, undressAt < bed, aucun bloc entre dressAt − 1 et dressAt + 1` ;
  `foyer away : out = [[0, 1800]] pour tous ; leaves : départs communs à at`.
- [ ] **Step 2 : test rouge de l'année** (`labour-year.test.ts`, délai 180 s) : `droit du travail sur 2026 pour 3 graines`
  — pour chaque logement de `cityDwellings(cityFacades(1440, 340, s), s)`, s ∈ {1, 2, 3}, chaque jour du 2025-12-29 au
  2027-01-03 : `householdDays`, puis `checkLabourLaw` par actif (services de `duty.w.shifts`) et par nounou
  (`NannyDay.shifts`) → `[]` ; `checkPaidLeave` → `[]` ; aucun service un dimanche ni un jour férié ; samedi seulement HCR.
- [ ] **Step 3 : lancer** les deux fichiers → échec.
- [ ] **Step 4 : implémenter** `person-day.ts`.
- [ ] **Step 5 : vert** (`npx vitest run tests/core/library/city/person-day.test.ts tests/core/library/city/labour-year.test.ts`).
- [ ] **Step 6 : commit** `feat(ville): journée de chaque habitant (lever, obligations, sorties, coucher, nounou)`.

### Task 8 : pièces occupées et repas du foyer

**Files :** Create `src/core/library/city/home-rooms.ts` ; Test `tests/core/library/city/home-rooms.test.ts`.

**Interfaces :**
- Consumes : `PersonDay`, `HouseholdDays`, `Dwelling.rooms`, `Room`.
- Produces : `export type RoomSpan = { m: number; room: Room; a: number; b: number; what: 'wake' | 'breakfast' | 'home' | 'lunch' | 'snack' | 'homework' | 'dinner' | 'evening' | 'bedtime' | 'night' }` ;
  `export type HouseholdMeals = { breakfast: number[]; lunch: number | null; snack: number | null; dinner: number | null; kidsDinner: number | null }` ;
  `export function householdMeals(d: Dwelling, hd: HouseholdDays, rng: () => number): HouseholdMeals` (dîner : base par type
  — famille 1167, retraite 1140, couple 1227, solo 1206, coloc 1230, étudiant 1230 — ± 20, au moins 10 min après le retour
  du dernier adulte qui dîne ; enfants < 11 au plus tard 1170) ;
  `export function roomTimeline(d: Dwelling, hd: HouseholdDays, meals: HouseholdMeals, guests: readonly { m: number; a: number; b: number }[]): RoomSpan[]`.
- Règles (notes « Ce que ça change », § `buildSchedule`) : lever → chambre 8 min (salon s'il n'y a pas de chambre) →
  cuisine jusqu'à la fin du petit-déjeuner (20 min) → salon jusqu'au départ ; retour : salon ; déjeuner à la maison en
  cuisine ; goûter des enfants avec la nounou en cuisine 20 min puis salon ou devoirs en chambre ; dîner en cuisine ;
  soirée au salon jusqu'à `bed − 15` ; chambre de `bed − 15` à `bed` ; retour de nuit : chambre 10 min ; jamais de pièce
  pendant un intervalle `out` ; invités et nounou (indices `m ≥ members.length`) : salon / cuisine avec leur hôte.

- [ ] **Step 1 : tests rouges** : `aucune RoomSpan pendant un intervalle out du membre` ; `chaque membre éveillé au logement
  est dans exactement une pièce à chaque minute` ; `pièce absente du logement → salon` ; `dîner après le retour du dernier
  adulte qui dîne, enfants avant 19 h 30` ; `retour de nuit : chambre 10 min, puis rien`.
- [ ] **Step 2 : lancer** → échec.
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : vert.**
- [ ] **Step 5 : commit** `feat(ville): pièces occupées par chaque habitant et repas du foyer`.

### Task 9 : visiteurs à identité stable

**Files :** Create `src/core/library/city/visitors.ts` ; Modify `src/core/library/city/id-card.ts` (export de `QUARTERS` et
d'un `visitorIdentity(rng, sex, age, job)`) ; Test `tests/core/library/city/visitors.test.ts`.

**Interfaces :**
- Consumes : `Visitor`, `firstNameFor`, `HouseholdDays`, `HouseholdMeals`, `SceneDay`.
- Produces : `export type VisitKind = 'diner' | 'ami' | 'famille' | 'livreur' | 'vendeur' | 'commercial' | 'nounou'` ;
  `export type Visit = { visitor: Visitor; kind: VisitKind; host: number; arrive: number; leave: number; inside: boolean }`
  (`arrive` / `leave` : heures de passage de la porte ; `inside` : entre dans le logement, donc vu aux fenêtres ; livreur,
  vendeur, commercial : `inside` false) ;
  `export function visitorPool(hh: Household): Visitor[]` (2 amis d'âge proche des adultes, 1 parent ou grand-parent ; ids
  `friend:<seed>:<k>`, flux `hh.seed ^ hashString('visitors')`) ;
  `export function cityCallers(seed: number): Record<'livreur' | 'vendeur' | 'commercial', Visitor[]>` (4, 2 et 2 ; ids
  `livreur:<seed>:<k>`…) ;
  `export function dayVisits(d: Dwelling, hd: HouseholdDays, meals: HouseholdMeals, day: SceneDay, seed: number, guests: boolean): Visit[]`
  (ordre stable : nounou, dîner, puis les autres par heure d'arrivée ; flux `dayRng(hh.seed, 0, iso, 'visites')`).
- Règle : un visiteur ne vient que si son hôte est au logement et éveillé de `arrive` à `leave` (montée comprise :
  `[arrive, leave + d.climb]`) ; dîner : arrivée `dinner − 12` (+ 3 par invité), départ avant le coucher de l'hôte − 8.

- [ ] **Step 1 : tests rouges** : `même foyer → mêmes amis chaque jour (id, prénom, âge, quartier)` ; `hôte présent et
  éveillé pendant toute la visite` ; `aucune visite un jour away` ; `livreurs seulement les jours ouvrés entre 9 h et 19 h` ;
  `nounou : visites identiques à NannyDay.visits` ; `dîner : 1-2 invités seulement si guests`.
- [ ] **Step 2 : lancer** → échec.
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : vert.**
- [ ] **Step 5 : commit** `feat(ville): visiteurs à identité stable (amis, famille, livreurs, vendeurs, nounou)`.

### Task 10 : emplois du temps depuis les journées de chacun

**Files :** Create `src/core/library/city/dwelling-day.ts` ; Modify `src/core/library/city/scene-day.ts` (`DayDraw`),
`src/core/library/city/schedules.ts` (`compose`, `buildSchedule`), `src/core/library/city/home-state.ts` (commentaires,
rien d'autre si les tests passent) ; Test `tests/core/library/city/dwelling-day.test.ts`, adapter
`tests/core/library/city/{scene-day,schedules,home-state,window-choreo,roof-life}.test.ts` (aide commune `dwellingDay`).

**Interfaces :**
- Consumes : `householdDays`, `householdMeals`, `roomTimeline`, `dayVisits`, `SceneDay`, `DecorTask`.
- Produces : `export type DayDraw = { guests: boolean; optional: Record<OptionalScene, boolean>; offOrder: Room[]; rng: number }`
  (`Presence`, `wake`, `back`, `evening`, `bed`, `SICK`, `LATE`, `SPREAD` retirés ; `dayDraw(d, day, seed): DayDraw` garde
  sa signature, `guests` tiré avec les probabilités `GUESTS` actuelles) ;
  `export function buildSchedule(d: Dwelling, day: SceneDay, draw: DayDraw, hd: HouseholdDays, visits: readonly Visit[], decor?: readonly DecorTask[]): Schedule`
  (inchangé : `Schedule`, `Segment`, `homeState`) ;
  `export type DwellingDay = { draw: DayDraw; hd: HouseholdDays; meals: HouseholdMeals; visits: Visit[]; schedule: Schedule }` ;
  `export function dwellingDay(d: Dwelling, ctx: DayContext, day: SceneDay, seed: number, decor?: readonly DecorTask[]): DwellingDay`.
- `compose` : le `switch (hh.type)` disparaît ; les segments viennent de `roomTimeline` : `lit` = union, par pièce, des
  `RoomSpan` des présents (teinte du foyer ; `tv` au salon en soirée si `optional.tv` ; `cool` pour étudiant et coloc ;
  `orange` en fête) ; `depart` / `return` = bornes des intervalles `out` des membres (indice `m`) et `arrive` / `leave` des
  visites `inside` (indice `n + k`, k = rang parmi les visites `inside`) ; on garde tels quels `act` / `actAny` / `fill`,
  volets (le premier levé ouvre, le dernier couché ferme ; retraité à la tombée de la nuit), rideaux, `cook` au début du
  petit-déjeuner et du dîner par un adulte présent, `table` aux repas, `tv` / `read` en soirée, bureau de l'étudiant et
  devoirs, `cross` au retour, `stand` en chambre au coucher des enfants, feux, Halloween, sapin, fête de la musique,
  déménagement, extinctions dans `offOrder`. Scènes facultatives posées dans les trous de leur membre : `smoke` (fumeur :
  adulte, `hh.smoker`, ou tout étudiant / colocataire), `water` / `rug` (retraité au logement le matin), `look`
  (n'importe quel présent), `kidWindow` (enfant au logement), `party` (coloc le samedi, membres présents). Chaque membre a
  un trou sans scène de `[dressAt − 1,5, dressAt + 1,5]` et `[undressAt − 1,5, undressAt + 1,5]` (dans `own(m)`).
- `SHUT_USERS`, `TONES`, `OFF`, `DECOR_TRIES`, `SHIFT`, `MIN_POSE` : inchangés.

- [ ] **Step 1 : tests rouges** (`dwelling-day.test.ts`, mêmes logements que `schedules.test.ts`) :
  `les départs et retours de chaque membre sont ceux de ses intervalles out (même minute)` ;
  `aucune pièce allumée plus de 10 min sans occupant éveillé au logement` ;
  `lumières de 3 h - 5 h seulement dans la chambre d'un membre rentré de boîte, 10 min` (Review Focus 3) ;
  `retour de coupure HCR : salon allumé l'après-midi si c'est la nuit` (16 h en décembre) ;
  `aucune scène act d'un membre ne contient dressAt ni undressAt` (Review Focus 5) ;
  `jour away : aucun segment ; leaves : dernier segment = depart commun` (Review Focus 2) ;
  `visites inside : return et depart aux heures de la visite, un siège de plus au dîner`.
- [ ] **Step 2 : adapter les tests existants** : `schedules.test.ts` garde tous ses invariants (bornes, une scène à la fois,
  aucune scène dehors, une lumière par pièce, extinctions variables, feux, volets du retraité, étudiant / coloc sans `shut`,
  `maxActors`, enfants à l'école, Halloween) avec `dwellingDay` ; supprimer `week-end : réveil plus tard`, `retraités vers
  7 h` (couverts par la tâche 7) ; `scene-day.test.ts` : retirer les tests d'absence, malade, rentré tard, décalages ;
  garder contexte, soleil, invités, pluie, coloc du samedi, fumeurs.
- [ ] **Step 3 : lancer** `npm run test:famille -- scene-ville` → échecs attendus sur les nouveaux tests.
- [ ] **Step 4 : implémenter** `dwelling-day.ts`, le nouveau `DayDraw`, `compose`.
- [ ] **Step 5 : vert** `npm run test:famille -- scene-ville` et `npm run typecheck` (sauf `use-scene-life.ts`, tâche 11 :
  si le typage bloque, faire la tâche 11 dans le même commit).
- [ ] **Step 6 : commit** `feat(ville): emplois du temps des logements tirés des journées de chaque habitant`.

### Task 11 : vie de la scène (cache du jour)

**Files :** Modify `src/content/use-scene-life.ts` ; Test `tests/content/use-scene-life.test.tsx`.

**Interfaces :**
- Consumes : `dwellingDay`.
- Produces : `SceneLife` gagne `days: Map<string, HouseholdDays>`, `prevDays: Map<string, HouseholdDays>`,
  `visits: Map<string, Visit[]>`, `prevVisits: Map<string, Visit[]>` (clé `Dwelling.id`) ; `buildSceneLife` appelle
  `dwellingDay` pour J et J − 1 (contexte `day.yesterday`, périodes `day.periods`) ; `today` / `yesterday` inchangés.
  La clé du cache (`sharedSceneLife`) inclut déjà jour, veille, périodes : rien à ajouter.

- [ ] **Step 1 : tests rouges** : `buildSceneLife : days et visits pour chaque logement, prevDays = journées de la veille` ;
  `deux appels du même jour → même objet (cache), aucun recalcul` (espion sur `householdDays`).
- [ ] **Step 2 : lancer** → échec.
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : vert** `npm run test:famille -- scene-ville`, `npm run typecheck`.
- [ ] **Step 5 : commit** `feat(ville): journées des habitants et visites dans la vie de la scène`.

### Task 12 : trajets de porte par personne (modèle)

**Files :** Modify `src/core/library/city/doors.ts`, `src/core/library/city/doorway.ts` (`passageDuration`),
`src/core/library/city/hall-lights.ts` ; Test `tests/core/library/city-doors.test.ts`,
`tests/core/library/city/hall-lights.test.ts`.

**Interfaces :**
- Consumes : `Schedule`, `Visit`, `Dwelling` (`doorX`, `floorIdx`, `climb`), `Door`, `endDoorOf`, `passageAt`.
- Produces :
  `export type Who = { dwelling: string; m: number } | { visitor: string }` ;
  `export type DoorEvent = { who: Who; d: Dwelling; kind: 'out' | 'in'; t: number; child: boolean; size: number }`
  (`t` : minute du passage de la porte, repère du jour de scène) ;
  `export function doorEvents(dwellings: readonly Dwelling[], today: ReadonlyMap<string, Schedule>, yesterday: ReadonlyMap<string, Schedule>, visits: ReadonlyMap<string, readonly Visit[]>, prevVisits: ReadonlyMap<string, readonly Visit[]>): DoorEvent[]`
  (membres : segments `depart` / `return` d'indice `m < members.length`, du jour pour t < 1440 et de la veille pour
  t ≥ 1440 → t − 1440 ; visiteurs : `arrive` / `leave` de toutes leurs visites ; logements sans porte : rien) ;
  `export type DoorTrip = { id: string; who: Who; kind: 'out' | 'in'; doorX: number; endDoorX: number | null; dir: 1 | -1; speed: number; scale: number; child: boolean; floorIdx: number; climb: number; at: number; shown: number; dur: number }`
  (`id` = `${clé de who}|${kind}|${t}` — stable avant et après minuit ; `at` : seconde de scène du seuil prévu ; `shown` :
  seconde de début du passage affiché ; `dur` : `passageDuration`) ;
  `export function doorTripsOf(events: readonly DoorEvent[], doors: readonly Door[], width: number, seed: number): DoorTrip[]`
  (`dir` tiré par (who, jour) : le retour revient du côté où l'on est parti ; vitesse `(18 + 8 r) × WALK_PACE` et échelle
  `0,95 + 0,15 r` stables par personne, enfant : `Member.size` ; un `d.doorX` absent de `doors` (lot hors du premier plan) :
  pas de trajet) ;
  `export const RESIDENT_CAP_PER_720 = 6` ; `export function staggerTrips(trips: readonly DoorTrip[], width: number, cap?: number): DoorTrip[]`
  (glouton par `at` : un départ est repoussé, un retour avancé, par pas de 5 s, jusqu'à tenir sous
  `round(6 × max(1, width / 720))` trajets en cours ; jamais supprimé) ;
  `export function tripAt(trip: DoorTrip, width: number, s: number): Passage | null` (`s` : seconde de scène).
  `doorway.ts` : `export function passageDuration(o: Parameters<typeof passageAt>[0]): number`.
- `hall-lights.ts` : `seedHallTimers(trips: readonly DoorTrip[], width: number, s: number)` ; la cage monte jusqu'à
  `trip.floorIdx` (`stairCountTo`, `climbRun(trip, floors, seuil, dir)`) ; retirer `returnHook`, `returnHome`,
  `returnFloor`, `passageFloors`, `hookKey`, `RETURN_WINDOW_MIN` et ce qui devient inutile.
  `doors.ts` : retirer `Trip`, `tripsFor`, `tripHappens`, `residentFlow`, `TRIP_CYCLE`, `RESIDENT_DOORS_PER_720`,
  `MAX_FALLBACK_PX` s'il ne sert plus (garder `endDoorOf`, utilisé par `shops/customers.ts`).

- [ ] **Step 1 : tests rouges** (`city-doors.test.ts`) :
  `un trajet par depart / return de membre d'un logement à porte, un par arrivée / départ de visiteur` ;
  `retour de nuit de la veille : même id que dans doorEvents de la veille, t − 1440` (Review Focus 3) ;
  `heure de pointe (8 h, mardi, graines 1-5, largeurs 720 et 1440) : ≤ 6 en cours par 720 px, aucun trajet perdu, retour
  jamais montré après at, |shown − début prévu| ≤ 900 s` (Review Focus 4) ;
  `trajet sortant : seuil à shown, fini à shown + dur ; entrant : seuil final à shown + dur ≤ at` ;
  `le retour vient du côté du départ` ; `jour away : aucun trajet du foyer entre leaves et returns` (Review Focus 2).
  `hall-lights.test.ts` : `cage allumée jusqu'à l'étage du logement du trajet` ; `minuterie amorcée d'après les seuils des
  120 dernières secondes de scène`.
- [ ] **Step 2 : lancer** → échec.
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : vert** `npx vitest run tests/core/library/city-doors.test.ts tests/core/library/city/hall-lights.test.ts`.
- [ ] **Step 5 : commit** `feat(ville): trajets de porte par habitant et visiteur, étalés sous le plafond mobile`.

### Task 13 : portes de la rue (calque)

**Files :** Modify `src/content/city-life.tsx` ; Test `tests/content/city-life.test.tsx`,
`tests/content/city-life-ghibli.test.tsx`, `tests/content/hall-lights.test.tsx`.

**Interfaces :**
- Consumes : `doorEvents`, `doorTripsOf`, `staggerTrips`, `tripAt`, `seedHallTimers`, `climbRun`, `SceneLife` (tâche 11).
- Rendu : trajets mémoïsés par (`life`, `doors`, `width`, `seed`) ; plus de boucle de 160 s, de verrou `TripLock`, de
  `residentFlow` ni de `hookPassage` / `exitPlanned` ; temps des trajets = `sceneSecondsAt(t)`. Nœuds montés seulement pour
  les trajets dont `[shown − 90 s, shown + dur + 30 s]` touche la minute affichée (rendu React de la minute, clés = `trip.id`) ;
  `tripWarmPoses` garde son avance de 12 s sur `shown`. Figure : `citizen={citizenSeed(clé de who)}`, `kind="child"` pour
  un enfant ; tenue provisoire `outfitFor('ordinary', …)` jusqu'à la tâche 15. Sans `life` (aperçus) : aucun habitant à la
  porte. Vue classique : même liste, `PersonSprite`.

- [ ] **Step 1 : tests rouges** : `à 8 h un mardi, les habitants à la porte sont des membres réels (data-who = dwelling/m)
  et leur nombre suit les départs du moment` ; `au plus 6 nœuds visibles par 720 px` ; `nœuds montés ≤ trajets de la
  fenêtre de 2 min + marge` ; `hall allumé au passage, cage jusqu'à l'étage du trajet` ; `mouvement réduit : rien ne bouge,
  aucune erreur`.
- [ ] **Step 2 : adapter** les tests qui utilisaient `residentFlow` / `tripsFor` / `tripHappens`.
- [ ] **Step 3 : lancer** `npm run test:famille -- scene-ville scene-pietons` → échec.
- [ ] **Step 4 : implémenter.**
- [ ] **Step 5 : vert**, `npm run typecheck`.
- [ ] **Step 6 : commit** `feat(ville): habitants et visiteurs à la porte selon leur journée`.

### Task 14 : tenue du jour (modèle)

**Files :** Create `src/core/library/city/day-outfit.ts` ; Modify `src/core/library/city/people.ts` (`Top` et `Bottom` +
`'pyjama'`), `src/core/library/figure/dress.ts` (`shapeOf` : haut `pyjama` → `long`, bas `pyjama` → `pants`) ; Test
`tests/core/library/city/day-outfit.test.ts`.

**Interfaces :**
- Consumes : `Dwelling`, `Member`, `Visitor`, `PersonDay` (`dressAt`, `undressAt`), `SceneDay` (`cold`), `Outfit`.
- Produces : `export type PersonRef = { kind: 'member'; d: Dwelling; m: number } | { kind: 'visitor'; v: Visitor }` ;
  `export type DayOutfit = { day: Outfit; pyjama: Outfit | null }` ;
  `export function dayOutfit(ref: PersonRef, day: SceneDay, workday: boolean): DayOutfit` (mémoïsée par (ref, iso)) ;
  `export function outfitAt(o: DayOutfit, pd: Pick<PersonDay, 'dressAt' | 'undressAt'> | null, minute: number): Outfit`
  (pyjama avant `dressAt` et à partir de `undressAt`, s'il en porte ; visiteur : toujours `day`).
- Règles : coiffure, couleur des cheveux et peau stables par personne (règles de sexe de l'actuel `windowOutfit`, même
  flux `hh.seed ^ hashString('window-member') ^ m`) ; haut, bas et couleurs tirés chaque jour dans une garde-robe de la
  personne (`shirt` / `pants` du membre + 2 couleurs tirées) ; froid : pas de `tee` ; cadre un jour travaillé : `suit` 50 %
  sinon `shirt` ; pyjama : couleurs pastel d'une liste `PYJAMAS`, même pyjama toute la semaine ; livreur : profil `worker`.

- [ ] **Step 1 : tests rouges** : `même personne, même jour → même tenue ; autre jour → tenue différente pour ≥ 70 %` ;
  `coiffure et peau identiques tous les jours` ; `jamais de jupe ni de robe pour un homme, jamais chauve pour une femme`
  (repris du test lot 1 de `windowOutfit`) ; `enfants : pyjama toujours ; adultes ≈ 80 % (± 8)` ;
  `outfitAt : pyjama avant dressAt et dès undressAt, tenue entre les deux` ; `shapeOf(pyjama) = haut long + pantalon`.
- [ ] **Step 2 : lancer** → échec.
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : vert**, `npm run typecheck` (les `Record<Top, …>` exhaustifs éventuels gagnent `pyjama`).
- [ ] **Step 5 : commit** `feat(ville): tenue du jour de chaque habitant, pyjama le matin et au coucher`.

### Task 15 : tenue partout (fenêtres et porte)

**Files :** Modify `src/content/window-life.tsx` (`windowOutfit` → `dayOutfit`, `FigM`), `src/content/city-life.tsx`
(tenue des trajets) ; Test `tests/content/window-life.test.tsx`, `tests/content/city-life-ghibli.test.tsx`.

**Interfaces :**
- Consumes : `dayOutfit`, `outfitAt`, `SceneLife.days` / `visits`, `DoorTrip.who`.
- Fenêtres : `FigM` gagne `pj: boolean` ; un membre a sa figure de jour `${d.id}/${m}` et, seulement s'il a une scène `act`
  avant `dressAt` ou après `undressAt` (jour ou soirée de la veille), une figure pyjama `${d.id}/${m}/pj` ; la boucle place
  l'acteur sur la figure qui correspond à l'heure de sa scène. Invités et nounou (`m ≥ n`) : tenue du visiteur de rang
  `m − n` parmi les visites `inside`. `windowOutfit` est supprimé (ou réduit à un appel de `dayOutfit` si d'autres calques
  l'importent).
- Porte : `outfitAt(dayOutfit(ref, …), pd, t)` à l'heure du passage (jamais en pyjama : `dressAt` < tout départ).

- [ ] **Step 1 : tests rouges** : `pantin de fenêtre d'un membre le matin (avant dressAt) en pyjama, le soir après
  undressAt aussi, en tenue entre les deux` ; `même tenue (palette) pour un membre à sa fenêtre l'après-midi et à la porte
  le même jour` ; `nounou : même tenue à la porte et à la fenêtre` (Review Focus 5) ; `aucune figure pyjama montée pour un
  membre sans scène en pyjama`.
- [ ] **Step 2 : lancer** `npm run test:famille -- scene-ville scene-pietons` → échec.
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : vert**, `npm run typecheck`, `npm run build`.
- [ ] **Step 5 : commit** `feat(ville): tenue du jour aux fenêtres et à la porte`.

### Task 16 : mesures, captures, téléphone (contrôleur)

- [ ] Banc node (`.superpowers/harness-journees/`, non commité si l'autre session l'utilise) : temps de
  `buildSceneLife` pour 1440 px, graines 1-3, avant (commit de `main`) / après ; cible : ≤ 60 ms sur le PC, rapporté.
- [ ] Captures montrées à l'utilisateur au fil de l'eau (vue rue et vue de la pièce, Ghibli) : mardi 8 h (départs
  échelonnés), 16 h 30 (nounou et enfants), 22 h 50 (retour de la serveuse), 3 h 30 (retour de boîte, chambre allumée),
  dimanche 7 h 50 (quelques lumières, pas toutes) ; une capture d'un pantin en pyjama à la fenêtre.
- [ ] Famille complète : `npm run test:famille -- scene-ville scene-pietons`, `npm run typecheck`, `npm run build`.
- [ ] PR (titre et description en français, se termine par `🤖 Generated with [Claude Code](https://claude.com/claude-code)`),
  fusion, `npm run preprod`.
- [ ] S26 (APK pré-prod debuggable, CDP de la WebView, méthode de la mémoire « Mesure sur téléphone ») : temps du calcul du jour au
  changement de date et images par seconde de la vue rue et de la vue de la pièce, avant / après ; rien ne doit ralentir de
  plus de 10 % ; sinon, corriger avant toute promotion. Production seulement sur ordre explicite.
