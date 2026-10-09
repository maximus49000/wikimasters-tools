# Bibliothèque — météo (morceau 5b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une météo (aléatoire, forcée ou réelle) visible derrière les fenêtres des scènes terrestres de la Bibliothèque.

**Architecture:** Un moteur pur (`src/core/library/weather/`) produit un vecteur continu `Weather` à chaque instant : plan aléatoire déterministe par ticks de 4 min et époques de 6 h, état forcé, ou observation réelle (Open-Meteo via une route du relais). Un `WeatherClock` fond les changements de source en 30 s. Un groupe SVG `WeatherLayer`, animé hors React comme les acteurs, est affiché dans chaque fenêtre par un `<use>` ; le panneau « Ciel » gagne une rangée Météo.

**Tech Stack:** TypeScript, React 18, zod, vitest (+ jsdom), Cloudflare Worker (relais), SVG/SMIL.

**Spec:** `docs/superpowers/specs/2026-10-09-bibliotheque-meteo-design.md`. Fenêtre/ciel existants : `docs/superpowers/specs/2026-10-08-bibliotheque-fenetre-design.md`.

## Global Constraints

- Réglage **global** (`LibraryState.weather`), pas par pièce ; état **v4 → v5** ; un build antérieur ne lit pas la v5.
- Seules les scènes `city`, `countryside`, `mountain`, `sea` ont une météo ; `space` et `earth` l'ignorent.
- Transitions **continues** de 20 à 60 s : jamais de bascule brute (changement de réglage : fondu de 30 s).
- Le réglage `random` est déterministe : même graine (`WEATHER_SEED`) + même instant → même météo, sans simulation en arrière-plan.
- Mode réelle : appel au **relais** `GET /weather?lat&lon`, coordonnées arrondies à 0,1° côté relais, cache local 15 min, repli sur l'aléatoire, jamais d'erreur visible.
- Mouvement réduit (`prefers-reduced-motion`) : tout reste affiché, **figé**.
- Pas de `feGaussianBlur` ; nombre d'éléments animés plafonné (motifs `<pattern>` translatés, pas de nœud par goutte).
- Interface en glyphes SVG avec infobulle (`label`), textes en français ; même panneau pour l'extension et l'application mobile.
- Fiche WikiHow `bibliotheque-v12` dans la même PR (`src/core/whats-new/entries.ts`).
- Tests : `npx vitest run <fichier> --maxWorkers=4` ; types : `npx tsc --noEmit` ; fin de lot : `npm run build`.
- Travail dans le worktree `C:\Users\maxim\Downloads\Wikimasters-bibliotheque`, branche `feat/bibliotheque-meteo` (node_modules déjà relié).

## File Structure

| Fichier | Rôle |
|---|---|
| `src/core/library/library-types.ts` (modif) | `WeatherState`, `WeatherSetting`, `LibraryState.weather`, version 5 |
| `src/core/library/library-book.ts` (modif) | migration v4→v5, zod, `setWeatherSetting`, état initial |
| `src/core/library/weather/weather-types.ts` (créer) | `Weather`, états, cibles, `blend`, `steadyWeather`, `nearestState`, libellés |
| `src/core/library/weather/weather-plan.ts` (créer) | plan aléatoire (ticks, époques, température plausible, accumulateurs) |
| `src/core/library/weather/weather-clock.ts` (créer) | `WeatherClock` (fondu entre sources), `lightningAt`, `rainbowOf`, `weatherFlags` |
| `src/core/library/weather/weather-real.ts` (créer) | `realToWeather`, client du relais avec cache/repli |
| `relay/src/weather.ts` (créer), `relay/src/index.ts` (modif) | route `/weather` |
| `src/core/library/weather/index.ts` (créer) | ré-exports |
| `src/content/scene-position.ts` (modif) | `isPositionKnown()` |
| `src/content/use-weather.ts` (créer) | hook : source selon le réglage, horloge, drapeaux, libellé |
| `src/content/scene-weather.tsx` (créer) | `WeatherLayer` + boucle d'animation |
| `src/content/window-art.tsx`, `RoomView.tsx` (modif) | `<use>` météo + gouttes sur la vitre + passage des drapeaux |
| `src/content/scene-panorama.tsx`, `scene-city.tsx`, `scene-nature.tsx`, `scene-sprites.tsx` (modif) | lumières sous ciel sombre, parapluies |
| `src/content/LibraryPanel.tsx` (modif) | rangée Météo, légende |
| `src/core/whats-new/entries.ts` (modif) | fiche `bibliotheque-v12` |
| `tests/core/library/weather-*.test.ts`, `tests/relay/weather.test.ts`, `tests/content/*weather*.test.tsx` (créer) | tests |

---

### Task 1: Réglage météo dans l'état (v5)

**Files:**
- Modify: `src/core/library/library-types.ts` (autour de `TimeSetting`, `LibraryState`)
- Modify: `src/core/library/library-book.ts` (`createInitialState`, migrations, `stateSchema`, `setTimeSetting`)
- Test: `tests/core/library/library-weather-setting.test.ts`

**Interfaces:**
- Produces: `WEATHER_STATES`, `type WeatherState`, `type WeatherSetting = { mode: 'random' } | { mode: 'forced'; state: WeatherState } | { mode: 'real' }`, `LibraryState.version: 5`, `LibraryState.weather: WeatherSetting`, `setWeatherSetting(state, setting): LibraryState` (exportée de `library-book.ts`).

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// tests/core/library/library-weather-setting.test.ts
import { describe, expect, it } from 'vitest';
import { createInitialState, parseLibrary, setWeatherSetting } from '../../../src/core/library/library-book';

describe('réglage météo', () => {
  it('démarre en aléatoire, version 5', () => {
    const state = createInitialState();
    expect(state.version).toBe(5);
    expect(state.weather).toEqual({ mode: 'random' });
  });
  it('change de réglage', () => {
    const state = setWeatherSetting(createInitialState(), { mode: 'forced', state: 'storm' });
    expect(state.weather).toEqual({ mode: 'forced', state: 'storm' });
    expect(setWeatherSetting(state, { mode: 'real' }).weather).toEqual({ mode: 'real' });
  });
  it('migre un état v4 en ajoutant la météo aléatoire', () => {
    const v4 = { ...createInitialState(), version: 4 } as Record<string, unknown>;
    delete v4.weather;
    const parsed = parseLibrary(v4);
    expect(parsed?.version).toBe(5);
    expect(parsed?.weather).toEqual({ mode: 'random' });
  });
  it('refuse un état forcé sur un état inconnu', () => {
    const bad = { ...createInitialState(), weather: { mode: 'forced', state: 'tornado' } };
    expect(parseLibrary(bad)).toBeNull();
  });
});
```

Avant d'écrire : ouvrir `tests/core/library/library-migration.test.ts` pour reprendre le nom EXACT de la fonction de lecture exportée par `library-book.ts` (remplacer `parseLibrary` par ce nom, et adapter l'attendu `null` si la fonction renvoie autre chose pour un état invalide).

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run tests/core/library/library-weather-setting.test.ts`
Expected: FAIL (`setWeatherSetting` introuvable / version 4).

- [ ] **Step 3: Implémenter**

Dans `library-types.ts`, après `TimeSetting` :

```ts
// Météo derrière les fenêtres des scènes terrestres.
export const WEATHER_STATES = ['sun', 'cloudy', 'drizzle', 'rain', 'storm', 'snow', 'fog'] as const;
export type WeatherState = (typeof WEATHER_STATES)[number];
export type WeatherSetting = { mode: 'random' } | { mode: 'forced'; state: WeatherState } | { mode: 'real' };
```

Dans `LibraryState` : `version: 5;` et, après `time: TimeSetting;`, `// Météo globale de la Bibliothèque (toutes les pièces terrestres).` puis `weather: WeatherSetting;`.

Dans `library-book.ts` :
- `createInitialState` : `version: 5`, ajouter `weather: { mode: 'random' }`.
- Migration, à la suite de `migrateV3` :

```ts
// La v5 ajoute la météo globale (aléatoire).
function migrateV4(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 4) return raw;
  return { ...(raw as object), version: 5, weather: { mode: 'random' } };
}

const migrate = (raw: unknown): unknown => migrateV4(migrateV3(migrateV2(migrateV1(raw))));
```
- `stateSchema` : `version: z.literal(5)` et après `time` :

```ts
  weather: z.union([
    z.object({ mode: z.literal('random') }),
    z.object({ mode: z.literal('forced'), state: z.enum(WEATHER_STATES) }),
    z.object({ mode: z.literal('real') }),
  ]),
```
(importer `WEATHER_STATES` et `WeatherSetting`). Si le schéma existant fait un `.strict()` ou reconstruit l'état champ par champ, y ajouter `weather`.
- Après `setTimeSetting` :

```ts
export function setWeatherSetting(state: LibraryState, weather: WeatherSetting): LibraryState {
  return { ...state, weather };
}
```

- [ ] **Step 4: Corriger les autres usages de la version 4**

Run: `npx tsc --noEmit` — corriger chaque erreur (littéraux `version: 4` dans les tests existants : `grep -rn "version: 4" tests src`), sans changer le sens des tests ; un test de migration existant qui attend `version: 4` en sortie doit attendre `5`.

- [ ] **Step 5: Lancer toute la suite Bibliothèque**

Run: `npx vitest run tests/core/library tests/content --maxWorkers=4`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(bibliotheque): réglage météo global dans l'état (v5) + migration

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Valeurs météo, cibles, mélange

**Files:**
- Create: `src/core/library/weather/weather-types.ts`
- Test: `tests/core/library/weather-types.test.ts`

**Interfaces:**
- Consumes: `WeatherState`, `WEATHER_STATES` (Task 1).
- Produces:
  - `type Weather = { cloud: number; precip: number; kind: 'rain' | 'snow'; fog: number; wind: number; lightning: number; wet: number; snowCover: number }` (toutes les valeurs 0..1)
  - `targetOf(state: WeatherState): Weather` (cible sans historique : `wet`/`snowCover` à leur valeur d'équilibre)
  - `blend(from: Weather, to: Weather, k: number): Weather` (k borné 0..1 ; si les `kind` diffèrent, `precip` est multipliée par `|2k−1|` et `kind` bascule à k ≥ 0.5)
  - `smooth(k: number): number` (smoothstep borné)
  - `nearestState(w: Weather): WeatherState`
  - `WEATHER_LABEL: Record<WeatherState, string>`

- [ ] **Step 1: Écrire le test**

```ts
// tests/core/library/weather-types.test.ts
import { describe, expect, it } from 'vitest';
import { WEATHER_STATES } from '../../../src/core/library/library-types';
import { WEATHER_LABEL, blend, nearestState, smooth, targetOf } from '../../../src/core/library/weather/weather-types';

describe('cibles', () => {
  it('chaque état a des valeurs entre 0 et 1', () => {
    for (const state of WEATHER_STATES) {
      const w = targetOf(state);
      for (const key of ['cloud', 'precip', 'fog', 'wind', 'lightning', 'wet', 'snowCover'] as const) {
        expect(w[key]).toBeGreaterThanOrEqual(0);
        expect(w[key]).toBeLessThanOrEqual(1);
      }
    }
  });
  it('l’orage est le seul à avoir des éclairs ; la neige couvre le sol, la pluie le mouille', () => {
    expect(WEATHER_STATES.filter((s) => targetOf(s).lightning > 0)).toEqual(['storm']);
    expect(targetOf('snow').snowCover).toBeGreaterThan(0.5);
    expect(targetOf('snow').wet).toBe(0);
    expect(targetOf('rain').wet).toBeGreaterThan(0.5);
    expect(targetOf('sun').wet).toBe(0);
  });
  it('nearestState retrouve chaque état', () => {
    for (const state of WEATHER_STATES) expect(nearestState(targetOf(state))).toBe(state);
  });
  it('un libellé français par état', () => {
    expect(WEATHER_LABEL.storm).toBe('Orage');
    expect(Object.keys(WEATHER_LABEL)).toHaveLength(WEATHER_STATES.length);
  });
});

describe('blend', () => {
  it('rend les extrémités et reste continu', () => {
    const a = targetOf('sun');
    const b = targetOf('rain');
    expect(blend(a, b, 0)).toEqual(a);
    expect(blend(a, b, 1)).toEqual(b);
    const mid = blend(a, b, 0.5);
    expect(mid.cloud).toBeCloseTo((a.cloud + b.cloud) / 2);
    expect(blend(a, b, -3)).toEqual(a);
    expect(blend(a, b, 7)).toEqual(b);
  });
  it('pluie → neige : la précipitation passe par zéro, jamais de bascule brute', () => {
    const rain = targetOf('rain');
    const snow = targetOf('snow');
    expect(blend(rain, snow, 0.5).precip).toBeCloseTo(0);
    expect(blend(rain, snow, 0.25).kind).toBe('rain');
    expect(blend(rain, snow, 0.75).kind).toBe('snow');
  });
  it('smooth est monotone entre 0 et 1', () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    expect(smooth(0.5)).toBeCloseTo(0.5);
    expect(smooth(0.25)).toBeLessThan(smooth(0.75));
    expect(smooth(-1)).toBe(0);
    expect(smooth(2)).toBe(1);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/library/weather-types.test.ts`
Expected: FAIL (module absent).

- [ ] **Step 3: Implémenter**

```ts
// src/core/library/weather/weather-types.ts
import type { WeatherState } from '../library-types';

// Valeurs continues (toutes entre 0 et 1) décrivant le ciel à un instant.
export type Weather = {
  cloud: number; // couverture nuageuse
  precip: number; // intensité des gouttes ou des flocons
  kind: 'rain' | 'snow';
  fog: number;
  wind: number;
  lightning: number; // probabilité d'éclairs (orage)
  wet: number; // sol mouillé (flaques)
  snowCover: number; // neige au sol
};

type Target = Omit<Weather, 'wet' | 'snowCover'>;

const TARGETS: Record<WeatherState, Target> = {
  sun: { cloud: 0.1, precip: 0, kind: 'rain', fog: 0, wind: 0.2, lightning: 0 },
  cloudy: { cloud: 0.65, precip: 0, kind: 'rain', fog: 0.05, wind: 0.4, lightning: 0 },
  drizzle: { cloud: 0.8, precip: 0.25, kind: 'rain', fog: 0.15, wind: 0.3, lightning: 0 },
  rain: { cloud: 0.92, precip: 0.65, kind: 'rain', fog: 0.2, wind: 0.5, lightning: 0 },
  storm: { cloud: 1, precip: 1, kind: 'rain', fog: 0.15, wind: 0.9, lightning: 1 },
  snow: { cloud: 0.85, precip: 0.5, kind: 'snow', fog: 0.25, wind: 0.2, lightning: 0 },
  fog: { cloud: 0.55, precip: 0, kind: 'rain', fog: 0.85, wind: 0.05, lightning: 0 },
};

export const WEATHER_LABEL: Record<WeatherState, string> = {
  sun: 'Soleil',
  cloudy: 'Nuageux',
  drizzle: 'Bruine',
  rain: 'Pluie',
  storm: 'Orage',
  snow: 'Neige',
  fog: 'Brume',
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const smooth = (k: number): number => {
  const x = clamp01(k);
  return x * x * (3 - 2 * x);
};

// Sol à l'équilibre sous cet état (utilisé en mode forcé et pour les cibles).
export const steadyWet = (t: Target): number => (t.kind === 'rain' ? clamp01(t.precip * 1.4) : 0);
export const steadySnow = (t: Target): number => (t.kind === 'snow' ? clamp01(t.precip * 1.6) : 0);

export function targetOf(state: WeatherState): Weather {
  const t = TARGETS[state];
  return { ...t, wet: steadyWet(t), snowCover: steadySnow(t) };
}

const mix = (a: number, b: number, k: number): number => a + (b - a) * k;

export function blend(from: Weather, to: Weather, k: number): Weather {
  const x = clamp01(k);
  const sameKind = from.kind === to.kind;
  return {
    cloud: mix(from.cloud, to.cloud, x),
    precip: sameKind ? mix(from.precip, to.precip, x) : mix(from.precip, to.precip, x) * Math.abs(2 * x - 1),
    kind: x < 0.5 ? from.kind : to.kind,
    fog: mix(from.fog, to.fog, x),
    wind: mix(from.wind, to.wind, x),
    lightning: mix(from.lightning, to.lightning, x),
    wet: mix(from.wet, to.wet, x),
    snowCover: mix(from.snowCover, to.snowCover, x),
  };
}

// L'état logique le plus proche (légende du panneau).
export function nearestState(w: Weather): WeatherState {
  let best: WeatherState = 'cloudy';
  let bestDistance = Infinity;
  for (const state of Object.keys(TARGETS) as WeatherState[]) {
    const t = TARGETS[state];
    const d =
      (w.cloud - t.cloud) ** 2 +
      (w.precip - t.precip) ** 2 * 2 +
      (w.fog - t.fog) ** 2 +
      (w.lightning - t.lightning) ** 2 * 2 +
      (w.kind === t.kind || (w.precip < 0.05 && t.precip === 0) ? 0 : 1);
    if (d < bestDistance) {
      bestDistance = d;
      best = state;
    }
  }
  return best;
}
```

- [ ] **Step 4: Lancer, vérifier la réussite**

Run: `npx vitest run tests/core/library/weather-types.test.ts`
Expected: PASS. Si `nearestState` échoue pour un état, ajuster les poids de la distance (pas les cibles) jusqu'à ce que les 7 états se retrouvent.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(bibliotheque): valeurs météo continues, cibles par état et mélange

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Plan aléatoire déterministe (ticks, époques, saison)

**Files:**
- Create: `src/core/library/weather/weather-plan.ts`
- Test: `tests/core/library/weather-plan.test.ts`

**Interfaces:**
- Consumes: `mulberry32`, `hashString` (`../scene-world`), `Weather`, `targetOf`, `blend`, `smooth`, `steadyWet`, `steadySnow` (Task 2).
- Produces:
  - constantes `TICK_MS = 240_000`, `EPOCH_TICKS = 90`, `CALM_TICKS = 4`, `WEATHER_SEED: number`
  - `plausibleTempC(lat: number, date: Date): number`
  - `epochStates(seed: number, epoch: number, lat: number): WeatherState[]` (90 états ; premier et dernier = `'cloudy'`)
  - `weatherAtRandom(ctx: { seed: number; lat: number }, nowMs: number): Weather`

- [ ] **Step 1: Écrire le test**

```ts
// tests/core/library/weather-plan.test.ts
import { describe, expect, it } from 'vitest';
import { WEATHER_STATES } from '../../../src/core/library/library-types';
import { EPOCH_TICKS, TICK_MS, WEATHER_SEED, epochStates, plausibleTempC, weatherAtRandom } from '../../../src/core/library/weather/weather-plan';

const EPOCH_MS = EPOCH_TICKS * TICK_MS;
const ctx = { seed: WEATHER_SEED, lat: 48 };

describe('température plausible', () => {
  it('froid l’hiver, doux l’été, chaud sous les tropiques, inversé au sud', () => {
    expect(plausibleTempC(48, new Date(2026, 0, 15))).toBeLessThan(2);
    expect(plausibleTempC(48, new Date(2026, 6, 15))).toBeGreaterThan(14);
    expect(plausibleTempC(5, new Date(2026, 0, 15))).toBeGreaterThan(20);
    expect(plausibleTempC(-40, new Date(2026, 6, 15))).toBeLessThan(plausibleTempC(-40, new Date(2026, 0, 15)));
  });
});

describe('époque', () => {
  it('commence et finit par « nuageux » et ne saute jamais un palier', () => {
    for (let epoch = 1000; epoch < 1060; epoch++) {
      const states = epochStates(WEATHER_SEED, epoch, 48);
      expect(states).toHaveLength(EPOCH_TICKS);
      expect(states[0]).toBe('cloudy');
      expect(states[EPOCH_TICKS - 1]).toBe('cloudy');
      for (let i = 1; i < states.length; i++) {
        expect(!(states[i - 1] === 'sun' && states[i] === 'storm')).toBe(true);
        expect(!(states[i - 1] === 'storm' && states[i] === 'sun')).toBe(true);
        expect(!(states[i - 1] === 'sun' && states[i] === 'rain')).toBe(true);
      }
    }
  });
  it('est déterministe', () => {
    expect(epochStates(WEATHER_SEED, 4242, 48)).toEqual(epochStates(WEATHER_SEED, 4242, 48));
  });
  it('varie : sur 200 époques on voit les sept états', () => {
    const seen = new Set<string>();
    // Latitude 60 : froid une partie de l'année → la neige est possible ; le reste vient de l'été et de l'hiver tirés par l'époque.
    for (let epoch = 1; epoch <= 400; epoch++) for (const s of epochStates(WEATHER_SEED, epoch * 37, 60)) seen.add(s);
    expect([...seen].sort()).toEqual([...WEATHER_STATES].sort());
  });
  it('jamais de neige sous les tropiques', () => {
    for (let epoch = 0; epoch < 200; epoch++) expect(epochStates(WEATHER_SEED, epoch * 11, 5)).not.toContain('snow');
  });
});

describe('weatherAtRandom', () => {
  it('est continu : deux instants voisins donnent des valeurs voisines, y compris aux frontières de tick et d’époque', () => {
    const edges = [0, 1, 2, 17, 89, 90, 91].map((n) => 5000 * EPOCH_MS + n * TICK_MS);
    for (const edge of edges) {
      const before = weatherAtRandom(ctx, edge - 50);
      const after = weatherAtRandom(ctx, edge + 50);
      for (const key of ['cloud', 'precip', 'fog', 'wind', 'lightning', 'wet', 'snowCover'] as const) {
        expect(Math.abs(before[key] - after[key])).toBeLessThan(0.02);
      }
    }
  });
  it('est déterministe et borné', () => {
    const now = 1_790_000_000_000;
    expect(weatherAtRandom(ctx, now)).toEqual(weatherAtRandom(ctx, now));
    for (let i = 0; i < 300; i++) {
      const w = weatherAtRandom(ctx, now + i * 97_000);
      for (const key of ['cloud', 'precip', 'fog', 'wind', 'lightning', 'wet', 'snowCover'] as const) {
        expect(w[key]).toBeGreaterThanOrEqual(0);
        expect(w[key]).toBeLessThanOrEqual(1);
      }
    }
  });
  it('le sol se mouille sous la pluie puis sèche', () => {
    let wettest = 0;
    let afterRain = 1;
    let sawRain = false;
    for (let i = 0; i < EPOCH_TICKS * 40 && !(sawRain && afterRain < 0.05); i++) {
      const w = weatherAtRandom(ctx, 3000 * EPOCH_MS + i * TICK_MS);
      if (w.precip > 0.5 && w.kind === 'rain') {
        sawRain = true;
        wettest = Math.max(wettest, w.wet);
      }
      if (sawRain && w.precip === 0) afterRain = Math.min(afterRain, w.wet);
    }
    expect(sawRain).toBe(true);
    expect(wettest).toBeGreaterThan(0.4);
    expect(afterRain).toBeLessThan(0.05);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/library/weather-plan.test.ts`
Expected: FAIL (module absent).

- [ ] **Step 3: Implémenter**

```ts
// src/core/library/weather/weather-plan.ts
import type { WeatherState } from '../library-types';
import { hashString, mulberry32 } from '../scene-world';
import { blend, smooth, steadySnow, steadyWet, targetOf, type Weather } from './weather-types';

// Le temps est découpé en ticks de 4 min ; une époque de 6 h repart toujours de « nuageux » et s'apaise à la fin :
// la météo est une fonction pure de l'horloge, sans dérive ni discontinuité à la frontière d'une époque.
export const TICK_MS = 240_000;
export const EPOCH_TICKS = 90;
export const CALM_TICKS = 4;
// Même graine partout : à un instant donné, toutes les pièces et tous les appareils voient le même temps.
export const WEATHER_SEED = hashString('wmt-weather-v1');

const DAY_MS = 86_400_000;

// Température plausible à la latitude et à la date (sans service externe) : ~32 °C à l'équateur, -0,5 °C par degré, ±11 °C de saison.
export function plausibleTempC(lat: number, date: Date): number {
  const doy = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / DAY_MS);
  const season = Math.cos((2 * Math.PI * (doy - 200)) / 365) * (lat >= 0 ? 1 : -1);
  return 32 - 0.5 * Math.abs(lat) + 11 * season * Math.min(1, Math.abs(lat) / 45);
}

// Pas logiques : jamais de soleil → orage direct. Poids relatifs ; « rester » est tiré à part.
const STEP: Record<WeatherState, [WeatherState, number][]> = {
  sun: [['cloudy', 1]],
  cloudy: [['sun', 0.4], ['drizzle', 0.25], ['fog', 0.15], ['snow', 0.2]],
  drizzle: [['rain', 0.4], ['cloudy', 0.6]],
  rain: [['storm', 0.2], ['drizzle', 0.45], ['cloudy', 0.35]],
  storm: [['rain', 1]],
  snow: [['cloudy', 0.7], ['fog', 0.3]],
  fog: [['cloudy', 0.6], ['sun', 0.4]],
};
const HOLD: Record<WeatherState, number> = { sun: 0.55, cloudy: 0.5, drizzle: 0.5, rain: 0.5, storm: 0.3, snow: 0.6, fog: 0.5 };
// Apaisement de fin d'époque : un pas vers « nuageux » (l'orage met 3 pas).
const CALM: Record<WeatherState, WeatherState> = { sun: 'cloudy', cloudy: 'cloudy', drizzle: 'cloudy', rain: 'drizzle', storm: 'rain', snow: 'cloudy', fog: 'cloudy' };

// La neige n'existe que par temps froid ; la pluie gèle en neige, l'orage devient pluie sous 0 °C.
function byTemperature(state: WeatherState, tempC: number): WeatherState {
  if (state === 'snow' && tempC >= 2) return 'drizzle';
  if ((state === 'drizzle' || state === 'rain') && tempC <= -1) return 'snow';
  if (state === 'storm' && tempC <= 0) return 'rain';
  return state;
}

function pick(options: [WeatherState, number][], u: number): WeatherState {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let acc = 0;
  for (const [state, weight] of options) {
    acc += weight / total;
    if (u < acc) return state;
  }
  return options[options.length - 1]![0];
}

type EpochData = { states: WeatherState[]; wet: number[]; snow: number[] };
const cache = new Map<string, EpochData>();

// Accumulateurs de fin de tick : le sol se mouille vite et sèche en ≈ 15 min, la neige s'accumule et fond un peu plus lentement.
const DRY = 0.7;
const SOAK = 0.6;
const MELT = 0.78;
const PILE = 0.5;

function epochData(seed: number, epoch: number, lat: number): EpochData {
  const key = `${seed}:${epoch}:${Math.round(lat)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const tempC = plausibleTempC(lat, new Date(epoch * EPOCH_TICKS * TICK_MS));
  const rng = mulberry32(seed ^ Math.imul(epoch + 1, 2654435761));
  const states: WeatherState[] = ['cloudy'];
  for (let i = 1; i < EPOCH_TICKS; i++) {
    const prev = states[i - 1]!;
    // Les deux tirages sont toujours consommés : la suite reste la même quel que soit le chemin.
    const hold = rng();
    const step = rng();
    if (i >= EPOCH_TICKS - CALM_TICKS) states.push(CALM[prev]);
    else if (hold < HOLD[prev]) states.push(prev);
    else states.push(byTemperature(pick(STEP[prev], step), tempC));
  }
  const wet: number[] = [];
  const snow: number[] = [];
  let w = 0;
  let s = 0;
  for (const state of states) {
    const t = targetOf(state);
    w = Math.min(1, w * DRY + (t.kind === 'rain' ? t.precip * SOAK : 0));
    s = Math.min(1, s * MELT + (t.kind === 'snow' ? t.precip * PILE : 0));
    wet.push(w);
    snow.push(s);
  }
  const data = { states, wet, snow };
  if (cache.size > 64) cache.clear();
  cache.set(key, data);
  return data;
}

export function epochStates(seed: number, epoch: number, lat: number): WeatherState[] {
  return epochData(seed, epoch, lat).states;
}

export function weatherAtRandom(ctx: { seed: number; lat: number }, nowMs: number): Weather {
  const tick = Math.floor(nowMs / TICK_MS);
  const epoch = Math.floor(tick / EPOCH_TICKS);
  const i = tick - epoch * EPOCH_TICKS;
  const { states, wet, snow } = epochData(ctx.seed, epoch, ctx.lat);
  const cur = targetOf(states[i]!);
  const prev = targetOf(i > 0 ? states[i - 1]! : 'cloudy');
  const intoTick = (nowMs - tick * TICK_MS) / 1000;
  // Durée du fondu entre deux états : 20 à 60 s, tirée de la graine et du tick.
  const blendSeconds = 20 + 40 * mulberry32(ctx.seed ^ Math.imul(tick + 7, 40503))();
  const mixed = blend(prev, cur, smooth(intoTick / blendSeconds));
  const frac = (nowMs - tick * TICK_MS) / TICK_MS;
  const lerp = (a: number, b: number): number => a + (b - a) * frac;
  const prevWet = i > 0 ? wet[i - 1]! : 0;
  const prevSnow = i > 0 ? snow[i - 1]! : 0;
  return { ...mixed, wet: lerp(prevWet, wet[i]!), snowCover: lerp(prevSnow, snow[i]!) };
}

// Réexporté pour le mode forcé (sol à l'équilibre d'un état).
export { steadySnow, steadyWet };
```

- [ ] **Step 4: Lancer, vérifier la réussite**

Run: `npx vitest run tests/core/library/weather-plan.test.ts`
Expected: PASS. Si « sept états » échoue, élargir le balayage du test (plus d'époques, plusieurs latitudes) plutôt que de fausser les poids ; si la continuité dépasse 0,02, vérifier que `blendSeconds` est ≤ 60 et que `wet`/`snowCover` sont interpolés sur le tick entier.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(bibliotheque): météo aléatoire déterministe (ticks, époques, saison)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Horloge météo, éclairs, arc-en-ciel, drapeaux

**Files:**
- Create: `src/core/library/weather/weather-clock.ts`, `src/core/library/weather/index.ts`
- Test: `tests/core/library/weather-clock.test.ts`

**Interfaces:**
- Consumes: `Weather`, `blend`, `smooth`, `targetOf` (Task 2) ; `mulberry32` (`../scene-world`).
- Produces:
  - `type WeatherSource = (nowMs: number) => Weather`
  - `createWeatherClock(): { setSource(next: WeatherSource, nowMs: number): void; read(nowMs: number): Weather }` (un changement de source fond de l'ancienne valeur affichée vers la nouvelle en `FADE_MS = 30_000`)
  - `steadySource(state: WeatherState): WeatherSource`
  - `lightningAt(w: Weather, nowMs: number, seed: number): { x: number; strength: number } | null` (x ∈ [0,1))
  - `rainbowOf(w: Weather, daylight: number): number` (0..0.8)
  - `weatherFlags(w: Weather, previous: { gloom: boolean; rainy: boolean }): { gloom: boolean; rainy: boolean }` (hystérésis : gloom s'allume à cloud > 0.78, s'éteint sous 0.68 ; rainy = pluie avec precip > 0.3, éteint sous 0.2)
  - `index.ts` ré-exporte tout le dossier.

- [ ] **Step 1: Écrire le test**

```ts
// tests/core/library/weather-clock.test.ts
import { describe, expect, it } from 'vitest';
import { createWeatherClock, lightningAt, rainbowOf, steadySource, weatherFlags } from '../../../src/core/library/weather/weather-clock';
import { targetOf } from '../../../src/core/library/weather/weather-types';

describe('WeatherClock', () => {
  it('rend la source telle quelle au premier réglage', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('rain'), 0);
    expect(clock.read(0)).toEqual(targetOf('rain'));
  });
  it('fond d’une source à l’autre en 30 s, sans saut', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('sun'), 0);
    clock.setSource(steadySource('storm'), 1000);
    expect(clock.read(1000)).toEqual(targetOf('sun'));
    const mid = clock.read(16_000);
    expect(mid.cloud).toBeGreaterThan(targetOf('sun').cloud);
    expect(mid.cloud).toBeLessThan(targetOf('storm').cloud);
    expect(clock.read(31_000)).toEqual(targetOf('storm'));
    expect(clock.read(90_000)).toEqual(targetOf('storm'));
  });
  it('un changement en plein fondu part de la valeur affichée', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('sun'), 0);
    clock.setSource(steadySource('storm'), 0);
    const shown = clock.read(15_000);
    clock.setSource(steadySource('fog'), 15_000);
    expect(clock.read(15_000)).toEqual(shown);
  });
});

describe('éclairs', () => {
  it('seulement par orage, brefs, et jamais plus d’un par fenêtre de 3 s', () => {
    expect(lightningAt(targetOf('rain'), 12_345, 1)).toBeNull();
    const storm = targetOf('storm');
    let flashes = 0;
    let lastWindow = -1;
    for (let t = 0; t < 600_000; t += 20) {
      const f = lightningAt(storm, t, 7);
      if (!f) continue;
      expect(f.strength).toBeGreaterThan(0);
      expect(f.strength).toBeLessThanOrEqual(1);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeLessThan(1);
      const win = Math.floor(t / 3000);
      if (win !== lastWindow) flashes++;
      lastWindow = win;
    }
    expect(flashes).toBeGreaterThan(20);
    expect(flashes).toBeLessThan(200);
  });
  it('est déterministe', () => {
    const storm = targetOf('storm');
    for (let t = 0; t < 60_000; t += 20) expect(lightningAt(storm, t, 3)).toEqual(lightningAt(storm, t, 3));
  });
});

describe('arc-en-ciel', () => {
  it('apparaît à l’éclaircie sur sol mouillé, sous un soleil assez haut', () => {
    const after = { ...targetOf('sun'), wet: 0.7 };
    expect(rainbowOf(after, 1)).toBeGreaterThan(0.3);
    expect(rainbowOf(after, 0.2)).toBe(0);
    expect(rainbowOf(targetOf('sun'), 1)).toBe(0);
    expect(rainbowOf(targetOf('rain'), 1)).toBe(0);
  });
});

describe('drapeaux', () => {
  it('hystérésis sur le ciel sombre et la pluie', () => {
    const off = { gloom: false, rainy: false };
    expect(weatherFlags({ ...targetOf('cloudy'), cloud: 0.75 }, off).gloom).toBe(false);
    const on = weatherFlags({ ...targetOf('rain') }, off);
    expect(on).toEqual({ gloom: true, rainy: true });
    expect(weatherFlags({ ...targetOf('rain'), cloud: 0.72, precip: 0.25 }, on)).toEqual({ gloom: true, rainy: true });
    expect(weatherFlags({ ...targetOf('cloudy'), cloud: 0.6 }, on)).toEqual({ gloom: false, rainy: false });
    expect(weatherFlags(targetOf('snow'), off).rainy).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/core/library/weather-clock.test.ts`
Expected: FAIL (module absent).

- [ ] **Step 3: Implémenter**

```ts
// src/core/library/weather/weather-clock.ts
import type { WeatherState } from '../library-types';
import { mulberry32 } from '../scene-world';
import { blend, smooth, targetOf, type Weather } from './weather-types';

export type WeatherSource = (nowMs: number) => Weather;

export const FADE_MS = 30_000;

export const steadySource = (state: WeatherState): WeatherSource => {
  const w = targetOf(state);
  return () => w;
};

// Rend la météo de la source courante ; quand la source change (réglage), fond de la valeur AFFICHÉE vers la nouvelle en 30 s.
export function createWeatherClock(): { setSource(next: WeatherSource, nowMs: number): void; read(nowMs: number): Weather } {
  let source: WeatherSource | null = null;
  let from: Weather | null = null;
  let startedAt = 0;
  const read = (nowMs: number): Weather => {
    if (!source) return targetOf('cloudy');
    const target = source(nowMs);
    if (!from) return target;
    const k = (nowMs - startedAt) / FADE_MS;
    if (k >= 1) {
      from = null;
      return target;
    }
    return blend(from, target, smooth(k));
  };
  return {
    read,
    setSource(next, nowMs) {
      const shown = source ? read(nowMs) : null;
      source = next;
      from = shown;
      startedAt = nowMs;
    },
  };
}

const FLASH_MS = 150;
const WINDOW_MS = 3000;

// Éclair ponctuel : une fenêtre de 3 s en contient au plus un, dont l'instant, l'abscisse (0..1) et l'existence viennent de la graine.
export function lightningAt(w: Weather, nowMs: number, seed: number): { x: number; strength: number } | null {
  if (w.lightning <= 0.05) return null;
  const win = Math.floor(nowMs / WINDOW_MS);
  const rng = mulberry32(seed ^ Math.imul(win + 1, 2654435761));
  const happens = rng();
  const offset = rng() * (WINDOW_MS - FLASH_MS);
  const x = rng();
  if (happens > 0.45 * w.lightning) return null;
  const into = nowMs - win * WINDOW_MS - offset;
  if (into < 0 || into > FLASH_MS) return null;
  return { x, strength: 1 - into / FLASH_MS };
}

// Arc-en-ciel : sol encore mouillé, plus de précipitation, ciel dégagé, soleil haut.
export function rainbowOf(w: Weather, daylight: number): number {
  if (daylight < 0.6 || w.cloud >= 0.6 || w.precip >= 0.1) return 0;
  return Math.min(0.8, Math.max(0, (w.wet - 0.2) * 1.6));
}

export type WeatherFlags = { gloom: boolean; rainy: boolean };

// Deux drapeaux « tout ou rien » pour le décor fixe (lumières, parapluies), avec hystérésis pour ne pas le redessiner en boucle.
export function weatherFlags(w: Weather, previous: WeatherFlags): WeatherFlags {
  const gloom = previous.gloom ? w.cloud > 0.68 : w.cloud > 0.78;
  const raining = w.kind === 'rain';
  const rainy = previous.rainy ? raining && w.precip > 0.2 : raining && w.precip > 0.3;
  return { gloom, rainy };
}
```

```ts
// src/core/library/weather/index.ts
export * from './weather-types';
export * from './weather-plan';
export * from './weather-clock';
export * from './weather-real';
```
(`weather-real` arrive à la tâche 5 : créer d'abord le fichier `weather-real.ts` avec `export {};` pour que l'index compile, ou ne l'ajouter qu'à la tâche 5.)

- [ ] **Step 4: Lancer, vérifier la réussite**

Run: `npx vitest run tests/core/library/weather-clock.test.ts`
Expected: PASS. Si le nombre d'éclairs sort des bornes, ajuster le seuil 0.45 (pas les bornes du test) pour viser ≈ 1 éclair toutes les 5 à 10 s.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(bibliotheque): horloge météo (fondu), éclairs, arc-en-ciel, drapeaux

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Météo réelle (traduction, client, route du relais)

**Files:**
- Create: `src/core/library/weather/weather-real.ts`, `relay/src/weather.ts`
- Modify: `relay/src/index.ts` (route + limite), `src/core/library/weather/index.ts`
- Test: `tests/core/library/weather-real.test.ts`, `tests/relay/weather.test.ts`

**Interfaces:**
- Consumes: `Weather` (Task 2) ; `RELAY_BASE` (`src/core/documentary/config`) ; `Fetcher`, `ProxyResult`, `failure` (`relay/src/proxy`).
- Produces:
  - `type RealObservation = { code: number; tempC: number; cloud: number; precipMm: number; windKmh: number; visibilityM: number }`
  - `realToWeather(obs: RealObservation): Weather`
  - `WEATHER_RELAY = `${RELAY_BASE}/weather``
  - `createRealWeather(deps: { fetch: (url: string) => Promise<Response>; now: () => number; storage: { get(key: string): string | null; set(key: string, value: string): void } }): { latest(): RealObservation | null; refresh(pos: { lat: number; lon: number }): Promise<RealObservation | null> }`
    - `refresh` : utilise le cache s'il a moins de 15 min et la même position (arrondie à 0,1°) ; un seul appel à la fois ; après un échec, n'essaie plus avant 1, puis 2, puis 5 min (plafond) ; ne lève jamais.
    - Clé de stockage `wmt:weather-real`.
  - Relais : `proxyWeather(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult>` ; réponse `{"ok":true,"code":…,"temp":…,"cloud":…,"precip":…,"wind":…,"visibility":…}`.

- [ ] **Step 1: Écrire les tests du relais**

```ts
// tests/relay/weather.test.ts
import { describe, expect, it, vi } from 'vitest';
import { proxyWeather } from '../../relay/src/weather';

const upstream = {
  current: { weather_code: 61, temperature_2m: 7.4, cloud_cover: 90, precipitation: 1.2, wind_speed_10m: 18, visibility: 9000 },
};
const run = (path: string, now = 0, deps?: Partial<Parameters<typeof proxyWeather>[1]>) => {
  const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify(upstream), { status: 200 }));
  return { fetchFn, result: proxyWeather(new URL(`https://relais.test${path}`), { fetch: fetchFn, now: () => now, ...deps }) };
};

describe('proxyWeather', () => {
  it('arrondit les coordonnées à 0,1° et renvoie un JSON réduit', async () => {
    const { fetchFn, result } = run('/weather?lat=48.8566&lon=2.3522');
    const out = await result;
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body)).toEqual({ ok: true, code: 61, temp: 7.4, cloud: 90, precip: 1.2, wind: 18, visibility: 9000 });
    const sent = new URL(fetchFn.mock.calls[0]?.[0] ?? '');
    expect(sent.origin).toBe('https://api.open-meteo.com');
    expect(sent.searchParams.get('latitude')).toBe('48.9');
    expect(sent.searchParams.get('longitude')).toBe('2.4');
  });
  it('refuse des coordonnées absentes ou hors bornes', async () => {
    for (const path of ['/weather', '/weather?lat=abc&lon=1', '/weather?lat=91&lon=0', '/weather?lat=0&lon=181']) {
      const { fetchFn, result } = run(path);
      expect((await result).status).toBe(400);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });
  it('met en cache 10 minutes par case de 0,1°', async () => {
    const fetchFn = vi.fn(async (_url: string) => new Response(JSON.stringify(upstream), { status: 200 }));
    let now = 1_000_000;
    const deps = { fetch: fetchFn, now: () => now };
    await proxyWeather(new URL('https://r.test/weather?lat=10.01&lon=20.01'), deps);
    await proxyWeather(new URL('https://r.test/weather?lat=10.04&lon=20.04'), deps);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now += 11 * 60_000;
    await proxyWeather(new URL('https://r.test/weather?lat=10.01&lon=20.01'), deps);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('renvoie 502 neutre si l’amont échoue ou répond n’importe quoi', async () => {
    const down = await proxyWeather(new URL('https://r.test/weather?lat=1&lon=2'), { fetch: async () => { throw new Error('x'); }, now: () => 0 });
    expect(down.status).toBe(502);
    const junk = await proxyWeather(new URL('https://r.test/weather?lat=3&lon=4'), { fetch: async () => new Response('{"nope":1}', { status: 200 }), now: () => 0 });
    expect(junk.status).toBe(502);
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/relay/weather.test.ts`
Expected: FAIL (module absent).

- [ ] **Step 3: Implémenter la route du relais**

```ts
// relay/src/weather.ts
import { failure, forward, type Fetcher, type ProxyResult } from './proxy';

const BASE = 'https://api.open-meteo.com/v1/forecast';
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 500;

// Cache par case de 0,1° (compteur en mémoire de l'instance, comme le limiteur).
const cache = new Map<string, { at: number; body: string }>();

const rounded = (v: number): number => Math.round(v * 10) / 10;

export async function proxyWeather(url: URL, deps: { fetch: Fetcher; now: () => number }): Promise<ProxyResult> {
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  if (!url.searchParams.has('lat') || !url.searchParams.has('lon') || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return failure(400, 'bad-request');
  }
  const key = `${rounded(lat).toFixed(1)},${rounded(lon).toFixed(1)}`;
  const hit = cache.get(key);
  if (hit && deps.now() - hit.at < CACHE_MS) return { status: 200, body: hit.body };
  const query = new URLSearchParams({
    latitude: rounded(lat).toFixed(1),
    longitude: rounded(lon).toFixed(1),
    current: 'weather_code,temperature_2m,cloud_cover,precipitation,wind_speed_10m,visibility',
    wind_speed_unit: 'kmh',
  });
  const result = await forward(deps.fetch, `${BASE}?${query.toString()}`);
  if (result.status !== 200) return result.status === 429 ? result : failure(502, 'upstream');
  let current: Record<string, unknown> | undefined;
  try {
    current = (JSON.parse(result.body) as { current?: Record<string, unknown> }).current;
  } catch {
    return failure(502, 'upstream');
  }
  const num = (name: string): number | null => (typeof current?.[name] === 'number' ? (current[name] as number) : null);
  const code = num('weather_code');
  const temp = num('temperature_2m');
  if (code === null || temp === null) return failure(502, 'upstream');
  const body = JSON.stringify({
    ok: true,
    code,
    temp,
    cloud: num('cloud_cover') ?? 0,
    precip: num('precipitation') ?? 0,
    wind: num('wind_speed_10m') ?? 0,
    visibility: num('visibility') ?? 20000,
  });
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: deps.now(), body });
  return { status: 200, body };
}
```

Dans `relay/src/index.ts` : importer `proxyWeather` ; ajouter `weather: [60, 60_000]` à `LIMITS` ; dans `relay()` après la ligne `/books/` :

```ts
  if (get && url.pathname === '/weather') return limited(request, 'weather') ?? relayed(await proxyWeather(url, { fetch: net, now: () => Date.now() }));
```
Vérifier dans `index.ts` que `/weather` n'est pas déjà prise par une autre route et que le CORS (`HEADERS`) s'applique (c'est le cas des autres routes via `relayed`). Ajouter un test dans `tests/relay/index.test.ts` calqué sur celui de `/books/` (statut 400 sans paramètres, 429 au-delà de la limite) en lisant le test voisin.

- [ ] **Step 4: Lancer les tests du relais**

Run: `npx vitest run tests/relay --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Écrire les tests de la météo réelle**

```ts
// tests/core/library/weather-real.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createRealWeather, realToWeather, type RealObservation } from '../../../src/core/library/weather/weather-real';

const obs = (over: Partial<RealObservation> = {}): RealObservation => ({ code: 0, tempC: 15, cloud: 10, precipMm: 0, windKmh: 10, visibilityM: 20000, ...over });

describe('realToWeather', () => {
  it('ciel clair → soleil', () => {
    const w = realToWeather(obs());
    expect(w.cloud).toBeLessThan(0.2);
    expect(w.precip).toBe(0);
    expect(w.lightning).toBe(0);
  });
  it('pluie (code 63, 3 mm) → pluie franche, sol mouillé, ciel couvert', () => {
    const w = realToWeather(obs({ code: 63, precipMm: 3, cloud: 100 }));
    expect(w.kind).toBe('rain');
    expect(w.precip).toBeGreaterThan(0.5);
    expect(w.wet).toBeGreaterThan(0.5);
  });
  it('bruine (code 53) → faible précipitation', () => {
    const w = realToWeather(obs({ code: 53, cloud: 80 }));
    expect(w.precip).toBeGreaterThan(0.1);
    expect(w.precip).toBeLessThan(0.4);
  });
  it('neige (code 73) → flocons et sol blanc', () => {
    const w = realToWeather(obs({ code: 73, tempC: -2, cloud: 100 }));
    expect(w.kind).toBe('snow');
    expect(w.snowCover).toBeGreaterThan(0.4);
    expect(w.wet).toBe(0);
  });
  it('orage (code 95) → éclairs', () => {
    expect(realToWeather(obs({ code: 95, precipMm: 5, cloud: 100 })).lightning).toBe(1);
  });
  it('brouillard (code 45) ou faible visibilité → brume', () => {
    expect(realToWeather(obs({ code: 45 })).fog).toBeGreaterThan(0.7);
    expect(realToWeather(obs({ visibilityM: 800 })).fog).toBeGreaterThan(0.3);
  });
  it('le vent est normalisé', () => {
    expect(realToWeather(obs({ windKmh: 100 })).wind).toBe(1);
    expect(realToWeather(obs({ windKmh: 0 })).wind).toBe(0);
  });
});

const memory = () => {
  const data = new Map<string, string>();
  return { get: (k: string) => data.get(k) ?? null, set: (k: string, v: string) => void data.set(k, v) };
};
const ok = (extra = {}) => new Response(JSON.stringify({ ok: true, code: 61, temp: 8, cloud: 90, precip: 1, wind: 12, visibility: 9000, ...extra }), { status: 200 });
const paris = { lat: 48.85, lon: 2.35 };

describe('createRealWeather', () => {
  it('interroge le relais puis sert le cache 15 min', async () => {
    let now = 0;
    const fetchFn = vi.fn(async (_url: string) => ok());
    const real = createRealWeather({ fetch: fetchFn, now: () => now, storage: memory() });
    expect((await real.refresh(paris))?.code).toBe(61);
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain('/weather?lat=48.9&lon=2.4');
    now += 14 * 60_000;
    await real.refresh(paris);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now += 2 * 60_000;
    await real.refresh(paris);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('un seul appel en vol', async () => {
    const fetchFn = vi.fn(async (_url: string) => ok());
    const real = createRealWeather({ fetch: fetchFn, now: () => 0, storage: memory() });
    await Promise.all([real.refresh(paris), real.refresh(paris), real.refresh(paris)]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('en cas d’échec : null, garde la dernière valeur, réessaie après 1 puis 2 puis 5 min', async () => {
    let now = 0;
    let fail = false;
    const fetchFn = vi.fn(async (_url: string) => (fail ? new Response('{"ok":false}', { status: 502 }) : ok()));
    const real = createRealWeather({ fetch: fetchFn, now: () => now, storage: memory() });
    await real.refresh(paris);
    now += 16 * 60_000;
    fail = true;
    expect((await real.refresh(paris))?.code).toBe(61);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    now += 30_000;
    await real.refresh(paris);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    now += 40_000;
    await real.refresh(paris);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    now += 90_000;
    await real.refresh(paris);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    now += 40_000;
    await real.refresh(paris);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });
  it('ne lève jamais (réseau coupé, JSON invalide) et ignore une réponse mal formée', async () => {
    const real = createRealWeather({ fetch: async () => { throw new Error('offline'); }, now: () => 0, storage: memory() });
    expect(await real.refresh(paris)).toBeNull();
    const junk = createRealWeather({ fetch: async () => new Response('pas du json', { status: 200 }), now: () => 0, storage: memory() });
    expect(await junk.refresh(paris)).toBeNull();
    const partial = createRealWeather({ fetch: async () => new Response('{"ok":true,"code":"x"}', { status: 200 }), now: () => 0, storage: memory() });
    expect(await partial.refresh(paris)).toBeNull();
  });
  it('relit le cache mémorisé au démarrage', async () => {
    const storage = memory();
    const first = createRealWeather({ fetch: async () => ok(), now: () => 0, storage });
    await first.refresh(paris);
    const second = createRealWeather({ fetch: async () => { throw new Error('offline'); }, now: () => 60_000, storage });
    expect(second.latest()?.code).toBe(61);
  });
});
```

- [ ] **Step 6: Implémenter le client et la traduction**

```ts
// src/core/library/weather/weather-real.ts
import { RELAY_BASE } from '../../documentary/config';
import type { Weather } from './weather-types';

export const WEATHER_RELAY = `${RELAY_BASE}/weather`;

export type RealObservation = { code: number; tempC: number; cloud: number; precipMm: number; windKmh: number; visibilityM: number };

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const between = (n: number, lo: number, hi: number): boolean => n >= lo && n <= hi;

// Code météo WMO d'Open-Meteo → mêmes valeurs continues que la météo simulée.
export function realToWeather(obs: RealObservation): Weather {
  const thunder = obs.code >= 95;
  const snowy = between(obs.code, 71, 77) || obs.code === 85 || obs.code === 86;
  const drizzly = between(obs.code, 51, 57);
  const rainy = between(obs.code, 61, 67) || between(obs.code, 80, 82) || thunder;
  const foggy = obs.code === 45 || obs.code === 48;
  const byCode = thunder ? 0.9 : snowy ? 0.5 : rainy ? (obs.code === 65 || obs.code === 82 ? 0.85 : 0.6) : drizzly ? 0.25 : 0;
  const precip = clamp01(Math.max(byCode, byCode > 0 ? clamp01(obs.precipMm / 4) : 0));
  const kind: Weather['kind'] = snowy ? 'snow' : 'rain';
  const wetting = !snowy && (rainy || drizzly);
  return {
    cloud: clamp01(Math.max(obs.cloud / 100, precip > 0 ? 0.8 : 0)),
    precip,
    kind,
    fog: foggy ? 0.85 : clamp01(((10000 - obs.visibilityM) / 10000) * 0.6),
    wind: clamp01(obs.windKmh / 50),
    lightning: thunder ? 1 : 0,
    wet: wetting ? clamp01(precip * 1.4 + 0.2) : 0,
    snowCover: snowy ? clamp01(precip * 1.6 + 0.2) : 0,
  };
}

type Deps = {
  fetch: (url: string) => Promise<Response>;
  now: () => number;
  storage: { get(key: string): string | null; set(key: string, value: string): void };
};
type Pos = { lat: number; lon: number };

const KEY = 'wmt:weather-real';
const FRESH_MS = 15 * 60_000;
const BACKOFF_MS = [60_000, 120_000, 300_000];
const cell = (p: Pos): string => `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
const round1 = (v: number): number => Math.round(v * 10) / 10;

function parseObservation(raw: unknown): RealObservation | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.ok !== true || typeof r.code !== 'number' || typeof r.temp !== 'number') return null;
  const n = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return { code: r.code, tempC: r.temp, cloud: n(r.cloud, 0), precipMm: n(r.precip, 0), windKmh: n(r.wind, 0), visibilityM: n(r.visibility, 20000) };
}

// Lit la vraie météo par le relais, avec cache de 15 min, un seul appel à la fois et réessais espacés. Ne lève jamais.
export function createRealWeather(deps: Deps): { latest(): RealObservation | null; refresh(pos: Pos): Promise<RealObservation | null> } {
  let saved: { at: number; cell: string; obs: RealObservation } | null = null;
  try {
    const text = deps.storage.get(KEY);
    if (text) {
      const parsed = JSON.parse(text) as { at?: unknown; cell?: unknown; obs?: unknown };
      const obs = parseObservation({ ok: true, ...(parsed.obs as object), code: (parsed.obs as { code?: unknown })?.code });
      if (typeof parsed.at === 'number' && typeof parsed.cell === 'string' && obs) saved = { at: parsed.at, cell: parsed.cell, obs };
    }
  } catch {
    // Cache illisible : on repart de zéro.
  }
  let failures = 0;
  let retryAt = 0;
  let inFlight: Promise<RealObservation | null> | null = null;

  const fetchOnce = async (pos: Pos): Promise<RealObservation | null> => {
    try {
      const response = await deps.fetch(`${WEATHER_RELAY}?lat=${round1(pos.lat).toFixed(1)}&lon=${round1(pos.lon).toFixed(1)}`);
      if (!response.ok) throw new Error('status');
      const obs = parseObservation(await response.json());
      if (!obs) throw new Error('shape');
      failures = 0;
      saved = { at: deps.now(), cell: cell({ lat: round1(pos.lat), lon: round1(pos.lon) }), obs };
      try {
        deps.storage.set(KEY, JSON.stringify({ at: saved.at, cell: saved.cell, obs: { ok: true, code: obs.code, temp: obs.tempC, cloud: obs.cloud, precip: obs.precipMm, wind: obs.windKmh, visibility: obs.visibilityM } }));
      } catch {
        // Stockage plein ou refusé : le cache mémoire suffit.
      }
      return obs;
    } catch {
      retryAt = deps.now() + BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)]!;
      failures++;
      return saved?.obs ?? null;
    } finally {
      inFlight = null;
    }
  };

  return {
    latest: () => saved?.obs ?? null,
    refresh(pos) {
      const here = cell({ lat: round1(pos.lat), lon: round1(pos.lon) });
      if (saved && saved.cell === here && deps.now() - saved.at < FRESH_MS) return Promise.resolve(saved.obs);
      if (deps.now() < retryAt) return Promise.resolve(saved?.obs ?? null);
      inFlight ??= fetchOnce(pos);
      return inFlight;
    },
  };
}
```

Note : le format de stockage du cache réutilise la forme de la réponse du relais (`ok`, `code`, `temp`…) pour passer par `parseObservation` ; si le test « relit le cache » échoue, simplifier en stockant directement `RealObservation` et en validant ses champs à la lecture.

- [ ] **Step 7: Lancer les tests**

Run: `npx vitest run tests/core/library/weather-real.test.ts tests/relay --maxWorkers=4`
Expected: PASS. Ajouter `export * from './weather-real';` à `index.ts` si absent.

- [ ] **Step 8: Documenter la route**

Dans `relay/README.md`, ajouter à la liste des routes : `/weather?lat&lon` (météo actuelle Open-Meteo, coordonnées arrondies à 0,1°, cache 10 min, sans secret ; limite 60 appels par minute et par adresse). Le relais se redéploie par Workers Builds à la fusion sur `main` (voir « Réglages Cloudflare » du même fichier).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(bibliotheque): météo réelle (Open-Meteo via le relais, cache et repli)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Hook `useWeather` et position connue

**Files:**
- Modify: `src/content/scene-position.ts` (ajouter `isPositionKnown`)
- Create: `src/content/use-weather.ts`
- Test: `tests/content/use-weather.test.tsx`, compléter `tests/content/scene-position.test.ts`

**Interfaces:**
- Consumes: `WeatherSetting` (Task 1) ; `createWeatherClock`, `steadySource`, `weatherAtRandom`, `WEATHER_SEED`, `weatherFlags`, `nearestState`, `WEATHER_LABEL`, `realToWeather`, `createRealWeather`, `Weather` (Tasks 2-5) ; `currentPosition`, `subscribePosition` (`scene-position.ts`).
- Produces:
  - `isPositionKnown(): boolean` (vrai seulement après une géolocalisation accordée)
  - `type WeatherView = { clock: { read(nowMs: number): Weather }; flags: WeatherFlags; label: string; real: 'ok' | 'fallback' | null; tempC: number | null }`
  - `useWeather(setting: WeatherSetting): WeatherView` — `label` : libellé français de l'état le plus proche, relu toutes les 5 s ; `real` : `null` hors mode réel, `'ok'` si une observation est utilisée, `'fallback'` sinon (position inconnue ou réseau en panne) ; `tempC` : température de l'observation (mode réel) sinon `null`.

- [ ] **Step 1: Test de `isPositionKnown`**

Dans `tests/content/scene-position.test.ts`, lire le fichier pour reprendre son mécanisme de simulation de `navigator.geolocation`, puis ajouter :

```ts
it('isPositionKnown est faux au départ et vrai après une géolocalisation accordée', async () => {
  resetPositionForTests();
  expect(isPositionKnown()).toBe(false);
  // …simuler une géolocalisation accordée comme dans les tests voisins, puis :
  await requestPosition();
  expect(isPositionKnown()).toBe(true);
});
```
Run: `npx vitest run tests/content/scene-position.test.ts` → FAIL (export absent).

- [ ] **Step 2: Implémenter `isPositionKnown`**

Dans `scene-position.ts`, après `currentPosition` :

```ts
// Vrai seulement si l'appareil a donné sa vraie position (le repli par fuseau ne suffit pas à interroger la météo réelle).
export function isPositionKnown(): boolean {
  return known !== null;
}
```
Run le test → PASS.

- [ ] **Step 3: Écrire le test du hook**

```tsx
// @vitest-environment jsdom
// tests/content/use-weather.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWeather, type WeatherView } from '../../src/content/use-weather';
import type { WeatherSetting } from '../../src/core/library/library-types';
import { targetOf } from '../../src/core/library/weather/weather-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let last: WeatherView | null = null;

function Probe({ setting }: { setting: WeatherSetting }) {
  last = useWeather(setting);
  return null;
}
const render = (setting: WeatherSetting): void => act(() => root.render(<Probe setting={setting} />));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 21, 14, 0));
  container = document.createElement('div');
  root = createRoot(container);
  last = null;
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe('useWeather', () => {
  it('forcé : la météo choisie, son libellé et ses drapeaux', () => {
    render({ mode: 'forced', state: 'storm' });
    act(() => vi.advanceTimersByTime(40_000));
    expect(last?.label).toBe('Orage');
    expect(last?.clock.read(Date.now()).lightning).toBe(1);
    expect(last?.flags).toEqual({ gloom: true, rainy: true });
    expect(last?.real).toBeNull();
  });
  it('aléatoire : valeurs bornées et déterministes à un instant donné', () => {
    render({ mode: 'random' });
    const a = last!.clock.read(Date.now());
    const b = last!.clock.read(Date.now());
    expect(a).toEqual(b);
    expect(a.cloud).toBeGreaterThanOrEqual(0);
    expect(last?.real).toBeNull();
  });
  it('réelle sans position connue : repli sur l’aléatoire, signalé', () => {
    render({ mode: 'real' });
    expect(last?.real).toBe('fallback');
    expect(last?.tempC).toBeNull();
  });
  it('un changement de réglage fond la météo au lieu de la basculer', () => {
    render({ mode: 'forced', state: 'sun' });
    act(() => vi.advanceTimersByTime(40_000));
    render({ mode: 'forced', state: 'storm' });
    const now = Date.now();
    const start = last!.clock.read(now);
    expect(start.cloud).toBeCloseTo(targetOf('sun').cloud, 1);
    act(() => vi.advanceTimersByTime(15_000));
    const mid = last!.clock.read(Date.now());
    expect(mid.cloud).toBeGreaterThan(start.cloud);
    expect(mid.cloud).toBeLessThan(1);
  });
});
```

Run: `npx vitest run tests/content/use-weather.test.tsx` → FAIL (module absent).

- [ ] **Step 4: Implémenter le hook**

```ts
// src/content/use-weather.ts
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { WeatherSetting } from '../core/library/library-types';
import { WEATHER_SEED, weatherAtRandom } from '../core/library/weather/weather-plan';
import { createWeatherClock, steadySource, weatherFlags, type WeatherFlags, type WeatherSource } from '../core/library/weather/weather-clock';
import { createRealWeather, realToWeather, type RealObservation } from '../core/library/weather/weather-real';
import { WEATHER_LABEL, nearestState, type Weather } from '../core/library/weather/weather-types';
import { currentPosition, isPositionKnown, subscribePosition } from './scene-position';

export type WeatherView = { clock: { read(nowMs: number): Weather }; flags: WeatherFlags; label: string; real: 'ok' | 'fallback' | null; tempC: number | null };

const OFF: WeatherFlags = { gloom: false, rainy: false };
const REAL_POLL_MS = 60_000;

const storage = {
  get: (key: string): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string): void => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Stockage indisponible (fenêtre privée, page de test) : le cache mémoire suffit.
    }
  },
};

// Une seule horloge par vue : change de source (réglage) en fondu. Les valeurs sont relues à la demande par le dessin (`clock.read`),
// le hook ne re-rend que pour le libellé (toutes les 5 s) et les deux drapeaux du décor fixe.
export function useWeather(setting: WeatherSetting): WeatherView {
  const clock = useMemo(() => createWeatherClock(), []);
  const real = useMemo(() => createRealWeather({ fetch: (url) => fetch(url), now: () => Date.now(), storage }), []);
  const [observation, setObservation] = useState<RealObservation | null>(() => real.latest());
  const position = useSyncExternalStore(subscribePosition, () => currentPosition(), () => currentPosition());
  const known = isPositionKnown();
  const flagsRef = useRef<WeatherFlags>(OFF);
  const [flags, setFlags] = useState<WeatherFlags>(OFF);
  const [label, setLabel] = useState('');

  const mode = setting.mode;
  const forcedState = setting.mode === 'forced' ? setting.state : null;
  const useObservation = mode === 'real' && known && observation !== null;
  const lat = position.lat;
  const lon = position.lon;

  // Position connue + mode réel : on interroge le relais (cache 15 min côté client) puis toutes les minutes.
  useEffect(() => {
    if (mode !== 'real' || !known) return;
    let alive = true;
    const poll = (): void => void real.refresh({ lat, lon }).then((obs) => alive && setObservation(obs));
    poll();
    const timer = window.setInterval(poll, REAL_POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [mode, known, lat, lon, real]);

  const code = observation?.code;
  useEffect(() => {
    let source: WeatherSource;
    if (forcedState) source = steadySource(forcedState);
    else if (useObservation && observation) {
      const w = realToWeather(observation);
      source = () => w;
    } else source = (now) => weatherAtRandom({ seed: WEATHER_SEED, lat }, now);
    clock.setSource(source, Date.now());
    // L'observation entre par son code et sa position : la même lecture ne relance pas le fondu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, forcedState, useObservation, code, lat]);

  // Libellé et drapeaux relus à intervalle : le dessin, lui, lit l'horloge à chaque image sans passer par React.
  useEffect(() => {
    const sync = (): void => {
      const w = clock.read(Date.now());
      const next = weatherFlags(w, flagsRef.current);
      if (next.gloom !== flagsRef.current.gloom || next.rainy !== flagsRef.current.rainy) {
        flagsRef.current = next;
        setFlags(next);
      }
      setLabel(WEATHER_LABEL[nearestState(w)]);
    };
    sync();
    const timer = window.setInterval(sync, 5000);
    return () => window.clearInterval(timer);
  }, [clock, forcedState, useObservation, code]);

  return {
    clock,
    flags,
    label,
    real: mode === 'real' ? (useObservation ? 'ok' : 'fallback') : null,
    tempC: useObservation && observation ? observation.tempC : null,
  };
}
```

Run: `npx vitest run tests/content/use-weather.test.tsx tests/content/scene-position.test.ts` → PASS. Si le libellé n'est pas à jour juste après `render`, appeler `act(() => vi.advanceTimersByTime(0))` dans le test (les effets s'exécutent à `act`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(bibliotheque): hook useWeather (source, fondu, drapeaux, libellé)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Dessin de la météo dans les fenêtres

**Files:**
- Create: `src/content/scene-weather.tsx`
- Modify: `src/content/RoomView.tsx` (prop `sceneView`, `<defs>`), `src/content/window-art.tsx`, `src/content/LibraryPanel.tsx` (passer `weather` à `sceneView` — l'UI du panneau vient en tâche 8), `src/content/scene-panorama.tsx`, `src/content/scene-city.tsx`, `src/content/scene-nature.tsx`, `src/content/scene-sprites.tsx`
- Test: `tests/content/scene-weather.test.tsx`, compléter `tests/content/room-window.test.tsx`

**Interfaces:**
- Consumes: `WeatherView` (Task 6), `lightningAt`, `rainbowOf` (Task 4), `mulberry32` ; `Sky` ; `SceneId`.
- Produces:
  - `WEATHER_SCENES: readonly SceneId[] = ['city', 'countryside', 'mountain', 'sea']`
  - `<WeatherLayer scene width height seed sky clock />` : groupe `data-weather` ; éléments `data-wx="dark|fog|rain-far|rain-near|snow-far|snow-near|puddles|snow-cover|flash|bolt|rainbow"` mis à jour par la boucle.
  - `RoomView` : `sceneView?: { sky; minutes; weather?: { clock; flags } }`.
  - `WindowArt` : nouvelle prop `weatherHref?: string` ; `<use data-window-weather>` après les acteurs ; gouttes sur la vitre `data-glass-drop` dont l'opacité suit la variable CSS `--wmt-precip` posée sur le `<svg>` racine par la boucle.
  - `SceneBodyProps` gagne `gloom?: boolean; rainy?: boolean` : sous ciel sombre les fenêtres d'immeuble/fermes/refuge s'allument (seuil `u < 0.55`) et `dim` ≥ 0.7 ; les passants (`walker`) ouvrent un parapluie quand `rainy`.

- [ ] **Step 1: Écrire le test de `WeatherLayer`**

```tsx
// @vitest-environment jsdom
// tests/content/scene-weather.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WEATHER_SCENES, WeatherLayer } from '../../src/content/scene-weather';
import { createWeatherClock, steadySource } from '../../src/core/library/weather/weather-clock';
import type { Sky } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SKY: Sky = { phase: 'day', daylight: 1, twilight: 0, sunFrac: 0.5, moonFrac: null, stars: 0, top: '#6FB1E8', bottom: '#BFE0F5' };
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 21, 14, 0));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const mount = (state: Parameters<typeof steadySource>[0], scene = 'city' as const): void => {
  const clock = createWeatherClock();
  clock.setSource(steadySource(state), Date.now());
  act(() =>
    root.render(
      <svg>
        <WeatherLayer scene={scene} width={720} height={216} seed={1} sky={SKY} clock={clock} />
      </svg>,
    ),
  );
};
const wx = (name: string): Element | null => container.querySelector(`[data-wx="${name}"]`);
const opacity = (name: string): number => Number(wx(name)?.getAttribute('opacity') ?? 'NaN');

describe('WeatherLayer', () => {
  it('quatre scènes terrestres', () => {
    expect(WEATHER_SCENES).toEqual(['city', 'countryside', 'mountain', 'sea']);
  });
  it('pluie : gouttes visibles, sol mouillé, ciel assombri, pas de flocons', () => {
    mount('rain');
    expect(opacity('rain-near')).toBeGreaterThan(0.3);
    expect(opacity('snow-near')).toBe(0);
    expect(opacity('puddles')).toBeGreaterThan(0.5);
    expect(opacity('dark')).toBeGreaterThan(0.2);
    expect(opacity('snow-cover')).toBe(0);
  });
  it('neige : flocons et sol blanc, pas de gouttes', () => {
    mount('snow');
    expect(opacity('snow-near')).toBeGreaterThan(0.2);
    expect(opacity('rain-near')).toBe(0);
    expect(opacity('snow-cover')).toBeGreaterThan(0.5);
  });
  it('soleil : tout est éteint', () => {
    mount('sun');
    for (const name of ['rain-far', 'rain-near', 'snow-far', 'snow-near', 'puddles', 'snow-cover', 'fog']) expect(opacity(name)).toBe(0);
    expect(opacity('dark')).toBeLessThan(0.05);
  });
  it('brume : voile', () => {
    mount('fog');
    expect(opacity('fog')).toBeGreaterThan(0.4);
  });
  it('met à jour sans re-rendu quand le temps passe (la boucle lit l’horloge)', () => {
    const clock = createWeatherClock();
    clock.setSource(steadySource('sun'), Date.now());
    act(() => root.render(<svg><WeatherLayer scene="city" width={720} height={216} seed={1} sky={SKY} clock={clock} /></svg>));
    expect(opacity('rain-near')).toBe(0);
    clock.setSource(steadySource('rain'), Date.now());
    act(() => vi.advanceTimersByTime(40_000));
    expect(opacity('rain-near')).toBeGreaterThan(0.3);
  });
  it('mouvement réduit : affiché mais figé (pas de boucle)', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
    mount('rain');
    expect(opacity('rain-near')).toBeGreaterThan(0.3);
    expect(raf).not.toHaveBeenCalled();
  });
  it('plafonne les éléments : motifs, pas un nœud par goutte', () => {
    mount('storm');
    expect(container.querySelectorAll('*').length).toBeLessThan(120);
  });
});
```

Note : `vi.useFakeTimers()` fige aussi `requestAnimationFrame` ; avancer les minuteurs le déclenche (jsdom + fake timers installent `requestAnimationFrame`). Si la boucle ne tourne pas dans le test, ajouter `vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })`.

Run: `npx vitest run tests/content/scene-weather.test.tsx` → FAIL (module absent).

- [ ] **Step 2: Implémenter `scene-weather.tsx`**

```tsx
// src/content/scene-weather.tsx
import { useEffect, useId, useMemo, useRef, type ReactElement, type RefObject } from 'react';
import type { SceneId } from '../core/library/library-types';
import { mulberry32 } from '../core/library/scene-world';
import type { Sky } from '../core/library/sky';
import { lightningAt, rainbowOf } from '../core/library/weather/weather-clock';
import type { Weather } from '../core/library/weather/weather-types';

export const WEATHER_SCENES: readonly SceneId[] = ['city', 'countryside', 'mountain', 'sea'];

type Props = { scene: SceneId; width: number; height: number; seed: number; sky: Sky; clock: { read(nowMs: number): Weather } };

const FRAME_MS = 30;
const TILE = 80;
// Hauteur du sol (fraction de la hauteur de la fenêtre) où se posent flaques et neige.
const GROUND: Record<string, number> = { city: 0.78, countryside: 0.8, mountain: 0.86, sea: 0.62 };

// Un motif de stries (pluie) ou de points (neige) ; la boucle ne fait que le translater et l'incliner.
function PatternDefs({ id, seed }: { id: string; seed: number }): ReactElement {
  const rng = useMemo(() => mulberry32(seed ^ 0x77ea), [seed]);
  const marks = useMemo(() => Array.from({ length: 14 }, () => ({ x: rng() * TILE, y: rng() * TILE, l: 8 + rng() * 10 })), [rng]);
  const flakes = useMemo(() => Array.from({ length: 12 }, () => ({ x: rng() * TILE, y: rng() * TILE, r: 0.8 + rng() * 1.4 })), [rng]);
  return (
    <defs>
      <pattern id={`${id}-rain-far`} data-wx-pattern="rain-far" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
        {marks.slice(0, 9).map((m, i) => <line key={i} x1={m.x} y1={m.y} x2={m.x} y2={m.y + m.l * 0.7} stroke="#DCE6F2" strokeWidth={0.8} />)}
      </pattern>
      <pattern id={`${id}-rain-near`} data-wx-pattern="rain-near" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
        {marks.map((m, i) => <line key={i} x1={m.x} y1={m.y} x2={m.x} y2={m.y + m.l * 1.4} stroke="#EEF4FB" strokeWidth={1.4} />)}
      </pattern>
      <pattern id={`${id}-snow-far`} data-wx-pattern="snow-far" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
        {flakes.slice(0, 8).map((f, i) => <circle key={i} cx={f.x} cy={f.y} r={f.r * 0.7} fill="#FFFFFF" />)}
      </pattern>
      <pattern id={`${id}-snow-near`} data-wx-pattern="snow-near" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
        {flakes.map((f, i) => <circle key={i} cx={f.x} cy={f.y} r={f.r * 1.5} fill="#FFFFFF" />)}
      </pattern>
    </defs>
  );
}

// Met la météo à l'écran sans re-rendu React : même horloge murale pour toutes les fenêtres, même règle d'économie que les acteurs.
function useWeatherLoop(root: RefObject<SVGGElement | null>, clock: Props['clock'], seed: number, daylight: number, width: number, height: number): void {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = (name: string): SVGElement | null => el.querySelector<SVGElement>(`[data-wx="${name}"]`);
    const pat = (name: string): SVGElement | null => el.querySelector<SVGElement>(`[data-wx-pattern="${name}"]`);
    const nodes = {
      dark: q('dark'), fog: q('fog'), rainFar: q('rain-far'), rainNear: q('rain-near'), snowFar: q('snow-far'), snowNear: q('snow-near'),
      puddles: q('puddles'), snowCover: q('snow-cover'), flash: q('flash'), bolt: q('bolt'), rainbow: q('rainbow'),
    };
    const patterns = { rainFar: pat('rain-far'), rainNear: pat('rain-near'), snowFar: pat('snow-far'), snowNear: pat('snow-near') };
    const set = (node: SVGElement | null, value: number): void => node?.setAttribute('opacity', value.toFixed(3));
    const place = (): void => {
      const now = Date.now();
      const t = now / 1000;
      const w = clock.read(now);
      const rain = w.kind === 'rain' ? w.precip : 0;
      const snow = w.kind === 'snow' ? w.precip : 0;
      const lean = -12 - w.wind * 22; // inclinaison des gouttes
      set(nodes.dark, Math.max(0, (w.cloud - 0.3) / 0.7) * 0.5 * (0.5 + 0.5 * daylight));
      set(nodes.fog, w.fog * 0.8);
      set(nodes.rainFar, rain * 0.7);
      set(nodes.rainNear, rain);
      set(nodes.snowFar, snow * 0.8);
      set(nodes.snowNear, snow);
      set(nodes.puddles, w.wet);
      set(nodes.snowCover, w.snowCover);
      set(nodes.rainbow, rainbowOf(w, daylight));
      patterns.rainFar?.setAttribute('patternTransform', `rotate(${(lean * 0.6).toFixed(1)}) translate(0 ${((t * 220) % TILE).toFixed(1)})`);
      patterns.rainNear?.setAttribute('patternTransform', `rotate(${lean.toFixed(1)}) translate(0 ${((t * 420) % TILE).toFixed(1)})`);
      patterns.snowFar?.setAttribute('patternTransform', `translate(${(Math.sin(t * 0.6) * 12 + t * 8 * (w.wind + 0.2)).toFixed(1)} ${((t * 18) % TILE).toFixed(1)})`);
      patterns.snowNear?.setAttribute('patternTransform', `translate(${(Math.sin(t * 0.8) * 18 + t * 14 * (w.wind + 0.2)).toFixed(1)} ${((t * 34) % TILE).toFixed(1)})`);
      const flash = lightningAt(w, now, seed);
      set(nodes.flash, flash ? flash.strength * 0.55 : 0);
      if (nodes.bolt) {
        if (flash) {
          const x = flash.x * width;
          nodes.bolt.setAttribute('d', `M${x.toFixed(0)} 0 L${(x - 10).toFixed(0)} ${(height * 0.22).toFixed(0)} L${(x + 4).toFixed(0)} ${(height * 0.22).toFixed(0)} L${(x - 14).toFixed(0)} ${(height * 0.5).toFixed(0)}`);
          set(nodes.bolt, flash.strength);
        } else set(nodes.bolt, 0);
      }
      // Les gouttes sur la vitre (dans WindowArt) lisent cette variable sur le <svg> de la pièce.
      el.ownerSVGElement?.style.setProperty('--wmt-precip', rain.toFixed(3));
    };
    place();
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number): void => {
      frame = window.requestAnimationFrame(tick);
      if (document.visibilityState === 'hidden' || now - last < FRAME_MS) return;
      last = now;
      place();
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [root, clock, seed, daylight, width, height]);
}

export function WeatherLayer({ scene, width, height, seed, sky, clock }: Props): ReactElement {
  const id = useId().replace(/:/g, '');
  const root = useRef<SVGGElement | null>(null);
  useWeatherLoop(root, clock, seed, sky.daylight, width, height);
  const ground = height * (GROUND[scene] ?? 0.8);
  const puddles = useMemo(() => {
    const rng = mulberry32(seed ^ 0x9d1e);
    return Array.from({ length: Math.max(1, Math.round(width / 70)) }, () => ({ x: rng() * width, y: ground + 4 + rng() * (height - ground - 8), rx: 12 + rng() * 22 }));
  }, [seed, width, height, ground]);
  const arc = width * 0.28;
  return (
    <g data-weather="" data-scene={scene} ref={root}>
      <PatternDefs id={id} seed={seed} />
      <defs>
        <linearGradient id={`${id}-fog`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E7ECF1" stopOpacity={0.35} />
          <stop offset="1" stopColor="#E7ECF1" stopOpacity={0.95} />
        </linearGradient>
      </defs>
      <rect data-wx="dark" x={0} y={0} width={width} height={height} fill="#1B2233" opacity={0} />
      <path data-wx="rainbow" d={`M${width * 0.5 - arc} ${ground} A${arc} ${arc} 0 0 1 ${width * 0.5 + arc} ${ground}`} fill="none" stroke="#FF9AA2" strokeWidth={6} opacity={0} strokeOpacity={0.55} />
      <g data-wx="puddles" opacity={0}>
        {puddles.map((p, i) => <ellipse key={i} cx={p.x} cy={p.y} rx={p.rx} ry={p.rx * 0.18} fill="#9FB4C8" opacity={0.6} />)}
      </g>
      <rect data-wx="snow-cover" x={0} y={ground} width={width} height={height - ground} fill="#F4F8FC" opacity={0} />
      <rect data-wx="fog" x={0} y={height * 0.3} width={width} height={height * 0.7} fill={`url(#${id}-fog)`} opacity={0} />
      <rect data-wx="rain-far" x={0} y={0} width={width} height={height} fill={`url(#${id}-rain-far)`} opacity={0} />
      <rect data-wx="snow-far" x={0} y={0} width={width} height={height} fill={`url(#${id}-snow-far)`} opacity={0} />
      <rect data-wx="rain-near" x={0} y={0} width={width} height={height} fill={`url(#${id}-rain-near)`} opacity={0} />
      <rect data-wx="snow-near" x={0} y={0} width={width} height={height} fill={`url(#${id}-snow-near)`} opacity={0} />
      <path data-wx="bolt" d="M0 0" fill="none" stroke="#FFFFFF" strokeWidth={2.5} opacity={0} />
      <rect data-wx="flash" x={0} y={0} width={width} height={height} fill="#F4F6FF" opacity={0} />
    </g>
  );
}
```
Mettre à jour la liste de `<pattern>` si l'arc-en-ciel mérite plusieurs bandes : une seule bande suffit à la première version (à enrichir à la vérification manuelle).

- [ ] **Step 3: Lancer le test du calque**

Run: `npx vitest run tests/content/scene-weather.test.tsx` → PASS. Corriger les seuils d'opacité du test uniquement si l'écart vient d'un choix de valeur raisonnable (jamais en affaiblissant ce que le test vérifie).

- [ ] **Step 4: Brancher dans `RoomView` et `WindowArt`**

`RoomView.tsx` : étendre `sceneView?: { sky: Sky; minutes: number; weather?: { clock: { read(nowMs: number): Weather }; flags: { gloom: boolean; rainy: boolean } } }` (importer `WeatherLayer`, `WEATHER_SCENES`, type `Weather`). Dans `<defs>` après le groupe des acteurs :

```tsx
{view.weather && WEATHER_SCENES.includes(room.scene) && (
  <g id={`${worldId}-weather`}>
    <WeatherLayer scene={room.scene} width={width} height={wallH} seed={hashString(room.id)} sky={view.sky} clock={view.weather.clock} />
  </g>
)}
```
et passer à `ScenePanoramaStatic` / `SceneActors` : `gloom={view.weather?.flags.gloom ?? false} rainy={view.weather?.flags.rainy ?? false}` (uniquement si la scène est terrestre, sinon `false`). Passer à chaque `<WindowArt>` la nouvelle prop `weatherHref={view.weather && WEATHER_SCENES.includes(room.scene) ? `#${worldId}-weather` : undefined}` : lire le code d'appel existant de `WindowArt` (`worldHref`, `actorsHref`) pour ajouter la même construction.

`window-art.tsx` : prop `weatherHref?: string`. Après `<use data-window-actors …/>` :

```tsx
{weatherHref && <use data-window-weather="" href={weatherHref} />}
```
et, dans le `<g clipPath>` aussi, les gouttes sur la vitre :

```tsx
{weatherHref && <GlassDrops glass={glass} />}
```
avec, dans le même fichier :

```tsx
// Quelques gouttes qui glissent sur la vitre ; leur opacité suit `--wmt-precip` (posée sur le <svg> par la boucle de météo).
function GlassDrops({ glass }: { glass: PxRect }): ReactElement {
  const drops = Array.from({ length: Math.max(3, Math.round(glass.w / 55)) }, (_, i) => {
    const rng = mulberry32(i * 7919 + Math.round(glass.x));
    return { x: glass.x + 6 + rng() * (glass.w - 12), y: glass.y + rng() * glass.h * 0.5, len: 8 + rng() * 14, dur: 5 + rng() * 6, begin: rng() * 4 };
  });
  const still = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <g data-glass-drops="" style={{ opacity: 'clamp(0, calc((var(--wmt-precip, 0) - 0.12) * 3), 1)' as unknown as number }}>
      {drops.map((d, i) => (
        <ellipse key={i} data-glass-drop="" cx={d.x} cy={d.y} rx={1.6} ry={2.6} fill="#FFFFFF" opacity={0.55}>
          {!still && <animate attributeName="cy" values={`${d.y};${d.y + d.len * 3}`} dur={`${d.dur}s`} begin={`${d.begin}s`} repeatCount="indefinite" />}
        </ellipse>
      ))}
    </g>
  );
}
```
(importer `mulberry32` de `../core/library/scene-world`). La valeur `opacity` en CSS `clamp(…calc…)` n'est pas typée : utiliser `style={{ opacity: '…' }}` avec un cast ou un objet `CSSProperties`.

- [ ] **Step 5: Lumières sous ciel sombre et parapluies**

`SceneBodyProps` (dans `scene-panorama.tsx`) : ajouter `gloom?: boolean; rainy?: boolean`. Transmettre aux trois endroits (`props`, `SceneActorsView`). Dans `scene-city.tsx` : `const dim = Math.max(1 - sky.daylight, gloom ? 0.7 : 0);` et `const lit = lampLit(lamp.u, minutes) || (gloom === true && lamp.u < 0.55);`. Dans `scene-nature.tsx` : faire la même chose à la ligne `const lit = lampLit(u, minutes)` du composant de lumière (lire le fichier : il peut avoir sa propre notion de `dim`/`opacity`, adapter sans changer le rendu hors météo). Dans `scene-sprites.tsx` : `ActorSprite` reçoit `rainy?: boolean` ; pour `walker`, ajouter un parapluie quand `rainy` :

```tsx
{rainy && (
  <g data-umbrella="">
    <path d="M-9 -22 Q0 -34 9 -22 Z" fill="#C0392B" />
    <line x1={0} y1={-22} x2={0} y2={-4} stroke="#4A3B2A" strokeWidth={1} />
  </g>
)}
```
(décaler y selon la taille réelle du sprite `walker` : lire sa définition). `SceneActorsView` passe `rainy` à `ActorSprite`.

Ajouter dans `tests/content/scene-panorama.test.tsx` deux tests : (1) `gloom` allume au moins une fenêtre d'immeuble en plein jour (`[data-lamp][data-lit="true"]` existe, alors qu'il n'y en a pas sans `gloom` à midi) ; (2) `rainy` ajoute `[data-umbrella]` aux passants actifs, et rien sans `rainy`. Dans `tests/content/room-window.test.tsx` : (3) avec `sceneView.weather`, chaque fenêtre contient `[data-window-weather]` et `[data-glass-drops]` ; sans `weather` ou en scène `space`, ni l'un ni l'autre.

- [ ] **Step 6: Passer la météo du panneau à la vue**

Dans `LibraryPanel.tsx` : importer `useWeather`, appeler `const weather = useWeather(lib?.weather ?? { mode: 'random' });` à côté de `useSceneTime`, et à la ligne `sceneView={{ sky: sceneTime.sky, minutes: sceneTime.minutes }}` ajouter `weather: { clock: weather.clock, flags: weather.flags }` (mémoïser l'objet avec `useMemo([weather.clock, weather.flags])` pour garder `view` stable dans `RoomView`).

- [ ] **Step 7: Lancer la suite de contenu**

Run: `npx vitest run tests/content --maxWorkers=4` puis `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(bibliotheque): dessin de la météo dans les fenêtres (pluie, neige, brume, éclairs, flaques, arc-en-ciel)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Rangée Météo du panneau « Ciel »

**Files:**
- Modify: `src/content/LibraryPanel.tsx`
- Test: `tests/content/library-weather-ui.test.tsx`

**Interfaces:**
- Consumes: `setWeatherSetting` (Task 1), `useWeather` / `WeatherView` (Task 6), `WEATHER_STATES`, `WEATHER_LABEL`, `requestPosition`, `WEATHER_SCENES`.
- Produces: groupe `role="group" aria-label="Météo"` (mode Aménager, scène active terrestre) avec des boutons `data-weather-mode="random|real"` et `data-weather-state="<état>"` (`pressed` selon le réglage) ; légende `data-weather-label` ; `data-weather-note` quand `real === 'fallback'`.

- [ ] **Step 1: Écrire le test**

Lire `tests/content/library-panel.test.tsx` (ou `library-pets-ui.test.tsx`) pour copier EXACTEMENT sa mise en place (dépôt en mémoire, rendu de `LibraryPanel`, passage en Aménager, aide `click`) puis écrire :

```tsx
// tests/content/library-weather-ui.test.tsx  (squelette : reprendre le gabarit du test voisin pour le montage)
describe('rangée Météo', () => {
  it('apparaît en mode Aménager pour une scène terrestre, avec 2 modes et 7 états', async () => {
    // monter le panneau, passer en Aménager
    const row = container.querySelector('[role="group"][aria-label="Météo"]');
    expect(row).not.toBeNull();
    expect(row!.querySelectorAll('[data-weather-mode]')).toHaveLength(2);
    expect(row!.querySelectorAll('[data-weather-state]')).toHaveLength(7);
    expect(row!.querySelector('[data-weather-mode="random"]')?.getAttribute('aria-pressed')).toBe('true');
  });
  it('forcer un état l’enregistre et le marque pressé', async () => {
    // cliquer [data-weather-state="storm"]
    expect(savedState().weather).toEqual({ mode: 'forced', state: 'storm' });
    expect(container.querySelector('[data-weather-state="storm"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-weather-label]')?.textContent).toContain('Orage');
  });
  it('🎲 revient à l’aléatoire', async () => {
    // forcer puis cliquer [data-weather-mode="random"]
    expect(savedState().weather).toEqual({ mode: 'random' });
  });
  it('🌍 enregistre « réelle », demande la position et signale le repli sans position', async () => {
    // cliquer [data-weather-mode="real"] avec navigator.geolocation simulé refusé
    expect(savedState().weather).toEqual({ mode: 'real' });
    expect(container.querySelector('[data-weather-note]')?.textContent).toContain('simulée');
  });
  it('est masquée en scène Espace et Terre, et hors mode Aménager', async () => {
    // passer la scène à « space » : plus de groupe Météo ; mode Visiter : plus de groupe Météo
  });
});
```
Compléter les commentaires par le code de montage réel du test voisin (aucune étape ne doit rester en commentaire dans le fichier final). Run → FAIL.

- [ ] **Step 2: Implémenter la rangée**

Dans `ICONS` ajouter (tracés 24×24 en contour, à ajuster à l'œil dans Chrome) :

```ts
  dice: ['M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'M8.5 8.5h.01', 'M15.5 8.5h.01', 'M12 12h.01', 'M8.5 15.5h.01', 'M15.5 15.5h.01'],
  globe: ['M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z', 'M3 12h18', 'M12 3c3.5 3.2 3.5 14.8 0 18', 'M12 3c-3.5 3.2-3.5 14.8 0 18'],
  wxCloudy: ['M7 18a4 4 0 0 1 0-8a5.5 5.5 0 0 1 10.5 1.5a3.3 3.3 0 0 1-.5 6.5z'],
  wxDrizzle: ['M7 14a4 4 0 0 1 0-8a5.5 5.5 0 0 1 10.5 1.5a3.3 3.3 0 0 1-.5 6.5z', 'M9 18l-.7 1.6', 'M14 18l-.7 1.6'],
  wxRain: ['M7 14a4 4 0 0 1 0-8a5.5 5.5 0 0 1 10.5 1.5a3.3 3.3 0 0 1-.5 6.5z', 'M8 17l-1 3', 'M12 17l-1 3', 'M16 17l-1 3'],
  wxStorm: ['M7 13a4 4 0 0 1 0-8a5.5 5.5 0 0 1 10.5 1.5a3.3 3.3 0 0 1-.5 6.5z', 'M12.5 12l-3 5h4l-2 4'],
  wxSnow: ['M12 3v18', 'M4.2 7.5l15.6 9', 'M19.8 7.5l-15.6 9', 'M9.5 4.5L12 7l2.5-2.5', 'M9.5 19.5L12 17l2.5 2.5'],
  wxFog: ['M4 9h16', 'M6 13h12', 'M4 17h16'],
```
(Le soleil réutilise `ICONS.sun`, déjà défini.) Table : `const WEATHER_ICON: Record<WeatherState, string[]> = { sun: ICONS.sun, cloudy: ICONS.wxCloudy, drizzle: ICONS.wxDrizzle, rain: ICONS.wxRain, storm: ICONS.wxStorm, snow: ICONS.wxSnow, fog: ICONS.wxFog };`

Handler à côté de `chooseTime` :

```ts
  const chooseWeather = (next: WeatherSetting): void => {
    reset();
    // « Météo réelle » : le navigateur demande l'accord de position (sans accord, la météo reste simulée).
    if (next.mode === 'real') void requestPosition();
    void library.update((state) => setWeatherSetting(state, next));
  };
```

Rangée, juste après la rangée « Ciel » (même `editing &&`), seulement si `WEATHER_SCENES.includes(room.scene)` :

```tsx
      {editing && WEATHER_SCENES.includes(room.scene) && (
        <div className="wmt-lib-row" role="group" aria-label="Météo">
          <Btn label="Météo aléatoire" pressed={lib.weather.mode === 'random'} data={{ weatherMode: 'random' }} onClick={() => chooseWeather({ mode: 'random' })}>
            <Icon paths={ICONS.dice} />
          </Btn>
          <Btn label="Météo réelle" pressed={lib.weather.mode === 'real'} data={{ weatherMode: 'real' }} onClick={() => chooseWeather({ mode: 'real' })}>
            <Icon paths={ICONS.globe} />
          </Btn>
          <span className="wmt-lib-sep" />
          {WEATHER_STATES.map((state) => (
            <Btn key={state} label={WEATHER_LABEL[state]} pressed={lib.weather.mode === 'forced' && lib.weather.state === state} data={{ weatherState: state }} onClick={() => chooseWeather({ mode: 'forced', state })}>
              <Icon paths={WEATHER_ICON[state]} />
            </Btn>
          ))}
          <span className="wmt-lib-msg" data-weather-label="">
            {weather.label}
            {weather.tempC !== null ? ` · ${Math.round(weather.tempC)} °C` : ''}
          </span>
          {weather.real === 'fallback' && (
            <span className="wmt-lib-msg" data-weather-note="" title="Position inconnue ou réseau indisponible : la météo reste simulée.">
              (simulée)
            </span>
          )}
        </div>
      )}
```
Vérifier comment `Btn` traduit `data={{ weatherMode: … }}` en attributs (`data-weather-mode`) en lisant les usages existants (`data={{ time: mode }}` → `data-time`) ; la conversion camelCase → kebab-case doit déjà exister sinon utiliser des clés `'weather-mode'`.

- [ ] **Step 3: Lancer**

Run: `npx vitest run tests/content/library-weather-ui.test.tsx tests/content --maxWorkers=4` puis `npx tsc --noEmit` → PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(bibliotheque): rangée Météo du panneau Ciel (aléatoire, réelle, sept états forcés)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Fiche WikiHow, vérifications, PR

**Files:**
- Modify: `src/core/whats-new/entries.ts` (après `bibliotheque-v11`)
- Test: lancer les tests existants des entrées (`tests/core/whats-new*`)

- [ ] **Step 1: Fiche `bibliotheque-v12`**

Copier la STRUCTURE de `bibliotheque-v11` (thème `'collection'`, `glyph: '🌦'`, `steps` avec `target`, `title`, `text`, `gesture`, `details` [Comment faire / À quoi ça sert / Limites], `scene`). Titre : « La météo derrière la fenêtre » ; résumé : « Pluie, orage, neige ou brume derrière vos fenêtres : au hasard, forcée ou réelle ». Étapes (4) :
1. Ouvrir une pièce (même texte d'ouverture que v11, adapté).
2. Passer en mode Aménager et repérer la rangée Météo (cible `[data-wmt-library] [data-action="edit"]`).
3. « Choisir la météo » : 🎲 au hasard (le ciel change tout seul, avec des fondus), glyphes ☀ ⛅ 🌦 🌧 ⛈ ❄ 🌫 pour en forcer une ; à quoi ça sert (donner de la vie au décor ; les lumières s'allument sous un ciel d'orage, les passants sortent leur parapluie) ; limites : l'espace et la Terre vue d'en haut n'ont pas de météo.
4. « La vraie météo » : 🌍 ; d'où viennent les données (Open-Meteo via le relais de l'extension : seule une position arrondie à 0,1° est envoyée, jamais enregistrée) ; limites (accord de position nécessaire, réseau nécessaire, sinon météo simulée marquée « (simulée) »).
Les textes sont en français, sans jargon, avec « À quoi ça sert », « D'où viennent les données », « Limites » comme dans les fiches voisines.

- [ ] **Step 2: Lancer toute la suite et la compilation**

```bash
npx tsc --noEmit
npx vitest run --maxWorkers=4
npm run build
```
Expected: tout PASS ; le test d'unicité des identifiants de fiches et celui du « critère id jamais annoncé » passent (l'id `bibliotheque-v12` est nouveau).

- [ ] **Step 3: Commit, pousser, ouvrir et fusionner la PR (routine du projet)**

```bash
git add -A
git commit -m "docs(bibliotheque): fiche WikiHow bibliotheque-v12 (météo)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin feat/bibliotheque-meteo
gh pr create --title "feat(bibliotheque): météo derrière la fenêtre (morceau 5b)" --body "<résumé : réglage global v5, moteur déterministe, mode réelle via /weather du relais, rendu des fenêtres, rangée Météo, fiche v12. Reste : vérification manuelle Chrome (pluie, orage, neige, brume, flaques, arc-en-ciel, raccord entre fenêtres, perf 96 colonnes) + APK à la demande. Relais : /weather se déploie à la fusion (Workers Builds).

🤖 Generated with [Claude Code](https://claude.com/claude-code)>"
gh pr merge --merge
```
Puis, comme pour chaque livraison (mémoire du projet) : `npm run preprod` (pré-prod, sans demander) ; **jamais** `npm run promouvoir` sans ordre explicite. Vérifier ensuite que `GET <RELAY_BASE>/weather?lat=48.8&lon=2.3` répond `{"ok":true,…}` (curl) une fois le relais redéployé ; sinon le mode réel se replie sur l'aléatoire, sans erreur visible.

- [ ] **Step 4: Mémoire**

Mettre à jour `project_bibliotheque.md` (morceau 5b fusionné : PR, pré-prod, ce qui reste : vérification manuelle, 6d débloqué) et l'index `MEMORY.md`.

---

## Self-Review (spec → tâches)

- Données v5, migration, zod : Task 1. Valeurs continues, cibles, transitions 20-60 s, fondu de 30 s au changement de réglage : Tasks 2, 3, 4. Mode aléatoire déterministe, saison/latitude, neige par temps froid : Task 3. Flaques/neige accumulées : Task 3 (accumulateurs). Arc-en-ciel, éclairs : Task 4. Mode réel (relais, arrondi, cache 10 min relais + 15 min client, repli, un appel en vol, réessais) : Task 5 ; position inconnue → repli : Tasks 6 et 8. Rendu (ciel sombre, pluie/neige à deux profondeurs, brume, éclairs, flaques, neige au sol, arc-en-ciel, gouttes sur la vitre, lumières, parapluies, mouvement réduit, plafond d'éléments) : Task 7. Interface (rangée, légende, masquage espace/Terre, repli signalé) : Task 8. Fiche WikiHow : Task 9. Relais README : Task 5.
- Écarts assumés par rapport à la spec : le « rappel borné 10 min » est remplacé par les accumulateurs par tick d'une époque ; les gouttes lointaines/proches sont deux motifs ; la neige au sol ne coiffe pas les toits (bande au sol seulement) ; une seule bande d'arc-en-ciel ; mer « agitée par le vent » non faite (à voir à la vérification manuelle).
- Cohérence des noms : `WeatherSetting`/`WeatherState` (T1) → `targetOf`/`blend`/`smooth` (T2) → `weatherAtRandom`/`WEATHER_SEED` (T3) → `createWeatherClock`/`steadySource`/`lightningAt`/`rainbowOf`/`weatherFlags` (T4) → `realToWeather`/`createRealWeather` (T5) → `useWeather`/`WeatherView` (T6) → `WeatherLayer`/`WEATHER_SCENES` (T7) → panneau (T8).
