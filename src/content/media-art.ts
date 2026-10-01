import type { KindsRepo } from '../core/kinds/kinds-repo';
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
};

type Art = (slug: string, title: string) => Promise<string[]>;
// `primary` : pochette / affiche exacte ; `fallback` : à défaut de toute image, la photo de l'artiste ou l'affiche la plus proche du nom.
export type MediaArt = { primary: Art; fallback: Art };

// Les guillemets casseraient la requête de recherche Spotify.
const quoted = (text: string): string => text.replaceAll('"', '').trim();

// Pochette (album, single) ou affiche (film, série) d'une carte, pour remplacer l'image manquante.
// Aucune source utilisable (compte non lié, autre type de carte, rien trouvé) : liste vide, Wikipédia prend le relais.
export function createMediaArt(deps: { kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>; sources: MediaArtSources }): MediaArt {
  async function kindsOf(slug: string) {
    await deps.kinds.resolveMissing([slug]);
    const cardKinds = (await deps.kinds.load()).cards[slug];
    return { music: musicKindOf(cardKinds), screen: screenKindOf(cardKinds) };
  }

  const performerOf = async (spotify: NonNullable<MediaArtSources['spotify']>, slug: string): Promise<string | undefined> =>
    (await spotify.music.resolve([slug]))[slug]?.performer;

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
      const { spotify, tmdb } = deps.sources;
      if (!spotify && !tmdb) return [];
      const { music, screen } = await kindsOf(slug);
      const query = quoted(cleanTitle(title));
      if (spotify && (music === 'album' || music === 'track')) {
        if (!(await spotify.session.isLinked())) return [];
        const performer = await performerOf(spotify, slug);
        return one(await oneAtATime(() => spotify.api.findCover(music, query, performer ? quoted(performer) : undefined)));
      }
      if (tmdb && (screen === 'film' || screen === 'series')) return one(await tmdb.posterUrl(screen, cleanTitle(title)));
      return [];
    },

    async fallback(slug, title) {
      const { spotify, tmdb } = deps.sources;
      if (!spotify && !tmdb) return [];
      const { music, screen } = await kindsOf(slug);
      if (spotify && music && (await spotify.session.isLinked())) {
        // Album ou morceau : l'artiste ; carte d'artiste : le titre lui-même.
        const name = music === 'artist' ? quoted(cleanTitle(title)) : await performerOf(spotify, slug);
        return name ? one(await oneAtATime(() => spotify.api.findArtistImage(quoted(name)))) : [];
      }
      if (tmdb && (screen === 'film' || screen === 'series')) return one(await tmdb.closestPosterUrl(cleanTitle(title)));
      return [];
    },
  };
}
