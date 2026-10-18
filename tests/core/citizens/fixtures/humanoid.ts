// Corps synthétique pour les tests des habitants 3D : adulte de 1,70 m en pose de liaison en T, squelette aux noms
// Mixamo (préfixe au choix, comme les modèles AutoSprite), devant = +z, gauche = +x, pieds à y = 0.
// Fait de capsules, d'une sphère (tête) et de boîtes (pieds), ~2 800 sommets, géométrie indexée avec normales.
// Poids de peau : chaque primitive suit sa chaîne d'os, avec un fondu autour des articulations.
import * as THREE from 'three';

type Os = { nom: string; parent: string | null; pos: [number, number, number] };

// Articulations en coordonnées du monde (pose de liaison).
const OS: Os[] = [
  { nom: 'Hips', parent: null, pos: [0, 0.95, 0] },
  { nom: 'Spine', parent: 'Hips', pos: [0, 1.05, 0] },
  { nom: 'Spine1', parent: 'Spine', pos: [0, 1.15, 0] },
  { nom: 'Spine2', parent: 'Spine1', pos: [0, 1.27, 0] },
  { nom: 'Neck', parent: 'Spine2', pos: [0, 1.45, 0] },
  { nom: 'Head', parent: 'Neck', pos: [0, 1.53, 0] },
  { nom: 'HeadTop_End', parent: 'Head', pos: [0, 1.72, 0] },
  ...(['Left', 'Right'] as const).flatMap((s): Os[] => {
    const k = s === 'Left' ? 1 : -1;
    return [
      { nom: `${s}Shoulder`, parent: 'Spine2', pos: [0.06 * k, 1.4, 0] },
      { nom: `${s}Arm`, parent: `${s}Shoulder`, pos: [0.18 * k, 1.4, 0] },
      { nom: `${s}ForeArm`, parent: `${s}Arm`, pos: [0.45 * k, 1.4, 0] },
      { nom: `${s}Hand`, parent: `${s}ForeArm`, pos: [0.7 * k, 1.4, 0] },
      { nom: `${s}UpLeg`, parent: 'Hips', pos: [0.09 * k, 0.9, 0] },
      { nom: `${s}Leg`, parent: `${s}UpLeg`, pos: [0.09 * k, 0.5, 0] },
      { nom: `${s}Foot`, parent: `${s}Leg`, pos: [0.09 * k, 0.08, 0] },
      { nom: `${s}ToeBase`, parent: `${s}Foot`, pos: [0.09 * k, 0.02, 0.12] },
    ];
  }),
];

// Poids le long d'une chaîne d'os (articulations successives) : os du segment le plus proche, fondu à 50/50 à l'articulation.
function chaine(p: THREE.Vector3, os: number[], at: THREE.Vector3[]): [number[], number[]] {
  let best = 0, bt = 0, bd = Infinity;
  for (let i = 0; i < at.length - 1; i++) {
    const a = at[i]!, b = at[i + 1]!, ab = b.clone().sub(a);
    const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
    const d = a.clone().addScaledVector(ab, t).distanceTo(p);
    if (d < bd - 1e-9) { bd = d; best = i; bt = t; }
  }
  // Dernier segment ouvert : au-delà de la dernière articulation, tout va au dernier os de la liste.
  const lo = os[best]!, hi = os[Math.min(best + 1, os.length - 1)]!;
  if (bt > 0.8 && best + 1 < os.length) { const w = (0.5 * (bt - 0.8)) / 0.2; return [[lo, hi], [1 - w, w]]; }
  if (bt < 0.2 && best > 0) { const w = (0.5 * (0.2 - bt)) / 0.2; return [[os[best - 1]!, lo], [w, 1 - w]]; }
  return [[lo], [1]];
}

export type HumanoidOptions = { prefix?: string };

export function makeHumanoid(opts: HumanoidOptions = {}): THREE.SkinnedMesh {
  const prefix = opts.prefix ?? 'mixamorig';
  const bones = new Map<string, THREE.Bone>();
  const world = new Map<string, THREE.Vector3>();
  for (const o of OS) {
    const b = new THREE.Bone();
    b.name = prefix + o.nom;
    const w = new THREE.Vector3(...o.pos);
    world.set(o.nom, w);
    if (o.parent) {
      b.position.copy(w.clone().sub(world.get(o.parent)!));
      bones.get(o.parent)!.add(b);
    } else b.position.copy(w);
    bones.set(o.nom, b);
  }
  const order = OS.map((o) => o.nom);
  const ix = (n: string): number => order.indexOf(n);
  const J = (n: string): THREE.Vector3 => world.get(n)!;

  const pos: number[] = [], nor: number[] = [], si: number[] = [], sw: number[] = [], ind: number[] = [];
  // Ajoute une primitive : poids donnés par `weigh(p)` (indices d'os, poids).
  const add = (g: THREE.BufferGeometry, weigh: (p: THREE.Vector3) => [number[], number[]]): void => {
    const P = g.attributes.position!, N = g.attributes.normal!, base = pos.length / 3;
    const p = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i);
      pos.push(p.x, p.y, p.z);
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      const [b, w] = weigh(p);
      for (let k = 0; k < 4; k++) { si.push(b[k] ?? 0); sw.push(w[k] ?? 0); }
    }
    const src = g.index!.array;
    for (let k = 0; k < src.length; k++) ind.push(src[k]! + base);
  };
  // Capsule entre deux points (axe quelconque), tournée à partir d'un profil : anneaux réguliers (`step`)
  // sur la partie droite (les coques sont découpées par hauteur, il leur faut des sommets partout).
  const capsule = (a: THREE.Vector3, b: THREE.Vector3, r: number, scale: [number, number, number] = [1, 1, 1], radial = 10, caps = 3, step = 0.05): THREE.BufferGeometry => {
    const len = Math.max(0.001, a.distanceTo(b) - 2 * r);
    const rings = Math.max(2, Math.round(len / step));
    const prof: THREE.Vector2[] = [];
    for (let k = 0; k <= caps; k++) { const t = -Math.PI / 2 + (k / caps) * (Math.PI / 2); prof.push(new THREE.Vector2(Math.max(1e-4, r * Math.cos(t)), -len / 2 + r * Math.sin(t))); }
    for (let k = 1; k < rings; k++) prof.push(new THREE.Vector2(r, -len / 2 + (k / rings) * len));
    for (let k = 0; k <= caps; k++) { const t = (k / caps) * (Math.PI / 2); prof.push(new THREE.Vector2(Math.max(1e-4, r * Math.cos(t)), len / 2 + r * Math.sin(t))); }
    const g = new THREE.LatheGeometry(prof, radial);
    g.scale(...scale);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    const m = a.clone().add(b).multiplyScalar(0.5);
    g.translate(m.x, m.y, m.z);
    return g;
  };
  const along = (names: string[]) => (p: THREE.Vector3): [number[], number[]] => chaine(p, names.map(ix), names.map(J));

  // Tronc : du bas du bassin au haut des épaules, ellipse plus large que profonde.
  const spine = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck'];
  add(capsule(new THREE.Vector3(0, 0.84, 0), new THREE.Vector3(0, 1.48, 0), 0.13, [1.3, 1, 0.85], 18, 5, 0.03), (p) => {
    // Haut des épaules : part de l'os d'épaule (la coque des hauts y passe comme sur les vrais modèles).
    if (p.y > 1.33 && Math.abs(p.x) > 0.09) return [[ix(p.x > 0 ? 'LeftShoulder' : 'RightShoulder'), ix('Spine2')], [0.6, 0.4]];
    return chaine(new THREE.Vector3(0, p.y, 0), spine.map(ix), spine.map(J));
  });
  // Cou et tête.
  add(capsule(new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(0, 1.58, 0), 0.05, [1, 1, 1], 14, 3, 0.03), along(['Neck', 'Head']));
  const head = new THREE.SphereGeometry(0.1, 28, 20);
  head.scale(0.9, 1.1, 1);
  head.translate(0, 1.615, 0.01);
  add(head, () => [[ix('Head')], [1]]);
  for (const s of ['Left', 'Right'] as const) {
    const k = s === 'Left' ? 1 : -1;
    // Bras : épaule → bras → avant-bras → main.
    add(capsule(J(`${s}Shoulder`), J(`${s}ForeArm`).clone().add(new THREE.Vector3(0.02 * k, 0, 0)), 0.048), along([`${s}Shoulder`, `${s}Arm`, `${s}ForeArm`]));
    add(capsule(J(`${s}ForeArm`).clone().add(new THREE.Vector3(-0.02 * k, 0, 0)), J(`${s}Hand`).clone().add(new THREE.Vector3(0.02 * k, 0, 0)), 0.038), along([`${s}Arm`, `${s}ForeArm`, `${s}Hand`]));
    add(capsule(J(`${s}Hand`), J(`${s}Hand`).clone().add(new THREE.Vector3(0.17 * k, 0, 0)), 0.03, [1, 0.6, 1.4], 8, 2), () => [[ix(`${s}Hand`)], [1]]);
    // Jambe : cuisse, mollet, pied (boîte posée au sol).
    add(capsule(J(`${s}UpLeg`).clone().add(new THREE.Vector3(0, 0.04, 0)), J(`${s}Leg`).clone().add(new THREE.Vector3(0, -0.02, 0)), 0.075), along(['Hips', `${s}UpLeg`, `${s}Leg`]));
    add(capsule(J(`${s}Leg`).clone().add(new THREE.Vector3(0, 0.02, 0)), J(`${s}Foot`).clone().add(new THREE.Vector3(0, -0.03, 0)), 0.052), along([`${s}UpLeg`, `${s}Leg`, `${s}Foot`]));
    const foot = new THREE.BoxGeometry(0.09, 0.08, 0.25, 3, 2, 8);
    foot.translate(0.09 * k, 0.04, 0.07);
    add(foot, (p) => (p.z > 0.1 ? [[ix(`${s}Foot`), ix(`${s}ToeBase`)], [0.3, 0.7]] : [[ix(`${s}Foot`)], [1]]));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(ind);
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshToonMaterial({ color: 0xdddddd }));
  const root = bones.get('Hips')!;
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(order.map((n) => bones.get(n)!));
  mesh.bind(skeleton);
  return mesh;
}
