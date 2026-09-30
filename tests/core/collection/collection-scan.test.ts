import { describe, expect, it, vi } from 'vitest';
import type { CollectionPage } from '../../../src/core/api/collection-schemas';
import { NotAuthenticatedError } from '../../../src/core/api/errors';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createCollectionRepo } from '../../../src/core/collection/collection-repo';
import { createCollectionScanner, type ScanState } from '../../../src/core/collection/collection-scan';

const card = (name: string) => ({ slug: name, title: name });
const page = (...names: string[]): CollectionPage => ({ cards: names.map(card), entries: names.length, skipped: 0 });
const EMPTY = page();

function setup(pages: (CollectionPage | Error)[], options: { maxPages?: number } = {}) {
  const store = createMemoryStore();
  const collection = createCollectionRepo(store);
  const getCollectionPage = vi.fn(async (index: number) => {
    const next = pages[index] ?? EMPTY;
    if (next instanceof Error) throw next;
    return next;
  });
  const scanner = createCollectionScanner({
    api: { getCollectionPage },
    collection,
    store,
    now: () => 1_000_000,
    ...options,
  });
  return { store, collection, scanner, getCollectionPage };
}

describe('createCollectionScanner', () => {
  it('parcourt les pages jusqu’à une page vide et alimente la collection page par page', async () => {
    const { scanner, collection, getCollectionPage } = setup([page('A', 'B'), page('C')]);

    await scanner.run();

    expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 1, 2]);
    expect((await collection.list()).map((c) => c.slug).sort()).toEqual(['A', 'B', 'C']);
    expect(await scanner.state()).toMatchObject({ status: 'done', entries: 3, nextPage: 2 });
  });

  it('ne refait rien une fois terminé, sauf avec force (repart de la page 0)', async () => {
    const { scanner, getCollectionPage } = setup([page('A')]);
    await scanner.run();
    getCollectionPage.mockClear();

    await scanner.run();
    expect(getCollectionPage).not.toHaveBeenCalled();

    await scanner.run({ force: true });
    expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 1]);
  });

  it('refait un parcours terminé avec une ancienne version du scan', async () => {
    const { scanner, store, getCollectionPage } = setup([page('A')]);
    await store.set('collectionScan', { status: 'done', nextPage: 5, entries: 250, updatedAt: 1 });

    await scanner.run();

    expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 1]);
  });

  it('s’arrête à la première erreur, garde sa place et reprend à cette page', async () => {
    const { scanner, collection, getCollectionPage } = setup([page('A'), new NotAuthenticatedError('/x', 401), page('C')]);

    await scanner.run();
    expect(await scanner.state()).toMatchObject({ status: 'error', nextPage: 1, entries: 1 });
    expect((await scanner.state()).error).toContain('Non connecté');
    expect(getCollectionPage).toHaveBeenCalledTimes(2);

    getCollectionPage.mockClear();
    getCollectionPage.mockImplementation(async (index: number) => (index === 1 ? page('B') : EMPTY));
    await scanner.run();

    expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([1, 2]);
    expect((await collection.list()).map((c) => c.slug).sort()).toEqual(['A', 'B']);
    expect(await scanner.state()).toMatchObject({ status: 'done' });
  });

  it('laisse un scan récent d’un autre onglet tranquille, mais reprend un scan périmé', async () => {
    const fresh: ScanState = { status: 'running', nextPage: 4, entries: 200, updatedAt: 1_000_000 - 10_000 };
    const stale: ScanState = { status: 'running', nextPage: 4, entries: 200, updatedAt: 1_000_000 - 120_000 };

    const a = setup([]);
    await a.store.set('collectionScan', fresh);
    await a.scanner.run();
    expect(a.getCollectionPage).not.toHaveBeenCalled();

    const b = setup([]);
    await b.store.set('collectionScan', stale);
    await b.scanner.run();
    expect(b.getCollectionPage.mock.calls[0]?.[0]).toBe(4);
  });

  it('ne lance pas deux parcours en même temps dans le même onglet', async () => {
    const { scanner, getCollectionPage } = setup([page('A')]);
    await Promise.all([scanner.run(), scanner.run()]);
    expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 1]);
  });

  it('s’arrête sur la limite de pages', async () => {
    const { scanner, getCollectionPage } = setup([page('A'), page('B'), page('C')], { maxPages: 2 });
    await scanner.run();
    expect(getCollectionPage).toHaveBeenCalledTimes(2);
    expect(await scanner.state()).toMatchObject({ status: 'error', nextPage: 2 });
    expect((await scanner.state()).error).toContain('limite');
  });

  it('ne termine pas sur une page dont toutes les entrées sont invalides (seul entries === 0 termine)', async () => {
    const { scanner, collection, getCollectionPage } = setup([
      { cards: [], entries: 2, skipped: 2 },
      page('A'),
    ]);

    await scanner.run();

    expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 1, 2]);
    expect((await collection.list()).map((c) => c.slug)).toEqual(['A']);
    expect(await scanner.state()).toMatchObject({ status: 'done' });
  });

  it('prévient les abonnés à chaque changement d’état, jusqu’au désabonnement', async () => {
    const { scanner } = setup([page('A')]);
    const listener = vi.fn();
    const unsubscribe = scanner.subscribe(listener);
    await scanner.run();
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(3);

    unsubscribe();
    listener.mockClear();
    await scanner.run({ force: true });
    expect(listener).not.toHaveBeenCalled();
  });

  describe('verrou d’un autre chargement de page', () => {
    function lockedSetup(updatedAt: number) {
      const scheduled: { fn: () => void; ms: number }[] = [];
      const store = createMemoryStore();
      const collection = createCollectionRepo(store);
      let clock = 1_000_000;
      const getCollectionPage = vi.fn(async (index: number) => (index === 4 ? page('Z') : EMPTY));
      const scanner = createCollectionScanner({
        api: { getCollectionPage },
        collection,
        store,
        now: () => clock,
        schedule: (fn, ms) => void scheduled.push({ fn, ms }),
      });
      const saved: ScanState = { status: 'running', nextPage: 4, entries: 200, updatedAt };
      return { store, scanner, scheduled, getCollectionPage, saved, setClock: (t: number) => void (clock = t) };
    }

    it('programme une seule reprise à la fin du verrou', async () => {
      const t = lockedSetup(1_000_000 - 10_000);
      await t.store.set('collectionScan', t.saved);
      await t.scanner.run();
      expect(t.getCollectionPage).not.toHaveBeenCalled();
      expect(t.scheduled.map((s) => s.ms)).toEqual([50_000 + 1000]);
    });

    it('ne programme pas de seconde reprise si run est rappelé pendant l’attente', async () => {
      const t = lockedSetup(1_000_000 - 10_000);
      await t.store.set('collectionScan', t.saved);
      await t.scanner.run();
      await t.scanner.run();
      expect(t.scheduled).toHaveLength(1);
    });

    it('la reprise programmée repart de la page suivante une fois le verrou périmé', async () => {
      const t = lockedSetup(1_000_000 - 10_000);
      await t.store.set('collectionScan', t.saved);
      await t.scanner.run();
      t.setClock(1_000_000 + 51_000);
      t.scheduled[0]?.fn();
      await vi.waitFor(async () => expect(await t.scanner.state()).toMatchObject({ status: 'done' }));
      expect(t.getCollectionPage.mock.calls[0]?.[0]).toBe(4);
    });
  });
});
