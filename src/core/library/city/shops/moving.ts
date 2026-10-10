import { hashString, mulberry32 } from '../../scene-world';
import type { Change } from './lifecycle';

// Déménagement du matin, le jour d'un changement de commerce : un camion se range devant, les déménageurs sortent le mobilier
// de l'ancien commerce, font une pause, rentrent celui du nouveau, puis repartent. Début tiré entre 8 h et 8 h 30, fin entre 9 h 30 et 10 h
// (décalables par `offsetMin`). Passage « À vendre » : on sort sans rien rentrer ; sortie d'« À vendre » : on rentre sans rien sortir.
export const MOVING_STEPS = ['truck-arrives', 'open-back', 'carry-out', 'pause', 'carry-in', 'close-back', 'leave'] as const;
export type MovingStep = (typeof MOVING_STEPS)[number];
export type MovingPlan = { start: number; end: number; steps: { step: MovingStep; from: number; to: number }[]; outOnly: boolean; inOnly: boolean };

const WEIGHT: Record<MovingStep, number> = { 'truck-arrives': 6, 'open-back': 4, 'carry-out': 30, pause: 10, 'carry-in': 30, 'close-back': 4, leave: 6 };

export function movingPlan(seed: number, slotId: string, day: number, kind: Change['kind'], offsetMin = 0): MovingPlan {
  const rng = mulberry32(seed ^ hashString(`moving-${slotId}`) ^ Math.imul(day, 2654435761));
  // Les deux tirages ne dépendent pas du genre de changement : le calendrier reste le même quel que soit `kind`.
  const start = 480 + Math.floor(rng() * 31) + offsetMin;
  const end = 570 + Math.floor(rng() * 31) + offsetMin;
  const outOnly = kind === 'to-sale';
  const inOnly = kind === 'from-sale';
  const kept = MOVING_STEPS.filter((s) => !(outOnly && s === 'carry-in') && !(inOnly && s === 'carry-out'));
  const total = kept.reduce((sum, k) => sum + WEIGHT[k], 0);
  const steps: MovingPlan['steps'] = [];
  let at = start;
  kept.forEach((step, i) => {
    const to = i === kept.length - 1 ? end : at + ((end - start) * WEIGHT[step]) / total;
    steps.push({ step, from: at, to });
    at = to;
  });
  return { start, end, steps, outOnly, inOnly };
}

export function movingAt(plan: MovingPlan, minutes: number): { step: MovingStep; progress: number } | null {
  if (minutes < plan.start || minutes >= plan.end) return null;
  const s = plan.steps.find((x) => minutes >= x.from && minutes < x.to)!;
  return { step: s.step, progress: (minutes - s.from) / (s.to - s.from) };
}
