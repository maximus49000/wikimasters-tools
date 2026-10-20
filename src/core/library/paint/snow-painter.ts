import { hashString, mulberry32 } from '../scene-world';
import { DAB_SPREAD, cellRng, dab } from './brush';
import { TILE, tileItems } from './city-painter';
import { heightOn, type Dormer, type FacadeWindow, type Level } from '../city/facade-layout';
import { hillCrestY, type CityPaintPlan, type HillHouse, type PaintBuilding } from './city-plan';
import { hexRgb, jitter, rgba } from './color';
import type { PaintCtx } from './paint-ctx';
import { roofOutlineOf } from './roof-painter';

// Neige posée (vague Ghibli, G2) : une tranche de TILE px du monde, en coordonnées du monde, à superposer à la ville peinte.
// Toits (sous la ligne de toit, jamais au-dessus), cheminées, rebords de fenêtres, trottoirs et rue, crête de la colline et
// toits des maisons du fond (décor cellulo). Chaque immeuble et chaque case du sol a son propre générateur : deux tranches
// voisines peignent la même chose sur leur bord commun.
export const SNOW_VERSION = 5;

const SNOW = hexRgb('#F4F8FC');
const SNOW_SHADE = hexRgb('#D8E2EE');
// Débord du toit du premier plan (contour de la mise en page ±1,5 ou ±2, corniche ±1,5) : borne de recherche.
const OVERHANG = 2;
// Touches de toit : rayon ≤ 0,8, allongement 1,8 → portée ≤ 0,8 × 1,8 × DAB_SPREAD ≈ 1,66 ; centre posé sous la ligne de toit.
const ROOF_R = 0.8;
const ROOF_REACH = ROOF_R * 1.8 * DAB_SPREAD;
const CELL = 40;

// Corniche du premier plan (roof-painter.ts) : haut à eave − 0,8, de x − 1,5 à x + w + 1,5, peinte par-dessus le toit.
const CORNICE_UP = 0.8;
const CORNICE_OVER = 1.5;

// Haut du toit peint du fond en x (mêmes tracés que city-painter.ts, sans débord).
function farRoofLineY(b: PaintBuilding, x: number): number {
  const eave = b.top + b.look.roofH;
  if (b.look.roofKind === 'gable') {
    const half = b.w / 2;
    const t = Math.min(1, Math.abs(x - (b.x + b.w / 2)) / half);
    return b.top + (eave - b.top) * t;
  }
  // Zinc : débord de 1 px, plat à top + 1.
  if (b.look.roofKind === 'zinc') return x >= b.x - 1 && x <= b.x + b.w + 1 ? b.top + 1 : eave;
  const flat = b.top + 1;
  // Mansarde : plat entre x + 1,5 et x + w − 1,5.
  const k = 1.5;
  if (x >= b.x + k && x <= b.x + b.w - k) return flat;
  const t = x < b.x + k ? Math.min(1, (b.x + k - x) / k) : Math.min(1, (x - (b.x + b.w - k)) / k);
  return flat + (eave - flat) * t;
}

// Haut du toit peint en x. Premier plan : contour `roofOutline` de la mise en page (celui que roof-painter.ts encre : terrasson
// et brisis de la mansarde, toit simple à faîtage à 42 %), relevé par la corniche là où elle dépasse ; fond : tracés de city-painter.ts.
export function roofLineY(b: PaintBuilding, x: number): number {
  if (b.far) return farRoofLineY(b, x);
  const y = heightOn(roofOutlineOf(b), x);
  return x >= b.x - CORNICE_OVER && x <= b.x + b.w + CORNICE_OVER ? Math.min(y, b.top + b.look.roofH - CORNICE_UP) : y;
}

// Emprise horizontale du toit peint (débord compris) : hors de là, l'immeuble ne touche pas le ciel.
export function roofSpan(b: PaintBuilding): { x0: number; x1: number } {
  if (b.far) return { x0: b.x, x1: b.x + b.w };
  const pts = roofOutlineOf(b);
  return { x0: Math.min(pts[0]![0], b.x - CORNICE_OVER), x1: Math.max(pts.at(-1)![0], b.x + b.w + CORNICE_OVER) };
}

// Cassures de la ligne de toit (murs, faîte, coins, bouts de la corniche et croisements du contour avec elle) : la ligne est
// affine entre deux cassures.
export function roofCuts(b: PaintBuilding): number[] {
  if (b.far) {
    if (b.look.roofKind === 'zinc') return [b.x - 1, b.x + b.w + 1];
    if (b.look.roofKind === 'gable') return [b.x, b.x + b.w / 2, b.x + b.w];
    return [b.x, b.x + 1.5, b.x + b.w - 1.5, b.x + b.w];
  }
  const pts = roofOutlineOf(b);
  const c = b.top + b.look.roofH - CORNICE_UP;
  const cuts = [...pts.map(([x]) => x), b.x - CORNICE_OVER, b.x + b.w + CORNICE_OVER];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    if ((y0 - c) * (y1 - c) < 0) cuts.push(x0 + ((c - y0) * (x1 - x0)) / (y1 - y0));
  }
  return cuts.sort((p, q) => p - q);
}

// Couronnement des souches de la mise en page (roof-painter.ts : de x − 0,6 à x + 4,6, haut à `top`) : la neige s'y pose.
export function chimneyBoxes(_plan: CityPaintPlan, b: PaintBuilding): { x0: number; x1: number; y0: number }[] {
  if (b.far || !b.layout) return [];
  return b.layout.chimneys.map((c) => ({ x0: c.x - 0.6, x1: c.x + 4.6, y0: c.top }));
}

// Haut du petit toit d'une lucarne en x (mêmes tracés que roof-painter.ts), null hors de lui : fronton triangulaire (pointe
// 3,6 px au-dessus, débord de 2,2), fronton cintré (demi-disque de rayon w/2 + 2), capucine (trois pans, plat 2,8 px au-dessus).
// L'œil-de-bœuf et la tabatière n'en ont pas (la tabatière est couchée sur le toit, sous sa neige).
export function dormerTopY(d: Dormer, x: number): number | null {
  const dx = Math.abs(x - d.cx);
  if (d.type === 'fronton-tri') {
    const half = d.w / 2 + 2.2;
    return dx <= half ? d.y - 3.6 * (1 - dx / half) : null;
  }
  if (d.type === 'fronton-cintre') {
    const r = d.w / 2 + 2;
    return dx <= r ? d.y - Math.sqrt(r * r - dx * dx) : null;
  }
  if (d.type === 'capucine') {
    const flat = d.w / 2 + 0.5;
    if (dx <= flat) return d.y - 2.8;
    return dx <= flat + 2 ? d.y - 2.8 * (1 - (dx - flat) / 2) : null;
  }
  return null;
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
  const { x0, x1 } = roofSpan(b);
  const eave = b.top + b.look.roofH;
  const layout = b.far ? null : b.layout;
  const mansard = layout?.roof.kind === 'mansard';
  const dormers = layout?.dormers ?? [];
  // Pente locale la plus forte autour de x (5 échantillons sur la portée d'une touche).
  const slopeAt = (x: number): number => (roofLineY(b, x + 0.25) - roofLineY(b, x - 0.25)) / 0.5;
  const steepest = (x: number): number => Math.max(...[-1, -0.5, 0, 0.5, 1].map((k) => Math.abs(slopeAt(x + k * ROOF_REACH))));
  // Touche (centre x, y) qui couvrirait la façade d'une lucarne (fronton, capucine : la vitre reste visible) ; tirée quand même.
  const onDormer = (x: number, y: number): boolean => dormers.some((d) => d.type !== 'tabatiere' && Math.abs(x - d.cx) < d.w / 2 + 2.5 + ROOF_REACH && y + ROOF_REACH > d.y - 0.5 && y - ROOF_REACH < d.y + d.h + 1);
  // Rangs de touches qui suivent la ligne de toit, posés dessous. Une touche de portée R centrée à R × √(1 + s²) sous la
  // ligne ne la dépasse jamais sur une pente s ; rien sur les flancs trop raides (s > 1,5). Fond et mansarde (terrasson) :
  // deux rangs ; toit simple du premier plan, à faible pente : quatre, de plus en plus clairsemés vers l'égout.
  const rows = b.far || mansard ? [[0.05, 1], [1.2, 1]] : [[0.05, 1], [1.2, 1], [2.6, 0.7], [4, 0.4]];
  for (const [extra, cover] of rows) {
    for (let x = x0 + ROOF_REACH; x <= x1 - ROOF_REACH; x += 0.9) {
      const s = steepest(x);
      const jitterY = rng() * 0.3;
      const size = ROOF_R * (0.7 + rng() * 0.3);
      const keep = rng() < cover!;
      if (s > 1.5 || !keep) continue;
      const y = roofLineY(b, x) + ROOF_REACH * Math.sqrt(1 + s * s) + extra! + jitterY;
      // Premier plan : la neige du toit s'arrête au-dessus de la corniche (son rebord a sa propre couche), pas sur les lucarnes.
      if (!b.far && (y > eave - CORNICE_UP - ROOF_REACH * 0.5 || onDormer(x, y))) continue;
      // Toit du fond : touche tirée puis peinte « à vide » si un immeuble du premier plan la cache.
      const ink = b.far && hiddenByNear(near, x, y) ? NO_INK : ctx;
      dab(ink, rng, x, y, size, jitter(extra! > 1 ? SNOW_SHADE : SNOW, 4, rng), 0.9, 1.8, Math.atan(slopeAt(x)));
    }
  }
  for (const c of chimneyBoxes(plan, b)) {
    for (let x = c.x0 + ROOF_REACH; x <= c.x1 - ROOF_REACH; x += 0.8) dab(ctx, rng, x, c.y0 + ROOF_REACH + 0.05, ROOF_R, SNOW, 0.95, 1.8, 0);
  }
  if (b.far) return;
  if (layout && layout.roof.kind === 'mansard') paintBrisisSnow(ctx, rng, b, layout.roof.terrasson, onDormer);
  // Rebord de la corniche, sur toute la largeur (peinte par-dessus le toit : son haut est un appui, comme ceux des fenêtres).
  // Touches couchées de rayon ≤ 0,5 : portée 0,5 × DAB_SPREAD en hauteur, × 1,8 en largeur (rentrées d'autant aux bouts).
  const cy = eave - CORNICE_UP + 0.1 + 0.5 * DAB_SPREAD;
  const cx = 0.5 * 1.8 * DAB_SPREAD;
  for (let x = b.x - CORNICE_OVER + cx; x <= b.x + b.w + CORNICE_OVER - cx; x += 0.7) dab(ctx, rng, x, cy, 0.4 + rng() * 0.1, SNOW, 0.9, 1.8, 0);
  if (!layout) return;
  for (const d of dormers) paintDormerSnow(ctx, rng, d);
  paintLedgeSnow(ctx, rng, b, layout.levels, layout.windows);
}

// Brisis de la mansarde : pente presque verticale, la neige n'y tient qu'en plaques clairsemées entre le terrasson et la
// corniche (sous le terrasson de la mise en page), plus rares vers le bas, jamais sur les lucarnes. Touches couchées
// (rot 0) dans le trapèze rentré de leur portée.
function paintBrisisSnow(ctx: PaintCtx, rng: () => number, b: PaintBuilding, terrasson: number, onDormer: (x: number, y: number) => boolean): void {
  const eave = b.top + b.look.roofH;
  const bt = b.top + terrasson;
  const r = 0.75;
  const reachX = r * 1.8 * DAB_SPREAD;
  const reachY = r * DAB_SPREAD;
  const bottom = eave - CORNICE_UP - reachY;
  for (let y = bt + reachY + 0.4; y <= bottom; y += 2.2) {
    // Bords du brisis à cette hauteur : de (x − 1,5, égout) à (x + 2,5, haut du brisis).
    const t = (eave - y) / (eave - bt);
    const xl = b.x - 1.5 + 4 * t + reachX;
    const xr = b.x + b.w + 1.5 - 4 * t - reachX;
    const cover = 0.5 - 0.3 * (1 - t);
    for (let x = xl; x <= xr; x += 1.1) {
      const dx = rng() * 0.6;
      const size = r * (0.7 + rng() * 0.3);
      const keep = rng() < cover;
      if (!keep || x + dx > xr || onDormer(x + dx, y)) continue;
      dab(ctx, rng, x + dx, y, size, jitter(rng() < 0.6 ? SNOW : SNOW_SHADE, 4, rng), 0.85, 1.8, 0);
    }
  }
}

// Petit toit d'une lucarne (fronton triangulaire ou cintré, capucine) : un rang de touches posé dessous, comme sur le grand toit.
// Sur la courbe du fronton cintré, le centre est pris sous le plus bas des points de la portée (la courbe ne passe jamais dessus).
function paintDormerSnow(ctx: PaintCtx, rng: () => number, d: Dormer): void {
  const half = d.type === 'fronton-tri' ? d.w / 2 + 2.2 : d.type === 'fronton-cintre' ? d.w / 2 + 2 : d.type === 'capucine' ? d.w / 2 + 2.5 : 0;
  if (half === 0) return;
  const top = (x: number): number => dormerTopY(d, x) ?? Infinity;
  for (let x = d.cx - half + ROOF_REACH; x <= d.cx + half - ROOF_REACH; x += 0.7) {
    const ks = [-1, -0.5, 0, 0.5, 1].map((k) => x + k * ROOF_REACH);
    const s = Math.max(...ks.map((k) => Math.abs((top(k + 0.2) - top(k - 0.2)) / 0.4)));
    const size = ROOF_R * (0.7 + rng() * 0.3);
    if (!(s <= 1.5)) continue;
    const y = Math.max(...ks.map(top)) + ROOF_REACH * Math.sqrt(1 + s * s) + 0.05;
    dab(ctx, rng, x, y, size, SNOW, 0.95, 1.8, Math.atan((top(x + 0.2) - top(x - 0.2)) / 0.4));
  }
}

// Rebords : appuis des fenêtres d'étage (courantes, dernier étage, entresol, cage), dalles des balcons filants (toute la
// largeur de l'étage) et des balconnets (sous leur fenêtre, à la place de l'appui). La porte-fenêtre n'a que la dalle du filant.
function paintLedgeSnow(ctx: PaintCtx, rng: () => number, b: PaintBuilding, levels: readonly Level[], windows: readonly FacadeWindow[]): void {
  // Dalle (facade-painter.ts, paintBalcony) : de x − 0,8 à x + w + 0,8, haut à y − 0,4 ; touche de rayon ≤ 0,5 posée dessus.
  const slab = (x: number, y: number, w: number): void => {
    const sy = y - 0.4 + 0.1 + 0.5 * DAB_SPREAD;
    for (let k = x - 0.8 + 0.6; k <= x + w + 0.8 - 0.6; k += 0.7) dab(ctx, rng, k, sy, 0.4 + rng() * 0.1, SNOW, 0.9, 1.8, 0);
  };
  for (const lv of levels) if (lv.balcony === 'filant') slab(b.x + 1.5, lv.y + lv.h, b.w - 3);
  for (const w of windows) {
    if (w.kind === 'french' || w.kind === 'dormer') continue;
    if ((w.kind === 'std' || w.kind === 'top') && levels[w.level]?.balcony === 'balconnet') {
      slab(w.x - 1.2, w.y + w.h, w.w + 2.4);
      continue;
    }
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

// Ce qui est peint devant la colline : immeubles (fond et premier plan, sous leur ligne de toit) et socles des jumeaux.
// Ligne affine entre deux cassures : son minimum sur un intervalle est pris aux bornes ou aux cassures.
type Front = { x0: number; x1: number; y: (x: number) => number; cuts: readonly number[] };

function frontsOver(plan: CityPaintPlan, a: number, b: number): Front[] {
  const out: Front[] = [];
  for (const bd of plan.buildings) {
    const s = roofSpan(bd);
    if (s.x1 >= a && s.x0 <= b) out.push({ ...s, y: (x) => roofLineY(bd, x), cuts: roofCuts(bd) });
  }
  for (const p of plan.podiums) if (p.x + p.w >= a && p.x <= b) out.push({ x0: p.x, x1: p.x + p.w, y: () => p.top, cuts: [] });
  return out;
}

// Plus haut de ce qui est devant sur [a, b] ; Infinity si rien.
function frontMin(fronts: readonly Front[], a: number, b: number): number {
  let y = Infinity;
  for (const f of fronts) {
    if (f.x1 < a || f.x0 > b) continue;
    const lo = Math.max(a, f.x0);
    const hi = Math.min(b, f.x1);
    y = Math.min(y, f.y(lo), f.y(hi));
    for (const k of f.cuts) if (k > lo && k < hi) y = Math.min(y, f.y(k));
  }
  return y;
}

// Fond : bande blanche à bord net le long de la crête (sous la ligne) et trait de neige sur le haut des toits des maisons.
// La neige posée est un seul calque au-dessus de toute la ville : la colline n'est enneigée que là où aucun immeuble ni
// socle ne passe devant (bande en colonnes de 1 px rognées au plus haut de ce qui est devant, trait découpé en morceaux
// de 0,5 px gardés seulement s'ils restent, épaisseur comprise, au-dessus de ce qui est devant).
export function paintHillSnow(ctx: PaintCtx, plan: CityPaintPlan, x0: number, x1: number, houses: readonly HillHouse[]): void {
  const a = x0 - 4;
  const b = x1 + 4;
  const crest = (x: number): number => hillCrestY(plan, x);
  const lo = Math.min(a, ...houses.map((h) => h.x - 2 * h.s - 2));
  const hi = Math.max(b, ...houses.map((h) => h.x + h.w + 2 * h.s + 2));
  const fronts = frontsOver(plan, lo, hi);
  ctx.fillStyle = rgba(SNOW, 0.95);
  ctx.beginPath();
  for (let x = a; x < b; x += 1) {
    const c = Math.min(b, x + 1);
    const ca = crest(x);
    const cc = crest(c);
    const front = frontMin(fronts, x, c);
    const ba = Math.min(ca + 4, front);
    const bc = Math.min(cc + 4, front);
    if (ba <= ca || bc <= cc) continue;
    ctx.moveTo(x, ca);
    ctx.lineTo(c, cc);
    ctx.lineTo(c, bc);
    ctx.lineTo(x, ba);
    ctx.closePath();
  }
  ctx.fill();
  ctx.strokeStyle = rgba(SNOW, 0.95);
  for (const h of houses) {
    const hw = 0.8 * h.s;
    ctx.lineWidth = 2 * hw;
    ctx.beginPath();
    const pts = hillRoofPoints(h).map(([px, py]): [number, number] => [px, py + hw]);
    let open = false;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1]!;
      const [bx, by] = pts[i]!;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
      for (let k = 0; k < n; k++) {
        const p0: [number, number] = [ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n];
        const p1: [number, number] = [ax + ((bx - ax) * (k + 1)) / n, ay + ((by - ay) * (k + 1)) / n];
        const keep = Math.max(p0[1], p1[1]) + hw <= frontMin(fronts, Math.min(p0[0], p1[0]) - hw, Math.max(p0[0], p1[0]) + hw);
        if (!keep) {
          open = false;
          continue;
        }
        if (!open) ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        open = true;
      }
    }
    ctx.stroke();
  }
}

export function paintSnowTile(ctx: PaintCtx, plan: CityPaintPlan, tile: number): void {
  const x0 = tile * TILE;
  const x1 = Math.min(plan.width, (tile + 1) * TILE);
  const { buildings, houses, fondHouses } = tileItems(plan, tile);
  // Tous les immeubles du premier plan du monde (pas seulement ceux de la tranche) : même décision d'une tranche à l'autre.
  const near = plan.buildings.filter((x) => !x.far);
  // Maisons du fond vivant (rang de crête, échappée) comprises.
  paintHillSnow(ctx, plan, x0, x1, [...houses, ...fondHouses]);
  for (const b of buildings.filter((x) => x.far)) paintRoofSnow(ctx, plan, b, near);
  for (const b of buildings.filter((x) => !x.far)) paintRoofSnow(ctx, plan, b);
  paintGroundSnow(ctx, plan, x0, x1);
}
