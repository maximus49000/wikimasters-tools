import { activeFestivities, type FestivityId } from './calendar';
import { WORLD_MARGIN, hashString, loopX, mulberry32 } from '../scene-world';
import type { CityContext, CityIntensity } from './intensity';
import { FAR_SHRINK, STREET_SCALE } from './metrics';
import { LANE_DIR, VEHICLE_HALF, type Lane, type LaneSpeeds, type Vehicle } from './vehicles';

// Événements de la ville (vague 1b-i) : le temps est découpé en créneaux de 25 s, regroupés en grands créneaux de 20 min.
// Le programme d'un grand créneau est tiré d'un coup (graine de la pièce + numéro du créneau), dans l'ordre : un événement
// n'est retenu que s'il finit dans son grand créneau et ne dépasse pas le plafond simultané. Aucun état, aucun Math.random.
export const SLOT_S = 25;
export const HYPER_SLOTS = 48;
export const HYPER_S = SLOT_S * HYPER_SLOTS;
export const EVENT_CHANCE = 0.2;
export const MAX_EVENTS = 2;
// Seuils de lumière du jour : « nuit » sous DARK, « jour » à partir de DAY.
export const DARK = 0.3;
export const DAY = 0.35;
const TRAFFIC_MIN = 0.1;
const WALKERS_MIN = 0.08;
// Marge (px) entre un véhicule d'événement et une voiture de sa file en dessous de laquelle la voiture s'efface.
const YIELD_MARGIN = 10;

export type CityEventId =
  | 'plane' | 'helicopter' | 'drone' | 'balloon' | 'kite' | 'banner-plane'
  | 'bus' | 'tram' | 'ambulance' | 'garbage-truck' | 'delivery-bike'
  | 'dog-walker' | 'umbrella-group'
  | 'crane' | 'apartment' | 'fireworks';
export type EventLayer = 'sky' | 'street' | 'sidewalk' | 'fixed';
export type Track = Lane | 'bike';

// Un événement en données. `hours` : plages [début, fin) en minutes ; fin < début = la plage passe minuit.
// `speed` (px/s) : traversée ; absent pour un véhicule de rue = vitesse de sa file. `duration` (s) : événement fixe.
// `half` : demi-longueur dessinée (px à l'échelle 1) pour l'écart avec la circulation. `y` : bande de hauteur (fraction).
export type EventDef = {
  id: CityEventId;
  layer: EventLayer;
  weight: number;
  // Poids pendant une fête active (le plus fort l'emporte sur le poids de base).
  festWeight?: Readonly<Partial<Record<FestivityId, number>>>;
  hours: readonly (readonly [number, number])[];
  half: number;
  speed?: number;
  duration?: number;
  light?: 'day' | 'dark';
  rain?: 'dry' | 'wet';
  workday?: true;
  needs?: 'traffic' | 'walkers';
  y?: readonly [number, number];
  lanes?: readonly Lane[] | 'bike';
};

const ALL_DAY = [[0, 1440]] as const;

export const EVENT_DEFS: readonly EventDef[] = [
  // Ciel
  { id: 'plane', layer: 'sky', weight: 3, hours: ALL_DAY, half: 20, speed: 70, y: [0.05, 0.16] },
  { id: 'helicopter', layer: 'sky', weight: 1.2, hours: [[420, 1320]], half: 26, speed: 40, y: [0.12, 0.26] },
  { id: 'drone', layer: 'sky', weight: 1, hours: [[540, 1140]], half: 10, speed: 16, light: 'day', rain: 'dry', y: [0.3, 0.42] },
  { id: 'balloon', layer: 'sky', weight: 0.6, hours: [[420, 1200]], half: 16, speed: 7, light: 'day', rain: 'dry', y: [0.1, 0.24] },
  { id: 'banner-plane', layer: 'sky', weight: 0.8, hours: [[600, 1140]], half: 60, speed: 35, light: 'day', rain: 'dry', y: [0.08, 0.16] },
  // Rue
  { id: 'bus', layer: 'street', weight: 2, hours: [[360, 1380]], half: 36, lanes: ['near', 'far'], needs: 'traffic' },
  { id: 'tram', layer: 'street', weight: 1.5, hours: [[330, 1440], [0, 30]], half: 68, lanes: ['far'] },
  { id: 'ambulance', layer: 'street', weight: 1, hours: ALL_DAY, half: 21, speed: 130, lanes: ['near', 'far'] },
  { id: 'garbage-truck', layer: 'street', weight: 1.5, hours: [[330, 540]], half: 34, lanes: ['near'] },
  { id: 'delivery-bike', layer: 'street', weight: 1.5, hours: [[690, 840], [1110, 1380]], half: 12, lanes: 'bike' },
  // Trottoir
  { id: 'dog-walker', layer: 'sidewalk', weight: 2, hours: [[390, 1350]], half: 20, speed: 9, needs: 'walkers' },
  { id: 'umbrella-group', layer: 'sidewalk', weight: 3, hours: [[420, 1260]], half: 20, speed: 18, rain: 'wet' },
  // Fixes
  { id: 'kite', layer: 'fixed', weight: 0.8, hours: [[600, 1140]], half: 10, duration: 90, light: 'day', rain: 'dry', y: [0.2, 0.32] },
  { id: 'crane', layer: 'fixed', weight: 1, hours: [[480, 1020]], half: 60, duration: 360, light: 'day', workday: true },
  { id: 'apartment', layer: 'fixed', weight: 2, hours: [[1050, 1410]], half: 4, duration: 180, light: 'dark' },
  { id: 'fireworks', layer: 'fixed', weight: 0.25, hours: [[1290, 1440], [0, 30]], half: 140, duration: 30, light: 'dark', rain: 'dry', festWeight: { 'new-year': 10, bastille: 5 } },
];

// En mouvement réduit, seuls ces événements fixes restent (figés) ; rien ne traverse, aucun feu d'artifice.
export const STILL_EVENTS: ReadonlySet<CityEventId> = new Set<CityEventId>(['kite', 'crane', 'apartment']);

export const defOf = (id: CityEventId): EventDef => EVENT_DEFS.find((d) => d.id === id)!;

export type EventConditions = { daylight: number; wet: boolean; workday: boolean; traffic: number; walkers: number; fests: readonly FestivityId[] };

export function eventConditions(city: CityContext, i: CityIntensity): EventConditions {
  const k = city.day.kind;
  return { daylight: city.daylight, wet: city.precip >= 0.2, workday: k === 'school' || k === 'wednesday' || k === 'holiday', traffic: i.traffic, walkers: i.walkers, fests: activeFestivities(city.day.festivities, city.minutes) };
}

// Clé grossière : le programme n'est recalculé que si une condition passe un des seuils qu'utilise `eligible`.
export function conditionsKey(c: EventConditions): string {
  const light = c.daylight < DARK ? 'n' : c.daylight >= DAY ? 'd' : 't';
  return `${light}${c.wet ? 'w' : 's'}${c.workday ? 'o' : 'f'}${c.traffic >= TRAFFIC_MIN ? 'T' : 't'}${c.walkers >= WALKERS_MIN ? 'W' : 'w'}|${[...c.fests].sort().join('+')}`;
}

const inHours = (hours: EventDef['hours'], m: number): boolean => hours.some(([a, b]) => (a <= b ? m >= a && m < b : m >= a || m < b));

export function eligible(def: EventDef, minute: number, c: EventConditions): boolean {
  if (!inHours(def.hours, minute)) return false;
  if (def.light === 'day' && c.daylight < DAY) return false;
  if (def.light === 'dark' && c.daylight >= DARK) return false;
  if (def.rain === 'dry' && c.wet) return false;
  if (def.rain === 'wet' && !c.wet) return false;
  if (def.workday && !c.workday) return false;
  if (def.needs === 'traffic' && c.traffic < TRAFFIC_MIN) return false;
  if (def.needs === 'walkers' && c.walkers < WALKERS_MIN) return false;
  return true;
}

// `x0` : position d'un événement fixe ; `y` : hauteur tirée (fraction) ; `pick`, `variant` : tirages libres pour le rendu
// (immeuble, fenêtre, couleurs) ; `yields` : voitures de la même file effacées pendant tout le passage.
export type CityEvent = {
  key: string;
  id: CityEventId;
  layer: EventLayer;
  start: number;
  end: number;
  dir: 1 | -1;
  track: Track | null;
  speed: number;
  x0: number;
  y: number;
  pick: number;
  variant: number;
  yields: string[];
};

export type ScheduleInput = { seed: number; width: number; hyper: number; minutesAtHyperStart: number; cond: EventConditions; vehicles: Vehicle[]; speeds: LaneSpeeds };

export const travelSpan = (width: number): number => width + 2 * WORLD_MARGIN;

const trackFor = (def: EventDef, lean: number): Track | null => {
  if (def.lanes === 'bike') return 'bike';
  if (!def.lanes) return null;
  return def.lanes[Math.floor(lean * def.lanes.length)]!;
};

// Poids d'un événement : le plus fort entre son poids de base et celui de chacune des fêtes actives.
export function weightOf(def: EventDef, c: EventConditions): number {
  return Math.max(def.weight, ...c.fests.map((f) => def.festWeight?.[f] ?? 0));
}

const pickWeighted = (pool: EventDef[], roll: number, c: EventConditions): EventDef => {
  const total = pool.reduce((s, d) => s + weightOf(d, c), 0);
  let acc = roll * total;
  for (const d of pool) {
    acc -= weightOf(d, c);
    if (acc < 0) return d;
  }
  return pool[pool.length - 1]!;
};

export function eventX(e: CityEvent, width: number, t: number): number {
  if (e.speed === 0) return e.x0;
  const run = e.speed * (t - e.start);
  return e.dir > 0 ? -WORLD_MARGIN + run : width + WORLD_MARGIN - run;
}

const trackOf = (v: Vehicle): Track => (v.kind === 'bike' ? 'bike' : v.lane);
const ambientHalf = (v: Vehicle): number => VEHICLE_HALF[v.kind] * STREET_SCALE.vehicle * v.scale * (v.lane === 'far' ? FAR_SHRINK : 1);

// Même vitesse et même sens que la file : l'écart (sur la boucle du monde) avec chaque voiture est constant pendant tout
// le passage. Les voitures trop proches au départ s'effacent donc jusqu'à la fin, sans clignoter.
export function yieldsFor(e: CityEvent, half: number, vehicles: Vehicle[], width: number): string[] {
  const loop = travelSpan(width);
  const xe = eventX(e, width, e.start);
  return vehicles
    .filter((v) => trackOf(v) === e.track)
    .filter((v) => {
      const xv = loopX(v.phase, LANE_DIR[v.lane] * v.speed, width, e.start);
      const d = (((xv - xe) % loop) + loop) % loop;
      return Math.min(d, loop - d) < half + ambientHalf(v) + YIELD_MARGIN;
    })
    .map((v) => v.id);
}

export function cityEventSchedule(input: ScheduleInput): CityEvent[] {
  const { seed, width, hyper, cond, vehicles, speeds } = input;
  const t0 = hyper * HYPER_S;
  const out: CityEvent[] = [];
  for (let n = 0; n < HYPER_SLOTS; n++) {
    const rng = mulberry32(seed ^ hashString('city-events') ^ Math.imul(hyper * HYPER_SLOTS + n + 1, 2654435761));
    // Toujours le même nombre de tirages par créneau : un changement de condition ne décale pas les créneaux suivants.
    const chance = rng();
    const roll = rng();
    const lean = rng();
    const dirRoll = rng();
    const yRoll = rng();
    const pick = rng();
    const variant = rng();
    const offset = rng();
    if (chance >= EVENT_CHANCE) continue;
    const start = t0 + n * SLOT_S + offset * SLOT_S * 0.6;
    const minute = (((Math.floor(input.minutesAtHyperStart + (start - t0) / 60)) % 1440) + 1440) % 1440;
    const pool = EVENT_DEFS.filter((d) => eligible(d, minute, cond));
    if (pool.length === 0) continue;
    const def = pickWeighted(pool, roll, cond);
    const track = trackFor(def, lean);
    const dir: 1 | -1 = track === 'bike' ? 1 : track ? LANE_DIR[track] : dirRoll < 0.5 ? 1 : -1;
    const speed = def.layer === 'fixed' ? 0 : def.speed ?? (track === 'bike' ? speeds.bike : speeds[track as Lane]);
    const end = start + (def.layer === 'fixed' ? def.duration! : travelSpan(width) / speed);
    if (end > t0 + HYPER_S) continue;
    const overlapping = out.filter((e) => e.start < end && start < e.end);
    if (overlapping.length >= MAX_EVENTS) continue;
    if (overlapping.some((e) => e.id === def.id || (track !== null && e.track === track))) continue;
    const [ya, yb] = def.y ?? [0, 0];
    const ev: CityEvent = {
      key: `ev-${hyper}-${n}`,
      id: def.id,
      layer: def.layer,
      start,
      end,
      dir,
      track,
      speed,
      x0: 40 + pick * Math.max(0, width - 80),
      y: ya + yRoll * (yb - ya),
      pick,
      variant,
      yields: [],
    };
    if (track !== null && def.speed === undefined) ev.yields = yieldsFor(ev, def.half, vehicles, width);
    out.push(ev);
  }
  return out;
}

// Minute de la scène (0 à 1439) au début du grand créneau `hyper`. `minutes` est la minute entière (arrondie vers le bas)
// de la scène à l'instant `nowS` : `minutes - écoulé` tombe dans (début - 1, début], d'où l'arrondi au-dessus (avec une
// marge pour les erreurs d'arrondi). Le résultat ne dépend donc pas de la seconde du chargement : les grands créneaux sont
// alignés sur des multiples de 20 min de l'horloge, donc sur des minutes entières.
export function hyperStartMinute(minutes: number, nowS: number, hyper: number): number {
  const m = Math.ceil(minutes - (nowS - hyper * HYPER_S) / 60 - 1e-6);
  return ((m % 1440) + 1440) % 1440;
}

// Programme recalculé en cours de grand créneau (changement de condition ou d'heure) : les événements déjà partis
// (`start <= now`) de l'ancien programme finissent leur course, intacts ; du nouveau programme ne viennent que les
// événements qui partent après `now`, retenus dans l'ordre s'ils respectent encore le plafond simultané, et jamais deux
// fois le même événement ni deux véhicules sur la même file en même temps. Rien n'apparaît donc en pleine traversée.
export function mergeSchedules(previous: CityEvent[], next: CityEvent[], now: number): CityEvent[] {
  const out = previous.filter((e) => e.start <= now);
  for (const e of next) {
    if (e.start <= now) continue;
    const overlapping = out.filter((o) => o.start < e.end && e.start < o.end);
    if (overlapping.length >= MAX_EVENTS) continue;
    if (overlapping.some((o) => o.id === e.id || (e.track !== null && o.track === e.track))) continue;
    out.push(e);
  }
  return out;
}

export const activeEvents = (schedule: CityEvent[], t: number): CityEvent[] => schedule.filter((e) => e.start <= t && t < e.end);
