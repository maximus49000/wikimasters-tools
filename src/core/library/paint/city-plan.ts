import { doorsFor, DOOR_MARGIN, DOOR_WIDTH } from '../city/doors';
import { cityFacades, FAR_WINDOW, GROUND_FLOOR } from '../city/facades';
import { cityMetrics } from '../city/metrics';
import { shopSlotsFor } from '../city/shops/slots';
import { hashString, mulberry32 } from '../scene-world';
import { hexRgb, type Rgb } from './color';

// Plan de la ville peinte (vague Ghibli) : tout ce que le peintre doit savoir, dérivé des MÊMES données que la ville
// classique (façades, entrées, locaux, mesures de la rue). Pur et déterministe ; aucun tirage ne change ceux de la ville.

export type Win = { x: number; y: number; w: number; h: number; dormer: boolean; curtain: boolean };
export type Look = { wall: Rgb; roof: Rgb; roofKind: 'gable' | 'mansard'; roofH: number; shutters: Rgb | null; boxes: boolean; balconyRow: number | null; ivy: 'left' | 'right' | null; chimney: number | null };
export type PaintBuilding = { id: number; x: number; w: number; top: number; far: boolean; wins: Win[]; look: Look };
export type Tree = { id: number; x: number; base: number; cy: number; r: number };
export type Span = { x0: number; x1: number };
export type CityPaintPlan = { width: number; height: number; seed: number; ground: number; curb: number; farSide: number; laneMark: number; unit: number; buildings: PaintBuilding[]; trees: Tree[]; blocked: Span[] };

// Hauteur du toit peint DANS l'immeuble : une rangée de fenêtres (grille de 14 px) ; ces fenêtres deviennent des lucarnes.
export const ROOF_H = 14;
export const FAR_ROOF_H = 6;
// Lampe de la grille d'origine (facades.ts) : 5 × 7.
const LAMP = { w: 5, h: 7 } as const;

const WALLS = ['#F2DDB6', '#E8A88C', '#C9D8BA', '#F1DCAE', '#E9C9A0', '#D9B8C8', '#F4E8D0', '#C8D4DE'].map(hexRgb);
const TILE_ROOFS = ['#C65A30', '#9C4A32', '#A9503A', '#B8623A'].map(hexRgb);
const SLATE_ROOFS = ['#5E6A7A', '#6E6A78', '#4E5866'].map(hexRgb);
const SHUTTERS = ['#5E8C5A', '#3E6E8E', '#8A5A3A', '#4E7E8E'].map(hexRgb);

const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length)]!;

function lookOf(seed: number, x: number, w: number, far: boolean): Look {
  const rng = mulberry32(seed ^ hashString('ghibli-look') ^ Math.round(x * 8));
  const mansard = rng() < 0.4;
  return {
    wall: pick(WALLS, rng),
    roof: mansard ? pick(SLATE_ROOFS, rng) : pick(TILE_ROOFS, rng),
    roofKind: mansard ? 'mansard' : 'gable',
    roofH: far ? FAR_ROOF_H : ROOF_H,
    shutters: rng() < 0.7 ? pick(SHUTTERS, rng) : null,
    boxes: rng() < 0.6,
    balconyRow: rng() < 0.35 ? 2 + Math.floor(rng() * 2) : null,
    ivy: rng() < 0.18 ? (rng() < 0.5 ? 'left' : 'right') : null,
    chimney: w >= 34 && rng() < 0.6 ? 0.2 + rng() * 0.6 : null,
  };
}

// y du haut de la silhouette des immeubles en x (le plus haut des immeubles qui couvrent x) ; `ground` si aucun.
export function silhouetteTop(plan: Pick<CityPaintPlan, 'buildings' | 'ground'>, x: number): number {
  let top = plan.ground;
  for (const b of plan.buildings) if (x >= b.x && x <= b.x + b.w) top = Math.min(top, b.top);
  return top;
}

const TREE_STEP = 170;

export function cityPaintPlan(width: number, height: number, seed: number): CityPaintPlan {
  const m = cityMetrics(height);
  const facades = cityFacades(width, height, seed);
  const buildings: PaintBuilding[] = facades.map((f, id) => {
    const top = m.ground - f.h;
    const look = lookOf(seed, f.x, f.w, f.far);
    const rng = mulberry32(seed ^ hashString('ghibli-curtain') ^ Math.round(f.x * 8));
    const wins: Win[] = f.far
      ? f.farWindows.map((v) => ({ x: v.x, y: v.y, w: FAR_WINDOW.w, h: FAR_WINDOW.h, dormer: false, curtain: false }))
      : f.lamps.map((l) => ({ x: l.x, y: l.y, w: LAMP.w, h: LAMP.h, dormer: l.y < top + ROOF_H, curtain: rng() < 0.5 }));
    return { id, x: f.x, w: f.w, top, far: f.far, wins, look };
  });
  const blocked: Span[] = [
    ...doorsFor(width, height, seed).map((d) => ({ x0: d.x - DOOR_MARGIN, x1: d.x + DOOR_WIDTH + DOOR_MARGIN })),
    ...shopSlotsFor(width, height, seed).map((s) => ({ x0: s.x, x1: s.x + s.w })),
  ];
  const base = { buildings, ground: m.ground };
  const trees: Tree[] = [];
  const rng = mulberry32(seed ^ hashString('ghibli-trees'));
  const crownBottom = m.ground - GROUND_FLOOR - 1;
  for (let x = 40 + rng() * 60; x < width - 10; x += TREE_STEP * (0.7 + rng() * 0.6)) {
    const want = (14 + rng() * 8) * m.unit;
    const trunk = { x0: x - 2 * m.unit, x1: x + 2 * m.unit };
    if (blocked.some((s) => trunk.x1 > s.x0 && trunk.x0 < s.x1)) continue;
    // Plus grande couronne (≤ want, ≥ 9 unités) posée juste au-dessus du rez-de-chaussée et sous la silhouette partout.
    for (let r = want; r >= 9 * m.unit; r -= m.unit) {
      const cy = crownBottom - r;
      let ok = true;
      for (let sx = x - r; sx <= x + r && ok; sx += 1) if (cy - r < silhouetteTop(base, sx) + 2) ok = false;
      if (ok && silhouetteTop(base, x + r) <= cy - r - 2) {
        trees.push({ id: trees.length, x, base: (m.ground + m.curb) / 2, cy, r });
        break;
      }
    }
  }
  return {
    width,
    height,
    seed,
    ground: m.ground,
    curb: m.curb,
    farSide: m.farSide,
    laneMark: (m.laneY.far + m.laneY.near) / 2 - 8 * m.unit,
    unit: m.unit,
    buildings,
    trees,
    blocked,
  };
}
