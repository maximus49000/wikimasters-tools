// Chemins à pied de la rue (moteur pur) : une ligne brisée de points { x (px du monde), d (profondeur en unités) }.
// Une unité vaut `unit` px (hauteur de la scène / 340) : la longueur d'un chemin se mesure en px, x et d confondus.
export type PathPt = { x: number; d: number };

const seg = (a: PathPt, b: PathPt, unit: number): number => Math.hypot(b.x - a.x, (b.d - a.d) * unit);

export const pathLength = (p: readonly PathPt[], unit: number): number => p.slice(1).reduce((acc, q, i) => acc + seg(p[i]!, q, unit), 0);

// Point du chemin à la distance `dist` (px) de son départ ; borné aux extrémités.
export function pathAt(p: readonly PathPt[], dist: number, unit: number): PathPt {
  if (dist <= 0) return p[0]!;
  let left = dist;
  for (let i = 1; i < p.length; i++) {
    const l = seg(p[i - 1]!, p[i]!, unit);
    if (left <= l && l > 0) {
      const k = left / l;
      return { x: p[i - 1]!.x + (p[i]!.x - p[i - 1]!.x) * k, d: p[i - 1]!.d + (p[i]!.d - p[i - 1]!.d) * k };
    }
    left -= l;
  }
  return p[p.length - 1]!;
}

// Sens du profil d'un marcheur au point `dist` du chemin (celui du segment en cours ; 1 si le segment est vertical).
export function pathDir(p: readonly PathPt[], dist: number, unit: number, fallback: 1 | -1 = 1): 1 | -1 {
  let left = Math.max(0, dist);
  for (let i = 1; i < p.length; i++) {
    const l = seg(p[i - 1]!, p[i]!, unit);
    if (left <= l || i === p.length - 1) {
      const dx = p[i]!.x - p[i - 1]!.x;
      return Math.abs(dx) < 1e-9 ? fallback : dx < 0 ? -1 : 1;
    }
    left -= l;
  }
  return fallback;
}
