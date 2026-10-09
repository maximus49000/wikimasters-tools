import { describe, expect, it } from 'vitest';
import { parseShopNames } from '../../../src/core/library/city/shops/names';

describe('parseShopNames', () => {
  it('garde les types connus, des chaînes courtes, au plus 30 par type', () => {
    expect(parseShopNames({ ok: true, names: { bar: ['Le Welsh', 42, 'x'.repeat(30)], inconnu: ['A'] } })).toEqual({ bar: ['Le Welsh'] });
    const many = Array.from({ length: 40 }, (_, i) => `N${i}`);
    expect(parseShopNames({ ok: true, names: { bakery: many } })!.bakery).toHaveLength(30);
  });
  it('refuse une forme inattendue', () => {
    expect(parseShopNames({ ok: false })).toBeNull();
    expect(parseShopNames('x')).toBeNull();
    expect(parseShopNames({ ok: true, names: [] })).toBeNull();
  });
});
