import type { KeyValueStore } from '../cache/store';
import { findBySlug, mergeObservation, type CardMarket, type MarketState } from './market-book';
import type { MarketAuction } from './schemas';

const KEY = 'market';

export function createMarketRepo(store: KeyValueStore, now: () => number = () => Date.now()) {
  // Lecture-fusion-écriture sérialisées : deux pages reçues en même temps ne s'écrasent pas.
  let tail: Promise<unknown> = Promise.resolve();

  return {
    observe(auctions: MarketAuction[]): Promise<void> {
      const run = tail.then(async () => {
        const state = (await store.get<MarketState>(KEY)) ?? {};
        await store.set(KEY, mergeObservation(state, auctions, now()));
      });
      tail = run.catch(() => undefined);
      return run;
    },

    async lookup(slug: string): Promise<CardMarket[]> {
      await tail;
      return findBySlug((await store.get<MarketState>(KEY)) ?? {}, slug, now());
    },
  };
}

export type MarketRepo = ReturnType<typeof createMarketRepo>;
