import { RemoteError, type RemoteErrorCode, type RemoteEvent, type SpotifyRemote } from '../core/spotify/remote-types';

// Ce que MainActivity.java expose à la page : chaque appel porte un identifiant ; Android répond par
// `window.__wmtSpotifyRemoteDone(id, codeErreur)` (code vide = réussite) et pousse l'état par `window.__wmtSpotifyRemoteState(json)`.
export type RemoteWindow = {
  WmtSpotifyRemote?: {
    connect(id: string, clientId: string, redirectUri: string, silent: boolean): void;
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
const TIMEOUTS = { connect: 90_000, call: 10_000 };
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
    connect: (clientId, redirectUri, silent) => call(timeouts.connect, (id) => bridge.connect(id, clientId, redirectUri, silent === true)),
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
