import { hashString, mulberry32 } from '../../scene-world';

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
const CYCLE_SIZE = 64; // nombre d'entrées avant que le motif ne reboucle (évite de remonter à t = 0)
const GAP_MIN = 15;
const GAP_MAX = 30;
const ADVANCE_S = 1.2; // durée de l'avancée d'un cran
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

export function queueAt(seed: number, slotId: string, tSeconds: number, minutes: number, isOpen: boolean): QueueMember[] {
  if (!isOpen) return [];
  const length = targetLength(minutes);
  if (length === 0) return [];
  const base = (seed ^ hashString(`queue:${slotId}`)) >>> 0;
  // Les cycles se suivent : durée d'un cycle = instant de sa dernière entrée (connue en le générant).
  // On cherche le cycle courant en avançant depuis le motif replié sur t (durée réelle bornée, CYCLE_SIZE × 30 s max).
  let cycle = 0;
  let offset = 0;
  let entries = cycleEntries(base, cycle);
  while (offset + cycleLength(entries) <= tSeconds) {
    offset += cycleLength(entries);
    cycle++;
    entries = cycleEntries(base, cycle);
  }
  return collect(base, cycle, offset, entries, tSeconds, length);
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
