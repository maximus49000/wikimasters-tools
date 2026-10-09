# Chien, plusieurs animaux et interactions : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter le chien, jusqu'à 3 animaux par pièce (n'importe quel mélange) et 5 scènes d'interaction à deux (se saluer, toilette, poursuite, le chat remet le chien à sa place, dormir côte à côte).

**Architecture:** Le moteur pur `src/core/library/pets/` reste la source de vérité : un profil d'actions par espèce dans `brain.ts`, un nouveau `scenes.ts` qui fabrique des plans appariés (mêmes `startedAt`), un champ `lag` dans le plan pour qu'un animal attende l'arrivée de l'autre avant de bouger, et `runner.ts` qui déclenche les scènes, calcule les places réservées et abandonne une scène dont le partenaire a disparu. Le dessin (`pet-sprite.tsx`, `dog-sprite.tsx`) et l'interface (`LibraryPanel.tsx`) suivent.

**Tech Stack:** TypeScript, React, SVG, zod 4, vitest (jsdom pour les tests de contenu).

**Spec:** `docs/superpowers/specs/2026-10-09-bibliotheque-chien-design.md`

## Global Constraints

- **Écarts assumés par rapport à la spec** (à reporter dans la spec à la tâche 1) : l'état RESTE en **v4** (le plafond passe de 1 à 3 et l'espèce `dog` s'ajoute, les états v4 existants restent valides ; un build antérieur ignorerait seulement les chiens) ; deux boutons d'adoption (`data-action="adopt"` chat, `data-action="adopt-dog"` chien) au lieu d'un sélecteur d'espèce ; la poursuite ne **réinverse pas** les rôles (le poursuivi file, le poursuivant le rattrape, tous deux jouent) ; le sommeil côte à côte n'est possible qu'à côté d'un partenaire DÉJÀ endormi au sol.
- Jamais de téléportation ; aucune simulation en arrière-plan ; les plans sont en horodatages absolus et écrits seulement à chaque NOUVEAU plan (`onPlan`).
- Aucune scène en mode « animations réduites » (`still`).
- Aucune scène plus longue que ~8 s d'action (le sommeil côte à côte est exclu de cette limite).
- Une scène n'implique que des animaux AU SOL (`on === null`) en pleine action sur place, hors `hide`.
- Textes de l'interface en français, glyphes plutôt que texte, tout visible à l'écran (mobile et extension).
- Tests : `npx vitest run --maxWorkers=4 <fichier>` (le test `library-drag` est instable en parallèle total) ; contrôle de types : `npm run typecheck`.
- Commits : message en français, terminé par `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Travailler dans le worktree `C:\Users\maxim\Downloads\Wikimasters-bibliotheque`, branche `feat/bibliotheque-chien`.

---

## File Structure

- Modifier `src/core/library/library-types.ts` : `Species`, `DOG_COATS`, `ALL_COATS`, `PairScene`, actions, champs de `PetPlan` (`lag`, `key`, `with`).
- Modifier `src/core/library/library-book.ts` : schéma (espèce, pelage, plan), plafond 3, `adoptPet` (espèce, id libre).
- Modifier `src/core/library/pets/motion.ts` : phase `wait` (le `lag`).
- Modifier `src/core/library/pets/route.ts` : `scaleRoute`.
- Modifier `src/core/library/pets/brain.ts` : espèce, profil du chien, vitesse, `key` du plan.
- Créer `src/core/library/pets/scenes.ts` : `proposeScene`.
- Modifier `src/core/library/pets/runner.ts` : espèce par animal, `occupied`, scènes, validité des plans appariés, `PetFrame.species`.
- Modifier `src/content/pet-sprite.tsx` : nouvelles poses du chat, aiguillage par espèce, `paletteOf`.
- Créer `src/content/dog-sprite.tsx` : le corps du chien.
- Modifier `src/content/pet-sim.ts`, `src/content/RoomView.tsx` : espèce transmise.
- Modifier `src/content/LibraryPanel.tsx` : plusieurs animaux, adoption chat/chien.
- Modifier `src/core/whats-new/entries.ts` : fiche `bibliotheque-v10`.
- Tests : `tests/core/library/library-pets.test.ts`, `pets-motion.test.ts`, `pets-brain.test.ts`, `pets-scenes.test.ts` (nouveau), `pets-runner.test.ts`, `tests/content/pet-sprite.test.tsx`, `library-pets-ui.test.tsx`, `library-pets-view.test.tsx`.

---

### Task 1: Types, schéma et adoption à plusieurs

**Files:**
- Modify: `src/core/library/library-types.ts:35-53`
- Modify: `src/core/library/library-book.ts` (imports ligne 2, `planSchema`, `petSchema`, `roomSchema`, `cleanPets`, `adoptPet`)
- Modify: `docs/superpowers/specs/2026-10-09-bibliotheque-chien-design.md` (écarts listés plus haut)
- Test: `tests/core/library/library-pets.test.ts`

**Interfaces:**
- Produces: `Species = 'cat' | 'dog'`; `COATS` (chat, inchangé); `DOG_COATS = ['brown','black','cream','spotted','gray','red']`; `ALL_COATS` (union sans doublon) ; `Coat = (typeof ALL_COATS)[number]`; `CatCoat`, `DogCoat`; `PAIR_SCENES = ['greet','groom','chase','shoo','nap']`, `PairScene`; `MAX_PETS = 3` (exporté de `library-book.ts`); `PetPlan.lag?: number`, `PetPlan.key?: string`, `PetPlan.with?: { petId: string; role: 'lead' | 'follow'; scene: PairScene }`; `PET_ACTIONS` + `'pant','sniff','greet','play','hiss','cower'`; `adoptPet(state, roomId, name, coat, species: Species = 'cat')`.

- [ ] **Step 1: Écrire les tests qui échouent** — dans `tests/core/library/library-pets.test.ts`, remplacer le test « garde au plus un animal par pièce » et « refuse un second chat » et ajouter les cas chien :

```ts
  it('garde au plus trois animaux par pièce', () => {
    const base = createInitialState();
    const pets = [1, 2, 3, 4].map((n) => ({ id: `p${n}`, species: 'cat', name: `C${n}`, coat: 'black' }));
    expect(parseLibraryState({ ...base, rooms: [{ ...base.rooms[0]!, pets }] }).rooms[0]!.pets).toHaveLength(3);
  });

  it('lit un chien et refuse un pelage qui n est pas de son espèce', () => {
    const base = createInitialState();
    const pets = [
      { id: 'p1', species: 'dog', name: 'Rex', coat: 'spotted' },
      { id: 'p2', species: 'dog', name: 'Bad', coat: 'tabby' },
      { id: 'p3', species: 'cat', name: 'Bad2', coat: 'brown' },
    ];
    expect(parseLibraryState({ ...base, rooms: [{ ...base.rooms[0]!, pets }] }).rooms[0]!.pets).toEqual([{ id: 'p1', species: 'dog', name: 'Rex', coat: 'spotted' }]);
  });

  it('relit un plan de scène (lag, key, with)', () => {
    const scene: PetPlan = { ...plan, lag: 1200, key: 'b:curl', with: { petId: 'p2', role: 'follow', scene: 'shoo' } };
    const once = adoptPet(createInitialState(), 'r1', 'A', 'white');
    const saved = setPetPlan(once, 'r1', 'p1', scene);
    expect(parseLibraryState(JSON.parse(JSON.stringify(saved))).rooms[0]!.pets[0]!.plan).toEqual(scene);
  });
```
et dans `describe('adoption')` remplacer « refuse un second chat… » par :
```ts
  it('adopte un chien, avec des identifiants libres, et refuse un quatrième animal', () => {
    let state = adoptPet(createInitialState(), 'r1', 'Rex', 'brown', 'dog');
    state = adoptPet(state, 'r1', 'Minou', 'white');
    state = adoptPet(state, 'r1', '', 'red', 'dog');
    expect(state.rooms[0]!.pets.map((p) => [p.id, p.species, p.name])).toEqual([['p1', 'dog', 'Rex'], ['p2', 'cat', 'Minou'], ['p3', 'dog', 'Rex']]);
    expect(adoptPet(state, 'r1', 'Z', 'black')).toBe(state);
    const freed = removePet(state, 'r1', 'p2');
    expect(adoptPet(freed, 'r1', 'N', 'gray').rooms[0]!.pets.map((p) => p.id)).toEqual(['p1', 'p3', 'p2']);
  });

  it('un pelage qui n est pas de l espèce devient le premier de l espèce', () => {
    expect(adoptPet(createInitialState(), 'r1', 'R', 'tabby', 'dog').rooms[0]!.pets[0]!.coat).toBe('brown');
  });
```
Le test existant « un animal abîmé est ignoré » reste vrai (le chien au pelage `orange` est refusé). Dans le premier `describe`, le test « garde au plus un… » est supprimé au profit des nouveaux.

- [ ] **Step 2: Lancer** `npx vitest run --maxWorkers=4 tests/core/library/library-pets.test.ts` — attendu : échec (types/plafond).

- [ ] **Step 3: Implémenter les types** — dans `library-types.ts`, remplacer le bloc `COATS`…`Coat` et les définitions `PET_ACTIONS`, `PetPlan`, `Pet` :

```ts
// Pelages du chat ; chacun a sa palette (pet-sprite.tsx). Le chien a les siens.
export const COATS = ['orange', 'black', 'gray', 'white', 'tabby', 'bicolor'] as const;
export const DOG_COATS = ['brown', 'black', 'cream', 'spotted', 'gray', 'red'] as const;
export const ALL_COATS = ['orange', 'black', 'gray', 'white', 'tabby', 'bicolor', 'brown', 'cream', 'spotted', 'red'] as const;
export type Coat = (typeof ALL_COATS)[number];
export type CatCoat = (typeof COATS)[number];
export type DogCoat = (typeof DOG_COATS)[number];
export type Species = 'cat' | 'dog';
export const coatsOf = (species: Species): readonly Coat[] => (species === 'cat' ? COATS : DOG_COATS);
```
(supprimer l'ancien `export type Coat = (typeof COATS)[number];` ; `COATS` reste exporté et utilisé tel quel pour la rangée de pelages du chat.)

```ts
export const PET_ACTIONS = ['sit', 'groom', 'stretch', 'yawn', 'sleep', 'eat', 'drink', 'scratch', 'perch', 'hide', 'purr', 'pant', 'sniff', 'greet', 'play', 'hiss', 'cower'] as const;
export type PetAction = (typeof PET_ACTIONS)[number];

// Les scènes à deux : se saluer, toilette mutuelle, poursuite, le chat remet le chien à sa place, dormir côte à côte.
export const PAIR_SCENES = ['greet', 'groom', 'chase', 'shoo', 'nap'] as const;
export type PairScene = (typeof PAIR_SCENES)[number];
export type PetWith = { petId: string; role: 'lead' | 'follow'; scene: PairScene };

// (commentaire existant conservé) + `lag` : attente sur place (en ms) avant le trajet ; `key` : la place réservée visée (`<meuble>:<point>`) ;
// `with` : la scène à deux dont ce plan fait partie (les deux plans ont le même `startedAt`).
export type PetPlan = { action: PetAction; hostId: string | null; at: Pt; on: string | null; route: Segment[]; startedAt: number; actMs: number; facing: 'l' | 'r'; sig: string; lag?: number; key?: string; with?: PetWith };

export type Pet = { id: string; species: Species; name: string; coat: Coat; plan?: PetPlan };
```

- [ ] **Step 4: Implémenter le schéma** — dans `library-book.ts` :
  - ligne 2 : importer `ALL_COATS, DOG_COATS, PAIR_SCENES, coatsOf, type Species` en plus (retirer `COATS` de l'import s'il n'est plus utilisé).
  - après `export const MAX_PET_NAME = 20;` ajouter `export const MAX_PETS = 3;`.
  - dans `planSchema`, après `sig: z.string(),` ajouter :
```ts
  lag: z.number().min(0).max(600000).optional(),
  key: z.string().max(80).optional(),
  with: z.object({ petId: z.string(), role: z.enum(['lead', 'follow']), scene: z.enum(PAIR_SCENES) }).optional(),
```
  - remplacer `petSchema` :
```ts
const petSchema = z
  .object({
    id: z.string(),
    species: z.enum(['cat', 'dog']),
    name: z.string().min(1).max(MAX_PET_NAME),
    coat: z.enum(ALL_COATS),
    plan: planSchema.optional().catch(undefined),
  })
  .refine((pet) => coatsOf(pet.species).includes(pet.coat));
```
  - `roomSchema` : `pets: z.array(petSchema).max(MAX_PETS)`.
  - `cleanPets` : remplacer `.slice(0, 1)` par `.slice(0, MAX_PETS)` et le commentaire « un seul par pièce » par « trois au plus ».
  - remplacer `adoptPet` :
```ts
export function adoptPet(state: LibraryState, roomId: string, name: string, coat: Coat, species: Species = 'cat'): LibraryState {
  const room = state.rooms.find((candidate) => candidate.id === roomId);
  if (!room || room.pets.length >= MAX_PETS) return state;
  const kept: Coat = coatsOf(species).includes(coat) ? coat : coatsOf(species)[0]!;
  const fallback = species === 'dog' ? DEFAULT_DOG_NAME : DEFAULT_PET_NAME;
  const pet: Pet = { id: nextId('p', room.pets.map((p) => p.id)), species, name: name.trim().slice(0, MAX_PET_NAME) || fallback, coat: kept };
  return mapRoom(state, roomId, (r) => ({ ...r, pets: [...r.pets, pet] }));
}
```
  avec `const DEFAULT_DOG_NAME = 'Rex';` à côté de `DEFAULT_PET_NAME`. Retirer l'import de `DOG_COATS` s'il n'est pas utilisé.

- [ ] **Step 5: Reporter les écarts dans la spec** — éditer `docs/superpowers/specs/2026-10-09-bibliotheque-chien-design.md` : titre « Données » → « état reste v4 (migration inutile) » ; scène `chase` → « le poursuivi file, le poursuivant le rattrape, les deux jouent (pas d'inversion des rôles) » ; `nap` → « à côté d'un partenaire déjà endormi au sol » ; Interface → « deux boutons d'adoption (chat, chien) ».

- [ ] **Step 6: Vérifier** `npx vitest run --maxWorkers=4 tests/core/library/library-pets.test.ts` (PASS) puis `npm run typecheck`. Les erreurs de typage restantes (UI/sprite : `COAT_COLORS[coat]` d'un `Coat` large) sont corrigées aux tâches 6 et 7 : si le typecheck échoue ailleurs que dans `LibraryPanel.tsx`/`pet-sprite.tsx`/`RoomView.tsx`/`pet-sim.ts`, corriger ici.

- [ ] **Step 7: Commit**
```bash
git add -A && git commit -m "feat(bibliotheque): chien et plafond de trois animaux dans les données

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: L'attente (`lag`) dans le mouvement

**Files:**
- Modify: `src/core/library/pets/motion.ts`
- Test: `tests/core/library/pets-motion.test.ts`

**Interfaces:**
- Consumes: `PetPlan.lag` (tâche 1).
- Produces: `PetPhase` gagne `'wait'` ; `planEndsAt(plan)` inclut `lag` ; `stateAt` renvoie `{ phase: 'wait', pos: première position du trajet, on: fromOn du premier segment }` tant que `t < lag`.

- [ ] **Step 1: Test qui échoue** — ajouter à `pets-motion.test.ts` (réutiliser les helpers du fichier ; sinon construire le plan en entier) :

```ts
describe('lag', () => {
  const walk = { kind: 'walk' as const, from: { x: 100, y: 450 }, to: { x: 300, y: 450 }, ms: 2000, fromOn: null, on: null };
  const base: PetPlan = { action: 'cower', hostId: null, at: { x: 300, y: 450 }, on: null, route: [walk], startedAt: 1000, actMs: 500, facing: 'r', sig: 's', lag: 700 };

  it('reste sur place pendant l attente, puis marche', () => {
    expect(stateAt(base, 1300)).toMatchObject({ phase: 'wait', pos: { x: 100, y: 450 }, on: null });
    expect(stateAt(base, 1700 + 1000)).toMatchObject({ phase: 'walk', pos: { x: 200, y: 450 } });
  });

  it('la fin du plan compte l attente', () => {
    expect(planEndsAt(base)).toBe(1000 + 700 + 2000 + 500);
  });

  it('sans trajet, l attente est une action sur place', () => {
    const still: PetPlan = { ...base, route: [], at: { x: 100, y: 450 } };
    expect(stateAt(still, 1300).phase).toBe('act');
  });
});
```
(importer `PetPlan` et `planEndsAt` si absents.)

- [ ] **Step 2:** `npx vitest run --maxWorkers=4 tests/core/library/pets-motion.test.ts` — attendu : échec.

- [ ] **Step 3: Implémenter** — dans `motion.ts` :
```ts
export type PetPhase = 'walk' | 'jump' | 'act' | 'done' | 'wait';
export const planEndsAt = (plan: PetPlan): number => plan.startedAt + (plan.lag ?? 0) + routeMs(plan.route) + plan.actMs;
```
et au début de `stateAt`, après `let facing = plan.facing;` :
```ts
  const lag = plan.lag ?? 0;
  const first = plan.route[0];
  if (first && t < lag) return { pos: first.from, phase: 'wait', facing, on: first.fromOn, depthHosts: [first.fromOn] };
  t = Math.max(0, t - lag);
```
(sans trajet, `lag` retarde simplement la fin : `t - lag` reste cohérent car `actMs` suit ; le test « sans trajet » vérifie `act`. Pour cela, quand `route` est vide et `t < lag`, ne pas retourner `wait` : c'est bien ce que fait le `first &&`.)

- [ ] **Step 4:** relancer le fichier : PASS ; relancer aussi `pets-runner.test.ts` et `pets-brain.test.ts` (non-régression).

- [ ] **Step 5: Commit** `feat(bibliotheque): attente avant le trajet dans les plans`.

---

### Task 3: Le cerveau selon l'espèce (chien) et la vitesse

**Files:**
- Modify: `src/core/library/pets/route.ts` (ajout `scaleRoute`)
- Modify: `src/core/library/pets/brain.ts`
- Test: `tests/core/library/pets-brain.test.ts`

**Interfaces:**
- Consumes: `Species`, `PetPlan.key` (tâche 1).
- Produces: `BrainEnv.species?: Species` (défaut `'cat'`) ; `scaleRoute(route: Segment[], k: number): Segment[]` exporté de `route.ts` ; `nextPlan` renseigne `plan.key` ; `touchPlan` inchangé.

- [ ] **Step 1: Tests qui échouent** — ajouter à `pets-brain.test.ts` :

```ts
describe('chien', () => {
  const dog = (layout: Layout, seed: number, extra: Partial<BrainEnv> = {}) => env(layout, seed, { species: 'dog', ...extra });
  const furnished: Layout = [
    { id: 's', kind: 'shelf', col: 2, row: 6 },
    { id: 'd', kind: 'desk', col: 8, row: 12 },
    { id: 'a', kind: 'armchair', col: 14, row: 14 },
    { id: 'f', kind: 'sofa', col: 20, row: 14 },
    { id: 'k', kind: 'kennel', col: 28, row: 15 },
  ];

  it('ne monte jamais sur l étagère, le bureau ou le fauteuil, ne se cache ni ne griffe', () => {
    for (const s of seeds) {
      const p = nextPlan(dog(furnished, s), from, 0);
      expect(['s', 'd', 'a']).not.toContain(p.on);
      expect(['hide', 'scratch']).not.toContain(p.action);
    }
  });

  it('dort dans la niche et monte sur le canapé', () => {
    const plans = seeds.map((s) => nextPlan(dog(furnished, s), from, 0));
    expect(plans.some((p) => p.action === 'sleep' && p.hostId === 'k')).toBe(true);
    expect(plans.some((p) => p.on === 'f')).toBe(true);
  });

  it('renifle et halète (actions du chien seulement)', () => {
    const dogActions = new Set(seeds.map((s) => nextPlan(dog([], s), from, 0).action));
    expect(dogActions.has('sniff') || dogActions.has('pant')).toBe(true);
    const catActions = new Set(seeds.map((s) => nextPlan(env([], s), from, 0).action));
    expect(catActions.has('sniff')).toBe(false);
    expect(catActions.has('pant')).toBe(false);
  });

  it('va plus vite qu un chat sur le même trajet', () => {
    const layout: Layout = [{ id: 'b', kind: 'basket', col: 30, row: 16 }];
    const ms = (e: BrainEnv) => seeds.map((s) => nextPlan({ ...e, rng: seeded(s) }, from, 0)).find((p) => p.hostId === 'b')!.route.reduce((t, x) => t + x.ms, 0);
    expect(ms(dog(layout, 1))).toBeLessThan(ms(env(layout, 1)));
  });

  it('note la place réservée visée dans le plan', () => {
    const layout: Layout = [{ id: 'b', kind: 'basket', col: 10, row: 16 }];
    const plan = seeds.map((s) => nextPlan(env(layout, s), from, 0)).find((p) => p.hostId === 'b')!;
    expect(plan.key).toBe('b:curl');
  });
});
```

- [ ] **Step 2:** lancer le fichier — attendu : échec.

- [ ] **Step 3: `scaleRoute`** — dans `route.ts` :
```ts
// Même trajet, parcouru k fois plus vite (k < 1) ou plus lentement (k > 1).
export const scaleRoute = (route: Segment[], k: number): Segment[] => route.map((s) => ({ ...s, ms: Math.round(s.ms * k) }));
```

- [ ] **Step 4: Le cerveau** — dans `brain.ts` :
  - imports : `type Species` depuis `../library-types` ; `scaleRoute` depuis `./route`.
  - `BrainEnv` : ajouter `species?: Species;` (commentaire : défaut chat).
  - `Candidate` : ajouter `key?: string;`.
  - Dans `nextPlan`, début : `const dog = env.species === 'dog'; const speed = dog ? DOG_SPEED : 1;` avec `const DOG_SPEED = 0.7;` en haut du fichier.
  - Dans `go`, remplacer la construction de la route et du candidat :
```ts
    const raw = planRoute(map, from, dest);
    if (!raw) return;
    const route = speed === 1 ? raw : scaleRoute(raw, speed);
    cands.push({ weight, action, route, at: dest.pt, on: dest.on, hostId: dest.hostId, facing: facing ?? facingOf(route, from.facing), ms, key });
```
  - Remplacer le bloc `else { ... }` des candidats par un aiguillage : conserver tel quel le code du chat dans `else if (!dog) { … }` (le contenu actuel des lignes 56-95 inchangé) et ajouter avant lui la branche du chien :
```ts
  } else if (dog) {
    stay('sit', 1.2, [4000, 9000]);
    stay('pant', 1, [3000, 6000]);
    stay('stretch', 0.8, [2500, 3500]);
    stay('yawn', 0.5, [2000, 3000]);
    stay('groom', 0.6, [4000, 7000]);
    if (from.hostId === null) stay('sleep', 0.4, [15000, 30000]);
    const cells = freeCells(map);
    for (let i = 0; i < 4 && cells.length > 0; i++) {
      const c = cells[Math.floor(env.rng() * cells.length)]!;
      go('sniff', 0.7, { pt: standPoint(c.col, c.row), on: null, hostId: null }, [3000, 5000]);
    }
    for (const p of env.layout) {
      if (!isStanding(p)) continue;
      const poi = (type: string) => poisOf(p.kind).filter((q) => q.type === type);
      const cellPt = (dx: number, dy: number): Pt => standPoint(p.col + dx, p.row + dy);
      const plat = map.platforms.find((q) => q.id === p.id);
      if (p.kind === 'basket') for (const q of poi('curl')) go('sleep', 2, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [25000, 60000], `${p.id}:curl`);
      if (p.kind === 'kennel') for (const q of poi('sleep')) go('sleep', 2.4, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [25000, 60000], `${p.id}:sleep`);
      if (p.kind === 'bowl') {
        for (const q of poi('eat')) {
          go('eat', 1.4, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [5000, 8000], `${p.id}:eat`);
          go('drink', 1, { pt: cellPt(q.dx, q.dy), on: null, hostId: p.id }, [3000, 5000], `${p.id}:eat`);
        }
      }
      if (plat && p.kind === 'sofa') {
        for (const q of poi('sleep')) go('sleep', 1.2, { pt: { x: (p.col + q.dx + 0.5) * CELL_W, y: plat.y }, on: p.id, hostId: p.id }, [25000, 60000], `${p.id}:sleep`);
        poi('seat').forEach((q, i) => go('perch', 0.6, { pt: { x: (p.col + q.dx + 0.5) * CELL_W, y: plat.y }, on: p.id, hostId: p.id }, [10000, 25000], `${p.id}:seat${i}`));
      }
    }
  } else {
```
  (garder la branche `if (env.still) {...}` en tête, puis `else if (dog) {...}`, puis `else {...}` pour le chat.) Dans la branche `still` le chien utilise le même `sit`/`sleep` que le chat (acceptable).
  - À la construction du plan retourné, ajouter `...(chosen.key !== undefined ? { key: chosen.key } : {})` après `sig`.
  - `touchPlan` et `resume` : le chien est déjà couvert (même logique) ; `resume` passe `env` à `nextPlan`, donc l'espèce suit.

- [ ] **Step 5:** `npx vitest run --maxWorkers=4 tests/core/library/pets-brain.test.ts tests/core/library/pets-route.test.ts` — PASS.

- [ ] **Step 6: Commit** `feat(bibliotheque): comportements du chien et vitesse selon l'espèce`.

---

### Task 4: Les scènes à deux (moteur pur)

**Files:**
- Create: `src/core/library/pets/scenes.ts`
- Test: `tests/core/library/pets-scenes.test.ts`

**Interfaces:**
- Consumes: `BrainEnv`, `layoutSig` (brain), `planRoute`/`scaleRoute`/`Standing` (route), `buildWalkMap`/`cellOf`/`isFree`/`standPoint` (walk-map), `stateAt`/`planEndsAt`/`routeMs` (motion), `Pet`, `PetPlan`, `PairScene`.
- Produces:
```ts
export type SceneOther = { pet: Pet; plan: PetPlan };
export type SceneProposal = { scene: PairScene; partnerId: string; lead: PetPlan; partner: PetPlan | null };
export function proposeScene(env: BrainEnv, lead: { pet: Pet; from: Standing }, others: SceneOther[], now: number): SceneProposal | null;
export function sceneIsValid(plan: PetPlan, partnerPlan: PetPlan | undefined, partnerExists: boolean): boolean;
```
`env.rng` décide de tout (scène, côté, case de fuite). `partner` vaut `null` pour `nap` (le dormeur n'est pas touché).

- [ ] **Step 1: Écrire les tests (fichier complet)** :

```ts
import { describe, expect, it } from 'vitest';
import type { Layout, Pet, PetPlan } from '../../../src/core/library/library-types';
import { layoutSig, type BrainEnv } from '../../../src/core/library/pets/brain';
import { planEndsAt, routeMs, stateAt } from '../../../src/core/library/pets/motion';
import { proposeScene, sceneIsValid } from '../../../src/core/library/pets/scenes';
import { standPoint } from '../../../src/core/library/pets/walk-map';

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};
const layout: Layout = [];
const env = (seed: number): BrainEnv => ({ layout, cols: 36, rng: seeded(seed), still: false, occupied: new Set() });
const seeds = Array.from({ length: 150 }, (_, i) => i + 1);
const cat = (id: string): Pet => ({ id, species: 'cat', name: id, coat: 'orange' });
const dog = (id: string): Pet => ({ id, species: 'dog', name: id, coat: 'brown' });
const resting = (action: PetPlan['action'], at: { x: number; y: number }, extra: Partial<PetPlan> = {}): PetPlan => ({
  action, hostId: null, at, on: null, route: [], startedAt: 0, actMs: 100_000, facing: 'r', sig: layoutSig(layout, 36), ...extra,
});
const from = { pt: standPoint(2, 16), on: null, hostId: null, facing: 'r' as const };
const propose = (lead: Pet, other: Pet, otherPlan: PetPlan, seed: number) => proposeScene(env(seed), { pet: lead, from }, [{ pet: other, plan: otherPlan }], 1000);
const awake = resting('sit', standPoint(12, 16));

describe('proposeScene', () => {
  it('ne propose rien sans partenaire éligible (en marche, dans une scène, endormi sur un meuble, sur un meuble)', () => {
    const walking = resting('sit', standPoint(12, 16), { route: [{ kind: 'walk', from: standPoint(10, 16), to: standPoint(12, 16), ms: 3000, fromOn: null, on: null }], startedAt: 900 });
    const inScene = resting('sit', standPoint(12, 16), { with: { petId: 'x', role: 'follow', scene: 'greet' } });
    const onSofa = resting('sit', standPoint(12, 16), { on: 'f', hostId: 'f' });
    for (const plan of [walking, inScene, onSofa]) expect(propose(cat('a'), cat('b'), plan, 1)).toBeNull();
    expect(proposeScene(env(1), { pet: cat('a'), from }, [], 1000)).toBeNull();
  });

  it('les deux plans sont appariés : mêmes horodatages, références croisées, fins proches', () => {
    let found = 0;
    for (const s of seeds) {
      const r = propose(cat('a'), cat('b'), awake, s);
      if (!r || !r.partner) continue;
      found++;
      expect(r.lead.startedAt).toBe(1000);
      expect(r.partner.startedAt).toBe(1000);
      expect(r.lead.with).toEqual({ petId: 'b', role: 'lead', scene: r.scene });
      expect(r.partner.with).toEqual({ petId: 'a', role: 'follow', scene: r.scene });
      expect(Math.abs(planEndsAt(r.lead) - planEndsAt(r.partner))).toBeLessThanOrEqual(2500);
      expect(planEndsAt(r.lead) - 1000).toBeLessThanOrEqual(30_000);
    }
    expect(found).toBeGreaterThan(0);
  });

  it('la durée d action d une scène ne dépasse pas 8 s (hors sommeil)', () => {
    for (const s of seeds) {
      const r = propose(dog('a'), cat('b'), awake, s);
      if (r && r.scene !== 'nap') expect(r.lead.actMs).toBeLessThanOrEqual(8000);
    }
  });

  it('selon le couple : chat→chien = salut ou remise à sa place, chien→chat = salut ou poursuite, même espèce = toilette possible', () => {
    const kinds = (lead: Pet, other: Pet) => new Set(seeds.map((s) => propose(lead, other, awake, s)?.scene).filter(Boolean));
    expect([...kinds(cat('a'), dog('b'))].sort()).toEqual(['greet', 'shoo']);
    expect([...kinds(dog('a'), cat('b'))].sort()).toEqual(['chase', 'greet']);
    expect(kinds(cat('a'), cat('b')).has('groom')).toBe(true);
    expect(kinds(dog('a'), dog('b')).has('chase')).toBe(true);
    expect(kinds(cat('a'), cat('b')).has('shoo')).toBe(false);
  });

  it('remise à sa place : le chien attend, puis recule ; le chat souffle', () => {
    const r = seeds.map((s) => propose(cat('a'), dog('b'), awake, s)).find((x) => x?.scene === 'shoo')!;
    expect(r.lead.action).toBe('hiss');
    expect(r.partner!.action).toBe('cower');
    expect(r.partner!.lag).toBe(routeMs(r.lead.route));
    expect(stateAt(r.partner!, 1000 + 10).phase === 'wait' || r.partner!.route.length === 0).toBe(true);
  });

  it('poursuite : le poursuivi file loin pendant que le poursuivant arrive derrière lui', () => {
    const r = seeds.map((s) => propose(dog('a'), cat('b'), awake, s)).find((x) => x?.scene === 'chase')!;
    expect(r.partner!.route.length).toBeGreaterThan(0);
    expect(r.partner!.lag).toBeGreaterThan(0);
    expect(r.lead.action).toBe('play');
    expect(r.partner!.action).toBe('play');
    expect(routeMs(r.lead.route)).toBeGreaterThan(r.partner!.lag!);
  });

  it('dormir côte à côte : seulement près d un dormeur au sol, qui n est pas touché', () => {
    const sleeper = resting('sleep', standPoint(12, 16));
    const kinds = new Set(seeds.map((s) => propose(cat('a'), dog('b'), sleeper, s)).filter(Boolean).map((r) => r!.scene));
    expect([...kinds]).toEqual(['nap']);
    const r = seeds.map((s) => propose(cat('a'), dog('b'), sleeper, s)).find(Boolean)!;
    expect(r.partner).toBeNull();
    expect(r.lead.action).toBe('sleep');
    expect(Math.abs(r.lead.at.x - standPoint(12, 16).x)).toBeLessThanOrEqual(130);
  });
});

describe('sceneIsValid', () => {
  const lead: PetPlan = resting('greet', standPoint(3, 16), { startedAt: 500, with: { petId: 'b', role: 'lead', scene: 'greet' } });
  const partner: PetPlan = resting('greet', standPoint(4, 16), { startedAt: 500, with: { petId: 'a', role: 'follow', scene: 'greet' } });

  it('valide si le partenaire est là avec le plan jumeau', () => {
    expect(sceneIsValid(lead, partner, true)).toBe(true);
    expect(sceneIsValid({ ...lead, with: undefined }, undefined, false)).toBe(true);
  });
  it('invalide si le partenaire est parti, a changé de plan ou une autre scène a commencé', () => {
    expect(sceneIsValid(lead, partner, false)).toBe(false);
    expect(sceneIsValid(lead, resting('sit', standPoint(4, 16)), true)).toBe(false);
    expect(sceneIsValid(lead, { ...partner, startedAt: 600 }, true)).toBe(false);
  });
  it('le sommeil côte à côte ne demande que la présence du dormeur', () => {
    const nap: PetPlan = { ...lead, with: { petId: 'b', role: 'lead', scene: 'nap' } };
    expect(sceneIsValid(nap, resting('sleep', standPoint(4, 16)), true)).toBe(true);
    expect(sceneIsValid(nap, undefined, false)).toBe(false);
  });
});
```

- [ ] **Step 2:** lancer `npx vitest run --maxWorkers=4 tests/core/library/pets-scenes.test.ts` — attendu : échec (module absent).

- [ ] **Step 3: Implémenter `scenes.ts`** :

```ts
import type { PairScene, Pet, PetAction, PetPlan, Pt, Segment } from '../library-types';
import { CELL_W } from '../room-grid';
import { layoutSig, type BrainEnv } from './brain';
import { planEndsAt, routeMs, stateAt } from './motion';
import { planRoute, scaleRoute, type Standing } from './route';
import { buildWalkMap, cellOf, isFree, standPoint, type WalkMap } from './walk-map';

export type SceneOther = { pet: Pet; plan: PetPlan };
export type SceneProposal = { scene: PairScene; partnerId: string; lead: PetPlan; partner: PetPlan | null };

const CAT_SPEED = 0.8;
const DOG_SPEED = 0.6;
const RUN = 0.6;
// Actions sur place d'un partenaire qui accepte d'être abordé.
const SOCIABLE: ReadonlySet<PetAction> = new Set(['sit', 'groom', 'stretch', 'yawn', 'sniff', 'pant', 'purr']);
const MIN_NAP_LEFT_MS = 10_000;
const NAP_MS: readonly [number, number] = [18_000, 30_000];

const speedOf = (pet: Pet): number => (pet.species === 'dog' ? DOG_SPEED : CAT_SPEED);
const sideOf = (from: Pt, to: Pt): 'l' | 'r' => (to.x >= from.x ? 'r' : 'l');
const between = (rng: () => number, [lo, hi]: readonly [number, number]): number => Math.round(lo + rng() * (hi - lo));

// Une case libre contiguë au partenaire (gauche ou droite d'abord, côté tiré au hasard), ou null.
function meetCell(map: WalkMap, at: Pt, rng: () => number): { col: number; row: number; side: 'l' | 'r' } | null {
  const c = cellOf(at);
  const order = rng() < 0.5 ? [-1, 1, -2, 2] : [1, -1, 2, -2];
  for (const dx of order) if (isFree(map, c.col + dx, c.row)) return { col: c.col + dx, row: c.row, side: dx < 0 ? 'l' : 'r' };
  return null;
}

// Une case libre à 4 à 7 colonnes du poursuivi, de préférence du côté opposé au poursuivant.
function fleeCell(map: WalkMap, at: Pt, awayFrom: 'l' | 'r', rng: () => number): { col: number; row: number } | null {
  const c = cellOf(at);
  const dir = awayFrom === 'l' ? 1 : -1;
  for (const d of [dir, -dir]) {
    for (let step = 4 + Math.floor(rng() * 4); step >= 2; step--) {
      const col = c.col + d * step;
      if (col >= 0 && col < map.cols && isFree(map, col, c.row) && isFree(map, col - d, c.row)) return { col, row: c.row };
    }
  }
  return null;
}

const planBase = (env: BrainEnv, now: number, facing: 'l' | 'r'): Pick<PetPlan, 'hostId' | 'on' | 'startedAt' | 'facing' | 'sig'> => ({
  hostId: null, on: null, startedAt: now, facing, sig: layoutSig(env.layout, env.cols),
});

function scenesFor(lead: Pet, partner: Pet, sleeping: boolean): [PairScene, number][] {
  if (sleeping) return [['nap', 1]];
  const out: [PairScene, number][] = [['greet', 1]];
  if (lead.species === partner.species) out.push(['groom', 0.6]);
  if (lead.species === 'cat' && partner.species === 'dog') out.push(['shoo', 1.2]);
  else if (lead.species === 'dog' || partner.species === 'cat') out.push(['chase', 0.8]);
  return out;
}

// Les deux plans d'une scène à deux, ou null si rien ne convient. Le meneur marche jusqu'à une case contiguë au partenaire ;
// le partenaire, lui, ne bouge que par son propre trajet (attente `lag` puis fuite ou recul) : jamais de téléportation.
export function proposeScene(env: BrainEnv, lead: { pet: Pet; from: Standing }, others: SceneOther[], now: number): SceneProposal | null {
  const eligible = others.filter(({ plan }) => {
    if (plan.with !== undefined || now >= planEndsAt(plan)) return false;
    const state = stateAt(plan, now);
    if (state.phase !== 'act' || state.on !== null || plan.on !== null) return false;
    if (plan.action === 'sleep') return planEndsAt(plan) - now >= MIN_NAP_LEFT_MS;
    return plan.hostId === null && SOCIABLE.has(plan.action);
  });
  if (eligible.length === 0) return null;
  const target = eligible[Math.floor(env.rng() * eligible.length)]!;
  const partner = target.pet;
  const at = target.plan.at;
  const sleeping = target.plan.action === 'sleep';

  const choices = scenesFor(lead.pet, partner, sleeping);
  const total = choices.reduce((a, [, w]) => a + w, 0);
  let roll = env.rng() * total;
  let scene = choices[choices.length - 1]![0];
  for (const [s, w] of choices) {
    roll -= w;
    if (roll < 0) {
      scene = s;
      break;
    }
  }

  const map = buildWalkMap(env.layout, env.cols);
  const meet = meetCell(map, at, env.rng);
  if (!meet) return null;
  const meetPt = standPoint(meet.col, meet.row);
  const approach = planRoute(map, lead.from, { pt: meetPt, on: null });
  if (!approach) return null;
  const run = scene === 'chase' ? RUN : 1;
  const leadRoute = scaleRoute(approach, speedOf(lead.pet) * run);
  const leadWait = routeMs(leadRoute);
  const facingPartner = sideOf(meetPt, at);
  const facingLead = sideOf(at, meetPt);
  const leadWith = { petId: partner.id, role: 'lead' as const, scene };
  const partnerWith = { petId: lead.pet.id, role: 'follow' as const, scene };
  const base = (facing: 'l' | 'r') => planBase(env, now, facing);

  if (scene === 'nap') {
    const actMs = Math.min(between(env.rng, NAP_MS), planEndsAt(target.plan) - now - leadWait);
    return { scene, partnerId: partner.id, partner: null, lead: { ...base(facingPartner), action: 'sleep', at: meetPt, route: leadRoute, actMs: Math.max(5000, actMs), with: leadWith } };
  }

  if (scene === 'greet' || scene === 'groom') {
    const actMs = scene === 'greet' ? 3000 : 5000;
    return {
      scene, partnerId: partner.id,
      lead: { ...base(facingPartner), action: scene, at: meetPt, route: leadRoute, actMs, with: leadWith },
      partner: { ...base(facingLead), action: scene, at, route: [], actMs: leadWait + actMs, with: partnerWith },
    };
  }

  if (scene === 'shoo') {
    const actMs = 2200;
    const away = meet.side === 'l' ? 1 : -1;
    let recoil: Segment[] = [];
    let recoilAt = at;
    for (const step of [2, 1]) {
      const col = cellOf(at).col + away * step;
      if (!isFree(map, col, cellOf(at).row)) continue;
      const route = planRoute(map, { pt: at, on: null }, { pt: standPoint(col, cellOf(at).row), on: null });
      if (route) {
        recoil = scaleRoute(route, speedOf(partner));
        recoilAt = standPoint(col, cellOf(at).row);
        break;
      }
    }
    return {
      scene, partnerId: partner.id,
      lead: { ...base(facingPartner), action: 'hiss', at: meetPt, route: leadRoute, actMs, with: leadWith },
      partner: { ...base(facingLead), action: 'cower', at: recoilAt, route: recoil, lag: leadWait, actMs: Math.max(500, actMs - routeMs(recoil)), with: partnerWith },
    };
  }

  // chase : le poursuivi file, le poursuivant le rattrape ; les deux jouent à l'arrivée.
  const flee = fleeCell(map, at, meet.side, env.rng);
  if (!flee) return null;
  const fleePt = standPoint(flee.col, flee.row);
  const fleeRoute = planRoute(map, { pt: at, on: null }, { pt: fleePt, on: null });
  const behind = standPoint(flee.col + (flee.col >= cellOf(at).col ? -1 : 1), flee.row);
  const chaseRoute = planRoute(map, { pt: meetPt, on: null }, { pt: behind, on: null });
  if (!fleeRoute || !chaseRoute) return null;
  const actMs = 2500;
  return {
    scene, partnerId: partner.id,
    lead: { ...base(sideOf(meetPt, fleePt)), action: 'play', at: behind, route: [...leadRoute, ...scaleRoute(chaseRoute, speedOf(lead.pet) * RUN)], actMs, with: leadWith },
    partner: { ...base(sideOf(at, fleePt)), action: 'play', at: fleePt, route: scaleRoute(fleeRoute, speedOf(partner) * RUN), lag: leadWait, actMs, with: partnerWith },
  };
}

// Le plan tient-il encore ? Une scène à deux n'a de sens que si le partenaire est toujours là avec le plan jumeau
// (même départ, références croisées) ; le sommeil côte à côte ne demande que la présence du dormeur.
export function sceneIsValid(plan: PetPlan, partnerPlan: PetPlan | undefined, partnerExists: boolean): boolean {
  if (plan.with === undefined) return true;
  if (!partnerExists) return false;
  if (plan.with.scene === 'nap') return true;
  return partnerPlan?.with?.petId !== undefined && partnerPlan.startedAt === plan.startedAt && partnerPlan.with.scene === plan.with.scene && partnerPlan.with.role !== plan.with.role;
}
```
Notes d'implémentation : le test `sceneIsValid` « sans partenaire : valide si `with` absent » passe par la première ligne ; vérifier que `sceneIsValid(lead, partner, true)` est vrai (réf. croisées : le plan jumeau doit pointer l'ID du meneur — ici le runner s'en assure car il cherche `partnerPlan` par `plan.with.petId`, donc l'égalité `partnerPlan.with.petId === pet.id` est contrôlée côté runner, voir tâche 5). Retirer l'import inutilisé `CELL_W` si le linter le signale.

- [ ] **Step 4:** `npx vitest run --maxWorkers=4 tests/core/library/pets-scenes.test.ts` — PASS. Si une assertion de durée échoue (`≤ 30 000` ms de fin pour les scènes courtes), vérifier que `planEndsAt(lead) - 1000` couvre trajet + action : ajuster `RUN`/vitesses plutôt que le test.

- [ ] **Step 5: Commit** `feat(bibliotheque): scènes à deux entre animaux (moteur pur)`.

---

### Task 5: Le runner — plusieurs animaux, places réservées, scènes

**Files:**
- Modify: `src/core/library/pets/runner.ts`
- Test: `tests/core/library/pets-runner.test.ts`

**Interfaces:**
- Consumes: `proposeScene`, `sceneIsValid` (tâche 4), `BrainEnv.species`, `PetPlan.key/with/lag`.
- Produces: `PetFrame` gagne `species: Species` ; `Pose` gagne `'pant' | 'sniff' | 'greet' | 'play' | 'hiss' | 'cower'` ; `poseOf` rend `'sit'` pour la phase `wait`.

- [ ] **Step 1: Tests qui échouent** — ajouter à `pets-runner.test.ts` :

```ts
import type { Pet } from '../../../src/core/library/library-types';

const twoPets = (layout: Layout, a: PetPlan, b: PetPlan): Room => ({
  ...createInitialState().rooms[0]!,
  layout,
  pets: [
    { id: 'p1', species: 'cat', name: 'Minou', coat: 'orange', plan: a },
    { id: 'p2', species: 'dog', name: 'Rex', coat: 'brown', plan: b },
  ],
});

describe('plusieurs animaux', () => {
  it('renvoie une image par animal, avec l espèce', () => {
    const runner = createPetRunner({ onPlan: vi.fn() });
    const room = twoPets(sofa, resting(sofa, standPoint(10, 16)), resting(sofa, standPoint(20, 16)));
    const frames = runner.step(room, 100);
    expect(frames.map((f) => [f.id, f.species])).toEqual([['p1', 'cat'], ['p2', 'dog']]);
  });

  it('un animal évite la place réservée par l autre', () => {
    const layout: Layout = [{ id: 'b', kind: 'basket', col: 10, row: 16 }];
    const taken: PetPlan = { ...resting(layout, standPoint(11, 17)), action: 'sleep', hostId: 'b', key: 'b:curl' };
    let hits = 0;
    for (let i = 0; i < 80; i++) {
      const onPlan = vi.fn();
      const runner = createPetRunner({ onPlan, rng: Math.random });
      const room = twoPets(layout, { ...resting(layout, standPoint(2, 16)), actMs: 10 }, taken);
      runner.step(room, 5000);
      const plan = onPlan.mock.calls.find((c) => c[0] === 'p1')?.[1] as PetPlan | undefined;
      if (plan && plan.key === 'b:curl') hits++;
    }
    expect(hits).toBe(0);
  });
});

describe('scènes à deux', () => {
  const lead: PetPlan = { ...resting([], standPoint(3, 16)), startedAt: 0, actMs: 1000 };
  const idle: PetPlan = { ...resting([], standPoint(12, 16)), startedAt: 0, actMs: 1_000_000 };

  it('une scène démarre pour les deux animaux, avec les mêmes horodatages, et chacun est signalé une fois', () => {
    let started = 0;
    for (let seed = 1; seed <= 60 && started === 0; seed++) {
      const onPlan = vi.fn();
      let n = seed;
      const rng = () => ((n = (n * 16807) % 2147483647) / 2147483647);
      const runner = createPetRunner({ onPlan, rng });
      runner.step(twoPets([], lead, idle), 5000);
      const plans = new Map(onPlan.mock.calls.map((c) => [c[0] as string, c[1] as PetPlan]));
      if (plans.get('p1')?.with && plans.get('p2')?.with) {
        started++;
        expect(plans.get('p1')!.startedAt).toBe(plans.get('p2')!.startedAt);
        expect(plans.get('p1')!.with!.petId).toBe('p2');
        expect(plans.get('p2')!.with!.petId).toBe('p1');
      }
    }
    expect(started).toBe(1);
  });

  it('jamais de scène en animations réduites', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const onPlan = vi.fn();
      let n = seed;
      const rng = () => ((n = (n * 16807) % 2147483647) / 2147483647);
      createPetRunner({ onPlan, rng, still: true }).step(twoPets([], lead, idle), 5000);
      expect(onPlan.mock.calls.every((c) => (c[1] as PetPlan).with === undefined)).toBe(true);
    }
  });

  it('une scène dont le partenaire a été retiré est abandonnée sans téléportation', () => {
    const paired: PetPlan = { ...resting([], standPoint(5, 16)), startedAt: 1000, actMs: 20_000, with: { petId: 'p2', role: 'lead', scene: 'greet' } };
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const solo: Room = { ...createInitialState().rooms[0]!, pets: [{ id: 'p1', species: 'cat', name: 'Minou', coat: 'orange', plan: paired }] };
    const [frame] = runner.step(solo, 2000);
    expect(onPlan).toHaveBeenCalledTimes(1);
    expect(onPlan.mock.calls[0]![1].with).toBeUndefined();
    expect(Math.abs(frame!.pos.x - standPoint(5, 16).x)).toBeLessThan(1);
  });

  it('la caresse de l un fait abandonner la scène de l autre', () => {
    const a: PetPlan = { ...resting([], standPoint(3, 16)), startedAt: 1000, actMs: 20_000, with: { petId: 'p2', role: 'lead', scene: 'greet' } };
    const b: PetPlan = { ...resting([], standPoint(4, 16)), startedAt: 1000, actMs: 20_000, with: { petId: 'p1', role: 'follow', scene: 'greet' } };
    const onPlan = vi.fn();
    const runner = createPetRunner({ onPlan });
    const room = twoPets([], a, b);
    runner.step(room, 2000);
    expect(onPlan).not.toHaveBeenCalled();
    expect(runner.touch(room, 'p1', 2100)).toBe(true);
    runner.step(room, 2200);
    const ids = onPlan.mock.calls.map((c) => c[0]);
    expect(ids).toContain('p2');
    expect(onPlan.mock.calls.find((c) => c[0] === 'p2')![1].with).toBeUndefined();
  });
});
```
(`resting` existant crée un chat ; le helper `twoPets` met un chien en `p2`.)

- [ ] **Step 2:** lancer le fichier — attendu : échec.

- [ ] **Step 3: Implémenter** — réécrire `runner.ts` ainsi (conserver les commentaires de l'existant là où le code est repris) :

```ts
import type { Coat, PetPlan, Pt, Room, Species } from '../library-types';
import { layoutSig, nextPlan, resume, touchPlan, type BrainEnv, type Rng } from './brain';
import { depthIndex, depthKey } from './depth';
import { planEndsAt, stateAt, type PetState } from './motion';
import { proposeScene, sceneIsValid } from './scenes';
import type { Standing } from './route';

export type Pose = 'walk' | 'jump' | 'sit' | 'groom' | 'stretch' | 'yawn' | 'sleep' | 'eat' | 'scratch' | 'hide' | 'purr' | 'pant' | 'sniff' | 'greet' | 'play' | 'hiss' | 'cower';
export type PetFrame = { id: string; species: Species; coat: Coat; name: string; pose: Pose; facing: 'l' | 'r'; behind: number; top: boolean; pos: Pt };

const PERCH_KINDS: ReadonlySet<string> = new Set(['desk', 'shelf']);
const isTop = (room: Room, on: string | null): boolean => on !== null && PERCH_KINDS.has(room.layout.find((p) => p.id === on)?.kind ?? '');
const FUTURE_SLACK_MS = 60_000;
// Chance qu'un animal qui a fini son action propose une scène à un autre (jamais en continu).
const SCENE_CHANCE = 0.3;

export function poseOf(state: PetState, plan: PetPlan): Pose {
  if (state.phase === 'walk' || state.phase === 'jump') return state.phase;
  if (state.phase === 'wait') return 'sit';
  switch (plan.action) {
    case 'perch':
      return 'sit';
    case 'drink':
      return 'eat';
    default:
      return plan.action;
  }
}

export function createPetRunner(opts: { rng?: Rng; still?: boolean; onPlan: (petId: string, plan: PetPlan) => void }) {
  const rng = opts.rng ?? Math.random;
  const still = opts.still ?? false;
  const plans = new Map<string, PetPlan>();
  let roomId = '';
  let sigLayout: Room['layout'] | null = null;
  let sigCols = 0;
  let sig = '';

  const planOf = (room: Room, id: string): PetPlan | undefined => plans.get(id) ?? room.pets.find((p) => p.id === id)?.plan;
  // Les places que les AUTRES animaux occupent ou ont choisies (plans pas encore finis).
  const takenBy = (room: Room, selfId: string, now: number): Set<string> => {
    const keys = new Set<string>();
    for (const other of room.pets) {
      if (other.id === selfId) continue;
      const plan = planOf(room, other.id);
      if (plan?.key !== undefined && now < planEndsAt(plan)) keys.add(plan.key);
    }
    return keys;
  };
  const envFor = (room: Room, species: Species, occupied: ReadonlySet<string>): BrainEnv => ({ layout: room.layout, cols: room.cols, rng, still, occupied, species });

  function enter(room: Room): void {
    if (room.id !== roomId) {
      plans.clear();
      roomId = room.id;
    }
    for (const id of Array.from(plans.keys())) if (!room.pets.some((p) => p.id === id)) plans.delete(id);
  }

  const record = (id: string, plan: PetPlan): void => {
    plans.set(id, plan);
    opts.onPlan(id, plan);
  };

  return {
    step(room: Room, now: number): PetFrame[] {
      enter(room);
      if (sigLayout !== room.layout || sigCols !== room.cols) {
        sig = layoutSig(room.layout, room.cols);
        sigLayout = room.layout;
        sigCols = room.cols;
      }
      return room.pets.map((pet) => {
        const env = envFor(room, pet.species, takenBy(room, pet.id, now));
        let plan = planOf(room, pet.id);
        if (plan !== undefined && plan.startedAt > now + FUTURE_SLACK_MS) plan = undefined;
        // Une scène dont le partenaire a disparu ou changé de plan est abandonnée, là où l'animal se trouve en théorie.
        if (plan?.with !== undefined && now < planEndsAt(plan)) {
          const partnerPlan = planOf(room, plan.with.petId);
          const jumelle = partnerPlan?.with?.petId === pet.id;
          if (!sceneIsValid(plan, jumelle ? partnerPlan : undefined, room.pets.some((p) => p.id === plan!.with!.petId))) {
            const s = stateAt(plan, now);
            plan = nextPlan(env, { pt: s.pos, on: s.on, hostId: s.on, facing: s.facing }, now, plan.action);
            record(pet.id, plan);
          }
        }
        if (plan === undefined || plan.sig !== sig || now >= planEndsAt(plan)) {
          const finished = plan !== undefined && plan.sig === sig;
          let started = false;
          if (finished && !still && room.pets.length > 1 && rng() < SCENE_CHANCE) {
            const others = room.pets.filter((p) => p.id !== pet.id).flatMap((p) => {
              const pp = planOf(room, p.id);
              return pp ? [{ pet: p, plan: pp }] : [];
            });
            const from: Standing = { pt: plan!.at, on: plan!.on, hostId: plan!.hostId, facing: plan!.facing };
            const scene = proposeScene(env, { pet, from }, others, now);
            if (scene) {
              plan = scene.lead;
              record(pet.id, scene.lead);
              if (scene.partner) record(scene.partnerId, scene.partner);
              started = true;
            }
          }
          if (!started) {
            const next = resume(plan, env, now);
            plan = next.plan;
            if (next.fresh) record(pet.id, plan);
          }
        }
        plan = plan!;
        let state = stateAt(plan, now);
        // Animations réduites : un trajet en cours est remplacé tout de suite par un plan sur place.
        if (still && plan.route.length > 0 && (state.phase === 'walk' || state.phase === 'jump' || state.phase === 'wait')) {
          plan = nextPlan(env, { pt: state.pos, on: state.on, hostId: state.on, facing: state.facing }, now, plan.action);
          record(pet.id, plan);
          state = stateAt(plan, now);
        }
        plans.set(pet.id, plan);
        return { id: pet.id, species: pet.species, coat: pet.coat, name: pet.name, pose: poseOf(state, plan), facing: state.facing, behind: depthIndex(room.layout, depthKey(room.layout, state)), top: isTop(room, state.on), pos: state.pos };
      });
    },
    // Une caresse : vrai si l'animal s'est arrêté pour ronronner (ou remuer la queue).
    touch(room: Room, petId: string, now: number): boolean {
      enter(room);
      const plan = plans.get(petId);
      const pet = room.pets.find((p) => p.id === petId);
      const next = plan && pet && touchPlan(plan, envFor(room, pet.species, takenBy(room, petId, now)), now);
      if (!next) return false;
      plans.set(petId, next);
      opts.onPlan(petId, next);
      return true;
    },
  };
}
```
Points de vigilance :
  - `record` appelle `onPlan` même pour un plan de partenaire : le test « chacun signalé une fois » s'appuie dessus.
  - Si le partenaire d'une scène a déjà été traité ce tick avec l'ancien plan, il est signalé deux fois au plus (ancien plan écarté) : acceptable.
  - `resume(plan, …)` reçoit un plan fini : il rend un nouveau plan à partir de `plan.at` (correct, la scène était finie).
  - Un plan de scène dont `sig` ne correspond plus passe par `resume` (même chemin que pour un plan ordinaire).

- [ ] **Step 4:** `npx vitest run --maxWorkers=4 tests/core/library/pets-runner.test.ts tests/core/library/pets-brain.test.ts tests/core/library/pets-scenes.test.ts` — PASS. Si le premier test « une scène démarre » ne trouve aucune scène en 60 graines, c'est que `rng` du LCG ne passe jamais sous 0.3 d'entrée : conserver tel quel (60 graines suffisent largement) mais corriger la cause réelle (ex. partenaire inéligible) plutôt que le test.

- [ ] **Step 5: Commit** `feat(bibliotheque): plusieurs animaux, places réservées et scènes dans le runner`.

---

### Task 6: Le dessin — chien et nouvelles poses du chat

**Files:**
- Create: `src/content/dog-sprite.tsx`
- Modify: `src/content/pet-sprite.tsx`
- Modify: `src/content/pet-sim.ts` (comparaison `sameViews` : ajouter `v.species === b[i]!.species`)
- Modify: `src/content/RoomView.tsx:189-193` (passer `species`)
- Test: `tests/content/pet-sprite.test.tsx`

**Interfaces:**
- Consumes: `PetFrame.species`, `Pose` élargi, `Coat`, `DOG_COATS`.
- Produces: `PetSprite` accepte `species?: Species` (défaut `'cat'`) ; `paletteOf(species: Species, coat: Coat): { body: string; belly: string }` ; `DOG_COAT_LABELS: Record<DogCoat, string>` (dans `dog-sprite.tsx`, réexporté par `pet-sprite.tsx`) ; le corps du chien porte `data-dog-body`.

- [ ] **Step 1: Tests qui échouent** — dans `pet-sprite.test.tsx`, étendre `POSES` du chat :
```ts
const POSES: Pose[] = ['walk', 'jump', 'sit', 'groom', 'stretch', 'yawn', 'sleep', 'eat', 'scratch', 'hide', 'purr', 'pant', 'sniff', 'greet', 'play', 'hiss', 'cower'];
const DOG_POSES: Pose[] = ['walk', 'jump', 'sit', 'groom', 'stretch', 'yawn', 'sleep', 'eat', 'scratch', 'hide', 'purr', 'pant', 'sniff', 'greet', 'play', 'hiss', 'cower'];
```
et ajouter :
```ts
  it.each(DOG_POSES)('dessine le chien en pose %s', (pose) => {
    const svg = draw({ species: 'dog', coat: 'brown', pose, facing: 'r', name: 'Rex' });
    expect(svg.querySelector(`[data-pet-pose="${pose}"]`)).not.toBeNull();
    expect(svg.querySelector('[data-dog-body]')!.children.length).toBeGreaterThan(0);
    expect(svg.querySelector('[data-cat-body]')).toBeNull();
  });

  it('chaque pelage de chien a sa palette, et le chien tacheté a des taches', () => {
    for (const coat of DOG_COATS) expect(paletteOf('dog', coat).body).toMatch(/^#/);
    const svg = draw({ species: 'dog', coat: 'spotted', pose: 'sit', facing: 'r', name: 'Rex' });
    expect(svg.querySelector('[data-dog-spots]')).not.toBeNull();
  });

  it('le chien se retourne vers la gauche', () => {
    const svg = draw({ species: 'dog', coat: 'red', pose: 'walk', facing: 'l', name: 'Rex' });
    expect(svg.querySelector('[data-dog-body]')!.getAttribute('transform')).toBe('scale(-1 1)');
  });
```
(importer `DOG_COATS` depuis library-types et `paletteOf` depuis pet-sprite.)

- [ ] **Step 2:** lancer — attendu : échec.

- [ ] **Step 3: `dog-sprite.tsx`** — un chien de profil, plus bas et plus long que le chat, avec oreille tombante, museau, queue qui remue. Code :

```tsx
import type { ReactElement } from 'react';
import type { DogCoat } from '../core/library/library-types';
import type { Pose } from '../core/library/pets/runner';

export type DogColors = { body: string; belly: string; dark: string; ear: string; spots?: boolean };

export const DOG_COAT_COLORS: Record<DogCoat, DogColors> = {
  brown: { body: '#9C6B3F', belly: '#C79A68', dark: '#6B4423', ear: '#6B4423' },
  black: { body: '#2E2E35', belly: '#4A4A54', dark: '#17171C', ear: '#17171C' },
  cream: { body: '#E8D2A6', belly: '#F6EBD0', dark: '#BFA56F', ear: '#C9AE78' },
  spotted: { body: '#F3F1EA', belly: '#FFFFFF', dark: '#C9C5B8', ear: '#2E2E35', spots: true },
  gray: { body: '#8E949E', belly: '#BCC1C9', dark: '#5B606A', ear: '#5B606A' },
  red: { body: '#C0612B', belly: '#E3A06E', dark: '#8A3F17', ear: '#8A3F17' },
};
export const DOG_COAT_LABELS: Record<DogCoat, string> = { brown: 'Brun', black: 'Noir', cream: 'Crème', spotted: 'Tacheté', gray: 'Gris', red: 'Roux' };

const Wag = ({ c, fast = false, still }: { c: DogColors; fast?: boolean; still: boolean }) => (
  <path d="M-17 -20 C-26 -22 -28 -32 -24 -36" fill="none" stroke={c.body} strokeWidth="5" strokeLinecap="round">
    {!still && <animateTransform attributeName="transform" type="rotate" values="-14 -17 -20;16 -17 -20;-14 -17 -20" dur={fast ? '0.28s' : '0.7s'} repeatCount="indefinite" />}
  </path>
);

function DogHead({ x, y, c, tilt = 0, mouth = false, closed = false, sniff = false }: { x: number; y: number; c: DogColors; tilt?: number; mouth?: boolean; closed?: boolean; sniff?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
      <ellipse cx="-4" cy="2" rx="3.6" ry="7" fill={c.ear} transform="rotate(14 -4 2)" />
      <circle r="8.5" fill={c.body} />
      <ellipse cx="8" cy="3" rx="7" ry="4.6" fill={c.belly} />
      <ellipse cx="14" cy="1.6" rx="2.2" ry="1.8" fill="#222" />
      {closed ? <path d="M0 -2h4" stroke="#222" strokeWidth="1.2" strokeLinecap="round" /> : <circle cx="3" cy="-2" r="1.4" fill="#222" />}
      {mouth && <path d="M6 6 q5 5 10 1" fill="#C0475A" stroke="#7A2A2A" strokeWidth="0.8" />}
      {sniff && <path d="M16 4h4 M16 6h3" stroke="#222" strokeWidth="0.6" opacity="0.5" />}
    </g>
  );
}

const Leg = ({ x, c, swing = false, late = false, y = -10, h = 10 }: { x: number; c: DogColors; swing?: boolean; late?: boolean; y?: number; h?: number }) => (
  <rect x={x} y={y} width="4.6" height={h} rx="2.3" fill={c.dark}>
    {swing && <animateTransform attributeName="transform" type="rotate" values={`-24 ${x + 2} ${y};24 ${x + 2} ${y};-24 ${x + 2} ${y}`} dur="0.4s" begin={late ? '-0.2s' : '0s'} repeatCount="indefinite" />}
  </rect>
);

const spots = (c: DogColors): ReactElement | null =>
  c.spots ? (
    <g data-dog-spots="">
      <circle cx="-6" cy="-20" r="3.2" fill="#2E2E35" />
      <circle cx="5" cy="-16" r="2.6" fill="#2E2E35" />
      <circle cx="-12" cy="-14" r="2" fill="#2E2E35" />
    </g>
  ) : null;

function standing(c: DogColors, still: boolean, swing: boolean, head: ReactElement): ReactElement {
  return (
    <>
      <Wag c={c} still={still} />
      <Leg x={-15} c={c} swing={swing} />
      <Leg x={-9} c={c} swing={swing} late />
      <ellipse cx="0" cy="-17" rx="19" ry="8.5" fill={c.body} />
      <ellipse cx="2" cy="-14" rx="13" ry="4.5" fill={c.belly} opacity="0.7" />
      {spots(c)}
      <Leg x={8} c={c} swing={swing} late />
      <Leg x={14} c={c} swing={swing} />
      {head}
    </>
  );
}

function sitting(c: DogColors, still: boolean, head: ReactElement, extras?: ReactElement, fast = false): ReactElement {
  return (
    <>
      <Wag c={c} still={still} fast={fast} />
      <ellipse cx="-4" cy="-12" rx="11" ry="12" fill={c.body} />
      <ellipse cx="2" cy="-10" rx="5" ry="8" fill={c.belly} />
      {spots(c)}
      <rect x="3" y="-12" width="5" height="12" rx="2.5" fill={c.body} />
      {extras}
      {head}
    </>
  );
}

export function dogBody(pose: Pose, c: DogColors, still: boolean): ReactElement {
  switch (pose) {
    case 'walk':
      return standing(c, still, !still, <DogHead x={21} y={-26} c={c} />);
    case 'eat':
      return standing(c, still, false, <DogHead x={25} y={-8} c={c} tilt={40} />);
    case 'sniff':
      return standing(c, still, false, <DogHead x={25} y={-9} c={c} tilt={46} sniff />);
    case 'jump':
      return (
        <g transform="rotate(-16 0 -16)">
          <Wag c={c} still />
          <ellipse cx="0" cy="-17" rx="20" ry="7.4" fill={c.body} />
          <rect x="-28" y="-15" width="14" height="4.6" rx="2.3" fill={c.dark} />
          <rect x="15" y="-24" width="14" height="4.6" rx="2.3" fill={c.dark} />
          <DogHead x={24} y={-28} c={c} mouth />
        </g>
      );
    case 'sit':
    case 'hide':
    case 'hiss':
      return sitting(c, still, <DogHead x={5} y={-31} c={c} />);
    case 'purr':
      return sitting(c, still, <DogHead x={5} y={-31} c={c} mouth />, undefined, true);
    case 'pant':
      return sitting(c, still, <DogHead x={5} y={-31} c={c} mouth />);
    case 'yawn':
      return sitting(c, still, <DogHead x={5} y={-31} c={c} mouth tilt={-10} />);
    case 'greet':
      return sitting(c, still, <DogHead x={9} y={-29} c={c} tilt={10} sniff />, undefined, true);
    case 'cower':
      return sitting(c, still, <DogHead x={6} y={-22} c={c} tilt={28} />);
    case 'groom':
      return sitting(
        c,
        still,
        <DogHead x={5} y={-31} c={c} tilt={12} />,
        <rect x="7" y="-30" width="4.4" height="12" rx="2.2" fill={c.body} transform="rotate(-25 9 -20)">
          {!still && <animateTransform attributeName="transform" type="rotate" values="-25 9 -20;-5 9 -20;-25 9 -20" dur="0.6s" repeatCount="indefinite" />}
        </rect>,
      );
    case 'scratch':
      return sitting(
        c,
        still,
        <DogHead x={5} y={-30} c={c} tilt={-12} />,
        <rect x="-14" y="-12" width="5" height="14" rx="2.5" fill={c.dark}>
          {!still && <animateTransform attributeName="transform" type="rotate" values="0 -12 -10;-30 -12 -10;0 -12 -10" dur="0.3s" repeatCount="indefinite" />}
        </rect>,
      );
    case 'stretch':
      return (
        <>
          <Wag c={c} still={still} />
          <rect x="-16" y="-12" width="4.6" height="12" rx="2.3" fill={c.dark} />
          <ellipse cx="2" cy="-14" rx="19" ry="7.4" fill={c.body} transform="rotate(14 2 -14)" />
          <rect x="9" y="-5" width="18" height="4.6" rx="2.3" fill={c.dark} />
          <DogHead x={27} y={-9} c={c} tilt={24} />
        </>
      );
    case 'play':
      return (
        <g>
          {!still && <animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur="0.45s" repeatCount="indefinite" />}
          <Wag c={c} still={still} fast />
          <rect x="-16" y="-12" width="4.6" height="12" rx="2.3" fill={c.dark} />
          <ellipse cx="2" cy="-15" rx="19" ry="7.4" fill={c.body} transform="rotate(10 2 -15)" />
          <rect x="9" y="-6" width="18" height="4.6" rx="2.3" fill={c.dark} />
          <DogHead x={26} y={-10} c={c} tilt={20} mouth />
        </g>
      );
    case 'sleep':
      return (
        <>
          <ellipse cx="0" cy="-9" rx="22" ry="9.5" fill={c.body} />
          {spots(c)}
          <path d="M-20 -6 C-27 3 5 6 14 1" fill="none" stroke={c.body} strokeWidth="5" strokeLinecap="round" />
          <DogHead x={15} y={-8} c={c} tilt={66} closed />
        </>
      );
  }
}
```

- [ ] **Step 4: `pet-sprite.tsx`** :
  - Importer `DOG_COAT_COLORS, DOG_COAT_LABELS, dogBody` de `./dog-sprite`, `type CatCoat, type DogCoat, type Species` ; typer `COAT_COLORS: Record<CatCoat, Colors>` et `COAT_LABELS: Record<CatCoat, string>` ; `export { DOG_COAT_LABELS };`.
  - Ajouter :
```ts
export const paletteOf = (species: Species, coat: Coat): { body: string; belly: string } =>
  species === 'dog' ? DOG_COAT_COLORS[coat as DogCoat] : COAT_COLORS[coat as CatCoat];
```
  - `Props` : `species?: Species;` ; `PetSprite({ species = 'cat', coat, pose, facing, still = false })`. Pour le chien :
```tsx
  if (species === 'dog') {
    return (
      <g data-pet-pose={pose} data-coat={coat}>
        {pose !== 'jump' && <ellipse cx="0" cy="0" rx="21" ry="3" fill="#000" opacity="0.18" />}
        <g data-dog-body="" transform={facing === 'l' ? 'scale(-1 1)' : undefined}>
          {dogBody(pose, DOG_COAT_COLORS[coat as DogCoat], still)}
        </g>
      </g>
    );
  }
```
  et `const c = COAT_COLORS[coat as CatCoat];` pour le chat.
  - Dans `body()` du chat ajouter les cases (le switch doit rester exhaustif) :
```tsx
    case 'sniff':
      return standing(c, false, -9, 23, 38);
    case 'pant':
      return sitting(c, <Head x={4} y={-33} c={c} mouth />);
    case 'greet':
      return sitting(c, <Head x={7} y={-31} c={c} tilt={12} />);
    case 'cower':
      return sitting(c, <Head x={5} y={-24} c={c} tilt={26} />);
    case 'hiss':
      return sitting(
        c,
        <Head x={5} y={-33} c={c} tilt={-6} mouth />,
        <rect x="8" y="-36" width="4.4" height="16" rx="2.2" fill={c.body}>
          {!still && <animateTransform attributeName="transform" type="rotate" values="-10 10 -34;20 10 -34;-10 10 -34" dur="0.35s" repeatCount="indefinite" />}
        </rect>,
      );
    case 'play':
      return (
        <g>
          {!still && <animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur="0.5s" repeatCount="indefinite" />}
          <Tail d="M-16 -16 C-26 -18 -26 -28 -22 -34" c={c} />
          <rect x="-15" y="-12" width="4.4" height="12" rx="2.2" fill={c.dark} />
          <ellipse cx="2" cy="-14" rx="18" ry="7" fill={c.body} transform="rotate(14 2 -14)" />
          <rect x="8" y="-5" width="17" height="4.4" rx="2.2" fill={c.dark} />
          <Head x={25} y={-10} c={c} tilt={20} mouth />
        </g>
      );
```
- [ ] **Step 5: `pet-sim.ts` et `RoomView.tsx`** : `sameViews` compare aussi `v.species === b[i]!.species` ; `petNode` : `<PetSprite species={v.species} coat={v.coat} …/>`.

- [ ] **Step 6:** `npx vitest run --maxWorkers=4 tests/content/pet-sprite.test.tsx tests/content/library-pets-view.test.tsx` — PASS ; `npm run typecheck` ne doit plus signaler que `LibraryPanel.tsx`.

- [ ] **Step 7: Commit** `feat(bibliotheque): dessin du chien et poses de scène du chat`.

---

### Task 7: L'interface — plusieurs animaux, adopter un chien

**Files:**
- Modify: `src/content/LibraryPanel.tsx` (imports ligne 4-26, états ligne ~189, lignes 662-670, 789-834, icônes ligne 121)
- Modify: `src/content/pet-sim.ts` si la bulle dépend du nombre (non)
- Test: `tests/content/library-pets-ui.test.tsx`

**Interfaces:**
- Consumes: `adoptPet(state, roomId, name, coat, species)`, `MAX_PETS`, `paletteOf`, `DOG_COAT_LABELS`, `DOG_COATS`.
- Produces: attributs de test : `[data-action="adopt"]` (chat), `[data-action="adopt-dog"]`, `[data-action="adopt-confirm"]`, `[data-action="adopt-cancel"]`, `[data-pet-edit="<id>"]` (ligne d'un animal), `[data-action="remove-pet"][data-pet="<id>"]`, champs `Nom du chat` / `Nom du chien`, `Nom du chat à adopter` / `Nom du chien à adopter`.

- [ ] **Step 1: Tests qui échouent** — dans `library-pets-ui.test.tsx` :
  - dans « adopte un chat avec un nom et un pelage » remplacer la dernière ligne `expect(q('[data-action="adopt"]')).toBeNull();` par `expect(q('[data-action="adopt"]')).not.toBeNull();` (on peut en adopter d'autres).
  - ajouter :
```tsx
  it('adopte un chien avec son propre jeu de pelages', async () => {
    await click('[data-action="edit"]');
    await click('[data-action="adopt-dog"]');
    expect(q('[data-coat="tabby"]')).toBeNull();
    await type('input[aria-label="Nom du chien à adopter"]', 'Rex');
    await click('[data-coat="spotted"]');
    await click('[data-action="adopt-confirm"]');
    expect(repo.current()!.rooms[0]!.pets[0]).toMatchObject({ species: 'dog', name: 'Rex', coat: 'spotted' });
    expect(q('input[aria-label="Nom du chien"]')).not.toBeNull();
  });

  it('jusqu à trois animaux, puis les boutons d adoption disparaissent ; chacun se retire à part', async () => {
    await click('[data-action="edit"]');
    for (const [action, name] of [['adopt', 'A'], ['adopt-dog', 'B'], ['adopt', 'C']] as const) {
      await click(`[data-action="${action}"]`);
      await type(`input[aria-label="Nom du ${action === 'adopt' ? 'chat' : 'chien'} à adopter"]`, name);
      await click('[data-action="adopt-confirm"]');
    }
    expect(repo.current()!.rooms[0]!.pets.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(q('[data-action="adopt"]')).toBeNull();
    expect(q('[data-action="adopt-dog"]')).toBeNull();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click('[data-action="remove-pet"][data-pet="p2"]');
    expect(repo.current()!.rooms[0]!.pets.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(q('[data-action="adopt-dog"]')).not.toBeNull();
  });
```
(`vi` est déjà importé dans ce fichier — sinon l'ajouter ; reprendre les helpers `click`/`type`.)

- [ ] **Step 2:** lancer — attendu : échec.

- [ ] **Step 3: Implémenter** — dans `LibraryPanel.tsx` :
  - imports : ajouter `MAX_PETS` (depuis `library-book`), `DOG_COATS`, `type Species` (library-types), `DOG_COAT_LABELS`, `paletteOf` (pet-sprite) ; retirer `COAT_COLORS` s'il n'est plus utilisé.
  - icône chien à côté de `cat` (ligne 122) :
```ts
  dog: ['M4 8l2-4 4 3', 'M20 8l-2-4-4 3', 'M5 8c0 7 2 12 7 12s7-5 7-12c-2-2-4-3-7-3S7 6 5 8z', 'M9 11h.01', 'M15 11h.01', 'M10 15h4l-2 2z'],
```
  - états : `const [adopting, setAdopting] = useState<Species | null>(null);` (au lieu de `boolean`), `const [adoptCoat, setAdoptCoat] = useState<Coat>('orange');`. Une fonction : `const startAdopt = (species: Species): void => { setAdoptName(species === 'dog' ? 'Rex' : 'Minou'); setAdoptCoat(species === 'dog' ? 'brown' : 'orange'); setAdopting(species); };`.
  - remplacer `const pet = room.pets[0];` et ses usages :
```tsx
  const confirmAdopt = (): void => {
    const species = adopting;
    setAdopting(null);
    if (species) void library.update((state) => adoptPet(state, room.id, adoptName, adoptCoat, species));
  };
  const onRemovePet = (pet: Pet): void => {
    if (!window.confirm(`Retirer ${pet.name} de cette pièce ?`)) return;
    void library.update((state) => removePet(state, room.id, pet.id));
  };
```
  (importer `type Pet`.) Chercher TOUS les `setAdopting(false)` / `adopting` du fichier (changement de pièce, `reset`…) et les convertir (`setAdopting(null)`, `adopting !== null`).
  - la rangée Animaux (remplace tout le bloc `{editing && ( <div … aria-label="Animaux">…`) :
```tsx
      {editing && (
        <div className="wmt-lib-row" role="group" aria-label="Animaux">
          {room.pets.map((pet) => (
            <span key={`${room.id}:${pet.id}`} className="wmt-lib-pet" data-pet-edit={pet.id}>
              <input
                className="wmt-lib-name"
                aria-label={pet.species === 'dog' ? 'Nom du chien' : 'Nom du chat'}
                defaultValue={pet.name}
                maxLength={MAX_PET_NAME}
                onBlur={(event) => {
                  const name = event.currentTarget.value;
                  if (!name.trim()) {
                    event.currentTarget.value = pet.name;
                    return;
                  }
                  if (name === pet.name) return;
                  void library.update((state) => renamePet(state, room.id, pet.id, name));
                }}
              />
              <Btn label={`Retirer ${pet.name}`} data={{ action: 'remove-pet', pet: pet.id }} onClick={() => onRemovePet(pet)}>
                <Icon paths={ICONS.trash} />
              </Btn>
            </span>
          ))}
          {adopting !== null ? (
            <>
              <input className="wmt-lib-name" aria-label={adopting === 'dog' ? 'Nom du chien à adopter' : 'Nom du chat à adopter'} value={adoptName} maxLength={MAX_PET_NAME} onChange={(event) => setAdoptName(event.currentTarget.value)} />
              {(adopting === 'dog' ? DOG_COATS : COATS).map((coat) => (
                <Btn key={coat} label={(adopting === 'dog' ? DOG_COAT_LABELS : COAT_LABELS)[coat as never]} pressed={adoptCoat === coat} data={{ coat }} onClick={() => setAdoptCoat(coat)}>
                  <span className="wmt-lib-swatch" style={{ background: paletteOf(adopting, coat).body, borderColor: paletteOf(adopting, coat).belly }} />
                </Btn>
              ))}
              <Btn label={adopting === 'dog' ? 'Adopter ce chien' : 'Adopter ce chat'} data={{ action: 'adopt-confirm' }} onClick={confirmAdopt}>
                <Icon paths={ICONS.check} />
              </Btn>
              <Btn label="Annuler" data={{ action: 'adopt-cancel' }} onClick={() => setAdopting(null)}>
                <Icon paths={ICONS.close} />
              </Btn>
            </>
          ) : (
            room.pets.length < MAX_PETS && (
              <>
                <Btn label="Adopter un chat" data={{ action: 'adopt' }} onClick={() => startAdopt('cat')}>
                  <Icon paths={ICONS.cat} />
                </Btn>
                <Btn label="Adopter un chien" data={{ action: 'adopt-dog' }} onClick={() => startAdopt('dog')}>
                  <Icon paths={ICONS.dog} />
                </Btn>
              </>
            )
          )}
        </div>
      )}
```
  (`COAT_LABELS[coat as never]` : remplacer par une petite fonction typée `coatLabel(species, coat)` si le compilateur ou le linter le préfère ; l'important est de ne pas introduire `any`.) Le style `.wmt-lib-pet` : `display: inline-flex; gap: 4px; align-items: center;` à ajouter à la feuille de style où vit `.wmt-lib-name`.

- [ ] **Step 4:** `npx vitest run --maxWorkers=4 tests/content/library-pets-ui.test.tsx tests/content/library-pets-view.test.tsx` PUIS `npm run typecheck` — tout PASS. Les anciens tests de renommage/retrait (`input[aria-label="Nom du chat"]`, `[data-action="remove-pet"]`) restent valides à un seul animal.

- [ ] **Step 5: Commit** `feat(bibliotheque): adopter un chien et gérer jusqu'à trois animaux`.

---

### Task 8: Fiche WikiHow `bibliotheque-v10`

**Files:**
- Modify: `src/core/whats-new/entries.ts` (après l'entrée `bibliotheque-v9`)
- Test: les tests existants de `tests/core/whats-new/` (aucune règle d'unicité d'id ne doit casser)

**Interfaces:** aucune.

- [ ] **Step 1:** Lire le test de cohérence des entrées (`grep -rn "entries" tests/core/whats-new | head`) pour connaître les contraintes (thème valide, `glyph`, étapes avec `target`, `details` contenant « Comment faire » / « À quoi ça sert » / « Limites »).

- [ ] **Step 2:** Ajouter l'entrée, sur le modèle exact de `bibliotheque-v9` (même `theme: 'collection'`, mêmes `scene`) :
  - `id: 'bibliotheque-v10'`, `glyph: '🐶'`, `title: 'Un chien et plusieurs compagnons'`, `summary: 'Adoptez un chien, jusqu’à trois animaux par pièce, et regardez-les jouer ensemble'`.
  - Étape 1 (`target: '[data-wmt-library] [data-action="adopt-dog"]'`, `gesture: 'tap'`, `scene` comme v9 étape « Adopter un chat » avec `reveal` du crayon) : « Adopter un chien », texte : « En mode Aménager, la rangée Animaux propose le glyphe du chien à côté du chat : touchez-le, choisissez un nom et un pelage (brun, noir, crème, tacheté, gris, roux), puis validez avec la coche. » ; détails : Comment faire / À quoi ça sert (« un chien qui court, renifle, halète, dort dans la niche ou le panier et monte sur le canapé, mais ne grimpe pas sur les étagères ») / Limites (« trois animaux au maximum par pièce, chats et chiens mélangés ; le chien ne monte que sur le canapé »).
  - Étape 2 (`target: '[data-wmt-library] svg[role="img"]'`, `gesture: 'tap'`) : « Les voir jouer ensemble », texte : « Avec deux animaux ou plus, ils se saluent, se toilettent, se poursuivent, dorment côte à côte, et le chat remet parfois le chien à sa place. » ; détails : Comment faire (« Rien à faire : il suffit d’adopter plusieurs animaux et de regarder la pièce en mode Visiter. Toucher l’un des deux interrompt la scène. ») / À quoi ça sert / Limites (« les scènes n’ont lieu qu’au sol et jamais en mode animations réduites ; la poursuite ne dure que quelques secondes »).
  - Étape 3 (`target: '[data-wmt-library] [data-action="remove-pet"]'`, `gesture: 'tap'`) : « Retirer un animal », texte « En mode Aménager, chaque animal a son nom modifiable et sa corbeille : retirer l’un laisse les autres tranquilles. ».

- [ ] **Step 3:** `npx vitest run --maxWorkers=4 tests/core/whats-new` — PASS.

- [ ] **Step 4: Commit** `docs(bibliotheque): fiche WikiHow bibliotheque-v10 (chien et interactions)`.

---

### Task 9: Vérification complète

**Files:** aucun (sauf corrections).

- [ ] **Step 1:** `npm run typecheck` — aucun écart.
- [ ] **Step 2:** `npx vitest run --maxWorkers=4` — tout PASS (le test `library-drag` instable : le relancer seul s'il échoue).
- [ ] **Step 3:** `npm run build` — réussit.
- [ ] **Step 4: Vérification visuelle** dans Chrome via le banc d'essai existant (`.superpowers/harness`, voir la mémoire projet « Vue Toile » / « Test tactile » pour la méthode) : adopter 1 chien et 2 chats dans une pièce meublée (niche, panier, gamelle, canapé), vérifier : poses du chien (marche, assis, halète, renifle, dort), ordre devant/derrière à trois, au moins une scène de chaque type observée (saluer, toilette, poursuite, remise à sa place chat→chien, dormir côte à côte), retrait d'un animal pendant une scène (l'autre reprend sans téléportation), rechargement de la page en pleine scène (reprise interpolée), mode animations réduites (aucune scène). Noter ce qui n'a pas pu être vérifié.
- [ ] **Step 5:** Corriger ce qui cloche (commits séparés), puis laisser la PR, la fusion et la pré-prod à la routine du projet (voir mémoire : PR automatique, `npm run build` puis `npm run preprod` après fusion).

---

## Self-Review

- **Couverture de la spec** : adoption chien/pelages/ids (T1, T7) ; plafond 3 (T1, T7) ; profil du chien et vitesse (T3) ; poses du chien et du chat (T6) ; 5 scènes et règles — probabilité, ≤ 8 s, sol, pas de téléportation, annulation (T4, T5) ; places réservées entre animaux (T3 `key`, T5 `takenBy`) ; reprise après rechargement (plans absolus + `lag`, T2, T5) ; fiche `bibliotheque-v10` (T8) ; tests et vérification visuelle (T9). Écarts (v4, deux boutons, pas d'inversion, nap près d'un dormeur) consignés dans « Global Constraints » et reportés dans la spec (T1 step 5).
- **Cohérence des noms** : `PairScene`/`PAIR_SCENES`, `PetWith`, `proposeScene`, `sceneIsValid`, `scaleRoute`, `MAX_PETS`, `paletteOf`, `DOG_COAT_LABELS`, `adoptPet(…, species)` sont utilisés à l'identique entre tâches ; `PetFrame.species` introduit en T5 et consommé en T6.
- **Point à surveiller à l'exécution** : `sceneIsValid` ne vérifie pas que le plan jumeau pointe vers le bon animal ; le runner (T5) ne passe `partnerPlan` que si `partnerPlan.with.petId === pet.id`, ce qui complète la vérification.
