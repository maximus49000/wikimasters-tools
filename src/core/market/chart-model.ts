import type { Sample } from './price-history';

export type ChartBox = {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ChartModel = {
  max: string;
  avg: string;
  min: string;
  // Graduations de l'axe des prix (valeur + position verticale).
  yTicks: { value: number; y: number }[];
  // Repères de l'axe du temps (début, milieu, dernier relevé).
  xTicks: { x: number; label: string }[];
  last: { max: number; avg: number; min: number };
  // Un seul relevé : une ligne ne se tracerait pas.
  dots: { x: number; yMax: number; yAvg: number; yMin: number } | null;
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// Les points anciens, sans extrêmes enregistrés, retombent sur la moyenne.
const maxOf = (s: Sample): number => s.maxBid ?? s.avgBid;
const minOf = (s: Sample): number => s.minBid ?? s.avgBid;

// Pas « rond » (1, 2, 5 × 10ⁿ) pour qu'environ `count` graduations couvrent l'étendue.
export function niceStep(range: number, count: number): number {
  const raw = range / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const factor = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return factor * power;
}

export function ageLabel(ageMs: number): string {
  if (ageMs < HOUR_MS) return 'maintenant';
  if (ageMs < DAY_MS) return `il y a ${Math.floor(ageMs / HOUR_MS)} h`;
  if (ageMs < 60 * DAY_MS) return `il y a ${Math.floor(ageMs / DAY_MS)} j`;
  return `il y a ${Math.floor(ageMs / (30 * DAY_MS))} mois`;
}

export function buildChart(samples: Sample[], box: ChartBox, now: number): ChartModel | null {
  const last = samples.at(-1);
  if (!last) return null;

  const highest = Math.max(...samples.map(maxOf));
  const lowest = Math.min(...samples.map(minOf));
  const step = highest === lowest ? Math.max(1, niceStep(Math.abs(highest) || 1, 4)) : niceStep(highest - lowest, 3);
  const yMin = Math.floor(lowest / step) * step;
  const yMax = Math.max(Math.ceil(highest / step) * step, yMin + step);

  const t0 = samples[0]!.t;
  const span = last.t - t0;
  const innerW = box.width - box.left - box.right;
  const innerH = box.height - box.top - box.bottom;

  const x = (t: number): number => box.left + (span === 0 ? innerW / 2 : ((t - t0) / span) * innerW);
  const y = (v: number): number => box.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const line = (pick: (s: Sample) => number): string =>
    samples.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.t).toFixed(1)} ${y(pick(s)).toFixed(1)}`).join(' ');

  const yTicks: ChartModel['yTicks'] = [];
  for (let value = yMin; value <= yMax + step / 2; value += step) yTicks.push({ value, y: y(value) });

  const xTicks: ChartModel['xTicks'] =
    span === 0
      ? [{ x: x(last.t), label: ageLabel(now - last.t) }]
      : [t0, t0 + span / 2, last.t].map((t) => ({ x: x(t), label: ageLabel(now - t) }));

  return {
    max: line(maxOf),
    avg: line((s) => s.avgBid),
    min: line(minOf),
    yTicks,
    xTicks,
    last: { max: maxOf(last), avg: last.avgBid, min: minOf(last) },
    dots:
      samples.length === 1
        ? { x: x(last.t), yMax: y(maxOf(last)), yAvg: y(last.avgBid), yMin: y(minOf(last)) }
        : null,
  };
}
