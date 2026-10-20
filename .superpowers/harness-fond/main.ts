// Banc du fond de la ville : décor peint (vrai peintre) + fenêtres du fond allumées par le calque SVG (en orange).
import { cityPaintPlan } from '../../src/core/library/paint/city-plan';
import { paintCityTile, tileCount } from '../../src/core/library/paint/city-painter';
import { FAR_WINDOW } from '../../src/core/library/city/facades';
import type { PaintCtx } from '../../src/core/library/paint/paint-ctx';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 1440);
const H = Number(q.get('h') ?? 1020);
const SEED = Number(q.get('seed') ?? 1);
const LAMPS = q.has('lamps');
const SCALE = Number(q.get('scale') ?? 1);
const c = document.createElement('canvas');
c.width = W * SCALE;
c.height = H * SCALE;
document.body.appendChild(c);
const ctx = c.getContext('2d')!;
ctx.scale(SCALE, SCALE);
ctx.fillStyle = '#A8C8E8';
ctx.fillRect(0, 0, W, H);
const plan = cityPaintPlan(W, H, SEED);
for (let t = 0; t < tileCount(W); t++) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(t * 360, 0, 360, H);
  ctx.clip();
  paintCityTile(ctx as unknown as PaintCtx, plan, t);
  ctx.restore();
}
if (LAMPS) {
  ctx.fillStyle = '#FF8800';
  for (const b of plan.buildings) for (const w of b.lit) ctx.fillRect(w.x, w.y, FAR_WINDOW.w, FAR_WINDOW.h);
}
(window as unknown as { done: boolean }).done = true;
