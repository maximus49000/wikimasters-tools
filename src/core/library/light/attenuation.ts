import { smooth } from '../weather/weather-types';

// Part de la lumière directe qui entre : plus forte quand le soleil est haut (rayons rasants plus faibles),
// atténuée par TOUS les nuages du panorama, et proportionnelle à la part du disque solaire encore visible.
export function beamGain(elev: number, cloud: number, hidden: number): number {
  if (elev <= 0) return 0;
  const graze = Math.sin(Math.min(elev, Math.PI / 2)) ** 0.6;
  const clouds = 1 - 0.85 * smooth(cloud);
  const visible = 1 - Math.min(1, Math.max(0, hidden));
  return Math.min(1, Math.max(0, graze * clouds * visible));
}
