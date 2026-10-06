import { z } from 'zod';
import type { KeyValueStore } from '../cache/store';
import { IGDB_BASE, IGDB_COVER_BASE, IGDB_THUMB_BASE, TWITCH_TOKEN_URL } from './config';
import { GameError } from './errors';
import type { GameCandidate, GameDetail, GameFetch } from './game-detail';
import { requestJson } from './http';

const TOKEN_KEY = 'igdb-token-v1';
// Un jeton est renouvelé une heure avant son expiration.
const TOKEN_MARGIN_MS = 3_600_000;
// IGDB tolère environ 4 requêtes par seconde.
const GAP_MS = 260;

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });
type StoredToken = { token: string; expiresAt: number };

const row = z.object({
  id: z.number(),
  name: z.string(),
  summary: z.string().optional(),
  first_release_date: z.number().optional(),
  url: z.string().optional(),
  genres: z.array(z.object({ name: z.string() })).optional(),
  platforms: z.array(z.object({ name: z.string() })).optional(),
  involved_companies: z.array(z.object({ developer: z.boolean().optional(), company: z.object({ name: z.string() }).optional() })).optional(),
  aggregated_rating: z.number().optional(),
  aggregated_rating_count: z.number().optional(),
  total_rating: z.number().optional(),
  total_rating_count: z.number().optional(),
  videos: z.array(z.object({ video_id: z.string() })).optional(),
  cover: z.object({ image_id: z.string() }).optional(),
});
const rows = z.array(row);
type Row = z.infer<typeof row>;

const DETAIL_FIELDS =
  'id,name,summary,first_release_date,url,genres.name,platforms.name,involved_companies.developer,involved_companies.company.name,aggregated_rating,aggregated_rating_count,total_rating,total_rating_count,videos.video_id,cover.image_id';
const SEARCH_FIELDS = 'id,name,first_release_date,platforms.name,cover.image_id,total_rating_count';

// Les guillemets et les barres obliques inverses casseraient la requête.
const clean = (text: string): string => text.replace(/[\\"]/g, ' ').trim();
const yearOf = (seconds: number | undefined): number | undefined => (seconds === undefined ? undefined : new Date(seconds * 1000).getUTCFullYear());
const dateText = (seconds: number): string => new Date(seconds * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function toDetail(game: Row): GameDetail {
  const year = yearOf(game.first_release_date);
  const developers = (game.involved_companies ?? []).filter((item) => item.developer && item.company).map((item) => item.company?.name ?? '');
  const critic = game.aggregated_rating !== undefined ? { value: game.aggregated_rating, count: game.aggregated_rating_count ?? 0 } : null;
  const players = game.total_rating !== undefined ? { value: game.total_rating, count: game.total_rating_count ?? 0 } : null;
  const score = critic ?? players;
  const video = game.videos?.[0]?.video_id;
  return {
    source: 'igdb',
    id: game.id,
    title: game.name,
    ...(year !== undefined ? { year } : {}),
    ...(game.summary ? { summary: game.summary } : {}),
    genres: (game.genres ?? []).map((genre) => genre.name),
    platforms: (game.platforms ?? []).map((platform) => platform.name),
    developers,
    ...(game.first_release_date !== undefined ? { releaseDate: dateText(game.first_release_date) } : {}),
    ...(score ? { rating: { kind: 'score' as const, value: Math.round(score.value), count: score.count } } : {}),
    ...(video ? { trailer: { kind: 'youtube' as const, key: video } } : {}),
    ...(game.cover ? { coverUrl: `${IGDB_COVER_BASE}/${game.cover.image_id}.jpg` } : {}),
    pageUrl: game.url ?? `https://www.igdb.com/games/${game.id}`,
  };
}

export function createIgdbApi(deps: {
  fetch: GameFetch;
  clientId: string;
  clientSecret: string;
  store: KeyValueStore;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}) {
  const { fetch: fetchFn, clientId, clientSecret, store } = deps;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function token(renew: boolean): Promise<string> {
    if (!renew) {
      const kept = await store.get<StoredToken>(TOKEN_KEY);
      if (kept && kept.expiresAt - now() > TOKEN_MARGIN_MS) return kept.token;
    }
    const url = `${TWITCH_TOKEN_URL}?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;
    const data = await requestJson('igdb', fetchFn, url, tokenSchema, { method: 'POST' });
    await store.set<StoredToken>(TOKEN_KEY, { token: data.access_token, expiresAt: now() + data.expires_in * 1000 });
    return data.access_token;
  }

  // Les requêtes se suivent, séparées de GAP_MS.
  let tail: Promise<unknown> = Promise.resolve();
  function paced<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task);
    tail = run.then(
      () => sleep(GAP_MS),
      () => sleep(GAP_MS),
    );
    return run;
  }

  function query(body: string): Promise<Row[]> {
    return paced(async () => {
      for (let attempt = 0; ; attempt += 1) {
        const bearer = await token(attempt > 0);
        try {
          return await requestJson('igdb', fetchFn, `${IGDB_BASE}/games`, rows, {
            method: 'POST',
            headers: { 'Client-ID': clientId, Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
            body,
          });
        } catch (error) {
          // Un jeton refusé est renouvelé une fois.
          if (attempt === 0 && error instanceof GameError && error.code === 'auth') continue;
          throw error;
        }
      }
    });
  }

  return {
    async detail(by: { id: number } | { slug: string }): Promise<GameDetail | null> {
      const where = 'id' in by ? `id = ${by.id}` : `slug = "${clean(by.slug)}"`;
      const [game] = await query(`fields ${DETAIL_FIELDS}; where ${where}; limit 1;`);
      return game ? toDetail(game) : null;
    },

    async search(title: string): Promise<GameCandidate[]> {
      const found = await query(`search "${clean(title)}"; fields ${SEARCH_FIELDS}; limit 10;`);
      return found
        .map((game): GameCandidate => {
          const year = yearOf(game.first_release_date);
          return {
            source: 'igdb',
            id: game.id,
            title: game.name,
            ...(year !== undefined ? { year } : {}),
            platforms: (game.platforms ?? []).map((platform) => platform.name),
            ...(game.cover ? { imageUrl: `${IGDB_THUMB_BASE}/${game.cover.image_id}.jpg` } : {}),
            popularity: game.total_rating_count ?? 0,
          };
        })
        .sort((a, b) => b.popularity - a.popularity);
    },
  };
}

export type IgdbApi = ReturnType<typeof createIgdbApi>;
