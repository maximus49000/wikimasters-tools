# Bibliothèque Ghibli G3a : pantin 3D et vie ordinaire de la rue — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** donner aux passants, habitants, clients et à la file de la boîte un corps de pantin 3D au trait Ghibli (graphisme `ghibli`), et supprimer les apparitions en fondu (dans les deux graphismes).

**Architecture:** un moteur pur (`src/core/library/figure/`) calcule squelette, habillage et tracés d'une pose quantifiée (16 orientations × 12 images) ; un hôte de symboles hors de la couche recopiée par `<use>` range ces tracés à la demande ; chaque humain n'est qu'un `<g data-figure>` + `<use>` dont les boucles existantes changent la référence selon la distance parcourue et le sens. Les trajets (habitants, clients) gagnent des étapes de porte (demi-tour, passage du seuil dans l'ombre) à la place des fondus.

**Tech Stack:** React 19, TypeScript, SVG, Vitest (`npm test`, jsdom pour les composants), WXT.

**Spec:** `docs/superpowers/specs/2026-10-11-bibliotheque-ghibli-g3-design.md` (référence visuelle : `C:\Users\maxim\Downloads\Wikimasters tools\.superpowers\brainstorm\4473-1791678451\content\pantin-3d.html`).

## Global Constraints

- Travailler dans le worktree `C:\Users\maxim\Downloads\Wikimasters-ghibli`, branche `feat/bibliotheque-ghibli-g3a`.
- Commentaires et textes en français, style du dépôt (commentaires `//` denses en tête de fichier et avant chaque bloc non évident).
- Aucun `Math.random` dans le moteur : tout tirage dérive de la graine (`mulberry32`, `hashString` de `src/core/library/scene-world.ts`).
- Aucun id SVG fixe ; aucun `clipPath`, `mask` ni `filter` à id dans la couche des acteurs (recopiée par `<use>`) : rogner par `<svg>` imbriqué.
- Graphisme classique (`useArtStyle()[0] === 'classic'`) : dessin inchangé (`PersonSprite`), seules changent les entrées/sorties (plus de fondus).
- 16 orientations (pas de 22,5°), 12 images de marche, foulée complète = 23 unités du pantin.
- Encre `#33241f`, ombre = `mixHex(mixHex(c, '#4a3a6a', 0.3), '#000000', 0.05)`, lumière en haut à gauche.
- Hôte : 900 symboles au plus, 8 créations par image au plus.
- Mouvement réduit (`prefers-reduced-motion`) : aucune boucle, poses immobiles.
- Commits : messages en français `feat(bibliotheque): …` / `fix(bibliotheque): …`, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests : `npx vitest run <fichier>` pour un fichier ; la suite complète `npm test` a un échec connu et toléré (test lent « nacelle » de la couche d'installation).

## Review Focus

- Changement de minute pendant qu'un habitant ou un client est en route : il doit finir son trajet (pas de disparition sur place) — test dans la tâche 8 (habitants) et 9 (clients).
- Monde étroit (720 px) et très large (3 456 px, trajet plafonné) : un trajet plafonné se termine dans une autre porte, jamais en pleine rue — tests tâches 7 et 9.
- Passant qui doit disparaître alors qu'il est au milieu de la rue : il reste visible jusqu'au bord — test tâche 6.
- Symbole pas encore créé (budget par image épuisé) : la figure garde sa dernière image, jamais de référence vide — test tâche 4.
- Bascule classique ↔ Ghibli pendant que la scène tourne : chaque site rend l'autre dessin au re-rendu, sans erreur — test tâche 5.

---

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `src/core/library/figure/geometry.ts` (créé) | projection, capsule, enveloppe, réduction, tracé arrondi |
| `src/core/library/figure/skeleton.ts` (créé) | repère du corps, allures, `poseOf` |
| `src/core/library/figure/head.ts` (créé) | champ des cheveux, `headRegion` (marching squares) |
| `src/core/library/figure/dress.ts` (créé) | `Shape`, `shapeOf`, `signatureOf`, `shapeFromSignature` |
| `src/core/library/figure/bake.ts` (créé) | `FigureKey`, `bakeFigure`, cache des têtes |
| `src/core/library/figure/gait.ts` (créé) | indices d'orientation et de phase, demi-tour |
| `src/core/library/city/doorway.ts` (créé) | étapes de porte, ouverture d'une entrée, porte la plus lointaine dans le plafond |
| `src/core/library/city/doors.ts` (modifié) | `tripsFor(doors, seed, width)` (porte d'arrivée), `tripAt` à étapes sans fondu |
| `src/core/library/city/shops/customers.ts` (modifié) | `visitsFor(…, doorXs)`, `visitAt` à étapes sans fondu |
| `src/core/library/city/people.ts` (modifié) | `pedShown` (bascule au bord) |
| `src/content/figure/figure-host.tsx` (créé) | `FigureRegistry`, `FigureContext`, `FigureDefs`, `useFigureRegistry` |
| `src/content/figure/ghibli-figure.tsx` (créé) | `GhibliFigure`, `figureVars`, `poseFigure` |
| `src/content/RoomView.tsx`, `src/content/scene-panorama.tsx` (modifiés) | hôte des symboles |
| `src/content/city-life.tsx` (modifié) | passants, habitants, nœuds de porte |
| `src/content/city-shops-life.tsx` (modifié) | clients |
| `src/content/shop-queue.tsx` (modifié) | file de la boîte |
| `tests/core/library/figure/*.test.ts`, `tests/content/figure/*.test.tsx` (créés) | tests |

---

### Task 1: Géométrie et squelette du pantin

**Files:**
- Create: `src/core/library/figure/geometry.ts`, `src/core/library/figure/skeleton.ts`
- Test: `tests/core/library/figure/figure-skeleton.test.ts`

**Interfaces:**
- Produces: `V3`, `P2`, `project(p: V3): [number, number, number]`, `add3`, `mul3`, `capsule(a, b, ra, rb, seg?) : P2[]`, `hull(pts): P2[]`, `shrink(P, k, dx, dy): P2[]`, `pathOf(P): string`, `CAM_CA`, `CAM_SA` ; `Gait = 'stand' | 'step' | 'walk' | 'seated'`, `YAWS = 16`, `PHASES = 12`, `STRIDE = 23`, `Frame3`, `frameOf(yaw)`, `at(base, fr, f, u, l)`, `Pose`, `PoseOpts`, `poseOf(yaw, phase, gait, opts?)`, `LIMB`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/library/figure/figure-skeleton.test.ts
import { describe, expect, it } from 'vitest';
import { capsule, hull, pathOf, project } from '../../../../src/core/library/figure/geometry';
import { PHASES, poseOf } from '../../../../src/core/library/figure/skeleton';

const finite = (v: readonly number[]): boolean => v.every((x) => Number.isFinite(x));

describe('géométrie du pantin', () => {
  it('projette un point plus proche du spectateur plus bas à l’écran', () => {
    expect(project([0, 10, 5])[1]).toBeGreaterThan(project([0, 10, 0])[1]);
  });
  it('enveloppe convexe d’un carré avec un point intérieur', () => {
    expect(hull([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1]])).toHaveLength(4);
  });
  it('capsule fermée et tracé arrondi au dixième', () => {
    const d = pathOf(capsule([0, 0], [0, 10], 2, 1));
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d).not.toMatch(/\d\.\d\d/);
  });
});

describe('squelette', () => {
  it('debout : les deux chevilles à la même hauteur, tête vers y = 33', () => {
    const p = poseOf(0, 0, 'stand');
    expect(Math.abs(p.legs[0].ankle[1] - p.legs[1].ankle[1])).toBeLessThan(0.01);
    expect(p.head[1]).toBeGreaterThan(31);
    expect(p.head[1]).toBeLessThan(35);
  });
  it('en marche, la jambe d’appui touche le sol à chaque image (cheville la plus basse ≈ 1)', () => {
    for (let i = 0; i < PHASES; i++) {
      const p = poseOf(0, (i * 2 * Math.PI) / PHASES, 'walk');
      const low = Math.min(p.legs[0].ankle[1], p.legs[1].ankle[1]);
      expect(low).toBeGreaterThan(0.9);
      expect(low).toBeLessThan(1.1);
    }
  });
  it('bras en opposition des jambes', () => {
    const p = poseOf(0, Math.PI / 2, 'walk');
    // jambe 0 (gauche) en avant : bras gauche (0) en arrière (x plus petit que l’épaule)
    expect(p.legs[0].knee[0]).toBeGreaterThan(p.legs[1].knee[0]);
    expect(p.arms[0].hand[0]).toBeLessThan(p.arms[1].hand[0]);
  });
  it('assis : cuisses horizontales, bassin plus bas que debout', () => {
    const s = poseOf(Math.PI / 4, 0, 'seated');
    expect(Math.abs(s.legs[0].hip[1] - s.legs[0].knee[1])).toBeLessThan(0.5);
    expect(s.pelvis[1]).toBeLessThan(poseOf(0, 0, 'stand').pelvis[1] - 5);
  });
  it('parapluie : la main droite (bras 1) au-dessus de la tête… ou presque', () => {
    const p = poseOf(0, 0, 'walk', { umbrella: true });
    expect(p.arms[1].hand[1]).toBeGreaterThan(p.arms[1].sh[1]);
  });
  it('aucune valeur non finie, toutes orientations', () => {
    for (let y = 0; y < 16; y++) {
      const p = poseOf((y * Math.PI) / 8, 1, 'walk');
      for (const l of p.legs) expect(finite([...l.hip, ...l.knee, ...l.ankle, ...l.toe])).toBe(true);
      for (const a of p.arms) expect(finite([...a.sh, ...a.elb, ...a.hand])).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/library/figure/figure-skeleton.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Write the implementation**

```ts
// src/core/library/figure/geometry.ts
// Géométrie du pantin 3D (G3, graphisme Ghibli) : repère du corps y vers le haut, x vers la droite, z vers le spectateur.
// Caméra orthographique un peu plongeante (12°) : un point plus proche du spectateur descend à l'écran.
export type V3 = readonly [number, number, number];
export type P2 = readonly [number, number];

const ELEV = (12 * Math.PI) / 180;
export const CAM_CA = Math.cos(ELEV);
export const CAM_SA = Math.sin(ELEV);

// x écran, y écran (vers le bas), profondeur (vers le spectateur).
export const project = (p: V3): [number, number, number] => [p[0], -(p[1] * CAM_CA - p[2] * CAM_SA), p[2] * CAM_CA + p[1] * CAM_SA];
export const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];

// Capsule (membre) entre deux points projetés, rayons ra et rb : deux demi-cercles de `seg` segments.
export function capsule(a: P2, b: P2, ra: number, rb: number, seg = 6): P2[] {
  const out: P2[] = [];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  for (let i = 0; i <= seg; i++) {
    const t = ang + Math.PI / 2 + (i * Math.PI) / seg;
    out.push([a[0] + ra * Math.cos(t), a[1] + ra * Math.sin(t)]);
  }
  for (let i = 0; i <= seg; i++) {
    const t = ang - Math.PI / 2 + (i * Math.PI) / seg;
    out.push([b[0] + rb * Math.cos(t), b[1] + rb * Math.sin(t)]);
  }
  return out;
}

// Enveloppe convexe (chaîne monotone).
export function hull(pts: readonly P2[]): P2[] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: P2, a: P2, b: P2): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P2[] = [];
  const up: P2[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (up.length >= 2 && cross(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop();
    up.push(q);
  }
  up.pop();
  lo.pop();
  return lo.concat(up);
}

// Zone éclairée : le polygone réduit vers son centre et décalé vers la lumière (en haut à gauche).
export function shrink(P: readonly P2[], k: number, dx: number, dy: number): P2[] {
  let cx = 0;
  let cy = 0;
  for (const q of P) {
    cx += q[0];
    cy += q[1];
  }
  cx /= P.length;
  cy /= P.length;
  return P.map((q) => [cx + (q[0] - cx) * k + dx, cy + (q[1] - cy) * k + dy] as const);
}

const r1 = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return (r === 0 ? 0 : r).toString();
};
// Tracé fermé, coordonnées au dixième (symboles légers).
export const pathOf = (P: readonly P2[]): string => `M${P.map((q) => `${r1(q[0])} ${r1(q[1])}`).join('L')}Z`;
```

```ts
// src/core/library/figure/skeleton.ts
import { add3, mul3, type V3 } from './geometry';

// Squelette du pantin (maquette validée du 2026-10-11) : 40 unités de haut, pieds à y = 0, tête centrée vers y = 33.
// Orientation `yaw` (radians) : 0 regarde vers la droite de l'écran, π/2 vers le spectateur, π vers la gauche, 3π/2 de dos.
// Allures : debout, petits pas sur place (demi-tour), marche, assis. La hauteur du bassin est fixée par la jambe d'appui :
// le rebond du buste vient tout seul et le pied d'appui touche toujours le sol.
export type Gait = 'stand' | 'step' | 'walk' | 'seated';
export const YAWS = 16;
export const PHASES = 12;
// Distance parcourue (unités du pantin) pendant un cycle complet de marche (deux pas) : règle la phase sur le déplacement.
export const STRIDE = 23;
const AMPLITUDE: Record<Gait, number> = { stand: 0, step: 0.35, walk: 1, seated: 0 };
export const LIMB = { thigh: 7.6, shin: 7.8, ankle: 1.0, upperArm: 6.3, foreArm: 5.6 } as const;

export type Frame3 = { F: V3; R: V3; U: V3 };
// F : devant, R : côté droit du corps, U : haut.
export const frameOf = (yaw: number): Frame3 => ({ F: [Math.cos(yaw), 0, Math.sin(yaw)], R: [-Math.sin(yaw), 0, Math.cos(yaw)], U: [0, 1, 0] });
export const at = (b: V3, fr: Frame3, f: number, u: number, l: number): V3 => add3(add3(add3(b, mul3(fr.F, f)), mul3(fr.U, u)), mul3(fr.R, l));

export type Leg = { hip: V3; knee: V3; ankle: V3; toe: V3; l: number };
export type Arm = { sh: V3; elb: V3; hand: V3; l: number };
export type Pose = { fr: Frame3; pelvis: V3; legs: [Leg, Leg]; arms: [Arm, Arm]; neck: V3; head: V3; headFrame: Frame3; lean: number; pelvisTurn: number; shoulderTurn: number };
// `headYaw` : rotation de la tête seule (radians) ; `umbrella` : bras droit levé qui tient un manche.
export type PoseOpts = { headYaw?: number; umbrella?: boolean };

const D = Math.PI / 180;

export function poseOf(yaw: number, phase: number, gait: Gait, opts: PoseOpts = {}): Pose {
  const fr = frameOf(yaw);
  const w = AMPLITUDE[gait];
  const seated = gait === 'seated';
  const legAngles = (ph: number): [number, number] => {
    const th = w * 24 * Math.sin(ph);
    const k = 4 + w * 55 * Math.max(0, Math.cos(ph + 0.35)) ** 2;
    return [th * D, k * D];
  };
  const A = seated ? ([90 * D, 90 * D] as [number, number]) : legAngles(phase);
  const B = seated ? ([90 * D, 90 * D] as [number, number]) : legAngles(phase + Math.PI);
  const reach = ([th, k]: [number, number]): number => LIMB.thigh * Math.cos(th) + LIMB.shin * Math.cos(th - k);
  const hipY = seated ? LIMB.shin + LIMB.ankle + 0.6 : Math.max(reach(A), reach(B)) + LIMB.ankle;
  const lean = (seated ? 2 : 3 * w) * D;
  const pelvisTurn = seated ? 0 : w * 6 * Math.sin(phase) * D;
  const shoulderTurn = seated ? 0 : -w * 7 * Math.sin(phase) * D;
  const pelvis: V3 = [0, hipY, 0];
  const off = (rot: number, l: number): V3 => add3(mul3(fr.R, l * Math.cos(rot)), mul3(fr.F, -l * Math.sin(rot)));
  const legs = ([[A, -2.1], [B, 2.1]] as const).map(([[th, k], l]) => {
    const hip = add3(pelvis, off(pelvisTurn, l));
    const knee = at(hip, fr, LIMB.thigh * Math.sin(th), -LIMB.thigh * Math.cos(th), l * 0.05);
    const sa = th - k;
    const ankle = at(knee, fr, LIMB.shin * Math.sin(sa), -LIMB.shin * Math.cos(sa), 0);
    const a = seated ? 0 : sa * 0.6;
    const toe = at(ankle, fr, 3.0 * Math.cos(a), 3.0 * Math.sin(a) - 0.6, 0);
    return { hip, knee, ankle, toe, l };
  }) as [Leg, Leg];
  const shY = 10.6;
  const arms = ([-4.2, 4.2] as const).map((l) => {
    const sh = at(add3(pelvis, off(shoulderTurn, l)), fr, shY * Math.sin(lean), shY * Math.cos(lean), 0);
    let al: number;
    let e: number;
    if (opts.umbrella && l > 0) {
      al = 120 * D;
      e = 45 * D;
    } else if (seated) {
      al = 22 * D * (l < 0 ? 1 : 0.7);
      e = 70 * D;
    } else {
      al = (l < 0 ? -1 : 1) * w * 20 * Math.sin(phase) * D;
      e = (10 + w * 12 * Math.max(0, Math.sin((al / D / 20) * (Math.PI / 2)))) * D + w * 6 * D;
    }
    const elb = at(sh, fr, LIMB.upperArm * Math.sin(al), -LIMB.upperArm * Math.cos(al), Math.sign(l) * 0.5);
    const fa = al + e;
    const hand = at(elb, fr, LIMB.foreArm * Math.sin(fa), -LIMB.foreArm * Math.cos(fa), Math.sign(l) * 0.4);
    return { sh, elb, hand, l };
  }) as [Arm, Arm];
  const neck = at(pelvis, fr, 12.2 * Math.sin(lean), 12.2 * Math.cos(lean), 0);
  const head = at(pelvis, fr, 16.5 * Math.sin(lean) + 0.4, 16.5 * Math.cos(lean), 0);
  return { fr, pelvis, legs, arms, neck, head, headFrame: frameOf(yaw + (opts.headYaw ?? 0)), lean, pelvisTurn, shoulderTurn };
}
```

Note : la convention « bras 0 / jambe 0 = côté gauche du corps (l < 0) » est celle de la maquette ; garder cet ordre.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/library/figure/figure-skeleton.test.ts`
Expected: PASS. Si « bras en opposition » échoue, vérifier le signe de `al` (bras gauche : `-w·20·sin φ`).

- [ ] **Step 5: Commit**

```bash
git add src/core/library/figure tests/core/library/figure
git commit -m "feat(bibliotheque): squelette 3D du pantin Ghibli et géométrie projetée"
```

---

### Task 2: Tête, habillage et cuisson d'une pose

**Files:**
- Create: `src/core/library/figure/head.ts`, `src/core/library/figure/dress.ts`, `src/core/library/figure/bake.ts`
- Test: `tests/core/library/figure/figure-bake.test.ts`

**Interfaces:**
- Consumes: Task 1 (`poseOf`, `frameOf`, `at`, `project`, `capsule`, `hull`, `shrink`, `pathOf`, `CAM_CA`, `CAM_SA`, `Gait`).
- Produces:
  - `headRegion(hr: number, hf: Frame3, field: (el: number, az: number) => number): P2[][]` (centre de la tête en (0, 0)) ; `hairField(hair: Hair): ((el, az) => number) | null`.
  - `type TopShape = 'coat' | 'tee' | 'long'`, `type BottomShape = 'skirt' | 'shorts' | 'pants'`, `type Shape = { hair: Hair; top: TopShape; bottom: BottomShape; acc: Accessory; umbrella: boolean }`, `shapeOf(o: Outfit, umbrella: boolean): Shape`, `signatureOf(s: Shape): string`, `shapeFromSignature(sig: string): Shape`.
  - `type Slot = 'skin' | 'top' | 'bottom' | 'hair' | 'hat' | 'acc' | 'shoe' | 'umb'`, `type BakedPart = { slot: Slot; shade: string; lit: string | null }`, `type BakedGroup = { ink: string; parts: BakedPart[] }`, `type Baked = { groups: BakedGroup[]; eyes: P2[] }`, `type FigureKey = { sig: string; yaw: number; gait: Gait; phase: number; head: number }` (indices : `yaw` 0–15, `phase` 0–11, `head` −4…4), `keyString(k): string`, `bakeFigure(shape: Shape, key: FigureKey): Baked`, `INK_WIDTH`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/library/figure/figure-bake.test.ts
import { describe, expect, it } from 'vitest';
import { bakeFigure, keyString, type FigureKey } from '../../../../src/core/library/figure/bake';
import { shapeFromSignature, shapeOf, signatureOf } from '../../../../src/core/library/figure/dress';
import { hairField, headRegion } from '../../../../src/core/library/figure/head';
import { frameOf } from '../../../../src/core/library/figure/skeleton';
import type { Outfit } from '../../../../src/core/library/city/people';

const girl: Outfit = { skin: '#F2C9A5', hair: 'short', hairColor: '#4a2e1e', hatColor: '#000000', top: 'sweater', topColor: '#C0463A', bottom: 'skirt', bottomColor: '#3B5E8A', accessory: 'bag', accessoryColor: '#8a5a2b' };
const area = (P: readonly (readonly [number, number])[]): number => Math.abs(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);

describe('tête', () => {
  const field = hairField('short')!;
  it('de face : les cheveux couvrent le haut, pas le centre du visage', () => {
    const polys = headRegion(4.4, frameOf(Math.PI / 2), field);
    const total = polys.reduce((s, P) => s + area(P), 0);
    expect(total).toBeGreaterThan(3);
    expect(total).toBeLessThan(Math.PI * 4.4 * 4.4 * 0.6);
  });
  it('de dos : la tête est presque entièrement couverte', () => {
    const polys = headRegion(4.4, frameOf(-Math.PI / 2), field);
    const total = polys.reduce((s, P) => s + area(P), 0);
    expect(total).toBeGreaterThan(Math.PI * 4.4 * 4.4 * 0.8);
  });
  it('chauve : aucun champ', () => {
    expect(hairField('bald')).toBeNull();
  });
});

describe('habillage', () => {
  it('signature : seules les formes comptent, aller-retour exact', () => {
    const s = shapeOf(girl, false);
    expect(signatureOf(shapeOf({ ...girl, topColor: '#000000' }, false))).toBe(signatureOf(s));
    expect(shapeFromSignature(signatureOf(s))).toEqual(s);
    expect(s.bottom).toBe('skirt');
    expect(shapeOf({ ...girl, top: 'tee' }, true)).toMatchObject({ top: 'tee', umbrella: true });
  });
});

describe('cuisson', () => {
  const key: FigureKey = { sig: signatureOf(shapeOf(girl, false)), yaw: 0, gait: 'walk', phase: 3, head: 0 };
  it('déterministe', () => {
    expect(JSON.stringify(bakeFigure(shapeOf(girl, false), key))).toBe(JSON.stringify(bakeFigure(shapeOf(girl, false), key)));
  });
  it('tête en dernier, jambes d’abord ; aucune valeur NaN', () => {
    const b = bakeFigure(shapeOf(girl, false), key);
    expect(b.groups.length).toBeGreaterThanOrEqual(5);
    expect(b.groups[b.groups.length - 1]!.parts.some((p) => p.slot === 'hair')).toBe(true);
    expect(b.groups[0]!.parts.some((p) => p.slot === 'shoe')).toBe(true);
    expect(JSON.stringify(b)).not.toContain('NaN');
  });
  it('de dos : pas d’yeux ; de face : deux yeux', () => {
    const shape = shapeOf(girl, false);
    expect(bakeFigure(shape, { ...key, yaw: 12, gait: 'stand', phase: 0 }).eyes).toHaveLength(0);
    expect(bakeFigure(shape, { ...key, yaw: 4, gait: 'stand', phase: 0 }).eyes).toHaveLength(2);
  });
  it('parapluie : une pièce de case « umb »', () => {
    const shape = shapeOf(girl, true);
    const b = bakeFigure(shape, { ...key, sig: signatureOf(shape) });
    expect(b.groups.some((g) => g.parts.some((p) => p.slot === 'umb'))).toBe(true);
  });
  it('clé lisible et stable', () => {
    expect(keyString(key)).toBe(`${key.sig}|0|walk|3|0`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/library/figure/figure-bake.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 3: Write `head.ts`**

```ts
// src/core/library/figure/head.ts
import type { Hair } from '../city/people';
import { CAM_CA, CAM_SA, type P2 } from './geometry';
import type { Frame3 } from './skeleton';

// Cheveux, bonnet et casquette du pantin : un champ f(élévation, azimut) sur la sphère de la tête (> 0 = cheveux), évalué
// sur l'hémisphère visible ; le contour est tiré par marching squares (ligne de front nette, pas d'enveloppe convexe) puis
// fermé le long du cercle de la tête. Azimut 0 = devant le visage, élévation π/2 = sommet.
export type HairField = (el: number, az: number) => number;

export function hairField(hair: Hair): HairField | null {
  if (hair === 'bald') return null;
  if (hair === 'beanie') return (el) => el - 0.18;
  if (hair === 'cap') return (el) => el - 0.3;
  const low = hair === 'long' ? 0.95 : 0.32;
  return (el, az) => Math.max(el - (0.5 - 0.32 * Math.max(0, -Math.cos(az)) - 0.12 * Math.abs(Math.sin(az))), Math.min(-Math.cos(az) - 0.25, el + low));
}

const N = 22;
const U = [0, CAM_CA, -CAM_SA] as const;
const V = [0, CAM_SA, CAM_CA] as const;

// Polygones (repère écran, centre de la tête en (0, 0)) de la région où field > 0.
export function headRegion(hr: number, hf: Frame3, field: HairField): P2[][] {
  const cell = (2 * hr) / N;
  const fAt = (dx0: number, dy0: number): number => {
    let dx = dx0;
    let dy = dy0;
    const d = Math.hypot(dx, dy);
    if (d > hr * 0.995) {
      dx *= (hr * 0.995) / d;
      dy *= (hr * 0.995) / d;
    }
    const cz = Math.sqrt(Math.max(0, hr * hr - dx * dx - dy * dy));
    const n = [dx / hr, (-dy * U[1] + cz * V[1]) / hr, (-dy * U[2] + cz * V[2]) / hr] as const;
    const f = n[0] * hf.F[0] + n[2] * hf.F[2];
    const l = n[0] * hf.R[0] + n[2] * hf.R[2];
    return field(Math.asin(Math.max(-1, Math.min(1, n[1]))), Math.atan2(l, f));
  };
  const val: number[][] = [];
  for (let i = 0; i <= N; i++) {
    val.push([]);
    for (let j = 0; j <= N; j++) val[i]!.push(fAt(-hr + i * cell, -hr + j * cell));
  }
  const pt = (i: number, j: number): P2 => [-hr + i * cell, -hr + j * cell];
  const lerp = (a: P2, b: P2, va: number, vb: number): P2 => {
    const t = va / (va - vb);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  // Segments du contour, chaque point d'arête calculé dans un ordre canonique (mêmes coordonnées des deux côtés).
  const segs: [P2, P2][] = [];
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const c: [number, number][] = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      const vs = c.map(([a, b]) => val[a]![b]!);
      const e: P2[] = [];
      for (let k = 0; k < 4; k++) {
        let a = k;
        let b = (k + 1) % 4;
        if (vs[a]! > 0 === vs[b]! > 0) continue;
        if (c[a]![0] * 99 + c[a]![1] > c[b]![0] * 99 + c[b]![1]) [a, b] = [b, a];
        e.push(lerp(pt(...c[a]!), pt(...c[b]!), vs[a]!, vs[b]!));
      }
      if (e.length === 2) segs.push([e[0]!, e[1]!]);
      else if (e.length === 4) segs.push([e[0]!, e[1]!], [e[2]!, e[3]!]);
    }
  // Chaînage des segments en lignes, prolongées par les deux bouts.
  const key = (q: P2): string => `${q[0].toFixed(3)},${q[1].toFixed(3)}`;
  const adj = new Map<string, P2[]>();
  for (const [a, b] of segs)
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const k = key(x);
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k)!.push(y);
    }
  const used = new Set<string>();
  const mark = (a: P2, b: P2): void => {
    used.add(`${key(a)}|${key(b)}`);
    used.add(`${key(b)}|${key(a)}`);
  };
  const lines: P2[][] = [];
  for (const [a, b] of segs) {
    if (used.has(`${key(a)}|${key(b)}`)) continue;
    const line: P2[] = [a, b];
    mark(a, b);
    for (const end of [1, 0]) {
      for (let guard = 0; guard < 4000; guard++) {
        const last = end ? line[line.length - 1]! : line[0]!;
        const nx = (adj.get(key(last)) ?? []).find((q) => !used.has(`${key(last)}|${key(q)}`));
        if (!nx) break;
        mark(last, nx);
        if (end) line.push(nx);
        else line.unshift(nx);
      }
    }
    lines.push(line);
  }
  const clamp = (q: P2): P2 => {
    const d = Math.hypot(q[0], q[1]);
    return d > hr ? [(q[0] * hr) / d, (q[1] * hr) / d] : q;
  };
  const arc = (from: number, to: number, dir: 1 | -1): P2[] => {
    let d = to - from;
    if (dir > 0 && d < 0) d += 2 * Math.PI;
    if (dir < 0 && d > 0) d -= 2 * Math.PI;
    const P: P2[] = [];
    for (let k = 1; k < 12; k++) {
      const t = from + (d * k) / 12;
      P.push([hr * Math.cos(t), hr * Math.sin(t)]);
    }
    return P;
  };
  const out: P2[][] = [];
  for (const raw of lines) {
    let line = raw.map(clamp);
    const a = raw[0]!;
    const b = raw[raw.length - 1]!;
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > cell * 0.5) {
      // Ligne ouverte (elle sort du disque) : fermée par l'arc du cercle qui est du côté des cheveux.
      const aa = Math.atan2(line[line.length - 1]![1], line[line.length - 1]![0]);
      const ab = Math.atan2(line[0]![1], line[0]![0]);
      const p1 = arc(aa, ab, 1);
      const p2 = arc(aa, ab, -1);
      const inside = (P: P2[]): boolean => fAt(P[5]![0] * 0.9, P[5]![1] * 0.9) > 0;
      line = line.concat(inside(p1) ? p1 : p2);
    }
    if (line.length > 2) out.push(line);
  }
  // Aucun contour mais le centre est dans la région (vue de dos) : le disque entier.
  if (!out.length && fAt(0, 0) > 0) {
    const P: P2[] = [];
    for (let k = 0; k < 32; k++) P.push([hr * Math.cos((k / 32) * 2 * Math.PI), hr * Math.sin((k / 32) * 2 * Math.PI)]);
    out.push(P);
  }
  return out;
}
```

- [ ] **Step 4: Write `dress.ts`**

```ts
// src/core/library/figure/dress.ts
import type { Accessory, Hair, Outfit } from '../city/people';

// Forme d'une tenue pour le pantin : seul ce qui change la géométrie (les couleurs vont dans des variables CSS).
// La signature sert de clé aux symboles : deux passants de même forme partagent leurs poses.
export type TopShape = 'coat' | 'tee' | 'long';
export type BottomShape = 'skirt' | 'shorts' | 'pants';
export type Shape = { hair: Hair; top: TopShape; bottom: BottomShape; acc: Accessory; umbrella: boolean };

export function shapeOf(o: Outfit, umbrella: boolean): Shape {
  const top: TopShape = o.top === 'coat' ? 'coat' : o.top === 'tee' || o.top === 'jersey' ? 'tee' : 'long';
  const bottom: BottomShape = o.bottom === 'skirt' || o.bottom === 'dress' ? 'skirt' : o.bottom === 'shorts' ? 'shorts' : 'pants';
  return { hair: o.hair, top, bottom, acc: o.accessory, umbrella };
}

export const signatureOf = (s: Shape): string => `${s.hair}.${s.top}.${s.bottom}.${s.acc}.${s.umbrella ? 'u' : 'n'}`;

export function shapeFromSignature(sig: string): Shape {
  const [hair, top, bottom, acc, u] = sig.split('.');
  return { hair: hair as Hair, top: top as TopShape, bottom: bottom as BottomShape, acc: acc as Accessory, umbrella: u === 'u' };
}
```

- [ ] **Step 5: Write `bake.ts`** (portage de `person()` de la maquette ; mêmes rayons et anneaux que la version validée)

```ts
// src/core/library/figure/bake.ts
import { add3, capsule, hull, mul3, pathOf, project, shrink, type P2, type V3 } from './geometry';
import { hairField, headRegion } from './head';
import { at, frameOf, poseOf, type Frame3, type Gait, type Pose } from './skeleton';
import type { Shape } from './dress';

// Cuisson d'une pose quantifiée du pantin en tracés SVG (maquette validée du 2026-10-11). Chaque groupe (jambe, bras,
// tronc, sac, tête) donne un trait d'encre (union de ses pièces, épaissie au dessin) puis, pièce par pièce, l'ombre et la
// partie éclairée. Les couleurs ne sont pas ici : chaque tracé porte une case (`slot`) que le dessin relie à une variable CSS.
export type Slot = 'skin' | 'top' | 'bottom' | 'hair' | 'hat' | 'acc' | 'shoe' | 'umb';
export type BakedPart = { slot: Slot; shade: string; lit: string | null };
export type BakedGroup = { ink: string; parts: BakedPart[] };
export type Baked = { groups: BakedGroup[]; eyes: P2[] };
// Indices : `yaw` 0–15 (pas de 22,5°), `phase` 0–11, `head` −4…4 (rotation de la tête seule, pas de 22,5°).
export type FigureKey = { sig: string; yaw: number; gait: Gait; phase: number; head: number };
export const keyString = (k: FigureKey): string => `${k.sig}|${k.yaw}|${k.gait}|${k.phase}|${k.head}`;
// Épaisseur du trait d'encre (unités du pantin), réglée sur les captures pour ≈ 0,5 px à l'écran autour de 24 px de haut.
export const INK_WIDTH = 0.8;

const HEAD_R = 4.4;
type Part = { P: P2[]; lit: P2[] | null; slot: Slot; z: number };
type Group = { parts: Part[]; z: number };

function capPart(a3: V3, b3: V3, ra: number, rb: number, slot: Slot): Part {
  const a = project(a3);
  const b = project(b3);
  const d = Math.min(ra, rb) * 0.34;
  const o = d * 0.62;
  return { P: capsule([a[0], a[1]], [b[0], b[1]], ra, rb), lit: capsule([a[0] - o, a[1] - o], [b[0] - o, b[1] - o], ra - d, rb - d), slot, z: (a[2] + b[2]) / 2 };
}
function hullPart(pts3: readonly V3[], slot: Slot, k = 0.86): Part {
  const pr = pts3.map(project);
  const P = hull(pr.map((q) => [q[0], q[1]] as const));
  const xs = P.map((q) => q[0]);
  const w = Math.max(...xs) - Math.min(...xs);
  return { P, lit: shrink(P, k, -w * 0.06, -w * 0.04), slot, z: pr.reduce((s, q) => s + q[2], 0) / pr.length };
}
// Anneau horizontal (section du tronc), tourné de `rot` autour de la verticale.
function ring(c: V3, fr: Frame3, rot: number, wid: number, dep: number, n = 10): V3[] {
  const out: V3[] = [];
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const lx = (Math.cos(a) * wid) / 2;
    const fx = (Math.sin(a) * dep) / 2;
    out.push(at(c, fr, fx * cr + lx * sr, 0, lx * cr - fx * sr));
  }
  return out;
}
const box = (c: V3, fr: Frame3, f: number, u: number, l: number): V3[] => {
  const pts: V3[] = [];
  for (const a of [-f, f]) for (const b of [-u, u]) for (const d of [-l, l]) pts.push(at(c, fr, a, b, d));
  return pts;
};

// Régions de cheveux par (coiffure, orientation de la tête) : ne dépendent pas de la position de la tête.
const headCache = new Map<string, P2[][]>();
function hairPolys(hair: Shape['hair'], headYawIndex: number): P2[][] {
  const k = `${hair}|${headYawIndex}`;
  let r = headCache.get(k);
  if (!r) {
    const field = hairField(hair);
    r = field ? headRegion(HEAD_R, frameOf((headYawIndex * Math.PI) / 8), field) : [];
    headCache.set(k, r);
  }
  return r;
}

export function bakeFigure(s: Shape, key: FigureKey): Baked {
  const yaw = (key.yaw * Math.PI) / 8;
  const q: Pose = poseOf(yaw, (key.phase * 2 * Math.PI) / 12, key.gait, { headYaw: (key.head * Math.PI) / 8, umbrella: s.umbrella });
  const fr = q.fr;
  const legsG: Group[] = [];
  const midG: Group[] = [];
  const bare = s.bottom === 'skirt' || s.bottom === 'shorts';
  const coat = s.top === 'coat';
  for (const g of q.legs) {
    const parts: Part[] = [];
    const legSlot: Slot = bare ? 'skin' : 'bottom';
    if (s.bottom === 'shorts') {
      const mid = add3(mul3(g.hip, 0.45), mul3(g.knee, 0.55));
      parts.push(capPart(g.hip, mid, 2.5, 2.3, 'bottom'), capPart(mid, g.knee, 1.7, 1.5, 'skin'));
    } else parts.push(capPart(g.hip, g.knee, 2.4, 1.85, legSlot));
    parts.push(capPart(g.knee, g.ankle, bare ? 1.45 : 1.8, bare ? 1.05 : 1.5, legSlot));
    parts.push(capPart(g.ankle, g.toe, 1.15, 1.05, 'shoe'));
    legsG.push({ parts, z: Math.max(...parts.map((p) => p.z)) });
  }
  legsG.sort((a, b) => a.z - b.z);
  // Tronc (jupe, short ou pantalon en haut des cuisses, manteau long).
  const shC = at(q.pelvis, fr, 10.4 * Math.sin(q.lean), 10.4 * Math.cos(q.lean), 0);
  const waist = at(q.pelvis, fr, 4.5 * Math.sin(q.lean), 4.5 * Math.cos(q.lean), 0);
  const torso: Part[] = [];
  if (s.bottom === 'skirt') {
    const kn = q.legs.map((g) => add3(mul3(g.hip, 0.35), mul3(g.knee, 0.65)));
    torso.push(hullPart([...ring(add3(q.pelvis, [0, 0.6, 0]), fr, q.pelvisTurn, 8.2, 4.8), ...ring(mul3(add3(kn[0]!, kn[1]!), 0.5), fr, q.pelvisTurn, 11, 6.5)], 'bottom'));
  } else if (!coat) torso.push(hullPart(ring(add3(q.pelvis, [0, 0.4, 0]), fr, q.pelvisTurn, 9, 6), 'bottom'));
  torso.push(hullPart([...ring(shC, fr, q.shoulderTurn, 10, 6.2), ...ring(waist, fr, (q.shoulderTurn + q.pelvisTurn) / 2, 8.2, 5.6), ...ring(add3(q.pelvis, [0, coat ? -6 : 0.4, 0]), fr, q.pelvisTurn, coat ? 10.4 : 9, coat ? 7.2 : 6)], 'top'));
  if (s.acc === 'scarf') torso.push(hullPart(ring(at(shC, fr, 0, 0.9, 0), fr, q.shoulderTurn, 6.5, 4.4, 8), 'acc', 0.8));
  midG.push({ parts: torso, z: project(q.pelvis)[2] });
  if (s.acc === 'backpack') {
    const c = at(shC, fr, -3.6, -4.5, 0);
    midG.push({ parts: [hullPart(box(c, fr, 1.4, 3.6, 2.6), 'acc', 0.8)], z: project(c)[2] });
  }
  // Bras (manches courtes : avant-bras nus), sac ou mallette dans la main droite, parapluie.
  for (const g of q.arms) {
    const ps: Part[] = [capPart(g.sh, g.elb, 2.0, 1.6, 'top'), capPart(g.elb, g.hand, 1.55, 1.2, s.top === 'tee' ? 'skin' : 'top'), capPart(g.hand, add3(g.hand, [0, -0.6, 0]), 1.05, 0.95, 'skin')];
    if (g.l > 0 && !s.umbrella && (s.acc === 'bag' || s.acc === 'case')) {
      const c = add3(g.hand, [0, s.acc === 'case' ? -3 : -3.6, 0]);
      ps.push(hullPart(box(c, fr, s.acc === 'case' ? 3.2 : 2.4, s.acc === 'case' ? 2 : 2.4, 0.9), 'acc', 0.8));
    }
    if (g.l > 0 && s.acc === 'ball' && !s.umbrella) ps.push(capPart(add3(g.hand, [0, -2.4, 0]), add3(g.hand, [0.01, -2.4, 0]), 2.2, 2.2, 'acc'));
    if (g.l > 0 && s.umbrella) {
      const top = add3(g.hand, [0, 11, 0]);
      ps.push(capPart(g.hand, top, 0.35, 0.35, 'shoe'));
      const canopy: V3[] = [add3(top, [0, 3.2, 0])];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * 2 * Math.PI;
        canopy.push(add3(top, [Math.cos(a) * 9.5, -1.2, Math.sin(a) * 9.5]));
      }
      ps.push(hullPart(canopy, 'umb', 0.84));
    }
    midG.push({ parts: ps, z: Math.max(...ps.map((p) => p.z)) });
  }
  // Masse arrière des cheveux longs : triée avec le corps (devant le dos, derrière le visage).
  const hf = q.headFrame;
  if (s.hair === 'long') {
    const pts: V3[] = [];
    for (let i = 0; i < 14; i++) {
      const a = Math.PI / 2 + (i / 13) * Math.PI;
      pts.push(add3(q.head, add3(mul3(hf.F, Math.cos(a) * HEAD_R * 0.9), mul3(hf.R, Math.sin(a) * HEAD_R))));
    }
    pts.push(at(q.head, hf, -2.4, -8.6, -3.6), at(q.head, hf, -2.4, -8.6, 3.6), at(q.head, hf, -3.2, -6, 0));
    midG.push({ parts: [hullPart(pts, 'hair', 0.84)], z: project(at(q.head, hf, -3, 0, 0))[2] });
  }
  midG.sort((a, b) => a.z - b.z);
  // Tête : cou, crâne, cheveux ou couvre-chef, chignon, pompon, visière ; yeux si le visage est tourné vers nous.
  const head: Part[] = [capPart(q.neck, at(q.neck, fr, 0.3, 2.2, 0), 1.35, 1.35, 'skin')];
  const hc = project(q.head);
  const circle = (c: readonly number[], r: number): P2[] => capsule([c[0]!, c[1]!], [c[0]! + 0.01, c[1]!], r, r);
  head.push({ P: circle(hc, HEAD_R), lit: circle([hc[0] - 0.6, hc[1] - 0.6], HEAD_R - 0.85), slot: 'skin', z: hc[2] });
  const capSlot: Slot = s.hair === 'cap' || s.hair === 'beanie' ? 'hat' : 'hair';
  const headIdx = (((key.yaw + key.head) % 16) + 16) % 16;
  for (const P0 of hairPolys(s.hair, headIdx)) {
    const P = P0.map((p) => [p[0] + hc[0], p[1] + hc[1]] as const);
    head.push({ P, lit: shrink(P, 0.84, -0.35, -0.35), slot: capSlot, z: hc[2] });
  }
  const sph = (el: number, az: number): V3 => {
    const ce = Math.cos(el);
    return add3(q.head, add3(add3(mul3(hf.F, ce * Math.cos(az) * HEAD_R), mul3(hf.R, ce * Math.sin(az) * HEAD_R)), mul3(hf.U, Math.sin(el) * HEAD_R)));
  };
  if (s.hair === 'bun') {
    const c = at(q.head, hf, -2.6, 3.6, 0);
    head.push(capPart(c, add3(c, [0.01, 0, 0]), 2.1, 2.1, 'hair'));
  }
  if (s.hair === 'beanie') {
    const c = sph(1.45, 0);
    head.push(capPart(c, add3(c, [0.01, 0, 0]), 1.1, 1.1, 'hat'));
  }
  if (s.hair === 'cap') head.push(capPart(sph(0.35, 0), at(q.head, hf, HEAD_R + 2.6, 1.3, 0), 0.8, 0.7, 'hat'));
  const visible = (el: number, az: number): boolean => {
    const ce = Math.cos(el);
    const n = add3(add3(mul3(hf.F, ce * Math.cos(az)), mul3(hf.R, ce * Math.sin(az))), mul3(hf.U, Math.sin(el)));
    return n[1] * Math.sin((12 * Math.PI) / 180) + n[2] * Math.cos((12 * Math.PI) / 180) > -0.02;
  };
  const eyes: P2[] = [];
  for (const sgn of [-1, 1]) {
    const az = sgn * 0.38;
    if (visible(0.02, az + 0.25 * sgn)) {
      const e = project(sph(0.02, az));
      eyes.push([Math.round(e[0] * 10) / 10, Math.round(e[1] * 10) / 10]);
    }
  }
  const all: Group[] = [...legsG, ...midG, { parts: head, z: Infinity }];
  return {
    groups: all.map((g) => ({ ink: g.parts.map((p) => pathOf(p.P)).join(''), parts: g.parts.map((p) => ({ slot: p.slot, shade: pathOf(p.P), lit: p.lit ? pathOf(p.lit) : null })) })),
    eyes,
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/core/library/figure/`
Expected: PASS (deux fichiers). Si « de face : cheveux » échoue, tracer `headRegion` comme dans la maquette (fichier de référence de la spec).

- [ ] **Step 7: Commit**

```bash
git add src/core/library/figure tests/core/library/figure
git commit -m "feat(bibliotheque): tête, habillage et cuisson des poses du pantin"
```

---

### Task 3: Allure : orientation, phase, demi-tour

**Files:**
- Create: `src/core/library/figure/gait.ts`
- Test: `tests/core/library/figure/figure-gait.test.ts`

**Interfaces:**
- Consumes: `STRIDE`, `PHASES`, `YAWS` (Task 1).
- Produces: `YAW_RIGHT = 0`, `YAW_FRONT = 4`, `YAW_LEFT = 8`, `YAW_BACK = 12`, `facingYaw(dir: 1 | -1): number`, `phaseIndexOf(distanceUnits: number): number`, `TURN_S = 0.45`, `turnYaw(from: number, to: number, p: number, via?: number): number`, `yawToward(dx: number, dz: number): number`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/library/figure/figure-gait.test.ts
import { describe, expect, it } from 'vitest';
import { YAW_BACK, YAW_FRONT, YAW_LEFT, YAW_RIGHT, facingYaw, phaseIndexOf, turnYaw, yawToward } from '../../../../src/core/library/figure/gait';
import { STRIDE } from '../../../../src/core/library/figure/skeleton';

describe('allure', () => {
  it('sens de marche → profil', () => {
    expect(facingYaw(1)).toBe(YAW_RIGHT);
    expect(facingYaw(-1)).toBe(YAW_LEFT);
  });
  it('une foulée complète = 12 images, puis on recommence', () => {
    expect(phaseIndexOf(0)).toBe(0);
    expect(phaseIndexOf(STRIDE / 2)).toBe(6);
    expect(phaseIndexOf(STRIDE)).toBe(0);
    expect(phaseIndexOf(-STRIDE / 12)).toBe(11);
  });
  it('demi-tour de droite à gauche en passant par la face', () => {
    const seen = new Set<number>();
    for (let i = 0; i <= 20; i++) seen.add(turnYaw(YAW_RIGHT, YAW_LEFT, i / 20, YAW_FRONT));
    expect(seen.has(YAW_FRONT)).toBe(true);
    expect(seen.has(YAW_BACK)).toBe(false);
    expect(turnYaw(YAW_RIGHT, YAW_LEFT, 0, YAW_FRONT)).toBe(YAW_RIGHT);
    expect(turnYaw(YAW_RIGHT, YAW_LEFT, 1, YAW_FRONT)).toBe(YAW_LEFT);
  });
  it('sans passage imposé : le plus court chemin (profil droit → dos)', () => {
    expect(turnYaw(YAW_RIGHT, YAW_BACK, 0.5)).toBe(14);
  });
  it('direction vers la profondeur', () => {
    expect(yawToward(0, -1)).toBe(YAW_BACK);
    expect(yawToward(0, 1)).toBe(YAW_FRONT);
    expect(yawToward(1, 1)).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/library/figure/figure-gait.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/library/figure/gait.ts
import { PHASES, STRIDE, YAWS } from './skeleton';

// Allure du pantin : orientation (indice 0–15, pas de 22,5°) et image de marche (0–11) tirées du déplacement réel.
// La phase suit la distance parcourue (unités du pantin) : les pieds ne glissent pas, quelle que soit la vitesse.
export const YAW_RIGHT = 0;
export const YAW_FRONT = 4;
export const YAW_LEFT = 8;
export const YAW_BACK = 12;
// Durée d'un demi-tour (s) : 0,4 s environ, petits pas sur place.
export const TURN_S = 0.45;

const mod = (a: number, n: number): number => ((a % n) + n) % n;
export const facingYaw = (dir: 1 | -1): number => (dir > 0 ? YAW_RIGHT : YAW_LEFT);
export const phaseIndexOf = (distanceUnits: number): number => mod(Math.floor((distanceUnits / STRIDE) * PHASES + 1e-9), PHASES);

// Écart signé le plus court de a vers b (indices).
const delta = (a: number, b: number): number => {
  const d = mod(b - a, YAWS);
  return d > YAWS / 2 ? d - YAWS : d;
};

// Orientation à l'avancement p ∈ [0, 1] d'un demi-tour de `from` à `to`, en passant par `via` s'il est donné.
export function turnYaw(from: number, to: number, p: number, via?: number): number {
  const t = Math.min(1, Math.max(0, p));
  const legs = via === undefined ? [[from, to]] : [[from, via], [via, to]];
  const lens = legs.map(([a, b]) => Math.abs(delta(a!, b!)));
  const total = lens.reduce((s, x) => s + x, 0);
  if (total === 0) return mod(to, YAWS);
  let walked = t * total;
  for (let i = 0; i < legs.length; i++) {
    const [a, b] = legs[i]!;
    if (walked <= lens[i]! || i === legs.length - 1) return mod(Math.round(a! + Math.sign(delta(a!, b!)) * Math.min(walked, lens[i]!)), YAWS);
    walked -= lens[i]!;
  }
  return mod(to, YAWS);
}

// Orientation d'un déplacement dans le plan du sol : dx vers la droite, dz vers le spectateur.
export const yawToward = (dx: number, dz: number): number => mod(Math.round(Math.atan2(dz, dx) / (Math.PI / 8)), YAWS);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/library/figure/figure-gait.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/figure/gait.ts tests/core/library/figure/figure-gait.test.ts
git commit -m "feat(bibliotheque): allure du pantin (orientation, phase, demi-tour)"
```

---

### Task 4: Hôte des symboles et figure Ghibli

**Files:**
- Create: `src/content/figure/figure-host.tsx`, `src/content/figure/ghibli-figure.tsx`
- Test: `tests/content/figure/figure-host.test.tsx`

**Interfaces:**
- Consumes: `bakeFigure`, `keyString`, `FigureKey`, `INK_WIDTH`, `Slot` (Task 2) ; `shapeOf`, `signatureOf`, `shapeFromSignature` ; `tone` (`src/content/city-sprites.tsx`) ; `mixHex` (`src/core/library/sky.ts`) ; `Outfit` ; `Sky`.
- Produces:
  - `class FigureRegistry { constructor(prefix: string, opts?: { max?: number; perFrame?: number }); readonly root: SVGGElement; ensure(key: FigureKey): string; request(key: FigureKey): string | null; flush(): void; size(): number }` — `ensure` crée tout de suite et rend `#id` ; `request` rend `#id` s'il existe, sinon met en file et rend `null` ; `flush` crée au plus `perFrame` symboles en file et retire les moins récents au-delà de `max`.
  - `FigureContext`, `useFigureRegistry(): FigureRegistry` (repli : un registre partagé du module), `FigureDefs({ registry }): ReactElement` (un `<g data-figure-defs>` qui accueille `registry.root`).
  - `figureVars(o: Outfit, sky: Sky, rainy: boolean, umbrella: boolean): CSSProperties`.
  - `GhibliFigure({ outfit, sky, rainy, umbrella, initial }: { outfit: Outfit; sky: Sky; rainy: boolean; umbrella: boolean; initial: Omit<FigureKey, 'sig'> }): ReactElement` → `<g data-figure="" data-sig={sig} data-key={…} style={vars}><use href=… /></g>`.
  - `poseFigure(reg: FigureRegistry, node: Element | null, pose: Omit<FigureKey, 'sig'>): void` — lit `data-sig`, ne réécrit `href` et `data-key` que s'ils changent ; si le symbole manque, le demande et garde l'image courante.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// tests/content/figure/figure-host.test.tsx
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { FigureContext, FigureDefs, FigureRegistry } from '../../../src/content/figure/figure-host';
import { GhibliFigure, poseFigure } from '../../../src/content/figure/ghibli-figure';
import { skyAt, sunTimes } from '../../../src/core/library/sky';
import type { Outfit } from '../../../src/core/library/city/people';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const o: Outfit = { skin: '#F2C9A5', hair: 'short', hairColor: '#4a2e1e', hatColor: '#000000', top: 'sweater', topColor: '#C0463A', bottom: 'jeans', bottomColor: '#243044', accessory: 'none', accessoryColor: '#5A6B7A' };
const sky = skyAt(12 * 60, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));
const key = { sig: 'short.long.pants.none.n', yaw: 0, gait: 'walk' as const, phase: 0, head: 0 };

describe('registre des symboles', () => {
  it('ensure crée un symbole une fois et rend sa référence', () => {
    const r = new FigureRegistry('t1');
    const a = r.ensure(key);
    expect(a.startsWith('#t1-')).toBe(true);
    expect(r.ensure(key)).toBe(a);
    expect(r.size()).toBe(1);
    expect(r.root.querySelector(a)?.querySelectorAll('path').length).toBeGreaterThan(5);
  });
  it('request met en file, flush respecte le budget par image', () => {
    const r = new FigureRegistry('t2', { perFrame: 2 });
    for (let p = 0; p < 5; p++) expect(r.request({ ...key, phase: p })).toBeNull();
    r.flush();
    expect(r.size()).toBe(2);
    r.flush();
    r.flush();
    expect(r.size()).toBe(5);
    expect(r.request({ ...key, phase: 4 })).not.toBeNull();
  });
  it('plafond : les moins récemment utilisés partent', () => {
    const r = new FigureRegistry('t3', { max: 3, perFrame: 10 });
    for (let p = 0; p < 5; p++) r.ensure({ ...key, phase: p });
    r.flush();
    expect(r.size()).toBe(3);
  });
});

describe('figure Ghibli', () => {
  it('rend un <use> vers un symbole existant ; poseFigure garde l’image si le symbole manque', () => {
    const r = new FigureRegistry('t4', { perFrame: 1 });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <FigureContext.Provider value={r}>
          <svg>
            <defs><FigureDefs registry={r} /></defs>
            <GhibliFigure outfit={o} sky={sky} rainy={false} umbrella={false} initial={{ yaw: 0, gait: 'walk', phase: 0, head: 0 }} />
          </svg>
        </FigureContext.Provider>,
      ),
    );
    const node = host.querySelector('[data-figure]')!;
    const use = node.querySelector('use')!;
    const first = use.getAttribute('href')!;
    expect(host.querySelector(`[data-figure-defs] ${first}`)).not.toBeNull();
    expect((node as HTMLElement).style.getPropertyValue('--f-top')).not.toBe('');
    poseFigure(r, node, { yaw: 8, gait: 'walk', phase: 5, head: 0 });
    expect(use.getAttribute('href')).toBe(first);
    r.flush();
    poseFigure(r, node, { yaw: 8, gait: 'walk', phase: 5, head: 0 });
    expect(use.getAttribute('href')).not.toBe(first);
    act(() => root.unmount());
    host.remove();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/figure/figure-host.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write `figure-host.tsx`**

```tsx
// src/content/figure/figure-host.tsx
import { createContext, useContext, useEffect, useRef, type ReactElement } from 'react';
import { INK_WIDTH, bakeFigure, keyString, type FigureKey } from '../../core/library/figure/bake';
import { shapeFromSignature } from '../../core/library/figure/dress';

// Hôte des symboles du pantin (G3) : les poses cuites (bake.ts) sont rangées dans un groupe des <defs> de la pièce, HORS de
// la couche des acteurs recopiée par <use> dans chaque fenêtre, et créées à la demande par le DOM (aucun re-rendu React).
// Chaque humain n'est qu'un <use> vers l'un d'eux. Plafond de symboles (les moins récemment utilisés partent) et budget de
// créations par image : tant qu'un symbole manque, la figure garde son image courante (poseFigure).
const SVG_NS = 'http://www.w3.org/2000/svg';

export class FigureRegistry {
  readonly root: SVGGElement;
  private readonly ids = new Map<string, string>();
  private readonly nodes = new Map<string, SVGGElement>();
  private readonly queue = new Map<string, FigureKey>();
  private next = 0;
  private readonly max: number;
  private readonly perFrame: number;
  constructor(
    private readonly prefix: string,
    opts: { max?: number; perFrame?: number } = {},
  ) {
    this.root = document.createElementNS(SVG_NS, 'g');
    this.max = opts.max ?? 900;
    this.perFrame = opts.perFrame ?? 8;
  }
  size(): number {
    return this.nodes.size;
  }
  // Référence d'un symbole existant (rafraîchit son rang d'usage), sinon null.
  private hit(k: string): string | null {
    const id = this.ids.get(k);
    if (!id) return null;
    const node = this.nodes.get(k)!;
    this.nodes.delete(k);
    this.nodes.set(k, node);
    return `#${id}`;
  }
  private create(key: FigureKey): string {
    const k = keyString(key);
    const id = `${this.prefix}-${(this.next++).toString(36)}`;
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('id', id);
    const baked = bakeFigure(shapeFromSignature(key.sig), key);
    const path = (d: string, fill: string, stroke?: string): void => {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', fill);
      if (stroke) {
        p.setAttribute('stroke', stroke);
        p.setAttribute('stroke-width', String(INK_WIDTH * 2));
        p.setAttribute('stroke-linejoin', 'round');
      }
      g.append(p);
    };
    const shadow = document.createElementNS(SVG_NS, 'ellipse');
    for (const [a, v] of [['cx', '0'], ['cy', '0.6'], ['rx', '7'], ['ry', '1.8'], ['fill', 'var(--f-ground)'], ['opacity', '0.28']]) shadow.setAttribute(a!, v!);
    g.append(shadow);
    for (const grp of baked.groups) {
      path(grp.ink, 'var(--f-ink)', 'var(--f-ink)');
      for (const part of grp.parts) {
        path(part.shade, `var(--fs-${part.slot})`);
        if (part.lit) path(part.lit, `var(--f-${part.slot})`);
      }
    }
    for (const [x, y] of baked.eyes) {
      const e = document.createElementNS(SVG_NS, 'ellipse');
      for (const [a, v] of [['cx', String(x)], ['cy', String(y)], ['rx', '0.5'], ['ry', '0.75'], ['fill', 'var(--f-ink)']]) e.setAttribute(a!, v!);
      g.append(e);
    }
    this.root.append(g);
    this.ids.set(k, id);
    this.nodes.set(k, g);
    this.queue.delete(k);
    return `#${id}`;
  }
  ensure(key: FigureKey): string {
    return this.hit(keyString(key)) ?? this.create(key);
  }
  request(key: FigureKey): string | null {
    const k = keyString(key);
    const found = this.hit(k);
    if (!found) this.queue.set(k, key);
    return found;
  }
  flush(): void {
    let made = 0;
    for (const key of [...this.queue.values()]) {
      if (made >= this.perFrame) break;
      this.create(key);
      made++;
    }
    // Plafond : retirer les moins récemment utilisés (début de la Map).
    while (this.nodes.size > this.max) {
      const [k, node] = this.nodes.entries().next().value as [string, SVGGElement];
      node.remove();
      this.nodes.delete(k);
      this.ids.delete(k);
    }
  }
}

let shared: FigureRegistry | null = null;
export const FigureContext = createContext<FigureRegistry | null>(null);
export function useFigureRegistry(): FigureRegistry {
  const r = useContext(FigureContext);
  if (r) return r;
  shared ??= new FigureRegistry('wmt-fig');
  return shared;
}

// Accueille le groupe des symboles du registre dans les <defs> de la pièce.
export function FigureDefs({ registry }: { registry: FigureRegistry }): ReactElement {
  const ref = useRef<SVGGElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.append(registry.root);
    return () => registry.root.remove();
  }, [registry]);
  return <g data-figure-defs="" ref={ref} />;
}
```

Note : dans le test, la figure est rendue avant que `FigureDefs` n'ait accroché `registry.root` (effet) ; le sélecteur `[data-figure-defs] #id` passe parce que `act` exécute les effets. Les symboles créés pendant le rendu existent déjà dans `registry.root` (détaché) : la référence est valable dès l'accrochage.

- [ ] **Step 4: Write `ghibli-figure.tsx`**

```tsx
// src/content/figure/ghibli-figure.tsx
import type { CSSProperties, ReactElement } from 'react';
import { keyString, type FigureKey } from '../../core/library/figure/bake';
import { shapeOf, signatureOf } from '../../core/library/figure/dress';
import type { Outfit } from '../../core/library/city/people';
import { mixHex, type Sky } from '../../core/library/sky';
import { tone } from '../city-sprites';
import { useFigureRegistry, type FigureRegistry } from './figure-host';

// Humain au trait Ghibli (G3) : un <g data-figure> qui porte les couleurs de la tenue en variables CSS (teinte de nuit comme
// le dessin classique, ombre violette, encre assombrie la nuit) et un <use> vers la pose courante. Les boucles changent la
// pose par poseFigure, sans re-rendu. Repère : pieds à l'origine, comme PersonSprite ; jamais retourné en miroir.
const shadeOf = (c: string): string => mixHex(mixHex(c, '#4a3a6a', 0.3), '#000000', 0.05);

export function figureVars(o: Outfit, sky: Sky, rainy: boolean, umbrella: boolean): CSSProperties {
  const t = (c: string): string => tone(c, sky);
  // Sous la pluie, les hauts légers deviennent un imperméable (comme PersonSprite).
  const raincoat = rainy && (o.top === 'jacket' || o.top === 'sweater' || o.top === 'tee' || o.top === 'shirt');
  const slots: Record<string, string> = {
    skin: o.skin,
    top: raincoat ? '#2E5E8A' : o.topColor,
    bottom: o.bottomColor,
    hair: o.hairColor,
    hat: o.hatColor,
    acc: o.accessoryColor,
    shoe: '#3a2a24',
    umb: umbrella ? '#C0392B' : '#C0392B',
  };
  const vars: Record<string, string> = { '--f-ink': t('#33241f'), '--f-ground': '#3a2f5a' };
  for (const [k, c] of Object.entries(slots)) {
    vars[`--f-${k}`] = t(c);
    vars[`--fs-${k}`] = t(shadeOf(c));
  }
  return vars as CSSProperties;
}

type Pose = Omit<FigureKey, 'sig'>;

export function GhibliFigure({ outfit, sky, rainy, umbrella, initial }: { outfit: Outfit; sky: Sky; rainy: boolean; umbrella: boolean; initial: Pose }): ReactElement {
  const reg = useFigureRegistry();
  const sig = signatureOf(shapeOf(outfit, umbrella));
  const key = { sig, ...initial };
  return (
    <g data-figure="" data-sig={sig} data-key={keyString(key)} style={figureVars(outfit, sky, rainy, umbrella)}>
      <use href={reg.ensure(key)} />
    </g>
  );
}

// Pose d'une figure par la boucle : n'écrit que si la pose change ; symbole manquant → demandé, image courante gardée.
export function poseFigure(reg: FigureRegistry, node: Element | null, pose: Pose): void {
  if (!node) return;
  const sig = node.getAttribute('data-sig');
  if (!sig) return;
  const key = { sig, ...pose };
  const k = keyString(key);
  if (node.getAttribute('data-key') === k) return;
  const href = reg.request(key);
  if (!href) return;
  node.setAttribute('data-key', k);
  node.firstElementChild?.setAttribute('href', href);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/content/figure/figure-host.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/content/figure tests/content/figure
git commit -m "feat(bibliotheque): hôte des symboles du pantin et figure Ghibli"
```

---

### Task 5: Hôte dans la pièce et passants Ghibli

**Files:**
- Modify: `src/content/RoomView.tsx` (≈ l. 390-405 : `<defs>` du monde), `src/content/scene-panorama.tsx` (`ScenePanorama`, fin du fichier), `src/content/city-life.tsx`
- Test: `tests/content/city-life-ghibli.test.tsx`

**Interfaces:**
- Consumes: `FigureRegistry`, `FigureContext`, `FigureDefs`, `useFigureRegistry`, `GhibliFigure`, `poseFigure` (Task 4) ; `facingYaw`, `phaseIndexOf` (Task 3) ; `useArtStyle` (`src/content/art-setting.ts`).
- Produces: dans `city-life.tsx`, `pedPose(p: Pedestrian, m: CityMetrics, t: number): { yaw: number; gait: 'walk'; phase: number; head: 0 }` (exporté pour les tests) et le rendu Ghibli des passants (adulte, enfants accompagnés, second adulte du couple).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// tests/content/city-life-ghibli.test.tsx
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ART_KEY, writeArt } from '../../src/content/art-setting';
import { CityLifeLayer, pedPose } from '../../src/content/city-life';
import { dayContext } from '../../src/core/library/city/calendar';
import type { CityContext } from '../../src/core/library/city/intensity';
import { cityMetrics } from '../../src/core/library/city/metrics';
import { pedestriansFor } from '../../src/core/library/city/people';
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
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  localStorage.removeItem(ART_KEY);
});
const times = sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120);
const make = (): HTMLDivElement => {
  const minutes = 12 * 60;
  const sky = skyAt(minutes, times);
  const city: CityContext = { minutes, day: dayContext({ y: 2026, m: 10, d: 9 }, []), precip: 0, snow: false, storm: false, daylight: sky.daylight };
  return render(<svg><CityLifeLayer width={720} height={340} sky={sky} seed={1} city={city} rainy={false} /></svg>);
};

describe('passants Ghibli', () => {
  it('classique : aucun pantin', () => {
    const c = make();
    expect(c.querySelectorAll('[data-ped] [data-figure]').length).toBe(0);
  });
  it('Ghibli : chaque passant est un pantin, sans miroir', () => {
    writeArt('ghibli');
    const c = make();
    const peds = [...c.querySelectorAll('[data-ped]')];
    expect(peds.length).toBeGreaterThan(0);
    for (const p of peds) {
      expect(p.querySelector(':scope > [data-figure]')).not.toBeNull();
      expect(p.getAttribute('transform')).not.toMatch(/scale\(-/);
    }
  });
  it('bascule classique → Ghibli pendant que la scène tourne', () => {
    const c = make();
    act(() => writeArt('ghibli'));
    expect(c.querySelectorAll('[data-ped] [data-figure]').length).toBeGreaterThan(0);
  });
  it('pose : profil selon le sens, phase liée à la distance', () => {
    const m = cityMetrics(340);
    const p = pedestriansFor(720, 1)[0]!;
    const a = pedPose(p, m, 100);
    expect(a.yaw).toBe(p.dir > 0 ? 0 : 8);
    expect(a.gait).toBe('walk');
    expect(a.phase).toBeGreaterThanOrEqual(0);
    expect(a.phase).toBeLessThan(12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/city-life-ghibli.test.tsx`
Expected: FAIL (`pedPose` absent).

- [ ] **Step 3: Implement**

Dans `RoomView.tsx` : créer le registre une fois par pièce (`const figures = useMemo(() => new FigureRegistry(`${worldId}-fig`), [worldId]);`), envelopper le contenu du `<svg>` racine de la pièce dans `<FigureContext.Provider value={figures}>`, et ajouter `<FigureDefs registry={figures} />` dans les `<defs>` du monde, **en dehors** des groupes `#${worldId}` et `#${worldId}-actors` (juste après les clipPaths des fenêtres). Dans `scene-panorama.tsx`, `ScenePanorama` (affichage sans fenêtres) : même chose avec un registre `useMemo(() => new FigureRegistry(`pf${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`), [])` et `<defs><FigureDefs registry={…} /></defs>` en tête du groupe.

Dans `city-life.tsx` :

```tsx
// en tête
import { useArtStyle } from './art-setting';
import { GhibliFigure, poseFigure } from './figure/ghibli-figure';
import { useFigureRegistry } from './figure/figure-host';
import { facingYaw, phaseIndexOf } from '../core/library/figure/gait';

// Pose d'un passant Ghibli : profil dans le sens de marche, image réglée sur la distance (unités du pantin).
export const pedPose = (p: Pedestrian, m: CityMetrics, t: number): { yaw: number; gait: 'walk'; phase: number; head: 0 } => {
  const k = m.unit * STREET_SCALE.person * p.scale;
  return { yaw: facingYaw(p.dir), gait: 'walk', phase: phaseIndexOf((p.phase + p.speed * t) / k), head: 0 };
};
```

`pedTransform` reçoit un paramètre `mirror: boolean` (vrai en classique) : `scale(${((mirror ? p.dir : 1) * k).toFixed(3)} ${k.toFixed(3)})`. Dans `CityLifeLayer` : `const [art] = useArtStyle(); const ghibli = art === 'ghibli'; const figures = useFigureRegistry();`. Dans la boucle `place`, en tête : `if (ghibli) figures.flush();` ; pour chaque passant déplacé : transform avec `mirror = !ghibli`, et en Ghibli `poseFigure(figures, node.querySelector(':scope > [data-figure]'), pedPose(p, metrics, t))` ainsi que, pour chaque compagnon, `poseFigure(figures, companionNode, sameKeyAsParent)` (les compagnons marchent au même pas ; chercher `[data-companion] > [data-figure]` une fois lors de la collecte des nœuds et garder la liste par passant). Ajouter `ghibli` et `figures` aux dépendances du `useMemo` de `place`.

Rendu des passants, en Ghibli :

```tsx
{p.companions.map((outfit, k) => (
  <g key={k} data-companion="" transform={p.pair ? `translate(${(ghibli ? -p.dir : -1) * PAIR_GAP} 0) scale(0.95)` : `translate(${(ghibli ? -p.dir : -1) * COMPANION_GAP * (k + 1)} 0) scale(0.7)`}>
    {ghibli ? <GhibliFigure outfit={outfit} sky={sky} rainy={rainy} umbrella={false} initial={pedPose(p, metrics, t0)} /> : <PersonSprite outfit={outfit} sky={sky} rainy={rainy} umbrella={false} />}
  </g>
))}
{ghibli ? (
  <GhibliFigure outfit={p.outfit} sky={sky} rainy={rainy} umbrella={intensity.umbrellas} initial={pedPose(p, metrics, t0)} />
) : (
  <PersonSprite outfit={p.outfit} sky={sky} rainy={rainy} umbrella={intensity.umbrellas} mark={marks.get(p.id)} />
)}
```

(en Ghibli, les signes de fête ne sont pas dessinés avant G3b : spec §3.) L'attribut `transform` initial utilise aussi `pedTransform(p, metrics, width, t0, !ghibli)`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/content/city-life-ghibli.test.tsx tests/content/city-life.test.tsx`
Expected: PASS (les tests existants de `city-life.test.tsx` restent verts : le classique ne change pas).

- [ ] **Step 5: Commit**

```bash
git add src/content/RoomView.tsx src/content/scene-panorama.tsx src/content/city-life.tsx tests/content/city-life-ghibli.test.tsx
git commit -m "feat(bibliotheque): passants en pantin Ghibli, hôte des symboles dans la pièce"
```

---

### Task 6: Passants : présence qui ne bascule qu'au bord du monde

**Files:**
- Modify: `src/core/library/city/people.ts`, `src/content/city-life.tsx`
- Test: `tests/core/library/city-people.test.ts` (ajouts), `tests/content/city-life.test.tsx` (ajout)

**Interfaces:**
- Produces: `pedShown(prev: boolean, wanted: boolean, x: number, width: number): boolean` dans `people.ts` — rend `wanted` si `x < -EDGE_PAD || x > width + EDGE_PAD` (hors champ), sinon `prev` ; `EDGE_PAD = 12`.

- [ ] **Step 1: Write the failing tests**

```ts
// ajouts à tests/core/library/city-people.test.ts
import { pedShown } from '../../../src/core/library/city/people';
describe('présence des passants au bord', () => {
  it('ne bascule qu’hors champ', () => {
    expect(pedShown(true, false, 300, 720)).toBe(true);
    expect(pedShown(true, false, -20, 720)).toBe(false);
    expect(pedShown(false, true, 300, 720)).toBe(false);
    expect(pedShown(false, true, 740, 720)).toBe(true);
  });
});
```

```tsx
// ajout à tests/content/city-life.test.tsx : plus aucun fondu sur les passants
it('passants : aucune transition d’opacité (ils entrent et sortent par les bords)', () => {
  const c = make(12, { y: 2026, m: 10, d: 9 });
  for (const p of c.querySelectorAll<SVGGElement>('[data-ped]')) {
    expect(p.style.transition).toBe('');
    expect(['0', '1']).toContain(p.getAttribute('opacity'));
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/library/city-people.test.ts tests/content/city-life.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`people.ts` :

```ts
// Marge hors champ (px) où un passant peut changer de présence : il ne surgit ni ne s'efface jamais dans la rue visible.
export const EDGE_PAD = 12;
// Présence affichée : la présence voulue (pedestrianGate, à la minute) n'est prise que lorsque le passant est hors champ ;
// celui qui doit partir finit sa traversée, celui qui doit arriver attend son prochain passage par le bord.
export function pedShown(prev: boolean, wanted: boolean, x: number, width: number): boolean {
  return x < -EDGE_PAD || x > width + EDGE_PAD ? wanted : prev;
}
```

`city-life.tsx` : `const shownPeds = useRef<Map<string, boolean>>(new Map());` (gardé entre les minutes). Au rendu : pour chaque passant, `shown = shownPeds.current.get(p.id) ?? pedActive.has(p.id)` (au premier rendu de la scène, chacun est d'emblée à sa place) ; `data-active` et `opacity` (`1`/`0`) suivent `shown` ; supprimer le `style` de transition des passants. Dans la boucle : pour chaque passant, `x = loopX(...)`, `next = pedShown(prev, pedActive.has(p.id), x, width)` ; si `next !== prev`, mettre à jour la Map, `data-active` et `opacity` (`setIfChanged`). Placer (transform, pose) chaque passant **affiché** à chaque image ; un passant caché n'est pas touché. Remplacer `moves(p.id, t)` pour les passants par ce test (les véhicules gardent leur logique et leur fondu : hors périmètre). Mouvement réduit : `shown = pedActive.has(p.id)` (aucune boucle).

Garder `FADE_S`/`leaving` pour les véhicules seulement.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/library/city-people.test.ts tests/content/city-life.test.tsx tests/content/city-life-ghibli.test.tsx`
Expected: PASS. Si un test existant de `city-life.test.tsx` vérifiait le fondu des passants, l'adapter à la nouvelle règle (présence 0/1, bascule au bord) et le dire dans le message de commit.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/city/people.ts src/content/city-life.tsx tests
git commit -m "fix(bibliotheque): les passants n'apparaissent et ne disparaissent plus qu'au bord du monde"
```

---

### Task 7: Étapes de porte et trajets des habitants sans fondu

**Files:**
- Create: `src/core/library/city/doorway.ts`
- Modify: `src/core/library/city/doors.ts`
- Test: `tests/core/library/city-doorway.test.ts`, `tests/core/library/city-doors.test.ts` (adapter)

**Interfaces:**
- Consumes: `YAW_FRONT`, `YAW_BACK`, `facingYaw`, `turnYaw`, `TURN_S` (Task 3) ; `MAX_TRIP_PX`, `WORLD_MARGIN`.
- Produces:
  - `doorway.ts` : `THRESHOLD_S = 1.0` ; `type Stage = 'street' | 'turn' | 'threshold'` ; `type Passage = { stage: Stage; x: number; depth: number; yaw: number; gait: 'walk' | 'step'; walked: number }` (`depth` 0 = sur le trottoir, 1 = au fond de l'entrée ; `walked` en px depuis le début du trajet, pour la phase) ; `farDoorX(fromX: number, dir: 1 | -1, width: number, doorXs: readonly number[]): number | null` (la porte la plus lointaine dans le sens de marche à moins de `MAX_TRIP_PX`, si le bord du monde est au-delà du plafond ; `null` si le bord est atteignable) ; `entranceOpening(doorLeftX: number, m: CityMetrics): { x: number; y: number; w: number; h: number }` (ouverture de l'`EntranceSprite` : x = `entranceLeft(doorLeftX, m.unit) + 2·sx`, w = `18·sx`, y = `m.doorY − 25·sy`, h = `25·sy`, avec `sx = m.unit·STREET_SCALE.entranceX`, `sy = m.unit·STREET_SCALE.entranceY`) ; `legsOf(...)` (interne).
  - `doors.ts` : `Trip` gagne `endDoorX: number | null` (porte au bout du trajet plafonné : l'habitant qui sort y entre ; celui qui rentre en sort) ; `tripsFor(doors: Door[], seed: number, width = Infinity)` ; `tripAt(trip, width, t): Passage | null` (plus de `fade`).

Déroulé d'un trajet `out` (temps `c` dans le cycle) : seuil de sa porte (depth 1 → 0, yaw `YAW_FRONT`, `walk`) pendant `THRESHOLD_S` ; demi-tour de `YAW_FRONT` vers `facingYaw(dir)` (`step`) pendant `TURN_S` ; marche dans la rue (`street`) jusqu'au bord du monde (hors champ, fin) ou jusqu'à `endDoorX` ; dans ce cas : demi-tour de `facingYaw(dir)` vers `YAW_BACK` (chemin le plus court) puis seuil (depth 0 → 1, yaw `YAW_BACK`). Trajet `in` : symétrique (départ du bord ou du seuil de `endDoorX` côté opposé, arrivée au seuil de sa porte). `walked` cumule la distance de la rue (constante pendant les demi-tours, + 0 pendant le seuil). Durée totale toujours < `TRIP_CYCLE`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/core/library/city-doorway.test.ts
import { describe, expect, it } from 'vitest';
import { THRESHOLD_S, entranceOpening, farDoorX } from '../../../src/core/library/city/doorway';
import { TRIP_CYCLE, doorsFor, tripAt, tripsFor } from '../../../src/core/library/city/doors';
import { cityMetrics } from '../../../src/core/library/city/metrics';
import { TURN_S, YAW_BACK, YAW_FRONT } from '../../../src/core/library/figure/gait';

describe('porte au bout d’un trajet plafonné', () => {
  it('bord atteignable : pas de porte', () => {
    expect(farDoorX(100, -1, 720, [50, 300, 600])).toBeNull();
  });
  it('bord trop loin : la porte la plus lointaine dans le plafond, dans le sens de marche', () => {
    expect(farDoorX(100, 1, 3456, [50, 300, 600, 700])).toBe(600);
  });
});

describe('trajets des habitants', () => {
  const width = 3456;
  const doors = doorsFor(width, 340, 3);
  const trips = tripsFor(doors, 3, width);
  const walkOf = (trip: (typeof trips)[number]): ReturnType<typeof tripAt>[] => {
    const out: ReturnType<typeof tripAt>[] = [];
    for (let c = 0; c < TRIP_CYCLE; c += 0.1) out.push(tripAt(trip, width, c - trip.phase));
    return out;
  };
  it('un habitant qui sort commence dans l’ombre de sa porte, de face', () => {
    const trip = trips.find((t) => t.kind === 'out')!;
    const first = walkOf(trip).find((s) => s !== null)!;
    expect(first.stage).toBe('threshold');
    expect(first.yaw).toBe(YAW_FRONT);
    expect(first.depth).toBeGreaterThan(0.9);
    expect(first.x).toBeCloseTo(trip.doorX, 5);
  });
  it('un habitant qui rentre finit de dos dans l’ombre de sa porte', () => {
    const trip = trips.find((t) => t.kind === 'in')!;
    const states = walkOf(trip).filter((s) => s !== null);
    const last = states[states.length - 1]!;
    expect(last.stage).toBe('threshold');
    expect(last.yaw).toBe(YAW_BACK);
    expect(last.depth).toBeGreaterThan(0.9);
  });
  it('jamais de fin en pleine rue : chaque bout est une porte ou hors champ', () => {
    for (const trip of trips) {
      const states = walkOf(trip).filter((s) => s !== null);
      for (const end of [states[0]!, states[states.length - 1]!]) {
        const offscreen = end.x < 0 || end.x > width;
        expect(end.stage === 'threshold' || offscreen).toBe(true);
      }
    }
  });
  it('durée du passage d’une porte', () => {
    expect(THRESHOLD_S + TURN_S).toBeLessThan(2);
  });
  it('ouverture de l’entrée sous l’auvent', () => {
    const m = cityMetrics(340);
    const o = entranceOpening(doors[0]!.x, m);
    expect(o.y + o.h).toBeCloseTo(m.doorY, 5);
    expect(o.w).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/library/city-doorway.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`doorway.ts` : constantes et `farDoorX`, `entranceOpening` comme décrit (importer `entranceLeft` n'est pas possible depuis `core` vers `content` : recopier la formule `doorLeftX + (DOOR_WIDTH / 2) * (1 - unit)` avec un commentaire qui renvoie à `entranceLeft` de `city-sprites.tsx`). Fonction pure de déroulé :

```ts
// Déroulé d'un aller simple : [seuil de départ ?] → [demi-tour ?] → rue → [demi-tour ?] → [seuil d'arrivée ?].
// `fromDoor` / `toDoor` : le trajet commence / finit par une porte. `c` : secondes depuis le début du trajet.
export function passageAt(o: { fromX: number; toX: number; dir: 1 | -1; speed: number; fromDoor: boolean; toDoor: boolean }, c: number): Passage | null
```

Durées : seuil `THRESHOLD_S`, demi-tour `TURN_S`, rue `|toX − fromX| / speed`. Seuil de départ : `depth = 1 − c/THRESHOLD_S`, `yaw = YAW_FRONT`, `gait = 'walk'`, `x = fromX`. Demi-tour de départ : `yaw = turnYaw(YAW_FRONT, facingYaw(dir), p)`, `gait = 'step'`. Rue : `x = fromX + dir·speed·s`, `walked = speed·s`, `yaw = facingYaw(dir)`. Demi-tour d'arrivée : `turnYaw(facingYaw(dir), YAW_BACK, p)`. Seuil d'arrivée : `depth = c'/THRESHOLD_S`, `yaw = YAW_BACK`. Après la fin : `null`.

`doors.ts` : `tripsFor(doors, seed, width = Infinity)` calcule `endDoorX` avec `farDoorX(doorX, kind === 'out' ? dir : -dir, width, doorXs)` (centres des autres portes, la sienne exclue ; `width` infini → toujours `null`, les tests existants gardent leur sens). `tripAt` : cycle comme aujourd'hui (`c = (t + phase) mod TRIP_CYCLE`), puis `passageAt` avec, pour `out` : `fromX = doorX, fromDoor = true, toX = endDoorX ?? (bord hors champ : dir > 0 ? width + WORLD_MARGIN : −WORLD_MARGIN), toDoor = endDoorX !== null` ; pour `in` : `fromX = endDoorX ?? bord opposé, fromDoor = endDoorX !== null, toX = doorX, toDoor = true`, `dir` inchangé (l'habitant qui rentre marche dans le sens `dir` vers sa porte). Supprimer `FADE_S`/`smooth`/`reachOf` devenus inutiles ; garder `MAX_TRIP_PX` (utilisé par `farDoorX` et les clients).

Adapter `tests/core/library/city-doors.test.ts` : remplacer les attentes sur `fade` par des attentes sur `stage`/`depth` (même intention : début et fin du trajet doux) et garder les tests de densité (`residentFlow`) intacts.

Mettre à jour les appels dans `city-life.tsx` (`tripsFor(doors, seed, width)`, `residentState` qui lit maintenant un `Passage`) : à cette étape, faire seulement compiler le rendu existant (x = `passage.x`, opacité 1 pendant la rue, 1 − depth pendant le seuil) ; le rendu de porte arrive à la tâche 8.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/library/city-doorway.test.ts tests/core/library/city-doors.test.ts tests/content/city-life.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/city/doorway.ts src/core/library/city/doors.ts src/content/city-life.tsx tests
git commit -m "feat(bibliotheque): trajets des habitants par les portes (demi-tour, seuil) au lieu des fondus"
```

---

### Task 8: Habitants : rendu du seuil, pantin et verrou du trajet

**Files:**
- Modify: `src/content/city-life.tsx`
- Test: `tests/content/city-life.test.tsx` (ajouts)

**Interfaces:**
- Consumes: `tripAt`, `Passage`, `entranceOpening` (Task 7) ; `GhibliFigure`, `poseFigure` (Task 4) ; `phaseIndexOf` (Task 3).
- Produces: deux nœuds par habitant : `[data-resident]` (rue) et `[data-resident-door]` (un `<svg>` imbriqué posé sur l'ouverture de la porte de départ ou d'arrivée, `overflow="hidden"`, contenant un rectangle d'ombre `[data-door-dark]` puis la figure) ; un verrou `Map<tripId, { turn: number; on: boolean }>` dans la boucle.

Règles :
- **Verrou** : la décision `tripHappens(trip, t, gate)` est prise au premier instant observé de chaque tour de cycle (`turn = floor((t + phase) / TRIP_CYCLE)`) puis gardée tout le tour : un changement de minute ne fait plus disparaître un habitant en route.
- **Rue** (`stage` `street` ou `turn`) : nœud de rue actif, `opacity` 1, transform `translate(x doorY) scale(±k k)` (miroir seulement en classique) ; en Ghibli pose `{ yaw, gait, phase: phaseIndexOf(walked / k), head: 0 }`.
- **Seuil** : nœud de porte actif (celui de la porte concernée : départ si le seuil est au début, arrivée sinon), nœud de rue caché. Dans le `<svg>` imbriqué (coordonnées locales = monde − ouverture), la figure est à `translate(x − o.x, o.h − depth·3·unit) scale(k·(1 − 0.12·depth))`, `opacity = 1 − depth` ; le rectangle d'ombre (`#1a1622`, couvre l'ouverture) a `opacity = 0.85 · min(1, 4·min(p, 1 − p))` où `p` est l'avancement du seuil (la porte « s'ouvre » puis « se referme »). Classique : même chose avec `PersonSprite` de profil (pas de demi-tour visible).
- Aucune `transition` CSS d'opacité sur les habitants.

- [ ] **Step 1: Write the failing tests**

```tsx
// ajouts à tests/content/city-life.test.tsx
import { THRESHOLD_S } from '../../src/core/library/city/doorway';
it('habitants : aucune transition CSS ; nœud de porte rogné par un <svg> imbriqué', () => {
  const c = make(8, { y: 2026, m: 10, d: 9 });
  for (const r of c.querySelectorAll<SVGGElement>('[data-resident]')) expect(r.style.transition).toBe('');
  const doorsNodes = c.querySelectorAll('svg[data-resident-door]');
  expect(doorsNodes.length).toBeGreaterThan(0);
  for (const d of doorsNodes) {
    expect(d.getAttribute('overflow')).toBe('hidden');
    expect(d.querySelector('[data-door-dark]')).not.toBeNull();
  }
});
it('habitant au seuil (horloge figée) : nœud de porte visible, nœud de rue caché', () => {
  // Trouver un instant où un trajet « out » tiré est dans son seuil (tripAt(...).stage === 'threshold') avec la graine 1,
  // le figer par vi.spyOn(Date, 'now'), rendre, et vérifier data-active des deux nœuds de ce trajet.
});
```

Écrire le second test complètement : parcourir `tripsFor(doorsFor(720, 340, 1), 1, 720)`, chercher `t` dans `[T0, T0 + 600)` (pas 0,25 s, `T0 = 1.8e9`) tel que `tripAt(trip, 720, t)?.stage === 'threshold'` et `tripHappens(trip, t, residentFlow(…).out) === true` (même calcul que `make(8, …)`), fixer `vi.spyOn(Date, 'now').mockReturnValue(t * 1000)`, rendre, puis `expect(node('[data-resident-door][data-trip-id="…"]').getAttribute('data-active')).toBe('true')` et le nœud de rue `'false'`. Ajouter `data-trip-id` aux deux nœuds pour ce test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/content/city-life.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** (rendu des deux nœuds, verrou, placement dans la boucle avec `setIfChanged` pour `data-active` et `opacity`, `poseFigure` en Ghibli sur la figure active seulement).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/content/city-life.test.tsx tests/content/city-life-ghibli.test.tsx tests/core/library/city-doors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content/city-life.tsx tests/content/city-life.test.tsx
git commit -m "feat(bibliotheque): habitants en pantin, passage du seuil dans l'ombre de l'entrée"
```

---

### Task 9: Clients des commerces

**Files:**
- Modify: `src/core/library/city/shops/customers.ts`, `src/content/city-shops-life.tsx`, `src/content/city-life.tsx` (appel de `visitsFor`)
- Test: `tests/core/library/city-shops-customers.test.ts` (adapter + ajouts), `tests/content/city-shops-life.test.tsx` s'il existe (sinon ajouts à `tests/content/city-life.test.tsx`)

**Interfaces:**
- Consumes: `passageAt`, `farDoorX`, `THRESHOLD_S`, `Passage` (Task 7) ; `GhibliFigure`, `poseFigure` (Task 4) ; `TURN_S`, `YAW_FRONT`, `YAW_BACK`, `facingYaw` (Task 3).
- Produces:
  - `visitsFor(slots, frames, seed, typeOf, doorXs: readonly number[] = [], width = Infinity)` : `Visit` gagne `endDoorX: number | null` (porte d'où il vient / où il repart quand le bord est hors plafond).
  - `VisitState = { stage: 'in' | 'enter' | 'inside' | 'exit' | 'out'; x: number; passage: Passage | null; inner: { x: number; yaw: number; gait: 'walk' | 'stand' | 'seated'; walked: number } | null; gesture: Pose | null; carry: boolean }` ; plus de `fade`.
  - `visitAt(v, width, t): VisitState | null` : `in` = `passageAt` du bord (ou de `endDoorX`) jusqu'à la porte du local (avec demi-tour vers `YAW_BACK` et seuil d'arrivée → étape `enter` pendant le seuil) ; `inside` : entre par le bord de la vitrine côté porte (x local 0 ou `window.w`), marche jusqu'à `seat.x − window.x`, se tourne vers sa place (`yaw` 2 si `seat.facing > 0`, 6 sinon), reste (`stand` ou `seated` selon la famille), revient au bord ; `exit` : seuil de la porte de face puis demi-tour ; `out` : rue jusqu'au bord ou `endDoorX`. La durée de séjour `stay` inclut la marche intérieure. `customerState` garde sa signature mais rend `{ on, stage, x, passage, inner, gesture, carry }`.
  - Verrou par (visite, tour de `VISIT_CYCLE`) dans `placeCustomers`, comme les habitants.

Rendu : le nœud de trottoir (`data-customer`) suit les étapes `in`/`out` comme un habitant ; le passage de la porte du local utilise un nœud `svg[data-customer-door]` posé sur `frame.door` (ombre + figure, mêmes règles qu'à la tâche 8) ; le nœud intérieur garde son `<svg>` de vitrine, n'a plus de fondu, et se place à `inner.x` (le bord de la vitrine rogne naturellement le client qui entre). En Ghibli : `GhibliFigure` (`umbrella` sur le trottoir comme aujourd'hui ; à l'intérieur, pas d'objet ni de geste avant G3b : pose `stand` ou `seated`), transform sans miroir ; en classique : `PersonSprite`/`PosedPerson` comme aujourd'hui (miroir selon le sens, geste conservé).

- [ ] **Step 1: Write the failing tests**

```ts
// ajouts à tests/core/library/city-shops-customers.test.ts
it('un client entre de dos par la porte du local, puis marche dans la vitrine jusqu’à sa place', () => {
  // Construire les visites d'une rue de 720 px (shopSlotsFor, frames, graine 2), prendre la première visite, balayer
  // t sur un cycle (pas 0,1 s) : la suite des étapes doit être in → enter → inside → exit → out, l'étape enter finir
  // avec passage.depth > 0.9 et passage.yaw === YAW_BACK, la première image inside avoir inner.x au bord de la vitrine
  // côté porte, et une image inside plus tard avoir inner.x ≈ seat.x − window.x.
});
it('aucun champ fade dans l’état d’une visite', () => {
  // visitAt(...) pour quelques t : expect(state).not.toHaveProperty('fade')
});
it('changement de minute pendant une visite : le client reste (verrou)', () => {
  // placeCustomers avec gates = 1 à t0 (début du tour), puis gates = 0 à t0 + 10 : data-active reste 'true'.
});
```

Écrire ces tests en entier en suivant les helpers déjà présents dans `tests/core/library/city-shops-customers.test.ts` (lire le fichier : il construit déjà des fenêtres et des visites).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/library/city-shops-customers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** (moteur `visitAt` à étapes, `customerState`, `placeCustomers` avec verrou et trois nœuds, `ShopCustomers` sans `fade`/`style` de transition, `visitsFor` appelé avec `doors.map((d) => d.x + DOOR_WIDTH / 2)` et `width` dans `city-life.tsx`).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/library/city-shops-customers.test.ts tests/content/city-life.test.tsx tests/content/city-life-ghibli.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(bibliotheque): clients en pantin, entrée par la porte du local et marche jusqu'à leur place"
```

---

### Task 10: File de la boîte de nuit

**Files:**
- Modify: `src/content/shop-queue.tsx`
- Test: `tests/content/shop-queue.test.tsx` (existant si présent ; sinon le créer sur le modèle de `tests/content/city-life.test.tsx`)

**Interfaces:**
- Consumes: `GhibliFigure`, `poseFigure`, `useFigureRegistry` ; `phaseIndexOf`, `facingYaw`, `YAW_BACK`.
- Produces: rendu Ghibli des membres et de la personne qui entre ; plus d'opacité de fondu.

Règles :
- Membres : tournés vers la porte (`facingYaw(-away)`), pose `stand` ; quand un membre avance d'un cran (sa position `m.pos` diminue d'une image à l'autre), pose `walk` avec phase tirée de la distance.
- Le membre qui arrive (aujourd'hui `m.opacity < 1`) : opacité 1 et position `slotX(m.pos + (1 − m.opacity) · 4)` : il arrive en marchant depuis plus loin sur le trottoir.
- La personne qui entre (`ghost`, `p` de 0 à 1) : jusqu'à `p = 0.5` elle marche vers la porte (x de `slotX(0)` à `doorX`, profil) ; de 0,5 à 1 elle passe le seuil de dos dans un `<svg>` imbriqué posé sur `frame.door` (ombre et figure comme à la tâche 8, `depth = 2·(p − 0.5)`). Classique : même trajet avec `PersonSprite` de profil.
- Vigiles : inchangés (G3b).

- [ ] **Step 1: Write the failing test** : rendre `NightclubDoor` ouverte (voir les tests existants du dépôt qui la montent : `grep -rn "NightclubDoor" tests`), vérifier qu'aucun `[data-queue-id]` n'a d'`opacity` < 1, qu'en Ghibli chaque membre contient `[data-figure]`, et que le nœud d'entrée est dans un `svg[data-club-door]` quand `ghost.p > 0.5` (horloge figée).

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/content/shop-queue.test.tsx tests/core/library/city-shops-queue.test.ts`
Expected: PASS (adapter les attentes d'opacité de l'ancien comportement s'il y en a, en le disant dans le commit).

- [ ] **Step 5: Commit**

```bash
git add src/content/shop-queue.tsx tests
git commit -m "feat(bibliotheque): file de la boîte en pantin, arrivées et entrées à pied"
```

---

### Task 11: Banc, mesures, captures et auto-validation

**Files:**
- Modifier (non versionné) : `.superpowers/harness-ville/main.tsx`, `.superpowers/harness-ville/vite.config.ts` du worktree

- [ ] **Step 1: Banc** — Le banc copié du dépôt principal (G1) lit `art` dans l'URL ; vérifier qu'il enveloppe la scène dans un `FigureContext.Provider` avec `<FigureDefs>` dans ses `<defs>` (sinon l'ajouter, comme dans `RoomView`). Port `5217` dans `vite.config.ts`. Lancer `npx vite --config .superpowers/harness-ville/vite.config.ts` en arrière-plan.
- [ ] **Step 2: Mesures** — Chrome sans interface (CDP, modèle `.superpowers/harness-ville/cap.mjs`), `index.html?art=ghibli&h=12&w=3456` puis `art=classic`, `Emulation.setCPUThrottlingRate { rate: 4 }`, 5 s de mesure de l'intervalle moyen entre deux `requestAnimationFrame`, nombre de symboles (`document.querySelectorAll('[data-figure-defs] > g > g').length`), taille du DOM. Si Ghibli > classique + 5 ms : réduire `seg` des capsules à 5, `N` de la tête à 18, plafond 600, remesurer.
- [ ] **Step 3: Captures** dans `C:\Users\maxim\Downloads\Wikimasters tools\.superpowers\captures-ghibli-g3a\` : Ghibli 1080 et 3456 px à 8 h (habitants), 12 h, 19 h, 23 h, pluie (parapluies) ; classique 12 h ; zooms ×3 : une porte d'immeuble pendant un seuil, un client assis, la file de la boîte (23 h 30, samedi), un passant de face pendant un demi-tour. Regarder chaque capture et corriger tout défaut visible (pantin coupé, mauvais sens, pieds qui glissent, figure sans couleur, trait illisible) avec un test quand le code change. Recommencer jusqu'à des captures propres.

---

### Task 12: Livraison

- [ ] **Step 1:** `npm test && npm run typecheck && npm run build` (seul l'échec connu « nacelle » est toléré).
- [ ] **Step 2:** `git push -u origin feat/bibliotheque-ghibli-g3a`, `gh pr create` (titre « Bibliothèque Ghibli G3a : pantin 3D et vie ordinaire de la rue », corps : résumé, mesures, captures, limites, `🤖 Generated with [Claude Code](https://claude.com/claude-code)`), `gh pr merge --merge --delete-branch`.
- [ ] **Step 3:** pré-prod depuis le dépôt principal sur `main` à jour et propre : `npm run preprod`, puis `npm run build`.
- [ ] **Step 4:** mémoire `project_ghibli.md` + ligne de `MEMORY.md` (G3a fusionnée, n° de PR, pré-prod, mesures, reste G3b/G3c).
