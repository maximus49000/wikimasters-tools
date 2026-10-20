import { hashString, mulberry32 } from '../scene-world';
import { TAU, disc, fillRect, ink, light, poly, shade } from './cel';
import { HILL_ROWS, hillCrestY, type CityPaintPlan, type HillHouse, type Landmark } from './city-plan';
import { hexRgb, mixRgb, rgba, type Rgb } from './color';
import { CLOTH, houseBouquet, isTree, itemKey, lawnBouquet, treeOfItem, type Chapel, type Escape, type FondHouse, type FondItem } from './fond-plan';
import { EVERGREEN, TONES, bloomOf, boulesOut, foliageOf, fondRng, fountainOn, hensOut, hillLaundry, lerp, marketK, parasolK, sat, slotHours, smooth, waterFrozen, type FondMoment } from './fond-time';
import { paintHillHouse, paintLandmark } from './hill-painter';
import { paintBranches, paintDryLeaves, paintLeaves, paintTrunk, type TreeModel } from './hill-trees';
import type { PaintCtx } from './paint-ctx';

// Fond vivant peint dans les tranches fixes (chantier « fond vivant », PR 2a) : port de `03-fond-peint.js` de la maquette
// validée. Herbe de saison, échappée (route en lacets, voie et gares du funiculaire sans cabines, escalier, square, marché,
// lavoir, verger, ruisseau, moulin aux ailes figées…), verdure des rangs et de la crête, rang de crête, chapelles, châteaux
// d'eau, maisons (terrasses, bouquets, linge). Les poses lentes (parasols, étals, linge, poules, boules) sont lues au début de
// la tranche de 10 min de `moment` ; rien n'est animé ici (PR 2b). Aucun tirage hors du plan, sauf ceux du jour (fondRng).

const HAZE = hexRgb('#9CC0E4');
const GRASS = hexRgb('#5E9A50');
const STONE = hexRgb('#EAD6B0');
const GLASS_FAR = hexRgb('#5A7AA8');
const ROAD = hexRgb('#E4C89A');
const CARS = ['#D84A3A', '#F0F0E8', '#3A5A9A', '#8A8A90', '#E8C040', '#4A8A5A'].map(hexRgb);
const SNOW = '#F0F4F8';
const FUNI_GAP = 2.2;
const haze = (c: Rgb, t: number): Rgb => mixRgb(c, HAZE, t);
const css = (c: Rgb | string, a = 1): string => (typeof c === 'string' ? c : rgba(c, a));
const pick = <T>(l: readonly T[], r: () => number): T => l[Math.floor(r() * l.length)]!;

function inkPath(ctx: PaintCtx, pts: readonly (readonly [number, number])[], lw = 0.7, alpha = 1, close = false): void {
  ctx.strokeStyle = ink(alpha);
  ctx.lineWidth = lw;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
  ctx.stroke();
}
const strokePts = (ctx: PaintCtx, pts: readonly (readonly [number, number])[], dy = 0, dx = 0): void => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)));
  ctx.stroke();
};

// Couleur de l'herbe selon le jour : pâle au printemps, sèche (ocre) de septembre à décembre, grise l'hiver, blanche sous la neige.
export function grassOf(D: FondMoment): Rgb {
  const doy = D.doy;
  const dry = sat((doy - 250) / 60) * (1 - sat((doy - 340) / 25));
  const cold = Math.max(sat((doy - 320) / 30), 1 - sat((doy - 60) / 40));
  return D.meteo.snow ? hexRgb('#E8ECF0') : mixRgb(mixRgb(light(GRASS, 0.2 * (1 - sat((doy - 100) / 60))), hexRgb('#B89040'), dry * 0.35), hexRgb('#9A9A80'), cold * 0.45);
}

// Herbe de la colline (paintHillGround avec la couleur de saison) et rehaut net le long de la crête.
export function paintFondGround(ctx: PaintCtx, plan: CityPaintPlan, x0: number, x1: number, D: FondMoment): void {
  const a = x0 - 4;
  const b = x1 + 4;
  const crest = (x: number): number => hillCrestY(plan, x);
  const season = grassOf(D);
  ctx.fillStyle = rgba(haze(season, 0.35), 1);
  ctx.beginPath();
  ctx.moveTo(a, plan.ground);
  for (let x = a; x < b; x += 4) ctx.lineTo(x, crest(x));
  ctx.lineTo(b, crest(b));
  ctx.lineTo(b, plan.ground);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba(haze(light(season, 0.4), 0.3), 1);
  ctx.beginPath();
  ctx.moveTo(a, crest(a) + 3);
  for (let x = a; x < b; x += 4) ctx.lineTo(x, crest(x));
  ctx.lineTo(b, crest(b));
  ctx.lineTo(b, crest(b) + 3);
  for (let x = b; x > a; x -= 4) ctx.lineTo(x, crest(x) + 3);
  ctx.closePath();
  ctx.fill();
}

// ── Arbres ──
function paintTreeAll(ctx: PaintCtx, m: TreeModel, key: string, species: string, D: FondMoment, hz: number, bark: Rgb, gui: (d: number) => number): void {
  const f = foliageOf(D, key, species);
  paintTrunk(ctx, m, bark, hz);
  paintBranches(ctx, m, 'coarse', { hz, snow: D.meteo.snow });
  paintBranches(ctx, m, 'fine', { hz, d: f.d, veil: 0.24, snow: D.meteo.snow, mistletoe: gui(f.d) });
  paintDryLeaves(ctx, m, D, hz);
  paintLeaves(ctx, m, f, D, hz);
}
// Bouquet de la colline : modèle à fût court, 2-3 niveaux, ≤ 22 touffes ; gui sur 25 % quand il est nu.
function paintBouquetModel(ctx: PaintCtx, m: TreeModel, key: string, hz: number, D: FondMoment): void {
  const rk = mulberry32(hashString('gui-' + key.slice(1)));
  paintTreeAll(ctx, m, key, 'bouquet', D, hz, hexRgb('#5A4A40'), (d) => (rk() < 0.25 && d < 0.5 ? 1 : 0));
}

// ── Verdure (même langage que les bouquets ; brume selon le rang ; saison) ──
export function paintVerdure(ctx: PaintCtx, v: FondItem, hz0: number, D: FondMoment, T: number): void {
  const hz = v.hz ?? hz0;
  const s = v.s || 0.6;
  const key = itemKey(v);
  const fill = (c: Rgb, a = 1): string => rgba(haze(c, hz), a);
  const tree = treeOfItem(v);
  if (tree) {
    if (v.kind === 'bouquet') return paintBouquetModel(ctx, tree.m, tree.key, hz, D);
    const cyp = v.kind === 'cypress';
    const rk = mulberry32(hashString('gui-' + tree.key));
    const bark = hexRgb(cyp ? '#4A3A30' : v.kind === 'poplar' ? '#7A6A5A' : '#5A4A40');
    return paintTreeAll(ctx, tree.m, tree.key, tree.species, D, hz, bark, (d) => (!cyp && rk() < 0.3 && d < 0.5 ? 1 + Math.floor(rk() * 2) : 0));
  }
  const f = foliageOf(D, key, v.kind === 'hedge' ? 'cypress' : v.kind === 'vineyard' ? 'vigne' : v.kind);
  switch (v.kind) {
    case 'hedge': {
      const tn = D.season === 'winter' ? ['#3A5A40', '#4A6E50', '#5E8460'].map(hexRgb) : EVERGREEN;
      const r = 1.5 * s;
      ctx.strokeStyle = ink(0.8 - hz);
      ctx.lineWidth = 0.9;
      strokePts(ctx, v.pts!);
      // Haie : masse continue (bande), pas de boules cernées ; trois tons décalés vers le haut-gauche.
      for (let t = 0; t < 3; t++) {
        ctx.fillStyle = fill(tn[t]!);
        ctx.beginPath();
        for (const [x, y] of v.pts!) {
          const rr = r * (1 - t * 0.3);
          ctx.moveTo(x - t * 0.4 + rr, y - t * 0.4);
          ctx.arc(x - t * 0.4, y - t * 0.4, rr, 0, TAU);
        }
        ctx.fill();
      }
      return;
    }
    case 'market': {
      const g = fill(mixRgb(hexRgb('#C8B088'), GRASS, 0.2));
      const pts: [number, number][] = [[v.x! + 1, v.y!], [v.x! + v.w!, v.y! + 0.8], [v.x! + v.w! - 1, v.y! + v.h!], [v.x!, v.y! + v.h! - 0.6]];
      poly(ctx, g, pts);
      inkPath(ctx, pts, 0.5, 0.55 - hz, true);
      const goods = GOODS[D.season];
      const sc = v.s || 1;
      const cols = ['#E8456B', '#F4F0E8', '#3E78A0', '#F6C62E'];
      for (let i = 0; i < v.stalls!; i++) {
        if (!marketK(T, D, i)) continue;
        // Étal à l'échelle `sc` autour de son coin (sx, sy) : coordonnées calculées, sans transformation.
        const sx = v.x! + 2 * sc + i * ((v.w! - 4 * sc) / v.stalls!);
        const sy = v.y! + v.h! * 0.45 + (i % 2) * 1.5 * sc;
        const X = (dx: number): number => sx + dx * sc;
        const Y = (dy: number): number => sy + dy * sc;
        fillRect(ctx, fill(hexRgb('#8A6A48')), X(0.5), Y(0), 4 * sc, 1.4 * sc);
        fillRect(ctx, fill(hexRgb(goods[i % goods.length]!)), X(0.8), Y(-0.6), 1.4 * sc, 0.8 * sc);
        fillRect(ctx, fill(hexRgb(goods[(i + 1) % goods.length]!)), X(2.6), Y(-0.6), 1.4 * sc, 0.8 * sc);
        ctx.strokeStyle = ink(0.7 - hz);
        ctx.lineWidth = 0.4 * sc;
        ctx.beginPath();
        ctx.moveTo(X(0.6), Y(0));
        ctx.lineTo(X(0.6), Y(-3.2));
        ctx.moveTo(X(4.4), Y(0));
        ctx.lineTo(X(4.4), Y(-3.2));
        ctx.stroke();
        const aw: [number, number][] = [[X(-0.2), Y(-3.2)], [X(5.2), Y(-3.2)], [X(4.6), Y(-4.4)], [X(0.4), Y(-4.4)]];
        poly(ctx, fill(hexRgb(cols[i % cols.length]!)), aw);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        for (let k = 0; k < 3; k++) ctx.fillRect(X(0.6 + k * 1.6), Y(-4.2), 0.6 * sc, 1 * sc);
        inkPath(ctx, aw, 0.4 * sc, 0.7 - hz, true);
      }
      return;
    }
    case 'lavoir': {
      const x = v.x!;
      const y = v.y!;
      const on = fountainOn(D);
      fillRect(ctx, fill(shade(STONE, 0.3)), x - 5, y + 1, 10, 2.4);
      fillRect(ctx, on ? fill(hexRgb('#7FB4E0')) : fill(shade(STONE, 0.45)), x - 4.2, y + 1.4, 8.4, 1.4);
      inkPath(ctx, [[x - 5, y + 1], [x + 5, y + 1], [x + 5, y + 3.4], [x - 5, y + 3.4]], 0.4, 0.65 - hz, true);
      ctx.strokeStyle = ink(0.75 - hz);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (const px of [-4.6, 4.6]) {
        ctx.moveTo(x + px, y + 1);
        ctx.lineTo(x + px, y - 3.5);
      }
      ctx.stroke();
      poly(ctx, fill(hexRgb('#C25E44')), [[x - 6, y - 3.5], [x - 4, y - 5.5], [x + 4, y - 5.5], [x + 6, y - 3.5]]);
      poly(ctx, fill(light(hexRgb('#C25E44'), 0.35)), [[x - 6, y - 3.5], [x - 4, y - 5.5], [x - 1, y - 5.5], [x - 2, y - 3.5]]);
      inkPath(ctx, [[x - 6, y - 3.5], [x - 4, y - 5.5], [x + 4, y - 5.5], [x + 6, y - 3.5]], 0.5, 0.75 - hz, true);
      if (D.meteo.snow) poly(ctx, SNOW, [[x - 6, y - 3.5], [x - 4, y - 5.5], [x + 4, y - 5.5], [x + 6, y - 3.5], [x + 6, y - 4.3], [x + 4, y - 6.3], [x - 4, y - 6.3], [x - 6, y - 4.3]]);
      return;
    }
    case 'bench': {
      const x = v.x!;
      const y = v.y!;
      fillRect(ctx, fill(hexRgb('#C48A54')), x - 1.8, y - 1.2, 3.6, 0.6);
      fillRect(ctx, fill(hexRgb('#C48A54')), x - 1.8, y - 2.2, 3.6, 0.5);
      ctx.strokeStyle = ink(0.75 - hz);
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(x - 1.4, y - 1.2);
      ctx.lineTo(x - 1.4, y);
      ctx.moveTo(x + 1.4, y - 1.2);
      ctx.lineTo(x + 1.4, y);
      ctx.stroke();
      return;
    }
    case 'orchard': {
      // Verger en rangs : fleurs en avril, fruits rouges de juillet à septembre, roux puis nus ; herbe rase.
      const g = fill(light(hexRgb(D.season === 'winter' ? '#9A9A80' : TONES.summer[1]), 0.2));
      poly(ctx, g, [[v.x!, v.y!], [v.x! + v.w!, v.y!], [v.x! + v.w!, v.y! + v.h!], [v.x!, v.y! + v.h!]]);
      const r = mulberry32(Math.floor(v.seed! * 100));
      const fruit = D.doy >= 185 && D.doy < 265 ? sat((D.doy - 185) / 20) : 0;
      const sc = v.s || 0.7;
      const st = 4.5 * sc;
      const sr = 4 * sc;
      for (let row = 0; row < Math.max(1, Math.floor(v.h! / sr)); row++) for (let col = 0; col < Math.floor(v.w! / st); col++) {
        const tx = v.x! + st * 0.55 + col * st + (r() - 0.5) * sc;
        const ty = v.y! + sr * 0.75 + row * sr + (r() - 0.5) * 0.8 * sc;
        const tr = (1.5 + r() * 0.5) * sc;
        const kkey = `${key}-${row}-${col}`;
        const bl = bloomOf(D, 'cerisier');
        const f2 = foliageOf(D, kkey, 'cerisier');
        ctx.strokeStyle = ink(0.8 - hz);
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(tx, ty + tr);
        ctx.lineTo(tx, ty - tr * 0.3);
        if (f2.d < 0.5) {
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx - tr * 0.8, ty - tr * 0.9);
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx + tr * 0.8, ty - tr * 0.9);
        }
        ctx.stroke();
        const tn = bl > 0 ? ['#F0B0C8', '#FCDCE8'].map(hexRgb) : f2.tones;
        const kd = Math.max(f2.d, bl);
        for (const [ox, oy, k, rank] of [[0, -0.3, 1, 0.2], [-0.5, -0.6, 0.6, 0.55], [0.45, -0.55, 0.55, 0.8]] as const) {
          const sz = sat((kd - rank) / 0.1);
          if (sz > 0) disc(ctx, fill(tn[rank < 0.5 ? 0 : 1]!), tx + ox * tr, ty + oy * tr, tr * k * sz);
        }
        if (fruit > 0 && f2.stage === 'green' && kd > 0.5) {
          ctx.fillStyle = fill(hexRgb('#D83A3A'), fruit);
          ctx.fillRect(tx + 0.4, ty - 0.2, 0.5, 0.5);
          ctx.fillRect(tx - 0.8, ty - 0.9, 0.5, 0.5);
        }
        if (D.meteo.snow && kd > 0.1) disc(ctx, SNOW, tx - tr * 0.2, ty - tr * 0.9, tr * 0.4);
      }
      return;
    }
    case 'fence': {
      const pts = v.pts!;
      let L = 0;
      for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
      ctx.strokeStyle = ink(0.75 - hz);
      ctx.lineWidth = 0.4;
      strokePts(ctx, pts, -1.2);
      let d = 0;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1]!;
        const [bx, by] = pts[i]!;
        const l = Math.hypot(bx - ax, by - ay);
        for (let t = 0; t < l; t += 1.6) {
          const q = t / l;
          const x = ax + (bx - ax) * q;
          const y = ay + (by - ay) * q;
          const gate = Math.abs((d + t) / L - v.gate!) < 2.5 / L;
          fillRect(ctx, gate ? fill(hexRgb('#8A6A48')) : ink(0.75 - hz), x - 0.2, y - (gate ? 2 : 1.6), gate ? 0.8 : 0.4, gate ? 2 : 1.6);
        }
        d += l;
      }
      return;
    }
    case 'cabane': {
      const x = v.x!;
      const y = v.y!;
      fillRect(ctx, fill(hexRgb('#8A6A48')), x - 2.2, y - 3, 4.4, 3);
      fillRect(ctx, fill(shade(hexRgb('#8A6A48'), 0.35)), x + 1, y - 3, 1.2, 3);
      poly(ctx, fill(hexRgb('#5A6A84')), [[x - 2.8, y - 3], [x, y - 4.6], [x + 2.8, y - 3]]);
      fillRect(ctx, ink(0.7 - hz), x - 0.6, y - 2, 1.2, 2);
      inkPath(ctx, [[x - 2.2, y - 3], [x + 2.2, y - 3], [x + 2.2, y], [x - 2.2, y]], 0.4, 0.7 - hz, true);
      if (D.meteo.snow) poly(ctx, SNOW, [[x - 2.8, y - 3], [x, y - 4.6], [x + 2.8, y - 3], [x + 2.8, y - 3.6], [x, y - 5.2], [x - 2.8, y - 3.6]]);
      return;
    }
    case 'ruche': {
      const x = v.x!;
      const y = v.y!;
      fillRect(ctx, fill(hexRgb('#F0E0B0')), x - 0.7, y - 1.6, 1.4, 1.6);
      fillRect(ctx, fill(hexRgb('#C8A050')), x - 0.9, y - 1.9, 1.8, 0.4);
      ctx.strokeStyle = ink(0.6 - hz);
      ctx.lineWidth = 0.3;
      ctx.strokeRect(x - 0.7, y - 1.6, 1.4, 1.6);
      return;
    }
    case 'stream': {
      // Ruisseau : filet d'eau (gelé de décembre à février ou sous la neige), berges plus vertes.
      const frozen = waterFrozen(D);
      ctx.lineCap = 'round';
      ctx.strokeStyle = fill(D.season === 'winter' ? mixRgb(GRASS, hexRgb('#9A9A80'), 0.3) : light(hexRgb(TONES.summer[1]), 0.1));
      ctx.lineWidth = 3;
      strokePts(ctx, v.pts!);
      ctx.strokeStyle = fill(frozen ? hexRgb('#B8C8D8') : hexRgb('#5A9AD0'));
      ctx.lineWidth = 1.2;
      strokePts(ctx, v.pts!);
      ctx.strokeStyle = frozen ? 'rgba(255,255,255,0.7)' : 'rgba(220,240,255,0.8)';
      ctx.lineWidth = 0.4;
      strokePts(ctx, v.pts!, 0, -0.3);
      ctx.lineCap = 'butt';
      return;
    }
    case 'pond': {
      const frozen = waterFrozen(D);
      ctx.fillStyle = fill(shade(hexRgb('#8A9A70'), 0.2));
      ctx.beginPath();
      ctx.ellipse(v.x!, v.y! + 0.4, v.rx! + 0.8, v.ry! + 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = fill(frozen ? hexRgb('#C4D0DC') : hexRgb('#5A9AD0'));
      ctx.beginPath();
      ctx.ellipse(v.x!, v.y!, v.rx!, v.ry!, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = frozen ? 'rgba(255,255,255,0.5)' : 'rgba(220,240,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(v.x! - v.rx! * 0.3, v.y! - v.ry! * 0.3, v.rx! * 0.4, v.ry! * 0.35, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = ink(0.5 - hz);
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.ellipse(v.x!, v.y!, v.rx!, v.ry!, 0, 0, TAU);
      ctx.stroke();
      if (!frozen) {
        ctx.strokeStyle = fill(hexRgb('#3F8A3A'));
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          ctx.moveTo(v.x! + v.rx! * 0.6 + k * 0.6, v.y! + 0.3);
          ctx.lineTo(v.x! + v.rx! * 0.6 + k * 0.6 + 0.2, v.y! - 1.4 - (k % 2));
        }
        ctx.stroke();
      }
      return;
    }
    case 'path': {
      const p = v.pts!;
      ctx.lineCap = 'round';
      ctx.strokeStyle = fill(mixRgb(ROAD, hexRgb('#A08A60'), 0.5));
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(p[0]![0], p[0]![1]);
      ctx.quadraticCurveTo(p[1]![0], p[1]![1], p[2]![0], p[2]![1]);
      ctx.stroke();
      ctx.strokeStyle = fill(shade(ROAD, 0.4), 0.6);
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(p[0]![0], p[0]![1] + 0.8);
      ctx.quadraticCurveTo(p[1]![0], p[1]![1] + 0.8, p[2]![0], p[2]![1] + 0.8);
      ctx.stroke();
      ctx.lineCap = 'butt';
      return;
    }
    case 'poulailler': {
      const x = v.x!;
      const y = v.y!;
      const sc = v.small ? 0.7 : 1;
      fillRect(ctx, fill(hexRgb('#A08A68')), x - 2 * sc, y - 2.2 * sc, 3 * sc, 2.2 * sc);
      poly(ctx, fill(hexRgb('#7A6A58')), [[x - 2.4 * sc, y - 2.2 * sc], [x - 0.5 * sc, y - 3.2 * sc], [x + 1.4 * sc, y - 2.2 * sc]]);
      ctx.strokeStyle = ink(0.6 - hz);
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        ctx.moveTo(x + 1.2 * sc + k * 0.9 * sc, y);
        ctx.lineTo(x + 1.2 * sc + k * 0.9 * sc, y - 1.4 * sc);
      }
      ctx.moveTo(x + 1.2 * sc, y - 1.2 * sc);
      ctx.lineTo(x + 5.7 * sc, y - 1.2 * sc);
      ctx.stroke();
      if (hensOut(T, D)) for (let k = 0; k < 3; k++) disc(ctx, fill(hexRgb(k === 1 ? '#F4F0E0' : '#B86A3A')), x + 2 * sc + k * 1.3 * sc, y - 0.5 * sc, 0.45 * sc);
      return;
    }
    case 'petanque': {
      const pts: [number, number][] = [[v.x!, v.y!], [v.x! + v.w!, v.y!], [v.x! + v.w! - 0.6, v.y! + v.h!], [v.x! + 0.6, v.y! + v.h!]];
      poly(ctx, fill(hexRgb('#D8C8A0')), pts);
      inkPath(ctx, pts, 0.4, 0.6 - hz, true);
      if (boulesOut(T, D)) {
        disc(ctx, fill(hexRgb('#8A8A90')), v.x! + v.w! * 0.4, v.y! + v.h! * 0.5, 0.4);
        disc(ctx, fill(hexRgb('#8A8A90')), v.x! + v.w! * 0.5, v.y! + v.h! * 0.6, 0.4);
        disc(ctx, fill(hexRgb('#E8A040')), v.x! + v.w! * 0.46, v.y! + v.h! * 0.4, 0.25);
      }
      return;
    }
    case 'rocks': {
      const r = mulberry32(Math.floor(v.seed! * 100));
      for (let k = 0; k < v.n!; k++) {
        const x = v.x! + (r() - 0.5) * 4;
        const y = v.y! + (r() - 0.5) * 1.5;
        const w = 1.5 + r() * 1.5;
        const h = 0.8 + r() * 0.8;
        const c = hexRgb('#9A9490');
        const pts: [number, number][] = [[x - w, y], [x - w * 0.6, y - h], [x + w * 0.4, y - h * 1.1], [x + w, y]];
        poly(ctx, fill(c), pts);
        poly(ctx, fill(light(c, 0.4)), [[x - w, y], [x - w * 0.6, y - h], [x - w * 0.1, y - h * 1.05], [x - w * 0.3, y]]);
        inkPath(ctx, pts, 0.4, 0.6 - hz, true);
        if (D.meteo.snow) fillRect(ctx, SNOW, x - w * 0.6, y - h * 1.1, w, 0.5);
      }
      return;
    }
    case 'wall': {
      // Muret de pierre d'un jardin en terrasses : face claire, ombre dessous, trait ; neige sur le chaperon.
      ctx.lineCap = 'round';
      ctx.strokeStyle = fill(shade(STONE, 0.35));
      ctx.lineWidth = 2.2;
      strokePts(ctx, v.pts!, 1.2);
      ctx.strokeStyle = fill(STONE);
      ctx.lineWidth = 1.6;
      strokePts(ctx, v.pts!);
      ctx.strokeStyle = ink(0.6 - hz);
      ctx.lineWidth = 0.4;
      strokePts(ctx, v.pts!, 2);
      if (D.meteo.snow) {
        ctx.strokeStyle = 'rgba(240,244,248,0.92)';
        ctx.lineWidth = 0.8;
        strokePts(ctx, v.pts!, -0.8);
      }
      ctx.lineCap = 'butt';
      return;
    }
    case 'kiosk': {
      // Kiosque à musique : socle, poteaux, toit à pans (la fanfare du dimanche est animée : PR 2b).
      const x = v.x!;
      const y = v.y!;
      poly(ctx, fill(shade(STONE, 0.3)), [[x - 6, y + 1.5], [x + 6, y + 1.5], [x + 5, y + 3], [x - 5, y + 3]]);
      fillRect(ctx, fill(STONE), x - 5.5, y - 0.5, 11, 2);
      ctx.strokeStyle = ink(0.8 - hz);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (const px of [-4.5, -1.5, 1.5, 4.5]) {
        ctx.moveTo(x + px, y - 0.5);
        ctx.lineTo(x + px, y - 6);
      }
      ctx.stroke();
      poly(ctx, fill(hexRgb('#5A8A80')), [[x - 6.5, y - 6], [x, y - 10], [x + 6.5, y - 6]]);
      poly(ctx, fill(light(hexRgb('#5A8A80'), 0.4)), [[x - 6.5, y - 6], [x, y - 10], [x - 1, y - 6]]);
      inkPath(ctx, [[x - 6.5, y - 6], [x, y - 10], [x + 6.5, y - 6]], 0.6, 0.85 - hz, true);
      fillRect(ctx, ink(0.8 - hz), x - 0.3, y - 11.5, 0.6, 1.5);
      inkPath(ctx, [[x - 5.5, y - 0.5], [x + 5.5, y - 0.5], [x + 5.5, y + 1.5], [x - 5.5, y + 1.5]], 0.5, 0.7 - hz, true);
      if (D.meteo.snow) poly(ctx, SNOW, [[x - 6.5, y - 6], [x, y - 10], [x + 6.5, y - 6], [x + 6.5, y - 7.2], [x, y - 11], [x - 6.5, y - 7.2]]);
      return;
    }
    case 'fountain': {
      // Fontaine du square : bassin de pierre, en eau du 15 mars au 15 novembre (le jet est animé : PR 2b).
      const x = v.x!;
      const y = v.y!;
      const on = fountainOn(D);
      ctx.fillStyle = fill(shade(STONE, 0.3));
      ctx.beginPath();
      ctx.ellipse(x, y + 0.6, 5.2, 2.2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = fill(STONE);
      ctx.beginPath();
      ctx.ellipse(x, y, 5, 2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = on ? fill(hexRgb('#7FB4E0')) : fill(shade(STONE, 0.45));
      ctx.beginPath();
      ctx.ellipse(x, y, 3.6, 1.3, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = ink(0.7 - hz);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.ellipse(x, y, 5, 2, 0, 0, TAU);
      ctx.stroke();
      fillRect(ctx, fill(STONE), x - 0.6, y - 3, 1.2, 3);
      if (D.meteo.snow) {
        ctx.fillStyle = SNOW;
        ctx.beginPath();
        ctx.ellipse(x, y - 0.4, 4.6, 1.2, 0, Math.PI, 0);
        ctx.fill();
      }
      return;
    }
    case 'lawn': {
      const g = D.season === 'winter' ? mixRgb(GRASS, hexRgb('#9A9A80'), 0.4) : light(hexRgb(TONES.summer[1]), 0.25);
      const pts: [number, number][] = [[v.x! + 2, v.y!], [v.x! + v.w!, v.y! + 1], [v.x! + v.w! - 2, v.y! + v.h!], [v.x!, v.y! + v.h! - 1]];
      poly(ctx, fill(g), pts);
      inkPath(ctx, pts, 0.5, 0.6 - hz, true);
      ctx.strokeStyle = fill(haze(ROAD, 0.1));
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(v.x! + v.w! * 0.5, v.y!);
      ctx.quadraticCurveTo(v.x! + v.w! * 0.3, v.y! + v.h! * 0.6, v.x! + v.w! * 0.55, v.y! + v.h!);
      ctx.stroke();
      paintBouquetModel(ctx, lawnBouquet(v), 'b' + key + 'sq', hz, D);
      return;
    }
    case 'vineyard': {
      const soil = fill(mixRgb(hexRgb('#B89A6A'), GRASS, 0.45));
      const tones = f.tones;
      const leaf = f.d > 0.15 ? [mixRgb(tones[0]!, hexRgb('#3A7A38'), 0.3), mixRgb(tones[1]!, hexRgb('#62A848'), 0.3)] : null;
      const sl = v.slant!;
      poly(ctx, soil, [[v.x!, v.y!], [v.x! + v.w!, v.y! - sl * 4], [v.x! + v.w!, v.y! + v.h! - sl * 4], [v.x!, v.y! + v.h!]]);
      for (let r = 2; r < v.h! - 1; r += 3.2) {
        const y = v.y! + r;
        ctx.strokeStyle = ink(0.45 - hz);
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(v.x! + 1, y);
        ctx.lineTo(v.x! + v.w! - 1, y - sl * 4);
        ctx.stroke();
        for (let x = v.x! + 2; x < v.x! + v.w! - 1; x += 2.8) {
          const yy = y - sl * 4 * ((x - v.x!) / v.w!);
          if (leaf) {
            disc(ctx, fill(leaf[0]!), x, yy - 0.5, 0.85 * (0.6 + 0.4 * f.d));
            disc(ctx, fill(leaf[1]!), x - 0.3, yy - 0.8, 0.5);
          } else fillRect(ctx, ink(0.7 - hz), x - 0.25, yy - 1.6, 0.5, 1.6);
        }
      }
      inkPath(ctx, [[v.x!, v.y!], [v.x! + v.w!, v.y! - sl * 4], [v.x! + v.w!, v.y! + v.h! - sl * 4], [v.x!, v.y! + v.h!]], 0.5, 0.5 - hz, true);
      return;
    }
    case 'garden': {
      // Potager : rangs de terre, légumes verts de mai à mi-novembre, clôture de piquets.
      const w = v.w!;
      const y = v.y!;
      const soil = fill(hexRgb('#A8865E'));
      fillRect(ctx, fill(mixRgb(GRASS, hexRgb('#A8865E'), 0.35)), v.x!, y - 6 * s, w, 6 * s);
      for (let k = 0; k < 3; k++) {
        const yy = y - 5 * s + k * 1.8 * s;
        fillRect(ctx, soil, v.x! + 1, yy, w - 2, 0.7 * s);
        if (D.doy >= 120 && D.doy < 320 && k < 2) for (let x = v.x! + 2; x < v.x! + w - 1.5; x += 1.8 * s) disc(ctx, fill(hexRgb(TONES.summer[k === 0 ? 1 : 2])), x, yy - 0.2, 0.55 * s);
      }
      ctx.strokeStyle = ink(0.7 - hz);
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      for (let x = v.x!; x <= v.x! + w; x += 1.6 * s) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 1.6 * s);
      }
      ctx.moveTo(v.x!, y - 1 * s);
      ctx.lineTo(v.x! + w, y - 1 * s);
      ctx.stroke();
      return;
    }
    default:
      return;
  }
}
const GOODS: Record<FondMoment['season'], readonly string[]> = { spring: ['#6AB04A', '#F6C62E', '#E8456B', '#FFFFFF'], summer: ['#E03A3A', '#F0C040', '#6AB04A', '#F0609A'], autumn: ['#E08A30', '#A05A2A', '#D8B050', '#8A5A3A'], winter: ['#8A8A70', '#E8E0C8', '#A05A2A', '#6A8A48'] };

// ── Échappée ──
export function roadPoint(e: Escape, d: number): { x: number; y: number; dir: number } {
  for (const s of e.segs) if (d <= s.s0 + s.l) {
    const t = (d - s.s0) / s.l;
    return { x: s.ax + (s.bx - s.ax) * t, y: s.ay + (s.by - s.ay) * t, dir: Math.sign(s.bx - s.ax) || 1 };
  }
  const s = e.segs[e.segs.length - 1]!;
  return { x: s.bx, y: s.by, dir: Math.sign(s.bx - s.ax) || 1 };
}
// Route en lacets, verdure basse de l'échappée, voitures garées, escalier, moulin, mâts des réverbères (éteints : PR 2b),
// voie du funiculaire et gares (sans cabines : PR 2b).
export function paintEscape(ctx: PaintCtx, e: Escape, D: FondMoment, T: number, seed: number): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(haze(shade(ROAD, 0.45), 0.2), 1);
  ctx.lineWidth = 4.6;
  strokePts(ctx, e.road, 0.9);
  ctx.strokeStyle = rgba(haze(ROAD, 0.2), 1);
  ctx.lineWidth = 3.6;
  strokePts(ctx, e.road);
  ctx.strokeStyle = rgba(haze(light(ROAD, 0.5), 0.2), 1);
  ctx.lineWidth = 0.7;
  strokePts(ctx, e.road, -1.3);
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  for (const v of e.verdure) if (!isTree(v)) paintVerdure(ctx, v, 0.2, D, T);
  paintParked(ctx, e, D, seed);
  paintStairs(ctx, e.stairs, D);
  if (e.mill) paintMill(ctx, e.mill, D);
  for (const l of e.lamps) {
    const p = roadPoint(e, l.d);
    ctx.strokeStyle = ink(0.7);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y - 4);
    ctx.lineTo(p.x + 1, p.y - 4);
    ctx.stroke();
  }
  const f = e.funi;
  ctx.strokeStyle = rgba(haze(STONE, 0.25), 1);
  ctx.lineWidth = 8;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(f.x0, f.y0);
  ctx.lineTo(f.x1, f.y1);
  ctx.stroke();
  ctx.strokeStyle = ink(0.5);
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  for (const o of [-FUNI_GAP - 1, -FUNI_GAP + 1, FUNI_GAP - 1, FUNI_GAP + 1]) {
    ctx.moveTo(f.x0 + o, f.y0);
    ctx.lineTo(f.x1 + o, f.y1);
  }
  ctx.stroke();
  // Gares : halle au-delà du bout de voie, quai de pierre (les cabines y restent visibles à quai).
  for (const [sx, sy, hz, up] of [[f.x0, f.y0 + 8, 0.14, false], [f.x1, f.y1 - 8, 0.3, true]] as const) {
    const c = haze(STONE, hz);
    poly(ctx, shade(c, 0.25), up ? [[sx - 10, sy + 9], [sx - 7, sy], [sx + 7, sy], [sx + 10, sy + 9]] : [[sx - 9, sy - 8], [sx + 9, sy - 8], [sx + 7, sy - 5], [sx - 7, sy - 5]]);
    fillRect(ctx, c, sx - 6, sy - 6, 12, 6);
    fillRect(ctx, shade(c, 0.3), sx + 2, sy - 6, 4, 6);
    const roof: [number, number][] = [[sx - 7, sy - 6], [sx, sy - 9.5], [sx + 7, sy - 6]];
    poly(ctx, haze(hexRgb('#C25E44'), hz), roof);
    inkPath(ctx, roof, 0.6, 0.8, true);
    if (D.meteo.snow) poly(ctx, SNOW, [[sx - 7, sy - 6], [sx, sy - 9.5], [sx + 7, sy - 6], [sx + 7, sy - 6.8], [sx, sy - 10.3], [sx - 7, sy - 6.8]]);
    fillRect(ctx, ink(0.7), sx - 2, sy - 4.5, 4, 3.2);
    inkPath(ctx, [[sx - 6, sy - 6], [sx + 6, sy - 6], [sx + 6, sy], [sx - 6, sy]], 0.6, 0.8, true);
  }
}
// Escalier de Montmartre : deux rampes, marches tous les 2,4 px, trois réverbères (éteints), neige sur les marches.
function paintStairs(ctx: PaintCtx, st: Escape['stairs'], D: FondMoment): void {
  const dx = st.x1 - st.x0;
  const dy = st.y1 - st.y0;
  const L = Math.hypot(dx, dy);
  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy;
  const ny = ux;
  ctx.strokeStyle = rgba(haze(STONE, 0.25), 1);
  ctx.lineWidth = 4;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(st.x0, st.y0);
  ctx.lineTo(st.x1, st.y1);
  ctx.stroke();
  ctx.strokeStyle = ink(0.55);
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  for (let d = 0; d < L; d += 2.4) {
    const x = st.x0 + ux * d;
    const y = st.y0 + uy * d;
    ctx.moveTo(x - nx * 1.8, y - ny * 1.8);
    ctx.lineTo(x + nx * 1.8, y + ny * 1.8);
  }
  ctx.stroke();
  if (D.meteo.snow) {
    ctx.strokeStyle = 'rgba(240,244,248,0.9)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let d = 0; d < L; d += 2.4) {
      const x = st.x0 + ux * d;
      const y = st.y0 + uy * d;
      ctx.moveTo(x - nx * 1.6, y - ny * 1.6 - 0.5);
      ctx.lineTo(x + nx * 1.6, y + ny * 1.6 - 0.5);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = ink(0.8);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (const o of [-2.4, 2.4]) {
    ctx.moveTo(st.x0 + nx * o, st.y0 + ny * o - 2.2);
    ctx.lineTo(st.x1 + nx * o, st.y1 + ny * o - 2.2);
  }
  ctx.stroke();
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (let d = 0; d < L; d += 7) for (const o of [-2.4, 2.4]) {
    const x = st.x0 + ux * d + nx * o;
    const y = st.y0 + uy * d + ny * o;
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 2.2);
  }
  ctx.stroke();
  for (const q of [0.2, 0.5, 0.8]) {
    const x = st.x0 + ux * L * q + nx * 3.2;
    const y = st.y0 + uy * L * q + ny * 3.2;
    ctx.strokeStyle = ink(0.75);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 4.5);
    ctx.lineTo(x + 0.8, y - 4.5);
    ctx.stroke();
  }
}
// Voitures et vélos garés le long de la route (tirage du jour : le stationnement change chaque jour).
function paintParked(ctx: PaintCtx, e: Escape, D: FondMoment, seed: number): void {
  const r = fondRng(seed, `stationnement-${e.band}`, D.date);
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const d = e.L * (0.22 + r() * 0.55);
    const p = roadPoint(e, d);
    const q = roadPoint(e, d + 2);
    const ang = Math.atan2(q.y - p.y, q.x - p.x);
    const nx = -Math.sin(ang) * 2.6;
    const ny = Math.cos(ang) * 2.6;
    const bike = r() < 0.3;
    const c = haze(pick(CARS, r), 0.15);
    const x = p.x + nx * (ny < 0 ? 1 : -1);
    const y = p.y + Math.abs(ny) * -1;
    if (bike) {
      ctx.strokeStyle = ink(0.8);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x - 0.2, y - 0.4);
      ctx.arc(x - 0.9, y - 0.4, 0.7, 0, TAU);
      ctx.moveTo(x + 1.6, y - 0.4);
      ctx.arc(x + 0.9, y - 0.4, 0.7, 0, TAU);
      ctx.moveTo(x - 0.9, y - 0.4);
      ctx.lineTo(x, y - 1.6);
      ctx.lineTo(x + 0.9, y - 0.4);
      ctx.stroke();
      continue;
    }
    // Voiture tournée selon la route : coins calculés (pas de transformation dans le peintre).
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const rect = (c2: Rgb | string, rx: number, ry: number, w: number, h: number): void =>
      poly(ctx, c2, [[rx, ry], [rx + w, ry], [rx + w, ry + h], [rx, ry + h]].map(([u, v]) => [x + u! * ca - v! * sa, y + u! * sa + v! * ca] as [number, number]));
    rect(c, -2, -2.2, 4, 2);
    rect(shade(c, 0.35), 0.4, -2.2, 1.6, 2);
    rect(light(c, 0.5), -1, -2.8, 2, 0.7);
    rect(ink(0.8), -1.6, -0.4, 1, 0.6);
    rect(ink(0.8), 0.6, -0.4, 1, 0.6);
  }
}
// Moulin (tour, toit) ; les ailes tournent au vent dans le calque de la vie du fond (fond-vie.ts, fond-life.tsx).
function paintMill(ctx: PaintCtx, m: NonNullable<Escape['mill']>, D: FondMoment): void {
  const { x, y, s } = m;
  const hz = 0.34;
  const c = haze(hexRgb('#E8DCC0'), hz);
  poly(ctx, c, [[x - 4 * s, y], [x - 3 * s, y - 12 * s], [x + 3 * s, y - 12 * s], [x + 4 * s, y]]);
  poly(ctx, shade(c, 0.3), [[x + 1.5 * s, y], [x + 1.8 * s, y - 12 * s], [x + 3 * s, y - 12 * s], [x + 4 * s, y]]);
  const roof: [number, number][] = [[x - 4 * s, y - 12 * s], [x, y - 16 * s], [x + 4 * s, y - 12 * s]];
  poly(ctx, haze(hexRgb('#5A6A84'), hz), roof);
  inkPath(ctx, roof, 0.6, 0.85 - hz, true);
  fillRect(ctx, ink(0.7 - hz), x - 0.8 * s, y - 3 * s, 1.6 * s, 3 * s);
  fillRect(ctx, haze(GLASS_FAR, 0.4), x - 0.7 * s, y - 8 * s, 1.4 * s, 1.6 * s);
  inkPath(ctx, [[x - 4 * s, y], [x - 3 * s, y - 12 * s], [x + 3 * s, y - 12 * s], [x + 4 * s, y]], 0.6, 0.8 - hz, true);
  if (D.meteo.snow) poly(ctx, SNOW, [[x - 4 * s, y - 12 * s], [x, y - 16 * s], [x + 4 * s, y - 12 * s], [x + 4 * s, y - 12.8 * s], [x, y - 16.8 * s], [x - 4 * s, y - 12.8 * s]]);
}
export function paintReservoir(ctx: PaintCtx, r: { x: number; y: number; s: number; hz: number }, D: FondMoment): void {
  const { x, y, s, hz } = r;
  const c = haze(STONE, hz);
  ctx.strokeStyle = ink(0.75 - hz);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (const o of [-3, 3]) {
    ctx.moveTo(x + o * s, y);
    ctx.lineTo(x + o * s * 0.7, y - 9 * s);
  }
  ctx.moveTo(x - 2.5 * s, y - 4 * s);
  ctx.lineTo(x + 2.5 * s, y - 4 * s);
  ctx.stroke();
  fillRect(ctx, c, x - 4.5 * s, y - 15 * s, 9 * s, 6 * s);
  fillRect(ctx, shade(c, 0.3), x + 1.5 * s, y - 15 * s, 3 * s, 6 * s);
  fillRect(ctx, light(c, 0.4), x - 4.5 * s, y - 15 * s, 1 * s, 6 * s);
  const roof: [number, number][] = [[x - 5 * s, y - 15 * s], [x, y - 18 * s], [x + 5 * s, y - 15 * s]];
  poly(ctx, haze(hexRgb('#8290A2'), hz), roof);
  inkPath(ctx, roof, 0.6, 0.85 - hz, true);
  ctx.strokeStyle = ink(0.8 - hz);
  ctx.lineWidth = 0.6;
  ctx.strokeRect(x - 4.5 * s, y - 15 * s, 9 * s, 6 * s);
  if (D.meteo.snow) poly(ctx, SNOW, [[x - 5 * s, y - 15 * s], [x, y - 18 * s], [x + 5 * s, y - 15 * s], [x + 5 * s, y - 15.8 * s], [x, y - 18.8 * s], [x - 5 * s, y - 15.8 * s]]);
}
// Chapelle secondaire sur la crête : nef, clocher à flèche, croix ; neige sur les toits.
export function paintChapel(ctx: PaintCtx, ch: { x: number; y: number; s: number; hz: number }, D: FondMoment): void {
  const { x, y, s, hz } = ch;
  const c = haze(STONE, hz);
  const rc = haze(hexRgb('#5A6A84'), hz);
  fillRect(ctx, c, x - 9 * s, y - 8 * s, 16 * s, 8 * s);
  fillRect(ctx, shade(c, 0.3), x + 2 * s, y - 8 * s, 5 * s, 8 * s);
  const nef: [number, number][] = [[x - 10 * s, y - 8 * s], [x - 1 * s, y - 12.5 * s], [x + 8 * s, y - 8 * s]];
  poly(ctx, rc, nef);
  inkPath(ctx, nef, 0.6, 0.85 - hz, true);
  fillRect(ctx, c, x + 7 * s, y - 18 * s, 5 * s, 18 * s);
  fillRect(ctx, shade(c, 0.3), x + 10 * s, y - 18 * s, 2 * s, 18 * s);
  const spire: [number, number][] = [[x + 6 * s, y - 18 * s], [x + 9.5 * s, y - 26 * s], [x + 13 * s, y - 18 * s]];
  poly(ctx, rc, spire);
  inkPath(ctx, spire, 0.6, 0.85 - hz, true);
  fillRect(ctx, ink(0.85 - hz), x + 9.2 * s, y - 29 * s, 0.6, 3 * s);
  fillRect(ctx, ink(0.85 - hz), x + 8.4 * s, y - 28.2 * s, 2.2 * s, 0.6);
  fillRect(ctx, shade(c, 0.55), x + 8.5 * s, y - 16 * s, 2 * s, 3 * s);
  ctx.fillStyle = rgba(shade(c, 0.5), 1);
  for (let k = 0; k < 2; k++) {
    ctx.beginPath();
    ctx.arc(x - 6 * s + k * 5 * s, y - 4 * s, 1 * s, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x - 7 * s + k * 5 * s, y - 4 * s, 2 * s, 3 * s);
  }
  ctx.strokeStyle = ink(0.8 - hz);
  ctx.lineWidth = 0.6;
  ctx.strokeRect(x - 9 * s, y - 8 * s, 16 * s, 8 * s);
  ctx.strokeRect(x + 7 * s, y - 18 * s, 5 * s, 18 * s);
  if (D.meteo.snow) poly(ctx, SNOW, [[x - 10 * s, y - 8 * s], [x - 1 * s, y - 12.5 * s], [x + 8 * s, y - 8 * s], [x + 8 * s, y - 10 * s], [x - 1 * s, y - 13.5 * s], [x - 10 * s, y - 10 * s]]);
}

// ── Maisons : corps (hill-painter.ts), puis terrasse (parasol), bouquet et linge tendu de la maison à son bouquet.
export function paintFondHouse(ctx: PaintCtx, h: FondHouse | HillHouse, D: FondMoment, T: number, seed: number): void {
  paintHillHouse(ctx, h);
  const fh = h as Partial<FondHouse>;
  const { x, w, s, haze: hz, base, top } = h;
  if (fh.terrace) {
    const ty = h.kind === 'hip' ? top : top + 1;
    const tx = fh.terrace.x;
    const k = parasolK(T, D, fh.terrace.x);
    disc(ctx, haze(hexRgb('#3F8A3A'), hz), tx - 2.5 * s, ty - 0.6 * s, 1.1 * s);
    disc(ctx, haze(hexRgb('#56A844'), hz), tx + 3 * s, ty - 0.6 * s, 0.9 * s);
    fillRect(ctx, ink(0.8 - hz), tx - 0.3, ty - 5 * s, 0.6, 5 * s);
    const pc = haze(fh.terrace.color, hz);
    const r = lerp(0.9, 3.6, smooth(k)) * s;
    ctx.fillStyle = rgba(pc, 1);
    ctx.beginPath();
    ctx.moveTo(tx - r, ty - 4.2 * s);
    ctx.quadraticCurveTo(tx, ty - 4.2 * s - r * 0.9 - 0.4 * s, tx + r, ty - 4.2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ink(0.8 - hz);
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  if (h.trees && fh.key) {
    const m = houseBouquet(h as FondHouse)!;
    paintBouquetModel(ctx, m, 'b' + fh.key, hz, D);
    const rl = hillLaundry(T, D, fh.key, seed);
    if (rl) {
      const ly = base - 7 * s;
      const lx0 = x + w;
      const lx1 = h.trees.x - h.trees.r * 0.6;
      if (lx1 - lx0 > 4 * s) {
        inkPath(ctx, [[lx0, ly], [lx1, ly + 0.5]], 0.4, 0.7 - hz);
        for (let i = 0, n = Math.floor((lx1 - lx0) / (2 * s)); i < n && i < 4; i++) fillRect(ctx, haze(pick(CLOTH, rl), hz), lx0 + 0.8 * s + i * 2 * s, ly + 0.2, 1.2 * s, (1.4 + rl() * 0.8) * s);
      }
    }
  }
}

// ── Fond complet d'une tranche [x0, x1] : ordre des calques de la scène de la maquette (sol, arbres de crête, rang de crête,
// puis pour chaque rang ses maisons et repères, et la verdure du rang devant).
// Ce que la tranche [x0, x1] peint du fond : tout élément dont la boîte touche la tranche (± 2 px). Deux tranches voisines
// peignent donc toutes deux, dans le même ordre, ce qui est à cheval sur leur bord (raccord).
export type FondTile = { crest: FondItem[]; escapes: Escape[]; chapels: Chapel[]; reservoirs: Chapel[]; crestHouses: FondHouse[]; houses: HillHouse[]; rows: [FondItem[], FondItem[]] };
export function fondTile(plan: CityPaintPlan, x0: number, x1: number): FondTile {
  const F = plan.fond;
  const lo = x0 - 2;
  const hi = x1 + 2;
  const inTile = (v: FondItem): boolean => !v.b || (v.b[2] >= lo && v.b[0] <= hi);
  const houseIn = (h: { x: number; w: number; s: number; trees: { x: number; r: number } | null }): boolean => {
    const m = h.trees ? houseBouquet(h as FondHouse) : null;
    const a = Math.min(h.x - 2 * h.s - 1, m ? m.box.x0 : Infinity);
    const b = Math.max(h.x + h.w + 2 * h.s + 1, m ? m.box.x1 : -Infinity, h.x + h.w + 3);
    return b >= lo && a <= hi;
  };
  return {
    crest: F.crestVerdure.filter(inTile),
    escapes: F.escapes.filter((e) => e.span[1] >= lo && e.span[0] <= hi),
    chapels: F.chapels.filter((ch) => ch.x + 14 >= lo && ch.x - 10 <= hi),
    reservoirs: F.reservoirs.filter((r) => r.x + 6 >= lo && r.x - 6 <= hi),
    crestHouses: F.crestHouses.filter(houseIn),
    houses: plan.hill.houses.filter(houseIn),
    rows: [F.rowVerdure[0].filter(inTile), F.rowVerdure[1].filter(inTile)],
  };
}

// ── Fond complet d'une tranche [x0, x1] : ordre des calques de la scène de la maquette (sol, arbres de crête, rang de crête,
// puis pour chaque rang ses maisons et repères, et la verdure du rang devant).
export function paintFond(ctx: PaintCtx, plan: CityPaintPlan, x0: number, x1: number, D: FondMoment, landmarks: readonly Landmark[]): void {
  const T = slotHours(D.minutes);
  const it = fondTile(plan, x0, x1);
  paintFondGround(ctx, plan, x0, x1, D);
  for (const v of it.crest) if (!isTree(v)) paintVerdure(ctx, v, 0, D, T);
  for (const e of it.escapes) paintEscape(ctx, e, D, T, plan.seed);
  for (const ch of it.chapels) paintChapel(ctx, ch, D);
  for (const r of it.reservoirs) paintReservoir(ctx, r, D);
  for (const v of it.crest) if (isTree(v)) paintVerdure(ctx, v, 0, D, T);
  for (const h of it.crestHouses) paintFondHouse(ctx, h, D, T, plan.seed);
  for (let row = 0; row < HILL_ROWS.length; row++) {
    for (const h of it.houses) if (h.row === row) paintFondHouse(ctx, h, D, T, plan.seed);
    for (const e of it.escapes) for (const h of e.houses) if (h.row === row) paintFondHouse(ctx, h, D, T, plan.seed);
    for (const l of landmarks) if (Math.abs(l.base - plan.height * HILL_ROWS[row]!.y) < 1e-6) paintLandmark(ctx, l, HILL_ROWS[row]!.haze);
    if (row < 2) {
      const list = it.rows[row as 0 | 1];
      for (const v of list) if (!v.behind) paintVerdure(ctx, v, 0, D, T);
      for (const v of list) if (v.behind) paintVerdure(ctx, v, 0, D, T);
      if (row === 1) for (const e of it.escapes) for (const v of e.verdure) if (isTree(v)) paintVerdure(ctx, v, 0.2, D, T);
    }
  }
}

// États lents de la tranche (clé de cache) : ce qui change dans la journée et que la tranche peint. Deux instants qui
// donnent la même chaîne donnent la même image.
export function fondStates(plan: CityPaintPlan, x0: number, x1: number, D: FondMoment): string {
  const F = plan.fond;
  const T = slotHours(D.minutes);
  const lo = x0 - 2;
  const hi = x1 + 2;
  const out: (string | number)[] = [];
  const inBox = (b: readonly number[] | undefined): boolean => !b || (b[2]! >= lo && b[0]! <= hi);
  const items = (list: readonly FondItem[]): void => {
    for (const v of list) {
      if (!inBox(v.b)) continue;
      if (v.kind === 'market') for (let i = 0; i < v.stalls!; i++) out.push(marketK(T, D, i));
      else if (v.kind === 'poulailler') out.push(hensOut(T, D) ? 1 : 0);
      else if (v.kind === 'petanque') out.push(boulesOut(T, D) ? 1 : 0);
    }
  };
  items(F.crestVerdure);
  for (const list of F.rowVerdure) items(list);
  for (const e of F.escapes) if (e.span[1] >= lo && e.span[0] <= hi) items(e.verdure);
  for (const h of plan.hill.houses as FondHouse[]) {
    if (h.x + h.w + 30 < lo || h.x - 30 > hi) continue;
    if (h.terrace) out.push(Math.round(parasolK(T, D, h.terrace.x) * 100));
    if (h.trees && h.key) out.push(hillLaundry(T, D, h.key, plan.seed) ? 1 : 0);
  }
  return out.join('');
}
