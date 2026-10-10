// Camionnette de l'équipe à pied (échelles, barrières, plancher de scène) : elle arrive en roulant depuis le bord du monde le
// plus proche, se gare, ouvre sa portière arrière ; les ouvriers en descendent juste avant leur premier créneau et y remontent
// après le dernier ; elle repart en marche avant jusqu'au bord opposé. Tout est une fonction de l'heure absolue (minutes),
// sans état : aucun humain ni véhicule n'apparaît ou ne disparaît sur place (spec §7.2).

// Durées (minutes) : `pause` entre l'arrêt et l'ouverture de la portière (et entre sa fermeture et le départ), `alight` pour
// descendre, `board` pour remonter. La portière s'ouvre une minute avant la descente et se ferme une minute après.
export const VAN_TIMING = { pause: 1, alight: 2, board: 2 } as const;
// Vitesse de la camionnette (px du monde par minute à l'échelle 1 : multiplier par `unit`).
export const VAN_SPEED = 120;

// `park` : centre une fois garée ; `dir` : sens de marche (celui de l'arrivée) ; `door` : portière arrière (x du monde) ;
// `first` / `last` : début du premier créneau et fin du dernier de l'équipe à pied ; `speed` : px du monde par minute ;
// `pull` : distance (px) sur laquelle elle quitte la file de circulation pour se ranger contre le trottoir (et l'inverse).
export type VanVisit = { park: number; dir: 1 | -1; edgeIn: number; edgeOut: number; door: number; first: number; last: number; speed: number; pull: number };
// `lane` : 0 = rangée contre le trottoir, 1 = dans la file de circulation (elle y roule, devant les barrières posées).
export type VanState = { x: number; dir: 1 | -1; phase: 'arrive' | 'parked' | 'leave'; door: boolean; lane: number };
export type VanCrew = { phase: 'inside' } | { phase: 'out' } | { phase: 'alight' | 'board'; q: number };

type VisitInput = { park: number; width: number; offstage: number; first: number; last: number; speed: number; door: number; pull?: number };

// `offstage` : distance au-delà du bord où la camionnette est entièrement hors champ ; `door` : distance du centre à la portière.
export function vanVisit({ park, width, offstage, first, last, speed, door, pull = 0 }: VisitInput): VanVisit {
  const edgeIn = park < width / 2 ? -offstage : width + offstage;
  const dir: 1 | -1 = edgeIn < park ? 1 : -1;
  const edgeOut = dir > 0 ? width + offstage : -offstage;
  return { park, dir, edgeIn, edgeOut, door: park - dir * door, first, last, speed, pull };
}

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

// Horaires de la visite : apparition (une minute à l'arrêt hors champ), arrivée à la place, départ, disparition (deux minutes
// hors champ après le départ : le rendu à la minute et sa transition n'ont jamais la camionnette dans le champ en l'ôtant).
export function vanSchedule(v: VanVisit): { appear: number; driveIn: number; parked: number; depart: number; driveOut: number; gone: number } {
  const driveIn = Math.abs(v.park - v.edgeIn) / v.speed;
  const driveOut = Math.abs(v.edgeOut - v.park) / v.speed;
  const parked = v.first - VAN_TIMING.alight - 1 - VAN_TIMING.pause;
  const depart = v.last + VAN_TIMING.board + 1 + VAN_TIMING.pause;
  return { appear: parked - driveIn - 1, driveIn, parked, depart, driveOut, gone: depart + driveOut + 2 };
}

export function vanAt(v: VanVisit, t: number): VanState | null {
  const s = vanSchedule(v);
  if (t < s.appear || t >= s.gone) return null;
  const door = (t >= v.first - VAN_TIMING.alight - 1 && t < v.first + 1) || (t >= v.last && t < v.last + VAN_TIMING.board + 1);
  const lane = (x: number): number => (v.pull > 0 ? Math.min(1, Math.abs(x - v.park) / v.pull) : 0);
  if (t < s.parked) {
    const p = s.driveIn > 0 ? Math.max(0, (t - (s.parked - s.driveIn)) / s.driveIn) : 1;
    const x = lerp(v.edgeIn, v.park, p);
    return { x, dir: v.dir, phase: 'arrive', door: false, lane: lane(x) };
  }
  if (t < s.depart) return { x: v.park, dir: v.dir, phase: 'parked', door, lane: 0 };
  const p = s.driveOut > 0 ? Math.min(1, (t - s.depart) / s.driveOut) : 1;
  const x = lerp(v.park, v.edgeOut, p);
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
