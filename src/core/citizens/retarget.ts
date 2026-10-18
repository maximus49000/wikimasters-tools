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
import { LIMB, PERCH, type Gait, type Leg, type Pose } from '../library/figure/skeleton';
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
  // Enveloppe du tronc habillé (bras tenus hors du corps), mesurée au premier applyPose sur le rig ; null : rien à mesurer.
  hull?: Hull | null;
};

// Enveloppe du tronc au repos (corps + vêtements liés au bassin, au buste ou au haut des cuisses + sac pendu au bassin) : rayon
// horizontal maximal autour de l'axe vertical des hanches, par tranche de hauteur (NY + 1 rangées depuis y0, pas dy) et
// par secteur d'angle (NA). Plus l'épaisseur du bras (manche comprise) de l'épaule au poignet (ARM_BINS cases) et de la
// main, et les longueurs des segments du bras.
export type Hull = {
  y0: number; dy: number; NY: number; NA: number; cx: number; cz: number; r: Float32Array;
  arm: Float32Array; hand: number; handLen: number;
  up: Record<Side, number>; fore: Record<Side, number>;
};
const ARM_BINS = 8;
const ARM_PRESS = 0.65;
// Écart total au plus (radians) : au-delà, le bras traverserait plutôt un peu que de partir en croix.
const ARM_MAX = 0.3;

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

// ——— Pas de marche : flexion du genou recalée (3D seulement) ———
// Le pantin plie le genou au plus fort quand la cuisse est encore en arrière (swing = cos(ph + 0,35)²) : phase 11 →
// cuisse −12°, genou 57°, pied relevé derrière presque à l'horizontale. Avec des volumes (cuisse, chaussure), le pied
// semble « botté » en arrière. En 3D, le genou plie surtout pendant que la jambe revient vers l'avant : pic quand la
// cuisse passe à la verticale (cos(ph + 0,15)²), et le tibia ne part jamais plus de KNEE_CAP degrés en arrière de la
// cuisse (un peu plus de face, où le pied relevé se lit sans se voir derrière). Cuisse, foulée et pied d'appui restent
// ceux du pantin ; le pantin 2D n'est pas touché.
// Amplitude du pas par allure (AMPLITUDE de skeleton.ts, recopiée : un test vérifie que la phase est bien retrouvée).
const WALK_AMP: Partial<Record<Gait, number>> = { walk: 1, step: 0.35 };
const DEG = Math.PI / 180;
const KNEE_CAP = 50, KNEE_CAP_FRONT = 18;
const swingOf = (ph: number, shift: number): number => Math.max(0, Math.cos(ph + shift)) ** 2;
const ang = { th: 0, k: 0 };
// Angles de la jambe du pantin dans son plan (degrés) : cuisse (devant > 0) et flexion du genou.
function legAngles(leg: Leg, F: V3): typeof ang {
  const tx = leg.knee[0] - leg.hip[0], ty = leg.knee[1] - leg.hip[1], tz = leg.knee[2] - leg.hip[2];
  const sx = leg.ankle[0] - leg.knee[0], sy = leg.ankle[1] - leg.knee[1], sz = leg.ankle[2] - leg.knee[2];
  ang.th = Math.atan2(tx * F[0] + tz * F[2], -ty) / DEG;
  ang.k = ang.th - Math.atan2(sx * F[0] + sz * F[2], -sy) / DEG;
  return ang;
}
// Phase de marche (radians) retrouvée dans la pose : sin(phase) par la rotation du bassin, cos(phase + 0,35) par le
// genou de la jambe libre (une seule jambe est en l'air à la fois). null : allure sans pas.
export function walkPhase(pose: Pose, gait: Gait | undefined): number | null {
  const w = gait ? WALK_AMP[gait] : undefined;
  if (!w) return null;
  const F = pose.fr.F, f = Math.abs(F[2]);
  const amp = w * (55 + 30 * f);
  const sA = Math.max(0, legAngles(pose.legs[0], F).k - 4) / amp;
  const sB = Math.max(0, legAngles(pose.legs[1], F).k - 4) / amp;
  const c = sA >= sB ? Math.sqrt(Math.min(1, sA)) : -Math.sqrt(Math.min(1, sB));
  const s = pose.pelvisTurn / (w * 6 * DEG);
  const t = Math.acos(c);
  const a = t - 0.35, b = -t - 0.35;
  return Math.abs(Math.sin(a) - s) <= Math.abs(Math.sin(b) - s) ? a : b;
}
// Flexion du genou 3D (degrés) d'une jambe de phase `ph`, cuisse à `th` degrés, de face à `f` (0 profil, 1 face).
export function walkKnee(ph: number, f: number, w: number, th: number): number {
  const k = 4 + w * (55 + 30 * f) * swingOf(ph, 0.15);
  return Math.max(0, Math.min(k, th + KNEE_CAP + KNEE_CAP_FRONT * f * f * f));
}
// Cheville et pointe recalculées (repère du pantin), par côté : écrites ici, sans allocation.
const ankleW = { Left: [0, 0, 0] as [number, number, number], Right: [0, 0, 0] as [number, number, number] };
const toeW = { Left: [0, 0, 0] as [number, number, number], Right: [0, 0, 0] as [number, number, number] };
function retimeLeg(leg: Leg, ph: number, f: number, w: number, F: V3, s: Side): void {
  const { th } = legAngles(leg, F);
  const sa = (th - walkKnee(ph, f, w, th)) * DEG;
  const a = ankleW[s], t = toeW[s];
  a[0] = leg.knee[0] + LIMB.shin * Math.sin(sa) * F[0];
  a[1] = leg.knee[1] - LIMB.shin * Math.cos(sa);
  a[2] = leg.knee[2] + LIMB.shin * Math.sin(sa) * F[2];
  const ta = sa * 0.6;
  t[0] = a[0] + 3 * Math.cos(ta) * F[0];
  t[1] = a[1] + 3 * Math.sin(ta) - 0.6;
  t[2] = a[2] + 3 * Math.cos(ta) * F[2];
}

// ——— Bras hors du tronc ———
// Les cibles de main du pantin supposent un buste mince : sur les bases larges (femme-forte, homme-fort, mamie), le bras
// qui balance ou pend le long du corps entrait dans le ventre ou la hanche, et les mains des gestes (bras croisés,
// menton…) dans la poitrine. Après le pantin, chaque bras tourne d'un bloc autour de l'épaule (coude gardé) juste assez
// pour que coude, avant-bras, poignet et main restent hors de l'enveloppe du tronc habillé : vers l'extérieur sur les
// flancs (le bras s'écarte), vers l'avant devant le ventre (la main se pose dessus au lieu d'y entrer).
const TORSO = new Set(['Hips', 'Spine', 'Spine1', 'Spine2']);
const THIGH = new Set(['LeftUpLeg', 'RightUpLeg']);
const ARM_SIDE: Record<string, Side> = { LeftArm: 'Left', LeftForeArm: 'Left', LeftHand: 'Left', RightArm: 'Right', RightForeArm: 'Right', RightHand: 'Right' };

// Part du corps de base dans l'enveloppe (rayons, sommes et comptes du bras et de la main), par géométrie du corps.
type BodyHull = { sig: string; r: Float32Array; arm: Float32Array; armN: Float32Array; hand: number; handN: number; handLen: number; n: number };
const bodyHulls = new WeakMap<THREE.BufferGeometry, BodyHull>();
// Enveloppe mesurée à l'habillage du rig (CitizenRenderer.build) plutôt qu'au premier applyPose : le premier rendu ne la paie
// plus. Sans effet si elle est déjà là.
export function prepareHull(m: BoneMap, rig: THREE.Object3D): void {
  if (m.hull === undefined) m.hull = buildHull(m, rig);
}

function buildHull(m: BoneMap, rig: THREE.Object3D): Hull | null {
  const P0 = m.rest.pos;
  const torsoLen = P0.Neck.y - P0.Hips.y;
  if (!(torsoLen > 0)) return null;
  // Du milieu des cuisses (bout des doigts bras ballants) au cou.
  const y0 = P0.Hips.y - 0.75 * torsoLen, y1 = P0.Neck.y, NY = 48, NA = 32, dy = (y1 - y0) / NY;
  // Cuisses : seulement leur haut (hanches, fesses), qui bouge peu au pas.
  const thighY = P0.Hips.y - 0.3 * torsoLen;
  const cx = P0.Hips.x, cz = P0.Hips.z;
  const r = new Float32Array((NY + 1) * NA), ra = new Float32Array((NY + 1) * NA), arm = new Float32Array(ARM_BINS), armN = new Float32Array(ARM_BINS);
  let hand = 0, handN = 0, handLen = 0, n = 0;
  const up = { Left: P0.LeftArm.distanceTo(P0.LeftForeArm), Right: P0.RightArm.distanceTo(P0.RightForeArm) };
  const fore = { Left: P0.LeftForeArm.distanceTo(P0.LeftHand), Right: P0.RightForeArm.distanceTo(P0.RightHand) };
  const d = new THREE.Vector3(), q = new THREE.Vector3();
  // Repère de la mesure (le même pour toutes les tenues d'une base) : la part du corps n'est valable que pour lui.
  const sig = [y0, dy, cx, cz, P0.LeftArm, P0.LeftHand, P0.RightArm, P0.RightHand].map((v) => (typeof v === 'number' ? v : `${v.x},${v.y},${v.z}`)).join('|');
  rig.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.skeleton.bones.includes(m.bones.Hips)) return;
    // Accessoires : seul ce qui pend au bassin compte (sac en bandoulière, à toute hauteur : le bras passe devant lui) ;
    // sac à dos, sangles du buste, écharpe non (le bras passe à côté d'un sac à dos plus étroit que les épaules).
    const acc = !!mesh.userData.accessory;
    const g = mesh.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
    if (!P || !SI || !SW) return;
    // Vêtements (garde-robe : attribut bindPos) : seulement au-dessus des hanches. Plus bas, jupes, pans de manteau et
    // sacs s'évasent loin du corps : les éviter mettrait les bras en croix ; la main frôle le tissu comme en vrai.
    const cloth = !!g.attributes.bindPos;
    // Corps de la base (ni vêtement ni accessoire : géométrie partagée par tous les habitants de cette base) : sa part de
    // l'enveloppe est mesurée une fois par géométrie, puis ajoutée telle quelle.
    const shared = !cloth && !acc;
    if (shared) {
      const c = bodyHulls.get(g);
      if (c && c.sig === sig) {
        for (let j = 0; j < r.length; j++) if (c.r[j]! > r[j]!) r[j] = c.r[j]!;
        for (let b = 0; b < ARM_BINS; b++) { arm[b] = arm[b]! + c.arm[b]!; armN[b] = armN[b]! + c.armN[b]!; }
        hand += c.hand; handN += c.handN; handLen = Math.max(handLen, c.handLen); n += c.n;
        return;
      }
    }
    // Part du corps mesurée à part (puis gardée) : accumulateurs propres, ajoutés ensuite.
    const own = shared ? { r: new Float32Array(r.length), arm: new Float32Array(ARM_BINS), armN: new Float32Array(ARM_BINS), hand: 0, handN: 0, handLen: 0, n: 0 } : null;
    const tR = own ? own.r : r, tArm = own ? own.arm : arm, tArmN = own ? own.armN : armN;
    let tHand = 0, tHandN = 0, tHandLen = 0, tN = 0;
    const names = mesh.skeleton.bones.map((b) => boneName(b.name));
    for (let i = 0; i < P.count; i++) {
      let best = -1, bw = 0;
      for (let k = 0; k < 4; k++) {
        const w = k === 0 ? SW.getX(i) : k === 1 ? SW.getY(i) : k === 2 ? SW.getZ(i) : SW.getW(i);
        if (w > bw) { bw = w; best = k === 0 ? SI.getX(i) : k === 1 ? SI.getY(i) : k === 2 ? SI.getZ(i) : SI.getW(i); }
      }
      const name = names[best] ?? '';
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const side = ARM_SIDE[name];
      if (side && !acc) {
        // Épaisseur moyenne du bras (manche comprise) autour de l'axe épaule → main du repos ; main : au-delà du poignet.
        const a = P0[`${side}Arm`], h = P0[`${side}Hand`];
        d.subVectors(h, a);
        const L = d.length();
        d.divideScalar(L);
        q.set(x, y, z).sub(a);
        const t = q.dot(d) / L, dist = q.addScaledVector(d, -t * L).length();
        if (/Hand/.test(name) || t > 1) {
          tHand += Math.min(dist, 0.15 * L);
          tHandN++;
          tHandLen = Math.max(tHandLen, Math.min((t - 1) * L, 0.5 * L));
        } else if (t >= 0.25) {
          const b = Math.min(ARM_BINS - 1, Math.floor(t * ARM_BINS));
          tArm[b] = tArm[b]! + Math.min(dist, 0.2 * L);
          tArmN[b] = tArmN[b]! + 1;
        }
        continue;
      }
      if (acc ? name !== 'Hips' || y < y0 || y > y1 : !(TORSO.has(name) || (THIGH.has(name) && y > thighY)) || y < y0 || y > y1 || (cloth && y < P0.Hips.y)) continue;
      const dx = x - cx, dz = z - cz;
      const ia = Math.floor(((Math.atan2(dx, dz) + Math.PI) / (2 * Math.PI)) * NA) % NA;
      const j = Math.round((y - y0) / dy) * NA + ia;
      const gr = acc ? ra : tR;
      gr[j] = Math.max(gr[j]!, Math.hypot(dx, dz));
      tN++;
    }
    if (own) {
      own.hand = tHand; own.handN = tHandN; own.handLen = tHandLen; own.n = tN;
      bodyHulls.set(g, { sig, ...own });
      for (let j = 0; j < r.length; j++) if (own.r[j]! > r[j]!) r[j] = own.r[j]!;
      for (let b = 0; b < ARM_BINS; b++) { arm[b] = arm[b]! + own.arm[b]!; armN[b] = armN[b]! + own.armN[b]!; }
    }
    hand += tHand; handN += tHandN; handLen = Math.max(handLen, tHandLen); n += tN;
  });
  if (!n) return null;
  // Cases vides (maillage lâche) : le plus grand des voisins.
  for (let it = 0; it < 2; it++)
    for (let iy = 0; iy <= NY; iy++)
      for (let ia = 0; ia < NA; ia++) {
        const j = iy * NA + ia;
        if (r[j]) continue;
        r[j] = Math.max(r[iy * NA + ((ia + 1) % NA)]!, r[iy * NA + ((ia + NA - 1) % NA)]!, iy > 0 ? r[j - NA]! : 0, iy < NY ? r[j + NA]! : 0);
      }
  for (let b = 0; b < ARM_BINS; b++) if (armN[b]) arm[b] = arm[b]! / armN[b]!;
  for (let b = 1; b < ARM_BINS; b++) if (!arm[b]) arm[b] = arm[b - 1]!;
  if (handN) hand /= handN;
  // Sac : le bras ne s'y appuie pas comme sur le flanc, il passe devant (toute son épaisseur hors du sac).
  let thick = 0;
  for (let b = 0; b < ARM_BINS; b++) thick = Math.max(thick, arm[b]!);
  for (let j = 0; j < r.length; j++) if (ra[j]) r[j] = Math.max(r[j]!, ra[j]! + ARM_PRESS * thick);
  return { y0, dy, NY, NA, cx, cz, r, arm, hand, handLen, up, fore };
}

// Rayon de l'enveloppe à la hauteur y (repos) dans la direction az : le plus large des secteurs voisins (0 hors tranche).
function hullRadius(h: Hull, y: number, az: number): number {
  const fy = (y - h.y0) / h.dy;
  if (fy < -0.5 || fy > h.NY + 0.5) return 0;
  const iy = Math.max(0, Math.min(h.NY, Math.round(fy)));
  const ia = Math.floor(((az + Math.PI) / (2 * Math.PI)) * h.NA) % h.NA;
  let r = 0;
  for (let da = -1; da <= 1; da++) r = Math.max(r, h.r[iy * h.NA + ((ia + da + h.NA) % h.NA)]!);
  return r;
}

// Travail des bras : directions (épaule → coude, coude → poignet) par côté, points du bras, repères.
const armUp = { Left: new THREE.Vector3(), Right: new THREE.Vector3() };
const armLow = { Left: new THREE.Vector3(), Right: new THREE.Vector3() };
const sp2 = new THREE.Vector3(), shH = new THREE.Vector3(), pR = new THREE.Vector3(), pH = new THREE.Vector3();
const lP = new THREE.Vector3(), lC = new THREE.Vector3(), axisV = new THREE.Vector3();
const qPi = new THREE.Quaternion(), qCi = new THREE.Quaternion(), q13 = new THREE.Quaternion(), q23 = new THREE.Quaternion(), qR = new THREE.Quaternion();
const hit = { depth: 0, lever: new THREE.Vector3(), n: new THREE.Vector3() };
// Profondeur d'entrée du point `pt` (relatif à l'épaule, repère du rig) dans l'enveloppe, rayon `rad` compris. Le point
// est ramené au repos dans le repère du bassin et dans celui du buste, mélangés selon la hauteur. Garde dans `hit` le
// pire point (bras de levier, normale sortante dans le repère du rig).
function probe(h: Hull, R: Rest, qP: THREE.Quaternion, qC: THREE.Quaternion, pt: THREE.Vector3, rad: number): void {
  pH.copy(shH).add(pt);
  lP.copy(pH).applyQuaternion(qPi).add(R.pos.Hips);
  lC.copy(pH).sub(sp2).applyQuaternion(qCi).add(R.pos.Spine2);
  const b = Math.max(0, Math.min(1, (lP.y - R.pos.Hips.y) / (R.pos.Spine2.y - R.pos.Hips.y)));
  lP.lerp(lC, b);
  const dx = lP.x - h.cx, dz = lP.z - h.cz, dist = Math.hypot(dx, dz);
  const need = hullRadius(h, lP.y, Math.atan2(dx, dz));
  if (!need || dist < 1e-6) return;
  // Le bras s'appuie sur le flanc (chairs qui se touchent) : il peut y entrer des deux tiers de son épaisseur, pas plus ;
  // l'écarter davantage le mettait en pingouin sur les corps ronds.
  const depth = need + (1 - ARM_PRESS) * rad - dist;
  if (depth <= hit.depth) return;
  hit.depth = depth;
  hit.lever.copy(pt);
  hit.n.set(dx / dist, 0, dz / dist).applyQuaternion(qR.slerpQuaternions(qP, qC, b));
}
// Chaque bras tourne autour de l'épaule (rotation d'un bloc : le coude garde son angle) jusqu'à sortir de l'enveloppe,
// ARM_MAX au plus.
function clearArms(h: Hull, R: Rest, W: Rec<THREE.Quaternion>, qP: THREE.Quaternion, qC: THREE.Quaternion): void {
  qPi.copy(qP).invert();
  qCi.copy(qC).invert();
  q13.slerpQuaternions(qP, qC, 1 / 3);
  q23.slerpQuaternions(qP, qC, 2 / 3);
  // Hanches → Spine2 posé (comme la colonne d'applyPose).
  sp2.copy(R.spine[0]).applyQuaternion(qP).add(vA.copy(R.spine[1]).applyQuaternion(q13)).add(vA.copy(R.spine[2]).applyQuaternion(q23));
  const binOf = (t: number): number => h.arm[Math.min(ARM_BINS - 1, Math.floor(t * ARM_BINS))]!;
  for (const s of SIDES) {
    const U = armUp[s], L = armLow[s], lu = h.up[s], lf = h.fore[s], tot = lu + lf;
    shH.copy(R.pos[ARMS[s].up]).sub(R.pos.Spine2).applyQuaternion(qC).add(sp2);
    let total = 0;
    for (let it = 0; it < 4; it++) {
      hit.depth = 0;
      // Coude, milieu de l'avant-bras, poignet, paume, bout des doigts.
      probe(h, R, qP, qC, pR.copy(U).multiplyScalar(lu), binOf(lu / tot));
      probe(h, R, qP, qC, pR.copy(U).multiplyScalar(lu).addScaledVector(L, 0.5 * lf), binOf((lu + 0.5 * lf) / tot));
      probe(h, R, qP, qC, pR.copy(U).multiplyScalar(lu).addScaledVector(L, lf), binOf(0.99));
      probe(h, R, qP, qC, pR.copy(U).multiplyScalar(lu).addScaledVector(L, lf + 0.5 * h.handLen), h.hand);
      probe(h, R, qP, qC, pR.copy(U).multiplyScalar(lu).addScaledVector(L, lf + h.handLen), 0.6 * h.hand);
      if (hit.depth <= 0) break;
      const lever = hit.lever.length();
      axisV.crossVectors(hit.lever, hit.n);
      if (axisV.lengthSq() < 1e-12 || lever < 1e-6) break;
      const a = Math.min(ARM_MAX - total, Math.asin(Math.min(1, hit.depth / lever)) + 0.004);
      if (a <= 0) break;
      total += a;
      qR.setFromAxisAngle(axisV.normalize(), a);
      U.applyQuaternion(qR);
      L.applyQuaternion(qR);
      W[ARMS[s].up].premultiply(qR);
      W[ARMS[s].low].premultiply(qR);
    }
  }
}

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
  // Marche : genou recalé (voir walkKnee), phase de chaque jambe retrouvée dans la pose (jambe 0 : ph, jambe 1 : ph + π).
  const ph = walkPhase(pose, gait);
  for (const s of SIDES) {
    const leg = s === 'Left' ? legL : legR;
    const k = LEGS[s];
    let ankle: V3 = leg.ankle, toe: V3 = leg.toe;
    if (ph !== null) {
      retimeLeg(leg, leg === pose.legs[0] ? ph : ph + Math.PI, Math.abs(pose.fr.F[2]), WALK_AMP[gait!]!, pose.fr.F, s);
      ankle = ankleW[s];
      toe = toeW[s];
    }
    limb(R, W, k.up, k.leg, leg.hip, leg.knee, ankle);
    vA.copy(X).applyQuaternion(qT);
    align(R.dir[k.foot], X, diff(vB, ankle, toe), vA, qT);
    W[k.foot].multiplyQuaternions(qT, R.W[k.foot]);
    lowRel[s] = vA.copy(R.hipOff[s]).applyQuaternion(qP).y + vT.y * R.thigh[s] + vS.y * R.shin[s];
  }
  // Bras : épaule → coude → main dans le plan du pantin (coude derrière) ; repli pour un bras tendu : derrière et en bas.
  vFb.set(0, -0.5, -1).applyQuaternion(qC);
  for (const s of SIDES) {
    const arm = s === 'Left' ? armL : armR;
    limb(R, W, ARMS[s].up, ARMS[s].low, arm.sh, arm.elb, arm.hand);
    armUp[s].copy(vT);
    armLow[s].copy(vS);
  }
  // Bras tenus hors du tronc habillé (enveloppe mesurée une fois par rig, d'habitude dès l'habillage : prepareHull).
  prepareHull(m, rig);
  if (m.hull) clearArms(m.hull, R, W, qP, qC);

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
