import { WORLD_MARGIN, hashString, mulberry32 } from '../scene-world';
import { absMinute, itemPhase, type BeerStand, type DecorSet } from './install';
import { WALK_PACE, cityMetrics } from './metrics';
import { outfitFor, type Outfit } from './people';
import { TURN_S, YAW_BACK, YAW_FRONT, facingYaw, turnYaw, yawToward } from '../figure/gait';
import { pathDir, walkAt, walkDuration, type PathPt, type WalkEnds } from './walk-path';

// Stands de bière de la Fête de la musique (moteur pur, sans état ni Math.random) : service de 17 h à 1 h, file d'attente,
// clients qui arrivent et repartent à pied (bout de la rue, hors champ, ou seuil d'une porte d'immeuble : jamais de fondu),
// deux serveurs par stand. Pantins (walk-path.ts) : en file, tourné vers le comptoir ; au comptoir, de dos face au serveur ;
// serveurs de face derrière le comptoir ; demi-tour sur place au bout de chaque trajet. Les instants (`arrive`, `start`, …) sont des minutes
// ABSOLUES (absMinute : dayNumber × 1440 + minute, flottantes, continues à travers minuit) ; les vitesses sont en px/s.
// Repère : `x` en px du monde ; `depth` en unités (hauteur de la scène / 340) SOUS le bord du trottoir, sur la chaussée
// (y = curb + depth × unit) ; une profondeur négative est sur le trottoir (seuil des entrées d'immeuble).

// Heures de service, en minutes du jour de la fête (1500 = 1 h le lendemain).
export const SERVE_HOURS = { from: 1020, to: 1500 } as const;
// Plus aucune arrivée dans la file à moins de LAST_ORDER minutes de la fermeture : la file a le temps de se vider.
export const LAST_ORDER = 5;
// File maximale (personnes qui attendent, hors clients au comptoir) : au-delà, les arrivées sont retardées.
export const MAX_QUEUE = 8;
// Vitesse maximale (px/s à l'échelle 1, multiplier par `unit`) de tout déplacement calculé ici : marche, avancée d'un cran,
// pas vers le comptoir.
export const BEER_MAX_SPEED = 26;

// Géométrie (unités). Comptoir : son devant à STAND_DEPTH ; les serveurs derrière, les clients servis devant.
export const STAND_DEPTH = 18;
export const SERVER_DEPTH = 14;
export const SERVE_DEPTH = 23;
export const QUEUE_DEPTH = 24;
export const COUNTER_HALF = 26; // demi-largeur du comptoir
export const SERVE_DX = 9; // place des deux serveurs (et des deux clients servis) de part et d'autre du centre
// Rang fictif d'où part la phase des pas : `walked` croît quand la file avance (r diminue), jamais de pas à reculons.
const QUEUE_FAR = 200;
export const QUEUE_STEP = 7; // écart entre deux personnes de la file
const QUEUE_GAP = 8; // tête de file : à QUEUE_GAP du bout du comptoir
const CUSTOMER_LANE = 34; // couloir de marche des clients, devant la file
const SERVER_LANE = 10; // couloir de marche des serveurs, derrière le comptoir
const REF = cityMetrics(340);
export const DOOR_DEPTH = -(REF.curb - REF.doorY) / REF.unit; // seuil des entrées d'immeuble

const ADVANCE_S = 1.5; // avancée d'un cran dans la file
const SERVE_WALK_S = 4; // de la tête de file au comptoir
const SERVICE_S: readonly [number, number] = [11, 17]; // un serveur sert un client en ~14 s
const GAP_S: readonly [number, number] = [8, 14]; // une arrivée toutes les 8 à 14 s…
const PEAK = { from: 1140, rise: 1200, fall: 1350, to: 1380, factor: 0.5 } as const; // … deux fois plus souvent de 19 h à 23 h
const NEAR_DOOR = 160; // une entrée est « proche » à moins de NEAR_DOOR unités du stand

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const S = 1 / 60; // une seconde, en minutes

// ---------- Ouverture ----------
// Le stand sert-il ? De 17 h à 1 h, et seulement quand son comptoir ET son auvent sont posés.
export function servingOpen(set: DecorSet, standId: string, abs: number): boolean {
  if (abs < absMinute(set.day, SERVE_HOURS.from) || abs >= absMinute(set.day, SERVE_HOURS.to)) return false;
  const parts = set.items.filter((i) => i.group === standId);
  if (!parts.some((i) => i.kind === 'stand-counter') || !parts.some((i) => i.kind === 'stand-awning')) return false;
  return parts.every((i) => itemPhase(set, i, abs, set.day).phase === 'present');
}

// ---------- Trajets ----------
type Ends = { from: PathPt; fromDoor: boolean; to: PathPt; toDoor: boolean; speed: number };
function endsOf(rng: () => number, x: number, width: number, unit: number, doors: readonly number[], lane: number, doorShare: number): Ends {
  const near = doors.filter((d) => Math.abs(d - x) < NEAR_DOOR * unit);
  const end = (): { pt: PathPt; door: boolean } => {
    if (near.length > 0 && rng() < doorShare) return { pt: { x: near[Math.floor(rng() * near.length)]!, d: DOOR_DEPTH }, door: true };
    const nearer = x < width / 2 ? -WORLD_MARGIN : width + WORLD_MARGIN;
    const other = x < width / 2 ? width + WORLD_MARGIN : -WORLD_MARGIN;
    return { pt: { x: rng() < 0.7 ? nearer : other, d: lane }, door: false };
  };
  const a = end();
  const b = end();
  return { from: a.pt, fromDoor: a.door, to: b.pt, toDoor: b.door, speed: (18 + rng() * 8) * WALK_PACE * unit };
}
const via = (from: PathPt, to: PathPt, lane: number): PathPt[] => [from, { x: from.x, d: lane }, { x: to.x, d: lane }, to];

// ---------- Clients ----------
// `walkIn` : départ à pied ; `arrive` : prend sa place dans la file ; `start` : début du service (il va au comptoir) ;
// `end` : a sa bière ; `leave` : a fini de repartir (hors champ ou à la porte). `join` : place (en crans, continue) où il
// rejoint la file. `server` : serveur qui le sert (0 à gauche, 1 à droite du centre du comptoir).
export type BeerCustomer = {
  id: string; n: number; walkIn: number; arrive: number; start: number; end: number; leave: number; server: 0 | 1; join: number;
  pathIn: PathPt[]; pathOut: PathPt[]; fromDoor: boolean; toDoor: boolean; speed: number; outfit: Outfit;
};
// `maxIn` / `maxOut` : plus longue marche d'arrivée (arrive − walkIn) et plus long séjour (leave − arrive), en minutes.
export type BeerSchedule = { stand: BeerStand; day: number; unit: number; customers: BeerCustomer[]; maxIn: number; maxOut: number };
export type BeerInput = { seed: number; stand: BeerStand; day: number; width: number; unit?: number; doors?: readonly number[] };

const headX = (st: BeerStand, unit: number): number => st.x + st.side * (COUNTER_HALF + QUEUE_GAP) * unit;
const slotPt = (st: BeerStand, unit: number, r: number): PathPt => ({ x: headX(st, unit) + st.side * r * QUEUE_STEP * unit, d: QUEUE_DEPTH });
const spotOf = (st: BeerStand, unit: number, server: 0 | 1, depth: number): PathPt => ({ x: st.x + (server === 0 ? -1 : 1) * SERVE_DX * unit, d: depth });

// Clients d'une soirée (17 h à 1 h) pour un stand : arrivées tirées (plus serrées de 19 h à 23 h), deux serveurs, file servie
// dans l'ordre d'arrivée. Une arrivée qui trouverait déjà MAX_QUEUE personnes en attente est repoussée au moment où la file
// raccourcit : la file ne dépasse jamais MAX_QUEUE.
export function beerSchedule({ seed, stand, day, width, unit = 1, doors = [] }: BeerInput): BeerSchedule {
  const rng = mulberry32(seed ^ hashString(`beer:${stand.id}`));
  const open = absMinute(day, SERVE_HOURS.from);
  const close = absMinute(day, SERVE_HOURS.to);
  const day0 = absMinute(day, 0);
  const gap = (t: number): number => {
    const m = t - day0;
    const peak = smoothstep(PEAK.from, PEAK.rise, m) * (1 - smoothstep(PEAK.fall, PEAK.to, m));
    return (GAP_S[0] + rng() * (GAP_S[1] - GAP_S[0])) * (1 - (1 - PEAK.factor) * peak) * S;
  };
  const base: { arrive: number; start: number; end: number; server: 0 | 1 }[] = [];
  const free: [number, number] = [open, open];
  let head = 0; // premier client dont le service n'a pas commencé à l'instant t
  let t = open + gap(open);
  while (t < close - LAST_ORDER) {
    while (head < base.length && base[head]!.start <= t) head++;
    const waiting = base.length - head;
    if (waiting >= MAX_QUEUE) {
      t = base[head + waiting - MAX_QUEUE]!.start;
      continue;
    }
    const server: 0 | 1 = free[0] <= free[1] ? 0 : 1;
    const start = Math.max(t, free[server]);
    const end = start + (SERVICE_S[0] + rng() * (SERVICE_S[1] - SERVICE_S[0])) * S;
    free[server] = end;
    base.push({ arrive: t, start, end, server });
    t += gap(t);
  }
  const customers: BeerCustomer[] = [];
  let maxIn = 0;
  let maxOut = 0;
  base.forEach((b, n) => {
    const r = mulberry32(seed ^ hashString(`beer:${stand.id}:${n}`));
    const ends = endsOf(r, stand.x, width, unit, doors, CUSTOMER_LANE, 0.6);
    const join = rankAt(base, n, b.arrive);
    const pathIn = via(ends.from, slotPt(stand, unit, join), CUSTOMER_LANE);
    const pathOut = via(spotOf(stand, unit, b.server, SERVE_DEPTH), ends.to, CUSTOMER_LANE);
    const walkIn = b.arrive - walkDuration(pathIn, unit, ends.speed, inEnds(stand, ends.fromDoor)) * S;
    const leave = b.end + walkDuration(pathOut, unit, ends.speed, outEnds(ends.toDoor)) * S;
    maxIn = Math.max(maxIn, b.arrive - walkIn);
    maxOut = Math.max(maxOut, leave - b.arrive);
    customers.push({
      id: `${stand.id}-c${n}`, n, walkIn, arrive: b.arrive, start: b.start, end: b.end, leave, server: b.server, join,
      pathIn, pathOut, fromDoor: ends.fromDoor, toDoor: ends.toDoor, speed: ends.speed, outfit: outfitFor('ordinary', r),
    });
  });
  return { stand, day, unit, customers, maxIn, maxOut };
}

// Bouts des trajets d'un client : il finit tourné vers le comptoir (la file est du côté `side`) et repart du comptoir, de dos.
const queueYaw = (st: BeerStand): number => facingYaw(st.side > 0 ? -1 : 1);
const inEnds = (st: BeerStand, fromDoor: boolean): WalkEnds => ({ fromDoor, endYaw: queueYaw(st) });
const outEnds = (toDoor: boolean): WalkEnds => ({ startYaw: YAW_BACK, toDoor });

// Place continue (en crans) du client n dans la file à l'instant t : un cran par client arrivé avant lui et pas encore au
// comptoir ; quand ce client part au comptoir, le cran s'efface en ADVANCE_S (la file avance d'un pas, sans saut).
function rankAt(list: readonly { start: number }[], n: number, t: number): number {
  let r = 0;
  for (let j = n - 1; j >= 0; j--) {
    const s = list[j]!.start;
    if (s + ADVANCE_S * S <= t) break; // départs dans l'ordre : les précédents sont tous partis
    r += clamp01((s + ADVANCE_S * S - t) / (ADVANCE_S * S));
  }
  return r;
}

export type QueueMode = 'walking-in' | 'waiting' | 'being-served' | 'leaving' | 'absent';
export type Gait = 'walk' | 'step' | 'stand';
// `rank` : rang dans la file (0 = en tête) pour 'waiting', sinon null ; `drinking` : repart avec sa bière ; `yaw`, `gait`,
// `walked` (px, phase des pas) : pantin ; `sill` (0 à 1) : seulement pendant le seuil d'une porte (door-passage.ts).
export type BeerPersonState = { id: string; mode: QueueMode; x: number; depth: number; dir: 1 | -1; rank: number | null; drinking: boolean; yaw: number; gait: Gait; walked: number; sill?: number };
const sillOf = (sill: number | undefined): { sill?: number } => (sill !== undefined ? { sill } : {});

export function customerAt(sched: BeerSchedule, c: BeerCustomer, abs: number): BeerPersonState {
  const { stand, unit } = sched;
  const base = { id: c.id, rank: null, drinking: false };
  const toward = (x: number): 1 | -1 => (stand.x - x < 0 ? -1 : 1);
  if (abs < c.walkIn) return { ...base, mode: 'absent', x: c.pathIn[0]!.x, depth: c.pathIn[0]!.d, dir: pathDir(c.pathIn, 0, unit), yaw: YAW_FRONT, gait: 'stand', walked: 0 };
  if (abs < c.arrive) {
    const w = walkAt(c.pathIn, unit, c.speed, inEnds(stand, c.fromDoor), (abs - c.walkIn) * 60);
    return { ...base, mode: 'walking-in', x: w.x, depth: w.d, dir: pathDir(c.pathIn, w.walked, unit), yaw: w.yaw, gait: w.gait, walked: w.walked, ...sillOf(w.sill) };
  }
  if (abs < c.start) {
    const r = rankAt(sched.customers, c.n, abs);
    const p = slotPt(stand, unit, r);
    let ahead = 0;
    for (let j = c.n - 1; j >= 0 && sched.customers[j]!.start > abs; j--) ahead++;
    // La file avance d'un cran : quelques pas, la phase suit le déplacement le long de la file.
    const moving = Math.abs(r - Math.round(r)) > 1e-6;
    return { ...base, mode: 'waiting', x: p.x, depth: p.d, dir: toward(p.x), rank: ahead, yaw: facingYaw(toward(p.x)), gait: moving ? 'walk' : 'stand', walked: (QUEUE_FAR - r) * QUEUE_STEP * unit };
  }
  if (abs < c.end) {
    // De la tête de file au comptoir (pas réglés sur la distance), demi-tour sur place, puis de dos face au serveur.
    const a = slotPt(stand, unit, rankAt(sched.customers, c.n, c.start));
    const b = spotOf(stand, unit, c.server, SERVE_DEPTH);
    const el = (abs - c.start) * 60;
    const k = smoothstep(0, 1, el / SERVE_WALK_S);
    const x = lerp(a.x, b.x, k);
    const dist = Math.hypot(b.x - a.x, (b.d - a.d) * unit);
    const go = dist > 0 ? yawToward(b.x - a.x, (b.d - a.d) * unit) : YAW_BACK;
    const st = { ...base, mode: 'being-served' as const, x, depth: lerp(a.d, b.d, k), dir: toward(x), walked: k * dist };
    if (el < SERVE_WALK_S) return { ...st, yaw: go, gait: 'walk' };
    if (el < SERVE_WALK_S + TURN_S && go !== YAW_BACK) return { ...st, yaw: turnYaw(go, YAW_BACK, (el - SERVE_WALK_S) / TURN_S), gait: 'step' };
    return { ...st, yaw: YAW_BACK, gait: 'stand' };
  }
  if (abs < c.leave) {
    const w = walkAt(c.pathOut, unit, c.speed, outEnds(c.toDoor), (abs - c.end) * 60);
    return { ...base, drinking: true, mode: 'leaving', x: w.x, depth: w.d, dir: pathDir(c.pathOut, w.walked, unit), yaw: w.yaw, gait: w.gait, walked: w.walked, ...sillOf(w.sill) };
  }
  const last = c.pathOut[c.pathOut.length - 1]!;
  return { ...base, drinking: true, mode: 'absent', x: last.x, depth: last.d, dir: 1, yaw: YAW_BACK, gait: 'stand', walked: 0 };
}

// Clients visibles à l'instant `abs` (en marche, en file, au comptoir, repartant) : recherche par dichotomie sur `arrive`.
export function queueAt(sched: BeerSchedule, abs: number): BeerPersonState[] {
  const list = sched.customers;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.arrive < abs - sched.maxOut) lo = mid + 1;
    else hi = mid;
  }
  const out: BeerPersonState[] = [];
  for (let i = lo; i < list.length && list[i]!.arrive <= abs + sched.maxIn; i++) {
    const st = customerAt(sched, list[i]!, abs);
    if (st.mode !== 'absent') out.push(st);
  }
  return out;
}

// ---------- Serveurs ----------
// Deux par stand, derrière le comptoir. Ils arrivent à pied (bout de la rue ou entrée d'immeuble proche) et sont en place
// 3 à 15 min avant l'ouverture ; à la fermeture, tirage : ils repartent à pied dans les 10 minutes, ou restent derrière le
// comptoir jusqu'à l'arrivée de l'équipe de nuit (2 h 30, début de la dépose des stands) et repartent alors. `slot` : place
// derrière le comptoir (0 à gauche, 1 à droite), celle des clients qu'il sert (BeerCustomer.server).
export type BeerServer = {
  id: string; standId: string; slot: 0 | 1; spot: PathPt; pathIn: PathPt[]; pathOut: PathPt[]; fromDoor: boolean; toDoor: boolean; speed: number; unit: number;
  walkIn: number; arrive: number; depart: number; gone: number; stays: boolean; dir: 1 | -1; outfit: Outfit; day: number;
};
export const NIGHT_CREW = 150; // 2 h 30 le lendemain (minutes du jour), début de la dépose des stands (install.ts)

export function beerServers({ seed, stand, day, width, unit = 1, doors = [] }: BeerInput): BeerServer[] {
  return ([0, 1] as const).map((k) => {
    const rng = mulberry32(seed ^ hashString(`beer-server:${stand.id}:${k}`));
    const spot = spotOf(stand, unit, k, SERVER_DEPTH);
    const ends = endsOf(rng, stand.x, width, unit, doors, SERVER_LANE, 0.5);
    const pathIn = via(ends.from, spot, SERVER_LANE);
    const pathOut = via(spot, ends.to, SERVER_LANE);
    const arrive = absMinute(day, SERVE_HOURS.from) - (3 + rng() * 12);
    const stays = rng() < 0.5;
    const depart = stays ? absMinute(day + 1, NIGHT_CREW) : absMinute(day, SERVE_HOURS.to) + rng() * 10;
    return {
      id: `${stand.id}-server-${k}`, standId: stand.id, slot: k, spot, pathIn, pathOut, fromDoor: ends.fromDoor, toDoor: ends.toDoor, speed: ends.speed, unit,
      walkIn: arrive - walkDuration(pathIn, unit, ends.speed, { fromDoor: ends.fromDoor, endYaw: YAW_FRONT }) * S, arrive, depart,
      gone: depart + walkDuration(pathOut, unit, ends.speed, { startYaw: YAW_FRONT, toDoor: ends.toDoor }) * S,
      stays, dir: stand.side === 1 ? -1 : 1, outfit: outfitFor('ordinary', rng), day,
    };
  });
}

export type ServerMode = 'absent' | 'walking' | 'serving' | 'idle';
// Pantin : de face derrière le comptoir (`yaw`, `gait`, `walked` en marche) ; `sill` : seulement au seuil d'une porte.
export type ServerState = { x: number; depth: number; dir: 1 | -1; mode: ServerMode; yaw: number; gait: Gait; walked: number; sill?: number };

// `serving` pendant les heures de service, `idle` derrière le comptoir avant l'ouverture et après la fermeture.
export function serverAt(v: BeerServer, abs: number): ServerState {
  const walking = (path: PathPt[], ends: WalkEnds, c: number): ServerState => {
    const w = walkAt(path, v.unit, v.speed, ends, c);
    return { x: w.x, depth: w.d, dir: pathDir(path, w.walked, v.unit), mode: 'walking', yaw: w.yaw, gait: w.gait, walked: w.walked, ...sillOf(w.sill) };
  };
  if (abs < v.walkIn) return { x: v.pathIn[0]!.x, depth: v.pathIn[0]!.d, dir: 1, mode: 'absent', yaw: YAW_FRONT, gait: 'stand', walked: 0 };
  if (abs < v.arrive) return walking(v.pathIn, { fromDoor: v.fromDoor, endYaw: YAW_FRONT }, (abs - v.walkIn) * 60);
  if (abs < v.depart) {
    const serving = abs >= absMinute(v.day, SERVE_HOURS.from) && abs < absMinute(v.day, SERVE_HOURS.to);
    return { x: v.spot.x, depth: v.spot.d, dir: v.dir, mode: serving ? 'serving' : 'idle', yaw: YAW_FRONT, gait: 'stand', walked: 0 };
  }
  if (abs < v.gone) return walking(v.pathOut, { startYaw: YAW_FRONT, toDoor: v.toDoor }, (abs - v.depart) * 60);
  const last = v.pathOut[v.pathOut.length - 1]!;
  return { x: last.x, depth: last.d, dir: 1, mode: 'absent', yaw: YAW_FRONT, gait: 'stand', walked: 0 };
}
