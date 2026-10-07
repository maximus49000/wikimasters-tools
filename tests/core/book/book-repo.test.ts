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

  it('regroupe les résolutions simultanées en une seule interrogation', async () => {
    const fetchBook = vi.fn(async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, {}])));
    const repo = createBookRepo(createMemoryStore(), fetchBook);
    const [a, b, c] = await Promise.all([repo.resolve(['A']), repo.resolve(['B']), repo.resolve(['C'])]);
    expect(fetchBook).toHaveBeenCalledTimes(1);
    expect(fetchBook).toHaveBeenCalledWith(['A', 'B', 'C']);
    for (const state of [a, b, c]) expect(Object.keys(state).sort()).toEqual(['A', 'B', 'C']);
  });

  it('découpe 120 articles manquants en lots de 50, 50 et 20', async () => {
    const fetchBook = vi.fn(async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, {}])));
    const repo = createBookRepo(createMemoryStore(), fetchBook);
    const state = await repo.resolve(Array.from({ length: 120 }, (_, i) => `A${i}`));
    expect(fetchBook.mock.calls.map(([batch]) => batch.length)).toEqual([50, 50, 20]);
    expect(Object.keys(state)).toHaveLength(120);
  });

  it('ne redemande pas un article déjà connu', async () => {
    const fetchBook = vi.fn(async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, {}])));
    const repo = createBookRepo(createMemoryStore(), fetchBook);
    await repo.resolve(['A']);
    await Promise.all([repo.resolve(['A']), repo.resolve(['B'])]);
    expect(fetchBook).toHaveBeenCalledTimes(2);
    expect(fetchBook).toHaveBeenLastCalledWith(['B']);
  });

  it('après un échec, la pause s’applique aux appels regroupés et rien n’est écrit', async () => {
    let t = 0;
    const fetchBook = vi.fn(async (_slugs: string[]) => {
      throw new Error('429');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const repo = createBookRepo(createMemoryStore(), fetchBook, () => t);
    expect(await Promise.all([repo.resolve(['A']), repo.resolve(['B'])])).toEqual([{}, {}]);
    expect(fetchBook).toHaveBeenCalledTimes(1);
    t = 10_000;
    await Promise.all([repo.resolve(['A']), repo.resolve(['C'])]);
    expect(fetchBook).toHaveBeenCalledTimes(1);
    expect(await repo.load()).toEqual({});
  });
});
