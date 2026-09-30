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
});
