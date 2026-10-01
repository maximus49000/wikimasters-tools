import type { KeyValueStore } from '../cache/store';
import { mergeCards, type CollectionState, type KnownCard } from './collection-book';

const KEY = 'collection';

export function createCollectionRepo(store: KeyValueStore) {
  // Lecture-fusion-écriture sérialisées : deux observations simultanées ne s'écrasent pas.
  let tail: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();
  // Dernier état lu ou écrit : une vue qui se remonte repart de là, sans attendre le stockage.
  let latest: KnownCard[] | null = null;

  return {
    observe(cards: KnownCard[], addCopies = false): Promise<void> {
      const run = tail.then(async () => {
        const state = (await store.get<CollectionState>(KEY)) ?? {};
        const next = mergeCards(state, cards, addCopies);
        if (next === state) return;
        await store.set(KEY, next);
        latest = Object.values(next);
        for (const listener of listeners) listener();
      });
      tail = run.catch(() => undefined);
      return run;
    },

    // Début d'un parcours complet : les exemplaires sont recomptés depuis zéro.
    resetCopies(): Promise<void> {
      const run = tail.then(async () => {
        const state = (await store.get<CollectionState>(KEY)) ?? {};
        if (!Object.values(state).some((card) => card.copies !== undefined)) return;
        const next: CollectionState = {};
        for (const [slug, { copies: _copies, ...card }] of Object.entries(state)) next[slug] = card;
        await store.set(KEY, next);
        latest = Object.values(next);
        for (const listener of listeners) listener();
      });
      tail = run.catch(() => undefined);
      return run;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    snapshot: (): KnownCard[] | null => latest,

    async list(): Promise<KnownCard[]> {
      await tail;
      latest = Object.values((await store.get<CollectionState>(KEY)) ?? {});
      return latest;
    },
  };
}

export type CollectionRepo = ReturnType<typeof createCollectionRepo>;
