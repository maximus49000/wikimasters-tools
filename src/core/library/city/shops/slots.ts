import { citySkyline, hashString, mulberry32 } from '../../scene-world';
import { DOOR_MARGIN, DOOR_WIDTH } from '../metrics';
import { GROUND_FLOOR } from '../facades';

// Locaux commerciaux : immeubles du premier plan dont la partie visible fait au moins SHOP_MIN_WIDTH px (≈ 60 %).
// L'entrée des habitants est poussée au bord (côté tiré) ; le local occupe le reste du rez-de-chaussée.
export const SHOP_MIN_WIDTH = 38;
// Écart entre l'entrée des habitants et le local.
const GAP = 2;
// Porte vitrée du magasin, à côté de la vitrine.
const SHOP_DOOR = 6;

export type ShopSlot = { id: string; index: number; x: number; w: number; doorSide: 'left' | 'right'; residentDoorX: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type ShopFrame = { sign: Rect; window: Rect; door: Rect };

export function shopSlotsFor(width: number, height: number, seed: number): ShopSlot[] {
  // Générateur propre aux locaux : les tirages de doorsFor (position, variante, hall) ne bougent pas.
  const rng = mulberry32(seed ^ hashString('shop-slots'));
  const out: ShopSlot[] = [];
  for (const b of citySkyline(width, height, seed)) {
    if (b.far || b.x + b.w <= 0 || b.x >= width) continue;
    const side: 'left' | 'right' = rng() < 0.5 ? 'left' : 'right';
    const lo = Math.max(b.x, 0);
    const hi = Math.min(b.x + b.w, width);
    if (hi - lo < SHOP_MIN_WIDTH) continue;
    const residentDoorX = Math.floor((side === 'left' ? lo + DOOR_MARGIN : hi - DOOR_MARGIN - DOOR_WIDTH) * 10) / 10;
    const x = side === 'left' ? residentDoorX + DOOR_WIDTH + GAP : lo + DOOR_MARGIN;
    const end = side === 'left' ? hi - DOOR_MARGIN : residentDoorX - GAP;
    out.push({ id: `shop-${out.length}`, index: out.length, x, w: end - x, doorSide: side, residentDoorX });
  }
  return out;
}

// Géométrie d'un local (repère du monde) : enseigne en haut du rez-de-chaussée, vitrine dessous, porte côté rue latérale
// opposé à l'entrée des habitants.
export function shopFrame(slot: ShopSlot, ground: number): ShopFrame {
  const top = ground - GROUND_FLOOR;
  const sign = { x: slot.x, y: top + 2, w: slot.w, h: 5 };
  const doorX = slot.doorSide === 'left' ? slot.x + slot.w - SHOP_DOOR : slot.x;
  const door = { x: doorX, y: top + 9, w: SHOP_DOOR, h: GROUND_FLOOR - 9 };
  const window = { x: slot.doorSide === 'left' ? slot.x : slot.x + SHOP_DOOR + 1, y: top + 8, w: slot.w - SHOP_DOOR - 1, h: GROUND_FLOOR - 9 };
  return { sign, window, door };
}
