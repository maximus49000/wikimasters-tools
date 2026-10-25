import type { Angle } from '../footprint';
import type { Vec3 } from './mesh';

// Caméra en perspective de la pièce (maquette G6) : distance focale f (cm), inclinaison pitch (rad),
// échelle en px de pièce par cm au point d'ancrage (PX_PER_CM_X = 30/21).
export type PerspCamera = { id: 'room' | 'plunge'; f: number; pitch: number; scale: number };

export const ROOM_CAMERA: PerspCamera = { id: 'room', f: 650, pitch: 0.24, scale: 30 / 21 };
// Vue plongeante : même modèle, caméra plus inclinée (valeur de départ, réglée au banc).
export const PLUNGE_PERSP: PerspCamera = { id: 'plunge', f: 650, pitch: 0.97, scale: 30 / 21 };

// Convention de `turn` (furniture-render3d) : angle 1 = la face avant tourne vers la gauche.
export const yawOf = (angle: Angle): number => (-angle * Math.PI) / 4;

export type ViewTransform = {
  /** Rotation du meuble autour de l'axe vertical (yaw), repère monde. */
  turn(p: Vec3): Vec3;
  /** Inclinaison de la caméra (pitch) : repère monde → repère caméra. */
  tilt(p: Vec3): Vec3;
  /** Projection d'un point du repère caméra : [x px, y px vers le BAS, profondeur], relatifs à l'origine. */
  project(c: Vec3): Vec3;
};

export function viewTransform(cam: PerspCamera, yaw: number): ViewTransform {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  return {
    turn: (p) => [p[0] * cy + p[2] * sy, p[1], -p[0] * sy + p[2] * cy],
    tilt: (p) => [p[0], p[1] * cp - p[2] * sp, p[1] * sp + p[2] * cp],
    project: (c) => {
      const k = cam.f / (cam.f - c[2]);
      return [c[0] * cam.scale * k, -c[1] * cam.scale * k, c[2]];
    },
  };
}

export function viewPoint(cam: PerspCamera, yaw: number, p: Vec3): Vec3 {
  const v = viewTransform(cam, yaw);
  return v.project(v.tilt(v.turn(p)));
}

// Point du modèle (x de gauche à droite, y en haut, z de l'avant vers le fond, cm) → repère centré de la maquette
// (origine au centre de la base, z vers le spectateur).
export function centeredOf(model: { w: number; d: number }, p: readonly [number, number, number]): Vec3 {
  return [p[0] - model.w / 2, p[1], model.d / 2 - p[2]];
}
