import { wikipediaSlug } from './market-book';
import type { MarketAuction } from './schemas';

export type Sample = { t: number; avgBid: number; bidCount: number };

// Cumul sur tous les relevés pour une tranche d'heures restantes ; la moyenne = sum / n.
export type HourStat = { n: number; min: number; max: number; sum: number };

export type CardHistory = {
  slug: string;
  rarity: string;
  samples: Sample[];
  hours: Record<string, HourStat>;
};

// Clé : `${cardId}|${shiny}`, comme l'état du marché.
export type HistoryState = {
  lastPollAt: number;
  cards: Record<string, CardHistory>;
};

export type HourRow = { hour: number; n: number; min: number; max: number; avg: number };

const HOUR_MS = 3_600_000;
export const SAMPLE_RETENTION_MS = 7 * 24 * HOUR_MS;

export const emptyHistory = (): HistoryState => ({ lastPollAt: 0, cards: {} });

// Un relevé doit être complet (toutes les pages) : sur un échantillon partiel, la moyenne serait faussée.
export function recordSnapshot(
  state: HistoryState,
  auctions: MarketAuction[],
  now: number,
): HistoryState {
  const cards: Record<string, CardHistory> = {};
  for (const [key, card] of Object.entries(state.cards)) {
    cards[key] = { ...card, samples: [...card.samples], hours: { ...card.hours } };
  }

  const bids = new Map<string, number[]>();
  for (const auction of auctions) {
    const endAt = Date.parse(auction.end_at);
    const slug = wikipediaSlug(auction.card.wikipedia_url);
    if (auction.status !== 'active' || Number.isNaN(endAt) || endAt <= now || slug === null) continue;

    const key = `${auction.card_id}|${auction.is_shiny ? 1 : 0}`;
    const card = (cards[key] ??= { slug, rarity: auction.snapshot_rarity, samples: [], hours: {} });
    const hour = String(Math.floor((endAt - now) / HOUR_MS));
    const stat = card.hours[hour];
    const price = auction.effective_bid;
    card.hours[hour] = stat
      ? { n: stat.n + 1, min: Math.min(stat.min, price), max: Math.max(stat.max, price), sum: stat.sum + price }
      : { n: 1, min: price, max: price, sum: price };

    if (auction.current_bidder_id !== null) bids.set(key, [...(bids.get(key) ?? []), price]);
  }

  for (const [key, prices] of bids) {
    const total = prices.reduce((sum, p) => sum + p, 0);
    cards[key]!.samples.push({ t: now, avgBid: Math.round(total / prices.length), bidCount: prices.length });
  }

  for (const card of Object.values(cards)) {
    card.samples = card.samples.filter((s) => now - s.t <= SAMPLE_RETENTION_MS);
  }
  return { lastPollAt: state.lastPollAt, cards };
}

export function weekAverage(card: CardHistory, now: number): number | null {
  const recent = card.samples.filter((s) => now - s.t <= SAMPLE_RETENTION_MS);
  if (recent.length === 0) return null;
  return Math.round(recent.reduce((sum, s) => sum + s.avgBid, 0) / recent.length);
}

// Dernier relevé comparé au précédent ; rien si égal ou si l'historique est trop court.
export function trendOf(card: CardHistory): 'up' | 'down' | null {
  const [previous, last] = card.samples.slice(-2);
  if (!previous || !last) return null;
  if (last.avgBid > previous.avgBid) return 'up';
  if (last.avgBid < previous.avgBid) return 'down';
  return null;
}

export function hourRows(card: CardHistory): HourRow[] {
  return Object.entries(card.hours)
    .map(([hour, s]) => ({ hour: Number(hour), n: s.n, min: s.min, max: s.max, avg: Math.round(s.sum / s.n) }))
    .sort((a, b) => a.hour - b.hour);
}

// Version synchrone, sur un état déjà chargé : sert à décorer la page sans attendre le stockage.
export function cardsForSlug(state: HistoryState, slug: string): CardHistory[] {
  return Object.entries(state.cards)
    .filter(([, card]) => card.slug === slug)
    .sort(([a], [b]) => Number(a.endsWith('|1')) - Number(b.endsWith('|1')))
    .map(([, card]) => card);
}
