export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export function createMemoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    async get<T>(key: string) {
      const raw = data.get(key);
      return raw === undefined ? undefined : (JSON.parse(raw) as T);
    },
    async set<T>(key: string, value: T) {
      data.set(key, JSON.stringify(value));
    },
  };
}

type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

const PREFIX = 'wmt:';

export function createChromeLocalStore(
  area: StorageArea = chrome.storage.local as unknown as StorageArea,
): KeyValueStore {
  return {
    async get<T>(key: string) {
      const stored = await area.get(PREFIX + key);
      return stored[PREFIX + key] as T | undefined;
    },
    async set<T>(key: string, value: T) {
      await area.set({ [PREFIX + key]: value });
    },
  };
}
