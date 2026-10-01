import { describe, expect, it, vi } from 'vitest';
import { createGameApi, type FetchLike } from '../../../src/core/api/game-api';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createHistoryRepo } from '../../../src/core/market/history-repo';
import {
  createMarketWatcher,
  fetchFullMarket,
  POLL_INTERVAL_MS,
} from '../../../src/core/market/market-poll';
import type { MarketAuction } from '../../../src/core/market/schemas';

const NOW = Date.parse('2026-09-30T10:00:00Z');

function auction(id: string, price: number): Record<string, unknown> {
  return {
    id,
    card_id: 'card-1',
    status: 'active',
    end_at: new Date(NOW + 3_600_000).toISOString(),
    effective_bid: price,
    current_bidder_id: 'b',
    is_shiny: false,
    snapshot_rarity: 'SR',
    card: { wikipedia_title: 'Ted Lasso', wikipedia_url: 'https://fr.wikipedia.org/wiki/Ted_Lasso' },
  };
}

function apiWith(responses: Response[]) {
  const calls: string[] = [];
  const queue = [...responses];
  const fetch: FetchLike = async (input) => {
    calls.push(input);
    const next = queue.shift();
    if (!next) throw new Error('plus de réponse simulée');
    return next;
  };
  return { calls, api: createGameApi({ fetch, sleep: async () => {}, now: () => 0, minIntervalMs: 0 }) };
}

const page = (auctions: unknown[], hasMore: boolean, status = 200): Response =>
  new Response(JSON.stringify({ auctions, hasMore }), { status });

describe('fetchFullMarket', () => {
  it('lit les pages jusqu’à hasMore=false', async () => {
    const { api, calls } = apiWith([page([auction('a', 10)], true), page([auction('b', 20)], false)]);
    const all = await fetchFullMarket(api);
    expect(calls).toEqual(['/api/marketplace?page=1&limit=50', '/api/marketplace?page=2&limit=50']);
    expect(all.map((a: MarketAuction) => a.id)).toEqual(['a', 'b']);
  });

  it('abandonne tout le relevé si une page échoue', async () => {
    const { api } = apiWith([page([auction('a', 10)], true), page([], false, 401)]);
    await expect(fetchFullMarket(api)).rejects.toThrow();
  });

  it('refuse une réponse sans hasMore', async () => {
    const { api } = apiWith([new Response(JSON.stringify({ auctions: [] }))]);
    await expect(fetchFullMarket(api)).rejects.toThrow();
  });
});

describe('createMarketWatcher', () => {
  const make = (last: number, now = NOW, visible = true) => {
    const poll = vi.fn(async () => {});
    return {
      poll,
      watcher: createMarketWatcher({
        poll,
        lastPollAt: async () => last,
        now: () => now,
        isVisible: () => visible,
      }),
    };
  };

  it('relève quand le dernier relevé a plus de 30 min', async () => {
    const { watcher, poll } = make(NOW - POLL_INTERVAL_MS);
    expect(await watcher.tick()).toBe('ran');
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('ne relève pas avant 30 min, ni onglet masqué', async () => {
    expect(await make(NOW - POLL_INTERVAL_MS + 1).watcher.tick()).toBe('skipped');
    const hidden = make(0, NOW, false);
    expect(await hidden.watcher.tick()).toBe('skipped');
    expect(hidden.poll).not.toHaveBeenCalled();
  });

  it('ne lance jamais deux relevés en même temps', async () => {
    let release = () => {};
    const poll = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const watcher = createMarketWatcher({ poll, lastPollAt: async () => 0, now: () => NOW, isVisible: () => true });
    const first = watcher.tick();
    await Promise.resolve();
    await Promise.resolve();
    expect(await watcher.tick()).toBe('skipped');
    release();
    await first;
    expect(poll).toHaveBeenCalledTimes(1);
  });
});

describe('createHistoryRepo', () => {
  it('enregistre un relevé, la date de relevé, et relit par article', async () => {
    const repo = createHistoryRepo(createMemoryStore(), () => NOW);
    const { api } = apiWith([page([auction('a', 100), auction('b', 200)], false)]);
    await repo.record(await fetchFullMarket(api));
    expect(await repo.lastPollAt()).toBe(NOW);
    const [card] = await repo.lookup('Ted_Lasso');
    expect(card?.samples).toEqual([{ t: NOW, avgBid: 150, bidCount: 2 }]);
  });

  it('une tentative ratée met à jour la date sans effacer l’historique', async () => {
    const store = createMemoryStore();
    await createHistoryRepo(store, () => NOW).record([]);
    const later = createHistoryRepo(store, () => NOW + 60_000);
    await later.markAttempt();
    expect(await later.lastPollAt()).toBe(NOW + 60_000);
  });
});
