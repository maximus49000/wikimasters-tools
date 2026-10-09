import type { CityIntensity } from './intensity';
import { STREET_SCALE } from './metrics';
import { outfitFor, type Outfit } from './people';
import { hashString, mulberry32 } from '../scene-world';

export type Lane = 'near' | 'far';
// On roule à droite : face aux immeubles, le premier plan va vers la droite de l'écran, le fond vers la gauche.
export const LANE_DIR: Record<Lane, 1 | -1> = { near: 1, far: -1 };
export type VehicleKind = 'car' | 'bus' | 'van' | 'bike';
// `rider` : tenue du cycliste (vélos seulement).
export type Vehicle = { id: string; lane: Lane; kind: VehicleKind; color: string; speed: number; phase: number; u: number; scale: number; rider?: Outfit };

// Demi-longueur des sprites (repère du sprite, avant échelle) : carrosserie ou roues, sans le faisceau des phares.
export const VEHICLE_HALF: Record<VehicleKind, number> = { car: 20, bus: 34, van: 23, bike: 12 };
const MAX_SCALE = 1.1;
// Écart minimal entre deux véhicules qui se suivent sur la même file (px du monde, à l'échelle 1 de la scène) :
// le plus long sprite (bus) à l'échelle maximale, plus une marge.
export const MIN_VEHICLE_GAP = 2 * VEHICLE_HALF.bus * STREET_SCALE.vehicle * MAX_SCALE + 16;

const COLORS = ['#3B6FD6', '#C0463A', '#E0A21E', '#2E8B6A', '#444444', '#EEEEEE', '#7A3B8C', '#B3262B', '#4A9CC4'];
const WORLD_PAD = 160;

export type LaneSpeeds = { near: number; far: number; bike: number };

// Vitesse commune des véhicules motorisés de chaque file, et des vélos entre eux (tirée de la graine de la pièce).
export function laneSpeeds(seed: number): LaneSpeeds {
  const laneRng = mulberry32(seed ^ hashString('lane-speed'));
  return { near: 55 + laneRng() * 30, far: 50 + laneRng() * 30, bike: 18 + laneRng() * 6 };
}

// Pas de dépassement ni de chevauchement : sur une file, tous les véhicules motorisés roulent à la même vitesse (tirée par
// file), et les vélos (piste au bord de la file du premier plan) à une même vitesse entre eux. Chaque véhicule occupe une
// case de la boucle (longueur du monde ÷ nombre de véhicules de la file), avec un décalage tiré dans la case qui laisse
// toujours au moins MIN_VEHICLE_GAP avec le suivant. Les écarts sont donc constants : la position ne dépend que du temps.
export function vehiclesFor(width: number, seed: number): Vehicle[] {
  const rng = mulberry32(seed ^ 0x7ee1c);
  const speeds = laneSpeeds(seed);
  const out: Vehicle[] = [];
  const perLane = Math.max(2, Math.min(8, Math.round(width / 170)));
  const slot = (width + WORLD_PAD) / perLane;
  const jitter = Math.max(0, slot - MIN_VEHICLE_GAP);
  for (const lane of ['near', 'far'] as const) {
    for (let i = 0; i < perLane; i++) {
      const roll = rng();
      const kind: VehicleKind = roll < 0.08 ? 'bus' : roll < 0.2 ? 'van' : lane === 'near' && roll < 0.3 ? 'bike' : 'car';
      const color = COLORS[Math.floor(rng() * COLORS.length)]!;
      rng(); // ancien tirage de vitesse individuelle : conservé pour ne pas changer les tirages suivants (u, échelle)
      const phase = i * slot + rng() * jitter;
      out.push({
        id: `veh-${lane}-${i}`,
        lane,
        kind,
        color,
        speed: kind === 'bike' ? speeds.bike : speeds[lane],
        phase,
        u: rng(),
        scale: 0.9 + rng() * 0.2,
        ...(kind === 'bike' ? { rider: outfitFor('ordinary', mulberry32(seed ^ hashString(`rider-${lane}-${i}`))) } : {}),
      });
    }
  }
  return out;
}

// Les voitures, bus et camionnettes suivent la circulation ; les vélos suivent les piétons (donc la pluie les chasse).
export const vehicleGate = (v: Vehicle, i: CityIntensity): number => (v.kind === 'bike' ? i.walkers * 0.4 : i.traffic);
