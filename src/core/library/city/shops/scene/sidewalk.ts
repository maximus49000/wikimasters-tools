import { WORLD_MARGIN, hashString } from '../../../scene-world';
import { TURN_S, YAW_BACK, facingYaw, turnYaw } from '../../../figure/gait';
import { endDoorOf } from '../../doors';
import { THRESHOLD_S, passageAt, type Passage } from '../../doorway';
import { WALK_PACE } from '../../metrics';
import { MAX_VISIT_FALLBACK_PX } from '../customers';
import type { ActorTrack } from './types';

// Trottoir des clients d'une partition (G4b) : la marche dans la rue et le passage de la porte, fonction pure de la piste
// (contrat de la rue de score.ts) et réutilisant passageAt comme les visites (customers.ts). Le client vient du côté −dir (bout
// du trajet : entrée d'immeuble ou bord du monde, endDoorOf comme visitsFor), atteint la porte à `arriveAt`, s'y tourne et
// attend ; s'il entre, il passe le seuil de dos (THRESHOLD_S) pour franchir la porte à `enter` (arrivée avancée au besoin pour
// que le seuil tienne) ; il ressort de face à `exit` et repart d'où il vient ; rebroussé, il se retourne à `exit` sans seuil ;
// passant, il dépasse la porte dans le sens `dir` jusqu'à l'autre bout. Temps en secondes du créneau. Un parti marche ensemble :
// même allure (tirée du parti), même arrivée (réglée sur la première entrée du parti, `partyEnter`), chaque membre GAP_S
// derrière le précédent (rang du membre dans l'id `<parti>:<rang>`).
export type SidewalkGeo = { doorX: number; width: number; doorXs: readonly number[] };
// Vue sur le trottoir : un Passage (rue, demi-tour, seuil) ou l'attente debout devant la porte.
export type SidewalkView = Omit<Passage, 'gait'> & { gait: Passage['gait'] | 'stand' };
type Leg = Parameters<typeof passageAt>[0];
type Piece =
  | { k: 'leg'; t0: number; t1: number; leg: Leg; base: number }
  | { k: 'turn'; t0: number; t1: number; x: number; from: number; to: number; walked: number }
  | { k: 'stand'; t0: number; t1: number; x: number; yaw: number; walked: number }
  | { k: 'door'; t0: number; t1: number; x: number; walked: number };
export type SidewalkPlan = { from: number; to: number; pieces: Piece[] };

// Allure d'un client dans la rue (px/s), tirée de son parti (sinon de son id) comme celle des visites (16 à 24 × WALK_PACE).
export const walkSpeed = (id: string): number => (16 + ((hashString(`walk|${id}`) % 1000) / 1000) * 8) * WALK_PACE;
// Écart entre deux membres d'un parti qui marchent l'un derrière l'autre (s).
export const GAP_S = 0.4;
const rankOf = (id: string): number => {
  const r = Number(id.slice(id.lastIndexOf(':') + 1));
  return Number.isFinite(r) ? r : 0;
};
const legLength = (l: Leg): number =>
  Math.abs(l.toX - l.fromX) / l.speed + (l.fromDoor ? THRESHOLD_S + TURN_S : 0) + (l.toDoor ? TURN_S + THRESHOLD_S : 0);
const edgeOf = (dir: 1 | -1, width: number): number => (dir > 0 ? -WORLD_MARGIN : width + WORLD_MARGIN);

// `partyEnter` : première entrée du parti (null s'il n'entre pas ; absent : celle de la piste).
export function sidewalkPlan(track: ActorTrack, geo: SidewalkGeo, partyEnter: number | null = track.enter): SidewalkPlan | null {
  if (track.role !== 'customer' || track.arriveAt === null || track.dir === null) return null;
  const { doorX, width, doorXs } = geo;
  const dir = track.dir;
  const speed = walkSpeed(track.party ?? track.id);
  const lag = rankOf(track.id) * GAP_S;
  const nearEnd = endDoorOf(doorX, (-dir) as 1 | -1, width, doorXs, MAX_VISIT_FALLBACK_PX);
  const near = nearEnd ?? edgeOf(dir, width);
  const go: Leg = { fromX: near, toX: doorX, dir, speed, fromDoor: nearEnd !== null, toDoor: false };
  const goLen = legLength(go);
  const dist = Math.abs(doorX - near);
  const face = facingYaw(dir);
  const pieces: Piece[] = [];
  const back = (t0: number, fromDoor: boolean): void => {
    const leg: Leg = { fromX: doorX, toX: near, dir: (-dir) as 1 | -1, speed, fromDoor, toDoor: nearEnd !== null };
    pieces.push({ k: 'leg', t0, t1: t0 + legLength(leg), leg, base: dist });
  };
  if (track.enter === null && track.exit === null) {
    // Passant : jusqu'à la porte, puis au-delà dans le même sens.
    const farEnd = endDoorOf(doorX, dir, width, doorXs, MAX_VISIT_FALLBACK_PX);
    const on: Leg = { fromX: doorX, toX: farEnd ?? edgeOf((-dir) as 1 | -1, width), dir, speed, fromDoor: false, toDoor: farEnd !== null };
    const pass = track.arriveAt + lag;
    pieces.push({ k: 'leg', t0: pass - goLen, t1: pass, leg: go, base: 0 });
    pieces.push({ k: 'leg', t0: pass, t1: pass + legLength(on), leg: on, base: dist });
  } else {
    const sill = track.enter !== null ? track.enter - THRESHOLD_S : track.exit!;
    // Arrivée du parti : avancée pour que le seuil de la première entrée tienne ; chaque membre GAP_S derrière.
    const first = Math.min(track.arriveAt, (partyEnter ?? Infinity) - THRESHOLD_S - TURN_S) + lag;
    const at = track.enter !== null ? Math.min(first, sill - TURN_S) : Math.min(track.arriveAt + lag, sill);
    const turned = Math.min(at + TURN_S, Math.max(at, sill));
    pieces.push({ k: 'leg', t0: at - goLen, t1: at, leg: go, base: 0 });
    pieces.push({ k: 'turn', t0: at, t1: turned, x: doorX, from: face, to: YAW_BACK, walked: dist });
    pieces.push({ k: 'stand', t0: turned, t1: sill, x: doorX, yaw: YAW_BACK, walked: dist });
    if (track.enter !== null) {
      pieces.push({ k: 'door', t0: sill, t1: track.enter, x: doorX, walked: dist });
      if (track.exit !== null) back(track.exit, true);
    } else {
      // Rebroussé : il se retourne devant la porte et repart (sans seuil).
      pieces.push({ k: 'turn', t0: sill, t1: sill + TURN_S, x: doorX, from: YAW_BACK, to: facingYaw((-dir) as 1 | -1), walked: dist });
      if (lag > 0) pieces.push({ k: 'stand', t0: sill + TURN_S, t1: sill + TURN_S + lag, x: doorX, yaw: facingYaw((-dir) as 1 | -1), walked: dist });
      back(sill + TURN_S + lag, false);
    }
  }
  return { from: pieces[0]!.t0, to: pieces[pieces.length - 1]!.t1, pieces };
}

// Où est le client à `t` (s du créneau) sur le trottoir ; null hors du plan (pas encore parti, déjà rentré, ou dans le local).
export function sidewalkAt(plan: SidewalkPlan, t: number): SidewalkView | null {
  if (t < plan.from || t >= plan.to) return null;
  for (const p of plan.pieces) {
    if (t >= p.t1 || t < p.t0) continue;
    const u = p.t1 > p.t0 ? (t - p.t0) / (p.t1 - p.t0) : 1;
    switch (p.k) {
      case 'leg': {
        const v = passageAt(p.leg, t - p.t0);
        return v ? { ...v, walked: v.walked + p.base } : null;
      }
      case 'turn':
        return { stage: 'turn', x: p.x, depth: 0, yaw: turnYaw(p.from, p.to, u), gait: 'step', walked: p.walked };
      case 'stand':
        return { stage: 'street', x: p.x, depth: 0, yaw: p.yaw, gait: 'stand', walked: p.walked };
      default:
        return { stage: 'threshold', x: p.x, depth: u, yaw: YAW_BACK, gait: 'walk', walked: p.walked };
    }
  }
  return null;
}
