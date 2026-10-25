import type { StyleId } from '../library-types';
import type { Fill } from '../furniture-render3d';
import { paletteOf } from '../styles';
import { tone, type Tone } from './tone';

// Variantes de pièces d'un style (pieds, capitons, rivets, plaid, motif) : le dessin 3D des meubles les lit.
export type CelVariant = { legs: 'taper' | 'straight' | 'turned' | 'hairpin' | 'block' | 'claw'; tufted: boolean; rivets: boolean; throw: 'none' | 'plain' | 'fringed'; pattern: 'none' | 'diamonds' | 'stripes' | 'neon-edge' };
// Allure cellulo d'une pièce : teintes (aplat, ombre violette, rehaut) de chaque couleur de la palette, sol, variantes.
export type CelLook = { style: StyleId; tones: Record<Fill, Tone>; floor: string; variant: CelVariant };

const NEUTRAL: CelVariant = Object.freeze({ legs: 'straight', tufted: false, rivets: false, throw: 'none', pattern: 'none' });

// Une allure par style, calculée une fois (les teintes sont comparées par identité : abat-jour allumé, cel/models).
const looks = new Map<StyleId, CelLook>();
export function lookOf(style: StyleId): CelLook {
  const hit = looks.get(style);
  if (hit) return hit;
  const palette = paletteOf(style);
  const tones = Object.fromEntries(Object.entries(palette).map(([k, c]) => [k, tone(c)])) as Record<Fill, Tone>;
  const look: CelLook = { style, tones, floor: palette.floor, variant: NEUTRAL };
  looks.set(style, look);
  return look;
}
