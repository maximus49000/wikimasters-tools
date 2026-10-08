# Clé Spotify personnelle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque utilisateur saisit son propre Client ID Spotify ; les comptes déjà liés gardent l'ancien identifiant par migration ; un mode d'emploi WikiHow guide la création de l'application Spotify.

**Architecture:** Le Client ID devient un réglage du `KeyValueStore` (`spotify-client-id`). `createSpotifySession` le lit à chaque opération. Une migration au démarrage copie l'ancien identifiant quand un compte est lié. Un contrôle `SpotifyKeyControl`, enregistré dans `music-registry`, alimente un nouveau composant de la fenêtre « Lecteur » ; le `MusicService` et Tidal ne changent pas.

**Tech Stack:** TypeScript, React 18, Vitest (+ jsdom), WXT (extension), Vite (APK).

**Spec:** `docs/superpowers/specs/2026-10-08-spotify-cle-personnelle-design.md` (décision au plan : le lien « Mode d'emploi » est dans la fenêtre de saisie et lance la visite guidée de l'étape `SPOTIFY_KEY_GUIDE`, en texte seul, par-dessus la fenêtre « Lecteur »).

## Global Constraints

- Clé du réglage : `spotify-client-id` ; format : exactement 32 caractères hexadécimaux, `trim()` + minuscules.
- La constante actuelle devient `LEGACY_SPOTIFY_CLIENT_ID` (valeur inchangée `30d88341188741668651e8ab170849cb`), utilisée uniquement par la migration.
- Migration : clé absente **et** `spotify-session` non nul → copier l'ancien identifiant ; sinon ne rien faire ; idempotente.
- Délier ne touche jamais la clé. Remplacer ou effacer la clé délie le compte lié, après confirmation ; sans compte lié, application immédiate. Même clé = aucun effet.
- Sans clé : `link()` lève `SpotifyError('no-client-id')` sans aucun appel réseau.
- Textes en français, phrases courtes, tutoiement dans les messages d'erreur existants (« Lie ton compte… »), vouvoiement dans les fiches WikiHow.
- Extension ET mobile : même composant, glyphes plutôt que du texte, boutons d'au moins 40 px de haut, `aria-label` et `title` partout.
- Le Client ID n'est jamais envoyé à la mesure d'usage ni journalisé.
- Une fiche WikiHow modifiée prend un nouvel `id` ; chaque étape : `text` > 60 caractères, au moins 2 `details` de plus de 20 caractères.
- Commandes : `npm test`, `npm run typecheck`, `npm run build`.

---

### Task 1: Validation, migration et code d'erreur

**Files:**
- Modify: `src/core/spotify/config.ts`
- Create: `src/core/spotify/client-id.ts`
- Modify: `src/core/spotify/errors.ts`
- Test: `tests/core/spotify/client-id.test.ts`

**Interfaces:**
- Produces: `LEGACY_SPOTIFY_CLIENT_ID`, `CLIENT_ID_KEY = 'spotify-client-id'`, `SESSION_KEY = 'spotify-session'` (config.ts) ; `normalizeClientId(value: string): string | null`, `migrateClientId(store: KeyValueStore): Promise<void>` (client-id.ts) ; code d'erreur `'no-client-id'`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/spotify/client-id.test.ts
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { CLIENT_ID_KEY, LEGACY_SPOTIFY_CLIENT_ID, SESSION_KEY } from '../../../src/core/spotify/config';
import { migrateClientId, normalizeClientId } from '../../../src/core/spotify/client-id';
import { SpotifyError, userMessage } from '../../../src/core/spotify/errors';

const tokens = { accessToken: 'A', refreshToken: 'R', expiresAt: 1 };

describe('normalizeClientId', () => {
  it('accepte 32 caractères hexadécimaux, en ignorant espaces et majuscules', () => {
    expect(normalizeClientId('  30D88341188741668651E8AB170849CB \n')).toBe('30d88341188741668651e8ab170849cb');
  });
  it('refuse tout le reste', () => {
    for (const bad of ['', 'abc', '30d88341188741668651e8ab170849c', '30d88341188741668651e8ab170849cbb', 'g0d88341188741668651e8ab170849cb']) {
      expect(normalizeClientId(bad), bad).toBeNull();
    }
  });
});

describe('migrateClientId', () => {
  it('compte lié sans clé : garde l’ancien identifiant', async () => {
    const store = createMemoryStore();
    await store.set(SESSION_KEY, tokens);
    await migrateClientId(store);
    expect(await store.get(CLIENT_ID_KEY)).toBe(LEGACY_SPOTIFY_CLIENT_ID);
  });
  it('nouvelle installation ou compte délié : aucune clé', async () => {
    const store = createMemoryStore();
    await migrateClientId(store);
    expect(await store.get(CLIENT_ID_KEY)).toBeUndefined();
    await store.set(SESSION_KEY, null);
    await migrateClientId(store);
    expect(await store.get(CLIENT_ID_KEY)).toBeUndefined();
  });
  it('ne remplace jamais une clé déjà enregistrée, et se répète sans effet', async () => {
    const store = createMemoryStore();
    await store.set(SESSION_KEY, tokens);
    await store.set(CLIENT_ID_KEY, 'a'.repeat(32));
    await migrateClientId(store);
    await migrateClientId(store);
    expect(await store.get(CLIENT_ID_KEY)).toBe('a'.repeat(32));
  });
});

describe('no-client-id', () => {
  it('a un message qui invite à ajouter sa clé', () => {
    expect(userMessage(new SpotifyError('no-client-id', 'x'))).toBe('Ajoute ta clé Spotify pour lier ton compte.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/spotify/client-id.test.ts`
Expected: FAIL (modules / exports introuvables).

- [ ] **Step 3: Write minimal implementation**

`src/core/spotify/config.ts` : remplacer les deux premières lignes (commentaire + `SPOTIFY_CLIENT_ID`) par :

```ts
// Ancien identifiant partagé de l'application Spotify de Wikimasters : il ne sert plus qu'à conserver la liaison des
// installations qui l'utilisaient déjà (voir client-id.ts). Chacun saisit désormais sa propre clé (PKCE : aucun secret côté client).
export const LEGACY_SPOTIFY_CLIENT_ID = '30d88341188741668651e8ab170849cb';
// Réglage local : la clé Spotify de l'utilisateur. Jamais effacée par « Délier ».
export const CLIENT_ID_KEY = 'spotify-client-id';
// Jetons du compte lié.
export const SESSION_KEY = 'spotify-session';
```

`src/core/spotify/client-id.ts` :

```ts
import type { KeyValueStore } from '../cache/store';
import { CLIENT_ID_KEY, LEGACY_SPOTIFY_CLIENT_ID, SESSION_KEY } from './config';

const CLIENT_ID = /^[0-9a-f]{32}$/;

// Un Client ID Spotify fait 32 caractères hexadécimaux ; on tolère espaces autour et majuscules (copier-coller).
export function normalizeClientId(value: string): string | null {
  const id = value.trim().toLowerCase();
  return CLIENT_ID.test(id) ? id : null;
}

// Les installations dont le compte est lié ont des jetons émis pour l'ancien identifiant : elles le gardent comme clé.
// Les autres (nouvelle installation, compte délié) n'ont pas de clé et doivent saisir la leur.
export async function migrateClientId(store: KeyValueStore): Promise<void> {
  if (await store.get<string | null>(CLIENT_ID_KEY)) return;
  if (await store.get(SESSION_KEY)) await store.set(CLIENT_ID_KEY, LEGACY_SPOTIFY_CLIENT_ID);
}
```

`src/core/spotify/errors.ts` : ajouter `'no-client-id'` au type `SpotifyErrorCode` et, dans `MESSAGES`, `'no-client-id': 'Ajoute ta clé Spotify pour lier ton compte.',`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/spotify/client-id.test.ts`
Expected: PASS. (`typecheck` échouera tant que la tâche 2 n'a pas remplacé `SPOTIFY_CLIENT_ID` : normal, ne pas lancer avant.)

- [ ] **Step 5: Commit**

```bash
git add src/core/spotify/config.ts src/core/spotify/client-id.ts src/core/spotify/errors.ts tests/core/spotify/client-id.test.ts
git commit -m "feat(spotify): validation de la clé personnelle, migration et erreur no-client-id"
```

---

### Task 2: La session lit la clé du réglage

**Files:**
- Modify: `src/core/spotify/spotify-session.ts`
- Modify: `tests/core/spotify/spotify-session.test.ts`

**Interfaces:**
- Consumes: `CLIENT_ID_KEY`, `SESSION_KEY`, `normalizeClientId` (tâche 1).
- Produces sur la session : `clientId(): Promise<string | null>` ; `setClientId(value: string): Promise<'saved' | 'invalid' | 'unlinked' | 'same'>` (`unlinked` = un compte lié a été délié) ; `clearClientId(): Promise<void>` ; `subscribe` notifie aussi ces changements.

- [ ] **Step 1: Write the failing tests**

Dans `tests/core/spotify/spotify-session.test.ts`, modifier `setup` pour préremplir la clé (le `set` du store mémoire s'exécute de façon synchrone) et exposer le store :

```ts
const KEY = '30d88341188741668651e8ab170849cb';

function setup(overrides: { fetch?: ...; authorize?: ...; key?: string | null } = {}) {
  // (corps existant) ...
  const store = createMemoryStore();
  if (overrides.key !== null) void store.set('spotify-client-id', overrides.key ?? KEY);
  const session = createSpotifySession({
    store,
    // (reste inchangé)
  });
  return { session, store, fetch, authorize, advance: (ms: number) => (time += ms) };
}
```

(Conserver les types existants des paramètres `fetch`/`authorize` ; ne changer que `key` et `store`.) Ajouter à la fin du `describe` :

```ts
  it('utilise la clé personnelle dans l’autorisation et dans l’échange des jetons', async () => {
    const mine = 'a'.repeat(32);
    const { session, fetch, authorize } = setup({ key: mine });
    await session.link();
    expect(new URL(authorize.mock.calls[0]![0] as string).searchParams.get('client_id')).toBe(mine);
    expect(new URLSearchParams((fetch.mock.calls[0]![1] as RequestInit).body as string).get('client_id')).toBe(mine);
  });

  it('sans clé : refuse de lier, sans aucun appel réseau', async () => {
    const { session, fetch, authorize } = setup({ key: null });
    await expect(session.link()).rejects.toMatchObject({ code: 'no-client-id' });
    expect(authorize).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('délier garde la clé', async () => {
    const { session } = setup();
    await session.link();
    await session.unlink();
    expect(await session.isLinked()).toBe(false);
    expect(await session.clientId()).toBe(KEY);
  });

  it('première clé : enregistrée sans rien délier ; clé invalide : refusée', async () => {
    const { session } = setup({ key: null });
    expect(await session.setClientId('pas une clé')).toBe('invalid');
    expect(await session.clientId()).toBeNull();
    expect(await session.setClientId(` ${'B'.repeat(32)} `)).toBe('saved');
    expect(await session.clientId()).toBe('b'.repeat(32));
  });

  it('même clé : aucun effet, le compte reste lié', async () => {
    const { session } = setup();
    await session.link();
    expect(await session.setClientId(KEY)).toBe('same');
    expect(await session.isLinked()).toBe(true);
  });

  it('autre clé ou clé effacée : le compte lié est délié, les abonnés sont prévenus', async () => {
    const { session } = setup();
    const heard = vi.fn();
    session.subscribe(heard);
    await session.link();
    heard.mockClear();
    expect(await session.setClientId('c'.repeat(32))).toBe('unlinked');
    expect(await session.isLinked()).toBe(false);
    expect(await session.clientId()).toBe('c'.repeat(32));
    expect(heard).toHaveBeenCalled();

    await session.link();
    await session.clearClientId();
    expect(await session.isLinked()).toBe(false);
    expect(await session.clientId()).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/spotify/spotify-session.test.ts`
Expected: FAIL (`clientId` / `setClientId` absents, import de `SPOTIFY_CLIENT_ID` cassé).

- [ ] **Step 3: Write minimal implementation**

Dans `src/core/spotify/spotify-session.ts` :

- Imports : `import { ACCOUNTS_URL, CLIENT_ID_KEY, SESSION_KEY, SPOTIFY_SCOPES } from './config';` et `import { normalizeClientId } from './client-id';`. Supprimer `const KEY = 'spotify-session';` et remplacer partout `KEY` par `SESSION_KEY`.
- Ajouter dans `createSpotifySession`, avant `requestTokens` :

```ts
  // La clé est relue à chaque opération : un autre onglet peut l'avoir changée.
  const readClientId = async (): Promise<string | null> => (await store.get<string | null>(CLIENT_ID_KEY)) ?? null;
```

- `requestTokens(clientId: string, params)` : `client_id: clientId`.
- `refresh(current)` : au début,

```ts
    const clientId = await readClientId();
    if (!clientId) {
      await unlink();
      throw new SpotifyError('not-linked', 'Clé Spotify absente');
    }
    const response = await requestTokens(clientId, { grant_type: 'refresh_token', refresh_token: current.refreshToken });
```

- `link()` : après `const state = ...` :

```ts
      const clientId = await readClientId();
      if (!clientId) throw new SpotifyError('no-client-id', 'Aucune clé Spotify enregistrée');
```
  puis `buildAuthUrl({ clientId, ... })` et `requestTokens(clientId, { grant_type: 'authorization_code', ... })`.
- Ajouter à l'objet retourné :

```ts
    clientId: readClientId,

    // Enregistre la clé de l'utilisateur. Les jetons appartiennent à l'ancienne clé : changer de clé délie le compte.
    async setClientId(value: string): Promise<'saved' | 'invalid' | 'unlinked' | 'same'> {
      const id = normalizeClientId(value);
      if (!id) return 'invalid';
      if ((await readClientId()) === id) return 'same';
      await store.set(CLIENT_ID_KEY, id);
      const wasLinked = Boolean(await store.get(SESSION_KEY));
      if (wasLinked) await store.set<Tokens | null>(SESSION_KEY, null);
      notify();
      return wasLinked ? 'unlinked' : 'saved';
    },

    async clearClientId(): Promise<void> {
      await store.set<string | null>(CLIENT_ID_KEY, null);
      await store.set<Tokens | null>(SESSION_KEY, null);
      notify();
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/spotify tests/content/music-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/spotify/spotify-session.ts tests/core/spotify/spotify-session.test.ts
git commit -m "feat(spotify): la session utilise la clé personnelle, la change et l'efface"
```

---

### Task 3: Contrôle de la clé et branchement de la surcouche

**Files:**
- Modify: `src/content/music-registry.ts`
- Modify: `src/app/overlay.ts` (autour des lignes 535-600 ; import de `startTour` depuis `../content/tour-instance` et de `SPOTIFY_KEY_GUIDE` depuis `../core/whats-new/entries`)
- Modify: `src/content/Glyphs.tsx` (4 glyphes)
- Test: `tests/content/music-registry.test.ts` (nouveau)

**Interfaces:**
- Consumes: session (tâche 2), `migrateClientId` (tâche 1).
- Produces: type `SpotifyKeyControl = { clientId(): Promise<string | null>; setClientId(value: string): Promise<'saved' | 'invalid' | 'unlinked' | 'same'>; clearClientId(): Promise<void>; redirectUris(): Promise<string[]>; openGuide(): void; subscribe(listener: () => void): () => void }` ; `setSpotifyKey(next: SpotifyKeyControl | null)`, `getSpotifyKey(): SpotifyKeyControl | null` ; glyphes `copy`, `trash`, `edit`, `save`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/content/music-registry.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { getSpotifyKey, setSpotifyKey, type SpotifyKeyControl } from '../../src/content/music-registry';

afterEach(() => setSpotifyKey(null));

describe('contrôle de la clé Spotify', () => {
  it('est absent par défaut, puis lu là où il est enregistré', () => {
    expect(getSpotifyKey()).toBeNull();
    const control = {} as SpotifyKeyControl;
    setSpotifyKey(control);
    expect(getSpotifyKey()).toBe(control);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/music-registry.test.ts`
Expected: FAIL (exports absents).

- [ ] **Step 3: Write minimal implementation**

`music-registry.ts`, à la fin :

```ts
// La clé Spotify de l'utilisateur (son propre Client ID) : la fenêtre « Lecteur » la lit et la modifie ici.
// Absent quand la plateforme ne fournit pas Spotify.
export type SpotifyKeyControl = {
  clientId(): Promise<string | null>;
  // `unlinked` : le compte lié a été délié parce que la clé a changé ; `same` : rien à faire.
  setClientId(value: string): Promise<'saved' | 'invalid' | 'unlinked' | 'same'>;
  clearClientId(): Promise<void>;
  // Adresses de retour à déclarer chez Spotify (Redirect URI).
  redirectUris(): Promise<string[]>;
  // Lance le mode d'emploi (visite guidée en texte seul) ; la fenêtre « Lecteur » reste ouverte dessous.
  openGuide(): void;
  subscribe(listener: () => void): () => void;
};
let spotifyKey: SpotifyKeyControl | null = null;

export const setSpotifyKey = (next: SpotifyKeyControl | null): void => {
  spotifyKey = next;
};
export const getSpotifyKey = (): SpotifyKeyControl | null => spotifyKey;
```

`overlay.ts` :
- Imports : `migrateClientId` depuis `'../core/spotify/client-id'`, `setSpotifyKey` ajouté à l'import de `'../content/music-registry'`.
- Dans le `try` Spotify, juste avant `const session = createSpotifySession(...)` : `await migrateClientId(store);`
- Juste après `setPlatformChoice({ available: ['spotify'], setting: platformSetting });` :

```ts
      setSpotifyKey({
        clientId: () => session.clientId(),
        setClientId: (value) => session.setClientId(value),
        clearClientId: () => session.clearClientId(),
        redirectUris: async () => [await spotify.redirectUri()],
        openGuide: () => startTour([SPOTIFY_KEY_GUIDE]),
        subscribe: (listener) => session.subscribe(listener),
      });
```

`Glyphs.tsx` : insérer avant l'entrée `  book: (` :

```tsx
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  edit: <path d="M4 20l1-4L16 5l3 3L8 19z" />,
  save: (
    <>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8 4v5h7V4" />
      <rect x="8" y="14" width="8" height="6" />
    </>
  ),
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/content/music-registry.test.ts && npm run typecheck`
Expected: PASS, aucune erreur de type.

- [ ] **Step 5: Commit**

```bash
git add src/content/music-registry.ts src/app/overlay.ts src/content/Glyphs.tsx tests/content/music-registry.test.ts
git commit -m "feat(spotify): contrôle de la clé branché sur la surcouche, migration au démarrage"
```

---

### Task 4: Interface de la clé dans la fenêtre « Lecteur »

**Files:**
- Create: `src/content/SpotifyKeySettings.tsx`
- Modify: `src/content/PlayerSettings.tsx`
- Test: `tests/content/spotify-key-settings.test.tsx` (nouveau)

**Interfaces:**
- Consumes: `getSpotifyKey`, `SpotifyKeyControl` (tâche 3), `normalizeClientId` (tâche 1), glyphes `copy trash edit save` (tâche 3).
- Produces: `useSpotifyKey(): { control: SpotifyKeyControl | null; key: string | null | undefined }` (`undefined` = chargement) ; `SpotifyKeySettings({ linked }: { linked: boolean })`.

Libellés d'accessibilité utilisés par les tests (à respecter à l'identique) : `Ouvrir le mode d’emploi`, `Enregistrer ma clé Spotify`, `Remplacer ma clé Spotify`, `Effacer ma clé Spotify`, `Annuler`, `Remplacer et délier`, `Effacer et délier`, `Copier l’adresse de retour`. Champ : `<input aria-label="Clé Spotify (Client ID)">`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/content/spotify-key-settings.test.tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerSettings } from '../../src/content/PlayerSettings';
import { setMusicService, setPlatformChoice, setSpotifyKey, type SpotifyKeyControl } from '../../src/content/music-registry';
import type { MusicService } from '../../src/content/music-service';
import type { PlayerSource, PlayerView } from '../../src/content/player-source';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = '30d88341188741668651e8ab170849cb';
let container: HTMLDivElement;
let root: Root;

function makeSource(linked: boolean) {
  const view: PlayerView = { linked, track: null, hidden: false, enabled: true, card: null };
  return { current: () => view, subscribe: () => () => undefined, setEnabled: vi.fn() } as unknown as PlayerSource;
}

function serve(initial: string | null) {
  let key = initial;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const control = {
    clientId: vi.fn(async () => key),
    setClientId: vi.fn(async (value: string) => {
      key = value;
      notify();
      return 'saved' as const;
    }),
    clearClientId: vi.fn(async () => {
      key = null;
      notify();
    }),
    redirectUris: vi.fn(async () => ['https://abc.chromiumapp.org/spotify', 'wikimasterstools://spotify']),
    openGuide: vi.fn(),
    subscribe: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)),
  };
  setSpotifyKey(control as unknown as SpotifyKeyControl);
  const link = vi.fn(async () => null);
  setMusicService({ link, unlink: vi.fn(async () => undefined), isLinked: vi.fn(async () => false), view: vi.fn(), play: vi.fn(), subscribe: () => () => undefined } as unknown as MusicService);
  return { control, link };
}

const render = async (linked: boolean) => {
  await act(async () => {
    root.render(<PlayerSettings source={makeSource(linked)} onClose={() => undefined} />);
  });
};
const byLabel = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const field = () => container.querySelector<HTMLInputElement>('input[aria-label="Clé Spotify (Client ID)"]');
const text = () => container.textContent ?? '';
const press = (button: HTMLButtonElement | null) => act(async () => void button?.click());
const type = (value: string) =>
  act(async () => {
    const input = field()!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setMusicService(null);
  setPlatformChoice(null);
  setSpotifyKey(null);
});

describe('clé Spotify dans le Lecteur', () => {
  it('sans clé : champ, adresses à déclarer, lien vers le mode d’emploi ; Lier explique au lieu de lier', async () => {
    const { link, control } = serve(null);
    await render(false);
    expect(field()).not.toBeNull();
    expect(text()).toContain('wikimasterstools://spotify');
    await press(byLabel('Ouvrir le mode d’emploi'));
    expect(control.openGuide).toHaveBeenCalledTimes(1);
    await press(byLabel('Lier Spotify'));
    expect(link).not.toHaveBeenCalled();
    expect(text()).toContain('Ajoutez d’abord votre clé');
  });

  it('refuse une clé invalide, enregistre une clé valide', async () => {
    const { control } = serve(null);
    await render(false);
    await type('trop court');
    await press(byLabel('Enregistrer ma clé Spotify'));
    expect(control.setClientId).not.toHaveBeenCalled();
    expect(text()).toContain('Clé invalide');
    await type(KEY);
    await press(byLabel('Enregistrer ma clé Spotify'));
    expect(control.setClientId).toHaveBeenCalledWith(KEY);
    expect(field()).toBeNull();
    expect(byLabel('Remplacer ma clé Spotify')).not.toBeNull();
  });

  it('clé enregistrée : affichée tronquée, Lier fonctionne', async () => {
    const { link } = serve(KEY);
    await render(false);
    expect(text()).toContain('30d88341…70849cb');
    await press(byLabel('Lier Spotify'));
    expect(link).toHaveBeenCalledTimes(1);
  });

  it('le mode d’emploi reste accessible pendant un remplacement de clé', async () => {
    const { control } = serve(KEY);
    await render(false);
    expect(byLabel('Ouvrir le mode d’emploi')).toBeNull();
    await press(byLabel('Remplacer ma clé Spotify'));
    await press(byLabel('Ouvrir le mode d’emploi'));
    expect(control.openGuide).toHaveBeenCalledTimes(1);
  });

  it('compte non lié : remplacer et effacer s’appliquent tout de suite', async () => {
    const { control } = serve(KEY);
    await render(false);
    await press(byLabel('Remplacer ma clé Spotify'));
    await type('a'.repeat(32));
    await press(byLabel('Enregistrer ma clé Spotify'));
    expect(control.setClientId).toHaveBeenCalledWith('a'.repeat(32));
    await press(byLabel('Effacer ma clé Spotify'));
    expect(control.clearClientId).toHaveBeenCalledTimes(1);
  });

  it('compte lié : remplacer et effacer demandent confirmation, annuler ne change rien', async () => {
    const { control } = serve(KEY);
    await render(true);
    await press(byLabel('Remplacer ma clé Spotify'));
    await type('a'.repeat(32));
    await press(byLabel('Enregistrer ma clé Spotify'));
    expect(control.setClientId).not.toHaveBeenCalled();
    expect(text()).toContain('délie votre compte');
    await press(byLabel('Annuler'));
    expect(control.setClientId).not.toHaveBeenCalled();

    await press(byLabel('Effacer ma clé Spotify'));
    expect(control.clearClientId).not.toHaveBeenCalled();
    await press(byLabel('Effacer et délier'));
    expect(control.clearClientId).toHaveBeenCalledTimes(1);
  });

  it('compte lié : confirmer le remplacement enregistre la nouvelle clé', async () => {
    const { control } = serve(KEY);
    await render(true);
    await press(byLabel('Remplacer ma clé Spotify'));
    await type('a'.repeat(32));
    await press(byLabel('Enregistrer ma clé Spotify'));
    await press(byLabel('Remplacer et délier'));
    expect(control.setClientId).toHaveBeenCalledWith('a'.repeat(32));
  });

  it('sans contrôle (plateforme sans clé) : rien n’est affiché et Lier marche comme avant', async () => {
    setSpotifyKey(null);
    const link = vi.fn(async () => null);
    setMusicService({ link, unlink: vi.fn(), isLinked: vi.fn(async () => false), view: vi.fn(), play: vi.fn(), subscribe: () => () => undefined } as unknown as MusicService);
    await render(false);
    expect(field()).toBeNull();
    await press(byLabel('Lier Spotify'));
    expect(link).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/spotify-key-settings.test.tsx`
Expected: FAIL (aucun champ de clé dans l'interface).

- [ ] **Step 3: Write minimal implementation**

`src/content/SpotifyKeySettings.tsx` :

```tsx
import { useEffect, useState } from 'react';
import { Glyph, type GlyphName } from './Glyphs';
import { getSpotifyKey, type SpotifyKeyControl } from './music-registry';
import { normalizeClientId } from '../core/spotify/client-id';
import { track } from '../core/telemetry/registry';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

const button = {
  flex: 1,
  minHeight: 44,
  cursor: 'pointer',
  font: '600 14px system-ui, sans-serif',
  color: 'inherit',
  background: 'none',
  border,
  borderRadius: 8,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
} as const;

// La clé enregistrée (`undefined` pendant le chargement, `null` quand il n'y en a pas) ; suit les changements.
export function useSpotifyKey(): { control: SpotifyKeyControl | null; key: string | null | undefined } {
  const control = getSpotifyKey();
  const [key, setKey] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!control) return;
    let cancelled = false;
    const load = () => void control.clientId().then((value) => !cancelled && setKey(value));
    load();
    const off = control.subscribe(load);
    return () => {
      cancelled = true;
      off();
    };
  }, [control]);
  return { control, key: control ? key : null };
}

const masked = (key: string): string => `${key.slice(0, 8)}…${key.slice(-7)}`;

type Pending = { kind: 'replace'; value: string } | { kind: 'clear' } | null;

function Btn({ label, glyph, onClick, text }: { label: string; glyph?: GlyphName; onClick: () => void; text?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} style={button}>
      {glyph && <Glyph name={glyph} />} {text ?? ''}
    </button>
  );
}

// Le Client ID de l'application Spotify de l'utilisateur : saisi une fois, jamais effacé par « Délier ».
// Remplacer ou effacer la clé délie le compte (ses jetons appartiennent à l'ancienne clé) : on demande confirmation.
export function SpotifyKeySettings({ linked }: { linked: boolean }) {
  const { control, key } = useSpotifyKey();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uris, setUris] = useState<string[]>([]);

  useEffect(() => {
    if (!control) return;
    let cancelled = false;
    void control.redirectUris().then((value) => !cancelled && setUris(value));
    return () => {
      cancelled = true;
    };
  }, [control]);

  if (!control || key === undefined) return null;

  const showForm = key === null || editing;
  const reset = () => {
    setEditing(false);
    setDraft('');
    setPending(null);
  };

  const save = async () => {
    const id = normalizeClientId(draft);
    if (!id) {
      setMessage('Clé invalide : 32 caractères, chiffres et lettres de a à f.');
      return;
    }
    setMessage(null);
    if (key && id === key) return reset();
    if (key && linked) return setPending({ kind: 'replace', value: id });
    await control.setClientId(id);
    track('reglage-modifie', 'lecteur');
    reset();
  };

  const confirm = async () => {
    if (pending?.kind === 'replace') await control.setClientId(pending.value);
    if (pending?.kind === 'clear') await control.clearClientId();
    track('reglage-modifie', 'lecteur');
    reset();
  };

  const clear = async () => {
    if (linked) return setPending({ kind: 'clear' });
    await control.clearClientId();
    track('reglage-modifie', 'lecteur');
    reset();
  };

  const copy = (uri: string) => {
    try {
      void navigator.clipboard.writeText(uri).catch(() => undefined);
    } catch {
      // Presse-papiers indisponible : l'adresse reste affichée, on la copie à la main.
    }
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: border }}>
      <p style={{ margin: '0 0 8px', opacity: 0.8 }}>Votre clé Spotify (Client ID)</p>
      {showForm ? (
        <>
          <input
            aria-label="Clé Spotify (Client ID)"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="32 caractères, ex. 30d88341…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 10px', borderRadius: 8, border, background: 'transparent', color: 'inherit', font: '13px ui-monospace, monospace' }}
          />
          {pending ? null : (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Btn label="Enregistrer ma clé Spotify" glyph="save" text="Enregistrer" onClick={() => void save()} />
              {key && <Btn label="Annuler" onClick={reset} text="Annuler" />}
            </div>
          )}
          <div style={{ display: 'flex', marginTop: 8 }}>
            <Btn label="Ouvrir le mode d’emploi" glyph="book" text="Mode d’emploi : créer ma clé" onClick={() => control.openGuide()} />
          </div>
          <p style={{ margin: '12px 0 4px', fontSize: 12, opacity: 0.8 }}>À déclarer chez Spotify (Redirect URI) :</p>
          {uris.map((uri) => (
            <div key={uri} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '4px 4px 4px 10px', border, borderRadius: 8 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', font: '12px ui-monospace, monospace' }}>{uri}</span>
              <button type="button" onClick={() => copy(uri)} aria-label="Copier l’adresse de retour" title="Copier l’adresse de retour" style={{ ...button, flex: 'none', width: 44 }}>
                <Glyph name="copy" />
              </button>
            </div>
          ))}
        </>
      ) : (
        <>
          <div style={{ padding: '10px', border, borderRadius: 8, font: '13px ui-monospace, monospace' }}>{masked(key)}</div>
          {!pending && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Btn label="Remplacer ma clé Spotify" glyph="edit" text="Remplacer" onClick={() => setEditing(true)} />
              <Btn label="Effacer ma clé Spotify" glyph="trash" text="Effacer" onClick={() => void clear()} />
            </div>
          )}
        </>
      )}
      {pending && (
        <>
          <p role="alert" style={{ margin: '8px 0 0', padding: '8px 10px', borderRadius: 8, border: '1px solid #9e6a03', fontSize: 12 }}>
            {pending.kind === 'replace' ? 'Une autre clé' : 'Effacer la clé'} délie votre compte Spotify. Vous devrez le lier de nouveau.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Btn label="Annuler" text="Annuler" onClick={reset} />
            <Btn label={pending.kind === 'replace' ? 'Remplacer et délier' : 'Effacer et délier'} text={pending.kind === 'replace' ? 'Remplacer et délier' : 'Effacer et délier'} onClick={() => void confirm()} />
          </div>
        </>
      )}
      {message && (
        <p role="status" style={{ margin: '8px 0 0', fontSize: 12 }}>
          {message}
        </p>
      )}
    </div>
  );
}
```

`PlayerSettings.tsx` :
- Import : `import { SpotifyKeySettings, useSpotifyKey } from './SpotifyKeySettings';`
- Après `const linked = ...;` ajouter :

```tsx
  // Spotify sans clé : on n'ouvre pas la fenêtre d'autorisation, on explique quoi faire.
  const { control: keyControl, key: spotifyKey } = useSpotifyKey();
  const needsKey = platform === 'spotify' && Boolean(keyControl) && spotifyKey === null && !linked;
```
- Dans `link` : après `if (!service) return;` ajouter :

```tsx
    if (needsKey) {
      setMessage('Ajoutez d’abord votre clé Spotify.');
      return;
    }
```
- Rendre `<SpotifyKeySettings linked={linked} />` juste avant `{service && (` (uniquement si `platform === 'spotify'`) : `{platform === 'spotify' && <SpotifyKeySettings linked={linked} />}`.
- Sur le bouton Lier/Délier, ajouter dans `style` : `opacity: needsKey ? 0.5 : 1`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/content/spotify-key-settings.test.tsx tests/content/player-settings.test.tsx`
Expected: PASS (les anciens tests passent car sans contrôle enregistré rien ne change).

- [ ] **Step 5: Commit**

```bash
git add src/content/SpotifyKeySettings.tsx src/content/PlayerSettings.tsx tests/content/spotify-key-settings.test.tsx
git commit -m "feat(spotify): saisie, remplacement et effacement de la clé dans le Lecteur"
```

---

### Task 5: Mode d'emploi WikiHow

**Files:**
- Modify: `src/core/whats-new/entries.ts` (fiche `ecouter`, ligne ~307 ; nouvelle constante exportée `SPOTIFY_KEY_GUIDE`)
- Test: `tests/core/whats-new/entries.test.ts` (ajout)

**Interfaces:**
- Consumes: rien. Produces: fiche `ecouter-v2` (nouvel id : elle est annoncée dans « Quoi de neuf ») et `export const SPOTIFY_KEY_GUIDE: TourStep` (étape en texte seul : `target: null`, sans `scene`, pour pouvoir être lancée seule depuis la fenêtre « Lecteur »).

- [ ] **Step 1: Write the failing test**

Ajouter dans `tests/core/whats-new/entries.test.ts` (importer `SPOTIFY_KEY_GUIDE` avec `ENTRIES`) :

```ts
  it('explique comment utiliser sa propre clé Spotify (fiche écoute à jour, ancien id retiré)', () => {
    expect(ENTRIES.some((e) => e.id === 'ecouter')).toBe(false);
    const entry = ENTRIES.find((e) => e.id === 'ecouter-v2');
    const step = entry?.steps.find((s) => s.title === 'Utiliser sa propre clé Spotify');
    expect(step).toBe(SPOTIFY_KEY_GUIDE);
    expect(step?.target).toBeNull();
    expect(step?.scene).toBeUndefined();
    const all = (step?.details ?? []).map((d) => d.text).join(' ') + ' ' + (step?.text ?? '');
    for (const word of ['developer.spotify.com', 'Redirect URI', 'Client ID', 'User Management', '25']) expect(all, word).toContain(word);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/whats-new/entries.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Dans `entries.ts`, avant `export const ENTRIES`, ajouter la constante ci-dessous (importer le type `TourStep` : `import type { Entry, TourStep } from './types';`), puis changer `id: 'ecouter',` en `id: 'ecouter-v2',` et insérer `SPOTIFY_KEY_GUIDE,` à la suite de l'étape « Lier votre compte, choisir la plateforme » (après sa fermeture `},`) :

```ts
export const SPOTIFY_KEY_GUIDE: TourStep = {
        target: null,
        title: 'Utiliser sa propre clé Spotify',
        text: 'Spotify limite l’application partagée à quelques utilisateurs : chacun crée sa propre application Spotify, gratuite, et colle son Client ID dans Paramètre d’extension, puis Lecteur.',
        details: [
          { label: 'Créer sa clé, pas à pas', text: '1. Créez un compte Spotify, puis ouvrez developer.spotify.com/dashboard. 2. « Create app », cochez « Web API ». 3. Dans « Redirect URI », collez les adresses affichées par l’extension dans Lecteur (bouton copier). 4. Enregistrez, puis copiez le « Client ID ». 5. Dans « User Management » de l’application, ajoutez l’adresse e-mail de votre compte Spotify. 6. Collez le Client ID dans Lecteur, puis « Lier Spotify ».' },
          { label: 'Limites', text: 'Une application Spotify en mode développement accepte 25 utilisateurs au plus, que vous ajoutez à la main. Lancer la lecture demande Spotify Premium. Spotify peut aussi demander de patienter : l’extension affiche alors l’heure de reprise.' },
          { label: 'Ce que devient votre clé', text: 'La clé reste sur votre appareil et n’est jamais envoyée ailleurs. « Délier » la conserve. En changer ou l’effacer délie votre compte, qu’il faudra lier de nouveau. Si vous étiez déjà lié avant cette mise à jour, votre clé est déjà enregistrée.' },
        ],
      };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/whats-new`
Expected: PASS (règles didactiques incluses).

- [ ] **Step 5: Commit**

```bash
git add src/core/whats-new/entries.ts tests/core/whats-new/entries.test.ts
git commit -m "docs(wikihow): mode d'emploi pour utiliser sa propre clé Spotify"
```

---

### Task 6: Vérification complète et livraison

**Files:** aucun nouveau (mémoire du projet à mettre à jour à la fin).

- [ ] **Step 1: Suite complète**

Run: `npm run typecheck && npm test`
Expected: aucune erreur de type, tous les tests passent. Corriger toute régression avant de continuer (chercher aussi `SPOTIFY_CLIENT_ID` : `grep -rn "SPOTIFY_CLIENT_ID" src tests` ne doit plus rien renvoyer).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 3: Pousser, ouvrir et fusionner la PR (routine du dépôt, sans demander)**

```bash
git push -u origin feat/spotify-cle-personnelle
gh pr create --title "feat(spotify): clé Spotify personnelle" --body "Chacun saisit son propre Client ID Spotify (contourne la limite du mode développement). Migration : les comptes déjà liés gardent l'ancien identifiant. Mode d'emploi WikiHow. Spec : docs/superpowers/specs/2026-10-08-spotify-cle-personnelle-design.md"
gh pr merge --merge
```

(Ajouter la ligne d'attribution Claude Code au corps de la PR, comme pour les autres.) Ensuite : `get_status` / `bind_pr` des outils `ccd_pr` si la PR n'est pas rapportée.

- [ ] **Step 4: Pré-prod**

Run: `npm run preprod`
Expected: publication réussie (le dépôt livre tout en pré-prod après fusion ; la production ne se fait que sur ordre explicite).

- [ ] **Step 5: Mémoire**

Mettre à jour `project_spotify.md` (clé personnelle, migration, délier garde la clé) et l'index `MEMORY.md`. Reste à faire côté humain : vérification manuelle dans Chrome (recharger l'extension, saisir une clé personnelle, lier) et APK à la demande.
