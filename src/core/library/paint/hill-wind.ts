// Mouvement du feuillage de la colline au vent : fonction pure de (plan, groupe, t, vent). La colline est découpée en bandes
// verticales ; chaque bande reçoit un déplacement horizontal `dx` (px) et un cisaillement `s` (pente de l'inclinaison autour
// du pivot, au pied du rang) tirés du MÊME champ de vent que les arbres de la rue (`windAt`, rafales qui traversent la scène).
// Les fûts, maisons et charpentières restent immobiles : seul le feuillage est déplacé, bande par bande, par l'appelant.
import { HILL_ROWS, hillCrestY, type CityPaintPlan } from './city-plan';
import { windAt, type Wind } from './fond-vent';

// Largeur des bandes (px) : fine sur ordinateur, large sur Android (moins de calques à recomposer).
export const HILL_SLICE_DESKTOP = 96;
export const HILL_SLICE_ANDROID = 240;
// Facteur de vent par groupe : crête (0), rang 0 (1), rang 1 (2) — le plus proche bouge un peu plus (parallaxe).
export const HILL_FACTOR = [0.9, 1, 1.1] as const;

// Bornes : au-delà, un houppier se verrait glisser d'un bloc ; l'écart voisin ≤ 0,75 px est tenu par la phase spatiale douce.
const DX_MAX = 2;
const S_MAX = 0.03;
const clamp = (v: number, m: number): number => Math.max(-m, Math.min(m, v));

// Vent lissé sur la largeur de la bande : moyenne pondérée triangulaire (1-2-3-4-5-4-3-2-1) de 9 échantillons espacés d'une demi-bande
// (±2 bandes) autour du centre. Une rafale (gaussienne de 120 à 240 px) plus étroite que deux bandes ferait sinon sauter `dx` de plus de 0,75 px
// d'une bande à la suivante et déchirerait un houppier à cheval sur leur limite ; deux bandes voisines partagent ainsi
// presque tous leurs échantillons. Vent nul → somme nulle (windAt renvoie 0 sous 0,02).
const SMOOTH = [[-2, 1], [-1.5, 2], [-1, 3], [-0.5, 4], [0, 5], [0.5, 4], [1, 3], [1.5, 2], [2, 1]] as const;
function smoothWind(cx: number, slice: number, t: number, w: Wind, width: number): number {
  let sum = 0;
  for (const [o, k] of SMOOTH) sum += k * windAt(cx + o * slice, t, w, width);
  return sum / 25;
}

export type SliceMove = { x0: number; x1: number; dx: number; s: number; pivot: number };

// Bandes [x0, x1) couvrant [0, largeur) du plan, largeur `slice` sauf la dernière (reste). `group` : 0 = crête, 1 = rang 0,
// 2 = rang 1 (et les échappées). Le vent est lissé autour du centre de la bande ; l'oscillation propre (0,75 ± 0,25) donne un va-et-vient
// qui ne retombe jamais à zéro avec du vent, et sa phase spatiale est assez lente pour que deux bandes voisines restent
// proches (la maquette, à 0,05 par px, déchirait les houppiers coupés par une limite de bande). Phase de 0,0025 par px à 96 px,
// ramenée à la largeur de bande (même déphasage par bande à 240 px) : 0,01 par px fixe faisait 2,4 rad par bande sur Android
// et dépassait 0,75 px d'écart par vent fort.
export function hillSlices(plan: CityPaintPlan, group: 0 | 1 | 2, slice: number, t: number, w: Wind): SliceMove[] {
  const out: SliceMove[] = [];
  const f = HILL_FACTOR[group];
  for (let x0 = 0; x0 < plan.width; x0 += slice) {
    const x1 = Math.min(plan.width, x0 + slice);
    const cx = (x0 + x1) / 2;
    const v = smoothWind(cx, slice, t, w, plan.width) * f;
    const osc = 0.75 + 0.25 * Math.sin(2.9 * t + 0.0025 * cx * (HILL_SLICE_DESKTOP / slice));
    // Pivot : pied du rang ; pour la crête, la ligne de crête au centre de la bande.
    const pivot = group === 0 ? hillCrestY(plan, cx) : plan.height * HILL_ROWS[group - 1]!.y;
    out.push({ x0, x1, dx: clamp(v * 1.1 * osc, DX_MAX), s: clamp(v * 0.015, S_MAX), pivot });
  }
  return out;
}
