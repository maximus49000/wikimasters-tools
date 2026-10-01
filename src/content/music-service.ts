import type { KnownCard } from '../core/collection/collection-book';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { resolveListen, type Listen } from '../core/music/listen';
import { musicKindOf } from '../core/music/music-kinds';
import type { MusicRepo } from '../core/music/music-repo';
import { userMessage } from '../core/spotify/errors';
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
};

export function createMusicService(deps: MusicServiceDeps) {
  const { collection, kinds, music, session, api, onPlayed } = deps;

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
      try {
        await api.play(listen.albumUri ? { contextUri: listen.albumUri, offsetUri: item.uri } : { uris: [item.uri] });
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
        return userMessage(error);
      }
    },

    unlink: () => session.unlink(),
    subscribe: (listener: () => void) => session.subscribe(listener),
  };
}

export type MusicService = ReturnType<typeof createMusicService>;
