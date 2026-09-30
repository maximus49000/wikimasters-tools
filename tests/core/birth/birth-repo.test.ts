import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createBirthRepo } from '../../../src/core/birth/birth-repo';

const noSleep = async () => undefined;

describe('createBirthRepo', () => {
  it("interroge Wikidata une fois par article, y compris sans date", async () => {
    const fetchBirth = vi.fn(async (slug: string) => (slug === 'Chaplin' ? 1889 : null));
    const repo = createBirthRepo(createMemoryStore(), fetchBirth, noSleep);

    await repo.resolveMissing(['Chaplin', 'Paris']);
    await repo.resolveMissing(['Chaplin', 'Paris']);

    expect(fetchBirth).toHaveBeenCalledTimes(2);
    expect((await repo.load()).years).toEqual({ Chaplin: 1889, Paris: null });
  });

  it("s'arrête à la première erreur, puis attend avant de réessayer", async () => {
    let time = 0;
    const fetchBirth = vi
      .fn<(slug: string) => Promise<number | null>>()
      .mockResolvedValueOnce(1900)
      .mockRejectedValueOnce(new Error('hors ligne'))
      .mockResolvedValue(1950);
    const repo = createBirthRepo(createMemoryStore(), fetchBirth, noSleep, 0, () => time);

    await repo.resolveMissing(['A', 'B', 'C']);
    expect(Object.keys((await repo.load()).years)).toEqual(['A']);

    await repo.resolveMissing(['B', 'C']);
    expect(fetchBirth).toHaveBeenCalledTimes(2);

    time = 61_000;
    await repo.resolveMissing(['B', 'C']);
    expect(Object.keys((await repo.load()).years).sort()).toEqual(['A', 'B', 'C']);
  });

  it('prévient les abonnés à chaque écriture', async () => {
    const repo = createBirthRepo(createMemoryStore(), async () => 1800, noSleep);
    const listener = vi.fn();
    repo.subscribe(listener);
    await repo.resolveMissing(['A', 'B']);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
