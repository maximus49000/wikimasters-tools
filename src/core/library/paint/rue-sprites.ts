import { lampLit, type Lamp } from '../city/lamps';
import { hashString, mulberry32 } from '../scene-world';
import { INK, TAU, fillRect, shade } from './cel';
import { mixRgb, hexRgb, rgba, type Rgb } from './color';
import { bloomOf, foliageOf, smooth, type FondMeteo, type FondMoment } from './fond-time';
import { STIFF, gustOf, gustPeriod, massAmp, windAt, type Gust, type Wind } from './fond-vent';
import type { Grade } from './grade';
import { paintBranches, paintLeaves, treeModelOf, tuftState, type TreeModel } from './hill-trees';
import type { PaintCtx } from './paint-ctx';
import { paintRueClouds, paintRueSkeleton, rueCloudItems, rueTreeKey, rueTreeModelV5, type RueTreeModel } from './rue-trees';
import type { RuePit } from './rue-verte-plan';
import { PIT, YOUNG_BARK, paintPitFront, paintTuteur, pitTopOf, rueWet } from './rue-verte-painter';

// Sprites cuits des arbres de la rue (calque `arbres-rue`) : par fosse plantée, des couches peintes une fois par (date, pluie,
// neige, étalonnage) : ombre portée du feuillage, couche FIXE (squelette entier + lèvre de terre + grille ou herbe du carré,
// jamais transformée), puis une couche par charpentière (`mass`) qui ne contient QUE ses nuages de feuilles, translatée au vent.
// Adultes : modèle V5 « squelette continu » (`rue-trees.ts`, maquette rue-arbres-naturels validée le 2026-10-24). Jeunes au
// tuteur (1 place sur 10) : ancien modèle de la colline (`hill-trees`, 3 niveaux, 20 touffes) comme dans la maquette, avec le
// collet de la maquette et toutes leurs branches dans la couche fixe (rien ne flotte). La pose de chaque image (`rueTreePose`)
// est une fonction pure de (fosse, t, vent) : le calque ne fait qu'écrire des matrices à 15 Hz. Le sol (bordure, terre,
// fleurs, flaque, ombre portée du fût) est dans les tranches.

export type RueLayerName = 'shadow' | 'trunk' | 'c0' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5';

// Arbre d'une fosse plantée : modèle V5 (adulte) ou ancien modèle (jeune), mémorisé par fosse. Champs communs : `foot`,
// `rootY`, `trunkH`, `cx`, `cy`, `rx`, `ry`, `box`.
export type RueTree = { young: false; m: RueTreeModel } | { young: true; m: TreeModel };
// Jeune arbre au tuteur : fût v.h, ramure 2 r, 3 niveaux, ≤ 20 touffes de 0,42 r, fût de 0,7 px (port de hill-trees ; essence
// sans port propre dans hill-trees : port « bouquet »).
export const rueYoungModel = (v: RuePit): TreeModel => treeModelOf(rueTreeKey(v), v.species, { x: v.x, y: v.y }, v.h, v.r * 2, 3, v.r * 0.42, 20, 0.7);
const TREES = new WeakMap<RuePit, RueTree>();
export function rueTreeOf(v: RuePit): RueTree {
  let tr = TREES.get(v);
  if (!tr) TREES.set(v, (tr = v.young ? { young: true, m: rueYoungModel(v) } : { young: false, m: rueTreeModelV5(v) }));
  return tr;
}
// Haut du houppier (départ des feuilles qui tombent).
const crownTop = (tr: RueTree): number => (tr.young ? tr.m.top : tr.m.foot.y - tr.m.total);

// Nombre de couches de feuillage (une par charpentière, 6 au plus : la charpentière k ≥ 5 va dans `c5`).
export const rueMassCount = (tr: RueTree): number => Math.max(1, Math.min(6, tr.young ? tr.m.segs.filter((sg) => sg.lv === 1).length : tr.m.masses));

// Couches d'un arbre, dans l'ordre de dessin (nombre fixe pour la vie de la scène : le squelette ne change jamais).
export function rueLayers(tr: RueTree): RueLayerName[] {
  const out: RueLayerName[] = ['shadow', 'trunk'];
  for (let k = 0; k < rueMassCount(tr); k++) out.push(`c${k}` as RueLayerName);
  return out;
}

// Déplacement maximal (px) du feuillage par rapport au bois sous le vent : les couches de feuillage sont translatées, le
// squelette ne bouge pas ; au-delà d'1 px, un nuage de 1 à 3,5 px quitterait son rameau.
export const RUE_WIND_MAX = 1;

// Boîte fixe des sprites d'une fosse (repère du monde) : boîte du modèle (tubes + nuages + ombre), carré de terre (lèvre,
// grille, herbe : ± PIT.w / 2 + 0,8, du haut du carré à la bordure), plus la marge du vent (RUE_WIND_MAX) et 1 px.
export function rueSpriteBox(v: RuePit): { x: number; y: number; w: number; h: number } {
  const { box: b } = rueTreeOf(v).m;
  const pad = RUE_WIND_MAX + 1;
  const half = PIT.w / 2 + 0.8;
  const x0 = Math.min(b.x0, v.x - half) - pad;
  const y0 = Math.min(b.y0, pitTopOf(v) - 0.8) - pad;
  const x1 = Math.max(b.x1, v.x + half) + pad;
  const y1 = Math.max(b.y1, pitTopOf(v) + PIT.h + 0.6) + pad;
  const x = Math.floor(x0);
  const y = Math.floor(y0);
  return { x, y, w: Math.ceil(x1) - x, h: Math.ceil(y1) - y };
}

// Fût d'un jeune arbre avec collet (maquette `paintTrunk(…, collet)`) : évasé sur ses 3,2 derniers px (1,25 → 1,9 w0) et
// enfoncé de 0,8 px sous la terre (la lèvre est repeinte devant), flanc droit ombré, trait encré.
function paintYoungTrunk(ctx: PaintCtx, m: TreeModel, bark0: Rgb, wet: number): void {
  const bark = wet ? mixRgb(bark0, hexRgb('#2A2420'), 0.35 * wet) : bark0;
  const { foot, rootY, w0 } = m;
  const tb = w0 * 1.25;
  const tt = w0 * 0.8;
  const fy = foot.y + 0.8;
  ctx.beginPath();
  ctx.moveTo(foot.x - tb * 1.9, fy);
  ctx.quadraticCurveTo(foot.x - tb * 1.05, fy - 1.2, foot.x - tb, fy - 3.2);
  ctx.lineTo(foot.x - tt, rootY);
  ctx.lineTo(foot.x + tt, rootY);
  ctx.lineTo(foot.x + tb, fy - 3.2);
  ctx.quadraticCurveTo(foot.x + tb * 1.05, fy - 1.2, foot.x + tb * 1.9, fy);
  ctx.closePath();
  ctx.fillStyle = rgba(bark, 1);
  ctx.fill();
  ctx.save();
  ctx.clip();
  fillRect(ctx, shade(bark, 0.4), foot.x + tt * 0.2, rootY, tb * 2, m.trunkH + 2);
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

// Une couche d'un arbre, en coordonnées du monde (l'appelant décale le canvas sur la boîte de `rueSpriteBox`).
export function paintRueLayer(ctx: PaintCtx, v: RuePit, layer: RueLayerName, D: FondMoment): void {
  const tr = rueTreeOf(v);
  const wet = rueWet(D);
  if (!tr.young) {
    const m = tr.m;
    if (layer === 'shadow') paintRueClouds(ctx, m, D, { part: 'shadow' });
    else if (layer === 'trunk') {
      paintRueSkeleton(ctx, m, { wet, snow: D.meteo.snow });
      paintPitFront(ctx, v);
    } else paintRueClouds(ctx, m, D, { mass: Number(layer.slice(1)), wet });
    return;
  }
  const m = tr.m;
  const f = foliageOf(D, m.key, v.species);
  if (layer === 'shadow') paintLeaves(ctx, m, f, D, 0, { part: 'shadow' });
  else if (layer === 'trunk') {
    paintYoungTrunk(ctx, m, YOUNG_BARK, wet);
    // Toutes les branches, toujours (comme le squelette V5) : les touffes restantes sont toujours sur du bois.
    paintBranches(ctx, m, 'all', { snow: D.meteo.snow });
    paintTuteur(ctx, v);
    paintPitFront(ctx, v);
  } else paintLeaves(ctx, m, f, D, 0, { which: Number(layer.slice(1)), wet });
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

// Lavis posé sur les pixels déjà peints de la couche (`source-atop` : jamais hors du houppier ni empilé d'une couche à l'autre).
// Couches `trunk` (fût) et `c*` (dessous du houppier) seulement.
export function paintRueLampWash(ctx: PaintCtx, v: RuePit, layer: RueLayerName, washes: readonly RueLampWash[]): void {
  const crown = layer[0] === 'c';
  if (!washes.length || (!crown && layer !== 'trunk')) return;
  const { m } = rueTreeOf(v);
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'source-atop';
  for (const { k, side } of washes) {
    if (crown) {
      ctx.fillStyle = `rgba(255,214,140,${k.toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(m.cx + side * m.rx * 0.3, m.cy + m.ry * 0.35, m.rx * 0.8, m.ry * 0.5, 0, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(255,214,140,${(k * 0.7).toFixed(3)})`;
      ctx.fillRect(v.x - 3, m.rootY, 6, v.y - m.rootY);
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

// Amplitude d'une charpentière (px par unité de vent, comme `massAmp`) : plus forte pour les masses hautes et écartées du tronc.
function massAmpV5(m: RueTreeModel, k: number): number {
  const cl = m.clouds.filter((c) => Math.min(5, c.mass) === k);
  if (!cl.length) return 1;
  const mx = cl.reduce((a, c) => a + c.x, 0) / cl.length;
  const my = cl.reduce((a, c) => a + c.y, 0) / cl.length;
  return 0.8 + (1.2 * Math.abs(mx - m.foot.x)) / Math.max(1, m.rx) + (0.8 * (m.cy - my)) / Math.max(1, m.ry);
}
// Amplitudes des couches de feuillage (calculées une fois : la pose est lue à 15 Hz).
const AMPS = new WeakMap<object, number[]>();
const ampsOf = (tr: RueTree): number[] => {
  let a = AMPS.get(tr.m);
  if (!a) AMPS.set(tr.m, (a = Array.from({ length: rueMassCount(tr) }, (_, k) => (tr.young ? massAmp(tr.m, k) : massAmpV5(tr.m, k)))));
  return a;
};

export type RueTreePose = { masses: { dx: number; dy: number }[] };
// Gain du vent sur le feuillage : déplacement brut (b × amplitude × oscillation, ≈ 0 à 5) ramené à l'échelle de RUE_WIND_MAX,
// puis saturé en douceur (tanh) : linéaire par vent faible, jamais plus de RUE_WIND_MAX px du bois.
const WIND_GAIN = 0.35;

// Pose d'un arbre à l'instant `t` (s) sous le vent `w` : `b` = vent local × raideur (jeune 1,8, × 1,25 sous la pluie, × 1,3 par
// orage) ; chaque couche de feuillage : translation b × amplitude × oscillation propre (deux sinus déphasés par arbre et par
// couche) et légère remontée, saturée à RUE_WIND_MAX px. La couche fixe (squelette, carré) n'a pas de pose. Vent calme (ou
// mouvement réduit, vent nul passé par l'appelant) : pose nulle. `width` : largeur de la scène (départ des rafales).
export function rueTreePose(v: RuePit, tr: RueTree, t: number, w: Wind, width = 1440): RueTreePose {
  const amps = ampsOf(tr);
  const n = amps.length;
  const wind = windAt(v.x, t, w, width);
  if (wind === 0) return { masses: Array.from({ length: n }, () => ({ dx: 0, dy: 0 })) };
  const stiff = (v.young ? 1.8 : STIFF[v.species] || 1) * (1 + 0.25 * (w.wet || 0)) * (w.storm ? 1.3 : 1);
  const b = wind * stiff;
  const masses = Array.from({ length: n }, (_, k) => {
    const ph = v.x * 0.37 + k * 1.9;
    const osc = 0.7 + 0.3 * Math.sin(t * (2.6 + k * 0.7) + ph) + 0.15 * Math.sin(t * 7.3 + ph * 2);
    const dx = b * amps[k]! * osc * WIND_GAIN;
    const dy = -Math.abs(b) * 0.25 * (0.5 + 0.5 * Math.sin(t * 3.1 + ph)) * WIND_GAIN;
    const h = Math.hypot(dx, dy);
    const s = h > 0 ? (RUE_WIND_MAX * Math.tanh(h / RUE_WIND_MAX)) / h : 0;
    return { dx: dx * s, dy: dy * s };
  });
  return { masses };
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

// Touffes / nuages qui peuvent partir (lâches en automne : au bord de la densité du jour ; en avril, ceux du bout des branches
// des cerisiers en fleur) : centre, rayon du jour, couleur de la feuille.
export type RueLoose = { x: number; y: number; rr: number; color: string };
export function rueLooseOf(v: RuePit, D: Pick<FondMoment, 'doy'>): { loose: RueLoose[]; petals: boolean; d: number } {
  const tr = rueTreeOf(v);
  const f = foliageOf(D, rueTreeKey(v), v.species);
  const bloom = v.species === 'cerisier' ? bloomOf(D, 'cerisier') : 0;
  const petals = bloom > 0.3;
  const loose: RueLoose[] = [];
  if ((f.drop > 0 && f.drop < 1) || petals) {
    if (tr.young)
      for (const tf of tr.m.tufts) {
        const st = tuftState(tf, f, D, v.species);
        if (petals ? st.size > 0 && tf.rank > 0.5 : st.loose && st.size > 0) loose.push({ x: tf.x, y: tf.y, rr: tf.rr, color: petals ? '#F6C0D4' : hexOf(st.tones[1]!) });
      }
    else
      for (const it of rueCloudItems(tr.m, D))
        if (petals ? it.c.rank > 0.5 : f.d - it.c.rank < 0.1) loose.push({ x: it.x, y: it.y, rr: it.rr, color: petals ? '#F6C0D4' : hexOf(it.tones[1]!) });
  }
  return { loose, petals, d: f.d };
}
// Arbres de la scène pour un jour : source, et places du pool par genre (mémorisé par liste et par jour).
type TreeInfo = { v: RuePit; d: number; top: number; cx: number; cy: number; ground: number; loose: RueLoose[]; petals: boolean; slots: Record<RueParticleKind, { from: number; n: number }>; memo: Draws };
// Tirages mémorisés (la boucle tourne à 15 images/s : ni clé texte ni générateur recréés à chaque image). Mêmes clés, mêmes
// tirages dans le même ordre que `rngOf(clé)`, donc mêmes valeurs. `cycle` : derniers tirages par place (cycle `n`) ;
// `once` : tirage fixe par place ; `gust` : tirage par rafale `k`, par place (vidé au-delà de 16 rafales).
type Draws = { cycle: Map<string, { n: number; v: number[] }>; once: Map<string, number>; gust: Map<string, Map<number, number>> };
function drawsOf(key: string, count: number): number[] {
  const r = rngOf(key);
  return Array.from({ length: count }, () => r());
}
function cycleDraws(d: Draws, slot: string, n: number, key: () => string, count: number): number[] {
  const hit = d.cycle.get(slot);
  if (hit && hit.n === n) return hit.v;
  const v = drawsOf(key(), count);
  d.cycle.set(slot, { n, v });
  return v;
}
function onceDraw(d: Draws, slot: string, key: () => string): number {
  let v = d.once.get(slot);
  if (v === undefined) d.once.set(slot, (v = rngOf(key())()));
  return v;
}
function gustDraw(d: Draws, slot: string, k: number, key: () => string): number {
  let m = d.gust.get(slot);
  if (!m) d.gust.set(slot, (m = new Map()));
  let v = m.get(k);
  if (v === undefined) {
    if (m.size >= 16) m.clear();
    m.set(k, (v = rngOf(key())()));
  }
  return v;
}
// Itérateur sur des tirages mémorisés (remplace les appels successifs `rk()`).
const seq = (v: readonly number[]): (() => number) => {
  let i = 0;
  return () => v[i++]!;
};
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
  const trees = pits.map((v): TreeInfo => {
    const tr = rueTreeOf(v);
    const { loose, petals, d } = rueLooseOf(v, D);
    return { v, d, top: crownTop(tr), cx: tr.m.cx, cy: tr.m.cy, ground: v.y - 0.5, loose, petals, slots: {} as TreeInfo['slots'], memo: { cycle: new Map(), once: new Map(), gust: new Map() } };
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
    const life = (tr.ground - (tr.top - 2)) / fallV + LEAF_GROUND_S + LEAF_FADE_S;
    const C = life + LEAF_WINDOW_S;
    const x = tr.v.x;
    for (let j = 0; j < s.n; j++) {
      const slot = `${kind}${j}`;
      const phase = onceDraw(tr.memo, slot, () => `place-${kind}-${Math.round(x)}-${j}`) * C;
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
        if (gustDraw(tr.memo, slot, k, () => `lache-${Math.round(x)}-${j}-${k}`) >= p) continue;
        tp = pass + (j % 4) * 0.25;
        break;
      }
      if (Number.isNaN(tp) || t < tp) continue;
      const rk = seq(cycleDraws(tr.memo, slot, n, () => `part-${Math.round(x)}-${j}-${n}`, 6));
      const o = tr.loose[Math.floor(rk() * tr.loose.length)]!;
      const x0 = o.x + (rk() - 0.5) * o.rr;
      const y0 = o.y + (rk() - 0.5) * o.rr;
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
      const slot = `goutte${j}`;
      const phase = onceDraw(tr.memo, slot, () => `place-goutte-${Math.round(v.x)}-${j}`) * per;
      const n = Math.floor((t - phase) / per);
      const tb = n * per + phase;
      const a = t - tb;
      if (a > fall + SPLASH_S || !(weatherAt(hist, tb).meteo.precip > 0)) continue;
      const x = cx + (cycleDraws(tr.memo, slot, n, () => `goutte-${Math.round(v.x)}-${j}-${n}`, 1)[0]! - 0.5) * r * 1.5;
      if (!inside(x)) continue;
      const onGround = a >= fall;
      out.push({ kind: 'goutte', x, y: onGround ? ground : y0 + 40 * a, rot: 0, color: '#D2E6FF', id: `goutte-${Math.round(v.x)}-${j}-${n}`, slot: sd.from + j, alpha: onGround ? Math.max(0, 1 - (a - fall) / SPLASH_S) : 1, born: { x, y: y0 } });
    }
    // Neige qui glisse des branches : décidée à la naissance (neige posée et rafale de plus de 1 à cet instant).
    const sn = tr.slots.neige;
    for (let j = 0; j < sn.n; j++) {
      // Cycle plus long que la chute la plus longue (paquet parti du haut du houppier) + l'éclaboussure.
      const per = Math.max(2.4 + (j % 2) * 0.9, Math.sqrt((ground - (cy - r * 0.3)) / 18) + SPLASH_S + 0.2);
      const slot = `neige${j}`;
      const phase = onceDraw(tr.memo, slot, () => `place-neige-${Math.round(v.x)}-${j}`) * per;
      const n = Math.floor((t - phase) / per);
      const tb = n * per + phase;
      const bw = weatherAt(hist, tb);
      const rk = seq(cycleDraws(tr.memo, slot, n, () => `neige-${Math.round(v.x)}-${j}-${n}`, 3));
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
      const slot = `graine${j}`;
      const phase = onceDraw(tr.memo, slot, () => `place-graine-${Math.round(v.x)}-${j}`) * C;
      const n = Math.floor((t - phase) / C);
      const rk = seq(cycleDraws(tr.memo, slot, n, () => `graine-${Math.round(v.x)}-${j}-${n}`, 3));
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
// se perche 20-40 s dans un arbre feuillu (adulte) de cette bande, repart par l'autre bord. Jamais la nuit ni sous forte pluie
// (`birdAway`) : `awaySince` est l'instant (s de scène) depuis lequel il en est ainsi (null : temps propice ; −Infinity : déjà
// ainsi à l'ouverture). Aucune arrivée après cet instant ; un oiseau déjà là ne disparaît pas sur place : en vol d'arrivée, il
// se pose puis repart aussitôt ; perché, il s'envole à cet instant ; en partance, il finit son vol.
// `dir` : sens du vol d'arrivée (la tête posée regarde par là).
const BANDS = new WeakMap<readonly RuePit[], { adults: RuePit[]; bands: number[] }>();
// Durée (s) de chaque vol (arrivée, départ) ; cycle des visites (s) : une visite (≤ 40 + 6 + 40 + 6 s) tient dans son cycle.
const BIRD_FLIGHT = 6;
export const BIRD_CYCLE = 110;
export const birdAway = (D: FondMoment, dark: boolean): boolean => dark || D.meteo.precip > 0.4;
// Suivi de `awaySince` image après image (appelant) : `prev` undefined à la première image (déjà hostile : −Infinity, rien à
// montrer). Redevenu propice, l'instant est gardé jusqu'à la fin du cycle de la dernière image hostile : une visite écourtée
// ne réapparaît jamais en cours de route.
export type BirdAway = { since: number; cycle: number } | null;
export function nextBirdAway(prev: BirdAway | undefined, away: boolean, t: number): BirdAway {
  const cycle = Math.floor(t / BIRD_CYCLE);
  if (away) return { since: prev === undefined ? -Infinity : prev ? prev.since : t, cycle };
  return prev && cycle <= prev.cycle ? prev : null;
}
export function rueBird(items: readonly RuePit[], D: FondMoment, t: number, width: number, awaySince: number | null = null): { x: number; y: number; flying: boolean; flap: number; dir: 1 | -1 } | null {
  if (awaySince === -Infinity) return null;
  let memo = BANDS.get(items);
  if (!memo) {
    const adults = items.filter((p) => p.kind === 'pit' && !p.empty && !p.young);
    BANDS.set(items, (memo = { adults, bands: [...new Set(adults.map((p) => Math.floor(p.x / 480)))].sort((a, b) => a - b) }));
  }
  const { adults, bands } = memo;
  if (!bands.length) return null;
  const k = Math.floor(t / BIRD_CYCLE);
  const band = bands[Math.floor(rngOf(`oiseau-bande-${k}`)() * bands.length)]!;
  const rk = rngOf(`oiseau-${band}-${k}`);
  const trees = adults.filter((p) => Math.floor(p.x / 480) === band);
  const v = trees[Math.floor(rk() * trees.length)]!;
  if (foliageOf(D, 'rue' + Math.round(v.x), v.species).d < 0.3) return null;
  const { m } = rueTreeOf(v);
  const t0 = k * BIRD_CYCLE + rk() * 40;
  let perch = 20 + rk() * 20;
  const a = t - t0;
  const fromLeft = rk() < 0.5;
  const px = m.cx + (rk() - 0.5) * v.r;
  const py = m.cy - v.r * 0.3;
  // Temps devenu hostile : pas d'arrivée après coup ; sinon le perchoir s'écourte (envol à cet instant, ou dès le poser).
  if (awaySince !== null) {
    if (awaySince <= t0) return null;
    perch = Math.min(perch, Math.max(0, awaySince - t0 - BIRD_FLIGHT));
  }
  if (a < 0 || a > BIRD_FLIGHT + perch + BIRD_FLIGHT) return null;
  const start = fromLeft ? -20 : width + 20;
  const end = fromLeft ? width + 20 : -20;
  const dir = fromLeft ? 1 : -1;
  // Battement amorti au poser et à l'envol (aucun saut vertical).
  if (a < BIRD_FLIGHT) {
    const q = smooth(a / BIRD_FLIGHT);
    return { x: start + (px - start) * q, y: py - 30 * (1 - q) + Math.sin(a * 5) * 1.5 * (1 - q), flying: true, flap: Math.sin(a * 14) * 0.8, dir };
  }
  if (a < BIRD_FLIGHT + perch) return { x: px, y: py, flying: false, flap: 0, dir };
  const d = a - BIRD_FLIGHT - perch;
  const q = smooth(d / BIRD_FLIGHT);
  return { x: px + (end - px) * q, y: py - 30 * q + Math.sin(d * 5) * 1.5 * q, flying: true, flap: Math.sin(a * 14) * 0.8, dir };
}
