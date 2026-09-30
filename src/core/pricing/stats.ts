import type { PriceObservation } from './observations';

export type PriceStats = {
  count: number;
  median: number | null;
  min: number | null;
  max: number | null;
  trend: 'up' | 'down' | 'flat' | null;
  reliability: 'none' | 'low' | 'ok';
};

export type StatsOptions = {
  maxSales?: number;
  windowDays?: number;
  now?: Date;
};

const DAY_MS = 86_400_000;
const TREND_THRESHOLD = 0.1;

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function trendOf(newestFirst: number[]): PriceStats['trend'] {
  if (newestFirst.length < 4) return null;
  const recentCount = Math.ceil(newestFirst.length / 2);
  const recent = median(newestFirst.slice(0, recentCount));
  const previous = median(newestFirst.slice(recentCount));
  if (recent > previous * (1 + TREND_THRESHOLD)) return 'up';
  if (recent < previous * (1 - TREND_THRESHOLD)) return 'down';
  return 'flat';
}

export function computeStats(
  observations: PriceObservation[],
  options: StatsOptions = {},
): PriceStats {
  const { maxSales = 20, windowDays = 60, now = new Date() } = options;
  const cutoff = now.getTime() - windowDays * DAY_MS;
  const kept = observations
    .filter((o) => Date.parse(o.at) >= cutoff)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, maxSales);

  if (kept.length === 0) {
    return { count: 0, median: null, min: null, max: null, trend: null, reliability: 'none' };
  }

  const prices = kept.map((o) => o.price);
  return {
    count: prices.length,
    median: median(prices),
    min: Math.min(...prices),
    max: Math.max(...prices),
    trend: trendOf(prices),
    reliability: prices.length < 3 ? 'low' : 'ok',
  };
}
