// relay/src/youtube.ts
import { z } from 'zod';
import type { DocCandidate } from '../../src/core/documentary/types';

export type FetchLike = (url: string) => Promise<Response>;

const API = 'https://www.googleapis.com/youtube/v3';

const playlistSchema = z.object({
  nextPageToken: z.string().optional(),
  items: z.array(z.object({ snippet: z.object({ title: z.string() }), contentDetails: z.object({ videoId: z.string() }) })).default([]),
});
const durationsSchema = z.object({ items: z.array(z.object({ id: z.string(), contentDetails: z.object({ duration: z.string() }) })).default([]) });

// « PT1H2M3S » → secondes ; null si le format est inconnu.
export function parseDuration(iso: string): number | null {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  return Number(days ?? 0) * 86400 + Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
}

async function getJson(fetchFn: FetchLike, path: string, params: Record<string, string>): Promise<unknown> {
  const response = await fetchFn(`${API}/${path}?${new URLSearchParams(params).toString()}`);
  if (!response.ok) throw new Error(`YouTube : HTTP ${response.status}`);
  return response.json();
}

export type UploadedVideo = { id: string; title: string; durationSec: number | null };

// Une page (50 vidéos) de la liste des vidéos d'une chaîne, avec leurs durées : 2 unités de quota.
export async function fetchUploadsPage(fetchFn: FetchLike, key: string, playlistId: string, pageToken?: string): Promise<{ videos: UploadedVideo[]; next: string | null }> {
  const page = playlistSchema.parse(await getJson(fetchFn, 'playlistItems', { part: 'snippet,contentDetails', playlistId, maxResults: '50', key, ...(pageToken ? { pageToken } : {}) }));
  const ids = page.items.map((item) => item.contentDetails.videoId);
  const durations = new Map<string, number | null>();
  if (ids.length > 0) {
    const details = durationsSchema.parse(await getJson(fetchFn, 'videos', { part: 'contentDetails', id: ids.join(','), key }));
    for (const item of details.items) durations.set(item.id, parseDuration(item.contentDetails.duration));
  }
  const videos = page.items
    .filter((item) => item.snippet.title !== 'Private video' && item.snippet.title !== 'Deleted video')
    .map((item) => ({ id: item.contentDetails.videoId, title: item.snippet.title, durationSec: durations.get(item.contentDetails.videoId) ?? null }));
  return { videos, next: page.nextPageToken ?? null };
}

const searchSchema = z.object({ items: z.array(z.object({ id: z.object({ videoId: z.string().optional() }) })).default([]) });
const videosSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z.object({ title: z.string(), channelTitle: z.string(), description: z.string().default(''), defaultAudioLanguage: z.string().optional(), defaultLanguage: z.string().optional() }),
        contentDetails: z.object({ duration: z.string() }),
      }),
    )
    .default([]),
});

// Une recherche (100 unités de quota), puis les durées et langues des résultats (1 unité). Seules les vidéos intégrables ailleurs sont demandées.
export async function searchYoutube(fetchFn: FetchLike, key: string, query: string): Promise<DocCandidate[]> {
  const found = searchSchema.parse(
    await getJson(fetchFn, 'search', { part: 'snippet', type: 'video', maxResults: '10', q: query, relevanceLanguage: 'fr', videoEmbeddable: 'true', videoSyndicated: 'true', safeSearch: 'moderate', key }),
  );
  const ids = found.items.map((item) => item.id.videoId).filter((id): id is string => id !== undefined);
  if (ids.length === 0) return [];
  const details = videosSchema.parse(await getJson(fetchFn, 'videos', { part: 'snippet,contentDetails', id: ids.join(','), key }));
  return details.items.map((video) => ({
    source: 'youtube' as const,
    id: video.id,
    title: video.snippet.title,
    channel: video.snippet.channelTitle,
    durationSec: parseDuration(video.contentDetails.duration),
    language: video.snippet.defaultAudioLanguage ?? video.snippet.defaultLanguage ?? null,
    description: video.snippet.description,
    url: `https://www.youtube.com/watch?v=${video.id}`,
    thumbUrl: `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`,
  }));
}
