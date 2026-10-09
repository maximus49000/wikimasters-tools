import { smooth } from './weather-types';

// Filets de lumière : quand les nuages qui dérivent ouvrent une trouée devant le soleil, sous un ciel épais mais en pluie faible.

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, v: number): number => smooth(clamp01((v - a) / (b - a)));

// Force des filets (0..1) : `hidden` = part du disque solaire masquée, `cloud` = couverture, `precip` = intensité des précipitations.
// Nulle soleil entièrement dégagé (rien à percer) ou entièrement caché (rien ne passe), par ciel léger, ou sous forte pluie / orage.
export function godRayStrength(hidden: number, cloud: number, precip: number): number {
  const bump = smoothstep(0.15, 0.45, hidden) * (1 - smoothstep(0.8, 0.97, hidden));
  const thick = smoothstep(0.45, 0.8, cloud);
  const light = 1 - smoothstep(0.45, 0.9, precip);
  return clamp01(bump * thick * light);
}

// Les trois lobes d'un nuage dessiné (avant mise à l'échelle) : le dessin et le calcul de la couverture partagent cette forme.
export const CLOUD_BLOBS: readonly { cx: number; cy: number; rx: number; ry: number }[] = [
  { cx: 0, cy: 0, rx: 34, ry: 12 },
  { cx: -18, cy: -8, rx: 20, ry: 11 },
  { cx: 14, cy: -10, rx: 22, ry: 12 },
];

export type CloudSpot = { x: number; y: number; s: number };

export const SUN_DISC = 12;
const SAMPLES = 9;
// Points d'échantillonnage du disque solaire (grille 9 × 9 restreinte au disque), relatifs à son centre.
const DISC: readonly [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let i = 0; i < SAMPLES; i++)
    for (let j = 0; j < SAMPLES; j++) {
      const dx = (i / (SAMPLES - 1) - 0.5) * 2 * SUN_DISC;
      const dy = (j / (SAMPLES - 1) - 0.5) * 2 * SUN_DISC;
      if (dx * dx + dy * dy <= SUN_DISC * SUN_DISC) out.push([dx, dy]);
    }
  return out;
})();
const REACH = 34 + 14 + 22; // portée maximale d'un lobe depuis le centre d'un nuage, avant échelle

// Part (0..1) du disque solaire masquée par les nuages, posés à `x + drift` et à leur copie bouclée `x + drift − width`.
export function sunCoverage(sunX: number, sunY: number, clouds: readonly CloudSpot[], drift: number, width: number): number {
  const near: { x: number; y: number; s: number }[] = [];
  for (const c of clouds) {
    for (const x of [c.x + drift, c.x + drift - width]) {
      const reach = REACH * c.s + SUN_DISC;
      if (Math.abs(x - sunX) <= reach && Math.abs(c.y - sunY) <= reach) near.push({ x, y: c.y, s: c.s });
    }
  }
  if (near.length === 0) return 0;
  let covered = 0;
  for (const [dx, dy] of DISC) {
    const px = sunX + dx;
    const py = sunY + dy;
    const hit = near.some((c) =>
      CLOUD_BLOBS.some((b) => {
        const u = (px - (c.x + b.cx * c.s)) / (b.rx * c.s);
        const v = (py - (c.y + b.cy * c.s)) / (b.ry * c.s);
        return u * u + v * v <= 1;
      }),
    );
    if (hit) covered++;
  }
  return covered / DISC.length;
}
