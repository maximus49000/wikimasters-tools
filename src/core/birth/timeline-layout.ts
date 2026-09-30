import type { DatedCard } from './birth-book';

export const CHIP_WIDTH = 140;
const PADDING = 60;
const MIN_WIDTH = 1000;
const MAX_WIDTH = 24000;
const PX_PER_YEAR = 3;
const MIN_TICK_GAP = 90;
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];

export type TimelineItem = DatedCard & { x: number; lane: number };
export type TimelineTick = { year: number; x: number };
export type Timeline = { items: TimelineItem[]; ticks: TimelineTick[]; width: number; lanes: number };

// `dated` trié par année. Chaque carte va sur la première ligne où sa pastille ne chevauche pas la précédente.
export function layoutTimeline(dated: DatedCard[]): Timeline {
  if (dated.length === 0) return { items: [], ticks: [], width: MIN_WIDTH, lanes: 0 };
  const first = dated[0]?.year ?? 0;
  const last = dated[dated.length - 1]?.year ?? first;
  const span = Math.max(last - first, 1);
  const inner = Math.min(Math.max(span * PX_PER_YEAR, MIN_WIDTH - 2 * PADDING), MAX_WIDTH);
  const scale = inner / span;
  const xOf = (year: number) => PADDING + (year - first) * scale;

  const laneEnds: number[] = [];
  const items = dated.map((entry) => {
    const x = xOf(entry.year);
    let lane = laneEnds.findIndex((end) => end <= x);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = x + CHIP_WIDTH + 6;
    return { ...entry, x, lane };
  });

  const step = STEPS.find((candidate) => candidate * scale >= MIN_TICK_GAP) ?? STEPS[STEPS.length - 1] ?? 1;
  const ticks: TimelineTick[] = [];
  for (let year = Math.ceil(first / step) * step; year <= last; year += step) {
    ticks.push({ year, x: xOf(year) });
  }
  return { items, ticks, width: inner + 2 * PADDING + CHIP_WIDTH, lanes: laneEnds.length };
}

export function formatYear(year: number): string {
  const whole = Math.floor(year);
  return whole < 0 ? `${-whole} av. J.-C.` : String(whole);
}
