# Meubles aux vraies proportions — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dessiner chaque meuble debout à partir d'un vrai modèle 3D en cm (vraies proportions), sous ses 8 angles, avec une empreinte au sol tirée de sa vraie trace — d'abord en maquette à faire valider, puis intégré partout (pièce, collision, animaux, lumière, zoom, vignettes, migration des pièces).

**Architecture:** `furniture-models.ts` (données : dimensions et pièces en cm) + `furniture-render3d.ts` (pur : rotation, projection dans la perspective de la pièce, faces visibles triées, rectangle de dessin, cases au sol à 50 %, points d'intérêt, face avant, occulteurs) + `Model3DArt` (composant SVG). Phase A s'arrête sur la maquette ; la phase B branche le moteur dans `footprint.ts`/`furniture-catalog.ts` (qui gardent leur API) et retire les anciens dessins.

**Tech Stack:** TypeScript, React 18 (SVG), Vitest + jsdom, zod.

**Spec:** `docs/superpowers/specs/2026-10-13-meubles-vraies-proportions-design.md`

## Global Constraints

- Worktree `C:/Users/maxim/Downloads/Wikimasters-modeles`, branche `feat/meubles-vraies-proportions` ; ne jamais toucher `C:/Users/maxim/Downloads/Wikimasters tools`.
- Échelle : `PX_PER_CM_X = 30 / 21`, `PX_PER_CM_Y = (510 / 18) / 21`, `DEPTH_PX_PER_CM = (510 / 18) / 50` (une rangée de sol = 50 cm, une case = 21 cm).
- Angles : 0 face, 1 ¾ avant gauche, 2 profil gauche, 3 ¾ dos gauche, 4 dos, 5 ¾ dos droit, 6 profil droit, 7 ¾ avant droit ; θ = angle × 45° ; ⟲ +1, ⟳ −1.
- Case au sol occupée si la trace du meuble en couvre **plus de 50 %** ; au moins une case (celle de plus grande couverture).
- Dimensions du catalogue (cm, L × P × H) : étagère 80×30×180, bureau 120×60×75, chaise 45×50×90, canapé 200×90×85, fauteuil 80×80×90, table basse 100×55×45, lampe 40×40×160, plante 45×45×110, tapis 200×140×1, panier 60×45×25, gamelle 20×20×8, niche 70×90×75, station 40×30×10, globe 50×50×100, télescope 60×60×130, automate 45×40×110.
- **Phase A (Tâches 1-3) se termine par un ARRÊT : captures envoyées, attendre la validation explicite de l'utilisateur avant la Tâche 4.**
- Rendu : aplats + trait encré (`stroke` = `palette.edge`, 1,2 px, `strokeLinejoin="round"`), ombrage par orientation (face 1, côté 0,82, dessus 1,12). Commentaire `// Dessin provisoire Opus — reprise Fable prévue.` en tête des fichiers de dessin.
- Français partout (code, commentaires, commits) ; commits terminés par `Co-Authored-By: Claude <modèle réel> <noreply@anthropic.com>`.
- Tests : familles `scene-piece` (+ `scene-animaux`, `scene-lumiere` quand touchées) ; jamais le TNR global. Nouveaux fichiers de test ajoutés à une famille dans `tests/familles.ts`.
- WikiHow : hors champ.

## Review Focus

- Meuble minuscule (gamelle 20×20 cm) à un angle diagonal : aucune case ne dépasse 50 % → il doit quand même occuper exactement 1 case (la plus couverte) → test Tâche 1.
- Pièce v5 réelle dont un meuble agrandi (canapé 6→10 colonnes) déborde du bord droit ou chevauche : il est déplacé à la place libre la plus proche, jamais supprimé ; sans place, gardé tel quel → test Tâche 5.
- Hauteur constante : une étagère tournée ne doit pas devenir plus haute qu'à l'angle 0 (± 1 case) — le défaut signalé par l'utilisateur → test Tâche 2.
- Ordre de dessin des faces : un pied arrière ne doit pas passer devant l'assise (tri par profondeur des pièces) → test Tâche 1.
- Lampe allumée/éteinte : l'abat-jour change de couleur quel que soit l'angle → test Tâche 3.

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/core/library/furniture-render3d.ts` (nouveau) | Moteur pur : types `Piece`, `Model`, `Shape` ; `renderModel`, `floorCellsOf`, `poisOf3d`, `frontFaceOf`, `occluderBoxesOf` |
| `src/core/library/furniture-models.ts` (nouveau) | `FURNITURE_MODELS: Record<StandingKind, Model>` (dimensions, pièces, points d'intérêt, face avant) |
| `src/content/model3d-art.tsx` (nouveau) | `Model3DArt` : dessine les `Shape` d'un meuble dans un rectangle |
| `.superpowers/harness-modeles/` (non suivi) | Planche de maquette + script de captures |
| `src/core/library/footprint.ts`, `furniture-catalog.ts` | Branchés sur le moteur (API inchangée) |
| `src/core/library/library-book.ts` | Migration v5 → v6 |
| `src/content/RoomView.tsx`, `furniture-thumb.tsx`, `furniture-zoom.tsx` | Dessin par `Model3DArt` |
| `src/core/library/pets/*`, `light/occluders.ts` | Points d'intérêt et occulteurs depuis les modèles |
| Retirés | `furniture-volumes.ts`, `furniture-projection.ts`, `furniture-angled.tsx` (meubles), dessins de meubles debout de `furniture-art-home.tsx`, `ShelfArt`/`DeskArt`, `SteampunkArt` (meubles debout) |

---

## PHASE A — maquette

### Task 1: Moteur 3D pur

**Files:**
- Create: `src/core/library/furniture-render3d.ts`
- Test: `tests/core/library/furniture-render3d.test.ts` (famille `scene-piece` : `'furniture-render3d.*'` dans `lib(...)`)

**Interfaces:**
- Produces:
  ```ts
  export type Fill = keyof Palette;
  export type Piece =
    | { shape: 'box'; x: number; y: number; z: number; w: number; h: number; d: number; fill: Fill }
    | { shape: 'cyl'; cx: number; cz: number; y: number; r: number; h: number; fill: Fill }
    | { shape: 'ball'; cx: number; cy: number; cz: number; rx: number; ry: number; rz: number; fill: Fill };
  export type Poi3d = { type: PoiType; x: number; y: number; z: number };
  export type Model = { w: number; d: number; h: number; pieces: Piece[]; pois?: Poi3d[]; face?: { x: number; y: number; w: number; h: number } };
  export type Shape =
    | { kind: 'poly'; points: [number, number][]; fill: Fill; shade: number }
    | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: Fill; shade: number };
  export type Rendered = { shapes: Shape[]; cols: number; rows: number; floor: { col: number; row: number }[] };
  export const PX_PER_CM_X: number; export const PX_PER_CM_Y: number; export const DEPTH_PX_PER_CM: number;
  export function renderModel(model: Model, angle: Angle): Rendered;   // coordonnées des formes en px, origine = coin haut-gauche du rectangle de dessin (cols × rows cases)
  export function poisOf3d(model: Model, angle: Angle): { type: PoiType; col: number; row: number }[];
  export function frontFaceOf(model: Model, angle: Angle): { x: number; y: number; w: number; h: number } | null; // px dans le rectangle de dessin ; null si la face avant n'est pas visible (angles 2 à 6)
  ```
  (`Box`-occulteurs : Tâche 7.)

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/library/furniture-render3d.test.ts
import { describe, expect, it } from 'vitest';
import { DEPTH_PX_PER_CM, PX_PER_CM_X, PX_PER_CM_Y, frontFaceOf, poisOf3d, renderModel, type Model } from '../../../src/core/library/furniture-render3d';

const CELL_W = 30;
const CELL_H = 510 / 18;
const cube: Model = { w: 84, d: 50, h: 84, pieces: [{ shape: 'box', x: 0, y: 0, z: 0, w: 84, h: 84, d: 50, fill: 'wood' }], face: { x: 0, y: 0, w: 84, h: 84 } };
const ANGLES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

describe('échelle', () => {
  it('21 cm par case, 50 cm par rangée de sol', () => {
    expect(PX_PER_CM_X * 21).toBeCloseTo(CELL_W);
    expect(PX_PER_CM_Y * 21).toBeCloseTo(CELL_H);
    expect(DEPTH_PX_PER_CM * 50).toBeCloseTo(CELL_H);
  });
});

describe('renderModel', () => {
  it('cube de face : 4 colonnes, dessus visible, 1 rangée au sol × 4 colonnes', () => {
    const r = renderModel(cube, 0);
    expect(r.cols).toBe(4);
    expect(r.rows).toBe(5); // 84 cm de haut = 4 cases + 50 cm de profondeur qui remontent = 1 case
    expect(r.floor).toEqual([0, 1, 2, 3].map((col) => ({ col, row: 4 })));
    expect(r.shapes.some((s) => s.kind === 'poly' && s.shade === 1.12)).toBe(true); // dessus
  });
  it('toutes les formes sont finies et dans le rectangle, à chaque angle', () => {
    for (const a of ANGLES) {
      const r = renderModel(cube, a);
      for (const s of r.shapes) {
        const pts = s.kind === 'poly' ? s.points : [[s.cx - s.rx, s.cy - s.ry], [s.cx + s.rx, s.cy + s.ry]];
        for (const [x, y] of pts) {
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(-0.5);
          expect(x).toBeLessThanOrEqual(r.cols * CELL_W + 0.5);
          expect(y).toBeGreaterThanOrEqual(-0.5);
          expect(y).toBeLessThanOrEqual(r.rows * CELL_H + 0.5);
        }
      }
    }
  });
  it('hauteur constante à ± 1 case quel que soit l’angle', () => {
    const tall: Model = { w: 80, d: 30, h: 180, pieces: [{ shape: 'box', x: 0, y: 0, z: 0, w: 80, h: 180, d: 30, fill: 'wood' }] };
    const h0 = renderModel(tall, 0).rows;
    for (const a of ANGLES) expect(Math.abs(renderModel(tall, a).rows - h0)).toBeLessThanOrEqual(1);
  });
  it('de profil, la largeur dessinée est la profondeur', () => {
    const tall: Model = { w: 80, d: 30, h: 180, pieces: [{ shape: 'box', x: 0, y: 0, z: 0, w: 80, h: 180, d: 30, fill: 'wood' }] };
    expect(renderModel(tall, 2).cols).toBe(2); // 30 cm → 1,43 case → 2
    expect(renderModel(tall, 2).floor).toHaveLength(2); // 30 cm de large sur 80 cm de profondeur : les deux cases de la rangée de devant (la 2e rangée est couverte à moins de 50 %)
  });
  it('7 est le miroir de 1 pour un modèle symétrique', () => {
    const one = renderModel(cube, 1);
    const seven = renderModel(cube, 7);
    expect(seven.cols).toBe(one.cols);
    expect(seven.floor.map((c) => `${one.cols - 1 - c.col}-${c.row}`).sort()).toEqual(one.floor.map((c) => `${c.col}-${c.row}`).sort());
  });
  it('un objet minuscule en diagonale occupe exactement une case', () => {
    const tiny: Model = { w: 20, d: 20, h: 8, pieces: [{ shape: 'cyl', cx: 10, cz: 10, y: 0, r: 10, h: 8, fill: 'metal' }] };
    for (const a of ANGLES) expect(renderModel(tiny, a).floor).toHaveLength(1);
  });
  it('trace en diagonale : escalier, pas un rectangle plein', () => {
    const sofa: Model = { w: 200, d: 90, h: 85, pieces: [{ shape: 'box', x: 0, y: 0, z: 0, w: 200, h: 85, d: 90, fill: 'fabric' }] };
    const r = renderModel(sofa, 1);
    const rows = new Set(r.floor.map((c) => c.row));
    expect(rows.size).toBeGreaterThan(1);
    expect(r.floor.length).toBeLessThan(r.cols * rows.size);
  });
  it('un pied arrière est dessiné avant l’assise (ordre de profondeur)', () => {
    const chair: Model = {
      w: 45, d: 50, h: 90,
      pieces: [
        { shape: 'box', x: 2, y: 44, z: 2, w: 41, h: 4, d: 44, fill: 'desk' },
        { shape: 'box', x: 3, y: 0, z: 44, w: 3, h: 44, d: 3, fill: 'leg' },
      ],
    };
    const shapes = renderModel(chair, 0).shapes;
    const firstLeg = shapes.findIndex((s) => s.fill === 'leg');
    const lastSeat = shapes.map((s) => s.fill).lastIndexOf('desk');
    expect(firstLeg).toBeLessThan(lastSeat);
  });
});

describe('points d’intérêt et face avant', () => {
  it('un point au sol à l’avant tombe sur la dernière rangée', () => {
    const m: Model = { ...cube, pois: [{ type: 'eat', x: 10, y: 0, z: 5 }] };
    expect(poisOf3d(m, 0)).toEqual([{ type: 'eat', col: 0, row: 4 }]);
  });
  it('face avant visible de face et de ¾, cachée sinon', () => {
    expect(frontFaceOf(cube, 0)).not.toBeNull();
    expect(frontFaceOf(cube, 1)).not.toBeNull();
    expect(frontFaceOf(cube, 7)).not.toBeNull();
    for (const a of [2, 3, 4, 5, 6] as const) expect(frontFaceOf(cube, a)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run --project=scene-piece tests/core/library/furniture-render3d.test.ts` (après avoir ajouté le motif à `tests/familles.ts`)
Expected: FAIL — module absent.

- [ ] **Step 3: Implementation**

```ts
// src/core/library/furniture-render3d.ts
import type { Angle } from './footprint';
import type { PoiType } from './furniture-catalog';
import type { Palette } from './styles';

// Moteur 3D des meubles : modèle en cm (x largeur depuis la gauche vue de face, y hauteur depuis le sol, z profondeur depuis l'avant),
// vraie rotation de 45° en 45° autour de l'axe vertical, projection dans la perspective de la pièce (le fond est plus haut à l'écran).
export type Fill = keyof Palette;
export type Piece =
  | { shape: 'box'; x: number; y: number; z: number; w: number; h: number; d: number; fill: Fill }
  | { shape: 'cyl'; cx: number; cz: number; y: number; r: number; h: number; fill: Fill }
  | { shape: 'ball'; cx: number; cy: number; cz: number; rx: number; ry: number; rz: number; fill: Fill };
export type Poi3d = { type: PoiType; x: number; y: number; z: number };
// `face` : rectangle de la face avant (x, y depuis le sol, en cm) où se rangent les cartes et s'affiche l'écran.
export type Model = { w: number; d: number; h: number; pieces: Piece[]; pois?: Poi3d[]; face?: { x: number; y: number; w: number; h: number } };
export type Shape =
  | { kind: 'poly'; points: [number, number][]; fill: Fill; shade: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: Fill; shade: number };
export type Rendered = { shapes: Shape[]; cols: number; rows: number; floor: { col: number; row: number }[] };

const CELL_W = 30;
const CELL_H = 510 / 18;
// Une case = 21 cm (largeur et hauteur), une rangée de sol = 50 cm de profondeur.
export const PX_PER_CM_X = CELL_W / 21;
export const PX_PER_CM_Y = CELL_H / 21;
export const DEPTH_PX_PER_CM = CELL_H / 50;
const SHADE = { front: 1, side: 0.82, top: 1.12 } as const;
const CYL_SIDES = 12;

type V3 = { x: number; y: number; z: number };
type Frame = { cos: number; sin: number; cx: number; cz: number; minX: number; minZ: number };

// Rotation autour du centre de la base ; angle 1 = la face avant tourne vers la gauche.
function frameOf(model: Model, angle: Angle): Frame {
  const t = (angle * Math.PI) / 4;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const cx = model.w / 2;
  const cz = model.d / 2;
  const base: [number, number][] = [[0, 0], [model.w, 0], [model.w, model.d], [0, model.d]];
  const rot = base.map(([x, z]) => turn({ cos, sin, cx, cz, minX: 0, minZ: 0 }, x, z));
  return { cos, sin, cx, cz, minX: Math.min(...rot.map((p) => p[0])), minZ: Math.min(...rot.map((p) => p[1])) };
}
// (x, z) du modèle → (x', z') tournés, encore non décalés.
function turn(f: Pick<Frame, 'cos' | 'sin' | 'cx' | 'cz'>, x: number, z: number): [number, number] {
  const dx = x - f.cx;
  const dz = z - f.cz;
  return [f.cx + dx * f.cos + dz * f.sin, f.cz - dx * f.sin + dz * f.cos];
}
// Point du modèle → (x' depuis la gauche de la trace, z' depuis l'avant de la trace), en cm.
function local(f: Frame, p: V3): { x: number; y: number; z: number } {
  const [x, z] = turn(f, p.x, p.z);
  return { x: x - f.minX, y: p.y, z: z - f.minZ };
}

// Trace tournée de la base (polygone convexe en cm, repère local).
function footprint(model: Model, f: Frame): [number, number][] {
  return ([[0, 0], [model.w, 0], [model.w, model.d], [0, model.d]] as const).map(([x, z]) => {
    const p = local(f, { x, y: 0, z });
    return [p.x, p.z];
  });
}

// Aire d'un polygone convexe découpé par un rectangle (Sutherland–Hodgman).
function clippedArea(poly: [number, number][], x0: number, x1: number, z0: number, z1: number): number {
  const clip = (pts: [number, number][], inside: (p: [number, number]) => boolean, cut: (a: [number, number], b: [number, number]) => [number, number]) => {
    const out: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      if (inside(b)) {
        if (!inside(a)) out.push(cut(a, b));
        out.push(b);
      } else if (inside(a)) out.push(cut(a, b));
    }
    return out;
  };
  const atX = (x: number) => (a: [number, number], b: [number, number]): [number, number] => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
  const atZ = (z: number) => (a: [number, number], b: [number, number]): [number, number] => [a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]), z];
  let pts = poly;
  pts = clip(pts, (p) => p[0] >= x0, atX(x0));
  pts = clip(pts, (p) => p[0] <= x1, atX(x1));
  pts = clip(pts, (p) => p[1] >= z0, atZ(z0));
  pts = clip(pts, (p) => p[1] <= z1, atZ(z1));
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[(i + 1) % pts.length]!;
    area += ax * bz - bx * az;
  }
  return Math.abs(area) / 2;
}

type Layout3d = { f: Frame; cols: number; rows: number; depthRows: number; toPx: (p: V3) => [number, number] };

// Taille du rectangle de dessin et passage d'un point du modèle aux px du rectangle (origine en haut à gauche).
function layoutOf(model: Model, angle: Angle): Layout3d {
  const f = frameOf(model, angle);
  const trace = footprint(model, f);
  const traceW = Math.max(...trace.map((p) => p[0]));
  const traceD = Math.max(...trace.map((p) => p[1]));
  const cols = Math.max(1, Math.ceil(traceW / 21 - 0.15));
  const depthRows = Math.max(1, Math.round(traceD / 50));
  const heightPx = model.h * PX_PER_CM_Y + traceD * DEPTH_PX_PER_CM;
  const rows = Math.max(depthRows, Math.round(heightPx / CELL_H));
  const bottom = rows * CELL_H;
  const offsetX = (cols * CELL_W - traceW * PX_PER_CM_X) / 2;
  const toPx = (p: V3): [number, number] => {
    const l = local(f, p);
    return [offsetX + l.x * PX_PER_CM_X, bottom - l.y * PX_PER_CM_Y - l.z * DEPTH_PX_PER_CM];
  };
  return { f, cols, rows, depthRows, toPx };
}

// Profondeur (z' tourné) d'un point : sert au tri du plus loin au plus proche.
const depthOf = (f: Frame, x: number, z: number): number => turn(f, x, z)[1];

type Face = { pts: V3[]; normal: V3; shade: number };

function boxFaces(p: Extract<Piece, { shape: 'box' }>): Face[] {
  const { x, y, z, w, h, d } = p;
  const v = (a: number, b: number, c: number): V3 => ({ x: a, y: b, z: c });
  return [
    { pts: [v(x, y, z), v(x + w, y, z), v(x + w, y + h, z), v(x, y + h, z)], normal: v(0, 0, -1), shade: SHADE.front },
    { pts: [v(x + w, y, z + d), v(x, y, z + d), v(x, y + h, z + d), v(x + w, y + h, z + d)], normal: v(0, 0, 1), shade: SHADE.front },
    { pts: [v(x, y, z + d), v(x, y, z), v(x, y + h, z), v(x, y + h, z + d)], normal: v(-1, 0, 0), shade: SHADE.side },
    { pts: [v(x + w, y, z), v(x + w, y, z + d), v(x + w, y + h, z + d), v(x + w, y + h, z)], normal: v(1, 0, 0), shade: SHADE.side },
    { pts: [v(x, y + h, z), v(x + w, y + h, z), v(x + w, y + h, z + d), v(x, y + h, z + d)], normal: v(0, 1, 0), shade: SHADE.top },
  ];
}

function cylFaces(p: Extract<Piece, { shape: 'cyl' }>): Face[] {
  const faces: Face[] = [];
  const ring = Array.from({ length: CYL_SIDES }, (_, i) => (i * 2 * Math.PI) / CYL_SIDES);
  for (let i = 0; i < CYL_SIDES; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % CYL_SIDES]!;
    const m = (a + b) / 2;
    const P = (t: number, yy: number): V3 => ({ x: p.cx + p.r * Math.cos(t), y: yy, z: p.cz + p.r * Math.sin(t) });
    faces.push({ pts: [P(a, p.y), P(b, p.y), P(b, p.y + p.h), P(a, p.y + p.h)], normal: { x: Math.cos(m), y: 0, z: Math.sin(m) }, shade: SHADE.side + (SHADE.front - SHADE.side) * Math.max(0, -Math.sin(m)) });
  }
  faces.push({ pts: ring.map((t) => ({ x: p.cx + p.r * Math.cos(t), y: p.y + p.h, z: p.cz + p.r * Math.sin(t) })), normal: { x: 0, y: 1, z: 0 }, shade: SHADE.top });
  return faces;
}

// Normale tournée : visible si elle regarde le spectateur (z' < 0) ou vers le haut.
function visible(f: Frame, n: V3): boolean {
  if (n.y > 0) return true;
  const z = -n.x * f.sin + n.z * f.cos;
  return z < -1e-6;
}

export function renderModel(model: Model, angle: Angle): Rendered {
  const L = layoutOf(model, angle);
  const { f } = L;
  // Pièces du plus loin au plus proche (centre de la base tourné), puis de bas en haut.
  const center = (p: Piece): [number, number, number] =>
    p.shape === 'box' ? [p.x + p.w / 2, p.y, p.z + p.d / 2] : p.shape === 'cyl' ? [p.cx, p.y, p.cz] : [p.cx, p.cy - p.ry, p.cz];
  const order = [...model.pieces].sort((a, b) => {
    const [ax, ay, az] = center(a);
    const [bx, by, bz] = center(b);
    return depthOf(f, bx, bz) - depthOf(f, ax, az) || ay - by;
  });
  const shapes: Shape[] = [];
  for (const p of order) {
    if (p.shape === 'ball') {
      const [cx, cy] = L.toPx({ x: p.cx, y: p.cy, z: p.cz });
      const rx = Math.hypot(p.rx * f.cos, p.rz * f.sin) * PX_PER_CM_X;
      shapes.push({ kind: 'ellipse', cx, cy, rx, ry: p.ry * PX_PER_CM_Y, fill: p.fill, shade: SHADE.front });
      continue;
    }
    const faces = (p.shape === 'box' ? boxFaces(p) : cylFaces(p)).filter((fc) => visible(f, fc.normal));
    // Le dessus en dernier (il recouvre le haut des côtés), sinon les faces du fond d'abord.
    faces.sort((a, b) => (a.normal.y - b.normal.y) || 0);
    for (const fc of faces) shapes.push({ kind: 'poly', points: fc.pts.map((pt) => L.toPx(pt)), fill: p.fill, shade: fc.shade });
  }
  return { shapes, cols: L.cols, rows: L.rows, floor: floorOf(model, L) };
}

// Cases au sol : couvertes à plus de 50 % par la trace tournée ; au moins la plus couverte.
function floorOf(model: Model, L: Layout3d): { col: number; row: number }[] {
  const trace = footprint(model, L.f);
  const traceW = Math.max(...trace.map((p) => p[0]));
  const shiftX = (L.cols * 21 - traceW) / 2;
  const cells: { col: number; row: number; cover: number }[] = [];
  for (let c = 0; c < L.cols; c++) {
    for (let k = 0; k < L.depthRows; k++) {
      const area = clippedArea(trace, c * 21 - shiftX, (c + 1) * 21 - shiftX, k * 50, (k + 1) * 50);
      cells.push({ col: c, row: L.rows - 1 - k, cover: area / (21 * 50) });
    }
  }
  const full = cells.filter((c) => c.cover > 0.5);
  const picked = full.length > 0 ? full : [cells.reduce((a, b) => (b.cover > a.cover ? b : a))];
  return picked.map(({ col, row }) => ({ col, row })).sort((a, b) => a.row - b.row || a.col - b.col);
}

export function poisOf3d(model: Model, angle: Angle): { type: PoiType; col: number; row: number }[] {
  const L = layoutOf(model, angle);
  return (model.pois ?? []).map((p) => {
    const [x, y] = L.toPx(p);
    return { type: p.type, col: Math.min(L.cols - 1, Math.max(0, Math.floor(x / CELL_W))), row: Math.min(L.rows - 1, Math.max(0, Math.floor(y / CELL_H))) };
  });
}

// Face avant projetée (rectangle englobant, px dans le rectangle de dessin) ; null si on ne la voit pas (profil, dos).
export function frontFaceOf(model: Model, angle: Angle): { x: number; y: number; w: number; h: number } | null {
  if (angle !== 0 && angle !== 1 && angle !== 7) return null;
  const face = model.face ?? { x: 0, y: 0, w: model.w, h: model.h };
  const L = layoutOf(model, angle);
  const pts = [[face.x, face.y], [face.x + face.w, face.y], [face.x + face.w, face.y + face.h], [face.x, face.y + face.h]].map(([x, y]) => L.toPx({ x: x!, y: y!, z: 0 }));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
```

Note : si un test d'attente chiffrée (cube 4 × 5, profil 2 colonnes) diffère d'une unité à cause d'un arrondi, ajuster **le calcul** (`cols`/`rows`) pour respecter le test, pas l'inverse ; signaler tout cas où c'est impossible sans casser un autre test.

- [ ] **Step 4: Run tests** — `npx vitest run --project=scene-piece tests/core/library/furniture-render3d.test.ts` → PASS.
- [ ] **Step 5: Commit** — `feat(bibliotheque): moteur 3D des meubles (vraie rotation, projection de la pièce, cases au sol à 50 %)`.

---

### Task 2: Modèles des 16 meubles

**Files:**
- Create: `src/core/library/furniture-models.ts`
- Test: `tests/core/library/furniture-models.test.ts` (famille `scene-piece`)

**Interfaces:**
- Consumes: `Model`, `Piece`, `renderModel` (Tâche 1).
- Produces: `export const FURNITURE_MODELS: Record<StandingKind, Model>` ; `export const STEAMPUNK_TRIM: Partial<Record<StandingKind, Piece[]>>`.

- [ ] **Step 1: Failing test**

```ts
// tests/core/library/furniture-models.test.ts
import { describe, expect, it } from 'vitest';
import { STANDING_KINDS } from '../../../src/core/library/library-types';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { renderModel } from '../../../src/core/library/furniture-render3d';

const DIMS: Record<string, [number, number, number]> = {
  shelf: [80, 30, 180], desk: [120, 60, 75], chair: [45, 50, 90], sofa: [200, 90, 85], armchair: [80, 80, 90],
  'coffee-table': [100, 55, 45], lamp: [40, 40, 160], plant: [45, 45, 110], rug: [200, 140, 1], basket: [60, 45, 25],
  bowl: [20, 20, 8], kennel: [70, 90, 75], charger: [40, 30, 10], globe: [50, 50, 100], telescope: [60, 60, 130], automaton: [45, 40, 110],
};

describe('modèles', () => {
  it.each(STANDING_KINDS)('%s : dimensions réelles du catalogue', (kind) => {
    const m = FURNITURE_MODELS[kind];
    expect([m.w, m.d, m.h]).toEqual(DIMS[kind]);
  });
  it.each(STANDING_KINDS)('%s : toutes les pièces tiennent dans la boîte du meuble', (kind) => {
    const m = FURNITURE_MODELS[kind];
    for (const p of m.pieces) {
      const [x0, x1, y0, y1, z0, z1] = p.shape === 'box' ? [p.x, p.x + p.w, p.y, p.y + p.h, p.z, p.z + p.d]
        : p.shape === 'cyl' ? [p.cx - p.r, p.cx + p.r, p.y, p.y + p.h, p.cz - p.r, p.cz + p.r]
        : [p.cx - p.rx, p.cx + p.rx, p.cy - p.ry, p.cy + p.ry, p.cz - p.rz, p.cz + p.rz];
      expect(x0).toBeGreaterThanOrEqual(-0.01); expect(x1).toBeLessThanOrEqual(m.w + 0.01);
      expect(y0).toBeGreaterThanOrEqual(-0.01); expect(y1).toBeLessThanOrEqual(m.h + 0.01);
      expect(z0).toBeGreaterThanOrEqual(-0.01); expect(z1).toBeLessThanOrEqual(m.d + 0.01);
    }
  });
  it('tailles de face proches du tableau de la spec (± 1 case)', () => {
    const FACE: Record<string, [number, number]> = { shelf: [4, 9], desk: [6, 4], chair: [2, 4], sofa: [10, 4], armchair: [4, 4], 'coffee-table': [5, 2], lamp: [2, 8], plant: [2, 5], basket: [3, 1], bowl: [1, 1], kennel: [3, 4], charger: [2, 1], globe: [2, 5], telescope: [3, 6], automaton: [2, 5] };
    for (const [kind, [w, h]] of Object.entries(FACE)) {
      const r = renderModel(FURNITURE_MODELS[kind as keyof typeof FURNITURE_MODELS], 0);
      expect(Math.abs(r.cols - w)).toBeLessThanOrEqual(1);
      expect(Math.abs(r.rows - h)).toBeLessThanOrEqual(2); // + la profondeur qui remonte
    }
  });
  it('l’étagère tournée ne grandit pas (± 1 case)', () => {
    const h0 = renderModel(FURNITURE_MODELS.shelf, 0).rows;
    for (const a of [1, 2, 3, 4, 5, 6, 7] as const) expect(Math.abs(renderModel(FURNITURE_MODELS.shelf, a).rows - h0)).toBeLessThanOrEqual(1);
  });
  it('les points d’intérêt historiques existent toujours', () => {
    expect(FURNITURE_MODELS.sofa.pois?.filter((p) => p.type === 'seat')).toHaveLength(3);
    expect(FURNITURE_MODELS.sofa.pois?.some((p) => p.type === 'sleep')).toBe(true);
    expect(FURNITURE_MODELS.chair.pois?.[0]?.type).toBe('seat');
    expect(FURNITURE_MODELS.charger.pois?.[0]?.type).toBe('charge');
    expect(FURNITURE_MODELS.kennel.pois?.map((p) => p.type).sort()).toEqual(['enter', 'sleep']);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementation**

```ts
// src/core/library/furniture-models.ts
// Dessin provisoire Opus — reprise Fable prévue.
import type { StandingKind } from './library-types';
import type { Model, Piece } from './furniture-render3d';

// Modèles des meubles en cm (x largeur depuis la gauche vue de face, y hauteur depuis le sol, z profondeur depuis l'avant).
// Ils reprennent les dessins de face historiques : mêmes éléments, mêmes couleurs de palette.
const box = (x: number, y: number, z: number, w: number, h: number, d: number, fill: Piece['fill']): Piece => ({ shape: 'box', x, y, z, w, h, d, fill });
const cyl = (cx: number, cz: number, y: number, r: number, h: number, fill: Piece['fill']): Piece => ({ shape: 'cyl', cx, cz, y, r, h, fill });
const ball = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, fill: Piece['fill']): Piece => ({ shape: 'ball', cx, cy, cz, rx, ry, rz, fill });
// Quatre pieds carrés aux coins d'une base w × d.
const legs = (w: number, d: number, h: number, size: number, inset: number, fill: Piece['fill']): Piece[] => [
  box(inset, 0, inset, size, h, size, fill), box(w - inset - size, 0, inset, size, h, size, fill),
  box(inset, 0, d - inset - size, size, h, size, fill), box(w - inset - size, 0, d - inset - size, size, h, size, fill),
];

export const FURNITURE_MODELS: Record<StandingKind, Model> = {
  shelf: {
    w: 80, d: 30, h: 180,
    pieces: [
      box(3, 8, 28, 74, 169, 2, 'woodDark'),
      box(0, 0, 0, 3, 180, 30, 'wood'), box(77, 0, 0, 3, 180, 30, 'wood'),
      box(3, 0, 0, 74, 8, 30, 'wood'), box(3, 58, 0, 74, 3, 28, 'wood'), box(3, 118, 0, 74, 3, 28, 'wood'), box(0, 177, 0, 80, 3, 30, 'wood'),
    ],
    face: { x: 3, y: 8, w: 74, h: 169 },
  },
  desk: {
    w: 120, d: 60, h: 75,
    pieces: [...legs(120, 60, 72, 4, 4, 'leg'), box(0, 72, 0, 120, 3, 60, 'desk')],
    face: { x: 0, y: 72, w: 120, h: 3 },
  },
  chair: {
    w: 45, d: 50, h: 90,
    pieces: [
      ...legs(45, 50, 44, 3, 3, 'leg'),
      box(2, 44, 2, 41, 4, 44, 'desk'),
      box(3, 48, 44, 3, 42, 3, 'wood'), box(39, 48, 44, 3, 42, 3, 'wood'),
      box(3, 66, 44, 39, 6, 3, 'wood'), box(3, 80, 44, 39, 8, 3, 'wood'),
    ],
    pois: [{ type: 'seat', x: 22, y: 48, z: 24 }],
  },
  sofa: {
    w: 200, d: 90, h: 85,
    pieces: [
      ...legs(200, 90, 12, 6, 8, 'leg'),
      box(0, 12, 0, 200, 30, 90, 'fabric'),
      box(0, 42, 68, 200, 43, 22, 'fabric'),
      box(0, 42, 0, 22, 25, 68, 'fabricDark'), box(178, 42, 0, 22, 25, 68, 'fabricDark'),
      box(22, 42, 4, 78, 12, 62, 'fabricLight'), box(100, 42, 4, 78, 12, 62, 'fabricLight'),
    ],
    pois: [{ type: 'seat', x: 50, y: 54, z: 35 }, { type: 'seat', x: 100, y: 54, z: 35 }, { type: 'seat', x: 150, y: 54, z: 35 }, { type: 'sleep', x: 120, y: 54, z: 35 }],
  },
  armchair: {
    w: 80, d: 80, h: 90,
    pieces: [
      ...legs(80, 80, 12, 6, 6, 'leg'),
      box(0, 12, 0, 80, 30, 80, 'warm'),
      box(0, 42, 60, 80, 48, 20, 'warm'),
      box(0, 42, 0, 14, 24, 60, 'warmDark'), box(66, 42, 0, 14, 24, 60, 'warmDark'),
      box(14, 42, 4, 52, 12, 54, 'warmLight'),
    ],
    pois: [{ type: 'seat', x: 40, y: 54, z: 30 }],
  },
  'coffee-table': { w: 100, d: 55, h: 45, pieces: [...legs(100, 55, 41, 4, 5, 'leg'), box(0, 41, 0, 100, 4, 55, 'desk')] },
  lamp: {
    w: 40, d: 40, h: 160,
    pieces: [cyl(20, 20, 0, 15, 3, 'metal'), cyl(20, 20, 3, 1.5, 125, 'metal'), cyl(20, 20, 125, 17, 35, 'shade')],
  },
  plant: {
    w: 45, d: 45, h: 110,
    pieces: [cyl(22.5, 22.5, 0, 15, 35, 'warm'), ball(22.5, 72, 22.5, 22, 38, 22, 'leaf'), ball(16, 92, 18, 10, 14, 10, 'leafDark')],
  },
  rug: { w: 200, d: 140, h: 1, pieces: [box(0, 0, 0, 200, 1, 140, 'rug')] },
  basket: {
    w: 60, d: 45, h: 25,
    pieces: [box(0, 0, 0, 60, 25, 45, 'warm'), box(6, 12, 6, 48, 8, 33, 'fabricLight')],
    pois: [{ type: 'curl', x: 30, y: 20, z: 22 }],
  },
  bowl: { w: 20, d: 20, h: 8, pieces: [cyl(10, 10, 0, 10, 8, 'metal'), cyl(10, 10, 7, 8, 1, 'warm')], pois: [{ type: 'eat', x: 10, y: 0, z: 10 }] },
  kennel: {
    w: 70, d: 90, h: 75,
    pieces: [box(0, 0, 0, 70, 50, 90, 'wood'), box(0, 50, 0, 70, 10, 90, 'door'), box(20, 60, 0, 30, 15, 90, 'door'), box(22, 0, 0, 26, 36, 0.5, 'woodDark')],
    pois: [{ type: 'enter', x: 35, y: 0, z: 2 }, { type: 'sleep', x: 35, y: 10, z: 50 }],
  },
  charger: {
    w: 40, d: 30, h: 10,
    pieces: [box(0, 0, 0, 40, 4, 30, 'metal'), box(0, 4, 24, 40, 6, 6, 'metal'), box(18, 9, 25, 4, 1, 2, 'leaf')],
    pois: [{ type: 'charge', x: 20, y: 4, z: 12 }],
  },
  globe: { w: 50, d: 50, h: 100, pieces: [cyl(25, 25, 0, 20, 4, 'wood'), cyl(25, 25, 4, 2, 52, 'wood'), ball(25, 75, 25, 25, 25, 25, 'metal')] },
  telescope: { w: 60, d: 60, h: 130, pieces: [cyl(30, 30, 0, 25, 3, 'woodDark'), cyl(30, 30, 3, 3, 87, 'wood'), box(5, 90, 23, 50, 14, 14, 'metal'), cyl(52, 30, 104, 3, 8, 'metal')] },
  automaton: {
    w: 45, d: 40, h: 110,
    pieces: [box(8, 0, 13, 10, 35, 14, 'woodDark'), box(27, 0, 13, 10, 35, 14, 'woodDark'), box(4, 35, 6, 37, 45, 28, 'metal'), box(11, 80, 10, 23, 28, 20, 'metal')],
  },
};

// Garnitures en laiton ajoutées dans une pièce Steampunk.
export const STEAMPUNK_TRIM: Partial<Record<StandingKind, Piece[]>> = {
  desk: [box(0, 70, 0, 120, 2, 1, 'metal')],
  armchair: [box(0, 66, 0, 14, 1, 60, 'metal'), box(66, 66, 0, 14, 1, 60, 'metal')],
  lamp: [cyl(20, 20, 2, 16, 1, 'metal')],
};
```

- [ ] **Step 4: Run tests → PASS.** Si un modèle dépasse sa boîte ou une taille de face sort de la tolérance, corriger la donnée du modèle.
- [ ] **Step 5: Commit** — `feat(bibliotheque): modèles des 16 meubles en vraies dimensions`.

---

### Task 3: Composant `Model3DArt` + planche de maquette + captures — ARRÊT POUR VALIDATION

**Files:**
- Create: `src/content/model3d-art.tsx`
- Test: `tests/content/model3d-art.test.tsx` (famille `scene-piece` : `'model3d-art.*'` dans `c(...)`)
- Create (non suivis, git-ignorés) : `.superpowers/harness-modeles/{index.html,main.tsx,vite.config.ts,cap.mjs}`

**Interfaces:**
- Consumes: `renderModel`, `FURNITURE_MODELS`, `STEAMPUNK_TRIM`, `shadeHex` (de `src/content/furniture-angled.tsx` — le recopier dans `model3d-art.tsx` puisque ce fichier sera retiré en Tâche 6).
- Produces: `export function Model3DArt({ kind, angle, rect, palette, lit, steampunk }: { kind: StandingKind; angle: Angle; rect: PxRect; palette: Palette; lit?: boolean; steampunk?: boolean }): ReactElement` — dessine `renderModel` mis à l'échelle de `rect` (transform translate + scale `rect.w / (cols·30)`, `rect.h / (rows·510/18)`), `data-model3d=""`.

- [ ] **Step 1: Failing test**

```tsx
// tests/content/model3d-art.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { Model3DArt } from '../../src/content/model3d-art';
import { paletteOf } from '../../src/core/library/styles';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function draw(el: JSX.Element) {
  const c = document.createElement('div');
  document.body.append(c);
  act(() => { createRoot(c).render(<svg>{el}</svg>); });
  return c;
}
const rect = { x: 0, y: 0, w: 120, h: 255 };

describe('Model3DArt', () => {
  it('dessine des polygones encrés pour chaque angle', () => {
    for (const angle of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
      const c = draw(<Model3DArt kind="chair" angle={angle} rect={rect} palette={paletteOf('scandinave')} />);
      expect(c.querySelectorAll('[data-model3d] polygon').length).toBeGreaterThan(3);
    }
  });
  it('l’abat-jour de la lampe change avec lit, à tous les angles', () => {
    for (const angle of [0, 3, 6] as const) {
      const on = draw(<Model3DArt kind="lamp" angle={angle} rect={rect} palette={paletteOf('scandinave')} lit />).innerHTML;
      const off = draw(<Model3DArt kind="lamp" angle={angle} rect={rect} palette={paletteOf('scandinave')} lit={false} />).innerHTML;
      expect(on).not.toBe(off);
    }
  });
  it('les garnitures Steampunk n’apparaissent que dans une pièce Steampunk', () => {
    const plain = draw(<Model3DArt kind="desk" angle={0} rect={rect} palette={paletteOf('steampunk')} />);
    const steam = draw(<Model3DArt kind="desk" angle={0} rect={rect} palette={paletteOf('steampunk')} steampunk />);
    expect(steam.querySelectorAll('polygon').length).toBeGreaterThan(plain.querySelectorAll('polygon').length);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementation**

```tsx
// src/content/model3d-art.tsx
// Dessin provisoire Opus — reprise Fable prévue.
import type { ReactElement } from 'react';
import type { Angle } from '../core/library/footprint';
import { FURNITURE_MODELS, STEAMPUNK_TRIM } from '../core/library/furniture-models';
import { renderModel } from '../core/library/furniture-render3d';
import type { StandingKind } from '../core/library/library-types';
import type { PxRect } from '../core/library/room-grid';
import type { Palette } from '../core/library/styles';

const CELL_W = 30;
const CELL_H = 510 / 18;
const LIT_SHADE = '#FFE9A8';

// Éclaircit (> 1) ou assombrit (< 1) une couleur #RRGGBB.
export function shadeHex(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

// Meuble dessiné depuis son modèle 3D (vraies proportions), mis à l'échelle de son rectangle.
export function Model3DArt({ kind, angle, rect, palette, lit = true, steampunk = false }: { kind: StandingKind; angle: Angle; rect: PxRect; palette: Palette; lit?: boolean; steampunk?: boolean }): ReactElement {
  const base = FURNITURE_MODELS[kind];
  const trim = steampunk ? (STEAMPUNK_TRIM[kind] ?? []) : [];
  const model = trim.length > 0 ? { ...base, pieces: [...base.pieces, ...trim] } : base;
  const r = renderModel(model, angle);
  const sx = rect.w / (r.cols * CELL_W);
  const sy = rect.h / (r.rows * CELL_H);
  const color = (fill: keyof Palette, shade: number) => shadeHex(kind === 'lamp' && fill === 'shade' && lit ? LIT_SHADE : palette[fill], shade);
  return (
    <g data-model3d="" transform={`translate(${rect.x} ${rect.y}) scale(${sx} ${sy})`}>
      {r.shapes.map((s, i) => (s.kind === 'poly'
        ? <polygon key={i} points={s.points.map(([x, y]) => `${x},${y}`).join(' ')} fill={color(s.fill, s.shade)} stroke={palette.edge} strokeWidth={1.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        : <ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={color(s.fill, s.shade)} stroke={palette.edge} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />))}
    </g>
  );
}
```

- [ ] **Step 4: Run tests → PASS ; commit** — `feat(bibliotheque): composant de dessin des modèles 3D`.

- [ ] **Step 5: Planche de maquette (fichiers non suivis).** Copier le banc `C:/Users/maxim/Downloads/Wikimasters-rotation/.superpowers/harness-rotation/` (`index.html`, `vite.config.ts`, `cap.mjs`) dans `.superpowers/harness-modeles/` (port vite 5263, port de débogage Chrome 9363, profil `capsmod`, sortie `.superpowers/captures-modeles/`). Nouveau `main.tsx` : une page qui, pour chacun des 16 meubles (une ligne par meuble, nom en tête), dessine :
  - à gauche, l'**ancien dessin de face** (rendu par le `RoomView` actuel d'une pièce contenant ce seul meuble, ou directement par les anciens composants `HomeArt`/`ShelfArt`/`DeskArt`/`SteampunkArt` dans son ancien rectangle) ;
  - puis les **8 angles** avec `Model3DArt`, chacun dans un SVG de `cols × rows` cases à l'échelle 1 (30 px par case), sur un fond de grille de cases, avec les **cases au sol** (`renderModel(...).floor`) en vert translucide ;
  - en bas, une **pièce type** de 24 colonnes (mur 12 rangées, sol 6) avec étagère, canapé, fauteuil, table basse, bureau + chaise, lampe, plante, tapis, aux angles 0, 0, 7, 0, 0, 1, 0, 0, à leurs nouvelles tailles (dessin direct par `Model3DArt` sur un fond mur/sol simple), pour juger les proportions entre meubles.
  `cap.mjs` : captures pleine page en largeur 812 (paysage) et 375 (portrait), `Page.captureScreenshot` avec `captureBeyondViewport: true`, et une capture par meuble (élément ciblé) ; **ne tuer que son propre Chrome** (`proc.kill()`), jamais `taskkill /IM chrome.exe`.

- [ ] **Step 6: Captures et ARRÊT.** Lancer vite en arrière-plan, `node cap.mjs`, regarder chaque image, noter les défauts dans `.superpowers/captures-modeles/NOTES.md`, envoyer les captures à l'utilisateur. **Fin de la phase A : attendre sa validation explicite (ou ses corrections, à appliquer dans `furniture-models.ts` / le moteur, puis nouvelles captures) avant de commencer la Tâche 4.**

---

## PHASE B — intégration (après validation)

### Task 4: Empreintes et catalogue branchés sur les modèles

**Files:**
- Modify: `src/core/library/footprint.ts`, `src/core/library/furniture-catalog.ts`
- Modify (attentes) : tous les tests dont les tailles de meubles ont changé (`tests/core/library/footprint.test.ts`, `room-grid*.test.ts`, `tests/content/placement.test.ts`, `library-*.test.tsx`, `depth-order.test.ts`, tests des animaux et de la lumière qui posent des meubles)

**Interfaces:**
- Consumes: `renderModel`, `poisOf3d`, `frontFaceOf` (Tâche 1), `FURNITURE_MODELS` (Tâche 2).
- Produces (API inchangée) : `drawSize(kind, angle)` = `{ w: cols, h: rows }` de `renderModel` ; `floorOffsets(kind, angle)` = `renderModel(...).floor` ; `poisAt(kind, angle)` = `poisOf3d` converti en `{ type, dx: col, dy: row }` ; `frontFaceRect(angle, rect)` → pour garder la signature, devient `frontFaceRect(angle, rect, kind?: StandingKind)` : avec `kind`, la face projetée du modèle mise à l'échelle du rectangle (`frontFaceOf` × `rect.w / (cols·30)`, `rect.h / (rows·510/18)`, décalée de `rect.x`, `rect.y`), sans `kind` le calcul actuel (fenêtres non concernées) ; tous les appelants qui ont le meuble passent `kind`. `sizeOf(kind)` = `drawSize(kind, 0)` ; `footOf(kind)` = nombre de rangées au sol à l'angle 0. Résultats mis en cache par `(kind, angle)` (Map module) : `renderModel` est appelé à chaque rendu.

- [ ] **Step 1:** Remplacer dans `footprint.ts` le calcul (`depthRows`, `footRows`, escalier) par le moteur, avec le cache :
  ```ts
  const cache = new Map<string, Rendered>();
  export function renderedOf(kind: StandingKind, angle: Angle): Rendered {
    const key = `${kind}:${angle}`;
    let r = cache.get(key);
    if (!r) { r = renderModel(FURNITURE_MODELS[kind], angle); cache.set(key, r); }
    return r;
  }
  export const drawSize = (kind: StandingKind, angle: Angle) => { const r = renderedOf(kind, angle); return { w: r.cols, h: r.rows }; };
  export const floorOffsets = (kind: StandingKind, angle: Angle): Cell[] => renderedOf(kind, angle).floor.map((c) => ({ ...c }));
  ```
  et `poisAt`, `frontFaceRect` comme décrit. Dans `furniture-catalog.ts`, `sizeOf`/`footOf` délèguent (attention à l'import circulaire : `furniture-render3d.ts` n'importe que des **types** du catalogue ; `furniture-catalog.ts` peut importer `footprint.ts` à l'exécution seulement si `footprint.ts` n'importe plus de valeurs du catalogue — `layerOf`/`poisOf` ne sont plus nécessaires dans `footprint.ts` : le tapis est géré par son modèle (h = 1, trace entière)). Retirer `w`, `h`, `foot`, `pois` de `FOOTPRINTS` (garder `layer`, `depth`, `under`).
- [ ] **Step 2:** Mettre à jour `tests/core/library/footprint.test.ts` aux nouvelles valeurs : étagère face 4 colonnes, profil 2 colonnes, canapé face 10 colonnes, escalier en diagonale (ensembles calculés et vérifiés à la main dans le rapport), gamelle = 1 case à tous les angles.
- [ ] **Step 3:** Lancer `npm run test:famille -- scene-piece scene-animaux scene-lumiere`. Pour chaque test cassé uniquement par les nouvelles tailles (coordonnées de pose devenues hors pièce ou en collision), **adapter les coordonnées ou les attentes en gardant l'intention du test** ; lister chaque adaptation dans le rapport. Les empreintes de référence de la lumière (`light-perf-golden`, etc.) sont régénérées seulement en Tâche 7.
- [ ] **Step 4: Commit** — `feat(bibliotheque): tailles et cases au sol des meubles tirées des modèles 3D`.

### Task 5: Migration des pièces v5 → v6

**Files:**
- Modify: `src/core/library/library-book.ts`
- Test: `tests/core/library/library-migration-v6.test.ts` (famille `scene-piece` : couvert par `library-migration.*`? sinon ajouter `'library-migration-v6.*'` à `lib(...)`)

**Interfaces:**
- Produces: `export function migrateV5(raw: unknown): unknown` (version 6) ; `export function refitLayout(layout: Layout, cols: number, oldSize: (kind: StandingKind) => { w: number; h: number }): Layout` (pur). Les anciennes tailles sont figées dans une constante `V5_SIZES` (valeurs historiques : shelf 6×8, desk 5×4, chair 2×3, sofa 6×3, armchair 3×3, basket 3×2, bowl 2×1, kennel 4×3, charger 2×1, plant 2×4, lamp 1×5, coffee-table 4×2, rug 6×3, globe 3×4, telescope 3×5, automaton 2×3).

- [ ] **Step 1: Failing test**
  ```ts
  import { describe, expect, it } from 'vitest';
  import { parseLibraryState, refitLayout } from '../../../src/core/library/library-book';
  import { canPlace, rectOf } from '../../../src/core/library/room-grid';

  const v5 = (layout: unknown[]) => ({ version: 5, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, weather: { mode: 'random' },
    rooms: [{ id: 'r1', name: 'P', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, pets: [], layout }] });

  describe('migration v6', () => {
    it('garde la colonne et la dernière rangée au sol, prend la nouvelle taille', () => {
      const s = parseLibraryState(v5([{ id: 'a', kind: 'shelf', col: 0, row: 6 }]));
      expect(s.version).toBe(6);
      const shelf = s.rooms[0]!.layout[0]!;
      const r = rectOf(shelf)!;
      expect(r.col).toBe(0);
      expect(r.row + r.h - 1).toBe(13); // ancienne dernière rangée : 6 + 8 − 1
    });
    it('un meuble agrandi qui déborde est déplacé à la place libre la plus proche, jamais supprimé', () => {
      const s = parseLibraryState(v5([{ id: 'a', kind: 'sofa', col: 18, row: 14 }]));
      const sofa = s.rooms[0]!.layout.find((p) => p.id === 'a')!;
      const r = rectOf(sofa)!;
      expect(r.col + r.w).toBeLessThanOrEqual(24);
    });
    it('deux meubles qui se chevauchent après agrandissement sont séparés quand une place existe', () => {
      const s = parseLibraryState(v5([{ id: 'a', kind: 'sofa', col: 0, row: 14 }, { id: 'b', kind: 'armchair', col: 7, row: 14 }]));
      const layout = s.rooms[0]!.layout;
      const b = layout.find((p) => p.id === 'b')!;
      expect(canPlace(layout, 24, 'armchair', (b as { col: number }).col, (b as { row: number }).row, 'b').ok).toBe(true);
    });
    it('sans aucune place, le meuble est gardé tel quel', () => {
      const many = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, kind: 'sofa', col: (i % 4) * 6, row: 12 + Math.floor(i / 4) * 2 }));
      const s = parseLibraryState(v5(many));
      expect(s.rooms[0]!.layout).toHaveLength(12);
    });
    it('idempotente', () => {
      const once = parseLibraryState(v5([{ id: 'a', kind: 'sofa', col: 0, row: 14 }, { id: 'b', kind: 'chair', col: 12, row: 13 }]));
      expect(parseLibraryState(once)).toEqual(once);
    });
  });
  ```
- [ ] **Step 2: Implementation.** `migrateV5` : pour chaque pièce, `refitLayout(layout, cols, (k) => V5_SIZES[k])` ; `version: 6`. `refitLayout` : pour chaque meuble debout dans l'ordre du plan, `bottom = row + old.h − 1`, `newRow = bottom − drawSize(kind, angle).h + 1` ; poser par `canPlace` sur la disposition déjà reconstruite ; si refusé, essayer les cases par distance croissante (|Δcol| + |Δrow|, même angle) jusqu'à la première acceptée ; sinon garder la position calculée. Les objets non debout passent tels quels. `createInitialState` passe à `version: 6` ; `migrate` enchaîne `migrateV5`. Mettre à jour le schéma (`version: z.literal(6)` ou équivalent existant).
- [ ] **Step 3: Tests → PASS ; familles `scene-piece` ; commit** — `feat(bibliotheque): migration des pièces aux nouvelles tailles de meubles (v6)`.

### Task 6: Dessin partout par les modèles (pièce, vignettes, zoom) et retrait des anciens dessins

**Files:**
- Modify: `src/content/RoomView.tsx` (`artOf` : tous les meubles debout → `Model3DArt` avec `steampunk`), `src/content/furniture-thumb.tsx` (vignettes → `Model3DArt` angle 0), `src/content/furniture-zoom.tsx` (vue de face en grand : `Model3DArt` angle 0 + emplacements de cartes sur `frontFaceRect(0, art, 'shelf')`, écran sur la face du bureau), emplacements de l'étagère dans la pièce (`shelfSlotsOf` passe `kind`), ordinateur et petits objets posés sur le dessus projeté (`computerRect`/`surfaceSlotRect` appliqués au rectangle du dessus : y = haut du rectangle de dessin + projection du dessus, via `frontFaceRect(angle, rect, 'desk')` pour le bureau).
- Delete: `src/core/library/furniture-volumes.ts`, `src/core/library/furniture-projection.ts`, `src/content/furniture-angled.tsx` (garder `ComputerBackArt` en le déplaçant dans `model3d-art.tsx`), les composants de meubles debout de `furniture-art-home.tsx` (garder `SmallArt`), `ShelfArt`/`DeskArt` de `furniture-art.tsx` (garder `ComputerArt`), les meubles debout de `furniture-art-steampunk.tsx` (garder `AnalyticalEngineArt`) et leurs tests.
- Test: adapter `tests/content/room-angle.test.tsx`, `library-furniture-view.test.tsx`, `library-steampunk-furniture.test.tsx`, `furniture-zoom.test.tsx`, `furniture-thumb` (sélecteurs `[data-model3d]`).

- [ ] **Step 1:** Tests d'abord : un meuble debout à n'importe quel angle (0 compris) rend `[data-model3d]` ; meubles Steampunk exclusifs non dessinés hors pièce Steampunk ; étagère de face : cartes rangées dans la face projetée ; zoom : 15 emplacements dans la face, cartes touchables ; vignettes : `[data-model3d]`.
- [ ] **Step 2:** Implémenter, retirer les fichiers, `npx tsc --noEmit` propre, familles `scene-piece scene-lumiere`.
- [ ] **Step 3: Commit** — `feat(bibliotheque): tous les meubles dessinés depuis leur modèle 3D, anciens dessins retirés`.

### Task 7: Animaux et lumière depuis les modèles

**Files:**
- Modify: `src/core/library/light/occluders.ts` (occulteurs des meubles debout depuis les pièces du modèle tourné ; retire `PRIMS`, `DEPTH`, `rotatedPrims`), `src/core/library/pets/walk-map.ts` (plateformes : y du dessus depuis le modèle — pièce la plus haute dont la face du dessus est praticable : assise, dessus de table/bureau/étagère — à la place de `TOP_FRACTION`), `src/core/library/furniture-render3d.ts` (+ `occluderBoxesOf(model, angle): { x0; x1; z0; z1; d0; d1 }[]` en cm locaux : boîte englobante tournée de chaque pièce)
- Test: `tests/core/library/light-occluders.test.ts`, empreintes de référence de la lumière régénérées (`light-perf-golden` etc. selon le mécanisme existant du dépôt) avec justification dans le commit ; tests animaux.

- [ ] **Step 1:** Test : `occluderBoxesOf(FURNITURE_MODELS.shelf, 0)` donne 7 boîtes dans la boîte du meuble ; de profil (2), largeur ↔ profondeur échangées ; un chat assis sur le canapé tourné reste sur son assise (point d'intérêt `seat` dans l'empreinte dessinée).
- [ ] **Step 2:** Implémenter ; conversion vers le monde de la lumière : x px = `rect.x + (x' cm) × PX_PER_CM_X` (+ décalage horizontal du rendu), hauteur px = `y × PX_PER_CM_Y`, profondeur monde = `dFront − z' × DEPTH_PX_PER_CM / kOf(geom)`.
- [ ] **Step 3:** Régénérer les empreintes de référence de la lumière par la commande prévue par le dépôt (chercher « golden » dans `tests/` et `package.json`), vérifier visuellement une capture de la pièce éclairée.
- [ ] **Step 4:** Familles `scene-animaux scene-lumiere scene-piece` → PASS ; commit — `feat(bibliotheque): ombres et animaux suivent les vrais volumes des meubles`.

### Task 8: Vérification finale et captures

- [ ] **Step 1:** `npm run test:famille -- scene-piece scene-animaux scene-lumiere`, `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 2:** Captures (banc `harness-modeles`, plus une pièce réelle migrée depuis une pièce v5 typique, de face et avec meubles tournés, zoom étagère et bureau), regardées et envoyées à l'utilisateur.
- [ ] **Step 3:** Puis superpowers:finishing-a-development-branch (PR, fusion, pré-prod selon la routine du projet).
