import { hashString, mulberry32 } from '../../../scene-world';
import { TURN_S } from '../../../figure/gait';
import type { Outfit } from '../../people';
import { SHOP_FAMILY } from '../gestures';
import type { ShopFrame } from '../slots';
import { arrivals, descOf, exited, followerDecide, forceOut, leaderDecide } from './behaviors/customer';
import { pump } from './behaviors/service';
import { left, makeStaff, pickWork, settle, staffDecide, staffPresence } from './behaviors/staff';
import { SPEED, hold, interrupt, isFree, run, type Actor, type PartyRt, type World } from './engine';
import { SLOT_S, STEP, slotStart } from './slots';
import { OUTSIDE, stageFor } from './stage';
import type { Party, Score, SlotKey, StreetState } from './types';

// Metteur en scène des commerces (G4b) : simulation à pas fixes (STEP) d'un créneau, de la boutique au repos à la
// boutique au repos. À chaque pas : prises de poste, arrivées à la porte, échéance de fermeture, temps des services, puis
// chaque acteur libre joue ses actes en attente ou décide (behaviors/*). Sortie : la partition (segments par acteur) et un
// journal lisible. Fonction pure de l'entrée : même créneau, même graine → même partition. Appelant : vérifier `inScene`.
export type DirectorInput = { key: SlotKey; frame: ShopFrame; staff: { id: string; outfit: Outfit; present: [number, number] }[]; parties: Party[]; street: StreetState };

// Part du créneau à partir de laquelle on écourte (plus de flânerie, l'indécis renonce, l'employé accélère).
const CLOSING_SHARE = 0.85;

function partyRuntime(w: World, p: Party): PartyRt {
  const party: PartyRt = {
    p, desc: descOf(p), actors: [], state: 'street', since: 0, queuedAt: 0, spot: null, visits: 0, holding: false,
    incidents: new Set(p.incidents), flags: new Set(), service: null, until: 0,
  };
  party.actors = p.members.map((m, k) => ({
    id: `${p.id}:${k}`, track: { id: `${p.id}:${k}`, role: 'customer', outfit: m.outfit, scale: m.scale, party: p.id, enter: null, exit: null, segments: [] },
    x: 0, yaw: 0, carried: null, free: 0, rest: 0, pending: [], chain: false, fill: 'idle', soft: null, lastFill: false,
    pictoAt: -99, pictoT0: -99, active: false, deadline: w.force, staff: null, party, member: k,
  }) satisfies Actor);
  return party;
}

function tick(w: World, a: Actor): void {
  if (!a.active) return;
  if (!isFree(a, w.t)) {
    // Boutique vide interrompue : seulement pour un travail qu'il prend aussitôt (sinon sa marche serait hachée pas à pas).
    if (!(a.staff && a.soft && !a.staff.service && pickWork(w, a) && interrupt(w, a))) return;
  }
  if (!run(w, a)) {
    if (a.staff) staffDecide(w, a);
    else if (a.member === 0) leaderDecide(w, a);
    else followerDecide(w, a);
    run(w, a);
  }
  if (a.staff) left(a);
  else exited(a);
  if (a.active && isFree(a, w.t)) hold(a, w.t + STEP, a.fill);
}

export function direct(input: DirectorInput): Score {
  const { key, frame, street } = input;
  const L = SLOT_S(key.type);
  const stage = stageFor(key.type, frame);
  // Réserve de sortie : traverser toute la vitrine et passer la porte, plus un demi-tour et une marge.
  const exitReserve = (stage.w + 2 * OUTSIDE) / SPEED + TURN_S + 1.5;
  const w: World = {
    type: key.type, family: SHOP_FAMILY[key.type], stage, L, t: 0, log: [], staff: [], parties: [], queue: [], pictos: [], street,
    rng: mulberry32(key.seed ^ hashString(`director|${key.slotId}|${key.type}|${key.day}|${key.index}`)),
    closing: L * CLOSING_SHARE, force: Math.max(0, L - exitReserve), toDoor: stage.doorEdge === 'left' ? -1 : 1,
  };
  w.staff = makeStaff(w, input.staff, key.day);
  w.parties = input.parties.map((p) => partyRuntime(w, p));
  const actors = [...w.staff, ...w.parties.flatMap((p) => p.actors)];
  let forced = false;
  const steps = Math.round(L / STEP);
  for (let n = 0; n < steps; n++) {
    w.t = n * STEP;
    staffPresence(w);
    arrivals(w);
    if (!forced && w.t >= w.force) {
      forced = true;
      forceOut(w);
    }
    pump(w);
    for (const a of actors) tick(w, a);
  }
  for (const s of w.staff) settle(s, L);
  return { key: `${key.slotId}|${key.type}|${key.day}|${key.index}`, start: slotStart(key.type, key.index), length: L, tracks: actors.map((a) => a.track), log: w.log };
}
