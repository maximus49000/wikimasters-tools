// Charge portée à deux (meuble des déménageurs, barrière ou planche des équipes d'installation) : elle est posée au rendu sur
// les mains des pantins de référence. Quand un porteur montre une image 3D, ses mains sont ailleurs (autre silhouette, autre
// taille) : on décale la charge de l'écart moyen et on l'incline pour que sa ligne d'appui passe par les deux mains 3D.
import { anchorsOf, type FigureKey } from '../../core/library/figure/bake';
import { shown3DAnchors } from './ghibli-figure';

type Pt = readonly [number, number];
// `fig` : figure du porteur ; (x, y) : ses pieds (px du monde) ; `ref` : pose de référence dont les mains ont servi au rendu ;
// `anchor` : main droite, ou milieu des deux mains.
export type Carrier = { fig: Element | null; x: number; y: number; ref: FigureKey; anchor: 'handR' | 'hands' };
// Ligne d'appui 3D : passe par (px, py) (milieu des mains, px du monde) avec l'inclinaison `deg` (degrés, sens de SVG) ; `dx` :
// décalage horizontal moyen des mains 3D par rapport à celles du pantin (la charge glisse d'autant, sans saut).
export type CarryFit = { dx: number; deg: number; px: number; py: number };

const handOf = (a: Record<'handR' | 'handL', Pt>, anchor: Carrier['anchor']): Pt =>
  anchor === 'handR' ? a.handR : [(a.handR[0] + a.handL[0]) / 2, (a.handR[1] + a.handL[1]) / 2];

// null : aucun porteur en 3D (la charge reste où le rendu l'a posée). `k` : échelle des porteurs (px par unité du pantin).
export function carryFit(a: Carrier, b: Carrier, k: number): CarryFit | null {
  const a3 = shown3DAnchors(a.fig);
  const b3 = shown3DAnchors(b.fig);
  if (!a3 && !b3) return null;
  const one = (c: Carrier, c3: ReturnType<typeof shown3DAnchors>): { dx: number; w: Pt } => {
    const h2 = handOf(anchorsOf(c.ref), c.anchor);
    const h = c3 ? handOf(c3, c.anchor) : h2;
    return { dx: (h[0] - h2[0]) * k, w: [c.x + h[0] * k, c.y + h[1] * k] };
  };
  const A = one(a, a3);
  const B = one(b, b3);
  const run = B.w[0] - A.w[0];
  const deg = Math.abs(run) < 1e-6 ? 0 : (Math.atan((B.w[1] - A.w[1]) / run) * 180) / Math.PI;
  return { dx: (A.dx + B.dx) / 2, deg, px: (A.w[0] + B.w[0]) / 2, py: (A.w[1] + B.w[1]) / 2 };
}

// Hauteur (px du monde) de la ligne d'appui à l'abscisse x.
export const carryLineY = (f: CarryFit, x: number): number => f.py + Math.tan((f.deg * Math.PI) / 180) * (x - f.px);
