import { WORLD_MARGIN } from '../scene-world';
import { TURN_S, YAW_BACK, YAW_FRONT, facingYaw, turnYaw } from '../figure/gait';
import { DOOR_WIDTH, STREET_SCALE, type CityMetrics } from './metrics';

// Plafond de distance d'un trajet depuis la porte (défini ici pour que doors.ts le réexporte sans cycle).
export const MAX_TRIP_PX = 520;
// Temps passé à traverser le seuil (de l'ombre de l'entrée au trottoir, ou l'inverse).
export const THRESHOLD_S = 1.0;

export type Stage = 'street' | 'turn' | 'threshold';
// `depth` : 0 = sur le trottoir, 1 = au fond de l'entrée. `walked` : px parcourus dans la rue depuis le début du trajet (phase des pas).
export type Passage = { stage: Stage; x: number; depth: number; yaw: number; gait: 'walk' | 'step'; walked: number };

// Porte la plus lointaine dans le sens de marche, à moins de MAX_TRIP_PX de `fromX`, quand le bord du monde est plus loin que le plafond.
// `null` : le bord est atteignable (l'habitant sort du champ) ou aucune porte n'est à portée.
export function farDoorX(fromX: number, dir: 1 | -1, width: number, doorXs: readonly number[]): number | null {
  const toEdge = dir > 0 ? width + WORLD_MARGIN - fromX : fromX + WORLD_MARGIN;
  if (toEdge <= MAX_TRIP_PX) return null;
  let best: number | null = null;
  for (const x of doorXs) {
    const d = (x - fromX) * dir;
    if (d > 0 && d <= MAX_TRIP_PX && (best === null || d > (best - fromX) * dir)) best = x;
  }
  return best;
}

// Ouverture sombre de l'EntranceSprite (là où l'habitant passe le seuil). Reprend la formule de `entranceLeft`
// (src/content/city-sprites.tsx) : core ne peut pas importer content.
export function entranceOpening(doorLeftX: number, m: CityMetrics): { x: number; y: number; w: number; h: number } {
  const sx = m.unit * STREET_SCALE.entranceX;
  const sy = m.unit * STREET_SCALE.entranceY;
  const left = doorLeftX + (DOOR_WIDTH / 2) * (1 - m.unit);
  return { x: left + 2 * sx, y: m.doorY - 25 * sy, w: 18 * sx, h: 25 * sy };
}

// Ombre de l'entrée pendant un seuil : la porte « s'ouvre » puis « se referme », pleine à mi-seuil (habitants et clients).
export const DOOR_DARK = '#1a1622';
export const doorDarkOpacity = (depth: number): number => 0.85 * Math.min(1, 4 * Math.min(depth, 1 - depth));

// Déroulé d'un aller simple : [seuil de départ ?] → [demi-tour ?] → rue → [demi-tour ?] → [seuil d'arrivée ?].
// `fromDoor` / `toDoor` : le trajet commence / finit par une porte. `c` : secondes depuis le début du trajet.
export function passageAt(o: { fromX: number; toX: number; dir: 1 | -1; speed: number; fromDoor: boolean; toDoor: boolean }, c: number): Passage | null {
  if (c < 0) return null;
  const face = facingYaw(o.dir);
  const dist = Math.abs(o.toX - o.fromX);
  const street = dist / o.speed;
  const th0 = o.fromDoor ? THRESHOLD_S : 0;
  const tu0 = o.fromDoor ? TURN_S : 0;
  const tu1 = o.toDoor ? TURN_S : 0;
  const th1 = o.toDoor ? THRESHOLD_S : 0;
  let s = c;
  if (s < th0) return { stage: 'threshold', x: o.fromX, depth: 1 - s / th0, yaw: YAW_FRONT, gait: 'walk', walked: 0 };
  s -= th0;
  if (s < tu0) return { stage: 'turn', x: o.fromX, depth: 0, yaw: turnYaw(YAW_FRONT, face, s / tu0), gait: 'step', walked: 0 };
  s -= tu0;
  if (s < street) return { stage: 'street', x: o.fromX + o.dir * o.speed * s, depth: 0, yaw: face, gait: 'walk', walked: o.speed * s };
  s -= street;
  if (s < tu1) return { stage: 'turn', x: o.toX, depth: 0, yaw: turnYaw(face, YAW_BACK, s / tu1), gait: 'step', walked: dist };
  s -= tu1;
  if (s < th1) return { stage: 'threshold', x: o.toX, depth: s / th1, yaw: YAW_BACK, gait: 'walk', walked: dist };
  return null;
}
