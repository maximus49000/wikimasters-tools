# Bibliothèque 8a — lumière intérieure (socle et rayons) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Éclairer l'intérieur d'une pièce d'après ce qu'il y a derrière ses fenêtres : un rayon de soleil par fenêtre (direction, longueur, atténuation par les nuages) et une lumière ambiante qui baisse avec la distance aux fenêtres.

**Architecture:** Un moteur pur (`src/core/library/light/`) calcule une image RGBA basse résolution (1 px pour 6 unités SVG) à partir du ciel, de la météo et des vitres. Un composant `LightLayer` la redessine environ 4 fois par seconde dans un canvas hors écran puis la pose comme `<image>` dans le SVG de la pièce, par-dessus meubles et animaux, sous les bulles et les cases. Un seul calque en alpha normal (pas de `mix-blend-mode`).

**Tech Stack:** TypeScript, React 18, Vitest + jsdom, SVG. Worktree `C:\Users\maxim\Downloads\Wikimasters-bibliotheque`, branche `feat/bibliotheque-lumiere` (`node_modules` et `.env.local` déjà présents).

**Spec:** `docs/superpowers/specs/2026-10-09-bibliotheque-lumiere-design.md`

## Global Constraints

- Hors périmètre de 8a : lampes cliquables, ombres de meubles et d'animaux (8b, 8c). Les meubles ne reçoivent que la lumière ambiante.
- **Aucun état persistant, pas de migration** : seul réglage = clé locale `wmt:library-light` (Actif par défaut), hors état de la Bibliothèque.
- Lumière seulement dans les scènes de `WEATHER_SCENES` ayant au moins une fenêtre ; espace et Terre vue d'en haut : rien.
- Mouvement réduit : une seule image, recalculée seulement quand le ciel change ; onglet caché : pas de recalcul.
- Textes en français, glyphes plutôt que texte dans l'interface, tout visible à l'écran (extension ET mobile).
- Fiche WikiHow dans la même PR : id `bibliotheque-v13`, présentation didactique (à quoi ça sert, d'où viennent les données, comment ça marche, limites).
- Tests : `npx vitest run <fichier>` (jamais la suite entière en parallèle total : `--maxWorkers=4`), puis `npm run typecheck` et `npm run build` en fin de plan.
- Commits en français, terminés par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File Structure

- Create `src/core/library/light/sun-dir.ts` — élévation du soleil, pente latérale par fenêtre.
- Create `src/core/library/light/beam.ts` — projection du verre sur le sol (parallélogramme).
- Create `src/core/library/light/attenuation.ts` — gain d'un rayon (élévation, nuages, soleil masqué).
- Create `src/core/library/light/ambient.ts` — niveau du ciel, besoin de lampes, lumière du ciel en un point.
- Create `src/core/library/light/light-map.ts` — assemblage en image RGBA.
- Create `src/core/library/light/index.ts` — réexports.
- Create `src/content/light-layer.tsx` — composant `LightLayer` (canvas → `<image>`).
- Create `src/content/light-setting.ts` — réglage local + hook.
- Modify `src/content/scene-weather.tsx` — publie `--wmt-sun-hidden` sur le `<svg>`.
- Modify `src/content/RoomView.tsx` — monte `LightLayer`.
- Modify `src/content/LibraryPanel.tsx` — bouton « Lumière » dans la rangée Ciel, passe `light` à `RoomView`.
- Modify `src/core/whats-new/entries.ts` — fiche `bibliotheque-v13`.
- Tests : `tests/core/library/light-*.test.ts`, `tests/content/library-light.test.tsx`.

---

### Task 1: Géométrie du soleil et du rayon

**Files:**
- Create: `src/core/library/light/sun-dir.ts`, `src/core/library/light/beam.ts`
- Modify: `docs/superpowers/specs/2026-10-09-bibliotheque-lumiere-design.md` (amendements)
- Test: `tests/core/library/light-beam.test.ts`

**Interfaces:**
- Produces:
  - `export type Glass = { x: number; y: number; w: number; h: number }` (vitre en pixels de la pièce) — dans `beam.ts`.
  - `export type Point = { x: number; y: number }` — dans `beam.ts`.
  - `export const ROOM_DEPTH_FACTOR = 2` — profondeur de la pièce = 2 × hauteur du mur, dans `beam.ts`.
  - `export function sunElevation(sunFrac: number | null): number` (radians ; 0 si soleil couché) — `sun-dir.ts`.
  - `export function beamSlope(sunX: number, windowCx: number, wallH: number): number` (px latéraux par unité de profondeur) — `sun-dir.ts`.
  - `export function beamPatch(glass: Glass, wallH: number, floorH: number, elev: number, slope: number): Point[] | null` (4 coins en pixels de la pièce, ou null) — `beam.ts`.

- [ ] **Step 1: Amender la spec** — dans `docs/superpowers/specs/2026-10-09-bibliotheque-lumiere-design.md` : (a) remplacer « en `mix-blend-mode` (multiply … screen pour les rayons) » par « en un seul calque RGBA en fusion normale (l'ombrage est une teinte translucide, le rayon une lueur chaude translucide) » et supprimer le risque `mix-blend-mode` ; (b) « se pose sur le sol et le mur » devient « se pose sur le sol (pas de tache sur le mur en 8a) » ; (c) supprimer la ligne « Nuages assombris la nuit » (déjà le cas : la couleur des nuages dépend du jour dans `scene-weather.tsx`).

- [ ] **Step 2: Écrire le test qui échoue**

```ts
// tests/core/library/light-beam.test.ts
import { describe, expect, it } from 'vitest';
import { beamPatch } from '../../../src/core/library/light/beam';
import { beamSlope, sunElevation } from '../../../src/core/library/light/sun-dir';

const WALL = 340;
const FLOOR = 170;
const glass = { x: 100, y: 60, w: 60, h: 100 };

describe('sunElevation', () => {
  it('est nulle sans soleil, minimale au lever, maximale à midi', () => {
    expect(sunElevation(null)).toBe(0);
    expect(sunElevation(0)).toBeCloseTo((6 * Math.PI) / 180, 5);
    expect(sunElevation(0.5)).toBeCloseTo((62 * Math.PI) / 180, 5);
    expect(sunElevation(0.25)).toBeGreaterThan(sunElevation(0));
  });
});

describe('beamSlope', () => {
  it('pousse la lumière à l’opposé du soleil, et est nulle en face', () => {
    expect(beamSlope(500, 500, WALL)).toBe(0);
    expect(beamSlope(800, 500, WALL)).toBeLessThan(0);
    expect(beamSlope(200, 500, WALL)).toBeGreaterThan(0);
    expect(beamSlope(100000, 0, WALL)).toBe(-1.5);
  });
});

describe('beamPatch', () => {
  it('projette le verre en parallélogramme sur le sol à 45°', () => {
    const p = beamPatch(glass, WALL, FLOOR, Math.PI / 4, 0)!;
    // bas du verre à 180 au-dessus du sol → profondeur 180 ; haut à 280 → profondeur 280 ; 0,25 px d'écran par unité
    expect(p).toHaveLength(4);
    expect(p[0]!.y).toBeCloseTo(WALL + 180 * 0.25, 5);
    expect(p[3]!.y).toBeCloseTo(WALL + 280 * 0.25, 5);
    expect(p[0]!.x).toBe(100);
    expect(p[1]!.x).toBe(160);
  });
  it('décale latéralement selon la pente', () => {
    const p = beamPatch(glass, WALL, FLOOR, Math.PI / 4, 0.5)!;
    expect(p[0]!.x).toBeCloseTo(100 + 0.5 * 180, 5);
    expect(p[3]!.x).toBeCloseTo(100 + 0.5 * 280, 5);
  });
  it('est plus longue quand le soleil est plus bas', () => {
    const high = beamPatch(glass, WALL, FLOOR, (60 * Math.PI) / 180, 0)!;
    const low = beamPatch(glass, WALL, FLOOR, (25 * Math.PI) / 180, 0)!;
    expect(low[0]!.y).toBeGreaterThan(high[0]!.y);
  });
  it('coupe à la profondeur de la pièce et rend null si la tache tombe au-delà ou sans soleil', () => {
    const p = beamPatch(glass, WALL, FLOOR, (30 * Math.PI) / 180, 0)!;
    expect(p[3]!.y).toBeLessThanOrEqual(WALL + FLOOR + 1e-6);
    expect(beamPatch(glass, WALL, FLOOR, (6 * Math.PI) / 180, 0)).toBeNull();
    expect(beamPatch(glass, WALL, FLOOR, 0, 0)).toBeNull();
  });
});
```

- [ ] **Step 3: Lancer, constater l'échec** — `npx vitest run tests/core/library/light-beam.test.ts` → FAIL (modules absents).

- [ ] **Step 4: Implémenter**

```ts
// src/core/library/light/sun-dir.ts
const DEG = Math.PI / 180;
export const ELEV_MIN = 6 * DEG;
export const ELEV_MAX = 62 * DEG;
// Écart horizontal (en hauteurs de mur) qui donne une inclinaison de 45° du rayon.
const AZIMUTH_SPAN = 3;
const MAX_SLOPE = 1.5;

// Élévation du soleil (radians) d'après sa course (0 = lever, 1 = coucher) ; 0 s'il est couché.
export function sunElevation(sunFrac: number | null): number {
  if (sunFrac === null) return 0;
  const f = Math.min(1, Math.max(0, sunFrac));
  return ELEV_MIN + (ELEV_MAX - ELEV_MIN) * Math.sin(Math.PI * f);
}

// Décalage latéral (px par unité de profondeur) du rayon d'une fenêtre : la lumière va à l'opposé du soleil,
// d'autant plus que le soleil est loin de la fenêtre dans le panorama partagé.
export function beamSlope(sunX: number, windowCx: number, wallH: number): number {
  const raw = (windowCx - sunX) / (AZIMUTH_SPAN * wallH);
  return Math.min(MAX_SLOPE, Math.max(-MAX_SLOPE, raw));
}
```

```ts
// src/core/library/light/beam.ts
export type Glass = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

// Profondeur de la pièce, en hauteurs de mur (elle est écrasée dans la bande de sol dessinée).
export const ROOM_DEPTH_FACTOR = 2;
const MIN_ELEV = 0.02;

// Projection exacte du verre sur le sol par un rayon parallèle d'élévation `elev` : le bas du verre touche le sol à la
// profondeur Hb / tan(e), le haut à Ht / tan(e) ; chaque point glisse de `slope` px par unité de profondeur.
// Coins en pixels de la pièce (x, y) ; la profondeur est écrasée linéairement dans la bande de sol (y de `wallH` à `wallH + floorH`).
export function beamPatch(glass: Glass, wallH: number, floorH: number, elev: number, slope: number): Point[] | null {
  if (elev <= MIN_ELEV) return null;
  const depthMax = wallH * ROOM_DEPTH_FACTOR;
  const t = Math.tan(elev);
  const near = (wallH - (glass.y + glass.h)) / t;
  const far = Math.min((wallH - glass.y) / t, depthMax);
  if (near >= depthMax || far <= near) return null;
  const k = floorH / depthMax;
  const at = (x: number, d: number): Point => ({ x: x + slope * d, y: wallH + d * k });
  return [at(glass.x, near), at(glass.x + glass.w, near), at(glass.x + glass.w, far), at(glass.x, far)];
}
```

- [ ] **Step 5: Lancer, constater le succès** — même commande → PASS.
- [ ] **Step 6: Commit** — `git add docs/superpowers/specs src/core/library/light tests/core/library/light-beam.test.ts && git commit -m "feat(lumiere): élévation du soleil et projection du verre sur le sol"` (+ trailer).

---

### Task 2: Atténuation et lumière ambiante

**Files:**
- Create: `src/core/library/light/attenuation.ts`, `src/core/library/light/ambient.ts`
- Test: `tests/core/library/light-ambient.test.ts`

**Interfaces:**
- Consumes: `smooth` de `src/core/library/weather/weather-types.ts` ; `Glass` de `./beam`.
- Produces:
  - `export function beamGain(elev: number, cloud: number, hidden: number): number` (0..1) — `attenuation.ts`.
  - `export function skyLevel(daylight: number, cloud: number): number` (0..1) — `ambient.ts`.
  - `export function lampNeed(daylight: number, cloud: number, precip: number): number` (0..1) — `ambient.ts`.
  - `export function skylightAt(px: number, py: number, windows: readonly Glass[]): number` (0..1, avant multiplication par `skyLevel`) — `ambient.ts`.

- [ ] **Step 1: Test qui échoue**

```ts
// tests/core/library/light-ambient.test.ts
import { describe, expect, it } from 'vitest';
import { beamGain } from '../../../src/core/library/light/attenuation';
import { lampNeed, skyLevel, skylightAt } from '../../../src/core/library/light/ambient';

const E45 = Math.PI / 4;
describe('beamGain', () => {
  it('est nul sans soleil et plus fort quand le soleil est haut', () => {
    expect(beamGain(0, 0, 0)).toBe(0);
    expect(beamGain(1.0, 0, 0)).toBeGreaterThan(beamGain(0.15, 0, 0));
  });
  it('baisse avec les nuages, où qu’ils soient, et proportionnellement au soleil masqué', () => {
    expect(beamGain(E45, 1, 0)).toBeLessThan(beamGain(E45, 0.3, 0));
    expect(beamGain(E45, 0, 0.5)).toBeCloseTo(beamGain(E45, 0, 0) * 0.5, 5);
    expect(beamGain(E45, 0, 1)).toBe(0);
  });
});
describe('skyLevel et lampNeed', () => {
  it('le ciel éclaire peu la nuit, fort le jour, moins sous les nuages', () => {
    expect(skyLevel(0, 0)).toBeLessThan(0.1);
    expect(skyLevel(1, 0)).toBeGreaterThan(0.9);
    expect(skyLevel(1, 1)).toBeLessThan(skyLevel(1, 0));
  });
  it('les lampes sont négligeables en plein jour clair, utiles sous les nuages, la pluie et la nuit', () => {
    expect(lampNeed(1, 0.1, 0)).toBeLessThan(0.15);
    expect(lampNeed(1, 1, 0)).toBeGreaterThan(0.6);
    expect(lampNeed(1, 1, 1)).toBeGreaterThan(lampNeed(1, 1, 0));
    expect(lampNeed(0, 0, 0)).toBe(1);
  });
});
describe('skylightAt', () => {
  const win = { x: 100, y: 60, w: 60, h: 100 };
  it('décroît avec la distance à la fenêtre', () => {
    const near = skylightAt(130, 110, [win]);
    const mid = skylightAt(430, 110, [win]);
    const far = skylightAt(900, 110, [win]);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
    expect(skylightAt(130, 110, [])).toBe(0);
  });
  it('plusieurs fenêtres s’additionnent sans dépasser 1', () => {
    const two = skylightAt(130, 110, [win, { ...win, x: 110 }]);
    expect(two).toBeGreaterThanOrEqual(skylightAt(130, 110, [win]));
    expect(two).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Lancer → FAIL.**
- [ ] **Step 3: Implémenter**

```ts
// src/core/library/light/attenuation.ts
import { smooth } from '../weather/weather-types';

// Part de la lumière directe qui entre : plus forte quand le soleil est haut (rayons rasants plus faibles),
// atténuée par TOUS les nuages du panorama, et proportionnelle à la part du disque solaire encore visible.
export function beamGain(elev: number, cloud: number, hidden: number): number {
  if (elev <= 0) return 0;
  const graze = Math.sin(Math.min(elev, Math.PI / 2)) ** 0.6;
  const clouds = 1 - 0.85 * smooth(cloud);
  const visible = 1 - Math.min(1, Math.max(0, hidden));
  return Math.min(1, Math.max(0, graze * clouds * visible));
}
```

```ts
// src/core/library/light/ambient.ts
import { smooth } from '../weather/weather-types';
import type { Glass } from './beam';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
// Distance (px) à laquelle la lumière du ciel d'une fenêtre est divisée par e, et surface d'une grande fenêtre de référence.
const FALLOFF = 260;
const AREA_REF = 90 * 110;

// Luminosité du ciel vu de l'intérieur : presque nulle la nuit, forte le jour, voilée par les nuages.
export function skyLevel(daylight: number, cloud: number): number {
  return clamp01(0.06 + 0.94 * clamp01(daylight)) * (1 - 0.55 * smooth(cloud));
}

// Adaptation de l'œil : en plein jour clair la lumière artificielle ne compte pas ; nuages, pluie et nuit la rendent utile.
export function lampNeed(daylight: number, cloud: number, precip: number): number {
  const day = clamp01(daylight) * (1 - 0.75 * smooth(cloud));
  return clamp01(1 - day + 0.15 * clamp01(precip));
}

// Lumière du ciel en un point de la pièce : somme des fenêtres, chacune pondérée par sa surface et décroissante avec la distance au verre.
export function skylightAt(px: number, py: number, windows: readonly Glass[]): number {
  let sum = 0;
  for (const g of windows) {
    const dx = Math.max(g.x - px, 0, px - (g.x + g.w));
    const dy = Math.max(g.y - py, 0, py - (g.y + g.h));
    sum += Math.min(1, (g.w * g.h) / AREA_REF) * Math.exp(-Math.hypot(dx, dy) / FALLOFF);
  }
  return clamp01(sum);
}
```

- [ ] **Step 4: Lancer → PASS.**
- [ ] **Step 5: Commit** — `feat(lumiere): atténuation des rayons et lumière ambiante du ciel`.

---

### Task 3: Assemblage de la carte de lumière

**Files:**
- Create: `src/core/library/light/light-map.ts`, `src/core/library/light/index.ts`
- Test: `tests/core/library/light-map.test.ts`

**Interfaces:**
- Consumes: Tasks 1-2 (`beamPatch`, `sunElevation`, `beamSlope`, `beamGain`, `skyLevel`, `lampNeed`, `skylightAt`, `ROOM_DEPTH_FACTOR`, `Glass`, `Point`), `mixHex` de `../sky`.
- Produces:
  - `export const LIGHT_SCALE = 6`
  - `export type LightInput = { width: number; height: number; wallH: number; windows: readonly Glass[]; sunX: number | null; sunFrac: number | null; daylight: number; twilight: number; cloud: number; precip: number; hidden: number }`
  - `export type LightMap = { w: number; h: number; rgba: Uint8ClampedArray }` (`w = ceil(width / LIGHT_SCALE)`, `h = ceil(height / LIGHT_SCALE)`, 4 octets par pixel, non prémultiplié)
  - `export function buildLightMap(input: LightInput): LightMap`

**Règles du calque (par pixel, au centre du pixel en coordonnées de la pièce) :**
1. `light = clamp01(0.2 + 0.8 · skyLevel(daylight, cloud) · skylightAt(...))` ; `shade = (1 − light) · 0.6 · (0.45 + 0.55 · lampNeed(daylight, cloud, precip))` ; couleur de l'ombre : `mixHex(mixHex('#1B2236', '#0A1030', 1 − daylight), '#3A2418', twilight · 0.7)`.
2. Rayon : pour chaque fenêtre, `slope = beamSlope(sunX, centreX, wallH)`, `gain = beamGain(elev, cloud, hidden)`, `patch = beamPatch(...)` ; pour un pixel du sol (`y ≥ wallH`) dans le parallélogramme (test de convexité par produits vectoriels), `b = gain · (1 − 0.4 · profondeur/profondeurMax)` ; on garde le maximum sur les fenêtres. Le sol sous le rayon est éclairé : `a1 = shade · (1 − b)`, plus une lueur chaude `#FFE9A8` d'alpha `a2 = min(0.38 · b, 0.9 · shade · b)` (la lueur ne peut jamais assombrir davantage que l'ombre qu'elle remplace).
3. Composition : `a = a2 + a1 · (1 − a2)` ; couleur `= (chaud · a2 + ombre · a1 · (1 − a2)) / a` (si `a = 0`, pixel transparent).

- [ ] **Step 1: Test qui échoue**

```ts
// tests/core/library/light-map.test.ts
import { describe, expect, it } from 'vitest';
import { LIGHT_SCALE, buildLightMap, type LightInput } from '../../../src/core/library/light/light-map';

const base: LightInput = {
  width: 600, height: 510, wallH: 340,
  windows: [{ x: 100, y: 60, w: 60, h: 100 }],
  sunX: 130, sunFrac: 0.5, daylight: 1, twilight: 0, cloud: 0, precip: 0, hidden: 0,
};
const at = (m: { w: number; rgba: Uint8ClampedArray }, x: number, y: number): number[] => {
  const i = (Math.floor(y / LIGHT_SCALE) * m.w + Math.floor(x / LIGHT_SCALE)) * 4;
  return [m.rgba[i]!, m.rgba[i + 1]!, m.rgba[i + 2]!, m.rgba[i + 3]!];
};

describe('buildLightMap', () => {
  it('a la taille de la pièce réduite et 4 octets par pixel', () => {
    const m = buildLightMap(base);
    expect(m.w).toBe(Math.ceil(600 / LIGHT_SCALE));
    expect(m.h).toBe(Math.ceil(510 / LIGHT_SCALE));
    expect(m.rgba).toHaveLength(m.w * m.h * 4);
  });
  it('est plus sombre loin de la fenêtre que près d’elle (sur le mur)', () => {
    const m = buildLightMap({ ...base, sunFrac: null, sunX: null });
    expect(at(m, 130, 120)[3]!).toBeLessThan(at(m, 560, 120)[3]!);
  });
  it('est plus sombre la nuit que le jour', () => {
    const day = buildLightMap({ ...base, sunFrac: null, sunX: null });
    const night = buildLightMap({ ...base, sunFrac: null, sunX: null, daylight: 0 });
    expect(at(night, 300, 120)[3]!).toBeGreaterThan(at(day, 300, 120)[3]!);
  });
  it('pose un rayon chaud sur le sol quand le soleil est levé, pas sans soleil', () => {
    // le rayon tombe sur le sol (y > 340) ; « chaud » = rouge − bleu nettement plus haut que sans soleil
    const withSun = buildLightMap({ ...base, sunFrac: 0.3 });
    const noSun = buildLightMap({ ...base, sunFrac: null, sunX: null });
    let warm = false;
    for (let y = 345; y < 510 && !warm; y += LIGHT_SCALE) for (let x = 0; x < 600; x += LIGHT_SCALE) {
      const [r, , b] = at(withSun, x, y);
      const [r0, , b0] = at(noSun, x, y);
      if (r! - b! > r0! - b0! + 15) { warm = true; break; }
    }
    expect(warm).toBe(true);
    expect(Array.from(buildLightMap({ ...base, sunFrac: null, sunX: null }).rgba)).toEqual(Array.from(noSun.rgba));
  });
  it('un soleil masqué supprime le rayon', () => {
    const warmCount = (m: { rgba: Uint8ClampedArray }) => { let n = 0; for (let i = 0; i < m.rgba.length; i += 4) if (m.rgba[i]! - m.rgba[i + 2]! > 20) n++; return n; };
    const clear = buildLightMap({ ...base, sunFrac: 0.3 });
    const hidden = buildLightMap({ ...base, sunFrac: 0.3, hidden: 1 });
    expect(warmCount(clear)).toBeGreaterThan(0);
    expect(warmCount(hidden)).toBe(0);
  });
  it('est déterministe', () => {
    expect(Array.from(buildLightMap(base).rgba)).toEqual(Array.from(buildLightMap(base).rgba));
  });
});
```

- [ ] **Step 2: Lancer → FAIL.**
- [ ] **Step 3: Implémenter `light-map.ts` et `index.ts`**

```ts
// src/core/library/light/light-map.ts
import { mixHex } from '../sky';
import { beamGain } from './attenuation';
import { lampNeed, skyLevel, skylightAt } from './ambient';
import { ROOM_DEPTH_FACTOR, beamPatch, type Glass, type Point } from './beam';
import { beamSlope, sunElevation } from './sun-dir';

// Un pixel de la carte = 6 unités de la pièce.
export const LIGHT_SCALE = 6;
export type LightInput = {
  width: number; height: number; wallH: number; windows: readonly Glass[];
  sunX: number | null; sunFrac: number | null;
  daylight: number; twilight: number; cloud: number; precip: number; hidden: number;
};
export type LightMap = { w: number; h: number; rgba: Uint8ClampedArray };

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const WARM = hex('#FFE9A8');

// Point dans un quadrilatère convexe : les quatre produits vectoriels ont le même signe.
function inQuad(q: readonly Point[], x: number, y: number): boolean {
  let sign = 0;
  for (let k = 0; k < 4; k++) {
    const a = q[k]!;
    const b = q[(k + 1) % 4]!;
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

// Image RGBA (non prémultipliée) posée par-dessus la pièce : une ombre translucide teintée, éclaircie sous les rayons,
// plus une lueur chaude sous chaque rayon. Déterministe pour une entrée donnée.
export function buildLightMap(input: LightInput): LightMap {
  const { width, height, wallH, windows } = input;
  const w = Math.ceil(width / LIGHT_SCALE);
  const h = Math.ceil(height / LIGHT_SCALE);
  const rgba = new Uint8ClampedArray(w * h * 4);
  const sky = skyLevel(input.daylight, input.cloud);
  const need = lampNeed(input.daylight, input.cloud, input.precip);
  const shadeGain = 0.6 * (0.45 + 0.55 * need);
  const dark = hex(mixHex(mixHex('#1B2236', '#0A1030', 1 - input.daylight), '#3A2418', input.twilight * 0.7));
  const floorH = height - wallH;
  const depthMax = wallH * ROOM_DEPTH_FACTOR;
  const elev = sunElevation(input.sunFrac);
  const gain = beamGain(elev, input.cloud, input.hidden);
  const patches: Point[][] = [];
  if (input.sunX !== null && gain > 0) {
    for (const g of windows) {
      const patch = beamPatch(g, wallH, floorH, elev, beamSlope(input.sunX, g.x + g.w / 2, wallH));
      if (patch) patches.push(patch);
    }
  }
  for (let j = 0; j < h; j++) {
    const y = (j + 0.5) * LIGHT_SCALE;
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5) * LIGHT_SCALE;
      const light = clamp01(0.2 + 0.8 * sky * skylightAt(x, y, windows));
      const shade = (1 - light) * shadeGain;
      let b = 0;
      if (y >= wallH) {
        for (const q of patches) {
          if (!inQuad(q, x, y)) continue;
          const depth = ((y - wallH) / floorH) * depthMax;
          b = Math.max(b, gain * (1 - 0.4 * (depth / depthMax)));
        }
      }
      const a1 = shade * (1 - b);
      const a2 = Math.min(0.38 * b, 0.9 * shade * b);
      const a = a2 + a1 * (1 - a2);
      if (a <= 0.001) continue;
      const o = (j * w + i) * 4;
      for (let c = 0; c < 3; c++) rgba[o + c] = (WARM[c]! * a2 + dark[c]! * a1 * (1 - a2)) / a;
      rgba[o + 3] = a * 255;
    }
  }
  return { w, h, rgba };
}
```

```ts
// src/core/library/light/index.ts
export * from './sun-dir';
export * from './beam';
export * from './attenuation';
export * from './ambient';
export * from './light-map';
```

- [ ] **Step 4: Lancer → PASS** (ajuster seulement les seuils numériques du test si un calcul diffère de peu, jamais la logique).
- [ ] **Step 5: Commit** — `feat(lumiere): carte de lumière basse résolution (ambiant + rayons)`.

---

### Task 4: Calque de lumière dans la pièce

**Files:**
- Create: `src/content/light-layer.tsx`
- Modify: `src/content/scene-weather.tsx` (publie `--wmt-sun-hidden`), `src/content/RoomView.tsx` (monte le calque, prop `light`)
- Test: `tests/content/library-light.test.tsx`

**Interfaces:**
- Consumes: `buildLightMap`, `LightInput`, `LightMap`, `LIGHT_SCALE`, `sunElevation` (Task 3) ; `celestialPlace` de `./scene-panorama` ; `Glass`.
- Produces:
  - `export type LightLayerProps = { windows: readonly Glass[]; width: number; height: number; wallH: number; sky: Sky; clock: { read(nowMs: number): Weather }; toUrl?: (map: LightMap) => string | null }`
  - `export function LightLayer(props: LightLayerProps): ReactElement` — rend `<image data-light="" …>` ; `toUrl` par défaut = canvas hors écran + `toDataURL` (renvoie `null` si canvas indisponible ou dans jsdom : `navigator.userAgent.includes('jsdom')`).
  - `RoomView` : nouvelle prop optionnelle `light?: boolean` (défaut `false`) ; monte `LightLayer` quand `light && weatherOn && view.weather && windows.length > 0`.

**Comportement de `LightLayer` :** un effet calcule `LightInput` à partir de `clock.read(Date.now())`, de `sky` (via une ref, comme `scene-weather.tsx`), de `hidden` lu sur `svg.style.getPropertyValue('--wmt-sun-hidden')` (`Number(...) || 0`), de `sunX = sky.sunFrac === null ? null : celestialPlace(sky.sunFrac, width, wallH).x` ; appelle `toUrl(buildLightMap(input))` ; pose `href` sur l'`<image>` par `setAttribute` (pas de re-rendu React). Rythme : `setInterval` 250 ms, sauté si `document.visibilityState === 'hidden'` ; mouvement réduit (`matchMedia('(prefers-reduced-motion: reduce)')`) : un seul calcul au montage et à chaque changement de `sky`, pas d'intervalle. L'image a `x=0 y=0 width height preserveAspectRatio="none"` et `style={{ pointerEvents: 'none' }}`.

**Placement dans `RoomView` :** juste après `{cardLayer}` et avant `{bubbles}`. Les vitres : `useMemo(() => windows.map(w => glassRect(pxRect({ col: w.col, row: w.row, w: w.w, h: w.h }))), [room.layout])`.

**Dans `scene-weather.tsx`** (boucle `place`, après le calcul de `hidden`) : écrire `svg?.style.setProperty('--wmt-sun-hidden', hidden.toFixed(2))` seulement si la valeur change (variable locale `lastHidden`), et la retirer dans les deux `return` de nettoyage, à côté de `--wmt-precip`.

- [ ] **Step 1: Test qui échoue**

```tsx
// @vitest-environment jsdom
// tests/content/library-light.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LightLayer } from '../../src/content/light-layer';
import { skyAt } from '../../src/core/library/sky';
import { targetOf } from '../../src/core/library/weather/weather-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sky = skyAt(13 * 60, { kind: 'normal', sunrise: 360, sunset: 1200 });
const clock = { read: () => targetOf('sun') };
const windows = [{ x: 100, y: 60, w: 60, h: 100 }];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const mount = (toUrl: (m: unknown) => string | null) =>
  act(async () => {
    root.render(
      <svg viewBox="0 0 600 510">
        <LightLayer windows={windows} width={600} height={510} wallH={340} sky={sky} clock={clock} toUrl={toUrl as never} />
      </svg>,
    );
  });

describe('LightLayer', () => {
  it('pose l’image calculée et la renouvelle quatre fois par seconde', async () => {
    const toUrl = vi.fn(() => 'data:image/png;base64,AAAA');
    await mount(toUrl);
    const image = container.querySelector('image[data-light]');
    expect(image?.getAttribute('href')).toBe('data:image/png;base64,AAAA');
    expect(image?.getAttribute('width')).toBe('600');
    const first = toUrl.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(toUrl.mock.calls.length).toBeGreaterThanOrEqual(first + 3);
  });
  it('n’écrit pas d’href si le canvas est indisponible', async () => {
    await mount(() => null);
    expect(container.querySelector('image[data-light]')?.hasAttribute('href')).toBe(false);
  });
  it('ne se renouvelle pas en mouvement réduit', async () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} })) as never;
    const toUrl = vi.fn(() => 'data:x');
    await mount(toUrl);
    const first = toUrl.mock.calls.length;
    expect(first).toBe(1);
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(toUrl.mock.calls.length).toBe(first);
  });
});
```

- [ ] **Step 2: Lancer → FAIL.**
- [ ] **Step 3: Implémenter** `light-layer.tsx`, la publication de `--wmt-sun-hidden` et le montage dans `RoomView` (voir ci-dessus). Ajouter dans le même fichier de test deux tests de `RoomView` : avec `light` et une scène terrestre + une fenêtre, `image[data-light]` existe ; sans `light`, ou en scène `space`, il n'existe pas (réutiliser les fabriques de pièce d'un test voisin, p. ex. `tests/content/library-view.test.ts` / `library-weather-ui.test.tsx`, et un `sceneView` avec `weather: { clock, flags: { gloom: false, rainy: false } }`).
- [ ] **Step 4: Lancer → PASS**, puis `npx vitest run tests/content/library-weather-ui.test.tsx tests/content/library-panel.test.tsx --maxWorkers=4` pour vérifier l'absence de régression.
- [ ] **Step 5: Commit** — `feat(lumiere): calque de lumière dans la pièce (canvas basse résolution)`.

---

### Task 5: Réglage « Lumière » dans le panneau Ciel

**Files:**
- Create: `src/content/light-setting.ts`
- Modify: `src/content/LibraryPanel.tsx` (icône `bulb`, bouton, prop `light`)
- Test: `tests/content/library-light.test.tsx` (ajouts)

**Interfaces:**
- Produces:
  - `export const LIGHT_KEY = 'wmt:library-light'`
  - `export function readLight(): boolean` (vrai sauf si la clé vaut `'off'` ; vrai si le stockage est inaccessible)
  - `export function writeLight(on: boolean): void` (écrit `'on'`/`'off'` sous try/catch, notifie les abonnés)
  - `export function useLightEnabled(): [boolean, (on: boolean) => void]` (`useSyncExternalStore`)

**Bouton :** dans la rangée `aria-label="Ciel"` (mode Aménager), seulement si `WEATHER_SCENES.includes(room.scene)`, après le sélecteur d'heure : `<Btn label="Lumière" pressed={lightOn} data={{ 'light-toggle': '' }} onClick={() => setLightOn(!lightOn)}><Icon paths={ICONS.bulb} /></Btn>` ; ajouter à `ICONS` (`LibraryPanel.tsx:139`) une entrée `bulb` dans le même style que les autres (ampoule : `'M9 18h6'`, `'M10 21h4'`, `'M12 3a6 6 0 0 0-3.5 10.9c.4.4.5.8.5 1.1V16h6v-1c0-.3.1-.7.5-1.1A6 6 0 0 0 12 3z'`). Passer `light={lightOn}` au `RoomView` rendu par le panneau (autour de `LibraryPanel.tsx:1004`, là où `sceneView` est transmis).

- [ ] **Step 1: Tests qui échouent** (à ajouter dans `tests/content/library-light.test.tsx`)

```tsx
import { LIGHT_KEY, readLight, writeLight } from '../../src/content/light-setting';

describe('réglage Lumière', () => {
  afterEach(() => { try { localStorage.removeItem(LIGHT_KEY); } catch { /* */ } });
  it('est actif par défaut, s’éteint et se rallume', () => {
    expect(readLight()).toBe(true);
    writeLight(false);
    expect(readLight()).toBe(false);
    expect(localStorage.getItem(LIGHT_KEY)).toBe('off');
    writeLight(true);
    expect(readLight()).toBe(true);
  });
  it('reste actif si le stockage lève une exception', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readLight()).toBe(true);
    spy.mockRestore();
  });
});
```

Et un test de panneau, calqué sur `tests/content/library-weather-ui.test.tsx` (mêmes `beforeEach`/`click`) : en mode Aménager d'une pièce de scène terrestre, `[data-light-toggle]` existe, `aria-pressed="true"` ; un clic le passe à `false` et `localStorage` vaut `'off'` ; en scène `space`, le bouton n'existe pas.

- [ ] **Step 2: Lancer → FAIL.**
- [ ] **Step 3: Implémenter** `light-setting.ts` (liste d'abonnés comme `scene-position.ts`, `getServerSnapshot` identique), le bouton, l'icône et la prop.
- [ ] **Step 4: Lancer** `npx vitest run tests/content/library-light.test.tsx tests/content/library-weather-ui.test.tsx tests/content/library-panel.test.tsx --maxWorkers=4` → PASS.
- [ ] **Step 5: Commit** — `feat(lumiere): réglage Lumière actif/inactif dans le panneau Ciel`.

---

### Task 6: Fiche WikiHow, vérifications, livraison

**Files:**
- Modify: `src/core/whats-new/entries.ts` (nouvelle fiche après `bibliotheque-v12`)
- Test: `tests/core/whats-new/entries.test.ts` (existant, doit rester vert)

- [ ] **Step 1: Ajouter la fiche `bibliotheque-v13`** sur le modèle exact de `bibliotheque-v12` (`theme: 'collection'`, `glyph: '💡'`, titre « La lumière du soleil dans la pièce », résumé court, 3 étapes avec `target`, `title`, `text`, `gesture`, `details` [Comment faire / À quoi ça sert / Limites], `scene`) :
  1. Ouvrir une pièce (cible `[data-wmt-library-entry]`, comme v12) — rayons visibles en mode Visiter.
  2. Mode Aménager (crayon) — « Où se trouve le réglage ».
  3. Le glyphe 💡 de la rangée Ciel : allume ou éteint la lumière.
  Contenu à faire apparaître : **à quoi ça sert** (donner du volume : un rayon par fenêtre, plus sombre loin du verre), **d'où viennent les données** (heure, soleil et météo déjà calculés sur l'appareil, rien n'est envoyé), **comment ça marche** (la direction suit la place du soleil devant chaque fenêtre, les nuages l'atténuent, la nuit seule la lumière ambiante reste), **limites** (pas encore d'ombres ni de lampes ; sans effet dans l'espace et sur Terre vue d'en haut ; fixe en mode animations réduites ; coupez-la si l'appareil ralentit).
- [ ] **Step 2: Vérifications** : `npx vitest run tests/core/whats-new tests/core/library tests/content/library-light.test.tsx --maxWorkers=4` ; `npm run typecheck` ; `npm run build`. Tout doit passer ; sinon corriger avant de continuer.
- [ ] **Step 3: Commit** — `docs(lumiere): fiche WikiHow bibliotheque-v13`.
- [ ] **Step 4: Livraison** (routine du projet) : relecture finale du diff, `git push -u origin feat/bibliotheque-lumiere`, ouvrir la PR (corps terminé par la ligne « 🤖 Generated with [Claude Code](https://claude.com/claude-code) »), la fusionner sans demander, `npm run build` sur `main` à jour puis `npm run preprod` (jamais `promouvoir`), mettre à jour la mémoire `project_bibliotheque.md` (8a fusionné + reste : vérification manuelle Chrome des rayons, de la fusion et du coût sur une pièce de 96 colonnes, puis APK ; prochains : 8b, 8c, 6d, 7, 2c).
