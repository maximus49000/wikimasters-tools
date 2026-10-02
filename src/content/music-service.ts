import type { KnownCard } from '../core/collection/collection-book';
import type { KindsRepo } from '../core/kinds/kinds-repo';
import { resolveListen, sameTrack, type Listen } from '../core/music/listen';
import type { ListenRepo } from '../core/music/listen-repo';
import { musicKindOf } from '../core/music/music-kinds';
import type { MusicRepo } from '../core/music/music-repo';
import { SpotifyError, userMessage } from '../core/spotify/errors';
import type { SpotifyApi, Track } from '../core/spotify/spotify-api';
import type { SpotifySession } from '../core/spotify/spotify-session';
import { createListenViewer } from './listen-viewer';
import type { PlayerCard } from './player-source';

export type { ListenView } from './listen-viewer';

export type MusicServiceDeps = {
  collection: { list(): Promise<KnownCard[]> };
  kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>;
  music: Pick<MusicRepo, 'resolve'>;
  // Les listes d'écoute déjà trouvées : Spotify n'est interrogé qu'une fois par carte.
  listens: Pick<ListenRepo, 'load' | 'save'>;
  session: Pick<SpotifySession, 'isLinked' | 'link' | 'unlink' | 'subscribe'>;
  api: Pick<SpotifyApi, 'searchTracks' | 'searchAlbum' | 'albumTracks' | 'play'>;
  // Après un lancement : le mini-lecteur relit l'état tout de suite, et retient la carte qui l'a demandé.
  onPlayed: (card?: PlayerCard) => void;
  // Ouvre l'application Spotify quand aucun appareil n'est actif ; absent sur les plateformes qui ne savent pas le faire.
  launchApp?: () => void;
  // Attente entre deux essais pendant le démarrage de Spotify (remplaçable en test).
  sleep?: (ms: number) => Promise<void>;
};

// Spotify met quelques secondes à se déclarer comme appareil après son ouverture.
const LAUNCH_RETRIES = 8;
const LAUNCH_RETRY_MS = 1500;

export function createMusicService(deps: MusicServiceDeps) {
  const { collection, kinds, music, listens, session, api, onPlayed, launchApp } = deps;
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

  // Message d'une erreur Spotify ; une limite (429) annonce aussi son délai, pour la relance automatique de la fiche.
  const describeError = (error: unknown): { message: string; retryAfterMs?: number } => {
    const retryAfterMs = error instanceof SpotifyError && error.code === 'rate-limited' ? error.retryAfterMs : undefined;
    return { message: userMessage(error), ...(retryAfterMs === undefined ? {} : { retryAfterMs }) };
  };
  const viewer = createListenViewer({ collection, kinds, music, listens, session, resolve: (input) => resolveListen(api, input), describeError });

  return {
    // Les cartes (parmi `cards`) qui ont un lien avec la musique, compte lié ou non : leur nature suffit.
    async musicSlugs(cards: Pick<KnownCard, 'slug'>[]): Promise<Set<string>> {
      await kinds.resolveMissing(cards.map((card) => card.slug));
      const loaded = await kinds.load();
      return new Set(cards.filter((card) => musicKindOf(loaded.cards[card.slug]) !== null).map((card) => card.slug));
    },

    // Les cartes dont la liste d'écoute contient le titre en cours : ce sont celles qui jouent.
    async playingSlugs(cards: Pick<KnownCard, 'slug' | 'title'>[], track: Pick<Track, 'uri' | 'title' | 'artist'>): Promise<Set<string>> {
      const playing = new Set<string>();
      const loaded = await kinds.load();
      const kept = await listens.load();
      for (const card of cards) {
        const kind = musicKindOf(loaded.cards[card.slug]);
        if (!kind) continue;
        let listen: Listen | null;
        try {
          if (!kept.has(card.slug) && !(await session.isLinked())) return playing;
          listen = await viewer.listenOf(card, kind, kept);
        } catch {
          // Une erreur passagère (réseau, limite) n'est pas gardée : on réessaiera au titre suivant.
          continue;
        }
        if (listen?.items.some((item) => sameTrack(item, track))) playing.add(card.slug);
      }
      return playing;
    },

    // Ce que la fiche d'une carte propose d'écouter : rien, lier le compte, des pistes, ou une erreur.
    view: (slug: string, title: string) => viewer.show(slug, title, false),

    // Redemande la liste à Spotify (bouton d'actualisation des meilleurs titres d'un artiste) ; une panne laisse la liste gardée.
    refresh: (slug: string, title: string) => viewer.show(slug, title, true),

    // Lance une piste ; rend null si tout va bien, sinon le message à afficher.
    // `card` : la carte dont la fiche propose cette lecture (le lecteur en offre ensuite la fiche).
    async play(item: Track, listen: Listen, card?: PlayerCard): Promise<string | null> {
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
        onPlayed(card);
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
    isLinked: () => session.isLinked(),
    subscribe: (listener: () => void) => session.subscribe(listener),
  };
}

export type MusicService = ReturnType<typeof createMusicService>;
