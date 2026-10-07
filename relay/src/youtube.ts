// relay/src/youtube.ts
import { z } from 'zod';

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
