import type { Coat, PetPlan, Pt, Room, Segment, Species } from '../library-types';
import { STORM_HOLD_MS, layoutSig, nextPlan, resume, standingFrom, touchPlan, type BrainEnv, type Rng } from './brain';
import type { PetContext } from './context';
import { depthIndex, depthKey } from './depth';
import { planEndsAt, stateAt, type PetState } from './motion';
import { jumpMs } from './route';
import { buildWalkMap } from './walk-map';
import { proposeScene, sceneIsValid } from './scenes';
import { huddlePlans, stormPlan } from './storm';
import type { Standing } from './route';

export type Pose = 'walk' | 'jump' | 'sit' | 'groom' | 'stretch' | 'yawn' | 'sleep' | 'eat' | 'scratch' | 'hide' | 'purr' | 'pant' | 'sniff' | 'greet' | 'play' | 'hiss' | 'cower' | 'scan' | 'standby' | 'charge' | 'beep' | 'howl' | 'shake' | 'umbrella' | 'shortcircuit' | 'reboot';
export type PetFrame = { id: string; species: Species; coat: Coat; name: string; pose: Pose; facing: 'l' | 'r'; behind: number; top: boolean; /* id du meuble qui porte l'animal, null au sol */ on: string | null; pos: Pt; /* ordonnée des pieds : départage deux animaux au même rang de dessin */ depthY: number };

const PERCH_KINDS: ReadonlySet<string> = new Set(['desk', 'shelf']);
const isTop = (room: Room, on: string | null): boolean => on !== null && PERCH_KINDS.has(room.layout.find((p) => p.id === on)?.kind ?? '');
const FUTURE_SLACK_MS = 60_000;

// Si l'animal est en plein saut, son état « d'abandon » est le point d'atterrissage du saut (jamais en l'air).
function settledState(plan: PetPlan, now: number): PetState {
  const state = stateAt(plan, now);
  if (state.phase !== 'jump') return state;
  let t = Math.max(0, now - plan.startedAt - (plan.lag ?? 0));
  for (const s of plan.route) {
    if (t < s.ms) return { ...state, pos: s.to, on: s.on, phase: 'walk' };
    t -= s.ms;
  }
  return state;
}
// Le chat qui dort sur un robot (meneur d'une scène `ride`) : sur son dos ou en plein saut pour y monter.
const isRide = (plan: PetPlan | undefined): plan is PetPlan & { with: NonNullable<PetPlan['with']> } => plan?.with?.scene === 'ride' && plan.with.role === 'lead';
const isRiding = (plan: PetPlan | undefined, now: number): boolean => {
  if (!isRide(plan)) return false;
  const phase = stateAt(plan, now).phase;
  return phase === 'act' || phase === 'done' || phase === 'jump';
};

// La descente : le chat repart de sa position (sur le dos du robot ou en l'air) par un saut vers une case libre du sol,
// là d'où il a sauté si elle est encore libre, sinon la plus proche. Jamais de téléportation.
function descent(room: Room, plan: PetPlan, now: number): { landing: Standing; jump: Segment } {
  const state = stateAt(plan, now);
  const takeoff = [...plan.route].reverse().find((s) => s.kind === 'jump')?.from ?? state.pos;
  const landing = standingFrom(buildWalkMap(room.layout, room.cols), { pos: takeoff, phase: 'walk', facing: state.facing, on: null, depthHosts: [null] });
  return { landing, jump: { kind: 'jump', from: state.pos, to: landing.pt, ms: jumpMs(state.pos, landing.pt), fromOn: null, on: null } };
}

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
    case 'sunbathe':
      return 'sleep';
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
  // Contexte de l'image en cours ; dernier orage traité (une seule réaction par orage) ; chiens déjà ébroués (par fin de pluie).
  let curCtx: PetContext | undefined;
  let stormSeen = 0;
  const shook = new Set<string>();

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
  const envFor = (room: Room, species: Species, occupied: ReadonlySet<string>, petId: string): BrainEnv => {
    const env: BrainEnv = { layout: room.layout, cols: room.cols, rng, still, occupied, species };
    if (curCtx === undefined) return env;
    const rainEndedAt = curCtx.rainEndedAt;
    return { ...env, ctx: curCtx, canShake: species === 'dog' && rainEndedAt !== null && !shook.has(`${petId}:${rainEndedAt}`) };
  };

  function enter(room: Room): void {
    if (room.id !== roomId) {
      plans.clear();
      roomId = room.id;
      stormSeen = 0;
      shook.clear();
    }
    for (const id of Array.from(plans.keys())) if (!room.pets.some((p) => p.id === id)) plans.delete(id);
  }

  const record = (id: string, plan: PetPlan): void => {
    plans.set(id, plan);
    if (plan.action === 'shake' && curCtx?.rainEndedAt != null) shook.add(`${id}:${curCtx.rainEndedAt}`);
    opts.onPlan(id, plan);
  };

  // Là où l'animal se trouve en théorie (jamais en l'air) ; un chat qui dort sur le robot en descend d'abord par un saut.
  const standingOf = (room: Room, id: string, now: number): { standing: Standing; jump: Segment | null } | null => {
    const plan = planOf(room, id);
    if (!plan) return null;
    if (isRiding(plan, now)) {
      const { landing, jump } = descent(room, plan, now);
      return { standing: landing, jump };
    }
    return { standing: standingFrom(buildWalkMap(room.layout, room.cols), settledState(plan, now)), jump: null };
  };
  const withJump = (plan: PetPlan, jump: Segment | null): PetPlan => (jump && !still ? { ...plan, route: [jump, ...plan.route] } : plan);

  // Début d'un orage : chaque animal interrompt son plan (sauf s'il se cache ou se blottit déjà de lui-même) ;
  // à trois, le chat et le chien se serrent l'un contre l'autre pendant que le robot court-circuite.
  const stormStrikes = (room: Room, now: number): void => {
    const sheltered = (id: string): boolean => {
      const plan = planOf(room, id);
      return plan !== undefined && plan.with === undefined && (plan.action === 'hide' || plan.action === 'cower') && now < planEndsAt(plan);
    };
    const cat = room.pets.find((p) => p.species === 'cat');
    const dog = room.pets.find((p) => p.species === 'dog');
    const robot = room.pets.find((p) => p.species === 'robot');
    const handled = new Set<string>();
    if (cat && dog && robot && !still && !sheltered(cat.id) && !sheltered(dog.id)) {
      const c = standingOf(room, cat.id, now);
      const d = standingOf(room, dog.id, now);
      const pair = c && d ? huddlePlans(envFor(room, 'cat', new Set(), cat.id), { ...c.standing, id: cat.id }, { ...d.standing, id: dog.id }, now, c?.jump ?? null) : null;
      if (pair && c && d) {
        record(cat.id, pair.cat);
        record(dog.id, withJump(pair.dog, d.jump));
        handled.add(cat.id).add(dog.id);
      }
    }
    for (const pet of room.pets) {
      if (handled.has(pet.id) || sheltered(pet.id)) continue;
      const at = standingOf(room, pet.id, now);
      if (!at) continue;
      const next = stormPlan(envFor(room, pet.species, takenBy(room, pet.id, now), pet.id), pet.species, at.standing, now);
      record(pet.id, withJump(next, at.jump));
    }
  };

  // Le plan qui suit une sieste sur le robot : un saut de descente, puis le choix habituel depuis le sol (en mouvement réduit : posé directement).
  const dismount = (env: BrainEnv, room: Room, plan: PetPlan, now: number): PetPlan => {
    const { landing, jump } = descent(room, plan, now);
    const next = nextPlan(env, landing, now, plan.action);
    return still ? next : { ...next, route: [jump, ...next.route] };
  };

  return {
    step(room: Room, now: number, ctx?: PetContext): PetFrame[] {
      curCtx = ctx;
      enter(room);
      if (sigLayout !== room.layout || sigCols !== room.cols) {
        sig = layoutSig(room.layout, room.cols);
        sigLayout = room.layout;
        sigCols = room.cols;
      }
      if (ctx?.storm && ctx.storm.id !== stormSeen && now - ctx.storm.since < STORM_HOLD_MS) {
        stormSeen = ctx.storm.id;
        stormStrikes(room, now);
      }
      return room.pets.map((pet) => {
        const env = envFor(room, pet.species, takenBy(room, pet.id, now), pet.id);
        let plan = planOf(room, pet.id);
        if (plan !== undefined && plan.startedAt > now + FUTURE_SLACK_MS) plan = undefined;
        // Une scène dont le partenaire a disparu ou changé de plan est abandonnée, là où l'animal se trouve en théorie.
        if (plan?.with !== undefined && now < planEndsAt(plan)) {
          const partnerPlan = planOf(room, plan.with.petId);
          const jumelle = partnerPlan?.with?.petId === pet.id;
          // La sieste n'a pas de jumeau : on lui donne le plan du dormeur tel quel.
          const given = plan.with.scene === 'nap' || jumelle ? partnerPlan : undefined;
          if (!sceneIsValid(plan, given, room.pets.some((p) => p.id === plan!.with!.petId))) {
            if (isRiding(plan, now)) {
              // Le robot est parti, touché ou remplacé : le chat saute de son dos.
              plan = dismount(env, room, plan, now);
              record(pet.id, plan);
            } else if (plan.sig === sig) {
              const standing = standingFrom(buildWalkMap(room.layout, room.cols), settledState(plan, now));
              plan = nextPlan(env, standing, now, plan.action);
              record(pet.id, plan);
            } else {
              // Meubles changés : la position théorique n'est plus fiable, `resume` repart d'une case libre.
              const { with: _with, ...rest } = plan;
              plan = rest;
            }
          }
        }
        // Sieste finie, ou meubles changés pendant qu'il dort sur le robot : descente par un saut, sans nouvelle scène.
        if (plan !== undefined && isRiding(plan, now) && (plan.sig !== sig || now >= planEndsAt(plan))) {
          plan = dismount(env, room, plan, now);
          record(pet.id, plan);
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
        let behind = depthIndex(room.layout, depthKey(room.layout, state));
        let depthY = state.pos.y;
        // Sur le dos du robot : même rang de dessin que lui, juste devant.
        if (isRide(plan) && state.phase !== 'walk' && state.phase !== 'wait') {
          const robotPlan = planOf(room, plan.with.petId);
          if (robotPlan) {
            const robotState = stateAt(robotPlan, now);
            behind = depthIndex(room.layout, depthKey(room.layout, robotState));
            depthY = robotState.pos.y + 0.1;
          }
        }
        return { id: pet.id, species: pet.species, coat: pet.coat, name: pet.name, pose: poseOf(state, plan), facing: state.facing, behind, top: isTop(room, state.on), on: state.on, pos: state.pos, depthY };
      });
    },
    // Une caresse : vrai si l'animal s'est arrêté pour ronronner (ou remuer la queue).
    touch(room: Room, petId: string, now: number): boolean {
      enter(room);
      const plan = plans.get(petId);
      const pet = room.pets.find((p) => p.id === petId);
      // Un chat endormi sur le robot saute d'abord à terre, puis ronronne.
      if (plan && pet && isRide(plan) && stateAt(plan, now).phase === 'act') {
        const { landing, jump } = descent(room, plan, now);
        const purr: PetPlan = { action: 'purr', hostId: null, at: landing.pt, on: null, route: still ? [] : [jump], startedAt: now, actMs: 3500, facing: landing.facing, sig: layoutSig(room.layout, room.cols) };
        plans.set(petId, purr);
        opts.onPlan(petId, purr);
        return true;
      }
      const next = plan && pet && touchPlan(plan, envFor(room, pet.species, takenBy(room, petId, now), petId), now);
      if (!next) return false;
      plans.set(petId, next);
      opts.onPlan(petId, next);
      return true;
    },
  };
}
