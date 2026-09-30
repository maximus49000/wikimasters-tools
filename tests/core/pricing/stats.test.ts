import { describe, expect, it } from 'vitest';
import type { PriceObservation } from '../../../src/core/pricing/observations';
import { computeStats, median } from '../../../src/core/pricing/stats';

const NOW = new Date('2026-09-30T12:00:00Z');
const DAY = 86_400_000;

function obs(price: number, daysAgo: number): PriceObservation {
  return {
    auctionId: `a-${price}-${daysAgo}-${Math.random()}`,
    cardId: 'c1',
    title: 'Exemple',
    rarity: 'SR',
    isShiny: false,
    price,
    at: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
    kind: 'sold',
  };
}

describe('median', () => {
  it('prend la valeur centrale (nombre impair)', () => {
    expect(median([30, 10, 20])).toBe(20);
  });
  it('arrondit la moyenne des deux valeurs centrales (nombre pair)', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([10, 11])).toBe(11);
  });
});

describe('computeStats', () => {
  it("renvoie « aucune donnée » sans transaction", () => {
    expect(computeStats([], { now: NOW })).toEqual({
      count: 0, median: null, min: null, max: null, trend: null, reliability: 'none',
    });
  });

  it('marque une seule transaction comme peu fiable', () => {
    expect(computeStats([obs(11, 1)], { now: NOW })).toEqual({
      count: 1, median: 11, min: 11, max: 11, trend: null, reliability: 'low',
    });
  });

  it('calcule médiane, min, max et fiabilité correcte à partir de 3 transactions', () => {
    const stats = computeStats([obs(10, 1), obs(30, 2), obs(20, 3)], { now: NOW });
    expect(stats).toMatchObject({ count: 3, median: 20, min: 10, max: 30, reliability: 'ok', trend: null });
  });

  it('ignore les transactions hors de la fenêtre de temps', () => {
    const stats = computeStats([obs(10, 1), obs(999, 200)], { now: NOW, windowDays: 60 });
    expect(stats.count).toBe(1);
    expect(stats.max).toBe(10);
  });

  it('ne garde que les N transactions les plus récentes', () => {
    const recent = Array.from({ length: 20 }, (_, i) => obs(10, i + 1));
    const old = Array.from({ length: 5 }, () => obs(100, 40));
    const stats = computeStats([...old, ...recent], { now: NOW, maxSales: 20 });
    expect(stats.count).toBe(20);
    expect(stats.median).toBe(10);
  });

  it('détecte une tendance à la hausse', () => {
    const stats = computeStats([obs(22, 1), obs(20, 2), obs(10, 3), obs(10, 4)], { now: NOW });
    expect(stats.trend).toBe('up');
  });

  it('détecte une tendance à la baisse', () => {
    const stats = computeStats([obs(10, 1), obs(10, 2), obs(20, 3), obs(22, 4)], { now: NOW });
    expect(stats.trend).toBe('down');
  });

  it('détecte une tendance stable', () => {
    const stats = computeStats([obs(10, 1), obs(10, 2), obs(10, 3), obs(10, 4)], { now: NOW });
    expect(stats.trend).toBe('flat');
  });
});
