import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { LINKS_MAX_AGE_MS, linksOf } from '../../../src/core/links/links-book';
import { createLinksRepo } from '../../../src/core/links/links-repo';

const noSleep = async () => undefined;
const answer = async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, slug === 'Vide' ? [] : ['Pop', `Lien_${slug}`]]));

describe('createLinksRepo', () => {
  it('lit chaque article une fois, y compris sans lien, par lots', async () => {
    const fetchLinks = vi.fn(answer);
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep);

    await repo.resolveMissing(['Kamini', 'Vide']);
    await repo.resolveMissing(['Kamini', 'Vide']);

    expect(fetchLinks).toHaveBeenCalledTimes(1);
    const state = await repo.load();
    expect(linksOf(state, 'Kamini')).toEqual(['Pop', 'Lien_Kamini']);
    expect(Object.keys(state.cards).sort()).toEqual(['Kamini', 'Vide']);
  });

  it('découpe en lots de 50 articles', async () => {
    const fetchLinks = vi.fn(answer);
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep);
    await repo.resolveMissing(Array.from({ length: 120 }, (_, i) => `A${i}`));
    expect(fetchLinks.mock.calls.map(([batch]) => batch.length)).toEqual([50, 50, 20]);
  });

  it('s’arrête à la première erreur, prévient les abonnés, puis attend avant de réessayer', async () => {
    let time = 0;
    const fetchLinks = vi
      .fn<(slugs: string[]) => Promise<Record<string, string[]>>>()
      .mockRejectedValueOnce(new Error('hors ligne'))
      .mockImplementation(answer);
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep, 0, () => time);
    const listener = vi.fn();
    repo.subscribe(listener);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await repo.resolveMissing(['A', 'B']);
    expect(repo.failed()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    await repo.resolveMissing(['A', 'B']);
    expect(fetchLinks).toHaveBeenCalledTimes(1);
    expect((await repo.load()).cards).toEqual({});

    time = 61_000;
    expect(repo.failed()).toBe(false);
    await repo.resolveMissing(['A', 'B']);
    expect(Object.keys((await repo.load()).cards).sort()).toEqual(['A', 'B']);
  });

  it('prévient les abonnés à chaque écriture', async () => {
    const repo = createLinksRepo(createMemoryStore(), answer, noSleep);
    const listener = vi.fn();
    repo.subscribe(listener);
    await repo.resolveMissing(Array.from({ length: 60 }, (_, i) => `A${i}`));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('relit une carte au bout de 30 jours', async () => {
    let time = 0;
    const fetchLinks = vi.fn(answer);
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep, 0, () => time);
    await repo.resolveMissing(['A']);
    time = LINKS_MAX_AGE_MS;
    await repo.resolveMissing(['A']);
    expect(fetchLinks).toHaveBeenCalledTimes(2);
  });

  it('stocke sous sa propre clé, sans toucher aux autres', async () => {
    const store = createMemoryStore();
    await store.set('kinds-v1', { cards: {}, labels: {} });
    const repo = createLinksRepo(store, answer, noSleep);
    await repo.resolveMissing(['A']);
    expect(await store.get('kinds-v1')).toEqual({ cards: {}, labels: {} });
    expect(await store.get('links-v1')).toBeDefined();
  });

  it('traite un stockage plein comme un échec, sans lever', async () => {
    const full = {
      get: async () => undefined,
      set: async () => {
        throw new Error('quota');
      },
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const repo = createLinksRepo(full, answer, noSleep);
    await expect(repo.resolveMissing(['A'])).resolves.toBeUndefined();
    expect(repo.failed()).toBe(true);
  });
});
