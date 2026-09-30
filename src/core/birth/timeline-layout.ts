import type { DatedCard } from './birth-book';

export const CHIP_WIDTH = 140;
export const PADDING = 60;
// Zoom maximal : assez large pour un repère par année (l'unité) tous les MIN_TICK_GAP pixels.
export const MAX_PX_PER_YEAR = 120;
export const ZOOM_STEP = 1.5;
const MIN_TICK_GAP = 90;
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

// `width` : largeur de la case (une barre s'étire jusqu'à la fin de l'évènement, jamais moins que CHIP_WIDTH).
export type TimelineItem = DatedCard & { x: number; lane: number; width: number; span: boolean };
export type TimelineTick = { year: number; x: number };
export type Timeline = {
  items: TimelineItem[];
  ticks: TimelineTick[];
  width: number;
  lanes: number;
  first: number;
  // Pixels par année, tel qu'utilisé pour la disposition.
  scale: number;
};

const lastYear = (dated: DatedCard[]) => Math.max(...dated.map((entry) => entry.end ?? entry.year));
const spanOf = (dated: DatedCard[]) => Math.max(lastYear(dated) - (dated[0]?.year ?? 0), 1);

// Zoom minimal : toute la frise tient dans la largeur visible.
export function fitScale(dated: DatedCard[], viewportWidth: number): number {
  const room = Math.max(viewportWidth - 2 * PADDING - CHIP_WIDTH, 100);
  return Math.min(room / spanOf(dated), MAX_PX_PER_YEAR);
}

export function clampScale(scale: number, dated: DatedCard[], viewportWidth: number): number {
  return Math.min(Math.max(scale, fitScale(dated, viewportWidth)), MAX_PX_PER_YEAR);
}

// Pas des repères : le plus petit pas « rond » qui laisse assez de place entre deux repères (jamais moins d'un an).
export function tickStep(scale: number): number {
  return STEPS.find((candidate) => candidate * scale >= MIN_TICK_GAP) ?? STEPS[STEPS.length - 1] ?? 1;
}

// `dated` trié par année. Chaque carte va sur la première ligne où sa pastille ne chevauche pas la précédente.
export function layoutTimeline(dated: DatedCard[], scale: number): Timeline {
  const first = dated[0]?.year ?? 0;
  const last = dated.length > 0 ? lastYear(dated) : first;
  const xOf = (year: number) => PADDING + (year - first) * scale;

  const laneEnds: number[] = [];
  const items = dated.map((entry) => {
    const x = xOf(entry.year);
    let lane = laneEnds.findIndex((end) => end <= x);
    if (lane === -1) lane = laneEnds.length;
    const span = entry.end !== undefined;
    const width = span ? Math.max(CHIP_WIDTH, xOf(entry.end ?? entry.year) - x) : CHIP_WIDTH;
    laneEnds[lane] = x + width + 6;
    return { ...entry, x, lane, width, span };
  });

  const ticks: TimelineTick[] = [];
  if (dated.length > 0) {
    const step = tickStep(scale);
    for (let year = Math.ceil(first / step) * step; year <= last; year += step) {
      ticks.push({ year, x: xOf(year) });
    }
  }
  return { items, ticks, width: Math.max(xOf(last), ...items.map((item) => item.x + item.width)) + PADDING, lanes: laneEnds.length, first, scale };
}

export function formatYear(year: number): string {
  const whole = Math.floor(year);
  return whole < 0 ? `${-whole} av. J.-C.` : String(whole);
}
