# G4b — Interactions employés-clients (Ghibli) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** remplacer, en Ghibli, les boucles de gestes indépendantes des commerces par un metteur en scène déterministe qui fait vivre de vraies interactions employés-clients (caractères, aléas, situations à plusieurs, groupes, étapes signature, pictos).

**Architecture:** cœur pur dans `src/core/library/city/shops/scene/` : `cast.ts` (arrivées d'un créneau) → `director.ts` (simulation à pas fixes de 0,25 s, machines à états, décisions selon la situation) → `Score` (partition de segments par acteur) lue à chaque image par `score.ts` (`actorsAt`). Rendu Ghibli dans `src/content/shop/shop-scene.tsx` qui remplace, en Ghibli seulement, les clients intérieurs de `ShopCustomers` et le personnel debout de `StaffLayer`. Gestes = nouvelles `ArmPose` du pantin + chorégraphies (poses clés) écrites par Fable.

**Tech Stack:** TypeScript, React 19 (SVG), vitest (jsdom, `createRoot` + `act`, pas de @testing-library), WXT. Worktree `C:\Users\maxim\Downloads\Wikimasters-ghibli`, branche `feat/bibliotheque-ghibli-g4b`.

**Spec:** `docs/superpowers/specs/2026-10-12-bibliotheque-ghibli-g4b-interactions-design.md` (lire en entier avant chaque tâche). Maquette validée : `C:\Users\maxim\Downloads\Wikimasters tools\.superpowers\brainstorm\g4b-interactions\maquette.html` (source des gestes, décisions et chorégraphies à porter).

## Global Constraints

- Ghibli seulement : le dessin classique (`ghibli=false`) ne change pas d'un pixel ; ses tests existants restent verts sans modification.
- Déterminisme : aucune lecture de `Math.random`, `Date.now` ou `performance.now` dans `scene/` ; RNG `mulberry32` + `hashString` de `src/core/library/scene-world.ts`.
- Créneaux : `counter`/`till`/`drink` 240 s, `browse`/`machine` 360 s, `table` 600 s, `chair` 600 s (tatoueur 900 s) ; `dance` hors G4b.
- Pas de simulation `STEP = 0.25` s ; `ARRIVAL_SHARE = 0.7` (aucune arrivée à la porte après 70 % du créneau) ; boutique au repos aux bornes du créneau.
- Composition des partis : solo 70 %, couple 12 %, parent-enfant 8 %, amis 10 % (amis surtout bar/café/restaurant : poids ×3 là, ×0,3 ailleurs, puis renormalisé).
- Pictos : au plus 1 par acteur toutes les 8 s, au plus 2 visibles par boutique à la fois, durée ~1 s.
- `CUSTOMER_SCALE` 0,55 → 0,8 ; `SHOP_SPRITE_CAP` 40 → 52 ; retrait par parti entier.
- Personne n'apparaît ni ne disparaît par magie (entrée/sortie par la porte, objets pris et posés/emportés).
- Mouvement naturel, pantin 3D vu sous tous les angles (yaw 0-15), cellulo (#2A1A18 encre, ombre violet-bleu à bord net).
- Visuels et séquences d'animation (tâches 1, 2, 6, 9) : **modèle Fable** ; code pur : Opus.
- Commentaires en français, densité et idiome du code voisin ; pas d'ESLint ; tests dans `tests/core/library/` et `tests/content/` (style `describe/it` en français).
- Pièges worktree : `node_modules` est une jonction vers le dépôt principal ; `.wxt/` doit exister (sinon `TSCONFIG_ERROR`). vitest avale `console.log` (`--silent=false --reporter=verbose`). La suite complète en parallèle a ~56 échecs de délai préexistants : lancer les fichiers touchés seuls.
- Avant chaque `git commit` : `git branch --show-current` doit afficher `feat/bibliotheque-ghibli-g4b`. Commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (ou Fable 5.1 pour ses tâches).
- Pas de fiche WikiHow. Mesures téléphone reportées à la fin de la migration Ghibli.

## Review Focus

1. Boutique qui ferme ou rideau qui baisse en plein créneau (gate qui passe à 0) : les clients déjà dedans finissent et sortent, personne n'est coupé net ; aucun nouveau n'entre.
2. Changement de minute / re-rendu React en pleine interaction : la partition est la même (cache par clé), aucun saut de pose ni de position.
3. Boutique très étroite (vitrine ≈ 30 px) ou un seul employé en pause : capacité réduite, file à 0-1 place, aucun chevauchement ni employé absent qui « sert ».
4. Plafond des figurants atteint : un couple ou une bande est retiré entier, jamais un acteur en pleine interaction au centre de la vue.
5. Heure figée (`date=` du banc, mouvement réduit) : `still` → acteurs posés à leur place de repos, aucune animation, pas d'erreur.

Tests correspondants : 1 et 3 → tâche 4 ; 2 → tâche 7 et 10 ; 4 → tâche 10 ; 5 → tâche 10.

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/core/library/figure/skeleton.ts` (mod.) | nouvelles `ArmPose`, allure `crouch` |
| `src/core/library/figure/bake.ts` (mod.) | cuisson de `crouch`, ancres inchangées |
| `src/core/library/city/shops/scene/moves.ts` | bibliothèque de gestes : poses clés, durées, objet, picto |
| `src/core/library/city/shops/scene/types.ts` | types partagés (Party, Actor, Segment, Score, StreetState…) |
| `src/core/library/city/shops/scene/slots.ts` | créneaux par famille, index/temps de créneau |
| `src/core/library/city/shops/scene/cast.ts` | partis d'un créneau (composition, caractère, aléas, connaissances) |
| `src/core/library/city/shops/scene/stage.ts` | géométrie intérieure : postes, comptoir, places, file, tables, arrière-boutique |
| `src/core/library/city/shops/scene/director.ts` | simulation à pas fixes, enregistrement des segments |
| `src/core/library/city/shops/scene/behaviors/*.ts` | machines à états : `staff.ts`, `customer.ts`, `group.ts`, `table.ts`, `chair.ts` |
| `src/core/library/city/shops/scene/signatures.ts` | étapes signature des 10 métiers |
| `src/core/library/city/shops/scene/street.ts` | état de rue d'un créneau (pluie, défilé, car, klaxons) |
| `src/core/library/city/shops/scene/score.ts` | `actorsAt`, cache LRU des partitions |
| `src/core/library/city/traffic/engine.ts` (mod.) | publication des coups de klaxon |
| `src/content/shop/scene-props.tsx` | objets d'interaction en cellulo |
| `src/content/shop/picto.tsx` | 6 pictos manga |
| `src/content/shop/shop-scene.tsx` | rendu Ghibli des partitions + placement par la boucle |
| `src/content/city-life.tsx` (mod.) | branchement Ghibli, budget |
| `src/content/city-shops-life.tsx` (mod.) | `ShopCustomers`/`StaffLayer` : n'affichent plus l'intérieur en Ghibli |
| `src/core/library/city/shops/customers.ts`, `sprite-budget.ts` (mod.) | `CUSTOMER_SCALE`, plafond, retrait par parti |

---

### Task 1: Gestes du pantin (nouvelles ArmPose + allure crouch) — **Fable**

**Files:**
- Modify: `src/core/library/figure/skeleton.ts` (type `ArmPose`, `ARM_POSES`, `TARGETS`, pose `crouch`)
- Modify: `src/core/library/figure/bake.ts` (si l'allure a besoin d'un cas)
- Test: `tests/core/library/figure-g4b-poses.test.ts`

**Interfaces:**
- Produces: `ArmPose` étendu avec exactement : `'give' | 'take' | 'point' | 'chin' | 'wave' | 'beckon' | 'pay-card' | 'pay-cash' | 'wipe' | 'shelve' | 'phone' | 'yawn' | 'stretch' | 'read' | 'toast' | 'weigh' | 'wrap' | 'scissors' | 'shampoo' | 'taste' | 'sniff' | 'pour' | 'notepad' | 'plates' | 'mirror' | 'frames' | 'hold-child' | 'tug' | 'sneeze' | 'pick'` ; chaque geste animé a des variantes de poses clés suffixées `-1`, `-2` quand il en faut (ex. `'wipe-1' | 'wipe-2'`, `'scissors-1' | 'scissors-2'`, `'wrap-1' | 'wrap-2'`, `'stretch-1' | 'stretch-2'`, `'toast-1' | 'toast-2'`) ; `Gait` étendu de `'crouch'`.

- [ ] **Step 1: Lire** `skeleton.ts`, `bake.ts`, la maquette (`maquette.html`, fonctions de gestes et IK des bras) et `tests/core/library/figure-*.test.ts` existants.
- [ ] **Step 2: Test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import { ARM_POSES, YAWS } from '../../../src/core/library/figure/skeleton';
import { bakeFigure, anchorsOf } from '../../../src/core/library/figure/bake';
import { shapeFromSignature } from '../../../src/core/library/figure/dress';
import { SPRITE_BOX } from '../../../src/content/figure/figure-host';

const G4B = ['give', 'take', 'point', 'chin', 'wave', 'beckon', 'pay-card', 'pay-cash', 'wipe-1', 'wipe-2', 'shelve', 'phone', 'yawn', 'stretch-1', 'stretch-2', 'read', 'toast-1', 'toast-2', 'weigh', 'wrap-1', 'wrap-2', 'scissors-1', 'scissors-2', 'shampoo', 'taste', 'sniff', 'pour', 'notepad', 'plates', 'mirror', 'frames', 'hold-child', 'tug', 'sneeze', 'pick'] as const;

describe('gestes G4b du pantin', () => {
  it('déclare chaque geste', () => {
    for (const a of G4B) expect(ARM_POSES).toContain(a);
  });
  it('cuit chaque geste sous les 16 orientations, mains dans le cadre du sprite', () => {
    const sig = 'm|a|0|0|0|0';
    for (const arms of G4B) for (let yaw = 0; yaw < YAWS; yaw++) {
      const key = { sig, yaw, gait: 'stand' as const, phase: 0, head: 0, arms, lean: 0 };
      expect(bakeFigure(shapeFromSignature(sig), key).groups.length).toBeGreaterThan(0);
      const { handR, handL } = anchorsOf(key);
      for (const [x, y] of [handR, handL]) {
        expect(Math.abs(x)).toBeLessThan(-SPRITE_BOX.x0);
        expect(y).toBeGreaterThan(SPRITE_BOX.y0);
      }
    }
  });
  it("accroupi : bassin bas, pieds au sol, main droite près du sol avec 'pick'", () => {
    const key = { sig: 'm|a|0|0|0|0', yaw: 4, gait: 'crouch' as const, phase: 0, head: 0, arms: 'pick' as const, lean: 1 };
    expect(anchorsOf(key).handR[1]).toBeGreaterThan(-8);
  });
});
```

(Adapter `sig` à une signature valide lue dans les tests figure existants ; garder les assertions.)

- [ ] **Step 3: Lancer** `npx vitest run tests/core/library/figure-g4b-poses.test.ts` → FAIL (gestes absents).
- [ ] **Step 4: Implémenter** : cibles de main dans `TARGETS` (repère du torse f/u/o, comme l'existant) portées de l'IK de la maquette ; `crouch` = bassin à ~55 % de la hauteur debout, genoux pliés vers l'avant, pieds au sol ; regarder le rendu (script de planche : `.superpowers/harness-ville/planche.html` ou une page jetable dans le scratchpad) sous 4 orientations et corriger jusqu'à ce que chaque geste se lise à 21 px.
- [ ] **Step 5: Lancer** le test + `npx vitest run tests/core/library/figure tests/content/figure` → PASS.
- [ ] **Step 6: Commit** `feat(bibliotheque): gestes G4b du pantin (30 poses, accroupi)`.

### Task 2: Bibliothèque de gestes (chorégraphies) — **Fable**

**Files:**
- Create: `src/core/library/city/shops/scene/moves.ts`
- Test: `tests/core/library/shop-scene-moves.test.ts`

**Interfaces:**
- Consumes: `ArmPose`, `Gait` (tâche 1).
- Produces:

```ts
export type PictoId = 'question' | 'bang' | 'note' | 'joy' | 'sweat' | 'heart';
export type PropId = 'coin' | 'card' | 'ticket' | 'menu' | 'notepad' | 'plate' | 'glass' | 'parcel' | 'bouquet' | 'frames' | 'mirror' | 'sample' | 'cup' | 'book' | 'bag' | 'accessory';
export type Key = { at: number; arms: ArmPose; lean: 0 | 1 | 2; headYaw: number; gait?: 'stand' | 'seated' | 'crouch' | 'step' };
export type Move = {
  id: MoveId;
  dur: readonly [number, number]; // durée min/max (s), tirée par le metteur en scène
  keys: readonly Key[];           // at ∈ [0,1], croissant, premier at = 0 ; boucle si `loop`
  loop?: boolean;                 // poses clés rejouées en boucle pendant la durée (essuyer, ciseaux…)
  prop?: { id: PropId; hand: 'handR' | 'handL'; from: number; to: number }; // objet tenu entre deux fractions
  picto?: { id: PictoId; at: number };
};
export type MoveId = /* union littérale de tous les ids ci-dessous */ string;
export const MOVES: Readonly<Record<MoveId, Move>>;
export function keyAt(m: Move, u: number): Key; // u ∈ [0,1] : pose clé courante (pas d'interpolation de bras : sprites discrets)
```

Ids minimum (portés de la maquette) : accueil `greet`, `nod`, `wave-hello`, `wave-bye` ; demande `ask`, `point-item`, `chin-think`, `change-mind`, `ask-way`, `point-aisle` ; service `fetch`, `hand-over`, `take-item`, `prepare` ; paiement `pay-card`, `pay-cash`, `count-change`, `search-wallet`, `give-change`, `print-ticket` ; attente `wait`, `wait-impatient`, `beckon-wait` (« j'arrive »), `call-colleague`, `lean-counter`, `chat` ; boutique vide `tidy-shelf`, `wipe-counter`, `look-window`, `phone-idle`, `yawn`, `stretch`, `read-idle`, `colleague-chat` ; aléas `drop-coin`, `pick-coin`, `sneeze`, `phone-ring`, `child-tug`, `hold-child`, `child-point` ; groupes `couple-look`, `toast`, `ask-bill` ; reconnaissance `recognize`, `hug-hello`, `let-pass` ; restaurant `show-table`, `hand-menu`, `read-menu`, `take-order`, `carry-plates`, `serve-plate`, `eat`, `clear-table`, `bring-bill` ; signatures `weigh`, `wrap`, `cut-sample`, `taste`, `offer-frames`, `try-frames`, `look-mirror`, `hold-mirror`, `shampoo`, `cut-hair`, `pick-stems`, `compose-bouquet`, `pour-wine`, `sniff-wine`, `tattoo`, `wince`, `explain-box`, `listen-nod`, `brew-coffee` ; réactions `look-street`, `wait-rain`, `head-turn`.

- [ ] **Step 1: Test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import { ARM_POSES } from '../../../src/core/library/figure/skeleton';
import { MOVES, keyAt } from '../../../src/core/library/city/shops/scene/moves';

describe('bibliothèque de gestes', () => {
  const all = Object.values(MOVES);
  it('a au moins 80 gestes', () => expect(all.length).toBeGreaterThanOrEqual(80));
  it('poses clés valides et croissantes, durée positive', () => {
    for (const m of all) {
      expect(m.keys[0]!.at).toBe(0);
      for (let i = 1; i < m.keys.length; i++) expect(m.keys[i]!.at).toBeGreaterThan(m.keys[i - 1]!.at);
      for (const k of m.keys) expect(ARM_POSES).toContain(k.arms);
      expect(m.dur[0]).toBeGreaterThan(0);
      expect(m.dur[1]).toBeGreaterThanOrEqual(m.dur[0]);
      if (m.prop) expect(m.prop.from).toBeLessThan(m.prop.to);
    }
  });
  it('keyAt rend la pose clé courante, en boucle si loop', () => {
    const m = MOVES['wipe-counter']!;
    expect(m.loop).toBe(true);
    expect(keyAt(m, 0).arms).toBe(m.keys[0]!.arms);
    expect(keyAt(m, 0.999).arms).toBeDefined();
  });
});
```

- [ ] **Step 2: Lancer** → FAIL (module absent).
- [ ] **Step 3: Implémenter** `moves.ts` : porter chaque chorégraphie de la maquette (durées réalistes : vente 30-60 s au total, conseil 2-4 min, long jusqu'au créneau) ; boucles à 2-4 poses clés ; objets tenus seulement après une prise (`take-item`, `fetch`) dans la chorégraphie.
- [ ] **Step 4: Lancer** → PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): bibliothèque de gestes G4b`.

### Task 3: Types, créneaux et distribution (`cast.ts`)

**Files:**
- Create: `src/core/library/city/shops/scene/types.ts`, `scene/slots.ts`, `scene/cast.ts`
- Test: `tests/core/library/shop-scene-cast.test.ts`

**Interfaces:**
- Consumes: `ShopTypeId`, `SHOP_DEFS` (catalog), `SHOP_FAMILY`/`Family` (gestures), `crowdAt` (hours), `outfitFor`/`Outfit`/`Profile` (people), `hashString`/`mulberry32` (scene-world), `CityIntensity`.
- Produces:

```ts
// types.ts
export type Character = 'rushed' | 'chatty' | 'undecided' | 'regular' | 'lost' | 'ordinary';
export type PartyKind = 'solo' | 'couple' | 'parent-child' | 'friends';
export type Incident = 'drop-coin' | 'no-change' | 'sneeze' | 'phone-ring' | 'child-tug';
export type Member = { id: string; outfit: Outfit; scale: number; child: boolean };
export type Party = {
  id: string;           // `${slotId}-c${slot}-p${i}`
  kind: PartyKind;
  members: Member[];    // meneur en [0]
  character: Character;
  arriveAt: number;     // s depuis le début du créneau, arrivée à la porte
  dir: 1 | -1;          // sens de marche à l'aller
  incidents: Incident[];// tirés à l'avance, joués si l'occasion se présente
  knows: string | null; // id d'un autre parti du créneau qu'il connaît
};
export type SlotKey = { seed: number; slotId: string; type: ShopTypeId; day: number; index: number };

// slots.ts
export const SLOT_S: (type: ShopTypeId) => number; // 240/360/600/900 selon spec
export const ARRIVAL_SHARE = 0.7;
export const STEP = 0.25;
export function slotIndexAt(type: ShopTypeId, secondsOfDay: number): number;
export function slotStart(type: ShopTypeId, index: number): number; // s depuis minuit
export const inScene: (type: ShopTypeId) => boolean; // false pour la famille 'dance'

// cast.ts
export type CastInput = SlotKey & { gate: number; capacity: number; dayMinutesAtStart: number };
export function castFor(input: CastInput): Party[];
```

- [ ] **Step 1: Test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import { castFor } from '../../../src/core/library/city/shops/scene/cast';
import { ARRIVAL_SHARE, SLOT_S, slotIndexAt, slotStart } from '../../../src/core/library/city/shops/scene/slots';

const base = { seed: 9, slotId: 'shop-0', type: 'bakery' as const, day: 20738, index: 120, gate: 1, capacity: 4, dayMinutesAtStart: 480 };

describe('distribution des partis', () => {
  it('est déterministe', () => expect(castFor(base)).toEqual(castFor(base)));
  it('change avec le créneau', () => expect(castFor({ ...base, index: 121 })).not.toEqual(castFor(base)));
  it("n'a aucune arrivée après ARRIVAL_SHARE du créneau", () => {
    for (let i = 0; i < 200; i++) for (const p of castFor({ ...base, index: i })) expect(p.arriveAt).toBeLessThanOrEqual(SLOT_S('bakery') * ARRIVAL_SHARE);
  });
  it('personne avec un gate nul', () => expect(castFor({ ...base, gate: 0 })).toEqual([]));
  it('respecte à peu près la composition (solo majoritaire, groupes présents)', () => {
    const kinds = new Map<string, number>();
    for (let i = 0; i < 2000; i++) for (const p of castFor({ ...base, type: 'cafe', index: i })) kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
    const total = [...kinds.values()].reduce((a, b) => a + b, 0);
    expect(kinds.get('solo')! / total).toBeGreaterThan(0.5);
    expect(kinds.get('friends')! / total).toBeGreaterThan(0.1);
    expect(kinds.get('parent-child')! / total).toBeGreaterThan(0.03);
  });
  it('un enfant seulement dans parent-child, connaissances réciproques', () => {
    for (let i = 0; i < 300; i++) {
      const ps = castFor({ ...base, index: i });
      for (const p of ps) {
        expect(p.members.some((m) => m.child)).toBe(p.kind === 'parent-child');
        if (p.knows) expect(ps.find((q) => q.id === p.knows)?.knows).toBe(p.id);
      }
    }
  });
  it('créneaux par famille', () => {
    expect(SLOT_S('bakery')).toBe(240);
    expect(SLOT_S('bookshop')).toBe(360);
    expect(SLOT_S('restaurant')).toBe(600);
    expect(SLOT_S('tattoo')).toBe(900);
    expect(slotStart('bakery', slotIndexAt('bakery', 3600 * 8 + 10))).toBe(3600 * 8);
  });
});
```

- [ ] **Step 2: Lancer** `npx vitest run tests/core/library/shop-scene-cast.test.ts` → FAIL.
- [ ] **Step 3: Implémenter.** Nombre de partis : `n = poisson(λ)` avec `λ = gate × capacity × SLOT_S/240 × 0.9`, plafonné à `capacity + 2` ; arrivées triées, tirées uniformément dans `[2, SLOT_S × ARRIVAL_SHARE]` ; caractère pondéré (`rushed` ×2 avant 9 h 30, `chatty` ×2 entre 14 h et 17 h, `regular` ×2 pour bakery/bar/cafe/tearoom/grocery) ; incidents : chaque incident avec p = 0,12 (`child-tug` seulement en parent-child) ; connaissances : pour chaque paire, p = 0,15 au bar/café/boulangerie, 0,05 ailleurs, au plus une par parti ; tenues via `outfitFor(rng() < 0.2 ? 'suit' : 'ordinary', rng)`, enfant `scale` 0,6-0,7.
- [ ] **Step 4: Lancer** → PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): distribution des partis par créneau (G4b)`.

### Task 4: Géométrie intérieure et metteur en scène — familles, caractères, aléas, boutique vide

**Files:**
- Create: `scene/stage.ts`, `scene/director.ts`, `scene/behaviors/staff.ts`, `scene/behaviors/customer.ts`
- Test: `tests/core/library/shop-scene-director.test.ts`

**Interfaces:**
- Consumes: tâches 2-3 ; `ShopFrame` (slots.ts), `StaffState` (staff.ts), `INSIDE_SCALE`, `FIGURE_HALF_UNITS` (customers.ts), `SHOP_FAMILY`.
- Produces:

```ts
// stage.ts — repère local de la vitrine (0 = bord gauche), px du monde
export type Stage = { w: number; doorEdge: 'left' | 'right'; counter: { x0: number; x1: number } | null; posts: number[]; queue: number[]; spots: number[]; tables: { x: number; seats: [number, number] }[]; chairs: number[]; back: number; window: number[] };
export function stageFor(type: ShopTypeId, frame: ShopFrame): Stage;

// types.ts (suite)
export type ActorId = string; // `staff:<shiftId>` | `<partyId>:<memberIndex>`
export type Segment = { t0: number; t1: number; move: MoveId | 'walk' | 'turn' | 'idle'; x0: number; x1: number; yaw0: number; yaw1: number; prop: PropId | null; picto: PictoId | null; seed: number };
export type ActorTrack = { id: ActorId; role: 'staff' | 'customer'; outfit: Outfit; scale: number; party: string | null; enter: number | null; exit: number | null; segments: Segment[] };
export type Score = { key: string; start: number; length: number; tracks: ActorTrack[]; log: string[] };
export type StreetState = { rainFrom: number | null; paradeFrom: number | null; busAt: number[] };

// director.ts
export type DirectorInput = { key: SlotKey; frame: ShopFrame; staff: { id: string; outfit: Outfit; present: [number, number] }[]; parties: Party[]; street: StreetState };
export function direct(input: DirectorInput): Score;
```

`enter`/`exit` = instants (s depuis le début du créneau) où le client franchit la porte du local ; `log` = journal lisible (« 12 s Client pressé entre — Boulanger A libre → accueille ») utilisé par les tests et le banc.

Comportement (porté de la maquette, spec §3.4) :
- `staff.ts` : états `idle` (choisit une activité de boutique vide pondérée, durée de `MOVES`, retour au poste), `serve(partyId)`, `fetch`, `wait-call`. Ressource : un employé ne sert qu'un parti.
- `customer.ts` : `enter → queue → being-served (squelette famille : greet → ask → service → pay → bye) → linger? → leave`. Caractères : variantes ci-dessus ; incidents joués quand l'étape s'y prête (`drop-coin`/`no-change` au paiement, `phone-ring` en attente, `sneeze` n'importe quand, `child-tug` en attente). Squelettes : `counter` et `till` (comptoir/caisse), `browse` (flâne entre `spots`, prend un article `take-item`, paie à la caisse), `drink` (commande au comptoir puis boit sur place `toast`/`lean-counter`), `machine` (laverie : charge/attend/décharge ; vélos : dépose/explique). `table` et `chair` = tâche 5.
- Fin de créneau : à partir de `0.85 × length`, plus de `linger`, l'indécis renonce, l'employé accélère (durées au minimum) ; à `length` tous les clients sont sortis.
- Pictos posés par le moteur avec la règle de rareté (Global Constraints).

- [ ] **Step 1: Test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import { direct } from '../../../src/core/library/city/shops/scene/director';
import { castFor } from '../../../src/core/library/city/shops/scene/cast';
import { SLOT_S, STEP } from '../../../src/core/library/city/shops/scene/slots';
import { shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import { outfitFor } from '../../../src/core/library/city/people';
import { mulberry32 } from '../../../src/core/library/scene-world';

const slot = shopSlotsFor(720, 340, 9)[0]!;
const frame = shopFrame(slot, 238);
const rng = mulberry32(1);
const staff = [{ id: 'A', outfit: outfitFor('ordinary', rng), present: [0, 9999] as [number, number] }];
const NO_STREET = { rainFrom: null, paradeFrom: null, busAt: [] };
const run = (type: 'bakery' | 'bookshop' | 'bar', index: number, gate = 1) => {
  const key = { seed: 9, slotId: slot.id, type, day: 20738, index };
  return direct({ key, frame, staff, parties: castFor({ ...key, gate, capacity: 4, dayMinutesAtStart: 480 }), street: NO_STREET });
};
const posAt = (segs: { t0: number; t1: number; x0: number; x1: number }[], t: number) => {
  const s = segs.find((g) => t >= g.t0 && t < g.t1);
  return s ? s.x0 + (s.x1 - s.x0) * ((t - s.t0) / Math.max(1e-9, s.t1 - s.t0)) : null;
};

describe('metteur en scène', () => {
  it('même graine → même partition', () => expect(run('bakery', 7)).toEqual(run('bakery', 7)));
  it('tout client entré ressort avant la fin du créneau', () => {
    for (let i = 0; i < 100; i++) for (const tr of run('bakery', i).tracks) if (tr.role === 'customer' && tr.enter !== null) {
      expect(tr.exit).not.toBeNull();
      expect(tr.exit!).toBeLessThanOrEqual(SLOT_S('bakery'));
    }
  });
  it('segments contigus, sans téléportation', () => {
    for (let i = 0; i < 40; i++) for (const tr of run('bookshop', i).tracks) {
      for (let k = 1; k < tr.segments.length; k++) {
        expect(tr.segments[k]!.t0).toBeCloseTo(tr.segments[k - 1]!.t1, 6);
        expect(Math.abs(tr.segments[k]!.x0 - tr.segments[k - 1]!.x1)).toBeLessThan(1e-6);
      }
      for (const s of tr.segments) expect(Math.abs(s.x1 - s.x0) / Math.max(STEP, s.t1 - s.t0)).toBeLessThan(12);
    }
  });
  it('un employé ne sert qu’un parti à la fois', () => {
    for (let i = 0; i < 60; i++) {
      const sc = run('bakery', i);
      const serving = sc.log.filter((l) => l.includes('→ accueille'));
      expect(serving.length).toBeLessThanOrEqual(sc.tracks.filter((t) => t.role === 'customer').length);
      const st = sc.tracks.find((t) => t.role === 'staff')!;
      for (let k = 1; k < st.segments.length; k++) expect(st.segments[k]!.t0).toBeGreaterThanOrEqual(st.segments[k - 1]!.t0);
    }
  });
  it('boutique vide : l’employé a des activités variées, pas une seule boucle', () => {
    const sc = run('bakery', 3, 0);
    const moves = new Set(sc.tracks[0]!.segments.map((s) => s.move));
    expect(moves.size).toBeGreaterThanOrEqual(3);
  });
  it('pictos rares', () => {
    for (let i = 0; i < 60; i++) {
      const sc = run('bar', i);
      for (const tr of sc.tracks) {
        const ts = tr.segments.filter((s) => s.picto).map((s) => s.t0);
        for (let k = 1; k < ts.length; k++) expect(ts[k]! - ts[k - 1]!).toBeGreaterThanOrEqual(8);
      }
    }
  });
  it("le rideau qui baisse (staff absent en fin) : personne n'entre sans employé", () => {
    const key = { seed: 9, slotId: slot.id, type: 'bakery' as const, day: 20738, index: 5 };
    const sc = direct({ key, frame, staff: [{ ...staff[0]!, present: [0, 60] }], parties: castFor({ ...key, gate: 1, capacity: 4, dayMinutesAtStart: 480 }), street: NO_STREET });
    for (const tr of sc.tracks) if (tr.role === 'customer' && tr.enter !== null) expect(tr.enter).toBeLessThan(60);
  });
  it('vitrine étroite : pas de chevauchement de clients', () => {
    const narrow = { ...frame, window: { ...frame.window, w: 30 } };
    const key = { seed: 9, slotId: slot.id, type: 'bakery' as const, day: 20738, index: 9 };
    const sc = direct({ key, frame: narrow, staff, parties: castFor({ ...key, gate: 1, capacity: 1, dayMinutesAtStart: 480 }), street: NO_STREET });
    const cust = sc.tracks.filter((t) => t.role === 'customer');
    for (let t = 0; t < SLOT_S('bakery'); t += 1) {
      const xs = cust.map((c) => posAt(c.segments, t)).filter((x): x is number => x !== null && x >= 0 && x <= 30).sort((a, b) => a - b);
      for (let k = 1; k < xs.length; k++) expect(xs[k]! - xs[k - 1]!).toBeGreaterThan(2);
    }
  });
});
```

- [ ] **Step 2: Lancer** → FAIL.
- [ ] **Step 3: Implémenter** `stage.ts` (positions d'après `ghibliStaffPost` et les intérieurs G4a : poste derrière le comptoir, file côté porte espacée de `2 × FIGURE_HALF_UNITS × INSIDE_SCALE`, capacité = nombre de places qui tiennent), puis `director.ts` : boucle `for (t = 0; t <= length; t += STEP)`, chaque acteur a `{ state, until, x, target }` ; quand `t >= until`, il choisit l'action suivante (fonctions pures de `behaviors/*`) en lisant un instantané du monde ; chaque action ouvre un `Segment` ; marches à vitesse `INSIDE_SCALE × WALK_PACE × 16 / STREET_SCALE.person` (même allure que `innerAt`) ; demi-tour = segment `turn` de `TURN_S`. Journal `log` à chaque décision.
- [ ] **Step 4: Lancer** → PASS ; lancer aussi `tests/core/library/city-shops-*.test.ts` (inchangés) → PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): metteur en scène des commerces — familles, caractères, aléas, boutique vide`.

### Task 5: Situations à plusieurs, groupes, restaurant, fauteuils

**Files:**
- Create: `scene/behaviors/group.ts`, `scene/behaviors/table.ts`, `scene/behaviors/chair.ts`
- Modify: `scene/director.ts`, `scene/behaviors/staff.ts`, `scene/behaviors/customer.ts`
- Test: `tests/core/library/shop-scene-crowd.test.ts`

**Interfaces:**
- Consumes/produces : mêmes types (tâche 4). Le journal porte les mots-clés testés : `« j'arrive »`, `appelle`, `reconnaît`, `cède son tour`, `renonce`, `place`, `commande`, `sert`, `débarrasse`, `note`, `trinquent`.

Comportement (spec §3.4) : jongle (signe `beckon-wait` au suivant quand l'employé est occupé et la file ≥ 1), renfort (file ≥ 3 et un 2e employé présent en réserve à `stage.back` → `call-colleague` + `!`, le collègue sort de l'arrière-boutique), employés qui discutent (`colleague-chat`) quand vide et ≥ 2 présents ; connaissances (`recognize` + `!`, `chat`, l'un `let-pass`) ; indécis dans une file ≥ 2 derrière lui → décide (durées min) ou renonce (p 0,4) ; groupes : membres entrent l'un derrière l'autre, restent groupés (écart ≤ 1,2 silhouette), couple `couple-look` + `heart`, enfant `child-point` / parent `hold-child`, amis au bar commande unique + `toast` + `note` puis `ask-bill` ; restaurant : `show-table` (serveur devant), `hand-menu`, `read-menu`, `take-order` (`notepad`), aller en cuisine (`stage.back`), `carry-plates`, `serve-plate`, `eat`, `clear-table`, `bring-bill`, paiement, départ ; 3-4 tables selon `stage.tables` ; fauteuils (coiffeur/tatoueur) : `chair.ts` installe, enchaîne la signature (tâche 6 fournit les étapes ; ici une étape générique `prepare` en attendant), attente sur une chaise.

- [ ] **Step 1: Test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import { direct } from '../../../src/core/library/city/shops/scene/director';
import { castFor } from '../../../src/core/library/city/shops/scene/cast';
import { SLOT_S } from '../../../src/core/library/city/shops/scene/slots';
import { shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import { outfitFor } from '../../../src/core/library/city/people';
import { mulberry32 } from '../../../src/core/library/scene-world';
import type { ShopTypeId } from '../../../src/core/library/city/shops/catalog';

const slot = shopSlotsFor(720, 340, 9)[0]!;
const frame = { ...shopFrame(slot, 238), window: { ...shopFrame(slot, 238).window, w: 90 } };
const rng = mulberry32(2);
const two = [
  { id: 'A', outfit: outfitFor('ordinary', rng), present: [0, 9999] as [number, number] },
  { id: 'B', outfit: outfitFor('ordinary', rng), present: [0, 9999] as [number, number] },
];
const NO_STREET = { rainFrom: null, paradeFrom: null, busAt: [] };
const logs = (type: ShopTypeId, n: number, capacity = 6) => {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const key = { seed: 9, slotId: slot.id, type, day: 20738, index: i };
    out.push(...direct({ key, frame, staff: two, parties: castFor({ ...key, gate: 1, capacity, dayMinutesAtStart: 750 }), street: NO_STREET }).log);
  }
  return out.join('\n');
};

describe('situations à plusieurs', () => {
  it('boulangerie bondée : jongle, renfort, reconnaissance', () => {
    const l = logs('bakery', 300);
    for (const w of ["« j'arrive »", 'appelle', 'reconnaît', 'cède son tour', 'renonce']) expect(l).toContain(w);
  });
  it('bar : les amis trinquent et demandent la note', () => {
    const l = logs('bar', 200, 7);
    expect(l).toContain('trinquent');
    expect(l).toContain('note');
  });
  it('restaurant : enchaînement complet dans l’ordre', () => {
    const l = logs('restaurant', 60);
    const order = ['place', 'commande', 'sert', 'débarrasse', 'note'].map((w) => l.indexOf(w));
    for (const i of order) expect(i).toBeGreaterThanOrEqual(0);
    for (let k = 1; k < order.length; k++) expect(order[k]!).toBeGreaterThan(order[k - 1]!);
  });
  it('les membres d’un groupe restent ensemble', () => {
    for (let i = 0; i < 100; i++) {
      const key = { seed: 9, slotId: slot.id, type: 'cafe' as const, day: 20738, index: i };
      const sc = direct({ key, frame, staff: two, parties: castFor({ ...key, gate: 1, capacity: 6, dayMinutesAtStart: 750 }), street: NO_STREET });
      const byParty = new Map<string, typeof sc.tracks>();
      for (const t of sc.tracks) if (t.party) byParty.set(t.party, [...(byParty.get(t.party) ?? []), t]);
      for (const ms of byParty.values()) if (ms.length > 1) for (const m of ms) {
        expect(m.enter).not.toBeNull();
        expect(Math.abs(m.enter! - ms[0]!.enter!)).toBeLessThan(6);
      }
    }
  });
  it('tout le monde sort avant la fin, même au restaurant et chez le tatoueur', () => {
    for (const type of ['restaurant', 'tattoo', 'hairdresser'] as const) for (let i = 0; i < 40; i++) {
      const key = { seed: 9, slotId: slot.id, type, day: 20738, index: i };
      const sc = direct({ key, frame, staff: two, parties: castFor({ ...key, gate: 1, capacity: 4, dayMinutesAtStart: 750 }), street: NO_STREET });
      for (const t of sc.tracks) if (t.role === 'customer' && t.enter !== null) expect(t.exit!).toBeLessThanOrEqual(SLOT_S(type));
    }
  });
});
```

- [ ] **Step 2: Lancer** → FAIL.
- [ ] **Step 3: Implémenter** les comportements ; garder chaque fichier `behaviors/*.ts` < 300 lignes.
- [ ] **Step 4: Lancer** tâches 4 + 5 → PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): situations à plusieurs, groupes, restaurant, fauteuils (G4b)`.

### Task 6: Étapes signature des métiers — **Fable**

**Files:**
- Create: `scene/signatures.ts`
- Modify: `scene/behaviors/customer.ts`, `scene/behaviors/chair.ts` (greffe entre « demande » et « remise »), `scene/moves.ts` si des gestes manquent
- Test: `tests/core/library/shop-scene-signatures.test.ts`

**Interfaces:**
- Produces:

```ts
export type SignatureStep = { staff: MoveId | null; customer: MoveId | null; prop?: PropId; picto?: PictoId; walk?: 'shelf' | 'buckets' | 'back' | 'mirror' };
export const SIGNATURES: Partial<Record<ShopTypeId, readonly SignatureStep[]>>;
// clés : butcher, cheese, optician, hairdresser, florist, wine, tattoo, pharmacy, restaurant (renvoie à table.ts), cafe (barista)
```

- [ ] **Step 1: Test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import { SIGNATURES } from '../../../src/core/library/city/shops/scene/signatures';
import { MOVES } from '../../../src/core/library/city/shops/scene/moves';
import { direct } from '../../../src/core/library/city/shops/scene/director';
import { castFor } from '../../../src/core/library/city/shops/scene/cast';
import { shopFrame, shopSlotsFor } from '../../../src/core/library/city/shops/slots';
import { outfitFor } from '../../../src/core/library/city/people';
import { mulberry32 } from '../../../src/core/library/scene-world';

const TYPES = ['butcher', 'cheese', 'optician', 'hairdresser', 'florist', 'wine', 'tattoo', 'pharmacy', 'cafe'] as const;
const EXPECT: Record<(typeof TYPES)[number], string> = { butcher: 'weigh', cheese: 'taste', optician: 'try-frames', hairdresser: 'cut-hair', florist: 'compose-bouquet', wine: 'sniff-wine', tattoo: 'tattoo', pharmacy: 'explain-box', cafe: 'brew-coffee' };

describe('étapes signature', () => {
  it('chaque étape référence des gestes existants', () => {
    for (const steps of Object.values(SIGNATURES)) for (const s of steps!) {
      if (s.staff) expect(MOVES[s.staff]).toBeDefined();
      if (s.customer) expect(MOVES[s.customer]).toBeDefined();
    }
  });
  it('chaque métier joue sa signature dans la partition', () => {
    const slot = shopSlotsFor(720, 340, 9)[0]!;
    const frame = shopFrame(slot, 238);
    const staff = [{ id: 'A', outfit: outfitFor('ordinary', mulberry32(3)), present: [0, 9999] as [number, number] }];
    for (const type of TYPES) {
      let seen = false;
      for (let i = 0; i < 40 && !seen; i++) {
        const key = { seed: 9, slotId: slot.id, type, day: 20738, index: i };
        const sc = direct({ key, frame, staff, parties: castFor({ ...key, gate: 1, capacity: 3, dayMinutesAtStart: 900 }), street: { rainFrom: null, paradeFrom: null, busAt: [] } });
        seen = sc.tracks.some((t) => t.segments.some((s) => s.move === EXPECT[type]));
      }
      expect(seen, type).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Lancer** → FAIL.
- [ ] **Step 3: Implémenter** d'après le tableau des 10 signatures de la maquette (spec §5) : objets pris avant d'être tendus (`walk` vers étagère/seaux/arrière), traits de joie à la dégustation, goutte chez le tatoueur, miroir à la fin chez coiffeur/opticien/tatoueur.
- [ ] **Step 4: Lancer** tâches 4-6 → PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): étapes signature des métiers (G4b)`.

### Task 7: Lecture des partitions et cache (`score.ts`)

**Files:**
- Create: `scene/score.ts`
- Test: `tests/core/library/shop-scene-score.test.ts`

**Interfaces:**
- Produces:

```ts
export type ActorView = { id: ActorId; role: 'staff' | 'customer'; where: 'inside' | 'street-in' | 'street-out' | 'none'; x: number; yaw: number; gait: Gait; phase: number; arms: ArmPose; lean: number; headYaw: number; prop: PropId | null; picto: { id: PictoId; age: number } | null; party: string | null; outfit: Outfit; scale: number; enterAt: number | null; exitAt: number | null };
export function actorsAt(score: Score, tInSlot: number): ActorView[];   // dichotomie par piste + keyAt
export class ScoreCache { constructor(max?: number); get(key: string, make: () => Score): Score; size(): number }
export function scoreKey(k: SlotKey): string; // `${seed}|${slotId}|${type}|${day}|${index}`
```

`where` : `'street-in'` avant `enter`, `'street-out'` après `exit` (la marche dans la rue est calculée par le rendu avec `passageAt`), `'none'` hors visite. `phase` de marche = distance parcourue / (INSIDE_SCALE × scale) comme `innerPose`.

- [ ] **Step 1: Test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import { ScoreCache, actorsAt, scoreKey } from '../../../src/core/library/city/shops/scene/score';
import type { Score } from '../../../src/core/library/city/shops/scene/types';

const score = { key: 'k', start: 0, length: 240, log: [], tracks: [{ id: 'p:0', role: 'customer', outfit: {} as never, scale: 1, party: 'p', enter: 10, exit: 50, segments: [
  { t0: 10, t1: 20, move: 'walk', x0: 0, x1: 10, yaw0: 0, yaw1: 0, prop: null, picto: null, seed: 1 },
  { t0: 20, t1: 50, move: 'wait', x0: 10, x1: 10, yaw0: 2, yaw1: 2, prop: null, picto: 'question', seed: 1 },
] }] } as unknown as Score;

describe('lecture des partitions', () => {
  it('interpole la marche', () => {
    const [a] = actorsAt(score, 15);
    expect(a!.where).toBe('inside');
    expect(a!.x).toBeCloseTo(5);
    expect(a!.gait).toBe('walk');
  });
  it('dans la rue avant l’entrée et après la sortie', () => {
    expect(actorsAt(score, 5)[0]!.where).toBe('street-in');
    expect(actorsAt(score, 60)[0]!.where).toBe('street-out');
  });
  it('picto avec son âge', () => expect(actorsAt(score, 20.5)[0]!.picto).toEqual({ id: 'question', age: 0.5 }));
  it('cache LRU : même objet pour la même clé, borne respectée', () => {
    const c = new ScoreCache(2);
    let made = 0;
    const mk = () => (made++, score);
    c.get('a', mk); c.get('a', mk); c.get('b', mk); c.get('c', mk);
    expect(made).toBe(3);
    expect(c.size()).toBe(2);
  });
  it('clé stable', () => expect(scoreKey({ seed: 1, slotId: 's', type: 'bakery', day: 2, index: 3 })).toBe('1|s|bakery|2|3'));
});
```

- [ ] **Step 2: Lancer** → FAIL. **Step 3: Implémenter.** **Step 4: Lancer** → PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): lecture et cache des partitions (G4b)`.

### Task 8: Réactions à la rue et klaxons

**Files:**
- Create: `scene/street.ts`
- Modify: `src/core/library/city/traffic/engine.ts` (publication `horns`), `scene/behaviors/*.ts` (réactions)
- Test: `tests/core/library/shop-scene-street.test.ts`, ajout dans `tests/core/library/traffic-engine*.test.ts`

**Interfaces:**
- Produces:

```ts
// street.ts
export type StreetInput = { slotStartS: number; length: number; precipAt: (minutes: number) => number; paradeActive: (minutes: number) => boolean; busArrivalsS: readonly number[] };
export function streetFor(input: StreetInput): StreetState; // rainFrom : premier instant (s du créneau) où precip passe ≥ 0,3 ; paradeFrom idem ; busAt filtrés
// engine.ts
export type Horn = { t: number; x: number };
// TrafficWorld gagne `horns: Horn[]` (fenêtre glissante des 10 dernières secondes) ; un conducteur dont le tempérament est impatient (temperament.patience < 0,4)
// arrêté derrière un véhicule arrêté depuis > 4 s klaxonne une fois (puis pas avant 12 s).
```

Réactions : `rainFrom` → client qui allait sortir joue `wait-rain` à la porte jusqu'à `rainFrom + 20 s` (ou sort s'il a un parapluie : `outfit` avec parapluie selon `intensity.umbrellas`) ; `paradeFrom` → employé libre et clients non servis vont à `stage.window` et jouent `look-street` ; `busAt` → `head-turn` de 1 s pour les acteurs libres. Klaxons : surcouche au rendu (tâche 10), la tête des acteurs à moins de 120 px tourne 1 s.

- [ ] **Step 1: Tests qui échouent**

```ts
import { describe, expect, it } from 'vitest';
import { streetFor } from '../../../src/core/library/city/shops/scene/street';

describe('rue d’un créneau', () => {
  it('trouve le début d’averse', () => {
    const s = streetFor({ slotStartS: 36000, length: 240, precipAt: (m) => (m >= 602 ? 0.6 : 0), paradeActive: () => false, busArrivalsS: [36100, 50000] });
    expect(s.rainFrom).toBe(120);
    expect(s.paradeFrom).toBeNull();
    expect(s.busAt).toEqual([100]);
  });
});
```

et, dans le test du moteur de circulation, un scénario route bloquée (véhicule arrêté au feu rouge long + conducteurs impatients derrière) qui vérifie `world.horns.length > 0` et l'espacement ≥ 12 s par agent.

- [ ] **Step 2: Lancer** → FAIL. **Step 3: Implémenter** (et un test director : avec `rainFrom: 30`, le journal contient `attend que l'averse passe`). **Step 4: Lancer** → PASS (+ tests traffic existants).
- [ ] **Step 5: Commit** `feat(bibliotheque): réactions des commerces à la rue, klaxons (G4b)`.

### Task 9: Objets d'interaction et pictos — **Fable**

**Files:**
- Create: `src/content/shop/scene-props.tsx`, `src/content/shop/picto.tsx`
- Test: `tests/content/shop/scene-props.test.tsx`

**Interfaces:**
- Produces: `export function PropSprite({ id, sky, accessory }: { id: PropId; sky: Sky; accessory: string | null }): ReactElement` (cellulo, à l'échelle de la main du pantin ; `accessory` → `AccessorySprite` existant) ; `export function Picto({ id, age }: { id: PictoId; age: number }): ReactElement | null` (petit saut d'apparition sur 0,15 s, disparition après 1 s → `null`) ; `export const PICTO_LIFE = 1`.

- [ ] **Step 1: Test qui échoue** (createRoot + act, comme `tests/content/shop-sprites.test.tsx`) : chaque `PropId` rend un `<g data-prop="<id>">` non vide ; chaque `PictoId` rend `<g data-picto="<id>">` à `age = 0.5` et `null` à `age = 1.2`.
- [ ] **Step 2: Lancer** → FAIL. **Step 3: Dessiner** (style cellulo de la spec, pictos au trait tremblé de la maquette) ; vérifier à 21 px dans une page jetable. **Step 4: Lancer** → PASS.
- [ ] **Step 5: Commit** `feat(bibliotheque): objets d'interaction et pictos manga (G4b)`.

### Task 10: Rendu Ghibli des partitions et branchement

**Files:**
- Create: `src/content/shop/shop-scene.tsx`
- Modify: `src/content/city-life.tsx`, `src/content/city-shops-life.tsx`, `src/core/library/city/shops/customers.ts` (`CUSTOMER_SCALE` 0,8), `src/core/library/city/shops/sprite-budget.ts` (52, retrait par parti : `BudgetSprite.party?: string`)
- Test: `tests/content/shop/shop-scene.test.tsx`, `tests/content/shop-sprite-budget.test.tsx` (ajouts)

**Interfaces:**
- Consumes: tâches 3-9, `passageAt`/`THRESHOLD_S` (doorway), `placeSill`/`sillBox` (door-passage), `GhibliFigure`/`poseFigure`/`hideFigure` (ghibli-figure), `ghibliStaffPost`, `ghibliAwningShift`, `INSIDE_SCALE`, `STREET_SCALE`.
- Produces:

```ts
export type SceneShop = { view: ShopView; frame: ShopFrame; staff: { id: string; outfit: Outfit; present: [number, number] }[] };
export function ShopScene(props: { shops: SceneShop[]; seed: number; day: number; secondsOfDay: number; width: number; metrics: CityMetrics; sky: Sky; rainy: boolean; umbrella: boolean; gates: Map<string, number>; street: (slotId: string, slotStartS: number, length: number) => StreetState; doorXs: readonly number[]; still: boolean }): ReactElement;
export function collectScene(root: Element): SceneNodes;
export function placeScene(nodes: SceneNodes, t: number, figures: FigureRegistry, horns: readonly Horn[]): void;
```

Règles :
- Pour chaque boutique (`inScene(type)`) : créneaux `N-1, N, N+1` (cache `ScoreCache` module, 64 entrées) ; nœuds réservés par piste (pool par boutique dimensionné par `capacity + staff`) : acteurs intérieurs dans le `<svg data-shop-window>` (déjà rogné ; ajouter le rognage au plan du comptoir pour les acteurs derrière : `<svg>` imbriqué dont le bas est la ligne du plan de travail — un seul rectangle, cf. leçon perf clipPath), rue/porte via `passageAt` comme `placeCustomers`.
- `still` → chacun à sa place de repos (employé au poste, pas de client), aucune animation.
- En Ghibli, `ShopCustomers` ne rend plus les nœuds intérieurs (`data-customer-inside`) et `StaffLayer` ne rend plus le personnel « debout à son poste » (`inside` non en pause) pour les types `inScene` ; ouvreurs/fermeurs/pauses/marche inchangés. Classique inchangé.
- Gate à 0 en plein créneau : le créneau courant garde sa partition (calculée avec le gate au début du créneau, mémorisé dans la clé du cache) ; seules les arrivées futures (créneau suivant) sont supprimées.
- Budget : chaque acteur client compte 1 avec `party` ; `spriteBudget` retire des partis entiers (le plus loin du centre d'abord), jamais un parti dont un membre est `being-served` dans le tiers central de la vue.
- Klaxons : acteur libre à moins de 120 px d'un `Horn` récent (≤ 1 s) → `headYaw` vers le klaxon.

- [ ] **Step 1: Tests qui échouent** (`shop-scene.test.tsx`, createRoot + act, figures factices comme `tests/content/city-shops-life.test.tsx`) :
  - rend un employé intérieur et, à une heure où la partition a un client à l'intérieur, un client `data-scene-actor` actif ;
  - deux rendus à la même heure (re-rendu React) → mêmes transforms ;
  - `still` → aucun client actif, employé posé ;
  - classique (`ghibli=false` dans `city-life`) : le DOM des commerces est identique à celui de `main` (comparer au test existant `city-shops-life.test.tsx` qui doit rester vert sans modification) ;
  - budget (`shop-sprite-budget.test.tsx`) : un couple au-delà du plafond est retiré entier ; un parti servi au centre n'est jamais retiré ; `SHOP_SPRITE_CAP === 52`.
- [ ] **Step 2: Lancer** → FAIL. **Step 3: Implémenter** et brancher dans `city-life.tsx` (rendu + `placeScene` dans la boucle, après `placeCustomers`). **Step 4: Lancer** les tests touchés + `tests/content/city-*.test.tsx` + `tests/content/shop*.test.tsx` → PASS (hors délais préexistants listés dans les Global Constraints, à vérifier seuls).
- [ ] **Step 5: Commit** `feat(bibliotheque): rendu Ghibli des interactions des commerces (G4b)`.

### Task 11: Banc, captures et auto-validation

**Files:**
- Modify: `.superpowers/harness-ville/main.tsx` (paramètre `log=1` : affiche le journal de la boutique ciblée ; `focus=<slotId>`), script `g4bcap.mjs` (copie de `g4cap.mjs`)
- Output: `.superpowers/captures-ghibli-g4b/` dans le worktree

- [ ] **Step 1:** lancer le banc (`npx vite --port 5226` dans `.superpowers/harness-ville`, attendre 5 s), choisir les heures d'après les partitions (script Node qui appelle `direct` pour trouver un instant avec client à l'intérieur) — jamais de scène vide.
- [ ] **Step 2:** captures (Chrome headless + CDP ; jamais `--virtual-time-budget` ; ne tuer que son propre Chrome) : 1 caractères (boulangerie 8 h 31 mardi), 2 aléas, 3 boutique vide, 4 file + renfort (7 h 30), 5 bar vendredi 21 h, 6 restaurant 12 h 30, 7-14 les 8 signatures, 15 pictos, 16 taille réelle de la rue entière, 17 averse, 18 défilé (14/7).
- [ ] **Step 3:** regarder chaque capture ; corriger (dans la tâche concernée, nouveau commit) : échelles rue/intérieur, rognage au comptoir, pictos lisibles sans chevauchement, aucun geste illisible, aucun glissement.
- [ ] **Step 4:** mesure PC (banc, CPU ×4, `bench-cel.mjs` adapté) main contre branche à 8 h, 12 h 30, vendredi 21 h ; si > +15 %, baisser `SHOP_SPRITE_CAP` (noter dans la PR).
- [ ] **Step 5:** commit des correctifs éventuels ; supprimer les scripts temporaires.

### Task 12: Revue finale, PR, fusion, pré-prod

- [ ] **Step 1:** revue de toute la branche (sous-agent relecteur, modèle le plus capable) ; corriger critiques/importants, consigner les mineurs dans la PR.
- [ ] **Step 2:** `npx tsc --noEmit` et les fichiers de test touchés → verts.
- [ ] **Step 3:** `git branch --show-current` puis `git push -u origin feat/bibliotheque-ghibli-g4b` ; `gh pr create --base main --title "Bibliothèque Ghibli G4b : interactions employés-clients" --body-file <fichier>` (pas de heredoc sur stdin) ; corps : résumé, captures, mesures PC, « mesures téléphone en fin de migration », mineurs reportés, `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 4:** `gh pr merge --merge --delete-branch` ; dans le worktree `git checkout --detach origin/main` après `git fetch`.
- [ ] **Step 5:** pré-prod : si le dossier principal est `main` propre → `npm run preprod` puis `npm run build` ; sinon méthode worktree (copier `.env.local`, `node scripts/build-apk.mjs --channel=preprod`, `gh release create preprod-<versionCode> … --prerelease --latest=false`, garder 3 pre-releases, `npm run build` dans le worktree puis `robocopy .output\chrome-mv3 "<dépôt>\.output\chrome-mv3" /MIR`).
- [ ] **Step 6:** mettre à jour la mémoire (`project_g4_commerces.md`, `project_ghibli.md`) et montrer les captures à l'utilisateur.
