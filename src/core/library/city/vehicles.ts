import type { CityIntensity } from './intensity';
import { mulberry32 } from '../scene-world';

export type Lane = 'near' | 'far';
// On roule à droite : face aux immeubles, le premier plan va vers la droite de l'écran, le fond vers la gauche.
export const LANE_DIR: Record<Lane, 1 | -1> = { near: 1, far: -1 };
export type VehicleKind = 'car' | 'bus' | 'van' | 'bike';
export type Vehicle = { id: string; lane: Lane; kind: VehicleKind; color: string; speed: number; phase: number; u: number; scale: number };

const COLORS = ['#3B6FD6', '#C0463A', '#E0A21E', '#2E8B6A', '#444444', '#EEEEEE', '#7A3B8C', '#B3262B', '#4A9CC4'];
const WORLD_PAD = 160;

export function vehiclesFor(width: number, seed: number): Vehicle[] {
  const rng = mulberry32(seed ^ 0x7ee1c);
  const out: Vehicle[] = [];
  const perLane = Math.max(2, Math.min(8, Math.round(width / 170)));
  for (const lane of ['near', 'far'] as const) {
    for (let i = 0; i < perLane; i++) {
      const roll = rng();
      const kind: VehicleKind = roll < 0.08 ? 'bus' : roll < 0.2 ? 'van' : lane === 'near' && roll < 0.3 ? 'bike' : 'car';
      out.push({
        id: `veh-${lane}-${i}`,
        lane,
        kind,
        color: COLORS[Math.floor(rng() * COLORS.length)]!,
        speed: kind === 'bike' ? 18 + rng() * 8 : kind === 'bus' ? 42 + rng() * 14 : 55 + rng() * 35,
        phase: rng() * (width + WORLD_PAD),
        u: rng(),
        scale: 0.9 + rng() * 0.2,
      });
    }
  }
  return out;
}

// Les voitures, bus et camionnettes suivent la circulation ; les vélos suivent les piétons (donc la pluie les chasse).
export const vehicleGate = (v: Vehicle, i: CityIntensity): number => (v.kind === 'bike' ? i.walkers * 0.4 : i.traffic);
