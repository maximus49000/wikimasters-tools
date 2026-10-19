import { YAW_BACK } from '../figure/gait';
import { hashString, mulberry32 } from '../scene-world';
import { tripAt, tripHappens, type Trip } from './doors';
import { THRESHOLD_S, type Passage } from './doorway';
import type { Dwelling } from './households';
import type { Schedule } from './schedules';

// Lumière des halls d'immeuble : une minuterie, pas une lumière continue. Elle s'allume quand un habitant franchit la porte
// (il sort, il rentre, ou il arrive d'une autre entrée) et s'éteint HALL_TIMER_S secondes après le dernier passage.
export const HALL_TIMER_S = 120;
// Allumage franc, extinction douce (transition d'opacité du calque animé).
export const HALL_ON_S = 0.3;
export const HALL_OFF_S = 1;

// Porte du seuil en cours : la sienne, ou celle de l'autre immeuble au bout du trajet.
export const crossingDoorX = (trip: Trip, pos: Passage): number => (pos.x === trip.doorX || trip.endDoorX === null ? trip.doorX : trip.endDoorX);

// Minuteries au montage de la scène : fin de minuterie par porte (centre x), d'après les passages des HALL_TIMER_S
// dernières secondes. Tirage sans verrou (la boucle prend ensuite le relais avec les habitants réellement affichés).
export function seedHallTimers(trips: readonly Trip[], width: number, t: number, gateOf: (trip: Trip) => number, stepS = 0.5): Map<number, number> {
  const until = new Map<number, number>();
  for (const trip of trips) {
    const gate = gateOf(trip);
    for (let s = t - HALL_TIMER_S; s <= t; s += stepS) {
      const pos = tripAt(trip, width, s);
      if (pos?.stage !== 'threshold' || !tripHappens(trip, s, gate)) continue;
      const x = crossingDoorX(trip, pos);
      until.set(x, Math.max(until.get(x) ?? -Infinity, s + HALL_TIMER_S));
    }
  }
  return until;
}

// Hall allumé : il fait sombre et la minuterie de sa porte court encore.
export const hallLit = (until: ReadonlyMap<number, number>, doorX: number, t: number, dark: boolean): boolean => dark && (until.get(doorX) ?? -Infinity) > t;

// Cage d'escalier : l'habitant qui a relancé la minuterie monte jusqu'à son étage (1..floors), que la minuterie de la cage
// éclaire du rez-de-chaussée jusque-là (0 sans étage). Le passage est identifié par la fin de sa minuterie : même tirage
// tant qu'elle court.
export function stairFloorsLit(doorX: number, until: number, floors: number): number {
  if (floors <= 0) return 0;
  const r = mulberry32(hashString('stair') ^ Math.round(doorX * 8) ^ Math.floor(until * 2))();
  return 1 + Math.floor(r * floors);
}

// Nouveau passage pour la cage : porte éteinte jusque-là, ou minuterie relancée après un trou de plus d'un seuil. Pendant
// qu'un habitant reste sur le seuil, la boucle relance la minuterie à chaque image : même passage, même étage.
export const stairNewPassage = (prev: number | undefined, next: number, t: number): boolean => prev === undefined || prev <= t || next - prev > THRESHOLD_S;

// Étages des cages au montage, d'après les minuteries amorcées (un tirage par porte à cage).
export function seedStairFloors(until: ReadonlyMap<number, number>, stairs: ReadonlyMap<number, readonly unknown[]>): Map<number, number> {
  const out = new Map<number, number>();
  for (const [x, wins] of stairs) {
    const u = until.get(x);
    if (u !== undefined) out.set(x, stairFloorsLit(x, u, wins.length));
  }
  return out;
}

// ---------- Retours et départs accrochés aux passages (spec 2026-10-19 « vie au-dessus de la rue » §5.1) ----------
// L'emploi du temps garde ses heures (le logement s'allume à l'heure prévue même sans passage visible) ; quand un passage
// réel tombe à une porte près d'un retour (ou d'un départ) d'un foyer de cet immeuble, il devient ce retour : la cage s'allume
// jusqu'à l'étage du foyer (au lieu d'un étage tiré) et une silhouette y monte (ou en descend avant la sortie). Seule exception
// admise à la pureté de la vie des logements : elle dépend des passages affichés.

// Un passage à moins de RETURN_WINDOW_MIN minutes d'un `return` (entrant) ou d'un `depart` (sortant) du foyer devient celui-ci :
// entrant AVANT l'heure du retour (le logement s'allume à l'heure prévue + la montée : jamais avant que l'habitant monte),
// sortant APRÈS l'heure du départ (le logement s'est éteint à l'heure prévue − la montée : jamais pendant la descente).
export const RETURN_WINDOW_MIN = 20;
// Minuterie de la cage pour un retour accroché (le hall garde HALL_TIMER_S) : le temps de monter et d'entrer chez soi.
export const STAIR_RETURN_S = 180;

// Sens d'un passage sur un seuil : de dos (il entre dans l'immeuble) ou de face (il en sort).
export const passageDir = (pos: Passage): 'in' | 'out' => (pos.yaw === YAW_BACK ? 'in' : 'out');

// Clé d'un retour (ou départ) accroché : un même retour n'est accroché qu'à un seul passage (`used`, tenu par la boucle).
export const hookKey = (d: Pick<Dwelling, 'id'>, k: 'return' | 'depart', t: number): string => `${d.id}|${k}|${t}`;

// Foyer de la porte `doorX` dont le retour (`in`) ou le départ (`out`) est le plus proche de la minute `m`, à moins de
// RETURN_WINDOW_MIN, hors ceux déjà accrochés (`used`) ; à égalité, le premier (ordre des logements). Immeuble sans porte
// (doorX null) : jamais. `key` : clé du retour retenu (hookKey).
export function returnHook(dwellings: readonly Dwelling[], schedules: ReadonlyMap<string, Schedule>, doorX: number, m: number, dir: 'in' | 'out', used?: ReadonlySet<string>): { home: Dwelling; key: string } | null {
  const k = dir === 'in' ? 'return' : 'depart';
  let best: { home: Dwelling; key: string } | null = null;
  let gap = RETURN_WINDOW_MIN;
  for (const d of dwellings) {
    if (d.doorX === null || d.doorX !== doorX) continue;
    const s = schedules.get(d.id);
    if (!s) continue;
    for (const seg of s.segments) {
      if (seg.k !== k) continue;
      const g = dir === 'in' ? seg.t - m : m - seg.t;
      if (g < 0) continue;
      if (!(g < gap || (g === gap && best === null))) continue;
      const key = hookKey(d, k, seg.t);
      if (used?.has(key)) continue;
      gap = g;
      best = { home: d, key };
    }
  }
  return best;
}
export const returnHome = (dwellings: readonly Dwelling[], schedules: ReadonlyMap<string, Schedule>, doorX: number, m: number, dir: 'in' | 'out', used?: ReadonlySet<string>): Dwelling | null =>
  returnHook(dwellings, schedules, doorX, m, dir, used)?.home ?? null;

// Étage (indice dans `levels`, celui des fenêtres de cage `win.level`) du foyer accroché, sinon null.
export const returnFloor = (dwellings: readonly Dwelling[], schedules: ReadonlyMap<string, Schedule>, doorX: number, m: number, dir: 'in' | 'out'): number | null =>
  returnHome(dwellings, schedules, doorX, m, dir)?.floorIdx ?? null;

// Fenêtres de cage (de bas en haut) allumées pour monter au niveau `floorIdx` : celles des paliers jusqu'à ce niveau.
export const stairCountTo = (wins: readonly { level: number }[], floorIdx: number): number => wins.filter((w) => w.level <= floorIdx).length;

// Étages de la cage pour un nouveau passage : jusqu'au foyer accroché, sinon tirés comme avant (stairFloorsLit, `until` :
// fin de la minuterie du hall). `home` : le foyer accroché (minuterie de retour, silhouette), ou null ; `key` : son retour.
export function passageFloors(dwellings: readonly Dwelling[], schedules: ReadonlyMap<string, Schedule>, wins: readonly { level: number }[], doorX: number, until: number, m: number, dir: 'in' | 'out', used?: ReadonlySet<string>): { floors: number; home: Dwelling | null; key?: string } {
  if (wins.length === 0) return { floors: 0, home: null };
  const got = returnHook(dwellings, schedules, doorX, m, dir, used);
  return got ? { floors: stairCountTo(wins, got.home.floorIdx), home: got.home, key: got.key } : { floors: stairFloorsLit(doorX, until, wins.length), home: null };
}

// Silhouette dans la cage (maquette 05-etat.js `streetEvents`) : un retour monte 10 s après le seuil, pendant la montée du
// foyer moins 12 s ; un départ descend de l'étage du foyer et arrive en bas 12 s avant la sortie (`t` : instant du seuil).
// `floors` : fenêtres de cage traversées (0 : aucune silhouette).
export type StairRun = { floors: number; up: boolean; start: number; dur: number };
export function climbRun(home: Pick<Dwelling, 'climb'>, floors: number, t: number, dir: 'in' | 'out'): StairRun {
  const climb = home.climb * 60;
  return dir === 'in' ? { floors, up: true, start: t + 10, dur: Math.max(1, climb - 12) } : { floors, up: false, start: t - climb + 2, dur: Math.max(1, climb - 14) };
}

// Étages allumés retenus pour un passage tiré `floors` à l'instant t : tant qu'une montée ou une descente de la cage n'est pas
// finie (à venir comprise), au moins ses étages — un second passage à la même porte ne fait pas s'éteindre la cage au-dessus
// de la silhouette.
export function keepStairPick(floors: number, run: StairRun | undefined, t: number): number {
  return run && t < run.start + run.dur ? Math.max(floors, run.floors) : floors;
}

// Fenêtre de cage (0 = la plus basse) où passe la silhouette à l'instant t, un étage à la fois ; -1 hors de la montée.
export function stairFigureAt(run: StairRun, t: number): number {
  if (run.floors <= 0 || t < run.start || t >= run.start + run.dur) return -1;
  const k = Math.min(run.floors - 1, Math.floor(((t - run.start) / run.dur) * run.floors));
  return run.up ? k : run.floors - 1 - k;
}
