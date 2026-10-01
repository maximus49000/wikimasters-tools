import type { Sample } from './price-history';

export type ChartModel = {
  max: string;
  avg: string;
  min: string;
  yMin: number;
  yMax: number;
  last: { max: number; avg: number; min: number };
  // Points isolés (un seul relevé) : une ligne ne se tracerait pas.
  dots: { x: number; yMax: number; yAvg: number; yMin: number } | null;
};

export type ChartBox = { width: number; height: number; padX: number; padY: number };

// Les points anciens, sans extrêmes enregistrés, retombent sur la moyenne.
const maxOf = (s: Sample): number => s.maxBid ?? s.avgBid;
const minOf = (s: Sample): number => s.minBid ?? s.avgBid;

export function buildChart(samples: Sample[], box: ChartBox): ChartModel | null {
  const last = samples.at(-1);
  if (!last) return null;

  const yMax = Math.max(...samples.map(maxOf));
  const yMin = Math.min(...samples.map(minOf));
  const t0 = samples[0]!.t;
  const span = last.t - t0;
  const innerW = box.width - 2 * box.padX;
  const innerH = box.height - 2 * box.padY;

  const x = (t: number): number => box.padX + (span === 0 ? innerW / 2 : ((t - t0) / span) * innerW);
  const y = (v: number): number =>
    box.padY + (yMax === yMin ? innerH / 2 : (1 - (v - yMin) / (yMax - yMin)) * innerH);
  const line = (pick: (s: Sample) => number): string =>
    samples.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.t).toFixed(1)} ${y(pick(s)).toFixed(1)}`).join(' ');

  return {
    max: line(maxOf),
    avg: line((s) => s.avgBid),
    min: line(minOf),
    yMin,
    yMax,
    last: { max: maxOf(last), avg: last.avgBid, min: minOf(last) },
    dots:
      samples.length === 1
        ? { x: x(last.t), yMax: y(maxOf(last)), yAvg: y(last.avgBid), yMin: y(minOf(last)) }
        : null,
  };
}
