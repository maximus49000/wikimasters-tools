import { hashString } from '../../../../scene-world';
import { TURN_S } from '../../../../figure/gait';
import type { Outfit } from '../../../people';
import type { ShopTypeId } from '../../catalog';
import type { Family } from '../../gestures';
import { MOVES, type MoveId } from '../moves';
import { PLACE } from '../stage';
import {
  SPEED, cast, gest, hold, idleNow, interrupt, say, walkTo, weighted, yawStaff, yawToward,
  type Act, type Actor, type PartyRt, type World,
} from '../engine';
import { inside } from './places';
import { startService } from './service';

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

export function makeStaff(w: World, list: readonly { id: string; outfit: Outfit; present: [number, number] }[], day: number): Actor[] {
  const anchorAtStart = (i: number) => list.some((o, k) => k !== i && o.present[0] <= 0 && o.present[1] > 0);
  return list.map((o, i) => {
    const post = w.stage.posts[i % w.stage.posts.length]!;
    const reserve = i > 0 && (hashString(`${o.id}|${day}`) & 1) === 1 && anchorAtStart(i);
    const role = ROLE[w.type] ?? 'Employé';
    const label = list.length > 1 ? `${role} ${'ABCDEF'[i] ?? i}` : role;
    const there = !reserve && o.present[0] <= 0 && o.present[1] > 0;
    const a: Actor = {
      id: `staff:${o.id}`, track: { id: `staff:${o.id}`, role: 'staff', outfit: o.outfit, scale: 1, party: null, enter: null, exit: null, segments: [] },
      x: there ? post : w.stage.back, yaw: yawStaff(w), carried: null, free: 0, rest: 0, pending: [], chain: false, fill: 'idle', soft: null, lastFill: false,
      pictoAt: -99, pictoT0: -99, active: there, deadline: Math.min(w.L, o.present[1]) - homeReserve(w), party: null, member: 0,
      staff: { label, post, homeYaw: yawStaff(w), present: o.present, reserve, state: there ? 'floor' : o.present[1] <= 0 ? 'gone' : 'back', service: null, called: false, quietSince: 0 },
    };
    return a;
  });
}

// Quelqu'un attend un employé : file, place au bar / à table, note, client perdu.
const unserved = (w: World, p: PartyRt): boolean =>
  p.service === null && inside(p) && ((p.state === 'spot' && w.type !== 'laundry') || p.state === 'bill' || p.flags.has('asking'));
export const workWaiting = (w: World): boolean => w.queue.some((p) => p.service === null) || w.parties.some((p) => unserved(w, p));

// Arrivées depuis l'arrière-boutique (prise de poste en cours de créneau) et échéances (fin de poste, fin de créneau).
export function staffPresence(w: World): void {
  for (const s of w.staff) {
    const m = s.staff!;
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

// Fin de poste : le renfort et celui qui finit son service repartent dans l'arrière-boutique ; les autres rejoignent le poste.
function goHome(w: World, s: Actor): void {
  const m = s.staff!;
  const away = m.reserve || m.present[1] < w.L;
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

function findWork(w: World, s: Actor): boolean {
  const room = s.deadline - w.t;
  const bill = w.parties.find((p) => p.state === 'bill' && !p.service && idleNow(p.actors[0]!, w.t));
  const head = w.queue.find((p) => !p.service);
  const seat = w.type === 'laundry' ? undefined : w.parties.find((p) => p.state === 'spot' && !p.service && p.actors.every((a) => idleNow(a, w.t)));
  const lost = w.parties.find((p) => p.flags.has('asking') && !p.service && inside(p));
  const [party, kind] = bill ? [bill, 'bill' as const] : head && room > 40 ? [head, 'serve' as const] : seat && room > 40 ? [seat, 'order' as const] : lost ? [lost, 'help' as const] : [null, null];
  if (!party || !kind) return false;
  startService(w, s, party, kind);
  return true;
}

// Activité de boutique vide : aller à l'endroit, faire, revenir ; interruptible (un client passe avant).
function idleActivity(w: World, s: Actor): void {
  const m = s.staff!;
  const empty = !w.parties.some(inside);
  const mate = w.staff.find((o) => o !== s && o.active && o.staff!.state === 'floor' && !o.staff!.service && idleNow(o, w.t));
  if (mate && empty && w.rng() < 0.5) {
    const dur = 8 + w.rng() * 4;
    say(w, `${m.label} et ${mate.staff!.label} discutent, la boutique est vide`);
    cast([[s, [gest('colleague-chat', { dur, soft: true, yaw: yawToward(s.x, mate.x) })]], [mate, [gest('colleague-chat', { dur, soft: true, yaw: yawToward(mate.x, s.x) })]]]);
    s.rest = mate.rest = w.t + dur + 3;
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
  if (w.t < s.rest) return;
  if (Math.abs(s.x - m.post) > 1e-6) return cast([[s, [walkTo(m.post, { soft: true }), { move: 'turn', yaw: m.homeYaw, soft: true }]]]);
  idleActivity(w, s);
}

// En fin de créneau : l'employé reste au poste jusqu'à la borne.
export const settle = (s: Actor, L: number): void => {
  if (s.active) hold(s, L);
};
