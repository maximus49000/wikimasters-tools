import { describe, expect, it } from 'vitest';
import { createGameApi, type FetchLike } from '../../../src/core/api/game-api';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createHistoryRepo } from '../../../src/core/market/history-repo';
import { createMarketCollector, POLL_INTERVAL_MS } from '../../../src/core/market/market-poll';
import type { MarketAuction } from '../../../src/core/market/schemas';

const T0 = Date.parse('2026-09-30T10:00:00Z');
const MIN = 60_000;

function auction(id: string, price: number): MarketAuction {
  return {
    id,
    card_id: 'card-1',
    status: 'active',
    end_at: new Date(T0 + 3_600_000 * 5).toISOString(),
    effective_bid: price,
    current_bidder_id: 'b',
    is_shiny: false,
    snapshot_rarity: 'SR',
    card: { wikipedia_title: 'Ted Lasso', wikipedia_url: 'https://fr.wikipedia.org/wiki/Ted_Lasso' },
  };
}

type PageResult = { auctions: MarketAuction[]; hasMore: boolean };

// Un marché de `pages` pages d'une enchère chacune (prix = 100 × numéro de page).
function market(pages: number) {
  const calls: number[] = [];
  const hooks = new Map<number, () => Promise<PageResult>>();
  return {
    calls,
    hooks,
    api: {
      getMarketPage: async (page: number): Promise<PageResult> => {
        calls.push(page);
        const hook = hooks.get(page);
        if (hook) return hook();
        return { auctions: [auction(`a${page}`, 100 * page)], hasMore: page < pages };
      },
    },
  };
}

// Chaque `tab(id)` simule un onglet : un collecteur neuf sur le même stockage et la même horloge.
function world(pages = 3) {
  const store = createMemoryStore();
  const clock = { now: T0 };
  const mk = market(pages);
  const history = createHistoryRepo(store, () => clock.now);
  const tab = (id: string, visible = true) =>
    createMarketCollector({
      api: mk.api,
      history,
      store,
      now: () => clock.now,
      isVisible: () => visible,
      id,
    });
  return { store, clock, mk, history, tab };
}

const samples = async (w: ReturnType<typeof world>) => (await w.history.lookup('Ted_Lasso'))[0]?.samples ?? [];

// La page 3 (par exemple) est en vol quand l'utilisateur change de page : l'onglet se décharge.
function unloadDuring(w: ReturnType<typeof world>, tab: ReturnType<typeof world>['tab'] extends (...a: never[]) => infer R ? R : never, page: number) {
  w.mk.hooks.set(page, async () => {
    tab.release();
    throw new TypeError('Failed to fetch');
  });
}

describe('collecte du marché', () => {
  it('lit toutes les pages et enregistre un seul relevé', async () => {
    const w = world(3);
    expect(await w.tab('A').tick()).toBe('ran');
    expect(w.mk.calls).toEqual([1, 2, 3]);
    expect(await samples(w)).toEqual([{ t: T0, avgBid: 200, bidCount: 3, minBid: 100, maxBid: 300 }]);
  });

  it('ne dépend d’aucune page du site : seul l’état visible de l’onglet compte', async () => {
    const w = world(1);
    expect(await w.tab('hidden', false).tick()).toBe('skipped');
    expect(w.mk.calls).toEqual([]);
    expect(await w.tab('visible', true).tick()).toBe('ran');
  });

  it('ne relève pas avant 30 min, puis relève de nouveau', async () => {
    const w = world(1);
    await w.tab('A').tick();
    w.clock.now += POLL_INTERVAL_MS - 1;
    expect(await w.tab('B').tick()).toBe('skipped');
    w.clock.now += 1;
    expect(await w.tab('C').tick()).toBe('ran');
    expect(await samples(w)).toHaveLength(2);
  });

  it('un relevé interrompu par la navigation reprend sur la page suivante sans rien relire', async () => {
    const w = world(5);
    const first = w.tab('A');
    unloadDuring(w, first, 3);
    expect(await first.tick()).toBe('interrupted');
    expect(w.mk.calls).toEqual([1, 2, 3]);
    expect(await samples(w)).toEqual([]);

    // Nouvelle page du site : un autre collecteur reprend là où le premier s'est arrêté.
    w.mk.hooks.clear();
    w.mk.calls.length = 0;
    w.clock.now += 5_000;
    expect(await w.tab('B').tick()).toBe('ran');
    expect(w.mk.calls).toEqual([3, 4, 5]);
    // Les 5 enchères, chacune une seule fois, dans un seul relevé.
    expect(await samples(w)).toEqual([{ t: w.clock.now, avgBid: 300, bidCount: 5, minBid: 100, maxBid: 500 }]);
  });

  it('survit à plusieurs navigations successives pendant un même relevé', async () => {
    const w = world(6);
    const a = w.tab('A');
    unloadDuring(w, a, 2);
    await a.tick();
    w.mk.hooks.clear();
    w.clock.now += 3_000;
    const b = w.tab('B');
    unloadDuring(w, b, 4);
    await b.tick();
    w.mk.hooks.clear();
    w.clock.now += 3_000;
    expect(await w.tab('C').tick()).toBe('ran');
    expect(w.mk.calls).toEqual([1, 2, 2, 3, 4, 4, 5, 6]);
    expect((await samples(w))[0]).toMatchObject({ bidCount: 6 });
  });

  it('une erreur due au déchargement de la page n’efface pas la progression', async () => {
    const w = world(4);
    const first = w.tab('A');
    unloadDuring(w, first, 2);
    await first.tick();
    expect(await w.store.get('market-poll')).toMatchObject({ nextPage: 2, owner: null });
  });

  it('un onglet qui relève en ce moment est respecté', async () => {
    const w = world(3);
    const a = w.tab('A');
    let other: string | undefined;
    w.mk.hooks.set(2, async () => {
      other = await w.tab('B').tick();
      return { auctions: [auction('a2', 200)], hasMore: true };
    });
    expect(await a.tick()).toBe('ran');
    expect(other).toBe('skipped');
    expect(w.mk.calls).toEqual([1, 2, 3]);
  });

  it('reprend le relevé d’un onglet mort (verrou jamais libéré) après 20 s', async () => {
    const w = world(3);
    w.mk.hooks.set(2, () => new Promise<PageResult>(() => {}));
    void w.tab('A').tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    w.mk.hooks.clear();
    w.mk.calls.length = 0;

    w.clock.now += 5_000;
    expect(await w.tab('B').tick()).toBe('skipped');
    w.clock.now += 20_000;
    expect(await w.tab('B').tick()).toBe('ran');
    expect(w.mk.calls).toEqual([2, 3]);
  });

  it('abandonne un relevé de plus de 10 min et recommence à la page 1 quand il est dû', async () => {
    const w = world(3);
    const first = w.tab('A');
    unloadDuring(w, first, 2);
    await first.tick();
    w.mk.hooks.clear();
    w.mk.calls.length = 0;
    w.clock.now += 31 * MIN;
    expect(await w.tab('B').tick()).toBe('ran');
    expect(w.mk.calls).toEqual([1, 2, 3]);
  });

  it('une vraie erreur (401, 429 persistant…) abandonne sans rien enregistrer ni réessayer avant 30 min', async () => {
    const w = world(3);
    w.mk.hooks.set(2, async () => {
      throw new Error('401');
    });
    expect(await w.tab('A').tick()).toBe('failed');
    expect(await samples(w)).toEqual([]);
    expect(await w.store.get('market-poll')).toBeNull();

    w.mk.hooks.clear();
    w.mk.calls.length = 0;
    w.clock.now += 10 * MIN;
    expect(await w.tab('B').tick()).toBe('skipped');
    expect(w.mk.calls).toEqual([]);
  });

  it('écarte les enchères vues deux fois quand la liste bouge entre deux pages', async () => {
    const w = world(2);
    w.mk.hooks.set(2, async () => ({ auctions: [auction('a1', 100), auction('a2', 200)], hasMore: false }));
    await w.tab('A').tick();
    expect((await samples(w))[0]).toMatchObject({ bidCount: 2, avgBid: 150 });
  });

  it('ne lance jamais deux relevés en même temps dans un même onglet', async () => {
    const w = world(2);
    const tab = w.tab('A');
    const results = await Promise.all([tab.tick(), tab.tick()]);
    expect(results.sort()).toEqual(['ran', 'skipped']);
    expect(w.mk.calls).toEqual([1, 2]);
  });
});

describe('createGameApi.getMarketPage', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const setup = (responses: Response[]) => {
    const calls: string[] = [];
    const queue = [...responses];
    const fetch: FetchLike = async (input) => {
      calls.push(input);
      return queue.shift() ?? json({}, 500);
    };
    return { calls, api: createGameApi({ fetch, sleep: async () => {}, now: () => 0, minIntervalMs: 0, maxRetries: 0 }) };
  };

  it('appelle la page demandée (50 par page) et lit hasMore', async () => {
    const wire = { ...auction('a', 10), end_at: auction('a', 10).end_at };
    const { api, calls } = setup([json({ auctions: [wire], hasMore: true })]);
    const page = await api.getMarketPage(2);
    expect(calls).toEqual(['/api/marketplace?page=2&limit=50']);
    expect(page.hasMore).toBe(true);
    expect(page.auctions).toHaveLength(1);
  });

  it('refuse une réponse sans hasMore, plutôt que de la prendre pour la fin du marché', async () => {
    const { api } = setup([json({ auctions: [] })]);
    await expect(api.getMarketPage(1)).rejects.toThrow();
  });

  it('propage une déconnexion', async () => {
    const { api } = setup([json({}, 401)]);
    await expect(api.getMarketPage(1)).rejects.toThrow();
  });
});

describe('historique local', () => {
  it('une tentative ratée met la date à jour sans effacer l’historique', async () => {
    const store = createMemoryStore();
    await createHistoryRepo(store, () => T0).record([auction('a', 100)]);
    const later = createHistoryRepo(store, () => T0 + MIN);
    await later.markAttempt();
    expect(await later.lastPollAt()).toBe(T0 + MIN);
    expect((await later.lookup('Ted_Lasso'))[0]?.samples).toHaveLength(1);
  });
});
