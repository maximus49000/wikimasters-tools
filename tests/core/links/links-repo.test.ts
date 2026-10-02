import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { LINKS_MAX_AGE_MS, linksOf } from '../../../src/core/links/links-book';
import { WRITE_EVERY, createLinksRepo } from '../../../src/core/links/links-repo';

const noSleep = async () => undefined;
const answer = async (slug: string) => (slug === 'Vide' ? [] : ['Pop', `Lien_${slug}`]);
const slugs = (count: number) => Array.from({ length: count }, (_, i) => `A${i}`);

describe('createLinksRepo', () => {
  it('lit chaque article une fois, y compris sans lien', async () => {
    const fetchLinks = vi.fn(answer);
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep);

    await repo.resolveMissing(['Kamini', 'Vide']);
    await repo.resolveMissing(['Kamini', 'Vide']);

    expect(fetchLinks).toHaveBeenCalledTimes(2);
    const state = await repo.load();
    expect(linksOf(state, 'Kamini')).toEqual(['Pop', 'Lien_Kamini']);
    expect(Object.keys(state.cards).sort()).toEqual(['Kamini', 'Vide']);
  });

  it('enregistre par groupes de dix articles et prévient les abonnés à chaque écriture', async () => {
    const repo = createLinksRepo(createMemoryStore(), answer, noSleep);
    const listener = vi.fn();
    repo.subscribe(listener);
    await repo.resolveMissing(slugs(25));
    expect(WRITE_EVERY).toBe(10);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(Object.keys((await repo.load()).cards)).toHaveLength(25);
  });

  it('espace les requêtes, sans attendre avant la première', async () => {
    const sleep = vi.fn(noSleep);
    const repo = createLinksRepo(createMemoryStore(), answer, sleep, 200);
    await repo.resolveMissing(slugs(12));
    expect(sleep).toHaveBeenCalledTimes(11);
    expect(sleep).toHaveBeenCalledWith(200);
  });

  it('garde ce qui a été lu avant une erreur, prévient les abonnés, puis attend avant de réessayer', async () => {
    let time = 0;
    const fetchLinks = vi
      .fn<(slug: string) => Promise<string[]>>()
      .mockResolvedValueOnce(['Pop'])
      .mockRejectedValueOnce(new Error('429'))
      .mockImplementation(answer);
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep, 0, () => time);
    const listener = vi.fn();
    repo.subscribe(listener);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await repo.resolveMissing(['A', 'B', 'C']);
    expect(repo.failed()).toBe(true);
    expect(Object.keys((await repo.load()).cards)).toEqual(['A']);
    expect(listener).toHaveBeenCalled();

    await repo.resolveMissing(['B', 'C']);
    expect(fetchLinks).toHaveBeenCalledTimes(2);

    time = 61_000;
    expect(repo.failed()).toBe(false);
    await repo.resolveMissing(['A', 'B', 'C']);
    expect(Object.keys((await repo.load()).cards).sort()).toEqual(['A', 'B', 'C']);
    expect(fetchLinks).toHaveBeenCalledTimes(4);
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
