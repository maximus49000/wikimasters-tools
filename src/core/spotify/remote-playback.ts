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
