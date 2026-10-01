import { describe, expect, it, vi } from 'vitest';
import { cleanTitle, resolveListen } from '../../../src/core/music/listen';

const found = (title: string, artists: { id: string; name: string }[]) => ({
  uri: `spotify:track:${title}`,
  title,
  artist: artists.map((a) => a.name).join(', '),
  artistIds: artists.map((a) => a.id),
  artists: artists.map((a) => a.name),
});

function api(overrides: Partial<Record<'searchTracks' | 'searchAlbum' | 'albumTracks', ReturnType<typeof vi.fn>>> = {}) {
  return {
    searchTracks: vi.fn(async () => []),
    searchAlbum: vi.fn(async () => null),
    albumTracks: vi.fn(async () => []),
    ...overrides,
  } as any;
}

describe('cleanTitle', () => {
  it('retire la précision entre parenthèses et les soulignés', () => {
    expect(cleanTitle('Yesterday_(chanson)')).toBe('Yesterday');
    expect(cleanTitle('Abbey Road (album)')).toBe('Abbey Road');
    expect(cleanTitle('Queen')).toBe('Queen');
  });
});

describe('resolveListen', () => {
  it("morceau avec identifiant Spotify : pas d'appel à l'API, titre de la carte", async () => {
    const deps = api();
    const listen = await resolveListen(deps, { title: 'Yesterday (chanson)', kind: 'track', music: { trackId: 'T'.repeat(22), performer: 'The Beatles' } });
    expect(listen).toEqual({ kind: 'track', items: [{ uri: `spotify:track:${'T'.repeat(22)}`, title: 'Yesterday', artist: 'The Beatles' }] });
    expect(deps.searchTracks).not.toHaveBeenCalled();
  });

  it('morceau sans identifiant : recherche titre + interprète, premier résultat', async () => {
    const searchTracks = vi.fn(async () => [found('Yesterday', [{ id: 'a', name: 'The Beatles' }])]);
    const listen = await resolveListen(api({ searchTracks }), { title: 'Yesterday', kind: 'track', music: { performer: 'The Beatles' } });
    expect(searchTracks).toHaveBeenCalledWith('track:"Yesterday" artist:"The Beatles"', 1);
    expect(listen?.items).toEqual([{ uri: 'spotify:track:Yesterday', title: 'Yesterday', artist: 'The Beatles' }]);
  });

  it('morceau sans identifiant ni interprète : rien à lire', async () => {
    expect(await resolveListen(api(), { title: 'Yesterday', kind: 'track', music: {} })).toBeNull();
  });

  it("album : toutes les pistes, avec le contexte de l'album", async () => {
    const albumTracks = vi.fn(async () => [{ uri: 'spotify:track:1', title: 'Come Together', artist: 'The Beatles' }]);
    const listen = await resolveListen(api({ albumTracks }), { title: 'Abbey Road', kind: 'album', music: { albumId: 'A'.repeat(22) } });
    expect(albumTracks).toHaveBeenCalledWith('A'.repeat(22));
    expect(listen).toEqual({ kind: 'album', items: [{ uri: 'spotify:track:1', title: 'Come Together', artist: 'The Beatles' }], albumUri: `spotify:album:${'A'.repeat(22)}` });
  });

  it("album sans identifiant : recherche de l'album par titre et interprète, ou rien", async () => {
    const searchAlbum = vi.fn(async () => 'B'.repeat(22));
    const albumTracks = vi.fn(async () => [{ uri: 'spotify:track:1', title: 'x', artist: 'y' }]);
    const listen = await resolveListen(api({ searchAlbum, albumTracks }), { title: 'Abbey Road', kind: 'album', music: { performer: 'The Beatles' } });
    expect(searchAlbum).toHaveBeenCalledWith('Abbey Road', 'The Beatles');
    expect(listen?.albumUri).toBe(`spotify:album:${'B'.repeat(22)}`);
    expect(await resolveListen(api(), { title: 'Abbey Road', kind: 'album', music: { performer: 'The Beatles' } })).toBeNull();
    expect(await resolveListen(api(), { title: 'Abbey Road', kind: 'album', music: {} })).toBeNull();
  });

  it("artiste : 10 titres de lui seul (les reprises par d'autres sont écartées)", async () => {
    const searchTracks = vi.fn(async () => [
      found('Bohemian Rhapsody', [{ id: 'q', name: 'Queen' }]),
      found('Reprise', [{ id: 'z', name: 'Autre' }]),
      found('Under Pressure', [{ id: 'q', name: 'Queen' }, { id: 'd', name: 'David Bowie' }]),
    ]);
    const listen = await resolveListen(api({ searchTracks }), { title: 'Queen_(groupe)', kind: 'artist', music: {} });
    expect(searchTracks).toHaveBeenCalledWith('artist:"Queen"', 10);
    expect(listen?.items.map((item) => item.title)).toEqual(['Bohemian Rhapsody', 'Under Pressure']);
    expect(listen?.albumUri).toBeUndefined();
  });

  it("artiste avec identifiant Spotify : on filtre sur l'identifiant", async () => {
    const searchTracks = vi.fn(async () => [found('A', [{ id: 'q', name: 'Queen' }]), found('B', [{ id: 'other', name: 'Queen' }])]);
    const listen = await resolveListen(api({ searchTracks }), { title: 'Queen', kind: 'artist', music: { artistId: 'q' } });
    expect(listen?.items.map((item) => item.title)).toEqual(['A']);
  });

  it('artiste sans aucun titre trouvé : rien à lire', async () => {
    expect(await resolveListen(api(), { title: 'Inconnu', kind: 'artist', music: {} })).toBeNull();
  });

  it('retire les guillemets du titre dans les requêtes', async () => {
    const searchTracks = vi.fn(async () => []);
    await resolveListen(api({ searchTracks }), { title: 'Say "Hello"', kind: 'track', music: { performer: 'X' } });
    expect(searchTracks).toHaveBeenCalledWith('track:"Say Hello" artist:"X"', 1);
  });
});
