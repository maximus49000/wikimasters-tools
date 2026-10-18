import { hashString, mulberry32 } from '../scene-world';
import { cellRng, type Box } from './brush';
import { INK, TAU, disc, fillRect, groundShadow, inkRect, light, poly, shade } from './cel';
import { GROUND_FLOOR } from '../city/facades';
import { HILL_ROWS, LEFT_GAP, leftOf, type CityPaintPlan, type Furniture, type HillHouse, type Landmark, type PaintBuilding, type PaintPodium, type PlanDoor, type Tree, type Win } from './city-plan';
import { paintFacade } from './facade-painter';
import { paintParisRoof } from './roof-painter';
import { paintEntrance } from './shop/entrance';
import { hexRgb, rgba, type Rgb } from './color';
import { paintFarWall, paintHillGround, paintHillHouse, paintLandmark } from './hill-painter';
import type { PaintCtx } from './paint-ctx';

// Peintre de la ville (vague Ghibli, décor cellulo) : une tranche de TILE px du monde, en coordonnées du monde (l'appelant
// décale le canvas). Aplats francs, un ton d'ombre à bord net, un rehaut, trait encré. Chaque immeuble, arbre et meuble a
// son propre générateur : peint depuis deux tranches, il est identique.
export const TILE = 360;
// À incrémenter à chaque changement du dessin : invalide le cache des tranches.
export const PAINT_VERSION = 8;

const LEAVES = ['#2A6A2E', '#52A23C', '#A8DC58'].map(hexRgb);
const GLASS = hexRgb('#7FB4E0');
const BARK = hexRgb('#9A8468');
const SIDEWALK = hexRgb('#E6D4AE');
const COBBLE = hexRgb('#B49E7A');
const BENCH = hexRgb('#C48A54');
const MAILBOX = hexRgb('#F6C820');
const POSTERS = ['#E85A3A', '#3A7EC8', '#F0C030', '#8A58B8'].map(hexRgb);

export const tileCount = (width: number): number => Math.max(1, Math.ceil(width / TILE));
// Corniche du socle des jumeaux : débord de chaque côté, hauteur au-dessus de `p.top`, hauteur totale, ombre dessous.
export const CORNICE = { over: 1.5, up: 0.8, h: 3, drop: 2.5 } as const;

export type TileItems = { buildings: PaintBuilding[]; podiums: PaintPodium[]; trees: Tree[]; houses: HillHouse[]; landmarks: Landmark[]; furniture: Furniture[]; doors: PlanDoor[] };

export function tileItems(plan: CityPaintPlan, tile: number): TileItems {
  const x0 = tile * TILE - 2;
  const x1 = (tile + 1) * TILE + 2;
  return {
    buildings: plan.buildings.filter((b) => b.x < x1 && b.x + b.w > x0),
    // Le socle déborde de sa corniche de chaque côté.
    podiums: plan.podiums.filter((p) => p.x - CORNICE.over < x1 && p.x + p.w + CORNICE.over > x0),
    trees: plan.trees.filter((t) => t.x - t.r < x1 && t.x + t.r > x0),
    houses: plan.hill.houses.filter((h) => h.x - 2 < x1 && h.x + h.w + (h.trees ? h.trees.r * 2 : 0) + 2 > x0),
    landmarks: plan.hill.landmarks.filter((l) => l.x - 3 < x1 && l.x + l.w + 3 > x0),
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
    // Travées de la mise en page et fenêtres du socle : elles suivent la partie visible et la porte d'un lot coupé au bord.
    it.buildings.map((b) => `${b.far ? 'f' : ''}@${b.x.toFixed(1)}${b.layout ? `:${b.layout.bays.map((c) => c.toFixed(1)).join(';')}` : ''}`).join(','),
    it.podiums.map((p) => `${p.x.toFixed(1)}:${p.wins.map((w) => w.x.toFixed(1)).join(';')}`).join(','),
    it.trees.map((t) => `${t.x.toFixed(1)}:${t.r.toFixed(1)}`).join(','),
    it.houses.map((h) => `${h.row}${h.x.toFixed(1)}`).join(','),
    it.landmarks.map((l) => `${l.kind}${l.x.toFixed(1)}`).join(','),
    it.furniture.map((f) => `${f.kind}${f.x.toFixed(1)}`).join(','),
    it.doors.map((d) => `${d.variant}${d.x.toFixed(1)}`).join(','),
  ].join('|');
}

const rngOf = (plan: CityPaintPlan, salt: string, x: number) => mulberry32(plan.seed ^ hashString(salt) ^ Math.round(x * 8));

// Immeuble : le fond garde son peintre (hill-painter) ; le premier plan est peint d'après sa mise en page, façade puis toit.
export function paintBuilding(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding): void {
  if (b.far) return paintFarWall(ctx, plan, b, leftOf(plan, b));
  paintFacade(ctx, plan, b);
  paintParisRoof(ctx, plan, b);
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

// Fenêtre d'habitation (tour ou socle) : vitre, reflet, rideaux, trait et meneau.
function paintPane(ctx: PaintCtx, win: Win): void {
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
}

// Socle commun des jumeaux (maquette batiments-larges/rue.html) : pierre de taille claire d'un seul tenant sous les deux
// tours, assises fines, corniche saillante à `p.top` (rehaut dessus, ombre nette dessous), rangée de fenêtres de l'étage
// encadrées de pierre, bandeau au-dessus du rez-de-chaussée (les locaux et entrées sont peints par-dessus).
export function paintPodium(ctx: PaintCtx, plan: CityPaintPlan, p: PaintPodium): void {
  const { x, w, top, stone } = p;
  const { ground } = plan;
  const h = ground - top;
  fillRect(ctx, stone, x, top, w, h);
  fillRect(ctx, shade(stone, 0.28), x + w * 0.72, top, w * 0.28, h);
  fillRect(ctx, light(stone, 0.45), x, top, 1.6, h);
  fillRect(ctx, shade(stone, 0.18), x, ground - 3, w, 3);
  // Assises de pierre de taille, de la corniche au bandeau du rez-de-chaussée.
  const band = ground - GROUND_FLOOR - 1;
  ctx.strokeStyle = rgba(shade(stone, 0.24), 0.9);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let y = top + CORNICE.h + 3; y < band - 1; y += 4.5) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
  }
  ctx.stroke();
  fillRect(ctx, shade(stone, 0.3), x, band, w, 1);
  inkRect(ctx, x, top, w, h, 0.9);
  // Ombre nette de la corniche, puis les fenêtres de l'étage (linteau et appui en pierre plus claire).
  fillRect(ctx, shade(stone, 0.42), x, top + CORNICE.h - CORNICE.up, w, CORNICE.drop);
  for (const win of p.wins) {
    fillRect(ctx, light(stone, 0.5), win.x - 1.2, win.y - 1, win.w + 2.4, 1);
    paintPane(ctx, win);
    fillRect(ctx, '#FFF6E0', win.x - 1.2, win.y + win.h, win.w + 2.4, 1);
    fillRect(ctx, shade(stone, 0.4), win.x - 1.2, win.y + win.h + 1, win.w + 2.4, 1);
  }
  // Corniche en débord : rehaut dessus, face à l'ombre légère, trait.
  const cx = x - CORNICE.over;
  const cw = w + 2 * CORNICE.over;
  const cy = top - CORNICE.up;
  fillRect(ctx, light(stone, 0.5), cx, cy, cw, CORNICE.h);
  fillRect(ctx, shade(stone, 0.22), cx, cy + CORNICE.h - 1, cw, 1);
  fillRect(ctx, shade(stone, 0.42), cx + cw * 0.72, cy + 1.4, cw * 0.28, CORNICE.h - 1.4);
  inkRect(ctx, cx, cy, cw, CORNICE.h, 0.7);
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
// Voisin de gauche : défini dans city-plan.ts (partagé avec le peintre des façades).
export { LEFT_GAP, leftOf };
