import { ApiFormatError, ApiHttpError, NotAuthenticatedError } from './errors';
import { MINE_ENDPOINT, parseMineResponse, type MineResponse } from './schemas';
import { collectionEndpoint, parseCollectionPage, type CollectionPage } from './collection-schemas';

import { parseMarketAuctions, type MarketAuction } from '../market/schemas';

// Même requête que la recherche de la page Marché du site : première page des résultats pour un titre.
const marketSearchEndpoint = (title: string): string =>
  `/api/marketplace?page=1&limit=50&sort=recent&q=${encodeURIComponent(title)}`;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GameApiOptions = {
  fetch: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  minIntervalMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
};

export function createGameApi(options: GameApiOptions) {
  const {
    fetch: doFetch,
    sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    now = () => Date.now(),
    minIntervalMs = 1000,
    maxRetries = 3,
    baseBackoffMs = 2000,
  } = options;

  let tail: Promise<unknown> = Promise.resolve();
  let lastStart: number | null = null;

  // Toutes les requêtes passent par une file séquentielle.
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  }

  async function requestJson(path: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const wait = lastStart === null ? 0 : Math.max(0, lastStart + minIntervalMs - now());
      if (wait > 0) await sleep(wait);
      lastStart = now();

      const response = await doFetch(path, { headers: { Accept: 'application/json' } });

      if (response.status === 401 || response.status === 403) {
        throw new NotAuthenticatedError(path, response.status);
      }
      // 429 et erreurs serveur (5xx, souvent passagères) : on réessaie avec un délai croissant.
      if (response.status === 429 || response.status >= 500) {
        if (attempt >= maxRetries) throw new ApiHttpError(response.status, path);
        const retryAfter = Number(response.headers.get('Retry-After'));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : baseBackoffMs * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new ApiHttpError(response.status, path);

      try {
        return await response.json();
      } catch {
        throw new ApiFormatError(path, 'réponse non JSON');
      }
    }
  }

  return {
    getMine: (): Promise<MineResponse> =>
      enqueue(async () => parseMineResponse(await requestJson(MINE_ENDPOINT))),
    searchMarket: (title: string): Promise<{ auctions: MarketAuction[] }> =>
      enqueue(async () => {
        const path = marketSearchEndpoint(title);
        const json = await requestJson(path);
        // Une réponse sans tableau n'est pas « aucune enchère » : on ne la confond pas avec un résultat vide.
        if (!Array.isArray((json as { auctions?: unknown } | null)?.auctions)) {
          throw new ApiFormatError(path, 'tableau « auctions » absent');
        }
        return { auctions: parseMarketAuctions(json).auctions };
      }),
    getCollectionPage: (page: number, filter?: string, sort?: string): Promise<CollectionPage> =>
      enqueue(async () => {
        const path = collectionEndpoint(page, filter, sort);
        return parseCollectionPage(await requestJson(path), path);
      }),
  };
}

export type GameApi = ReturnType<typeof createGameApi>;
