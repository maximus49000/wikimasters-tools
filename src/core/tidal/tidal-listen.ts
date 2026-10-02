import { cleanTitle, normalize, type Listen } from '../music/listen';
import type { MusicKind } from '../music/music-kinds';
import type { CardMusic } from '../music/wikidata-music';
import type { TidalApi } from './tidal-api';

export type TidalSearch = Pick<TidalApi, 'searchTracks' | 'searchAlbums' | 'searchArtists' | 'albumTracks' | 'artistTracks'>;

const trackUri = (id: string): string => `tidal:track:${id}`;
const albumUri = (id: string): string => `tidal:album:${id}`;
const TOP_TRACKS = 10;

// La page d'écoute Tidal d'une piste ou d'un album (le ↗ de la fiche) ; null pour toute autre URI.
export function tidalUrl(uri: string): string | null {
  const match = /^tidal:(track|album):(\d+)$/.exec(uri);
  return match ? `https://tidal.com/browse/${match[1]}/${match[2]}` : null;
}

// « Abbey Road (Remastered) » compte pour « Abbey Road » ; « Ghost Towns » ou un hommage qui contient le titre, non.
const sameTitle = (candidate: string, wanted: string): boolean => {
  const found = normalize(candidate);
  const target = normalize(wanted);
  return found === target || found.startsWith(`${target} `);
};

// Un artiste qui en contient un autre (« A, B » et « A ») compte comme le même.
const hasArtist = (artists: string[], performer: string): boolean => {
  const target = normalize(performer);
  return artists.some((name) => {
    const found = normalize(name);
    return found.includes(target) || target.includes(found);
  });
};

// Ce qu'on peut écouter d'une carte sur Tidal : une recherche titre + interprète, vérifiée (la 1ʳᵉ réponse n'est pas toujours la bonne).
export async function resolveTidalListen(api: TidalSearch, input: { title: string; kind: MusicKind; music: CardMusic }): Promise<Listen | null> {
  const { kind, music } = input;
  const title = cleanTitle(input.title);
  const performer = music.performer;

  if (kind === 'track') {
    if (!performer) return null;
    const hit = (await api.searchTracks(`${title} ${performer}`)).find((track) => sameTitle(track.title, title) && hasArtist(track.artists, performer));
    return hit ? { kind, items: [{ uri: trackUri(hit.id), title: hit.title, artist: hit.artists.join(', ') }] } : null;
  }

  if (kind === 'album') {
    const hit = (await api.searchAlbums(performer ? `${title} ${performer}` : title)).find((album) => sameTitle(album.title, title) && (!performer || hasArtist(album.artists, performer)));
    if (!hit) return null;
    const items = await api.albumTracks(hit.id);
    const artist = hit.artists.join(', ');
    return items.length > 0 ? { kind, albumUri: albumUri(hit.id), items: items.map((item) => ({ uri: trackUri(item.id), title: item.title, artist })) } : null;
  }

  // Artiste : seulement un artiste du même nom, puis ses titres les plus en vue (un seul par titre).
  const artist = (await api.searchArtists(title)).find((candidate) => normalize(candidate.name) === normalize(title));
  if (!artist) return null;
  const seen = new Set<string>();
  const items = (await api.artistTracks(artist.id, TOP_TRACKS)).filter((track) => {
    const key = normalize(track.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return items.length > 0 ? { kind, items: items.map((track) => ({ uri: trackUri(track.id), title: track.title, artist: artist.name })) } : null;
}
