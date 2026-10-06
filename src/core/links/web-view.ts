import type { Point } from './web-layout';

// Un point `p` du graphe s'affiche en (x + p.x * k, y + p.y * k).
export type Transform = { x: number; y: number; k: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export const IDENTITY: Transform = { x: 0, y: 0, k: 1 };
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const ZOOM_STEP = 1.4;
// Un petit graphe n'est pas agrandi au-delà : il resterait énorme et creux.
const MAX_FIT_ZOOM = 1.5;

export type ZoomLimits = { min: number; max: number };
export const DEFAULT_LIMITS: ZoomLimits = { min: MIN_ZOOM, max: MAX_ZOOM };
// Mode grand (des milliers de cartes) : la toile est très étendue, et il faut pouvoir descendre jusqu'à une carte.
export const BIG_LIMITS: ZoomLimits = { min: 0.02, max: 64 };

export const clampZoom = (k: number, limits: ZoomLimits = DEFAULT_LIMITS): number => Math.min(limits.max, Math.max(limits.min, k));

export function boundsOf(points: Point[]): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

// Zoom autour d'un point de l'écran : le point du graphe qui s'y trouve y reste.
export function zoomAt(t: Transform, factor: number, cx: number, cy: number, limits: ZoomLimits = DEFAULT_LIMITS): Transform {
  const k = clampZoom(t.k * factor, limits);
  const ratio = k / t.k;
  return { k, x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio };
}

// Deux doigts : l'écart règle le zoom, le déplacement de leur milieu règle le glissement.
export function pinch(start: Transform, from: [Point, Point], to: [Point, Point], limits: ZoomLimits = DEFAULT_LIMITS): Transform {
  const before = Math.hypot(from[1].x - from[0].x, from[1].y - from[0].y);
  const after = Math.hypot(to[1].x - to[0].x, to[1].y - to[0].y);
  const k = clampZoom(start.k * (before < 1 ? 1 : after / before), limits);
  const ratio = k / start.k;
  const fromMid = { x: (from[0].x + from[1].x) / 2, y: (from[0].y + from[1].y) / 2 };
  const toMid = { x: (to[0].x + to[1].x) / 2, y: (to[0].y + to[1].y) / 2 };
  return { k, x: toMid.x - (fromMid.x - start.x) * ratio, y: toMid.y - (fromMid.y - start.y) * ratio };
}

// Tout le graphe visible, centré dans la zone.
export function fitTransform(bounds: Bounds | null, width: number, height: number, margin = 48, limits: ZoomLimits = DEFAULT_LIMITS): Transform {
  if (!bounds) return { x: width / 2, y: height / 2, k: 1 };
  const w = Math.max(bounds.maxX - bounds.minX, 1);
  const h = Math.max(bounds.maxY - bounds.minY, 1);
  const k = clampZoom(Math.min((width - 2 * margin) / w, (height - 2 * margin) / h, MAX_FIT_ZOOM), limits);
  return { k, x: width / 2 - (bounds.minX + w / 2) * k, y: height / 2 - (bounds.minY + h / 2) * k };
}

// Barre des deux boutons d'ouverture d'une carte (marché, carte du jeu) : deux boutons de 44 px, 6 px entre eux, 6 px de marge, 1 px de bordure.
export const ACTIONS_BAR = { width: 108, height: 58 };
const ACTIONS_EDGE = 4;
const ACTIONS_GAP = 8;
// Place d'un nom de carte (11 px de police) sous elle.
const ACTIONS_LABEL = 18;

// Coin haut gauche de la barre pour une carte dont le centre est en `anchor` (pixels de la zone) et la demi-taille à l'écran `half` :
// au-dessus de la carte, centrée ; sous elle (et son nom) quand le haut manque de place ; toujours dans la zone.
export function placeActions(anchor: Point, half: number, area: { width: number; height: number }): Point {
  const above = anchor.y - half - ACTIONS_GAP - ACTIONS_BAR.height;
  const top = above >= ACTIONS_EDGE ? above : anchor.y + half + ACTIONS_GAP + ACTIONS_LABEL;
  const maxLeft = Math.max(area.width - ACTIONS_BAR.width - ACTIONS_EDGE, ACTIONS_EDGE);
  const maxTop = Math.max(area.height - ACTIONS_BAR.height - ACTIONS_EDGE, ACTIONS_EDGE);
  return {
    x: Math.min(Math.max(anchor.x - ACTIONS_BAR.width / 2, ACTIONS_EDGE), maxLeft),
    y: Math.min(Math.max(top, ACTIONS_EDGE), maxTop),
  };
}
