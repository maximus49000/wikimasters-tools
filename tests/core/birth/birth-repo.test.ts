import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createBirthRepo } from '../../../src/core/birth/birth-repo';

const noSleep = async () => undefined;
const years = (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, slug === 'Chaplin' ? 1889 : null]));

describe('createBirthRepo', () => {
  it('interroge chaque article une fois, y compris sans date, par lots', async () => {
    const fetchBirth = vi.fn(async (slugs: string[]) => years(slugs));
    const repo = createBirthRepo(createMemoryStore(), fetchBirth, noSleep);

    await repo.resolveMissing(['Chaplin', 'Paris']);
    await repo.resolveMissing(['Chaplin', 'Paris']);

    expect(fetchBirth).toHaveBeenCalledTimes(1);
    expect((await repo.load()).years).toEqual({ Chaplin: 1889, Paris: null });
  });

  it('découpe en lots de 50 articles', async () => {
    const fetchBirth = vi.fn(async (slugs: string[]) => years(slugs));
    const repo = createBirthRepo(createMemoryStore(), fetchBirth, noSleep);
    await repo.resolveMissing(Array.from({ length: 120 }, (_, i) => `A${i}`));
    expect(fetchBirth.mock.calls.map(([batch]) => batch.length)).toEqual([50, 50, 20]);
  });

  it("s'arrête à la première erreur, puis attend avant de réessayer", async () => {
    let time = 0;
    const fetchBirth = vi
      .fn<(slugs: string[]) => Promise<Record<string, number | null>>>()
      .mockRejectedValueOnce(new Error('hors ligne'))
      .mockImplementation(async (slugs) => years(slugs));
    const repo = createBirthRepo(createMemoryStore(), fetchBirth, noSleep, 0, () => time);

    await repo.resolveMissing(['A', 'B']);
    await repo.resolveMissing(['A', 'B']);
    expect(fetchBirth).toHaveBeenCalledTimes(1);
    expect((await repo.load()).years).toEqual({});

    time = 61_000;
    await repo.resolveMissing(['A', 'B']);
    expect(Object.keys((await repo.load()).years).sort()).toEqual(['A', 'B']);
  });

  it('prévient les abonnés à chaque écriture', async () => {
    const repo = createBirthRepo(createMemoryStore(), async (slugs) => years(slugs), noSleep);
    const listener = vi.fn();
    repo.subscribe(listener);
    await repo.resolveMissing(Array.from({ length: 60 }, (_, i) => `A${i}`));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
