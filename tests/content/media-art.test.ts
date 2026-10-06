import { describe, expect, it, vi } from 'vitest';
import { createMediaArt } from '../../src/content/media-art';

const setup = (natures: string[], overrides: { game?: boolean; gameCovers?: string[] | null; linked?: boolean; spotify?: boolean; tmdb?: boolean; slow?: () => Promise<null>; unknownKinds?: boolean; unknownMusic?: boolean } = {}) => {
  const findCover = vi.fn(overrides.slow ?? (async () => 'https://i.scdn.co/cover'));
  const findArtistImage = vi.fn(overrides.slow ?? (async () => 'https://i.scdn.co/artist'));
  const closestPosterUrl = vi.fn(async () => 'https://image.tmdb.org/closest');
  const posterUrl = vi.fn(async () => 'https://image.tmdb.org/poster');
  // `unknownKinds` : Wikidata n'a pas (encore) répondu pour cette carte.
  const kinds = { resolveMissing: vi.fn(async () => undefined), load: vi.fn(async () => ({ cards: overrides.unknownKinds ? {} : { x: { natures, occupations: [] } } })) };
  const cover = vi.fn(async () => (overrides.gameCovers === undefined ? ['https://steam.test/library.jpg'] : overrides.gameCovers));
  const sources = {
    ...(overrides.game ? { game: { cover } } : {}),
    ...(overrides.spotify === false
      ? {}
      : { spotify: { api: { findCover, findArtistImage }, session: { isLinked: async () => overrides.linked ?? true }, music: { resolve: async () => (overrides.unknownMusic ? {} : { x: { performer: 'The Beatles' } }) } } }),
    ...(overrides.tmdb === false ? {} : { tmdb: { posterUrl, closestPosterUrl } }),
  };
  return { art: createMediaArt({ kinds: kinds as never, sources: sources as never }), cover, findCover, posterUrl, findArtistImage, closestPosterUrl };
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

  it("ne cherche rien sur Spotify quand le compte n'est pas lié (source indisponible, pas « rien trouvé »)", async () => {
    const { art, findCover } = setup(['Q482994'], { linked: false });
    expect(await art.primary('x', 'Abbey Road')).toBeNull();
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

  it("prend la pochette d'un jeu vidéo auprès de Steam / IGDB, et rend `null` tant que cette source n'est pas prête", async () => {
    const { art, cover } = setup(['Q7889'], { game: true, spotify: false, tmdb: false });
    expect(await art.primary('x', 'Elden Ring (jeu vidéo)')).toEqual(['https://steam.test/library.jpg']);
    expect(cover).toHaveBeenCalledWith('x', 'Elden Ring (jeu vidéo)');
    expect(await setup(['Q7889'], { game: true, gameCovers: null }).art.primary('x', 'Elden Ring')).toBeNull();
    expect(await setup(['Q7889']).art.primary('x', 'Elden Ring')).toBeNull();
  });

  it("l'affiche d'un jeu (carte qui a déjà une image) est demandée à la source de jeux même quand Wikidata n'a pas répondu : la source tranche (choix de l'utilisateur compris)", async () => {
    const { art, cover } = setup(['Q7889'], { game: true, unknownKinds: true, spotify: false, tmdb: false });
    expect(await art.game('x', 'Elden Ring')).toEqual(['https://steam.test/library.jpg']);
    expect(cover).toHaveBeenCalledWith('x', 'Elden Ring');
  });

  it("ne cherche pas de pochette de jeu pour une carte qui n'est pas un jeu vidéo (jeu de société compris)", async () => {
    const { art, cover } = setup(['Q131436'], { game: true });
    expect(await art.primary('x', 'Catan')).toEqual([]);
    expect(cover).not.toHaveBeenCalled();
  });

  it('ne fait rien sans source (indisponible), ni pour un autre type de carte (réponse : rien à chercher)', async () => {
    expect(await setup(['Q482994'], { spotify: false, tmdb: false }).art.primary('x', 'A')).toBeNull();
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
    expect(await art.fallback('x', 'Abbey Road')).toBeNull();
    expect(findArtistImage).not.toHaveBeenCalled();
  });

  it("répond « rien » (liste vide) quand la source a répondu sans résultat, et « indisponible » (null) quand elle n'a pas pu répondre", async () => {
    // Réponse : Spotify n'a ni pochette ni photo.
    const empty = setup(['Q482994'], { slow: async () => null });
    expect(await empty.art.primary('x', 'Abbey Road')).toEqual([]);
    expect(await empty.art.fallback('x', 'Abbey Road')).toEqual([]);
    // Pas de réponse possible : natures de la carte pas encore connues, source de l'autre type absente (pas de clé TMDB, pas de Spotify).
    const unknown = setup(['Q482994'], { unknownKinds: true });
    expect(await unknown.art.primary('x', 'Abbey Road')).toBeNull();
    expect(await unknown.art.fallback('x', 'Abbey Road')).toBeNull();
    expect(unknown.findCover).not.toHaveBeenCalled();
    expect(await setup(['Q11424'], { tmdb: false }).art.primary('x', 'Inception')).toBeNull();
    expect(await setup(['Q11424'], { tmdb: false }).art.fallback('x', 'Inception')).toBeNull();
    expect(await setup(['Q482994'], { spotify: false }).art.primary('x', 'Abbey Road')).toBeNull();
  });

  it("n'invente pas une réponse quand l'interprète est inconnu faute de réponse de Wikidata : pas de recherche par le seul titre", async () => {
    const offline = setup(['Q482994'], { unknownMusic: true });
    expect(await offline.art.primary('x', 'Abbey Road')).toBeNull();
    expect(await offline.art.fallback('x', 'Abbey Road')).toBeNull();
    expect(offline.findCover).not.toHaveBeenCalled();
    expect(offline.findArtistImage).not.toHaveBeenCalled();
    // Une carte d'artiste n'a pas besoin de l'interprète : son titre suffit.
    const artist = setup(['Q215380'], { unknownMusic: true });
    expect(await artist.art.fallback('x', 'The Beatles')).toEqual(['https://i.scdn.co/artist']);
    expect(artist.findArtistImage).toHaveBeenCalledWith('The Beatles');
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
