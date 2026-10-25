import { hashString, mulberry32 } from '../scene-world';
import { INK, TAU } from './cel';
import { hexRgb, mixRgb, rgba, type Rgb } from './color';
import { bloomOf, foliageOf, sat, smooth, type FondMoment } from './fond-time';
import type { PaintCtx } from './paint-ctx';
import type { RuePit, RueSpecies } from './rue-verte-plan';

// Arbres de la rue en « squelette continu » (maquette rue-arbres-naturels, notes §6 V4 + §7 V5, validée le 2026-10-24) : port
// fidèle de `treeModelV4`, `tubePath`, `paintSkeletonV4`, `leafCloud4` et `paintLeavesV4` de `maquette.html`, mêmes constantes.
// Un arbre = des AXES (tronc, charpentières, branches, rameaux, brindilles), chacun une Bézier quadratique légèrement sinueuse
// munie d'une demi-largeur qui décroît continûment : w²(t) baisse de `kT` sur la longueur, puis d'un cran lissé à chaque départ
// de fille (règle de Léonard : Σ filles ≤ 70 % de la section, la continuation au bout garde le reste). Les axes terminaux
// finissent en pointe. Le squelette est TOUJOURS dessiné en entier (il ne dépend pas de la date) ; le feuillage est une liste
// de petits nuages dentelés posés sur les axes de niveau 3 à 5, qui rétrécissent sur place à l'automne : rien ne flotte.
// Pur et déterministe : graine = position de la fosse (`rue` + x arrondi, la clé du calendrier `foliageOf` des arbres de rue).
// Écart à la maquette : trait encré du projet (`cel.INK`) au lieu de `#2A2238` de la maquette ; tons d'ombre et d'écorce
// claire calculés comme dans la maquette (mélange vers [40,30,60] / [255,250,240]).

export type RueAxis = {
  // Niveau : 1 tronc, 2 charpentière, 3 branche, 4 rameau, 5 brindille.
  level: number;
  pts: [number, number][];
  // Demi-largeur à chaque point (continue, décroissante).
  w: number[];
  // Index de l'axe mère (−1 pour le tronc), paramètre t de naissance sur la mère, continuation (au bout de la mère) ou fille de flanc.
  parent: number;
  t0: number;
  cont: boolean;
  // Index de la charpentière du tronc dont descend l'axe (−1 pour le tronc) : calque au vent du feuillage.
  mass: number;
  pointed: boolean;
  dead?: boolean;
};
export type RueCloud = { x: number; y: number; r: number; rot: number; k1: number; k2: number; phase: number; yel: number; axis: number; mass: number; rank: number };
export type RueBox = { x0: number; y0: number; x1: number; y1: number };
export type RueTreeModel = {
  key: string;
  species: RueSpecies;
  foot: { x: number; y: number };
  total: number;
  trunkH: number;
  rootY: number;
  w0: number;
  axes: RueAxis[];
  clouds: RueCloud[];
  // Nombre de charpentières (valeurs de `mass` : 0 … masses − 1).
  masses: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  // Boîte de tout ce que `paintRueSkeleton` et `paintRueClouds` peuvent toucher (ombre portée des nuages comprise).
  box: RueBox;
};

type Range = readonly [number, number];
type Port = {
  lean: number; sinu: number; w: number; L: readonly number[];
  kidsN: Range; kidsT: Range; share: Range; ang: Range;
  kidsN2: Range; kidsT2: Range; share2: Range; ang2: Range;
  up: number; W: number; cy: number; ry: number; tuft: number; dens: Range; along: number; gap: number; dead?: boolean;
  // Plafonds du budget (axes ≤ 120, nuages ≤ 220) : brindilles par rameau (maquette 2-4), nuages par bouquet (maquette 1-3).
  twigs: Range; bunch: number;
};
// Ports par essence (maquette PORTS4, version V5), PLAFONNÉS au budget (axes ≤ 120, nuages ≤ 220 par arbre) : la maquette
// tirait jusqu'à 146-226 axes et 118-598 nuages (robinier, cerisier : 3-4 charpentières). Valeurs de la maquette changées :
// kidsN2 [2, 3] → [2, 2] (sauf frêne, déjà [2, 2]) ; brindilles par rameau `twigs` [2, 4] → frêne [1, 3], robinier et
// cerisier [1, 1] ; nuages par bouquet `bunch` 1-3 (3) → tilleul, robinier, cerisier 2,5 (1-3, le 3ᵉ une fois sur 5) ; densité
// des bouquets aux niveaux 4-5 `dens[1]` platane 0,8 → 0,68, tilleul 0,85 → 0,72, cerisier 0,9 → 0,63. Avec twigs [2, 4],
// bunch 3 et les kidsN2 / dens de la maquette, on retrouve les tirages de la maquette (aux deux garde-fous près : trouées
// plafonnées, fille jamais plus large que la mère).
const PORTS: Record<RueSpecies, Port> = {
  platane: { lean: 0.05, sinu: 0.1, w: 1.0, L: [0, 0.32, 0.36, 0.24, 0.14, 0.07], kidsN: [1, 1], kidsT: [0.8, 0.96], share: [0.4, 0.5], ang: [0.45, 0.75], kidsN2: [2, 2], kidsT2: [0.4, 0.95], share2: [0.22, 0.35], ang2: [0.45, 0.85], up: 0.3, W: 0.95, cy: 0.52, ry: 0.56, tuft: 2.4, dens: [0.35, 0.68], along: 0.5, gap: 0.25, twigs: [2, 4], bunch: 3 },
  tilleul: { lean: 0.05, sinu: 0.1, w: 0.95, L: [0, 0.32, 0.36, 0.24, 0.14, 0.07], kidsN: [1, 1], kidsT: [0.8, 0.96], share: [0.4, 0.5], ang: [0.4, 0.65], kidsN2: [2, 2], kidsT2: [0.4, 0.95], share2: [0.22, 0.35], ang2: [0.4, 0.8], up: 0.35, W: 0.85, cy: 0.52, ry: 0.56, tuft: 2.4, dens: [0.4, 0.72], along: 0.5, gap: 0.2, twigs: [2, 4], bunch: 2.5 },
  robinier: { lean: 0.08, sinu: 0.22, w: 0.62, L: [0, 0.55, 0.3, 0.18, 0.1, 0.06], kidsN: [2, 3], kidsT: [0.82, 1.0], share: [0.25, 0.35], ang: [0.3, 0.6], kidsN2: [2, 2], kidsT2: [0.5, 0.95], share2: [0.22, 0.35], ang2: [0.4, 0.8], up: 0.4, W: 1.15, cy: 0.7, ry: 0.42, tuft: 2.8, dens: [0.45, 0.85], along: 0.5, gap: 0.2, twigs: [1, 1], bunch: 2.5 },
  frene: { lean: 0.03, sinu: 0.06, w: 0.85, L: [0, 0.5, 0.36, 0.2, 0.12, 0.07], kidsN: [1, 2], kidsT: [0.8, 1.0], share: [0.3, 0.45], ang: [0.4, 0.7], kidsN2: [2, 2], kidsT2: [0.45, 0.95], share2: [0.25, 0.4], ang2: [0.35, 0.7], up: 0.4, W: 1.1, cy: 0.56, ry: 0.52, tuft: 2.2, dens: [0.25, 0.6], along: 0.4, gap: 0.4, dead: true, twigs: [1, 3], bunch: 3 },
  cerisier: { lean: 0.06, sinu: 0.14, w: 0.8, L: [0, 0.25, 0.34, 0.22, 0.12, 0.06], kidsN: [2, 3], kidsT: [0.5, 1.0], share: [0.25, 0.35], ang: [0.55, 0.95], kidsN2: [2, 2], kidsT2: [0.4, 0.95], share2: [0.22, 0.35], ang2: [0.5, 0.9], up: 0.2, W: 1.4, cy: 0.5, ry: 0.54, tuft: 2.0, dens: [0.5, 0.63], along: 0.8, gap: 0.2, twigs: [1, 1], bunch: 2.5 },
};
// Hauteur totale (pied → sommet) d'un adulte de la maquette : 88 px (cerisier 72) pour un fût h = 42 et un rayon r = 20 du plan.
const TOTAL_OF = (sp: RueSpecies): number => (sp === 'cerisier' ? 72 : 88) / 82;
// Échelle d'enveloppe par niveau (arrêt des axes dans la couronne).
const S_LV = [0, 9, 0.85, 0.98, 1.06];
// Décroissance de w² le long d'un axe, par niveau (terminal : 97 %, pointe).
const K_LV = [0, 0.12, 0.2, 0.35, 0.55, 0.97];

export const RUE_BARK_V5: Record<RueSpecies, Rgb> = { platane: hexRgb('#C8B898'), tilleul: hexRgb('#8A7A66'), robinier: hexRgb('#7A6E5E'), frene: hexRgb('#5A5250'), cerisier: hexRgb('#6A5A54') };
const GREEN: Record<RueSpecies, Rgb[]> = {
  platane: ['#4E8A3C', '#6CAE4C', '#9ED06A'].map(hexRgb),
  tilleul: ['#3F7F3A', '#5EA648', '#92C85E'].map(hexRgb),
  robinier: ['#5A7A34', '#7A9A44', '#A8BC60'].map(hexRgb),
  frene: ['#4A7A3C', '#6AA050', '#9CC870'].map(hexRgb),
  cerisier: ['#4A8A42', '#6AB052', '#9CD070'].map(hexRgb),
};
const AUTUMN: Record<RueSpecies, Rgb[]> = {
  platane: ['#A8702A', '#D29A3A', '#EAC060'].map(hexRgb),
  tilleul: ['#B08A2A', '#DDB63A', '#F2DC70'].map(hexRgb),
  robinier: ['#B89A2A', '#DEC040', '#F2E070'].map(hexRgb),
  frene: ['#9A8A3A', '#C8B040', '#E8D060'].map(hexRgb),
  cerisier: ['#A0402A', '#D06A34', '#F0A058'].map(hexRgb),
};
const PINK: Rgb[] = ['#D88AA8', '#F0B0C8', '#FCDCE8'].map(hexRgb);
const DARK: Rgb = [40, 30, 60];
const PALE: Rgb = [255, 250, 240];
const darken = (c: Rgb, k: number): Rgb => mixRgb(c, DARK, k);
const pale = (c: Rgb, k: number): Rgb => mixRgb(c, PALE, k);
const TWIG = '#4A3A30';
const TWIG_FRENE = '#3A3230';
const DEAD = '#8A8078';
const DEAD_RGB = hexRgb(DEAD);

type Kid = { t: number; share: number; side: number; ang: number };
type Tip = { x: number; y: number; dir: number; axis: number; mass: number };

export const rueTreeKey = (pit: Pick<RuePit, 'x'>): string => 'rue' + Math.round(pit.x);

export function rueTreeModelV5(pit: RuePit): RueTreeModel {
  const species = pit.species;
  const key = rueTreeKey(pit);
  const foot = { x: pit.x, y: pit.y };
  const total = (pit.h + 2 * pit.r) * TOTAL_OF(species);
  const P = PORTS[species];
  const rng = mulberry32(hashString('v4-' + key));
  const trunkH = total * P.L[1]!;
  const forkY = foot.y - trunkH;
  const cx = foot.x;
  const cy = forkY - (total - trunkH) * P.cy;
  const rx = (P.W * (total - trunkH)) / 2;
  const ry = (total - trunkH) * P.ry;
  const inside = (x: number, y: number, sc: number): boolean => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= sc * sc;
  const reach = (x: number, y: number, a: number, sc: number): number => {
    if (!inside(x, y, sc)) return 0;
    let lo = 0;
    let hi = Math.max(rx, ry) * 3;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inside(x + Math.cos(a) * mid, y + Math.sin(a) * mid, sc)) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const w0 = (1.0 + total * 0.026) * P.w;
  const axes: RueAxis[] = [];
  const tips: Tip[] = [];
  const rnd = (a: number, b: number): number => a + rng() * (b - a);
  let masses = 0;
  // Trouées (`gap`, sous-arbre d'une branche de niveau 3 sans bouquet) : au plus la moitié des branches + 1 (écart à la maquette :
  // sans ce plafond, un platane sur ~400 sortait sans aucun nuage).
  let lv3n = 0;
  let bareN = 0;
  const gapAt = (hit: boolean): boolean => {
    lv3n++;
    if (!hit || bareN + 1 > lv3n * 0.5 + 1) return false;
    bareN++;
    return true;
  };

  const grow = (x0: number, y0: number, dir: number, len: number, ws: number, lv: number, parent: number, t0: number, cont: boolean, mass: number, dead: boolean, side0: number | undefined, bare = false): void => {
    const sinu = (rng() < 0.5 ? -1 : 1) * len * (lv === 1 ? P.sinu * 0.5 : 0.04 + rng() * 0.07);
    const ex = x0 + Math.cos(dir) * len;
    const ey = y0 + Math.sin(dir) * len;
    const nx = -Math.sin(dir);
    const ny = Math.cos(dir);
    const c1x = (x0 + ex) / 2 + nx * sinu;
    const c1y = (y0 + ey) / 2 + ny * sinu;
    const N = lv <= 2 ? 8 : 5;
    const pt = (t: number): [number, number] => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * c1x + t * t * ex, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * c1y + t * t * ey];
    const tan = (t: number): [number, number] => {
      const dx = 2 * (1 - t) * (c1x - x0) + 2 * t * (ex - c1x);
      const dy = 2 * (1 - t) * (c1y - y0) + 2 * t * (ey - c1y);
      const l = Math.hypot(dx, dy) || 1;
      return [dx / l, dy / l];
    };
    // Filles sur les flancs.
    const kids: Kid[] = [];
    if (lv < 5 && ws > 0.18) {
      const [n0, n1] = lv === 1 ? P.kidsN : P.kidsN2;
      const [ta, tb] = lv === 1 ? P.kidsT : P.kidsT2;
      const [s0, s1] = lv === 1 ? P.share : P.share2;
      const [a0, a1] = lv === 1 ? P.ang : P.ang2;
      const n = lv === 4 ? P.twigs[0] + Math.floor(rng() * (P.twigs[1] - P.twigs[0] + 1)) : n0 + Math.floor(rng() * (n1 - n0 + 1));
      let side = side0 ?? (rng() < 0.5 ? 1 : -1);
      for (let k = 0; k < n; k++) {
        const t = lv === 4 ? Math.min(1, 0.3 + ((k + rng()) / n) * 0.65) : Math.min(1, ta + ((k + rng()) / n) * (tb - ta));
        kids.push({ t, share: lv === 4 ? rnd(0.15, 0.25) : rnd(s0, s1), side, ang: lv === 4 ? rnd(0.5, 0.95) : rnd(a0, a1) });
        if (rng() > 0.2) side = -side;
      }
    }
    const sumShare = kids.reduce((a, k) => a + k.share, 0);
    const norm = sumShare > 0.7 ? 0.7 / sumShare : 1;
    for (const k of kids) k.share *= norm;
    const terminal = lv >= 5 || ws <= 0.18;
    const kT = terminal ? 0.97 : K_LV[lv]!;
    const w2 = (t: number): number => {
      let v = ws * ws * (1 - kT * t);
      for (const k of kids) v -= ws * ws * k.share * smooth(sat((t - k.t) / 0.18 + 0.5));
      return Math.max(terminal ? 0.0004 : 0.02, v);
    };
    const wAt = (t: number): number => {
      let w = Math.sqrt(w2(t));
      if (lv === 1) w *= 1 + 0.75 * Math.exp(-t * 9);
      return w;
    };
    const pts: [number, number][] = [];
    const wl: number[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push(pt(t));
      wl.push(wAt(t));
    }
    const id = axes.length;
    const ax: RueAxis = { level: lv, pts, w: wl, parent, t0, cont, mass, pointed: terminal };
    if (dead) ax.dead = true;
    axes.push(ax);
    const nextLen = (l: number): number => (P.L[l] ?? 0) * total * rnd(0.85, 1.15);
    // Bouquets le long des 3 derniers niveaux.
    if (lv >= 3 && !dead && !bare) {
      for (const t of lv >= 5 ? [0.6, 1.0] : lv === 4 ? [0.4, 0.8] : [0.5]) {
        if (rng() > (lv >= 4 ? P.dens[1] : P.dens[0]) || (t < 1 && rng() > P.along)) continue;
        const [px, py] = pt(t);
        const [tx, ty] = tan(t);
        tips.push({ x: px, y: py, dir: Math.atan2(ty, tx), axis: id, mass });
      }
    }
    if (terminal) return;
    // Départs des filles (au centre de l'axe : raccord plein), puis continuation au bout. Les filles du tronc sont les
    // charpentières (une masse chacune), la continuation du tronc aussi.
    for (const k of kids) {
      const [px, py] = pt(k.t);
      const [tx, ty] = tan(k.t);
      let a = Math.atan2(ty, tx) + k.side * k.ang;
      a += (-Math.PI / 2 - a) * P.up * rnd(0.5, 1.2);
      let l = nextLen(lv + 1);
      if (lv + 1 >= 2) {
        const r = reach(px, py, a, S_LV[Math.min(4, lv + 1)]!);
        if (r > 0) l = Math.min(l, r);
      }
      // Section de Léonard, sans dépasser la mère juste avant le départ (écart à la maquette : une brindille pouvait naître plus
      // large que son rameau quand plusieurs départs se suivent en bout d'axe).
      const wk = Math.min(Math.sqrt(ws * ws * k.share), Math.sqrt(w2(Math.max(0, k.t - 0.09)))) * 0.97;
      const d2 = dead || (!!P.dead && lv + 1 >= 3 && py < cy - ry * 0.5 && rng() < 0.55);
      const b2 = bare || (lv + 1 === 3 && gapAt(rng() < P.gap));
      grow(px, py, a, Math.max(lv >= 4 ? 1.5 : 2.5, l), wk, lv + 1, id, k.t, false, lv === 1 ? masses++ : mass, d2, -k.side, b2);
    }
    const [tx, ty] = tan(1);
    let a = Math.atan2(ty, tx) + (rng() - 0.5) * 0.35;
    a += (-Math.PI / 2 - a) * Math.min(0.8, P.up * 1.6);
    let l = nextLen(lv + 1);
    if (lv + 1 >= 2) {
      const r = reach(ex, ey, a, S_LV[Math.min(4, lv + 1)]!);
      if (r > 0) l = Math.min(l, r);
    }
    const d2 = dead || (!!P.dead && lv + 1 >= 3 && ey < cy - ry * 0.5 && rng() < 0.55);
    const b2 = bare || (lv + 1 === 3 && gapAt(rng() < P.gap));
    grow(ex, ey, a, Math.max(lv >= 4 ? 1.5 : 2.5, l), Math.sqrt(w2(1)) * 0.97, lv + 1, id, 1, true, lv === 1 ? masses++ : mass, d2, side0, b2);
  };
  const lean = (rng() < 0.5 ? -1 : 1) * P.lean * rnd(0.6, 1.3);
  grow(foot.x, foot.y + 0.8, -Math.PI / 2 + lean, trunkH, w0, 1, -1, 0, false, -1, false, lean > 0 ? -1 : 1);

  // Nuages : 1 à 3 par point, tailles variées ; rang (chute) = distance au centre de la couronne (les bouts tombent d'abord).
  const clouds: RueCloud[] = [];
  for (const t of tips) {
    const b = 1 + Math.floor(rng() * P.bunch);
    for (let k = 0; k < b; k++) {
      const r = P.tuft * rnd(0.5, 1.25);
      const x = t.x + (rng() - 0.5) * r * 1.4;
      const y = t.y + (rng() - 0.5) * r * 1.2;
      const dist = Math.hypot((x - cx) / rx, (y - cy) / ry);
      const rot = t.dir + (rng() - 0.5) * 0.8;
      const rank = sat(dist * 0.4 + rng() * 0.3 - 0.12);
      const phase = rng() * TAU;
      const yel = rng();
      const rc = mulberry32(hashString('cl' + phase));
      clouds.push({ x, y, r, rot, k1: 3 + Math.floor(rc() * 3), k2: 6 + Math.floor(rc() * 4), phase, yel, axis: t.axis, mass: t.mass, rank });
    }
  }

  // Boîte : tubes (demi-largeur, ombre décalée, bout arrondi, trait encré), nuages (rayon dentelé ≤ 1,83 r) et leur ombre (+4, +5).
  const box: RueBox = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const grow2 = (x0: number, y0: number, x1: number, y1: number): void => {
    box.x0 = Math.min(box.x0, x0);
    box.y0 = Math.min(box.y0, y0);
    box.x1 = Math.max(box.x1, x1);
    box.y1 = Math.max(box.y1, y1);
  };
  for (const ax of axes)
    ax.pts.forEach(([x, y], i) => {
      const m = 1.8 * ax.w[i]! + 1.5;
      grow2(x - m, y - m - (ax.level === 1 ? 2 : 0), x + m, y + m + (ax.level === 1 ? 2.5 : 0));
    });
  for (const c of clouds) {
    const m = 1.85 * c.r + 0.5;
    grow2(c.x - m, c.y - m, c.x + m + 4, c.y + m + 5);
  }
  return { key, species, foot, total, trunkH, rootY: forkY, w0, axes, clouds, masses, cx, cy, rx, ry, box };
}

// Polygone d'un tube (axe + demi-largeurs) ; bout en pointe pour un axe terminal, arrondi sinon. `dx` : décalage horizontal
// en fraction de la demi-largeur (flanc ombré), `shrink` : retrait de la demi-largeur.
function tubePath(ctx: PaintCtx, ax: RueAxis, dx = 0, shrink = 0): void {
  const { pts, w: ws } = ax;
  const n = pts.length;
  const normal = (i: number): [number, number] => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n - 1, i + 1)]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
  };
  const L: [number, number][] = [];
  const R: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const [nx, ny] = normal(i);
    const w = Math.max(ax.pointed && i === n - 1 ? 0 : 0.12, ws[i]! - shrink);
    L.push([pts[i]![0] + nx * w + dx * ws[i]!, pts[i]![1] + ny * w]);
    R.push([pts[i]![0] - nx * w + dx * ws[i]!, pts[i]![1] - ny * w]);
  }
  ctx.moveTo(L[0]![0], L[0]![1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i]![0], L[i]![1]);
  const last = pts[n - 1]!;
  const prev = pts[n - 2]!;
  const tx = last[0] - prev[0];
  const ty = last[1] - prev[1];
  const tl = Math.hypot(tx, ty) || 1;
  const wl = ws[n - 1]!;
  if (ax.pointed) ctx.lineTo(last[0] + (tx / tl) * 0.6 + dx * wl, last[1] + (ty / tl) * 0.6);
  else ctx.quadraticCurveTo(last[0] + (tx / tl) * wl * 1.2 + dx * wl, last[1] + (ty / tl) * wl * 1.2, R[n - 1]![0], R[n - 1]![1]);
  for (let i = n - 2; i >= 0; i--) ctx.lineTo(R[i]![0], R[i]![1]);
  ctx.closePath();
}

// Axes dessinés en traits dégressifs (demi-largeur de départ < 0,5 px) ; les autres sont des tubes encrés.
export const isTwig = (ax: RueAxis): boolean => ax.w[0]! < 0.5;

export type RueSkeletonOpts = { wet?: number };
// Squelette complet (toujours, quelle que soit la date) : brindilles en traits dégressifs (2 w par segment, 0,25 px minimum)
// sous les tubes, trait encré commun (1,3 px tronc et charpentières, 0,9 px branches), tubes pleins, flanc droit ombré (tubes
// décalés de 0,55 w découpés dans le squelette vivant), écorce qui pèle (platane), crevasses (frêne), nœuds au départ des
// charpentières, bois mort gris. `wet` (pluie 0..1) : écorce 35 % plus sombre (comme `paintTrunk`).
export function paintRueSkeleton(ctx: PaintCtx, m: RueTreeModel, opts: RueSkeletonOpts = {}): void {
  const wet = opts.wet ?? 0;
  const bark0 = RUE_BARK_V5[m.species];
  const bark = wet ? mixRgb(bark0, hexRgb('#2A2420'), 0.35 * wet) : bark0;
  const thick = m.axes.filter((a) => !isTwig(a));
  const thin = m.axes.filter(isTwig);
  const live = thick.filter((a) => !a.dead);
  const dead = thick.filter((a) => a.dead);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const twigTone = m.species === 'frene' ? TWIG_FRENE : TWIG;
  const buckets = new Map<string, { w: number; dead: boolean; segs: [[number, number], [number, number]][] }>();
  for (const a of thin)
    for (let i = 0; i + 1 < a.pts.length; i++) {
      const w = Math.max(0.25, Math.round((a.w[i]! + a.w[i + 1]!) * 2 * 10) / 10);
      const k = (a.dead ? 'd' : 'v') + w;
      let b = buckets.get(k);
      if (!b) buckets.set(k, (b = { w, dead: !!a.dead, segs: [] }));
      b.segs.push([a.pts[i]!, a.pts[i + 1]!]);
    }
  for (const [, b] of buckets) {
    ctx.strokeStyle = b.dead ? DEAD : twigTone;
    ctx.lineWidth = b.w;
    ctx.beginPath();
    for (const [p0, p1] of b.segs) {
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (const a of thick) if (a.level >= 3) tubePath(ctx, a);
  ctx.stroke();
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (const a of thick) if (a.level < 3) tubePath(ctx, a);
  ctx.stroke();
  ctx.fillStyle = rgba(bark, 1);
  ctx.beginPath();
  for (const a of live) tubePath(ctx, a);
  ctx.fill();
  if (dead.length) {
    ctx.fillStyle = rgba(DEAD_RGB, 1);
    ctx.beginPath();
    for (const a of dead) tubePath(ctx, a);
    ctx.fill();
  }
  ctx.save();
  ctx.beginPath();
  for (const a of live) tubePath(ctx, a);
  ctx.clip();
  ctx.fillStyle = rgba(darken(bark, 0.42), 1);
  ctx.beginPath();
  for (const a of live) tubePath(ctx, a, 0.55, 0.1);
  ctx.fill();
  const tr = m.axes[0]!;
  if (m.species === 'platane') {
    ctx.fillStyle = rgba(pale(bark, 0.5), 1);
    const r = mulberry32(hashString('ecorce' + m.key));
    for (let i = 0; i < 9; i++) {
      const t = 0.1 + r() * 0.85;
      const k = Math.floor(t * (tr.pts.length - 1));
      const [x, y] = tr.pts[k]!;
      ctx.fillRect(x - tr.w[k]! * 0.8 + r() * tr.w[k]! * 1.3, y - 2 + r() * 3, 1, 1.5 + r());
    }
  }
  if (m.species === 'frene') {
    ctx.strokeStyle = 'rgba(42,34,56,0.35)';
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    for (const k of [-0.45, 0, 0.45]) {
      ctx.moveTo(tr.pts[0]![0] + k * tr.w[0]!, tr.pts[0]![1]);
      for (let i = 1; i < tr.pts.length; i++) ctx.lineTo(tr.pts[i]![0] + k * tr.w[i]!, tr.pts[i]![1]);
    }
    ctx.stroke();
  }
  // Nœuds : petites ombres au départ des charpentières.
  ctx.fillStyle = rgba(darken(bark, 0.3), 1);
  for (const a of live)
    if (a.level === 2) {
      ctx.beginPath();
      ctx.arc(a.pts[0]![0], a.pts[0]![1] + 0.6, a.w[0]! * 0.5, 0, TAU);
      ctx.fill();
    }
  ctx.restore();
  ctx.lineCap = 'butt';
}

// Taille d'un nuage à une date (0 = absent) : sat((d − rang)/0,36), d du calendrier `foliageOf` de l'arbre ; cerisier en fleurs :
// au moins la floraison (`bloomOf`).
export function rueCloudSize(m: RueTreeModel, c: RueCloud, D: Pick<FondMoment, 'doy'>): number {
  const f = foliageOf(D, m.key, m.species);
  const bloom = m.species === 'cerisier' ? bloomOf(D, 'cerisier') : 0;
  let size = sat((f.d - c.rank) / 0.36);
  if (bloom > 0) size = Math.max(size, bloom);
  return size;
}

export type RueCloudItem = { c: RueCloud; rr: number; x: number; y: number; tones: Rgb[]; i: number };
export type RueCloudOpts = { mass?: number; part?: 'leaves' | 'shadow'; wet?: number; shiftX?: number; shiftY?: number };
// Nuages visibles à la date `D` (taille > 0), avec leurs tons : vert de l'essence → automne par nuage (les bouts d'abord), rose
// du cerisier en fleurs, assombris sous la pluie. `mass` : une seule charpentière (calque au vent) ; `shiftX/Y` : vent (les
// bouts bougent plus que le cœur).
export function rueCloudItems(m: RueTreeModel, D: Pick<FondMoment, 'doy'>, opts: RueCloudOpts = {}): RueCloudItem[] {
  const sp = m.species;
  const f = foliageOf(D, m.key, sp);
  const bloom = sp === 'cerisier' ? bloomOf(D, 'cerisier') : 0;
  const yel0 = f.yel ?? 0;
  const wet = opts.wet ?? 0;
  const sx = opts.shiftX ?? 0;
  const sy = opts.shiftY ?? 0;
  const out: RueCloudItem[] = [];
  m.clouds.forEach((c, i) => {
    if (opts.mass !== undefined && c.mass !== opts.mass) return;
    let size = sat((f.d - c.rank) / 0.36);
    if (bloom > 0) size = Math.max(size, bloom);
    if (size <= 0) return;
    const y = sat(yel0 * 1.5 + c.rank * 0.5 + c.yel * 0.2 - 0.4);
    let tones = GREEN[sp].map((g, k) => mixRgb(g, AUTUMN[sp][k]!, y));
    if (bloom > 0) tones = PINK.map((p, k) => mixRgb(p, tones[k]!, 1 - bloom));
    if (wet) tones = tones.map((t) => mixRgb(t, hexRgb('#1A2A3A'), 0.28 * wet));
    out.push({ c, rr: c.r * size, x: c.x + (sx ? sx * (0.5 + c.rank) : 0), y: c.y + (sy ? sy * (0.5 + c.rank) : 0), tones, i });
  });
  return out;
}

// Nuage dentelé (16 sommets, fréquences propres k1, k2), allongé × 1,25 / 0,85 dans le sens `rot`.
function leafCloud(ctx: PaintCtx, x: number, y: number, r: number, ph: number, dir: number, k1: number, k2: number): void {
  const c = Math.cos(dir);
  const s = Math.sin(dir);
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + 0.2 * Math.sin(k1 * a + ph) + 0.14 * Math.sin(k2 * a + 2.3 * ph) + (i % 2 ? 0.12 : -0.08);
    const px = Math.cos(a) * r * k * 1.25;
    const py = Math.sin(a) * r * k * 0.85;
    const X = x + px * c - py * s;
    const Y = y + px * s + py * c;
    if (i === 0) ctx.moveTo(X, Y);
    else ctx.lineTo(X, Y);
  }
  ctx.closePath();
}

// Feuillage : 'shadow' (ombre portée violette décalée de +4, +5) ou 'leaves' (pointillé encré 0,7 px à 55 %, ombre, ton moyen
// décalé en haut à gauche × 0,7, une touche claire si r > 1,6). En hiver (nu), rien n'est dessiné.
export function paintRueClouds(ctx: PaintCtx, m: RueTreeModel, D: Pick<FondMoment, 'doy'>, opts: RueCloudOpts = {}): void {
  const items = rueCloudItems(m, D, opts);
  if (!items.length) return;
  const cloud = (it: RueCloudItem, dx = 0, dy = 0, sc = 1): void => leafCloud(ctx, it.x + dx, it.y + dy, it.rr * sc, it.c.phase, it.c.rot, it.c.k1, it.c.k2);
  if (opts.part === 'shadow') {
    ctx.fillStyle = 'rgba(70,50,130,0.16)';
    ctx.beginPath();
    for (const it of items) cloud(it, 4, 5, 1.05);
    ctx.fill();
    return;
  }
  ctx.save();
  ctx.setLineDash?.([1.4, 1.1]);
  ctx.strokeStyle = 'rgba(42,34,56,0.55)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (const it of items) cloud(it);
  ctx.stroke();
  ctx.setLineDash?.([]);
  ctx.restore();
  const groups = new Map<string, RueCloudItem[]>();
  for (const it of items) {
    const k = it.tones[0]!.join(',');
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(it);
  }
  for (const [, g] of groups) {
    ctx.fillStyle = rgba(g[0]!.tones[0]!, 1);
    ctx.beginPath();
    for (const it of g) cloud(it);
    ctx.fill();
  }
  for (const [, g] of groups) {
    ctx.fillStyle = rgba(g[0]!.tones[1]!, 1);
    ctx.beginPath();
    for (const it of g) cloud(it, -it.rr * 0.22, -it.rr * 0.3, 0.7);
    ctx.fill();
  }
  for (const [, g] of groups) {
    ctx.fillStyle = rgba(g[0]!.tones[2]!, 1);
    ctx.beginPath();
    for (const it of g) {
      if (it.rr < 1.6) continue;
      const r = mulberry32(hashString('hi' + it.c.phase));
      const a = -2.5 + r() * 1.4;
      const dd = it.rr * (0.2 + r() * 0.4);
      const ex = it.x + Math.cos(a) * dd;
      const ey = it.y + Math.sin(a) * dd;
      ctx.moveTo(ex + 0.8, ey);
      ctx.ellipse(ex, ey, Math.min(1.0, it.rr * 0.3), Math.min(0.5, it.rr * 0.16), a + 0.6, 0, TAU);
    }
    ctx.fill();
  }
  // Pluie : reflets en arc sur le haut des nuages (comme la colline).
  const wet = opts.wet ?? 0;
  if (wet) {
    ctx.strokeStyle = `rgba(230,240,255,${Number((0.35 * wet).toFixed(3))})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (const it of items) {
      if (it.rr < 1.2) continue;
      ctx.moveTo(it.x + Math.cos(Math.PI * 1.1) * it.rr * 0.8, it.y + Math.sin(Math.PI * 1.1) * it.rr * 0.8);
      ctx.arc(it.x, it.y, it.rr * 0.8, Math.PI * 1.1, Math.PI * 1.5);
    }
    ctx.stroke();
  }
}
