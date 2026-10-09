import { describe, expect, it } from 'vitest';
import { shopViewAt } from '../../../src/core/library/city/shops/view';
import { worksPlan } from '../../../src/core/library/city/shops/works';
import { dayNumber } from '../../../src/core/library/city/shops/hours';
import type { SlotDay } from '../../../src/core/library/city/shops/lifecycle';

const slot = { id: 'shop-0', index: 0, x: 100, w: 30, doorSide: 'left' as const, residentDoorX: 84 };
const date = { y: 2026, m: 10, d: 13 }; // mardi
const today = dayNumber(date);
const bakery = { type: 'bakery' as const, name: 'Au Pain Perdu', from: today - 10 };
const bar = { type: 'bar' as const, name: 'Le Zinc', from: today };

describe('vue d’un local', () => {
  it('ouvert aux heures du commerce, fermé sinon', () => {
    const s: SlotDay = { slot, tenant: bakery, change: null };
    expect(shopViewAt(s, 1, date, 8 * 60)).toMatchObject({ phase: 'open', interior: 'bakery', placard: false, sign: { type: 'bakery' } });
    expect(shopViewAt(s, 1, date, 22 * 60)).toMatchObject({ phase: 'closed', interior: 'bakery' });
  });
  it('À vendre : pas d’enseigne, écriteau dans la vitrine, intérieur vide', () => {
    const s: SlotDay = { slot, tenant: null, change: null };
    expect(shopViewAt(s, 1, date, 10 * 60)).toMatchObject({ phase: 'for-sale', sign: null, placard: true, interior: null });
  });
  it('jour de relocation : ancien avant le chantier, chantier, nouveau ensuite', () => {
    const s: SlotDay = { slot, tenant: bar, change: { day: today, kind: 'relet', before: bakery, after: bar } };
    const plan = worksPlan(1, 'shop-0', today);
    expect(shopViewAt(s, 1, date, plan.start - 5)).toMatchObject({ phase: 'closed', sign: { type: 'bakery' } });
    const install = plan.steps.find((x) => x.step === 'install')!;
    const removeEnd = plan.steps.find((x) => x.step === 'remove')!.to;
    expect(shopViewAt(s, 1, date, plan.start + 1)).toMatchObject({ phase: 'works', sign: { type: 'bakery' }, interior: null });
    expect(shopViewAt(s, 1, date, removeEnd + 1)).toMatchObject({ phase: 'works', sign: null });
    expect(shopViewAt(s, 1, date, install.to + 1)).toMatchObject({ phase: 'works', sign: { type: 'bar' } });
    expect(shopViewAt(s, 1, date, plan.end + 1)).toMatchObject({ sign: { type: 'bar' }, phase: 'closed' }); // bar ouvre à 17 h
  });
  it('passage À vendre : enseigne déposée puis écriteau collé', () => {
    const s: SlotDay = { slot, tenant: null, change: { day: today, kind: 'to-sale', before: bakery, after: null } };
    const plan = worksPlan(1, 'shop-0', today);
    const install = plan.steps.find((x) => x.step === 'install')!;
    expect(shopViewAt(s, 1, date, install.from - 1)).toMatchObject({ sign: null, placard: false });
    expect(shopViewAt(s, 1, date, install.to + 1)).toMatchObject({ sign: null, placard: true });
    expect(shopViewAt(s, 1, date, install.from + 1).works?.carrying).toBe('placard');
  });
  it('sortie d’À vendre : écriteau retiré puis nouvelle enseigne', () => {
    const s: SlotDay = { slot, tenant: bar, change: { day: today, kind: 'from-sale', before: null, after: bar } };
    const plan = worksPlan(1, 'shop-0', today);
    expect(shopViewAt(s, 1, date, plan.start + 1)).toMatchObject({ placard: true, sign: null });
    expect(shopViewAt(s, 1, date, plan.end + 1)).toMatchObject({ placard: false, sign: { type: 'bar' } });
  });
});
