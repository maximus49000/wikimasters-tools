import { WORLD_MARGIN, citySkyline, hashString, mulberry32 } from '../scene-world';
import type { CityIntensity } from './intensity';
import { WALK_PACE } from './metrics';
import { outfitFor, type Outfit, type Profile } from './people';

export type Door = { id: string; x: number; variant: 0 | 1 | 2; hallU: number };
// Largeur du cadre de l'entrée telle que dessinée (sprite de 22 px réduit, voir ENTRANCE_SCALE dans city-sprites).
export const DOOR_WIDTH = 12;
// Marge entre l'entrée et les bords de son immeuble (auvent, interphone et plaque débordent un peu du cadre).
export const DOOR_MARGIN = 4;
export const TRIP_CYCLE = 160;

// Une entrée par immeuble du premier plan visible (les plus étroits font 28 px : l'entrée de 12 px y tient avec ses marges).
export function doorsFor(width: number, height: number, seed: number): Door[] {
  const rng = mulberry32(seed ^ hashString('doors'));
  return citySkyline(width, height, seed)
    .filter((b) => !b.far && b.x < width)
    .map((b, i) => {
      const room = Math.max(0, b.w - DOOR_WIDTH - 2 * DOOR_MARGIN);
      return { id: `door-${i}`, x: Math.round((b.x + DOOR_MARGIN + rng() * room) * 10) / 10, variant: Math.floor(rng() * 3) as 0 | 1 | 2, hallU: rng() };
    });
}

export type Trip = { id: string; kind: 'out' | 'in'; doorX: number; dir: 1 | -1; speed: number; phase: number; outfit: Outfit; profile: Profile; scale: number };

const FADE_S = 0.8;
const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export function tripsFor(doors: Door[], seed: number): Trip[] {
  const rng = mulberry32(seed ^ hashString('trips'));
  const out: Trip[] = [];
  for (const door of doors) {
    for (const kind of ['out', 'in'] as const) {
      const profile: Profile = rng() < 0.3 ? 'suit' : rng() < 0.5 ? 'stroller' : 'ordinary';
      out.push({
        id: `${door.id}-${kind}`,
        kind,
        doorX: door.x + DOOR_WIDTH / 2,
        dir: rng() < 0.5 ? 1 : -1,
        speed: (18 + rng() * 8) * WALK_PACE,
        phase: rng() * TRIP_CYCLE,
        outfit: outfitFor(profile, rng),
        profile,
        scale: 0.95 + rng() * 0.15,
      });
    }
  }
  return out;
}

// Un trajet ne dépasse jamais cette distance depuis la porte : au-delà, l'habitant s'efface (rue latérale) ou apparaît.
// Durée max = 520 / vitesse min (18 × 0,7 = 12,6) ≈ 41 s, très en deçà de TRIP_CYCLE : le cycle ne coupe jamais un trajet.
export const MAX_TRIP_PX = 520;

// Distance à parcourir entre la porte et le bord du monde (vers l'avant pour qui sort, depuis l'arrière pour qui rentre), plafonnée.
const reachOf = (trip: Trip, width: number): number => {
  const forward = trip.dir > 0 ? width + WORLD_MARGIN - trip.doorX : trip.doorX + WORLD_MARGIN;
  const backward = trip.dir > 0 ? trip.doorX + WORLD_MARGIN : width + WORLD_MARGIN - trip.doorX;
  return Math.min(trip.kind === 'out' ? forward : backward, MAX_TRIP_PX);
};

// Position d'un habitant `t` secondes après la date d'origine, ou null s'il n'est pas en route.
// `fade` : 0 = invisible, 1 = plein ; fondu de 0,8 s aux deux extrémités (porte, bord du monde ou plafond de distance).
export function tripAt(trip: Trip, width: number, t: number): { x: number; fade: number } | null {
  const c = (((t + trip.phase) % TRIP_CYCLE) + TRIP_CYCLE) % TRIP_CYCLE;
  const reach = reachOf(trip, width);
  const duration = reach / trip.speed;
  if (c >= duration) return null;
  const fade = Math.min(smooth(c / FADE_S), 1 - smooth((c - (duration - FADE_S)) / FADE_S));
  const startX = trip.kind === 'out' ? trip.doorX : trip.doorX - trip.dir * reach;
  return { x: startX + trip.dir * trip.speed * c, fade };
}

// Le trajet a lieu dans ce tour de cycle si le tirage de (trajet, tour) passe sous le seuil.
export function tripHappens(trip: Trip, t: number, gate: number): boolean {
  const turn = Math.floor((t + trip.phase) / TRIP_CYCLE);
  return mulberry32(hashString(trip.id) ^ Math.imul(turn, 2654435761))() < gate;
}

// Densité de référence : au plus ce nombre d'entrées par 720 px de monde garde la probabilité pleine par trajet.
// Au-delà (une entrée par immeuble, ≈ 13 à 15 pour 720 px), la probabilité par trajet est réduite d'autant : le nombre
// d'habitants en route reste celui de 8 entrées. Simulé sur une journée : au plus 5 visibles à la fois par 720 px
// (borne mobile : 6, vérifiée par les tests), un peu plus de 0,3 en moyenne.
export const RESIDENT_DOORS_PER_720 = 8;

// On sort le matin (6 h 30 à 9 h) et on rentre le soir (17 h à 20 h) ; le reste du temps, un peu des deux.
// `doors` / `width` : nombre d'entrées et largeur du monde (par défaut, la densité de référence : pas de réduction).
export function residentFlow(i: CityIntensity, minutes: number, doors = RESIDENT_DOORS_PER_720, width = 720): { out: number; in: number } {
  const h = (((minutes % 1440) + 1440) % 1440) / 60;
  const morning = h >= 6.5 && h < 9;
  const evening = h >= 17 && h < 20;
  const density = doors > 0 ? Math.min(1, (RESIDENT_DOORS_PER_720 * width) / 720 / doors) : 1;
  const base = Math.min(1, i.walkers * 0.9) * density;
  return { out: base * (morning ? 1 : evening ? 0.3 : 0.5), in: base * (evening ? 1 : morning ? 0.3 : 0.5) };
}
