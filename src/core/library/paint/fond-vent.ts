// Champ de vent du fond de ville : fonction pure de (x, t), tirée de la météo (force, direction). Base turbulente (ondes
// progressives de périodes incommensurables, déphasées par la position) + rafales : paquets gaussiens tirés par graine qui
// traversent la scène dans le sens du vent (jamais un balancement sinusoïdal synchrone). Vent signé ≈ −2,5…2,5 (0 = calme).
// Port de maquettes/fond-ville/src/04a-vent.js ; le mouvement réduit est géré par les appelants.
import { mulberry32 } from '../scene-world';
import type { FondMeteo } from './fond-time';
import type { TreeModel } from './hill-trees';

export type Wind = { wind: number; dir: 1 | -1; wet: number; storm: boolean };

// Vent du fond tiré de la météo : pas de direction dans les données du fond (fixe +1), pluie → humidité.
export function windOf(meteo: FondMeteo, storm: boolean): Wind {
  return { wind: meteo.wind, dir: 1, wet: meteo.precip > 0 ? Math.min(1, meteo.precip / 0.6) : 0, storm };
}

export type Gust = { k: number; tk: number; A: number; L: number; speed: number; dir: 1 | -1; x0: number };

// Période des rafales (s) pour une force de vent.
export const gustPeriod = (w: Wind): number => 9 - 5 * w.wind;
// Rafale n° k (tirée par graine : la même pour tout le monde). Fonction pure, mémorisée pour (force, sens, largeur) : les
// boucles à 15 images/s la demandent des dizaines de fois par image (arbres de la rue, particules, colline).
let gustMemo: { wind: number; dir: number; width: number; byK: Map<number, Gust>; win: { k0: number; list: readonly Gust[] } | null } = { wind: NaN, dir: 0, width: NaN, byK: new Map(), win: null };
function memoFor(w: Wind, width: number): typeof gustMemo {
  if (gustMemo.wind !== w.wind || gustMemo.dir !== w.dir || gustMemo.width !== width) gustMemo = { wind: w.wind, dir: w.dir, width, byK: new Map(), win: null };
  return gustMemo;
}
export function gustOf(k: number, w: Wind, width: number): Gust {
  const memo = memoFor(w, width);
  let g = memo.byK.get(k);
  if (g) return g;
  const P = gustPeriod(w);
  const rk = mulberry32((k * 7919 + 13) >>> 0);
  g = { k, tk: k * P + rk() * P * 0.8, A: 0.6 + rk() * 0.9, L: 120 + rk() * 120, speed: 50 + 60 * w.wind, dir: w.dir, x0: w.dir > 0 ? -300 : width + 300 };
  if (memo.byK.size >= 256) memo.byK.clear();
  memo.byK.set(k, g);
  return g;
}

// Rafales qui comptent à l'instant t (liste partagée : ne pas la modifier).
export function gustsAt(t: number, w: Wind, width: number): readonly Gust[] {
  const memo = memoFor(w, width);
  const k0 = Math.floor(t / gustPeriod(w));
  if (memo.win && memo.win.k0 === k0) return memo.win.list;
  const out: Gust[] = [];
  for (let k = k0 - 5; k <= k0 + 1; k++) out.push(gustOf(k, w, width));
  memo.win = { k0, list: out };
  return out;
}

const gustX = (g: Gust, t: number): number => g.x0 + g.dir * g.speed * (t - g.tk);

export function windAt(x: number, t: number, w: Wind, width: number): number {
  if (w.wind <= 0.02) return 0;
  const dir = w.dir;
  let v = 0.35 + 0.25 * Math.sin(t * 0.9 - dir * x * 0.012) + 0.18 * Math.sin(t * 1.7 - dir * x * 0.031 + 1.3) + 0.12 * Math.sin(t * 3.1 - dir * x * 0.07 + 2.1);
  for (const g of gustsAt(t, w, width)) {
    const d = (x - gustX(g, t)) / g.L;
    v += g.A * Math.exp(-d * d) * (0.7 + 0.3 * Math.sin(t * 4 + g.k));
  }
  return dir * w.wind * v;
}

// Raideur par essence (peuplier très mobile, platane lourd, jeune arbre nerveux).
export const STIFF: Record<string, number> = { poplar: 1.6, tilleul: 1.0, platane: 0.7, marronnier: 0.8, cerisier: 1.1, chene: 0.75, bouquet: 1.0, cypress: 0.5 };

// Pluie : les branches ploient davantage ; orage : encore plus.
export const bendOf = (species: string, young: boolean, wind: number, w: Wind): number =>
  Math.max(-0.55, Math.min(0.55, wind * (young ? 1.8 : STIFF[species] || 1) * (1 + 0.25 * (w.wet || 0)) * (w.storm ? 1.3 : 1) * 0.09));

// Amplitude d'une masse (px par unité de vent) : plus forte pour les masses hautes et écartées du tronc.
export function massAmp(m: TreeModel, k: number): number {
  const tf = m.tufts.filter((t) => t.cluster === k);
  if (!tf.length) return 1;
  const mx = tf.reduce((a, t) => a + t.x, 0) / tf.length, my = tf.reduce((a, t) => a + t.y, 0) / tf.length;
  return 0.8 + 1.2 * Math.abs(mx - m.foot.x) / Math.max(1, m.rx) + 0.8 * (m.cy - my) / Math.max(1, m.ry);
}
