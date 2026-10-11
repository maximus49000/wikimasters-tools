import { TURN_S, YAW_BACK, YAW_FRONT, facingYaw, phaseIndexOf, turnYaw } from '../../figure/gait';
import type { ArmPose, Gait } from '../../figure/skeleton';
import { THRESHOLD_S, entranceOpening, type Passage } from '../doorway';
import { DOOR_WIDTH, WALK_PACE, type CityMetrics } from '../metrics';
import { routeFrom } from './queue';
import type { Rect } from './slots';

// Trajets scriptés de la boîte de nuit hors de la file ordinaire (pur) : à la fermeture, la file se défait à pied (demi-tour,
// marche jusqu'au bord du monde ou dans l'entrée d'immeuble la plus proche, comme les arrivées à l'envers) et les videurs
// rentrent l'un après l'autre par la porte du club une fois le cordon dégagé ; à leur arrivée (22 h 30), ils en sortent.
// Segments enchaînés depuis `start` (s, session) ; après le dernier : caché (entré, sorti du monde), ou tenu (`hold`).
export type ClubSeg =
  | { k: 'door'; rect: Rect; x: number; from: number; to: number; yaw: number; dur: number }
  | { k: 'turn'; x: number; y: number; from: number; to: number; via?: number; dur: number }
  | { k: 'walk'; from: number; to: number; y0: number; y1: number; dur: number }
  | { k: 'stand'; x: number; y: number; yaw: number; arms: ArmPose; dur: number };
// `k` : px du monde par unité du pantin (phase des pas réglée sur la distance).
export type ClubWalk = { id: string; outfitKey: string; start: number; k: number; segs: ClubSeg[]; hold?: boolean };
export type ClubPose = { yaw: number; gait: Gait; phase: number; head: number; arms?: ArmPose };
export type ClubWalkView = { where: 'street'; x: number; y: number; pose: ClubPose } | { where: 'door'; rect: Rect; passage: Passage; pose: ClubPose } | null;

function segView(s: ClubSeg, p: number, walked: number, k: number): ClubWalkView {
  switch (s.k) {
    case 'door': {
      const depth = s.from + (s.to - s.from) * p;
      return { where: 'door', rect: s.rect, passage: { stage: 'threshold', x: s.x, depth, yaw: s.yaw, gait: 'walk', walked }, pose: { yaw: s.yaw, gait: 'walk', phase: phaseIndexOf(walked / k + depth * 8), head: 0 } };
    }
    case 'turn':
      return { where: 'street', x: s.x, y: s.y, pose: { yaw: turnYaw(s.from, s.to, p, s.via), gait: 'step', phase: phaseIndexOf(walked / k), head: 0 } };
    case 'walk': {
      const d = (s.to - s.from) * p;
      return { where: 'street', x: s.from + d, y: s.y0 + (s.y1 - s.y0) * p, pose: { yaw: facingYaw(s.to >= s.from ? 1 : -1), gait: 'walk', phase: phaseIndexOf((walked + Math.abs(d)) / k), head: 0 } };
    }
    default:
      return { where: 'street', x: s.x, y: s.y, pose: { yaw: s.yaw, gait: 'stand', phase: 0, head: 0, arms: s.arms } };
  }
}
export function clubWalkAt(w: ClubWalk, t: number): ClubWalkView {
  let c = Math.max(0, t - w.start);
  let walked = 0;
  for (const s of w.segs) {
    if (c < s.dur) return segView(s, s.dur > 0 ? c / s.dur : 1, walked, w.k);
    c -= s.dur;
    if (s.k === 'walk') walked += Math.abs(s.to - s.from);
  }
  const last = w.segs[w.segs.length - 1];
  return w.hold && last ? segView(last, 1, walked - (last.k === 'walk' ? Math.abs(last.to - last.from) : 0), w.k) : null;
}
export const clubWalkEnd = (w: ClubWalk): number => w.start + w.segs.reduce((n, s) => n + s.dur, 0);

// Contexte des trajets : largeur du monde, centres des entrées d'immeubles, ligne de la file et repères de la rue.
export type ClubCtx = { width: number; doorXs: readonly number[]; metrics: CityMetrics; k: number; lineY: number };

// Une personne de la file (ou en route vers elle) qui s'en va : demi-tour sur place (vers le côté de la file, `away`), marche
// jusqu'au bord du monde ou jusqu'à l'entrée d'immeuble la plus proche (routeFrom, comme les arrivées) et seuil de dos. Une
// arrivée qui sortait d'une entrée (`atDoor`, profondeur) y rentre ; `end` impose le bout (l'arrivée repart d'où elle venait).
export type Leaver = { id: string; outfitKey: string; x: number; y: number; yaw: number; speed: number; away: 1 | -1; atDoor?: number | null; end?: { x: number; door: boolean } };
export function walkOffOf(a: Leaver, start: number, c: ClubCtx): ClubWalk {
  const rectAt = (x: number): Rect => entranceOpening(x - DOOR_WIDTH / 2, c.metrics);
  if (a.atDoor !== undefined && a.atDoor !== null) {
    const segs: ClubSeg[] = [];
    if (a.atDoor <= 0) segs.push({ k: 'turn', x: a.x, y: c.metrics.doorY, from: a.yaw, to: YAW_BACK, dur: TURN_S });
    const d = Math.max(0, a.atDoor);
    segs.push({ k: 'door', rect: rectAt(a.x), x: a.x, from: d, to: 1, yaw: YAW_BACK, dur: (1 - d) * THRESHOLD_S });
    return { id: a.id, outfitKey: a.outfitKey, start, k: c.k, segs };
  }
  const route = a.end ?? routeFrom(a.x, a.away, c.width, c.doorXs);
  const face = facingYaw(a.away);
  const toY = route.door ? c.metrics.doorY : c.lineY;
  const segs: ClubSeg[] = [
    { k: 'turn', x: a.x, y: a.y, from: a.yaw, to: face, via: YAW_FRONT, dur: a.yaw === face ? 0 : TURN_S },
    { k: 'walk', from: a.x, to: route.x, y0: a.y, y1: toY, dur: Math.abs(route.x - a.x) / a.speed },
  ];
  if (route.door) {
    segs.push({ k: 'turn', x: route.x, y: toY, from: face, to: YAW_BACK, dur: TURN_S });
    segs.push({ k: 'door', rect: rectAt(route.x), x: route.x, from: 0, to: 1, yaw: YAW_BACK, dur: THRESHOLD_S });
  }
  return { id: a.id, outfitKey: a.outfitKey, start, k: c.k, segs };
}

// Videurs : à leur poste `x` (pieds sur `y`), tournés `yaw` ; porte du club au centre `doorX`, ouverture `rect`.
export type BouncerPost = { i: number; x: number; y: number; yaw: number; doorX: number; doorY: number; rect: Rect; k: number };
export const BOUNCER_SPEED = 20 * WALK_PACE;
const bouncerId = (i: number): string => `bouncer-${i}`;
// Rentrée : bras croisés à son poste jusqu'à `go`, marche jusqu'à la porte, demi-tour, seuil de dos.
export function bouncerLeaveOf(b: BouncerPost, since: number, go: number): ClubWalk {
  const dir: 1 | -1 = b.doorX >= b.x ? 1 : -1;
  const face = facingYaw(dir);
  return {
    id: bouncerId(b.i),
    outfitKey: '',
    start: since,
    k: b.k,
    segs: [
      { k: 'stand', x: b.x, y: b.y, yaw: b.yaw, arms: 'crossed', dur: Math.max(0, go - since) },
      { k: 'turn', x: b.x, y: b.y, from: b.yaw, to: face, dur: TURN_S },
      { k: 'walk', from: b.x, to: b.doorX, y0: b.y, y1: b.doorY, dur: Math.abs(b.doorX - b.x) / BOUNCER_SPEED },
      { k: 'turn', x: b.doorX, y: b.doorY, from: face, to: YAW_BACK, dur: TURN_S },
      { k: 'door', rect: b.rect, x: b.doorX, from: 0, to: 1, yaw: YAW_BACK, dur: THRESHOLD_S },
    ],
  };
}
// Arrivée : seuil de face (sortie de la porte du club) à partir de `go`, demi-tour vers son poste, marche, se tourne vers la rue
// (`yaw`), bras croisés, et y reste. Avant `go`, dans l'ombre de l'entrée (profondeur 1 : invisible).
export function bouncerArriveOf(b: BouncerPost, go: number): ClubWalk {
  const dir: 1 | -1 = b.x >= b.doorX ? 1 : -1;
  const face = facingYaw(dir);
  return {
    id: bouncerId(b.i),
    outfitKey: '',
    start: go,
    k: b.k,
    hold: true,
    segs: [
      { k: 'door', rect: b.rect, x: b.doorX, from: 1, to: 0, yaw: YAW_FRONT, dur: THRESHOLD_S },
      { k: 'turn', x: b.doorX, y: b.doorY, from: YAW_FRONT, to: face, dur: TURN_S },
      { k: 'walk', from: b.doorX, to: b.x, y0: b.doorY, y1: b.y, dur: Math.abs(b.x - b.doorX) / BOUNCER_SPEED },
      { k: 'turn', x: b.x, y: b.y, from: face, to: b.yaw, dur: TURN_S },
      { k: 'stand', x: b.x, y: b.y, yaw: b.yaw, arms: 'crossed', dur: 0 },
    ],
  };
}
// Durée de la sortie d'un videur jusqu'à son poste (le second sort quand le premier a passé le seuil).
export const BOUNCER_STAGGER_S = THRESHOLD_S + TURN_S;

// Instant où toutes les personnes ont dégagé le cordon : chacune a passé `cordonX` dans le sens `away` (ou est entrée quelque
// part avant : fin de son trajet). Les trajets qui partent déjà au-delà comptent dès leur départ.
export function clearAt(walks: readonly ClubWalk[], cordonX: number, away: 1 | -1, from: number): number {
  let out = from;
  for (const w of walks) {
    let t = w.start;
    let at: number | null = null;
    for (const s of w.segs) {
      if (s.k === 'walk' && at === null) {
        const a = s.from * away;
        const b = s.to * away;
        const c = cordonX * away;
        if (a >= c) at = t;
        else if (b >= c) at = t + ((c - a) / (b - a)) * s.dur;
      }
      if (s.k === 'turn' && at === null && s.x * away >= cordonX * away) at = t;
      t += s.dur;
    }
    out = Math.max(out, at ?? t);
  }
  return out;
}
