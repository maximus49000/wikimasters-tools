export type Glass = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

// Profondeur de la pièce, en hauteurs de mur (elle est écrasée dans la bande de sol dessinée).
export const ROOM_DEPTH_FACTOR = 2;
const MIN_ELEV = 0.02;

// Projection exacte du verre sur le sol par un rayon parallèle d'élévation `elev` : le bas du verre touche le sol à la
// profondeur Hb / tan(e), le haut à Ht / tan(e) ; chaque point glisse de `slope` px par unité de profondeur.
// Coins en pixels de la pièce (x, y) ; la profondeur est écrasée linéairement dans la bande de sol (y de `wallH` à `wallH + floorH`).
export function beamPatch(glass: Glass, wallH: number, floorH: number, elev: number, slope: number): Point[] | null {
  if (elev <= MIN_ELEV) return null;
  const depthMax = wallH * ROOM_DEPTH_FACTOR;
  const t = Math.tan(elev);
  const near = (wallH - (glass.y + glass.h)) / t;
  const far = Math.min((wallH - glass.y) / t, depthMax);
  if (near >= depthMax || far <= near) return null;
  const k = floorH / depthMax;
  const at = (x: number, d: number): Point => ({ x: x + slope * d, y: wallH + d * k });
  return [at(glass.x, near), at(glass.x + glass.w, near), at(glass.x + glass.w, far), at(glass.x, far)];
}
