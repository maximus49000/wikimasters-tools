# Décor Ghibli façon cellulo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** remplacer le décor fixe « gouache » de G1 par un décor cellulo (aplats, ombre nette, trait encré) avec un fond de colline étagée, des façades détaillées, une rue à trois tons, des platanes cernés, du mobilier peint, des fenêtres variées et des flaques de lumière la nuit — sans toucher à la géométrie ni au graphisme classique.

**Architecture:** même mécanique que G1 (plan pur → tranches peintes hors écran → `<image>` + filtre d'étalonnage + SVG de nuit). Le plan (`city-plan.ts`) gagne la colline, les repères et le mobilier ; le peintre (`city-painter.ts`) est réécrit en cellulo d'après la maquette validée ; `snow-painter.ts` et `sky-clip.ts` apprennent le toit zinc et la crête ; `ghibli-windows.tsx` s'enrichit et `ghibli-night.tsx` est créé.

**Tech Stack:** TypeScript, React 18, SVG, canvas 2D, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-11-bibliotheque-ghibli-decor-cellulo-design.md`.

## Global Constraints

- Graphisme classique inchangé ; géométrie (façades, fenêtres, entrées, locaux, mesures) inchangée.
- Aucun `Math.random` ; un élément à cheval sur deux tranches est peint à l'identique des deux côtés.
- `PAINT_VERSION` 2, `SNOW_VERSION` 3.
- Pas de fiche WikiHow, pas de mesures téléphone (campagne après G7).
- Commits terminés par `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## File Structure

- Modify `src/core/library/paint/paint-ctx.ts` : `arc`, `strokeRect`.
- Modify `src/core/library/paint/city-plan.ts` : `Look` étendu, `HillHouse`, `Landmark`, `Gull`, `Furniture`, `plan.hill`, `plan.furniture`, `hillCrestY`.
- Rewrite `src/core/library/paint/city-painter.ts` ; create `src/core/library/paint/cel.ts` (primitives cellulo : `shade`, `light`, `inkRect`, `inkPath`) ; create `src/core/library/paint/hill-painter.ts` (fond) ; delete `src/core/library/paint/strokes.ts` (+ son test).
- Modify `src/core/library/paint/snow-painter.ts`, `src/core/library/paint/sky-clip.ts`, `src/core/library/paint/grade.ts`.
- Modify `src/content/ghibli-windows.tsx` ; create `src/content/ghibli-night.tsx` ; modify `src/content/scene-city.tsx`.
- Tests : `tests/core/library/paint/recording-ctx.ts`, `paint-city-plan.test.ts`, `paint-city-painter.test.ts`, `paint-sky-clip.test.ts`, `paint-snow.test.ts`, `paint-hill.test.ts` (nouveau), `tests/content/ghibli-city.test.tsx`.

---

### Task 1: Plan étendu (colline, repères, mobilier, nouveaux détails de façade)

- [x] Tests : `hill` déterministe et stable au début quand la pièce grandit ; `hillCrestY` dans [0,16 ; 0,24] × hauteur, continue ; repères jamais deux fois la même position ; mobilier hors des entrées, locaux et troncs ; `Look` zinc présent sur certaines graines.
- [x] `city-plan.ts` : types, `lookOf` (zinc, antenna, pipe, laundry), `hillPlan(width, height, seed)`, `furnitureFor(...)`, `hillCrestY`.

### Task 2: Primitives cellulo et contexte

- [x] `paint-ctx.ts` (+ `recording-ctx.ts`) : `arc`, `strokeRect`.
- [x] `cel.ts` : `SUN`, `COOL`, `INK`, `shade`, `light`, `inkRect`, `strokePath`.

### Task 3: Peintre du fond (`hill-painter.ts`)

- [x] Test : rien au-dessus de la crête sauf mouettes (bande bornée) ; maison à cheval identique depuis deux tranches.
- [x] Colline, rangs de maisons, tour/dômes, mouettes, mur du fond (rang 4) en cellulo.

### Task 4: Peintre du premier plan réécrit (`city-painter.ts`)

- [x] Tests existants adaptés (points autorisés : colline sous la crête, mouettes) ; plus de `strokes.ts`.
- [x] Façades, toits, fenêtres, linge, balcon, gouttière, rue, platanes, mobilier.

### Task 5: Neige, découpe des nuages, étalonnage

- [x] `roofLineY` zinc ; `skylinePoints` avec crête ; neige sur la crête et les toits du fond ; `NIGHT` retouché ; tests.

### Task 6: Nuit en SVG

- [x] `ghibli-windows.tsx` : teintes, halo, silhouettes ; `ghibli-night.tsx` : flaques des lampadaires ; `scene-city.tsx` ; tests.

### Task 7: Captures, PR, pré-prod

- [x] Banc port 5221 : midi / coucher / 22 h / brume, 1080 et 3456, zoom ; comparaison à la maquette ; corrections.
- [ ] Suite de tests, build, PR, fusion, `npm run preprod`, extension reconstruite, mémoire.
