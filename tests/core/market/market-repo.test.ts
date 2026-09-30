import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../../src/core/cache/store';
import { createMarketRepo } from '../../../src/core/market/market-repo';
import type { MarketAuction } from '../../../src/core/market/schemas';

const NOW = Date.parse('2026-09-30T09:50:00Z');

function auction(id: string, price: number): MarketAuction {
  return {
    id,
    card_id: 'card-1',
    status: 'active',
    end_at: new Date(NOW + 600_000).toISOString(),
    effective_bid: price,
    current_bidder_id: null,
    is_shiny: false,
    snapshot_rarity: 'R',
    card: { wikipedia_title: 'Ted Lasso', wikipedia_url: 'https://fr.wikipedia.org/wiki/Ted_Lasso' },
  };
}

describe('createMarketRepo', () => {
  it('persiste les observations et les relit par article Wikipédia', async () => {
    const store = createMemoryStore();
    await createMarketRepo(store, () => NOW).observe([auction('a1', 12)]);

    const [card] = await createMarketRepo(store, () => NOW).lookup('Ted_Lasso');
    expect(card?.offers).toEqual([{ id: 'a1', price: 12, endAt: NOW + 600_000, hasBid: false }]);
  });

  it('ne perd aucune observation quand plusieurs arrivent en même temps', async () => {
    const repo = createMarketRepo(createMemoryStore(), () => NOW);
    await Promise.all([repo.observe([auction('a1', 12)]), repo.observe([auction('a2', 30)])]);
    const [card] = await repo.lookup('Ted_Lasso');
    expect(card?.offers.map((o) => o.id).sort()).toEqual(['a1', 'a2']);
  });

  it('renvoie une liste vide pour une carte jamais observée', async () => {
    expect(await createMarketRepo(createMemoryStore(), () => NOW).lookup('Inconnue')).toEqual([]);
  });

  it('prévient les abonnés après chaque observation enregistrée, jusqu’au désabonnement', async () => {
    const repo = createMarketRepo(createMemoryStore(), () => NOW);
    const listener = vi.fn();
    const unsubscribe = repo.subscribe(listener);

    await repo.observe([auction('a1', 12)]);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await repo.observe([auction('a2', 30)]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
