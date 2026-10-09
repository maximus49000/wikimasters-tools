import type { PetPlan, Pt, Segment } from '../library-types';

export type PetPhase = 'walk' | 'jump' | 'act' | 'done';
// `on` : le support à cet instant (sol = null) ; `depthHosts` : les meubles qui décident de l'ordre de dessin (deux pendant un saut).
export type PetState = { pos: Pt; phase: PetPhase; facing: 'l' | 'r'; on: string | null; depthHosts: (string | null)[] };

export const routeMs = (route: Segment[]): number => route.reduce((total, s) => total + s.ms, 0);
export const planEndsAt = (plan: PetPlan): number => plan.startedAt + routeMs(plan.route) + plan.actMs;

const arcHeight = (s: Segment): number => Math.min(60, 20 + Math.max(0, s.from.y - s.to.y) * 0.3);

// Où est le chat à l'instant `now` ? Un calcul direct sur le plan, sans rien simuler entre-temps.
export function stateAt(plan: PetPlan, now: number): PetState {
  let t = Math.max(0, now - plan.startedAt);
  let facing = plan.facing;
  for (const s of plan.route) {
    const dx = s.to.x - s.from.x;
    if (Math.abs(dx) >= 1) facing = dx > 0 ? 'r' : 'l';
    if (t < s.ms) {
      const u = s.ms === 0 ? 1 : t / s.ms;
      const x = s.from.x + dx * u;
      let y = s.from.y + (s.to.y - s.from.y) * u;
      if (s.kind === 'jump') y -= 4 * arcHeight(s) * u * (1 - u);
      return { pos: { x, y }, phase: s.kind, facing, on: s.on, depthHosts: s.kind === 'jump' ? [s.fromOn, s.on] : [s.on] };
    }
    t -= s.ms;
  }
  return { pos: plan.at, phase: t < plan.actMs ? 'act' : 'done', facing: plan.facing, on: plan.on, depthHosts: [plan.hostId] };
}
