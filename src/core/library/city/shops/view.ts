import type { YMD } from '../calendar';
import { SHOP_DEFS, type ShopTypeId } from './catalog';
import { dayNumber, isOpenAt } from './hours';
import type { Change, SlotDay, Tenant } from './lifecycle';
import type { ShopSlot } from './slots';
import { WORK_STEPS, worksAt, worksPlan, type WorkStep } from './works';

export type ShopView = {
  slot: ShopSlot;
  phase: 'open' | 'closed' | 'for-sale' | 'works';
  sign: { type: ShopTypeId; name: string } | null;
  placard: boolean;
  interior: ShopTypeId | null;
  works: { step: WorkStep; progress: number; kind: Change['kind']; carrying: 'sign' | 'placard' | null } | null;
};

const signOf = (t: Tenant | null): ShopView['sign'] => (t ? { type: t.type, name: t.name } : null);
const after = (a: WorkStep, b: WorkStep): boolean => WORK_STEPS.indexOf(a) > WORK_STEPS.indexOf(b);

// Ce que montre un local à `minutes` du jour `date`. Jour de changement : l'ancien état avant le chantier ; pendant, rideau levé
// et intérieur vide, l'ancienne enseigne (ou l'écriteau) jusqu'à la fin de « remove », la nouvelle (ou l'écriteau) dès la fin
// de « install » ; après, l'état du nouvel occupant.
export function shopViewAt(s: SlotDay, seed: number, date: YMD, minutes: number): ShopView {
  const normal = (tenant: Tenant | null): ShopView =>
    tenant === null
      ? { slot: s.slot, phase: 'for-sale', sign: null, placard: true, interior: null, works: null }
      : { slot: s.slot, phase: isOpenAt(SHOP_DEFS[tenant.type], date, minutes) ? 'open' : 'closed', sign: signOf(tenant), placard: false, interior: tenant.type, works: null };
  const change = s.change;
  if (!change || change.day !== dayNumber(date)) return normal(s.tenant);
  const plan = worksPlan(seed, s.slot.id, change.day);
  if (minutes < plan.start) {
    const before = normal(change.before);
    return before.phase === 'open' ? { ...before, phase: 'closed' } : before;
  }
  const w = worksAt(plan, minutes);
  if (!w) return normal(change.after);
  const removed = after(w.step, 'remove');
  const installed = after(w.step, 'install');
  const oldUp = !removed;
  const newUp = installed;
  const goesToSale = change.kind === 'to-sale';
  const fromSale = change.kind === 'from-sale';
  return {
    slot: s.slot,
    phase: 'works',
    sign: newUp ? signOf(change.after) : oldUp ? signOf(change.before) : null,
    placard: (fromSale && oldUp) || (goesToSale && newUp),
    interior: null,
    works: {
      step: w.step,
      progress: w.progress,
      kind: change.kind,
      carrying: w.step === 'hand' || w.step === 'climb-again' || w.step === 'install' ? (goesToSale ? 'placard' : 'sign') : null,
    },
  };
}
