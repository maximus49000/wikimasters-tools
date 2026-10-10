import { WORLD_MARGIN, citySkyline, hashString, mulberry32 } from '../scene-world';
import type { CityIntensity } from './intensity';
import { DOOR_MARGIN, DOOR_WIDTH, WALK_PACE } from './metrics';
import { outfitFor, type Outfit, type Profile } from './people';
import { SHOP_MIN_WIDTH, shopSlotsFor } from './shops/slots';

export type Door = { id: string; x: number; variant: 0 | 1 | 2; hallU: number };
export { DOOR_MARGIN, DOOR_WIDTH } from './metrics';
export const TRIP_CYCLE = 160;

// Une entrée par immeuble du premier plan visible (les plus étroits font 28 px : l'entrée de 12 px y tient avec ses marges).
// L'entrée est placée dans la partie visible de l'immeuble ([0, width)) ; un immeuble dont la partie visible est trop étroite
// pour une entrée (coupé au bord du monde) n'en a pas.
export function doorsFor(width: number, height: number, seed: number): Door[] {
  const rng = mulberry32(seed ^ hashString('doors'));
  const out: Door[] = [];
  const slots = shopSlotsFor(width, height, seed);
  let shop = 0;
  for (const b of citySkyline(width, height, seed)) {
    if (b.far || b.x + b.w <= 0 || b.x >= width) continue;
    // Trois tirages par immeuble visible, même s'il n'a pas d'entrée : les suivantes ne changent pas.
    const at = rng();
    const variant = Math.floor(rng() * 3) as 0 | 1 | 2;
    const hallU = rng();
    const lo0 = Math.max(b.x, 0);
    const hi0 = Math.min(b.x + b.w, width);
    // Immeuble à local : l'entrée est poussée au bord (shops/slots.ts), le local prend le reste du rez-de-chaussée.
    if (hi0 - lo0 >= SHOP_MIN_WIDTH) {
      out.push({ id: `door-${out.length}`, x: slots[shop++]!.residentDoorX, variant, hallU });
      continue;
    }
    const lo = lo0 + DOOR_MARGIN;
    const hi = hi0 - DOOR_MARGIN - DOOR_WIDTH;
    if (hi < lo) continue;
    out.push({ id: `door-${out.length}`, x: Math.floor((lo + at * (hi - lo)) * 10) / 10, variant, hallU });
  }
  return out;
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
