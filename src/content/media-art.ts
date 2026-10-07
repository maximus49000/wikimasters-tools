import type { KindsRepo } from '../core/kinds/kinds-repo';
import { isBookCard } from '../core/book/book-kinds';
import { isVideoGame } from '../core/game/game-kinds';
import { cleanTitle } from '../core/music/listen';
import { musicKindOf } from '../core/music/music-kinds';
import type { MusicRepo } from '../core/music/music-repo';
import { screenKindOf } from '../core/screen/screen-kinds';
import type { SpotifyApi } from '../core/spotify/spotify-api';
import type { SpotifySession } from '../core/spotify/spotify-session';
import type { TmdbApi } from '../core/screen/tmdb-api';

// Sources renseignées au fil du démarrage : Spotify (extension / APK) et TMDB (clé à la compilation) peuvent manquer.
export type MediaArtSources = {
  spotify?: { api: Pick<SpotifyApi, 'findCover' | 'findArtistImage'>; session: Pick<SpotifySession, 'isLinked'>; music: Pick<MusicRepo, 'resolve'> };
  tmdb?: Pick<TmdbApi, 'posterUrl' | 'closestPosterUrl'>;
  // Affiches de jeux vidéo (Steam, IGDB) : même contrat que les autres sources (liste, ou `null` si pas prête).
  game?: { cover(slug: string, title: string): Promise<string[] | null> };
  // Couvertures de livres (Open Library) : même contrat que `game`.
  book?: { cover(slug: string, title: string): Promise<string[] | null> };
};

// Liste (éventuellement vide) : la source a répondu, la réponse est définitive. `null` : elle n'a pas pu répondre
// (compte non lié, source ou natures de la carte pas prêtes) : à redemander plus tard, sans rien mémoriser.
type Art = (slug: string, title: string) => Promise<string[] | null>;
// `primary` : pochette / affiche exacte ; `fallback` : à défaut de toute image, la photo de l'artiste ou l'affiche la plus proche du nom.
// `game` : l'affiche officielle d'un jeu vidéo, même quand la carte a déjà une image Wikipédia (liste vide pour toute autre carte).
export type MediaArt = { primary: Art; fallback: Art; game: Art };

// Les guillemets casseraient la requête de recherche Spotify.
const quoted = (text: string): string => text.replaceAll('"', '').trim();

// Pochette (album, single) ou affiche (film, série) d'une carte, pour remplacer l'image manquante.
// Autre type de carte, ou rien trouvé : liste vide (Wikipédia prend le relais). Source pas prête : null.
export function createMediaArt(deps: { kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>; sources: MediaArtSources }): MediaArt {
  async function kindsOf(slug: string) {
    await deps.kinds.resolveMissing([slug]);
    const cardKinds = (await deps.kinds.load()).cards[slug];
    // `known` : Wikidata a répondu pour cette carte ; sinon on ignore son type, ce n'est pas « rien à chercher ».
    return { known: cardKinds !== undefined, music: musicKindOf(cardKinds), screen: screenKindOf(cardKinds), game: isVideoGame(cardKinds), book: isBookCard(cardKinds) };
  }

  // `undefined` : Wikidata n'a pas répondu (hors ligne, limite…) ; `null` : réponse sans interprète. Chercher sans l'interprète donnerait une réponse peu fiable, qu'on mémoriserait.
  const performerOf = async (spotify: NonNullable<MediaArtSources['spotify']>, slug: string): Promise<string | null | undefined> => {
    const cardMusic = (await spotify.music.resolve([slug]))[slug];
    return cardMusic === undefined ? undefined : (cardMusic.performer ?? null);
  };

  const one = (url: string | null): string[] => (url ? [url] : []);

  // Une recherche Spotify à la fois : une page de cartes sans image en demande des dizaines d'un coup, et Spotify limite l'application entière.
  // Une recherche en échec ne bloque pas les suivantes.
  let queue: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job);
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    async primary(slug, title) {
      const { spotify, tmdb, game: gameArt, book: bookArt } = deps.sources;
      if (!spotify && !tmdb && !gameArt && !bookArt) return null;
      const { known, music, screen, game, book } = await kindsOf(slug);
      if (!known) return null;
      const query = quoted(cleanTitle(title));
      if (music === 'album' || music === 'track') {
        if (!spotify || !(await spotify.session.isLinked())) return null;
        const performer = await performerOf(spotify, slug);
        if (performer === undefined) return null;
        return one(await oneAtATime(() => spotify.api.findCover(music, query, performer ? quoted(performer) : undefined)));
      }
      if (screen === 'film' || screen === 'series') return tmdb ? one(await tmdb.posterUrl(screen, cleanTitle(title))) : null;
      if (game) return gameArt ? gameArt.cover(slug, title) : null;
      if (book) return bookArt ? bookArt.cover(slug, title) : null;
      return [];
    },

    async game(slug, title) {
      const { game: gameArt } = deps.sources;
      if (!gameArt) return null;
      // La source de jeux tranche elle-même (nature de la carte, choix de l'utilisateur) : liste vide si ce n'est pas un jeu.
      return gameArt.cover(slug, title);
    },

    async fallback(slug, title) {
      const { spotify, tmdb } = deps.sources;
      if (!spotify && !tmdb) return null;
      const { known, music, screen } = await kindsOf(slug);
      if (!known) return null;
      if (music) {
        if (!spotify || !(await spotify.session.isLinked())) return null;
        // Album ou morceau : l'artiste ; carte d'artiste : le titre lui-même.
        const name = music === 'artist' ? quoted(cleanTitle(title)) : await performerOf(spotify, slug);
        if (name === undefined) return null;
        return name ? one(await oneAtATime(() => spotify.api.findArtistImage(quoted(name)))) : [];
      }
      if (screen === 'film' || screen === 'series') return tmdb ? one(await tmdb.closestPosterUrl(cleanTitle(title))) : null;
      return [];
    },
  };
}
