import { heightOn, roofOutline, type Chimney, type Dormer } from '../city/facade-layout';
import { INK, TAU, disc, fillRect, inkRect, light, poly, shade } from './cel';
import type { CityPaintPlan, PaintBuilding } from './city-plan';
import { hexRgb, rgba, type Rgb } from './color';
import { GLASS_DAY } from './facade-painter';
import type { PaintCtx } from './paint-ctx';

// Peintre des toits du premier plan (façades parisiennes), port du dessin cellulo de la maquette
// (docs/superpowers/maquettes/facades-parisiennes/maquette.html : paintRoof, paintChimney, paintDormer, état de jour).
// Contour `roofOutline(layout)` : seule source du toit, partagée avec la neige ; le trait encré le suit exactement.
// Mansarde en zinc : brisis (trapèze rentré de 2,5 px par côté, joints debout) sous un terrasson plat plus clair ; toit simple
// zinc ou tuile du faubourg : deux versants à faible pente, faîtage à 42 %, rangs de tuiles ou de feuilles. Corniche peinte
// APRÈS l'aplat du toit (il la recouvrait). Souches de brique aux coordonnées de `Chimney` (pots de top − 2,3 à top), lucarnes de
// la mise en page, chacune lisible et distincte : fronton triangulaire, fronton cintré, œil-de-bœuf, capucine, tabatière. Les
// vitres allumées des lucarnes sont au calque SVG des fenêtres ; ici le jour. Tout reste dans la boîte de l'immeuble (pots
// compris), seule l'antenne dépasse (7,5 px au plus, 9 permis par la silhouette).

const BRICK = hexRgb('#C2724E');
const BRICK_CAP = '#6E3A2A';
const POT = '#9E6A4A';
// Vitre à plat de la tabatière (reflet du ciel plus franc que les vitres verticales).
const SKYLIGHT = '#BBD8F0';
const REFLET = 'rgba(255,255,255,0.7)';

// Couleur du toit de la mise en page ; immeuble sans mise en page (moins de 12 px visibles) : celle de l'allure.
const roofRgb = (b: PaintBuilding): Rgb => {
  const r = b.layout?.roof;
  return r ? hexRgb(r.kind === 'tile' ? r.tile : r.zinc) : b.look.roof;
};

// Contour du toit : celui de la mise en page ; sans mise en page, toit simple à faîtage à 42 % dans la hauteur `look.roofH`.
// Exporté pour la neige (snow-painter.ts : même ligne de toit).
export function roofOutlineOf(b: PaintBuilding): [number, number][] {
  if (b.layout) return roofOutline(b.layout);
  const eave = b.top + b.look.roofH;
  return [[b.x - 2, eave], [b.x + 0.42 * b.w, b.top + 0.5], [b.x + b.w + 2, eave]];
}

function trace(ctx: PaintCtx, pts: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
}

// Trait encré le long d'une ligne brisée (fermée ou non).
function inkLine(ctx: PaintCtx, pts: readonly (readonly [number, number])[], lw = 0.7, close = false): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;
  trace(ctx, pts);
  if (close) ctx.closePath();
  ctx.stroke();
}

export function paintParisRoof(ctx: PaintCtx, _plan: CityPaintPlan, b: PaintBuilding): void {
  const { x, w, top, look, layout } = b;
  const eave = top + look.roofH;
  const wall = look.wall;
  const rc = roofRgb(b);
  const pts = roofOutlineOf(b);
  const roof = layout?.roof;
  if (layout && layout.roof.kind === 'mansard') {
    const bt = top + layout.roof.terrasson;
    // Brisis : trapèze presque vertical ; ombre à droite, rehaut à gauche, bords nets.
    poly(ctx, rc, [[x - 1.5, eave], [x + 2.5, bt], [x + w - 2.5, bt], [x + w + 1.5, eave]]);
    poly(ctx, shade(rc, 0.3), [[x + w * 0.74, eave], [x + w * 0.74, bt], [x + w - 2.5, bt], [x + w + 1.5, eave]]);
    poly(ctx, light(rc, 0.35), [[x - 1.5, eave], [x + 2.5, bt], [x + w * 0.4, bt], [x + w * 0.4, eave]]);
    // Joints debout du zinc : deux par travée plus un, du bas du brisis à sa ligne haute.
    const joints = layout.bays.length * 2 + 1;
    ctx.strokeStyle = rgba(shade(rc, 0.5), 0.8);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    for (let i = 0; i < joints; i++) {
      const t = (i + 0.5) / joints;
      ctx.moveTo(x - 1.5 + (w + 3) * t, eave);
      ctx.lineTo(x + 2.5 + (w - 5) * t, bt);
    }
    ctx.stroke();
    // Terrasson : bande plate plus claire, ombre à droite.
    poly(ctx, light(rc, 0.5), [[x + 2.5, bt], [x + 5, top + 0.5], [x + w - 5, top + 0.5], [x + w - 2.5, bt]]);
    poly(ctx, shade(rc, 0.2), [[x + w * 0.74, bt], [x + w * 0.74, top + 0.5], [x + w - 5, top + 0.5], [x + w - 2.5, bt]]);
    inkLine(ctx, pts, 0.9);
    inkLine(ctx, [[x + 2.5, bt], [x + w - 2.5, bt]], 0.6);
  } else {
    // Toit à faible pente, deux versants vus de face : rehaut à gauche du faîtage, ombre à droite.
    const rx = x + 0.42 * w;
    poly(ctx, rc, pts);
    poly(ctx, light(rc, 0.35), [[x - 2, eave], [rx, top + 0.5], [rx, eave]]);
    poly(ctx, shade(rc, 0.32), [[rx, top + 0.5], [x + w + 2, eave], [rx, eave]]);
    // Rangs de tuiles (pas 2,4) ou de feuilles de zinc (pas 3,2), élargis avec la pente.
    ctx.strokeStyle = rgba(shade(rc, 0.5), 0.8);
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    for (let yy = top + 3; yy < eave; yy += roof?.kind === 'tile' ? 2.4 : 3.2) {
      const t = (yy - top) / (eave - top);
      ctx.moveTo(rx - (rx - x + 2) * t, yy);
      ctx.lineTo(rx + (x + w + 2 - rx) * t, yy);
    }
    ctx.stroke();
    // Faîtière claire.
    fillRect(ctx, light(rc, 0.5), rx - 1, top + 0.3, 2, 0.8);
    inkLine(ctx, pts, 0.9);
  }
  // Corniche sous le toit : rehaut, ombre nette dessous ; peinte après l'aplat du toit pour rester entière.
  fillRect(ctx, light(wall, 0.5), x - 1.5, eave - 0.8, w + 3, 3);
  fillRect(ctx, shade(wall, 0.42), x, eave + 2.2, w, 2.6);
  inkRect(ctx, x - 1.5, eave - 0.8, w + 3, 3, 0.7);
  if (layout) {
    for (const c of layout.chimneys) paintChimney(ctx, c);
    for (const d of layout.dormers) paintDormer(ctx, b, d);
  }
  // Antenne (seule à dépasser : 7,5 px au plus, le contour étant au moins à top + 0,5), posée sur le contour.
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

// Souche de cheminée en brique : fût de `top` à `base` (ombre à droite, rehaut à gauche), couronnement sombre en débord,
// trois pots de terre cuite de `top − 2,3` à `top` (toujours dans la boîte de l'immeuble : la mise en page y veille).
export function paintChimney(ctx: PaintCtx, c: Chimney): void {
  const h = c.base - c.top;
  fillRect(ctx, BRICK, c.x, c.top, 4, h);
  fillRect(ctx, shade(BRICK, 0.35), c.x + 2.6, c.top, 1.4, h);
  fillRect(ctx, light(BRICK, 0.4), c.x, c.top, 0.9, h);
  fillRect(ctx, BRICK_CAP, c.x - 0.6, c.top, 5.2, 1.2);
  for (let p = 0; p < 3; p++) fillRect(ctx, POT, c.x + 0.3 + p * 1.4, c.top - 2.3, 1, 2.3);
  inkRect(ctx, c.x, c.top, 4, h, 0.6);
}

// Vitre de jour d'une lucarne verticale : bleu du ciel, reflet blanc en diagonale, cadre encré et meneau.
function paintGlass(ctx: PaintCtx, gx: number, gy: number, gw: number, gh: number): void {
  fillRect(ctx, GLASS_DAY, gx, gy, gw, gh);
  poly(ctx, REFLET, [[gx, gy + gh * 0.5], [gx + gw * 0.6, gy], [gx + gw, gy], [gx, gy + gh]]);
  inkRect(ctx, gx, gy, gw, gh, 0.5);
  inkLine(ctx, [[gx + gw / 2, gy], [gx + gw / 2, gy + gh]], 0.5);
}

// Lucarne (état de jour), chaque type bien distinct :
// - frontons (dans le brisis) : joue de zinc à l'ombre, face en pierre claire, fronton triangulaire ou cintré en débord ;
// - œil-de-bœuf : disque cerclé de pierre, ombre de zinc décalée, croisillon ;
// - capucine (toit simple) : chambre en avancée coiffée d'un petit toit de zinc à trois pans ;
// - tabatière : châssis vitré à plat, parallélogramme couché sur le versant ou le terrasson.
// Fronton et capucine : la vitre est le rectangle de la fenêtre `dormer` de la mise en page (d.y + 1, d.h − 2), celui que
// le calque des fenêtres allume la nuit.
export function paintDormer(ctx: PaintCtx, b: PaintBuilding, d: Dormer): void {
  const wall = b.look.wall;
  const zc = roofRgb(b);
  const stone = light(wall, 0.3);
  if (d.type === 'fronton-tri' || d.type === 'fronton-cintre') {
    const { w, h, y, cx } = d;
    const x = cx - w / 2;
    fillRect(ctx, shade(zc, 0.45), x + w - 0.5, y - 1, 2.2, h + 1);
    fillRect(ctx, stone, x - 1.2, y, w + 2.4, h);
    fillRect(ctx, shade(wall, 0.3), x + w * 0.74, y, w * 0.26 + 1.2, h);
    if (d.type === 'fronton-tri') {
      poly(ctx, light(stone, 0.4), [[x - 2.2, y], [cx, y - 3.6], [x + w + 2.2, y]]);
      inkLine(ctx, [[x - 2.2, y], [cx, y - 3.6], [x + w + 2.2, y]], 0.7, true);
    } else {
      const r = w / 2 + 2;
      ctx.fillStyle = rgba(light(stone, 0.4), 1);
      ctx.beginPath();
      ctx.moveTo(x - 2, y);
      ctx.arc(cx, y, r, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(cx, y, r, Math.PI, 0);
      ctx.closePath();
      ctx.stroke();
    }
    paintGlass(ctx, x, y + 1, w, h - 2);
    inkRect(ctx, x - 1.2, y, w + 2.4, h, 0.6);
    return;
  }
  if (d.type === 'oeil') {
    // Disque de rayon 2,6 cerclé (3,6 hors tout) : `d.y` est le haut de la boîte, le centre est à mi-hauteur.
    const R = 2.6;
    const cy = d.y + d.h / 2;
    disc(ctx, stone, d.cx, cy, R + 1);
    disc(ctx, shade(zc, 0.4), d.cx + 0.6, cy + 0.6, R + 0.6);
    disc(ctx, stone, d.cx, cy, R + 0.6);
    disc(ctx, GLASS_DAY, d.cx, cy, R);
    disc(ctx, REFLET, d.cx - 0.6, cy - 0.6, R * 0.55);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(d.cx, cy, R, 0, TAU);
    ctx.moveTo(d.cx - R, cy);
    ctx.lineTo(d.cx + R, cy);
    ctx.moveTo(d.cx, cy - R);
    ctx.lineTo(d.cx, cy + R);
    ctx.stroke();
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(d.cx, cy, R + 0.9, 0, TAU);
    ctx.stroke();
    return;
  }
  if (d.type === 'capucine') {
    const { w, h, y, cx } = d;
    const x = cx - w / 2;
    fillRect(ctx, light(wall, 0.2), x - 1, y, w + 2, h);
    fillRect(ctx, shade(wall, 0.3), x + w * 0.7, y, w * 0.3 + 1, h);
    // Petit toit à trois pans en zinc, rehaut devant, ombre à droite.
    poly(ctx, light(zc, 0.4), [[x - 2.5, y], [x - 0.5, y - 2.8], [x + w + 0.5, y - 2.8], [x + w + 2.5, y]]);
    poly(ctx, shade(zc, 0.3), [[x + w * 0.7, y], [x + w * 0.7, y - 2.8], [x + w + 0.5, y - 2.8], [x + w + 2.5, y]]);
    inkLine(ctx, [[x - 2.5, y], [x - 0.5, y - 2.8], [x + w + 0.5, y - 2.8], [x + w + 2.5, y]], 0.7, true);
    paintGlass(ctx, x, y + 1, w, h - 2);
    inkRect(ctx, x - 1, y, w + 2, h, 0.6);
    return;
  }
  // Tabatière : châssis à plat, vitre claire et reflet, couchés en parallélogramme.
  const { w, h, y } = d;
  const x = d.cx - w / 2;
  poly(ctx, shade(zc, 0.5), [[x, y], [x + w, y], [x + w + 1.2, y + h], [x + 1.2, y + h]]);
  poly(ctx, SKYLIGHT, [[x + 0.5, y + 0.4], [x + w - 0.5, y + 0.4], [x + w + 0.5, y + h - 0.4], [x + 1.5, y + h - 0.4]]);
  poly(ctx, 'rgba(255,255,255,0.75)', [[x + 0.5, y + 0.4], [x + w * 0.5, y + 0.4], [x + 1.5, y + h - 0.4]]);
  inkLine(ctx, [[x, y], [x + w, y], [x + w + 1.2, y + h], [x + 1.2, y + h]], 0.5, true);
}
