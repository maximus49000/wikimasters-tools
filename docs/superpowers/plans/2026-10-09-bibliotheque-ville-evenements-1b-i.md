# Ville vivante, vague 1b-i (route remontée et événements de la ville) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remonter la route de la scène Ville pour qu'on voie les deux files depuis la fenêtre la plus basse, puis ajouter le moteur d'événements de la ville (créneaux de 25 s tirés de la graine) et 16 événements ordinaires (ciel, rue, trottoir, fixes) dessinés par-dessus la vie ambiante de la vague 1a.

**Architecture:** Moteur pur et déterministe dans `src/core/library/city/` : `events.ts` (catalogue en données, programme d'un « grand créneau » de 20 min, conditions, véhicules qui s'effacent), `event-place.ts` (position de chaque événement à l'instant t, voitures qui se rangent devant l'ambulance). Rendu dans `src/content/` : `city-event-sprites.tsx` (dessins, animations SMIL coupées en mouvement réduit), `use-city-events.ts` (programme mémoïsé, détection des changements dans la boucle), intégration dans `CityLifeLayer` (même boucle `requestAnimationFrame` sur l'horloge murale, masques des toits pour le feu d'artifice et la grue).

**Tech Stack:** TypeScript, React, SVG (SMIL pour les petites animations), vitest (jsdom pour les composants), WXT.

**Spec:** `docs/superpowers/specs/2026-10-09-bibliotheque-ville-vivante-design.md` (sections « Principes communs » et « Vague 1b : événements de la ville ») et notes de conversation `docs/superpowers/notes/2026-10-09-ville-commerces-decisions.md` (décisions de la 1b-i : route remontée, feux d'artifice derrière les immeubles, enseigne néon retirée au profit des commerces, voitures qui se rangent, fréquence). Maquette des événements validée dans la conversation du 2026-10-09.

## Écarts à la spec, décidés avec l'utilisateur

- La vague 1b est coupée en trois PR : **1b-i** (ce plan), 1b-ii (fêtes et père Noël), 1b-iii (décors de longue durée). Les **commerces** sont une vague à part, juste après la 1b-i.
- **16 événements au lieu de 17** : l'enseigne néon est retirée, les commerces la remplacent dans leur propre vague.
- **Feux d'artifice derrière les immeubles** (masque qui suit la silhouette des toits). La grue est aussi derrière les immeubles du premier plan.
- **Route remontée** : sol de la ville à 0,70 de la hauteur (au lieu de 0,78), trottoir d'en face en bas.

## Hors périmètre

Fêtes, père Noël, décors de fête, commerces, réaction des animaux au promeneur de chien (vague 1c : elle lira `eventX` des événements `dog-walker`), autres scènes que la Ville.

## Global Constraints

- **Déterministe et sans état** : aucun `Math.random` ; graine = `seed` de la pièce (`hashString(room.id)`) ; instant = horloge murale `Date.now() / 1000`, jamais `performance.now`. Rien n'est enregistré : un rechargement retrouve les mêmes événements.
- Créneau de **25 s** (`SLOT_S`), grand créneau de **48 créneaux = 20 min** (`HYPER_S = 1200`). Un événement ne déborde jamais de son grand créneau.
- Fréquence « de temps en temps » : chance d'un événement par créneau **0,2** (`EVENT_CHANCE`), **au plus 2 événements en même temps** (`MAX_EVENTS`).
- Jamais deux fois le même événement en même temps, jamais deux véhicules d'événement sur la même file en même temps.
- **Ambulance** : plus rapide (130 px/s), roule à 5 px du marquage central ; les voitures de sa file se rangent de 7 px vers le bord (premier plan vers le bas, fond vers le haut) quand elle arrive, puis reprennent leur place. Les autres véhicules d'événement (bus, tram, camion-poubelle, livreur) roulent à la vitesse de leur file ; les voitures de la même file trop proches d'eux s'effacent (fondu de 0,4 s) pendant tout leur passage.
- **Mouvement réduit** (`prefers-reduced-motion: reduce`) : aucune traversée ; seuls `apartment`, `crane` et `kite` restent, figés, sans `<animate>` ; jamais de feu d'artifice.
- Performance mobile : la boucle ne touche que `transform` et `opacity` ; un re-rendu React seulement quand l'ensemble des événements actifs change (au plus toutes les quelques dizaines de secondes).
- Textes en français, glyphes plutôt que du texte dans les boutons (aucun bouton nouveau ici).
- Fiche WikiHow : `bibliotheque-v21` (la `v20` est celle de la vague 1a). Chaque étape : `text` + `details` (`À quoi ça sert`, `Comment faire`, `D'où viennent les données`, `Limites`) + `scene`.
- Commits : message en français style `feat(ville): …`, terminé par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests : `npx vitest run <fichier> --maxWorkers=4`. Suite complète : `npx vitest run --maxWorkers=4`. Vérifications finales : `npm run typecheck`, `npm run build`.
- Worktree de travail : `C:\Users\maxim\Downloads\Wikimasters-bibliotheque` (actuellement détaché sur `origin/main`), branche `feat/bibliotheque-ville-evenements`, jonction `node_modules` et copie de `.env.local` à retirer en fin de travail.

## Structure des fichiers

Créer :
- `src/core/library/city/events.ts` — catalogue `EVENT_DEFS`, conditions, `cityEventSchedule`, `activeEvents`, `eventX`, `yieldsFor`.
- `src/core/library/city/event-place.ts` — `placeEvent`, `pullOver`, constantes `PULL_DY`, `AMB_DY`.
- `src/content/city-event-sprites.tsx` — `CityEventSprite`.
- `src/content/use-city-events.ts` — `useCityEvents`.
- Tests : `tests/core/library/city-events.test.ts`, `tests/core/library/city-event-place.test.ts`, `tests/content/city-event-sprites.test.tsx`, `tests/content/city-events-layer.test.tsx`.

Modifier :
- `src/core/library/scene-world.ts` — constante `SKYLINE_GROUND`.
- `src/core/library/city/metrics.ts` — sol à 0,70, `curb`, `farSide`, `CITY_GROUND`, `FAR_SHRINK`.
- `src/core/library/city/facades.ts` — fenêtres recalées sur le nouveau sol.
- `src/core/library/city/vehicles.ts` — `laneSpeeds(seed)` exporté.
- `src/content/scene-city.tsx` — trottoir d'en face.
- `src/content/scene-weather.tsx` — sol de la ville.
- `src/content/city-sprites.tsx` — `tone` exporté.
- `src/content/city-life.tsx` — événements, masques, voitures qui se rangent ou s'effacent.
- `src/core/whats-new/entries.ts` — fiche `bibliotheque-v21`.
- `tests/core/library/city-metrics.test.ts`, `tests/core/library/city-facades.test.ts`.

---

### Task 1: Route remontée

**Files:**
- Modify: `src/core/library/scene-world.ts` (fonction `citySkyline`)
- Modify: `src/core/library/city/metrics.ts`
- Modify: `src/core/library/city/facades.ts` (fonction `cityFacades`)
- Modify: `src/content/scene-city.tsx`
- Modify: `src/content/city-life.tsx` (`FAR_SHRINK`, `StreetLamps`)
- Modify: `src/content/scene-weather.tsx` (constantes `GROUND`, `ARC_FOOT`)
- Test: `tests/core/library/city-metrics.test.ts`, `tests/core/library/city-facades.test.ts`

**Interfaces:**
- Produces:
  - `SKYLINE_GROUND = 0.78` (scene-world) : sol sur lequel `citySkyline` pose ses fenêtres (tirage inchangé).
  - `CITY_GROUND = 0.7`, `FAR_SHRINK = 0.9` (metrics).
  - `type CityMetrics = { ground: number; curb: number; walkY: number; doorY: number; laneY: { far: number; near: number }; farSide: number; unit: number }` — `curb` : bord du trottoir côté rue ; `farSide` : haut du trottoir d'en face.

Contexte : une fenêtre posée tout en bas du mur s'arrête à `12 × CELL_H − 7 = 333` px (verre), alors que la file du premier plan roule aujourd'hui à 332 px : on ne voit que le haut des voitures. Avec le sol à 0,70 (238 px pour 340 px de haut), trottoir 0,06, file du fond à 283 px, premier plan à 313 px, trottoir d'en face dès 320 px, une fenêtre de 3 lignes posée tout en bas (verre de 262 à 333 px) voit les deux files.

- [ ] **Step 1: Write the failing test**

Remplacer le contenu de `tests/core/library/city-metrics.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { CITY_GROUND, cityMetrics } from '../../../src/core/library/city/metrics';
import { CELL_H, WALL_ROWS } from '../../../src/core/library/room-grid';

describe('cityMetrics', () => {
  it('range sol, trottoir, deux files et trottoir d’en face du haut vers le bas', () => {
    const m = cityMetrics(340);
    expect(CITY_GROUND).toBe(0.7);
    expect(m.ground).toBeCloseTo(340 * 0.7, 5);
    expect(m.walkY).toBeGreaterThan(m.ground);
    expect(m.curb).toBeGreaterThan(m.walkY);
    expect(m.laneY.far).toBeGreaterThan(m.curb);
    expect(m.laneY.near).toBeGreaterThan(m.laneY.far);
    expect(m.farSide).toBeGreaterThan(m.laneY.near);
    expect(m.farSide).toBeLessThan(340);
    expect(m.unit).toBeCloseTo(1, 5);
    expect(cityMetrics(170).unit).toBeCloseTo(0.5, 5);
  });
  it('depuis la plus petite fenêtre posée tout en bas, on voit les deux files', () => {
    const wallH = WALL_ROWS * CELL_H;
    const m = cityMetrics(wallH);
    // Fenêtre de 3 lignes collée au bas du mur ; le verre est en retrait de 7 px dans le cadre.
    const glassTop = (WALL_ROWS - 3) * CELL_H + 7;
    const glassBottom = WALL_ROWS * CELL_H - 7;
    const carHeight = 21 * m.unit;
    expect(m.laneY.far - carHeight).toBeGreaterThanOrEqual(glassTop);
    expect(m.laneY.near).toBeLessThanOrEqual(glassBottom - 10);
  });
});
```

Ajouter à la fin de `tests/core/library/city-facades.test.ts` (garder les imports existants, ajouter ceux qui manquent : `cityFacades`, `GROUND_FLOOR` depuis `facades`, `cityMetrics` depuis `metrics`) :

```ts
describe('fenêtres recalées sur le sol de la rue', () => {
  it('toutes les fenêtres d’un immeuble du premier plan sont sur sa façade, au-dessus du rez-de-chaussée', () => {
    const height = 340;
    const { ground } = cityMetrics(height);
    for (const b of cityFacades(1440, height, 42).filter((f) => !f.far)) {
      for (const lamp of b.lamps) {
        expect(lamp.y).toBeGreaterThanOrEqual(ground - b.h - 0.001);
        expect(lamp.y + 7).toBeLessThanOrEqual(ground - GROUND_FLOOR + 0.001);
      }
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/library/city-metrics.test.ts tests/core/library/city-facades.test.ts --maxWorkers=4`
Expected: FAIL (`CITY_GROUND` n'existe pas, `curb`/`farSide` indéfinis, fenêtres trop basses de 27 px).

- [ ] **Step 3: Implement**

`src/core/library/scene-world.ts` : au-dessus de `citySkyline`, ajouter la constante et l'utiliser.

```ts
// Sol sur lequel `citySkyline` pose ses fenêtres (son tirage n'en dépend pas) ; la rue dessinée a son propre sol (city/metrics.ts).
export const SKYLINE_GROUND = 0.78;
```

et dans `citySkyline`, remplacer `const ground = height * 0.78;` par `const ground = height * SKYLINE_GROUND;`.

Remplacer `src/core/library/city/metrics.ts` par :

```ts
// Repère de la scène Ville : le monde fait `height` px de haut ; le dessin a été pensé pour 340 px (`unit` = échelle).
// `curb` : bord du trottoir côté rue ; `farSide` : haut du trottoir d'en face (en bas de l'image).
export type CityMetrics = { ground: number; curb: number; walkY: number; doorY: number; laneY: { far: number; near: number }; farSide: number; unit: number };

// Sol de la rue (fraction de la hauteur) : assez haut pour que la plus petite fenêtre posée en bas du mur montre les deux files.
export const CITY_GROUND = 0.7;
// Les véhicules de la file du fond paraissent un peu plus petits.
export const FAR_SHRINK = 0.9;

// Proportions des éléments de la rue, appliquées au dessin (retour utilisateur : entrées et passants trop grands
// par rapport aux immeubles). Passant ≈ 22 px (sprite de 40 × 0,55), entrée 12 × 23 px (sprite 22 × 27 réduit),
// voiture ≈ 34 × 18 px, lampadaire ≈ 68 px ; les immeubles sont étirés de 1,6 (voir facades.ts).
export const STREET_SCALE = { person: 0.55, entranceX: 12 / 22, entranceY: 0.85, vehicle: 0.85, lamp: 0.85 } as const;
// Pas de marche : les vitesses tirées (px/s) sont ralenties pour des passants plus petits.
export const WALK_PACE = 0.7;

export function cityMetrics(height: number): CityMetrics {
  const ground = height * CITY_GROUND;
  const sidewalk = height * 0.06;
  const curb = ground + sidewalk;
  const farSide = height * 0.94;
  const road = farSide - curb;
  return {
    ground,
    curb,
    walkY: ground + sidewalk * 0.7,
    doorY: ground + sidewalk * 0.1,
    laneY: { far: curb + road * 0.4, near: curb + road * 0.9 },
    farSide,
    unit: height / 340,
  };
}
```

`src/core/library/city/facades.ts` : importer `SKYLINE_GROUND` depuis `../scene-world` et remplacer `cityFacades` par :

```ts
// Immeubles de la ville tels que dessinés : hauteur étirée, fenêtres d'origine remontées en haut + étages ajoutés.
// `citySkyline` pose ses fenêtres sur son propre sol (SKYLINE_GROUND) : elles sont recalées sur le sol de la rue.
export function cityFacades(width: number, height: number, seed: number): Facade[] {
  const { ground } = cityMetrics(height);
  const shift = height * SKYLINE_GROUND - ground;
  return citySkyline(width, height, seed).map((b) => {
    const lift = b.h * (BUILDING_STRETCH - 1);
    const h = b.h * BUILDING_STRETCH;
    if (b.far) return { ...b, h, farWindows: farWindows(b, ground, seed) };
    const lamps = [...b.lamps.map((l) => ({ ...l, y: l.y - lift - shift })), ...extraFloorWindows(b, ground, seed)];
    return { ...b, h, lamps, farWindows: [] };
  });
}
```

`src/content/scene-city.tsx` : supprimer `const sidewalk = height * 0.07;` et remplacer les trois rectangles du sol (`street`, `walk`, bordure) par :

```tsx
      {/* Trottoir contre les immeubles, chaussée à deux files (fond vers la gauche, premier plan vers la droite), trottoir d'en face. */}
      <rect x={0} y={ground} width={width} height={height - ground} fill={street} />
      <rect x={0} y={ground} width={width} height={metrics.curb - ground} fill={walk} />
      <rect x={0} y={metrics.curb - 1} width={width} height={2} fill="#00000033" />
      <rect data-far-sidewalk="" x={0} y={metrics.farSide} width={width} height={height - metrics.farSide} fill={walk} />
      <rect x={0} y={metrics.farSide} width={width} height={2} fill="#00000033" />
```

`src/content/city-life.tsx` : supprimer la constante locale `FAR_SHRINK` (et son commentaire), l'importer depuis `../core/library/city/metrics` avec `STREET_SCALE` et `cityMetrics` ; dans `StreetLamps`, remplacer `const curb = m.ground + height * 0.07;` par `const curb = m.curb;`.

`src/content/scene-weather.tsx` : importer `CITY_GROUND` depuis `../core/library/city/metrics` et remplacer `city: 0.78` par `city: CITY_GROUND` dans `GROUND` et dans `ARC_FOOT`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/library/city-metrics.test.ts tests/core/library/city-facades.test.ts --maxWorkers=4`
Expected: PASS.

Run: `npx vitest run tests/content tests/core/library --maxWorkers=4`
Expected: PASS. Si un test de la ville ou de la météo encode l'ancien sol (0,78 ou une position en px qui en découle), mettre à jour SA valeur attendue vers le nouveau sol, sans changer ce qu'il vérifie, et le mentionner dans le rapport.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/scene-world.ts src/core/library/city/metrics.ts src/core/library/city/facades.ts src/content/scene-city.tsx src/content/city-life.tsx src/content/scene-weather.tsx tests/core/library/city-metrics.test.ts tests/core/library/city-facades.test.ts
git commit -m "feat(ville): route remontée, les deux files se voient depuis la fenêtre la plus basse

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Ajouter au `git add` tout test mis à jour à l'étape 4.)

---

### Task 2: Moteur d'événements (catalogue, programme, voitures qui s'effacent)

**Files:**
- Modify: `src/core/library/city/vehicles.ts`
- Create: `src/core/library/city/events.ts`
- Test: `tests/core/library/city-events.test.ts`

**Interfaces:**
- Consumes: `cityMetrics`, `STREET_SCALE`, `FAR_SHRINK` (metrics, Task 1) ; `Vehicle`, `Lane`, `LANE_DIR`, `VEHICLE_HALF`, `vehiclesFor` (vehicles) ; `CityContext`, `CityIntensity` (intensity) ; `WORLD_MARGIN`, `loopX`, `hashString`, `mulberry32` (scene-world).
- Produces (vehicles.ts) : `type LaneSpeeds = { near: number; far: number; bike: number }`, `laneSpeeds(seed: number): LaneSpeeds` (mêmes tirages qu'avant dans `vehiclesFor`).
- Produces (events.ts) :
  - `SLOT_S = 25`, `HYPER_SLOTS = 48`, `HYPER_S = 1200`, `EVENT_CHANCE = 0.2`, `MAX_EVENTS = 2`, `DARK = 0.3`, `DAY = 0.35`
  - `type CityEventId = 'plane' | 'helicopter' | 'drone' | 'balloon' | 'kite' | 'banner-plane' | 'bus' | 'tram' | 'ambulance' | 'garbage-truck' | 'delivery-bike' | 'dog-walker' | 'crane' | 'umbrella-group' | 'apartment' | 'fireworks'`
  - `type EventLayer = 'sky' | 'street' | 'sidewalk' | 'fixed'`, `type Track = Lane | 'bike'`
  - `type EventDef` (voir code), `EVENT_DEFS: readonly EventDef[]`, `STILL_EVENTS: ReadonlySet<CityEventId>`
  - `type EventConditions = { daylight: number; wet: boolean; workday: boolean; traffic: number; walkers: number }`
  - `eventConditions(city: CityContext, i: CityIntensity): EventConditions`, `conditionsKey(c: EventConditions): string`, `eligible(def: EventDef, minute: number, c: EventConditions): boolean`
  - `type CityEvent = { key: string; id: CityEventId; layer: EventLayer; start: number; end: number; dir: 1 | -1; track: Track | null; speed: number; x0: number; y: number; pick: number; variant: number; yields: string[] }`
  - `type ScheduleInput = { seed: number; width: number; hyper: number; minutesAtHyperStart: number; cond: EventConditions; vehicles: Vehicle[]; speeds: LaneSpeeds }`
  - `cityEventSchedule(input: ScheduleInput): CityEvent[]`, `activeEvents(schedule: CityEvent[], t: number): CityEvent[]`, `eventX(e: CityEvent, width: number, t: number): number`, `travelSpan(width: number): number`, `yieldsFor(e: CityEvent, half: number, vehicles: Vehicle[], width: number): string[]`, `defOf(id: CityEventId): EventDef`

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/library/city-events.test.ts
import { describe, expect, it } from 'vitest';
import {
  EVENT_DEFS, HYPER_S, MAX_EVENTS, SLOT_S, activeEvents, cityEventSchedule, conditionsKey, defOf, eligible, eventX, travelSpan,
  type EventConditions, type ScheduleInput,
} from '../../../src/core/library/city/events';
import { STREET_SCALE, FAR_SHRINK } from '../../../src/core/library/city/metrics';
import { LANE_DIR, VEHICLE_HALF, laneSpeeds, vehiclesFor } from '../../../src/core/library/city/vehicles';
import { WORLD_MARGIN, loopX } from '../../../src/core/library/scene-world';

const DAY_DRY: EventConditions = { daylight: 1, wet: false, workday: true, traffic: 0.6, walkers: 0.5 };
const NIGHT_DRY: EventConditions = { daylight: 0, wet: false, workday: true, traffic: 0.2, walkers: 0.2 };
const input = (hyper: number, cond: EventConditions, minutes: number, seed = 7, width = 720): ScheduleInput => ({
  seed, width, hyper, minutesAtHyperStart: minutes, cond, vehicles: vehiclesFor(width, seed), speeds: laneSpeeds(seed),
});
const many = (cond: EventConditions, minutes: number, n = 120) => Array.from({ length: n }, (_, h) => cityEventSchedule(input(1_440_000 + h, cond, minutes))).flat();

describe('catalogue', () => {
  it('contient 16 événements, sans enseigne néon', () => {
    expect(EVENT_DEFS).toHaveLength(16);
    expect(EVENT_DEFS.map((d) => d.id)).not.toContain('neon');
    expect(new Set(EVENT_DEFS.map((d) => d.id)).size).toBe(16);
  });
  it('vitesse de laneSpeeds identique à celle des véhicules de la file', () => {
    const s = laneSpeeds(7);
    for (const v of vehiclesFor(720, 7)) expect(v.speed).toBeCloseTo(v.kind === 'bike' ? s.bike : s[v.lane], 9);
  });
});

describe('conditions', () => {
  it('pas de feu d’artifice ni d’appartement de jour, pas de cerf-volant sous la pluie', () => {
    expect(eligible(defOf('fireworks'), 22 * 60, DAY_DRY)).toBe(false);
    expect(eligible(defOf('fireworks'), 22 * 60, NIGHT_DRY)).toBe(true);
    expect(eligible(defOf('fireworks'), 22 * 60, { ...NIGHT_DRY, wet: true })).toBe(false);
    expect(eligible(defOf('apartment'), 19 * 60, DAY_DRY)).toBe(false);
    expect(eligible(defOf('kite'), 14 * 60, { ...DAY_DRY, wet: true })).toBe(false);
    expect(eligible(defOf('umbrella-group'), 14 * 60, DAY_DRY)).toBe(false);
    expect(eligible(defOf('umbrella-group'), 14 * 60, { ...DAY_DRY, wet: true })).toBe(true);
    expect(eligible(defOf('crane'), 10 * 60, { ...DAY_DRY, workday: false })).toBe(false);
    expect(eligible(defOf('garbage-truck'), 14 * 60, DAY_DRY)).toBe(false);
    expect(eligible(defOf('garbage-truck'), 7 * 60, DAY_DRY)).toBe(true);
  });
  it('les plages qui passent minuit sont respectées', () => {
    expect(eligible(defOf('tram'), 10, NIGHT_DRY)).toBe(true); // 0 h 10
    expect(eligible(defOf('tram'), 3 * 60, NIGHT_DRY)).toBe(false);
  });
  it('la clé ne change que si une condition passe un seuil', () => {
    expect(conditionsKey({ ...DAY_DRY, traffic: 0.6 })).toBe(conditionsKey({ ...DAY_DRY, traffic: 0.9 }));
    expect(conditionsKey(DAY_DRY)).not.toBe(conditionsKey({ ...DAY_DRY, wet: true }));
    expect(conditionsKey(DAY_DRY)).not.toBe(conditionsKey(NIGHT_DRY));
  });
});

describe('programme', () => {
  it('est déterministe', () => {
    expect(cityEventSchedule(input(1_440_123, DAY_DRY, 600))).toEqual(cityEventSchedule(input(1_440_123, DAY_DRY, 600)));
  });
  it('ne déborde jamais de son grand créneau et respecte le plafond simultané', () => {
    for (let h = 1_440_000; h < 1_440_060; h++) {
      const s = cityEventSchedule(input(h, DAY_DRY, 600));
      for (const e of s) {
        expect(e.start).toBeGreaterThanOrEqual(h * HYPER_S);
        expect(e.end).toBeLessThanOrEqual((h + 1) * HYPER_S);
      }
      for (let t = h * HYPER_S; t < (h + 1) * HYPER_S; t += 1) {
        const a = activeEvents(s, t);
        expect(a.length).toBeLessThanOrEqual(MAX_EVENTS);
        expect(new Set(a.map((e) => e.id)).size).toBe(a.length);
        const tracks = a.map((e) => e.track).filter((x) => x !== null);
        expect(new Set(tracks).size).toBe(tracks.length);
      }
    }
  });
  it('« de temps en temps » : entre 5 % et 20 % des créneaux lancent un événement', () => {
    const n = 200;
    const count = many(DAY_DRY, 600, n).length;
    expect(count / (n * (HYPER_S / SLOT_S))).toBeGreaterThan(0.05);
    expect(count / (n * (HYPER_S / SLOT_S))).toBeLessThan(0.2);
  });
  it('la nuit à 22 h il n’y a ni cerf-volant ni drone ; de jour aucun feu d’artifice', () => {
    expect(many(NIGHT_DRY, 22 * 60).some((e) => e.id === 'kite' || e.id === 'drone')).toBe(false);
    expect(many(DAY_DRY, 12 * 60).some((e) => e.id === 'fireworks')).toBe(false);
  });
});

describe('trajets', () => {
  it('une traversée avance à vitesse constante, de bord à bord', () => {
    const e = many(DAY_DRY, 600).find((x) => x.layer === 'sky')!;
    expect(eventX(e, 720, e.start + 1) - eventX(e, 720, e.start)).toBeCloseTo(e.dir * e.speed, 6);
    expect(eventX(e, 720, e.start)).toBeCloseTo(e.dir > 0 ? -WORLD_MARGIN : 720 + WORLD_MARGIN, 6);
    expect(e.end - e.start).toBeCloseTo(travelSpan(720) / e.speed, 6);
  });
  it('un événement fixe reste à sa place', () => {
    const e = many(DAY_DRY, 600).find((x) => x.layer === 'fixed')!;
    expect(eventX(e, 720, e.start)).toBe(eventX(e, 720, e.end - 1));
  });
  it('un véhicule d’événement à la vitesse de sa file efface les voitures collées à lui, à distance constante', () => {
    const all = many(DAY_DRY, 8 * 60, 300);
    const e = all.find((x) => (x.id === 'bus' || x.id === 'tram') && x.yields.length > 0);
    expect(e).toBeDefined();
    const vehicles = vehiclesFor(720, 7);
    const L = travelSpan(720);
    const dist = (vx: number, ex: number) => { const d = (((vx - ex) % L) + L) % L; return Math.min(d, L - d); };
    for (const id of e!.yields) {
      const v = vehicles.find((x) => x.id === id)!;
      expect(v.lane).toBe(e!.track);
      expect(v.kind).not.toBe('bike');
      const at = (t: number) => dist(loopX(v.phase, LANE_DIR[v.lane] * v.speed, 720, t), eventX(e!, 720, t));
      expect(at(e!.start)).toBeLessThan(defOf(e!.id).half + VEHICLE_HALF[v.kind] * STREET_SCALE.vehicle * v.scale * (v.lane === 'far' ? FAR_SHRINK : 1) + 10.001);
      expect(at((e!.start + e!.end) / 2)).toBeCloseTo(at(e!.start), 4);
    }
  });
  it('l’ambulance n’efface personne (les voitures se rangent)', () => {
    for (const e of many(DAY_DRY, 600, 300).filter((x) => x.id === 'ambulance')) expect(e.yields).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/library/city-events.test.ts --maxWorkers=4`
Expected: FAIL (module `events` introuvable, `laneSpeeds` non exporté).

- [ ] **Step 3: Implement**

Dans `src/core/library/city/vehicles.ts`, ajouter avant `vehiclesFor` :

```ts
export type LaneSpeeds = { near: number; far: number; bike: number };

// Vitesse commune des véhicules motorisés de chaque file, et des vélos entre eux (tirée de la graine de la pièce).
export function laneSpeeds(seed: number): LaneSpeeds {
  const laneRng = mulberry32(seed ^ hashString('lane-speed'));
  return { near: 55 + laneRng() * 30, far: 50 + laneRng() * 30, bike: 18 + laneRng() * 6 };
}
```

et dans `vehiclesFor`, remplacer les deux lignes `const laneRng = …` / `const speeds = …` par `const speeds = laneSpeeds(seed);`.

Créer `src/core/library/city/events.ts` :

```ts
import { WORLD_MARGIN, hashString, loopX, mulberry32 } from '../scene-world';
import type { CityContext, CityIntensity } from './intensity';
import { FAR_SHRINK, STREET_SCALE } from './metrics';
import { LANE_DIR, VEHICLE_HALF, type Lane, type LaneSpeeds, type Vehicle } from './vehicles';

// Événements de la ville (vague 1b-i) : le temps est découpé en créneaux de 25 s, regroupés en grands créneaux de 20 min.
// Le programme d'un grand créneau est tiré d'un coup (graine de la pièce + numéro du créneau), dans l'ordre : un événement
// n'est retenu que s'il finit dans son grand créneau et ne dépasse pas le plafond simultané. Aucun état, aucun Math.random.
export const SLOT_S = 25;
export const HYPER_SLOTS = 48;
export const HYPER_S = SLOT_S * HYPER_SLOTS;
export const EVENT_CHANCE = 0.2;
export const MAX_EVENTS = 2;
// Seuils de lumière du jour : « nuit » sous DARK, « jour » à partir de DAY.
export const DARK = 0.3;
export const DAY = 0.35;
const TRAFFIC_MIN = 0.1;
const WALKERS_MIN = 0.08;
// Marge (px) entre un véhicule d'événement et une voiture de sa file en dessous de laquelle la voiture s'efface.
const YIELD_MARGIN = 10;

export type CityEventId =
  | 'plane' | 'helicopter' | 'drone' | 'balloon' | 'kite' | 'banner-plane'
  | 'bus' | 'tram' | 'ambulance' | 'garbage-truck' | 'delivery-bike'
  | 'dog-walker' | 'umbrella-group'
  | 'crane' | 'apartment' | 'fireworks';
export type EventLayer = 'sky' | 'street' | 'sidewalk' | 'fixed';
export type Track = Lane | 'bike';

// Un événement en données. `hours` : plages [début, fin) en minutes ; fin < début = la plage passe minuit.
// `speed` (px/s) : traversée ; absent pour un véhicule de rue = vitesse de sa file. `duration` (s) : événement fixe.
// `half` : demi-longueur dessinée (px à l'échelle 1) pour l'écart avec la circulation. `y` : bande de hauteur (fraction).
export type EventDef = {
  id: CityEventId;
  layer: EventLayer;
  weight: number;
  hours: readonly (readonly [number, number])[];
  half: number;
  speed?: number;
  duration?: number;
  light?: 'day' | 'dark';
  rain?: 'dry' | 'wet';
  workday?: true;
  needs?: 'traffic' | 'walkers';
  y?: readonly [number, number];
  lanes?: readonly Lane[] | 'bike';
};

const ALL_DAY = [[0, 1440]] as const;

export const EVENT_DEFS: readonly EventDef[] = [
  // Ciel
  { id: 'plane', layer: 'sky', weight: 3, hours: ALL_DAY, half: 20, speed: 70, y: [0.05, 0.16] },
  { id: 'helicopter', layer: 'sky', weight: 1.2, hours: [[420, 1320]], half: 26, speed: 40, y: [0.12, 0.26] },
  { id: 'drone', layer: 'sky', weight: 1, hours: [[540, 1140]], half: 10, speed: 16, light: 'day', rain: 'dry', y: [0.3, 0.42] },
  { id: 'balloon', layer: 'sky', weight: 0.6, hours: [[420, 1200]], half: 16, speed: 7, light: 'day', rain: 'dry', y: [0.1, 0.24] },
  { id: 'banner-plane', layer: 'sky', weight: 0.8, hours: [[600, 1140]], half: 60, speed: 35, light: 'day', rain: 'dry', y: [0.08, 0.16] },
  // Rue
  { id: 'bus', layer: 'street', weight: 2, hours: [[360, 1380]], half: 36, lanes: ['near', 'far'], needs: 'traffic' },
  { id: 'tram', layer: 'street', weight: 1.5, hours: [[330, 1440], [0, 30]], half: 68, lanes: ['far'] },
  { id: 'ambulance', layer: 'street', weight: 1, hours: ALL_DAY, half: 21, speed: 130, lanes: ['near', 'far'] },
  { id: 'garbage-truck', layer: 'street', weight: 1.5, hours: [[330, 540]], half: 34, lanes: ['near'] },
  { id: 'delivery-bike', layer: 'street', weight: 1.5, hours: [[690, 840], [1110, 1380]], half: 12, lanes: 'bike' },
  // Trottoir
  { id: 'dog-walker', layer: 'sidewalk', weight: 2, hours: [[390, 1350]], half: 20, speed: 9, needs: 'walkers' },
  { id: 'umbrella-group', layer: 'sidewalk', weight: 3, hours: [[420, 1260]], half: 20, speed: 18, rain: 'wet' },
  // Fixes
  { id: 'kite', layer: 'fixed', weight: 0.8, hours: [[600, 1140]], half: 10, duration: 90, light: 'day', rain: 'dry', y: [0.2, 0.32] },
  { id: 'crane', layer: 'fixed', weight: 1, hours: [[480, 1020]], half: 60, duration: 360, light: 'day', workday: true },
  { id: 'apartment', layer: 'fixed', weight: 2, hours: [[1050, 1410]], half: 4, duration: 180, light: 'dark' },
  { id: 'fireworks', layer: 'fixed', weight: 0.25, hours: [[1290, 1440], [0, 30]], half: 140, duration: 30, light: 'dark', rain: 'dry', y: [0.1, 0.3] },
];

// En mouvement réduit, seuls ces événements fixes restent (figés) ; rien ne traverse, aucun feu d'artifice.
export const STILL_EVENTS: ReadonlySet<CityEventId> = new Set<CityEventId>(['kite', 'crane', 'apartment']);

export const defOf = (id: CityEventId): EventDef => EVENT_DEFS.find((d) => d.id === id)!;

export type EventConditions = { daylight: number; wet: boolean; workday: boolean; traffic: number; walkers: number };

export function eventConditions(city: CityContext, i: CityIntensity): EventConditions {
  const k = city.day.kind;
  return { daylight: city.daylight, wet: city.precip >= 0.2, workday: k === 'school' || k === 'wednesday' || k === 'holiday', traffic: i.traffic, walkers: i.walkers };
}

// Clé grossière : le programme n'est recalculé que si une condition passe un des seuils qu'utilise `eligible`.
export function conditionsKey(c: EventConditions): string {
  const light = c.daylight < DARK ? 'n' : c.daylight >= DAY ? 'd' : 't';
  return `${light}${c.wet ? 'w' : 's'}${c.workday ? 'o' : 'f'}${c.traffic >= TRAFFIC_MIN ? 'T' : 't'}${c.walkers >= WALKERS_MIN ? 'W' : 'w'}`;
}

const inHours = (hours: EventDef['hours'], m: number): boolean => hours.some(([a, b]) => (a <= b ? m >= a && m < b : m >= a || m < b));

export function eligible(def: EventDef, minute: number, c: EventConditions): boolean {
  if (!inHours(def.hours, minute)) return false;
  if (def.light === 'day' && c.daylight < DAY) return false;
  if (def.light === 'dark' && c.daylight >= DARK) return false;
  if (def.rain === 'dry' && c.wet) return false;
  if (def.rain === 'wet' && !c.wet) return false;
  if (def.workday && !c.workday) return false;
  if (def.needs === 'traffic' && c.traffic < TRAFFIC_MIN) return false;
  if (def.needs === 'walkers' && c.walkers < WALKERS_MIN) return false;
  return true;
}

// `x0` : position d'un événement fixe ; `y` : hauteur tirée (fraction) ; `pick`, `variant` : tirages libres pour le rendu
// (immeuble, fenêtre, couleurs) ; `yields` : voitures de la même file effacées pendant tout le passage.
export type CityEvent = {
  key: string;
  id: CityEventId;
  layer: EventLayer;
  start: number;
  end: number;
  dir: 1 | -1;
  track: Track | null;
  speed: number;
  x0: number;
  y: number;
  pick: number;
  variant: number;
  yields: string[];
};

export type ScheduleInput = { seed: number; width: number; hyper: number; minutesAtHyperStart: number; cond: EventConditions; vehicles: Vehicle[]; speeds: LaneSpeeds };

export const travelSpan = (width: number): number => width + 2 * WORLD_MARGIN;

const trackFor = (def: EventDef, lean: number): Track | null => {
  if (def.lanes === 'bike') return 'bike';
  if (!def.lanes) return null;
  return def.lanes[Math.floor(lean * def.lanes.length)]!;
};

const pickWeighted = (pool: EventDef[], roll: number): EventDef => {
  const total = pool.reduce((s, d) => s + d.weight, 0);
  let acc = roll * total;
  for (const d of pool) {
    acc -= d.weight;
    if (acc < 0) return d;
  }
  return pool[pool.length - 1]!;
};

export function eventX(e: CityEvent, width: number, t: number): number {
  if (e.speed === 0) return e.x0;
  const run = e.speed * (t - e.start);
  return e.dir > 0 ? -WORLD_MARGIN + run : width + WORLD_MARGIN - run;
}

const trackOf = (v: Vehicle): Track => (v.kind === 'bike' ? 'bike' : v.lane);
const ambientHalf = (v: Vehicle): number => VEHICLE_HALF[v.kind] * STREET_SCALE.vehicle * v.scale * (v.lane === 'far' ? FAR_SHRINK : 1);

// Même vitesse et même sens que la file : l'écart (sur la boucle du monde) avec chaque voiture est constant pendant tout
// le passage. Les voitures trop proches au départ s'effacent donc jusqu'à la fin, sans clignoter.
export function yieldsFor(e: CityEvent, half: number, vehicles: Vehicle[], width: number): string[] {
  const loop = travelSpan(width);
  const xe = eventX(e, width, e.start);
  return vehicles
    .filter((v) => trackOf(v) === e.track)
    .filter((v) => {
      const xv = loopX(v.phase, LANE_DIR[v.lane] * v.speed, width, e.start);
      const d = (((xv - xe) % loop) + loop) % loop;
      return Math.min(d, loop - d) < half + ambientHalf(v) + YIELD_MARGIN;
    })
    .map((v) => v.id);
}

export function cityEventSchedule(input: ScheduleInput): CityEvent[] {
  const { seed, width, hyper, cond, vehicles, speeds } = input;
  const t0 = hyper * HYPER_S;
  const out: CityEvent[] = [];
  for (let n = 0; n < HYPER_SLOTS; n++) {
    const rng = mulberry32(seed ^ hashString('city-events') ^ Math.imul(hyper * HYPER_SLOTS + n + 1, 2654435761));
    // Toujours le même nombre de tirages par créneau : un changement de condition ne décale pas les créneaux suivants.
    const chance = rng();
    const roll = rng();
    const lean = rng();
    const dirRoll = rng();
    const yRoll = rng();
    const pick = rng();
    const variant = rng();
    const offset = rng();
    if (chance >= EVENT_CHANCE) continue;
    const start = t0 + n * SLOT_S + offset * SLOT_S * 0.6;
    const minute = (((Math.floor(input.minutesAtHyperStart + (start - t0) / 60)) % 1440) + 1440) % 1440;
    const pool = EVENT_DEFS.filter((d) => eligible(d, minute, cond));
    if (pool.length === 0) continue;
    const def = pickWeighted(pool, roll);
    const track = trackFor(def, lean);
    const dir: 1 | -1 = track === 'bike' ? 1 : track ? LANE_DIR[track] : dirRoll < 0.5 ? 1 : -1;
    const speed = def.layer === 'fixed' ? 0 : def.speed ?? (track === 'bike' ? speeds.bike : speeds[track as Lane]);
    const end = start + (def.layer === 'fixed' ? def.duration! : travelSpan(width) / speed);
    if (end > t0 + HYPER_S) continue;
    const overlapping = out.filter((e) => e.start < end && start < e.end);
    if (overlapping.length >= MAX_EVENTS) continue;
    if (overlapping.some((e) => e.id === def.id || (track !== null && e.track === track))) continue;
    const [ya, yb] = def.y ?? [0, 0];
    const ev: CityEvent = {
      key: `ev-${hyper}-${n}`,
      id: def.id,
      layer: def.layer,
      start,
      end,
      dir,
      track,
      speed,
      x0: 40 + pick * Math.max(0, width - 80),
      y: ya + yRoll * (yb - ya),
      pick,
      variant,
      yields: [],
    };
    if (track !== null && def.speed === undefined) ev.yields = yieldsFor(ev, def.half, vehicles, width);
    out.push(ev);
  }
  return out;
}

export const activeEvents = (schedule: CityEvent[], t: number): CityEvent[] => schedule.filter((e) => e.start <= t && t < e.end);
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/library/city-events.test.ts tests/core/library/city-vehicles.test.ts --maxWorkers=4`
Expected: PASS. Si `city-vehicles.test.ts` n'existe pas, lancer seulement le premier fichier. Si le test de fréquence échoue, ne pas changer `EVENT_CHANCE` : vérifier que les rejets viennent bien du plafond et rapporter le taux mesuré.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/city/vehicles.ts src/core/library/city/events.ts tests/core/library/city-events.test.ts
git commit -m "feat(ville): moteur d'événements par créneaux de 25 s et catalogue de 16 événements

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Placement des événements et voitures qui se rangent

**Files:**
- Create: `src/core/library/city/event-place.ts`
- Test: `tests/core/library/city-event-place.test.ts`

**Interfaces:**
- Consumes: `CityEvent`, `eventX` (Task 2) ; `CityMetrics`, `STREET_SCALE`, `FAR_SHRINK` (Task 1) ; `Facade` (facades).
- Produces:
  - `PULL_DY = 7`, `AMB_DY = 5`, `BIKE_TRACK_DY = 2`, `SKY_SCALE: Partial<Record<CityEventId, number>>`
  - `type EventFrame = { width: number; height: number; metrics: CityMetrics; facades: Facade[] }`
  - `type EventPlacement = { x: number; y: number; sx: number; sy: number }`
  - `placeEvent(e: CityEvent, t: number, f: EventFrame): EventPlacement`
  - `pullOver(amb: CityEvent, xv: number, width: number, t: number): number` (0 = à sa place, 1 = rangée)
  - `nearFacades(f: EventFrame): Facade[]`, `apartmentLamp(e: CityEvent, f: EventFrame): { x: number; y: number }`

Repères des dessins (Task 4) : véhicules et passants ont les pieds/roues à y = 0 et regardent vers +x ; la grue a le pied du mât à y = 0 ; le feu d'artifice est dessiné dans le repère de la scène (340 px de haut) à partir de x = 0 ; la fenêtre d'appartement est dessinée à partir de son coin haut-gauche.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/library/city-event-place.test.ts
import { describe, expect, it } from 'vitest';
import { AMB_DY, BIKE_TRACK_DY, apartmentLamp, nearFacades, placeEvent, pullOver, type EventFrame } from '../../../src/core/library/city/event-place';
import { eventX, type CityEvent } from '../../../src/core/library/city/events';
import { cityFacades } from '../../../src/core/library/city/facades';
import { FAR_SHRINK, STREET_SCALE, cityMetrics } from '../../../src/core/library/city/metrics';

const frame: EventFrame = { width: 720, height: 340, metrics: cityMetrics(340), facades: cityFacades(720, 340, 7) };
const ev = (over: Partial<CityEvent>): CityEvent => ({
  key: 'ev-1-0', id: 'plane', layer: 'sky', start: 1000, end: 1012, dir: 1, track: null, speed: 70, x0: 300, y: 0.1, pick: 0.5, variant: 0.3, yields: [], ...over,
});

describe('placeEvent', () => {
  it('ciel : position de traversée, hauteur tirée, retourné selon le sens', () => {
    const e = ev({ dir: -1 });
    const p = placeEvent(e, 1005, frame);
    expect(p.x).toBeCloseTo(eventX(e, 720, 1005), 6);
    expect(p.y).toBeCloseTo(34, 6);
    expect(p.sx).toBeLessThan(0);
    expect(p.sy).toBeGreaterThan(0);
  });
  it('rue : sur sa file, l’ambulance près du marquage central, le livreur sur la piste', () => {
    const m = frame.metrics;
    expect(placeEvent(ev({ id: 'bus', layer: 'street', track: 'near' }), 1001, frame).y).toBeCloseTo(m.laneY.near, 6);
    expect(placeEvent(ev({ id: 'ambulance', layer: 'street', track: 'near' }), 1001, frame).y).toBeCloseTo(m.laneY.near - AMB_DY * m.unit, 6);
    expect(placeEvent(ev({ id: 'ambulance', layer: 'street', track: 'far', dir: -1 }), 1001, frame).y).toBeCloseTo(m.laneY.far + AMB_DY * m.unit, 6);
    expect(placeEvent(ev({ id: 'delivery-bike', layer: 'street', track: 'bike' }), 1001, frame).y).toBeCloseTo(m.laneY.near + BIKE_TRACK_DY * m.unit, 6);
    const far = placeEvent(ev({ id: 'tram', layer: 'street', track: 'far', dir: -1 }), 1001, frame);
    expect(far.sx).toBeCloseTo(-m.unit * STREET_SCALE.vehicle * FAR_SHRINK, 6);
  });
  it('trottoir : à hauteur des passants, à leur échelle', () => {
    const p = placeEvent(ev({ id: 'dog-walker', layer: 'sidewalk' }), 1001, frame);
    expect(p.y).toBeCloseTo(frame.metrics.walkY, 6);
    expect(p.sy).toBeCloseTo(frame.metrics.unit * STREET_SCALE.person, 6);
  });
  it('fixes : la grue part du sol, le feu d’artifice du haut de la scène, l’appartement sur une vraie fenêtre', () => {
    const crane = placeEvent(ev({ id: 'crane', layer: 'fixed', speed: 0 }), 1001, frame);
    expect(crane.x).toBe(300);
    expect(crane.y).toBeCloseTo(frame.metrics.ground, 6);
    const fw = placeEvent(ev({ id: 'fireworks', layer: 'fixed', speed: 0 }), 1001, frame);
    expect(fw.y).toBe(0);
    const apt = ev({ id: 'apartment', layer: 'fixed', speed: 0 });
    const lamp = apartmentLamp(apt, frame);
    expect(nearFacades(frame).some((b) => b.lamps.some((l) => l.x === lamp.x && l.y === lamp.y))).toBe(true);
    expect(placeEvent(apt, 1001, frame)).toEqual({ x: lamp.x, y: lamp.y, sx: 1, sy: 1 });
  });
});

describe('pullOver', () => {
  const amb = ev({ id: 'ambulance', layer: 'street', track: 'near', speed: 130, start: 0, end: 10 });
  it('rien quand l’ambulance est loin derrière ou déjà loin devant, rangé quand elle passe', () => {
    const xa = eventX(amb, 720, 2);
    expect(pullOver(amb, xa + 400, 720, 2)).toBe(0);
    expect(pullOver(amb, xa + 30, 720, 2)).toBe(1);
    expect(pullOver(amb, xa - 10, 720, 2)).toBe(1);
    expect(pullOver(amb, xa - 200, 720, 2)).toBe(0);
    const mid = pullOver(amb, xa + 110, 720, 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
  it('tient compte du sens de la file du fond', () => {
    const back = { ...amb, track: 'far' as const, dir: -1 as const };
    const xa = eventX(back, 720, 2);
    expect(pullOver(back, xa - 30, 720, 2)).toBe(1);
    expect(pullOver(back, xa + 200, 720, 2)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/library/city-event-place.test.ts --maxWorkers=4`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implement**

```ts
// src/core/library/city/event-place.ts
import { eventX, type CityEvent, type CityEventId } from './events';
import type { Facade } from './facades';
import { FAR_SHRINK, STREET_SCALE, type CityMetrics } from './metrics';

// Une voiture qui se range devant l'ambulance se décale de PULL_DY px vers le bord de la chaussée ;
// l'ambulance roule à AMB_DY px de sa file, du côté du marquage central. Les vélos roulent BIKE_TRACK_DY px sous la file.
export const PULL_DY = 7;
export const AMB_DY = 5;
export const BIKE_TRACK_DY = 2;
// Échelle des dessins du ciel (maquette validée).
export const SKY_SCALE: Partial<Record<CityEventId, number>> = { plane: 0.8, helicopter: 0.9, drone: 1, balloon: 1, 'banner-plane': 0.9 };

export type EventFrame = { width: number; height: number; metrics: CityMetrics; facades: Facade[] };
export type EventPlacement = { x: number; y: number; sx: number; sy: number };

const smooth = (x: number): number => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

// `ahead` > 0 : la voiture est devant l'ambulance. Elle commence à se ranger à 150 px, l'est tout à fait à 60 px,
// le reste pendant que l'ambulance passe (jusqu'à 20 px après), puis reprend sa place en 40 px.
export function pullOver(amb: CityEvent, xv: number, width: number, t: number): number {
  const ahead = (xv - eventX(amb, width, t)) * amb.dir;
  return smooth((150 - ahead) / 90) * (1 - smooth((-20 - ahead) / 40));
}

export const nearFacades = (f: EventFrame): Facade[] => f.facades.filter((b) => !b.far && b.x + b.w > 0 && b.x < f.width);

// Fenêtre qui s'allume : un immeuble du premier plan (tirage `pick`), puis une de ses fenêtres (tirage `variant`).
export function apartmentLamp(e: CityEvent, f: EventFrame): { x: number; y: number } {
  const near = nearFacades(f);
  const b = near[Math.min(near.length - 1, Math.floor(e.pick * near.length))];
  if (!b || b.lamps.length === 0) return { x: e.x0, y: f.metrics.ground - 60 * f.metrics.unit };
  const lamp = b.lamps[Math.min(b.lamps.length - 1, Math.floor(e.variant * b.lamps.length))]!;
  return { x: lamp.x, y: lamp.y };
}

export function placeEvent(e: CityEvent, t: number, f: EventFrame): EventPlacement {
  const m = f.metrics;
  const x = eventX(e, f.width, t);
  switch (e.layer) {
    case 'sky': {
      const k = m.unit * (SKY_SCALE[e.id] ?? 1);
      return { x, y: e.y * f.height, sx: e.dir * k, sy: k };
    }
    case 'street': {
      const lane = e.track === 'far' ? 'far' : 'near';
      const k = m.unit * STREET_SCALE.vehicle * (lane === 'far' ? FAR_SHRINK : 1);
      let y = m.laneY[lane];
      if (e.track === 'bike') y += BIKE_TRACK_DY * m.unit;
      if (e.id === 'ambulance') y += (lane === 'near' ? -AMB_DY : AMB_DY) * m.unit;
      return { x, y, sx: e.dir * k, sy: k };
    }
    case 'sidewalk': {
      const k = m.unit * STREET_SCALE.person;
      return { x, y: m.walkY, sx: e.dir * k, sy: k };
    }
    case 'fixed':
      if (e.id === 'apartment') return { ...apartmentLamp(e, f), sx: 1, sy: 1 };
      if (e.id === 'fireworks') return { x, y: 0, sx: m.unit, sy: m.unit };
      if (e.id === 'crane') return { x, y: m.ground, sx: m.unit, sy: m.unit };
      return { x, y: e.y * f.height, sx: m.unit, sy: m.unit };
    default: {
      const never: never = e.layer;
      return never;
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/library/city-event-place.test.ts --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/city/event-place.ts tests/core/library/city-event-place.test.ts
git commit -m "feat(ville): position des événements, voitures qui se rangent devant l'ambulance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Dessins des 16 événements

**Files:**
- Modify: `src/content/city-sprites.tsx` (exporter `tone`)
- Create: `src/content/city-event-sprites.tsx`
- Test: `tests/content/city-event-sprites.test.tsx`

**Interfaces:**
- Consumes: `CityEvent`, `CityEventId`, `EVENT_DEFS` (Task 2) ; `PersonSprite`, `tone` (city-sprites) ; `outfitFor` (people) ; `hashString`, `mulberry32` (scene-world) ; `Sky` (sky).
- Produces: `CityEventSprite({ event, sky, still, lights, rainy }: { event: CityEvent; sky: Sky; still: boolean; lights: boolean; rainy: boolean }): ReactElement` — racine `<g data-event-sprite={event.id}>` ; aucun `<animate>`/`<animateTransform>` quand `still` ; aucun id SVG fixe.

Dessins portés de la maquette validée. Repères : véhicules, passants et chien ont les pieds ou les roues à y = 0 et regardent vers +x (le sens est donné par `sx` du placement) ; ciel centré sur (0, 0) ; grue : pied du mât à (0, 0), mât de 200 px vers le haut ; feu d'artifice : bouquets autour de x ∈ [−120, 120], y ∈ [40, 80], fusées partant de y = 250 (sous les toits : le masque des immeubles les cache au départ) ; appartement : rectangle 5 × 7 depuis (0, 0).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// tests/content/city-event-sprites.test.tsx
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { CityEventSprite } from '../../src/content/city-event-sprites';
import { EVENT_DEFS, type CityEvent } from '../../src/core/library/city/events';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const sky = skyAt(12 * 60, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));
const draw = (event: CityEvent, still: boolean): SVGSVGElement => {
  const host = document.createElement('div');
  act(() => createRoot(host).render(<svg><CityEventSprite event={event} sky={sky} still={still} lights rainy={false} /></svg>));
  return host.querySelector('svg')!;
};
const ev = (id: CityEvent['id']): CityEvent => ({ key: `k-${id}`, id, layer: EVENT_DEFS.find((d) => d.id === id)!.layer, start: 0, end: 10, dir: 1, track: null, speed: 1, x0: 0, y: 0.1, pick: 0.4, variant: 0.6, yields: [] });

describe('CityEventSprite', () => {
  it.each(EVENT_DEFS.map((d) => d.id))('dessine %s sans id fixe', (id) => {
    const svg = draw(ev(id), false);
    expect(svg.querySelector(`[data-event-sprite="${id}"]`)).not.toBeNull();
    expect(svg.querySelector(`[data-event-sprite="${id}"]`)!.childElementCount).toBeGreaterThan(0);
    expect(svg.querySelector('[id]')).toBeNull();
  });
  it.each(EVENT_DEFS.map((d) => d.id))('%s : aucune animation en mouvement réduit', (id) => {
    expect(draw(ev(id), true).querySelectorAll('animate, animateTransform')).toHaveLength(0);
  });
  it('l’hélicoptère, l’ambulance et le feu d’artifice sont animés hors mouvement réduit', () => {
    for (const id of ['helicopter', 'ambulance', 'fireworks'] as const) expect(draw(ev(id), false).querySelectorAll('animate, animateTransform').length).toBeGreaterThan(0);
  });
  it('le groupe pressé porte des parapluies, le promeneur tient un chien', () => {
    expect(draw(ev('umbrella-group'), false).querySelectorAll('[data-umbrella]').length).toBe(3);
    expect(draw(ev('dog-walker'), false).querySelector('[data-dog]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/city-event-sprites.test.tsx --maxWorkers=4`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implement**

Dans `src/content/city-sprites.tsx`, remplacer `const tone = …` par `export const tone = …` (même corps).

Créer `src/content/city-event-sprites.tsx` :

```tsx
import type { ReactElement } from 'react';
import type { CityEvent } from '../core/library/city/events';
import { outfitFor, type Outfit } from '../core/library/city/people';
import { hashString, mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { PersonSprite, tone } from './city-sprites';

// Dessins des événements de la ville (maquette validée du 2026-10-09). Petites animations en SMIL, jamais en mouvement
// réduit ; aucun id SVG fixe. Les tirages de couleurs viennent de la clé de l'événement (déterministes).
type Props = { event: CityEvent; sky: Sky; still: boolean; lights: boolean; rainy: boolean };

const GLASS = '#CFE4F2';
const pickOf = <T,>(list: readonly T[], u: number): T => list[Math.min(list.length - 1, Math.floor(u * list.length))]!;
const outfitsOf = (key: string, profile: Parameters<typeof outfitFor>[0], n: number): Outfit[] => {
  const rng = mulberry32(hashString(key));
  return Array.from({ length: n }, () => outfitFor(profile, rng));
};

export function CityEventSprite({ event: e, sky, still, lights, rainy }: Props): ReactElement {
  const t = (c: string): string => tone(c, sky);
  const anim = !still;
  const body = ((): ReactElement => {
    switch (e.id) {
      case 'plane':
        return (
          <g>
            {sky.daylight > 0.3 && <line x1={-24} y1={0} x2={-160} y2={1} stroke="#FFFFFF" strokeWidth={2} opacity={0.6} />}
            <path d="M-20 0 L18 -2 Q24 0 18 2 Z" fill={t('#F4F4F4')} />
            <path d="M-4 0 L-12 10 L-6 10 L4 0Z M-16 0 L-22 -8 L-18 -8 L-12 0Z" fill={t('#D0D4DC')} />
            {sky.daylight < 0.3 && (
              <>
                <circle cx={-4} cy={9} r={1.5} fill="#FF4040">{anim && <animate attributeName="opacity" values="1;0.1;1" dur="1.2s" repeatCount="indefinite" />}</circle>
                <circle cx={19} cy={0} r={1.2} fill="#FFFFFF" />
              </>
            )}
          </g>
        );
      case 'helicopter': {
        const c = t(pickOf(['#C0463A', '#2E5E8A', '#E0A21E'], e.variant));
        return (
          <g>
            <ellipse cx={0} cy={0} rx={13} ry={7} fill={c} />
            <rect x={-30} y={-2} width={18} height={3} fill={c} />
            <circle cx={7} cy={-1} r={4} fill={t(GLASS)} />
            <line x1={0} y1={-7} x2={0} y2={-10} stroke="#333" />
            <path d="M-6 8 H10 M-4 7 V8 M8 7 V8" stroke="#333" fill="none" />
            <line x1={-22} y1={-10} x2={22} y2={-10} stroke="#333" strokeWidth={1.5}>
              {anim && <animateTransform attributeName="transform" type="scale" values="1 1;0.1 1;1 1" dur="0.25s" repeatCount="indefinite" />}
            </line>
            {sky.daylight < 0.3 && <circle cx={-30} cy={0} r={1.5} fill="#FF4040" />}
          </g>
        );
      }
      case 'drone':
        return (
          <g>
            <rect x={-5} y={-2} width={10} height={4} rx={1} fill="#333" />
            <line x1={-10} y1={-3} x2={10} y2={-3} stroke="#333" />
            {[-10, 10].map((cx) => (
              <ellipse key={cx} cx={cx} cy={-4} rx={5} ry={1} fill="#555">
                {anim && <animate attributeName="rx" values="5;1;5" dur="0.2s" repeatCount="indefinite" />}
              </ellipse>
            ))}
            {sky.daylight < 0.3 && <circle cx={0} cy={2} r={1.2} fill="#40FF80" />}
          </g>
        );
      case 'balloon': {
        const [a, b] = pickOf([['#E0A21E', '#C0463A'], ['#3B6FD6', '#F2C94C'], ['#2E8B6A', '#E07A8C']] as const, e.variant);
        return (
          <g>
            <path d="M-16 -10 Q-16 -36 0 -36 Q16 -36 16 -10 Q12 2 4 8 H-4 Q-12 2 -16 -10Z" fill={t(a)} />
            <path d="M-6 -35 Q-9 -10 -4 8 M6 -35 Q9 -10 4 8" stroke={t(b)} strokeWidth={3} fill="none" />
            <path d="M-4 8 L-4 14 M4 8 L4 14" stroke="#4A3B2A" />
            <rect x={-5} y={14} width={10} height={7} fill={t('#8A5A2B')} />
          </g>
        );
      }
      case 'banner-plane':
        return (
          <g>
            <path d="M-12 0 L12 -2 Q16 0 12 2Z" fill={t('#F4F4F4')} />
            <path d="M-2 0 L-8 7 L-4 7 L4 0Z" fill={t('#D0D4DC')} />
            <line x1={-12} y1={0} x2={-24} y2={0} stroke="#555" strokeWidth={0.6} />
            <rect x={-104} y={-7} width={80} height={14} fill={t(pickOf(['#F2C94C', '#E07A8C', '#9FE1CB'], e.variant))} />
            {/* Banderole lue dans le bon sens quel que soit le sens de vol : texte retourné avec le sprite. */}
            <g transform={e.dir < 0 ? 'translate(-128 0) scale(-1 1)' : undefined}>
              <text x={-64} y={4} textAnchor="middle" fontSize={9} fill="#5A3A0A" fontFamily="sans-serif">Wikimasters</text>
            </g>
          </g>
        );
      case 'kite': {
        const c = t(pickOf(['#E07A8C', '#3B6FD6', '#E0A21E', '#2E8B6A'], e.variant));
        return (
          <g>
            <path d="M0 14 Q-20 80 -40 150" stroke="#555" strokeWidth={0.5} fill="none" opacity={0.6} />
            <g>
              {anim && <animateTransform attributeName="transform" type="rotate" values="-8;8;-8" dur="3s" repeatCount="indefinite" />}
              <path d="M0 -12 L9 0 L0 14 L-9 0Z" fill={c} />
              <path d="M0 -12 V14 M-9 0 H9" stroke="#FFFFFF" strokeWidth={0.8} />
              <path d="M0 14 q4 6 0 12 q-4 6 0 12" stroke={t('#3B6FD6')} fill="none" />
            </g>
          </g>
        );
      }
      case 'bus': {
        // Bus articulé : deux caisses reliées par un soufflet.
        const c = t(pickOf(['#2E8B6A', '#C0463A', '#3B6FD6'], e.variant));
        const glass = t(GLASS);
        return (
          <g>
            <rect x={-42} y={-26} width={40} height={22} rx={3} fill={c} />
            <rect x={-2} y={-24} width={4} height={18} fill={t('#333333')} />
            <rect x={2} y={-26} width={40} height={22} rx={3} fill={c} />
            {[-38, -28, -18, 6, 16, 26].map((x) => <rect key={x} x={x} y={-23} width={7} height={8} fill={glass} opacity={0.85} />)}
            {[-32, -12, 12, 32].map((x) => <circle key={x} cx={x} cy={-3} r={4} fill="#222" />)}
            {lights && <path d="M42 -10 L64 -5 L64 -15Z" fill="#FFE9A0" opacity={0.25} />}
          </g>
        );
      }
      case 'tram': {
        const c = t('#E8E8F0');
        return (
          <g>
            <line x1={-20} y1={-30} x2={-6} y2={-44} stroke="#333" />
            <line x1={-40} y1={-44} x2={20} y2={-44} stroke="#333" />
            <rect x={-80} y={-30} width={160} height={26} rx={4} fill={c} />
            <rect x={-80} y={-12} width={160} height={4} fill={t(pickOf(['#C0463A', '#3B6FD6', '#2E8B6A'], e.variant))} />
            {Array.from({ length: 14 }, (_, i) => <rect key={i} x={-74 + i * 11} y={-26} width={8} height={10} fill={t(GLASS)} />)}
            {[-60, -30, 30, 60].map((x) => <circle key={x} cx={x} cy={-3} r={3.5} fill="#222" />)}
            {lights && <path d="M80 -12 L100 -7 L100 -17Z" fill="#FFE9A0" opacity={0.25} />}
          </g>
        );
      }
      case 'ambulance':
        return (
          <g>
            <rect x={-24} y={-24} width={48} height={20} rx={3} fill={t('#F4F4F4')} />
            <rect x={10} y={-21} width={10} height={7} fill={t(GLASS)} />
            <rect x={-14} y={-19} width={10} height={3} fill="#C0463A" />
            <rect x={-10.5} y={-22.5} width={3} height={10} fill="#C0463A" />
            <rect x={-24} y={-12} width={48} height={2} fill="#E0A21E" />
            <rect x={2} y={-28} width={6} height={4} fill="#3B6FD6">
              {anim && <animate attributeName="fill" values="#3B6FD6;#7FB0FF;#3B6FD6" dur="0.5s" repeatCount="indefinite" />}
            </rect>
            <circle cx={5} cy={-27} r={6} fill="#7FB0FF" opacity={0.3}>
              {anim && <animate attributeName="r" values="3;8;3" dur="0.5s" repeatCount="indefinite" />}
            </circle>
            <circle cx={-12} cy={-3} r={4} fill="#222" />
            <circle cx={13} cy={-3} r={4} fill="#222" />
            {lights && <path d="M24 -9 L46 -4 L46 -14Z" fill="#FFE9A0" opacity={0.25} />}
          </g>
        );
      case 'garbage-truck': {
        const [worker] = outfitsOf(e.key, 'ordinary', 1);
        return (
          <g>
            <rect x={-30} y={-30} width={40} height={26} rx={2} fill={t('#2E8B6A')} />
            <rect x={10} y={-24} width={16} height={20} rx={2} fill={t('#E8E8E8')} />
            <rect x={16} y={-21} width={8} height={7} fill={t(GLASS)} />
            <rect x={-34} y={-20} width={4} height={12} fill="#E0A21E" />
            <circle cx={-18} cy={-3} r={4.5} fill="#222" />
            <circle cx={16} cy={-3} r={4.5} fill="#222" />
            {/* Ripeur derrière le camion, gilet orange. */}
            <g transform="translate(-42 0) scale(0.65)">
              <PersonSprite outfit={{ ...worker!, top: 'jacket', topColor: '#E0A21E', bottomColor: '#2E8B6A', accessory: 'none' }} sky={sky} rainy={rainy} umbrella={false} />
            </g>
            {lights && <path d="M26 -9 L48 -4 L48 -14Z" fill="#FFE9A0" opacity={0.25} />}
          </g>
        );
      }
      case 'delivery-bike': {
        const [rider] = outfitsOf(e.key, 'ordinary', 1);
        const box = t(pickOf(['#2A9DAA', '#E0A21E', '#C0463A'], e.variant));
        return (
          <g>
            <g fill="none" stroke={t('#3B3F4A')} strokeWidth={1.2}>
              <circle cx={-7} cy={-5} r={5} />
              <circle cx={7} cy={-5} r={5} />
              <path d="M-7 -5 L0 -12 L7 -5 M0 -12 L2 -15" />
            </g>
            <rect x={-1} y={-28} width={6} height={12} rx={2} fill={box} />
            <circle cx={2} cy={-32} r={4} fill={t(rider!.skin)} />
            <rect x={-13} y={-34} width={12} height={11} rx={1} fill={box} />
          </g>
        );
      }
      case 'dog-walker': {
        const [walker] = outfitsOf(e.key, 'stroller', 1);
        const coat = t(pickOf(['#8A5A2B', '#222222', '#E8D9B8', '#B97A52'], e.variant));
        return (
          <g>
            <PersonSprite outfit={walker!} sky={sky} rainy={rainy} umbrella={rainy} />
            <path d="M4 -20 Q14 -12 22 -9" stroke="#C0463A" fill="none" strokeWidth={0.8} />
            <g data-dog="" transform="translate(26 0)">
              <rect x={-8} y={-11} width={14} height={6} rx={3} fill={coat} />
              <circle cx={7} cy={-11} r={3.5} fill={coat} />
              <path d="M-8 -10 L-12 -14" stroke={coat} strokeWidth={1.5} />
              <rect x={-6} y={-5} width={2} height={5} fill={coat}>
                {anim && <animateTransform attributeName="transform" type="rotate" values="-15 -5 -5;15 -5 -5;-15 -5 -5" dur="0.5s" repeatCount="indefinite" />}
              </rect>
              <rect x={3} y={-5} width={2} height={5} fill={coat}>
                {anim && <animateTransform attributeName="transform" type="rotate" values="15 4 -5;-15 4 -5;15 4 -5" dur="0.5s" repeatCount="indefinite" />}
              </rect>
            </g>
          </g>
        );
      }
      case 'umbrella-group':
        return (
          <g>
            {outfitsOf(e.key, 'ordinary', 3).map((o, i) => (
              <g key={i} transform={`translate(${-16 * i} 0)`}>
                <PersonSprite outfit={o} sky={sky} rainy umbrella />
              </g>
            ))}
          </g>
        );
      case 'crane': {
        const yellow = t('#E0A21E');
        return (
          <g>
            <path d="M-4 0 V-200 M4 0 V-200" stroke={yellow} strokeWidth={2} />
            {Array.from({ length: 20 }, (_, i) => <path key={i} d={`M-4 ${-i * 10} L4 ${-i * 10 - 10}`} stroke={yellow} />)}
            <path d="M0 -212 L-4 -200 M0 -212 L4 -200" stroke={yellow} />
            <g transform="translate(0 -200)">
              <g>
                {anim && <animateTransform attributeName="transform" type="scale" values="1 1;-1 1;1 1" dur="80s" repeatCount="indefinite" />}
                <path d="M-30 0 H70 M-30 -1 H70" stroke={yellow} strokeWidth={2.5} />
                <rect x={-34} y={-2} width={8} height={8} fill={t('#555555')} />
                <line x1={45} y1={0} x2={45} y2={30} stroke="#333" strokeWidth={0.6} />
                <rect x={41} y={30} width={8} height={5} fill={t('#8A5A2B')} />
              </g>
            </g>
          </g>
        );
      }
      case 'apartment':
        return (
          <g>
            <rect x={-3} y={-3} width={11} height={13} fill="#FFD27A" opacity={0.25} />
            <rect x={0} y={0} width={5} height={7} fill="#FFD27A" />
          </g>
        );
      case 'fireworks': {
        const colors = ['#FF4F4F', '#F2C94C', '#4FD8FF', '#B04FFF', '#4FFF8A'];
        return (
          <g>
            {colors.map((col, k) => {
              const cx = -120 + k * 60;
              const cy = 40 + (k % 3) * 20;
              const timing = { dur: '6s', begin: `${k * 1.2}s`, repeatCount: 'indefinite' } as const;
              return (
                <g key={k}>
                  <circle cx={cx} cy={250} r={1.5} fill="#FFFFFF" opacity={still ? 0 : 1}>
                    {anim && <animate attributeName="cy" values={`250;${cy};${cy}`} keyTimes="0;0.13;1" {...timing} />}
                    {anim && <animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.12;0.14;1" {...timing} />}
                  </circle>
                  <g transform={`translate(${cx} ${cy})`}>
                    <g opacity={anim ? 0 : 1}>
                      {anim && <animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;0.13;0.15;0.6;1" {...timing} />}
                      {anim && <animateTransform attributeName="transform" type="scale" values="0.2;0.2;1;1.15;1.15" keyTimes="0;0.13;0.25;0.6;1" {...timing} />}
                      {Array.from({ length: 12 }, (_, j) => {
                        const a = (j * Math.PI) / 6;
                        return <line key={j} x1={Math.cos(a) * 8} y1={Math.sin(a) * 8} x2={Math.cos(a) * 22} y2={Math.sin(a) * 22} stroke={col} strokeWidth={1.4} />;
                      })}
                    </g>
                  </g>
                </g>
              );
            })}
          </g>
        );
      }
      default: {
        // Exhaustivité : un nouvel événement doit être dessiné ici.
        const never: never = e.id;
        return never;
      }
    }
  })();
  return <g data-event-sprite={e.id}>{body}</g>;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/content/city-event-sprites.test.tsx tests/content/city-sprites.test.tsx --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/city-sprites.tsx src/content/city-event-sprites.tsx tests/content/city-event-sprites.test.tsx
git commit -m "feat(ville): dessins des 16 événements de la ville

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Événements dans la rue (hook, couche de la ville, masques)

**Files:**
- Create: `src/content/use-city-events.ts`
- Modify: `src/content/city-life.tsx`
- Test: `tests/content/city-events-layer.test.tsx`

**Interfaces:**
- Consumes: Tasks 1 à 4.
- Produces:
  - `useCityEvents(args: { seed: number; width: number; city: CityContext; intensity: CityIntensity; vehicles: Vehicle[]; still: boolean; frozenT: number }): CityEventsState`
  - `type CityEventsState = { schedule: CityEvent[]; active: CityEvent[]; yielded: ReadonlySet<string>; ambulances: CityEvent[]; check: (t: number) => void }` — `check(t)` est appelé par la boucle d'animation à chaque image ; il ne provoque un re-rendu que si l'ensemble des événements actifs change ou si le grand créneau change.
  - Dans le DOM : chaque événement actif = `<g data-life-id={key} data-event={id}>` ; feu d'artifice dans un groupe `data-event-mask="skyline"` (masque de tous les immeubles), grue dans un groupe `data-event-mask="near"` (masque des immeubles du premier plan) ; voitures effacées `data-yield="true"`.

Ordre de dessin dans `CityLifeLayer` : groupe `data-city-events-back` (feu d'artifice masqué, grue masquée, ciel, cerf-volant, appartement), puis le trottoir (passants, habitants, puis événements de trottoir), les lampadaires, la file du fond (voitures, puis événements de cette file), la file du premier plan (voitures, vélos, puis événements de cette file et de la piste cyclable).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// tests/content/city-events-layer.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CityLifeLayer } from '../../src/content/city-life';
import { dayContext } from '../../src/core/library/city/calendar';
import { HYPER_S, MAX_EVENTS, STILL_EVENTS, activeEvents, cityEventSchedule, eventConditions } from '../../src/core/library/city/events';
import { cityIntensity, type CityContext } from '../../src/core/library/city/intensity';
import { laneSpeeds, vehiclesFor } from '../../src/core/library/city/vehicles';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: { root: Root; host: HTMLDivElement }[] = [];
const render = (node: ReactNode): HTMLDivElement => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  mounted.push({ root, host });
  return host;
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const times = sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120);
const contextAt = (hours: number): { city: CityContext; sky: ReturnType<typeof skyAt> } => {
  const minutes = Math.round(hours * 60);
  const sky = skyAt(minutes, times);
  return { sky, city: { minutes, day: dayContext({ y: 2026, m: 10, d: 5 }, []), precip: 0, snow: false, storm: false, daylight: sky.daylight } };
};
// Même calcul que le hook : programme du grand créneau, minutes ramenées au début du grand créneau.
const expected = (T: number, city: CityContext) => {
  const hyper = Math.floor(T / HYPER_S);
  const schedule = cityEventSchedule({
    seed: 1, width: 720, hyper, minutesAtHyperStart: city.minutes - (T - hyper * HYPER_S) / 60,
    cond: eventConditions(city, cityIntensity(city)), vehicles: vehiclesFor(720, 1), speeds: laneSpeeds(1),
  });
  return activeEvents(schedule, T);
};
const findTime = (city: CityContext, ok: (ids: string[]) => boolean): number => {
  for (let T = 1_790_000_000; T < 1_790_000_000 + 40 * HYPER_S; T += 5) if (ok(expected(T, city).map((e) => e.id))) return T;
  throw new Error('aucun instant trouvé');
};
const mount = (T: number, hours: number, still = false): HTMLDivElement => {
  vi.spyOn(Date, 'now').mockReturnValue(T * 1000);
  // jsdom n'a pas matchMedia : même bouchon que tests/content/city-life.test.tsx.
  if (still) vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  const { city, sky } = contextAt(hours);
  return render(<svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={city} rainy={false} /></svg>);
};

describe('événements dans la couche de la ville', () => {
  it('dessine exactement les événements actifs, au plus deux', () => {
    const { city } = contextAt(10);
    const T = findTime(city, (ids) => ids.length > 0);
    const c = mount(T, 10);
    const ids = [...c.querySelectorAll('[data-event]')].map((n) => n.getAttribute('data-event')).sort();
    expect(ids).toEqual(expected(T, city).map((e) => e.id).sort());
    expect(ids.length).toBeLessThanOrEqual(MAX_EVENTS);
  });
  it('un bus ou un tram efface les voitures collées à lui', () => {
    const { city } = contextAt(8.25);
    const T = findTime(city, (ids) => ids.includes('bus') || ids.includes('tram'));
    const ev = expected(T, city).find((e) => e.id === 'bus' || e.id === 'tram')!;
    const c = mount(T, 8.25);
    for (const id of ev.yields) {
      const node = c.querySelector(`[data-life-id="${id}"]`)!;
      expect(node.getAttribute('data-active')).toBe('false');
      expect(node.getAttribute('data-yield')).toBe('true');
    }
  });
  it('le feu d’artifice est masqué par les immeubles', () => {
    const { city } = contextAt(22.5);
    const T = findTime(city, (ids) => ids.includes('fireworks'));
    const c = mount(T, 22.5);
    const fw = c.querySelector('[data-event="fireworks"]')!;
    const masked = fw.closest('[data-event-mask="skyline"]')!;
    expect(masked).not.toBeNull();
    const maskId = masked.getAttribute('mask')!.replace(/^url\(#(.*)\)$/, '$1');
    expect(c.querySelector(`mask[id="${maskId}"]`)).not.toBeNull();
  });
  it('en mouvement réduit, seuls les événements fixes autorisés restent', () => {
    const { city } = contextAt(10);
    const T = findTime(city, (ids) => ids.length > 0);
    const c = mount(T, 10, true);
    for (const n of c.querySelectorAll('[data-event]')) expect(STILL_EVENTS.has(n.getAttribute('data-event') as never)).toBe(true);
    expect(c.querySelectorAll('animate, animateTransform')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/city-events-layer.test.tsx --maxWorkers=4`
Expected: FAIL (aucun `[data-event]`).

- [ ] **Step 3: Implement**

Créer `src/content/use-city-events.ts` :

```ts
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  HYPER_S, STILL_EVENTS, activeEvents, cityEventSchedule, conditionsKey, eventConditions, type CityEvent,
} from '../core/library/city/events';
import type { CityContext, CityIntensity } from '../core/library/city/intensity';
import { laneSpeeds, type Vehicle } from '../core/library/city/vehicles';

export type CityEventsState = { schedule: CityEvent[]; active: CityEvent[]; yielded: ReadonlySet<string>; ambulances: CityEvent[]; check: (t: number) => void };
type Args = { seed: number; width: number; city: CityContext; intensity: CityIntensity; vehicles: Vehicle[]; still: boolean; frozenT: number };

// Programme des événements du grand créneau en cours (20 min). Recalculé seulement si le grand créneau change ou si une
// condition passe un seuil (nuit, pluie, jour ouvré, circulation, piétons). `clock` = instant du dernier changement de
// l'ensemble des événements actifs : la boucle d'animation appelle `check(t)` à chaque image et ne provoque un re-rendu
// que lorsque cet ensemble change.
export function useCityEvents({ seed, width, city, intensity, vehicles, still, frozenT }: Args): CityEventsState {
  const [clock, setClock] = useState(() => (still ? frozenT : Date.now() / 1000));
  const hyper = Math.floor(clock / HYPER_S);
  const cond = useMemo(() => eventConditions(city, intensity), [city, intensity]);
  const key = conditionsKey(cond);
  // Lus au moment du calcul (la clé suffit à décider quand recalculer).
  const condRef = useRef(cond);
  condRef.current = cond;
  const minutesRef = useRef(city.minutes);
  minutesRef.current = city.minutes;
  const schedule = useMemo(() => {
    const nowS = still ? frozenT : Date.now() / 1000;
    const minutesAtHyperStart = minutesRef.current - (nowS - hyper * HYPER_S) / 60;
    return cityEventSchedule({ seed, width, hyper, minutesAtHyperStart, cond: condRef.current, vehicles, speeds: laneSpeeds(seed) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, width, hyper, key, vehicles, still, frozenT]);
  const active = useMemo(() => {
    const now = activeEvents(schedule, clock);
    return still ? now.filter((e) => STILL_EVENTS.has(e.id)) : now;
  }, [schedule, clock, still]);
  const activeKey = active.map((e) => e.key).join(',');
  const keyRef = useRef(activeKey);
  keyRef.current = activeKey;
  const check = useCallback(
    (t: number): void => {
      if (still) return;
      const next = activeEvents(schedule, t).map((e) => e.key).join(',');
      if (next !== keyRef.current || Math.floor(t / HYPER_S) !== hyper) {
        keyRef.current = next;
        setClock(t);
      }
    },
    [schedule, hyper, still],
  );
  const yielded = useMemo(() => new Set(active.flatMap((e) => e.yields)), [active]);
  const ambulances = useMemo(() => active.filter((e) => e.id === 'ambulance'), [active]);
  return { schedule, active, yielded, ambulances, check };
}
```

Remplacer `src/content/city-life.tsx` par la version ci-dessous (reprend la vague 1a et la Task 1 ; les ajouts sont commentés) :

```tsx
import { useId, useMemo, useRef, type ReactElement } from 'react';
import { doorsFor, residentFlow, tripAt, tripHappens, tripsFor, type Trip } from '../core/library/city/doors';
import { PULL_DY, placeEvent, pullOver, type EventFrame, type EventPlacement } from '../core/library/city/event-place';
import type { CityEvent } from '../core/library/city/events';
import { cityFacades } from '../core/library/city/facades';
import { cityIntensity, type CityContext } from '../core/library/city/intensity';
import { lampLit as streetLampLit, lampsFor } from '../core/library/city/lamps';
import { FAR_SHRINK, STREET_SCALE, cityMetrics, type CityMetrics } from '../core/library/city/metrics';
import { pedestrianGate, pedestriansFor, type Pedestrian } from '../core/library/city/people';
import { LANE_DIR, vehicleGate, vehiclesFor, type Vehicle } from '../core/library/city/vehicles';
import { loopX } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { CityEventSprite } from './city-event-sprites';
import { LampSprite, PersonSprite, VehicleSprite } from './city-sprites';
import { useCityEvents } from './use-city-events';
import { useWallClockLoop } from './use-wallclock-loop';

// Vie de la scène Ville : passants, habitants qui sortent de leur immeuble ou y rentrent, deux files de circulation,
// et les événements de la ville (vague 1b-i). La présence (data-active, opacité) ne change qu'à la minute (re-rendu React)
// ou quand l'ensemble des événements change ; les positions sont posées par la boucle d'animation directement sur
// `transform`, sans re-rendu. Seuls les habitants voient aussi leur présence décidée par la boucle.
// `forcedNight` : mode « Toujours la nuit » (les lampadaires restent allumés).
export type CityLifeProps = { width: number; height: number; sky: Sky; seed: number; city: CityContext; rainy: boolean; forcedNight?: boolean };

// Écart entre un parent et chaque enfant qu'il accompagne (repère du sprite, avant l'échelle).
const COMPANION_GAP = 16;
// Durée du fondu d'apparition/disparition (CSS) ; un absent continue d'avancer tant qu'il s'efface (avec une petite marge).
const FADE_S = 3;
// Fondu court des habitants, et des voitures qui s'effacent devant un véhicule d'événement. Aucun fondu en mouvement réduit.
const RESIDENT_FADE_S = 0.4;
// Les vélos roulent sur une piste au bord de la file du premier plan (côté droit du sens de marche, vers le spectateur).
const BIKE_TRACK_DY = 2;

// `dy` : décalage d'une voiture qui se range devant l'ambulance (0 sinon).
const vehicleTransform = (v: Vehicle, m: CityMetrics, width: number, t: number, dy = 0): string => {
  const x = loopX(v.phase, LANE_DIR[v.lane] * v.speed, width, t);
  const k = m.unit * STREET_SCALE.vehicle * v.scale * (v.lane === 'far' ? FAR_SHRINK : 1);
  const y = m.laneY[v.lane] + (v.kind === 'bike' ? BIKE_TRACK_DY * m.unit : 0) + dy;
  return `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(LANE_DIR[v.lane] * k).toFixed(3)} ${k.toFixed(3)})`;
};

const placementTransform = (p: EventPlacement): string => `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${p.sx.toFixed(3)} ${p.sy.toFixed(3)})`;

// Décalage d'une voiture motorisée devant les ambulances actives de sa file (vers le bord : premier plan vers le bas, fond vers le haut).
const pullDy = (v: Vehicle, ambulances: CityEvent[], m: CityMetrics, width: number, t: number): number => {
  if (v.kind === 'bike' || ambulances.length === 0) return 0;
  let f = 0;
  for (const amb of ambulances) if (amb.track === v.lane) f = Math.max(f, pullOver(amb, loopX(v.phase, LANE_DIR[v.lane] * v.speed, width, t), width, t));
  return f * PULL_DY * m.unit * (v.lane === 'near' ? 1 : -1);
};

type StreetLampsProps = { width: number; height: number; seed: number; minutes: number; daylight: number; forcedNight?: boolean };

// Lampadaires au bord du trottoir : dessinés devant les passants (leur pied est plus près de la rue) et derrière les voitures.
// Ils sont dans le calque animé (la boucle n'y touche pas) ; sans contexte de ville, SceneActors les dessine seuls.
export function StreetLamps({ width, height, seed, minutes, daylight, forcedNight = false }: StreetLampsProps): ReactElement {
  const lamps = useMemo(() => lampsFor(width, seed), [width, seed]);
  const m = cityMetrics(height);
  const curb = m.curb;
  return (
    <g data-street-lamps="">
      {lamps.map((lamp) => {
        const lit = streetLampLit(lamp, minutes, daylight, forcedNight);
        return (
          <g key={lamp.id} data-street-lamp={lamp.id} data-lit={lit ? 'true' : 'false'} transform={`translate(${lamp.x} ${curb.toFixed(1)}) scale(${(m.unit * STREET_SCALE.lamp).toFixed(3)})`}>
            <LampSprite lit={lit} />
          </g>
        );
      })}
    </g>
  );
}

const pedTransform = (p: Pedestrian, m: CityMetrics, width: number, t: number): string => {
  const x = loopX(p.phase, p.dir * p.speed, width, t);
  // Légère profondeur sur le trottoir : les passants ne marchent pas tous sur la même ligne.
  const y = m.walkY - (p.depth - 0.5) * m.unit * 6;
  const k = m.unit * STREET_SCALE.person * p.scale;
  return `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(p.dir * k).toFixed(3)} ${k.toFixed(3)})`;
};

const residentTransform = (trip: Trip, x: number, m: CityMetrics): string => {
  const k = m.unit * STREET_SCALE.person * trip.scale;
  return `translate(${x.toFixed(1)} ${m.doorY.toFixed(1)}) scale(${(trip.dir * k).toFixed(3)} ${k.toFixed(3)})`;
};

// Position et présence d'un habitant à l'instant t : présent si son trajet a lieu dans ce tour de cycle et s'il est en route.
const residentState = (trip: Trip, gate: number, width: number, t: number): { active: boolean; x: number; fade: number } => {
  const pos = tripAt(trip, width, t);
  const active = pos !== null && tripHappens(trip, t, gate);
  return { active, x: pos?.x ?? trip.doorX, fade: active && pos ? pos.fade : 0 };
};

const setIfChanged = (node: Element, name: string, value: string): void => {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
};

export function CityLifeLayer({ width, height, sky, seed, city, rainy, forcedNight = false }: CityLifeProps): ReactElement {
  const root = useRef<SVGGElement | null>(null);
  // Passants et véhicules présents au dernier placement : ceux qui disparaissent continuent d'avancer pendant leur fondu.
  const moving = useRef<Set<string>>(new Set());
  // Calculs mémoïsés par (width, height, seed) : populations, entrées, trajets, façades. Recalculés par minute : intensités.
  const metrics = useMemo(() => cityMetrics(height), [height]);
  const peds = useMemo(() => pedestriansFor(width, seed), [width, seed]);
  const vehicles = useMemo(() => vehiclesFor(width, seed), [width, seed]);
  const doors = useMemo(() => doorsFor(width, height, seed), [width, height, seed]);
  const trips = useMemo(() => tripsFor(doors, seed), [doors, seed]);
  const facades = useMemo(() => cityFacades(width, height, seed), [width, height, seed]);
  const frame = useMemo<EventFrame>(() => ({ width, height, metrics, facades }), [width, height, metrics, facades]);
  const intensity = useMemo(() => cityIntensity(city), [city]);
  // Une entrée par immeuble : la probabilité par trajet est réduite selon le nombre d'entrées (≤ 6 habitants par 720 px).
  const flow = useMemo(() => residentFlow(intensity, city.minutes, doors.length, width), [intensity, city.minutes, doors.length, width]);
  const lights = sky.daylight < 0.5 || rainy;
  const gateOf = (trip: Trip): number => (trip.kind === 'out' ? flow.out : flow.in);
  const maskBase = `${useId().replace(/:/g, '')}-city-mask`;

  // Mouvement réduit : la boucle ne tourne pas, les positions restent celles du premier calcul (pas de saut à chaque minute).
  const frozen = useRef<number | null>(null);
  const still = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (frozen.current === null) frozen.current = Date.now() / 1000;

  // Événements de la ville : programme du grand créneau, événements actifs, voitures effacées, ambulances.
  const events = useCityEvents({ seed, width, city, intensity, vehicles, still, frozenT: frozen.current });

  const pedActive = useMemo(() => new Set(peds.filter((p) => p.u < pedestrianGate(p, intensity)).map((p) => p.id)), [peds, intensity]);
  // Une voiture effacée par un véhicule d'événement n'est pas présente pendant tout son passage.
  const vehActive = useMemo(
    () => new Set(vehicles.filter((v) => v.u < vehicleGate(v, intensity) && !events.yielded.has(v.id)).map((v) => v.id)),
    [vehicles, intensity, events.yielded],
  );

  // Placement à chaque image. La table des nœuds est remplie au premier appel (après le montage) ;
  // tout est placé une fois, puis bougent les présents et, pendant leur fondu, ceux qui viennent de disparaître.
  const place = useMemo(() => {
    let nodes: Map<string, SVGGElement> | null = null;
    let first = true;
    let leaving = new Set<string>();
    let leaveUntil = 0;
    const moves = (id: string, t: number): boolean => first || vehActive.has(id) || pedActive.has(id) || (t < leaveUntil && leaving.has(id));
    return (now: number): void => {
      // Mouvement réduit : toujours le même instant, y compris quand le placement est refait après un changement de minute.
      const t = still ? frozen.current! : now;
      const el = root.current;
      if (!el) return;
      if (!nodes) {
        nodes = new Map();
        for (const node of el.querySelectorAll<SVGGElement>('[data-life-id]')) nodes.set(node.getAttribute('data-life-id')!, node);
        leaving = new Set([...moving.current].filter((id) => !vehActive.has(id) && !pedActive.has(id)));
        leaveUntil = t + FADE_S + 0.2;
        moving.current = new Set([...vehActive, ...pedActive]);
      }
      for (const v of vehicles) if (moves(v.id, t)) nodes.get(v.id)?.setAttribute('transform', vehicleTransform(v, metrics, width, t, pullDy(v, events.ambulances, metrics, width, t)));
      for (const p of peds) if (moves(p.id, t)) nodes.get(p.id)?.setAttribute('transform', pedTransform(p, metrics, width, t));
      for (const e of events.active) nodes.get(e.key)?.setAttribute('transform', placementTransform(placeEvent(e, t, frame)));
      for (const trip of trips) {
        const node = nodes.get(trip.id);
        if (!node) continue;
        const s = residentState(trip, trip.kind === 'out' ? flow.out : flow.in, width, t);
        // N'écrire que ce qui change : la plupart des habitants restent chez eux, inutile de toucher leur nœud à chaque image.
        setIfChanged(node, 'data-active', s.active ? 'true' : 'false');
        setIfChanged(node, 'opacity', s.fade.toFixed(2));
        if (s.active || first) node.setAttribute('transform', residentTransform(trip, s.x, metrics));
      }
      first = false;
      // En dernier : peut demander un re-rendu (nouvel ensemble d'événements), qui recrée cette fonction.
      events.check(t);
    };
  }, [vehicles, peds, trips, vehActive, pedActive, flow, metrics, width, still, events, frame]);
  useWallClockLoop(place, [place]);

  // Rendu initial : mêmes calculs qu'à la première image, pour que le premier dessin (et les tests) soient justes.
  const t0 = still ? frozen.current : Date.now() / 1000;
  const eventNode = (e: CityEvent): ReactElement => (
    <g key={e.key} data-life-id={e.key} data-event={e.id} data-active="true" transform={placementTransform(placeEvent(e, t0, frame))}>
      <CityEventSprite event={e} sky={sky} still={still} lights={lights} rainy={rainy} />
    </g>
  );
  const of = (pred: (e: CityEvent) => boolean): CityEvent[] => events.active.filter(pred);
  const fireworks = of((e) => e.id === 'fireworks');
  const cranes = of((e) => e.id === 'crane');
  const near = facades.filter((b) => !b.far);
  const lane = (which: 'far' | 'near'): ReactElement => (
    <g data-city-lane={which}>
      {/* Vélos après les voitures : leur piste est au bord de la file, plus près du spectateur. */}
      {[...vehicles.filter((v) => v.lane === which && v.kind !== 'bike'), ...vehicles.filter((v) => v.lane === which && v.kind === 'bike')]
        .map((v) => {
          const active = vehActive.has(v.id);
          const yielded = events.yielded.has(v.id);
          return (
            <g
              key={v.id}
              data-life-id={v.id}
              data-vehicle=""
              data-kind={v.kind}
              data-lane={v.lane}
              data-active={active ? 'true' : 'false'}
              data-yield={yielded ? 'true' : undefined}
              transform={vehicleTransform(v, metrics, width, t0, pullDy(v, events.ambulances, metrics, width, t0))}
              opacity={active ? 1 : 0}
              style={{ transition: `opacity ${yielded ? RESIDENT_FADE_S : FADE_S}s ease` }}
            >
              <VehicleSprite vehicle={v} sky={sky} lights={lights} />
            </g>
          );
        })}
      {/* Véhicules d'événement de cette file (et de la piste cyclable pour le premier plan). */}
      {of((e) => e.layer === 'street' && (e.track === which || (which === 'near' && e.track === 'bike'))).map(eventNode)}
    </g>
  );
  const silhouette = (list: typeof facades): ReactElement[] =>
    list.map((b, i) => <rect key={i} x={b.x} y={metrics.ground - b.h} width={b.w} height={b.h + height} fill="#000" />);

  return (
    <g data-city-life="" ref={root}>
      {/* Masques des toits : le feu d'artifice part de derrière tous les immeubles, la grue est derrière le premier plan. */}
      {(fireworks.length > 0 || cranes.length > 0) && (
        <defs>
          {fireworks.length > 0 && (
            <mask id={`${maskBase}-skyline`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
              <rect x={0} y={0} width={width} height={height} fill="#fff" />
              {silhouette(facades)}
            </mask>
          )}
          {cranes.length > 0 && (
            <mask id={`${maskBase}-near`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
              <rect x={0} y={0} width={width} height={height} fill="#fff" />
              {silhouette(near)}
            </mask>
          )}
        </defs>
      )}
      <g data-city-events-back="">
        {fireworks.length > 0 && <g data-event-mask="skyline" mask={`url(#${maskBase}-skyline)`}>{fireworks.map(eventNode)}</g>}
        {cranes.length > 0 && <g data-event-mask="near" mask={`url(#${maskBase}-near)`}>{cranes.map(eventNode)}</g>}
        {of((e) => e.layer === 'sky' || e.id === 'kite' || e.id === 'apartment').map(eventNode)}
      </g>
      {/* Ordre de dessin : trottoir (passants, habitants, événements de trottoir) au fond, contre les immeubles, puis les
          lampadaires (bord du trottoir), la file du fond, puis celle du premier plan. */}
      <g data-city-sidewalk="">
        {trips.map((trip) => {
          const s = residentState(trip, gateOf(trip), width, t0);
          return (
            <g
              key={trip.id}
              data-life-id={trip.id}
              data-resident=""
              data-trip={trip.kind}
              data-active={s.active ? 'true' : 'false'}
              transform={residentTransform(trip, s.x, metrics)}
              opacity={s.fade.toFixed(2)}
              style={still ? undefined : { transition: `opacity ${RESIDENT_FADE_S}s ease` }}
            >
              <PersonSprite outfit={trip.outfit} sky={sky} rainy={rainy} umbrella={intensity.umbrellas} />
            </g>
          );
        })}
        {peds.map((p) => {
          const active = pedActive.has(p.id);
          return (
            <g
              key={p.id}
              data-life-id={p.id}
              data-ped=""
              data-role={p.role}
              data-profile={p.profile}
              data-active={active ? 'true' : 'false'}
              transform={pedTransform(p, metrics, width, t0)}
              opacity={active ? 1 : 0}
              style={{ transition: `opacity ${FADE_S}s ease` }}
            >
              {/* Les enfants accompagnés suivent derrière le parent (repère du sprite : derrière = x négatif), à l'échelle 0,7. */}
              {p.companions.map((outfit, k) => (
                <g key={k} data-companion="" transform={`translate(${-COMPANION_GAP * (k + 1)} 0) scale(0.7)`}>
                  <PersonSprite outfit={outfit} sky={sky} rainy={rainy} umbrella={false} />
                </g>
              ))}
              <PersonSprite outfit={p.outfit} sky={sky} rainy={rainy} umbrella={intensity.umbrellas} />
            </g>
          );
        })}
        {of((e) => e.layer === 'sidewalk').map(eventNode)}
      </g>
      <StreetLamps width={width} height={height} seed={seed} minutes={city.minutes} daylight={sky.daylight} forcedNight={forcedNight} />
      {lane('far')}
      {lane('near')}
    </g>
  );
}
```

Points d'attention pour l'implémenteur :
- `events` change d'identité à chaque rendu (objet retourné par le hook) : c'est voulu, la boucle est recréée avec lui. Ne pas mémoïser l'objet entier.
- La table des nœuds est reconstruite à chaque nouvelle fonction `place` : les nœuds des nouveaux événements sont donc trouvés dès l'image suivante.
- Ne pas toucher à `scene-panorama.tsx` : la couche reste montée par `SceneActors` comme dans la vague 1a.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/content/city-events-layer.test.tsx tests/content/city-life.test.tsx tests/content/scene-panorama.test.tsx --maxWorkers=4`
Expected: PASS. Si un test de `city-life.test.tsx` compte les véhicules actifs et qu'un événement de rue efface une voiture à l'instant du test, fixer `Date.now` de ce test à un instant sans événement de rue (même méthode que `findTime`) plutôt que de changer le seuil attendu, et le signaler.

- [ ] **Step 5: Commit**

```bash
git add src/content/use-city-events.ts src/content/city-life.tsx tests/content/city-events-layer.test.tsx
git commit -m "feat(ville): événements dans la rue, feu d'artifice derrière les toits, voitures qui se rangent

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Ajouter au `git add` tout test ajusté à l'étape 4.)

---

### Task 6: Fiche WikiHow, vérifications et livraison

**Files:**
- Modify: `src/core/whats-new/entries.ts` (ajouter la fiche après `bibliotheque-v20`)
- Modify: `docs/superpowers/specs/2026-10-09-bibliotheque-ville-vivante-design.md` (section « Livraison » : identifiants des fiches)

- [ ] **Step 1: Fiche `bibliotheque-v21`**

Ajouter, juste après l'objet `bibliotheque-v20` dans `src/core/whats-new/entries.ts` :

```ts
  {
    id: 'bibliotheque-v21',
    theme: 'collection',
    glyph: '🚁',
    title: 'Il se passe des choses en ville',
    summary: 'Avions, bus, ambulance, grue, promeneur de chien, feu d’artifice : de petits événements traversent la vue',
    steps: [
      {
        target: '[data-wmt-library-entry]',
        gesture: 'tap',
        title: 'Des événements dans le ciel et dans la rue',
        text: 'Dans une pièce dont la scène est « Ville », de temps en temps, quelque chose passe : avion, hélicoptère, drone, montgolfière, avion à banderole, bus articulé, tramway, ambulance, camion-poubelle, livreur à vélo, promeneur de chien.',
        details: [
          { label: 'À quoi ça sert', text: 'À rendre la vue plus vivante : on ne sait jamais ce qu’on va voir passer par la fenêtre.' },
          { label: 'Comment faire', text: 'Rien à régler : ouvrez Ma Pièce, choisissez une pièce dont la scène est « Ville » et regardez par la fenêtre. Un événement traverse tout le paysage, d’une fenêtre à l’autre.' },
          { label: 'D’où viennent les données', text: 'Tout est calculé sur votre appareil à partir de l’heure et de la pièce : la même pièce montre les mêmes événements au même moment, même après un rechargement. Rien n’est envoyé.' },
          { label: 'Limites', text: 'Environ un créneau de 25 secondes sur cinq lance un événement, et jamais plus de deux à la fois : il faut parfois attendre un peu.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
      {
        target: '[data-wmt-library-entry]',
        title: 'L’heure et la météo comptent',
        text: 'Chaque événement a ses heures : camion-poubelle le matin, grue en semaine de jour, appartement qui s’allume le soir, feu d’artifice la nuit derrière les immeubles. Sous la pluie, les cerfs-volants restent au sol et des groupes pressés passent sous leurs parapluies.',
        details: [
          { label: 'À quoi ça sert', text: 'À ce que la ville ressemble à une vraie ville : pas de feu d’artifice à midi, pas de cerf-volant sous l’averse.' },
          { label: 'Comment faire', text: 'Changez l’heure (rangée Ciel, mode Aménager) ou la météo pour voir d’autres événements. Quand une ambulance arrive, les voitures de sa file se rangent pour la laisser passer.' },
          { label: 'D’où viennent les données', text: 'De l’heure du ciel, de la météo déjà réglée et du jour (semaine, week-end, vacances) calculé par la vague précédente.' },
          { label: 'Limites', text: 'Si vous réduisez les animations sur votre appareil, rien ne traverse : seuls la grue, le cerf-volant et l’appartement allumé restent, immobiles. Un appartement ou une grue n’est visible que si une fenêtre donne sur cet endroit.' },
        ],
        scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library-entry]'] },
      },
    ],
  },
```

Dans la spec, section « Livraison », remplacer `bibliotheque-v19` pour 1a, `v20` pour 1b, `v21` pour 1c par : `bibliotheque-v20` pour 1a, `v21` pour 1b-i, numéros suivants pour 1b-ii, 1b-iii, commerces et 1c.

Run: `npx vitest run tests/core/whats-new --maxWorkers=4`
Expected: PASS (identifiants uniques, étapes complètes). Si le dossier de tests diffère, lancer les tests qui importent `entries.ts` (`grep -rl "whats-new/entries" tests`).

- [ ] **Step 2: Suite complète et vérifications**

Run: `npx vitest run --maxWorkers=4`
Expected: PASS (les 11 à 12 erreurs non gérées connues du mock de géolocalisation de `library-weather-ui` peuvent apparaître : elles existaient avant ; ne pas les compter comme régression, les signaler).

Run: `npm run typecheck`
Expected: aucune erreur.

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 3: Vérification visuelle**

Lancer le banc d'essai de la bibliothèque (`.superpowers/harness`, méthode des morceaux précédents) ou l'extension rechargée dans Chrome, pièce en scène Ville avec une fenêtre de 3 lignes posée tout en bas du mur : vérifier que les deux files et le trottoir d'en face se voient ; forcer des instants (Date.now) où passent un bus, une ambulance (voitures qui se rangent), un feu d'artifice (fusées cachées au départ par les toits), une grue (mât derrière les immeubles du premier plan). Faire des captures et les joindre au rapport.

- [ ] **Step 4: Commit**

```bash
git add src/core/whats-new/entries.ts docs/superpowers/specs/2026-10-09-bibliotheque-ville-vivante-design.md
git commit -m "docs(wikihow): fiche bibliotheque-v21, il se passe des choses en ville

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Livraison**

Relecture finale de toute la branche, puis : push, PR vers `main` (corps terminé par `🤖 Generated with [Claude Code](https://claude.com/claude-code)`), fusion sans attendre (consigne permanente), `npm run preprod` depuis `main` à jour, extension reconstruite. Pas de relais à redéployer (aucune route nouvelle). Retirer ensuite la jonction `node_modules` et `.env.local` du worktree.
