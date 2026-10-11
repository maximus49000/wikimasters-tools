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

// Personnes en route vers la file à `t` (secondes de session, même temps que queueAt). Avec M = min(longueur, max) places
// visibles, l'entrée n° i (dans l'ordre des entrées à venir) rejoint la file visible quand l'entrée n° i − M a lieu : J = son
// instant ; elle arrive alors à la place M (l'avancée d'un cran l'amène ensuite en M − 1, comme les autres). Celles qui sont
// au-delà de `max` attendent hors champ : elles ne partent que pour arriver à leur J. Départ du bord du monde du côté de la file
// (opposé à la porte) ; s'il est à plus de MAX_TRIP_PX, de l'entrée d'immeuble la plus proche au-delà de sa place (seuil puis
// demi-tour, door-passage), à défaut du bord quand même (long trajet, jamais d'apparition en pleine rue). Un départ antérieur
// au début de la session est permis : au montage, elle est déjà en route.
export function queueArrivals(seed: number, slotId: string, t: number, minutes: number, isOpen: boolean, layout: ArrivalLayout): QueueArrival[] {
  if (!isOpen) return [];
  const M = Math.min(targetLength(minutes), Math.max(0, layout.max));
  if (M === 0) return [];
  const base = (seed ^ hashString(`queue:${slotId}`)) >>> 0;
  const { doorX, away, startPx, pitchPx, width, doorXs } = layout;
  const toX = doorX + away * (startPx + M * pitchPx);
  const dir = (-away) as 1 | -1;
  const edgeX = away > 0 ? width + WORLD_MARGIN : -WORLD_MARGIN;
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
  const dist = Math.abs(fromX - toX);
  const extra = fromDoor ? THRESHOLD_S + TURN_S : 0;
  const horizon = t + dist / MIN_SPEED + extra; // J au-delà : personne n'est encore parti
  const upcoming = upcomingAt(base, t, M, horizon);
  const out: QueueArrival[] = [];
  for (let i = M; i < upcoming.length; i++) {
    const joinAt = upcoming[i - M]!.at;
    if (joinAt > horizon) break;
    const e = upcoming[i]!;
    const speed = queueWalkSpeed(seed, slotId, e.id);
    const passage = passageAt({ fromX, toX, dir, speed, fromDoor, toDoor: false }, t - (joinAt - dist / speed - extra));
    if (passage) out.push({ id: e.id, outfitKey: e.outfitKey, joinAt, fromX, fromDoor, toX, dir, speed, passage });
  }
  return out;
}

// Entrées à venir (instant > t), dans l'ordre, jusqu'à ce que l'entrée n° (k − M) dépasse `horizon` (8 cycles au plus).
function upcomingAt(base: number, t: number, M: number, horizon: number): { id: string; at: number; outfitKey: string }[] {
  let { cycle, offset } = cycleAt(base, t);
  const out: { id: string; at: number; outfitKey: string }[] = [];
  for (let n = 0; n < 8; n++, cycle++) {
    const entries = cycleEntries(base, cycle);
    for (const e of entries) if (offset + e.at > t) out.push({ ...e, at: offset + e.at });
    if (out.length > M && out[out.length - 1 - M]!.at > horizon) break;
    offset += cycleLength(entries);
  }
  return out;
}
