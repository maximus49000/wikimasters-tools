// Dessin provisoire Opus — reprise Fable prévue.
import type { StandingKind } from './library-types';
import type { Palette } from './styles';

// Un volume d'un meuble : u largeur depuis la gauche, h hauteur depuis le sol, d profondeur depuis l'avant (fractions 0-1).
export type Part = { u0: number; u1: number; h0: number; h1: number; d0: number; d1: number; fill: keyof Palette; round?: boolean };

const P = (u0: number, u1: number, h0: number, h1: number, d0: number, d1: number, fill: keyof Palette, round = false): Part => ({ u0, u1, h0, h1, d0, d1, fill, round });

const legs = (h: number, fill: keyof Palette, inset = 0.04, size = 0.06): Part[] => [
  P(inset, inset + size, 0, h, 0, 0.15, fill), P(1 - inset - size, 1 - inset, 0, h, 0, 0.15, fill),
  P(inset, inset + size, 0, h, 0.85, 1, fill), P(1 - inset - size, 1 - inset, 0, h, 0.85, 1, fill),
];
const seat = (body: keyof Palette, light: keyof Palette, dark: keyof Palette): Part[] => [
  P(0, 1, 0, 0.5, 0, 1, body, true), P(0, 1, 0.5, 1, 0.7, 1, body, true),
  P(0, 0.12, 0.5, 0.72, 0, 0.7, dark, true), P(0.88, 1, 0.5, 0.72, 0, 0.7, dark, true),
  P(0.12, 0.88, 0.5, 0.6, 0, 0.7, light, true),
];

export const VOLUMES: Record<StandingKind, Part[]> = {
  shelf: [
    P(0, 1, 0, 1, 0.92, 1, 'woodDark'), P(0, 0.05, 0, 1, 0, 1, 'wood'), P(0.95, 1, 0, 1, 0, 1, 'wood'),
    P(0, 1, 0.97, 1, 0, 1, 'wood'), P(0, 1, 0.64, 0.67, 0, 1, 'wood'), P(0, 1, 0.32, 0.35, 0, 1, 'wood'), P(0, 1, 0, 0.03, 0, 1, 'wood'),
  ],
  desk: [...legs(0.84, 'leg'), P(0, 1, 0.84, 1, 0, 1, 'desk')],
  chair: [...legs(0.4, 'leg', 0.1, 0.1), P(0.1, 0.9, 0.4, 0.5, 0, 1, 'desk'), P(0.1, 0.9, 0.5, 1, 0.85, 1, 'wood')],
  sofa: seat('fabric', 'fabricLight', 'fabricDark'),
  armchair: seat('warm', 'warmLight', 'warmDark'),
  basket: [P(0, 1, 0, 0.5, 0, 1, 'warm', true), P(0.1, 0.9, 0.35, 0.5, 0.1, 0.9, 'fabricLight', true)],
  bowl: [P(0, 1, 0, 0.5, 0, 1, 'metal', true)],
  kennel: [P(0, 1, 0, 0.7, 0, 1, 'wood'), P(0, 1, 0.7, 1, 0, 1, 'door'), P(0.35, 0.65, 0, 0.5, 0, 0.02, 'woodDark')],
  charger: [P(0, 1, 0, 0.3, 0, 1, 'metal')],
  plant: [P(0.2, 0.8, 0, 0.25, 0.2, 0.8, 'warm'), P(0.1, 0.9, 0.25, 1, 0.1, 0.9, 'leaf', true)],
  lamp: [P(0.1, 0.9, 0, 0.05, 0.2, 0.8, 'metal'), P(0.45, 0.55, 0.05, 0.83, 0.45, 0.55, 'metal'), P(0, 1, 0.83, 1, 0.2, 0.8, 'shade', true)],
  'coffee-table': [...legs(0.66, 'leg', 0.08), P(0, 1, 0.66, 1, 0, 1, 'desk')],
  rug: [P(0, 1, 0, 0.04, 0, 1, 'rug')],
  globe: [P(0.2, 0.8, 0, 0.08, 0.2, 0.8, 'wood'), P(0.45, 0.55, 0.08, 0.35, 0.45, 0.55, 'wood'), P(0.1, 0.9, 0.35, 1, 0.1, 0.9, 'metal', true)],
  telescope: [P(0.3, 0.7, 0, 0.55, 0.3, 0.7, 'wood'), P(0, 1, 0.55, 0.8, 0.35, 0.65, 'metal', true)],
  automaton: [P(0.25, 0.75, 0, 0.25, 0.3, 0.7, 'woodDark'), P(0.2, 0.8, 0.25, 0.75, 0.2, 0.8, 'metal'), P(0.3, 0.7, 0.75, 1, 0.3, 0.7, 'metal', true)],
};
