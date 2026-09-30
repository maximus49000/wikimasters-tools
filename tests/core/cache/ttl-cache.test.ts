import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { CacheBackoffError, createTtlCache } from '../../../src/core/cache/ttl-cache';

function setup() {
  let t = 0;
  const cache = createTtlCache(createMemoryStore(), {
    ttlMs: 1000,
    retryAfterFailureMs: 500,
    now: () => t,
  });
  return { cache, at: (value: number) => { t = value; } };
}

describe('createTtlCache', () => {
  it("sert le cache tant que la durée de vie n'est pas dépassée", async () => {
    const { cache, at } = setup();
    let calls = 0;
    const loader = async () => `v${++calls}`;
    expect(await cache.getOrLoad('k', loader)).toBe('v1');
    at(999);
    expect(await cache.getOrLoad('k', loader)).toBe('v1');
    expect(calls).toBe(1);
  });

  it('recharge après expiration', async () => {
    const { cache, at } = setup();
    let calls = 0;
    const loader = async () => `v${++calls}`;
    await cache.getOrLoad('k', loader);
    at(1000);
    expect(await cache.getOrLoad('k', loader)).toBe('v2');
  });

  it("sert la valeur périmée en cas d'échec et ne réessaie pas avant le délai", async () => {
    const { cache, at } = setup();
    let calls = 0;
    await cache.getOrLoad('k', async () => { calls++; return 'v1'; });
    const failing = async () => { calls++; throw new Error('réseau'); };
    at(1500);
    expect(await cache.getOrLoad('k', failing)).toBe('v1');
    expect(calls).toBe(2);
    at(1700);
    expect(await cache.getOrLoad('k', failing)).toBe('v1');
    expect(calls).toBe(2);
    at(2100);
    expect(await cache.getOrLoad('k', async () => { calls++; return 'v2'; })).toBe('v2');
    expect(calls).toBe(3);
  });

  it("propage l'erreur sans valeur en cache, puis bloque le délai de reprise", async () => {
    const { cache, at } = setup();
    let calls = 0;
    const failing = async () => { calls++; throw new Error('réseau'); };
    await expect(cache.getOrLoad('k', failing)).rejects.toThrow('réseau');
    at(100);
    await expect(cache.getOrLoad('k', failing)).rejects.toBeInstanceOf(CacheBackoffError);
    expect(calls).toBe(1);
    at(600);
    await expect(cache.getOrLoad('k', failing)).rejects.toThrow('réseau');
    expect(calls).toBe(2);
  });

  it("ne lance qu'un chargement pour des appels simultanés", async () => {
    const { cache } = setup();
    let calls = 0;
    const loader = async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'v';
    };
    const [a, b] = await Promise.all([cache.getOrLoad('k', loader), cache.getOrLoad('k', loader)]);
    expect([a, b]).toEqual(['v', 'v']);
    expect(calls).toBe(1);
  });
});
