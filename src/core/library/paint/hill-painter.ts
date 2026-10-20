import { SHADOW_K, TAU, disc, fillRect, ink, light, poly, shade } from './cel';
import { FAR_FLOOR, FAR_HAZE, hillCrestY, type CityPaintPlan, type HillHouse, type Landmark, type PaintBuilding } from './city-plan';
import { hexRgb, mixRgb, rgba, type Rgb } from './color';
import { CLOTH } from './fond-plan';
import { DEFAULT_MOMENT, foliageOf, fondRng, laundryK, shutterK, slotHours, type FondMoment } from './fond-time';
import type { PaintCtx } from './paint-ctx';
import { GROUND_FLOOR } from '../city/metrics';

// Fond de la ville peinte (vague Ghibli, décor cellulo) : colline verte, rangs de maisons empilées (toits terracotta,
// lucarnes, cheminées, bouquets d'arbres), tour-horloge et dômes, puis le mur du fond existant redessiné en
// quatrième rang. Tout est en aplats cernés ; la brume (`haze`) éclaircit et bleuit avec la distance. Aucun tirage ici :
// le plan a tout décidé, le dessin est donc identique d'une tranche à l'autre.
const HAZE = hexRgb('#9CC0E4');
const GRASS = hexRgb('#5E9A50');
const STONE = hexRgb('#EAD6B0');
const SPIRE = hexRgb('#4E6A78');
const DOME_C = hexRgb('#5A8A80');
const BRICK = hexRgb('#C2724E');
const GLASS_FAR = hexRgb('#5A7AA8');
const haze = (c: Rgb, t: number): Rgb => mixRgb(c, HAZE, t);

export function paintHillGround(ctx: PaintCtx, plan: CityPaintPlan, x0: number, x1: number): void {
  const a = x0 - 4;
  const b = x1 + 4;
  const crest = (x: number): number => hillCrestY(plan, x);
  ctx.fillStyle = rgba(haze(GRASS, 0.35), 1);
  ctx.beginPath();
  ctx.moveTo(a, plan.ground);
  for (let x = a; x < b; x += 4) ctx.lineTo(x, crest(x));
  ctx.lineTo(b, crest(b));
  ctx.lineTo(b, plan.ground);
  ctx.closePath();
  ctx.fill();
  // Rehaut net le long de la crête (soleil) : bande de 3 px sous la ligne.
  ctx.fillStyle = rgba(haze(light(GRASS, 0.4), 0.3), 1);
  ctx.beginPath();
  ctx.moveTo(a, crest(a) + 3);
  for (let x = a; x < b; x += 4) ctx.lineTo(x, crest(x));
  ctx.lineTo(b, crest(b));
  ctx.lineTo(b, crest(b) + 3);
  for (let x = b; x > a; x -= 4) ctx.lineTo(x, crest(x) + 3);
  ctx.closePath();
  ctx.fill();
}

export function paintHillHouse(ctx: PaintCtx, h: HillHouse): void {
  const { x, w, s, haze: hz, base, top } = h;
  const rh = h.h * 0.32;
  const wall = haze(h.wall, hz);
  const rc = haze(h.roof, hz);
  // Mur : aplat, ombre nette à droite, ombre sous le toit.
  fillRect(ctx, wall, x, top + rh, w, h.h - rh + 2);
  fillRect(ctx, shade(wall, 0.3), x + w * 0.7, top + rh, w * 0.3, h.h - rh + 2);
  // Toit.
  const o = 1.5 * s;
  const pts: [number, number][] =
    h.kind === 'gable'
      ? [[x - o, top + rh], [x + w / 2, top], [x + w + o, top + rh]]
      : h.kind === 'hip'
        ? [[x - o, top + rh], [x + w * 0.25, top], [x + w * 0.75, top], [x + w + o, top + rh]]
        : [[x - o, top + rh], [x + o, top + 1], [x + w - o, top + 1], [x + w + o, top + rh]];
  poly(ctx, rc, pts);
  ctx.save();
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.clip();
  fillRect(ctx, light(rc, 0.35), x - o, top, w * 0.5 + o, rh);
  fillRect(ctx, shade(rc, 0.35), x + w * 0.72, top, w * 0.28 + o, rh);
  ctx.restore();
  // Trait du toit un peu plus ferme que celui du mur (tâche 15 : la maison visitée par le père Noël se lisait mal la nuit).
  ctx.strokeStyle = ink(0.95 - hz);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.stroke();
  // Rehaut net du faîte (le soleil vient du haut à gauche) : sur le faîte plat des croupes et mansardes, sur le versant
  // gauche des pignons.
  ctx.strokeStyle = rgba(light(rc, 0.55), 0.9);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0] + 0.4, pts[0]![1] - 0.4);
  ctx.lineTo(pts[1]![0], pts[1]![1] + 0.5);
  if (pts.length === 4) ctx.lineTo(pts[2]![0], pts[2]![1] + 0.5);
  ctx.stroke();
  fillRect(ctx, shade(wall, 0.42), x, top + rh, w, 2 * s);
  // Lucarnes et cheminée.
  if (h.dormers) {
    for (let dx = x + 4 * s; dx < x + w - 5 * s; dx += 8 * s) {
      fillRect(ctx, light(rc, 0.5), dx, top + rh * 0.45, 3 * s, rh * 0.5);
      fillRect(ctx, shade(wall, 0.5), dx + 0.6 * s, top + rh * 0.55, 1.8 * s, rh * 0.38);
    }
  }
  if (h.chimney !== null) {
    // Mêmes coordonnées que `chimneyHole` / `hillChimneyTop` (city/santa.ts : le père Noël y descend, les mouettes s'y
    // posent) : seul l'aspect change — brique un ton plus sombre, face droite à l'ombre, trait encré, couronnement.
    const cx = x + w * h.chimney;
    const cy = top - 4 * s + rh * 0.4;
    const brick = haze(shade(BRICK, 0.12), hz);
    fillRect(ctx, brick, cx, cy, 3 * s, 6 * s);
    fillRect(ctx, shade(brick, 0.38), cx + 2 * s, cy, s, 6 * s);
    ctx.strokeStyle = ink(0.9 - hz);
    ctx.lineWidth = 0.6;
    ctx.strokeRect(cx, cy, 3 * s, 6 * s);
    fillRect(ctx, ink(0.7 - hz), cx - 0.4, cy, 3.8 * s, 0.8);
  }
  // Fenêtres (bleutées ; le fond n'a pas de fenêtres allumées).
  ctx.fillStyle = rgba(haze(GLASS_FAR, hz + 0.2), 1);
  for (let wy = top + rh + 4 * s; wy + 5 * s < base; wy += 9 * s) for (let wx = x + 3 * s; wx + 4 * s < x + w - 2 * s; wx += 7 * s) ctx.fillRect(wx, wy, 3.2 * s, 4.5 * s);
  ctx.strokeStyle = ink(0.8 - hz);
  ctx.lineWidth = 0.6;
  ctx.strokeRect(x, top + rh, w, h.h - rh + 2);
  // Le bouquet de la maison est peint par le fond vivant (fond-painter.ts : modèle à squelette fixe, saison), plus en boules.
}

export function paintLandmark(ctx: PaintCtx, l: Landmark, hz: number): void {
  const { x, s, base } = l;
  if (l.kind === 'tower') {
    const w = 14 * s;
    const h = 70 * s;
    const c = haze(STONE, hz);
    fillRect(ctx, c, x, base - h, w, h);
    fillRect(ctx, shade(c, 0.3), x + w * 0.65, base - h, w * 0.35, h);
    poly(ctx, haze(SPIRE, hz), [[x - 2 * s, base - h], [x + w / 2, base - h - 22 * s], [x + w + 2 * s, base - h]]);
    disc(ctx, haze(hexRgb('#D0583A'), hz), x + w / 2, base - h - 22 * s, 3 * s);
    // Cadran.
    disc(ctx, '#FFF8E0', x + w / 2, base - h + 12 * s, 4.5 * s);
    ctx.strokeStyle = ink(0.9);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(x + w / 2, base - h + 12 * s, 4.5 * s, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + w / 2, base - h + 12 * s);
    ctx.lineTo(x + w / 2, base - h + 9 * s);
    ctx.moveTo(x + w / 2, base - h + 12 * s);
    ctx.lineTo(x + w / 2 + 2.5 * s, base - h + 12 * s);
    ctx.stroke();
    for (let k = 0; k < 3; k++) {
      fillRect(ctx, shade(c, 0.5), x + w * 0.3, base - h + 24 * s + k * 12 * s, w * 0.18, 5 * s);
      fillRect(ctx, shade(c, 0.5), x + w * 0.6, base - h + 24 * s + k * 12 * s, w * 0.18, 5 * s);
    }
    ctx.strokeStyle = ink(0.8 - hz);
    ctx.lineWidth = 0.7;
    ctx.strokeRect(x, base - h, w, h);
    return;
  }
  const c = haze(STONE, hz);
  const dc = haze(DOME_C, hz);
  fillRect(ctx, c, x, base - 26 * s, 26 * s, 26 * s);
  fillRect(ctx, shade(c, 0.3), x + 17 * s, base - 26 * s, 9 * s, 26 * s);
  ctx.fillStyle = rgba(dc, 1);
  ctx.beginPath();
  ctx.arc(x + 13 * s, base - 26 * s, 13 * s, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = rgba(light(dc, 0.4), 1);
  ctx.beginPath();
  ctx.arc(x + 13 * s, base - 26 * s, 13 * s, Math.PI * 1.05, Math.PI * 1.45);
  ctx.lineTo(x + 13 * s, base - 26 * s);
  ctx.fill();
  fillRect(ctx, c, x + 12 * s, base - 44 * s, 2 * s, 6 * s);
  ctx.strokeStyle = ink(0.8 - hz);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(x + 13 * s, base - 26 * s, 13 * s, Math.PI, 0);
  ctx.stroke();
  ctx.strokeRect(x, base - 26 * s, 26 * s, 26 * s);
}

// Mur du fond (immeubles `far`, contigus) : quatrième rang de la colline, à peine brumeux. Hauteur et grille corrigées par le
// plan (farTops, city-plan.ts) : étages à bandeau, fenêtres sous l'égout (le calque SVG allume `lit` aux mêmes places),
// volets ouverts quand l'immeuble en a, ombre portée seulement d'un voisin mitoyen et sur un étage, et sous le haut du
// rez-de-chaussée une ruelle ou une cour en retrait (ton d'ombre, porches, pavés) : vue dans les fentes du premier plan.
// Fond vivant (PR 2a) : volets fermés ou ouverts selon l'heure (tranche de 10 min), linge tendu les jours secs, toit garni
// (terrasse végétalisée ou potager, verrière d'atelier, antenne râteau, souches de cheminée).
export function paintFarWall(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding, left: PaintBuilding | null, D: FondMoment = DEFAULT_MOMENT): void {
  const T = slotHours(D.minutes);
  const life = b.life;
  const hz = FAR_HAZE;
  const { x, w, top } = b;
  const eave = top + b.look.roofH;
  const bottom = plan.ground - GROUND_FLOOR;
  const h = bottom - eave;
  const wall = haze(b.look.wall, hz);
  const rc = haze(b.look.roof, hz);
  fillRect(ctx, wall, x, eave, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, eave, w, h);
  ctx.clip();
  fillRect(ctx, shade(wall, 0.28), x + w * 0.72, eave, w * 0.28, h);
  if (left && left.x + left.w >= x - 2 && left.top < top) {
    const y1 = Math.min(bottom, eave + FAR_FLOOR);
    const wa = Math.min(w * 0.45, SHADOW_K * (eave - left.top));
    const wb = Math.min(w * 0.45, SHADOW_K * (y1 - left.top));
    poly(ctx, shade(wall, 0.28), [[x, eave], [x + wa, eave], [x + wb, y1], [x, y1]]);
  }
  fillRect(ctx, light(wall, 0.4), x, eave, 1.2, h);
  // Bandeaux d'étage : ligne claire, ombre nette sous chaque plancher.
  for (let by = eave + FAR_FLOOR + 0.5; by < bottom - 1; by += FAR_FLOOR) {
    fillRect(ctx, light(wall, 0.5), x, by - 0.8, w, 0.8);
    fillRect(ctx, shade(wall, 0.38), x, by, w, 0.6);
  }
  // Fenêtres : linteau clair, vitre, volets ouverts de part et d'autre.
  const glass = haze(GLASS_FAR, 0.3);
  const sh = b.look.shutters ? haze(b.look.shutters, hz) : null;
  b.wins.forEach((v, i) => {
    fillRect(ctx, light(wall, 0.5), v.x - 0.6, v.y - 0.7, v.w + 1.2, 0.7);
    fillRect(ctx, glass, v.x, v.y, v.w, v.h);
    if (!sh) return;
    const wl = life?.wins[i];
    const k = wl ? shutterK(T, D, wl) : 0;
    if (k <= 0) {
      fillRect(ctx, sh, v.x - 0.8, v.y, 0.7, v.h);
      fillRect(ctx, shade(sh, 0.3), v.x + v.w + 0.1, v.y, 0.7, v.h);
    } else {
      // Battants qui se rabattent sur la vitre ; fermés, un trait au milieu.
      const half = (v.w / 2) * k;
      fillRect(ctx, sh, v.x - 1 + (1 - k), v.y, 0.9 + half, v.h);
      fillRect(ctx, shade(sh, 0.3), v.x + v.w - half, v.y, half + 0.9 - (1 - k) * 0.9, v.h);
      if (k >= 1) fillRect(ctx, ink(0.5), v.x + v.w / 2 - 0.2, v.y, 0.4, v.h);
    }
  });
  // Linge tendu entre deux fenêtres d'un étage (jours secs), pièces pendues une à une.
  if (life && life.laundryFloor !== null) {
    const lk = laundryK(T, D, String(Math.round(x * 8)), true, plan.seed);
    const at = (c: number): (typeof b.wins)[number] | undefined => b.wins[life.laundryFloor! * life.nCols + c];
    const a = at(life.laundryCol);
    const c2 = at(life.laundryCol + 1);
    if (lk > 0 && a && c2) {
      const ly = a.y + 2.2;
      ctx.strokeStyle = ink(0.7);
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(a.x + a.w, ly);
      ctx.lineTo(c2.x, ly + 0.4);
      ctx.stroke();
      const n = Math.round(lk * 3);
      const r = fondRng(plan.seed, `linge-pieces-${Math.round(x * 8)}`);
      for (let i = 0; i < n; i++) fillRect(ctx, haze(CLOTH[Math.floor(r() * CLOTH.length)]!, hz), a.x + a.w + 0.8 + i * 1.6, ly + 0.2, 1.2, 1.6 + r() * 0.8);
    }
  }
  ctx.restore();
  // Ruelle ou cour en retrait sous le haut du rez-de-chaussée.
  const ru = shade(wall, 0.5);
  fillRect(ctx, ru, x, bottom, w, plan.ground - bottom);
  fillRect(ctx, shade(ru, 0.3), x + w * 0.72, bottom, w * 0.28, plan.ground - bottom);
  fillRect(ctx, shade(wall, 0.2), x, plan.ground - 3, w, 3);
  fillRect(ctx, light(wall, 0.5), x, bottom - 0.8, w, 0.8);
  fillRect(ctx, ink(0.75), x, bottom, w, 0.9);
  // Porches et portes de service tous les 14 px (une fente en montre toujours un), pavés de la cour.
  ctx.fillStyle = ink(0.7);
  for (let px = x + 5 + ((b.id * 7) % 9); px + 5 < x + w - 2; px += 14) {
    const arch = Math.floor(px) % 2 === 0;
    ctx.fillRect(px, plan.ground - (arch ? 10 : 8), arch ? 5 : 3.5, arch ? 7 : 5);
    if (arch) {
      ctx.beginPath();
      ctx.arc(px + 2.5, plan.ground - 10, 2.5, Math.PI, 0);
      ctx.fill();
    }
  }
  ctx.strokeStyle = rgba(shade(wall, 0.4), 0.8);
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (let px = x + 2; px < x + w; px += 4) {
    ctx.moveTo(px, plan.ground - 3);
    ctx.lineTo(px - 1, plan.ground);
  }
  ctx.stroke();
  fillRect(ctx, shade(ru, 0.25), x, bottom + 3, w, 0.6);
  // Toit sans débord (même ligne que `roofLineY` pour la neige), corniche sous l'égout.
  const pts: [number, number][] = b.look.roofKind === 'gable' ? [[x, eave], [x + w / 2, top], [x + w, eave]] : [[x, eave], [x + 1.5, top + 1], [x + w - 1.5, top + 1], [x + w, eave]];
  poly(ctx, rc, pts);
  ctx.save();
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.clip();
  fillRect(ctx, light(rc, 0.35), x, top, w * 0.5, b.look.roofH);
  fillRect(ctx, shade(rc, 0.35), x + w * 0.72, top, w * 0.28, b.look.roofH);
  ctx.restore();
  ctx.strokeStyle = ink(0.85 - hz);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.stroke();
  fillRect(ctx, shade(wall, 0.42), x, eave, w, 2);
  fillRect(ctx, light(wall, 0.55), x, eave + 2, w, 0.6);
  if (b.look.chimney !== null) {
    const cx = x + w * b.look.chimney;
    fillRect(ctx, haze(BRICK, hz), cx, top + 1, 3, b.look.roofH * 0.6);
    fillRect(ctx, ink(0.7), cx - 0.4, top + 1, 3.8, 0.8);
    // Souches (1 à 3 pots) sur le couronnement.
    for (let k = 0; k < (life?.roof.pots ?? 0); k++) fillRect(ctx, haze(shade(BRICK, 0.3), hz), cx + 0.3 + k * 0.9, top - 0.6, 0.6, 1.8);
  }
  if (life) paintFarRoofExtras(ctx, b, life.roof, top, hz, D);
  ctx.strokeStyle = ink(0.8 - hz);
  ctx.lineWidth = 0.6;
  ctx.strokeRect(x, eave, w, h);
}

// Toit garni du mur du fond : antenne râteau, verrière d'atelier, toit-terrasse végétalisé ou potager (verdure selon le mois :
// vert de mai à octobre, brun ensuite, bâché gris en plein hiver), garde-corps, neige.
function paintFarRoofExtras(ctx: PaintCtx, b: PaintBuilding, roof: NonNullable<PaintBuilding['life']>['roof'], top: number, hz: number, D: FondMoment): void {
  const roofH = b.look.roofH;
  if (roof.antenna !== null) {
    const ax = roof.antenna;
    ctx.strokeStyle = ink(0.75);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(ax, top + 1);
    ctx.lineTo(ax, top - 4);
    for (let k = 0; k < 3; k++) {
      ctx.moveTo(ax - 1.4 + k * 0.2, top - 1.5 - k);
      ctx.lineTo(ax + 1.4 - k * 0.2, top - 1.5 - k);
    }
    ctx.stroke();
  }
  if (roof.verriere) {
    const vr = roof.verriere;
    const vy = top + 1.2;
    const vh = roofH - 2;
    fillRect(ctx, haze(hexRgb('#A8D0F0'), hz), vr.x, vy, vr.w, vh);
    fillRect(ctx, 'rgba(255,255,255,0.45)', vr.x + 0.4, vy + 0.3, vr.w * 0.4, vh * 0.4);
    ctx.strokeStyle = ink(0.7);
    ctx.lineWidth = 0.4;
    ctx.strokeRect(vr.x, vy, vr.w, vh);
    ctx.beginPath();
    for (let k = 1; k < 3; k++) {
      ctx.moveTo(vr.x + (vr.w * k) / 3, vy);
      ctx.lineTo(vr.x + (vr.w * k) / 3, vy + vh);
    }
    ctx.stroke();
  }
  if (roof.terrace) {
    const tr = roof.terrace;
    const ty = top + 1;
    const doy = D.doy;
    const green = doy >= 125 && doy < 300;
    const tarp = doy >= 335 || doy < 50;
    fillRect(ctx, haze(hexRgb('#8A6A48'), hz), tr.x, ty - 1.6, tr.w, 1.6);
    if (tr.potager) {
      for (let k = 0; k < 3; k++) {
        const rx = tr.x + 1 + k * (tr.w / 3);
        const rw = tr.w / 3 - 1.5;
        fillRect(ctx, haze(tarp && !D.meteo.snow ? hexRgb('#9AA0A8') : hexRgb('#A8865E'), hz), rx, ty - 2.2, rw, 0.7);
        if (green) for (let px = rx + 0.6; px < rx + rw; px += 1.6) disc(ctx, haze(hexRgb(k === 1 ? '#56A844' : '#2E6E34'), hz), px, ty - 2.5, 0.6);
      }
    } else {
      for (let px = tr.x + 1.2; px < tr.x + tr.w - 1; px += 2.4) {
        const f2 = foliageOf(D, `tt-${Math.round(b.x * 8)}-${Math.round(px)}`, 'bouquet');
        if (f2.d > 0.1) {
          disc(ctx, haze(f2.tones[0]!, hz), px, ty - 2.4, 1.1 * (0.6 + 0.4 * f2.d));
          disc(ctx, haze(f2.tones[1]!, hz), px - 0.3, ty - 2.7, 0.65 * (0.6 + 0.4 * f2.d));
        } else {
          ctx.strokeStyle = ink(0.6);
          ctx.lineWidth = 0.4;
          ctx.beginPath();
          ctx.moveTo(px, ty - 1.6);
          ctx.lineTo(px - 0.5, ty - 3);
          ctx.moveTo(px, ty - 1.6);
          ctx.lineTo(px + 0.6, ty - 2.8);
          ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = ink(0.7);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(tr.x - 1, ty - 3.4);
    ctx.lineTo(tr.x + tr.w + 1, ty - 3.4);
    for (let px = tr.x - 1; px <= tr.x + tr.w + 1; px += 2) {
      ctx.moveTo(px, ty - 3.4);
      ctx.lineTo(px, ty);
    }
    ctx.stroke();
    if (D.meteo.snow) fillRect(ctx, '#F0F4F8', tr.x, ty - 2.4, tr.w, 0.9);
  }
}
