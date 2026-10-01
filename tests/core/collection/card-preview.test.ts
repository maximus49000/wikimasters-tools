import { describe, expect, it } from 'vitest';
import { cardMarket, toCardPreview } from '../../../src/core/collection/card-preview';
import { emptyHistory, type HistoryState } from '../../../src/core/market/price-history';

const CARD = { slug: 'Paris', title: 'Paris' };
const NOW = Date.UTC(2026, 8, 30, 12);

describe('toCardPreview', () => {
  it('reprend titre, rareté et image de la carte connue, avec la pastille de prix', () => {
    const preview = toCardPreview(
      { ...CARD, rarity: 'SR', imageUrl: 'https://exemple.test/p.jpg' },
      { rarity: 'UR', purchase: { min: 12, max: 20 } },
    );
    expect(preview.title).toBe('Paris');
    expect(preview.rarity).toBe('SR');
    expect(preview.imageUrl).toBe('https://exemple.test/p.jpg');
    expect(preview.purchase?.label).toBe('12–20');
  });

  it("prend la rareté du carnet de prix quand la carte n'a pas la sienne", () => {
    expect(toCardPreview(CARD, { rarity: 'UR', purchase: null }).rarity).toBe('UR');
  });

  it("s'affiche sans image, sans rareté et sans prix quand rien n'est connu", () => {
    expect(toCardPreview(CARD, null)).toEqual({
      title: 'Paris',
      rarity: null,
      imageUrl: null,
      extract: null,
      attack: null,
      defense: null,
      tags: [],
      purchase: null,
      market: { history: null, loading: false },
    });
  });

  it('joint les prix du marché fournis', () => {
    const market = { history: null, loading: true };
    expect(toCardPreview(CARD, null, market).market).toBe(market);
  });
});

describe('cardMarket', () => {
  const state: HistoryState = {
    ...emptyHistory(),
    cards: { '1|0': { slug: 'Paris', rarity: 'SR', samples: [{ t: NOW - 60_000, avgBid: 40, bidCount: 3 }], hours: {} } },
  };

  it('donne la moyenne des enchères relevées, comme sur la liste', () => {
    const { history, loading } = cardMarket(state, new Set(), 'Paris', NOW);
    expect(history).toMatchObject({ kind: 'average', label: '≈ 40' });
    expect(loading).toBe(false);
  });

  it('marque la carte en attente de relevé', () => {
    expect(cardMarket(state, new Set(['Paris']), 'Paris', NOW).loading).toBe(true);
  });

  it("affiche « ??? » pour une carte de la Collection sans aucun relevé", () => {
    expect(cardMarket(emptyHistory(), new Set(), 'Paris', NOW).history).toMatchObject({ kind: 'unknown', label: '???' });
  });
});
