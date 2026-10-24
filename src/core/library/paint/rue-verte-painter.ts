import { hashString, mulberry32 } from '../scene-world';
import { INK, TAU, disc, fillRect, light, pick, shade } from './cel';
import type { CityPaintPlan } from './city-plan';
import { hexRgb, mixRgb, rgba, type Rgb } from './color';
import { bedState, bloomOf, fondRng, foliageOf, leavesOnGround, slotHours, sweptKey, type FondMoment } from './fond-time';
import { treeModelOf, type TreeModel } from './hill-trees';
import type { PaintCtx } from './paint-ctx';
import type { RueItem, RuePit } from './rue-verte-plan';

// Verdure de la rue principale peinte dans les tranches (port de la maquette fond-ville, `03b-rue-verte.js` `paintRueVerdure`) :
// feuilles mortes, herbe entre les pavés, pots devant les portes, bacs et parterres, grimpantes, fosses (grille en fonte,
// pied fleuri, flaque quand il pleut, ombre portée du fût). Calendrier réel : `bedState` (parterres des jardiniers),
// `foliageOf` / `bloomOf` (grimpantes, bouquet des bacs hauts), `leavesOnGround` (balayage à 7 h 30).
// Les arbres eux-mêmes (fût, rameaux, houppier) ne sont PAS peints ici : calque animé au vent (`rueTreeModel` + hill-trees).

// Grille de fosse (perspective).
const PIT = { w: 8, h: 3.2 } as const;
// Fleurs de saison (pieds d'arbres, bacs, parterres, pots).
const FLOWERS: Record<'spring' | 'summer' | 'autumn' | 'winter', readonly string[]> = {
  spring: ['#E8456B', '#F6C62E', '#F28CB4', '#FFFFFF'], // tulipes
  summer: ['#E03A3A', '#8468B0', '#F0609A', '#9A78C8'], // géraniums, lavande
  autumn: ['#F0B040', '#C87A2A', '#D8A040', '#B04A3A'], // chrysanthèmes
  winter: ['#B890C0', '#C8A0C8', '#8A6A5A'], // bruyères, sol paillé
};
const LEAF_COLORS = ['#C87A2A', '#E0A040', '#A85A30', '#D8B050', '#B86A28'];
// Écorce des arbres de rue (pour le calque des arbres).
export const RUE_BARK: Record<string, Rgb> = { platane: hexRgb('#C8B898'), tilleul: hexRgb('#8A7A66'), marronnier: hexRgb('#7A6654'), cerisier: hexRgb('#6A5A54'), jeune: hexRgb('#A89880') };
export const rueBark = (v: RuePit): Rgb => RUE_BARK[v.young ? 'jeune' : v.species]!;
// Densité de la maquette : 3 600 feuilles par unité de `leavesOnGround` sur 1 440 px. Le tapis est tiré par bande de
// LEAF_BAND px (graine + numéro de bande) : il ne dépend pas de la largeur de la pièce (agrandir la pièce ne repeint pas
// les premières tranches).
const LEAVES_PER_PX = 3600 / 1440;
export const LEAF_BAND = 120;

// Modèle d'un arbre de rue (squelette fixe : fût = v.h, ramure = 2 × r, 4 niveaux, ≤ 60 touffes de rayon 0,3 r ; jeune :
// 3 niveaux, 20 touffes de 0,42 r, fût de 0,7 px).
export const rueTreeModel = (v: RuePit): TreeModel =>
  treeModelOf('rue' + Math.round(v.x), v.species, { x: v.x, y: v.y }, v.h, v.r * 2, v.young ? 3 : 4, v.r * (v.young ? 0.42 : 0.3), v.young ? 20 : 60, v.young ? 0.7 : 1.3 + v.r * 0.07);

// Pluie : chaussée mouillée, flaques au pied des arbres (0 sec, 1 mouillé).
export const rueWet = (D: Pick<FondMoment, 'meteo'>): number => (D.meteo.precip > 0 ? 1 : 0);

// Nombre de feuilles mortes au sol par bande de LEAF_BAND px : 0 une fois la rue balayée (après 7 h 30 un jour de
// balayage), sinon la chute cumulée lue toutes les 2 h (la tranche n'est repeinte qu'au changement de ce nombre, voir
// `rueMomentKey`).
export function rueLeafCount(plan: Pick<CityPaintPlan, 'seed'>, D: FondMoment): number {
  const T = slotHours(D.minutes);
  if (sweptKey(D, T, plan.seed)) return 0;
  const k = leavesOnGround(D, Math.floor(T / 2) * 2, plan.seed);
  return k > 0 ? Math.round(k * LEAVES_PER_PX * LEAF_BAND) : 0;
}

// Bandes du tapis de feuilles qui touchent [x0, x1] (feuilles à ± 35 px des arbres de la bande).
const leafBands = (x0: number, x1: number): number[] => {
  const out: number[] = [];
  for (let band = Math.floor((x0 - 40) / LEAF_BAND); band * LEAF_BAND < x1 + 40; band++) out.push(band);
  return out;
};
// Arbres adultes plantés de la rue (autour desquels tombent les feuilles), mémorisés par liste d'éléments du plan.
const LEAF_PITS = new WeakMap<readonly RueItem[], RuePit[]>();
const leafPits = (plan: Pick<CityPaintPlan, 'rue'>): RuePit[] => {
  let pits = LEAF_PITS.get(plan.rue);
  if (!pits) LEAF_PITS.set(plan.rue, (pits = plan.rue.filter((v): v is RuePit => v.kind === 'pit' && !v.empty && !v.young)));
  return pits;
};

// Part de la clé des tranches [x0, x1] : flaques (pluie, s'il y a une fosse plantée), nombre de feuilles au sol et, s'il y en
// a, les arbres des bandes du tapis (une bande déborde de la tranche).
export function rueMomentKey(plan: Pick<CityPaintPlan, 'seed' | 'rue'>, items: readonly RueItem[], D: FondMoment, x0: number, x1: number): string {
  const puddles = rueWet(D) && items.some((v) => v.kind === 'pit' && !v.empty) ? 'm' : '';
  const n = rueLeafCount(plan, D);
  if (!n) return `${puddles}0`;
  const bands = leafBands(x0, x1);
  const lo = bands[0]! * LEAF_BAND;
  const hi = (bands.at(-1)! + 1) * LEAF_BAND;
  const trees = leafPits(plan).filter((v) => v.x >= lo && v.x < hi).map((v) => v.x.toFixed(1)).join(',');
  return `${puddles}${n}:${hashString(trees).toString(36)}`;
}

// Étendue horizontale de ce que peint un élément (découpe en tranches).
export function rueSpan(v: RueItem): [number, number] {
  switch (v.kind) {
    case 'pit':
      return [v.x - PIT.w / 2 - 1.5 - v.r * 0.15 - 6, v.x + 1.4 + v.h * 0.22 + 7 + v.r * 0.15];
    case 'bac':
    case 'parterre':
      return [v.x0 - 1.5, v.x1 + 3];
    case 'grimpante':
      return [v.x - 12, v.x + 12];
    case 'pots':
      return [v.x - 5, v.x + 18];
    case 'herbe':
      return [v.x - 1, v.x + v.n * 1.2 + 1];
  }
}

function inkRectLine(ctx: PaintCtx, x: number, y: number, w: number, h: number): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.6;
  ctx.strokeRect(x, y, w, h);
}

// Fleurs d'un pied d'arbre, d'un bac, d'un parterre ou d'un pot d'après l'état des parterres (bedState) : pousses, fleurs,
// fanées, sol nu ; neige : un liseré blanc.
function paintFlowersRow(ctx: PaintCtx, x0: number, x1: number, y: number, D: FondMoment, seedF: number, dense = 1): void {
  const st = bedState(D);
  const r = mulberry32(Math.floor(seedF * 1000));
  if (st.kind === 'bare') return fillRect(ctx, '#7A6450', x0, y - 0.6, x1 - x0, 1);
  if (D.meteo.snow) return fillRect(ctx, '#F0F4F8', x0, y - 1, x1 - x0, 1.2);
  const cols = FLOWERS[st.kind];
  for (let x = x0 + 0.8; x < x1 - 0.6; x += (1.3 + r() * 0.9) / dense) {
    const c = hexRgb(pick(cols, r));
    const tall = st.kind === 'spring' || (st.kind === 'summer' && r() < 0.4);
    const faded = r() < st.faded;
    if (st.kind === 'winter') {
      if (r() < 0.6) disc(ctx, c, x, y - 0.6, 0.55);
      else fillRect(ctx, '#6A5A4A', x - 0.5, y - 0.5, 1, 0.6);
      continue;
    }
    if (st.kind === 'spring' && r() < (st.shoots ?? 0)) {
      fillRect(ctx, '#5E9A4A', x - 0.15, y - 1.2, 0.3, 1.2);
      continue;
    }
    if (r() > st.bloom) {
      disc(ctx, hexRgb('#3F8A3A'), x, y - 0.3, 0.6);
      continue;
    }
    const fc = faded ? mixRgb(c, hexRgb('#8A6A50'), 0.6) : c;
    const leaf = faded ? hexRgb('#7A8A50') : hexRgb('#3F8A3A');
    disc(ctx, shade(leaf, 0.2), x, y - 0.2, 0.7);
    if (tall) {
      fillRect(ctx, leaf, x - 0.15, y - 2.2, 0.3, 2);
      disc(ctx, fc, x + (faded ? 0.4 : 0), y - (faded ? 1.8 : 2.4), 0.6);
    } else disc(ctx, fc, x - 0.2, y - 0.9, 0.55);
  }
}

// Tapis de feuilles mortes, tiré par bande (60 % autour des arbres adultes de la bande, à ± 35 px, le reste sur toute la
// bande ; moitié à la bordure) : seules celles qui touchent [x0, x1] sont peintes (raccord des tranches).
function paintDeadLeaves(ctx: PaintCtx, plan: CityPaintPlan, D: FondMoment, x0: number, x1: number): void {
  const n = rueLeafCount(plan, D);
  if (!n) return;
  const { ground, curb } = plan;
  const pits = leafPits(plan);
  for (const band of leafBands(x0, x1)) {
    const b0 = band * LEAF_BAND;
    const r = fondRng(plan.seed, 'rue-feuilles', String(band));
    const own = pits.filter((v) => v.x >= b0 && v.x < b0 + LEAF_BAND);
    for (let i = 0; i < n; i++) {
      const underTree = r() < 0.6 && own.length > 0;
      const x = underTree ? own[Math.floor(r() * own.length)]!.x + (r() - 0.5) * 70 : b0 + r() * LEAF_BAND;
      const near = r() < 0.5;
      const y = near ? curb - 3 + r() * 3 : ground + 1 + r() * (curb - ground - 1.5);
      const c = pick(LEAF_COLORS, r);
      const w = 1.2 + r() * 0.8;
      if (x + w >= x0 - 1 && x <= x1 + 1) fillRect(ctx, c, x, y, w, 0.8);
    }
  }
}

export function paintRueVerdure(ctx: PaintCtx, plan: CityPaintPlan, items: readonly RueItem[], D: FondMoment, x0: number, x1: number): void {
  const { ground } = plan;
  const winter = D.doy >= 330 || D.doy < 84;
  const wet = rueWet(D);
  paintDeadLeaves(ctx, plan, D, x0, x1);
  for (const v of items) {
    if (v.kind === 'herbe') {
      ctx.strokeStyle = winter ? '#7A8A68' : '#5E9A50';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let i = 0; i < v.n; i++) {
        ctx.moveTo(v.x + i * 1.2, v.y + 1);
        ctx.lineTo(v.x + i * 1.2 + (i % 2 ? 0.6 : -0.5), v.y - 1.2 - (i % 3) * 0.4);
      }
      ctx.stroke();
      continue;
    }
    if (v.kind === 'pots') {
      const pot = hexRgb('#A04A2E');
      for (const dx of v.both ? [-3.5, 13.5] : [13.5]) {
        const px = v.x + dx;
        fillRect(ctx, pot, px, ground - 1.8, 2.4, 2.4);
        fillRect(ctx, shade(pot, 0.35), px + 1.6, ground - 1.8, 0.8, 2.4);
        inkRectLine(ctx, px, ground - 1.8, 2.4, 2.4);
        disc(ctx, hexRgb('#3F8A3A'), px + 1.2, ground - 2.6, 1.3);
        disc(ctx, hexRgb('#56A844'), px + 0.8, ground - 3, 0.8);
        paintFlowersRow(ctx, px - 0.2, px + 2.6, ground - 2.6, D, v.flowerSeed, 1.4);
      }
      continue;
    }
    if (v.kind === 'bac' || v.kind === 'parterre') {
      const { x0: bx, w, h, y } = v;
      const wood = v.kind === 'bac' ? hexRgb(v.tall ? '#5A4A3E' : '#8A6A48') : hexRgb('#A09080');
      fillRect(ctx, 'rgba(70,50,130,0.2)', bx + 1, y + h, w + 1.5, 1.2);
      fillRect(ctx, wood, bx, y, w, h);
      fillRect(ctx, shade(wood, 0.35), bx + w * 0.75, y, w * 0.25, h);
      fillRect(ctx, light(wood, 0.4), bx, y, w, 0.6);
      inkRectLine(ctx, bx, y, w, h);
      if (v.kind === 'parterre' && v.hedge) {
        // Haie basse taillée : deux rangs de boules, neige posée dessus.
        ctx.fillStyle = '#3F8A3A';
        for (let x = bx + 1; x < bx + w - 0.5; x += 1.6) {
          ctx.beginPath();
          ctx.arc(x, y - 0.4, 1.1, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#56A844';
        for (let x = bx + 0.6; x < bx + w - 0.5; x += 1.6) {
          ctx.beginPath();
          ctx.arc(x, y - 0.9, 0.7, 0, TAU);
          ctx.fill();
        }
        if (D.meteo.snow) fillRect(ctx, '#F0F4F8', bx + 0.5, y - 1.8, w - 1, 0.9);
      } else {
        fillRect(ctx, winter ? hexRgb('#6A5A4A') : hexRgb('#2E6E34'), bx + 0.4, y - 0.8, w - 0.8, 1.2);
        paintFlowersRow(ctx, bx, bx + w, y - 0.6, D, v.flowerSeed, v.tall ? 0.8 : 1);
        if (v.tall) {
          // Bac haut : un arbuste en boule sur sa tige.
          const f = foliageOf(D, 'bac' + bx, 'bouquet');
          fillRect(ctx, hexRgb('#3F8A3A'), bx + w / 2 - 0.3, y - 7, 0.6, 7);
          if (f.d > 0.1) {
            disc(ctx, f.tones[0]!, bx + w / 2, y - 7.5, 2.2 * (0.6 + 0.4 * f.d));
            disc(ctx, f.tones[1]!, bx + w / 2 - 0.6, y - 8, 1.4 * (0.6 + 0.4 * f.d));
          }
        }
      }
      continue;
    }
    if (v.kind === 'grimpante') {
      paintClimber(ctx, v.x, v.top, v.bottom, v.plant, v.flowerSeed, D);
      continue;
    }
    // Fosse : grille en fonte, terre nue si vide, sinon pied fleuri, flaque sous la pluie et ombre portée du fût.
    if (v.kind !== 'pit') continue;
    const { x, y } = v;
    fillRect(ctx, '#4A4238', x - PIT.w / 2, y - PIT.h / 2, PIT.w, PIT.h);
    ctx.strokeStyle = '#8A8070';
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    for (let k = -3; k <= 3; k++) {
      ctx.moveTo(x + k * 1.1, y - PIT.h / 2 + 0.3);
      ctx.lineTo(x + k * 1.1, y + PIT.h / 2 - 0.3);
    }
    ctx.moveTo(x - PIT.w / 2 + 0.3, y);
    ctx.lineTo(x + PIT.w / 2 - 0.3, y);
    ctx.stroke();
    if (v.empty) {
      fillRect(ctx, '#7A6450', x - 1.2, y - 0.8, 2.4, 1.6);
      continue;
    }
    if (v.flowers) paintFlowersRow(ctx, x - 3.4, x + 3.6, y + 0.4, D, v.flowerSeed, 1.3);
    if (wet) {
      ctx.fillStyle = 'rgba(60,70,110,0.22)';
      ctx.beginPath();
      ctx.ellipse(x + 1, y + 1.4, 5 + v.r * 0.15, 1.3, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,220,240,0.25)';
      ctx.beginPath();
      ctx.ellipse(x - 0.5, y + 1.1, 2.5, 0.5, 0, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(70,50,130,0.26)';
    ctx.beginPath();
    ctx.moveTo(x - 1, y);
    ctx.lineTo(x + 1.4, y);
    ctx.lineTo(x + 1.4 + v.h * 0.22, y + 1.8);
    ctx.lineTo(x - 1 + v.h * 0.22, y + 1.8);
    ctx.closePath();
    ctx.fill();
  }
}

// Tuteur d'un jeune arbre (piquet et lien) : peint avec le fût dans le calque des arbres (maquette `04a-vent.js`), pas ici.
export function paintTuteur(ctx: PaintCtx, v: RuePit): void {
  if (!v.young || v.empty) return;
  const { x, y } = v;
  ctx.strokeStyle = '#8A7A5A';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x + 2.2, y);
  ctx.lineTo(x + 2.2, y - v.h * 0.7);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x - 0.5, y - v.h * 0.5);
  ctx.lineTo(x + 2.5, y - v.h * 0.55);
  ctx.stroke();
}

// Grimpante sur l'arête d'une façade : cep ondulé, feuilles en grappes plus larges vers le haut (nues l'hiver : vrilles),
// vigne vierge rouge à l'automne, grappes de glycine au printemps.
function paintClimber(ctx: PaintCtx, cx: number, top: number, bottom: number, plant: 'glycine' | 'vigne', seedF: number, D: FondMoment): void {
  const gly = plant === 'glycine';
  const f = foliageOf(D, 'gr' + cx, gly ? 'glycine' : 'vigne');
  const bare = f.d <= 0.1;
  const red = !gly ? bloomOf(D, 'vigne') : 0;
  const tones = red > 0 ? [mixRgb(f.tones[0]!, hexRgb('#A82A1E'), red), mixRgb(f.tones[1]!, hexRgb('#E04A30'), red)] : f.tones;
  ctx.strokeStyle = '#5A4A3A';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx, bottom);
  ctx.quadraticCurveTo(cx + 2, (top + bottom) / 2, cx - 1, top);
  ctx.stroke();
  const r = mulberry32(Math.floor(seedF * 1000));
  const span = bottom - top;
  const leaves: { x: number; y: number; rr: number }[] = [];
  for (let y = bottom - 1.5; y > top; y -= 1.3 + r() * 1.2) {
    const q = (y - top) / span;
    const n = q > 0.5 ? 2 + Math.floor(r() * 2) : 1;
    for (let i = 0; i < n; i++) leaves.push({ x: cx + (r() - 0.5) * (2 + q * 10), y, rr: ((bare ? 0.35 : 1.1) + r() * (bare ? 0.25 : 1.4) * (0.5 + q)) * (bare ? 1 : 0.6 + 0.4 * f.d) });
  }
  ctx.strokeStyle = '#5A4A3A';
  ctx.lineWidth = bare ? 0.45 : 0.5;
  ctx.beginPath();
  for (let i = 0; i < leaves.length; i += bare ? 1 : 3) {
    ctx.moveTo(cx, leaves[i]!.y + 1);
    ctx.lineTo(leaves[i]!.x, leaves[i]!.y);
  }
  ctx.stroke();
  if (!bare) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (const l of leaves) {
      ctx.moveTo(l.x + l.rr, l.y);
      ctx.arc(l.x, l.y, l.rr, 0, TAU);
    }
    ctx.stroke();
  }
  for (let t = 0; t < 2; t++) {
    ctx.fillStyle = rgba(tones[t]!, 1);
    ctx.globalAlpha = bare ? 0.6 : 1;
    ctx.beginPath();
    for (const l of leaves) {
      const rr = l.rr * (1 - t * 0.4);
      ctx.moveTo(l.x - t * 0.4 + rr, l.y - t * 0.4);
      ctx.arc(l.x - t * 0.4, l.y - t * 0.4, rr, 0, TAU);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const blg = gly ? bloomOf(D, 'glycine') : 0;
  if (blg > 0) {
    for (const l of leaves) {
      if (r() >= 0.45 * blg + 0.1) continue;
      // Grappe pendante, arrêtée au pied du mur (jamais sur le trottoir, couloir des passants).
      const gy = l.y + l.rr * 0.6;
      const len = Math.min((2 + r() * 2) * blg, bottom - gy);
      if (len <= 0) continue;
      ctx.fillStyle = '#9A78C8';
      ctx.fillRect(l.x - 0.4, gy, 0.8, len);
      ctx.fillStyle = '#B898E0';
      ctx.fillRect(l.x - 0.2, gy, 0.4, Math.min(1.2 * blg, len));
    }
  }
}
