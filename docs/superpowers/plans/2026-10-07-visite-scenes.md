# Visite guidée : scènes réelles — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Faire naviguer la visite guidée vers la bonne page, préparer l'écran (modes, vues, menu), ouvrir une vraie carte de la Collection de la bonne nature ou, à défaut, une fiche de démonstration, puis ramener l'utilisateur où il était.

**Architecture :** Une `scene` optionnelle sur chaque `TourStep`. Un résolveur de scène (fonction pure à dépendances injectées) décide : élément présent → mauvaise page → révélation → carte réelle → démonstration → texte seul. L'état de la visite vit en `sessionStorage` pour survivre aux navigations. L'environnement réel (cartes, ouverture de fiche, navigation) est fourni par `overlay.ts` via un registre, comme les autres services.

**Tech Stack :** TypeScript, React 19, Vitest (+ jsdom).

**Spec :** `docs/superpowers/specs/2026-10-07-visite-scenes-design.md`

## Global Constraints

- Français partout (interface, commentaires, commits), commentaires courts dans le style voisin.
- Extension ET APK (`startOverlay` partagé) ; cibles tactiles ≥ 44 px.
- `reveal` : bascules d'affichage uniquement, jamais d'envoi ni de suppression.
- La fiche de démonstration ne fait aucune requête réseau et n'écrit ni dans la Collection, ni dans l'historique des prix, ni dans le stockage de l'extension ; les registres de services sont restaurés à sa fermeture.
- Livraison limitée à la nature `game` pour la démonstration ; `music`, `screen`, `any` retombent sur le texte seul avec une note « Illustration indisponible pour ce type de carte pour l'instant ».
- Plafond de 300 cartes pour le choix par nature. Session de visite : 10 minutes.
- Une autre session peut modifier le dossier principal : travailler dans le worktree `Wikimasters-nouveautes`, vérifier `git branch --show-current` avant chaque commit.
- Avant le commit final : `npm run typecheck`, `npm run test`, `npm run build`.

## Structure des fichiers

Créer : `src/core/whats-new/pick-card.ts`, `src/content/tour-session.ts`, `src/content/scene.ts` (résolveur), `src/content/tour-registry.ts`, `src/content/tour-control.ts`, `src/content/DemoCard.tsx`, `src/content/demo-game.ts` ; tests `tests/core/whats-new/pick-card.test.ts, tests/content/{tour-session,scene}.test.ts`, `tests/content/{tour-control,demo-game}.test.ts(x)`.
Modifier : `src/core/whats-new/types.ts`, `src/core/whats-new/entries.ts`, `src/content/TourOverlay.tsx`, `src/content/mount.tsx`, `src/app/overlay.ts`, `tests/content/tour.test.tsx`, `tests/core/whats-new/entries.test.ts`.

---

### Task 1: Modèle de scène, choix de carte, session, résolveur

**Files:** Create `pick-card.ts`, `tour-session.ts`, `scene.ts` ; Modify `types.ts` ; Test les trois tests unitaires.

**Interfaces — Produces :**
- `type CardKind = 'game' | 'music' | 'screen' | 'any'` ; `type RevealItem = string | { text: string }` ; `type Scene = { page?: string; card?: CardKind; reveal?: RevealItem[] }` ; `TourStep` gagne `scene?: Scene`.
- `pickCard(kind: CardKind, cards: KnownCard[], slugsOf: (kind: Exclude<CardKind, 'any'>, cards: KnownCard[]) => Promise<Set<string>>): Promise<KnownCard | null>` (plafond `PICK_LIMIT = 300`).
- `type TourSession = { steps: TourStep[]; index: number; origin: string; cardSlug?: string }` ; `saveTourSession(storage, session, now)` ; `loadTourSession(storage, now): TourSession | null` ; `clearTourSession(storage)`.
- `type SceneResult = { kind: 'ready' } | { kind: 'navigating' } | { kind: 'card'; slug: string; title: string } | { kind: 'demo'; card: CardKind } | { kind: 'text'; missing: boolean }` et `createSceneResolver(deps: SceneDeps): { ensure(step: TourStep, session: TourSession): Promise<SceneResult> }`, avec
  `SceneDeps = { pathname(): string; assign(path: string): void; find(selector: string): Element | null; findText(text: string): Element | null; click(element: Element): void; wait<T>(read: () => T | null, ms: number): Promise<T | null>; cards(): Promise<KnownCard[]>; pick(kind: CardKind, cards: KnownCard[]): Promise<KnownCard | null>; openCard(slug: string): void; save(session: TourSession): void }`.

- [ ] **Step 1: Tests** (écrire les trois fichiers) — cas obligatoires :
  - `pick-card` : `any` rend la première carte ; `game` rend la première carte dont le slug est dans l'ensemble, dans l'ordre de la liste ; aucune → `null` ; liste vide → `null` ; au-delà de 300 cartes seules les 300 premières sont proposées à `slugsOf`.
  - `tour-session` : aller-retour `save`/`load` ; expiré (> 10 min) → `null` ; JSON invalide ou `steps` non tableau → `null` ; `clear` efface ; stockage qui lève une exception → pas d'erreur.
  - `scene` (dépendances simulées) :
    1. étape sans `scene` → `ready` si cible trouvée, `text` sinon (`missing: true` si la cible existe dans l'étape) ;
    2. cible déjà présente → `ready` sans navigation ;
    3. mauvaise page (`pathname()` = `/marketplace`, `scene.page` = `/collection`) → `save` appelé avec la session puis `assign('/collection')`, résultat `navigating` ;
    4. `reveal` : le premier sélecteur est cliqué, la cible apparaît → `ready` ; `{ text: 'Sélectionner' }` passe par `findText` ;
    5. `card: 'game'` avec une carte trouvée : `save` (avec `cardSlug`), `openCard(slug)`, cible apparue → `{ kind: 'card', slug, title }` ;
    6. `card: 'game'` sans carte → `{ kind: 'demo', card: 'game' }` ;
    7. `card: 'game'` avec carte mais cible jamais apparue → `demo` ;
    8. session avec `cardSlug` déjà demandé : `pick` n'est pas rappelé, on attend la cible puis `card` ou `demo` ;
    9. cible absente sans carte ni révélation → `{ kind: 'text', missing: true }`.
- [ ] **Step 2: Lancer, vérifier l'échec** — `npx vitest run tests/core/whats-new` → FAIL (modules absents).
- [ ] **Step 3: Implémenter**

`types.ts` — ajouter :
```ts
export type CardKind = 'game' | 'music' | 'screen' | 'any';
export type RevealItem = string | { text: string };
// Où et comment l'élément visé apparaît : page du site, éléments à toucher pour le faire apparaître, nature de carte dont il faut ouvrir la fiche.
export type Scene = { page?: string; card?: CardKind; reveal?: RevealItem[] };
```
et `scene?: Scene` dans `TourStep`.

`pick-card.ts` :
```ts
import type { KnownCard } from '../collection/collection-book';
import type { CardKind } from './types';

export const PICK_LIMIT = 300;

// La première carte de la Collection (dans son ordre) qui convient à la nature demandée ; `any` prend la première carte.
export async function pickCard(
  kind: CardKind,
  cards: KnownCard[],
  slugsOf: (kind: Exclude<CardKind, 'any'>, cards: KnownCard[]) => Promise<Set<string>>,
): Promise<KnownCard | null> {
  const candidates = cards.slice(0, PICK_LIMIT);
  if (kind === 'any') return candidates[0] ?? null;
  if (candidates.length === 0) return null;
  const slugs = await slugsOf(kind, candidates);
  return candidates.find((card) => slugs.has(card.slug)) ?? null;
}
```

`tour-session.ts` (s'appuie sur `readSlot`/`writeSlot`/`clearSlot` de `src/content/session-slot.ts` : l'importer tel quel, leur dépendance est un type `Storage` de navigateur) :
```ts
import { clearSlot, readSlot, writeSlot, type SlotStorage } from '../../content/session-slot';
import type { TourStep } from './types';

export type TourSession = { steps: TourStep[]; index: number; origin: string; cardSlug?: string };

const KEY = 'wmt:tour';
const MAX_AGE_MS = 600_000;

export const saveTourSession = (storage: SlotStorage, session: TourSession, now: number): void => writeSlot(storage, KEY, session, now);
export const clearTourSession = (storage: SlotStorage): void => clearSlot(storage, KEY);

// La visite en cours (jamais consommée : elle se poursuit d'une page à l'autre) ; rend null si elle est expirée ou illisible.
export function loadTourSession(storage: SlotStorage, now: number): TourSession | null {
  const value = readSlot<Partial<TourSession>>(storage, KEY, MAX_AGE_MS, now, false);
  if (!value || !Array.isArray(value.steps) || typeof value.index !== 'number' || typeof value.origin !== 'string') return null;
  return { steps: value.steps, index: value.index, origin: value.origin, ...(typeof value.cardSlug === 'string' ? { cardSlug: value.cardSlug } : {}) };
}
```

`scene.ts` :
```ts
import type { KnownCard } from '../collection/collection-book';
import type { TourSession } from './tour-session';
import type { CardKind, RevealItem, TourStep } from './types';

export type SceneResult =
  | { kind: 'ready' }
  | { kind: 'navigating' }
  | { kind: 'card'; slug: string; title: string }
  | { kind: 'demo'; card: CardKind }
  | { kind: 'text'; missing: boolean };

export type SceneDeps = {
  pathname(): string;
  assign(path: string): void;
  find(selector: string): Element | null;
  findText(text: string): Element | null;
  click(element: Element): void;
  wait<T>(read: () => T | null, ms: number): Promise<T | null>;
  cards(): Promise<KnownCard[]>;
  pick(kind: CardKind, cards: KnownCard[]): Promise<KnownCard | null>;
  openCard(slug: string): void;
  save(session: TourSession): void;
};

const REVEAL_MS = 2_000;
const CARD_MS = 10_000;
const LATE_MS = 1_500;

// Prépare l'écran pour une étape : renvoie ce que l'interface doit montrer (voir la spec : 6 cas, dans cet ordre).
export function createSceneResolver(deps: SceneDeps) {
  const target = (step: TourStep) => (step.target ? deps.find(step.target) : null);
  const reveal = (item: RevealItem) => (typeof item === 'string' ? deps.find(item) : deps.findText(item.text));

  return {
    async ensure(step: TourStep, session: TourSession): Promise<SceneResult> {
      if (!step.target) return { kind: 'ready' };
      if (target(step)) return { kind: 'ready' };
      const scene = step.scene;
      if (!scene) return { kind: 'text', missing: true };

      if (scene.page && !deps.pathname().startsWith(scene.page)) {
        deps.save(session);
        deps.assign(scene.page);
        return { kind: 'navigating' };
      }

      for (const item of scene.reveal ?? []) {
        if (target(step)) break;
        const element = await deps.wait(() => reveal(item), REVEAL_MS);
        if (element) deps.click(element);
      }
      if (await deps.wait(() => target(step), scene.reveal?.length ? LATE_MS : 0)) return { kind: 'ready' };

      if (scene.card) {
        // Une ouverture déjà demandée avant une navigation : on l'attend, on ne rechoisit pas.
        if (session.cardSlug === undefined) {
          const card = await deps.pick(scene.card, await deps.cards());
          if (!card) return { kind: 'demo', card: scene.card };
          deps.save({ ...session, cardSlug: card.slug });
          deps.openCard(card.slug);
          return (await deps.wait(() => target(step), CARD_MS)) ? { kind: 'card', slug: card.slug, title: card.title } : { kind: 'demo', card: scene.card };
        }
        const known = (await deps.cards()).find((card) => card.slug === session.cardSlug);
        return (await deps.wait(() => target(step), CARD_MS)) && known
          ? { kind: 'card', slug: known.slug, title: known.title }
          : { kind: 'demo', card: scene.card };
      }
      return { kind: 'text', missing: true };
    },
  };
}
```
- [ ] **Step 4: Lancer** — `npx vitest run tests/core/whats-new && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** — `feat(visite): modèle de scène, choix de carte, session et résolveur`.

---

### Task 2: Contrôleur de visite, projecteur à scènes, câblage

**Files:** Create `tour-registry.ts`, `tour-control.ts` ; Modify `TourOverlay.tsx`, `mount.tsx`, `overlay.ts`, `tests/content/tour.test.tsx` ; Test `tests/content/tour-control.test.ts`.

**Interfaces — Consumes :** tout de la tâche 1. **Produces :**
- `TourEnv = { cards(): Promise<KnownCard[]>; pick(kind, cards): Promise<KnownCard | null>; openCard(slug: string): void; closeCard(): void }` ; `setTourEnv(env: TourEnv | null)` / `getTourEnv()`.
- `TourOverlay` props : `{ steps: TourStep[]; startIndex?: number; prepare?: (step: TourStep, index: number) => Promise<ScenePrep>; onIndex?: (index: number) => void; onDone: () => void }` avec `ScenePrep = { note?: { tone: 'real' | 'demo' | 'info'; text: string }; demo?: CardKind | null; navigating?: boolean }`.
- `startTour(steps: TourStep[]): void` ; `resumeTour(): void` (`tour-control.ts`).

- [ ] **Step 1: Tests** — `tour-control.test.ts` (jsdom, dépendances injectées via une fabrique `createTourController(deps)` qui prend `{ storage, now, location: { pathname, search, assign }, env, openWindow }`) :
  - `start` enregistre une session (index 0, origine = chemin + recherche courants) puis ouvre la fenêtre de visite ;
  - `resume` sans session → rien ; avec session → ouvre la fenêtre à `index` ;
  - `finish` : appelle `env.closeCard()` si la session avait une carte (`cardSlug`), efface la session, et `assign(origin)` seulement si le chemin courant diffère de l'origine ;
  - `prepare` traduit `SceneResult` en `ScenePrep` : `card` → note `real` « Carte de votre Collection : <titre> » ; `demo` → note `demo` ; `navigating` → `{ navigating: true }` ; `text` avec `missing` → note `info` « Ouvrez la page concernée pour voir l'élément éclairé. ».
  Dans `tour.test.tsx` : le projecteur appelle `prepare` à chaque étape, affiche la note, rend `Préparation…` tant que la promesse n'est pas résolue, et `onIndex` à chaque changement.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter**
  - `tour-registry.ts` : variable de module + `setTourEnv`/`getTourEnv` (même style que `game-registry.ts`).
  - `tour-control.ts` : `createTourController(deps)` retournant `{ start, resume, prepare, persistIndex, finish }`. `prepare(step, index)` : charge la session, remplace `index`, appelle `createSceneResolver` (dépendances : `find` = `findTarget` de `tour-target.ts`, `findText` = recherche d'un `button, a, [role=button]` dont le texte nettoyé est égal, parcours des shadow DOM ouverts comme `findTarget`, `click` = `element.click()`, `wait` = interrogation toutes les 100 ms jusqu'au délai, `save` = `saveTourSession`, `openCard` = `env.openCard`) puis traduit le résultat. `start` : session `{ steps, index: 0, origin: pathname + search }`, `openWindow(session)`. `resume` : `loadTourSession` puis `openWindow`. `finish` : voir tests. Export du contrôleur par défaut `tourController` construit avec `window.sessionStorage`, `Date.now`, `window.location`, `getTourEnv()` ; `startTour = (steps) => tourController.start(steps)`, `resumeTour = () => tourController.resume()`.
  - `TourOverlay.tsx` : ajouter `startIndex`, `prepare`, `onIndex`, `ScenePrep` ; à chaque changement d'étape, appeler `onIndex(i)`, puis `prepare(step, i)` et stocker le résultat ; pendant l'attente, la bulle affiche `Préparation…` et les boutons restent actifs ; afficher la note en bandeau fixe en haut (`real` vert, `demo` orange, `info` dans la bulle) ; si `prep.demo` est défini, rendre `<DemoCard card={prep.demo} />` (tâche 3) sous le projecteur ; si `prep.navigating`, ne rien dessiner de plus (la page va se recharger).
  - `mount.tsx` : `openTour(steps, options?)` devient `openTour(session: TourSession)` et monte `<TourOverlay steps={session.steps} startIndex={session.index} prepare={tourController.prepare} onIndex={tourController.persistIndex} onDone={() => { close(); tourController.finish(); }} />` ; `openWhatsNew` et `openWikiHow` appellent `startTour(steps)` à la place de `openTour(steps)`.
  - `overlay.ts` : après la création de `collection` et des services, `setTourEnv({ cards: () => collection.list(), pick: (kind, cards) => pickCard(kind, cards, slugsOf), openCard: (slug) => openCardInPage(slug, (target) => void marketUi.reopenCard(target)), closeCard: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })` où `slugsOf(kind, cards)` appelle `getGameService()?.gameSlugs(cards)`, `getMusicService()?.musicSlugs(cards)` ou `getScreenService()?.screenSlugs(cards)` (ensemble vide si le service manque) ; à la fin de `startOverlay` : `resumeTour()` (après `showPendingWhatsNew`, qui n'ouvre rien s'il y a une visite en cours : appeler `resumeTour()` d'abord et ne lancer `showPendingWhatsNew` que si elle n'a rien repris — `resumeTour` renvoie `boolean`).
- [ ] **Step 4: Lancer** — `npx vitest run tests/content && npm run typecheck`.
- [ ] **Step 5: Commit** — `feat(visite): navigation guidée, reprise après changement de page, retour à la page de départ`.

---

### Task 3: Fiche de démonstration (jeu vidéo)

**Files:** Create `src/content/demo-game.ts`, `src/content/DemoCard.tsx` ; Test `tests/content/demo-game.test.tsx`.

**Interfaces — Produces :** `createDemoGameService(): GameService` (type `ReturnType<typeof createGameService>`) ; `<DemoCard card={CardKind} />`.

- [ ] **Step 1: Test** — `demo-game.test.tsx` : (a) `createDemoGameService().view('demo-jeu', 'Exemple de jeu')` rend `{ status: 'detail' }` avec le titre fictif, sans appeler `fetch` (espion global qui échoue s'il est appelé) ; (b) `DemoCard` avec `card="game"` rend le bandeau « Illustration », un élément `[data-wmt-game]`, le texte « Jeu vidéo » ; (c) `getGameService()` est le service de démonstration pendant que `DemoCard` est monté et le service d'origine est rétabli après démontage ; (d) `choose` sur la démo ne touche aucun stockage (`localStorage`/`sessionStorage` espions, aucun `setItem`) ; (e) `DemoCard` pour `music`, `screen`, `any` rend la note « Illustration indisponible pour ce type de carte pour l'instant » et aucun `data-wmt-*`.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Implémenter**
  - `demo-game.ts` : `createDemoGameService()` appelle `createGameService({ collection: { list: async () => [{ slug: 'demo-jeu', title: 'Exemple de jeu' }] }, kinds: { resolveMissing: async () => undefined, load: async () => ({ cards: { 'demo-jeu': { natures: ['Q7889'] } } }) }, games: { resolve: async () => ({ 'demo-jeu': { steamId: 1 } }) }, choices: { load: async () => memoire, save: async (slug, ref) => { memoire[slug] = ref; }, clear: async (slug) => { delete memoire[slug]; } }, steam: { detail: async () => DETAIL, search: async () => [] }, igdb: null, steamCache: { getOrLoad: (_key, load) => load() }, igdbCache: { getOrLoad: (_key, load) => load() } })` avec `DETAIL: GameDetail` figé (titre « Exemple de jeu », source `steam`, avis positifs 94 %, 12 450 joueurs en ligne, genres, studio fictif, sans bande-annonce ni image, `pageUrl: 'https://store.steampowered.com/'`) ; `memoire` est un objet local à l'instance. Ajuster les types des dépendances au besoin avec des conversions locales commentées.
  - `DemoCard.tsx` : pour `game`, `useEffect` qui fait `const previous = getGameService(); setGameService(demo); return () => setGameService(previous)` (le service de démo est créé une fois via `useMemo`) ; rend un cadre plein écran (`position: fixed; inset: 0; z-index` sous le projecteur, fond rayé, `pointerEvents: 'none'` pour que rien n'agisse sur la démo) avec le bandeau orange « Illustration : cette carte n'existe pas et n'entre pas dans votre Collection », un faux visuel de carte, le titre fictif, puis `<div data-wmt-game><GameSection slug="demo-jeu" title="Exemple de jeu" /></div>`. Autres natures : cadre + note « Illustration indisponible pour ce type de carte pour l'instant ».
- [ ] **Step 4: Lancer** — `npx vitest run tests/content/demo-game.test.tsx && npm run typecheck`.
- [ ] **Step 5: Commit** — `feat(visite): fiche de démonstration pour les jeux vidéo (aucune requête, aucune écriture)`.

---

### Task 4: Scènes dans le catalogue

**Files:** Modify `src/core/whats-new/entries.ts`, `tests/core/whats-new/entries.test.ts`.

- [ ] **Step 1: Test** — ajouter à `entries.test.ts` : toute étape qui a une `scene` a une `target` ; tout `scene.page` commence par `/` ; chaque `reveal` est une chaîne non vide ou `{ text }` non vide ; les fiches `cartes-liees`, `encheres`, `ecouter`, `films`, `jeux-video` ont au moins une étape avec `scene.card` ; les fiches `selection`, `toile`, `prix` ont au moins une étape avec `scene.page === '/collection'`.
- [ ] **Step 2: Lancer, vérifier l'échec.**
- [ ] **Step 3: Renseigner les scènes** dans `entries.ts` :
  - `wikihow` : les deux étapes ont `scene: { reveal: [{ text: 'Plus' }] }`.
  - `selection` : étape « Échange avec un ami » et « Toile » : `scene: { page: '/collection', reveal: [{ text: 'Sélectionner' }] }` ; l'étape « Cocher une carte » reste en texte seul (`target: null`).
  - `toile` : étape « Choisir la vue Toile » : `scene: { page: '/collection' }`.
  - `prix` : étape « Trier par prix » : `scene: { page: '/collection' }`.
  - `cartes-liees` : `scene: { card: 'any' }` ; `encheres` : `scene: { card: 'any' }` ; `ecouter` : étape « Écouter » `scene: { card: 'music' }`, étape « Lier votre compte » `scene: { reveal: [{ text: 'Plus' }] }` ; `films` : `scene: { card: 'screen' }` ; `jeux-video` : `scene: { card: 'game' }` ; `anomalie` : `scene: { reveal: [{ text: 'Plus' }] }`.
  Vérifier à la main (Chrome) les libellés « Sélectionner » et « Plus » du site ; corriger les textes si le site emploie d'autres mots.
- [ ] **Step 4: Lancer** — `npx vitest run tests/core/whats-new/entries.test.ts && npm run typecheck`.
- [ ] **Step 5: Commit** — `feat(visite): scènes du catalogue (pages, modes, menu, cartes réelles)`.

---

### Task 5: Vérification, livraison

- [ ] `npm run typecheck && npm run test && npm run build` (dans le worktree).
- [ ] Vérification manuelle dans Chrome (recharger l'extension) : visite « Jeux vidéo » depuis le Marché (navigation vers la Collection, ouverture d'une vraie carte, bandeau vert, retour au Marché en fin de visite) ; même visite sur un compte sans jeu vidéo (démonstration orange, rien dans la Collection) ; « Appui long et sélection » (mode Sélectionner activé tout seul) ; WikiHow depuis une page quelconque (menu Plus). Consigner les écarts et corriger.
- [ ] Mobile (banc tactile) : bulle lisible, aucune cible sous 44 px.
- [ ] Commit du plan et de la spec, push `feat/visite-scenes`, PR, fusion (routine du projet), `npm run preprod` depuis le dossier principal une fois `main` à jour, mise à jour de la mémoire `project_nouveautes_wikihow.md` (scènes, démos restantes : music, screen, any).
