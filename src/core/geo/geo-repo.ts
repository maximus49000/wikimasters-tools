import type { KeyValueStore } from '../cache/store';
import {
  clearManual,
  EMPTY_GEO,
  needsLookup,
  setManual,
  setWiki,
  type GeoState,
} from './geo-book';
import type { LatLon } from './wiki-coords';

const KEY = 'geo';
// Après un échec (429, hors ligne), on laisse Wikipédia respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

export type CoordsFetcher = (slug: string) => Promise<LatLon | null>;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createGeoRepo(
  store: KeyValueStore,
  fetchCoords: CoordsFetcher,
  sleep: (ms: number) => Promise<void> = realSleep,
  gapMs = 150,
  now: () => number = () => Date.now(),
) {
  // Écritures sérialisées ; recherches Wikipédia regroupées en un seul parcours à la fois.
  let writeTail: Promise<unknown> = Promise.resolve();
  const pending = new Set<string>();
  let current: Promise<void> | null = null;
  let failedAt: number | undefined;
  const listeners = new Set<() => void>();

  async function read(): Promise<GeoState> {
    return (await store.get<GeoState>(KEY)) ?? EMPTY_GEO;
  }

  function update(change: (state: GeoState) => GeoState): Promise<void> {
    const run = writeTail.then(async () => {
      await store.set(KEY, change(await read()));
      for (const listener of listeners) listener();
    });
    writeTail = run.catch(() => undefined);
    return run;
  }

  async function load(): Promise<GeoState> {
    await writeTail;
    return read();
  }

  // Vide `pending` une requête à la fois ; les articles ajoutés en cours de route sont repris ici.
  async function lookupAll(): Promise<void> {
    try {
      let first = true;
      for (;;) {
        const state = await load();
        const slug = [...pending].find((candidate) => needsLookup(state, candidate));
        if (slug === undefined) {
          pending.clear();
          return;
        }
        pending.delete(slug);
        if (!first) await sleep(gapMs);
        first = false;
        try {
          const coords = await fetchCoords(slug);
          await update((latest) => setWiki(latest, slug, coords));
        } catch (error) {
          // Hors ligne, 429… : on s'arrête, le reste sera réessayé après le délai de repos.
          console.warn('[wikimasters-tools]', 'coordonnées Wikipédia indisponibles :', error);
          failedAt = now();
          pending.clear();
          return;
        }
      }
    } finally {
      current = null;
    }
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load,
    setManual: (slug: string, pos: LatLon) => update((state) => setManual(state, slug, pos)),
    clearManual: (slug: string) => update((state) => clearManual(state, slug)),
    resolveMissing(slugs: string[]): Promise<void> {
      if (failedAt !== undefined && now() - failedAt < COOLDOWN_MS) return current ?? Promise.resolve();
      for (const slug of slugs) pending.add(slug);
      current ??= lookupAll();
      return current;
    },
  };
}

export type GeoRepo = ReturnType<typeof createGeoRepo>;
