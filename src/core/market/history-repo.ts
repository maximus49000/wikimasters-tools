import type { KeyValueStore } from '../cache/store';
import {
  cardsForSlug,
  emptyHistory,
  recordSnapshot,
  type CardHistory,
  type HistoryState,
} from './price-history';
import type { MarketAuction } from './schemas';

const KEY = 'market-history';

export function createHistoryRepo(store: KeyValueStore, now: () => number = () => Date.now()) {
  // Lecture-fusion-écriture sérialisées, comme le dépôt du marché.
  let tail: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  const load = async (): Promise<HistoryState> => (await store.get<HistoryState>(KEY)) ?? emptyHistory();

  function update(change: (state: HistoryState) => HistoryState): Promise<void> {
    const run = tail.then(async () => {
      await store.set(KEY, change(await load()));
      for (const listener of listeners) listener();
    });
    tail = run.catch(() => undefined);
    return run;
  }

  return {
    record: (auctions: MarketAuction[]): Promise<void> =>
      update((state) => ({ ...recordSnapshot(state, auctions, now()), lastPollAt: now() })),

    // Une tentative ratée compte aussi : on ne relance pas le site en boucle.
    markAttempt: (): Promise<void> => update((state) => ({ ...state, lastPollAt: now() })),

    async lastPollAt(): Promise<number> {
      await tail;
      return (await load()).lastPollAt;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    async all(): Promise<HistoryState> {
      await tail;
      return load();
    },

    async lookup(slug: string): Promise<CardHistory[]> {
      return cardsForSlug(await this.all(), slug);
    },
  };
}

export type HistoryRepo = ReturnType<typeof createHistoryRepo>;
