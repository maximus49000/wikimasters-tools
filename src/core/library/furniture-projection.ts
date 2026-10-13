import { FACE_MARGIN, type Angle } from './footprint';
import type { Part } from './furniture-volumes';
import type { PxRect } from './room-grid';
import type { Palette } from './styles';

// Une face projetée : polygone, couleur, ombrage (1 face avant, 0,82 côté, 1,12 dessus).
export type Face = { points: [number, number][]; fill: keyof Palette; shade: number; round: boolean };

const SHADE = { front: 1, side: 0.82, top: 1.12 } as const;

// Retourner le meuble d'un demi-tour (dos face à nous) : gauche ↔ droite et avant ↔ arrière.
const flip = (p: Part): Part => ({ ...p, u0: 1 - p.u1, u1: 1 - p.u0, d0: 1 - p.d1, d1: 1 - p.d0 });

// Vues de base : 0 face, 1 ¾ (face 70 %, côté droit 30 %), 2 profil (côté droit seul, avant à gauche).
// x = u·F + d·S (en largeur), y monte avec la profondeur (le fond est plus haut, comme le sol de la pièce).
function project(parts: readonly Part[], base: 0 | 1 | 2, r: PxRect): Face[] {
  const F = base === 0 ? 1 : base === 1 ? 0.7 : 0;
  const S = base === 0 ? 0 : base === 1 ? 0.3 : 1;
  const M = base === 0 ? 0 : FACE_MARGIN * r.h;
  const pt = (u: number, d: number, h: number): [number, number] => [r.x + r.w * (u * F + d * S), r.y + r.h - d * M - h * (r.h - M)];
  // Du plus loin au plus proche : le fond d'abord, puis de gauche à droite, puis de bas en haut.
  const order = [...parts].sort((a, b) => b.d1 - a.d1 || a.u1 - b.u1 || a.h0 - b.h0);
  const faces: Face[] = [];
  for (const p of order) {
    const round = p.round ?? false;
    if (M > 0) faces.push({ points: [pt(p.u0, p.d0, p.h1), pt(p.u1, p.d0, p.h1), pt(p.u1, p.d1, p.h1), pt(p.u0, p.d1, p.h1)], fill: p.fill, shade: SHADE.top, round });
    if (S > 0) faces.push({ points: [pt(p.u1, p.d0, p.h0), pt(p.u1, p.d1, p.h0), pt(p.u1, p.d1, p.h1), pt(p.u1, p.d0, p.h1)], fill: p.fill, shade: SHADE.side, round });
    if (F > 0) faces.push({ points: [pt(p.u0, p.d0, p.h0), pt(p.u1, p.d0, p.h0), pt(p.u1, p.d0, p.h1), pt(p.u0, p.d0, p.h1)], fill: p.fill, shade: SHADE.front, round });
  }
  return faces;
}

const mirrorFaces = (faces: Face[], r: PxRect): Face[] =>
  faces.map((f) => ({ ...f, points: f.points.map(([x, y]) => [2 * r.x + r.w - x, y] as [number, number]) }));

// 0-2 : vues de base ; 4-6 : les mêmes, meuble retourné ; 7 = miroir de 1, 3 = miroir de 5.
export function projectParts(parts: readonly Part[], angle: Angle, rect: PxRect): Face[] {
  if (angle <= 2) return project(parts, angle as 0 | 1 | 2, rect);
  if (angle >= 4 && angle <= 6) return project(parts.map(flip), (angle - 4) as 0 | 1 | 2, rect);
  return mirrorFaces(projectParts(parts, angle === 7 ? 1 : 5, rect), rect);
}
