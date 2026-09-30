import { describe, expect, it } from 'vitest';
import { slugToTitle, titleToSlug } from '../../../src/core/market/market-book';

describe('titleToSlug', () => {
  it('remplace les espaces par des tirets bas', () => {
    expect(titleToSlug('Tour Eiffel')).toBe('Tour_Eiffel');
  });

  it('ignore les espaces en trop', () => {
    expect(titleToSlug('  Ted  Lasso ')).toBe('Ted_Lasso');
  });

  it('normalise en NFC', () => {
    expect(titleToSlug('École')).toBe('École');
  });

  it("est l'inverse de slugToTitle", () => {
    expect(slugToTitle(titleToSlug('Tour Eiffel'))).toBe('Tour Eiffel');
  });
});
