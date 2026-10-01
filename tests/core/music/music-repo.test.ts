import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createMusicRepo } from '../../../src/core/music/music-repo';
import type { CardMusic } from '../../../src/core/music/wikidata-music';

describe('createMusicRepo', () => {
  it('interroge chaque article une fois, même sans valeur', async () => {
    const fetchMusic = vi.fn(async (slugs: string[]): Promise<Record<string, CardMusic>> =>
      Object.fromEntries(slugs.map((slug) => [slug, slug === 'Yesterday' ? { performer: 'The Beatles' } : {}])),
    );
    const repo = createMusicRepo(createMemoryStore(), fetchMusic);
    await repo.resolve(['Yesterday', 'Paris']);
    const state = await repo.resolve(['Yesterday', 'Paris']);
    expect(fetchMusic).toHaveBeenCalledTimes(1);
    expect(state).toEqual({ Yesterday: { performer: 'The Beatles' }, Paris: {} });
    expect(await repo.load()).toEqual(state);
  });

  it("n'enregistre rien en cas d'échec, puis attend 60 s avant de réessayer", async () => {
    let time = 0;
    const fetchMusic = vi
      .fn<(slugs: string[]) => Promise<Record<string, CardMusic>>>()
      .mockRejectedValueOnce(new Error('hors ligne'))
      .mockResolvedValue({ A: {} });
    const repo = createMusicRepo(createMemoryStore(), fetchMusic, () => time);
    expect(await repo.resolve(['A'])).toEqual({});
    time = 30_000;
    expect(await repo.resolve(['A'])).toEqual({});
    expect(fetchMusic).toHaveBeenCalledTimes(1);
    time = 61_000;
    expect(await repo.resolve(['A'])).toEqual({ A: {} });
    expect(fetchMusic).toHaveBeenCalledTimes(2);
  });
});
