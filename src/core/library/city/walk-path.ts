// Chemins à pied de la rue (moteur pur) : une ligne brisée de points { x (px du monde), d (profondeur en unités) }.
// Une unité vaut `unit` px (hauteur de la scène / 340) : la longueur d'un chemin se mesure en px, x et d confondus.
import { TURN_S, YAW_BACK, YAW_FRONT, turnYaw, yawToward } from '../figure/gait';
import { THRESHOLD_S } from './doorway';

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

// ---------- Pantin le long d'un chemin ----------
// Orientation (pantin, 0–15) d'un tronçon : profondeur qui augmente = vers le spectateur de la scène (bas de l'image).
export const segYaw = (a: PathPt, b: PathPt, unit: number): number => yawToward(b.x - a.x, (b.d - a.d) * unit);
// Orientation du tronçon parcouru à la distance `dist` (tronçons de longueur nulle sautés ; chemin nul : de face).
export function yawAt(p: readonly PathPt[], dist: number, unit: number): number {
  let left = Math.max(0, dist);
  let yaw: number | null = null;
  for (let i = 1; i < p.length; i++) {
    const l = seg(p[i - 1]!, p[i]!, unit);
    if (l <= 0) continue;
    yaw = segYaw(p[i - 1]!, p[i]!, unit);
    if (left <= l) return yaw;
    left -= l;
  }
  return yaw ?? YAW_FRONT;
}

// Bouts d'un trajet : `fromDoor` / `toDoor` : il commence / finit au seuil d'une porte d'immeuble (premier / dernier point du
// chemin) ; sinon `startYaw` / `endYaw` : orientation en place avant le départ / après l'arrivée (demi-tour sur place).
export type WalkEnds = { fromDoor?: boolean; toDoor?: boolean; startYaw?: number; endYaw?: number };
// `walked` : px parcourus sur le chemin (phase des pas) ; `sill` (0 = sur le trottoir, 1 = au fond de l'entrée) : seulement
// pendant le seuil d'une porte (door-passage.ts) ; `step` : petits pas d'un demi-tour sur place.
export type PathWalk = { x: number; d: number; yaw: number; gait: 'walk' | 'step'; walked: number; sill?: number };

const turnS = (a: number, b: number): number => (a === b ? 0 : TURN_S);
function planOf(p: readonly PathPt[], unit: number, speed: number, o: WalkEnds) {
  const len = pathLength(p, unit);
  const first = yawAt(p, 0, unit);
  const last = yawAt(p, len, unit);
  const y0 = o.fromDoor ? YAW_FRONT : o.startYaw ?? first;
  const y1 = o.toDoor ? YAW_BACK : o.endYaw ?? last;
  return { len, first, last, y0, y1, th0: o.fromDoor ? THRESHOLD_S : 0, tu0: turnS(y0, first), street: len / speed, tu1: turnS(last, y1), th1: o.toDoor ? THRESHOLD_S : 0 };
}
// Durée (s) d'un trajet : [seuil] → [demi-tour] → chemin → [demi-tour] → [seuil]. Même déroulé que passageAt (doorway.ts,
// habitants et clients des commerces, ligne droite) et spectatorAt (parade.ts) : toute modification des phases (durées,
// orientations du seuil YAW_FRONT / YAW_BACK) se reporte dans les trois.
export function walkDuration(p: readonly PathPt[], unit: number, speed: number, o: WalkEnds): number {
  const q = planOf(p, unit, speed, o);
  return q.th0 + q.tu0 + q.street + q.tu1 + q.th1;
}
// État du marcheur `c` secondes après le début du trajet (borné à la fin : dernier point, orientation finale).
export function walkAt(p: readonly PathPt[], unit: number, speed: number, o: WalkEnds, c: number): PathWalk {
  const q = planOf(p, unit, speed, o);
  const a = p[0]!;
  const z = p[p.length - 1]!;
  let s = Math.max(0, c);
  if (s < q.th0) return { x: a.x, d: a.d, yaw: YAW_FRONT, gait: 'walk', walked: 0, sill: 1 - s / q.th0 };
  s -= q.th0;
  if (s < q.tu0) return { x: a.x, d: a.d, yaw: turnYaw(q.y0, q.first, s / q.tu0), gait: 'step', walked: 0 };
  s -= q.tu0;
  if (s < q.street) {
    const w = s * speed;
    const pt = pathAt(p, w, unit);
    return { x: pt.x, d: pt.d, yaw: yawAt(p, w, unit), gait: 'walk', walked: w };
  }
  s -= q.street;
  if (s < q.tu1) return { x: z.x, d: z.d, yaw: turnYaw(q.last, q.y1, s / q.tu1), gait: 'step', walked: q.len };
  s -= q.tu1;
  if (o.toDoor) return { x: z.x, d: z.d, yaw: YAW_BACK, gait: 'walk', walked: q.len, sill: Math.min(1, s / q.th1) };
  return { x: z.x, d: z.d, yaw: q.y1, gait: 'step', walked: q.len };
}
