import { describe, expect, it } from 'vitest';
import { extractCards } from '../../../src/core/api/collection-schemas';

describe('extractCards', () => {
  it('lit les cartes d’une réponse de pack, où qu’elles soient', () => {
    const cards = extractCards({
      ok: true,
      result: { cards: [{ wikipedia_title: 'Tour Eiffel', rarity: 'R', image_url: 'https://x/y.jpg', atk: 12, def: 30 }, { card: { wikipedia_title: 'Paris', category: 'ville' } }] },
    });
    expect(cards).toEqual([
      { slug: 'Tour_Eiffel', title: 'Tour Eiffel', rarity: 'R', imageUrl: 'https://x/y.jpg', attack: 12, defense: 30 },
      { slug: 'Paris', title: 'Paris', extract: 'ville' },
    ]);
  });

  it('ignore une réponse sans carte', () => {
    expect(extractCards({ ok: true })).toEqual([]);
    expect(extractCards(null)).toEqual([]);
  });
});
