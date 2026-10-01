import { SpotifyError } from '../core/spotify/errors';
import type { SpotifyApi } from '../core/spotify/spotify-api';
import type { SpotifySession } from '../core/spotify/spotify-session';

export type PlayerTrack = { title: string; artist: string; imageUrl: string | null; playing: boolean };
export type PlayerView = { linked: boolean; track: PlayerTrack | null; hidden: boolean };

const HIDDEN_KEY = 'wmt:spotifyPlayerHidden';
const PLAYING_MS = 5_000;
const IDLE_MS = 15_000;

export type PlayerSourceDeps = {
  api: Pick<SpotifyApi, 'playerState' | 'play' | 'pause'>;
  session: Pick<SpotifySession, 'isLinked' | 'subscribe'>;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  // Programme `fn` dans `ms` ; rend la fonction qui l'annule.
  schedule?: (fn: () => void, ms: number) => () => void;
};

const realSchedule = (fn: () => void, ms: number) => {
  const id = window.setTimeout(fn, ms);
  return () => window.clearTimeout(id);
};

export function createPlayerSource(deps: PlayerSourceDeps) {
  const { api, session, storage, schedule = realSchedule } = deps;
  const listeners = new Set<() => void>();
  let cancel: (() => void) | null = null;
  let unsubscribe: (() => void) | null = null;
  let running = false;

  let hidden = false;
  try {
    hidden = storage.getItem(HIDDEN_KEY) === '1';
  } catch {
    // Stockage inaccessible : lecteur visible.
  }
  let view: PlayerView = { linked: false, track: null, hidden };

  const set = (next: Partial<PlayerView>) => {
    view = { ...view, ...next };
    listeners.forEach((listener) => listener());
  };

  // Un tour : lit l'état, puis reprogramme selon ce qu'on a vu.
  async function poll(): Promise<void> {
    cancel?.();
    cancel = null;
    let wait = IDLE_MS;
    try {
      if (!(await session.isLinked())) {
        set({ linked: false, track: null });
        return;
      }
      const state = await api.playerState();
      set({ linked: true, track: state });
      wait = state?.playing ? PLAYING_MS : IDLE_MS;
    } catch (error) {
      if (error instanceof SpotifyError && error.code === 'not-linked') {
        set({ linked: false, track: null });
        return;
      }
      if (error instanceof SpotifyError && error.code === 'rate-limited') wait = error.retryAfterMs ?? wait;
    }
    if (running) cancel = schedule(() => void poll(), wait);
  }

  return {
    current: (): PlayerView => view,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    start(): void {
      if (running) return;
      running = true;
      // Une liaison ou une déliaison relance ou arrête le sondage aussitôt.
      unsubscribe = session.subscribe(() => void poll());
      void poll();
    },
    stop(): void {
      running = false;
      cancel?.();
      cancel = null;
      unsubscribe?.();
      unsubscribe = null;
    },
    refresh: poll,
    async toggle(): Promise<void> {
      try {
        if (view.track?.playing) await api.pause();
        else await api.play(null);
      } catch (error) {
        console.warn('[wikimasters-tools]', 'Spotify :', error);
      }
      await poll();
    },
    setHidden(next: boolean): void {
      try {
        storage.setItem(HIDDEN_KEY, next ? '1' : '0');
      } catch {
        // Préférence d'affichage : on garde le choix pour la page en cours seulement.
      }
      set({ hidden: next });
    },
  };
}

export type PlayerSource = ReturnType<typeof createPlayerSource>;
