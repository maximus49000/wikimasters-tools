import { describe, expect, it, vi } from 'vitest';
import { isSoundtrackOf, resolveSoundtrack } from '../../../src/core/music/soundtrack';

const tracks = [{ uri: 'spotify:track:1', title: 'Dream Is Collapsing', artist: 'Hans Zimmer' }];

describe('isSoundtrackOf', () => {
  it('reconnaît les albums de bande originale du film', () => {
    expect(isSoundtrackOf('Inception (Music from the Motion Picture)', 'Inception')).toBe(true);
    expect(isSoundtrackOf('Inception (Original Motion Picture Soundtrack)', 'Inception_(film)')).toBe(true);
    expect(isSoundtrackOf('Dune (Original Score)', 'Dune')).toBe(true);
    expect(isSoundtrackOf('Amélie (Bande originale du film)', 'Amelie')).toBe(true);
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
      albumTracks: vi.fn(async () => tracks),
    };
    const listen = await resolveSoundtrack(api, ['Le Parrain', 'The Godfather', 'the godfather']);
    expect(listen?.albumUri).toBe('spotify:album:G');
    expect(api.searchAlbums).toHaveBeenCalledTimes(2);
  });

  it('rend null quand Spotify n’a pas de BO', async () => {
    const api = { searchAlbums: vi.fn(async () => [{ id: 'X', name: 'Autre chose', artist: 'A' }]), albumTracks: vi.fn(async () => tracks) };
    expect(await resolveSoundtrack(api, ['Inception'])).toBeNull();
    expect(api.albumTracks).not.toHaveBeenCalled();
  });
});
