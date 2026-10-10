import { cellRng, dab, DAB_SPREAD, type Box, type Rng } from './brush';
import { hexRgb, jitter, mixRgb, rgba, type Rgb } from './color';
import type { PaintCtx } from './paint-ctx';

const LIGHT = hexRgb('#F2A070');
const SHADE = hexRgb('#4A2030');

// Rangs de tuiles canal (demi-ellipses), décalés d'un rang à l'autre ; le versant à gauche du faîtage est éclairé.
// Chaque ellipse tient entièrement dans `box` ; l'appelant découpe la forme du toit (clip).
export function roofTiles(ctx: PaintCtx, rng: Rng, box: Box, base: Rgb, peakX: number, tileW: number, rowH: number): void {
  const rx = tileW / 2;
  const ry = rowH * 0.75;
  const m = Math.max(rx, ry);
  let row = 0;
  for (let y = box.y + m; y <= box.y + box.h - m; y += rowH, row++) {
    const shift = (row % 2) * rx;
    for (let x = box.x + m + shift; x <= box.x + box.w - m; x += tileW) {
      const lit = x < peakX;
      const c = jitter(mixRgb(base, lit ? LIGHT : SHADE, lit ? 0.18 : 0.14), 14, rng);
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI);
      ctx.fillStyle = rgba(c, 1);
      ctx.fill();
    }
  }
}

// Rue pavée : rangées dont la hauteur grandit vers le premier plan ; grille globale (indépendante de la tranche), couleur
// tirée par case : deux tranches voisines peignent les mêmes pavés sur leur bord commun.
export function cobbles(ctx: PaintCtx, seed: number, area: Box, rowH0: number, growth: number, base: Rgb): void {
  const dark = mixRgb(base, [60, 45, 30], 0.35);
  let y = area.y;
  for (let k = 0; y < area.y + area.h; k++) {
    const rh = rowH0 + k * growth;
    const cw = rh * 2.1;
    const off = ((k * 7) % 5) * cw * 0.2;
    const j0 = Math.floor((area.x - off) / cw) - 1;
    const j1 = Math.ceil((area.x + area.w - off) / cw) + 1;
    for (let j = j0; j <= j1; j++) {
      const rng = cellRng(seed, 'cobble', k, j);
      const cx = off + j * cw + cw / 2;
      const cy = y + rh / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw / 2 - 0.4, rh / 2 - 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(jitter(mixRgb(base, dark, rng()), 12, rng), 1);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - cw * 0.08, cy - rh * 0.18, cw * 0.28, rh * 0.14, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba([255, 245, 220], 0.22);
      ctx.fill();
    }
    y += rh + 0.4;
  }
}

export type Crown = { cx: number; cy: number; r: number };
const LEAF = { deep: hexRgb('#1E3E22'), dark: hexRgb('#2E5E2A'), mid: hexRgb('#5E9A3E'), light: hexRgb('#C8DC7A') };

// Feuillage par masses : grappes sombres au cœur, claires en haut à gauche (lumière du soleil), quelques trouées de ciel.
// Tout point reste à moins de `crown.r` du centre.
export function foliage(ctx: PaintCtx, rng: Rng, crown: Crown, unit: number): void {
  const rMax = 1.6 * unit;
  const elong = 1.7;
  const reach = rMax * elong * DAB_SPREAD;
  const clusters: Crown[] = [];
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * crown.r * 0.45;
    clusters.push({ cx: crown.cx + Math.cos(a) * d, cy: crown.cy + Math.sin(a) * d, r: crown.r * (0.5 + rng() * 0.05) });
  }
  clusters.sort((p, q) => q.cy - p.cy);
  for (const c of clusters) {
    const room = Math.min(c.r, crown.r - Math.hypot(c.cx - crown.cx, c.cy - crown.cy)) - reach;
    if (room <= 0) continue;
    const n = Math.round(room * room * 1.4);
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * room;
      const x = c.cx + Math.cos(a) * d;
      const y = c.cy + Math.sin(a) * d;
      let l = 0.55 - (y - c.cy) / (2 * room) - ((x - c.cx) / (2 * room)) * 0.6;
      l = Math.max(0, Math.min(1, l));
      const col = l < 0.35 ? mixRgb(LEAF.deep, LEAF.dark, l / 0.35) : l < 0.7 ? mixRgb(LEAF.dark, LEAF.mid, (l - 0.35) / 0.35) : mixRgb(LEAF.mid, LEAF.light, (l - 0.7) / 0.3);
      dab(ctx, rng, x, y, (0.6 + rng() * 1) * unit, jitter(col, 10, rng), 0.85, elong);
    }
  }
}

const GLASS_TOP = '#BFE0F0';
const GLASS_MID = '#5E93BE';
const GLASS_LOW = '#2E4E6E';

// Vitre éteinte : cadre sombre, verre qui reflète le ciel (dégradé + reflet en diagonale), croisillon, rideaux éventuels.
export function glass(ctx: PaintCtx, rng: Rng, win: Box, curtain: boolean): void {
  const { x, y, w, h } = win;
  ctx.fillStyle = '#3A2A22';
  ctx.fillRect(x, y, w, h);
  const f = Math.min(0.6, w * 0.12);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, GLASS_TOP);
  g.addColorStop(0.5, GLASS_MID);
  g.addColorStop(1, GLASS_LOW);
  ctx.fillStyle = g;
  ctx.fillRect(x + f, y + f, w - 2 * f, h - 2 * f);
  ctx.beginPath();
  ctx.moveTo(x + f, y + h * 0.25);
  ctx.lineTo(x + w * 0.55, y + f);
  ctx.lineTo(x + w * 0.8, y + f);
  ctx.lineTo(x + f, y + h * 0.6);
  ctx.closePath();
  ctx.fillStyle = rgba([255, 255, 255], 0.3 + rng() * 0.1);
  ctx.fill();
  ctx.fillStyle = '#3A2A22';
  ctx.fillRect(x + w / 2 - f / 2, y, f, h);
  ctx.fillRect(x, y + h * 0.45, w, f);
  if (curtain) {
    ctx.fillStyle = rgba([250, 240, 225], 0.85);
    ctx.beginPath();
    ctx.moveTo(x + f, y + f);
    ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.5, x + f, y + h - f);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + w - f, y + f);
    ctx.quadraticCurveTo(x + w * 0.7, y + h * 0.5, x + w - f, y + h - f);
    ctx.closePath();
    ctx.fill();
  }
}
