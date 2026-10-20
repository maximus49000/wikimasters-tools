import { doorsFor, DOOR_MARGIN, DOOR_WIDTH } from '../city/doors';
import { heightOn, PLASTERS, roofOutline, STONES as LAYOUT_STONES, TILES, ZINCS, type FacadeLayout, type Home, type PodiumLayout, type Roof, type WindowKind } from '../city/facade-layout';
import { cityFacades, FAR_WINDOW, FAR_WINDOWS_MAX, GROUND_FLOOR, type FarWindow } from '../city/facades';
import { cityMetrics } from '../city/metrics';
import { shopSlotsFor } from '../city/shops/slots';
import { hashString, mulberry32 } from '../scene-world';
import { cellRng } from './brush';
import { hexRgb, type Rgb } from './color';
import { escapeColumns, farLifeOf, fondPlan, inCol, itemBox, houseBouquet, type Col, type FarLife, type Fond, type FondHouse } from './fond-plan';

// Plan de la ville peinte (vague Ghibli, décor cellulo) : tout ce que le peintre doit savoir, dérivé des MÊMES données que
// la ville classique (façades, entrées, locaux, mesures de la rue), plus le fond (colline de maisons empilées, repères ;
// les mouettes volent dans leur calque animé) et le mobilier peint. Pur et déterministe ; aucun tirage ne change ceux de la ville.

export type RoofKind = 'gable' | 'mansard' | 'zinc';
// `kind` : type de la fenêtre de la mise en page (premier plan) ; absent au fond et sur le socle.
export type Win = { x: number; y: number; w: number; h: number; dormer: boolean; curtain: boolean; kind?: WindowKind };
// Allure d'un immeuble (tirage `ghibli-look`, inchangé). Premier plan : `wall` et `roofH` viennent de la mise en page ; `antenna`
// et `pipe` servent partout ; `ivy` et `laundry` seulement sur une façade de faubourg ; `roofKind`, `roof`, `balconyRow`,
// `chimney`, `shutters` et `boxes` ne servent plus qu'au fond (toit, balcons, cheminées, volets et jardinières du premier plan
// viennent de la mise en page).
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
// `podiumTop` : haut du socle commun sous la tour (jumeaux), sinon null. `layout` : mise en page de la façade (premier plan ;
// null au fond et pour un immeuble de moins de 12 px visibles) ; 2e tour d'un socle : mur et toit de la teinte voisine s'ils
// égalent ceux de la 1re. `homes` : logements de la façade (index `home` des fenêtres de `layout`). `wins` du premier plan :
// fenêtres d'étage de la mise en page (lucarnes exclues : peintes par le toit), rideau d'après le logement. Mur du fond :
// `top` corrigé (farTops), `wins` = grille complète sous l'égout et au-dessus de la ruelle, `lit` = celles que le calque des
// fenêtres allume la nuit (vide au premier plan).
// `life` (mur du fond, chantier « fond vivant ») : volets, linge et toit, tirés à part (fond-plan.ts, farLifeOf).
export type PaintBuilding = { id: number; x: number; w: number; top: number; far: boolean; wins: Win[]; lit: FarWindow[]; look: Look; podiumTop: number | null; layout: FacadeLayout | null; homes: Home[]; life?: FarLife };
// Socle commun des jumeaux (pierre claire), peint après les tours ; ses fenêtres sont celles de `podiumLayout` (`layout` :
// la mise en page de son étage, fenêtres et logements, pour les peindre comme celles des façades ; null hors du monde).
export type PaintPodium = { id: number; x: number; w: number; top: number; stone: Rgb; wins: Win[]; layout: PodiumLayout | null };
export type Tree = { id: number; x: number; base: number; cy: number; r: number };
export type Span = { x0: number; x1: number };
// Maison du fond : `row` 0 (le plus loin) à 2 ; `base` = sol du rang ; `s` échelle ; `haze` brume ; `top` = haut du toit.
export type HillHouse = { row: 0 | 1 | 2; x: number; w: number; h: number; base: number; top: number; s: number; haze: number; wall: Rgb; roof: Rgb; kind: 'gable' | 'hip' | 'mansard'; dormers: boolean; chimney: number | null; trees: { x: number; r: number } | null };
export type Landmark = { kind: 'tower' | 'dome'; x: number; s: number; base: number; top: number; w: number };
// Mouette figée du décor : toujours vide depuis G5 (volées animées du calque gulls-layer.tsx), plus dessinée.
export type Gull = { x: number; y: number; s: number };
// `tops` : boîtes [x0, x1, haut] de ce que le fond vivant peint au-dessus de la crête (arbres, maisons de crête, chapelles,
// châteaux d'eau, moulins, toits du mur du fond garnis) : `hillTopY` (découpe du ciel) les compte. `houses` : maisons peintes
// (celles de l'échappée écartées), avec ce que la vie lira (fond-plan.ts, FondHouse).
export type TopBox = [number, number, number];
export type Hill = { houses: HillHouse[]; landmarks: Landmark[]; gulls: Gull[]; phase: [number, number]; tops: TopBox[] };
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
  podiums: PaintPodium[];
  trees: Tree[];
  blocked: Span[];
  hill: Hill;
  furniture: Furniture[];
  // Entrées d'immeuble (G4a) : celles de doorsFor, peintes en pierre dans les tranches (centre, base, échelle de la maquette).
  doors: PlanDoor[];
  // Fond vivant (PR 2a) : échappées, verdure, rang de crête, chapelles, châteaux d'eau, comblement (fond-plan.ts).
  fond: Fond;
};
export type PlanDoor = { x: number; variant: 0 | 1 | 2; cx: number; base: number; s: number };
// Échelle de l'entrée peinte : cadre de pierre de 15 unités ≈ largeur de l'entrée (12 px) plus ses débords permis.
export const entranceScale = (unit: number): number => unit * 0.92;

// Hauteur du toit peint DANS l'immeuble : premier plan sans mise en page (moins de 12 px visibles), fond.
export const ROOF_H = 14;
export const FAR_ROOF_H = 6;

const STONES = ['#EDE2C8', '#E8DCC0', '#F0E6D0', '#E4D6BA'].map(hexRgb);
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

// Teinte voisine dans la même palette (déterministe) si `color` est celle de `other` ; sinon `color`.
function differ<T>(list: readonly T[], color: T, other: T): T {
  return color === other ? list[(list.indexOf(color) + 1) % list.length]! : color;
}

const roofColor = (r: Roof): string => (r.kind === 'tile' ? r.tile : r.zinc);

// Deuxième tour d'un socle : mur et toit de la mise en page forcés différents de ceux de la 1re (teinte voisine dans la même
// palette de notes.md, sans tirage de plus).
function twinLayout(l: FacadeLayout, first: FacadeLayout): FacadeLayout {
  const wall = differ(LAYOUT_STONES.includes(l.wall) ? LAYOUT_STONES : PLASTERS, l.wall, first.wall);
  const color = differ(l.roof.kind === 'tile' ? TILES : ZINCS, roofColor(l.roof), roofColor(first.roof));
  const roof: Roof = l.roof.kind === 'tile' ? { ...l.roof, tile: color } : { ...l.roof, zinc: color };
  return { ...l, wall, roof };
}

// y du haut de la silhouette des immeubles et des socles en x (le plus haut de ce qui couvre x) ; `ground` si rien.
export function silhouetteTop(plan: Pick<CityPaintPlan, 'buildings' | 'ground' | 'podiums'>, x: number): number {
  let top = plan.ground;
  for (const b of plan.buildings) if (x >= b.x && x <= b.x + b.w) top = Math.min(top, b.top);
  for (const p of plan.podiums) if (x >= p.x && x <= p.x + p.w) top = Math.min(top, p.top);
  return top;
}

// Immeuble du même plan immédiatement à gauche (pour l'ombre portée et le trait des mitoyens) : à moins de LEFT_GAP px (les
// immeubles du premier plan sont espacés de 8 à 22 px).
export const LEFT_GAP = 26;
export function leftOf(plan: Pick<CityPaintPlan, 'buildings'>, b: PaintBuilding): PaintBuilding | null {
  let best: PaintBuilding | null = null;
  for (const o of plan.buildings) {
    if (o.far !== b.far || o === b || o.x >= b.x) continue;
    if (o.x + o.w < b.x - LEFT_GAP) continue;
    if (!best || o.x > best.x) best = o;
  }
  return best;
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
// Une bande de repères (tour-horloge + dôme) par BAND px.
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
  for (const [x0, x1, y] of topsNear(plan.hill, x)) if (x >= x0 - eps && x <= x1 + eps) top = Math.min(top, y);
  return top;
}

// Boîtes du fond vivant rangées par px (la découpe du ciel interroge hillTopY des milliers de fois).
const TOP_BUCKETS = new WeakMap<Hill, Map<number, TopBox[]>>();
const NO_TOPS: TopBox[] = [];
function topsNear(hill: Hill, x: number): readonly TopBox[] {
  if (!hill.tops || hill.tops.length === 0) return NO_TOPS;
  let m = TOP_BUCKETS.get(hill);
  if (!m) {
    m = new Map();
    for (const t of hill.tops) for (let k = Math.floor(t[0]) - 1; k <= Math.ceil(t[1]) + 1; k++) {
      let l = m.get(k);
      if (!l) m.set(k, (l = []));
      l.push(t);
    }
    TOP_BUCKETS.set(hill, m);
  }
  return m.get(Math.floor(x)) ?? NO_TOPS;
}

// Repères du fond (tour-horloge, dômes) seuls : le calque de la ville évite d'y faire éclater le spectacle de feux d'artifice.
export const hillLandmarks = (width: number, height: number, seed: number): Landmark[] => hillPlan(width, height, seed).landmarks;

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
  }
  // G5 : plus de mouettes figées dans le décor ; elles volent en volées dans leur calque animé (city/gulls.ts, gulls-layer.tsx).
  return { houses, landmarks, gulls: [], phase, tops: [] };
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

// ── Mur du fond corrigé (audit du 2026-10-20, maquette fond-ville) ─────────────────────────────────────────────────────
// Tirage de `citySkyline` inchangé : seules la hauteur dessinée et la grille de fenêtres changent.
// D2 / D5 : toujours un étage au-dessus du plus haut voisin du premier plan sur sa largeur (plus de bout de toit coincé dans
// une fente) ; D6 : plafonné entre 0,20 et 0,28 × H (tiré par immeuble) ; D1 : fenêtres sous l'égout ; D4 : rien sous le haut
// du rez-de-chaussée (la ruelle y est peinte).
export const FAR_FLOOR = 11;
export const FAR_BAY = 8;
const FAR_CAP = 0.2;
const FAR_CAP_SPREAD = 0.08;

// Haut du premier plan (immeubles, corniches, socles) en chaque x entier de [0, width] ; `ground` là où il n'y a rien.
export function nearSilhouette(buildings: readonly PaintBuilding[], podiums: readonly PaintPodium[], width: number, ground: number): Float32Array {
  const a = new Float32Array(Math.ceil(width) + 1).fill(ground);
  const put = (x0: number, x1: number, y: (x: number) => number): void => {
    for (let x = Math.max(0, Math.ceil(x0)); x <= Math.min(a.length - 1, Math.floor(x1)); x++) a[x] = Math.min(a[x]!, y(x));
  };
  for (const b of buildings) {
    if (b.far) continue;
    // Même ligne que roofLineY (snow-painter.ts) : contour du toit, relevé par la corniche (±1,5 px, 0,8 sous l'égout).
    const pts = b.layout ? roofOutline(b.layout) : [[b.x - 2, b.top + b.look.roofH], [b.x + 0.42 * b.w, b.top + 0.5], [b.x + b.w + 2, b.top + b.look.roofH]] as [number, number][];
    const cornice = b.top + b.look.roofH - 0.8;
    put(Math.min(pts[0]![0], b.x - 1.5), Math.max(pts.at(-1)![0], b.x + b.w + 1.5), (x) => (x >= b.x - 1.5 && x <= b.x + b.w + 1.5 ? Math.min(heightOn(pts, x), cornice) : heightOn(pts, x)));
  }
  for (const p of podiums) put(p.x - 1.5, p.x + p.w + 1.5, () => p.top - 0.8);
  return a;
}

const minOver = (a: Float32Array, x0: number, x1: number): number => {
  let m = Infinity;
  for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(a.length - 1, Math.ceil(x1)); x++) m = Math.min(m, a[x]!);
  return m;
};

// Échappée (fond vivant) : les immeubles du fond qui la touchent sont abaissés au minimum permis, à peine au-dessus de la
// silhouette du premier plan (la colline se voit partout où la rue est basse), jamais sous le plafond 0,20 H.
function farTops(buildings: PaintBuilding[], width: number, height: number, ground: number, seed: number, near: Float32Array, escapes: readonly Col[]): void {
  const ruelleY = ground - GROUND_FLOOR;
  for (const b of buildings) {
    if (!b.far) continue;
    const rng = mulberry32(seed ^ hashString('fond-mur') ^ Math.round(b.x * 8));
    const nearMin = minOver(near, b.x, b.x + b.w);
    let top = Math.max(Math.min(b.top, nearMin - FAR_FLOOR), height * (FAR_CAP + FAR_CAP_SPREAD * rng()));
    if (inCol(escapes, b.x, b.x + b.w)) top = Math.max(height * FAR_CAP, Math.min(nearMin - 2, b.top));
    b.top = Math.round(top * 2) / 2;
    const eave = b.top + b.look.roofH;
    const floors = Math.max(0, Math.floor((ruelleY - eave - 2) / FAR_FLOOR));
    const cols = Math.max(1, Math.floor((b.w - 6) / FAR_BAY));
    b.wins = [];
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) b.wins.push({ x: b.x + 4 + c * FAR_BAY, y: eave + 3 + f * FAR_FLOOR, w: FAR_WINDOW.w, h: FAR_WINDOW.h, dormer: false, curtain: false });
    b.life = farLifeOf(seed, b, floors, cols);
    // Fenêtres allumables : au plus FAR_WINDOWS_MAX, tirées sans remise parmi celles que ni le premier plan ni le voisin du
    // fond peint par-dessus (chevauchement de 4 px) ne cachent : la lueur SVG se verrait sur leur mur.
    const next = Math.min(...buildings.filter((o) => o.far && o.x > b.x && o.x < b.x + b.w).map((o) => o.x));
    const seen = b.wins.filter((v) => v.x + v.w <= next && minOver(near, v.x, v.x + v.w) > v.y + v.h);
    for (let i = seen.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [seen[i], seen[j]] = [seen[j]!, seen[i]!];
    }
    b.lit = seen.slice(0, FAR_WINDOWS_MAX).map((v) => ({ x: v.x, y: v.y, u: rng(), blue: rng() < 0.3 }));
  }
}

// Plans récents (le décor, la météo, les mouettes, le père Noël et la pluie demandent le même plan) : le fond vivant coûte
// quelques dizaines de ms à calculer. Le plan est en lecture seule pour ses lecteurs.
const PLANS = new Map<string, CityPaintPlan>();
export const clearPlanCacheForTests = (): void => PLANS.clear();
export function cityPaintPlan(width: number, height: number, seed: number): CityPaintPlan {
  const key = `${width}|${height}|${seed}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  const plan = buildPlan(width, height, seed);
  PLANS.set(key, plan);
  if (PLANS.size > 6) PLANS.delete(PLANS.keys().next().value as string);
  return plan;
}

function buildPlan(width: number, height: number, seed: number): CityPaintPlan {
  const m = cityMetrics(height);
  const facades = cityFacades(width, height, seed);
  // Mises en page des tours ; les deux tours d'un socle n'ont ni le même mur ni le même toit.
  const layouts = facades.map((f) => f.layout);
  facades.forEach((f, i) => {
    if (!f.podium || f.x === f.podium.x) return;
    const first = facades.findIndex((g) => g.podium?.id === f.podium!.id && g.x === f.podium!.x);
    const l = layouts[i];
    const lf = first >= 0 ? layouts[first] : null;
    if (l && lf) layouts[i] = twinLayout(l, lf);
  });
  const buildings: PaintBuilding[] = facades.map((f, id) => {
    const top = m.ground - f.h;
    const layout = layouts[id] ?? null;
    const drawn = lookOf(seed, f.x, f.w, f.far);
    const look = layout ? { ...drawn, wall: hexRgb(layout.wall), roofH: layout.roof.h } : drawn;
    const podiumTop = f.podium ? m.ground - f.podium.h : null;
    const homes = layout?.homes ?? [];
    // Premier plan : fenêtres d'étage de la mise en page (les lucarnes sont peintes par le toit, la rangée du socle sur le socle).
    // Mur du fond : grille et fenêtres allumables posées par farTops, une fois le premier plan connu.
    const wins: Win[] = f.far ? [] : (layout?.windows ?? []).filter((v) => v.kind !== 'dormer').map((v) => ({ x: v.x, y: v.y, w: v.w, h: v.h, dormer: false, curtain: v.home >= 0 && !!homes[v.home]?.curtain, kind: v.kind }));
    return { id, x: f.x, w: f.w, top, far: f.far, wins, lit: [], look, podiumTop, layout, homes };
  });
  const podiums: PaintPodium[] = [];
  for (const f of facades) {
    if (!f.podium || f.x !== f.podium.x) continue;
    const p = f.podium;
    const prng = mulberry32(seed ^ hashString('ghibli-podium') ^ Math.round(p.x * 8));
    const stone = STONES[Math.floor(prng() * STONES.length)]!;
    // Fenêtres de la mise en page du socle (podiumLayout), à leur taille et position ; rideau d'après le logement.
    const pl = f.podiumLayout;
    const wins: Win[] = (pl?.windows ?? []).map((v) => ({ x: v.x, y: v.y, w: v.w, h: v.h, dormer: false, curtain: !!pl!.homes[v.home]?.curtain }));
    podiums.push({ id: p.id, x: p.x, w: p.w, top: m.ground - p.h, stone, wins, layout: pl });
  }
  const blocked: Span[] = [
    ...doorsFor(width, height, seed).map((d) => ({ x0: d.x - DOOR_MARGIN, x1: d.x + DOOR_WIDTH + DOOR_MARGIN })),
    ...shopSlotsFor(width, height, seed).map((s) => ({ x0: s.x, x1: s.x + s.w })),
  ];
  const base = { buildings, podiums, ground: m.ground };
  const trees: Tree[] = [];
  const rng = mulberry32(seed ^ hashString('ghibli-trees'));
  const crownBottom = m.ground - GROUND_FLOOR - 1;
  for (let x = 40 + rng() * 60; x < width - 10; x += TREE_STEP * (0.7 + rng() * 0.6)) {
    const want = (14 + rng() * 8) * m.unit;
    const trunk = { x0: x - 2 * m.unit, x1: x + 2 * m.unit };
    if (blocked.some((s) => trunk.x1 > s.x0 && trunk.x0 < s.x1)) continue;
    // Plus grande couronne (≤ want, ≥ 9 unités) posée juste au-dessus du rez-de-chaussée et sous la silhouette partout.
    for (let r = want; r >= 9 * m.unit; r -= m.unit) {
      // Devant un socle (plus haut que le bas habituel de la couronne), la couronne s'arrête sous son toit.
      const over = podiums.filter((p) => x + r > p.x && x - r < p.x + p.w);
      const bottom = over.length > 0 ? Math.min(crownBottom, Math.min(...over.map((p) => p.top)) - 1) : crownBottom;
      const cy = bottom - r;
      let ok = true;
      for (let sx = x - r; sx <= x + r && ok; sx += 1) if (cy - r < silhouetteTop(base, sx) + 2) ok = false;
      if (ok && silhouetteTop(base, x + r) <= cy - r - 2) {
        trees.push({ id: trees.length, x, base: (m.ground + m.curb) / 2, cy, r });
        break;
      }
    }
  }
  const furniture = furnitureFor(width, m.unit, seed, blocked, trees, buildings);
  // Mur du fond corrigé après les arbres et le mobilier (placés sur les hauteurs tirées, comme avant la correction) ; les
  // échappées du fond vivant sont choisies sur le tirage brut.
  const near = nearSilhouette(buildings, podiums, width, m.ground);
  const escapeCols = escapeColumns(buildings.filter((b) => b.far), near, width);
  farTops(buildings, width, height, m.ground, seed, near, escapeCols);
  const hill = hillPlan(width, height, seed);
  const far = buildings.filter((b) => b.far);
  const { fond, houses } = fondPlan({
    seed,
    width,
    height,
    ground: m.ground,
    ruelleY: m.ground - GROUND_FLOOR,
    rows: HILL_ROWS,
    crest: (x) => hillCrestY({ height, hill }, x),
    nearTop: near,
    far,
    cols: escapeCols,
    houses: hill.houses,
    landmarks: hill.landmarks,
  });
  hill.houses = houses;
  hill.tops = fondTops(fond, houses, far, (x) => hillCrestY({ height, hill }, x));
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
    podiums,
    trees,
    blocked,
    hill,
    furniture,
    doors: doorsFor(width, height, seed).map((d) => ({ x: d.x, variant: d.variant, cx: d.x + DOOR_WIDTH / 2, base: m.doorY, s: entranceScale(m.unit) })),
    fond,
  };
}

// Ce que le fond vivant peint au-dessus de la crête (boîtes conservatrices) : arbres et éléments de crête, maisons de crête et
// de l'échappée (cheminée comprise), bouquets des maisons, chapelles, châteaux d'eau, moulins (ailes comprises), et les
// toits garnis du mur du fond (antenne, garde-corps de terrasse, souches).
function fondTops(fond: Fond, houses: readonly FondHouse[], far: readonly PaintBuilding[], crest: (x: number) => number): TopBox[] {
  const out: TopBox[] = [];
  const add = (x0: number, x1: number, y: number): void => {
    if (y < Math.max(crest(x0), crest(x1), crest((x0 + x1) / 2)) + 1) out.push([x0, x1, y]);
  };
  const house = (h: FondHouse): void => {
    add(h.x - 1.5 * h.s - 0.5, h.x + h.w + 1.5 * h.s + 0.5, Math.min(h.top, h.chimneyTop ? h.chimneyTop.y - 0.5 : h.top) - 0.5);
    const m = houseBouquet(h);
    if (m) add(m.box.x0, m.box.x1, m.box.y0);
  };
  for (const h of houses) house(h);
  for (const h of fond.crestHouses) house(h);
  for (const e of fond.escapes) {
    for (const h of e.houses) house(h);
    for (const v of e.verdure) {
      const b = v.b ?? itemBox(v);
      add(b[0], b[2], b[1]);
    }
    if (e.mill) add(e.mill.x - 12 * e.mill.s, e.mill.x + 12 * e.mill.s, e.mill.y - 16.8 * e.mill.s - 9 * e.mill.s - 1);
    add(e.funi.x1 - 11, e.funi.x1 + 11, e.funi.y1 - 8 - 10);
  }
  for (const list of [...fond.rowVerdure, fond.crestVerdure]) for (const v of list) {
    const b = v.b ?? itemBox(v);
    add(b[0], b[2], b[1]);
  }
  for (const c of fond.chapels) add(c.x - 10 * c.s - 0.5, c.x + 13 * c.s + 0.5, c.y - 29 * c.s - 0.5);
  for (const r of fond.reservoirs) add(r.x - 5 * r.s - 0.5, r.x + 5 * r.s + 0.5, r.y - 18.8 * r.s - 0.5);
  for (const b of far) {
    const roof = b.life?.roof;
    if (!roof) continue;
    if (roof.antenna !== null) out.push([roof.antenna - 1.8, roof.antenna + 1.8, b.top - 4.5]);
    if (roof.terrace) out.push([roof.terrace.x - 1.5, roof.terrace.x + roof.terrace.w + 1.5, b.top - 2.8]);
    if (b.look.chimney !== null) out.push([b.x + b.w * b.look.chimney - 0.5, b.x + b.w * b.look.chimney + 4, b.top - 1]);
  }
  return out;
}
