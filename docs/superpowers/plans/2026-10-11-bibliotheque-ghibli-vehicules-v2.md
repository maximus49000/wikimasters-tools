# Véhicules V2 : générateur et rendu Ghibli des voitures — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal :** des voitures toutes différentes, peintes au trait Ghibli, vivantes. Elles sortent d'un générateur (12 carrosseries, proportions continues, peinture, détails), leurs roues tournent avec la distance parcourue, le pot fume, conducteur et passagers bougent avec l'inertie, la caisse plonge au freinage et les feux stop s'allument.

**Spec :** `docs/superpowers/specs/2026-10-11-bibliotheque-ghibli-vehicules-design.md` (§2, §3, §6 V2, §7). Maquette validée : `Wikimasters tools/.superpowers/brainstorm/vehicules-ghibli/maquette.html` (fonctions `ARCHETYPES`, `genCar`, `carProfile`, `drawGenCar`, `wheelStyled`, `carStream`, `occupantMotion`, `exhaust`/`drawPuffs` : **référence à porter**).

**Architecture :**
- **Pur, testé** (`src/core/library/city/traffic/`) :
  - `cars.ts` : générateur ;
  - `car-art.ts` : profil et plan de peinture en couches (opérations sur des tracés SVG, sans canvas) ;
  - `occupants.ts` : poses des occupants ;
  - `exhaust.ts` : bouffées en pool fixe.
- **Moteur** (`engine.ts`) : chaque voiture porte sa fiche générée (suite partagée par toutes les voies), sa longueur et sa vitesse en dépendent ; tangage et inertie amortis.
- **Rendu** (`src/content/vehicle/`) :
  - `car-host.tsx` : registre de sprites PNG (data URL, comme `figure-host.tsx`), qui exécute le plan de peinture sur canvas, avec plafond et budget par image ;
  - `ghibli-car.tsx` : assemblage SVG d'une voiture et sa pose par la boucle ;
  - `exhaust-puffs.tsx` : cercles réutilisés.
- **Calque** (`traffic-layer.tsx`) : en Ghibli, les voitures passent à `GhibliCar`. En classique, `VehicleSprite` dessine la voiture à la longueur générée. Les autres genres (camionnette, bus, événements, vélos) restent inchangés jusqu'à V3.

**Écart à la spec, voulu :** la spec ordonnait « caisse, `<svg>` rogné, vitrage ». Le vitrage est un trapèze, et un `<svg>` imbriqué ne rogne qu'à un rectangle : les occupants auraient dépassé sur les montants. L'ordre retenu est donc :
1. habitacle sombre ;
2. occupants (dans un `<svg>` imbriqué au rectangle englobant des vitres) ;
3. caisse **percée aux vitres** (`destination-out` à la peinture) ;
4. vitrage translucide ;
5. roues ;
6. jupes ;
7. feux.

La caisse recouvre ce qui dépasse, sans `clipPath`.

## Global Constraints

- Worktree `C:\Users\maxim\Downloads\Wikimasters-ghibli`, branche `feat/bibliotheque-ghibli-voitures` (partie de `origin/main` f3c4751).
- Modules `core` purs : pas de `Math.random` ni de `Date.now`, graine et temps en argument (`mulberry32`, `hashString` de `scene-world`).
- Couche des acteurs recopiée par `<use>` dans les fenêtres : **aucun id fixe, aucun `clipPath`, aucun filtre à id**. Pour rogner, un `<svg>` imbriqué.
- Data URL seulement : la CSP du site refuse `blob:`. Canvas `willReadFrequently: true`. Sous jsdom, pas de canvas : on utilise `BLANK_SPRITE`.
- La boucle n'écrit que des attributs (`transform`, `href`, `opacity`, `cx`/`cy`/`r`). Aucune création de nœud par image.
- Mouvement réduit : instantané immobile, sans fumée.
- Style : trait d'encre `#33241f`, ombre `shade(c) = mix(mix(c,'#4a3a6a',0.32),'#000',0.06)`, lumière en haut à gauche (partie éclairée décalée de (−0,6 ; −0,8)), liseré `mix(c,'#fff6e0',0.18)` à 55 %, ombre au sol `#3a2f5a` à 30 %.
- Nuit : couleurs passées par `tone(c, sky)` avec `daylight` arrondi au 1/8 (comme `figurePalette`) ; vitres chaudes la nuit (`rgba(243,213,138,0.5)`), sans reflet.
- Pas de mesures sur téléphone, pas de fiche WikiHow (consignes de 2026-10-11). Commentaires en français, style dense du dépôt. `npm run typecheck` et les tests du domaine avant chaque commit.

## Review Focus

1. **Voie du fond, retournée en miroir** (`scale(-k, k)`). La lumière doit rester en haut à gauche, sans texte à l'envers. Les sprites de caisse sont donc peints **deux fois** (regard vers +x et vers −x, clé `dir`), et le groupe de la voie du fond n'est pas retourné pour une voiture Ghibli. Les occupants sont tournés vers la gauche (yaw 8 au lieu de 0). Test : la `transform` d'une voiture Ghibli de la voie `far` a une échelle x positive, et l'image de caisse porte `dir=-1`.
2. **Changement de jour/nuit pendant qu'une voiture est à l'écran.** La palette change par paliers d'un huitième. Tant que le nouveau sprite n'est pas peint, l'image courante est gardée, jamais de `href` vide. Test sur le registre : `request` d'une nouvelle clé rend `null`, et l'ancienne image reste posée.
3. **Ouverture à chaud avec 20 voitures.** Le budget par image ne doit pas laisser de voiture invisible : une **première** apparition est peinte tout de suite (`ensure`), comme `GhibliFigure`. Test : une voiture montée en jsdom a toujours un `href` sur sa caisse.
4. **Cabriolet et pick-up.** Le cabriolet n'a pas de toit (occupants au-dessus de la ceinture, rien de rogné en haut), le pick-up a un plateau sans vitre arrière. Test : pour les 12 types, les sièges sont dans le rectangle englobant des vitres (sauf cabriolet : au-dessus de la ceinture), et la silhouette est fermée sans auto-intersection.
5. **Valeurs aberrantes du moteur.** Après un rattrapage de 120 s (onglet en arrière-plan), le tangage et l'inertie doivent rester finis et bornés. Test : dans le moteur, `pitch` est dans ±0,06 rad et `lean` dans ±1,5, sur 30 min simulées.

---

### Tâche 1 : générateur de voitures (`cars.ts`)

**Files :**
- Create: `src/core/library/city/traffic/cars.ts`
- Test: `tests/core/library/city/traffic/cars.test.ts`

**Interfaces :**
- Produces :
  - `type CarArch = 'berline'|'citadine'|'compacte'|'break'|'coupé'|'cabriolet'|'monospace'|'4x4'|'pick-up'|'limousine'|'bulle'|'sport'`
  - `type CarBack = 'trunk'|'hatch'|'wagon'|'fast'|'pickup'|'open'`
  - `type Rim = 'enjoliveur'|'rayons'|'tôle'|'flancs blancs'|'alliage'`
  - `type CarSpec = { arch: CarArch; back: CarBack; L: number; H: number; belt: number; round: number; wheelR: number; clear: number; hood: number; trunk: number; ws: number; rs: number; body: string; twoTone: string|null; stripe: string|null; rim: Rim; rimColor: string; chrome: boolean; lamp: 'rond'|'carré'; rack: boolean; spare: boolean; sunroof: boolean; antenna: boolean; skirts: boolean; hue: number; seed: number; occupants: Occupant[] }`
  - `type Occupant = { role: 'driver'|'front'|'rear'; child: boolean; outfitSeed: number }`
  - `ARCHETYPES: Record<CarArch, Arch>`, `ARCH_NAMES: readonly CarArch[]`, `type Arch` (plages et `win`, `back`)
  - `genCar(seed: number, arch: CarArch, hue: number): CarSpec`
  - `type CarStream = { n: number; recent: CarArch[]; rng: () => number; seed: number }`, `carStream(seed: number): CarStream`, `nextCar(s: CarStream): CarSpec`
  - `carSpeedFactor(arch: CarArch): number` (sport 1,12, coupé 1,06, 4x4 et pick-up 0,9, bulle 0,92, limousine 0,95, sinon 1)
  - `hsl(h, s, l): string` (hexadécimal `#rrggbb`)

- [ ] **Étape 1 : écrire les tests qui échouent**

```ts
import { describe, expect, it } from 'vitest';
import { ARCHETYPES, ARCH_NAMES, carStream, genCar, nextCar } from '../../../../../src/core/library/city/traffic/cars';

const hueDist = (a: number, b: number): number => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };

describe('générateur de voitures', () => {
  it('12 types, proportions dans les plages, déterministe', () => {
    expect(ARCH_NAMES).toHaveLength(12);
    for (const arch of ARCH_NAMES) for (let i = 0; i < 40; i++) {
      const c = genCar(i * 31 + 7, arch, (i * 0.37) % 1);
      const A = ARCHETYPES[arch];
      expect(c.L).toBeGreaterThanOrEqual(A.L[0]); expect(c.L).toBeLessThanOrEqual(A.L[1]);
      expect(c.H).toBeGreaterThanOrEqual(A.H[0]); expect(c.H).toBeLessThanOrEqual(A.H[1]);
      expect(c.belt).toBeLessThan(c.H);
      expect(c.wheelR).toBeGreaterThanOrEqual(A.wheel[0]);
      expect(c.body).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.occupants[0]!.role).toBe('driver');
      expect(c.occupants.length).toBeLessThanOrEqual(3);
    }
    expect(genCar(5, 'berline', 0.2)).toEqual(genCar(5, 'berline', 0.2));
  });
  it('suite : 10 voitures consécutives sans type répété, teintes à plus de 0,08 tour deux à deux', () => {
    for (const seed of [1, 2, 99]) {
      const s = carStream(seed);
      const cars = Array.from({ length: 60 }, () => nextCar(s));
      for (let i = 0; i + 10 <= cars.length; i++) {
        const win = cars.slice(i, i + 10);
        expect(new Set(win.map((c) => c.arch)).size).toBe(10);
        for (let p = 0; p < 10; p++) for (let q = p + 1; q < 10; q++) expect(hueDist(win[p]!.hue, win[q]!.hue)).toBeGreaterThan(0.08);
      }
    }
  });
  it('cabriolet sans toit bicolore ; galerie et roue de secours seulement sur les types prévus', () => {
    for (let i = 0; i < 200; i++) {
      const arch = ARCH_NAMES[i % 12]!;
      const c = genCar(i, arch, 0.5);
      if (arch === 'cabriolet') expect(c.twoTone).toBeNull();
      if (c.rack) expect(['break', '4x4', 'monospace', 'compacte']).toContain(arch);
      if (c.spare) expect(arch).toBe('4x4');
    }
  });
});
```

Note sur les teintes : le nombre d'or de la maquette ne suffit pas. Sur 10 termes consécutifs de `n·0,618 mod 1`, le plus petit écart vaut φ⁻⁶ ≈ 0,056, sous le seuil de 0,08 de la spec. La teinte est donc tirée par **cases** :
- 10 cases de 0,1 tour ;
- la case est choisie, comme le type, parmi celles absentes des 9 dernières ;
- `hue = (décalage de la suite + case·0,1 + jitter) mod 1`, avec `jitter ∈ [0 ; 0,015]`.

Deux teintes d'une fenêtre de 10 sont alors à au moins 0,085.

- [ ] **Étape 2 : lancer et vérifier l'échec.** `npx vitest run tests/core/library/city/traffic/cars.test.ts`. Attendu : FAIL, module introuvable.

- [ ] **Étape 3 : implémenter**, en portant la maquette (lignes 517-567 et 680-693) :
  - `ARCHETYPES` : mêmes plages que la maquette, avec `win` et `back` ;
  - `genCar` : mêmes tirages, dans le même ordre ;
  - `hsl` : celui de la maquette ;
  - `rng` : `mulberry32` de `scene-world` ;
  - `carStream` : la fenêtre « sans répétition » vaut **10**, pas `min(10, 12 − 2)` comme dans la maquette, car la spec exige 10 types distincts sur 10. Le tirage se fait dans les 12 − |récents| types restants, et l'historique garde les 9 derniers types : la fenêtre de 10 consécutifs n'a donc aucun doublon.
  - Teintes : par cases (voir la note de l'étape 1). `CarStream` gagne `slots: number[]` (9 dernières cases) et `off` (décalage tiré une fois).

  Ajouts propres au dépôt :

```ts
// Occupants : conducteur toujours ; passager avant (45 %) ; à l'arrière un enfant (25 %) ou un adulte (12 %), seulement
// si la voiture a au moins 2 vitres latérales ; cabriolet et coupé : au plus un passager avant ; sport : conducteur seul (60 %).
function occupantsOf(r: () => number, arch: CarArch, seed: number): Occupant[] {
  const out: Occupant[] = [{ role: 'driver', child: false, outfitSeed: (seed ^ 0xd17e) >>> 0 }];
  const front = arch === 'sport' ? r() < 0.4 : r() < 0.45;
  if (front) out.push({ role: 'front', child: false, outfitSeed: (seed ^ 0xf0e7) >>> 0 });
  if (ARCHETYPES[arch].win >= 2 && arch !== 'coupé') {
    const x = r();
    if (x < 0.25) out.push({ role: 'rear', child: true, outfitSeed: (seed ^ 0xc41d) >>> 0 });
    else if (x < 0.37) out.push({ role: 'rear', child: false, outfitSeed: (seed ^ 0xbac4) >>> 0 });
  }
  return out;
}
export const carSpeedFactor = (arch: CarArch): number => ({ sport: 1.12, 'coupé': 1.06, '4x4': 0.9, 'pick-up': 0.9, bulle: 0.92, limousine: 0.95 } as Partial<Record<CarArch, number>>)[arch] ?? 1;
```

  `genCar` tire les occupants **après** tous les tirages de la maquette, pour que les proportions restent celles de la planche validée. `hue` est stocké dans la fiche.

- [ ] **Étape 4 : lancer, vérifier le succès.** Même commande. Attendu : PASS.
- [ ] **Étape 5 : commit.** `npm run typecheck`, puis `git add` des deux fichiers et `git commit -m "feat(bibliotheque): générateur de voitures (12 carrosseries, suite sans répétition)"`.

---

### Tâche 2 : profil et plan de peinture (`car-art.ts`)

**Files :**
- Create: `src/core/library/city/traffic/car-art.ts`
- Test: `tests/core/library/city/traffic/car-art.test.ts`

**Interfaces :**
- Consumes : `CarSpec`, `ARCHETYPES` (tâche 1).
- Produces :
  - `type Op =`
    - `{ k: 'piece'; d: string; color: string; ink?: boolean; ox?: number; oy?: number }`, pièce peinte : ombre, trait, partie éclairée décalée, liseré (`paintPath` de la maquette) ;
    - `| { k: 'fill'; d: string; color: string; alpha?: number }` ;
    - `| { k: 'line'; d: string; color: string; w: number }`, trait aux bouts ronds ;
    - `| { k: 'clipPiece'; clip: string; d: string; color: string }`, pièce rognée à `clip` (toit bicolore) ;
    - `| { k: 'hole'; d: string }`, perce la couche (`destination-out`) ;
    - `| { k: 'glass'; d: string }`, vitre translucide, trait, reflet en biais le jour ;
    - `| { k: 'shadow'; x0: number; x1: number }`, ombre au sol.
  - `type CarArt = { len: number; x0: number; x1: number; top: number; interior: Op[]; body: Op[]; glazing: Op[]; over: Op[]; wheels: { x: number; r: number }[]; cabin: { x: number; y: number; w: number; h: number } | null; seats: Seat[]; wheelHand: { x: number; y: number } | null; tail: { x: number; y: number }; head: { x: number; y: number; round: boolean }; exhaust: { x: number; y: number } }`
  - `type Seat = { role: Occupant['role']; child: boolean; outfitSeed: number; x: number; headY: number; k: number }`. `x` est la position du bassin, `headY` le centre de tête voulu, `k` l'échelle du pantin (adulte 0,45, enfant 0,34).
  - `carArt(c: CarSpec): CarArt` (mémoïsé par `seed|arch`, 512 entrées, vidé au-delà)
  - `carProfile(c: CarSpec)` (exporté pour les tests) : rend `{ d, pts: [number, number][], xWs, xRoofF, xRoofR, xRearTop, yRearTop, yBelt, yRoof, x0, x1, yb, nose, back }`, où `pts` est la polyligne de la silhouette, courbes approchées en 4 segments.
  - `wheelOps(rim: Rim, rimColor: string, r: number): Op[]`, une roue centrée en (0, 0) : pneu, sculptures, jante et écrous, sans le reflet. Le reflet reste fixe et part dans le SVG (tâche 6).

Les couleurs des `Op` sont les couleurs **de jour**. L'exécuteur (tâche 5) leur applique `tone` et `shade`.

- [ ] **Étape 1 : tests qui échouent**

```ts
import { describe, expect, it } from 'vitest';
import { ARCH_NAMES, genCar } from '../../../../../src/core/library/city/traffic/cars';
import { carArt, carProfile, wheelOps } from '../../../../../src/core/library/city/traffic/car-art';

type P = [number, number];
const cross = (a: P, b: P, c: P, d: P): boolean => {
  const o = (p: P, q: P, r: P): number => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};
function selfIntersects(pts: P[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (cross(pts[i]!, pts[(i + 1) % n]!, pts[j]!, pts[(j + 1) % n]!)) return true;
  }
  return false;
}

describe('profil et plan de peinture', () => {
  it('silhouette fermée sans auto-intersection, pour les 12 types et 30 tirages chacun', () => {
    for (const arch of ARCH_NAMES) for (let i = 0; i < 30; i++) {
      const p = carProfile(genCar(i * 13 + 1, arch, 0.3));
      expect(p.d.trim().endsWith('Z')).toBe(true);
      expect(selfIntersects(p.pts)).toBe(false);
      expect(p.yRoof).toBeLessThan(p.yBelt);
    }
  });
  it('couches : caisse percée aux vitres, vitrage, deux roues sous la caisse, sièges dans l’habitacle', () => {
    for (const arch of ARCH_NAMES) for (let i = 0; i < 20; i++) {
      const c = genCar(i * 7 + 3, arch, 0.6);
      const a = carArt(c);
      expect(a.wheels).toHaveLength(2);
      for (const w of a.wheels) { expect(w.x - w.r).toBeGreaterThan(a.x0 - 1); expect(w.x + w.r).toBeLessThan(a.x1 + 1); }
      expect(a.seats.length).toBe(c.occupants.length);
      if (c.back === 'open') {
        expect(a.cabin).toBeNull();
        for (const s of a.seats) expect(s.headY).toBeLessThan(-c.belt);
      } else {
        expect(a.body.some((o) => o.k === 'hole')).toBe(true);
        expect(a.glazing.some((o) => o.k === 'glass')).toBe(true);
        const cb = a.cabin!;
        for (const s of a.seats) {
          expect(s.x).toBeGreaterThan(cb.x - 0.5); expect(s.x).toBeLessThan(cb.x + cb.w + 0.5);
          expect(s.headY).toBeGreaterThan(cb.y); expect(s.headY).toBeLessThan(cb.y + cb.h);
        }
      }
      expect(a.wheelHand).not.toBeNull();
      expect(a.tail.x).toBeLessThan(0); expect(a.head.x).toBeGreaterThan(0);
      expect(a.exhaust.x).toBeLessThan(a.x0 + 2);
    }
  });
  it('roues : une opération par style, déterministes, mémo', () => {
    for (const rim of ['enjoliveur', 'rayons', 'tôle', 'flancs blancs', 'alliage'] as const) expect(wheelOps(rim, '#d9d6cf', 4).length).toBeGreaterThan(2);
    const c = genCar(4, 'break', 0.1);
    expect(carArt(c)).toBe(carArt(c));
  });
});
```

- [ ] **Étape 2 : lancer, vérifier l'échec** (module introuvable).
- [ ] **Étape 3 : implémenter.** C'est un portage de `carProfile` (maquette l. 570-598) et de `drawGenCar` (l. 600-658) en **listes d'opérations**, sans dessiner :
  - `pts` : construire la silhouette à partir des mêmes sommets que `d`. Chaque `Q` est approché par 4 points de la courbe quadratique, ce qui sert au test d'auto-intersection.
  - **Habitacle** (`interior`) : `{ k:'fill', d: greenhouse, color:'#3a3040' }`, où `greenhouse` est le quadrilatère de la maquette (l. 612). `cabin` est le rectangle englobant de `greenhouse`. Cabriolet : `interior = []` et `cabin = null`.
  - **Caisse** (`body`), dans l'ordre :
    - `shadow` ;
    - `piece` de la silhouette ;
    - toit bicolore en `clipPiece` (clip = silhouette, rectangle du toit à la ceinture, puis `line` de la silhouette en encre 1,1) ;
    - `hole` de la `greenhouse`, ce qui perce les vitres ;
    - montants (`line` de 2 en encre, puis de 1 en couleur de caisse ou de toit) ;
    - plateau du pick-up (ligne et caisse de chargement) ;
    - portes et poignées (`line`) ;
    - liseré `stripe` ;
    - arches de roues (`fill` `#2b2522`) ;
    - pare-chocs (`piece`) ;
    - phare carré (`fill` `#e8e2d0` + trait), le rond étant dessiné en SVG (tâche 6) ;
    - feu arrière (`fill` `#c0392b`, rectangle 1,2 × 2,2) ;
    - galerie avec bagage ;
    - roue de secours (deux `fill`) ;
    - antenne (`line` de 0,35) ;
    - toit ouvrant ;
    - rétroviseur ;
    - pot (`fill` encre, rectangle arrondi 2,6 × 1,1 au point `exhaust`).
  - **Cabriolet** : `body` sans `hole`. `glazing` = le petit pare-brise incliné (l. 631). Les occupants sont dessinés avant la caisse, l'ordre des couches s'en charge.
  - **Vitrage** (`glazing`) : `{ k:'glass', d: greenhouse }`.
  - **Jupes** (`over`) : si `skirts`, la demi-ellipse sur la roue arrière (l. 643), sinon `[]`.
  - **Roues** : `wb = L/2 − max(wheelR + 2,6 ; 0,16·L)`, `wheels = [{x:−wb, r}, {x:wb, r}]` (centre à y = −r).
  - **Sièges** :
    - conducteur à `xDrv` (l. 609), avec `headY = yRoof + (yBelt − yRoof)·0,52` ;
    - passager avant à `xDrv − 9`, si `xRoofF − xRoofR > 14`, sinon il prend la place arrière ;
    - arrière à `xDrv − 17`, borné à `cabin.x + 3` ;
    - `headY` des enfants `+ 1,6` ;
    - cabriolet : `headY = yBelt − 4,2` ;
    - la fiche d'un occupant qui ne trouve pas de place est **retirée** des sièges, et `carArt` garde l'égalité `seats.length === occupants.length` en réduisant `occupants` dans la fiche mémo. Plus simple : `genCar` ne crée l'arrière que si `win ≥ 2`, et le test vérifie l'égalité.
  - **Repères** :
    - `wheelHand = { x: xDrv + 3,4, y: headY + 4,2 }`, le volant ;
    - `tail = { x: x0 + 0,2, y: yTail + 2,3 }` ;
    - `head = { x: x1 − 1, y: nose + 1,8, round: lamp === 'rond' }` ;
    - `exhaust = { x: x0 + 0,6, y: −clear − 0,2 }`.
  - `top` est le point le plus haut (antenne et galerie comprises), pour le cadre du sprite.
  - `wheelOps` : portage de `wheelStyled` (l. 661-677) avec un angle nul, centre (0, 0), **sans** le reflet blanc :
    - pneu : `fill` du disque `#2b2522`, puis `line` du cercle en encre ;
    - flancs blancs : `line` de largeur `r·0,18` ;
    - 12 sculptures (`line` de largeur `r·0,1` en `#4a403a`) ;
    - moyeu, rayons (16 `line` de 0,25), branches d'alliage (5 secteurs `fill`), tôle (disque + 6 trous), enjoliveur (disque + 4 écrous) ;
    - axe.

    Les cercles sont écrits en tracés SVG (`M x−r y A r r 0 1 0 x+r y A r r 0 1 0 x−r y Z`).
- [ ] **Étape 4 : lancer, vérifier le succès.** Si un type échoue au test d'auto-intersection (pente de lunette extrême), corriger le profil en bornant `xRoofR ≤ xRoofF − 2` et `xRearTop ≤ xRoofR`, et noter la correction en commentaire.
- [ ] **Étape 5 : commit.** `feat(bibliotheque): profil et plan de peinture des voitures générées`.

---

### Tâche 3 : moteur, avec les fiches de voiture, le tangage et l'inertie

**Files :**
- Modify: `src/core/library/city/traffic/engine.ts`
- Test: `tests/core/library/city/traffic/engine.test.ts` (ajouts)

**Interfaces :**
- Consumes : `carStream`, `nextCar`, `carSpeedFactor`, `type CarSpec` (tâche 1).
- Produces (ajouts) :
  - `Agent.car?: CarSpec` (seulement pour `kind === 'car'`) ;
  - `Agent.pitch: number` (rad, > 0 quand le nez plonge) ;
  - `Agent.lean: number` (> 0 penché en avant), et leurs valeurs du pas précédent `ppitch` et `plean` ;
  - `TrafficWorld.cars: CarStream` ;
  - `agentView(w, a, nowS)` rend en plus `pitch` et `lean`, interpolés.

- [ ] **Étape 1 : tests qui échouent** (dans `engine.test.ts`)

```ts
describe('voitures générées', () => {
  it('chaque voiture a sa fiche ; 10 voitures d’affilée (toutes voies) sans type répété ; longueur tirée de la fiche', () => {
    const w = world(1080, 5, env(1));
    const cars: Agent[] = [];
    const seen = new Set<string>();
    for (let t = T0; t < T0 + 900 && cars.length < 40; t += 1) {
      advance(w, t, env(1));
      for (const a of w.agents) if (a.kind === 'car' && !seen.has(a.id)) { seen.add(a.id); cars.push(a); }
    }
    cars.sort((p, q) => Number(p.id.slice(3)) - Number(q.id.slice(3)));
    for (const a of cars) {
      expect(a.car).toBeDefined();
      const far = a.track === 'far' ? 0.9 : 1;
      expect(a.half).toBeCloseTo((a.car!.L / 2 + 1) * 0.85 * far, 5);
    }
    for (let i = 0; i + 10 <= cars.length; i++) expect(new Set(cars.slice(i, i + 10).map((a) => a.car!.arch)).size).toBe(10);
  });
  it('tangage et inertie : bornés, finis, nez qui plonge au freinage', () => {
    const w = world(1080, 8, env(1));
    let plunged = false;
    for (let t = T0; t < T0 + 1800; t += 2) {
      advance(w, t, env(1));
      for (const a of w.agents) {
        expect(Number.isFinite(a.pitch) && Number.isFinite(a.lean)).toBe(true);
        expect(Math.abs(a.pitch)).toBeLessThanOrEqual(0.06);
        expect(Math.abs(a.lean)).toBeLessThanOrEqual(1.5);
        if (a.cmd < -20 && a.pitch > 0.01) plunged = true;
      }
    }
    expect(plunged).toBe(true);
  });
});
```

Le test de 10 voitures d'affilée suppose que les voitures sont tirées dans l'ordre de leur `serial`. On l'obtient en tirant la fiche dans `newAgent`, au moment de la création (le `serial` croît). Une voiture tirée puis refusée faute de place ne doit **pas** consommer la suite. Il faut donc créer la fiche après `entryFree`, ce qui est déjà l'ordre de `spawn`.

- [ ] **Étape 2 : lancer, vérifier l'échec** (`a.car` indéfini).
- [ ] **Étape 3 : implémenter** :
  - `createTraffic` : `cars: carStream(o.seed ^ hashString('cars'))`.
  - `newAgent` :
    - si `kind === 'car'` : `car = nextCar(w.cars)`, `scale = 1`, `half = (car.L / 2 + 1) · VEHICLE_SCALE · far · unit` (+1 pour les pare-chocs) et `v0 = KIND_V0.car · unit · h.want · carSpeedFactor(car.arch)`. `color` reste tiré de `COLORS`, ce qui ne change rien pour le classique ;
    - `pitch = lean = ppitch = plean = 0`.
  - Dans `spawn` : le test d'entrée calcule la place avec `KIND_HALF.car · 1,1`, une longueur moyenne. Pour les voitures, on tire la fiche **après** `entryFree` : `entryFree` reçoit une demi-longueur prudente, `(60/2 + 1) · 0,85 · far · unit`. On garde ainsi la règle qu'aucune fiche n'est consommée sans voiture.
  - Dans `stepOnce`, après la mise à jour de `cmd` :

```ts
      // Tangage amorti (nez qui plonge au freinage, arrière qui s'assied à l'accélération) et inertie des occupants, plus
      // lente que la caisse ; bornés (rattrapage après un onglet en arrière-plan).
      me.ppitch = me.pitch;
      me.plean = me.lean;
      const acc = me.v <= 0 && me.cmd < 0 ? 0 : me.cmd / u;
      me.pitch = clamp(me.pitch + (-acc * 0.0006 - me.pitch) * Math.min(1, DT * 6), -0.06, 0.06);
      me.lean = clamp(me.lean + (-acc * 0.03 - me.lean) * Math.min(1, DT * 4), -1.5, 1.5);
```

  Le signe : au freinage (`acc < 0`), `pitch > 0`. Le nez plonge : rotation horaire dans le repère SVG, regard vers +x. Les gains sont repris de la maquette et mis à l'échelle du moteur : `a` y va jusqu'à 38 px/s², contre 9 dans la maquette, d'où 0,006 / 10 et 0,09 / 3.
  - `agentView` : ajouter `pitch: lerp(a.ppitch, a.pitch, f)` et `lean: lerp(a.plean, a.lean, f)`.
- [ ] **Étape 4 : lancer toute la suite du moteur.** `npx vitest run tests/core/library/city/traffic` doit être PASS, chevauchements compris : les longueurs varient maintenant.
- [ ] **Étape 5 : commit.** `feat(bibliotheque): voitures générées dans le moteur, tangage et inertie`.

---

### Tâche 4 : poses des occupants et bouffées d'échappement (purs)

**Files :**
- Create: `src/core/library/city/traffic/occupants.ts`, `src/core/library/city/traffic/exhaust.ts`
- Test: `tests/core/library/city/traffic/occupants.test.ts`, `tests/core/library/city/traffic/exhaust.test.ts`

**Interfaces :**
- Produces :
  - `occupantPose(o: { role: Occupant['role']; seed: number; t: number; v: number; dist: number; lean: number; unit: number }): { head: number; tilt: number; dx: number; dy: number; wheel: number }`, avec :
    - `head` : indice −4…4 de la tête, **quantifié à 4 images par seconde** (`t` arrondi au 1/4 s pour le tirage des regards) ;
    - `tilt` : rad ;
    - `dx` et `dy` : décalage du buste en unités de voiture (inertie + pavés) ;
    - `wheel` : rotation du volant en rad.
  - `type Puff = { x: number; y: number; k: number; born: number; dark: boolean; jitter: number; live: boolean }`
  - `type PuffPool = { puffs: Puff[]; next: number; last: Map<string, number> }`, avec `createPuffs(n = 48): PuffPool`
  - `emitPuffs(pool, src: { id: string; x: number; y: number; k: number; acc: number; v: number; unit: number }, t: number): void`, qui émet au plus une bouffée par appel selon la cadence (accélération > 2·unit : toutes les 0,32·0,45 s, sombre ; v < 0,5·unit : 0,32·1,8 s ; sinon 0,32 s) et réutilise la plus ancienne quand le pool est plein ;
  - `puffView(p: Puff, t: number): { cx: number; cy: number; r: number; alpha: number } | null`, avec une durée de vie de 1,8 s (formules de `drawPuffs`, l. 126-141) et `null` si elle est morte ;
  - `forgetPuffSources(pool, alive: ReadonlySet<string>)`.

- [ ] **Étape 1 : tests qui échouent**

```ts
// occupants.test.ts
import { describe, expect, it } from 'vitest';
import { occupantPose } from '../../../../../src/core/library/city/traffic/occupants';
describe('occupants', () => {
  it('regard devant en roulant ; regards variés à l’arrêt ; tête changée au plus 4 fois par seconde', () => {
    const heads = new Set<number>();
    for (let t = 0; t < 60; t += 0.05) heads.add(occupantPose({ role: 'driver', seed: 3, t, v: 60, dist: t * 60, lean: 0, unit: 1 }).head);
    expect([...heads]).toEqual([0]);
    const still = new Set<number>();
    let changes = 0, prev = 0;
    for (let t = 0; t < 120; t += 0.05) {
      const h = occupantPose({ role: 'driver', seed: 3, t, v: 0, dist: 0, lean: 0, unit: 1 }).head;
      still.add(h); if (h !== prev) changes++; prev = h;
    }
    expect(still.size).toBeGreaterThan(1);
    expect(changes).toBeLessThanOrEqual(120 * 4);
  });
  it('inertie : buste vers l’avant au freinage (lean > 0), pavés seulement en roulant', () => {
    expect(occupantPose({ role: 'front', seed: 1, t: 1, v: 30, dist: 40, lean: 1, unit: 1 }).dx).toBeGreaterThan(0);
    const a = occupantPose({ role: 'front', seed: 1, t: 1, v: 0, dist: 40, lean: 0, unit: 1 });
    expect(a.dx).toBe(0); expect(a.dy).toBe(0);
  });
});
```

```ts
// exhaust.test.ts
import { describe, expect, it } from 'vitest';
import { createPuffs, emitPuffs, puffView } from '../../../../../src/core/library/city/traffic/exhaust';
describe('échappement', () => {
  it('cadence : plus dense à l’accélération qu’au ralenti ; pool fixe ; bouffées qui montent, grossissent et s’effacent', () => {
    const count = (acc: number, v: number): number => {
      const p = createPuffs(400);
      for (let t = 0; t < 10; t += 0.05) emitPuffs(p, { id: 'a', x: 0, y: 0, k: 1, acc, v, unit: 1 }, t);
      return p.puffs.filter((q) => q.live).length;
    };
    expect(count(5, 30)).toBeGreaterThan(count(0, 30));
    expect(count(0, 30)).toBeGreaterThan(count(0, 0));
    const p = createPuffs(8);
    for (let t = 0; t < 20; t += 0.05) emitPuffs(p, { id: 'a', x: 0, y: 0, k: 1, acc: 5, v: 30, unit: 1 }, t);
    expect(p.puffs).toHaveLength(8);
    const q = { x: 0, y: 0, k: 1, born: 0, dark: false, jitter: 0.5, live: true };
    const v0 = puffView(q, 0.1)!, v1 = puffView(q, 1.2)!;
    expect(v1.cy).toBeLessThan(v0.cy); expect(v1.r).toBeGreaterThan(v0.r); expect(v1.alpha).toBeLessThan(v0.alpha);
    expect(puffView(q, 2)).toBeNull();
  });
});
```

- [ ] **Étape 2 : lancer, vérifier l'échec.**
- [ ] **Étape 3 : implémenter.** `occupantPose` est un portage de `occupantMotion` (l. 65-84), avec un tirage déterministe, `s = seed·13,7 + rôle·5,3` et `phase = (tq·(0,18 + frac(s)·0,1) + s) mod 1`, où `tq = floor(t·4)/4` :
  - **conducteur**, à l'arrêt (`v < 1,5·unit`) :
    - si `phase < 0,18`, il se tourne vers la place passager ou l'arrière (`head = 4`, vers le spectateur, puis `head = 3` sur la seconde moitié de la fenêtre) ;
    - si `0,55 < phase < 0,62`, coup d'œil au rétroviseur (`tilt = 0,25`, `head = 1`) ;
    - en roulant, `head = 0` sauf le coup d'œil.
  - **passagers** :
    - `phase < 0,35` : ils regardent devant (`0`) ;
    - `< 0,5` : vers le conducteur ou le spectateur (`2`) ;
    - `> 0,6` : ils parlent (`tilt = sin(t·2 + s)·0,08`, non quantifié : c'est un `transform`) ;
    - entre `0,5` et `0,6` : `head = −2` (dehors).
  - `dx = lean · 0,9` (unités de voiture, lean de ±1,5) ;
  - `dy = sin(dist/unit · 0,13 + rôle)·0,25·min(1, v/(30·unit))`. La distance est en px du monde, d'où la division par `unit` ; la fréquence est réduite d'un facteur 10 par rapport à la maquette, dont les unités sont 10 fois plus petites.
  - `wheel = sin(t·0,9 + s)·0,15·min(1, v/(20·unit))`.
  - `exhaust.ts` porte `exhaust`/`drawPuffs` (l. 117-141) :
    - la dernière émission est gardée par source (`last`) ;
    - la vue rend `cx = x − age·6·k − jitter·k`, `cy = y − age·4·k − sin(age·6 + jitter·3)·0,5·k`, `r = (0,7 + age·2,8)·k`, `alpha = 0,5·(1 − age)²`, où `age = (t − born)/1,8` ;
    - `jitter` est tiré par `mulberry32(hashString(id) ^ compteur)`, pas par `Math.random`.
- [ ] **Étape 4 : lancer, vérifier le succès.**
- [ ] **Étape 5 : commit.** `feat(bibliotheque): poses des occupants et bouffées d'échappement`.

---

### Tâche 5 : registre de sprites des voitures (`car-host.tsx`)

**Files :**
- Create: `src/content/vehicle/car-host.tsx`
- Test: `tests/content/vehicle/car-host.test.tsx`

**Interfaces :**
- Consumes : `carArt`, `wheelOps`, `type Op`, `type CarArt` (tâche 2) ; `tone` (`../city-sprites`) ; `mixHex` (`../../core/library/sky`) ; `BLANK_SPRITE` (`../figure/figure-host`).
- Produces :
  - `CAR_PX = 3` (px par unité) ;
  - `type CarLayer = 'interior' | 'body' | 'glazing' | 'over'` ;
  - `type Lit = { day: number; dir: 1 | -1; night: boolean }`, où `day` est le jour quantifié au 1/8 et `night` vaut `day < 0,5` (vitres chaudes) ;
  - `litOf(sky: Sky): { day: number; night: boolean }` ;
  - `layerBox(art: CarArt): { x: number; y: number; w: number; h: number }`, le cadre commun aux couches, marge de 3 unités ;
  - `class CarRegistry { constructor(label: string, opts?: { max?: number; perFrame?: number }); ensure(k: string, paint: () => string): string; request(k: string, paint: () => string): string | null; flush(): void; size(): number }`, une clé par couche, avec le même LRU, le même budget (6 par image) et le même jet des demandes vieilles de plus de 2 images que `FigureRegistry` (le code est **recopié et simplifié**, sans palette ni détenteurs : les clés affichées sont rafraîchies à chaque `request`, et le plafond est de 600) ;
  - `layerKey(c: CarSpec, layer: CarLayer, lit: Lit): string` (= `${c.seed}|${c.arch}|${layer}|${lit.day}|${lit.dir}|${lit.night ? 'n' : 'd'}`) ;
  - `wheelKey(rim, rimColor, r, day): string` ;
  - `paintLayer(art: CarArt, layer: CarLayer, lit: Lit): string` (data URL ; `BLANK_SPRITE` sans canvas) ;
  - `paintWheel(rim, rimColor, r, day): string` ;
  - `useCarRegistry(): CarRegistry` (contexte `CarContext` + repli partagé, comme `useFigureRegistry`).

- [ ] **Étape 1 : tests qui échouent** (jsdom)

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BLANK_SPRITE } from '../../../src/content/figure/figure-host';
import { CarRegistry, layerKey, litOf, paintLayer } from '../../../src/content/vehicle/car-host';
import { carArt } from '../../../src/core/library/city/traffic/car-art';
import { genCar } from '../../../src/core/library/city/traffic/cars';
import { skyAt, sunTimes } from '../../../src/core/library/sky';

const sky = skyAt(12 * 60, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));
const night = skyAt(23 * 60, sunTimes({ y: 2026, m: 10, d: 9 }, { lat: 48.85, lon: 2.35 }, 120));
describe('registre des voitures', () => {
  it('clés par couche, sens et jour quantifié ; sans canvas : sprite vide', () => {
    const c = genCar(3, 'berline', 0.4);
    const d = { ...litOf(sky), dir: 1 as const };
    expect(layerKey(c, 'body', d)).not.toBe(layerKey(c, 'body', { ...d, dir: -1 }));
    expect(layerKey(c, 'body', d)).not.toBe(layerKey(c, 'body', { ...litOf(night), dir: 1 }));
    expect(litOf(night).night).toBe(true);
    expect(paintLayer(carArt(c), 'body', d)).toBe(BLANK_SPRITE);
  });
  it('budget par image, plafond, demandes abandonnées jetées ; ensure peint tout de suite', () => {
    const r = new CarRegistry('t', { max: 5, perFrame: 2 });
    let painted = 0;
    const p = (): string => { painted++; return BLANK_SPRITE; };
    for (let i = 0; i < 6; i++) expect(r.request(`k${i}`, p)).toBeNull();
    r.flush();
    expect(painted).toBe(2);
    expect(r.ensure('now', p)).toBe(BLANK_SPRITE);
    for (let i = 0; i < 10; i++) r.flush();
    expect(r.size()).toBeLessThanOrEqual(5);
  });
});
```

- [ ] **Étape 2 : lancer, vérifier l'échec.**
- [ ] **Étape 3 : implémenter.**
  - **Exécuteur** `run(ctx, ops, lit)` :
    - `t = (c) => tone(c, { daylight: lit.day } as Sky)` : `tone` ne lit que `daylight`, à vérifier dans `city-sprites.tsx:13` ; l'appeler avec un `Sky` complet et `daylight` remplacé, comme `figurePalette` ;
    - `piece` : `fill(shade(t(color)))`, trait d'encre `t('#33241f')` de 1,1, puis `clip`, `translate(ox ?? -0,6, oy ?? -0,8)`, `fill(t(color))`, `translate(−0,4, −0,6)`, puis le liseré `light(t(color))` de 1,2 à 55 % ;
    - `fill` et `line` : couleurs passées par `t` ;
    - `clipPiece` : `clip(Path2D(clip))`, puis `piece` sans encre ;
    - `hole` : `globalCompositeOperation = 'destination-out'`, `fill`, puis retour à `source-over` ;
    - `glass` : `fill` `rgba(159,195,214,0.5)` le jour, `rgba(243,213,138,0.5)` la nuit, trait encre de 0,9, puis le jour reflet en biais `rgba(255,255,255,0.5)` (l. 297) rogné à la vitre ;
    - `shadow` : ellipse `#3a2f5a` à 30 %, centre `((x0+x1)/2 + 1,5 ; 0,6)`, rayons `((x1−x0)/2 + 2 ; 2,2)`.
  - **Sens** `dir = −1` : le canvas est retourné (`scale(−1, 1)`) **avant** les opérations, puis la lumière est replacée en haut à gauche. Pour cela, `piece` et `glass` sont décalés en x à l'opposé (`ox` → `−ox`), et le reflet en biais est dessiné en miroir. On passe un facteur `sx = dir` à l'exécuteur, qui l'applique aux décalages et au reflet. L'ombre au sol est décalée de `+1,5·dir`.
  - **Cadre** : `layerBox` = `x0 − 3 … x1 + 3` en largeur, `top − 3 … 3` en hauteur. Pour `dir = −1`, le cadre est le miroir (`x = −(x1 + 3)`).
  - `paintLayer` : canvas partagé redimensionné au besoin, `setTransform(CAR_PX, 0, 0, CAR_PX, −box.x·CAR_PX, −box.y·CAR_PX)`, puis `run` et `toDataURL('image/png')`. Sous jsdom, pas d'appel : `BLANK_SPRITE`, avec le même test sur `navigator.userAgent` que `figure-host.tsx`.
  - `paintWheel` : cadre `±(r + 1)`, `run(wheelOps(…))`. La roue n'a pas de sens : elle tourne.
- [ ] **Étape 4 : lancer, vérifier le succès.**
- [ ] **Étape 5 : commit.** `feat(bibliotheque): registre de sprites peints des voitures`.

---

### Tâche 6 : voiture Ghibli assemblée et posée par la boucle (`ghibli-car.tsx`)

**Files :**
- Create: `src/content/vehicle/ghibli-car.tsx`
- Test: `tests/content/vehicle/ghibli-car.test.tsx`

**Interfaces :**
- Consumes :
  - registre (tâche 5) ;
  - `occupantPose` (tâche 4) ;
  - `GhibliFigure`, `poseFigure` (`../figure/ghibli-figure`) ;
  - `anchorsOf` (`../../core/library/figure/bake`) ;
  - `outfitFor` (`../../core/library/city/people`) ;
  - `mulberry32`.
- Produces :
  - `GhibliCar({ car, dir, sky, rainy, lights }: { car: CarSpec; dir: 1|-1; sky: Sky; rainy: boolean; lights: boolean }): ReactElement`. C'est le groupe dans le repère de la voiture (roues au sol, y = 0, regard vers `dir`) ;
  - `placeCar(reg: FigureRegistry, cars: CarRegistry, node: Element, a: { car: CarSpec; dist: number; v: number; lean: number; seed: number }, dir: 1|-1, t: number, unit: number): void`. Il écrit :
    - la rotation des roues (`transform` des `[data-wheel]`, angle `dist/(unit·k·r)`, où k est l'échelle d'affichage, passée dans `a.dist` déjà convertie : voir la tâche 7) ;
    - le buste des occupants (`transform` des `[data-seat]`) ;
    - la pose de leur tête (`poseFigure`, quand l'indice change) ;
    - le volant (`[data-steer]`).

  Structure (de bas en haut) :
  1. `<image data-layer="interior">` ;
  2. `<svg data-cabin x y width height overflow="hidden" viewBox>` contenant un `<g data-seat=role>` par occupant, avec dedans `<g transform=échelle/ancrage>` et `<GhibliFigure gait="seated" yaw={dir>0?0:8} arms={driver?'handlebar':'down'}>`, plus, pour le conducteur, une ellipse de volant `[data-steer]`. Pour le cabriolet, le `<svg>` est remplacé par un `<g>` : rien à rogner ;
  3. `<image data-layer="body">` ;
  4. `<image data-layer="glazing">` ;
  5. pour chaque roue, `<g data-wheel transform="translate(x −r) rotate(θ)"><image …/></g>`, puis le reflet fixe `<circle>` blanc à 80 % (`x − 0,25r·dir ; −1,25r`, rayon `0,12r`) ;
  6. `<image data-layer="over">` (si jupes) ;
  7. phare rond (`<circle>` `#e8e2d0`, ou `#fff2c0` + halo `opacity 0,35` la nuit avec `lights`) ;
  8. `<g data-brake opacity=0>` (feu `#ff3b2f` r = 1,1, halo r = 4 à 35 %) au point `tail`.

  Tout est miroité en x quand `dir = −1` (positions × `dir`). Le groupe parent n'est **pas** retourné (voir la tâche 7).

- [ ] **Étape 1 : tests qui échouent** (jsdom, rendu avec `createRoot` comme `figure-host.test.tsx`)

```tsx
it('rend caisse, vitrage, deux roues, un conducteur ; aucun clipPath ni id', async () => {
  const c = genCar(11, 'berline', 0.2);
  const host = document.createElement('div');
  await act(async () => createRoot(host).render(<svg><GhibliCar car={c} dir={1} sky={sky} rainy={false} lights={false} /></svg>));
  expect(host.querySelector('[data-layer="body"]')?.getAttribute('href')).toBeTruthy();
  expect(host.querySelector('[data-layer="glazing"]')).not.toBeNull();
  expect(host.querySelectorAll('[data-wheel]')).toHaveLength(2);
  expect(host.querySelector('[data-seat="driver"] [data-figure]')).not.toBeNull();
  expect(host.querySelector('clipPath')).toBeNull();
  expect(host.querySelector('[id]')).toBeNull();
});
it('voie du fond : positions en miroir, pantins tournés vers la gauche', async () => { /* dir=-1 : x de la roue avant < 0 ; data-key du conducteur contient "|8|seated|" */ });
it('placeCar : roues qui tournent avec la distance, rien ne bouge à distance égale', () => {
  /* rendre, puis placeCar(dist=0) → transform des roues A ; placeCar(dist=0) → A ; placeCar(dist=30) → transform différente */
});
```

Le second test est à écrire en entier, sur le modèle du premier : `GhibliCar dir={-1}`, puis `expect(Number(wheelFront.getAttribute('transform')!.match(/translate\(([-\d.]+)/)![1])).toBeLessThan(0)` et `expect(driverFigure.getAttribute('data-key')).toContain('|8|seated|')`. Le troisième lit `getAttribute('transform')` de `[data-wheel]` avant et après les appels à `placeCar`.

- [ ] **Étape 2 : lancer, vérifier l'échec.**
- [ ] **Étape 3 : implémenter.**
  - **Échelle et ancrage des occupants** : `a = anchorsOf({ sig, yaw, gait:'seated', phase:0, head:0, arms, lean:0 })`. On veut la tête (`a.head`) en `(seat.x, seat.headY)` à l'échelle `seat.k`, d'où `transform = translate(seat.x·dir − a.head[0]·k·… , seat.headY − a.head[1]·k) scale(k)`. Le bassin suit puisque tout est à l'échelle. Pour `dir = −1`, le pantin est tourné vers la gauche (yaw 8), jamais miroité.
  - **Inertie** : la boucle écrit, sur `[data-seat]`, `translate(dx·dir dy) rotate(tilt·dir headX headY)`.
  - **Tenue** : `outfitFor('ordinary', mulberry32(occ.outfitSeed))`. Pour un enfant, la même fonction, et seule l'échelle change.
  - **Volant** : ellipse `rx 0,6`, `ry 2`, trait d'encre de 0,8, au point `wheelHand` (× `dir`), avec la rotation `0,35·dir + wheel`.
  - **Images** : `href` initial par `cars.ensure(layerKey(…), () => paintLayer(…))`, car une première apparition est peinte tout de suite. Au re-rendu avec une autre palette (jour/nuit), on garde le `href` courant tant que `request` rend `null`, et la boucle le remplace quand il est prêt. Pour cela, `placeCar` relit `data-want` (la clé voulue) sur chaque `<image>` et pose le `href` dès que `cars.request(want)` répond : c'est la même logique que `GhibliFigure` et `poseFigure`.
  - **Têtes** : `occupantPose(...)`, puis `poseFigure(reg, figureNode, { yaw, gait:'seated', phase:0, head, arms })`. `poseFigure` n'écrit que si la clé change, et l'indice est quantifié à 4 images par seconde.
- [ ] **Étape 4 : lancer, vérifier le succès.**
- [ ] **Étape 5 : commit.** `feat(bibliotheque): voiture Ghibli peinte, roues, vitrage et occupants`.

---

### Tâche 7 : branchement dans la circulation, fumée, classique à la longueur générée

**Files :**
- Create: `src/content/vehicle/exhaust-puffs.tsx`
- Modify:
  - `src/content/traffic-layer.tsx` (rendu des voitures, `kOf`, boucle `place`, feux stop) ;
  - `src/content/city-sprites.tsx` (cas `car` de `VehicleSprite` : `len` facultatif) ;
  - `src/core/library/city/vehicles.ts` (type `Vehicle` : `len?: number`).
- Test:
  - `tests/content/traffic-layer.test.tsx`, s'il existe (sinon le créer) ;
  - `tests/content/city-sprites.test.tsx`, s'il existe (y ajouter le cas `len`).

**Interfaces :**
- Consumes : tâches 3 à 6.
- Produces :
  - `ExhaustPuffs({ handle, lane, metrics, still }): ReactElement`, un pool de 48 `<circle>` par voie, deux cercles par bouffée (corps et lumière), donc 96 nœuds créés une fois ;
  - `VehicleSprite` cas `car` avec `vehicle.len` (défaut 40) : caisse `x = −len/2`, `width = len`, cabine centrée de largeur `0,55·len`, roues à `±(len/2 − 9)`, phare à `len/2`.

- [ ] **Étape 1 : tests qui échouent** (jsdom ; monter `TrafficLane` avec un moteur `warmTraffic` réel, comme le test V1 du calque s'il existe : chercher `TrafficLane` dans `tests/`)

```tsx
it('Ghibli : les voitures sont des GhibliCar, non retournées sur la voie du fond ; classique : VehicleSprite à la longueur de la fiche', async () => {
  // monter <svg><TrafficLane … lane="far" ghibli /></svg> : chaque [data-kind="car"] contient [data-layer="body"],
  // et sa transform a une échelle x > 0 ; en classique, le rect de caisse a width = car.L.
});
it('fumée : des cercles posés par la boucle, aucun en mouvement réduit', async () => { /* still → tous à opacity 0 */ });
```

  Les écrire en entier sur le modèle du test V1 du calque, en reprenant ses aides de montage (`env`, `metrics`).

- [ ] **Étape 2 : lancer, vérifier l'échec.**
- [ ] **Étape 3 : implémenter** :
  - **Taille et orientation** :
    - `kOf` : pour une voiture qui a une fiche, `m.unit · STREET_SCALE.vehicle · far`, sans `a.scale`, qui vaut 1 ;
    - `transformOf(w, a, m, now, ghibliCar)` : pour une voiture Ghibli, `translate(x, y + bump) scale(k) rotate(pitch·dir·180/π)`, **sans** facteur `TRACK_DIR` en x. Le sens est porté par `GhibliCar dir`. Ailleurs, transform inchangée.
    - `bump = sin(a.dist/(k) · 0,13 + seed)·0,12·min(1, v/(30·unit))·k`.
  - **Rendu** : `ghibli && a.kind === 'car' && a.car`, alors `<GhibliCar car={a.car} dir={TRACK_DIR[a.track]} …/>`, sans le cercle générique `data-brake`, dont `GhibliCar` porte le sien au bon endroit, ni les feux de détresse : une voiture ne livre pas.
  - **Classique** : `asVehicle(a)` passe `len: a.car?.L` aux voitures.
  - **Boucle `place`** :
    - pour les voitures Ghibli, `placeCar(figures, cars, node.firstElementChild, { car, dist: a.dist / k, v: a.v, lean: view.lean, seed }, dir, t, w.unit)`. Le `[data-brake]` du `GhibliCar` (trouvé par `node.querySelector('[data-brake]')`, puisque `:scope >` ne le voit plus) prend `opacity` selon `braking` ;
    - ensuite, `cars.flush()` une fois par image, dans la boucle de la voie `near`, ou dans les deux : `flush` est idempotent par image grâce au compteur `frame`. Le plus simple : appeler `flush` dans chaque voie, avec un budget de 3 par voie.
  - **Fumée** : `ExhaustPuffs` monté dans `TrafficLane`, **après** les véhicules. La voie a son propre pool (`useRef(createPuffs(48))`). Sa boucle :
    - émet pour chaque voiture et camionnette de la voie (sauf `still`), au pot de l'agent : `x = view.x + exhaust.x·k·dir`, `y = yOf(...) + exhaust.y·k`, avec `acc = a.cmd / unit` ;
    - pose `cx`/`cy`/`r`/`opacity` de chaque bouffée (corps `#d9d6e4`, ou `#6a6670` si sombre ; lumière `#f4f2f8`, ou `#8e8a94` si sombre, `r·0,55` décalé de `(−0,3r, −0,3r)`, `opacity·0,6`) ;
    - appelle `forgetPuffSources` pour les agents sortis.

    En classique, pas de fumée : spec §3 « Classique : sprites actuels ».
  - **Registre** : `CarContext.Provider` posé là où `FigureContext.Provider` l'est (rechercher `FigureContext.Provider` dans `src/content`), avec le même cycle de vie.
- [ ] **Étape 4 :** lancer `npx vitest run tests/content tests/core/library/city`, puis `npm run typecheck` : PASS.
- [ ] **Étape 5 : commit.** `feat(bibliotheque): voitures Ghibli dans la circulation, fumée d'échappement, classique à la longueur générée`.

---

### Tâche 8 : banc, captures, auto-validation

**Files :** banc `C:\Users\maxim\Downloads\Wikimasters-ghibli\.superpowers\harness-ville` (port 5217, `g3cap.mjs`, paramètres `art=ghibli`, `vb=` pour cadrer, `date=` pour figer l'horloge), captures dans `Wikimasters tools/.superpowers/captures-vehicules-v2/`.

- [ ] **Étape 1 :** recompiler le banc et lancer le serveur, selon la méthode des livraisons précédentes (lire `g3cap.mjs` et le mémo du banc). Ne **jamais** utiliser `--virtual-time-budget`, ni tuer `chrome.exe`.
- [ ] **Étape 2 : captures**, toutes en Ghibli sauf la dernière :
  - midi, heure de pointe, cadrage serré ×3 sur 6 voitures ;
  - planche de 10 voitures consécutives (`vb=` large) ;
  - feu rouge du passage piéton : file arrêtée, feux stop allumés ;
  - redémarrage : 3 captures à 0,5 s d'écart, roues et fumée ;
  - nuit : vitres chaudes, phares ;
  - crépuscule : changement de palette sans trou ;
  - voie du fond : lumière en haut à gauche ;
  - classique : voitures de longueurs variées.
- [ ] **Étape 3 : relire chaque capture** contre la maquette (`planche.png`) :
  - aucune voiture invisible, ni sprite vide ;
  - occupants qui ne dépassent pas du toit ;
  - roues sous les arches ;
  - fumée au pot ;
  - pas de voiture identique dans une fenêtre de 10 ;
  - sens du tangage.

  Corriger, puis refaire les captures concernées.
- [ ] **Étape 4 :** `npm test` (suite complète), `npm run typecheck`, `npm run build`.

---

### Tâche 9 : PR, fusion, pré-prod, mémoire

- [ ] `git push -u origin feat/bibliotheque-ghibli-voitures`, puis `gh pr create` : titre `feat(bibliotheque): voitures Ghibli générées (V2)`. Corps : résumé, écart à la spec (ordre des couches), captures (chemins) et tests, avec en dernière ligne `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] Fusionner sans demander (consigne `feedback_pr_automatique`), puis lancer `npm run preprod` (consigne `project_canaux_preprod_prod`).
- [ ] Mettre à jour la mémoire `project_ghibli.md` : V2 fusionnée, numéro de PR, pré-prod, prochain V3. Mettre à jour la ligne de `MEMORY.md`.
- [ ] Montrer les captures à l'utilisateur.
