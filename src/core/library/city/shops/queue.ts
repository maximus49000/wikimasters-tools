import { TURN_S } from '../../figure/gait';
import { WORLD_MARGIN, hashString, mulberry32 } from '../../scene-world';
import { MAX_TRIP_PX, THRESHOLD_S, passageAt, type Passage } from '../doorway';
import { WALK_PACE } from '../metrics';

// File d'attente de la boîte de nuit : fonction pure du temps, sans état conservé.
export type QueueMember = {
  id: string; // stable tant que la personne est dans la file
  slot: number; // 0 = devant la porte
  entersAt: number; // instant (s) où elle disparaît dans la porte
  outfitKey: string;
  fade: number; // 0..1 : avancée d'un cran / apparition, 1 = posée
};

const OPEN_MIN = 23 * 60; // ouverture (jeu.-sam. 23 h-5 h, voir catalog.ts)
const PRE_OPEN_MIN = 30; // les videurs arrivent 30 min avant
const MAX_LEN = 6;
const CYCLE_SIZE = 64; // nombre d'entrées tirées par cycle (un générateur par cycle : on ne tire pas toutes les entrées depuis t = 0)
const GAP_MIN = 15;
const GAP_MAX = 30;
export const ADVANCE_S = 1.2; // durée de l'avancée d'un cran (l'entrée dans la porte, côté rendu, dure le temps de sa marche)
const OUTFITS = 12;

const dayMinutes = (minutes: number): number => ((minutes % 1440) + 1440) % 1440;
// Minutes écoulées depuis l'ouverture (0..1439).
const sinceOpening = (minutes: number): number => (dayMinutes(minutes) - OPEN_MIN + 1440) % 1440;

export function nightclubDoor(isOpen: boolean, minutes: number): { cordon: boolean; bouncers: 0 | 2 } {
  const u = sinceOpening(minutes);
  const preOpen = u >= 1440 - PRE_OPEN_MIN; // 22 h 30 → 23 h
  const present = isOpen || preOpen;
  return { cordon: present, bouncers: present ? 2 : 0 };
}

// Longueur cible 0..6 : monte de 23 h à 0 h, plein entre 0 h et 2 h, redescend jusqu'à la fermeture.
function targetLength(minutes: number): number {
  const u = sinceOpening(minutes); // 0 = 23 h
  let level: number;
  if (u < 60) level = 0.3 + 0.7 * (u / 60);
  else if (u < 180) level = 1;
  else level = Math.max(0.15, 1 - (0.85 * (u - 180)) / 120);
  return Math.round(MAX_LEN * level);
}

// Durée d'un cycle = instant de sa dernière entrée.
const cycleLength = (entries: { at: number }[]): number => entries[entries.length - 1]?.at ?? 0;

// Instants d'entrée d'un cycle : écarts de 15 à 30 s tirés d'un générateur propre au cycle.
function cycleEntries(base: number, cycle: number): { id: string; at: number; outfitKey: string }[] {
  const rand = mulberry32((base ^ Math.imul(cycle + 1, 0x9e3779b1)) >>> 0);
  const out: { id: string; at: number; outfitKey: string }[] = [];
  let at = 0;
  for (let k = 0; k < CYCLE_SIZE; k++) {
    at += GAP_MIN + rand() * (GAP_MAX - GAP_MIN);
    out.push({ id: `${cycle}:${k}`, at, outfitKey: `queue-${Math.floor(rand() * OUTFITS)}` });
  }
  return out;
}

// Contrat de `tSeconds` : secondes RELATIVES À LA SESSION (0 = montage de la scène), croissantes d'un appel à l'autre ;
// jamais une minute du jour ni une heure Unix. La file avance avec t (une entrée toutes les 15 à 30 s) ; `minutes` (minute du
// jour) ne règle que sa longueur. Les débuts de cycle (≈ 64 entrées, 16 à 32 min par cycle) sont gardés par file (cycleAt) :
// chaque cycle n'est généré qu'une fois pour sa durée, l'appel courant coûte une dichotomie et un cycle.
export function queueAt(seed: number, slotId: string, tSeconds: number, minutes: number, isOpen: boolean): QueueMember[] {
  if (!isOpen) return [];
  const length = targetLength(minutes);
  if (length === 0) return [];
  const base = (seed ^ hashString(`queue:${slotId}`)) >>> 0;
  const { cycle, offset } = cycleAt(base, tSeconds);
  return collect(base, cycle, offset, cycleEntries(base, cycle), tSeconds, length);
}

// Débuts des cycles déjà connus, par file (`base`) : les cycles se suivent (durée d'un cycle = instant de sa dernière entrée,
// connue en le générant) ; on ne génère que les cycles pas encore vus, puis on cherche par dichotomie celui qui contient t.
// Un t négatif reste dans le cycle 0. Même résultat qu'un parcours depuis le cycle 0, sans le refaire à chaque image.
const starts = new Map<number, number[]>();
const MAX_QUEUES = 64; // garde-fou : au-delà (graines et locaux successifs), on oublie tout
function cycleAt(base: number, t: number): { cycle: number; offset: number } {
  let s = starts.get(base);
  if (!s) {
    if (starts.size >= MAX_QUEUES) starts.clear();
    s = [0];
    starts.set(base, s);
  }
  while (s[s.length - 1]! <= t) s.push(s[s.length - 1]! + cycleLength(cycleEntries(base, s.length - 1)));
  // s[lo] ≤ t < s[hi] (t < 0 : cycle 0).
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid]! <= t) lo = mid;
    else hi = mid;
  }
  return { cycle: lo, offset: s[lo]! };
}

function collect(
  base: number, cycle: number, offset: number,
  entries: { id: string; at: number; outfitKey: string }[], t: number, length: number,
): QueueMember[] {
  // Entrées à venir (au-delà de t) sur ce cycle puis le suivant.
  const upcoming: { id: string; at: number; outfitKey: string }[] = [];
  let lastEntry = offset; // dernière entrée passée (pour l'avancée)
  for (const e of entries) {
    if (offset + e.at <= t) lastEntry = offset + e.at;
    else upcoming.push({ ...e, at: offset + e.at });
  }
  if (upcoming.length < length) {
    const next = cycleEntries(base, cycle + 1);
    const nextOffset = offset + cycleLength(entries);
    for (const e of next) upcoming.push({ ...e, at: nextOffset + e.at });
  }
  const fade = Math.min(1, Math.max(0, (t - lastEntry) / ADVANCE_S));
  return upcoming.slice(0, length).map((e, slot) => ({ id: e.id, slot, entersAt: e.at, outfitKey: e.outfitKey, fade }));
}

// ---------- Arrivées : la personne qui va rejoindre la file y vient à pied ----------
// Allure d'une personne de la file (celle des passants, tirée de son id) : (16 + 8·u)·WALK_PACE px/s.
export function queueWalkSpeed(seed: number, slotId: string, id: string): number {
  const base = (seed ^ hashString(`queue:${slotId}`)) >>> 0;
  return (16 + 8 * mulberry32((base ^ hashString(`walk:${id}`)) >>> 0)()) * WALK_PACE;
}
const MIN_SPEED = 16 * WALK_PACE;

// Géométrie vue par les arrivées (px du monde) : place `pos` de la file = doorX + away·(startPx + pos·pitchPx) ; `max` : places
// visibles (queueLayout) ; `width` : largeur du monde ; `doorXs` : centres des entrées d'immeubles (départs possibles).
export type ArrivalLayout = { doorX: number; away: 1 | -1; startPx: number; pitchPx: number; max: number; width: number; doorXs: readonly number[] };
// `joinAt` : instant J (s, session) où elle apparaît dans la partie visible de la file ; `fromX` : bord du monde ou centre de
// l'entrée d'immeuble (`fromDoor`) ; `toX` : sa place à J ; `passage` : où elle en est (seuil, demi-tour, trottoir).
export type QueueArrival = { id: string; outfitKey: string; joinAt: number; fromX: number; fromDoor: boolean; toX: number; dir: 1 | -1; speed: number; passage: Passage };
// Entrée d'immeuble trop proche de la place visée (celle de l'immeuble même) : on n'en sort pas pour faire trois pas.
const MIN_FROM_DOOR_PX = 40;


// Minute précédente telle que la scène l'a montrée : `minutes`, boîte ouverte ou non, et `since` (s, session) où la minute
// courante a pris effet. Sans elle, la longueur cible est supposée constante (scène montée dans la minute).
export type QueuePrev = { minutes: number; open: boolean; since: number };
// `members` : personnes de la file visible, dans l'ordre (`pos` : place, fractionnaire pendant l'avancée d'un cran) ;
// `arrivals` : personnes en route vers leur place ; `entered` : dernière personne visible entrée dans la porte (instant `at`).
export type QueueSceneMember = { id: string; outfitKey: string; entersAt: number; pos: number };
export type QueueScene = { members: QueueSceneMember[]; arrivals: QueueArrival[]; entered: { id: string; outfitKey: string; at: number } | null };

type Entry = { id: string; at: number; outfitKey: string };
type Trip = { fromX: number; fromDoor: boolean; toX: number; dur: number };
// Plan d'une personne : instant J où elle rejoint la file (toujours l'instant d'une entrée ; -∞ : avant la fenêtre), place à J,
// départ S = J − durée du trajet.
type Plan = { J: number; S: number; pos: number; trip: Trip | null; speed: number };
const LOOKBACK_S = 240; // au-delà, tout le monde est entré (6 places × 30 s au plus) : la fenêtre ne remonte pas plus loin
const EMPTY_SCENE: QueueScene = { members: [], arrivals: [], entered: null };

// Scène de la file à `t` (secondes de session, même temps que queueAt) : file visible et arrivées, d'un seul plan.
// Chaque personne (une entrée à venir) rejoint la file à l'instant d'une entrée, la première où il y a de la place (moins de
// M = min(longueur cible, max) personnes visibles devant elle), et part de façon à y arriver à cet instant : du bord du monde du
// côté de la file (opposé à la porte) ; s'il est à plus de MAX_TRIP_PX, de l'entrée d'immeuble la plus proche au-delà de sa place
// (seuil puis demi-tour, door-passage), à défaut du bord quand même (long trajet, jamais d'apparition en pleine rue). Celles qui
// sont au-delà de `max` attendent hors champ. Sans changement de minute, la file visible est celle de queueAt (M premières).
// Changement de longueur à la minute (`prev`) : qui était déjà en route ou dans la file selon l'ancienne minute (départ avant
// `since`) garde son plan — personne ne disparaît, une file trop longue se vide par la porte sans être remplie ; les autres
// suivent la nouvelle longueur sans partir avant `since` — une file qui s'allonge (ou qui ouvre) se remplit d'arrivées à pied.
export function queueScene(seed: number, slotId: string, t: number, minutes: number, isOpen: boolean, layout: ArrivalLayout, prev?: QueuePrev): QueueScene {
  if (!isOpen) return EMPTY_SCENE;
  const cap = Math.max(0, layout.max);
  const M1 = Math.min(targetLength(minutes), cap);
  const change = prev && prev.since <= t ? prev : undefined;
  const M0 = change ? (change.open ? Math.min(targetLength(change.minutes), cap) : 0) : M1;
  const tb = change ? change.since : Infinity;
  const base = (seed ^ hashString(`queue:${slotId}`)) >>> 0;
  const trip = tripOf(layout);
  const maxDur = Math.max(trip(0, MIN_SPEED).dur, trip(cap + 1, MIN_SPEED).dur);
  const tw = Math.min(t, tb) - LOOKBACK_S;
  const E = entriesAfter(base, tw, t + maxDur, cap + 2);
  const speeds = E.map((e) => queueWalkSpeed(seed, slotId, e.id));

  // Plans de tous, avec la longueur `Mof(x)` selon l'instant et un départ au plus tôt `notBefore` ; les `upTo + 1` premiers plans
  // sont repris de `keep` (engagés).
  const planAll = (Mof: (x: number) => number, notBefore: number, keep: (Plan | null)[] | null, upTo: number): (Plan | null)[] => {
    const plans: (Plan | null)[] = [];
    let lastJ = -Infinity;
    const Mw = Mof(tw);
    for (let k = 0; k < E.length; k++) {
      if (keep && k <= upTo) {
        const p = keep[k] ?? null;
        plans.push(p);
        if (p) lastJ = p.J;
        continue;
      }
      // Déjà dans la file au début de la fenêtre (tête de file d'alors, entrée bien avant t).
      if (k < Mw && lastJ === -Infinity && plans.every((p) => p !== null)) {
        plans.push({ J: -Infinity, S: -Infinity, pos: k, trip: null, speed: speeds[k]! });
        continue;
      }
      let plan: Plan | null = null;
      for (let m = 0; m < k && plan === null; m++) {
        const x = E[m]!.at;
        if (x < lastJ) continue;
        // Visibles devant elle à x (arrivés, pas encore entrés) et avancée en cours (dernière entrée d'une personne visible).
        let ahead = 0;
        let last = -Infinity;
        for (let j = 0; j < k; j++) {
          const p = plans[j];
          if (!p) continue;
          if (E[j]!.at <= x) last = Math.max(last, E[j]!.at);
          else if (p.J <= x) ahead++;
        }
        if (ahead >= Mof(x)) continue;
        const pos = ahead + 1 - Math.min(1, Math.max(0, (x - last) / ADVANCE_S));
        const tr = trip(pos, speeds[k]!);
        if (x - tr.dur < notBefore) continue;
        plan = { J: x, S: x - tr.dur, pos, trip: tr, speed: speeds[k]! };
      }
      plans.push(plan);
      if (plan) lastJ = plan.J;
    }
    return plans;
  };

  let plans: (Plan | null)[];
  if (!change) plans = planAll(() => M1, -Infinity, null, -1);
  else {
    // Plan de l'ancienne minute (longueur M0 pour toujours), engagé jusqu'à la dernière personne partie avant `since`.
    const old = planAll(() => M0, -Infinity, null, -1);
    let upTo = -1;
    old.forEach((p, k) => {
      if (p && p.S < tb) upTo = k;
    });
    plans = planAll((x) => (x < tb ? M0 : M1), tb, old, upTo);
  }

  let last = -Infinity;
  for (let k = 0; k < E.length; k++) if (plans[k] && E[k]!.at <= t) last = Math.max(last, E[k]!.at);
  const fade = Math.min(1, Math.max(0, (t - last) / ADVANCE_S));
  const dir = (-layout.away) as 1 | -1;
  const members: QueueSceneMember[] = [];
  const arrivals: QueueArrival[] = [];
  let entered: QueueScene['entered'] = null;
  for (let k = 0; k < E.length; k++) {
    const p = plans[k];
    const e = E[k]!;
    if (!p) continue;
    if (e.at <= t) {
      if (!entered || e.at > entered.at) entered = { id: e.id, outfitKey: e.outfitKey, at: e.at };
      continue;
    }
    if (p.J <= t) members.push({ id: e.id, outfitKey: e.outfitKey, entersAt: e.at, pos: members.length + 1 - fade });
    else if (p.S <= t && p.trip) {
      const { fromX, fromDoor, toX } = p.trip;
      const passage = passageAt({ fromX, toX, dir, speed: p.speed, fromDoor, toDoor: false }, t - p.S);
      if (passage) arrivals.push({ id: e.id, outfitKey: e.outfitKey, joinAt: p.J, fromX, fromDoor, toX, dir, speed: p.speed, passage });
    }
  }
  return { members, arrivals, entered };
}

// Personnes en route vers la file (voir queueScene).
export function queueArrivals(seed: number, slotId: string, t: number, minutes: number, isOpen: boolean, layout: ArrivalLayout, prev?: QueuePrev): QueueArrival[] {
  return queueScene(seed, slotId, t, minutes, isOpen, layout, prev).arrivals;
}

// Trajet jusqu'à la place `pos` (bord du monde ou entrée d'immeuble, voir queueScene) et sa durée à `speed`.
function tripOf(layout: ArrivalLayout): (pos: number, speed: number) => Trip {
  const { doorX, away, startPx, pitchPx, width, doorXs } = layout;
  const edgeX = away > 0 ? width + WORLD_MARGIN : -WORLD_MARGIN;
  return (pos, speed) => {
    const toX = doorX + away * (startPx + pos * pitchPx);
    const toEdge = Number.isFinite(width) ? Math.abs(edgeX - toX) : Infinity;
    let fromX = edgeX;
    let fromDoor = false;
    if (toEdge > MAX_TRIP_PX) {
      let best: number | null = null;
      for (const x of doorXs) {
        const d = (x - toX) * away;
        if (d >= MIN_FROM_DOOR_PX && d <= MAX_TRIP_PX && (best === null || d < (best - toX) * away)) best = x;
      }
      if (best !== null) {
        fromX = best;
        fromDoor = true;
      } else if (!Number.isFinite(width)) fromX = toX + away * MAX_TRIP_PX; // monde sans bord (scène d'essai) : départ au plafond
    }
    return { fromX, fromDoor, toX, dur: Math.abs(fromX - toX) / speed + (fromDoor ? THRESHOLD_S + TURN_S : 0) };
  };
}

// Entrées postérieures à `from`, dans l'ordre, jusqu'à en avoir `extra` au-delà de `until` (8 cycles au plus).
function entriesAfter(base: number, from: number, until: number, extra: number): Entry[] {
  let { cycle, offset } = cycleAt(base, from);
  const out: Entry[] = [];
  let beyond = 0;
  for (let n = 0; n < 8 && beyond < extra; n++, cycle++) {
    const entries = cycleEntries(base, cycle);
    for (const e of entries) {
      const at = offset + e.at;
      if (at <= from) continue;
      out.push({ ...e, at });
      if (at > until && ++beyond >= extra) break;
    }
    offset += cycleLength(entries);
  }
  return out;
}
