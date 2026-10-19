# Ville Ghibli — la vie au-dessus de la rue — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** donner à chaque logement des immeubles du premier plan un foyer, un emploi du temps retiré chaque jour (aléatoire mais logique), des lumières qui suivent la présence par pièce, des pantins derrière les fenêtres, des volets / persiennes / rideaux / battants vivants, des réactions aux événements de la rue, et des toits vivants (chat, pigeons, fumées, couvreur), sans toucher au fond.

**Architecture :** tout l'état est une fonction pure de (graine, date, minute de scène) : `city/households.ts` (foyers fixes) → `city/scene-day.ts` (jour de scène + tirage du jour + spectacle de feux) → `city/schedules.ts` (segments, une fois par jour et par logement) → `city/home-state.ts` (état à la minute, borne de 8 animées). Le rendu ajoute deux calques SVG à nœuds constants au-dessus des tranches : `window-life.tsx` (volets, rideaux, battants, pantins, accessoires) et `roof-life-layer.tsx` (chat, pigeons, fumées, couvreur) ; `ghibli-windows.tsx` et la vue classique lisent les lumières dans `homeState`. Les dessins sont portés de la maquette par Fable dans des fichiers d'art aux signatures fixées par ce plan.

**Tech Stack :** TypeScript, React 19 (SVG), canvas 2D (tranches), vitest (`node` ; `// @vitest-environment jsdom` pour le DOM, `createRoot` + `act`, pas de @testing-library), WXT. Worktree `C:\Users\maxim\Downloads\Wikimasters-facades`, branche `feat/ville-vie-etages`.

**Spec :** `docs/superpowers/specs/2026-10-19-ville-vie-etages-design.md` (à lire en entier avant chaque tâche ; elle fait autorité). **Source des valeurs et du dessin :** `docs/superpowers/maquettes/vie-etages/notes.md` (catalogue, horaires, borne, couleurs) et `src/*.js` (`02-layout.js` foyers, `04-emplois.js` `buildSchedule`, `05-etat.js` `homeState` / `streetEvents` / `cullAnimated`, `06-pantins.js` `POSE` / `choreo`, `07a-facade.js` volets / battant / accessoires, `07b-balcon-toit.js` balcon / chat / pigeons / fumées / couvreur, `08-scenes.js` cage et ordre de peinture). Les PNG de `captures/` sont la référence visuelle validée.

## Global Constraints

- **Fond intact** (condition de validation de l'utilisateur) : `paint/hill-painter.ts`, le mur du fond, `farWindows` et leur allumage (`windowLit` sur `win.u`) ne changent pas ; tirage `citySkyline` et `facadeLayout` inchangés (fixture `tests/core/library/fixtures/city-skyline-empreinte.json` verte à chaque tâche).
- **Pureté :** l'état d'un logement à la minute `m` est une fonction de (graine de la ville, date ISO, `m`, météo du jour) ; aucun état caché, aucun `Math.random`, aucun `Date.now()` dans `city/*`. Seule exception admise : la réaction à la sirène et le retour accroché à un passage réel (spec §5.1).
- **Imprévisible mais logique :** tirage du jour `mulberry32(seed ^ hashString(iso) ^ dwelling.key ^ hashString('day'))` ; les horaires de `notes.md` §Emploi du temps sont des **tendances** autour desquelles on tire (amplitudes de la tâche 2), jamais des rendez-vous fixes.
- **Unités :** toutes les heures des segments sont en **minutes depuis minuit** du jour de scène, de 0 à 1800 (après minuit = 1440 + x) ; la maquette est en heures (`MIN = 1/60`) : convertir.
- Borne `MAX_ANIM = 8` chorégraphies animées à la fois ; poses fixes (table, télé, penché, balcon immobile) non bornées ; priorités : événement 5 > traversée / rideaux 4 > volets, arrosage, tapis, fumeur 3 > penché / balcon 2 > danse 2 > cuisine 1, puis proximité du centre de l'écran. Une scène écartée garde lumière et volets.
- **Rien n'apparaît sur place :** chaque scène intérieure commence par une entrée et finit par une sortie en marchant (11 s, ou au plus 30 % d'une scène courte) ; balcon par la porte-fenêtre ; chat par la tabatière ; pigeons en vol.
- Pantins : moteur `src/core/library/figure/` (aucune 2ᵉ cinématique), **toujours le pantin 2D** derrière les vitres (jamais la 3D), silhouette `#1A1422` la nuit, taille `0,66 × hauteur d'étage` (enfant × 0,62 / 0,66, retraité × 0,94 / 0,66 relatifs comme la maquette).
- Couleurs de `notes.md` §Couleurs ; langage cellulo (`paint/cel.ts`, trait `#2A1A18`).
- **Perfs Android :** calques à nœuds constants pour la journée (montés au changement de jour ou de largeur seulement), la boucle n'écrit un attribut que s'il change, emplois du temps calculés une fois par (jour, météo humide) ; pas de `clip-path` CSS (leçon du chantier 1 : `<clipPath>` SVG partagé par logement) ; pas de SMIL ; jamais de miroir d'une image cuite. Régression ≤ 15 % au banc (CPU ×4, 1080 px) contre `main`.
- Pas de lumière dessinée de jour : une pièce n'est montrée allumée que si `nightness(daylight) > 0` (comportement actuel de `ghibli-windows.tsx`, `dark ≤ 0,2` de la maquette).
- Choix validés (spec §5.3) : persiennes repliables (haussmann), volets battants (faubourg), minuterie de cage 3 min (`HALL_TIMER_S` reste 120 s pour le hall ; la cage d'un retour reste allumée 180 s), salons éteints pendant les feux, chat seulement sur les toits `mansard` avec une lucarne `tabatiere`, couvreur mardi et jeudi, fête de la coloc le samedi seulement.
- `PAINT_VERSION` (`paint/city-painter.ts`) 8 → 9 quand les volets et rideaux quittent les tranches (tâche 8).
- Modèles : **Fable** uniquement pour dessiner et chorégraphier (tâches 5, 6, 7 : port de la maquette, signatures de ce plan inchangées) ; **Opus** pour la logique, les calques, les branchements et les tests DOM ; **Sonnet** pour les re-relectures. Commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (tâches Fable : `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`).
- Commentaires en français, densité et idiome du code voisin ; `describe/it` en français ; nouveaux tests dans la famille `scene-ville` de `tests/familles.ts` (ajouter les motifs `city/households.*`, `city/scene-day.*`, `city/schedules.*`, `city/home-state.*`, `city/fireworks-show.*`, `city/roof-life.*`, `window-life*`, `roof-life*`) ; commande `npm run test:famille -- scene-ville` (+ `scene-evenements`, `scene-pietons` quand la tâche les touche).
- Une seule session lance des tests à la fois ; `git stash` interdit ; avant chaque commit `git branch --show-current` doit afficher `feat/ville-vie-etages`. `node_modules` et `.wxt/` sont installés dans le worktree ; vitest avale `console.log` (`--silent=false`).
- Échecs préexistants admis (aussi sur `main`) : `install-ghibli` « échelle » et `city-life-ghibli` « ombres portées ».
- Pas de fiche WikiHow ; pas de mesure téléphone par PR. Chaque visuel produit (planche, capture) est envoyé à l'utilisateur au fil de l'eau par le contrôleur.

## Review Focus

1. **Passage de minuit et lendemain :** à 0 h 30 on lit les segments de la veille (soirée qui déborde) ET ceux du jour (aucun) sans saut : un logement allumé à 23 h 59 le reste à 0 h 01 si sa soirée continue. → test tâche 4 (`homeState` lit `veille.segments` décalés de −1440).
2. **Pluie qui commence l'après-midi :** l'emploi du temps est recalculé (clé humide) ; aucun pantin de balcon ne disparaît sur place — une scène extérieure en cours se termine par sa sortie normale avant d'être retirée. → test tâche 9 (calque : bascule de `wet`, le pantin en cours finit sa scène).
3. **Fenêtre de la pièce élargie à 1440 px / changement de jour à minuit :** les nœuds sont remontés une seule fois, aucune création par minute. → test tâche 9.
4. **Mouvement réduit :** pantins en pose fixe (pas de marche), volets à leur valeur, aucune transition, pas d'animation du chat ni des pigeons en vol. → tests tâches 9 et 12.
5. **Jour sans aucun logement (largeur minuscule, uniquement des socles) ou immeuble sans porte :** aucun plantage ; retours sans porte = logement qui s'allume seul. → tests tâches 1 et 10.

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/core/library/city/households.ts` (nouveau) | `Household`, `Dwelling`, `householdFor`, `cityDwellings` |
| `src/core/library/city/scene-day.ts` (nouveau) | `SceneDay`, `sceneDay`, `DayDraw`, `dayDraw`, table `SUNS` |
| `src/core/library/city/fireworks-show.ts` (nouveau) | `FireworksShow`, `fireworksShow`, `showBursts` |
| `src/core/library/city/schedules.ts` (nouveau) | `Segment`, `Schedule`, `buildSchedule` |
| `src/core/library/city/home-state.ts` (nouveau) | `HomeState`, `Actor`, `homeState`, `trackValue`, `cullAnimated`, `MAX_ANIM`, `litShare` |
| `src/core/library/city/window-choreo.ts` (nouveau, Fable) | `windowPose` : chorégraphie → pose du moteur, décalage, accessoires |
| `src/core/library/figure/skeleton.ts` (mod., Fable) | nouvelles `ArmPose` des fenêtres |
| `src/content/window-life-art.tsx` (nouveau, Fable) | volets, persiennes, battant, rideaux, jardinière de saison, sapin, accessoires intérieurs et tenus |
| `src/content/roof-life-art.tsx` (nouveau, Fable) | chat, pigeon, fumée, couvreur |
| `src/core/library/city/roof-life.ts` (nouveau) | `catState`, `pigeonsAt`, `smokeAt`, `rooferAt` |
| `src/content/window-life.tsx` (nouveau) | calque de la vie aux fenêtres + boucle |
| `src/content/roof-life-layer.tsx` (nouveau) | calque des toits + boucle |
| `src/content/ghibli-windows.tsx`, `ghibli-window-art.tsx`, `scene-city.tsx` (mod.) | lumières lues dans `homeState`, teinte `cool`, rideaux dynamiques |
| `src/core/library/paint/facade-painter.ts`, `city-painter.ts` (mod.) | volets et rideaux retirés des tranches, `PAINT_VERSION` 9 |
| `src/core/library/city/hall-lights.ts`, `src/content/stair-lights.tsx`, `src/content/city-life.tsx` (mod.) | retour / départ accrochés aux passages, cage jusqu'à l'étage du foyer, silhouette qui monte, réactions, spectacle de feux, montage des calques |
| `src/content/use-scene-life.ts` (nouveau) | hook : logements, emplois du temps du jour (et de la veille), minute de scène fractionnaire |

---

### Task 1 : Foyers par logement (Opus)

**Files:**
- Create: `src/core/library/city/households.ts`
- Test: `tests/core/library/city/households.test.ts`
- Modify: `tests/familles.ts` (motifs de la famille `scene-ville`, voir Global Constraints)

**Interfaces:**
- Consumes: `Facade` (`city/facades.ts:19`), `Home`, `HomeTone`, `FacadeLayout` (`city/facade-layout.ts`), `mulberry32`, `hashString` (`scene-world.ts`).
- Produces:
  ```ts
  export type HouseholdType = 'couple' | 'famille' | 'retraite' | 'etudiant' | 'coloc' | 'solo';
  export type Room = 'cuisine' | 'chambre' | 'salon';
  export type Member = { kid: boolean; size: number; shirt: string; pants: string; skin: string };
  export type Household = { type: HouseholdType; members: Member[]; smoker: boolean; sapin: boolean; late: boolean; seed: number };
  export type Dwelling = {
    id: string;            // `${facade}:${home}` (même clé que `data-home` du calque des fenêtres)
    facade: number; home: number; key: number;   // index dans `facades`, index dans `facade.homes`, `Home.key`
    floorIdx: number;      // 0 = premier étage au-dessus du rez-de-chaussée (socle : 0, lucarnes : levels.length)
    bays: number[]; rooms: Room[]; roomOfWindow: Map<number, Room>;   // clé : `FacadeWindow.key`
    balcony: boolean;      // le salon donne sur un balcon filant ou un balconnet de l'étage
    shutters: 'persienne' | 'battant' | null;    // haussmann → persienne ; faubourg avec `layout.shutters` → battant ; lucarne → null
    doorX: number | null;  // `layout.doorCx` de l'immeuble (socle des jumeaux : celui de la 1re tour)
    climb: number;         // minutes de montée : 0,35 + 0,22 × (floorIdx + 1)
    hh: Household;
  };
  export function householdFor(home: Home, seed: number): Household;
  export function cityDwellings(facades: readonly Facade[], seed: number): Dwelling[];
  ```

- [ ] **Step 1 : tests qui échouent** — `describe('foyers par logement')` :
  - `it('même graine → mêmes foyers ; autre graine → tirage différent')` : `cityDwellings(cityFacades(...), 7)` deux fois égal en profondeur ; graine 8 diffère sur au moins un `hh.type`.
  - `it('proportions de la maquette sur 5 graines')` : sur ≥ 300 logements, part de chaque type à ± 6 points de couple 25 %, famille 20 %, retraité 18 %, étudiant 12 %, coloc 10 %, solo 15 %.
  - `it('pièces : 2 travées → cuisine + salon ; 3 et plus → cuisine, chambre, salon ; lucarne → une pièce salon')`.
  - `it('famille : au moins un enfant (kid, size 0,62/0,66) ; retraité : size 0,94/0,66 ; coloc : 2 à 3 membres')`.
  - `it('étudiant et coloc n'ont jamais de volets battants à fermer (shutters ignorés par l'emploi du temps) ; lucarne : shutters null')`.
  - `it('largeur où seuls des socles existent : aucun plantage, tableau éventuellement vide')`.
- [ ] **Step 2 :** `npm run test:famille -- scene-ville` → FAIL (module absent).
- [ ] **Step 3 :** implémenter en portant `householdFor` / `makeHousehold` de `src/02-layout.js` ; tirage `mulberry32(seed ^ hashString('household') ^ home.key)` ; couleurs des membres dans les listes de `notes.md` §Couleurs ; `sapin` 55 %, `smoker` 40 % des couples / solos, `late` 50 % des étudiants. Ne pas modifier `facadeLayout`.
- [ ] **Step 4 :** `npm run test:famille -- scene-ville` → PASS (hors échecs préexistants).
- [ ] **Step 5 :** commit `feat(ville): foyers fixes par logement`.

### Task 2 : Jour de scène, tirage du jour et spectacle de feux (Opus)

**Files:**
- Create: `src/core/library/city/scene-day.ts`, `src/core/library/city/fireworks-show.ts`
- Test: `tests/core/library/city/scene-day.test.ts`, `tests/core/library/city/fireworks-show.test.ts`

**Interfaces:**
- Consumes: `DayContext`, `DayKind`, `FestivityId`, `YMD`, `isoDate` (`city/calendar.ts`) ; `Dwelling` (tâche 1).
- Produces:
  ```ts
  export type FireworksShow = { start: number; end: number; bursts: { at: number; x: number; y: number; variant: number }[] };  // minutes de scène (1440+ après minuit)
  export function fireworksShow(seed: number, date: YMD): FireworksShow | null;
  export function showBursts(show: FireworksShow, from: number, to: number): FireworksShow['bursts'];

  export type SceneDay = { iso: string; weekday: number; weekend: boolean; kind: DayKind; schoolHoliday: boolean; month: number;
    sunrise: number; sunset: number; wet: boolean; cold: boolean; december: boolean; fests: FestivityId[]; show: FireworksShow | null;
    moving: boolean };   // déménagement de commerce ce jour-là (8 h-10 h), renseigné par l'appelant
  export function sceneDay(day: DayContext, weather: { precip: number; snow: boolean; storm: boolean }, seed: number, moving?: boolean): SceneDay;

  export type Presence = 'normal' | 'away' | 'sick' | 'guests' | 'late';
  export type OptionalScene = 'water' | 'rug' | 'look' | 'smoke' | 'party' | 'tv' | 'read' | 'kidWindow';
  export type DayDraw = { presence: Presence; wake: number; back: number; evening: number; bed: number; optional: Record<OptionalScene, boolean>; offOrder: Room[]; rng: number };
  export function dayDraw(d: Dwelling, day: SceneDay, seed: number): DayDraw;
  ```
- Valeurs décidées (spec §5.1, choix de Claude, à garder) :
  - `SUNS` : lever / coucher de Paris du 15 de chaque mois, en minutes (`03-temps.js`) ; `sunrise` / `sunset` du mois.
  - `wet = precip ≥ 0,3 || storm` ; `cold = month ∈ {11,12,1,2,3}` ; `schoolHoliday = kind === 'holiday'`.
  - Présence : `away` 3 % (familles 30 % et autres 12 % en vacances scolaires, ×1,5 en juillet-août), sinon `sick` 3 % (reste à la maison, pas de départ), `guests` 15 % le vendredi soir et le samedi soir et 6 % ailleurs (1-2 invités au dîner, extinction + 45 à 90 min), `late` 12 % en semaine (retour + 60 à 150 min).
  - Décalages du jour (minutes, uniformes) : `wake` ±25 en semaine / ±50 le week-end ; `back` ±45 ; `evening` (dîner, télé) ±40 ; `bed` ±35.
  - Scènes facultatives : `water` 70 % retraité, `rug` 35 % retraité, `look` 55 %, `smoke` 85 % des fumeurs, `party` 65 % des colocs le samedi seulement, `tv` 75 % sinon `read` (lampe chaude au salon), `kidWindow` 60 % des familles ; `wet` coupe `water`, `rug`, et les `look` au balcon.
  - `offOrder` : permutation tirée des pièces du logement (ordre des extinctions).
  - Feux : 14 juillet, début uniforme 1335-1365 (22 h 15-22 h 45), durée 18-30 min ; 1ᵉʳ janvier, début 1438-1445 (pris sur la nuit du 31 décembre, donc `fireworksShow(seed, {31 déc})` renvoie un spectacle à 1438-1445 + 8-15 min), autrement `null`. Salves : intervalle tiré 6-40 s par tirage exponentiel, bouquet final des 2 dernières minutes à 1-3 s ; `x` ∈ [0,1], `y` ∈ [0,15 ; 0,45] fraction de hauteur du ciel.
- [ ] **Step 1 : tests qui échouent** :
  - `it('deux dates différentes → tirages différents pour un même logement')` : sur 20 logements, `dayDraw` du 13 et du 14 octobre 2026 diffèrent (au moins `wake` ou `presence` ou `optional`) pour ≥ 18.
  - `it('même date → même tirage')`.
  - `it('vacances scolaires : plus de familles absentes')` : part `away` des familles sur 200 tirages > 20 % un jour `holiday`, < 8 % un jour `school`.
  - `it('pluie : ni arrosage ni tapis')`.
  - `it('fête de la coloc seulement le samedi')`.
  - `it('feux du 14 juillet : début entre 22 h 15 et 22 h 45, durée 18-30 min, deux graines → débuts différents ; aucun spectacle le 13 juillet')`.
  - `it('Nouvel An : spectacle sur la nuit du 31 décembre autour de minuit')`.
  - `it('salves triées, toutes dans [start, end], bouquet final plus dense')`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter (tirages `mulberry32` de la Global Constraint ; spectacle `mulberry32(seed ^ hashString('show') ^ hashString(iso))`). **Step 4 :** PASS.
- [ ] **Step 5 :** commit `feat(ville): jour de scène, tirage du jour et spectacle de feux`.

### Task 3 : Emplois du temps (Opus)

**Files:**
- Create: `src/core/library/city/schedules.ts`
- Test: `tests/core/library/city/schedules.test.ts`

**Interfaces:**
- Consumes: `Dwelling`, `Room` (tâche 1) ; `SceneDay`, `DayDraw` (tâche 2).
- Produces:
  ```ts
  export type LightTone = 'warm' | 'cream' | 'orange' | 'tv' | 'cool';
  export type Where = 'in' | 'lean' | 'balcony';
  export type Choreo = 'cook' | 'openShutters' | 'closeShutters' | 'armsUp' | 'drawCurtains' | 'table' | 'tv' | 'read' | 'lean' | 'leanRail'
    | 'water' | 'shake' | 'smoke' | 'cross' | 'stand' | 'dance';
  export type Segment =
    | { k: 'lit'; room: Room; t0: number; t1: number; tone: LightTone }
    | { k: 'shut' | 'curt' | 'win'; room: Room; t: number; to: number; dur: number }
    | { k: 'act'; t0: number; t1: number; room: Room; where: Where; choreo: Choreo; m: number; seat?: number; party?: number; desk?: boolean; slot?: number; reverse?: boolean; event?: boolean }
    | { k: 'return' | 'depart'; t: number; m: number }
    | { k: 'sapin' | 'party' | 'dim'; t0: number; t1: number };
  export type Schedule = { dwelling: string; segments: Segment[]; shutUser: boolean; maxActors: number };
  export function buildSchedule(d: Dwelling, day: SceneDay, draw: DayDraw): Schedule;
  ```
- Règles : porter `buildSchedule` de `04-emplois.js` (tous les types, mêmes chorégraphies composées `openShutters` / `quickShut` / `closeShutters` / `drawCurt` / `openCurt` / `meal` / `tv` / `smoke` / `look` / `arrive` / `leave`) en minutes, en remplaçant `jitter` / `jitter2` par `draw.wake` / `draw.back` / `draw.evening` / `draw.bed` et en n'émettant une scène facultative que si `draw.optional[x]` ; `away` → aucun segment (volets fermés toute la journée pour qui les ferme) ; `sick` → pas de `depart`, cuisine et salon allumés aux repas, `look` l'après-midi ; `guests` → membres invités au dîner (`seat` supplémentaires) et coucher décalé ; `read` → `lit` salon `warm` + `act` `read` au lieu de `tv`. Fermeture des volets du retraité à `max(sunset + 20, 1086)` ; la nuit, `shutUser` vrai pour couple / famille / retraité / solo. Réactions aux feux : si `day.show`, les segments `lean` / `leanRail` (`event: true`) et `dim` commencent à `show.start − 2` (ouverture des fenêtres) et finissent à `show.end + 1` ; famille et retraité ne réagissent que s'ils sont encore debout à `show.start`. Fête de la musique (`fests` contient `'music'`), déménagement (`day.moving`), sapin (`day.december && hh.sapin`) comme la maquette. `maxActors` = nombre maximal de segments `act` simultanés du jour.
- [ ] **Step 1 : tests qui échouent** :
  - `it('chaque scène commence et finit dans les bornes du jour (0-1800) et dure > 0')`.
  - `it('un membre ne joue jamais deux chorégraphies en même temps')` (sur 200 logements × 7 jours).
  - `it('un membre absent (entre depart et return) ne joue aucune scène')`.
  - `it('deux jours différents → journées différentes pour un même logement (heures et scènes)')` : signature `segments.map(k+round(t))` différente pour ≥ 90 % des logements entre lundi 12 et mardi 13 octobre 2026.
  - `it('week-end : réveil plus tard en moyenne (≥ 60 min)')`.
  - `it('famille : parfois une seule pièce allumée le soir (télé au salon)')` : sur 100 familles à 21 h 30, ≥ 20 % n'ont qu'un segment `lit` actif.
  - `it('absent : aucun lit ni act ; malade : aucun depart')`.
  - `it('14 juillet : penchés et dim autour du spectacle tiré, pas à heure fixe')` : deux graines → `dim.t0` différents, chacun = `show.start − 1`.
  - `it('étudiant et coloc : aucun segment shut')`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS.
- [ ] **Step 5 :** commit `feat(ville): emplois du temps retirés chaque jour`.

### Task 4 : État d'un logement, borne et calibrage (Opus)

**Files:**
- Create: `src/core/library/city/home-state.ts`
- Test: `tests/core/library/city/home-state.test.ts`

**Interfaces:**
- Consumes: `Schedule`, `Segment`, `Choreo`, `Where`, `LightTone` (tâche 3) ; `Dwelling`, `Room` (tâche 1) ; `windowsLitFraction` (`city/window-lights.ts`).
- Produces:
  ```ts
  export type Actor = { dwelling: string; room: Room; where: Where; m: number; choreo: Choreo; p: number; t: number; seat: number; party: number; desk: boolean; slot: number; reverse: boolean; animated: boolean; prio: number; culled: boolean };
  export type HomeState = { lit: Partial<Record<Room, boolean>>; tone: Partial<Record<Room, LightTone>>; shut: Partial<Record<Room, number>>; curt: Partial<Record<Room, number>>; win: Partial<Record<Room, number>>; actors: Actor[]; sapin: boolean; party: boolean; dim: boolean };
  export const MAX_ANIM = 8;
  export function trackValue(evts: readonly { t: number; to: number; dur: number }[], m: number, init: number): number;
  export function homeState(d: Dwelling, today: Schedule, yesterday: Schedule | null, m: number): HomeState;
  export function cullAnimated(items: readonly { st: HomeState; x: number }[], center: number): { animated: number; shown: number };
  export function litShare(items: readonly { d: Dwelling; today: Schedule; yesterday: Schedule | null }[], m: number): number;  // part des fenêtres de logement allumées
  ```
- Règles : porter `trackValue`, `homeState`, `ANIMATED`, `PRIO`, `cullAnimated` de `05-etat.js` ; `p` = avancement dans la scène (0-1), `t` = minutes écoulées depuis son début ; un segment de la veille compte à `m + 1440` ; `dim` éteint toutes les pièces sauf la cuisine ; `event: true` donne la priorité 5 ; `cullAnimated` marque `culled` sans toucher à `lit` / `shut` / `curt` / `win`.
- [ ] **Step 1 : tests qui échouent** :
  - `it('même (logement, minute) → même état')`.
  - `it('minuit : une soirée de la veille qui déborde reste allumée à 0 h 01')` (Review Focus 1).
  - `it('borne : jamais plus de 8 animés non écartés ; une scène écartée garde sa lumière et ses volets')`.
  - `it('priorité : un retour (cross) passe avant la cuisine ; à égalité, le plus proche du centre')`.
  - `it('part allumée proche de la courbe horaire')` : sur 5 graines, un mardi d'octobre, `litShare` à 7 h, 8 h, 20 h, 21 h, 23 h, 1 h, 3 h à ± 0,12 de `windowsLitFraction` (mêmes heures, jour `school`).
  - `it('volets : valeur continue de la veille à 0 h')`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter ; ajuster les tendances de la tâche 3 si le calibrage l'exige (noter l'écart dans le commit). **Step 4 :** PASS.
- [ ] **Step 5 :** commit `feat(ville): état d'un logement à la minute et borne de 8 animées`.

### Task 5 : Poses et chorégraphies des pantins de fenêtre (Fable)

**Files:**
- Modify: `src/core/library/figure/skeleton.ts` (union `ArmPose`, `ARM_POSES`, `TARGETS`)
- Create: `src/core/library/city/window-choreo.ts`
- Test: `tests/core/library/city/window-choreo.test.ts`
- Capture : `.superpowers/captures-vie/planche-poses.png` (banc ou page de test, ×4, silhouette et couleur)

**Interfaces:**
- Consumes: `Actor` (tâche 4), `Dwelling` (tâche 1), `Gait`, `ArmPose`, `YAW_FRONT`, `YAW_BACK`, `facingYaw` (`figure/`).
- Produces:
  ```ts
  export type HandProp = 'cigarette' | 'watering-can' | 'rug' | 'spoon' | 'book' | 'cup';
  export type WindowPose = { yaw: number; gait: Gait; phase: number; head: number; arms: ArmPose; lean: number;   // même forme que PoseIn
    dx: number;            // décalage horizontal dans la pièce, fraction de largeur de fenêtre (-0,5 … 1,5, marche d'une fenêtre à l'autre)
    room: Room; where: Where; size: number; props: HandProp[]; still: boolean };
  export function windowPose(a: Actor, d: Dwelling): WindowPose | null;   // null : hors champ (entré dans la pièce voisine)
  ```
- Nouvelles `ArmPose` (cibles portées de `POSE` de `06-pantins.js` dans le repère des `TARGETS`) : `'shutters'` (armsUp), `'curtain'`, `'sill'` (lean, avant-bras sur l'appui), `'rail'` (leanRail), `'smoke-up'`, `'smoke-down'`, `'water'`, `'shake-1'`, `'shake-2'`, `'cook-1'`, `'cook-2'`, `'table'`, `'tv'`, `'dance-1'`, `'dance-2'`. Allures : debout `stand`, assis `seated`, marche `walk` (phase `phaseIndexOf`), penché `lean` en degrés du moteur.
- Règles : porter `choreo` et `balconyInOut` de `06-pantins.js` (entrée / sortie 11 s, traversée du plan de la vitre pour le balcon, alternance des variantes `-1` / `-2` toutes les 0,6 s pour les gestes animés, cycle de 11 s du fumeur) ; en mouvement réduit l'appelant n'utilise que `still: true` (pose clé centrale, pas de marche).
- [ ] **Step 1 : tests qui échouent** : `it('toute chorégraphie commence et finit par une marche ou hors champ')` (p = 0,01 et 0,99 → `gait: 'walk'` ou `null`) ; `it('balcon : on traverse la vitre (where in → balcony) en marchant')` ; `it('les nouvelles ArmPose sont dans ARM_POSES et ont des cibles')` ; `it('pose déterministe pour un même acteur')`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS + `npm run test:famille -- scene-pietons scene-commerces` (le moteur est partagé : rien ne bouge pour les pantins de la rue).
- [ ] **Step 5 :** planche des poses (chaque chorégraphie à 3 instants, silhouette `#1A1422` et couleur) enregistrée dans `.superpowers/captures-vie/` ; commit `feat(ville): poses et chorégraphies des pantins de fenêtre`.

### Task 6 : Dessins de la façade vivante (Fable)

**Files:**
- Create: `src/content/window-life-art.tsx`
- Test: `tests/content/window-life-art.test.tsx`

**Interfaces:**
- Consumes: `FacadeWindow`, `Level` (`city/facade-layout.ts`), `LightTone` (tâche 3), `HandProp` (tâche 5), `paint/cel.ts` (couleurs, `INK`).
- Produces (composants SVG purs, nœuds constants : seuls `transform`, `opacity`, `d` d'un chemin précalculé ou attributs `data-*` changent avec l'état) :
  ```ts
  export function Shutters(p: { win: FacadeWindow; kind: 'persienne' | 'battant'; color: string; open: number; litBehind: boolean }): ReactElement;  // open 0 fermé … 1 replié
  export function Sash(p: { win: FacadeWindow; open: number; night: boolean }): ReactElement;            // battant gauche
  export function Curtains(p: { win: FacadeWindow; style: 'side' | 'voile'; color: string; drawn: number; lit: boolean; wall: string }): ReactElement;
  export function FlowerBox(p: { win: FacadeWindow; month: number; seed: number }): ReactElement;         // jardinière de saison
  export function Sapin(p: { win: FacadeWindow; night: boolean; blink: number }): ReactElement;
  export function InteriorProp(p: { win: FacadeWindow; kind: 'table' | 'tv' | 'stove' | 'desk'; tone: LightTone; flicker: number }): ReactElement;
  export function HeldProp(p: { kind: HandProp; at: readonly [number, number]; phase: number; night: boolean }): ReactElement;  // braise + volute, filet d'eau, tapis ondulant + poussière
  export const shutterTransform: (open: number) => string;   // pour la boucle : écrit sans re-rendu React
  ```
- Règles : porter `paintShutters`, `paintSash`, `paintFlowerBox`, `paintSapin`, `paintInteriorProp`, `paintHandProps` de `07a-facade.js` en SVG ; couleurs de `notes.md` (persiennes `#C4CCC8 #B8C0B4 #CCC4AC`, lames éclairées `rgba(255,216,106,0.7)`, fleurs par saison, sapin et guirlande) ; reprendre le dessin des rideaux de `ghibli-window-art.tsx` (`curtainWidth`, `nightCurtain`) en le rendant paramétrable par `drawn`.
- [ ] **Step 1 : tests DOM qui échouent** : `it('Shutters : même nombre de nœuds pour open 0, 0,5 et 1')` ; `it('Curtains : drawn ne change que transform / opacity')` ; `it('FlowerBox : couleurs de la saison du mois')`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS.
- [ ] **Step 5 :** planche (persienne / volet à 0 / 0,5 / 1 de jour et de nuit éclairé, rideaux, jardinières des 4 saisons, sapin, accessoires) dans `.superpowers/captures-vie/` ; commit `feat(ville): dessins de la façade vivante`.

### Task 7 : Dessins des toits vivants (Fable)

**Files:**
- Create: `src/content/roof-life-art.tsx`
- Test: `tests/content/roof-life-art.test.tsx`

**Interfaces:**
- Produces :
  ```ts
  export function Cat(p: { pose: 'emerge' | 'walk' | 'sit'; phase: number; night: boolean; dir: 1 | -1 }): ReactElement;   // origine aux pattes ; yeux #C8FF8A la nuit
  export function Pigeon(p: { pose: 'perch' | 'peck' | 'fly'; phase: number; dir: 1 | -1 }): ReactElement;
  export function Smoke(p: { phase: number; night: boolean; wind: number }): ReactElement;   // volutes rgba(235,235,242,a) / nuit rgba(200,205,225,a)
  export function Roofer(p: { phase: number; pose: 'kneel' | 'walk'; dir: 1 | -1 }): ReactElement;   // à genoux sur le zinc, marteau
  ```
- Règles : porter `paintCat`, `flockPaint` / `paintPigeon`, `paintSmoke`, `paintRoofer` de `07b-balcon-toit.js` ; `dir = -1` se dessine par un tracé propre au sens (jamais de miroir d'une image cuite ; un `scale(-1 1)` d'un tracé vectoriel non cuit est admis) ; nombre de nœuds constant par pose.
- [ ] **Step 1 :** tests DOM (nœuds constants par composant quel que soit `phase`). **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS.
- [ ] **Step 5 :** planche dans `.superpowers/captures-vie/` ; commit `feat(ville): dessins des toits vivants`.

### Task 8 : Lumières par présence, volets et rideaux sortis des tranches (Opus)

**Files:**
- Create: `src/content/use-scene-life.ts`
- Modify: `src/content/ghibli-windows.tsx`, `src/content/ghibli-window-art.tsx`, `src/content/scene-city.tsx`, `src/core/library/paint/facade-painter.ts`, `src/core/library/paint/city-painter.ts` (`PAINT_VERSION` 9), `src/core/library/city/facade-layout.ts` (`HomeTone` + `'cool'` si le type est partagé ; sinon conversion dans le calque)
- Test: `tests/content/ghibli-windows.test.tsx` (mod.), `tests/content/use-scene-life.test.tsx`

**Interfaces:**
- Consumes: tâches 1 à 4.
- Produces :
  ```ts
  export type SceneLife = { dwellings: Dwelling[]; today: Map<string, Schedule>; yesterday: Map<string, Schedule>; day: SceneDay; byFacadeHome: Map<string, Dwelling> };
  export function useSceneLife(facades: readonly Facade[], city: CityContext | undefined, seed: number, moving: boolean): SceneLife | null;  // null sans contexte de ville (aperçus) → ancien allumage
  export function sceneMinute(clock: { m: number; base: number } | null, minutes: number, t: number): { clock: { m: number; base: number }; minutes: number };  // = gullMinutes, réexporté
  ```
- Règles : `useSceneLife` mémorise par (`facades`, `seed`, `iso`, `wet`, `moving`) ; veille = même calcul pour `addDays(date, -1)`. `GhibliWindows` reçoit `life` : une fenêtre de logement est allumée si `homeState(...).lit[roomOfWindow]` et `nightness > 0` ; teinte `tone` (`cool` → `#C8DCFF`) ; `roomLit` / `roomTone` ne servent plus qu'en l'absence de `life` (ne pas les supprimer : aperçus et tests). Vue classique (`scene-city.tsx` l. 110-120) : même source. Rideaux et volets : retirés de `paintDayWindow` (`facade-painter.ts` l. 125-160) et de `NightGlass` / `LitWindow` (ils passent dans le calque de la tâche 9) ; l'embrasure reste peinte. Le calque recalcule l'état à chaque rendu React (minute) : pas de boucle ici.
- [ ] **Step 1 : tests qui échouent** : `it('avec life, data-lit suit homeState')` ; `it('même nombre de nœuds de 6 h à 2 h')` ; `it('sans life : allumage du chantier 1 inchangé')` ; `it('fond : fenêtres du fond identiques avec et sans life')` ; `it('tranches : aucun volet ni rideau peint (espion de fillRect sur les couleurs des volets)')`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** `npm run test:famille -- scene-ville` PASS.
- [ ] **Step 5 :** commit `feat(ville): lumières par présence, volets et rideaux hors des tranches`.

### Task 9 : Calque de la vie aux fenêtres (Opus)

**Files:**
- Create: `src/content/window-life.tsx`
- Modify: `src/content/figure/ghibli-figure.tsx` (props `flat` : toujours le pantin 2D ; `silhouette` : palette unie `#1A1422`), `src/content/city-life.tsx` (montage, au-dessus de `GhibliWindows`, sous le ciel animé)
- Test: `tests/content/window-life.test.tsx`

**Interfaces:**
- Consumes: `useSceneLife`, `sceneMinute` (tâche 8) ; `homeState`, `cullAnimated` (tâche 4) ; `windowPose` (tâche 5) ; art (tâche 6) ; `GhibliFigure`, `poseFigure`, `useFigureRegistry`.
- Produces : `export function WindowLifeLayer(p: { facades: Facade[]; life: SceneLife; sky: Sky; minutes: number; still: boolean; width: number }): ReactElement`.
- Règles : par logement, nœuds montés pour la journée : un `Shutters` par fenêtre si `d.shutters`, un `Sash` et des `Curtains` par fenêtre, `maxActors` emplacements de pantin (`GhibliFigure flat`, caché sans `href` quand libre), accessoires ; un `<clipPath>` SVG par logement (ses vitres) pour les pantins `in` ; les pantins `lean` / `balcony` hors clip, devant le garde-corps peint (porter l'ordre de `paintBalcony`). Boucle `requestAnimationFrame` propre (modèle : `GullsLayer`) : minute fractionnaire `sceneMinute`, `homeState` pour chaque logement, `cullAnimated` (centre = milieu de la largeur), `windowPose`, écriture seulement si la valeur change (`setIfChanged` ou équivalent existant) ; de jour, pantins des pièces fermées à opacité 0,3 sous le reflet, de nuit silhouette dans les pièces allumées, ombre à 0,28 derrière un rideau tiré. Pluie qui commence (Review Focus 2) : garder l'ancien emploi du temps pour les scènes extérieures en cours jusqu'à leur fin. Mouvement réduit : une seule pose par minute, `still: true`.
- [ ] **Step 1 : tests qui échouent** : `it('nœuds constants de 6 h à 2 h (aucune création ni suppression)')` ; `it('au plus 8 pantins animés visibles')` ; `it('changement de largeur ou de jour : remontage unique')` ; `it('pluie en cours de scène : le pantin du balcon finit sa sortie')` ; `it('mouvement réduit : aucune transition, poses fixes')` ; `it('pantins toujours en 2D (aucune image 3D demandée)')`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** `npm run test:famille -- scene-ville scene-pietons scene-habitants3d` PASS.
- [ ] **Step 5 :** captures au banc 7 h, 11 h, 19 h, 21 h, 0 h 30 dans `.superpowers/captures-vie/` ; commit `feat(ville): vie derrière les fenêtres`.

### Task 10 : Retours et départs accrochés aux passages, cage jusqu'à l'étage (Opus)

**Files:**
- Modify: `src/core/library/city/hall-lights.ts`, `src/content/stair-lights.tsx`, `src/content/city-life.tsx`
- Test: `tests/core/library/city/hall-lights.test.ts`, `tests/content/hall-lights.test.tsx`

**Interfaces:**
- Consumes: `SceneLife`, `homeState` ; boucle des halls de `city-life.tsx` (l. 650-715).
- Produces :
  ```ts
  export const RETURN_WINDOW_MIN = 20;   // un passage entrant à moins de 20 min d'un `return` du foyer devient ce retour
  export function returnFloor(dwellings: readonly Dwelling[], schedules: ReadonlyMap<string, Schedule>, doorX: number, m: number, dir: 'in' | 'out'): number | null;   // étage du foyer dont le retour / départ est le plus proche, sinon null
  export const STAIR_RETURN_S = 180;
  ```
  `StairLights` gagne une silhouette par fenêtre de cage (`[data-stair-figure]`, opacité basculée par la boucle) qui monte palier par palier (0,35 min + 0,22 min par étage, `08-scenes.js` `paintStairFigure`).
- Règles : dans la boucle, à un nouveau passage (`stairNewPassage`), `returnFloor(...) ?? stairFloorsLit(...)` choisit l'étage ; minuterie de cage `STAIR_RETURN_S` pour un retour ; un seul marcheur suffit pour une famille ; sans passage visible le logement s'allume quand même à l'heure de l'emploi du temps (tâche 8) ; immeuble sans porte : rien (Review Focus 5).
- [ ] **Step 1 : tests qui échouent** : `it('passage entrant dans la fenêtre de retour → étage du foyer')` ; `it('hors fenêtre → étage tiré comme avant')` ; `it('immeuble sans porte : null, aucun plantage')` ; `it('silhouette : un étage à la fois, du rez-de-chaussée à l'étage du foyer')`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** `npm run test:famille -- scene-ville scene-pietons` PASS.
- [ ] **Step 5 :** capture du retour (19 h, 6 instants) ; commit `feat(ville): retours accrochés aux passages et cage jusqu'à l'étage`.

### Task 11 : Réactions aux événements de la rue (Opus)

**Files:**
- Modify: `src/content/city-life.tsx`, `src/content/window-life.tsx`, `src/content/use-scene-life.ts`
- Test: `tests/content/window-life.test.tsx`, `tests/content/city-life.test.tsx`

**Interfaces:**
- Consumes: `fireworksShow`, `showBursts` (tâche 2) ; `CityEvent` (`city/events.ts:122`) ; `movingAt` (`city/shops/moving.ts`) ; agents `ambulance` du trafic (`useTraffic`).
- Produces :
  ```ts
  export function showEvents(show: FireworksShow, m: number, nowS: number, width: number): CityEvent[];   // salves du spectacle en événements 'fireworks' (layer 'fixed', 30 s), clés stables `show-<at>`
  export const SIREN_LOOK_S = 72; export const SIREN_SHARE = 0.45;
  ```
- Règles : les salves du spectacle s'ajoutent aux feux du calque des événements (mêmes sprites, masque `skyline`) pendant `[show.start, show.end]` ; hors fête, rien ne change. Déménagement : `moving` de `useSceneLife` = un commerce de la pièce déménage aujourd'hui. Sirène : quand une ambulance traverse, 45 % des foyers présents et réveillés se penchent (`lean`, priorité 5) 72 s, tirés par `mulberry32(seed ^ hashString(agent.key) ^ d.key)` ; c'est un état court en mémoire du calque (seule exception à la pureté). Fête de la musique et sapin viennent déjà des emplois du temps.
- [ ] **Step 1 : tests qui échouent** : `it('14 juillet : salves pendant le spectacle tiré, salons éteints, habitants aux fenêtres')` ; `it('jour ordinaire : aucune salve de spectacle')` ; `it('ambulance : environ 45 % des foyers présents se penchent, puis rentrent en marchant')` ; `it('déménagement : des voisins regardent entre 8 h et 10 h')`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** `npm run test:famille -- scene-ville scene-evenements scene-circulation` PASS.
- [ ] **Step 5 :** captures 14 juillet 22 h 30, décembre 18 h, déménagement 10 h ; commit `feat(ville): réactions des habitants aux événements`.

### Task 12 : Toits vivants (Opus)

**Files:**
- Create: `src/core/library/city/roof-life.ts`, `src/content/roof-life-layer.tsx`
- Modify: `src/content/city-life.tsx` (montage sous le ciel animé, au-dessus des tranches)
- Test: `tests/core/library/city/roof-life.test.ts`, `tests/content/roof-life-layer.test.tsx`

**Interfaces:**
- Consumes: `FacadeLayout` (`roof`, `dormers`, `chimneys`, `roofOutline`), `SceneDay`, `SceneLife`, art de la tâche 7.
- Produces :
  ```ts
  export type CatPose = { x: number; y: number; pose: 'emerge' | 'walk' | 'sit'; phase: number; dir: 1 | -1 } | null;
  export function catOutings(seed: number, iso: string, facadeIndex: number): { start: number; dur: number }[];   // 3 sorties tirées par jour (10 h-12 h, 15 h-17 h, 22 h-24 h), 40-55 min, aucune sous la pluie
  export function catState(l: FacadeLayout, outings: readonly { start: number; dur: number }[], m: number): CatPose;
  export function pigeonsAt(l: FacadeLayout, seed: number, iso: string, m: number, wet: boolean): { x: number; y: number; pose: 'perch' | 'peck' | 'fly'; phase: number; dir: 1 | -1 }[];   // 2 vols, cycle tiré 11-17 min
  export function smokeAt(l: FacadeLayout, day: SceneDay, anyoneHome: boolean): boolean[];   // par cheminée : hiver (`cold`) et quelqu'un à la maison
  export function rooferAt(facades: readonly FacadeLayout[], seed: number, day: SceneDay, m: number): { facade: number; x: number; y: number; pose: 'kneel' | 'walk'; phase: number } | null;   // mardi et jeudi, 9 h-16 h 30, sec, un immeuble tiré
  ```
- Règles : chat seulement si `roof.kind === 'mansard'` et une lucarne `tabatiere` (il sort et rentre par elle) ; pigeons sur les corniches, partent et reviennent en vol (jamais d'apparition) ; nœuds constants pour la journée ; boucle propre (modèle `GullsLayer`) ; mouvement réduit : chat assis ou absent, pigeons posés.
- [ ] **Step 1 : tests qui échouent** : `it('chat absent des toits sans tabatière')` ; `it('sorties du chat différentes d'un jour à l'autre')` ; `it('pigeons : la position passe par le vol entre posé et absent')` ; `it('couvreur seulement mardi et jeudi par temps sec')` ; `it('fumées seulement en hiver')` ; `it('calque : nœuds constants de 6 h à 2 h')`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** `npm run test:famille -- scene-ville scene-animaux` PASS.
- [ ] **Step 5 :** capture 11 h un mardi de décembre (chat, pigeons, fumées, couvreur) ; commit `feat(ville): toits vivants`.

### Task 13 : Captures de validation et mesure (Opus)

**Files:**
- Create: `.superpowers/captures-vie/journal.md`

- [ ] **Step 1 :** captures au banc (7 h, 11 h, 19 h, 21 h, 0 h 30, samedi 10 h, 14 juillet 22 h 30, décembre 18 h, déménagement 10 h), à comparer aux PNG de la maquette ; deux dates différentes à 21 h côte à côte (preuve « pas prévisible ») ; fond identique à `main` (comparaison de la bande du fond).
- [ ] **Step 2 :** mesure CPU ×4, 1080 px, 21 h, médiane de 3, branche contre `main` (images/s, nœuds du calque) : régression ≤ 15 %. Sinon, corriger avant la revue finale.
- [ ] **Step 3 :** familles `scene-ville scene-pietons scene-evenements scene-circulation scene-animaux scene-habitants3d scene-commerces` : PASS hors échecs préexistants ; `npx tsc --noEmit` propre.
- [ ] **Step 4 :** commit `docs(ville): captures et mesure de la vie au-dessus de la rue`.
