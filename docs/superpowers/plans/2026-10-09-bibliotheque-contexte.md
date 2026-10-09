# Bibliothèque 6d — Réactions au contexte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les animaux (chat, chien, robot) réagissent à la nuit, au soleil, à la pluie et à l'orage.

**Architecture:** Un objet pur `PetContext` (nuit, lune, météo, orage, fin de pluie, cases de soleil) est construit par l'interface (hook `usePetContext`, 1 Hz pour le soleil) et passé à `runner.step` puis à `BrainEnv.ctx`. Deux mécanismes : biais de poids dans `nextPlan` (nuit, soleil, pluie, secouement, hurlement) et interruption à l'orage dans `runner` (plans de réaction `storm.ts`, scène `huddle` à trois). Sans `ctx`, le comportement est identique à avant.

**Tech Stack:** TypeScript, React, Vitest (`npx vitest run <fichier> --maxWorkers=4`), SVG.

**Spec:** `docs/superpowers/specs/2026-10-09-bibliotheque-contexte-design.md`

## Global Constraints

- Moteur pur dans `src/core/library/pets/` : aucune dépendance React, aucun `Date.now()` (l'instant est passé en paramètre).
- Sans `ctx` : sortie de `nextPlan`/`step` identique à avant (les tests existants restent verts, sans modification).
- Mouvement réduit (`still`) : aucun déplacement ; `cower` (ou `shortcircuit` pour le robot) sur place.
- L'état reste v5, aucune migration. Les nouveaux noms d'action sont ajoutés à `PET_ACTIONS` (schéma zod de `library-book.ts`).
- Nouvelles actions : `sunbathe`, `howl`, `shake`, `umbrella`, `shortcircuit`, `reboot` ; nouvelle scène `huddle`. `sunbathe` se dessine comme `sleep` (pose `sleep`).
- Durées : `sunbathe` 20-45 s, `howl` 4-6 s, `umbrella` 8-15 s, `shake` 2-3 s, `shortcircuit` 3 s, `reboot` 1,5 s ; réaction à l'orage : délai 0,5-4 s (chat/chien), maintien par tranches de 8-15 s, au plus 60 s après le début de l'orage.
- Poids : nuit sommeil/`standby`/`charge` ×4, `sniff|scan|play|perch|scratch` ×0,5 (aussi sous pluie/bruine) ; `howl` 1,5 ; `sunbathe` 2,5 ; `umbrella` 2 ; `shake` 3.
- Texte de l'interface en français, tests nommés en français, style de commentaires existant (français, concis).
- Fiche WikiHow : `bibliotheque-v18` (une étape par famille, champs `details` : À quoi ça sert / Comment ça marche / D'où viennent les données / Limites).
- Travail dans le worktree `C:\Users\maxim\Downloads\Wikimasters-bibliotheque`, branche `feat/bibliotheque-contexte`.

---

### Task 1: Types, schéma, poses et silhouettes

**Files:**
- Modify: `src/core/library/library-types.ts:54-59` (PET_ACTIONS, PAIR_SCENES)
- Modify: `src/core/library/pets/runner.ts:10` (type `Pose`) et `poseOf` (l.~48)
- Modify: `src/core/library/light/pet-boxes.ts:7-14` (table `SHAPE`)
- Modify: `src/content/dog-sprite.tsx`, `src/content/robot-sprite.tsx` (repli provisoire : voir Step 4)
- Modify: `docs/superpowers/specs/2026-10-09-bibliotheque-contexte-design.md` (contexte : `storm`, cases de soleil sans ombre de meuble)
- Test: `tests/core/library/library-pets.test.ts`, `tests/core/library/light-pet-boxes.test.ts`

**Interfaces:**
- Produces: `PetAction` inclut `'sunbathe' | 'howl' | 'shake' | 'umbrella' | 'shortcircuit' | 'reboot'` ; `PairScene` inclut `'huddle'` ; `Pose` inclut `'howl' | 'shake' | 'umbrella' | 'shortcircuit' | 'reboot'` (PAS `sunbathe` : `poseOf` le convertit en `'sleep'`).

- [ ] **Step 1: Test qui échoue (schéma + poseOf + silhouette)**

Dans `tests/core/library/library-pets.test.ts`, ajouter (reprendre les imports existants du fichier ; ajouter ceux qui manquent) :

```ts
import { PET_ACTIONS, PAIR_SCENES } from '../../../src/core/library/library-types';
import { poseOf } from '../../../src/core/library/pets/runner';

describe('actions du contexte (6d)', () => {
  it('connaît les nouvelles actions et la scène huddle', () => {
    for (const a of ['sunbathe', 'howl', 'shake', 'umbrella', 'shortcircuit', 'reboot']) expect(PET_ACTIONS).toContain(a);
    expect(PAIR_SCENES).toContain('huddle');
  });
  it('sunbathe se dessine comme sleep, les autres gardent leur pose', () => {
    const plan = (action: string) => ({ action, hostId: null, at: { x: 0, y: 0 }, on: null, route: [], startedAt: 0, actMs: 1000, facing: 'r', sig: 's' }) as never;
    const act = { pos: { x: 0, y: 0 }, phase: 'act', facing: 'r', on: null, depthHosts: [null] } as never;
    expect(poseOf(act, plan('sunbathe'))).toBe('sleep');
    expect(poseOf(act, plan('howl'))).toBe('howl');
    expect(poseOf(act, plan('shortcircuit'))).toBe('shortcircuit');
  });
});
```

Dans `tests/core/library/light-pet-boxes.test.ts`, ajouter :

```ts
import { shapeOf } from '../../../src/core/library/light/pet-boxes';
it('donne une silhouette aux poses du contexte', () => {
  expect(shapeOf('howl')).toBe('sit');
  expect(shapeOf('shake')).toBe('sit');
  expect(shapeOf('umbrella')).toBe('sit');
  expect(shapeOf('shortcircuit')).toBe('sit');
  expect(shapeOf('reboot')).toBe('sit');
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `npx vitest run tests/core/library/library-pets.test.ts tests/core/library/light-pet-boxes.test.ts --maxWorkers=4`
Expected: FAIL (actions absentes, `shapeOf('howl')` indéfini).

- [ ] **Step 3: Implémenter**

`library-types.ts` :

```ts
export const PET_ACTIONS = ['sit', 'groom', 'stretch', 'yawn', 'sleep', 'eat', 'drink', 'scratch', 'perch', 'hide', 'purr', 'pant', 'sniff', 'greet', 'play', 'hiss', 'cower', 'scan', 'standby', 'charge', 'beep', 'sunbathe', 'howl', 'shake', 'umbrella', 'shortcircuit', 'reboot'] as const;
```
et, avec le commentaire des scènes complété par « ; se serrer ensemble pendant l'orage » :
```ts
export const PAIR_SCENES = ['greet', 'groom', 'chase', 'shoo', 'nap', 'follow', 'ride', 'huddle'] as const;
```

`runner.ts` : ajouter à `Pose` : `| 'howl' | 'shake' | 'umbrella' | 'shortcircuit' | 'reboot'`. Dans `poseOf`, ajouter avant `default` :

```ts
    case 'sunbathe':
      return 'sleep';
```

`pet-boxes.ts`, dans `SHAPE` ligne `sit:` ajouter `howl: 'sit', shake: 'sit', umbrella: 'sit', shortcircuit: 'sit', reboot: 'sit',` (après `pant: 'sit',`).

- [ ] **Step 4: Faire compiler les sprites**

Run: `npx tsc --noEmit -p .` ; pour chaque erreur de `switch (pose)` non exhaustif dans `dog-sprite.tsx` / `robot-sprite.tsx` / `pet-sprite.tsx`, ajouter les nouvelles poses au `case` d'une pose existante proche : chien `case 'howl': case 'shake':` avec `case 'sit':` ; robot `case 'umbrella': case 'shortcircuit': case 'reboot':` avec le cas `'standby'`/`'sit'` existant ; chat : ne reçoit jamais ces poses (ajouter-les au `default` ou au `case 'sit'`). Task 5 les remplace par les vrais dessins.

- [ ] **Step 5: Amender la spec**

Dans la spec, section « Entrée : PetContext » : remplacer `stormId: number; // …` et `rainEndedAt` par :
```ts
  storm: { id: number; since: number } | null; // orage en cours : id change à chaque nouvel orage, since = début (ms)
  rainEndedAt: number | null;
```
et préciser « `sunCells` : projection exacte du verre (`beamPatch`), sans ombre de meuble ; vide si le soleil est masqué ou s'il pleut ».

- [ ] **Step 6: Vérifier, commit**

Run: `npx vitest run tests/core/library --maxWorkers=4 ; npx tsc --noEmit -p .`
Expected: PASS.

```bash
git add -A && git commit -m "feat(contexte): types d'actions, scène huddle, poses et silhouettes du contexte"
```

---

### Task 2: `PetContext` pur (contexte, suivi d'orage, cases de soleil)

**Files:**
- Create: `src/core/library/pets/context.ts`
- Test: `tests/core/library/pets-context.test.ts`

**Interfaces:**
- Consumes: `Weather` (`weather/weather-types`), `beamPatch`, `beamSlope`, `sunElevation` (`light/`), `standPoint` (`pets/walk-map`), `Cell`, `WALL_ROWS`, `ROWS` (`room-grid`).
- Produces:
```ts
export type PetWeather = 'clear' | 'drizzle' | 'rain' | 'storm';
export type PetContext = {
  night: boolean; moon: boolean; weather: PetWeather;
  storm: { id: number; since: number } | null;
  rainEndedAt: number | null;
  sunCells: readonly Cell[];
};
export const NO_CONTEXT: PetContext;
export function weatherKindOf(w: Weather | null): PetWeather;
export function isNight(daylight: number, minutes: number, hasSky: boolean): boolean;
export function sunCellsOf(i: { glasses: readonly Glass[]; wallH: number; floorH: number; cols: number; sunFrac: number | null; sunX: number | null; blocked: boolean }): Cell[];
export function createContextTracker(): { update(now: number, i: { night: boolean; moon: boolean; weather: Weather | null; sunCells: readonly Cell[] }): PetContext };
```

- [ ] **Step 1: Tests qui échouent**

`tests/core/library/pets-context.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createContextTracker, isNight, sunCellsOf, weatherKindOf, NO_CONTEXT } from '../../../src/core/library/pets/context';
import { targetOf } from '../../../src/core/library/weather/weather-types';

describe('weatherKindOf', () => {
  it('classe les états', () => {
    expect(weatherKindOf(null)).toBe('clear');
    expect(weatherKindOf(targetOf('sun'))).toBe('clear');
    expect(weatherKindOf(targetOf('drizzle'))).toBe('drizzle');
    expect(weatherKindOf(targetOf('rain'))).toBe('rain');
    expect(weatherKindOf(targetOf('storm'))).toBe('storm');
    expect(weatherKindOf(targetOf('snow'))).toBe('clear');
  });
});

describe('isNight', () => {
  it('suit le ciel quand il y en a un, l’horloge sinon', () => {
    expect(isNight(0.05, 720, true)).toBe(true);
    expect(isNight(0.9, 60, true)).toBe(false);
    expect(isNight(0, 23 * 60, false)).toBe(true);
    expect(isNight(1, 12 * 60, false)).toBe(false);
  });
});

describe('createContextTracker', () => {
  const base = { night: false, moon: false, sunCells: [] };
  it('donne un nouvel id à chaque orage et le garde tant qu’il dure', () => {
    const t = createContextTracker();
    expect(t.update(1000, { ...base, weather: targetOf('sun') }).storm).toBeNull();
    const a = t.update(2000, { ...base, weather: targetOf('storm') });
    expect(a.storm).toEqual({ id: 1, since: 2000 });
    expect(t.update(9000, { ...base, weather: targetOf('storm') }).storm).toEqual({ id: 1, since: 2000 });
    expect(t.update(10_000, { ...base, weather: targetOf('sun') }).storm).toBeNull();
    expect(t.update(20_000, { ...base, weather: targetOf('storm') }).storm).toEqual({ id: 2, since: 20_000 });
  });
  it('note la fin de la pluie', () => {
    const t = createContextTracker();
    expect(t.update(1000, { ...base, weather: targetOf('rain') }).rainEndedAt).toBeNull();
    expect(t.update(5000, { ...base, weather: targetOf('sun') }).rainEndedAt).toBe(5000);
    expect(t.update(9000, { ...base, weather: targetOf('sun') }).rainEndedAt).toBe(5000);
  });
  it('sans météo : ciel clair', () => {
    expect(createContextTracker().update(0, { ...base, weather: null }).weather).toBe('clear');
    expect(NO_CONTEXT.storm).toBeNull();
  });
});

describe('sunCellsOf', () => {
  const geom = { wallH: 360, floorH: 150, cols: 24 };
  const glass = { x: 120, y: 60, w: 120, h: 150 };
  it('donne des cases du sol quand le soleil est levé', () => {
    const cells = sunCellsOf({ glasses: [glass], ...geom, sunFrac: 0.5, sunX: 180, blocked: false });
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) expect(c.row).toBeGreaterThanOrEqual(12);
  });
  it('est vide si le soleil est couché, masqué ou sans fenêtre', () => {
    expect(sunCellsOf({ glasses: [glass], ...geom, sunFrac: null, sunX: null, blocked: false })).toEqual([]);
    expect(sunCellsOf({ glasses: [glass], ...geom, sunFrac: 0.5, sunX: 180, blocked: true })).toEqual([]);
    expect(sunCellsOf({ glasses: [], ...geom, sunFrac: 0.5, sunX: 180, blocked: false })).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec** (`Cannot find module`).

Run: `npx vitest run tests/core/library/pets-context.test.ts --maxWorkers=4`

- [ ] **Step 3: Implémenter `context.ts`**

```ts
import { ROWS, WALL_ROWS, type Cell } from '../room-grid';
import { beamPatch, beamSlope, sunElevation, type Glass, type Point } from '../light/beam';
import type { Weather } from '../weather/weather-types';
import { standPoint } from './walk-map';

export type PetWeather = 'clear' | 'drizzle' | 'rain' | 'storm';
export type PetContext = {
  night: boolean; // soleil couché (ciel), ou 22 h–6 h d'horloge sans ciel
  moon: boolean; // lune visible depuis une fenêtre
  weather: PetWeather;
  storm: { id: number; since: number } | null; // id change à chaque nouvel orage
  rainEndedAt: number | null; // fin de la dernière pluie (ms)
  sunCells: readonly Cell[]; // cases du sol atteintes par le soleil (projection du verre, sans ombre de meuble)
};

export const NO_CONTEXT: PetContext = { night: false, moon: false, weather: 'clear', storm: null, rainEndedAt: null, sunCells: [] };

export function weatherKindOf(w: Weather | null): PetWeather {
  if (!w || w.kind !== 'rain') return 'clear';
  if (w.lightning > 0.5) return 'storm';
  if (w.precip > 0.5) return 'rain';
  if (w.precip > 0.1) return 'drizzle';
  return 'clear';
}

export function isNight(daylight: number, minutes: number, hasSky: boolean): boolean {
  return hasSky ? daylight < 0.15 : minutes < 6 * 60 || minutes >= 22 * 60;
}

const inside = (poly: readonly Point[], x: number, y: number): boolean => {
  let in_ = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) in_ = !in_;
  }
  return in_;
};

export function sunCellsOf(i: { glasses: readonly Glass[]; wallH: number; floorH: number; cols: number; sunFrac: number | null; sunX: number | null; blocked: boolean }): Cell[] {
  if (i.blocked || i.sunFrac === null || i.sunX === null || i.glasses.length === 0) return [];
  const elev = sunElevation(i.sunFrac);
  const patches = i.glasses
    .map((g) => beamPatch(g, i.wallH, i.floorH, elev, beamSlope(i.sunX!, g.x + g.w / 2, i.wallH)))
    .filter((p): p is Point[] => p !== null);
  if (patches.length === 0) return [];
  const cells: Cell[] = [];
  for (let row = WALL_ROWS; row < ROWS; row++) {
    for (let col = 0; col < i.cols; col++) {
      const p = standPoint(col, row);
      if (patches.some((poly) => inside(poly, p.x, p.y))) cells.push({ col, row });
    }
  }
  return cells;
}

// Suit l'orage (id, début) et la fin de la pluie d'une image à l'autre ; l'orage se termine quand l'éclair retombe sous 0,2 (hystérésis).
export function createContextTracker() {
  let stormId = 0;
  let stormSince = 0;
  let inStorm = false;
  let raining = false;
  let rainEndedAt: number | null = null;
  return {
    update(now: number, i: { night: boolean; moon: boolean; weather: Weather | null; sunCells: readonly Cell[] }): PetContext {
      const kind = weatherKindOf(i.weather);
      const lightning = i.weather?.lightning ?? 0;
      if (!inStorm && kind === 'storm') {
        inStorm = true;
        stormId += 1;
        stormSince = now;
      } else if (inStorm && lightning < 0.2) inStorm = false;
      const wet = kind === 'drizzle' || kind === 'rain' || kind === 'storm';
      if (raining && !wet) rainEndedAt = now;
      else if (!raining && wet) rainEndedAt = null;
      raining = wet;
      return { night: i.night, moon: i.moon, weather: kind, storm: inStorm ? { id: stormId, since: stormSince } : null, rainEndedAt, sunCells: i.sunCells };
    },
  };
}
```

Note : `Glass` et `Point` sont exportés de `light/beam.ts`. Vérifier que `standPoint(col,row)` renvoie le point des pieds au centre de la case (`walk-map.ts`) : le test de `sunCellsOf` le confirme.

- [ ] **Step 4: Lancer, PASS ; commit**

Run: `npx vitest run tests/core/library/pets-context.test.ts --maxWorkers=4`
```bash
git add -A && git commit -m "feat(contexte): PetContext pur (nuit, orage, fin de pluie, cases de soleil)"
```

---

### Task 3: Biais de poids dans `nextPlan` (nuit, soleil, pluie, secouement, hurlement, orage tenu, redémarrage)

**Files:**
- Modify: `src/core/library/pets/brain.ts` (type `BrainEnv`, `nextPlan`)
- Test: `tests/core/library/pets-brain.test.ts`

**Interfaces:**
- Consumes: `PetContext`, `NO_CONTEXT` (Task 2).
- Produces: `BrainEnv` gagne `ctx?: PetContext; canShake?: boolean`. Exports : `STORM_HOLD_MS = 60_000`. Comportement : voir Step 3.

- [ ] **Step 1: Tests qui échouent**

Ajouter dans `tests/core/library/pets-brain.test.ts` (reprendre les helpers existants du fichier : un `layout`, `env`, `from` ; sinon définir) :

```ts
import { NO_CONTEXT, type PetContext } from '../../../src/core/library/pets/context';
import { STORM_HOLD_MS, nextPlan } from '../../../src/core/library/pets/brain';
import { standPoint } from '../../../src/core/library/pets/walk-map';

describe('contexte (6d)', () => {
  const layout = [{ id: 'b', kind: 'basket', col: 6, row: 14 }] as never;
  const from = { pt: standPoint(10, 16), on: null, hostId: null, facing: 'r' as const };
  const envOf = (species: 'cat' | 'dog' | 'robot', ctx: Partial<PetContext>, rng = () => 0.5, extra = {}) => ({ layout, cols: 24, rng, still: false, occupied: new Set<string>(), species, ctx: { ...NO_CONTEXT, ...ctx }, ...extra });
  // Tire l'action la plus fréquente sur 200 plans.
  const tally = (env: ReturnType<typeof envOf>) => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 200; i++) {
      const p = nextPlan({ ...env, rng }, from, 1000 + i);
      counts[p.action] = (counts[p.action] ?? 0) + 1;
    }
    return counts;
  };

  it('sans ctx le comportement est inchangé', () => {
    const a = nextPlan({ ...envOf('cat', {}), ctx: undefined, rng: () => 0.3 }, from, 0);
    const b = nextPlan({ ...envOf('cat', {}), rng: () => 0.3 }, from, 0);
    expect(a.action).toBe(b.action);
  });
  it('la nuit les animaux dorment bien plus', () => {
    const day = tally(envOf('cat', {})).sleep ?? 0;
    const night = tally(envOf('cat', { night: true })).sleep ?? 0;
    expect(night).toBeGreaterThan(day * 2);
  });
  it('le robot préfère la veille la nuit', () => {
    expect(tally(envOf('robot', { night: true })).standby ?? 0).toBeGreaterThan(tally(envOf('robot', {})).standby ?? 0);
  });
  it('le chien hurle à la lune seulement la nuit avec la lune', () => {
    expect(tally(envOf('dog', { night: true, moon: true })).howl ?? 0).toBeGreaterThan(0);
    expect(tally(envOf('dog', { night: true, moon: false })).howl ?? 0).toBe(0);
    expect(tally(envOf('cat', { night: true, moon: true })).howl ?? 0).toBe(0);
  });
  it('chat et chien se couchent dans la tache de soleil le jour', () => {
    const sunCells = [{ col: 12, row: 16 }, { col: 13, row: 16 }];
    expect(tally(envOf('cat', { sunCells })).sunbathe ?? 0).toBeGreaterThan(0);
    expect(tally(envOf('dog', { sunCells })).sunbathe ?? 0).toBeGreaterThan(0);
    expect(tally(envOf('robot', { sunCells })).sunbathe ?? 0).toBe(0);
    expect(tally(envOf('cat', { sunCells, night: true })).sunbathe ?? 0).toBe(0);
    const p = nextPlan(envOf('cat', { sunCells }, () => 0.01), from, 0);
    if (p.action === 'sunbathe') expect(sunCells.some((c) => standPoint(c.col, c.row).x === p.at.x)).toBe(true);
  });
  it('le robot ouvre son parapluie sous la pluie, pas par temps clair', () => {
    expect(tally(envOf('robot', { weather: 'rain' })).umbrella ?? 0).toBeGreaterThan(0);
    expect(tally(envOf('robot', {})).umbrella ?? 0).toBe(0);
  });
  it('le chien se secoue après la pluie, une fois', () => {
    const ended = { rainEndedAt: 1000 };
    expect(tally(envOf('dog', ended, undefined, { canShake: true })).shake ?? 0).toBeGreaterThan(0);
    expect(tally(envOf('dog', ended, undefined, { canShake: false })).shake ?? 0).toBe(0);
    expect(tally(envOf('dog', { rainEndedAt: null }, undefined, { canShake: true })).shake ?? 0).toBe(0);
    expect(tally(envOf('dog', { rainEndedAt: -10_000_000 }, undefined, { canShake: true })).shake ?? 0).toBe(0);
  });
  it('pendant l’orage (60 s) chat et chien restent blottis sur place', () => {
    const ctx = { storm: { id: 1, since: 1000 }, weather: 'storm' as const };
    const p = nextPlan(envOf('cat', ctx), from, 5000, 'cower');
    expect(p.action).toBe('cower');
    expect(p.route).toEqual([]);
    expect(p.actMs).toBeGreaterThanOrEqual(8000);
    expect(p.actMs).toBeLessThanOrEqual(15000);
    const after = nextPlan(envOf('cat', ctx), from, 1000 + STORM_HOLD_MS + 1, 'cower');
    expect(after.action).not.toBe('cower-held');
    expect(after.route.length >= 0).toBe(true);
  });
  it('le robot redémarre après son court-circuit', () => {
    const p = nextPlan(envOf('robot', {}), from, 0, 'shortcircuit');
    expect(p.action).toBe('reboot');
    expect(p.actMs).toBe(1500);
  });
});
```

(La dernière assertion d'« orage » après 60 s vérifie seulement que ça ne bloque pas ; l'exécutant peut la renforcer en comptant que `tally` redonne de la variété.)

- [ ] **Step 2: Lancer, vérifier l'échec.**

Run: `npx vitest run tests/core/library/pets-brain.test.ts --maxWorkers=4`

- [ ] **Step 3: Implémenter dans `brain.ts`**

1. Imports : `import type { PetContext } from './context';`.
2. `BrainEnv` : ajouter `ctx?: PetContext; canShake?: boolean`.
3. Constantes : `export const STORM_HOLD_MS = 60_000;` et
```ts
const SLEEPY: ReadonlySet<PetAction> = new Set(['sleep', 'standby', 'charge']);
const LIVELY: ReadonlySet<PetAction> = new Set(['sniff', 'scan', 'play', 'perch', 'scratch']);
const SHAKE_WINDOW_MS = 120_000;
```
4. Au début de `nextPlan` (après avoir lu `dog`/`robot`/`speed`, avant `buildWalkMap`), l'orage tenu et le redémarrage :
```ts
  const ctx = env.ctx;
  if (robot && last === 'shortcircuit') {
    return { action: 'reboot', hostId: from.hostId, at: from.pt, on: from.on, route: [], startedAt: now, actMs: 1500, facing: from.facing, sig: layoutSig(env.layout, env.cols) };
  }
  if (!robot && ctx?.storm && now - ctx.storm.since < STORM_HOLD_MS) {
    const held: PetAction = last === 'hide' && from.hostId !== null ? 'hide' : 'cower';
    return { action: held, hostId: from.hostId, at: from.pt, on: from.on, route: [], startedAt: now, actMs: between(env.rng, [8000, 15000]), facing: from.facing, sig: layoutSig(env.layout, env.cols) };
  }
```
5. Après les blocs d'espèce (juste avant le tirage `const weights = …`), ajouter les candidats du contexte, hors `still` :
```ts
  if (ctx && !env.still) {
    if (dog && ctx.night && ctx.moon) stay('howl', 1.5, [4000, 6000]);
    if (robot && (ctx.weather === 'drizzle' || ctx.weather === 'rain')) stay('umbrella', 2, [8000, 15000]);
    if (dog && env.canShake && ctx.rainEndedAt !== null && now - ctx.rainEndedAt < SHAKE_WINDOW_MS) stay('shake', 3, [2000, 3000]);
    if (!robot && !ctx.night && ctx.sunCells.length > 0) {
      const free = ctx.sunCells.filter((c) => isFree(map, c.col, c.row));
      free.sort((a, b) => Math.abs(standPoint(a.col, a.row).x - from.pt.x) - Math.abs(standPoint(b.col, b.row).x - from.pt.x));
      for (const c of free.slice(0, 2)) go('sunbathe', 2.5, { pt: standPoint(c.col, c.row), on: null, hostId: null }, [20000, 45000]);
    }
  }
```
6. Dans le calcul de `weights`, multiplier par le contexte :
```ts
  const rainy = ctx?.weather === 'drizzle' || ctx?.weather === 'rain';
  const ctxFactor = (a: PetAction): number => {
    if (!ctx) return 1;
    if (ctx.night && SLEEPY.has(a)) return 4;
    if ((ctx.night || rainy) && LIVELY.has(a)) return 0.5;
    return 1;
  };
  const weights = cands.map((c) => c.weight * (c.action === last ? 0.2 : 1) * ctxFactor(c.action));
```
(Le `sunbathe` n'est jamais affecté par ces facteurs.)

- [ ] **Step 4: Lancer toute la suite du cerveau, PASS ; commit**

Run: `npx vitest run tests/core/library/pets-brain.test.ts tests/core/library/pets-runner.test.ts tests/core/library/pets-scenes.test.ts --maxWorkers=4`
```bash
git add -A && git commit -m "feat(contexte): biais de poids (nuit, soleil, pluie, lune), orage tenu, redémarrage du robot"
```

---

### Task 4: Interruption à l'orage (`storm.ts`, scène `huddle`, intégration au `runner`)

**Files:**
- Create: `src/core/library/pets/storm.ts`
- Modify: `src/core/library/pets/scenes.ts` (exporter `meetCell`)
- Modify: `src/core/library/pets/runner.ts` (`step(room, now, ctx?)`, `envFor`, `record`, bloc d'orage)
- Test: `tests/core/library/pets-storm.test.ts`, `tests/core/library/pets-runner.test.ts`

**Interfaces:**
- Consumes: `PetContext` (Task 2), `STORM_HOLD_MS` (Task 3), `planRoute`, `scaleRoute`, `buildWalkMap`, `nearestFreeCell`, `standPoint`, `isFree`, `cellOf`.
- Produces:
```ts
// storm.ts
export function stormPlan(env: BrainEnv, species: Species, from: Standing, now: number): PetPlan;
export function huddlePlans(env: BrainEnv, cat: Standing, dog: Standing, now: number): { cat: PetPlan; dog: PetPlan } | null;
// runner.ts
step(room: Room, now: number, ctx?: PetContext): PetFrame[]
```

- [ ] **Step 1: Tests de `storm.ts` qui échouent**

`tests/core/library/pets-storm.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { NO_CONTEXT } from '../../../src/core/library/pets/context';
import { huddlePlans, stormPlan } from '../../../src/core/library/pets/storm';
import { standPoint } from '../../../src/core/library/pets/walk-map';
import { routeMs } from '../../../src/core/library/pets/motion';

const sofa = [{ id: 's', kind: 'sofa', col: 8, row: 12 }] as never;
const envOf = (layout = sofa, still = false) => ({ layout, cols: 24, rng: () => 0.5, still, occupied: new Set<string>(), ctx: { ...NO_CONTEXT, storm: { id: 1, since: 0 }, weather: 'storm' as const } });
const from = { pt: standPoint(2, 16), on: null, hostId: null, facing: 'r' as const };

describe('stormPlan', () => {
  it('le chat file sous le canapé (hide) avec un délai', () => {
    const p = stormPlan(envOf(), 'cat', from, 1000);
    expect(p.action).toBe('hide');
    expect(p.hostId).toBe('s');
    expect(p.key).toBe('s:hide');
    expect(p.lag).toBeGreaterThanOrEqual(500);
    expect(p.lag).toBeLessThanOrEqual(4000);
    expect(p.route.length).toBeGreaterThan(0);
  });
  it('sans canapé le chat se blottit contre un mur', () => {
    const p = stormPlan(envOf([] as never), 'cat', from, 1000);
    expect(p.action).toBe('cower');
    expect(p.route.length).toBeGreaterThanOrEqual(0);
  });
  it('le chien se blottit (cower), le robot fait un court-circuit sur place', () => {
    expect(stormPlan(envOf(), 'dog', from, 0).action).toBe('cower');
    const r = stormPlan(envOf(), 'robot', from, 0);
    expect(r.action).toBe('shortcircuit');
    expect(r.route).toEqual([]);
    expect(r.actMs).toBe(3000);
  });
  it('mouvement réduit : sur place', () => {
    const p = stormPlan(envOf(sofa, true), 'cat', from, 0);
    expect(p.action).toBe('cower');
    expect(p.route).toEqual([]);
    expect(p.at).toEqual(from.pt);
  });
});

describe('huddlePlans', () => {
  it('donne deux plans jumeaux (même départ, scène huddle, rôles croisés)', () => {
    const h = huddlePlans(envOf(), from, { pt: standPoint(20, 16), on: null, hostId: null, facing: 'l' }, 1000);
    expect(h).not.toBeNull();
    expect(h!.cat.startedAt).toBe(h!.dog.startedAt);
    expect(h!.cat.with).toMatchObject({ scene: 'huddle', role: 'lead' });
    expect(h!.dog.with).toMatchObject({ scene: 'huddle', role: 'follow' });
    expect(h!.cat.action).toBe('cower');
    expect(h!.dog.action).toBe('cower');
    expect(Math.abs(h!.cat.at.x - h!.dog.at.x)).toBeLessThanOrEqual(40);
    expect(routeMs(h!.cat.route)).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Lancer, échec** (`Cannot find module storm`).

- [ ] **Step 3: Implémenter `storm.ts`**

```ts
import { poisOf } from '../furniture-catalog';
import type { PetPlan, Pt, Species } from '../library-types';
import { CELL_W, isStanding } from '../room-grid';
import { layoutSig, type BrainEnv } from './brain';
import { planRoute, scaleRoute, type Standing } from './route';
import { meetCell } from './scenes';
import { buildWalkMap, cellOf, isFree, nearestFreeCell, standPoint, type WalkMap } from './walk-map';

const between = (rng: () => number, lo: number, hi: number): number => Math.round(lo + rng() * (hi - lo));
const speedOf = (s: Species): number => (s === 'dog' ? 0.6 : 0.8);

// La case libre la plus proche du mur (gauche ou droit) le plus près de l'animal.
function wallCell(map: WalkMap, at: Pt): { pt: Pt; facing: 'l' | 'r' } | null {
  const left = at.x < (map.cols * CELL_W) / 2;
  const edge: Pt = { x: left ? CELL_W / 2 : map.cols * CELL_W - CELL_W / 2, y: at.y };
  const cell = nearestFreeCell(map, edge);
  return cell ? { pt: standPoint(cell.col, cell.row), facing: left ? 'l' : 'r' } : null;
}

const base = (env: BrainEnv, now: number, from: Standing) => ({ hostId: null, on: null, startedAt: now, facing: from.facing, sig: layoutSig(env.layout, env.cols) });

const onSpot = (env: BrainEnv, from: Standing, now: number, action: 'cower' | 'shortcircuit', actMs: number): PetPlan => ({
  ...base(env, now, from), action, hostId: from.hostId, on: from.on, at: from.pt, route: [], actMs,
});

// Le plan de réaction à l'orage d'un animal, à partir de là où il se trouve.
export function stormPlan(env: BrainEnv, species: Species, from: Standing, now: number): PetPlan {
  const hold = between(env.rng, 8000, 15000);
  if (species === 'robot') return onSpot(env, from, now, 'shortcircuit', 3000);
  if (env.still) return onSpot(env, from, now, 'cower', hold);
  const map = buildWalkMap(env.layout, env.cols);
  const lag = between(env.rng, 500, 4000);
  const speed = speedOf(species);
  const dogBlocked = (raw: ReturnType<typeof planRoute>, destOn: string | null): boolean =>
    species === 'dog' && !!raw && raw.some((s) => s.on !== null && s.on !== destOn && s.on !== from.on);
  const sofa = env.layout.find((p) => isStanding(p) && p.kind === 'sofa' && !env.occupied.has(`${p.id}:hide`));
  if (species === 'cat' && sofa && isStanding(sofa)) {
    const dest = { pt: standPoint(sofa.col + 2, sofa.row + 2), on: null, hostId: sofa.id };
    const raw = planRoute(map, from, dest);
    if (raw) return { ...base(env, now, from), action: 'hide', hostId: sofa.id, at: dest.pt, route: scaleRoute(raw, speed), lag, actMs: hold, key: `${sofa.id}:hide` };
  }
  if (species === 'dog' && sofa && isStanding(sofa)) {
    const pt = standPoint(sofa.col, sofa.row + 2);
    const c = cellOf(pt);
    const raw = isFree(map, c.col, c.row) ? planRoute(map, from, { pt, on: null, hostId: sofa.id }) : null;
    if (raw && !dogBlocked(raw, null)) return { ...base(env, now, from), action: 'cower', hostId: sofa.id, at: pt, route: scaleRoute(raw, speed), lag, actMs: hold };
  }
  const wall = wallCell(map, from.pt);
  if (wall) {
    const raw = planRoute(map, from, { pt: wall.pt, on: null, hostId: null });
    if (raw && !dogBlocked(raw, null)) return { ...base(env, now, from), action: 'cower', at: wall.pt, route: scaleRoute(raw, speed), lag, actMs: hold, facing: wall.facing };
  }
  return onSpot(env, from, now, 'cower', hold);
}

// Chat et chien se serrent l'un contre l'autre : le chien va à son coin, le chat vient juste à côté. Deux plans jumeaux (même `startedAt`).
export function huddlePlans(env: BrainEnv, cat: Standing, dog: Standing, now: number): { cat: PetPlan; dog: PetPlan } | null {
  if (env.still) return null;
  const map = buildWalkMap(env.layout, env.cols);
  const spot = wallCell(map, dog.pt);
  if (!spot) return null;
  const dogRaw = planRoute(map, dog, { pt: spot.pt, on: null, hostId: null });
  if (!dogRaw || (species_blocked(dogRaw, dog))) return null;
  const meet = meetCell(map, spot.pt, env.rng);
  if (!meet) return null;
  const meetPt = standPoint(meet.col, meet.row);
  const catRaw = planRoute(map, cat, { pt: meetPt, on: null, hostId: null });
  if (!catRaw) return null;
  const hold = between(env.rng, 8000, 15000);
  const lag = between(env.rng, 500, 4000);
  const common = { startedAt: now, sig: layoutSig(env.layout, env.cols), hostId: null, on: null, lag, actMs: hold };
  return {
    dog: { ...common, action: 'cower', at: spot.pt, route: scaleRoute(dogRaw, speedOf('dog')), facing: spot.facing === 'l' ? 'r' : 'l', with: { petId: 'cat', role: 'follow', scene: 'huddle' } },
    cat: { ...common, action: 'cower', at: meetPt, route: scaleRoute(catRaw, speedOf('cat')), facing: meet.side === 'l' ? 'r' : 'l', with: { petId: 'dog', role: 'lead', scene: 'huddle' } },
  };
}

// Un chien ne grimpe que sur son canapé.
function species_blocked(route: ReturnType<typeof planRoute>, from: Standing): boolean {
  return !!route && route.some((s) => s.on !== null && s.on !== from.on);
}
```

Corrections à faire par l'exécutant : (1) `with.petId` doit être l'**id réel** des animaux : changer la signature en `huddlePlans(env, cat: Standing & { id: string }, dog: Standing & { id: string }, now)` et utiliser `dog.id` / `cat.id` dans les `with` (adapter le test : passer `{...from, id: 'p1'}` et `{..., id: 'p2'}` ; `toMatchObject` sur `petId`) ; (2) renommer `species_blocked` en `dogBlocked` hors du corps de `stormPlan` ; (3) dans `scenes.ts` changer `function meetCell` en `export function meetCell`. Le `facing` : un animal regarde vers l'autre (`cat.facing` vers le chien, `dog.facing` vers le chat) ; la formule ci-dessus doit être vérifiée au test de rendu (Task 5) et corrigée si inversée.

- [ ] **Step 4: Lancer `pets-storm.test.ts`, PASS.**

- [ ] **Step 5: Tests d'intégration du runner qui échouent**

Ajouter dans `tests/core/library/pets-runner.test.ts` :

```ts
import { NO_CONTEXT } from '../../../src/core/library/pets/context';

describe('orage (6d)', () => {
  const stormCtx = (id = 1, since = 1000) => ({ ...NO_CONTEXT, weather: 'storm' as const, storm: { id, since } });
  const trio = (layout: Layout): Room => ({
    ...createInitialState().rooms[0]!, layout,
    pets: [
      { id: 'p1', species: 'cat', name: 'Minou', coat: 'orange', plan: resting(layout, standPoint(4, 16)) },
      { id: 'p2', species: 'dog', name: 'Rex', coat: 'brown', plan: resting(layout, standPoint(18, 16)) },
      { id: 'p3', species: 'robot', name: 'R2', coat: 'blue', plan: resting(layout, standPoint(10, 16)) },
    ],
  });

  it('interrompt les plans au premier orage, une seule fois par orage', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan, rng: () => 0.5 });
    const room = trio(sofa);
    runner.step(room, 2000, stormCtx());
    const first = onPlan.mock.calls.length;
    expect(first).toBeGreaterThanOrEqual(3);
    const robotPlan = onPlan.mock.calls.find((c) => c[0] === 'p3')![1] as PetPlan;
    expect(robotPlan.action).toBe('shortcircuit');
    runner.step(room, 2100, stormCtx());
    expect(onPlan.mock.calls.length).toBe(first);
    runner.step(room, 3000, stormCtx(2, 2900));
    expect(onPlan.mock.calls.length).toBeGreaterThan(first);
  });

  it('à trois, le chat et le chien se serrent (scène huddle)', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan, rng: () => 0.5 });
    runner.step(trio(sofa), 2000, stormCtx());
    const cat = onPlan.mock.calls.filter((c) => c[0] === 'p1').pop()![1] as PetPlan;
    const dog = onPlan.mock.calls.filter((c) => c[0] === 'p2').pop()![1] as PetPlan;
    expect(cat.with?.scene).toBe('huddle');
    expect(dog.with?.scene).toBe('huddle');
    expect(cat.startedAt).toBe(dog.startedAt);
  });

  it('sans le robot, chacun réagit seul', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan, rng: () => 0.5 });
    const room = trio(sofa);
    room.pets = room.pets.slice(0, 2);
    runner.step(room, 2000, stormCtx());
    for (const c of onPlan.mock.calls) expect((c[1] as PetPlan).with).toBeUndefined();
  });

  it('ignore un orage déjà ancien (plus de 60 s) et un animal déjà caché', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan, rng: () => 0.5 });
    runner.step(trio(sofa), 200_000, stormCtx(1, 1000));
    expect(onPlan).not.toHaveBeenCalled();
  });

  it('mouvement réduit : cower sur place', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan, still: true, rng: () => 0.5 });
    runner.step(trio(sofa), 2000, stormCtx());
    const cat = onPlan.mock.calls.find((c) => c[0] === 'p1')![1] as PetPlan;
    expect(cat.action).toBe('cower');
    expect(cat.route).toEqual([]);
  });

  it('le dernier plan d’un chat qui dort sur le robot le fait descendre avant de se cacher', () => {
    // Couvert par le test de ride existant : ici on vérifie seulement qu'aucune erreur n'est levée.
    const runner = createPetRunner({ onPlan: vi.fn(), rng: () => 0.5 });
    expect(() => runner.step(trio(sofa), 2000, stormCtx())).not.toThrow();
  });
});
```

(L'exécutant ajuste `Layout` importé / `sofa` déjà défini dans le fichier ; pour la gamme `still`, vérifier que `envFor` reçoit `still`.)

- [ ] **Step 6: Intégrer au `runner`**

Dans `runner.ts` :

1. Import : `import type { PetContext } from './context'; import { STORM_HOLD_MS } from './brain'; import { huddlePlans, stormPlan } from './storm';`
2. État du runner : `let stormSeen = 0; let curCtx: PetContext | undefined; const shook = new Set<string>();` ; dans `enter()` quand la pièce change : `stormSeen = 0; shook.clear();`.
3. `envFor` : ajouter `ctx: curCtx` et `canShake: species === 'dog' && curCtx?.rainEndedAt != null && !shook.has(`${petId}:${curCtx.rainEndedAt}`)` — pour cela, changer la signature en `envFor(room, species, occupied, petId)` et adapter les 3 appels (`step`, `touch`).
4. `record` : après `plans.set`, `if (plan.action === 'shake' && curCtx?.rainEndedAt != null) shook.add(`${id}:${curCtx.rainEndedAt}`);`.
5. `step(room, now, ctx?)` : en tête `curCtx = ctx;` puis, avant `return room.pets.map(...)`, le bloc d'orage :

```ts
      if (ctx?.storm && ctx.storm.id !== stormSeen && now - ctx.storm.since < STORM_HOLD_MS) {
        stormSeen = ctx.storm.id;
        const standingOf = (id: string): { standing: Standing; jump: Segment | null } | null => {
          const plan = planOf(room, id);
          if (!plan) return null;
          if (isRiding(plan, now)) {
            const { landing, jump } = descent(room, plan, now);
            return { standing: landing, jump };
          }
          const state = settledState(plan, now);
          return { standing: standingFrom(buildWalkMap(room.layout, room.cols), state), jump: null };
        };
        const cat = room.pets.find((p) => p.species === 'cat');
        const dog = room.pets.find((p) => p.species === 'dog');
        const robot = room.pets.find((p) => p.species === 'robot');
        const handled = new Set<string>();
        if (cat && dog && robot && !still) {
          const c = standingOf(cat.id);
          const d = standingOf(dog.id);
          const pair = c && d ? huddlePlans(envFor(room, 'cat', new Set(), cat.id), { ...c.standing, id: cat.id }, { ...d.standing, id: dog.id }, now) : null;
          if (pair && c && d) {
            record(cat.id, c.jump ? { ...pair.cat, route: [c.jump, ...pair.cat.route] } : pair.cat);
            record(dog.id, pair.dog);
            handled.add(cat.id).add(dog.id);
          }
        }
        for (const pet of room.pets) {
          if (handled.has(pet.id)) continue;
          const plan = planOf(room, pet.id);
          if (plan && plan.with === undefined && (plan.action === 'hide' || plan.action === 'cower') && now < planEndsAt(plan)) continue;
          const at = standingOf(pet.id);
          if (!at) continue;
          const next = stormPlan(envFor(room, pet.species, takenBy(room, pet.id, now), pet.id), pet.species, at.standing, now);
          record(pet.id, at.jump && !still ? { ...next, route: [at.jump, ...next.route] } : next);
        }
      }
```
`Segment` est déjà importé. Les plans écrits sont repris par la boucle `map` qui suit (leur `startedAt === now`, `sig` valide).

6. Dans la boucle `map`, passer à `proposeScene`/`nextPlan` le même `env` (déjà fait via `envFor`).

- [ ] **Step 7: Lancer toute la suite pets, PASS ; commit**

Run: `npx vitest run tests/core/library --maxWorkers=4 ; npx tsc --noEmit -p .`
```bash
git add -A && git commit -m "feat(contexte): interruption à l'orage, scène huddle à trois, court-circuit du robot"
```

---

### Task 5: Dessins (chien : hurler, se secouer ; robot : parapluie, court-circuit, redémarrage)

**Files:**
- Modify: `src/content/dog-sprite.tsx` (switch de pose, repli de la Task 1 à remplacer)
- Modify: `src/content/robot-sprite.tsx`
- Test: `tests/content/library-pets-view.test.tsx`

**Interfaces:**
- Consumes: `Pose` (Task 1). Aucun nouveau prop : les sprites reçoivent déjà `pose`, `still`, la palette `c`.

- [ ] **Step 1: Lire les sprites existants**

Lire `src/content/dog-sprite.tsx` (helpers `sitting(c, head, …)`, `<Head …/>`, `still`) et `src/content/robot-sprite.tsx` (cas `standby`, `scan`, `beep`) pour réutiliser leurs helpers et leur échelle.

- [ ] **Step 2: Test qui échoue**

Dans `tests/content/library-pets-view.test.tsx`, reprendre la façon dont le fichier rend un `PetSprite` par pose, et ajouter :

```tsx
it.each([
  ['dog', 'howl'], ['dog', 'shake'], ['robot', 'umbrella'], ['robot', 'shortcircuit'], ['robot', 'reboot'],
] as const)('dessine la pose %s/%s distincte de la pose assise', (species, pose) => {
  const render = (p: string) => renderToStaticMarkup(<PetSprite species={species} coat={species === 'dog' ? 'brown' : 'blue'} pose={p as never} facing="r" />);
  expect(render(pose)).not.toBe(render('sit'));
});
it('les étincelles du court-circuit sont coupées en mouvement réduit', () => {
  const html = (still: boolean) => renderToStaticMarkup(<PetSprite species="robot" coat="blue" pose="shortcircuit" facing="r" still={still} />);
  expect(html(false)).toContain('animate');
  expect(html(true)).not.toContain('animate');
});
```
(Adapter les imports/props à ceux du fichier ; si `PetSprite` n'accepte pas `still`, utiliser le prop existant équivalent.)

- [ ] **Step 3: Implémenter**

Dans `dog-sprite.tsx`, remplacer le repli par deux cas :
- `howl` : le chien assis, museau vers le haut (`<Head … tilt={-35} mouth />` plus haut de ~6 px) avec trois petits arcs « ou-ou » animés (opacité) si `!still`.
- `shake` : le chien debout (réutiliser le rendu `standing`), enveloppé dans un `<g>` avec `<animateTransform attributeName="transform" type="rotate" values="-6 0 -16;6 0 -16;-6 0 -16" dur="0.18s" repeatCount="indefinite" />` si `!still`.

Dans `robot-sprite.tsx` :
- `umbrella` : le rendu `sit` du robot + un parapluie au-dessus (demi-disque `path d="M-22 -50 A22 22 0 0 1 22 -50 Z"` en couleur d'accent, manche `rect` fin jusqu'à l'antenne).
- `shortcircuit` : rendu `sit`, écran en croix rouge, 3 étincelles (`<polyline>` jaunes) clignotantes (`<animate attributeName="opacity" values="1;0;1" dur="0.25s" repeatCount="indefinite"/>`) et tremblement `translate` — le tout seulement si `!still` (en `still` : croix rouge, étincelles statiques SANS `<animate>`).
- `reboot` : rendu `sit`, écran qui s'allume (`<animate attributeName="opacity" values="0.2;1" dur="1.5s" fill="freeze"/>` si `!still`).

Réutiliser les couleurs de la palette `c` du sprite ; pas de couleur nouvelle sauf rouge `#d33` et jaune `#ffd23a` pour le court-circuit.

- [ ] **Step 4: Lancer, PASS ; commit**

Run: `npx vitest run tests/content/library-pets-view.test.tsx tests/content/library-pets-ui.test.tsx --maxWorkers=4 ; npx tsc --noEmit -p .`
```bash
git add -A && git commit -m "feat(contexte): dessins du hurlement, du secouement, du parapluie et du court-circuit"
```

---

### Task 6: Branchement de l'interface (hook `usePetContext`, `usePetSim`, `LibraryPanel`)

**Files:**
- Create: `src/content/pet-context.ts`
- Modify: `src/content/pet-sim.ts` (nouveau paramètre `getContext`)
- Modify: `src/content/LibraryPanel.tsx:371` (appel de `usePetSim`) et près de l.246-251
- Test: `tests/content/library-pets-context.test.tsx`

**Interfaces:**
- Consumes: `createContextTracker`, `sunCellsOf`, `isNight`, `PetContext` (Task 2) ; `runner.step(room, now, ctx)` (Task 4) ; `celestialPlace` (`./scene-panorama`) ; `glassRect` (`./window-art`) ; `WEATHER_SCENES` (`./scene-weather`).
- Produces:
```ts
// pet-context.ts
export type PetContextInput = { room: Room | null; sceneView: SceneView; lightOn: boolean };
export function usePetContext(input: PetContextInput): () => PetContext;
// pet-sim.ts
export function usePetSim(room, onPlan, getContext?: () => PetContext)
```
(`SceneView` : le type de `sceneView` de `RoomView.tsx`; l'exporter s'il ne l'est pas.)

- [ ] **Step 1: Test qui échoue**

`tests/content/library-pets-context.test.tsx` : tester la fonction pure extraite du hook, `buildPetContext(tracker, now, input)`, pour éviter de monter React :

```ts
import { describe, expect, it } from 'vitest';
import { buildPetContext } from '../../src/content/pet-context';
import { createContextTracker } from '../../src/core/library/pets/context';
import { skyAt } from '../../src/core/library/sky';
import { targetOf } from '../../src/core/library/weather/weather-types';

const times = { kind: 'normal' as const, sunrise: 360, sunset: 1200 };
const room = (windows: boolean, scene = 'city') => ({ id: 'r', cols: 24, scene, layout: windows ? [{ id: 'w', kind: 'window', col: 4, row: 2, w: 4, h: 5 }] : [] }) as never;
const view = (minutes: number, w = targetOf('sun')) => ({ sky: skyAt(minutes, times), minutes, weather: { clock: { read: () => w }, flags: { gloom: false, rainy: false } } });

describe('buildPetContext', () => {
  it('de jour avec une fenêtre : cases de soleil, pas de nuit', () => {
    const ctx = buildPetContext(createContextTracker(), 0, { room: room(true), sceneView: view(12 * 60), lightOn: true });
    expect(ctx.night).toBe(false);
    expect(ctx.sunCells.length).toBeGreaterThan(0);
  });
  it('de nuit avec une fenêtre : lune visible', () => {
    const ctx = buildPetContext(createContextTracker(), 0, { room: room(true), sceneView: view(2 * 60), lightOn: true });
    expect(ctx.night).toBe(true);
    expect(ctx.moon).toBe(true);
  });
  it('sans fenêtre : pas de soleil, pas de lune, nuit d’après l’horloge', () => {
    const ctx = buildPetContext(createContextTracker(), 0, { room: room(false), sceneView: view(23 * 60), lightOn: true });
    expect(ctx).toMatchObject({ night: true, moon: false, weather: 'clear', sunCells: [] });
  });
  it('scène spatiale : pas de météo ; calque de lumière coupé : pas de tache de soleil', () => {
    expect(buildPetContext(createContextTracker(), 0, { room: room(true, 'space'), sceneView: view(12 * 60, targetOf('storm')), lightOn: true }).weather).toBe('clear');
    expect(buildPetContext(createContextTracker(), 0, { room: room(true), sceneView: view(12 * 60), lightOn: false }).sunCells).toEqual([]);
  });
  it('soleil masqué par l’orage : pas de tache', () => {
    expect(buildPetContext(createContextTracker(), 0, { room: room(true), sceneView: view(12 * 60, targetOf('storm')), lightOn: true }).sunCells).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer, échec.**

- [ ] **Step 3: Implémenter `pet-context.ts`**

```ts
import { useCallback, useMemo, useRef } from 'react';
import type { Room } from '../core/library/library-types';
import { createContextTracker, isNight, sunCellsOf, type PetContext } from '../core/library/pets/context';
import { CELL_H, HEIGHT, WALL_ROWS, CELL_W, pxRect } from '../core/library/room-grid';
import { celestialPlace } from './scene-panorama';
import { WEATHER_SCENES } from './scene-weather';
import { glassRect } from './window-art';
import type { SceneView } from './RoomView';

export type PetContextInput = { room: Room | null; sceneView: SceneView | undefined; lightOn: boolean };
type Tracker = ReturnType<typeof createContextTracker>;

// Construit le contexte des animaux à l'instant `now`. Le soleil n'est recalculé qu'une fois par seconde (voir le hook).
export function buildPetContext(tracker: Tracker, now: number, { room, sceneView, lightOn }: PetContextInput, sunCache?: { at: number; cells: PetContext['sunCells'] }): PetContext {
  if (!room || !sceneView) return tracker.update(now, { night: false, moon: false, weather: null, sunCells: [] });
  const windows = room.layout.filter((p): p is Extract<typeof p, { kind: 'window' }> => p.kind === 'window');
  const hasSky = windows.length > 0 && WEATHER_SCENES.includes(room.scene);
  const weather = hasSky && sceneView.weather ? sceneView.weather.clock.read(now) : null;
  const night = isNight(sceneView.sky.daylight, sceneView.minutes, hasSky || windows.length > 0);
  const moon = hasSky && night && sceneView.sky.moonFrac !== null;
  let sunCells = sunCache && now - sunCache.at < 1000 ? sunCache.cells : [];
  if (!sunCache || now - sunCache.at >= 1000) {
    const wallH = WALL_ROWS * CELL_H;
    const width = room.cols * CELL_W;
    const blocked = !lightOn || !hasSky || (weather !== null && (weather.precip > 0.3 || weather.cloud > 0.85));
    sunCells = sunCellsOf({
      glasses: windows.map((w) => glassRect(pxRect({ col: w.col, row: w.row, w: w.w, h: w.h }))),
      wallH, floorH: HEIGHT - wallH, cols: room.cols,
      sunFrac: sceneView.sky.sunFrac,
      sunX: sceneView.sky.sunFrac === null ? null : celestialPlace(sceneView.sky.sunFrac, width, wallH).x,
      blocked,
    });
    if (sunCache) { sunCache.at = now; sunCache.cells = sunCells; }
  }
  return tracker.update(now, { night, moon, weather, sunCells });
}

export function usePetContext(input: PetContextInput): () => PetContext {
  const tracker = useMemo(() => createContextTracker(), []);
  const cache = useRef({ at: -Infinity, cells: [] as PetContext['sunCells'] });
  const latest = useRef(input);
  latest.current = input;
  return useCallback(() => buildPetContext(tracker, Date.now(), latest.current, cache.current), [tracker]);
}
```
Remarques : (a) `isNight(daylight, minutes, hasSky)` : le 3ᵉ paramètre est « il y a un ciel visible » → passer `hasSky` seul (corriger la ligne ci-dessus pour `hasSky`) ; (b) invalider `cache.current.at = -Infinity` quand `room.id` ou `room.layout` change (comparer à la dernière pièce vue dans le ref) ; (c) `SceneView` : si le type n'est pas exporté de `RoomView.tsx`, l'exporter ; (d) `sceneView.sky.moonFrac` existe (`Sky.moonFrac`).

- [ ] **Step 4: Brancher**

`pet-sim.ts` : signature `usePetSim(room, onPlan, getContext?: () => PetContext)` ; garder la fonction dans un ref (`ctxRef`, mis à jour dans le `useLayoutEffect` existant) et dans `tick` : `runner.step(r, Date.now(), ctxRef.current?.())`.

`LibraryPanel.tsx` : après `sceneView` (l.~251) :
```ts
const getPetContext = usePetContext({ room: lib ? activeRoom(lib) : null, sceneView, lightOn });
```
(`lightOn` doit être défini avant : s'il l'est après, déplacer l'appel après sa déclaration) puis `usePetSim(lib ? activeRoom(lib) : null, savePlan, getPetContext)`.

- [ ] **Step 5: Lancer toute la suite du panneau, PASS ; commit**

Run: `npx vitest run tests/content --maxWorkers=4 ; npx tsc --noEmit -p . ; npm run lint`
```bash
git add -A && git commit -m "feat(contexte): contexte des animaux branché sur le ciel, la météo et la lumière"
```

---

### Task 7: Fiche WikiHow, vérification complète, PR et pré-prod

**Files:**
- Modify: `src/core/whats-new/entries.ts` (après `bibliotheque-v17`, l.~1488+)
- Modify: `tests/core/whats-new/entries.test.ts`

**Interfaces:**
- Produces: entrée `bibliotheque-v18`, thème `collection`, glyphe `🌦️`, titre « Les animaux et le temps qu’il fait ».

- [ ] **Step 1: Test qui échoue**

Dans `tests/core/whats-new/entries.test.ts`, sur le modèle du test `bibliotheque-v17` :
```ts
it('la fiche bibliotheque-v18 présente les réactions au contexte et leurs limites', () => {
  const entry = ENTRIES.find((e) => e.id === 'bibliotheque-v18');
  expect(entry).toBeDefined();
  expect(entry!.steps.length).toBe(4);
  expect(entry!.steps.map((s) => s.title).join(' ')).toMatch(/nuit/i);
  expect(entry!.steps.flatMap((s) => s.details ?? []).some((d) => d.label === 'Limites')).toBe(true);
  expect(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v18')).toBeGreaterThan(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v17'));
});
```

- [ ] **Step 2: Écrire la fiche**

Après l'entrée `bibliotheque-v17` (même forme : `id`, `theme: 'collection'`, `glyph`, `title`, `summary`, `steps` avec `target: '[data-wmt-library] [data-pet]'`, `title`, `text`, `details` {À quoi ça sert / Comment ça marche / D'où viennent les données / Limites}, `scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library-entry]'] }`). Quatre étapes :
1. **La nuit** : ils dorment davantage ; le robot se met en veille ; le chien peut hurler à la lune (fenêtre + scène à ciel). Limites : sans fenêtre la nuit suit l'horloge (22 h-6 h).
2. **Le soleil** : chat et chien se couchent dans la tache de soleil au sol. Comment ça marche : la tache est calculée à partir de la fenêtre et de la position du soleil, sans ombre de meuble. Limites : elle bouge, l'animal reste où il s'est posé ; coupée si le réglage Lumière est coupé ou s'il pleut.
3. **La pluie** : le robot ouvre son parapluie ; le chien se secoue une fois la pluie finie ; les animaux bougent moins.
4. **L'orage** : au premier éclair le chat file sous le canapé, le chien se blottit, le robot fait un court-circuit puis redémarre ; à trois, chat et chien se serrent. Limites : aucune réaction aux événements dehors (à venir) ; le temps vient de la météo (aléatoire, forcée ou réelle) déjà réglée ; rien n'est envoyé.

- [ ] **Step 3: Vérification complète**

Run: `npx vitest run --maxWorkers=4 ; npx tsc --noEmit -p . ; npm run lint ; npm run build`
Expected: tout vert (les tests longs peuvent être instables en parallèle total : ne jamais passer `--maxWorkers` au maximum).

- [ ] **Step 4: Commit, push, PR, fusion, pré-prod**

```bash
git add -A && git commit -m "docs(wikihow): fiche v18, les animaux et le temps qu'il fait"
git push -u origin feat/bibliotheque-contexte
gh pr create --title "feat(bibliotheque): 6d, réactions au contexte (nuit, soleil, pluie, orage)" --body "<résumé + plan de test manuel>"
gh pr merge --merge
```
Puis, sur ordre permanent (mémoire `project_canaux_preprod_prod`) : `npm run preprod` depuis un arbre propre à jour de main (pas `promouvoir`). Mettre à jour la mémoire `project_bibliotheque.md` (6d fait, reste vérif. manuelle Chrome + APK).

---

## Self-review

- **Couverture de la spec** : `PetContext` (T2) ; biais nuit/soleil/pluie/secouement/lune (T3) ; interruption + huddle + court-circuit/redémarrage + mouvement réduit + caresse (T4 ; la caresse reste inchangée : `touchPlan` écrase le plan, la reprise suit au choix suivant) ; mémorisation (aucune simulation, `record` existant) ; données/état v5 (T1) ; rendu (T1 silhouettes, T5 dessins) ; WikiHow (T7) ; tests listés (T2-T6). Les poses chat `sunbathe` = `sleep` (T1).
- **Points à surveiller à l'exécution** : (1) sens de `facing` du huddle ; (2) un build antérieur lisant un plan avec action inconnue : vérifier que `library-book.ts` écarte le plan invalide sans perdre la pièce (test `library-pets.test.ts`, ajouter un cas si absent) ; (3) `isNight` : 3ᵉ argument = présence d'un ciel visible.
- **Types** : `stormPlan(env, species, from, now)`, `huddlePlans(env, cat+id, dog+id, now)`, `step(room, now, ctx?)`, `usePetContext(input)`, `buildPetContext(tracker, now, input, cache?)` cohérents entre tâches.
