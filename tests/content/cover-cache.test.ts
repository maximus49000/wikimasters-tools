import { describe, expect, it, vi } from 'vitest';
import { createCoverCache } from '../../src/content/cover-cache';

// Cache Storage factice (Map) : put/match/delete sur des Response, comme le navigateur.
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    return {
      match: async (key: string) => store.get(key)?.clone(),
      put: async (key: string, response: Response) => void store.set(key, response),
      delete: async (key: string) => store.delete(key),
    };
  };
  return { caches: { open } as unknown as CacheStorage, stores };
}

const RELAY = 'https://wikimasters-tools.maxime-protais-baumer.workers.dev/tgdb-img';
const image = (bytes: number) => new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'image/jpeg' } });

function setup(over: { maxBytes?: number; caches?: CacheStorage; fail?: boolean } = {}) {
  const fake = fakeCaches();
  const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => (over.fail ? new Response('', { status: 404 }) : image(100)));
  let n = 0;
  const make = (caches: CacheStorage | undefined = over.caches ?? fake.caches) =>
    createCoverCache({ caches, fetch: fetchFn as unknown as typeof fetch, createUrl: () => `blob:local-${(n += 1)}`, maxBytes: over.maxBytes ?? 1000, now: () => n });
  return { fake, fetchFn, make };
}

describe('createCoverCache', () => {
  it('télécharge une pochette une seule fois, la garde sur l’appareil et la sert en local', async () => {
    const { fetchFn, make } = setup();
    const cache = make();
    const url = `${RELAY}/medium/boxart/front/1-1.jpg`;
    expect(cache.local(url)).toBeUndefined();
    expect(await cache.blobUrl(url)).toBe('blob:local-1');
    expect(cache.local(url)).toBe('blob:local-1');
    expect(await cache.blobUrl(url)).toBe('blob:local-1');
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({ mode: 'cors', referrerPolicy: 'no-referrer' });
    // Nouveau lancement : lue sur l'appareil, aucun téléchargement.
    const next = make();
    expect(await next.blobUrl(url)).toMatch(/^blob:local-/);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('want : chargement en fond, puis prévient les abonnés', async () => {
    const { make } = setup();
    const cache = make();
    const listener = vi.fn();
    cache.subscribe(listener);
    const url = 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg';
    cache.want(url);
    cache.want(url);
    await vi.waitFor(() => expect(cache.local(url)).toBeDefined());
    expect(listener).toHaveBeenCalled();
  });

  it('ancienne adresse du CDN TheGamesDB (sans CORS) : prise par le relais', async () => {
    const { fetchFn, make } = setup();
    const cache = make();
    expect(await cache.blobUrl('https://cdn.thegamesdb.net/images/medium/boxart/front/3279-1.jpg')).toBeTruthy();
    expect(fetchFn.mock.calls[0]?.[0]).toBe(`${RELAY}/medium/boxart/front/3279-1.jpg`);
  });

  it('hôte illisible (sans CORS) ou Cache Storage absent : rien de gardé, l’adresse d’origine reste', async () => {
    const { fetchFn, make } = setup();
    expect(await make().blobUrl('https://exemple.test/a.jpg')).toBeNull();
    expect(make().handles('https://exemple.test/a.jpg')).toBe(false);
    const none = createCoverCache({ caches: undefined, fetch: fetchFn as unknown as typeof fetch });
    expect(none.handles(`${RELAY}/medium/boxart/front/1-1.jpg`)).toBe(false);
    expect(await none.blobUrl(`${RELAY}/medium/boxart/front/1-1.jpg`)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('image introuvable : signalée en échec, rien de gardé', async () => {
    const { fake, make } = setup({ fail: true });
    const cache = make();
    const url = `${RELAY}/medium/boxart/front/9.jpg`;
    expect(await cache.blobUrl(url)).toBeNull();
    expect(cache.failed(url)).toBe(true);
    expect([...(fake.stores.values().next().value?.keys() ?? [])].filter((k) => k === url)).toEqual([]);
  });

  it('au-delà du plafond, les pochettes les plus anciennes sont effacées', async () => {
    const { fake, make } = setup({ maxBytes: 250 });
    const cache = make();
    const urls = [1, 2, 3].map((i) => `${RELAY}/medium/boxart/front/${i}.jpg`);
    for (const url of urls) await cache.blobUrl(url);
    const kept = [...(fake.stores.values().next().value!.keys())].filter((k) => k.startsWith(RELAY));
    expect(kept).toEqual([urls[1], urls[2]]);
  });
});
