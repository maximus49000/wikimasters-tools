# Bibliothèque Ghibli G3b : les gestes — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** passer au pantin Ghibli tous les humains restants sauf le cortège et les cyclistes (commerces, terrasses, boîte, foules des fêtes, musiciens, équipes, porteurs, figurants, père Noël, signes de fête), avec des bras commandés par le geste, et supprimer les derniers fondus sur place.

**Architecture:** le moteur gagne des poses de bras par cinématique inverse, un penché, l'allure `climb`, des tenues de travail et des points d'accroche ; la clé de sprite gagne `arms` et `lean` ; `GhibliFigure` porte des objets (dessin actuel) posés aux points d'accroche, déplacés par `poseFigure`. Chaque site choisit la pose comme il choisit aujourd'hui son dessin.

**Tech Stack:** React 19, TypeScript, SVG, canvas (sprites PNG en data URL), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-11-bibliotheque-ghibli-g3-design.md` (sections « Bilan de G3a » et « G3b en détail »).

## Global Constraints

- Worktree `C:\Users\maxim\Downloads\Wikimasters-ghibli`, branche `feat/bibliotheque-ghibli-g3b`.
- Commentaires en français, style dense du dépôt ; aucun `Math.random` dans le moteur.
- Couche des acteurs recopiée par `<use>` : aucun id fixe, aucun `clipPath`/`mask`/`filter` à id ; rognage par `<svg>` imbriqué ; CSP stricte : pas de `blob:` (les `data:` vont).
- Classique : dessin inchangé ; seules changent les entrées/sorties (plus aucun fondu sur place). Ghibli : aucun miroir, le sens est l'orientation du pantin.
- Mouvement réduit : poses fixes, aucune boucle.
- Sites qui animent par SMIL : le pantin reste dans une pose fixe ; le SMIL reste sur le groupe porteur ou sur l'objet.
- Passage de porte : toujours `src/content/door-passage.ts` (seuil dans l'ombre, cadre élargi sur le seuil) ; aucune opacité de fondu sur un humain hors de ce passage.
- Commits en français `feat(bibliotheque): …` / `fix(bibliotheque): …`, trailer `Co-Authored-By: Claude <modèle> <noreply@anthropic.com>`.
- Tests : `npx vitest run <fichiers>` ; `npm run typecheck` avant chaque commit ; la suite complète a des délais dépassés sous charge et un échec connu (« nacelle »).

## Review Focus

- Pose de bras dont la cible est hors de portée (bras trop court) : la main s'arrête au bout du bras, jamais de NaN — test tâche 1.
- Figure Ghibli d'un site qui n'appelle jamais `poseFigure` (foule statique) : objet tenu à la bonne main dès le premier rendu — test tâche 2.
- Ancienne signature (5 champs, sprites déjà en cache) relue après l'extension : forme sans tenue de travail — test tâche 2.
- Fête en cours au chargement de la scène (14 juillet, 21 juin) : chacun est à sa place, sans fondu — tests tâches 6 et 7.
- Arrivée dans la file de la boîte quand la file est déjà pleine : la personne attend hors champ, ne surgit pas — test tâche 5.

---

### Task 1: Bras par cinématique inverse, penché, allure `climb`

**Files:**
- Modify: `src/core/library/figure/skeleton.ts`
- Test: `tests/core/library/figure/figure-arms.test.ts`

**Interfaces:**
- Produces: `type ArmPose = 'swing' | 'down' | 'reach' | 'hold' | 'up' | 'work' | 'crossed' | 'raise' | 'cheer' | 'cup' | 'carry' | 'overhead' | 'tow' | 'guitar' | 'mic' | 'drum'`, `ARM_POSES: readonly ArmPose[]`, `Gait` gagne `'climb'`, `PoseOpts` gagne `arms?: ArmPose` (défaut `'swing'`) et `lean?: number` (0, 1, 2 ; défaut 0), `armTarget(pose, side): readonly [f, u, o] | null` (o = écart vers l'extérieur de l'épaule ; négatif = vers l'intérieur du corps), `LEAN_DEG = 8`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/library/figure/figure-arms.test.ts
import { describe, expect, it } from 'vitest';
import { ARM_POSES, LIMB, armTarget, poseOf } from '../../../../src/core/library/figure/skeleton';

const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const reach = LIMB.upperArm + LIMB.foreArm;

describe('bras du pantin', () => {
  it('chaque pose, chaque orientation : bras de longueur constante, aucune valeur non finie', () => {
    for (const arms of ARM_POSES)
      for (let y = 0; y < 16; y += 3) {
        const p = poseOf((y * Math.PI) / 8, 1, 'stand', { arms });
        for (const a of p.arms) {
          expect(Math.abs(dist(a.sh, a.elb) - LIMB.upperArm)).toBeLessThan(1e-6);
          expect(Math.abs(dist(a.elb, a.hand) - LIMB.foreArm)).toBeLessThan(1e-6);
          expect([...a.sh, ...a.elb, ...a.hand].every(Number.isFinite)).toBe(true);
          expect(dist(a.sh, a.hand)).toBeLessThanOrEqual(reach);
        }
      }
  });
  it('bras levé : main droite au-dessus de la tête, main gauche le long du corps', () => {
    const p = poseOf(0, 0, 'stand', { arms: 'raise' });
    expect(p.arms[1].hand[1]).toBeGreaterThan(p.head[1]);
    expect(p.arms[0].hand[1]).toBeLessThan(p.arms[0].sh[1] - 8);
  });
  it('bras croisés : chaque main passe de l’autre côté du corps, devant le torse', () => {
    // De face (orientation π/2) : le côté droit du corps est vers −x ; croisée, la main droite passe vers +x.
    const p = poseOf(Math.PI / 2, 0, 'stand', { arms: 'crossed' });
    expect(p.arms[1].sh[0]).toBeLessThan(p.pelvis[0]);
    expect(p.arms[1].hand[0]).toBeGreaterThan(p.pelvis[0]);
    expect(p.arms[0].hand[0]).toBeLessThan(p.pelvis[0]);
    expect(p.arms[1].hand[2]).toBeGreaterThan(p.pelvis[2]); // devant (vers le spectateur)
  });
  it('cible hors de portée : la main s’arrête au bout du bras', () => {
    expect(armTarget('raise', 1)).not.toBeNull();
    const p = poseOf(0, 0, 'stand', { arms: 'raise' });
    expect(dist(p.arms[1].sh, p.arms[1].hand)).toBeLessThanOrEqual(reach + 1e-9);
  });
  it('penché : la tête avance avec le niveau', () => {
    const a = poseOf(0, 0, 'stand', { lean: 0 }).head[0];
    const b = poseOf(0, 0, 'stand', { lean: 2 }).head[0];
    expect(b).toBeGreaterThan(a + 2);
  });
  it('escalade : genoux en alternance, mains au-dessus des épaules', () => {
    const a = poseOf(-Math.PI / 2, 0, 'climb');
    const b = poseOf(-Math.PI / 2, Math.PI, 'climb');
    expect(Math.sign(a.legs[0].knee[1] - a.legs[1].knee[1])).toBe(-Math.sign(b.legs[0].knee[1] - b.legs[1].knee[1]));
    for (const arm of a.arms) expect(arm.hand[1]).toBeGreaterThan(arm.sh[1]);
  });
  it('swing : comportement inchangé (marche de G3a)', () => {
    const p = poseOf(0, Math.PI / 2, 'walk');
    const q = poseOf(0, Math.PI / 2, 'walk', { arms: 'swing' });
    expect(q.arms[1].hand).toEqual(p.arms[1].hand);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/library/figure/figure-arms.test.ts`
Expected: FAIL (`ARM_POSES` absent).

- [ ] **Step 3: Implement**

Dans `skeleton.ts` (garder le code de G3a pour `swing`, la marche, l'assis et le parapluie) :

```ts
export type ArmPose = 'swing' | 'down' | 'reach' | 'hold' | 'up' | 'work' | 'crossed' | 'raise' | 'cheer' | 'cup' | 'carry' | 'overhead' | 'tow' | 'guitar' | 'mic' | 'drum';
export const ARM_POSES: readonly ArmPose[] = ['swing', 'down', 'reach', 'hold', 'up', 'work', 'crossed', 'raise', 'cheer', 'cup', 'carry', 'overhead', 'tow', 'guitar', 'mic', 'drum'];
// Penché vers l'avant par niveau (gestes des commerces).
export const LEAN_DEG = 8;
type T3 = readonly [number, number, number];
const DOWN: T3 = [1, -11, 0.8];
// Cibles de main depuis l'épaule, dans le repère du torse (f devant, u haut, o vers l'extérieur ; o < 0 : vers l'intérieur).
// [bras gauche, bras droit] ; null = balancement de marche (swing). Le bras droit est celui des gestes.
const TARGETS: Readonly<Record<ArmPose, readonly [T3 | null, T3 | null]>> = {
  swing: [null, null],
  down: [DOWN, DOWN],
  reach: [DOWN, [9, -4, 0.5]],
  hold: [DOWN, [6.5, -6, -1]],
  up: [DOWN, [3, 9, 0.8]],
  work: [[7, -8.5, -1.5], [8, -8, -1.5]],
  crossed: [[3.6, -5.6, -6.2], [3.2, -5, -6.6]],
  raise: [DOWN, [1.5, 11.5, 1]],
  cheer: [[1.5, 11.5, 1.8], [1.5, 11.5, 1.8]],
  cup: [DOWN, [4.5, -4.5, -0.8]],
  carry: [[7, -9, -2], [7, -9, -2]],
  overhead: [[2.5, 10.5, -1.2], [2.5, 10.5, -1.2]],
  tow: [DOWN, [-5, -10, 0.8]],
  guitar: [[6, -4, -7], [4, -8, -2]],
  mic: [DOWN, [3, 4.5, -3.2]],
  drum: [[6, -7, -2.5], [6, -7, -2.5]],
};
// side : -1 bras gauche (l < 0), +1 bras droit.
export const armTarget = (pose: ArmPose, side: -1 | 1): T3 | null => TARGETS[pose][side < 0 ? 0 : 1];
```

Cinématique inverse (fonction interne) :

```ts
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (a: V3): V3 => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
// Deux segments (épaule → coude → main) vers `target` ; le coude part vers `pole` (bas, extérieur, un peu en arrière).
function ik(sh: V3, target: V3, pole: V3): { elb: V3; hand: V3 } {
  const a = LIMB.upperArm;
  const b = LIMB.foreArm;
  const v = sub3(target, sh);
  const d = Math.min(a + b - 1e-6, Math.max(Math.abs(a - b) + 1e-6, Math.hypot(v[0], v[1], v[2])));
  const n = norm3(v);
  const pv = sub3(pole, sh);
  const perp = norm3(sub3(pv, mul3(n, dot3(pv, n))));
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const elb = add3(sh, add3(mul3(n, a * cosA), mul3(perp, a * sinA)));
  return { elb, hand: add3(sh, mul3(n, d)) };
}
```

Dans `poseOf` : `const arms = opts.arms ?? 'swing'; const leanLevel = Math.max(0, Math.min(2, opts.lean ?? 0));` ; l'angle `lean` devient `(seated ? 2 : 3 * w) * D + leanLevel * LEAN_DEG * D`. Repère du torse pour les cibles : `const tF = add3(mul3(fr.F, Math.cos(lean)), mul3(fr.U, -Math.sin(lean)))`, `const tU = add3(mul3(fr.U, Math.cos(lean)), mul3(fr.F, Math.sin(lean)))`. Pour chaque bras (côté `side = l < 0 ? -1 : 1`) : si `gait === 'climb'` et `arms === 'swing'`, cible `[2, 6 + 2 * Math.sin(phase) * side, 0.5]` ; sinon si `armTarget(arms, side)` n'est pas nul (et pas de parapluie sur ce bras), `target = sh + tF·f + tU·u + fr.R·(side·o)`, `pole = sh − tU·6 + fr.R·(side·3) − tF·1.5`, `{ elb, hand } = ik(sh, target, pole)` ; sinon le calcul actuel (`swing`, assis, parapluie).

Allure `climb` (face à l'échelle) : `w = 1` pour les angles ; jambes `th = (30 + 30 * Math.sin(ph)) * D` et `k = th * 1.6` pour la jambe A (`ph = phase`) et B (`ph = phase + π`) ; `hipY = LIMB.thigh + LIMB.shin + LIMB.ankle` (le site place le pantin sur les barreaux) ; pas de rotation du bassin ni des épaules ; `lean = 4 * D`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/library/figure/`
Expected: PASS (les tests de G3a inchangés).

- [ ] **Step 5: Commit**

```bash
git add src/core/library/figure/skeleton.ts tests/core/library/figure/figure-arms.test.ts
git commit -m "feat(bibliotheque): bras du pantin par cinématique inverse, penché et escalade"
```

---

### Task 2: Tenues de travail, clé étendue, points d'accroche et objets tenus

**Files:**
- Modify: `src/core/library/figure/dress.ts`, `src/core/library/figure/bake.ts`, `src/content/figure/figure-host.tsx`, `src/content/figure/ghibli-figure.tsx`
- Test: `tests/core/library/figure/figure-bake.test.ts` (ajouts), `tests/content/figure/figure-host.test.tsx` (ajouts)

**Interfaces:**
- Consumes: Task 1 (`ArmPose`, `poseOf` opts `arms`, `lean`, gait `climb`).
- Produces:
  - `dress.ts` : `type Work = 'none' | 'vest' | 'apron'` ; `Shape` gagne `work: Work` ; `shapeOf(o, umbrella, work: Work = 'none')` ; signature à 6 champs (`…umbrella.work` avec `n`/`v`/`a`) ; `shapeFromSignature` relit aussi les signatures à 5 champs (`work = 'none'`).
  - `bake.ts` : `Slot` gagne `'vest' | 'band' | 'apron'` ; `FigureKey` gagne `arms: ArmPose` et `lean: number` ; `keyString` = `${sig}|${yaw}|${gait}|${phase}|${head}|${arms}|${lean}` ; gilet (enveloppe du tronc agrandie de 0,4, case `vest`, plus une bande `band` à mi-torse), tablier (enveloppe de la taille aux genoux, devant, case `apron`) ; `type Anchor = 'handR' | 'handL' | 'head' | 'headTop' | 'nape'` ; `anchorsOf(key: FigureKey): Record<Anchor, readonly [number, number]>` (repère du sprite : pieds à l'origine, y vers le bas ; même `poseOf` que `bakeFigure`), mémoïsé par clé.
  - `figure-host.tsx` : les cases `vest`, `band`, `apron` dans la palette (`#F28C28`, `#E8E8E0`, `#F4F1EA`, ombres par `shadeOf`).
  - `ghibli-figure.tsx` : `type PoseIn = Omit<FigureKey, 'sig' | 'arms' | 'lean'> & { arms?: ArmPose; lean?: number }` accepté partout où une pose est attendue (défauts `'swing'`, 0) ; `GhibliFigure` gagne `work?: Work` et `held?: readonly { anchor: Anchor; node: ReactNode }[]` rendus comme `<g data-held={anchor} transform="translate(x y)">node</g>` après l'`<image>` (positions de `anchorsOf(initial)`) ; `poseFigure` met à jour ces transforms quand la clé change (chaînes mises en cache par clé) ; `hideFigure` cache aussi les objets (`visibility="hidden"`).

- [ ] **Step 1: Write the failing tests**

```ts
// ajouts à tests/core/library/figure/figure-bake.test.ts
import { anchorsOf } from '../../../../src/core/library/figure/bake';
describe('tenues de travail et accroches', () => {
  it('signature à 6 champs, relecture des signatures à 5 champs', () => {
    const s = shapeOf(girl, false, 'vest');
    expect(signatureOf(s).split('.')).toHaveLength(6);
    expect(shapeFromSignature(signatureOf(s))).toEqual(s);
    expect(shapeFromSignature('short.long.skirt.bag.n').work).toBe('none');
  });
  it('gilet : des pièces « vest » et « band » ; tablier : « apron »', () => {
    const k = { sig: '', yaw: 0, gait: 'stand' as const, phase: 0, head: 0, arms: 'swing' as const, lean: 0 };
    const v = shapeOf(girl, false, 'vest');
    const slots = bakeFigure(v, { ...k, sig: signatureOf(v) }).groups.flatMap((g) => g.parts.map((p) => p.slot));
    expect(slots).toContain('vest');
    expect(slots).toContain('band');
    const a = shapeOf(girl, false, 'apron');
    expect(bakeFigure(a, { ...k, sig: signatureOf(a) }).groups.flatMap((g) => g.parts.map((p) => p.slot))).toContain('apron');
  });
  it('accroches : main droite levée au-dessus de la tête pour « raise » (y vers le bas)', () => {
    const key = { sig: signatureOf(shapeOf(girl, false)), yaw: 0, gait: 'stand' as const, phase: 0, head: 0, arms: 'raise' as const, lean: 0 };
    const a = anchorsOf(key);
    expect(a.handR[1]).toBeLessThan(a.headTop[1]);
    expect(a.nape[1]).toBeGreaterThan(a.head[1]);
    expect(keyString(key)).toBe(`${key.sig}|0|stand|0|0|raise|0`);
  });
});
```

```tsx
// ajout à tests/content/figure/figure-host.test.tsx : objet tenu à la main dès le rendu, déplacé par poseFigure
it('objet tenu : posé à la main au rendu, suit la pose', () => {
  // Rendre <GhibliFigure … initial={{ yaw: 0, gait: 'stand', phase: 0, head: 0, arms: 'raise' }} held={[{ anchor: 'handR', node: <circle r={1} /> }]} />
  // dans un FigureContext.Provider, lire le transform de [data-held="handR"], comparer à anchorsOf(clé).handR (2 décimales) ;
  // puis reg.ensure de la pose { arms: 'down' } et poseFigure(...) : le transform change et vaut anchorsOf(nouvelle clé).handR.
});
```

Écrire ce second test en entier sur le modèle des tests existants du fichier.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/library/figure/figure-bake.test.ts tests/content/figure/figure-host.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** (dans `bakeFigure`, passer `{ headYaw, umbrella, arms: key.arms, lean: key.lean }` à `poseOf` ; gilet et tablier ajoutés au groupe du tronc après le haut ; mettre à jour tous les appels existants de `FigureKey`/`keyString`/`poseFigure` dans `src/` pour compiler, sans changer le comportement de G3a).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/library/figure/ tests/content/figure/ tests/content/city-life.test.tsx tests/content/city-life-ghibli.test.tsx tests/content/city-shops-life.test.tsx tests/content/shop-terrace.test.tsx`
Expected: PASS (adapter les attentes de chaînes de clé des tests de G3a au nouveau format).

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(bibliotheque): tenues de travail, gestes dans la clé des sprites, objets tenus aux accroches du pantin"
```

---

### Task 3: Commerces : personnel, gestes des clients, chantier de l'enseigne

**Files:** `src/content/city-shops-life.tsx`, `src/content/shop-gesture-sprites.tsx` (et ce qu'ils appellent) ; tests `tests/content/city-shops-life.test.tsx` (et le fichier de tests du personnel s'il existe : `grep -rln "StaffLayer\|placeStaff" tests`).

**Requirements:**
- Correspondance des gestes (`Pose` de `gestures.ts`) vers le pantin : `arms` `down|reach|hold|up|work` → mêmes `ArmPose` ; `lean` (0–0,5) → niveau `Math.round(lean * 4)` borné à 2 ; `head` `front` → 0, `down` → 0 avec `lean` +1 (borné), `turn` → tête tournée de ±4 (vers l'arrière) ; `sway` → balancement horizontal du groupe porteur (même transform que le classique, sans rotation) ; `item` `hand` → objet (`AccessorySprite`) à l'accroche `handR`, `counter`/`table` → objet posé aux coordonnées actuelles (`PLACED`), `none` → caché. Écrire cette correspondance comme fonction pure exportée et testée (`ghibliGesture(pose: Pose): { arms; lean; head }`).
- Employés (`StaffLayer`) en Ghibli : `GhibliFigure` avec `work: 'apron'` pour les métiers de bouche (familles `counter`, `drink`, `table`), sinon `none` ; posés par `placeStaff` (au plus 10 fois par seconde) ; quand ils marchent (arrivée, départ, relève : transition CSS de 30 s), pose `walk` dont la phase vient de la distance parcourue depuis le début de la transition (vitesse = distance de la transition / 30 s) ; rideau roulant levé ou baissé : `overhead`.
- Clients à l'intérieur : gestes appliqués (pendant la station debout ou assise), objet à la main ; sur le trottoir en ressortant, l'objet emporté à `handR`.
- Chantier de l'enseigne (`ShopWorks`) : ouvriers en gilet, échelle (`climb` en montant, `overhead` pour poser/déposer l'enseigne, `carry` pour porter l'ancienne/la nouvelle) ; mêmes trajets qu'aujourd'hui.
- Aucune opacité de fondu nouvelle ; s'il en reste une sur un humain dans ces fichiers, la remplacer par une entrée/sortie à pied ou par `door-passage.ts`.
- Tests : correspondance des gestes ; en Ghibli, un employé et un client intérieur sont des pantins avec l'objet à la main pendant un geste `hold` ; classique inchangé.

---

### Task 4: Terrasses : convives et serveurs

**Files:** `src/content/shop-terrace.tsx` (+ moteur `src/core/library/city/shops/terrace.ts` si les arrivées l'exigent) ; tests `tests/content/shop-terrace.test.tsx`.

**Requirements:**
- Convives en Ghibli : assis (`seated`), tournés vers leur table (orientation 2 ou 6 selon le côté), geste de table (`ghibliGesture` de la tâche 3 avec la famille `table`/`drink` du commerce), objet sur la table ou à la main.
- Serveurs : `GhibliFigure` `work: 'apron'`, marche (phase depuis la distance) vers la table et retour, `hold` avec le plateau ou l'objet du commerce à `handR` quand il sert.
- Arrivée et départ des convives : lire le moteur ; s'ils apparaissent ou disparaissent sur leur chaise par fondu, les faire arriver à pied depuis le trottoir (ou la porte du local via `door-passage.ts`), s'asseoir, puis se lever et repartir à pied. Si le moteur ne le permet pas sans le refaire, le dire dans le rapport (DONE_WITH_CONCERNS) avec une proposition.
- Tests : en Ghibli, convives assis et serveurs en pantin ; aucune opacité de fondu sur un convive ; classique inchangé hors entrées/sorties.

---

### Task 5: Boîte de nuit : vigiles, arrivées de la file depuis le bord

**Files:** `src/content/shop-queue.tsx`, `src/core/library/city/shops/queue.ts` ; tests `tests/content/shop-terrace.test.tsx` (file) et `tests/core/library/city-shops-queue.test.ts`.

**Requirements:**
- Vigiles en Ghibli : `crossed`, tournés de trois quarts vers la rue (orientation 2 côté gauche, 6 côté droit), costume (tenue actuelle).
- Arrivées : la personne qui rejoindra la file au temps J (première image où elle apparaît dans `queueAt`) marche depuis le bord du monde du côté opposé à la porte (ou depuis la porte d'immeuble la plus proche, via `door-passage.ts`, si le bord est à plus de `MAX_TRIP_PX`) et arrive à sa place exactement à J ; marche à la vitesse des passants (`(16 + 8·u)·WALK_PACE` px/s, `u` tiré de son id) ; pendant ce trajet elle n'est pas dans la file. Moteur pur dans `queue.ts` : `queueArrivals(seed, slotId, t, minutes, isOpen, layout)` (personnes en route et leur position), testé. Si la file est pleine, l'arrivée attend hors champ.
- La personne qui entre : marche à vitesse normale jusqu'à la porte, demi-tour sur place (`TURN_S`), puis seuil ; allonger l'étape d'entrée plutôt que d'accélérer la marche (adapter `ADVANCE_S` côté rendu si besoin, sans changer le rythme des entrées).
- Tests : une arrivée est hors champ `dist/vitesse` secondes avant J et à sa place à J ; jamais d'opacité < 1 ; vigiles en `crossed` en Ghibli.

---

### Task 6: Défilé du 14 juillet : la foule

**Files:** `src/content/parade-crowd.tsx` (+ `src/core/library/city/parade.ts`) ; tests `tests/content/parade-crowd.test.tsx` ou équivalent (`grep -rln "ParadeCrowd\|spectatorAt" tests`).

**Requirements:**
- Spectateurs debout en Ghibli : `raise` avec drapeau tricolore, téléphone ou main ouverte (objets dessinés à `handR`, le drapeau agité par SMIL autour de la main comme aujourd'hui) ; sans objet : `down`/`swing` immobile ; orientés vers la chaussée (de trois quarts : orientation 2 ou 6 selon le sens d'arrivée, ou de dos 12 pour les rangs du fond — choisir de façon déterministe par spectateur).
- Enfant sur les épaules : pantin enfant `seated` posé à l'accroche `nape` de l'adulte (échelle 0,62 comme aujourd'hui), dessiné avant l'adulte.
- Marcheurs (arrivée, départ) : `walk` avec phase depuis la distance, drapeau porté haut (`raise` sans agiter).
- Entrées et sorties par les portes : remplacer le « fondu court de l'encadrement » par `door-passage.ts`.
- Tests : en Ghibli, spectateurs en pantin avec leur objet à la main, enfant à la nuque ; aucune opacité de fondu ; scène chargée pendant la fête : chacun à sa place.

---

### Task 7: Fête de la musique : foule, stands, musiciens

**Files:** `src/content/music-street.tsx`, `src/content/stage-band.tsx` (+ moteurs `city/music-crowd.ts`, `city/beer.ts`) ; tests correspondants (`grep -rln "music\|stage" tests/content`).

**Requirements:**
- Danseurs : rebond SMIL conservé sur le groupe porteur, pantin `cheer` (un sur trois) ou `raise`, sinon `swing` immobile ; gobelet : `cup` avec le gobelet à `handR` (le geste « boire » SMIL actuel devient une alternance `cup` ↔ `up` posée par la boucle si elle existe, sinon `cup` fixe).
- Serveurs des stands : `apron`, `work` à la tireuse, `hold` en tendant le gobelet ; files des stands et clients qui vont au comptoir : `walk`/`stand`.
- Musiciens : `guitar`, `mic` (micro sur pied : main au micro), `drum` ; balancement SMIL conservé ; arrivée à pied, montée sur la scène (le moteur donne `lift` : marche en montant), départ à minuit.
- Portes : `door-passage.ts` à la place du fondu d'encadrement.
- Tests : pantins en Ghibli pour danseurs, serveurs, musiciens ; aucune opacité de fondu ; classique inchangé hors entrées/sorties.

---

### Task 8: Équipes d'installation, nacelle, déménagement

**Files:** `src/content/install-sprites.tsx`, `src/content/install-layer.tsx`, `src/content/moving-truck.tsx` ; tests correspondants.

**Requirements:**
- `CrewWorker` en Ghibli : `work: 'vest'` ; poses `reach` → `overhead`, `carry` → `carry`, `climb` → allure `climb` (sur l'échelle, de dos), `hold` → `hold`, `tow` → `tow` ; marche avec phase depuis la distance quand ils se déplacent ; objets portés (barrières, planches, drapeaux, pièces de scène) aux accroches des mains (une barrière portée à deux mains : centre entre `handL` et `handR`).
- Ouvrier de la nacelle : pantin debout dans la nacelle (`overhead` quand il pose, sinon `down`), pièces tenues (`HeldTruss`, `HeldSpot`) à `handR`.
- Le cycliste du vélo porteur reste au dessin actuel (G3c).
- Porteurs du déménagement : `carry` avec cartons/meubles entre les mains, marche, entrée et sortie du camion et de l'immeuble (portes via `door-passage.ts` si un fondu existe).
- Tests : pantins en Ghibli avec gilet ; objets aux mains ; aucune opacité de fondu nouvelle.

---

### Task 9: Figurants des événements, père Noël, signes de fête des passants

**Files:** `src/content/city-event-sprites.tsx`, `src/content/santa-layer.tsx`, `src/content/festive-marks.tsx`, `src/content/city-life.tsx` (passants) ; tests correspondants.

**Requirements:**
- Figurants des événements (ouvriers, marcheurs sous la pluie, groupes sous parapluies) : pantins (gilet pour les ouvriers, parapluie pour les marcheurs), marche posée par la boucle des événements si elle place ces figurants, sinon pose fixe.
- Père Noël : pantin (tenue rouge : haut et bas `#C0302B`, bonnet `beanie` rouge, barbe : pas de barbe en G3b — note dans le rapport) dans ses poses actuelles (`carry` avec la hotte, `climb` s'il grimpe).
- Signes de fête des passants (`MarkArt`) en Ghibli : couronne et coquelicot à l'accroche `headTop`, ballon, panier, muguet, drapeau, serpentin, note à `handR` (bras `hold` pour ceux qui tiennent quelque chose) ; mêmes probabilités qu'aujourd'hui (`festiveMark`).
- Tests : passant avec un signe en Ghibli (graine/jour choisis pour en avoir un) : l'objet est dans `[data-held]` ; figurants en pantin.

---

### Task 10: Banc, mesures, captures et auto-validation

- [ ] Banc `.superpowers/harness-ville` (port 5217 ; le banc de comparaison `..\wmt-g3-baseline` sur main au port 5218 doit être remis à jour sur `origin/main`), scripts `g3cap.mjs` (option `focus`), `exp2.mjs`.
- [ ] Mesures (monde 3 456 px, processeur ×4) : jour ordinaire 8 h et 12 h, 14 juillet 11 h (défilé, `date=2026-07-14`), 21 juin 21 h (`date=2026-06-21`), en Ghibli et classique, branche contre main. Objectif : ≤ main + 10 ms en Ghibli, classique ±3 ms.
- [ ] Captures dans `C:\Users\maxim\Downloads\Wikimasters tools\.superpowers\captures-ghibli-g3b\` : commerces (employé en geste, rideau), terrasse, boîte (vigiles, arrivée), 14 juillet (foule, enfant sur les épaules), 21 juin (danseurs, stand, musiciens), chantier de l'enseigne, nacelle, déménagement, passant avec signe de fête, pluie. Regarder chaque capture, corriger chaque défaut visible (avec test si le code change), recommencer.

### Task 11: Livraison

- [ ] `npm run typecheck`, `npm run build`, tests ciblés ; suite complète : comparer les échecs à main (seul « nacelle » toléré).
- [ ] Push, PR (résumé, mesures, captures, limites, `🤖 Generated with [Claude Code](https://claude.com/claude-code)`), fusion, pré-prod depuis le dépôt principal (`npm run preprod`, puis `npm run build`), mémoire `project_ghibli.md` + `MEMORY.md`.
