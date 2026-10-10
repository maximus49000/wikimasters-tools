# Graphisme Ghibli G1 (décor de ville peint) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une bascule globale « Graphisme Ghibli » qui remplace le décor fixe de la scène Ville (immeubles, toits, fenêtres éteintes, rue, arbres) par une peinture au pinceau numérique, étalonnée selon l'heure, avec des fenêtres allumées dessinées par-dessus.

**Architecture:** Un moteur de pinceau pur et déterministe (`src/core/library/paint/`) écrit dans une interface de dessin minimale ; un « plan » pur dérive l'apparence de chaque immeuble et la place des arbres des données existantes de la ville ; un peintre de tranche (360 px) traduit ce plan en coups de pinceau. Côté React, un hook peint les tranches pendant les temps morts dans un canvas hors écran, met les images en cache et `CityScene` les affiche (sous un filtre SVG d'étalonnage) à la place des immeubles et de la rue classiques, avec un fondu d'une seconde. Devantures, entrées, lampadaires, passants et véhicules restent dessinés comme aujourd'hui.

**Tech Stack:** TypeScript, React 18, SVG, Canvas 2D, Vitest (jsdom), WXT (extension), banc Vite + Chrome sans tête (CDP).

**Spec:** `docs/superpowers/specs/2026-10-10-bibliotheque-ghibli-design.md`

## Global Constraints

- Réglage local `wmt:library-art`, valeurs `classic` / `ghibli`, défaut `classic` ; valeur inconnue ou stockage inaccessible → `classic`. Aucune migration, état de la bibliothèque inchangé (v5).
- Bascule désactivée = rendu de la ville **strictement identique** à aujourd'hui (même JSX, même ordre).
- Le peintre lit les mêmes données que la ville : `cityFacades`, `doorsFor`, `shopSlotsFor`, `cityMetrics`. Il ne modifie aucune de ces fonctions.
- Rien de peint au-dessus de la silhouette des immeubles (toits peints DANS la hauteur `h`, débord d'avant-toit ≤ 1,5 px) ; arbres jamais devant une entrée ni une vitrine, couronne sous la silhouette.
- Tout tirage aléatoire du peintre passe par `mulberry32` / `hashString` (`src/core/library/scene-world.ts`) ; `Math.random` interdit dans `src/core/library/paint/`.
- Tranches de 360 px (`TILE = 360`), résolution `devicePixelRatio` plafonnée à 2, cache mémoire de 64 tranches au plus.
- Fondu de 1 s (`opacity 1s ease`) entre ville classique et ville peinte, dans les deux sens ; aucun fondu en mouvement réduit.
- Fenêtres allumées : mêmes positions et même logique que la ville classique (`lampLit`, `gloom && u < 0.55`, transition 4 s), attributs `data-lamp` / `data-far-lamp` / `data-lit`.
- Fiche WikiHow : id `bibliotheque-v27`.
- Commentaires et textes en français, comme le reste du code. Pas de `Co-Authored-By` manquant : chaque commit se termine par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests : `npx vitest run <fichiers> --maxWorkers=4` ; suite complète `npx vitest run --maxWorkers=2 --testTimeout=40000` ; `npm run typecheck`.

## File Structure

| Fichier | Rôle |
|---|---|
| `src/content/art-setting.ts` (créer) | Réglage local `wmt:library-art` + hook `useArtStyle` |
| `src/core/library/paint/color.ts` (créer) | Type `Rgb`, conversions, mélange, variation |
| `src/core/library/paint/paint-ctx.ts` (créer) | Interface `PaintCtx` (sous-ensemble du contexte Canvas 2D) |
| `src/core/library/paint/brush.ts` (créer) | Touche (`dab`), couverture (`washRect`), générateur par case (`cellRng`) |
| `src/core/library/paint/strokes.ts` (créer) | Tuiles, pavés, feuillage, vitre |
| `src/core/library/paint/city-plan.ts` (créer) | Plan pur : apparence des immeubles, fenêtres, arbres, zones interdites |
| `src/core/library/paint/city-painter.ts` (créer) | Peinture d'une tranche à partir du plan, clé de cache |
| `src/core/library/paint/grade.ts` (créer) | Matrice d'étalonnage selon jour / crépuscule / ciel couvert |
| `src/content/painted-city.ts` (créer) | Peinture canvas, grain, cache, ordonnanceur, hook `usePaintedCity` |
| `src/content/ghibli-windows.tsx` (créer) | Fenêtres allumées dessinées à la Ghibli |
| `src/content/scene-city.tsx` (modifier) | Branche Ghibli de `CityScene` |
| `src/content/LibraryPanel.tsx` (modifier) | Bouton 🎨 dans la rangée Ciel |
| `src/core/whats-new/entries.ts` (modifier) | Fiche `bibliotheque-v27` |
| `tests/core/library/paint/*.test.ts`, `tests/core/library/paint/recording-ctx.ts` (créer) | Tests du moteur, du plan, du peintre, de l'étalonnage |
| `tests/content/art-setting.test.ts`, `tests/content/ghibli-city.test.tsx`, `tests/content/library-art-ui.test.tsx` (créer) | Tests du réglage, de la scène, du bouton |
| `.superpowers/harness-ville/` (ignoré par git, copié depuis le dépôt principal) | Banc, mesure du filtre, captures |

---

### Task 1: Mesure du coût du filtre d'étalonnage (décision)

Tâche d'exploration jetable : le code vit dans `.superpowers/` (ignoré par git). Elle décide si l'étalonnage se fait par filtre SVG (suite du plan) ou s'il faut le repli « deux peintures ».

**Files:**
- Copy: `C:\Users\maxim\Downloads\Wikimasters tools\.superpowers\harness-ville\` → `C:\Users\maxim\Downloads\Wikimasters-ghibli\.superpowers\harness-ville\`
- Create: `.superpowers/harness-ville/bench.html`, `.superpowers/harness-ville/bench.tsx`, `.superpowers/harness-ville/bench.mjs`
- Create: `.superpowers/sdd/2026-10-10-ghibli-g1/progress.md`

**Interfaces:**
- Produces: une décision écrite dans `progress.md` : `FILTRE` ou `REPLI`.

- [ ] **Step 1: Préparer le worktree et le banc**

```bash
cd /c/Users/maxim/Downloads/Wikimasters-ghibli
cmd //c mklink /J node_modules "C:\Users\maxim\Downloads\Wikimasters tools\node_modules"
cp "/c/Users/maxim/Downloads/Wikimasters tools/.env.local" .env.local
npx wxt prepare
mkdir -p .superpowers/sdd/2026-10-10-ghibli-g1
cp -r "/c/Users/maxim/Downloads/Wikimasters tools/.superpowers/harness-ville" .superpowers/
sed -i 's/port: 5211/port: 5215/' .superpowers/harness-ville/vite.config.ts
```

- [ ] **Step 2: Écrire la page de mesure**

`.superpowers/harness-ville/bench.html` :

```html
<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Banc filtre</title>
<style>body{margin:0;background:#222} svg{display:block;width:100%;height:auto}</style></head>
<body><div id="root"></div><script type="module" src="./bench.tsx"></script></body></html>
```

`.superpowers/harness-ville/bench.tsx` : une image de bruit de la taille d'une pièce de 96 colonnes (2880 × 340, résolution 2), recopiée dans 4 fenêtres `<use>` comme dans `RoomView`, avec ou sans filtre, et les passants de la ville qui bougent par-dessus. Toutes les 2 s, les valeurs du filtre changent (comme à chaque minute).

```tsx
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SceneActors } from '../../src/content/scene-panorama';
import { dayContext } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { skyAt, sunTimes } from '../../src/core/library/sky';

const p = new URLSearchParams(location.search);
const withFilter = p.get('filter') === '1';
const W = 2880, H = 340;
const sky = skyAt(18 * 60, sunTimes({ y: 2026, m: 10, d: 5 }, { lat: 48.85, lon: 2.35 }, 120));
const city: CityContext = { minutes: 18 * 60, day: dayContext({ y: 2026, m: 10, d: 5 }, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };

function noiseUrl(): string {
  const c = document.createElement('canvas');
  c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d')!;
  const img = g.createImageData(c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) { img.data[i] = Math.random() * 255; img.data[i + 1] = Math.random() * 255; img.data[i + 2] = Math.random() * 255; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}
const url = noiseUrl();
const frames: number[] = [];
(window as unknown as { __frames: number[] }).__frames = frames;
let last = performance.now();
const loop = (t: number) => { frames.push(t - last); last = t; requestAnimationFrame(loop); };
requestAnimationFrame(loop);

function Bench() {
  const [k, setK] = useState(0);
  useEffect(() => { const id = setInterval(() => setK((v) => v + 1), 2000); return () => clearInterval(id); }, []);
  const a = 0.4 + (k % 2) * 0.5;
  return (
    <svg viewBox={`0 0 1300 700`}>
      <defs>
        <filter id="grade" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values={`${a} 0 0 0 0 0 ${a} 0 0 0 0 0 ${a + 0.1} 0 0 0 0 0 1 0`} /></filter>
        <clipPath id="w"><rect x={0} y={0} width={300} height={300} /></clipPath>
        <g id="world">
          <g filter={withFilter ? 'url(#grade)' : undefined}><image href={url} x={0} y={0} width={W} height={H} preserveAspectRatio="none" /></g>
          <SceneActors scene="city" width={W} height={H} sky={sky} minutes={18 * 60} seed={1} city={city} />
        </g>
      </defs>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${20 + i * 320} 20)`} clipPath="url(#w)">
          <use href="#world" x={-i * 700} />
        </g>
      ))}
    </svg>
  );
}
createRoot(document.getElementById('root')!).render(<Bench />);
```

- [ ] **Step 3: Écrire le script de mesure**

`.superpowers/harness-ville/bench.mjs` (Chrome sans tête piloté en CDP, comme `cap.mjs`, processeur ralenti ×4) :

```js
import { spawn } from 'node:child_process';
const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const proc = spawn(CH, ['--headless=new', '--remote-debugging-port=9335', '--user-data-dir=' + process.env.TEMP + '/benchprof', '--window-size=1300,900', 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const tabs = await (await fetch('http://127.0.0.1:9335/json')).json();
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value;
await send('Page.enable');
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
for (const filter of ['0', '1']) {
  await send('Page.navigate', { url: `http://127.0.0.1:5215/.superpowers/harness-ville/bench.html?filter=${filter}` });
  await new Promise((r) => setTimeout(r, 4000));
  await ev('window.__frames.length = 0');
  await new Promise((r) => setTimeout(r, 8000));
  const f = (await ev('JSON.stringify(window.__frames)')) ?? '[]';
  const xs = JSON.parse(f).sort((a, b) => a - b);
  const q = (k) => xs[Math.min(xs.length - 1, Math.floor(xs.length * k))]?.toFixed(1);
  console.log(`filtre=${filter} images=${xs.length} p50=${q(0.5)} ms p95=${q(0.95)} ms max=${xs.at(-1)?.toFixed(1)} ms`);
}
proc.kill();
process.exit(0);
```

- [ ] **Step 4: Lancer la mesure**

Run (deux terminaux, le serveur en arrière-plan) :

```bash
cd /c/Users/maxim/Downloads/Wikimasters-ghibli && npx vite -c .superpowers/harness-ville/vite.config.ts
node .superpowers/harness-ville/bench.mjs
```

Expected : deux lignes `filtre=0 …` et `filtre=1 …`.

- [ ] **Step 5: Décider et noter**

Règle : `FILTRE` si p95 avec filtre ≤ 1,25 × p95 sans filtre ET p95 avec filtre ≤ 50 ms ; sinon `REPLI`. Écrire dans `.superpowers/sdd/2026-10-10-ghibli-g1/progress.md` :

```markdown
# G1 — journal
## Tâche 1 : mesure du filtre
- sans filtre : p50=… p95=… max=…
- avec filtre : p50=… p95=… max=…
- Décision : FILTRE | REPLI
```

Si la décision est `REPLI` : s'arrêter et le signaler au contrôleur (le plan sera amendé pour les tâches 7 et 8 : une peinture de jour et une peinture de nuit fondues selon `daylight`). Aucun commit (fichiers ignorés par git).

---

### Task 2: Réglage du graphisme

**Files:**
- Create: `src/content/art-setting.ts`
- Test: `tests/content/art-setting.test.ts`

**Interfaces:**
- Produces: `ART_KEY = 'wmt:library-art'`, `type ArtStyle = 'classic' | 'ghibli'`, `readArt(): ArtStyle`, `writeArt(style: ArtStyle): void`, `subscribeArt(listener: () => void): () => void`, `useArtStyle(): [ArtStyle, (style: ArtStyle) => void]`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY, readArt, subscribeArt, writeArt } from '../../src/content/art-setting';

afterEach(() => {
  vi.restoreAllMocks();
  try { localStorage.removeItem(ART_KEY); } catch { /* */ }
});

describe('réglage du graphisme', () => {
  it('vaut « classic » par défaut', () => {
    expect(readArt()).toBe('classic');
  });
  it('écrit puis relit « ghibli »', () => {
    writeArt('ghibli');
    expect(localStorage.getItem(ART_KEY)).toBe('ghibli');
    expect(readArt()).toBe('ghibli');
  });
  it('une valeur inconnue vaut « classic »', () => {
    localStorage.setItem(ART_KEY, 'manga');
    expect(readArt()).toBe('classic');
  });
  it('stockage inaccessible : « classic », et l’écriture ne lève rien', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqué'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqué'); });
    expect(readArt()).toBe('classic');
    expect(() => writeArt('ghibli')).not.toThrow();
  });
  it('prévient les abonnés à chaque écriture', () => {
    const listener = vi.fn();
    const stop = subscribeArt(listener);
    writeArt('ghibli');
    stop();
    writeArt('classic');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/art-setting.test.ts --maxWorkers=4`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write minimal implementation**

```ts
import { useSyncExternalStore } from 'react';

// Graphisme de la Bibliothèque (vague Ghibli) : réglage LOCAL de l'appareil, global à toutes les pièces.
export const ART_KEY = 'wmt:library-art';
export type ArtStyle = 'classic' | 'ghibli';
const listeners = new Set<() => void>();

// Désactivé par défaut : seule la valeur « ghibli » l'active ; un stockage inaccessible laisse le graphisme classique.
export function readArt(): ArtStyle {
  try {
    return localStorage.getItem(ART_KEY) === 'ghibli' ? 'ghibli' : 'classic';
  } catch {
    return 'classic';
  }
}

export function writeArt(style: ArtStyle): void {
  try {
    localStorage.setItem(ART_KEY, style);
  } catch {
    /* stockage indisponible : réglage non conservé */
  }
  for (const listener of listeners) listener();
}

export function subscribeArt(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useArtStyle(): [ArtStyle, (style: ArtStyle) => void] {
  const style = useSyncExternalStore(subscribeArt, readArt, () => 'classic' as const);
  return [style, writeArt];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/content/art-setting.test.ts --maxWorkers=4`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/content/art-setting.ts tests/content/art-setting.test.ts
git commit -m "feat(bibliotheque): réglage local du graphisme (classique / Ghibli)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Moteur de pinceau (couleurs, contexte, touches)

**Files:**
- Create: `src/core/library/paint/color.ts`, `src/core/library/paint/paint-ctx.ts`, `src/core/library/paint/brush.ts`
- Create (aide de test): `tests/core/library/paint/recording-ctx.ts`
- Test: `tests/core/library/paint/paint-brush.test.ts`

**Interfaces:**
- Produces:
  - `type Rgb = readonly [number, number, number]`, `hexRgb(hex: string): Rgb`, `mixRgb(a: Rgb, b: Rgb, t: number): Rgb`, `jitter(c: Rgb, amount: number, rng: Rng): Rgb`, `rgba(c: Rgb, alpha: number): string`.
  - `type GradientLike = { addColorStop(offset: number, color: string): void }` et `interface PaintCtx` (voir code).
  - `type Rng = () => number`, `DAB_SPREAD = 1.15`, `dab(ctx, rng, x, y, r, color, alpha, elong?, rot?)`, `type Box = { x: number; y: number; w: number; h: number }`, `washRect(ctx, rng, box, opts: WashOpts)`, `cellRng(seed: number, salt: string, i: number, j: number): Rng`.
  - Test : `recordingCtx(): RecordingCtx` avec `ops: { op: string; args: number[] }[]`, `points: [number, number][]`, `fills: string[]`.

- [ ] **Step 1: Write the recording context helper**

`tests/core/library/paint/recording-ctx.ts` :

```ts
import type { GradientLike, PaintCtx } from '../../../../src/core/library/paint/paint-ctx';

// Faux contexte : enregistre chaque appel, chaque point touché (boîte englobante pour ellipses et rectangles) et la couleur de
// chaque remplissage. Le moteur n'utilise aucune transformation : les points sont donc en coordonnées du monde.
export type Op = { op: string; args: number[] };
export type RecordingCtx = PaintCtx & { ops: Op[]; points: [number, number][]; fills: string[] };

export function recordingCtx(): RecordingCtx {
  const ops: Op[] = [];
  const points: [number, number][] = [];
  const fills: string[] = [];
  const log = (op: string, args: number[] = []): void => void ops.push({ op, args });
  const pt = (x: number, y: number): void => void points.push([x, y]);
  const ctx: RecordingCtx = {
    ops,
    points,
    fills,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save: () => log('save'),
    restore: () => log('restore'),
    beginPath: () => log('beginPath'),
    closePath: () => log('closePath'),
    moveTo: (x, y) => { log('moveTo', [x, y]); pt(x, y); },
    lineTo: (x, y) => { log('lineTo', [x, y]); pt(x, y); },
    quadraticCurveTo: (cx, cy, x, y) => { log('quadraticCurveTo', [cx, cy, x, y]); pt(cx, cy); pt(x, y); },
    ellipse: (x, y, rx, ry, rot, a0, a1) => { log('ellipse', [x, y, rx, ry, rot, a0, a1]); const m = Math.max(rx, ry); pt(x - m, y - m); pt(x + m, y + m); },
    rect: (x, y, w, h) => { log('rect', [x, y, w, h]); pt(x, y); pt(x + w, y + h); },
    fill: () => { log('fill'); fills.push(String(ctx.fillStyle)); },
    stroke: () => log('stroke'),
    clip: () => log('clip'),
    fillRect: (x, y, w, h) => { log('fillRect', [x, y, w, h]); pt(x, y); pt(x + w, y + h); fills.push(String(ctx.fillStyle)); },
    createLinearGradient: (x0, y0, x1, y1): GradientLike => { log('gradient', [x0, y0, x1, y1]); return { addColorStop: () => undefined }; },
  };
  return ctx;
}
```

- [ ] **Step 2: Write the failing test**

`tests/core/library/paint/paint-brush.test.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cellRng, dab, DAB_SPREAD, washRect } from '../../../../src/core/library/paint/brush';
import { hexRgb, jitter, mixRgb, rgba } from '../../../../src/core/library/paint/color';
import { mulberry32 } from '../../../../src/core/library/scene-world';
import { recordingCtx } from './recording-ctx';

afterEach(() => vi.restoreAllMocks());

describe('couleurs', () => {
  it('convertit, mélange et formate', () => {
    expect(hexRgb('#FF8000')).toEqual([255, 128, 0]);
    expect(mixRgb([0, 0, 0], [200, 100, 50], 0.5)).toEqual([100, 50, 25]);
    expect(mixRgb([0, 0, 0], [200, 100, 50], 2)).toEqual([200, 100, 50]);
    expect(rgba([1, 2, 3], 0.25)).toBe('rgba(1,2,3,0.25)');
  });
  it('la variation reste dans 0..255', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 100; i++) for (const v of jitter([250, 5, 128], 40, rng)) expect(v >= 0 && v <= 255).toBe(true);
  });
});

describe('touche', () => {
  it('même graine → mêmes tracés', () => {
    const a = recordingCtx();
    const b = recordingCtx();
    dab(a, mulberry32(9), 10, 20, 2, [10, 20, 30], 0.5);
    dab(b, mulberry32(9), 10, 20, 2, [10, 20, 30], 0.5);
    expect(a.ops).toEqual(b.ops);
    expect(a.fills).toEqual(['rgba(10,20,30,0.5)']);
  });
  it('reste dans r × allongement × DAB_SPREAD autour du centre', () => {
    const ctx = recordingCtx();
    const rng = mulberry32(4);
    for (let i = 0; i < 200; i++) dab(ctx, rng, 50, 50, 3, [0, 0, 0], 1, 1.6);
    const reach = 3 * 1.6 * DAB_SPREAD + 1e-9;
    for (const [x, y] of ctx.points) expect(Math.hypot(x - 50, y - 50)).toBeLessThanOrEqual(reach);
  });
});

describe('couverture', () => {
  it('aucun point hors du rectangle, densité respectée', () => {
    const ctx = recordingCtx();
    washRect(ctx, mulberry32(1), { x: 10, y: 20, w: 40, h: 30 }, { color: () => [100, 100, 100], density: 0.5, r: [0.5, 1.2], alpha: 0.3 });
    for (const [x, y] of ctx.points) {
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(50);
      expect(y).toBeGreaterThanOrEqual(20);
      expect(y).toBeLessThanOrEqual(50);
    }
    expect(ctx.fills.length).toBe(600);
  });
  it('rectangle plus petit que la touche : rien', () => {
    const ctx = recordingCtx();
    washRect(ctx, mulberry32(1), { x: 0, y: 0, w: 2, h: 2 }, { color: () => [0, 0, 0], density: 1, r: [1, 2], alpha: 1 });
    expect(ctx.ops).toEqual([]);
  });
});

describe('générateur par case', () => {
  it('même case → même suite ; case voisine → autre suite', () => {
    const a = cellRng(7, 'pavé', 3, 4);
    const b = cellRng(7, 'pavé', 3, 4);
    const c = cellRng(7, 'pavé', 3, 5);
    const sa = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(sa);
    expect([c(), c(), c()]).not.toEqual(sa);
  });
});

describe('déterminisme', () => {
  it('n’utilise jamais Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random interdit'); });
    const ctx = recordingCtx();
    washRect(ctx, mulberry32(2), { x: 0, y: 0, w: 30, h: 30 }, { color: () => [1, 1, 1], density: 0.2, r: [0.5, 1], alpha: 1 });
    expect(ctx.fills.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/core/library/paint/paint-brush.test.ts --maxWorkers=4`
Expected: FAIL (modules introuvables).

- [ ] **Step 4: Write the implementation**

`src/core/library/paint/color.ts` :

```ts
// Couleurs du peintre (vague Ghibli) : triplets 0..255, sans dépendance au DOM.
export type Rgb = readonly [number, number, number];
type Rng = () => number;

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

export function hexRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return [clamp255(a[0] + (b[0] - a[0]) * k), clamp255(a[1] + (b[1] - a[1]) * k), clamp255(a[2] + (b[2] - a[2]) * k)];
}

// Variation de teinte d'une touche (± amount par canal).
export function jitter(c: Rgb, amount: number, rng: Rng): Rgb {
  return [clamp255(c[0] + (rng() * 2 - 1) * amount), clamp255(c[1] + (rng() * 2 - 1) * amount), clamp255(c[2] + (rng() * 2 - 1) * amount)];
}

export function rgba(c: Rgb, alpha: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${Number(alpha.toFixed(3))})`;
}
```

`src/core/library/paint/paint-ctx.ts` :

```ts
// Sous-ensemble du contexte Canvas 2D utilisé par le peintre. Un vrai CanvasRenderingContext2D le satisfait ; les tests
// passent un faux contexte qui enregistre les appels. Aucune transformation n'est utilisée par le moteur : tout est
// tracé en coordonnées du monde (la tranche est décalée par l'appelant).
export type GradientLike = { addColorStop(offset: number, color: string): void };

export interface PaintCtx {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  globalAlpha: number;
  globalCompositeOperation: string;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike;
}
```

`src/core/library/paint/brush.ts` :

```ts
import { hashString, mulberry32 } from '../scene-world';
import { jitter, rgba, type Rgb } from './color';
import type { PaintCtx } from './paint-ctx';

export type Rng = () => number;
export type Box = { x: number; y: number; w: number; h: number };

// Portée maximale d'une touche : rayon × allongement × DAB_SPREAD (déformation des sommets).
export const DAB_SPREAD = 1.15;

// Touche de gouache : heptagone déformé, allongé et orienté. Aucune transformation du contexte : sommets calculés.
export function dab(ctx: PaintCtx, rng: Rng, x: number, y: number, r: number, color: Rgb, alpha: number, elong = 1.6, rot?: number): void {
  const a = rot ?? rng() * Math.PI;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const t = (i / 7) * Math.PI * 2;
    const k = 0.72 + rng() * (DAB_SPREAD - 0.72);
    const px = Math.cos(t) * r * elong * k;
    const py = Math.sin(t) * r * k;
    const X = x + px * ca - py * sa;
    const Y = y + px * sa + py * ca;
    if (i === 0) ctx.moveTo(X, Y);
    else ctx.lineTo(X, Y);
  }
  ctx.closePath();
  ctx.fillStyle = rgba(color, alpha);
  ctx.fill();
}

export type WashOpts = { color: (x: number, y: number) => Rgb; density: number; r: [number, number]; alpha: number; elong?: number; rot?: number; jitter?: number };

// Couvre un rectangle de touches. Les centres sont tirés dans le rectangle rétréci de la portée maximale : rien ne déborde.
// `density` = touches par px² du rectangle.
export function washRect(ctx: PaintCtx, rng: Rng, box: Box, opts: WashOpts): void {
  const elong = opts.elong ?? 1.6;
  const m = opts.r[1] * elong * DAB_SPREAD;
  const x0 = box.x + m;
  const x1 = box.x + box.w - m;
  const y0 = box.y + m;
  const y1 = box.y + box.h - m;
  if (x1 <= x0 || y1 <= y0) return;
  const n = Math.round(box.w * box.h * opts.density);
  for (let i = 0; i < n; i++) {
    const x = x0 + rng() * (x1 - x0);
    const y = y0 + rng() * (y1 - y0);
    const r = opts.r[0] + rng() * (opts.r[1] - opts.r[0]);
    dab(ctx, rng, x, y, r, jitter(opts.color(x, y), opts.jitter ?? 8, rng), opts.alpha, elong, opts.rot);
  }
}

// Générateur propre à une case d'une grille du monde : deux tranches voisines tirent la même chose sur leur bord commun.
export function cellRng(seed: number, salt: string, i: number, j: number): Rng {
  return mulberry32((((seed ^ hashString(salt)) + Math.imul(i, 73856093)) ^ Math.imul(j, 19349663)) >>> 0);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/core/library/paint/paint-brush.test.ts --maxWorkers=4`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/library/paint tests/core/library/paint
git commit -m "feat(bibliotheque): moteur de pinceau déterministe (touches, couverture, couleurs)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Traits de peinture (tuiles, pavés, feuillage, vitre)

**Files:**
- Create: `src/core/library/paint/strokes.ts`
- Test: `tests/core/library/paint/paint-strokes.test.ts`

**Interfaces:**
- Consumes: `dab`, `cellRng`, `DAB_SPREAD`, `Box`, `Rng` (Task 3) ; `Rgb`, `mixRgb`, `jitter`, `rgba`, `hexRgb`.
- Produces:
  - `roofTiles(ctx, rng, box: Box, base: Rgb, peakX: number, tileW: number, rowH: number): void` — ellipses entièrement dans `box` (l'appelant découpe la forme du toit).
  - `cobbles(ctx, seed: number, area: Box, rowH0: number, growth: number, base: Rgb): void` — rangées globales depuis `area.y`, couleur par case (`cellRng`).
  - `type Crown = { cx: number; cy: number; r: number }`, `foliage(ctx, rng, crown: Crown, unit: number): void` — tout point à moins de `crown.r` du centre.
  - `glass(ctx, rng, win: Box, curtain: boolean): void` — tout dans `win`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { cobbles, foliage, glass, roofTiles } from '../../../../src/core/library/paint/strokes';
import { mulberry32 } from '../../../../src/core/library/scene-world';
import { recordingCtx } from './recording-ctx';

const inBox = (pts: [number, number][], b: { x: number; y: number; w: number; h: number }, eps = 1e-6) =>
  pts.every(([x, y]) => x >= b.x - eps && x <= b.x + b.w + eps && y >= b.y - eps && y <= b.y + b.h + eps);

describe('tuiles', () => {
  it('toutes dans la boîte, versant gauche plus clair', () => {
    const ctx = recordingCtx();
    const box = { x: 10, y: 5, w: 40, h: 14 };
    roofTiles(ctx, mulberry32(1), box, [198, 90, 48], 30, 3.2, 2.2);
    expect(ctx.fills.length).toBeGreaterThan(40);
    expect(inBox(ctx.points, box)).toBe(true);
  });
});

describe('pavés', () => {
  it('même couleur pour le même pavé, peint depuis deux tranches voisines', () => {
    const a = recordingCtx();
    const b = recordingCtx();
    cobbles(a, 3, { x: 0, y: 260, w: 100, h: 60 }, 2.2, 0.12, [182, 160, 124]);
    cobbles(b, 3, { x: 80, y: 260, w: 120, h: 60 }, 2.2, 0.12, [182, 160, 124]);
    const byCenter = (ctx: ReturnType<typeof recordingCtx>) => {
      const out = new Map<string, string>();
      let fill = 0;
      for (const o of ctx.ops) {
        if (o.op === 'ellipse') out.set(`${o.args[0]!.toFixed(2)},${o.args[1]!.toFixed(2)},${o.args[2]!.toFixed(2)}`, ctx.fills[fill] ?? '');
        if (o.op === 'fill') fill++;
      }
      return out;
    };
    const ma = byCenter(a);
    const mb = byCenter(b);
    let shared = 0;
    for (const [k, v] of ma) if (mb.has(k)) { shared++; expect(mb.get(k)).toBe(v); }
    expect(shared).toBeGreaterThan(5);
  });
  it('les rangées grandissent vers le bas', () => {
    const ctx = recordingCtx();
    cobbles(ctx, 1, { x: 0, y: 0, w: 60, h: 80 }, 2, 0.2, [150, 130, 100]);
    const ry = ctx.ops.filter((o) => o.op === 'ellipse').map((o) => [o.args[1]!, o.args[3]!] as const);
    const top = ry.filter(([y]) => y < 10).map(([, r]) => r);
    const bottom = ry.filter(([y]) => y > 60).map(([, r]) => r);
    expect(Math.max(...bottom)).toBeGreaterThan(Math.max(...top));
  });
});

describe('feuillage', () => {
  it('tout dans la couronne', () => {
    const ctx = recordingCtx();
    foliage(ctx, mulberry32(5), { cx: 100, cy: 80, r: 18 }, 1);
    expect(ctx.fills.length).toBeGreaterThan(100);
    for (const [x, y] of ctx.points) expect(Math.hypot(x - 100, y - 80)).toBeLessThanOrEqual(18 + 1e-6);
  });
});

describe('vitre', () => {
  it('tout dans la fenêtre, avec ou sans rideau', () => {
    for (const curtain of [true, false]) {
      const ctx = recordingCtx();
      const win = { x: 20, y: 30, w: 5, h: 7 };
      glass(ctx, mulberry32(2), win, curtain);
      expect(inBox(ctx.points, win)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/library/paint/paint-strokes.test.ts --maxWorkers=4`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write the implementation**

```ts
import { cellRng, dab, DAB_SPREAD, type Box, type Rng } from './brush';
import { hexRgb, jitter, mixRgb, rgba, type Rgb } from './color';
import type { PaintCtx } from './paint-ctx';

const LIGHT = hexRgb('#F2A070');
const SHADE = hexRgb('#4A2030');

// Rangs de tuiles canal (demi-ellipses), décalés d'un rang à l'autre ; le versant à gauche du faîtage est éclairé.
// Chaque ellipse tient entièrement dans `box` ; l'appelant découpe la forme du toit (clip).
export function roofTiles(ctx: PaintCtx, rng: Rng, box: Box, base: Rgb, peakX: number, tileW: number, rowH: number): void {
  const rx = tileW / 2;
  const ry = rowH * 0.75;
  let row = 0;
  for (let y = box.y + ry; y <= box.y + box.h - ry; y += rowH, row++) {
    const shift = (row % 2) * rx;
    for (let x = box.x + rx + shift; x <= box.x + box.w - rx; x += tileW) {
      const lit = x < peakX;
      const c = jitter(mixRgb(base, lit ? LIGHT : SHADE, lit ? 0.18 : 0.14), 14, rng);
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI);
      ctx.fillStyle = rgba(c, 1);
      ctx.fill();
    }
  }
}

// Rue pavée : rangées dont la hauteur grandit vers le premier plan ; grille globale (indépendante de la tranche), couleur
// tirée par case : deux tranches voisines peignent les mêmes pavés sur leur bord commun.
export function cobbles(ctx: PaintCtx, seed: number, area: Box, rowH0: number, growth: number, base: Rgb): void {
  const dark = mixRgb(base, [60, 45, 30], 0.35);
  let y = area.y;
  for (let k = 0; y < area.y + area.h; k++) {
    const rh = rowH0 + k * growth;
    const cw = rh * 2.1;
    const off = ((k * 7) % 5) * cw * 0.2;
    const j0 = Math.floor((area.x - off) / cw) - 1;
    const j1 = Math.ceil((area.x + area.w - off) / cw) + 1;
    for (let j = j0; j <= j1; j++) {
      const rng = cellRng(seed, 'cobble', k, j);
      const cx = off + j * cw + cw / 2;
      const cy = y + rh / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw / 2 - 0.4, rh / 2 - 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(jitter(mixRgb(base, dark, rng()), 12, rng), 1);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - cw * 0.08, cy - rh * 0.18, cw * 0.28, rh * 0.14, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba([255, 245, 220], 0.22);
      ctx.fill();
    }
    y += rh + 0.4;
  }
}

export type Crown = { cx: number; cy: number; r: number };
const LEAF = { deep: hexRgb('#1E3E22'), dark: hexRgb('#2E5E2A'), mid: hexRgb('#5E9A3E'), light: hexRgb('#C8DC7A') };

// Feuillage par masses : grappes sombres au cœur, claires en haut à gauche (lumière du soleil), quelques trouées de ciel.
// Tout point reste à moins de `crown.r` du centre.
export function foliage(ctx: PaintCtx, rng: Rng, crown: Crown, unit: number): void {
  const rMax = 1.6 * unit;
  const elong = 1.7;
  const reach = rMax * elong * DAB_SPREAD;
  const clusters: Crown[] = [];
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * crown.r * 0.45;
    clusters.push({ cx: crown.cx + Math.cos(a) * d, cy: crown.cy + Math.sin(a) * d, r: crown.r * (0.5 + rng() * 0.05) });
  }
  clusters.sort((p, q) => q.cy - p.cy);
  for (const c of clusters) {
    const room = Math.min(c.r, crown.r - Math.hypot(c.cx - crown.cx, c.cy - crown.cy)) - reach;
    if (room <= 0) continue;
    const n = Math.round(room * room * 1.4);
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * room;
      const x = c.cx + Math.cos(a) * d;
      const y = c.cy + Math.sin(a) * d;
      let l = 0.55 - (y - c.cy) / (2 * room) - ((x - c.cx) / (2 * room)) * 0.6;
      l = Math.max(0, Math.min(1, l));
      const col = l < 0.35 ? mixRgb(LEAF.deep, LEAF.dark, l / 0.35) : l < 0.7 ? mixRgb(LEAF.dark, LEAF.mid, (l - 0.35) / 0.35) : mixRgb(LEAF.mid, LEAF.light, (l - 0.7) / 0.3);
      dab(ctx, rng, x, y, (0.6 + rng() * 1) * unit, jitter(col, 10, rng), 0.85, elong);
    }
  }
}

const GLASS_TOP = '#BFE0F0';
const GLASS_MID = '#5E93BE';
const GLASS_LOW = '#2E4E6E';

// Vitre éteinte : cadre sombre, verre qui reflète le ciel (dégradé + reflet en diagonale), croisillon, rideaux éventuels.
export function glass(ctx: PaintCtx, rng: Rng, win: Box, curtain: boolean): void {
  const { x, y, w, h } = win;
  ctx.fillStyle = '#3A2A22';
  ctx.fillRect(x, y, w, h);
  const f = Math.min(0.6, w * 0.12);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, GLASS_TOP);
  g.addColorStop(0.5, GLASS_MID);
  g.addColorStop(1, GLASS_LOW);
  ctx.fillStyle = g;
  ctx.fillRect(x + f, y + f, w - 2 * f, h - 2 * f);
  ctx.beginPath();
  ctx.moveTo(x + f, y + h * 0.25);
  ctx.lineTo(x + w * 0.55, y + f);
  ctx.lineTo(x + w * 0.8, y + f);
  ctx.lineTo(x + f, y + h * 0.6);
  ctx.closePath();
  ctx.fillStyle = rgba([255, 255, 255], 0.3 + rng() * 0.1);
  ctx.fill();
  ctx.fillStyle = '#3A2A22';
  ctx.fillRect(x + w / 2 - f / 2, y, f, h);
  ctx.fillRect(x, y + h * 0.45, w, f);
  if (curtain) {
    ctx.fillStyle = rgba([250, 240, 225], 0.85);
    ctx.beginPath();
    ctx.moveTo(x + f, y + f);
    ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.5, x + f, y + h - f);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + w - f, y + f);
    ctx.quadraticCurveTo(x + w * 0.7, y + h * 0.5, x + w - f, y + h - f);
    ctx.closePath();
    ctx.fill();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/library/paint --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/paint/strokes.ts tests/core/library/paint/paint-strokes.test.ts
git commit -m "feat(bibliotheque): traits peints (tuiles, pavés, feuillage, vitres)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Plan de la ville peinte (apparence, fenêtres, arbres)

**Files:**
- Create: `src/core/library/paint/city-plan.ts`
- Test: `tests/core/library/paint/paint-city-plan.test.ts`

**Interfaces:**
- Consumes: `cityFacades` (`src/core/library/city/facades.ts`), `doorsFor`, `DOOR_WIDTH`, `DOOR_MARGIN` (`src/core/library/city/doors.ts`), `shopSlotsFor` (`src/core/library/city/shops/slots.ts`), `cityMetrics` (`src/core/library/city/metrics.ts`), `GROUND_FLOOR`, `FAR_WINDOW` (`facades.ts`), `mulberry32`, `hashString`.
- Produces:

```ts
export type Win = { x: number; y: number; w: number; h: number; dormer: boolean; curtain: boolean };
export type Look = { wall: Rgb; roof: Rgb; roofKind: 'gable' | 'mansard'; roofH: number; shutters: Rgb | null; boxes: boolean; balconyRow: number | null; ivy: 'left' | 'right' | null; chimney: number | null };
export type PaintBuilding = { id: number; x: number; w: number; top: number; far: boolean; wins: Win[]; look: Look };
export type Tree = { id: number; x: number; base: number; cy: number; r: number };
export type Span = { x0: number; x1: number };
export type CityPaintPlan = { width: number; height: number; seed: number; ground: number; curb: number; farSide: number; laneMark: number; unit: number; buildings: PaintBuilding[]; trees: Tree[]; blocked: Span[] };
export const ROOF_H = 14;
export const FAR_ROOF_H = 6;
export function cityPaintPlan(width: number, height: number, seed: number): CityPaintPlan;
export function silhouetteTop(plan: CityPaintPlan, x: number): number; // y du haut de la silhouette en x (ground si aucun immeuble)
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { doorsFor } from '../../../../src/core/library/city/doors';
import { cityFacades, GROUND_FLOOR } from '../../../../src/core/library/city/facades';
import { cityPaintPlan, ROOF_H, silhouetteTop } from '../../../../src/core/library/paint/city-plan';

describe('plan de la ville peinte', () => {
  for (const seed of [1, 7, 42]) {
    const plan = cityPaintPlan(1080, 340, seed);
    const facades = cityFacades(1080, 340, seed);

    it(`graine ${seed} : un immeuble peint par façade, mêmes positions`, () => {
      expect(plan.buildings.length).toBe(facades.length);
      plan.buildings.forEach((b, i) => {
        expect(b.x).toBe(facades[i]!.x);
        expect(b.w).toBe(facades[i]!.w);
        expect(b.top).toBeCloseTo(plan.ground - facades[i]!.h, 6);
        expect(b.far).toBe(facades[i]!.far);
      });
    });

    it(`graine ${seed} : fenêtres = lampes (premier plan) ou fenêtres du fond, lucarnes dans le toit`, () => {
      plan.buildings.forEach((b, i) => {
        const f = facades[i]!;
        expect(b.wins.length).toBe(b.far ? f.farWindows.length : f.lamps.length);
        if (!b.far) for (const w of b.wins) expect(w.dormer).toBe(w.y < b.top + ROOF_H);
      });
    });

    it(`graine ${seed} : arbres hors des entrées et des locaux, couronne sous la silhouette`, () => {
      const doors = doorsFor(1080, 340, seed);
      for (const t of plan.trees) {
        const trunk = { x0: t.x - 2 * plan.unit, x1: t.x + 2 * plan.unit };
        for (const s of plan.blocked) expect(trunk.x1 <= s.x0 || trunk.x0 >= s.x1).toBe(true);
        for (const d of doors) expect(trunk.x1 <= d.x || trunk.x0 >= d.x + 12).toBe(true);
        expect(t.cy + t.r).toBeLessThanOrEqual(plan.ground - GROUND_FLOOR - 1 + 1e-9);
        for (let x = t.x - t.r; x <= t.x + t.r; x += 1) expect(t.cy - t.r).toBeGreaterThanOrEqual(silhouetteTop(plan, x) + 2 - 1e-9);
      }
    });
  }

  it('déterministe, et dépend de la graine', () => {
    expect(cityPaintPlan(720, 340, 3)).toEqual(cityPaintPlan(720, 340, 3));
    expect(cityPaintPlan(720, 340, 3).buildings.map((b) => b.look)).not.toEqual(cityPaintPlan(720, 340, 4).buildings.map((b) => b.look));
  });

  it('agrandir la pièce garde les immeubles et les arbres du début', () => {
    const small = cityPaintPlan(720, 340, 1);
    const large = cityPaintPlan(1080, 340, 1);
    expect(large.buildings.slice(0, 4)).toEqual(small.buildings.slice(0, 4));
    expect(large.trees.filter((t) => t.x < 300)).toEqual(small.trees.filter((t) => t.x < 300));
  });

  it('au moins un arbre sur une rue de 2880 px', () => {
    expect(cityPaintPlan(2880, 340, 1).trees.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/library/paint/paint-city-plan.test.ts --maxWorkers=4`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write the implementation**

```ts
import { doorsFor, DOOR_MARGIN, DOOR_WIDTH } from '../city/doors';
import { cityFacades, FAR_WINDOW, GROUND_FLOOR } from '../city/facades';
import { cityMetrics } from '../city/metrics';
import { shopSlotsFor } from '../city/shops/slots';
import { hashString, mulberry32 } from '../scene-world';
import { hexRgb, type Rgb } from './color';

// Plan de la ville peinte (vague Ghibli) : tout ce que le peintre doit savoir, dérivé des MÊMES données que la ville
// classique (façades, entrées, locaux, mesures de la rue). Pur et déterministe ; aucun tirage ne change ceux de la ville.

export type Win = { x: number; y: number; w: number; h: number; dormer: boolean; curtain: boolean };
export type Look = { wall: Rgb; roof: Rgb; roofKind: 'gable' | 'mansard'; roofH: number; shutters: Rgb | null; boxes: boolean; balconyRow: number | null; ivy: 'left' | 'right' | null; chimney: number | null };
export type PaintBuilding = { id: number; x: number; w: number; top: number; far: boolean; wins: Win[]; look: Look };
export type Tree = { id: number; x: number; base: number; cy: number; r: number };
export type Span = { x0: number; x1: number };
export type CityPaintPlan = { width: number; height: number; seed: number; ground: number; curb: number; farSide: number; laneMark: number; unit: number; buildings: PaintBuilding[]; trees: Tree[]; blocked: Span[] };

// Hauteur du toit peint DANS l'immeuble : une rangée de fenêtres (grille de 14 px) ; ces fenêtres deviennent des lucarnes.
export const ROOF_H = 14;
export const FAR_ROOF_H = 6;
// Lampe de la grille d'origine (facades.ts) : 5 × 7.
const LAMP = { w: 5, h: 7 } as const;

const WALLS = ['#F2DDB6', '#E8A88C', '#C9D8BA', '#F1DCAE', '#E9C9A0', '#D9B8C8', '#F4E8D0', '#C8D4DE'].map(hexRgb);
const TILE_ROOFS = ['#C65A30', '#9C4A32', '#A9503A', '#B8623A'].map(hexRgb);
const SLATE_ROOFS = ['#5E6A7A', '#6E6A78', '#4E5866'].map(hexRgb);
const SHUTTERS = ['#5E8C5A', '#3E6E8E', '#8A5A3A', '#4E7E8E'].map(hexRgb);

const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length)]!;

function lookOf(seed: number, x: number, w: number, far: boolean): Look {
  const rng = mulberry32(seed ^ hashString('ghibli-look') ^ Math.round(x * 8));
  const mansard = rng() < 0.4;
  return {
    wall: pick(WALLS, rng),
    roof: mansard ? pick(SLATE_ROOFS, rng) : pick(TILE_ROOFS, rng),
    roofKind: mansard ? 'mansard' : 'gable',
    roofH: far ? FAR_ROOF_H : ROOF_H,
    shutters: rng() < 0.7 ? pick(SHUTTERS, rng) : null,
    boxes: rng() < 0.6,
    balconyRow: rng() < 0.35 ? 2 + Math.floor(rng() * 2) : null,
    ivy: rng() < 0.18 ? (rng() < 0.5 ? 'left' : 'right') : null,
    chimney: w >= 34 && rng() < 0.6 ? 0.2 + rng() * 0.6 : null,
  };
}

// y du haut de la silhouette des immeubles en x (le plus haut des immeubles qui couvrent x) ; `ground` si aucun.
export function silhouetteTop(plan: Pick<CityPaintPlan, 'buildings' | 'ground'>, x: number): number {
  let top = plan.ground;
  for (const b of plan.buildings) if (x >= b.x && x <= b.x + b.w) top = Math.min(top, b.top);
  return top;
}

const TREE_STEP = 170;

export function cityPaintPlan(width: number, height: number, seed: number): CityPaintPlan {
  const m = cityMetrics(height);
  const facades = cityFacades(width, height, seed);
  const buildings: PaintBuilding[] = facades.map((f, id) => {
    const top = m.ground - f.h;
    const look = lookOf(seed, f.x, f.w, f.far);
    const rng = mulberry32(seed ^ hashString('ghibli-curtain') ^ Math.round(f.x * 8));
    const wins: Win[] = f.far
      ? f.farWindows.map((v) => ({ x: v.x, y: v.y, w: FAR_WINDOW.w, h: FAR_WINDOW.h, dormer: false, curtain: false }))
      : f.lamps.map((l) => ({ x: l.x, y: l.y, w: LAMP.w, h: LAMP.h, dormer: l.y < top + ROOF_H, curtain: rng() < 0.5 }));
    return { id, x: f.x, w: f.w, top, far: f.far, wins, look };
  });
  const blocked: Span[] = [
    ...doorsFor(width, height, seed).map((d) => ({ x0: d.x - DOOR_MARGIN, x1: d.x + DOOR_WIDTH + DOOR_MARGIN })),
    ...shopSlotsFor(width, height, seed).map((s) => ({ x0: s.x, x1: s.x + s.w })),
  ];
  const base = { buildings, ground: m.ground };
  const trees: Tree[] = [];
  const rng = mulberry32(seed ^ hashString('ghibli-trees'));
  const crownBottom = m.ground - GROUND_FLOOR - 1;
  for (let x = 40 + rng() * 60; x < width - 10; x += TREE_STEP * (0.7 + rng() * 0.6)) {
    const want = (14 + rng() * 8) * m.unit;
    const trunk = { x0: x - 2 * m.unit, x1: x + 2 * m.unit };
    if (blocked.some((s) => trunk.x1 > s.x0 && trunk.x0 < s.x1)) continue;
    // Plus grande couronne (≤ want, ≥ 9 unités) posée juste au-dessus du rez-de-chaussée et sous la silhouette partout.
    for (let r = want; r >= 9 * m.unit; r -= m.unit) {
      const cy = crownBottom - r;
      let ok = true;
      for (let sx = x - r; sx <= x + r && ok; sx += 1) if (cy - r < silhouetteTop(base, sx) + 2) ok = false;
      if (ok && silhouetteTop(base, x + r) <= cy - r - 2) {
        trees.push({ id: trees.length, x, base: (m.ground + m.curb) / 2, cy, r });
        break;
      }
    }
  }
  return {
    width,
    height,
    seed,
    ground: m.ground,
    curb: m.curb,
    farSide: m.farSide,
    laneMark: (m.laneY.far + m.laneY.near) / 2 - 8 * m.unit,
    unit: m.unit,
    buildings,
    trees,
    blocked,
  };
}
```

Note pour l'implémenteur : la boucle de test vérifie `x` par pas de 1 de `t.x - r` à `t.x + r` ; l'implémentation vérifie aussi `x + r` exactement. Si le test échoue sur l'id des arbres après agrandissement (test « garde les arbres du début »), c'est que la boucle consomme le générateur différemment selon la largeur : la condition `x < width - 10` est la seule dépendance à la largeur et doit le rester.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/library/paint/paint-city-plan.test.ts --maxWorkers=4`
Expected: PASS. Si « au moins un arbre » échoue pour la graine 1, baisser le rayon minimal à `8 * m.unit` et le noter dans `progress.md`.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/paint/city-plan.ts tests/core/library/paint/paint-city-plan.test.ts
git commit -m "feat(bibliotheque): plan de la ville peinte (apparences, lucarnes, arbres)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Peintre de tranche

**Files:**
- Create: `src/core/library/paint/city-painter.ts`
- Test: `tests/core/library/paint/paint-city-painter.test.ts`

**Interfaces:**
- Consumes: Tasks 3-5.
- Produces:

```ts
export const TILE = 360;
export const PAINT_VERSION = 1;
export function tileCount(width: number): number;
export function tileItems(plan: CityPaintPlan, tile: number): { buildings: PaintBuilding[]; trees: Tree[] };
export function tileKey(plan: CityPaintPlan, tile: number): string;
export function paintBuilding(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding): void;
export function paintCityTile(ctx: PaintCtx, plan: CityPaintPlan, tile: number): void; // coordonnées du monde
```

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cityPaintPlan } from '../../../../src/core/library/paint/city-plan';
import { paintBuilding, paintCityTile, TILE, tileCount, tileItems, tileKey } from '../../../../src/core/library/paint/city-painter';
import { recordingCtx } from './recording-ctx';

afterEach(() => vi.restoreAllMocks());

// Un point est permis s'il est dans la rue (y ≥ sol) ou dans un immeuble (débord d'avant-toit ≤ 1,5 px).
function allowed(plan: ReturnType<typeof cityPaintPlan>, x: number, y: number): boolean {
  if (y >= plan.ground - 1e-6) return true;
  return plan.buildings.some((b) => x >= b.x - 1.5 && x <= b.x + b.w + 1.5 && y >= b.top - 1e-6);
}

describe('peintre de tranche', () => {
  it('tranches : nombre et contenu', () => {
    expect(tileCount(720)).toBe(2);
    expect(tileCount(721)).toBe(3);
    const plan = cityPaintPlan(1080, 340, 1);
    const straddling = plan.buildings.find((b) => b.x < TILE && b.x + b.w > TILE);
    if (straddling) {
      expect(tileItems(plan, 0).buildings).toContain(straddling);
      expect(tileItems(plan, 1).buildings).toContain(straddling);
    }
  });

  for (const seed of [1, 7]) {
    it(`graine ${seed} : rien au-dessus de la silhouette`, () => {
      const plan = cityPaintPlan(1080, 340, seed);
      for (let t = 0; t < tileCount(1080); t++) {
        const ctx = recordingCtx();
        paintCityTile(ctx, plan, t);
        expect(ctx.fills.length).toBeGreaterThan(500);
        const bad = ctx.points.filter(([x, y]) => !allowed(plan, x, y));
        expect(bad.slice(0, 3)).toEqual([]);
      }
    });
  }

  it('un immeuble est peint à l’identique quelle que soit la tranche', () => {
    const plan = cityPaintPlan(720, 340, 3);
    const b = plan.buildings.find((x) => !x.far)!;
    const a = recordingCtx();
    const c = recordingCtx();
    paintBuilding(a, plan, b);
    paintBuilding(c, plan, b);
    expect(a.ops).toEqual(c.ops);
  });

  it('clé : stable, dépend de la graine, inchangée pour la 1re tranche quand la pièce grandit', () => {
    const p1 = cityPaintPlan(720, 340, 1);
    expect(tileKey(p1, 0)).toBe(tileKey(cityPaintPlan(720, 340, 1), 0));
    expect(tileKey(p1, 0)).not.toBe(tileKey(cityPaintPlan(720, 340, 2), 0));
    expect(tileKey(cityPaintPlan(1080, 340, 1), 0)).toBe(tileKey(p1, 0));
  });

  it('n’utilise jamais Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random interdit'); });
    paintCityTile(recordingCtx(), cityPaintPlan(720, 340, 5), 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/library/paint/paint-city-painter.test.ts --maxWorkers=4`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write the implementation**

```ts
import { hashString, mulberry32 } from '../scene-world';
import { cellRng, dab, washRect, type Box } from './brush';
import type { CityPaintPlan, PaintBuilding, Tree } from './city-plan';
import { hexRgb, jitter, mixRgb, rgba, type Rgb } from './color';
import type { PaintCtx } from './paint-ctx';
import { cobbles, foliage, glass, roofTiles } from './strokes';

// Peintre de la ville (vague Ghibli) : une tranche de TILE px du monde, en coordonnées du monde (l'appelant décale le
// canvas). Chaque immeuble et chaque arbre a son propre générateur : peint depuis deux tranches, il est identique.
export const TILE = 360;
// À incrémenter à chaque changement du dessin : invalide le cache des tranches.
export const PAINT_VERSION = 1;

const SUN = hexRgb('#FFF4DC');
const SHADOW = hexRgb('#7A6A8C');
const HAZE = hexRgb('#9FB8CC');
const INK = '#3A2418';

export const tileCount = (width: number): number => Math.max(1, Math.ceil(width / TILE));

export function tileItems(plan: CityPaintPlan, tile: number): { buildings: PaintBuilding[]; trees: Tree[] } {
  const x0 = tile * TILE - 2;
  const x1 = (tile + 1) * TILE + 2;
  return {
    buildings: plan.buildings.filter((b) => b.x < x1 && b.x + b.w > x0),
    trees: plan.trees.filter((t) => t.x - t.r < x1 && t.x + t.r > x0),
  };
}

export function tileKey(plan: CityPaintPlan, tile: number): string {
  const { buildings, trees } = tileItems(plan, tile);
  return [
    PAINT_VERSION,
    plan.seed,
    plan.height,
    tile,
    Math.min(TILE, plan.width - tile * TILE),
    buildings.map((b) => `${b.id}@${b.x.toFixed(1)}`).join(','),
    trees.map((t) => `${t.x.toFixed(1)}:${t.r.toFixed(1)}`).join(','),
  ].join('|');
}

const rngOf = (plan: CityPaintPlan, salt: string, x: number) => mulberry32(plan.seed ^ hashString(salt) ^ Math.round(x * 8));

function paintFar(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding): void {
  const rng = rngOf(plan, 'ghibli-far', b.x);
  const wall = mixRgb(b.look.wall, HAZE, 0.62);
  const eave = b.top + b.look.roofH;
  ctx.fillStyle = rgba(wall, 1);
  ctx.fillRect(b.x, eave, b.w, plan.ground - eave);
  washRect(ctx, rng, { x: b.x, y: eave, w: b.w, h: plan.ground - eave }, { color: () => wall, density: 0.12, r: [0.6, 1.4], alpha: 0.35, jitter: 6 });
  ctx.beginPath();
  ctx.moveTo(b.x, eave);
  ctx.lineTo(b.x + b.w / 2, b.top);
  ctx.lineTo(b.x + b.w, eave);
  ctx.closePath();
  ctx.fillStyle = rgba(mixRgb(b.look.roof, HAZE, 0.6), 1);
  ctx.fill();
  for (const w of b.wins) {
    ctx.fillStyle = rgba(mixRgb(hexRgb('#4A6080'), HAZE, 0.35), 0.75);
    ctx.fillRect(w.x, w.y, w.w, w.h);
  }
}

function paintRoof(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding, rng: () => number): void {
  const { x, w, top } = b;
  const eave = top + b.look.roofH;
  const o = 1.2;
  ctx.save();
  ctx.beginPath();
  if (b.look.roofKind === 'gable') {
    ctx.moveTo(x - o, eave);
    ctx.lineTo(x + w / 2, top);
    ctx.lineTo(x + w + o, eave);
  } else {
    ctx.moveTo(x - o, eave);
    ctx.lineTo(x + 1.5, top + 1);
    ctx.lineTo(x + w - 1.5, top + 1);
    ctx.lineTo(x + w + o, eave);
  }
  ctx.closePath();
  ctx.fillStyle = rgba(mixRgb(b.look.roof, SHADOW, 0.25), 1);
  ctx.fill();
  ctx.clip();
  roofTiles(ctx, rng, { x: x - o, y: top, w: w + 2 * o, h: b.look.roofH }, b.look.roof, x + w / 2, 3.2 * plan.unit, 2.2 * plan.unit);
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  if (b.look.roofKind === 'gable') {
    ctx.moveTo(x - o, eave);
    ctx.lineTo(x + w / 2, top);
    ctx.lineTo(x + w + o, eave);
  } else {
    ctx.moveTo(x - o, eave);
    ctx.lineTo(x + 1.5, top + 1);
    ctx.lineTo(x + w - 1.5, top + 1);
    ctx.lineTo(x + w + o, eave);
  }
  ctx.stroke();
  if (b.look.chimney !== null) {
    const cx = x + w * b.look.chimney;
    ctx.fillStyle = rgba(jitter(hexRgb('#A85A3E'), 10, rng), 1);
    ctx.fillRect(cx, top + 1.5, 3.5 * plan.unit, b.look.roofH * 0.55);
    ctx.fillStyle = '#5E2E1E';
    ctx.fillRect(cx - 0.5, top + 1, 4.5 * plan.unit, 1.2);
  }
}

export function paintBuilding(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding): void {
  if (b.far) return paintFar(ctx, plan, b);
  const rng = rngOf(plan, 'ghibli-building', b.x);
  const { x, w } = b;
  const eave = b.top + b.look.roofH;
  const h = plan.ground - eave;
  // Enduit : dégradé de lumière (soleil à gauche), puis touches de gouache.
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, rgba(mixRgb(b.look.wall, SUN, 0.25), 1));
  g.addColorStop(1, rgba(mixRgb(b.look.wall, SHADOW, 0.25), 1));
  ctx.fillStyle = g;
  ctx.fillRect(x, eave, w, h);
  washRect(ctx, rng, { x, y: eave, w, h }, {
    color: (px) => mixRgb(b.look.wall, (px - x) / w < 0.5 ? SUN : SHADOW, Math.abs((px - x) / w - 0.5) * 0.5),
    density: 0.35,
    r: [0.5, 1.3],
    alpha: 0.3,
    jitter: 10,
  });
  // Pied de façade et ombre sous le toit.
  const foot = ctx.createLinearGradient(0, plan.ground - 12, 0, plan.ground);
  foot.addColorStop(0, 'rgba(80,60,40,0)');
  foot.addColorStop(1, 'rgba(80,60,40,0.25)');
  ctx.fillStyle = foot;
  ctx.fillRect(x, plan.ground - 12, w, 12);
  const under = ctx.createLinearGradient(0, eave, 0, eave + 5);
  under.addColorStop(0, 'rgba(70,50,90,0.4)');
  under.addColorStop(1, 'rgba(70,50,90,0)');
  ctx.fillStyle = under;
  ctx.fillRect(x, eave, w, 5);
  // Lierre : grimpe depuis le sol sur un côté.
  if (b.look.ivy) {
    const side = b.look.ivy === 'left' ? x : x + w * 0.55;
    washRect(ctx, rng, { x: side, y: eave + h * 0.3, w: w * 0.45, h: h * 0.7 }, {
      color: (_, py) => mixRgb(hexRgb('#2A5A2A'), hexRgb('#86B85A'), (plan.ground - py) / h),
      density: 0.6,
      r: [0.4, 0.9],
      alpha: 0.8,
      jitter: 10,
    });
  }
  paintRoof(ctx, plan, b, rng);
  // Fenêtres : lucarne (petit toit), vitre, volets, appui, jardinière, coulures.
  for (const win of b.wins) {
    if (win.dormer) {
      ctx.beginPath();
      ctx.moveTo(win.x - 0.8, win.y);
      ctx.lineTo(win.x + win.w / 2, Math.max(b.top, win.y - 3));
      ctx.lineTo(win.x + win.w + 0.8, win.y);
      ctx.closePath();
      ctx.fillStyle = rgba(mixRgb(b.look.roof, SHADOW, 0.35), 1);
      ctx.fill();
    }
    glass(ctx, rng, win, win.curtain);
    if (win.dormer) continue;
    if (b.look.shutters && win.x - 2.6 >= x && win.x + win.w + 2.6 <= x + w) {
      ctx.fillStyle = rgba(jitter(b.look.shutters, 8, rng), 1);
      ctx.fillRect(win.x - 2.4, win.y, 2, win.h);
      ctx.fillRect(win.x + win.w + 0.4, win.y, 2, win.h);
    }
    ctx.fillStyle = rgba(hexRgb('#E9DCC4'), 1);
    ctx.fillRect(win.x - 0.6, win.y + win.h, win.w + 1.2, 0.8);
    if (b.look.boxes && rng() < 0.5 && win.y + win.h + 2 <= plan.ground) {
      ctx.fillStyle = rgba(hexRgb('#7A4A2E'), 1);
      ctx.fillRect(win.x - 0.4, win.y + win.h + 0.8, win.w + 0.8, 1.2);
      for (let k = 0; k < 6; k++) {
        const flower = rng() < 0.5 ? hexRgb('#3F7A36') : pick3(rng);
        dab(ctx, rng, win.x + 0.6 + rng() * (win.w - 1.2), win.y + win.h + 0.6, 0.35, flower, 0.95, 1.2);
      }
    }
    if (rng() < 0.4) {
      const sx = win.x + 0.8 + rng() * (win.w - 1.6);
      const len = 4 + rng() * 8;
      for (let k = 0; k < 4 && win.y + win.h + 2 + k * (len / 4) + 1 <= plan.ground; k++) dab(ctx, rng, sx, win.y + win.h + 2 + k * (len / 4), 0.4, hexRgb('#6E5A44'), 0.08, 1, Math.PI / 2);
    }
  }
  // Balcon : garde-corps sous une rangée de fenêtres (premier plan, hors toit).
  if (b.look.balconyRow !== null) {
    const row = b.wins.filter((v) => !v.dormer).map((v) => v.y).filter((v, i, all) => all.indexOf(v) === i).sort((p, q) => p - q)[b.look.balconyRow];
    if (row !== undefined) {
      const by = row + 7 + 2;
      if (by + 3 <= plan.ground - 30) {
        ctx.fillStyle = INK;
        ctx.fillRect(x + 2, by, w - 4, 0.6);
        for (let bx = x + 2.5; bx < x + w - 2; bx += 1.6) ctx.fillRect(bx, by, 0.3, 2.6);
        ctx.fillRect(x + 2, by + 2.6, w - 4, 0.5);
      }
    }
  }
}

function pick3(rng: () => number): Rgb {
  return [hexRgb('#E8456B'), hexRgb('#F6F0E0'), hexRgb('#F2C12E')][Math.floor(rng() * 3)]!;
}

function paintStreet(ctx: PaintCtx, plan: CityPaintPlan, x0: number, x1: number): void {
  const u = plan.unit;
  const a = x0 - 8;
  const w = x1 - x0 + 16;
  // Trottoir côté immeubles : dalles (grille globale) et texture.
  ctx.fillStyle = '#D8C7A2';
  ctx.fillRect(a, plan.ground, w, plan.curb - plan.ground);
  const slab = 17 * u;
  for (let j = Math.floor(a / slab); j * slab < a + w; j++) {
    const rng = cellRng(plan.seed, 'slab', 0, j);
    ctx.fillStyle = rgba(jitter(hexRgb('#D2C09A'), 10, rng), 0.5);
    ctx.fillRect(j * slab + 0.4, plan.ground + 0.4, slab - 0.8, plan.curb - plan.ground - 0.8);
  }
  ctx.fillStyle = '#8C7656';
  ctx.fillRect(a, plan.curb - 1.2, w, 1.6);
  // Chaussée pavée.
  ctx.fillStyle = '#5E4C36';
  ctx.fillRect(a, plan.curb + 0.4, w, plan.farSide - plan.curb - 0.4);
  cobbles(ctx, plan.seed, { x: a, y: plan.curb + 0.4, w, h: plan.farSide - plan.curb - 0.4 }, 2.2 * u, 0.12 * u, hexRgb('#B6A07C'));
  // Marquage de voie (mêmes tirets que la ville classique : 14 u pleins, 12 u vides).
  const period = 26 * u;
  for (let j = Math.floor(a / period); j * period < a + w; j++) {
    ctx.fillStyle = rgba(hexRgb('#EDE6D2'), 0.8);
    ctx.fillRect(j * period, plan.laneMark - 0.8 * u, 14 * u, 1.6 * u);
  }
  // Trottoir d'en face.
  ctx.fillStyle = '#D2C2A0';
  ctx.fillRect(a, plan.farSide, w, plan.height - plan.farSide);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(a, plan.farSide, w, 1.2);
}

function paintTree(ctx: PaintCtx, plan: CityPaintPlan, t: Tree): void {
  const rng = rngOf(plan, 'ghibli-tree', t.x);
  const u = plan.unit;
  // Ombre au sol (lumière venant de la gauche : décalée vers la droite).
  ctx.beginPath();
  ctx.ellipse(t.x + 4 * u, t.base + 0.5, 7 * u, 1.6 * u, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(90,80,150,0.28)';
  ctx.fill();
  // Tronc.
  ctx.fillStyle = '#4A3424';
  ctx.beginPath();
  ctx.moveTo(t.x - 1.6 * u, t.base);
  ctx.lineTo(t.x - 0.9 * u, t.cy);
  ctx.lineTo(t.x + 0.9 * u, t.cy);
  ctx.lineTo(t.x + 1.6 * u, t.base);
  ctx.closePath();
  ctx.fill();
  foliage(ctx, rng, { cx: t.x, cy: t.cy, r: t.r }, u);
}

export function paintCityTile(ctx: PaintCtx, plan: CityPaintPlan, tile: number): void {
  const { buildings, trees } = tileItems(plan, tile);
  const x0 = tile * TILE;
  const x1 = Math.min(plan.width, (tile + 1) * TILE);
  for (const b of buildings) if (b.far) paintBuilding(ctx, plan, b);
  for (const b of buildings) if (!b.far) paintBuilding(ctx, plan, b);
  paintStreet(ctx, plan, x0, x1);
  for (const t of trees) paintTree(ctx, plan, t);
}

export type { Box };
```

Note pour l'implémenteur : si le test « rien au-dessus de la silhouette » échoue, afficher les 3 premiers points fautifs et corriger la primitive en cause (débord d'avant-toit, lucarne, cheminée) ; ne jamais assouplir le test au-delà de 1,5 px.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/library/paint --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/paint/city-painter.ts tests/core/library/paint/paint-city-painter.test.ts
git commit -m "feat(bibliotheque): peintre de tranche de la ville (façades, toits, rue, arbres)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Étalonnage jour / crépuscule / nuit

**Files:**
- Create: `src/core/library/paint/grade.ts`
- Test: `tests/core/library/paint/paint-grade.test.ts`

**Interfaces:**
- Produces: `type Grade = number[]` (20 valeurs, matrice 4 × 5 de `feColorMatrix`), `IDENTITY: Grade`, `NIGHT: Grade`, `DUSK: Grade`, `gradeFor(daylight: number, twilight: number, gloom: boolean): Grade`, `gradeValues(g: Grade): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { DUSK, gradeFor, gradeValues, IDENTITY, NIGHT } from '../../../../src/core/library/paint/grade';

const brightness = (g: number[]) => g[0]! + g[6]! + g[12]!;

describe('étalonnage', () => {
  it('plein jour sans nuages : identité', () => {
    expect(gradeFor(1, 0, false)).toEqual(IDENTITY);
  });
  it('pleine nuit : matrice de nuit', () => {
    gradeFor(0, 0, false).forEach((v, i) => expect(v).toBeCloseTo(NIGHT[i]!, 6));
  });
  it('crépuscule en plein jour : matrice dorée', () => {
    gradeFor(1, 1, false).forEach((v, i) => expect(v).toBeCloseTo(DUSK[i]!, 6));
  });
  it('plus sombre la nuit, plus sombre sous un ciel couvert', () => {
    expect(brightness(gradeFor(0.2, 0, false))).toBeLessThan(brightness(gradeFor(0.8, 0, false)));
    expect(brightness(gradeFor(1, 0, true))).toBeLessThan(brightness(gradeFor(1, 0, false)));
  });
  it('alpha intact', () => {
    const g = gradeFor(0.3, 0.6, true);
    expect(g.slice(15)).toEqual([0, 0, 0, 1, 0]);
  });
  it('valeurs formatées pour feColorMatrix', () => {
    expect(gradeValues(IDENTITY)).toBe('1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/library/paint/paint-grade.test.ts --maxWorkers=4`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
// Étalonnage de la ville peinte (vague Ghibli) : on peint un seul dessin de jour ; l'heure est rendue par une matrice
// feColorMatrix (4 lignes × 5 colonnes, appliquée en sRGB). Pas d'effet sur l'alpha.
export type Grade = number[];

export const IDENTITY: Grade = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
// Nuit : sombre et bleutée (les fenêtres allumées sont dessinées par-dessus, hors filtre).
export const NIGHT: Grade = [0.3, 0, 0, 0, 0.02, 0, 0.34, 0, 0, 0.03, 0, 0, 0.55, 0, 0.07, 0, 0, 0, 1, 0];
// Lever et coucher : doré.
export const DUSK: Grade = [1.1, 0.04, 0, 0, 0.03, 0.02, 0.92, 0, 0, 0.01, 0, 0, 0.74, 0, 0, 0, 0, 0, 1, 0];

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const lerp = (a: Grade, b: Grade, t: number): Grade => a.map((v, i) => v + (b[i]! - v) * t);

// Composition de deux matrices affines (applique `b` puis `a`).
function compose(a: Grade, b: Grade): Grade {
  const out: Grade = new Array(20).fill(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 5; j++) {
      let v = j === 4 ? a[i * 5 + 4]! : 0;
      for (let k = 0; k < 4; k++) v += a[i * 5 + k]! * b[k * 5 + j]!;
      out[i * 5 + j] = v;
    }
  }
  return out;
}

// Ciel couvert : 30 % de désaturation et ×0,85 sur les couleurs.
function gloomMatrix(): Grade {
  const s = 0.7;
  const k = 0.85;
  const lr = 0.2126 * (1 - s);
  const lg = 0.7152 * (1 - s);
  const lb = 0.0722 * (1 - s);
  return [k * (lr + s), k * lg, k * lb, 0, 0, k * lr, k * (lg + s), k * lb, 0, 0, k * lr, k * lg, k * (lb + s), 0, 0, 0, 0, 0, 1, 0];
}

export function gradeFor(daylight: number, twilight: number, gloom: boolean): Grade {
  const base = lerp(IDENTITY, DUSK, clamp01(twilight));
  const graded = lerp(base, NIGHT, 1 - clamp01(daylight));
  return gloom ? compose(gloomMatrix(), graded) : graded;
}

export const gradeValues = (g: Grade): string => g.map((v) => Number(v.toFixed(3))).join(' ');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/library/paint/paint-grade.test.ts --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/paint/grade.ts tests/core/library/paint/paint-grade.test.ts
git commit -m "feat(bibliotheque): étalonnage jour, crépuscule, nuit de la ville peinte

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Peinture des tranches, fenêtres allumées et branche Ghibli de la scène

**Files:**
- Create: `src/content/painted-city.ts`, `src/content/ghibli-windows.tsx`
- Modify: `src/content/scene-city.tsx` (toute la fonction `CityScene`)
- Test: `tests/content/ghibli-city.test.tsx`

**Interfaces:**
- Consumes: `useArtStyle` (Task 2), `cityPaintPlan`, `CityPaintPlan` (Task 5), `paintCityTile`, `tileCount`, `tileKey`, `TILE` (Task 6), `gradeFor`, `gradeValues` (Task 7).
- Produces:
  - `type PaintedTile = { x: number; w: number; url: string }`, `type TilePainter = (plan: CityPaintPlan, tile: number) => Promise<string | null>`, `canvasTilePainter: TilePainter`, `setTilePainterForTests(p: TilePainter | null): void`, `resetPaintedCacheForTests(): void`, `usePaintedCity(plan: CityPaintPlan | null): { ready: boolean; tiles: PaintedTile[] }`.
  - `GhibliWindows({ buildings, minutes, gloom, dim, farLight })`.
  - Dans le DOM : `[data-scene-body][data-art="ghibli"]`, `[data-classic-city]`, `[data-painted-city][data-ready]`, `[data-painted-tile]`, `[data-ghibli-windows]`, `feColorMatrix` dans `[data-painted-city]`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ART_KEY } from '../../src/content/art-setting';
import { resetPaintedCacheForTests, setTilePainterForTests } from '../../src/content/painted-city';
import { ScenePanorama } from '../../src/content/scene-panorama';
import { cityFacades } from '../../src/core/library/city/facades';
import { skyAt, sunTimes } from '../../src/core/library/sky';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const times = sunTimes({ y: 2024, m: 6, d: 21 }, { lat: 48.85, lon: 2.35 }, 120);
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); });
const render = async (minutes: number, width = 720) => {
  await act(async () => {
    root.render(
      <svg>
        <ScenePanorama scene="city" width={width} height={340} sky={skyAt(minutes, times)} minutes={minutes} seed={5} />
      </svg>,
    );
  });
  await settle();
};
const q = (s: string) => container.querySelector(s);
const qa = (s: string) => container.querySelectorAll(s);

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal('requestIdleCallback', (fn: () => void) => { fn(); return 1; });
  vi.stubGlobal('cancelIdleCallback', () => undefined);
  resetPaintedCacheForTests();
  setTilePainterForTests(null);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.removeItem(ART_KEY);
  setTilePainterForTests(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ville peinte', () => {
  it('graphisme classique : aucune trace de la branche Ghibli', async () => {
    await render(12 * 60);
    expect(q('[data-painted-city]')).toBeNull();
    expect(q('[data-art="ghibli"]')).toBeNull();
    const lamps = cityFacades(720, 340, 5).filter((b) => !b.far).reduce((n, b) => n + b.lamps.length, 0);
    expect(qa('[data-lamp]').length).toBe(lamps);
  });

  it('Ghibli sans canvas (jsdom) : la ville classique reste visible', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    await render(12 * 60);
    expect(q('[data-painted-city]')?.getAttribute('data-ready')).toBe('false');
    expect((q('[data-classic-city]') as HTMLElement).style.opacity).toBe('1');
  });

  it('Ghibli peint : images par tranche, fondu vers la peinture, fenêtres allumées', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    const painter = vi.fn(async (_plan: unknown, tile: number) => `blob:fake-${tile}`);
    setTilePainterForTests(painter);
    await render(23 * 60);
    expect(qa('[data-painted-tile]').length).toBe(2);
    expect(q('[data-painted-city]')?.getAttribute('data-ready')).toBe('true');
    expect((q('[data-painted-city]') as HTMLElement).style.opacity).toBe('1');
    expect((q('[data-classic-city]') as HTMLElement).style.opacity).toBe('0');
    expect(q('[data-ghibli-windows] [data-lamp][data-lit="true"]')).not.toBeNull();
    expect(painter).toHaveBeenCalledTimes(2);
  });

  it('agrandir la pièce ne peint que les nouvelles tranches', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    const painter = vi.fn(async (_plan: unknown, tile: number) => `blob:fake-${tile}`);
    setTilePainterForTests(painter);
    await render(12 * 60, 720);
    await render(12 * 60, 1080);
    // La 1re tranche n'est jamais repeinte ; la 2e peut l'être si un arbre ou une entrée change près de l'ancien bord.
    expect(painter.mock.calls.filter((c) => c[1] === 0).length).toBe(1);
    expect(painter.mock.calls.filter((c) => c[1] === 2).length).toBe(1);
    expect(qa('[data-painted-tile]').length).toBe(3);
  });

  it('l’étalonnage suit l’heure', async () => {
    localStorage.setItem(ART_KEY, 'ghibli');
    setTilePainterForTests(async (_p, t) => `blob:fake-${t}`);
    await render(12 * 60);
    const noon = q('[data-painted-city] feColorMatrix')?.getAttribute('values');
    await render(23 * 60);
    const night = q('[data-painted-city] feColorMatrix')?.getAttribute('values');
    expect(noon).toBeTruthy();
    expect(night).not.toBe(noon);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/ghibli-city.test.tsx --maxWorkers=4`
Expected: FAIL (module `painted-city` introuvable).

- [ ] **Step 3: Write `src/content/painted-city.ts`**

```ts
import { useEffect, useMemo, useReducer } from 'react';
import type { CityPaintPlan } from '../core/library/paint/city-plan';
import { paintCityTile, TILE, tileCount, tileKey } from '../core/library/paint/city-painter';
import { mulberry32 } from '../core/library/scene-world';

// Peinture des tranches de la ville (vague Ghibli) : canvas hors écran pendant les temps morts, une tranche par créneau,
// image PNG en URL d'objet, cache mémoire (64 tranches au plus, les plus anciennes libérées).
export type PaintedTile = { x: number; w: number; url: string };
export type TilePainter = (plan: CityPaintPlan, tile: number) => Promise<string | null>;

const CACHE_MAX = 64;
const cache = new Map<string, string>();
const failed = new Set<string>();
let override: TilePainter | null = null;

function remember(key: string, url: string): void {
  cache.delete(key);
  cache.set(key, url);
  while (cache.size > CACHE_MAX) {
    const [oldKey, oldUrl] = cache.entries().next().value as [string, string];
    cache.delete(oldKey);
    if (oldUrl.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(oldUrl);
  }
}

// Remonte les tranches affichées en tête du cache (elles ne sont jamais libérées pendant qu'on les montre).
function touch(key: string): string {
  const url = cache.get(key);
  if (url === undefined) return '';
  cache.delete(key);
  cache.set(key, url);
  return url;
}

export function setTilePainterForTests(painter: TilePainter | null): void {
  override = painter;
}

export function resetPaintedCacheForTests(): void {
  cache.clear();
  failed.clear();
}

// Grain de papier : léger bruit sur les pixels peints (le ciel transparent reste intact).
function paperGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
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

export const canvasTilePainter: TilePainter = async (plan, tile) => {
  if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom'))) return null;
  const x0 = tile * TILE;
  const w = Math.min(TILE, plan.width - x0);
  if (w <= 0) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(plan.height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, -x0 * dpr, 0);
  paintCityTile(ctx, plan, tile);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  paperGrain(ctx, canvas.width, canvas.height, plan.seed ^ (tile + 1));
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? URL.createObjectURL(blob) : null;
};

const idle = (fn: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 1500 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 16);
  return () => window.clearTimeout(id);
};

// Tranches de la ville peinte pour ce plan. `ready` : toutes peintes. Sans plan : rien.
export function usePaintedCity(plan: CityPaintPlan | null): { ready: boolean; tiles: PaintedTile[] } {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const keys = useMemo(() => (plan ? Array.from({ length: tileCount(plan.width) }, (_, t) => tileKey(plan, t)) : []), [plan]);
  useEffect(() => {
    if (!plan) return;
    const painter = override ?? canvasTilePainter;
    let cancelled = false;
    let cancelIdle: (() => void) | null = null;
    const next = (): void => {
      if (cancelled) return;
      const t = keys.findIndex((k) => !cache.has(k) && !failed.has(k));
      if (t < 0) return;
      cancelIdle = idle(() => {
        void painter(plan, t).then((url) => {
          if (url) remember(keys[t]!, url);
          else failed.add(keys[t]!);
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
  }, [plan, keys]);
  if (!plan) return { ready: false, tiles: [] };
  const tiles = keys.map((k, t) => ({ x: t * TILE, w: Math.min(TILE, plan.width - t * TILE), url: touch(k) }));
  return { ready: tiles.every((t) => t.url !== ''), tiles };
}
```

- [ ] **Step 4: Write `src/content/ghibli-windows.tsx`**

```tsx
import type { ReactElement } from 'react';
import { lampLit } from '../core/library/activity';
import { FAR_WINDOW, type Facade } from '../core/library/city/facades';

// Fenêtres allumées de la ville peinte (vague Ghibli), hors filtre d'étalonnage : lueur chaude débordante, croisillon,
// rideau en contre-jour. Mêmes positions et même logique d'allumage que la ville classique.
export function GhibliWindows({ buildings, minutes, gloom, dim, farLight }: { buildings: Facade[]; minutes: number; gloom: boolean; dim: number; farLight: number }): ReactElement {
  return (
    <g data-ghibli-windows="">
      {buildings.map((b, i) =>
        b.far
          ? b.farWindows.map((win, j) => {
              const lit = lampLit(win.u, minutes) || (gloom && win.u < 0.55);
              return (
                <rect key={`f${i}-${j}`} data-far-lamp="" data-lit={lit ? 'true' : 'false'} x={win.x} y={win.y} width={FAR_WINDOW.w} height={FAR_WINDOW.h} fill={win.blue ? '#C4D8FF' : '#FFDFA0'} opacity={lit ? dim * farLight : 0} style={{ transition: 'opacity 4s ease' }} />
              );
            })
          : b.lamps.map((lamp, j) => {
              const lit = lampLit(lamp.u, minutes) || (gloom && lamp.u < 0.55);
              return (
                <g key={`n${i}-${j}`} data-lamp="" data-lit={lit ? 'true' : 'false'} opacity={lit ? dim : 0} style={{ transition: 'opacity 4s ease' }}>
                  <rect x={lamp.x - 1.2} y={lamp.y - 1.2} width={7.4} height={9.4} rx={1.5} fill={lamp.blue ? '#9FC4FF' : '#FFC860'} opacity={0.3} />
                  <rect x={lamp.x} y={lamp.y} width={5} height={7} fill={lamp.blue ? '#B9D4FF' : '#FFD98A'} />
                  <path d={`M${lamp.x} ${lamp.y}h1.5q-0.5 3.5 0 7h-1.5z`} fill="#D8984A" opacity={0.75} />
                  <rect x={lamp.x + 2.2} y={lamp.y} width={0.6} height={7} fill="#5A3A22" opacity={0.6} />
                  <rect x={lamp.x} y={lamp.y + 3.1} width={5} height={0.6} fill="#5A3A22" opacity={0.6} />
                </g>
              );
            }),
      )}
    </g>
  );
}
```

- [ ] **Step 5: Rewrite `CityScene` in `src/content/scene-city.tsx`**

Garder tous les imports existants et ajouter :

```tsx
import { useEffect, useId, useMemo, useState, type ReactElement } from 'react';
import { useArtStyle } from './art-setting';
import { GhibliWindows } from './ghibli-windows';
import { usePaintedCity } from './painted-city';
import { cityPaintPlan } from '../core/library/paint/city-plan';
import { gradeFor, gradeValues } from '../core/library/paint/grade';
```

(remplacer la ligne `import { useMemo, type ReactElement } from 'react';`). Ajouter avant `CityScene` :

```tsx
const FADE = 'opacity 1s ease';
const reducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Vrai pendant `ms` après être repassé à faux : laisse le temps au fondu de sortie de la ville peinte.
function useLingering(on: boolean, ms: number): boolean {
  const [late, setLate] = useState(on);
  useEffect(() => {
    if (on) {
      setLate(true);
      return;
    }
    const id = window.setTimeout(() => setLate(false), ms);
    return () => window.clearTimeout(id);
  }, [on, ms]);
  return on || late;
}
```

Puis, dans `CityScene`, juste après la ligne `const { frames, views, street: slotDays } = useStreetShops(width, height, seed, city);`, ajouter :

```tsx
  const [art] = useArtStyle();
  const ghibli = art === 'ghibli';
  const lingering = useLingering(ghibli, reducedMotion() ? 0 : 1000);
  const plan = useMemo(() => (lingering ? cityPaintPlan(width, height, seed) : null), [lingering, width, height, seed]);
  const painted = usePaintedCity(plan);
  const gradeId = useId().replace(/:/g, '');
```

Ensuite, découper le JSX actuel en constantes SANS en changer le contenu : `farBlocks` = le `buildings.filter((b) => b.far).map(...)` actuel ; `nearBlocks` = le `buildings.filter((b) => !b.far).map(...)` actuel ; `shopFronts` = le `views.map(...)` actuel ; `street` = le fragment `<>…</>` contenant les cinq `rect` et la `line data-lane-mark` actuels plus le `rect` `y={ground - 2}` ; `entrances` = le `doors.map(...)` actuel. Le retour classique reste dans le même ordre qu'avant :

```tsx
  if (!lingering) {
    return (
      <g data-scene-body>
        {farBlocks}
        {nearBlocks}
        {shopFronts}
        {street}
        {entrances}
      </g>
    );
  }
  const showPainted = ghibli && painted.ready;
  const fade = reducedMotion() ? 'none' : FADE;
  return (
    <g data-scene-body data-art="ghibli">
      <g data-classic-city="" style={{ opacity: showPainted ? 0 : 1, transition: fade }}>
        {farBlocks}
        {nearBlocks}
        {street}
      </g>
      <g data-painted-city="" data-ready={painted.ready ? 'true' : 'false'} style={{ opacity: showPainted ? 1 : 0, transition: fade }}>
        <filter id={gradeId} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={gradeValues(gradeFor(sky.daylight, sky.twilight, gloom))} />
        </filter>
        <g filter={`url(#${gradeId})`}>
          {painted.tiles.filter((t) => t.url !== '').map((t) => (
            <image key={t.x} data-painted-tile={t.x} href={t.url} x={t.x} y={0} width={t.w} height={height} preserveAspectRatio="none" />
          ))}
        </g>
        <GhibliWindows buildings={buildings} minutes={minutes} gloom={gloom} dim={dim} farLight={FAR_LIGHT} />
      </g>
      {shopFronts}
      {entrances}
    </g>
  );
```

Vérifier que `tests/content/scene-panorama.test.tsx` et les autres tests de la ville passent sans modification (le chemin classique est inchangé).

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/content/ghibli-city.test.tsx tests/content/scene-panorama.test.tsx --maxWorkers=4`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: aucune erreur. Si `window.cancelIdleCallback?.(id)` est refusé par la cible TS, écrire `window.cancelIdleCallback(id)`.

- [ ] **Step 8: Commit**

```bash
git add src/content/painted-city.ts src/content/ghibli-windows.tsx src/content/scene-city.tsx tests/content/ghibli-city.test.tsx
git commit -m "feat(bibliotheque): ville peinte par tranches, étalonnée et éclairée (graphisme Ghibli)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Bouton 🎨 dans la rangée Ciel

**Files:**
- Modify: `src/content/LibraryPanel.tsx` (import, hook en tête de `LibraryPanel`, bouton après le bouton Lumière)
- Test: `tests/content/library-art-ui.test.tsx`

**Interfaces:**
- Consumes: `useArtStyle`, `ART_KEY` (Task 2).
- Produces: bouton `[data-art-toggle]`, `aria-pressed`, `aria-label` « Graphisme Ghibli : activé » / « Graphisme Ghibli : désactivé », visible quand la pièce montre la scène Ville.

- [ ] **Step 1: Write the failing test**

Reprendre l'en-tête de `tests/content/library-light-ui.test.tsx` (imports, `beforeEach` / `afterEach` identiques, `click`, `q`, `settle`) en remplaçant `LIGHT_KEY` par `ART_KEY` importé de `../../src/content/art-setting`, puis :

```tsx
describe('bouton Graphisme Ghibli', () => {
  it('bascule, s’enregistre et change d’étiquette', async () => {
    await click('[data-scene="city"]');
    const btn = () => q('[data-art-toggle]');
    expect(btn()?.getAttribute('aria-pressed')).toBe('false');
    expect(btn()?.getAttribute('aria-label')).toBe('Graphisme Ghibli : désactivé');
    await click('[data-art-toggle]');
    expect(btn()?.getAttribute('aria-pressed')).toBe('true');
    expect(btn()?.getAttribute('aria-label')).toBe('Graphisme Ghibli : activé');
    expect(localStorage.getItem(ART_KEY)).toBe('ghibli');
    await click('[data-art-toggle]');
    expect(localStorage.getItem(ART_KEY)).toBe('classic');
  });
  it('absent hors de la scène Ville', async () => {
    await click('[data-scene="sea"]');
    expect(q('[data-art-toggle]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/library-art-ui.test.tsx --maxWorkers=4`
Expected: FAIL (`[data-art-toggle]` introuvable).

- [ ] **Step 3: Implement**

Dans `src/content/LibraryPanel.tsx` :

```tsx
import { useArtStyle } from './art-setting';
```

À côté de `const [lightOn, setLightOn] = useLightEnabled();` :

```tsx
  const [art, setArt] = useArtStyle();
```

Juste après le bloc `{WEATHER_SCENES.includes(room.scene) && ( <Btn label="Lumière" … ) }` :

```tsx
          {room.scene === 'city' && (
            <Btn label={`Graphisme Ghibli : ${art === 'ghibli' ? 'activé' : 'désactivé'}`} pressed={art === 'ghibli'} data={{ 'art-toggle': '' }} onClick={() => setArt(art === 'ghibli' ? 'classic' : 'ghibli')}>
              <span className="wmt-lib-zone-glyph" aria-hidden="true">
                🎨
              </span>
            </Btn>
          )}
```

(Le bouton est un vrai `<button>` : Entrée et Espace le déclenchent nativement.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/content/library-art-ui.test.tsx tests/content/library-light-ui.test.tsx --maxWorkers=4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/LibraryPanel.tsx tests/content/library-art-ui.test.tsx
git commit -m "feat(bibliotheque): bouton Graphisme Ghibli dans la rangée Ciel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Fiche WikiHow `bibliotheque-v27`

**Files:**
- Modify: `src/core/whats-new/entries.ts` (ajouter l'entrée juste après `bibliotheque-v26`)

**Interfaces:**
- Consumes: type `Entry` (`src/core/whats-new/types.ts`), même forme que `bibliotheque-v26`.

- [ ] **Step 1: Add the entry**

```ts
  {
    id: 'bibliotheque-v27',
    theme: 'collection',
    glyph: '🎨',
    title: 'Graphisme Ghibli',
    summary: 'La ville vue par vos fenêtres devient un décor peint à la main, à la façon des films d’animation',
    steps: [
      {
        target: '[data-wmt-library-entry]',
        gesture: 'tap',
        title: 'Un décor peint',
        text: 'Dans la Bibliothèque, passez en mode Aménager : la rangée Ciel d’une pièce qui montre la Ville a un bouton 🎨. Activé, les immeubles, les toits de tuiles, les volets, les jardinières, les arbres et la rue pavée sont peints au pinceau, dans l’esprit des décors des films d’animation japonais.',
        details: [
          { label: 'À quoi ça sert', text: 'À donner à la ville un aspect de peinture à la gouache, plus chaleureux que le dessin habituel.' },
          { label: 'Comment faire', text: 'Bouton 🎨 de la rangée Ciel (mode Aménager). Le réglage vaut pour toutes vos pièces sur cet appareil ; un second appui revient au dessin habituel.' },
          { label: 'D’où viennent les données', text: 'De nulle part : tout est peint par l’extension sur votre appareil, à partir de la même rue que d’habitude (mêmes immeubles, mêmes portes, mêmes commerces). Aucune image n’est téléchargée.' },
        ],
        scene: { page: '/collection', closeWindows: true },
      },
      {
        target: '[data-wmt-library-entry]',
        title: 'Peint une fois, éclairé selon l’heure',
        text: 'Le décor est peint une seule fois, par morceaux, pendant que votre appareil ne fait rien d’autre ; il est ensuite teinté selon l’heure : doré au lever et au coucher du soleil, bleu et sombre la nuit, avec les fenêtres qui s’allument une à une.',
        details: [
          { label: 'Comment ça marche', text: 'Des dizaines de milliers de touches de couleur tirées d’une graine propre à la pièce : la même pièce donne toujours la même peinture, et toutes ses fenêtres montrent la même rue.' },
          { label: 'Limites', text: 'La première peinture prend quelques secondes : le dessin habituel reste affiché d’ici là, puis la peinture apparaît en fondu.' },
        ],
        scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library-entry]'] },
      },
      {
        target: '[data-wmt-library-entry]',
        title: 'Ce qui viendra ensuite',
        text: 'Pour l’instant, seuls les immeubles, la rue et les arbres sont peints. Le ciel, les passants, les commerces, les véhicules, l’intérieur de la pièce et les animaux gardent leur dessin habituel ; ils seront redessinés dans les prochaines mises à jour.',
        details: [
          { label: 'Limites', text: 'Seule la scène Ville change : la campagne, la montagne, la mer, l’espace et la Terre gardent leur dessin.' },
        ],
        scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library-entry]'] },
      },
    ],
  },
```

- [ ] **Step 2: Run the whats-new tests**

Run: `npx vitest run tests/core/whats-new --maxWorkers=4`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/core/whats-new/entries.ts
git commit -m "docs(wikihow): fiche bibliotheque-v27 (graphisme Ghibli)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Banc, captures, mesures et validation par l'utilisateur

Tâche du contrôleur (pas de sous-agent pour la validation) : le banc est hors git.

**Files:**
- Modify: `.superpowers/harness-ville/main.tsx` (paramètre `art=`)
- Create: `.superpowers/harness-ville/jghibli.json`, `.superpowers/harness-ville/painttime.mjs`
- Modify: `.superpowers/sdd/2026-10-10-ghibli-g1/progress.md`

- [ ] **Step 1: Paramètre `art=` dans le banc**

En tête de `.superpowers/harness-ville/main.tsx`, après `const p = new URLSearchParams(location.search);` :

```ts
if (p.get('art')) localStorage.setItem('wmt:library-art', p.get('art')!);
else localStorage.removeItem('wmt:library-art');
```

Dans `cap.mjs`, remplacer le dossier `out` par `C:/Users/maxim/Downloads/Wikimasters-ghibli/.superpowers/captures-ghibli/` (le créer), le port `5211` par `5215`, et l'attente après navigation par 6000 ms (le temps de peindre).

- [ ] **Step 2: Captures**

`.superpowers/harness-ville/jghibli.json` :

```json
[
  { "name": "midi-720", "q": "art=ghibli&h=12&w=720&noframe=1", "focus": false },
  { "name": "coucher-1080", "q": "art=ghibli&h=19.6&w=1080&noframe=1", "focus": false },
  { "name": "nuit-1080", "q": "art=ghibli&h=22&w=1080&noframe=1", "focus": false },
  { "name": "couvert-1080", "q": "art=ghibli&h=15&w=1080&rain=1&noframe=1", "focus": false },
  { "name": "large-2880", "q": "art=ghibli&h=11&w=2880&noframe=1", "focus": false },
  { "name": "zoom-midi", "q": "art=ghibli&h=12&w=1080&noframe=1&vb=200%20120%20300%20150", "focus": false },
  { "name": "classique-midi", "q": "h=12&w=1080&noframe=1", "focus": false }
]
```

Run :

```bash
cd /c/Users/maxim/Downloads/Wikimasters-ghibli && npx vite -c .superpowers/harness-ville/vite.config.ts
node .superpowers/harness-ville/cap.mjs .superpowers/harness-ville/jghibli.json
```

Regarder chaque capture (outil Read sur les PNG). Vérifier : raccord invisible entre tranches (x = 360, 720…), rien au-dessus des toits, arbres hors des portes et vitrines, nuit sombre avec fenêtres chaudes, coucher doré, devantures et entrées toujours à leur place. Corriger le peintre si besoin (nouveau commit, `PAINT_VERSION` inchangée tant que rien n'est livré).

- [ ] **Step 3: Mesurer le temps de peinture**

`.superpowers/harness-ville/painttime.mjs` : même ouverture CDP que `bench.mjs` (port 9336), `Emulation.setCPUThrottlingRate { rate: 4 }`, navigation vers `index.html?art=ghibli&h=12&w=2880&noframe=1`, puis :

```js
const t = await ev(`(async () => {
  const { cityPaintPlan } = await import('/src/core/library/paint/city-plan.ts');
  const { paintCityTile } = await import('/src/core/library/paint/city-painter.ts');
  const plan = cityPaintPlan(2880, 340, 1);
  const c = document.createElement('canvas'); c.width = 720; c.height = 680;
  const g = c.getContext('2d');
  const out = [];
  for (let tile = 0; tile < 8; tile++) { g.setTransform(2, 0, 0, 2, -tile * 720, 0); const t0 = performance.now(); paintCityTile(g, plan, tile); out.push(performance.now() - t0); }
  return JSON.stringify(out.map((v) => Math.round(v)));
})()`);
console.log('ms par tranche (CPU ×4) :', t);
```

(`ev` avec `awaitPromise: true`.) Noter les valeurs dans `progress.md`. Si une tranche dépasse 250 ms, réduire la densité de `washRect` des façades (0,35 → 0,25) et des feuillages, recapturer, et le noter.

- [ ] **Step 4: Validation par l'utilisateur**

Montrer à l'utilisateur les captures `midi-720`, `coucher-1080`, `nuit-1080`, `zoom-midi`, `classique-midi` (SendUserFile) avec les mesures. Attendre son accord explicite avant la tâche 12 ; appliquer ses retours (chaque retour = commit).

---

### Task 12: Vérification finale, PR, fusion, pré-prod

- [ ] **Step 1: Suite complète et vérifications**

Run :

```bash
npx vitest run --maxWorkers=2 --testTimeout=40000
npm run typecheck
npm run build
```

Expected : tout vert (les erreurs non gérées préexistantes du mock de géolocalisation de `library-weather-ui` sont connues et hors périmètre), build OK.

- [ ] **Step 2: Relecture de toute la branche**

Relecture du diff `origin/main...HEAD` (skill `superpowers:requesting-code-review`) ; corriger les points importants, noter les mineurs différés dans `progress.md`.

- [ ] **Step 3: PR et fusion**

```bash
git push -u origin feat/bibliotheque-ghibli-g1
gh pr create --title "feat(bibliotheque): graphisme Ghibli G1 — décor de ville peint" --body "$(cat <<'EOF'
## Résumé
- Bascule globale « Graphisme Ghibli » (réglage local `wmt:library-art`, bouton 🎨 de la rangée Ciel), désactivée par défaut.
- Moteur de pinceau déterministe + peintre de la ville : immeubles, toits de tuiles et mansardes avec lucarnes, volets, jardinières, lierre, rue pavée, arbres, peints par tranches de 360 px dans un canvas hors écran, mis en cache.
- Étalonnage jour / crépuscule / nuit par filtre SVG, fenêtres allumées dessinées par-dessus.
- Fiche WikiHow `bibliotheque-v27`.

Spec : `docs/superpowers/specs/2026-10-10-bibliotheque-ghibli-design.md` ; plan : `docs/superpowers/plans/2026-10-10-bibliotheque-ghibli-g1.md`.

## Tests
- Moteur, plan, peintre (rien au-dessus de la silhouette, raccord des tranches, déterminisme), étalonnage, réglage, bouton, scène (classique inchangée, repli jsdom, fondu, cache).
- Captures validées sur le banc (midi, coucher, nuit, ciel couvert, pièce de 96 colonnes).

## Reste
- Vérification manuelle dans l'extension rechargée ; APK à la demande.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --merge --delete-branch
```

- [ ] **Step 4: Pré-prod et nettoyage**

```bash
cd "/c/Users/maxim/Downloads/Wikimasters tools" && git checkout main && git pull --ff-only && npm run build && npm run preprod
```

Puis dans le worktree : supprimer `.env.local` et la jonction `node_modules` (`cmd //c rmdir node_modules`), et `git worktree remove ../Wikimasters-ghibli` si rien n'y reste d'utile (copier d'abord les captures utiles dans le dépôt principal sous `.superpowers/`).
