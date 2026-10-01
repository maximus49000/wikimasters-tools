import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createKindsRepo } from '../../../src/core/kinds/kinds-repo';
import { NO_KINDS, type KindsFetch } from '../../../src/core/kinds/wikidata-kinds';

const noSleep = async () => undefined;
const answer = (slugs: string[]): KindsFetch => ({
  kinds: Object.fromEntries(slugs.map((slug) => [slug, slug === 'Piaf' ? { natures: ['Q5'], occupations: ['Q177220'], genres: [] } : NO_KINDS])),
  labels: { Q5: 'être humain' },
});

describe('createKindsRepo', () => {
  it('interroge chaque article une fois, y compris sans valeur, par lots', async () => {
    const fetchKinds = vi.fn(async (slugs: string[]) => answer(slugs));
    const repo = createKindsRepo(createMemoryStore(), fetchKinds, noSleep);

    await repo.resolveMissing(['Piaf', 'Paris']);
    await repo.resolveMissing(['Piaf', 'Paris']);

    expect(fetchKinds).toHaveBeenCalledTimes(1);
    const state = await repo.load();
    expect(state.cards).toEqual({ Piaf: { natures: ['Q5'], occupations: ['Q177220'], genres: [] }, Paris: NO_KINDS });
    expect(state.labels).toEqual({ Q5: 'être humain' });
  });

  it('découpe en lots de 50 articles', async () => {
    const fetchKinds = vi.fn(async (slugs: string[]) => answer(slugs));
    const repo = createKindsRepo(createMemoryStore(), fetchKinds, noSleep);
    await repo.resolveMissing(Array.from({ length: 120 }, (_, i) => `A${i}`));
    expect(fetchKinds.mock.calls.map(([batch]) => batch.length)).toEqual([50, 50, 20]);
  });

  it(`s'arrête à la première erreur, puis attend avant de réessayer`, async () => {
    let time = 0;
    const fetchKinds = vi
      .fn<(slugs: string[]) => Promise<KindsFetch>>()
      .mockRejectedValueOnce(new Error('hors ligne'))
      .mockImplementation(async (slugs) => answer(slugs));
    const repo = createKindsRepo(createMemoryStore(), fetchKinds, noSleep, 0, () => time);

    await repo.resolveMissing(['A', 'B']);
    await repo.resolveMissing(['A', 'B']);
    expect(fetchKinds).toHaveBeenCalledTimes(1);
    expect((await repo.load()).cards).toEqual({});

    time = 61_000;
    await repo.resolveMissing(['A', 'B']);
    expect(Object.keys((await repo.load()).cards).sort()).toEqual(['A', 'B']);
  });

  it(`prévient les abonnés à chaque écriture`, async () => {
    const repo = createKindsRepo(createMemoryStore(), async (slugs) => answer(slugs), noSleep);
    const listener = vi.fn();
    repo.subscribe(listener);
    await repo.resolveMissing(Array.from({ length: 60 }, (_, i) => `A${i}`));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stocke sous sa propre clé, sans toucher aux dates', async () => {
    const store = createMemoryStore();
    await store.set('dates-v2', { dates: { X: { birth: 1, death: null, start: null, end: null } } });
    const repo = createKindsRepo(store, async (slugs) => answer(slugs), noSleep);
    await repo.resolveMissing(['A']);
    expect(await store.get('dates-v2')).toEqual({ dates: { X: { birth: 1, death: null, start: null, end: null } } });
    expect(await store.get('kinds-v1')).toBeDefined();
  });
});
