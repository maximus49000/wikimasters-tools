import { hashString, mulberry32 } from '../scene-world';
import { DAB_SPREAD, cellRng, dab } from './brush';
import { TILE, tileItems } from './city-painter';
import { hillCrestY, type CityPaintPlan, type HillHouse, type PaintBuilding } from './city-plan';
import { hexRgb, jitter, rgba } from './color';
import type { PaintCtx } from './paint-ctx';

// Neige posée (vague Ghibli, G2) : une tranche de TILE px du monde, en coordonnées du monde, à superposer à la ville peinte.
// Toits (sous la ligne de toit, jamais au-dessus), cheminées, rebords de fenêtres, trottoirs et rue, crête de la colline et
// toits des maisons du fond (décor cellulo). Chaque immeuble et chaque case du sol a son propre générateur : deux tranches
// voisines peignent la même chose sur leur bord commun.
export const SNOW_VERSION = 3;

const SNOW = hexRgb('#F4F8FC');
const SNOW_SHADE = hexRgb('#D8E2EE');
const OVERHANG = 2;
// Toit zinc : débord de 1 px, plat à top + 1.
const ZINC_OVERHANG = 1;
// Touches de toit : rayon ≤ 0,8, allongement 1,8 → portée ≤ 0,8 × 1,8 × DAB_SPREAD ≈ 1,66 ; centre posé sous la ligne de toit.
const ROOF_R = 0.8;
const ROOF_REACH = ROOF_R * 1.8 * DAB_SPREAD;
const CELL = 40;

// Haut du toit peint en x (mêmes tracés que city-painter.ts : débord de 2 px au premier plan, aucun au fond).
export function roofLineY(b: PaintBuilding, x: number): number {
  const eave = b.top + b.look.roofH;
  if (b.look.roofKind === 'gable') {
    const o = b.far ? 0 : OVERHANG;
    const half = b.w / 2 + o;
    const t = Math.min(1, Math.abs(x - (b.x + b.w / 2)) / half);
    return b.top + (eave - b.top) * t;
  }
  if (b.look.roofKind === 'zinc') return x >= b.x - ZINC_OVERHANG && x <= b.x + b.w + ZINC_OVERHANG ? b.top + 1 : eave;
  const flat = b.top + 1;
  // Mansarde : plat entre x + 1,5 et x + w − 1,5 au fond, x + 2 et x + w − 2 au premier plan.
  const k = b.far ? 1.5 : 2;
  if (x >= b.x + k && x <= b.x + b.w - k) return flat;
  const o = b.far ? 0 : OVERHANG;
  const t = x < b.x + k ? Math.min(1, (b.x + k - x) / (k + o)) : Math.min(1, (x - (b.x + b.w - k)) / (k + o));
  return flat + (eave - flat) * t;
}

// Emprise horizontale du toit peint (débord compris) : hors de là, l'immeuble ne touche pas le ciel.
export function roofSpan(b: PaintBuilding): { x0: number; x1: number } {
  const o = b.far ? 0 : b.look.roofKind === 'zinc' ? ZINC_OVERHANG : OVERHANG;
  return { x0: b.x - o, x1: b.x + b.w + o };
}

// Cassures de la ligne de toit (murs, faîte, coins) : la ligne est affine entre deux cassures.
export function roofCuts(b: PaintBuilding): number[] {
  const o = b.far ? 0 : OVERHANG;
  if (b.look.roofKind === 'zinc') return [b.x - ZINC_OVERHANG, b.x + b.w + ZINC_OVERHANG];
  if (b.look.roofKind === 'gable') return [b.x - o, b.x + b.w / 2, b.x + b.w + o];
  const k = b.far ? 1.5 : 2;
  return [b.x - o, b.x + k, b.x + b.w - k, b.x + b.w + o];
}

export function chimneyBox(plan: CityPaintPlan, b: PaintBuilding): { x0: number; x1: number; y0: number } | null {
  if (b.far || b.look.chimney === null) return null;
  const cx = b.x + b.w * b.look.chimney;
  return { x0: cx - 0.5, x1: cx + 4 * plan.unit, y0: b.top + 1 };
}

// Contexte muet : une touche cachée consomme ses tirages sans rien peindre (le dessin reste le même d'une tranche à l'autre).
const NO_INK: PaintCtx = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over',
  save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, ellipse() {}, arc() {}, rect() {},
  fill() {}, stroke() {}, clip() {}, fillRect() {}, strokeRect() {}, createLinearGradient: () => ({ addColorStop() {} }),
};

// Touche de portée ROOF_REACH centrée en (x, y) qui atteindrait la façade d'un immeuble du premier plan (sous sa ligne de toit,
// bandes de 1,5 px de part et d'autre comprises). La ligne de toit est affine par morceaux : son minimum sur [x − R, x + R]
// est pris aux bornes ou aux cassures (faîte du pignon, coins de la mansarde).
function hiddenByNear(near: readonly PaintBuilding[], x: number, y: number): boolean {
  const R = ROOF_REACH;
  for (const b of near) {
    if (x + R < b.x - OVERHANG || x - R > b.x + b.w + OVERHANG) continue;
    let low = Math.min(roofLineY(b, x - R), roofLineY(b, x + R));
    for (const k of roofCuts(b)) if (k > x - R && k < x + R) low = Math.min(low, roofLineY(b, k));
    if (y + R >= low) return true;
  }
  return false;
}

function paintRoofSnow(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding, near: readonly PaintBuilding[] = []): void {
  const rng = mulberry32(plan.seed ^ hashString('ghibli-snow-roof') ^ Math.round(b.x * 8));
  const o = b.far ? 0 : OVERHANG;
  // Pente locale la plus forte autour de x (5 échantillons sur la portée d'une touche).
  const slopeAt = (x: number): number => (roofLineY(b, x + 0.25) - roofLineY(b, x - 0.25)) / 0.5;
  const steepest = (x: number): number => Math.max(...[-1, -0.5, 0, 0.5, 1].map((k) => Math.abs(slopeAt(x + k * ROOF_REACH))));
  // Deux rangs de touches qui suivent la pente, posés sous la ligne de toit. Une touche de portée R centrée à
  // R × √(1 + s²) sous la ligne ne la dépasse jamais sur une pente s ; rien sur les flancs trop raides (s > 1,5).
  for (const extra of [0.05, 1.2]) {
    for (let x = b.x - o + ROOF_REACH; x <= b.x + b.w + o - ROOF_REACH; x += 0.9) {
      const s = steepest(x);
      const jitterY = rng() * 0.3;
      const size = ROOF_R * (0.7 + rng() * 0.3);
      if (s > 1.5) continue;
      const y = roofLineY(b, x) + ROOF_REACH * Math.sqrt(1 + s * s) + extra + jitterY;
      // Toit du fond : touche tirée puis peinte « à vide » si un immeuble du premier plan la cache.
      const ink = b.far && hiddenByNear(near, x, y) ? NO_INK : ctx;
      dab(ink, rng, x, y, size, jitter(extra > 1 ? SNOW_SHADE : SNOW, 4, rng), 0.9, 1.8, Math.atan(slopeAt(x)));
    }
  }
  const c = chimneyBox(plan, b);
  if (c) {
    for (let x = c.x0 + ROOF_REACH; x <= c.x1 - ROOF_REACH; x += 0.8) dab(ctx, rng, x, c.y0 + ROOF_REACH + 0.05, ROOF_R, SNOW, 0.95, 1.8, 0);
  }
  if (b.far) return;
  // Rebords de fenêtres (pas les lucarnes, déjà dans le toit).
  for (const w of b.wins) {
    if (w.dormer) continue;
    const y = w.y + w.h + 0.2 + 0.5 * 1.8 * DAB_SPREAD;
    for (let x = w.x + 0.6; x <= w.x + w.w - 0.6; x += 0.7) dab(ctx, rng, x, y, 0.4 + rng() * 0.1, SNOW, 0.85, 1.8, 0);
  }
}

// Sol : couche sur les deux trottoirs, plus mince au milieu de la rue. Cases de CELL px tirées chacune de leur générateur.
function paintGroundSnow(ctx: PaintCtx, plan: CityPaintPlan, x0: number, x1: number): void {
  const bands = [
    { y0: plan.ground, y1: plan.curb, cover: 1 },
    { y0: plan.curb, y1: plan.farSide, cover: 0.55 },
    { y0: plan.farSide, y1: plan.height, cover: 1 },
  ];
  const r1 = 2.6;
  const reach = r1 * 2.2 * DAB_SPREAD;
  for (let i = Math.floor(x0 / CELL) - 1; i <= Math.ceil(x1 / CELL); i++) {
    bands.forEach((band, j) => {
      const top = band.y0 + reach;
      const bottom = band.y1 - reach;
      if (bottom <= top) return;
      const rng = cellRng(plan.seed, 'ghibli-snow-ground', i, j);
      const n = Math.round(CELL * (band.y1 - band.y0) * 0.5);
      const mid = (band.y0 + band.y1) / 2;
      for (let k = 0; k < n; k++) {
        const y = top + rng() * (bottom - top);
        const x = (i + rng()) * CELL;
        // Rue : moins de neige au milieu (traces des roues).
        const thin = j === 1 ? 1 - 0.8 * Math.max(0, 1 - Math.abs(y - mid) / ((band.y1 - band.y0) / 2)) : 1;
        if (rng() > band.cover * thin) continue;
        dab(ctx, rng, x, y, 1.2 + rng() * (r1 - 1.2), jitter(rng() < 0.7 ? SNOW : SNOW_SHADE, 5, rng), 0.5, 2.2, (rng() - 0.5) * 0.2);
      }
    });
  }
}

// Points du toit d'une maison du fond (mêmes tracés que hill-painter.ts).
export function hillRoofPoints(h: HillHouse): [number, number][] {
  const { x, w, s, top } = h;
  const rh = h.h * 0.32;
  const o = 1.5 * s;
  return h.kind === 'gable'
    ? [[x - o, top + rh], [x + w / 2, top], [x + w + o, top + rh]]
    : h.kind === 'hip'
      ? [[x - o, top + rh], [x + w * 0.25, top], [x + w * 0.75, top], [x + w + o, top + rh]]
      : [[x - o, top + rh], [x + o, top + 1], [x + w - o, top + 1], [x + w + o, top + rh]];
}

// Fond : bande blanche à bord net le long de la crête (sous la ligne) et trait de neige sur le haut des toits des maisons.
function paintHillSnow(ctx: PaintCtx, plan: CityPaintPlan, x0: number, x1: number, houses: readonly HillHouse[]): void {
  const a = x0 - 4;
  const b = x1 + 4;
  const crest = (x: number): number => hillCrestY(plan, x);
  ctx.fillStyle = rgba(SNOW, 0.95);
  ctx.beginPath();
  ctx.moveTo(a, crest(a) + 4);
  for (let x = a; x < b; x += 4) ctx.lineTo(x, crest(x));
  ctx.lineTo(b, crest(b));
  ctx.lineTo(b, crest(b) + 4);
  for (let x = b; x > a; x -= 4) ctx.lineTo(x, crest(x) + 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(SNOW, 0.95);
  for (const h of houses) {
    ctx.lineWidth = 1.6 * h.s;
    ctx.beginPath();
    hillRoofPoints(h).forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py + 0.8 * h.s) : ctx.lineTo(px, py + 0.8 * h.s)));
    ctx.stroke();
  }
}

export function paintSnowTile(ctx: PaintCtx, plan: CityPaintPlan, tile: number): void {
  const x0 = tile * TILE;
  const x1 = Math.min(plan.width, (tile + 1) * TILE);
  const { buildings, houses } = tileItems(plan, tile);
  // Tous les immeubles du premier plan du monde (pas seulement ceux de la tranche) : même décision d'une tranche à l'autre.
  const near = plan.buildings.filter((x) => !x.far);
  paintHillSnow(ctx, plan, x0, x1, houses);
  for (const b of buildings.filter((x) => x.far)) paintRoofSnow(ctx, plan, b, near);
  for (const b of buildings.filter((x) => !x.far)) paintRoofSnow(ctx, plan, b);
  paintGroundSnow(ctx, plan, x0, x1);
}
