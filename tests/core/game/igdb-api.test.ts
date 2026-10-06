import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createIgdbApi } from '../../../src/core/game/igdb-api';

const row = {
  id: 1000,
  name: 'Super Metroid',
  summary: 'Samus affronte Ridley.',
  first_release_date: 766713600, // 1994-04-19
  url: 'https://www.igdb.com/games/super-metroid',
  genres: [{ name: 'Platform' }, { name: 'Adventure' }],
  platforms: [{ name: 'Super Nintendo Entertainment System' }],
  involved_companies: [{ developer: true, company: { name: 'Nintendo R&D1' } }, { developer: false, company: { name: 'Nintendo' } }],
  aggregated_rating: 91.4,
  aggregated_rating_count: 21,
  videos: [{ video_id: 'abcdefghijk' }],
  cover: { image_id: 'co1abc' },
};

function setup(over: { games?: (body: string) => Response; tokenStatus?: number } = {}) {
  const calls: { url: string; body?: string; auth?: string }[] = [];
  let tokens = 0;
  const fetch = vi.fn(async (url: string, init?: { body?: string; headers?: Record<string, string> }) => {
    calls.push({ url, ...(init?.body ? { body: init.body } : {}), ...(init?.headers?.Authorization ? { auth: init.headers.Authorization } : {}) });
    if (url.startsWith('https://id.twitch.tv/')) {
      tokens += 1;
      return Response.json({ access_token: `jeton-${tokens}`, expires_in: 5_000_000 }, { status: over.tokenStatus ?? 200 });
    }
    return over.games ? over.games(init?.body ?? '') : Response.json([row]);
  });
  const api = createIgdbApi({ fetch, clientId: 'id', clientSecret: 'secret', store: createMemoryStore(), now: () => 0, sleep: async () => undefined });
  return { api, fetch, calls, tokens: () => tokens };
}

describe('createIgdbApi', () => {
  it('lit un jeu par slug et le met au format commun', async () => {
    const { api, calls } = setup();
    const detail = await api.detail({ slug: 'super-metroid' });
    expect(calls.find((call) => call.url.includes('/games'))?.body).toContain('where slug = "super-metroid"');
    expect(detail).toMatchObject({
      source: 'igdb',
      id: 1000,
      title: 'Super Metroid',
      year: 1994,
      genres: ['Platform', 'Adventure'],
      platforms: ['Super Nintendo Entertainment System'],
      developers: ['Nintendo R&D1'],
      rating: { kind: 'score', value: 91, count: 21 },
      trailer: { kind: 'youtube', key: 'abcdefghijk' },
      pageUrl: 'https://www.igdb.com/games/super-metroid',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1abc.jpg',
    });
    expect(detail?.releaseDate).toContain('1994');
  });

  it('lit un jeu par identifiant, rend null quand IGDB ne le connaît pas', async () => {
    const { api, calls } = setup({ games: () => Response.json([]) });
    expect(await api.detail({ id: 5 })).toBeNull();
    expect(calls.find((call) => call.url.includes('/games'))?.body).toContain('where id = 5');
  });

  it('demande le jeton une fois, le garde, et le renouvelle après un refus (401)', async () => {
    let refused = true;
    const { api, tokens } = setup({
      games: () => {
        if (refused) {
          refused = false;
          return new Response('', { status: 401 });
        }
        return Response.json([row]);
      },
    });
    expect((await api.detail({ id: 1000 }))?.title).toBe('Super Metroid');
    expect(tokens()).toBe(2); // premier jeton refusé, second accepté
    await api.detail({ id: 1000 });
    expect(tokens()).toBe(2);
  });

  it('cherche par titre : candidats du plus connu au moins connu, guillemets retirés de la requête', async () => {
    const rows = [
      { id: 1, name: 'Super Metroid Arcade', first_release_date: 1506816000, platforms: [{ name: 'SNES' }], cover: { image_id: 'a' }, total_rating_count: 0 },
      { id: 2, name: 'Super Metroid', first_release_date: 766713600, platforms: [{ name: 'SNES' }], cover: { image_id: 'b' }, total_rating_count: 300 },
    ];
    const { api, calls } = setup({ games: () => Response.json(rows) });
    const found = await api.search('Super "Metroid"');
    expect(calls.find((call) => call.url.includes('/games'))?.body).toContain('search "Super  Metroid"');
    expect(found.map((candidate) => candidate.id)).toEqual([2, 1]);
    expect(found[0]).toMatchObject({ source: 'igdb', title: 'Super Metroid', year: 1994, platforms: ['SNES'], popularity: 300, imageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_small/b.jpg' });
  });

  it("une réponse sans la structure attendue lève une erreur, et un échec du jeton aussi", async () => {
    await expect(setup({ games: () => Response.json({ pas: 'un tableau' }) }).api.detail({ id: 1 })).rejects.toMatchObject({ name: 'GameError', source: 'igdb' });
    await expect(setup({ tokenStatus: 403 }).api.detail({ id: 1 })).rejects.toMatchObject({ code: 'auth' });
  });
});
