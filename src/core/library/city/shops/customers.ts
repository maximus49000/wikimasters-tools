import { WORLD_MARGIN, hashString, mulberry32 } from '../../scene-world';
import { MAX_TRIP_PX } from '../doors';
import type { CityIntensity } from '../intensity';
import { WALK_PACE } from '../metrics';
import { outfitFor, type Outfit, type Profile } from '../people';
import { SHOP_DEFS, type ShopTypeId } from './catalog';
import { gestureAt, SHOP_FAMILY, takesAway, type Pose } from './gestures';
import { crowdAt } from './hours';
import type { ShopFrame, ShopSlot } from './slots';
import type { ShopView } from './view';

// Clients : comme les habitants (doors.ts), un aller-retour depuis le bord du monde, mais avec un arrêt DANS le magasin :
// le client passe la porte, apparaît derrière la vitrine (debout devant le comptoir) 20 à 60 s, ressort et repart.
// Deux visites par local et par cycle de VISIT_CYCLE secondes ; la présence est tirée par (visite, tour de cycle).
export const VISIT_CYCLE = 240;
// Réglage global : avec deux visites par local, la moyenne reste vers 4 clients en route par 720 px.
const CUSTOMER_SCALE = 0.55;
const FADE_S = 0.6;

export type Visit = { id: string; slotId: string; doorX: number; innerX: number; dir: 1 | -1; speed: number; phase: number; stay: number; outfit: Outfit; scale: number;
  // Type du commerce au calcul des visites (null si inconnu) et place du client dans l'intérieur, selon la famille.
  type: ShopTypeId | null;
  seat: { x: number; facing: 1 | -1 };
};

// Places (fractions de la vitrine) des deux clients : au fauteuil, à la table, sinon devant le comptoir/rayon.
const SEAT_FRACTIONS = { chair: [0.3, 0.68], table: [0.3, 0.72], other: [0.35, 0.7] } as const;

export function visitsFor(slots: ShopSlot[], frames: Map<string, ShopFrame>, seed: number, typeOf: (slotId: string) => ShopTypeId | null): Visit[] {
  const rng = mulberry32(seed ^ hashString('shop-visits'));
  const out: Visit[] = [];
  for (const slot of slots) {
    const f = frames.get(slot.id)!;
    const type = typeOf(slot.id);
    const family = type ? SHOP_FAMILY[type] : null;
    const fractions = family === 'chair' ? SEAT_FRACTIONS.chair : family === 'table' ? SEAT_FRACTIONS.table : SEAT_FRACTIONS.other;
    for (let k = 0; k < 2; k++) {
      const seatX = f.window.x + f.window.w * fractions[k]!;
      const profile: Profile = rng() < 0.2 ? 'suit' : 'ordinary';
      out.push({
        id: `${slot.id}-v${k}`,
        slotId: slot.id,
        doorX: f.door.x + f.door.w / 2,
        // Deux places dans la vitrine (au tiers et aux deux tiers) : deux clients ne se superposent pas.
        innerX: f.window.x + f.window.w * (k === 0 ? 0.35 : 0.7),
        dir: rng() < 0.5 ? 1 : -1,
        speed: (16 + rng() * 8) * WALK_PACE,
        phase: rng() * VISIT_CYCLE,
        stay: 20 + rng() * 40,
        outfit: outfitFor(profile, rng),
        scale: 0.95 + rng() * 0.15,
        type,
        // Le client regarde vers le centre de la vitrine.
        seat: { x: seatX, facing: seatX <= f.window.x + f.window.w / 2 ? 1 : -1 },
      });
    }
  }
  return out;
}

const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export type VisitState = { stage: 'in' | 'inside' | 'out'; x: number; fade: number; gesture: Pose | null; carry: boolean };

export function visitAt(v: Visit, width: number, t: number): VisitState | null {
  const c = (((t + v.phase) % VISIT_CYCLE) + VISIT_CYCLE) % VISIT_CYCLE;
  const toEdge = v.dir > 0 ? v.doorX + WORLD_MARGIN : width + WORLD_MARGIN - v.doorX;
  const reach = Math.min(toEdge, MAX_TRIP_PX);
  const walk = reach / v.speed;
  if (c < walk) return { stage: 'in', x: v.doorX - v.dir * reach + v.dir * v.speed * c, fade: Math.min(smooth(c / FADE_S), 1 - smooth((c - (walk - FADE_S)) / FADE_S)), gesture: null, carry: false };
  if (c < walk + v.stay) return { stage: 'inside', x: v.innerX, fade: Math.min(smooth((c - walk) / FADE_S), 1 - smooth((c - (walk + v.stay - FADE_S)) / FADE_S)), gesture: v.type ? gestureAt(v.type, 'customer', t, hashString(v.id)) : null, carry: false };
  const back = c - walk - v.stay;
  if (back < walk) return { stage: 'out', x: v.doorX + v.dir * v.speed * back, fade: Math.min(smooth(back / FADE_S), 1 - smooth((back - (walk - FADE_S)) / FADE_S)), gesture: null, carry: v.type !== null && takesAway(v.type) };
  return null;
}

export function visitHappens(v: Visit, t: number, gate: number): boolean {
  const turn = Math.floor((t + v.phase) / VISIT_CYCLE);
  return mulberry32(hashString(v.id) ^ Math.imul(turn, 2654435761))() < gate;
}

// Probabilité qu'une visite ait lieu : seulement si le local est ouvert ; affluence du type × activité de la ville.
export function customerGate(view: ShopView, minutes: number, i: CityIntensity): number {
  if (view.phase !== 'open' || !view.sign) return 0;
  return Math.min(1, crowdAt(SHOP_DEFS[view.sign.type], minutes) * Math.max(0.3, i.walkers) * CUSTOMER_SCALE);
}
