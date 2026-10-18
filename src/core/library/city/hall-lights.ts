import { hashString, mulberry32 } from '../scene-world';
import { tripAt, tripHappens, type Trip } from './doors';
import { THRESHOLD_S, type Passage } from './doorway';

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
