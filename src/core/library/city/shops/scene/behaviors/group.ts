import { cast, gest, idleNow, say, weighted, yawToward, type Act, type Actor, type PartyRt, type SegMove, type World } from '../engine';
import { inside } from './places';

// Groupes et connaissances (G4b) : les accompagnants vivent leur attente (le couple se regarde, l'enfant montre et le
// parent le retient, les amis bavardent), les amis trinquent au bar, deux connaissances se reconnaissent et bavardent.
// Le meneur décide pour le groupe (customer.ts) ; ici, seulement les gestes à plusieurs.

const once = (party: PartyRt, flag: string): boolean => !party.flags.has(flag) && !!party.flags.add(flag);
// Membre enfant (plus petit : la taille vient de la distribution, cast.ts).
export const isChild = (a: Actor): boolean => !!a.party?.p.members[a.member]?.child;
export const childOf = (party: PartyRt): Actor | undefined => party.actors.find((m) => m.member > 0 && isChild(m));
// États où le parti est attablé ou installé : on attend assis, aucun geste debout.
export const SEATED: ReadonlySet<PartyRt['state']> = new Set(['seated', 'ordered', 'eating', 'done']);
// Attente sans geste : assis à table (dès qu'il est placé), au fauteuil ou sur la chaise d'attente (le meneur) ; debout
// dans la file (`wait`) ; sinon station debout.
export function restMove(w: World, a: Actor): SegMove {
  const party = a.party!;
  if (party.state === 'leaving' || party.state === 'gone') return 'idle';
  if (w.family === 'table' && party.table !== null && (SEATED.has(party.state) || party.state === 'served')) return 'sit';
  if (a.member === 0 && (party.flags.has('in-chair') || party.flags.has('wait-chair'))) return 'sit';
  return party.state === 'queue' ? 'wait' : 'idle';
}

// Connaissances : `!` réciproque, puis un mot ; si l'ami est juste derrière dans la file, on le laisse passer devant.
// Rend vrai si la rencontre a eu lieu (le meneur a de quoi faire).
export function meet(w: World, party: PartyRt, a: Actor): boolean {
  const friend = w.parties.find((o) => o.p.id === party.p.knows && inside(o) && o.state !== 'leaving');
  if (!friend || party.flags.has('met') || friend.flags.has('met')) return false;
  party.flags.add('met');
  friend.flags.add('met');
  const f = friend.actors[0]!;
  say(w, `${party.desc} reconnaît ${friend.desc}`);
  const mine: Act[] = [gest('recognize', { yaw: yawToward(a.x, f.x) })];
  const batch: [Actor, Act[]][] = [[a, mine]];
  const free = idleNow(f, w.t) && !friend.service;
  if (free) batch.push([f, [gest('recognize', { yaw: yawToward(f.x, a.x) }), gest('listen', { dur: 4 })]]);
  const idx = w.queue.indexOf(party);
  if (idx >= 0 && w.queue[idx + 1] === friend) {
    w.queue[idx] = friend;
    w.queue[idx + 1] = party;
    say(w, `${party.desc} cède son tour à ${friend.desc}`);
    mine.push(gest('let-pass'));
    if (free) batch[1]![1].push(gest('nod', { yaw: yawToward(f.x, a.x) }));
  } else if (free) mine.push(gest('chat', { dur: 4 + w.rng() * 2 }));
  cast(batch);
  return true;
}

// Séjour à plusieurs (bar, café) : les amis trinquent une fois (♪ du geste), puis chacun boit et bavarde.
export function groupStay(w: World, party: PartyRt): boolean {
  if (party.actors.length < 2 || w.family !== 'drink' || !party.actors.every((m) => m.carried) || !once(party, 'toast')) return false;
  say(w, `${party.desc} trinquent !`);
  cast(party.actors.map((m) => [m, [gest('toast')]]));
  return true;
}

// Accompagnant : petits gestes d'attente, jamais longs (le meneur attend qu'il soit libre pour bouger le groupe).
export function followerDecide(w: World, a: Actor): void {
  const party = a.party!;
  const leader = party.actors[0]!;
  a.fill = restMove(w, a);
  if (a.fill === 'sit') return;
  if (!['queue', 'served', 'spot', 'stay', 'bill', 'browse', 'waiting'].includes(party.state) || w.t < a.rest) return;
  // Au plus 6 s de geste, puis au moins 2 s libre : le meneur peut alors déplacer le groupe.
  a.rest = w.t + 8 + w.rng() * 3;
  const toLeader = yawToward(a.x, leader.x);
  const child = isChild(a);
  const k = weighted(w, [
    ['child-point', child ? 1.5 : 0],
    ['couple-look', party.p.kind === 'couple' && !party.flags.has('heart') ? 1 : 0],
    ['drink', party.state === 'stay' && a.carried && w.family === 'drink' ? 3 : 0],
    ['browse-shelf', party.state === 'browse' && !child ? 2 : 0],
    ['chat', party.p.kind === 'friends' ? 2 : 0],
    ['listen', child ? 0 : 1.5],
    ['wait', 3],
  ] as const);
  if (k === 'couple-look') {
    party.flags.add('heart');
    say(w, `${party.desc} se regardent ♥`);
  }
  // L'enfant montre les gâteaux, la vitrine : le parent, s'il est libre, le retient d'une main.
  if (k === 'child-point' && idleNow(leader, w.t) && !party.service && w.rng() < 0.6) {
    say(w, "l'enfant montre du doigt — le parent le retient");
    return cast([[a, [gest('child-point', { yaw: toLeader })]], [leader, [gest('hold-child', { dur: 5, yaw: yawToward(leader.x, a.x) })]]]);
  }
  const dur = k === 'wait' || k === 'chat' || k === 'listen' || k === 'browse-shelf' ? { dur: 3 + w.rng() * 3 } : {};
  cast([[a, [gest(k, { ...dur, ...(k === 'browse-shelf' ? { yaw: 12 } : k === 'wait' ? {} : { yaw: toLeader }) })]]]);
}
