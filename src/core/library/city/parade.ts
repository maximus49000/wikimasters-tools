import type { FestivityId } from './calendar';
import { hashString, mulberry32 } from '../scene-world';

// Route fermée et grand défilé du 14 juillet (moteur pur, sans état). Tout se calcule depuis l'heure et la graine.
// La route reste fermée jusqu'à la fin de la dépose des barrières (12 h 30 à 13 h 30, voir install.ts) : aucune voiture
// ne roule tant qu'il en reste une sur la chaussée.
export const CLOSURE: readonly [number, number] = [480, 810]; // 8 h à 13 h 30 (minutes)
export const PARADE: readonly [number, number] = [600, 720]; // 10 h à 12 h (minutes)

export const roadClosed = (fests: readonly FestivityId[], minute: number): boolean => fests.includes('bastille') && minute >= CLOSURE[0] && minute < CLOSURE[1];

export type ParadeKind = 'motorbikes' | 'flags' | 'band' | 'infantry' | 'cavalry' | 'jeeps' | 'trucks' | 'tanks' | 'firetruck';
// `start` : instant (s) où le centre de l'unité entre dans le champ par la gauche ; `half` : demi-longueur dessinée (px).
export type ParadeUnit = { id: string; kind: ParadeKind; variant: number; half: number; start: number };

export const PARADE_SPEED = 22; // px/s, commune à toutes les unités
const MARGIN = 40; // espace libre (px) entre deux unités
const HALF: Readonly<Record<ParadeKind, number>> = { motorbikes: 40, flags: 50, band: 90, infantry: 70, cavalry: 80, jeeps: 60, trucks: 80, tanks: 90, firetruck: 80 };
// Tirage pondéré de la suite : jamais deux unités du même type de suite, et la fanfare (poids réduit) jamais à moins de
// quatre unités d'une autre fanfare, pour ne pas en voir deux dans la même vue.
const WEIGHTS: readonly (readonly [ParadeKind, number])[] = [
  ['motorbikes', 1], ['flags', 1], ['band', 0.4], ['infantry', 1.4], ['cavalry', 1], ['jeeps', 1], ['trucks', 1], ['tanks', 1],
];
const BAND_SPACING = 4;
const drawKind = (rng: () => number, recent: readonly ParadeKind[]): ParadeKind => {
  const prev = recent[recent.length - 1];
  const bandNear = recent.slice(-BAND_SPACING).includes('band');
  const pool = WEIGHTS.filter(([k]) => k !== prev && !(k === 'band' && bandNear));
  const total = pool.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [k, w] of pool) {
    r -= w;
    if (r < 0) return k;
  }
  return pool[pool.length - 1]![0];
};

const gap = (a: number, b: number): number => (a + b + MARGIN) / PARADE_SPEED;

// Toutes les unités de 10 h à 12 h : la fanfare ouvre la marche, les pompiers ferment, la suite est tirée de la graine
// (jamais deux fois le même type de suite, fanfare peu fréquente et espacée).
export function paradeUnits(seed: number, width: number, dayStartS: number): ParadeUnit[] {
  void width;
  const rng = mulberry32(seed ^ hashString('bastille-parade'));
  const t0 = dayStartS + PARADE[0] * 60;
  const end = dayStartS + PARADE[1] * 60;
  const make = (n: number, kind: ParadeKind, start: number): ParadeUnit => ({ id: `parade-${n}`, kind, variant: rng(), half: HALF[kind], start });
  const out: ParadeUnit[] = [make(0, 'band', t0)];
  for (;;) {
    const prev = out[out.length - 1]!;
    const kind = drawKind(rng, out.slice(-BAND_SPACING).map((u) => u.kind));
    const start = prev.start + gap(prev.half, HALF[kind]);
    if (start + gap(HALF[kind], HALF.firetruck) >= end) break;
    out.push(make(out.length, kind, start));
  }
  const last = out[out.length - 1]!;
  out.push(make(out.length, 'firetruck', last.start + gap(last.half, HALF.firetruck)));
  return out;
}

// Position (centre) de l'unité à l'instant `t` ; null tant qu'elle n'est pas entrée et une fois sortie.
export function paradeX(u: ParadeUnit, width: number, t: number): number | null {
  const x = -u.half + PARADE_SPEED * (t - u.start);
  return x < -u.half || x > width + u.half ? null : x;
}

// Passage aérien à 10 h, environ 40 s.
export function flypastWindow(dayStartS: number): { start: number; end: number } {
  const start = dayStartS + PARADE[0] * 60;
  return { start, end: start + 40 };
}
