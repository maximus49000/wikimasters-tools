import type { Coat, PetPlan, Pt, Room, Species } from '../library-types';
import { layoutSig, nextPlan, resume, touchPlan, type BrainEnv, type Rng } from './brain';
import { depthIndex, depthKey } from './depth';
import { planEndsAt, stateAt, type PetState } from './motion';
import { proposeScene, sceneIsValid } from './scenes';
import type { Standing } from './route';

export type Pose = 'walk' | 'jump' | 'sit' | 'groom' | 'stretch' | 'yawn' | 'sleep' | 'eat' | 'scratch' | 'hide' | 'purr' | 'pant' | 'sniff' | 'greet' | 'play' | 'hiss' | 'cower';
export type PetFrame = { id: string; species: Species; coat: Coat; name: string; pose: Pose; facing: 'l' | 'r'; behind: number; top: boolean; pos: Pt };

const PERCH_KINDS: ReadonlySet<string> = new Set(['desk', 'shelf']);
const isTop = (room: Room, on: string | null): boolean => on !== null && PERCH_KINDS.has(room.layout.find((p) => p.id === on)?.kind ?? '');
const FUTURE_SLACK_MS = 60_000;
// Chance qu'un animal qui a fini son action propose une scène à un autre (jamais en continu).
const SCENE_CHANCE = 0.3;

export function poseOf(state: PetState, plan: PetPlan): Pose {
  if (state.phase === 'walk' || state.phase === 'jump') return state.phase;
  if (state.phase === 'wait') return 'sit';
  switch (plan.action) {
    case 'perch':
      return 'sit';
    case 'drink':
      return 'eat';
    default:
      return plan.action;
  }
}

export function createPetRunner(opts: { rng?: Rng; still?: boolean; onPlan: (petId: string, plan: PetPlan) => void }) {
  const rng = opts.rng ?? Math.random;
  const still = opts.still ?? false;
  const plans = new Map<string, PetPlan>();
  let roomId = '';
  let sigLayout: Room['layout'] | null = null;
  let sigCols = 0;
  let sig = '';

  const planOf = (room: Room, id: string): PetPlan | undefined => plans.get(id) ?? room.pets.find((p) => p.id === id)?.plan;
  // Les places que les AUTRES animaux occupent ou ont choisies (plans pas encore finis).
  const takenBy = (room: Room, selfId: string, now: number): Set<string> => {
    const keys = new Set<string>();
    for (const other of room.pets) {
      if (other.id === selfId) continue;
      const plan = planOf(room, other.id);
      if (plan?.key !== undefined && now < planEndsAt(plan)) keys.add(plan.key);
    }
    return keys;
  };
  const envFor = (room: Room, species: Species, occupied: ReadonlySet<string>): BrainEnv => ({ layout: room.layout, cols: room.cols, rng, still, occupied, species });

  function enter(room: Room): void {
    if (room.id !== roomId) {
      plans.clear();
      roomId = room.id;
    }
    for (const id of Array.from(plans.keys())) if (!room.pets.some((p) => p.id === id)) plans.delete(id);
  }

  const record = (id: string, plan: PetPlan): void => {
    plans.set(id, plan);
    opts.onPlan(id, plan);
  };

  return {
    step(room: Room, now: number): PetFrame[] {
      enter(room);
      if (sigLayout !== room.layout || sigCols !== room.cols) {
        sig = layoutSig(room.layout, room.cols);
        sigLayout = room.layout;
        sigCols = room.cols;
      }
      return room.pets.map((pet) => {
        const env = envFor(room, pet.species, takenBy(room, pet.id, now));
        let plan = planOf(room, pet.id);
        if (plan !== undefined && plan.startedAt > now + FUTURE_SLACK_MS) plan = undefined;
        // Une scène dont le partenaire a disparu ou changé de plan est abandonnée, là où l'animal se trouve en théorie.
        if (plan?.with !== undefined && now < planEndsAt(plan)) {
          const partnerPlan = planOf(room, plan.with.petId);
          const jumelle = partnerPlan?.with?.petId === pet.id;
          if (!sceneIsValid(plan, jumelle ? partnerPlan : undefined, room.pets.some((p) => p.id === plan!.with!.petId))) {
            const s = stateAt(plan, now);
            plan = nextPlan(env, { pt: s.pos, on: s.on, hostId: s.on, facing: s.facing }, now, plan.action);
            record(pet.id, plan);
          }
        }
        if (plan === undefined || plan.sig !== sig || now >= planEndsAt(plan)) {
          const finished = plan !== undefined && plan.sig === sig;
          let started = false;
          if (finished && !still && room.pets.length > 1 && rng() < SCENE_CHANCE) {
            const others = room.pets.filter((p) => p.id !== pet.id).flatMap((p) => {
              const pp = planOf(room, p.id);
              return pp ? [{ pet: p, plan: pp }] : [];
            });
            const from: Standing = { pt: plan!.at, on: plan!.on, hostId: plan!.hostId, facing: plan!.facing };
            const scene = proposeScene(env, { pet, from }, others, now);
            if (scene) {
              plan = scene.lead;
              record(pet.id, scene.lead);
              if (scene.partner) record(scene.partnerId, scene.partner);
              started = true;
            }
          }
          if (!started) {
            const next = resume(plan, env, now);
            plan = next.plan;
            if (next.fresh) record(pet.id, plan);
          }
        }
        plan = plan!;
        let state = stateAt(plan, now);
        // Animations réduites : un trajet en cours est remplacé tout de suite par un plan sur place.
        if (still && plan.route.length > 0 && (state.phase === 'walk' || state.phase === 'jump' || state.phase === 'wait')) {
          plan = nextPlan(env, { pt: state.pos, on: state.on, hostId: state.on, facing: state.facing }, now, plan.action);
          record(pet.id, plan);
          state = stateAt(plan, now);
        }
        plans.set(pet.id, plan);
        return { id: pet.id, species: pet.species, coat: pet.coat, name: pet.name, pose: poseOf(state, plan), facing: state.facing, behind: depthIndex(room.layout, depthKey(room.layout, state)), top: isTop(room, state.on), pos: state.pos };
      });
    },
    // Une caresse : vrai si l'animal s'est arrêté pour ronronner (ou remuer la queue).
    touch(room: Room, petId: string, now: number): boolean {
      enter(room);
      const plan = plans.get(petId);
      const pet = room.pets.find((p) => p.id === petId);
      const next = plan && pet && touchPlan(plan, envFor(room, pet.species, takenBy(room, petId, now)), now);
      if (!next) return false;
      plans.set(petId, next);
      opts.onPlan(petId, next);
      return true;
    },
  };
}
