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

export function gustsAt(t: number, w: Wind, width: number): Gust[] {
  const P = 9 - 5 * w.wind, speed = 50 + 60 * w.wind, out: Gust[] = [];
  for (let k = Math.floor(t / P) - 5; k <= Math.floor(t / P) + 1; k++) {
    const rk = mulberry32((k * 7919 + 13) >>> 0);
    out.push({ k, tk: k * P + rk() * P * 0.8, A: 0.6 + rk() * 0.9, L: 120 + rk() * 120, speed, dir: w.dir, x0: w.dir > 0 ? -300 : width + 300 });
  }
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
