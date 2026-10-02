import { cleanTitle, normalize, type Listen } from '../music/listen';
import { isSoundtrackOf } from '../music/soundtrack';
import type { TidalApi } from './tidal-api';

type Api = Pick<TidalApi, 'searchAlbums'>;

// Même démarche que pour Spotify (titre français, puis titre d'origine), mais sans la liste des pistes : pour Tidal la BO n'est qu'un lien vers l'album,
// donc un seul appel par film. `items` reste vide ; la lecture dans l'appli, le jour où Tidal l'aura, pourra la demander alors.
export async function resolveTidalSoundtrack(api: Api, titles: string[]): Promise<Listen | null> {
  const seen = new Set<string>();
  for (const raw of titles) {
    const title = cleanTitle(raw).replaceAll('"', '').trim();
    const key = normalize(title);
    if (title === '' || seen.has(key)) continue;
    seen.add(key);
    const found = (await api.searchAlbums(`${title} soundtrack`)).find((album) => isSoundtrackOf(album.title, title));
    if (found) return { kind: 'album', items: [], albumUri: `tidal:album:${found.id}`, album: { name: found.title, artist: found.artists.join(', ') } };
  }
  return null;
}
