import { z } from 'zod';
import type { KeyValueStore } from '../cache/store';
import { createCallQueue, type Priority } from '../spotify/call-queue';
import { createLimitGate } from '../spotify/limit-gate';
import { TIDAL_API_URL } from './config';
import { TidalError } from './errors';
import type { TidalFetch, TidalSession } from './tidal-session';

export type TidalTrack = { id: string; title: string; artists: string[] };
export type TidalAlbum = { id: string; title: string; artists: string[] };
export type TidalArtist = { id: string; name: string };
type Item = { id: string; title: string };

// Délai minimal entre deux appels : Tidal ne publie pas sa limite, estimation à ajuster à l'usage.
const PAGE_GAP_MS = 250;
const SEARCH_MAX = 10;
// Un album a rarement plus de 100 pistes : 5 pages de 20 suffisent.
const MAX_PAGES = 5;
const FAMILY = 'catalog' as const;

const linkSchema = z.object({ id: z.string(), type: z.string() });
const relationSchema = z.object({ data: z.union([z.array(linkSchema), linkSchema]).nullish() });
const resourceSchema = z.object({
  id: z.string(),
  type: z.string(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  relationships: z.record(z.string(), relationSchema).optional(),
});
const documentSchema = z.object({
  data: z.union([resourceSchema, z.array(resourceSchema)]),
  included: z.array(resourceSchema).optional(),
  links: z.object({ meta: z.object({ nextCursor: z.string().optional() }).optional() }).optional(),
});

type Resource = z.infer<typeof resourceSchema>;
type Doc = z.infer<typeof documentSchema>;
type Link = z.infer<typeof linkSchema>;
type Index = Map<string, Resource>;

const keyOf = (type: string, id: string): string => `${type}:${id}`;
const indexOf = (doc: Doc): Index => new Map((doc.included ?? []).map((resource) => [keyOf(resource.type, resource.id), resource] as const));
const linksOf = (resource: Resource | undefined, relation: string): Link[] => {
  const data = resource?.relationships?.[relation]?.data;
  return Array.isArray(data) ? data : data ? [data] : [];
};
const attribute = (resource: Resource, name: string): string | null => {
  const value = resource.attributes?.[name];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
};
// « Ghost Town » + version « Live » : « Ghost Town (Live) ». Tidal met parfois déjà la version dans le titre
// (« Abbey Road (Remastered) », version « Remastered ») : on ne la répète pas.
const titled = (resource: Resource): string | null => {
  const title = attribute(resource, 'title');
  if (!title) return null;
  const version = attribute(resource, 'version');
  return version && !title.toLowerCase().includes(version.toLowerCase()) ? `${title} (${version})` : title;
};
const artistNames = (resource: Resource, index: Index): string[] =>
  linksOf(resource, 'artists').flatMap((link) => {
    const artist = index.get(keyOf('artists', link.id));
    const name = artist ? attribute(artist, 'name') : null;
    return name ? [name] : [];
  });
// Les ressources d'une relation, dans l'ordre de Tidal (la pertinence) : `included` n'est pas ordonné.
const ranked = (root: Resource | undefined, relation: string, type: string, index: Index): Resource[] =>
  linksOf(root, relation).flatMap((link) => {
    const resource = index.get(keyOf(type, link.id));
    return resource ? [resource] : [];
  });
const rootOf = (doc: Doc): Resource | undefined => (Array.isArray(doc.data) ? doc.data[0] : doc.data);

export function createTidalApi(deps: {
  session: Pick<TidalSession, 'accessToken'>;
  fetch: TidalFetch;
  store: KeyValueStore;
  countryCode: string;
  now?: () => number;
  // Remplaçables en test.
  gaps?: Partial<Record<Priority, number>>;
  sleep?: (ms: number) => Promise<void>;
}) {
  const { session, fetch, store, countryCode, now = () => Date.now(), gaps, sleep } = deps;
  const gate = createLimitGate({ store, now, prefix: 'tidal-limit' });
  const queue = createCallQueue({ gaps: { now: 0, page: PAGE_GAP_MS, image: PAGE_GAP_MS, ...gaps }, now, ...(sleep ? { sleep } : {}) });

  async function sendNow(path: string, query: Record<string, string>): Promise<Response> {
    const url = `${TIDAL_API_URL}${path}?${new URLSearchParams({ countryCode, ...query }).toString()}`;
    for (let attempt = 0; ; attempt += 1) {
      const token = await session.accessToken(attempt > 0);
      const response = await fetch(url, { headers: { accept: 'application/vnd.api+json', Authorization: `Bearer ${token}` } });
      // Toute autre réponse prouve que la limite est levée.
      if (response.status !== 429) await gate.success(FAMILY);
      if (response.status === 401) {
        // Un seul essai avec un jeton neuf.
        if (attempt === 0) continue;
        throw new TidalError('not-linked', 'Jeton Tidal refusé');
      }
      if (response.status === 429) {
        // `Retry-After` n'est lisible que par le service worker de l'extension (CORS : page web, WebView de l'APK).
        const seconds = Number(response.headers.get('Retry-After'));
        const { waitMs, until } = await gate.trip(FAMILY, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null);
        console.warn('[wikimasters-tools]', `Tidal : limite atteinte (${path}), pause de ${Math.round(waitMs / 1000)} s`);
        throw new TidalError('rate-limited', 'Trop de requêtes', waitMs, until);
      }
      if (!response.ok) throw new TidalError('http', `Tidal : HTTP ${response.status}`);
      return response;
    }
  }

  // Pendant la pause, un appel échoue tout de suite, sans rien envoyer.
  async function get(path: string, query: Record<string, string>): Promise<Doc> {
    const guard = async (): Promise<void> => {
      const remaining = await gate.remainingMs(FAMILY);
      if (remaining > 0) throw new TidalError('rate-limited', 'Limite Tidal atteinte', remaining, now() + remaining);
    };
    const response = await queue.run('page', () => sendNow(path, query), guard);
    const parsed = documentSchema.safeParse(await response.json());
    if (!parsed.success) throw new TidalError('http', 'Réponse Tidal inattendue');
    return parsed.data;
  }

  const search = (query: string, include: string) => get('/searchResults', { 'filter[query]': query, include });

  return {
    async searchTracks(query: string, limit = SEARCH_MAX): Promise<TidalTrack[]> {
      const doc = await search(query, 'tracks,tracks.artists');
      const index = indexOf(doc);
      return ranked(rootOf(doc), 'tracks', 'tracks', index)
        .flatMap((resource) => {
          const title = titled(resource);
          return title ? [{ id: resource.id, title, artists: artistNames(resource, index) }] : [];
        })
        .slice(0, limit);
    },

    async searchAlbums(query: string, limit = SEARCH_MAX): Promise<TidalAlbum[]> {
      const doc = await search(query, 'albums,albums.artists');
      const index = indexOf(doc);
      return ranked(rootOf(doc), 'albums', 'albums', index)
        .flatMap((resource) => {
          const title = titled(resource);
          return title ? [{ id: resource.id, title, artists: artistNames(resource, index) }] : [];
        })
        .slice(0, limit);
    },

    async searchArtists(query: string, limit = SEARCH_MAX): Promise<TidalArtist[]> {
      const doc = await search(query, 'artists');
      const index = indexOf(doc);
      return ranked(rootOf(doc), 'artists', 'artists', index)
        .flatMap((resource) => {
          const name = attribute(resource, 'name');
          return name ? [{ id: resource.id, name }] : [];
        })
        .slice(0, limit);
    },

    // Les pistes d'un album dans l'ordre de l'album (la relation `items`), page après page.
    async albumTracks(albumId: string): Promise<Item[]> {
      const items: Item[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const doc = await get(`/albums/${encodeURIComponent(albumId)}/relationships/items`, { include: 'items', ...(cursor ? { 'page[cursor]': cursor } : {}) });
        const index = indexOf(doc);
        for (const link of Array.isArray(doc.data) ? doc.data : []) {
          const resource = link.type === 'tracks' ? index.get(keyOf('tracks', link.id)) : undefined;
          const title = resource ? titled(resource) : null;
          if (title) items.push({ id: link.id, title });
        }
        cursor = doc.links?.meta?.nextCursor;
        if (!cursor) break;
      }
      return items;
    },

    // Les titres les plus en vue d'un artiste (Tidal les classe par pertinence).
    async artistTracks(artistId: string, limit = SEARCH_MAX): Promise<Item[]> {
      const doc = await get(`/artists/${encodeURIComponent(artistId)}/relationships/tracks`, { collapseBy: 'FINGERPRINT', include: 'tracks' });
      const index = indexOf(doc);
      return (Array.isArray(doc.data) ? doc.data : [])
        .flatMap((link) => {
          const resource = index.get(keyOf('tracks', link.id));
          const title = resource ? titled(resource) : null;
          return title ? [{ id: link.id, title }] : [];
        })
        .slice(0, limit);
    },
  };
}

export type TidalApi = ReturnType<typeof createTidalApi>;
