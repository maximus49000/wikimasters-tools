import { describe, expect, it } from 'vitest';
import { toCardPreview } from '../../../src/core/collection/card-preview';

const CARD = { slug: 'Paris', title: 'Paris' };

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
    expect(toCardPreview(CARD, null)).toEqual({ title: 'Paris', rarity: null, imageUrl: null, extract: null, attack: null, defense: null, purchase: null });
  });
});
