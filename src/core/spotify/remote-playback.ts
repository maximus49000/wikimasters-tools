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
// Après une connexion en échec (panne, délai dépassé), la Web API joue seule pendant ce temps : un SDK bloqué ne retarde pas chaque ▶.
export const SDK_COOLDOWN_MS = 60_000;

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
  now?: () => number;
}) {
  const { remote, api, session, redirectUri, store } = deps;
  const now = deps.now ?? Date.now;
  const listeners = new Set<() => void>();
  let connected = false;
  let track: RemoteTrack | null = null;
  // Connexion en cours, et si elle est silencieuse (une lecture ne s'y joint pas : elle en lance une avec l'écran d'accord).
  let connecting: { promise: Promise<void>; silent: boolean } | null = null;
  // Heure de la dernière connexion en échec (`failed`), pour la pause du SDK ; en mémoire seulement.
  let failedAt = Number.NEGATIVE_INFINITY;
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
    failedAt = Number.NEGATIVE_INFINITY;
    remote.disconnect();
    void writeStatus('untried').then(notify);
  });

  function connect(silent: boolean): Promise<void> {
    if (connected) return Promise.resolve();
    if (connecting && (silent || !connecting.silent)) return connecting.promise;
    // Android remplace la tentative silencieuse en cours (elle répond `failed`) par celle-ci.
    const current: { promise: Promise<void>; silent: boolean } = {
      silent,
      promise: (async () => {
        const clientId = await session.clientId();
        if (!clientId) throw new RemoteError('failed');
        await remote.connect(clientId, await redirectUri(), silent);
        connected = true;
        await writeStatus('ok');
      })().finally(() => {
        if (connecting === current) connecting = null;
      }),
    };
    connecting = current;
    return current.promise;
  }

  // Une liste lancée depuis une carte se lit dans l'ordre : on coupe « répéter le titre » (réglage gardé par Spotify),
  // sans faire échouer la lecture déjà lancée si Spotify refuse.
  function inOrder(start: () => Promise<void>): () => Promise<void> {
    return async () => {
      await start();
      await remote.repeatOff().catch((error: unknown) => console.warn('[wikimasters-tools]', 'Spotify : répétition non coupée :', error));
    };
  }

  function command(target: PlayTarget): () => Promise<void> {
    if (!target) return () => remote.resume();
    return inOrder(start(target));
  }

  function start(target: NonNullable<PlayTarget>): () => Promise<void> {
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

  // Erreur du SDK : écarté (statut enregistré), personne connecté dans Spotify, ou panne passagère (`null`).
  async function failure(error: unknown): Promise<Outcome | null> {
    const code: RemoteErrorCode = error instanceof RemoteError ? error.code : 'failed';
    reportError('lecture-sdk', code);
    const aside = SET_ASIDE[code];
    if (aside) {
      await writeStatus(aside);
      notify();
      return 'fallback';
    }
    if (code === 'not-logged-in') return 'logged-out';
    return null;
  }

  // Le SDK ; `fallback` : la Web API fera l'appel. Une connexion en échec (ou trop lente) passe tout de suite la main
  // à la Web API et met le SDK en pause ; seule une commande en échec sur une connexion établie vaut une reconnexion.
  async function viaSdk(run: () => Promise<void>): Promise<Outcome> {
    if (isSetAside(await readStatus())) return 'fallback';
    if (now() - failedAt < SDK_COOLDOWN_MS) return 'fallback';
    if (!(await session.clientId())) return 'fallback';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await connect(false);
      } catch (error) {
        const outcome = await failure(error);
        if (outcome) return outcome;
        failedAt = now();
        return 'fallback';
      }
      try {
        await run();
        return 'done';
      } catch (error) {
        const outcome = await failure(error);
        if (outcome) return outcome;
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

    // Connecté : le dernier état poussé par Spotify, sans appel réseau ; sinon (ou sans titre connu, page rechargée) la Web API.
    async playerState(): Promise<PlayerState> {
      if (connected && track) return { ...track };
      return api.playerState();
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    status: readStatus,

    async reset(): Promise<void> {
      failedAt = Number.NEGATIVE_INFINITY;
      await writeStatus('untried');
      notify();
    },

    // Au démarrage : le SDK a déjà réussi sur ce téléphone, on se reconnecte sans bruit ni écran d'accord
    // (le lecteur lit l'état sans Web API) ; la première lecture se connectera elle-même en cas d'échec.
    warm(): void {
      void readStatus().then((status) => {
        if (status === 'ok') connect(true).catch(() => undefined);
      });
    },

    lastRoute: (): PlayRoute => route,
  };
}

export type RemotePlayback = ReturnType<typeof createRemotePlayback>;
