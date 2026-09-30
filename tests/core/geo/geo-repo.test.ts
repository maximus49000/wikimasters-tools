import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createGeoRepo } from '../../../src/core/geo/geo-repo';

const noSleep = async () => undefined;

describe('createGeoRepo', () => {
  it('interroge Wikipédia une fois par article, y compris quand il n\'a pas de coordonnées', async () => {
    const fetchCoords = vi.fn(async (slug: string) => (slug === 'Paris' ? { lat: 48.85, lon: 2.35 } : null));
    const repo = createGeoRepo(createMemoryStore(), fetchCoords, noSleep);

    await repo.resolveMissing(['Paris', 'Ted_Lasso']);
    await repo.resolveMissing(['Paris', 'Ted_Lasso']);

    expect(fetchCoords).toHaveBeenCalledTimes(2);
    const state = await repo.load();
    expect(state.wiki).toEqual({ Paris: { lat: 48.85, lon: 2.35 }, Ted_Lasso: null });
  });

  it('une seule requête à la fois, même si plusieurs demandes se chevauchent', async () => {
    let running = 0;
    let peak = 0;
    const fetchCoords = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;
      return null;
    };
    const repo = createGeoRepo(createMemoryStore(), fetchCoords, noSleep);

    await Promise.all([repo.resolveMissing(['A', 'B']), repo.resolveMissing(['C', 'D'])]);
    expect(peak).toBe(1);
  });

  it('s\'arrête à la première erreur et laisse le reste à réessayer plus tard', async () => {
    const fetchCoords = vi
      .fn<(slug: string) => Promise<{ lat: number; lon: number } | null>>()
      .mockResolvedValueOnce({ lat: 1, lon: 2 })
      .mockRejectedValueOnce(new Error('hors ligne'));
    const repo = createGeoRepo(createMemoryStore(), fetchCoords, noSleep);

    await repo.resolveMissing(['A', 'B', 'C']);

    expect(fetchCoords).toHaveBeenCalledTimes(2);
    expect(Object.keys((await repo.load()).wiki)).toEqual(['A']);
  });

  it('espace les requêtes', async () => {
    const sleeps: number[] = [];
    const repo = createGeoRepo(createMemoryStore(), async () => null, async (ms) => void sleeps.push(ms), 150);
    await repo.resolveMissing(['A', 'B', 'C']);
    expect(sleeps).toEqual([150, 150]);
  });

  it('mémorise et retire les positions manuelles, et prévient les abonnés', async () => {
    const repo = createGeoRepo(createMemoryStore(), async () => null, noSleep);
    const listener = vi.fn();
    repo.subscribe(listener);

    await repo.setManual('Paris', { lat: 1, lon: 2 });
    expect((await repo.load()).manual).toEqual({ Paris: { lat: 1, lon: 2 } });

    await repo.clearManual('Paris');
    expect((await repo.load()).manual).toEqual({});
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('fusionne cinq demandes qui se chevauchent : chaque article une fois, jamais en parallèle', async () => {
    let running = 0;
    let peak = 0;
    const fetchCoords = vi.fn(async (_slug: string) => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;
      return null;
    });
    const repo = createGeoRepo(createMemoryStore(), fetchCoords, noSleep);

    await Promise.all(Array.from({ length: 5 }, () => repo.resolveMissing(['A', 'B', 'C'])));

    expect(fetchCoords.mock.calls.map(([slug]) => slug).sort()).toEqual(['A', 'B', 'C']);
    expect(peak).toBe(1);
  });

  it('après un échec, ne refait aucune requête pendant 60 s puis réessaie', async () => {
    let clock = 1_000_000;
    const fetchCoords = vi
      .fn<(slug: string) => Promise<{ lat: number; lon: number } | null>>()
      .mockRejectedValueOnce(new Error('429'))
      .mockResolvedValue(null);
    const repo = createGeoRepo(createMemoryStore(), fetchCoords, noSleep, 150, () => clock);

    await repo.resolveMissing(['A']);
    expect(fetchCoords).toHaveBeenCalledTimes(1);

    clock += 59_000;
    await repo.resolveMissing(['A']);
    expect(fetchCoords).toHaveBeenCalledTimes(1);

    clock += 2_000;
    await repo.resolveMissing(['A']);
    expect(fetchCoords).toHaveBeenCalledTimes(2);
    expect((await repo.load()).wiki).toEqual({ A: null });
  });

  it('les articles ajoutés pendant un parcours sont traités par ce même parcours', async () => {
    let running = 0;
    let peak = 0;
    const fetched: string[] = [];
    let repo!: ReturnType<typeof createGeoRepo>;
    let second: Promise<void> | undefined;
    const fetchCoords = async (slug: string) => {
      running += 1;
      peak = Math.max(peak, running);
      fetched.push(slug);
      if (slug === 'A') second = repo.resolveMissing(['C', 'D']);
      await Promise.resolve();
      running -= 1;
      return null;
    };
    repo = createGeoRepo(createMemoryStore(), fetchCoords, noSleep);

    await repo.resolveMissing(['A', 'B']);
    await second;

    expect(fetched).toEqual(['A', 'B', 'C', 'D']);
    expect(peak).toBe(1);
  });
});
