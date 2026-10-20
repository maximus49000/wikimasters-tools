import { hexRgb, type Rgb } from './color';
import { fondRng, sat } from './fond-time';
import { treeModelOf, type TreeModel } from './hill-trees';
import type { FarWinLife } from './fond-time';

// Plan du fond vivant (chantier « fond vivant », PR 2a) : port de `02-plan-fond.js` de la maquette validée
// (docs/superpowers/maquettes/fond-ville/). Pur : graine, largeur et hauteur seules (aucune date). Il décide :
//  - une « échappée » par bande de 1 080 px, là où le premier plan est le plus bas (mur du fond abaissé, maisons des rangs
//    écartées) : route en lacets, funiculaire (voie et gares), escalier, square, marché, verger, ruisseau, moulin… ;
//  - la verdure des rangs et de la crête, le rang de crête de maisons serrées, chapelles, châteaux d'eau ;
//  - la passe de comblement de l'herbe nue, faite ici sur un masque géométrique (pas sur des pixels) ;
//  - les emplacements que la vie animée (PR 2b) lira : gares, voie, route, réverbères, cheminées, kiosque, moulin, grue.
// Les tirages sont ceux de la maquette (`fondRng` = `rngOf`), clés comprises.

type Pt = [number, number];
type Rows = readonly { readonly y: number; readonly s: number; readonly haze: number }[];
export type FondKind =
  | 'bouquet' | 'chestnut' | 'cerisier' | 'chene' | 'poplar' | 'cypress' | 'platane' | 'orchard'
  | 'hedge' | 'wall' | 'path' | 'stream' | 'fence' | 'market' | 'lavoir' | 'bench' | 'cabane' | 'ruche' | 'pond'
  | 'poulailler' | 'petanque' | 'rocks' | 'vineyard' | 'garden' | 'kiosk' | 'fountain' | 'lawn';
// Élément du fond (champs de la maquette). `b` : boîte englobante [x0, y0, x1, y1] de tout ce que le dessin touche.
export type FondItem = {
  kind: FondKind;
  x?: number;
  y?: number;
  r?: number;
  h?: number;
  w?: number;
  s?: number;
  hz?: number;
  pts?: Pt[];
  slant?: number;
  stalls?: number;
  seed?: number;
  n?: number;
  rx?: number;
  ry?: number;
  gate?: number;
  behind?: boolean;
  small?: boolean;
  species?: string;
  b?: [number, number, number, number];
};
export const TREE_KINDS: ReadonlySet<FondKind> = new Set<FondKind>(['bouquet', 'chestnut', 'cerisier', 'chene', 'poplar', 'cypress', 'platane', 'orchard']);
export const isTree = (v: FondItem): boolean => TREE_KINDS.has(v.kind);

// Maison du fond (forme de HillHouse) avec ce que la vie lira : clé, fenêtres (seuil, teinte), allumables, cheminée, terrasse.
export type FondWin = { x: number; y: number; w: number; h: number; u: number; blue: boolean };
export type FondTerrace = { x: number; color: Rgb; side: boolean };
export type FondHouse = {
  row: 0 | 1 | 2;
  x: number;
  w: number;
  h: number;
  base: number;
  top: number;
  s: number;
  haze: number;
  wall: Rgb;
  roof: Rgb;
  kind: 'gable' | 'hip' | 'mansard';
  dormers: boolean;
  chimney: number | null;
  trees: { x: number; r: number } | null;
  key: string;
  rh: number;
  wins: FondWin[];
  lit: FondWin[];
  chimneyTop: { x: number; y: number } | null;
  terrace: FondTerrace | null;
  filler?: boolean;
};
export type RoadSeg = { ax: number; ay: number; bx: number; by: number; l: number; s0: number };
export type Lamp = { x: number; y: number; u: number; off: number };
export type Escape = {
  band: number;
  x: number;
  x1: number;
  road: Pt[];
  segs: RoadSeg[];
  L: number;
  lamps: { d: number; u: number; off: number }[];
  funi: { x0: number; y0: number; x1: number; y1: number };
  stairs: { x0: number; y0: number; x1: number; y1: number };
  crane: { x: number; base: number; mast: number; boom: number; weeks: number[] };
  mill: { x: number; y: number; s: number; phase: number } | null;
  verdure: FondItem[];
  houses: FondHouse[];
  pathLamps: Lamp[];
  lawn: FondItem | null;
  trafficU: number;
  // Boîte de l'échappée (route, gares, moulin, voitures garées) : [x0, x1].
  span: [number, number];
};
export type Chapel = { x: number; y: number; s: number; hz: number };
export type Fond = {
  escapes: Escape[];
  rowVerdure: [FondItem[], FondItem[], FondItem[]];
  crestVerdure: FondItem[];
  chapels: Chapel[];
  reservoirs: Chapel[];
  crestHouses: FondHouse[];
  crestLamps: Lamp[];
  fillers: number;
  ruelleY: number;
};
// Vie du mur du fond (tirage à part : celui des fenêtres allumables reste celui de la PR 1). `wins` : parallèle à `b.wins`.
export type FarRoof = { terrace: { x: number; w: number; potager: boolean } | null; verriere: { x: number; w: number } | null; antenna: number | null; pots: number };
export type FarLife = { wins: FarWinLife[]; laundryFloor: number | null; laundryCol: number; roof: FarRoof; nFloors: number; nCols: number };

export const BAND = 1080;
export const COL_W = 170;
const HILL_WALLS_M = ['#F4E0B8', '#F2C8A0', '#EACFA8', '#F6E6CC', '#E8C0A8', '#F0D4B0', '#DCCDB4', '#F4D0C0'].map(hexRgb);
const HILL_ROOFS_M = ['#D0583A', '#C86A3E', '#B8503A', '#E07048', '#A84A36', '#C25E44'].map(hexRgb);
export const CLOTH = ['#E8456B', '#FFFFFF', '#F6C62E', '#4E8ED8', '#6BB36B', '#F28CB4'].map(hexRgb);
const pick = <T>(l: readonly T[], r: () => number): T => l[Math.floor(r() * l.length)]!;
const TAU = Math.PI * 2;
// Math.hypot est lent : le plan en fait des centaines de milliers (distances à la route, à la voie).
const hyp = (dx: number, dy: number): number => Math.sqrt(dx * dx + dy * dy);

const minOver = (arr: Float32Array, x0: number, x1: number): number => {
  let m = Infinity;
  for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(arr.length - 1, Math.ceil(x1)); x++) m = Math.min(m, arr[x]!);
  return m;
};
const meanOver = (arr: Float32Array, x0: number, x1: number): number => {
  let s = 0;
  let n = 0;
  for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(arr.length - 1, Math.ceil(x1)); x++) {
    s += arr[x]!;
    n++;
  }
  return s / n;
};

// ── Échappées : par bande, la suite d'immeubles entiers du fond (COL_W à COL_W + 120 px) où le premier plan est le plus bas,
// loin des bords de bande. Calculées sur le tirage brut du mur du fond, avant ses hauteurs corrigées.
export type Col = { x: number; x1: number; band: number };
export function escapeColumns(far: readonly { x: number; w: number }[], nearTop: Float32Array, width: number): Col[] {
  const farRaw = far.slice().sort((a, b) => a.x - b.x);
  const cols: Col[] = [];
  for (let k = 0; k * BAND < width; k++) {
    let best: { x: number; x1: number; s: number } | null = null;
    for (let i = 0; i < farRaw.length; i++) {
      if (farRaw[i]!.x < k * BAND + 40) continue;
      for (let j = i; j < farRaw.length; j++) {
        const x0 = farRaw[i]!.x;
        const x1 = farRaw[j]!.x + farRaw[j]!.w;
        if (x1 > Math.min(width, (k + 1) * BAND) - 40) break;
        if (x1 - x0 < COL_W) continue;
        if (x1 - x0 > COL_W + 120) break;
        const s = meanOver(nearTop, x0, x1);
        if (!best || s > best.s) best = { x: x0, x1, s };
      }
    }
    if (best) cols.push({ x: best.x, x1: best.x1, band: k });
  }
  return cols;
}
export const inCol = (cols: readonly Col[], x0: number, x1: number): Col | null => cols.find((c) => x1 > c.x + 1 && x0 < c.x1 - 1) ?? null;

// Ligne de toit d'un immeuble du fond (pignon, ou mansarde plate à 1,5 px des murs : tracés de paintFarWall).
export function farRoofY(b: { x: number; w: number; top: number; look: { roofKind: string; roofH: number } }, x: number): number {
  const roofH = b.look.roofH;
  const eave = b.top + roofH;
  if (x < b.x || x > b.x + b.w) return Infinity;
  if (b.look.roofKind === 'gable') return eave - roofH * (1 - Math.abs(x - (b.x + b.w / 2)) / (b.w / 2));
  const k = 1.5;
  if (x >= b.x + k && x <= b.x + b.w - k) return b.top + 1;
  const t = x < b.x + k ? (b.x + k - x) / k : (x - (b.x + b.w - k)) / k;
  return b.top + 1 + (roofH - 1) * t;
}

// Vie du mur du fond : volets par fenêtre, étage du linge, toit (terrasse végétalisée ou potager sur 35 % des mansardes,
// verrière d'atelier 25 %, antenne râteau 40 %, 1-3 souches).
export function farLifeOf(seed: number, b: { x: number; w: number; look: { roofKind: string } }, nFloors: number, nCols: number): FarLife {
  const rng = fondRng(seed, `fond-mur-vie-${Math.round(b.x * 8)}`);
  const wins: FarWinLife[] = [];
  for (let f = 0; f < nFloors; f++) for (let c = 0; c < nCols; c++) {
    const u = rng();
    const blue = rng() < 0.3;
    const vac = rng() < 0.08;
    const closeAt = 21.3 + rng() * 2.4;
    const openAt = 7 + rng() * 2.2;
    const sun = rng() < 0.35;
    wins.push({ u, blue, vac, closeAt, openAt, sun });
  }
  const laundryFloor = nFloors > 1 && nCols > 1 ? 1 + Math.floor(rng() * (nFloors - 1)) : null;
  const rr = rng();
  const terrace = b.look.roofKind === 'mansard' && rr < 0.35 && b.w >= 30 ? { x: b.x + 4 + rng() * (b.w - 22), w: 12 + rng() * 6, potager: rng() < 0.5 } : null;
  const verriere = rr >= 0.35 && rr < 0.6 && b.w >= 26 ? { x: b.x + 3 + rng() * (b.w - 16), w: 7 + rng() * 4 } : null;
  const antenna = rng() < 0.4 ? b.x + 3 + rng() * (b.w - 6) : null;
  const roof: FarRoof = { terrace, verriere, antenna, pots: 1 + Math.floor(rng() * 3) };
  const laundryCol = nCols > 1 ? Math.floor(rng() * (nCols - 1)) : 0;
  return { wins, laundryFloor, laundryCol, roof, nFloors, nCols };
}

// Maison de remplissage (crête, bords de route) : même tirage de forme que celles du plan, à l'échelle `s`.
function makeHouse(rng: () => number, x: number, base: number, s: number, hz: number, row: 0 | 1 | 2, key: string, wmin = 12, wmax = 24): FondHouse {
  const w = (wmin + rng() * (wmax - wmin)) * s;
  const h = (18 + rng() * 18) * s * (w < 11 * s ? 0.8 : 1);
  const kind = rng() < 0.6 ? 'gable' : rng() < 0.5 ? 'mansard' : 'hip';
  const wall = pick(HILL_WALLS_M, rng);
  const roof = kind === 'mansard' ? hexRgb('#5A6A84') : pick(HILL_ROOFS_M, rng);
  const dormers = rng() < 0.5;
  const chimney = rng() < 0.6 ? 0.2 + rng() * 0.6 : null;
  const top = base - h;
  const rh = h * 0.32;
  const wins: FondWin[] = [];
  for (let wy = top + rh + 4 * s; wy + 5 * s < base; wy += 9 * s) for (let wx = x + 3 * s; wx + 4 * s < x + w - 2 * s; wx += 7 * s) wins.push({ x: wx, y: wy, w: 3.2 * s, h: 4.5 * s, u: rng(), blue: rng() < 0.25 });
  const chimneyTop = chimney !== null ? { x: x + w * chimney + 1.5 * s, y: top - 4 * s + rh * 0.4 } : null;
  return { row, x, w, h, base, top, s, haze: hz, wall, roof, kind, dormers, chimney, trees: null, key, rh, wins, lit: wins.slice(0, 1 + Math.floor(rng() * 2)), chimneyTop, terrace: null, filler: true };
}

// Lacets arrondis : courbe quadratique par les milieux des segments, échantillonnée.
function smoothPolyline(ctrl: Pt[]): Pt[] {
  const out: Pt[] = [ctrl[0]!];
  for (let i = 1; i < ctrl.length - 1; i++) {
    const [ax, ay] = i === 1 ? ctrl[0]! : [(ctrl[i - 1]![0] + ctrl[i]![0]) / 2, (ctrl[i - 1]![1] + ctrl[i]![1]) / 2];
    const [cx, cy] = ctrl[i]!;
    const [bx, by] = i === ctrl.length - 2 ? ctrl[i + 1]! : [(ctrl[i]![0] + ctrl[i + 1]![0]) / 2, (ctrl[i]![1] + ctrl[i + 1]![1]) / 2];
    for (let k = 1; k <= 8; k++) {
      const t = k / 8;
      const u = 1 - t;
      out.push([u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by]);
    }
  }
  return out;
}

export const distToPolyline = (pts: readonly Pt[], x: number, y: number): number => {
  let m = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]!;
    const [bx, by] = pts[i]!;
    const dx = bx - ax;
    const dy = by - ay;
    const t = sat(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1));
    m = Math.min(m, hyp(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return m;
};
const distToSeg = (s: { x0: number; y0: number; x1: number; y1: number }, x: number, y: number): number => distToPolyline([[s.x0, s.y0], [s.x1, s.y1]], x, y);

type EscapeTmp = {
  c: Col;
  road: Pt[];
  rx: number;
  rw: number;
  y0: number;
  y1: number;
  yb: number;
  funi: Escape['funi'];
  stairs: Escape['stairs'];
  hillTop: Float32Array;
  crest: (x: number) => number;
  houses: FondHouse[];
  pathLamps: Lamp[];
  reserved: { x: number; y: number; w: number; h: number } | null;
};

// Verdure de l'échappée (port d'`escapeVerdure`) : maisons et ateliers le long de la route, vigne, square (kiosque, fontaine),
// murets, marché et lavoir, verger clos, arbres, bosquets, potager, haies, ruisseau et bassin, sentiers, poulailler,
// pétanque, rochers, jardin clos. Rien sur la route, la voie, les gares ni l'escalier.
function escapeVerdure(rng: () => number, e: EscapeTmp, W: number): FondItem[] {
  const { road, rx, rw, y0, y1, yb, funi } = e;
  const out: FondItem[] = [];
  const dRoad = (x: number, y: number): number => distToPolyline(road, x, y);
  const dFuni = (x: number, y: number): number => {
    const dx = funi.x1 - funi.x0;
    const dy = funi.y1 - funi.y0;
    const t = sat(((x - funi.x0) * dx + (y - funi.y0) * dy) / (dx * dx + dy * dy));
    return Math.min(hyp(x - (funi.x0 + dx * t), y - (funi.y0 + dy * t)), hyp(x - funi.x1, y - (funi.y1 - 12)) - 8, hyp(x - funi.x0, y - (funi.y0 + 6)) - 8);
  };
  const ht = (x: number): number => e.hillTop[Math.max(0, Math.min(W, Math.round(x)))]!;
  const free = (x: number, y: number, r: number): boolean => x > e.c.x + 3 && x < e.c.x1 - 3 && y > y0 - 2 && y < yb - 1 && dRoad(x, y) >= r + 2.5 && dFuni(x, y) >= r + 7 && y + 1 < ht(x) && !inRsv(x - r, y - r * 2.6, x + r, y + r, 1);
  const taken: { x: number; y: number; r: number }[] = [];
  const rsv = e.reserved;
  const inRsv = (x0: number, y0r: number, x1: number, y1r: number, m: number): boolean => !!rsv && x1 > rsv.x - m && x0 < rsv.x + rsv.w + m && y1r > rsv.y - m && y0r < rsv.y + rsv.h + m;
  e.houses = [];
  {
    const dStairs = (x: number, y: number): number => distToSeg(e.stairs, x, y);
    const hs = 0.6;
    const hz = 0.2;
    for (let x = e.c.x - 34; x < e.c.x1 + 14; x += 3 + rng() * 4) {
      for (let k = 0; k < 20; k++) {
        const cy0 = e.crest(x) + 9;
        const base = cy0 + rng() * (yb - cy0 - 2);
        const w = (9 + rng() * 9) * hs;
        const dr = Math.min(dRoad(x, base), dRoad(x + w, base));
        const dr2 = Math.min(dRoad(x, base - 8 * hs), dRoad(x + w, base - 8 * hs));
        if (dr < 3.5 || dr2 < 2.5 || dr > 40) continue;
        if (dFuni(x, base) < 5 || dFuni(x + w, base) < 5 || dStairs(x, base) < 5 || dStairs(x + w, base) < 5 || dStairs(x + w / 2, base - 8 * hs) < 5) continue;
        if (!(base - 3 < ht(x + w / 2))) continue;
        if (e.houses.some((h) => x < h.x + h.w + 1 && x + w > h.x - 1 && Math.abs(h.base - base) < 8 * hs)) continue;
        if (inRsv(x, base - 20 * hs, x + w, base + 2, 1)) continue;
        const low = base < y0 + 4;
        const hh = makeHouse(rng, x, base, low ? 0.45 : hs, low ? 0.34 : hz, low ? 0 : base <= (y1 + yb) / 2 ? 1 : 2, `er-${Math.round(x)}-${Math.round(base)}`, 9, 18);
        e.houses.push(hh);
        taken.push({ x: x + w / 2, y: base - hh.h / 2, r: Math.max(w, hh.h) / 2 + 1 });
        break;
      }
    }
  }
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const place = (r: number): { x: number; y: number } | null => {
    for (let k = 0; k < 40; k++) {
      const x = rx - 10 + rng() * (rw + 20);
      const y = y0 + 2 + rng() * (yb - y0 - 6);
      if (free(x, y, r) && !taken.some((t) => hyp(t.x - x, t.y - y) < (t.r + r) * 0.7) && !rects.some((q) => x > q.x - r && x < q.x + q.w + r && y > q.y - r * 0.6 && y < q.y + q.h + r * 0.6)) {
        taken.push({ x, y, r });
        return { x, y };
      }
    }
    return null;
  };
  const patch = (w: number, h: number): { x: number; y: number; w: number; h: number } | null => {
    for (let k = 0; k < 60; k++) {
      const x = rx - 6 + rng() * (rw - w + 12);
      const y = y0 + 3 + rng() * (yb - y0 - h - 6);
      const pts: Pt[] = [];
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) pts.push([x + (w * i) / 4, y + (h * j) / 2]);
      if (pts.every(([px, py]) => free(px, py, 1.5)) && !taken.some((t) => t.x > x - t.r && t.x < x + w + t.r && t.y > y - t.r && t.y < y + h + t.r)) {
        taken.push({ x: x + w / 2, y: y + h / 2, r: Math.max(w, h) / 2 });
        return { x, y, w, h };
      }
    }
    return null;
  };
  const vine = patch(18 + rng() * 8, 10 + rng() * 4) || patch(14, 8);
  if (vine) out.push({ kind: 'vineyard', ...vine, slant: 0.35 + rng() * 0.2 });
  const lawn = patch(22 + rng() * 6, 10 + rng() * 3) || patch(16, 8);
  if (lawn) {
    out.push({ kind: 'lawn', ...lawn });
    out.push({ kind: 'kiosk', x: lawn.x + lawn.w * 0.68, y: lawn.y + lawn.h * 0.55, s: 1 });
    out.push({ kind: 'fountain', x: lawn.x + lawn.w * 0.26, y: lawn.y + lawn.h * 0.6 });
  }
  // Murets de pierre et jardins en terrasses : deux lignes de niveau, là où rien ne gêne.
  for (const yy of [y0 + 9 + rng() * 4, yb - 10 - rng() * 4]) {
    let run: Pt[] = [];
    for (let x = rx - 8; x <= rx + rw + 8; x += 2) {
      const ok = free(x, yy, 1.5) && !taken.some((t) => Math.abs(t.x - x) < t.r + 2 && Math.abs(t.y - yy) < t.r * 0.8 + 2);
      if (ok) run.push([x, yy + Math.sin(x * 0.15) * 0.4]);
      else {
        if (run.length >= 6) out.push({ kind: 'wall', pts: run });
        run = [];
      }
    }
    if (run.length >= 6) out.push({ kind: 'wall', pts: run });
  }
  const market = patch(20 + rng() * 4, 8 + rng() * 2) || patch(16, 7);
  if (market) rects.push(market);
  const orchard = patch(16 + rng() * 6, 8 + rng() * 3) || patch(13, 7);
  if (orchard) rects.push(orchard);
  if (vine) rects.push(vine);
  if (lawn) rects.push(lawn);
  for (let i = 0, n = 3 + Math.floor(rng() * 3); i < n; i++) {
    const h = 11 + rng() * 9;
    const p = place(h * 0.3);
    if (p) out.push({ kind: pick(['chestnut', 'poplar', 'poplar', 'cypress', 'cerisier', 'chene'] as const, rng), ...p, h, s: 0.7 });
  }
  for (let i = 0, n = 16 + Math.floor(rng() * 5); i < n; i++) {
    const r = 2 + rng() * 3.2;
    const p = place(r);
    if (!p) continue;
    out.push({ kind: 'bouquet', ...p, r, s: 0.55 + rng() * 0.2 });
    for (let j = 0, m = Math.floor(rng() * 3); j < m; j++) {
      const r2 = r * (0.6 + rng() * 0.5);
      const x = p.x + (rng() - 0.5) * r * 3;
      const y = p.y + (rng() - 0.3) * r * 1.4;
      if (free(x, y, r2)) out.push({ kind: 'bouquet', x, y, r: r2, s: 0.55 + rng() * 0.2 });
    }
  }
  if (rng() < 0.7) {
    const p = place(6);
    if (p) out.push({ kind: 'garden', x: p.x - 6, y: p.y + 3, w: 12, s: 0.7, hz: 0.2 });
  }
  // Haies le long de tronçons de route, côté amont.
  const n = road.length;
  for (const [f0, f1] of [[0.14, 0.3], [0.5, 0.66], [0.78, 0.9]] as const) {
    if (rng() < 0.3) continue;
    const pts: Pt[] = [];
    for (let i = Math.floor(f0 * n); i < Math.floor(f1 * n); i++) {
      const [ax, ay] = road[i]!;
      const [bx, by] = road[Math.min(n - 1, i + 1)]!;
      const l = hyp(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / l;
      const ny = (bx - ax) / l;
      const side = ny < 0 ? 1 : -1;
      const x = ax + nx * 4 * side;
      const y = ay + ny * 4 * side;
      if (x > e.c.x + 2 && x < e.c.x1 - 2 && dFuni(x, y) >= 7) pts.push([x, y]);
    }
    if (pts.length >= 3) out.push({ kind: 'hedge', pts, s: 0.6 });
  }
  // Colline garnie : marché et lavoir, verger clos, ruisseau et bassin, sentiers et lampadaires, poulailler, pétanque, rochers.
  if (market) {
    out.push({ kind: 'market', ...market, stalls: 3 + Math.floor(rng() * 2) });
    out.push({ kind: 'platane', x: market.x + 4, y: market.y + market.h - 1, h: 13 + rng() * 3, s: 0.7 });
    out.push({ kind: 'platane', x: market.x + market.w - 4, y: market.y + market.h - 1.5, h: 12 + rng() * 3, s: 0.7 });
    out.push({ kind: 'lavoir', x: market.x + market.w * 0.5, y: market.y + 1.5 });
    out.push({ kind: 'bench', x: market.x + market.w * 0.3, y: market.y + market.h - 2 });
  }
  if (orchard) {
    out.push({ kind: 'orchard', ...orchard, seed: rng() * 1000 });
    out.push({ kind: 'fence', pts: [[orchard.x, orchard.y], [orchard.x + orchard.w, orchard.y], [orchard.x + orchard.w, orchard.y + orchard.h], [orchard.x, orchard.y + orchard.h], [orchard.x, orchard.y]], gate: 0.2 + rng() * 0.6 });
    out.push({ kind: 'cabane', x: orchard.x + 2.5, y: orchard.y + orchard.h - 0.5 });
    for (let i = 0; i < 3; i++) out.push({ kind: 'ruche', x: orchard.x + orchard.w - 3 - i * 2.2, y: orchard.y + orchard.h - 1 });
  }
  {
    const sx = rx + rw * (0.15 + rng() * 0.7);
    const pts: Pt[] = [];
    let px = sx;
    let py = y0 - 2;
    for (let k = 0; k < 40 && py < yb - 6; k++) {
      pts.push([px, py]);
      px += (rng() - 0.5) * 3 + Math.sin(k * 0.7) * 1.5;
      py += 1.6 + rng() * 1.2;
      if (!free(px, py, 0.5) || !free(px + 3, py, 0.5)) break;
    }
    if (pts.length >= 6) {
      const end = pts[pts.length - 1]!;
      out.push({ kind: 'stream', pts });
      if (free(end[0] + 2, end[1] + 2, 3)) {
        out.push({ kind: 'pond', x: end[0] + 2, y: end[1] + 2, rx: 4 + rng() * 2, ry: 1.6 + rng() * 0.6 });
        taken.push({ x: end[0] + 2, y: end[1] + 2, r: 5 });
      }
    }
  }
  {
    const nearest = (x: number, y: number): { x: number; y: number; dd: number } => {
      let b: { x: number; y: number; dd: number } | null = null;
      for (const [qx, qy] of road) {
        const dd = hyp(qx - x, qy - y);
        if (!b || dd < b.dd) b = { x: qx, y: qy, dd };
      }
      return b!;
    };
    const paths: FondItem[] = [];
    const lamps: Lamp[] = [];
    const link = (x: number, y: number): void => {
      const nn = nearest(x, y);
      if (nn.dd < 6 || nn.dd > 90) return;
      const mid: Pt = [(x + nn.x) / 2 + (rng() - 0.5) * 8, (y + nn.y) / 2 + (rng() - 0.5) * 4];
      paths.push({ kind: 'path', pts: [[x, y], mid, [nn.x, nn.y]] });
      if (rng() < 0.7) lamps.push({ x: mid[0] + 1.5, y: mid[1] - 0.5, u: 0.41 + rng() * 0.05, off: Math.round(rng() * 20 - 10) });
    };
    link(funi.x1 + 14, funi.y1 - 2);
    link(funi.x0 + 16, funi.y0 - 10);
    if (market) link(market.x + market.w / 2, market.y + market.h);
    if (orchard) link(orchard.x + orchard.w * 0.5, orchard.y + orchard.h);
    if (lawn) link(lawn.x + lawn.w, lawn.y + lawn.h * 0.5);
    out.push(...paths);
    e.pathLamps = lamps;
  }
  {
    const p = place(4);
    if (p) out.push({ kind: 'poulailler', ...p });
  }
  {
    const p = place(5);
    if (p) {
      out.push({ kind: 'petanque', x: p.x - 5, y: p.y - 1.5, w: 10, h: 3 });
      out.push({ kind: 'bench', x: p.x - 4, y: p.y - 2.2 });
    }
  }
  for (let i = 0, n2 = 2 + Math.floor(rng() * 3); i < n2; i++) {
    const p = place(2.2);
    if (p) out.push({ kind: 'rocks', ...p, n: 2 + Math.floor(rng() * 2), seed: rng() * 100 });
  }
  {
    const p = place(6);
    if (p) {
      out.push({ kind: 'fence', pts: [[p.x - 6, p.y - 3], [p.x + 6, p.y - 3], [p.x + 6, p.y + 3], [p.x - 6, p.y + 3], [p.x - 6, p.y - 3]], gate: 0.6 });
      out.push({ kind: 'garden', x: p.x - 5, y: p.y + 2.5, w: 10, s: 0.7, hz: 0.2 });
      out.push({ kind: 'bouquet', x: p.x + 2, y: p.y - 1, r: 2.2, s: 0.6 });
    }
  }
  // Tri par y pour le recouvrement (comparaison de la maquette, y absent compris : ordre identique).
  return out.sort((a, b) => ((a.y as number) + (a.h || 0)) - ((b.y as number) + (b.h || 0)));
}

// Clé d'un élément (celle de `paintVerdure` de la maquette) : sert aux tirages du dessin (saison, gui, squelette).
export const itemKey = (v: FondItem): string => `${v.kind}-${Math.round(v.x ?? v.pts?.[0]?.[0] ?? 0)}-${Math.round(v.y ?? 0)}`;

// Modèle d'arbre d'un élément (mêmes paramètres que la maquette) ; null si l'élément n'est pas un arbre à squelette.
export function treeOfItem(v: FondItem): { m: TreeModel; key: string; species: string } | null {
  if (v.kind === 'bouquet') {
    const key = itemKey(v);
    const tr = v.r!;
    return { m: treeModelOf('b' + key, 'bouquet', { x: v.x!, y: v.y! + tr * 0.9 }, tr * 0.55, tr * 1.7, tr > 3 ? 3 : 2, tr * 0.5, 22), key: 'b' + key, species: 'bouquet' };
  }
  if (v.kind === 'platane') return treeOfItem({ ...v, kind: 'chestnut', species: 'platane' });
  if (v.kind === 'chestnut' || v.kind === 'cerisier' || v.kind === 'chene' || v.kind === 'poplar' || v.kind === 'cypress') {
    const key = itemKey(v);
    const h = v.h!;
    const cyp = v.kind === 'cypress';
    const pop = v.kind === 'poplar';
    const sp = v.species || (v.kind === 'chestnut' ? 'marronnier' : cyp ? 'poplar' : v.kind);
    const m = treeModelOf(key, sp, { x: v.x!, y: v.y! }, h * (cyp ? 0.12 : pop ? 0.18 : 0.3), h * (cyp ? 0.88 : pop ? 0.82 : 0.7), 3, h * (cyp ? 0.09 : pop ? 0.1 : 0.16), cyp ? 30 : 26);
    return { m, key, species: cyp ? 'cypress' : v.kind };
  }
  return null;
}
// Bouquet d'une maison (paintBouquet de la maquette) ; aussi celui du square (`key` + 'sq').
export const bouquetModel = (tx: number, ty: number, tr: number, key: string): TreeModel => treeModelOf('b' + key, 'bouquet', { x: tx, y: ty + tr * 0.9 }, tr * 0.55, tr * 1.7, tr > 3 ? 3 : 2, tr * 0.5, 22);
export const houseBouquet = (h: FondHouse): TreeModel | null => (h.trees ? bouquetModel(h.trees.x, h.base - 6 * h.s, h.trees.r, h.key) : null);
export const lawnBouquet = (v: FondItem): TreeModel => bouquetModel(v.x! + v.w! * 0.75, v.y! + v.h! * 0.45, 1.4, itemKey(v) + 'sq');

const boxOfPts = (pts: readonly Pt[], mx: number, up: number, down: number): [number, number, number, number] => {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x - mx);
    x1 = Math.max(x1, x + mx);
    y0 = Math.min(y0, y - up);
    y1 = Math.max(y1, y + down);
  }
  return [x0, y0, x1, y1];
};
// Boîte englobante (conservatrice) de ce que `paintVerdure` touche pour l'élément.
export function itemBox(v: FondItem): [number, number, number, number] {
  const t = treeOfItem(v);
  if (t) return [t.m.box.x0, t.m.box.y0, t.m.box.x1, t.m.box.y1];
  const x = v.x ?? 0;
  const y = v.y ?? 0;
  const s = v.s ?? 0.6;
  switch (v.kind) {
    case 'hedge': return boxOfPts(v.pts!, 1.5 * s + 1.2, 1.5 * s + 1.2, 1.5 * s + 1);
    case 'wall': return boxOfPts(v.pts!, 1.3, 1.6, 2.6);
    case 'path': return boxOfPts(v.pts!, 1, 1, 1.6);
    case 'stream': return boxOfPts(v.pts!, 1.8, 1.8, 1.8);
    case 'fence': return boxOfPts(v.pts!, 0.8, 2.4, 0.4);
    case 'market': { const sc = v.s || 1; return [x - 1, y - 5 * sc, x + v.w! + 1, y + v.h! + 1]; }
    case 'lavoir': return [x - 6.5, y - 6.8, x + 6.5, y + 3.8];
    case 'bench': return [x - 2.2, y - 2.6, x + 2.2, y + 0.3];
    case 'orchard': { const sc = v.s || 0.7; return [x - 1.5, y - 2 * sc - 1, x + v.w! + 3 * sc, y + v.h! + 3 * sc + 1]; }
    case 'cabane': return [x - 3.2, y - 5.6, x + 3.2, y + 0.3];
    case 'ruche': return [x - 1.1, y - 2.1, x + 1.1, y + 0.2];
    case 'pond': return [x - v.rx! - 1.2, y - v.ry! - 2.8, x + v.rx! + 3, y + v.ry! + 1.2];
    case 'poulailler': { const sc = v.small ? 0.7 : 1; return [x - 2.8 * sc, y - 3.6 * sc, x + 6 * sc, y + 0.3]; }
    case 'petanque': return [x - 0.5, y - 0.5, x + v.w! + 0.5, y + v.h! + 0.5];
    case 'rocks': return [x - 5.5, y - 3.2, x + 5.5, y + 1.5];
    case 'vineyard': return [x - 0.5, y - v.slant! * 4 - 2.2, x + v.w! + 0.5, y + v.h! + 0.5];
    case 'garden': return [x - 0.5, y - 6 * s - 0.5, x + v.w! + 0.5, y + 0.5];
    case 'kiosk': return [x - 7, y - 11.8, x + 7, y + 3.3];
    case 'fountain': return [x - 5.6, y - 3.2, x + 5.6, y + 3];
    case 'lawn': {
      const m = lawnBouquet(v);
      return [Math.min(x - 0.5, m.box.x0), Math.min(y - 0.5, m.box.y0), Math.max(x + v.w! + 0.5, m.box.x1), Math.max(y + v.h! + 0.5, m.box.y1)];
    }
    default: return [x - 6, y - 6, x + 6, y + 6];
  }
}

// ── Masque géométrique de la colline (comblement, mesure de l'herbe nue) ──────────────────────────────────────────────
// Une case par pixel (centre x + 0,5, y + 0,5) de [0, W) × [0, H) : 1 = couvert par une forme peinte du fond.
// `v` : valeur écrite par les formes (1 pour couvrir ; 0 pour effacer l'herbe nue d'un masque déjà rempli).
export type Mask = { W: number; H: number; a: Uint8Array; v?: number };
const newMask = (W: number, H: number): Mask => ({ W, H, a: new Uint8Array(W * H) });
function markRect(m: Mask, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = Math.max(0, Math.ceil(y0 - 0.5)); y < Math.min(m.H, Math.ceil(y1 - 0.5)); y++) for (let x = Math.max(0, Math.ceil(x0 - 0.5)); x < Math.min(m.W, Math.ceil(x1 - 0.5)); x++) m.a[y * m.W + x] = m.v ?? 1;
}
function markEllipse(m: Mask, cx: number, cy: number, rx: number, ry: number): void {
  if (rx <= 0 || ry <= 0) return;
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(m.H - 1, Math.ceil(cy + ry)); y++) for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(m.W - 1, Math.ceil(cx + rx)); x++) {
    const dx = (x + 0.5 - cx) / rx;
    const dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) m.a[y * m.W + x] = m.v ?? 1;
  }
}
function markPolyline(m: Mask, pts: readonly Pt[], r: number, dy = 0): void {
  // Segment par segment, dans sa boîte : coût proportionnel à la longueur du tracé.
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1]![0];
    const ay = pts[i - 1]![1] + dy;
    const bx = pts[i]![0];
    const by = pts[i]![1] + dy;
    const dx = bx - ax;
    const dyy = by - ay;
    const l2 = dx * dx + dyy * dyy || 1;
    for (let y = Math.max(0, Math.floor(Math.min(ay, by) - r)); y <= Math.min(m.H - 1, Math.ceil(Math.max(ay, by) + r)); y++) for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - r)); x <= Math.min(m.W - 1, Math.ceil(Math.max(ax, bx) + r)); x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = sat(((px - ax) * dx + (py - ay) * dyy) / l2);
      const ex = px - (ax + dx * t);
      const ey = py - (ay + dyy * t);
      if (ex * ex + ey * ey <= r * r) m.a[y * m.W + x] = m.v ?? 1;
    }
  }
}
function markPoly(m: Mask, pts: readonly Pt[]): void {
  const b = boxOfPts(pts, 0, 0, 0);
  const xs: number[] = [];
  for (let y = Math.max(0, Math.floor(b[1])); y <= Math.min(m.H - 1, Math.ceil(b[3])); y++) {
    const py = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]!;
      const [xj, yj] = pts[j]!;
      if (yi > py !== yj > py) xs.push(((xj - xi) * (py - yi)) / (yj - yi) + xi);
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k]! - 0.5)); x < Math.min(m.W, Math.ceil(xs[k + 1]! - 0.5)); x++) m.a[y * m.W + x] = m.v ?? 1;
  }
}
const quadPts = (p: readonly Pt[]): Pt[] => {
  const out: Pt[] = [];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    const u = 1 - t;
    out.push([u * u * p[0]![0] + 2 * u * t * p[1]![0] + t * t * p[2]![0], u * u * p[0]![1] + 2 * u * t * p[1]![1] + t * t * p[2]![1]]);
  }
  return out;
};
function markTree(m: Mask, t: TreeModel): void {
  // Été plein : masses du houppier (touffes à leur taille) et fût.
  for (const tf of t.tufts) markEllipse(m, tf.x, tf.y, tf.rr * 1.05, tf.rr * 0.97);
  markRect(m, t.foot.x - t.w0 * 1.25, t.rootY, t.foot.x + t.w0 * 1.25, t.foot.y);
}
export function markHouse(m: Mask, h: Pick<FondHouse, 'x' | 'w' | 'top' | 'base' | 'h' | 's' | 'kind'>): void {
  const rh = h.h * 0.32;
  const o = 1.5 * h.s;
  markRect(m, h.x, h.top + rh, h.x + h.w, h.base + 2);
  const pts: Pt[] = h.kind === 'gable' ? [[h.x - o, h.top + rh], [h.x + h.w / 2, h.top], [h.x + h.w + o, h.top + rh]] : h.kind === 'hip' ? [[h.x - o, h.top + rh], [h.x + h.w * 0.25, h.top], [h.x + h.w * 0.75, h.top], [h.x + h.w + o, h.top + rh]] : [[h.x - o, h.top + rh], [h.x + o, h.top + 1], [h.x + h.w - o, h.top + 1], [h.x + h.w + o, h.top + rh]];
  markPoly(m, pts);
}
export function markItem(m: Mask, v: FondItem): void {
  const t = treeOfItem(v);
  if (t) return markTree(m, t.m);
  const x = v.x ?? 0;
  const y = v.y ?? 0;
  const s = v.s ?? 0.6;
  switch (v.kind) {
    case 'hedge': for (const [px, py] of v.pts!) markEllipse(m, px, py, 1.5 * s, 1.5 * s); return;
    case 'wall': markPolyline(m, v.pts!, 1.1, 0.6); return;
    case 'path': markPolyline(m, quadPts(v.pts!), 0.8, 0.3); return;
    case 'stream': markPolyline(m, v.pts!, 1.5); return;
    case 'fence': markPolyline(m, v.pts!, 0.5, -0.8); return;
    case 'lawn': markRect(m, x, y, x + v.w!, y + v.h!); markTree(m, lawnBouquet(v)); return;
    case 'market': case 'orchard': case 'vineyard': case 'petanque': markRect(m, x, y - (v.kind === 'vineyard' ? v.slant! * 4 : 0), x + v.w!, y + v.h!); return;
    case 'garden': markRect(m, x, y - 6 * s, x + v.w!, y); return;
    case 'pond': markEllipse(m, x, y + 0.4, v.rx! + 0.8, v.ry! + 0.5); return;
    case 'kiosk': markRect(m, x - 6, y - 10, x + 6, y + 3); return;
    case 'fountain': markEllipse(m, x, y + 0.6, 5.2, 2.2); return;
    case 'lavoir': markRect(m, x - 5.5, y - 5.5, x + 5.5, y + 3.4); return;
    case 'cabane': markRect(m, x - 2.6, y - 4, x + 2.6, y); return;
    case 'poulailler': { const sc = v.small ? 0.7 : 1; markRect(m, x - 2 * sc, y - 2.6 * sc, x + 1.2 * sc, y); return; }
    case 'rocks': markRect(m, x - 3, y - 1.5, x + 3, y + 0.8); return;
    default: return;
  }
}
// Couvre le masque de tout ce que l'échappée peint en dur : route (bord d'ombre compris), voie, gares, escalier, moulin, maisons.
export function markEscape(m: Mask, e: Escape): void {
  markPolyline(m, e.road, 2.3, 0.45);
  markPolyline(m, [[e.funi.x0, e.funi.y0], [e.funi.x1, e.funi.y1]], 4);
  for (const [sx, sy] of [[e.funi.x0, e.funi.y0 + 8], [e.funi.x1, e.funi.y1 - 8]] as const) markRect(m, sx - 8, sy - 9, sx + 8, sy + 3);
  markPolyline(m, [[e.stairs.x0, e.stairs.y0], [e.stairs.x1, e.stairs.y1]], 2.4);
  if (e.mill) markRect(m, e.mill.x - 4 * e.mill.s, e.mill.y - 16 * e.mill.s, e.mill.x + 4 * e.mill.s, e.mill.y);
  for (const h of e.houses) markHouse(m, h);
  for (const v of e.verdure) markItem(m, v);
}

// ── Plan du fond ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type FondInput = {
  seed: number;
  width: number;
  height: number;
  ground: number;
  ruelleY: number;
  rows: Rows;
  crest: (x: number) => number;
  nearTop: Float32Array;
  far: readonly { x: number; w: number; top: number; look: { roofKind: string; roofH: number } }[];
  cols: readonly Col[];
  houses: readonly Omit<FondHouse, 'key' | 'rh' | 'wins' | 'lit' | 'chimneyTop' | 'terrace'>[];
  landmarks: readonly { x: number; w: number; s: number; base: number; top: number; kind: string }[];
};
export type FondOutput = { fond: Fond; houses: FondHouse[]; hillTop: Float32Array };

export function fondPlan(I: FondInput): FondOutput {
  const { seed, width: W, height: H, rows, crest, nearTop, cols } = I;
  // Haut du mur du fond corrigé, puis du fond visible (mur ou premier plan) en chaque x entier.
  const farTop = new Float32Array(W + 1).fill(I.ground);
  for (const b of I.far) for (let x = Math.max(0, Math.floor(b.x)); x <= Math.min(W, Math.ceil(b.x + b.w)); x++) farTop[x] = Math.min(farTop[x]!, farRoofY(b, x));
  const hillTop = new Float32Array(W + 1);
  for (let x = 0; x <= W; x++) hillTop[x] = Math.min(farTop[x]!, x < nearTop.length ? nearTop[x]! : I.ground);
  const funiOf = (c: Col): Escape['funi'] => ({ x0: c.x + 14, y0: H * rows[2]!.y + 1, x1: c.x + 26, y1: crest(c.x + 26) + 1 });
  // Maisons du plan, moins celles de l'échappée (rangs 1 et 2 : la route ; rang 0 : seulement autour de la voie).
  const kept: FondInput['houses'][number][] = [];
  const keepHouse = (h: FondInput['houses'][number]): boolean => {
    const c = inCol(cols, h.x - 2, h.x + h.w + 2);
    if (!c) return true;
    if (h.row === 0) {
      const f = funiOf(c);
      return h.x + h.w + 2 < f.x0 - 8 || h.x - 2 > f.x1 + 54;
    }
    return false;
  };
  const enrich = (h: FondInput['houses'][number]): FondHouse => {
      const rng = fondRng(seed, `fond-maison-${h.row}-${Math.round(h.x)}`);
      const rh = h.h * 0.32;
      const s = h.s;
      const wins: FondWin[] = [];
      for (let wy = h.top + rh + 4 * s; wy + 5 * s < h.base; wy += 9 * s) for (let wx = h.x + 3 * s; wx + 4 * s < h.x + h.w - 2 * s; wx += 7 * s) wins.push({ x: wx, y: wy, w: 3.2 * s, h: 4.5 * s, u: rng(), blue: rng() < 0.25 });
      // Allumables (PR 2b) : 1 à 2 par maison, jamais cachées par le mur du fond ni le premier plan.
      const lit = wins.filter((wn) => minOver(hillTop, wn.x, wn.x + wn.w) > wn.y + wn.h).sort(() => rng() - 0.5).slice(0, 1 + Math.floor(rng() * 2));
      const chimneyTop = h.chimney !== null ? { x: h.x + h.w * h.chimney + 1.5 * s, y: h.top - 4 * s + rh * 0.4 } : null;
      const terrace = (h.kind === 'hip' || h.kind === 'mansard') && h.w >= 16 * s && h.row > 0 && rng() < 0.4 ? { x: h.x + h.w * (0.3 + rng() * 0.3), color: pick(CLOTH, rng), side: rng() < 0.5 } : null;
      return { ...h, key: `${h.row}-${Math.round(h.x)}`, rh, wins, lit, chimneyTop, terrace };
  };
  // ── Échappées équipées.
  const escapes: Escape[] = cols.map((c, k) => {
    const rng = fondRng(seed, `fond-echappee-${k}`);
    const yb = H * rows[2]!.y;
    const y1 = H * rows[1]!.y;
    const y0 = H * rows[0]!.y;
    let vx0 = Infinity;
    let vx1 = -Infinity;
    for (let x = Math.ceil(c.x); x <= Math.floor(c.x1); x++) if (hillTop[Math.min(W, Math.max(0, x))]! > yb - 4) {
      vx0 = Math.min(vx0, x);
      vx1 = Math.max(vx1, x);
    }
    if (!(vx1 - vx0 >= 60)) {
      vx0 = c.x + 30;
      vx1 = c.x1 - 6;
    }
    const rx = vx0 + 4;
    const rw = vx1 - vx0 - 8;
    const rwr = Math.min(rw, 90);
    const ctrl: Pt[] = [[c.x1 + 40, yb - 3], [rx + rwr, yb - 3], [rx + 6, y1 + 8], [rx + rwr - 4, y1 - 6], [rx + 10, y0 + 2], [c.x - 40, y0 - 1]];
    const road = smoothPolyline(ctrl);
    const segs: RoadSeg[] = [];
    let L = 0;
    for (let i = 1; i < road.length; i++) {
      const [ax, ay] = road[i - 1]!;
      const [bx, by] = road[i]!;
      const l = hyp(bx - ax, by - ay);
      segs.push({ ax, ay, bx, by, l, s0: L });
      L += l;
    }
    const lamps: Escape['lamps'] = [];
    for (let d = 18; d < L - 60; d += 22 + rng() * 8) lamps.push({ d, u: 0.4 + rng() * 0.06, off: Math.round(rng() * 30 - 15) });
    const funi = funiOf(c);
    const stairs = { x0: funi.x0 + 11, y0: funi.y0 - 2, x1: funi.x1 + 11, y1: funi.y1 + 1 };
    const weeks = new Set(Array.from({ length: 10 }, () => Math.floor(rng() * 52)));
    const crane = { x: rx + rw - 10, base: y1 + 1, mast: 26, boom: 22, weeks: [...weeks].sort((a, b) => a - b) };
    const mill = { x: funi.x1 + 34 + rng() * 12, y: crest(funi.x1 + 40) + 1.5, s: 0.55 + rng() * 0.1, phase: rng() * TAU };
    // Maison du père Noël : la plus large des maisons écartées des rangs 1 et 2 avec cheminée et toit assez large
    // (city/santa.ts) qui ne touche ni la route ni la voie ni l'escalier est gardée, et la verdure l'évite. Sans elle, aucune
    // maison des rangs 1-2 ne se voit au-dessus du mur du fond corrigé : le père Noël n'aurait où se poser.
    const probe = { span: [c.x - 46, c.x1 + 46] as [number, number], segs, x: c.x, x1: c.x1, funi, stairs } as Escape;
    const santa = I.houses
      .filter((h) => h.row > 0 && h.chimney !== null && h.w >= 30 && h.x + h.w / 2 > c.x + 20 && h.x + h.w / 2 < c.x1 - 20)
      .filter((h) => !escapeHit(probe, [h.x - 1.5 * h.s - 1, h.top - 1, h.x + h.w + 1.5 * h.s + 1, h.base + 2]))
      .sort((a, b) => b.w - a.w)[0];
    const tmp: EscapeTmp = { c, road, rx, rw, y0, y1, yb, funi, stairs, hillTop, crest, houses: [], pathLamps: [], reserved: santa ? { x: santa.x - 2, y: santa.top - 2, w: santa.w + 4, h: santa.h + 4 } : null };
    if (santa) kept.push(santa);
    const verdure = escapeVerdure(rng, tmp, W);
    return { band: c.band, x: c.x, x1: c.x1, road, segs, L, lamps, funi, stairs, crane, mill, verdure, houses: tmp.houses, pathLamps: tmp.pathLamps, lawn: verdure.find((v) => v.kind === 'lawn') ?? null, trafficU: rng(), span: [c.x - 46, Math.max(c.x1 + 46, mill.x + 8)] };
  });
  const houses: FondHouse[] = I.houses.filter((h) => keepHouse(h) || kept.includes(h)).map(enrich);
  // ── Verdure des rangs (entre et derrière les maisons).
  const rowVerdure: [FondItem[], FondItem[], FondItem[]] = [[], [], []];
  for (let row = 0; row < 3; row++) {
    const rng = fondRng(seed, `verdure-rang-${row}`);
    const rowH = houses.filter((h) => h.row === row).sort((a, b) => a.x - b.x);
    const base = H * rows[row]!.y;
    const s = rows[row]!.s;
    const hz = rows[row]!.haze;
    const list = rowVerdure[row]!;
    for (let i = 1; i < rowH.length; i++) {
      const a = rowH[i - 1]!;
      const b = rowH[i]!;
      const g = b.x - (a.x + a.w);
      if (g < 3 * s) continue;
      const cx = a.x + a.w + g / 2;
      const u = rng();
      if (a.trees && Math.abs(a.trees.x - cx) < g) continue;
      if (g >= 14 * s && u < 0.5) {
        const w = Math.min(g - 2 * s, 20 * s);
        const x0 = cx - w / 2;
        const pickS = rng();
        if (pickS < 0.4) list.push({ kind: 'orchard', x: x0, y: base - 7 * s, w, h: 7 * s, seed: rng() * 1000, s, hz });
        else if (pickS < 0.7) {
          list.push({ kind: 'market', x: x0, y: base - 6 * s, w, h: 6 * s, stalls: 2 + (w > 14 * s ? 1 : 0), s, hz });
          list.push({ kind: 'bouquet', x: x0 + 1.5 * s, y: base - 8 * s, r: 2.4 * s, s, hz });
        } else {
          list.push({ kind: 'pond', x: cx, y: base - 3 * s, rx: Math.min(5 * s, w * 0.35), ry: 1.6 * s, s, hz });
          list.push({ kind: 'bench', x: cx + 5 * s, y: base - 1.5 * s, s, hz });
          list.push({ kind: 'bouquet', x: cx - 5 * s, y: base - 4 * s, r: 2.2 * s, s, hz });
        }
      } else if (g >= 10 * s && u < 0.3) list.push({ kind: 'garden', x: cx - Math.min(g, 16 * s) / 2, y: base, w: Math.min(g, 16 * s), s, hz });
      else if (g >= 6 * s && u < 0.55) list.push({ kind: pick(['poplar', 'poplar', 'cypress', 'chestnut', 'chene'] as const, rng), x: cx, y: base, h: (10 + rng() * 8) * s, s, hz });
      else if (g >= 5 * s && u < 0.72) list.push({ kind: pick(['cabane', 'poulailler', 'rocks', 'bench', 'fence'] as const, rng), x: cx, y: base, s, hz, n: 2, seed: rng() * 100, pts: [[cx - g * 0.4, base - 1], [cx + g * 0.4, base - 1]], gate: 0.5, small: true });
      else list.push({ kind: 'bouquet', x: cx - 2 * s, y: base - 2 * s, r: Math.min(g * 0.55, (4 + rng() * 4) * s), s, hz });
    }
    // Massif derrière la maison : tirage par maison (et non à la suite des creux) pour qu'agrandir la pièce ne le change pas.
    for (const h of rowH) {
      const rb = fondRng(seed, `verdure-derriere-${row}-${Math.round(h.x)}`);
      if (rb() < 0.22) list.push({ kind: 'bouquet', x: h.x + h.w * (0.2 + rb() * 0.5), y: h.top + 1, r: (3 + rb() * 2.5) * s, s, hz: Math.min(0.4, hz + 0.08), behind: true });
    }
  }
  // ── Bande de la crête : un élément tous les 13-33 px, varié.
  const crestVerdure: FondItem[] = [];
  {
    const rng = fondRng(seed, 'verdure-crete');
    const topsRow0 = houses.filter((h) => h.row === 0);
    const blocked0 = (x: number, m = 0): boolean => topsRow0.some((h) => x > h.x - m && x < h.x + h.w + m);
    for (let x = 14 + rng() * 30; x < W; x += 13 + rng() * 20) {
      const u = rng();
      const y = crest(x) + 1 + rng() * 9;
      const s = 0.5;
      const hz = 0.38 - (y - crest(x)) * 0.01;
      if (u < 0.3) crestVerdure.push({ kind: pick(['poplar', 'poplar', 'cypress', 'chestnut', 'cerisier', 'chene'] as const, rng), x, y: y + 0.5, h: 8 + rng() * 7, s, hz });
      else if (u < 0.55) crestVerdure.push({ kind: 'bouquet', x, y, r: 2.8 + rng() * 2.4, s, hz });
      else if (u < 0.65) {
        const pts: Pt[] = [];
        for (let k = 0, n = 6 + Math.floor(rng() * 6); k < n; k++) pts.push([x + k * 2.2, crest(x + k * 2.2) + 2 + (y - crest(x))]);
        crestVerdure.push({ kind: rng() < 0.5 ? 'hedge' : 'wall', pts, s, hz });
      } else if (u < 0.75) crestVerdure.push({ kind: 'orchard', x: x - 5, y: y - 2, w: 10 + rng() * 5, h: 3.5, seed: rng() * 1000, s: 0.45, hz });
      else if (u < 0.82) crestVerdure.push({ kind: 'rocks', x, y: y + 1, n: 2 + Math.floor(rng() * 2), seed: rng() * 100, s, hz });
      else if (u < 0.88) crestVerdure.push({ kind: 'cabane', x, y: y + 2, s, hz });
      else if (u < 0.93) crestVerdure.push({ kind: 'bench', x, y: y + 1, s, hz });
      else if (!blocked0(x, 4)) {
        const h = topsRow0.reduce<FondHouse | null>((b, hh) => (!b || Math.abs(hh.x + hh.w / 2 - x) < Math.abs(b.x + b.w / 2 - x) ? hh : b), null);
        if (h) crestVerdure.push({ kind: 'path', pts: [[x, crest(x) + 1], [(x + h.x + h.w / 2) / 2 + (rng() - 0.5) * 6, (crest(x) + h.top) / 2], [h.x + h.w / 2, h.top + 2]], s, hz });
      }
    }
  }
  // Chapelle secondaire sur la crête (une par bande), château d'eau (une bande sur deux), moulins dégagés.
  const chapels: Chapel[] = [];
  for (let k = 0; k * BAND < W; k++) {
    const rng = fondRng(seed, `chapelle-${k}`);
    for (let t = 0; t < 12; t++) {
      const x = k * BAND + 150 + rng() * (BAND - 300);
      if (x > W - 40) continue;
      if (I.landmarks.some((l) => Math.abs(l.x - x) < 90) || cols.some((c) => x > c.x - 30 && x < c.x1 + 30)) continue;
      chapels.push({ x, y: crest(x) + 1.5, s: 0.5 + rng() * 0.15, hz: 0.36 });
      break;
    }
  }
  const drop = (list: FondItem[], keep: (v: FondItem) => boolean): void => {
    for (let i = list.length - 1; i >= 0; i--) if (!keep(list[i]!)) list.splice(i, 1);
  };
  const xOf = (v: FondItem): number => v.x ?? 0;
  for (const ch of chapels) drop(crestVerdure, (v) => !(Math.abs(xOf(v) - ch.x) < 16));
  const reservoirs: Chapel[] = [];
  for (let k = 0; k * BAND < W; k++) {
    const rng = fondRng(seed, `chateau-eau-${k}`);
    if (rng() < 0.5) continue;
    for (let t = 0; t < 12; t++) {
      const x = k * BAND + 120 + rng() * (BAND - 240);
      if (x > W - 30) continue;
      if (I.landmarks.some((l) => Math.abs(l.x - x) < 70) || chapels.some((c) => Math.abs(c.x - x) < 60) || cols.some((c) => x > c.x - 30 && x < c.x1 + 30)) continue;
      reservoirs.push({ x, y: crest(x) + 1.5, s: 0.5 + rng() * 0.1, hz: 0.36 });
      break;
    }
  }
  for (const r of reservoirs) drop(crestVerdure, (v) => !(Math.abs(xOf(v) - r.x) < 12));
  for (const e of escapes) if (e.mill) drop(crestVerdure, (v) => !(Math.abs(xOf(v) - e.mill!.x) < 14));
  // Réverbères de la crête (chapelet) : emplacements pour la vie (PR 2b).
  const crestLamps: Lamp[] = [];
  {
    const rng = fondRng(seed, 'fond-crete');
    for (let x = 20 + rng() * 30; x < W; x += 48 + rng() * 16) crestLamps.push({ x, y: crest(x) + 1.5, u: 0.4 + rng() * 0.07, off: Math.round(rng() * 30 - 15) });
  }
  // Rang de crête : maisons serrées et étagées entre la crête et les toits du rang 0, sauf aux repères, à la voie et à l'escalier.
  const crestHouses: FondHouse[] = [];
  {
    const rng = fondRng(seed, 'rang-crete');
    const s0 = 0.42;
    const hz0 = 0.4;
    const banned = (x0: number, x1: number): boolean =>
      chapels.some((c) => x1 > c.x - 14 && x0 < c.x + 14) ||
      reservoirs.some((r) => x1 > r.x - 8 && x0 < r.x + 8) ||
      I.landmarks.some((l) => x1 > l.x - 4 && x0 < l.x + l.w + 4) ||
      escapes.some((e) => (e.mill && x1 > e.mill.x - 6 && x0 < e.mill.x + 6) || (x1 > e.funi.x0 - 2 && x0 < e.funi.x1 + 2) || (x1 > e.stairs.x0 - 2 && x0 < e.stairs.x1 + 2));
    for (let x = -6 + rng() * 10; x < W + 6; ) {
      const w0 = 14 + rng() * 12;
      const x1 = x + w0 * s0;
      if (banned(x, x1)) {
        x += 4;
        continue;
      }
      const base = crest(x + (w0 * s0) / 2) + 8 + rng() * 6;
      crestHouses.push(makeHouse(rng, x, base, s0, hz0, 0, `cr-${Math.round(x)}`, w0, w0 + 0.01));
      x = x1 + (rng() < 0.3 ? (3 + rng() * 6) * s0 : 0.4);
    }
  }
  // Le rang 2 n'a pas de calque de verdure dans la scène de la maquette (calques T0 à T2 seulement) : ses creux sont derrière
  // le mur du fond, sauf dans l'échappée, où un élément tomberait sur la route. Tirage gardé, rien de peint.
  rowVerdure[2] = [];
  const fond: Fond = { escapes, rowVerdure, crestVerdure, chapels, reservoirs, crestHouses, crestLamps, fillers: 0, ruelleY: I.ruelleY };
  // ── Verdure jamais sur la route (dans l'échappée), la voie, les gares ni l'escalier : les éléments des rangs et de la crête
  // qui les toucheraient sont retirés (tirages inchangés), et les bouquets des maisons aussi.
  const hitsEscape = (box: readonly [number, number, number, number]): boolean => escapes.some((e) => escapeHit(e, box));
  for (const list of [...rowVerdure, crestVerdure]) drop(list, (v) => !hitsEscape(itemBox(v)));
  for (const h of houses) {
    const m = houseBouquet(h);
    if (m && hitsEscape([m.box.x0, m.box.y0, m.box.x1, m.box.y1])) h.trees = null;
  }
  fond.fillers = fillBareGrass(fond, houses, I, hillTop);
  for (const list of [...rowVerdure, crestVerdure, ...escapes.map((e) => e.verdure)]) for (const v of list) v.b = itemBox(v);
  return { fond, houses, hillTop };
}

// Boîte qui touche la route visible (dans l'échappée), la voie, les gares ou l'escalier (marge 1 px).
export function escapeHit(e: Escape, [x0, y0, x1, y1]: readonly [number, number, number, number]): boolean {
  if (x1 < e.span[0] || x0 > e.span[1]) return false;
  const near = (px: number, py: number, r: number): boolean => px >= x0 - r && px <= x1 + r && py >= y0 - r && py <= y1 + r;
  const segHit = (ax: number, ay: number, bx: number, by: number, r: number): boolean => {
    const n = Math.max(2, Math.ceil(hyp(bx - ax, by - ay) / 1.5));
    for (let k = 0; k <= n; k++) if (near(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, r)) return true;
    return false;
  };
  for (const s of e.segs) {
    if (Math.max(s.ax, s.bx) < e.x || Math.min(s.ax, s.bx) > e.x1) continue;
    if (segHit(s.ax, s.ay + 0.45, s.bx, s.by + 0.45, 2.4)) return true;
  }
  if (segHit(e.funi.x0, e.funi.y0, e.funi.x1, e.funi.y1, 4.2)) return true;
  if (segHit(e.stairs.x0, e.stairs.y0, e.stairs.x1, e.stairs.y1, 2.6)) return true;
  for (const [sx, sy] of [[e.funi.x0, e.funi.y0 + 8], [e.funi.x1, e.funi.y1 - 8]] as const) if (x1 > sx - 10 && x0 < sx + 10 && y1 > sy - 10 && y0 < sy + 9) return true;
  return false;
}

// Couverture du fond (masque) : tout ce qui est peint devant l'herbe, et la zone visible de la colline.
export function fondCoverage(fond: Fond, houses: readonly FondHouse[], I: Pick<FondInput, 'width' | 'height' | 'ground' | 'crest' | 'landmarks'>, hillTop: Float32Array): { cover: Mask; visible: Mask } {
  const W = Math.ceil(I.width);
  const H = Math.ceil(I.ground);
  const cover = newMask(W, H);
  const visible = newMask(W, H);
  for (let x = 0; x < W; x++) {
    const c = I.crest(x);
    const top = hillTop[Math.min(hillTop.length - 1, x)]!;
    for (let y = 0; y < H; y++) if (!(y < c - 1 || y >= top)) visible.a[y * W + x] = 1;
  }
  for (const h of houses) {
    markHouse(cover, h);
    const m = houseBouquet(h);
    if (m) markTree(cover, m);
  }
  for (const h of fond.crestHouses) markHouse(cover, h);
  for (const l of I.landmarks) markRect(cover, l.x - 2 * l.s, l.top, l.x + l.w + 2 * l.s, l.base);
  for (const ch of fond.chapels) markRect(cover, ch.x - 9 * ch.s, ch.y - 18 * ch.s, ch.x + 12 * ch.s, ch.y);
  for (const r of fond.reservoirs) markRect(cover, r.x - 4.5 * r.s, r.y - 15 * r.s, r.x + 4.5 * r.s, r.y);
  for (const e of fond.escapes) markEscape(cover, e);
  for (const list of [...fond.rowVerdure, fond.crestVerdure]) for (const v of list) markItem(cover, v);
  return { cover, visible };
}

// Passe de comblement (`ensureFillers` de la maquette, sur le masque) : chaque fenêtre de 8 × 6 px d'herbe nue d'un seul
// tenant reçoit un bouquet, un petit arbre, une haie ou des rochers (tirage par position), ajouté au rang de sa hauteur.
function fillBareGrass(fond: Fond, houses: readonly FondHouse[], I: FondInput, hillTop: Float32Array): number {
  const { cover, visible } = fondCoverage(fond, houses, I, hillTop);
  const { W, H } = cover;
  const bare = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) bare[i] = visible.a[i]! && !cover.a[i] ? 1 : 0;
  // Fenêtre de w × h entièrement nue (sortie au premier pixel couvert).
  const allBare = (x: number, y: number, w: number, h: number): boolean => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (!bare[yy * W + xx]) return false;
    return true;
  };
  const y0 = I.height * I.rows[0]!.y;
  const y1 = I.height * I.rows[1]!.y;
  const pickK = <T>(l: readonly T[], r: () => number): T => l[Math.floor(r() * l.length)]!;
  let n = 0;
  for (let y = 0; y + 6 <= H; y += 2) for (let x = 0; x + 8 <= W; x += 2) {
    if (!allBare(x, y, 8, 6)) continue;
    const cx = x + 4.5;
    const cy = y + 6;
    const row = cy < y0 + 2 ? -1 : cy < y1 + 2 ? 0 : 1;
    const s = row < 0 ? 0.5 : I.rows[row + 1]!.s;
    const hz = row < 0 ? 0.36 : I.rows[row + 1]!.haze;
    const rng = fondRng(I.seed, `comblement-${x}-${y}`);
    const u = rng();
    const item: FondItem =
      u < 0.5 ? { kind: 'bouquet', x: cx - 1.5 * s, y: cy - 2.2 * s, r: (3.2 + rng() * 2) * s, s, hz }
        : u < 0.7 ? { kind: pickK(['chestnut', 'cerisier', 'chene', 'poplar'] as const, rng), x: cx, y: cy + 1, h: (9 + rng() * 5) * s * 1.4, s, hz }
          : u < 0.85 ? { kind: 'hedge', pts: Array.from({ length: 5 }, (_, k): Pt => [x + 0.5 + k * 2.1, cy - 0.5 + Math.sin(k) * 0.4]), s, hz }
            : { kind: 'rocks', x: cx, y: cy, n: 2 + Math.floor(rng() * 2), seed: rng() * 100, s, hz };
    if (fond.escapes.some((e) => escapeHit(e, itemBox(item)))) continue;
    (row < 0 ? fond.crestVerdure : fond.rowVerdure[row as 0 | 1]).push(item);
    n++;
    // La zone est comblée : effacée du masque (comme la maquette) et de ce que l'élément couvre vraiment.
    for (let yy = y; yy < Math.min(H, y + 7); yy++) for (let xx = x - 4; xx < x + 13; xx++) if (xx >= 0 && xx < W) bare[yy * W + xx] = 0;
    markItem({ W, H, a: bare, v: 0 }, item);
    x += 8;
  }
  return n;
}
