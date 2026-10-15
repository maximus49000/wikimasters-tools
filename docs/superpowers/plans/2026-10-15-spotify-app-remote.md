# Lecture Spotify par le SDK Android App Remote — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sur l'APK, lancer, mettre en pause et suivre la musique par le SDK Spotify App Remote (Spotify joue, Wikimasters reste devant), avec repli sur la Web API quand le SDK est indisponible.

**Architecture:** Une classe Java `SpotifyRemote` enveloppe le SDK ; `MainActivity` l'expose à la page sous `WmtSpotifyRemote`. Côté page, le pont `src/android/spotify-remote.ts` transforme les rappels en promesses ; la couche `src/core/spotify/remote-playback.ts` imite `play` / `pause` / `playerState` de la Web API et décide SDK ou repli. `spotify-api.ts` ne change pas ; la surcouche choisit la couche lecture quand `SpotifyEnv.remote` existe (APK seulement).

**Tech Stack:** TypeScript, React, Vitest (jsdom pour les composants), Java 17 / Android (minSdk 30), SDK `spotify-app-remote-release-0.8.0.aar`, Gson.

**Spec:** `docs/superpowers/specs/2026-10-15-spotify-app-remote-design.md`

## Global Constraints

- Branche `fix/spotify-app-remote`, partie de `origin/production` ; ne jamais y fusionner `main`.
- Extension (ordinateur) : aucun changement de comportement.
- SDK : `spotify-app-remote-release-0.8.0.aar` (release `v0.8.0-appremote_v2.1.0-auth` de `spotify/android-sdk`, SHA-256 `b5a6dd880eaf01f63a871cba9ef7af77c341f8a94ffc8fdf2e9021f9a9d4c198`) dans `android/app/libs/`.
- Signature inchangée : `signingConfig = debug` (empreinte `C2:21:A4:37:FA:93:03:8C:31:B1:61:D1:B5:49:68:A9:C1:26:F3:9E`, jamais codée en dur : lue par `PackageManager`).
- Codes d'erreur SDK, exactement : `not-installed`, `not-logged-in`, `not-authorized`, `unsupported`, `failed`.
- Délais du pont : 60 s pour `connect`, 10 s pour le reste.
- File d'attente : 10 titres au plus après le premier.
- Le SDK ne passe jamais par la file d'appels ni par les pauses par famille de `spotify-api.ts`.
- Textes de l'écran Lecteur, exactement ceux de la spec (section 3).
- Tests : ne jouer que les familles touchées (`npx vitest run <fichiers>`), pas toute la suite, sauf à la tâche finale (`npm test`, exigé par `npm run corriger`).
- Commits en français, `feat(spotify): …` / `fix(spotify): …` ; le commit final de la fonction est un `fix(spotify): …` (il alimente l'onglet Corrections).

## Review Focus

1. **Album long ou multi-disques** : `offsetIndex` vient de la position dans `listen.items` (50 pistes au plus, `albumTracks`). Au-delà de 50 pistes, la position est fausse → si le titre n'est pas dans la liste, ne pas envoyer d'`offsetIndex` (lecture du contexte depuis le début plutôt qu'un mauvais titre). Test en tâche 3.
2. **Clic répété sur ▶ pendant la connexion** (écran d'accord Spotify ouvert) : deux `play` simultanés ne doivent ouvrir qu'une connexion. Test en tâche 4 (« connexion partagée »).
3. **Retour au premier plan après `onStop`** : l'état poussé « déconnecté » doit faire repasser `playerState` sur la Web API, sans afficher l'ancien titre comme « en cours ». Test en tâche 4 (« déconnexion »).
4. **Délier pendant une lecture SDK** : le statut repart à `untried` et le SDK est déconnecté ; le ▶ suivant ne doit pas réutiliser l'ancienne clé. Test en tâche 4.
5. **Ancien APK (sans `WmtSpotifyRemote`) avec la nouvelle surcouche** : tout passe par la Web API, et l'écran Lecteur n'affiche pas le bloc. Tests en tâches 1 et 6.

---

### Task 1: Types du SDK et pont page ↔ Android (côté page)

**Files:**
- Create: `src/core/spotify/remote-types.ts`
- Create: `src/android/spotify-remote.ts`
- Modify: `src/core/spotify/transport.ts` (type `SpotifyEnv`)
- Modify: `src/android/spotify-env.ts` (fournit `remote`)
- Test: `tests/android/spotify-remote.test.ts`, `tests/android/spotify-env.test.ts`

**Interfaces:**
- Produces:
  - `type RemoteErrorCode = 'not-installed' | 'not-logged-in' | 'not-authorized' | 'unsupported' | 'failed'`
  - `class RemoteError extends Error { readonly code: RemoteErrorCode }`
  - `type RemoteTrack = { uri: string; title: string; artist: string; imageUrl: string | null; playing: boolean }`
  - `type RemoteEvent = { connected: false } | { connected: true; track: RemoteTrack | null }`
  - `type SpotifyRemote = { connect(clientId, redirectUri): Promise<void>; play(uri): Promise<void>; skipToIndex(contextUri, index): Promise<void>; queue(uri): Promise<void>; pause(): Promise<void>; resume(): Promise<void>; disconnect(): void; onEvent(listener): () => void; packageName(): string; fingerprint(): string }`
  - `createAndroidSpotifyRemote(win: RemoteWindow, timeouts?: { connect: number; call: number }): SpotifyRemote | undefined`
  - `SpotifyEnv.remote?: SpotifyRemote`

- [ ] **Step 1: Write the failing tests**

`tests/android/spotify-remote.test.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAndroidSpotifyRemote, type RemoteWindow } from '../../src/android/spotify-remote';
import { RemoteError } from '../../src/core/spotify/remote-types';

function fakeWindow() {
  const bridge = {
    connect: vi.fn(),
    play: vi.fn(),
    skipToIndex: vi.fn(),
    queue: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    disconnect: vi.fn(),
    packageName: vi.fn(() => 'io.github.maximus49000.wikimasterstools'),
    fingerprint: vi.fn(() => 'C2:21'),
  };
  const win: RemoteWindow = { WmtSpotifyRemote: bridge };
  return { win, bridge };
}

describe('createAndroidSpotifyRemote', () => {
  afterEach(() => vi.useRealTimers());

  it('rend undefined sans pont (ancien APK)', () => {
    expect(createAndroidSpotifyRemote({})).toBeUndefined();
  });

  it('résout un appel quand Android répond sans erreur, avec un identifiant propre à chaque appel', async () => {
    const { win, bridge } = fakeWindow();
    const remote = createAndroidSpotifyRemote(win)!;
    const first = remote.play('spotify:track:A');
    const second = remote.queue('spotify:track:B');
    const firstId = bridge.play.mock.calls[0]![0] as string;
    const secondId = bridge.queue.mock.calls[0]![0] as string;
    expect(firstId).not.toBe(secondId);
    expect(bridge.play).toHaveBeenCalledWith(firstId, 'spotify:track:A');
    win.__wmtSpotifyRemoteDone!(secondId, '');
    win.__wmtSpotifyRemoteDone!(firstId, '');
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });

  it('rejette avec le code reçu ; un code inconnu devient failed', async () => {
    const { win, bridge } = fakeWindow();
    const remote = createAndroidSpotifyRemote(win)!;
    const denied = remote.connect('client', 'wikimasterstools://spotify');
    expect(bridge.connect).toHaveBeenCalledWith(expect.any(String), 'client', 'wikimasterstools://spotify');
    win.__wmtSpotifyRemoteDone!(bridge.connect.mock.calls[0]![0] as string, 'not-authorized');
    await expect(denied).rejects.toMatchObject({ code: 'not-authorized' });
    const odd = remote.pause();
    win.__wmtSpotifyRemoteDone!(bridge.pause.mock.calls[0]![0] as string, 'bizarre');
    await expect(odd).rejects.toBeInstanceOf(RemoteError);
    await expect(odd).rejects.toMatchObject({ code: 'failed' });
  });

  it('abandonne après le délai : 60 s pour connect, 10 s pour le reste', async () => {
    vi.useFakeTimers();
    const { win } = fakeWindow();
    const remote = createAndroidSpotifyRemote(win)!;
    const connect = remote.connect('client', 'wikimasterstools://spotify');
    const play = remote.play('spotify:track:A');
    const connectFailed = expect(connect).rejects.toMatchObject({ code: 'failed' });
    const playFailed = expect(play).rejects.toMatchObject({ code: 'failed' });
    await vi.advanceTimersByTimeAsync(10_000);
    await playFailed;
    let settled = false;
    void connect.catch(() => (settled = true));
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(50_000);
    await connectFailed;
  });

  it('rejette failed si le pont lève', async () => {
    const { win, bridge } = fakeWindow();
    bridge.resume.mockImplementation(() => {
      throw new Error('boum');
    });
    await expect(createAndroidSpotifyRemote(win)!.resume()).rejects.toMatchObject({ code: 'failed' });
  });

  it('transmet skipToIndex avec la position', async () => {
    const { win, bridge } = fakeWindow();
    const remote = createAndroidSpotifyRemote(win)!;
    const done = remote.skipToIndex('spotify:album:X', 3);
    expect(bridge.skipToIndex).toHaveBeenCalledWith(expect.any(String), 'spotify:album:X', 3);
    win.__wmtSpotifyRemoteDone!(bridge.skipToIndex.mock.calls[0]![0] as string, '');
    await done;
  });

  it("diffuse l'état poussé par Android ; ignore un JSON illisible", () => {
    const { win } = fakeWindow();
    const remote = createAndroidSpotifyRemote(win)!;
    const seen: unknown[] = [];
    const off = remote.onEvent((event) => seen.push(event));
    win.__wmtSpotifyRemoteState!(JSON.stringify({ connected: true, track: { uri: 'spotify:track:A', title: 'T', artist: 'X, Y', imageUrl: 'https://i.scdn.co/image/ab', playing: true } }));
    win.__wmtSpotifyRemoteState!(JSON.stringify({ connected: true, track: null }));
    win.__wmtSpotifyRemoteState!(JSON.stringify({ connected: false }));
    win.__wmtSpotifyRemoteState!('{pas du json');
    off();
    win.__wmtSpotifyRemoteState!(JSON.stringify({ connected: false }));
    expect(seen).toEqual([
      { connected: true, track: { uri: 'spotify:track:A', title: 'T', artist: 'X, Y', imageUrl: 'https://i.scdn.co/image/ab', playing: true } },
      { connected: true, track: null },
      { connected: false },
    ]);
  });

  it('lit le paquet et l’empreinte de façon synchrone', () => {
    const { win } = fakeWindow();
    const remote = createAndroidSpotifyRemote(win)!;
    expect(remote.packageName()).toBe('io.github.maximus49000.wikimasterstools');
    expect(remote.fingerprint()).toBe('C2:21');
  });
});
```

Ajouter dans `tests/android/spotify-env.test.ts`, dans le `describe` existant :

```ts
  it('fournit la lecture par le SDK seulement quand le pont WmtSpotifyRemote existe', () => {
    expect(createAndroidSpotifyEnv(fakeWindow()).remote).toBeUndefined();
    const win = { ...fakeWindow(), WmtSpotifyRemote: { connect: vi.fn(), play: vi.fn(), skipToIndex: vi.fn(), queue: vi.fn(), pause: vi.fn(), resume: vi.fn(), disconnect: vi.fn(), packageName: () => 'p', fingerprint: () => 'f' } };
    expect(createAndroidSpotifyEnv(win as never).remote?.packageName()).toBe('p');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/android/spotify-remote.test.ts tests/android/spotify-env.test.ts`
Expected: FAIL (module `spotify-remote` introuvable, `remote` absent).

- [ ] **Step 3: Write `src/core/spotify/remote-types.ts`**

```ts
// Lecture par l'appli Spotify du téléphone (SDK Android App Remote) : ce que la surcouche en voit, quelle que soit la plateforme.
export type RemoteErrorCode = 'not-installed' | 'not-logged-in' | 'not-authorized' | 'unsupported' | 'failed';

export class RemoteError extends Error {
  constructor(readonly code: RemoteErrorCode) {
    super(`Spotify (appli) : ${code}`);
    this.name = 'RemoteError';
  }
}

export type RemoteTrack = { uri: string; title: string; artist: string; imageUrl: string | null; playing: boolean };
// `connected: false` : le SDK n'est plus relié (application en arrière-plan, Spotify arrêté) ; la Web API reprend la main.
export type RemoteEvent = { connected: false } | { connected: true; track: RemoteTrack | null };

export type SpotifyRemote = {
  // Ouvre au besoin l'écran d'accord de Spotify (la première fois) ; Spotify démarre en arrière-plan.
  connect(clientId: string, redirectUri: string): Promise<void>;
  play(uri: string): Promise<void>;
  skipToIndex(contextUri: string, index: number): Promise<void>;
  queue(uri: string): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  disconnect(): void;
  onEvent(listener: (event: RemoteEvent) => void): () => void;
  // Nom du paquet de l'APK installé et empreinte SHA-1 de son certificat : à déclarer chez Spotify (Android packages).
  packageName(): string;
  fingerprint(): string;
};
```

- [ ] **Step 4: Write `src/android/spotify-remote.ts`**

```ts
import { RemoteError, type RemoteErrorCode, type RemoteEvent, type SpotifyRemote } from '../core/spotify/remote-types';

// Ce que MainActivity.java expose à la page : chaque appel porte un identifiant ; Android répond par
// `window.__wmtSpotifyRemoteDone(id, codeErreur)` (code vide = réussite) et pousse l'état par `window.__wmtSpotifyRemoteState(json)`.
export type RemoteWindow = {
  WmtSpotifyRemote?: {
    connect(id: string, clientId: string, redirectUri: string): void;
    play(id: string, uri: string): void;
    skipToIndex(id: string, contextUri: string, index: number): void;
    queue(id: string, uri: string): void;
    pause(id: string): void;
    resume(id: string): void;
    disconnect(): void;
    packageName(): string;
    fingerprint(): string;
  };
  __wmtSpotifyRemoteDone?: (id: string, error: string) => void;
  __wmtSpotifyRemoteState?: (json: string) => void;
};

// La connexion peut attendre l'accord de l'utilisateur dans Spotify ; le reste est local au téléphone.
const TIMEOUTS = { connect: 60_000, call: 10_000 };
const CODES: readonly RemoteErrorCode[] = ['not-installed', 'not-logged-in', 'not-authorized', 'unsupported', 'failed'];
const codeOf = (raw: string): RemoteErrorCode => CODES.find((code) => code === raw) ?? 'failed';

function parseEvent(json: string): RemoteEvent | null {
  try {
    const raw = JSON.parse(json) as { connected?: unknown; track?: Record<string, unknown> | null };
    if (raw.connected !== true) return { connected: false };
    const track = raw.track;
    if (!track || typeof track.uri !== 'string') return { connected: true, track: null };
    return {
      connected: true,
      track: {
        uri: track.uri,
        title: typeof track.title === 'string' ? track.title : '',
        artist: typeof track.artist === 'string' ? track.artist : '',
        imageUrl: typeof track.imageUrl === 'string' && track.imageUrl !== '' ? track.imageUrl : null,
        playing: track.playing === true,
      },
    };
  } catch {
    return null;
  }
}

export function createAndroidSpotifyRemote(win: RemoteWindow, timeouts: { connect: number; call: number } = TIMEOUTS): SpotifyRemote | undefined {
  const bridge = win.WmtSpotifyRemote;
  if (!bridge) return undefined;
  const pending = new Map<string, (error: string) => void>();
  const listeners = new Set<(event: RemoteEvent) => void>();
  let counter = 0;
  win.__wmtSpotifyRemoteDone = (id, error) => pending.get(id)?.(error);
  win.__wmtSpotifyRemoteState = (json) => {
    const event = parseEvent(json);
    if (event) listeners.forEach((listener) => listener(event));
  };

  function call(timeoutMs: number, send: (id: string) => void): Promise<void> {
    const id = `remote-${(counter += 1)}`;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new RemoteError('failed'));
      }, timeoutMs);
      pending.set(id, (error) => {
        clearTimeout(timer);
        pending.delete(id);
        if (error) reject(new RemoteError(codeOf(error)));
        else resolve();
      });
      try {
        send(id);
      } catch {
        clearTimeout(timer);
        pending.delete(id);
        reject(new RemoteError('failed'));
      }
    });
  }

  return {
    connect: (clientId, redirectUri) => call(timeouts.connect, (id) => bridge.connect(id, clientId, redirectUri)),
    play: (uri) => call(timeouts.call, (id) => bridge.play(id, uri)),
    skipToIndex: (contextUri, index) => call(timeouts.call, (id) => bridge.skipToIndex(id, contextUri, index)),
    queue: (uri) => call(timeouts.call, (id) => bridge.queue(id, uri)),
    pause: () => call(timeouts.call, (id) => bridge.pause(id)),
    resume: () => call(timeouts.call, (id) => bridge.resume(id)),
    disconnect: () => {
      try {
        bridge.disconnect();
      } catch {
        // Pont indisponible : rien à déconnecter.
      }
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    packageName: () => bridge.packageName(),
    fingerprint: () => bridge.fingerprint(),
  };
}
```

- [ ] **Step 5: Brancher `SpotifyEnv.remote`**

Dans `src/core/spotify/transport.ts`, ajouter l'import `import type { SpotifyRemote } from './remote-types';` et, dans `SpotifyEnv` après `redirectUriFor` :

```ts
  // Lecture par l'appli Spotify du téléphone (SDK App Remote) ; absente sur l'ordinateur et sur un ancien APK.
  remote?: SpotifyRemote;
```

Dans `src/android/spotify-env.ts` : `import { createAndroidSpotifyRemote, type RemoteWindow } from './spotify-remote';`, étendre le type `export type AndroidWindow = NativeHttpWindow & RemoteWindow & { … }`, puis dans `createAndroidSpotifyEnv` :

```ts
  const remote = createAndroidSpotifyRemote(win);
  return {
    fetch: nativeFetch,
    ...(remote ? { remote } : {}),
    // (le reste inchangé)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/android/spotify-remote.test.ts tests/android/spotify-env.test.ts`
Expected: PASS. Puis `npm run typecheck` : aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add src/core/spotify/remote-types.ts src/android/spotify-remote.ts src/core/spotify/transport.ts src/android/spotify-env.ts tests/android/spotify-remote.test.ts tests/android/spotify-env.test.ts
git commit -m "feat(spotify): pont de la page vers le SDK App Remote (promesses, délais, état poussé)"
```

---

### Task 2: Côté Android — SDK, classe `SpotifyRemote`, pont `WmtSpotifyRemote`

**Files:**
- Create: `android/app/libs/spotify-app-remote-release-0.8.0.aar`
- Create: `android/app/src/main/java/io/github/maximus49000/wikimasterstools/SpotifyRemote.java`
- Modify: `android/app/build.gradle.kts` (dépendances)
- Modify: `android/app/src/main/AndroidManifest.xml` (`<queries>`)
- Modify: `android/app/src/main/java/io/github/maximus49000/wikimasterstools/MainActivity.java` (pont + `onStart` / `onStop` / `onDestroy`)

**Interfaces:**
- Consumes: le contrat de `RemoteWindow` (tâche 1) : `WmtSpotifyRemote.connect(id, clientId, redirectUri)`, `play(id, uri)`, `skipToIndex(id, contextUri, index)`, `queue(id, uri)`, `pause(id)`, `resume(id)`, `disconnect()`, `packageName()`, `fingerprint()` ; réponses `window.__wmtSpotifyRemoteDone(id, code)` et `window.__wmtSpotifyRemoteState(json)` avec `json` = `{"connected":false}` ou `{"connected":true,"track":null|{uri,title,artist,imageUrl,playing}}`.
- Produces: rien de plus pour les tâches suivantes.

Pas de test unitaire Java dans le projet : la vérification est la compilation de l'APK (step 6) et l'essai sur le téléphone (tâche 8).

- [ ] **Step 1: Ajouter le SDK**

```bash
mkdir -p android/app/libs
gh release download v0.8.0-appremote_v2.1.0-auth -R spotify/android-sdk -p "spotify-app-remote-release-0.8.0.aar" -D android/app/libs --clobber
sha256sum android/app/libs/spotify-app-remote-release-0.8.0.aar
```
Expected: `b5a6dd880eaf01f63a871cba9ef7af77c341f8a94ffc8fdf2e9021f9a9d4c198`. Sinon : arrêter et le signaler.

- [ ] **Step 2: Dépendances Gradle**

Dans `android/app/build.gradle.kts`, bloc `dependencies` :

```kotlin
dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    // Lecture par l'appli Spotify du téléphone (SDK App Remote, github.com/spotify/android-sdk) ; Gson est requis par le SDK.
    implementation(files("libs/spotify-app-remote-release-0.8.0.aar"))
    implementation("com.google.code.gson:gson:2.11.0")
}
```

- [ ] **Step 3: Manifeste**

Dans `AndroidManifest.xml`, juste après les `<uses-permission>` :

```xml
    <!-- Android 11+ cache les autres applications : le SDK App Remote doit voir Spotify. -->
    <queries>
        <package android:name="com.spotify.music" />
    </queries>
```

- [ ] **Step 4: Écrire `SpotifyRemote.java`**

```java
package io.github.maximus49000.wikimasterstools;

import android.app.Activity;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;

import com.spotify.android.appremote.api.ConnectionParams;
import com.spotify.android.appremote.api.Connector;
import com.spotify.android.appremote.api.SpotifyAppRemote;
import com.spotify.android.appremote.api.error.AuthenticationFailedException;
import com.spotify.android.appremote.api.error.CouldNotFindSpotifyApp;
import com.spotify.android.appremote.api.error.NotLoggedInException;
import com.spotify.android.appremote.api.error.UnsupportedFeatureVersionException;
import com.spotify.android.appremote.api.error.UserNotAuthorizedException;
import com.spotify.protocol.client.CallResult;
import com.spotify.protocol.client.Subscription;
import com.spotify.protocol.types.Artist;
import com.spotify.protocol.types.Empty;
import com.spotify.protocol.types.PlayerState;
import com.spotify.protocol.types.Track;

import org.json.JSONObject;

import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;

// Lecture par l'appli Spotify du téléphone (SDK App Remote) : la surcouche pilote, Spotify joue, Wikimasters reste devant.
// Toutes les méthodes s'exécutent sur le fil UI (MainActivity y renvoie les appels du pont ; le SDK y rappelle aussi).
final class SpotifyRemote {
    interface Sink {
        // `error` vide : réussite.
        void done(String id, String error);
        void event(String json);
    }

    private static final String DISCONNECTED = "{\"connected\":false}";
    private static final String IMAGE_PREFIX = "spotify:image:";

    private final Activity activity;
    private final Sink sink;
    private SpotifyAppRemote remote;
    private Subscription<PlayerState> subscription;
    private String clientId;
    private String redirectUri;
    // Une connexion a réussi : reprise silencieuse au retour au premier plan.
    private boolean resumeOnStart;

    SpotifyRemote(Activity activity, Sink sink) {
        this.activity = activity;
        this.sink = sink;
    }

    void connect(String id, String clientId, String redirectUri) {
        if (remote != null && remote.isConnected() && clientId.equals(this.clientId)) {
            sink.done(id, "");
            return;
        }
        drop();
        this.clientId = clientId;
        this.redirectUri = redirectUri;
        open(id, true);
    }

    // `id` null : reconnexion silencieuse, personne n'attend la réponse.
    private void open(String id, boolean showAuthView) {
        ConnectionParams params = new ConnectionParams.Builder(clientId).setRedirectUri(redirectUri).showAuthView(showAuthView).build();
        SpotifyAppRemote.connect(activity, params, new Connector.ConnectionListener() {
            @Override
            public void onConnected(SpotifyAppRemote connected) {
                remote = connected;
                resumeOnStart = true;
                subscription = connected.getPlayerApi().subscribeToPlayerState();
                subscription.setEventCallback(state -> sink.event(stateJson(state)));
                if (id != null) sink.done(id, "");
            }

            @Override
            public void onFailure(Throwable error) {
                // Échec de connexion, ou connexion perdue plus tard (Spotify arrêté).
                remote = null;
                subscription = null;
                sink.event(DISCONNECTED);
                if (id != null) sink.done(id, codeOf(error));
            }
        });
    }

    void play(String id, String uri) {
        run(id, connected() ? remote.getPlayerApi().play(uri) : null);
    }

    void skipToIndex(String id, String contextUri, int index) {
        run(id, connected() ? remote.getPlayerApi().skipToIndex(contextUri, index) : null);
    }

    void queue(String id, String uri) {
        run(id, connected() ? remote.getPlayerApi().queue(uri) : null);
    }

    void pause(String id) {
        run(id, connected() ? remote.getPlayerApi().pause() : null);
    }

    void resume(String id) {
        run(id, connected() ? remote.getPlayerApi().resume() : null);
    }

    // Délier ou changer de clé : plus de reprise automatique.
    void disconnect() {
        resumeOnStart = false;
        drop();
        sink.event(DISCONNECTED);
    }

    void onStart() {
        if (resumeOnStart && remote == null && clientId != null) open(null, false);
    }

    void onStop() {
        if (remote == null) return;
        drop();
        sink.event(DISCONNECTED);
    }

    // Fin de l'activité : la WebView va disparaître, on ne lui écrit plus rien.
    void release() {
        drop();
    }

    String fingerprint() {
        try {
            PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
            Signature[] signers = info.signingInfo.getApkContentsSigners();
            byte[] digest = MessageDigest.getInstance("SHA-1").digest(signers[0].toByteArray());
            StringBuilder out = new StringBuilder();
            for (byte part : digest) {
                if (out.length() > 0) out.append(':');
                out.append(String.format("%02X", part));
            }
            return out.toString();
        } catch (Exception error) {
            return "";
        }
    }

    private boolean connected() {
        return remote != null && remote.isConnected();
    }

    // Pas de connexion : `failed`, la page reconnecte puis se replie sur la Web API.
    private void run(String id, CallResult<Empty> result) {
        if (result == null) {
            sink.done(id, "failed");
            return;
        }
        result.setResultCallback(empty -> sink.done(id, ""));
        result.setErrorCallback(error -> sink.done(id, codeOf(error)));
    }

    private void drop() {
        if (subscription != null) subscription.cancel();
        subscription = null;
        if (remote != null) SpotifyAppRemote.disconnect(remote);
        remote = null;
    }

    static String codeOf(Throwable error) {
        if (error instanceof CouldNotFindSpotifyApp) return "not-installed";
        if (error instanceof NotLoggedInException) return "not-logged-in";
        if (error instanceof UserNotAuthorizedException || error instanceof AuthenticationFailedException) return "not-authorized";
        if (error instanceof UnsupportedFeatureVersionException) return "unsupported";
        return "failed";
    }

    private static String stateJson(PlayerState state) {
        try {
            JSONObject out = new JSONObject().put("connected", true);
            Track track = state == null ? null : state.track;
            if (track == null || track.uri == null) return out.put("track", JSONObject.NULL).toString();
            String raw = track.imageUri == null || track.imageUri.raw == null ? "" : track.imageUri.raw;
            String image = raw.startsWith(IMAGE_PREFIX) ? "https://i.scdn.co/image/" + raw.substring(IMAGE_PREFIX.length()) : "";
            // Mêmes artistes que la Web API (« A, B ») : la page reconnaît le titre en cours dans ses listes.
            List<String> names = new ArrayList<>();
            if (track.artists != null) for (Artist artist : track.artists) if (artist != null && artist.name != null) names.add(artist.name);
            if (names.isEmpty() && track.artist != null && track.artist.name != null) names.add(track.artist.name);
            JSONObject item = new JSONObject()
                    .put("uri", track.uri)
                    .put("title", track.name == null ? "" : track.name)
                    .put("artist", String.join(", ", names))
                    .put("imageUrl", image)
                    .put("playing", !state.isPaused);
            return out.put("track", item).toString();
        } catch (Exception error) {
            return "{\"connected\":true,\"track\":null}";
        }
    }
}
```

- [ ] **Step 5: Brancher `MainActivity.java`**

Champ, à côté de `updater` :

```java
    private SpotifyRemote spotifyRemote;
```

Dans `onCreate`, juste après `webView.addJavascriptInterface(new HttpBridge(), "WmtHttp");` :

```java
        spotifyRemote = new SpotifyRemote(this, new SpotifyRemote.Sink() {
            @Override
            public void done(String id, String error) {
                webView.evaluateJavascript("window.__wmtSpotifyRemoteDone && window.__wmtSpotifyRemoteDone(" + JSONObject.quote(id) + "," + JSONObject.quote(error) + ")", null);
            }

            @Override
            public void event(String json) {
                webView.evaluateJavascript("window.__wmtSpotifyRemoteState && window.__wmtSpotifyRemoteState(" + JSONObject.quote(json) + ")", null);
            }
        });
        webView.addJavascriptInterface(new SpotifyRemoteBridge(), "WmtSpotifyRemote");
```

Classe du pont, après `SpotifyBridge` :

```java
    // Pont « lecture par l'appli Spotify » (SDK App Remote) : seuls des contenus spotify: et l'adresse de retour de ce canal sont acceptés.
    private final class SpotifyRemoteBridge {
        private String clean(String id) {
            return id == null ? "" : id.replaceAll("[^A-Za-z0-9-]", "");
        }

        private boolean spotifyUri(String uri) {
            return uri != null && uri.startsWith("spotify:");
        }

        @JavascriptInterface
        public void connect(String id, String clientId, String redirectUri) {
            String callId = clean(id);
            if (clientId == null || !clientId.matches("[0-9a-f]{32}") || redirectUri == null || !redirectUri.equals(SPOTIFY_REDIRECT_SCHEME + "://spotify")) {
                runOnUiThread(() -> spotifyRemote.notify(callId));
                return;
            }
            runOnUiThread(() -> spotifyRemote.connect(callId, clientId, redirectUri));
        }

        @JavascriptInterface
        public void play(String id, String uri) {
            String callId = clean(id);
            runOnUiThread(() -> {
                if (spotifyUri(uri)) spotifyRemote.play(callId, uri);
                else spotifyRemote.notify(callId);
            });
        }

        @JavascriptInterface
        public void skipToIndex(String id, String contextUri, int index) {
            String callId = clean(id);
            runOnUiThread(() -> {
                if (spotifyUri(contextUri) && index >= 0) spotifyRemote.skipToIndex(callId, contextUri, index);
                else spotifyRemote.notify(callId);
            });
        }

        @JavascriptInterface
        public void queue(String id, String uri) {
            String callId = clean(id);
            runOnUiThread(() -> {
                if (spotifyUri(uri)) spotifyRemote.queue(callId, uri);
                else spotifyRemote.notify(callId);
            });
        }

        @JavascriptInterface
        public void pause(String id) {
            String callId = clean(id);
            runOnUiThread(() -> spotifyRemote.pause(callId));
        }

        @JavascriptInterface
        public void resume(String id) {
            String callId = clean(id);
            runOnUiThread(() -> spotifyRemote.resume(callId));
        }

        @JavascriptInterface
        public void disconnect() {
            runOnUiThread(spotifyRemote::disconnect);
        }

        @JavascriptInterface
        public String packageName() {
            return getPackageName();
        }

        @JavascriptInterface
        public String fingerprint() {
            return spotifyRemote.fingerprint();
        }
    }
```

Ajouter dans `SpotifyRemote.java` (utilisé par le pont pour refuser une entrée invalide) :

```java
    // Entrée refusée par le pont : la page reçoit `failed` et se replie sur la Web API.
    void notify(String id) {
        sink.done(id, "failed");
    }
```

Cycle de vie, dans `MainActivity` :

```java
    // Lecture par l'appli Spotify : reprise silencieuse au retour, déconnexion en arrière-plan (Spotify continue de jouer).
    @Override
    protected void onStart() {
        super.onStart();
        if (spotifyRemote != null) spotifyRemote.onStart();
    }

    @Override
    protected void onStop() {
        if (spotifyRemote != null) spotifyRemote.onStop();
        super.onStop();
    }
```

et dans `onDestroy`, avant `webView.destroy();` : `if (spotifyRemote != null) spotifyRemote.release();`

- [ ] **Step 6: Compiler l'APK**

Run: `node scripts/build-apk.mjs`
Expected: `APK : …/app-production-release.apk (versionCode …)` sans erreur de compilation. (Si `node_modules` manque : `npm ci` d'abord.) L'APK produit n'est pas publié : `livrables/` est ignoré par git.

- [ ] **Step 7: Commit**

```bash
git add android/app/libs/spotify-app-remote-release-0.8.0.aar android/app/build.gradle.kts android/app/src/main/AndroidManifest.xml android/app/src/main/java/io/github/maximus49000/wikimasterstools/SpotifyRemote.java android/app/src/main/java/io/github/maximus49000/wikimasterstools/MainActivity.java
git commit -m "feat(spotify): SDK App Remote côté Android (pont WmtSpotifyRemote, empreinte, cycle de vie)"
```

---

### Task 3: Position dans l'album, voie de lecture, nouveaux codes (service musique, erreurs, suivi)

**Files:**
- Modify: `src/core/spotify/spotify-api.ts:14` (`PlayTarget`)
- Modify: `src/content/music-service.ts` (`play`, deps)
- Modify: `src/core/spotify/errors.ts` (code `app-logged-out`)
- Modify: `src/core/telemetry/catalogue.ts` (`spotify-sdk`, `lecture-sdk`)
- Test: `tests/content/music-service.test.ts`, `tests/core/spotify/errors.test.ts`

**Interfaces:**
- Produces:
  - `PlayTarget = { uris: string[] } | { contextUri: string; offsetUri?: string; offsetIndex?: number } | null`
  - `MusicServiceDeps.playRoute?: () => 'sdk' | 'web-api'`
  - `SpotifyErrorCode` gagne `'app-logged-out'` (message « Connecte-toi dans l’appli Spotify du téléphone. »)
  - catalogue : `ACTIONS['lecture-musique']` = `['spotify', 'tidal', 'spotify-sdk']` ; `ERRORS['lecture-sdk']` = `['not-installed', 'not-logged-in', 'not-authorized', 'unsupported', 'failed']`

- [ ] **Step 1: Write the failing tests**

Dans `tests/content/music-service.test.ts`, ajouter (le `setup()` existant renvoie `api` et `service` ; lui ajouter l'option `playRoute?: () => 'sdk' | 'web-api'` transmise à `createMusicService` sous la forme `...(over.playRoute ? { playRoute: over.playRoute } : {})`) :

```ts
describe('createMusicService.play : position et voie', () => {
  const listen = {
    kind: 'album' as const,
    albumUri: 'spotify:album:A',
    items: [
      { uri: 'spotify:track:1', title: 'Un', artist: 'X' },
      { uri: 'spotify:track:2', title: 'Deux', artist: 'X' },
    ],
  };

  it("donne la position du titre dans l'album (le SDK en a besoin, la Web API l'ignore)", async () => {
    const { api, service } = setup();
    await service.play(listen.items[1]!, listen);
    expect(api.play).toHaveBeenCalledWith({ contextUri: 'spotify:album:A', offsetUri: 'spotify:track:2', offsetIndex: 1 });
  });

  it("sans titre trouvé dans la liste, pas de position (jamais un mauvais titre)", async () => {
    const { api, service } = setup();
    await service.play({ uri: 'spotify:track:99', title: 'Hors liste', artist: 'X' }, listen);
    expect(api.play).toHaveBeenCalledWith({ contextUri: 'spotify:album:A', offsetUri: 'spotify:track:99' });
  });
});
```

Et pour le suivi, dans le même `describe` (le registre se remplace par `setTelemetry`, pas par `vi.spyOn` sur un module ESM) :

```ts
import { setTelemetry } from '../../src/core/telemetry/registry';
import type { Telemetry } from '../../src/core/telemetry/telemetry';
// …
  it('note la voie de lecture : spotify-sdk par le SDK, spotify par la Web API', async () => {
    const track = vi.fn();
    setTelemetry({ track, reportError: vi.fn() } as unknown as Telemetry);
    try {
      const sdk = setup({ playRoute: () => 'sdk' });
      await sdk.service.play(listen.items[0]!, listen);
      expect(track).toHaveBeenLastCalledWith('lecture-musique', 'spotify-sdk');
      const web = setup({ playRoute: () => 'web-api' });
      await web.service.play(listen.items[0]!, listen);
      expect(track).toHaveBeenLastCalledWith('lecture-musique', 'spotify');
    } finally {
      setTelemetry(null);
    }
  });
```

Dans `tests/core/spotify/errors.test.ts` :

```ts
  it('demande de se connecter dans l’appli Spotify du téléphone', () => {
    expect(userMessage(new SpotifyError('app-logged-out', 'x'))).toBe('Connecte-toi dans l’appli Spotify du téléphone.');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/content/music-service.test.ts tests/core/spotify/errors.test.ts`
Expected: FAIL (`offsetIndex` absent, code inconnu, `spotify-sdk` refusé par le typage).

- [ ] **Step 3: Implémenter**

`src/core/spotify/spotify-api.ts`, type `PlayTarget` :

```ts
// `null` : reprendre la lecture en cours.
// `offsetUri` : le titre du contexte (album, playlist) où commencer ; absent, le contexte se lit depuis le début.
// `offsetIndex` : sa position dans le contexte (le SDK du téléphone en a besoin ; la Web API l'ignore).
export type PlayTarget = { uris: string[] } | { contextUri: string; offsetUri?: string; offsetIndex?: number } | null;
```

`src/content/music-service.ts` : dans `MusicServiceDeps`, après `launchApp` :

```ts
  // Par où est partie la dernière lecture (SDK du téléphone ou Web API) ; absent : Web API.
  playRoute?: () => 'sdk' | 'web-api';
```

Dans `play` :

```ts
      const index = listen.items.findIndex((candidate) => candidate.uri === item?.uri);
      const from = Math.max(0, index);
      const target: Parameters<typeof api.play>[0] = listen.albumUri
        ? { contextUri: listen.albumUri, ...(item ? { offsetUri: item.uri } : {}), ...(item && index >= 0 ? { offsetIndex: index } : {}) }
        : { uris: listen.items.length > 0 ? listen.items.slice(from).map((candidate) => candidate.uri) : item ? [item.uri] : [] };
```

et remplacer `track('lecture-musique', 'spotify');` par :

```ts
        track('lecture-musique', deps.playRoute?.() === 'sdk' ? 'spotify-sdk' : 'spotify');
```

`src/core/spotify/errors.ts` : ajouter `| 'app-logged-out'` à `SpotifyErrorCode` et dans `MESSAGES` :

```ts
  'app-logged-out': 'Connecte-toi dans l’appli Spotify du téléphone.',
```

`src/core/telemetry/catalogue.ts` :

```ts
  'lecture-musique': ['spotify', 'tidal', 'spotify-sdk'],
```

et dans `ERRORS`, après `'lecture-echec'` :

```ts
  // Échecs du SDK Spotify du téléphone (APK), avant le repli sur la Web API.
  'lecture-sdk': ['not-installed', 'not-logged-in', 'not-authorized', 'unsupported', 'failed'],
```

(Le relais filtre les événements inconnus un par un, `validateBatch` : tant qu'il n'est pas redéployé avec ce catalogue, ces nouveaux événements sont simplement ignorés.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/content/music-service.test.ts tests/core/spotify/errors.test.ts tests/core/telemetry`
Expected: PASS. Puis `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/core/spotify/spotify-api.ts src/content/music-service.ts src/core/spotify/errors.ts src/core/telemetry/catalogue.ts tests/content/music-service.test.ts tests/core/spotify/errors.test.ts
git commit -m "feat(spotify): position du titre dans l'album, voie de lecture suivie, message « connecte-toi dans l'appli »"
```

---

### Task 4: Couche lecture `remote-playback.ts` (SDK d'abord, repli Web API)

**Files:**
- Create: `src/core/spotify/remote-playback.ts`
- Test: `tests/core/spotify/remote-playback.test.ts`

**Interfaces:**
- Consumes: `SpotifyRemote`, `RemoteError`, `RemoteEvent` (tâche 1) ; `PlayTarget` avec `offsetIndex`, `SpotifyError('app-logged-out')`, `ERRORS['lecture-sdk']` (tâche 3) ; `SpotifyApi` (`play`, `pause`, `playerState`) ; `SpotifySession` (`clientId`, `subscribe`) ; `KeyValueStore`.
- Produces:
  - `type RemoteStatus = 'untried' | 'ok' | 'not-configured' | 'not-installed' | 'outdated'`
  - `type PlayRoute = 'sdk' | 'web-api'`
  - `REMOTE_STATUS_KEY = 'spotify-remote-v1'`, `QUEUE_MAX = 10`
  - `createRemotePlayback(deps: { remote: SpotifyRemote; api: Pick<SpotifyApi, 'play' | 'pause' | 'playerState'>; session: Pick<SpotifySession, 'clientId' | 'subscribe'>; redirectUri: () => Promise<string>; store: KeyValueStore })` → `{ play(target: PlayTarget): Promise<void>; pause(): Promise<void>; playerState(): Promise<PlayerState>; subscribe(listener: () => void): () => void; status(): Promise<RemoteStatus>; reset(): Promise<void>; warm(): void; lastRoute(): PlayRoute }`
  - `type RemotePlayback = ReturnType<typeof createRemotePlayback>`

- [ ] **Step 1: Write the failing tests**

`tests/core/spotify/remote-playback.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createRemotePlayback, REMOTE_STATUS_KEY } from '../../../src/core/spotify/remote-playback';
import { RemoteError, type RemoteEvent, type RemoteErrorCode } from '../../../src/core/spotify/remote-types';
import { SpotifyError } from '../../../src/core/spotify/errors';

const KEY = '30d88341188741668651e8ab170849cb';

function setup(options: { connectError?: RemoteErrorCode[]; status?: string; clientId?: string | null } = {}) {
  const store = createMemoryStore();
  if (options.status) void store.set(REMOTE_STATUS_KEY, { status: options.status });
  const failures = [...(options.connectError ?? [])];
  let push: (event: RemoteEvent) => void = () => undefined;
  const remote = {
    connect: vi.fn(async () => {
      const code = failures.shift();
      if (code) throw new RemoteError(code);
    }),
    play: vi.fn(async () => undefined),
    skipToIndex: vi.fn(async () => undefined),
    queue: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    onEvent: vi.fn((listener: (event: RemoteEvent) => void) => {
      push = listener;
      return () => undefined;
    }),
    packageName: () => 'p',
    fingerprint: () => 'f',
  };
  const api = {
    play: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    playerState: vi.fn(async () => ({ playing: false, uri: 'spotify:track:W', title: 'Web', artist: 'API', imageUrl: null })),
  };
  let sessionListener: () => void = () => undefined;
  const session = {
    clientId: vi.fn(async () => (options.clientId === undefined ? KEY : options.clientId)),
    subscribe: vi.fn((listener: () => void) => {
      sessionListener = listener;
      return () => undefined;
    }),
  };
  const playback = createRemotePlayback({ remote, api, session, redirectUri: async () => 'wikimasterstools://spotify', store });
  return { playback, remote, api, store, push: (event: RemoteEvent) => push(event), sessionChanged: () => sessionListener() };
}

describe('createRemotePlayback.play', () => {
  it('titre d’album à sa position : skipToIndex, puis statut ok et voie sdk', async () => {
    const { playback, remote, api, store } = setup();
    await playback.play({ contextUri: 'spotify:album:A', offsetUri: 'spotify:track:2', offsetIndex: 1 });
    expect(remote.connect).toHaveBeenCalledWith(KEY, 'wikimasterstools://spotify');
    expect(remote.skipToIndex).toHaveBeenCalledWith('spotify:album:A', 1);
    expect(api.play).not.toHaveBeenCalled();
    expect(await store.get(REMOTE_STATUS_KEY)).toEqual({ status: 'ok' });
    expect(playback.lastRoute()).toBe('sdk');
  });

  it('album ou playlist depuis le début : play(contexte)', async () => {
    const { playback, remote } = setup();
    await playback.play({ contextUri: 'spotify:playlist:P' });
    expect(remote.play).toHaveBeenCalledWith('spotify:playlist:P');
  });

  it('reprise (null) : resume', async () => {
    const { playback, remote } = setup();
    await playback.play(null);
    expect(remote.resume).toHaveBeenCalled();
  });

  it('liste de titres : le premier, puis 10 en file au plus, dans l’ordre', async () => {
    const { playback, remote } = setup();
    const uris = Array.from({ length: 14 }, (_, i) => `spotify:track:${i}`);
    await playback.play({ uris });
    expect(remote.play).toHaveBeenCalledWith('spotify:track:0');
    expect(remote.queue.mock.calls.map((call) => call[0])).toEqual(uris.slice(1, 11));
  });

  it('une file qui échoue n’arrête pas la lecture', async () => {
    const { playback, remote } = setup();
    remote.queue.mockRejectedValueOnce(new RemoteError('failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(playback.play({ uris: ['spotify:track:0', 'spotify:track:1', 'spotify:track:2'] })).resolves.toBeUndefined();
    expect(remote.queue).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it.each([
    ['not-installed', 'not-installed'],
    ['not-authorized', 'not-configured'],
    ['unsupported', 'outdated'],
  ] as const)('%s : Web API, et SDK écarté (statut %s) pour les lectures suivantes', async (code, status) => {
    const { playback, remote, api, store } = setup({ connectError: [code] });
    await playback.play({ uris: ['spotify:track:0'] });
    expect(api.play).toHaveBeenCalledWith({ uris: ['spotify:track:0'] });
    expect(await store.get(REMOTE_STATUS_KEY)).toEqual({ status });
    expect(playback.lastRoute()).toBe('web-api');
    await playback.play({ uris: ['spotify:track:1'] });
    expect(remote.connect).toHaveBeenCalledTimes(1);
  });

  it('failed : une reconnexion, puis Web API pour cet appel seulement', async () => {
    const { playback, remote, api, store } = setup({ connectError: ['failed', 'failed'] });
    await playback.play({ uris: ['spotify:track:0'] });
    expect(remote.connect).toHaveBeenCalledTimes(2);
    expect(api.play).toHaveBeenCalledTimes(1);
    expect(await store.get(REMOTE_STATUS_KEY)).toBeUndefined();
    await playback.play({ uris: ['spotify:track:1'] });
    expect(remote.connect).toHaveBeenCalledTimes(3);
    expect(remote.play).toHaveBeenCalledWith('spotify:track:1');
  });

  it('not-logged-in : Web API pour cet appel ; si elle échoue aussi, message « connecte-toi dans l’appli »', async () => {
    const { playback, api } = setup({ connectError: ['not-logged-in', 'not-logged-in'] });
    api.play.mockRejectedValueOnce(new SpotifyError('no-device', 'x'));
    await expect(playback.play({ uris: ['spotify:track:0'] })).rejects.toMatchObject({ code: 'app-logged-out' });
    await playback.play({ uris: ['spotify:track:1'] });
    expect(api.play).toHaveBeenCalledTimes(2);
  });

  it('sans clé : Web API directement (elle donnera son propre message)', async () => {
    const { playback, remote, api } = setup({ clientId: null });
    await playback.play({ uris: ['spotify:track:0'] });
    expect(remote.connect).not.toHaveBeenCalled();
    expect(api.play).toHaveBeenCalled();
  });

  it('deux lectures simultanées partagent une seule connexion', async () => {
    const { playback, remote } = setup();
    await Promise.all([playback.play({ uris: ['spotify:track:0'] }), playback.play({ uris: ['spotify:track:1'] })]);
    expect(remote.connect).toHaveBeenCalledTimes(1);
  });
});

describe('createRemotePlayback : état et pause', () => {
  it('connecté : l’état poussé est rendu sans réseau, et chaque état prévient les abonnés', async () => {
    const { playback, api, push } = setup();
    const listener = vi.fn();
    playback.subscribe(listener);
    await playback.play(null);
    push({ connected: true, track: { uri: 'spotify:track:A', title: 'T', artist: 'X', imageUrl: null, playing: true } });
    expect(listener).toHaveBeenCalled();
    expect(await playback.playerState()).toEqual({ uri: 'spotify:track:A', title: 'T', artist: 'X', imageUrl: null, playing: true });
    expect(api.playerState).not.toHaveBeenCalled();
  });

  it('déconnecté (arrière-plan) : retour à la Web API, sans l’ancien titre', async () => {
    const { playback, api, push } = setup();
    await playback.play(null);
    push({ connected: true, track: { uri: 'spotify:track:A', title: 'T', artist: 'X', imageUrl: null, playing: true } });
    push({ connected: false });
    expect((await playback.playerState())?.uri).toBe('spotify:track:W');
    expect(api.playerState).toHaveBeenCalled();
  });

  it('pause : par le SDK si connecté, sinon par la Web API', async () => {
    const first = setup();
    await first.playback.play(null);
    await first.playback.pause();
    expect(first.remote.pause).toHaveBeenCalled();
    expect(first.api.pause).not.toHaveBeenCalled();
    const second = setup();
    await second.playback.pause();
    expect(second.api.pause).toHaveBeenCalled();
  });
});

describe('createRemotePlayback : statut', () => {
  it('pas encore essayé au départ ; warm ne reconnecte que si le SDK a déjà réussi', async () => {
    const fresh = setup();
    expect(await fresh.playback.status()).toBe('untried');
    fresh.playback.warm();
    await Promise.resolve();
    expect(fresh.remote.connect).not.toHaveBeenCalled();
    const known = setup({ status: 'ok' });
    known.playback.warm();
    await vi.waitFor(() => expect(known.remote.connect).toHaveBeenCalledTimes(1));
  });

  it('délier, relier ou changer de clé : déconnexion et statut remis à zéro', async () => {
    const { playback, remote, store, sessionChanged } = setup({ status: 'not-configured' });
    sessionChanged();
    expect(remote.disconnect).toHaveBeenCalled();
    await vi.waitFor(async () => expect(await store.get(REMOTE_STATUS_KEY)).toEqual({ status: 'untried' }));
    await playback.play({ uris: ['spotify:track:0'] });
    expect(remote.connect).toHaveBeenCalled();
  });

  it('reset (bouton « Réessayer la lecture directe ») : statut untried, abonnés prévenus', async () => {
    const { playback, store } = setup({ status: 'not-installed' });
    const listener = vi.fn();
    playback.subscribe(listener);
    await playback.reset();
    expect(await store.get(REMOTE_STATUS_KEY)).toEqual({ status: 'untried' });
    expect(listener).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/spotify/remote-playback.test.ts`
Expected: FAIL (module introuvable).

- [ ] **Step 3: Write `src/core/spotify/remote-playback.ts`**

```ts
import type { KeyValueStore } from '../cache/store';
import { reportError } from '../telemetry/registry';
import { SpotifyError } from './errors';
import { RemoteError, type RemoteErrorCode, type RemoteTrack, type SpotifyRemote } from './remote-types';
import type { PlayerState, PlayTarget, SpotifyApi } from './spotify-api';
import type { SpotifySession } from './spotify-session';

// `untried` : jamais essayé (ou remis à zéro) ; les trois derniers écartent le SDK jusqu'à une nouvelle liaison ou une autre clé.
export type RemoteStatus = 'untried' | 'ok' | 'not-configured' | 'not-installed' | 'outdated';
export type PlayRoute = 'sdk' | 'web-api';

export const REMOTE_STATUS_KEY = 'spotify-remote-v1';
// Titres ajoutés à la file de Spotify après le premier d'une liste (hors album).
export const QUEUE_MAX = 10;

const SET_ASIDE: Partial<Record<RemoteErrorCode, RemoteStatus>> = { 'not-installed': 'not-installed', 'not-authorized': 'not-configured', unsupported: 'outdated' };
const isSetAside = (status: RemoteStatus): boolean => status === 'not-configured' || status === 'not-installed' || status === 'outdated';

type Outcome = 'done' | 'fallback' | 'logged-out';

// Lecture par l'appli Spotify du téléphone (APK) : mêmes opérations que la Web API (`play`, `pause`, `playerState`),
// sans limite d'appels. Le SDK est essayé d'abord ; s'il est indisponible, la Web API prend le relais (voir la spec).
export function createRemotePlayback(deps: {
  remote: SpotifyRemote;
  api: Pick<SpotifyApi, 'play' | 'pause' | 'playerState'>;
  session: Pick<SpotifySession, 'clientId' | 'subscribe'>;
  redirectUri: () => Promise<string>;
  store: KeyValueStore;
}) {
  const { remote, api, session, redirectUri, store } = deps;
  const listeners = new Set<() => void>();
  let connected = false;
  let track: RemoteTrack | null = null;
  let connecting: Promise<void> | null = null;
  let route: PlayRoute = 'web-api';

  const notify = () => listeners.forEach((listener) => listener());
  const readStatus = async (): Promise<RemoteStatus> => (await store.get<{ status: RemoteStatus }>(REMOTE_STATUS_KEY))?.status ?? 'untried';
  const writeStatus = (status: RemoteStatus): Promise<void> => store.set(REMOTE_STATUS_KEY, { status });

  remote.onEvent((event) => {
    connected = event.connected;
    track = event.connected ? event.track : null;
    notify();
  });

  // Délier, relier ou changer de clé : on repart de zéro (la clé suivante sera essayée à la prochaine lecture).
  session.subscribe(() => {
    connected = false;
    track = null;
    connecting = null;
    remote.disconnect();
    void writeStatus('untried').then(notify);
  });

  function connect(): Promise<void> {
    if (connected) return Promise.resolve();
    connecting ??= (async () => {
      const clientId = await session.clientId();
      if (!clientId) throw new RemoteError('failed');
      await remote.connect(clientId, await redirectUri());
      connected = true;
      await writeStatus('ok');
    })().finally(() => {
      connecting = null;
    });
    return connecting;
  }

  function command(target: PlayTarget): () => Promise<void> {
    if (!target) return () => remote.resume();
    if ('uris' in target) {
      return async () => {
        const [first, ...rest] = target.uris;
        if (!first) return remote.resume();
        await remote.play(first);
        for (const uri of rest.slice(0, QUEUE_MAX)) {
          await remote.queue(uri).catch((error: unknown) => console.warn('[wikimasters-tools]', 'Spotify : titre non ajouté à la file :', error));
        }
      };
    }
    const index = target.offsetIndex;
    if (index !== undefined) return () => remote.skipToIndex(target.contextUri, index);
    return () => remote.play(target.contextUri);
  }

  // Le SDK, avec une reconnexion après une panne passagère ; `fallback` : la Web API fera l'appel.
  async function viaSdk(run: () => Promise<void>): Promise<Outcome> {
    if (isSetAside(await readStatus())) return 'fallback';
    if (!(await session.clientId())) return 'fallback';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await connect();
        await run();
        return 'done';
      } catch (error) {
        const code: RemoteErrorCode = error instanceof RemoteError ? error.code : 'failed';
        reportError('lecture-sdk', code);
        const aside = SET_ASIDE[code];
        if (aside) {
          await writeStatus(aside);
          notify();
          return 'fallback';
        }
        if (code === 'not-logged-in') return 'logged-out';
        connected = false;
      }
    }
    return 'fallback';
  }

  return {
    async play(target: PlayTarget): Promise<void> {
      const outcome = await viaSdk(command(target));
      if (outcome === 'done') {
        route = 'sdk';
        return;
      }
      route = 'web-api';
      try {
        await api.play(target);
      } catch (error) {
        if (outcome === 'logged-out') throw new SpotifyError('app-logged-out', 'Personne n’est connecté dans l’appli Spotify');
        throw error;
      }
    },

    async pause(): Promise<void> {
      if (connected) {
        try {
          await remote.pause();
          return;
        } catch {
          connected = false;
        }
      }
      await api.pause();
    },

    // Connecté : le dernier état poussé par Spotify, sans appel réseau ; sinon la Web API.
    async playerState(): Promise<PlayerState> {
      if (connected) return track ? { ...track } : null;
      return api.playerState();
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    status: readStatus,

    async reset(): Promise<void> {
      await writeStatus('untried');
      notify();
    },

    // Au démarrage : le SDK a déjà réussi sur ce téléphone, on se reconnecte sans bruit (le lecteur lit l'état sans Web API).
    warm(): void {
      void readStatus().then((status) => {
        if (status === 'ok') connect().catch(() => undefined);
      });
    },

    lastRoute: (): PlayRoute => route,
  };
}

export type RemotePlayback = ReturnType<typeof createRemotePlayback>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/spotify/remote-playback.test.ts`
Expected: PASS. Puis `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/core/spotify/remote-playback.ts tests/core/spotify/remote-playback.test.ts
git commit -m "feat(spotify): couche de lecture par le SDK du téléphone, repli sur la Web API"
```

---

### Task 5: Branchements dans la surcouche et le mini-lecteur

**Files:**
- Modify: `src/content/player-source.ts` (dépendance `onPush`)
- Modify: `src/content/music-registry.ts` (`SpotifyKeyControl.remote`)
- Modify: `src/app/overlay.ts:551-587` (création de la couche lecture)
- Test: `tests/content/player-source.test.ts`

**Interfaces:**
- Consumes: `createRemotePlayback`, `RemotePlayback`, `RemoteStatus` (tâche 4) ; `SpotifyEnv.remote` (tâche 1) ; `MusicServiceDeps.playRoute` (tâche 3).
- Produces:
  - `PlayerSourceDeps.onPush?: (listener: () => void) => () => void`
  - `SpotifyKeyControl.remote?: RemoteControl` avec `type RemoteControl = { status(): Promise<RemoteStatus>; packageName(): string; fingerprint(): string; reset(): Promise<void>; subscribe(listener: () => void): () => void }`

- [ ] **Step 1: Write the failing test**

Dans `tests/content/player-source.test.ts` (reprendre le montage existant du fichier : faux `api`, `session`, `storage`, `schedule`, `isVisible`, `onVisible`), ajouter :

```ts
  it("relit l'état dès que le SDK pousse un changement, et se désabonne à l'arrêt", async () => {
    let pushed: () => void = () => undefined;
    const off = vi.fn();
    const onPush = vi.fn((listener: () => void) => {
      pushed = listener;
      return off;
    });
    const api = { playerState: vi.fn(async () => null), play: vi.fn(), pause: vi.fn() };
    const source = createPlayerSource({
      api,
      session: { isLinked: async () => true, subscribe: () => () => undefined },
      storage: { getItem: () => null, setItem: () => undefined },
      schedule: () => () => undefined,
      isVisible: () => true,
      onVisible: () => () => undefined,
      onPush,
    });
    source.start();
    await vi.waitFor(() => expect(api.playerState).toHaveBeenCalledTimes(1));
    pushed();
    await vi.waitFor(() => expect(api.playerState).toHaveBeenCalledTimes(2));
    source.stop();
    expect(off).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/content/player-source.test.ts`
Expected: FAIL (`onPush` jamais appelé).

- [ ] **Step 3: Implémenter `onPush` dans `player-source.ts`**

Dans `PlayerSourceDeps` :

```ts
  // Changement d'état poussé (SDK du téléphone) : relecture immédiate ; rend la fonction qui se désabonne.
  onPush?: (listener: () => void) => () => void;
```

Déstructurer `onPush` avec les autres dépendances ; ajouter `let unsubscribePush: (() => void) | null = null;` ; dans `start()` après `unsubscribeVisible = …` :

```ts
      unsubscribePush = onPush?.(() => void poll()) ?? null;
```

et dans `stop()` :

```ts
      unsubscribePush?.();
      unsubscribePush = null;
```

- [ ] **Step 4: `SpotifyKeyControl.remote` dans `music-registry.ts`**

```ts
import type { RemoteStatus } from '../core/spotify/remote-playback';

// Lecture directe par l'appli Spotify du téléphone (APK seulement) : état, et ce qu'il faut déclarer dans la clé.
export type RemoteControl = {
  status(): Promise<RemoteStatus>;
  packageName(): string;
  fingerprint(): string;
  // Bouton « Réessayer la lecture directe ».
  reset(): Promise<void>;
  subscribe(listener: () => void): () => void;
};
```

et dans `SpotifyKeyControl`, après `subscribe` :

```ts
  // Absent sur l'ordinateur et sur un ancien APK.
  remote?: RemoteControl;
```

- [ ] **Step 5: Branchements dans `overlay.ts`**

Ajouter l'import `import { createRemotePlayback } from '../core/spotify/remote-playback';`. Dans le bloc `if (spotify) { try { … } }`, remplacer la création du lecteur et du service par :

```ts
      const spotifyApi = createSpotifyApi({ session, fetch: spotify.fetch, store, ...(spotify.deviceTypes ? { deviceTypes: spotify.deviceTypes } : {}) });
      // APK : lecture, pause et état par l'appli Spotify du téléphone (SDK) ; la recherche et les pochettes restent sur la Web API.
      const remotePlayback = spotify.remote
        ? createRemotePlayback({ remote: spotify.remote, api: spotifyApi, session, redirectUri: spotify.redirectUri, store })
        : null;
      const playback = remotePlayback ?? spotifyApi;
      const musicRepo = createMusicRepo(store, (slugs) => fetchWikidataMusic((url) => fetch(url), slugs));
      artSources.spotify = { api: spotifyApi, session, music: musicRepo };
      const player = createPlayerSource({
        api: playback,
        session,
        storage: window.localStorage,
        ...(remotePlayback ? { onPush: (listener: () => void) => remotePlayback.subscribe(listener) } : {}),
      });
      const spotifyService = createMusicService({
          collection: collectionRepo,
          kinds: kindsRepo,
          music: musicRepo,
          listens: createListenRepo(store),
          soundtracks: createListenRepo(store, undefined, 'soundtracks-v1'),
          screen: screenRepo,
          session,
          api: { ...spotifyApi, play: (target) => playback.play(target) },
          onPlayed: (card) => {
            if (card) player.setCard(card);
            void player.refresh();
          },
          ...(spotify.launchApp ? { launchApp: spotify.launchApp } : {}),
          ...(remotePlayback ? { playRoute: () => remotePlayback.lastRoute() } : {}),
        });
```

Dans l'appel `setSpotifyKey({ … })`, après `subscribe` :

```ts
        ...(remotePlayback && spotify.remote
          ? {
              remote: {
                status: () => remotePlayback.status(),
                packageName: () => spotify.remote!.packageName(),
                fingerprint: () => spotify.remote!.fingerprint(),
                reset: () => remotePlayback.reset(),
                subscribe: (listener: () => void) => remotePlayback.subscribe(listener),
              },
            }
          : {}),
```

et juste après `player.start();` :

```ts
      remotePlayback?.warm();
```

(`launchApp` reste branché : il ne sert plus que si la Web API, en repli, répond « aucun appareil ».)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/content/player-source.test.ts tests/content/music-service.test.ts`
Expected: PASS. Puis `npm run typecheck` et `npm run build` (l'extension doit toujours se construire).

- [ ] **Step 7: Commit**

```bash
git add src/content/player-source.ts src/content/music-registry.ts src/app/overlay.ts tests/content/player-source.test.ts
git commit -m "feat(spotify): la surcouche lit et pilote la musique par le SDK sur l'APK"
```

---

### Task 6: Écran Lecteur — bloc « Lecture sur ce téléphone »

**Files:**
- Create: `src/content/SpotifyRemoteSettings.tsx`
- Modify: `src/content/SpotifyKeySettings.tsx` (affiche le bloc)
- Test: `tests/content/spotify-remote-settings.test.tsx`, `tests/content/spotify-key-settings.test.tsx`

**Interfaces:**
- Consumes: `RemoteControl` (tâche 5), `RemoteStatus` (tâche 4), `Glyph` (`copy`).
- Produces: `SpotifyRemoteSettings({ remote }: { remote: RemoteControl })`.

- [ ] **Step 1: Write the failing tests**

`tests/content/spotify-remote-settings.test.tsx` :

```tsx
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpotifyRemoteSettings } from '../../src/content/SpotifyRemoteSettings';
import type { RemoteControl } from '../../src/content/music-registry';
import type { RemoteStatus } from '../../src/core/spotify/remote-playback';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function control(initial: RemoteStatus) {
  let status = initial;
  const listeners = new Set<() => void>();
  const remote: RemoteControl = {
    status: vi.fn(async () => status),
    packageName: () => 'io.github.maximus49000.wikimasterstools',
    fingerprint: () => 'C2:21:A4:37:FA:93:03:8C:31:B1:61:D1:B5:49:68:A9:C1:26:F3:9E',
    reset: vi.fn(async () => {
      status = 'untried';
      listeners.forEach((l) => l());
    }),
    subscribe: (l) => (listeners.add(l), () => void listeners.delete(l)),
  };
  return remote;
}

const render = async (remote: RemoteControl) => {
  await act(async () => {
    root.render(<SpotifyRemoteSettings remote={remote} />);
  });
};
const text = () => container.textContent ?? '';
const byLabel = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('SpotifyRemoteSettings', () => {
  it.each([
    ['ok', 'Lecture directe par l’appli Spotify : active.'],
    ['untried', 'Lecture directe par l’appli Spotify : sera essayée à la prochaine lecture.'],
    ['not-configured', 'Ta clé Spotify n’autorise pas encore ce téléphone : ajoute les deux lignes ci-dessous dans ta clé (Android packages). En attendant, la lecture passe par l’ancienne méthode.'],
    ['not-installed', 'Installe l’appli Spotify pour la lecture directe.'],
    ['outdated', 'Mets à jour l’appli Spotify.'],
  ] as const)('statut %s : la bonne ligne d’état', async (status, line) => {
    await render(control(status));
    expect(text()).toContain(line);
  });

  it('montre le paquet et l’empreinte, chacun avec un bouton copier', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await render(control('ok'));
    expect(text()).toContain('À déclarer chez Spotify (Android packages)');
    expect(text()).toContain('io.github.maximus49000.wikimasterstools');
    expect(text()).toContain('C2:21:A4:37:FA:93:03:8C:31:B1:61:D1:B5:49:68:A9:C1:26:F3:9E');
    await act(async () => byLabel('Copier le nom du paquet')?.click());
    await act(async () => byLabel('Copier l’empreinte SHA-1')?.click());
    expect(writeText).toHaveBeenNthCalledWith(1, 'io.github.maximus49000.wikimasterstools');
    expect(writeText).toHaveBeenNthCalledWith(2, 'C2:21:A4:37:FA:93:03:8C:31:B1:61:D1:B5:49:68:A9:C1:26:F3:9E');
  });

  it('« Réessayer la lecture directe » seulement quand le SDK est écarté ; remet le statut à zéro', async () => {
    await render(control('ok'));
    expect(byLabel('Réessayer la lecture directe')).toBeNull();
    const remote = control('not-configured');
    await render(remote);
    await act(async () => byLabel('Réessayer la lecture directe')?.click());
    expect(remote.reset).toHaveBeenCalled();
    expect(text()).toContain('sera essayée à la prochaine lecture');
  });
});
```

Dans `tests/content/spotify-key-settings.test.tsx`, ajouter (le `serve()` existant ne fournit pas `remote`) :

```tsx
  it("sans lecture directe (ordinateur, ancien APK), pas de bloc « Lecture sur ce téléphone »", async () => {
    serve(KEY);
    await render(false);
    expect(text()).not.toContain('Lecture sur ce téléphone');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/content/spotify-remote-settings.test.tsx tests/content/spotify-key-settings.test.tsx`
Expected: FAIL (composant introuvable).

- [ ] **Step 3: Write `src/content/SpotifyRemoteSettings.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Glyph } from './Glyphs';
import type { RemoteControl } from './music-registry';
import type { RemoteStatus } from '../core/spotify/remote-playback';

const border = '1px solid var(--color-border, rgba(148,163,184,0.5))';

const LINES: Record<RemoteStatus, string> = {
  ok: 'Lecture directe par l’appli Spotify : active.',
  untried: 'Lecture directe par l’appli Spotify : sera essayée à la prochaine lecture.',
  'not-configured': 'Ta clé Spotify n’autorise pas encore ce téléphone : ajoute les deux lignes ci-dessous dans ta clé (Android packages). En attendant, la lecture passe par l’ancienne méthode.',
  'not-installed': 'Installe l’appli Spotify pour la lecture directe.',
  outdated: 'Mets à jour l’appli Spotify.',
};

const RETRY: readonly RemoteStatus[] = ['not-configured', 'not-installed', 'outdated'];

const copyText = (value: string) => {
  try {
    void navigator.clipboard.writeText(value).catch(() => undefined);
  } catch {
    // Presse-papiers indisponible : la valeur reste affichée, on la copie à la main.
  }
};

function Row({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '4px 4px 4px 10px', border, borderRadius: 8 }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', font: '12px ui-monospace, monospace' }}>{value}</span>
      <button type="button" onClick={() => copyText(value)} aria-label={label} title={label} style={{ minHeight: 44, width: 44, cursor: 'pointer', color: 'inherit', background: 'none', border, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Glyph name="copy" />
      </button>
    </div>
  );
}

// APK seulement : la lecture par l'appli Spotify du téléphone (SDK App Remote) et ce que la clé doit déclarer pour l'autoriser.
export function SpotifyRemoteSettings({ remote }: { remote: RemoteControl }) {
  const [status, setStatus] = useState<RemoteStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => void remote.status().then((value) => !cancelled && setStatus(value));
    load();
    const off = remote.subscribe(load);
    return () => {
      cancelled = true;
      off();
    };
  }, [remote]);

  if (status === null) return null;
  const fingerprint = remote.fingerprint();
  return (
    <div data-wmt-remote-playback style={{ marginTop: 16, paddingTop: 12, borderTop: border }}>
      <p style={{ margin: '0 0 8px', opacity: 0.8 }}>Lecture sur ce téléphone</p>
      <p role="status" style={{ margin: '0 0 8px', fontSize: 13 }}>
        {LINES[status]}
      </p>
      <p style={{ margin: '12px 0 4px', fontSize: 12, opacity: 0.8 }}>À déclarer chez Spotify (Android packages) :</p>
      <Row value={remote.packageName()} label="Copier le nom du paquet" />
      {fingerprint && <Row value={fingerprint} label="Copier l’empreinte SHA-1" />}
      {RETRY.includes(status) && (
        <div style={{ display: 'flex', marginTop: 8 }}>
          <button
            type="button"
            onClick={() => void remote.reset()}
            aria-label="Réessayer la lecture directe"
            title="Réessayer la lecture directe"
            style={{ flex: 1, minHeight: 44, cursor: 'pointer', font: '600 14px system-ui, sans-serif', color: 'inherit', background: 'none', border, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Glyph name="refresh" /> Réessayer
          </button>
        </div>
      )}
    </div>
  );
}
```

(Les glyphes `copy` et `refresh` existent déjà dans `src/content/Glyphs.tsx`.)

- [ ] **Step 4: Afficher le bloc dans `SpotifyKeySettings.tsx`**

Ajouter l'import `import { SpotifyRemoteSettings } from './SpotifyRemoteSettings';` et, juste avant `{pending && (` :

```tsx
      {control.remote && <SpotifyRemoteSettings remote={control.remote} />}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/content/spotify-remote-settings.test.tsx tests/content/spotify-key-settings.test.tsx tests/content/player-settings.test.tsx`
Expected: PASS. Puis `npm run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add src/content/SpotifyRemoteSettings.tsx src/content/SpotifyKeySettings.tsx tests/content/spotify-remote-settings.test.tsx tests/content/spotify-key-settings.test.tsx
git commit -m "feat(spotify): écran Lecteur — état de la lecture directe, paquet et empreinte à déclarer"
```

---

### Task 7: WikiHow et Nouveautés

**Files:**
- Modify: `src/core/whats-new/entries.ts` (`SPOTIFY_KEY_GUIDE`, fiche `ecouter-v2` → `ecouter-v3`)
- Test: `tests/core/whats-new/entries.test.ts`

**Interfaces:**
- Consumes: rien des tâches précédentes (texte seulement).
- Produces: fiche `ecouter-v3` (jamais annoncée → affichée dans la fenêtre Nouveautés après la mise à jour).

- [ ] **Step 1: Write the failing test**

Dans `tests/core/whats-new/entries.test.ts`, remplacer `'ecouter-v2'` par `'ecouter-v3'` dans le test « explique comment utiliser sa propre clé Spotify », y ajouter `expect(ENTRIES.some((e) => e.id === 'ecouter-v2')).toBe(false);`, ajouter `'Android packages'` à la liste des mots attendus, et ajouter :

```ts
  it('annonce la lecture directe sur Android dans la fiche écoute', () => {
    const entry = ENTRIES.find((e) => e.id === 'ecouter-v3');
    const step = entry?.steps.find((s) => s.title === 'Lecture directe sur Android');
    expect(step?.text).toBe('Sur l’application Android, la musique se lance directement dans l’appli Spotify, même fermée, sans quitter Wikimasters. Si tu as ta propre clé : ajoute une fois la ligne Android affichée dans Paramètre d’extension, puis Lecteur.');
    expect(step?.details?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/whats-new/entries.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter dans `entries.ts`**

Dans `SPOTIFY_KEY_GUIDE.details`, remplacer le premier détail par :

```ts
    { label: 'Créer sa clé, pas à pas', text: '1. Créez un compte Spotify, puis ouvrez developer.spotify.com/dashboard. 2. « Create app », cochez « Web API » et, si vous utilisez l’application Android, « Android ». 3. Dans « Redirect URI », collez les adresses affichées par l’extension dans Lecteur (bouton copier). 4. Sur Android : dans « Android packages », collez le nom du paquet et l’empreinte SHA-1 affichés dans Lecteur, puis « Add ». 5. Enregistrez, puis copiez le « Client ID ». 6. Dans « User Management » de l’application, ajoutez l’adresse e-mail de votre compte Spotify. 7. Collez le Client ID dans Lecteur, puis « Lier Spotify ».' },
```

et ajouter un détail en dernier :

```ts
    { label: 'Sur Android', text: 'Avec les Android packages déclarés, la musique se lance dans l’appli Spotify du téléphone sans quitter Wikimasters, même si Spotify est fermé. La première fois, Spotify demande votre accord une seule fois. Sans cette déclaration, la lecture passe par l’ancienne méthode.' },
```

Dans `ENTRIES`, renommer `id: 'ecouter-v2'` en `id: 'ecouter-v3'` et insérer en premier élément de `steps` :

```ts
      {
        target: null,
        title: 'Lecture directe sur Android',
        text: 'Sur l’application Android, la musique se lance directement dans l’appli Spotify, même fermée, sans quitter Wikimasters. Si tu as ta propre clé : ajoute une fois la ligne Android affichée dans Paramètre d’extension, puis Lecteur.',
        details: [
          { label: 'Comment ça marche', text: 'L’application pilote l’appli Spotify du téléphone (kit officiel de Spotify) : lecture, pause et titre en cours passent par elle, sans limite d’appels. La recherche des titres et les pochettes passent toujours par Spotify sur Internet.' },
          { label: 'Limites', text: 'Il faut l’appli Spotify installée, un compte connecté et Spotify Premium. Si la lecture directe n’est pas possible, l’ancienne méthode prend le relais et l’écran Lecteur indique pourquoi.' },
        ],
      },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/whats-new`
Expected: PASS (dont le test « didactique » : au moins deux détails par étape).

- [ ] **Step 5: Commit**

```bash
git add src/core/whats-new/entries.ts tests/core/whats-new/entries.test.ts
git commit -m "feat(spotify): WikiHow et Nouveautés — lecture directe sur Android, Android packages"
```

---

### Task 8: Vérification d'ensemble, PR vers production, report, pré-production, essai téléphone

**Files:** aucun nouveau.

- [ ] **Step 1: Vérifications complètes**

Run: `npm run typecheck && npm test && npm run build && node scripts/build-apk.mjs`
Expected: tout passe (c'est ce qu'exige `npm run corriger`).

- [ ] **Step 2: Commit final du correctif** (alimente l'onglet Corrections)

```bash
git commit --allow-empty -m "fix(spotify): sur Android, la musique se lance dans l'appli Spotify sans quitter Wikimasters"
```

- [ ] **Step 3: PR vers `production`**

```bash
git push -u origin fix/spotify-app-remote
gh pr create --base production --head fix/spotify-app-remote --title "fix(spotify): lecture par l'appli Spotify sur Android (SDK App Remote)" --body "…"
```
Fusionner (règle du projet : PR ouverte et fusionnée sans demander). Puis réaligner `fix/production` sur `production` (`git push origin origin/production:fix/production` si elle est en retard, sans forcer).

- [ ] **Step 4: Report dans `main` (merge, jamais cherry-pick)**

Sur une branche `chore/report-production-<n>` partie de `origin/main` : `git merge origin/production`, résoudre les conflits (attendus dans `MainActivity.java`, qui diverge : garder les deux côtés), `npm run typecheck && npm test`, PR vers `main`, fusionner.

- [ ] **Step 5: Pré-production**

Sur `main` à jour : `npm run preprod` (sans demander). Noter le numéro `preprod-<n>`.

- [ ] **Step 6: Essai sur le S26 (pré-production)** — ne pas tester pendant qu'une autre personne écoute sur le compte

Installer la mise à jour de pré-production sur le téléphone, puis vérifier dans l'ordre : Spotify force-stoppé → ▶ sur un titre : écran d'accord Spotify la première fois, son, Wikimasters reste devant ; Spotify en veille → ▶ ; titre au milieu d'un album → le bon titre ; liste d'un artiste → titre puis la suite ; pause / reprise depuis le mini-lecteur ; arrière-plan puis retour (le mini-lecteur se remet à jour) ; écran Lecteur : ligne « active », paquet `…wikimasterstools.preprod` et empreinte `C2:21:…:F3:9E`. Capture d'écran de l'écran Lecteur à montrer à l'utilisateur.

- [ ] **Step 7: Production**

Uniquement sur ordre explicite de l'utilisateur : depuis `production` (ou `fix/production` alignée) : `npm run corriger`.
