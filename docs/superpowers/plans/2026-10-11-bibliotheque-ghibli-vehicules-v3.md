# Bibliothèque Ghibli — Véhicules V3 (véhicules à part) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Peindre en Ghibli les véhicules à part (bus, car scolaire, tram, utilitaires, services, deux-roues motorisés) avec le moteur de peinture des voitures V2, et faire passer le car scolaire aux heures d'école.

**Architecture:** Le rendu V2 (`GhibliCar`) est généralisé d'une fiche de voiture (`CarSpec`) à une **apparence** (`VehicleLook` : clé, plan de peinture `CarArt`, jantes). Un nouveau module pur `special-art.ts` produit le plan de peinture de 15 modèles, repris des dessins de la maquette validée (`.superpowers/brainstorm/vehicules-ghibli/maquette.html`, fonctions `bus`, `schoolBus`, `van`, `model(...)` du CATALOG). Le moteur attribue un modèle (`special`) aux bus, cars scolaires, trams, ambulances, bennes, camionnettes, deux-roues motorisés (nouveau genre `moto`) et à une part des voitures (taxi, police). Les cars scolaires sont des arrivées planifiées dans les fenêtres `schoolTo` / `schoolFrom`.

**Tech Stack:** TypeScript, React (SVG), canvas 2D hors écran (PNG data URL), Vitest (jsdom pour les composants).

**Spec:** `docs/superpowers/specs/2026-10-11-bibliotheque-ghibli-vehicules-design.md` (§4 Véhicules à part, §6 ligne V3).

## Global Constraints

- Style : trait d'encre `#33241f`, ombre teintée de violet, partie éclairée décalée en haut à gauche, liseré clair, reflets des vitres, ombre au sol ; nuit : vitres chaudes, halo des phares.
- Couche des acteurs recopiée par `<use>` : ni id fixe, ni `clipPath`, ni filtre à id ; rognage par `<svg>` imbriqué.
- Sprites peints = PNG data URL (la CSP refuse `blob:`), cache plafonné, budget de rendus par image.
- Voie du fond peinte tournée vers la gauche (jamais de miroir : la lumière reste en haut à gauche).
- Mouvement réduit : rien ne bouge (ni roues, ni gyrophares, ni fumée).
- Classique : sprites actuels, inchangés (seulement posés par le moteur).
- Car scolaire : blanc et bleu, panneau « transport d'enfants », enfants à chaque vitre, seulement quand `schoolTo` ou `schoolFrom` est actif, 2 à 4 passages par créneau.
- Pas de mesures sur le téléphone, pas de fiche WikiHow (fiche globale à la fin de G7).
- Girouettes réelles et arrêt avec passagers : V4 (ici, girouette avant tirée d'un générateur déterministe de repli).

## Review Focus

- Bus/car à plusieurs vitres : chaque passager doit rester rogné au rectangle englobant des vitres ET recouvert par la caisse percée entre les vitres (aucun pantin entre deux vitres) — test : la caisse a un `hole` par vitre.
- Deux sièges du même rôle (passagers du bus) : la boucle doit poser chacun (clé `data-seat` = indice) — test dans ghibli-car.
- Voie du fond (`dir = −1`) des véhicules à part : positions en miroir, textes lisibles (jamais écrits à l'envers) — test : la peinture retourne le canvas mais `text` est redressé.
- Route fermée : aucun car scolaire n'entre (arrivées planifiées comprises) — test moteur.
- Mouvement réduit : gyrophares figés (pas de clignotement) — test traffic-layer.

---

### Task 1: Apparence généralisée (`VehicleLook`) et nouvelles opérations de peinture

**Files:**
- Create: `src/core/library/city/traffic/look.ts`
- Modify: `src/core/library/city/traffic/car-art.ts` (types `Op`, `Seat`, `CarArt`)
- Modify: `src/content/vehicle/car-host.tsx` (clés, exécution de `text`)
- Modify: `src/content/vehicle/ghibli-car.tsx` (props `look`, sièges par indice, allures, roues par rayon, gyrophares)
- Modify: `src/content/traffic-layer.tsx` (appel `GhibliCar look=` / `placeCar`)
- Test: `tests/content/vehicle/ghibli-car.test.tsx`, `tests/core/library/city/traffic/car-art.test.ts`

**Interfaces:**
- Produces:
  - `Op` gagne `{ k: 'text'; x: number; y: number; text: string; size: number; color: string; bg?: string }` (texte redressé quand le canvas est retourné).
  - `Seat` gagne `gait?: 'seated' | 'mount' | 'stand'` (défaut `seated` ; point de pose `(x, headY)` = tête assise, selle en `mount`, pieds en `stand`), `arms?: ArmPose`, `over?: boolean` (dessiné après les roues, avant la couche `over`).
  - `CarArt` gagne `beacons: Beacon[]` avec `Beacon = { x: number; y: number; w: number; h: number; on: string; off: string | null }` (`off === null` : feu fixe allumé la nuit — taxi) ; `exhaust: { x: number; y: number } | null` (tram : aucun pot).
  - `look.ts` : `export type VehicleLook = { key: string; arch: string; art: CarArt; rim: Rim; rimColor: string }` ; `export function lookOfCar(c: CarSpec): VehicleLook` (clé `${c.seed}|${c.arch}`, identique aux clés V2).
  - `car-host.tsx` : `layerKey(look: VehicleLook, layer, lit)` ; `wheelKey(rim, rimColor, r, day)` inchangé.
  - `ghibli-car.tsx` : `GhibliCar({ look, dir, sky, rainy, lights, still })` ; `placeCar(fig, cars, node, { look, dist, v, lean, seed }, dir, t)` ; sièges `data-seat={indice}` `data-role={role}` ; gyrophares `<rect data-beacon data-on data-off>` clignotés par `placeCar` (période 0,33 s, alternés), figés si `still`.

- [ ] **Step 1: Tests qui échouent** — dans `ghibli-car.test.tsx`, remplacer `car={genCar(...)}` par `look={lookOfCar(genCar(...))}`, `[data-seat="driver"]` par `[data-role="driver"]`, `placeCar(..., { car, ...})` par `{ look: lookOfCar(car), ... }` ; ajouter :

```tsx
it('texte peint redressé sur la voie du fond, gyrophares qui clignotent, sièges multiples posés', async () => {
  const art = { ...carArt(genCar(11, 'berline', 0.2)) };
  art.seats = [...art.seats, { ...art.seats[0]!, role: 'rear', x: art.seats[0]!.x - 9 }, { ...art.seats[0]!, role: 'rear', x: art.seats[0]!.x - 15 }];
  art.beacons = [{ x: 0, y: -24, w: 4, h: 2.4, on: '#4f7bff', off: '#22305a' }];
  const look: VehicleLook = { key: 'test|multi', arch: 'test', art, rim: 'tôle', rimColor: '#d9d6cf' };
  const host = document.createElement('div');
  await act(async () => createRoot(host).render(<svg><Probe /><GhibliCar look={look} dir={-1} sky={sky} rainy={false} lights={false} /></svg>));
  const node = host.querySelector('[data-ghibli-car]')!;
  expect(host.querySelectorAll('[data-role="rear"]')).toHaveLength(2);
  placeCar(regs!.fig, regs!.car, node, { look, dist: 10, v: 40, lean: 0.5, seed: 1 }, -1, 1);
  for (const s of host.querySelectorAll('[data-role="rear"]')) expect(s.getAttribute('transform')).toMatch(/translate\(-0\.4/);
  const b = (): string => host.querySelector('[data-beacon]')!.getAttribute('fill')!;
  placeCar(regs!.fig, regs!.car, node, { look, dist: 10, v: 40, lean: 0, seed: 1 }, -1, 1.0);
  const a = b();
  placeCar(regs!.fig, regs!.car, node, { look, dist: 10, v: 40, lean: 0, seed: 1 }, -1, 1.34);
  expect(b()).not.toBe(a);
});
```

Dans `car-art.test.ts` : `expect(carArt(genCar(1, 'berline', 0.1)).beacons).toEqual([])` et `exhaust` non nul.

- [ ] **Step 2:** `npx vitest run tests/content/vehicle/ghibli-car.test.tsx tests/core/library/city/traffic/car-art.test.ts` → FAIL (`lookOfCar` introuvable).
- [ ] **Step 3: Implémentation.**
  - `car-art.ts` : ajouter les types ci-dessus ; `build()` renvoie `beacons: []`.
  - `look.ts` :

```ts
import { carArt, type CarArt } from './car-art';
import type { CarSpec, Rim } from './cars';
export type VehicleLook = { key: string; arch: string; art: CarArt; rim: Rim; rimColor: string };
export const lookOfCar = (c: CarSpec): VehicleLook => ({ key: `${c.seed}|${c.arch}`, arch: c.arch, art: carArt(c), rim: c.rim, rimColor: c.rimColor });
```

  - `car-host.tsx` `run()` : cas `text` —

```ts
case 'text': {
  ctx.save();
  ctx.translate(op.x, op.y);
  ctx.scale(sx, 1); // canvas retourné pour le sens −1 : le texte est redressé autour de son point d'ancrage
  ctx.font = `bold ${op.size}px sans-serif`;
  const w = ctx.measureText(op.text).width;
  const x0 = sx > 0 ? 0 : -w;
  if (op.bg) { ctx.fillStyle = t(op.bg); ctx.beginPath(); ctx.roundRect(x0 - 0.8, -op.size, w + 1.6, op.size * 1.3, 0.6); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 0.4; ctx.stroke(); }
  ctx.fillStyle = t(op.color);
  ctx.fillText(op.text, x0, 0);
  ctx.restore();
  break;
}
```

  (avec `sx = −1`, le repère est déjà retourné : `scale(sx, 1)` le redresse, et `x0 = −w` garde le texte du même côté de son ancre en miroir.)
  - `ghibli-car.tsx` : remplacer `car` par `look` partout (`carArt(car)` → `look.art`, clés `layerKey(look, …)`) ; roues : `wheelKey(look.rim, look.rimColor, w.r, day)` par roue (`data-want` par roue) ; sièges : `art.seats.map((s, i) => <g key={i} data-seat={i} data-role={s.role} …>)`, `seatPlacement` lit `s.gait ?? 'seated'` : ancrage `head` (assis), `seat` (selle), pieds `[0,0]` (debout) ; bras `s.arms ?? (driver ? 'handlebar' : 'swing')` ; sièges `over` rendus après les roues ; occupants non `over` d'un véhicule sans `cabin` rendus dans `<g data-cabin>` comme le cabriolet ; gyrophares `art.beacons.map(b => <rect data-beacon="" data-on={b.on} data-off={b.off ?? ''} x y width height rx={h/2} fill={b.off ?? (lights ? b.on : tone(b.on, sky))} stroke=INK strokeWidth=0.4 />)` ; `placeCar` : `const lit = Math.floor(t * 3) % 2 === 0` puis pour chaque `[data-beacon]` avec `data-off` non vide, `fill = (lit !== (indice % 2 === 1)) ? on : off`.
  - `traffic-layer.tsx` : `<GhibliCar look={lookOfCar(a.car!)} …/>`, `placeCar(…, { look: lookOfCar(a.car!), … })`, `carArt(a.car!).exhaust` → `look.art.exhaust` (rien si `null`).
- [ ] **Step 4:** relancer les deux fichiers + `tests/content/traffic-layer.test.tsx` → PASS.
- [ ] **Step 5: Commit** `refactor(bibliotheque): apparence de véhicule généralisée (texte peint, gyrophares, sièges multiples)`.

### Task 2: Modèles à part peints (`special-art.ts`) et lignes de bus de repli (`bus-lines.ts`)

**Files:**
- Create: `src/core/library/city/traffic/special-art.ts`, `src/core/library/city/traffic/bus-lines.ts`
- Test: `tests/core/library/city/traffic/special-art.test.ts`, `tests/core/library/city/traffic/bus-lines.test.ts`

**Interfaces:**
- Consumes: `Op`, `Seat`, `CarArt`, `Beacon`, `INK`, `circlePath`, `roundRectPath`, `SEAT_K` (car-art) ; `VehicleLook` (look.ts).
- Produces:
  - `export type SpecialId = 'bus' | 'school-bus' | 'tram' | 'estafette' | 'type-h' | 'poste' | 'tipper' | 'ambulance' | 'police' | 'taxi' | 'garbage' | 'vespa' | 'mobylette' | 'sidecar' | 'triporteur'`
  - `export type SpecialSpec = { id: SpecialId; seed: number; label?: string; line?: BusLine }`
  - `export function specialArt(s: SpecialSpec): CarArt` (mémorisé par `specialKey`)
  - `export const specialKey = (s: SpecialSpec): string` (`sp|id|seed|label|ref`)
  - `export function specialLook(s: SpecialSpec): VehicleLook`
  - `export const specialExtent = (s: SpecialSpec): number` (demi-encombrement : `max(-x0, x1) + 1,6`)
  - `export const SPECIAL_SPEED: Readonly<Record<SpecialId, number>>` (facteur sur la vitesse du genre)
  - `bus-lines.ts` : `export type BusLine = { ref: string; to: string; colour: string }` ; `export function fallbackLine(seed: number): BusLine` (numéro 1 à 99, parfois lettre + chiffre « C3 », terminus tiré de la liste de la spec §5, couleur d'une palette de 8 tons de ligne).

Modèles (repère : roues au sol y = 0, regard +x ; géométrie reprise de la maquette, lignes citées) :

| id | source maquette | longueur | particularités |
|---|---|---|---|
| bus | `bus()` l. 201 | 68 | bas couleur de ligne, haut crème, 6 vitres à passagers (vitre 3 vide), porte, girouette de toit `ref  TERMINUS` |
| school-bus | `schoolBus()` l. 182 | 68 | blanc, bandes bleue et jaune, 6 vitres à 2 enfants, panneaux « transport d'enfants » avant/arrière |
| tram | nouveau | 136 | 2 caisses crème/rouge articulées, pantographe, 8 vitres à passagers, 4 bogies r = 3, pas de pot |
| estafette | `van()` l. 218 | 46 | couleur tirée parmi crème / bleu / vert sauge, bande claire |
| type-h | `Type H` l. 456 | 50 | tôle ondulée, étiquette `label` (LAITERIE par défaut) |
| poste | `Fourgon Poste` l. 466 | 40 | jaune, bande bleue, « POSTES », conducteur casquette |
| tipper | `Camion-benne` l. 489 | 58 | benne orange, cabine bleue, 3 roues |
| ambulance | `Ambulance` l. 476 | 52 | blanche, bande et croix rouges, 2 gyrophares bleus |
| police | `Police` l. 446 | 48 | bleue, bande blanche, « POLICE », gyrophare bleu, conducteur et passager en uniforme |
| taxi | `Taxi` l. 436 | 48 | noire, lumineux jaune « TAXI » (feu fixe la nuit) |
| garbage | benne à ordures, d'après `Camion-benne` | 60 | caisse verte arrondie, trémie arrière, 2 éboueurs debout (`gait: 'stand'`, `arms: 'hold'`, `over`) sur le marchepied, gyrophare orange |
| vespa | `Vespa` l. 504 | 22 | pilote en selle (`mount`, `handlebar`, `over`) |
| mobylette | `Mobylette` l. 516 | 22 | cadre au trait, pilote en selle (`over`) |
| sidecar | `Side-car` l. 528 | 34 | pilote en selle sous la caisse de la moto, passager assis dans le panier (couche `over` = panier par-dessus) |
| triporteur | `Triporteur` l. 494 | 30 | caisse « LAIT » à l'avant, pilote en selle (`over`) |

Fabrication commune (`model(m: Model): CarArt`, portage de `model()` de la maquette) :

```ts
type Model = {
  len: number; color: string; body: string;
  under?: Op[]; paint?: Op[];       // sous / sur la caisse (couche body)
  windows?: string[];               // tracés des vitres : percées dans la caisse, habitacle sombre, vitrage
  seats: Seat[];
  wheels: [number, number][];       // [x, r]
  archR?: number;                   // passages de roue sombres
  chrome?: [number, number, number, number][];
  lamp: [number, number, number];   // phare [x, y, r]
  tail: [number, number];           // feu stop
  exhaust: [number, number] | null;
  over?: Op[]; beacons?: Beacon[]; top?: number;
};
```

Couche `body` : `shadow`, `under`, `piece(body)`, `paint`, passages de roue, un `hole` par vitre, montants, chromes, feu arrière. `interior` : chaque vitre en `#3a3040`. `glazing` : chaque vitre en `glass`. `cabin` = rectangle englobant des vitres (ou `null`). Sièges : tête du conducteur au point `driver(x, y)` de la maquette, échelle `SEAT_K.adult × k` ; passagers aux points `passenger(...)` (enfant : `SEAT_K.child`).

- [ ] **Step 1: Tests qui échouent** (`special-art.test.ts`) :

```ts
import { describe, expect, it } from 'vitest';
import { SPECIAL_IDS, specialArt, specialExtent, specialKey, type SpecialSpec } from '../../../../../src/core/library/city/traffic/special-art';
import { fallbackLine } from '../../../../../src/core/library/city/traffic/bus-lines';

const spec = (id: SpecialSpec['id'], seed = 3): SpecialSpec => ({ id, seed, ...(id === 'bus' ? { line: fallbackLine(seed) } : {}) });
describe('véhicules à part', () => {
  it.each(SPECIAL_IDS)('%s : roues au sol, un conducteur, déterministe, encombrement ≥ demi-longueur', (id) => {
    const a = specialArt(spec(id));
    expect(a.wheels.length).toBeGreaterThanOrEqual(2);
    for (const w of a.wheels) expect(w.r).toBeGreaterThan(1.5);
    expect(a.seats.filter((s) => s.role === 'driver')).toHaveLength(1);
    expect(specialArt(spec(id))).toBe(a);
    expect(specialExtent(spec(id))).toBeGreaterThanOrEqual(a.len / 2);
    expect(a.body.some((o) => o.k === 'piece')).toBe(true);
  });
  it('bus : passagers derrière les vitres, une percée par vitre, girouette', () => {
    const a = specialArt(spec('bus'));
    expect(a.seats.filter((s) => s.role === 'rear').length).toBeGreaterThanOrEqual(5);
    expect(a.body.filter((o) => o.k === 'hole').length).toBeGreaterThanOrEqual(6);
    expect(a.body.some((o) => o.k === 'text' && o.text.startsWith(fallbackLine(3).ref))).toBe(true);
    for (const s of a.seats) expect(s.x).toBeGreaterThanOrEqual(a.cabin!.x - 1);
  });
  it('car scolaire : deux enfants par vitre, panneaux « transport d’enfants »', () => {
    const a = specialArt(spec('school-bus'));
    expect(a.seats.filter((s) => s.child).length).toBe(12);
  });
  it('services : gyrophares (police, ambulance, benne) ; taxi : lumineux fixe ; tram sans pot', () => {
    expect(specialArt(spec('police')).beacons.length).toBeGreaterThan(0);
    expect(specialArt(spec('ambulance')).beacons.length).toBe(2);
    expect(specialArt(spec('taxi')).beacons[0]!.off).toBeNull();
    expect(specialArt(spec('tram')).exhaust).toBeNull();
  });
  it('deux-roues : pilote en selle, par-dessus la machine ; benne : éboueurs debout', () => {
    for (const id of ['vespa', 'mobylette', 'triporteur'] as const) expect(specialArt(spec(id)).seats[0]).toMatchObject({ gait: 'mount', over: true });
    expect(specialArt(spec('garbage')).seats.filter((s) => s.gait === 'stand')).toHaveLength(2);
  });
  it('étiquette du Type H dans la clé et la peinture', () => {
    const s: SpecialSpec = { id: 'type-h', seed: 1, label: 'FLEURS' };
    expect(specialKey(s)).toContain('FLEURS');
    expect(specialArt(s).body.some((o) => o.k === 'text' && o.text === 'FLEURS')).toBe(true);
  });
});
```

(`bus-lines.test.ts`) :

```ts
it('ligne de repli déterministe et plausible', () => {
  for (let s = 0; s < 200; s++) {
    const l = fallbackLine(s);
    expect(fallbackLine(s)).toEqual(l);
    expect(l.ref).toMatch(/^([1-9]\d?|[A-Z][1-9])$/);
    expect(l.to.length).toBeGreaterThan(2);
    expect(l.colour).toMatch(/^#[0-9a-f]{6}$/i);
  }
  expect(new Set(Array.from({ length: 50 }, (_, s) => fallbackLine(s).ref)).size).toBeGreaterThan(20);
});
```

- [ ] **Step 2:** lancer → FAIL (modules absents).
- [ ] **Step 3:** écrire `bus-lines.ts` puis `special-art.ts` (exporter `SPECIAL_IDS`), en portant la géométrie de la maquette citée ci-dessus.
- [ ] **Step 4:** lancer → PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): modèles Ghibli des véhicules à part (bus, car scolaire, tram, utilitaires, services, deux-roues)`.

### Task 3: Le moteur attribue les modèles ; deux-roues motorisés ; cars scolaires planifiés

**Files:**
- Modify: `src/core/library/city/traffic/engine.ts`
- Modify: `src/core/library/city/intensity.ts` (export `schoolWindows`)
- Create: `src/core/library/city/traffic/school-bus.ts`
- Test: `tests/core/library/city/traffic/engine.test.ts`, `tests/core/library/city/traffic/school-bus.test.ts`

**Interfaces:**
- Consumes: `SpecialSpec`, `specialExtent`, `SPECIAL_SPEED`, `fallbackLine`.
- Produces:
  - `AgentKind` += `'moto' | 'school-bus'` ; `KIND_HALF.moto = 12`, `KIND_HALF['school-bus'] = 34` ; `KIND_V0.moto = 64`, `KIND_V0['school-bus'] = 50`.
  - `Agent.special?: SpecialSpec`.
  - `ScheduledArrival.kind` accepte `'school-bus'`.
  - `TrafficEnv.vanLabels?: readonly string[]` (étiquettes des Type H selon les commerces présents).
  - `intensity.ts` : `export function schoolWindows(day: DayInfo): [number, number][]` (minutes : aller `[470, 510]` si `schoolOn` ; sortie `[996, 1035]` les jours d'école, `[696, 735]` le mercredi — les bornes de `bump` en minutes).
  - `school-bus.ts` : `export function schoolBusArrivals(o: { seed: number; day: number; nowS: number; minutes: number; windows: readonly (readonly [number, number])[] }): ScheduledArrival[]` — 2 à 4 passages par fenêtre, minutes tirées dans la fenêtre, voie tirée, `start = nowS + (minute − minutes) × 60`, clé `school-${day}-${w}-${i}`.

Règles d'attribution (dans `spawn`, avec le `rng` de la voie : une seule tirée `roll` comme aujourd'hui, nouveaux seuils) : `roll < 0.025` bus ; `< 0.16` camionnette ; `< 0.21` deux-roues (`moto`) ; `< 0.222` police ; `< 0.27` taxi ; sinon voiture générée. Le modèle précis est tiré par `mulberry32(seed ^ 0x5bec)` dans `newAgent` : camionnette → estafette 35 %, type-h 25 %, poste 20 %, tipper 20 % (en livraison : estafette ou type-h seulement) ; moto → vespa 35 %, mobylette 30 %, sidecar 15 %, triporteur 20 %. Arrivées : bus → `bus` (ligne de repli tirée de la graine de la pièce et de la voie : un même numéro par sens), school-bus → `school-bus`, tram → `tram`, ambulance → `ambulance`, garbage-truck → `garbage`. `scale = 1` et `half = specialExtent × VEHICLE_SCALE × far` pour tout véhicule à modèle ; `vmax` × `SPECIAL_SPEED[id]`. Les deux-roues ont un `rider` (tenue, pour le classique).

- [ ] **Step 1: Tests qui échouent** :

```ts
// engine.test.ts
it('modèles à part : tout bus, camionnette, deux-roues a un modèle ; taxis et police parmi les voitures', () => {
  const w = warmTraffic({ width: 3000, seed: 9, unit: 1, startS: 50_000 }, env);
  let seen = new Map<string, number>();
  for (let t = 50_000; t < 50_000 + 1800; t += 1) {
    advance(w, t, env);
    for (const a of w.agents) if (a.special) seen.set(a.special.id, (seen.get(a.special.id) ?? 0) + 1);
    for (const a of w.agents) if (a.kind === 'bus' || a.kind === 'van' || a.kind === 'moto') expect(a.special).toBeDefined();
    for (const a of w.agents) if (a.kind === 'car') expect(a.car !== undefined || a.special?.id === 'taxi' || a.special?.id === 'police').toBe(true);
  }
  for (const id of ['estafette', 'vespa', 'taxi']) expect(seen.has(id)).toBe(true);
});
it('car scolaire planifié : entre à son heure, jamais route fermée', () => {
  const arr = [{ key: 'school-1', kind: 'school-bus' as const, track: 'near' as const, start: 50_010 }];
  const open = warmTraffic({ width: 1200, seed: 2, unit: 1, startS: 50_000 }, { ...env, arrivals: arr });
  for (let t = 50_000; t < 50_040; t += 0.5) advance(open, t, { ...env, arrivals: arr });
  expect(open.agents.some((a) => a.kind === 'school-bus' && a.special?.id === 'school-bus')).toBe(true);
  const closedEnv = { ...env, closed: true, arrivals: arr };
  const closed = warmTraffic({ width: 1200, seed: 2, unit: 1, startS: 50_000 }, closedEnv);
  for (let t = 50_000; t < 50_040; t += 0.5) advance(closed, t, closedEnv);
  expect(closed.agents.some((a) => a.kind === 'school-bus')).toBe(false);
});
```

(Vérifier dans `spawn` : la route fermée bloque aussi les arrivées `school-bus` ; les autres arrivées gardent leur règle actuelle.)

```ts
// school-bus.test.ts
it('2 à 4 passages par fenêtre, dans la fenêtre, déterministes', () => {
  const o = { seed: 5, day: 20_000, nowS: 1_000_000, minutes: 480, windows: [[470, 510], [996, 1035]] as const };
  const a = schoolBusArrivals(o);
  expect(schoolBusArrivals(o)).toEqual(a);
  for (const w of [0, 1]) {
    const mine = a.filter((x) => x.key.startsWith(`school-20000-${w}-`));
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.length).toBeLessThanOrEqual(4);
    for (const x of mine) {
      const m = 480 + (x.start - 1_000_000) / 60;
      expect(m).toBeGreaterThanOrEqual(o.windows[w]![0]);
      expect(m).toBeLessThanOrEqual(o.windows[w]![1]);
    }
  }
});
it('fenêtres : aucune le dimanche, aller et sortie un jour d’école, sortie à midi le mercredi', () => { /* via dayInfo de calendar.ts */ });
```

- [ ] **Step 2:** lancer → FAIL.
- [ ] **Step 3:** implémenter (engine, intensity, school-bus).
- [ ] **Step 4:** `npx vitest run tests/core/library/city/traffic` → PASS (anciens tests compris : déterminisme, pas de chevauchement).
- [ ] **Step 5: Commit** `feat(bibliotheque): le moteur attribue les modèles à part, deux-roues motorisés, cars scolaires aux heures d'école`.

### Task 4: Branchement dans la scène (Ghibli et classique)

**Files:**
- Modify: `src/content/traffic-layer.tsx`, `src/content/city-life.tsx`
- Test: `tests/content/traffic-layer.test.tsx`

**Interfaces:**
- Consumes: `specialLook`, `lookOfCar`, `schoolBusArrivals`, `schoolWindows`, `TrafficEnv.vanLabels`.
- Produces: `lookOf(a: Agent): VehicleLook | null` (traffic-layer) ; en Ghibli, tout agent à apparence (sauf vélos) est un `GhibliCar` (événements de rue compris : bus, tram, ambulance, benne) ; classique : `moto` → sprite vélo avec son pilote, `school-bus` → sprite bus ; tout le reste inchangé.

- [ ] **Step 1: Tests qui échouent** (`traffic-layer.test.tsx`) :

```tsx
it('Ghibli : véhicules à part peints (bus, camionnette, deux-roues), gyrophares figés en mouvement réduit', async () => {
  const arrivals = [{ key: 'ev-a', kind: 'ambulance' as const, track: 'near' as const, start: T0 - 5 }];
  const e2 = { ...env, arrivals };
  const handle: TrafficHandle = { world: warmTraffic({ width: 1080, seed: 4, unit: m.unit, startS: T0 }, e2), env: e2 };
  const host = document.createElement('div');
  await act(async () => createRoot(host).render(<svg><TrafficLane handle={handle} lane="near" metrics={m} sky={sky} lights={false} rainy={false} still ghibli fests={[]} eventsByKey={new Map()} frozenT={T0} /></svg>));
  const amb = host.querySelector('[data-kind="ambulance"] [data-ghibli-car][data-arch="ambulance"]');
  expect(amb).not.toBeNull();
  const fills = [...amb!.querySelectorAll('[data-beacon]')].map((b) => b.getAttribute('fill'));
  await act(async () => new Promise((r) => setTimeout(r, 400)));
  expect([...amb!.querySelectorAll('[data-beacon]')].map((b) => b.getAttribute('fill'))).toEqual(fills);
  for (const v of host.querySelectorAll('[data-kind="van"], [data-kind="bus"], [data-kind="moto"]')) expect(v.querySelector('[data-ghibli-car]')).not.toBeNull();
});
it('classique : deux-roues motorisé dessiné en sprite de vélo, car scolaire en sprite de bus', async () => { /* agents forcés via handle.world.agents */ });
```

- [ ] **Step 2:** lancer → FAIL.
- [ ] **Step 3:** implémenter : `lookOf`, `painted = ghibli && look !== null && a.kind !== 'bike' && a.kind !== 'delivery-bike'` ; `kOf` : échelle 1 pour `a.special` ; fumée depuis `look.art.exhaust` ; `asVehicle` : `moto → bike`, `school-bus → bus` ; `city-life.tsx` : `arrivals` += `schoolBusArrivals({ seed, day: dayNumber(date), nowS, minutes: city.minutes, windows: intensity.closed ? [] : schoolWindows(city.day) })` (mémorisé à la minute), `vanLabels` d'après les types de commerces présents (`bakery|pastry → BOULANGERIE`, `cheese|grocery|minimarket → LAITERIE`, `florist → FLEURS`, `greengrocer → PRIMEURS`, `wine → VINS` ; défaut `['LAITERIE']`).
- [ ] **Step 4:** `npx vitest run tests/content` → PASS (hors échecs déjà connus sur main : `city-events-layer` ×4 et délais de la suite en parallèle — les comparer à main si besoin).
- [ ] **Step 5: Commit** `feat(bibliotheque): véhicules à part Ghibli dans la circulation`.

### Task 5: Captures auto-validées sur le banc

**Files:** banc `C:\Users\maxim\Downloads\Wikimasters tools\.superpowers\harness-ville` (copie dans le worktree, port 5217), captures `.superpowers/captures-vehicules-v3/`.

- [ ] **Step 1:** `npm run build` (worktree) puis banc avec `art=ghibli&shops=20700`, captures SANS `date=` (sinon roues/fumée figées) : planche de chaque modèle (jour, nuit, voie du fond) via `focus` sur `[data-arch="<id>"]`, rue à 8 h un jour d'école (car scolaire), rue à 12 h (taxis, deux-roues, utilitaires).
- [ ] **Step 2:** regarder chaque capture : silhouettes conformes à la maquette, textes redressés au fond, passagers visibles seulement aux vitres, pilotes en selle, roues au sol, gyrophares, aucun trou ni débordement. Corriger et recapturer jusqu'à ce que tout soit propre.
- [ ] **Step 3: Commit** des correctifs éventuels.

### Task 6: PR, fusion, pré-prod, mémoire

- [ ] `npx tsc --noEmit`, `npx eslint` sur les fichiers touchés, suite ciblée `npx vitest run tests/core/library/city tests/content/vehicle tests/content/traffic-layer.test.tsx`.
- [ ] `git push -u origin feat/bibliotheque-ghibli-vehicules-v3`, `gh pr create`, fusion (`gh pr merge --merge`), puis `npm run preprod` depuis le résultat fusionné.
- [ ] Mettre à jour la mémoire `project_ghibli.md` (V3 fusionnée, prochain V4) et montrer les captures à l'utilisateur.
