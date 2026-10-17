import { useSyncExternalStore } from 'react';
import { TGDB_IMAGES } from '../core/game/config';

// Pochettes gardées sur l'appareil (Cache Storage) : jaquettes, dos, captures et logos des jeux, affiches. Une image n'est
// téléchargée qu'une fois ; aux lancements suivants elle est lue sur l'appareil (affichage immédiat, même hors ligne).
// Plafond de taille : au-delà, les pochettes les moins récemment vues sont effacées. Seules les images lisibles par la page
// (en-têtes CORS) peuvent être gardées : relais TheGamesDB, Steam, IGDB, Wikimédia, Spotify, TMDB, Open Library ; les autres (Tidal…)
// gardent leur adresse d'origine.
const CACHE_NAME = 'wmt-pochettes-v1';
const INDEX_KEY = 'https://wikimasters-tools.local/pochettes-index';
const MAX_BYTES = 50 * 1024 * 1024;
const CONCURRENCY = 4;
const STORABLE = [
  /^https:\/\/wikimasters-tools\.[a-z0-9-]+\.workers\.dev\/tgdb-img\//,
  /^https:\/\/shared\.akamai\.steamstatic\.com\//,
  /^https:\/\/images\.igdb\.com\//,
  /^https:\/\/upload\.wikimedia\.org\//,
  /^https:\/\/i\.scdn\.co\//,
  /^https:\/\/image\.tmdb\.org\//,
  /^https:\/\/covers\.openlibrary\.org\//,
];
// Ancien CDN de TheGamesDB (sans CORS) : la même image par le relais.
const LEGACY_TGDB = 'https://cdn.thegamesdb.net/images/';

type Index = Record<string, { bytes: number; at: number }>;
type CacheLike = Pick<Cache, 'match' | 'put' | 'delete'>;

export type CoverCacheDeps = {
  caches: Pick<CacheStorage, 'open'> | undefined;
  fetch: typeof fetch;
  createUrl?: (blob: Blob) => string;
  maxBytes?: number;
  now?: () => number;
};

export function createCoverCache(deps: CoverCacheDeps) {
  const createUrl = deps.createUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const maxBytes = deps.maxBytes ?? MAX_BYTES;
  const now = deps.now ?? (() => Date.now());
  const urls = new Map<string, string>();
  const failures = new Set<string>();
  const loading = new Map<string, Promise<string | null>>();
  const queue: string[] = [];
  let active = 0;
  const listeners = new Set<() => void>();
  let version = 0;
  const notify = (): void => {
    version += 1;
    listeners.forEach((listener) => listener());
  };

  let opened: Promise<CacheLike | null> | null = null;
  const open = (): Promise<CacheLike | null> =>
    (opened ??= deps.caches ? deps.caches.open(CACHE_NAME).catch((): null => null) : Promise.resolve(null));

  // Index (taille et dernière vue de chaque image), rangé dans le même cache : il disparaît avec lui.
  let index: Promise<Index> | null = null;
  const readIndex = (cache: CacheLike): Promise<Index> =>
    (index ??= cache.match(INDEX_KEY).then((r) => (r ? (r.json() as Promise<Index>) : {})).catch((): Index => ({})));
  let writeTail: Promise<unknown> = Promise.resolve();
  const writeIndex = (cache: CacheLike, value: Index): void => {
    writeTail = writeTail.then(() => cache.put(INDEX_KEY, new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }))).catch(() => undefined);
  };

  const canonical = (url: string): string => (url.startsWith(LEGACY_TGDB) ? `${TGDB_IMAGES}/${url.slice(LEGACY_TGDB.length)}` : url);
  const storable = (url: string): boolean => STORABLE.some((re) => re.test(url));

  async function load(key: string): Promise<string | null> {
    const cache = await open();
    if (!cache) return null;
    const idx = await readIndex(cache);
    try {
      const hit = await cache.match(key);
      if (hit) {
        const url = createUrl(await hit.blob());
        if (idx[key]) idx[key].at = now();
        return url;
      }
      const response = await deps.fetch(key, { mode: 'cors', referrerPolicy: 'no-referrer' });
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || !type.startsWith('image/')) {
        failures.add(key);
        return null;
      }
      const blob = await response.blob();
      await cache.put(key, new Response(blob, { headers: { 'content-type': type } }));
      idx[key] = { bytes: blob.size, at: now() };
      // Plafond : les moins récemment vues d'abord (jamais celle qu'on vient de garder).
      let total = Object.values(idx).reduce((sum, e) => sum + e.bytes, 0);
      for (const [old] of Object.entries(idx).sort((a, b) => a[1].at - b[1].at)) {
        if (total <= maxBytes) break;
        if (old === key) continue;
        total -= idx[old]!.bytes;
        delete idx[old];
        await cache.delete(old);
      }
      writeIndex(cache, idx);
      return createUrl(blob);
    } catch {
      failures.add(key);
      return null;
    }
  }

  function start(key: string): Promise<string | null> {
    const existing = loading.get(key);
    if (existing) return existing;
    const promise = load(key).then((url) => {
      if (url) urls.set(key, url);
      notify();
      return url;
    });
    loading.set(key, promise);
    return promise;
  }

  function pump(): void {
    while (active < CONCURRENCY && queue.length > 0) {
      const key = queue.shift()!;
      active += 1;
      void start(key).finally(() => {
        active -= 1;
        pump();
      });
    }
  }

  return {
    // Vrai si cette image peut être gardée sur l'appareil.
    handles: (url: string): boolean => !!deps.caches && storable(canonical(url)),
    // Adresse locale (blob:) si l'image est déjà chargée pendant cette session.
    local: (url: string): string | undefined => urls.get(canonical(url)),
    // L'image n'a pas pu être téléchargée (introuvable, réseau).
    failed: (url: string): boolean => failures.has(canonical(url)),
    // Chargement en fond (lecture sur l'appareil, sinon téléchargement), quatre à la fois.
    want(url: string): void {
      const key = canonical(url);
      if (!deps.caches || !storable(key) || urls.has(key) || failures.has(key) || loading.has(key) || queue.includes(key)) return;
      queue.push(key);
      pump();
    },
    // Adresse locale de l'image, chargée si besoin (null : impossible à garder).
    async blobUrl(url: string): Promise<string | null> {
      const key = canonical(url);
      if (!deps.caches || !storable(key)) return null;
      return urls.get(key) ?? (await start(key));
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    version: (): number => version,
  };
}

export type CoverCache = ReturnType<typeof createCoverCache>;

let current: CoverCache | null = null;
export const setCoverCache = (cache: CoverCache | null): void => {
  current = cache;
};
export const getCoverCache = (): CoverCache | null => current;

// Adresse à dessiner : la copie locale si elle est prête, sinon l'adresse d'origine (et la copie est demandée en fond).
export function localImage(url: string | undefined): string | undefined {
  if (!url || !current) return url;
  const local = current.local(url);
  if (local) return local;
  current.want(url);
  return url;
}

// Redessine le composant quand une pochette arrive sur l'appareil.
export function useCoverCache(): number {
  return useSyncExternalStore(
    (listener) => current?.subscribe(listener) ?? (() => undefined),
    () => current?.version() ?? 0,
  );
}
