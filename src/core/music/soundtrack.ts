import type { SpotifyApi } from '../spotify/spotify-api';
import { cleanTitle, normalize, type Listen } from './listen';

type Api = Pick<SpotifyApi, 'searchAlbums' | 'albumTracks'>;

// Un album de bande originale se reconnaît à son nom : « Titre (Original Motion Picture Soundtrack) », « … Score », « … OST ».
const SOUNDTRACK = /\b(soundtrack|score|ost|bande originale|musique originale|musique du film|motion picture|music from)\b/;
// Reprises et variantes qui ne sont pas la BO du film.
const NOT_ORIGINAL = /\b(karaoke|tribute|covers?|lullaby|lullabies|inspired by|piano version)\b/;

const quoted = (text: string): string => text.replaceAll('"', '').trim();

export const isSoundtrackOf = (albumName: string, title: string): boolean => {
  const name = normalize(albumName);
  const wanted = normalize(cleanTitle(title));
  return wanted !== '' && name.includes(wanted) && SOUNDTRACK.test(name) && !NOT_ORIGINAL.test(name);
};

// La BO d'un film ou d'une série : on cherche avec chaque titre connu (français, puis original) jusqu'à trouver un album dont le nom convient.
// Les titres sont ceux de TMDB ; `null` : Spotify n'a pas de BO sous aucun de ces noms.
export async function resolveSoundtrack(api: Api, titles: string[]): Promise<Listen | null> {
  const seen = new Set<string>();
  for (const raw of titles) {
    const title = quoted(cleanTitle(raw));
    const key = normalize(title);
    if (title === '' || seen.has(key)) continue;
    seen.add(key);
    const found = (await api.searchAlbums(`"${title}" soundtrack`)).find((album) => isSoundtrackOf(album.name, title));
    if (!found) continue;
    const items = await api.albumTracks(found.id);
    if (items.length > 0) return { kind: 'album', items, albumUri: `spotify:album:${found.id}`, album: { name: found.name, artist: found.artist } };
  }
  return null;
}
