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
  // Onglet au premier plan ? En arrière-plan, on n'appelle pas l'API.
  isVisible?: () => boolean;
  // S'abonne au retour au premier plan ; rend la fonction qui se désabonne.
  onVisible?: (callback: () => void) => () => void;
};

const realIsVisible = () => document.visibilityState === 'visible';
const realOnVisible = (callback: () => void) => {
  document.addEventListener('visibilitychange', callback);
  return () => document.removeEventListener('visibilitychange', callback);
};

const realSchedule = (fn: () => void, ms: number) => {
  const id = window.setTimeout(fn, ms);
  return () => window.clearTimeout(id);
};

export function createPlayerSource(deps: PlayerSourceDeps) {
  const { api, session, storage, schedule = realSchedule, isVisible = realIsVisible, onVisible = realOnVisible } = deps;
  const listeners = new Set<() => void>();
  let cancel: (() => void) | null = null;
  let unsubscribe: (() => void) | null = null;
  let unsubscribeVisible: (() => void) | null = null;
  let running = false;
  let generation = 0;

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
    // Jeton de génération : seul le tour le plus récent (et avant tout arrêt) a le droit d'agir.
    const mine = ++generation;
    cancel?.();
    cancel = null;
    let wait = IDLE_MS;
    // Onglet masqué : aucun appel réseau, on reprogramme comme au repos (le retour au premier plan relance).
    if (!isVisible()) {
      if (running) cancel = schedule(() => void poll(), wait);
      return;
    }
    try {
      const linked = await session.isLinked();
      if (mine !== generation) return;
      if (!linked) {
        set({ linked: false, track: null });
        return;
      }
      const state = await api.playerState();
      if (mine !== generation) return;
      set({ linked: true, track: state });
      wait = state?.playing ? PLAYING_MS : IDLE_MS;
    } catch (error) {
      if (mine !== generation) return;
      if (error instanceof SpotifyError && error.code === 'not-linked') {
        set({ linked: false, track: null });
        return;
      }
      if (error instanceof SpotifyError && error.code === 'rate-limited') {
        wait = Math.max(error.retryAfterMs ?? wait, 1000);
      }
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
      // Retour au premier plan : sondage immédiat.
      unsubscribeVisible = onVisible(() => {
        if (isVisible()) void poll();
      });
      void poll();
    },
    stop(): void {
      running = false;
      generation++; // les tours en cours deviennent périmés
      cancel?.();
      cancel = null;
      unsubscribe?.();
      unsubscribe = null;
      unsubscribeVisible?.();
      unsubscribeVisible = null;
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
