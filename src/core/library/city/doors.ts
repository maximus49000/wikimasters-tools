import { WORLD_MARGIN, citySkyline, hashString, mulberry32 } from '../scene-world';
import type { CityIntensity } from './intensity';
import { MAX_TRIP_PX, farDoorX, passageAt, type Passage } from './doorway';
import { DOOR_MARGIN, DOOR_WIDTH, WALK_PACE } from './metrics';
import { outfitFor, type Outfit, type Profile } from './people';
import { SHOP_MIN_WIDTH, shopSlotsFor } from './shops/slots';

export type Door = { id: string; x: number; variant: 0 | 1 | 2; hallU: number };
export { DOOR_MARGIN, DOOR_WIDTH } from './metrics';
export { MAX_TRIP_PX };
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

// `endDoorX` : porte au bout d'un trajet plafonné (centre) ; l'habitant qui sort y entre, celui qui rentre en sort. null : bord du monde.
export type Trip = { id: string; kind: 'out' | 'in'; doorX: number; endDoorX: number | null; dir: 1 | -1; speed: number; phase: number; outfit: Outfit; profile: Profile; scale: number };

// Porte au bout du trajet : la plus lointaine à portée ; si le bord est au-delà du plafond et qu'aucune porte n'est à portée,
// la plus proche au-delà (cas rare : un trajet jamais fini en rue ni plus long que le cycle).
function endDoorOf(doorX: number, dir: 1 | -1, width: number, others: readonly number[]): number | null {
  if (!Number.isFinite(width)) return null;
  const far = farDoorX(doorX, dir, width, others);
  if (far !== null) return far;
  const toEdge = dir > 0 ? width + WORLD_MARGIN - doorX : doorX + WORLD_MARGIN;
  if (toEdge <= MAX_TRIP_PX) return null;
  let best: number | null = null;
  for (const x of others) if ((x - doorX) * dir > 0 && (best === null || (x - doorX) * dir < (best - doorX) * dir)) best = x;
  return best;
}

// `width` : largeur du monde (infinie par défaut : jamais de porte au bout, les trajets vont au bord).
// Un trajet ne dépasse pas MAX_TRIP_PX depuis sa porte : au-delà du plafond il finit à une autre porte, jamais en pleine rue.
// Durée max = 520 / vitesse min (18 × 0,7 = 12,6) ≈ 41 s + seuils et demi-tours, très en deçà de TRIP_CYCLE.
export function tripsFor(doors: Door[], seed: number, width = Infinity): Trip[] {
  const rng = mulberry32(seed ^ hashString('trips'));
  const out: Trip[] = [];
  const centers = doors.map((d) => d.x + DOOR_WIDTH / 2);
  for (const door of doors) {
    for (const kind of ['out', 'in'] as const) {
      const profile: Profile = rng() < 0.3 ? 'suit' : rng() < 0.5 ? 'stroller' : 'ordinary';
      const doorX = door.x + DOOR_WIDTH / 2;
      const dir: 1 | -1 = rng() < 0.5 ? 1 : -1;
      const others = centers.filter((x) => x !== doorX);
      out.push({
        id: `${door.id}-${kind}`,
        kind,
        doorX,
        endDoorX: endDoorOf(doorX, kind === 'out' ? dir : ((-dir) as 1 | -1), width, others),
        dir,
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

// Passage d'un habitant `t` secondes après la date d'origine, ou null s'il n'est pas en route.
// Départ : seuil de sa porte (qui sort) ou bord du monde / seuil de `endDoorX` (qui rentre) ; arrivée symétrique.
export function tripAt(trip: Trip, width: number, t: number): Passage | null {
  const c = (((t + trip.phase) % TRIP_CYCLE) + TRIP_CYCLE) % TRIP_CYCLE;
  const forwardEdge = trip.dir > 0 ? width + WORLD_MARGIN : -WORLD_MARGIN;
  const backEdge = trip.dir > 0 ? -WORLD_MARGIN : width + WORLD_MARGIN;
  const far = trip.endDoorX;
  if (trip.kind === 'out') return passageAt({ fromX: trip.doorX, toX: far ?? forwardEdge, dir: trip.dir, speed: trip.speed, fromDoor: true, toDoor: far !== null }, c);
  return passageAt({ fromX: far ?? backEdge, toX: trip.doorX, dir: trip.dir, speed: trip.speed, fromDoor: far !== null, toDoor: true }, c);
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
