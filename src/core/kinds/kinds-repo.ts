import { BATCH_SIZE } from '../birth/wikidata-birth';
import type { KeyValueStore } from '../cache/store';
import { EMPTY_KINDS, needsKindsLookup, setKinds, type KindsState } from './kinds-book';
import type { KindsFetch } from './wikidata-kinds';

const KEY = 'kinds-v1';
// Après un échec (429, hors ligne), on laisse Wikidata respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

export type KindsFetcher = (slugs: string[]) => Promise<KindsFetch>;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createKindsRepo(
  store: KeyValueStore,
  fetchKinds: KindsFetcher,
  sleep: (ms: number) => Promise<void> = realSleep,
  gapMs = 150,
  now: () => number = () => Date.now(),
) {
  // Écritures sérialisées ; recherches regroupées en un seul parcours à la fois.
  let writeTail: Promise<unknown> = Promise.resolve();
  const pending = new Set<string>();
  let current: Promise<void> | null = null;
  let failedAt: number | undefined;
  const listeners = new Set<() => void>();

  async function read(): Promise<KindsState> {
    return (await store.get<KindsState>(KEY)) ?? EMPTY_KINDS;
  }

  function update(change: (state: KindsState) => KindsState): Promise<void> {
    const run = writeTail.then(async () => {
      await store.set(KEY, change(await read()));
      for (const listener of listeners) listener();
    });
    writeTail = run.catch(() => undefined);
    return run;
  }

  async function load(): Promise<KindsState> {
    await writeTail;
    return read();
  }

  async function lookupAll(): Promise<void> {
    try {
      let first = true;
      for (;;) {
        const state = await load();
        const batch = [...pending].filter((candidate) => needsKindsLookup(state, candidate)).slice(0, BATCH_SIZE);
        if (batch.length === 0) {
          pending.clear();
          return;
        }
        for (const slug of batch) pending.delete(slug);
        if (!first) await sleep(gapMs);
        first = false;
        try {
          const { kinds, labels } = await fetchKinds(batch);
          await update((latest) => setKinds(latest, kinds, labels));
        } catch (error) {
          console.warn('[wikimasters-tools]', 'natures Wikidata indisponibles :', error);
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
    resolveMissing(slugs: string[]): Promise<void> {
      if (failedAt !== undefined && now() - failedAt < COOLDOWN_MS) return current ?? Promise.resolve();
      for (const slug of slugs) pending.add(slug);
      current ??= lookupAll();
      return current;
    },
  };
}

export type KindsRepo = ReturnType<typeof createKindsRepo>;
