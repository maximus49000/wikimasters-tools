import type { KeyValueStore } from './store';

export class CacheBackoffError extends Error {
  constructor() {
    super('Nouvelle tentative trop tôt après un échec précédent');
    this.name = 'CacheBackoffError';
  }
}

export type TtlCacheOptions = {
  ttlMs?: number;
  retryAfterFailureMs?: number;
  now?: () => number;
};

type Entry<T> = { value?: T; storedAt?: number; failedAt?: number };

export function createTtlCache(store: KeyValueStore, options: TtlCacheOptions = {}) {
  const {
    ttlMs = 12 * 3_600_000,
    retryAfterFailureMs = 5 * 60_000,
    now = () => Date.now(),
  } = options;
  const inflight = new Map<string, Promise<unknown>>();

  async function load<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const entry = (await store.get<Entry<T>>(key)) ?? {};
    const t = now();

    if (entry.value !== undefined && entry.storedAt !== undefined && t - entry.storedAt < ttlMs) {
      return entry.value;
    }
    if (entry.failedAt !== undefined && t - entry.failedAt < retryAfterFailureMs) {
      if (entry.value !== undefined) return entry.value;
      throw new CacheBackoffError();
    }

    try {
      const value = await loader();
      await store.set<Entry<T>>(key, { value, storedAt: t });
      return value;
    } catch (error) {
      await store.set<Entry<T>>(key, { ...entry, failedAt: t });
      if (entry.value !== undefined) return entry.value;
      throw error;
    }
  }

  return {
    getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
      const existing = inflight.get(key);
      if (existing) return existing as Promise<T>;
      const promise = load(key, loader).finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    },
  };
}

export type TtlCache = ReturnType<typeof createTtlCache>;
