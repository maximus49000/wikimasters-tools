import { hashString, mulberry32 } from '../../scene-world';

// Chantier du matin, le jour d'un changement : deux ouvriers, une échelle, l'ancienne enseigne (ou l'écriteau) et la nouvelle.
// Début tiré entre 8 h 30 et 9 h 30, fin vers 12 h (11 h 45 à 12 h 20) ; les étapes se partagent le temps selon leur poids,
// les pauses sont semées entre elles pour qu'on voie souvent quelqu'un à l'œuvre.
export const WORK_STEPS = ['arrive', 'ladder-up', 'climb', 'remove', 'descend', 'pause', 'hand', 'climb-again', 'install', 'descend-again', 'rest', 'ladder-down', 'leave'] as const;
export type WorkStep = (typeof WORK_STEPS)[number];
export type WorksPlan = { start: number; end: number; steps: { step: WorkStep; from: number; to: number }[] };

const WEIGHT: Record<WorkStep, number> = { arrive: 4, 'ladder-up': 8, climb: 3, remove: 40, descend: 3, pause: 20, hand: 4, 'climb-again': 3, install: 50, 'descend-again': 3, rest: 20, 'ladder-down': 6, leave: 4 };

// `notBefore` (minute du jour) : le chantier d'enseigne ne démarre pas avant elle (+ 0 à 30 min tirées) et dure au moins 2 h ; le jour d'un changement,
// c'est la fin du déménagement + 15 min. Sans elle, le calendrier d'origine est conservé tel quel.
export function worksPlan(seed: number, slotId: string, day: number, notBefore = 0): WorksPlan {
  const rng = mulberry32(seed ^ hashString(`works-${slotId}`) ^ Math.imul(day, 2654435761));
  let start = 510 + Math.floor(rng() * 61);
  let end = 705 + Math.floor(rng() * 36);
  if (notBefore > 0) {
    start = Math.max(start, notBefore + Math.floor(rng() * 31));
    end = Math.max(end, start + 120);
  }
  const total = WORK_STEPS.reduce((s, k) => s + WEIGHT[k], 0);
  const steps: WorksPlan['steps'] = [];
  let at = start;
  WORK_STEPS.forEach((step, i) => {
    const to = i === WORK_STEPS.length - 1 ? end : at + ((end - start) * WEIGHT[step]) / total;
    steps.push({ step, from: at, to });
    at = to;
  });
  return { start, end, steps };
}

export function worksAt(plan: WorksPlan, minutes: number): { step: WorkStep; progress: number } | null {
  if (minutes < plan.start || minutes >= plan.end) return null;
  const s = plan.steps.find((x) => minutes >= x.from && minutes < x.to)!;
  return { step: s.step, progress: (minutes - s.from) / (s.to - s.from) };
}
