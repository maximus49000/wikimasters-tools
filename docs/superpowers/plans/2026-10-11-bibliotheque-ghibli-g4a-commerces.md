# G4a · Décor des commerces en cellulo — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer, en graphisme Ghibli, les devantures, intérieurs de vitrine, rideaux et entrées d'immeuble de la scène Ville par le dessin cellulo validé (six familles de devantures par métier, 32 intérieurs détaillés, trois entrées en pierre).

**Architecture:** Le dessin est porté de la maquette validée (`docs/superpowers/maquettes/g4-commerces/`) dans des peintres purs du cœur (`src/core/library/paint/shop/`), qui tracent sur un `ShopPaintCtx` (sous-ensemble du canvas 2D, testable par un faux contexte). Un registre côté contenu peint chaque local en trois couches PNG (fond, premier plan, façade) mises en cache par clé ; la scène Ghibli les affiche en `<image>`. Les entrées d'immeuble sont peintes dans les tranches du décor existant.

**Tech Stack:** TypeScript, React (SVG), Canvas 2D hors écran, Vitest (+ jsdom), WXT.

**Spec:** `docs/superpowers/specs/2026-10-11-bibliotheque-ghibli-g4a-commerces-design.md`

## Global Constraints

- Graphisme classique strictement inchangé : toute nouveauté passe par `art === 'ghibli'` (prop `ghibli`).
- Aucun `id` dans le dessin de la scène (elle est recopiée par `<use>`) ; images en data URL PNG (la CSP du site refuse `blob:`).
- Lumière quantifiée au 1/8 de jour : `Math.round(sky.daylight * 8) / 8` ; teinte de nuit = `tone(c, sky)` de `src/content/city-sprites.tsx` (`mixHex(mixHex(c, '#0B1030', 0.55), c, daylight)`).
- Boutique éclairée (ouverte et `sky.daylight < 0.45`) : intérieur aux couleurs de jour (`LIT_SKY`, pas de teinte), éléments lumineux de la façade peints sans teinte.
- Repère d'un local : x de 0 à `slot.w` (largeur du local), y = 0 en haut du rez-de-chaussée, y = `GROUND_FLOOR` (30) au sol ; vitrine = `shopFrame(slot, ground).window` ramenée dans ce repère.
- `SHOP_PX = 4` pixels de canvas par unité du monde ; plafond du registre 120 images ; 2 peintures par image d'animation au plus.
- Polices génériques seulement : `serif`, `sans-serif` (gras), `cursive` (italique).
- Commentaires en français, au style du code voisin ; messages de commit en français, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Pièges du worktree `..\Wikimasters-ghibli` : jonction `node_modules` et copie de `.wxt/` déjà en place ; vitest avale `console.log` (`--silent=false --reporter=verbose`) ; lancer les tests ciblés (`npx vitest run <fichiers>`), la suite complète est instable en parallèle sur cette machine.

## Review Focus

- **Local très étroit (8 à 12 unités de vitrine)** : les 32 intérieurs doivent rester dans la vitrine et rendre une place de vendeur dans `[1, w − 1]`, sans exception (`each` ne pose rien si rien ne tient). Test : tâche 3, « toute largeur ».
- **Nom très long sur un bandeau étroit** : le nom est comprimé à la largeur (jamais de débordement hors du bandeau). Test : tâche 4, « nom comprimé ».
- **Nuit, boutique fermée** : rien de lumineux (pas de néon allumé, pas de flaque, rideau baissé), teinte de nuit partout. Test : tâche 4 (« fermé la nuit ») et tâche 7 (« pas de flaque fermé »).
- **Changement de palier de lumière** : l'ancienne image reste affichée tant que la nouvelle n'est pas peinte (pas de trou, pas de clignotement). Test : tâche 5, « garde l'ancienne image ».
- **Déménagement** (local sans `interior`, mobilier qui sort par tranches) : le cache de tranches reste posé sur l'image du fond de l'ancien commerce. Test : tâche 6, « tranches ».

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `docs/superpowers/maquettes/g4-commerces/{devantures.html,interiors.js,interieurs.html}` | Maquette validée, copiée dans le dépôt : référence du dessin |
| `src/core/library/paint/shop/ctx.ts` | `ShopPaintCtx`, `tintedCtx` (teinte des couleurs), `passCtx` (fond / premier plan) |
| `src/core/library/paint/shop/cel.ts` | Primitives de la maquette (`cel`, `R`, `RR`, `E`, `P`, `L`, `F`, `dot`, `glint`, `fitText`) |
| `src/core/library/paint/shop/kit.ts` | Kit des intérieurs (pièce, étagère, comptoir, objets) |
| `src/core/library/paint/shop/interiors-{alimentation,boutiques,restauration,services}.ts` | Les 32 intérieurs |
| `src/core/library/paint/shop/interiors.ts` | `paintInterior(ctx, type, w, h, pass, seed)` → place du vendeur |
| `src/core/library/paint/shop/families.ts` | Famille et pictogramme par métier |
| `src/core/library/paint/shop/facade.ts` | `paintFacade(ctx, spec)` et `facadeGeometry` |
| `src/core/library/paint/shop/entrance.ts` | `paintEntrance(ctx, cx, base, s, variant, seed)` |
| `src/core/library/paint/city-plan.ts`, `city-painter.ts` | `plan.doors`, entrées dans les tranches, `PAINT_VERSION` 3 |
| `src/content/shop/shop-host.tsx` | Registre, clés, peinture des trois couches, `ShopContext`, `useShopLayer` |
| `src/content/shop/ghibli-shop-front.tsx` | Façade + fond (décor) et flaques de nuit |
| `src/content/shop/ghibli-shop-glass.tsx` | Premier plan (calque animé) |
| `src/content/shop/ghibli-entrance-lights.tsx` | Impostes allumées |
| `src/content/shop-sprites.tsx` | `RollingShutter` cellulo |
| `src/content/scene-city.tsx`, `src/content/city-shops-life.tsx`, `src/content/RoomView.tsx`, `src/content/scene-panorama.tsx` | Branchements |
| `tests/core/library/paint/recording-ctx.ts` | Faux contexte étendu |
| `tests/core/library/paint/shop/*.test.ts`, `tests/content/shop/*.test.tsx` | Tests |

---

### Task 1: Contexte de peinture des commerces et primitives

**Files:**
- Create: `docs/superpowers/maquettes/g4-commerces/devantures.html`, `interiors.js`, `interieurs.html` (copies)
- Create: `src/core/library/paint/shop/ctx.ts`, `src/core/library/paint/shop/cel.ts`
- Modify: `tests/core/library/paint/recording-ctx.ts`
- Modify: `docs/superpowers/specs/2026-10-11-bibliotheque-ghibli-g4a-commerces-design.md` (SHOP_PX 4, plafond 120, flaques des vitrines dans `GhibliShopFront`)
- Test: `tests/core/library/paint/shop/ctx.test.ts`

**Interfaces:**
- Produces:
  - `interface ShopPaintCtx extends PaintCtx { lineCap: string; lineJoin: string; font: string; textAlign: string; textBaseline: string; translate(x: number, y: number): void; rotate(a: number): void; scale(x: number, y: number): void; bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number): void; roundRect(x: number, y: number, w: number, h: number, r: number): void; fillText(s: string, x: number, y: number): void; strokeText(s: string, x: number, y: number): void; measureText(s: string): { width: number } }`
  - `type Tint = (c: string) => string`
  - `tintedCtx(ctx: ShopPaintCtx, tint: Tint): ShopPaintCtx & { glowing(fn: () => void): void }` — toute couleur affectée à `fillStyle` / `strokeStyle` passe par `tint`, sauf dans `glowing(fn)`.
  - `type Pass = 'back' | 'front'`; `passCtx(ctx: ShopPaintCtx, want: Pass): ShopPaintCtx & { toFront(): void }` — les tracés (`fill`, `stroke`, `fillRect`, `strokeRect`, `fillText`, `strokeText`) ne sont transmis que si la section courante est `want` ; la section commence à `'back'` ; `save`/`restore`/transformations/chemins toujours transmis.
  - `cel.ts` : `type C = string`; `cel(x, path, c, o?)`, `R(x, x0, y0, w, h, c, o?)`, `RR(x, x0, y0, w, h, r, c, o?)`, `E(x, cx, cy, rx, ry, c, o?)`, `P(x, pts, c, o?)`, `L(x, x1, y1, x2, y2, c?, lw?)`, `F(x, x0, y0, w, h, c, a?)`, `dot(x, cx, cy, r, c, a?)`, `glint(x, x0, y0, w, h, a?)`, `fitText(x, s, cx, cy, size, color, o?)` où `x: ShopPaintCtx` et `o: { box?: [number, number, number, number]; s?: number; sx?: number; l?: number; lx?: number; lw?: number; a?: number; rot?: number }` (mêmes défauts que la maquette : `s 0.28, sx 0.66, l 0.2, lx 0.2, lw 0.2`), `fitText` options `{ font?: 'serif' | 'sans' | 'neon'; bold?: boolean; w?: number; stroke?: string | null }`.

- [ ] **Step 1: Copier la maquette dans le dépôt**

```bash
mkdir -p docs/superpowers/maquettes/g4-commerces
cp "../Wikimasters tools/.superpowers/brainstorm/g4-commerces/devantures.html" "../Wikimasters tools/.superpowers/brainstorm/g4-commerces/interiors.js" "../Wikimasters tools/.superpowers/brainstorm/g4-commerces/interieurs.html" docs/superpowers/maquettes/g4-commerces/
```

- [ ] **Step 2: Mettre la spec à jour**

Dans la spec, remplacer « `SHOP_PX = 3` pixels par unité (comme `CAR_PX`) » par « `SHOP_PX = 4` pixels par unité (détails de 0,1 unité lisibles sur téléphone) », « plafond de 160 images » par « plafond de 120 images », le risque mémoire par « environ 160 Ko décodés par façade de 60 × 42 unités ; 120 images ≈ 20 Mo au pire », et la phrase des flaques par « La flaque de lumière sur le trottoir et son reflet sur la chaussée (bords nets) sont dessinés par `GhibliShopFront`, hors filtre, comme les flaques des lampadaires. »

- [ ] **Step 3: Étendre le faux contexte**

Dans `tests/core/library/paint/recording-ctx.ts`, changer le type en `RecordingCtx = ShopPaintCtx & { ops: Op[]; points: [number, number][]; fills: string[]; texts: string[] }` (import de `ShopPaintCtx` depuis `src/core/library/paint/shop/ctx`) et ajouter, dans l'objet :

```ts
    texts,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    translate: (x, y) => log('translate', [x, y]),
    rotate: (a) => log('rotate', [a]),
    scale: (x, y) => log('scale', [x, y]),
    bezierCurveTo: (a, b, c, d, x, y) => { log('bezierCurveTo', [a, b, c, d, x, y]); pt(a, b); pt(c, d); pt(x, y); },
    roundRect: (x, y, w, h, r) => { log('roundRect', [x, y, w, h, r]); pt(x, y); pt(x + w, y + h); },
    fillText: (s, x, y) => { log('fillText', [x, y]); texts.push(s); fills.push(String(ctx.fillStyle)); },
    strokeText: (s, x, y) => log('strokeText', [x, y]),
    // Largeur approchée : 0,55 em par caractère (police de 10 px par défaut, lue dans `font`).
    measureText: (s) => ({ width: s.length * 0.55 * Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 10) }),
```

avec `const texts: string[] = [];` déclaré à côté de `fills`. Note : les points tracés après `translate`/`rotate` sont en repère local ; les tests de bornes des commerces n'utilisent que des tracés sans transformation ou l'enveloppe globale (voir tâche 3).

- [ ] **Step 4: Écrire les tests qui échouent**

`tests/core/library/paint/shop/ctx.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { passCtx, tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { R, fitText } from '../../../../../src/core/library/paint/shop/cel';
import { recordingCtx } from '../recording-ctx';

describe('contexte des commerces', () => {
  it('teinte chaque couleur, sauf dans glowing', () => {
    const rec = recordingCtx();
    const ctx = tintedCtx(rec, (c) => `T(${c})`);
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(0, 0, 1, 1);
    ctx.glowing(() => {
      ctx.fillStyle = '#00FF00';
      ctx.fillRect(0, 0, 1, 1);
    });
    expect(rec.fills).toEqual(['T(#FF0000)', '#00FF00']);
  });

  it('passe : le fond jusqu’à toFront, le premier plan après', () => {
    const back = recordingCtx();
    const front = recordingCtx();
    for (const [rec, want] of [[back, 'back'], [front, 'front']] as const) {
      const ctx = passCtx(rec, want);
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, 1, 1);
      ctx.toFront();
      ctx.fillStyle = '#222222';
      ctx.fillRect(0, 0, 1, 1);
    }
    expect(back.fills).toEqual(['#111111']);
    expect(front.fills).toEqual(['#222222']);
  });

  it('forme cellulo : aplat, ombre, rehaut et trait', () => {
    const rec = recordingCtx();
    R(rec, 0, 0, 10, 4, '#C08040');
    expect(rec.ops.filter((o) => o.op === 'fill').length).toBe(1);
    expect(rec.ops.filter((o) => o.op === 'fillRect').length).toBe(2);
    expect(rec.ops.some((o) => o.op === 'stroke')).toBe(true);
  });

  it('nom comprimé à la largeur demandée', () => {
    const rec = recordingCtx();
    fitText(rec, 'Un nom beaucoup trop long pour le bandeau', 10, 3, 4, '#FFFFFF', { w: 18 });
    const sc = rec.ops.find((o) => o.op === 'scale')!;
    expect(sc.args[0]! * 'Un nom beaucoup trop long pour le bandeau'.length * 0.55 * 4).toBeLessThanOrEqual(18 + 1e-6);
  });
});
```

- [ ] **Step 5: Lancer — échec attendu**

Run: `npx vitest run tests/core/library/paint/shop/ctx.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 6: Écrire `ctx.ts`**

```ts
import { hexRgb, rgba } from '../color';
import type { PaintCtx } from '../paint-ctx';

// Contexte des peintres de commerces (vague Ghibli G4a) : le sous-ensemble du canvas 2D utilisé par la maquette validée
// (transformations, courbes de Bézier, rectangles arrondis, texte). Un vrai CanvasRenderingContext2D le satisfait.
export interface ShopPaintCtx extends PaintCtx {
  lineCap: string;
  lineJoin: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  translate(x: number, y: number): void;
  rotate(a: number): void;
  scale(x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  roundRect(x: number, y: number, w: number, h: number, r: number): void;
  fillText(s: string, x: number, y: number): void;
  strokeText(s: string, x: number, y: number): void;
  measureText(s: string): { width: number };
}

export type Tint = (c: string) => string;

// Couleur CSS (#rrggbb ou rgba(r,g,b,a)) → [r, g, b] et alpha.
export function parseColor(c: string): { rgb: [number, number, number]; a: number } | null {
  if (c.startsWith('#') && c.length === 7) return { rgb: hexRgb(c) as [number, number, number], a: 1 };
  const m = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(c);
  return m ? { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] === undefined ? 1 : Number(m[4]) } : null;
}

// Teinte de nuit appliquée à une couleur CSS par une fonction sur l'hexadécimal (alpha conservé).
export function tintCss(tint: Tint, c: string): string {
  const p = parseColor(c);
  if (!p) return c;
  const hex = `#${p.rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const out = hexRgb(tint(hex));
  return p.a >= 1 ? tint(hex) : rgba(out, p.a);
}

// Toute couleur affectée passe par `tint` ; `glowing` suspend la teinte (néons, vitrine allumée, croix, lanternes).
export function tintedCtx(ctx: ShopPaintCtx, tint: Tint): ShopPaintCtx & { glowing(fn: () => void): void } {
  let raw = false;
  return new Proxy(ctx, {
    get(target, key) {
      if (key === 'glowing') return (fn: () => void) => { const was = raw; raw = true; try { fn(); } finally { raw = was; } };
      const v = Reflect.get(target, key) as unknown;
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
    set(target, key, value) {
      const color = (key === 'fillStyle' || key === 'strokeStyle') && typeof value === 'string' && !raw;
      return Reflect.set(target, key, color ? tintCss(tint, value) : value);
    },
  }) as ShopPaintCtx & { glowing(fn: () => void): void };
}

export type Pass = 'back' | 'front';
const DRAWS = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText']);

// Fond ou premier plan d'un intérieur : un seul tracé, coupé par `toFront()` (ce qui suit est devant le personnel).
export function passCtx(ctx: ShopPaintCtx, want: Pass): ShopPaintCtx & { toFront(): void } {
  let section: Pass = 'back';
  return new Proxy(ctx, {
    get(target, key) {
      if (key === 'toFront') return () => { section = 'front'; };
      const v = Reflect.get(target, key) as unknown;
      if (typeof v !== 'function') return v;
      if (typeof key === 'string' && DRAWS.has(key) && section !== want) return () => undefined;
      return (v as (...a: unknown[]) => unknown).bind(target);
    },
    set: (target, key, value) => Reflect.set(target, key, value),
  }) as ShopPaintCtx & { toFront(): void };
}
```

Note : `tintedCtx` et `passCtx` se composent (`passCtx(tintedCtx(raw, t), 'back')`) ; `toFront` et `glowing` doivent rester accessibles : `passCtx` transmet `glowing` (fonction de la cible, liée).

- [ ] **Step 7: Écrire `cel.ts`**

Porter les outils de `interiors.js` (fonctions `cel`, `R`, `RR`, `E`, `P`, `L`, `F`, `dot`, `glint` de `devantures.html`, `text` de `devantures.html` renommé `fitText`) en TypeScript, en passant le contexte en premier argument au lieu de la variable globale `X`, et avec ces règles :
- couleurs : chaînes CSS uniquement ; `shade`/`light` calculés avec `hexRgb`, `mixRgb`, `rgba` de `../color` et `SUN`, `COOL` de `../cel` (`shade(c,t) = mixRgb(c, COOL, t)`, `light(c,t) = mixRgb(c, SUN, t)`) ; `INK = '#2A1A18'` (réexporté de `../cel`).
- `cel` remplit le chemin, puis (si `box` et `s` / `l`) rogne au chemin et pose l'ombre à droite (`box.x + box.w * sx`) et le rehaut à gauche (`box.w * lx`), puis trace le contour (`lw`, couleur `INK`) — exactement comme `cel` de `interiors.js`.
- `fitText(x, s, cx, cy, size, color, { font = 'sans', bold = false, w, stroke = null })` : `font` = `${bold ? 'bold ' : ''}${size}px ${font === 'serif' ? 'serif' : font === 'neon' ? 'cursive' : 'sans-serif'}` (italique pour `neon`), `textAlign = 'center'`, `textBaseline = 'middle'`, compression horizontale `sx = min(1, w / measureText(s).width)` par `translate(cx, cy)` puis `scale(sx, 1)` (toujours appelé, même à 1), contour optionnel (`strokeText`, largeur `size * 0.22`, `lineJoin = 'round'`), puis `fillText(s, 0, 0)`, le tout entre `save`/`restore`.

- [ ] **Step 8: Lancer — succès attendu**

Run: `npx vitest run tests/core/library/paint/shop/ctx.test.ts tests/core/library/paint/paint-city-painter.test.ts`
Expected: PASS (le test du peintre de tranche vérifie que le faux contexte étendu reste compatible).

- [ ] **Step 9: Commit**

```bash
git add docs/superpowers src/core/library/paint/shop tests/core/library/paint
git commit -m "feat(bibliotheque): contexte de peinture des commerces (teinte, passes) et primitives cellulo"
```

---

### Task 2: Kit des intérieurs et intérieurs « alimentation »

**Files:**
- Create: `src/core/library/paint/shop/kit.ts`, `src/core/library/paint/shop/interiors-alimentation.ts`, `src/core/library/paint/shop/interiors.ts`
- Test: `tests/core/library/paint/shop/interiors.test.ts`

**Interfaces:**
- Consumes: `ShopPaintCtx`, `passCtx`, primitives de `cel.ts` (tâche 1).
- Produces:
  - `type Kit = { x: ShopPaintCtx & { toFront(): void }; w: number; h: number; lit: boolean; r: () => number }`
  - `type InteriorFn = (k: Kit) => number` (place du vendeur, repère local)
  - `kit.ts` : `room`, `shelf`, `counter`, `pendant`, `frame`, `plant`, `bottle`, `vinyl`, `sleeve`, `bookRow`, `baguette`, `boule`, `croissant`, `basket`, `cake`, `macarons`, `fish`, `steak`, `cheeseWheel`, `wedge`, `crate`, `fruitAt`, `glasses`, `flower`, `bucket`, `hanger`, `screen`, `person`, `bistroTable`, `each`, `PAL` — mêmes paramètres que `interiors.js`, avec le kit `k` en premier argument à la place de `X`.
  - `interiors.ts` : `INTERIORS: Record<ShopTypeId, InteriorFn>` (rempli au fil des tâches 2 et 3), `paintInterior(ctx: ShopPaintCtx, type: ShopTypeId, w: number, h: number, pass: Pass, lit: boolean, seed: number): number` — rogne à `[0, w] × [0, h]`, exécute l'intérieur sur `passCtx(ctx, pass)` et rend la place du vendeur bornée à `[1, w − 1]`.

- [ ] **Step 1: Écrire les tests qui échouent**

`tests/core/library/paint/shop/interiors.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { SHOP_TYPE_IDS, type ShopTypeId } from '../../../../../src/core/library/city/shops/catalog';
import { INTERIORS, paintInterior } from '../../../../../src/core/library/paint/shop/interiors';
import { recordingCtx } from '../recording-ctx';

const done = (): ShopTypeId[] => SHOP_TYPE_IDS.filter((t) => t in INTERIORS);

describe('intérieurs des commerces', () => {
  it('déterministes', () => {
    for (const t of done()) {
      const a = recordingCtx();
      const b = recordingCtx();
      paintInterior(a, t, 34, 21, 'back', true, 5);
      paintInterior(b, t, 34, 21, 'back', true, 5);
      expect(a.ops).toEqual(b.ops);
    }
  });

  it('toute largeur : place du vendeur dans la vitrine, du dessin au fond', () => {
    for (const t of done()) {
      for (const w of [8, 10, 12, 17, 26, 34, 45, 60]) {
        const ctx = recordingCtx();
        const post = paintInterior(ctx, t, w, 21, 'back', false, 1);
        expect(post).toBeGreaterThanOrEqual(1);
        expect(post).toBeLessThanOrEqual(w - 1);
        expect(ctx.fills.length).toBeGreaterThan(3);
      }
    }
  });

  it('rogné à la vitrine', () => {
    const ctx = recordingCtx();
    paintInterior(ctx, done()[0]!, 30, 21, 'back', false, 1);
    const i = ctx.ops.findIndex((o) => o.op === 'clip');
    expect(ctx.ops[i - 1]).toEqual({ op: 'rect', args: [0, 0, 30, 21] });
  });

  it('le premier plan ne redessine pas le fond', () => {
    for (const t of done()) {
      const back = recordingCtx();
      const front = recordingCtx();
      paintInterior(back, t, 34, 21, 'back', false, 2);
      paintInterior(front, t, 34, 21, 'front', false, 2);
      expect(front.fills.length).toBeLessThan(back.fills.length);
    }
  });
});
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx vitest run tests/core/library/paint/shop/interiors.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Écrire `kit.ts`**

Porter de `docs/superpowers/maquettes/g4-commerces/interiors.js` les fonctions `room`, `shelf`, `counter`, `pendant`, `frame`, `plant`, `bottle`, `vinyl`, `PAL`, `sleeve`, `bookRow`, `baguette`, `boule`, `croissant`, `basket`, `cake`, `macarons`, `fish`, `steak`, `cheeseWheel`, `wedge`, `crate`, `fruitAt`, `glasses`, `flower`, `bucket`, `hanger`, `screen`, `person`, `bistroTable` et `each`, à l'identique (mêmes nombres), en remplaçant `X` par `k.x` (premier argument `k: Kit`) et `r` par `k.r`. Deux changements seulement :
- `counter(k, x, w, top, front, o)` et `bistroTable(k, cx, b, ...)` appellent `k.x.toFront()` avant de dessiner (ils sont toujours au premier plan).
- `each(x0, x1, step, fn)` ne fait rien si `x1 − x0 < step` (vitrine trop étroite).

En tête de fichier :

```ts
// Kit des 32 intérieurs (G4a) : la pièce (mur, frise, lambris, carrelage, sol en lames), le mobilier et les objets
// reconnaissables de la maquette validée (docs/superpowers/maquettes/g4-commerces/interiors.js), en cellulo. Repère local :
// x de 0 à w, y de 0 (plafond) à h (sol). Le comptoir et les tables passent au premier plan (devant le personnel).
```

- [ ] **Step 4: Écrire `interiors-alimentation.ts` et `interiors.ts`**

Porter `D.bakery`, `D.pastry`, `D.chocolatier`, `D.butcher`, `D.fishmonger`, `D.cheese`, `D.greengrocer`, `D.wine`, `D.grocery`, `D.minimarket` dans `interiors-alimentation.ts` (exportés sous ces noms, signature `(k: Kit) => number`), à l'identique, avec `const { w, h, lit } = k;`. Premier plan : ces dix intérieurs passent au premier plan par `counter(...)` ; ajouter en plus `k.x.toFront()` juste avant l'étal incliné de la poissonnerie (`const y = h - 7.4; P([[0.5, y + 0.6]...`), et avant `basket(w * 0.75, ...)` de la boulangerie (déjà après le comptoir : rien à faire).

`interiors.ts` :

```ts
import type { ShopTypeId } from '../../city/shops/catalog';
import { mulberry32 } from '../../scene-world';
import { passCtx, type Pass, type ShopPaintCtx } from './ctx';
import * as alimentation from './interiors-alimentation';
import type { InteriorFn } from './kit';

// Les 32 intérieurs vus par la vitrine (G4a). Chaque intérieur trace le fond puis, après toFront(), le premier plan (comptoir,
// tables, fauteuils…) ; `paintInterior` ne garde que la passe demandée et rend la place du vendeur (repère local).
export const INTERIORS: Partial<Record<ShopTypeId, InteriorFn>> = { ...alimentation };

export function paintInterior(ctx: ShopPaintCtx, type: ShopTypeId, w: number, h: number, pass: Pass, lit: boolean, seed: number): number {
  const fn = INTERIORS[type];
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  const post = fn ? fn({ x: passCtx(ctx, pass), w, h, lit, r: mulberry32((seed * 7919 + type.length) >>> 0) }) : w / 2;
  ctx.restore();
  return Math.min(w - 1, Math.max(1, post));
}
```

- [ ] **Step 5: Lancer — succès attendu**

Run: `npx vitest run tests/core/library/paint/shop/interiors.test.ts`
Expected: PASS (dix métiers couverts).

- [ ] **Step 6: Commit**

```bash
git add src/core/library/paint/shop tests/core/library/paint/shop
git commit -m "feat(bibliotheque): kit des intérieurs cellulo et intérieurs alimentaires"
```

---

### Task 3: Les 22 autres intérieurs

**Files:**
- Create: `src/core/library/paint/shop/interiors-boutiques.ts`, `interiors-services.ts`, `interiors-restauration.ts`
- Modify: `src/core/library/paint/shop/interiors.ts`
- Test: `tests/core/library/paint/shop/interiors.test.ts`

**Interfaces:**
- Consumes: `Kit`, kit (tâche 2).
- Produces: `INTERIORS` complet (`Record<ShopTypeId, InteriorFn>`, type resserré).

- [ ] **Step 1: Ajouter le test de couverture (échec attendu)**

Dans `interiors.test.ts` :

```ts
  it('les 32 métiers ont leur intérieur', () => {
    expect(done()).toEqual([...SHOP_TYPE_IDS]);
  });
```

Run: `npx vitest run tests/core/library/paint/shop/interiors.test.ts` → FAIL (22 manquants).

- [ ] **Step 2: Porter les intérieurs**

À l'identique depuis `interiors.js` :
- `interiors-boutiques.ts` : `florist`, `bookshop`, `records`, `games`, `optician`, `thrift`, `antiques`, `petshop`, `bikes`.
- `interiors-services.ts` : `pharmacy`, `hairdresser`, `tattoo` (version corrigée : fauteuil à pied central, assise, dossier et repose-jambes), `laundry`, `arcade`, `bar`, `nightclub` (sans le DJ).
- `interiors-restauration.ts` : `cafe`, `restaurant`, `pizzeria` (ail cerné), `kebab`, `sushi` (sans le chef), `tearoom`.

`k.x.toFront()` à placer (en plus des `counter` / `bistroTable`) juste avant :
- `florist` : la boucle des seaux (`each(0.6, w - 0.6, 3.2, ...)` avec `bucket`) ;
- `bookshop` : la table de nouveautés (`const ty = h - 6.2;`) ;
- `records` : les bacs à disques (`const by = h - 2.2;`) ;
- `thrift` : les chaussures (dernier `each`) ;
- `antiques` : la commode (`const cy = h - 2.2;`) ;
- `petshop` : les sacs de croquettes ;
- `bikes` : les vélos au sol (`each(0.6, w - 0.6, 7, ...)`) ;
- `hairdresser` : au début de la boucle des postes, juste avant les fauteuils (« fauteuil (dossier, assise, pied chromé) ») — dans la boucle, les miroirs et tablettes du poste suivant doivent rester au fond : réordonner en deux boucles (miroirs et tablettes de tous les postes, puis `toFront()`, puis fauteuils et casque) ;
- `tattoo` : le fauteuil ;
- `laundry` : la rangée de lave-linge (`each(0.6, ux - 0.4, 4.4, ...)`) ;
- `restaurant` : `tbl(w * 0.28)` ;
- `pizzeria` : la table à nappe (`const tb = h - 2.2;`) ;
- `tearoom` : les tables (`for (const cx of [w * 0.3, w * 0.68])`) ;
- `arcade` : la pince à peluches (les bornes restent au fond, le personnel passe devant) ;
- `nightclub` : la cabine de DJ (`const bx = w * 0.62;`).

Dans `interiors.ts`, importer les trois modules et resserrer le type :

```ts
export const INTERIORS: Readonly<Record<ShopTypeId, InteriorFn>> = { ...alimentation, ...boutiques, ...services, ...restauration };
```

- [ ] **Step 3: Lancer — succès attendu**

Run: `npx vitest run tests/core/library/paint/shop/interiors.test.ts`
Expected: PASS (32 métiers × 8 largeurs, déterminisme, rognage, premier plan).

- [ ] **Step 4: Commit**

```bash
git add src/core/library/paint/shop tests/core/library/paint/shop
git commit -m "feat(bibliotheque): les 32 intérieurs de vitrine détaillés en cellulo"
```

---

### Task 4: Façades par famille

**Files:**
- Create: `src/core/library/paint/shop/families.ts`, `src/core/library/paint/shop/facade.ts`
- Test: `tests/core/library/paint/shop/facade.test.ts`

**Interfaces:**
- Consumes: `cel.ts`, `ShopPaintCtx`, `tintedCtx` (`glowing`), `SHOP_DEFS`.
- Produces:
  - `families.ts` : `type Family = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'`; `type Pict = 'glasses' | 'disc' | 'pad' | 'barber' | 'hanger' | 'paw' | 'wheel' | 'washer' | null`; `FAMILY: Record<ShopTypeId, Family>`; `PICT: Record<ShopTypeId, Pict>`; `TILES: Partial<Record<ShopTypeId, string>>` (`butcher: '#FFFFFF'`, `fishmonger: '#D8ECF6'`).
  - `facade.ts` : `type FacadeState = 'open' | 'closed' | 'empty' | 'works'`; `type FacadeSpec = { type: ShopTypeId | null; name: string; w: number; doorSide: 'left' | 'right'; state: FacadeState; night: boolean; lit: boolean }`; `FACADE_MARGIN = { left: 9, right: 9, top: 6, bottom: 6 }` (débords : drapeau, store, étal, ardoise) ; `facadeGeometry(spec): { win: Rect; glass: Rect; door: Rect }` (repère local : `win` = vitrine de `shopFrame` ; `glass` = partie vitrée visible `W0` de la maquette : pilastre et soubassement retirés) ; `paintFacade(ctx: ShopPaintCtx & { glowing(fn: () => void): void }, spec: FacadeSpec): void`.

- [ ] **Step 1: Écrire les tests qui échouent**

`tests/core/library/paint/shop/facade.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { SHOP_TYPE_IDS } from '../../../../../src/core/library/city/shops/catalog';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { FAMILY } from '../../../../../src/core/library/paint/shop/families';
import { facadeGeometry, paintFacade, type FacadeSpec } from '../../../../../src/core/library/paint/shop/facade';
import { recordingCtx } from '../recording-ctx';

const spec = (o: Partial<FacadeSpec> = {}): FacadeSpec => ({ type: 'bakery', name: 'Au Pain Perdu', w: 44, doorSide: 'right', state: 'open', night: false, lit: false, ...o });
const paint = (s: FacadeSpec) => {
  const rec = recordingCtx();
  paintFacade(tintedCtx(rec, (c) => c), s);
  return rec;
};

describe('façades', () => {
  it('six familles pour les 32 métiers', () => {
    expect(new Set(SHOP_TYPE_IDS.map((t) => FAMILY[t]))).toEqual(new Set(['A', 'B', 'C', 'D', 'E', 'F']));
    expect(FAMILY.pharmacy).toBe('E');
    expect(FAMILY.records).toBe('D');
    expect(FAMILY.kebab).toBe('C');
  });

  it('déterministes, et le nom est peint', () => {
    for (const t of SHOP_TYPE_IDS) {
      const a = paint(spec({ type: t, name: 'Nom' }));
      const b = paint(spec({ type: t, name: 'Nom' }));
      expect(a.ops).toEqual(b.ops);
      expect(a.texts.join(' ')).toMatch(t === 'pharmacy' ? /PHARMACIE/ : /Nom/);
    }
  });

  it('vitrine percée : aucun aplat dans la partie vitrée ouverte', () => {
    for (const t of SHOP_TYPE_IDS) {
      const s = spec({ type: t });
      const { glass } = facadeGeometry(s);
      const rec = paint(s);
      const inside = rec.ops.filter((o) => o.op === 'fillRect' && o.args[0]! >= glass.x + 0.01 && o.args[1]! >= glass.y + 0.01 && o.args[0]! + o.args[2]! <= glass.x + glass.w - 0.01 && o.args[1]! + o.args[3]! <= glass.y + glass.h - 0.01 && o.args[2]! * o.args[3]! > glass.w * glass.h * 0.5);
      expect(inside).toEqual([]);
    }
  });

  it('nom comprimé : jamais plus large que le bandeau', () => {
    const rec = paint(spec({ type: 'cafe', name: 'Le Grand Café de la Place et du Commerce Réunis', w: 30 }));
    const sc = rec.ops.filter((o) => o.op === 'scale');
    expect(sc.length).toBeGreaterThan(0);
    expect(Math.min(...sc.map((o) => o.args[0]!))).toBeLessThan(1);
  });

  it('fermé la nuit : rien de lumineux', () => {
    const rec = recordingCtx();
    const ctx = tintedCtx(rec, () => '#000001');
    const glowing = ctx.glowing;
    let lights = 0;
    ctx.glowing = (fn: () => void) => { lights++; glowing(fn); };
    paintFacade(ctx, spec({ type: 'bar', state: 'closed', night: true, lit: false }));
    expect(lights).toBe(0);
  });

  it('ouvert la nuit : le néon et la croix sont allumés', () => {
    for (const t of ['bar', 'pharmacy'] as const) {
      const rec = recordingCtx();
      const ctx = tintedCtx(rec, () => '#000001');
      paintFacade(ctx, spec({ type: t, state: 'open', night: true, lit: true }));
      expect(rec.fills.some((f) => f !== '#000001' && !f.startsWith('rgba(0,0,1'))).toBe(true);
    }
  });

  it('local vide : bandeau nu et panneau À VENDRE ; travaux : bâche', () => {
    expect(paint(spec({ type: null, name: '', state: 'empty' })).texts).toContain('À VENDRE');
    expect(paint(spec({ type: null, name: '', state: 'works' })).texts).toContain('TRAVAUX');
  });
});
```

Note : `ctx.glowing = …` dans le test exige que le proxy de `tintedCtx` accepte l'affectation de `glowing` et la rende ensuite (`set` : si `key === 'glowing'`, garder la fonction dans une variable lue par `get`). Ajouter ce cas à `tintedCtx` (tâche 1) dans cette tâche.

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx vitest run tests/core/library/paint/shop/facade.test.ts` → FAIL.

- [ ] **Step 3: Écrire `families.ts`**

```ts
import type { ShopTypeId } from '../../city/shops/catalog';

// Famille de devanture par métier (G4a, maquette validée) : A boiserie, B étal à store festonné, C café-restaurant,
// D boutique à enseigne en drapeau, E pharmacie, F commerce de nuit à néon.
export type Family = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type Pict = 'glasses' | 'disc' | 'pad' | 'barber' | 'hanger' | 'paw' | 'wheel' | 'washer' | null;

export const FAMILY: Readonly<Record<ShopTypeId, Family>> = {
  bakery: 'A', pastry: 'A', chocolatier: 'A', cheese: 'A', wine: 'A', antiques: 'A', bookshop: 'A', tearoom: 'A',
  butcher: 'B', fishmonger: 'B', greengrocer: 'B', florist: 'B', grocery: 'B',
  cafe: 'C', restaurant: 'C', pizzeria: 'C', kebab: 'C', sushi: 'C',
  minimarket: 'D', optician: 'D', records: 'D', games: 'D', hairdresser: 'D', thrift: 'D', petshop: 'D', bikes: 'D', laundry: 'D',
  pharmacy: 'E',
  bar: 'F', nightclub: 'F', arcade: 'F', tattoo: 'F',
};

export const PICT: Readonly<Record<ShopTypeId, Pict>> = Object.fromEntries(
  Object.keys(FAMILY).map((t) => [t, ({ optician: 'glasses', records: 'disc', games: 'pad', hairdresser: 'barber', thrift: 'hanger', petshop: 'paw', bikes: 'wheel', laundry: 'washer' } as Record<string, Pict>)[t] ?? null]),
) as Record<ShopTypeId, Pict>;

// Faïence des pilastres (boucherie, poissonnerie).
export const TILES: Readonly<Partial<Record<ShopTypeId, string>>> = { butcher: '#FFFFFF', fishmonger: '#D8ECF6' };
```

- [ ] **Step 4: Écrire `facade.ts`**

Porter `shopFront` de `devantures.html` **sans** l'intérieur ni la teinte de vitre (fond et premier plan sont d'autres couches), avec :
- les couleurs du métier lues dans `SHOP_DEFS[type]` (`sign`, `ink`) ; famille, pictogramme et faïence dans `families.ts` ;
- `facadeGeometry` = la géométrie de la maquette (`DW = 6`, porte `{ x: doorSide === 'left' ? 0 : w − 6, y: 9, w: 6, h: 21 }`, vitrine `{ x: doorSide === 'left' ? 7 : 0, y: 8, w: w − 7, h: 22 }`, pilastre `pil` A 2 / E 2,2 / faïence 1,8 / autres 1, `glass` = `W0` de la maquette) ;
- vitrine **percée** : ne rien remplir dans `glass` à l'état `open` (seul le cadre encré `strokeRect` et les petits bois de la famille A sont tracés) ; à l'état `empty`, vitre passée au blanc d'Espagne + panneau « À VENDRE » ; à l'état `works`, bâche « TRAVAUX » ; à l'état `closed`, vitre sombre `#2A2D36` (le rideau roulant est dessiné par-dessus par le calque animé) ;
- tout ce qui doit briller la nuit, peint dans `ctx.glowing(() => …)` **seulement si** `spec.lit` : vitre de la porte (`#FFD890`), néon de la famille F (halo arrondi + nom blanc cerné de la couleur `ink`), croix de la pharmacie et son halo, lanternes et appliques (`#FFE8A0` + halo), lanterne en papier des sushis, panneau-menu du kebab ;
- la croix de la pharmacie est verte vive (`#3CF27A`) quand `lit`, verte sombre sinon ; néon éteint = nom en `mix(ink, #555555, 0,5)` ;
- étal (B hors faïence), glace de la poissonnerie, ardoise (café, restaurant, pizzeria), cordon de la boîte de nuit : seulement à l'état `open`.
- l'ombre nette sous le store et les éléments du trottoir peuvent dépasser jusqu'à y = 34 ; drapeau et store jusqu'à 9 unités hors du local (d'où `FACADE_MARGIN`).

- [ ] **Step 5: Lancer — succès attendu**

Run: `npx vitest run tests/core/library/paint/shop/facade.test.ts tests/core/library/paint/shop/ctx.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/library/paint/shop tests/core/library/paint/shop
git commit -m "feat(bibliotheque): devantures cellulo par famille de métier (boiserie, étal, café, boutique, pharmacie, nuit)"
```

---

### Task 5: Registre des images de commerces

**Files:**
- Create: `src/content/shop/shop-host.tsx`
- Modify: `src/content/RoomView.tsx`, `src/content/scene-panorama.tsx` (fournir le registre)
- Test: `tests/content/shop/shop-host.test.tsx`

**Interfaces:**
- Consumes: `paintInterior`, `paintFacade`, `facadeGeometry`, `FACADE_MARGIN`, `tintedCtx`; `tone` (`city-sprites`), `LIT_SKY` (`shop-interiors`), `BLANK_SPRITE` (`figure/figure-host`).
- Produces:
  - `SHOP_PX = 4`
  - `type ShopLayer = 'back' | 'front' | 'facade'`
  - `type ShopLook = { type: ShopTypeId | null; name: string; w: number; h: number; doorSide: 'left' | 'right'; state: FacadeState; day: number; lit: boolean; seed: number }` (`w`, `h` : vitrine pour `back`/`front`, local pour `facade` — voir `shopLook`)
  - `quantDay(daylight: number): number`
  - `shopKey(look: ShopLook, layer: ShopLayer): string`
  - `layerBox(look: ShopLook, layer: ShopLayer): { x: number; y: number; w: number; h: number }` (repère du local ; `back`/`front` = vitrine `glass` ; `facade` = local + `FACADE_MARGIN`)
  - `paintShopLayer(look: ShopLook, layer: ShopLayer): string` (data URL ; `BLANK_SPRITE` sans canvas)
  - `class ShopRegistry { constructor(label: string, opts?: { max?: number; perFrame?: number; schedule?: (cb: () => void) => void }); get(k: string): string | null; want(k: string, paint: () => string, done: () => void): void; size(): number }` — `want` met en file ; la file est vidée par `schedule` (défaut : `requestAnimationFrame`), `perFrame` peintures par passage (défaut 2), puis `done()` des demandeurs servis ; plafond `max` (défaut 120), le moins récemment lu part.
  - `ShopContext = createContext<ShopRegistry | null>(null)`
  - `useShopLayer(look: ShopLook | null, layer: ShopLayer): string | null` — image de la clé courante, sinon la dernière image montrée par ce composant (même local), sinon `null`.

- [ ] **Step 1: Écrire les tests qui échouent**

`tests/content/shop/shop-host.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BLANK_SPRITE } from '../../../src/content/figure/figure-host';
import { ShopContext, ShopRegistry, paintShopLayer, quantDay, shopKey, useShopLayer, type ShopLook } from '../../../src/content/shop/shop-host';

const look = (o: Partial<ShopLook> = {}): ShopLook => ({ type: 'bakery', name: 'Au Pain Perdu', w: 44, h: 22, doorSide: 'right', state: 'open', day: 1, lit: false, seed: 1, ...o });

describe('registre des commerces', () => {
  it('clés distinctes par couche, état, côté, lumière, nom', () => {
    const base = shopKey(look(), 'facade');
    for (const o of [{ state: 'closed' as const }, { doorSide: 'left' as const }, { day: 0.5 }, { lit: true }, { name: 'Autre' }]) expect(shopKey(look(o), 'facade')).not.toBe(base);
    expect(shopKey(look(), 'back')).not.toBe(base);
    expect(shopKey(look({ name: 'Autre' }), 'back')).toBe(shopKey(look(), 'back'));
    expect(quantDay(0.53)).toBe(0.5);
  });

  it('sans canvas : image vide', () => {
    expect(paintShopLayer(look(), 'facade')).toBe(BLANK_SPRITE);
  });

  it('budget par passage, plafond', () => {
    const queue: (() => void)[] = [];
    const r = new ShopRegistry('t', { max: 3, perFrame: 2, schedule: (cb) => void queue.push(cb) });
    let painted = 0;
    for (const k of ['a', 'b', 'c', 'd']) r.want(k, () => { painted++; return `u${k}`; }, () => undefined);
    queue.shift()!();
    expect(painted).toBe(2);
    queue.shift()!();
    expect(painted).toBe(4);
    expect(r.size()).toBe(3);
    expect(r.get('a')).toBeNull();
    expect(r.get('d')).toBe('ud');
  });

  it('garde l’ancienne image pendant la peinture de la nouvelle', () => {
    const queue: (() => void)[] = [];
    const reg = new ShopRegistry('t', { schedule: (cb) => void queue.push(cb) });
    const seen: (string | null)[] = [];
    function Probe({ l }: { l: ShopLook }) {
      seen.push(useShopLayer(l, 'facade'));
      return null;
    }
    const { rerender } = render(<ShopContext.Provider value={reg}><Probe l={look()} /></ShopContext.Provider>);
    act(() => queue.shift()!());
    const first = seen[seen.length - 1];
    expect(first).toBe(BLANK_SPRITE);
    rerender(<ShopContext.Provider value={reg}><Probe l={look({ day: 0.25 })} /></ShopContext.Provider>);
    expect(seen[seen.length - 1]).toBe(first);
  });
});
```

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx vitest run tests/content/shop/shop-host.test.tsx` → FAIL.

- [ ] **Step 3: Écrire `shop-host.tsx`**

```tsx
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ShopTypeId } from '../../core/library/city/shops/catalog';
import { tintedCtx, type ShopPaintCtx } from '../../core/library/paint/shop/ctx';
import { FACADE_MARGIN, facadeGeometry, paintFacade, type FacadeState } from '../../core/library/paint/shop/facade';
import { paintInterior } from '../../core/library/paint/shop/interiors';
import { tone } from '../city-sprites';
import { BLANK_SPRITE } from '../figure/figure-host';

// Images peintes des commerces (G4a) : chaque local est peint UNE fois par clé sur un canvas hors écran, en trois couches
// (fond de la vitrine, premier plan devant le personnel, façade percée à la vitrine), puis gardé en PNG (data URL : la CSP
// du site refuse blob:). Lumière au 1/8 de jour ; boutique éclairée : intérieur aux couleurs de jour, néons sans teinte.
export const SHOP_PX = 4;
export type ShopLayer = 'back' | 'front' | 'facade';
export type ShopLook = { type: ShopTypeId | null; name: string; w: number; h: number; doorSide: 'left' | 'right'; state: FacadeState; day: number; lit: boolean; seed: number };

export const quantDay = (daylight: number): number => Math.round(daylight * 8) / 8;

export function shopKey(l: ShopLook, layer: ShopLayer): string {
  const common = `${layer}|${l.type ?? '-'}|${l.w.toFixed(1)}|${l.h.toFixed(1)}|${l.doorSide}|${l.state}|${l.lit ? 'L' : l.day}|${l.seed}`;
  return layer === 'facade' ? `${common}|${l.name}|${l.day}` : common;
}

export function layerBox(l: ShopLook, layer: ShopLayer): { x: number; y: number; w: number; h: number } {
  const spec = { type: l.type, name: l.name, w: l.w, doorSide: l.doorSide, state: l.state, night: l.day < 0.5, lit: l.lit };
  if (layer !== 'facade') return facadeGeometry(spec).glass;
  return { x: -FACADE_MARGIN.left, y: -FACADE_MARGIN.top, w: l.w + FACADE_MARGIN.left + FACADE_MARGIN.right, h: 30 + FACADE_MARGIN.top + FACADE_MARGIN.bottom };
}

let surface: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null | undefined;
function getSurface(): typeof surface {
  if (surface !== undefined) return surface;
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    surface = ctx ? { canvas, ctx } : null;
  } catch {
    surface = null;
  }
  return surface;
}

export function paintShopLayer(l: ShopLook, layer: ShopLayer): string {
  const s = getSurface();
  if (!s) return BLANK_SPRITE;
  const box = layerBox(l, layer);
  const { canvas, ctx } = s;
  canvas.width = Math.max(1, Math.ceil(box.w * SHOP_PX));
  canvas.height = Math.max(1, Math.ceil(box.h * SHOP_PX));
  ctx.setTransform(SHOP_PX, 0, 0, SHOP_PX, -box.x * SHOP_PX, -box.y * SHOP_PX);
  const sky = { daylight: l.day } as Parameters<typeof tone>[1];
  const tint = (c: string): string => tone(c, sky);
  const raw = ctx as unknown as ShopPaintCtx;
  if (layer === 'facade') {
    paintFacade(tintedCtx(raw, tint), { type: l.type, name: l.name, w: l.w, doorSide: l.doorSide, state: l.state, night: l.day < 0.5, lit: l.lit });
  } else if (l.type) {
    // Intérieur éclairé : couleurs de jour ; sinon teinte de la lumière du moment.
    const t = l.lit ? (c: string) => c : tint;
    ctx.translate(box.x, box.y);
    paintInterior(tintedCtx(raw, t), l.type, box.w, box.h, layer, l.lit || l.day >= 0.5, l.seed);
  }
  return canvas.toDataURL('image/png');
}

export class ShopRegistry {
  private readonly sprites = new Map<string, string>();
  private readonly queue = new Map<string, { paint: () => string; done: Set<() => void> }>();
  private pending = false;
  private readonly max: number;
  private readonly perFrame: number;
  private readonly schedule: (cb: () => void) => void;
  constructor(readonly label: string, opts: { max?: number; perFrame?: number; schedule?: (cb: () => void) => void } = {}) {
    this.max = opts.max ?? 120;
    this.perFrame = opts.perFrame ?? 2;
    this.schedule = opts.schedule ?? ((cb) => void requestAnimationFrame(cb));
  }
  size(): number {
    return this.sprites.size;
  }
  get(k: string): string | null {
    const url = this.sprites.get(k);
    if (url === undefined) return null;
    this.sprites.delete(k);
    this.sprites.set(k, url);
    return url;
  }
  want(k: string, paint: () => string, done: () => void): void {
    const q = this.queue.get(k);
    if (q) q.done.add(done);
    else this.queue.set(k, { paint, done: new Set([done]) });
    this.pump();
  }
  private pump(): void {
    if (this.pending || this.queue.size === 0) return;
    this.pending = true;
    this.schedule(() => {
      this.pending = false;
      let made = 0;
      for (const [k, q] of [...this.queue]) {
        if (made >= this.perFrame) break;
        this.queue.delete(k);
        this.sprites.set(k, q.paint());
        made++;
        while (this.sprites.size > this.max) this.sprites.delete(this.sprites.keys().next().value as string);
        for (const d of q.done) d();
      }
      this.pump();
    });
  }
}

export const ShopContext = createContext<ShopRegistry | null>(null);

// Image de la couche pour `look` ; tant qu'elle n'est pas peinte, la dernière montrée par ce composant (pas de trou).
export function useShopLayer(look: ShopLook | null, layer: ShopLayer): string | null {
  const reg = useContext(ShopContext);
  const [, bump] = useState(0);
  const last = useRef<string | null>(null);
  const key = look ? shopKey(look, layer) : null;
  const url = reg && key ? reg.get(key) : null;
  useEffect(() => {
    if (!reg || !key || !look || reg.get(key) !== null) return;
    let live = true;
    reg.want(key, () => paintShopLayer(look, layer), () => live && bump((n) => n + 1));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg, key]);
  if (url !== null) last.current = url;
  return url ?? last.current;
}
```

- [ ] **Step 4: Fournir le registre**

Dans `RoomView.tsx` (à côté de `const cars = useMemo(() => new CarRegistry(...` ligne 110) : `const shops = useMemo(() => new ShopRegistry(`${worldId}-shop`), [worldId]);` et entourer `<CarContext.Provider value={cars}>` (ligne 396) de `<ShopContext.Provider value={shops}>`. Même chose dans `scene-panorama.tsx` (lignes 199-206) avec `` `ps${uid}` ``.

- [ ] **Step 5: Lancer — succès attendu**

Run: `npx vitest run tests/content/shop/shop-host.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/content tests/content/shop
git commit -m "feat(bibliotheque): registre des images peintes des commerces (trois couches, lumière au 1/8)"
```

---

### Task 6: Devantures Ghibli dans la scène et premier plan dans le calque animé

**Files:**
- Create: `src/content/shop/ghibli-shop-front.tsx`, `src/content/shop/ghibli-shop-glass.tsx`
- Modify: `src/content/scene-city.tsx:112-132`, `src/content/city-shops-life.tsx:754` (et le premier plan derrière les clients, `ShopCustomers`)
- Test: `tests/content/shop/ghibli-shop-front.test.tsx`

**Interfaces:**
- Consumes: `useShopLayer`, `ShopLook`, `layerBox`, `quantDay` (tâche 5) ; `ShopView`, `ShopFrame`, `shopFrame`, `furnitureAt`, `sliceCount`, `EMPTY_WINDOW`.
- Produces:
  - `shopLookOf(view: ShopView, frame: ShopFrame, sky: Sky, open: boolean, seed: number, type?: ShopTypeId | null): ShopLook` — état : `view.placard ? 'empty'` ; `!view.sign ? 'works'` ; `view.phase === 'closed' ? 'closed'` ; sinon `'open'` ; `lit = open && sky.daylight < 0.45`, `day = quantDay(sky.daylight)`, `w` = largeur du local (`frame.sign.w`), `h = frame.window.h`, `doorSide = view.slot.doorSide`, `name = view.sign?.name ?? ''`.
  - `GhibliShopFront({ view, frame, sky, open, seed, slices, children })` : si la façade n'est pas prête, rend `children` (le `ShopFront` classique) ; sinon `<g data-ghibli-shop={id}>` avec le fond (`<svg>` imbriqué à la vitrine, `<image>` de la couche `back`, cache de tranches `slices` comme `ShopInterior`), la façade (`<image>` placée à `layerBox(…, 'facade')` translaté de `(frame.sign.x, ground − 30)`), et les flaques de nuit.
  - `GhibliShopGlass({ look, frame })` : `<image>` de la couche `front` à la place de `ShopInteriorFront`, rien si pas prête.

- [ ] **Step 1: Écrire les tests qui échouent**

`tests/content/shop/ghibli-shop-front.test.tsx` — rendre `GhibliShopFront` avec un registre dont `schedule` est manuel :
- avant peinture : le contenu enfant (classique) est rendu (`[data-shop]` présent) ;
- après `act(() => queue.shift()!())` répété jusqu'à vider la file : `[data-ghibli-shop]` présent, une `<image>` de façade et une de fond, plus de `[data-shop]` ;
- `shopLookOf` : état `empty` avec `placard`, `works` sans enseigne, `closed` hors horaires ; `lit` vrai à 22 h ouvert, faux à midi ;
- **tranches** : avec `slices = { shown: 1, n: 3, doorRight: true }`, un `rect[data-slices-cover]` couvre `2/3` de la vitrine du côté de la porte (même règle que `ShopInterior`) ;
- **pas de flaque fermé** : la nuit, local fermé → aucun `[data-shop-pool]` ; ouvert → un `[data-shop-pool]`.

(Construire `view` et `frame` avec `shopSlotsFor(720, 340, 1)[0]`, `shopFrame(slot, 238)` et un `ShopView` minimal `{ slot, phase: 'open', sign: { type: 'bakery', name: 'Au Pain Perdu' }, interior: 'bakery', placard: false }` complété des champs requis par le type `ShopView` de `src/core/library/city/shops/view.ts`.)

- [ ] **Step 2: Lancer — échec attendu**

Run: `npx vitest run tests/content/shop/ghibli-shop-front.test.tsx` → FAIL.

- [ ] **Step 3: Écrire `ghibli-shop-front.tsx` et `ghibli-shop-glass.tsx`**

Points de conception :
- repère : le local commence à `frame.sign.x` (= `slot.x`) ; le haut du rez-de-chaussée est `frame.sign.y − 2` ; toutes les `<image>` ont `preserveAspectRatio="none"` et la taille de leur `layerBox` ; aucun `id` ;
- fond : `<svg x={frame.window.x} y={frame.window.y} width={frame.window.w} height={frame.window.h} overflow="hidden">` contenant `<image>` de la couche `back` placée en `(glass.x − win.x, glass.y − win.y)` (repère local), puis le `rect` de cache de tranches s'il y a lieu (couleur `tone(EMPTY_WINDOW, sky)`) ; un local sans `interior` hors déménagement montre `tone(EMPTY_WINDOW, sky)` ;
- flaques (nuit, ouvert, `lit`) : `<g data-shop-pool="">` avec un trapèze du bas de la vitrine (`ground`) au bord du trottoir (`ground + (metrics.curb − ground)`), élargi de 6 de chaque côté, `fill` `rgba(255,215,140,0.26)` (famille F : couleur `ink` du métier à 0,2), et une bande de reflet sur la chaussée (`y = curb + 3`, hauteur 6, alpha 0,22) — la scène passe `metrics` à `GhibliShopFront` ;
- `GhibliShopGlass` remplace `<ShopInteriorFront …/>` dans `StaffLayer` (ligne 754) quand `ghibli`, et le premier plan dessiné devant les clients dans `ShopCustomers` quand `ghibli` ;
- dans `scene-city.tsx`, `shopFronts` : quand `ghibli`, envelopper chaque `ShopFront` existant comme `children` de `GhibliShopFront` (repli tant que l'image n'est pas peinte), avec `slices` et le métier du déménagement (`type`) déjà calculés.

- [ ] **Step 4: Lancer — succès attendu**

Run: `npx vitest run tests/content/shop/ghibli-shop-front.test.tsx tests/content/city-shops-life.test.tsx tests/content/city-shops-layer.test.tsx tests/content/shop-interiors.test.tsx`
Expected: PASS (le classique ne change pas).

- [ ] **Step 5: Commit**

```bash
git add src/content tests/content/shop
git commit -m "feat(bibliotheque): devantures et intérieurs peints en Ghibli, premier plan devant le personnel, flaques des vitrines"
```

---

### Task 7: Rideau roulant cellulo

**Files:**
- Modify: `src/content/shop-sprites.tsx:88-120` (`Shutter`, `RollingShutter`), `src/content/city-shops-life.tsx` (passer `ghibli`)
- Test: `tests/content/shop-sprites.test.tsx`

**Interfaces:**
- Produces: `RollingShutter({ frame, sky, state, still, delay, ghibli?, dark? })` — `ghibli` dessine le rideau cellulo ; `dark` (famille F) le rideau sombre.

- [ ] **Step 1: Test qui échoue**

Dans `tests/content/shop-sprites.test.tsx`, ajouter : rendu de `RollingShutter` avec `ghibli` → présence de `[data-shutter-cel]`, d'un trait encré (`stroke="#2A1A18"`), d'un coffre (`[data-shutter-box]`) et d'une bande d'ombre ; sans `ghibli` → pas de `[data-shutter-cel]` (classique inchangé).

Run: `npx vitest run tests/content/shop-sprites.test.tsx` → FAIL.

- [ ] **Step 2: Implémenter**

`ShutterCel({ frame, sky, dark })` (repère du monde, SVG) porté de la maquette (état `closed` de `shopFront`) : aplat `#9AA0A8` (sombre `#4A4452`) teinté par `tone`, bande d'ombre sur les 25 % de droite (`mixHex(c, '#5A4A9C', 0.25)`), rehaut de 8 % à gauche, lames tous les 1,4 (`mixHex(c, '#5A4A9C', 0.45)`, 0,3), coffre `data-shutter-box` de 1,6 de haut au-dessus, poignée 3 × 0,8 en bas, contour `#2A1A18` 0,6. `RollingShutter` choisit `ShutterCel` quand `ghibli`, `Shutter` sinon. `StaffLayer` passe `ghibli` et `dark={FAMILY[type] === 'F'}`.

- [ ] **Step 3: Lancer — succès attendu**

Run: `npx vitest run tests/content/shop-sprites.test.tsx tests/content/city-shops-life.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/content tests/content
git commit -m "feat(bibliotheque): rideau roulant en cellulo"
```

---

### Task 8: Entrées d'immeuble peintes dans le décor

**Files:**
- Create: `src/core/library/paint/shop/entrance.ts`, `src/content/shop/ghibli-entrance-lights.tsx`
- Modify: `src/core/library/paint/city-plan.ts` (`doors` dans le plan), `src/core/library/paint/city-painter.ts` (`tileItems`, `tileKey`, `paintCityTile`, `PAINT_VERSION = 3`), `src/content/scene-city.tsx:159-200`
- Test: `tests/core/library/paint/shop/entrance.test.ts`, `tests/core/library/paint/paint-city-painter.test.ts`

**Interfaces:**
- Produces:
  - `paintEntrance(ctx: PaintCtx, cx: number, base: number, s: number, variant: 0 | 1 | 2, seed: number): void` — dessin de `entrance` de `devantures.html` (porte centrée en `cx`, marche à `base`), chaque coordonnée de maquette `(u, v)` tracée en `(cx + u * s, base + v * s)` (aucune transformation : le contexte des tranches n'en a pas) ; numéro de la plaque tiré de la graine (3 à 42) peint en `fillText` si le contexte en dispose (`'fillText' in ctx`), sinon plaque sans numéro ; imposte toujours peinte éteinte (`#A8C8DA`).
  - `ENTRANCE_SCALE(unit: number): number` = `unit * 0.92` ; centre `door.x + DOOR_WIDTH / 2`, base `metrics.doorY`.
  - `PlanDoor = { x: number; variant: 0 | 1 | 2; cx: number; base: number; s: number }` ; `CityPaintPlan.doors: PlanDoor[]` ; `TileItems.doors`.
  - `GhibliEntranceLights({ doors, unit, doorY, dark })` : pour chaque porte au hall éclairé (`dark && door.hallU < 0.6`), l'imposte allumée (`#FFD890`) à la forme du modèle (demi-cercle, deux vitres hautes, bandeau) et un trapèze de lumière sur la marche, `data-entrance-light`.

- [ ] **Step 1: Tests qui échouent**

`entrance.test.ts` : déterminisme des trois modèles ; tous les points dans `[cx − 11 s, cx + 12,5 s] × [base − 27 s, base + 1 s]`. Dans `paint-city-painter.test.ts` : `plan.doors` a les mêmes `x` que `doorsFor(width, height, seed)` ; une porte est dans `tileItems(plan, t).doors` exactement pour les tranches qu'elle touche ; `tileKey` change quand une porte change (comparer deux graines).

Run: `npx vitest run tests/core/library/paint/shop/entrance.test.ts tests/core/library/paint/paint-city-painter.test.ts` → FAIL.

- [ ] **Step 2: Implémenter**

- `city-plan.ts` : `doors: doorsFor(width, height, seed).map((d) => ({ x: d.x, variant: d.variant, cx: d.x + DOOR_WIDTH / 2, base: m.doorY, s: m.unit * 0.92 }))` (`m = cityMetrics(height)`, déjà présent) ;
- `city-painter.ts` : `doors` dans `TileItems` (filtre `cx ± 13 s`), dans `tileKey` (`${d.variant}${d.x.toFixed(1)}`), `paintCityTile` peint les portes après `paintStreet` et avant les arbres (`paintEntrance(ctx, d.cx, d.base, d.s, d.variant, plan.seed ^ Math.round(d.x * 8))`) ; `PAINT_VERSION = 3` ;
- `scene-city.tsx` : en Ghibli, `entrances` (sprites) n'est rendu que dans le groupe classique (`data-classic-city`, qui s'efface quand le décor peint est prêt) ; ajouter `<GhibliEntranceLights …/>` dans `data-painted-city` après `GhibliWindows`.

- [ ] **Step 3: Lancer — succès attendu**

Run: `npx vitest run tests/core/library/paint tests/content/shop`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src tests
git commit -m "feat(bibliotheque): entrées d'immeuble en pierre peintes dans le décor, impostes allumées la nuit"
```

---

### Task 9: Banc, captures, mesures et validation

**Files:**
- Modify: `.superpowers/harness-ville/` du worktree (script de capture `g4cap.mjs` copié de `celcap.mjs`)
- Captures : `../Wikimasters tools/.superpowers/captures-ghibli-g4a/`

- [ ] **Step 1: Contrôles**

Run: `npx tsc --noEmit -p .` puis `npx eslint src/core/library/paint/shop src/content/shop` puis `npx vitest run tests/core/library/paint tests/content/shop tests/content/shop-sprites.test.tsx tests/content/shop-interiors.test.tsx tests/content/city-shops-life.test.tsx tests/content/city-shops-layer.test.tsx`
Expected: aucune erreur, tests PASS.

- [ ] **Step 2: Captures au banc**

Lancer le banc du worktree (`npx vite --config .superpowers/harness-ville/vite.config.ts`, port libre noté), puis `g4cap.mjs` (attend `[data-ghibli-shop]` et `[data-painted-city][data-ready=true]`) avec `art=ghibli&shops=20700` : midi 1080, midi zoom ×4 sur trois locaux, 22 h (vitrines allumées, néons, croix, impostes), 23 h 30 (locaux fermés, rideaux), un local `empty` et un `works` (dates du banc où ils existent), un déménagement. Comparer avec `docs/superpowers/maquettes/g4-commerces/` (zoom-day, zoom-night, board).

- [ ] **Step 3: Mesures**

Au banc (CPU ×4) : temps de `paintShopLayer` pour les 3 couches d'un local (objectif < 10 ms sans ralentissement, mesuré par `performance.now()` autour des peintures), nombre d'images du registre après un tour de 24 h, ms par image à 8 h et 21 h avant et après (main contre branche).

- [ ] **Step 4: Montrer les captures à l'utilisateur** (SendUserFile) et attendre sa validation ; corriger au besoin (nouveau commit par correction).

---

### Task 10: PR, fusion, pré-prod

- [ ] **Step 1:** `npm run build` (sans erreur).
- [ ] **Step 2:** Pousser la branche, ouvrir la PR (`gh pr create --body-file` — jamais de heredoc sur stdin), résumé + captures + mesures + limites, terminée par `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 3:** Fusionner la PR (consigne permanente), puis `npm run preprod` depuis `main` à jour (consigne permanente : pré-prod sans demander ; production seulement sur ordre explicite).
- [ ] **Step 4:** Mettre à jour la mémoire `project_ghibli.md` / `project_g4_commerces.md` (PR, merge, numéro de pré-prod, reste à faire : vérification sur le téléphone, G4b).
