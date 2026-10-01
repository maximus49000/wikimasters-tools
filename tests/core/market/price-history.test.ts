import { describe, expect, it } from 'vitest';
import {
  emptyHistory,
  hourRows,
  recordSnapshot,
  seriesFor,
  trendOf,
  weekAverage,
} from '../../../src/core/market/price-history';
import type { MarketAuction } from '../../../src/core/market/schemas';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.parse('2026-09-30T10:00:00Z');
const KEY = 'card-1|0';

function auction(id: string, price: number, endInMs: number, bid: boolean, now = T0): MarketAuction {
  return {
    id,
    card_id: 'card-1',
    status: 'active',
    end_at: new Date(now + endInMs).toISOString(),
    effective_bid: price,
    current_bidder_id: bid ? 'b' : null,
    is_shiny: false,
    snapshot_rarity: 'SR',
    card: { wikipedia_title: 'Ted Lasso', wikipedia_url: 'https://fr.wikipedia.org/wiki/Ted_Lasso' },
  };
}

describe('recordSnapshot', () => {
  it('calcule la moyenne des seules enchères avec mise', () => {
    const state = recordSnapshot(
      emptyHistory(),
      [auction('a', 100, HOUR, true), auction('b', 200, HOUR, true), auction('c', 10, HOUR, false)],
      T0,
    );
    expect(state.cards[KEY]!.slug).toBe('Ted_Lasso');
    expect(state.cards[KEY]!.samples).toEqual([{ t: T0, avgBid: 150, bidCount: 2, minBid: 100, maxBid: 200 }]);
  });

  it('n’ajoute pas de point quand aucune enchère n’a de mise', () => {
    const state = recordSnapshot(emptyHistory(), [auction('a', 10, HOUR, false)], T0);
    expect(state.cards[KEY]!.samples).toEqual([]);
  });

  it('ignore les enchères terminées ou non actives', () => {
    const ended = auction('a', 10, -HOUR, true);
    const sold = { ...auction('b', 10, HOUR, true), status: 'settled_sold' };
    expect(recordSnapshot(emptyHistory(), [ended, sold], T0).cards).toEqual({});
  });

  it('élague les points de plus de 7 jours', () => {
    let state = recordSnapshot(emptyHistory(), [auction('a', 100, HOUR, true)], T0);
    const later = T0 + 8 * DAY;
    state = recordSnapshot(state, [auction('a', 120, HOUR, true, later)], later);
    expect(state.cards[KEY]!.samples.map((s) => s.avgBid)).toEqual([120]);
  });
});

describe('tranches d’heures restantes', () => {
  it('range 7 h 11 dans la tranche 7 et cumule nombre, min, max, moyenne', () => {
    let state = recordSnapshot(
      emptyHistory(),
      [auction('a', 100, 7 * HOUR + 11 * 60_000, true), auction('b', 300, 7 * HOUR + 50 * 60_000, false)],
      T0,
    );
    const later = T0 + 1_800_000;
    state = recordSnapshot(state, [auction('a', 200, 7 * HOUR + 5 * 60_000, true, later)], later);
    expect(hourRows(state.cards[KEY]!)).toEqual([{ hour: 7, n: 3, min: 100, max: 300, avg: 200 }]);
  });

  it('trie par tranche et sépare 0 h', () => {
    const state = recordSnapshot(
      emptyHistory(),
      [auction('a', 5, 40 * 60_000, false), auction('b', 9, 3 * HOUR + 1, false)],
      T0,
    );
    expect(hourRows(state.cards[KEY]!).map((r) => r.hour)).toEqual([0, 3]);
  });
});

describe('weekAverage et trendOf', () => {
  it('moyenne les points des 7 derniers jours', () => {
    let state = recordSnapshot(emptyHistory(), [auction('a', 100, HOUR, true)], T0);
    state = recordSnapshot(state, [auction('a', 200, HOUR, true, T0 + DAY)], T0 + DAY);
    expect(weekAverage(state.cards[KEY]!, T0 + DAY)).toBe(150);
  });

  it('renvoie null sans point', () => {
    const state = recordSnapshot(emptyHistory(), [auction('a', 10, HOUR, false)], T0);
    expect(weekAverage(state.cards[KEY]!, T0)).toBeNull();
  });

  it('compare les deux derniers points', () => {
    const step = 1_800_000;
    let state = recordSnapshot(emptyHistory(), [auction('a', 100, HOUR, true)], T0);
    expect(trendOf(state.cards[KEY]!)).toBeNull();
    state = recordSnapshot(state, [auction('a', 120, HOUR, true, T0 + step)], T0 + step);
    expect(trendOf(state.cards[KEY]!)).toBe('up');
    state = recordSnapshot(state, [auction('a', 90, HOUR, true, T0 + 2 * step)], T0 + 2 * step);
    expect(trendOf(state.cards[KEY]!)).toBe('down');
    state = recordSnapshot(state, [auction('a', 90, HOUR, true, T0 + 3 * step)], T0 + 3 * step);
    expect(trendOf(state.cards[KEY]!)).toBe('flat');
  });
});

describe('cumul par jour et vues du graphique', () => {
  it('cumule moyenne, min et max de la journée, un point par jour', () => {
    let state = recordSnapshot(emptyHistory(), [auction('a', 100, HOUR, true)], T0);
    const later = T0 + 1_800_000;
    state = recordSnapshot(state, [auction('a', 300, HOUR, true, later)], later);
    const next = T0 + DAY;
    state = recordSnapshot(state, [auction('a', 50, HOUR, true, next)], next);
    const days = state.cards[KEY]!.days!;
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ n: 2, sum: 400, min: 100, max: 300 });
  });

  it('ne modifie pas l’état précédent', () => {
    const before = recordSnapshot(emptyHistory(), [auction('a', 100, HOUR, true)], T0);
    const snapshot = JSON.stringify(before);
    recordSnapshot(before, [auction('a', 300, HOUR, true)], T0 + 60_000);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('garde les jours 365 jours alors que les relevés fins n’en gardent que 7', () => {
    let state = recordSnapshot(emptyHistory(), [auction('a', 100, HOUR, true)], T0);
    const later = T0 + 30 * DAY;
    state = recordSnapshot(state, [auction('a', 200, HOUR, true, later)], later);
    expect(state.cards[KEY]!.samples).toHaveLength(1);
    expect(state.cards[KEY]!.days).toHaveLength(2);
  });

  it('jour et semaine lisent les relevés, mois et année lisent les jours', () => {
    let state = recordSnapshot(emptyHistory(), [auction('a', 100, HOUR, true)], T0);
    const t1 = T0 + 3 * DAY;
    state = recordSnapshot(state, [auction('a', 200, HOUR, true, t1)], t1);
    const card = state.cards[KEY]!;
    expect(seriesFor(card, 'day', t1).map((p) => p.avgBid)).toEqual([200]);
    expect(seriesFor(card, 'week', t1).map((p) => p.avgBid)).toEqual([100, 200]);
    expect(seriesFor(card, 'month', t1).map((p) => p.avgBid)).toEqual([100, 200]);
    expect(seriesFor(card, 'year', t1 + 40 * DAY).map((p) => p.avgBid)).toEqual([100, 200]);
    expect(seriesFor(card, 'month', t1 + 40 * DAY)).toEqual([]);
  });

  it('ne plante pas sur un historique ancien sans jours', () => {
    const old = { slug: 's', rarity: 'R', hours: {}, samples: [{ t: T0, avgBid: 5, bidCount: 1 }] };
    expect(seriesFor(old, 'year', T0)).toEqual([]);
  });
});
