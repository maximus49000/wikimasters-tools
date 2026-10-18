import { heightOn, roofOutline, type Chimney, type Dormer } from '../city/facade-layout';
import { INK, disc, fillRect, inkRect, light, shade } from './cel';
import type { CityPaintPlan, PaintBuilding } from './city-plan';
import { hexRgb, rgba, type Rgb } from './color';
import { GLASS_DAY } from './facade-painter';
import type { PaintCtx } from './paint-ctx';

// Peintre des toits du premier plan (façades parisiennes) : contour `roofOutline(layout)` (seule source du toit, partagée
// avec la neige), souches de cheminées aux murs mitoyens, lucarnes de la mise en page, antenne. État de jour : les vitres
// allumées des lucarnes sont au calque SVG des fenêtres. Dessin provisoire (tâche 5) : contour en aplat zinc ou tuile,
// corniche, souches et lucarnes simples ; le dessin cellulo de la maquette (brisis, terrasson, joints debout, frontons)
// remplacera les corps sans changer ces signatures. Tout reste dans la boîte de l'immeuble (pots compris), seule l'antenne
// dépasse (8 px).

const BRICK = hexRgb('#C2724E');

// Couleur du toit de la mise en page ; immeuble sans mise en page (moins de 12 px visibles) : celle de l'allure.
const roofRgb = (b: PaintBuilding): Rgb => {
  const r = b.layout?.roof;
  return r ? hexRgb(r.kind === 'tile' ? r.tile : r.zinc) : b.look.roof;
};

// Contour du toit : celui de la mise en page ; sans mise en page, toit simple à faîtage à 42 % dans la hauteur `look.roofH`.
function outlineOf(b: PaintBuilding): [number, number][] {
  if (b.layout) return roofOutline(b.layout);
  const eave = b.top + b.look.roofH;
  return [[b.x - 2, eave], [b.x + 0.42 * b.w, b.top + 0.5], [b.x + b.w + 2, eave]];
}

function trace(ctx: PaintCtx, pts: readonly [number, number][]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
}

export function paintParisRoof(ctx: PaintCtx, _plan: CityPaintPlan, b: PaintBuilding): void {
  const { x, w, top, look } = b;
  const eave = top + look.roofH;
  const wall = look.wall;
  const rc = roofRgb(b);
  const pts = outlineOf(b);
  // Corniche sous le toit : rehaut, ombre nette dessous.
  fillRect(ctx, light(wall, 0.5), x - 1.5, eave - 0.8, w + 3, 3);
  fillRect(ctx, shade(wall, 0.42), x, eave + 2.2, w, 2.6);
  inkRect(ctx, x - 1.5, eave - 0.8, w + 3, 3, 0.7);
  // Toit : aplat, puis trait encré sur le contour exact.
  trace(ctx, pts);
  ctx.fillStyle = rgba(rc, 1);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.9;
  trace(ctx, pts);
  ctx.stroke();
  if (b.layout) {
    for (const c of b.layout.chimneys) paintChimney(ctx, c);
    for (const d of b.layout.dormers) paintDormer(ctx, b, d);
  }
  // Antenne (seule à dépasser, de 8 px), posée sur le contour.
  if (look.antenna) {
    const ax = x + w * 0.75;
    const ay = heightOn(pts, ax);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax, ay - 8);
    ctx.moveTo(ax - 3, ay - 7);
    ctx.lineTo(ax + 3, ay - 7);
    ctx.moveTo(ax - 2, ay - 4.5);
    ctx.lineTo(ax + 2, ay - 4.5);
    ctx.stroke();
  }
}

// Souche de cheminée en brique (provisoire) : de `top` à `base`, pots de `top − 2,3` à `top`.
export function paintChimney(ctx: PaintCtx, c: Chimney): void {
  const h = c.base - c.top;
  fillRect(ctx, BRICK, c.x, c.top, 4, h);
  fillRect(ctx, shade(BRICK, 0.35), c.x + 2.6, c.top, 1.4, h);
  for (let p = 0; p < 3; p++) fillRect(ctx, '#9E6A4A', c.x + 0.3 + p * 1.4, c.top - 2.3, 1, 2.3);
  inkRect(ctx, c.x, c.top, 4, h, 0.6);
}

// Lucarne (provisoire, état de jour) : cadre en pierre claire et vitre de la fenêtre `dormer` (fronton, capucine), disque
// cerclé (œil-de-bœuf), châssis à plat (tabatière).
export function paintDormer(ctx: PaintCtx, b: PaintBuilding, d: Dormer): void {
  const stone = light(b.look.wall, 0.3);
  if (d.type === 'oeil') {
    const r = d.w / 2;
    disc(ctx, stone, d.cx, d.y + r, r);
    disc(ctx, GLASS_DAY, d.cx, d.y + r, r - 1);
    return;
  }
  if (d.type === 'tabatiere') {
    fillRect(ctx, shade(roofRgb(b), 0.5), d.cx - d.w / 2, d.y, d.w, d.h);
    fillRect(ctx, '#BBD8F0', d.cx - d.w / 2 + 0.5, d.y + 0.4, d.w - 1, d.h - 0.8);
    return;
  }
  fillRect(ctx, stone, d.cx - d.w / 2 - 1, d.y, d.w + 2, d.h);
  // Vitre : la fenêtre `dormer` de la mise en page (même rectangle que celle du calque des fenêtres allumées).
  const win = b.layout?.windows.find((v) => v.kind === 'dormer' && v.bay === d.bay);
  if (win) fillRect(ctx, GLASS_DAY, win.x, win.y, win.w, win.h);
  inkRect(ctx, d.cx - d.w / 2 - 1, d.y, d.w + 2, d.h, 0.6);
}
