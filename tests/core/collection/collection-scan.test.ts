import { describe, expect, it, vi } from 'vitest';
import type { CollectionPage } from '../../../src/core/api/collection-schemas';
import { NotAuthenticatedError } from '../../../src/core/api/errors';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createCollectionRepo } from '../../../src/core/collection/collection-repo';
import { createCollectionScanner, type ScanState } from '../../../src/core/collection/collection-scan';

const card = (name: string) => ({ slug: name, title: name });
const page = (...names: string[]): CollectionPage => ({ cards: names.map(card), entries: names.length, skipped: 0 });
const EMPTY = page();
// Page dont chaque carte porte une date d'obtention (plus grand = plus récent).
const dated = (...items: [string, number][]): CollectionPage => ({
  cards: items.map(([name]) => card(name)),
  obtained: items.map(([slug, at]) => ({ slug, at })),
  entries: items.length,
  skipped: 0,
});

function setup(pages: (CollectionPage | Error)[], options: { maxPages?: number; now?: () => number } = {}) {
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
  it('un parcours complet retire les cartes vendues ou échangées depuis le dernier', async () => {
    const { scanner, collection } = setup([{ cards: [{ slug: 'A', title: 'A', copies: 1 }], entries: 1, skipped: 0 }]);
    await collection.observe([{ slug: 'Vendue', title: 'Vendue', copies: 1 }], true);
    await scanner.run({ force: true });
    expect((await collection.list()).map((c) => c.slug)).toEqual(['A']);
  });

  it('parcourt les pages jusqu’à une page vide et alimente la collection page par page', async () => {
    const { scanner, collection, getCollectionPage } = setup([page('A', 'B'), page('C')]);

    await scanner.run();

    expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 1, 2]);
    expect((await collection.list()).map((c) => c.slug).sort()).toEqual(['A', 'B', 'C']);
    expect(await scanner.state()).toMatchObject({ status: 'done', entries: 3, nextPage: 2 });
  });

  it('après un parcours terminé, force repart de la page 0 et lit tout', async () => {
    const { scanner, getCollectionPage } = setup([dated(['A', 1])]);
    await scanner.run();
    getCollectionPage.mockClear();

    await scanner.run({ force: true });
    expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 1]);
  });

  it("demande le tri par date d'ajout", async () => {
    const { scanner, getCollectionPage } = setup([page('A')]);
    await scanner.run();
    expect(getCollectionPage).toHaveBeenCalledWith(0, undefined, 'added');
  });

  it('retient la plus grande page lue comme taille de page du site', async () => {
    const { scanner } = setup([page('A', 'B', 'C'), page('D')]);
    await scanner.run();
    expect(await scanner.state()).toMatchObject({ status: 'done', pageSize: 3 });
  });

  it('garde la taille de page connue lors d’une mise à jour incrémentale', async () => {
    const { scanner } = setup([dated(['A', 30], ['B', 20], ['C', 10])]);
    await scanner.run();
    await scanner.run();
    expect(await scanner.state()).toMatchObject({ pageSize: 3 });
  });

  describe('mise à jour incrémentale', () => {
    it('retient la date de la carte la plus récente à la fin du parcours complet', async () => {
      const { scanner } = setup([dated(['A', 30], ['B', 20]), dated(['C', 10])]);
      await scanner.run();
      expect(await scanner.state()).toMatchObject({ status: 'done', lastObtainedAt: 30 });
      expect(await scanner.state()).not.toHaveProperty('pendingObtainedAt');
    });

    it("ne lit que la première page quand rien n'est arrivé depuis le dernier import", async () => {
      const { scanner, collection, getCollectionPage } = setup([dated(['A', 30], ['B', 20]), dated(['C', 10])]);
      await scanner.run();
      getCollectionPage.mockClear();

      await scanner.run();

      expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0]);
      expect((await collection.list()).map((c) => c.slug).sort()).toEqual(['A', 'B', 'C']);
      expect(await scanner.state()).toMatchObject({ status: 'done', lastObtainedAt: 30 });
    });

    it("n'importe que les cartes plus récentes que le dernier import et s'arrête à la première ancienne", async () => {
      const { scanner, collection, getCollectionPage } = setup([dated(['A', 30], ['B', 20]), dated(['C', 10])]);
      await scanner.run();
      getCollectionPage.mockClear();
      const observe = vi.spyOn(collection, 'observe');
      getCollectionPage.mockImplementation(async (index: number) =>
        index === 0 ? dated(['N2', 50], ['N1', 40], ['A', 30], ['B', 20]) : EMPTY,
      );

      await scanner.run();

      expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0]);
      expect(observe).toHaveBeenCalledTimes(1);
      expect(observe.mock.calls[0]?.[0].map((c) => c.slug)).toEqual(['N2', 'N1']);
      expect(await scanner.state()).toMatchObject({ status: 'done', lastObtainedAt: 50, entries: 5 });
    });

    it('passe à la page suivante tant que toutes les cartes sont plus récentes', async () => {
      const { scanner, getCollectionPage } = setup([dated(['A', 10])]);
      await scanner.run();
      getCollectionPage.mockClear();
      getCollectionPage.mockImplementation(async (index: number) =>
        index === 0 ? dated(['N3', 40], ['N2', 30]) : index === 1 ? dated(['N1', 20], ['A', 10]) : EMPTY,
      );

      await scanner.run();

      expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 1]);
    });

    it('refuse un ordre non décroissant (tri ignoré par le site) au lieu de rater des cartes', async () => {
      const { scanner, collection, getCollectionPage } = setup([dated(['A', 10])]);
      await scanner.run();
      getCollectionPage.mockClear();
      getCollectionPage.mockImplementation(async () => dated(['X', 5], ['Y', 50]));

      await scanner.run();

      expect(await scanner.state()).toMatchObject({ status: 'error', lastObtainedAt: 10 });
      expect((await collection.list()).map((c) => c.slug)).toEqual(['A']);

      // Après l'erreur, on retente en incrémental (pas de reprise d'un parcours complet).
      getCollectionPage.mockClear();
      getCollectionPage.mockImplementation(async () => dated(['N', 20], ['A', 10]));
      await scanner.run();
      expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0]);
      expect(await scanner.state()).toMatchObject({ status: 'done', lastObtainedAt: 20 });
    });

    it('lit tout quand les entrées n’ont pas de date (repli sur le parcours complet)', async () => {
      const { scanner, getCollectionPage } = setup([dated(['A', 10])]);
      await scanner.run();
      getCollectionPage.mockClear();
      getCollectionPage.mockImplementation(async (index: number) => (index < 2 ? page(`P${index}`) : EMPTY));

      await scanner.run();

      expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 1, 2]);
    });

    it('un parcours complet interrompu reprend à sa page sans perdre la date la plus récente', async () => {
      const { scanner, getCollectionPage } = setup([dated(['A', 30]), new Error('panne')]);
      await scanner.run();
      expect(await scanner.state()).toMatchObject({ status: 'error', nextPage: 1, pendingObtainedAt: 30 });

      getCollectionPage.mockClear();
      getCollectionPage.mockImplementation(async (index: number) => (index === 1 ? dated(['B', 10]) : EMPTY));
      await scanner.run();

      expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([1, 2]);
      expect(await scanner.state()).toMatchObject({ status: 'done', lastObtainedAt: 30 });
    });
  });

  describe('exemplaires périmés', () => {
    const HOUR = 3_600_000;

    it('relit tout quand le dernier parcours complet date de plus d’une heure (une carte vendue n’est jamais décomptée autrement)', async () => {
      let clock = 1_000_000;
      const { scanner, getCollectionPage } = setup([dated(['A', 1])], { now: () => clock });
      await scanner.run();
      expect(await scanner.state()).toMatchObject({ status: 'done', fullAt: 1_000_000 });

      clock += HOUR - 1_000;
      getCollectionPage.mockClear();
      await scanner.run();
      expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0]);
      expect(await scanner.state()).toMatchObject({ fullAt: 1_000_000 });

      clock += 2_000;
      getCollectionPage.mockClear();
      await scanner.run();
      expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 1]);
      expect(await scanner.state()).toMatchObject({ status: 'done', fullAt: clock });
    });

    it('recompte depuis zéro : un exemplaire disparu n’est plus compté', async () => {
      let clock = 1_000_000;
      // Comme l'API réelle : une carte par titre, avec son nombre d'exemplaires.
      const twice: CollectionPage = { cards: [{ ...card('A'), copies: 2 }], obtained: [{ slug: 'A', at: 2 }, { slug: 'A', at: 1 }], entries: 2, skipped: 0 };
      const once: CollectionPage = { cards: [{ ...card('A'), copies: 1 }], obtained: [{ slug: 'A', at: 2 }], entries: 1, skipped: 0 };
      const { scanner, collection, getCollectionPage } = setup([twice], { now: () => clock });
      await scanner.run();
      expect((await collection.list()).find((c) => c.slug === 'A')?.copies).toBe(2);

      clock += 2 * HOUR;
      getCollectionPage.mockImplementation(async (index: number) => (index === 0 ? once : EMPTY));
      await scanner.run();
      expect((await collection.list()).find((c) => c.slug === 'A')?.copies).toBe(1);
    });

    it('un parcours terminé sans date de parcours complet (ancien état) est refait', async () => {
      const { scanner, store, getCollectionPage } = setup([dated(['A', 1])]);
      await store.set('collectionScan', { status: 'done', nextPage: 0, entries: 1, updatedAt: 1, version: 8, pass: 'full', lastObtainedAt: 1 });
      await scanner.run();
      expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 1]);
    });

    it('une mise à jour incrémentale interrompue ne reprend pas comme un parcours complet', async () => {
      const { scanner, store, getCollectionPage } = setup([dated(['A', 1])], { now: () => 10_000_000 });
      await store.set('collectionScan', { status: 'error', nextPage: 0, entries: 1, updatedAt: 1, version: 8, pass: 'incremental', lastObtainedAt: 1, fullAt: 1 });
      await scanner.run();
      expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 1]);
    });
  });

  it('refait un parcours terminé avec une ancienne version du scan', async () => {
    const { scanner, store, getCollectionPage } = setup([page('A')]);
    await store.set('collectionScan', { status: 'done', nextPage: 5, entries: 250, updatedAt: 1, version: 2, lastObtainedAt: 5 });

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
    const fresh: ScanState = { status: 'running', nextPage: 4, entries: 200, updatedAt: 1_000_000 - 10_000, version: 8, pass: 'full' };
    const stale: ScanState = { status: 'running', nextPage: 4, entries: 200, updatedAt: 1_000_000 - 120_000, version: 8, pass: 'full' };

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

  it('un force demandé pendant un scan en cours relance un parcours complet une fois celui-ci terminé', async () => {
    const { scanner, getCollectionPage } = setup([dated(['A', 1])]);
    await scanner.run();
    getCollectionPage.mockClear();

    // Le premier appel est une mise à jour incrémentale (une page) ; le force doit ensuite tout relire.
    const first = scanner.run();
    const forced = scanner.run({ force: true });
    await forced;
    expect(getCollectionPage.mock.calls.map(([index]) => index)).toEqual([0, 0, 1]);
    await first;
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
      const saved: ScanState = { status: 'running', nextPage: 4, entries: 200, updatedAt, version: 8, pass: 'full' };
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
