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
import { PERCH, type Gait, type Pose } from '../library/figure/skeleton';
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

// Pose de liaison, relevée dans les matrices de liaison du squelette (`boneInverses`) : espace de liaison = espace local
// du rig (le SkinnedMesh, ou un ancêtre qui coïncide avec lui), pieds à y = 0. Elle ne dépend donc pas de la pose
// courante des os : boneMap peut être appelé après un applyPose.
type Rest = {
  W: Rec<THREE.Quaternion>; // rotations du monde de liaison
  pos: Rec<THREE.Vector3>;
  // Direction de repos du segment qui part de l'os (vers son enfant) et charnière de repos (segment × sens de flexion,
  // ce sens étant le devant du genou, +z, pour les jambes et l'arrière du coude, −z, pour les bras).
  dir: Rec<THREE.Vector3>;
  hinge: Rec<THREE.Vector3>;
  hipOff: Record<Side, THREE.Vector3>; // Hips → hanche
  hipMid: THREE.Vector3; // Hips → milieu des hanches
  thigh: Record<Side, number>;
  shin: Record<Side, number>;
  ankleY: number; // hauteur de cheville du modèle debout (la plus basse des deux)
  // Colonne au repos : Hips → Spine → Spine1 → Spine2 → Neck (segments) et sa ligne Hips → Neck (unitaire). Les modèles
  // ne sont pas droits au repos (cou ≈ 6° en arrière du bassin) : c'est cette ligne, pas l'axe y, qui suit le pantin.
  spine: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  torso: THREE.Vector3;
};

// Passage du rig à l'espace du parent de Hips (nœuds « Armature » tournés, mis à l'échelle des glTF), calculé une fois
// par rig : ces nœuds ne bougent pas.
type RigSpace = { rig: THREE.Object3D; baseQ: THREE.Quaternion; baseInv: THREE.Matrix4 };

export type BoneMap = {
  bones: Rec<THREE.Bone>;
  rest: Rest;
  space: RigSpace | null;
  cur: Rec<THREE.Quaternion>; // rotations du monde de la pose en cours (travail)
};

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

export function boneMap(skeleton: THREE.Skeleton): BoneMap {
  const found = new Map<string, THREE.Bone>();
  const bind = new Map<string, THREE.Matrix4>();
  skeleton.bones.forEach((b, i) => {
    found.set(boneName(b.name), b);
    bind.set(boneName(b.name), skeleton.boneInverses[i]!.clone().invert());
  });
  const missing = KEYS.filter((k) => !found.has(k));
  if (missing.length) throw new Error(`Squelette incomplet : ${missing.join(', ')}`);
  const bones = rec((k) => found.get(k)!);
  for (const k of KEYS) {
    const p = PARENTS[k];
    if (p && bones[k].parent !== bones[p]) throw new Error(`Hiérarchie inattendue : ${k} n'est pas sous ${p}`);
  }
  const sc = new THREE.Vector3();
  const W = rec(() => new THREE.Quaternion());
  const pos = rec(() => new THREE.Vector3());
  for (const k of KEYS) bind.get(k)!.decompose(pos[k], W[k], sc);
  const dir = rec(() => new THREE.Vector3());
  const hinge = rec(() => new THREE.Vector3());
  const seg = (k: BoneKey, child: BoneKey, ref: THREE.Vector3 | null): void => {
    dir[k].subVectors(pos[child], pos[k]).normalize();
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
  const hipOff = { Left: pos.LeftUpLeg.clone().sub(pos.Hips), Right: pos.RightUpLeg.clone().sub(pos.Hips) };
  const len = (a: BoneKey, b: BoneKey): number => pos[a].distanceTo(pos[b]);
  const rest: Rest = {
    W, pos, dir, hinge, hipOff,
    hipMid: hipOff.Left.clone().add(hipOff.Right).multiplyScalar(0.5),
    thigh: { Left: len('LeftUpLeg', 'LeftLeg'), Right: len('RightUpLeg', 'RightLeg') },
    shin: { Left: len('LeftLeg', 'LeftFoot'), Right: len('RightLeg', 'RightFoot') },
    ankleY: Math.min(pos.LeftFoot.y, pos.RightFoot.y),
    spine: [pos.Spine.clone().sub(pos.Hips), pos.Spine1.clone().sub(pos.Spine), pos.Spine2.clone().sub(pos.Spine1), pos.Neck.clone().sub(pos.Spine2)],
    torso: pos.Neck.clone().sub(pos.Hips).normalize(),
  };
  return { bones, rest, space: null, cur: rec(() => new THREE.Quaternion()) };
}

function rigSpace(m: BoneMap, rig: THREE.Object3D): RigSpace {
  if (m.space && m.space.rig === rig) return m.space;
  const base = new THREE.Matrix4();
  const l = new THREE.Matrix4();
  for (let o = m.bones.Hips.parent; o !== rig; o = o.parent) {
    if (!o) throw new Error('Le squelette n’est pas sous le rig');
    base.premultiply(l.compose(o.position, o.quaternion, o.scale));
  }
  const baseQ = new THREE.Quaternion();
  base.decompose(new THREE.Vector3(), baseQ, new THREE.Vector3());
  m.space = { rig, baseQ, baseInv: base.invert() };
  return m.space;
}

// Vecteurs, matrices et quaternions de travail (aucune allocation par appel).
const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), e3 = new THREE.Vector3();
const f1 = new THREE.Vector3(), f2 = new THREE.Vector3(), f3 = new THREE.Vector3();
const M0 = new THREE.Matrix4(), M1 = new THREE.Matrix4();
const qP = new THREE.Quaternion(), qC = new THREE.Quaternion(), qT = new THREE.Quaternion(), qI = new THREE.Quaternion();
const qS = new THREE.Quaternion();
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
function limb(R: Rest, cur: Rec<THREE.Quaternion>, up: BoneKey, low: BoneKey, a: V3, b: V3, c: V3): void {
  diff(vT, a, b);
  diff(vS, b, c);
  hingeOf(vT, vS, vFb, vC);
  align(R.dir[up], R.hinge[up], vT, vC, qT);
  cur[up].multiplyQuaternions(qT, R.W[up]);
  align(R.dir[low], R.hinge[low], vS, vC, qT);
  cur[low].multiplyQuaternions(qT, R.W[low]);
}

// Sol de chaque allure dans le repère du pantin (null : pas d'appui au sol, le bassin fait foi). Vélo arrêté : le pied
// côté spectateur est posé sur le sol sous les roues, plus bas que les pieds du pantin.
const FLOOR: Readonly<Record<Gait, number | null>> = {
  stand: 0, step: 0, walk: 0, crouch: 0, perch: PERCH.groundY, seated: null, climb: null, pedal: null, mount: null,
};

// `gait` : allure qui a produit la pose ; sans elle, le bassin est posé tel quel (pas de reprise d'appui au sol).
export function applyPose(rig: THREE.Object3D, m: BoneMap, pose: Pose, unitsToRig: number, gait?: Gait): void {
  const R = m.rest;
  const S = rigSpace(m, rig);
  const W = m.cur;
  const legL = pose.legs[0].l < 0 ? pose.legs[0] : pose.legs[1];
  const legR = legL === pose.legs[0] ? pose.legs[1] : pose.legs[0];
  const armL = pose.arms[0].l < 0 ? pose.arms[0] : pose.arms[1];
  const armR = armL === pose.arms[0] ? pose.arms[1] : pose.arms[0];

  // Bassin : haut = vertical, travers = hanche droite → hanche gauche (porte le pelvisTurn). Buste : haut = bassin → cou
  // (porte le lean), travers = épaule droite → épaule gauche (porte le shoulderTurn). La colonne se tord entre les deux.
  align(Y, X, vUp.set(0, 1, 0), diff(vLat, legR.hip, legL.hip), qP);
  // Buste : la ligne de repos Hips → Neck sur pelvis → neck du pantin. La colonne se tordant entre bassin et buste
  // (Spine, Spine1 à 1/3 et 2/3), la ligne obtenue s'en écarte un peu : quatre corrections la ramènent sur la cible (à 0,2° près sur les modèles).
  align(R.torso, X, diff(vUp, pose.pelvis, pose.neck), diff(vLat, armR.sh, armL.sh), qC);
  for (let it = 0; it < 4; it++) {
    vA.copy(R.spine[0]).applyQuaternion(qP);
    vA.add(vB.copy(R.spine[1]).applyQuaternion(qS.slerpQuaternions(qP, qC, 1 / 3)));
    vA.add(vB.copy(R.spine[2]).applyQuaternion(qS.slerpQuaternions(qP, qC, 2 / 3)));
    vA.add(vB.copy(R.spine[3]).applyQuaternion(qC)).normalize();
    qC.premultiply(qS.setFromUnitVectors(vA, vUp));
  }
  W.Hips.multiplyQuaternions(qP, R.W.Hips);
  W.Spine.slerpQuaternions(qP, qC, 1 / 3).multiply(R.W.Spine);
  W.Spine1.slerpQuaternions(qP, qC, 2 / 3).multiply(R.W.Spine1);
  W.Spine2.multiplyQuaternions(qC, R.W.Spine2);
  W.LeftShoulder.multiplyQuaternions(qC, R.W.LeftShoulder);
  W.RightShoulder.multiplyQuaternions(qC, R.W.RightShoulder);
  // Cou : segment cou → tête, travers du buste. Tête : repère de tête complet (devant, haut), qui tourne avec headYaw.
  align(R.dir.Neck, X, diff(vA, pose.neck, pose.head), vLat, qT);
  W.Neck.multiplyQuaternions(qT, R.W.Neck);
  align(Y, Z, set(vA, pose.headFrame.U), set(vB, pose.headFrame.F), qT);
  W.Head.multiplyQuaternions(qT, R.W.Head);

  // Jambes : cuisse et tibia dans le plan de flexion du pantin (genou devant), pied sur la cheville → pointe, sans
  // vrille par rapport au tibia. Hauteur relative de chaque cheville (pour poser les pieds au sol).
  vFb.copy(Z).applyQuaternion(qP);
  for (const s of SIDES) {
    const leg = s === 'Left' ? legL : legR;
    const k = LEGS[s];
    limb(R, W, k.up, k.leg, leg.hip, leg.knee, leg.ankle);
    vA.copy(X).applyQuaternion(qT);
    align(R.dir[k.foot], X, diff(vB, leg.ankle, leg.toe), vA, qT);
    W[k.foot].multiplyQuaternions(qT, R.W[k.foot]);
    lowRel[s] = vA.copy(R.hipOff[s]).applyQuaternion(qP).y + vT.y * R.thigh[s] + vS.y * R.shin[s];
  }
  // Bras : épaule → coude → main dans le plan du pantin (coude derrière) ; repli pour un bras tendu : derrière et en bas.
  vFb.set(0, -0.5, -1).applyQuaternion(qC);
  for (const s of SIDES) {
    const arm = s === 'Left' ? armL : armR;
    limb(R, W, ARMS[s].up, ARMS[s].low, arm.sh, arm.elb, arm.hand);
  }

  // Rotations locales, de la racine vers les extrémités (DRIVEN suit l'ordre parent avant enfant).
  for (const k of DRIVEN) {
    const p = PARENTS[k];
    qI.copy(p ? W[p] : S.baseQ).invert();
    m.bones[k].quaternion.multiplyQuaternions(qI, W[k]);
  }

  // Bassin : milieu des hanches du rig au `pelvis` du pantin × échelle. Allures au sol (et pied posé du vélo arrêté) :
  // la hauteur est reprise pour que la cheville la plus basse du rig soit au sol du pantin + la hauteur de cheville du
  // modèle, celui-ci n'ayant pas les proportions du pantin. Autres allures, ou allure non donnée : le bassin fait foi.
  vA.copy(R.hipMid).applyQuaternion(qP);
  set(vB, pose.pelvis).multiplyScalar(unitsToRig).sub(vA);
  const floor = gait === undefined ? null : FLOOR[gait];
  if (floor !== null) vB.y = floor * unitsToRig + R.ankleY - Math.min(lowRel.Left, lowRel.Right);
  m.bones.Hips.position.copy(vB).applyMatrix4(S.baseInv);
}
