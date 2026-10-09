# Bibliothèque 8c — ombres des animaux Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat, chien et robot projettent une ombre mobile (soleil + lampes) sur le sol, les supports et les meubles, recalculée plus vite tant qu'un animal bouge.

**Architecture:** Un module pur `pet-boxes.ts` transforme une image d'animal (`PetFrame`) en boîtes occultantes (`Box`). `buildLightMap` reçoit ces boîtes en entrée optionnelle `pets` et applique un passage « animaux » qui atténue par multiplication la part de soleil et le champ des lampes déjà mémorisés pour les meubles (les champs des meubles ne sont jamais invalidés par un animal). `LightLayer` lit les boîtes via un accesseur à chaque repeinture, et passe de 4 Hz à ~12 Hz tant que la signature des animaux change.

**Tech Stack:** TypeScript, React 18, vitest (`npx vitest run`, `--maxWorkers=4` si un test de glisser est instable), jsdom, SVG + canvas basse résolution.

**Spec:** `docs/superpowers/specs/2026-10-09-bibliotheque-ombres-animaux-design.md`

## Global Constraints

- Sans animal (ou liste vide), la carte de lumière est **identique bit à bit** à celle de 8b (test de régression obligatoire).
- Les champs mémorisés des meubles (`surfaceOf`, `sunReachField`, `lampLightOf` dans `light-map.ts`) ne reçoivent JAMAIS les boîtes d'animaux, et ne sont jamais modifiés en place (copie ou tableau séparé).
- Au plus 3 animaux par pièce ; aucun rendu React par image ; la position reste posée en attribut `transform` par `usePetSim`.
- Pas de réglage nouveau : l'ampoule existante (`wmt:library-light`) coupe aussi les ombres des animaux (le calque disparaît).
- Mouvement réduit : pas d'intervalle rapide ; un contrôle à 1 s des animaux, repeinture seulement si leur signature a changé.
- Textes de l'interface en français, glyphes plutôt que du texte ; fiche WikiHow mise à jour dans la même PR (nouvel id `bibliotheque-v17`).
- Commentaires en français, même densité que le code voisin ; commits terminés par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Travail dans le worktree hors dépôt `..\Wikimasters-bibliotheque` (jonction `node_modules`, `.env.local` à copier puis supprimer), branche `feat/bibliotheque-ombres-animaux` (la spec y est déjà commitée).

## Décisions de conception (écarts avec la spec, à reporter dans la spec en Task 7)

- **Ordre du calque** : `RoomView` dessine le calque de lumière APRÈS les animaux (`middle`, `topPets`) et avant les bulles. Les sprites sont donc déjà éclairés/assombris comme les meubles ; on ne déplace rien. L'ombre au sol qu'un animal projette tombe devant ou à côté de lui à l'écran, elle n'assombrit donc pas son propre sprite de façon visible. La phrase de la spec sur un masque de silhouette est supprimée.
- **Hauteur d'un animal** : `PetFrame` gagne `on` (support à cet instant). Animal sur un bureau/étagère (`top`) : `z0` = hauteur du dessus du support, profondeur = milieu du support (comme un petit objet). Animal au sol : profondeur dérivée de `depthY` (ordonnée des pieds) ; levée = `max(0, depthY − pos.y)` (vaut ~26 pour le chat couché sur un robot, ~0 en saut car `depthY` = `pos.y` dans ce cas). Pendant un saut, l'ombre suit donc la position à l'écran sans hauteur dédiée (simplification assumée).
- **Approximations du passage animaux** : (a) soleil : transmission = max, sur les fenêtres dont la projection contient le pixel, de la part non occultée par les animaux seuls (exact pour une seule fenêtre) ; (b) lampes : transmission = moyenne des transmissions par lampe pondérée par l'éclairement (exact quand les meubles ne gênent pas). Aucun ne s'applique au mur du fond.
- **Mouvement réduit** : contrôle toutes les secondes (au lieu d'un recalcul à la minute).

## File Structure

| Fichier | Rôle |
|---|---|
| `src/core/library/light/pet-boxes.ts` (créer) | `petBoxesOf(frames, layout, geom)` : image d'animal → `Box[]` (espèce × pose, miroir selon `facing`, support) |
| `src/core/library/light/pet-shade.ts` (créer) | `sunPetTransmission`, `lampPetTransmission` : facteurs 0..1 par pixel dus aux seuls animaux |
| `src/core/library/light/occluders.ts` (modifier) | exporter `kOf`, `hostOf`, type `Host` |
| `src/core/library/light/lamps.ts` (modifier) | extraire `irradianceAt` (partagé par `lampField` et `lampPetTransmission`) |
| `src/core/library/light/light-map.ts` (modifier) | entrée `pets?`, voie « exacte » dès qu'il y a meubles OU animaux, multiplication par les transmissions |
| `src/core/library/light/index.ts` (modifier) | exports |
| `src/core/library/pets/runner.ts` (modifier) | `PetFrame.on` |
| `src/content/pet-sim.ts` (modifier) | `usePetSim` expose `frames()` (accesseur stable) |
| `src/content/light-layer.tsx` (modifier) | prop `getPetBoxes`, cadence 12 Hz / 4 Hz, signature quantifiée |
| `src/content/RoomView.tsx`, `src/content/LibraryPanel.tsx` (modifier) | câblage |
| `src/core/whats-new/entries.ts` (modifier) | fiche `bibliotheque-v17` |
| `tests/core/library/light-pet-boxes.test.ts`, `light-pet-shade.test.ts` (créer) ; `light-map.test.ts`, `light-lamps.test.ts`, `pets-runner.test.ts`, `tests/content/library-light.test.tsx`, `tests/core/whats-new/entries.test.ts` (étendre) | tests |

---

### Task 1: Exposer `kOf`, `hostOf` et `PetFrame.on`

**Files:**
- Modify: `src/core/library/light/occluders.ts` (lignes `kOf`, `type Host`, `hostOf`)
- Modify: `src/core/library/pets/runner.ts:11` et `:185`
- Test: `tests/core/library/pets-runner.test.ts`

**Interfaces:**
- Produces: `kOf(g: Geom): number` ; `type Host = { kind: 'desk' | 'shelf'; r: PxRect; dFront: number; D: number }` ; `hostOf(layout: Layout, id: string, g: Geom): Host | null` (tous exportés depuis `occluders.ts`) ; `PetFrame.on: string | null`.

- [ ] **Step 1: Écrire le test qui échoue** — ajouter dans `tests/core/library/pets-runner.test.ts`, dans le `describe` principal, en réutilisant les helpers déjà utilisés par le test ligne 25 (`room`, `runner`) :

```ts
  it('expose le support de l’animal dans l’image (null au sol)', () => {
    const [frame] = runner.step(room, 1000);
    expect(frame).toHaveProperty('on');
    expect(frame!.on === null || typeof frame!.on === 'string').toBe(true);
  });
```

- [ ] **Step 2: Lancer** `npx vitest run tests/core/library/pets-runner.test.ts` — attendu : ce test échoue (`toHaveProperty('on')`).

- [ ] **Step 3: Implémenter**
  - `runner.ts:11` : dans `PetFrame`, ajouter `on: string | null;` après `top: boolean;`.
  - `runner.ts:185` : dans l'objet retourné, ajouter `on: state.on,` après `top: isTop(room, state.on),`.
  - `occluders.ts` : changer `const kOf` en `export const kOf`, `type Host` en `export type Host`, `function hostOf` en `export function hostOf`.

- [ ] **Step 4: Lancer** `npx vitest run tests/core/library --maxWorkers=4` puis `npx tsc --noEmit` — attendu : tout passe. Si un test existant compare une image entière avec `toEqual`, ajouter `on` à l'attendu.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/light/occluders.ts src/core/library/pets/runner.ts tests/core/library/pets-runner.test.ts
git commit -m "refactor(lumiere): kOf et hostOf exportés, PetFrame.on (support de l'animal)"
```

---

### Task 2: Boîtes occultantes des animaux (`pet-boxes.ts`)

**Files:**
- Create: `src/core/library/light/pet-boxes.ts`
- Modify: `src/core/library/light/index.ts` (ajouter `export * from './pet-boxes';`)
- Test: `tests/core/library/light-pet-boxes.test.ts`

**Interfaces:**
- Consumes: `kOf`, `hostOf`, `Box`, `Geom` (Task 1) ; `PetFrame`, `Pose` de `../pets/runner`.
- Produces: `petBoxesOf(frames: readonly PetFrame[], layout: Layout, geom: Geom): Box[]` ; `shapeOf(pose: Pose): 'stand' | 'sit' | 'lie' | 'none'`.

Repère local d'un animal : origine = pieds au centre, `+x` = avant (sens du regard, vers la droite à l'écran quand `facing === 'r'`), `z` = hauteur depuis les pieds, profondeur = demi-épaisseur `hd` autour du centre. Chaque pièce = `[x0, x1, z0, z1, hd]`.

- [ ] **Step 1: Écrire les tests** `tests/core/library/light-pet-boxes.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { petBoxesOf, shapeOf } from '../../../src/core/library/light/pet-boxes';
import type { Layout } from '../../../src/core/library/library-types';
import type { PetFrame } from '../../../src/core/library/pets/runner';

const geom = { wallH: 340, floorH: 170 };
const frame = (over: Partial<PetFrame> = {}): PetFrame => ({
  id: 'p1', species: 'cat', coat: 'orange', name: 'Minou', pose: 'walk', facing: 'r', behind: 0, top: false,
  on: null, pos: { x: 300, y: 425 }, depthY: 425, ...over,
});
const height = (bs: { z1: number }[]): number => Math.max(...bs.map((b) => b.z1));
const span = (bs: { x0: number; x1: number }[]): [number, number] => [Math.min(...bs.map((b) => b.x0)), Math.max(...bs.map((b) => b.x1))];

describe('shapeOf', () => {
  it('range les poses par silhouette', () => {
    expect(shapeOf('walk')).toBe('stand');
    expect(shapeOf('sit')).toBe('sit');
    expect(shapeOf('sleep')).toBe('lie');
    expect(shapeOf('hide')).toBe('none');
  });
});

describe('petBoxesOf', () => {
  it('donne des boîtes au nom de l’animal, posées sur le sol à la profondeur de ses pieds', () => {
    const boxes = petBoxesOf([frame()], [], geom);
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    expect(boxes.every((b) => b.owner === 'p1' && b.z0 >= 0)).toBe(true);
    // depthY 425 → d = (425 − 340) / (170 / 680) = 340
    for (const b of boxes) {
      expect(b.d0).toBeGreaterThan(300);
      expect(b.d1).toBeLessThan(380);
    }
  });
  it('« cachée » ne donne rien', () => {
    expect(petBoxesOf([frame({ pose: 'hide' })], [], geom)).toEqual([]);
  });
  it('couché est plus bas qu’assis, qui est plus bas que debout (chat)', () => {
    const stand = height(petBoxesOf([frame({ pose: 'walk' })], [], geom));
    const sit = height(petBoxesOf([frame({ pose: 'sit' })], [], geom));
    const lie = height(petBoxesOf([frame({ pose: 'sleep' })], [], geom));
    expect(lie).toBeLessThan(sit);
    expect(sit).toBeLessThan(stand);
  });
  it('le chat et le chien ont une queue (boîte fine à l’arrière), le robot non', () => {
    const tailBack = (species: PetFrame['species']): number => {
      const boxes = petBoxesOf([frame({ species, pose: 'walk' })], [], geom);
      const [min] = span(boxes);
      return 300 - min; // débord vers l'arrière
    };
    expect(tailBack('cat')).toBeGreaterThan(20);
    expect(tailBack('dog')).toBeGreaterThan(20);
    expect(tailBack('robot')).toBeLessThanOrEqual(14);
  });
  it('le robot est plus bas que le chat debout avec la tête, sans queue ni tête', () => {
    const robot = petBoxesOf([frame({ species: 'robot', pose: 'standby' })], [], geom);
    expect(height(robot)).toBeGreaterThanOrEqual(26); // le dos porte le chat (RIDE_LIFT = 26)
    const [a, b] = span(robot);
    expect(b - a).toBeGreaterThan(height(robot)); // large plutôt que haut
  });
  it('se retourne avec le sens du regard', () => {
    const r = span(petBoxesOf([frame({ facing: 'r' })], [], geom));
    const l = span(petBoxesOf([frame({ facing: 'l' })], [], geom));
    expect(300 - l[0]).toBeCloseTo(r[1] - 300, 5);
    expect(300 - l[1]).toBeCloseTo(r[0] - 300, 5);
  });
  it('un animal levé (dos du robot) monte de la différence depthY − pos.y', () => {
    const ground = petBoxesOf([frame({ pose: 'sleep' })], [], geom);
    const ridden = petBoxesOf([frame({ pose: 'sleep', pos: { x: 300, y: 399 }, depthY: 425.1 })], [], geom);
    expect(Math.min(...ridden.map((b) => b.z0)) - Math.min(...ground.map((b) => b.z0))).toBeCloseTo(26.1, 1);
    expect(ridden[0]!.d1).toBeCloseTo(ground[0]!.d1, 0);
  });
  it('perché sur un bureau : posé sur le plateau, au milieu du bureau', () => {
    const layout: Layout = [{ id: 'd', kind: 'desk', col: 2, row: 11 }];
    const deskH = (510 / 18) * 4;
    const boxes = petBoxesOf([frame({ top: true, on: 'd', pose: 'sit', pos: { x: 100, y: 400 }, depthY: 400 })], layout, geom);
    expect(Math.min(...boxes.map((b) => b.z0))).toBeCloseTo(deskH, 1);
  });
  it('un support introuvable retombe au sol', () => {
    const boxes = petBoxesOf([frame({ top: true, on: 'absent' })], [], geom);
    expect(Math.min(...boxes.map((b) => b.z0))).toBe(0);
  });
});
```

- [ ] **Step 2: Lancer** `npx vitest run tests/core/library/light-pet-boxes.test.ts` — attendu : échec (module absent).

- [ ] **Step 3: Implémenter** `src/core/library/light/pet-boxes.ts` :

```ts
import type { Layout, Species } from '../library-types';
import type { PetFrame, Pose } from '../pets/runner';
import { hostOf, kOf, type Box, type Geom } from './occluders';

export type Shape = 'stand' | 'sit' | 'lie' | 'none';

// Silhouette de chaque pose. « cachée » = dans le panier ou la niche, qui sont déjà des meubles.
const SHAPE: Record<Pose, Shape> = {
  walk: 'stand', jump: 'stand', greet: 'stand', play: 'stand', sniff: 'stand', eat: 'stand', hiss: 'stand', scan: 'stand', beep: 'stand',
  sit: 'sit', groom: 'sit', yawn: 'sit', scratch: 'sit', purr: 'sit', pant: 'sit',
  sleep: 'lie', stretch: 'lie', cower: 'lie', standby: 'lie', charge: 'lie',
  hide: 'none',
};
export const shapeOf = (pose: Pose): Shape => SHAPE[pose];

// [x0, x1, z0, z1, demi-profondeur], en px depuis les pieds au centre ; +x = avant (sens du regard).
type Part = readonly [x0: number, x1: number, z0: number, z1: number, hd: number];
type Parts = Record<Exclude<Shape, 'none'>, readonly Part[]>;

const CAT: Parts = {
  stand: [[-16, 16, 6, 24, 9], [14, 26, 14, 34, 7], [-24, -15, 10, 36, 3]],
  sit: [[-9, 9, 0, 22, 9], [-2, 10, 20, 34, 8], [-16, -9, 0, 6, 3]],
  lie: [[-17, 15, 0, 12, 9], [12, 22, 0, 10, 7], [-26, -17, 0, 4, 3]],
};
const DOG: Parts = {
  stand: [[-19, 19, 8, 26, 11], [17, 30, 16, 36, 7], [-27, -19, 18, 32, 3]],
  sit: [[-13, 6, 0, 26, 10], [0, 12, 24, 38, 7], [-22, -13, 0, 8, 3]],
  lie: [[-20, 18, 0, 13, 10], [16, 28, 0, 11, 7], [-28, -20, 0, 4, 3]],
};
// Robot : châssis large et bas (le dos reste à 26 px, le chat s'y couche), antenne très fine ; ni tête ni queue.
const ROBOT_PARTS: readonly Part[] = [[-14, 14, 0, 26, 11], [-1, 1, 26, 40, 1]];
const ROBOT: Parts = { stand: ROBOT_PARTS, sit: ROBOT_PARTS, lie: ROBOT_PARTS };
const PARTS: Record<Species, Parts> = { cat: CAT, dog: DOG, robot: ROBOT };

// Profondeur du bord des pieds → d (même inversion que le bas du rectangle écran d'un meuble).
const dOf = (y: number, g: Geom): number => Math.max(0, (y - g.wallH) / kOf(g));

export function petBoxesOf(frames: readonly PetFrame[], layout: Layout, geom: Geom): Box[] {
  const out: Box[] = [];
  for (const f of frames) {
    const shape = shapeOf(f.pose);
    if (shape === 'none') continue;
    // Sur un bureau ou une étagère : posé sur le dessus, au milieu du support. Sinon au sol, levé de depthY − pos.y.
    const host = f.top && f.on ? hostOf(layout, f.on, geom) : null;
    const dC = host ? host.dFront - 0.5 * host.D : dOf(f.depthY, geom);
    const lift = host ? host.r.h : Math.max(0, f.depthY - f.pos.y);
    const sign = f.facing === 'r' ? 1 : -1;
    for (const [x0, x1, z0, z1, hd] of PARTS[f.species][shape]) {
      const a = f.pos.x + sign * x0;
      const b = f.pos.x + sign * x1;
      out.push({
        owner: f.id,
        x0: Math.min(a, b), x1: Math.max(a, b),
        d0: Math.max(0, dC - hd), d1: dC + hd,
        z0: lift + z0, z1: lift + z1,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Lancer** `npx vitest run tests/core/library/light-pet-boxes.test.ts` — attendu : tout passe. (Si « robot ... tailBack ≤ 14 » ou « large plutôt que haut » échoue, vérifier les valeurs de `ROBOT_PARTS`, pas les assertions : le châssis fait 28 de large pour 26 de haut sans l'antenne ; l'assertion `b − a > height` compare 28 à 40 — **à corriger dans le test** en `expect(b - a).toBeGreaterThan(26)` si la hauteur d'antenne la fausse.)

- [ ] **Step 5: Commit**

```bash
git add src/core/library/light/pet-boxes.ts src/core/library/light/index.ts tests/core/library/light-pet-boxes.test.ts
git commit -m "feat(lumiere): boîtes occultantes des animaux par espèce et par pose"
```

---

### Task 3: Transmission due aux animaux (`pet-shade.ts`) et factorisation de `lamps.ts`

**Files:**
- Modify: `src/core/library/light/lamps.ts`
- Create: `src/core/library/light/pet-shade.ts`
- Modify: `src/core/library/light/index.ts` (`export * from './pet-shade';`)
- Test: `tests/core/library/light-pet-shade.test.ts` ; non-régression : `tests/core/library/light-lamps.test.ts`

**Interfaces:**
- Consumes: `litFraction`, `sunReaches`, `V3` (shadow.ts) ; `SurfaceMap`, `SURF` ; `Glass`, `LampSource`, `Box`.
- Produces:
  - `irradianceAt(s: LampSource, surf: SurfaceMap, i: number, j: number, scale: number, P: V3): number` (dans `lamps.ts` ; écrit le point éclairé dans `P` ; renvoie l'éclairement avant occultation, 0 si hors portée ou dos tourné).
  - `lampPetTransmission(sources: readonly LampSource[], pets: readonly Box[], surf: SurfaceMap, lamp: Float32Array, scale?: number): Float32Array` : valeur 0..1 par pixel (1 = aucune gêne), moyenne des transmissions de chaque lampe pondérée par l'éclairement ; 1 là où `lamp[n] ≤ 0` et sur le mur du fond.
  - `sunPetTransmission(glasses: readonly SunGlassLike[], pets: readonly Box[], surf: SurfaceMap, sun: Float64Array, tanElev: number, scale?: number): Float32Array` avec `SunGlassLike = { g: Glass & { zBottom: number; zTop: number }; slope: number }` ; 1 là où `sun[n] ≤ 0`, hors sol/dessus.

- [ ] **Step 1: Écrire les tests** `tests/core/library/light-pet-shade.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { lampField } from '../../../src/core/library/light/lamps';
import { lampPetTransmission, sunPetTransmission } from '../../../src/core/library/light/pet-shade';
import { SURF, buildSurfaceMap } from '../../../src/core/library/light/surfaces';
import type { Box, LampSource } from '../../../src/core/library/light/occluders';

const GEOM = { wallH: 200, floorH: 310 };
const SCALE = 6;
const surf = buildSurfaceMap([], 600, 510, GEOM, SCALE);
const lamp: LampSource = { id: 'l', x: 300, d: 100, z: 60, box: 'l' };
const pixelAt = (x: number, d: number): number => {
  let best = -1; let bd = Infinity;
  for (let n = 0; n < surf.w * surf.h; n++) {
    if (surf.kind[n] !== SURF.ground) continue;
    const e = Math.abs(((n % surf.w) + 0.5) * SCALE - x) + Math.abs((surf.d[n] ?? 0) - d);
    if (e < bd) { bd = e; best = n; }
  }
  return best;
};
// Un animal entre la lampe et un point du sol, sur le segment.
const between: Box = { owner: 'p1', x0: 300, x1: 330, d0: 190, d1: 230, z0: 0, z1: 40 };

describe('lampPetTransmission', () => {
  it('vaut 1 partout sans animal', () => {
    const field = lampField([lamp], [], surf, SCALE);
    const t = lampPetTransmission([lamp], [], surf, field, SCALE);
    expect(Array.from(t).every((v) => v === 1)).toBe(true);
  });
  it('assombrit l’arrière d’un animal vu de la lampe, pas le côté', () => {
    const field = lampField([lamp], [], surf, SCALE);
    const t = lampPetTransmission([lamp], [between], surf, field, SCALE);
    const behind = pixelAt(315, 290);
    const side = pixelAt(150, 290);
    expect(field[behind]!).toBeGreaterThan(0);
    expect(t[behind]!).toBeLessThan(1);
    expect(t[side]!).toBe(1);
  });
  it('ne touche pas les pixels sans lueur', () => {
    const field = new Float32Array(surf.w * surf.h);
    const t = lampPetTransmission([lamp], [between], surf, field, SCALE);
    expect(Array.from(t).every((v) => v === 1)).toBe(true);
  });
});

describe('sunPetTransmission', () => {
  const glass = { x: 280, y: 40, w: 60, h: 80, zBottom: 80, zTop: 160 };
  const tanElev = Math.tan(0.7);
  it('vaut 1 hors des pixels éclairés et sans animal', () => {
    const sun = new Float64Array(surf.w * surf.h);
    expect(Array.from(sunPetTransmission([{ g: glass, slope: 0 }], [between], surf, sun, tanElev, SCALE)).every((v) => v === 1)).toBe(true);
  });
  it('ombre un pixel éclairé placé juste derrière l’animal le long du rayon', () => {
    const sun = new Float64Array(surf.w * surf.h).fill(1);
    // animal haut en x 300..330 ; son ombre tombe vers l'avant (d plus grand)
    const tall: Box = { owner: 'p1', x0: 300, x1: 330, d0: 100, d1: 130, z0: 0, z1: 40 };
    const t = sunPetTransmission([{ g: glass, slope: 0 }], [tall], surf, sun, tanElev, SCALE);
    const shadowed = pixelAt(315, 130 + 40 / tanElev * 0.5);
    const free = pixelAt(150, 200);
    expect(t[shadowed]!).toBeLessThan(1);
    expect(t[free]!).toBe(1);
  });
});
```

- [ ] **Step 2: Lancer** — attendu : échec (modules absents).

- [ ] **Step 3: Refactorer `lamps.ts`** : remplacer le corps de la boucle intérieure de `lampField` par un appel à `irradianceAt`. Ajouter avant `lampField` :

```ts
// Éclairement d'une surface (pixel i, j) par une lampe, avant occultation ; 0 hors portée, de dos, ou sur le mur du fond
// quand `skipWall` est vrai. Écrit dans `P` le point éclairé (dessus et face avant décalés de 0,5).
export function irradianceAt(s: LampSource, surf: SurfaceMap, i: number, j: number, scale: number, P: V3): number {
  const n = j * surf.w + i;
  const kind = surf.kind[n] ?? SURF.ground;
  const x = (i + 0.5) * scale;
  let d = surf.d[n] ?? 0;
  let z = surf.z[n] ?? 0;
  // Normale : sol/dessus vers le haut (+z), mur/face avant vers le spectateur (+d).
  const vertical = kind === SURF.wall || kind === SURF.front;
  if (kind === SURF.top) z += 0.5;
  else if (kind === SURF.front) d += 0.5;
  const vx = s.x - x;
  const vd = s.d - d;
  const vz = s.z - z;
  const r2 = vx * vx + vd * vd + vz * vz;
  if (r2 >= LAMP_RMAX * LAMP_RMAX) return 0;
  const r = Math.sqrt(r2);
  if (r === 0) return 0;
  const irr = lampIrradiance(r, (vertical ? vd : vz) / r);
  if (irr <= 0) return 0;
  P.x = x;
  P.d = d;
  P.z = z;
  return irr;
}
```

et dans `lampField` la boucle devient :

```ts
    for (let j = 0; j < surf.h; j++) {
      for (let i = i0; i <= i1; i++) {
        const irr = irradianceAt(s, surf, i, j, scale, P);
        if (irr <= 0) continue;
        const n = j * surf.w + i;
        out[n] = (out[n] ?? 0) + irr * litFraction(P, s, LAMP_SPREAD, gene);
      }
    }
```

(les imports `SURF`, `V3`, `SurfaceMap` y sont déjà.) Lancer `npx vitest run tests/core/library/light-lamps.test.ts tests/core/library/light-map.test.ts` — attendu : inchangés (c'est la non-régression de la factorisation).

- [ ] **Step 4: Implémenter `pet-shade.ts`** :

```ts
import type { Glass } from './beam';
import { LAMP_RMAX, irradianceAt } from './lamps';
import type { Box, LampSource } from './occluders';
import { litFraction, sunReaches, type V3 } from './shadow';
import { SURF, type SurfaceMap } from './surfaces';

const DEFAULT_SCALE = 6; // = LIGHT_SCALE (light-map.ts), redéfini pour éviter un import circulaire
const LAMP_SPREAD = 6;

export type SunGlassLike = { g: Glass & { zBottom: number; zTop: number }; slope: number };

// Part (0..1) de la lumière des lampes qui reste après les animaux : moyenne des transmissions de chaque lampe,
// pondérée par l'éclairement. 1 partout où la carte des lampes est nulle, et sur le mur du fond.
export function lampPetTransmission(
  sources: readonly LampSource[],
  pets: readonly Box[],
  surf: SurfaceMap,
  lamp: Float32Array,
  scale: number = DEFAULT_SCALE,
): Float32Array {
  const out = new Float32Array(surf.w * surf.h).fill(1);
  if (sources.length === 0 || pets.length === 0) return out;
  const num = new Float32Array(surf.w * surf.h);
  const den = new Float32Array(surf.w * surf.h);
  const P: V3 = { x: 0, d: 0, z: 0 };
  for (const s of sources) {
    const gene = pets.filter((b) => b.x1 > s.x - LAMP_RMAX && b.x0 < s.x + LAMP_RMAX);
    if (gene.length === 0) continue;
    const i0 = Math.max(0, Math.floor((s.x - LAMP_RMAX) / scale - 0.5));
    const i1 = Math.min(surf.w - 1, Math.ceil((s.x + LAMP_RMAX) / scale - 0.5));
    for (let j = 0; j < surf.h; j++) {
      for (let i = i0; i <= i1; i++) {
        const n = j * surf.w + i;
        if ((lamp[n] ?? 0) <= 0 || surf.kind[n] === SURF.wall) continue;
        const irr = irradianceAt(s, surf, i, j, scale, P);
        if (irr <= 0) continue;
        num[n] = (num[n] ?? 0) + irr * litFraction(P, s, LAMP_SPREAD, gene);
        den[n] = (den[n] ?? 0) + irr;
      }
    }
  }
  for (let n = 0; n < out.length; n++) if ((den[n] ?? 0) > 0) out[n] = (num[n] ?? 0) / den[n]!;
  return out;
}

// Part (0..1) du soleil qui reste après les animaux, aux seuls pixels de sol ou de dessus déjà éclairés (`sun` > 0) :
// pour chaque fenêtre dont la projection contient le pixel, part non occultée par les animaux ; on garde la meilleure.
export function sunPetTransmission(
  glasses: readonly SunGlassLike[],
  pets: readonly Box[],
  surf: SurfaceMap,
  sun: Float64Array,
  tanElev: number,
  scale: number = DEFAULT_SCALE,
): Float32Array {
  const out = new Float32Array(surf.w * surf.h).fill(1);
  if (glasses.length === 0 || pets.length === 0) return out;
  const P: V3 = { x: 0, d: 0, z: 0 };
  for (let j = 0; j < surf.h; j++) {
    for (let i = 0; i < surf.w; i++) {
      const n = j * surf.w + i;
      if ((sun[n] ?? 0) <= 0) continue;
      const kind = surf.kind[n]!;
      if (kind !== SURF.ground && kind !== SURF.top) continue;
      P.x = (i + 0.5) * scale;
      P.d = surf.d[n]!;
      P.z = kind === SURF.top ? surf.z[n]! + 0.5 : 0;
      let best = 0;
      let seen = false;
      for (const { g, slope } of glasses) {
        if (sunReaches(P, g, tanElev, slope, []) <= 0) continue;
        seen = true;
        best = Math.max(best, sunReaches(P, g, tanElev, slope, pets));
      }
      if (seen) out[n] = best;
    }
  }
  return out;
}
```

- [ ] **Step 5: Lancer** `npx vitest run tests/core/library/light-pet-shade.test.ts tests/core/library/light-lamps.test.ts` — attendu : tout passe. Si le pixel « derrière l'animal » du test lampe ne tombe pas dans l'ombre, ajuster la profondeur du pixel testé (l'animal est entre la lampe (d=100, z=60) et le sol à d≈290 : l'ombre est sur le segment, vérifier que `between` coupe réellement le segment lampe→pixel en 3D ; remonter `z1` à 60 si besoin), pas le moteur.

- [ ] **Step 6: Commit**

```bash
git add src/core/library/light/lamps.ts src/core/library/light/pet-shade.ts src/core/library/light/index.ts tests/core/library/light-pet-shade.test.ts
git commit -m "feat(lumiere): transmission du soleil et des lampes à travers les animaux"
```

---

### Task 4: `buildLightMap` prend les animaux

**Files:**
- Modify: `src/core/library/light/light-map.ts`
- Test: `tests/core/library/light-map.test.ts`

**Interfaces:**
- Consumes: `sunPetTransmission`, `lampPetTransmission` (Task 3).
- Produces: `LightInput.pets?: readonly Box[]`.

- [ ] **Step 1: Écrire les tests** — ajouter dans `light-map.test.ts` (réutiliser `base`, `at`, `Box`, `LampSource` déjà importés ; `buildLightMap` aussi) :

```ts
describe('buildLightMap avec des animaux', () => {
  const furniture: Box[] = [{ owner: 'f', x0: 400, x1: 440, d0: 40, d1: 70, z0: 0, z1: 20 }];
  const lamp: LampSource = { id: 'l', x: 300, d: 120, z: 60, box: 'l' };
  const wide = { ...base, sunFrac: 0.3, boxes: furniture, lamps: [lamp] };
  // Un animal sur la trajectoire du rayon, au sol, devant la fenêtre.
  const pet: Box[] = [{ owner: 'p1', x0: 110, x1: 150, d0: 40, d1: 70, z0: 0, z1: 36 }];

  it('est identique bit à bit sans animal, liste vide comprise', () => {
    const ref = buildLightMap(wide);
    expect(Array.from(buildLightMap({ ...wide, pets: [] }).rgba)).toEqual(Array.from(ref.rgba));
    expect(Array.from(buildLightMap({ ...wide, pets: undefined }).rgba)).toEqual(Array.from(ref.rgba));
  });
  it('ne change que des pixels : jamais ceux loin de l’animal et de son ombre', () => {
    const ref = buildLightMap(wide);
    const withPet = buildLightMap({ ...wide, pets: pet });
    expect(Array.from(withPet.rgba)).not.toEqual(Array.from(ref.rgba));
    // Le coin droit de la pièce, loin de la fenêtre et de l'animal, reste identique.
    expect(at(withPet, 580, 480)).toEqual(at(ref, 580, 480));
  });
  it('déplace l’ombre quand l’animal bouge', () => {
    const a = buildLightMap({ ...wide, pets: pet });
    const moved = pet.map((b) => ({ ...b, x0: b.x0 + 60, x1: b.x1 + 60 }));
    const b = buildLightMap({ ...wide, pets: moved });
    expect(Array.from(a.rgba)).not.toEqual(Array.from(b.rgba));
  });
  it('fonctionne sans meuble (animaux seuls) et avec une lampe seule', () => {
    const solo = buildLightMap({ ...base, sunFrac: 0.3, pets: pet });
    expect(solo.rgba.some((v) => v !== 0)).toBe(true);
    const lampOnly = buildLightMap({ ...base, sunFrac: null, sunX: null, lamps: [lamp], pets: pet });
    expect(Array.from(lampOnly.rgba)).not.toEqual(Array.from(buildLightMap({ ...base, sunFrac: null, sunX: null, lamps: [lamp] }).rgba));
  });
  it('assombrit derrière l’animal : l’alpha d’un pixel dans son ombre augmente', () => {
    const ref = buildLightMap({ ...wide, pets: undefined });
    const withPet = buildLightMap({ ...wide, pets: pet });
    let darker = 0;
    for (let y = 345; y < 510; y += LIGHT_SCALE) for (let x = 90; x < 200; x += LIGHT_SCALE) {
      if (at(withPet, x, y)[3]! > at(ref, x, y)[3]!) darker++;
    }
    expect(darker).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Lancer** — attendu : échec (`pets` ignoré → « not.toEqual » échoue).

- [ ] **Step 3: Implémenter** dans `light-map.ts` :
  - Importer `{ lampPetTransmission, sunPetTransmission } from './pet-shade'`.
  - `LightInput` : ajouter `// Animaux (occulteurs mobiles) : atténuent soleil et lampes sans toucher aux champs mémorisés des meubles.\n  pets?: readonly Box[];`
  - Dans `buildLightMap`, après `const lamps = …` : `const pets = input.pets ?? [];` et `const exact = boxes.length > 0 || pets.length > 0;`.
  - Remplacer `if (sunny && boxes.length === 0)` par `if (sunny && !exact)` ; `sunny && boxes.length > 0 && elev > MIN_ELEV` par `sunny && exact && elev > MIN_ELEV`.
  - Après `const sunField = …` ajouter :

```ts
  const petSun = sunField && pets.length > 0 ? sunPetTransmission(glasses, pets, surf, sunField, tanElev, LIGHT_SCALE) : null;
  const petLamp = pets.length > 0 && lamps.length > 0 ? lampPetTransmission(lamps, pets, surf, lampLight, LIGHT_SCALE) : null;
```

  - Dans la boucle : `const lampL = lampLight[n]! * (petLamp ? petLamp[n]! : 1);` et `if (boxes.length > 0) { if (sunField) b = gain * sunField[n]!; }` devient `if (exact) { if (sunField) b = gain * sunField[n]! * (petSun ? petSun[n]! : 1); }`.
  - Vérifier que `skyField`, `surfaceOf` (clé = meubles) et `lampLightOf` ne reçoivent pas `pets`.

- [ ] **Step 4: Lancer** `npx vitest run tests/core/library/light-map.test.ts tests/core/library/light-perf-golden.test.ts` puis `npx vitest run tests/core --maxWorkers=4` — attendu : tout passe (la non-régression sans animal est la garantie). `light-perf-golden` mesure le temps : noter si le temps sans animal a bougé.

- [ ] **Step 5: Mesure** — ajouter un test dans `light-map.test.ts` qui construit une pièce 96 colonnes (`width: 2880`), 3 meubles, 1 lampe, 3 animaux, et vérifie `performance.now()` d'un `buildLightMap` avec animaux < 60 ms après un appel à chaud ; si le seuil est dépassé sur la machine, relever la valeur réelle et la noter dans le message de commit plutôt que d'élargir sans comprendre.

- [ ] **Step 6: Commit**

```bash
git add src/core/library/light/light-map.ts tests/core/library/light-map.test.ts
git commit -m "feat(lumiere): la carte de lumière prend les ombres des animaux"
```

---

### Task 5: `LightLayer` : accesseur d'animaux et cadence

**Files:**
- Modify: `src/content/light-layer.tsx`
- Test: `tests/content/library-light.test.tsx`

**Interfaces:**
- Consumes: `LightInput.pets` (Task 4).
- Produces: prop `getPetBoxes?: () => readonly Box[]` de `LightLayer`.

- [ ] **Step 1: Écrire les tests** — dans `library-light.test.tsx`, nouveau `describe('LightLayer et animaux', …)` utilisant `mount` adapté (variante acceptant `getPetBoxes`) et `vi.advanceTimersByTime` (le fichier fait déjà `vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })`) :

```ts
describe('LightLayer et animaux', () => {
  const still = { read: () => targetOf('sun') };
  const mountPets = (toUrl: ReturnType<typeof vi.fn>, getPetBoxes: () => readonly Box[]) =>
    act(async () => {
      root.render(
        <svg viewBox="0 0 600 510">
          <LightLayer windows={windows} width={600} height={510} wallH={340} sky={sky} clock={still} toUrl={toUrl as never} getPetBoxes={getPetBoxes} />
        </svg>,
      );
    });
  const box = (x: number): Box => ({ owner: 'p1', x0: x, x1: x + 30, d0: 40, d1: 70, z0: 0, z1: 30 });

  it('repeint environ 12 fois par seconde tant que l’animal bouge', async () => {
    let x = 100;
    const toUrl = vi.fn(() => `data:image/png;base64,${x}`);
    await mountPets(toUrl, () => [box(x)]);
    const before = toUrl.mock.calls.length;
    for (let k = 0; k < 12; k++) {
      x += 10;
      await act(async () => { vi.advanceTimersByTime(84); });
    }
    expect(toUrl.mock.calls.length - before).toBeGreaterThanOrEqual(10);
  });
  it('ne repeint pas quand l’animal est immobile et que le ciel ne change pas', async () => {
    const toUrl = vi.fn(() => 'data:image/png;base64,AAAA');
    await mountPets(toUrl, () => [box(100)]);
    const before = toUrl.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(toUrl.mock.calls.length).toBe(before);
  });
  it('ignore un mouvement de moins de 2 px', async () => {
    let x = 100;
    const toUrl = vi.fn(() => 'data:image/png;base64,AAAA');
    await mountPets(toUrl, () => [box(x)]);
    const before = toUrl.mock.calls.length;
    x += 0.4;
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(toUrl.mock.calls.length).toBe(before);
  });
  it('en mouvement réduit : pas de cadence rapide, un contrôle à la seconde', async () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
    let x = 100;
    const toUrl = vi.fn(() => 'data:image/png;base64,AAAA');
    await mountPets(toUrl, () => [box(x)]);
    const before = toUrl.mock.calls.length;
    x += 50;
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(toUrl.mock.calls.length).toBe(before);
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(toUrl.mock.calls.length).toBe(before + 1);
  });
});
```

(importer `type Box` de `../../src/core/library/light/occluders` en tête du fichier.)

- [ ] **Step 2: Lancer** `npx vitest run tests/content/library-light.test.tsx` — attendu : échecs (prop inconnue / pas de cadence).

- [ ] **Step 3: Implémenter** dans `light-layer.tsx` :
  - Prop `getPetBoxes?: () => readonly Box[];` (avec un commentaire : « Boîtes des animaux, relues à chaque repeinture sans rendu React. »). Constante `FAST_MS = 83;`.
  - Fonction pure `petKey(boxes)` : `boxes.map((b) => [b.owner, b.x0, b.x1, b.d0, b.d1, b.z0, b.z1].map((v, i) => i === 0 ? v : Math.round((v as number) / 2)).join(',')).join(';')` (quantification à 2 px).
  - Dans l'effet, avant `const paint` : `let lastPetKey = ''; let lastSlow = 0;`. Dans `paint`, lire `const pets = getPetBoxes?.() ?? [];` et `const pk = petKey(pets);` ; ajouter `pk` à la table de la clé (`key = [..., signature, pk].join('|')`) ; passer `pets` aux deux formes de `LightInput` (la forme `noSky` aussi) ; `lastPetKey = pk;`.
  - Ajouter, à la place de l'unique `setInterval` :

```ts
    const petsMoved = (): boolean => (getPetBoxes ? petKey(getPetBoxes()) !== lastPetKey : false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      // Rapide (≈12 Hz) seulement quand un animal a bougé ; sinon le rythme habituel (4 Hz) du ciel.
      if (!petsMoved() && now - lastSlow < TICK_MS) return;
      lastSlow = now;
      paint();
    }, getPetBoxes ? FAST_MS : TICK_MS);
```

  - Branche mouvement réduit : au lieu de `return () => { draw.current = null; }` seul, si `getPetBoxes` : `const t = window.setInterval(() => { if (document.visibilityState !== 'hidden' && petsMoved()) paint(); }, 1000); return () => { window.clearInterval(t); draw.current = null; };`.
  - Ajouter `getPetBoxes` aux dépendances de l'effet.
  - Attention : `paint()` appelé au premier passage doit initialiser `lastSlow = Date.now()`.

- [ ] **Step 4: Lancer** `npx vitest run tests/content/library-light.test.tsx tests/content/library-light-ui.test.tsx` — attendu : tout passe, anciens tests inclus (sans `getPetBoxes`, le comportement est inchangé : intervalle 250 ms).

- [ ] **Step 5: Commit**

```bash
git add src/content/light-layer.tsx tests/content/library-light.test.tsx
git commit -m "feat(lumiere): le calque relit les animaux et repeint plus vite quand ils bougent"
```

---

### Task 6: Câblage `usePetSim` → `RoomView` → `LightLayer`

**Files:**
- Modify: `src/content/pet-sim.ts` (retour de `usePetSim`)
- Modify: `src/content/RoomView.tsx` (prop + `useCallback` + passage au calque)
- Modify: `src/content/LibraryPanel.tsx` (~ligne 1027, à côté de `pets={sim.views}`)
- Test: `tests/content/library-light-ui.test.tsx`

**Interfaces:**
- Consumes: `petBoxesOf` (Task 2), `LightLayer.getPetBoxes` (Task 5).
- Produces: `usePetSim(...)` retourne en plus `frames: () => readonly PetFrame[]` (identité stable) ; `RoomView` prop `petFrames?: () => readonly PetFrame[]`.

- [ ] **Step 1: Écrire le test** — dans `library-light-ui.test.tsx`, en suivant le montage déjà utilisé dans ce fichier pour une `RoomView` avec lumière : monter une pièce avec fenêtre + météo, une lampe, `light` actif, et `petFrames={() => [frame]}` avec un chat debout ; remplacer l'accesseur canvas si ce fichier le fait déjà (sinon espionner `HTMLCanvasElement` comme le test voisin). Vérifier : (a) sans `petFrames`, le calque se monte comme avant ; (b) avec `petFrames`, `LightLayer` reçoit `getPetBoxes` (observable en changeant la position retournée par l'accesseur et en avançant les timers de 100 ms : l'attribut `href` de `image[data-light]` change). Si le fichier mocke `toUrl`, utiliser le même mécanisme ; sinon tester `petBoxesOf` via un spy `vi.mock('../../src/core/library/light/pet-boxes')`.

- [ ] **Step 2: Lancer** — attendu : échec.

- [ ] **Step 3: Implémenter**
  - `pet-sim.ts` : dans `usePetSim`, `const frameList = useCallback((): readonly PetFrame[] => frames.current, []);` et retourner `{ views, attach, touch, frames: frameList }`.
  - `RoomView.tsx` : `import { petBoxesOf } from '../core/library/light/pet-boxes';` et `import type { PetFrame } from '../core/library/pets/runner';` (vérifier les imports déjà présents) ; dans `Props` : `// Images courantes des animaux (position à l'image), pour leurs ombres ; relues à chaque repeinture du calque.\n  petFrames?: () => readonly PetFrame[];` ; dans le composant, après `lightLamps` :

```ts
  const layoutRef = useRef(room.layout);
  layoutRef.current = room.layout;
  const getPetBoxes = useMemo(
    () => (petFrames ? () => petBoxesOf(petFrames(), layoutRef.current, lightGeom) : undefined),
    [petFrames, wallH], // eslint-disable-line react-hooks/exhaustive-deps
  );
```

    puis passer `getPetBoxes={getPetBoxes}` au `<LightLayer … />`. (`useRef`, `useMemo` sont déjà importés.) Les animaux ne doivent pas faire apparaître le calque : la condition de montage reste inchangée.
  - `LibraryPanel.tsx` : `petFrames={sim.frames}` à côté de `pets={sim.views}`.

- [ ] **Step 4: Lancer** `npx vitest run tests/content --maxWorkers=4` puis `npx tsc --noEmit` — attendu : tout passe.

- [ ] **Step 5: Commit**

```bash
git add src/content/pet-sim.ts src/content/RoomView.tsx src/content/LibraryPanel.tsx tests/content/library-light-ui.test.tsx
git commit -m "feat(lumiere): les ombres suivent les animaux de la pièce"
```

---

### Task 7: Fiche WikiHow, spec à jour, vérification, PR

**Files:**
- Modify: `src/core/whats-new/entries.ts` (nouvelle entrée après `bibliotheque-v15`, avant l'entrée suivante)
- Modify: `docs/superpowers/specs/2026-10-09-bibliotheque-ombres-animaux-design.md` (écarts du plan)
- Test: `tests/core/whats-new/entries.test.ts`

- [ ] **Step 1: Écrire le test** — dans `entries.test.ts`, sur le modèle du test de `bibliotheque-v11` :

```ts
  it('la fiche bibliotheque-v17 présente les ombres des animaux et leurs limites', () => {
    const entry = ENTRIES.find((e) => e.id === 'bibliotheque-v17');
    expect(entry).toBeDefined();
    const text = entry!.steps.map((s) => `${s.title} ${s.text} ${(s.details ?? []).map((d) => `${d.label} ${d.text}`).join(' ')}`).join(' ');
    for (const word of ['ombre', 'chat', 'chien', 'robot', 'Limites']) expect(text, word).toContain(word);
    expect(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v17')).toBeGreaterThan(ENTRIES.findIndex((e) => e.id === 'bibliotheque-v15'));
  });
```

- [ ] **Step 2: Lancer** — attendu : échec (entrée absente).

- [ ] **Step 3: Écrire la fiche** — entrée `{ id: 'bibliotheque-v17', theme: 'collection', glyph: '🐾', title: 'L’ombre des animaux', summary: 'Chat, chien et robot font de l’ombre au soleil comme aux lampes, et elle les suit', steps: [...] }`, 3 étapes au même format que `bibliotheque-v15` (champs `target`, `title`, `text`, `gesture`, `details` avec `label`/`text`, `scene: { page: '/collection', closeWindows: true, reveal: [...] }`) :
  1. cible `[data-wmt-library-entry]` : « Ouvrir une pièce avec un animal » — À quoi ça sert (donne vie à la pièce, l’ombre suit l’animal), Comment faire (une pièce avec une fenêtre ou une lampe allumée, et un animal adopté).
  2. cible `[data-wmt-library] [data-pet]` : « Regarder l’ombre bouger » — Comment ça marche (silhouette selon l’espèce et la pose : queue du chat et du chien, robot bas et large ; ombre aussi sur un bureau, sur une étagère ou sur le dos du robot ; chaque animal est repeint plus souvent tant qu’il bouge), D’où viennent les données (positions des animaux déjà calculées sur l’appareil, rien n’est envoyé).
  3. cible `[data-wmt-library] [data-light-toggle]` avec `reveal` `['[data-wmt-library-entry]', '[data-wmt-library] [data-action="edit"]']` : « Couper la lumière si l’appareil ralentit » — Limites : pas d’ombre sur l’animal lui-même ni sur le mur du fond ; silhouettes simplifiées (pas d’oreilles ni de pattes séparées) ; un animal caché dans un panier ou une niche ne fait pas d’ombre ; en mode animations réduites l’ombre n’est rafraîchie qu’à la seconde ; une ancienne version de l’extension ignore les ombres des animaux (rien n’est perdu).
  Les sélecteurs `data-wmt-*` doivent exister dans le code (test existant `entries.test.ts` qui les vérifie) : contrôler `data-pet` (attribut sans préfixe `wmt`, donc non vérifié) ; garder `[data-wmt-library]` comme préfixe.

- [ ] **Step 4: Mettre à jour la spec** — dans `docs/superpowers/specs/2026-10-09-bibliotheque-ombres-animaux-design.md` : remplacer la phrase sur l'ordre du calque (« Le calque doit rester **sous** les animaux … ») par la décision du plan (calque après les animaux, sprites éclairés comme les meubles, aucun déplacement), ajouter les approximations (a) et (b) du plan et la mention de `PetFrame.on` / levée `depthY − pos.y`, remplacer « un recalcul à la minute » (mouvement réduit) par « un contrôle à la seconde, repeinture seulement si la signature a changé », et préciser « fiche `bibliotheque-v17` ».

- [ ] **Step 5: Vérification complète**

```bash
npx vitest run --maxWorkers=4
npx tsc --noEmit
npm run build
```

Attendu : tests verts (relever le nombre total), typecheck sans erreur, build réussi. Relever la mesure de coût de la Task 4 dans le compte rendu. Ne PAS affirmer que l'affichage est correct : le rendu réel dans Chrome n'est pas vérifié (voir ci-dessous).

- [ ] **Step 6: Commit, PR, fusion, pré-prod** (routine du projet, sans demander) :

```bash
git add src/core/whats-new/entries.ts tests/core/whats-new/entries.test.ts docs/superpowers/specs/2026-10-09-bibliotheque-ombres-animaux-design.md docs/superpowers/plans/2026-10-09-bibliotheque-ombres-animaux.md
git commit -m "docs(wikihow): fiche bibliotheque-v17, ombres des animaux ; spec et plan alignés"
git push -u origin feat/bibliotheque-ombres-animaux
gh pr create --title "feat(bibliotheque): ombres des animaux (8c)" --body "<résumé, tests, limites, reste la vérification manuelle Chrome + APK>"
```

puis fusionner la PR (`gh pr merge --merge`), `npm run preprod`, mettre à jour la mémoire `project_bibliotheque.md` (8c fait, prochains : 6d, 7, 2c) et nettoyer le worktree.

**Reste après ce lot (à écrire dans la PR et la mémoire) :** vérification manuelle dans Chrome (ombre d'un chat qui marche, sur un bureau, sur le robot ; fluidité à 12 Hz en pièce 96 colonnes avec 3 animaux ; nuit avec lampe ; robot et chat en `ride`) + APK à la demande.

---

## Self-Review

- **Couverture de la spec** : boîtes par espèce/pose avec queue chat et chien, robot bas et large (Task 2) ; hide = rien (Task 2) ; support et levée (Tasks 1-2) ; passage animaux sans invalider les meubles + identité bit à bit sans animal (Tasks 3-4) ; cadence 12/4 Hz, signature quantifiée, mouvement réduit (Task 5) ; branchement sans rendu React (Task 6) ; WikiHow v17 + limites + spec alignée (Task 7). Question ouverte de la spec (ordre du calque) tranchée dans « Décisions de conception ».
- **Placeholders** : aucun TODO ; la Task 6 décrit le test à écrire par rapport au montage existant du fichier (le fichier n'a pas été relu en entier pour ce plan) — l'exécutant lit `library-light-ui.test.tsx` avant d'écrire.
- **Cohérence des types** : `PetFrame.on` (Task 1) utilisé par `petBoxesOf` (Task 2) ; `irradianceAt`/`lampPetTransmission`/`sunPetTransmission` (Task 3) appelés tels quels en Task 4 ; `getPetBoxes` (Task 5) fourni par `RoomView` (Task 6) ; `petFrames` = `usePetSim().frames`.
