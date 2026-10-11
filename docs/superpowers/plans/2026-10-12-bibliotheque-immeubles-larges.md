# Immeubles larges, jumeaux, mitoyens et baie vitrée — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une rue de la Ville faite de lots plus larges (simples 40-70 u, jumeaux sur socle commun avec un grand local, souvent mitoyens) et une baie vitrée qui montre toute la ville.

**Architecture:** `citySkyline` garde son rang du fond par tranche et tire le premier plan comme une suite de lots (un seul générateur, de gauche à droite). Les jumeaux partagent un objet `Podium` ; un petit module `city/lots.ts` regroupe les tours en lots pour les locaux et les entrées. Le plan de peinture reçoit une liste `podiums` peinte après les immeubles du premier plan. La baie vitrée = bornes de fenêtre élargies + vitre jusqu'au bas du mur.

**Tech Stack:** TypeScript, React 19 (SVG), canvas 2D (peinture Ghibli), Vitest, WXT.

**Spec:** `docs/superpowers/specs/2026-10-12-bibliotheque-immeubles-larges-design.md` · maquette `docs/superpowers/maquettes/batiments-larges/rue.html`.

## Global Constraints

- Simple : 60 %, largeur 40 + r·30 u, hauteur (avant étirement) 40 + r·60.
- Jumeaux : 40 %, tours 26 + r·18 u, retrait r·8 u, hauteurs avant étirement 45 + r·55 écartées d'au moins 12,5, socle `PODIUM_H = 44` (GROUND_FLOOR 30 + 14).
- Entre lots : 45 % écart 0, sinon 8 + r·14.
- Premier lot à x = 12 ; génération jusqu'à `width + CHUNK`.
- Rang du fond (`far`) : tirage inchangé, octet pour octet.
- `WINDOW_MAX = { w: 24, h: 12 }`.
- Style cellulo : aplat + un ton d'ombre net violet-bleu + un rehaut + trait #2A1A18, pas de grain.
- Pas de fiche WikiHow.
- Tests : `npx vitest run <fichier>` ; types : `npm run typecheck` ; build : `npm run build`. Travail dans `C:\Users\maxim\Downloads\Wikimasters-ghibli`, branche `feat/bibliotheque-immeubles-larges`.

## Review Focus

- Lot jumeaux coupé au bord du monde (x < 0 ou x + w > width) : le local et l'entrée restent dans la partie visible, pas de local s'il reste < 38 u. → test Task 3.
- Fenêtres d'une tour courte qui tomberaient dans le socle : aucune fenêtre de tour sous `ground - PODIUM_H`. → test Task 2.
- Retrait entre deux tours : un arbre ne doit pas « pousser » devant le socle (silhouetteTop voit le socle). → test Task 4.
- Pièce qui s'élargit : les lots de la partie gauche ne bougent pas (préfixe stable). → test Task 1.
- Fenêtre 12 rangées posée en haut du mur : la vitre descend jusqu'au bas du mur (trottoir de devant visible). → test Task 6.

---

### Task 1: Lots dans `citySkyline`

**Files:**
- Modify: `src/core/library/scene-world.ts:94-128`
- Test: `tests/core/library/scene-world.test.ts`

**Interfaces:**
- Produces: `export type Podium = { id: number; x: number; w: number; h: number }` ; `Building` gagne `podium?: Podium` (même objet pour les deux tours) ; `export const PODIUM_H = 44`.

- [ ] **Step 1: Tests qui échouent** — ajouter dans le `describe('citySkyline')` :

```ts
  const near = (w: number, s: number) => citySkyline(w, HEIGHT, s).filter((b) => !b.far);

  it('enchaîne des lots sans chevauchement, simples de 40 à 70 u ou jumeaux sur un socle commun', () => {
    for (let s = 1; s <= 30; s++) {
      const list = near(1440, s);
      for (let i = 1; i < list.length; i++) expect(list[i]!.x).toBeGreaterThanOrEqual(list[i - 1]!.x + list[i - 1]!.w - 1e-9);
      for (const b of list) {
        if (!b.podium) expect(b.w >= 40 && b.w < 70).toBe(true);
        else expect(b.w >= 26 && b.w < 44).toBe(true);
      }
    }
  });

  it('donne le même socle aux deux tours d\'un jumeau, qui le couvrent exactement', () => {
    const list = Array.from({ length: 20 }, (_, s) => near(1440, s + 1)).flat();
    const twins = list.filter((b) => b.podium);
    expect(twins.length).toBeGreaterThan(0);
    const byPodium = new Map<object, typeof twins>();
    for (const b of twins) byPodium.set(b.podium!, [...(byPodium.get(b.podium!) ?? []), b]);
    for (const [p, towers] of byPodium) {
      const pod = p as NonNullable<(typeof twins)[0]['podium']>;
      expect(towers).toHaveLength(2);
      expect(pod.h).toBe(PODIUM_H);
      expect(towers[0]!.x).toBeCloseTo(pod.x, 9);
      expect(towers[1]!.x + towers[1]!.w).toBeCloseTo(pod.x + pod.w, 9);
      expect(towers[1]!.x - (towers[0]!.x + towers[0]!.w)).toBeLessThan(8);
      expect(Math.abs(towers[0]!.h - towers[1]!.h)).toBeGreaterThanOrEqual(12.5 - 1e-9);
      expect(Math.min(towers[0]!.h, towers[1]!.h)).toBeGreaterThanOrEqual(45);
    }
  });

  it('colle environ 45 % des lots à leur voisin et garde ~40 % de jumeaux', () => {
    let lots = 0, touching = 0, twins = 0;
    for (let s = 1; s <= 60; s++) {
      const list = near(2000, s);
      let prevEnd: number | null = null;
      for (let i = 0; i < list.length; i++) {
        const b = list[i]!;
        if (b.podium && list[i - 1]?.podium === b.podium) continue; // 2e tour du même lot
        const end = b.podium ? b.podium.x + b.podium.w : b.x + b.w;
        lots++;
        if (b.podium) twins++;
        if (prevEnd !== null && Math.abs(b.x - prevEnd) < 1e-9) touching++;
        prevEnd = end;
      }
    }
    expect(twins / lots).toBeGreaterThan(0.33);
    expect(twins / lots).toBeLessThan(0.47);
    expect(touching / lots).toBeGreaterThan(0.38);
    expect(touching / lots).toBeLessThan(0.52);
  });

  it('ne change pas le rang du fond', () => {
    // Empreinte du rang du fond figée avant la modification (graine 5, 720 px).
    const far = citySkyline(720, HEIGHT, 5).filter((b) => b.far).map((b) => [b.x, b.w, b.h].map((v) => v.toFixed(3)).join(','));
    expect(far).toMatchSnapshot();
  });
```

Ajouter `PODIUM_H` à l'import en tête du fichier. **Avant** d'implémenter, lancer une fois le test « ne change pas le rang du fond » sur le code actuel pour écrire l'instantané (il doit passer avant ET après).

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run tests/core/library/scene-world.test.ts`
Expected: FAIL (PODIUM_H inexistant, largeurs 28-54).

- [ ] **Step 3: Implémenter** — remplacer `Building`/`citySkyline` :

```ts
export type Lamp = { x: number; y: number; u: number; blue: boolean };
// Socle commun d'un lot « jumeaux » : rez-de-chaussée commercial + un étage, partagé (même objet) par les deux tours.
export type Podium = { id: number; x: number; w: number; h: number };
export type Building = { x: number; w: number; h: number; far: boolean; lamps: Lamp[]; podium?: Podium };

export const CHUNK = 360;
// Hauteur du socle des jumeaux : rez-de-chaussée (GROUND_FLOOR = 30, city/facades.ts) + une rangée de fenêtres (14).
export const PODIUM_H = 44;
const LOT = { start: 12, twin: 0.4, touch: 0.45 } as const;

export const SKYLINE_GROUND = 0.78;

// Grille de fenêtres d'origine (colonnes de 10 px, rangées de 14 px) posée sur SKYLINE_GROUND.
function lampsOf(rng: () => number, x: number, w: number, h: number, ground: number): Lamp[] {
  const lamps: Lamp[] = [];
  for (let r = 0; r < Math.floor(h / 14); r++) {
    for (let c = 0; c < Math.floor(w / 10); c++) lamps.push({ x: x + 4 + c * 10, y: ground - h + 4 + r * 14, u: rng(), blue: rng() < 0.15 });
  }
  return lamps;
}

// Rang du fond : par tranche de 360 (tirage inchangé). Premier plan : une suite de lots de gauche à droite (un seul
// générateur, préfixe stable quand la pièce s'élargit) : simple (40-70 px) ou jumeaux (deux tours sur un socle commun),
// mitoyens ou séparés de 8 à 22 px.
export function citySkyline(width: number, height: number, seed: number): Building[] {
  const ground = height * SKYLINE_GROUND;
  const out: Building[] = [];
  for (let chunk = 0; chunk * CHUNK < width + CHUNK; chunk++) {
    const rng = mulberry32(seed ^ Math.imul(chunk + 1, 2654435761));
    let x = chunk * CHUNK;
    const end = (chunk + 1) * CHUNK;
    while (x < end) {
      const w = 34 + rng() * 30;
      const h = 50 + rng() * 70;
      out.push({ x, w, h, far: true, lamps: [] });
      x += w - 4;
    }
  }
  const rng = mulberry32(seed ^ hashString('city-lots'));
  let podiumId = 0;
  for (let x = LOT.start; x < width + CHUNK; ) {
    if (rng() < LOT.twin) {
      const wa = 26 + rng() * 18;
      const wb = 26 + rng() * 18;
      const gap = rng() * 8;
      const ha = 45 + rng() * 55;
      let hb = 45 + rng() * 55;
      if (Math.abs(ha - hb) < 12.5) hb = ha < 72.5 ? ha + 12.5 : ha - 12.5;
      const podium: Podium = { id: podiumId++, x, w: wa + gap + wb, h: PODIUM_H };
      out.push({ x, w: wa, h: ha, far: false, lamps: lampsOf(rng, x, wa, ha, ground), podium });
      out.push({ x: x + wa + gap, w: wb, h: hb, far: false, lamps: lampsOf(rng, x + wa + gap, wb, hb, ground), podium });
      x += podium.w;
    } else {
      const w = 40 + rng() * 30;
      const h = 40 + rng() * 60;
      out.push({ x, w, h, far: false, lamps: lampsOf(rng, x, w, h, ground) });
      x += w;
    }
    x += rng() < LOT.touch ? 0 : 8 + rng() * 14;
  }
  return out;
}
```

ATTENTION : le rang du fond consommait le même `rng` de tranche que le premier plan, mais **avant** lui : ses tirages sont identiques. Vérifier que l'instantané du Step 1 passe.

- [ ] **Step 4: Vérifier**

Run: `npx vitest run tests/core/library/scene-world.test.ts`
Expected: PASS (y compris le test existant « première bande ne change pas quand la pièce grandit »).

- [ ] **Step 5: Commit**

```bash
git add src/core/library/scene-world.ts tests/core/library/scene-world.test.ts tests/core/library/__snapshots__
git commit -m "feat(bibliotheque): rue par lots — immeubles simples plus larges, jumeaux sur socle commun, mitoyens"
```

---

### Task 2: Façades — fenêtres au-dessus du socle, rangée du socle

**Files:**
- Modify: `src/core/library/city/facades.ts`
- Test: `tests/core/library/city-facades.test.ts`

**Interfaces:**
- Consumes: `Podium`, `PODIUM_H`, `Building.podium` (Task 1).
- Produces: `export function podiumWindows(p: Podium, ground: number, seed: number): Lamp[]` ; dans `cityFacades`, la 1re tour (x === podium.x) porte en plus les fenêtres du socle dans `lamps` (allumage de nuit), et `Facade` garde `podium`.

- [ ] **Step 1: Tests qui échouent**

```ts
import { PODIUM_H } from '../../../src/core/library/scene-world';
import { cityMetrics } from '../../../src/core/library/city/metrics';
import { GROUND_FLOOR, cityFacades, podiumWindows } from '../../../src/core/library/city/facades';

describe('façades des jumeaux', () => {
  it('ne pose aucune fenêtre de tour dans le socle, et une rangée de fenêtres dans l\'étage du socle', () => {
    for (let s = 1; s <= 20; s++) {
      const { ground } = cityMetrics(340);
      for (const f of cityFacades(1440, 340, s)) {
        if (!f.podium) continue;
        const own = f.lamps.filter((l) => l.x >= f.x && l.x < f.x + f.w && l.y < ground - PODIUM_H);
        const inPodium = f.lamps.filter((l) => l.y + 7 > ground - PODIUM_H);
        for (const l of inPodium) {
          expect(l.y).toBeGreaterThanOrEqual(ground - PODIUM_H);
          expect(l.y + 7).toBeLessThanOrEqual(ground - GROUND_FLOOR);
        }
        expect(own.every((l) => l.y + 7 <= ground - PODIUM_H)).toBe(true);
        expect(inPodium.length > 0).toBe(f.x === f.podium.x);
      }
    }
  });
  it('centre la rangée du socle sur sa largeur', () => {
    const p = { id: 0, x: 100, w: 80, h: PODIUM_H };
    const wins = podiumWindows(p, 238, 3);
    expect(wins.length).toBe(Math.floor((80 - 6) / 10));
    const left = wins[0]!.x - p.x;
    const right = p.x + p.w - (wins.at(-1)!.x + 5);
    expect(Math.abs(left - right)).toBeLessThan(0.01);
  });
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/core/library/city-facades.test.ts` → FAIL (`podiumWindows` inexistant).

- [ ] **Step 3: Implémenter** dans `facades.ts` :

```ts
import { PODIUM_H, SKYLINE_GROUND, citySkyline, hashString, mulberry32, type Building, type Lamp, type Podium } from '../scene-world';

// Bas des étages d'un immeuble : haut du socle pour une tour de jumeaux, haut du rez-de-chaussée sinon.
const floorsBottom = (b: Building, ground: number): number => ground - (b.podium ? PODIUM_H : GROUND_FLOOR);

export function extraFloorWindows(b: Building, ground: number, seed: number): Lamp[] {
  const top = ground - b.h * BUILDING_STRETCH;
  const rows = Math.floor(b.h / 14);
  const cols = Math.floor(b.w / 10);
  const rng = mulberry32(seed ^ hashString('extra-floors') ^ Math.round(b.x * 8));
  const out: Lamp[] = [];
  for (let r = rows; top + 4 + r * 14 + 7 <= floorsBottom(b, ground); r++) {
    for (let c = 0; c < cols; c++) out.push({ x: b.x + 4 + c * 10, y: top + 4 + r * 14, u: rng(), blue: rng() < 0.15 });
  }
  return out;
}

// Étage du socle des jumeaux : une rangée de fenêtres 5 × 7 au pas de 10, centrée sur la largeur du socle.
export function podiumWindows(p: Podium, ground: number, seed: number): Lamp[] {
  const n = Math.floor((p.w - 6) / 10);
  const x0 = p.x + (p.w - (n * 10 - 5)) / 2;
  const rng = mulberry32(seed ^ hashString('podium-floor') ^ Math.round(p.x * 8));
  const y = ground - PODIUM_H + (PODIUM_H - GROUND_FLOOR - 7) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * 10, y, u: rng(), blue: rng() < 0.15 }));
}
```

et dans `cityFacades`, branche non `far` :

```ts
    const bottom = floorsBottom(b, ground);
    const lamps = [
      ...b.lamps.map((l) => ({ ...l, y: l.y - lift - shift })).filter((l) => l.y + 7 <= bottom),
      ...extraFloorWindows(b, ground, seed),
      ...(b.podium && b.x === b.podium.x ? podiumWindows(b.podium, ground, seed) : []),
    ];
    return { ...b, h, lamps, farWindows: [] };
```

Note : le filtre sur `b.lamps` s'applique aussi aux immeubles simples (borne = haut du rez-de-chaussée) : vérifier que les tests existants passent (aucune fenêtre d'origine n'y descendait).

- [ ] **Step 4: Vérifier** — `npx vitest run tests/core/library/city-facades.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/city/facades.ts tests/core/library/city-facades.test.ts
git commit -m "feat(bibliotheque): façades des jumeaux — étages au-dessus du socle, rangée de fenêtres du socle"
```

---

### Task 3: Lots visibles → locaux et entrées

**Files:**
- Create: `src/core/library/city/lots.ts`
- Modify: `src/core/library/city/shops/slots.ts`, `src/core/library/city/doors.ts`
- Test: `tests/core/library/city-lots.test.ts` (nouveau), `tests/core/library/city-shops-slots.test.ts`, `tests/core/library/city-doors.test.ts`

**Interfaces:**
- Consumes: `citySkyline`, `Building.podium`.
- Produces: `export type FrontLot = { x: number; w: number; podium: Podium | null; towers: Building[] }` ; `export function frontLots(width: number, height: number, seed: number): FrontLot[]` (lots du premier plan dont une partie est dans `[0, width)`, de gauche à droite).

- [ ] **Step 1: Tests qui échouent** — `tests/core/library/city-lots.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { frontLots } from '../../../src/core/library/city/lots';
import { shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import { doorsFor } from '../../../src/core/library/city/doors';

describe('lots du premier plan', () => {
  it('regroupe les deux tours d\'un jumeau en un seul lot couvrant le socle', () => {
    const lots = frontLots(1440, 340, 4);
    for (const l of lots) {
      if (l.podium) {
        expect(l.towers).toHaveLength(2);
        expect(l.x).toBe(l.podium.x);
        expect(l.w).toBe(l.podium.w);
      } else expect(l.towers).toHaveLength(1);
    }
  });
  it('donne un seul local par jumeau visible, sur sa largeur visible, et une seule entrée', () => {
    for (let s = 1; s <= 20; s++) {
      const lots = frontLots(1440, 340, s);
      const slots = shopSlotsFor(1440, 340, s);
      const doors = doorsFor(1440, 340, s);
      for (const l of lots.filter((x) => x.podium)) {
        const lo = Math.max(l.x, 0), hi = Math.min(l.x + l.w, 1440);
        const inLot = slots.filter((sl) => sl.x >= lo - 1e-9 && sl.x + sl.w <= hi + 1e-9);
        const doorsIn = doors.filter((d) => d.x >= lo && d.x + 12 <= hi);
        expect(inLot.length).toBe(hi - lo >= 38 ? 1 : 0);
        expect(doorsIn.length).toBeLessThanOrEqual(1);
        if (inLot.length) expect(inLot[0]!.w).toBeGreaterThan(hi - lo - 12 - 2 * 4 - 2 - 1e-9 - 0.1);
      }
    }
  });
  it('agrandit les vitrines (moyenne > 30 u sur 30 villes)', () => {
    let n = 0, sum = 0;
    for (let s = 1; s <= 30; s++) for (const sl of shopSlotsFor(2000, 340, s)) { n++; sum += sl.w; }
    expect(sum / n).toBeGreaterThan(30);
  });
});
```

Dans `city-shops-slots.test.ts`, remplacer le 1er test (ratio 0,5-0,7 par immeuble) par : « presque tous les lots visibles ont un local » :

```ts
  it('donne un local à presque tous les lots du premier plan (lots de 40 u et plus)', () => {
    let lots = 0;
    let shops = 0;
    for (let seed = 1; seed <= 40; seed++) {
      lots += frontLots(1440, 340, seed).length;
      shops += shopSlotsFor(1440, 340, seed).length;
    }
    expect(shops / lots).toBeGreaterThan(0.9);
  });
```

(importer `frontLots`). Dans `city-doors.test.ts`, adapter toute attente « une entrée par immeuble » en « une entrée par lot » (lire le fichier ; remplacer les filtres `citySkyline(...).filter(!far)` par `frontLots(...)`).

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/core/library/city-lots.test.ts tests/core/library/city-shops-slots.test.ts tests/core/library/city-doors.test.ts` → FAIL.

- [ ] **Step 3: Implémenter** — `src/core/library/city/lots.ts` :

```ts
import { citySkyline, type Building, type Podium } from '../scene-world';

// Lot du premier plan : un immeuble simple, ou les deux tours d'un jumeau et leur socle commun (un seul local, une entrée).
export type FrontLot = { x: number; w: number; podium: Podium | null; towers: Building[] };

export function frontLots(width: number, height: number, seed: number): FrontLot[] {
  const out: FrontLot[] = [];
  for (const b of citySkyline(width, height, seed)) {
    if (b.far) continue;
    const last = out.at(-1);
    if (b.podium && last?.podium === b.podium) {
      last.towers.push(b);
      continue;
    }
    out.push(b.podium ? { x: b.podium.x, w: b.podium.w, podium: b.podium, towers: [b] } : { x: b.x, w: b.w, podium: null, towers: [b] });
  }
  return out.filter((l) => l.x + l.w > 0 && l.x < width);
}
```

`shops/slots.ts` — boucle sur les lots :

```ts
import { hashString, mulberry32 } from '../../scene-world';
import { frontLots } from '../lots';
...
  for (const b of frontLots(width, height, seed)) {
    const side: 'left' | 'right' = rng() < 0.5 ? 'left' : 'right';
    const lo = Math.max(b.x, 0);
    ... (reste inchangé)
```

Mettre à jour le commentaire d'en-tête (« lots du premier plan … »).

`doors.ts` — même remplacement : `for (const b of frontLots(width, height, seed))` (supprimer le test `b.far` et la condition de visibilité, déjà filtrés), commentaire « Une entrée par lot du premier plan visible ».

- [ ] **Step 4: Vérifier** — `npx vitest run tests/core/library` → PASS (corriger les autres tests de `city-*` qui comptaient des immeubles : `city-event-place`, `club-walks`, `customers` si besoin, en raisonnant par lot).

- [ ] **Step 5: Commit**

```bash
git add src/core/library/city tests/core/library
git commit -m "feat(bibliotheque): locaux et entrées par lot — un grand local par jumeau"
```

---

### Task 4: Plan de peinture — socles, silhouette, tuiles

**Files:**
- Modify: `src/core/library/paint/city-plan.ts`, `src/core/library/paint/city-painter.ts:34-60`
- Test: `tests/core/library/paint/paint-city-plan.test.ts`

**Interfaces:**
- Consumes: `Facade.podium`, `podiumWindows`.
- Produces: `export type PaintPodium = { id: number; x: number; w: number; top: number; stone: Rgb; wins: Win[] }` ; `CityPaintPlan.podiums: PaintPodium[]` ; `TileItems.podiums: PaintPodium[]` ; `PaintBuilding.podiumTop: number | null` (haut du socle sous la tour, sinon null).

- [ ] **Step 1: Tests qui échouent**

```ts
  it('liste un socle par jumeau et la silhouette le couvre (même dans le retrait entre les tours)', () => {
    const plan = cityPaintPlan(1440, 340, 4);
    const twins = plan.buildings.filter((b) => b.podiumTop !== null);
    expect(plan.podiums.length * 2).toBe(twins.length);
    for (const p of plan.podiums) {
      for (let x = p.x + 0.5; x < p.x + p.w; x += 2) expect(silhouetteTop(plan, x)).toBeLessThanOrEqual(p.top);
      expect(p.wins.length).toBeGreaterThan(0);
    }
  });
  it('ne pose pas d\'arbre dont la couronne descend devant un socle', () => {
    for (let s = 1; s <= 20; s++) {
      const plan = cityPaintPlan(1440, 340, s);
      for (const t of plan.trees) for (const p of plan.podiums) {
        if (t.x + t.r > p.x && t.x - t.r < p.x + p.w) expect(t.cy + t.r).toBeLessThanOrEqual(p.top);
      }
    }
  });
  it('range les socles dans les tuiles qu\'ils touchent', () => {
    const plan = cityPaintPlan(1440, 340, 4);
    const p = plan.podiums[0]!;
    const tile = Math.floor((p.x + p.w / 2) / TILE);
    expect(tileItems(plan, tile).podiums).toContain(p);
  });
```

(importer `TILE`, `tileItems` depuis `city-painter` comme les tests voisins.)

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/core/library/paint/paint-city-plan.test.ts` → FAIL.

- [ ] **Step 3: Implémenter**

Dans `city-plan.ts` :

```ts
export type PaintBuilding = { id: number; x: number; w: number; top: number; far: boolean; wins: Win[]; look: Look; podiumTop: number | null };
// Socle commun des jumeaux (pierre claire), peint après les tours ; ses fenêtres sont celles de `podiumWindows`.
export type PaintPodium = { id: number; x: number; w: number; top: number; stone: Rgb; wins: Win[] };
const STONES = ['#EDE2C8', '#E8DCC0', '#F0E6D0', '#E4D6BA'].map(hexRgb);
```

`CityPaintPlan` gagne `podiums: PaintPodium[]`. Dans `cityPaintPlan` :

```ts
    const podiumTop = f.podium ? m.ground - f.podium.h : null;
    const lamps = podiumTop === null ? f.lamps : f.lamps.filter((l) => l.y + LAMP.h <= podiumTop);
    ... wins depuis `lamps` (au lieu de f.lamps) ...
    return { id, x: f.x, w: f.w, top, far: f.far, wins, look, podiumTop };
  });
  const podiums: PaintPodium[] = [];
  for (const f of facades) {
    if (!f.podium || f.x !== f.podium.x) continue;
    const p = f.podium;
    const rng = mulberry32(seed ^ hashString('ghibli-podium') ^ Math.round(p.x * 8));
    const wins = podiumWindows(p, m.ground, seed).map((l) => ({ x: l.x, y: l.y, w: LAMP.w, h: LAMP.h, dormer: false, curtain: rng() < 0.4 }));
    podiums.push({ id: p.id, x: p.x, w: p.w, top: m.ground - p.h, stone: STONES[Math.floor(rng() * STONES.length)]!, wins });
  }
```

`silhouetteTop` prend `Pick<CityPaintPlan, 'buildings' | 'ground' | 'podiums'>` et ajoute `for (const p of plan.podiums) if (x >= p.x && x <= p.x + p.w) top = Math.min(top, p.top);` ; passer `podiums` dans `base`. Les arbres testent déjà la silhouette sur toute la couronne, ce qui suffit pour le test du retrait. Ajouter `podiums` au `return`.

Dans `city-painter.ts` : `TileItems` gagne `podiums`, `tileItems` filtre `plan.podiums.filter((p) => p.x < x1 && p.x + p.w > x0)`, `tileKey` ajoute `it.podiums.map((p) => p.x.toFixed(1)).join(',')`. Dans `paintCityTile`, après la boucle des immeubles du premier plan : `for (const p of it.podiums) paintPodium(ctx, plan, p);` avec une **première version minimale** (aplat + trait) que Task 5 remplace :

```ts
export function paintPodium(ctx: PaintCtx, plan: CityPaintPlan, p: PaintPodium): void {
  fillRect(ctx, p.stone, p.x, p.top, p.w, plan.ground - p.top);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.9;
  ctx.strokeRect(p.x, p.top, p.w, plan.ground - p.top);
}
```

- [ ] **Step 4: Vérifier** — `npx vitest run tests/core/library/paint` puis `npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/paint tests/core/library/paint
git commit -m "feat(bibliotheque): plan de peinture — socles des jumeaux, silhouette et tuiles"
```

---

### Task 5: Peinture Ghibli du socle, des mitoyens et des grandes vitrines (VISUEL — Fable)

**À confier à Fable** (sous-agent `model: fable`) ; si Fable est indisponible, Opus le fait ET ajoute une ligne « Fable n'est pas passé » dans `docs/superpowers/notes/2026-10-11-visuels-sans-fable.md`.

**Files:**
- Modify: `src/core/library/paint/city-painter.ts` (`paintPodium`, `paintBuilding`), `src/core/library/paint/shop/facade.ts` (vitrine), `src/content/scene-city.tsx` (rendu de secours), `src/content/city-life.tsx:450-451` (silhouettes des masques)
- Test: `tests/core/library/paint/` (test de non-régression du peintre existant), captures

**Interfaces:**
- Consumes: `PaintPodium`, `PaintBuilding.podiumTop`, `TileItems.podiums`.

- [ ] **Step 1: Test qui échoue** — dans le test du peintre de la ville (chercher `paintCityTile` dans `tests/core/library/paint/`), ajouter un test qui peint la tuile d'un socle avec le contexte espion déjà utilisé par ces tests et vérifie qu'un tracé de corniche dépasse le socle de 1,5 u de chaque côté :

```ts
  it('peint la corniche du socle en débord', () => {
    const plan = cityPaintPlan(1440, 340, 4);
    const p = plan.podiums[0]!;
    const rects = spyRects(() => paintPodium(ctxSpy, plan, p)); // reprendre l'espion du fichier
    expect(rects.some((r) => r.x <= p.x - 1.5 && r.x + r.w >= p.x + p.w + 1.5)).toBe(true);
  });
```

(adapter `spyRects`/`ctxSpy` aux utilitaires réellement présents dans le fichier de test.)

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/core/library/paint` → FAIL.

- [ ] **Step 3: Implémenter (Fable)** — se caler sur la maquette `docs/superpowers/maquettes/batiments-larges/rue.html` (fonctions du socle et des jonctions) :
  - `paintPodium` : aplat `stone`, assises horizontales fines (shade 0.1), bande d'ombre droite 28 % (`shade(stone, 0.28)`), rehaut gauche 1,6 u (`light(stone, 0.45)`), **corniche** de 3 u de haut en débord de 1,5 u de chaque côté à `p.top` (rehaut dessus, ombre nette `shade(stone, 0.42)` de 2,5 u dessous), fenêtres `p.wins` encadrées (appui + linteau en pierre plus claire, vitre GLASS du peintre, rideaux si `curtain`), salissure du pied 3 u, trait INK 0,9 autour.
  - `paintBuilding` : si `b.podiumTop !== null`, ne pas peindre la salissure de pied (elle serait sous le socle) ; si l'immeuble voisin de gauche le touche (`left && left.x + left.w >= b.x - 0.5`), tracer un trait INK de 1,3 de `max(b.top, left.top) + roofH` jusqu'au sol à `x = b.x`.
  - `shop/facade.ts` : vitre (`glass`) de plus de 30 u → montants verticaux du cadre de la famille, environ tous les 12 u (`n = Math.round(glass.w / 12)`), 0,8 u de large, trait INK 0,3.
  - `scene-city.tsx` (rendu non peint) : un `<rect>` par socle (couleur du mur de la 1re tour), dessiné après les immeubles du premier plan.
  - `city-life.tsx` : `silhouette` ajoute un rect par socle (`f.podium`) pour que la grue reste derrière le socle.

- [ ] **Step 4: Vérifier** — `npx vitest run` (toute la suite) et `npm run typecheck` → PASS. Captures (banc de capture G4a : script `g4cap.mjs` du dossier `.superpowers`, ou à défaut Chrome sans tête sur `npm run dev`) : rue entière à midi, zoom sur un jumeau et un mitoyen, nuit (fenêtres du socle allumées). Les enregistrer dans `.superpowers/captures-immeubles-larges/`.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/paint src/content/scene-city.tsx src/content/city-life.tsx tests/core/library/paint docs/superpowers/notes
git commit -m "feat(bibliotheque): socle Ghibli des jumeaux, jonction des mitoyens, montants des grandes vitrines"
```

---

### Task 6: Baie vitrée

**Files:**
- Modify: `src/core/library/furniture-catalog.ts:109`, `src/content/window-art.tsx:9,50-51,80-82`
- Test: `tests/core/library/room-grid-window.test.ts`, `tests/content/window-art.test.tsx` (créer s'il n'existe pas ; sinon compléter)

**Interfaces:**
- Produces: `WINDOW_MAX = { w: 24, h: 12 }` ; `glassRect(rect)` : vitre jusqu'à 2 px du bas quand le cadre touche le bas du mur.

- [ ] **Step 1: Tests qui échouent** — `room-grid-window.test.ts` : ligne 13 → `expect(WINDOW_MAX).toEqual({ w: 24, h: 12 });` ; lignes 38-39 → `resizeWindow(..., 25, 5)` et `(..., 6, 13)` nuls ; ajouter :

```ts
  it('accepte une baie vitrée de toute la hauteur du mur', () => {
    const big = { ...win(), col: 0, row: 0 };
    expect(resizeWindow([big], 30, 'w1', 24, 12)).not.toBeNull();
  });
```

(adapter `win()` / `COLS` aux helpers du fichier ; `COLS` doit être ≥ 24.) Test de la vitre :

```ts
import { glassRect } from '../../src/content/window-art';
import { CELL_H, WALL_ROWS } from '../../src/core/library/room-grid';
it('descend la vitre d\'une baie jusqu\'au bas du mur', () => {
  const wallH = WALL_ROWS * CELL_H;
  const g = glassRect({ x: 0, y: 0, w: 300, h: wallH });
  expect(g.y + g.h).toBeGreaterThanOrEqual(wallH - 2);
  const small = glassRect({ x: 0, y: 30, w: 120, h: 150 });
  expect(small.y + small.h).toBe(30 + 150 - 7);
});
```

- [ ] **Step 2: Vérifier l'échec** — `npx vitest run tests/core/library/room-grid-window.test.ts tests/content/window-art.test.tsx` → FAIL.

- [ ] **Step 3: Implémenter**

`furniture-catalog.ts` :
```ts
// Baie vitrée : jusqu'à toute la hauteur du mur (WALL_ROWS = 12, room-grid.ts) et 24 colonnes, bornée par la pièce.
export const WINDOW_MAX = { w: 24, h: 12 } as const;
```

`window-art.tsx` :
```ts
import { CELL_H, WALL_ROWS } from '../core/library/room-grid';
// Une fenêtre qui descend jusqu'au bas du mur (baie vitrée) montre la rue jusqu'au trottoir de devant : pas de traverse basse.
const touchesFloor = (rect: PxRect): boolean => rect.y + rect.h >= WALL_ROWS * CELL_H - 0.5;
export const glassRect = (rect: PxRect): PxRect => {
  const bottom = touchesFloor(rect) ? 2 : GLASS_INSET;
  return { x: rect.x + GLASS_INSET, y: rect.y + GLASS_INSET, w: rect.w - 2 * GLASS_INSET, h: rect.h - GLASS_INSET - bottom };
};
```
Montants : remplacer les deux lignes `bars.push` par :
```ts
  // Montants verticaux tous les ~120 px (un seul au centre jusqu'à 240 px, comme avant) ; traverse seulement hors baie.
  const posts = Math.floor(glass.w / 120);
  for (let k = 1; k <= posts; k++) bars.push(<rect key={`v${k}`} x={glass.x + (glass.w * k) / (posts + 1) - 2} y={glass.y} width={4} height={glass.h} fill={frame} />);
  if (glass.h >= 110 && !touchesFloor(rect)) bars.push(<rect key="h" x={glass.x} y={glass.y + glass.h / 2 - 2} width={glass.w} height={4} fill={frame} />);
```
Cadre : pour `touchesFloor(rect)`, le `rect` de cadre intérieur (`strokeWidth={GLASS_INSET - 1}`) ne doit pas recouvrir le bas : le remplacer, dans ce cas, par un `<path>` en U renversé (haut + côtés) de même trait. Vérifier que l'import room-grid → furniture-catalog ne crée pas de cycle bloquant (room-grid importe déjà furniture-catalog ; window-art est en `content`, pas de cycle).

- [ ] **Step 4: Vérifier** — `npx vitest run` → PASS ; `npm run typecheck` → PASS. Capture : une baie 24 × 12 dans une pièce Ville, trottoir de devant et arrêt de bus entièrement visibles.

- [ ] **Step 5: Commit**

```bash
git add src/core/library/furniture-catalog.ts src/content/window-art.tsx tests
git commit -m "feat(bibliotheque): baie vitrée jusqu'à 24 × 12 — toute la ville visible, trottoir de devant compris"
```

---

### Task 7: Validation et livraison

- [ ] **Step 1:** `npm test`, `npm run typecheck`, `npm run build` → tout vert (copier la sortie).
- [ ] **Step 2:** Captures de validation (rue midi, zoom jumeaux + mitoyen, nuit, baie vitrée) envoyées à l'utilisateur (SendUserFile) ; attendre son accord visuel.
- [ ] **Step 3:** Push, PR vers `main` (description FR, pas de WikiHow), fusion, `npm run preprod`, reconstruire l'extension (`npm run build` dans le dépôt principal après `git pull`).
- [ ] **Step 4:** Mettre à jour la mémoire projet (`project_ghibli.md` ou nouveau fichier « immeubles larges ») : PR, pré-prod, reste vérif. téléphone.
