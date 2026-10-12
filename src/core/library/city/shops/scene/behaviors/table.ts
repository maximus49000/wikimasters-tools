import { HALF, OUTSIDE, PLACE, TIGHT } from '../stage';
import { B, inward, turn, type Pair } from '../beats';
import {
  SPEED, atDepth, cast, gest, say, walkTo, yawInward, yawToward,
  type Actor, type Beat, type PartyRt, type Service, type World,
} from '../engine';
import { leave } from './customer';
import { SEATED } from './group';
import { blockXs, inside, outgoing, partyIdle, placeTaken } from './places';
import { payActs } from './service';

// Restaurant (G4b, famille `table`) : le parti entre et attend juste passé la porte qu'un serveur vienne le placer (un
// parti à la fois dans l'entrée ; les autres patientent dehors) ; le serveur prend les cartes, vient à lui, montre la
// table et marche devant (`show-table`), tend un menu à chacun ; on lit la carte assis, on la pose ; le serveur reprend
// les cartes en prenant la commande au carnet, passe en cuisine (arrière-boutique), revient avec les assiettes, sert
// chacun ; on mange ; il débarrasse, rapporte la note, encaisse ; le parti quitte la table. Autant de tables que la
// vitrine en tient (stage.tables : 1 à 31 px, 2 vers 55, 3 dès 59, 4 plus large).
// Chaque passage du serveur est un service à part (seat → order → dish → clear) : entre deux, il sert les autres tables.

// Patience devant la porte du restaurant (s) : on attend volontiers qu'on vous place.
export const TABLE_PATIENCE = (p: PartyRt): number => (p.p.character === 'rushed' ? 20 : 45);
// Temps minimal d'un repas complet (placement → départ) : trajets du serveur (≈ 9 traversées) et gestes au plus court.
const minMeal = (w: World): number => (9 * w.stage.w) / SPEED + 70;
// Réserve pour débarrasser, rapporter la note, encaisser et sortir.
const clearReserve = (w: World): number => (3 * w.stage.w) / SPEED + 30;

// Places assises d'un parti à sa table : le meneur côté fond, l'autre en face, un troisième en bout de table, une
// silhouette plus loin (côté porte, sinon côté fond), sans toucher les convives de la table voisine.
export function seatXs(w: World, party: PartyRt): number[] {
  const t = w.stage.tables[party.table!]!;
  const [a, b] = Math.abs(t.seats[0] - w.stage.back) < Math.abs(t.seats[1] - w.stage.back) ? t.seats : [t.seats[1], t.seats[0]];
  const toDoor = Math.sign(atDepth(w, -OUTSIDE) - b);
  const clampX = (x: number): number => Math.min(w.stage.w - HALF, Math.max(HALF, x));
  const others = w.stage.tables.filter((o) => o !== t).flatMap((o) => o.seats);
  const clear = (x: number): boolean => x >= HALF && x <= w.stage.w - HALF && others.every((o) => Math.abs(o - x) > 2.5);
  const third = [b + toDoor * PLACE, a - toDoor * PLACE].find(clear) ?? clampX(b + toDoor * TIGHT);
  const xs = [a, b, third].slice(0, party.actors.length);
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
  const entry = w.parties.find((p) => p.state === 'waiting' && free(p) && partyIdle(w, p));
  if (entry && freeTableExists(w) && room > minMeal(w) && mealFits(w)) return [entry, 'seat'];
  const order = w.parties.find((p) => p.state === 'seated' && free(p) && p.flags.has('chosen') && partyIdle(w, p));
  if (order && room > 25) return [order, 'order'];
  return null;
}
export const freeTableExists = (w: World): boolean => w.stage.tables.some((_, i) => !taken(w, i));
const mealFits = (w: World): boolean => w.t < Math.min(w.closing, w.force - minMeal(w));
// Un parti attend un serveur (pour le renfort, le signe « j'arrive » et le retour en réserve).
export const tableNeeds = (w: World, p: PartyRt): boolean => !p.service && (p.state === 'door' || p.state === 'waiting' || p.state === 'done' || (p.state === 'ordered' && w.t >= p.until) || (p.state === 'seated' && p.flags.has('chosen')));

// Entrée : la place juste passé la porte doit être libre (personne d'autre ne l'attend, personne ne sort, aucun convive
// assis tout près) ; le parti y entre, l'un derrière l'autre, et attend debout qu'on le place. Sinon il patiente dehors.
export function tableDoor(w: World, party: PartyRt): boolean {
  if (!mealFits(w) || w.parties.some((o) => o !== party && (o.state === 'waiting' || outgoing(o, w.t)))) return false;
  const at = atDepth(w, HALF);
  if (placeTaken(w, party, at)) return false;
  const xs = blockXs(w, party, at);
  party.actors.forEach((a, k) => {
    Object.assign(a, { active: true, x: atDepth(w, -OUTSIDE), yaw: yawInward(w), free: w.t + k * 0.5, chain: true });
    a.track.enter = a.free;
    a.pending = [walkTo(xs[k]!), turn(yawInward(w))];
  });
  Object.assign(party, { state: 'waiting', queuedAt: w.t, since: w.t });
  say(w, `${party.desc} entre et attend qu'on le place`);
  return true;
}
// Dans l'entrée : il repart si personne ne vient, ou si le repas ne tiendrait plus avant la fermeture.
export function tableWait(w: World, party: PartyRt): void {
  if (party.service) return;
  if (!mealFits(w)) return leave(w, party, 'repart : la cuisine va fermer');
  if (w.t - party.since > 60) leave(w, party, 'repart : personne ne vient le placer');
}

export function seatBeat(w: World, svc: Service, p: number): Beat | null {
  const { staff: s, party } = svc;
  const t = w.stage.tables[party.table!]!;
  const n = party.actors.length;
  const L = party.actors[0]!;
  if (p === 0) {
    // Il vient jusqu'au parti qui attend dans l'entrée (une place plus loin que le meneur) et lui montre la table.
    const stand = inward(w, L.x, 1);
    const look = yawToward(stand, L.x);
    return B([[s, [walkTo(s.staff!.post), gest('fetch', { yaw: 12, as: 'menu' }), walkTo(stand), turn(look), gest('show-table', { yaw: look })]]]);
  }
  if (p === 1) {
    // Le serveur marche devant ; le parti le suit une seconde derrière, l'un derrière l'autre, jusqu'à ses places.
    party.flags.add('placed');
    const xs = seatXs(w, party);
    const follow: Pair[] = party.actors.map((a, k) => [a, [{ move: 'idle', dur: 1 + k * 0.5 }, walkTo(xs[k]!), turn(yawToward(xs[k]!, t.x)), gest('sit', { dur: 1 })]]);
    return B([[s, [walkTo(t.x), turn(yawToward(t.x, xs[0]!))]], ...follow]);
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
  // Il reprend les cartes posées sur la table, note la commande (cartes sous le bras), les rapporte en cuisine.
  if (p === 1) {
    const dur = w.t >= w.closing ? 5 : 5 + w.rng() * 4;
    return B([[s, [gest('take-item', { as: 'menu' }), gest('take-order', { as: 'notepad', carry: 'menu', dur })]], [L, [gest('ask')]]], `${party.desc} commande`);
  }
  if (p === 2) return B([[s, [walkTo(w.stage.back), gest('put-down', { yaw: 12 }), gest('nod')]]], `${s.staff!.label} passe la commande en cuisine`);
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
    if (party.flags.has('placed')) party.state = 'seated';
    else {
      party.state = 'waiting';
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
    // Chacun à son rythme : un temps d'arrêt propre à chacun, puis une bouchée de durée propre (on se retrouve à la fin).
    if (left > 2) return cast(party.actors.map((m) => [m, [...(w.rng() < 0.5 ? [gest('sit', { dur: 0.5 + w.rng() * 2 })] : []), gest('eat', { dur: Math.min(left, 8 + w.rng() * 16) })]]));
    party.state = 'done';
    party.since = w.t;
    say(w, `${party.desc} a fini de manger`);
    return cast([[a, [gest('ask-bill')]]]);
  }
}
