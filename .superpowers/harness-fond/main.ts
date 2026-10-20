// Banc du fond de la ville : décor peint (vrai peintre) + fenêtres du fond allumées par le calque SVG (en orange).
// Paramètres : seed, w, h, scale, lamps, date=AAAA-MM-JJ, T=heure décimale, meteo=soleil|nuages|pluie|neige,
// view=x0,y0,w,h (recadrage), audit=vert (part d'herbe nue sur les pixels, fenêtres 12 × 8 entièrement nues).
import { cityPaintPlan, hillCrestY } from '../../src/core/library/paint/city-plan';
import { paintCityTile, tileCount } from '../../src/core/library/paint/city-painter';
import { FAR_WINDOW } from '../../src/core/library/city/facades';
import { fondMoment, type FondMeteo } from '../../src/core/library/paint/fond-time';
import { grassOf } from '../../src/core/library/paint/fond-painter';
import { hexRgb, mixRgb } from '../../src/core/library/paint/color';
import { light } from '../../src/core/library/paint/cel';
import type { PaintCtx } from '../../src/core/library/paint/paint-ctx';
import { paintSnowTile } from '../../src/core/library/paint/snow-painter';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 1440);
const H = Number(q.get('h') ?? 1020);
const SEED = Number(q.get('seed') ?? 1);
const LAMPS = q.has('lamps');
const SCALE = Number(q.get('scale') ?? 1);
const [y, m, d] = (q.get('date') ?? '2026-07-07').split('-').map(Number) as [number, number, number];
const T = Number(q.get('T') ?? 15);
const METEO: Record<string, FondMeteo> = {
  soleil: { cloud: 0.1, precip: 0, wind: 0.2, snow: false },
  nuages: { cloud: 0.65, precip: 0, wind: 0.4, snow: false },
  pluie: { cloud: 0.92, precip: 0.65, wind: 0.5, snow: false },
  neige: { cloud: 0.85, precip: 0.5, wind: 0.2, snow: true },
};
const moment = fondMoment({ y, m, d }, Math.round(T * 60), METEO[q.get('meteo') ?? 'soleil']!);
const [vx, vy, vw, vh] = (q.get('view') ?? `0,0,${W},${H}`).split(',').map(Number) as [number, number, number, number];
const c = document.createElement('canvas');
c.width = vw * SCALE;
c.height = vh * SCALE;
document.body.appendChild(c);
const ctx = c.getContext('2d')!;
ctx.scale(SCALE, SCALE);
ctx.translate(-vx, -vy);
ctx.fillStyle = '#A8C8E8';
ctx.fillRect(0, 0, W, H);
const plan = cityPaintPlan(W, H, SEED);
for (let t = 0; t < tileCount(W); t++) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(t * 360, 0, 360, H);
  ctx.clip();
  paintCityTile(ctx as unknown as PaintCtx, plan, t, moment);
  // Neige posée (calque à part dans l'appli, scene-weather.tsx) : par-dessus quand il neige.
  if (moment.meteo.snow) paintSnowTile(ctx as unknown as PaintCtx, plan, t);
  ctx.restore();
}
if (LAMPS) {
  ctx.fillStyle = '#FF8800';
  for (const b of plan.buildings) for (const w of b.lit) ctx.fillRect(w.x, w.y, FAR_WINDOW.w, FAR_WINDOW.h);
}
if (q.get('audit') === 'vert' && SCALE === 1 && vx === 0 && vy === 0) {
  // Herbe nue : pixels de la couleur de l'herbe (aplat, rehaut de crête) sur la colline visible (sous la crête, au-dessus du
  // mur du fond et du premier plan).
  const HAZE = hexRgb('#9CC0E4');
  const g0 = grassOf(moment);
  const refs = [mixRgb(g0, HAZE, 0.35), mixRgb(light(g0, 0.4), HAZE, 0.3)];
  const img = ctx.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(W * H);
  // Haut visible : premier pixel (de bas en haut) qui n'est plus « fond » est dur à lire ; on prend la colline sous la crête
  // jusqu'au haut du mur du fond / premier plan, recalculé ici depuis le plan.
  const top = new Float32Array(W + 1).fill(plan.ground);
  for (const b of plan.buildings) for (let x = Math.max(0, Math.floor(b.x)); x <= Math.min(W, Math.ceil(b.x + b.w)); x++) top[x] = Math.min(top[x]!, b.top + (b.far ? 0 : 0));
  let bare = 0;
  let vis = 0;
  for (let yy = 0; yy < plan.ground; yy++) for (let x = 0; x < W; x++) {
    if (yy < hillCrestY(plan, x) - 1 || yy >= top[x]!) continue;
    vis++;
    const i = (yy * W + x) * 4;
    if (refs.some((rc) => Math.abs(img[i]! - rc[0]) <= 7 && Math.abs(img[i + 1]! - rc[1]) <= 7 && Math.abs(img[i + 2]! - rc[2]) <= 7)) {
      mask[yy * W + x] = 1;
      bare++;
    }
  }
  let windows = 0;
  let first: number[] | null = null;
  for (let yy = 0; yy + 8 <= H; yy++) for (let x = 0; x + 12 <= W; x++) {
    let all = true;
    for (let a = 0; a < 8 && all; a++) for (let b = 0; b < 12; b++) if (!mask[(yy + a) * W + x + b]) { all = false; break; }
    if (all) { windows++; first ??= [x, yy]; }
  }
  if (q.has('img')) {
    // Image de contrôle : herbe nue en rouge, colline visible en bleu sombre, le reste en noir.
    const out = ctx.createImageData(W, H);
    for (let yy = 0; yy < H; yy++) for (let x = 0; x < W; x++) {
      const i = (yy * W + x) * 4;
      const v = !(yy < hillCrestY(plan, x) - 1 || yy >= top[x]! || yy >= plan.ground);
      out.data[i] = mask[yy * W + x] ? 255 : 0;
      out.data[i + 2] = v ? 80 : 0;
      out.data[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }
  (window as unknown as { audit: unknown }).audit = { herbeNue: ((100 * bare) / Math.max(1, vis)).toFixed(1), fenetres12x8: windows, premiere: first, comblements: plan.fond.fillers };
}
(window as unknown as { done: boolean }).done = true;
