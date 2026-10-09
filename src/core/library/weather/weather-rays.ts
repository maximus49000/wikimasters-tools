import { mulberry32 } from '../scene-world';
import { smooth } from './weather-types';

// Filets de lumière : quand les nuages qui dérivent ouvrent une trouée devant le soleil, sous un ciel épais mais en pluie faible.

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, v: number): number => smooth(clamp01((v - a) / (b - a)));

// Force des filets (0..1) : `hidden` = part du disque solaire masquée, `cloud` = couverture, `precip` = intensité des précipitations.
// Bande étroite, pour que les filets restent occasionnels : soleil à moitié masqué (ni dégagé, ni presque caché), ciel épais,
// et au plus une pluie fine — rien sous la neige, en vraie pluie ou à l'orage.
export function godRayStrength(hidden: number, cloud: number, precip: number, kind: 'rain' | 'snow' = 'rain'): number {
  if (kind === 'snow') return 0;
  const bump = smoothstep(0.25, 0.55, hidden) * (1 - smoothstep(0.7, 0.9, hidden));
  const thick = smoothstep(0.45, 0.8, cloud);
  const light = 1 - smoothstep(0.3, 0.6, precip);
  return clamp01(bump * thick * light);
}

// Épisodes de trouées : le temps est découpé en fenêtres de 90 s, dont environ une sur trois (tirée de la graine) laisse passer
// des filets, avec une enveloppe douce (sin²) — sans cela, des nuages denses découvrent un bord du soleil presque en permanence.
export const RAY_WINDOW_MS = 90_000;
const RAY_WINDOW_ODDS = 0.3;
export function rayWindow(nowMs: number, seed: number): number {
  const win = Math.floor(nowMs / RAY_WINDOW_MS);
  if (mulberry32(seed ^ Math.imul(win + 1, 0x9e3779b1))() >= RAY_WINDOW_ODDS) return 0;
  const s = Math.sin((Math.PI * (nowMs - win * RAY_WINDOW_MS)) / RAY_WINDOW_MS);
  return s * s;
}

// Cible des filets dessinés : force ci-dessus, seulement soleil levé, en plein jour, et pendant un épisode de trouée (`gate`).
export function godRayTarget(hidden: number, w: { cloud: number; precip: number; kind: 'rain' | 'snow' }, daylight: number, sunUp: boolean, gate = 1): number {
  if (!sunUp) return 0;
  return godRayStrength(hidden, w.cloud, w.precip, w.kind) * smoothstep(0.35, 0.75, daylight) * clamp01(gate);
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
