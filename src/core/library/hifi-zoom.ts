// Cadrage du zoom de la chaîne hi-fi (caméra plongeante) : quelle partie du poste et de sa pochette debout remplit la couche.
// Boîtier (CD, DVD, jeu, livre) : cadré serré sur le corps du poste (afficheur et puits CD) et la pochette posée devant son côté droit ;
// enceintes et platine peuvent sortir du cadre, la pochette reste grande et lisible. Vinyle (31 cm) ou poste vide : le poste entier.
import { hostNativePx, placementBounds } from './carried-items';
import { drawSize } from './footprint';
import { CELL_H, CELL_W, PLUNGE_CAMERA } from './furniture-render3d';
import { FURNITURE_MODELS } from './furniture-models';
import { sleeveStand, type SleeveKind } from './hifi';
import type { ItemPlacement } from './item-models';
import type { HostKind, PxRect } from './room-grid';

type V3 = [number, number, number];
type Box6 = [number, number, number, number, number, number];

// Zones des décalques du poste (cm, repère du poste : x vers la droite, y vers le haut, z vers le fond), relevées sur hifi-art :
// afficheur de la façade (16-166 × 20-62 mm de la façade 300 × 120 du corps, qui commence à x = 13) et puits CD du dessus
// (216-288 × 142-216 mm du dessus 300 × 260, haut du dessin = fond).
export const HIFI_DISPLAY_CM: Box6 = [14.6, 29.6, 5.8, 10, 0, 0];
export const HIFI_WELL_CM: Box6 = [34.6, 41.8, 12, 12, 4.4, 11.8];

// Couche : marge, colonne des commandes à droite (⏸/▶ ⏏ ⓘ ✕ empilés), marge autour du cadrage (fraction de sa taille).
export const ZOOM_PAD = 16;
export const ZOOM_COLUMN = 64;
const MARGIN = 0.06;

// Zone de la couche où le poste est cadré (px du calque).
export function hifiZoomArea(layer: { w: number; h: number }): PxRect {
  return { x: ZOOM_PAD, y: ZOOM_PAD, w: layer.w - ZOOM_COLUMN - 2 * ZOOM_PAD, h: layer.h - 2 * ZOOM_PAD };
}

const cornersOf = ([x0, x1, y0, y1, z0, z1]: Box6, pl: ItemPlacement): V3[] =>
  [x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [z0, z1].map((z): V3 => [pl.x + x, pl.y + y, pl.z + z])));

// Points (cm, repère du porteur) à garder dans le cadre : l'afficheur et le puits du poste (le poste entier pour un vinyle ou sans
// pochette), et la pochette debout.
export function hifiZoomFocus(pl: ItemPlacement, stand: ReturnType<typeof sleeveStand> | null, kind: SleeveKind | null, steampunk = false): V3[] {
  const tight = kind !== null && kind !== 'vinyl';
  const body: V3[] = tight
    ? [...cornersOf(HIFI_DISPLAY_CM, pl), ...cornersOf(HIFI_WELL_CM, pl)]
    : (() => {
      const [x0, x1, y0, y1, z0, z1] = placementBounds(pl, steampunk);
      return [x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [z0, z1].map((z): V3 => [x, y, z])));
    })();
  return [...body, ...(stand ? [...stand.corners, ...stand.back] : [])];
}

// Cadre du zoom : `rect` est le rectangle du dessin du meuble entier (Model3DArt), bien plus grand que la couche ; `stand` la pochette
// debout (null sans objet au poste).
export function hifiZoomFrame(hostKind: HostKind, pl: ItemPlacement, kind: SleeveKind | null, layer: { w: number; h: number }, steampunk = false): { rect: PxRect; stand: ReturnType<typeof sleeveStand> | null } {
  const stand = kind ? sleeveStand(pl, kind, FURNITURE_MODELS[hostKind].w) : null;
  const pts = hifiZoomFocus(pl, stand, kind, steampunk);
  const { w: cols, h: rows } = drawSize(hostKind, 0, PLUNGE_CAMERA);
  const px = pts.map((p) => hostNativePx(hostKind, 0, p, PLUNGE_CAMERA));
  const [bx0, bx1] = [Math.min(...px.map((p) => p[0])), Math.max(...px.map((p) => p[0]))];
  const [by0, by1] = [Math.min(...px.map((p) => p[1])), Math.max(...px.map((p) => p[1]))];
  const area = hifiZoomArea(layer);
  const scale = Math.min(area.w / ((bx1 - bx0) * (1 + 2 * MARGIN)), area.h / ((by1 - by0) * (1 + 2 * MARGIN)));
  const x = area.x + (area.w - (bx1 - bx0) * scale) / 2 - bx0 * scale;
  const y = area.y + (area.h - (by1 - by0) * scale) / 2 - by0 * scale;
  return { rect: { x, y, w: cols * CELL_W * scale, h: rows * CELL_H * scale }, stand };
}
