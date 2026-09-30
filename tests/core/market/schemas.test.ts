import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/market-response.json';
import { parseMarketAuctions } from '../../../src/core/market/schemas';

describe('parseMarketAuctions', () => {
  it('lit les enchères de `auctions` et écarte les entrées invalides', () => {
    const { auctions, skipped } = parseMarketAuctions(fixture);
    expect(auctions.map((a) => a.id)).toEqual([
      'a0000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000002',
    ]);
    expect(skipped).toBe(1);
    expect(auctions[0]).toMatchObject({
      card_id: 'c0000000-0000-4000-8000-0000000000aa',
      effective_bid: 48,
      current_bidder_id: 'b0000000-0000-4000-8000-000000000001',
      card: { wikipedia_title: 'Théorème de Ptolémée' },
    });
  });

  it('ne conserve aucun pseudo de joueur', () => {
    const { auctions } = parseMarketAuctions(fixture);
    expect(JSON.stringify(auctions)).not.toContain('fictif');
  });

  it('renvoie une liste vide si la réponse n’a pas de tableau `auctions`', () => {
    expect(parseMarketAuctions({ selling: [] })).toEqual({ auctions: [], skipped: 0 });
    expect(parseMarketAuctions(null)).toEqual({ auctions: [], skipped: 0 });
    expect(parseMarketAuctions('x')).toEqual({ auctions: [], skipped: 0 });
  });
});
