import { describe, expect, it } from 'vitest';
import {
  findBySlug,
  mergeObservation,
  slugToTitle,
  summarize,
  wikipediaSlug,
  type MarketState,
} from '../../../src/core/market/market-book';
import type { MarketAuction } from '../../../src/core/market/schemas';

const NOW = Date.parse('2026-09-30T09:50:00Z');
const MIN = 60_000;

function auction(overrides: Partial<MarketAuction> & { id: string }): MarketAuction {
  return {
    card_id: 'card-1',
    status: 'active',
    end_at: new Date(NOW + 10 * MIN).toISOString(),
    effective_bid: 10,
    current_bidder_id: null,
    is_shiny: false,
    snapshot_rarity: 'SR',
    card: { wikipedia_title: 'Ted Lasso', wikipedia_url: 'https://fr.wikipedia.org/wiki/Ted_Lasso' },
    ...overrides,
  };
}

describe('wikipediaSlug', () => {
  it('décode les accents et unifie espaces et underscores', () => {
    expect(wikipediaSlug('https://fr.wikipedia.org/wiki/Th%C3%A9or%C3%A8me_de_Ptol%C3%A9m%C3%A9e')).toBe(
      'Théorème_de_Ptolémée',
    );
    expect(wikipediaSlug('https://fr.wikipedia.org/wiki/Ted Lasso')).toBe('Ted_Lasso');
  });

  it('renvoie null pour une URL qui n’est pas un article Wikipédia', () => {
    expect(wikipediaSlug('https://example.com/wiki/Ted_Lasso')).toBeNull();
    expect(wikipediaSlug('https://fr.wikipedia.org/w/index.php')).toBeNull();
    expect(wikipediaSlug('pas une url')).toBeNull();
  });
});

describe('slugToTitle', () => {
  it('redonne le titre lisible d’un article', () => {
    expect(slugToTitle('Théorème_de_Ptolémée')).toBe('Théorème de Ptolémée');
  });
});

describe('mergeObservation / summarize', () => {
  it('agrège offres, mises et prix par carte', () => {
    const state = mergeObservation(
      {},
      [
        auction({ id: 'a1', effective_bid: 10 }),
        auction({ id: 'a2', effective_bid: 30, current_bidder_id: 'x' }),
      ],
      NOW,
    );
    const [card] = findBySlug(state, 'Ted_Lasso', NOW);
    expect(card && summarize(card, NOW)).toEqual({
      offerCount: 2,
      bidCount: 1,
      avgPrice: 20,
      minPrice: 10,
      seenAt: NOW,
    });
  });

  it('remplace une offre déjà connue (mise à jour du prix) sans la dupliquer', () => {
    const first = mergeObservation({}, [auction({ id: 'a1', effective_bid: 10 })], NOW);
    const second = mergeObservation(
      first,
      [auction({ id: 'a1', effective_bid: 25, current_bidder_id: 'x' })],
      NOW + MIN,
    );
    const [card] = findBySlug(second, 'Ted_Lasso', NOW + MIN);
    expect(card?.offers).toEqual([{ id: 'a1', price: 25, endAt: NOW + 10 * MIN, hasBid: true }]);
  });

  it('cumule les offres vues sur des pages différentes', () => {
    const page1 = mergeObservation({}, [auction({ id: 'a1' })], NOW);
    const page2 = mergeObservation(page1, [auction({ id: 'a2' })], NOW + MIN);
    expect(findBySlug(page2, 'Ted_Lasso', NOW + MIN)[0]?.offers).toHaveLength(2);
  });

  it('purge les offres terminées et retire une offre devenue non active', () => {
    const first = mergeObservation(
      {},
      [auction({ id: 'a1', end_at: new Date(NOW + MIN).toISOString() }), auction({ id: 'a2' })],
      NOW,
    );
    const later = mergeObservation(first, [auction({ id: 'a2', status: 'settled_sold' })], NOW + 2 * MIN);
    const [card] = findBySlug(later, 'Ted_Lasso', NOW + 2 * MIN);
    expect(card?.offers).toEqual([]);
    expect(card && summarize(card, NOW + 2 * MIN)).toBeNull();
  });

  it('ne compte pas une offre expirée à la lecture même sans nouvelle observation', () => {
    const state = mergeObservation({}, [auction({ id: 'a1' })], NOW);
    const [card] = findBySlug(state, 'Ted_Lasso', NOW + 11 * MIN);
    expect(card && summarize(card, NOW + 11 * MIN)).toBeNull();
  });

  it('sépare les variantes shiny d’une même carte', () => {
    const state = mergeObservation(
      {},
      [auction({ id: 'a1' }), auction({ id: 'a2', is_shiny: true, effective_bid: 90 })],
      NOW,
    );
    const cards = findBySlug(state, 'Ted_Lasso', NOW);
    expect(cards.map((c) => [c.isShiny, c.offers.length])).toEqual([
      [false, 1],
      [true, 1],
    ]);
  });

  it('oublie une carte sans offre observée depuis plus de 24 h', () => {
    const first: MarketState = mergeObservation(
      {},
      [auction({ id: 'a1', end_at: new Date(NOW + MIN).toISOString() })],
      NOW,
    );
    const later = mergeObservation(first, [], NOW + 25 * 60 * MIN);
    expect(findBySlug(later, 'Ted_Lasso', NOW + 25 * 60 * MIN)).toEqual([]);
  });

  it('garde une carte vide récente pour distinguer « plus d’offre » de « jamais vue »', () => {
    const first = mergeObservation(
      {},
      [auction({ id: 'a1', end_at: new Date(NOW + MIN).toISOString() })],
      NOW,
    );
    const later = mergeObservation(first, [], NOW + 5 * MIN);
    const [card] = findBySlug(later, 'Ted_Lasso', NOW + 5 * MIN);
    expect(card).toMatchObject({ offers: [], seenAt: NOW });
  });

  it('ignore une enchère dont la date de fin est illisible', () => {
    const state = mergeObservation({}, [auction({ id: 'a1', end_at: 'n’importe quoi' })], NOW);
    expect(findBySlug(state, 'Ted_Lasso', NOW)).toEqual([]);
  });

  it('ne modifie pas l’état reçu', () => {
    const state: MarketState = {};
    mergeObservation(state, [auction({ id: 'a1' })], NOW);
    expect(state).toEqual({});
  });
});
