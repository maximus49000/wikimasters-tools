import { hashString, mulberry32 } from '../scene-world';
import { isoDate, type YMD } from './calendar';

// Spectacle de feux d'artifice des jours de fête (spec 2026-10-19 « vie au-dessus de la rue » §5.1, choix de Claude) : début,
// durée et rythme des salves tirés de la graine de la ville et de la date, jamais à heure fixe. Le spectacle du Nouvel An
// appartient à la nuit du 31 décembre (minutes de scène au-delà de 1440) : le 1er janvier n'en a pas.

// Minutes de scène (1440 + x après minuit). `x` ∈ [0, 1] en fraction de largeur, `y` ∈ [0,15 ; 0,45] en fraction de hauteur
// du ciel, `variant` ∈ [0, FIREWORK_VARIANTS) : couleur de la gerbe (notes.md §Couleurs, feux).
export type FireworksShow = { start: number; end: number; bursts: { at: number; x: number; y: number; variant: number }[] };

export const FIREWORK_VARIANTS = 6;
// Fenêtres de début et durées (minutes) : 14 juillet 22 h 15-22 h 45 pour 18-30 min ; Nouvel An 23 h 58-0 h 05 pour 8-15 min.
const SHOWS: readonly { m: number; d: number; start: readonly [number, number]; length: readonly [number, number] }[] = [
  { m: 7, d: 14, start: [1335, 1365], length: [18, 30] },
  { m: 12, d: 31, start: [1438, 1445], length: [8, 15] },
];
// Salves (secondes) : intervalle exponentiel borné à 6-40 s, puis bouquet final des 2 dernières minutes à 1-3 s.
const GAP = { min: 6, max: 40, mean: 8 } as const;
const FINALE = { minutes: 2, min: 1, max: 3 } as const;

export function fireworksShow(seed: number, date: YMD): FireworksShow | null {
  const spec = SHOWS.find((s) => s.m === date.m && s.d === date.d);
  if (!spec) return null;
  const rng = mulberry32(seed ^ hashString('show') ^ hashString(isoDate(date)));
  const start = spec.start[0] + rng() * (spec.start[1] - spec.start[0]);
  const end = start + spec.length[0] + rng() * (spec.length[1] - spec.length[0]);
  const bursts: FireworksShow['bursts'] = [];
  for (let at = start; at <= end; ) {
    bursts.push({ at, x: rng(), y: 0.15 + rng() * 0.3, variant: Math.floor(rng() * FIREWORK_VARIANTS) });
    const gap = at >= end - FINALE.minutes ? FINALE.min + rng() * (FINALE.max - FINALE.min) : Math.min(GAP.max, GAP.min - Math.log(1 - rng()) * GAP.mean);
    at += gap / 60;
  }
  return { start, end, bursts };
}

// Salves partant dans [from, to) (minutes de scène), dans l'ordre.
export const showBursts = (show: FireworksShow, from: number, to: number): FireworksShow['bursts'] => show.bursts.filter((b) => b.at >= from && b.at < to);
