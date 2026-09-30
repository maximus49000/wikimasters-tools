import { describe, expect, it } from 'vitest';
import type { PriceObservation } from '../../../src/core/pricing/observations';
import { buildPriceBook, normalizeTitle } from '../../../src/core/pricing/price-book';

const NOW = new Date('2026-09-30T12:00:00Z');

function obs(partial: Partial<PriceObservation> & { price: number }): PriceObservation {
  return {
    auctionId: `a-${Math.random()}`,
    cardId: 'c1',
    title: 'Mad Max',
    rarity: 'SR',
    isShiny: false,
    at: '2026-09-29T12:00:00Z',
    kind: 'sold',
    ...partial,
  };
}

describe('normalizeTitle', () => {
  it('compacte les espaces et normalise Unicode', () => {
    expect(normalizeTitle('  Mad   Max ')).toBe('Mad Max');
    expect(normalizeTitle('Élections')).toBe('Élections');
  });
});

describe('buildPriceBook', () => {
  it('renvoie les statistiques de la carte connue', () => {
    const book = buildPriceBook([obs({ price: 10 }), obs({ price: 20 }), obs({ price: 30 })], { now: NOW });
    const entry = book.byTitle('Mad Max');
    expect(entry).toMatchObject({ cardId: 'c1', rarity: 'SR', isShiny: false });
    expect(entry?.stats.median).toBe(20);
  });

  it('retrouve un titre malgré des espaces différents', () => {
    const book = buildPriceBook([obs({ price: 10 })], { now: NOW });
    expect(book.byTitle('  Mad  Max')).not.toBeNull();
  });

  it('renvoie null pour un titre inconnu', () => {
    const book = buildPriceBook([obs({ price: 10 })], { now: NOW });
    expect(book.byTitle('Inconnu')).toBeNull();
  });

  it("renvoie null quand un titre est ambigu (brillante et normale)", () => {
    const book = buildPriceBook(
      [obs({ price: 10, isShiny: false }), obs({ price: 90, isShiny: true })],
      { now: NOW },
    );
    expect(book.byTitle('Mad Max')).toBeNull();
  });
});
