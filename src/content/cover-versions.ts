import { coverUrl } from '../core/book/book-format';
import { RELAY_BASE } from '../core/documentary/config';
import { boxartUrl } from '../core/game/tgdb-api';
import type { ShelfShape } from '../core/library/library-types';
import { cleanTitle } from '../core/music/listen';
import type { MusicRepo } from '../core/music/music-repo';
import type { TmdbApi } from '../core/screen/tmdb-api';
import type { SpotifyApi } from '../core/spotify/spotify-api';
import type { SpotifySession } from '../core/spotify/spotify-session';
import type { BookService } from './book-service';
import type { GameBoxService } from './game-box-service';

// Versions de pochette d'un objet posé dans la pièce (spec disposition, « Changer la version ») : la source dépend du FORMAT
// de l'objet, pas de la nature de la carte (un film rangé en CD cherche des pochettes d'album).
// CD : Spotify (compte lié) d'abord, Deezer par le relais seulement si Spotify n'a rien, est en erreur ou n'est pas lié.
// DVD : affiches TMDB (fr, en, sans langue). Jeu : jaquettes des versions TheGamesDB. Livre : couvertures Open Library des candidats.
// Toute erreur, tout délai dépassé → [] (le bouton sera grisé) ; jamais d'adresse inventée : https seulement, sans doublon, 12 au plus.

// Sources renseignées au fil du démarrage de la surcouche (chacune peut manquer).
export type CoverVersionSources = {
  spotify?: { api: Pick<SpotifyApi, 'findCovers'>; session: Pick<SpotifySession, 'isLinked'> };
  // Interprète d'un album (Wikidata) quand la carte ne le donne pas.
  music?: Pick<MusicRepo, 'resolve'>;
  tmdb?: Pick<TmdbApi, 'posterVersions'>;
  game?: Pick<GameBoxService, 'versions'>;
  book?: Pick<BookService, 'candidates'>;
};
export type VersionCard = { slug: string; title: string; performer?: string };
export type CoverVersions = (card: VersionCard, shape: ShelfShape) => Promise<string[]>;

const MAX_VERSIONS = 12;
const TIMEOUT_MS = 15_000;

// Les guillemets casseraient la requête de recherche Spotify.
const quoted = (text: string): string => text.replaceAll('"', '').trim();

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
const clean = (urls: readonly unknown[]): string[] => [...new Set(urls.filter((url): url is string => typeof url === 'string' && isHttps(url)))].slice(0, MAX_VERSIONS);

export function createCoverVersions(deps: { sources: CoverVersionSources; fetch: (url: string) => Promise<Response>; timeoutMs?: number }): CoverVersions {
  const { sources } = deps;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;

  // `undefined` : pas d'interprète connu (la recherche se fait sur le titre seul).
  async function performerOf(card: VersionCard): Promise<string | undefined> {
    if (card.performer) return card.performer;
    try {
      return (await sources.music?.resolve([card.slug]))?.[card.slug]?.performer ?? undefined;
    } catch {
      return undefined;
    }
  }

  async function fromSpotify(title: string, performer: string | undefined): Promise<string[]> {
    const spotify = sources.spotify;
    if (!spotify) return [];
    try {
      if (!(await spotify.session.isLinked())) return [];
      return clean(await spotify.api.findCovers(quoted(title), performer ? quoted(performer) : undefined));
    } catch {
      // Limite, jeton refusé… : Deezer prend le relais.
      return [];
    }
  }

  // Relais pas encore redéployé (404), panne, réponse illisible : [].
  async function fromDeezer(title: string, performer: string | undefined): Promise<string[]> {
    try {
      const query = new URLSearchParams({ title, ...(performer ? { artist: performer } : {}) });
      const response = await deps.fetch(`${RELAY_BASE}/deezer-covers?${query.toString()}`);
      if (!response.ok) return [];
      const body = (await response.json()) as { covers?: unknown } | null;
      return Array.isArray(body?.covers) ? clean(body.covers) : [];
    } catch {
      return [];
    }
  }

  async function lookup(card: VersionCard, shape: ShelfShape): Promise<string[]> {
    const title = cleanTitle(card.title);
    if (shape === 'cd') {
      const performer = await performerOf(card);
      const spotify = await fromSpotify(title, performer);
      return spotify.length > 0 ? spotify : fromDeezer(title, performer);
    }
    if (shape === 'dvd') return sources.tmdb ? clean(await sources.tmdb.posterVersions(title)) : [];
    if (shape === 'game') {
      const versions = sources.game ? await sources.game.versions(card.slug, card.title) : [];
      return clean(versions.flatMap((version) => (version.front ? [boxartUrl(version.front, 'medium')] : [])));
    }
    const candidates = sources.book ? await sources.book.candidates(card.title) : { works: [] };
    return clean(candidates.works.flatMap((work) => (work.coverId !== undefined ? [coverUrl(work.coverId)] : [])));
  }

  return (card, shape) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<string[]>((resolve) => {
      timer = setTimeout(() => resolve([]), timeoutMs);
    });
    return Promise.race([lookup(card, shape).catch((): string[] => []), late]).finally(() => clearTimeout(timer));
  };
}

// Créé une fois par la surcouche ; la pièce le lit ici. Rien d'enregistré : aucune version ([]).
let current: CoverVersions | null = null;
export const setCoverVersions = (next: CoverVersions | null): void => {
  current = next;
};
export const coverVersions = (card: VersionCard, shape: ShelfShape): Promise<string[]> => (current ? current(card, shape) : Promise.resolve([]));
