import type { GameApi } from './api/game-api';
import type { TtlCache } from './cache/ttl-cache';
import { extractObservations, type PriceObservation } from './pricing/observations';
import { buildPriceBook, type PriceBook } from './pricing/price-book';

// Incrémenter la version invalide le cache si le format des observations change.
const OBSERVATIONS_KEY = 'mine-observations:v1';

export type DataSourceDeps = {
  api: Pick<GameApi, 'getMine'>;
  cache: TtlCache;
  now?: () => Date;
};

export interface DataSource {
  getMyPriceBook(): Promise<PriceBook>;
}

export function createDataSource(deps: DataSourceDeps): DataSource {
  const { api, cache, now = () => new Date() } = deps;
  return {
    async getMyPriceBook() {
      const observations = await cache.getOrLoad<PriceObservation[]>(OBSERVATIONS_KEY, async () =>
        extractObservations(await api.getMine()),
      );
      return buildPriceBook(observations, { now: now() });
    },
  };
}
