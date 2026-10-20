import { hillTopY, type CityPaintPlan } from './city-plan';
import { roofCuts, roofLineY, roofSpan } from './snow-painter';

// Découpe des nuages peints (vague Ghibli, G2) : le ciel au-dessus de la silhouette de la ville peinte, pour que les cumulus
// passent DERRIÈRE les toits et la colline du fond (décor cellulo). Ligne brisée qui suit, de gauche à droite, le plus haut
// de la ligne de toit des immeubles qui couvrent x et du haut du fond (crête, maisons, repères), avec une marche verticale
// à chaque mur.

const STEP = 4; // pas d'échantillonnage (px), en plus des cassures exactes des toits et des maisons

type Plan = Pick<CityPaintPlan, 'width' | 'ground' | 'buildings' | 'height' | 'hill'>;

// Haut de la ville peinte en x : toits du premier plan et du mur du fond, puis le fond.
export function cityTopY(plan: Plan, x: number): number {
  let y = Math.min(plan.ground, hillTopY(plan, x));
  for (const b of plan.buildings) {
    const s = roofSpan(b);
    if (x >= s.x0 && x <= s.x1) y = Math.min(y, roofLineY(b, x));
  }
  return y;
}

// Sommets de la ligne des toits. Cassures exactes (murs, faîtes, coins des mansardes, bords des maisons et repères du fond)
// plus un point tous les STEP px : entre deux sommets, chaque ligne de toit est affine (la crête, sinusoïdale, l'est à moins
// de 0,05 px près sur 4 px), et le plus haut de plusieurs lignes (minimum de fonctions affines) est concave — la corde passe
// donc au-dessus (ou sur) les toits, jamais dessous : aucun nuage ne déborde sur une façade.
export function skylinePoints(plan: Plan): [number, number][] {
  const { width, buildings } = plan;
  const cuts = new Set<number>([0, width]);
  for (let x = STEP; x < width; x += STEP) cuts.add(x);
  const add = (k: number): void => void (k > 0 && k < width && cuts.add(k));
  for (const b of buildings) for (const k of roofCuts(b)) add(k);
  for (const h of plan.hill.houses) {
    add(h.x - 1.5 * h.s);
    add(h.x + h.w + 1.5 * h.s);
  }
  for (const l of plan.hill.landmarks) {
    add(l.x - 2 * l.s);
    add(l.x + l.w + 2 * l.s);
  }
  // Fond vivant : bords des boîtes de ce qui dépasse la crête (arbres, maisons de crête, chapelles, toits garnis).
  for (const [x0, x1] of plan.hill.tops ?? []) {
    add(x0);
    add(x1);
  }
  const xs = [...cuts].sort((a, c) => a - c);
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i]!;
    const c = xs[i + 1]!;
    const mid = (a + c) / 2;
    // Fond évalué juste à l'intérieur du segment : à une cassure, la marche reste verticale (la valeur de gauche n'est pas
    // reportée sur le segment de droite). Immeubles qui couvrent le milieu : leur ligne de toit vaut aux deux bouts.
    let ya = Math.min(plan.ground, hillTopY(plan, Math.min(mid, a + 1e-3)));
    let yc = Math.min(plan.ground, hillTopY(plan, Math.max(mid, c - 1e-3)));
    for (const b of buildings) {
      const s = roofSpan(b);
      if (mid < s.x0 || mid > s.x1) continue;
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
export function skylinePath(plan: Plan): string {
  const r = (v: number): string => String(Math.round(v * 10) / 10);
  // y arrondi vers le haut du monde (au dixième) : la découpe reste au-dessus des toits.
  const up = (v: number): string => String(Math.floor(v * 10) / 10);
  return `M0 0${skylinePoints(plan).map(([x, y]) => `L${r(x)} ${up(y)}`).join('')}L${r(plan.width)} 0Z`;
}
