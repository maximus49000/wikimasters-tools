import type { KeyValueStore } from '../cache/store';
import { mergeCards, type CollectionState, type KnownCard } from './collection-book';

const KEY = 'collection';

export function createCollectionRepo(store: KeyValueStore) {
  // Lecture-fusion-écriture sérialisées : deux observations simultanées ne s'écrasent pas.
  let tail: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  return {
    observe(cards: KnownCard[]): Promise<void> {
      const run = tail.then(async () => {
        const state = (await store.get<CollectionState>(KEY)) ?? {};
        const next = mergeCards(state, cards);
        if (next === state) return;
        await store.set(KEY, next);
        for (const listener of listeners) listener();
      });
      tail = run.catch(() => undefined);
      return run;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    async list(): Promise<KnownCard[]> {
      await tail;
      return Object.values((await store.get<CollectionState>(KEY)) ?? {});
    },
  };
}

export type CollectionRepo = ReturnType<typeof createCollectionRepo>;
