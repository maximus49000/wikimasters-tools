import { OUTSIDE } from '../stage';
import {
  atDepth, cast, endService, gest, idleNow, say, walkTo, weighted, yawCounter, yawInward, yawToward,
  type Act, type Actor, type PartyRt, type World,
} from '../engine';
import {
  atPlace, blockXs, placeTaken, queueAnchorIf, browseLike, freeSpots, inside, outgoing, partyIdle, partyWalk, queueAnchor, queueRoom, queued, staffAvailable,
} from './places';
import type { Character } from '../types';
import { chairDecide, chairDoor } from './chair';
import { childOf, followerDecide, groupStay, meet, restMove } from './group';
import { TABLE_PATIENCE, freeTable, tableDecide } from './table';

export { followerDecide };

// Clients (G4b) : entrée par la porte → file / rayon / place → servi (squelette de la famille, service.ts) → séjour éventuel
// → sortie par la porte. Le meneur décide pour le groupe (marches en bloc, même allure : les écarts se gardent) ; les
// accompagnants vivent leur attente (group.ts). Restaurant : on attend à la porte qu'on vous place (table.ts) ; fauteuils :
// on attend son tour sur la chaise d'attente (chair.ts).

const ADJ: Readonly<Record<Character, string>> = { rushed: ' pressé', chatty: ' bavard', undecided: ' indécis', regular: ' habitué', lost: ' perdu', ordinary: '' };
const GROUP = { solo: '', couple: ' (couple)', 'parent-child': ' (parent + enfant)', friends: ' (amis)' } as const;
export const descOf = (p: PartyRt['p']): string => `Client${ADJ[p.character]}${GROUP[p.kind]}`;
// Patience devant la porte quand la boutique est pleine (s).
const PATIENCE = (c: Character): number => (c === 'rushed' ? 8 : 25);
// Vraie raison du demi-tour à la porte : fermeture proche, personne pour servir, quelqu'un sort, plein, pas de place.
function doorReason(w: World, party: PartyRt): string {
  if (w.t >= w.closing) return 'la boutique va fermer';
  if (!staffAvailable(w)) return 'personne pour servir';
  if (w.parties.some((o) => o !== party && outgoing(o, w.t))) return "quelqu'un sort";
  if (w.family === 'table' && freeTable(w) !== null) return 'personne pour servir';
  if (w.family === 'chair' && w.stage.chairs.some((x) => !w.parties.some((o) => o.chair === x && inside(o)))) return 'personne pour servir';
  return w.parties.some((o) => o !== party && inside(o)) ? 'trop de monde' : 'pas de place pour eux';
}
// Entrée selon la famille : au restaurant, le serveur vient vous chercher (rien à faire ici) ; au salon, on va attendre
// sur la chaise d'attente si personne ne peut vous prendre tout de suite.
function tryEnter(w: World, party: PartyRt): boolean {
  if (w.family === 'table') return false;
  if (w.family === 'chair') return chairDoor(w, party);
  if (!canEnter(w, party)) return false;
  enter(w, party);
  return true;
}
// Décalage d'entrée entre deux membres d'un groupe (s) : l'écart se fait à l'allure de marche.
const STAGGER = 0.5;

function canEnter(w: World, party: PartyRt): boolean {
  // On n'entre pas pendant qu'un autre sort : on se croiserait dans l'embrasure.
  if (w.parties.some((o) => o !== party && outgoing(o, w.t))) return false;
  if (w.family === 'machine' && w.type === 'laundry') return freeSpots(w, party).length > 0;
  if (queued(w) && !browseLike(w)) return queueRoom(w, party) && !placeTaken(w, party, queueAnchorIf(w, party));
  return freeSpots(w, party).length > 0;
}

function enter(w: World, party: PartyRt): void {
  const out = atDepth(w, -OUTSIDE);
  let target: number;
  if (queued(w) && !browseLike(w)) {
    w.queue.push(party);
    party.queuedAt = w.t;
    party.state = 'queue';
    target = queueAnchor(w, party);
  } else {
    const spots = freeSpots(w, party);
    party.spot = spots[Math.floor(w.rng() * spots.length)]!;
    party.state = browseLike(w) ? 'browse' : 'spot';
    target = party.spot;
  }
  party.since = w.t;
  const xs = blockXs(w, party, target);
  party.actors.forEach((a, k) => {
    Object.assign(a, { active: true, x: out, yaw: yawInward(w), free: w.t + k * STAGGER, chain: true });
    a.track.enter = a.free;
    a.pending = [walkTo(xs[k]!), { move: 'turn', yaw: browseLike(w) ? 12 : yawCounter(w) }];
  });
  say(w, `${party.desc} entre`);
}

// Arrivées à la porte : personne pour servir → il passe son chemin ; boutique pleine → il attend devant, puis renonce.
export function arrivals(w: World): void {
  for (const party of w.parties) {
    if (party.state === 'street' && w.t >= party.p.arriveAt) {
      if (!staffAvailable(w)) {
        party.state = 'skipped';
        say(w, `${party.desc} passe devant — personne pour servir`);
        continue;
      }
      party.state = 'door';
      party.until = w.t + (w.family === 'table' ? TABLE_PATIENCE(party) : PATIENCE(party.p.character));
    }
    if (party.state !== 'door' || party.service) continue;
    if (w.t < Math.min(w.closing, w.force - 20) && staffAvailable(w) && tryEnter(w, party)) continue;
    if (w.t >= party.until || w.t >= w.closing) {
      // Il a attendu devant la porte et rebrousse chemin : `exit` sans `enter` (instant du demi-tour).
      const why = doorReason(w, party);
      party.state = 'skipped';
      for (const a of party.actors) a.track.exit = w.t;
      say(w, `${party.desc} renonce à la porte — ${why}`);
    }
  }
}

export function leave(w: World, party: PartyRt, why?: string): void {
  if (party.state === 'leaving' || party.state === 'gone') return;
  if (party.service) {
    say(w, `${party.service.staff.staff!.label} a fini avec ${party.desc}`);
    endService(party.service);
  }
  w.queue = w.queue.filter((p) => p !== party);
  party.state = 'leaving';
  party.since = w.t;
  if (why) say(w, `${party.desc} ${why}`);
}
// Fin de créneau : tout client encore dedans repart (ses gestes en cours ont été rognés à cette échéance).
export function forceOut(w: World): void {
  for (const party of w.parties) if (inside(party) && party.state !== 'leaving') {
    for (const a of party.actors) {
      a.pending = [];
      a.chain = false;
    }
    leave(w, party, 'repart : la boutique va fermer');
  }
}
// Sortie du groupe : tous ensemble vers la porte, à la même allure ; chacun quitte la scène en franchissant la porte.
function exitParty(w: World, party: PartyRt): void {
  const out = atDepth(w, -OUTSIDE);
  // Le verre ou la tasse du bar reste sur le comptoir : on ne l'emporte pas dans la rue.
  const keep = (a: Actor): Act[] => (a.carried === 'glass' || a.carried === 'cup' ? [gest('put-down', { free: true, dur: 1 })] : []);
  cast(party.actors.map((a) => [a, [...keep(a), walkTo(out, { free: true })]]));
  party.state = 'gone';
}
export function exited(a: Actor): void {
  if (a.party?.state === 'gone' && a.pending.length === 0 && a.active) {
    a.active = false;
    a.track.exit = a.free;
  }
}

function joinQueue(w: World, party: PartyRt): boolean {
  if (!queueRoom(w, party)) return false;
  w.queue.push(party);
  party.queuedAt = w.t;
  party.state = 'queue';
  return true;
}
const once = (party: PartyRt, flag: string): boolean => !party.flags.has(flag) && !!party.flags.add(flag);
const incident = (party: PartyRt, i: Parameters<PartyRt['incidents']['has']>[0]): boolean => party.incidents.delete(i);

function queueDecide(w: World, party: PartyRt, a: Actor): void {
  if (!staffAvailable(w, 0)) return leave(w, party, 'repart : personne pour servir');
  const anchor = queueAnchor(w, party);
  if (!atPlace(w, party, anchor)) {
    if (partyIdle(w, party) && !placeTaken(w, party, anchor)) {
      cast(partyWalk(w, party, anchor, yawCounter(w)));
      party.spot = null; // il quitte son rayon : la place se libère
    }
    return;
  }
  if (w.t < a.rest) return;
  const c = party.p.character;
  const idx = w.queue.indexOf(party);
  const waited = w.t - party.queuedAt;
  a.rest = w.t + 3 + w.rng() * 5;
  if (c === 'rushed' && idx > 0 && waited > 40) return leave(w, party, "renonce : trop d'attente");
  if (c === 'rushed' && idx > 0 && waited > 22 && once(party, 'grumble')) {
    say(w, `${party.desc} s'impatiente`);
    return cast([[a, [gest('wait-impatient', { yaw: yawCounter(w) })]]]);
  }
  const behind = w.queue.length - 1 - idx;
  if (c === 'undecided' && (behind >= 2 || w.t >= w.closing) && once(party, 'decided')) {
    if (w.t >= w.closing || w.rng() < 0.4) {
      cast([[a, [gest('shrug')]]]);
      return leave(w, party, 'voit la file grossir… et renonce');
    }
    say(w, `${party.desc} voit la file grossir… et se décide`);
    party.flags.add('quick');
    return cast([[a, [gest('nod')]]]);
  }
  if (waited > 3 && incident(party, 'sneeze')) {
    say(w, `${party.desc} éternue`);
    return cast([[a, [gest('sneeze')]]]);
  }
  if (incident(party, 'phone-ring')) {
    say(w, `le téléphone de ${party.desc} sonne`);
    return cast([[a, [gest('phone-ring')]]]);
  }
  const child = childOf(party);
  if (child && idleNow(child, w.t) && incident(party, 'child-tug')) {
    say(w, "l'enfant tire la manche — le parent le retient");
    return cast([[child, [gest('child-tug', { yaw: yawToward(child.x, a.x) })]], [a, [gest('hold-child', { dur: 5, yaw: yawToward(a.x, child.x) })]]]);
  }
  if (meet(w, party, a)) return;
  const nb = w.queue[idx - 1] ?? w.queue[idx + 1];
  if (c === 'chatty' && nb && w.rng() < 0.4 && idleNow(nb.actors[0]!, w.t)) {
    const o = nb.actors[0]!;
    return cast([[a, [gest('chat', { dur: 5 + w.rng() * 3, yaw: yawToward(a.x, o.x) })]], [o, [gest('listen', { dur: 4, yaw: yawToward(o.x, a.x) })]]]);
  }
  const k = weighted(w, c === 'rushed' ? [['phone-idle', 3], ['cross-arms', 3], ['wait', 1]] as const : c === 'undecided' ? [['chin-think', 2], ['wait', 3]] as const : [['wait', 3], ['phone-idle', 1]] as const);
  cast([[a, [gest(k, { yaw: yawCounter(w), ...(k === 'wait' || k === 'phone-idle' ? { dur: 3 + w.rng() * 3 } : {}) })]]]);
}

function browseDecide(w: World, party: PartyRt, a: Actor): void {
  const closing = w.t >= w.closing;
  if (party.holding) {
    if (joinQueue(w, party)) return;
    if (!closing) return void (a.rest = w.t + 2);
    cast([[a, [gest('put-down')]]]);
    party.holding = false;
    return leave(w, party, "repose l'article et repart");
  }
  if (party.spot === null || party.flags.delete('move-on')) {
    const free = freeSpots(w, party);
    const other = free.filter((x) => x !== party.spot);
    const pool = other.length ? other : free;
    if (pool.length === 0) return void (a.rest = w.t + 2);
    party.spot = pool[Math.floor(w.rng() * pool.length)]!;
  }
  if (!atPlace(w, party, party.spot)) {
    if (partyIdle(w, party)) cast(partyWalk(w, party, party.spot, 12));
    return;
  }
  if (party.p.character === 'lost' && once(party, 'lost')) {
    say(w, `${party.desc} regarde partout`);
    party.flags.add('asking');
    a.rest = w.t + 12;
    return cast([[a, [gest('ask-way')]]]);
  }
  if (w.t < a.rest) return;
  party.flags.delete('asking');
  const rushed = party.p.character === 'rushed';
  const acts: Act[] = [gest('browse-shelf', { yaw: 12, dur: rushed ? 8 : 8 + w.rng() * 6 })];
  if (!closing && w.rng() < 0.75) {
    acts.push(gest('take-item'));
    party.holding = true;
    if (party.p.character === 'undecided' && w.rng() < 0.6) {
      say(w, `${party.desc} hésite… repose l'article`);
      acts.push(gest('chin-think'), gest('put-down'));
      party.holding = false;
    }
  }
  party.visits++;
  cast([[a, acts]]);
  if (!party.holding && (party.visits >= (rushed ? 1 : 2) || closing)) return leave(w, party, 'repart sans rien');
  if (!party.holding) party.flags.add('move-on');
}

function spotDecide(w: World, party: PartyRt, a: Actor): void {
  if (party.spot !== null && !atPlace(w, party, party.spot)) return;
  if (meet(w, party, a)) return;
  if (w.type === 'laundry') {
    say(w, `${party.desc} charge une machine`);
    party.state = 'stay';
    party.until = Math.min(w.force - 15, w.t + 30 + w.rng() * 50);
    return cast([[a, [gest('pay-cash', { yaw: 12 }), gest('prepare', { dur: 5 + w.rng() * 5 })]]]);
  }
  if (!party.service && (w.t - party.since > 45 || !staffAvailable(w, 0))) leave(w, party, 'repart : personne ne vient');
}

function stayDecide(w: World, party: PartyRt, a: Actor): void {
  if (!partyIdle(w, party)) return;
  if (w.t >= party.until || w.t >= w.closing) {
    if (w.type === 'laundry') {
      cast([[a, [gest('prepare', { dur: 5 }), gest('take-item')]]]);
      return leave(w, party, 'repart avec son linge');
    }
    cast(party.actors.map((m) => [m, m.carried ? [gest('put-down')] : []]));
    party.actors[0]!.pending.push(gest('ask-bill'));
    party.state = 'bill';
    party.since = w.t;
    return say(w, `${party.desc} demande la note`);
  }
  if (groupStay(w, party) || meet(w, party, a)) return;
  if (w.t < a.rest) return;
  a.rest = w.t + 4 + w.rng() * 6;
  const group = party.actors.length > 1;
  const k = weighted(w, [['drink', a.carried && w.family === 'drink' ? 3 : 0], ['chat', group ? 3 : party.p.character === 'chatty' ? 1 : 0], ['lean-counter', w.family === 'drink' ? 2 : 0], ['phone-idle', 1], ['wait', 2]] as const);
  const yaw = k === 'chat' ? yawToward(a.x, party.actors[1]?.x ?? a.x) : undefined;
  cast([[a, [gest(k, { ...(yaw === undefined ? {} : { yaw }), ...(k === 'drink' || k === 'chat' ? {} : { dur: 4 + w.rng() * 4 }) })]]]);
}

// Meneur : décide pour le groupe selon l'état du parti.
export function leaderDecide(w: World, a: Actor): void {
  const party = a.party!;
  a.fill = restMove(w, a);
  if (party.state === 'leaving') {
    if (partyIdle(w, party)) exitParty(w, party);
  } else if (party.state === 'queue') queueDecide(w, party, a);
  else if (party.state === 'browse') browseDecide(w, party, a);
  else if (party.state === 'spot') spotDecide(w, party, a);
  else if (party.state === 'stay') stayDecide(w, party, a);
  else if (party.state === 'waiting') chairDecide(w, party);
  else tableDecide(w, party, a);
}
