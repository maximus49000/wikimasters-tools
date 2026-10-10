# Ambiance de fête, PR 2 élargie (équipes, scène, grand défilé) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Chaque tâche est confiée à un sous-agent (modèle choisi selon la difficulté, indiqué par tâche). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ajouter à la scène Ville des décors de fête posés et retirés par des équipes (échelle ou camion élévateur), une scène de la Fête de la musique avec projecteurs, et un grand défilé du 14 juillet sur une route fermée.

**Architecture:** Un moteur pur `city/install.ts` (aucun état, calcul depuis la date et l'heure absolues) donne à chaque élément de décor une phase (absent, en pose, présent, en dépose) et la position/étape de l'équipe. Un moteur pur `city/parade.ts` donne la fermeture de route et le flux du cortège. Le rendu (`install-layer.tsx`, `parade-layer.tsx`) place équipes, décors et cortège ; `city-life.tsx` et `scene-city.tsx` les branchent.

**Tech Stack:** TypeScript, React (SVG, SMIL), vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-10-bibliotheque-fetes-ambiance-design.md` (§7 = cette extension). Les tâches 1 à 4 (PR 1) sont fusionnées ; les tâches 5 (moteur d'événements), 6 (ballons, cloches), 8 (fiche) du plan `2026-10-10-bibliotheque-fetes-ambiance-1b-ii-b.md` sont faites sur la branche `feat/bibliotheque-fetes-ambiance-2`.

## Global Constraints

- Tout élément ajouté au décor est posé ET retiré par des humains ; hors de portée de la main : échelle (`LadderSprite`) ou camion élévateur à nacelle. Personne ne vole ni ne flotte.
- Aucun état, aucun `Math.random` (tirages = `mulberry32`/`hashString` de `../scene-world`). Format de la pièce reste v5.
- Les passants, véhicules et événements existants ne changent pas à graine égale hors des jours concernés.
- Mouvement réduit : aucune équipe animée ni cortège ni défilé aérien ; les décors posés restent figés.
- Plafond de figurants (`sprite-budget`, 40 par 720 px) : les équipes et le cortège y comptent.
- Textes et fiches en français. Tests : `npx vitest run <fichiers> --maxWorkers=2 --testTimeout=40000` ; `npx tsc --noEmit` ; `npm run build`.
- Worktree `C:\Users\maxim\Downloads\Wikimasters-fetes2`, branche `feat/bibliotheque-fetes-ambiance-2` (ne pas changer de branche, ne pas pousser avant la tâche finale, ne rien toucher au dépôt principal). Commits en français terminés par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. `git add` explicite, jamais `-A` avec des fichiers d'autres tâches.

## File Structure

- Create `src/core/library/city/install.ts` : jeux de décor, éléments, phases, équipe.
- Create `src/core/library/city/parade.ts` : fermeture de route, flux du cortège, défilé aérien.
- Create `src/content/install-layer.tsx`, `install-sprites.tsx` (équipe, camion élévateur, camionnette, scène, drapeaux de lampadaires, barrières).
- Create `src/content/parade-layer.tsx`, `parade-sprites.tsx` (cortège), `flypast-sprite.tsx` (Patrouille de France).
- Modify `city-event-sprites.tsx`, `events.ts`, `event-place.ts` (retrait de `street-band`, `parade` ; ajout `flypast`), `doors.ts`, `city-sprites.tsx`, `scene-city.tsx`, `city-life.tsx`, `vehicles.ts` (porte de route fermée), `src/core/whats-new/entries.ts`.
- Tests : `tests/core/library/city-install.test.ts`, `city-parade.test.ts`, `tests/content/install-layer.test.tsx`, `parade-layer.test.tsx`, et mises à jour des tests existants.

---

### Task 9: Moteur d'installation (pur) — modèle : opus

**Files:**
- Create: `src/core/library/city/install.ts`
- Test: `tests/core/library/city-install.test.ts`
- Modify: `src/core/library/city/calendar.ts` (exporter si besoin `dayNumber`/helpers de date ; chercher d'abord où `dayNumber` est défini avec `grep -rn "dayNumber" src`)

**Interfaces:**
- Consumes: `FestivityId`, `YMD`, `addDays`, `easterSunday` (calendar.ts) ; `lampsFor(width, seed): Lamp[]` (lamps.ts) ; `doorsFor(width, height, seed): Door[]` (doors.ts) ; `mulberry32`, `hashString` (scene-world).
- Produces (exact noms) :

```ts
export type Equipment = 'ladder' | 'lift' | 'hand';
export type ItemKind = 'lamp-flag' | 'door-flag' | 'stage-floor' | 'stage-frame' | 'stage-spots' | 'barrier';
export type DecorItem = { id: string; kind: ItemKind; x: number; high: boolean; u: number; removeU: number };
export type DecorWindow = { dayOffset: number; from: number; to: number }; // minutes ; dayOffset par rapport au jour de la fête
export type DecorSet = { id: string; fest: FestivityId; equipment: Equipment; install: DecorWindow; remove: DecorWindow; items: DecorItem[] };
export type CrewStep = string; // voir STEPS_BY_EQUIPMENT
export const STEPS_BY_EQUIPMENT: Readonly<Record<Equipment, readonly string[]>>;
export type ItemPhase =
  | { phase: 'absent' }
  | { phase: 'present' }
  | { phase: 'installing' | 'removing'; step: string; progress: number };
export function decorSetsFor(date: YMD, width: number, height: number, seed: number): DecorSet[]; // les jeux dont la fête tombe dans [date-1, date+1]
export function itemPhase(set: DecorSet, item: DecorItem, abs: number, festDay: number): ItemPhase;
export function crewAt(set: DecorSet, abs: number, festDay: number): { itemId: string; step: string; progress: number; removing: boolean } | null;
export const absMinute: (dayNumber: number, minute: number) => number;
```
(`festDay` = numéro de jour de la fête ; le jeu garde ses fenêtres relatives à ce jour.)

Règles de calcul :
- Jeux : `lamps-<fest>` (équipement `lift`, items `lamp-flag`, x = lampadaires), `doors-<fest>` (`ladder`, items `door-flag`, entrées avec `hallU < 0.5`) pour `bastille`, `armistice`, `may-day`, fenêtre montage `{dayOffset:-1, from:540, to:1020}`, démontage `{dayOffset:1, from:540, to:1020}` ; `stage-music` pour `music` (items `stage-floor` hand, `stage-frame` lift, `stage-spots` lift ; x commun tiré de la graine ; montage `{0, 540, 960}` ; démontage `{1, 0, 240}`) ; `barriers-bastille` (`hand`, items `barrier` tous les 120 px, montage `{0, 420, 480}`, démontage `{0, 750, 810}`). Un jeu stage a 3 étapes séquentielles : plancher d'abord, ossature, puis projecteurs, avec l'ordre imposé (pas de tri par `u`).
- Pour les autres jeux, l'ordre d'intervention suit `u` (montage) et `removeU` (démontage), tirés par `mulberry32(seed ^ hashString(set.id + item.id))`.
- Créneaux : les n éléments se partagent la fenêtre en n créneaux consécutifs de même durée, dans l'ordre. Dans un créneau, les étapes de `STEPS_BY_EQUIPMENT[equipment]` se partagent le créneau (poids simple, définis dans le code).
- `ladder` : arrive, ladder-up, climb, fix, descend, ladder-down, leave ; `lift` : arrive, deploy, rise, fix, lower, stow, leave ; `hand` : arrive, place, leave. Au démontage les mêmes étapes, `fix` devenant `unfix` (ajouter `unfix` aux listes de démontage via un mapping, ou renvoyer `removing: true` : choisir une des deux options et la documenter).
- `itemPhase` : avant le créneau d'installation → `absent` ; pendant → `installing` avec l'étape ; entre la fin du créneau et le début du créneau de démontage → `present` ; pendant le créneau de démontage → `removing` ; après → `absent`. Les étapes `arrive`/`ladder-up`/… laissent l'élément `absent` tant que l'étape `fix` n'a pas fini (le drapeau n'apparaît qu'à la fin de `fix`) et le rendent `present` pendant `unfix` jusqu'à sa fin.
- `crewAt` : l'équipe est occupée dans le créneau de l'élément en cours, sinon `null`.

- [ ] **Step 1: Écrire les tests qui échouent** (`city-install.test.ts`) — au minimum :
  - `decorSetsFor` le 13/7/2026 contient `lamps-bastille` et `doors-bastille` ; le 12/7 n'en contient pas ; le 14/7 contient `barriers-bastille` ; le 21/6 contient `stage-music` ; un jour ordinaire → `[]`.
  - `itemPhase` d'un `lamp-flag` : `absent` le 13/7 à 8 h ; `installing` pendant son créneau ; `present` le 13/7 à 17 h 30 (tous posés) et le 14/7 à midi ; `removing` pendant le démontage le 15/7 ; `absent` le 15/7 à 18 h.
  - monotonie : pour un élément, la suite des phases au fil du temps est exactement absent → installing → present → removing → absent (jamais de retour).
  - déterminisme : même graine, mêmes phases ; graine différente, ordre différent.
  - `stage-music` : le plancher est présent avant l'ossature, l'ossature avant les projecteurs ; démontage dans la nuit du 22/6 entre 0 h et 4 h.
  - `crewAt` : jamais deux interventions simultanées sur un même jeu ; `null` hors fenêtres.
  - les éléments `high` n'existent que pour `ladder`/`lift`, aucun élément `hand` n'est `high`.
- [ ] **Step 2: Vérifier l'échec**, **Step 3: Implémenter**, **Step 4: tests + `npx tsc --noEmit` verts**.
- [ ] **Step 5: Commit** `feat(ville): moteur d'installation des décors de fête (équipes, échelle, camion élévateur)`.

### Task 10: Rendu des équipes et des décors posés — modèle : opus

**Files:**
- Create: `src/content/install-sprites.tsx`, `src/content/install-layer.tsx`
- Modify: `src/content/city-life.tsx`, `src/content/scene-city.tsx`, `src/content/city-sprites.tsx` (retirer la prop `flag` de `EntranceSprite` ; le drapeau d'entrée est maintenant dessiné par le calque), `src/core/library/city/doors.ts` (supprimer `doorFlag`), `src/core/library/city/events.ts`/`event-place.ts` (retirer `parade` et `street-band`), `src/content/city-event-sprites.tsx` (retirer leurs `case`)
- Test: `tests/content/install-layer.test.tsx` ; mettre à jour `tests/core/library/city-doors.test.ts`, `tests/core/library/city-events.test.ts` (catalogue 18 : fest-balloons et bells restent), `tests/content/city-event-sprites.test.tsx`, `tests/content/city-events-layer.test.tsx`, `tests/content/scene-panorama.test.tsx`

**Interfaces:**
- Consumes: Task 9 (`decorSetsFor`, `itemPhase`, `crewAt`, `absMinute`) ; `LadderSprite` (shop-sprites) ; `PersonSprite` ; `metrics` (`CityMetrics` : `ground`, `walkY`, `laneY`, `unit`) ; `lampsFor`, `doorsFor`.
- Produces: `<InstallLayer width height seed city sky still date metrics … />` monté dans `city-life.tsx` (ordre : trottoir) ; sprites `FlagArt`, `LiftTruck`, `CrewWorker`, `Van`, `StageStructure({ lit: boolean })`, `Barrier`.

À faire :
- Dessiner chaque type d'élément : drapeau de lampadaire (au sommet du fût, x des lampadaires), drapeau d'entrée (au-dessus de l'auvent, centré sur la porte, hampe plantée comme dans la capture validée : x décalé de +4), barrière (type Vauban, bord de chaussée), structure de scène (plancher, deux montants, traverse, 3 projecteurs ; `lit` allume les faisceaux). Teinte nocturne via `tone(c, sky)`.
- Équipes : 2 travailleurs (`PersonSprite`, tenue de chantier : `outfitFor('worker', …)`), `ladder` = `LadderSprite` appuyée sur la façade, un travailleur monte et descend selon `step`/`progress` (réutiliser les poses de `city-shops-life.tsx` : `onLadder`, `CrewPose`) ; `lift` = camion élévateur à nacelle qui vient se garer sous l'élément (arrive : il roule jusqu'à x, deploy : stabilisateurs, rise/lower : bras et nacelle avec un travailleur, stow : repli) ; `hand` = deux porteurs. Une camionnette garée au bord de la rue (près de l'équipe) où l'échelle est rangée en fin de journée.
- L'élément n'est dessiné qu'aux phases `present`, `installing` à partir de la fin de `fix`, `removing` jusqu'à la fin de `unfix`.
- Mouvement réduit : décors posés dessinés (`present` seulement), aucune équipe.
- Brancher dans `city-life.tsx` (calendrier : `dayNumber(date)`, `absMinute`) et `scene-city.tsx` (drapeaux d'entrée, portes) ; budget de figurants.
- Retirer ce qui est supprimé (voir Files) et adapter les tests existants.

- [ ] **Step 1: Tests qui échouent** (`install-layer.test.tsx`) : le 13/7 à 12 h il y a au moins une équipe à l'œuvre (`[data-crew]`) et des drapeaux `[data-decor-item]` en cours ; le 14/7 à 12 h tous les drapeaux de lampadaires et d'entrées sont posés (`[data-decor-kind="lamp-flag"]`, `door-flag`) et aucune équipe ; le 15/7 à 12 h une équipe de dépose ; le 10/10 : rien (`[data-decor-item]` absent) ; mouvement réduit le 14/7 : décors présents, aucune équipe ; un élément `high` en pose a toujours une échelle (`[data-ladder]`) ou une nacelle (`[data-lift]`) dans l'équipe ; un élément `hand` n'en a pas.
- [ ] **Step 2: Échec, Step 3: Implémentation, Step 4: `npx vitest run tests/content tests/core/library --maxWorkers=2 --testTimeout=40000` + `npx tsc --noEmit` verts.**
- [ ] **Step 5: Commit** `feat(ville): équipes d'installation, drapeaux de lampadaires et d'entrées posés par des humains`.

### Task 11: Scène de la Fête de la musique et musiciens — modèle : sonnet

**Files:**
- Modify: `src/content/install-sprites.tsx` (`StageStructure`), `src/content/install-layer.tsx`
- Create: `src/content/stage-band.tsx` (musiciens sur scène)
- Test: `tests/content/install-layer.test.tsx` (ajouts)

**Interfaces:**
- Consumes: jeu `stage-music` et `itemPhase` (Task 9) ; `outfitsOf`-équivalent (`outfitFor('ordinary', rng)` avec `mulberry32(hashString(...))`).
- Produces: musiciens `[data-stage-band]` présents le 21/6 de 17 h à 24 h seulement si le plancher est posé ; faisceaux `data-stage-beam` issus de la position des projecteurs de la traverse (3) et visant chacun un musicien.

À faire : dessiner la structure complète (plancher, montants, traverse, 3 projecteurs) ; cônes de lumière dessinés du projecteur (point d'origine sur la traverse) vers le sol sous un musicien (plus de cône flottant) ; faisceaux allumés seulement quand il fait nuit (`sky.daylight` sous le seuil `DARK` d'events.ts) et seulement quand les projecteurs sont posés ; musiciens (guitare, micro sur pied, tambour) sur le plancher, animation légère seulement hors mouvement réduit.
- [ ] **Step 1: Tests** : 21/6 à 18 h : structure posée, musiciens présents, aucun faisceau (jour) ; 21/6 à 22 h : 3 faisceaux, chacun avec son origine sur la traverse ; 21/6 à 10 h : structure en pose, aucun musicien ; 22/6 à 2 h : démontage (équipe de nuit, projecteurs éteints) ; 22/6 à 6 h : rien ; mouvement réduit : structure sans animation.
- [ ] **Step 2 à 4:** échec, implémentation, tests verts + typecheck. **Step 5: Commit** `feat(ville): scène de la Fête de la musique avec projecteurs et musiciens`.

### Task 12: Route fermée, barrières et flux du cortège (pur) — modèle : sonnet

**Files:**
- Create: `src/core/library/city/parade.ts`
- Modify: `src/core/library/city/vehicles.ts` (porte `vehicleGate`), `src/core/library/city/events.ts` (aucun événement de rue pendant la fermeture), `src/content/use-city-events.ts` si le filtre y vit
- Test: `tests/core/library/city-parade.test.ts`

**Interfaces:**
- Consumes: `FestivityId`, `YMD`, `mulberry32`, `hashString`, `WORLD_MARGIN`, `travelSpan` (events.ts).
- Produces:

```ts
export const CLOSURE: readonly [number, number] = [480, 750]; // 8 h à 12 h 30
export const PARADE: readonly [number, number] = [600, 720]; // 10 h à 12 h
export function roadClosed(fests: readonly FestivityId[], minute: number): boolean; // bastille et minute dans CLOSURE
export type ParadeKind = 'motorbikes' | 'flags' | 'band' | 'infantry' | 'cavalry' | 'jeeps' | 'trucks' | 'tanks' | 'firetruck';
export type ParadeUnit = { id: string; kind: ParadeKind; variant: number; half: number; start: number }; // start = instant (s) d'entrée à gauche
export const PARADE_SPEED = 22; // px/s, commune à toutes les unités
export function paradeUnits(seed: number, width: number, dayStartS: number): ParadeUnit[]; // toutes les unités de 10 h à 12 h, ordre fixe : band en tête, puis suite tirée de la graine
export function paradeX(u: ParadeUnit, width: number, t: number): number | null; // null hors champ
export function flypastWindow(dayStartS: number): { start: number; end: number }; // à 10 h, ~40 s
```

Règles : la suite des unités est un flux continu de 10 h à 12 h, une unité entre quand la précédente a dégagé `half` + marge ; ordre tiré avec `mulberry32` ; première unité toujours `band`, dernière `firetruck` ; `half` par type (motards 40, drapeaux 50, fanfare 90, infanterie 70, cavalerie 80, jeeps 60, camions 80, chars 90, pompiers 80). `roadClosed` doit faire que `vehicleGate` rend 0 pour toutes les voitures/vélos et qu'aucun événement `street` (hors cortège) ne soit programmé : brancher `eligible`/`cityEventSchedule` via une condition `closed` dans `EventConditions` (ajouter `closed: boolean` et le calculer dans `eventConditions`), et `vehicleGate(v, intensity)` via un champ `closed` de `CityIntensity` (`festive?.id === 'bastille'` et minute dans CLOSURE ; à calculer dans `cityIntensity` à partir de `ctx.minutes`). Adapter les littéraux de test (`closed: false`).
- [ ] **Step 1: Tests** : `roadClosed(['bastille'], 479)` faux, `480` vrai, `750` faux ; `vehicleGate` = 0 en route fermée ; aucun événement de rue programmé pendant la fermeture (`cityEventSchedule` avec `cond.closed`) ; hors fermeture programme inchangé ; `paradeUnits` déterministe, première = band, dernière = firetruck, pas de chevauchement (écart d'entrée ≥ (half_i + half_j + marge)/PARADE_SPEED) ; `paradeX` hors champ = null et progresse à `PARADE_SPEED`.
- [ ] **Step 2 à 4:** échec, implémentation, tests verts (`tests/core/library`) + typecheck. **Step 5: Commit** `feat(ville): route fermée et flux du cortège du 14 juillet (moteur)`.

### Task 13: Sprites et calque du cortège — modèle : opus

**Files:**
- Create: `src/content/parade-sprites.tsx`, `src/content/parade-layer.tsx`
- Modify: `src/content/city-life.tsx`
- Test: `tests/content/parade-layer.test.tsx`

**Interfaces:**
- Consumes: Task 12 (`paradeUnits`, `paradeX`, `roadClosed`, `PARADE_SPEED`) ; `PersonSprite`, `outfitFor`, `tone`, `metrics.laneY.near`, `STREET_SCALE`.
- Produces: `<ParadeLayer width seed sky city still … />` ; `ParadeUnitSprite({ unit, sky, still, t })` dessinant chaque `kind` ; attribut `data-parade-unit="<kind>"`.

Dessins (SVG, style des sprites voisins, repère pieds/sol à y = 0, regarde vers +x, animations SMIL seulement hors `still`, tenue/couleurs tirées de `variant`/id, jamais `Math.random`) :
- `band` fanfare militaire : 6 musiciens en rang (tuba, trompette, grosse caisse, caisse claire, clairon, chef avec plumet), marche cadencée ;
- `motorbikes` : 2 motos de la Garde côte à côte, casque blanc ;
- `flags` : 3 porte-drapeaux avec drapeaux tricolores ;
- `infantry` : colonne de 8 soldats à pied, képi, fusil à l'épaule, pas synchronisé ;
- `cavalry` : 3 cavaliers (cheval avec animation de pas, cuirasse et plumet) ;
- `jeeps` : 2 jeeps pavoisées ;
- `trucks` : 2 camions militaires bâchés ;
- `tanks` : 2 chars (chenilles, tourelle, canon) ;
- `firetruck` : camion de sapeurs-pompiers rouge avec échelle et gyrophare.
Le cortège passe sur la file du premier plan, devant les voitures absentes (route fermée). Foule : spectateurs supplémentaires le long du trottoir (utiliser les passants festifs existants, rien à ajouter).
Mouvement réduit : le cortège ne part pas.
Ajouter aussi le défilé aérien : `flypast-sprite.tsx` (Patrouille de France : 7 avions en formation avec traînées bleu, blanc, rouge, traversée ~40 s à 10 h, puis 2 hélicoptères), monté dans le calque de ciel de `city-life.tsx`, pas en mouvement réduit.
- [ ] **Step 1: Tests** : 14/7 à 10 h 30 : au moins une unité `[data-parade-unit]` visible et aucune voiture active (`[data-vehicle][data-active="true"]` = 0) ; 14/7 à 9 h : aucune unité mais route fermée (0 voiture), barrières présentes ; 14/7 à 13 h 30 : route rouverte, plus d'unité ; chaque `kind` se dessine (`it.each`) ; mouvement réduit : aucune unité ; jour ordinaire : aucune unité.
- [ ] **Step 2 à 4:** échec, implémentation, `npx vitest run tests/content --maxWorkers=2 --testTimeout=40000` + typecheck. **Step 5: Commit** `feat(ville): grand défilé du 14 juillet (cortège varié et défilé aérien)`.

### Task 14: Fiche WikiHow, captures, livraison — modèle : sonnet (fiche et captures), vérifs par le parent

- [ ] **Step 1:** Mettre à jour `bibliotheque-v26` (déjà commitée) : ajouter les équipes d'installation (échelle, camion élévateur, camionnette), la scène de la Fête de la musique (projecteurs, démontage de nuit), les drapeaux de lampadaires, la route fermée et le grand défilé du 14 juillet (fanfare, soldats à pied, cavaliers, jeeps, camions, chars, pompiers, défilé aérien) ; retirer les phrases devenues fausses (« musiciens en trottoir », « drapeaux sur une entrée sur deux » sans équipe). Mouvement réduit : décors figés, rien d'animé. Limites : rien sans fenêtre, calendrier français.
- [ ] **Step 2:** Captures sur le banc (`.superpowers/harness-ville`, `date=`, `h=`, `vb=`, `freeze=`, `to=`) : pose des drapeaux de lampadaires avec camion élévateur (13/7 11 h), pose d'un drapeau d'entrée à l'échelle (13/7 14 h), drapeaux posés (14/7 9 h), barrières (14/7 7 h 30), cortège (14/7 10 h 30 et 11 h 30 : plusieurs types), défilé aérien (14/7 10 h), scène en montage (21/6 12 h), scène de jour (21/6 17 h 30), scène de nuit avec faisceaux (21/6 22 h), démontage de nuit (22/6 2 h), dépose des drapeaux (15/7 11 h), ballons-cœur, lapins, cloches, témoin. Les montrer à l'utilisateur pour validation.
- [ ] **Step 3:** Corrections demandées, puis `npx vitest run --maxWorkers=2 --testTimeout=40000`, `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 4:** Pousser, PR « Ville : ambiance de fête (1b-ii-b, 2/2) », la fusionner, `npm run preprod` depuis le dépôt principal à jour (règle du projet), mettre à jour la mémoire, retirer jonction `node_modules` et worktree.
