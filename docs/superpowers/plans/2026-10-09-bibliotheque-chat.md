# Bibliothèque 6a : socle animal et chat — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE : utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`).

**But :** un chat vit dans chaque pièce de la Bibliothèque (marche, saute, dort, mange, se toilette), s'adopte (nom + pelage), se caresse en mode Visiter, se renomme et se retire en mode Aménager ; son action en cours est mémorisée et reprise au retour.

**Architecture :** un moteur pur dans `src/core/library/pets/` (carte de marche, itinéraires avec sauts, cerveau à tirage pondéré, exécuteur par pièce, horloge injectée) ; un état de pièce v4 (`Room.pets`) ; un composant SVG `PetSprite` et un hook `usePetSim` qui déplace le chat sans re-rendu React (transform impératif, comme les acteurs de la fenêtre) ; l'ordre de dessin du chat parmi les meubles est un entier `behind` qui ne déclenche un rendu que lorsqu'il change.

**Stack :** TypeScript, React 19, zod 4, vitest 5 (jsdom pour les composants), SVG/SMIL.

**Spec :** `docs/superpowers/specs/2026-10-09-bibliotheque-chat-design.md` (suite de `2026-10-08-bibliotheque-design.md`, section « Morceau 6 »).

## Contraintes globales

- Travailler dans le worktree `C:\Users\maxim\Downloads\Wikimasters-bibliotheque`, branche `feat/bibliotheque-chat` (jonction `node_modules` vers le dépôt principal ; vérifier avec `ls node_modules`, sinon la recréer).
- Coordonnées en pixels du dessin de la pièce : `CELL_W = 30`, `CELL_H = 510 / 18`, mur = lignes 0 à 11, sol = lignes 12 à 17 (`WALL_ROWS = 12`, `ROWS = 18`).
- Jamais de téléportation : marche à vitesse constante (70 px/s), saut en arc de parabole.
- Aucune simulation en arrière-plan : le plan sauvegardé contient des horodatages absolus ; au chargement un seul calcul instantané (reprise si `now < fin`, sinon nouvelle action).
- Un seul chat par pièce. Pelages : `orange`, `black`, `gray`, `white`, `tabby`, `bicolor`. Nom : 20 caractères au plus, « Minou » si vide.
- Mouvement réduit (`prefers-reduced-motion`) : le chat ne se déplace pas (assis ou endormi sur place), minuterie d'une seconde au lieu de `requestAnimationFrame`.
- Commentaires en français, identifiants en anglais, comme le code voisin. Messages visibles en français, glyphes SVG plutôt que du texte dans les boutons.
- Après chaque tâche : tests de la tâche verts, puis commit avec le pied `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Tests : `npx vitest run <fichier> --maxWorkers=4` (le test `library-drag.test.tsx` est instable en parallélisme total).

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `src/core/library/library-types.ts` (modifié) | Types `Coat`, `Pt`, `Segment`, `PetAction`, `PetPlan`, `Pet` ; `Room.pets` ; `LibraryState.version: 4` |
| `src/core/library/library-book.ts` (modifié) | Schéma zod, migration v3→v4, `adoptPet`, `renamePet`, `removePet`, `setPetPlan` |
| `src/core/library/library-repo.ts` (modifié) | `updateQuiet` (écriture sans notifier) |
| `src/core/library/pets/walk-map.ts` (créé) | Cases libres, plateformes (dessus des meubles), chemin au sol, segments de marche |
| `src/core/library/pets/route.ts` (créé) | Itinéraire entre deux supports (sol / plateformes) avec sauts |
| `src/core/library/pets/motion.ts` (créé) | Position théorique à l'instant `now` (`stateAt`) |
| `src/core/library/pets/brain.ts` (créé) | Choix pondéré d'action, apparition, reprise, replanification, caresse |
| `src/core/library/pets/depth.ts` (créé) | Clé de profondeur et rang de dessin parmi les meubles |
| `src/core/library/pets/runner.ts` (créé) | Exécuteur par pièce : un pas = une liste de `PetFrame` |
| `src/content/pet-sprite.tsx` (créé) | Dessin SVG du chat (11 poses, 6 pelages) |
| `src/content/pet-sim.ts` (créé) | Hook `usePetSim` : boucle d'animation, transform impératif |
| `src/content/RoomView.tsx` (modifié) | Insère le chat dans l'ordre de dessin |
| `src/content/LibraryPanel.tsx` (modifié) | Branche le hook, rangée « Animaux » (adopter / renommer / retirer) |
| `src/core/whats-new/entries.ts` (modifié) | Fiche WikiHow `bibliotheque-v9` |

---

### Task 1 : types, état v4 et dépôt

**Fichiers :**
- Modifier : `src/core/library/library-types.ts`, `src/core/library/library-book.ts`, `src/core/library/library-repo.ts`
- Créer : `tests/core/library/library-pets.test.ts`
- Modifier (versions) : `tests/core/library/library-migration.test.ts`, `tests/core/library/library-scene.test.ts`, `tests/core/library/room-grid-small.test.ts`, et tout littéral `Room`/état signalé par `npm run typecheck`

**Interfaces :**
- Produit : `COATS`, `Coat`, `Pt`, `Segment`, `PET_ACTIONS`, `PetAction`, `PetPlan`, `Pet`, `MAX_PET_NAME`, `adoptPet(state, roomId, name, coat)`, `renamePet(state, roomId, petId, name)`, `removePet(state, roomId, petId)`, `setPetPlan(state, roomId, petId, plan)`, `repo.updateQuiet(change)`.

- [ ] **Étape 1 : écrire les tests qui échouent**

Créer `tests/core/library/library-pets.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { adoptPet, createInitialState, parseLibraryState, removePet, renamePet, setPetPlan } from '../../../src/core/library/library-book';
import { createLibraryRepo } from '../../../src/core/library/library-repo';
import type { PetPlan } from '../../../src/core/library/library-types';

const plan: PetPlan = {
  action: 'sit',
  hostId: null,
  at: { x: 100, y: 450 },
  on: null,
  route: [{ kind: 'walk', from: { x: 10, y: 450 }, to: { x: 100, y: 450 }, ms: 1000, fromOn: null, on: null }],
  startedAt: 5000,
  actMs: 4000,
  facing: 'r',
  sig: '24|1',
};

describe('état v4', () => {
  it('une pièce vide commence en v4 sans animal', () => {
    const state = createInitialState();
    expect(state.version).toBe(4);
    expect(state.rooms[0]!.pets).toEqual([]);
  });

  it('migre un état v3 : les pièces reçoivent une liste d animaux vide', () => {
    const v3 = { version: 3, activeRoomId: 'r1', homeRoomId: null, time: { mode: 'real' }, rooms: [{ id: 'r1', name: 'Salon', style: 'scandinave', scene: 'city', orientation: 'landscape', cols: 24, layout: [] }] };
    const state = parseLibraryState(v3);
    expect(state.version).toBe(4);
    expect(state.rooms[0]!.pets).toEqual([]);
  });

  it('un animal abîmé est ignoré sans perdre la pièce, un plan abîmé est oublié', () => {
    const base = createInitialState();
    const room = { ...base.rooms[0]!, pets: [{ id: 'p1', species: 'cat', name: 'Minou', coat: 'orange', plan: { action: 'bogus' } }, { id: 'p2', species: 'dog', name: 'X', coat: 'orange' }] };
    const state = parseLibraryState({ ...base, rooms: [room] });
    expect(state.rooms[0]!.pets).toEqual([{ id: 'p1', species: 'cat', name: 'Minou', coat: 'orange' }]);
  });

  it('garde au plus un animal par pièce', () => {
    const base = createInitialState();
    const pets = [1, 2].map((n) => ({ id: `p${n}`, species: 'cat', name: `C${n}`, coat: 'black' }));
    expect(parseLibraryState({ ...base, rooms: [{ ...base.rooms[0]!, pets }] }).rooms[0]!.pets).toHaveLength(1);
  });
});

describe('adoption', () => {
  it('adopte un chat avec son nom nettoyé', () => {
    const state = adoptPet(createInitialState(), 'r1', '  Moustache  ', 'tabby');
    expect(state.rooms[0]!.pets).toEqual([{ id: 'p1', species: 'cat', name: 'Moustache', coat: 'tabby' }]);
  });

  it('nom vide : Minou ; nom trop long : coupé à 20 caractères', () => {
    expect(adoptPet(createInitialState(), 'r1', '   ', 'gray').rooms[0]!.pets[0]!.name).toBe('Minou');
    expect(adoptPet(createInitialState(), 'r1', 'x'.repeat(40), 'gray').rooms[0]!.pets[0]!.name).toHaveLength(20);
  });

  it('refuse un second chat dans la même pièce', () => {
    const once = adoptPet(createInitialState(), 'r1', 'A', 'white');
    expect(adoptPet(once, 'r1', 'B', 'black')).toBe(once);
  });

  it('renomme, retire, et ignore une pièce ou un animal inconnu', () => {
    const once = adoptPet(createInitialState(), 'r1', 'A', 'white');
    expect(renamePet(once, 'r1', 'p1', 'Bob').rooms[0]!.pets[0]!.name).toBe('Bob');
    expect(renamePet(once, 'r1', 'p1', '   ')).toBe(once);
    expect(renamePet(once, 'r9', 'p1', 'Bob')).toBe(once);
    expect(removePet(once, 'r1', 'p1').rooms[0]!.pets).toEqual([]);
  });

  it('mémorise le plan d un animal et le relit', () => {
    const once = adoptPet(createInitialState(), 'r1', 'A', 'white');
    const withPlan = setPetPlan(once, 'r1', 'p1', plan);
    expect(parseLibraryState(JSON.parse(JSON.stringify(withPlan))).rooms[0]!.pets[0]!.plan).toEqual(plan);
  });
});

describe('updateQuiet', () => {
  it('écrit sans prévenir les abonnés', async () => {
    const store = createMemoryStore();
    const repo = createLibraryRepo(store);
    await repo.load();
    const listener = vi.fn();
    repo.subscribe(listener);
    await repo.updateQuiet((s) => adoptPet(s, 'r1', 'A', 'white'));
    expect(listener).not.toHaveBeenCalled();
    expect(repo.current()!.rooms[0]!.pets).toHaveLength(1);
    expect((await createLibraryRepo(store).load()).rooms[0]!.pets).toHaveLength(1);
  });
});
```

- [ ] **Étape 2 : lancer et constater l'échec**

Run: `npx vitest run tests/core/library/library-pets.test.ts`
Attendu : ÉCHEC (exports `adoptPet`… absents, version 3).

- [ ] **Étape 3 : types**

Dans `src/core/library/library-types.ts`, ajouter après `export type Layout = Placed[];` :

```ts
// Pelages du chat ; chacun a sa palette (pet-sprite.tsx).
export const COATS = ['orange', 'black', 'gray', 'white', 'tabby', 'bicolor'] as const;
export type Coat = (typeof COATS)[number];

// Un point du dessin de la pièce, en pixels (les pieds de l'animal).
export type Pt = { x: number; y: number };

// Un déplacement : marche sur son support, ou saut en arc. `fromOn` / `on` : le meuble (dessus) qui porte l'animal au départ / à l'arrivée, null = le sol.
export type Segment = { kind: 'walk' | 'jump'; from: Pt; to: Pt; ms: number; fromOn: string | null; on: string | null };

export const PET_ACTIONS = ['sit', 'groom', 'stretch', 'yawn', 'sleep', 'eat', 'drink', 'scratch', 'perch', 'hide', 'purr'] as const;
export type PetAction = (typeof PET_ACTIONS)[number];

// Le plan en cours : un trajet (peut être vide) puis une action sur place. Tout est en horodatages absolus (`startedAt`, durées) :
// la position à n'importe quel instant se déduit du plan, sans rien simuler. `hostId` : le meuble contre/dans lequel il agit (ordre de dessin) ;
// `on` : le dessus de meuble qui le porte (null = sol) ; `sig` : signature des meubles au moment où le plan a été fait.
export type PetPlan = { action: PetAction; hostId: string | null; at: Pt; on: string | null; route: Segment[]; startedAt: number; actMs: number; facing: 'l' | 'r'; sig: string };

export type Pet = { id: string; species: 'cat'; name: string; coat: Coat; plan?: PetPlan };
```

Dans `Room`, ajouter `pets: Pet[];` après `layout: Layout;`. Dans `LibraryState`, remplacer `version: 3;` par `version: 4;`.

- [ ] **Étape 4 : état, schéma et migration**

Dans `src/core/library/library-book.ts` :

1. Remplacer la ligne d'import des types par :
```ts
import { COATS, PET_ACTIONS, SCENE_IDS, SMALL_ITEMS, STANDING_KINDS, STYLE_IDS, type Coat, type Layout, type LibraryState, type Orientation, type Pet, type PetPlan, type Placed, type Room, type SceneId, type StyleId, type TimeSetting } from './library-types';
```
2. Après `export const MAX_NAME = 30;` ajouter :
```ts
export const MAX_PET_NAME = 20;
const DEFAULT_PET_NAME = 'Minou';
```
3. Avant `const roomSchema`, ajouter :
```ts
const ptSchema = z.object({ x: z.number(), y: z.number() });
const segmentSchema = z.object({
  kind: z.enum(['walk', 'jump']),
  from: ptSchema,
  to: ptSchema,
  ms: z.number().min(0).max(60000),
  fromOn: z.string().nullable(),
  on: z.string().nullable(),
});
const planSchema = z.object({
  action: z.enum(PET_ACTIONS),
  hostId: z.string().nullable(),
  at: ptSchema,
  on: z.string().nullable(),
  route: z.array(segmentSchema).max(60),
  startedAt: z.number(),
  actMs: z.number().min(0).max(600000),
  facing: z.enum(['l', 'r']),
  sig: z.string(),
});
// Un plan abîmé est simplement oublié : le chat en choisira un autre.
const petSchema = z.object({
  id: z.string(),
  species: z.literal('cat'),
  name: z.string().min(1).max(MAX_PET_NAME),
  coat: z.enum(COATS),
  plan: planSchema.optional().catch(undefined),
});
```
4. Dans `roomSchema`, ajouter `pets: z.array(petSchema).max(1),` après `layout`.
5. Dans `stateSchema`, `version: z.literal(4),`.
6. `createInitialState` : `version: 4`. `makeRoom` : ajouter `pets: [],` après `layout: [],`.
7. Remplacer `const migrate = ...` par :
```ts
// La v4 ajoute les animaux de chaque pièce (aucun).
function migrateV3(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || (raw as { version?: unknown }).version !== 3) return raw;
  const state = raw as { rooms?: unknown };
  const rooms = Array.isArray(state.rooms) ? state.rooms.map((room: unknown) => (typeof room === 'object' && room !== null ? { ...room, pets: [] } : room)) : state.rooms;
  return { ...state, version: 4, rooms };
}

const migrate = (raw: unknown): unknown => migrateV3(migrateV2(migrateV1(raw)));

// Un animal impossible (espèce ou pelage inconnus…) est ignoré sans faire perdre la pièce ; un seul par pièce.
function cleanPets(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { rooms?: unknown }).rooms)) return raw;
  const rooms = (raw as { rooms: unknown[] }).rooms.map((room) => {
    if (typeof room !== 'object' || room === null) return room;
    const pets = (room as { pets?: unknown }).pets;
    return { ...room, pets: Array.isArray(pets) ? pets.filter((p) => petSchema.safeParse(p).success).slice(0, 1) : [] };
  });
  return { ...(raw as object), rooms };
}
```
8. Dans `parseLibraryState`, remplacer `stateSchema.safeParse(dropBadWindows(migrate(raw)))` par `stateSchema.safeParse(cleanPets(dropBadWindows(migrate(raw))))`.
9. À la fin du fichier, ajouter :
```ts
export function adoptPet(state: LibraryState, roomId: string, name: string, coat: Coat): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === roomId);
  if (!room || room.pets.length >= 1) return state;
  const pet: Pet = { id: 'p1', species: 'cat', name: name.trim().slice(0, MAX_PET_NAME) || DEFAULT_PET_NAME, coat };
  return mapRoom(state, roomId, (r) => ({ ...r, pets: [pet] }));
}

export function renamePet(state: LibraryState, roomId: string, petId: string, name: string): LibraryState {
  const clean = name.trim().slice(0, MAX_PET_NAME);
  const room = state.rooms.find((candidate) => candidate.id === roomId);
  if (clean === '' || !room?.pets.some((p) => p.id === petId)) return state;
  return mapRoom(state, roomId, (r) => ({ ...r, pets: r.pets.map((p) => (p.id === petId ? { ...p, name: clean } : p)) }));
}

export function removePet(state: LibraryState, roomId: string, petId: string): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === roomId);
  if (!room?.pets.some((p) => p.id === petId)) return state;
  return mapRoom(state, roomId, (r) => ({ ...r, pets: r.pets.filter((p) => p.id !== petId) }));
}

export function setPetPlan(state: LibraryState, roomId: string, petId: string, plan: PetPlan): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === roomId);
  if (!room?.pets.some((p) => p.id === petId)) return state;
  return mapRoom(state, roomId, (r) => ({ ...r, pets: r.pets.map((p) => (p.id === petId ? { ...p, plan } : p)) }));
}
```

- [ ] **Étape 5 : dépôt**

Dans `src/core/library/library-repo.ts`, après la méthode `update`, ajouter :

```ts
    // Comme `update`, mais sans prévenir les abonnés : le plan du chat change toutes les quelques secondes sans qu'il y ait rien à redessiner.
    updateQuiet(change: (state: LibraryState) => LibraryState): Promise<void> {
      const run = writeTail.then(async () => {
        const next = change(await read());
        await store.set(KEY, next);
        latest = next;
      });
      writeTail = run.catch(() => undefined);
      return run;
    },
```

- [ ] **Étape 6 : corriger les tests existants et le typage**

Passer en revue et corriger :
- `tests/core/library/library-migration.test.ts` : `toBe(3)` → `toBe(4)` (lignes 22 et 37, intitulé « commence en v4 »).
- `tests/core/library/library-scene.test.ts` : les trois `expect(state.version).toBe(3)` → `4`.
- `tests/core/library/room-grid-small.test.ts` ligne ~106 : `version: 3` → `version: 4` et `pets: []` dans la pièce littérale.
- Lancer `npm run typecheck` ; ajouter `pets: []` à chaque littéral `Room` signalé (par exemple `tests/content/library-furniture-view.test.tsx`).

- [ ] **Étape 7 : vérifier**

Run: `npx vitest run tests/core/library --maxWorkers=4 && npm run typecheck`
Attendu : tout vert.

- [ ] **Étape 8 : commit**

```bash
git add -A
git commit -m "feat(bibliotheque): état v4, animaux de pièce et plan mémorisé" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2 : carte de marche

**Fichiers :**
- Créer : `src/core/library/pets/walk-map.ts`, `tests/core/library/pets-walk-map.test.ts`

**Interfaces :**
- Consomme : `Layout`, `Pt`, `Segment` (Tâche 1) ; `isStanding`, `rectOf`, `CELL_W`, `CELL_H`, `ROWS`, `WALL_ROWS`, `type Cell` de `room-grid.ts` ; `layerOf` de `furniture-catalog.ts`.
- Produit : `WALK_SPEED`, `MAX_RISE`, `MAX_GAP`, `Platform`, `WalkMap`, `buildWalkMap(layout, cols)`, `isFree(map, col, row)`, `standPoint(col, row): Pt`, `cellOf(pt): Cell`, `nearestFreeCell(map, pt): Cell | null`, `groundPath(map, from, to): Cell[] | null`, `toSegments(pts, on): Segment[]`, `groundLeg(map, from, to): Segment[] | null`.

- [ ] **Étape 1 : tests**

Créer `tests/core/library/pets-walk-map.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { CELL_H } from '../../../src/core/library/room-grid';
import type { Layout } from '../../../src/core/library/library-types';
import { buildWalkMap, cellOf, groundLeg, groundPath, isFree, standPoint, toSegments } from '../../../src/core/library/pets/walk-map';

const sofa: Layout = [{ id: 'a', kind: 'sofa', col: 2, row: 12 }];

describe('buildWalkMap', () => {
  it('bloque les cases des meubles au sol, pas celles des tapis ni du mur', () => {
    const map = buildWalkMap([...sofa, { id: 'r', kind: 'rug', col: 2, row: 15 }, { id: 's', kind: 'shelf', col: 12, row: 10 }], 24);
    expect(isFree(map, 2, 12)).toBe(false);
    expect(isFree(map, 7, 14)).toBe(false);
    expect(isFree(map, 8, 14)).toBe(true);
    expect(isFree(map, 2, 15)).toBe(true);
    expect(isFree(map, 12, 12)).toBe(false);
    expect(isFree(map, 12, 11)).toBe(false);
    expect(isFree(map, -1, 15)).toBe(false);
    expect(isFree(map, 24, 15)).toBe(false);
  });

  it('crée une plateforme au dessus du canapé', () => {
    const [plat] = buildWalkMap(sofa, 24).platforms;
    expect(plat!.id).toBe('a');
    expect(plat!.y).toBeCloseTo((12 + 3 * 0.45) * CELL_H, 5);
    expect(plat!.x0).toBe(2 * 30 + 6);
    expect(plat!.x1).toBe(8 * 30 - 6);
  });

  it('standPoint et cellOf sont inverses', () => {
    expect(cellOf(standPoint(5, 14))).toEqual({ col: 5, row: 14 });
  });
});

describe('groundPath', () => {
  const map = buildWalkMap(sofa, 24);

  it('contourne le canapé, case libre par case libre', () => {
    const path = groundPath(map, { col: 0, row: 13 }, { col: 9, row: 13 })!;
    expect(path[0]).toEqual({ col: 0, row: 13 });
    expect(path[path.length - 1]).toEqual({ col: 9, row: 13 });
    expect(path.every((c) => isFree(map, c.col, c.row))).toBe(true);
    for (let i = 1; i < path.length; i++) {
      expect(Math.abs(path[i]!.col - path[i - 1]!.col)).toBeLessThanOrEqual(1);
      expect(Math.abs(path[i]!.row - path[i - 1]!.row)).toBeLessThanOrEqual(1);
    }
  });

  it('refuse une arrivée bloquée', () => {
    expect(groundPath(map, { col: 0, row: 13 }, { col: 3, row: 13 })).toBeNull();
  });
});

describe('segments de marche', () => {
  it('fusionne les points alignés', () => {
    const segs = toSegments([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }], null);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.to).toEqual({ x: 100, y: 0 });
    expect(segs[0]!.ms).toBe(Math.round((100 / 70) * 1000));
  });

  it('marche jusqu une destination dans un meuble, sans trou entre segments', () => {
    const map = buildWalkMap([{ id: 'b', kind: 'basket', col: 10, row: 16 }], 24);
    const from = standPoint(0, 14);
    const to = standPoint(11, 17);
    const segs = groundLeg(map, from, to)!;
    expect(segs[0]!.from).toEqual(from);
    expect(segs[segs.length - 1]!.to).toEqual(to);
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.from).toEqual(segs[i - 1]!.to);
  });

  it('un trajet de longueur nulle donne zéro segment', () => {
    const map = buildWalkMap([], 24);
    expect(groundLeg(map, standPoint(3, 14), standPoint(3, 14))).toEqual([]);
  });
});
```

- [ ] **Étape 2 : constater l'échec**

Run: `npx vitest run tests/core/library/pets-walk-map.test.ts` — Attendu : ÉCHEC (module absent).

- [ ] **Étape 3 : implémenter**

Créer `src/core/library/pets/walk-map.ts` :

```ts
import { layerOf } from '../furniture-catalog';
import type { Layout, Pt, Segment, StandingKind } from '../library-types';
import { CELL_H, CELL_W, ROWS, WALL_ROWS, isStanding, rectOf, type Cell } from '../room-grid';

export const WALK_SPEED = 70; // px par seconde
// Un saut monte d'au plus MAX_RISE px et franchit au plus MAX_GAP px à l'horizontale.
export const MAX_RISE = 130;
export const MAX_GAP = 75;

// Le dessus d'un meuble où le chat peut se tenir : de x0 à x1, à la hauteur y.
export type Platform = { id: string; x0: number; x1: number; y: number; col: number; row: number; w: number; h: number };
// `blocked[row - WALL_ROWS][col]` : case du sol occupée par un meuble (les tapis ne bloquent pas).
export type WalkMap = { cols: number; blocked: boolean[][]; platforms: Platform[] };

// Hauteur du dessus, en fraction de la hauteur du meuble depuis son haut (l'assise du canapé est plus bas que son dossier).
const TOP_FRACTION: Partial<Record<StandingKind, number>> = { sofa: 0.45, armchair: 0.45, chair: 0.45, 'coffee-table': 0.3, desk: 0.05, shelf: 0.02 };

export function buildWalkMap(layout: Layout, cols: number): WalkMap {
  const blocked = Array.from({ length: ROWS - WALL_ROWS }, () => new Array<boolean>(cols).fill(false));
  const platforms: Platform[] = [];
  for (const p of layout) {
    if (!isStanding(p)) continue;
    const rect = rectOf(p);
    if (!rect) continue;
    if (layerOf(p.kind) === 'floor') {
      for (let r = Math.max(rect.row, WALL_ROWS); r < Math.min(rect.row + rect.h, ROWS); r++) {
        for (let c = Math.max(rect.col, 0); c < Math.min(rect.col + rect.w, cols); c++) blocked[r - WALL_ROWS]![c] = true;
      }
    }
    const top = TOP_FRACTION[p.kind];
    if (top !== undefined) {
      platforms.push({ id: p.id, x0: rect.col * CELL_W + 6, x1: (rect.col + rect.w) * CELL_W - 6, y: (rect.row + rect.h * top) * CELL_H, col: rect.col, row: rect.row, w: rect.w, h: rect.h });
    }
  }
  return { cols, blocked, platforms };
}

export const isFree = (map: WalkMap, col: number, row: number): boolean =>
  row >= WALL_ROWS && row < ROWS && col >= 0 && col < map.cols && !map.blocked[row - WALL_ROWS]![col];

// Les pieds au milieu de la case, 3 px au-dessus de son bord bas.
export const standPoint = (col: number, row: number): Pt => ({ x: (col + 0.5) * CELL_W, y: (row + 1) * CELL_H - 3 });
export const cellOf = (pt: Pt): Cell => ({ col: Math.floor(pt.x / CELL_W), row: Math.floor(pt.y / CELL_H) });

// La case libre du sol la plus proche d'un point (dans un rayon de 14 cases).
export function nearestFreeCell(map: WalkMap, pt: Pt, radius = 14): Cell | null {
  const here = cellOf(pt);
  let best: Cell | null = null;
  let bestDistance = Infinity;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const cell = { col: here.col + dc, row: here.row + dr };
      if (!isFree(map, cell.col, cell.row)) continue;
      const s = standPoint(cell.col, cell.row);
      const distance = Math.hypot(s.x - pt.x, s.y - pt.y);
      if (distance < bestDistance) {
        best = cell;
        bestDistance = distance;
      }
    }
  }
  return best;
}

const STEPS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Plus court chemin au sol (8 directions, sans couper un coin de meuble) ; null si l'une des cases est bloquée ou si rien ne relie.
export function groundPath(map: WalkMap, from: Cell, to: Cell): Cell[] | null {
  if (!isFree(map, from.col, from.row) || !isFree(map, to.col, to.row)) return null;
  const key = (c: Cell): number => c.row * map.cols + c.col;
  const prev = new Map<number, Cell | null>([[key(from), null]]);
  const queue: Cell[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    if (cur.col === to.col && cur.row === to.row) break;
    for (const [dc, dr] of STEPS) {
      const next = { col: cur.col + dc, row: cur.row + dr };
      if (!isFree(map, next.col, next.row) || prev.has(key(next))) continue;
      if (dc !== 0 && dr !== 0 && (!isFree(map, cur.col + dc, cur.row) || !isFree(map, cur.col, cur.row + dr))) continue;
      prev.set(key(next), cur);
      queue.push(next);
    }
  }
  if (!prev.has(key(to))) return null;
  const path: Cell[] = [];
  for (let c: Cell | null = to; c; c = prev.get(key(c)) ?? null) path.push(c);
  return path.reverse();
}

const walkMs = (a: Pt, b: Pt): number => Math.round((Math.hypot(b.x - a.x, b.y - a.y) / WALK_SPEED) * 1000);

// Des points successifs → des segments de marche sur le support `on` ; les points alignés fusionnent, les pas nuls disparaissent.
export function toSegments(pts: Pt[], on: string | null): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 0.5) continue;
    const last = out[out.length - 1];
    if (last) {
      const ux = last.to.x - last.from.x;
      const uy = last.to.y - last.from.y;
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const cross = ux * vy - uy * vx;
      const dot = ux * vx + uy * vy;
      if (Math.abs(cross) < 1e-3 * Math.hypot(ux, uy) * Math.hypot(vx, vy) && dot > 0) {
        last.to = b;
        last.ms = walkMs(last.from, b);
        continue;
      }
    }
    out.push({ kind: 'walk', from: a, to: b, ms: walkMs(a, b), fromOn: on, on });
  }
  return out;
}

// Marche au sol de `from` à `to`. Un point d'arrivée dans un meuble (panier, niche…) : on marche jusqu'à la case libre la plus proche, puis on y entre.
export function groundLeg(map: WalkMap, from: Pt, to: Pt): Segment[] | null {
  const a = cellOf(from);
  const b = cellOf(to);
  const start = isFree(map, a.col, a.row) ? a : nearestFreeCell(map, from);
  const goal = isFree(map, b.col, b.row) ? b : nearestFreeCell(map, to);
  if (!start || !goal) return null;
  const cells = groundPath(map, start, goal);
  if (!cells) return null;
  return toSegments([from, ...cells.slice(1).map((c) => standPoint(c.col, c.row)), to], null);
}
```

- [ ] **Étape 4 : vérifier** — Run: `npx vitest run tests/core/library/pets-walk-map.test.ts` — Attendu : PASS.

- [ ] **Étape 5 : commit**

```bash
git add -A
git commit -m "feat(bibliotheque): carte de marche du chat (sol, plateformes, chemin)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3 : itinéraires avec sauts et position théorique

**Fichiers :**
- Créer : `src/core/library/pets/route.ts`, `src/core/library/pets/motion.ts`, `tests/core/library/pets-route.test.ts`, `tests/core/library/pets-motion.test.ts`

**Interfaces :**
- Consomme : tout `walk-map.ts` (Tâche 2).
- Produit : `Standing = { pt: Pt; on: string | null; hostId: string | null; facing: 'l' | 'r' }`, `planRoute(map, from: { pt; on }, to: { pt; on }): Segment[] | null`, `routeMs(route)`, `planEndsAt(plan)`, `PetPhase`, `PetState = { pos; phase; facing; on; depthHosts }`, `stateAt(plan, now): PetState`.

- [ ] **Étape 1 : tests**

Créer `tests/core/library/pets-route.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { Layout, Segment } from '../../../src/core/library/library-types';
import { planRoute } from '../../../src/core/library/pets/route';
import { buildWalkMap, standPoint } from '../../../src/core/library/pets/walk-map';

const contiguous = (segs: Segment[]): boolean => segs.every((s, i) => i === 0 || (s.from.x === segs[i - 1]!.to.x && s.from.y === segs[i - 1]!.to.y));

describe('planRoute', () => {
  it('marche au sol vers un point libre', () => {
    const map = buildWalkMap([], 24);
    const segs = planRoute(map, { pt: standPoint(0, 14), on: null }, { pt: standPoint(10, 16), on: null })!;
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.every((s) => s.kind === 'walk' && s.on === null)).toBe(true);
  });

  it('monte sur le canapé par un seul saut', () => {
    const layout: Layout = [{ id: 'a', kind: 'sofa', col: 2, row: 12 }];
    const map = buildWalkMap(layout, 24);
    const plat = map.platforms[0]!;
    const dest = { x: 3.5 * 30, y: plat.y };
    const segs = planRoute(map, { pt: standPoint(0, 16), on: null }, { pt: dest, on: 'a' })!;
    const jumps = segs.filter((s) => s.kind === 'jump');
    expect(jumps).toHaveLength(1);
    expect(jumps[0]).toMatchObject({ fromOn: null, on: 'a' });
    expect(segs[segs.length - 1]!.to).toEqual(dest);
    expect(contiguous(segs)).toBe(true);
  });

  it('descend du canapé au sol', () => {
    const layout: Layout = [{ id: 'a', kind: 'sofa', col: 2, row: 12 }];
    const map = buildWalkMap(layout, 24);
    const plat = map.platforms[0]!;
    const segs = planRoute(map, { pt: { x: 100, y: plat.y }, on: 'a' }, { pt: standPoint(12, 16), on: null })!;
    expect(segs.filter((s) => s.kind === 'jump')).toHaveLength(1);
    expect(segs[segs.length - 1]!.on).toBeNull();
    expect(contiguous(segs)).toBe(true);
  });

  it('atteint le haut d une étagère en passant par le bureau voisin', () => {
    const layout: Layout = [
      { id: 'd', kind: 'desk', col: 14, row: 14 },
      { id: 's', kind: 'shelf', col: 20, row: 10 },
    ];
    const map = buildWalkMap(layout, 36);
    const shelf = map.platforms.find((p) => p.id === 's')!;
    const segs = planRoute(map, { pt: standPoint(2, 16), on: null }, { pt: { x: (shelf.x0 + shelf.x1) / 2, y: shelf.y }, on: 's' })!;
    const jumps = segs.filter((s) => s.kind === 'jump');
    expect(jumps.map((j) => j.on)).toEqual(['d', 's']);
    expect(contiguous(segs)).toBe(true);
  });

  it('renvoie null quand l étagère n a aucun marchepied', () => {
    const map = buildWalkMap([{ id: 's', kind: 'shelf', col: 20, row: 10 }], 36);
    const shelf = map.platforms[0]!;
    expect(planRoute(map, { pt: standPoint(2, 16), on: null }, { pt: { x: shelf.x0 + 10, y: shelf.y }, on: 's' })).toBeNull();
  });
});
```

Créer `tests/core/library/pets-motion.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { PetPlan } from '../../../src/core/library/library-types';
import { planEndsAt, routeMs, stateAt } from '../../../src/core/library/pets/motion';

const walkPlan: PetPlan = {
  action: 'sit',
  hostId: null,
  at: { x: 100, y: 450 },
  on: null,
  route: [{ kind: 'walk', from: { x: 0, y: 450 }, to: { x: 100, y: 450 }, ms: 1000, fromOn: null, on: null }],
  startedAt: 10_000,
  actMs: 500,
  facing: 'r',
  sig: 's',
};

describe('stateAt', () => {
  it('interpole la marche selon le temps écoulé', () => {
    const s = stateAt(walkPlan, 10_500);
    expect(s.phase).toBe('walk');
    expect(s.pos.x).toBeCloseTo(50, 5);
    expect(s.facing).toBe('r');
  });

  it('avant le départ, il est au point de départ', () => {
    expect(stateAt(walkPlan, 5000).pos.x).toBe(0);
  });

  it('une marche vers la gauche le tourne vers la gauche', () => {
    const left: PetPlan = { ...walkPlan, route: [{ ...walkPlan.route[0]!, from: { x: 100, y: 450 }, to: { x: 0, y: 450 } }], at: { x: 0, y: 450 }, facing: 'l' };
    expect(stateAt(left, 10_300).facing).toBe('l');
  });

  it('agit sur place une fois arrivé, puis a fini', () => {
    expect(stateAt(walkPlan, 11_200)).toMatchObject({ phase: 'act', pos: { x: 100, y: 450 }, depthHosts: [null] });
    expect(stateAt(walkPlan, 20_000)).toMatchObject({ phase: 'done', pos: { x: 100, y: 450 } });
  });

  it('un saut suit un arc : plus haut que la ligne droite au milieu, et deux supports pour l ordre de dessin', () => {
    const plan: PetPlan = {
      ...walkPlan,
      on: 'a',
      hostId: 'a',
      route: [{ kind: 'jump', from: { x: 0, y: 450 }, to: { x: 40, y: 380 }, ms: 600, fromOn: null, on: 'a' }],
      at: { x: 40, y: 380 },
    };
    const mid = stateAt(plan, 10_300);
    expect(mid.phase).toBe('jump');
    expect(mid.pos.y).toBeLessThan(415);
    expect(mid.depthHosts).toEqual([null, 'a']);
    expect(mid.on).toBe('a');
  });

  it('routeMs et planEndsAt', () => {
    expect(routeMs(walkPlan.route)).toBe(1000);
    expect(planEndsAt(walkPlan)).toBe(11_500);
  });
});
```

- [ ] **Étape 2 : constater l'échec** — Run: `npx vitest run tests/core/library/pets-route.test.ts tests/core/library/pets-motion.test.ts` — Attendu : ÉCHEC.

- [ ] **Étape 3 : implémenter `route.ts`**

```ts
import type { Pt, Segment } from '../library-types';
import { MAX_GAP, MAX_RISE, groundLeg, isFree, standPoint, toSegments, type Platform, type WalkMap } from './walk-map';

// Où se trouve l'animal : le sol (null) ou le dessus d'un meuble (son id).
export type Support = string | null;
export type Standing = { pt: Pt; on: Support; hostId: string | null; facing: 'l' | 'r' };

type Hop = { leave: Pt; land: Pt };

const jumpMs = (a: Pt, b: Pt): number => Math.round(380 + Math.hypot(b.x - a.x, b.y - a.y) * 1.8);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const platformOf = (map: WalkMap, id: string): Platform | undefined => map.platforms.find((p) => p.id === id);

// Le point du sol d'où sauter sur (ou où retomber depuis) un meuble : la case libre la plus proche de son pied, assez près pour sauter.
function takeoff(map: WalkMap, plat: Platform, climbing: boolean): Pt | null {
  let best: Pt | null = null;
  let bestScore = Infinity;
  for (let row = plat.row + plat.h - 1; row <= plat.row + plat.h + 1; row++) {
    for (let col = plat.col - 2; col < plat.col + plat.w + 2; col++) {
      if (!isFree(map, col, row)) continue;
      const p = standPoint(col, row);
      const dx = p.x < plat.x0 ? plat.x0 - p.x : p.x > plat.x1 ? p.x - plat.x1 : 0;
      if (dx > MAX_GAP || (climbing && p.y - plat.y > MAX_RISE)) continue;
      const score = dx * 3 + Math.abs(row - (plat.row + plat.h)) * 8;
      if (score < bestScore) {
        best = p;
        bestScore = score;
      }
    }
  }
  return best;
}

// Le saut d'un support à l'autre, ou null s'il est hors de portée.
function hop(map: WalkMap, a: Support, b: Support): Hop | null {
  if (a === null && b !== null) {
    const plat = platformOf(map, b);
    const from = plat && takeoff(map, plat, true);
    return plat && from ? { leave: from, land: { x: clamp(from.x, plat.x0, plat.x1), y: plat.y } } : null;
  }
  if (a !== null && b === null) {
    const plat = platformOf(map, a);
    const to = plat && takeoff(map, plat, false);
    return plat && to ? { leave: { x: clamp(to.x, plat.x0, plat.x1), y: plat.y }, land: to } : null;
  }
  if (a === null || b === null) return null;
  const p = platformOf(map, a);
  const q = platformOf(map, b);
  if (!p || !q || p.y - q.y > MAX_RISE) return null;
  const overlap = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
  if (overlap >= 0) {
    const x = (Math.max(p.x0, q.x0) + Math.min(p.x1, q.x1)) / 2;
    return { leave: { x, y: p.y }, land: { x, y: q.y } };
  }
  if (-overlap > MAX_GAP) return null;
  const rightward = p.x1 < q.x0;
  return { leave: { x: rightward ? p.x1 : p.x0, y: p.y }, land: { x: rightward ? q.x0 : q.x1, y: q.y } };
}

// La suite de supports à franchir (largeur d'abord) ; null si le but est hors d'atteinte.
function chain(map: WalkMap, from: Support, to: Support): Support[] | null {
  if (from === to) return [from];
  const nodes: Support[] = [null, ...map.platforms.map((p) => p.id)];
  const prev = new Map<Support, Support>();
  const seen = new Set<Support>([from]);
  const queue: Support[] = [from];
  for (let i = 0; i < queue.length && !seen.has(to); i++) {
    const cur = queue[i]!;
    for (const next of nodes) {
      if (seen.has(next) || hop(map, cur, next) === null) continue;
      seen.add(next);
      prev.set(next, cur);
      queue.push(next);
    }
  }
  if (!seen.has(to)) return null;
  const out: Support[] = [to];
  for (let c: Support = to; c !== from; ) {
    c = prev.get(c) as Support;
    out.unshift(c);
  }
  return out;
}

// Marche sur un support : au sol, avec le chemin autour des meubles ; sur un dessus, en ligne droite.
function leg(map: WalkMap, on: Support, a: Pt, b: Pt): Segment[] | null {
  if (on === null) return groundLeg(map, a, b);
  return platformOf(map, on) ? toSegments([a, b], on) : null;
}

// L'itinéraire complet (marches et sauts, sans trou) de `from` à `to`, ou null.
export function planRoute(map: WalkMap, from: { pt: Pt; on: Support }, to: { pt: Pt; on: Support }): Segment[] | null {
  const hosts = chain(map, from.on, to.on);
  if (!hosts) return null;
  const route: Segment[] = [];
  let cur = from.pt;
  for (let i = 0; i < hosts.length - 1; i++) {
    const a = hosts[i]!;
    const b = hosts[i + 1]!;
    const step = hop(map, a, b)!;
    const walk = leg(map, a, cur, step.leave);
    if (!walk) return null;
    route.push(...walk, { kind: 'jump', from: step.leave, to: step.land, ms: jumpMs(step.leave, step.land), fromOn: a, on: b });
    cur = step.land;
  }
  const last = leg(map, to.on, cur, to.pt);
  return last ? [...route, ...last] : null;
}
```

- [ ] **Étape 4 : implémenter `motion.ts`**

```ts
import type { PetPlan, Pt, Segment } from '../library-types';

export type PetPhase = 'walk' | 'jump' | 'act' | 'done';
// `on` : le support à cet instant (sol = null) ; `depthHosts` : les meubles qui décident de l'ordre de dessin (deux pendant un saut).
export type PetState = { pos: Pt; phase: PetPhase; facing: 'l' | 'r'; on: string | null; depthHosts: (string | null)[] };

export const routeMs = (route: Segment[]): number => route.reduce((total, s) => total + s.ms, 0);
export const planEndsAt = (plan: PetPlan): number => plan.startedAt + routeMs(plan.route) + plan.actMs;

const arcHeight = (s: Segment): number => Math.min(60, 20 + Math.max(0, s.from.y - s.to.y) * 0.3);

// Où est le chat à l'instant `now` ? Un calcul direct sur le plan, sans rien simuler entre-temps.
export function stateAt(plan: PetPlan, now: number): PetState {
  let t = Math.max(0, now - plan.startedAt);
  let facing = plan.facing;
  for (const s of plan.route) {
    const dx = s.to.x - s.from.x;
    if (Math.abs(dx) >= 1) facing = dx > 0 ? 'r' : 'l';
    if (t < s.ms) {
      const u = s.ms === 0 ? 1 : t / s.ms;
      const x = s.from.x + dx * u;
      let y = s.from.y + (s.to.y - s.from.y) * u;
      if (s.kind === 'jump') y -= 4 * arcHeight(s) * u * (1 - u);
      return { pos: { x, y }, phase: s.kind, facing, on: s.on, depthHosts: s.kind === 'jump' ? [s.fromOn, s.on] : [s.on] };
    }
    t -= s.ms;
  }
  return { pos: plan.at, phase: t < plan.actMs ? 'act' : 'done', facing: plan.facing, on: plan.on, depthHosts: [plan.hostId] };
}
```

- [ ] **Étape 5 : vérifier** — Run: `npx vitest run tests/core/library/pets-route.test.ts tests/core/library/pets-motion.test.ts` — Attendu : PASS. Si le test du bureau/étagère échoue, vérifier `MAX_RISE`/`MAX_GAP` avant de toucher aux données du test (bureau : dessus à 402 px, sol à 507 px, étagère à 288 px).

- [ ] **Étape 6 : commit**

```bash
git add -A
git commit -m "feat(bibliotheque): itinéraires du chat (sauts d un meuble à l autre) et position théorique" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4 : le cerveau (choix d'action, reprise, caresse)

**Fichiers :**
- Créer : `src/core/library/pets/brain.ts`, `tests/core/library/pets-brain.test.ts`

**Interfaces :**
- Consomme : `Standing`, `planRoute` (T3), `stateAt`, `planEndsAt`, `PetState` (T3), `buildWalkMap`, `standPoint`, `cellOf`, `isFree`, `nearestFreeCell`, `WalkMap` (T2), `poisOf` (`furniture-catalog.ts`), `hashString` (`scene-world.ts`).
- Produit : `Rng`, `BrainEnv = { layout; cols; rng; still; occupied: ReadonlySet<string> }`, `layoutSig(layout, cols): string`, `nextPlan(env, from: Standing, now, last?): PetPlan`, `spawnPlan(env, now): PetPlan`, `resume(plan | undefined, env, now): { plan: PetPlan; fresh: boolean }`, `touchPlan(plan, env, now): PetPlan | null`.
- Clés de places réservées dans `occupied` : `"<idMeuble>:curl"` (panier), `":sleep"` (niche, canapé), `":eat"` (gamelle), `":seat<i>"` (assises), `":hide"` (sous le canapé).

- [ ] **Étape 1 : tests**

Créer `tests/core/library/pets-brain.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { Layout, PetPlan } from '../../../src/core/library/library-types';
import { layoutSig, nextPlan, resume, spawnPlan, touchPlan, type BrainEnv } from '../../../src/core/library/pets/brain';
import { buildWalkMap, cellOf, isFree, standPoint } from '../../../src/core/library/pets/walk-map';

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const env = (layout: Layout, seed = 1, extra: Partial<BrainEnv> = {}): BrainEnv => ({ layout, cols: 36, rng: seeded(seed), still: false, occupied: new Set(), ...extra });
const from = { pt: standPoint(2, 16), on: null, hostId: null, facing: 'r' as const };
const seeds = Array.from({ length: 200 }, (_, i) => i + 1);

describe('nextPlan', () => {
  it('dans une pièce vide : un plan au sol qui démarre maintenant', () => {
    const plan = nextPlan(env([]), from, 1234);
    expect(plan.startedAt).toBe(1234);
    expect(plan.sig).toBe(layoutSig([], 36));
    expect(plan.route.every((s) => s.kind === 'walk')).toBe(true);
    expect(plan.actMs).toBeGreaterThan(0);
  });

  it('dort dans le panier, à son point de pelotonnement', () => {
    const layout: Layout = [{ id: 'b', kind: 'basket', col: 10, row: 16 }];
    const plans = seeds.map((s) => nextPlan(env(layout, s), from, 0)).filter((p) => p.action === 'sleep' && p.hostId === 'b');
    expect(plans.length).toBeGreaterThan(0);
    expect(plans[0]!.at).toEqual(standPoint(11, 17));
  });

  it('respecte les places réservées', () => {
    const layout: Layout = [{ id: 'b', kind: 'basket', col: 10, row: 16 }];
    const occupied = new Set(['b:curl']);
    expect(seeds.some((s) => nextPlan(env(layout, s, { occupied }), from, 0).hostId === 'b')).toBe(false);
  });

  it('monte dormir ou s asseoir sur le canapé par un saut', () => {
    const layout: Layout = [{ id: 'a', kind: 'sofa', col: 2, row: 12 }];
    const plans = seeds.map((s) => nextPlan(env(layout, s), from, 0)).filter((p) => p.on === 'a');
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every((p) => p.route.some((r) => r.kind === 'jump'))).toBe(true);
    expect(new Set(plans.map((p) => p.action))).toContain('sleep');
  });

  it('mange et boit à la gamelle, se cache sous le canapé, griffe le fauteuil', () => {
    const layout: Layout = [
      { id: 'a', kind: 'sofa', col: 2, row: 12 },
      { id: 'g', kind: 'armchair', col: 12, row: 13 },
      { id: 'w', kind: 'bowl', col: 20, row: 17 },
    ];
    const actions = new Set(seeds.map((s) => nextPlan(env(layout, s), from, 0)).map((p) => `${p.action}:${p.hostId}`));
    expect(actions).toContain('eat:w');
    expect(actions).toContain('drink:w');
    expect(actions).toContain('hide:a');
    expect(Array.from(actions).some((a) => a.startsWith('scratch'))).toBe(true);
  });

  it('en mouvement réduit : jamais de trajet', () => {
    const layout: Layout = [{ id: 'a', kind: 'sofa', col: 2, row: 12 }];
    for (const s of seeds.slice(0, 50)) {
      const plan = nextPlan(env(layout, s, { still: true }), from, 0);
      expect(plan.route).toEqual([]);
      expect(['sit', 'sleep']).toContain(plan.action);
    }
  });
});

describe('resume', () => {
  const layout: Layout = [{ id: 'a', kind: 'sofa', col: 2, row: 12 }];
  const sig = layoutSig(layout, 36);
  const resting: PetPlan = { action: 'sit', hostId: null, at: standPoint(10, 16), on: null, route: [], startedAt: 1000, actMs: 5000, facing: 'r', sig };

  it('sans plan : apparaît sur une case libre du sol', () => {
    const r = resume(undefined, env(layout), 0);
    expect(r.fresh).toBe(true);
    const map = buildWalkMap(layout, 36);
    const start = r.plan.route[0]?.from ?? r.plan.at;
    const c = cellOf(start);
    expect(isFree(map, c.col, c.row)).toBe(true);
  });

  it('plan en cours : reprise telle quelle', () => {
    const r = resume(resting, env(layout), 3000);
    expect(r.fresh).toBe(false);
    expect(r.plan).toBe(resting);
  });

  it('plan fini : une nouvelle action, qui part de là où il était', () => {
    const r = resume(resting, env(layout), 9000);
    expect(r.fresh).toBe(true);
    expect(r.plan.startedAt).toBe(9000);
    const start = r.plan.route[0]?.from ?? r.plan.at;
    expect(start).toEqual(resting.at);
  });

  it('meuble retiré pendant qu il dort dessus : il est reposé au sol puis replanifié', () => {
    const onSofa: PetPlan = { action: 'sleep', hostId: 'a', at: { x: 105, y: 378 }, on: 'a', route: [], startedAt: 0, actMs: 60_000, facing: 'r', sig };
    const r = resume(onSofa, env([]), 500);
    expect(r.fresh).toBe(true);
    expect(r.plan.on).toBeNull();
    const start = r.plan.route[0]?.from ?? r.plan.at;
    const c = cellOf(start);
    expect(isFree(buildWalkMap([], 36), c.col, c.row)).toBe(true);
  });

  it('spawnPlan sur une pièce entièrement bloquée ne plante pas', () => {
    expect(() => spawnPlan(env([]), 0)).not.toThrow();
  });
});

describe('touchPlan', () => {
  const sig = layoutSig([], 36);
  const sitting: PetPlan = { action: 'sit', hostId: null, at: standPoint(5, 15), on: null, route: [], startedAt: 0, actMs: 5000, facing: 'l', sig };

  it('ronronne sur place, 3,5 s', () => {
    const plan = touchPlan(sitting, env([]), 1000)!;
    expect(plan).toMatchObject({ action: 'purr', at: sitting.at, route: [], startedAt: 1000, actMs: 3500, facing: 'l' });
  });

  it('pas de caresse en plein saut', () => {
    const jumping: PetPlan = { ...sitting, route: [{ kind: 'jump', from: { x: 0, y: 450 }, to: { x: 40, y: 380 }, ms: 1000, fromOn: null, on: null }] };
    expect(touchPlan(jumping, env([]), 500)).toBeNull();
  });
});
```

- [ ] **Étape 2 : constater l'échec** — Run: `npx vitest run tests/core/library/pets-brain.test.ts` — Attendu : ÉCHEC.

- [ ] **Étape 3 : implémenter `brain.ts`**

```ts
import { poisOf } from '../furniture-catalog';
import type { Layout, PetAction, PetPlan, Pt, Segment } from '../library-types';
import { CELL_W, ROWS, WALL_ROWS, isStanding, type Cell } from '../room-grid';
import { hashString } from '../scene-world';
import { planEndsAt, stateAt, type PetState } from './motion';
import { planRoute, type Standing } from './route';
import { buildWalkMap, cellOf, isFree, nearestFreeCell, standPoint, type WalkMap } from './walk-map';

export type Rng = () => number;
// `occupied` : les places réservées (clés `<meuble>:<point>`) que le chat doit éviter ; vide tant qu'il vit seul.
export type BrainEnv = { layout: Layout; cols: number; rng: Rng; still: boolean; occupied: ReadonlySet<string> };

type Ms = readonly [number, number];
type Candidate = { weight: number; action: PetAction; route: Segment[]; at: Pt; on: string | null; hostId: string | null; facing: 'l' | 'r'; ms: Ms };
type Dest = { pt: Pt; on: string | null; hostId: string | null };

// Signature des meubles debout : quand elle change, les itinéraires mémorisés ne sont plus fiables.
export function layoutSig(layout: Layout, cols: number): string {
  const parts = layout.filter(isStanding).map((p) => `${p.id}:${p.kind}:${p.col}:${p.row}`).sort();
  return `${cols}|${hashString(parts.join(','))}`;
}

const between = (rng: Rng, [lo, hi]: Ms): number => Math.round(lo + rng() * (hi - lo));

function freeCells(map: WalkMap): Cell[] {
  const cells: Cell[] = [];
  for (let row = WALL_ROWS; row < ROWS; row++) for (let col = 0; col < map.cols; col++) if (isFree(map, col, row)) cells.push({ col, row });
  return cells;
}

function facingOf(route: Segment[], fallback: 'l' | 'r'): 'l' | 'r' {
  for (let i = route.length - 1; i >= 0; i--) {
    const dx = route[i]!.to.x - route[i]!.from.x;
    if (Math.abs(dx) >= 1) return dx > 0 ? 'r' : 'l';
  }
  return fallback;
}

// Choisit la prochaine action selon les meubles posés (tirage pondéré), planifie le trajet et renvoie le plan qui démarre à `now`.
export function nextPlan(env: BrainEnv, from: Standing, now: number, last?: PetAction): PetPlan {
  const map = buildWalkMap(env.layout, env.cols);
  const cands: Candidate[] = [];
  const stay = (action: PetAction, weight: number, ms: Ms): void => {
    cands.push({ weight, action, route: [], at: from.pt, on: from.on, hostId: from.hostId, facing: from.facing, ms });
  };
  const go = (action: PetAction, weight: number, dest: Dest, ms: Ms, key?: string, facing?: 'l' | 'r'): void => {
    if (key !== undefined && env.occupied.has(key)) return;
    const route = planRoute(map, from, dest);
    if (!route) return;
    cands.push({ weight, action, route, at: dest.pt, on: dest.on, hostId: dest.hostId, facing: facing ?? facingOf(route, from.facing), ms });
  };

  if (env.still) {
    stay('sit', 2, [8000, 16000]);
    stay('sleep', 1, [20000, 40000]);
  } else {
    stay('sit', 1, [4000, 9000]);
    stay('groom', 1.2, [5000, 8000]);
    stay('stretch', 0.8, [2500, 3500]);
    stay('yawn', 0.6, [2000, 3000]);
    if (from.hostId === null) stay('sleep', 0.4, [15000, 30000]);
    const cells = freeCells(map);
    for (let i = 0; i < 4 && cells.length > 0; i++) {
      const c = cells[Math.floor(env.rng() * cells.length)]!;
      go('sit', 0.45, { pt: standPoint(c.col, c.row), on: null, hostId: null }, [3000, 6000]);
    }
    for (const p of env.layout) {
      if (!isStanding(p)) continue;
      const poi = (type: string) => poisOf(p.kind).filter((q) => q.type === type);
      const cellPt = (dx: number, dy: number): Pt => standPoint(p.col + dx, p.row + dy);
      const plat = map.platforms.find((q) => q.id === p.id);
      if (p.kind === 'basket') for (const q of poi('curl')) go('sleep', 2.2, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [25000, 60000], `${p.id}:curl`);
      if (p.kind === 'kennel') for (const q of poi('sleep')) go('sleep', 2, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [25000, 60000], `${p.id}:sleep`);
      if (p.kind === 'bowl') {
        for (const q of poi('eat')) {
          go('eat', 1.4, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [5000, 8000], `${p.id}:eat`);
          go('drink', 1, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [3000, 5000], `${p.id}:eat`);
        }
      }
      if (plat && (p.kind === 'sofa' || p.kind === 'armchair' || p.kind === 'chair')) {
        for (const q of poi('sleep')) go('sleep', 1.8, { pt: { x: (p.col + q.dx + 0.5) * CELL_W, y: plat.y }, on: p.id, hostId: p.id }, [25000, 60000], `${p.id}:sleep`);
        poi('seat').forEach((q, i) => go('perch', p.kind === 'sofa' ? 0.5 : 1, { pt: { x: (p.col + q.dx + 0.5) * CELL_W, y: plat.y }, on: p.id, hostId: p.id }, [10000, 25000], `${p.id}:seat${i}`));
      }
      if (p.kind === 'sofa') go('hide', 0.7, { pt: standPoint(p.col + 2, p.row + 2), on: null, hostId: p.id }, [8000, 16000], `${p.id}:hide`);
      if (p.kind === 'armchair') {
        const left = { col: p.col - 1, row: p.row + 2 };
        const right = { col: p.col + 3, row: p.row + 2 };
        const side = isFree(map, left.col, left.row) ? { cell: left, facing: 'r' as const } : isFree(map, right.col, right.row) ? { cell: right, facing: 'l' as const } : null;
        if (side) go('scratch', 1, { pt: standPoint(side.cell.col, side.cell.row), on: null, hostId: null }, [5000, 7000], undefined, side.facing);
      }
      if (plat && (p.kind === 'shelf' || p.kind === 'desk')) {
        const x = plat.x0 + 10 + env.rng() * Math.max(0, plat.x1 - plat.x0 - 20);
        go('perch', 0.8, { pt: { x, y: plat.y }, on: p.id, hostId: p.id }, [12000, 30000]);
      }
    }
  }

  const weights = cands.map((c) => c.weight * (c.action === last ? 0.2 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = env.rng() * total;
  let chosen = cands[cands.length - 1]!;
  for (let i = 0; i < cands.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) {
      chosen = cands[i]!;
      break;
    }
  }
  return {
    action: chosen.action,
    hostId: chosen.hostId,
    at: chosen.at,
    on: chosen.on,
    route: chosen.route,
    startedAt: now,
    actMs: between(env.rng, chosen.ms),
    facing: chosen.facing,
    sig: layoutSig(env.layout, env.cols),
  };
}

// Un chat qui apparaît (premier affichage, plan abîmé) : sur une case libre du sol, puis une première action.
export function spawnPlan(env: BrainEnv, now: number): PetPlan {
  const cells = freeCells(buildWalkMap(env.layout, env.cols));
  const cell = cells.length > 0 ? cells[Math.floor(env.rng() * cells.length)]! : { col: 0, row: ROWS - 1 };
  return nextPlan(env, { pt: standPoint(cell.col, cell.row), on: null, hostId: null, facing: 'r' }, now);
}

// Où poser le chat quand les meubles ont changé : là où il était si c'est encore valable, sinon sur la case libre la plus proche.
function standingFrom(map: WalkMap, state: PetState): Standing {
  const { pos, on } = state;
  if (on !== null) {
    const plat = map.platforms.find((p) => p.id === on);
    if (plat && pos.x >= plat.x0 - 1 && pos.x <= plat.x1 + 1 && Math.abs(pos.y - plat.y) < 2) return { pt: pos, on, hostId: on, facing: state.facing };
  } else {
    const c = cellOf(pos);
    if (isFree(map, c.col, c.row)) return { pt: pos, on: null, hostId: null, facing: state.facing };
  }
  const cell = nearestFreeCell(map, pos);
  return { pt: cell ? standPoint(cell.col, cell.row) : pos, on: null, hostId: null, facing: state.facing };
}

// Le plan à suivre à l'instant `now` : celui en cours s'il tient encore, sinon un nouveau (`fresh`), pris là où le chat se trouve en théorie.
export function resume(plan: PetPlan | undefined, env: BrainEnv, now: number): { plan: PetPlan; fresh: boolean } {
  if (plan === undefined) return { plan: spawnPlan(env, now), fresh: true };
  const sig = layoutSig(env.layout, env.cols);
  if (plan.sig === sig && now < planEndsAt(plan)) return { plan, fresh: false };
  const state = stateAt(plan, now);
  const standing: Standing =
    plan.sig === sig
      ? { pt: plan.at, on: plan.on, hostId: plan.hostId, facing: plan.facing }
      : standingFrom(buildWalkMap(env.layout, env.cols), state);
  return { plan: nextPlan(env, standing, now, plan.action), fresh: true };
}

// Une caresse : le chat s'arrête là où il est et ronronne 3,5 s. Pas en plein saut ; un plan fini sera remplacé par la boucle.
export function touchPlan(plan: PetPlan, env: BrainEnv, now: number): PetPlan | null {
  const state = stateAt(plan, now);
  if (state.phase === 'jump' || state.phase === 'done') return null;
  const hostId = state.phase === 'act' ? plan.hostId : state.on;
  return { action: 'purr', hostId, at: state.pos, on: state.on, route: [], startedAt: now, actMs: 3500, facing: state.facing, sig: layoutSig(env.layout, env.cols) };
}
```

Remarque : `PetState` et `nearestFreeCell` sont importés pour `standingFrom` ; supprimer les imports devenus inutiles si le linter le signale.

- [ ] **Étape 4 : vérifier** — Run: `npx vitest run tests/core/library/pets-brain.test.ts` — Attendu : PASS. Si « griffe le fauteuil » échoue, vérifier que la case à gauche/droite du fauteuil (3×3) est libre dans la disposition du test.

- [ ] **Étape 5 : commit**

```bash
git add -A
git commit -m "feat(bibliotheque): cerveau du chat (actions pondérées, reprise, replanification, caresse)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5 : profondeur et exécuteur

**Fichiers :**
- Créer : `src/core/library/pets/depth.ts`, `src/core/library/pets/runner.ts`, `tests/core/library/pets-runner.test.ts`

**Interfaces :**
- Consomme : `Room`, `PetPlan`, `Coat`, `Pt` ; `PetState`, `stateAt`, `planEndsAt` (T3) ; `BrainEnv`, `resume`, `touchPlan`, `layoutSig`, `Rng` (T4).
- Produit : `depthKey(layout, state): number`, `depthIndex(layout, key): number`, `Pose`, `poseOf(state, plan): Pose`, `PetFrame = { id; coat; name; pose; facing; behind; pos }`, `createPetRunner({ rng?, still?, onPlan })` → `{ step(room, now): PetFrame[]; touch(room, petId, now): boolean }`.

- [ ] **Étape 1 : tests**

Créer `tests/core/library/pets-runner.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../../../src/core/library/library-book';
import type { Layout, PetPlan, Room } from '../../../src/core/library/library-types';
import { layoutSig } from '../../../src/core/library/pets/brain';
import { createPetRunner } from '../../../src/core/library/pets/runner';
import { standPoint } from '../../../src/core/library/pets/walk-map';

const sofa: Layout = [{ id: 'a', kind: 'sofa', col: 2, row: 12 }];
const roomWith = (layout: Layout, plan?: PetPlan): Room => ({
  ...createInitialState().rooms[0]!,
  layout,
  pets: [{ id: 'p1', species: 'cat', name: 'Minou', coat: 'orange', ...(plan ? { plan } : {}) }],
});
const resting = (layout: Layout, at: { x: number; y: number }): PetPlan => ({
  action: 'sit', hostId: null, at, on: null, route: [], startedAt: 0, actMs: 100_000, facing: 'r', sig: layoutSig(layout, 24),
});

describe('createPetRunner', () => {
  it('apparaît avec un nouveau plan, signalé une seule fois', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan, rng: () => 0.3 });
    const room = roomWith(sofa);
    const [frame] = runner.step(room, 1000);
    expect(frame).toMatchObject({ id: 'p1', name: 'Minou', coat: 'orange' });
    runner.step(room, 1010);
    expect(onPlan).toHaveBeenCalledTimes(1);
  });

  it('reprend un plan mémorisé sans le réécrire', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const frames = runner.step(roomWith(sofa, resting(sofa, standPoint(10, 16))), 500);
    expect(onPlan).not.toHaveBeenCalled();
    expect(frames[0]!.pos).toEqual(standPoint(10, 16));
    expect(frames[0]!.pose).toBe('sit');
  });

  it('choisit une nouvelle action quand la précédente est finie', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const plan = { ...resting(sofa, standPoint(10, 16)), actMs: 1000 };
    runner.step(roomWith(sofa, plan), 5000);
    expect(onPlan).toHaveBeenCalledTimes(1);
    expect(onPlan.mock.calls[0]![0]).toBe('p1');
  });

  it('replanifie quand un meuble est retiré', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const room = roomWith(sofa, resting(sofa, standPoint(10, 16)));
    runner.step(room, 500);
    runner.step({ ...room, layout: [] }, 600);
    expect(onPlan).toHaveBeenCalledTimes(1);
  });

  it('le rang de dessin : devant le canapé quand il est plus bas, derrière quand il est plus haut', () => {
    const runner = createPetRunner({ onPlan: vi.fn() });
    expect(runner.step(roomWith(sofa, resting(sofa, standPoint(3, 16))), 10)[0]!.behind).toBe(1);
    expect(createPetRunner({ onPlan: vi.fn() }).step(roomWith(sofa, resting(sofa, standPoint(10, 12))), 10)[0]!.behind).toBe(0);
  });

  it('une caresse le fait ronronner sur place', () => {
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const room = roomWith(sofa, resting(sofa, standPoint(10, 16)));
    runner.step(room, 500);
    expect(runner.touch(room, 'p1', 600)).toBe(true);
    expect(runner.step(room, 700)[0]!.pose).toBe('purr');
    expect(onPlan).toHaveBeenCalledTimes(1);
    expect(runner.touch(room, 'inconnu', 700)).toBe(false);
  });

  it('oublie l animal retiré et change de pièce proprement', () => {
    const runner = createPetRunner({ onPlan: vi.fn() });
    const room = roomWith([]);
    runner.step(room, 0);
    expect(runner.step({ ...room, pets: [] }, 10)).toEqual([]);
    expect(runner.touch(room, 'p1', 20)).toBe(false);
  });
});
```

- [ ] **Étape 2 : constater l'échec** — Run: `npx vitest run tests/core/library/pets-runner.test.ts` — Attendu : ÉCHEC.

- [ ] **Étape 3 : `depth.ts`**

```ts
import type { Layout } from '../library-types';
import { CELL_H, isStanding, rectOf } from '../room-grid';
import type { PetState } from './motion';

const bottomPx = (layout: Layout, id: string): number | null => {
  const placed = layout.find((p) => p.id === id);
  const rect = placed && rectOf(placed);
  return rect ? (rect.row + rect.h) * CELL_H : null;
};

// Hauteur de profondeur du chat : ses pieds, ou le bas du meuble qui le porte ou le contient (+0,1 : il est devant lui).
export function depthKey(layout: Layout, state: PetState): number {
  let key = state.pos.y;
  for (const id of state.depthHosts) {
    const bottom = id === null ? null : bottomPx(layout, id);
    if (bottom !== null) key = Math.max(key, bottom + 0.1);
  }
  return key;
}

// Combien de meubles debout (hors tapis) sont dessinés avant le chat : ceux dont le bas est au-dessus de sa profondeur.
export function depthIndex(layout: Layout, key: number): number {
  let count = 0;
  for (const p of layout) {
    if (!isStanding(p) || p.kind === 'rug') continue;
    const rect = rectOf(p);
    if (rect && (rect.row + rect.h) * CELL_H <= key) count++;
  }
  return count;
}
```

- [ ] **Étape 4 : `runner.ts`**

```ts
import type { Coat, PetPlan, Pt, Room } from '../library-types';
import { layoutSig, resume, touchPlan, type BrainEnv, type Rng } from './brain';
import { depthIndex, depthKey } from './depth';
import { planEndsAt, stateAt, type PetState } from './motion';

export type Pose = 'walk' | 'jump' | 'sit' | 'groom' | 'stretch' | 'yawn' | 'sleep' | 'eat' | 'scratch' | 'hide' | 'purr';
export type PetFrame = { id: string; coat: Coat; name: string; pose: Pose; facing: 'l' | 'r'; behind: number; pos: Pt };

export function poseOf(state: PetState, plan: PetPlan): Pose {
  if (state.phase === 'walk' || state.phase === 'jump') return state.phase;
  switch (plan.action) {
    case 'perch':
      return 'sit';
    case 'drink':
      return 'eat';
    default:
      return plan.action;
  }
}

const NO_PLACES: ReadonlySet<string> = new Set();

// Fait vivre les animaux d'une pièce : à chaque pas, la position et la pose de chacun à l'instant donné.
// `onPlan` est appelé à chaque NOUVEAU plan (à mémoriser), jamais à chaque image.
export function createPetRunner(opts: { rng?: Rng; still?: boolean; onPlan: (petId: string, plan: PetPlan) => void }) {
  const rng = opts.rng ?? Math.random;
  const still = opts.still ?? false;
  const plans = new Map<string, PetPlan>();
  let roomId = '';
  let sigLayout: Room['layout'] | null = null;
  let sigCols = 0;
  let sig = '';

  const envOf = (room: Room): BrainEnv => ({ layout: room.layout, cols: room.cols, rng, still, occupied: NO_PLACES });

  function enter(room: Room): void {
    if (room.id !== roomId) {
      plans.clear();
      roomId = room.id;
    }
    for (const id of Array.from(plans.keys())) if (!room.pets.some((p) => p.id === id)) plans.delete(id);
  }

  return {
    step(room: Room, now: number): PetFrame[] {
      enter(room);
      if (sigLayout !== room.layout || sigCols !== room.cols) {
        sig = layoutSig(room.layout, room.cols);
        sigLayout = room.layout;
        sigCols = room.cols;
      }
      const env = envOf(room);
      return room.pets.map((pet) => {
        let plan = plans.get(pet.id) ?? pet.plan;
        if (plan === undefined || plan.sig !== sig || now >= planEndsAt(plan)) {
          const next = resume(plan, env, now);
          plan = next.plan;
          if (next.fresh) opts.onPlan(pet.id, plan);
        }
        plans.set(pet.id, plan);
        const state = stateAt(plan, now);
        return { id: pet.id, coat: pet.coat, name: pet.name, pose: poseOf(state, plan), facing: state.facing, behind: depthIndex(room.layout, depthKey(room.layout, state)), pos: state.pos };
      });
    },
    // Une caresse : vrai si le chat s'est arrêté pour ronronner.
    touch(room: Room, petId: string, now: number): boolean {
      enter(room);
      const plan = plans.get(petId);
      const next = plan && touchPlan(plan, envOf(room), now);
      if (!next) return false;
      plans.set(petId, next);
      opts.onPlan(petId, next);
      return true;
    },
  };
}
```

- [ ] **Étape 5 : vérifier** — Run: `npx vitest run tests/core/library/pets-runner.test.ts` — Attendu : PASS. Puis `npx vitest run tests/core/library --maxWorkers=4` pour s'assurer qu'aucune régression n'apparaît.

- [ ] **Étape 6 : commit**

```bash
git add -A
git commit -m "feat(bibliotheque): exécuteur des animaux (pose, profondeur, caresse)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6 : dessin du chat

**Fichiers :**
- Créer : `src/content/pet-sprite.tsx`, `tests/content/pet-sprite.test.tsx`

**Interfaces :**
- Consomme : `Coat`, `Pose` (T5).
- Produit : `COAT_COLORS: Record<Coat, { body; belly; dark; stripes?: boolean }>`, `COAT_LABELS: Record<Coat, string>`, `PetSprite({ coat, pose, facing, name })`. Racine `<g data-pet-pose={pose} data-coat={coat}>` ; corps dans `<g data-cat-body transform="scale(-1 1)">` quand `facing === 'l'`. Origine du repère = les pieds, le chat regarde vers la droite par défaut.

- [ ] **Étape 1 : tests**

Créer `tests/content/pet-sprite.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { COAT_COLORS, PetSprite } from '../../src/content/pet-sprite';
import { COATS } from '../../src/core/library/library-types';
import type { Pose } from '../../src/core/library/pets/runner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function draw(props: Parameters<typeof PetSprite>[0]): SVGElement {
  const container = document.createElement('div');
  document.body.append(container);
  act(() => createRoot(container).render(<svg><PetSprite {...props} /></svg>));
  return container.querySelector('svg') as SVGElement;
}

const POSES: Pose[] = ['walk', 'jump', 'sit', 'groom', 'stretch', 'yawn', 'sleep', 'eat', 'scratch', 'hide', 'purr'];

describe('PetSprite', () => {
  it.each(POSES)('dessine la pose %s', (pose) => {
    const svg = draw({ coat: 'orange', pose, facing: 'r', name: 'Minou' });
    expect(svg.querySelector(`[data-pet-pose="${pose}"]`)).not.toBeNull();
    expect(svg.querySelector('[data-cat-body]')!.children.length).toBeGreaterThan(0);
  });

  it('tourne le corps vers la gauche sans retourner le nom', () => {
    const svg = draw({ coat: 'gray', pose: 'purr', facing: 'l', name: 'Pilou' });
    expect(svg.querySelector('[data-cat-body]')!.getAttribute('transform')).toBe('scale(-1 1)');
    expect(svg.querySelector('[data-pet-name]')!.textContent).toBe('Pilou');
    expect(svg.querySelector('[data-pet-name]')!.closest('[data-cat-body]')).toBeNull();
  });

  it('montre le nom et des cœurs seulement quand il ronronne', () => {
    expect(draw({ coat: 'white', pose: 'sit', facing: 'r', name: 'Pilou' }).querySelector('[data-pet-name]')).toBeNull();
    expect(draw({ coat: 'white', pose: 'purr', facing: 'r', name: 'Pilou' }).textContent).toContain('♥');
  });

  it.each(COATS)('le pelage %s a sa couleur', (coat) => {
    const svg = draw({ coat, pose: 'sit', facing: 'r', name: 'x' });
    expect(svg.innerHTML.toLowerCase()).toContain(COAT_COLORS[coat].body.toLowerCase());
  });
});
```

- [ ] **Étape 2 : constater l'échec** — Run: `npx vitest run tests/content/pet-sprite.test.tsx` — Attendu : ÉCHEC.

- [ ] **Étape 3 : implémenter `pet-sprite.tsx`**

```tsx
import type { ReactElement } from 'react';
import type { Coat } from '../core/library/library-types';
import type { Pose } from '../core/library/pets/runner';

type Colors = { body: string; belly: string; dark: string; stripes?: boolean };

export const COAT_COLORS: Record<Coat, Colors> = {
  orange: { body: '#E8913A', belly: '#F6C98B', dark: '#B96A1E' },
  black: { body: '#2B2B31', belly: '#3A3A42', dark: '#15151A' },
  gray: { body: '#8A8F99', belly: '#B5B9C1', dark: '#5F636C' },
  white: { body: '#F2F2F0', belly: '#FFFFFF', dark: '#CFCFCB' },
  tabby: { body: '#B58A5B', belly: '#D9BC93', dark: '#6F4E2E', stripes: true },
  bicolor: { body: '#2B2B31', belly: '#FFFFFF', dark: '#15151A' },
};
export const COAT_LABELS: Record<Coat, string> = { orange: 'Roux', black: 'Noir', gray: 'Gris', white: 'Blanc', tabby: 'Tigré', bicolor: 'Bicolore' };

type Props = { coat: Coat; pose: Pose; facing: 'l' | 'r'; name: string };

function Head({ x, y, c, tilt = 0, mouth = false, closed = false }: { x: number; y: number; c: Colors; tilt?: number; mouth?: boolean; closed?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
      <polygon points="-6,-5 -5,-14 0,-7" fill={c.body} />
      <polygon points="1,-7 6,-14 7,-4" fill={c.body} />
      <circle r="8" fill={c.body} />
      <ellipse cx="2" cy="3" rx="4.5" ry="3.2" fill={c.belly} />
      {closed ? (
        <path d="M-5 -1h3 M1 -1h3" stroke="#222" strokeWidth="1.2" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="-2.5" cy="-1" r="1.3" fill="#222" />
          <circle cx="3.5" cy="-1" r="1.3" fill="#222" />
        </>
      )}
      <path d="M-0.5 2 l1.5 1.5 l1.5 -1.5z" fill="#E88" />
      {mouth && <ellipse cx="1" cy="5.8" rx="2.4" ry="2.8" fill="#7A2A2A" />}
      {c.stripes && <path d="M-3 -7v3 M1 -8v3 M5 -7v3" stroke={c.dark} strokeWidth="1.2" />}
    </g>
  );
}

// Une patte qui se balance autour de son attache ; `late` décale la phase de la moitié du pas.
function Leg({ x, c, swing = false, late = false, y = -10, h = 10 }: { x: number; c: Colors; swing?: boolean; late?: boolean; y?: number; h?: number }) {
  return (
    <rect x={x} y={y} width="4.4" height={h} rx="2.2" fill={c.dark}>
      {swing && <animateTransform attributeName="transform" type="rotate" values={`-22 ${x + 2} ${y};22 ${x + 2} ${y};-22 ${x + 2} ${y}`} dur="0.55s" begin={late ? '-0.27s' : '0s'} repeatCount="indefinite" />}
    </rect>
  );
}

const Tail = ({ d, c }: { d: string; c: Colors }) => <path d={d} fill="none" stroke={c.body} strokeWidth="4.6" strokeLinecap="round" />;

function standing(c: Colors, swing: boolean, headY = -25, headX = 18, tilt = 0): ReactElement {
  return (
    <>
      <Tail d="M-15 -19 C-27 -22 -27 -36 -20 -38" c={c} />
      <Leg x={-13} c={c} swing={swing} />
      <Leg x={-7} c={c} swing={swing} late />
      <ellipse cx="0" cy="-17" rx="17" ry="8.5" fill={c.body} />
      <ellipse cx="2" cy="-14" rx="12" ry="4.5" fill={c.belly} opacity="0.7" />
      {c.stripes && <path d="M-8 -24v5 M-2 -25v6 M4 -25v6" stroke={c.dark} strokeWidth="1.4" />}
      <Leg x={6} c={c} swing={swing} late />
      <Leg x={12} c={c} swing={swing} />
      <Head x={headX} y={headY} c={c} tilt={tilt} />
    </>
  );
}

function sitting(c: Colors, head: ReactElement, extras?: ReactElement): ReactElement {
  return (
    <>
      <Tail d="M-9 -3 C-24 -2 -24 -16 -16 -17" c={c} />
      <ellipse cx="-3" cy="-13" rx="10.5" ry="13" fill={c.body} />
      <ellipse cx="2" cy="-11" rx="5" ry="9" fill={c.belly} />
      {c.stripes && <path d="M-9 -20h5 M-9 -14h5 M-9 -8h5" stroke={c.dark} strokeWidth="1.4" />}
      <rect x="3" y="-12" width="4.6" height="12" rx="2.3" fill={c.body} />
      {extras}
      {head}
    </>
  );
}

function body(pose: Pose, c: Colors): ReactElement {
  switch (pose) {
    case 'walk':
      return standing(c, true);
    case 'eat':
      return standing(c, false, -9, 23, 38);
    case 'jump':
      return (
        <g transform="rotate(-14 0 -16)">
          <Tail d="M-17 -18 C-30 -16 -32 -10 -34 -6" c={c} />
          <ellipse cx="0" cy="-17" rx="18" ry="7" fill={c.body} />
          <rect x="-26" y="-15" width="13" height="4.4" rx="2.2" fill={c.dark} />
          <rect x="14" y="-23" width="13" height="4.4" rx="2.2" fill={c.dark} />
          <Head x={21} y={-27} c={c} />
        </g>
      );
    case 'sit':
    case 'purr':
      return sitting(c, <Head x={4} y={-33} c={c} />);
    case 'yawn':
      return sitting(c, <Head x={4} y={-33} c={c} mouth />);
    case 'groom':
      return sitting(
        c,
        <Head x={4} y={-33} c={c} tilt={12} />,
        <rect x="7" y="-32" width="4.2" height="12" rx="2.1" fill={c.body} transform="rotate(-25 9 -20)">
          <animateTransform attributeName="transform" type="rotate" values="-25 9 -20;-5 9 -20;-25 9 -20" dur="0.7s" repeatCount="indefinite" />
        </rect>,
      );
    case 'scratch':
      return sitting(
        c,
        <Head x={5} y={-34} c={c} tilt={-8} />,
        <rect x="8" y="-36" width="4.4" height="16" rx="2.2" fill={c.body}>
          <animateTransform attributeName="transform" type="translate" values="0 0;0 5;0 0" dur="0.5s" repeatCount="indefinite" />
        </rect>,
      );
    case 'stretch':
      return (
        <>
          <Tail d="M-16 -16 C-26 -18 -26 -28 -22 -34" c={c} />
          <rect x="-15" y="-12" width="4.4" height="12" rx="2.2" fill={c.dark} />
          <ellipse cx="2" cy="-14" rx="18" ry="7" fill={c.body} transform="rotate(14 2 -14)" />
          <rect x="8" y="-5" width="17" height="4.4" rx="2.2" fill={c.dark} />
          <Head x={25} y={-10} c={c} tilt={20} />
        </>
      );
    case 'sleep':
      return (
        <>
          <ellipse cx="0" cy="-9" rx="20" ry="9.5" fill={c.body} />
          {c.stripes && <path d="M-10 -17v5 M-3 -18v6 M4 -18v6" stroke={c.dark} strokeWidth="1.4" />}
          <Tail d="M-18 -6 C-24 3 6 5 14 0" c={c} />
          <Head x={14} y={-8} c={c} tilt={70} closed />
        </>
      );
    case 'hide':
      return (
        <>
          <polygon points="-9,-10 -7,-17 -3,-11" fill={c.dark} />
          <polygon points="3,-11 7,-17 9,-10" fill={c.dark} />
          <ellipse cx="-5" cy="-6" rx="2.3" ry="3" fill="#F5D44A" />
          <ellipse cx="5" cy="-6" rx="2.3" ry="3" fill="#F5D44A" />
        </>
      );
  }
}

// Le nom, au-dessus du chat, quand on le caresse (hors du groupe retourné : le texte ne s'inverse pas).
function Bubble({ name }: { name: string }) {
  const w = Math.max(44, name.length * 6.6 + 18);
  return (
    <g style={{ pointerEvents: 'none' }}>
      <text x="0" y="-62" textAnchor="middle" fontSize="12" fill="#E24B6A">
        ♥ ♥
        <animate attributeName="opacity" values="1;0.35;1" dur="1.2s" repeatCount="indefinite" />
      </text>
      <rect x={-w / 2} y="-86" width={w} height="18" rx="9" fill="#FFFFFF" stroke="#9AA0A6" />
      <text data-pet-name="" x="0" y="-73" textAnchor="middle" fontSize="11" fill="#222" fontFamily="system-ui, sans-serif">
        {name}
      </text>
    </g>
  );
}

export function PetSprite({ coat, pose, facing, name }: Props) {
  const c = COAT_COLORS[coat];
  return (
    <g data-pet-pose={pose} data-coat={coat}>
      {pose !== 'hide' && pose !== 'jump' && <ellipse cx="0" cy="0" rx="19" ry="3" fill="#000" opacity="0.18" />}
      <g data-cat-body="" transform={facing === 'l' ? 'scale(-1 1)' : undefined}>
        {body(pose, c)}
      </g>
      {pose === 'purr' && <Bubble name={name} />}
    </g>
  );
}
```

- [ ] **Étape 4 : vérifier** — Run: `npx vitest run tests/content/pet-sprite.test.tsx` — Attendu : PASS.

- [ ] **Étape 5 : commit**

```bash
git add -A
git commit -m "feat(bibliotheque): dessin SVG du chat (11 poses, 6 pelages)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7 : affichage dans la pièce (hook, RoomView, panneau)

**Fichiers :**
- Créer : `src/content/pet-sim.ts`
- Modifier : `src/content/RoomView.tsx`, `src/content/LibraryPanel.tsx`
- Test : `tests/content/library-pets-view.test.tsx`

**Interfaces :**
- Consomme : `createPetRunner`, `PetFrame`, `Pose` (T5), `PetSprite` (T6), `setPetPlan`, `adoptPet` (T1), `repo.updateQuiet` (T1).
- Produit : `PetView = { id; coat; name; pose; facing; behind }`, `usePetSim(room: Room | null, onPlan: (roomId, petId, plan) => void)` → `{ views: PetView[]; attach(id, el: SVGGElement | null): void; touch(id): void }` ; props `RoomView` : `pets?: PetView[]`, `petAttach?: (id: string, el: SVGGElement | null) => void`, `onPetTap?: (id: string) => void` ; élément `<g data-pet="<id>">` dans le SVG.

- [ ] **Étape 1 : tests**

Créer `tests/content/library-pets-view.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { RoomView } from '../../src/content/RoomView';
import { createMemoryStore, type KeyValueStore } from '../../src/core/cache/store';
import { adoptPet, createInitialState } from '../../src/core/library/library-book';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';
import type { Room } from '../../src/core/library/library-types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let store: KeyValueStore;
let repo: LibraryRepo;
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const q = (selector: string) => container.querySelector<SVGElement | HTMLElement>(selector);

async function mountPanel() {
  repo = createLibraryRepo(store);
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  store = createMemoryStore();
});
afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('RoomView avec un chat', () => {
  const room: Room = {
    ...createInitialState().rooms[0]!,
    cols: 48,
    layout: [
      { id: 'a', kind: 'sofa', col: 2, row: 12 },
      { id: 'f', kind: 'chair', col: 20, row: 15 },
    ],
  };

  it('insère le chat parmi les meubles selon son rang de dessin', async () => {
    await act(async () => {
      root.render(
        <RoomView
          room={room}
          editing={false}
          cellsActive={false}
          selectedId={null}
          blink={[]}
          onCell={() => undefined}
          onPick={() => undefined}
          pets={[{ id: 'p1', coat: 'orange', name: 'Minou', pose: 'sit', facing: 'r', behind: 1 }]}
        />,
      );
    });
    const order = Array.from(container.querySelectorAll('[data-furniture],[data-pet]')).map((el) => el.getAttribute('data-furniture') ?? el.getAttribute('data-pet'));
    expect(order).toEqual(['sofa', 'p1', 'chair']);
  });
});

describe('LibraryPanel avec un chat', () => {
  it('affiche le chat adopté et mémorise son plan sans prévenir les abonnés', async () => {
    await createLibraryRepo(store).update((s) => adoptPet(s, 'r1', 'Minou', 'orange'));
    await mountPanel();
    expect(q('[data-pet="p1"]')).not.toBeNull();
    await settle();
    expect(repo.current()!.rooms[0]!.pets[0]!.plan).toBeDefined();
  });

  it('au retour, reprend le plan mémorisé sans en choisir un autre', async () => {
    await createLibraryRepo(store).update((s) => adoptPet(s, 'r1', 'Minou', 'orange'));
    await mountPanel();
    await settle();
    const saved = repo.current()!.rooms[0]!.pets[0]!.plan!;
    act(() => root.unmount());
    root = createRoot(container);
    await mountPanel();
    await settle();
    expect(repo.current()!.rooms[0]!.pets[0]!.plan).toEqual(saved);
  });

  it('une pièce sans chat n en dessine pas', async () => {
    await mountPanel();
    expect(q('[data-pet]')).toBeNull();
  });
});
```

Note : le second test suppose qu'un plan dure au moins quelques secondes (durée d'action minimale 2 s) ; il se lit immédiatement après la sauvegarde.

- [ ] **Étape 2 : constater l'échec** — Run: `npx vitest run tests/content/library-pets-view.test.tsx` — Attendu : ÉCHEC.

- [ ] **Étape 3 : `pet-sim.ts`**

```ts
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PetPlan, Room } from '../core/library/library-types';
import { createPetRunner, type PetFrame } from '../core/library/pets/runner';

export type PetView = Omit<PetFrame, 'pos'>;

const FRAME_MS = 33;

const reducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const toView = ({ pos: _pos, ...view }: PetFrame): PetView => view;
const sameViews = (a: PetView[], b: PetFrame[]): boolean =>
  a.length === b.length && a.every((v, i) => v.id === b[i]!.id && v.pose === b[i]!.pose && v.facing === b[i]!.facing && v.behind === b[i]!.behind && v.name === b[i]!.name && v.coat === b[i]!.coat);

const place = (el: SVGGElement, pos: { x: number; y: number }): void => el.setAttribute('transform', `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`);

// Anime les animaux de la pièce affichée. La position passe directement dans l'attribut `transform` (aucun rendu React par image) ;
// React ne re-rend que lorsque la pose, le sens ou le rang de dessin changent.
export function usePetSim(room: Room | null, onPlan: (roomId: string, petId: string, plan: PetPlan) => void) {
  const [views, setViews] = useState<PetView[]>([]);
  const nodes = useRef(new Map<string, SVGGElement>());
  const frames = useRef<PetFrame[]>([]);
  const roomRef = useRef(room);
  const onPlanRef = useRef(onPlan);
  useLayoutEffect(() => {
    roomRef.current = room;
    onPlanRef.current = onPlan;
  });
  const still = useMemo(reducedMotion, []);
  const runner = useMemo(
    () => createPetRunner({ still, onPlan: (petId, plan) => { const r = roomRef.current; if (r) onPlanRef.current(r.id, petId, plan); } }),
    [still],
  );

  const tick = useCallback(() => {
    const r = roomRef.current;
    const list = r ? runner.step(r, Date.now()) : [];
    frames.current = list;
    for (const f of list) {
      const el = nodes.current.get(f.id);
      if (el) place(el, f.pos);
    }
    setViews((prev) => (sameViews(prev, list) ? prev : list.map(toView)));
  }, [runner]);

  const petCount = room?.pets.length ?? 0;
  const roomId = room?.id;
  useEffect(() => {
    tick();
    if (petCount === 0) return;
    if (still) {
      const timer = window.setInterval(tick, 1000);
      return () => window.clearInterval(timer);
    }
    let frame = 0;
    let last = 0;
    const loop = (now: number): void => {
      frame = window.requestAnimationFrame(loop);
      if (document.visibilityState === 'hidden' || now - last < FRAME_MS) return;
      last = now;
      tick();
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [tick, still, petCount, roomId]);

  // Pose le transform tout de suite quand le nœud apparaît (sinon le chat resterait à l'origine jusqu'à l'image suivante).
  const attach = useCallback((id: string, el: SVGGElement | null) => {
    if (!el) {
      nodes.current.delete(id);
      return;
    }
    nodes.current.set(id, el);
    const frame = frames.current.find((f) => f.id === id);
    if (frame) place(el, frame.pos);
  }, []);

  const touch = useCallback((id: string) => {
    const r = roomRef.current;
    if (r && runner.touch(r, id, Date.now())) tick();
  }, [runner, tick]);

  return { views, attach, touch };
}
```

- [ ] **Étape 4 : `RoomView.tsx`**

1. Imports : `import { PetSprite } from './pet-sprite';` et `import type { PetView } from './pet-sim';`.
2. Dans `Props`, ajouter :
```ts
  // Chats de la pièce : `behind` = nombre de meubles debout dessinés avant lui. Leur position est posée par la boucle d'animation (attribut transform).
  pets?: PetView[];
  petAttach?: (id: string, el: SVGGElement | null) => void;
  onPetTap?: (id: string) => void;
```
3. Dans la signature de `RoomView`, ajouter `pets = [], petAttach, onPetTap` à la déstructuration.
4. Remplacer le bloc `const ordered = [ ...windows, ...rugs, ...sorted..., ...computers ];` (et son commentaire d'ordre) par :

```tsx
  const standing = room.layout.filter(isStanding);
  const bottomRow = (p: (typeof standing)[number]): number => p.row + sizeOf(p.kind).h;
  const sortedStanding = standing.filter((p) => p.kind !== 'rug').sort((a, b) => bottomRow(a) - bottomRow(b));
  // Les chats s'insèrent au rang `behind` parmi les meubles triés : derrière ceux dont le bas est plus bas que ses pieds, devant les autres.
  const middle: (ReactElement | null)[] = sortedStanding.map(renderPlaced);
  for (const v of [...pets].sort((a, b) => b.behind - a.behind)) {
    middle.splice(Math.min(v.behind, middle.length), 0, (
      <g key={`pet-${v.id}`} data-pet={v.id} ref={(el) => petAttach?.(v.id, el)} onClick={() => onPetTap?.(v.id)} style={{ cursor: 'pointer', pointerEvents: editing ? 'none' : 'auto' }}>
        <PetSprite coat={v.coat} pose={v.pose} facing={v.facing} name={v.name} />
      </g>
    ));
  }
  const backLayer = [...windows, ...standing.filter((p) => p.kind === 'rug')];
  const computers = room.layout.filter((p) => p.kind === 'computer');
```
(Conserver la définition de `smalls` qui suit.) Si `standing` était déjà défini plus haut, ne pas le redéfinir.

5. Dans le JSX, remplacer `{ordered.map(renderPlaced)}` par :
```tsx
      {backLayer.map(renderPlaced)}
      {middle}
      {computers.map(renderPlaced)}
```

- [ ] **Étape 5 : `LibraryPanel.tsx`**

1. Imports : `import { usePetSim } from './pet-sim';`, `setPetPlan` (ajouter à l'import depuis `library-book`), `type PetPlan` (ajouter à l'import des types de `library-types`).
2. Avant le `if (!lib) return <div className="wmt-lib" data-wmt-library />;` (après `useSceneTime`, avec les autres hooks), ajouter :
```tsx
  // Le chat : son plan est mémorisé sans prévenir les abonnés (il change toutes les quelques secondes, rien à redessiner).
  const savePlan = useCallback((roomId: string, petId: string, plan: PetPlan) => { void library.updateQuiet((state) => setPetPlan(state, roomId, petId, plan)); }, [library]);
  const sim = usePetSim(lib ? activeRoom(lib) : null, savePlan);
```
   et ajouter `useCallback` à l'import de `react`.
3. Dans le `<RoomView ... />` du panneau, ajouter :
```tsx
            pets={sim.views}
            petAttach={sim.attach}
            onPetTap={(id) => sim.touch(id)}
```

- [ ] **Étape 6 : vérifier**

Run: `npx vitest run tests/content/library-pets-view.test.tsx tests/content/library-panel.test.tsx tests/content/library-furniture-view.test.tsx --maxWorkers=4 && npm run typecheck`
Attendu : tout vert.

- [ ] **Étape 7 : commit**

```bash
git add -A
git commit -m "feat(bibliotheque): le chat vit dans la pièce (boucle d animation, rang de dessin, plan mémorisé)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8 : interface « Adopter », renommer, retirer, caresser

**Fichiers :**
- Modifier : `src/content/LibraryPanel.tsx`
- Test : `tests/content/library-pets-ui.test.tsx`

**Interfaces :**
- Consomme : `adoptPet`, `renamePet`, `removePet`, `MAX_PET_NAME` (T1) ; `COAT_COLORS`, `COAT_LABELS` (T6) ; `COATS` (T1) ; `sim.touch` (T7).
- Produit (sélecteurs pour les tests et la fiche WikiHow) : rangée `role="group" aria-label="Animaux"` en mode Aménager ; boutons `[data-action="adopt"]`, `[data-action="adopt-confirm"]`, `[data-action="adopt-cancel"]`, `[data-coat="<pelage>"]`, `[data-action="remove-pet"]` ; champs `input[aria-label="Nom du chat à adopter"]` et `input[aria-label="Nom du chat"]`.

- [ ] **Étape 1 : tests**

Créer `tests/content/library-pets-ui.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from '../../src/content/LibraryPanel';
import { createMemoryStore } from '../../src/core/cache/store';
import { createLibraryRepo, type LibraryRepo } from '../../src/core/library/library-repo';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let repo: LibraryRepo;
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const q = (selector: string) => container.querySelector<SVGElement | HTMLElement>(selector);
async function click(selector: string) {
  const el = q(selector);
  if (!el) throw new Error(`introuvable : ${selector}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
}
async function type(selector: string, value: string, blur = false) {
  const input = q(selector) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { input.focus(); });
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (blur) input.blur();
  });
  await settle();
}

beforeEach(async () => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  repo = createLibraryRepo(createMemoryStore());
  await act(async () => { root.render(<LibraryPanel library={repo} />); });
  await settle();
});
afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('adoption du chat', () => {
  it('la rangée Animaux n apparaît qu en mode Aménager', async () => {
    expect(q('[aria-label="Animaux"]')).toBeNull();
    await click('[data-action="edit"]');
    expect(q('[aria-label="Animaux"]')).not.toBeNull();
    expect(q('[data-action="adopt"]')).not.toBeNull();
  });

  it('adopte un chat avec un nom et un pelage', async () => {
    await click('[data-action="edit"]');
    await click('[data-action="adopt"]');
    await type('input[aria-label="Nom du chat à adopter"]', 'Moustache');
    await click('[data-coat="black"]');
    await click('[data-action="adopt-confirm"]');
    expect(repo.current()!.rooms[0]!.pets[0]).toMatchObject({ name: 'Moustache', coat: 'black' });
    expect(q('[data-pet="p1"]')).not.toBeNull();
    expect(q('[data-action="adopt"]')).toBeNull();
  });

  it('annuler l adoption ne crée rien', async () => {
    await click('[data-action="edit"]');
    await click('[data-action="adopt"]');
    await click('[data-action="adopt-cancel"]');
    expect(repo.current()!.rooms[0]!.pets).toEqual([]);
    expect(q('[data-action="adopt"]')).not.toBeNull();
  });

  it('renomme puis retire le chat après confirmation', async () => {
    await click('[data-action="edit"]');
    await click('[data-action="adopt"]');
    await click('[data-action="adopt-confirm"]');
    expect(repo.current()!.rooms[0]!.pets[0]!.name).toBe('Minou');
    await type('input[aria-label="Nom du chat"]', 'Pilou', true);
    expect(repo.current()!.rooms[0]!.pets[0]!.name).toBe('Pilou');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click('[data-action="remove-pet"]');
    expect(repo.current()!.rooms[0]!.pets).toHaveLength(1);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click('[data-action="remove-pet"]');
    expect(repo.current()!.rooms[0]!.pets).toEqual([]);
    expect(q('[data-pet]')).toBeNull();
  });
});

describe('caresser le chat', () => {
  it('toucher le chat en mode Visiter le fait ronronner et montre son nom', async () => {
    await click('[data-action="edit"]');
    await click('[data-action="adopt"]');
    await type('input[aria-label="Nom du chat à adopter"]', 'Pilou');
    await click('[data-action="adopt-confirm"]');
    await click('[data-action="visit"]');
    await click('[data-pet="p1"]');
    expect(q('[data-pet-pose="purr"]')).not.toBeNull();
    expect(q('[data-pet-name]')!.textContent).toBe('Pilou');
  });
});
```

- [ ] **Étape 2 : constater l'échec** — Run: `npx vitest run tests/content/library-pets-ui.test.tsx` — Attendu : ÉCHEC.

- [ ] **Étape 3 : `LibraryPanel.tsx`**

1. Imports : `adoptPet`, `renamePet`, `removePet`, `MAX_PET_NAME` depuis `../core/library/library-book` (compléter l'import existant) ; `COATS`, `type Coat` depuis `library-types` (compléter) ; `import { COAT_COLORS, COAT_LABELS } from './pet-sprite';`.
2. Dans l'objet `ICONS`, ajouter :
```ts
  cat: ['M5 9L4 3l5 3', 'M19 9l1-6-5 3', 'M5 9c0 6 2 11 7 11s7-5 7-11c-2-2-5-3-7-3S7 7 5 9z', 'M9 12h.01', 'M15 12h.01', 'M11 15l1 1 1-1'],
  check: ['M5 12l5 5L20 7'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
```
3. Avec les autres `useState` (avant le `if (!lib)`), ajouter :
```tsx
  const [adopting, setAdopting] = useState(false);
  const [adoptName, setAdoptName] = useState('Minou');
  const [adoptCoat, setAdoptCoat] = useState<Coat>('orange');
```
4. Après `const onDeleteRoom = ...`, ajouter :
```tsx
  const pet = room.pets[0];
  const confirmAdopt = (): void => {
    setAdopting(false);
    void library.update((state) => adoptPet(state, room.id, adoptName, adoptCoat));
  };
  const onRemovePet = (): void => {
    if (!pet || !window.confirm(`Retirer ${pet.name} de cette pièce ?`)) return;
    void library.update((state) => removePet(state, room.id, pet.id));
  };
```
5. Dans le JSX, juste avant le bloc `{editing && (<div ... aria-label="Catégories de meubles">`, insérer la rangée :
```tsx
      {editing && (
        <div className="wmt-lib-row" role="group" aria-label="Animaux">
          {pet ? (
            <>
              <input
                key={pet.id}
                className="wmt-lib-name"
                aria-label="Nom du chat"
                defaultValue={pet.name}
                maxLength={MAX_PET_NAME}
                onBlur={(event) => {
                  const name = event.currentTarget.value;
                  void library.update((state) => renamePet(state, room.id, pet.id, name));
                }}
              />
              <Btn label="Retirer le chat" data={{ action: 'remove-pet' }} onClick={onRemovePet}>
                <Icon paths={ICONS.trash} />
              </Btn>
            </>
          ) : adopting ? (
            <>
              <input className="wmt-lib-name" aria-label="Nom du chat à adopter" value={adoptName} maxLength={MAX_PET_NAME} onChange={(event) => setAdoptName(event.currentTarget.value)} />
              {COATS.map((coat) => (
                <Btn key={coat} label={COAT_LABELS[coat]} pressed={adoptCoat === coat} data={{ coat }} onClick={() => setAdoptCoat(coat)}>
                  <span className="wmt-lib-swatch" style={{ background: COAT_COLORS[coat].body, borderColor: COAT_COLORS[coat].belly }} />
                </Btn>
              ))}
              <Btn label="Adopter ce chat" data={{ action: 'adopt-confirm' }} onClick={confirmAdopt}>
                <Icon paths={ICONS.check} />
              </Btn>
              <Btn label="Annuler" data={{ action: 'adopt-cancel' }} onClick={() => setAdopting(false)}>
                <Icon paths={ICONS.close} />
              </Btn>
            </>
          ) : (
            <Btn label="Adopter un chat" data={{ action: 'adopt' }} onClick={() => setAdopting(true)}>
              <Icon paths={ICONS.cat} />
            </Btn>
          )}
        </div>
      )}
```
6. Le chat est dessiné en mode Visiter ET Aménager ; en Aménager il ne capte pas les touchers (`pointerEvents: 'none'` déjà dans RoomView).

- [ ] **Étape 4 : vérifier**

Run: `npx vitest run tests/content/library-pets-ui.test.tsx tests/content/library-pets-view.test.tsx tests/content/library-panel.test.tsx --maxWorkers=4 && npm run typecheck`
Attendu : tout vert.

- [ ] **Étape 5 : commit**

```bash
git add -A
git commit -m "feat(bibliotheque): adopter, renommer, retirer et caresser le chat" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9 : fiche WikiHow, spec, vérification complète et livraison

**Fichiers :**
- Modifier : `src/core/whats-new/entries.ts`, `docs/superpowers/specs/2026-10-09-bibliotheque-chat-design.md`

- [ ] **Étape 1 : fiche WikiHow `bibliotheque-v9`**

Dans `src/core/whats-new/entries.ts`, juste après l'entrée `bibliotheque-v8` (avant le `];` final), ajouter une entrée de même forme :

```ts
  {
    id: 'bibliotheque-v9',
    theme: 'collection',
    glyph: '🐱',
    title: 'Un chat dans la pièce',
    summary: 'Adoptez un chat qui marche, saute, dort et se laisse caresser',
    steps: [
      {
        target: '[data-wmt-library] [data-action="adopt"]',
        title: 'Adopter un chat',
        text: 'En mode Aménager, la rangée Animaux propose le glyphe du chat : touchez-le, choisissez un nom et un pelage, puis validez avec la coche. Le chat apparaît dans la pièce et commence sa vie.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Passez en mode Aménager avec le crayon, touchez le chat dans la rangée Animaux, écrivez son nom, touchez un pelage (roux, noir, gris, blanc, tigré, bicolore) puis la coche.' },
          { label: 'À quoi ça sert', text: 'À donner de la vie à votre pièce : le chat marche, saute sur le canapé, dort dans son panier, mange à la gamelle ou se cache sous le canapé, selon les meubles que vous avez posés.' },
          { label: 'Limites', text: 'Un seul chat par pièce. Il se déplace seulement là où il y a de la place : sans meuble, il se promène et se toilette ; sans panier, il dort par terre.' },
        ],
        scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library-entry]', '[data-wmt-library] [data-action="edit"]'] },
      },
      {
        target: '[data-wmt-library] svg[role="img"]',
        title: 'Caresser le chat',
        text: 'En mode Visiter, touchez le chat : il s’arrête, ronronne et son nom s’affiche au-dessus de lui avec des petits cœurs. Au bout de quelques secondes il repart.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Revenez au mode Visiter avec l’œil, puis touchez le chat. Pendant un saut il n’y répond pas : réessayez une seconde plus tard.' },
          { label: 'À quoi ça sert', text: 'À donner un peu de vie et d’attention à la pièce, sans aucune contrainte : pas de jauge, rien à entretenir.' },
        ],
        scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library-entry]'] },
      },
      {
        target: '[data-wmt-library] svg[role="img"]',
        title: 'Retrouver le chat comme on l’a laissé',
        text: 'Quand vous revenez, le chat reprend son action là où elle en serait : s’il dormait pour une minute, il dort encore ; si son action est finie, il en choisit une autre.',
        gesture: 'tap',
        details: [
          { label: 'Comment faire', text: 'Rien à faire : fermez la Bibliothèque ou la page, revenez plus tard. En mode Aménager, le nom du chat se change et le bouton corbeille le retire de la pièce.' },
          { label: 'D’où viennent les données', text: 'Tout est enregistré sur cet appareil : le nom, le pelage et l’action en cours. Rien n’est envoyé.' },
          { label: 'Limites', text: 'Le chat ne bouge pas réellement quand la page est fermée : sa position au retour est calculée, pas simulée. Avec le mode « réduire les animations » de l’appareil, il reste assis ou endormi sur place.' },
        ],
        scene: { page: '/collection', closeWindows: true, reveal: ['[data-wmt-library-entry]'] },
      },
    ],
  },
```

Run: `npx vitest run tests/core/whats-new` — Attendu : PASS (identifiant unique, textes ≥ 60 caractères, ≥ 2 détails de ≥ 20 caractères par étape). Ajuster les textes si un seuil n'est pas atteint.

- [ ] **Étape 2 : corriger la spec sur le moment des écritures**

Dans `docs/superpowers/specs/2026-10-09-bibliotheque-chat-design.md`, remplacer le paragraphe « **Écritures** : … » par :

```md
**Écritures** : à chaque NOUVEAU plan (changement d'action, caresse, replanification), via `updateQuiet` (aucun abonné prévenu, donc aucun rendu superflu). Le plan contient des horodatages absolus : sa position à tout instant se déduit sans rien réécrire, donc rien à écrire quand la page se cache ou se ferme. Jamais à chaque image.
```

- [ ] **Étape 3 : vérification complète**

Run: `npm test -- --maxWorkers=4` puis `npm run typecheck` puis `npm run build`
Attendu : tout vert, build sans erreur. Corriger tout échec avant de continuer (ne rien annoncer de fini tant que ce n'est pas vérifié).

- [ ] **Étape 4 : commit**

```bash
git add -A
git commit -m "docs(bibliotheque): fiche WikiHow bibliotheque-v9 et spec du chat" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Étape 5 : livraison (routine du projet)**

1. `git push -u origin feat/bibliotheque-chat`.
2. Ouvrir la PR vers `main` (`gh pr create`), la fusionner sans demander (routine du projet), puis `npm run preprod` (la pré-prod suit chaque fusion ; la production, `npm run promouvoir`, seulement sur ordre explicite).
3. Mettre à jour la mémoire du projet (`project_bibliotheque.md`) : 6a fusionné ; reste 6b chien, 6c robot, 6d contexte, 6e cohabitation, 5b, 7, 2c ; vérification manuelle Chrome à faire (rendu des 11 poses, sauts, ordre de dessin devant/derrière les meubles, cacher sous le canapé, reprise après rechargement, mouvement réduit) + APK à la demande.

---

## Autorevue

- **Couverture de la spec** : adoption nom + pelage (T1, T6, T8) ; toucher réactif (T4 `touchPlan`, T5, T7, T8) ; comportements marcher/s'asseoir/toilette/étirement/bâillement (T4 `stay`), dormir panier/niche/canapé/sol, manger/boire (T4), monter canapé/fauteuil/chaise par saut + griffer le fauteuil (T4), grimper étagère/bureau via marchepieds + se cacher sous le canapé (T3, T4) ; déplacement continu, saut en arc, replanification si un meuble change (T3, T4 `resume`) ; places réservées (T4 `occupied`) ; mémorisation de l'action, de sa fin et de la position théorique, reprise ou nouvelle action, rien en arrière-plan (T1 schéma, T3 `stateAt`, T4 `resume`, T5, T7) ; migration v3→v4 (T1) ; mouvement réduit (T4 `still`, T7 minuterie) ; WikiHow `bibliotheque-v9` (T9).
- **Cohérence des types** : `Segment.fromOn/on`, `PetPlan.{hostId,on,at,route,startedAt,actMs,facing,sig}`, `Standing`, `PetState.depthHosts`, `PetFrame`/`PetView` — mêmes noms dans toutes les tâches.
- **Points à vérifier à la main (hors jsdom)** : rendu des poses et des pelages, qualité du saut, ordre devant/derrière, pose « se cacher » (deux yeux et deux oreilles devant le bas du canapé), chat qui reste visible derrière un meuble.
