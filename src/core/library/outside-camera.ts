// Caméra de la vue « dehors » (bibliothèque) : on regarde le monde du décor (largeur de la pièce × hauteur du mur) par une
// boîte d'écran. x, y = coin haut-gauche de la vue dans le monde ; zoom 1 = la hauteur du monde remplit la hauteur de la boîte.
export type Size = { w: number; h: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type Camera = { x: number; y: number; zoom: number };

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const FOLLOW_TAU_MS = 250;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

export function viewSize(box: Size, world: Size, zoom: number): Size {
  const h = world.h / zoom;
  return { w: (h * box.w) / box.h, h };
}

// Jamais de vide hors du décor ; un monde plus étroit que la vue est centré.
export function clampCamera(cam: Camera, box: Size, world: Size): Camera {
  const zoom = clamp(cam.zoom, ZOOM_MIN, ZOOM_MAX);
  const s = viewSize(box, world, zoom);
  const x = s.w >= world.w ? (world.w - s.w) / 2 : clamp(cam.x, 0, world.w - s.w);
  return { x, y: clamp(cam.y, 0, world.h - s.h), zoom };
}

export const viewRect = (cam: Camera, box: Size, world: Size): Rect => ({ x: cam.x, y: cam.y, ...viewSize(box, world, cam.zoom) });

export const viewBoxOf = (r: Rect): string => `${r.x.toFixed(2)} ${r.y.toFixed(2)} ${r.w.toFixed(2)} ${r.h.toFixed(2)}`;

export function clientToWorld(cam: Camera, box: Size, world: Size, px: number, py: number): Point {
  const s = viewSize(box, world, cam.zoom);
  return { x: cam.x + (px / box.w) * s.w, y: cam.y + (py / box.h) * s.h };
}

// Le point du monde sous (px, py) y reste après le zoom.
export function zoomAt(cam: Camera, box: Size, world: Size, factor: number, px: number, py: number): Camera {
  const p = clientToWorld(cam, box, world, px, py);
  const zoom = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  const s = viewSize(box, world, zoom);
  return clampCamera({ x: p.x - (px / box.w) * s.w, y: p.y - (py / box.h) * s.h, zoom }, box, world);
}

export function pan(cam: Camera, box: Size, world: Size, dx: number, dy: number): Camera {
  const s = viewSize(box, world, cam.zoom);
  return clampCamera({ x: cam.x - (dx / box.w) * s.w, y: cam.y - (dy / box.h) * s.h, zoom: cam.zoom }, box, world);
}

export function centerOn(cam: Camera, box: Size, world: Size, p: Point): Camera {
  const s = viewSize(box, world, cam.zoom);
  return clampCamera({ x: p.x - s.w / 2, y: p.y - s.h / 2, zoom: cam.zoom }, box, world);
}

// Rapproche la caméra du centrage sur p (lissage exponentiel, indépendant de la cadence d'images).
export function followStep(cam: Camera, box: Size, world: Size, p: Point, dtMs: number): Camera {
  const target = centerOn(cam, box, world, p);
  const k = 1 - Math.exp(-dtMs / FOLLOW_TAU_MS);
  return clampCamera({ x: cam.x + (target.x - cam.x) * k, y: cam.y + (target.y - cam.y) * k, zoom: cam.zoom }, box, world);
}

// Arrivée dehors : zoom 1, centré sur la fenêtre la plus proche de focusX (sans fenêtre : centre du monde).
export function initialCamera(box: Size, world: Size, windows: readonly Rect[], focusX: number): Camera {
  const mid = (r: Rect): number => r.x + r.w / 2;
  const near = windows.reduce<Rect | null>((best, r) => (best === null || Math.abs(mid(r) - focusX) < Math.abs(mid(best) - focusX) ? r : best), null);
  return centerOn({ x: 0, y: 0, zoom: 1 }, box, world, { x: near ? mid(near) : world.w / 2, y: world.h / 2 });
}

export const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t });

export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
