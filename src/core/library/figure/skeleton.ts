import { add3, mul3, type V3 } from './geometry';

// Squelette du pantin (maquette validée du 2026-10-11) : 40 unités de haut, pieds à y = 0, tête centrée vers y = 33.
// Orientation `yaw` (radians) : 0 regarde vers la droite de l'écran, π/2 vers le spectateur, π vers la gauche, 3π/2 de dos.
// Allures : debout, petits pas sur place (demi-tour), marche, assis, escalade (face à l'échelle). La hauteur du bassin est fixée par la jambe d'appui :
// le rebond du buste vient tout seul et le pied d'appui touche toujours le sol.
export type Gait = 'stand' | 'step' | 'walk' | 'seated' | 'climb';
export const YAWS = 16;
export const PHASES = 12;
// Distance parcourue (unités du pantin) pendant un cycle complet de marche (deux pas) : règle la phase sur le déplacement.
export const STRIDE = 23;
const AMPLITUDE: Record<Gait, number> = { stand: 0, step: 0.35, walk: 1, seated: 0, climb: 1 };
export const LIMB = { thigh: 7.6, shin: 7.8, ankle: 1.0, upperArm: 6.3, foreArm: 5.6 } as const;

export type Frame3 = { F: V3; R: V3; U: V3 };
// F : devant, R : côté droit du corps, U : haut.
export const frameOf = (yaw: number): Frame3 => ({ F: [Math.cos(yaw), 0, Math.sin(yaw)], R: [-Math.sin(yaw), 0, Math.cos(yaw)], U: [0, 1, 0] });
export const at = (b: V3, fr: Frame3, f: number, u: number, l: number): V3 => add3(add3(add3(b, mul3(fr.F, f)), mul3(fr.U, u)), mul3(fr.R, l));

export type Leg = { hip: V3; knee: V3; ankle: V3; toe: V3; l: number };
export type Arm = { sh: V3; elb: V3; hand: V3; l: number };
export type Pose = { fr: Frame3; pelvis: V3; legs: [Leg, Leg]; arms: [Arm, Arm]; neck: V3; head: V3; headFrame: Frame3; lean: number; pelvisTurn: number; shoulderTurn: number };
// `headYaw` : rotation de la tête seule (radians) ; `umbrella` : bras droit levé qui tient un manche ;
// `arms` : pose des bras (cinématique inverse, 'swing' = balancement de marche) ; `lean` : penché vers l'avant (0, 1, 2).
export type PoseOpts = { headYaw?: number; umbrella?: boolean; arms?: ArmPose; lean?: number };

export type ArmPose = 'swing' | 'down' | 'reach' | 'hold' | 'up' | 'work' | 'crossed' | 'raise' | 'cheer' | 'cup' | 'carry' | 'overhead' | 'tow' | 'guitar' | 'mic' | 'drum';
export const ARM_POSES: readonly ArmPose[] = ['swing', 'down', 'reach', 'hold', 'up', 'work', 'crossed', 'raise', 'cheer', 'cup', 'carry', 'overhead', 'tow', 'guitar', 'mic', 'drum'];
// Penché vers l'avant par niveau (gestes des commerces).
export const LEAN_DEG = 8;
type T3 = readonly [number, number, number];
const DOWN: T3 = [1, -11, 0.8];
// Cibles de main depuis l'épaule, dans le repère du torse (f devant, u haut, o vers l'extérieur ; o < 0 : vers l'intérieur).
// [bras gauche, bras droit] ; null = balancement de marche (swing). Le bras droit est celui des gestes.
const TARGETS: Readonly<Record<ArmPose, readonly [T3 | null, T3 | null]>> = {
  swing: [null, null],
  down: [DOWN, DOWN],
  reach: [DOWN, [9, -4, 0.5]],
  hold: [DOWN, [6.5, -6, -1]],
  up: [DOWN, [3, 9, 0.8]],
  work: [[7, -8.5, -1.5], [8, -8, -1.5]],
  crossed: [[3.6, -5.6, -6.2], [3.2, -5, -6.6]],
  raise: [DOWN, [1.5, 11.5, 1]],
  cheer: [[1.5, 11.5, 1.8], [1.5, 11.5, 1.8]],
  cup: [DOWN, [4.5, -4.5, -0.8]],
  carry: [[7, -9, -2], [7, -9, -2]],
  overhead: [[2.5, 10.5, -1.2], [2.5, 10.5, -1.2]],
  tow: [DOWN, [-5, -10, 0.8]],
  guitar: [[6, -4, -7], [4, -8, -2]],
  mic: [DOWN, [3, 4.5, -3.2]],
  drum: [[6, -7, -2.5], [6, -7, -2.5]],
};
// side : -1 bras gauche (l < 0), +1 bras droit.
export const armTarget = (pose: ArmPose, side: -1 | 1): T3 | null => TARGETS[pose][side < 0 ? 0 : 1];

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm3 = (a: V3): V3 => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
// Deux segments (épaule → coude → main) vers `target` ; le coude part vers `pole` (bas, extérieur, un peu en arrière).
function ik(sh: V3, target: V3, pole: V3): { elb: V3; hand: V3 } {
  const a = LIMB.upperArm;
  const b = LIMB.foreArm;
  const v = sub3(target, sh);
  const d = Math.min(a + b - 1e-6, Math.max(Math.abs(a - b) + 1e-6, Math.hypot(v[0], v[1], v[2])));
  const n = norm3(v);
  const pv = sub3(pole, sh);
  const perp = norm3(sub3(pv, mul3(n, dot3(pv, n))));
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const elb = add3(sh, add3(mul3(n, a * cosA), mul3(perp, a * sinA)));
  return { elb, hand: add3(sh, mul3(n, d)) };
}

const D = Math.PI / 180;

export function poseOf(yaw: number, phase: number, gait: Gait, opts: PoseOpts = {}): Pose {
  const fr = frameOf(yaw);
  const w = AMPLITUDE[gait];
  const seated = gait === 'seated';
  const climb = gait === 'climb';
  const armsPose = opts.arms ?? 'swing';
  const leanLevel = Math.max(0, Math.min(2, opts.lean ?? 0));
  const legAngles = (ph: number): [number, number] => {
    if (climb) {
      // Montée de barreau en barreau : la cuisse monte et le genou se plie ensemble, en alternance.
      const t = (30 + 30 * Math.sin(ph)) * D;
      return [t, t * 1.6];
    }
    const th = w * 24 * Math.sin(ph);
    const k = 4 + w * 55 * Math.max(0, Math.cos(ph + 0.35)) ** 2;
    return [th * D, k * D];
  };
  const A = seated ? ([90 * D, 90 * D] as [number, number]) : legAngles(phase);
  const B = seated ? ([90 * D, 90 * D] as [number, number]) : legAngles(phase + Math.PI);
  const reach = ([th, k]: [number, number]): number => LIMB.thigh * Math.cos(th) + LIMB.shin * Math.cos(th - k);
  // Escalade : le site place le pantin sur les barreaux, le bassin reste à la hauteur de jambe tendue.
  const hipY = seated ? LIMB.shin + LIMB.ankle + 0.6 : climb ? LIMB.thigh + LIMB.shin + LIMB.ankle : Math.max(reach(A), reach(B)) + LIMB.ankle;
  const lean = ((seated ? 2 : climb ? 4 : 3 * w) + leanLevel * LEAN_DEG) * D;
  const pelvisTurn = seated || climb ? 0 : w * 6 * Math.sin(phase) * D;
  const shoulderTurn = seated || climb ? 0 : -w * 7 * Math.sin(phase) * D;
  const pelvis: V3 = [0, hipY, 0];
  const off = (rot: number, l: number): V3 => add3(mul3(fr.R, l * Math.cos(rot)), mul3(fr.F, -l * Math.sin(rot)));
  const legs = ([[A, -2.1], [B, 2.1]] as const).map(([[th, k], l]) => {
    const hip = add3(pelvis, off(pelvisTurn, l));
    const knee = at(hip, fr, LIMB.thigh * Math.sin(th), -LIMB.thigh * Math.cos(th), l * 0.05);
    const sa = th - k;
    const ankle = at(knee, fr, LIMB.shin * Math.sin(sa), -LIMB.shin * Math.cos(sa), 0);
    const a = seated ? 0 : sa * 0.6;
    const toe = at(ankle, fr, 3.0 * Math.cos(a), 3.0 * Math.sin(a) - 0.6, 0);
    return { hip, knee, ankle, toe, l };
  }) as [Leg, Leg];
  const shY = 10.6;
  const arms = ([-4.2, 4.2] as const).map((l) => {
    const sh = at(add3(pelvis, off(shoulderTurn, l)), fr, shY * Math.sin(lean), shY * Math.cos(lean), 0);
    const side = l < 0 ? -1 : 1;
    const target: T3 | null = climb && armsPose === 'swing' ? [2, 6 + 2 * Math.sin(phase) * side, 0.5] : opts.umbrella && l > 0 ? null : armTarget(armsPose, side);
    if (target) {
      // Repère du torse (penché) : la main vise une cible depuis l'épaule, le coude part vers le bas / l'extérieur / l'arrière.
      const tF = add3(mul3(fr.F, Math.cos(lean)), mul3(fr.U, -Math.sin(lean)));
      const tU = add3(mul3(fr.U, Math.cos(lean)), mul3(fr.F, Math.sin(lean)));
      const goal = add3(sh, add3(add3(mul3(tF, target[0]), mul3(tU, target[1])), mul3(fr.R, side * target[2])));
      const pole = sub3(add3(sh, mul3(fr.R, side * 3)), add3(mul3(tU, 6), mul3(tF, 1.5)));
      return { sh, ...ik(sh, goal, pole), l };
    }
    let al: number;
    let e: number;
    if (opts.umbrella && l > 0) {
      al = 120 * D;
      e = 45 * D;
    } else if (seated) {
      al = 22 * D * (l < 0 ? 1 : 0.7);
      e = 70 * D;
    } else {
      al = (l < 0 ? -1 : 1) * w * 20 * Math.sin(phase) * D;
      e = (10 + w * 12 * Math.max(0, Math.sin((al / D / 20) * (Math.PI / 2)))) * D + w * 6 * D;
    }
    const elb = at(sh, fr, LIMB.upperArm * Math.sin(al), -LIMB.upperArm * Math.cos(al), Math.sign(l) * 0.5);
    const fa = al + e;
    const hand = at(elb, fr, LIMB.foreArm * Math.sin(fa), -LIMB.foreArm * Math.cos(fa), Math.sign(l) * 0.4);
    return { sh, elb, hand, l };
  }) as [Arm, Arm];
  const neck = at(pelvis, fr, 12.2 * Math.sin(lean), 12.2 * Math.cos(lean), 0);
  const head = at(pelvis, fr, 16.5 * Math.sin(lean) + 0.4, 16.5 * Math.cos(lean), 0);
  return { fr, pelvis, legs, arms, neck, head, headFrame: frameOf(yaw + (opts.headYaw ?? 0)), lean, pelvisTurn, shoulderTurn };
}
