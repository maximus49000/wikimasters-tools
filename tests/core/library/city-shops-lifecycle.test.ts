import { describe, expect, it } from 'vitest';
import { SHOP_DEFS, SHOP_TYPE_IDS } from '../../../src/core/library/city/shops/catalog';
import { isWorkday } from '../../../src/core/library/city/shops/hours';
import { streetOn, type SlotDay } from '../../../src/core/library/city/shops/lifecycle';
import { shopSlotsFor } from '../../../src/core/library/city/shops/slots';

const slots = shopSlotsFor(1440, 340, 11);
const EPOCH = 20_000;
const days = (from: number, to: number): SlotDay[][] => Array.from({ length: to - from }, (_, i) => streetOn(slots, 11, EPOCH, from + i, {}));

describe('cycle de vie des commerces', () => {
  it('occupe tous les locaux au départ, avec des types tous différents', () => {
    const start = streetOn(slots, 11, EPOCH, EPOCH, {});
    expect(start.every((s) => s.tenant !== null)).toBe(true);
    const types = start.map((s) => s.tenant!.type);
    expect(new Set(types).size).toBe(Math.min(types.length, 32));
  });
  it('étale les premiers changements (pas tous le même jour)', () => {
    const firstChange = slots.map((s) => days(EPOCH, EPOCH + 90).findIndex((street) => street.find((x) => x.slot.id === s.id)!.change !== null));
    expect(new Set(firstChange).size).toBeGreaterThan(Math.min(slots.length, 5) - 1);
  });
  it('ne change jamais un dimanche ni un jour férié, et jamais vers le même type', () => {
    const left = new Map<string, string>();
    for (const street of days(EPOCH, EPOCH + 400)) {
      for (const s of street) {
        if (!s.change) continue;
        if (s.change.kind === 'to-sale') left.set(s.slot.id, s.change.before!.type);
        if (s.change.kind === 'from-sale' && left.has(s.slot.id)) expect(s.change.after!.type).not.toBe(left.get(s.slot.id));
        expect(isWorkday(s.change.day)).toBe(true);
        if (s.change.before && s.change.after) expect(s.change.after.type).not.toBe(s.change.before.type);
      }
    }
  });
  it('garde un local À vendre 7 à 21 jours, puis le reloue', () => {
    const history = days(EPOCH, EPOCH + 600);
    for (const slot of slots) {
      let saleStart: number | null = null;
      history.forEach((street, i) => {
        const s = street.find((x) => x.slot.id === slot.id)!;
        if (s.change?.kind === 'to-sale') saleStart = EPOCH + i;
        if (s.change?.kind === 'from-sale' && saleStart !== null) {
          const length = EPOCH + i - saleStart;
          expect(length).toBeGreaterThanOrEqual(7);
          expect(length).toBeLessThanOrEqual(21 + 7); // + report éventuel au jour ouvré suivant
          saleStart = null;
        }
      });
    }
  });
  it('reloue environ une fois sur deux', () => {
    let relet = 0;
    let toSale = 0;
    for (const street of days(EPOCH, EPOCH + 1500)) for (const s of street) {
      if (s.change?.kind === 'relet') relet++;
      if (s.change?.kind === 'to-sale') toSale++;
    }
    expect(relet / (relet + toSale)).toBeGreaterThan(0.35);
    expect(relet / (relet + toSale)).toBeLessThan(0.65);
  });
  it('prend un nom local s’il y en a, sinon un nom écrit, sans doublon dans la rue', () => {
    const all = Object.fromEntries(SHOP_TYPE_IDS.map((id) => [id, [`Local ${id}`]]));
    for (const s of streetOn(slots, 11, EPOCH, EPOCH, all)) expect(s.tenant!.name).toBe(`Local ${s.tenant!.type}`);
    const names = streetOn(slots, 11, EPOCH, EPOCH + 200, {}).flatMap((s) => (s.tenant ? [s.tenant.name] : []));
    expect(new Set(names).size).toBe(names.length);
    for (const s of streetOn(slots, 11, EPOCH, EPOCH, {})) expect(SHOP_DEFS[s.tenant!.type].names).toContain(s.tenant!.name);
  });
  it('ne fait pas dépendre types et dates des noms disponibles', () => {
    const a = streetOn(slots, 11, EPOCH, EPOCH + 300, {});
    const b = streetOn(slots, 11, EPOCH, EPOCH + 300, { bar: ['A', 'B'], bakery: ['C'] });
    expect(a.map((s) => [s.tenant?.type, s.tenant?.from])).toEqual(b.map((s) => [s.tenant?.type, s.tenant?.from]));
  });
  it('traite un jour antérieur au départ comme le jour du départ', () => {
    expect(streetOn(slots, 11, EPOCH, EPOCH - 10, {})).toEqual(streetOn(slots, 11, EPOCH, EPOCH, {}));
  });
});
