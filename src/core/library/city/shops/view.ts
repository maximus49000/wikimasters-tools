import type { YMD } from '../calendar';
import { SHOP_DEFS, type ShopTypeId } from './catalog';
import { dayNumber, isOpenAt } from './hours';
import type { Change, SlotDay, Tenant } from './lifecycle';
import { movingAt, movingPlan, type MovingPlan, type MovingStep } from './moving';
import type { ShopSlot } from './slots';
import { WORK_STEPS, worksAt, worksPlan, type WorkStep, type WorksPlan } from './works';

export type ShopView = {
  slot: ShopSlot;
  phase: 'open' | 'closed' | 'for-sale' | 'works';
  sign: { type: ShopTypeId; name: string } | null;
  placard: boolean;
  interior: ShopTypeId | null;
  works: { step: WorkStep; progress: number; kind: Change['kind']; carrying: 'sign' | 'placard' | null } | null;
  moving: { step: MovingStep; progress: number; kind: Change['kind'] } | null;
  // Mobilier du local le jour d'un changement : celui de l'ancien commerce, vide, ou celui du nouveau (null hors changement).
  interiorStage: 'before' | 'empty' | 'after' | null;
};

const signOf = (t: Tenant | null): ShopView['sign'] => (t ? { type: t.type, name: t.name } : null);
const after = (a: WorkStep, b: WorkStep): boolean => WORK_STEPS.indexOf(a) > WORK_STEPS.indexOf(b);

// Le chantier d'enseigne démarre au plus tôt 15 min après la fin du déménagement.
export const WORKS_GAP_MIN = 15;
export function changePlans(seed: number, slotId: string, day: number, kind: Change['kind']): { moving: MovingPlan; works: WorksPlan } {
  const moving = movingPlan(seed, slotId, day, kind);
  return { moving, works: worksPlan(seed, slotId, day, moving.end + WORKS_GAP_MIN) };
}

// Quel mobilier voit-on à cette étape du déménagement ? (la moitié du portage sert de bascule)
function stageAt(plan: MovingPlan, step: MovingStep, progress: number): NonNullable<ShopView['interiorStage']> {
  switch (step) {
    case 'truck-arrives':
    case 'open-back':
      return plan.inOnly ? 'empty' : 'before';
    case 'carry-out':
      return progress < 0.5 ? 'before' : 'empty';
    case 'pause':
      return 'empty';
    case 'carry-in':
      return progress < 0.5 ? 'empty' : 'after';
    default:
      return plan.outOnly ? 'empty' : 'after';
  }
}

// Ce que montre un local à `minutes` du jour `date`. Jour de changement : l'ancien état fermé avant le déménagement ; pendant le
// déménagement puis jusqu'au chantier d'enseigne, rideau levé, ancienne enseigne (ou écriteau) en place et mobilier qui sort puis rentre ;
// pendant le chantier, intérieur vide, l'ancienne enseigne jusqu'à la fin de « remove », la nouvelle (ou l'écriteau) dès la fin
// de « install » ; après, l'état du nouvel occupant.
export function shopViewAt(s: SlotDay, seed: number, date: YMD, minutes: number): ShopView {
  const normal = (tenant: Tenant | null): ShopView =>
    tenant === null
      ? { slot: s.slot, phase: 'for-sale', sign: null, placard: true, interior: null, works: null, moving: null, interiorStage: null }
      : { slot: s.slot, phase: isOpenAt(SHOP_DEFS[tenant.type], date, minutes) ? 'open' : 'closed', sign: signOf(tenant), placard: false, interior: tenant.type, works: null, moving: null, interiorStage: null };
  const change = s.change;
  if (!change || change.day !== dayNumber(date)) return normal(s.tenant);
  const { moving: movePlan, works: plan } = changePlans(seed, s.slot.id, change.day, change.kind);
  const goesToSale = change.kind === 'to-sale';
  const fromSale = change.kind === 'from-sale';
  if (minutes < movePlan.start) {
    const before = normal(change.before);
    return { ...(before.phase === 'open' ? { ...before, phase: 'closed' as const } : before), interiorStage: 'before' };
  }
  const m = movingAt(movePlan, minutes);
  if (m) {
    return {
      slot: s.slot,
      phase: 'works',
      sign: signOf(change.before),
      placard: fromSale,
      interior: null,
      works: null,
      moving: { step: m.step, progress: m.progress, kind: change.kind },
      interiorStage: stageAt(movePlan, m.step, m.progress),
    };
  }
  if (minutes < plan.start) {
    // Le camion est reparti, l'équipe d'enseigne n'est pas encore là : local vide, ancienne enseigne.
    return { slot: s.slot, phase: 'works', sign: signOf(change.before), placard: fromSale, interior: null, works: null, moving: null, interiorStage: 'empty' };
  }
  const w = worksAt(plan, minutes);
  if (!w) return normal(change.after);
  const removed = after(w.step, 'remove');
  const installed = after(w.step, 'install');
  const oldUp = !removed;
  const newUp = installed;
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
    moving: null,
    interiorStage: 'empty',
  };
}
