import { hashString } from '../../../../scene-world';
import { TURN_S } from '../../../../figure/gait';
import type { ShopTypeId } from '../../catalog';
import type { Family } from '../../gestures';
import { MOVES, type MoveId } from '../moves';
import { HALF, PLACE } from '../stage';
import {
  SPEED, cast, gest, hold, idleNow, interrupt, say, walkTo, weighted, yawStaff, yawToward,
  type Act, type Actor, type PartyRt, type Service, type World,
} from '../engine';
import type { DirectorStaff } from '../director';
import { chairNeeds, chairWork } from './chair';
import { inside, placeTaken, serveX } from './places';
import { staffParade } from './reactions';
import { startService } from './service';
import { tableNeeds, tableWork } from './table';

// Employés (G4b) : au poste, ils servent (un parti à la fois), renseignent, encaissent ; boutique vide, ils vivent (essuyer,
// ranger, regarder la rue, téléphone, bâiller, s'étirer, lire, bavarder entre collègues) et reviennent au poste. Le renfort
// attend en réserve dans l'arrière-boutique qu'on l'appelle, et y retourne quand la file est vide.

const ROLE: Partial<Record<ShopTypeId, string>> = {
  bakery: 'Boulanger', pastry: 'Pâtissier', chocolatier: 'Chocolatier', butcher: 'Boucher', fishmonger: 'Poissonnier', cheese: 'Fromager',
  pharmacy: 'Pharmacien', florist: 'Fleuriste', wine: 'Caviste', bookshop: 'Libraire', optician: 'Opticien', bar: 'Barman', cafe: 'Barista',
  tearoom: 'Serveur', restaurant: 'Serveur', pizzeria: 'Pizzaïolo', hairdresser: 'Coiffeur', tattoo: 'Tatoueur',
};
// Activités de boutique vide par famille (poids) ; `rest` = rester au poste un moment.
type Idle = MoveId | 'rest';
const IDLE_BASE: readonly (readonly [Idle, number])[] = [['wipe-counter', 3], ['tidy-shelf', 3], ['look-window', 2], ['phone-idle', 2], ['yawn', 1.5], ['stretch', 1], ['rest', 3]];
const IDLE: Partial<Record<Family, readonly (readonly [Idle, number])[]>> = {
  browse: [['tidy-shelf', 4], ['read-idle', 3], ['look-window', 2], ['phone-idle', 1.5], ['yawn', 1], ['rest', 2]],
  drink: [['wipe-counter', 4], ['tidy-shelf', 2], ['phone-idle', 1.5], ['yawn', 1], ['stretch', 0.5], ['rest', 2]],
};
// Temps d'un trajet de retour au poste depuis l'autre bout de la vitrine, plus les demi-tours.
export const homeReserve = (w: World): number => w.stage.w / SPEED + 2 * TURN_S + 0.5;

// Peut tenir le rôle de renfort (selon le jour) : jamais le premier de la liste du jour (`rank` : rang dans cette liste).
export const mayReserve = (id: string, day: number, rank: number): boolean => rank > 0 && (hashString(`${id}|${day}`) & 1) === 1;

// Poste et rôle de renfort tirés du rang dans la liste du JOUR (pas du rang parmi les présents du créneau) : un collègue en
// pause ne fait pas changer de poste les autres à la borne du créneau. Renfort : en réserve si un collègue qui n'est jamais
// renfort est là au début du créneau (quelqu'un tient toujours la boutique). Aux bornes, chacun reprend où il était : sorti de
// la réserve, il entre par l'arrière-boutique ; renfort qui était au poste, il y est encore et retourne en réserve dès que la
// boutique est calme.
export function makeStaff(w: World, list: readonly DirectorStaff[], day: number): Actor[] {
  const anchorAtStart = (i: number) => list.some((o, k) => k !== i && o.present[0] <= 0 && o.present[1] > 0 && !mayReserve(o.id, day, o.rank ?? k));
  return list.map((o, i) => {
    const rank = o.rank ?? i;
    const post = w.stage.posts[rank % w.stage.posts.length]!;
    const reserve = mayReserve(o.id, day, rank) && anchorAtStart(i);
    const role = ROLE[w.type] ?? 'Employé';
    const label = list.length > 1 ? `${role} ${'ABCDEF'[rank] ?? rank}` : role;
    const there = !(o.fromBack ?? reserve) && o.present[0] <= 0 && o.present[1] > 0;
    const a: Actor = {
      id: `staff:${o.id}`, track: { id: `staff:${o.id}`, role: 'staff', outfit: o.outfit, scale: 1, party: null, enter: null, exit: null, arriveAt: null, dir: null, segments: [] },
      x: there ? post : w.stage.back, yaw: yawStaff(w), carried: null, free: 0, rest: 0, pending: [], chain: false, fill: 'idle', soft: null, lastFill: false, seated: false,
      pictoAt: -99, pictoT0: -99, active: there, deadline: Math.min(w.L, o.present[1]) - homeReserve(w), party: null, member: 0,
      staff: { label, post, homeYaw: yawStaff(w), present: o.present, later: [...(o.later ?? [])], leaves: o.leaves ?? false, reserve, state: there ? 'floor' : o.present[1] <= 0 ? 'gone' : 'back', service: null, called: reserve && there, quietSince: 0 },
    };
    return a;
  });
}

// Quelqu'un attend un employé : file, place au bar / à table, note, client perdu.
const unserved = (w: World, p: PartyRt): boolean =>
  w.family === 'table' ? tableNeeds(w, p) : w.family === 'chair' ? chairNeeds(p)
    : p.service === null && inside(p) && ((p.state === 'spot' && w.type !== 'laundry') || p.state === 'bill' || p.flags.has('asking'));
export const workWaiting = (w: World): boolean => w.queue.some((p) => p.service === null) || w.parties.some((p) => unserved(w, p));

// Arrivées depuis l'arrière-boutique (prise de poste en cours de créneau, retour de pause) et échéances (fin de poste, fin de
// créneau, départ en pause).
export function staffPresence(w: World): void {
  for (const s of w.staff) {
    const m = s.staff!;
    // Plage suivante (retour de pause) : une fois rentré à l'arrière-boutique (ou resté en réserve) à la fin de la précédente.
    const next = m.later[0];
    if (next && !s.active && w.t >= next[0] && (m.state === 'gone' || (m.state === 'back' && w.t >= m.present[1]))) {
      m.present = m.later.shift()!;
      s.deadline = Math.min(w.L, m.present[1]) - homeReserve(w);
      s.rest = 0;
      m.state = 'back';
    }
    if (m.state === 'back' && !m.reserve && w.t >= m.present[0] && w.t < s.deadline) {
      Object.assign(s, { active: true, x: w.stage.back, free: w.t, chain: false });
      s.track.enter = w.t;
      m.state = 'floor';
      s.pending = [walkTo(m.post), { move: 'turn', yaw: m.homeYaw }];
    }
    if (m.state === 'floor' && w.t >= s.deadline && s.rest !== Infinity) {
      interrupt(w, s);
      s.pending = [];
      s.rest = Infinity;
    }
  }
}

// Fin de poste : le renfort, celui qui finit son service (ou part en pause) et celui qui ne sera plus là au créneau suivant
// repartent dans l'arrière-boutique ; les autres rejoignent le poste.
function goHome(w: World, s: Actor): void {
  const m = s.staff!;
  const away = m.reserve || m.present[1] < w.L || (m.leaves && m.later.length === 0);
  if (away) {
    cast([[s, [walkTo(w.stage.back, { free: true })]]]);
    m.state = 'gone';
    return;
  }
  if (Math.abs(s.x - m.post) > 1e-6) cast([[s, [walkTo(m.post, { free: true }), { move: 'turn', yaw: m.homeYaw, free: true }]]]);
  else if (s.yaw !== m.homeYaw) cast([[s, [{ move: 'turn', yaw: m.homeYaw, free: true }]]]);
}
export function left(s: Actor): void {
  if (s.staff?.state === 'gone' && s.active && s.pending.length === 0) {
    s.active = false;
    s.track.exit = s.free;
  }
}

// Travail qu'il prendrait maintenant (sans le commencer) : note, tête de file, place qui attend sa commande, client perdu.
// Un poste ne sert qu'un parti : deux employés au même poste ne serviraient pas deux clients au même endroit.
export function pickWork(w: World, s: Actor): [PartyRt, Service['kind']] | null {
  if (w.family === 'table') return tableWork(w, s);
  if (w.family === 'chair') return chairWork(w, s);
  const room = s.deadline - w.t;
  const postBusy = w.staff.some((o) => o !== s && o.staff!.service?.kind === 'serve' && o.staff!.post === s.staff!.post);
  const bill = w.parties.find((p) => p.state === 'bill' && !p.service && idleNow(p.actors[0]!, w.t));
  const first = w.queue.find((p) => !p.service);
  // Le client précédent doit avoir quitté le comptoir avant qu'on y appelle le suivant.
  const head = postBusy || !first || placeTaken(w, first, serveX(w, s.staff!.post)) ? undefined : first;
  const seat = w.type === 'laundry' ? undefined : w.parties.find((p) => p.state === 'spot' && !p.service && p.actors.every((a) => idleNow(a, w.t)));
  const lost = w.parties.find((p) => p.flags.has('asking') && !p.service && inside(p));
  if (bill && room > 12) return [bill, 'bill'];
  if (head && room > 40) return [head, 'serve'];
  if (seat && room > 40) return [seat, 'order'];
  return lost ? [lost, 'help'] : null;
}
function findWork(w: World, s: Actor): boolean {
  const job = pickWork(w, s);
  if (job) startService(w, s, job[0], job[1]);
  return job !== null;
}

// Activité de boutique vide : aller à l'endroit, faire, revenir ; interruptible (un client passe avant).
function idleActivity(w: World, s: Actor): void {
  const m = s.staff!;
  const empty = !w.parties.some(inside);
  const mate = w.staff.find((o) => o !== s && o.active && o.staff!.state === 'floor' && !o.staff!.service && idleNow(o, w.t));
  if (mate && empty && w.rng() < 0.5) {
    const dur = 8 + w.rng() * 4;
    say(w, `${m.label} et ${mate.staff!.label} discutent, la boutique est vide`);
    // On ne bavarde pas d'un bout à l'autre de la boutique : celui qui engage rejoint l'autre (une place à côté, de son
    // côté), le collègue l'attend le temps du trajet ; tous deux se font face, puis chacun retourne à son poste.
    const near = Math.min(w.stage.w - HALF, Math.max(HALF, mate.x + Math.sign(s.x - mate.x || 1) * PLACE));
    const trip = Math.abs(near - s.x) / SPEED + TURN_S;
    const acts: Act[] = [walkTo(near, { soft: true }), gest('colleague-chat', { dur, soft: true, yaw: yawToward(near, mate.x) })];
    if (near !== m.post) acts.push(walkTo(m.post, { soft: true }));
    acts.push({ move: 'turn', yaw: m.homeYaw, soft: true });
    cast([[s, acts], [mate, [{ move: 'idle', dur: trip, soft: true }, gest('colleague-chat', { dur, soft: true, yaw: yawToward(mate.x, near) })]]]);
    s.rest = mate.rest = w.t + trip + dur + 3;
    return;
  }
  const r = w.rng();
  if (r < 0.025) {
    say(w, `le téléphone sonne — ${m.label} décroche`);
    return cast([[s, [gest('phone-ring')]]]);
  }
  if (r < 0.04) return cast([[s, [gest('sneeze')]]]);
  let kind = weighted(w, IDLE[w.family] ?? IDLE_BASE);
  if (kind === 'look-window' && !empty) kind = 'rest';
  if (kind === 'read-idle' && w.family !== 'browse') kind = 'rest';
  const fast = w.t >= w.closing;
  const md = kind === 'rest' ? null : MOVES[kind];
  const dur = md ? (fast ? md.dur[0] : Math.min(md.dur[1], md.dur[0] * (1 + w.rng() * 0.6))) : 3 + w.rng() * 4;
  // Rayon à ranger : un rayon où personne ne flâne (sinon les étagères du fond).
  const shelves = w.family === 'browse' ? w.stage.spots.filter((x) => !w.parties.some((p) => inside(p) && p.actors.some((a) => Math.abs(a.x - x) < 2 * PLACE))) : [];
  const spot = kind === 'tidy-shelf' ? (shelves.length ? shelves[Math.floor(w.rng() * shelves.length)]! : w.stage.back)
    : kind === 'look-window' ? w.stage.window[Math.floor(w.rng() * w.stage.window.length)]! : m.post;
  const trip = (2 * Math.abs(spot - s.x)) / SPEED + 3 * TURN_S;
  if (w.t + dur + trip >= s.deadline) return void (s.rest = s.deadline);
  if (kind === 'rest') return void (s.rest = w.t + dur);
  const yaw = kind === 'tidy-shelf' ? 12 : kind === 'look-window' ? 4 : m.homeYaw;
  const acts: Act[] = [walkTo(spot, { soft: true }), gest(kind, { dur, yaw, soft: true, ...(kind === 'read-idle' ? { carry: null } : {}) })];
  if (spot !== m.post) acts.push(walkTo(m.post, { soft: true }));
  acts.push({ move: 'turn', yaw: m.homeYaw, soft: true });
  cast([[s, acts]]);
  s.rest = w.t + 1;
}

export function staffDecide(w: World, s: Actor): void {
  const m = s.staff!;
  if (m.service) return;
  // Service interrompu (le client est reparti) : l'article préparé retourne sur le comptoir.
  if (s.carried) return cast([[s, [gest('put-down', { free: true })]]]);
  if (w.t >= s.deadline) return goHome(w, s);
  if (findWork(w, s)) {
    m.quietSince = w.t;
    return;
  }
  if (workWaiting(w) || w.parties.some((p) => inside(p) && p.state !== 'leaving')) m.quietSince = w.t;
  if (m.reserve && m.called && w.t - m.quietSince > 15) {
    say(w, `${m.label} retourne en réserve`);
    cast([[s, [walkTo(w.stage.back, { free: true })]]]);
    m.state = 'gone';
    return;
  }
  if (w.t < s.rest || staffParade(w, s)) return;
  if (Math.abs(s.x - m.post) > 1e-6) return cast([[s, [walkTo(m.post, { soft: true }), { move: 'turn', yaw: m.homeYaw, soft: true }]]]);
  idleActivity(w, s);
}

// En fin de créneau : l'employé reste au poste jusqu'à la borne.
export const settle = (s: Actor, L: number): void => {
  if (s.active) hold(s, L);
};
