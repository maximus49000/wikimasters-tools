import { describe, expect, it, vi } from 'vitest';
import { createMediaArt } from '../../src/content/media-art';

const setup = (natures: string[], overrides: { linked?: boolean; spotify?: boolean; tmdb?: boolean; slow?: () => Promise<null> } = {}) => {
  const findCover = vi.fn(overrides.slow ?? (async () => 'https://i.scdn.co/cover'));
  const findArtistImage = vi.fn(overrides.slow ?? (async () => 'https://i.scdn.co/artist'));
  const closestPosterUrl = vi.fn(async () => 'https://image.tmdb.org/closest');
  const posterUrl = vi.fn(async () => 'https://image.tmdb.org/poster');
  const kinds = { resolveMissing: vi.fn(async () => undefined), load: vi.fn(async () => ({ cards: { x: { natures, occupations: [] } } })) };
  const sources = {
    ...(overrides.spotify === false
      ? {}
      : { spotify: { api: { findCover, findArtistImage }, session: { isLinked: async () => overrides.linked ?? true }, music: { resolve: async () => ({ x: { performer: 'The Beatles' } }) } } }),
    ...(overrides.tmdb === false ? {} : { tmdb: { posterUrl, closestPosterUrl } }),
  };
  return { art: createMediaArt({ kinds: kinds as never, sources: sources as never }), findCover, posterUrl, findArtistImage, closestPosterUrl };
};

describe('createMediaArt', () => {
  it("prend la pochette Spotify d'un album, avec l'interprète", async () => {
    const { art, findCover } = setup(['Q482994']);
    expect(await art.primary('x', 'Abbey Road (album)')).toEqual(['https://i.scdn.co/cover']);
    expect(findCover).toHaveBeenCalledWith('album', 'Abbey Road', 'The Beatles');
  });

  it('prend la pochette du disque pour un single / morceau', async () => {
    const { art, findCover } = setup(['Q134556']);
    await art.primary('x', 'Yesterday');
    expect(findCover).toHaveBeenCalledWith('track', 'Yesterday', 'The Beatles');
  });

  it("ne cherche rien sur Spotify quand le compte n'est pas lié", async () => {
    const { art, findCover } = setup(['Q482994'], { linked: false });
    expect(await art.primary('x', 'Abbey Road')).toEqual([]);
    expect(findCover).not.toHaveBeenCalled();
  });

  it("prend l'affiche TMDB d'un film et d'une série", async () => {
    const film = setup(['Q11424']);
    expect(await film.art.primary('x', 'Inception')).toEqual(['https://image.tmdb.org/poster']);
    expect(film.posterUrl).toHaveBeenCalledWith('film', 'Inception');
    const series = setup(['Q5398426']);
    await series.art.primary('x', 'Dark');
    expect(series.posterUrl).toHaveBeenCalledWith('series', 'Dark');
  });

  it('ne fait rien sans source, ni pour un autre type de carte', async () => {
    expect(await setup(['Q482994'], { spotify: false, tmdb: false }).art.primary('x', 'A')).toEqual([]);
    const other = setup(['Q5']);
    expect(await other.art.primary('x', 'Quelqu’un')).toEqual([]);
    expect(other.findCover).not.toHaveBeenCalled();
    expect(other.posterUrl).not.toHaveBeenCalled();
  });

  it("à défaut d'image, prend la photo de l'artiste pour un album, ou l'affiche la plus proche pour un film", async () => {
    const album = setup(['Q482994']);
    expect(await album.art.fallback('x', 'Abbey Road')).toEqual(['https://i.scdn.co/artist']);
    expect(album.findArtistImage).toHaveBeenCalledWith('The Beatles');
    const film = setup(['Q11424']);
    expect(await film.art.fallback('x', 'Inception (film)')).toEqual(['https://image.tmdb.org/closest']);
    expect(film.closestPosterUrl).toHaveBeenCalledWith('Inception');
  });

  it("n'utilise pas Spotify en dernier recours quand le compte n'est pas lié", async () => {
    const { art, findArtistImage } = setup(['Q482994'], { linked: false });
    expect(await art.fallback('x', 'Abbey Road')).toEqual([]);
    expect(findArtistImage).not.toHaveBeenCalled();
  });

  it('lance les recherches Spotify une à une, même quand toute une page de cartes les demande à la fois', async () => {
    // Spotify limite l'application entière : des dizaines de recherches simultanées suffisent à la bloquer.
    let running = 0;
    let peak = 0;
    const slow = async (): Promise<null> => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return null;
    };
    const { art, findCover, findArtistImage } = setup(['Q482994'], { slow });
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? art.primary('x', 'Abbey Road') : art.fallback('x', 'Abbey Road'))));
    expect(findCover).toHaveBeenCalledTimes(6);
    expect(findArtistImage).toHaveBeenCalledTimes(6);
    expect(peak).toBe(1);
  });

  it("une recherche Spotify en échec n'empêche pas les suivantes", async () => {
    const { art, findCover } = setup(['Q482994']);
    findCover.mockRejectedValueOnce(new Error('429'));
    const [first, second] = await Promise.allSettled([art.primary('x', 'A'), art.primary('x', 'B')]);
    expect(first.status).toBe('rejected');
    expect(second).toEqual({ status: 'fulfilled', value: ['https://i.scdn.co/cover'] });
  });
});
