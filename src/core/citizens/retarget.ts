// Habitants 3D : le pantin 2D (squelette de `figure/skeleton.ts`) pilote les os Mixamo du corps 3D, pour garder TOUTES
// ses allures et tous ses gestes (commerces compris). Les deux repères concordent sans miroir : pantin x droite de
// l'écran, y haut, z vers le spectateur ; rig devant = +z, gauche du corps = +x, pieds à y = 0. Un pantin à yaw = π/2
// (face au spectateur) a son côté droit vers −x, exactement comme le rig au repos ; le côté du membre se lit sur `l`
// (l < 0 : gauche).
// Méthode, de la racine vers les extrémités : chaque os reçoit une rotation « monde » W = Δ · W_repos, où Δ fait tourner
// son segment de repos (articulation → articulation enfant) sur la direction du segment du pantin et cale l'axe
// secondaire (plan de flexion du genou ou du coude, travers du bassin, du buste, devant de la tête) ; la rotation locale
// est W_parent⁻¹ · W. Seules les directions sont copiées : le modèle garde ses longueurs. Doigts et orteils intacts.
// Rien n'est alloué par appel (vecteurs de travail du module) : la fonction tourne pour beaucoup d'habitants par image.
import * as THREE from 'three';
import { LIMB, type Pose } from '../library/figure/skeleton';
import type { V3 } from '../library/figure/geometry';
import { boneName } from './wardrobe/body';

// Os pilotés et leur parent attendu (hiérarchie Mixamo standard).
const PARENTS = {
  Hips: null, Spine: 'Hips', Spine1: 'Spine', Spine2: 'Spine1', Neck: 'Spine2', Head: 'Neck',
  LeftShoulder: 'Spine2', LeftArm: 'LeftShoulder', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm',
  RightShoulder: 'Spine2', RightArm: 'RightShoulder', RightForeArm: 'RightArm', RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips', LeftLeg: 'LeftUpLeg', LeftFoot: 'LeftLeg', LeftToeBase: 'LeftFoot',
  RightUpLeg: 'Hips', RightLeg: 'RightUpLeg', RightFoot: 'RightLeg', RightToeBase: 'RightFoot',
} as const;
export type BoneKey = keyof typeof PARENTS;
const KEYS = Object.keys(PARENTS) as BoneKey[];
// Os orientés par applyPose (mains et orteils : rotation locale de repos conservée, ils suivent leur parent).
const DRIVEN: readonly BoneKey[] = KEYS.filter((k) => k !== 'LeftHand' && k !== 'RightHand' && k !== 'LeftToeBase' && k !== 'RightToeBase');
type Side = 'Left' | 'Right';
const SIDES: readonly Side[] = ['Left', 'Right'];
// Noms des os de chaque membre, posés une fois (pas de chaîne construite à chaque appel).
const LEGS = {
  Left: { up: 'LeftUpLeg', leg: 'LeftLeg', foot: 'LeftFoot' },
  Right: { up: 'RightUpLeg', leg: 'RightLeg', foot: 'RightFoot' },
} as const satisfies Record<Side, Record<string, BoneKey>>;
const ARMS = {
  Left: { up: 'LeftArm', low: 'LeftForeArm' },
  Right: { up: 'RightArm', low: 'RightForeArm' },
} as const satisfies Record<Side, Record<string, BoneKey>>;

type Rec<T> = Record<BoneKey, T>;
const rec = <T>(f: (k: BoneKey) => T): Rec<T> => Object.fromEntries(KEYS.map((k) => [k, f(k)])) as Rec<T>;

// Grandeurs de repos exprimées dans l'espace du rig (l'objet passé à applyPose) : elles dépendent des nœuds entre le rig
// et Hips (« Armature » tournée, mise à l'échelle des modèles glTF), calculées une fois par rig.
type RigSpace = {
  rig: THREE.Object3D;
  baseQ: THREE.Quaternion; // rotation du parent de Hips dans le rig
  baseInv: THREE.Matrix4; // rig → espace du parent de Hips
  restW: Rec<THREE.Quaternion>;
  restPos: Rec<THREE.Vector3>;
  // Direction de repos du segment qui part de l'os (vers son enfant) et charnière de repos (segment × sens de flexion,
  // ce sens étant le devant du genou, +z, pour les jambes et l'arrière du coude, −z, pour les bras).
  dir: Rec<THREE.Vector3>;
  hinge: Rec<THREE.Vector3>;
  hipOff: Record<Side, THREE.Vector3>; // Hips → hanche, au repos
  hipMid: THREE.Vector3; // Hips → milieu des hanches, au repos
  thigh: Record<Side, number>;
  shin: Record<Side, number>;
  cur: Rec<THREE.Quaternion>; // rotations du monde de la pose en cours (travail)
};

export type BoneMap = {
  bones: Rec<THREE.Bone>;
  /** Rotations locales et position de Hips au repos (pose de liaison, relevées par boneMap). */
  restQ: Rec<THREE.Quaternion>;
  restHips: THREE.Vector3;
  space: RigSpace | null;
};

// À appeler sur un squelette au repos (pose de liaison en T, juste après le chargement ou le clonage).
export function boneMap(skeleton: THREE.Skeleton): BoneMap {
  const found = new Map<string, THREE.Bone>();
  for (const b of skeleton.bones) found.set(boneName(b.name), b);
  const missing = KEYS.filter((k) => !found.has(k));
  if (missing.length) throw new Error(`Squelette incomplet : ${missing.join(', ')}`);
  const bones = rec((k) => found.get(k)!);
  for (const k of KEYS) {
    const p = PARENTS[k];
    if (p && bones[k].parent !== bones[p]) throw new Error(`Hiérarchie inattendue : ${k} n'est pas sous ${p}`);
  }
  return { bones, restQ: rec((k) => bones[k].quaternion.clone()), restHips: bones.Hips.position.clone(), space: null };
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

function rigSpace(m: BoneMap, rig: THREE.Object3D): RigSpace {
  if (m.space && m.space.rig === rig) return m.space;
  const hips = m.bones.Hips;
  const base = new THREE.Matrix4();
  const l = new THREE.Matrix4();
  for (let o = hips.parent; o !== rig; o = o.parent) {
    if (!o) throw new Error('Le squelette n’est pas sous le rig');
    base.premultiply(l.compose(o.position, o.quaternion, o.scale));
  }
  const baseQ = new THREE.Quaternion();
  base.decompose(new THREE.Vector3(), baseQ, new THREE.Vector3());
  const restW = rec(() => new THREE.Quaternion());
  const world = rec(() => new THREE.Matrix4());
  const restPos = rec(() => new THREE.Vector3());
  for (const k of KEYS) {
    const p = PARENTS[k];
    const b = m.bones[k];
    l.compose(k === 'Hips' ? m.restHips : b.position, m.restQ[k], b.scale);
    world[k].multiplyMatrices(p ? world[p] : base, l);
    restW[k].multiplyQuaternions(p ? restW[p] : baseQ, m.restQ[k]);
    restPos[k].setFromMatrixPosition(world[k]);
  }
  const dir = rec(() => new THREE.Vector3());
  const hinge = rec(() => new THREE.Vector3());
  const seg = (k: BoneKey, child: BoneKey, ref: THREE.Vector3 | null): void => {
    dir[k].subVectors(restPos[child], restPos[k]).normalize();
    if (ref) hinge[k].copy(ref).addScaledVector(dir[k], -ref.dot(dir[k])).normalize().crossVectors(dir[k], hinge[k]);
  };
  const back = Z.clone().negate();
  for (const s of SIDES) {
    seg(`${s}UpLeg`, `${s}Leg`, Z);
    seg(`${s}Leg`, `${s}Foot`, Z);
    seg(`${s}Foot`, `${s}ToeBase`, null);
    seg(`${s}Arm`, `${s}ForeArm`, back);
    seg(`${s}ForeArm`, `${s}Hand`, back);
  }
  seg('Neck', 'Head', null);
  const hipOff = { Left: restPos.LeftUpLeg.clone().sub(restPos.Hips), Right: restPos.RightUpLeg.clone().sub(restPos.Hips) };
  const len = (a: BoneKey, b: BoneKey): number => restPos[a].distanceTo(restPos[b]);
  m.space = {
    rig, baseQ, baseInv: base.clone().invert(), restW, restPos, dir, hinge, hipOff,
    hipMid: hipOff.Left.clone().add(hipOff.Right).multiplyScalar(0.5),
    thigh: { Left: len('LeftUpLeg', 'LeftLeg'), Right: len('RightUpLeg', 'RightLeg') },
    shin: { Left: len('LeftLeg', 'LeftFoot'), Right: len('RightLeg', 'RightFoot') },
    cur: rec(() => new THREE.Quaternion()),
  };
  return m.space;
}

// Vecteurs, matrices et quaternions de travail (aucune allocation par appel).
const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), e3 = new THREE.Vector3();
const f1 = new THREE.Vector3(), f2 = new THREE.Vector3(), f3 = new THREE.Vector3();
const M0 = new THREE.Matrix4(), M1 = new THREE.Matrix4();
const qP = new THREE.Quaternion(), qC = new THREE.Quaternion(), qT = new THREE.Quaternion(), qI = new THREE.Quaternion();
const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), vD = new THREE.Vector3();
const vUp = new THREE.Vector3(), vLat = new THREE.Vector3(), vFb = new THREE.Vector3(), vT = new THREE.Vector3(), vS = new THREE.Vector3();
const lowRel = { Left: 0, Right: 0 };

const set = (out: THREE.Vector3, p: V3): THREE.Vector3 => out.set(p[0], p[1], p[2]);
const diff = (out: THREE.Vector3, a: V3, b: V3): THREE.Vector3 => out.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();

// Rotation qui porte l'axe a0 sur a1 exactement et l'axe secondaire s0 au plus près de s1 (bases orthonormées).
// Axe secondaire parallèle au principal : simple alignement de a0 sur a1.
function align(a0: THREE.Vector3, s0: THREE.Vector3, a1: THREE.Vector3, s1: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  e1.copy(a0).normalize();
  e2.copy(s0).addScaledVector(e1, -s0.dot(e1));
  f1.copy(a1).normalize();
  f2.copy(s1).addScaledVector(f1, -s1.dot(f1));
  if (e2.lengthSq() < 1e-12 || f2.lengthSq() < 1e-12) return out.setFromUnitVectors(e1, f1);
  e2.normalize();
  f2.normalize();
  e3.crossVectors(e1, e2);
  f3.crossVectors(f1, f2);
  M0.makeBasis(e1, e2, e3).transpose();
  M1.makeBasis(f1, f2, f3).multiply(M0);
  return out.setFromRotationMatrix(M1);
}

// Charnière visée, normale au plan du membre et commune à ses deux segments : t × sens de flexion, ce sens étant
// l'opposé de l'écart du segment suivant `s` (le genou part devant quand le tibia part derrière ; le coude part derrière
// quand l'avant-bras part devant), avec une pointe de `fb` pour qu'un membre tendu garde une charnière stable.
function hingeOf(t: THREE.Vector3, s: THREE.Vector3, fb: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  out.copy(s).addScaledVector(t, -s.dot(t)).negate();
  vD.copy(fb).addScaledVector(t, -fb.dot(t));
  return out.addScaledVector(vD, 1e-3).cross(t).negate();
}

// Membre à deux segments (a → b → c du pantin) : les deux os partagent la charnière du pantin. Laisse dans vT, vS les
// directions des segments et dans qT la rotation du second os (le pied s'en sert).
function limb(S: RigSpace, up: BoneKey, low: BoneKey, a: V3, b: V3, c: V3): void {
  diff(vT, a, b);
  diff(vS, b, c);
  hingeOf(vT, vS, vFb, vC);
  align(S.dir[up], S.hinge[up], vT, vC, qT);
  S.cur[up].multiplyQuaternions(qT, S.restW[up]);
  align(S.dir[low], S.hinge[low], vS, vC, qT);
  S.cur[low].multiplyQuaternions(qT, S.restW[low]);
}

export function applyPose(rig: THREE.Object3D, m: BoneMap, pose: Pose, unitsToRig: number): void {
  const S = rigSpace(m, rig);
  const W = S.cur;
  const legL = pose.legs[0].l < 0 ? pose.legs[0] : pose.legs[1];
  const legR = legL === pose.legs[0] ? pose.legs[1] : pose.legs[0];
  const armL = pose.arms[0].l < 0 ? pose.arms[0] : pose.arms[1];
  const armR = armL === pose.arms[0] ? pose.arms[1] : pose.arms[0];

  // Bassin : haut = vertical, travers = hanche droite → hanche gauche (porte le pelvisTurn). Buste : haut = bassin → cou
  // (porte le lean), travers = épaule droite → épaule gauche (porte le shoulderTurn). La colonne se tord entre les deux.
  align(Y, X, vUp.set(0, 1, 0), diff(vLat, legR.hip, legL.hip), qP);
  align(Y, X, diff(vUp, pose.pelvis, pose.neck), diff(vLat, armR.sh, armL.sh), qC);
  W.Hips.multiplyQuaternions(qP, S.restW.Hips);
  W.Spine.slerpQuaternions(qP, qC, 1 / 3).multiply(S.restW.Spine);
  W.Spine1.slerpQuaternions(qP, qC, 2 / 3).multiply(S.restW.Spine1);
  W.Spine2.multiplyQuaternions(qC, S.restW.Spine2);
  W.LeftShoulder.multiplyQuaternions(qC, S.restW.LeftShoulder);
  W.RightShoulder.multiplyQuaternions(qC, S.restW.RightShoulder);
  // Cou : segment cou → tête, travers du buste. Tête : repère de tête complet (devant, haut), qui tourne avec headYaw.
  align(S.dir.Neck, X, diff(vA, pose.neck, pose.head), vLat, qT);
  W.Neck.multiplyQuaternions(qT, S.restW.Neck);
  align(Y, Z, set(vA, pose.headFrame.U), set(vB, pose.headFrame.F), qT);
  W.Head.multiplyQuaternions(qT, S.restW.Head);

  // Jambes : cuisse et tibia dans le plan de flexion du pantin (genou devant), pied sur la cheville → pointe, sans
  // vrille par rapport au tibia. Hauteur relative de chaque cheville (pour poser les pieds au sol).
  vFb.copy(Z).applyQuaternion(qP);
  for (const s of SIDES) {
    const leg = s === 'Left' ? legL : legR;
    const k = LEGS[s];
    limb(S, k.up, k.leg, leg.hip, leg.knee, leg.ankle);
    vA.copy(X).applyQuaternion(qT);
    align(S.dir[k.foot], X, diff(vB, leg.ankle, leg.toe), vA, qT);
    W[k.foot].multiplyQuaternions(qT, S.restW[k.foot]);
    lowRel[s] = vA.copy(S.hipOff[s]).applyQuaternion(qP).y + vT.y * S.thigh[s] + vS.y * S.shin[s];
  }
  // Bras : épaule → coude → main dans le plan du pantin (coude derrière) ; repli pour un bras tendu : derrière et en bas.
  vFb.set(0, -0.5, -1).applyQuaternion(qC);
  for (const s of SIDES) {
    const arm = s === 'Left' ? armL : armR;
    limb(S, ARMS[s].up, ARMS[s].low, arm.sh, arm.elb, arm.hand);
  }

  // Rotations locales, de la racine vers les extrémités (DRIVEN suit l'ordre parent avant enfant).
  for (const k of DRIVEN) {
    const p = PARENTS[k];
    qI.copy(p ? W[p] : S.baseQ).invert();
    m.bones[k].quaternion.multiplyQuaternions(qI, W[k]);
  }

  // Bassin : milieu des hanches du rig au `pelvis` du pantin × échelle. Pantin debout, en marche ou accroupi (cheville
  // d'appui exactement à LIMB.ankle, pieds à y = 0) : la hauteur est reprise pour poser la cheville d'appui du rig au
  // même niveau, le modèle n'ayant pas les proportions du pantin. Assis, en selle, sur l'échelle : le bassin fait foi.
  vA.copy(S.hipMid).applyQuaternion(qP);
  set(vB, pose.pelvis).multiplyScalar(unitsToRig).sub(vA);
  const low = Math.min(legL.ankle[1], legR.ankle[1]);
  if (Math.abs(low - LIMB.ankle) < 1e-6) vB.y = low * unitsToRig - Math.min(lowRel.Left, lowRel.Right);
  m.bones.Hips.position.copy(vB).applyMatrix4(S.baseInv);
}
