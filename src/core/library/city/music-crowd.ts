import { WORLD_MARGIN, hashString, mulberry32 } from '../scene-world';
import { COUNTER_HALF, DOOR_DEPTH, MAX_QUEUE, QUEUE_DEPTH, QUEUE_STEP, SERVE_DEPTH, SERVER_DEPTH, STAND_DEPTH } from './beer';
import { absMinute, type BeerStand } from './install';
import { WALK_PACE } from './metrics';
import { outfitFor, type Outfit } from './people';
import { pathAt, pathDir, pathLength, type PathPt } from './walk-path';

// Foule de la Fête de la musique (moteur pur, sans état ni Math.random), sur la rue privatisée : spectateurs massés en
// demi-cercles devant chaque scène (ils dansent pendant que les musiciens jouent, 17 h à minuit), petits groupes qui boivent
// autour des stands de bière, fond de foule clairsemé ailleurs. Chacun arrive à pied entre 17 h et 20 h (bord de la rue ou
// entrée d'immeuble proche, comme la foule du défilé) et repart à pied entre 23 h 30 et 1 h. Instants en minutes ABSOLUES
// (absMinute, continues à travers minuit) ; repère de beer.ts : `x` en px, `depth` en unités SOUS le bord du trottoir.

export const MUSIC_CROWD_TIMES = { arriveFrom: 1020, arriveTo: 1200, leaveFrom: 1410, leaveTo: 1500 } as const; // minutes du 21/6
export const BAND_HOURS = { from: 1020, to: 1440 } as const; // on danse pendant que les musiciens jouent
// Demi-cercles devant une scène : rang r de demi-largeur (STAGE_ZONE + r × 10) unités, un spectateur toutes les CROWD_STEP
// unités ; profondeur au centre 9, 16, 23, 30 (rangs), plus faible sur les bords (l'arc revient vers le trottoir).
export const STAGE_ZONE = 80;
export const CROWD_STEP = 8;
export const CROWD_ROWS = 4;
const BACK_STEP = 22; // fond de foule : un spectateur toutes les 22 unités en moyenne
const CROWD_LANE = 50; // couloir de marche, à l'avant de la chaussée
const NEAR_DOOR = 170; // unités
const DOOR_FADE_S = 0.8;
const S = 1 / 60;

export type MusicZone = 'stage' | 'stand' | 'back';
export type MusicSpectator = {
  id: string; zone: MusicZone; stage: number | null; x: number; depth: number; dir: 1 | -1; dance: boolean; beer: boolean; phase: number; outfit: Outfit;
  pathIn: PathPt[]; pathOut: PathPt[]; fromDoor: boolean; toDoor: boolean; speed: number; unit: number; day: number;
  walkIn: number; arrive: number; leave: number; gone: number;
};
export type MusicCrowdInput = { seed: number; width: number; day: number; stages: readonly number[]; stands: readonly BeerStand[]; doors?: readonly number[]; unit?: number };

const via = (from: PathPt, to: PathPt): PathPt[] => [from, { x: from.x, d: CROWD_LANE }, { x: to.x, d: CROWD_LANE }, to];

export function musicCrowdFor({ seed, width, day, stages, stands, doors = [], unit = 1 }: MusicCrowdInput): MusicSpectator[] {
  const rng = mulberry32(seed ^ hashString('music-crowd'));
  const out: MusicSpectator[] = [];
  const u = unit;
  // Ni sur un stand (serveurs, comptoir, clients servis), ni dans sa file d'attente ; devant ou derrière, c'est permis.
  const blocked = (x: number, d: number): boolean => standBlocks(stands, u, x, d);
  // Trajet et horaires : `key` fixe le tirage (un groupe partage le sien : il arrive et repart ensemble).
  const trip = (key: string, x: number, depth: number): Pick<MusicSpectator, 'pathIn' | 'pathOut' | 'fromDoor' | 'toDoor' | 'speed' | 'walkIn' | 'arrive' | 'leave' | 'gone'> => {
    const r = mulberry32(seed ^ hashString(`music-crowd-trip:${key}`));
    const near = doors.filter((d) => Math.abs(d - x) < NEAR_DOOR * u);
    const end = (): { pt: PathPt; door: boolean } => {
      if (near.length > 0 && r() < 0.5) return { pt: { x: near[Math.floor(r() * near.length)]!, d: DOOR_DEPTH }, door: true };
      return { pt: { x: r() < 0.5 ? -WORLD_MARGIN : width + WORLD_MARGIN, d: CROWD_LANE }, door: false };
    };
    const a = end();
    const b = end();
    const speed = (18 + r() * 8) * WALK_PACE * u;
    const place = { x, d: depth };
    const pathIn = via(a.pt, place);
    const pathOut = via(place, b.pt);
    const { arriveFrom, arriveTo, leaveFrom, leaveTo } = MUSIC_CROWD_TIMES;
    const walkIn = absMinute(day, arriveFrom + (arriveTo - arriveFrom) * r());
    const leave = absMinute(day, leaveFrom + (leaveTo - leaveFrom) * r());
    return {
      pathIn, pathOut, fromDoor: a.door, toDoor: b.door, speed, walkIn,
      arrive: walkIn + pathLength(pathIn, u) / speed * S, leave, gone: leave + pathLength(pathOut, u) / speed * S,
    };
  };
  const push = (id: string, zone: MusicZone, stage: number | null, x: number, depth: number, dir: 1 | -1, dance: boolean, beer: boolean, t: ReturnType<typeof trip>): void => {
    out.push({ id, zone, stage, x, depth, dir, dance, beer, phase: rng(), outfit: outfitFor('ordinary', rng), unit: u, day, ...t });
  };

  // Devant les scènes : demi-cercles denses.
  stages.forEach((xs, k) => {
    for (let r = 0; r < CROWD_ROWS; r++) {
      const hw = (STAGE_ZONE + r * 10) * u;
      const n = Math.round((2 * hw) / (CROWD_STEP * u));
      for (let j = 0; j < n; j++) {
        const x = xs - hw + (j + 0.5) * ((2 * hw) / n) + (rng() - 0.5) * 3 * u;
        const arc = Math.sqrt(Math.max(0, 1 - ((x - xs) / (hw + 12 * u)) ** 2));
        const depth = 3 + (6 + 7 * r) * arc + (rng() - 0.5) * 2;
        const dance = rng() < 0.8;
        const beer = rng() < 0.2;
        if (blocked(x, depth) || x < 0 || x > width) continue;
        const id = `music-${k}-${r}-${j}`;
        push(id, 'stage', k, x, depth, x < xs ? 1 : -1, dance, beer, trip(id, x, depth));
      }
    }
  });
  // Petits groupes autour des stands, du côté opposé à la file : deux groupes de 2 ou 3, un verre à la main.
  for (const st of stands) {
    for (let g = 0; g < 2; g++) {
      const cx = st.x - st.side * (COUNTER_HALF + 14 + g * 26) * u;
      const depth = STAND_DEPTH + 12 + g * 5;
      const size = rng() < 0.5 ? 2 : 3;
      const key = `${st.id}-g${g}`;
      const t = trip(key, cx, depth);
      for (let m = 0; m < size; m++) {
        const x = cx + (m - (size - 1) / 2) * 6 * u;
        // Même trajet que le groupe, place propre : on garde les horaires et les extrémités, on refait les chemins.
        const pathIn = via(t.pathIn[0]!, { x, d: depth + (rng() - 0.5) });
        const pathOut = via(pathIn[pathIn.length - 1]!, t.pathOut[t.pathOut.length - 1]!);
        const arrive = t.walkIn + pathLength(pathIn, u) / t.speed * S;
        const gone = t.leave + pathLength(pathOut, u) / t.speed * S;
        const place = pathIn[pathIn.length - 1]!;
        push(`music-${key}-${m}`, 'stand', null, place.x, place.d, x < cx ? 1 : -1, false, true, { ...t, pathIn, pathOut, arrive, gone });
      }
    }
  }
  // Fond de foule, ailleurs sur la chaussée.
  const near = (x: number): boolean => stages.some((xs) => Math.abs(x - xs) < (STAGE_ZONE + CROWD_ROWS * 10) * u);
  let n = 0;
  for (let x = 30 + rng() * BACK_STEP * u; x < width - 30; x += (BACK_STEP - 8 + rng() * 16) * u, n++) {
    const depth = 6 + rng() * 36;
    const dance = rng() < 0.25;
    const beer = rng() < 0.3;
    const dir: 1 | -1 = rng() < 0.5 ? 1 : -1;
    if (near(x) || blocked(x, depth)) continue;
    const id = `music-back-${n}`;
    push(id, 'back', null, x, depth, dir, dance, beer, trip(id, x, depth));
  }
  return out;
}

// Emprise d'un stand (unités) : comptoir et ses abords, de SERVER_DEPTH − 8 à SERVE_DEPTH + 5 en profondeur ; file d'attente
// (MAX_QUEUE personnes et une marge) autour de QUEUE_DEPTH, du côté `side`.
export function standBlocks(stands: readonly BeerStand[], unit: number, x: number, depth: number): boolean {
  const queueLen = (COUNTER_HALF + 8 + QUEUE_STEP * MAX_QUEUE + 10) * unit;
  return stands.some((st) => {
    const dx = x - st.x;
    if (Math.abs(dx) < (COUNTER_HALF + 8) * unit && depth > SERVER_DEPTH - 8 && depth < SERVE_DEPTH + 5) return true;
    return dx * st.side >= 0 && dx * st.side < queueLen && Math.abs(depth - QUEUE_DEPTH) < 5;
  });
}

export type MusicCrowdMode = 'absent' | 'walking' | 'standing';
// `dance` : en place pendant que les musiciens jouent ; `fade` (0 à 1) : seulement à l'encadrement d'une porte.
export type MusicCrowdPos = { x: number; depth: number; dir: 1 | -1; mode: MusicCrowdMode; dance: boolean; fade?: number };

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function musicCrowdAt(s: MusicSpectator, abs: number): MusicCrowdPos {
  const base = { dance: false };
  if (abs < s.walkIn) return { ...base, x: s.pathIn[0]!.x, depth: s.pathIn[0]!.d, dir: 1, mode: 'absent', ...(s.fromDoor ? { fade: 0 } : {}) };
  if (abs < s.arrive) {
    const el = (abs - s.walkIn) * 60;
    const p = pathAt(s.pathIn, el * s.speed, s.unit);
    return { ...base, x: p.x, depth: p.d, dir: pathDir(s.pathIn, el * s.speed, s.unit), mode: 'walking', ...(s.fromDoor ? { fade: smoothstep(0, DOOR_FADE_S, el) } : {}) };
  }
  if (abs < s.leave) {
    const dance = s.dance && abs >= absMinute(s.day, BAND_HOURS.from) && abs < absMinute(s.day, BAND_HOURS.to);
    return { x: s.x, depth: s.depth, dir: s.dir, mode: 'standing', dance };
  }
  if (abs < s.gone) {
    const el = (abs - s.leave) * 60;
    const total = (s.gone - s.leave) * 60;
    const p = pathAt(s.pathOut, el * s.speed, s.unit);
    return { ...base, x: p.x, depth: p.d, dir: pathDir(s.pathOut, el * s.speed, s.unit), mode: 'walking', ...(s.toDoor ? { fade: smoothstep(0, DOOR_FADE_S, total - el) } : {}) };
  }
  const last = s.pathOut[s.pathOut.length - 1]!;
  return { ...base, x: last.x, depth: last.d, dir: 1, mode: 'absent', ...(s.toDoor ? { fade: 0 } : {}) };
}
