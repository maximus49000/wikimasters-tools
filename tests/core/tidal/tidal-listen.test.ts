import { describe, expect, it, vi } from 'vitest';
import { resolveTidalListen, tidalUrl, type TidalSearch } from '../../../src/core/tidal/tidal-listen';

const api = (over: Partial<TidalSearch> = {}): TidalSearch => ({
  searchTracks: vi.fn(async () => []),
  searchAlbums: vi.fn(async () => []),
  searchArtists: vi.fn(async () => []),
  albumTracks: vi.fn(async () => []),
  artistTracks: vi.fn(async () => []),
  ...over,
});

describe('resolveTidalListen, titre', () => {
  it("prend le premier titre dont le nom et l'artiste correspondent", async () => {
    const searchTracks = vi.fn(async () => [
      { id: '1', title: 'Ghost Town', artists: ['Reprise Band'] },
      { id: '2', title: 'Ghost Town', artists: ['The Specials'] },
    ]);
    const listen = await resolveTidalListen(api({ searchTracks }), { title: 'Ghost_Town_(chanson)', kind: 'track', music: { performer: 'The Specials' } });
    expect(searchTracks).toHaveBeenCalledWith('Ghost Town The Specials');
    expect(listen).toEqual({ kind: 'track', items: [{ uri: 'tidal:track:2', title: 'Ghost Town', artist: 'The Specials' }] });
  });

  it('accepte une version du titre, refuse un autre titre, et rend null sans interprète', async () => {
    const searchTracks = vi.fn(async () => [
      { id: '9', title: 'Ghost Town (Live)', artists: ['The Specials'] },
      { id: '8', title: 'Ghost Towns', artists: ['The Specials'] },
    ]);
    expect((await resolveTidalListen(api({ searchTracks }), { title: 'Ghost Town', kind: 'track', music: { performer: 'The Specials' } }))?.items[0]?.uri).toBe('tidal:track:9');
    const none = api();
    expect(await resolveTidalListen(none, { title: 'Ghost Town', kind: 'track', music: {} })).toBeNull();
    expect(none.searchTracks).not.toHaveBeenCalled();
    expect(await resolveTidalListen(api(), { title: 'Ghost Town', kind: 'track', music: { performer: 'X' } })).toBeNull();
  });
});

describe('resolveTidalListen, album', () => {
  it("choisit l'album du bon artiste, pas un hommage au titre voisin, et nomme les pistes d'après l'album", async () => {
    const searchAlbums = vi.fn(async () => [
      { id: 'L', title: 'Lucinda Williams Sings The Beatles From Abbey Road', artists: ['Lucinda Williams'] },
      { id: 'A', title: 'Abbey Road (Remastered)', artists: ['The Beatles'] },
    ]);
    const albumTracks = vi.fn(async () => [
      { id: 't1', title: 'Come Together' },
      { id: 't2', title: 'Something' },
    ]);
    const listen = await resolveTidalListen(api({ searchAlbums, albumTracks }), { title: 'Abbey_Road', kind: 'album', music: { performer: 'The Beatles' } });
    expect(searchAlbums).toHaveBeenCalledWith('Abbey Road The Beatles');
    expect(albumTracks).toHaveBeenCalledWith('A');
    expect(listen).toEqual({
      kind: 'album',
      albumUri: 'tidal:album:A',
      items: [
        { uri: 'tidal:track:t1', title: 'Come Together', artist: 'The Beatles' },
        { uri: 'tidal:track:t2', title: 'Something', artist: 'The Beatles' },
      ],
    });
  });

  it('cherche par le seul titre sans interprète, et rend null sans album ou sans piste', async () => {
    const searchAlbums = vi.fn(async () => [{ id: 'A', title: 'Abbey Road', artists: ['The Beatles'] }]);
    await resolveTidalListen(api({ searchAlbums, albumTracks: async () => [{ id: 't', title: 'x' }] }), { title: 'Abbey Road', kind: 'album', music: {} });
    expect(searchAlbums).toHaveBeenCalledWith('Abbey Road');
    expect(await resolveTidalListen(api(), { title: 'Abbey Road', kind: 'album', music: { performer: 'The Beatles' } })).toBeNull();
    expect(await resolveTidalListen(api({ searchAlbums, albumTracks: async () => [] }), { title: 'Abbey Road', kind: 'album', music: {} })).toBeNull();
  });
});

describe('resolveTidalListen, artiste', () => {
  it("exige un artiste du même nom (la 1ʳᵉ réponse n'est pas toujours la bonne) et retire les titres en double", async () => {
    const searchArtists = vi.fn(async () => [
      { id: '116', name: 'Simon & Garfunkel' },
      { id: '3634161', name: 'The Beatles' },
    ]);
    const artistTracks = vi.fn(async () => [
      { id: '1', title: 'Yesterday' },
      { id: '2', title: 'yesterday' },
      { id: '3', title: 'Help!' },
    ]);
    const listen = await resolveTidalListen(api({ searchArtists, artistTracks }), { title: 'The_Beatles', kind: 'artist', music: {} });
    expect(searchArtists).toHaveBeenCalledWith('The Beatles');
    expect(artistTracks).toHaveBeenCalledWith('3634161', 10);
    expect(listen).toEqual({
      kind: 'artist',
      items: [
        { uri: 'tidal:track:1', title: 'Yesterday', artist: 'The Beatles' },
        { uri: 'tidal:track:3', title: 'Help!', artist: 'The Beatles' },
      ],
    });
    expect(await resolveTidalListen(api({ searchArtists: async () => [{ id: '1', name: 'Autre' }] }), { title: 'The Beatles', kind: 'artist', music: {} })).toBeNull();
  });
});

describe('tidalUrl', () => {
  it("rend la page d'écoute Tidal d'une piste ou d'un album, null pour le reste", () => {
    expect(tidalUrl('tidal:track:118389958')).toBe('https://tidal.com/browse/track/118389958');
    expect(tidalUrl('tidal:album:11564033')).toBe('https://tidal.com/browse/album/11564033');
    expect(tidalUrl('spotify:track:1')).toBeNull();
    expect(tidalUrl('tidal:track:abc')).toBeNull();
  });
});
