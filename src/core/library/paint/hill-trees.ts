import { hashString, mulberry32 } from '../scene-world';
import { TAU, disc, fillRect, ink, shade } from './cel';
import { hexRgb, mixRgb, rgba, type Rgb } from './color';
import { bloomOf, mixTones, sat, type Foliage, type FondMoment } from './fond-time';
import type { PaintCtx } from './paint-ctx';

// Arbres de la colline (chantier « fond vivant ») : port de `03a-arbres.js` de la maquette validée, SANS le vent (PR 3).
// Un arbre = un squelette (fût, charpentières, branches, rameaux) tiré UNE fois de (clé, essence, taille) : il ne dépend ni de
// la date, ni de la densité, ni de la météo, donc le tronc ne change jamais de taille d'un jour à l'autre. Le feuillage est une
// liste de touffes attachées aux rameaux, que la saison habille ; elles se fondent en masses continues (blobs lobés qui se
// recouvrent), avec un trait léger sur la silhouette seule : jamais de boules cernées une à une.

const HAZE = hexRgb('#9CC0E4');
const haze = (c: Rgb, t: number): Rgb => mixRgb(c, HAZE, t);

type Port = { n: readonly [number, number]; ang: number; len: number; kink: number; w: number; crown: readonly [number, number] };
const PORTS: Record<string, Port> = {
  platane: { n: [3, 5], ang: 0.7, len: 0.56, kink: 0.4, w: 1.1, crown: [1.05, 0.8] },
  tilleul: { n: [3, 4], ang: 0.42, len: 0.5, kink: 0.15, w: 0.85, crown: [0.72, 1.05] },
  marronnier: { n: [3, 4], ang: 0.58, len: 0.52, kink: 0.22, w: 1.0, crown: [0.9, 0.9] },
  poplar: { n: [3, 5], ang: 0.2, len: 0.62, kink: 0.1, w: 0.7, crown: [0.38, 1.25] },
  cerisier: { n: [4, 6], ang: 0.5, len: 0.6, kink: 0.25, w: 0.75, crown: [0.95, 0.75] },
  chene: { n: [3, 4], ang: 0.78, len: 0.5, kink: 0.5, w: 1.15, crown: [1.0, 0.85] },
  bouquet: { n: [2, 4], ang: 0.6, len: 0.55, kink: 0.3, w: 0.8, crown: [0.95, 0.85] },
};
PORTS.chestnut = PORTS.marronnier!;

export type Seg = { x0: number; y0: number; x1: number; y1: number; w: number; lv: number; mass: number; rank: number };
export type Tuft = { x: number; y: number; rr: number; rank: number; tone: number; phase: number; yel: number; cluster: number; mass: number; outer: boolean };
export type TreeModel = {
  key: string;
  species: string;
  foot: { x: number; y: number };
  trunkH: number;
  rootY: number;
  w0: number;
  segs: Seg[];
  tufts: Tuft[];
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  top: number;
  trunkBox: { x: number; y: number; w: number; h: number };
  span: [number, number];
  // Boîte englobante de tout ce que le dessin peut toucher (feuillage plein, rameaux, neige) : découpe du ciel, comblement.
  box: { x0: number; y0: number; x1: number; y1: number };
};

// Modèle : `foot` pied, `trunkH` hauteur du fût, `crownH` hauteur de la ramure, `depth` niveaux, `tuftR` rayon d'une touffe,
// `maxTufts` plafond de touffes. Déterministe : même clé → même arbre.
export function treeModel(key: string, species: string, foot: { x: number; y: number }, trunkH: number, crownH: number, depth: number, tuftR: number, maxTufts: number, trunkW?: number): TreeModel {
  const P = PORTS[species] ?? PORTS.bouquet!;
  const rng = mulberry32(hashString('squelette-' + key));
  const segs: Seg[] = [];
  const w0 = trunkW ?? Math.max(0.5, crownH * 0.07 * P.w);
  const rootY = foot.y - trunkH;
  const rec = (px: number, py: number, ang: number, len: number, w: number, lv: number, mass: number): void => {
    if (lv > depth) return;
    const n = P.n[0] + Math.floor(rng() * (P.n[1] - P.n[0] + 1));
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * P.ang * (0.75 + rng() * 0.5) + (rng() - 0.5) * P.kink;
      const l = len * (0.75 + rng() * 0.5);
      const ex = px + Math.cos(a) * l;
      const ey = py + Math.sin(a) * l;
      const mid = lv === 1 ? i : mass;
      segs.push({ x0: px, y0: py, x1: ex, y1: ey, w, lv, mass: mid, rank: 0 });
      rec(ex, ey, a + (rng() - 0.5) * P.kink * 0.6, l * (P.len / 0.56) * 0.62, w * 0.62, lv + 1, mid);
    }
  };
  rec(foot.x, rootY, -Math.PI / 2, crownH * 0.5, w0 * 0.75, 1, 0);
  let minX = foot.x;
  let maxX = foot.x;
  let minY = rootY;
  for (const s of segs) {
    minX = Math.min(minX, s.x1);
    maxX = Math.max(maxX, s.x1);
    minY = Math.min(minY, s.y1);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + rootY) / 2;
  const rx = (maxX - minX) / 2 + tuftR;
  const ry = (rootY - minY) / 2 + tuftR;
  for (const sg of segs) sg.rank = sat(Math.hypot(((sg.x0 + sg.x1) / 2 - cx) / rx, ((sg.y0 + sg.y1) / 2 - cy) / ry) * 0.7 - 0.05);
  const twigs = segs.filter((s) => s.lv >= Math.min(2, depth));
  const rt = mulberry32(hashString('touffes-' + key));
  const tufts: Tuft[] = [];
  const step = Math.max(1, Math.floor(twigs.length / maxTufts));
  for (let i = Math.floor(rt() * step); i < twigs.length && tufts.length < maxTufts; i += step) {
    const s = twigs[i]!;
    const t = 0.45 + rt() * 0.55;
    const x = s.x0 + (s.x1 - s.x0) * t + (rt() - 0.5) * tuftR * 0.8;
    // Jamais au-dessus du plus haut rameau : la silhouette ne saute pas quand une touffe naît.
    const y = Math.max(minY, s.y0 + (s.y1 - s.y0) * t + (rt() - 0.5) * tuftR * 0.8);
    const dist = Math.hypot((x - cx) / rx, (y - cy) / ry);
    const rank = sat(dist * 0.7 + rt() * 0.4 - 0.05);
    tufts.push({ x, y, rr: tuftR * (0.8 + rt() * 0.5), rank, tone: Math.floor(rt() * 3), phase: rt() * TAU, yel: rt(), cluster: Math.min(5, s.mass), mass: s.mass, outer: dist > 0.7 });
  }
  // Boîte : touffes pleines (lobes ≤ 1,33 × r, décalage du ton moyen), rameaux, fût, gui et neige compris (marge 1 px).
  let bx0 = foot.x - w0 * 1.3 - 1;
  let bx1 = foot.x + w0 * 1.3 + 1;
  let by0 = rootY;
  for (const s of segs) {
    const m = Math.max(0.6, s.w * 1.5) + 0.5;
    bx0 = Math.min(bx0, s.x0 - m, s.x1 - m);
    bx1 = Math.max(bx1, s.x0 + m, s.x1 + m);
    by0 = Math.min(by0, s.y0 - m, s.y1 - m);
  }
  for (const tf of tufts) {
    const r = tf.rr * 1.4 + 1.6;
    bx0 = Math.min(bx0, tf.x - r);
    bx1 = Math.max(bx1, tf.x + r);
    by0 = Math.min(by0, tf.y - r);
  }
  return { key, species, foot, trunkH, rootY, w0, segs, tufts, cx, cy, rx, ry, top: minY - tuftR, trunkBox: { x: foot.x - w0, y: rootY, w: 2 * w0, h: trunkH }, span: [minX, maxX], box: { x0: bx0, y0: by0 - 0.5, x1: bx1, y1: foot.y + 0.5 } };
}

// Modèles en mémoire (les mêmes arbres sont repeints à chaque tranche et à chaque créneau) ; borné.
const MODELS = new Map<string, TreeModel>();
export function treeModelOf(key: string, species: string, foot: { x: number; y: number }, trunkH: number, crownH: number, depth: number, tuftR: number, maxTufts: number): TreeModel {
  const k = `${key}|${species}|${foot.x.toFixed(2)}|${foot.y.toFixed(2)}|${trunkH.toFixed(2)}|${crownH.toFixed(2)}|${depth}|${tuftR.toFixed(2)}|${maxTufts}`;
  let m = MODELS.get(k);
  if (!m) {
    m = treeModel(key, species, foot, trunkH, crownH, depth, tuftR, maxTufts);
    MODELS.set(k, m);
    if (MODELS.size > 6000) MODELS.delete(MODELS.keys().next().value as string);
  }
  return m;
}

// Fût : polygone fixe du pied à la racine des charpentières.
export function paintTrunk(ctx: PaintCtx, m: TreeModel, bark: Rgb, hz = 0): void {
  const { foot, rootY, w0 } = m;
  const tb = w0 * 1.25;
  const tt = w0 * 0.8;
  ctx.beginPath();
  ctx.moveTo(foot.x - tb, foot.y);
  ctx.lineTo(foot.x - tt, rootY);
  ctx.lineTo(foot.x + tt, rootY);
  ctx.lineTo(foot.x + tb, foot.y);
  ctx.closePath();
  ctx.fillStyle = rgba(haze(bark, hz), 1);
  ctx.fill();
  ctx.save();
  ctx.clip();
  fillRect(ctx, haze(shade(bark, 0.4), hz), foot.x + tt * 0.2, rootY, tb, m.trunkH);
  ctx.restore();
  ctx.strokeStyle = ink(0.95 - hz);
  ctx.lineWidth = m.trunkH > 12 ? 0.7 : 0.5;
  ctx.stroke();
}

type BranchOpts = { hz?: number; d?: number; veil?: number; snow?: boolean; mistletoe?: number };
// Branches : 'coarse' (charpentières, toujours en bois plein), 'fine' (rameaux : seulement là où le bout n'a pas ou plus de
// feuillage ; le voile gris-brun suit les rameaux sous 50 % de densité), 'all'.
export function paintBranches(ctx: PaintCtx, m: TreeModel, part: 'coarse' | 'fine' | 'all', opts: BranchOpts = {}): void {
  const hz = opts.hz ?? 0;
  const d = opts.d ?? 0;
  const levels = part === 'coarse' ? [1] : part === 'fine' ? [2, 3, 4, 5] : [1, 2, 3, 4, 5];
  const alphaOf = (sg: Seg): number => (sg.lv === 1 ? 1 : sat((sg.rank - d + 0.1) / 0.25) * sat((0.92 - d) / 0.25));
  ctx.lineCap = 'round';
  const veilK = part !== 'coarse' && opts.veil ? opts.veil * sat((0.5 - d) / 0.5) : 0;
  if (veilK > 0) {
    ctx.strokeStyle = rgba(haze(hexRgb('#8A7A70'), hz), veilK);
    for (const sg of m.segs) {
      if (sg.lv < 2 || alphaOf(sg) <= 0.02) continue;
      ctx.lineWidth = Math.max(1.2, sg.w * 3);
      ctx.beginPath();
      ctx.moveTo(sg.x0, sg.y0);
      ctx.lineTo(sg.x1, sg.y1);
      ctx.stroke();
    }
  }
  // Regroupés par opacité (pas de 0,1) pour garder des chemins groupés ; ordre d'apparition stable.
  const buckets = new Map<string, { w: number; a: number; segs: Seg[] }>();
  for (const sg of m.segs) {
    if (!levels.includes(sg.lv)) continue;
    const a = Math.round(alphaOf(sg) * 10) / 10;
    if (a <= 0) continue;
    const k = `${sg.lv}|${a}`;
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = { w: sg.w, a, segs: [] }));
    b.segs.push(sg);
  }
  for (const [, b] of buckets) {
    ctx.strokeStyle = rgba(haze(hexRgb('#4A3A30'), hz), b.a);
    ctx.lineWidth = Math.max(0.3, b.w);
    ctx.beginPath();
    for (const sg of b.segs) {
      ctx.moveTo(sg.x0, sg.y0);
      ctx.lineTo(sg.x1, sg.y1);
    }
    ctx.stroke();
  }
  if (opts.snow) {
    ctx.strokeStyle = 'rgba(242,246,250,0.92)';
    for (const sg of m.segs) {
      if (!levels.includes(sg.lv) || alphaOf(sg) < 0.5) continue;
      const dx = Math.abs(sg.x1 - sg.x0);
      const dy = Math.abs(sg.y1 - sg.y0);
      if (dy > dx * 1.3) continue;
      ctx.lineWidth = Math.max(0.5, sg.w * 0.7);
      ctx.beginPath();
      ctx.moveTo(sg.x0, sg.y0 - sg.w * 0.5 - 0.3);
      ctx.lineTo(sg.x1, sg.y1 - sg.w * 0.5 - 0.3);
      ctx.stroke();
    }
  }
  if (opts.mistletoe) {
    const r = mulberry32(hashString('gui' + m.key));
    const mids = m.segs.filter((sg) => sg.lv === 2);
    for (let i = 0; i < opts.mistletoe && mids.length; i++) {
      const sg = mids[Math.floor(r() * mids.length)]!;
      const rr = Math.max(1, m.ry * 0.16);
      disc(ctx, rgba(haze(hexRgb('#3E6A3A'), hz), 1), (sg.x0 + sg.x1) / 2, (sg.y0 + sg.y1) / 2, rr);
      disc(ctx, rgba(haze(hexRgb('#6A9A5A'), hz), 1), (sg.x0 + sg.x1) / 2 - rr * 0.3, (sg.y0 + sg.y1) / 2 - rr * 0.3, rr * 0.5);
    }
  }
  ctx.lineCap = 'butt';
}

// État d'une touffe : taille 0..1 (0 = absente), tons (jaunissement par touffe, les bouts d'abord), floraison.
type TuftState = { size: number; tones: Rgb[] };
export function tuftState(tf: Tuft, f: Foliage, D: Pick<FondMoment, 'doy'>, species: string): TuftState {
  const bl = species === 'cerisier' ? bloomOf(D, 'cerisier') : 0;
  let size = sat((f.d - tf.rank) / 0.36);
  if (f.tender && f.tender > 0) size = Math.min(size, 0.35 + 0.65 * sat((f.d - tf.rank) / 0.3) + (1 - f.tender));
  if (bl > 0) size = Math.max(size, Math.min(1, bl * 2.5) * (0.6 + 0.4 * bl));
  const yel = f.yel !== undefined ? sat(f.yel * 1.5 - tf.rank * 0.5 + tf.yel * 0.2 - 0.1) : 0;
  let tones = f.yel !== undefined && yel > 0 && f.base && f.autumn ? mixTones(f.base, f.autumn, yel) : f.tones;
  if (bl > 0) tones = ['#D88AA8', '#F0B0C8', '#FCDCE8'].map(hexRgb).map((c, i) => mixRgb(c, tones[i]!, 1 - bl));
  return { size, tones };
}

// Blob de feuillage à bord lobé et dentelé (18 sommets) : jamais un cercle.
function leafBlob(ctx: PaintCtx, x: number, y: number, r: number, ph: number): void {
  ctx.moveTo(x + r * (1 + 0.16 * Math.sin(ph)), y);
  for (let i = 1; i <= 18; i++) {
    const a = (i / 18) * TAU;
    const k = 1 + 0.16 * Math.sin(3 * a + ph) + 0.1 * Math.sin(5 * a + 2 * ph) + (i % 2 ? 0.07 : -0.05);
    ctx.lineTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k * 0.92);
  }
  ctx.closePath();
}

type Item = { tf: Tuft; st: TuftState; rr: number; x: number; y: number };
// Feuilles : masses continues (ombre, ton moyen décalé en haut à gauche, rehauts en touches), trait pointillé léger tracé SOUS
// les aplats (visible seulement sur le bord extérieur et dans les trouées), neige en calottes.
export function paintLeaves(ctx: PaintCtx, m: TreeModel, f: Foliage, D: Pick<FondMoment, 'doy' | 'meteo'>, hz = 0): void {
  const blm = m.species === 'marronnier' ? bloomOf(D, 'marronnier') : 0;
  const items: Item[] = [];
  for (const tf of m.tufts) {
    const st = tuftState(tf, f, D, m.species);
    if (st.size <= 0) continue;
    items.push({ tf, st, rr: tf.rr * st.size, x: tf.x, y: tf.y });
  }
  if (!items.length) return;
  const tone = (it: Item, i: number): string => rgba(haze(it.st.tones[i]!, hz), 1);
  // 1. Trait encré sur la silhouette (pointillé), sous les aplats.
  ctx.save();
  ctx.setLineDash?.([2.2, 1.1]);
  ctx.lineDashOffset = items[0]!.tf.phase;
  ctx.strokeStyle = ink(0.55 - hz);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (const it of items) leafBlob(ctx, it.x, it.y, it.rr, it.tf.phase);
  ctx.stroke();
  ctx.setLineDash?.([]);
  ctx.restore();
  // 2. Ombre : tous les blobs, ton sombre, groupés par ton (aplats).
  const groups = new Map<string, Item[]>();
  for (const it of items) {
    const k = it.st.tones[0]!.join(',');
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(it);
  }
  for (const [, g] of groups) {
    ctx.fillStyle = tone(g[0]!, 0);
    ctx.beginPath();
    for (const it of g) leafBlob(ctx, it.x, it.y, it.rr, it.tf.phase);
    ctx.fill();
  }
  // 3. Ton moyen : blobs décalés vers le haut-gauche, réduits.
  for (const [, g] of groups) {
    ctx.fillStyle = tone(g[0]!, 1);
    ctx.beginPath();
    for (const it of g) leafBlob(ctx, it.x - it.rr * 0.22, it.y - it.rr * 0.28, it.rr * 0.8, it.tf.phase + 1);
    ctx.fill();
  }
  // 4. Rehaut clair en petites touches de feuilles (ellipses) sur le haut des blobs.
  for (const [, g] of groups) {
    ctx.fillStyle = tone(g[0]!, 2);
    ctx.beginPath();
    for (const it of g) {
      if (it.rr < 1.1) continue;
      const r = mulberry32(hashString('hi' + it.tf.phase));
      const n = it.rr > 2.5 ? 4 : 2;
      for (let k = 0; k < n; k++) {
        const a = -2.5 + r() * 1.5;
        const d = it.rr * (0.25 + r() * 0.5);
        const ex = it.x + Math.cos(a) * d;
        const ey = it.y + Math.sin(a) * d;
        ctx.moveTo(ex + 0.8, ey);
        ctx.ellipse(ex, ey, Math.min(1.1, it.rr * 0.35), Math.min(0.6, it.rr * 0.18), a + 0.6, 0, TAU);
      }
    }
    ctx.fill();
  }
  if (blm > 0) {
    ctx.fillStyle = `rgba(255,244,236,${Number(blm.toFixed(3))})`;
    for (const it of items) if (it.tf.outer || it.tf.y < m.cy) ctx.fillRect(it.x - 0.3, it.y - it.rr - 1.4, 0.6, 2);
  }
  if (D.meteo.snow) {
    ctx.fillStyle = 'rgba(240,244,248,0.92)';
    ctx.beginPath();
    for (const it of items) {
      ctx.moveTo(it.x + it.rr * 0.95, it.y - it.rr * 0.15);
      ctx.ellipse(it.x, it.y - it.rr * 0.15, it.rr * 0.95, it.rr * 0.45, 0, Math.PI, 0);
    }
    ctx.fill();
  }
}

// Feuilles sèches accrochées (chênes) : de la chute à la mi-janvier, en s'éclaircissant.
export function paintDryLeaves(ctx: PaintCtx, m: TreeModel, D: Pick<FondMoment, 'doy'>, hz = 0): void {
  const k = m.species === 'chene' ? (D.doy >= 320 ? 1 - (D.doy - 320) / 60 : D.doy < 15 ? 0.3 - D.doy / 50 : 0) : 0;
  if (k <= 0) return;
  ctx.fillStyle = rgba(haze(hexRgb('#9A6A3A'), hz), 0.9 * k);
  const r = mulberry32(hashString('sec' + m.key));
  for (const tf of m.tufts) if (tf.rank > 0.5 && r() < 0.55) ctx.fillRect(tf.x - 0.5, tf.y - 0.3, 1.1, 0.9);
}

