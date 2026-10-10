import { hashString, mulberry32 } from '../scene-world';
import { cellRng, dab, washRect, type Box } from './brush';
import type { CityPaintPlan, PaintBuilding, Tree } from './city-plan';
import { hexRgb, jitter, mixRgb, rgba, type Rgb } from './color';
import type { PaintCtx } from './paint-ctx';
import { cobbles, foliage, glass, roofTiles } from './strokes';

// Peintre de la ville (vague Ghibli) : une tranche de TILE px du monde, en coordonnées du monde (l'appelant décale le
// canvas). Chaque immeuble et chaque arbre a son propre générateur : peint depuis deux tranches, il est identique.
export const TILE = 360;
// À incrémenter à chaque changement du dessin : invalide le cache des tranches.
export const PAINT_VERSION = 1;

const SUN = hexRgb('#FFF4DC');
const SHADOW = hexRgb('#7A6A8C');
const HAZE = hexRgb('#9FB8CC');
const INK = '#3A2418';

export const tileCount = (width: number): number => Math.max(1, Math.ceil(width / TILE));

export function tileItems(plan: CityPaintPlan, tile: number): { buildings: PaintBuilding[]; trees: Tree[] } {
  const x0 = tile * TILE - 2;
  const x1 = (tile + 1) * TILE + 2;
  return {
    buildings: plan.buildings.filter((b) => b.x < x1 && b.x + b.w > x0),
    trees: plan.trees.filter((t) => t.x - t.r < x1 && t.x + t.r > x0),
  };
}

export function tileKey(plan: CityPaintPlan, tile: number): string {
  const { buildings, trees } = tileItems(plan, tile);
  return [
    PAINT_VERSION,
    plan.seed,
    plan.height,
    tile,
    Math.min(TILE, plan.width - tile * TILE),
    buildings.map((b) => `${b.id}@${b.x.toFixed(1)}`).join(','),
    trees.map((t) => `${t.x.toFixed(1)}:${t.r.toFixed(1)}`).join(','),
  ].join('|');
}

const rngOf = (plan: CityPaintPlan, salt: string, x: number) => mulberry32(plan.seed ^ hashString(salt) ^ Math.round(x * 8));

function paintFar(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding): void {
  const rng = rngOf(plan, 'ghibli-far', b.x);
  const wall = mixRgb(b.look.wall, HAZE, 0.62);
  const eave = b.top + b.look.roofH;
  ctx.fillStyle = rgba(wall, 1);
  ctx.fillRect(b.x, eave, b.w, plan.ground - eave);
  washRect(ctx, rng, { x: b.x, y: eave, w: b.w, h: plan.ground - eave }, { color: () => wall, density: 0.12, r: [0.6, 1.4], alpha: 0.35, jitter: 6 });
  ctx.beginPath();
  ctx.moveTo(b.x, eave);
  ctx.lineTo(b.x + b.w / 2, b.top);
  ctx.lineTo(b.x + b.w, eave);
  ctx.closePath();
  ctx.fillStyle = rgba(mixRgb(b.look.roof, HAZE, 0.6), 1);
  ctx.fill();
  for (const w of b.wins) {
    ctx.fillStyle = rgba(mixRgb(hexRgb('#4A6080'), HAZE, 0.35), 0.75);
    ctx.fillRect(w.x, w.y, w.w, w.h);
  }
}

function paintRoof(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding, rng: () => number): void {
  const { x, w, top } = b;
  const eave = top + b.look.roofH;
  const o = 1.2;
  ctx.save();
  ctx.beginPath();
  if (b.look.roofKind === 'gable') {
    ctx.moveTo(x - o, eave);
    ctx.lineTo(x + w / 2, top);
    ctx.lineTo(x + w + o, eave);
  } else {
    ctx.moveTo(x - o, eave);
    ctx.lineTo(x + 1.5, top + 1);
    ctx.lineTo(x + w - 1.5, top + 1);
    ctx.lineTo(x + w + o, eave);
  }
  ctx.closePath();
  ctx.fillStyle = rgba(mixRgb(b.look.roof, SHADOW, 0.25), 1);
  ctx.fill();
  ctx.clip();
  roofTiles(ctx, rng, { x: x - o, y: top, w: w + 2 * o, h: b.look.roofH }, b.look.roof, x + w / 2, 3.2 * plan.unit, 2.2 * plan.unit);
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  if (b.look.roofKind === 'gable') {
    ctx.moveTo(x - o, eave);
    ctx.lineTo(x + w / 2, top);
    ctx.lineTo(x + w + o, eave);
  } else {
    ctx.moveTo(x - o, eave);
    ctx.lineTo(x + 1.5, top + 1);
    ctx.lineTo(x + w - 1.5, top + 1);
    ctx.lineTo(x + w + o, eave);
  }
  ctx.stroke();
  if (b.look.chimney !== null) {
    const cx = x + w * b.look.chimney;
    ctx.fillStyle = rgba(jitter(hexRgb('#A85A3E'), 10, rng), 1);
    ctx.fillRect(cx, top + 1.5, 3.5 * plan.unit, b.look.roofH * 0.55);
    ctx.fillStyle = '#5E2E1E';
    ctx.fillRect(cx - 0.5, top + 1, 4.5 * plan.unit, 1.2);
  }
}

export function paintBuilding(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding): void {
  if (b.far) return paintFar(ctx, plan, b);
  const rng = rngOf(plan, 'ghibli-building', b.x);
  const { x, w } = b;
  const eave = b.top + b.look.roofH;
  const h = plan.ground - eave;
  // Enduit : dégradé de lumière (soleil à gauche), puis touches de gouache.
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, rgba(mixRgb(b.look.wall, SUN, 0.25), 1));
  g.addColorStop(1, rgba(mixRgb(b.look.wall, SHADOW, 0.25), 1));
  ctx.fillStyle = g;
  ctx.fillRect(x, eave, w, h);
  washRect(ctx, rng, { x, y: eave, w, h }, {
    color: (px) => mixRgb(b.look.wall, (px - x) / w < 0.5 ? SUN : SHADOW, Math.abs((px - x) / w - 0.5) * 0.5),
    density: 0.35,
    r: [0.5, 1.3],
    alpha: 0.3,
    jitter: 10,
  });
  // Pied de façade et ombre sous le toit.
  const foot = ctx.createLinearGradient(0, plan.ground - 12, 0, plan.ground);
  foot.addColorStop(0, 'rgba(80,60,40,0)');
  foot.addColorStop(1, 'rgba(80,60,40,0.25)');
  ctx.fillStyle = foot;
  ctx.fillRect(x, plan.ground - 12, w, 12);
  const under = ctx.createLinearGradient(0, eave, 0, eave + 5);
  under.addColorStop(0, 'rgba(70,50,90,0.4)');
  under.addColorStop(1, 'rgba(70,50,90,0)');
  ctx.fillStyle = under;
  ctx.fillRect(x, eave, w, 5);
  // Lierre : grimpe depuis le sol sur un côté.
  if (b.look.ivy) {
    const side = b.look.ivy === 'left' ? x : x + w * 0.55;
    washRect(ctx, rng, { x: side, y: eave + h * 0.3, w: w * 0.45, h: h * 0.7 }, {
      color: (_, py) => mixRgb(hexRgb('#2A5A2A'), hexRgb('#86B85A'), (plan.ground - py) / h),
      density: 0.6,
      r: [0.4, 0.9],
      alpha: 0.8,
      jitter: 10,
    });
  }
  paintRoof(ctx, plan, b, rng);
  // Fenêtres : lucarne (petit toit), vitre, volets, appui, jardinière, coulures.
  for (const win of b.wins) {
    if (win.dormer) {
      ctx.beginPath();
      ctx.moveTo(win.x - 0.8, win.y);
      ctx.lineTo(win.x + win.w / 2, Math.max(b.top, win.y - 3));
      ctx.lineTo(win.x + win.w + 0.8, win.y);
      ctx.closePath();
      ctx.fillStyle = rgba(mixRgb(b.look.roof, SHADOW, 0.35), 1);
      ctx.fill();
    }
    glass(ctx, rng, win, win.curtain);
    if (win.dormer) continue;
    if (b.look.shutters && win.x - 2.6 >= x && win.x + win.w + 2.6 <= x + w) {
      ctx.fillStyle = rgba(jitter(b.look.shutters, 8, rng), 1);
      ctx.fillRect(win.x - 2.4, win.y, 2, win.h);
      ctx.fillRect(win.x + win.w + 0.4, win.y, 2, win.h);
    }
    ctx.fillStyle = rgba(hexRgb('#E9DCC4'), 1);
    ctx.fillRect(win.x - 0.6, win.y + win.h, win.w + 1.2, 0.8);
    if (b.look.boxes && rng() < 0.5 && win.y + win.h + 2 <= plan.ground) {
      ctx.fillStyle = rgba(hexRgb('#7A4A2E'), 1);
      ctx.fillRect(win.x - 0.4, win.y + win.h + 0.8, win.w + 0.8, 1.2);
      for (let k = 0; k < 6; k++) {
        const flower = rng() < 0.5 ? hexRgb('#3F7A36') : pick3(rng);
        dab(ctx, rng, win.x + 0.6 + rng() * (win.w - 1.2), win.y + win.h + 0.6, 0.35, flower, 0.95, 1.2);
      }
    }
    if (rng() < 0.4) {
      const sx = win.x + 0.8 + rng() * (win.w - 1.6);
      const len = 4 + rng() * 8;
      for (let k = 0; k < 4 && win.y + win.h + 2 + k * (len / 4) + 1 <= plan.ground; k++) dab(ctx, rng, sx, win.y + win.h + 2 + k * (len / 4), 0.4, hexRgb('#6E5A44'), 0.08, 1, Math.PI / 2);
    }
  }
  // Balcon : garde-corps sous une rangée de fenêtres (premier plan, hors toit).
  if (b.look.balconyRow !== null) {
    const row = b.wins.filter((v) => !v.dormer).map((v) => v.y).filter((v, i, all) => all.indexOf(v) === i).sort((p, q) => p - q)[b.look.balconyRow];
    if (row !== undefined) {
      const by = row + 7 + 2;
      if (by + 3 <= plan.ground - 30) {
        ctx.fillStyle = INK;
        ctx.fillRect(x + 2, by, w - 4, 0.6);
        for (let bx = x + 2.5; bx < x + w - 2; bx += 1.6) ctx.fillRect(bx, by, 0.3, 2.6);
        ctx.fillRect(x + 2, by + 2.6, w - 4, 0.5);
      }
    }
  }
}

function pick3(rng: () => number): Rgb {
  return [hexRgb('#E8456B'), hexRgb('#F6F0E0'), hexRgb('#F2C12E')][Math.floor(rng() * 3)]!;
}

function paintStreet(ctx: PaintCtx, plan: CityPaintPlan, x0: number, x1: number): void {
  const u = plan.unit;
  const a = x0 - 8;
  const w = x1 - x0 + 16;
  // Trottoir côté immeubles : dalles (grille globale) et texture.
  ctx.fillStyle = '#D8C7A2';
  ctx.fillRect(a, plan.ground, w, plan.curb - plan.ground);
  const slab = 17 * u;
  for (let j = Math.floor(a / slab); j * slab < a + w; j++) {
    const rng = cellRng(plan.seed, 'slab', 0, j);
    ctx.fillStyle = rgba(jitter(hexRgb('#D2C09A'), 10, rng), 0.5);
    ctx.fillRect(j * slab + 0.4, plan.ground + 0.4, slab - 0.8, plan.curb - plan.ground - 0.8);
  }
  ctx.fillStyle = '#8C7656';
  ctx.fillRect(a, plan.curb - 1.2, w, 1.6);
  // Chaussée pavée.
  ctx.fillStyle = '#5E4C36';
  ctx.fillRect(a, plan.curb + 0.4, w, plan.farSide - plan.curb - 0.4);
  cobbles(ctx, plan.seed, { x: a, y: plan.curb + 0.4, w, h: plan.farSide - plan.curb - 0.4 }, 2.2 * u, 0.12 * u, hexRgb('#B6A07C'));
  // Marquage de voie (mêmes tirets que la ville classique : 14 u pleins, 12 u vides).
  const period = 26 * u;
  for (let j = Math.floor(a / period); j * period < a + w; j++) {
    ctx.fillStyle = rgba(hexRgb('#EDE6D2'), 0.8);
    ctx.fillRect(j * period, plan.laneMark - 0.8 * u, 14 * u, 1.6 * u);
  }
  // Trottoir d'en face.
  ctx.fillStyle = '#D2C2A0';
  ctx.fillRect(a, plan.farSide, w, plan.height - plan.farSide);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(a, plan.farSide, w, 1.2);
}

function paintTree(ctx: PaintCtx, plan: CityPaintPlan, t: Tree): void {
  const rng = rngOf(plan, 'ghibli-tree', t.x);
  const u = plan.unit;
  // Ombre au sol (lumière venant de la gauche : décalée vers la droite).
  ctx.beginPath();
  ctx.ellipse(t.x + 4 * u, t.base + 0.5, 7 * u, 1.6 * u, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(90,80,150,0.28)';
  ctx.fill();
  // Tronc.
  ctx.fillStyle = '#4A3424';
  ctx.beginPath();
  ctx.moveTo(t.x - 1.6 * u, t.base);
  ctx.lineTo(t.x - 0.9 * u, t.cy);
  ctx.lineTo(t.x + 0.9 * u, t.cy);
  ctx.lineTo(t.x + 1.6 * u, t.base);
  ctx.closePath();
  ctx.fill();
  foliage(ctx, rng, { cx: t.x, cy: t.cy, r: t.r }, u);
}

export function paintCityTile(ctx: PaintCtx, plan: CityPaintPlan, tile: number): void {
  const { buildings, trees } = tileItems(plan, tile);
  const x0 = tile * TILE;
  const x1 = Math.min(plan.width, (tile + 1) * TILE);
  for (const b of buildings) if (b.far) paintBuilding(ctx, plan, b);
  for (const b of buildings) if (!b.far) paintBuilding(ctx, plan, b);
  paintStreet(ctx, plan, x0, x1);
  for (const t of trees) paintTree(ctx, plan, t);
}

export type { Box };
