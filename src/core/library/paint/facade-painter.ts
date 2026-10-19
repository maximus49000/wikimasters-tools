import { hashString, mulberry32 } from '../scene-world';
import { GROUND_FLOOR } from '../city/facades';
import type { FacadeWindow } from '../city/facade-layout';
import { INK, SHADOW_K, TAU, disc, fillRect, inkRect, light, pick, poly, shade } from './cel';
import { leftOf, type CityPaintPlan, type PaintBuilding } from './city-plan';
import { hexRgb, rgba } from './color';
import type { PaintCtx } from './paint-ctx';

// Peintre des façades du premier plan (façades parisiennes, d'après la mise en page `PaintBuilding.layout`) : décor fixe de
// jour, peint une fois par tranche ; la nuit vient du filtre et du calque SVG des fenêtres. Port du dessin cellulo de la
// maquette (docs/superpowers/maquettes/facades-parisiennes) : mur de pierre à assises ou enduit, bandeaux d'étage, fenêtres
// de jour encadrées (linteau clair, tableau à l'ombre, vitre reflet du ciel, menuiserie), jardinières du faubourg, balcons
// filants et balconnets en fer forgé. Volets et rideaux ne sont pas peints : ils bougent avec la vie des logements (calque
// de la vie aux fenêtres, spec 2026-10-19 « vie au-dessus de la rue » §5.2). Le rez-de-chaussée (devantures,
// entrées) et le toit (corniche, lucarnes) ont leurs propres peintres. Tout reste dans la boîte de l'immeuble.
// Chaque immeuble a son propre générateur (`ghibli-building`, x du lot) : peint depuis deux tranches, il est identique.

const CLOTH = ['#E8456B', '#FFFFFF', '#F6C62E', '#4E8ED8', '#6BB36B', '#F28CB4'].map(hexRgb);
const FLOWERS = ['#3F8A3A', '#E8456B', '#F6C62E', '#FFFFFF', '#E070C0'].map(hexRgb);
const IVY = ['#2A6A2E', '#4E9C3A', '#8CCB50'].map(hexRgb);
export const GLASS_DAY = hexRgb('#7FB4E0');
// Jardinière : bac en terre cuite, fleurs ; pot de fleurs d'un balcon filant haussmannien.
const BOX = hexRgb('#8A4A2E');
const POT = hexRgb('#A04A2E');
const LEAF = hexRgb('#3F8A3A');

const rngOf = (plan: CityPaintPlan, b: PaintBuilding) => mulberry32(plan.seed ^ hashString('ghibli-building') ^ Math.round(b.x * 8));
// Fenêtre à balconnet : étage courant ou dernier étage (la porte-fenêtre, la cage et l'entresol n'en ont pas).
const plain = (win: FacadeWindow): boolean => win.kind === 'std' || win.kind === 'top';

export function paintFacade(ctx: PaintCtx, plan: CityPaintPlan, b: PaintBuilding): void {
  const rng = rngOf(plan, b);
  const { x, w, top, look, layout } = b;
  const { ground } = plan;
  const eave = top + look.roofH;
  const h = ground - eave;
  const wall = look.wall;
  const faubourg = layout?.kind === 'faubourg';
  const left = leftOf(plan, b);
  // Haut du rez-de-chaussée (ou du socle des jumeaux) : les assises s'arrêtent là.
  const base = layout?.base ?? b.podiumTop ?? ground - GROUND_FLOOR;
  fillRect(ctx, wall, x, eave, w, h);
  // Tout le décor du mur est rogné à la boîte de l'immeuble (rien ne dépasse chez le voisin ni au-dessus de la corniche).
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, eave, w, h);
  ctx.clip();
  // Ton d'ombre : bande droite (côté opposé au soleil) + ombre portée du voisin de gauche, bords nets.
  fillRect(ctx, shade(wall, 0.28), x + w * 0.72, eave, w * 0.28, h);
  if (left && left.top < top) poly(ctx, shade(wall, 0.28), [[x, left.top], [x + (ground - left.top) * SHADOW_K, ground], [x, ground]]);
  // Rehaut : liseré clair côté soleil ; salissure du pied (pas sous une tour de jumeaux : le socle la couvrirait).
  fillRect(ctx, light(wall, 0.45), x, eave, 1.6, h);
  if (b.podiumTop === null) fillRect(ctx, shade(wall, 0.18), x, ground - 3, w, 3);
  // Assises de pierre de taille (haussmann) : fines lignes horizontales dans le ton d'ombre léger.
  if (layout?.kind === 'haussmann') {
    ctx.strokeStyle = rgba(shade(wall, 0.22), 0.9);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    for (let yy = eave + 6; yy < base - 2; yy += 4.5) {
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
    }
    ctx.stroke();
  }
  // Bandeaux : une ligne claire + ombre nette sous chaque plancher (l'entresol n'en a pas, le bandeau du rez-de-chaussée le borde).
  if (layout) {
    for (const lv of layout.levels) {
      if (lv.level === 'mezz') continue;
      const by = lv.y + lv.h;
      fillRect(ctx, light(wall, 0.5), x, by - 1.2, w, 1.2);
      fillRect(ctx, shade(wall, 0.38), x, by, w, 0.9);
    }
  }
  // Lierre : seulement sur une façade de faubourg.
  if (faubourg && look.ivy) paintIvy(ctx, rng, look.ivy === 'left' ? x - 2 : x + w * 0.55, w, eave, h);
  // Bandeau au-dessus du rez-de-chaussée (immeuble sans socle).
  if (b.podiumTop === null) fillRect(ctx, shade(wall, 0.3), x, ground - GROUND_FLOOR - 1, w, 1);
  // Fenêtres d'étage (les lucarnes sont peintes par le toit) ; jardinières des fenêtres qui en ont une (faubourg).
  if (layout) {
    for (const win of layout.windows) {
      if (win.kind === 'dormer') continue;
      paintDayWindow(ctx, b, win);
      if (win.box) paintFlowerBox(ctx, plan, win);
    }
    // Balcons : filants sur toute la largeur de l'étage, balconnets sous les fenêtres des étages qui en ont.
    for (const lv of layout.levels) if (lv.balcony === 'filant') paintBalcony(ctx, b, x + 1.5, lv.y + lv.h, w - 3, true);
    for (const win of layout.windows) if (plain(win) && layout.levels[win.level]?.balcony === 'balconnet') paintBalcony(ctx, b, win.x - 1.2, win.y + win.h, win.w + 2.4, false);
  }
  // Linge tendu entre deux fenêtres d'un même étage : seulement sur une façade de faubourg.
  if (faubourg && look.laundry) paintLaundry(ctx, rng, b);
  ctx.restore();
  // Gouttière à colliers.
  if (look.pipe) {
    const px = x + w - 1.6;
    fillRect(ctx, '#4A4A5A', px, eave + 2, 1.1, h - 2);
    fillRect(ctx, 'rgba(255,255,255,0.4)', px, eave + 2, 0.4, h - 2);
    ctx.fillStyle = INK;
    for (let gy = eave + 8; gy < ground; gy += 22) ctx.fillRect(px - 0.6, gy, 2.3, 0.8);
  }
  inkRect(ctx, x, eave, w, h, 0.9);
  // Mitoyens : trait encré appuyé à la jonction, du toit le plus bas des deux jusqu'au sol.
  if (left && left.x + left.w >= x - 0.5) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x, left.top > top ? left.top + left.look.roofH : top + look.roofH);
    ctx.lineTo(x, ground);
    ctx.stroke();
  }
}

// Fenêtre éteinte de jour : encadrement (linteau de pierre claire, tableau à l'ombre), vitre #7FB4E0 reflet du ciel (on voit
// peu l'intérieur), menuiserie (cadre, meneau, traverse), appui (pas sous une porte-fenêtre) ; ni rideaux ni volets (calque
// de la vie aux fenêtres). Sert aussi à l'étage du socle des jumeaux. La jardinière est peinte à part (`paintFlowerBox`, tirée de la graine du plan).
export function paintDayWindow(ctx: PaintCtx, b: PaintBuilding, win: FacadeWindow): void {
  const { x, y, w, h } = win;
  const wall = b.look.wall;
  fillRect(ctx, light(wall, 0.5), x - 1.2, y - 1.2, w + 2.4, 1.2);
  fillRect(ctx, shade(wall, 0.5), x - 0.9, y, 0.9, h);
  fillRect(ctx, shade(wall, 0.5), x + w, y, 0.9, h);
  fillRect(ctx, GLASS_DAY, x, y, w, h);
  poly(ctx, 'rgba(255,255,255,0.72)', [[x, y + h * 0.55], [x + w * 0.5, y], [x + w * 0.7, y], [x, y + h * 0.95]]);
  fillRect(ctx, shade(GLASS_DAY, 0.45), x, y, w, 1);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.55;
  ctx.strokeRect(x, y, w, h);
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  if (h >= 8) {
    ctx.moveTo(x, y + h * 0.33);
    ctx.lineTo(x + w, y + h * 0.33);
  }
  ctx.stroke();
  // Appui : pierre claire + ombre nette.
  if (win.kind !== 'french') {
    fillRect(ctx, light(wall, 0.55), x - 1.2, y + h, w + 2.4, 1);
    fillRect(ctx, shade(wall, 0.4), x - 1.2, y + h + 1, w + 2.4, 0.9);
  }
}

// Jardinière sur l'appui (fenêtres `box` de la mise en page, faubourg) : bac en terre cuite cerné, six fleurs tirées d'un
// générateur propre (graine du plan, position de la fenêtre : identique d'une tranche à l'autre).
function paintFlowerBox(ctx: PaintCtx, plan: CityPaintPlan, win: FacadeWindow): void {
  const { x, y, w, h } = win;
  const r = mulberry32(plan.seed ^ hashString('ghibli-box') ^ Math.round(x * 7 + y * 3));
  fillRect(ctx, BOX, x - 0.4, y + h + 1, w + 0.8, 1.6);
  inkRect(ctx, x - 0.4, y + h + 1, w + 0.8, 1.6, 0.4);
  for (let k = 0; k < 6; k++) disc(ctx, pick(FLOWERS, r), x + 0.5 + r() * (w - 1), y + h + 0.4 + r() * 1.2, 0.7);
}

// Balcon : garde-corps en fer forgé (lisse, barreaux au pas de 1,5 ; filant : deux volutes par travée, pot de fleurs sur un
// haussmannien) puis dalle en débord (rehaut dessus, ombre nette dessous, trait). `filant` : sur toute la largeur de l'étage.
export function paintBalcony(ctx: PaintCtx, b: PaintBuilding, x: number, y: number, w: number, filant: boolean): void {
  const wall = b.look.wall;
  const rh = filant ? 5.5 : 4;
  ctx.fillStyle = INK;
  ctx.fillRect(x, y - rh, w, 0.7);
  for (let k = x + 0.8; k < x + w; k += 1.5) ctx.fillRect(k, y - rh, 0.45, rh);
  if (filant && b.layout) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (const cx of b.layout.bays) {
      if (cx - 3 < x || cx + 3 > x + w) continue;
      ctx.moveTo(cx - 2.5, y - 1.2);
      ctx.arc(cx - 1.2, y - rh * 0.55, 1.3, Math.PI * 0.7, Math.PI * 2.3);
      // Volute droite en miroir : la maquette la trace en sens inverse (même arc, de 0,3 π à 0,7 π ; PaintCtx n'a pas le sens).
      ctx.moveTo(cx + 2.5, y - 1.2);
      ctx.arc(cx + 1.2, y - rh * 0.55, 1.3, Math.PI * 0.3, Math.PI * 0.7);
    }
    ctx.stroke();
  }
  fillRect(ctx, light(wall, 0.5), x - 0.8, y - 0.4, w + 1.6, 1.4);
  fillRect(ctx, shade(wall, 0.45), x - 0.8, y + 1, w + 1.6, filant ? 2 : 1.4);
  inkRect(ctx, x - 0.8, y - 0.4, w + 1.6, filant ? 3.4 : 2.8, 0.6);
  if (filant && b.layout?.kind === 'haussmann') {
    disc(ctx, LEAF, x + 3.5, y - rh - 0.6, 1.5);
    fillRect(ctx, POT, x + 2.3, y - rh - 0.2, 2.4, 1.4);
  }
}

function paintIvy(ctx: PaintCtx, rng: () => number, side: number, w: number, eave: number, h: number): void {
  const clumps: [number, number, number][] = [];
  for (let i = 0; i < 14; i++) clumps.push([side + rng() * w * 0.45, eave + h * 0.3 + rng() * h * 0.68, 3 + rng() * 3.5]);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (const [cx, cy, cr] of clumps) {
    ctx.moveTo(cx + cr, cy);
    ctx.arc(cx, cy, cr, 0, TAU);
  }
  ctx.stroke();
  for (let t = 0; t < 3; t++) {
    ctx.fillStyle = rgba(IVY[t]!, 1);
    ctx.beginPath();
    for (const [cx, cy, cr] of clumps) {
      const rr = cr * (1 - t * 0.28);
      ctx.moveTo(cx - t * 1.2 + rr, cy - t * 1.4);
      ctx.arc(cx - t * 1.2, cy - t * 1.4, rr, 0, TAU);
    }
    ctx.fill();
  }
}

// Linge entre la première et la dernière fenêtre standard d'un étage (un des étages hauts qui en a au moins deux).
function paintLaundry(ctx: PaintCtx, rng: () => number, b: PaintBuilding): void {
  const rows = b.wins.filter((v) => v.kind === 'std' || v.kind === 'top');
  const row = rows.find((v, i) => rows.filter((u) => u.y === v.y).length >= 2 && i > rows.length * 0.3);
  if (!row) return;
  const same = rows.filter((u) => u.y === row.y);
  const a = same[0]!;
  const bb = same[same.length - 1]!;
  const y0 = a.y + a.h + 2.5;
  const x0 = a.x + a.w;
  const x1 = bb.x;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2, y0 + 3, x1, y0);
  ctx.stroke();
  const n = Math.max(2, Math.floor((x1 - x0) / 4));
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + 1.5 * 4 * t * (1 - t);
    const c = pick(CLOTH, rng);
    fillRect(ctx, c, px - 1.3, py, 2.6, 3.5);
    fillRect(ctx, shade(c, 0.3), px + 0.3, py, 1, 3.5);
    inkRect(ctx, px - 1.3, py, 2.6, 3.5, 0.4);
  }
}
