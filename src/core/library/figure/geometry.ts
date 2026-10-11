// Géométrie du pantin 3D (G3, graphisme Ghibli) : repère du corps y vers le haut, x vers la droite, z vers le spectateur.
// Caméra orthographique un peu plongeante (12°) : un point plus proche du spectateur descend à l'écran.
export type V3 = readonly [number, number, number];
export type P2 = readonly [number, number];

const ELEV = (12 * Math.PI) / 180;
export const CAM_CA = Math.cos(ELEV);
export const CAM_SA = Math.sin(ELEV);

// x écran, y écran (vers le bas), profondeur (vers le spectateur).
export const project = (p: V3): [number, number, number] => [p[0], -(p[1] * CAM_CA - p[2] * CAM_SA), p[2] * CAM_CA + p[1] * CAM_SA];
export const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];

// Capsule (membre) entre deux points projetés, rayons ra et rb : deux demi-cercles de `seg` segments.
export function capsule(a: P2, b: P2, ra: number, rb: number, seg = 6): P2[] {
  const out: P2[] = [];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  for (let i = 0; i <= seg; i++) {
    const t = ang + Math.PI / 2 + (i * Math.PI) / seg;
    out.push([a[0] + ra * Math.cos(t), a[1] + ra * Math.sin(t)]);
  }
  for (let i = 0; i <= seg; i++) {
    const t = ang - Math.PI / 2 + (i * Math.PI) / seg;
    out.push([b[0] + rb * Math.cos(t), b[1] + rb * Math.sin(t)]);
  }
  return out;
}

// Enveloppe convexe (chaîne monotone).
export function hull(pts: readonly P2[]): P2[] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: P2, a: P2, b: P2): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: P2[] = [];
  const up: P2[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (up.length >= 2 && cross(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop();
    up.push(q);
  }
  up.pop();
  lo.pop();
  return lo.concat(up);
}

// Zone éclairée : le polygone réduit vers son centre et décalé vers la lumière (en haut à gauche).
export function shrink(P: readonly P2[], k: number, dx: number, dy: number): P2[] {
  let cx = 0;
  let cy = 0;
  for (const q of P) {
    cx += q[0];
    cy += q[1];
  }
  cx /= P.length;
  cy /= P.length;
  return P.map((q) => [cx + (q[0] - cx) * k + dx, cy + (q[1] - cy) * k + dy] as const);
}

const r1 = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return (r === 0 ? 0 : r).toString();
};
// Tracé fermé, coordonnées au dixième (symboles légers).
export const pathOf = (P: readonly P2[]): string => `M${P.map((q) => `${r1(q[0])} ${r1(q[1])}`).join('L')}Z`;
