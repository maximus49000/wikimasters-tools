import { hashString, mulberry32 } from '../scene-world';
import { DAB_SPREAD, cellRng, dab } from './brush';
import { TILE, tileItems } from './city-painter';
import type { CityPaintPlan, PaintBuilding } from './city-plan';
import { hexRgb, jitter } from './color';
import type { PaintCtx } from './paint-ctx';

// Neige posée (vague Ghibli, G2) : une tranche de TILE px du monde, en coordonnées du monde, à superposer à la ville peinte.
// Toits (sous la ligne de toit, jamais au-dessus), cheminées, rebords de fenêtres, trottoirs et rue. Chaque immeuble et chaque
// case du sol a son propre générateur : deux tranches voisines peignent la même chose sur leur bord commun.
export const SNOW_VERSION = 1;

const SNOW = hexRgb('#F4F8FC');
const SNOW_SHADE = hexRgb('#D8E2EE');
const OVERHANG = 1.2;
// Touches de toit : rayon ≤ 0,8, allongement 1,8 → portée ≤ 0,8 × 1,8 × DAB_SPREAD ≈ 1,66 ; centre posé sous la ligne de toit.
const ROOF_R = 0.8;
const ROOF_REACH = ROOF_R * 1.8 * DAB_SPREAD;
const CELL = 40;

// Haut du toit peint en x (mêmes tracés que city-painter.ts).
export function roofLineY(b: PaintBuilding, x: number): number {
  const eave = b.top + b.look.roofH;
  if (b.far || b.look.roofKind === 'gable') {
    const o = b.far ? 0 : OVERHANG;
    const half = b.w / 2 + o;
    const t = Math.min(1, Math.abs(x - (b.x + b.w / 2)) / half);
    return b.top + (eave - b.top) * t;
  }
  const flat = b.top + 1;
  if (x >= b.x + 1.5 && x <= b.x + b.w - 1.5) return flat;
  const t = x < b.x + 1.5 ? Math.min(1, (b.x + 1.5 - x) / (1.5 + OVERHANG)) : Math.min(1, (x - (b.x + b.w - 1.5)) / (1.5 + OVERHANG));
  return flat + (eave - flat) * t;
}

export function chimneyBox(plan: CityPaintPlan, b: PaintBuilding): { x0: number; x1: number; y0: number } | null {
  if (b.far || b.look.chimney === null) return null;
  const cx = b.x + b.w * b.look.chimney;
  return { x0: cx - 0.5, x1: cx + 4 * plan.unit, y0: b.top + 1 };
}

function paintRoofSnow(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding): void {
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
      dab(ctx, rng, x, y, size, jitter(extra > 1 ? SNOW_SHADE : SNOW, 4, rng), 0.9, 1.8, Math.atan(slopeAt(x)));
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

export function paintSnowTile(ctx: PaintCtx, plan: CityPaintPlan, tile: number): void {
  const x0 = tile * TILE;
  const x1 = Math.min(plan.width, (tile + 1) * TILE);
  const { buildings } = tileItems(plan, tile);
  for (const b of buildings.filter((x) => x.far)) paintRoofSnow(ctx, plan, b);
  for (const b of buildings.filter((x) => !x.far)) paintRoofSnow(ctx, plan, b);
  paintGroundSnow(ctx, plan, x0, x1);
}
