import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createGameVersionRepo } from '../../../src/core/game/game-version-repo';

describe('createGameVersionRepo', () => {
  it('enregistre, relit et efface', async () => {
    const repo = createGameVersionRepo(createMemoryStore());
    expect(await repo.load()).toEqual({});
    await repo.save('Hollow_Knight', { tgdbId: 4 });
    expect(await repo.load()).toEqual({ Hollow_Knight: { tgdbId: 4 } });
    await repo.clear('Hollow_Knight');
    expect(await repo.load()).toEqual({});
  });
  it('deux enregistrements simultanés se conservent', async () => {
    const repo = createGameVersionRepo(createMemoryStore());
    await Promise.all([repo.save('A', { tgdbId: 1 }), repo.save('B', { tgdbId: 2 })]);
    expect(await repo.load()).toEqual({ A: { tgdbId: 1 }, B: { tgdbId: 2 } });
  });
});
