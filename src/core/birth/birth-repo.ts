import type { KeyValueStore } from '../cache/store';
import { BATCH_SIZE, type CardDates } from './wikidata-birth';
import { EMPTY_BIRTH, needsBirthLookup, setBirths, type BirthState } from './birth-book';

// Nouvelle clé : l'ancien format (années de naissance seules) n'est plus relu.
const KEY = 'dates';
// Après un échec (429, hors ligne), on laisse Wikidata respirer avant de réessayer.
const COOLDOWN_MS = 60_000;

export type BirthFetcher = (slugs: string[]) => Promise<Record<string, CardDates>>;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createBirthRepo(
  store: KeyValueStore,
  fetchBirth: BirthFetcher,
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

  async function read(): Promise<BirthState> {
    return (await store.get<BirthState>(KEY)) ?? EMPTY_BIRTH;
  }

  function update(change: (state: BirthState) => BirthState): Promise<void> {
    const run = writeTail.then(async () => {
      await store.set(KEY, change(await read()));
      for (const listener of listeners) listener();
    });
    writeTail = run.catch(() => undefined);
    return run;
  }

  async function load(): Promise<BirthState> {
    await writeTail;
    return read();
  }

  async function lookupAll(): Promise<void> {
    try {
      let first = true;
      for (;;) {
        const state = await load();
        const batch = [...pending].filter((candidate) => needsBirthLookup(state, candidate)).slice(0, BATCH_SIZE);
        if (batch.length === 0) {
          pending.clear();
          return;
        }
        for (const slug of batch) pending.delete(slug);
        if (!first) await sleep(gapMs);
        first = false;
        try {
          const dates = await fetchBirth(batch);
          await update((latest) => setBirths(latest, dates));
        } catch (error) {
          console.warn('[wikimasters-tools]', 'dates Wikidata indisponibles :', error);
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

export type BirthRepo = ReturnType<typeof createBirthRepo>;
