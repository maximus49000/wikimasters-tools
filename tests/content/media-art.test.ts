import { describe, expect, it, vi } from 'vitest';
import { createMediaArt } from '../../src/content/media-art';

const setup = (natures: string[], overrides: { linked?: boolean; spotify?: boolean; tmdb?: boolean } = {}) => {
  const findCover = vi.fn(async () => 'https://i.scdn.co/cover');
  const posterUrl = vi.fn(async () => 'https://image.tmdb.org/poster');
  const kinds = { resolveMissing: vi.fn(async () => undefined), load: vi.fn(async () => ({ cards: { x: { natures, occupations: [] } } })) };
  const sources = {
    ...(overrides.spotify === false
      ? {}
      : { spotify: { api: { findCover }, session: { isLinked: async () => overrides.linked ?? true }, music: { resolve: async () => ({ x: { performer: 'The Beatles' } }) } } }),
    ...(overrides.tmdb === false ? {} : { tmdb: { posterUrl } }),
  };
  return { art: createMediaArt({ kinds: kinds as never, sources: sources as never }), findCover, posterUrl };
};

describe('createMediaArt', () => {
  it("prend la pochette Spotify d'un album, avec l'interprète", async () => {
    const { art, findCover } = setup(['Q482994']);
    expect(await art('x', 'Abbey Road (album)')).toEqual(['https://i.scdn.co/cover']);
    expect(findCover).toHaveBeenCalledWith('album', 'Abbey Road', 'The Beatles');
  });

  it('prend la pochette du disque pour un single / morceau', async () => {
    const { art, findCover } = setup(['Q134556']);
    await art('x', 'Yesterday');
    expect(findCover).toHaveBeenCalledWith('track', 'Yesterday', 'The Beatles');
  });

  it("ne cherche rien sur Spotify quand le compte n'est pas lié", async () => {
    const { art, findCover } = setup(['Q482994'], { linked: false });
    expect(await art('x', 'Abbey Road')).toEqual([]);
    expect(findCover).not.toHaveBeenCalled();
  });

  it("prend l'affiche TMDB d'un film et d'une série", async () => {
    const film = setup(['Q11424']);
    expect(await film.art('x', 'Inception')).toEqual(['https://image.tmdb.org/poster']);
    expect(film.posterUrl).toHaveBeenCalledWith('film', 'Inception');
    const series = setup(['Q5398426']);
    await series.art('x', 'Dark');
    expect(series.posterUrl).toHaveBeenCalledWith('series', 'Dark');
  });

  it('ne fait rien sans source, ni pour un autre type de carte', async () => {
    expect(await setup(['Q482994'], { spotify: false, tmdb: false }).art('x', 'A')).toEqual([]);
    const other = setup(['Q5']);
    expect(await other.art('x', 'Quelqu’un')).toEqual([]);
    expect(other.findCover).not.toHaveBeenCalled();
    expect(other.posterUrl).not.toHaveBeenCalled();
  });
});
