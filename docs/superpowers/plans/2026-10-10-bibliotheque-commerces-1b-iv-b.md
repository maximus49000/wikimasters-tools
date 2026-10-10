# Commerces 1b-iv-b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Personnel de ville qui ouvre/ferme et se relaie, familles de gestes de travail (employés et clients), terrasses selon la météo, cordon + videurs + file de la boîte de nuit, déménagement le jour d'un changement de commerce.

**Architecture:** Tout est calculé par des fonctions pures dans `src/core/library/city/shops/` (graine de la pièce, local, jour, minute, météo), sans nouvel état mémorisé. Le rendu reste dans `src/content/city-shops-life.tsx` (couche animée) et de nouveaux fichiers `shop-*.tsx`. Mêmes conventions que 1b-iv-a (lire ce code avant de commencer).

**Tech Stack:** TypeScript strict, React 18, SVG, Vitest (`npx vitest run --maxWorkers=4`), `npm run build`.

**Spec:** `docs/superpowers/specs/2026-10-10-bibliotheque-commerces-b-design.md` (à lire en entier). Contexte : `docs/superpowers/specs/2026-10-09-bibliotheque-commerces-design.md` et `docs/superpowers/plans/2026-10-09-bibliotheque-commerces-1b-iv-a.md`.

## Global Constraints

- Worktree `C:\Users\maxim\Downloads\Wikimasters-commerces-b`, branche `feat/bibliotheque-commerces-b` ; jonction `node_modules` vers le dépôt principal et copie de `.env.local` seulement si le build l'exige (à retirer avant de finir).
- UNE SEULE PR. État de la pièce inchangé (v5), aucun nouveau champ mémorisé, aucune migration, aucun changement du relais.
- Tout est déterministe : mêmes entrées → mêmes sorties (`mulberry32(seed ^ hashString('…'))`, jamais `Math.random`).
- **Invariant : un local `open` (selon `isOpenAt`) a toujours au moins une personne à l'intérieur, à chaque minute.** Testé exhaustivement.
- Mouvement réduit : tout est statique (aucun trajet, états selon l'heure) ; cohérent avec `city-shops-life.tsx` existant.
- Plafond global ≈ 40 sprites animés pour la scène Ville ; ordre de suppression : clients de terrasse, puis clients intérieurs.
- Textes en français, commentaires en français, style des fichiers voisins (commentaire d'en-tête qui explique le « pourquoi »).
- Fiche WikiHow : `bibliotheque-v24` (voir `src/**/entries.ts`, id jamais annoncé, étapes `text + how + tip`, didactique).
- Commits fréquents, `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` en fin de message.

## File Structure

| Fichier | Rôle |
|---|---|
| `src/core/library/city/shops/moving.ts` (créer) | plan et étapes du déménagement |
| `src/core/library/city/shops/works.ts` (modifier) | `worksPlan` accepte une borne basse de début |
| `src/core/library/city/shops/staff.ts` (créer) | plan du jour du personnel + état à la minute |
| `src/core/library/city/shops/gestures.ts` (créer) | familles, table type → famille, `gestureAt` |
| `src/core/library/city/shops/customers.ts` (modifier) | clients : place + geste pendant le séjour |
| `src/core/library/city/shops/terrace.ts` (créer) | état de la terrasse selon horaires et météo |
| `src/core/library/city/shops/queue.ts` (créer) | cordon, videurs, file de la boîte |
| `src/core/library/city/shops/view.ts` (modifier) | `ShopView` gagne `moving`, `interiorStage` |
| `src/content/shop-gesture-sprites.tsx` (créer) | poses et accessoires |
| `src/content/shop-terrace.tsx`, `shop-queue.tsx`, `moving-truck.tsx` (créer) | rendus |
| `src/content/city-shops-life.tsx` (modifier) | assemble tout dans la couche animée |
| `src/**/entries.ts` (modifier) | fiche WikiHow v24 |

---

### Task 1: Déménagement (moteur) et décalage du chantier d'enseigne

**Files:**
- Create: `src/core/library/city/shops/moving.ts`, test `src/core/library/city/shops/moving.test.ts` (placer le test à côté des autres tests des shops : suivre l'emplacement existant, vérifier avec `ls`)
- Modify: `src/core/library/city/shops/works.ts`, `view.ts`

**Interfaces:**
- Produces:
  - `export const MOVING_STEPS = ['truck-arrives','open-back','carry-out','pause','carry-in','close-back','leave'] as const; export type MovingStep = (typeof MOVING_STEPS)[number];`
  - `export type MovingPlan = { start: number; end: number; steps: { step: MovingStep; from: number; to: number }[]; outOnly: boolean; inOnly: boolean }`
  - `export function movingPlan(seed: number, slotId: string, day: number, kind: Change['kind'], offsetMin?: number): MovingPlan` : début 480 à 510 (+ `offsetMin`), fin 570 à 600 (+ `offsetMin`) ; `kind === 'to-sale'` → pas de `carry-in` (étape à durée nulle retirée, `outOnly`) ; `'from-sale'` → pas de `carry-out` (`inOnly`).
  - `export function movingAt(plan: MovingPlan, minutes: number): { step: MovingStep; progress: number } | null`
  - `worksPlan(seed, slotId, day, notBefore = 0)` : si `notBefore > 0`, `start = max(start, notBefore + tirage 0..30)` et `end` ≥ `start + 120` ; sans `notBefore`, résultat identique à l'actuel (régression testée).
  - `ShopView` gagne `moving: { step: MovingStep; progress: number; kind: Change['kind'] } | null` et `interiorStage: 'before' | 'empty' | 'after' | null` (null hors changement) ; `interior` garde son sens actuel hors chantier.
- Consumes: `Change` (lifecycle), `mulberry32`/`hashString` (scene-world).

- [ ] **Step 1: Tests** :
  - Déterminisme (deux appels égaux), étapes contiguës `from[i+1] === to[i]`, couvrent `[start, end[`.
  - `to-sale` : aucune étape `carry-in` de durée > 0 ; `from-sale` : aucune `carry-out`.
  - `movingAt` renvoie `null` avant `start` et à partir de `end`, `progress ∈ [0,1[`.
  - `worksPlan(seed,id,day)` inchangé par rapport à l'ancien comportement (comparer à valeurs figées calculées avant la modification) ; `worksPlan(..., notBefore)` : `start ≥ notBefore`, `end - start ≥ 120`.
  - `shopViewAt` un jour de changement : avant `movingPlan.start` → ancien état fermé ; pendant `carry-out` → `interiorStage` passe de `'before'` à `'empty'` ; pendant `carry-in` → `'empty'` puis `'after'` ; pendant les étapes d'enseigne (`worksAt`) comme avant ; `phase` vaut `'works'` du début du déménagement à la fin du chantier ; `moving` non nul pendant les étapes de déménagement.
- [ ] **Step 2:** Lancer, constater l'échec (`npx vitest run --maxWorkers=4 moving`).
- [ ] **Step 3: Implémenter** `moving.ts`, la borne basse de `works.ts` (le chantier d'enseigne démarre à `plan(moving).end + 15` : passer `notBefore = movingPlan.end + 15`), et brancher `shopViewAt` (le chantier d'enseigne commence maintenant plus tard ; les poids des étapes, `WORK_STEPS` et la logique « enseigne enlevée à `remove`, posée à `install` » ne changent pas ; avant `moving.start` l'ancien état fermé, entre `moving.end` et `works.start` : `phase: 'works'`, `interior: null`, `interiorStage: 'empty'`, ancienne enseigne toujours en place).
- [ ] **Step 4:** Toute la suite des shops passe (`npx vitest run --maxWorkers=4 src/core/library/city`).
- [ ] **Step 5: Commit** `feat(ville): déménagement le jour d'un changement de commerce (moteur)`.

---

### Task 2: Personnel : plan du jour et état à la minute

**Files:**
- Create: `src/core/library/city/shops/staff.ts`, `staff.test.ts`
- Modify: `catalog.ts` (champ `staff: { min: number; max: number }` par type : petits commerces 1-2, supérette/bar/café/restaurant/pizzeria/boîte/laverie/arcade 2-3 ; `ShopDef.relay: boolean` calculé, ne pas le stocker : dériver de l'amplitude > 9 h)

**Interfaces:**
- Produces:
  - `export type StaffRole = 'opener' | 'closer' | 'floor'`
  - `export type StaffShift = { id: string; role: StaffRole; outfitKey: string; arriveAt: number; leaveAt: number; breaks: [number, number][] }` (minutes depuis minuit ; `leaveAt` peut dépasser 1440 pour les plages passant minuit, géré par l'appelant via la veille)
  - `export function staffPlan(def: ShopDef, seed: number, slotId: string, date: YMD): StaffShift[]` (vide si fermé ce jour, y compris férié ; plages multiples : le personnel d'une pause longue sort, rideau baissé, et revient 20-30 min avant la reprise ; relais si amplitude > 9 h : au moins 2 équipes avec chevauchement ≥ 5 min ; un membre isolé n'a jamais de pause)
  - `export type StaffState = { id: string; where: 'absent' | 'walking-in' | 'opening' | 'inside' | 'closing' | 'walking-out'; side: 1 | -1; progress: number; onBreak: boolean }`
  - `export function staffAt(shifts: StaffShift[], minutes: number): StaffState[]` : `walking-in` pendant 3 min avant l'entrée (arrivée 20-30 min avant ouverture : 2/3 du temps en attente à l'intérieur pour `opening`), `opening` = lever du rideau (5 s ≈ 0,1 min : exposé comme `progress` dans le rideau, voir Task 7), `closing`/`walking-out` à la fermeture.
  - `export function shutterAt(shifts: StaffShift[], def: ShopDef, date: YMD, minutes: number): 'up' | 'down' | 'rising' | 'falling'` : jamais `up` sans quelqu'un `inside`.
- Consumes: `isOpenAt`, `ShopDef`, `YMD`.

- [ ] **Step 1: Tests** (écrire d'abord) :
  - **Invariant exhaustif** : pour les 32 types, 7 jours de semaine, un jour férié, minutes 0..1439 par pas de 1, `isOpenAt(def, date, m)` ⇒ au moins un état `inside`/`opening`/`closing` ; boucler sur plusieurs graines (3).
  - Fermé (dimanche pour un type fermé, jour férié non ouvert) : plan vide.
  - Relais : pour les types d'amplitude > 9 h (supérette, laverie, bar, café, arcade, pizzeria, kebab, sushis, restaurant selon plages), deux équipes se chevauchent ≥ 5 min.
  - Pause : un membre ne part en pause que si un autre est inside ; une équipe à un membre → `breaks` vide.
  - Plage passant minuit (bar, arcade, boîte) : après minuit, personnel de la veille encore présent jusqu'à `fermeture + 15 min` ; `staffPlan` du lendemain n'inclut pas deux fois les mêmes shifts.
  - Plages doubles (restaurant, pizzeria) : entre les plages, `shutterAt === 'down'` et tout le monde `absent` ou `walking-*`.
  - `shutterAt` : `rising` quand `opening`, `falling` quand `closing` ; jamais `up` quand personne n'est à l'intérieur.
- [ ] **Step 2:** Constater l'échec.
- [ ] **Step 3: Implémenter** (trajets : même convention que `visitAt` de `customers.ts` ; ne pas réutiliser `Visit`, créer des fonctions propres au personnel qui donnent `side` = côté tiré du bord).
- [ ] **Step 4:** Tests verts + tests de la scène inchangés.
- [ ] **Step 5: Commit** `feat(ville): personnel des commerces, relais et rideau (moteur)`.

---

### Task 3: Familles de gestes (moteur)

**Files:**
- Create: `src/core/library/city/shops/gestures.ts`, `gestures.test.ts`

**Interfaces:**
- Produces:
  - `export const FAMILIES = ['counter','till','chair','browse','drink','table','dance','machine'] as const; export type Family = (typeof FAMILIES)[number];`
  - `export const SHOP_FAMILY: Readonly<Record<ShopTypeId, Family>>` selon le tableau du spec §2 (32 entrées, test que tous les types sont couverts).
  - `export const ACCESSORY: Readonly<Record<ShopTypeId, string>>` (id d'accessoire : `baguette`, `box`, `bag`, `bouquet`, `pill`, `bottle`, `basket`, `scissors`, `needle`, `book`, `record`, `glasses`, `clothes`, `glass`, `plate`, `pizza`, `tray`, `joystick`, `tool`, `laundry`… : au moins un id distinct par famille, jamais vide).
  - `export type Role = 'staff' | 'customer'`
  - `export type Pose = { arms: 'down' | 'reach' | 'hold' | 'up' | 'work'; lean: number; head: 'front' | 'down' | 'turn'; item: 'none' | 'hand' | 'table' | 'counter'; sway: number }` (valeurs numériques en unités du sprite, `lean` ∈ [-1,1], `sway` ∈ [-1,1])
  - `export function gestureAt(type: ShopTypeId, role: Role, t: number, seed: number): Pose` : boucle de 6 à 14 s selon la famille (déphasée par `seed`).
  - `export function takesAway(type: ShopTypeId): boolean` (vrai pour `counter`, `till`, `browse`).
- Consumes: `ShopTypeId`, `mulberry32`.

- [ ] **Step 1: Tests** : table totale ; `gestureAt` déterministe et périodique (période ≤ 14 s, `gestureAt(t) ≈ gestureAt(t + période)` : comparer les champs discrets et `lean` à 1e-6) ; poses différentes entre `staff` et `customer` pour `counter` ; `sway` ≠ 0 pour `dance`, 0 pour `chair` client ; deux types de même famille ont des accessoires différents quand la table le prévoit ; `takesAway` conforme au spec.
- [ ] **Step 2:** Constater l'échec.
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4:** Tests verts.
- [ ] **Step 5: Commit** `feat(ville): familles de gestes de travail (moteur)`.

---

### Task 4: Clients avec gestes

**Files:**
- Modify: `src/core/library/city/shops/customers.ts`, `customers.test.ts`

**Interfaces:**
- Produces: `Visit` gagne `seat: { x: number; facing: 1 | -1 }` (place dans l'intérieur selon la famille : `chair` au fauteuil, `table` à la table, sinon devant le comptoir/rayon ; deux places par local, comme `innerX` actuel) ; `visitAt` renvoie en plus `gesture: Pose | null` pendant `inside` (via `gestureAt(type, 'customer', c, seedOfVisit)`) ; le type du commerce est passé : `visitsFor(slots, frames, seed, typeOf: (slotId: string) => ShopTypeId | null)`.
- Consumes: Task 3.

- [ ] **Step 1: Tests** : les cas existants de `customers.test.ts` restent verts (aucune régression de `visitAt` pour `stage`, `x`, `fade`) ; en `inside`, `gesture` non nul ; hors `inside`, `null` ; `takesAway(type)` ⇒ la visite expose `carry: true` au stade `out`.
- [ ] **Step 2–4:** échec, implémentation, vert. **Step 5: Commit** `feat(ville): les clients font le geste du commerce (moteur)`.

---

### Task 5: Terrasse (moteur)

**Files:**
- Create: `src/core/library/city/shops/terrace.ts`, `terrace.test.ts`
- Modify: `catalog.ts` (champ `terrace: 0 | 2 | 3 | 4` = nombre max de tables : bar 3, café 4, restaurant 3, salon de thé 3, pizzeria 2, autres 0)

**Interfaces:**
- Produces:
  - `export type TerraceState = 'none' | 'setting-up' | 'open' | 'umbrellas' | 'clearing'`
  - `export type TerraceWeather = { rain: boolean; snow: boolean; storm: boolean; wind: boolean; sunny: boolean }`
  - `export function terraceAt(def: ShopDef, isOpen: boolean, minutes: number, weather: TerraceWeather, openedAt: number, closesAt: number): { state: TerraceState; progress: number; tables: number }` : `none` si `def.terrace === 0`, local fermé, mauvais temps (pluie, neige, orage, vent) ou nuit froide (22 h-7 h) ; montage dans les 6 min après l'ouverture (`setting-up`), démontage 30 min avant la fermeture pour `bar`, 10 min pour les autres (`clearing`), `umbrellas` si ensoleillé et sec ; hystérésis : le mauvais temps a un `hold` de 10 min (le résultat dépend de `weather` à `minutes` ET à `minutes - 10`).
  - `export function terraceGuests(tables: number, seed: number, slotId: string, minutes: number, crowd: number): { table: number; seat: 0 | 1; leavesAt: number }[]` (0 à 2 convives par table, selon l'affluence ; au plus 4 en tout).
- Consumes: `weather` du dossier `src/core/library/weather/` : écrire un adaptateur `terraceWeatherAt(state, minutes)` dans `terrace.ts` sur la base des types exposés (lire `src/core/library/weather/*.ts` pour trouver les champs réels : pluie, neige, orage, vent ; si le vent n'existe pas, `wind = false` avec un commentaire).

- [ ] **Step 1: Tests** : `none` pour les 27 types sans terrasse ; jamais de table sous pluie/neige/orage/vent ; jamais de table de 22 h à 7 h ; hystérésis (un coup de pluie de 3 min à `t` retire la terrasse jusqu'à `t + 10`, puis remontage) ; `setting-up` seulement dans les 6 premières minutes après l'ouverture ; `clearing` puis `none` avant la fermeture ; `umbrellas` seulement si ensoleillé ; `terraceGuests` ≤ 4 et 0 quand l'état n'est pas `open`/`umbrellas`.
- [ ] **Step 2–4:** échec, implémentation, vert. **Step 5: Commit** `feat(ville): terrasses selon la météo (moteur)`.

---

### Task 6: Cordon, videurs et file de la boîte (moteur)

**Files:**
- Create: `src/core/library/city/shops/queue.ts`, `queue.test.ts`

**Interfaces:**
- Produces:
  - `export type QueueMember = { id: string; slot: number; entersAt: number; outfitKey: string; fade: number }` (`slot` 0 = devant la porte)
  - `export function nightclubDoor(isOpen: boolean, minutes: number): { cordon: boolean; bouncers: 0 | 2 }` (deux videurs dès 30 min avant l'ouverture)
  - `export function queueAt(seed: number, slotId: string, tSeconds: number, minutes: number, isOpen: boolean): QueueMember[]` : longueur cible 0..6 selon l'heure (max 0 h-2 h) ; une personne entre toutes les 15-30 s (le membre `slot 0` disparaît dans la porte, les autres avancent d'un cran avec `fade`) ; vide hors ouverture.
- Consumes: `mulberry32`.

- [ ] **Step 1: Tests** : vide si fermé ; ≤ 6 membres ; ids uniques ; `slot` consécutifs depuis 0 ; déterminisme ; longueur maximale entre 0 h et 2 h supérieure à celle de 23 h 15 sur un échantillon ; `nightclubDoor` : 2 videurs seulement de 30 min avant l'ouverture à la fermeture.
- [ ] **Step 2–4:** échec, implémentation, vert. **Step 5: Commit** `feat(ville): file d'attente et videurs de la boîte de nuit (moteur)`.

---

### Task 7: Rendu du personnel, des gestes et du rideau

**Files:**
- Create: `src/content/shop-gesture-sprites.tsx` (poses de `PersonSprite` : prendre `Pose` de Task 3 et dessiner bras/tête/accessoire ; accessoires SVG de 3-5 px pour chaque id de `ACCESSORY`)
- Modify: `src/content/city-sprites.tsx` (si `PersonSprite` doit accepter une `pose` optionnelle), `src/content/city-shops-life.tsx`, `shop-sprites.tsx` (rideau : animation montée/descente selon `shutterAt`), test rendu jsdom `city-shops-life.test.tsx` (existant ? sinon créer à côté des autres tests de `src/content`)

**Interfaces:**
- Consumes: Tasks 2-4. Produces : le composant `StaffLayer` exporté depuis `city-shops-life.tsx` : `({ view, shifts, frame, metrics, minutes, reduced }) => ReactElement`.

- [ ] **Step 1: Test jsdom** : mouvement réduit → exactement une personne `inside` par local ouvert, rideau selon l'heure, aucun nœud `walking-*` ; non réduit, à l'ouverture le rideau est `rising` ; un local fermé n'affiche aucun personnel ; un client `inside` rend l'accessoire de son type.
- [ ] **Step 2–3:** échec puis rendu (employés à l'intérieur dans le `<svg>` imbriqué de la vitrine, comme les clients ; trajets sur le trottoir avec la transition CSS de 30 s existante pour l'équipe du chantier ; employés tournés vers le client quand il y en a un).
- [ ] **Step 4:** `npx vitest run --maxWorkers=4 src/content` + typecheck. **Step 5: Commit** `feat(ville): le personnel arrive, ouvre, se relaie et ferme (rendu)`.

---

### Task 8: Rendu de la terrasse et de la file

**Files:**
- Create: `src/content/shop-terrace.tsx`, `src/content/shop-queue.tsx`
- Modify: `src/content/city-shops-life.tsx`

- [ ] **Step 1: Tests jsdom** : terrasse pluie → aucun nœud table ; `open` avec `tables = 3` → 3 tables + chaises ; `umbrellas` → parasols ; réduit : au plus une personne par table ; boîte ouverte → cordon + 2 videurs + file (réduit : 3 immobiles) ; hors ouverture → rien.
- [ ] **Step 2–3:** échec, rendu (tables rondes + 2 chaises sur le trottoir devant la vitrine ; montage/démontage animé par `progress` : tables glissent depuis la porte ; serveur = un membre du personnel qui sort ; videurs `suit` noirs bras croisés ; file de `PersonSprite` alignés vers le côté tiré).
- [ ] **Step 4–5:** vert + commit `feat(ville): terrasses, cordon, videurs et file (rendu)`.

---

### Task 9: Rendu du déménagement

**Files:**
- Create: `src/content/moving-truck.tsx`
- Modify: `src/content/city-shops-life.tsx`, `src/content/shop-interiors.tsx` (affichage de l'intérieur par tranches selon `interiorStage` + `progress` : `before` = intérieur de l'ancien type avec une fraction de mobilier cachée croissante, `empty`, `after` = intérieur du nouveau type révélé par tranches ; implémentation sans nouveaux `id` SVG : rogner par rectangles `<rect>` de masque réutilisés ou `clip-path` inline sans id, comme dans 1b-iv-a)

- [ ] **Step 1: Tests jsdom** : `truck-arrives` → camion présent ; `carry-out` → porteurs avec un rectangle de meuble ; `leave` → camion sorti du champ ; réduit : camion garé hayon ouvert + un porteur figé ; `to-sale` : jamais de `carry-in` ; un seul camion pour deux locaux le même jour (le second décalé de 2 h : tester `movingPlan(..., offsetMin)` utilisé par la couche avec `offsetMin = 120` pour le deuxième local qui change le même jour).
- [ ] **Step 2–3:** échec, rendu (camion `vehicle` existant de `city-sprites.tsx` ou nouveau sprite de déménagement blanc/bleu ; déménageurs `worker` avec casque ; meuble lourd = deux à trois porteurs en file indienne).
- [ ] **Step 4–5:** vert + commit `feat(ville): camion et déménageurs (rendu)`.

---

### Task 10: Plafond global, fiche WikiHow, vérification, PR

**Files:**
- Modify: `src/content/city-shops-life.tsx` (plafond ≈ 40 sprites animés : tri par priorité), `src/**/entries.ts` (fiche `bibliotheque-v24`), éventuellement tests du guide (liste d'ids)
- Docs : mettre à jour `docs/superpowers/specs/2026-10-10-bibliotheque-commerces-b-design.md` si un écart a été assumé.

- [ ] **Step 1:** Test du plafond : scène avec beaucoup de locaux → jamais plus de 40 nœuds animés actifs ; les clients de terrasse partent d'abord.
- [ ] **Step 2:** Fiche WikiHow `bibliotheque-v24` (didactique : à quoi ça sert, d'où viennent les données, comment ça marche, limites ; étapes `text + how + tip`) ; `v23` inchangée.
- [ ] **Step 3:** Suites complètes : `npx vitest run --maxWorkers=4`, `npx tsc --noEmit` (ou le script de typecheck du dépôt), `npm run build`.
- [ ] **Step 4:** Vérification à l'œil dans Chrome via un banc Vite local (reprendre `.superpowers/harness-ville/` s'il existe dans un autre worktree, sinon écrire un banc minimal qui monte `SceneCity` avec `?h=&id=&rain=`) : personnel qui arrive et ouvre le rideau, relais, gestes visibles, terrasse par temps sec puis sous la pluie, boîte de nuit à 0 h, camion et déménageurs un jour de changement. Capturer 3-4 captures.
- [ ] **Step 5:** Relecture finale de toute la branche (`superpowers:requesting-code-review`), corrections, push, **PR + fusion sans demander** (routine du projet), puis `npm run preprod` (jamais `promouvoir`), retirer jonction `node_modules` et `.env.local` du worktree, supprimer worktree et branche, mettre à jour la mémoire du projet.
