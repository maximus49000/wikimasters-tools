import { z } from 'zod';
import { API_URL } from './config';
import { SpotifyError } from './errors';
import type { SpotifyFetch, SpotifySession } from './spotify-session';

export type Track = { uri: string; title: string; artist: string };
export type FoundTrack = Track & { artistIds: string[]; artists: string[] };
// `null` : reprendre la lecture en cours.
export type PlayTarget = { uris: string[] } | { contextUri: string; offsetUri: string } | null;
export type PlayerState = { playing: boolean; uri: string; title: string; artist: string; imageUrl: string | null } | null;

// Maximum accepté par Spotify pour les applications en mode développement (février 2026).
const SEARCH_MAX = 10;

// Attente quand Spotify limite sans que `Retry-After` soit lisible : 5 s, ×3 à chaque limite d'affilée, plafonnée à 5 min.
const UNREADABLE_LIMIT_BASE_MS = 5_000;
const UNREADABLE_LIMIT_MAX_MS = 300_000;

const artistSchema = z.object({ id: z.string().optional(), name: z.string() });
const trackSchema = z.object({ uri: z.string(), name: z.string(), artists: z.array(artistSchema) });
const searchTracksSchema = z.object({ tracks: z.object({ items: z.array(trackSchema) }) });
const searchAlbumsSchema = z.object({ albums: z.object({ items: z.array(z.object({ id: z.string() })) }) });
const coverImages = z.array(z.object({ url: z.string() }));
const coverAlbumsSchema = z.object({ albums: z.object({ items: z.array(z.object({ images: coverImages })) }) });
const coverTracksSchema = z.object({ tracks: z.object({ items: z.array(z.object({ album: z.object({ images: coverImages }).optional() })) }) });
const coverArtistsSchema = z.object({ artists: z.object({ items: z.array(z.object({ images: coverImages })) }) });
const albumTracksSchema = z.object({ items: z.array(trackSchema) });
const stateSchema = z.object({
  is_playing: z.boolean(),
  item: z
    .object({
      uri: z.string(),
      name: z.string(),
      // Un épisode de podcast n'a pas d'artistes : l'émission fait office d'artiste, et la pochette est sur l'élément lui-même.
      artists: z.array(artistSchema).optional(),
      show: z.object({ name: z.string() }).optional(),
      images: z.array(z.object({ url: z.string() })).optional(),
      album: z.object({ images: z.array(z.object({ url: z.string() })) }).optional(),
    })
    .nullish(),
});

const devicesSchema = z.object({
  devices: z.array(z.object({ id: z.string().nullable(), type: z.string(), is_active: z.boolean().optional(), is_restricted: z.boolean().optional() })),
});

const joinArtists = (artists: { name: string }[]): string => artists.map((artist) => artist.name).join(', ');

function parse<T>(schema: z.ZodType<T>, json: unknown): T {
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new SpotifyError('http', 'Réponse Spotify inattendue');
  return parsed.data;
}

type Device = z.infer<typeof devicesSchema>['devices'][number];

// `deviceTypes` : types d'appareil Spotify où lancer la lecture, par ordre de préférence (ex. `Smartphone` sur le téléphone).
export function createSpotifyApi(deps: { session: Pick<SpotifySession, 'accessToken'>; fetch: SpotifyFetch; deviceTypes?: readonly string[]; now?: () => number }) {
  const { session, fetch, deviceTypes = [], now = () => Date.now() } = deps;
  // Spotify limite l'application entière (fenêtre de 30 s, plus étroite en mode développement) : après un 429, plus aucun appel ne part avant la fin de l'attente demandée.
  let blockedUntil = 0;
  // Limites d'affilée sans `Retry-After` lisible : Spotify ne l'expose pas en CORS, une page web (WebView de l'APK) ne le voit donc jamais.
  // Deviner « 5 s » à chaque fois reviendrait frapper en boucle une application déjà limitée : l'attente s'allonge jusqu'au plafond.
  let unreadableLimits = 0;

  async function send(method: string, path: string, options: { query?: Record<string, string>; body?: unknown } = {}): Promise<Response> {
    const url = `${API_URL}${path}${options.query ? `?${new URLSearchParams(options.query).toString()}` : ''}`;
    const remaining = blockedUntil - now();
    if (remaining > 0) throw new SpotifyError('rate-limited', 'Limite Spotify atteinte', remaining);
    for (let attempt = 0; ; attempt += 1) {
      const token = await session.accessToken(attempt > 0);
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
      // Toute autre réponse prouve que la limite est levée.
      if (response.status !== 429) unreadableLimits = 0;
      if (response.status === 401) {
        // Un seul essai avec un jeton neuf.
        if (attempt === 0) continue;
        throw new SpotifyError('not-linked', 'Jeton Spotify refusé');
      }
      if (response.status === 404 && path.startsWith('/me/player')) throw new SpotifyError('no-device', 'Aucun appareil Spotify actif');
      if (response.status === 403) throw new SpotifyError('not-premium', 'Spotify Premium requis');
      if (response.status === 429) {
        const seconds = Number(response.headers.get('Retry-After'));
        const readable = Number.isFinite(seconds) && seconds > 0;
        unreadableLimits = readable ? 0 : unreadableLimits + 1;
        const retryAfterMs = readable ? seconds * 1000 : Math.min(UNREADABLE_LIMIT_BASE_MS * 3 ** (unreadableLimits - 1), UNREADABLE_LIMIT_MAX_MS);
        blockedUntil = now() + retryAfterMs;
        console.warn('[wikimasters-tools]', `Spotify : limite atteinte (${method} ${path}), pause de ${Math.round(retryAfterMs / 1000)} s`);
        throw new SpotifyError('rate-limited', 'Trop de requêtes', retryAfterMs);
      }
      if (!response.ok) throw new SpotifyError('http', `Spotify : HTTP ${response.status}`);
      return response;
    }
  }

  async function usableDevices(): Promise<Device[]> {
    const response = await send('GET', '/me/player/devices');
    const parsed = devicesSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.devices.filter((device) => device.id && !device.is_restricted) : [];
  }

  // Premier appareil du type le plus préféré.
  const preferredDevice = (devices: Device[]): Device | undefined => {
    for (const type of deviceTypes) {
      const found = devices.find((device) => device.type === type);
      if (found) return found;
    }
    return undefined;
  };

  async function firstDeviceId(): Promise<string | null> {
    const usable = await usableDevices();
    return (preferredDevice(usable) ?? usable.find((device) => device.type === 'Computer') ?? usable[0])?.id ?? null;
  }

  // Sans consigne, Spotify joue sur le dernier appareil actif (souvent une enceinte) : on vise plutôt cet appareil-ci.
  async function preferredDeviceId(): Promise<string | null> {
    if (deviceTypes.length === 0) return null;
    try {
      const usable = await usableDevices();
      if (usable.some((device) => device.is_active && deviceTypes.includes(device.type))) return null;
      return preferredDevice(usable)?.id ?? null;
    } catch {
      return null;
    }
  }

  return {
    // Bouton « Réessayer maintenant » : lève la pause d'après un 429 pour que le prochain appel parte. L'escalade des attentes est gardée :
    // si Spotify limite encore, la pause suivante est plus longue au lieu de repartir de 5 s.
    clearLimit(): void {
      blockedUntil = 0;
    },

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

    // Pochette d'un album (ou du disque d'un morceau) ; Spotify classe les images de la plus grande à la plus petite.
    async findCover(kind: 'album' | 'track', title: string, performer?: string): Promise<string | null> {
      const artist = performer ? ` artist:"${performer}"` : '';
      if (kind === 'album') {
        const response = await send('GET', '/search', { query: { q: `album:"${title}"${artist}`, type: 'album', limit: '1' } });
        return parse(coverAlbumsSchema, await response.json()).albums.items[0]?.images[0]?.url ?? null;
      }
      const response = await send('GET', '/search', { query: { q: `track:"${title}"${artist}`, type: 'track', limit: '1' } });
      return parse(coverTracksSchema, await response.json()).tracks.items[0]?.album?.images[0]?.url ?? null;
    },

    // Photo d'un artiste, en dernier recours quand l'album n'a pas de pochette.
    async findArtistImage(name: string): Promise<string | null> {
      const response = await send('GET', '/search', { query: { q: `artist:"${name}"`, type: 'artist', limit: '1' } });
      return parse(coverArtistsSchema, await response.json()).artists.items[0]?.images[0]?.url ?? null;
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
      // Reprise (sans titre) : on laisse l'appareil courant ; un nouveau titre se lance sur cet appareil-ci.
      const here = target ? await preferredDeviceId() : null;
      if (here) {
        await send('PUT', '/me/player/play', { query: { device_id: here }, body });
        return;
      }
      try {
        await send('PUT', '/me/player/play', body ? { body } : {});
      } catch (error) {
        if (!(error instanceof SpotifyError) || error.code !== 'no-device') throw error;
        // Application ouverte mais sans lecture récente : elle est visible comme appareil sans être « active », on la cible et elle se réveille.
        const deviceId = await firstDeviceId();
        if (!deviceId) throw error;
        await send('PUT', '/me/player/play', { query: { device_id: deviceId }, ...(body ? { body } : {}) });
      }
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
        uri: state.item.uri,
        title: state.item.name,
        artist: state.item.artists ? joinArtists(state.item.artists) : (state.item.show?.name ?? ''),
        imageUrl: state.item.album?.images[0]?.url ?? state.item.images?.[0]?.url ?? null,
      };
    },
  };
}

export type SpotifyApi = ReturnType<typeof createSpotifyApi>;
