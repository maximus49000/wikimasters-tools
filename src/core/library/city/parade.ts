import type { FestivityId } from './calendar';
import { hashString, mulberry32 } from '../scene-world';
import { outfitFor, type Outfit } from './people';

// Route fermée et grand défilé du 14 juillet (moteur pur, sans état). Tout se calcule depuis l'heure et la graine.
// La route reste fermée jusqu'à la fin de la dépose des barrières (12 h 30 à 13 h 30, voir install.ts) : aucune voiture
// ne roule tant qu'il en reste une sur la chaussée.
export const CLOSURE: readonly [number, number] = [480, 810]; // 8 h à 13 h 30 (minutes)
export const PARADE: readonly [number, number] = [600, 720]; // 10 h à 12 h (minutes)

export const roadClosed = (fests: readonly FestivityId[], minute: number): boolean => fests.includes('bastille') && minute >= CLOSURE[0] && minute < CLOSURE[1];

export type ParadeKind = 'motorbikes' | 'flags' | 'band' | 'infantry' | 'cavalry' | 'jeeps' | 'trucks' | 'tanks' | 'firetruck';
// `start` : instant (s) où le centre de l'unité entre dans le champ par la gauche ; `half` : demi-longueur dessinée (px).
export type ParadeLane = 'near' | 'far';
export type ParadeUnit = { id: string; kind: ParadeKind; variant: number; half: number; start: number; lane: ParadeLane };

export const PARADE_SPEED = 22; // px/s, commune à toutes les unités
const MARGIN = 40; // espace libre (px) entre deux unités
const HALF: Readonly<Record<ParadeKind, number>> = { motorbikes: 40, flags: 50, band: 90, infantry: 70, cavalry: 80, jeeps: 60, trucks: 80, tanks: 90, firetruck: 80 };
// Tirage pondéré de la suite : jamais deux unités du même type de suite, et la fanfare (poids réduit) jamais à moins de
// quatre unités d'une autre fanfare, pour ne pas en voir deux dans la même vue.
const WEIGHTS: readonly (readonly [ParadeKind, number])[] = [
  ['motorbikes', 1], ['flags', 1], ['band', 0.4], ['infantry', 1.4], ['cavalry', 1], ['jeeps', 1], ['trucks', 1], ['tanks', 1],
];
const BAND_SPACING = 4;
const FAR_OFFSET_S = 12; // départ de la file du fond décalé, pour que les unités des deux files ne soient pas alignées
const drawKind = (rng: () => number, recent: readonly ParadeKind[], lane: ParadeLane): ParadeKind => {
  const prev = recent[recent.length - 1];
  const bandNear = recent.slice(-BAND_SPACING).includes('band');
  const pool = WEIGHTS.filter(([k]) => k !== prev && !(k === 'band' && (bandNear || lane === 'far')));
  const total = pool.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [k, w] of pool) {
    r -= w;
    if (r < 0) return k;
  }
  return pool[pool.length - 1]![0];
};

const gap = (a: number, b: number): number => (a + b + MARGIN) / PARADE_SPEED;

// Un flux par file, indépendant (tirages distincts). File du premier plan : la fanfare ouvre, les pompiers ferment.
// File du fond : porte-drapeaux en tête (pas de fanfare), camions en queue, départ décalé de FAR_OFFSET_S.
function laneUnits(seed: number, lane: ParadeLane, dayStartS: number): ParadeUnit[] {
  const far = lane === 'far';
  const rng = mulberry32(seed ^ hashString(far ? 'bastille-parade-far' : 'bastille-parade'));
  const t0 = dayStartS + PARADE[0] * 60 + (far ? FAR_OFFSET_S : 0);
  const end = dayStartS + PARADE[1] * 60;
  const closer: ParadeKind = far ? 'trucks' : 'firetruck';
  const make = (n: number, kind: ParadeKind, start: number): ParadeUnit => ({ id: far ? `parade-far-${n}` : `parade-${n}`, kind, variant: rng(), half: HALF[kind], start, lane });
  const out: ParadeUnit[] = [make(0, far ? 'flags' : 'band', t0)];
  for (;;) {
    const prev = out[out.length - 1]!;
    const kind = drawKind(rng, out.slice(-BAND_SPACING).map((u) => u.kind), lane);
    const start = prev.start + gap(prev.half, HALF[kind]);
    if (start + gap(HALF[kind], HALF[closer]) >= end) break;
    out.push(make(out.length, kind, start));
  }
  // Évite deux camions de suite en queue de la file du fond.
  if (far && out.length > 1 && out[out.length - 1]!.kind === closer) out.pop();
  const last = out[out.length - 1]!;
  out.push(make(out.length, closer, last.start + gap(last.half, HALF[closer])));
  return out;
}

// Toutes les unités de 10 h à 12 h, sur les deux files de la route fermée (même vitesse, même sens).
export function paradeUnits(seed: number, width: number, dayStartS: number): ParadeUnit[] {
  void width;
  return [...laneUnits(seed, 'far', dayStartS), ...laneUnits(seed, 'near', dayStartS)];
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

// ---------- Foule de spectateurs (spec §7.4) ----------
// Arrivée de 8 h 30 à 10 h, foule complète jusqu'à 12 h 15, départ jusqu'à 13 h 15 (minutes de la scène).
export const CROWD_TIMES = { arrive: 510, full: 600, leave: 735, gone: 795 } as const;
const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// Part de la foule présente à la minute (0 à 1), monotone à l'arrivée comme au départ.
export function crowdLevel(minute: number): number {
  const m = ((minute % 1440) + 1440) % 1440;
  const { arrive, full, leave, gone } = CROWD_TIMES;
  if (m <= arrive || m >= gone) return 0;
  if (m < full) return smoothstep(arrive, full, m);
  if (m <= leave) return 1;
  return 1 - smoothstep(leave, gone, m);
}

export type SpectatorKind = 'adult' | 'child' | 'shoulders';
export type SpectatorProp = 'flag' | 'phone' | 'wave' | 'none';
// `row` : 0 = au bord du trottoir, 1 et 2 = rangs de derrière ; `u` : seuil de présence (présent si u < crowdLevel) ;
// `child` : l'enfant porté sur les épaules (kind 'shoulders') ; `dir` : sens du profil (tourné vers l'arrivée ou la suite du cortège).
export type Spectator = { id: string; x: number; row: 0 | 1 | 2; u: number; kind: SpectatorKind; prop: SpectatorProp; outfit: Outfit; child?: Outfit; dir: 1 | -1; phase: number; jitter: number };

// Espacement moyen (px) par rang : le premier rang, au bord du trottoir, est le plus serré.
export const CROWD_SPACING: readonly [number, number, number] = [9, 14, 20];

export function crowdFor(seed: number, width: number): Spectator[] {
  const rng = mulberry32(seed ^ hashString('bastille-crowd'));
  const out: Spectator[] = [];
  CROWD_SPACING.forEach((step, row) => {
    let x = -6 + rng() * step;
    let n = 0;
    while (x < width + 6) {
      // Famille : un adulte et un enfant côte à côte au premier rang (l'enfant devant, à la barrière).
      const family = row === 0 && rng() < 0.12;
      const roll = rng();
      const kind: SpectatorKind = family ? 'child' : row > 0 && roll < 0.12 ? 'shoulders' : row === 0 && roll < 0.08 ? 'child' : 'adult';
      const pr = rng();
      const prop: SpectatorProp = pr < 0.22 ? 'flag' : pr < 0.36 ? 'phone' : pr < 0.48 ? 'wave' : 'none';
      // Présence : la famille arrive ensemble (même seuil), sinon un tirage par spectateur.
      const u = rng();
      // Pas de ballon par terre dans la foule : l'accessoire 'ball' des enfants devient un sac à dos.
      const dress = (o: Outfit): Outfit => (o.accessory === 'ball' ? { ...o, accessory: 'backpack' } : o);
      const push = (k: SpectatorKind, px: number, p: SpectatorProp): void => {
        out.push({
          id: `crowd-${row}-${n++}`,
          x: px,
          row: row as 0 | 1 | 2,
          u,
          kind: k,
          prop: p,
          outfit: dress(outfitFor(k === 'child' ? 'child' : 'ordinary', rng)),
          child: k === 'shoulders' ? dress(outfitFor('child', rng)) : undefined,
          dir: rng() < 0.5 ? 1 : -1,
          phase: rng(),
          jitter: rng() - 0.5,
        });
      };
      push(kind, x, kind === 'child' && prop === 'phone' ? 'flag' : prop);
      if (family) push('adult', x + step * 0.6, rng() < 0.4 ? 'phone' : 'none');
      x += step * (family ? 1.6 : 0.7 + rng() * 0.6);
    }
  });
  return out;
}
