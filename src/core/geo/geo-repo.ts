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

export type CoordsFetcher = (slug: string) => Promise<LatLon | null>;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createGeoRepo(
  store: KeyValueStore,
  fetchCoords: CoordsFetcher,
  sleep: (ms: number) => Promise<void> = realSleep,
  gapMs = 150,
) {
  // Écritures sérialisées ; recherches Wikipédia sérialisées elles aussi (une requête à la fois).
  let writeTail: Promise<unknown> = Promise.resolve();
  let lookupTail: Promise<unknown> = Promise.resolve();
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

  async function lookupAll(slugs: string[]): Promise<void> {
    const state = await load();
    const todo = slugs.filter((slug) => needsLookup(state, slug));
    for (const [index, slug] of todo.entries()) {
      if (index > 0) await sleep(gapMs);
      try {
        const coords = await fetchCoords(slug);
        await update((current) => setWiki(current, slug, coords));
      } catch (error) {
        // Hors ligne, 429… : on s'arrête, le reste sera réessayé à la prochaine demande.
        console.warn('[wikimasters-tools]', 'coordonnées Wikipédia indisponibles :', error);
        return;
      }
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
      const run = lookupTail.then(() => lookupAll(slugs));
      lookupTail = run.catch(() => undefined);
      return run;
    },
  };
}

export type GeoRepo = ReturnType<typeof createGeoRepo>;
