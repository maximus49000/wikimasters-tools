import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createScreenRepo } from '../../../src/core/screen/screen-repo';

describe('createScreenRepo', () => {
  it("n'interroge Wikidata que pour les articles jamais vus, et mémorise un article vide", async () => {
    const fetchScreen = vi.fn(async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, slug === 'A' ? { movieId: 1 } : {}])));
    const repo = createScreenRepo(createMemoryStore(), fetchScreen);
    expect(await repo.resolve(['A', 'B'])).toEqual({ A: { movieId: 1 }, B: {} });
    await repo.resolve(['A', 'B']);
    expect(fetchScreen).toHaveBeenCalledTimes(1);
  });

  it('ne mémorise rien après un échec et attend avant de réessayer', async () => {
    let t = 0;
    const fetchScreen = vi.fn(async () => {
      throw new Error('429');
    });
    const repo = createScreenRepo(createMemoryStore(), fetchScreen, () => t);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await repo.resolve(['A'])).toEqual({});
    t = 10_000;
    await repo.resolve(['A']);
    expect(fetchScreen).toHaveBeenCalledTimes(1);
    t = 70_000;
    await repo.resolve(['A']);
    expect(fetchScreen).toHaveBeenCalledTimes(2);
  });
});
