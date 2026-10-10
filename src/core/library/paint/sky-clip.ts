import type { CityPaintPlan } from './city-plan';
import { roofLineY } from './snow-painter';

// Découpe des nuages peints (vague Ghibli, G2) : le ciel au-dessus de la silhouette de la ville peinte, pour que les cumulus
// passent DERRIÈRE les toits. Ligne brisée qui suit, de gauche à droite, la plus haute ligne de toit des immeubles qui
// couvrent x (le sol entre deux immeubles), avec une marche verticale à chaque mur.

const STEP = 4; // pas d'échantillonnage (px), en plus des cassures exactes des toits

// Sommets de la ligne des toits. Cassures exactes (murs, faîtes, coins des mansardes) plus un point tous les STEP px : entre
// deux sommets, chaque ligne de toit est affine, et le plus haut de plusieurs toits (minimum de fonctions affines) est concave —
// la corde passe donc au-dessus (ou sur) les toits, jamais dessous : aucun nuage ne déborde sur une façade.
export function skylinePoints(plan: Pick<CityPaintPlan, 'width' | 'ground' | 'buildings'>): [number, number][] {
  const { width, ground, buildings } = plan;
  const cuts = new Set<number>([0, width]);
  for (let x = STEP; x < width; x += STEP) cuts.add(x);
  for (const b of buildings) for (const k of [b.x, b.x + b.w, b.x + b.w / 2, b.x + 1.5, b.x + b.w - 1.5]) if (k > 0 && k < width) cuts.add(k);
  const xs = [...cuts].sort((a, c) => a - c);
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i]!;
    const c = xs[i + 1]!;
    const mid = (a + c) / 2;
    let ya = ground;
    let yc = ground;
    for (const b of buildings) {
      if (mid < b.x || mid > b.x + b.w) continue;
      ya = Math.min(ya, roofLineY(b, a));
      yc = Math.min(yc, roofLineY(b, c));
    }
    const last = pts[pts.length - 1];
    if (!last || last[0] !== a || last[1] !== ya) pts.push([a, ya]);
    pts.push([c, yc]);
  }
  return pts;
}

// Chemin SVG fermé par le haut du monde.
export function skylinePath(plan: Pick<CityPaintPlan, 'width' | 'ground' | 'buildings'>): string {
  const r = (v: number): string => String(Math.round(v * 10) / 10);
  // y arrondi vers le haut du monde (au dixième) : la découpe reste au-dessus des toits.
  const up = (v: number): string => String(Math.floor(v * 10) / 10);
  return `M0 0${skylinePoints(plan).map(([x, y]) => `L${r(x)} ${up(y)}`).join('')}L${r(plan.width)} 0Z`;
}
