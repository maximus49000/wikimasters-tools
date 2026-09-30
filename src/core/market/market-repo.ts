import type { KeyValueStore } from '../cache/store';
import { findBySlug, mergeObservation, type CardMarket, type MarketState } from './market-book';
import type { MarketAuction } from './schemas';

const KEY = 'market';

export function createMarketRepo(store: KeyValueStore, now: () => number = () => Date.now()) {
  // Lecture-fusion-écriture sérialisées : deux pages reçues en même temps ne s'écrasent pas.
  let tail: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  return {
    observe(auctions: MarketAuction[]): Promise<void> {
      const run = tail.then(async () => {
        const state = (await store.get<MarketState>(KEY)) ?? {};
        await store.set(KEY, mergeObservation(state, auctions, now()));
        for (const listener of listeners) listener();
      });
      tail = run.catch(() => undefined);
      return run;
    },

    // Prévient dès qu'une observation est enregistrée (le popup s'actualise sans être rouvert).
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    async lookup(slug: string): Promise<CardMarket[]> {
      await tail;
      return findBySlug((await store.get<MarketState>(KEY)) ?? {}, slug, now());
    },
  };
}

export type MarketRepo = ReturnType<typeof createMarketRepo>;
