import { emptyHistory, type HistoryState } from '../core/market/price-history';

// Ce que l'extension sait du marché pour les cartes : relevés des enchères, et cartes en attente de relevé.
export type MarketSnapshot = { history: HistoryState; pending: ReadonlySet<string> };

export type MarketSource = {
  snapshot(): MarketSnapshot;
  subscribe(listener: () => void): () => void;
};

// Une nouvelle valeur remplace l'ancienne (jamais de mutation) : `snapshot()` change quand le marché change.
export function createMarketSource() {
  let current: MarketSnapshot = { history: emptyHistory(), pending: new Set() };
  const listeners = new Set<() => void>();
  const source: MarketSource = {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return {
    source,
    update(change: Partial<MarketSnapshot>): void {
      current = { ...current, ...change };
      for (const listener of listeners) listener();
    },
  };
}
