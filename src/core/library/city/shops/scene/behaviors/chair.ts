import type { ShopTypeId } from '../../catalog';
import { HALF, OUTSIDE, PLACE, TIGHT } from '../stage';
import {
  SPEED, atDepth, cast, depth, gest, say, walkTo, yawInward, yawToward,
  type Act, type Actor, type Beat, type PartyRt, type Service, type World,
} from '../engine';
import { leave } from './customer';
import { blockXs, inside, outgoing, placeTaken } from './places';
import { payActs } from './service';

// Fauteuils (G4b, famille `chair` : coiffeur, tatoueur) : l'employé installe le client au fauteuil, enchaîne les étapes du
// métier (signature, tâche 6 ; ici une étape générique `prepare`), encaisse au fauteuil, le client repart. Ceux qui
// attendent s'assoient sur la chaise d'attente (stage.waiting) s'il y en a une, sinon restent debout juste passé la porte.

type Pair = [Actor, Act[]];
const B = (pairs: Pair[], log?: string, wait?: Actor[]): Beat => ({ acts: pairs.filter(([, a]) => a.length > 0), ...(log ? { log } : {}), ...(wait ? { wait } : {}) });
const turn = (yaw: number): Act => ({ move: 'turn', yaw });

// Étape de la séance : gestes de l'employé et du client joués ensemble (un temps de service).
export type SigStep = { staff: Act[]; client: Act[]; log?: string };
// Greffon de la tâche 6 : étapes signature du métier pour une séance de `budget` s (shampoing, ciseaux, miroir ; longue
// séance penché, pauses, grimace…). Par défaut une étape générique : l'employé travaille, le client reste assis.
export function signatureFor(_type: ShopTypeId, budget: number): SigStep[] {
  return [{ staff: [gest('prepare', { dur: budget })], client: [gest('sit', { dur: budget })] }];
}
// Séance (s) : souhaitée, et au minimum pour qu'elle vaille la peine d'être commencée.
const WANT = (w: World): number => (w.type === 'tattoo' ? 300 + w.rng() * 300 : 120 + w.rng() * 140);
const MIN = (w: World): number => (w.type === 'tattoo' ? 120 : 50);
// Après la séance : installation, paiement, au revoir, et la sortie (traverser la vitrine).
const tail = (w: World): number => 20 + w.stage.w / SPEED;
const roomFor = (w: World, s: Actor): number => Math.min(s.deadline, w.force) - w.t;

// Où se tient l'employé : derrière le fauteuil, côté fond.
const standX = (w: World, chair: number): number => atDepth(w, Math.min(w.stage.w - HALF, depth(w, chair) + PLACE * 0.6));
const chairTaken = (w: World, x: number): boolean => w.parties.some((p) => p.chair === x && (inside(p) || p.actors.some((a) => a.active)));
const freeChair = (w: World, s: Actor): number | null => {
  const free = w.stage.chairs.filter((x) => !chairTaken(w, x));
  return free.length ? free.reduce((a, b) => (Math.abs(b - s.staff!.post) < Math.abs(a - s.staff!.post) ? b : a)) : null;
};
// L'employé réserve le fauteuil en ouvrant la séance.
export function claimChair(w: World, s: Actor, party: PartyRt): void {
  party.chair = freeChair(w, s);
}

// Prochain client : celui qui attend dedans d'abord, puis celui de la porte ; seulement si la séance tient avant la fin.
export function chairWork(w: World, s: Actor): [PartyRt, Service['kind']] | null {
  if (roomFor(w, s) < MIN(w) + tail(w) + 10 || freeChair(w, s) === null) return null;
  const waiting = w.parties.find((p) => p.state === 'waiting' && !p.service && p.actors.every((a) => a.pending.length === 0 && a.free <= w.t + 1e-9));
  if (waiting) return [waiting, 'chair'];
  const door = w.parties.find((p) => p.state === 'door' && !p.service);
  return door && !w.parties.some((o) => outgoing(o, w.t)) ? [door, 'chair'] : null;
}
export const chairNeeds = (p: PartyRt): boolean => !p.service && (p.state === 'door' || p.state === 'waiting');

// Places d'attente : chaises d'attente, sinon la place debout près de la porte.
const waitPlaces = (w: World): number[] => (w.stage.waiting.length ? w.stage.waiting : w.stage.spots);
const placeFree = (w: World, party: PartyRt, x: number): boolean => !w.parties.some((o) => o !== party && o.spot === x && (inside(o) || o.actors.some((a) => a.active))) && !placeTaken(w, party, x);

// Entrée d'un parti à la porte quand personne ne peut le prendre tout de suite : il va attendre son tour dedans.
export function chairDoor(w: World, party: PartyRt): boolean {
  if (w.parties.some((o) => o !== party && outgoing(o, w.t))) return false;
  if (w.staff.some((s) => s.active && !s.staff!.service && s.staff!.state === 'floor' && chairWork(w, s)?.[0] === party)) return false;
  const x = waitPlaces(w).find((v) => placeFree(w, party, v));
  if (x === undefined) return false;
  const seat = w.stage.waiting.includes(x);
  const xs = blockXs(w, party, x);
  party.actors.forEach((a, k) => {
    Object.assign(a, { active: true, x: atDepth(w, -OUTSIDE), yaw: yawInward(w), free: w.t + k * 0.5, chain: true });
    a.track.enter = a.free;
    a.pending = [walkTo(xs[k]!), turn(12), ...(seat && k === 0 ? [gest('sit', { dur: 1 })] : [])];
  });
  if (seat) party.flags.add('wait-chair');
  Object.assign(party, { state: 'waiting', spot: x, queuedAt: w.t, since: w.t });
  say(w, `${party.desc} entre et attend son tour${seat ? ' sur la chaise' : ''}`);
  return true;
}

// Celui qui attend : renonce s'il ne pourra plus passer avant la fermeture, ou après une trop longue attente.
export function chairDecide(w: World, party: PartyRt): void {
  if (party.state !== 'waiting' || party.service) return;
  const best = Math.max(...w.staff.map((s) => roomFor(w, s)));
  if (best < MIN(w) + tail(w) + 10) return leave(w, party, 'repart : la boutique va fermer');
  if (w.t - party.queuedAt > 300) leave(w, party, "repart : trop d'attente");
}

export function chairBeat(w: World, svc: Service, p: number): Beat | null {
  const { staff: s, party } = svc;
  const chair = party.chair!;
  const L = party.actors[0]!;
  const at = standX(w, chair);
  if (p === 0) {
    if (party.actors.some((a) => a.active)) {
      // De la chaise d'attente au fauteuil : le meneur seul, ses accompagnants restent où ils sont.
      party.flags.delete('wait-chair');
      if (party.actors.length === 1) party.spot = null;
      cast([[L, [walkTo(chair), turn(yawToward(chair, at))]]]);
    } else {
      // Pris à la porte : il entre droit au fauteuil, ses accompagnants se tiennent juste à côté, côté porte.
      const toDoor = Math.sign(atDepth(w, -OUTSIDE) - chair);
      party.actors.forEach((a, k) => {
        const x = k === 0 ? chair : Math.min(w.stage.w - HALF, Math.max(HALF, chair + toDoor * k * TIGHT));
        Object.assign(a, { active: true, x: atDepth(w, -OUTSIDE), yaw: yawInward(w), free: w.t + k * 0.5, chain: true });
        a.track.enter = a.free;
        a.pending = [walkTo(x), turn(yawToward(x, at))];
      });
      say(w, `${party.desc} entre`);
    }
    return B([[s, [walkTo(at), turn(yawToward(at, chair))]]], undefined, party.actors);
  }
  if (p === 1) {
    party.flags.add('in-chair');
    return B([[s, [gest('greet', { yaw: yawToward(at, chair) }), gest('show-table')]], [L, [gest('greet'), gest('sit', { dur: 1.5 })]]]);
  }
  if (p === 2) {
    const budget = Math.max(MIN(w), Math.min(WANT(w), roomFor(w, s) - tail(w)));
    svc.steps = signatureFor(w.type, budget);
  }
  const steps = svc.steps ?? [];
  const k = p - 2;
  if (k < steps.length) {
    const st = steps[k]!;
    return B([[s, st.staff], [L, st.client]], st.log);
  }
  if (k === steps.length) {
    party.flags.delete('in-chair');
    const pay = payActs(w, party);
    return B([[L, pay.acts], [s, [gest('nod')]]], pay.log);
  }
  if (k === steps.length + 1) return B([[L, [gest('wave-bye')]], [s, [gest('nod')]]]);
  return null;
}

export function afterChair(w: World, svc: Service, aborted: boolean): void {
  const { party } = svc;
  party.since = w.t;
  if (!aborted) return leave(w, party, w.type === 'tattoo' ? 'repart, tatoué' : 'repart avec sa nouvelle coupe');
  if (party.flags.has('in-chair') || party.actors.some((a) => a.active)) return leave(w, party, 'repart : la séance est écourtée');
  party.state = 'door';
  party.chair = null;
}
