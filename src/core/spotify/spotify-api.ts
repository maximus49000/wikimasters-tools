import { z } from 'zod';
import { API_URL } from './config';
import { SpotifyError } from './errors';
import type { SpotifyFetch, SpotifySession } from './spotify-session';

export type Track = { uri: string; title: string; artist: string };
export type FoundTrack = Track & { artistIds: string[]; artists: string[] };
// `null` : reprendre la lecture en cours.
export type PlayTarget = { uris: string[] } | { contextUri: string; offsetUri: string } | null;
export type PlayerState = { playing: boolean; title: string; artist: string; imageUrl: string | null } | null;

// Maximum accepté par Spotify pour les applications en mode développement (février 2026).
const SEARCH_MAX = 10;

const artistSchema = z.object({ id: z.string().optional(), name: z.string() });
const trackSchema = z.object({ uri: z.string(), name: z.string(), artists: z.array(artistSchema) });
const searchTracksSchema = z.object({ tracks: z.object({ items: z.array(trackSchema) }) });
const searchAlbumsSchema = z.object({ albums: z.object({ items: z.array(z.object({ id: z.string() })) }) });
const albumTracksSchema = z.object({ items: z.array(trackSchema) });
const stateSchema = z.object({
  is_playing: z.boolean(),
  item: z
    .object({ name: z.string(), artists: z.array(artistSchema), album: z.object({ images: z.array(z.object({ url: z.string() })) }).optional() })
    .nullish(),
});

const joinArtists = (artists: { name: string }[]): string => artists.map((artist) => artist.name).join(', ');

function parse<T>(schema: z.ZodType<T>, json: unknown): T {
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new SpotifyError('http', 'Réponse Spotify inattendue');
  return parsed.data;
}

export function createSpotifyApi(deps: { session: Pick<SpotifySession, 'accessToken'>; fetch: SpotifyFetch }) {
  const { session, fetch } = deps;

  async function send(method: string, path: string, options: { query?: Record<string, string>; body?: unknown } = {}): Promise<Response> {
    const url = `${API_URL}${path}${options.query ? `?${new URLSearchParams(options.query).toString()}` : ''}`;
    for (let attempt = 0; ; attempt += 1) {
      const token = await session.accessToken(attempt > 0);
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
      if (response.status === 401) {
        // Un seul essai avec un jeton neuf.
        if (attempt === 0) continue;
        throw new SpotifyError('not-linked', 'Jeton Spotify refusé');
      }
      if (response.status === 404 && path.startsWith('/me/player')) throw new SpotifyError('no-device', 'Aucun appareil Spotify actif');
      if (response.status === 403) throw new SpotifyError('not-premium', 'Spotify Premium requis');
      if (response.status === 429) {
        const seconds = Number(response.headers.get('Retry-After'));
        throw new SpotifyError('rate-limited', 'Trop de requêtes', Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5000);
      }
      if (!response.ok) throw new SpotifyError('http', `Spotify : HTTP ${response.status}`);
      return response;
    }
  }

  return {
    async searchTracks(query: string, limit = SEARCH_MAX): Promise<FoundTrack[]> {
      const response = await send('GET', '/search', { query: { q: query, type: 'track', limit: String(Math.min(limit, SEARCH_MAX)) } });
      return parse(searchTracksSchema, await response.json()).tracks.items.map((item) => ({
        uri: item.uri,
        title: item.name,
        artist: joinArtists(item.artists),
        artistIds: item.artists.flatMap((artist) => (artist.id ? [artist.id] : [])),
        artists: item.artists.map((artist) => artist.name),
      }));
    },

    async searchAlbum(title: string, performer?: string): Promise<string | null> {
      const q = `album:"${title}"${performer ? ` artist:"${performer}"` : ''}`;
      const response = await send('GET', '/search', { query: { q, type: 'album', limit: '1' } });
      return parse(searchAlbumsSchema, await response.json()).albums.items[0]?.id ?? null;
    },

    async albumTracks(albumId: string): Promise<Track[]> {
      const response = await send('GET', `/albums/${encodeURIComponent(albumId)}/tracks`, { query: { limit: '50' } });
      return parse(albumTracksSchema, await response.json()).items.map((item) => ({
        uri: item.uri,
        title: item.name,
        artist: joinArtists(item.artists),
      }));
    },

    async play(target: PlayTarget): Promise<void> {
      const body = !target ? undefined : 'uris' in target ? { uris: target.uris } : { context_uri: target.contextUri, offset: { uri: target.offsetUri } };
      await send('PUT', '/me/player/play', body ? { body } : {});
    },

    async pause(): Promise<void> {
      await send('PUT', '/me/player/pause');
    },

    async playerState(): Promise<PlayerState> {
      const response = await send('GET', '/me/player');
      // 204 : aucun appareil ne joue ni n'a joué récemment.
      if (response.status === 204) return null;
      const state = parse(stateSchema, await response.json());
      if (!state.item) return null;
      return {
        playing: state.is_playing,
        title: state.item.name,
        artist: joinArtists(state.item.artists),
        imageUrl: state.item.album?.images[0]?.url ?? null,
      };
    },
  };
}

export type SpotifyApi = ReturnType<typeof createSpotifyApi>;
