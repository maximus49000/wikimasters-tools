import type { PairScene, Pet, PetAction, PetPlan, Pt, Segment } from '../library-types';
import { layoutSig, type BrainEnv } from './brain';
import { planEndsAt, routeMs, stateAt } from './motion';
import { jumpMs, planRoute, scaleRoute, type Standing } from './route';
import { buildWalkMap, cellOf, isFree, standPoint, type WalkMap } from './walk-map';

export type SceneOther = { pet: Pet; plan: PetPlan };
export type SceneProposal = { scene: PairScene; partnerId: string; lead: PetPlan; partner: PetPlan | null };

const CAT_SPEED = 0.8;
const DOG_SPEED = 0.6;
const ROBOT_SPEED = 0.7;
const RUN = 0.6;
// Actions sur place d'un partenaire qui accepte d'être abordé.
const SOCIABLE: ReadonlySet<PetAction> = new Set(['sit', 'groom', 'stretch', 'yawn', 'sniff', 'pant', 'scan']);
const APPROACH_MAX_MS = 4000;
// Plafond de l'approche du meneur pour toute scène (poursuite, recul, sieste comprises).
const MAX_APPROACH_MS = 6000;
const MIN_NAP_ACT_MS = 5000;
const MAX_ACT_MS = 8000;
const MIN_NAP_LEFT_MS = 10_000;
// Hauteur (px) du dos du robot au-dessus de ses pieds : là où le chat dort. À accorder au dessin du robot (robot-sprite.tsx).
export const RIDE_LIFT = 26;
const NAP_MS: readonly [number, number] = [18_000, 30_000];

const isRideable = (pet: Pet, plan: PetPlan): boolean => pet.species === 'robot' && (plan.action === 'standby' || plan.action === 'charge');
const speedOf = (pet: Pet): number => (pet.species === 'dog' ? DOG_SPEED : pet.species === 'robot' ? ROBOT_SPEED : CAT_SPEED);
const sideOf = (from: Pt, to: Pt): 'l' | 'r' => (to.x >= from.x ? 'r' : 'l');
const between = (rng: () => number, [lo, hi]: readonly [number, number]): number => Math.round(lo + rng() * (hi - lo));

// Une case libre contiguë au partenaire (gauche ou droite d'abord, côté tiré au hasard), ou null.
function meetCell(map: WalkMap, at: Pt, rng: () => number, preferred?: 'l' | 'r'): { col: number; row: number; side: 'l' | 'r' } | null {
  const c = cellOf(at);
  const order = preferred ? (preferred === 'l' ? [-1, 1] : [1, -1]) : rng() < 0.5 ? [-1, 1] : [1, -1];
  for (const dx of order) if (isFree(map, c.col + dx, c.row)) return { col: c.col + dx, row: c.row, side: dx < 0 ? 'l' : 'r' };
  return null;
}

// Une case libre à 4 à 7 colonnes du poursuivi, de préférence du côté opposé au poursuivant.
function fleeCell(map: WalkMap, at: Pt, awayFrom: 'l' | 'r', rng: () => number): { col: number; row: number } | null {
  const c = cellOf(at);
  const dir = awayFrom === 'l' ? 1 : -1;
  for (const d of [dir]) {
    for (let step = 4 + Math.floor(rng() * 4); step >= 2; step--) {
      const col = c.col + d * step;
      if (col >= 0 && col < map.cols && isFree(map, col, c.row) && isFree(map, col - d, c.row)) return { col, row: c.row };
    }
  }
  return null;
}

const planBase = (env: BrainEnv, now: number, facing: 'l' | 'r'): Pick<PetPlan, 'hostId' | 'on' | 'startedAt' | 'facing' | 'sig'> => ({
  hostId: null, on: null, startedAt: now, facing, sig: layoutSig(env.layout, env.cols),
});

// Le robot ne dort pas, ne se fait pas toiletter et ne joue pas à la poursuite : avec lui, salut, suite (chien) ou remise à sa place (chat).
function scenesFor(lead: Pet, partner: Pet, sleeping: boolean): [PairScene, number][] {
  if (sleeping) return lead.species === 'robot' ? [] : [['nap', 1]];
  const out: [PairScene, number][] = [['greet', 1]];
  if (lead.species === 'robot') return out;
  if (partner.species === 'robot') {
    out.push(lead.species === 'dog' ? ['follow', 0.8] : ['shoo', 1.2]);
    return out;
  }
  if (lead.species === partner.species) out.push(['groom', 0.6]);
  if (lead.species === 'cat' && partner.species === 'dog') out.push(['shoo', 1.2]);
  else if (lead.species === 'dog' || partner.species === 'cat') out.push(['chase', 0.8]);
  return out;
}

// Les deux plans d'une scène à deux, ou null si rien ne convient. Le meneur marche jusqu'à une case contiguë au partenaire ;
// le partenaire, lui, ne bouge que par son propre trajet (attente `lag` puis fuite ou recul) : jamais de téléportation.
export function proposeScene(env: BrainEnv, lead: { pet: Pet; from: Standing }, others: SceneOther[], now: number): SceneProposal | null {
  const eligible = others.filter((other) => {
    const { plan } = other;
    if (plan.with !== undefined || now >= planEndsAt(plan)) return false;
    const state = stateAt(plan, now);
    if (state.phase !== 'act' || state.on !== null || plan.on !== null) return false;
    // Un robot en veille ou en recharge n'est abordé que par un chat, pour y dormir dessus.
    if (isRideable(other.pet, plan)) return lead.pet.species === 'cat' && planEndsAt(plan) - now >= MIN_NAP_LEFT_MS;
    if (other.pet.species === 'robot' && (plan.action === 'standby' || plan.action === 'charge')) return false;
    if (plan.action === 'sleep') return plan.hostId === null && planEndsAt(plan) - now >= MIN_NAP_LEFT_MS;
    return plan.hostId === null && SOCIABLE.has(plan.action);
  });
  if (eligible.length === 0) return null;
  const target = eligible[Math.floor(env.rng() * eligible.length)]!;
  const partner = target.pet;
  const at = target.plan.at;
  const sleeping = target.plan.action === 'sleep';
  const ride = isRideable(partner, target.plan);

  const choices: [PairScene, number][] = ride ? [['ride', 2]] : scenesFor(lead.pet, partner, sleeping);
  if (choices.length === 0) return null;
  const total = choices.reduce((a, [, w]) => a + w, 0);
  let roll = env.rng() * total;
  let scene = choices[choices.length - 1]![0];
  for (const [s, w] of choices) {
    roll -= w;
    if (roll < 0) {
      scene = s;
      break;
    }
  }

  const map = buildWalkMap(env.layout, env.cols);
  // Poursuite et suite : le meneur arrive du côté d'où il vient, pour ne jamais traverser le partenaire.
  const running = scene === 'chase' || scene === 'follow';
  const meet = meetCell(map, at, env.rng, running ? (lead.from.pt.x < at.x ? 'l' : 'r') : undefined);
  if (!meet) return null;
  if (running && meet.side !== (lead.from.pt.x < at.x ? 'l' : 'r')) return null;
  const meetPt = standPoint(meet.col, meet.row);
  const approach = planRoute(map, lead.from, { pt: meetPt, on: null });
  if (!approach) return null;
  // Suite : le chien se règle sur le robot (pas d'accélération) ; poursuite : les deux filent.
  const leadK = scene === 'chase' ? Math.max(speedOf(lead.pet), speedOf(partner)) * RUN : scene === 'follow' ? Math.max(speedOf(lead.pet), speedOf(partner)) : speedOf(lead.pet);
  const leadRoute = scaleRoute(approach, leadK);
  const leadWait = routeMs(leadRoute);
  if (leadWait > MAX_APPROACH_MS) return null;
  const facingPartner = sideOf(meetPt, at);
  const facingLead = sideOf(at, meetPt);
  const leadWith = { petId: partner.id, role: 'lead' as const, scene };
  const partnerWith = { petId: lead.pet.id, role: 'follow' as const, scene };
  const base = (facing: 'l' | 'r') => planBase(env, now, facing);

  if (scene === 'nap') {
    // Le meneur ne dort jamais à côté d'un dormeur déjà parti : il faut qu'il reste au moins 5 s de sommeil à l'arrivée.
    const left = planEndsAt(target.plan) - now - leadWait;
    if (left < MIN_NAP_ACT_MS) return null;
    const actMs = Math.min(between(env.rng, NAP_MS), left);
    return { scene, partnerId: partner.id, partner: null, lead: { ...base(facingPartner), action: 'sleep', at: meetPt, route: leadRoute, actMs, with: leadWith } };
  }

  if (scene === 'ride') {
    // Le chat monte sur le dos du robot par un saut depuis la case voisine et y dort ; le robot, verrouillé, reste en veille tout ce temps.
    const top: Pt = { x: at.x, y: at.y - RIDE_LIFT };
    const jump: Segment = { kind: 'jump', from: meetPt, to: top, ms: jumpMs(meetPt, top), fromOn: null, on: null };
    const left = planEndsAt(target.plan) - now - leadWait - jump.ms;
    if (left < MIN_NAP_ACT_MS) return null;
    const actMs = Math.min(between(env.rng, NAP_MS), left);
    return {
      scene, partnerId: partner.id,
      lead: { ...base(facingPartner), action: 'sleep', at: top, route: [...leadRoute, jump], actMs, with: leadWith },
      partner: { ...base(target.plan.facing), action: 'standby', hostId: target.plan.hostId, at, route: [], actMs: leadWait + jump.ms + actMs, with: partnerWith, ...(target.plan.key !== undefined ? { key: target.plan.key } : {}) },
    };
  }

  if ((scene === 'greet' || scene === 'groom') && leadWait > APPROACH_MAX_MS) return null;
  if (scene === 'greet' || scene === 'groom') {
    const actMs = scene === 'greet' ? 3000 : 5000;
    return {
      scene, partnerId: partner.id,
      lead: { ...base(facingPartner), action: scene, at: meetPt, route: leadRoute, actMs, with: leadWith },
      partner: { ...base(facingLead), action: scene, at, route: [], actMs: leadWait + actMs, with: partnerWith },
    };
  }

  if (scene === 'shoo') {
    const actMs = 2200;
    const away = meet.side === 'l' ? 1 : -1;
    let recoil: Segment[] = [];
    let recoilAt = at;
    for (const step of [2, 1]) {
      const col = cellOf(at).col + away * step;
      if (!isFree(map, col, cellOf(at).row) || !isFree(map, col - away, cellOf(at).row)) continue;
      const route = planRoute(map, { pt: at, on: null }, { pt: standPoint(col, cellOf(at).row), on: null });
      if (route) {
        recoil = scaleRoute(route, speedOf(partner));
        recoilAt = standPoint(col, cellOf(at).row);
        break;
      }
    }
    if (recoil.length === 0 && leadWait > APPROACH_MAX_MS) return null;
    return {
      scene, partnerId: partner.id,
      lead: { ...base(facingPartner), action: 'hiss', at: meetPt, route: leadRoute, actMs, with: leadWith },
      partner: { ...base(facingLead), action: 'cower', at: recoilAt, route: recoil, lag: leadWait, actMs: Math.max(500, actMs - routeMs(recoil)), with: partnerWith },
    };
  }

  // chase / follow : le poursuivi file (ou roule), le poursuivant le rattrape ; les deux jouent à l'arrivée.
  const flee = fleeCell(map, at, meet.side, env.rng);
  if (!flee) return null;
  const fleePt = standPoint(flee.col, flee.row);
  const fleeRoute = planRoute(map, { pt: at, on: null }, { pt: fleePt, on: null });
  const behind = standPoint(flee.col + (flee.col >= cellOf(at).col ? -1 : 1), flee.row);
  const chaseRoute = planRoute(map, { pt: meetPt, on: null }, { pt: behind, on: null });
  if (!fleeRoute || !chaseRoute) return null;
  const leadFull = [...leadRoute, ...scaleRoute(chaseRoute, leadK)];
  const partnerRoute = scaleRoute(fleeRoute, scene === 'follow' ? speedOf(partner) : speedOf(partner) * RUN);
  // Les deux plans finissent au même instant : le plus rapide attend l'autre en jouant.
  const leadRun = routeMs(leadFull);
  const partnerRun = leadWait + routeMs(partnerRoute);
  const leadAct = 2500 + Math.max(0, partnerRun - leadRun);
  const partnerAct = 2500 + Math.max(0, leadRun - partnerRun);
  if (leadAct > MAX_ACT_MS || partnerAct > MAX_ACT_MS) return null;
  return {
    scene, partnerId: partner.id,
    lead: { ...base(sideOf(meetPt, fleePt)), action: scene === 'follow' ? 'greet' : 'play', at: behind, route: leadFull, actMs: leadAct, with: leadWith },
    partner: { ...base(sideOf(at, fleePt)), action: scene === 'follow' ? 'scan' : 'play', at: fleePt, route: partnerRoute, lag: leadWait, actMs: partnerAct, with: partnerWith },
  };
}

// Le plan tient-il encore ? Une scène à deux n'a de sens que si le partenaire est toujours là avec le plan jumeau
// (même départ, références croisées) ; le sommeil côte à côte demande que le dormeur soit toujours là et endormi (plan 'sleep').
export function sceneIsValid(plan: PetPlan, partnerPlan: PetPlan | undefined, partnerExists: boolean): boolean {
  if (plan.with === undefined) return true;
  if (!partnerExists) return false;
  if (plan.with.scene === 'nap') return partnerPlan?.action === 'sleep';
  // Le chat sur le dos du robot : le robot doit toujours être en veille, avec le plan jumeau.
  if (plan.with.scene === 'ride' && plan.with.role === 'lead' && partnerPlan?.action !== 'standby') return false;
  return partnerPlan?.with?.petId !== undefined && partnerPlan.startedAt === plan.startedAt && partnerPlan.with.scene === plan.with.scene && partnerPlan.with.role !== plan.with.role;
}
