import { hillTopY, type CityPaintPlan, type TopBox } from './city-plan';
import { roofCuts, roofLineY, roofSpan } from './snow-painter';
import { craneK, vieDay } from './fond-vie';
import { DEFAULT_MOMENT, type FondMoment } from './fond-time';

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

// ───────────── Découpe au pixel (bogue du 2026-10-24 : rectangles bleu ciel dans les nuages au-dessus de la crête) ─────────────
// Les boîtes `hill.tops` couvrent tout un arbre ou une maison : le ciel y était coupé alors que la tranche peinte y est
// transparente. La découpe suit maintenant la vraie silhouette des tranches (profil alpha), les lignes de toit analytiques du
// premier plan et les boîtes de ce qui bouge au-dessus de la crête sans être dans les tranches (calque vie-fond).

// Haut opaque de chaque colonne de px CSS d'une image `w` × `h` px peinte à l'échelle `dpr` : le plus petit y CSS où un pixel
// des colonnes de pixels qu'elle couvre a un alpha > 0 ; `h / dpr` si la colonne est vide.
export function alphaTopProfile(data: Uint8ClampedArray, w: number, h: number, dpr: number): Float32Array {
  const top = new Int32Array(w).fill(h);
  let left = w;
  for (let y = 0; y < h && left > 0; y++) {
    const row = y * w * 4 + 3;
    for (let x = 0; x < w; x++) {
      if (top[x] === h && data[row + x * 4]! > 0) {
        top[x] = y;
        left--;
      }
    }
  }
  const n = Math.ceil(w / dpr);
  const out = new Float32Array(n);
  for (let c = 0; c < n; c++) {
    const p0 = Math.floor(c * dpr);
    const p1 = Math.min(w, Math.ceil((c + 1) * dpr));
    let t = h;
    for (let p = p0; p < p1; p++) t = Math.min(t, top[p]!);
    out[c] = t / dpr;
  }
  return out;
}

// Boîtes [x0, x1, haut] des éléments du calque vie-fond qui dépassent la crête et ne sont pas peints dans les tranches, à
// l'instant `moment` (celui des tranches affichées) : ailes des moulins (disque de rayon 9 s + 2 autour du moyeu, en escalier de
// MILL_SLABS bandes) et grue (mât, flèche à son plus haut, contre-flèche, feu) seulement quand le calque la montre (craneK > 0
// maintenant ou dans la minute : la découpe n'est relue qu'une fois par minute).
const MILL_SLABS = 8;
export function animatedTops(plan: Pick<CityPaintPlan, 'fond'>, moment: FondMoment = DEFAULT_MOMENT): TopBox[] {
  const out: TopBox[] = [];
  const D = vieDay(moment);
  const T = moment.minutes / 60;
  for (const e of plan.fond.escapes) {
    if (e.mill) {
      const { x, y, s } = e.mill;
      const r = 9 * s + 2;
      const hx = x - 0.5 * s;
      const hy = y - 13 * s;
      for (let i = 0; i < MILL_SLABS; i++) {
        const a = hx - r + (2 * r * i) / MILL_SLABS;
        const b = hx - r + (2 * r * (i + 1)) / MILL_SLABS;
        // Plus haut du disque sur la bande : au point de la bande le plus proche du moyeu.
        const d = a <= hx && hx <= b ? 0 : Math.min(Math.abs(a - hx), Math.abs(b - hx));
        out.push([a, b, hy - Math.sqrt(Math.max(0, r * r - d * d))]);
      }
    }
    if (craneK(e, T, D) > 0 || craneK(e, T + 1 / 60, D) > 0) {
      const c = e.crane;
      // Flèche : angle de −1,05 à 0,05 rad, y = haut du mât + sin(angle) × flèche × 0,25 ; haubans depuis haut du mât − 3.
      const ty = c.base - c.mast;
      out.push([c.x - c.boom - 1, c.x + c.boom + 1, Math.min(ty - 3, ty - 0.25 * c.boom) - 1]);
    }
  }
  return out;
}

// Découpe d'après le profil `profile` (haut opaque de chaque px CSS de la ville peinte, toute la largeur) : même forme que
// `skylinePath`. Un sommet à chaque px CSS (et aux cassures des toits du premier plan et des boîtes `extra`) ; en x, le haut
// vaut le plus haut du profil des colonnes qui touchent x, des lignes de toit des immeubles du premier plan qui couvrent x et
// des boîtes `extra`. Entre deux sommets, le segment reste dans une colonne dont il ne descend pas sous le haut. Sans
// profil (tranches pas encore peintes, peintre de test) : la découpe des boîtes, `skylinePath`.
export function skylinePathFromProfile(plan: Plan, profile: Float32Array | null, extra: readonly TopBox[] = []): string {
  if (!profile) return skylinePath(plan);
  const { width } = plan;
  const front = plan.buildings.filter((b) => !b.far).map((b) => ({ b, s: roofSpan(b) }));
  const cuts = new Set<number>();
  for (let x = 0; x <= Math.ceil(width); x++) cuts.add(Math.min(x, width));
  const add = (k: number): void => void (k > 0 && k < width && cuts.add(k));
  for (const { b } of front) for (const k of roofCuts(b)) add(k);
  for (const [x0, x1] of extra) {
    add(x0);
    add(x1);
  }
  const xs = [...cuts].sort((a, c) => a - c);
  const col = (i: number): number => (i >= 0 && i < profile.length ? profile[i]! : plan.height);
  const topAt = (x: number): number => {
    const i = Math.floor(x);
    let y = Math.min(plan.ground, col(i), x === i ? col(i - 1) : Infinity);
    for (const { b, s } of front) if (x >= s.x0 && x <= s.x1) y = Math.min(y, roofLineY(b, x));
    for (const [x0, x1, t] of extra) if (x >= x0 && x <= x1) y = Math.min(y, t);
    return y;
  };
  const pts = xs.map((x): [number, number] => [x, topAt(x)]);
  // Paliers : les sommets du milieu d'une suite de même hauteur sont inutiles.
  const kept = pts.filter((p, i) => i === 0 || i === pts.length - 1 || p[1] !== pts[i - 1]![1] || p[1] !== pts[i + 1]![1]);
  // x au centième (cassures des toits en pente), y arrondi vers le haut du monde au dixième, comme `skylinePath`.
  const r = (v: number): string => String(Math.round(v * 100) / 100);
  const up = (v: number): string => String(Math.floor(v * 10) / 10);
  return `M0 0${kept.map(([x, y]) => `L${r(x)} ${up(y)}`).join('')}L${r(width)} 0Z`;
}
