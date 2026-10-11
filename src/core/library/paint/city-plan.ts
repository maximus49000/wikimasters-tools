import { doorsFor, DOOR_MARGIN, DOOR_WIDTH } from '../city/doors';
import { cityFacades, FAR_WINDOW, GROUND_FLOOR } from '../city/facades';
import { cityMetrics } from '../city/metrics';
import { shopSlotsFor } from '../city/shops/slots';
import { hashString, mulberry32 } from '../scene-world';
import { cellRng } from './brush';
import { hexRgb, type Rgb } from './color';

// Plan de la ville peinte (vague Ghibli, décor cellulo) : tout ce que le peintre doit savoir, dérivé des MÊMES données que
// la ville classique (façades, entrées, locaux, mesures de la rue), plus le fond (colline de maisons empilées, repères,
// mouettes) et le mobilier peint. Pur et déterministe ; aucun tirage ne change ceux de la ville.

export type RoofKind = 'gable' | 'mansard' | 'zinc';
export type Win = { x: number; y: number; w: number; h: number; dormer: boolean; curtain: boolean };
export type Look = {
  wall: Rgb;
  roof: Rgb;
  roofKind: RoofKind;
  roofH: number;
  shutters: Rgb | null;
  boxes: boolean;
  balconyRow: number | null;
  ivy: 'left' | 'right' | null;
  chimney: number | null;
  antenna: boolean;
  pipe: boolean;
  laundry: boolean;
};
export type PaintBuilding = { id: number; x: number; w: number; top: number; far: boolean; wins: Win[]; look: Look };
export type Tree = { id: number; x: number; base: number; cy: number; r: number };
export type Span = { x0: number; x1: number };
// Maison du fond : `row` 0 (le plus loin) à 2 ; `base` = sol du rang ; `s` échelle ; `haze` brume ; `top` = haut du toit.
export type HillHouse = { row: 0 | 1 | 2; x: number; w: number; h: number; base: number; top: number; s: number; haze: number; wall: Rgb; roof: Rgb; kind: 'gable' | 'hip' | 'mansard'; dormers: boolean; chimney: number | null; trees: { x: number; r: number } | null };
export type Landmark = { kind: 'tower' | 'dome'; x: number; s: number; base: number; top: number; w: number };
export type Gull = { x: number; y: number; s: number };
export type Hill = { houses: HillHouse[]; landmarks: Landmark[]; gulls: Gull[]; phase: [number, number] };
export type FurnitureKind = 'bench' | 'mailbox' | 'bike' | 'poster' | 'pigeon';
export type Furniture = { kind: FurnitureKind; x: number; w: number; tone: number };
export type CityPaintPlan = {
  width: number;
  height: number;
  seed: number;
  ground: number;
  curb: number;
  farSide: number;
  laneMark: number;
  unit: number;
  buildings: PaintBuilding[];
  trees: Tree[];
  blocked: Span[];
  hill: Hill;
  furniture: Furniture[];
  // Entrées d'immeuble (G4a) : celles de doorsFor, peintes en pierre dans les tranches (centre, base, échelle de la maquette).
  doors: PlanDoor[];
};
export type PlanDoor = { x: number; variant: 0 | 1 | 2; cx: number; base: number; s: number };
// Échelle de l'entrée peinte : cadre de pierre de 15 unités ≈ largeur de l'entrée (12 px) plus ses débords permis.
export const entranceScale = (unit: number): number => unit * 0.92;

// Hauteur du toit peint DANS l'immeuble : une rangée de fenêtres (grille de 14 px) ; ces fenêtres deviennent des lucarnes.
export const ROOF_H = 14;
export const FAR_ROOF_H = 6;
// Lampe de la grille d'origine (facades.ts) : 5 × 7.
const LAMP = { w: 5, h: 7 } as const;

const WALLS = ['#F6E2B4', '#F0A98A', '#CFE0B8', '#F4D89C', '#EEC79A', '#E6BCD0', '#FFF1D6', '#C4D6E6', '#F2CC8C', '#E0C8A0', '#F5B7A0', '#D8E6C8'].map(hexRgb);
const TILE_ROOFS = ['#D8603A', '#B4523A', '#C86A40', '#9E4A34'].map(hexRgb);
const SLATE_ROOFS = ['#5A6A84', '#6A6A86', '#4C5A70'].map(hexRgb);
const ZINC_ROOFS = ['#98A4B4', '#8290A2'].map(hexRgb);
const SHUTTERS = ['#5E9C5A', '#3E78A0', '#A06A3A', '#4E8EA0', '#8468B0', '#C85A50'].map(hexRgb);
const HILL_WALLS = ['#F4E0B8', '#F2C8A0', '#EACFA8', '#F6E6CC', '#E8C0A8', '#F0D4B0', '#DCCDB4', '#F4D0C0'].map(hexRgb);
const HILL_ROOFS = ['#D0583A', '#C86A3E', '#B8503A', '#E07048', '#A84A36', '#C25E44'].map(hexRgb);
const HILL_SLATE = hexRgb('#5A6A84');

const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length)]!;

function lookOf(seed: number, x: number, w: number, far: boolean): Look {
  const rng = mulberry32(seed ^ hashString('ghibli-look') ^ Math.round(x * 8));
  const roofKind: RoofKind = far ? (rng() < 0.4 ? 'mansard' : 'gable') : pick(['gable', 'gable', 'gable', 'mansard', 'mansard', 'zinc'] as const, rng);
  // Mur du fond : palette crème de la colline (il en est le quatrième rang).
  return {
    wall: far ? pick(HILL_WALLS, rng) : pick(WALLS, rng),
    roof: roofKind === 'gable' ? (far ? pick(HILL_ROOFS, rng) : pick(TILE_ROOFS, rng)) : roofKind === 'mansard' ? pick(SLATE_ROOFS, rng) : pick(ZINC_ROOFS, rng),
    roofKind,
    roofH: far ? FAR_ROOF_H : ROOF_H,
    shutters: rng() < 0.75 ? pick(SHUTTERS, rng) : null,
    boxes: rng() < 0.6,
    balconyRow: rng() < 0.4 ? 2 + Math.floor(rng() * 2) : null,
    ivy: rng() < 0.22 ? (rng() < 0.5 ? 'left' : 'right') : null,
    chimney: w >= 34 && rng() < 0.75 ? 0.2 + rng() * 0.5 : null,
    antenna: rng() < 0.4,
    pipe: rng() < 0.6,
    laundry: rng() < 0.3,
  };
}

// y du haut de la silhouette des immeubles en x (le plus haut des immeubles qui couvrent x) ; `ground` si aucun.
export function silhouetteTop(plan: Pick<CityPaintPlan, 'buildings' | 'ground'>, x: number): number {
  let top = plan.ground;
  for (const b of plan.buildings) if (x >= b.x && x <= b.x + b.w) top = Math.min(top, b.top);
  return top;
}

// ── Fond : colline de maisons empilées ────────────────────────────────────────────────────────────────────────────────

// Rangs de maisons (fraction de la hauteur du sol du rang, échelle, brume), du plus loin au plus proche. Le mur du fond
// existant (`far` de cityFacades) fait office de quatrième rang.
export const HILL_ROWS = [
  { y: 0.27, s: 0.5, haze: 0.3 },
  { y: 0.35, s: 0.62, haze: 0.22 },
  { y: 0.43, s: 0.76, haze: 0.14 },
] as const;
export const FAR_HAZE = 0.16;
// Crête de la colline : entre 0,163 et 0,237 de la hauteur.
const CREST = { mid: 0.2, a1: 0.025, a2: 0.012, l1: 230, l2: 97 } as const;
// Une bande de repères (tour-horloge + dôme) et de mouettes par BAND px.
const BAND = 1080;
const TOWER = { w: 14, h: 70, spire: 22 } as const;
const DOME = { w: 26, h: 44 } as const;

export function hillCrestY(plan: Pick<CityPaintPlan, 'height' | 'hill'>, x: number): number {
  const [p1, p2] = plan.hill.phase;
  return plan.height * (CREST.mid + CREST.a1 * Math.sin(x / CREST.l1 + p1) + CREST.a2 * Math.sin(x / CREST.l2 + p2));
}

// Haut de tout ce qui est peint dans le fond en x : crête, maisons et repères qui la dépassent.
export function hillTopY(plan: Pick<CityPaintPlan, 'height' | 'hill'>, x: number): number {
  let top = hillCrestY(plan, x);
  const eps = 1e-6;
  for (const h of plan.hill.houses) if (x >= h.x - 1.5 * h.s - eps && x <= h.x + h.w + 1.5 * h.s + eps) top = Math.min(top, h.top);
  for (const l of plan.hill.landmarks) if (x >= l.x - 2 * l.s - eps && x <= l.x + l.w + 2 * l.s + eps) top = Math.min(top, l.top);
  return top;
}

function hillPlan(width: number, height: number, seed: number): Hill {
  const phaseRng = mulberry32(seed ^ hashString('ghibli-crest'));
  const phase: [number, number] = [phaseRng() * Math.PI * 2, phaseRng() * Math.PI * 2];
  const houses: HillHouse[] = [];
  HILL_ROWS.forEach((rowDef, ri) => {
    const row = ri as 0 | 1 | 2;
    const r = mulberry32(seed ^ hashString(`ghibli-hill-${ri}`));
    const base = height * rowDef.y;
    const s = rowDef.s;
    let x = -20 + r() * 30;
    while (x < width + 20) {
      const w = (22 + r() * 34) * s;
      const h = (30 + r() * 34) * s;
      const wall = pick(HILL_WALLS, r);
      const roofColor = pick(HILL_ROOFS, r);
      const kind = r() < 0.6 ? 'gable' : r() < 0.5 ? 'mansard' : 'hip';
      const dormers = r() < 0.6;
      const chimney = r() < 0.7 ? 0.2 + r() * 0.6 : null;
      const gap = r() < 0.35 ? (6 + r() * 14) * s : 0.5;
      const trees = r() < 0.4 ? { x: x + w + gap - 3 * s, r: (6 + r() * 5) * s } : null;
      houses.push({ row, x, w, h, base, top: base - h, s, haze: rowDef.haze, wall, roof: kind === 'mansard' ? HILL_SLATE : roofColor, kind, dormers, chimney, trees });
      x += w + gap;
    }
  });
  const landmarks: Landmark[] = [];
  const gulls: Gull[] = [];
  const base0 = height * HILL_ROWS[0].y;
  const base1 = height * HILL_ROWS[1].y;
  for (let k = 0; k * BAND < width; k++) {
    const r = mulberry32(seed ^ hashString('ghibli-landmarks') ^ Math.imul(k + 1, 2654435761));
    const ts = 0.72 + r() * 0.12;
    const tx = k * BAND + 120 + r() * (BAND - 300);
    // Haut = boule de 3 s au sommet de la flèche.
    landmarks.push({ kind: 'tower', x: tx, s: ts, base: base0, top: base0 - (TOWER.h + TOWER.spire + 3) * ts, w: TOWER.w * ts });
    const ds = 0.8 + r() * 0.2;
    // Dôme à au moins 200 px de la tour, dans la même bande.
    let dx = k * BAND + 40 + r() * (BAND - 120);
    if (Math.abs(dx - tx) < 200) dx = tx + (dx < tx ? -200 : 200);
    landmarks.push({ kind: 'dome', x: dx, s: ds, base: base0, top: base0 - DOME.h * ds, w: DOME.w * ds });
    if (r() < 0.6) {
      const d2x = k * BAND + 60 + r() * (BAND - 160);
      if (Math.abs(d2x - tx) >= 120 && Math.abs(d2x - dx) >= 120) landmarks.push({ kind: 'dome', x: d2x, s: 0.55 + r() * 0.1, base: base1, top: base1 - DOME.h * 0.65, w: DOME.w * 0.65 });
    }
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) gulls.push({ x: k * BAND + 20 + r() * (BAND - 40), y: 0, s: 0.7 + r() * 0.5 });
  }
  const partial = { height, hill: { houses, landmarks, gulls: [], phase } };
  for (const g of gulls) {
    const r = mulberry32(seed ^ hashString('ghibli-gull') ^ Math.round(g.x * 8));
    g.y = hillTopY(partial, g.x) - 8 - r() * 34;
  }
  return { houses, landmarks, gulls, phase };
}

// ── Mobilier peint à hauteur du mur ───────────────────────────────────────────────────────────────────────────────────

const FURNITURE_W: Record<FurnitureKind, number> = { bench: 16, mailbox: 6, bike: 14, poster: 8, pigeon: 4 };
const FURNITURE_BAND = 360;

// Par bande de 360 px : les intervalles libres du pied de mur (hors entrées et locaux avec marge, hors troncs), puis chaque
// meuble voulu est posé dans un intervalle assez large tiré au sort (les entrées et locaux sont stables quand la pièce
// grandit : le mobilier du début aussi).
function furnitureFor(width: number, unit: number, seed: number, blocked: Span[], trees: Tree[], buildings: PaintBuilding[]): Furniture[] {
  const out: Furniture[] = [];
  const near = buildings.filter((b) => !b.far);
  const margin = 2 * unit;
  const onWall = (x0: number, x1: number): boolean => near.some((b) => x0 >= b.x + 2 && x1 <= b.x + b.w - 2);
  const wants: { kind: FurnitureKind; p: number }[] = [
    { kind: 'bench', p: 0.75 },
    { kind: 'mailbox', p: 0.35 },
    { kind: 'bike', p: 0.45 },
    { kind: 'poster', p: 0.6 },
    { kind: 'pigeon', p: 0.9 },
    { kind: 'pigeon', p: 0.6 },
  ];
  for (let band = 0; band * FURNITURE_BAND < width; band++) {
    const rng = cellRng(seed, 'ghibli-furniture', band, 0);
    let gaps: Span[] = [{ x0: band * FURNITURE_BAND + 2, x1: Math.min(width - 2, (band + 1) * FURNITURE_BAND - 2) }];
    const cut = (x0: number, x1: number): void => {
      const next: Span[] = [];
      for (const g of gaps) {
        if (x1 <= g.x0 || x0 >= g.x1) next.push(g);
        else {
          if (x0 > g.x0) next.push({ x0: g.x0, x1: x0 });
          if (x1 < g.x1) next.push({ x0: x1, x1: g.x1 });
        }
      }
      gaps = next;
    };
    for (const s of blocked) cut(s.x0 - margin, s.x1 + margin);
    for (const t of trees) cut(t.x - 4 * unit, t.x + 4 * unit);
    for (const want of wants) {
      const roll = rng();
      const tone = rng();
      const pickGap = rng();
      const place = rng();
      if (roll >= want.p) continue;
      const w = FURNITURE_W[want.kind] * unit;
      const fit = gaps.filter((g) => g.x1 - g.x0 >= w + 2 * margin);
      if (fit.length === 0) continue;
      const g = fit[Math.floor(pickGap * fit.length)]!;
      const x = g.x0 + margin + place * (g.x1 - g.x0 - w - 2 * margin);
      if (want.kind === 'poster' && !onWall(x, x + w)) continue;
      out.push({ kind: want.kind, x, w, tone });
      cut(x - margin, x + w + margin);
    }
  }
  return out;
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
    hill: hillPlan(width, height, seed),
    furniture: furnitureFor(width, m.unit, seed, blocked, trees, buildings),
    doors: doorsFor(width, height, seed).map((d) => ({ x: d.x, variant: d.variant, cx: d.x + DOOR_WIDTH / 2, base: m.doorY, s: entranceScale(m.unit) })),
  };
}
