# Plateformes d'écoute (phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Préparer l'arrivée de Tidal sans rien changer au comportement de Spotify : dépôt de listes par plateforme, réglage « plateforme » mémorisé, « Délier » retiré des fiches, sélecteur dans Plus → Lecteur (caché tant qu'une seule plateforme existe).

**Architecture:** Petits modules indépendants : un `ListenRepo` qui accepte sa clé de stockage, un réglage `PlatformSetting` (même modèle que les réglages du lecteur : `localStorage` + abonnés), un registre (`music-registry`) qui expose le choix à l'interface. L'interface `MusicProvider` de la spec **n'est pas extraite ici** : avec Spotify seul, elle serait spéculative ; elle sera extraite dans le plan de la phase 2, avec deux implémentations réelles.

**Tech Stack:** TypeScript, React 18, Vitest + jsdom, WXT.

**Spec:** `docs/superpowers/specs/2026-10-02-tidal-design.md`

## Global Constraints

- Textes de l'interface en français, casse de phrase ; glyphes plutôt que texte quand c'est possible (`Glyph`).
- Cibles tactiles de 44 px (`SIZE` / `choice`) ; tout reste visible à l'écran (extension ET APK).
- Spotify : comportement inchangé ; `listens-v1` reste la clé du dépôt Spotify, sans migration.
- Aucun Client Secret nulle part ; aucune dépendance nouvelle.
- Commandes : tests `npx vitest run <fichier>` ; contrôle global `npm test`, `npm run typecheck`, `npm run build`.
- Chaque tâche finit par un commit (message en français, préfixe `feat:`/`refactor:`/`test:`), avec la ligne `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: `ListenRepo` avec clé de stockage choisie

**Files:**
- Modify: `src/core/music/listen-repo.ts`
- Test: `tests/core/music/listen-repo.test.ts`

**Interfaces:**
- Consumes: `KeyValueStore` (`src/core/cache/store`).
- Produces: `createListenRepo(store: KeyValueStore, now?: () => number, key?: string)` ; `key` vaut `'listens-v1'` par défaut. Un dépôt ne lit ni n'écrit jamais la clé d'un autre.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin du `describe` de `tests/core/music/listen-repo.test.ts` (avant la dernière `});`) :

```ts
  it('deux dépôts de clés différentes ne se mélangent pas et se conservent côte à côte', async () => {
    const store = createMemoryStore();
    const spotify = createListenRepo(store);
    const tidal = createListenRepo(store, () => Date.now(), 'listens-tidal-v1');
    await spotify.save('Abbey_Road', album);
    expect((await tidal.load()).has('Abbey_Road')).toBe(false);
    await tidal.save('Abbey_Road', artist);
    expect((await spotify.load()).get('Abbey_Road')).toEqual(album);
    expect((await tidal.load()).get('Abbey_Road')).toEqual(artist);
    expect(await store.get('listens-v1')).toBeTruthy();
    expect(await store.get('listens-tidal-v1')).toBeTruthy();
  });
```

- [ ] **Step 2: Vérifier qu'il échoue**

Run: `npx vitest run tests/core/music/listen-repo.test.ts`
Expected: FAIL (le troisième argument est ignoré : le dépôt Tidal lit la clé de Spotify, donc `has('Abbey_Road')` vaut `true`).

- [ ] **Step 3: Implémentation minimale**

Dans `src/core/music/listen-repo.ts`, remplacer `const KEY = 'listens-v1';` par :

```ts
// Clé du dépôt Spotify ; chaque autre plateforme a la sienne (`listens-tidal-v1`) : délier ou changer de plateforme n'en efface aucune.
export const SPOTIFY_LISTENS_KEY = 'listens-v1';
```

puis la signature et les usages :

```ts
export function createListenRepo(store: KeyValueStore, now: () => number = () => Date.now(), key: string = SPOTIFY_LISTENS_KEY) {
```

et remplacer `store.get<ListenState>(KEY)` par `store.get<ListenState>(key)` et `store.set(KEY, …)` par `store.set(key, …)`. Mettre à jour le commentaire de `Stored` : « Ce que la plateforme a répondu pour une carte… ».

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run tests/core/music/listen-repo.test.ts tests/content/music-service.test.ts`
Expected: PASS (tous).

- [ ] **Step 5: Commit**

```bash
git add src/core/music/listen-repo.ts tests/core/music/listen-repo.test.ts
git commit -m "refactor: le dépôt des listes d'écoute prend sa clé de stockage (une par plateforme)"
```

---

### Task 2: Réglage « plateforme » mémorisé

**Files:**
- Create: `src/core/music/platform.ts`
- Test: `tests/core/music/platform.test.ts`

**Interfaces:**
- Produces:
  - `type Platform = 'spotify' | 'tidal'`
  - `PLATFORM_LABEL: Record<Platform, string>` (`'Spotify'`, `'Tidal'`)
  - `type PlatformSetting = { current(): Platform; set(next: Platform): void; subscribe(listener: () => void): () => void }`
  - `createPlatformSetting(storage: Pick<Storage, 'getItem' | 'setItem'>): PlatformSetting` — clé `wmt:musicPlatform`, défaut `'spotify'`, valeur inconnue ou stockage inaccessible → `'spotify'`.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createPlatformSetting } from '../../../src/core/music/platform';

const memory = (initial?: string) => {
  const data = new Map<string, string>(initial === undefined ? [] : [['wmt:musicPlatform', initial]]);
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
};

describe('createPlatformSetting', () => {
  it('vaut Spotify par défaut et pour une valeur inconnue', () => {
    expect(createPlatformSetting(memory()).current()).toBe('spotify');
    expect(createPlatformSetting(memory('deezer')).current()).toBe('spotify');
  });

  it('retrouve le choix mémorisé', () => {
    expect(createPlatformSetting(memory('tidal')).current()).toBe('tidal');
  });

  it('mémorise le choix et prévient les abonnés une seule fois par changement', () => {
    const storage = memory();
    const setting = createPlatformSetting(storage);
    const listener = vi.fn();
    setting.subscribe(listener);
    setting.set('tidal');
    setting.set('tidal');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(createPlatformSetting(storage).current()).toBe('tidal');
  });

  it("se désabonne, et résiste à un stockage inaccessible", () => {
    const broken = {
      getItem: () => {
        throw new Error('refusé');
      },
      setItem: () => {
        throw new Error('refusé');
      },
    };
    const setting = createPlatformSetting(broken);
    expect(setting.current()).toBe('spotify');
    const listener = vi.fn();
    const off = setting.subscribe(listener);
    off();
    setting.set('tidal');
    expect(setting.current()).toBe('tidal');
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Vérifier qu'il échoue**

Run: `npx vitest run tests/core/music/platform.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Implémentation minimale**

`src/core/music/platform.ts` :

```ts
// Les plateformes d'écoute des cartes musique ; une seule est active à la fois, leurs résultats ne se mélangent jamais.
export type Platform = 'spotify' | 'tidal';

export const PLATFORM_LABEL: Record<Platform, string> = { spotify: 'Spotify', tidal: 'Tidal' };

const KEY = 'wmt:musicPlatform';

export type PlatformSetting = {
  current(): Platform;
  set(next: Platform): void;
  subscribe(listener: () => void): () => void;
};

export function createPlatformSetting(storage: Pick<Storage, 'getItem' | 'setItem'>): PlatformSetting {
  const listeners = new Set<() => void>();
  let current: Platform = 'spotify';
  try {
    const stored = storage.getItem(KEY);
    if (stored === 'spotify' || stored === 'tidal') current = stored;
  } catch {
    // Stockage inaccessible : Spotify.
  }
  return {
    current: () => current,
    set(next) {
      if (next === current) return;
      current = next;
      try {
        storage.setItem(KEY, next);
      } catch {
        // Le choix vaut pour cette page seulement.
      }
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run tests/core/music/platform.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/music/platform.ts tests/core/music/platform.test.ts
git commit -m "feat: réglage de la plateforme d'écoute (Spotify par défaut), mémorisé"
```

---

### Task 3: Retirer « Délier » de la fiche « Écouter »

**Files:**
- Modify: `src/content/ListenSection.tsx:148-164`
- Test: `tests/content/listen-section.test.tsx`

**Interfaces:**
- Consumes: rien de neuf. Le bouton Lier / Délier de `PlayerSettings` (Plus → Lecteur) reste l'unique endroit pour délier.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin de `tests/content/listen-section.test.tsx` :

```tsx
describe('ListenSection, déliaison', () => {
  const labels = () => [...container.querySelectorAll('button')].map((button) => button.getAttribute('aria-label'));

  it('ne propose jamais de délier le compte (réservé à Plus, Lecteur)', async () => {
    serviceOf(vi.fn().mockResolvedValue(ready('Come Together')));
    await render();
    expect(labels()).toContain('Lire Come Together');
    expect(labels()).not.toContain('Délier Spotify');
  });

  it("garde « Lier » quand le compte n'est pas lié", async () => {
    serviceOf(vi.fn().mockResolvedValue({ status: 'unlinked' }));
    await render();
    expect(labels()).toContain('Lier Spotify pour écouter');
  });
});
```

- [ ] **Step 2: Vérifier qu'il échoue**

Run: `npx vitest run tests/content/listen-section.test.tsx`
Expected: FAIL sur « ne propose jamais de délier » (`Délier Spotify` est présent).

- [ ] **Step 3: Implémentation minimale**

Dans `src/content/ListenSection.tsx`, remplacer le bloc `<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}> … </div>` (lignes 148-164) par :

```tsx
          {view.listen.kind === 'artist' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                aria-label={REFRESH_LABEL}
                title={REFRESH_LABEL}
                style={{ ...iconButton, opacity: refreshing ? 0.3 : 0.6, cursor: refreshing ? 'default' : 'pointer' }}
              >
                <Glyph name="refresh" size={14} />
              </button>
            </div>
          )}
```

Le bouton `unlink` disparaît ; `service.unlink` reste utilisé par `PlayerSettings`.

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run tests/content/listen-section.test.tsx tests/content/listen-refresh.test.tsx tests/content/listen-rate-limit.test.tsx`
Expected: PASS (les tests existants du bouton d'actualisation d'un artiste restent verts).

- [ ] **Step 5: Commit**

```bash
git add src/content/ListenSection.tsx tests/content/listen-section.test.tsx
git commit -m "feat: la fiche « Écouter » ne propose plus de délier (réservé à Plus → Lecteur)"
```

---

### Task 4: Sélecteur de plateforme dans Plus → Lecteur

**Files:**
- Modify: `src/content/music-registry.ts`
- Modify: `src/content/PlayerSettings.tsx`
- Modify: `src/app/overlay.ts` (bloc Spotify, vers les lignes 306-336)
- Test: `tests/content/player-settings.test.tsx`

**Interfaces:**
- Consumes: `Platform`, `PLATFORM_LABEL`, `PlatformSetting`, `createPlatformSetting` (Task 2).
- Produces (dans `music-registry.ts`) :
  - `type PlatformChoice = { available: readonly Platform[]; setting: PlatformSetting }`
  - `setPlatformChoice(next: PlatformChoice | null): void`, `getPlatformChoice(): PlatformChoice | null`
- Comportement : le sélecteur n'apparaît que si `available.length > 1` ; avec Spotify seul (cas de l'overlay à l'issue de cette phase) l'écran est identique à aujourd'hui. Les libellés « Lier/Délier {plateforme} » et « Compte {plateforme} : lié/non lié » suivent la plateforme choisie.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `tests/content/player-settings.test.tsx` : ajouter aux imports

```tsx
import { createPlatformSetting } from '../../src/core/music/platform';
import { setPlatformChoice } from '../../src/content/music-registry';
```

(`setMusicService` est déjà importé depuis `music-registry` : fusionner en un seul import), puis, dans le `afterEach` existant, ajouter `setPlatformChoice(null);` (le lire d'abord pour y placer la ligne). Ajouter à la fin du fichier :

```tsx
describe('PlayerSettings, plateforme', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
  };
  const group = () => container.querySelector('[aria-label="Plateforme d’écoute"]');

  it("n'affiche aucun sélecteur quand une seule plateforme existe", async () => {
    serve();
    setPlatformChoice({ available: ['spotify'], setting: createPlatformSetting(memory()) });
    await render(makeSource(false).source);
    expect(group()).toBeNull();
    expect(byLabel('Lier Spotify')).not.toBeNull();
  });

  it('propose les plateformes disponibles, mémorise le choix et en suit le nom', async () => {
    serve();
    const setting = createPlatformSetting(memory());
    setPlatformChoice({ available: ['spotify', 'tidal'], setting });
    await render(makeSource(false).source);
    expect(group()).not.toBeNull();
    const tidal = [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Plateforme d’écoute"] button')].find((button) => button.textContent === 'Tidal');
    await press(tidal ?? null);
    expect(setting.current()).toBe('tidal');
    expect(text()).toContain('Compte Tidal : non lié');
    expect(byLabel('Lier Tidal')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `npx vitest run tests/content/player-settings.test.tsx`
Expected: FAIL (`setPlatformChoice` n'existe pas).

- [ ] **Step 3: Implémentation**

`src/content/music-registry.ts` — ajouter en tête l'import `import type { Platform, PlatformSetting } from '../core/music/platform';` et à la fin :

```ts
// Les plateformes d'écoute fournies par cette installation et celle qui est choisie : le réglage « Lecteur » en fait un sélecteur dès qu'il y en a deux.
export type PlatformChoice = { available: readonly Platform[]; setting: PlatformSetting };
let choice: PlatformChoice | null = null;

export const setPlatformChoice = (next: PlatformChoice | null): void => {
  choice = next;
};
export const getPlatformChoice = (): PlatformChoice | null => choice;
```

`src/content/PlayerSettings.tsx` :
- imports : `import { PLATFORM_LABEL, type Platform } from '../core/music/platform';` et `getPlatformChoice` depuis `./music-registry`.
- Dans le composant, après `const service = getMusicService();` :

```tsx
  const platformChoice = getPlatformChoice();
  const noSubscribe = () => () => undefined;
  const platform: Platform = useSyncExternalStore(platformChoice?.setting.subscribe ?? noSubscribe, platformChoice?.setting.current ?? (() => 'spotify' as const));
  const name = PLATFORM_LABEL[platform];
```

(placer `noSubscribe` hors du composant, au niveau du module, pour garder une référence stable) ; remplacer `const accountLabel = linked ? 'Délier Spotify' : 'Lier Spotify';` par `const accountLabel = `${linked ? 'Délier' : 'Lier'} ${name}`;` ; remplacer le texte `Compte Spotify : {linked ? 'lié' : 'non lié'}.` par `Compte {name} : {linked ? 'lié' : 'non lié'}.` ; dans le paragraphe d'aide `Affiché, il reste visible tant que Spotify est lié` → `tant que {name} est lié`.
- Avant le bloc `{service && (`, ajouter :

```tsx
        {platformChoice && platformChoice.available.length > 1 && (
          <div role="group" aria-label="Plateforme d’écoute" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {platformChoice.available.map((candidate) => (
              <button key={candidate} type="button" aria-pressed={candidate === platform} onClick={() => platformChoice.setting.set(candidate)} style={choice(candidate === platform)}>
                {PLATFORM_LABEL[candidate]}
              </button>
            ))}
          </div>
        )}
```

(le nom local `choice` de la fonction de style existante entre en collision avec la variable de registre : dans `PlayerSettings.tsx` la variable est nommée `platformChoice`, pas `choice`).

`src/app/overlay.ts` — importer `createPlatformSetting` et `setPlatformChoice`, et dans le bloc `if (spotify) { try { … } }`, juste après `setPlayerSource(player);` :

```ts
      // Une seule plateforme pour l'instant : le sélecteur reste caché ; Tidal l'ajoutera à `available`.
      setPlatformChoice({ available: ['spotify'], setting: createPlatformSetting(window.localStorage) });
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run tests/content/player-settings.test.tsx` puis `npm test` et `npm run typecheck`
Expected: PASS partout, aucune erreur de types.

- [ ] **Step 5: Commit**

```bash
git add src/content/music-registry.ts src/content/PlayerSettings.tsx src/app/overlay.ts tests/content/player-settings.test.tsx
git commit -m "feat: sélecteur de plateforme d'écoute dans Plus → Lecteur (caché tant qu'une seule existe)"
```

---

### Task 5: Vérification complète et livraison

**Files:** aucun nouveau.

- [ ] **Step 1:** `npm test` — Expected : tout passe.
- [ ] **Step 2:** `npm run typecheck` — Expected : aucune erreur.
- [ ] **Step 3:** `npm run build` — Expected : build WXT réussi.
- [ ] **Step 4:** Pousser la branche, ouvrir la PR (corps : résumé des 4 changements, ce qui reste — phases 2 et 3 —, et la mention que la vérification manuelle dans Chrome reste à faire), puis la fusionner (routine du projet : PR ouverte ET fusionnée sans demander).
- [ ] **Step 5:** Mettre à jour la mémoire du projet (décisions Tidal, abandon d'Amazon Music, restes manuels).

## Auto-revue

- Spec « sélecteur Spotify/Tidal » → Task 2 + 4 (caché tant qu'une seule plateforme).
- Spec « Délier seulement dans Plus → Lecteur » → Task 3 (+ bouton existant de `PlayerSettings`).
- Spec « données par plateforme jamais perdues » → Task 1 (clé par plateforme, `listens-v1` intact). Le déliement ne touche que le jeton (vérifié dans `spotify-session.ts`).
- Hors de cette phase, par choix : interface `MusicProvider`, liaison/API/lecture Tidal (plans suivants).
