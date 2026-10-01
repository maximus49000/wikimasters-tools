import type { GameApi } from '../api/game-api';
import type { MarketAuction } from './schemas';

export const POLL_INTERVAL_MS = 30 * 60_000;
// Garde-fou : le marché ne devrait jamais compter autant de pages.
const MAX_PAGES = 100;

// Lit toutes les pages d'enchères actives, comme le fait la page Marché.
// Toute erreur (déconnexion, 429 persistant, format) abandonne le relevé : un relevé partiel fausserait les moyennes.
export async function fetchFullMarket(
  api: Pick<GameApi, 'getMarketPage'>,
): Promise<MarketAuction[]> {
  const auctions: MarketAuction[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await api.getMarketPage(page);
    auctions.push(...result.auctions);
    if (!result.hasMore) return auctions;
  }
  throw new Error(`marché : plus de ${MAX_PAGES} pages, relevé abandonné`);
}

export type MarketWatchDeps = {
  poll: () => Promise<void>;
  lastPollAt: () => Promise<number>;
  now: () => number;
  isVisible: () => boolean;
};

// Appelée régulièrement : lance un relevé s'il est dû, jamais deux en même temps.
export function createMarketWatcher(deps: MarketWatchDeps) {
  let running = false;
  return {
    async tick(): Promise<'ran' | 'skipped'> {
      if (running || !deps.isVisible()) return 'skipped';
      running = true;
      try {
        if (deps.now() - (await deps.lastPollAt()) < POLL_INTERVAL_MS) return 'skipped';
        await deps.poll();
        return 'ran';
      } finally {
        running = false;
      }
    },
  };
}
