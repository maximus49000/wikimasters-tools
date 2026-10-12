import { HALF } from '../stage';
import { B, SKIP, bikes, facing, inward, overCounter, turn } from '../beats';
import {
  cast, endService, gest, idleNow, say, walkTo, yawStaff, yawToward,
  type Act, type Actor, type Beat, type PartyRt, type Service, type World,
} from '../engine';
import { drinkSignature } from '../signatures';
import { afterChair, chairBeat, chairNeeds, claimChair } from './chair';
import { askBeat, serveBeat } from './counter';
import { leave } from './customer';
import { browseLike, inside } from './places';
import { afterTable, claimTable, clearBeat, dishBeat, orderBeat as tableOrderBeat, seatBeat, tableNeeds } from './table';

// Services (G4b) : squelettes des familles joués à deux (employé ↔ parti) en temps successifs. Un temps part quand tous
// les acteurs du temps précédent sont libres : le client qui paie et l'employé qui attend finissent ensemble, puis on
// passe à la suite. Comptoir, rayon, caisse : counter.ts (avec les étapes signature du métier). Bar, café : l'employé vient à
// la place, prend la commande (une seule pour le groupe), apporte (le barista la prépare à la machine), puis encaisse à la
// note. Restaurant : table.ts ; fauteuils : chair.ts.
// Jongle : entre deux temps d'un service, l'employé fait signe « j'arrive » à celui qui attend (une fois par parti).

// Au bar on sert un verre, au café et au salon de thé une tasse : le même objet de la prise à la remise, puis bu sur place.
const drink = (w: World): { as?: 'glass' | 'cup' } => (w.family !== 'drink' ? {} : { as: w.type === 'bar' ? 'glass' : 'cup' });
const clampCounter = (w: World, x: number): number => {
  const c = w.stage.counter;
  return c ? Math.min(c.x1 - HALF, Math.max(c.x0 + HALF, x)) : inward(w, x, 1);
};
// Où l'employé se tient pour servir quelqu'un à sa place : derrière le comptoir, une demi-silhouette vers le fond (il
// dépasse derrière l'épaule du client au lieu d'être caché par lui), sinon à côté (côté fond).
const besideX = (w: World, x: number): number => (overCounter(w, x) ? clampCounter(w, inward(w, x, 0.5)) : inward(w, x));

// Renfort : appelé à l'ouverture d'un service quand au moins deux autres partis attendent encore (le parti servi vient
// de sortir de la file : trois en tout) et qu'un collègue est en réserve → il l'appelle (`!`), le collègue sort de
// l'arrière-boutique (premier segment : marche depuis `stage.back`, la porte de l'arrière-boutique). Au comptoir on compte
// la file ; au bar, au restaurant, au salon : tous ceux qui attendent un employé.
// Au comptoir et à la caisse, un renfort qui partagerait le poste de celui qui appelle ne pourrait pas servir (un seul
// parti par poste) : on ne l'appelle pas. Il sort de l'arrière-boutique une fois le bras levé (CALL_S), pas avant.
const CALL_S = 3.5;
function summon(w: World, s: Actor, party: PartyRt): boolean {
  const atPost = w.family === 'counter' || browseLike(w);
  const r = w.staff.find((o) => o.staff!.reserve && o.staff!.state === 'back' && !o.staff!.called && (!atPost || o.staff!.post !== s.staff!.post) && w.t < o.deadline - 40);
  const n = atPost ? w.queue.length : waiting(w, party).length;
  if (!r || n < 2) return false;
  const back = w.stage.back;
  Object.assign(r, { active: true, x: back, yaw: yawToward(back, r.staff!.post), free: w.t + CALL_S, chain: true });
  r.staff!.called = true;
  r.staff!.state = 'floor';
  r.track.enter = r.free;
  r.pending = [walkTo(r.staff!.post), turn(r.staff!.homeYaw)];
  say(w, `${n + 1} partis attendent → ${s.staff!.label} appelle un collègue`);
  return true;
}

const START: Readonly<Record<Service['kind'], string>> = {
  serve: 'libre → accueille', order: 'libre → accueille', bill: '→ encaisse', help: 'indique le rayon',
  seat: '→ place à la table', dish: '→ sert les assiettes', clear: '→ débarrasse', chair: '→ installe',
};
export function startService(w: World, s: Actor, party: PartyRt, kind: Service['kind']): void {
  const leader = party.actors[0]!;
  if (kind === 'seat') claimTable(w, party);
  if (kind === 'chair') claimChair(w, s, party);
  const at = kind === 'serve' || kind === 'help' ? s.staff!.post : besideX(w, leader.x);
  const svc: Service = { kind, staff: s, party, phase: 0, wait: [s, ...party.actors.filter((a) => a.active)], at, call: false };
  s.staff!.service = svc;
  s.staff!.watching = false; // il quitte la vitrine (défilé) pour servir
  party.service = svc;
  if (kind === 'serve') w.queue = w.queue.filter((p) => p !== party);
  if (kind === 'serve' || kind === 'order' || kind === 'seat' || kind === 'chair') party.state = 'served';
  const who = s.staff!.label;
  const what = kind === 'order' && w.family === 'table' ? '→ prend la commande' : kind === 'seat' ? `${START.seat} ${party.table! + 1}` : START[kind];
  say(w, kind === 'help' ? `${party.desc} demande son chemin — ${who} ${what}` : `${party.desc} — ${who} ${what}`);
  svc.call = summon(w, s, party);
}

// Partis qui attendent un employé (hors celui qu'on sert) : file, places, note, porte du restaurant ou du salon.
function waiting(w: World, except: PartyRt | null): PartyRt[] {
  return w.parties.filter((p) => p !== except && !p.service && (w.queue.includes(p)
    || (w.family === 'table' ? tableNeeds(w, p) : w.family === 'chair' ? chairNeeds(p) : inside(p) && (p.state === 'bill' || (p.state === 'spot' && w.type !== 'laundry')))));
}

// Paiement : sans contact pour le pressé ; sinon monnaie (cherchée, parfois tombée et ramassée) ou carte.
// Ce qu'il tient encore (verre, tasse, article) est posé d'abord : la main qui paie est libre, rien ne disparaît.
export function payActs(w: World, party: PartyRt): { acts: Act[]; log?: string } {
  const first: Act[] = party.actors[0]!.carried ? [gest('put-down')] : [];
  if (party.p.character === 'rushed') return { acts: [...first, gest('pay-card')], log: `${party.desc} paie sans contact` };
  const acts: Act[] = [...first];
  const logs: string[] = [];
  if (party.incidents.delete('no-change')) {
    acts.push(gest('search-wallet'));
    logs.push('cherche sa monnaie…');
  }
  if (party.incidents.delete('drop-coin')) {
    acts.push(gest('drop-coin', { as: 'coin' }), gest('pick-coin'));
    logs.push('fait tomber une pièce — la ramasse');
  }
  acts.push(gest(acts.length === first.length && w.rng() < 0.4 ? 'pay-card' : 'pay-cash'));
  return { acts, ...(logs.length ? { log: `${party.desc} ${logs.join(', ')}` } : {}) };
}

function orderBeat(w: World, svc: Service, p: number): Beat | null {
  const { staff: s, party } = svc;
  const L = party.actors[0]!;
  const served = w.family === 'drink' ? party.actors : [L];
  if (p === 0) return B([[s, [walkTo(svc.at), turn(facing(w, s, L.x))]]]);
  if (p === 1) return B([[s, [gest('greet')]], [L, [gest(party.p.character === 'rushed' ? 'nod' : 'greet')]]]);
  if (p === 2) return askBeat(w, s, party);
  const k = Math.floor((p - 3) / 2);
  const m = served[k];
  if (!m) return null;
  const at = besideX(w, m.x);
  if ((p - 3) % 2 === 0) {
    // Prise au comptoir (ou en cuisine), ou la signature du métier (barista : à la machine) ; puis il revient vers le client.
    const sig = drinkSignature(w, s, m);
    const from = w.family === 'drink' ? s.staff!.post : w.stage.back;
    const make: Act[] = sig ? sig.acts : [walkTo(from), gest('fetch', { yaw: 12, ...drink(w) })];
    return B([[s, [...make, walkTo(at), turn(facing(w, s, m.x))]]], k === 0 ? sig?.log : undefined);
  }
  return B([[s, [gest('hand-over')]], [m, [gest('take-item', drink(w))]]]);
}

function billBeat(w: World, svc: Service, p: number): Beat | null {
  const { staff: s, party } = svc;
  const L = party.actors[0]!;
  if (p === 0) return B([[s, [walkTo(svc.at), turn(facing(w, s, L.x))]]]);
  if (p === 1) {
    const pay = payActs(w, party);
    return B([[L, pay.acts], [s, [gest('nod')]]], pay.log);
  }
  if (p === 2) return B([[L, [gest('wave-bye')]], [s, [gest('nod')]]]);
  return null;
}

function helpBeat(w: World, svc: Service, p: number): Beat | null {
  const { staff: s, party } = svc;
  const L = party.actors[0]!;
  if (p === 0) return B([[s, [gest('listen', { dur: 2.5, yaw: yawToward(s.x, L.x) })]], [L, [gest('ask', { yaw: yawToward(L.x, s.x) })]]]);
  if (p === 1) return B([[s, [gest('point-aisle')]], [L, [gest('nod')]]]);
  if (p === 2) return B([[s, [turn(yawStaff(w))]]]);
  return null;
}

function beatOf(w: World, svc: Service, p: number): Beat | null {
  switch (svc.kind) {
    case 'serve': return serveBeat(w, svc, p);
    case 'order': return w.family === 'table' ? tableOrderBeat(w, svc, p) : orderBeat(w, svc, p);
    case 'bill': return billBeat(w, svc, p);
    case 'help': return helpBeat(w, svc, p);
    case 'seat': return seatBeat(w, svc, p);
    case 'dish': return dishBeat(w, svc, p);
    case 'clear': return clearBeat(w, svc, p);
    case 'chair': return chairBeat(w, svc, p);
  }
}

// Gestes de l'employé joués en tête du temps (appel du renfort, signe « j'arrive »).
function lead(beat: Beat, s: Actor, acts: Act[]): void {
  const pair = beat.acts.find(([a]) => a === s);
  if (pair) pair[1].unshift(...acts);
  else beat.acts.push([s, acts]);
}

// Jongle : l'employé occupé fait signe « j'arrive » à un parti qui attend depuis un moment (une fois par parti), puis
// reprend son service. Pas pendant le premier temps (il rejoint encore sa place).
function juggle(w: World, svc: Service, beat: Beat): void {
  const s = svc.staff;
  if (svc.phase < 2) return;
  // La file s'est allongée pendant le service : il appelle le renfort à ce moment-là.
  if (!svc.call && summon(w, s, svc.party)) {
    svc.call = true;
    lead(beat, s, [gest('call-colleague')]);
  }
  // Seulement vers quelqu'un qu'on voit : entré, arrêté à sa place (jamais vers une porte vide).
  const next = waiting(w, svc.party).find((p) => !p.flags.has('acked') && inside(p) && p.actors[0]!.active && idleNow(p.actors[0]!, w.t) && w.t - Math.max(p.queuedAt, p.since, p.p.arriveAt) >= 2);
  if (!next) return;
  next.flags.add('acked');
  const o = next.actors[0]!;
  const yaw = yawToward(s.x, o.x);
  say(w, `${s.staff!.label} fait signe « j'arrive » à ${next.desc}`);
  const mine: Act[] = [gest('beckon-wait', { yaw }), turn(s.yaw)];
  lead(beat, s, mine);
  if (!beat.acts.some(([a]) => a === o)) beat.acts.push([o, [gest('nod')]]);
}

function finish(w: World, svc: Service, aborted: boolean): void {
  const { party, kind } = svc;
  endService(svc);
  say(w, `${svc.staff.staff!.label} a fini avec ${party.desc}`);
  if (kind === 'seat' || kind === 'dish' || kind === 'clear' || (kind === 'order' && w.family === 'table')) return afterTable(w, svc, aborted);
  if (kind === 'chair') return afterChair(w, svc, aborted);
  if (aborted) {
    // L'employé s'en va (fin de service) : le parti attend un autre employé, ou repartira faute de mieux.
    if (party.state === 'served' && kind === 'serve') {
      party.state = 'queue';
      party.queuedAt = w.t;
      w.queue.unshift(party);
    } else if (party.state === 'served') party.state = 'spot';
    party.since = w.t;
    return;
  }
  if (kind === 'serve') leave(w, party, party.p.character === 'rushed' ? undefined : bikes(w) ? 'laisse son vélo et repart' : 'repart avec son achat');
  else if (kind === 'bill') leave(w, party, "s'en va");
  else if (kind === 'help') party.flags.delete('asking');
  else {
    const stay = (party.actors.length > 1 ? 45 : 28) + w.rng() * 30;
    party.state = 'stay';
    party.since = w.t;
    party.until = Math.min(w.force - 30, w.t + stay);
  }
}

// Fait avancer chaque service d'un temps quand ses acteurs sont libres ; l'interrompt si l'employé doit partir.
export function pump(w: World): void {
  for (const s of w.staff) {
    const svc = s.staff!.service;
    if (!svc) continue;
    if (!s.active || w.t >= s.deadline) {
      finish(w, svc, true);
      continue;
    }
    if (!svc.wait.every((a) => idleNow(a, w.t))) continue;
    let beat: Beat | null = SKIP;
    const first = svc.phase === 0;
    while (beat && beat.acts.length === 0 && !beat.wait) beat = beatOf(w, svc, svc.phase++);
    if (!beat) {
      finish(w, svc, false);
      continue;
    }
    if (first && svc.call) {
      lead(beat, s, [gest('call-colleague')]);
    }
    juggle(w, svc, beat);
    if (beat.log) say(w, beat.log);
    cast(beat.acts);
    svc.wait = [...beat.acts.map(([a]) => a), ...(beat.wait ?? [])];
  }
}
