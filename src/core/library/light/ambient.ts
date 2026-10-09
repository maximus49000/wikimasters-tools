import { smooth } from '../weather/weather-types';
import type { Glass } from './beam';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
// Distance (px) à laquelle la lumière du ciel d'une fenêtre est divisée par e, et surface d'une grande fenêtre de référence.
const FALLOFF = 260;
const AREA_REF = 90 * 110;

// Luminosité du ciel vu de l'intérieur : presque nulle la nuit, forte le jour, voilée par les nuages.
export function skyLevel(daylight: number, cloud: number): number {
  return clamp01(0.06 + 0.94 * clamp01(daylight)) * (1 - 0.55 * smooth(cloud));
}

// Adaptation de l'œil : en plein jour clair la lumière artificielle ne compte pas ; nuages, pluie et nuit la rendent utile.
export function lampNeed(daylight: number, cloud: number, precip: number): number {
  const day = clamp01(daylight) * (1 - 0.75 * smooth(cloud));
  return clamp01(1 - day + 0.15 * clamp01(precip));
}

// Lumière du ciel en un point de la pièce : somme des fenêtres, chacune pondérée par sa surface et décroissante avec la distance au verre.
export function skylightAt(px: number, py: number, windows: readonly Glass[]): number {
  let sum = 0;
  for (const g of windows) {
    const dx = Math.max(g.x - px, 0, px - (g.x + g.w));
    const dy = Math.max(g.y - py, 0, py - (g.y + g.h));
    sum += Math.min(1, (g.w * g.h) / AREA_REF) * Math.exp(-Math.hypot(dx, dy) / FALLOFF);
  }
  return clamp01(sum);
}
