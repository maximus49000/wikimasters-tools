import { describe, expect, it } from 'vitest';
import { SHOP_TYPE_IDS, type ShopTypeId } from '../../../src/core/library/city/shops/catalog';
import { ACCESSORY, FAMILIES, FAMILY_PERIOD_S, SHOP_FAMILY, gestureAt, takesAway, type Role } from '../../../src/core/library/city/shops/gestures';

const ROLES: Role[] = ['staff', 'customer'];
const SAMPLES = Array.from({ length: 40 }, (_, i) => 0.37 + i * 0.731);
const ofFamily = (f: string): ShopTypeId[] => SHOP_TYPE_IDS.filter((t) => SHOP_FAMILY[t] === f);

describe('familles de gestes', () => {
  it('couvre les 32 types, chaque famille est utilisée', () => {
    expect(SHOP_TYPE_IDS).toHaveLength(32);
    for (const t of SHOP_TYPE_IDS) expect(FAMILIES).toContain(SHOP_FAMILY[t]);
    for (const f of FAMILIES) expect(ofFamily(f).length).toBeGreaterThan(0);
  });

  it('place les types selon le tableau du spec', () => {
    expect(SHOP_FAMILY.bakery).toBe('counter');
    expect(SHOP_FAMILY.pharmacy).toBe('counter');
    expect(SHOP_FAMILY.petshop).toBe('till');
    expect(SHOP_FAMILY.tattoo).toBe('chair');
    expect(SHOP_FAMILY.antiques).toBe('browse');
    expect(SHOP_FAMILY.tearoom).toBe('drink');
    expect(SHOP_FAMILY.sushi).toBe('table');
    expect(SHOP_FAMILY.arcade).toBe('dance');
    expect(SHOP_FAMILY.bikes).toBe('machine');
  });

  it('donne un accessoire non vide à chaque type, distinct dans une même famille', () => {
    for (const t of SHOP_TYPE_IDS) expect(ACCESSORY[t].length).toBeGreaterThan(0);
    for (const f of FAMILIES) {
      const ids = ofFamily(f).map((t) => ACCESSORY[t]);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(new Set(FAMILIES.map((f) => ACCESSORY[ofFamily(f)[0]!])).size).toBe(FAMILIES.length);
  });

  it('boucle en 6 à 14 s par famille', () => {
    for (const f of FAMILIES) {
      expect(FAMILY_PERIOD_S[f]).toBeGreaterThanOrEqual(6);
      expect(FAMILY_PERIOD_S[f]).toBeLessThanOrEqual(14);
    }
  });

  it('est déterministe et périodique', () => {
    for (const t of SHOP_TYPE_IDS) for (const role of ROLES) for (const seed of [1, 99]) {
      const P = FAMILY_PERIOD_S[SHOP_FAMILY[t]];
      for (const s of SAMPLES) {
        const a = gestureAt(t, role, s, seed);
        expect(gestureAt(t, role, s, seed)).toEqual(a);
        const b = gestureAt(t, role, s + P, seed);
        expect(b.arms).toBe(a.arms);
        expect(b.head).toBe(a.head);
        expect(b.item).toBe(a.item);
        expect(Math.abs(b.lean - a.lean)).toBeLessThan(1e-6);
        expect(Math.abs(b.sway - a.sway)).toBeLessThan(1e-6);
      }
    }
  });

  it('garde lean et sway dans [-1, 1] et déphase selon la graine', () => {
    for (const t of SHOP_TYPE_IDS) for (const role of ROLES) for (const s of SAMPLES) {
      const p = gestureAt(t, role, s, 5);
      expect(Math.abs(p.lean)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.sway)).toBeLessThanOrEqual(1);
    }
    const differs = SAMPLES.some((s) => JSON.stringify(gestureAt('bar', 'staff', s, 1)) !== JSON.stringify(gestureAt('bar', 'staff', s, 2)));
    expect(differs).toBe(true);
  });

  it('distingue employé et client au comptoir', () => {
    const differs = SAMPLES.some((s) => JSON.stringify(gestureAt('bakery', 'staff', s, 7)) !== JSON.stringify(gestureAt('bakery', 'customer', s, 7)));
    expect(differs).toBe(true);
  });

  it('fait danser la boîte de nuit et asseoir le client chez le coiffeur', () => {
    expect(SAMPLES.some((s) => gestureAt('nightclub', 'customer', s, 3).sway !== 0)).toBe(true);
    expect(SAMPLES.some((s) => gestureAt('arcade', 'staff', s, 3).sway !== 0)).toBe(true);
    for (const s of SAMPLES) expect(Math.abs(gestureAt('hairdresser', 'customer', s, 3).sway)).toBe(0);
  });

  it('emporte un objet pour counter, till et browse seulement', () => {
    for (const t of SHOP_TYPE_IDS) expect(takesAway(t)).toBe(['counter', 'till', 'browse'].includes(SHOP_FAMILY[t]));
  });
});
