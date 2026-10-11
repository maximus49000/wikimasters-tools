# Véhicules Ghibli V5 — véhicules scénarisés — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** peindre en Ghibli les véhicules scénarisés (camionnette, camion plateau et nacelle des équipes, camion de déménagement, jeeps, camions militaires, chars, pompiers et motos du défilé), leurs scripts restant inchangés.

**Architecture:** chaque véhicule scénarisé devient un « modèle à part » de plus dans `special-art.ts` (même grammaire que V3), dessiné AUX MÊMES COTES que son sprite classique (roues, portes, plateau, pivot de la nacelle, échelle) pour que les scripts et les éléments dynamiques (échelle rangée, chargement, hayon, portière, bras de la nacelle, drapeaux) restent alignés. Un composant `ScriptedCar` pose `GhibliCar` dans le repère du sprite classique et garde par-dessus ces éléments dynamiques (dessin classique). Les véhicules sans boucle (équipes, déménagement : déplacés par transition CSS d'un rendu à la minute au suivant) font tourner leurs roues par la MÊME transition CSS (angle = position / rayon) ; ceux du défilé passent par la boucle existante (`placeCar` : roues, gyrophares, occupants).

**Tech Stack:** TypeScript, React 18, SVG, canvas (peinture des sprites), Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-11-bibliotheque-ghibli-vehicules-design.md` (§6, ligne V5).

## Global Constraints

- Graphisme classique strictement inchangé (`ghibli` faux → mêmes nœuds qu'avant).
- Scripts inchangés : positions, horaires, transitions, attributs `data-*` lus par les tests et les boucles (`data-install-van`, `data-x`, `data-half`, `data-door-x`, `data-van-phase`, `data-lift-truck`, `data-moving-truck`, `data-truck-at`, `data-tailgate`, `data-stored-item`, `data-carried`, `data-parade-id`, `data-arms`…).
- Aucun `clipPath` ni id fixe (la scène est recopiée par `<use>`).
- Images des API avant les images de remplacement : sans objet ici.
- Pas de fiche WikiHow (fiche globale à la fin de G7).
- Pas de mesures téléphone par PR (campagne après G7).
- Mouvement réduit (`still`) : rien ne tourne, rien ne clignote ; les images sont peintes tout de suite.
- Commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` ; PR terminée par `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Review Focus

- Bascule Ghibli ↔ classique pendant qu'une camionnette roule : pas de nœud orphelin, les images se peignent tout de suite (pas de boucle pour les poser) → test « rendu sans boucle : aucune image vide » (tâche 2).
- Jour → nuit pendant qu'un véhicule d'équipe est garé : l'image doit changer au rendu suivant (pas de boucle) → `paintNow` (tâche 2).
- Camionnette vide une fois l'équipe descendue : pas de conducteur fantôme derrière la vitre → `occupied` (tâches 2 et 4).
- Sens « fond » (dir −1) : éléments dynamiques en miroir alignés sur la carrosserie peinte (porte arrière du bon côté) → test de position de la portière (tâche 4).
- Mouvement réduit : pas de transition sur les roues, pas d'`<animate>` → test (tâche 2).

---

## File Structure

- Modify `src/core/library/city/traffic/car-art.ts` : `Seat.outfit?` (tenue imposée : uniformes).
- Modify `src/core/library/city/traffic/special-art.ts` : 9 modèles (`SCRIPTED_IDS`), `SpecialSpec.paint?`, clé.
- Modify `src/content/vehicle/ghibli-car.tsx` : options `roll`, `paintNow`, `occupied`, `blink` ; tenue imposée.
- Create `src/content/vehicle/scripted-car.tsx` : `ScriptedCar` (GhibliCar dans le repère du sprite classique + éléments dynamiques).
- Modify `src/content/install-sprites.tsx` : découpe des éléments dynamiques (portière, échelle, chargement, hayon, stabilisateurs) pour les réutiliser ; branche Ghibli de `Van`, `Flatbed`, `LiftTruck`.
- Modify `src/content/install-layer.tsx` : passe `ghibli`, `rainy`, position et transition aux véhicules.
- Modify `src/content/moving-truck.tsx` + `src/content/city-life.tsx` : camion de déménagement Ghibli.
- Modify `src/content/parade-sprites.tsx` + `src/content/parade-layer.tsx` : véhicules du défilé Ghibli, boucle `placeCar`.
- Tests : `tests/core/library/city/traffic/special-art.test.ts`, `tests/content/vehicle/ghibli-car.test.tsx`, `tests/content/vehicle/scripted-car.test.tsx` (nouveau), `tests/content/install-layer.test.tsx`, `tests/content/moving-ghibli.test.tsx`, `tests/content/parade-layer.test.tsx`.

---

### Task 1: Modèles peints des véhicules scénarisés

**Files:**
- Modify: `src/core/library/city/traffic/car-art.ts:29` (type `Seat`)
- Modify: `src/core/library/city/traffic/special-art.ts`
- Test: `tests/core/library/city/traffic/special-art.test.ts`

**Interfaces:**
- Produces: `SCRIPTED_IDS = ['crew-van', 'flatbed', 'lift', 'moving-truck', 'army-jeep', 'army-truck', 'tank', 'fire-truck', 'garde-moto'] as const` (inclus dans `SPECIAL_IDS`, donc dans `SpecialId`) ; `SpecialSpec.paint?: string` (teinte d'armée, dans `specialKey`) ; `Seat.outfit?: Outfit`.
- Cotes (repère du sprite classique, roues au sol y = 0, regard +x) : camionnette roues −14/15 r 4, porte arrière x −25 ; plateau roues −33/−22/36 r 4,5, plateau y −11 de −46 à 24, cabine 24-46 ; nacelle roues −20/22 r 4,5, châssis −32..16 (y −12..−5), cabine 16-32 ; déménagement caisse −32..10 (y −34..−6), cabine 10-32, roues −20/22 r 4,5 ; jeep roues −11/12 r 4,4 ; camion militaire roues −20/−10/17 r 4,5 ; char galets −22..23 r 3 ; pompiers roues −34/−14/30 r 5 ; moto roues −11/11 r 6.

- [ ] **Step 1: Write the failing test** (ajouter à `special-art.test.ts`)

```ts
import { SCRIPTED_IDS } from '../../../../../src/core/library/city/traffic/special-art';

describe('véhicules scénarisés (V5)', () => {
  it('aux cotes du sprite classique', () => {
    const wx = (id: SpecialSpec['id']): number[] => specialArt({ id, seed: 1 }).wheels.map((w) => w.x);
    expect(wx('crew-van')).toEqual([-14, 15]);
    expect(wx('flatbed')).toEqual([-33, -22, 36]);
    expect(wx('lift')).toEqual([-20, 22]);
    expect(wx('moving-truck')).toEqual([-20, 22]);
    expect(wx('army-truck')).toEqual([-20, -10, 17]);
    expect(wx('fire-truck')).toEqual([-34, -14, 30]);
    expect(wx('tank')).toHaveLength(6);
    const van = specialArt({ id: 'crew-van', seed: 1 });
    expect(van.x0).toBeGreaterThanOrEqual(-26.5);
    expect(van.x1).toBeLessThanOrEqual(27.5);
  });
  it('teinte d’armée dans la clé et la peinture', () => {
    expect(specialKey({ id: 'army-jeep', seed: 1, paint: '#4B5320' })).not.toBe(specialKey({ id: 'army-jeep', seed: 1, paint: '#B49A6A' }));
    expect(specialArt({ id: 'army-jeep', seed: 1, paint: '#B49A6A' }).body.some((o) => o.k === 'piece' && o.color === '#B49A6A')).toBe(true);
  });
  it('uniformes : tenue imposée aux occupants du défilé, pas à ceux des équipes', () => {
    for (const id of ['army-jeep', 'army-truck', 'tank', 'fire-truck', 'garde-moto'] as const) for (const s of specialArt({ id, seed: 2 }).seats) expect(s.outfit).toBeDefined();
    expect(specialArt({ id: 'crew-van', seed: 2 }).seats[0]!.outfit).toBeUndefined();
  });
  it('chef de bord debout (jeep, char), motard en selle par-dessus la machine, gyrophares pompiers et nacelle', () => {
    expect(specialArt({ id: 'army-jeep', seed: 1 }).seats.some((s) => s.gait === 'stand')).toBe(true);
    expect(specialArt({ id: 'tank', seed: 1 }).seats[0]).toMatchObject({ gait: 'stand' });
    expect(specialArt({ id: 'garde-moto', seed: 1 }).seats[0]).toMatchObject({ gait: 'mount', over: true });
    expect(specialArt({ id: 'fire-truck', seed: 1 }).beacons).toHaveLength(2);
    expect(specialArt({ id: 'lift', seed: 1 }).beacons).toHaveLength(1);
  });
  it.each(SCRIPTED_IDS)('%s : dans SPECIAL_IDS', (id) => expect(SPECIAL_IDS).toContain(id));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/library/city/traffic/special-art.test.ts`
Expected: FAIL (`SCRIPTED_IDS` absent).

- [ ] **Step 3: Implement**

`car-art.ts` : `import type { Outfit } from '../people';` et ajouter `outfit?: Outfit` au type `Seat`.

`special-art.ts` :

```ts
export const SCRIPTED_IDS = ['crew-van', 'flatbed', 'lift', 'moving-truck', 'army-jeep', 'army-truck', 'tank', 'fire-truck', 'garde-moto'] as const;
export const SPECIAL_IDS = ['bus', /* … 15 existants … */ 'triporteur', ...SCRIPTED_IDS] as const;
export type SpecialSpec = { id: SpecialId; seed: number; label?: string; line?: BusLine; paint?: string };
// SPECIAL_SPEED : 1 pour les neuf (jamais tirés par le moteur de circulation).
export const specialKey = (s: SpecialSpec): string => `sp|${s.id}|${s.seed}|${s.label ?? ''}|${s.paint ?? ''}|${…ligne…}`;
```

`Person` reçoit `outfit?: Outfit`, recopié par `model()` dans le siège (`...(p.outfit ? { outfit: p.outfit } : {})`). Uniformes :

```ts
const SKINS = ['#F1C9A5', '#E0A97F', '#C68A5E', '#8D5A3B', '#5E3A26'] as const;
const uniform = (seed: number, i: number, top: string, hair: Outfit['hair'], hat: string): Outfit => ({
  skin: SKINS[(seed + i * 3) % SKINS.length]!, hair, hairColor: '#2A1D16', hatColor: hat, top: 'jacket', topColor: top, bottom: 'pants', bottomColor: top, accessory: 'none', accessoryColor: top,
});
```

Cas de `build()` (couleurs reprises des sprites classiques ; `paint` = `s.paint ?? '#4B5320'`) :

```ts
case 'crew-van':
  return model({
    color: '#ecebe6',
    body: 'M-25 -5 L-25 -22 Q-25 -24 -23 -24 L13 -24 Q19 -24 22 -17 L25 -14.4 Q26 -13.4 26 -10 L26 -5 Q26 -4 24.6 -4 L-23.6 -4 Q-25 -4 -25 -5 Z',
    paint: [fill(rect(-24.6, -13, 25.6, -10.6), '#e8601c'), line('M-22 -25.5 L10 -25.5 M-20 -25.5 L-20 -24 M-6 -25.5 L-6 -24 M8 -25.5 L8 -24', '#8a9098', 0.8)],
    windows: ['M13 -22 L18.6 -22 Q21 -21 22.4 -16 L13 -16 Z'],
    people: [{ x: 16.6, y: -18.8, k: BUST * 0.8 }],
    wheels: [[-14, 4], [15, 4]],
    arch: { r: 5.6, y: -4.4, color: '#d6d4cc' },
    chrome: [[-26, -6.4, 3, 1.8], [24, -6.4, 3, 1.8]],
    lamp: [25.4, -9], tail: [-24.6, -12], exhaust: [-24.6, -3.6],
  }, s.seed);
case 'flatbed':
  return model({
    color: '#2f5e8e',
    under: [piece(rect(-46, -7.5, 28, -4.6), '#2e323c'), piece(rect(-46, -11, 24, -7.5), '#7a5a3a'), fill(rect(-46, -12.6, 24, -11), '#b9bec4', { ink: 0.3 }),
      piece(rect(20, -30, 23.4, -12), '#e8b923'), line('M21.7 -28.5 L-10 -26', '#e8b923', 1.8), line('M-10 -26 L-10 -21', INK, 0.4)],
    body: 'M24 -4.6 L24 -26 Q24 -28 26.5 -28 L39 -28 Q44 -27.4 45.6 -20 L46.4 -14 Q46.6 -12 46.6 -10 L46.6 -5.6 Q46.6 -4.6 45.4 -4.6 Z',
    paint: [line('M31 -25 L31 -8', '#244a70', 0.6), fill(rr(27, -30, 5, 2, 0.8), '#e8601c')],
    windows: ['M33 -25.4 L40 -25.4 Q43.4 -24.6 44.4 -17.6 L33 -17.6 Z'],
    people: [{ x: 37.4, y: -21.6, k: BUST * 0.8 }],
    wheels: [[-33, 4.5], [-22, 4.5], [36, 4.5]],
    lamp: [46, -10], tail: [-45.6, -9.4], exhaust: [-46, -5.6], x0: -46,
  }, s.seed);
case 'lift':
  return model({
    color: '#ecebe6',
    under: [piece(rect(-32, -12, 16.4, -5), '#e8b923'), fill(rect(-32, -8, 16, -6.8), '#3b3f4a'), piece(rr(-23, -18, 10, 6, 1), '#e8b923')],
    body: 'M16 -4.6 L16 -22 Q16 -24 18.4 -24 L27 -24 Q31 -23.4 32 -17 L32.6 -12 L32.6 -5.6 Q32.6 -4.6 31.4 -4.6 Z',
    windows: ['M22 -21.6 L27.6 -21.6 Q30 -21 30.8 -15 L22 -15 Z'],
    people: [{ x: 25.8, y: -18.6, k: BUST * 0.8 }],
    wheels: [[-20, 4.5], [22, 4.5]],
    beacons: [{ x: 20, y: -26, w: 4, h: 2, on: '#ff7a1c', off: '#8a3a12' }],
    lamp: [32.4, -10], tail: [-31.6, -10], exhaust: [-31.6, -5.4], x0: -32,
  }, s.seed);
case 'moving-truck':
  return model({
    color: '#f1f0ea',
    body: `${rr(-32, -34, 42, 28, 1.5)} M10 -6 L10 -24 L24 -24 Q31 -24 32 -14 L32 -6 Z`,
    under: [piece(rect(-32, -6.4, 32, -4.4), '#3a3f4a')],
    paint: [piece('M10 -6 L10 -24 L24 -24 Q31 -24 32 -14 L32 -6 Z', '#2e6fd6', -0.2), fill(rect(-31.6, -17, 9.6, -13), '#2e6fd6'),
      piece(rect(-15, -29, -7, -22), '#c8a06a'), fill(rect(-15, -26, -7, -25.1), '#8a6a3a')],
    windows: ['M22 -22 L25 -22 Q29 -22 30 -15 L22 -15 Z'],
    people: [{ x: 25.4, y: -19, k: BUST * 0.75 }],
    wheels: [[-20, 4.5], [22, 4.5]],
    lamp: [31.4, -10], tail: [-31.6, -9], exhaust: [-31, -4.4],
  }, s.seed);
case 'army-jeep': {
  const c = s.paint ?? '#4B5320';
  const tunic = c === '#B49A6A' ? '#8C7A55' : '#3E4420';
  return model({
    color: c,
    under: [fill(circlePath(-21, -11, 3.4), '#2a2a26', { ink: 0.5 }), fill(circlePath(-21, -11, 1.3), c)],
    body: 'M-19 -5 L-19 -17 L-9 -17 L-9 -14 L3 -14 L3 -16 L12 -16 L12 -14 L17 -14 Q19 -14 19 -12 L19 -6 Q19 -5 18 -5 Z',
    over: [fill('M4.4 -15.6 L8.4 -24 L11 -24 L7.6 -15.6 Z', '#c9dde6', { alpha: 0.6 }), line('M4.4 -15.6 L8.4 -24 L11 -24 L7.6 -15.6 Z', c, 1.1)],
    people: [
      { x: 5, y: -18.4, k: BUST * 0.72, outfit: uniform(s.seed, 0, tunic, 'cap', tunic) },
      { x: -3, y: -7.5, k: 0.6, role: 'rear', gait: 'stand', arms: 'down', outfit: uniform(s.seed, 1, tunic, 'cap', '#2B3A6A') },
    ],
    wheels: [[-11, 4.4], [12, 4.4]],
    lamp: [18.6, -11], tail: [-18.6, -12], exhaust: [-19, -4.6], x0: -24.4, top: -24,
  }, s.seed);
}
case 'army-truck': {
  const c = s.paint ?? '#4B5320';
  return model({
    color: c,
    under: [piece(rect(-27, -12, 27, -7), '#2e2e26'), piece('M-27 -12 L-27 -30 Q-27 -33 -24 -33 L6 -33 Q9 -33 9 -30 L9 -12 Z', c === '#B49A6A' ? '#C9B48A' : '#6A6E45'),
      line('M-18 -32 L-18 -13 M-9 -32 L-9 -13 M0 -32 L0 -13', '#000000', 0.8, 0.18)],
    body: 'M11 -7 L11 -26 L21 -26 L27 -18 L27 -7 Z',
    windows: ['M20 -24 L25 -18 L20 -18 Z'],
    people: [{ x: 21.6, y: -20.6, k: BUST * 0.7, outfit: uniform(s.seed, 0, '#3E4420', 'cap', '#3E4420') }],
    wheels: [[-20, 4.5], [-10, 4.5], [17, 4.5]],
    lamp: [26.6, -11], tail: [-26.6, -10], exhaust: [-27, -6], x0: -27,
  }, s.seed);
}
case 'tank': {
  const c = s.paint ?? '#4B5320';
  return model({
    color: c,
    under: [piece(rr(-30, -9, 60, 9, 4.5), '#2a2a26')],
    body: 'M-30 -9 L-27 -16 L24 -16 L31 -9 Z',
    paint: [piece('M-14 -16 L-12 -23 L6 -23 L10 -16 Z', c, -0.2), piece(rect(9, -21.4, 34, -19.4), c), fill(rect(30, -22, 34, -18.8), '#2a2a26')],
    people: [{ x: -5.5, y: -12, k: 0.55, gait: 'stand', arms: 'down', outfit: uniform(s.seed, 0, '#3E4420', 'beanie', '#2A2A26') }],
    wheels: [[-22, 3], [-13, 3], [-4, 3], [5, 3], [14, 3], [23, 3]],
    lamp: [30, -11], tail: [-29.6, -11], exhaust: [-30, -10], x1: 34, top: -24,
  }, s.seed);
}
case 'fire-truck': {
  const red = r() < 0.5 ? '#C8102E' : '#B5121B';
  const rungs = Array.from({ length: 14 }, (_, i) => { const x = -42 + i * 6; const y = -29 - ((x + 44) / 82) * 5; return `M${f(x)} ${f(y)} L${f(x)} ${f(y - 3)}`; }).join(' ');
  return model({
    color: red,
    body: `${rr(-46, -26, 66, 20, 2)} M20 -6 L20 -30 L34 -30 L42 -18 L42 -6 Z`,
    paint: [fill(rect(-46, -15, 42, -12.6), '#F4F6F8'), ...[-40, -30, -20, -10, 0, 10].map((x) => fill(rr(x, -24, 7, 7, 0.6), '#9E0E22', { ink: 0.3 })),
      line('M-44 -29 L38 -34 M-44 -32 L38 -37', '#9aa2ac', 1.2), line(rungs, '#9aa2ac', 0.8), piece(rect(-46, -30, -42, -26), '#555555')],
    windows: [rect(22, -27, 31, -19), 'M33 -28 L40 -18 L33 -18 Z'],
    people: [
      { x: 35, y: -22.4, k: BUST * 0.7, outfit: uniform(s.seed, 0, '#1F2A4A', 'cap', '#c8ccd2') },
      { x: 25, y: -22.4, k: BUST * 0.7, outfit: uniform(s.seed, 1, '#1F2A4A', 'cap', '#c8ccd2') },
      { x: 29, y: -22.6, k: BUST * 0.7, outfit: uniform(s.seed, 2, '#1F2A4A', 'cap', '#c8ccd2') },
    ],
    wheels: [[-34, 5], [-14, 5], [30, 5]],
    beacons: [{ x: 24, y: -33, w: 4, h: 3, on: '#3F6BFF', off: '#1d2c66' }, { x: 30, y: -33, w: 4, h: 3, on: '#3F6BFF', off: '#1d2c66' }],
    lamp: [41.6, -10], tail: [-45.6, -10], exhaust: [-46, -5.6], top: -37,
  }, s.seed);
}
case 'garde-moto':
  return model({
    color: '#F4F6F8',
    body: 'M-13 -10 L-4 -16 L6 -16 L13 -9 L9 -6 L-8 -6 Z',
    paint: [fill('M6 -16 L11 -24 L13 -23 L9 -15 Z', '#c9dde6', { alpha: 0.7, ink: 0.4 }), piece(rect(-12, -14, -6, -10), '#2E4FA8')],
    people: [{ x: -2, y: -15, k: 0.7, gait: 'mount', arms: 'handlebar', over: true, outfit: uniform(s.seed, 0, '#1F2A4A', 'cap', '#F4F6F8') }],
    wheels: [[-11, 6], [11, 6]],
    beacons: [{ x: -13.2, y: -18.4, w: 2.4, h: 2.4, on: '#4F7BFF', off: '#1d2c66' }],
    lamp: [12.4, -11], tail: [-12.6, -10], exhaust: null, top: -34,
  }, s.seed);
```

`RIMS` : `tank: ['tôle', '#3e3e36']`, `'army-jeep'`/`'army-truck'`: `['tôle', '#3e3e36']`, `'garde-moto': ['rayons', CHROME]`, `'fire-truck': ['enjoliveur', CHROME]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/library/city/traffic/special-art.test.ts tests/core/library/city/traffic`
Expected: PASS (les tests `it.each(SPECIAL_IDS)` couvrent aussi les neuf nouveaux : conducteur, roues, encombrement).

- [ ] **Step 5: Commit**

```bash
git add src/core/library/city/traffic/car-art.ts src/core/library/city/traffic/special-art.ts tests/core/library/city/traffic/special-art.test.ts
git commit -m "feat(bibliotheque): modèles peints des véhicules scénarisés (équipes, déménagement, défilé)"
```

---

### Task 2: GhibliCar sans boucle (roues par transition CSS, peinture immédiate, cabine vide, gyrophares SMIL)

**Files:**
- Modify: `src/content/vehicle/ghibli-car.tsx`
- Test: `tests/content/vehicle/ghibli-car.test.tsx`

**Interfaces:**
- Consumes: `Seat.outfit` (tâche 1).
- Produces: `GhibliCar` props ajoutées : `roll?: { x: number; move?: string }` (x : position du véhicule en unités du véhicule, dans le repère du monde ; angle de chaque roue = x / r rad, posé par `style.transform` avec la transition `move`), `paintNow?: boolean` (comme `still` pour la peinture), `occupied?: boolean` (défaut vrai ; faux : aucun siège), `blink?: boolean` (gyrophares clignotants par `<animate>` quand aucune boucle ne les pose).

- [ ] **Step 1: Write the failing tests**

```tsx
describe('voiture Ghibli sans boucle (V5)', () => {
  const look = specialLook({ id: 'crew-van', seed: 1 });
  const render = async (el: React.ReactElement): Promise<HTMLElement> => {
    const host = document.createElement('div');
    await act(async () => createRoot(host).render(<svg><Probe />{el}</svg>));
    return host;
  };
  it('roll : angle = x / r, transition des roues = celle du véhicule', async () => {
    const host = await render(<GhibliCar look={look} dir={1} sky={sky} rainy={false} lights={false} roll={{ x: 40, move: 'transform 60s linear' }} paintNow />);
    const spin = host.querySelectorAll<SVGGElement>('[data-wheel-spin]');
    expect(spin).toHaveLength(2);
    expect(spin[0]!.style.transform).toBe(`rotate(${((40 / 4) * 180 / Math.PI).toFixed(2)}deg)`);
    expect(spin[0]!.style.transition).toBe('transform 60s linear');
  });
  it('paintNow : toutes les images ont un href dès le premier rendu, et au rendu suivant (nuit) la nouvelle', async () => {
    const host = await render(<GhibliCar look={look} dir={-1} sky={sky} rainy={false} lights={false} roll={{ x: 0 }} paintNow />);
    for (const img of host.querySelectorAll('image')) expect(img.getAttribute('href')).toMatch(/^data:|^blob:/);
  });
  it('occupied faux : aucun siège', async () => {
    const host = await render(<GhibliCar look={look} dir={1} sky={sky} rainy={false} lights={false} occupied={false} />);
    expect(host.querySelectorAll('[data-seat]')).toHaveLength(0);
  });
  it('blink : <animate> sur les gyrophares, aucun en mouvement réduit', async () => {
    const lift = specialLook({ id: 'lift', seed: 1 });
    expect((await render(<GhibliCar look={lift} dir={1} sky={sky} rainy={false} lights={false} blink />)).querySelectorAll('[data-beacon] animate')).toHaveLength(1);
    expect((await render(<GhibliCar look={lift} dir={1} sky={sky} rainy={false} lights={false} blink still />)).querySelectorAll('[data-beacon] animate')).toHaveLength(0);
  });
  it('mouvement réduit : pas de transition sur les roues', async () => {
    const host = await render(<GhibliCar look={look} dir={1} sky={sky} rainy={false} lights={false} roll={{ x: 10, move: 'transform 60s linear' }} still />);
    expect(host.querySelector<SVGGElement>('[data-wheel-spin]')!.style.transition).toBe('');
  });
});
```

(Import `specialLook` depuis `special-art`. Pour le test « paintNow », jsdom n'a pas de canvas : vérifier comment les tests existants font peindre `reg.ensure` — le registre renvoie une data URL factice en test ; garder la même attente que le test existant « jour → nuit ».)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/content/vehicle/ghibli-car.test.tsx`
Expected: FAIL (props inconnues, pas de `[data-wheel-spin]`).

- [ ] **Step 3: Implement**

- `outfitOf = (s) => s.outfit ?? outfitFor('ordinary', mulberry32(s.outfitSeed))`.
- Signature : `{ look, dir, sky, rainy, lights, still = false, roll, paintNow = false, occupied = true, blink = false }`.
- `shownOf` : `if (prevHref === null || still || paintNow) return { href: reg.ensure(key, paint), shown: key };`
- Sièges : `const seats = occupied ? art.seats : [];` utilisé pour `occupants`, `overSeats` et `driver` (le volant disparaît avec le conducteur).
- Roues : avec `roll`, le groupe `[data-wheel]` garde `translate(...)` seul et contient

```tsx
<g data-wheel-spin="" style={{ transform: `rotate(${n2((roll.x / w.r) * DEG)}deg)`, transition: still ? undefined : roll.move }}>
  <image … />
</g>
```

  (sans `roll`, inchangé : `translate(...) rotate(0)` et image enfant directe, lus par `placeCar`). Le sélecteur de `hrefOf` devient `[data-wheel][data-r="${w.r}"] image`.
- Gyrophares : enfant `{blink && !still && b.off && <animate attributeName="fill" values={`${b.on};${b.off};${b.on}`} dur="0.66s" begin={`${(i % 2) * 0.33}s`} repeatCount="indefinite" />}`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/content/vehicle tests/content/traffic-layer.test.tsx`
Expected: PASS (comportement de la circulation inchangé).

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(bibliotheque): voiture Ghibli sans boucle (roues par transition, peinture immédiate, cabine vide, gyrophares)"
```

---

### Task 3: `ScriptedCar` — véhicule peint dans le repère du sprite classique

**Files:**
- Create: `src/content/vehicle/scripted-car.tsx`
- Test: `tests/content/vehicle/scripted-car.test.tsx`

**Interfaces:**
- Consumes: `GhibliCar` (tâche 2), `specialLook` (tâche 1).
- Produces:

```tsx
// Véhicule scénarisé peint (spec véhicules V5). Repère : celui du sprite classique AVANT sa mise à l'échelle par l'appelant
// (le parent applique `scale(dir·k, k)` en classique) ; ici on reçoit `k` et `dir` et on applique `scale(k)` à GhibliCar
// (qui porte le sens sans miroir) et `scale(dir·k, k)` aux éléments dynamiques (`children`, dessin classique).
export type ScriptedCarProps = {
  spec: SpecialSpec; dir: 1 | -1; k: number; sky: Sky; rainy: boolean; lights: boolean; still: boolean;
  // Position du véhicule (px du monde) et transition de son déplacement : roues par transition CSS. Absent : la boucle les pose
  // (défilé, `data-scripted-car`).
  roll?: { worldX: number; move?: string };
  occupied?: boolean; under?: ReactNode; children?: ReactNode;
};
export function ScriptedCar(p: ScriptedCarProps): ReactElement;
// Pose par une boucle (défilé) : recompose le look depuis data-sid/data-seed/data-paint.
export function placeScripted(fig: FigureRegistry, cars: CarRegistry, node: Element, dist: number, v: number, dir: 1 | -1, t: number): void;
```

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
describe('ScriptedCar', () => {
  it('GhibliCar à l’échelle k, éléments dynamiques en miroir pour dir −1', async () => {
    const host = await mount(<ScriptedCar spec={{ id: 'crew-van', seed: 1 }} dir={-1} k={1.5} sky={sky} rainy={false} lights={false} still={false} roll={{ worldX: 120, move: 'transform 60s linear' }}><rect data-probe="" x={-25} y={-20} width={5} height={10} /></ScriptedCar>);
    expect(host.querySelector('[data-scripted-car]')!.getAttribute('transform')).toBe('scale(1.500)');
    expect(host.querySelector('[data-probe]')!.parentElement!.getAttribute('transform')).toBe('scale(-1.500 1.500)');
    // roll.x = worldX / k
    expect(host.querySelector<SVGGElement>('[data-wheel-spin]')!.style.transform).toBe(`rotate(${((80 / 4) * 180 / Math.PI).toFixed(2)}deg)`);
  });
  it('classique jamais touché : aucun pantin, aucune image si GhibliCar absent (contrôle : rendu attendu = 1 [data-ghibli-car])', async () => {
    const host = await mount(<ScriptedCar spec={{ id: 'tank', seed: 1, paint: '#4B5320' }} dir={1} k={1} sky={sky} rainy={false} lights={false} still />);
    expect(host.querySelectorAll('[data-ghibli-car]')).toHaveLength(1);
    expect(host.querySelector('[data-scripted-car]')!.getAttribute('data-paint')).toBe('#4B5320');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/content/vehicle/scripted-car.test.tsx` → FAIL (module absent).

- [ ] **Step 3: Implement**

```tsx
export function ScriptedCar({ spec, dir, k, sky, rainy, lights, still, roll, occupied = true, under, children }: ScriptedCarProps): ReactElement {
  const look = specialLook(spec);
  const kk = k.toFixed(3);
  return (
    <>
      {under && <g transform={`scale(${(dir * k).toFixed(3)} ${kk})`}>{under}</g>}
      <g data-scripted-car="" data-sid={spec.id} data-seed={spec.seed} data-paint={spec.paint ?? ''} transform={`scale(${kk})`}>
        <GhibliCar look={look} dir={dir} sky={sky} rainy={rainy} lights={lights} still={still} occupied={occupied}
          paintNow={!!roll} blink={!!roll} roll={roll ? { x: roll.worldX / k, move: roll.move } : undefined} />
      </g>
      {children && <g transform={`scale(${(dir * k).toFixed(3)} ${kk})`}>{children}</g>}
    </>
  );
}
export function placeScripted(fig: FigureRegistry, cars: CarRegistry, node: Element, dist: number, v: number, dir: 1 | -1, t: number): void {
  const car = node.querySelector('[data-ghibli-car]');
  if (!car) return;
  const paint = node.getAttribute('data-paint') || undefined;
  const spec: SpecialSpec = { id: node.getAttribute('data-sid') as SpecialId, seed: Number(node.getAttribute('data-seed')), ...(paint ? { paint } : {}) };
  placeCar(fig, cars, car, { look: specialLook(spec), dist, v, lean: 0, seed: spec.seed }, dir, t);
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git add src/content/vehicle/scripted-car.tsx tests/content/vehicle/scripted-car.test.tsx && git commit -m "feat(bibliotheque): véhicule scénarisé peint dans le repère du sprite classique"`

---

### Task 4: Véhicules des équipes en Ghibli (camionnette, camion plateau, nacelle)

**Files:**
- Modify: `src/content/install-sprites.tsx` (Van, Flatbed, LiftTruck)
- Modify: `src/content/install-layer.tsx:296-358` et `:1059-1062`
- Test: `tests/content/install-layer.test.tsx`

**Interfaces:**
- Consumes: `ScriptedCar` (tâche 3).
- Produces: `Van`, `Flatbed`, `LiftTruck` reçoivent `ghibli?: { rainy: boolean; dir: 1 | -1; k: number; worldX: number; move?: string; occupied: boolean; still: boolean }`. En Ghibli, l'appelant N'applique PLUS `scale(dir·k, k)` autour (ScriptedCar s'en charge) ; les marqueurs `data-van`, `data-van-open`, `data-flatbed`, `data-flatbed-open`, `data-lift` restent sur la racine.

- [ ] **Step 1: Write the failing tests** (dans `install-layer.test.tsx`, en reprenant le montage existant d'un jeu avec camionnette, camion plateau et nacelle, `ghibli` vrai)

```tsx
it('Ghibli : camionnette, camion plateau et nacelle peints, marqueurs du script conservés', async () => {
  const host = await mountInstall({ ghibli: true /* même date/minute que le test « camionnette garée » existant */ });
  const van = host.querySelector('[data-install-van][data-transport="van"]')!;
  expect(van.querySelector('[data-scripted-car][data-sid="crew-van"]')).not.toBeNull();
  expect(van.querySelectorAll('[data-stored-item]').length).toBeGreaterThan(0);
  expect(host.querySelector('[data-lift-truck] [data-scripted-car][data-sid="lift"]')).not.toBeNull();
  expect(host.querySelector('[data-lift-truck] [data-lift-arm]')).not.toBeNull();
});
it('Ghibli : cabine vide une fois l’équipe descendue', async () => {
  const host = await mountInstall({ ghibli: true /* minute où vanCrewAt → 'out' */ });
  expect(host.querySelector('[data-install-van] [data-seat]')).toBeNull();
});
it('Ghibli, sens du fond : portière ouverte du côté de l’arrière peint', async () => {
  const host = await mountInstall({ ghibli: true /* minute portière ouverte, dir −1 */ });
  const door = host.querySelector('[data-van-door]')!;
  expect(door.closest('g[transform^="scale(-"]')).not.toBeNull();
});
it('classique inchangé : aucun [data-scripted-car]', async () => {
  expect((await mountInstall({ ghibli: false })).querySelector('[data-scripted-car]')).toBeNull();
});
```

(Les minutes exactes se lisent dans les tests voisins qui posent déjà `data-van-phase` et `data-van-open` ; réutiliser leurs constantes.)

- [ ] **Step 2: Run** — `npx vitest run tests/content/install-layer.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`Van` : en Ghibli,

```tsx
if (ghibli) return (
  <g data-van="" data-van-open={open ? 'true' : 'false'}>
    <ScriptedCar spec={{ id: 'crew-van', seed: 1 }} dir={ghibli.dir} k={ghibli.k} sky={sky} rainy={ghibli.rainy} lights={lights} still={ghibli.still} occupied={ghibli.occupied} roll={{ worldX: ghibli.worldX, move: ghibli.move }}>
      {stored.map((id) => <g key={id} data-stored-item={id} data-carried="van" />)}
      {open && <VanDoor sky={sky} />}
      {ladder && <VanRoofLadder sky={sky} />}
    </ScriptedCar>
  </g>
);
```

où `VanDoor` et `VanRoofLadder` sont extraits tels quels du dessin classique (le classique les réutilise : nœuds identiques).

`Flatbed` : extraire `FlatbedLoadArt({ sky, load })` (les `pieces`), `FlatbedTailgate({ sky, open })` ; en Ghibli : `ScriptedCar` `flatbed` avec pour enfants `pieces`, hayon, échelle rangée.

`LiftTruck` : en Ghibli, le groupe `scale(dir·k, k)` est remplacé par `ScriptedCar` `lift` avec `under` = stabilisateurs (dessinés sous la caisse, comme en classique) et enfants = `cargo` posé en `LIFT_CRATE` ; bras, coude, pivot et nacelle inchangés (repère du monde). `occupied` = `!g.inside && !g.inBucket` est FAUX quand le conducteur est sorti : passer `occupied={g.inside}`.

`install-layer.tsx` : pour la camionnette / le camion plateau,

```tsx
const gh = ghibli ? { rainy, dir: st.dir, k, worldX: st.x, move: VAN_MOVE, occupied: vc.phase === 'inside', still } : undefined;
// …
<g … style={…}>{gh ? art : <g transform={`scale(${(st.dir * k).toFixed(3)} ${k.toFixed(3)})`}>{art}</g>}</g>
```

(le vélo porteur reste tel quel). Nacelle : `ghibli={inp.ghibli ? { rainy: inp.rainy, dir: g.dir, k: kv, worldX: g.tx, move: MOVE, occupied: g.inside, still: false } : undefined}`.

- [ ] **Step 4: Run** — `npx vitest run tests/content/install-layer.test.tsx tests/content/install-sprites*.test.tsx` → PASS (les 1-4 échecs de délai connus sur main sont à comparer avec main : `git stash` interdit, lancer le même fichier dans `..\Wikimasters tools`).
- [ ] **Step 5: Commit** — `git commit -am "feat(bibliotheque): camionnette, camion plateau et nacelle des équipes en Ghibli"`

---

### Task 5: Camion de déménagement en Ghibli

**Files:**
- Modify: `src/content/moving-truck.tsx:116-176`, `src/content/city-life.tsx:630-645`
- Test: `tests/content/moving-ghibli.test.tsx`

**Interfaces:**
- Consumes: `ScriptedCar`.
- Produces: `MovingTruck` reçoit `ghibli?: boolean` et `rainy?: boolean`.

- [ ] **Step 1: Write the failing test** (dans `moving-ghibli.test.tsx`, montage existant du déménagement)

```tsx
it('Ghibli : camion peint, hayon conservé, roues tournées par la même transition que le camion', async () => {
  const host = await mountMoving({ ghibli: true, step: 'truck-arrives' });
  const truck = host.querySelector('[data-moving-truck]')!;
  expect(truck.querySelector('[data-scripted-car][data-sid="moving-truck"]')).not.toBeNull();
  expect(truck.querySelector('[data-tailgate-panel]')).not.toBeNull();
  const spin = truck.querySelector<SVGGElement>('[data-wheel-spin]')!;
  expect(spin.style.transition).toBe((truck as SVGGElement).style.transition);
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — extraire `Tailgate({ open, sky, still })` de `TruckSprite` ; en Ghibli :

```tsx
const move = still ? undefined : `transform 60s ${s.at === 'out' ? 'ease-in' : 'ease-out'}`;
// enfant du <g style={…}> :
ghibli
  ? <ScriptedCar spec={{ id: 'moving-truck', seed: hashString(view.slot.id) }} dir={g.away} k={g.kv} sky={sky} rainy={rainy} lights={lights} still={still} occupied={s.at !== 'park'} roll={{ worldX: x, move }}>
      <g transform={`translate(${TRUCK_REAR} ${HINGE_Y})`}><Tailgate open={s.open} sky={sky} still={still} /></g>
    </ScriptedCar>
  : <g transform={`scale(…)`}><TruckSprite … /></g>
```

`move` et la transition du `<g>` parent sont la même chaîne (une seule variable). `city-life.tsx` passe `ghibli={ghibli}` et `rainy={rainy}`.

- [ ] **Step 4: Run** — `npx vitest run tests/content/moving-ghibli.test.tsx tests/content/moving-truck.test.tsx` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(bibliotheque): camion de déménagement en Ghibli"`

---

### Task 6: Véhicules du défilé en Ghibli

**Files:**
- Modify: `src/content/parade-sprites.tsx` (Jeeps, Trucks, Tanks, Firetruck, Motorbikes)
- Modify: `src/content/parade-layer.tsx` (boucle)
- Test: `tests/content/parade-layer.test.tsx`

**Interfaces:**
- Consumes: `ScriptedCar`, `placeScripted` (tâche 3) ; `useCarRegistry`.
- Produces: en Ghibli, chaque véhicule d'unité est un `ScriptedCar` sans `roll` (`dir` 1, `k` 1 : l'unité est déjà à l'échelle), graine `hashString(`${unit.id}-${i}`)`, `paint` = teinte d'armée de l'unité ; drapeaux (`Tricolore`) et pointillés des chenilles restent par-dessus (enfants).

- [ ] **Step 1: Write the failing test**

```tsx
it('Ghibli : jeeps, camions, chars, pompiers et motos peints ; la boucle tourne les roues', async () => {
  // Défilé du 14 juillet à 10 h 40, ghibli vrai, les deux files (montage existant).
  const host = await mountParade({ ghibli: true });
  const ids = [...host.querySelectorAll('[data-scripted-car]')].map((e) => e.getAttribute('data-sid'));
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) expect(['army-jeep', 'army-truck', 'tank', 'fire-truck', 'garde-moto']).toContain(id);
  const w = host.querySelector('[data-scripted-car] [data-wheel]')!;
  const before = w.getAttribute('transform');
  await advance(1000); // fait tourner useWallClockLoop (même aide que les tests voisins)
  expect(w.getAttribute('transform')).not.toBe(before);
});
it('classique : aucun [data-scripted-car]', async () => {
  expect((await mountParade({ ghibli: false })).querySelector('[data-scripted-car]')).toBeNull();
});
```

(Pour forcer la présence d'une unité de véhicules, reprendre la graine du test existant qui vérifie `data-parade-unit="tanks"` ou passer par `units.mjs` du banc pour trouver une minute où jeeps/chars sont dans le champ.)

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**

Dans chaque `Jeep`/`Truck`/`Tank`/`Firetruck`/`Motorbike`, quand `sky` (Ghibli) est présent :

```tsx
// Jeep (Ghibli)
return (
  <ScriptedCar spec={{ id: 'army-jeep', seed, paint }} dir={1} k={1} sky={sky} rainy={false} lights={false} still={!anim}>
    {[-17, -14].map((x, i) => (
      <g key={x}>
        <line x1={x} y1={-17} x2={x - 1} y2={-34 + i * 2} stroke={t('#333333')} strokeWidth={0.6} />
        <g transform={`translate(${x - 1} 0)`}><Tricolore t={t} top={-34 + i * 2} w={7} h={4.6} anim={anim} /></g>
      </g>
    ))}
  </ScriptedCar>
);
```

`Tank` : enfants = rectangle des chenilles en pointillés animés (le même nœud que le classique) et le drapeau ; `Firetruck` : aucun enfant (échelle et gyrophares peints) ; `Truck` : aucun ; `Motorbike` : aucun. Chaque composant reçoit `seed` (Jeeps : `hashString(`${unit.id}-0`)` et `-1`). Le classique (`sky` absent) reste tel quel.

`parade-layer.tsx`, dans `place` (Ghibli seulement), pour chaque unité visible :

```tsx
const cars = carsOf.get(node) ?? collect(node, '[data-scripted-car]'); // même mécanisme que marchersOf
const dist = (PARADE_SPEED * (t - u.start)) / k;
for (const c of cars) placeScripted(figures, carReg, c, dist, PARADE_SPEED / k, 1, t);
```

avec `const carReg = useCarRegistry();` et un `cars.flush()` n'est pas nécessaire (déjà fait par la boucle de circulation ; vérifier dans `traffic-layer.tsx` qui appelle `flush`, sinon l'appeler ici une fois par passage).

- [ ] **Step 4: Run** — `npx vitest run tests/content/parade-layer.test.tsx tests/content/parade-crowd.test.tsx tests/core/library/city-parade.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(bibliotheque): jeeps, camions, chars, pompiers et motos du défilé en Ghibli"`

---

### Task 7: Captures auto-validées, vérifications, PR, pré-prod

**Files:**
- Banc : `.superpowers/harness-ville` du worktree (copié de `..\Wikimasters-v4`, port 5220), captures dans `Wikimasters tools/.superpowers/captures-vehicules-v5/`.

- [ ] **Step 1:** `npx tsc --noEmit` et `npx vitest run tests/content tests/core/library` (comparer les échecs connus avec main).
- [ ] **Step 2:** Planche `planche.html?ids=crew-van,flatbed,lift,moving-truck,army-jeep,army-truck,tank,fire-truck,garde-moto&h=12` puis `h=21` : contrôler cotes, contours encrés, vitres, occupants, gyrophares ; corriger les modèles si besoin (et rejouer la tâche 1).
- [ ] **Step 3:** Scène réelle : une pose de décors avec camionnette + nacelle (`id=` d'un jeu de fête, ex. 14 juillet matin), un camion plateau (scène de la Fête de la musique), un déménagement (`shops=20700`), le défilé du 14 juillet à 10 h 40 ; captures SANS `date=` pour les roues (avec `date=` l'horloge est figée).
- [ ] **Step 4:** `npm run build` ; commit des éventuelles retouches.
- [ ] **Step 5:** `git push -u origin feat/bibliotheque-ghibli-vehicules-v5`, `gh pr create` (corps : quoi, d'où, comment, limites ; fin `🤖 Generated with [Claude Code](https://claude.com/claude-code)`), fusion, `npm run preprod` depuis main à jour.
- [ ] **Step 6:** Mettre à jour la mémoire `project_ghibli.md` et montrer les captures à l'utilisateur.

## Limites connues (à écrire dans la PR)

- Pas de fumée d'échappement pour les véhicules scénarisés (le réservoir de fumée appartient aux voies de circulation).
- Occupants des véhicules sans boucle immobiles (pas d'inertie au freinage) ; ceux du défilé suivent la boucle.
- Roues des véhicules d'équipe : rotation linéaire d'un rendu à la minute au suivant, comme leur déplacement.
