import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/mine-response.json';
import { parseMineResponse } from '../../../src/core/api/schemas';
import { extractObservations } from '../../../src/core/pricing/observations';

describe('extractObservations', () => {
  it('garde les ventes et achats conclus, pas les invendus', () => {
    const observations = extractObservations(parseMineResponse(fixture));
    expect(observations).toEqual([
      {
        auctionId: 'a0000000-0000-4000-8000-000000000001',
        cardId: 'c0000000-0000-4000-8000-000000000001',
        title: 'Exemple Un',
        rarity: 'UR',
        isShiny: false,
        price: 11,
        at: '2026-09-29T06:53:08.09808+00:00',
        kind: 'sold',
      },
      {
        auctionId: 'a0000000-0000-4000-8000-000000000003',
        cardId: 'c0000000-0000-4000-8000-000000000003',
        title: 'Exemple Trois',
        rarity: 'PC',
        isShiny: false,
        price: 20,
        at: '2026-09-29T18:40:01.897162+00:00',
        kind: 'bought',
      },
    ]);
  });

  it('ne compte pas deux fois la même enchère', () => {
    const mine = parseMineResponse(fixture);
    mine.won.push(mine.history[0]!);
    const ids = extractObservations(mine).map((o) => o.auctionId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
