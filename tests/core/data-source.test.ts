import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/mine-response.json';
import { parseMineResponse } from '../../src/core/api/schemas';
import { createMemoryStore } from '../../src/core/cache/store';
import { createTtlCache } from '../../src/core/cache/ttl-cache';
import { createDataSource } from '../../src/core/data-source';

const NOW = new Date('2026-09-30T12:00:00Z');

function setup(response: () => unknown = () => fixture, ttlMs?: number) {
  let calls = 0;
  let time = NOW.getTime();
  const api = {
    getMine: async () => {
      calls++;
      return parseMineResponse(response());
    },
  };
  const store = createMemoryStore();
  const cache = createTtlCache(store, { now: () => time, ...(ttlMs ? { ttlMs } : {}) });
  const dataSource = createDataSource({ api, cache, store, now: () => NOW });
  return { dataSource, calls: () => calls, advance: (ms: number) => (time += ms) };
}

describe('createDataSource.getMyPriceBook', () => {
  it('construit le PriceBook depuis les ventes et achats conclus', async () => {
    const { dataSource } = setup();
    const book = await dataSource.getMyPriceBook();
    expect(book.byTitle('Exemple Un')).toMatchObject({
      cardId: 'c0000000-0000-4000-8000-000000000001',
      stats: { count: 1, median: 11, reliability: 'low' },
    });
    expect(book.byTitle('Exemple Trois')?.stats.median).toBe(20);
    expect(book.byTitle('Exemple Deux')).toBeNull();
  });

  it("n'interroge l'API qu'une fois grâce au cache", async () => {
    const { dataSource, calls } = setup();
    await dataSource.getMyPriceBook();
    await dataSource.getMyPriceBook();
    expect(calls()).toBe(1);
  });

  it("garde un achat qui n'est plus dans la liste « won » du jeu (limitée aux derniers)", async () => {
    let current: unknown = fixture;
    const { dataSource, advance } = setup(() => current, 1000);
    expect((await dataSource.getMyPriceBook()).byTitle('Exemple Trois')?.purchase).toEqual({ min: 20, max: 20 });

    // Le jeu ne renvoie plus l'achat : la liste est vide.
    current = { ...fixture, won: [] };
    advance(2000);
    const book = await dataSource.getMyPriceBook();
    expect(book.byTitle('Exemple Trois')?.purchase).toEqual({ min: 20, max: 20 });
  });

  it("ajoute les nouveaux achats à ceux déjà mémorisés, sans doublon", async () => {
    let current: unknown = fixture;
    const { dataSource, advance } = setup(() => current, 1000);
    await dataSource.getMyPriceBook();

    const other = structuredClone(fixture.won[0]!);
    other.id = 'a0000000-0000-4000-8000-000000000009';
    other.final_price = 30;
    current = { ...fixture, won: [other] };
    advance(2000);
    const book = await dataSource.getMyPriceBook();
    expect(book.byTitle('Exemple Trois')?.purchase).toEqual({ min: 20, max: 30 });
    expect(book.byTitle('Exemple Trois')?.stats.count).toBe(2);
  });
});
