// Camionnette de l'équipe à pied (échelles, barrières, plancher de scène) : elle arrive en roulant depuis le bord du monde le
// plus proche, se gare, ouvre sa portière arrière ; les ouvriers en descendent juste avant leur premier créneau et y remontent
// après le dernier ; elle repart en marche avant jusqu'au bord opposé. Tout est une fonction de l'heure absolue (minutes),
// sans état : aucun humain ni véhicule n'apparaît ou ne disparaît sur place (spec §7.2).

// Durées (minutes) : `pause` entre l'arrêt et l'ouverture de la portière (et entre sa fermeture et le départ), `alight` pour
// descendre, `board` pour remonter. La portière s'ouvre une minute avant la descente et se ferme une minute après.
export const VAN_TIMING = { pause: 1, alight: 2, board: 2 } as const;
// Vitesse de la camionnette (px du monde par SECONDE à l'échelle 1 : multiplier par `unit`), celle d'un véhicule qui avance
// prudemment dans la rue (bogue du 2026-10-24 : à 120 px par minute, elle roulait au pas).
export const VAN_SPEED = 25;
// Véhicules de transport des décors (spec §7.2) et leur vitesse : le vélo porteur roule moins vite que la camionnette, le
// camion plateau, chargé, un peu moins vite aussi. Même machinerie (arrivée, place, départ) pour les trois.
export type VehicleKind = 'van' | 'cargo-bike' | 'truck';
export const TRANSPORT_SPEED: Readonly<Record<VehicleKind, number>> = { van: VAN_SPEED, 'cargo-bike': 12, truck: 22 };

// ---------- Trajet à vitesse de croisière ----------
// Mise en vitesse au départ et freinage à l'arrivée (s), à accélération constante : rien ne démarre ni ne s'arrête d'un coup.
export const DRIVE_EASE_S = 1.5;
// Trajet de `dist` px parti à la minute absolue `t0`, en `dur` s : vitesse de croisière `v` (px/s), mise en vitesse et freinage
// en `ease` s chacun.
export type Drive = { t0: number; dist: number; dur: number; v: number; ease: number };
// `maxS` : durée au plus (s) ; un trajet plus long est joué un peu plus vite pour y tenir.
export function driveOf(dist: number, speed: number, t0: number, maxS = Infinity): Drive {
  if (dist <= 0 || speed <= 0) return { t0, dist: Math.max(0, dist), dur: 0, v: speed, ease: 0 };
  const ease = Math.min(DRIVE_EASE_S, dist / speed);
  const dur = dist / speed + ease;
  if (dur <= maxS) return { t0, dist, dur, v: speed, ease };
  const max = Math.max(1, maxS);
  const e = Math.min(DRIVE_EASE_S, max / 2);
  return { t0, dist, dur: max, v: dist / (max - e), ease: e };
}
// Distance parcourue (px) à la minute absolue `t`.
export function driveS(d: Drive, t: number): number {
  const s = (t - d.t0) * 60;
  if (s <= 0) return 0;
  if (s >= d.dur || d.ease <= 0) return d.dist;
  if (s < d.ease) return (d.v * s * s) / (2 * d.ease);
  if (s < d.dur - d.ease) return (d.v * d.ease) / 2 + d.v * (s - d.ease);
  return d.dist - (d.v * (d.dur - s) ** 2) / (2 * d.ease);
}
// Fin du trajet (minute absolue).
export const driveEnd = (d: Drive): number => d.t0 + d.dur / 60;

// `park` : centre une fois garée ; `dir` : sens de marche (celui de l'arrivée) ; `door` : portière arrière (x du monde) ;
// `first` / `last` : début du premier créneau et fin du dernier de l'équipe à pied ; `speed` : px du monde par seconde ;
// `pull` : distance (px) sur laquelle elle quitte la file de circulation pour se ranger contre le trottoir (et l'inverse).
// `hold` : fenêtre pendant laquelle le véhicule doit rester garé même sans équipe à pied dehors (camion plateau : on y prend
// des pièces pour le camion élévateur après le dernier créneau à pied, ou on les y range avant le premier) ; null sinon.
export type VanVisit = { park: number; dir: 1 | -1; edgeIn: number; edgeOut: number; door: number; first: number; last: number; speed: number; pull: number; hold: { from: number; to: number } | null };
// `lane` : 0 = rangée contre le trottoir, 1 = dans la file de circulation (elle y roule, devant les barrières posées).
export type VanState = { x: number; dir: 1 | -1; phase: 'arrive' | 'parked' | 'leave'; door: boolean; lane: number };
export type VanCrew = { phase: 'inside' } | { phase: 'out' } | { phase: 'alight' | 'board'; q: number };

type VisitInput = { park: number; width: number; offstage: number; first: number; last: number; speed: number; door: number; pull?: number; hold?: { from: number; to: number } | null };

// `offstage` : distance au-delà du bord où la camionnette est entièrement hors champ ; `door` : distance du centre à la portière.
export function vanVisit({ park, width, offstage, first, last, speed, door, pull = 0, hold = null }: VisitInput): VanVisit {
  const edgeIn = park < width / 2 ? -offstage : width + offstage;
  const dir: 1 | -1 = edgeIn < park ? 1 : -1;
  const edgeOut = dir > 0 ? width + offstage : -offstage;
  return { park, dir, edgeIn, edgeOut, door: park - dir * door, first, last, speed, pull, hold };
}

// Horaires de la visite : apparition (une minute à l'arrêt hors champ), arrivée à la place, départ, disparition (deux minutes
// hors champ après le départ : le rendu à la minute et sa transition n'ont jamais la camionnette dans le champ en l'ôtant).
// `driveIn` / `driveOut` : durées (minutes) des trajets, à vitesse de croisière.
export function vanSchedule(v: VanVisit): { appear: number; driveIn: number; parked: number; depart: number; driveOut: number; gone: number } {
  const driveIn = driveOf(Math.abs(v.park - v.edgeIn), v.speed, 0).dur / 60;
  const driveOut = driveOf(Math.abs(v.edgeOut - v.park), v.speed, 0).dur / 60;
  const parked = Math.min(v.first - VAN_TIMING.alight - 1 - VAN_TIMING.pause, v.hold ? v.hold.from - VAN_TIMING.pause : Infinity);
  const depart = Math.max(v.last + VAN_TIMING.board + 1 + VAN_TIMING.pause, v.hold ? v.hold.to + VAN_TIMING.pause : -Infinity);
  return { appear: parked - driveIn - 1, driveIn, parked, depart, driveOut, gone: depart + driveOut + 2 };
}

// Les deux trajets de la visite (arrivée, départ) : le calque les joue par une animation CSS à leur vraie durée.
export function vanDrives(v: VanVisit): { arrive: Drive; leave: Drive } {
  const s = vanSchedule(v);
  return {
    arrive: driveOf(Math.abs(v.park - v.edgeIn), v.speed, s.parked - s.driveIn),
    leave: driveOf(Math.abs(v.edgeOut - v.park), v.speed, s.depart),
  };
}

export function vanAt(v: VanVisit, t: number): VanState | null {
  const s = vanSchedule(v);
  if (t < s.appear || t >= s.gone) return null;
  const door = (t >= v.first - VAN_TIMING.alight - 1 && t < v.first + 1) || (t >= v.last && t < v.last + VAN_TIMING.board + 1);
  const lane = (x: number): number => (v.pull > 0 ? Math.min(1, Math.abs(x - v.park) / v.pull) : 0);
  const d = vanDrives(v);
  if (t < s.parked) {
    const x = v.edgeIn + v.dir * driveS(d.arrive, t);
    return { x, dir: v.dir, phase: 'arrive', door: false, lane: lane(x) };
  }
  if (t < s.depart) return { x: v.park, dir: v.dir, phase: 'parked', door, lane: 0 };
  const x = v.park + v.dir * driveS(d.leave, t);
  return { x, dir: v.dir, phase: 'leave', door: false, lane: lane(x) };
}

// Ouvriers de l'équipe à pied autour de la camionnette : dans la cabine, en train de descendre (`q` de 0 à 1 : du centre de
// la camionnette à la portière), dehors (créneaux), en train de remonter (de la portière au centre).
export function vanCrewAt(v: VanVisit, t: number): VanCrew {
  if (t >= v.first - VAN_TIMING.alight && t < v.first) return { phase: 'alight', q: (t - (v.first - VAN_TIMING.alight)) / VAN_TIMING.alight };
  if (t >= v.first && t < v.last) return { phase: 'out' };
  if (t >= v.last && t < v.last + VAN_TIMING.board) return { phase: 'board', q: (t - v.last) / VAN_TIMING.board };
  return { phase: 'inside' };
}
