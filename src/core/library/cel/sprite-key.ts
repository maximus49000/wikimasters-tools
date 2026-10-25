import type { Angle } from '../footprint';
import type { StandingKind, StyleId } from '../library-types';
import type { LightSide } from './light';

// Version du dessin cellulo : à incrémenter quand un dessin change (les anciennes images ne sont plus relues).
export const CEL_VERSION = 11;
// Début de toute clé de sprite : la version du dessin (la mémoire persistante efface les images d'une autre version).
export const SPRITE_KEY_PREFIX = `cel${CEL_VERSION}|`;

// Une image par (meuble, angle, style, côté de la lumière, caméra, résolution, allumé, état de vie, partie) ; `life` : clé du palier.
export type FurnitureSpriteSpec = { kind: StandingKind; angle: Angle; style: StyleId; side: LightSide; cam: 'room' | 'plunge'; res: number; lit: boolean; life: string; part?: 'base' | 'overhang' };
// Une image par objet porté : `item` = itemsKey([pl]) (forme, présentation, place, couleur… jamais l'image de sa carte), son porteur et l'angle de celui-ci.
export type ItemSpriteSpec = { item: string; host: 'desk' | 'shelf'; hostAngle: Angle; style: StyleId; side: LightSide; cam: 'room' | 'plunge'; res: number; lit: boolean };

// Résolution au quart près : un zoom qui bouge à peine ne refait pas l'image.
const quarter = (r: number): number => Math.round(r * 4) / 4;

export function spriteKey(s: FurnitureSpriteSpec | ItemSpriteSpec): string {
  if ('kind' in s) return `${SPRITE_KEY_PREFIX}f|${s.kind}|${s.angle}|${s.style}|${s.side}|${s.cam}|${quarter(s.res)}|${s.lit ? 1 : 0}|${s.life}|${s.part ?? ''}`;
  return `${SPRITE_KEY_PREFIX}i|${s.item}|${s.host}|${s.hostAngle}|${s.style}|${s.side}|${s.cam}|${quarter(s.res)}|${s.lit ? 1 : 0}`;
}
