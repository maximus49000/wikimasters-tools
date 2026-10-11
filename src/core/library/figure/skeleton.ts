import { add3, mul3, type V3 } from './geometry';

// Squelette du pantin (maquette validée du 2026-10-11) : 40 unités de haut, pieds à y = 0, tête centrée vers y = 33.
// Orientation `yaw` (radians) : 0 regarde vers la droite de l'écran, π/2 vers le spectateur, π vers la gauche, 3π/2 de dos.
// Allures : debout, petits pas sur place (demi-tour), marche, assis. La hauteur du bassin est fixée par la jambe d'appui :
// le rebond du buste vient tout seul et le pied d'appui touche toujours le sol.
export type Gait = 'stand' | 'step' | 'walk' | 'seated';
export const YAWS = 16;
export const PHASES = 12;
// Distance parcourue (unités du pantin) pendant un cycle complet de marche (deux pas) : règle la phase sur le déplacement.
export const STRIDE = 23;
const AMPLITUDE: Record<Gait, number> = { stand: 0, step: 0.35, walk: 1, seated: 0 };
export const LIMB = { thigh: 7.6, shin: 7.8, ankle: 1.0, upperArm: 6.3, foreArm: 5.6 } as const;

export type Frame3 = { F: V3; R: V3; U: V3 };
// F : devant, R : côté droit du corps, U : haut.
export const frameOf = (yaw: number): Frame3 => ({ F: [Math.cos(yaw), 0, Math.sin(yaw)], R: [-Math.sin(yaw), 0, Math.cos(yaw)], U: [0, 1, 0] });
export const at = (b: V3, fr: Frame3, f: number, u: number, l: number): V3 => add3(add3(add3(b, mul3(fr.F, f)), mul3(fr.U, u)), mul3(fr.R, l));

export type Leg = { hip: V3; knee: V3; ankle: V3; toe: V3; l: number };
export type Arm = { sh: V3; elb: V3; hand: V3; l: number };
export type Pose = { fr: Frame3; pelvis: V3; legs: [Leg, Leg]; arms: [Arm, Arm]; neck: V3; head: V3; headFrame: Frame3; lean: number; pelvisTurn: number; shoulderTurn: number };
// `headYaw` : rotation de la tête seule (radians) ; `umbrella` : bras droit levé qui tient un manche.
export type PoseOpts = { headYaw?: number; umbrella?: boolean };

const D = Math.PI / 180;

export function poseOf(yaw: number, phase: number, gait: Gait, opts: PoseOpts = {}): Pose {
  const fr = frameOf(yaw);
  const w = AMPLITUDE[gait];
  const seated = gait === 'seated';
  const legAngles = (ph: number): [number, number] => {
    const th = w * 24 * Math.sin(ph);
    const k = 4 + w * 55 * Math.max(0, Math.cos(ph + 0.35)) ** 2;
    return [th * D, k * D];
  };
  const A = seated ? ([90 * D, 90 * D] as [number, number]) : legAngles(phase);
  const B = seated ? ([90 * D, 90 * D] as [number, number]) : legAngles(phase + Math.PI);
  const reach = ([th, k]: [number, number]): number => LIMB.thigh * Math.cos(th) + LIMB.shin * Math.cos(th - k);
  const hipY = seated ? LIMB.shin + LIMB.ankle + 0.6 : Math.max(reach(A), reach(B)) + LIMB.ankle;
  const lean = (seated ? 2 : 3 * w) * D;
  const pelvisTurn = seated ? 0 : w * 6 * Math.sin(phase) * D;
  const shoulderTurn = seated ? 0 : -w * 7 * Math.sin(phase) * D;
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
