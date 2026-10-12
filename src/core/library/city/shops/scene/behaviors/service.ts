import { HALF, PLACE } from '../stage';
import {
  atDepth, cast, depth, endService, gest, idleNow, say, walkTo, weighted, yawCounter, yawStaff, yawToDoor, yawToward,
  type Act, type Actor, type Beat, type PartyRt, type Service, type World,
} from '../engine';
import { MOVES } from '../moves';
import { childOf } from './group';
import { afterChair, chairBeat, chairNeeds, claimChair } from './chair';
import { leave } from './customer';
import { browseLike, inside, partyWalk, serveX } from './places';
import { afterTable, claimTable, clearBeat, dishBeat, orderBeat as tableOrderBeat, seatBeat, tableNeeds } from './table';

// Services (G4b) : squelettes des familles joués à deux (employé ↔ parti) en temps successifs. Un temps part quand tous
// les acteurs du temps précédent sont libres : le client qui paie et l'employé qui attend finissent ensemble, puis on
// passe à la suite. Comptoir : salut → demande → service → paiement → remise → au revoir (→ bavardage du bavard).
// Rayon / caisse : l'article posé sur le comptoir, passé en caisse, payé, rendu. Bar, café : l'employé vient à la place,
// prend la commande (une seule pour le groupe), apporte, puis encaisse à la note. Restaurant : table.ts ; fauteuils : chair.ts.
// Jongle : entre deux temps d'un service, l'employé fait signe « j'arrive » à celui qui attend (une fois par parti).

type Pair = [Actor, Act[]];
const B = (pairs: Pair[], log?: string): Beat => ({ acts: pairs.filter(([, acts]) => acts.length > 0), ...(log ? { log } : {}) });
const SKIP: Beat = { acts: [] };
const turn = (yaw: number): Act => ({ move: 'turn', yaw });
const bikes = (w: World): boolean => w.family === 'machine';
// Au bar on sert un verre, au café et au salon de thé une tasse : le même objet de la prise à la remise, puis bu sur place.
const drink = (w: World): { as?: 'glass' | 'cup' } => (w.family !== 'drink' ? {} : { as: w.type === 'bar' ? 'glass' : 'cup' });
const clampCounter = (w: World, x: number): number => {
  const c = w.stage.counter;
  return c ? Math.min(c.x1 - HALF, Math.max(c.x0 + HALF, x)) : atDepth(w, Math.min(w.stage.w - HALF, depth(w, x) + PLACE));
};
// Comptoir en face de cette place (tabourets) : l'employé sert par-dessus ; sinon (mange-debout) il vient à côté.
const overCounter = (w: World, x: number): boolean => !!w.stage.counter && x >= w.stage.counter.x0 - 1e-9 && x <= w.stage.counter.x1 + 1e-9;
// Où l'employé se tient pour servir quelqu'un à sa place : derrière le comptoir en face, sinon à côté (côté fond).
const besideX = (w: World, x: number): number => (overCounter(w, x) ? clampCounter(w, x) : atDepth(w, Math.min(w.stage.w - HALF, depth(w, x) + PLACE * 0.8)));
const facing = (w: World, s: Actor, x: number): number => (overCounter(w, x) ? yawStaff(w) : yawToward(s.x, x));

// Renfort : appelé à l'ouverture d'un service quand au moins deux autres partis attendent encore (le parti servi vient
// de sortir de la file : trois en tout) et qu'un collègue est en réserve → il l'appelle (`!`), le collègue sort de
// l'arrière-boutique (premier segment : marche depuis `stage.back`, la porte de l'arrière-boutique). Au comptoir on compte
// la file ; au bar, au restaurant, au salon : tous ceux qui attendent un employé.
function summon(w: World, s: Actor, party: PartyRt): boolean {
  const r = w.staff.find((o) => o.staff!.reserve && o.staff!.state === 'back' && !o.staff!.called && w.t < o.deadline - 40);
  const n = w.family === 'counter' || browseLike(w) ? w.queue.length : waiting(w, party).length;
  if (!r || n < 2) return false;
  const back = w.stage.back;
  Object.assign(r, { active: true, x: back, yaw: yawToward(back, r.staff!.post), free: w.t + 1.5, chain: true });
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

function askBeat(w: World, s: Actor, party: PartyRt): Beat {
  const L = party.actors[0]!;
  const c = party.p.character;
  const yawS = facing(w, s, L.x);
  if (c === 'regular') return B([[s, [gest('nod', { yaw: yawS })]], [L, [gest('nod')]]], `habitué : ${s.staff!.label} prépare sans qu'il ait à parler`);
  // Indécis pressé par la file : il désigne aussitôt, gestes au plus court.
  if (c === 'undecided' && (party.flags.has('quick') || w.queue.length >= 2 || w.t >= w.closing)) {
    return B([[L, [gest('point-item', { dur: MOVES['point-item'].dur[0] })]], [s, [gest('nod', { dur: MOVES.nod.dur[0] })]]], `${party.desc} se décide vite`);
  }
  if (c === 'undecided') return B([[L, [gest('chin-think'), gest('change-mind')]], [s, [gest('listen')]]], `${party.desc} désigne, se ravise, redésigne`);
  if (c === 'rushed') return B([[L, [gest('point-item')]], [s, [gest('nod')]]]);
  if (c === 'lost') return B([[L, [gest('ask-way')]], [s, [gest('listen')]]]);
  const child = childOf(party);
  const pairs: Pair[] = [[L, [gest(weighted(w, [['ask', 2], ['point-item', 1]] as const))]], [s, [gest('listen')]]];
  if (child && w.rng() < 0.35) pairs.push([child, [gest('child-point')]]);
  return B(pairs);
}

function serveBeat(w: World, svc: Service, p: number): Beat | null {
  const { staff: s, party } = svc;
  const L = party.actors[0]!;
  const post = s.staff!.post;
  const yawS = yawStaff(w);
  const closing = w.t >= w.closing;
  switch (p) {
    case 0: return B([...partyWalk(w, party, serveX(w, post), yawCounter(w)), [s, [walkTo(post), turn(yawS)]]]);
    case 1: return B([[s, [gest(party.p.character === 'regular' ? 'nod' : 'greet', { yaw: yawS })]], [L, [gest(party.p.character === 'rushed' ? 'nod' : 'greet', { yaw: yawCounter(w) })]]]);
    case 2: return askBeat(w, s, party);
    case 3: {
      if (bikes(w)) return B([[s, [gest('prepare', { dur: 5 + w.rng() * 5 })]]], `${s.staff!.label} examine le vélo`);
      if (browseLike(w)) return B([[L, [gest('put-down')]]]);
      const shelf = atDepth(w, Math.min(w.stage.w - HALF, depth(w, post) + PLACE * 0.8));
      const wait: Act[] = party.incidents.delete('phone-ring') ? [gest('phone-ring')] : party.p.character === 'chatty' && w.rng() < 0.5 ? [gest('chat', { dur: 4 })] : [];
      return B([[s, [walkTo(shelf), gest('fetch', { yaw: 12 }), walkTo(post), turn(yawS)]], [L, wait]]);
    }
    case 4: return browseLike(w) ? B([[s, [gest('take-item', { yaw: yawS }), gest('prepare', { dur: 5 })]]]) : SKIP;
    case 5: {
      const pay = payActs(w, party);
      return B([[L, pay.acts], [s, [gest('nod')]]], pay.log);
    }
    case 6: return bikes(w) ? SKIP : B([[s, [gest('hand-over')]], [L, [gest('take-item')]]]);
    case 7: {
      const rushed = party.p.character === 'rushed';
      const chatty = party.p.character === 'chatty' && !closing;
      if (chatty) party.until = w.t + 6 + w.rng() * 8;
      return B([[L, rushed ? [] : [gest('wave-bye')]], [s, [gest('nod')]]], rushed ? `${party.desc} repart aussitôt` : chatty ? `${party.desc} reste accoudé à bavarder` : undefined);
    }
    default: {
      if (party.p.character !== 'chatty' || closing || w.t >= party.until || party.flags.has('cut')) return null;
      if (w.queue.length > 0) {
        party.flags.add('cut');
        return B([[s, [gest('beckon-wait')]], [L, [gest('shrug')]]], `${s.staff!.label} fait signe « j'arrive » au suivant — écourte`);
      }
      const dur = 5 + w.rng() * 3;
      return B([[L, [gest('lean-counter', { dur })]], [s, [gest('chat', { dur })]]]);
    }
  }
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
    const from = w.family === 'drink' ? s.staff!.post : w.stage.back;
    return B([[s, [walkTo(from), gest('fetch', { yaw: 12, ...drink(w) }), walkTo(at), turn(facing(w, s, m.x))]]]);
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
  const next = waiting(w, svc.party).find((p) => !p.flags.has('acked') && w.t - Math.max(p.queuedAt, p.since, p.p.arriveAt) >= 2);
  if (!next) return;
  next.flags.add('acked');
  const o = next.actors[0]!;
  const yaw = o.active ? yawToward(s.x, o.x) : yawToDoor(w);
  say(w, `${s.staff!.label} fait signe « j'arrive » à ${next.desc}`);
  const mine: Act[] = [gest('beckon-wait', { yaw }), turn(s.yaw)];
  lead(beat, s, mine);
  if (o.active && idleNow(o, w.t) && !beat.acts.some(([a]) => a === o)) beat.acts.push([o, [gest('nod')]]);
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
