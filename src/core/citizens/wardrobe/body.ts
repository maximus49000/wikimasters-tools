// Analyse du corps (squelette Mixamo, pose de liaison en T, devant = +z, gauche = +x, pieds à y = 0) et outils communs
// des pièces : maillage skinné lié au squelette du corps, lissage des normales, mesures du corps au repos.
import * as THREE from 'three';
import { toon, type Motif } from './materials';

// Os dont la garde-robe a besoin (sans préfixe) ; `analyse` refuse un squelette où il en manque un.
export const JOINTS = [
  'Hips', 'Spine', 'Spine2', 'Neck', 'Head', 'LeftArm', 'RightArm', 'LeftHand', 'RightHand',
  'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot',
] as const;
export type JointName = (typeof JOINTS)[number];

export type Part = 'hand' | 'arm' | 'shoulder' | 'leg' | 'foot' | 'head' | 'neck' | 'torso';
// Relevé d'un sommet du corps : position au repos, membre de l'os dominant, avancement le long du bras (0 = épaule,
// 1 = poignet) et de la jambe (0 = hanche, 1 = cheville), prolongés hors du membre.
export type VertexInfo = { x: number; y: number; z: number; part: Part; armT: number; legT: number };

// Champ du crâne (rayon max par direction depuis le centre mesuré de la tête).
export type Skull = { c: THREE.Vector3; R: (az: number, el: number) => number; top: number; low: number; size: number };

export type BodyInfo = {
  body: THREE.SkinnedMesh;
  /** Articulations en pose de liaison (noms sans préfixe `mixamorig`). */
  J: Record<JointName, THREE.Vector3> & Partial<Record<string, THREE.Vector3>>;
  /** Hauteur du corps (pieds à y = 0). */
  H: number;
  waistY: number;
  collarY: number;
  info: VertexInfo[];
  /** Indice de chaque os dans `body.skeleton.bones`. */
  idx: Record<JointName, number> & Partial<Record<string, number>>;
  names: string[];
  /** Facteur d'aisance des vêtements (défaut 1) : > 1 pour les corps aux courbes fortes, dont la peau ressortirait. */
  ease?: number;
  /** Teinte de peau (bras nus posés sur le tee-shirt du corps de base). */
  skin?: string;
  /** Crâne mesuré, calculé à la première coiffure. */
  skull?: Skull;
};

export type Attr = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
// Composante k d'un attribut (getComponent n'existe pas sur les attributs entrelacés que peut produire le chargeur glTF).
export const comp = (a: Attr, i: number, k: number): number => (k === 0 ? a.getX(i) : k === 1 ? a.getY(i) : k === 2 ? a.getZ(i) : a.getW(i));

// Noms d'os : `mixamorigHips` (glTF, deux-points retirés), `mixamorig:Hips` (FBX) ou `Hips`.
export const boneName = (n: string): string => n.replace(/^mixamorig:?/, '');

export function analyse(body: THREE.SkinnedMesh): BodyInfo {
  const g = body.geometry, sk = body.skeleton;
  const P = g.attributes.position!, SI = g.attributes.skinIndex!, SW = g.attributes.skinWeight!;
  const names = sk.bones.map((b) => boneName(b.name));
  const idx: Record<string, number> = Object.fromEntries(names.map((n, i) => [n, i]));
  const J: Record<string, THREE.Vector3> = {};
  sk.bones.forEach((_b, i) => { J[names[i]!] = new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[i]!.clone().invert()); });
  const missing = JOINTS.filter((n) => !J[n]);
  if (missing.length) throw new Error(`Squelette incomplet : ${missing.join(', ')}`);
  const JJ = J as BodyInfo['J'];
  let top = 0;
  for (let i = 0; i < P.count; i++) top = Math.max(top, P.getY(i));
  const H = top; // hauteur du corps (pieds à y = 0)
  const waistY = JJ.Hips.y + 0.3 * (JJ.Spine2.y - JJ.Hips.y);
  const collarY = JJ.Neck.y + 0.15 * (JJ.Head.y - JJ.Neck.y);
  const info = new Array<VertexInfo>(P.count);
  for (let i = 0; i < P.count; i++) {
    let best = -1, bw = 0;
    for (let k = 0; k < 4; k++) { const w = comp(SW, i, k); if (w > bw) { bw = w; best = comp(SI, i, k); } }
    const name = names[best] ?? '';
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const side = x >= 0 ? 'Left' : 'Right';
    const part: Part = /Hand/.test(name) ? 'hand' : /ForeArm|Arm$/.test(name) ? 'arm' : /Shoulder/.test(name) ? 'shoulder' : /UpLeg|Leg$/.test(name) ? 'leg' : /Foot|Toe/.test(name) ? 'foot' : /Head/.test(name) ? 'head' : /Neck/.test(name) ? 'neck' : 'torso';
    // Position le long du bras (0 = épaule, 1 = poignet) et de la jambe (0 = hanche, 1 = cheville).
    const a0 = JJ[`${side}Arm`], a1 = JJ[`${side}Hand`];
    const armT = (Math.abs(x) - Math.abs(a0.x)) / (Math.abs(a1.x) - Math.abs(a0.x));
    const l0 = JJ[`${side}UpLeg`], l1 = JJ[`${side}Foot`];
    const legT = (l0.y - y) / (l0.y - l1.y);
    info[i] = { x, y, z, part, armT, legT };
  }
  return { body, J: JJ, H, waistY, collarY, info, idx: idx as BodyInfo['idx'], names };
}

// Lissage des normales (les plis sculptés du corps, recopiés dans la coque, laissaient des traits d'ombre et de contour) ;
// les positions ne bougent pas (sinon le corps ressort au travers). Normales renormalisées à chaque passe.
export function smooth(pos: number[], ind: number[], iters: number): void {
  const n = pos.length / 3, nb = Array.from({ length: n }, () => new Set<number>());
  for (let k = 0; k < ind.length; k += 3) {
    const a = ind[k]!, b = ind[k + 1]!, c = ind[k + 2]!;
    nb[a]!.add(b).add(c); nb[b]!.add(a).add(c); nb[c]!.add(a).add(b);
  }
  const lists = nb.map((s) => [...s]);
  for (let it = 0; it < iters; it++) {
    const out = pos.slice();
    for (let i = 0; i < n; i++) {
      const L = lists[i]!;
      if (L.length < 3) continue;
      let x = 0, y = 0, z = 0;
      for (const j of L) { x += pos[j * 3]!; y += pos[j * 3 + 1]!; z += pos[j * 3 + 2]!; }
      out[i * 3] = pos[i * 3]! * 0.5 + (x / L.length) * 0.5;
      out[i * 3 + 1] = pos[i * 3 + 1]! * 0.5 + (y / L.length) * 0.5;
      out[i * 3 + 2] = pos[i * 3 + 2]! * 0.5 + (z / L.length) * 0.5;
    }
    for (let i = 0; i < n; i++) {
      const l = Math.hypot(out[i * 3]!, out[i * 3 + 1]!, out[i * 3 + 2]!) || 1;
      pos[i * 3] = out[i * 3]! / l; pos[i * 3 + 1] = out[i * 3 + 1]! / l; pos[i * 3 + 2] = out[i * 3 + 2]! / l;
    }
  }
}

// Maillage skinné lié au squelette du corps (même instance de `Skeleton`, même matrice de liaison).
export function skinned(
  A: BodyInfo, pos: number[], nor: number[] | null, si: number[], sw: number[], ind: number[], color: string,
  side?: THREE.Side, pattern?: Motif | null,
): THREE.SkinnedMesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nor) geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(ind);
  if (!nor) geo.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(geo, toon(color, side, pattern ?? null));
  if (!geo.attributes.bindPos) geo.setAttribute('bindPos', geo.attributes.position!.clone());
  mesh.bind(A.body.skeleton, A.body.bindMatrix);
  mesh.frustumCulled = false;
  return mesh;
}

// Géométrie quelconque liée à 100 % à un seul os (coiffures rapportées, accessoires rigides).
export function rigid(A: BodyInfo, g: THREE.BufferGeometry, bone: number, color: string, side?: THREE.Side): THREE.SkinnedMesh {
  const P = g.attributes.position!, si: number[] = [], sw: number[] = [];
  for (let i = 0; i < P.count; i++) { si.push(bone, 0, 0, 0); sw.push(1, 0, 0, 0); }
  const ind = g.index ? Array.from(g.index.array) : Array.from({ length: P.count }, (_, i) => i);
  return skinned(A, Array.from(P.array as ArrayLike<number>), null, si, sw, ind, color, side);
}

// Encombrement du corps au repos dans une tranche de hauteur (membres choisis) : pour poser les accessoires sur la peau.
export type Slab = { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number; n: number };
export function slab(A: BodyInfo, y0: number, y1: number, keep: (v: VertexInfo) => boolean): Slab {
  const s: Slab = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, maxY: -Infinity, n: 0 };
  for (const v of A.info) {
    if (v.y < y0 || v.y > y1 || !keep(v)) continue;
    s.minX = Math.min(s.minX, v.x); s.maxX = Math.max(s.maxX, v.x);
    s.minZ = Math.min(s.minZ, v.z); s.maxZ = Math.max(s.maxZ, v.z);
    s.maxY = Math.max(s.maxY, v.y); s.n++;
  }
  return s;
}
