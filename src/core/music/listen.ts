import type { SpotifyApi, Track } from '../spotify/spotify-api';
import type { MusicKind } from './music-kinds';
import type { CardMusic } from './wikidata-music';

export type Listen = { kind: MusicKind; items: Track[]; albumUri?: string };

// « Yesterday_(chanson) » → « Yesterday » : la précision de Wikipédia nuit à la recherche Spotify.
export const cleanTitle = (title: string): string =>
  title.replaceAll('_', ' ').replace(/\s*\([^)]*\)\s*$/, '').trim();

// Les guillemets casseraient la requête de recherche.
const quoted = (text: string): string => text.replaceAll('"', '').trim();
export const normalize = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Le titre joué est-il celui de la liste ? Même URI, ou à défaut même titre et même artiste (Spotify propose parfois
// plusieurs versions du même morceau) ; un artiste qui en contient un autre (« A, B » et « A ») compte comme le même.
export function sameTrack(a: Pick<Track, 'uri' | 'title' | 'artist'>, b: Pick<Track, 'uri' | 'title' | 'artist'>): boolean {
  if (a.uri === b.uri) return true;
  const title = normalize(a.title);
  if (title === '' || title !== normalize(b.title)) return false;
  const artistA = normalize(a.artist);
  const artistB = normalize(b.artist);
  return artistA === '' || artistB === '' || artistA.includes(artistB) || artistB.includes(artistA);
}

type Api = Pick<SpotifyApi, 'searchTracks' | 'searchAlbum' | 'albumTracks'>;

// Ce qu'on peut écouter d'une carte : l'identifiant Spotify de Wikidata d'abord, sinon une recherche titre + interprète.
export async function resolveListen(api: Api, input: { title: string; kind: MusicKind; music: CardMusic }): Promise<Listen | null> {
  const { kind, music } = input;
  const title = quoted(cleanTitle(input.title));

  if (kind === 'track') {
    if (music.trackId) {
      return { kind, items: [{ uri: `spotify:track:${music.trackId}`, title, artist: music.performer ?? '' }] };
    }
    if (!music.performer) return null;
    const [first] = await api.searchTracks(`track:"${title}" artist:"${quoted(music.performer)}"`, 1);
    return first ? { kind, items: [{ uri: first.uri, title: first.title, artist: first.artist }] } : null;
  }

  if (kind === 'album') {
    const albumId = music.albumId ?? (music.performer ? await api.searchAlbum(title, quoted(music.performer)) : null);
    if (!albumId) return null;
    const items = await api.albumTracks(albumId);
    return items.length > 0 ? { kind, items, albumUri: `spotify:album:${albumId}` } : null;
  }

  // Artiste : ses titres les plus pertinents pour Spotify (le classement officiel n'est plus disponible).
  const found = await api.searchTracks(`artist:"${title}"`, 10);
  const wanted = normalize(title);
  const own = found.filter((track) => (music.artistId ? track.artistIds.includes(music.artistId) : track.artists.some((name) => normalize(name) === wanted)));
  return own.length > 0 ? { kind, items: own.map(({ uri, title: name, artist }) => ({ uri, title: name, artist })) } : null;
}
