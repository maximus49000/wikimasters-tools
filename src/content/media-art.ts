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
  spotify?: { api: Pick<SpotifyApi, 'findCover'>; session: Pick<SpotifySession, 'isLinked'>; music: Pick<MusicRepo, 'resolve'> };
  tmdb?: Pick<TmdbApi, 'posterUrl'>;
};

export type MediaArt = (slug: string, title: string) => Promise<string[]>;

// Les guillemets casseraient la requête de recherche Spotify.
const quoted = (text: string): string => text.replaceAll('"', '').trim();

// Pochette (album, single) ou affiche (film, série) d'une carte, pour remplacer l'image manquante.
// Aucune source utilisable (compte non lié, autre type de carte, rien trouvé) : liste vide, Wikipédia prend le relais.
export function createMediaArt(deps: { kinds: Pick<KindsRepo, 'resolveMissing' | 'load'>; sources: MediaArtSources }): MediaArt {
  return async (slug, title) => {
    const { spotify, tmdb } = deps.sources;
    if (!spotify && !tmdb) return [];
    await deps.kinds.resolveMissing([slug]);
    const cardKinds = (await deps.kinds.load()).cards[slug];
    const query = quoted(cleanTitle(title));

    const music = musicKindOf(cardKinds);
    if (spotify && (music === 'album' || music === 'track')) {
      if (!(await spotify.session.isLinked())) return [];
      const performer = (await spotify.music.resolve([slug]))[slug]?.performer;
      const cover = await spotify.api.findCover(music, query, performer ? quoted(performer) : undefined);
      return cover ? [cover] : [];
    }

    const screen = screenKindOf(cardKinds);
    if (tmdb && (screen === 'film' || screen === 'series')) {
      const poster = await tmdb.posterUrl(screen, cleanTitle(title));
      return poster ? [poster] : [];
    }
    return [];
  };
}
