import { HALF, OUTSIDE, TIGHT } from '../stage';
import {
  SPEED, atDepth, cast, gest, say, walkTo, yawInward, yawToDoor, yawToward,
  type Act, type Actor, type Beat, type PartyRt, type Service, type World,
} from '../engine';
import { leave } from './customer';
import { SEATED } from './group';
import { inside, outgoing, partyIdle } from './places';
import { payActs } from './service';

// Restaurant (G4b, famille `table`) : le parti attend à la porte qu'un serveur vienne le placer ; le serveur prend les
// cartes, va à la porte, montre la table et marche devant (`show-table`), tend un menu à chacun ; on lit la carte assis, on
// la pose ; le serveur prend la commande au carnet, passe en cuisine (arrière-boutique), revient avec les assiettes,
// sert chacun ; on mange ; il débarrasse, rapporte la note, encaisse ; le parti quitte la table. 3-4 tables (stage.tables).
// Chaque passage du serveur est un service à part (seat → order → dish → clear) : entre deux, il sert les autres tables.

type Pair = [Actor, Act[]];
const B = (pairs: Pair[], log?: string, wait?: Actor[]): Beat => ({ acts: pairs.filter(([, a]) => a.length > 0), ...(log ? { log } : {}), ...(wait ? { wait } : {}) });
const turn = (yaw: number): Act => ({ move: 'turn', yaw });
// Patience devant la porte du restaurant (s) : on attend volontiers qu'on vous place.
export const TABLE_PATIENCE = (p: PartyRt): number => (p.p.character === 'rushed' ? 20 : 45);
// Temps minimal d'un repas complet (placement → départ) : trajets du serveur (≈ 9 traversées) et gestes au plus court.
const minMeal = (w: World): number => (9 * w.stage.w) / SPEED + 70;
// Réserve pour débarrasser, rapporter la note, encaisser et sortir.
const clearReserve = (w: World): number => (3 * w.stage.w) / SPEED + 30;

// Places assises d'un parti à sa table : le meneur côté fond, l'autre en face, un troisième en bout côté porte.
export function seatXs(w: World, party: PartyRt): number[] {
  const t = w.stage.tables[party.table!]!;
  const [a, b] = Math.abs(t.seats[0] - w.stage.back) < Math.abs(t.seats[1] - w.stage.back) ? t.seats : [t.seats[1], t.seats[0]];
  const toDoor = Math.sign(atDepth(w, -OUTSIDE) - b);
  const clampX = (x: number): number => Math.min(w.stage.w - HALF, Math.max(HALF, x));
  const xs = [a, b, clampX(b + toDoor * TIGHT)].slice(0, party.actors.length);
  // Vitrine minuscule (places rabattues contre un bord) : jamais deux convives au même x, on décale vers le fond.
  for (let k = 1; k < xs.length; k++) {
    while (xs.slice(0, k).some((o) => Math.abs(o - xs[k]!) < 0.5)) xs[k] = xs[k]! - toDoor * 0.6;
  }
  return xs;
}
const taken = (w: World, i: number): boolean => w.parties.some((p) => p.table === i && (inside(p) || (p.state === 'gone' && p.actors.some((a) => a.active))));
export const freeTable = (w: World): number | null => {
  const free = w.stage.tables.map((_, i) => i).filter((i) => !taken(w, i));
  return free.length ? free[Math.floor(w.rng() * free.length)]! : null;
};
// Le serveur réserve la table en ouvrant le placement (deux serveurs ne placent pas deux partis à la même table).
export function claimTable(w: World, party: PartyRt): void {
  party.table = freeTable(w);
}

// Ce qui attend un serveur, par priorité : débarrasser / note, assiettes prêtes, parti à placer, commande à prendre.
export function tableWork(w: World, s: Actor): [PartyRt, Service['kind']] | null {
  const room = s.deadline - w.t;
  const free = (p: PartyRt) => !p.service;
  const done = w.parties.find((p) => p.state === 'done' && free(p) && partyIdle(w, p));
  if (done && room > 25) return [done, 'clear'];
  const dish = w.parties.find((p) => p.state === 'ordered' && free(p) && w.t >= p.until);
  if (dish && room > 25) return [dish, 'dish'];
  const door = w.parties.find((p) => p.state === 'door' && free(p));
  const seatable = door && freeTableExists(w) && !w.parties.some((o) => outgoing(o, w.t)) && room > minMeal(w) && w.t < Math.min(w.closing, w.force - minMeal(w));
  if (seatable) return [door, 'seat'];
  const order = w.parties.find((p) => p.state === 'seated' && free(p) && p.flags.has('chosen') && partyIdle(w, p));
  if (order && room > 25) return [order, 'order'];
  return null;
}
const freeTableExists = (w: World): boolean => w.stage.tables.some((_, i) => !taken(w, i));
// Un parti attend un serveur (pour le renfort, le signe « j'arrive » et le retour en réserve).
export const tableNeeds = (w: World, p: PartyRt): boolean => !p.service && (p.state === 'door' || p.state === 'done' || (p.state === 'ordered' && w.t >= p.until) || (p.state === 'seated' && p.flags.has('chosen')));

// Le parti suit le serveur depuis la porte, une seconde derrière lui, l'un derrière l'autre, jusqu'à sa place.
function follow(w: World, party: PartyRt): void {
  const xs = seatXs(w, party);
  const t = w.stage.tables[party.table!]!;
  party.actors.forEach((a, k) => {
    Object.assign(a, { active: true, x: atDepth(w, -OUTSIDE), yaw: yawInward(w), free: w.t + 1 + k * 0.5, chain: true });
    a.track.enter = a.free;
    a.fill = 'sit';
    a.pending = [walkTo(xs[k]!), turn(yawToward(xs[k]!, t.x)), gest('sit', { dur: 1 })];
  });
  say(w, `${party.desc} entre`);
}

export function seatBeat(w: World, svc: Service, p: number): Beat | null {
  const { staff: s, party } = svc;
  const t = w.stage.tables[party.table!]!;
  const n = party.actors.length;
  if (p === 0) {
    const door = atDepth(w, HALF + 1);
    return B([[s, [walkTo(s.staff!.post), gest('fetch', { yaw: 12, as: 'menu' }), walkTo(door), turn(yawToDoor(w)), gest('show-table', { yaw: yawToDoor(w) })]]]);
  }
  if (p === 1) {
    follow(w, party);
    return B([[s, [walkTo(t.x), turn(yawToward(t.x, seatXs(w, party)[0]!))]]], undefined, party.actors);
  }
  const k = p - 2;
  if (k >= n) return null;
  const m = party.actors[k]!;
  return B([[s, [gest('hand-menu', { yaw: yawToward(t.x, m.x), carry: k < n - 1 ? 'menu' : null })]], [m, [gest('take-item', { as: 'menu' })]]]);
}

export function orderBeat(w: World, svc: Service, p: number): Beat | null {
  const { staff: s, party } = svc;
  const t = w.stage.tables[party.table!]!;
  const L = party.actors[0]!;
  if (p === 0) return B([[s, [walkTo(t.x), turn(yawToward(t.x, L.x))]]]);
  if (p === 1) return B([[s, [gest('take-order', { carry: null, dur: w.t >= w.closing ? 5 : 5 + w.rng() * 4 })]], [L, [gest('ask')]]], `${party.desc} commande`);
  if (p === 2) return B([[s, [walkTo(w.stage.back), gest('nod', { yaw: 12 })]]], `${s.staff!.label} passe la commande en cuisine`);
  return null;
}

export function dishBeat(w: World, svc: Service, p: number): Beat | null {
  const { staff: s, party } = svc;
  const t = w.stage.tables[party.table!]!;
  const n = party.actors.length;
  if (p === 0) return B([[s, [walkTo(w.stage.back), gest('fetch', { yaw: 12, as: 'plate' }), gest('carry-plates', { dur: 2 }), walkTo(t.x)]]]);
  const k = p - 1;
  if (k >= n) return null;
  const m = party.actors[k]!;
  return B([[s, [gest('serve-plate', { yaw: yawToward(t.x, m.x), carry: k < n - 1 ? 'plate' : null })]]], k === 0 ? `${s.staff!.label} sert ${party.desc}` : undefined);
}

export function clearBeat(w: World, svc: Service, p: number): Beat | null {
  const { staff: s, party } = svc;
  const t = w.stage.tables[party.table!]!;
  const L = party.actors[0]!;
  switch (p) {
    case 0: return B([[s, [walkTo(t.x), turn(yawToward(t.x, L.x))]]]);
    case 1: return B([[s, [gest('clear-table')]]]);
    case 2: return B([[s, [walkTo(w.stage.back), gest('put-down', { yaw: 12 }), gest('fetch', { as: 'ticket' }), walkTo(t.x), turn(yawToward(t.x, L.x))]]]);
    case 3: return B([[s, [gest('bring-bill')]]], `${s.staff!.label} apporte la note`);
    case 4: {
      const pay = payActs(w, party);
      return B([[L, pay.acts], [s, [gest('nod')]]], pay.log);
    }
    case 5: return B([[L, [gest('wave-bye')]], [s, [gest('nod')]]]);
    default: return null;
  }
}

// Fin d'un passage du serveur : le parti passe à l'étape suivante (ou y revient si le serveur a dû partir).
export function afterTable(w: World, svc: Service, aborted: boolean): void {
  const { party, kind } = svc;
  party.since = w.t;
  if (kind === 'seat') {
    if (party.actors.some((a) => a.active)) party.state = 'seated';
    else {
      party.state = 'door';
      party.table = null;
    }
  } else if (kind === 'order') party.state = aborted ? 'seated' : 'ordered';
  else if (kind === 'dish') {
    if (aborted) party.state = 'ordered';
    else {
      party.state = 'eating';
      party.until = Math.max(w.t + 15, Math.min(w.t + 50 + w.rng() * 90, w.force - clearReserve(w)));
    }
  } else if (kind === 'clear') {
    if (aborted) party.state = 'done';
    else leave(w, party, 'quitte la table');
  }
  if (kind === 'order' && !aborted) party.until = w.t + Math.min(12 + w.rng() * 18, Math.max(5, w.force - clearReserve(w) - 60 - w.t));
}

// Le meneur d'un parti attablé : lecture de la carte, repas, puis il signale qu'ils ont fini.
export function tableDecide(w: World, party: PartyRt, a: Actor): void {
  if (!SEATED.has(party.state) || party.service || !partyIdle(w, party)) return;
  if (party.state === 'seated' && !party.flags.has('chosen')) {
    party.flags.add('chosen');
    say(w, `${party.desc} lit la carte`);
    const dur = w.t >= w.closing ? 6 : 6 + w.rng() * 10;
    return cast(party.actors.map((m) => [m, [gest('read-menu', { dur }), gest('put-down')]]));
  }
  if (party.state === 'eating') {
    const left = party.until - w.t;
    if (left > 2) return cast(party.actors.map((m) => [m, [gest('eat', { dur: Math.min(left, 10 + w.rng() * 15) })]]));
    party.state = 'done';
    party.since = w.t;
    say(w, `${party.desc} a fini de manger`);
    return cast([[a, [gest('ask-bill')]]]);
  }
}
