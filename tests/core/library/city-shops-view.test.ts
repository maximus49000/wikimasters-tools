import { describe, expect, it } from 'vitest';
import { changePlans, shopViewAt } from '../../../src/core/library/city/shops/view';
import { dayNumber } from '../../../src/core/library/city/shops/hours';
import type { SlotDay } from '../../../src/core/library/city/shops/lifecycle';

const slot = { id: 'shop-0', index: 0, x: 100, w: 30, doorSide: 'left' as const, residentDoorX: 84 };
const date = { y: 2026, m: 10, d: 13 }; // mardi
const today = dayNumber(date);
const bakery = { type: 'bakery' as const, name: 'Au Pain Perdu', from: today - 10 };
const bar = { type: 'bar' as const, name: 'Le Zinc', from: today };
const relet: SlotDay = { slot, tenant: bar, change: { day: today, kind: 'relet', before: bakery, after: bar } };

describe('vue d’un local', () => {
  it('ouvert aux heures du commerce, fermé sinon', () => {
    const s: SlotDay = { slot, tenant: bakery, change: null };
    expect(shopViewAt(s, 1, date, 8 * 60)).toMatchObject({ phase: 'open', interior: 'bakery', placard: false, sign: { type: 'bakery' }, moving: null, interiorStage: null });
    expect(shopViewAt(s, 1, date, 22 * 60)).toMatchObject({ phase: 'closed', interior: 'bakery' });
  });
  it('À vendre : pas d’enseigne, écriteau dans la vitrine, intérieur vide', () => {
    const s: SlotDay = { slot, tenant: null, change: null };
    expect(shopViewAt(s, 1, date, 10 * 60)).toMatchObject({ phase: 'for-sale', sign: null, placard: true, interior: null });
  });
  it('jour de relocation : ancien avant le déménagement, déménagement, chantier d’enseigne, nouveau ensuite', () => {
    const { moving, works } = changePlans(1, 'shop-0', today, 'relet');
    expect(works.start).toBeGreaterThanOrEqual(moving.end + 15);
    expect(shopViewAt(relet, 1, date, moving.start - 5)).toMatchObject({ phase: 'closed', sign: { type: 'bakery' }, moving: null, interiorStage: 'before' });
    const install = works.steps.find((x) => x.step === 'install')!;
    const removeEnd = works.steps.find((x) => x.step === 'remove')!.to;
    expect(shopViewAt(relet, 1, date, moving.start + 1)).toMatchObject({ phase: 'works', sign: { type: 'bakery' } });
    // entre la fin du déménagement et le début de l'enseigne : local vide, ancienne enseigne
    const gap = shopViewAt(relet, 1, date, moving.end + 1);
    expect(gap).toMatchObject({ phase: 'works', interior: null, interiorStage: 'empty', sign: { type: 'bakery' }, moving: null, works: null });
    expect(shopViewAt(relet, 1, date, works.start + 1)).toMatchObject({ phase: 'works', sign: { type: 'bakery' }, interior: null });
    expect(shopViewAt(relet, 1, date, removeEnd + 1)).toMatchObject({ phase: 'works', sign: null });
    expect(shopViewAt(relet, 1, date, install.to + 1)).toMatchObject({ phase: 'works', sign: { type: 'bar' } });
    expect(shopViewAt(relet, 1, date, works.end + 1)).toMatchObject({ sign: { type: 'bar' }, phase: 'closed', moving: null, interiorStage: null }); // bar ouvre à 17 h
  });
  it('l’intérieur se vide pendant « carry-out » puis se remplit pendant « carry-in »', () => {
    const { moving } = changePlans(1, 'shop-0', today, 'relet');
    const step = (name: string) => moving.steps.find((x) => x.step === name)!;
    const out = step('carry-out');
    const inn = step('carry-in');
    const stage = (m: number) => shopViewAt(relet, 1, date, m).interiorStage;
    expect(stage(out.from + 0.01)).toBe('before');
    expect(stage(out.to - 0.01)).toBe('empty');
    expect(stage(step('pause').from + 0.01)).toBe('empty');
    expect(stage(inn.from + 0.01)).toBe('empty');
    expect(stage(inn.to - 0.01)).toBe('after');
    expect(stage(step('leave').from + 0.01)).toBe('after');
    expect(shopViewAt(relet, 1, date, out.from + 1).moving).toMatchObject({ step: 'carry-out', kind: 'relet' });
    for (let m = moving.start; m < moving.end; m += 5) expect(shopViewAt(relet, 1, date, m)).toMatchObject({ phase: 'works' });
    for (let m = moving.start; m < moving.end; m += 5) expect(shopViewAt(relet, 1, date, m).moving).not.toBeNull();
  });
  it('passage À vendre : enseigne déposée puis écriteau collé', () => {
    const s: SlotDay = { slot, tenant: null, change: { day: today, kind: 'to-sale', before: bakery, after: null } };
    const { works: plan } = changePlans(1, 'shop-0', today, 'to-sale');
    const install = plan.steps.find((x) => x.step === 'install')!;
    expect(shopViewAt(s, 1, date, install.from - 1)).toMatchObject({ sign: null, placard: false });
    expect(shopViewAt(s, 1, date, install.to + 1)).toMatchObject({ sign: null, placard: true });
    expect(shopViewAt(s, 1, date, install.from + 1).works?.carrying).toBe('placard');
  });
  it('sortie d’À vendre : écriteau retiré puis nouvelle enseigne', () => {
    const s: SlotDay = { slot, tenant: bar, change: { day: today, kind: 'from-sale', before: null, after: bar } };
    const { moving, works: plan } = changePlans(1, 'shop-0', today, 'from-sale');
    expect(shopViewAt(s, 1, date, moving.start + 1)).toMatchObject({ placard: true, sign: null });
    expect(shopViewAt(s, 1, date, plan.start + 1)).toMatchObject({ placard: true, sign: null });
    expect(shopViewAt(s, 1, date, plan.end + 1)).toMatchObject({ placard: false, sign: { type: 'bar' } });
  });
});
