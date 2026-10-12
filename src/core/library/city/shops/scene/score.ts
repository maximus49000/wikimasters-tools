import type { ArmPose, Gait } from '../../../figure/skeleton';
import { phaseIndexOf, turnYaw } from '../../../figure/gait';
import type { Outfit } from '../../people';
import { INSIDE_SCALE } from '../customers';
import { MOVES, keyAtTime, type MoveId, type PictoId, type PropId } from './moves';
import type { ActorId, ActorTrack, Score, Segment, SlotKey } from './types';

// Lecture des partitions (G4b) : ce que fait chaque acteur à un instant du créneau, pour le rendu. Les poses (bras, penché,
// tête, allure) se déduisent du geste du segment par keyAtTime ; x s'interpole, l'orientation tourne par le plus court
// chemin sur l'anneau des 16 crans. Cache LRU des partitions : une partition se calcule une fois par créneau affiché.

// `where` : 'inside' dans le local ; client : 'street-in' avant d'avoir passé la porte (ou devant la porte s'il rebrousse
// chemin), 'street-out' après l'avoir repassée (sa marche dans la rue est calculée par le rendu avec `passageAt`) ; un client
// qui n'entre ni ne s'arrête (entrée et sortie nulles) reste 'street-in' : le rendu le fait passer. Employé : 'none' hors de
// ses segments (arrière-boutique avant sa prise de poste, après son départ, renfort en réserve). `worn` : la monture
// essayée est portée sur le visage (convention de signatures.ts). `picto.age` : secondes depuis l'instant où il prend.
export type ActorView = {
  id: ActorId; role: 'staff' | 'customer'; where: 'inside' | 'street-in' | 'street-out' | 'none';
  x: number; yaw: number; gait: Gait; phase: number; arms: ArmPose; lean: number; headYaw: number;
  prop: PropId | null; worn: boolean; picto: { id: PictoId; age: number } | null;
  party: string | null; outfit: Outfit; scale: number; enterAt: number | null; exitAt: number | null;
};

// Durée de vie d'un picto à l'écran (s), la même que la règle de rareté du moteur.
const PICTO_LIFE = 1;
const EPS = 1e-9;

// Dernier segment commencé à `t` (dichotomie sur t0) ; -1 avant le premier.
function segmentIndex(segs: readonly Segment[], t: number): number {
  let lo = 0;
  let hi = segs.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid]!.t0 <= t + EPS) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

// Distance déjà marchée dans les segments de marche contigus qui précèdent : une marche coupée en deux ne bégaie pas.
function walkedBefore(segs: readonly Segment[], i: number): number {
  let d = 0;
  for (let j = i - 1; j >= 0; j--) {
    const s = segs[j]!;
    if (s.move !== 'walk' || Math.abs(s.t1 - segs[j + 1]!.t0) > 1e-6) break;
    d += Math.abs(s.x1 - s.x0);
  }
  return d;
}

// La monture est-elle déjà sur le nez avant ce segment : un `try-frames` plus tôt, sans prise ni pose depuis.
function framesOnBefore(segs: readonly Segment[], i: number): boolean {
  for (let j = i - 1; j >= 0; j--) {
    const s = segs[j]!;
    if (s.prop !== 'frames') return false;
    if (s.move === 'try-frames') return true;
    if (s.move === 'put-down' || s.move === 'take-item' || s.move === 'hand-over' || s.move === 'offer-frames' || s.move === 'fetch') return false;
  }
  return false;
}

// Monture portée : en dehors de la fenêtre d'objet du geste joué (en main dedans), une fois essayée, jusqu'à sa pose.
function worn(segs: readonly Segment[], i: number, u: number): boolean {
  const s = segs[i]!;
  if (s.prop !== 'frames') return false;
  const m = s.move in MOVES ? MOVES[s.move as MoveId] : null;
  const win = m?.prop;
  if (win && u >= win.from && u <= win.to) return false;
  // L'essayage la pose aux tempes à la fin de sa fenêtre ; après la fenêtre d'un autre geste qui finit avant lui, elle est
  // remise ou posée : plus sur le visage.
  if (s.move === 'try-frames') return win !== undefined && u > win.to;
  if (win && u > win.to && win.to < 1) return false;
  return framesOnBefore(segs, i);
}

function viewOf(track: ActorTrack, t: number): ActorView {
  const segs = track.segments;
  const base = { id: track.id, role: track.role, party: track.party, outfit: track.outfit, scale: track.scale, enterAt: track.enter, exitAt: track.exit };
  const still = { gait: 'stand' as Gait, phase: 0, arms: 'down' as ArmPose, lean: 0, headYaw: 0, prop: null, worn: false, picto: null };
  let where: ActorView['where'];
  if (track.role === 'staff') {
    const first = segs[0];
    const last = segs[segs.length - 1];
    const out = !first || t < first.t0 - EPS || t > last!.t1 + EPS || (track.enter !== null && t < track.enter - EPS) || (track.exit !== null && t > track.exit + EPS);
    where = out ? 'none' : 'inside';
  } else if (track.exit !== null && t >= track.exit - EPS) where = 'street-out';
  else if (track.enter === null || t < track.enter - EPS) where = 'street-in';
  else where = 'inside';
  if (segs.length === 0) return { ...base, where, x: 0, yaw: 0, ...still };
  // Hors du local : position et orientation au seuil (début de la première marche ou fin de la dernière).
  if (where !== 'inside') {
    const last = segs[segs.length - 1]!;
    const after = where === 'street-out' || t > last.t1;
    return { ...base, where, x: after ? last.x1 : segs[0]!.x0, yaw: after ? last.yaw1 : segs[0]!.yaw0, ...still };
  }
  const i = Math.max(0, segmentIndex(segs, t));
  const s = segs[i]!;
  const span = s.t1 - s.t0;
  const el = Math.min(Math.max(0, t - s.t0), span);
  const u = span > 0 ? el / span : 1;
  const x = s.x0 + (s.x1 - s.x0) * u;
  const yaw = turnYaw(s.yaw0, s.yaw1, u);
  let gait: Gait;
  let arms: ArmPose = 'down';
  let lean = 0;
  let headYaw = 0;
  let phase = 0;
  const m = s.move === 'walk' || s.move === 'turn' || s.move === 'idle' ? null : MOVES[s.move];
  if (s.move === 'walk') {
    gait = 'walk';
    arms = 'swing';
    phase = phaseIndexOf((walkedBefore(segs, i) + Math.abs(x - s.x0)) / (INSIDE_SCALE * track.scale));
  } else if (s.move === 'turn') gait = 'step';
  else if (!m) gait = 'stand';
  else {
    const k = keyAtTime(m, el, span);
    gait = k.gait ?? 'stand';
    arms = k.arms;
    lean = k.lean;
    headYaw = k.headYaw;
  }
  if (s.seated && gait !== 'crouch') gait = 'seated';
  // Picto : prend à sa fraction du geste (celle de la règle de rareté du moteur), visible PICTO_LIFE secondes.
  let picto: ActorView['picto'] = null;
  if (s.picto) {
    const age = t - (s.t0 + (m?.picto?.at ?? 0) * span);
    if (age >= -EPS && age < PICTO_LIFE) picto = { id: s.picto, age: Math.max(0, age) };
  }
  return { ...base, where, x, yaw, gait, phase, arms, lean, headYaw, prop: s.prop, worn: worn(segs, i, u), picto };
}

// Vue de tous les acteurs de la partition à `tInSlot` secondes depuis le début du créneau, dans l'ordre des pistes.
export function actorsAt(score: Score, tInSlot: number): ActorView[] {
  return score.tracks.map((track) => viewOf(track, tInSlot));
}

// Clé de cache d'une partition : tout ce dont dépend le metteur en scène pour un créneau.
export const scoreKey = (k: SlotKey): string => `${k.seed}|${k.slotId}|${k.type}|${k.day}|${k.index}`;

// Cache LRU : la dernière partition lue passe en tête ; au-delà de `max`, la plus anciennement lue est oubliée.
export class ScoreCache {
  private readonly map = new Map<string, Score>();
  private readonly max: number;
  constructor(max = 64) {
    this.max = max;
  }
  get(key: string, make: () => Score): Score {
    const hit = this.map.get(key);
    if (hit) {
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const score = make();
    this.map.set(key, score);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
    return score;
  }
  size(): number {
    return this.map.size;
  }
}
