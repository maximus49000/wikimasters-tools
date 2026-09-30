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

describe('buildPriceBook — prix d\'achat', () => {
  it('donne min et max des achats uniquement', () => {
    const book = buildPriceBook(
      [obs({ price: 6, kind: 'bought' }), obs({ price: 3, kind: 'bought' }), obs({ price: 50, kind: 'sold' })],
      { now: NOW },
    );
    expect(book.byTitle('Mad Max')?.purchase).toEqual({ min: 3, max: 6 });
  });

  it("vaut null quand la carte n'a été que vendue", () => {
    const book = buildPriceBook([obs({ price: 10, kind: 'sold' })], { now: NOW });
    expect(book.byTitle('Mad Max')?.purchase).toBeNull();
  });

  it("n'est pas influencé par les ventes", () => {
    const book = buildPriceBook(
      [obs({ price: 4, kind: 'bought' }), obs({ price: 1, kind: 'sold' }), obs({ price: 99, kind: 'sold' })],
      { now: NOW },
    );
    expect(book.byTitle('Mad Max')?.purchase).toEqual({ min: 4, max: 4 });
  });

  it('compte aussi les achats anciens (sans fenêtre de 60 jours)', () => {
    const old = new Date(NOW.getTime() - 200 * 86_400_000).toISOString();
    const book = buildPriceBook([obs({ price: 2, kind: 'bought', at: old })], { now: NOW });
    expect(book.byTitle('Mad Max')?.purchase).toEqual({ min: 2, max: 2 });
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
