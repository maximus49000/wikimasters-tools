import { hashString } from '../../../scene-world';
import { TURN_S, facingYaw } from '../../../figure/gait';
import { STREET_SCALE, WALK_PACE } from '../../metrics';
import type { ShopTypeId } from '../catalog';
import { INSIDE_SCALE } from '../customers';
import type { Family } from '../gestures';
import { MOVES, type MoveId, type PropId } from './moves';
import type { Stage } from './stage';
import type { ActorTrack, Incident, Party, Segment, StreetState } from './types';

// Moteur du metteur en scène (G4b) : acteurs, actes, émission des segments, règle de rareté des pictos. Les décisions
// (behaviors/*) poussent des actes ; le moteur les transforme en segments contigus à temps exact (les décisions tombent sur
// les pas de STEP, un enchaînement d'actes se poursuit à l'instant exact où le précédent finit).

// Allure intérieure : celle d'un passant ramenée à la taille dans la vitrine (même règle que innerAt).
export const SPEED = (INSIDE_SCALE * WALK_PACE * 16) / STREET_SCALE.person;
// Un picto par acteur au plus toutes les 8 s ; au plus 2 visibles (~1 s chacun) par boutique.
const PICTO_GAP = 8;
const PICTO_S = 1;
const PICTO_MAX = 2;
const EPS = 1e-9;

export type SegMove = Segment['move'];
export type Act = {
  move: SegMove;
  dur?: number; // s ; sinon tiré dans MOVES (au minimum à la fermeture), ou distance / allure pour une marche
  to?: number; // marche : x cible
  yaw?: number; // orientation voulue pendant le geste (un demi-tour est inséré si besoin)
  carry?: PropId | null; // objet tenu après le geste ; par défaut déduit de la fenêtre d'objet du geste
  as?: PropId; // objet réel à la place de l'objet générique du geste (verre ou tasse au bar, au café)
  soft?: boolean; // interruptible (boutique vide : un client qui attend passe avant)
  free?: boolean; // jamais rogné à l'échéance (la sortie)
};
export type StaffMind = { label: string; post: number; homeYaw: number; present: [number, number]; reserve: boolean; state: 'back' | 'floor' | 'gone'; service: Service | null; called: boolean; quietSince: number };
export type Actor = {
  id: string;
  track: ActorTrack;
  x: number;
  yaw: number;
  carried: PropId | null;
  free: number; // instant où il est libre
  rest: number; // pas de nouvelle initiative avant cet instant (il attend avec `fill`)
  pending: Act[];
  chain: boolean; // l'acte suivant enchaîne à `free` (sinon il part au pas courant)
  fill: SegMove; // geste d'attente quand il n'a rien à faire
  soft: { carried: PropId | null } | null; // acte en cours interruptible (et l'objet tenu avant)
  lastFill: boolean; // le dernier segment est une attente prolongeable
  pictoAt: number; // instant du dernier picto
  pictoT0: number; // début du segment du dernier picto
  active: boolean; // dans la scène
  deadline: number; // au-delà, ses actes sont rognés
  staff: StaffMind | null;
  party: PartyRt | null;
  member: number;
};
// Restaurant : `seated` (menus) → `ordered` (en cuisine) → `eating` → `done` (attend débarrassage et note). Fauteuils :
// `waiting` (chaise d'attente ou debout près de la porte).
export type PartyState = 'street' | 'door' | 'browse' | 'queue' | 'served' | 'spot' | 'stay' | 'bill' | 'seated' | 'ordered' | 'eating' | 'done' | 'waiting' | 'leaving' | 'gone' | 'skipped';
export type PartyRt = {
  p: Party;
  desc: string;
  actors: Actor[];
  state: PartyState;
  since: number; // entrée dans l'état courant
  queuedAt: number;
  spot: number | null; // place (x du meneur) au rayon, au tabouret, à la table
  visits: number; // rayons déjà vus
  holding: boolean; // a pris un article
  incidents: Set<Incident>;
  flags: Set<string>;
  service: Service | null;
  until: number; // fin de séjour (bar, table) ou d'attente dehors
  table: number | null; // restaurant : indice de la table (stage.tables)
  chair: number | null; // fauteuils : x du fauteuil de travail
};
// `wait` : acteurs à attendre en plus de ceux du lot (un parti mis en marche hors du lot, à l'entrée).
export type Beat = { acts: [Actor, Act[]][]; log?: string; wait?: Actor[] };
// Restaurant : `seat` (placement + menus), `order` (carnet → cuisine), `dish` (assiettes), `clear` (débarrassage, note,
// paiement) ; fauteuils : `chair` (installation, signature, paiement).
export type Service = {
  kind: 'serve' | 'help' | 'order' | 'bill' | 'seat' | 'dish' | 'clear' | 'chair';
  staff: Actor;
  party: PartyRt;
  phase: number;
  wait: Actor[]; // acteurs du temps précédent : le suivant part quand tous sont libres
  at: number; // x où l'employé sert
  call: boolean; // renfort appelé à l'ouverture du service (`call-colleague` en tête du premier temps)
  steps?: { staff: Act[]; client: Act[]; log?: string }[]; // fauteuils : étapes de la séance (signature du métier)
};
export type World = {
  type: ShopTypeId;
  family: Family;
  stage: Stage;
  L: number;
  t: number;
  rng: () => number;
  log: string[];
  staff: Actor[];
  parties: PartyRt[];
  queue: PartyRt[];
  closing: number; // plus de flânerie, l'indécis renonce, l'employé accélère
  force: number; // tout client encore dedans repart
  pictos: number[];
  street: StreetState;
  toDoor: 1 | -1; // sens de marche vers la porte
};

export const isFree = (a: Actor, t: number): boolean => a.free <= t + EPS;
export const idleNow = (a: Actor, t: number): boolean => isFree(a, t) && a.pending.length === 0;
// Profondeur depuis la porte ↔ x local.
export const depth = (w: World, x: number): number => (w.stage.doorEdge === 'left' ? x : w.stage.w - x);
export const atDepth = (w: World, d: number): number => (w.stage.doorEdge === 'left' ? d : w.stage.w - d);
// Orientations : vers la porte, vers le fond ; face au comptoir (de dos, tourné vers le fond) ; derrière le comptoir (de face).
export const yawToDoor = (w: World): number => facingYaw(w.toDoor);
export const yawInward = (w: World): number => facingYaw((-w.toDoor) as 1 | -1);
export const yawCounter = (w: World): number => (w.toDoor < 0 ? 13 : 11);
export const yawStaff = (w: World): number => (w.toDoor < 0 ? 5 : 3);
export const yawToward = (from: number, to: number): number => facingYaw(to >= from ? 1 : -1);
// Fin d'un service (normale ou non) : l'employé et le parti redeviennent libres l'un de l'autre.
export function endService(svc: Service): void {
  if (svc.staff.staff) svc.staff.staff.service = null;
  svc.party.service = null;
}
// Un lot d'actes qui partent ensemble au pas courant (marche d'un groupe, temps d'un service).
export function cast(batch: readonly (readonly [Actor, readonly Act[]])[]): void {
  for (const [a, acts] of batch) {
    a.pending.push(...acts);
    a.chain = false;
  }
}
export const say = (w: World, text: string): void => {
  w.log.push(`${Math.round(w.t)} s ${text}`);
};
const pick = (w: World, [a, b]: readonly [number, number], fast: boolean): number => (fast ? a : a + w.rng() * (b - a));

function push(a: Actor, s: Omit<Segment, 'seed'>, fill: boolean): void {
  const k = a.track.segments.length;
  a.track.segments.push({ ...s, seed: (hashString(a.id) ^ Math.imul(k + 1, 2654435761)) >>> 0 });
  a.x = s.x1;
  a.yaw = s.yaw1;
  a.free = s.t1;
  a.lastFill = fill;
}

// Attente jusqu'à `t1` : prolonge l'attente précédente (même geste, ou n'importe laquelle si `move` est omis), sinon ouvre
// un segment (station debout par défaut).
export function hold(a: Actor, t1: number, move?: SegMove): void {
  if (t1 <= a.free + EPS) return;
  const last = a.track.segments[a.track.segments.length - 1];
  if (last && a.lastFill && (move === undefined || last.move === move) && Math.abs(last.t1 - a.free) < EPS) {
    last.t1 = t1;
    a.free = t1;
    return;
  }
  const mv = move ?? 'idle';
  const m = mv in MOVES ? MOVES[mv as MoveId] : null;
  push(a, { t0: a.free, t1, move: mv, x0: a.x, x1: a.x, yaw0: a.yaw, yaw1: a.yaw, prop: m?.prop?.id ?? a.carried, picto: null }, true);
}

// Démarre un acte : départ au pas courant (ou à la fin exacte de l'acte précédent s'il enchaîne), demi-tour si l'orientation
// change, durée, rognage à l'échéance, objet tenu, picto s'il passe la règle de rareté.
export function begin(w: World, a: Actor, act: Act): void {
  if (!a.chain) hold(a, w.t);
  let t = a.free;
  const walking = act.move === 'walk';
  const to = act.to ?? a.x;
  if (walking && Math.abs(to - a.x) < 1e-6) return;
  if (act.move === 'turn' && act.yaw === a.yaw) return;
  const yaw = walking ? yawToward(a.x, to) : act.yaw;
  if (yaw !== undefined && yaw !== a.yaw && act.move !== 'turn') {
    push(a, { t0: t, t1: t + TURN_S, move: 'turn', x0: a.x, x1: a.x, yaw0: a.yaw, yaw1: yaw, prop: a.carried, picto: null }, false);
    t += TURN_S;
  }
  const m = act.move in MOVES ? MOVES[act.move as MoveId] : null;
  const fast = a.staff !== null && w.t >= w.closing;
  let dur = walking ? Math.abs(to - a.x) / SPEED : act.dur ?? (m ? pick(w, m.dur, fast) : TURN_S);
  let x1 = walking ? to : a.x;
  if (!act.free && t < a.deadline && t + dur > a.deadline) {
    dur = a.deadline - t;
    if (walking) x1 = a.x + Math.sign(to - a.x) * SPEED * dur;
  }
  if (dur <= EPS) return;
  let picto = null;
  if (m?.picto) {
    const at = t + m.picto.at * dur;
    const crowd = w.pictos.filter((p) => Math.abs(p - at) < PICTO_S).length;
    if (at - a.pictoAt >= PICTO_GAP && t - a.pictoT0 >= PICTO_GAP && crowd < PICTO_MAX) {
      picto = m.picto.id;
      a.pictoAt = at;
      a.pictoT0 = t;
      w.pictos.push(at);
    }
  }
  const before = a.carried;
  // Un geste qui commence objet en main montre ce que l'acteur tient vraiment (le verre qu'il a pris, pas un objet générique).
  const pid = act.as ?? (m?.prop && m.prop.from === 0 && before ? before : m?.prop?.id);
  const prop = pid ?? a.carried;
  const yaw1 = act.move === 'turn' && act.yaw !== undefined ? act.yaw : a.yaw;
  push(a, { t0: t, t1: t + dur, move: act.move, x0: a.x, x1, yaw0: a.yaw, yaw1, prop, picto }, false);
  a.carried = act.carry !== undefined ? act.carry : m?.prop ? (m.prop.to >= 1 ? pid! : null) : before;
  a.soft = act.soft ? { carried: before } : null;
}

// Joue les actes en attente : le premier part au pas courant, les suivants s'enchaînent sans trou.
export function run(w: World, a: Actor): boolean {
  let did = false;
  while (a.pending.length && isFree(a, w.t)) {
    begin(w, a, a.pending.shift()!);
    a.chain = a.pending.length > 0;
    did = true;
  }
  return did;
}

// Interrompt une activité de boutique vide (rien d'autre) : le segment en cours est coupé à l'instant présent.
export function interrupt(w: World, a: Actor): boolean {
  const last = a.track.segments[a.track.segments.length - 1];
  if (!a.soft || !last || last.move === 'turn' || isFree(a, w.t) || w.t < last.t0) return false;
  const f = (w.t - last.t0) / (last.t1 - last.t0);
  last.x1 = last.x0 + (last.x1 - last.x0) * f;
  last.t1 = w.t;
  if (last.t1 - last.t0 < EPS) a.track.segments.pop();
  a.x = last.x1;
  a.free = w.t;
  a.carried = a.soft.carried;
  a.soft = null;
  a.pending = [];
  a.chain = false;
  return true;
}

// Raccourci : un acte de geste.
export const gest = (move: MoveId, o: Omit<Act, 'move'> = {}): Act => ({ move, ...o });
export const walkTo = (to: number, o: Omit<Act, 'move' | 'to'> = {}): Act => ({ move: 'walk', to, ...o });
export const weighted = <T>(w: World, entries: readonly (readonly [T, number])[]): T => {
  const total = entries.reduce((s, [, p]) => s + p, 0);
  let r = w.rng() * total;
  for (const [v, p] of entries) if ((r -= p) < 0) return v;
  return entries[entries.length - 1]![0];
};
