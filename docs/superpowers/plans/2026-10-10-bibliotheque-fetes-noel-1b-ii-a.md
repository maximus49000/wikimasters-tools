# Bibliothèque, vague 1b-ii-a : fêtes, père Noël, feux d'artifice — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** poser le socle des fêtes en données, le père Noël du 24 décembre (un passage par quart d'heure d'horloge) et les feux d'artifice du Nouvel An et du 14 juillet dans la scène Ville.

**Architecture :** `calendar.ts` expose une table `FESTIVITIES` et `DayContext.festivities`. `events.ts` apprend à pondérer un événement selon les fêtes actives (`festWeight`) et à écarter les événements de ciel pendant un passage du père Noël. `city/santa.ts` est un moteur pur et déterministe (sans état) ; `santa-layer.tsx` le dessine avec sa propre boucle d'animation, dans `CityLifeLayer`.

**Tech Stack :** TypeScript, React (SVG), Vitest + jsdom, WXT. Aucun nouveau paquet.

**Spec :** `docs/superpowers/specs/2026-10-10-bibliotheque-fetes-noel-design.md` (et, au-dessus, `2026-10-09-bibliotheque-ville-vivante-design.md`).

## Global Constraints

- Code et commentaires en français, au registre du code voisin (commentaires courts qui expliquent le pourquoi). Aucun `Math.random` : tout est déterministe (`mulberry32`, `hashString`, `Math.imul(...)` comme dans `city/events.ts`).
- Aucun état enregistré : l'état de la pièce reste v5, aucune migration, aucune clé `wmt:` nouvelle.
- Mouvement réduit : aucune animation, aucune boucle de traversée (voir Task 4). Pièce sans fenêtre : `CityLifeLayer` n'est déjà pas monté, rien à faire de plus.
- Pas d'id SVG fixe (utiliser `useId` comme `city-life.tsx`).
- Calendrier français uniquement. La date est celle de l'appareil (`city.day.date`), même si l'heure du ciel est forcée.
- Tests : `npx vitest run --maxWorkers=4` (jamais en parallèle total). Typecheck : `npx tsc --noEmit` (ou le script `npm run typecheck` s'il existe). Build : `npm run build`.
- Un commit par tâche, message `type(ville): ...`, terminé par la ligne `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Travail dans le worktree `C:\Users\maxim\Downloads\Wikimasters-fetes` (branche `feat/bibliotheque-fetes-noel`). Ne jamais toucher au dossier `Wikimasters tools` (autre session possible).
- Écart assumé par rapport à la spec ville vivante : `DayContext.festivities` porte `{id, hours}` sans `progress` (aucun consommateur avant 1b-iii).
- Écart assumé : pas de pic de feux d'artifice « autour de minuit » ; le poids fort du Nouvel An s'applique sur toute la plage 21 h 30 → 0 h 30.

---

### Task 0: Mise en place du worktree

**Files:** aucun fichier du dépôt.

- [ ] **Step 1 : jonction node_modules et .env.local**

```powershell
cd C:\Users\maxim\Downloads\Wikimasters-fetes
New-Item -ItemType Junction -Path node_modules -Target "C:\Users\maxim\Downloads\Wikimasters tools\node_modules"
Copy-Item "C:\Users\maxim\Downloads\Wikimasters tools\.env.local" .env.local
```

- [ ] **Step 2 : référence des tests** — `npx vitest run tests/core/library/city-calendar.test.ts tests/core/library/city-events.test.ts --maxWorkers=4` doit passer. (`.env.local` et la jonction sont ignorés par git ; ils seront retirés à la fin, Task 6.)

---

### Task 1: Table des fêtes et `DayContext.festivities`

**Files:**
- Modify: `src/core/library/city/calendar.ts`
- Modify: `tests/core/library/city-intensity.test.ts` (littéral `DayContext` à compléter)
- Test: `tests/core/library/city-calendar.test.ts`

**Interfaces:**
- Produces (dans `calendar.ts`) :
  - `export type FestivityId = 'new-year' | 'bastille' | 'christmas-eve';`
  - `export type Festivity = { id: FestivityId; hours: readonly (readonly [number, number])[] };` (plages `[début, fin)` en minutes ; une plage ne passe pas minuit)
  - `export const FESTIVITIES: readonly { id: FestivityId; m: number; d: number; hours: Festivity['hours'] }[]`
  - `export function festivitiesOn(date: YMD): Festivity[]`
  - `export function activeFestivities(list: readonly Festivity[], minute: number): FestivityId[]` (ids dont une plage contient `minute`, sans doublon)
  - `DayContext` gagne `festivities: Festivity[]`.

Table (chaque ligne = un jour de l'année ; un id peut avoir plusieurs lignes) :
`new-year` 31/12 `[[1290,1440]]` ; `new-year` 01/01 `[[0,30]]` ; `bastille` 14/07 `[[1260,1440]]` ; `christmas-eve` 24/12 `[[0,1440]]` ; `christmas-eve` 25/12 `[[0,720]]`.

- [ ] **Step 1 : tests qui échouent** (à ajouter à `city-calendar.test.ts`)

```ts
import { FESTIVITIES, activeFestivities, festivitiesOn } from '../../../src/core/library/city/calendar';

describe('fêtes', () => {
  it('liste les fêtes d’un jour', () => {
    expect(festivitiesOn({ y: 2026, m: 12, d: 24 }).map((f) => f.id)).toEqual(['christmas-eve']);
    expect(festivitiesOn({ y: 2026, m: 12, d: 31 }).map((f) => f.id)).toEqual(['new-year']);
    expect(festivitiesOn({ y: 2027, m: 1, d: 1 }).map((f) => f.id)).toEqual(['new-year']);
    expect(festivitiesOn({ y: 2026, m: 7, d: 14 }).map((f) => f.id)).toEqual(['bastille']);
    expect(festivitiesOn({ y: 2026, m: 10, d: 10 })).toEqual([]);
  });
  it('active une fête seulement dans ses heures', () => {
    const eve = festivitiesOn({ y: 2026, m: 12, d: 31 });
    expect(activeFestivities(eve, 1289)).toEqual([]);
    expect(activeFestivities(eve, 1290)).toEqual(['new-year']);
    const jan = festivitiesOn({ y: 2027, m: 1, d: 1 });
    expect(activeFestivities(jan, 29)).toEqual(['new-year']);
    expect(activeFestivities(jan, 30)).toEqual([]);
    const noel25 = festivitiesOn({ y: 2026, m: 12, d: 25 });
    expect(activeFestivities(noel25, 719)).toEqual(['christmas-eve']);
    expect(activeFestivities(noel25, 720)).toEqual([]);
  });
  it('dayContext porte les fêtes du jour (année bissextile comprise)', () => {
    expect(dayContext({ y: 2026, m: 12, d: 24 }, []).festivities.map((f) => f.id)).toEqual(['christmas-eve']);
    expect(dayContext({ y: 2028, m: 2, d: 29 }, []).festivities).toEqual([]);
  });
  it('la table ne contient que des dates valides', () => {
    for (const f of FESTIVITIES) expect(new Date(Date.UTC(2028, f.m - 1, f.d)).getUTCDate()).toBe(f.d);
  });
});
```

- [ ] **Step 2 :** `npx vitest run tests/core/library/city-calendar.test.ts` → FAIL (exports manquants).
- [ ] **Step 3 : implémentation** dans `calendar.ts` : types, table, `festivitiesOn` (filtre `FESTIVITIES` sur `m`/`d`, renvoie `{id, hours}`), `activeFestivities`, et `dayContext` renvoie `festivities: festivitiesOn(date)`. Compléter le littéral `DayContext` de `tests/core/library/city-intensity.test.ts` avec `festivities: []`, ainsi que tout autre littéral signalé par `tsc`.
- [ ] **Step 4 :** `npx vitest run tests/core/library --maxWorkers=4` et `npx tsc --noEmit` → verts.
- [ ] **Step 5 : commit** `feat(ville): table des fêtes et fêtes du jour dans DayContext`.

---

### Task 2: Événements pondérés par les fêtes (feux d'artifice)

**Files:**
- Modify: `src/core/library/city/events.ts`
- Test: `tests/core/library/city-events.test.ts`, `tests/content/use-city-events.test.tsx` (littéraux `EventConditions` à compléter)

**Interfaces:**
- Consumes : `activeFestivities`, `FestivityId` (Task 1).
- Produces (dans `events.ts`) :
  - `EventDef` gagne `festWeight?: Readonly<Partial<Record<FestivityId, number>>>`.
  - `EventConditions` gagne `fests: readonly FestivityId[]`.
  - `export function weightOf(def: EventDef, c: EventConditions): number` = max du poids de base et des `festWeight` des fêtes actives.
  - `eventConditions` renseigne `fests: activeFestivities(city.day.festivities, city.minutes)`.
  - `conditionsKey` ajoute `|` + ids triés joints par `+` ; `pickWeighted` utilise `weightOf`.
  - Le feu d'artifice : `festWeight: { 'new-year': 10, bastille: 5 }`.

- [ ] **Step 1 : tests qui échouent** (dans `city-events.test.ts`, en réutilisant les aides déjà présentes dans ce fichier pour construire des conditions/entrées ; lire le fichier d'abord)

```ts
it('le poids d’un événement monte pendant sa fête', () => {
  const fw = defOf('fireworks');
  const base = { daylight: 0, wet: false, workday: true, traffic: 0.5, walkers: 0.5 };
  expect(weightOf(fw, { ...base, fests: [] })).toBe(0.25);
  expect(weightOf(fw, { ...base, fests: ['new-year'] })).toBe(10);
  expect(weightOf(fw, { ...base, fests: ['bastille'] })).toBe(5);
  expect(weightOf(defOf('plane'), { ...base, fests: ['new-year'] })).toBe(3);
});
it('la clé de conditions change à l’entrée d’une fête', () => {
  const base = { daylight: 0, wet: false, workday: true, traffic: 0.5, walkers: 0.5 };
  expect(conditionsKey({ ...base, fests: [] })).not.toBe(conditionsKey({ ...base, fests: ['new-year'] }));
});
it('le Nouvel An donne beaucoup plus de feux d’artifice qu’un soir ordinaire (même graine, 40 grands créneaux)', () => {
  // Compter les événements `fireworks` sur 40 grands créneaux de nuit avec fests [] puis ['new-year'] (mêmes graine, largeur, vehicles=[], speeds via laneSpeeds(seed)).
  // Attendu : count(new-year) > 3 × count(ordinaire) et count(new-year) >= 10.
});
it('pas de feu d’artifice sous la pluie, même le soir de fête', () => {
  // Mêmes entrées avec wet: true et fests ['new-year'] → aucun `fireworks`.
});
```
Compléter les deux derniers tests avec du code complet en s'inspirant des tests existants de `cityEventSchedule` du même fichier (ne pas laisser de commentaire à la place du corps).

- [ ] **Step 2 :** `npx vitest run tests/core/library/city-events.test.ts` → FAIL.
- [ ] **Step 3 : implémentation** comme décrit ; `eligible` ne change pas (le feu d'artifice reste éligible tous les soirs, au poids de base). Corriger les littéraux `EventConditions` des tests existants (`fests: []`).
- [ ] **Step 4 :** `npx vitest run tests/core/library tests/content/use-city-events.test.tsx --maxWorkers=4` + `tsc` → verts.
- [ ] **Step 5 : commit** `feat(ville): feux d’artifice pondérés par le Nouvel An et la Fête nationale`.

---

### Task 3: Moteur du père Noël (`city/santa.ts`) et exclusion du ciel

**Files:**
- Create: `src/core/library/city/santa.ts`
- Modify: `src/core/library/city/events.ts` (exclusion des événements de ciel)
- Create: `tests/core/library/city-santa.test.ts`
- Test: `tests/core/library/city-events.test.ts`

**Interfaces:**
- Consumes : `FestivityId` (Task 1), `EventConditions.fests` (Task 2), `WORLD_MARGIN`, `hashString`, `mulberry32` de `../scene-world`.
- Produces (dans `santa.ts` ; ne PAS importer `events.ts`, `events.ts` importe `santa.ts`) :

```ts
export const SANTA_PERIOD_S = 900;   // un passage par quart d'heure d'horloge murale
export const SANTA_WINDOW_S = 75;    // durée d'un passage, simple ou avec livraison
export const SANTA_DARK = 0.3;       // identique à DARK de events.ts (un test le vérifie)
export type SantaPass = { tranche: number; start: number; end: number; deliver: boolean; dir: 1 | -1; skyY: number; roofRoll: number };
export type SantaRoof = { cx: number; y: number; w: number; lamp: { x: number; y: number } | null };
export type SantaPose = { x: number; y: number; dir: 1 | -1; landed: boolean; santa: 'aboard' | 'walking' | 'hidden'; windowLit: boolean };
export const santaOn = (fests: readonly string[], daylight: number): boolean => ...; // 'christmas-eve' actif ET daylight < SANTA_DARK
export function santaPassFor(tranche: number, seed: number): SantaPass;
export function santaWindowsIn(t0: number, t1: number, seed: number): { start: number; end: number }[]; // fenêtres qui chevauchent [t0, t1)
export function santaRoof(pass: SantaPass, facades: readonly { x: number; w: number; h: number; far: boolean; lamps: readonly { x: number; y: number }[] }[], ground: number, width: number): SantaRoof | null;
export function santaPoseAt(pass: SantaPass, roof: SantaRoof | null, t: number, width: number, height: number): SantaPose | null; // null hors fenêtre
```

Règles :
- `santaPassFor` : `rng = mulberry32(seed ^ hashString('santa') ^ Math.imul(tranche + 1, 2654435761))`, tirages TOUJOURS dans cet ordre : `offset, deliverRoll, dirRoll, yRoll, roofRoll`. `start = tranche * 900 + offset * (900 - 75)`, `end = start + 75`, `deliver = deliverRoll < 1/3`, `dir = dirRoll < 0.5 ? 1 : -1`, `skyY = 0.08 + yRoll * 0.12` (fraction de la hauteur).
- `santaRoof` : candidats = immeubles `!far`, `w >= 30`, centre `x + w/2` dans `[40, width - 40]` ; choisi par `roofRoll` ; `y = ground - h` ; `lamp` = fenêtre (`lamps`) tirée parmi les 3 plus hautes de l'immeuble (par `roofRoll` recomposé, déterministe) ou `null` s'il n'y en a pas ; `null` si aucun candidat.
- `santaPoseAt` : `p = (t - start) / 75`, `null` si `p < 0` ou `p >= 1`. Passage simple, OU livraison sans toit (`roof === null`) : `x` traverse de `-WORLD_MARGIN` à `width + WORLD_MARGIN` (sens `dir`), `y = skyY * height + 4 * sin(p * 6π)`, `landed=false`, `santa='aboard'`, `windowLit=false`. Livraison avec toit, avec `edgeX` = bord d'entrée (`-WORLD_MARGIN` si `dir>0` sinon `width + WORLD_MARGIN`), `exitX` = bord opposé, `ease` = smoothstep :
  - `p < 0.25` : approche, `x` de `edgeX` à `roof.cx`, `y` de `skyY*height` à `roof.y` (ease) ;
  - `0.25 ≤ p < 0.30` : posé (`landed`, `x=roof.cx`, `y=roof.y`, `aboard`) ;
  - `0.30 ≤ p < 0.40` : `walking` (traîneau posé) ; `0.40 ≤ p < 0.60` : `hidden`, `windowLit=true` ; `0.60 ≤ p < 0.70` : `walking` ; `0.70 ≤ p < 0.75` : posé, `aboard` ;
  - `p ≥ 0.75` : envol, `x` de `roof.cx` à `exitX`, `y` de `roof.y` à `skyY*height - 10` (ease), `landed=false`.

Exclusion dans `events.ts` : dans `cityEventSchedule`, après le calcul de `start`/`end` d'un candidat et avant le plafond, `if (blocks.some((w) => w.start < end && start < w.end) && def.layer === 'sky') continue;` avec `const blocks = santaOn(cond.fests, cond.daylight) ? santaWindowsIn(t0, t0 + HYPER_S, seed) : [];` calculé une fois avant la boucle (les tirages du créneau restent faits avant le `continue`).

- [ ] **Step 1 : tests qui échouent** (`city-santa.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { DARK } from '../../../src/core/library/city/events';
import { SANTA_DARK, SANTA_PERIOD_S, SANTA_WINDOW_S, santaOn, santaPassFor, santaPoseAt, santaRoof, santaWindowsIn } from '../../../src/core/library/city/santa';

const SEED = 4242;
const facades = [
  { x: 100, w: 40, h: 120, far: false, lamps: [{ x: 104, y: 60 }, { x: 114, y: 60 }, { x: 104, y: 74 }] },
  { x: 300, w: 20, h: 90, far: false, lamps: [] },
  { x: 500, w: 50, h: 100, far: true, lamps: [] },
];

describe('père Noël', () => {
  it('SANTA_DARK reste égal au seuil de nuit des événements', () => expect(SANTA_DARK).toBe(DARK));
  it('n’est actif que la nuit de la fête', () => {
    expect(santaOn(['christmas-eve'], 0.1)).toBe(true);
    expect(santaOn(['christmas-eve'], 0.3)).toBe(false);
    expect(santaOn([], 0)).toBe(false);
  });
  it('un passage par quart d’heure, dans sa tranche, déterministe', () => {
    for (let n = 1000; n < 1100; n++) {
      const a = santaPassFor(n, SEED);
      expect(santaPassFor(n, SEED)).toEqual(a);
      expect(a.start).toBeGreaterThanOrEqual(n * SANTA_PERIOD_S);
      expect(a.end).toBeLessThanOrEqual((n + 1) * SANTA_PERIOD_S);
      expect(a.end - a.start).toBe(SANTA_WINDOW_S);
    }
  });
  it('environ un passage sur trois livre', () => {
    let deliver = 0;
    for (let n = 0; n < 600; n++) if (santaPassFor(n, SEED).deliver) deliver++;
    expect(deliver / 600).toBeGreaterThan(0.25);
    expect(deliver / 600).toBeLessThan(0.42);
  });
  it('liste les fenêtres qui chevauchent un intervalle', () => {
    const t0 = 1000 * SANTA_PERIOD_S;
    const w = santaWindowsIn(t0, t0 + 1200, SEED);
    expect(w.length).toBeGreaterThanOrEqual(1);
    expect(w.length).toBeLessThanOrEqual(3);
    for (const x of w) expect(x.start < t0 + 1200 && t0 < x.end).toBe(true);
  });
  it('choisit un toit visible (immeuble proche assez large) ou aucun', () => {
    const roof = santaRoof(santaPassFor(1, SEED), facades, 200, 800);
    expect(roof).not.toBeNull();
    expect(roof!.cx).toBe(120); // seul candidat : x 100, w 40
    expect(roof!.y).toBe(80);
    expect(santaRoof(santaPassFor(1, SEED), [facades[1]!, facades[2]!], 200, 800)).toBeNull();
  });
  const deliverPass = (() => { for (let n = 0; ; n++) { const p = santaPassFor(n, SEED); if (p.deliver) return p; } })();
  const roof = santaRoof(deliverPass, facades, 200, 800)!;
  const at = (p: number) => santaPoseAt(deliverPass, roof, deliverPass.start + p * SANTA_WINDOW_S, 800, 400);
  it('hors fenêtre : rien', () => {
    expect(santaPoseAt(deliverPass, roof, deliverPass.start - 1, 800, 400)).toBeNull();
    expect(santaPoseAt(deliverPass, roof, deliverPass.end, 800, 400)).toBeNull();
  });
  it('livraison : se pose sur le toit, disparaît, allume la fenêtre, repart', () => {
    expect(at(0.27)).toMatchObject({ landed: true, x: roof.cx, y: roof.y, santa: 'aboard', windowLit: false });
    expect(at(0.35)!.santa).toBe('walking');
    expect(at(0.5)).toMatchObject({ santa: 'hidden', windowLit: true, landed: true });
    expect(at(0.65)!.santa).toBe('walking');
    expect(at(0.72)).toMatchObject({ landed: true, santa: 'aboard', windowLit: false });
    expect(at(0.95)!.landed).toBe(false);
    expect(at(0.1)!.landed).toBe(false);
  });
  it('sans toit, une livraison se rabat sur un passage simple', () => {
    const p = santaPoseAt(deliverPass, null, deliverPass.start + 0.5 * SANTA_WINDOW_S, 800, 400)!;
    expect(p).toMatchObject({ landed: false, santa: 'aboard', windowLit: false });
  });
  it('un passage simple traverse la scène de bord à bord', () => {
    const simple = (() => { for (let n = 0; ; n++) { const p = santaPassFor(n, SEED); if (!p.deliver) return p; } })();
    const a = santaPoseAt(simple, null, simple.start + 0.01, 800, 400)!;
    const b = santaPoseAt(simple, null, simple.end - 0.01, 800, 400)!;
    expect(Math.sign(b.x - a.x)).toBe(simple.dir);
    expect(a.x).toBeLessThan(0 + 1 + (simple.dir < 0 ? 900 : 0));
  });
});
```
(Le dernier `expect` est volontairement lâche : l'implémenteur le remplace par une assertion exacte : le départ est hors de l'écran, l'arrivée aussi.) Ajouter à `city-events.test.ts` : « pendant un passage du père Noël, aucun événement de ciel n'est tiré ; hors fêtes, le programme est inchangé » (même graine, 40 grands créneaux, `fests ['christmas-eve']` + `daylight 0`, aucun événement `layer === 'sky'` ne chevauche une fenêtre de `santaWindowsIn`).

- [ ] **Step 2 :** `npx vitest run tests/core/library/city-santa.test.ts` → FAIL.
- [ ] **Step 3 : implémentation** de `santa.ts` et de l'exclusion dans `events.ts`.
- [ ] **Step 4 :** `npx vitest run tests/core/library --maxWorkers=4` + `tsc` → verts. Programmes inchangés hors fêtes (les tests existants de `city-events.test.ts` passent sans modification).
- [ ] **Step 5 : commit** `feat(ville): moteur du père Noël et exclusion des événements de ciel`.

---

### Task 4: Sprite, calque et branchement dans la scène Ville

**Files:**
- Create: `src/content/santa-sprite.tsx`
- Create: `src/content/santa-layer.tsx`
- Modify: `src/content/city-life.tsx` (monter `SantaLayer` dans le groupe `data-city-events-back`, après les événements de ciel)
- Test: `tests/content/santa-layer.test.tsx`

**Interfaces:**
- Consumes : `santaOn`, `santaPassFor`, `santaPoseAt`, `santaRoof`, `SANTA_PERIOD_S` (Task 3) ; `eventConditions` n'est pas nécessaire : le calque reçoit `fests` calculées par `activeFestivities(city.day.festivities, city.minutes)` dans `CityLifeLayer`.
- Produces :
  - `export function SantaSprite({ sky, still, santa, lit }: { sky: Sky; still: boolean; santa: SantaPose['santa']; lit: boolean }): ReactElement` (traîneau rouge à patins dorés, cinq rennes sur deux rangs reliés par un trait, hotte, traînée scintillante derrière, clochettes ; cohérent avec `tone(c, sky)` de `city-sprites` ; une seule animation SMIL `<animate>` par élément scintillant, aucune si `still` ; `santa==='hidden'` ne dessine pas le personnage ; `santa==='walking'` le dessine debout à côté du traîneau avec sa hotte). Dessin à l'origine : l'ancre est le bas du traîneau, centré, orienté vers `+x` (le calque applique `scale(dir, 1)`).
  - `export function SantaLayer(props: { width: number; height: number; seed: number; sky: Sky; facades: Facade[]; ground: number; fests: readonly string[]; daylight: number; still: boolean; frozenT: number }): ReactElement | null` : rend `null` si `!santaOn(fests, daylight)`. Sinon un `<g data-santa="">` : à chaque image (`useWallClockLoop`, comme `city-life.tsx`), calcule `tranche = Math.floor(t / SANTA_PERIOD_S)`, `pass = santaPassFor(tranche, seed)` (mémoïsé tant que la tranche ne change pas), `roof = pass.deliver ? santaRoof(...) : null`, `pose = santaPoseAt(...)` et écrit : `transform="translate(x y) scale(dir 1)"`, `display` (`none` hors fenêtre) ; le sprite est re-rendu seulement quand `pose.santa` ou `windowLit` change (état React minimal). Fenêtre allumée : petit `<rect>` jaune 5 × 7 sur `roof.lamp` (hors du groupe transformé), visible seulement si `pose.windowLit`.
  - Mouvement réduit (`still`) : pas de boucle ; pose figée au `frozenT` : n'affiche QUE, pour la tranche de `frozenT`, le traîneau posé sur le toit (`landed`, `santa: 'aboard'`) si `pass.deliver && roof`, sinon rien (`display: none`).

- [ ] **Step 1 : tests qui échouent** (`santa-layer.test.tsx`, avec les utilitaires de test de `use-city-events.test.tsx` / `city-events-layer.test.tsx` pour monter un `<svg>` ; lire ces fichiers d'abord)
  - rien n'est rendu hors du 24 décembre de nuit (`fests=[]`, ou `daylight=0.5`) ;
  - le 24 décembre de nuit, `[data-santa]` existe ;
  - à un instant dans une fenêtre de livraison (utiliser `vi.setSystemTime` sur `deliverPass.start + 0.27 * 75` s), le calque est visible, positionné sur le toit (`translate(cx roof.y)` attendu) ;
  - à `+0.5` : `[data-santa-figure]` absent et le rectangle de fenêtre présent ;
  - mouvement réduit (`matchMedia` simulé) : seulement le traîneau posé quand la tranche de `frozenT` livre sur un toit, sinon `display: none`.
- [ ] **Step 2 :** `npx vitest run tests/content/santa-layer.test.tsx` → FAIL.
- [ ] **Step 3 : implémentation** ; dans `city-life.tsx`, calculer `const fests = useMemo(() => activeFestivities(city.day.festivities, city.minutes), [city.day, city.minutes])` et monter `<SantaLayer ... facades={facades} ground={metrics.ground} daylight={city.daylight} still={still} frozenT={frozen.current!} />` juste après `{of((e) => e.layer === 'sky' ...).map(eventNode)}`.
- [ ] **Step 4 :** `npx vitest run tests/content --maxWorkers=4` + `tsc` → verts (aucune régression sur `city-events-layer`).
- [ ] **Step 5 : commit** `feat(ville): le père Noël dans le ciel de la scène Ville`.

---

### Task 5: Fiche WikiHow `bibliotheque-v25`

**Files:**
- Modify: `src/core/whats-new/entries.ts` (+ tests qui comptent/valident les entrées, s'il y en a : lancer `npx vitest run tests/core/whats-new --maxWorkers=4`)

Lire d'abord l'entrée `bibliotheque-v24` (ligne ~1766) et en suivre exactement la forme (champs, ordre, étapes `text` + `how` + `tip`, comportement « id jamais annoncé »).

Contenu (français, didactique : à quoi ça sert, d'où viennent les données, comment ça marche, limites) :
- Titre : « Père Noël et feux d'artifice dans la ville ».
- Étape 1 : le calendrier. Texte : la scène Ville connaît quelques fêtes d'après la date de l'appareil. Comment : rien à régler, la date de l'appareil suffit ; l'heure du ciel (jour, nuit, manuelle) ne change pas la date. Astuce : pour voir une fête, il faut l'attendre ou changer la date de l'appareil.
- Étape 2 : le père Noël. Le 24 décembre, de la nuit tombée à l'aube (et à l'aube du 25), un traîneau passe toutes les 15 minutes d'horloge, le même dans toutes les fenêtres ; environ une fois sur trois il se pose sur un toit, le père Noël disparaît derrière la cheminée, une fenêtre s'allume, puis il repart. Limite : sans fenêtre dans la pièce, rien ne se voit ; en mouvement réduit seul un traîneau posé est montré.
- Étape 3 : les feux d'artifice. Beaucoup plus fréquents le soir du 31 décembre (jusqu'à 0 h 30) et le soir du 14 juillet ; jamais sous la pluie, sans report.

- [ ] **Step 1 :** écrire l'entrée, lancer les tests des nouveautés/WikiHow.
- [ ] **Step 2 : commit** `docs(wikihow): fiche bibliotheque-v25 (fêtes, père Noël, feux d'artifice)`.

---

### Task 6: Vérification complète et captures de validation

**Files:** hors dépôt (`.superpowers/` est ignoré par git).

- [ ] **Step 1 : suite complète** — `npx vitest run --maxWorkers=4`, `npx tsc --noEmit`, `npm run build`. Tout doit être vert (les erreurs non gérées préexistantes du mock géoloc `library-weather-ui` sont connues, ne pas les corriger ici). Citer les résultats exacts.
- [ ] **Step 2 : banc Vite** — copier le banc existant `C:\Users\maxim\Downloads\Wikimasters-bibliotheque\.superpowers\harness-ville` (sinon `..\Wikimasters-commerces-b\.superpowers\harness-ville`) vers `.superpowers\harness-ville` du worktree ; lire son code puis lui ajouter les paramètres d'URL `date=AAAA-MM-JJ` (date forcée dans `city.day`, via `dayContext`) et `now=<secondes>` (instant forcé pour `Date.now()` : sert à tomber dans la fenêtre d'une livraison du père Noël ; `santaPassFor` donne l'instant exact), en plus de `h=` et `rain=` existants. Le démarrer sur un port libre (jamais 5191, 5193, 5207).
- [ ] **Step 3 : captures** (navigateur intégré, `mcp__Claude_Browser__*`, ou Playwright/Chrome si disponible), enregistrées dans `.superpowers\captures-fetes\` : (a) 24/12 à 22 h 30, traîneau en vol ; (b) 24/12, traîneau posé sur un toit ; (c) 24/12, père Noël caché derrière la cheminée avec la fenêtre allumée ; (d) 31/12 à 23 h 50, feux d'artifice ; (e) 14/07 à 22 h 30, feux d'artifice ; (f) 10/10 à 22 h 30 (jour ordinaire : aucun père Noël). Regarder chaque capture : signaler honnêtement tout défaut visuel (traîneau coupé, mal orienté, flottant, dessin illisible) et corriger avant de rendre la main.
- [ ] **Step 4 : relecture finale** de tout le diff de la branche (`git diff origin/main...HEAD`) : cohérence des noms, aucun `TODO`, aucun `console.log`, tests déterministes.
- [ ] **Step 5 : nettoyage** — retirer la jonction `node_modules` (`cmd /c rmdir node_modules`) et `.env.local` du worktree seulement APRÈS que l'utilisateur a validé les captures (le coordinateur le dira) ; arrêter le serveur Vite du banc. Ne PAS ouvrir de PR, ne PAS fusionner, ne PAS lancer de pré-prod : le coordinateur s'en charge après validation des captures.
- [ ] **Step 6 :** rapporter : liste des commits, résultats exacts des commandes, chemins des captures, écarts par rapport au plan.
