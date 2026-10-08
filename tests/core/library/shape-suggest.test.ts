import { describe, expect, it } from 'vitest';
import { suggestShape } from '../../../src/core/library/shape-suggest';

describe('forme conseillée', () => {
  it('suit la catégorie de la carte', () => {
    expect(suggestShape('music')).toEqual({ shelf: 'cd', wall: 'vinyl' });
    expect(suggestShape('film')).toEqual({ shelf: 'dvd', wall: 'poster' });
    expect(suggestShape('games')).toEqual({ shelf: 'game', wall: 'poster' });
    expect(suggestShape('books')).toEqual({ shelf: 'book', wall: 'sleeve-frame' });
    expect(suggestShape('other')).toEqual({ shelf: 'book', wall: 'poster' });
  });
});
