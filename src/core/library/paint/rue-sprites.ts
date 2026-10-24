import { lampLit, type Lamp } from '../city/lamps';
import { hashString, mulberry32 } from '../scene-world';
import { TAU } from './cel';
import type { Rgb } from './color';
import { bloomOf, foliageOf, smooth, type FondMoment } from './fond-time';
import { STIFF, gustsAt, massAmp, windAt, type Wind } from './fond-vent';
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
// Fonctions pures de (fosses, jour, t, vent) : le calque les pose dans un pool fixe de nœuds à 15 Hz. Jamais rien de créé sur
// place : feuilles et pétales naissent à une touffe (lâche) du houppier au passage d'une rafale, dérivent, tournoient,
// retombent au sol et y restent 50 s, ou sortent par un bord ; gouttes et neige tombent du houppier ; graines dérivent depuis
// la ramure ; l'oiseau arrive et repart en vol par un bord. Le mouvement réduit est géré par l'appelant (rien du tout).
export type RueParticleKind = 'feuille' | 'petale' | 'goutte' | 'neige' | 'graine';
// `born` : point de naissance (feuilles et pétales : la touffe d'où ils partent).
export type RueParticle = { kind: RueParticleKind; x: number; y: number; rot: number; color: string; born?: { x: number; y: number } };
export const RUE_PARTICLE_CAP = { feuilles: 40, petales: 30, gouttes: 24, neige: 16, graines: 20 } as const;
export const RUE_PARTICLE_KINDS: readonly RueParticleKind[] = ['feuille', 'petale', 'goutte', 'neige', 'graine'];
export const RUE_CAP_OF: Record<RueParticleKind, number> = { feuille: RUE_PARTICLE_CAP.feuilles, petale: RUE_PARTICLE_CAP.petales, goutte: RUE_PARTICLE_CAP.gouttes, neige: RUE_PARTICLE_CAP.neige, graine: RUE_PARTICLE_CAP.graines };
export const RUE_POOL = RUE_PARTICLE_KINDS.reduce((a, k) => a + RUE_CAP_OF[k], 0);
const hexOf = (c: Rgb): string => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

// Touffes qui peuvent partir (lâches en automne ; en avril, les touffes du bout des branches des cerisiers en fleur), par
// modèle et par jour (la pose est lue à 15 Hz).
type Loose = { tf: Tuft; color: string }[];
const LOOSE = new WeakMap<TreeModel, { doy: number; list: Loose }>();
function looseOf(v: RuePit, m: TreeModel, D: FondMoment, petals: number): Loose {
  const hit = LOOSE.get(m);
  if (hit && hit.doy === D.doy) return hit.list;
  const f = foliageOf(D, 'rue' + Math.round(v.x), v.species);
  const list: Loose = [];
  for (const tf of m.tufts) {
    const st = tuftState(tf, f, D, v.species);
    if (petals > 0.3 ? st.size > 0 && tf.rank > 0.5 : st.loose && st.size > 0) list.push({ tf, color: petals > 0.3 ? '#F6C0D4' : hexOf(st.tones[1]!) });
  }
  LOOSE.set(m, { doy: D.doy, list });
  return list;
}

export function rueParticles(items: readonly RuePit[], D: FondMoment, t: number, w: Wind, width: number): RueParticle[] {
  const out: RueParticle[] = [];
  const n: Record<RueParticleKind, number> = { feuille: 0, petale: 0, goutte: 0, neige: 0, graine: 0 };
  const push = (p: RueParticle): void => {
    if (n[p.kind] >= RUE_CAP_OF[p.kind] || p.x < -5 || p.x > width + 5) return;
    n[p.kind]++;
    out.push(p);
  };
  const dir = w.dir;
  const force = w.wind;
  const wet = D.meteo.precip > 0;
  for (const v of items) {
    if (v.kind !== 'pit' || v.empty) continue;
    const m = rueTreeModel(v);
    const f = foliageOf(D, 'rue' + Math.round(v.x), v.species);
    const r = v.r;
    const cx = v.x + v.lean;
    const cy = m.cy;
    const ground = v.y - 0.5;
    const petals = v.species === 'cerisier' ? bloomOf(D, 'cerisier') : 0;
    // Feuilles (automne) ou pétales (avril) : à chaque rafale qui passe l'arbre, quelques touffes lâchent leurs feuilles.
    if (force >= 0.05 && ((f.drop > 0 && f.drop < 1) || petals > 0.3)) {
      const loose = looseOf(v, m, D, petals);
      const kind: RueParticleKind = petals > 0.3 ? 'petale' : 'feuille';
      if (loose.length)
        for (const g of gustsAt(t, w, width)) {
          const tp = g.tk + (v.x - g.x0) / (g.dir * g.speed);
          if (tp > t || t - tp > 60) continue;
          const rk = mulberry32(hashString(`part-${Math.round(v.x)}-${g.k}`) >>> 0);
          const cnt = Math.min(6, 1 + Math.floor(g.A * 3));
          for (let j = 0; j < cnt; j++) {
            if (n[kind] >= RUE_CAP_OF[kind]) break;
            const o = loose[Math.floor(rk() * loose.length)]!;
            const born = tp + j * 0.2 + rk() * 0.3;
            const a = t - born;
            const x0 = o.tf.x + (rk() - 0.5) * o.tf.rr;
            const y0 = o.tf.y + (rk() - 0.5) * o.tf.rr;
            const vx = dir * (14 + 22 * force) * (0.7 + rk() * 0.6);
            const fallV = kind === 'petale' ? 2.2 : 3.6;
            const flut = 1.5 + rk() * 2;
            if (a < 0) continue;
            const land = (ground - y0) / fallV;
            const aa = Math.min(a, land);
            const x = x0 + vx * aa * (1 - 0.3 * Math.min(1, aa / 4)) + Math.sin(aa * 3 + j) * flut;
            const y = aa >= land ? ground : y0 + fallV * aa - 2.5 * Math.sin(Math.min(aa, 1.2) * 2.6);
            if (a - land > 50) continue;
            push({ kind, x, y, rot: ((aa * 4 + j) * 180) / Math.PI, color: o.color, born: { x: x0, y: y0 } });
          }
        }
    }
    // Gouttes sous la pluie : tombent des masses basses (3 par arbre).
    if (wet && f.d > 0.1)
      for (let j = 0; j < 3; j++) {
        const per = 1.1 + j * 0.37;
        const k = Math.floor(t / per);
        const rk = mulberry32(hashString(`goutte-${Math.round(v.x)}-${j}-${k}`) >>> 0);
        const x = cx + (rk() - 0.5) * r * 1.5;
        const y = cy + r * 0.5 + 40 * (t - k * per);
        if (y < ground) push({ kind: 'goutte', x, y, rot: 0, color: '#D2E6FF' });
      }
    // Neige qui glisse des branches par rafale.
    if (D.meteo.snow && Math.abs(windAt(v.x, t, w, width)) > 1)
      for (let j = 0; j < 2; j++) {
        const per = 2.4 + j * 0.9;
        const k = Math.floor(t / per);
        const rk = mulberry32(hashString(`neige-${Math.round(v.x)}-${j}-${k}`) >>> 0);
        if (rk() < 0.5) continue;
        const x = cx + (rk() - 0.5) * r * 1.6;
        const a = t - k * per;
        const y = cy - r * 0.3 + rk() * r + 18 * a * a;
        if (y < ground) push({ kind: 'neige', x, y, rot: 0, color: '#F2F6FA' });
      }
    // Graines et chatons en suspension (mai – juin, tilleuls et platanes).
    if (D.doy >= 125 && D.doy < 175 && (v.species === 'tilleul' || v.species === 'platane') && force > 0.05)
      for (let j = 0; j < 3; j++) {
        const per = 0.9 + j * 0.5;
        const k = Math.floor(t / per);
        const rk = mulberry32(hashString(`graine-${Math.round(v.x)}-${j}-${k}`) >>> 0);
        const a = t - k * per;
        const x = cx + (rk() - 0.5) * r + dir * (10 + 15 * force) * a;
        const y = cy - r * 0.2 + 1.5 * a + Math.sin(a * 2 + j) * 1.5;
        if (a < 8 && y < ground) push({ kind: 'graine', x, y, rot: 0, color: '#FFFAEB' });
      }
  }
  return out;
}

// Oiseau qui se pose dans un arbre : toutes les ~110 s, un oiseau (un seul dans la scène : la maquette en tire un par bande
// de 480 px ; ici une bande tirée par cycle, jamais deux visites qui se chevauchent) arrive en vol par un bord de la scène,
// se perche 20-40 s dans un arbre feuillu (adulte) de cette bande, repart par l'autre bord. Jamais la nuit ni sous forte pluie.
export function rueBird(items: readonly RuePit[], D: FondMoment, t: number, dark: boolean, width: number): { x: number; y: number; flying: boolean; flap: number } | null {
  if (dark || D.meteo.precip > 0.4) return null;
  const k = Math.floor(t / 110);
  const adults = items.filter((p) => p.kind === 'pit' && !p.empty && !p.young);
  const bands = [...new Set(adults.map((p) => Math.floor(p.x / 480)))].sort((a, b) => a - b);
  if (!bands.length) return null;
  const rb = mulberry32(hashString(`oiseau-bande-${k}`) >>> 0);
  const band = bands[Math.floor(rb() * bands.length)]!;
  const rk = mulberry32(hashString(`oiseau-${band}-${k}`) >>> 0);
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
  if (a < 6) {
    const q = smooth(a / 6);
    return { x: start + (px - start) * q, y: py - 30 * (1 - q) + Math.sin(a * 5) * 1.5, flying: true, flap: Math.sin(a * 14) * 0.8 };
  }
  if (a < 6 + perch) return { x: px, y: py, flying: false, flap: 0 };
  const q = smooth((a - 6 - perch) / 6);
  return { x: px + (end - px) * q, y: py - 30 * q + Math.sin(a * 5) * 1.5, flying: true, flap: Math.sin(a * 14) * 0.8 };
}
