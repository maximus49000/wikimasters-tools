// Horaires des bus de la scène (revue du 2026-10-13 : « personne n'attend le bus toute la nuit »). Les bus ne sont plus tirés
// au hasard dans la circulation : ils passent à l'arrêt selon une grille fixe, propre à chaque sens, comme un vrai réseau.
// Seules les lignes de la plaque de l'arrêt passent (3 au plus), chacune à sa fréquence ; le panneau les annonce sur des
// rangées distinctes. Grille validée par l'utilisateur le 2026-10-13 (minutes entre deux bus d'une ligne, lignes 1 / 2 / 3) :
// - semaine, de 6 h 50 : 24/32/40 jusqu'à 7 h 30, pointe 8/8/8 jusqu'à 9 h 30, journée 16/24/32, pointe 8/8/8 de 16 h 30
//   à 19 h, soirée 24/32/40 jusqu'à 21 h, puis 40/48/56 ;
// - samedi (jour de sorties, plus de bus en journée), de 6 h 50 : 24/32/40 jusqu'à 9 h 30, 16/16/24 jusqu'à 19 h,
//   24/24/32 jusqu'à 21 h, puis 32/40/48 ;
// - dimanche et jours fériés (service réduit), de 8 h : 32/40/48 jusqu'à midi, 24/32/40 jusqu'à 19 h, puis 40/48/56 ;
// - dernier passage de chaque ligne au plus tard à 0 h 30 ; les passages d'après minuit prolongent le service de la veille.
// Grille cadencée : tous les intervalles sont des multiples de CYCLE (8 min) et chaque ligne garde sa minute dans le cycle
// (LINE_PHASE : +0, +3, +5) ; deux lignes ne passent donc jamais à la même minute (2 min d'écart au moins) sans qu'aucun bus
// soit retardé. En circulation, un bus retenu (feu, bouchon) arrive en retard et le suivant garde son heure, comme en vrai.
// Les voyageurs (bus-stop.ts) ne viennent attendre que si un bus de leur ligne passe bientôt, et repartent après le dernier.
import { hashString, mulberry32 } from '../../scene-world';
import type { ScheduledArrival } from './engine';
import type { StopSide } from './bus-stop';

export type ServiceKind = 'week' | 'saturday' | 'sunday';
// Premier passage (minutes depuis minuit) et fin de service (minutes, au-delà de minuit : 1470 = 0 h 30 le lendemain).
export const FIRST_BUS: Readonly<Record<ServiceKind, number>> = { week: 410, saturday: 410, sunday: 480 };
export const LAST_BUS = 1470;

export const STOP_LINES_MAX = 3;
export const CYCLE = 8;
export const LINE_PHASE = [0, 3, 5] as const;
export const PEAK_HEADWAY = 8;
// Écart minimal entre deux bus d'un arrêt, garanti par la grille cadencée (phases 0, 3, 5 dans un cycle de 8).
export const MIN_GAP = 2;

type Band = readonly [until: number, headways: readonly [number, number, number]];
const GRID: Readonly<Record<ServiceKind, readonly Band[]>> = {
  week: [[450, [24, 32, 40]], [570, [8, 8, 8]], [990, [16, 24, 32]], [1140, [8, 8, 8]], [1260, [24, 32, 40]], [Infinity, [40, 48, 56]]],
  saturday: [[570, [24, 32, 40]], [1140, [16, 16, 24]], [1260, [24, 24, 32]], [Infinity, [32, 40, 48]]],
  sunday: [[720, [32, 40, 48]], [1140, [24, 32, 40]], [Infinity, [40, 48, 56]]],
};

// Intervalle (minutes) entre deux bus de la ligne de rang `line` à la minute `m` (410 → 1470) d'un jour de service.
export function lineHeadwayAt(m: number, kind: ServiceKind, line: number): number {
  const band = GRID[kind].find(([until]) => m < until)!;
  return band[1][Math.min(line, 2)]!;
}
// Intervalle de la ligne la plus fréquente (rythme général du réseau).
export const headwayAt = (m: number, kind: ServiceKind): number => lineHeadwayAt(m, kind, 0);

// Passages d'une ligne (rang `line` sur la plaque) un jour de service à l'arrêt d'un sens, en minutes depuis le minuit de ce
// jour (jusqu'à LAST_BUS). Le décalage du jour (0 à 7 min, propre au sens) est commun à toutes les lignes : chacune garde sa
// phase dans le cycle.
export function serviceDepartures(seed: number, day: number, side: StopSide, kind: ServiceKind, line = 0): number[] {
  const r = mulberry32(seed ^ hashString(`bus-timetable-${side}`) ^ Math.imul(day, 2654435761));
  const phase = Math.floor(r() * CYCLE) + (LINE_PHASE[line] ?? 0);
  const first = FIRST_BUS[kind];
  const out: number[] = [];
  let m = first + ((((phase - first) % CYCLE) + CYCLE) % CYCLE);
  while (m <= LAST_BUS) {
    out.push(m);
    m += lineHeadwayAt(m, kind, line);
  }
  return out;
}

// Passages de toutes les lignes de l'arrêt, dans l'ordre (jamais deux à la même minute : grille cadencée).
export type StopDeparture = { m: number; line: number; i: number };
export function stopDepartures(seed: number, day: number, side: StopSide, kind: ServiceKind, lines: number): StopDeparture[] {
  const all: StopDeparture[] = [];
  for (let line = 0; line < lines; line++) serviceDepartures(seed, day, side, kind, line).forEach((m, i) => all.push({ m, line, i }));
  return all.sort((a, b) => a.m - b.m || a.line - b.line);
}

export const serviceKindOf = (weekday: number, holiday: boolean): ServiceKind => (holiday || weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : 'week');

// Voie du bus pour l'arrêt d'un sens (le bus du premier plan sert l'arrêt d'en face, celui du fond le trottoir des immeubles).
const TRACK: Readonly<Record<StopSide, 'near' | 'far'>> = { near: 'near', far: 'far' };
// Le bus entre par le bord un peu avant son heure à l'arrêt (le temps de rouler jusqu'au poteau).
export const LEAD_S = 12;

// Bus attendus autour de la minute de la scène (de 5 minutes avant à `ahead` minutes après), en arrivées planifiées du
// moteur. `today` / `yesterday` : genre de service du jour et de la veille (les passages d'après minuit sont ceux de la veille).
// `lines` : nombre de lignes de la plaque (1 à STOP_LINES_MAX) ; chaque arrivée porte le rang de sa ligne (`line`).
export function busArrivals(o: { seed: number; day: number; nowS: number; minutes: number; today: ServiceKind; yesterday: ServiceKind; ahead?: number; lines?: number }): ScheduledArrival[] {
  const ahead = o.ahead ?? 45;
  const lines = Math.max(1, Math.min(STOP_LINES_MAX, o.lines ?? STOP_LINES_MAX));
  const out: ScheduledArrival[] = [];
  for (const side of ['near', 'far'] as const) {
    for (const [d, kind, shift] of [[o.day - 1, o.yesterday, -1440], [o.day, o.today, 0]] as const) {
      for (const dep of stopDepartures(o.seed, d, side, kind, lines)) {
        const m = dep.m + shift; // minutes depuis le minuit de la scène
        if (m < o.minutes - 5 || m > o.minutes + ahead) continue;
        out.push({ key: `bus-${d}-${side}-${dep.line}-${dep.i}`, kind: 'bus', track: TRACK[side], start: o.nowS + (m - o.minutes) * 60 - LEAD_S, line: dep.line });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
