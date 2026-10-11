import { hexRgb, mixRgb, rgba, type Rgb } from './color';
import type { PaintCtx } from './paint-ctx';

// Primitives du dessin « cellulo » (vague Ghibli, décor) : aplat, un ton d'ombre à bord net teinté violet-bleu, un rehaut
// chaud, trait encré brun foncé. Pas de dégradé, pas de grain : le langage des pantins et des véhicules.
export const SUN: Rgb = hexRgb('#FFF6D0');
export const COOL: Rgb = hexRgb('#5A4A9C');
export const INK = '#2A1A18';
export const TAU = Math.PI * 2;

export const shade = (c: Rgb, t = 0.3): Rgb => mixRgb(c, COOL, t);
export const light = (c: Rgb, t = 0.3): Rgb => mixRgb(c, SUN, t);
export const ink = (alpha: number): string => `rgba(42,26,24,${Number(Math.max(0, Math.min(1, alpha)).toFixed(3))})`;
export const fillOf = (c: Rgb, alpha = 1): string => rgba(c, alpha);

export const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length)]!;

export function inkRect(ctx: PaintCtx, x: number, y: number, w: number, h: number, lw = 0.8, alpha = 1): void {
  ctx.strokeStyle = alpha >= 1 ? INK : ink(alpha);
  ctx.lineWidth = lw;
  ctx.strokeRect(x, y, w, h);
}

export function fillRect(ctx: PaintCtx, c: Rgb | string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = typeof c === 'string' ? c : rgba(c, 1);
  ctx.fillRect(x, y, w, h);
}

export function disc(ctx: PaintCtx, c: Rgb | string, x: number, y: number, r: number): void {
  ctx.fillStyle = typeof c === 'string' ? c : rgba(c, 1);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

// Polygone fermé rempli (sommets en coordonnées du monde).
export function poly(ctx: PaintCtx, c: Rgb | string, pts: readonly (readonly [number, number])[]): void {
  ctx.fillStyle = typeof c === 'string' ? c : rgba(c, 1);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

// Ombre portée au sol (lumière du haut gauche, pente fixe) : parallélogramme à bord net.
export const SHADOW_K = 0.55;
export function groundShadow(ctx: PaintCtx, x0: number, y0: number, h: number, w: number, alpha = 0.26): void {
  ctx.fillStyle = `rgba(70,50,130,${alpha})`;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 + w, y0);
  ctx.lineTo(x0 + w + h * SHADOW_K * 0.5, y0 + h * 0.12);
  ctx.lineTo(x0 + h * SHADOW_K * 0.5, y0 + h * 0.12);
  ctx.closePath();
  ctx.fill();
}
