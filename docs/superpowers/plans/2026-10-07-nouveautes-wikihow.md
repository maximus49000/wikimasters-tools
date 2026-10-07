# Nouveautés après mise à jour, WikiHow et Paramètre d'extension — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Après une mise à jour, ouvrir une fenêtre Nouveautés / Corrections avec visite guidée « projecteur », offrir le même contenu dans une entrée « WikiHow » de « Plus », et regrouper « Paramètre d'image » et « Lecteur » derrière « Paramètre d'extension ».

**Architecture :** Contenu = fiches écrites à la main (`entries.ts`) + corrections lues dans les commits `fix:` et injectées au build (`__WMT_FIXES__`). Un dépôt mémorisé (`whats-new-v1`) retient les identifiants déjà annoncés et déjà consultés : la fenêtre n'affiche que ce qui n'a jamais été annoncé. Les fenêtres sont montées comme les réglages existants (`openSettingsWindow`, shadow DOM) et câblées dans `startOverlay`, commun à l'extension et à l'APK.

**Tech Stack :** TypeScript, React 19, WXT, Vite, Vitest (+ jsdom pour les composants).

**Spec :** `docs/superpowers/specs/2026-10-07-nouveautes-wikihow-design.md`

## Écarts assumés par rapport à la spec (à reporter dans la spec à la tâche 1)

- Plutôt qu'un numéro de build, le critère « nouveau » est « identifiant jamais annoncé » : même résultat (cumul des versions sautées, rien après une réinstallation sans nouveauté), sans dépendre du `versionCode` ni d'un numéro à renseigner à la main dans chaque fiche.
- Au tout premier lancement, tout l'existant est marqué annoncé, sauf les fiches `fresh: true` (réservées à la fiche qui présente WikiHow, pour que la mise à jour qui apporte la fonction l'annonce).
- Pas de champ `route` : une étape dont la cible n'est pas à l'écran s'affiche en texte seul avec l'indication « Ouvrez la page concernée pour voir l'élément éclairé ». Une étape peut aussi n'avoir aucune cible (`target: null`).
- Le garde-fou « chaque `feat:` a une fiche » est remplacé par un test de cohérence du catalogue (identifiants uniques, champs non vides).
- Les identifiants sont marqués annoncés dès l'ouverture de la fenêtre (pas à sa fermeture) ; WikiHow permet de tout retrouver.

## Global Constraints

- Français partout (interface, commentaires, messages de commit), commentaires dans le style du code voisin : courts, en français, expliquant le pourquoi.
- Interface commune : tout ce qui est ajouté doit fonctionner sur l'extension ET sur l'APK (`startOverlay` est partagé) ; glyphes plutôt que texte quand c'est possible ; tout visible à l'écran sur mobile (cibles tactiles de 44 px minimum).
- Fenêtres hors du DOM du jeu : toujours via `openSettingsWindow` (shadow DOM, z-index `2147483000`, événements `pointerdown` / `mousedown` / `touchstart` gardés).
- Styles : mêmes variables que `AnomalyDialog.tsx` (`--color-border`, `--color-accent`, `--color-surface`, `--color-foreground`).
- Le réglage « Vérifier la mise à jour » (Android) et « Remonter une anomalie » restent des entrées de « Plus », hors de « Paramètre d'extension ».
- WikiHow n'est PAS dans Paramètre d'extension.
- Aucune clé ni secret nouveau. Tests : `npx vitest run <fichier>` ; avant chaque commit final : `npm run typecheck` et `npm run test`.
- Une session concurrente peut travailler dans le même dossier : vérifier la branche courante avant de commiter, pas de `git stash -u`.

## Structure des fichiers

Créer :
- `src/core/whats-new/types.ts` — types `Entry`, `TourStep`, `Fix`, `Theme`, constante `THEMES`.
- `src/core/whats-new/entries.ts` — le catalogue des fiches.
- `src/core/whats-new/fixes.ts` — `FIXES` (lit `__WMT_FIXES__`).
- `src/core/whats-new/seen.ts` — dépôt mémorisé (`createWhatsNewRepo`).
- `scripts/build-info.mjs` — `parseFix`, `recentFixes`.
- `src/content/tour-target.ts` — `findTarget` (traverse les shadow DOM ouverts).
- `src/content/tour-geometry.ts` — `spotlightBox`, `bubbleTop`.
- `src/content/TourOverlay.tsx` — le projecteur et sa bulle.
- `src/content/EntryCard.tsx` — carte d'une fiche (transparence si consultée).
- `src/content/WhatsNewDialog.tsx` — fenêtre post-MAJ (switch, deux grilles, « Tout visiter »).
- `src/content/WikiHowDialog.tsx` — catalogue complet par thème.
- `src/content/whats-new-flow.ts` — `showPendingWhatsNew`.
- `src/content/ExtensionSettings.tsx` — liste Images / Lecteur.
- `src/content/extension-setting-menu.ts`, `src/content/wikihow-menu.ts` — entrées de « Plus ».
- Tests : `tests/core/whats-new/seen.test.ts`, `tests/core/whats-new/entries.test.ts`, `tests/scripts/build-info.test.ts`, `tests/content/tour.test.tsx`, `tests/content/whats-new.test.tsx`, `tests/content/extension-menu.test.tsx`.

Modifier : `wxt.config.ts`, `vite.android.config.ts`, `vitest.config.ts`, `src/env.d.ts`, `src/content/mount.tsx`, `src/app/overlay.ts`, `src/content/image-setting-menu.ts` et `src/content/player-setting-menu.ts` (retrait des entrées de « Plus »), et les tests qui les couvrent.

---

### Task 1: Données, mémoire et corrections du build

**Files:**
- Create: `src/core/whats-new/types.ts`, `src/core/whats-new/entries.ts` (catalogue vide pour l'instant), `src/core/whats-new/fixes.ts`, `src/core/whats-new/seen.ts`, `scripts/build-info.mjs`
- Modify: `wxt.config.ts`, `vite.android.config.ts`, `vitest.config.ts`, `src/env.d.ts`, `docs/superpowers/specs/2026-10-07-nouveautes-wikihow-design.md`
- Test: `tests/core/whats-new/seen.test.ts`, `tests/scripts/build-info.test.ts`

**Interfaces:**
- Produces (consommé par les tâches 2 à 5) :
  - `type Theme = 'app' | 'collection' | 'fiche' | 'ecoute'`, `THEMES: { id: Theme; label: string }[]`
  - `type TourStep = { target: string | null; title: string; text: string }`
  - `type Entry = { id: string; theme: Theme; glyph: string; title: string; summary: string; steps: TourStep[]; fresh?: boolean }`
  - `type Fix = { id: string; title: string }`
  - `ENTRIES: Entry[]`, `FIXES: Fix[]`
  - `createWhatsNewRepo(store: KeyValueStore)` renvoie `{ pending(entries, fixes): Promise<Pending>; markAnnounced(ids: string[]): Promise<void>; consulted(): Promise<Set<string>>; markConsulted(id: string): Promise<void> }` ; `type Pending = { entries: Entry[]; fixes: Fix[] }` ; `type WhatsNewRepo = ReturnType<typeof createWhatsNewRepo>`
  - `parseFix(line: string): Fix | null`, `recentFixes(cwd: string, limit?: number): Fix[]` (dans `scripts/build-info.mjs`)

- [ ] **Step 1: Vérifier la branche et en créer une**

```bash
git status --short && git branch --show-current
git checkout -b feat/nouveautes-wikihow
```
Expected: arbre propre (hors spec et plan non commités), branche `feat/nouveautes-wikihow`.

- [ ] **Step 2: Écrire les tests de `seen`**

`tests/core/whats-new/seen.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createWhatsNewRepo } from '../../../src/core/whats-new/seen';
import type { Entry, Fix } from '../../../src/core/whats-new/types';

const entry = (id: string, fresh = false): Entry => ({ id, theme: 'collection', glyph: 'x', title: id, summary: '', steps: [], fresh });
const fix = (id: string): Fix => ({ id, title: id });

describe('createWhatsNewRepo', () => {
  it('au premier lancement, annonce seulement les fiches « fresh » et enregistre le reste comme annoncé', async () => {
    const repo = createWhatsNewRepo(createMemoryStore());
    const pending = await repo.pending([entry('a'), entry('b', true)], [fix('f1')]);
    expect(pending.entries.map((e) => e.id)).toEqual(['b']);
    expect(pending.fixes).toEqual([]);
    // Deuxième lecture : « b » est toujours à annoncer tant qu'il n'est pas marqué.
    expect((await repo.pending([entry('a'), entry('b', true)], [fix('f1')])).entries.map((e) => e.id)).toEqual(['b']);
  });

  it('cumule tout ce qui n’a jamais été annoncé (versions sautées)', async () => {
    const store = createMemoryStore();
    const repo = createWhatsNewRepo(store);
    await repo.pending([entry('a')], [fix('f1')]);
    const pending = await repo.pending([entry('a'), entry('b'), entry('c')], [fix('f1'), fix('f2'), fix('f3')]);
    expect(pending.entries.map((e) => e.id)).toEqual(['b', 'c']);
    expect(pending.fixes.map((f) => f.id)).toEqual(['f2', 'f3']);
  });

  it('n’annonce plus ce qui a été marqué annoncé', async () => {
    const repo = createWhatsNewRepo(createMemoryStore());
    await repo.pending([entry('a')], []);
    await repo.markAnnounced(['b']);
    expect((await repo.pending([entry('a'), entry('b')], [])).entries).toEqual([]);
  });

  it('mémorise les fiches consultées', async () => {
    const repo = createWhatsNewRepo(createMemoryStore());
    expect([...(await repo.consulted())]).toEqual([]);
    await repo.markConsulted('a');
    await repo.markConsulted('a');
    await repo.markConsulted('b');
    expect([...(await repo.consulted())].sort()).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 3: Lancer le test, vérifier l'échec**

Run: `npx vitest run tests/core/whats-new/seen.test.ts`
Expected: FAIL (modules introuvables).

- [ ] **Step 4: Créer `types.ts`, `entries.ts`, `seen.ts`**

`src/core/whats-new/types.ts` :
```ts
export type Theme = 'app' | 'collection' | 'fiche' | 'ecoute';

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'app', label: 'Application' },
  { id: 'collection', label: 'Collection' },
  { id: 'fiche', label: 'Fiche d’une carte' },
  { id: 'ecoute', label: 'Écoute et médias' },
];

// `target` : sélecteur CSS de l'élément à éclairer (cherché aussi dans les shadow DOM ouverts) ; null = étape de texte seul.
export type TourStep = { target: string | null; title: string; text: string };

// `fresh` : annoncée même au tout premier lancement (réservé à la fiche qui présente WikiHow).
export type Entry = { id: string; theme: Theme; glyph: string; title: string; summary: string; steps: TourStep[]; fresh?: boolean };

export type Fix = { id: string; title: string };
```

`src/core/whats-new/entries.ts` :
```ts
import type { Entry } from './types';

// Catalogue des fonctions expliquées (ordre = ordre d'apparition dans WikiHow). Une fiche par fonction majeure, écrite à la main.
export const ENTRIES: Entry[] = [];
```

`src/core/whats-new/seen.ts` :
```ts
import type { KeyValueStore } from '../cache/store';
import type { Entry, Fix } from './types';

const KEY = 'whats-new-v1';

type State = { announced: string[]; consulted: string[] };
export type Pending = { entries: Entry[]; fixes: Fix[] };

// Ce qui a déjà été annoncé (fenêtre après mise à jour) et déjà consulté (grisé dans les grilles et dans WikiHow).
export function createWhatsNewRepo(store: KeyValueStore) {
  const load = async (): Promise<State> => (await store.get<State>(KEY)) ?? { announced: [], consulted: [] };
  return {
    // Premier lancement (rien d'enregistré) : l'existant est marqué annoncé, sauf les fiches « fresh ».
    async pending(entries: Entry[], fixes: Fix[]): Promise<Pending> {
      const state = await store.get<State>(KEY);
      if (!state) {
        await store.set<State>(KEY, { announced: [...entries.filter((e) => !e.fresh).map((e) => e.id), ...fixes.map((f) => f.id)], consulted: [] });
        return { entries: entries.filter((e) => e.fresh), fixes: [] };
      }
      const known = new Set(state.announced);
      return { entries: entries.filter((e) => !known.has(e.id)), fixes: fixes.filter((f) => !known.has(f.id)) };
    },
    async markAnnounced(ids: string[]): Promise<void> {
      const state = await load();
      await store.set<State>(KEY, { ...state, announced: [...new Set([...state.announced, ...ids])] });
    },
    async consulted(): Promise<Set<string>> {
      return new Set((await load()).consulted);
    },
    async markConsulted(id: string): Promise<void> {
      const state = await load();
      if (state.consulted.includes(id)) return;
      await store.set<State>(KEY, { ...state, consulted: [...state.consulted, id] });
    },
  };
}

export type WhatsNewRepo = ReturnType<typeof createWhatsNewRepo>;
```

- [ ] **Step 5: Lancer le test, vérifier le succès**

Run: `npx vitest run tests/core/whats-new/seen.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Test de `build-info`**

`tests/scripts/build-info.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { parseFix } from '../../scripts/build-info.mjs';

describe('parseFix', () => {
  it('lit « hash<TAB>fix(portée): texte » et met la première lettre en majuscule', () => {
    expect(parseFix('abc1234\tfix(collection): plusieurs raretés cochées')).toEqual({ id: 'abc1234', title: 'Plusieurs raretés cochées' });
  });
  it('ignore les autres types de commit', () => {
    expect(parseFix('abc1234\tfeat: truc')).toBeNull();
    expect(parseFix('abc1234\tdocs: truc')).toBeNull();
  });
  it('retire la ligne Co-Authored-By et tronque les titres trop longs', () => {
    const long = parseFix(`abc1234\tfix: ${'a'.repeat(300)}`)!;
    expect(long.title.length).toBeLessThanOrEqual(160);
    expect(long.title.endsWith('…')).toBe(true);
    expect(parseFix('abc1234\tfix: x Co-Authored-By: Y')?.title).toBe('X');
  });
});
```
Run: `npx vitest run tests/scripts/build-info.test.ts` — Expected: FAIL.

- [ ] **Step 7: Créer `scripts/build-info.mjs`**

```js
// Informations de build injectées dans le bundle : les corrections récentes, lues dans les commits `fix:`.
import { spawnSync } from 'node:child_process';

const MAX_LENGTH = 160;

// Une ligne « hash<TAB>sujet » → { id: hash, title } si le sujet est un `fix:`, sinon null.
export function parseFix(line) {
  const [id, ...rest] = line.split('\t');
  const match = /^fix(?:\([^)]*\))?!?:\s*(.+)$/.exec(rest.join('\t').trim());
  if (!id || !match) return null;
  const text = match[1].replace(/\s*Co-Authored-By:.*$/i, '').trim();
  const shown = text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1).trimEnd()}…` : text;
  return { id, title: `${shown.charAt(0).toUpperCase()}${shown.slice(1)}` };
}

// Les `limit` corrections les plus récentes (plus récente d'abord) ; vide si git est indisponible (archive de sources).
export function recentFixes(cwd, limit = 60) {
  const result = spawnSync('git', ['log', '--no-merges', '-n', '400', '--format=%h%x09%s'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map(parseFix)
    .filter(Boolean)
    .slice(0, limit);
}
```
Run: `npx vitest run tests/scripts/build-info.test.ts` — Expected: PASS.

- [ ] **Step 8: Injecter `__WMT_FIXES__` dans les trois configurations**

`wxt.config.ts` : ajouter l'import `import { recentFixes } from './scripts/build-info.mjs';` et, dans `defineConfig({ ... })`, la clé :
```ts
  vite: () => ({ define: { __WMT_FIXES__: JSON.stringify(recentFixes(process.cwd())) } }),
```
`vite.android.config.ts` : même import ; `define: { 'process.env.NODE_ENV': '"production"', __WMT_FIXES__: JSON.stringify(recentFixes(process.cwd())) }`.
`vitest.config.ts` : `define: { __WMT_FIXES__: '[]' }` dans la configuration (hors `test`).

`src/env.d.ts` : ajouter à la fin
```ts
declare const __WMT_FIXES__: { id: string; title: string }[];
```
`src/core/whats-new/fixes.ts` :
```ts
import type { Fix } from './types';

// Corrections récentes lues dans les commits au moment du build (voir scripts/build-info.mjs).
export const FIXES: Fix[] = typeof __WMT_FIXES__ === 'undefined' ? [] : __WMT_FIXES__;
```

- [ ] **Step 9: Reporter les écarts dans la spec**

Dans `docs/superpowers/specs/2026-10-07-nouveautes-wikihow-design.md`, ajouter en fin de fichier une section « Écarts décidés au plan » reprenant les cinq puces de la section « Écarts assumés » de ce plan.

- [ ] **Step 10: Vérifier et commiter**

Run: `npm run typecheck && npx vitest run tests/core/whats-new tests/scripts && npm run build`
Expected: tout passe ; le build injecte `__WMT_FIXES__` sans erreur.

```bash
git add docs src/core/whats-new scripts/build-info.mjs tests/core/whats-new tests/scripts/build-info.test.ts wxt.config.ts vite.android.config.ts vitest.config.ts src/env.d.ts
git commit -m "feat(nouveautes): fiches, mémoire des annonces et corrections injectées au build"
```

---

### Task 2: Le projecteur (visite guidée)

**Files:**
- Create: `src/content/tour-target.ts`, `src/content/tour-geometry.ts`, `src/content/TourOverlay.tsx`
- Modify: `src/content/mount.tsx` (ajout de `openTour`)
- Test: `tests/content/tour.test.tsx`

**Interfaces:**
- Consumes: `TourStep` (tâche 1).
- Produces : `findTarget(selector: string, root?: ParentNode): Element | null` ; `spotlightBox(r: Box): Box` et `bubbleTop(box: Box | null, viewportHeight: number, bubbleHeight: number): number` (avec `type Box = { left: number; top: number; width: number; height: number }`) ; `<TourOverlay steps: TourStep[] onDone: () => void />` ; `openTour(steps: TourStep[]): void` exporté de `mount.tsx`.

- [ ] **Step 1: Écrire les tests**

`tests/content/tour.test.tsx` :
```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TourOverlay } from '../../src/content/TourOverlay';
import { findTarget } from '../../src/content/tour-target';
import { bubbleTop, spotlightBox } from '../../src/content/tour-geometry';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('findTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="a"></div><div id="host"></div>';
    const shadow = document.getElementById('host')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<button data-wmt-linked>cartes</button>';
  });
  it('trouve un élément du document', () => {
    expect(findTarget('#a')).toBe(document.getElementById('a'));
  });
  it('trouve un élément dans un shadow DOM ouvert', () => {
    expect(findTarget('[data-wmt-linked]')?.textContent).toBe('cartes');
  });
  it('rend null si rien ne correspond', () => {
    expect(findTarget('[data-wmt-absent]')).toBeNull();
  });
});

describe('géométrie', () => {
  it('élargit la zone éclairée de 6 px de chaque côté', () => {
    expect(spotlightBox({ left: 20, top: 30, width: 100, height: 40 })).toEqual({ left: 14, top: 24, width: 112, height: 52 });
  });
  it('place la bulle sous la cible quand elle tient', () => {
    expect(bubbleTop({ left: 0, top: 100, width: 50, height: 40 }, 800, 150)).toBe(152);
  });
  it('la place au-dessus quand elle ne tient pas dessous', () => {
    expect(bubbleTop({ left: 0, top: 600, width: 50, height: 40 }, 700, 150)).toBe(438);
  });
  it('la centre sans cible', () => {
    expect(bubbleTop(null, 800, 200)).toBe(300);
  });
  it('ne sort jamais de l’écran par le haut', () => {
    expect(bubbleTop({ left: 0, top: 10, width: 50, height: 600 }, 700, 300)).toBe(12);
  });
});

describe('TourOverlay', () => {
  let container: HTMLElement;
  let root: Root;
  const steps = [
    { target: '#cible', title: 'Première', text: 'Texte un' },
    { target: '#absente', title: 'Seconde', text: 'Texte deux' },
  ];
  beforeEach(() => {
    document.body.innerHTML = '<button id="cible">ok</button>';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => act(() => root.unmount()));

  it('affiche l’étape, avance, signale une cible absente puis se termine', () => {
    const done = vi.fn();
    act(() => root.render(<TourOverlay steps={steps} onDone={done} />));
    expect(container.textContent).toContain('Première');
    expect(container.textContent).toContain('1/2');
    const click = (label: string) => act(() => [...container.querySelectorAll('button')].find((b) => b.textContent === label)!.click());
    click('Suivant');
    expect(container.textContent).toContain('Seconde');
    expect(container.textContent).toContain('Ouvrez la page concernée');
    click('Précédent');
    expect(container.textContent).toContain('Première');
    click('Suivant');
    click('Terminer');
    expect(done).toHaveBeenCalledOnce();
  });

  it('Quitter la visite appelle onDone', () => {
    const done = vi.fn();
    act(() => root.render(<TourOverlay steps={steps} onDone={done} />));
    act(() => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Quitter la visite')!.click());
    expect(done).toHaveBeenCalledOnce();
  });

  it('une étape sans cible (null) n’affiche pas l’indication de page', () => {
    act(() => root.render(<TourOverlay steps={[{ target: null, title: 'Texte', text: 'Seul' }]} onDone={() => undefined} />));
    expect(container.textContent).toContain('Seul');
    expect(container.textContent).not.toContain('Ouvrez la page concernée');
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/tour.test.tsx` — Expected: FAIL (modules introuvables).

- [ ] **Step 3: Implémenter**

`src/content/tour-target.ts` :
```ts
// Cherche `selector` dans le document puis dans les shadow DOM ouverts (les fiches du jeu y sont montées).
export function findTarget(selector: string, root: ParentNode = document): Element | null {
  const direct = root.querySelector(selector);
  if (direct) return direct;
  for (const element of root.querySelectorAll('*')) {
    const shadow = element.shadowRoot;
    if (!shadow) continue;
    const found = findTarget(selector, shadow);
    if (found) return found;
  }
  return null;
}
```

`src/content/tour-geometry.ts` :
```ts
export type Box = { left: number; top: number; width: number; height: number };

const PAD = 6;
const MARGIN = 12;

// Zone éclairée : le rectangle de la cible, élargi de quelques pixels.
export const spotlightBox = (r: Box): Box => ({ left: r.left - PAD, top: r.top - PAD, width: r.width + 2 * PAD, height: r.height + 2 * PAD });

// Position verticale de la bulle : sous la cible si elle tient, sinon au-dessus ; centrée sans cible ; jamais hors de l'écran par le haut.
export function bubbleTop(box: Box | null, viewportHeight: number, bubbleHeight: number): number {
  if (!box) return Math.max(MARGIN, (viewportHeight - bubbleHeight) / 2);
  const below = box.top + box.height + MARGIN;
  if (below + bubbleHeight <= viewportHeight - MARGIN) return below;
  return Math.max(MARGIN, box.top - MARGIN - bubbleHeight);
}
```

`src/content/TourOverlay.tsx` :
```tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TourStep } from '../core/whats-new/types';
import { bubbleTop, spotlightBox, type Box } from './tour-geometry';
import { findTarget } from './tour-target';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const button = (primary: boolean) =>
  ({
    flex: 1,
    minHeight: 44,
    cursor: 'pointer',
    font: '600 14px system-ui, sans-serif',
    color: primary ? '#0d1117' : 'inherit',
    background: primary ? 'var(--color-accent, #34d399)' : 'none',
    border: primary ? '1px solid transparent' : border,
    borderRadius: 8,
  }) as const;

// Visite guidée : un projecteur sur l'élément réel (cherché jusque dans les shadow DOM) et une bulle Précédent / Suivant.
// Si l'élément n'est pas à l'écran, l'étape s'affiche en texte seul avec une indication.
export function TourOverlay({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState(170);
  const bubble = useRef<HTMLDivElement>(null);
  const step = steps[index];

  useEffect(() => {
    let scrolled = false;
    const update = () => {
      const element = step.target ? findTarget(step.target) : null;
      if (!element) return setBox(null);
      if (!scrolled) {
        scrolled = true;
        element.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
      const r = element.getBoundingClientRect();
      setBox((prev) => {
        const next = spotlightBox({ left: r.left, top: r.top, width: r.width, height: r.height });
        return prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height ? prev : next;
      });
    };
    update();
    // L'élément peut apparaître plus tard (chargement) ou bouger (défilement, rotation) : on le suit.
    const timer = window.setInterval(update, 300);
    return () => window.clearInterval(timer);
  }, [step]);

  useLayoutEffect(() => {
    if (bubble.current) setBubbleHeight(bubble.current.offsetHeight);
  }, [index, box]);

  const last = index === steps.length - 1;
  const missing = step.target !== null && box === null;

  return (
    <div style={{ position: 'fixed', inset: 0 }} role="dialog" aria-label="Visite guidée">
      {box ? (
        <div style={{ position: 'fixed', left: box.left, top: box.top, width: box.width, height: box.height, borderRadius: 10, boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)', border: '2px solid var(--color-accent, #34d399)', pointerEvents: 'none' }} />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      )}
      <div
        ref={bubble}
        style={{ position: 'fixed', left: 12, right: 12, top: bubbleTop(box, window.innerHeight, bubbleHeight), maxWidth: 400, margin: '0 auto', boxSizing: 'border-box', padding: 14, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Étape {index + 1}/{steps.length}
        </div>
        <strong style={{ display: 'block', fontSize: 16, margin: '2px 0' }}>{step.title}</strong>
        <p style={{ margin: '0 0 8px', opacity: 0.85 }}>{step.text}</p>
        {missing && <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.7 }}>Ouvrez la page concernée pour voir l’élément éclairé.</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          {index > 0 && (
            <button type="button" onClick={() => setIndex(index - 1)} style={button(false)}>
              Précédent
            </button>
          )}
          <button type="button" onClick={() => (last ? onDone() : setIndex(index + 1))} style={button(true)}>
            {last ? 'Terminer' : 'Suivant'}
          </button>
        </div>
        <button type="button" onClick={onDone} style={{ display: 'block', width: '100%', minHeight: 36, marginTop: 6, cursor: 'pointer', color: 'inherit', opacity: 0.7, background: 'none', border: 'none', font: '12px system-ui, sans-serif' }}>
          Quitter la visite
        </button>
      </div>
    </div>
  );
}
```

`src/content/mount.tsx` : importer `TourOverlay` et `type TourStep` (`../core/whats-new/types`), ajouter l'attribut `const TOUR_HOST_ATTRIBUTE = 'data-wmt-tour-host';` à côté des autres, et après `openAnomalyDialog` :
```tsx
export const openTour = (steps: TourStep[]): void =>
  openSettingsWindow(TOUR_HOST_ATTRIBUTE, (close) => <TourOverlay steps={steps} onDone={close} />);
```

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run tests/content/tour.test.tsx` — Expected: PASS (11 tests).

- [ ] **Step 5: Commiter**

Run: `npm run typecheck` — Expected: aucune erreur.
```bash
git add src/content/tour-target.ts src/content/tour-geometry.ts src/content/TourOverlay.tsx src/content/mount.tsx tests/content/tour.test.tsx
git commit -m "feat(nouveautes): visite guidée en projecteur sur l'interface réelle"
```

---

### Task 3: Fenêtre Nouveautés / Corrections, WikiHow et ouverture après mise à jour

**Files:**
- Create: `src/content/EntryCard.tsx`, `src/content/WhatsNewDialog.tsx`, `src/content/WikiHowDialog.tsx`, `src/content/whats-new-flow.ts`
- Modify: `src/content/mount.tsx` (ajout de `openWhatsNew`, `openWikiHow`), `src/app/overlay.ts`
- Test: `tests/content/whats-new.test.tsx`

**Interfaces:**
- Consumes: `Entry`, `Fix`, `TourStep`, `THEMES` (tâche 1), `openTour` (tâche 2), `WhatsNewRepo`, `ENTRIES`, `FIXES`.
- Produces :
  - `<EntryCard glyph title summary consulted onClick />`
  - `type WhatsNewDialogProps = { entries: Entry[]; fixes: Fix[]; consulted: string[]; onConsult: (id: string) => void; onTour: (steps: TourStep[]) => void; onClose: () => void }`
  - `type WikiHowDialogProps = { entries: Entry[]; consulted: string[]; onConsult: (id: string) => void; onTour: (steps: TourStep[]) => void; onClose: () => void }`
  - `showPendingWhatsNew(repo: WhatsNewRepo, entries: Entry[], fixes: Fix[], open: (p: Omit<WhatsNewDialogProps, 'onTour' | 'onClose'>) => void): Promise<void>`
  - `openWhatsNew(props: Omit<WhatsNewDialogProps, 'onTour' | 'onClose'>): void`, `openWikiHow(props: Omit<WikiHowDialogProps, 'onTour' | 'onClose'>): void`

- [ ] **Step 1: Écrire les tests**

`tests/content/whats-new.test.tsx` :
```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../src/core/cache/store';
import { createWhatsNewRepo } from '../../src/core/whats-new/seen';
import type { Entry } from '../../src/core/whats-new/types';
import { WhatsNewDialog } from '../../src/content/WhatsNewDialog';
import { WikiHowDialog } from '../../src/content/WikiHowDialog';
import { showPendingWhatsNew } from '../../src/content/whats-new-flow';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (id: string, steps = 1): Entry => ({
  id,
  theme: 'collection',
  glyph: 'g',
  title: `Titre ${id}`,
  summary: `Résumé ${id}`,
  steps: Array.from({ length: steps }, (_, i) => ({ target: null, title: `${id}-${i}`, text: 't' })),
});

describe('composants', () => {
  let container: HTMLElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => act(() => root.unmount()));
  const button = (label: string | RegExp) =>
    [...container.querySelectorAll('button')].find((b) => (typeof label === 'string' ? b.textContent === label : label.test(b.textContent ?? '')))!;

  it('WhatsNewDialog : compteurs, switch, consultation grisée et visite', () => {
    const onConsult = vi.fn();
    const onTour = vi.fn();
    act(() => root.render(<WhatsNewDialog entries={[entry('a'), entry('b')]} fixes={[{ id: 'f1', title: 'Correction un' }]} consulted={['b']} onConsult={onConsult} onTour={onTour} onClose={() => undefined} />));
    expect(button(/Nouveautés/).textContent).toContain('1');
    expect(button(/Corrections/).textContent).toContain('1');
    expect(container.querySelector('[data-consulted]')?.textContent).toContain('Titre b');
    act(() => button(/Titre a/).click());
    expect(onConsult).toHaveBeenCalledWith('a');
    expect(onTour).toHaveBeenCalledWith(entry('a').steps);
    expect(button(/Nouveautés/).textContent).toContain('0');
    act(() => button(/Corrections/).click());
    expect(container.textContent).toContain('Correction un');
    act(() => button(/Correction un/).click());
    expect(onConsult).toHaveBeenCalledWith('f1');
    expect(onTour).toHaveBeenCalledTimes(1);
  });

  it('WhatsNewDialog : « Tout visiter » enchaîne les étapes des fiches non consultées', () => {
    const onTour = vi.fn();
    act(() => root.render(<WhatsNewDialog entries={[entry('a', 2), entry('b'), entry('c')]} fixes={[]} consulted={['c']} onConsult={() => undefined} onTour={onTour} onClose={() => undefined} />));
    act(() => button('Tout visiter').click());
    const steps = onTour.mock.calls[0][0] as { title: string }[];
    expect(steps.map((s) => s.title)).toEqual(['Titre a · a-0', 'Titre a · a-1', 'Titre b · b-0']);
  });

  it('WhatsNewDialog : s’ouvre sur Corrections quand il n’y a que des corrections', () => {
    act(() => root.render(<WhatsNewDialog entries={[]} fixes={[{ id: 'f1', title: 'Seule correction' }]} consulted={[]} onConsult={() => undefined} onTour={() => undefined} onClose={() => undefined} />));
    expect(container.textContent).toContain('Seule correction');
  });

  it('WikiHowDialog : tout le catalogue par thème, « Revoir » sur les fiches consultées', () => {
    const onTour = vi.fn();
    act(() => root.render(<WikiHowDialog entries={[entry('a'), entry('b')]} consulted={['a']} onConsult={() => undefined} onTour={onTour} onClose={() => undefined} />));
    expect(container.textContent).toContain('Collection');
    expect(container.textContent).toContain('Revoir');
    act(() => button(/Titre b/).click());
    expect(onTour).toHaveBeenCalledWith(entry('b').steps);
  });
});

describe('showPendingWhatsNew', () => {
  it('ouvre la fenêtre avec les nouveautés et les marque annoncées (une seule fois)', async () => {
    const repo = createWhatsNewRepo(createMemoryStore());
    await repo.pending([entry('a')], []);
    const open = vi.fn();
    await showPendingWhatsNew(repo, [entry('a'), entry('b')], [{ id: 'f1', title: 'x' }], open);
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0][0].entries.map((e: Entry) => e.id)).toEqual(['b']);
    expect(open.mock.calls[0][0].fixes).toEqual([{ id: 'f1', title: 'x' }]);
    await showPendingWhatsNew(repo, [entry('a'), entry('b')], [{ id: 'f1', title: 'x' }], open);
    expect(open).toHaveBeenCalledOnce();
  });

  it('transmet la consultation au dépôt', async () => {
    const repo = createWhatsNewRepo(createMemoryStore());
    await repo.pending([], []);
    const open = vi.fn();
    await showPendingWhatsNew(repo, [entry('a')], [], open);
    open.mock.calls[0][0].onConsult('a');
    await vi.waitFor(async () => expect((await repo.consulted()).has('a')).toBe(true));
  });

  it('n’ouvre rien au premier lancement sans fiche « fresh »', async () => {
    const open = vi.fn();
    await showPendingWhatsNew(createWhatsNewRepo(createMemoryStore()), [entry('a')], [{ id: 'f1', title: 'x' }], open);
    expect(open).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/whats-new.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implémenter les composants**

`src/content/EntryCard.tsx` :
```tsx
const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

// Carte d'une fonction : semi-transparente une fois consultée, pastille d'accent tant qu'elle ne l'est pas.
export function EntryCard({ glyph, title, summary, consulted, onClick }: { glyph: string; title: string; summary: string; consulted: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-consulted={consulted ? '' : undefined}
      style={{ position: 'relative', textAlign: 'left', minHeight: 92, padding: 10, cursor: 'pointer', color: 'inherit', background: 'rgba(148,163,184,0.08)', border, borderRadius: 12, opacity: consulted ? 0.45 : 1, transition: 'opacity .25s', font: 'inherit' }}
    >
      {!consulted && <span aria-label="Pas encore consultée" style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: 'var(--color-accent, #34d399)' }} />}
      <span aria-hidden="true" style={{ fontSize: 20 }}>{glyph}</span>
      <strong style={{ display: 'block', fontSize: 13, margin: '4px 0 2px' }}>{title}</strong>
      <span style={{ display: 'block', fontSize: 12, lineHeight: '16px', opacity: 0.75 }}>{summary}</span>
    </button>
  );
}
```

`src/content/WhatsNewDialog.tsx` :
```tsx
import { useState } from 'react';
import type { Entry, Fix, TourStep } from '../core/whats-new/types';
import { EntryCard } from './EntryCard';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const grid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } as const;
const tab = (on: boolean) =>
  ({ minHeight: 36, padding: '0 14px', cursor: 'pointer', font: '600 13px system-ui, sans-serif', color: on ? '#0d1117' : 'inherit', background: on ? 'var(--color-accent, #34d399)' : 'none', border: on ? '1px solid transparent' : border, borderRadius: 18 }) as const;

export type WhatsNewDialogProps = {
  entries: Entry[];
  fixes: Fix[];
  consulted: string[];
  onConsult: (id: string) => void;
  onTour: (steps: TourStep[]) => void;
  onClose: () => void;
};

// Fenêtre après mise à jour : un switch Nouveautés / Corrections, une grille chacune. Toucher une nouveauté lance sa visite.
export function WhatsNewDialog({ entries, fixes, consulted, onConsult, onTour, onClose }: WhatsNewDialogProps) {
  const [seen, setSeen] = useState(() => new Set(consulted));
  const [view, setView] = useState<'news' | 'fixes'>(entries.length > 0 || fixes.length === 0 ? 'news' : 'fixes');
  const consult = (id: string) => {
    onConsult(id);
    setSeen((prev) => new Set(prev).add(id));
  };
  const open = (entry: Entry) => {
    consult(entry.id);
    if (entry.steps.length > 0) onTour(entry.steps);
  };
  const visitAll = () => {
    const todo = entries.filter((e) => !seen.has(e.id));
    todo.forEach((e) => consult(e.id));
    const steps = todo.flatMap((e) => e.steps.map((s) => ({ ...s, title: `${e.title} · ${s.title}` })));
    if (steps.length > 0) onTour(steps);
  };
  const unseenNews = entries.filter((e) => !seen.has(e.id)).length;
  const unseenFixes = fixes.filter((f) => !seen.has(f.id)).length;

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Quoi de neuf"
        onClick={(event) => event.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', width: 'min(420px, 100%)', maxHeight: '100%', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Quoi de neuf</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '20px/1 system-ui, sans-serif' }}>
            ✕
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 10 }}>
          <button type="button" onClick={() => setView('news')} style={tab(view === 'news')}>
            ✨ Nouveautés · {unseenNews}
          </button>
          <button type="button" onClick={() => setView('fixes')} style={tab(view === 'fixes')}>
            🔧 Corrections · {unseenFixes}
          </button>
        </div>
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {view === 'news' ? (
            <div style={grid}>
              {entries.map((e) => (
                <EntryCard key={e.id} glyph={e.glyph} title={e.title} summary={e.summary} consulted={seen.has(e.id)} onClick={() => open(e)} />
              ))}
            </div>
          ) : (
            <div style={grid}>
              {fixes.map((f) => (
                <EntryCard key={f.id} glyph="✔" title={f.title} summary="" consulted={seen.has(f.id)} onClick={() => consult(f.id)} />
              ))}
            </div>
          )}
        </div>
        {view === 'news' && entries.some((e) => e.steps.length > 0) && (
          <button type="button" onClick={visitAll} style={{ marginTop: 10, minHeight: 44, cursor: 'pointer', font: '600 14px system-ui, sans-serif', color: '#0d1117', background: 'var(--color-accent, #34d399)', border: '1px solid transparent', borderRadius: 8 }}>
            Tout visiter
          </button>
        )}
      </div>
    </div>
  );
}
```

`src/content/WikiHowDialog.tsx` :
```tsx
import { useState } from 'react';
import { THEMES, type Entry, type TourStep } from '../core/whats-new/types';
import { EntryCard } from './EntryCard';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

export type WikiHowDialogProps = {
  entries: Entry[];
  consulted: string[];
  onConsult: (id: string) => void;
  onTour: (steps: TourStep[]) => void;
  onClose: () => void;
};

// WikiHow : toutes les fonctions par thème, grisées quand elles ont déjà été consultées ; toucher une carte (re)lance sa visite.
export function WikiHowDialog({ entries, consulted, onConsult, onTour, onClose }: WikiHowDialogProps) {
  const [seen, setSeen] = useState(() => new Set(consulted));
  const open = (entry: Entry) => {
    onConsult(entry.id);
    setSeen((prev) => new Set(prev).add(entry.id));
    if (entry.steps.length > 0) onTour(entry.steps);
  };
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="WikiHow"
        onClick={(event) => event.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', width: 'min(420px, 100%)', maxHeight: '100%', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <strong style={{ fontSize: 16 }}>WikiHow</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '20px/1 system-ui, sans-serif' }}>
            ✕
          </button>
        </div>
        <p style={{ margin: '0 0 8px', fontSize: 12, opacity: 0.7 }}>Toutes les fonctions, avec leur visite guidée. Grisé : déjà consulté.</p>
        <div style={{ overflowY: 'auto', minHeight: 0 }}>
          {THEMES.map((theme) => {
            const items = entries.filter((e) => e.theme === theme.id);
            if (items.length === 0) return null;
            return (
              <section key={theme.id}>
                <h3 style={{ margin: '10px 0 6px', fontSize: 12, fontWeight: 600, opacity: 0.6 }}>{theme.label}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {items.map((e) => (
                    <EntryCard key={e.id} glyph={e.glyph} title={e.title} summary={seen.has(e.id) ? 'Revoir' : e.summary} consulted={seen.has(e.id)} onClick={() => open(e)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

`src/content/whats-new-flow.ts` :
```ts
import type { WhatsNewRepo } from '../core/whats-new/seen';
import type { Entry, Fix } from '../core/whats-new/types';
import type { WhatsNewDialogProps } from './WhatsNewDialog';

// Au démarrage : s'il y a des nouveautés ou corrections jamais annoncées, ouvre la fenêtre, puis les marque annoncées.
export async function showPendingWhatsNew(
  repo: WhatsNewRepo,
  entries: Entry[],
  fixes: Fix[],
  open: (props: Omit<WhatsNewDialogProps, 'onTour' | 'onClose'>) => void,
): Promise<void> {
  const pending = await repo.pending(entries, fixes);
  if (pending.entries.length === 0 && pending.fixes.length === 0) return;
  const consulted = [...(await repo.consulted())];
  await repo.markAnnounced([...pending.entries.map((e) => e.id), ...pending.fixes.map((f) => f.id)]);
  open({ entries: pending.entries, fixes: pending.fixes, consulted, onConsult: (id) => void repo.markConsulted(id) });
}
```

`src/content/mount.tsx` : importer `WhatsNewDialog`, `type WhatsNewDialogProps`, `WikiHowDialog`, `type WikiHowDialogProps` ; ajouter les attributs `data-wmt-whats-new` et `data-wmt-wikihow` ; puis, après `openTour` :
```tsx
const WHATS_NEW_HOST_ATTRIBUTE = 'data-wmt-whats-new';
const WIKIHOW_HOST_ATTRIBUTE = 'data-wmt-wikihow';

// La visite remplace la fenêtre : on ferme la grille avant d'éclairer l'interface.
export const openWhatsNew = (props: Omit<WhatsNewDialogProps, 'onTour' | 'onClose'>): void =>
  openSettingsWindow(WHATS_NEW_HOST_ATTRIBUTE, (close) => (
    <WhatsNewDialog
      {...props}
      onTour={(steps) => {
        close();
        openTour(steps);
      }}
      onClose={close}
    />
  ));

export const openWikiHow = (props: Omit<WikiHowDialogProps, 'onTour' | 'onClose'>): void =>
  openSettingsWindow(WIKIHOW_HOST_ATTRIBUTE, (close) => (
    <WikiHowDialog
      {...props}
      onTour={(steps) => {
        close();
        openTour(steps);
      }}
      onClose={close}
    />
  ));
```

- [ ] **Step 4: Câbler le démarrage dans `src/app/overlay.ts`**

1. Imports : `openTour`… non ; ajouter `openWhatsNew, openWikiHow` à l'import existant de `'../content/mount'` ; puis
```ts
import { createWhatsNewRepo } from '../core/whats-new/seen';
import { ENTRIES } from '../core/whats-new/entries';
import { FIXES } from '../core/whats-new/fixes';
import { showPendingWhatsNew } from '../content/whats-new-flow';
```
2. Dans `startOverlay`, juste après l'entrée dans la fonction (avant la définition de la fonction de décoration, là où `store` est disponible) : `const whatsNew = createWhatsNewRepo(store);`
3. À la toute fin de `startOverlay` (après le bloc `if (window.location.pathname.startsWith('/marketplace')) {...} else {...}`) :
```ts
  // Après une mise à jour : nouveautés et corrections jamais annoncées (rien au premier lancement).
  void showPendingWhatsNew(whatsNew, ENTRIES, FIXES, openWhatsNew).catch((error) => console.warn(LOG, 'nouveautés indisponibles :', error));
```
(`openWikiHow` est câblé à la tâche 4.)

- [ ] **Step 5: Lancer les tests et le typecheck**

Run: `npx vitest run tests/content/whats-new.test.tsx && npm run typecheck`
Expected: PASS (7 tests), aucune erreur de type (retirer l'import `openWikiHow` d'`overlay.ts` s'il est signalé inutilisé et le remettre à la tâche 4).

- [ ] **Step 6: Commiter**

```bash
git add src/content/EntryCard.tsx src/content/WhatsNewDialog.tsx src/content/WikiHowDialog.tsx src/content/whats-new-flow.ts src/content/mount.tsx src/app/overlay.ts tests/content/whats-new.test.tsx
git commit -m "feat(nouveautes): fenêtre Nouveautés / Corrections après mise à jour et catalogue WikiHow"
```

---

### Task 4: « Paramètre d'extension » et « WikiHow » dans Plus

**Files:**
- Create: `src/content/ExtensionSettings.tsx`, `src/content/extension-setting-menu.ts`, `src/content/wikihow-menu.ts`
- Modify: `src/content/mount.tsx` (ajout de `openExtensionSettings`), `src/app/overlay.ts`, `src/content/image-setting-menu.ts`, `src/content/player-setting-menu.ts` (+ tests existants qui les couvrent)
- Test: `tests/content/extension-menu.test.tsx`

**Interfaces:**
- Consumes: `buildEntry`, `EntrySpec` (`image-setting-menu.ts`), `ImageSettings`, `PlayerSettings`, `ImageService`, `PlayerSource`, `openWikiHow` (tâche 3).
- Produces : `EXTENSION_SETTING_ATTRIBUTE = 'data-wmt-extension-setting'`, `WIKIHOW_SETTING_ATTRIBUTE = 'data-wmt-wikihow-setting'` ; `decorateExtensionSetting(root, onOpen): number` ; `decorateWikiHowSetting(root, onOpen): number` ; `<ExtensionSettings images player onClose />` ; `openExtensionSettings(images: ImageService, player: PlayerSource | null): void`.

- [ ] **Step 1: Chercher les tests existants à adapter**

Run: `grep -rln "decorateImageSetting\|decoratePlayerSetting\|IMAGE_SETTING_ATTRIBUTE\|PLAYER_SETTING_ATTRIBUTE" src tests`
Expected: liste des fichiers à adapter à l'étape 5 (au minimum `src/app/overlay.ts`, `src/content/player-setting-menu.ts`, des tests de `tests/content`).

- [ ] **Step 2: Écrire les tests**

`tests/content/extension-menu.test.tsx` :
```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decorateAnomalySetting } from '../../src/content/anomaly-setting-menu';
import { EXTENSION_SETTING_ATTRIBUTE, decorateExtensionSetting } from '../../src/content/extension-setting-menu';
import { WIKIHOW_SETTING_ATTRIBUTE, decorateWikiHowSetting } from '../../src/content/wikihow-menu';
import { ExtensionSettings } from '../../src/content/ExtensionSettings';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('entrées de Plus', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div><a class="row" href="/settings"><span><svg><path d="M0 0"/></svg></span>Paramètres</a><a href="/x">Autre</a></div>';
  });
  it('« Paramètre d’extension » puis « WikiHow » se posent une seule fois, dans cet ordre, avant l’anomalie', () => {
    const open = vi.fn();
    expect(decorateExtensionSetting(document, open)).toBe(1);
    expect(decorateExtensionSetting(document, open)).toBe(0);
    expect(decorateWikiHowSetting(document, open)).toBe(1);
    expect(decorateWikiHowSetting(document, open)).toBe(0);
    decorateAnomalySetting(document, () => undefined);
    const labels = [...document.querySelectorAll('.row')].map((e) => e.textContent);
    expect(labels).toEqual(['Paramètres', 'Paramètre d’extension', 'WikiHow', 'Remonter une anomalie']);
    document.querySelector<HTMLElement>(`[${EXTENSION_SETTING_ATTRIBUTE}]`)!.click();
    document.querySelector<HTMLElement>(`[${WIKIHOW_SETTING_ATTRIBUTE}]`)!.click();
    expect(open).toHaveBeenCalledTimes(2);
  });
});

describe('ExtensionSettings', () => {
  let container: HTMLElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => act(() => root.unmount()));

  it('liste Images et n’affiche pas WikiHow ; sans lecteur, pas de ligne Lecteur', () => {
    act(() => root.render(<ExtensionSettings images={null as never} player={null} onClose={() => undefined} />));
    const text = container.textContent ?? '';
    expect(text).toContain('Paramètre d’extension');
    expect(text).toContain('Images');
    expect(text).not.toContain('Lecteur');
    expect(text).not.toContain('WikiHow');
  });
});
```

- [ ] **Step 3: Lancer, vérifier l'échec**

Run: `npx vitest run tests/content/extension-menu.test.tsx` — Expected: FAIL.

- [ ] **Step 4: Implémenter**

`src/content/extension-setting-menu.ts` :
```ts
import { buildEntry, type EntrySpec } from './image-setting-menu';

export const EXTENSION_SETTING_ATTRIBUTE = 'data-wmt-extension-setting';

const SPEC: EntrySpec = {
  attribute: EXTENSION_SETTING_ATTRIBUTE,
  label: 'Paramètre d’extension',
  iconPaths: ['M4 6h10', 'M18 6h2', 'M4 12h2', 'M10 12h10', 'M4 18h12', 'M20 18h0', 'M16 4v4', 'M8 10v4', 'M18 16v4'],
};

// Ajoute « Paramètre d'extension » juste sous « Paramètres » (menu « Plus » du mobile, barre latérale du bureau), une seule fois par menu.
export function decorateExtensionSetting(root: ParentNode, onOpen: () => void): number {
  let added = 0;
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href="/settings"]')) {
    if (link.nextElementSibling?.hasAttribute(EXTENSION_SETTING_ATTRIBUTE)) continue;
    link.insertAdjacentElement('afterend', buildEntry(link, onOpen, SPEC));
    added += 1;
  }
  return added;
}
```

`src/content/wikihow-menu.ts` :
```ts
import { buildEntry, type EntrySpec } from './image-setting-menu';
import { EXTENSION_SETTING_ATTRIBUTE } from './extension-setting-menu';

export const WIKIHOW_SETTING_ATTRIBUTE = 'data-wmt-wikihow-setting';

const SPEC: EntrySpec = {
  attribute: WIKIHOW_SETTING_ATTRIBUTE,
  label: 'WikiHow',
  iconPaths: ['M22 10 12 5 2 10l10 5 10-5z', 'M6 12v5c3 3 9 3 12 0v-5'],
};

// Ajoute « WikiHow » sous « Paramètre d'extension » (ou sous « Paramètres » à défaut), une seule fois par menu.
export function decorateWikiHowSetting(root: ParentNode, onOpen: () => void): number {
  let added = 0;
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href="/settings"]')) {
    const extension = link.nextElementSibling?.hasAttribute(EXTENSION_SETTING_ATTRIBUTE) ? link.nextElementSibling : link;
    if (extension.nextElementSibling?.hasAttribute(WIKIHOW_SETTING_ATTRIBUTE)) continue;
    extension.insertAdjacentElement('afterend', buildEntry(link, onOpen, SPEC));
    added += 1;
  }
  return added;
}
```

`src/content/ExtensionSettings.tsx` :
```tsx
import { useState } from 'react';
import type { ImageService } from '../core/images/image-service';
import { ImageSettings } from './ImageSettings';
import { PlayerSettings } from './PlayerSettings';
import type { PlayerSource } from './player-source';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';
const row = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 48, padding: '0 8px', cursor: 'pointer', color: 'inherit', background: 'none', border: 'none', borderBottom: border, font: '14px system-ui, sans-serif', textAlign: 'left' } as const;

// « Paramètre d'extension » : une liste style Paramètres. Chaque ligne ouvre le réglage existant ; sa fermeture ramène à la liste.
export function ExtensionSettings({ images, player, onClose }: { images: ImageService; player: PlayerSource | null; onClose: () => void }) {
  const [view, setView] = useState<'list' | 'images' | 'player'>('list');
  if (view === 'images') return <ImageSettings images={images} onClose={() => setView('list')} />;
  if (view === 'player' && player) return <PlayerSettings source={player} onClose={() => setView('list')} />;
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Paramètre d’extension"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(400px, 100%)', boxSizing: 'border-box', padding: 16, borderRadius: 12, border, background: 'var(--color-surface, #0d1117)', color: 'var(--color-foreground, #e6edf3)', font: '14px/20px system-ui, sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Paramètre d’extension</strong>
          <button type="button" onClick={onClose} aria-label="Fermer" title="Fermer" style={{ width: 44, height: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, font: '20px/1 system-ui, sans-serif' }}>
            ✕
          </button>
        </div>
        <button type="button" onClick={() => setView('images')} style={row}>
          <span aria-hidden="true">🖼</span>
          <span>Images</span>
          <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.5 }}>›</span>
        </button>
        {player && (
          <button type="button" onClick={() => setView('player')} style={row}>
            <span aria-hidden="true">▶</span>
            <span>Lecteur</span>
            <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.5 }}>›</span>
          </button>
        )}
      </div>
    </div>
  );
}
```
(Vérifier le chemin réel du type `ImageService` : il est importé tel quel par `mount.tsx` ; reprendre son import.)

`src/content/mount.tsx` : importer `ExtensionSettings` et ajouter
```tsx
const EXTENSION_SETTINGS_HOST_ATTRIBUTE = 'data-wmt-extension-settings';

export const openExtensionSettings = (images: ImageService, player: PlayerSource | null): void =>
  openSettingsWindow(EXTENSION_SETTINGS_HOST_ATTRIBUTE, (close) => <ExtensionSettings images={images} player={player} onClose={close} />);
```
Retirer `openImageSettings` et `openPlayerSettings` s'ils ne sont plus utilisés ailleurs (ainsi que leurs attributs d'hôte).

- [ ] **Step 5: Remplacer le câblage dans `src/app/overlay.ts` et retirer les anciennes entrées**

Dans le bloc « réglage des images » (autour de `decorateImageSetting(document, () => openImageSettings(images));`), remplacer :
```ts
        decorateImageSetting(document, () => openImageSettings(images));
        // Le réglage « Lecteur » n'existe que si Spotify est fourni par la plateforme.
        const player = getPlayerSource();
        if (player) {
          decoratePlayerSetting(document, () => openPlayerSettings(player));
```
par
```ts
        // « Paramètre d'extension » regroupe Images et Lecteur (le lecteur n'existe que si Spotify est fourni par la plateforme).
        decorateExtensionSetting(document, () => openExtensionSettings(images, getPlayerSource() ?? null));
        decorateWikiHowSetting(document, () => void openWikiHowFromStore());
        const player = getPlayerSource();
        if (player) {
```
(le reste du bloc `if (player) { mountSpotifyPlayer(...) }` est conservé), et définir juste après `const whatsNew = createWhatsNewRepo(store);` :
```ts
  const openWikiHowFromStore = async () =>
    openWikiHow({ entries: ENTRIES, consulted: [...(await whatsNew.consulted())], onConsult: (id) => void whatsNew.markConsulted(id) });
```
Mettre à jour les imports (`decorateExtensionSetting`, `decorateWikiHowSetting`, `openExtensionSettings`, `openWikiHow` ; supprimer `decorateImageSetting`, `decoratePlayerSetting`, `openImageSettings`, `openPlayerSettings`).

Supprimer `decorateImageSetting` de `src/content/image-setting-menu.ts` (garder `buildEntry`, `EntrySpec`, `IMAGE_SETTING_ATTRIBUTE` seulement s'il est encore utilisé), supprimer `src/content/player-setting-menu.ts`, et adapter ou supprimer les tests listés à l'étape 1 qui n'exercent que ces deux entrées (garder ceux de `buildEntry`).

- [ ] **Step 6: Lancer tout**

Run: `npm run typecheck && npm run test`
Expected: tout passe.

- [ ] **Step 7: Commiter**

```bash
git add -A src tests
git commit -m "feat(menu): « Paramètre d'extension » regroupe Images et Lecteur, entrée « WikiHow » dans Plus"
```

---

### Task 5: Fiches de départ, vérification et livraison

**Files:**
- Modify: `src/core/whats-new/entries.ts`
- Test: `tests/core/whats-new/entries.test.ts`

**Interfaces:**
- Consumes: `Entry`, `THEMES`, `ENTRIES` (tâche 1) ; attributs `data-wmt-*` existants et ceux des tâches 3-4.

- [ ] **Step 1: Écrire le test de cohérence du catalogue**

`tests/core/whats-new/entries.test.ts` :
```ts
import { describe, expect, it } from 'vitest';
import { ENTRIES } from '../../../src/core/whats-new/entries';
import { THEMES } from '../../../src/core/whats-new/types';

describe('catalogue des fiches', () => {
  it('a des identifiants uniques et des champs renseignés', () => {
    const ids = ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const themes = new Set(THEMES.map((t) => t.id));
    for (const e of ENTRIES) {
      expect(e.title.trim(), e.id).not.toBe('');
      expect(e.summary.trim(), e.id).not.toBe('');
      expect(e.glyph.trim(), e.id).not.toBe('');
      expect(themes.has(e.theme), e.id).toBe(true);
      expect(e.steps.length, e.id).toBeGreaterThan(0);
      for (const s of e.steps) {
        expect(s.title.trim(), e.id).not.toBe('');
        expect(s.text.trim(), e.id).not.toBe('');
        if (s.target !== null) expect(s.target.trim(), e.id).not.toBe('');
      }
    }
  });

  it('une seule fiche est annoncée au premier lancement (celle de WikiHow)', () => {
    expect(ENTRIES.filter((e) => e.fresh).map((e) => e.id)).toEqual(['wikihow']);
  });
});
```
Run: `npx vitest run tests/core/whats-new/entries.test.ts` — Expected: FAIL (catalogue vide : `fresh` attendu).

- [ ] **Step 2: Rédiger les fiches**

Remplacer le contenu de `src/core/whats-new/entries.ts` par :
```ts
import type { Entry } from './types';

// Catalogue des fonctions expliquées (ordre = ordre d'apparition dans WikiHow). Une fiche par fonction majeure, écrite à la main.
// `target` = attribut posé par l'extension sur l'élément réel ; une cible absente de l'écran donne une étape en texte seul.
export const ENTRIES: Entry[] = [
  {
    id: 'wikihow',
    theme: 'app',
    glyph: '🎓',
    title: 'WikiHow et réglages',
    summary: 'Revoir toutes les fonctions, réglages regroupés',
    fresh: true,
    steps: [
      { target: '[data-wmt-extension-setting]', title: 'Paramètre d’extension', text: 'Les réglages des images et du lecteur sont maintenant regroupés ici, dans le menu Plus.' },
      { target: '[data-wmt-wikihow-setting]', title: 'WikiHow', text: 'Toutes les fonctions de l’extension, avec leur visite guidée. Vous pouvez la refaire quand vous voulez.' },
    ],
  },
  {
    id: 'selection',
    theme: 'collection',
    glyph: '✋',
    title: 'Appui long et sélection',
    summary: 'Cocher des cartes, échanger avec un ami',
    steps: [
      { target: null, title: 'Cocher une carte', text: 'Un appui long sur une carte de la Collection l’ouvre en mode sélection avec elle de cochée.' },
      { target: '[data-wmt-selection-trade]', title: 'Échanger avec un ami', text: 'Ce bouton pose les cartes cochées dans votre offre d’échange. Rien n’est envoyé tant que vous ne validez pas.' },
      { target: '[data-wmt-selection-web]', title: 'Toile', text: 'Avec deux cartes cochées, ce bouton cherche le lien le plus court entre elles.' },
    ],
  },
  {
    id: 'toile',
    theme: 'collection',
    glyph: '🕸',
    title: 'Vue Toile',
    summary: 'Les liens entre vos cartes, en un graphe',
    steps: [
      { target: '[data-wmt-view-switch]', title: 'Choisir la vue Toile', text: 'Le sélecteur de vues de la Collection propose la Toile, à côté des autres vues.' },
      { target: null, title: 'Explorer', text: 'Pincez ou utilisez la molette pour zoomer, touchez une carte pour ouvrir ses boutons. Les liens viennent de l’introduction des articles Wikipédia.' },
    ],
  },
  {
    id: 'prix',
    theme: 'collection',
    glyph: '📈',
    title: 'Prix en fond et tri par prix',
    summary: 'Relevé des prix de toute la Collection',
    steps: [
      { target: '[data-wmt-price-sort]', title: 'Trier par prix', text: 'Trie la vue par prix de vente décroissant, à partir des prix relevés.' },
      { target: null, title: 'Relevé en fond', text: 'Quand la page affichée est à jour, l’extension relève le prix du reste de la Collection, une carte à la fois, sans rien vous demander.' },
    ],
  },
  {
    id: 'cartes-liees',
    theme: 'fiche',
    glyph: '🔗',
    title: 'Cartes liées',
    summary: 'Six cartes proches dans la fiche',
    steps: [
      { target: '[data-wmt-linked]', title: 'Cartes liées', text: 'Dans la fiche d’une carte, les cartes les plus consultées parmi celles qui lui sont liées. « Voir plus » ouvre la liste complète.' },
    ],
  },
  {
    id: 'encheres',
    theme: 'fiche',
    glyph: '🔨',
    title: 'Enchères d’une carte',
    summary: 'Toutes les ventes de cette carte',
    steps: [
      { target: '[data-wmt-auction-link]', title: 'Voir les enchères', text: 'Le lien sous « Temps restant » ouvre la recherche des enchères de cette carte, triées par fin imminente.' },
    ],
  },
  {
    id: 'ecouter',
    theme: 'ecoute',
    glyph: '🎵',
    title: 'Écouter une carte',
    summary: 'Spotify ou Tidal pour les cartes de musique',
    steps: [
      { target: '[data-wmt-listen]', title: 'Écouter', text: 'Sur une carte de musique, la fiche propose les titres à écouter avec votre plateforme.' },
      { target: '[data-wmt-extension-setting]', title: 'Lier votre compte', text: 'Le choix de la plateforme et la liaison du compte se font dans Paramètre d’extension, ligne Lecteur.' },
    ],
  },
  {
    id: 'films',
    theme: 'ecoute',
    glyph: '🎬',
    title: 'Films et séries',
    summary: 'Bande-annonce et bande originale',
    steps: [
      { target: '[data-wmt-screen]', title: 'Film ou série', text: 'La fiche d’un film ou d’une série montre sa bande-annonce et un bouton pour écouter sa bande originale.' },
    ],
  },
  {
    id: 'jeux-video',
    theme: 'ecoute',
    glyph: '🎮',
    title: 'Jeux vidéo',
    summary: 'Fiche Steam, avis et bande-annonce',
    steps: [
      { target: '[data-wmt-game]', title: 'Jeu vidéo', text: 'La fiche d’un jeu vidéo montre sa fiche Steam, la note, le nombre de joueurs et sa bande-annonce. Le glyphe ⇄ permet de changer de jeu si le choix automatique est mauvais.' },
    ],
  },
  {
    id: 'anomalie',
    theme: 'app',
    glyph: '⚠',
    title: 'Remonter une anomalie',
    summary: 'Signaler un problème en quelques mots',
    steps: [
      { target: '[data-wmt-anomaly-setting]', title: 'Remonter une anomalie', text: 'Décrivez le problème : il est envoyé tel quel au développeur, avec votre nom de profil si vous le souhaitez.' },
    ],
  },
];
```

- [ ] **Step 3: Lancer les tests, le typecheck et le build**

Run: `npm run typecheck && npm run test && npm run build`
Expected: tout passe.

- [ ] **Step 4: Vérification manuelle dans Chrome (extension)**

Recharger l'extension (`.output/chrome-mv3`) puis, sur wiki-masters.com :
1. Menu « Plus » : lignes « Paramètre d'extension » et « WikiHow » sous « Paramètres », plus de « Paramètre d'image » ni de « Lecteur ». « Paramètre d'extension » ouvre Images et Lecteur ; la croix d'un réglage ramène à la liste.
2. Premier lancement après le rechargement : la fenêtre « Quoi de neuf » apparaît une seule fois avec la fiche « WikiHow et réglages » ; la toucher lance la visite et éclaire les deux entrées de Plus. Recharger la page : la fenêtre ne revient pas.
3. WikiHow : toutes les fiches par thème ; une fiche visitée devient semi-transparente et affiche « Revoir ».
4. Une étape dont la cible n'est pas à l'écran (ex. « Cartes liées » hors fiche) affiche « Ouvrez la page concernée… ».
5. Mobile (banc tactile du projet, voir la mémoire « Test tactile Android ») : cibles de 44 px, bulle lisible, rien ne sort de l'écran.
Consigner tout écart et corriger avant de continuer.

- [ ] **Step 5: Commiter, ouvrir et fusionner la PR (routine du projet)**

```bash
git add -A src tests docs
git commit -m "feat(nouveautes): fiches de départ du catalogue WikiHow"
git push -u origin feat/nouveautes-wikihow
gh pr create --title "feat: nouveautés après mise à jour, WikiHow et Paramètre d'extension" --body "Fenêtre Nouveautés / Corrections au premier lancement après mise à jour, visite guidée en projecteur, catalogue WikiHow dans Plus, regroupement Images + Lecteur dans Paramètre d'extension. Spec et plan dans docs/superpowers."
gh pr merge --merge
```
Puis, depuis `main` à jour et propre : `npm run build`, `npm run preprod` (pas `promouvoir`), et ajouter l'APK aux livrables (`livrables/`) comme pour les livraisons précédentes.

- [ ] **Step 6: Mettre à jour la mémoire du projet**

Créer `project_nouveautes_wikihow.md` dans le dossier mémoire (décisions : critère « jamais annoncé », fiche `fresh`, WikiHow seulement dans Plus, Paramètre d'extension = Images + Lecteur, reste la vérification manuelle sur téléphone) et ajouter sa ligne dans `MEMORY.md`.
