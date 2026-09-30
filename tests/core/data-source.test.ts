import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/mine-response.json';
import { parseMineResponse } from '../../src/core/api/schemas';
import { createMemoryStore } from '../../src/core/cache/store';
import { createTtlCache } from '../../src/core/cache/ttl-cache';
import { createDataSource } from '../../src/core/data-source';

const NOW = new Date('2026-09-30T12:00:00Z');

function setup() {
  let calls = 0;
  const api = {
    getMine: async () => {
      calls++;
      return parseMineResponse(fixture);
    },
  };
  const cache = createTtlCache(createMemoryStore(), { now: () => NOW.getTime() });
  const dataSource = createDataSource({ api, cache, now: () => NOW });
  return { dataSource, calls: () => calls };
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
});
