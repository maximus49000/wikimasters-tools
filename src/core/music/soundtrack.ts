import type { SpotifyApi } from '../spotify/spotify-api';
import { cleanTitle, normalize, type Listen } from './listen';

type Api = Pick<SpotifyApi, 'searchAlbums' | 'searchPlaylists' | 'albumTracks'>;

// Un résultat de recherche de BO : un album ou une playlist (`by` : l'artiste ou le créateur).
export type SoundtrackChoice = { kind: 'album' | 'playlist'; id: string; name: string; by: string };

// Un album de bande originale se reconnaît à son nom : « Titre (Original Motion Picture Soundtrack) », « … Score », « … OST », « BO Titre ».
const SOUNDTRACK = /\b(soundtrack|score|ost|bo|bof|bande originale|musique originale|musique du film|motion picture|music from)\b/;
// Reprises et variantes qui ne sont pas la BO du film.
const NOT_ORIGINAL = /\b(karaoke|tribute|covers?|lullaby|lullabies|inspired by|piano version)\b/;

const quoted = (text: string): string => text.replaceAll('"', '').trim();

export const isSoundtrackOf = (albumName: string, title: string): boolean => {
  const name = normalize(albumName);
  const wanted = normalize(cleanTitle(title));
  return wanted !== '' && name.includes(wanted) && SOUNDTRACK.test(name) && !NOT_ORIGINAL.test(name);
};

// La liste d'écoute d'un résultat choisi : un album avec ses pistes, ou une playlist lue en entier par son contexte (sans liste de pistes).
export async function listenOfChoice(api: Pick<SpotifyApi, 'albumTracks'>, choice: SoundtrackChoice): Promise<Listen | null> {
  const album = { name: choice.name, artist: choice.by };
  if (choice.kind === 'playlist') return { kind: 'album', items: [], albumUri: `spotify:playlist:${choice.id}`, album };
  const items = await api.albumTracks(choice.id);
  return items.length > 0 ? { kind: 'album', items, albumUri: `spotify:album:${choice.id}`, album } : null;
}

// Recherche libre (saisie à la main) : les albums d'abord, puis les playlists.
export async function searchSoundtracks(api: Pick<Api, 'searchAlbums' | 'searchPlaylists'>, query: string): Promise<SoundtrackChoice[]> {
  const text = quoted(query);
  if (text === '') return [];
  const albums = await api.searchAlbums(text);
  const playlists = await api.searchPlaylists(text);
  return [
    ...albums.map((album): SoundtrackChoice => ({ kind: 'album', id: album.id, name: album.name, by: album.artist })),
    ...playlists.map((playlist): SoundtrackChoice => ({ kind: 'playlist', id: playlist.id, name: playlist.name, by: playlist.owner })),
  ];
}

// La BO d'un film ou d'une série : on cherche avec chaque titre connu (français, puis original) un album dont le nom convient ;
// faute d'album, une playlist de BO au même nom. Les titres sont ceux de TMDB ; `null` : rien trouvé sous aucun de ces noms.
export async function resolveSoundtrack(api: Api, titles: string[]): Promise<Listen | null> {
  const wanted: string[] = [];
  const seen = new Set<string>();
  for (const raw of titles) {
    const title = quoted(cleanTitle(raw));
    const key = normalize(title);
    if (title === '' || seen.has(key)) continue;
    seen.add(key);
    wanted.push(title);
  }
  for (const title of wanted) {
    const found = (await api.searchAlbums(`"${title}" soundtrack`)).find((album) => isSoundtrackOf(album.name, title));
    if (!found) continue;
    const listen = await listenOfChoice(api, { kind: 'album', id: found.id, name: found.name, by: found.artist });
    if (listen) return listen;
  }
  for (const title of wanted) {
    const found = (await api.searchPlaylists(`${title} bande originale`)).find((playlist) => isSoundtrackOf(playlist.name, title));
    if (found) return listenOfChoice(api, { kind: 'playlist', id: found.id, name: found.name, by: found.owner });
  }
  return null;
}
