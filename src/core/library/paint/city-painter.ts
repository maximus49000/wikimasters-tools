import { hashString, mulberry32 } from '../scene-world';
import { cellRng, type Box } from './brush';
import { INK, SHADOW_K, TAU, disc, fillRect, groundShadow, ink, inkRect, light, pick, poly, shade } from './cel';
import { HILL_ROWS, type CityPaintPlan, type Furniture, type Gull, type HillHouse, type Landmark, type PaintBuilding, type PaintPodium, type PlanDoor, type Tree } from './city-plan';
import { paintEntrance } from './shop/entrance';
import { hexRgb, rgba, type Rgb } from './color';
import { paintFarWall, paintGull, paintHillGround, paintHillHouse, paintLandmark } from './hill-painter';
import type { PaintCtx } from './paint-ctx';

// Peintre de la ville (vague Ghibli, décor cellulo) : une tranche de TILE px du monde, en coordonnées du monde (l'appelant
// décale le canvas). Aplats francs, un ton d'ombre à bord net, un rehaut, trait encré. Chaque immeuble, arbre et meuble a
// son propre générateur : peint depuis deux tranches, il est identique.
export const TILE = 360;
// À incrémenter à chaque changement du dessin : invalide le cache des tranches.
export const PAINT_VERSION = 3;

const CLOTH = ['#E8456B', '#FFFFFF', '#F6C62E', '#4E8ED8', '#6BB36B', '#F28CB4'].map(hexRgb);
const FLOWERS = ['#3F8A3A', '#E8456B', '#F6C62E', '#FFFFFF', '#E070C0'].map(hexRgb);
const IVY = ['#2A6A2E', '#4E9C3A', '#8CCB50'].map(hexRgb);
const LEAVES = ['#2A6A2E', '#52A23C', '#A8DC58'].map(hexRgb);
const GLASS = hexRgb('#7FB4E0');
const BRICK = hexRgb('#C2724E');
const BARK = hexRgb('#9A8468');
const SIDEWALK = hexRgb('#E6D4AE');
const COBBLE = hexRgb('#B49E7A');
const BENCH = hexRgb('#C48A54');
const MAILBOX = hexRgb('#F6C820');
const POSTERS = ['#E85A3A', '#3A7EC8', '#F0C030', '#8A58B8'].map(hexRgb);

export const tileCount = (width: number): number => Math.max(1, Math.ceil(width / TILE));

export type TileItems = { buildings: PaintBuilding[]; podiums: PaintPodium[]; trees: Tree[]; houses: HillHouse[]; landmarks: Landmark[]; gulls: Gull[]; furniture: Furniture[]; doors: PlanDoor[] };

export function tileItems(plan: CityPaintPlan, tile: number): TileItems {
  const x0 = tile * TILE - 2;
  const x1 = (tile + 1) * TILE + 2;
  return {
    buildings: plan.buildings.filter((b) => b.x < x1 && b.x + b.w > x0),
    podiums: plan.podiums.filter((p) => p.x < x1 && p.x + p.w > x0),
    trees: plan.trees.filter((t) => t.x - t.r < x1 && t.x + t.r > x0),
    houses: plan.hill.houses.filter((h) => h.x - 2 < x1 && h.x + h.w + (h.trees ? h.trees.r * 2 : 0) + 2 > x0),
    landmarks: plan.hill.landmarks.filter((l) => l.x - 3 < x1 && l.x + l.w + 3 > x0),
    gulls: plan.hill.gulls.filter((g) => g.x - 8 * g.s < x1 && g.x + 8 * g.s > x0),
    furniture: plan.furniture.filter((f) => f.x - 10 < x1 && f.x + f.w + 10 > x0),
    doors: plan.doors.filter((d) => d.cx - 13 * d.s < x1 && d.cx + 13 * d.s > x0),
  };
}

export function tileKey(plan: CityPaintPlan, tile: number): string {
  const it = tileItems(plan, tile);
  return [
    PAINT_VERSION,
    plan.seed,
    plan.height,
    tile,
    Math.min(TILE, plan.width - tile * TILE),
    // Sans l'id : celui d'un immeuble du fond (index dans les façades) change quand la pièce grandit.
    it.buildings.map((b) => `${b.far ? 'f' : ''}@${b.x.toFixed(1)}`).join(','),
    it.podiums.map((p) => p.x.toFixed(1)).join(','),
    it.trees.map((t) => `${t.x.toFixed(1)}:${t.r.toFixed(1)}`).join(','),
    it.houses.map((h) => `${h.row}${h.x.toFixed(1)}`).join(','),
    it.landmarks.map((l) => `${l.kind}${l.x.toFixed(1)}`).join(','),
    it.gulls.map((g) => g.x.toFixed(1)).join(','),
    it.furniture.map((f) => `${f.kind}${f.x.toFixed(1)}`).join(','),
    it.doors.map((d) => `${d.variant}${d.x.toFixed(1)}`).join(','),
  ].join('|');
}

const rngOf = (plan: CityPaintPlan, salt: string, x: number) => mulberry32(plan.seed ^ hashString(salt) ^ Math.round(x * 8));

// Immeuble du même plan immédiatement à gauche (pour l'ombre portée) : à moins de LEFT_GAP px (les immeubles du premier plan
// sont espacés de 8 à 22 px).
export const LEFT_GAP = 26;
export function leftOf(plan: CityPaintPlan, b: PaintBuilding): PaintBuilding | null {
  let best: PaintBuilding | null = null;
  for (const o of plan.buildings) {
    if (o.far !== b.far || o === b || o.x >= b.x) continue;
    if (o.x + o.w < b.x - LEFT_GAP) continue;
    if (!best || o.x > best.x) best = o;
  }
  return best;
}

function roofPath(ctx: PaintCtx, b: PaintBuilding): void {
  const { x, w, top } = b;
  const eave = top + b.look.roofH;
  ctx.beginPath();
  if (b.look.roofKind === 'gable') {
    ctx.moveTo(x - 2, eave);
    ctx.lineTo(x + w / 2, top);
    ctx.lineTo(x + w + 2, eave);
  } else if (b.look.roofKind === 'mansard') {
    ctx.moveTo(x - 2, eave);
    ctx.lineTo(x + 2, top + 1);
    ctx.lineTo(x + w - 2, top + 1);
    ctx.lineTo(x + w + 2, eave);
  } else {
    ctx.moveTo(x - 1, eave);
    ctx.lineTo(x - 1, top + 1);
    ctx.lineTo(x + w + 1, top + 1);
    ctx.lineTo(x + w + 1, eave);
  }
  ctx.closePath();
}

function paintRoof(ctx: PaintCtx, b: PaintBuilding): void {
  const { x, w, top, look } = b;
  const eave = top + look.roofH;
  const rc = look.roof;
  ctx.save();
  roofPath(ctx, b);
  ctx.fillStyle = rgba(rc, 1);
  ctx.fill();
  ctx.clip();
  if (look.roofKind === 'gable') {
    poly(ctx, light(rc, 0.35), [[x - 2, eave], [x + w / 2, top], [x + w / 2, eave]]);
    poly(ctx, shade(rc, 0.35), [[x + w / 2, top], [x + w + 2, eave], [x + w / 2, eave]]);
    ctx.strokeStyle = rgba(shade(rc, 0.5), 0.8);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let y = top + 3; y < eave; y += 2.6) {
      ctx.moveTo(x - 2, y);
      ctx.lineTo(x + w + 2, y);
    }
    ctx.stroke();
    fillRect(ctx, light(rc, 0.5), x - 2, top, w + 4, 0.8);
  } else if (look.roofKind === 'mansard') {
    fillRect(ctx, light(rc, 0.35), x - 2, top, w * 0.5, look.roofH);
    fillRect(ctx, shade(rc, 0.3), x + w * 0.72, top, w * 0.3, look.roofH);
    ctx.strokeStyle = rgba(shade(rc, 0.5), 0.7);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let y = top + 3.5; y < eave; y += 3) {
      ctx.moveTo(x - 2, y);
      ctx.lineTo(x + w + 2, y);
    }
    ctx.stroke();
  } else {
    fillRect(ctx, light(rc, 0.4), x - 1, top + 1, w * 0.5, look.roofH);
    fillRect(ctx, shade(rc, 0.3), x + w * 0.72, top, w * 0.3, look.roofH);
    ctx.fillStyle = rgba(shade(rc, 0.5), 1);
    for (let sx = x + 4; sx < x + w; sx += 6) ctx.fillRect(sx, top + 1, 0.7, look.roofH);
  }
  ctx.restore();
  roofPath(ctx, b);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.9;
  ctx.stroke();
}

export function paintBuilding(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding): void {
  if (b.far) return paintFarWall(ctx, plan, b, leftOf(plan, b));
  const rng = rngOf(plan, 'ghibli-building', b.x);
  const { x, w, top, look } = b;
  const { ground } = plan;
  const eave = top + look.roofH;
  const h = ground - eave;
  const wall = look.wall;
  const left = leftOf(plan, b);
  fillRect(ctx, wall, x, eave, w, h);
  // Ton d'ombre : bande droite (côté opposé au soleil) + ombre portée du voisin de gauche, bords nets.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, eave, w, h);
  ctx.clip();
  fillRect(ctx, shade(wall, 0.28), x + w * 0.72, eave, w * 0.28, h);
  if (left && left.top < top) poly(ctx, shade(wall, 0.28), [[x, left.top], [x + (ground - left.top) * SHADOW_K, ground], [x, ground]]);
  // Rehaut : liseré clair côté soleil ; salissure du pied.
  fillRect(ctx, light(wall, 0.45), x, eave, 1.6, h);
  fillRect(ctx, shade(wall, 0.18), x, ground - 3, w, 3);
  if (look.ivy) {
    const side = look.ivy === 'left' ? x - 2 : x + w * 0.55;
    const clumps: [number, number, number][] = [];
    for (let i = 0; i < 14; i++) clumps.push([side + rng() * w * 0.45, eave + h * 0.3 + rng() * h * 0.68, 3 + rng() * 3.5]);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const [cx, cy, cr] of clumps) {
      ctx.moveTo(cx + cr, cy);
      ctx.arc(cx, cy, cr, 0, TAU);
    }
    ctx.stroke();
    for (let t = 0; t < 3; t++) {
      ctx.fillStyle = rgba(IVY[t]!, 1);
      ctx.beginPath();
      for (const [cx, cy, cr] of clumps) {
        const rr = cr * (1 - t * 0.28);
        ctx.moveTo(cx - t * 1.2 + rr, cy - t * 1.4);
        ctx.arc(cx - t * 1.2, cy - t * 1.4, rr, 0, TAU);
      }
      ctx.fill();
    }
  }
  ctx.restore();
  paintRoof(ctx, b);
  // Ombre nette sous le toit.
  fillRect(ctx, shade(wall, 0.42), x, eave, w, 3.5);
  // Cheminée à pots (posée sur le versant, dans la hauteur de l'immeuble : la silhouette ne change pas), antenne (seule à
  // dépasser, de 9 px au plus).
  if (look.chimney !== null) {
    const cx = x + w * look.chimney;
    const ch = look.roofKind === 'zinc' ? 7 : 9;
    const cy = top + 1;
    fillRect(ctx, BRICK, cx, cy + 2.4, 4, ch - 2.4);
    fillRect(ctx, shade(BRICK, 0.35), cx + 2.6, cy + 2.4, 1.4, ch - 2.4);
    fillRect(ctx, light(BRICK, 0.4), cx, cy + 2.4, 1, ch - 2.4);
    fillRect(ctx, '#6E3A2A', cx - 0.6, cy + 2.4, 5.2, 1.3);
    for (let p = 0; p < 2; p++) fillRect(ctx, '#9E6A4A', cx + 0.6 + p * 2, cy, 1.2, 2.6);
    inkRect(ctx, cx, cy + 2.4, 4, ch - 2.4, 0.7);
  }
  if (look.antenna) {
    const ax = x + w * 0.75;
    const ay = look.roofKind === 'gable' ? top + (look.roofH * Math.abs(ax - (x + w / 2))) / (w / 2 + 2) : top + 1;
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
  // Fenêtres.
  for (const win of b.wins) {
    if (win.dormer) {
      if (look.roofKind === 'zinc') {
        fillRect(ctx, light(look.roof, 0.45), win.x - 1.2, win.y - 1, win.w + 2.4, win.h + 1.6);
        inkRect(ctx, win.x - 1.2, win.y - 1, win.w + 2.4, win.h + 1.6, 0.6);
      } else {
        poly(ctx, light(look.roof, 0.45), [[win.x - 1.4, win.y], [win.x + win.w / 2, Math.max(top, win.y - 3.4)], [win.x + win.w + 1.4, win.y]]);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(win.x - 1.4, win.y);
        ctx.lineTo(win.x + win.w / 2, Math.max(top, win.y - 3.4));
        ctx.lineTo(win.x + win.w + 1.4, win.y);
        ctx.closePath();
        ctx.stroke();
        fillRect(ctx, shade(look.roof, 0.4), win.x - 0.9, win.y, win.w + 1.8, win.h + 0.6);
      }
    }
    fillRect(ctx, GLASS, win.x, win.y, win.w, win.h);
    poly(ctx, 'rgba(255,255,255,0.75)', [[win.x, win.y + win.h * 0.55], [win.x + win.w * 0.55, win.y], [win.x + win.w, win.y], [win.x, win.y + win.h * 0.9]]);
    fillRect(ctx, shade(GLASS, 0.45), win.x, win.y, win.w, 1.2);
    if (win.curtain) {
      fillRect(ctx, '#FFF4DC', win.x, win.y, 1.6, win.h);
      fillRect(ctx, '#FFF4DC', win.x + win.w - 1.6, win.y, 1.6, win.h);
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.6;
    ctx.strokeRect(win.x, win.y, win.w, win.h);
    ctx.beginPath();
    ctx.moveTo(win.x + win.w / 2, win.y);
    ctx.lineTo(win.x + win.w / 2, win.y + win.h);
    ctx.stroke();
    if (win.dormer) continue;
    if (look.shutters && win.x - 3 >= x && win.x + win.w + 3 <= x + w) {
      fillRect(ctx, light(look.shutters, 0.25), win.x - 2.6, win.y, 2.1, win.h);
      fillRect(ctx, shade(look.shutters, 0.3), win.x + win.w + 0.5, win.y, 2.1, win.h);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(win.x - 2.6, win.y, 2.1, win.h);
      ctx.strokeRect(win.x + win.w + 0.5, win.y, 2.1, win.h);
      ctx.fillStyle = rgba(shade(look.shutters, 0.5), 1);
      for (let k = 1.5; k < win.h; k += 2) {
        ctx.fillRect(win.x - 2.3, win.y + k, 1.5, 0.4);
        ctx.fillRect(win.x + win.w + 0.8, win.y + k, 1.5, 0.4);
      }
    }
    fillRect(ctx, '#FFF6E0', win.x - 0.9, win.y + win.h, win.w + 1.8, 1);
    fillRect(ctx, shade(wall, 0.4), win.x - 0.9, win.y + win.h + 1, win.w + 1.8, 1);
    if (look.boxes && rng() < 0.55 && win.y + win.h + 3 <= ground) {
      fillRect(ctx, '#8A4A2E', win.x - 0.6, win.y + win.h + 1, win.w + 1.2, 1.6);
      inkRect(ctx, win.x - 0.6, win.y + win.h + 1, win.w + 1.2, 1.6, 0.5);
      for (let k = 0; k < 7; k++) disc(ctx, pick(FLOWERS, rng), win.x + 0.5 + rng() * (win.w - 1), win.y + win.h + 0.4 + rng() * 1.4, 0.7);
    }
  }
  const rows = b.wins.filter((v) => !v.dormer);
  // Linge tendu entre deux fenêtres d'un même rang.
  if (look.laundry) {
    const row = rows.find((v, i) => rows.filter((u) => u.y === v.y).length >= 2 && i > rows.length * 0.3);
    if (row) {
      const same = rows.filter((u) => u.y === row.y);
      const a = same[0]!;
      const bb = same[same.length - 1]!;
      const y0 = a.y + a.h + 2.5;
      const x0 = a.x + a.w;
      const x1 = bb.x;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2, y0 + 3, x1, y0);
      ctx.stroke();
      const n = Math.max(2, Math.floor((x1 - x0) / 4));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const px = x0 + (x1 - x0) * t;
        const py = y0 + 1.5 * 4 * t * (1 - t);
        const c = pick(CLOTH, rng);
        fillRect(ctx, c, px - 1.3, py, 2.6, 3.5);
        fillRect(ctx, shade(c, 0.3), px + 0.3, py, 1, 3.5);
        inkRect(ctx, px - 1.3, py, 2.6, 3.5, 0.4);
      }
    }
  }
  // Balcon à barreaux avec plante en pot.
  if (look.balconyRow !== null) {
    const ys = [...new Set(rows.map((v) => v.y))].sort((p, q) => p - q);
    const ry = ys[look.balconyRow];
    if (ry !== undefined && ry + 12 < ground - 30) {
      const by = ry + 8;
      fillRect(ctx, shade(wall, 0.42), x + 2, by + 3.2, w - 4, 3.5);
      ctx.fillStyle = INK;
      ctx.fillRect(x + 2, by, w - 4, 0.7);
      for (let bx = x + 2.5; bx < x + w - 2; bx += 1.5) ctx.fillRect(bx, by, 0.4, 3.2);
      ctx.fillRect(x + 2, by + 2.8, w - 4, 0.8);
      disc(ctx, '#3F8A3A', x + 4.5, by - 0.8, 1.6);
      fillRect(ctx, '#A04A2E', x + 3.2, by - 0.2, 2.6, 1.4);
    }
  }
  // Gouttière à colliers.
  if (look.pipe) {
    const px = x + w - 1.6;
    fillRect(ctx, '#4A4A5A', px, eave + 2, 1.1, h - 2);
    fillRect(ctx, 'rgba(255,255,255,0.4)', px, eave + 2, 0.4, h - 2);
    ctx.fillStyle = INK;
    for (let gy = eave + 8; gy < ground; gy += 22) ctx.fillRect(px - 0.6, gy, 2.3, 0.8);
  }
  inkRect(ctx, x, eave, w, h, 0.9);
}

function paintStreet(ctx: PaintCtx, plan: CityPaintPlan, x0: number, x1: number): void {
  const u = plan.unit;
  const { ground, curb, farSide, height } = plan;
  const a = x0 - 8;
  const w = x1 - x0 + 16;
  // Trottoir : aplat, joints de dalles (grille globale), bordure rehaut / ombre / trait.
  fillRect(ctx, SIDEWALK, a, ground, w, curb - ground);
  ctx.strokeStyle = rgba(shade(SIDEWALK, 0.25), 1);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  const slab = 17 * u;
  for (let j = Math.floor(a / slab); j * slab < a + w; j++) {
    ctx.moveTo(j * slab, ground);
    ctx.lineTo(j * slab, curb);
  }
  ctx.stroke();
  fillRect(ctx, light(SIDEWALK, 0.5), a, curb - 2.4 * u, w, 1.2 * u);
  fillRect(ctx, shade(SIDEWALK, 0.5), a, curb - 1.2 * u, w, 1.4 * u);
  fillRect(ctx, INK, a, curb - 0.4, w, 0.7);
  // Chaussée : pavés en aplats, trois tons, grille globale (tirage par case : raccord des tranches).
  const tones = [COBBLE, shade(COBBLE, 0.18), light(COBBLE, 0.18)];
  fillRect(ctx, shade(COBBLE, 0.45), a, curb, w, farSide - curb);
  let y = curb + 0.4;
  for (let k = 0; y < farSide; k++) {
    const rh = (2.2 + k * 0.12) * u;
    const cw = rh * 2.1;
    const off = ((k * 7) % 5) * cw * 0.2;
    const j0 = Math.floor((a - off) / cw) - 1;
    const j1 = Math.ceil((a + w - off) / cw) + 1;
    for (let j = j0; j <= j1; j++) {
      const r = cellRng(plan.seed, 'cobble', k, j);
      const cx = off + j * cw + cw / 2;
      const cy = y + rh / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw / 2 - 0.4, rh / 2 - 0.3, 0, 0, TAU);
      ctx.fillStyle = rgba(tones[Math.floor(r() * 3)]!, 1);
      ctx.fill();
    }
    y += rh + 0.4;
  }
  // Ombre nette du trottoir sur la chaussée, bandes d'usure, marquage de voie.
  fillRect(ctx, 'rgba(50,40,90,0.3)', a, curb, w, 2.2);
  for (const ly of [curb + (farSide - curb) * 0.4, curb + (farSide - curb) * 0.9]) fillRect(ctx, 'rgba(50,40,60,0.12)', a, ly - 5 * u, w, 10 * u);
  const period = 26 * u;
  ctx.fillStyle = '#F6F0DC';
  for (let j = Math.floor(a / period); j * period < a + w; j++) ctx.fillRect(j * period, plan.laneMark - 0.8 * u, 14 * u, 1.6 * u);
  // Plaque d'égout et grille d'avaloir : une par bande de 400 px, tirées par case.
  const band = 400;
  for (let i = Math.floor(a / band) - 1; i * band < a + w; i++) {
    const r = cellRng(plan.seed, 'ghibli-drain', i, 0);
    const mx = i * band + 40 + r() * (band - 80);
    const my = curb + (farSide - curb) * (0.25 + r() * 0.5);
    ctx.fillStyle = '#3A3430';
    ctx.beginPath();
    ctx.ellipse(mx, my, 5 * u, 2.4 * u, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#8A8070';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(mx, my, 3.6 * u, 1.6 * u, 0, 0, TAU);
    ctx.stroke();
    const gx = i * band + 60 + r() * (band - 120);
    fillRect(ctx, '#2A2420', gx, curb + 1, 8 * u, 2.4 * u);
    ctx.fillStyle = '#8A8070';
    for (let k = 0; k < 4; k++) ctx.fillRect(gx + (1 + k * 2) * u, curb + 1.3, 0.6 * u, 1.8 * u);
  }
  // Trottoir d'en face.
  fillRect(ctx, shade(SIDEWALK, 0.12), a, farSide, w, height - farSide);
  fillRect(ctx, INK, a, farSide, w, 0.8);
  fillRect(ctx, 'rgba(50,40,90,0.3)', a, farSide + 0.8, w, 1.6);
}

function paintTree(ctx: PaintCtx, plan: CityPaintPlan, t: Tree): void {
  const rng = rngOf(plan, 'ghibli-tree', t.x);
  const { x, cy, r, base } = t;
  const trunkTop = cy + r * 0.3;
  groundShadow(ctx, x - r * 0.6, base, r * 2 + 30, r * 1.2, 0.28);
  // Tronc : aplat, ombre à droite, taches d'écorce claires, trait.
  ctx.beginPath();
  ctx.moveTo(x - 2.4, base);
  ctx.lineTo(x - 1.5, trunkTop);
  ctx.lineTo(x + 1.5, trunkTop);
  ctx.lineTo(x + 2.6, base);
  ctx.closePath();
  ctx.fillStyle = rgba(BARK, 1);
  ctx.fill();
  ctx.save();
  ctx.clip();
  fillRect(ctx, shade(BARK, 0.4), x + 0.4, trunkTop, 3, base - trunkTop);
  ctx.fillStyle = rgba(light(BARK, 0.5), 1);
  for (let i = 0; i < 5; i++) ctx.fillRect(x - 1.6 + rng() * 2, trunkTop + 4 + rng() * Math.max(1, base - trunkTop - 10), 1.4, 2.5);
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - 2.4, base);
  ctx.lineTo(x - 1.5, trunkTop);
  ctx.lineTo(x + 1.5, trunkTop);
  ctx.lineTo(x + 2.6, base);
  ctx.closePath();
  ctx.stroke();
  // Branches encrées puis feuillage en masses : trait épais, trois verts du sombre au clair (haut gauche).
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, trunkTop + 2);
  ctx.lineTo(x - r * 0.5, cy - r * 0.2);
  ctx.moveTo(x, trunkTop);
  ctx.lineTo(x + r * 0.55, cy - r * 0.3);
  ctx.stroke();
  const MASSES: readonly [number, number, number][] = [[0, 0, 0.72], [-0.45, 0.12, 0.45], [0.42, 0.15, 0.46], [-0.18, -0.4, 0.42], [0.25, -0.36, 0.4], [0.05, 0.36, 0.38]];
  const masses: [number, number, number][] = MASSES.map(([mx, my, ms]) => [x + mx * r, cy + my * r, r * ms]);
  const clumps: [number, number, number][] = [];
  for (const [mx, my, mr] of masses) {
    for (let i = 0; i < 7; i++) {
      const a = rng() * TAU;
      const d = Math.sqrt(rng()) * mr * 0.6;
      const cr = mr * 0.42 + rng() * mr * 0.18;
      // Tout reste dans la couronne (rayon r autour du centre).
      const px = mx + Math.cos(a) * d;
      const py = my + Math.sin(a) * d;
      const far = Math.hypot(px - x, py - cy) + cr;
      const k = far > r ? (r - cr) / Math.max(1e-6, far - cr) : 1;
      clumps.push([x + (px - x) * k, cy + (py - cy) * k, cr]);
    }
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (const [cx, cyy, cr] of clumps) {
    ctx.moveTo(cx + cr, cyy);
    ctx.arc(cx, cyy, cr, 0, TAU);
  }
  ctx.stroke();
  for (let tn = 0; tn < 3; tn++) {
    ctx.fillStyle = rgba(LEAVES[tn]!, 1);
    ctx.beginPath();
    for (const [cx, cyy, cr] of clumps) {
      const rr = cr * (1 - tn * 0.3);
      const ox = cx - tn * cr * 0.28;
      const oy = cyy - tn * cr * 0.32;
      ctx.moveTo(ox + rr, oy);
      ctx.arc(ox, oy, rr, 0, TAU);
    }
    ctx.fill();
  }
}

function paintFurniture(ctx: PaintCtx, plan: CityPaintPlan, f: Furniture): void {
  const u = plan.unit;
  const { ground } = plan;
  const { x, w } = f;
  if (f.kind === 'bench') {
    const y = ground + 7 * u;
    groundShadow(ctx, x, y, 8 * u, w, 0.22);
    fillRect(ctx, '#3A3A4A', x + 1 * u, y - 7 * u, 1.2 * u, 5 * u);
    fillRect(ctx, '#3A3A4A', x + 14 * u, y - 7 * u, 1.2 * u, 5 * u);
    fillRect(ctx, BENCH, x, y - 13 * u, w, 5.6 * u);
    fillRect(ctx, shade(BENCH, 0.35), x, y - 11.2 * u, w, 0.8 * u);
    fillRect(ctx, shade(BENCH, 0.35), x, y - 9.4 * u, w, 0.8 * u);
    fillRect(ctx, shade(BENCH, 0.35), x + 11 * u, y - 13 * u, 5 * u, 5.6 * u);
    inkRect(ctx, x, y - 13 * u, w, 5.6 * u, 0.6);
    return;
  }
  if (f.kind === 'mailbox') {
    const y = ground + 4 * u;
    groundShadow(ctx, x, y, 10 * u, w, 0.22);
    fillRect(ctx, MAILBOX, x, y - 12 * u, w, 8 * u);
    fillRect(ctx, shade(MAILBOX, 0.35), x + 4 * u, y - 12 * u, 2 * u, 8 * u);
    fillRect(ctx, '#3A3A4A', x + 1.5 * u, y - 4 * u, 3 * u, 2.5 * u);
    fillRect(ctx, INK, x + 1 * u, y - 10 * u, 3.2 * u, 0.8 * u);
    inkRect(ctx, x, y - 12 * u, w, 8 * u, 0.6);
    return;
  }
  if (f.kind === 'bike') {
    const y = ground + 4 * u;
    const bx = x + 3 * u;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(bx, y - 3 * u, 3 * u, 0, TAU);
    ctx.moveTo(bx + 13 * u, y - 3 * u);
    ctx.arc(bx + 10 * u, y - 3 * u, 3 * u, 0, TAU);
    ctx.moveTo(bx, y - 3 * u);
    ctx.lineTo(bx + 4 * u, y - 8 * u);
    ctx.lineTo(bx + 8 * u, y - 8 * u);
    ctx.lineTo(bx + 10 * u, y - 3 * u);
    ctx.moveTo(bx + 4 * u, y - 8 * u);
    ctx.lineTo(bx + 5 * u, y - 3 * u);
    ctx.lineTo(bx + 8 * u, y - 8 * u);
    ctx.stroke();
    fillRect(ctx, f.tone < 0.5 ? '#D84A3A' : '#3A7EC8', bx + 3 * u, y - 9.2 * u, 2.6 * u, 1.2 * u);
    return;
  }
  if (f.kind === 'poster') {
    const y = ground - 22 * u;
    const c = POSTERS[Math.floor(f.tone * POSTERS.length)]!;
    fillRect(ctx, c, x, y, w, 11 * u);
    inkRect(ctx, x, y, w, 11 * u, 0.5);
    fillRect(ctx, '#FFFFFF', x + 1.5 * u, y + 2 * u, 5 * u, 1.2 * u);
    fillRect(ctx, '#FFFFFF', x + 1.5 * u, y + 4.5 * u, 5 * u, 1.2 * u);
    fillRect(ctx, '#FFFFFF', x + 2 * u, y + 7 * u, 4 * u, 2.4 * u);
    return;
  }
  // Pigeon sur le trottoir.
  const y = ground + 2.5 * u + f.tone * 4 * u;
  ctx.fillStyle = f.tone < 0.5 ? '#8A8AA0' : '#A89AA0';
  ctx.beginPath();
  ctx.ellipse(x + 2 * u, y, 1.9 * u, 1.2 * u, 0, 0, TAU);
  ctx.fill();
  disc(ctx, '#5A5A74', x + 3.7 * u, y - 1 * u, 0.8 * u);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.ellipse(x + 2 * u, y, 1.9 * u, 1.2 * u, 0, 0, TAU);
  ctx.stroke();
}

// Socle commun des jumeaux : première version minimale (aplat + trait), remplacée par la peinture complète.
export function paintPodium(ctx: PaintCtx, plan: CityPaintPlan, p: PaintPodium): void {
  fillRect(ctx, p.stone, p.x, p.top, p.w, plan.ground - p.top);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.9;
  ctx.strokeRect(p.x, p.top, p.w, plan.ground - p.top);
}

export function paintCityTile(ctx: PaintCtx, plan: CityPaintPlan, tile: number): void {
  const it = tileItems(plan, tile);
  const x0 = tile * TILE;
  const x1 = Math.min(plan.width, (tile + 1) * TILE);
  paintHillGround(ctx, plan, x0, x1);
  for (let row = 0; row < HILL_ROWS.length; row++) {
    for (const h of it.houses) if (h.row === row) paintHillHouse(ctx, h);
    for (const l of it.landmarks) if (Math.abs(l.base - plan.height * HILL_ROWS[row]!.y) < 1e-6) paintLandmark(ctx, l, HILL_ROWS[row]!.haze);
  }
  for (const g of it.gulls) paintGull(ctx, g);
  for (const b of it.buildings) if (b.far) paintBuilding(ctx, plan, b);
  for (const b of it.buildings) if (!b.far) paintBuilding(ctx, plan, b);
  for (const p of it.podiums) paintPodium(ctx, plan, p);
  paintStreet(ctx, plan, x0, x1);
  // Entrées d'immeuble (G4a) : en pierre, sur le trottoir, avant les arbres.
  for (const d of it.doors) paintEntrance(ctx, d.cx, d.base, d.s, d.variant, plan.seed ^ Math.round(d.x * 8));
  for (const t of it.trees) paintTree(ctx, plan, t);
  for (const f of it.furniture) paintFurniture(ctx, plan, f);
}

export type { Box };
