// tests/core/book/book-repo.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createBookRepo } from '../../../src/core/book/book-repo';
import { createMemoryStore } from '../../../src/core/cache/store';

describe('createBookRepo', () => {
  it('n’interroge Wikidata que pour les articles jamais vus, et mémorise un article vide', async () => {
    const fetchBook = vi.fn(async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, slug === 'A' ? { workId: 'OL1W' } : {}])));
    const repo = createBookRepo(createMemoryStore(), fetchBook);
    expect(await repo.resolve(['A', 'B'])).toEqual({ A: { workId: 'OL1W' }, B: {} });
    await repo.resolve(['A', 'B']);
    expect(fetchBook).toHaveBeenCalledTimes(1);
    expect(await repo.load()).toEqual({ A: { workId: 'OL1W' }, B: {} });
  });

  it('ne mémorise rien après un échec et attend avant de réessayer', async () => {
    let t = 0;
    const fetchBook = vi.fn(async () => {
      throw new Error('429');
    });
    const repo = createBookRepo(createMemoryStore(), fetchBook, () => t);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await repo.resolve(['A'])).toEqual({});
    t = 10_000;
    await repo.resolve(['A']);
    expect(fetchBook).toHaveBeenCalledTimes(1);
    t = 70_000;
    await repo.resolve(['A']);
    expect(fetchBook).toHaveBeenCalledTimes(2);
  });
});
