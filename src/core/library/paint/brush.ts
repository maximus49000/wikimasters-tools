import { hashString, mulberry32 } from '../scene-world';
import { jitter, rgba, type Rgb } from './color';
import type { PaintCtx } from './paint-ctx';

export type Rng = () => number;
export type Box = { x: number; y: number; w: number; h: number };

// Portée maximale d'une touche : rayon × allongement × DAB_SPREAD (déformation des sommets).
export const DAB_SPREAD = 1.15;

// Touche de gouache : heptagone déformé, allongé et orienté. Aucune transformation du contexte : sommets calculés.
export function dab(ctx: PaintCtx, rng: Rng, x: number, y: number, r: number, color: Rgb, alpha: number, elong = 1.6, rot?: number): void {
  const a = rot ?? rng() * Math.PI;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const t = (i / 7) * Math.PI * 2;
    const k = 0.72 + rng() * (DAB_SPREAD - 0.72);
    const px = Math.cos(t) * r * elong * k;
    const py = Math.sin(t) * r * k;
    const X = x + px * ca - py * sa;
    const Y = y + px * sa + py * ca;
    if (i === 0) ctx.moveTo(X, Y);
    else ctx.lineTo(X, Y);
  }
  ctx.closePath();
  ctx.fillStyle = rgba(color, alpha);
  ctx.fill();
}

export type WashOpts = { color: (x: number, y: number) => Rgb; density: number; r: [number, number]; alpha: number; elong?: number; rot?: number; jitter?: number };

// Couvre un rectangle de touches. Les centres sont tirés dans le rectangle rétréci de la portée maximale : rien ne déborde.
// `density` = touches par px² du rectangle.
export function washRect(ctx: PaintCtx, rng: Rng, box: Box, opts: WashOpts): void {
  const elong = opts.elong ?? 1.6;
  const m = opts.r[1] * elong * DAB_SPREAD;
  const x0 = box.x + m;
  const x1 = box.x + box.w - m;
  const y0 = box.y + m;
  const y1 = box.y + box.h - m;
  if (x1 <= x0 || y1 <= y0) return;
  const n = Math.round(box.w * box.h * opts.density);
  for (let i = 0; i < n; i++) {
    const x = x0 + rng() * (x1 - x0);
    const y = y0 + rng() * (y1 - y0);
    const r = opts.r[0] + rng() * (opts.r[1] - opts.r[0]);
    dab(ctx, rng, x, y, r, jitter(opts.color(x, y), opts.jitter ?? 8, rng), opts.alpha, elong, opts.rot);
  }
}

// Générateur propre à une case d'une grille du monde : deux tranches voisines tirent la même chose sur leur bord commun.
export function cellRng(seed: number, salt: string, i: number, j: number): Rng {
  return mulberry32((((seed ^ hashString(salt)) + Math.imul(i, 73856093)) ^ Math.imul(j, 19349663)) >>> 0);
}
