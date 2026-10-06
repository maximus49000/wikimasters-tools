import { z } from 'zod';
import { STEAM_API_BASE, STEAM_STORE_BASE } from './config';
import { GameError } from './errors';
import type { GameCandidate, GameDetail, GameFetch } from './game-detail';
import { formatPrice, steamPageUrl, verdictFr, yearOfText } from './game-format';
import { requestJson } from './http';

const platformFlags = z.object({ windows: z.boolean().optional(), mac: z.boolean().optional(), linux: z.boolean().optional() });
const detailsSchema = z.record(
  z.string(),
  z.object({
    success: z.boolean(),
    data: z
      .object({
        name: z.string(),
        short_description: z.string().optional(),
        is_free: z.boolean().optional(),
        developers: z.array(z.string()).optional(),
        genres: z.array(z.object({ description: z.string() })).optional(),
        release_date: z.object({ date: z.string().optional() }).optional(),
        price_overview: z.object({ currency: z.string(), final: z.number() }).optional(),
        metacritic: z.object({ score: z.number(), url: z.string().optional() }).optional(),
        platforms: platformFlags.optional(),
        movies: z.array(z.object({ thumbnail: z.string().optional(), hls_h264: z.string().optional(), highlight: z.boolean().optional() })).optional(),
        header_image: z.string().optional(),
      })
      .optional(),
  }),
);
const reviewsSchema = z.object({
  query_summary: z.object({ review_score_desc: z.string().optional(), total_positive: z.number(), total_negative: z.number(), total_reviews: z.number() }),
});
const playersSchema = z.object({ response: z.object({ player_count: z.number().optional() }) });
const searchSchema = z.object({
  items: z.array(z.object({ type: z.string(), id: z.number(), name: z.string(), tiny_image: z.string().optional(), platforms: platformFlags.optional() })),
});

const platformNames = (flags: z.infer<typeof platformFlags> | undefined): string[] => [
  ...(flags?.windows ? ['Windows'] : []),
  ...(flags?.mac ? ['macOS'] : []),
  ...(flags?.linux ? ['Linux'] : []),
];

export function createSteamApi(deps: { fetch: GameFetch }) {
  const get = <S extends z.ZodType>(url: string, schema: S) => requestJson('steam', deps.fetch, url, schema);
  // Avis et joueurs en ligne sont un plus : leur panne ne casse pas la fiche, une limite de débit si (rien ne doit être gardé).
  const optional = <T>(promise: Promise<T>): Promise<T | null> =>
    promise.catch((error: unknown) => {
      if (error instanceof GameError && error.code === 'rate-limited') throw error;
      return null;
    });

  return {
    async detail(appid: number): Promise<GameDetail | null> {
      const [details, reviews, players] = await Promise.all([
        get(`${STEAM_STORE_BASE}/api/appdetails?appids=${appid}&l=french&cc=fr`, detailsSchema),
        optional(get(`${STEAM_STORE_BASE}/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=1`, reviewsSchema)),
        optional(get(`${STEAM_API_BASE}/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`, playersSchema)),
      ]);
      const entry = details[String(appid)];
      const data = entry?.success ? entry.data : undefined;
      if (!data) return null;

      const summary = reviews?.query_summary;
      const total = summary?.total_reviews ?? 0;
      const verdict = verdictFr(summary?.review_score_desc);
      const movie = data.movies?.find((item) => item.highlight && item.hls_h264) ?? data.movies?.find((item) => item.hls_h264);
      const price = data.is_free ? 'Gratuit' : data.price_overview ? formatPrice(data.price_overview.currency, data.price_overview.final) : undefined;
      const year = yearOfText(data.release_date?.date);

      return {
        source: 'steam',
        id: appid,
        title: data.name,
        ...(year !== undefined ? { year } : {}),
        ...(data.short_description ? { summary: data.short_description } : {}),
        genres: (data.genres ?? []).map((genre) => genre.description),
        platforms: platformNames(data.platforms),
        developers: data.developers ?? [],
        ...(data.release_date?.date ? { releaseDate: data.release_date.date } : {}),
        ...(summary && total > 0
          ? { rating: { kind: 'positive' as const, value: Math.round((100 * summary.total_positive) / total), count: total, ...(verdict ? { verdict } : {}) } }
          : {}),
        ...(data.metacritic ? { metascore: { score: data.metacritic.score, ...(data.metacritic.url ? { url: data.metacritic.url } : {}) } } : {}),
        ...(price ? { price } : {}),
        ...(players?.response.player_count !== undefined ? { playersOnline: players.response.player_count } : {}),
        ...(movie?.hls_h264 ? { trailer: { kind: 'hls' as const, url: movie.hls_h264, ...(movie.thumbnail ? { poster: movie.thumbnail } : {}) } } : {}),
        ...(data.header_image ? { coverUrl: data.header_image } : {}),
        pageUrl: steamPageUrl(appid),
      };
    },

    async search(title: string): Promise<GameCandidate[]> {
      const data = await get(`${STEAM_STORE_BASE}/api/storesearch/?term=${encodeURIComponent(title)}&l=french&cc=fr`, searchSchema);
      return data.items
        .filter((item) => item.type === 'app')
        .map((item) => ({
          source: 'steam' as const,
          id: item.id,
          title: item.name,
          platforms: platformNames(item.platforms),
          ...(item.tiny_image ? { imageUrl: item.tiny_image } : {}),
          popularity: 0,
        }));
    },
  };
}

export type SteamApi = ReturnType<typeof createSteamApi>;
