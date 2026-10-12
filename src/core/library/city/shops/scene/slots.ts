import type { ShopTypeId } from '../catalog';
import { SHOP_FAMILY, type Family } from '../gestures';

// Créneaux du metteur en scène : la journée d'une boutique est découpée en créneaux de durée fixe par famille ; chaque
// créneau est une scène écrite d'avance (boutique au repos à ses bornes).
const FAMILY_SLOT_S: Readonly<Record<Family, number>> = {
  counter: 240, till: 240, drink: 240, browse: 360, machine: 360, table: 600, chair: 600, dance: 0,
};

// Durée d'un créneau (s). Le tatoueur prend son temps : 900 s au lieu des 600 s de la famille `chair` ; le caviste conseille
// longuement (dégustation, 2-4 min par client) : 360 s au lieu des 240 s de la famille `till`.
export const SLOT_S = (type: ShopTypeId): number => (type === 'tattoo' ? 900 : type === 'wine' ? 360 : FAMILY_SLOT_S[SHOP_FAMILY[type]]);
// Part du créneau pendant laquelle les clients arrivent ; le reste laisse finir les visites.
export const ARRIVAL_SHARE = 0.7;
// Pas de simulation (s).
export const STEP = 0.25;

export function slotIndexAt(type: ShopTypeId, secondsOfDay: number): number {
  return Math.floor(secondsOfDay / SLOT_S(type));
}

// Début du créneau, en secondes depuis minuit.
export function slotStart(type: ShopTypeId, index: number): number {
  return index * SLOT_S(type);
}

// La famille `dance` (boîte de nuit, salle d'arcade) reste hors G4b.
export const inScene = (type: ShopTypeId): boolean => SHOP_FAMILY[type] !== 'dance';
