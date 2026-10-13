import { tripAt, tripHappens, type Trip } from './doors';
import type { Passage } from './doorway';

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
