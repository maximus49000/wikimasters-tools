import type { Coat, PetPlan, Pt, Room } from '../library-types';
import { layoutSig, nextPlan, resume, touchPlan, type BrainEnv, type Rng } from './brain';
import { depthIndex, depthKey } from './depth';
import { planEndsAt, stateAt, type PetState } from './motion';

export type Pose = 'walk' | 'jump' | 'sit' | 'groom' | 'stretch' | 'yawn' | 'sleep' | 'eat' | 'scratch' | 'hide' | 'purr';
export type PetFrame = { id: string; coat: Coat; name: string; pose: Pose; facing: 'l' | 'r'; behind: number; top: boolean; pos: Pt };

// Un chat perché sur un bureau ou une étagère se dessine au-dessus des ordinateurs et des petits objets posés dessus.
const PERCH_KINDS: ReadonlySet<string> = new Set(['desk', 'shelf']);
const isTop = (room: Room, on: string | null): boolean => on !== null && PERCH_KINDS.has(room.layout.find((p) => p.id === on)?.kind ?? '');
// Un plan « venu du futur » (horloge déréglée, donnée abîmée) ne serait jamais fini.
const FUTURE_SLACK_MS = 60_000;

export function poseOf(state: PetState, plan: PetPlan): Pose {
  if (state.phase === 'walk' || state.phase === 'jump') return state.phase;
  switch (plan.action) {
    case 'perch':
      return 'sit';
    case 'drink':
      return 'eat';
    default:
      return plan.action;
  }
}

const NO_PLACES: ReadonlySet<string> = new Set();

// Fait vivre les animaux d'une pièce : à chaque pas, la position et la pose de chacun à l'instant donné.
// `onPlan` est appelé à chaque NOUVEAU plan (à mémoriser), jamais à chaque image.
export function createPetRunner(opts: { rng?: Rng; still?: boolean; onPlan: (petId: string, plan: PetPlan) => void }) {
  const rng = opts.rng ?? Math.random;
  const still = opts.still ?? false;
  const plans = new Map<string, PetPlan>();
  let roomId = '';
  let sigLayout: Room['layout'] | null = null;
  let sigCols = 0;
  let sig = '';

  const envOf = (room: Room): BrainEnv => ({ layout: room.layout, cols: room.cols, rng, still, occupied: NO_PLACES });

  function enter(room: Room): void {
    if (room.id !== roomId) {
      plans.clear();
      roomId = room.id;
    }
    for (const id of Array.from(plans.keys())) if (!room.pets.some((p) => p.id === id)) plans.delete(id);
  }

  return {
    step(room: Room, now: number): PetFrame[] {
      enter(room);
      if (sigLayout !== room.layout || sigCols !== room.cols) {
        sig = layoutSig(room.layout, room.cols);
        sigLayout = room.layout;
        sigCols = room.cols;
      }
      const env = envOf(room);
      return room.pets.map((pet) => {
        let plan = plans.get(pet.id) ?? pet.plan;
        if (plan !== undefined && plan.startedAt > now + FUTURE_SLACK_MS) plan = undefined;
        if (plan === undefined || plan.sig !== sig || now >= planEndsAt(plan)) {
          const next = resume(plan, env, now);
          plan = next.plan;
          if (next.fresh) opts.onPlan(pet.id, plan);
        }
        let state = stateAt(plan, now);
        // Animations réduites : un trajet en cours est remplacé tout de suite par un plan sur place.
        if (still && plan.route.length > 0 && (state.phase === 'walk' || state.phase === 'jump')) {
          plan = nextPlan(env, { pt: state.pos, on: state.on, hostId: state.on, facing: state.facing }, now, plan.action);
          opts.onPlan(pet.id, plan);
          state = stateAt(plan, now);
        }
        plans.set(pet.id, plan);
        return { id: pet.id, coat: pet.coat, name: pet.name, pose: poseOf(state, plan), facing: state.facing, behind: depthIndex(room.layout, depthKey(room.layout, state)), top: isTop(room, state.on), pos: state.pos };
      });
    },
    // Une caresse : vrai si le chat s'est arrêté pour ronronner.
    touch(room: Room, petId: string, now: number): boolean {
      enter(room);
      const plan = plans.get(petId);
      const next = plan && touchPlan(plan, envOf(room), now);
      if (!next) return false;
      plans.set(petId, next);
      opts.onPlan(petId, next);
      return true;
    },
  };
}
