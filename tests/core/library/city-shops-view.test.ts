import { describe, expect, it } from 'vitest';
import { TRUCK_SHIFT_MIN, changePlans, furnitureAt, movingOffsets, shopViewAt } from '../../../src/core/library/city/shops/view';
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
    // entre la fin du déménagement et le début de l'enseigne : nouveau mobilier en place, ancienne enseigne
    const gap = shopViewAt(relet, 1, date, moving.end + 1);
    expect(gap).toMatchObject({ phase: 'works', interior: null, interiorStage: 'after', sign: { type: 'bakery' }, moving: null, works: null });
    expect(shopViewAt(relet, 1, date, works.start + 1).interiorStage).toBe('after');
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
  it('passage À vendre : le local reste vide après le déménagement, pendant le chantier', () => {
    const s: SlotDay = { slot, tenant: null, change: { day: today, kind: 'to-sale', before: bakery, after: null } };
    const { moving, works } = changePlans(1, 'shop-0', today, 'to-sale');
    expect(shopViewAt(s, 1, date, moving.end + 1).interiorStage).toBe('empty');
    expect(shopViewAt(s, 1, date, works.start + 1).interiorStage).toBe('empty');
  });
});

describe('mobilier par tranches (furnitureAt)', () => {
  const N = 4;
  const at = (m: number) => furnitureAt(shopViewAt(relet, 1, date, m), N);
  const { moving } = changePlans(1, 'shop-0', today, 'relet');
  const step = (name: string) => moving.steps.find((x) => x.step === name)!;
  it('l’ancien mobilier part tranche par tranche (il en reste une jusqu’à la bascule), puis le nouveau arrive', () => {
    expect(at(moving.start + 0.5)).toEqual({ from: 'before', shown: N });
    const out = step('carry-out');
    let last = N;
    for (let p = 0; p < 0.5; p += 0.05) {
      const f = at(out.from + p * (out.to - out.from))!;
      expect(f.from).toBe('before');
      expect(f.shown).toBeLessThanOrEqual(last);
      expect(f.shown).toBeGreaterThanOrEqual(1);
      last = f.shown;
    }
    expect(last).toBe(1);
    expect(at(out.to - 0.01)).toBeNull();
    expect(at(step('pause').from + 0.5)).toBeNull();
    const inn = step('carry-in');
    let prev = 0;
    for (let p = 0.5; p < 1; p += 0.05) {
      const f = at(inn.from + p * (inn.to - inn.from))!;
      expect(f.from).toBe('after');
      expect(f.shown).toBeGreaterThanOrEqual(Math.max(1, prev));
      prev = f.shown;
    }
    expect(prev).toBe(N);
    expect(at(step('leave').from + 0.5)).toEqual({ from: 'after', shown: N });
  });
  it('jour ordinaire : rien de plus que l’intérieur', () => {
    expect(furnitureAt(shopViewAt({ slot, tenant: bakery, change: null }, 1, date, 600), N)).toBeNull();
  });
});

describe('un seul camion à la fois (movingOffsets)', () => {
  const slotN = (i: number) => ({ ...slot, id: `shop-${i}`, index: i, x: 100 + 40 * i });
  const change = (i: number, kind: 'relet' | 'to-sale' | 'from-sale' = 'relet'): SlotDay => ({
    slot: slotN(i),
    tenant: kind === 'to-sale' ? null : bar,
    change: { day: today, kind, before: kind === 'from-sale' ? null : bakery, after: kind === 'to-sale' ? null : bar },
  });
  it('deux locaux le même jour : le second (ordre des locaux) est décalé de 2 h, sans chevauchement', () => {
    const street: SlotDay[] = [change(2), { slot: slotN(1), tenant: bakery, change: null }, change(0, 'to-sale')];
    const offsets = movingOffsets(street, 1, today);
    expect(offsets.get('shop-0')).toBe(0);
    expect(offsets.get('shop-2')).toBe(TRUCK_SHIFT_MIN);
    expect(offsets.has('shop-1')).toBe(false);
    const a = changePlans(1, 'shop-0', today, 'to-sale', 0);
    const b = changePlans(1, 'shop-2', today, 'relet', TRUCK_SHIFT_MIN);
    expect(b.moving.start).toBeGreaterThanOrEqual(a.moving.end);
    // Le chantier d'enseigne suit le déménagement décalé.
    expect(b.works.start).toBeGreaterThanOrEqual(b.moving.end + 15);
    // La vue du second local suit son décalage : fermé (ancien état) à l'heure où le premier déménage, puis son propre camion.
    const view = (m: number) => shopViewAt(street[0]!, 1, date, m, TRUCK_SHIFT_MIN);
    expect(view(a.moving.start + 5).moving).toBeNull();
    expect(view(b.moving.start + 1).moving).not.toBeNull();
    for (let m = 0; m < 1440; m++) {
      const busy = [a.moving, b.moving].filter((p) => m >= p.start && m < p.end).length;
      expect(busy).toBeLessThanOrEqual(1);
    }
  });
  it('trois locaux le même jour : 0, 2 h, 4 h ; un changement d’un autre jour ne compte pas', () => {
    const other: SlotDay = { slot: slotN(3), tenant: bar, change: { day: today - 3, kind: 'relet', before: bakery, after: bar } };
    const offsets = movingOffsets([change(0), change(1, 'from-sale'), change(2), other], 1, today);
    expect([0, 1, 2].map((i) => offsets.get(`shop-${i}`))).toEqual([0, TRUCK_SHIFT_MIN, 2 * TRUCK_SHIFT_MIN]);
    expect(offsets.has('shop-3')).toBe(false);
  });
});
