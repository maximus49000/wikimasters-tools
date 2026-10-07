import { describe, expect, it, vi } from 'vitest';
import { createTmdbApi, TmdbError, userMessage } from '../../../src/core/screen/tmdb-api';

const api = (handler: (url: URL) => Response | Promise<Response>) => {
  const fetchFn = vi.fn(async (url: string) => handler(new URL(url)));
  return { api: createTmdbApi({ fetch: fetchFn, apiKey: 'KEY' }), fetchFn };
};

describe('detail', () => {
  it('lit titre, année, note, description et la bande-annonce française de préférence', async () => {
    const { api: tmdb, fetchFn } = api(() =>
      Response.json({
        id: 27205,
        title: 'Inception',
        release_date: '2010-07-16',
        overview: 'Un rêve.',
        vote_average: 8.369,
        vote_count: 37000,
        videos: {
          results: [
            { site: 'YouTube', type: 'Trailer', key: 'EN_OFFICIAL', official: true, iso_639_1: 'en' },
            { site: 'YouTube', type: 'Trailer', key: 'FR', official: false, iso_639_1: 'fr' },
            { site: 'Vimeo', type: 'Trailer', key: 'VIMEO', iso_639_1: 'fr' },
            { site: 'YouTube', type: 'Teaser', key: 'TEASER', iso_639_1: 'fr' },
          ],
        },
      }),
    );
    const detail = await tmdb.detail('movie', 27205);
    expect(detail).toEqual({
      mediaType: 'movie',
      id: 27205,
      title: 'Inception',
      year: 2010,
      overview: 'Un rêve.',
      rating: { average: 8.4, votes: 37000 },
      trailerKey: 'FR',
    });
    const url = new URL(fetchFn.mock.calls[0]![0]);
    expect(url.pathname).toBe('/3/movie/27205');
    expect(url.searchParams.get('api_key')).toBe('KEY');
    expect(url.searchParams.get('language')).toBe('fr-FR');
    expect(url.searchParams.get('append_to_response')).toBe('videos,watch/providers');
    expect(url.searchParams.get('include_video_language')).toBe('fr,en,null');
  });

  it('lit une série (name, first_air_date) ; sans vote, sans bande-annonce : rien de ces champs', async () => {
    const { api: tmdb } = api(() => Response.json({ id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20', overview: '', vote_average: 0, vote_count: 0 }));
    expect(await tmdb.detail('tv', 1396)).toEqual({ mediaType: 'tv', id: 1396, title: 'Breaking Bad', year: 2008, overview: '' });
  });
});

describe('detail : où le voir', () => {
  const fr = {
    link: 'https://www.themoviedb.org/movie/27205/watch?locale=FR',
    flatrate: [
      { provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/prime.jpg', display_priority: 5 },
      { provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.jpg', display_priority: 1 },
    ],
    ads: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.jpg', display_priority: 1 }, { provider_id: 300, provider_name: 'Pluto TV', display_priority: 9 }],
    rent: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: '/apple.jpg', display_priority: 2 }],
    buy: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: '/apple.jpg', display_priority: 2 }, { provider_id: 3, provider_name: 'Orange VOD', display_priority: 7 }],
  };
  const withProviders = (results: unknown) => api(() => Response.json({ id: 1, title: 'T', overview: '', 'watch/providers': { results } })).api.detail('movie', 1);

  it('France : abonnement + gratuit regroupés, location + achat regroupés, sans doublon, par priorité', async () => {
    const detail = await withProviders({ FR: fr, US: { flatrate: [{ provider_id: 1, provider_name: 'Hulu' }] } });
    expect(detail.watch).toEqual({
      link: 'https://www.themoviedb.org/movie/27205/watch?locale=FR',
      stream: [
        { id: 8, name: 'Netflix', logoPath: '/netflix.jpg' },
        { id: 119, name: 'Amazon Prime Video', logoPath: '/prime.jpg' },
        { id: 300, name: 'Pluto TV' },
      ],
      rentBuy: [{ id: 2, name: 'Apple TV', logoPath: '/apple.jpg' }, { id: 3, name: 'Orange VOD' }],
    });
  });

  it('aucune offre en France (pays absent) : listes vides, pas de lien', async () => {
    expect((await withProviders({ US: fr })).watch).toEqual({ stream: [], rentBuy: [] });
  });

  it('refuse un lien qui ne mène pas à TMDB', async () => {
    const detail = await withProviders({ FR: { ...fr, link: 'https://evil.example/x' } });
    expect(detail.watch?.link).toBeUndefined();
  });

  it('réponse sans bloc watch/providers : pas de champ watch (rien à afficher)', async () => {
    const { api: tmdb } = api(() => Response.json({ id: 1, title: 'T', overview: '' }));
    expect((await tmdb.detail('movie', 1)).watch).toBeUndefined();
  });
});

describe('person', () => {
  const credits = {
    cast: [
      { id: 1, media_type: 'movie', title: 'A', release_date: '2024-01-01', vote_average: 7.44, vote_count: 10 },
      { id: 2, media_type: 'tv', name: 'B', first_air_date: '2010-05-01', vote_average: 0, vote_count: 0 },
      { id: 3, media_type: 'movie', title: 'Sans date' },
      { id: 1, media_type: 'movie', title: 'A', release_date: '2024-01-01' },
      { id: 9, media_type: 'person', name: 'Pas un titre' },
    ],
    crew: [
      { id: 1, media_type: 'movie', title: 'A', release_date: '2024-01-01', job: 'Director' },
      { id: 4, media_type: 'movie', title: 'D', release_date: '2020-01-01', job: 'Director', poster_path: '/d.jpg' },
      { id: 5, media_type: 'movie', title: 'Produit', release_date: '2019-01-01', job: 'Producer' },
    ],
  };

  it('acteur : ses rôles, dédoublonnés, du plus récent au plus ancien, sans date en dernier', async () => {
    const { api: tmdb } = api(() => Response.json(credits));
    const items = await tmdb.person(7, { acting: true, directing: false });
    expect(items.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(items[0]).toEqual({ mediaType: 'movie', id: 1, title: 'A', year: 2024, rating: 7.4 });
    expect(items[1]).toEqual({ mediaType: 'tv', id: 2, title: 'B', year: 2010 });
  });

  it('réalisateur : seulement ses réalisations ; les deux rôles : réunis sans doublon', async () => {
    const { api: tmdb } = api(() => Response.json(credits));
    expect((await tmdb.person(7, { acting: false, directing: true })).map((item) => item.id)).toEqual([1, 4]);
    expect((await tmdb.person(7, { acting: true, directing: true })).map((item) => item.id)).toEqual([1, 4, 2, 3]);
    const director = (await tmdb.person(7, { acting: false, directing: true })).find((item) => item.id === 4);
    expect(director?.posterPath).toBe('/d.jpg');
  });

  it('plafonne à 40 titres', async () => {
    const cast = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, media_type: 'movie', title: `F${i}`, release_date: `${1950 + i}-01-01` }));
    const { api: tmdb } = api(() => Response.json({ cast, crew: [] }));
    expect(await tmdb.person(7, { acting: true, directing: false })).toHaveLength(40);
  });
});

describe('search', () => {
  it("n'accepte que le résultat dont le titre est identique (accents et casse ignorés)", async () => {
    const { api: tmdb, fetchFn } = api(() => Response.json({ results: [{ id: 5, title: 'Autre' }, { id: 6, title: 'Amélie' }] }));
    expect(await tmdb.search('film', 'amelie')).toBe(6);
    expect(new URL(fetchFn.mock.calls[0]![0]).pathname).toBe('/3/search/movie');
    expect(await tmdb.search('film', 'Inconnu')).toBeNull();
  });

  it('interroge /search/tv pour une série et /search/person pour une personne (nom)', async () => {
    const { api: tmdb, fetchFn } = api(() => Response.json({ results: [{ id: 1, name: 'Marion Cotillard' }] }));
    expect(await tmdb.search('person', 'Marion Cotillard')).toBe(1);
    expect(await tmdb.search('series', 'Marion Cotillard')).toBe(1);
    expect(fetchFn.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(['/3/search/person', '/3/search/tv']);
  });
});

describe('erreurs', () => {
  it('type les codes HTTP et un format inattendu', async () => {
    for (const [status, code] of [[401, 'auth'], [404, 'not-found'], [429, 'rate-limited'], [500, 'http']] as const) {
      const { api: tmdb } = api(() => new Response('{}', { status }));
      await expect(tmdb.detail('movie', 1)).rejects.toMatchObject({ code });
    }
    const { api: tmdb } = api(() => Response.json({ rien: true }));
    await expect(tmdb.detail('movie', 1)).rejects.toBeInstanceOf(TmdbError);
  });

  it('un échec réseau devient une erreur http, et userMessage rend toujours une phrase', async () => {
    const tmdb = createTmdbApi({ fetch: async () => Promise.reject(new TypeError('offline')), apiKey: 'K' });
    await expect(tmdb.detail('movie', 1)).rejects.toMatchObject({ code: 'http' });
    expect(userMessage(new TmdbError('rate-limited', 'x'))).toMatch(/patienter/);
    expect(userMessage(new Error('?'))).toMatch(/indisponible/);
  });
});

describe('posterUrl', () => {
  it("donne l'affiche du titre exact, ou null sans affiche ni correspondance", async () => {
    const { api: tmdb, fetchFn } = api(() =>
      Response.json({ results: [{ id: 1, title: 'Amélie 2', poster_path: '/autre.jpg' }, { id: 6, title: 'Amélie', poster_path: '/ok.jpg' }, { id: 7, title: 'Sans', poster_path: null }] }),
    );
    expect(await tmdb.posterUrl('film', 'amelie')).toBe('https://image.tmdb.org/t/p/w500/ok.jpg');
    expect(new URL(fetchFn.mock.calls[0]![0]).pathname).toBe('/3/search/movie');
    expect(await tmdb.posterUrl('series', 'Sans')).toBeNull();
    expect(new URL(fetchFn.mock.calls[1]![0]).pathname).toBe('/3/search/tv');
    expect(await tmdb.posterUrl('film', 'Inconnu')).toBeNull();
  });
});

describe('closestPosterUrl', () => {
  it("prend la première affiche de film ou de série, sans exiger le titre exact, et ignore les personnes", async () => {
    const { api: tmdb, fetchFn } = api(() =>
      Response.json({ results: [{ id: 1, name: 'Une actrice', media_type: 'person', poster_path: '/p.jpg' }, { id: 2, title: 'Inception 2', media_type: 'movie', poster_path: '/ok.jpg' }] }),
    );
    expect(await tmdb.closestPosterUrl('Inception')).toBe('https://image.tmdb.org/t/p/w500/ok.jpg');
    expect(new URL(fetchFn.mock.calls[0]![0]).pathname).toBe('/3/search/multi');
  });
});
