import type { DayContext } from './calendar';

export type CityContext = { minutes: number; day: DayContext; precip: number; snow: boolean; storm: boolean; daylight: number };
export type CityIntensity = {
  traffic: number;
  walkers: number;
  suits: number;
  schoolTo: number;
  schoolFrom: number;
  kids: number;
  sport: number;
  umbrellas: boolean;
  weekendLike: boolean;
};

type Keys = readonly (readonly [number, number])[];
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
// Fenêtre douce : monte de `from` à `rise`, plateau jusqu'à `fall`, redescend à `to`.
const bump = (h: number, from: number, rise: number, fall: number, to: number): number => smooth(from, rise, h) * (1 - smooth(fall, to, h));

function curve(keys: Keys, hour: number): number {
  for (let i = 1; i < keys.length; i++) {
    const [h1, v1] = keys[i]!;
    const [h0, v0] = keys[i - 1]!;
    if (hour <= h1) return lerp(v0, v1, (hour - h0) / (h1 - h0));
  }
  return keys[keys.length - 1]![1];
}

// Valeurs lues sur les maquettes validées : pointes de circulation à 8 h et 17 h (montée puis descente sur environ 1 h).
const TRAFFIC_WEEK: Keys = [[0, 0.1], [4, 0.03], [6, 0.2], [6.5, 0.3], [7, 0.7], [8, 1], [9, 0.7], [9.5, 0.4], [12, 0.45], [16, 0.5], [16.5, 0.7], [17, 1], [18, 0.8], [18.5, 0.45], [21, 0.25], [23, 0.12], [24, 0.1]];
const TRAFFIC_WEEKEND: Keys = [[0, 0.1], [5, 0.03], [9, 0.25], [11, 0.45], [15, 0.45], [18, 0.35], [21, 0.2], [24, 0.1]];
const WALK_WEEK: Keys = [[0, 0.06], [4, 0.02], [6, 0.15], [7, 0.5], [8, 0.7], [9, 0.3], [12, 0.35], [14, 0.25], [17, 0.7], [18, 0.55], [20, 0.35], [22, 0.15], [24, 0.06]];
const WALK_WEEKEND: Keys = [[0, 0.1], [4, 0.02], [8, 0.2], [10, 0.55], [12, 0.8], [15, 0.8], [18, 0.6], [21, 0.35], [23, 0.15], [24, 0.1]];
const SUITS: Keys = [[0, 0], [6, 0], [7, 0.55], [8, 1], [9, 0.55], [10, 0.15], [12, 0.3], [13.5, 0.2], [16, 0.25], [17, 0.9], [18, 0.6], [19, 0.15], [24, 0]];

export function cityIntensity(ctx: CityContext): CityIntensity {
  const hour = (((ctx.minutes % 1440) + 1440) % 1440) / 60;
  const kind = ctx.day.kind;
  const weekendLike = kind === 'weekend' || kind === 'public-holiday';
  // `b` : 0 = jour de travail, 1 = week-end. Vacances : entre les deux ; mercredi : l'après-midi glisse vers le week-end.
  const b = weekendLike ? 1 : kind === 'holiday' ? 0.6 : kind === 'wednesday' ? smooth(12, 14, hour) * 0.5 : 0;

  const wet = ctx.precip;
  const weatherWalk = (1 - 0.65 * wet) * (ctx.storm ? 0.5 : 1) * (ctx.snow ? 0.6 : 1);
  const traffic = clamp01(lerp(curve(TRAFFIC_WEEK, hour), curve(TRAFFIC_WEEKEND, hour), b) * (1 + 0.25 * wet) * (ctx.snow ? 0.7 : 1));
  const walkers = clamp01(lerp(curve(WALK_WEEK, hour), curve(WALK_WEEKEND, hour), b) * weatherWalk);
  const suits = clamp01(curve(SUITS, hour) * (1 - b) * (1 - b) * weatherWalk);

  const schoolTo = ctx.day.schoolOn ? bump(hour, 7.6, 8.0, 8.3, 8.5) : 0;
  const schoolFrom = kind === 'school' ? bump(hour, 16.5, 16.75, 17.1, 17.4) : kind === 'wednesday' ? bump(hour, 11.5, 11.75, 12.1, 12.4) : 0;

  const light = smooth(0.1, 0.4, ctx.daylight);
  let kidsBase = 0;
  if (weekendLike) kidsBase = bump(hour, 9.5, 11, 17.5, 19) * 0.9;
  else if (kind === 'holiday') kidsBase = bump(hour, 9.5, 11, 17.5, 19) * 0.65;
  else if (kind === 'wednesday') kidsBase = bump(hour, 13.5, 14.5, 17.5, 18.5) * 0.6;
  else kidsBase = bump(hour, 16.8, 17.3, 18, 18.5) * 0.08;
  const kids = clamp01(kidsBase * light * (1 - wet) * (1 - wet));

  const sport = clamp01((bump(hour, 6, 7, 9, 10) + bump(hour, 17, 18, 19.5, 21)) * 0.12 * (weekendLike ? 1.4 : 1) * (1 - wet));

  return { traffic, walkers, suits, schoolTo, schoolFrom, kids, sport, umbrellas: wet >= 0.2, weekendLike };
}
