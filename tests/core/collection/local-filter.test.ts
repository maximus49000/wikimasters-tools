import { describe, expect, it } from 'vitest';
import { filterLocally, filterProvisionally } from '../../../src/core/collection/local-filter';
import type { KnownCard } from '../../../src/core/collection/collection-book';

const cards: KnownCard[] = [
  { slug: 'A', title: 'A', rarity: 'UR', tags: [{ id: 't1', name: '#X' }] },
  { slug: 'B', title: 'B', rarity: 'SR', tags: [{ id: 't1', name: '#X' }, { id: 't2', name: '#Y' }] },
  { slug: 'C', title: 'C', rarity: 'UR', tags: [] },
];

describe('filterLocally', () => {
  it('filtre par étiquette, par rareté, ou les deux', () => {
    expect([...filterLocally(cards, 'tag_id=t1')!]).toEqual(['A', 'B']);
    expect([...filterLocally(cards, 'rarity=UR')!]).toEqual(['A', 'C']);
    expect([...filterLocally(cards, 'rarity=UR&tag_id=t1')!]).toEqual(['A']);
  });

  it('garde les cartes de chacune des raretés choisies (paramètre répété)', () => {
    expect([...filterLocally(cards, 'rarity=SR&rarity=UR')!]).toEqual(['A', 'B', 'C']);
    expect([...filterLocally(cards, 'rarity=SR&rarity=UR&tag_id=t1')!]).toEqual(['A', 'B']);
  });

  it('rend null quand il faut interroger le site', () => {
    expect(filterLocally(cards, '')).toBeNull();
    expect(filterLocally(cards, 'q=paris')).toBeNull();
    expect(filterLocally(cards, 'tag_id=inconnue')).toBeNull();
    expect(filterLocally([...cards, { slug: 'D', title: 'D' }], 'tag_id=t1')).toBeNull();
  });
});

describe('filterProvisionally', () => {
  it("montre déjà les cartes connues qui passent, sans attendre la fin de la lecture du site", () => {
    const partial: KnownCard[] = [...cards, { slug: 'D', title: 'D', rarity: 'C' }, { slug: 'E', title: 'E', rarity: 'L' }];
    expect([...filterProvisionally(partial, 'rarity=L&rarity=C')!]).toEqual(['D', 'E']);
    expect([...filterProvisionally(partial, 'rarity=SR&tag_id=t2')!]).toEqual(['B']);
  });

  it("rend null pour un filtre qu'on ne sait pas lire sans le site", () => {
    expect(filterProvisionally(cards, '')).toBeNull();
    expect(filterProvisionally(cards, 'q=paris')).toBeNull();
  });
});
