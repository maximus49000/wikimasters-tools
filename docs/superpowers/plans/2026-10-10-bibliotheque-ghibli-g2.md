# Bibliothèque Ghibli G2 — ciel vivant : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Peindre le ciel et la météo de la scène Ville sous la bascule 🎨 : texture de gouache, soleil, lune, étoiles en croix, 12 cumulus peints qui défilent et se teintent selon l'heure et la pluie, pluie, neige qui tombe et neige posée sur les toits, brume, éclair.

**Architecture:** Une file de peinture générique (`paint-queue.ts`) peint de petites images hors écran pendant les temps morts (data URL, cache mémoire). Des peintres purs (`sky-painter.ts`, `snow-painter.ts`) dessinent sur l'interface `PaintCtx` de G1. Le décor fixe (`scene-panorama.tsx`) reçoit la texture, les astres et les croix d'étoiles ; la couche météo (`scene-weather.tsx`) reçoit les nuages (12 `<image>` dans `<defs>` réutilisées par `<use>`), les motifs de pluie et de neige, la brume en motif translaté, l'éclair à trois traits et la neige posée par tranches. La boucle d'animation ne fait que déplacer et changer des opacités ; elle signale à React le « cran » de couleur des nuages quand il change.

**Tech Stack:** TypeScript, React 19, SVG, Canvas 2D, Vitest (jsdom pour les composants).

**Spec:** `docs/superpowers/specs/2026-10-10-bibliotheque-ghibli-g2-design.md` (lire aussi `2026-10-10-bibliotheque-ghibli-design.md`, vision générale).

**Dossier de travail :** worktree `C:\Users\maxim\Downloads\Wikimasters-ghibli`, branche `feat/bibliotheque-ghibli-g2` (une autre session peut travailler dans le dépôt principal : ne rien y modifier). Si `node_modules` manque : `npm ci` dans le worktree.

## Global Constraints

- Scène **Ville** seulement, quand `useArtStyle()` vaut `'ghibli'` ; toutes les autres scènes et la Ville classique restent strictement identiques.
- Jamais `Math.random` dans les peintres ni les plans : tout tirage par `mulberry32` dérivé de la graine (`src/core/library/scene-world.ts`).
- Jamais de repeinture par image d'animation, jamais de filtre SVG sur un groupe en mouvement.
- Images peintes en **data URL PNG** (pas de blob : CSP du site), résolution = `min(2, devicePixelRatio)` (× 1,5 pour les nuages).
- Sous jsdom ou sans canvas : on reste sur le dessin actuel (le peintre par défaut rend `null`).
- Mouvement réduit (`prefers-reduced-motion: reduce`) : pas de fondu (bascule directe), brume figée, pas d'éclair (comportement actuel).
- Les nœuds `data-wx` / `data-wx-pattern` / `data-wx-cloud` gardent leurs noms ; les variables `--wmt-overcast`, `--wmt-overcast-color`, `--wmt-sun-hidden`, `--wmt-precip` gardent leur comportement.
- Palettes validées des nuages (lumière / milieu / ombre) : jour `#FFFDF6 / #DCE3EE / #A6A3C9`, coucher `#FFE7B8 / #F1A783 / #7A6699`, nuit `#7381AE / #4B5687 / #262C58`, gris `#C9CDD4 / #9AA0AC / #5E6474`, orage `#8B90A0 / #5B6070 / #2C3040`.
- Nuages : 12 formes, largeur 80 à 120 px à l'échelle 1, hauteur 0,85 × largeur ; crans de couleur au douzième ; cache de 3 jeux au moins (cache commun de 80 images).
- Commentaires et messages de commit en français, dans le ton du code existant. Fin de chaque message de commit : `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Pas de fiche WikiHow pour G2.
- Commandes : `npx vitest run <fichier>` (un fichier), `npm test` (tout), `npm run typecheck`.

## Review Focus

1. **Bascule désactivée puis réactivée** : en repassant en classique, ciel, astres et nuages actuels reviennent (fondu d'une seconde) sans reste peint ; en réactivant, les images en cache s'affichent sans repeinture — couvert en tâche 7 et 8 (test « classique après Ghibli »).
2. **Changement de cran pendant la peinture** (la pluie arrive pendant qu'un jeu de nuages se peint) : l'ancien jeu reste affiché, jamais de nuages vides — couvert en tâche 6 (test « garde l'ancien jeu »).
3. **Pièce qui s'agrandit** (nouvelle largeur) : seules les nouvelles tranches de neige se peignent ; la boucle météo se relance sans nœud périmé — couvert en tâche 9 (test « nœud de neige remplacé »).
4. **Autres scènes avec 🎨 actif** (campagne, montagne, mer) : aucune texture, aucun nuage peint, aucun motif changé — couvert en tâches 7 et 8.
5. **Peintre qui échoue** (canvas indisponible, exception) : le travail est marqué en échec, jamais repeint en boucle, et le dessin actuel reste affiché — couvert en tâche 1.

---

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `src/content/paint-queue.ts` (créé) | File de peinture générique : travaux, peintre canvas, cache, `usePaintJobs`, `paperGrain`, `idle` |
| `src/content/painted-city.ts` (modifié) | Réutilise `paperGrain` et `idle` de la file |
| `src/core/library/paint/sky-painter.ts` (créé) | Formes et palettes de nuages, peintres de nuage, texture, soleil, lune, brume |
| `src/core/library/paint/snow-painter.ts` (créé) | Neige posée sur une tranche de la ville (toits, cheminées, rebords, trottoirs, rue) |
| `src/core/library/weather/bolt.ts` (créé) | Tracé brisé de l'éclair |
| `src/content/painted-sky.ts` (créé) | Travaux du ciel et hooks `usePaintedSky`, `usePaintedClouds`, `usePaintedFog`, `usePaintedSnow` |
| `src/content/ghibli-sky.tsx` (créé) | Texture, croix d'étoiles, soleil et lune peints (décor fixe) |
| `src/content/scene-panorama.tsx` (modifié) | Branche Ghibli du ciel et des astres |
| `src/content/scene-weather.tsx` (modifié) | Nuages peints, motifs, brume, éclair, neige posée, prop `gloom` |
| `src/content/RoomView.tsx` (modifié) | Passe `gloom` à la couche météo |
| tests correspondants sous `tests/core/library/paint/`, `tests/core/library/weather/`, `tests/content/` | |

---

### Task 1: File de peinture générique

**Files:**
- Create: `src/content/paint-queue.ts`
- Modify: `src/content/painted-city.ts` (supprimer `paperGrain` et `idle` locaux, les importer)
- Test: `tests/content/paint-queue.test.tsx`

**Interfaces:**
- Produces:
  - `type PaintJob = { key: string; x: number; w: number; h: number; res: number; grain?: number; paint(ctx: PaintCtx): void }`
  - `type JobRunner = (job: PaintJob) => Promise<string | null>`
  - `canvasJobRunner: JobRunner`
  - `usePaintJobs(jobs: readonly PaintJob[], enabled?: boolean): ReadonlyMap<string, string>`
  - `setJobRunnerForTests(runner: JobRunner | null): void`, `resetPaintQueueForTests(): void`
  - `paperGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void`, `idle(fn: () => void): () => void`

- [ ] **Step 1: Écrire les tests**

```tsx
// @vitest-environment jsdom
// tests/content/paint-queue.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPaintQueueForTests, setJobRunnerForTests, usePaintJobs, type PaintJob } from '../../src/content/paint-queue';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  resetPaintQueueForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setJobRunnerForTests(null);
  vi.useRealTimers();
});

const job = (key: string): PaintJob => ({ key, x: 0, w: 10, h: 10, res: 1, paint: () => undefined });
function Probe({ jobs, enabled = true }: { jobs: PaintJob[]; enabled?: boolean }) {
  const ready = usePaintJobs(jobs, enabled);
  return <p data-n={ready.size}>{[...ready.values()].join(',')}</p>;
}
const text = (): string => container.querySelector('p')!.textContent ?? '';
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await act(async () => { await vi.advanceTimersByTimeAsync(20); });
};

describe('file de peinture', () => {
  it('sous jsdom, le peintre canvas ne rend rien', async () => {
    act(() => root.render(<Probe jobs={[job('a')]} />));
    await flush();
    expect(text()).toBe('');
  });

  it('peint dans l’ordre, une image par créneau, et met en cache', async () => {
    const order: string[] = [];
    setJobRunnerForTests(async (j) => { order.push(j.key); return `url:${j.key}`; });
    act(() => root.render(<Probe jobs={[job('a'), job('b')]} />));
    await flush();
    expect(order).toEqual(['a', 'b']);
    expect(text()).toBe('url:a,url:b');
    act(() => root.render(<Probe jobs={[job('b')]} />));
    await flush();
    expect(order).toEqual(['a', 'b']);
    expect(text()).toBe('url:b');
  });

  it('un travail en échec n’est jamais repeint', async () => {
    let calls = 0;
    setJobRunnerForTests(async () => { calls++; throw new Error('canvas'); });
    act(() => root.render(<Probe jobs={[job('x')]} />));
    await flush();
    act(() => root.render(<Probe jobs={[job('x')]} />));
    await flush();
    expect(calls).toBe(1);
    expect(text()).toBe('');
  });

  it('désactivé : ne peint pas mais rend ce qui est en cache', async () => {
    setJobRunnerForTests(async (j) => `url:${j.key}`);
    act(() => root.render(<Probe jobs={[job('a')]} />));
    await flush();
    act(() => root.render(<Probe jobs={[job('a'), job('z')]} enabled={false} />));
    await flush();
    expect(text()).toBe('url:a');
  });
});
```

- [ ] **Step 2: Lancer les tests (échec attendu)**

Run: `npx vitest run tests/content/paint-queue.test.tsx`
Expected: FAIL (module `paint-queue` introuvable).

- [ ] **Step 3: Écrire `src/content/paint-queue.ts`**

```ts
import { useEffect, useReducer } from 'react';
import type { PaintCtx } from '../core/library/paint/paint-ctx';
import { mulberry32 } from '../core/library/scene-world';

// File de peinture (vague Ghibli) : chaque travail peint une petite image hors écran pendant les temps morts, un travail par
// créneau, rendue en data URL PNG (pas de blob : la CSP du site les refuse). Cache mémoire commun, les plus anciennes libérées.
// `x` : bord gauche du travail dans le monde (le canvas est décalé) ; `res` : px de canvas par px du monde.
export type PaintJob = { key: string; x: number; w: number; h: number; res: number; grain?: number; paint(ctx: PaintCtx): void };
export type JobRunner = (job: PaintJob) => Promise<string | null>;

const CACHE_MAX = 80;
const cache = new Map<string, string>();
const failed = new Set<string>();
let override: JobRunner | null = null;

export function setJobRunnerForTests(runner: JobRunner | null): void {
  override = runner;
}

export function resetPaintQueueForTests(): void {
  cache.clear();
  failed.clear();
}

function remember(key: string, url: string): void {
  cache.delete(key);
  cache.set(key, url);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

// Remonte une image affichée en tête du cache (jamais libérée pendant qu'on la montre) ; '' si absente.
function touch(key: string): string {
  const url = cache.get(key);
  if (url === undefined) return '';
  cache.delete(key);
  cache.set(key, url);
  return url;
}

// Grain de papier : léger bruit sur les pixels peints (le transparent reste intact).
export function paperGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const rng = mulberry32(seed);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = (rng() - 0.5) * 14;
    d[i] = d[i]! + n;
    d[i + 1] = d[i + 1]! + n;
    d[i + 2] = d[i + 2]! + n;
  }
  ctx.putImageData(img, 0, 0);
}

export const idle = (fn: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 1500 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 16);
  return () => window.clearTimeout(id);
};

export const canvasJobRunner: JobRunner = async (job) => {
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(job.w * job.res));
  canvas.height = Math.max(1, Math.ceil(job.h * job.res));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(job.res, 0, 0, job.res, -job.x * job.res, 0);
  job.paint(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (job.grain !== undefined) paperGrain(ctx, canvas.width, canvas.height, job.grain);
  return canvas.toDataURL('image/png');
};

// Images prêtes des travaux demandés (clé → URL), peintes dans l'ordre de la liste. `enabled` faux : rien n'est peint,
// mais ce qui est déjà en cache est rendu (permet le fondu de sortie).
export function usePaintJobs(jobs: readonly PaintJob[], enabled = true): ReadonlyMap<string, string> {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const signature = enabled ? jobs.map((j) => j.key).join('\n') : '';
  useEffect(() => {
    if (signature === '') return;
    const runner = override ?? canvasJobRunner;
    let cancelled = false;
    let cancelIdle: (() => void) | null = null;
    const next = (): void => {
      if (cancelled) return;
      const job = jobs.find((j) => !cache.has(j.key) && !failed.has(j.key));
      if (!job) return;
      cancelIdle = idle(() => {
        void runner(job)
          .catch(() => null)
          .then((url) => {
            if (url) remember(job.key, url);
            else failed.add(job.key);
            if (!cancelled) {
              bump();
              next();
            }
          });
      });
    };
    next();
    return () => {
      cancelled = true;
      cancelIdle?.();
    };
    // La signature résume les travaux : mêmes clés, mêmes travaux.
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  const out = new Map<string, string>();
  for (const j of jobs) {
    const url = touch(j.key);
    if (url !== '') out.set(j.key, url);
  }
  return out;
}
```

- [ ] **Step 4: Brancher `painted-city.ts` sur la file**

Dans `src/content/painted-city.ts` : supprimer les fonctions locales `paperGrain` et `idle` et ajouter `import { idle, paperGrain } from './paint-queue';`. Supprimer l'import de `mulberry32` s'il n'est plus utilisé. Rien d'autre ne change.

- [ ] **Step 5: Lancer les tests**

Run: `npx vitest run tests/content/paint-queue.test.tsx tests/content/ghibli-city.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/content/paint-queue.ts src/content/painted-city.ts tests/content/paint-queue.test.tsx
git commit -m "feat(bibliotheque): file de peinture générique pour le ciel peint"
```

---

### Task 2: Formes et palettes des nuages

**Files:**
- Create: `src/core/library/paint/sky-painter.ts`
- Test: `tests/core/library/paint/paint-sky-shapes.test.ts`

**Interfaces:**
- Consumes: `hexRgb`, `mixRgb`, `type Rgb` (`./color`), `mulberry32`, `hashString` (`../scene-world`).
- Produces:
  - `type Puff = { x: number; y: number; r: number }`, `type CloudShape = { w: number; h: number; base: number; puffs: Puff[] }`
  - `CLOUD_KINDS = 12`, `CLOUD_MARGIN = 6`
  - `cloudShape(seed: number, k: number): CloudShape`
  - `type CloudPalette = readonly [Rgb, Rgb, Rgb]` ; constantes `CLOUD_DAY`, `CLOUD_DUSK`, `CLOUD_NIGHT`, `CLOUD_GREY`, `CLOUD_STORM`, `CLOUD_NIGHT_STORM`
  - `cloudPalette(daylight: number, twilight: number, dark: number): CloudPalette`
  - `type CloudStep = { daylight: number; twilight: number; dark: number }`, `STEPS = 12`
  - `cloudStep(daylight: number, twilight: number, dark: number): CloudStep`, `stepKey(step: CloudStep): string`

- [ ] **Step 1: Écrire les tests**

```ts
// tests/core/library/paint/paint-sky-shapes.test.ts
import { describe, expect, it } from 'vitest';
import {
  CLOUD_DAY, CLOUD_DUSK, CLOUD_GREY, CLOUD_KINDS, CLOUD_MARGIN, CLOUD_NIGHT, CLOUD_STORM,
  cloudPalette, cloudShape, cloudStep, stepKey,
} from '../../../../src/core/library/paint/sky-painter';

describe('formes des nuages', () => {
  it('12 formes distinctes, déterministes', () => {
    const shapes = Array.from({ length: CLOUD_KINDS }, (_, k) => cloudShape(1, k));
    expect(new Set(shapes.map((s) => JSON.stringify(s))).size).toBe(CLOUD_KINDS);
    expect(cloudShape(1, 3)).toEqual(cloudShape(1, 3));
    expect(cloudShape(2, 3)).not.toEqual(cloudShape(1, 3));
  });

  for (const seed of [1, 7, 99]) {
    it(`graine ${seed} : taille et bulles dans le cadre`, () => {
      for (let k = 0; k < CLOUD_KINDS; k++) {
        const s = cloudShape(seed, k);
        expect(s.w).toBeGreaterThanOrEqual(80);
        expect(s.w).toBeLessThanOrEqual(120);
        expect(s.h).toBeCloseTo(s.w * 0.85, 6);
        expect(s.puffs.length).toBeGreaterThanOrEqual(5);
        for (const p of s.puffs) {
          expect(p.x - p.r).toBeGreaterThanOrEqual(CLOUD_MARGIN - 1e-9);
          expect(p.x + p.r).toBeLessThanOrEqual(s.w - CLOUD_MARGIN + 1e-9);
          expect(p.y - p.r).toBeGreaterThanOrEqual(CLOUD_MARGIN - 1e-9);
          expect(p.y).toBeLessThanOrEqual(s.base);
        }
        // Bulles triées du haut vers le bas (les basses sont peintes par-dessus).
        expect(s.puffs.map((p) => p.y)).toEqual([...s.puffs.map((p) => p.y)].sort((a, b) => a - b));
      }
    });
  }
});

describe('palette des nuages', () => {
  it('extrêmes = palettes validées', () => {
    expect(cloudPalette(1, 0, 0)).toEqual(CLOUD_DAY);
    expect(cloudPalette(1, 1, 0)).toEqual(CLOUD_DUSK);
    expect(cloudPalette(0, 0, 0)).toEqual(CLOUD_NIGHT);
    expect(cloudPalette(1, 0, 0.6)).toEqual(CLOUD_GREY);
    expect(cloudPalette(1, 0, 1)).toEqual(CLOUD_STORM);
  });

  it('continue : un petit pas donne une petite différence', () => {
    for (const [d, t, k] of [[0.5, 0.5, 0.3], [0.9, 0.1, 0.59], [0.2, 0, 0.8]] as const) {
      const a = cloudPalette(d, t, k);
      const b = cloudPalette(d + 0.01, t, k + 0.01);
      for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) expect(Math.abs(a[i]![c]! - b[i]![c]!)).toBeLessThanOrEqual(6);
    }
  });

  it('crans au douzième, bornés', () => {
    expect(cloudStep(0.51, 0.04, 2)).toEqual({ daylight: 6 / 12, twilight: 0, dark: 1 });
    expect(stepKey(cloudStep(0.5, 0, 0.3))).toBe(stepKey(cloudStep(0.52, 0.01, 0.31)));
    expect(stepKey(cloudStep(0.5, 0, 0.3))).not.toBe(stepKey(cloudStep(0.6, 0, 0.3)));
  });
});
```

- [ ] **Step 2: Lancer (échec attendu)**

Run: `npx vitest run tests/core/library/paint/paint-sky-shapes.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Écrire le début de `src/core/library/paint/sky-painter.ts`**

```ts
import { hashString, mulberry32 } from '../scene-world';
import { hexRgb, mixRgb, type Rgb } from './color';

// Ciel peint (vague Ghibli, G2) : formes et couleurs des cumulus, peintres de la texture du ciel, des astres et de la brume.
// Fonctions pures et déterministes (tirages dérivés de la graine), sur l'interface PaintCtx.

export type Puff = { x: number; y: number; r: number };
// Cadre du nuage à l'échelle 1 : `base` = ventre plat ; bulles triées du haut vers le bas.
export type CloudShape = { w: number; h: number; base: number; puffs: Puff[] };

export const CLOUD_KINDS = 12;
// Marge autour des bulles : portée maximale d'une touche de nuage (voir paintCloud).
export const CLOUD_MARGIN = 6;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

// Cumulus n° k : rangée basse de bulles au ventre plat, puis étages de bulles plus petites vers le sommet.
export function cloudShape(seed: number, k: number): CloudShape {
  const rng = mulberry32(((seed ^ hashString('ghibli-cloud')) + Math.imul(k + 1, 0x9e3779b1)) >>> 0);
  const w = 80 + rng() * 40;
  const h = w * 0.85;
  const base = h - CLOUD_MARGIN - 2;
  const fit = (p: Puff): Puff => {
    const r = Math.min(p.r, (w - 2 * CLOUD_MARGIN) / 2);
    return {
      x: Math.min(w - CLOUD_MARGIN - r, Math.max(CLOUD_MARGIN + r, p.x)),
      y: Math.min(base, Math.max(CLOUD_MARGIN + r, p.y)),
      r,
    };
  };
  const puffs: Puff[] = [];
  const n = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = w * (0.09 + 0.06 * Math.sin(Math.PI * t)) * (0.85 + rng() * 0.3);
    puffs.push(fit({ x: w * (0.16 + 0.68 * t), y: base - r * 0.55, r }));
  }
  let layer = puffs.slice();
  for (let lv = 0; lv < 3 && layer.length >= 2; lv++) {
    const next: Puff[] = [];
    for (let i = 0; i < Math.max(1, layer.length - 2); i++) {
      const a = layer[1 + Math.floor(rng() * Math.max(1, layer.length - 2))] ?? layer[0]!;
      const r = a.r * (0.75 + rng() * 0.35) * (lv === 0 ? 1.15 : 1);
      if (a.y - a.r * 0.75 - r < CLOUD_MARGIN) continue;
      next.push(fit({ x: a.x + (rng() - 0.5) * a.r * 0.9, y: a.y - a.r * 0.75, r }));
    }
    puffs.push(...next);
    layer = next;
  }
  return { w, h, base, puffs: puffs.sort((p, q) => p.y - q.y) };
}

// Lumière, milieu, ombre.
export type CloudPalette = readonly [Rgb, Rgb, Rgb];
const pal = (a: string, b: string, c: string): CloudPalette => [hexRgb(a), hexRgb(b), hexRgb(c)];
export const CLOUD_DAY = pal('#FFFDF6', '#DCE3EE', '#A6A3C9');
export const CLOUD_DUSK = pal('#FFE7B8', '#F1A783', '#7A6699');
export const CLOUD_NIGHT = pal('#7381AE', '#4B5687', '#262C58');
export const CLOUD_GREY = pal('#C9CDD4', '#9AA0AC', '#5E6474');
export const CLOUD_STORM = pal('#8B90A0', '#5B6070', '#2C3040');
// Nuit de pluie : les gros nuages restent visibles, gris sombre.
export const CLOUD_NIGHT_STORM = pal('#4A4F63', '#33384A', '#1C2030');

const mixPal = (a: CloudPalette, b: CloudPalette, t: number): CloudPalette => [mixRgb(a[0], b[0], t), mixRgb(a[1], b[1], t), mixRgb(a[2], b[2], t)];

// `dark` : obscurité des nuages calculée par la boucle météo (pluie, ciel très couvert), 0..1.
export function cloudPalette(daylight: number, twilight: number, dark: number): CloudPalette {
  const d = clamp01(daylight);
  const k = clamp01(dark);
  const lit = mixPal(CLOUD_DAY, CLOUD_DUSK, clamp01(twilight));
  const wet = k < 0.6 ? mixPal(lit, CLOUD_GREY, k / 0.6) : mixPal(CLOUD_GREY, CLOUD_STORM, (k - 0.6) / 0.4);
  const night = mixPal(CLOUD_NIGHT, CLOUD_NIGHT_STORM, k);
  return mixPal(night, wet, d);
}

export type CloudStep = { daylight: number; twilight: number; dark: number };
export const STEPS = 12;
const q = (v: number): number => Math.round(clamp01(v) * STEPS) / STEPS;

// Cran de couleur des nuages : un jeu de 12 nuages est peint par cran.
export const cloudStep = (daylight: number, twilight: number, dark: number): CloudStep => ({ daylight: q(daylight), twilight: q(twilight), dark: q(dark) });
export const stepKey = (s: CloudStep): string => `${Math.round(s.daylight * STEPS)}-${Math.round(s.twilight * STEPS)}-${Math.round(s.dark * STEPS)}`;
```

Note : `cloudPalette(1, 0, 0.6)` passe par la branche `k < 0.6` faux → `mixPal(GREY, STORM, 0)` = `CLOUD_GREY` ; et `mixRgb` arrondit, donc les extrêmes sont exacts.

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run tests/core/library/paint/paint-sky-shapes.test.ts`
Expected: PASS. Si le test « bulles dans le cadre » échoue sur `p.y - p.r`, vérifier que `fit` est appliqué à toutes les bulles (il l'est par construction).

- [ ] **Step 5: Commit**

```bash
git add src/core/library/paint/sky-painter.ts tests/core/library/paint/paint-sky-shapes.test.ts
git commit -m "feat(bibliotheque): formes et palettes des cumulus peints"
```

---

### Task 3: Peintres du nuage, de la texture, des astres et de la brume

**Files:**
- Modify: `src/core/library/paint/sky-painter.ts` (ajouts en fin de fichier)
- Create: `tests/core/library/paint/paths.ts` (aide de test)
- Test: `tests/core/library/paint/paint-sky-painters.test.ts`

**Interfaces:**
- Consumes: `dab`, `DAB_SPREAD` (`./brush`), `jitter`, `mixRgb`, `rgba`, `hexRgb` (`./color`), `PaintCtx` (`./paint-ctx`), Task 2.
- Produces:
  - `paintCloud(ctx: PaintCtx, shape: CloudShape, palette: CloudPalette, seed: number): void`
  - `SKY_TEXTURE = 256`, `paintSkyTexture(ctx: PaintCtx, size: number, seed: number): void`
  - `SUN_SIZE = 64`, `paintSun(ctx: PaintCtx, dusk: boolean, seed: number): void` (disque centré au milieu du cadre)
  - `MOON_SIZE = 48`, `paintMoon(ctx: PaintCtx, seed: number): void`
  - `FOG_W = 720`, `paintFogBand(ctx: PaintCtx, w: number, h: number, seed: number): void`

- [ ] **Step 1: Aide de test `tests/core/library/paint/paths.ts`**

```ts
import type { RecordingCtx } from './recording-ctx';

// Chemins tracés (points moveTo/lineTo entre deux beginPath).
export function paths(ctx: RecordingCtx): [number, number][][] {
  const out: [number, number][][] = [];
  for (const op of ctx.ops) {
    if (op.op === 'beginPath') out.push([]);
    else if ((op.op === 'moveTo' || op.op === 'lineTo') && out.length > 0) out[out.length - 1]!.push([op.args[0]!, op.args[1]!]);
  }
  return out.filter((p) => p.length > 0);
}
```

- [ ] **Step 2: Écrire les tests**

```ts
// tests/core/library/paint/paint-sky-painters.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUD_DAY, CLOUD_KINDS, FOG_W, MOON_SIZE, SKY_TEXTURE, SUN_SIZE,
  cloudShape, paintCloud, paintFogBand, paintMoon, paintSkyTexture, paintSun,
} from '../../../../src/core/library/paint/sky-painter';
import { paths } from './paths';
import { recordingCtx } from './recording-ctx';

afterEach(() => vi.restoreAllMocks());
const inBox = (pts: [number, number][], x0: number, y0: number, x1: number, y1: number): [number, number][] =>
  pts.filter(([x, y]) => x < x0 - 1e-6 || x > x1 + 1e-6 || y < y0 - 1e-6 || y > y1 + 1e-6);

describe('peintre de nuage', () => {
  it('toutes les touches restent dans le cadre, beaucoup de touches', () => {
    for (let k = 0; k < CLOUD_KINDS; k++) {
      const shape = cloudShape(5, k);
      const ctx = recordingCtx();
      paintCloud(ctx, shape, CLOUD_DAY, 5);
      expect(ctx.fills.length).toBeGreaterThan(800);
      expect(inBox(ctx.points, 0, 0, shape.w, shape.h).slice(0, 3)).toEqual([]);
    }
  });

  it('déterministe ; la graine change le dessin', () => {
    const shape = cloudShape(1, 0);
    const a = recordingCtx();
    const b = recordingCtx();
    const c = recordingCtx();
    paintCloud(a, shape, CLOUD_DAY, 1);
    paintCloud(b, shape, CLOUD_DAY, 1);
    paintCloud(c, shape, CLOUD_DAY, 2);
    expect(a.ops).toEqual(b.ops);
    expect(a.ops).not.toEqual(c.ops);
  });
});

describe('texture du ciel', () => {
  it('se raccorde : une touche qui déborde à gauche est reportée à droite à l’identique', () => {
    const ctx = recordingCtx();
    paintSkyTexture(ctx, SKY_TEXTURE, 3);
    const all = paths(ctx);
    expect(all.length).toBeGreaterThan(1000);
    const key = (p: [number, number][], dx: number, dy: number): string => p.map(([x, y]) => `${(x + dx).toFixed(4)},${(y + dy).toFixed(4)}`).join(';');
    const set = new Set(all.map((p) => key(p, 0, 0)));
    for (const p of all.filter((q) => Math.min(...q.map(([x]) => x)) < 0).slice(0, 50)) expect(set.has(key(p, SKY_TEXTURE, 0))).toBe(true);
    for (const p of all.filter((q) => Math.min(...q.map(([, y]) => y)) < 0).slice(0, 50)) expect(set.has(key(p, 0, SKY_TEXTURE))).toBe(true);
  });
});

describe('astres et brume', () => {
  it('soleil et lune dans leur cadre', () => {
    for (const dusk of [false, true]) {
      const s = recordingCtx();
      paintSun(s, dusk, 1);
      expect(inBox(s.points, 0, 0, SUN_SIZE, SUN_SIZE).slice(0, 3)).toEqual([]);
    }
    const m = recordingCtx();
    paintMoon(m, 1);
    expect(inBox(m.points, 0, 0, MOON_SIZE, MOON_SIZE).slice(0, 3)).toEqual([]);
  });

  it('brume : bancs dans la hauteur, raccord gauche-droite', () => {
    const ctx = recordingCtx();
    paintFogBand(ctx, FOG_W, 150, 4);
    const all = paths(ctx);
    expect(all.length).toBeGreaterThan(500);
    for (const p of all) for (const [, y] of p) expect(y).toBeGreaterThanOrEqual(-1e-6), expect(y).toBeLessThanOrEqual(150 + 1e-6);
    const key = (p: [number, number][], dx: number): string => p.map(([x, y]) => `${(x + dx).toFixed(4)},${y.toFixed(4)}`).join(';');
    const set = new Set(all.map((p) => key(p, 0)));
    for (const p of all.filter((q) => Math.min(...q.map(([x]) => x)) < 0).slice(0, 50)) expect(set.has(key(p, FOG_W))).toBe(true);
  });

  it('n’utilise jamais Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random interdit'); });
    paintCloud(recordingCtx(), cloudShape(1, 1), CLOUD_DAY, 1);
    paintSkyTexture(recordingCtx(), SKY_TEXTURE, 1);
    paintSun(recordingCtx(), false, 1);
    paintMoon(recordingCtx(), 1);
    paintFogBand(recordingCtx(), FOG_W, 120, 1);
  });
});
```

- [ ] **Step 3: Lancer (échec attendu)**

Run: `npx vitest run tests/core/library/paint/paint-sky-painters.test.ts`
Expected: FAIL (exports manquants).

- [ ] **Step 4: Ajouter les peintres à `sky-painter.ts`**

Ajouter aux imports en tête : `import { DAB_SPREAD, dab } from './brush';`, compléter `import { hexRgb, jitter, mixRgb, type Rgb } from './color';` et `import type { PaintCtx } from './paint-ctx';`. Puis, en fin de fichier :

```ts
// Cumulus : bulles peintes du haut vers le bas, chaque touche éclairée selon sa place dans sa bulle (lumière en haut à
// gauche), contraste plus faible vers la base, liseré clair sur les bulles hautes, ventre ombré. Coordonnées du cadre.
// Portée des touches ≤ CLOUD_MARGIN : rayon 3,2 × 1,4 × DAB_SPREAD ≈ 5,2 ; liseré 2,6 × 1,8 × DAB_SPREAD ≈ 5,4.
export function paintCloud(ctx: PaintCtx, shape: CloudShape, palette: CloudPalette, seed: number): void {
  const rng = mulberry32(seed ^ hashString('ghibli-cloud-paint'));
  const [hi, mid, sh] = palette;
  const { w, h, base } = shape;
  const vertOf = (y: number): number => clamp01((y - h * 0.1) / (base - h * 0.1));
  for (const p of shape.puffs) {
    const n = Math.round(p.r * p.r * 2.2);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng());
      const dx = Math.cos(a) * d;
      const dy = Math.sin(a) * d;
      const x = p.x + dx * p.r;
      const y = p.y + dy * p.r;
      if (y > base + 2) continue;
      const light = Math.max(-1, Math.min(1, -dx * 0.55 - dy * 0.85));
      const vert = vertOf(y);
      const contrast = 0.55 + 0.45 * (1 - vert);
      let c = light > 0 ? mixRgb(mid, hi, light * contrast) : mixRgb(mid, sh, -light * 0.9 * contrast);
      c = mixRgb(c, sh, vert * vert * 0.55);
      dab(ctx, rng, x, y, 1.2 + rng() * 2, jitter(c, 6, rng), d > 0.88 ? 0.22 : 0.55, 1.4, (rng() - 0.5) * 1.2);
    }
    const up = 1 - vertOf(p.y);
    for (let i = 0; i < p.r * 1.2 * up; i++) {
      const a = -2.4 + rng() * 1.6;
      dab(ctx, rng, p.x + Math.cos(a) * p.r * 0.9, p.y + Math.sin(a) * p.r * 0.9, 1 + rng() * 1.6, jitter(hi, 4, rng), 0.32, 1.8, a + Math.PI / 2);
    }
  }
  for (let i = 0; i < w * 2; i++) {
    dab(ctx, rng, w * 0.2 + rng() * w * 0.6, base - rng() * h * 0.05, 1 + rng() * 0.8, jitter(sh, 6, rng), 0.14, 2.6, (rng() - 0.5) * 0.15);
  }
}

// Touche reportée de l'autre côté du motif quand elle déborde : le motif se raccorde sur ses bords. Chaque copie rejoue le
// même générateur (`dabSeed`) pour avoir exactement la même forme.
function wrappedDab(ctx: PaintCtx, dabSeed: number, x: number, y: number, r: number, color: Rgb, alpha: number, elong: number, rot: number, wrapW: number, wrapH: number | null): void {
  const reach = r * elong * DAB_SPREAD;
  const xs = [0, -wrapW, wrapW].filter((ox) => x + ox + reach > 0 && x + ox - reach < wrapW);
  const ys = wrapH === null ? [0] : [0, -wrapH, wrapH].filter((oy) => y + oy + reach > 0 && y + oy - reach < wrapH);
  for (const ox of xs) for (const oy of ys) dab(ctx, mulberry32(dabSeed), x + ox, y + oy, r, color, alpha, elong, rot);
}

export const SKY_TEXTURE = 256;
const TEX_LIGHT = hexRgb('#FFFFFF');
const TEX_DARK = hexRgb('#2A3550');

// Texture du ciel : touches allongées, claires et sombres, très légères, sur un carré qui se raccorde dans les deux sens.
export function paintSkyTexture(ctx: PaintCtx, size: number, seed: number): void {
  const rng = mulberry32(seed ^ hashString('ghibli-sky-texture'));
  const n = Math.round(size * size * 0.03);
  for (let i = 0; i < n; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 2 + rng() * 4;
    const color = rng() < 0.55 ? TEX_LIGHT : TEX_DARK;
    const alpha = 0.05 + rng() * 0.05;
    const rot = (rng() - 0.5) * 0.25;
    const dabSeed = Math.floor(rng() * 4294967296);
    wrappedDab(ctx, dabSeed, x, y, r, color, alpha, 2.8, rot, size, size);
  }
}

export const SUN_SIZE = 64;
// Soleil : disque de touches (rayon ≈ 20, comme le soleil actuel), bord plus soutenu ; le halo est un dégradé SVG.
export function paintSun(ctx: PaintCtx, dusk: boolean, seed: number): void {
  const rng = mulberry32(seed ^ hashString(dusk ? 'ghibli-sun-dusk' : 'ghibli-sun'));
  const c = SUN_SIZE / 2;
  const core = hexRgb(dusk ? '#FFB063' : '#FFF4C8');
  const rim = hexRgb(dusk ? '#FF8A4A' : '#FFE08A');
  for (let i = 0; i < 420; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * 20;
    dab(ctx, rng, c + Math.cos(a) * d, c + Math.sin(a) * d, 1.5 + rng() * 2, jitter(mixRgb(core, rim, (d / 20) * 0.6), 8, rng), 0.55, 1.3);
  }
}

export const MOON_SIZE = 48;
const MOON_LIT = hexRgb('#F4F2E6');
const MOON_SHADE = hexRgb('#C9CCD9');
// Lune : disque de touches (rayon 16) éclairé à gauche, trois cratères ; le halo est un dégradé SVG.
export function paintMoon(ctx: PaintCtx, seed: number): void {
  const rng = mulberry32(seed ^ hashString('ghibli-moon'));
  const c = MOON_SIZE / 2;
  for (let i = 0; i < 320; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * 16;
    const shade = clamp01((Math.cos(a) * d) / 16 + 0.2);
    dab(ctx, rng, c + Math.cos(a) * d, c + Math.sin(a) * d, 1.6 + rng() * 2.4, mixRgb(MOON_LIT, MOON_SHADE, shade), 0.6, 1.2);
  }
  ctx.fillStyle = 'rgba(150,155,175,0.35)';
  for (const [dx, dy, r] of [[-5, -4, 3.5], [5, 3, 2.6], [-2, 7, 2]] as const) {
    ctx.beginPath();
    ctx.ellipse(c + dx, c + dy, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const FOG_W = 720;
const FOG = hexRgb('#E2E7EE');
// Brume : trois bancs de touches très légères (répartition en cloche autour de leur hauteur), raccord gauche-droite.
export function paintFogBand(ctx: PaintCtx, w: number, h: number, seed: number): void {
  const rng = mulberry32(seed ^ hashString('ghibli-fog'));
  for (let b = 0; b < 3; b++) {
    const y0 = h * (0.25 + b * 0.25);
    const n = Math.round((w * 700) / FOG_W);
    for (let i = 0; i < n; i++) {
      const g = (rng() + rng() + rng() - 1.5) / 1.5;
      const r = 5 + rng() * 6;
      const reach = r * 2.6 * DAB_SPREAD;
      const y = Math.min(h - reach, Math.max(reach, y0 + g * h * 0.17));
      const dabSeed = Math.floor(rng() * 4294967296);
      wrappedDab(ctx, dabSeed, rng() * w, y, r, FOG, 0.03 * (1 - Math.abs(g)), 2.6, (rng() - 0.5) * 0.08, w, null);
    }
  }
}
```

- [ ] **Step 5: Lancer les tests**

Run: `npx vitest run tests/core/library/paint/paint-sky-painters.test.ts tests/core/library/paint/paint-sky-shapes.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/library/paint/sky-painter.ts tests/core/library/paint/paths.ts tests/core/library/paint/paint-sky-painters.test.ts
git commit -m "feat(bibliotheque): peintres des cumulus, de la texture du ciel, des astres et de la brume"
```

---

### Task 4: Neige posée sur une tranche de la ville

**Files:**
- Create: `src/core/library/paint/snow-painter.ts`
- Test: `tests/core/library/paint/paint-snow.test.ts`

**Interfaces:**
- Consumes: `cityPaintPlan`, `type CityPaintPlan`, `type PaintBuilding` (`./city-plan`), `TILE`, `tileItems` (`./city-painter`), `dab`, `cellRng` (`./brush`), `hexRgb`, `jitter` (`./color`).
- Produces:
  - `SNOW_VERSION = 1`
  - `roofLineY(b: PaintBuilding, x: number): number` (haut du toit peint en `x`)
  - `chimneyBox(plan: CityPaintPlan, b: PaintBuilding): { x0: number; x1: number; y0: number } | null`
  - `paintSnowTile(ctx: PaintCtx, plan: CityPaintPlan, tile: number): void`

Rappel de la géométrie de G1 (`city-painter.ts`) : `eave = b.top + b.look.roofH` ; pignon : `(x − 1,2, eave) → (x + w/2, top) → (x + w + 1,2, eave)` ; mansarde : `(x − 1,2, eave) → (x + 1,5, top + 1) → (x + w − 1,5, top + 1) → (x + w + 1,2, eave)` ; immeubles du fond : pignon sans débord `(x, eave) → (x + w/2, top) → (x + w, eave)` ; cheminée : `fillRect(cx, top + 1,5, 3,5·unit, …)` et chapeau `fillRect(cx − 0,5, top + 1, 4,5·unit, 1,2)` avec `cx = x + w × chimney`.

- [ ] **Step 1: Écrire les tests**

```ts
// tests/core/library/paint/paint-snow.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cityPaintPlan } from '../../../../src/core/library/paint/city-plan';
import { tileCount } from '../../../../src/core/library/paint/city-painter';
import { chimneyBox, paintSnowTile, roofLineY } from '../../../../src/core/library/paint/snow-painter';
import { recordingCtx } from './recording-ctx';

afterEach(() => vi.restoreAllMocks());

// Point permis : rue et trottoirs (y ≥ sol), sous la ligne de toit d'un immeuble, ou dans une cheminée.
function allowed(plan: ReturnType<typeof cityPaintPlan>, x: number, y: number): boolean {
  if (y >= plan.ground - 1e-6) return true;
  return plan.buildings.some((b) => {
    if (x >= b.x - 1.5 && x <= b.x + b.w + 1.5 && y >= roofLineY(b, x) - 1e-6 && y <= plan.ground) return true;
    const c = chimneyBox(plan, b);
    return c !== null && x >= c.x0 - 1e-6 && x <= c.x1 + 1e-6 && y >= c.y0 - 1e-6;
  });
}

describe('neige posée', () => {
  it('ligne de toit : sommet au haut de l’immeuble, avant-toit à la gouttière', () => {
    const plan = cityPaintPlan(720, 340, 1);
    for (const b of plan.buildings) {
      expect(roofLineY(b, b.x + b.w / 2)).toBeCloseTo(b.look.roofKind === 'mansard' && !b.far ? b.top + 1 : b.top, 6);
      expect(roofLineY(b, b.x)).toBeGreaterThan(b.top);
      expect(roofLineY(b, b.x)).toBeLessThanOrEqual(b.top + b.look.roofH + 1e-6);
    }
  });

  for (const seed of [1, 7]) {
    it(`graine ${seed} : neige seulement sur toits, cheminées, rebords, trottoirs et rue`, () => {
      const plan = cityPaintPlan(1080, 340, seed);
      for (let t = 0; t < tileCount(1080); t++) {
        const ctx = recordingCtx();
        paintSnowTile(ctx, plan, t);
        expect(ctx.fills.length).toBeGreaterThan(300);
        expect(ctx.points.filter(([x, y]) => !allowed(plan, x, y)).slice(0, 3)).toEqual([]);
        // Jamais au-dessus de la silhouette.
        for (const [x, y] of ctx.points) {
          const over = plan.buildings.filter((b) => x >= b.x - 1.5 && x <= b.x + b.w + 1.5);
          if (y < plan.ground) expect(over.some((b) => y >= b.top - 1e-6)).toBe(true);
        }
      }
    });
  }

  it('raccord : un immeuble à cheval est enneigé à l’identique depuis ses deux tranches', () => {
    const plan = cityPaintPlan(1080, 340, 3);
    const a = recordingCtx();
    const b = recordingCtx();
    paintSnowTile(a, plan, 0);
    paintSnowTile(b, plan, 1);
    const straddling = plan.buildings.find((x) => !x.far && x.x < 360 && x.x + x.w > 360);
    if (!straddling) return;
    const mine = (ctx: typeof a): string[] =>
      ctx.points.filter(([x, y]) => x >= straddling.x && x <= straddling.x + straddling.w && y < plan.ground).map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`);
    expect(mine(a)).toEqual(mine(b));
  });

  it('n’utilise jamais Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random interdit'); });
    paintSnowTile(recordingCtx(), cityPaintPlan(720, 340, 5), 0);
  });
});
```

- [ ] **Step 2: Lancer (échec attendu)**

Run: `npx vitest run tests/core/library/paint/paint-snow.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Écrire `src/core/library/paint/snow-painter.ts`**

```ts
import { hashString, mulberry32 } from '../scene-world';
import { DAB_SPREAD, cellRng, dab } from './brush';
import { TILE, tileItems } from './city-painter';
import type { CityPaintPlan, PaintBuilding } from './city-plan';
import { hexRgb, jitter } from './color';
import type { PaintCtx } from './paint-ctx';

// Neige posée (vague Ghibli, G2) : une tranche de TILE px du monde, en coordonnées du monde, à superposer à la ville peinte.
// Toits (sous la ligne de toit, jamais au-dessus), cheminées, rebords de fenêtres, trottoirs et rue. Chaque immeuble et chaque
// case du sol a son propre générateur : deux tranches voisines peignent la même chose sur leur bord commun.
export const SNOW_VERSION = 1;

const SNOW = hexRgb('#F4F8FC');
const SNOW_SHADE = hexRgb('#D8E2EE');
const OVERHANG = 1.2;
// Touches de toit : rayon ≤ 0,8, allongement 1,8 → portée ≤ 0,8 × 1,8 × DAB_SPREAD ≈ 1,66 ; centre posé sous la ligne de toit.
const ROOF_R = 0.8;
const ROOF_REACH = ROOF_R * 1.8 * DAB_SPREAD;
const CELL = 40;

// Haut du toit peint en x (mêmes tracés que city-painter.ts).
export function roofLineY(b: PaintBuilding, x: number): number {
  const eave = b.top + b.look.roofH;
  if (b.far || b.look.roofKind === 'gable') {
    const o = b.far ? 0 : OVERHANG;
    const half = b.w / 2 + o;
    const t = Math.min(1, Math.abs(x - (b.x + b.w / 2)) / half);
    return b.top + (eave - b.top) * t;
  }
  const flat = b.top + 1;
  if (x >= b.x + 1.5 && x <= b.x + b.w - 1.5) return flat;
  const t = x < b.x + 1.5 ? Math.min(1, (b.x + 1.5 - x) / (1.5 + OVERHANG)) : Math.min(1, (x - (b.x + b.w - 1.5)) / (1.5 + OVERHANG));
  return flat + (eave - flat) * t;
}

export function chimneyBox(plan: CityPaintPlan, b: PaintBuilding): { x0: number; x1: number; y0: number } | null {
  if (b.far || b.look.chimney === null) return null;
  const cx = b.x + b.w * b.look.chimney;
  return { x0: cx - 0.5, x1: cx + 4 * plan.unit, y0: b.top + 1 };
}

function paintRoofSnow(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding): void {
  const rng = mulberry32(plan.seed ^ hashString('ghibli-snow-roof') ^ Math.round(b.x * 8));
  const o = b.far ? 0 : OVERHANG;
  // Pente locale la plus forte autour de x (5 échantillons sur la portée d'une touche).
  const slopeAt = (x: number): number => (roofLineY(b, x + 0.25) - roofLineY(b, x - 0.25)) / 0.5;
  const steepest = (x: number): number => Math.max(...[-1, -0.5, 0, 0.5, 1].map((k) => Math.abs(slopeAt(x + k * ROOF_REACH))));
  // Deux rangs de touches qui suivent la pente, posés sous la ligne de toit. Une touche de portée R centrée à
  // R × √(1 + s²) sous la ligne ne la dépasse jamais sur une pente s ; rien sur les flancs trop raides (s > 1,5).
  for (const extra of [0.05, 1.2]) {
    for (let x = b.x - o + ROOF_REACH; x <= b.x + b.w + o - ROOF_REACH; x += 0.9) {
      const s = steepest(x);
      const jitterY = rng() * 0.3;
      const size = ROOF_R * (0.7 + rng() * 0.3);
      if (s > 1.5) continue;
      const y = roofLineY(b, x) + ROOF_REACH * Math.sqrt(1 + s * s) + extra + jitterY;
      dab(ctx, rng, x, y, size, jitter(extra > 1 ? SNOW_SHADE : SNOW, 4, rng), 0.9, 1.8, Math.atan(slopeAt(x)));
    }
  }
  const c = chimneyBox(plan, b);
  if (c) {
    for (let x = c.x0 + ROOF_REACH; x <= c.x1 - ROOF_REACH; x += 0.8) dab(ctx, rng, x, c.y0 + ROOF_REACH + 0.05, ROOF_R, SNOW, 0.95, 1.8, 0);
  }
  if (b.far) return;
  // Rebords de fenêtres (pas les lucarnes, déjà dans le toit).
  for (const w of b.wins) {
    if (w.dormer) continue;
    const y = w.y + w.h + 0.2 + 0.5 * 1.8 * DAB_SPREAD;
    for (let x = w.x + 0.6; x <= w.x + w.w - 0.6; x += 0.7) dab(ctx, rng, x, y, 0.4 + rng() * 0.1, SNOW, 0.85, 1.8, 0);
  }
}

// Sol : couche sur les deux trottoirs, plus mince au milieu de la rue. Cases de CELL px tirées chacune de leur générateur.
function paintGroundSnow(ctx: PaintCtx, plan: CityPaintPlan, x0: number, x1: number): void {
  const bands = [
    { y0: plan.ground, y1: plan.curb, cover: 1 },
    { y0: plan.curb, y1: plan.farSide, cover: 0.55 },
    { y0: plan.farSide, y1: plan.height, cover: 1 },
  ];
  const r1 = 2.6;
  const reach = r1 * 2.2 * DAB_SPREAD;
  for (let i = Math.floor(x0 / CELL) - 1; i <= Math.ceil(x1 / CELL); i++) {
    bands.forEach((band, j) => {
      const top = band.y0 + reach;
      const bottom = band.y1 - reach;
      if (bottom <= top) return;
      const rng = cellRng(plan.seed, 'ghibli-snow-ground', i, j);
      const n = Math.round(CELL * (band.y1 - band.y0) * 0.5);
      const mid = (band.y0 + band.y1) / 2;
      for (let k = 0; k < n; k++) {
        const y = top + rng() * (bottom - top);
        const x = (i + rng()) * CELL;
        // Rue : moins de neige au milieu (traces des roues).
        const thin = j === 1 ? 1 - 0.8 * Math.max(0, 1 - Math.abs(y - mid) / ((band.y1 - band.y0) / 2)) : 1;
        if (rng() > band.cover * thin) continue;
        dab(ctx, rng, x, y, 1.2 + rng() * (r1 - 1.2), jitter(rng() < 0.7 ? SNOW : SNOW_SHADE, 5, rng), 0.5, 2.2, (rng() - 0.5) * 0.2);
      }
    });
  }
}

export function paintSnowTile(ctx: PaintCtx, plan: CityPaintPlan, tile: number): void {
  const x0 = tile * TILE;
  const x1 = Math.min(plan.width, (tile + 1) * TILE);
  const { buildings } = tileItems(plan, tile);
  for (const b of buildings.filter((x) => x.far)) paintRoofSnow(ctx, plan, b);
  for (const b of buildings.filter((x) => !x.far)) paintRoofSnow(ctx, plan, b);
  paintGroundSnow(ctx, plan, x0, x1);
}
```

Note sur le test « jamais au-dessus de la silhouette » : un point de la neige d'un immeuble du fond peut tomber dans la colonne d'un immeuble du premier plan plus bas ; il reste au-dessous du haut de l'immeuble du fond qui le couvre, d'où le `some` sur tous les immeubles de la colonne. Les rebords de fenêtres sont sous le toit, donc couverts par `allowed`.

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run tests/core/library/paint/paint-snow.test.ts && npm run typecheck`
Expected: PASS. Si `allowed` échoue pour un point de rebord à `y` légèrement au-dessus de `ground` : vérifier `w.y + w.h` des fenêtres du rez-de-chaussée (elles sont au-dessus du sol, la neige aussi) ; si un point de mansarde échoue près de `b.x + 1.5`, contrôler la continuité de `roofLineY` (les deux branches valent `flat` en `b.x + 1.5`).

- [ ] **Step 5: Commit**

```bash
git add src/core/library/paint/snow-painter.ts tests/core/library/paint/paint-snow.test.ts
git commit -m "feat(bibliotheque): neige posée peinte sur les toits, rebords et la rue"
```

---

### Task 5: Tracé de l'éclair

**Files:**
- Create: `src/core/library/weather/bolt.ts`
- Test: `tests/core/library/weather/bolt.test.ts`

**Interfaces:**
- Produces: `boltPath(x: number, height: number, seed: number): string` (chemin SVG `M… L…`).

- [ ] **Step 1: Écrire les tests**

```ts
// tests/core/library/weather/bolt.test.ts
import { describe, expect, it } from 'vitest';
import { boltPath } from '../../../../src/core/library/weather/bolt';

const points = (d: string): [number, number][] => d.split(/[ML]/).filter((s) => s.trim() !== '').map((s) => s.trim().split(' ').map(Number) as [number, number]);

describe('éclair peint', () => {
  it('part du haut en x, descend jusqu’à 55 % de la hauteur, par petits segments', () => {
    const p = points(boltPath(300, 216, 42));
    expect(p[0]).toEqual([300, 0]);
    expect(p[p.length - 1]![1]).toBeCloseTo(216 * 0.55, 1);
    expect(p.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < p.length; i++) {
      expect(p[i]![1]).toBeGreaterThan(p[i - 1]![1]);
      expect(Math.abs(p[i]![0] - p[i - 1]![0])).toBeLessThanOrEqual(10.01);
    }
  });

  it('même éclair, même tracé ; autre éclair, autre tracé', () => {
    expect(boltPath(300, 216, 42)).toBe(boltPath(300, 216, 42));
    expect(boltPath(300, 216, 43)).not.toBe(boltPath(300, 216, 42));
  });
});
```

- [ ] **Step 2: Lancer (échec attendu)**

Run: `npx vitest run tests/core/library/weather/bolt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Écrire `src/core/library/weather/bolt.ts`**

```ts
import { mulberry32 } from '../scene-world';

// Éclair peint (vague Ghibli) : tracé brisé en petits segments, du haut du ciel jusqu'à 55 % de la hauteur.
// Même graine (un éclair donné), même tracé : les copies de chaque fenêtre et les trois traits superposés coïncident.
export function boltPath(x: number, height: number, seed: number): string {
  const rng = mulberry32(seed);
  const bottom = height * 0.55;
  const pts: [number, number][] = [[x, 0]];
  let px = x;
  let py = 0;
  while (py < bottom) {
    px += (rng() - 0.55) * 18;
    py = Math.min(bottom, py + 8 + rng() * 12);
    pts.push([px, py]);
  }
  return pts.map(([a, b], i) => `${i === 0 ? 'M' : 'L'}${a.toFixed(1)} ${b.toFixed(1)}`).join(' ');
}
```

Note : `toFixed(1)` sur `x = 300` donne `300.0` → `Number('300.0') === 300`, le premier test passe.

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run tests/core/library/weather/bolt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/weather/bolt.ts tests/core/library/weather/bolt.test.ts
git commit -m "feat(bibliotheque): tracé brisé de l'éclair peint"
```

---

### Task 6: Travaux et hooks du ciel peint

**Files:**
- Create: `src/content/painted-sky.ts`
- Test: `tests/content/painted-sky.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`usePaintJobs`, `PaintJob`), Task 2-3 (`cloudShape`, `cloudPalette`, `paintCloud`, `paintSkyTexture`, `paintSun`, `paintMoon`, `paintFogBand`, `stepKey`, `CLOUD_KINDS`, `SKY_TEXTURE`, `SUN_SIZE`, `MOON_SIZE`, `FOG_W`, `type CloudStep`, `type CloudShape`), Task 4 (`paintSnowTile`, `SNOW_VERSION`), `TILE`, `tileCount`, `tileKey` (`city-painter`), `type CityPaintPlan`.
- Produces:
  - `SKY_VERSION = 1`
  - `skyJobs(seed: number): PaintJob[]` (clés `sky|…|texture`, `…|sun-day`, `…|sun-dusk`, `…|moon`)
  - `cloudJobs(seed: number, step: CloudStep): PaintJob[]` (12)
  - `fogJob(seed: number, h: number): PaintJob`
  - `snowJobs(plan: CityPaintPlan): PaintJob[]` (une par tranche)
  - `type PaintedSky = { ready: boolean; texture: string; sunDay: string; sunDusk: string; moon: string }` ; `usePaintedSky(seed: number, on: boolean): PaintedSky`
  - `type PaintedClouds = { ready: boolean; urls: string[]; shapes: CloudShape[] }` ; `usePaintedClouds(seed: number, step: CloudStep | null): PaintedClouds`
  - `usePaintedFog(seed: number, h: number, on: boolean): string` ('' tant que non prête)
  - `type SnowTile = { x: number; w: number; url: string }` ; `usePaintedSnow(plan: CityPaintPlan | null): { ready: boolean; tiles: SnowTile[] }`

- [ ] **Step 1: Écrire les tests**

```tsx
// @vitest-environment jsdom
// tests/content/painted-sky.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPaintQueueForTests, setJobRunnerForTests } from '../../src/content/paint-queue';
import { cloudJobs, fogJob, skyJobs, snowJobs, usePaintedClouds, usePaintedSky } from '../../src/content/painted-sky';
import { cityPaintPlan } from '../../src/core/library/paint/city-plan';
import { tileCount } from '../../src/core/library/paint/city-painter';
import { cloudStep, type CloudStep } from '../../src/core/library/paint/sky-painter';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  resetPaintQueueForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setJobRunnerForTests(null);
  vi.useRealTimers();
});
const flush = async (n = 40): Promise<void> => {
  for (let i = 0; i < n; i++) await act(async () => { await vi.advanceTimersByTimeAsync(20); });
};

describe('travaux du ciel', () => {
  it('clés uniques, versionnées, dépendantes de la graine et du cran', () => {
    const day = cloudStep(1, 0, 0);
    const rain = cloudStep(1, 0, 0.7);
    const keys = [...skyJobs(1), ...cloudJobs(1, day), fogJob(1, 150)].map((j) => j.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(cloudJobs(1, day)).toHaveLength(12);
    expect(cloudJobs(1, day)[0]!.key).not.toBe(cloudJobs(1, rain)[0]!.key);
    expect(cloudJobs(1, day)[0]!.key).not.toBe(cloudJobs(2, day)[0]!.key);
    expect(snowJobs(cityPaintPlan(1080, 340, 1))).toHaveLength(tileCount(1080));
    expect(snowJobs(cityPaintPlan(1080, 340, 1))[1]!.x).toBe(360);
  });
});

function SkyProbe({ on }: { on: boolean }) {
  const s = usePaintedSky(1, on);
  return <p data-ready={String(s.ready)}>{s.texture}</p>;
}
function CloudProbe({ step }: { step: CloudStep | null }) {
  const c = usePaintedClouds(1, step);
  return <p data-ready={String(c.ready)}>{c.urls[0] ?? ''}</p>;
}
const p = (): HTMLElement => container.querySelector('p')!;

describe('hooks du ciel', () => {
  it('ciel prêt quand la texture et les astres sont peints ; désactivé : rien de peint', async () => {
    setJobRunnerForTests(async (j) => `url:${j.key}`);
    act(() => root.render(<SkyProbe on={false} />));
    await flush();
    expect(p().dataset.ready).toBe('false');
    act(() => root.render(<SkyProbe on />));
    await flush();
    expect(p().dataset.ready).toBe('true');
    expect(p().textContent).toContain('texture');
  });

  it('garde l’ancien jeu de nuages pendant que le nouveau se peint', async () => {
    let release: (() => void) | null = null;
    setJobRunnerForTests((j) =>
      j.key.includes('-0-0|') || j.key.includes('|12-0-0|')
        ? Promise.resolve(`url:${j.key}`)
        : new Promise((resolve) => { release = () => resolve(`url:${j.key}`); }),
    );
    const day = cloudStep(1, 0, 0);
    act(() => root.render(<CloudProbe step={day} />));
    await flush();
    const first = p().textContent;
    expect(p().dataset.ready).toBe('true');
    act(() => root.render(<CloudProbe step={cloudStep(1, 0, 0.7)} />));
    await flush();
    expect(p().textContent).toBe(first);
    expect(release).not.toBeNull();
  });
});
```

Note : les clés de nuages du cran jour contiennent `|12-0-0|` (`stepKey` = `12-0-0`) ; le peintre de test les rend tout de suite et bloque les autres.

- [ ] **Step 2: Lancer (échec attendu)**

Run: `npx vitest run tests/content/painted-sky.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Écrire `src/content/painted-sky.ts`**

```ts
import { useMemo, useRef } from 'react';
import { TILE, tileCount, tileKey } from '../core/library/paint/city-painter';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import {
  CLOUD_KINDS, FOG_W, MOON_SIZE, SKY_TEXTURE, SUN_SIZE,
  cloudPalette, cloudShape, paintCloud, paintFogBand, paintMoon, paintSkyTexture, paintSun, stepKey,
  type CloudShape, type CloudStep,
} from '../core/library/paint/sky-painter';
import { SNOW_VERSION, paintSnowTile } from '../core/library/paint/snow-painter';
import { usePaintJobs, type PaintJob } from './paint-queue';

// Ciel peint (vague Ghibli, G2) : travaux de peinture et hooks qui rendent les images prêtes.
// À incrémenter à chaque changement du dessin du ciel : invalide le cache.
export const SKY_VERSION = 1;
const CLOUD_RES = 1.5; // les nuages sont agrandis jusqu'à ×1,9 par la réserve

const res = (): number => Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
const base = (seed: number): string => `sky|${SKY_VERSION}|${seed}`;

export function skyJobs(seed: number): PaintJob[] {
  const r = res();
  return [
    { key: `${base(seed)}|texture`, x: 0, w: SKY_TEXTURE, h: SKY_TEXTURE, res: r, paint: (ctx) => paintSkyTexture(ctx, SKY_TEXTURE, seed) },
    { key: `${base(seed)}|sun-day`, x: 0, w: SUN_SIZE, h: SUN_SIZE, res: r, grain: seed ^ 0x51, paint: (ctx) => paintSun(ctx, false, seed) },
    { key: `${base(seed)}|sun-dusk`, x: 0, w: SUN_SIZE, h: SUN_SIZE, res: r, grain: seed ^ 0x52, paint: (ctx) => paintSun(ctx, true, seed) },
    { key: `${base(seed)}|moon`, x: 0, w: MOON_SIZE, h: MOON_SIZE, res: r, grain: seed ^ 0x53, paint: (ctx) => paintMoon(ctx, seed) },
  ];
}

export function cloudJobs(seed: number, step: CloudStep): PaintJob[] {
  const palette = cloudPalette(step.daylight, step.twilight, step.dark);
  return Array.from({ length: CLOUD_KINDS }, (_, k) => {
    const shape = cloudShape(seed, k);
    return { key: `${base(seed)}|cloud|${stepKey(step)}|${k}`, x: 0, w: shape.w, h: shape.h, res: res() * CLOUD_RES, grain: seed ^ (k + 1), paint: (ctx) => paintCloud(ctx, shape, palette, seed + k) };
  });
}

export const fogJob = (seed: number, h: number): PaintJob => ({
  key: `${base(seed)}|fog|${Math.round(h)}`, x: 0, w: FOG_W, h: Math.round(h), res: res(), paint: (ctx) => paintFogBand(ctx, FOG_W, Math.round(h), seed),
});

export function snowJobs(plan: CityPaintPlan): PaintJob[] {
  return Array.from({ length: tileCount(plan.width) }, (_, t) => ({
    key: `snow|${SNOW_VERSION}|${tileKey(plan, t)}`,
    x: t * TILE,
    w: Math.min(TILE, plan.width - t * TILE),
    h: plan.height,
    res: res(),
    grain: plan.seed ^ (t + 0x5a0),
    paint: (ctx) => paintSnowTile(ctx, plan, t),
  }));
}

export type PaintedSky = { ready: boolean; texture: string; sunDay: string; sunDusk: string; moon: string };

export function usePaintedSky(seed: number, on: boolean): PaintedSky {
  const jobs = useMemo(() => skyJobs(seed), [seed]);
  const ready = usePaintJobs(jobs, on);
  const [texture, sunDay, sunDusk, moon] = jobs.map((j) => ready.get(j.key) ?? '');
  return { ready: jobs.every((j) => ready.has(j.key)), texture: texture!, sunDay: sunDay!, sunDusk: sunDusk!, moon: moon! };
}

export type PaintedClouds = { ready: boolean; urls: string[]; shapes: CloudShape[] };

// Jeu de nuages du cran demandé ; tant qu'il n'est pas complet, le dernier jeu complet reste affiché.
export function usePaintedClouds(seed: number, step: CloudStep | null): PaintedClouds {
  const shapes = useMemo(() => Array.from({ length: CLOUD_KINDS }, (_, k) => cloudShape(seed, k)), [seed]);
  const key = step ? stepKey(step) : '';
  const jobs = useMemo(() => (step ? cloudJobs(seed, step) : []), [seed, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = usePaintJobs(jobs, step !== null);
  const last = useRef<{ seed: number; urls: string[] } | null>(null);
  if (jobs.length > 0 && jobs.every((j) => ready.has(j.key))) last.current = { seed, urls: jobs.map((j) => ready.get(j.key)!) };
  const kept = last.current && last.current.seed === seed ? last.current.urls : null;
  return { ready: kept !== null, urls: kept ?? [], shapes };
}

export function usePaintedFog(seed: number, h: number, on: boolean): string {
  const job = useMemo(() => [fogJob(seed, h)], [seed, h]);
  return usePaintJobs(job, on).get(job[0]!.key) ?? '';
}

export type SnowTile = { x: number; w: number; url: string };

export function usePaintedSnow(plan: CityPaintPlan | null): { ready: boolean; tiles: SnowTile[] } {
  const jobs = useMemo(() => (plan ? snowJobs(plan) : []), [plan]);
  const ready = usePaintJobs(jobs, plan !== null);
  const tiles = jobs.map((j) => ({ x: j.x, w: j.w, url: ready.get(j.key) ?? '' }));
  return { ready: tiles.length > 0 && tiles.every((t) => t.url !== ''), tiles };
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run tests/content/painted-sky.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/painted-sky.ts tests/content/painted-sky.test.tsx
git commit -m "feat(bibliotheque): travaux et hooks du ciel peint (texture, astres, nuages, brume, neige)"
```

---

### Task 7: Ciel, étoiles et astres peints dans le décor fixe

**Files:**
- Create: `src/content/ghibli-sky.tsx`
- Modify: `src/content/scene-panorama.tsx` (`SkyAndStars`, `Celestial`, `ScenePanoramaStaticView`)
- Test: `tests/content/ghibli-sky.test.tsx`

**Interfaces:**
- Consumes: Task 6 (`usePaintedSky`, `PaintedSky`), `SKY_TEXTURE`, `SUN_SIZE`, `MOON_SIZE`, `useArtStyle` (`./art-setting`), `celestialPlace`.
- Produces:
  - `type Star = { i: number; x: number; y: number; r: number }` et `starsFor(width: number, height: number, seed: number): Star[]` exportés de `scene-panorama.tsx` (mêmes tirages qu'aujourd'hui)
  - `GhibliSkyTexture({ width, height, url, shown }: …)` : `<rect data-sky-texture>` + motif
  - `GhibliStarCrosses({ stars, opacity, shown }: …)` : `<g data-star-crosses>`
  - `GhibliSun({ x, y, twilight, painted, shown })`, `GhibliMoon({ x, y, painted, shown })` : `<g data-ghibli-sun>` / `<g data-ghibli-moon>`
  - Constante `FADE_S = 1` (fondu) partagée dans `ghibli-sky.tsx`.

- [ ] **Step 1: Écrire les tests**

```tsx
// @vitest-environment jsdom
// tests/content/ghibli-sky.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeArt } from '../../src/content/art-setting';
import { resetPaintQueueForTests, setJobRunnerForTests } from '../../src/content/paint-queue';
import { ScenePanoramaStatic } from '../../src/content/scene-panorama';
import type { SceneId } from '../../src/core/library/library-types';
import type { Sky } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const DAY: Sky = { phase: 'day', daylight: 1, twilight: 0, sunFrac: 0.5, moonFrac: null, stars: 0, top: '#6FB1E8', bottom: '#BFE0F5' };
const NIGHT: Sky = { phase: 'night', daylight: 0, twilight: 0, sunFrac: null, moonFrac: 0.5, stars: 1, top: '#0B1030', bottom: '#1A2350' };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetPaintQueueForTests();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setJobRunnerForTests(null);
  localStorage.clear();
  vi.useRealTimers();
});
const flush = async (): Promise<void> => {
  for (let i = 0; i < 40; i++) await act(async () => { await vi.advanceTimersByTimeAsync(20); });
};
const mount = (scene: SceneId, sky: Sky = DAY): void =>
  act(() => root.render(<svg><ScenePanoramaStatic scene={scene} width={720} height={340} sky={sky} minutes={720} seed={1} /></svg>));
const q = (sel: string): SVGElement | null => container.querySelector<SVGElement>(sel);
const op = (sel: string): string => q(sel)?.style.opacity ?? '';

describe('ciel peint de la Ville', () => {
  it('sous jsdom sans peintre : ciel actuel seulement', async () => {
    writeArt('ghibli');
    mount('city');
    await flush();
    expect(q('[data-sky-texture]')).toBeNull();
    expect(q('[data-sun]')).not.toBeNull();
  });

  it('Ghibli : texture, soleil peint, soleil actuel effacé', async () => {
    setJobRunnerForTests(async (j) => `data:image/png;base64,${btoa(j.key)}`);
    writeArt('ghibli');
    mount('city');
    await flush();
    expect(op('[data-sky-texture]')).toBe('1');
    expect(q('[data-ghibli-sun] image')).not.toBeNull();
    expect(op('[data-classic-sun]')).toBe('0');
  });

  it('Ghibli la nuit : lune peinte et croix d’étoiles', async () => {
    setJobRunnerForTests(async (j) => `data:image/png;base64,${btoa(j.key)}`);
    writeArt('ghibli');
    mount('city', NIGHT);
    await flush();
    expect(q('[data-ghibli-moon] image')).not.toBeNull();
    expect(container.querySelectorAll('[data-star-crosses] path').length).toBeGreaterThan(0);
  });

  it('autres scènes et graphisme classique : inchangés', async () => {
    setJobRunnerForTests(async (j) => `data:image/png;base64,${btoa(j.key)}`);
    writeArt('ghibli');
    mount('countryside');
    await flush();
    expect(q('[data-sky-texture]')).toBeNull();
    writeArt('classic');
    mount('city');
    await flush();
    expect(q('[data-sky-texture]')).toBeNull();
    expect(q('[data-ghibli-sun]')).toBeNull();
  });

  it('classique après Ghibli : le peint s’efface, l’actuel revient', async () => {
    setJobRunnerForTests(async (j) => `data:image/png;base64,${btoa(j.key)}`);
    writeArt('ghibli');
    mount('city');
    await flush();
    act(() => writeArt('classic'));
    await flush();
    expect(op('[data-classic-sun]')).toBe('1');
    expect(['0', '']).toContain(op('[data-sky-texture]'));
  });
});
```

- [ ] **Step 2: Lancer (échec attendu)**

Run: `npx vitest run tests/content/ghibli-sky.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Écrire `src/content/ghibli-sky.tsx`**

```tsx
import { useId, type ReactElement } from 'react';
import { MOON_SIZE, SKY_TEXTURE, SUN_SIZE } from '../core/library/paint/sky-painter';
import type { PaintedSky } from './painted-sky';

// Ciel peint de la Ville (vague Ghibli, G2), dans le décor fixe : aucune animation ici (les copies `<use>` de chaque fenêtre
// ne sont recalculées qu'à la minute). `shown` règle le fondu d'une seconde entre ciel actuel et ciel peint.
export const FADE_S = 1;
const reducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fadeStyle = (shown: boolean): { opacity: number; transition: string } => ({ opacity: shown ? 1 : 0, transition: reducedMotion() ? 'none' : `opacity ${FADE_S}s ease` });
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const uid = (raw: string): string => raw.replace(/[^a-zA-Z0-9_-]/g, '');

export function GhibliSkyTexture({ width, height, url, shown }: { width: number; height: number; url: string; shown: boolean }): ReactElement {
  const id = `skytex${uid(useId())}`;
  return (
    <g>
      <defs>
        <pattern id={id} width={SKY_TEXTURE} height={SKY_TEXTURE} patternUnits="userSpaceOnUse">
          <image href={url} width={SKY_TEXTURE} height={SKY_TEXTURE} />
        </pattern>
      </defs>
      <rect data-sky-texture="" x={0} y={0} width={width} height={height} fill={`url(#${id})`} style={fadeStyle(shown)} />
    </g>
  );
}

type Star = { i: number; x: number; y: number; r: number };
// Croix des étoiles les plus brillantes (une sur dix, les plus grosses).
export function GhibliStarCrosses({ stars, opacity, shown }: { stars: Star[]; opacity: number; shown: boolean }): ReactElement {
  const bright = stars.filter((s) => s.r > 1.8);
  return (
    <g data-star-crosses="" opacity={opacity} style={fadeStyle(shown)}>
      {opacity > 0 && bright.map((s) => (
        <path key={s.i} d={`M${s.x - 4} ${s.y}H${s.x + 4}M${s.x} ${s.y - 4}V${s.y + 4}`} stroke="#FFFAEB" strokeOpacity={0.55} strokeWidth={0.7} strokeLinecap="round" />
      ))}
    </g>
  );
}

export function GhibliSun({ x, y, twilight, painted, shown }: { x: number; y: number; twilight: number; painted: PaintedSky; shown: boolean }): ReactElement {
  const id = `sunhalo${uid(useId())}`;
  const dusk = clamp01((twilight - 0.2) / 0.4);
  const half = SUN_SIZE / 2;
  return (
    <g data-ghibli-sun="" transform={`translate(${x} ${y})`} style={fadeStyle(shown)}>
      <defs>
        <radialGradient id={id}>
          <stop offset="0" stopColor={dusk > 0.5 ? '#FFAA5A' : '#FFF6CD'} stopOpacity={0.55} />
          <stop offset="1" stopColor="#FFF0C8" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle r={52} fill={`url(#${id})`} />
      <image href={painted.sunDay} x={-half} y={-half} width={SUN_SIZE} height={SUN_SIZE} opacity={1 - dusk} />
      <image href={painted.sunDusk} x={-half} y={-half} width={SUN_SIZE} height={SUN_SIZE} opacity={dusk} />
    </g>
  );
}

export function GhibliMoon({ x, y, painted, shown }: { x: number; y: number; painted: PaintedSky; shown: boolean }): ReactElement {
  const id = `moonhalo${uid(useId())}`;
  const half = MOON_SIZE / 2;
  return (
    <g data-ghibli-moon="" transform={`translate(${x} ${y})`} style={fadeStyle(shown)}>
      <defs>
        <radialGradient id={id}>
          <stop offset="0.3" stopColor="#DCE4FF" stopOpacity={0.35} />
          <stop offset="1" stopColor="#DCE4FF" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle r={40} fill={`url(#${id})`} />
      <image href={painted.moon} x={-half} y={-half} width={MOON_SIZE} height={MOON_SIZE} />
    </g>
  );
}
```

Note : les étoiles actuelles ont `r = 0.7 + rng() × 1.3`, donc `r > 1.8` en garde environ 15 %.

- [ ] **Step 4: Modifier `src/content/scene-panorama.tsx`**

1. Imports : `import { useArtStyle } from './art-setting';`, `import { GhibliMoon, GhibliSkyTexture, GhibliStarCrosses, GhibliSun, fadeStyle } from './ghibli-sky';`, `import { usePaintedSky, type PaintedSky } from './painted-sky';`.
2. Extraire les étoiles :

```tsx
export type Star = { i: number; x: number; y: number; r: number };
export const starsFor = (width: number, height: number, seed: number): Star[] => {
  const rng = mulberry32(seed ^ 0x57a45);
  return Array.from({ length: Math.round(width / 9) }, (_, i) => ({ i, x: rng() * width, y: rng() * height * 0.65, r: 0.7 + rng() * 1.3 }));
};
```

3. `SkyAndStars` reçoit `painted: PaintedSky | null` et `shown: boolean` (en plus de `SceneBodyProps`) ; `stars = useMemo(() => starsFor(width, height, seed), [width, height, seed])` ; après le `<rect data-sky-veil … />` ajouter :

```tsx
      {painted && <GhibliSkyTexture width={width} height={height} url={painted.texture} shown={shown} />}
```

et après le groupe des étoiles :

```tsx
      {painted && <GhibliStarCrosses stars={stars} opacity={sky.stars} shown={shown} />}
```

4. `Celestial` reçoit les mêmes `painted` et `shown`. Le soleil actuel devient `<g data-sun="" data-classic-sun="" transform=… style={fadeStyle(!shown)}>` (même contenu) ; la lune actuelle `<g data-moon="" data-classic-moon="" … style={fadeStyle(!shown)}>`. Puis, dans le même groupe `data-celestial` :

```tsx
      {painted && sun && <GhibliSun x={sun.x} y={sun.y} twilight={sky.twilight} painted={painted} shown={shown} />}
      {painted && moon && <GhibliMoon x={moon.x} y={moon.y} painted={painted} shown={shown} />}
```

5. `ScenePanoramaStaticView` :

```tsx
  const [art] = useArtStyle();
  const ghibli = art === 'ghibli' && scene === 'city';
  const painted = usePaintedSky(seed, ghibli);
  // Rendu dès que les images sont prêtes (même bascule désactivée, pour le fondu de sortie) ; montré seulement en Ghibli.
  const skyArt = scene === 'city' && painted.ready ? painted : null;
  const shown = ghibli && painted.ready;
```

et passer `painted={skyArt} shown={shown}` à `SkyAndStars` et `Celestial`.

Note : sous le graphisme classique, `skyArt` n'est non nul que si le ciel a déjà été peint dans cette session ; il est alors rendu à opacité 0 (fondu de sortie). Dans le test « autres scènes et graphisme classique », rien n'a été peint avant (la campagne ne peint pas), d'où l'absence de `[data-ghibli-sun]`. `SkyAndStars` et `Celestial` prennent le type `SceneBodyProps & { painted: PaintedSky | null; shown: boolean }`.

- [ ] **Step 5: Lancer les tests**

Run: `npx vitest run tests/content/ghibli-sky.test.tsx tests/content/scene-panorama.test.tsx tests/content/scene-nature.test.tsx tests/content/ghibli-city.test.tsx && npm run typecheck`
Expected: PASS (les tests existants qui cherchent `[data-sun]` / `[data-moon]` trouvent toujours les astres actuels).

- [ ] **Step 6: Commit**

```bash
git add src/content/ghibli-sky.tsx src/content/scene-panorama.tsx tests/content/ghibli-sky.test.tsx
git commit -m "feat(bibliotheque): ciel de la Ville peint (texture, étoiles, soleil et lune)"
```

---

### Task 8: Cumulus peints dans la couche météo

**Files:**
- Modify: `src/content/scene-weather.tsx`
- Test: `tests/content/ghibli-weather.test.tsx` (créé)

**Interfaces:**
- Consumes: Task 2 (`cloudStep`, `stepKey`, `CLOUD_KINDS`, `type CloudStep`), Task 6 (`usePaintedClouds`), `useArtStyle`, `fadeStyle` (Task 7).
- Produces : dans la couche météo, `<image id="{uid}-cloud-{k}">` (k = 0..11) dans `<defs>`, et dans chaque nuage de la réserve `<g data-cloud-classic>` (ellipses actuelles) + `<use data-cloud-painted href="#{uid}-cloud-{k}">`. Nouveau champ de `LoopInput` : `onStep: RefObject<((s: CloudStep) => void) | undefined>`.

- [ ] **Step 1: Écrire les tests**

```tsx
// @vitest-environment jsdom
// tests/content/ghibli-weather.test.tsx
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeArt } from '../../src/content/art-setting';
import { resetPaintQueueForTests, setJobRunnerForTests } from '../../src/content/paint-queue';
import { WeatherLayer } from '../../src/content/scene-weather';
import type { SceneId } from '../../src/core/library/library-types';
import type { Sky } from '../../src/core/library/sky';
import { createWeatherClock, steadySource } from '../../src/core/library/weather/weather-clock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const SKY: Sky = { phase: 'day', daylight: 1, twilight: 0, sunFrac: 0.5, moonFrac: null, stars: 0, top: '#6FB1E8', bottom: '#BFE0F5' };
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  vi.setSystemTime(new Date(2026, 5, 21, 14, 0));
  localStorage.clear();
  resetPaintQueueForTests();
  setJobRunnerForTests(async (j) => `data:image/png;base64,${btoa(j.key)}`);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setJobRunnerForTests(null);
  localStorage.clear();
  vi.useRealTimers();
});
type State = Parameters<typeof steadySource>[0];
export const flush = async (n = 60): Promise<void> => {
  for (let i = 0; i < n; i++) await act(async () => { await vi.advanceTimersByTimeAsync(40); });
};
const clockOf = (state: State) => {
  const clock = createWeatherClock();
  clock.setSource(steadySource(state), Date.now());
  return clock;
};
const mount = (clock: ReturnType<typeof clockOf>, scene: SceneId = 'city', extra: { gloom?: boolean } = {}): void =>
  act(() => root.render(<svg><WeatherLayer scene={scene} width={720} height={216} seed={1} sky={SKY} clock={clock} {...extra} /></svg>));
const hrefs = (): string[] => Array.from(container.querySelectorAll('defs image[id*="-cloud-"]')).map((n) => n.getAttribute('href') ?? '');

describe('cumulus peints', () => {
  it('Ghibli : 12 nuages peints dans les defs, chaque nuage de la réserve les utilise', async () => {
    writeArt('ghibli');
    mount(clockOf('cloudy'));
    await flush();
    expect(hrefs()).toHaveLength(12);
    const clouds = container.querySelectorAll('[data-wx-cloud]');
    expect(clouds.length).toBeGreaterThan(0);
    for (const c of Array.from(clouds)) expect(c.querySelector('use[data-cloud-painted]')).not.toBeNull();
  });

  it('la pluie change le cran : les images des nuages changent', async () => {
    writeArt('ghibli');
    mount(clockOf('sun'));
    await flush();
    const sunny = hrefs();
    mount(clockOf('rain'));
    await flush();
    expect(hrefs()).toHaveLength(12);
    expect(hrefs()).not.toEqual(sunny);
  });

  it('classique ou autre scène : aucun nuage peint', async () => {
    mount(clockOf('cloudy'));
    await flush();
    expect(container.querySelector('use[data-cloud-painted]')).toBeNull();
    writeArt('ghibli');
    mount(clockOf('cloudy'), 'countryside');
    await flush();
    expect(container.querySelector('use[data-cloud-painted]')).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer (échec attendu)**

Run: `npx vitest run tests/content/ghibli-weather.test.tsx`
Expected: FAIL (aucun `use[data-cloud-painted]`).

- [ ] **Step 3: Signaler le cran depuis la boucle**

Dans `src/content/scene-weather.tsx` :

1. Imports : `import { useState } from 'react';` (ajouter à l'import React existant), `import { CLOUD_KINDS, cloudStep, stepKey, type CloudStep } from '../core/library/paint/sky-painter';`, `import { useArtStyle } from './art-setting';`, `import { fadeStyle } from './ghibli-sky';`, `import { usePaintedClouds } from './painted-sky';`.
2. `type LoopInput` : ajouter `onStep: RefObject<((s: CloudStep) => void) | undefined>`.
3. Dans `useWeatherLoop`, lire `const onStepRef = input.onStep;`, déclarer `let lastStep = '';` à côté de `let lastPrecip = '';`, et dans `place()`, juste après le calcul de `cloudDark` :

```ts
      // Cran de couleur des nuages peints : signalé à React seulement quand il change (rare).
      const step = cloudStep(daylight, skyRef.current.twilight, cloudDark);
      const stepText = stepKey(step);
      if (stepText !== lastStep) {
        lastStep = stepText;
        onStepRef.current?.(step);
      }
```

(`onStepRef` n'entre pas dans les dépendances de l'effet : c'est une référence stable, comme `onWetRef`.)

- [ ] **Step 4: Dessiner les nuages peints**

Dans `WeatherLayerView`, après `const onWetRef = …` :

```tsx
  const [art] = useArtStyle();
  const ghibli = art === 'ghibli' && scene === 'city';
  const [step, setStep] = useState<CloudStep | null>(null);
  const onStepRef = useRef<((s: CloudStep) => void) | undefined>(setStep);
  const painted = usePaintedClouds(seed, ghibli ? step : null);
  const showPainted = ghibli && painted.ready;
```

Passer `onStep: onStepRef` dans l'objet donné à `useWeatherLoop`. Dans les `<defs>`, avant le groupe `id={`${uid}-strip`}` :

```tsx
          {painted.urls.map((url, k) => {
            const shape = painted.shapes[k]!;
            // Nuage centré en x, ventre à +10 (comme le bas des ellipses actuelles).
            return <image key={k} id={`${uid}-cloud-${k}`} href={url} x={-shape.w / 2} y={10 - shape.base} width={shape.w} height={shape.h} />;
          })}
```

et remplacer le contenu de chaque nuage de la réserve :

```tsx
              <g key={i} data-wx-cloud="" display="none" opacity={0} transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) scale(${c.s.toFixed(2)})`}>
                <g data-cloud-classic="" style={fadeStyle(!showPainted)}>
                  {CLOUD_BLOBS.map((b, j) => <ellipse key={j} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} />)}
                </g>
                {painted.ready && <use data-cloud-painted="" href={`#${uid}-cloud-${(((i + seed) % CLOUD_KINDS) + CLOUD_KINDS) % CLOUD_KINDS}`} style={fadeStyle(showPainted)} />}
              </g>
```

Le `fill` posé par la boucle sur chaque `[data-wx-cloud]` continue de colorer les ellipses (héritage) et n'a pas d'effet sur l'image.

- [ ] **Step 5: Lancer les tests**

Run: `npx vitest run tests/content/ghibli-weather.test.tsx tests/content/scene-weather.test.tsx && npm run typecheck`
Expected: PASS. Si `scene-weather.test.tsx` lit le nombre de nœuds `ellipse` par nuage, il les trouve toujours (dans `data-cloud-classic`).

- [ ] **Step 6: Commit**

```bash
git add src/content/scene-weather.tsx tests/content/ghibli-weather.test.tsx
git commit -m "feat(bibliotheque): cumulus peints qui défilent, teintés selon l'heure et la pluie"
```

---

### Task 9: Pluie, neige, brume, éclair et neige posée peints

**Files:**
- Modify: `src/content/scene-weather.tsx`, `src/content/RoomView.tsx` (ligne du `<WeatherLayer …>`, vers 402)
- Test: `tests/content/ghibli-weather.test.tsx` (ajouts)

**Interfaces:**
- Consumes: Task 5 (`boltPath`), Task 6 (`usePaintedFog`, `usePaintedSnow`), `FOG_W` (Task 3), `cityPaintPlan`, `gradeFor`, `gradeValues`, `lightningAt`, `targetOf`.
- Produces : prop `gloom?: boolean` de `WeatherLayer` ; `PatternDefs` reçoit `ghibli: boolean` ; motif `data-wx-pattern="fog"` ; éclair Ghibli = `<g data-wx="bolt">` contenant trois `<path data-wx-bolt-line="glow|core|filament">` ; neige posée Ghibli = `<g data-wx="snow-cover">` contenant `<image data-snow-tile>`.

- [ ] **Step 1: Ajouter les tests à `tests/content/ghibli-weather.test.tsx`**

Ajouter les imports `import { lightningAt } from '../../src/core/library/weather/weather-clock';`, `import { targetOf } from '../../src/core/library/weather/weather-types';`, `import { gradeFor, gradeValues } from '../../src/core/library/paint/grade';`, `import { tileCount } from '../../src/core/library/paint/city-painter';` et :

```tsx
describe('précipitations et phénomènes peints', () => {
  it('pluie en stries arrondies, neige en flocons doux', async () => {
    writeArt('ghibli');
    mount(clockOf('rain'));
    await flush(5);
    expect(container.querySelector('[data-wx-pattern="rain-near"] line')!.getAttribute('stroke-linecap')).toBe('round');
    expect(container.querySelector('[data-wx-pattern="snow-near"] circle')!.getAttribute('fill')).toMatch(/^url\(#/);
  });

  it('brume : motif peint qui dérive', async () => {
    writeArt('ghibli');
    mount(clockOf('fog'));
    await flush();
    const pattern = container.querySelector('[data-wx-pattern="fog"]')!;
    expect(container.querySelector('[data-wx="fog"]')!.getAttribute('fill')).toContain('url(#');
    const before = pattern.getAttribute('patternTransform');
    await flush(10);
    expect(pattern.getAttribute('patternTransform')).not.toBe(before);
  });

  it('éclair : trois traits superposés, même tracé', async () => {
    let t = Date.now();
    while (!lightningAt(targetOf('storm'), t, 1)) t += 50;
    vi.setSystemTime(t - 200);
    writeArt('ghibli');
    mount(clockOf('storm'));
    await flush(10);
    const lines = Array.from(container.querySelectorAll('[data-wx-bolt-line]'));
    expect(lines).toHaveLength(3);
    const d = lines.map((l) => l.getAttribute('d'));
    expect(d[0]).toMatch(/^M/);
    expect(new Set(d).size).toBe(1);
  });

  it('neige posée : tranches peintes, étalonnées, opacité selon la neige au sol', async () => {
    writeArt('ghibli');
    mount(clockOf('snow'), 'city', { gloom: true });
    await flush(120);
    const cover = container.querySelector('[data-wx="snow-cover"]')!;
    expect(cover.tagName.toLowerCase()).toBe('g');
    expect(cover.querySelectorAll('image[data-snow-tile]')).toHaveLength(tileCount(720));
    expect(Number(cover.getAttribute('opacity'))).toBeGreaterThan(0);
    expect(cover.querySelector('feColorMatrix')!.getAttribute('values')).toBe(gradeValues(gradeFor(1, 0, true)));
  });

  it('nœud de neige remplacé : la boucle suit le nouveau nœud', async () => {
    writeArt('ghibli');
    const clock = clockOf('snow');
    act(() => root.render(<svg><WeatherLayer scene="city" width={720} height={216} seed={1} sky={SKY} clock={clock} /></svg>));
    await flush(120);
    act(() => root.render(<svg><WeatherLayer scene="city" width={1080} height={216} seed={1} sky={SKY} clock={clock} /></svg>));
    await flush(120);
    const cover = container.querySelector('[data-wx="snow-cover"]')!;
    expect(cover.querySelectorAll('image[data-snow-tile]')).toHaveLength(tileCount(1080));
    expect(Number(cover.getAttribute('opacity'))).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Lancer (échec attendu)**

Run: `npx vitest run tests/content/ghibli-weather.test.tsx`
Expected: FAIL sur les nouveaux tests.

- [ ] **Step 3: Motifs de pluie et de neige**

`PatternDefs` prend `{ id, seed, ghibli }` ; ajouter dans son `useMemo` des stries Ghibli :

```ts
      streaks: Array.from({ length: 16 }, () => ({ x: rng() * TILE, y: rng() * TILE, l: 10 + rng() * 18, w: rng(), o: 0.3 + rng() * 0.5 })),
```

(à placer **après** `flakes` pour ne pas changer les tirages du dessin classique). Quand `ghibli` est vrai, rendre à la place des quatre motifs :

```tsx
      <radialGradient id={`${id}-flake`}>
        <stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
      </radialGradient>
      <pattern id={`${id}-rain-far`} data-wx-pattern="rain-far" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
        {streaks.slice(0, 10).map((m, i) => <line key={i} x1={m.x} y1={m.y} x2={m.x} y2={m.y + m.l * 0.65} stroke="#E6EDF7" strokeOpacity={m.o * 0.7} strokeWidth={0.5 + m.w * 0.4} strokeLinecap="round" />)}
      </pattern>
      <pattern id={`${id}-rain-near`} data-wx-pattern="rain-near" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
        {streaks.map((m, i) => <line key={i} x1={m.x} y1={m.y} x2={m.x} y2={m.y + m.l} stroke="#E6EDF7" strokeOpacity={m.o} strokeWidth={0.6 + m.w * 0.9} strokeLinecap="round" />)}
      </pattern>
      <pattern id={`${id}-snow-far`} data-wx-pattern="snow-far" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
        {flakes.slice(0, 8).map((f, i) => <circle key={i} cx={f.x} cy={f.y} r={f.r * 0.9} fill={`url(#${id}-flake)`} />)}
      </pattern>
      <pattern id={`${id}-snow-near`} data-wx-pattern="snow-near" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
        {flakes.map((f, i) => <circle key={i} cx={f.x} cy={f.y} r={f.r * 1.4} fill={`url(#${id}-flake)`} />)}
      </pattern>
```

Dans `WeatherLayerView`, rendre `<PatternDefs id={uid} seed={seed} ghibli={ghibli} />`.

- [ ] **Step 4: Brume peinte**

Dans `WeatherLayerView` : `const fogH = Math.round(height * 0.7);` et `const fogUrl = usePaintedFog(seed, fogH, ghibli);`. Dans les `<defs>` :

```tsx
          {ghibli && fogUrl !== '' && (
            <pattern id={`${uid}-fogp`} data-wx-pattern="fog" x={0} y={height * 0.3} width={FOG_W} height={fogH} patternUnits="userSpaceOnUse">
              <image href={fogUrl} width={FOG_W} height={fogH} preserveAspectRatio="none" />
            </pattern>
          )}
```

et le rectangle de brume devient `fill={ghibli && fogUrl !== '' ? `url(#${uid}-fogp)` : `url(#${uid}-fog)`}`. Dans `useWeatherLoop` : `patterns.fog = pat('fog')`, `let fogX = 0;` et dans `place()`, après la brume :

```ts
      // Brume peinte : bancs qui dérivent lentement (≈ 12 px/s), figés si moins de mouvement.
      if (patterns.fog && w.fog > 0) {
        fogX = (fogX + dt * 12) % FOG_W;
        put(patterns.fog, 'patternTransform', `translate(${fogX.toFixed(1)} 0)`);
      }
```

- [ ] **Step 5: Éclair à trois traits**

Rendu Ghibli de l'éclair (à la place du `<path data-wx="bolt" …>` quand `ghibli`) :

```tsx
        <g data-wx="bolt" opacity={0} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path data-wx-bolt-line="glow" d="M0 0" stroke="#C8D2FF" strokeOpacity={0.3} strokeWidth={8} />
          <path data-wx-bolt-line="core" d="M0 0" stroke="#E6EBFF" strokeOpacity={0.7} strokeWidth={3.5} />
          <path data-wx-bolt-line="filament" d="M0 0" stroke="#FFFFFF" strokeWidth={1.5} />
        </g>
```

Dans `useWeatherLoop` : `const boltLines = Array.from(el.querySelectorAll<SVGElement>('[data-wx-bolt-line]'));` et remplacer le bloc `if (nodes.bolt) { … }` par :

```ts
      if (nodes.bolt) {
        if (flash) {
          const x = flash.x * width;
          if (boltLines.length > 0) {
            const d = boltPath(x, height, Math.round(flash.x * 1e6));
            for (const line of boltLines) put(line, 'd', d);
          } else put(nodes.bolt, 'd', `M${x.toFixed(0)} 0 L${(x - 10).toFixed(0)} ${(height * 0.22).toFixed(0)} L${(x + 4).toFixed(0)} ${(height * 0.22).toFixed(0)} L${(x - 14).toFixed(0)} ${(height * 0.5).toFixed(0)}`);
          set(nodes.bolt, flash.strength);
        } else set(nodes.bolt, 0);
      }
```

(import `import { boltPath } from '../core/library/weather/bolt';`).

- [ ] **Step 6: Neige posée et `gloom`**

1. `Props` : ajouter `gloom?: boolean` (« ciel sombre : étalonnage de la neige posée peinte, comme la ville »). `WeatherLayerView` le lit (défaut `false`).
2. `const plan = useMemo(() => (ghibli ? cityPaintPlan(width, height, seed) : null), [ghibli, width, height, seed]);` puis `const snow = usePaintedSnow(plan);` (imports `cityPaintPlan`, `gradeFor`, `gradeValues`, `usePaintedFog`, `usePaintedSnow`, `FOG_W`).
3. Dans le groupe sol, remplacer le `<rect data-wx="snow-cover" …/>` par :

```tsx
        {ghibli && snow.ready ? (
          <g data-wx="snow-cover" opacity={0}>
            <filter id={`${uid}-grade`} colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values={gradeValues(gradeFor(sky.daylight, sky.twilight, gloom))} />
            </filter>
            <g filter={`url(#${uid}-grade)`}>
              {snow.tiles.map((t) => <image key={t.x} data-snow-tile={t.x} href={t.url} x={t.x} y={0} width={t.w} height={height} preserveAspectRatio="none" />)}
            </g>
          </g>
        ) : (
          <rect data-wx="snow-cover" x={0} y={ground} width={width} height={height - ground} fill="#F4F8FC" opacity={0} />
        )}
```

4. La boucle met ses nœuds en cache à son lancement : la relancer quand ils changent. Ajouter à `LoopInput` un champ `layout: string` et à la liste de dépendances de l'effet ; dans `WeatherLayerView` : `layout: `${ghibli}|${snow.ready}|${fogUrl !== ''}``. (Une relance remet les nuages à leur opacité cible sans fondu : acceptable, elle n'arrive qu'à la bascule et quand une peinture se termine.)
5. `src/content/RoomView.tsx` : ajouter `gloom={gloom}` au `<WeatherLayer … />`.

- [ ] **Step 7: Lancer les tests**

Run: `npx vitest run tests/content/ghibli-weather.test.tsx tests/content/scene-weather.test.tsx tests/content/library-weather-ui.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Suite complète et commit**

Run: `npm test && npm run typecheck`
Expected: PASS (aucune régression).

```bash
git add src/content/scene-weather.tsx src/content/RoomView.tsx tests/content/ghibli-weather.test.tsx
git commit -m "feat(bibliotheque): pluie, neige, brume, éclair et neige posée peints"
```

---

### Task 10: Banc, mesures, captures et validation

**Files:**
- Copier (non versionné) : `C:\Users\maxim\Downloads\Wikimasters tools\.superpowers\harness-ville\` → `C:\Users\maxim\Downloads\Wikimasters-ghibli\.superpowers\harness-ville\`
- Modifier (non versionné) : `.superpowers/harness-ville/main.tsx`, `vite.config.ts` du worktree

- [ ] **Step 1: Préparer le banc**

Copier le dossier, puis dans `vite.config.ts` du worktree : `port: 5216`. Dans `main.tsx` : lire `const wx = p.get('wx') as Parameters<typeof steadySource>[0] | null;`, créer une horloge `createWeatherClock()` + `setSource(steadySource(wx ?? 'sun'), Date.now())`, et ajouter dans le `<svg>` entre le décor et les acteurs : `<WeatherLayer scene="city" width={width} height={height} seed={seed} sky={sky} clock={clock} id="wx" groundId="wx-ground" gloom={wx === 'rain' || wx === 'storm'} />` (imports depuis `../../src/content/scene-weather` et `../../src/core/library/weather/weather-clock`). Lancer : `npx vite --config .superpowers/harness-ville/vite.config.ts` en arrière-plan.

- [ ] **Step 2: Mesurer**

Avec le Chrome sans interface (modèle `cap.mjs` : CDP sur le port 9333, sortie dans `C:\Users\maxim\Downloads\Wikimasters tools\.superpowers\captures-ghibli-g2\`), ouvrir `index.html?art=ghibli&wx=cloudy&w=3456&h=12` (96 colonnes ≈ 3456 px), `Emulation.setCPUThrottlingRate { rate: 4 }`, attendre la fin de la peinture (`document.querySelectorAll('use[data-cloud-painted]').length > 0`), puis mesurer pendant 5 s la durée moyenne entre deux `requestAnimationFrame` et la comparer à `art=classic`. Mesurer aussi le temps de peinture d'un jeu de nuages (`performance.now()` autour du passage de `wx=sun` à `wx=rain`). Consigner les chiffres dans le message final de PR. Si l'image moyenne dépasse 33 ms en Ghibli alors qu'elle reste sous 33 ms en classique : plafonner la réserve en Ghibli (`cloudPoolSize` × 0,5) dans `scene-weather.tsx`, ajouter un test, recommiter.

- [ ] **Step 3: Captures**

Captures `art=ghibli` (pièce de 1080 px et de 3456 px) : `h=12&wx=cloudy` (midi), `h=19.6&wx=cloudy` (coucher), `h=23&wx=sun` (nuit), `h=12&wx=rain`, `h=12&wx=snow` (attendre la neige au sol), `h=15&wx=storm` (`freeze=1`, instant d'un éclair), `h=9&wx=fog`, plus `art=classic&h=12&wx=cloudy` pour comparaison. Montrer les captures à l'utilisateur (outil d'envoi de fichiers, affichage) et **attendre sa validation** ; appliquer ses retours (nouvelles tâches courtes avec test si le code change) avant la tâche 11.

---

### Task 11: Livraison

- [ ] **Step 1: Vérifications finales**

Run: `npm test && npm run typecheck && npm run build`
Expected: PASS, build sans erreur.

- [ ] **Step 2: PR et fusion**

```bash
git push -u origin feat/bibliotheque-ghibli-g2
gh pr create --title "Bibliothèque Ghibli G2 : ciel vivant peint" --body "<résumé : ciel, nuages, pluie, neige, brume, éclair ; mesures du banc ; captures validées ; limites>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr merge --merge --delete-branch
```

- [ ] **Step 3: Pré-prod**

Depuis le dépôt principal à jour (`git -C "C:\Users\maxim\Downloads\Wikimasters tools" pull` seulement si son arbre est propre ; sinon worktree de pré-prod hors dépôt sur `origin/main`) : `npm run preprod`. Reconstruire l'extension (`npm run build`). APK seulement si l'utilisateur le demande.

- [ ] **Step 4: Mémoire**

Mettre à jour `project_ghibli.md` (G2 fusionnée, n° de PR, pré-prod, mesures, reste la vérification manuelle Chrome) et la ligne de `MEMORY.md`. Supprimer le worktree `..\Wikimasters-ghibli` une fois la branche fusionnée.
