import type { Vec3 } from './mesh';

// Une seule direction de lumière par pièce pour le modelé des sprites : celle de la fenêtre principale.
export type LightSide = 'left' | 'right';

// Repère monde (x à droite, y en haut, z vers le spectateur) : la lumière vient d'en haut, du côté de la vitre, un peu du fond.
export const lightVector = (side: LightSide): Vec3 => (side === 'left' ? [-0.62, 0.72, -0.14] : [0.62, 0.72, -0.14]);

// Côté de la plus grande vitre (à surface égale, la première) ; sans vitre, la lumière vient du haut-gauche.
export function roomLightSide(glasses: readonly { x: number; w: number }[], roomWidth: number): LightSide {
  let best: { x: number; w: number } | null = null;
  for (const g of glasses) if (!best || g.w > best.w) best = g;
  if (!best) return 'left';
  return best.x + best.w / 2 < roomWidth / 2 ? 'left' : 'right';
}
