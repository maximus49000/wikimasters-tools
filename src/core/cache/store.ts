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

// Hors extension (application Android) : `localStorage` de la page, avec le même préfixe.
export function createLocalStorageStore(storage: Storage = window.localStorage): KeyValueStore {
  return {
    async get<T>(key: string) {
      const raw = storage.getItem(PREFIX + key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    },
    async set<T>(key: string, value: T) {
      storage.setItem(PREFIX + key, JSON.stringify(value));
    },
  };
}

const DB_NAME = 'wikimasters-tools';
const DB_STORE = 'kv';

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
const finished = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction IndexedDB annulée'));
  });

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = factory.open(DB_NAME, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(DB_STORE);
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
    opening.onblocked = () => reject(new Error('IndexedDB bloquée'));
  });
}

// Application Android : IndexedDB (des centaines de Mo, écriture asynchrone) au lieu des ~5 Mo de `localStorage`.
// Migration clé par clé : une clé absente d'IndexedDB est reprise de `localStorage` au premier accès, puis supprimée de `localStorage`
// une fois écrite. Seules les clés lues par le stockage sont touchées : les réglages que l'appli lit directement dans `localStorage` restent là.
// Sans IndexedDB (ou si elle refuse de s'ouvrir), on retombe sur `localStorage`.
export function createIndexedDbStore(
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
  legacy: Storage = window.localStorage,
): KeyValueStore {
  const fallback = createLocalStorageStore(legacy);
  let opened: Promise<IDBDatabase | null> | undefined;
  const database = () =>
    (opened ??= factory
      ? openDatabase(factory).catch((error: unknown) => {
          console.warn('[wikimasters-tools]', 'IndexedDB indisponible, retour à localStorage :', error);
          return null;
        })
      : Promise.resolve(null));

  return {
    async get<T>(key: string) {
      const db = await database();
      if (!db) return fallback.get<T>(key);
      const found = await request(db.transaction(DB_STORE).objectStore(DB_STORE).get(key));
      if (found !== undefined) return found as T;

      const raw = legacy.getItem(PREFIX + key);
      if (raw === null) return undefined;
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        return undefined;
      }
      // Une seule transaction : une écriture arrivée entre-temps (`set`) n'est pas écrasée par la valeur ancienne.
      const tx = db.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      const current = await request(store.get(key));
      if (current === undefined) store.put(value, key);
      await finished(tx);
      legacy.removeItem(PREFIX + key);
      return (current === undefined ? value : current) as T;
    },
    async set<T>(key: string, value: T) {
      const db = await database();
      if (!db) return fallback.set(key, value);
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      await finished(tx);
      // L'ancienne copie ne doit plus jamais être reprise.
      legacy.removeItem(PREFIX + key);
    },
  };
}
