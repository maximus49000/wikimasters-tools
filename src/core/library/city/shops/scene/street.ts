import type { StreetState } from './types';

// État de la rue d'un créneau (G4b, spec §3.5) : lu dans l'état de la ville, déjà déterministe (précipitations et défilé
// par minute du jour, heures de passage des bus et du car scolaire devant la boutique). Résolution d'une seconde.
// `umbrellas` : les passants ont leur parapluie (intensity.umbrellas) ; un client qui sort l'ouvre au lieu d'attendre.
export type StreetInput = {
  slotStartS: number; // début du créneau, s depuis minuit
  length: number; // durée du créneau (s)
  precipAt: (minutes: number) => number;
  paradeActive: (minutes: number) => boolean;
  busArrivalsS: readonly number[]; // s depuis minuit
  umbrellas?: boolean;
};

// Seuil de précipitation d'une averse (0 à 1).
const RAIN = 0.3;

// Premier instant (s du créneau) où la condition est vraie, null sinon.
function firstS(input: StreetInput, test: (minutes: number) => boolean): number | null {
  for (let s = 0; s < input.length; s++) if (test((input.slotStartS + s) / 60)) return s;
  return null;
}
// Dernier instant (s du créneau) où la condition est vraie, null sinon.
function lastS(input: StreetInput, test: (minutes: number) => boolean): number | null {
  for (let s = input.length - 1; s >= 0; s--) if (test((input.slotStartS + s) / 60)) return s;
  return null;
}

export function streetFor(input: StreetInput): StreetState {
  const { slotStartS: t0, length } = input;
  return {
    rainFrom: firstS(input, (m) => input.precipAt(m) >= RAIN),
    paradeFrom: firstS(input, input.paradeActive),
    paradeTo: lastS(input, input.paradeActive),
    busAt: input.busArrivalsS.filter((b) => b >= t0 && b < t0 + length).map((b) => b - t0).sort((a, b) => a - b),
    umbrellas: input.umbrellas ?? false,
  };
}
