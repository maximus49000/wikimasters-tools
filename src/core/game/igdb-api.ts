import { z } from 'zod';
import { IGDB_COVER_BASE, IGDB_RELAY, IGDB_THUMB_BASE } from './config';
import type { GameCandidate, GameDetail, GameFetch } from './game-detail';
import { requestJson } from './http';
import { detailQuery, searchQuery } from './igdb-queries';

// IGDB tolère environ 4 requêtes par seconde.
const GAP_MS = 260;

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

export function createIgdbApi(deps: { fetch: GameFetch; sleep?: (ms: number) => Promise<void> }) {
  const { fetch: fetchFn } = deps;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

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

  // Le relais ajoute les identifiants et le jeton : le client n'envoie que la requête, en texte simple (pas de préambule CORS).
  function query(body: string): Promise<Row[]> {
    return paced(() => requestJson('igdb', fetchFn, IGDB_RELAY, rows, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body }));
  }

  return {
    async detail(by: { id: number } | { slug: string }): Promise<GameDetail | null> {
      // Un slug de forme inattendue serait refusé par le relais (400) et sauterait le repli par recherche de titre.
      if ('slug' in by && !/^[\w.-]{1,120}$/.test(by.slug)) return null;
      const [game] = await query(detailQuery(by));
      return game ? toDetail(game) : null;
    },

    async search(title: string): Promise<GameCandidate[]> {
      const found = await query(searchQuery(title));
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
