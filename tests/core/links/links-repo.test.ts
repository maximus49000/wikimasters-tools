import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { LINKS_MAX_AGE_MS, linksOf } from '../../../src/core/links/links-book';
import { CONCURRENCY, WRITE_EVERY, createLinksRepo } from '../../../src/core/links/links-repo';

const noSleep = async () => undefined;
const answer = async (slug: string) => (slug === 'Vide' ? [] : ['Pop', `Lien_${slug}`]);
const slugs = (count: number) => Array.from({ length: count }, (_, i) => `A${i}`);
const later = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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

  it('lit plusieurs articles en même temps, sans dépasser la limite', async () => {
    let running = 0;
    let most = 0;
    const slow = vi.fn(async (slug: string) => {
      running += 1;
      most = Math.max(most, running);
      await later();
      running -= 1;
      return answer(slug);
    });
    const repo = createLinksRepo(createMemoryStore(), slow, noSleep);

    await repo.resolveMissing(slugs(30));

    expect(CONCURRENCY).toBe(4);
    expect(most).toBe(CONCURRENCY);
    expect(slow).toHaveBeenCalledTimes(30);
    expect(Object.keys((await repo.load()).cards)).toHaveLength(30);
  });

  it('enregistre tous les dix articles et à la fin, et prévient les abonnés à chaque écriture', async () => {
    const repo = createLinksRepo(createMemoryStore(), answer, noSleep);
    const listener = vi.fn();
    repo.subscribe(listener);
    await repo.resolveMissing(slugs(25));
    expect(WRITE_EVERY).toBe(10);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(Object.keys((await repo.load()).cards)).toHaveLength(25);
  });

  it('espace les requêtes d’un même lecteur', async () => {
    const sleep = vi.fn(noSleep);
    const repo = createLinksRepo(createMemoryStore(), answer, sleep, 200);
    await repo.resolveMissing(slugs(40));
    expect(sleep).toHaveBeenCalledWith(200);
    // Chaque lecteur n'attend qu'entre deux de ses propres requêtes : jamais avant la première.
    expect(sleep.mock.calls.length).toBeLessThanOrEqual(40 - CONCURRENCY);
    expect(sleep.mock.calls.length).toBeGreaterThan(0);
  });

  it('ajoute à la lecture en cours les articles demandés pendant qu’elle tourne, sans relire les lus', async () => {
    const fetchLinks = vi.fn(async (slug: string) => {
      await later();
      return answer(slug);
    });
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep);

    const first = repo.resolveMissing(slugs(8));
    await later();
    const second = repo.resolveMissing([...slugs(8), 'B0', 'B1']);
    await Promise.all([first, second]);

    expect(fetchLinks).toHaveBeenCalledTimes(10);
    expect(Object.keys((await repo.load()).cards)).toHaveLength(10);
  });

  it('garde ce qui a été lu avant une erreur, prévient les abonnés, puis attend avant de réessayer', async () => {
    let time = 0;
    const fetchLinks = vi.fn<(slug: string) => Promise<string[]>>(async (slug) => {
      await later();
      if (slug === 'A2') throw new Error('429');
      return answer(slug);
    });
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep, 0, () => time);
    const listener = vi.fn();
    repo.subscribe(listener);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await repo.resolveMissing(slugs(20));
    expect(repo.failed()).toBe(true);
    const kept = Object.keys((await repo.load()).cards);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(20);
    expect(kept).not.toContain('A2');
    expect(listener).toHaveBeenCalled();

    const calls = fetchLinks.mock.calls.length;
    await repo.resolveMissing(slugs(20));
    expect(fetchLinks).toHaveBeenCalledTimes(calls);

    time = 61_000;
    expect(repo.failed()).toBe(false);
    fetchLinks.mockImplementation(answer);
    await repo.resolveMissing(slugs(20));
    expect(Object.keys((await repo.load()).cards)).toHaveLength(20);
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
