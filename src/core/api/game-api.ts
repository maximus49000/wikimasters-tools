import { ApiFormatError, ApiHttpError, NotAuthenticatedError } from './errors';
import { MINE_ENDPOINT, parseMineResponse, type MineResponse } from './schemas';
import { collectionEndpoint, parseCollectionPage, type CollectionPage } from './collection-schemas';

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
      if (response.status === 429) {
        if (attempt >= maxRetries) throw new ApiHttpError(429, path);
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
    getCollectionPage: (page: number, filter?: string): Promise<CollectionPage> =>
      enqueue(async () => {
        const path = collectionEndpoint(page, filter);
        return parseCollectionPage(await requestJson(path), path);
      }),
  };
}

export type GameApi = ReturnType<typeof createGameApi>;
