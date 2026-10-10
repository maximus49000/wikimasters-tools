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
// `offsetMin` : décalage du déménagement (et donc du chantier qui le suit) quand un autre local de la rue déménage le même jour.
export function changePlans(seed: number, slotId: string, day: number, kind: Change['kind'], offsetMin = 0): { moving: MovingPlan; works: WorksPlan } {
  const moving = movingPlan(seed, slotId, day, kind, offsetMin);
  return { moving, works: worksPlan(seed, slotId, day, moving.end + WORKS_GAP_MIN) };
}

// Un seul camion à la fois dans la rue : les locaux qui changent le même jour déménagent l'un après l'autre, dans l'ordre des
// locaux ; le suivant est décalé de TRUCK_SHIFT_MIN (2 h, puis 4 h…) jusqu'à commencer après la fin du précédent.
export const TRUCK_SHIFT_MIN = 120;
export function movingOffsets(street: readonly SlotDay[], seed: number, day: number): Map<string, number> {
  const out = new Map<string, number>();
  let free = -Infinity;
  for (const s of [...street].sort((a, b) => a.slot.index - b.slot.index)) {
    if (!s.change || s.change.day !== day) continue;
    let offset = 0;
    let plan = movingPlan(seed, s.slot.id, day, s.change.kind, offset);
    while (plan.start < free) {
      offset += TRUCK_SHIFT_MIN;
      plan = movingPlan(seed, s.slot.id, day, s.change.kind, offset);
    }
    out.set(s.slot.id, offset);
    free = plan.end;
  }
  return out;
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
// pendant le chantier, le mobilier du nouveau commerce (rentré par les déménageurs ; local vide s'il passe « À vendre »), l'ancienne
// enseigne jusqu'à la fin de « remove », la nouvelle (ou l'écriteau) dès la fin de « install » ; après, l'état du nouvel occupant.
// `offsetMin` : décalage du déménagement (movingOffsets).
export function shopViewAt(s: SlotDay, seed: number, date: YMD, minutes: number, offsetMin = 0): ShopView {
  const normal = (tenant: Tenant | null): ShopView =>
    tenant === null
      ? { slot: s.slot, phase: 'for-sale', sign: null, placard: true, interior: null, works: null, moving: null, interiorStage: null }
      : { slot: s.slot, phase: isOpenAt(SHOP_DEFS[tenant.type], date, minutes) ? 'open' : 'closed', sign: signOf(tenant), placard: false, interior: tenant.type, works: null, moving: null, interiorStage: null };
  const change = s.change;
  if (!change || change.day !== dayNumber(date)) return normal(s.tenant);
  const { moving: movePlan, works: plan } = changePlans(seed, s.slot.id, change.day, change.kind, offsetMin);
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
  // Après le déménagement : le mobilier du nouveau commerce reste en place (vide si le local passe « À vendre »).
  const furnished: ShopView['interiorStage'] = goesToSale ? 'empty' : 'after';
  if (minutes < plan.start) {
    // Le camion est reparti, l'équipe d'enseigne n'est pas encore là : ancienne enseigne.
    return { slot: s.slot, phase: 'works', sign: signOf(change.before), placard: fromSale, interior: null, works: null, moving: null, interiorStage: furnished };
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
    interiorStage: furnished,
  };
}

// Mobilier visible derrière la vitrine un jour de changement, en `n` tranches verticales : celui de l'ancien commerce
// (`before`) ou du nouveau (`after`), et combien de tranches restent ou sont déjà posées. Pendant « carry-out », l'ancien
// mobilier s'en va tranche par tranche (il en reste au moins une tant que l'étape montre `before`) ; pendant « carry-in »,
// le nouveau arrive tranche par tranche à partir de la bascule. null : rien à montrer de plus que `interior` (jour ordinaire,
// local vide).
export function furnitureAt(view: ShopView, n: number): { from: 'before' | 'after'; shown: number } | null {
  const stage = view.interiorStage;
  if (stage === null || stage === 'empty') return null;
  const m = view.moving;
  if (m && m.step === 'carry-out' && stage === 'before') return { from: 'before', shown: n - Math.min(n - 1, Math.floor(2 * m.progress * n)) };
  if (m && m.step === 'carry-in' && stage === 'after') return { from: 'after', shown: Math.min(n, 1 + Math.floor((2 * m.progress - 1) * n)) };
  return { from: stage, shown: n };
}
