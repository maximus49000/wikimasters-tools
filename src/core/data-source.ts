import type { GameApi } from './api/game-api';
import { parseMineResponse } from './api/schemas';
import type { KeyValueStore } from './cache/store';
import type { TtlCache } from './cache/ttl-cache';
import { extractObservations, type PriceObservation } from './pricing/observations';
import { buildPriceBook, type PriceBook } from './pricing/price-book';

// Incrémenter la version invalide le cache si le format des observations change.
const OBSERVATIONS_KEY = 'mine-observations:v1';
// Registre durable : le jeu ne renvoie que les derniers achats et ventes, on garde les plus anciens ici.
const LEDGER_KEY = 'mine-ledger:v1';

export type DataSourceDeps = {
  api: Pick<GameApi, 'getMine'>;
  cache: TtlCache;
  store: KeyValueStore;
  now?: () => Date;
};

export interface DataSource {
  getMyPriceBook(): Promise<PriceBook>;
  // Relecture récente de « mes enchères » : ses achats et ventes entrent au carnet sans attendre la fin du cache.
  ingestMine(json: unknown): Promise<PriceBook>;
}

export function createDataSource(deps: DataSourceDeps): DataSource {
  const { api, cache, store, now = () => new Date() } = deps;
  // Lecture-fusion-écriture sérialisées : deux appels simultanés ne s'écrasent pas.
  let tail: Promise<unknown> = Promise.resolve();

  async function remember(fresh: PriceObservation[]): Promise<PriceObservation[]> {
    const known = (await store.get<PriceObservation[]>(LEDGER_KEY)) ?? [];
    const ids = new Set(known.map((o) => o.auctionId));
    const added = fresh.filter((o) => !ids.has(o.auctionId));
    if (added.length === 0) return known;
    const merged = [...known, ...added];
    await store.set(LEDGER_KEY, merged);
    return merged;
  }

  const bookOf = async (fresh: PriceObservation[]): Promise<PriceBook> => {
    const run = tail.then(() => remember(fresh));
    tail = run.catch(() => undefined);
    return buildPriceBook(await run, { now: now() });
  };

  return {
    async ingestMine(json) {
      return bookOf(extractObservations(parseMineResponse(json)));
    },
    async getMyPriceBook() {
      const fresh = await cache.getOrLoad<PriceObservation[]>(OBSERVATIONS_KEY, async () =>
        extractObservations(await api.getMine()),
      );
      return bookOf(fresh);
    },
  };
}
