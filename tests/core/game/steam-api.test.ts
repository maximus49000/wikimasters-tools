import { describe, expect, it, vi } from 'vitest';
import { GameError } from '../../../src/core/game/errors';
import { createSteamApi } from '../../../src/core/game/steam-api';

const details = {
  '1245620': {
    success: true,
    data: {
      name: 'ELDEN RING',
      short_description: 'Le RPG d’action acclamé.',
      is_free: false,
      developers: ['FromSoftware, Inc.'],
      genres: [{ description: 'Action' }, { description: 'RPG' }],
      release_date: { date: '24 févr. 2022' },
      price_overview: { currency: 'EUR', final: 5999 },
      metacritic: { score: 94, url: 'https://www.metacritic.com/game/pc/elden-ring' },
      platforms: { windows: true, mac: false, linux: false },
      movies: [{ thumbnail: 'https://x/thumb.jpg', hls_h264: 'https://x/hls.m3u8', highlight: true }],
      header_image: 'https://x/header.jpg',
    },
  },
};
const reviews = { query_summary: { review_score_desc: 'Very Positive', total_positive: 1077271, total_negative: 80512, total_reviews: 1157783 } };
const players = { response: { player_count: 22386, result: 1 } };
const search = {
  total: 2,
  items: [
    { type: 'app', id: 1245620, name: 'ELDEN RING', tiny_image: 'https://x/tiny.jpg', platforms: { windows: true, mac: false, linux: false } },
    { type: 'bundle', id: 9, name: 'Lot' },
  ],
};

const route = (table: Record<string, unknown>, status = 200) =>
  vi.fn(async (url: string) => {
    const hit = Object.entries(table).find(([key]) => url.includes(key));
    return hit ? Response.json(hit[1], { status }) : new Response('', { status: 404 });
  });

describe('createSteamApi.detail', () => {
  it('assemble la fiche : avis, joueurs, prix, bande-annonce, Metascore', async () => {
    const api = createSteamApi({ fetch: route({ appdetails: details, appreviews: reviews, GetNumberOfCurrentPlayers: players }) });
    const detail = await api.detail(1245620);
    expect(detail).toMatchObject({
      source: 'steam',
      id: 1245620,
      title: 'ELDEN RING',
      year: 2022,
      genres: ['Action', 'RPG'],
      platforms: ['Windows'],
      developers: ['FromSoftware, Inc.'],
      releaseDate: '24 févr. 2022',
      rating: { kind: 'positive', value: 93, count: 1157783, verdict: 'Très positives' },
      metascore: { score: 94, url: 'https://www.metacritic.com/game/pc/elden-ring' },
      playersOnline: 22386,
      trailer: { kind: 'hls', url: 'https://x/hls.m3u8', poster: 'https://x/thumb.jpg' },
      coverUrl: 'https://x/header.jpg',
      pageUrl: 'https://store.steampowered.com/app/1245620',
    });
    expect(detail?.price?.replace(/\s/g, ' ')).toBe('59,99 €');
  });

  it("rend null quand Steam n'a pas de données (success: false)", async () => {
    const api = createSteamApi({ fetch: route({ appdetails: { '7': { success: false } } }) });
    expect(await api.detail(7)).toBeNull();
  });

  it("garde la fiche sans avis ni joueurs quand ces appels échouent, mais relaie une limite de débit", async () => {
    const partial = vi.fn(async (url: string) => (url.includes('appdetails') ? Response.json(details) : new Response('', { status: 500 })));
    const detail = await createSteamApi({ fetch: partial }).detail(1245620);
    expect(detail?.title).toBe('ELDEN RING');
    expect(detail?.rating).toBeUndefined();
    expect(detail?.playersOnline).toBeUndefined();

    const limited = vi.fn(async (url: string) => (url.includes('appdetails') ? Response.json(details) : new Response('', { status: 429 })));
    await expect(createSteamApi({ fetch: limited }).detail(1245620)).rejects.toBeInstanceOf(GameError);
  });

  it("un jeu gratuit affiche « Gratuit », un jeu sans avis n'a pas de note", async () => {
    const free = { '5': { success: true, data: { name: 'Libre', is_free: true } } };
    const noReviews = { query_summary: { total_positive: 0, total_negative: 0, total_reviews: 0 } };
    const api = createSteamApi({ fetch: route({ appdetails: free, appreviews: noReviews, GetNumberOfCurrentPlayers: players }) });
    const detail = await api.detail(5);
    expect(detail?.price).toBe('Gratuit');
    expect(detail?.rating).toBeUndefined();
  });
});

// Réponse de IStoreBrowseService/GetItems : jeu récent (fichiers dans un dossier à empreinte) et ancien (fichiers à la racine).
const items = {
  response: {
    store_items: [
      {
        appid: 2483190,
        assets: {
          asset_url_format: 'steam/apps/2483190/${FILENAME}?t=1791312088',
          library_capsule: '711e3980/library_capsule.jpg',
          header: 'bd1e762f/header_alt_assets_5.jpg',
        },
      },
    ],
  },
};
const ASSETS = 'https://shared.akamai.steamstatic.com/store_item_assets/';

describe('createSteamApi.art', () => {
  it('rend les vraies adresses de Steam : affiche portrait puis bandeau', async () => {
    const api = createSteamApi({ fetch: route({ GetItems: items }) });
    expect(await api.art(2483190)).toEqual([
      `${ASSETS}steam/apps/2483190/711e3980/library_capsule.jpg?t=1791312088`,
      `${ASSETS}steam/apps/2483190/bd1e762f/header_alt_assets_5.jpg?t=1791312088`,
    ]);
  });

  it('rend une liste vide pour un jeu sans images', async () => {
    const api = createSteamApi({ fetch: route({ GetItems: { response: { store_items: [{ appid: 7 }] } } }) });
    expect(await api.art(7)).toEqual([]);
  });

  it('demande les images du bon jeu', async () => {
    const fetch = route({ GetItems: items });
    await createSteamApi({ fetch }).art(2483190);
    const url = decodeURIComponent(String(fetch.mock.calls[0]?.[0]));
    expect(url).toContain('IStoreBrowseService/GetItems');
    expect(url).toContain('"appid":2483190');
    expect(url).toContain('"include_assets":true');
  });
});

describe('createSteamApi.detail (affiche)', () => {
  it('la couverture est l’affiche portrait quand Steam la donne', async () => {
    const api = createSteamApi({ fetch: route({ appdetails: { '2483190': details['1245620'] }, GetItems: items }) });
    expect((await api.detail(2483190))?.coverUrl).toBe(`${ASSETS}steam/apps/2483190/711e3980/library_capsule.jpg?t=1791312088`);
  });
});

describe('createSteamApi.search', () => {
  it('rend les jeux (type app) comme candidats, dans l’ordre de Steam', async () => {
    const api = createSteamApi({ fetch: route({ storesearch: search }) });
    expect(await api.search('Elden Ring')).toEqual([
      { source: 'steam', id: 1245620, title: 'ELDEN RING', platforms: ['Windows'], imageUrl: 'https://x/tiny.jpg', popularity: 0 },
    ]);
  });
});
