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
// CD : Spotify (compte lié) d'abord, Deezer par le relais seulement si Spotify n'a rien, est en erreur, n'est pas lié ou ne répond pas
// dans son propre délai (8 s, plus court que le délai global de 15 s).
// DVD : affiches TMDB (fr, en, sans langue). Jeu : jaquettes des versions TheGamesDB. Livre : couvertures Open Library des candidats.
// Réponse : les adresses et `sure` — vrai si la dernière source interrogée a répondu (une liste vide est alors définitive : le bouton
// se grise et la réponse est gardée pour la séance) ; faux après une erreur, un délai dépassé, un relais pas redéployé ou une source
// absente (on pourra réessayer). Jamais d'adresse inventée : https seulement, sans doublon, 12 au plus.

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
export type CoverLookup = { urls: string[]; sure: boolean };
export type CoverVersions = (card: VersionCard, shape: ShelfShape) => Promise<CoverLookup>;
const UNSURE: CoverLookup = { urls: [], sure: false };

const MAX_VERSIONS = 12;
const TIMEOUT_MS = 15_000;
// Spotify a son propre délai, plus court (sa file d'attente peut être occupée par la lecture) : Deezer a encore le temps de répondre.
const SPOTIFY_TIMEOUT_MS = 8_000;

// Réponse incertaine (rien, à réessayer) si `work` échoue ou n'a pas répondu dans `ms`.
function within(work: Promise<CoverLookup>, ms: number): Promise<CoverLookup> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<CoverLookup>((resolve) => {
    timer = setTimeout(() => resolve(UNSURE), ms);
  });
  return Promise.race([work.catch((): CoverLookup => UNSURE), late]).finally(() => clearTimeout(timer));
}
const sure = (urls: string[]): CoverLookup => ({ urls, sure: true });

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

export function createCoverVersions(deps: { sources: CoverVersionSources; fetch: (url: string) => Promise<Response>; timeoutMs?: number; spotifyTimeoutMs?: number }): CoverVersions {
  const { sources } = deps;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const spotifyTimeoutMs = deps.spotifyTimeoutMs ?? SPOTIFY_TIMEOUT_MS;

  // `undefined` : pas d'interprète connu (la recherche se fait sur le titre seul).
  async function performerOf(card: VersionCard): Promise<string | undefined> {
    if (card.performer) return card.performer;
    try {
      return (await sources.music?.resolve([card.slug]))?.[card.slug]?.performer ?? undefined;
    } catch {
      return undefined;
    }
  }

  // Pas lié, limite, jeton refusé… : Deezer prend le relais (seules des pochettes trouvées comptent ici).
  async function fromSpotify(title: string, performer: string | undefined): Promise<CoverLookup> {
    const spotify = sources.spotify;
    if (!spotify || !(await spotify.session.isLinked())) return UNSURE;
    return sure(clean(await spotify.api.findCovers(quoted(title), performer ? quoted(performer) : undefined)));
  }

  // Relais pas encore redéployé (404), panne, réponse illisible : incertain (à réessayer).
  async function fromDeezer(title: string, performer: string | undefined): Promise<CoverLookup> {
    try {
      const query = new URLSearchParams({ title, ...(performer ? { artist: performer } : {}) });
      const response = await deps.fetch(`${RELAY_BASE}/deezer-covers?${query.toString()}`);
      if (!response.ok) return UNSURE;
      const body = (await response.json()) as { covers?: unknown } | null;
      return Array.isArray(body?.covers) ? sure(clean(body.covers)) : UNSURE;
    } catch {
      return UNSURE;
    }
  }

  // Une erreur levée par une source rend la réponse incertaine (within) ; une source absente aussi.
  async function lookup(card: VersionCard, shape: ShelfShape): Promise<CoverLookup> {
    const title = cleanTitle(card.title);
    if (shape === 'cd') {
      const performer = await performerOf(card);
      const spotify = await within(fromSpotify(title, performer), spotifyTimeoutMs);
      return spotify.urls.length > 0 ? spotify : fromDeezer(title, performer);
    }
    if (shape === 'dvd') return sources.tmdb ? sure(clean(await sources.tmdb.posterVersions(title))) : UNSURE;
    if (shape === 'game') {
      if (!sources.game) return UNSURE;
      const versions = await sources.game.versions(card.slug, card.title);
      return sure(clean(versions.flatMap((version) => (version.front ? [boxartUrl(version.front, 'medium')] : []))));
    }
    if (!sources.book) return UNSURE;
    const candidates = await sources.book.candidates(card.title);
    return sure(clean(candidates.works.flatMap((work) => (work.coverId !== undefined ? [coverUrl(work.coverId)] : []))));
  }

  return (card, shape) => within(lookup(card, shape), timeoutMs);
}

// Créé une fois par la surcouche ; la pièce le lit ici. Rien d'enregistré : aucune version, incertain. Une liste seule (bancs, tests)
// vaut réponse sûre.
type Registered = (card: VersionCard, shape: ShelfShape) => Promise<CoverLookup | string[]>;
let current: Registered | null = null;
export const setCoverVersions = (next: Registered | null): void => {
  current = next;
};
export const coverVersions = async (card: VersionCard, shape: ShelfShape): Promise<CoverLookup> => {
  if (!current) return UNSURE;
  try {
    const out = await current(card, shape);
    return Array.isArray(out) ? sure(out) : out;
  } catch {
    return UNSURE;
  }
};
