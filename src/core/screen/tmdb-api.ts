import { z } from 'zod';
import { TMDB_BASE } from './config';
import type { ScreenKind } from './screen-kinds';

export type MediaType = 'movie' | 'tv';
export type TmdbFetch = (url: string) => Promise<Response>;

export type ScreenDetail = {
  mediaType: MediaType;
  id: number;
  title: string;
  year?: number;
  overview: string;
  rating?: { average: number; votes: number };
  trailerKey?: string;
};
export type FilmographyItem = { mediaType: MediaType; id: number; title: string; year?: number; rating?: number; posterPath?: string };

export const MAX_FILMOGRAPHY = 40;
const LANGUAGE = 'fr-FR';

export type TmdbErrorCode = 'auth' | 'not-found' | 'rate-limited' | 'http';

export class TmdbError extends Error {
  constructor(
    readonly code: TmdbErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TmdbError';
  }
}

const MESSAGES: Record<TmdbErrorCode, string> = {
  auth: 'La clé TMDB est refusée.',
  'not-found': 'Introuvable sur TMDB.',
  'rate-limited': 'TMDB demande de patienter un instant. Réessaie dans quelques secondes.',
  http: 'TMDB est indisponible pour le moment.',
};

export const userMessage = (error: unknown): string => (error instanceof TmdbError ? MESSAGES[error.code] : MESSAGES.http);

const video = z.object({ site: z.string(), type: z.string(), key: z.string(), official: z.boolean().optional(), iso_639_1: z.string().nullish() });
const detailSchema = z.object({
  id: z.number(),
  title: z.string().optional(),
  name: z.string().optional(),
  release_date: z.string().optional(),
  first_air_date: z.string().optional(),
  overview: z.string().optional(),
  vote_average: z.number().optional(),
  vote_count: z.number().optional(),
  videos: z.object({ results: z.array(video) }).optional(),
});
const credit = z.object({
  id: z.number(),
  media_type: z.string(),
  title: z.string().optional(),
  name: z.string().optional(),
  release_date: z.string().optional(),
  first_air_date: z.string().optional(),
  vote_average: z.number().optional(),
  vote_count: z.number().optional(),
  poster_path: z.string().nullish(),
  job: z.string().optional(),
});
const creditsSchema = z.object({ cast: z.array(credit).optional(), crew: z.array(credit).optional() });
const searchSchema = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      title: z.string().optional(),
      name: z.string().optional(),
      original_title: z.string().optional(),
      original_name: z.string().optional(),
    }),
  ),
});

const yearOf = (date: string | undefined): number | undefined => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : undefined);
const roundRating = (value: number): number => Math.round(value * 10) / 10;
const normalize = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Français d'abord, puis officielle : la première bande-annonce YouTube.
function pickTrailer(videos: z.infer<typeof video>[]): string | undefined {
  const score = (item: z.infer<typeof video>) => (item.iso_639_1 === 'fr' ? 2 : 0) + (item.official ? 1 : 0);
  const candidates = videos.filter((item) => item.site === 'YouTube' && item.type === 'Trailer');
  return [...candidates].sort((a, b) => score(b) - score(a))[0]?.key;
}

export function createTmdbApi(deps: { fetch: TmdbFetch; apiKey: string }) {
  async function get<S extends z.ZodType>(path: string, params: Record<string, string>, schema: S): Promise<z.infer<S>> {
    const query = new URLSearchParams({ api_key: deps.apiKey, language: LANGUAGE, ...params });
    let response: Response;
    try {
      response = await deps.fetch(`${TMDB_BASE}${path}?${query.toString()}`);
    } catch {
      throw new TmdbError('http', 'TMDB injoignable');
    }
    if (response.status === 401) throw new TmdbError('auth', 'clé refusée');
    if (response.status === 404) throw new TmdbError('not-found', 'introuvable');
    if (response.status === 429) throw new TmdbError('rate-limited', 'limite atteinte');
    if (!response.ok) throw new TmdbError('http', `HTTP ${response.status}`);
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) throw new TmdbError('http', 'Réponse TMDB inattendue');
    return parsed.data;
  }

  return {
    async detail(mediaType: MediaType, id: number): Promise<ScreenDetail> {
      const data = await get(`/${mediaType}/${id}`, { append_to_response: 'videos', include_video_language: 'fr,en,null' }, detailSchema);
      const year = yearOf(data.release_date ?? data.first_air_date);
      const trailerKey = pickTrailer(data.videos?.results ?? []);
      return {
        mediaType,
        id,
        title: data.title ?? data.name ?? '',
        ...(year !== undefined ? { year } : {}),
        overview: data.overview ?? '',
        ...(data.vote_count && data.vote_count > 0 ? { rating: { average: roundRating(data.vote_average ?? 0), votes: data.vote_count } } : {}),
        ...(trailerKey ? { trailerKey } : {}),
      };
    },

    // Filmographie : rôles d'acteur et/ou réalisations, sans doublon, du plus récent au plus ancien.
    async person(id: number, roles: { acting: boolean; directing: boolean }): Promise<FilmographyItem[]> {
      const data = await get(`/person/${id}/combined_credits`, {}, creditsSchema);
      const entries = [
        ...(roles.acting ? (data.cast ?? []) : []),
        ...(roles.directing ? (data.crew ?? []).filter((entry) => entry.job === 'Director') : []),
      ];
      const seen = new Set<string>();
      const items: { date: string; item: FilmographyItem }[] = [];
      for (const entry of entries) {
        if (entry.media_type !== 'movie' && entry.media_type !== 'tv') continue;
        const title = entry.title ?? entry.name;
        const key = `${entry.media_type}:${entry.id}`;
        if (!title || seen.has(key)) continue;
        seen.add(key);
        const date = entry.release_date || entry.first_air_date || '';
        const year = yearOf(date);
        items.push({
          date,
          item: {
            mediaType: entry.media_type,
            id: entry.id,
            title,
            ...(year !== undefined ? { year } : {}),
            ...(entry.vote_count && entry.vote_count > 0 && entry.vote_average ? { rating: roundRating(entry.vote_average) } : {}),
            ...(entry.poster_path ? { posterPath: entry.poster_path } : {}),
          },
        });
      }
      return items
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, MAX_FILMOGRAPHY)
        .map(({ item }) => item);
    },

    // Recherche par titre quand Wikidata n'a pas d'identifiant : on ne retient qu'un titre strictement identique.
    async search(kind: ScreenKind, query: string): Promise<number | null> {
      const path = kind === 'film' ? '/search/movie' : kind === 'series' ? '/search/tv' : '/search/person';
      const data = await get(path, { query }, searchSchema);
      const wanted = normalize(query);
      const found = data.results.find((result) =>
        [result.title, result.name, result.original_title, result.original_name].some((label) => label !== undefined && normalize(label) === wanted),
      );
      return found?.id ?? null;
    },
  };
}

export type TmdbApi = ReturnType<typeof createTmdbApi>;
