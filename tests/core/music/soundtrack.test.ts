import { describe, expect, it, vi } from 'vitest';
import { isSoundtrackOf, listenOfChoice, resolveSoundtrack, searchSoundtracks } from '../../../src/core/music/soundtrack';

const tracks = [{ uri: 'spotify:track:1', title: 'Dream Is Collapsing', artist: 'Hans Zimmer' }];

describe('isSoundtrackOf', () => {
  it('reconnaît les albums de bande originale du film', () => {
    expect(isSoundtrackOf('Inception (Music from the Motion Picture)', 'Inception')).toBe(true);
    expect(isSoundtrackOf('Inception (Original Motion Picture Soundtrack)', 'Inception_(film)')).toBe(true);
    expect(isSoundtrackOf('Dune (Original Score)', 'Dune')).toBe(true);
    expect(isSoundtrackOf('Amélie (Bande originale du film)', 'Amelie')).toBe(true);
    expect(isSoundtrackOf('BO Nos jours Heureux', 'Nos jours heureux')).toBe(true);
  });

  it('écarte un autre album, une reprise ou un autre film', () => {
    expect(isSoundtrackOf('Inception', 'Inception')).toBe(false);
    expect(isSoundtrackOf('Interstellar (Original Motion Picture Soundtrack)', 'Inception')).toBe(false);
    expect(isSoundtrackOf('Inception Soundtrack - Piano Version', 'Inception')).toBe(false);
    expect(isSoundtrackOf('Inception: Karaoke Soundtrack', 'Inception')).toBe(false);
  });
});

describe('resolveSoundtrack', () => {
  it('rend l’album de BO avec son nom, son artiste et ses pistes', async () => {
    const api = {
      searchAlbums: vi.fn(async () => [
        { id: 'X', name: 'Inception', artist: 'Someone' },
        { id: 'OST', name: 'Inception (Music from the Motion Picture)', artist: 'Hans Zimmer' },
      ]),
      searchPlaylists: vi.fn(async () => []),
      albumTracks: vi.fn(async () => tracks),
    };
    expect(await resolveSoundtrack(api, ['Inception'])).toEqual({
      kind: 'album',
      items: tracks,
      albumUri: 'spotify:album:OST',
      album: { name: 'Inception (Music from the Motion Picture)', artist: 'Hans Zimmer' },
    });
    expect(api.albumTracks).toHaveBeenCalledWith('OST');
  });

  it('essaie le titre d’origine quand le titre français ne donne rien, sans redemander deux fois le même nom', async () => {
    const api = {
      searchAlbums: vi.fn(async (query: string) => (query.includes('Godfather') ? [{ id: 'G', name: 'The Godfather (Original Soundtrack)', artist: 'Nino Rota' }] : [])),
      searchPlaylists: vi.fn(async () => []),
      albumTracks: vi.fn(async () => tracks),
    };
    const listen = await resolveSoundtrack(api, ['Le Parrain', 'The Godfather', 'the godfather']);
    expect(listen?.albumUri).toBe('spotify:album:G');
    expect(api.searchAlbums).toHaveBeenCalledTimes(2);
  });

  it('rend null quand Spotify n’a pas de BO', async () => {
    const api = { searchAlbums: vi.fn(async () => [{ id: 'X', name: 'Autre chose', artist: 'A' }]), searchPlaylists: vi.fn(async () => []), albumTracks: vi.fn(async () => tracks) };
    expect(await resolveSoundtrack(api, ['Inception'])).toBeNull();
    expect(api.albumTracks).not.toHaveBeenCalled();
  });
});

describe('resolveSoundtrack : playlist', () => {
  it('à défaut d’album, prend la playlist de BO (lue en entier, sans liste de pistes)', async () => {
    const api = {
      searchAlbums: vi.fn(async () => [{ id: 'X', name: 'Nos jours heureux', artist: 'ßaptiste' }]),
      searchPlaylists: vi.fn(async () => [
        { id: 'P0', name: 'Playlist sans rapport', owner: 'Quelqu’un' },
        { id: 'P1', name: 'BO Nos jours Heureux', owner: 'Léa Hautier' },
      ]),
      albumTracks: vi.fn(async () => tracks),
    };
    expect(await resolveSoundtrack(api, ['Nos jours heureux'])).toEqual({
      kind: 'album',
      items: [],
      albumUri: 'spotify:playlist:P1',
      album: { name: 'BO Nos jours Heureux', artist: 'Léa Hautier' },
    });
    expect(api.albumTracks).not.toHaveBeenCalled();
  });

  it('préfère l’album à la playlist, sans chercher de playlist', async () => {
    const api = {
      searchAlbums: vi.fn(async () => [{ id: 'OST', name: 'Inception (Original Motion Picture Soundtrack)', artist: 'Hans Zimmer' }]),
      searchPlaylists: vi.fn(async () => []),
      albumTracks: vi.fn(async () => tracks),
    };
    expect((await resolveSoundtrack(api, ['Inception']))?.albumUri).toBe('spotify:album:OST');
    expect(api.searchPlaylists).not.toHaveBeenCalled();
  });
});

describe('searchSoundtracks', () => {
  it('rend les albums puis les playlists, et rien pour un texte vide', async () => {
    const api = {
      searchAlbums: vi.fn(async () => [{ id: 'A', name: 'Un album', artist: 'Art' }]),
      searchPlaylists: vi.fn(async () => [{ id: 'P', name: 'Une playlist', owner: 'Moi' }]),
    };
    expect(await searchSoundtracks(api, '  "BO" film ')).toEqual([
      { kind: 'album', id: 'A', name: 'Un album', by: 'Art' },
      { kind: 'playlist', id: 'P', name: 'Une playlist', by: 'Moi' },
    ]);
    expect(api.searchAlbums).toHaveBeenCalledWith('BO film');
    expect(await searchSoundtracks(api, '   ')).toEqual([]);
  });
});

describe('listenOfChoice', () => {
  it('un album : ses pistes ; vide : null', async () => {
    const choice = { kind: 'album', id: 'A', name: 'Un album', by: 'Art' } as const;
    expect(await listenOfChoice({ albumTracks: async () => tracks }, choice)).toEqual({ kind: 'album', items: tracks, albumUri: 'spotify:album:A', album: { name: 'Un album', artist: 'Art' } });
    expect(await listenOfChoice({ albumTracks: async () => [] }, choice)).toBeNull();
  });
});
