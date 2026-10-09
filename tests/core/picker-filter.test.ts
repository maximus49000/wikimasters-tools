import { describe, expect, it } from 'vitest';
import type { KnownCard } from '../../src/core/collection/collection-book';
import { EMPTY_KINDS } from '../../src/core/kinds/kinds-book';
import { NO_PICKER_FILTER, applyPickerFilter, isPickerFilterActive, rarityOptions, tagOptions } from '../../src/core/library/picker-filter';

const A: KnownCard = { slug: 'A', title: 'A', rarity: 'C', tags: [{ id: '1', name: 'Rock' }] };
const B: KnownCard = { slug: 'B', title: 'B', rarity: 'UR', tags: [{ id: '1', name: 'Rock' }, { name: 'Pop' }] };
const C: KnownCard = { slug: 'C', title: 'C', rarity: 'UR' };

describe('picker-filter', () => {
  it('sans filtre : toutes les cartes, filtre inactif', () => {
    expect(isPickerFilterActive(NO_PICKER_FILTER)).toBe(false);
    expect(applyPickerFilter([A, B, C], EMPTY_KINDS, NO_PICKER_FILTER)).toHaveLength(3);
  });

  it('rareté et étiquette se combinent', () => {
    const urRock = applyPickerFilter([A, B, C], EMPTY_KINDS, { ...NO_PICKER_FILTER, rarity: 'UR', tag: '1' });
    expect(urRock.map((c) => c.slug)).toEqual(['B']);
    expect(applyPickerFilter([A, B, C], EMPTY_KINDS, { ...NO_PICKER_FILTER, rarity: 'UR' }).map((c) => c.slug)).toEqual(['B', 'C']);
  });

  it('étiquette sans id : reconnue par son nom', () => {
    expect(applyPickerFilter([A, B], EMPTY_KINDS, { ...NO_PICKER_FILTER, tag: 'Pop' }).map((c) => c.slug)).toEqual(['B']);
  });

  it('options : raretés de la plus rare à la plus commune, étiquettes les plus utilisées d’abord', () => {
    expect(rarityOptions([A, B, C]).map((o) => [o.id, o.count])).toEqual([['UR', 2], ['C', 1]]);
    expect(tagOptions([A, B, C]).map((o) => [o.id, o.count])).toEqual([['1', 2], ['Pop', 1]]);
  });
});
