import type { KnownCard } from '../core/collection/collection-book';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { resolveListen, type Listen } from '../core/music/listen';
import { musicKindOf } from '../core/music/music-kinds';
import type { MusicRepo } from '../core/music/music-repo';
import { SpotifyError, userMessage } from '../core/spotify/errors';
import type { SpotifyApi, Track } from '../core/spotify/spotify-api';
import type { SpotifySession } from '../core/spotify/spotify-session';

export type ListenView =
  | { status: 'none' }
  | { status: 'notfound' }
  | { status: 'unlinked' }
  | { status: 'ready'; listen: Listen }
  | { status: 'error'; message: string };

export type MusicServiceDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  music: Pick<MusicRepo, 'resolve'>;
  session: Pick<SpotifySession, 'isLinked' | 'link' | 'unlink' | 'subscribe'>;
  api: Pick<SpotifyApi, 'searchTracks' | 'searchAlbum' | 'albumTracks' | 'play'>;
  // Après un lancement : le mini-lecteur relit l'état tout de suite.
  onPlayed: () => void;
  // Ouvre l'application Spotify quand aucun appareil n'est actif ; absent sur les plateformes qui ne savent pas le faire.
  launchApp?: () => void;
  // Attente entre deux essais pendant le démarrage de Spotify (remplaçable en test).
  sleep?: (ms: number) => Promise<void>;
};

// Spotify met quelques secondes à se déclarer comme appareil après son ouverture.
const LAUNCH_RETRIES = 8;
const LAUNCH_RETRY_MS = 1500;

export function createMusicService(deps: MusicServiceDeps) {
  const { collection, kinds, music, session, api, onPlayed, launchApp } = deps;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function retryWhileStarting(target: Parameters<typeof api.play>[0]): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      await sleep(LAUNCH_RETRY_MS);
      try {
        await api.play(target);
        return;
      } catch (error) {
        const stillStarting = error instanceof SpotifyError && error.code === 'no-device';
        if (!stillStarting || attempt >= LAUNCH_RETRIES) throw error;
      }
    }
  }

  return {
    // Ce que la fiche d'une carte propose d'écouter : rien, lier le compte, des pistes, ou une erreur.
    async view(slug: string, title: string): Promise<ListenView> {
      try {
        if (!(await collection.list()).some((card) => card.slug === slug)) return { status: 'none' };
        await kinds.resolveMissing([slug]);
        const kind = musicKindOf((await kinds.load()).cards[slug]);
        if (!kind) return { status: 'none' };
        if (!(await session.isLinked())) return { status: 'unlinked' };
        const cardMusic = (await music.resolve([slug]))[slug] ?? {};
        const listen = await resolveListen(api, { title, kind, music: cardMusic });
        return listen ? { status: 'ready', listen } : { status: 'notfound' };
      } catch (error) {
        return { status: 'error', message: userMessage(error) };
      }
    },

    // Lance une piste ; rend null si tout va bien, sinon le message à afficher.
    async play(item: Track, listen: Listen): Promise<string | null> {
      // Hors album : on envoie la suite de la liste pour que Spotify enchaîne les titres.
      const from = Math.max(0, listen.items.findIndex((candidate) => candidate.uri === item.uri));
      const target = listen.albumUri
        ? { contextUri: listen.albumUri, offsetUri: item.uri }
        : { uris: listen.items.length > 0 ? listen.items.slice(from).map((candidate) => candidate.uri) : [item.uri] };
      try {
        try {
          await api.play(target);
        } catch (error) {
          // Spotify fermé : on l'ouvre puis on relance la lecture dès qu'il répond.
          if (!launchApp || !(error instanceof SpotifyError) || error.code !== 'no-device') throw error;
          launchApp();
          await retryWhileStarting(target);
        }
        onPlayed();
        return null;
      } catch (error) {
        return userMessage(error);
      }
    },

    async link(): Promise<string | null> {
      try {
        await session.link();
        return null;
      } catch (error) {
        // Une erreur hors Spotify (fenêtre d'autorisation refusée, adresse de retour non déclarée…) : on en montre la cause.
        if (error instanceof Error && !(error instanceof SpotifyError)) return `Liaison Spotify impossible : ${error.message}`;
        return userMessage(error);
      }
    },

    unlink: () => session.unlink(),
    subscribe: (listener: () => void) => session.subscribe(listener),
  };
}

export type MusicService = ReturnType<typeof createMusicService>;
