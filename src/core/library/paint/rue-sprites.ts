import { lampLit, type Lamp } from '../city/lamps';
import { TAU } from './cel';
import { foliageOf, type FondMoment } from './fond-time';
import { STIFF, massAmp, windAt, type Wind } from './fond-vent';
import type { Grade } from './grade';
import { paintBranches, paintDryLeaves, paintLeaves, paintTrunk, type TreeModel } from './hill-trees';
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
