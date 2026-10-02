import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { LINKS_MAX_AGE_MS, linksOf } from '../../../src/core/links/links-book';
import { BATCH_SIZE, CONCURRENCY, createLinksRepo } from '../../../src/core/links/links-repo';

const noSleep = async () => undefined;
const answer = async (slugs: string[]) => Object.fromEntries(slugs.map((slug) => [slug, slug === 'Vide' ? [] : ['Pop', `Lien_${slug}`]]));
const slugs = (count: number) => Array.from({ length: count }, (_, i) => `A${i}`);
const later = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('createLinksRepo', () => {
  it('lit chaque article une fois, y compris sans lien', async () => {
    const fetchLinks = vi.fn(answer);
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep);

    await repo.resolveMissing(['Kamini', 'Vide']);
    await repo.resolveMissing(['Kamini', 'Vide']);

    expect(fetchLinks).toHaveBeenCalledTimes(1);
    const state = await repo.load();
    expect(linksOf(state, 'Kamini')).toEqual(['Pop', 'Lien_Kamini']);
    expect(Object.keys(state.cards).sort()).toEqual(['Kamini', 'Vide']);
  });

  it('lit les articles par lots de 50, une requête par lot', async () => {
    const fetchLinks = vi.fn(answer);
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep);
    await repo.resolveMissing(slugs(120));
    expect(BATCH_SIZE).toBe(50);
    expect(fetchLinks.mock.calls.map(([batch]) => batch.length).sort((a, b) => b - a)).toEqual([50, 50, 20]);
    expect(Object.keys((await repo.load()).cards)).toHaveLength(120);
  });

  it('lit plusieurs lots en même temps, sans dépasser la limite', async () => {
    let running = 0;
    let most = 0;
    const slow = vi.fn(async (batch: string[]) => {
      running += 1;
      most = Math.max(most, running);
      await later();
      running -= 1;
      return answer(batch);
    });
    const repo = createLinksRepo(createMemoryStore(), slow, noSleep);

    await repo.resolveMissing(slugs(400));

    expect(CONCURRENCY).toBe(2);
    expect(most).toBe(CONCURRENCY);
    expect(slow).toHaveBeenCalledTimes(8);
    expect(Object.keys((await repo.load()).cards)).toHaveLength(400);
  });

  it('enregistre à chaque lot, et prévient les abonnés à chaque écriture', async () => {
    const repo = createLinksRepo(createMemoryStore(), answer, noSleep);
    const listener = vi.fn();
    repo.subscribe(listener);
    await repo.resolveMissing(slugs(120));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('espace les requêtes d’un même lecteur, jamais avant la première', async () => {
    const sleep = vi.fn(noSleep);
    const repo = createLinksRepo(createMemoryStore(), answer, sleep, 200);
    await repo.resolveMissing(slugs(400));
    expect(sleep).toHaveBeenCalledWith(200);
    expect(sleep.mock.calls.length).toBe(8 - CONCURRENCY);
  });

  it('ajoute à la lecture en cours les articles demandés pendant qu’elle tourne, sans relire les lus', async () => {
    const fetchLinks = vi.fn(async (batch: string[]) => {
      await later();
      return answer(batch);
    });
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep);

    const first = repo.resolveMissing(slugs(60));
    await later();
    const second = repo.resolveMissing([...slugs(60), 'B0', 'B1']);
    await Promise.all([first, second]);

    const asked = fetchLinks.mock.calls.flatMap(([batch]) => batch);
    expect(asked).toHaveLength(62);
    expect(new Set(asked).size).toBe(62);
    expect(Object.keys((await repo.load()).cards)).toHaveLength(62);
  });

  it('garde les lots lus avant une erreur, prévient les abonnés, puis attend avant de réessayer', async () => {
    let time = 0;
    let calls = 0;
    const fetchLinks = vi.fn<(batch: string[]) => Promise<Record<string, string[]>>>(async (batch) => {
      await later();
      calls += 1;
      if (calls === 4) throw new Error('429');
      return answer(batch);
    });
    const repo = createLinksRepo(createMemoryStore(), fetchLinks, noSleep, 0, () => time);
    const listener = vi.fn();
    repo.subscribe(listener);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await repo.resolveMissing(slugs(400));
    expect(repo.failed()).toBe(true);
    const kept = Object.keys((await repo.load()).cards);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(400);
    expect(listener).toHaveBeenCalled();

    const before = fetchLinks.mock.calls.length;
    await repo.resolveMissing(slugs(400));
    expect(fetchLinks).toHaveBeenCalledTimes(before);

    time = 61_000;
    expect(repo.failed()).toBe(false);
    fetchLinks.mockImplementation(answer);
    await repo.resolveMissing(slugs(400));
    expect(Object.keys((await repo.load()).cards)).toHaveLength(400);
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

  it('stocke sous sa propre clé, sans toucher aux autres ni aux liens lus avec l’ancienne méthode', async () => {
    const store = createMemoryStore();
    await store.set('kinds-v1', { cards: {}, labels: {} });
    await store.set('links-v1', { titles: ['Ancien'], cards: { A: { at: 1, links: [0] } } });
    const repo = createLinksRepo(store, answer, noSleep);
    await repo.resolveMissing(['A']);
    expect(await store.get('kinds-v1')).toEqual({ cards: {}, labels: {} });
    expect(await store.get('links-v1')).toEqual({ titles: ['Ancien'], cards: { A: { at: 1, links: [0] } } });
    expect(await store.get('links-v2')).toBeDefined();
    expect(linksOf(await repo.load(), 'A')).toEqual(['Pop', 'Lien_A']);
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
