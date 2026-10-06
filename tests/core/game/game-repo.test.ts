import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createGameChoiceRepo, createGameRepo } from '../../../src/core/game/game-repo';

describe('createGameRepo', () => {
  it("n'interroge Wikidata que pour les articles jamais vus, et mémorise un article vide", async () => {
    const fetchGame = vi.fn(async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, slug === 'A' ? { steamId: 1 } : {}])));
    const repo = createGameRepo(createMemoryStore(), fetchGame);
    expect(await repo.resolve(['A', 'B'])).toEqual({ A: { steamId: 1 }, B: {} });
    await repo.resolve(['A', 'B']);
    expect(fetchGame).toHaveBeenCalledTimes(1);
  });

  it('ne mémorise rien après un échec et attend avant de réessayer', async () => {
    let t = 0;
    const fetchGame = vi.fn(async () => {
      throw new Error('429');
    });
    const repo = createGameRepo(createMemoryStore(), fetchGame, () => t);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await repo.resolve(['A'])).toEqual({});
    t = 10_000;
    await repo.resolve(['A']);
    expect(fetchGame).toHaveBeenCalledTimes(1);
    t = 70_000;
    await repo.resolve(['A']);
    expect(fetchGame).toHaveBeenCalledTimes(2);
  });
});

describe('createGameChoiceRepo', () => {
  it('garde, remplace et efface le choix de chaque carte', async () => {
    const repo = createGameChoiceRepo(createMemoryStore());
    expect(await repo.load()).toEqual({});
    await repo.save('A', { source: 'steam', id: 1 });
    await repo.save('B', { none: true });
    await repo.save('A', { source: 'igdb', id: 2 });
    expect(await repo.load()).toEqual({ A: { source: 'igdb', id: 2 }, B: { none: true } });
    await repo.clear('A');
    expect(await repo.load()).toEqual({ B: { none: true } });
  });
});
