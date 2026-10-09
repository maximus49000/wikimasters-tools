import { describe, expect, it } from 'vitest';
import { SHOP_DEFS, SHOP_TYPE_IDS } from '../../../src/core/library/city/shops/catalog';

describe('catalogue des commerces', () => {
  it('a 32 types, chacun décrit sous sa clé', () => {
    expect(SHOP_TYPE_IDS).toHaveLength(32);
    for (const id of SHOP_TYPE_IDS) expect(SHOP_DEFS[id].id).toBe(id);
  });
  it('donne 10 à 15 noms écrits par type, uniques dans tout le catalogue, de 24 caractères au plus', () => {
    const all: string[] = [];
    for (const id of SHOP_TYPE_IDS) {
      const names = SHOP_DEFS[id].names;
      expect(names.length).toBeGreaterThanOrEqual(10);
      expect(names.length).toBeLessThanOrEqual(15);
      for (const n of names) expect(n.length).toBeLessThanOrEqual(24);
      all.push(...names);
    }
    expect(new Set(all).size).toBe(all.length);
  });
  it('a des plages horaires ordonnées dans [0, 2880) et des jours dans 0..6', () => {
    for (const id of SHOP_TYPE_IDS) {
      const d = SHOP_DEFS[id];
      expect(d.days.length).toBeGreaterThan(0);
      for (const day of d.days) expect(day >= 0 && day <= 6).toBe(true);
      for (const [a, b] of [...d.hours, ...(d.sundayHours ?? [])]) expect(0 <= a && a < b && b < 2880).toBe(true);
    }
  });
  it('met un store au café, au fleuriste et au primeur seulement', () => {
    expect(SHOP_TYPE_IDS.filter((id) => SHOP_DEFS[id].awning).sort()).toEqual(['cafe', 'florist', 'greengrocer']);
  });
});
