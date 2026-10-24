import { lampLit, type Lamp } from '../city/lamps';
import { hashString, mulberry32 } from '../scene-world';
import { TAU } from './cel';
import type { Rgb } from './color';
import { bloomOf, foliageOf, smooth, type FondMeteo, type FondMoment } from './fond-time';
import { STIFF, gustOf, gustPeriod, massAmp, windAt, type Gust, type Wind } from './fond-vent';
import type { Grade } from './grade';
import { paintBranches, paintDryLeaves, paintLeaves, paintTrunk, tuftState, type TreeModel, type Tuft } from './hill-trees';
import type { PaintCtx } from './paint-ctx';
import type { RuePit } from './rue-verte-plan';
import { paintTuteur, rueBark, rueTreeModel, rueWet } from './rue-verte-painter';

// Sprites cuits des arbres de la rue (calque `arbres-rue`, PR 3) : port de `treeSprites` / `paintArbresRue` de la maquette
// fond-ville (`04a-vent.js`, notes §3 c, §3 d « Vent, nouveau rendu »). Par fosse plantée, des couches peintes une fois par
// (date, pluie, neige, étalonnage) : ombre des masses, fût + tuteur + charpentières (jamais transformés), rameaux fins (+ voile,
// neige, feuilles sèches : léger cisaillement), une couche par grappe de touffes (`cluster` 0-5 : translation propre au vent),
// rehauts et rehauts pâles (opacité). La pose de chaque image (`rueTreePose`) est une fonction pure de (fosse, t, vent) :
// le calque ne fait qu'écrire des attributs à 15 Hz. Le sol (grille, fleurs, flaque, ombre portée du fût) est dans les tranches.

export type RueLayerName = 'shadow' | 'trunk' | 'twigs' | 'c0' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'hi' | 'pale';

// Nombre de grappes d'un arbre (une par charpentière, 6 au plus : `cluster` = min(5, charpentière)).
export const rueMassCount = (m: TreeModel): number => Math.max(1, Math.min(6, m.segs.filter((sg) => sg.lv === 1).length));

// Couches d'un arbre, dans l'ordre de dessin (nombre fixe pour la vie de la scène : le squelette ne change jamais).
export function rueLayers(m: TreeModel): RueLayerName[] {
  const out: RueLayerName[] = ['shadow', 'trunk', 'twigs'];
  for (let k = 0; k < rueMassCount(m); k++) out.push(`c${k}` as RueLayerName);
  out.push('hi', 'pale');
  return out;
}

// Boîte fixe des sprites d'une fosse (repère du monde) : envergure du modèle + marge 0,6 r (+ 6 px sur les côtés, 4 en haut,
// 2 sous le pied), étendue à la boîte de dessin du modèle et à l'ombre des masses (décalée de +4, +5).
export function rueSpriteBox(v: RuePit): { x: number; y: number; w: number; h: number } {
  const m = rueTreeModel(v);
  const pad = v.r * 0.6;
  const x0 = Math.min(m.span[0] - pad - 6, m.box.x0 - 2);
  const y0 = Math.min(m.top - pad - 4, m.box.y0 - 2);
  const x1 = Math.max(m.span[1] + pad + 6, m.box.x1 + 6);
  const y1 = Math.max(v.y + pad + 2, m.box.y1 + 6);
  const x = Math.floor(x0);
  const y = Math.floor(y0);
  return { x, y, w: Math.ceil(x1) - x, h: Math.ceil(y1) - y };
}

// Une couche d'un arbre, en coordonnées du monde (l'appelant décale le canvas sur la boîte de `rueSpriteBox`).
export function paintRueLayer(ctx: PaintCtx, v: RuePit, layer: RueLayerName, D: FondMoment): void {
  const m = rueTreeModel(v);
  const f = foliageOf(D, 'rue' + Math.round(v.x), v.species);
  const wet = rueWet(D);
  if (layer === 'shadow') paintLeaves(ctx, m, f, D, 0, { part: 'shadow' });
  else if (layer === 'trunk') {
    paintTrunk(ctx, m, rueBark(v), 0, wet, v.young);
    paintTuteur(ctx, v);
    paintBranches(ctx, m, 'coarse');
  } else if (layer === 'twigs') {
    paintBranches(ctx, m, 'fine', { d: f.d, veil: 0.12, snow: D.meteo.snow });
    paintDryLeaves(ctx, m, D);
  } else if (layer === 'hi') paintLeaves(ctx, m, f, D, 0, { part: 'hi', wet });
  else if (layer === 'pale') paintLeaves(ctx, m, f, D, 0, { part: 'hi', pale: true });
  // Grappe : toutes ses touffes, lâches comprises (elles suivent leur grappe ; la maquette les redessine une à une).
  else paintLeaves(ctx, m, f, D, 0, { which: Number(layer.slice(1)), wet });
}

// Lavis chaud des lampadaires allumés (port de `paintLightsRue`) : dessous du houppier côté lampe et fût, à moins de 40 px
// d'un lampadaire allumé. `k` arrondi au vingtième (clé de cuisson) ; liste vide de jour ou loin des lampes.
export type RueLampWash = { k: number; side: number };
export function rueLampWash(v: RuePit, lamps: readonly Lamp[], minutes: number, daylight: number, dim: number): RueLampWash[] {
  if (dim <= 0) return [];
  const out: RueLampWash[] = [];
  for (const l of lamps) {
    const d = Math.abs(l.x - v.x);
    if (d > 40 || !lampLit(l, minutes, daylight)) continue;
    const k = Math.round((1 - d / 40) * 0.35 * Math.min(1, dim) * 20) / 20;
    if (k > 0) out.push({ k, side: Math.sign(l.x - v.x) });
  }
  return out;
}

// Lavis posé sur les pixels déjà peints de la couche (`source-atop` : jamais hors du houppier ni empilé d'une grappe à l'autre).
// Couches `trunk` et `c*` seulement.
export function paintRueLampWash(ctx: PaintCtx, v: RuePit, layer: RueLayerName, washes: readonly RueLampWash[]): void {
  const crown = layer[0] === 'c';
  if (!washes.length || (!crown && layer !== 'trunk')) return;
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'source-atop';
  for (const { k, side } of washes) {
    if (crown) {
      const cy = v.y - v.h - v.r * 0.75;
      ctx.fillStyle = `rgba(255,214,140,${k.toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(v.x + v.lean + side * v.r * 0.3, cy + v.r * 0.35, v.r * 0.8, v.r * 0.5, 0, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(255,214,140,${(k * 0.7).toFixed(3)})`;
      ctx.fillRect(v.x - 1.5, v.y - v.h, 3, v.h);
    }
  }
  ctx.globalCompositeOperation = prev;
}

// Étalonnage cuit dans les pixels d'une couche (matrice `gradeFor` de grade.ts, en sRGB, sur les couleurs non prémultipliées
// d'un `getImageData`, comme le feColorMatrix des tranches) : pas de filtre SVG recalculé à chaque image. Alpha intact.
export function gradePixels(d: Uint8ClampedArray, g: Grade): void {
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i]! / 255, gr = d[i + 1]! / 255, b = d[i + 2]! / 255, a = d[i + 3]! / 255;
    for (let c = 0; c < 3; c++) d[i + c] = Math.round((g[c * 5]! * r + g[c * 5 + 1]! * gr + g[c * 5 + 2]! * b + g[c * 5 + 3]! * a + g[c * 5 + 4]!) * 255);
  }
}

// Amplitudes des grappes d'un modèle (calculées une fois : la pose est lue à 15 Hz).
const AMPS = new WeakMap<TreeModel, number[]>();
const ampsOf = (m: TreeModel): number[] => {
  let a = AMPS.get(m);
  if (!a) AMPS.set(m, (a = Array.from({ length: rueMassCount(m) }, (_, k) => massAmp(m, k))));
  return a;
};

export type RueTreePose = { twigShear: number; masses: { dx: number; dy: number }[]; hiAlpha: number; paleAlpha: number; hiDx: number; paleDx: number };

// Pose d'un arbre à l'instant `t` (s) sous le vent `w` (port de `paintArbresRue`) : `b` = vent local × raideur (jeune 1,8,
// × 1,25 sous la pluie, × 1,3 par orage) ; rameaux : cisaillement de 3 % de b autour de la racine des charpentières (`rootY`) ;
// grappes : translation b × massAmp × oscillation propre (deux sinus déphasés par arbre et par grappe) et légère remontée ;
// rehauts : frémissement au-delà de 0,04 de vent, face claire au-delà de 0,9 (décalés comme dans la maquette). Le fût et les
// charpentières n'ont pas de pose. Vent calme (ou mouvement réduit, vent nul passé par l'appelant) : pose nulle.
// `width` : largeur de la scène (point de départ des rafales quand le vent souffle vers la gauche).
export function rueTreePose(v: RuePit, m: TreeModel, t: number, w: Wind, width = 1440): RueTreePose {
  const amps = ampsOf(m);
  const n = amps.length;
  const wind = windAt(v.x, t, w, width);
  if (wind === 0) return { twigShear: 0, masses: Array.from({ length: n }, () => ({ dx: 0, dy: 0 })), hiAlpha: 0, paleAlpha: 0, hiDx: 0, paleDx: 0 };
  const stiff = (v.young ? 1.8 : STIFF[v.species] || 1) * (1 + 0.25 * (w.wet || 0)) * (w.storm ? 1.3 : 1);
  const b = wind * stiff;
  const masses = Array.from({ length: n }, (_, k) => {
    const ph = v.x * 0.37 + k * 1.9;
    const osc = 0.7 + 0.3 * Math.sin(t * (2.6 + k * 0.7) + ph) + 0.15 * Math.sin(t * 7.3 + ph * 2);
    return { dx: b * amps[k]! * osc, dy: -Math.abs(b) * 0.25 * (0.5 + 0.5 * Math.sin(t * 3.1 + ph)) };
  });
  const a = Math.abs(wind);
  const hiAlpha = a > 0.04 ? Math.max(0, 0.5 * Math.min(1, a * 2) * (0.5 + 0.5 * Math.sin(t * (5 + (v.x % 7)) + v.x * 0.3) * Math.sin(t * 2.3 + v.x))) : 0;
  const paleAlpha = a > 0.9 ? Math.min(0.7, (a - 0.9) * 0.8) * (0.6 + 0.4 * Math.sin(t * 9 + v.x)) : 0;
  return { twigShear: 0.03 * b, masses, hiAlpha, paleAlpha, hiDx: b * 1.4, paleDx: b * 1.6 };
}

// ───────────── Particules et oiseaux (port de `paintParticlesArbre` / `paintBirdsArbre`, notes §3 c) ─────────────
// Fonctions pures de (fosses, jour, t, vent) : le calque les pose dans un pool fixe de nœuds à 15 Hz. Rien n'apparaît ni ne
// disparaît sur place : chaque particule occupe une PLACE fixe du pool (plafond par genre réparti d'avance entre les arbres
// concernés, jamais dépassé) et sa vie entière est décidée à sa naissance (instant, point de départ, trajet, fin). Elle naît à
// sa source (touffe lâche, dessous du houppier, ramure) et ne finit qu'en se posant au sol (puis fond dans le tapis peint des
// tranches ou s'efface en éclaboussure) ou en sortant par un bord. Une place ne porte qu'une vie à la fois : ses cycles sont
// plus longs que la vie la plus longue. Le mouvement réduit est géré par l'appelant (rien du tout).
export type RueParticleKind = 'feuille' | 'petale' | 'goutte' | 'neige' | 'graine';
// `id` : clé de naissance (même particule d'une image à l'autre) ; `slot` : place dans la part du pool de son genre ;
// `alpha` : opacité de fin de vie (fondu au sol) ; `born` : point de naissance.
export type RueParticle = { kind: RueParticleKind; x: number; y: number; rot: number; color: string; id: string; slot: number; alpha: number; born: { x: number; y: number } };
export const RUE_PARTICLE_CAP = { feuilles: 40, petales: 30, gouttes: 24, neige: 16, graines: 20 } as const;
export const RUE_PARTICLE_KINDS: readonly RueParticleKind[] = ['feuille', 'petale', 'goutte', 'neige', 'graine'];
export const RUE_CAP_OF: Record<RueParticleKind, number> = { feuille: RUE_PARTICLE_CAP.feuilles, petale: RUE_PARTICLE_CAP.petales, goutte: RUE_PARTICLE_CAP.gouttes, neige: RUE_PARTICLE_CAP.neige, graine: RUE_PARTICLE_CAP.graines };
export const RUE_POOL = RUE_PARTICLE_KINDS.reduce((a, k) => a + RUE_CAP_OF[k], 0);
// Feuilles posées : 50 s au sol, puis 3 s de fondu dans le tapis de feuilles des tranches. Fenêtre de naissance d'une place
// (une rafale qui passe l'arbre dans ces 30 s) ; gouttes et neige : éclaboussure qui s'efface ; graines : fondu au sol.
const LEAF_GROUND_S = 50;
const LEAF_FADE_S = 3;
const LEAF_WINDOW_S = 30;
const SPLASH_S = 0.3;
const SEED_FADE_S = 2;
const hexOf = (c: Rgb): string => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const rngOf = (key: string): (() => number) => mulberry32(hashString(key) >>> 0);

// Touffes qui peuvent partir (lâches en automne ; en avril, les touffes du bout des branches des cerisiers en fleur).
type Loose = { tf: Tuft; color: string }[];
// Arbres de la scène pour un jour : modèle, feuillage, source, et places du pool par genre (mémorisé par liste et par jour).
type TreeInfo = { v: RuePit; m: TreeModel; d: number; cx: number; cy: number; ground: number; loose: Loose; petals: boolean; slots: Record<RueParticleKind, { from: number; n: number }> };
const INFOS = new WeakMap<readonly RuePit[], { key: string; trees: TreeInfo[] }>();

// Répartit un plafond entre `n` arbres : parts égales, le reste aux premiers.
function share(cap: number, ok: boolean[]): { from: number; n: number }[] {
  const n = ok.filter(Boolean).length;
  let from = 0;
  let rank = 0;
  return ok.map((on) => {
    if (!on || !n) return { from: 0, n: 0 };
    const k = Math.floor(cap / n) + (rank++ < cap % n ? 1 : 0);
    const out = { from, n: k };
    from += k;
    return out;
  });
}

function treesOf(items: readonly RuePit[], D: FondMoment): TreeInfo[] {
  // Répartition des places : ne dépend que du jour (jamais de la météo, qui ne décide que des naissances).
  const key = `${D.doy}`;
  const hit = INFOS.get(items);
  if (hit && hit.key === key) return hit.trees;
  const pits = items.filter((v) => v.kind === 'pit' && !v.empty);
  const trees = pits.map((v) => {
    const m = rueTreeModel(v);
    const f = foliageOf(D, 'rue' + Math.round(v.x), v.species);
    const bloom = v.species === 'cerisier' ? bloomOf(D, 'cerisier') : 0;
    const petals = bloom > 0.3;
    const loose: Loose = [];
    if ((f.drop > 0 && f.drop < 1) || petals)
      for (const tf of m.tufts) {
        const st = tuftState(tf, f, D, v.species);
        if (petals ? st.size > 0 && tf.rank > 0.5 : st.loose && st.size > 0) loose.push({ tf, color: petals ? '#F6C0D4' : hexOf(st.tones[1]!) });
      }
    return { v, m, d: f.d, cx: v.x + v.lean, cy: m.cy, ground: v.y - 0.5, loose, petals, slots: {} as TreeInfo['slots'] };
  });
  const seeds = D.doy >= 125 && D.doy < 175;
  const ok: Record<RueParticleKind, boolean[]> = {
    feuille: trees.map((tr) => !tr.petals && tr.loose.length > 0),
    petale: trees.map((tr) => tr.petals && tr.loose.length > 0),
    goutte: trees.map((tr) => tr.d > 0.1),
    neige: trees.map(() => true),
    graine: trees.map((tr) => seeds && (tr.v.species === 'tilleul' || tr.v.species === 'platane')),
  };
  for (const kind of RUE_PARTICLE_KINDS) share(RUE_CAP_OF[kind], ok[kind]).forEach((s, i) => (trees[i]!.slots[kind] = s));
  INFOS.set(items, { key, trees });
  return trees;
}

// Instant de passage d'une rafale au droit de `x`.
const passOf = (g: Gust, x: number): number => g.tk + (x - g.x0) / (g.dir * g.speed);

// Météo à la naissance : tout ce dont dépend le trajet d'une particule (force et sens du vent, pluie, orage, neige) est lu
// à sa naissance et gardé toute sa vie ; seules les naissances suivantes prennent la nouvelle météo (jamais de saut quand la
// météo change). `from` : instant (s, même horloge que `t`) depuis lequel cette météo s'applique ; liste triée.
export type RueWeather = { from: number; w: Wind; meteo: FondMeteo };
function weatherAt(hist: readonly RueWeather[], tb: number): RueWeather {
  let cur = hist[0]!;
  for (const h of hist) {
    if (h.from > tb) break;
    cur = h;
  }
  return cur;
}
// Probabilité qu'une place lâche une feuille au passage d'une rafale : le débit suit la force du vent (rien sous 0,05).
const shedProb = (force: number): number => (force < 0.05 ? 0 : Math.min(1, force));

export function rueParticles(items: readonly RuePit[], D: FondMoment, t: number, w: Wind, width: number, history?: readonly RueWeather[]): RueParticle[] {
  const out: RueParticle[] = [];
  const trees = treesOf(items, D);
  const hist = history && history.length ? history : [{ from: -Infinity, w, meteo: D.meteo }];
  const inside = (x: number): boolean => x >= -5 && x <= width + 5;
  // Feuilles et pétales : chaque place, à chaque cycle, part au passage d'une rafale de sa fenêtre de naissance ; une rafale
  // fait partir 1 + ⌊amplitude × 3⌋ places de l'arbre au plus (maquette), chacune avec une probabilité qui suit le vent.
  for (const tr of trees) {
    const kind: RueParticleKind = tr.petals ? 'petale' : 'feuille';
    const s = tr.slots[kind];
    if (!s.n) continue;
    const fallV = tr.petals ? 2.2 : 3.6;
    const life = (tr.ground - (tr.m.top - 2)) / fallV + LEAF_GROUND_S + LEAF_FADE_S;
    const C = life + LEAF_WINDOW_S;
    const x = tr.v.x;
    for (let j = 0; j < s.n; j++) {
      const phase = rngOf(`place-${kind}-${Math.round(x)}-${j}`)() * C;
      const n = Math.floor((t - phase) / C);
      const lo = n * C + phase;
      // Dernier départ possible (décalage de place compris) : la vie finit avant le cycle suivant.
      const hi = lo + LEAF_WINDOW_S - 1;
      if (t < lo) continue;
      const bw = weatherAt(hist, lo);
      const force = bw.w.wind;
      const p = shedProb(force);
      if (!p) continue;
      const dir = bw.w.dir;
      const P = gustPeriod(bw.w);
      // Première rafale qui passe l'arbre dans [lo, hi] et qui fait partir cette place (les passages croissent avec k).
      let tp = NaN;
      for (let k = Math.floor((lo - (x - (dir > 0 ? -300 : width + 300)) / (dir * (50 + 60 * force))) / P) - 1; ; k++) {
        const g = gustOf(k, bw.w, width);
        const pass = passOf(g, x);
        if (pass > hi) break;
        if (pass < lo || j % 6 >= 1 + Math.floor(g.A * 3)) continue;
        if (rngOf(`lache-${Math.round(x)}-${j}-${k}`)() >= p) continue;
        tp = pass + (j % 4) * 0.25;
        break;
      }
      if (Number.isNaN(tp) || t < tp) continue;
      const rk = rngOf(`part-${Math.round(x)}-${j}-${n}`);
      const o = tr.loose[Math.floor(rk() * tr.loose.length)]!;
      const x0 = o.tf.x + (rk() - 0.5) * o.tf.rr;
      const y0 = o.tf.y + (rk() - 0.5) * o.tf.rr;
      const vx = dir * (14 + 22 * force) * (0.7 + rk() * 0.6);
      const flut = 1.5 + rk() * 2;
      const ph = rk() * TAU;
      const a = t - tp;
      const land = (tr.ground - y0) / fallV;
      if (a > land + LEAF_GROUND_S + LEAF_FADE_S) continue;
      const aa = Math.min(a, land);
      const px = x0 + vx * aa * (1 - 0.3 * Math.min(1, aa / 4)) + (Math.sin(aa * 3 + ph) - Math.sin(ph)) * flut;
      if (!inside(px)) continue;
      const py = aa >= land ? tr.ground : y0 + fallV * aa - 2.5 * Math.sin(Math.min(aa, 1.2) * 2.6);
      const alpha = a > land + LEAF_GROUND_S ? Math.max(0, 1 - (a - land - LEAF_GROUND_S) / LEAF_FADE_S) : 1;
      out.push({ kind, x: px, y: py, rot: ((aa * 4 + ph) * 180) / Math.PI, color: o.color, id: `${kind}-${Math.round(x)}-${j}-${n}`, slot: s.from + j, alpha, born: { x: x0, y: y0 } });
    }
  }
  for (const tr of trees) {
    const { v, cx, cy, ground } = tr;
    const r = v.r;
    // Gouttes : tombent du dessous du houppier à 40 px/s s'il pleuvait à leur naissance, éclaboussure qui s'efface au sol.
    const sd = tr.slots.goutte;
    for (let j = 0; j < sd.n; j++) {
      const y0 = cy + r * 0.5;
      const fall = (ground - y0) / 40;
      const per = Math.max(fall + SPLASH_S + 0.2, 1.1 + (j % 3) * 0.37);
      const phase = rngOf(`place-goutte-${Math.round(v.x)}-${j}`)() * per;
      const n = Math.floor((t - phase) / per);
      const tb = n * per + phase;
      const a = t - tb;
      if (a > fall + SPLASH_S || !(weatherAt(hist, tb).meteo.precip > 0)) continue;
      const x = cx + (rngOf(`goutte-${Math.round(v.x)}-${j}-${n}`)() - 0.5) * r * 1.5;
      if (!inside(x)) continue;
      const onGround = a >= fall;
      out.push({ kind: 'goutte', x, y: onGround ? ground : y0 + 40 * a, rot: 0, color: '#D2E6FF', id: `goutte-${Math.round(v.x)}-${j}-${n}`, slot: sd.from + j, alpha: onGround ? Math.max(0, 1 - (a - fall) / SPLASH_S) : 1, born: { x, y: y0 } });
    }
    // Neige qui glisse des branches : décidée à la naissance (neige posée et rafale de plus de 1 à cet instant).
    const sn = tr.slots.neige;
    for (let j = 0; j < sn.n; j++) {
      // Cycle plus long que la chute la plus longue (paquet parti du haut du houppier) + l'éclaboussure.
      const per = Math.max(2.4 + (j % 2) * 0.9, Math.sqrt((ground - (cy - r * 0.3)) / 18) + SPLASH_S + 0.2);
      const phase = rngOf(`place-neige-${Math.round(v.x)}-${j}`)() * per;
      const n = Math.floor((t - phase) / per);
      const tb = n * per + phase;
      const bw = weatherAt(hist, tb);
      const rk = rngOf(`neige-${Math.round(v.x)}-${j}-${n}`);
      if (!bw.meteo.snow || rk() < 0.5 || Math.abs(windAt(v.x, tb, bw.w, width)) <= 1) continue;
      const x = cx + (rk() - 0.5) * r * 1.6;
      const y0 = cy - r * 0.3 + rk() * r;
      if (y0 >= ground || !inside(x)) continue;
      const fall = Math.sqrt((ground - y0) / 18);
      const a = t - tb;
      if (a > fall + SPLASH_S) continue;
      const onGround = a >= fall;
      out.push({ kind: 'neige', x, y: onGround ? ground : y0 + 18 * a * a, rot: 0, color: '#F2F6FA', id: `neige-${Math.round(v.x)}-${j}-${n}`, slot: sn.from + j, alpha: onGround ? Math.max(0, 1 - (a - fall) / SPLASH_S) : 1, born: { x, y: y0 } });
    }
    // Graines et chatons : partent de la ramure, dérivent sous le vent de leur naissance en descendant, se posent et s'effacent.
    const sg = tr.slots.graine;
    for (let j = 0; j < sg.n; j++) {
      const y0 = cy - r * 0.2;
      const land = (ground - y0) / 1.5;
      const C = land + SEED_FADE_S + 3;
      const phase = rngOf(`place-graine-${Math.round(v.x)}-${j}`)() * C;
      const n = Math.floor((t - phase) / C);
      const rk = rngOf(`graine-${Math.round(v.x)}-${j}-${n}`);
      const tb = n * C + phase + rk() * 3;
      const a = t - tb;
      if (a < 0 || a > land + SEED_FADE_S) continue;
      const bw = weatherAt(hist, tb);
      if (bw.w.wind <= 0.05) continue;
      const x0 = cx + (rk() - 0.5) * r;
      const ph = rk() * TAU;
      const aa = Math.min(a, land);
      const x = x0 + bw.w.dir * (10 + 15 * bw.w.wind) * aa;
      if (!inside(x)) continue;
      const y = Math.min(ground, y0 + 1.5 * aa + (Math.sin(aa * 2 + ph) - Math.sin(ph)) * 1.5 * (1 - aa / land));
      out.push({ kind: 'graine', x, y, rot: 0, color: '#FFFAEB', id: `graine-${Math.round(v.x)}-${j}-${n}`, slot: sg.from + j, alpha: a > land ? Math.max(0, 1 - (a - land) / SEED_FADE_S) : 1, born: { x: x0, y: y0 } });
    }
  }
  return out;
}

// Oiseau qui se pose dans un arbre : toutes les ~110 s, un oiseau (un seul dans la scène : la maquette en tire un par bande
// de 480 px ; ici une bande tirée par cycle, jamais deux visites qui se chevauchent) arrive en vol par un bord de la scène,
// se perche 20-40 s dans un arbre feuillu (adulte) de cette bande, repart par l'autre bord. Jamais la nuit ni sous forte pluie.
// `dir` : sens du vol d'arrivée (la tête posée regarde par là).
const BANDS = new WeakMap<readonly RuePit[], { adults: RuePit[]; bands: number[] }>();
export function rueBird(items: readonly RuePit[], D: FondMoment, t: number, dark: boolean, width: number): { x: number; y: number; flying: boolean; flap: number; dir: 1 | -1 } | null {
  if (dark || D.meteo.precip > 0.4) return null;
  let memo = BANDS.get(items);
  if (!memo) {
    const adults = items.filter((p) => p.kind === 'pit' && !p.empty && !p.young);
    BANDS.set(items, (memo = { adults, bands: [...new Set(adults.map((p) => Math.floor(p.x / 480)))].sort((a, b) => a - b) }));
  }
  const { adults, bands } = memo;
  if (!bands.length) return null;
  const k = Math.floor(t / 110);
  const band = bands[Math.floor(rngOf(`oiseau-bande-${k}`)() * bands.length)]!;
  const rk = rngOf(`oiseau-${band}-${k}`);
  const trees = adults.filter((p) => Math.floor(p.x / 480) === band);
  const v = trees[Math.floor(rk() * trees.length)]!;
  if (foliageOf(D, 'rue' + Math.round(v.x), v.species).d < 0.3) return null;
  const m = rueTreeModel(v);
  const t0 = k * 110 + rk() * 40;
  const perch = 20 + rk() * 20;
  const a = t - t0;
  const fromLeft = rk() < 0.5;
  const px = m.cx + (rk() - 0.5) * v.r;
  const py = m.cy - v.r * 0.3;
  if (a < 0 || a > 6 + perch + 6) return null;
  const start = fromLeft ? -20 : width + 20;
  const end = fromLeft ? width + 20 : -20;
  const dir = fromLeft ? 1 : -1;
  // Battement amorti au poser et à l'envol (aucun saut vertical).
  if (a < 6) {
    const q = smooth(a / 6);
    return { x: start + (px - start) * q, y: py - 30 * (1 - q) + Math.sin(a * 5) * 1.5 * (1 - q), flying: true, flap: Math.sin(a * 14) * 0.8, dir };
  }
  if (a < 6 + perch) return { x: px, y: py, flying: false, flap: 0, dir };
  const q = smooth((a - 6 - perch) / 6);
  return { x: px + (end - px) * q, y: py - 30 * q + Math.sin(a * 5) * 1.5 * q, flying: true, flap: Math.sin(a * 14) * 0.8, dir };
}
