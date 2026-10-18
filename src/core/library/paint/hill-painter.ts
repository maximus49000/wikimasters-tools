import { TAU, disc, fillRect, ink, light, poly, shade } from './cel';
import { FAR_HAZE, hillCrestY, type CityPaintPlan, type HillHouse, type Landmark, type PaintBuilding } from './city-plan';
import { hexRgb, mixRgb, rgba, type Rgb } from './color';
import type { PaintCtx } from './paint-ctx';

// Fond de la ville peinte (vague Ghibli, décor cellulo) : colline verte, rangs de maisons empilées (toits terracotta,
// lucarnes, cheminées, bouquets d'arbres), tour-horloge et dômes, puis le mur du fond existant redessiné en
// quatrième rang. Tout est en aplats cernés ; la brume (`haze`) éclaircit et bleuit avec la distance. Aucun tirage ici :
// le plan a tout décidé, le dessin est donc identique d'une tranche à l'autre.
const HAZE = hexRgb('#9CC0E4');
const GRASS = hexRgb('#5E9A50');
const STONE = hexRgb('#EAD6B0');
const SPIRE = hexRgb('#4E6A78');
const DOME_C = hexRgb('#5A8A80');
const BRICK = hexRgb('#C2724E');
const GLASS_FAR = hexRgb('#5A7AA8');
const TREE_TONES = ['#2E6E34', '#56A844', '#A6DC60'].map(hexRgb);
const haze = (c: Rgb, t: number): Rgb => mixRgb(c, HAZE, t);

export function paintHillGround(ctx: PaintCtx, plan: CityPaintPlan, x0: number, x1: number): void {
  const a = x0 - 4;
  const b = x1 + 4;
  const crest = (x: number): number => hillCrestY(plan, x);
  ctx.fillStyle = rgba(haze(GRASS, 0.35), 1);
  ctx.beginPath();
  ctx.moveTo(a, plan.ground);
  for (let x = a; x < b; x += 4) ctx.lineTo(x, crest(x));
  ctx.lineTo(b, crest(b));
  ctx.lineTo(b, plan.ground);
  ctx.closePath();
  ctx.fill();
  // Rehaut net le long de la crête (soleil) : bande de 3 px sous la ligne.
  ctx.fillStyle = rgba(haze(light(GRASS, 0.4), 0.3), 1);
  ctx.beginPath();
  ctx.moveTo(a, crest(a) + 3);
  for (let x = a; x < b; x += 4) ctx.lineTo(x, crest(x));
  ctx.lineTo(b, crest(b));
  ctx.lineTo(b, crest(b) + 3);
  for (let x = b; x > a; x -= 4) ctx.lineTo(x, crest(x) + 3);
  ctx.closePath();
  ctx.fill();
}

export function paintHillHouse(ctx: PaintCtx, h: HillHouse): void {
  const { x, w, s, haze: hz, base, top } = h;
  const rh = h.h * 0.32;
  const wall = haze(h.wall, hz);
  const rc = haze(h.roof, hz);
  // Mur : aplat, ombre nette à droite, ombre sous le toit.
  fillRect(ctx, wall, x, top + rh, w, h.h - rh + 2);
  fillRect(ctx, shade(wall, 0.3), x + w * 0.7, top + rh, w * 0.3, h.h - rh + 2);
  // Toit.
  const o = 1.5 * s;
  const pts: [number, number][] =
    h.kind === 'gable'
      ? [[x - o, top + rh], [x + w / 2, top], [x + w + o, top + rh]]
      : h.kind === 'hip'
        ? [[x - o, top + rh], [x + w * 0.25, top], [x + w * 0.75, top], [x + w + o, top + rh]]
        : [[x - o, top + rh], [x + o, top + 1], [x + w - o, top + 1], [x + w + o, top + rh]];
  poly(ctx, rc, pts);
  ctx.save();
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.clip();
  fillRect(ctx, light(rc, 0.35), x - o, top, w * 0.5 + o, rh);
  fillRect(ctx, shade(rc, 0.35), x + w * 0.72, top, w * 0.28 + o, rh);
  ctx.restore();
  // Trait du toit un peu plus ferme que celui du mur (tâche 15 : la maison visitée par le père Noël se lisait mal la nuit).
  ctx.strokeStyle = ink(0.95 - hz);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.stroke();
  // Rehaut net du faîte (le soleil vient du haut à gauche) : sur le faîte plat des croupes et mansardes, sur le versant
  // gauche des pignons.
  ctx.strokeStyle = rgba(light(rc, 0.55), 0.9);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0] + 0.4, pts[0]![1] - 0.4);
  ctx.lineTo(pts[1]![0], pts[1]![1] + 0.5);
  if (pts.length === 4) ctx.lineTo(pts[2]![0], pts[2]![1] + 0.5);
  ctx.stroke();
  fillRect(ctx, shade(wall, 0.42), x, top + rh, w, 2 * s);
  // Lucarnes et cheminée.
  if (h.dormers) {
    for (let dx = x + 4 * s; dx < x + w - 5 * s; dx += 8 * s) {
      fillRect(ctx, light(rc, 0.5), dx, top + rh * 0.45, 3 * s, rh * 0.5);
      fillRect(ctx, shade(wall, 0.5), dx + 0.6 * s, top + rh * 0.55, 1.8 * s, rh * 0.38);
    }
  }
  if (h.chimney !== null) {
    // Mêmes coordonnées que `chimneyHole` / `hillChimneyTop` (city/santa.ts : le père Noël y descend, les mouettes s'y
    // posent) : seul l'aspect change — brique un ton plus sombre, face droite à l'ombre, trait encré, couronnement.
    const cx = x + w * h.chimney;
    const cy = top - 4 * s + rh * 0.4;
    const brick = haze(shade(BRICK, 0.12), hz);
    fillRect(ctx, brick, cx, cy, 3 * s, 6 * s);
    fillRect(ctx, shade(brick, 0.38), cx + 2 * s, cy, s, 6 * s);
    ctx.strokeStyle = ink(0.9 - hz);
    ctx.lineWidth = 0.6;
    ctx.strokeRect(cx, cy, 3 * s, 6 * s);
    fillRect(ctx, ink(0.7 - hz), cx - 0.4, cy, 3.8 * s, 0.8);
  }
  // Fenêtres (bleutées ; le fond n'a pas de fenêtres allumées).
  ctx.fillStyle = rgba(haze(GLASS_FAR, hz + 0.2), 1);
  for (let wy = top + rh + 4 * s; wy + 5 * s < base; wy += 9 * s) for (let wx = x + 3 * s; wx + 4 * s < x + w - 2 * s; wx += 7 * s) ctx.fillRect(wx, wy, 3.2 * s, 4.5 * s);
  ctx.strokeStyle = ink(0.8 - hz);
  ctx.lineWidth = 0.6;
  ctx.strokeRect(x, top + rh, w, h.h - rh + 2);
  // Bouquet d'arbres après la maison.
  if (h.trees) {
    const { x: tx, r: tr } = h.trees;
    const ty = base - 6 * s;
    ctx.strokeStyle = ink(0.85 - hz);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(tx, ty, tr, 0, TAU);
    ctx.moveTo(tx + tr * 0.8 + tr * 0.8, ty + tr * 0.3);
    ctx.arc(tx + tr * 0.8, ty + tr * 0.3, tr * 0.8, 0, TAU);
    ctx.stroke();
    for (let t = 0; t < 3; t++) {
      ctx.fillStyle = rgba(haze(TREE_TONES[t]!, hz), 1);
      ctx.beginPath();
      ctx.arc(tx - t * tr * 0.25, ty - t * tr * 0.28, tr * (1 - t * 0.3), 0, TAU);
      ctx.moveTo(tx + tr * 0.8 - t * tr * 0.25 + tr * 0.8 * (1 - t * 0.3), ty + tr * 0.3 - t * tr * 0.28);
      ctx.arc(tx + tr * 0.8 - t * tr * 0.25, ty + tr * 0.3 - t * tr * 0.28, tr * 0.8 * (1 - t * 0.3), 0, TAU);
      ctx.fill();
    }
  }
}

export function paintLandmark(ctx: PaintCtx, l: Landmark, hz: number): void {
  const { x, s, base } = l;
  if (l.kind === 'tower') {
    const w = 14 * s;
    const h = 70 * s;
    const c = haze(STONE, hz);
    fillRect(ctx, c, x, base - h, w, h);
    fillRect(ctx, shade(c, 0.3), x + w * 0.65, base - h, w * 0.35, h);
    poly(ctx, haze(SPIRE, hz), [[x - 2 * s, base - h], [x + w / 2, base - h - 22 * s], [x + w + 2 * s, base - h]]);
    disc(ctx, haze(hexRgb('#D0583A'), hz), x + w / 2, base - h - 22 * s, 3 * s);
    // Cadran.
    disc(ctx, '#FFF8E0', x + w / 2, base - h + 12 * s, 4.5 * s);
    ctx.strokeStyle = ink(0.9);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(x + w / 2, base - h + 12 * s, 4.5 * s, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w / 2, base - h + 12 * s);
    ctx.lineTo(x + w / 2, base - h + 9 * s);
    ctx.moveTo(x + w / 2, base - h + 12 * s);
    ctx.lineTo(x + w / 2 + 2.5 * s, base - h + 12 * s);
    ctx.stroke();
    for (let k = 0; k < 3; k++) {
      fillRect(ctx, shade(c, 0.5), x + w * 0.3, base - h + 24 * s + k * 12 * s, w * 0.18, 5 * s);
      fillRect(ctx, shade(c, 0.5), x + w * 0.6, base - h + 24 * s + k * 12 * s, w * 0.18, 5 * s);
    }
    ctx.strokeStyle = ink(0.8 - hz);
    ctx.lineWidth = 0.7;
    ctx.strokeRect(x, base - h, w, h);
    return;
  }
  const c = haze(STONE, hz);
  const dc = haze(DOME_C, hz);
  fillRect(ctx, c, x, base - 26 * s, 26 * s, 26 * s);
  fillRect(ctx, shade(c, 0.3), x + 17 * s, base - 26 * s, 9 * s, 26 * s);
  ctx.fillStyle = rgba(dc, 1);
  ctx.beginPath();
  ctx.arc(x + 13 * s, base - 26 * s, 13 * s, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = rgba(light(dc, 0.4), 1);
  ctx.beginPath();
  ctx.arc(x + 13 * s, base - 26 * s, 13 * s, Math.PI * 1.05, Math.PI * 1.45);
  ctx.lineTo(x + 13 * s, base - 26 * s);
  ctx.fill();
  fillRect(ctx, c, x + 12 * s, base - 44 * s, 2 * s, 6 * s);
  ctx.strokeStyle = ink(0.8 - hz);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(x + 13 * s, base - 26 * s, 13 * s, Math.PI, 0);
  ctx.stroke();
  ctx.strokeRect(x, base - 26 * s, 26 * s, 26 * s);
}

// Mur du fond existant (immeubles `far`, contigus) : quatrième rang de la colline, à peine brumeux. Fenêtres aux positions
// de `farWindows` (le calque SVG les allume la nuit au même endroit).
export function paintFarWall(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding, left: PaintBuilding | null): void {
  const hz = FAR_HAZE;
  const { x, w, top } = b;
  const eave = top + b.look.roofH;
  const h = plan.ground - eave;
  const wall = haze(b.look.wall, hz);
  const rc = haze(b.look.roof, hz);
  fillRect(ctx, wall, x, eave, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, eave, w, h);
  ctx.clip();
  fillRect(ctx, shade(wall, 0.28), x + w * 0.72, eave, w * 0.28, h);
  if (left && left.top < top) poly(ctx, shade(wall, 0.28), [[x, left.top], [x + (plan.ground - left.top) * 0.55, plan.ground], [x, plan.ground]]);
  fillRect(ctx, light(wall, 0.4), x, eave, 1.2, h);
  ctx.restore();
  // Pas de débord (même ligne de toit que `roofLineY` pour la neige).
  const o = 0;
  const pts: [number, number][] = b.look.roofKind === 'gable' ? [[x - o, eave], [x + w / 2, top], [x + w + o, eave]] : [[x - o, eave], [x + 1.5, top + 1], [x + w - 1.5, top + 1], [x + w + o, eave]];
  poly(ctx, rc, pts);
  ctx.save();
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.clip();
  fillRect(ctx, light(rc, 0.35), x, top, w * 0.5, b.look.roofH);
  fillRect(ctx, shade(rc, 0.35), x + w * 0.72, top, w * 0.28, b.look.roofH);
  ctx.restore();
  ctx.strokeStyle = ink(0.85 - hz);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.stroke();
  fillRect(ctx, shade(wall, 0.42), x, eave, w, 2);
  if (b.look.chimney !== null) {
    const cx = x + w * b.look.chimney;
    fillRect(ctx, haze(BRICK, hz), cx, top + 1, 3, b.look.roofH * 0.6);
    fillRect(ctx, ink(0.7), cx - 0.4, top + 1, 3.8, 0.8);
  }
  // Grille de fenêtres sur toute la hauteur (même grille que `farWindows` : colonnes de 8 px, rangées de 11 px, 3,5 × 5),
  // puis les fenêtres de `farWindows` par-dessus (celles que le calque SVG allume la nuit).
  ctx.fillStyle = rgba(haze(GLASS_FAR, 0.3), 1);
  const cols = Math.max(1, Math.floor((w - 6) / 8));
  for (let wy = top + 5; wy + 5 <= plan.ground - 8; wy += 11) for (let c = 0; c < cols; c++) ctx.fillRect(x + 4 + c * 8, wy, 3.5, 5);
  ctx.fillStyle = rgba(haze(GLASS_FAR, 0.2), 1);
  for (const win of b.wins) ctx.fillRect(win.x, win.y, win.w, win.h);
  ctx.strokeStyle = ink(0.8 - hz);
  ctx.lineWidth = 0.6;
  ctx.strokeRect(x, eave, w, h);
}
