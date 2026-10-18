// Accessoires portés : objets rigides liés à 100 % à un os (ils suivent le dos, le bassin ou la main sans se déformer).
// Posés en pose de liaison (en T) : la main droite pointe vers −x, donc un objet « tenu » s'allonge vers −x depuis le
// poing ; quand le bras retombe le long du corps, il pend vers le sol. Sangles et pans : tubes qui longent la peau
// mesurée du corps au repos (ils ne traversent pas le torse).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rigid, slab, type BodyInfo, type VertexInfo } from './body';
import { toon } from './materials';

export const ACCESSORIES = ['sac-a-dos', 'sac', 'mallette', 'ballon', 'echarpe', 'parapluie'] as const;
export type AccessoryName = (typeof ACCESSORIES)[number];

const darker = (c: string, k = 0.7): string => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
const trunk = (v: VertexInfo) => v.part === 'torso' || v.part === 'shoulder' || v.part === 'neck';
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// Devant / dos du torse au repos autour de (x, y) ; à défaut de sommets proches, le repère du thorax.
function frontAt(A: BodyInfo, x: number, y: number): number {
  const d = 0.02 * A.H, s = slab(A, y - d, y + d, (v) => trunk(v) && Math.abs(v.x - x) < d);
  return s.n ? s.maxZ : A.J.Spine2.z + 0.06 * A.H;
}
function backAt(A: BodyInfo, x: number, y: number): number {
  const d = 0.02 * A.H, s = slab(A, y - d, y + d, (v) => trunk(v) && Math.abs(v.x - x) < d);
  return s.n ? s.minZ : A.J.Spine2.z - 0.06 * A.H;
}
// Haut de l'épaule au repos à l'aplomb de x.
function shoulderTop(A: BodyInfo, x: number): number {
  const d = 0.015 * A.H, s = slab(A, A.J.Spine2.y, A.J.Head.y, (v) => (v.part === 'torso' || v.part === 'shoulder') && Math.abs(v.x - x) < d);
  return s.n ? s.maxY : A.J.Neck.y;
}
const strap = (A: BodyInfo, pts: THREE.Vector3[], r: number, color: string, bone: number, closed = false): THREE.SkinnedMesh =>
  rigid(A, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), Math.max(12, pts.length * 8), r, 8, closed), bone, color);
const rbox = (w: number, h: number, d: number, round: number, at: THREE.Vector3): THREE.BufferGeometry => {
  const g = new RoundedBoxGeometry(w, h, d, 3, round);
  g.translate(at.x, at.y, at.z);
  return g;
};

// Sac à dos : boîte arrondie plaquée dans le dos, deux bretelles qui passent sur les épaules. Tout sur Spine2.
function sacADos(A: BodyInfo, color: string): THREE.SkinnedMesh[] {
  const H = A.H, sp = A.J.Spine2, bone = A.idx.Spine2;
  const w = 0.17 * H, h = 0.22 * H, d = 0.08 * H, gap = 0.02 * H;
  const bs = slab(A, sp.y - 0.08 * H, sp.y + 0.04 * H, (v) => trunk(v) && Math.abs(v.x - sp.x) < w / 2);
  const back = bs.n ? bs.minZ : sp.z - 0.06 * H;
  const cy = sp.y - 0.03 * H;
  const out = [rigid(A, rbox(w, h, d, 0.025 * H, V(sp.x, cy, back - gap - d / 2)), bone, color)];
  // Poche avant : petite boîte sur la face extérieure.
  out.push(rigid(A, rbox(w * 0.7, h * 0.35, d * 0.35, 0.012 * H, V(sp.x, cy - h * 0.22, back - gap - d - d * 0.12)), bone, darker(color, 0.85)));
  for (const s of [1, -1]) {
    const x = sp.x + s * 0.055 * H, top = shoulderTop(A, x), y1 = sp.y - 0.04 * H, g = 0.012 * H;
    const pts = [
      V(x, cy + h * 0.4, back - gap),
      V(x, top - 0.01 * H, backAt(A, x, top - 0.01 * H) - g),
      V(x, top + g, (backAt(A, x, top - 0.01 * H) + frontAt(A, x, top - 0.01 * H)) / 2),
      V(x, top - 0.02 * H, frontAt(A, x, top - 0.02 * H) + g),
      V(x, (top + y1) / 2, frontAt(A, x, (top + y1) / 2) + g),
      V(x, y1, frontAt(A, x, y1) + g),
    ];
    out.push(strap(A, pts, 0.006 * H, darker(color), bone));
  }
  return out;
}

// Sac en bandoulière : sac sur la hanche droite (lié au bassin), sangle en travers du buste jusqu'à l'épaule gauche (Spine2).
function sac(A: BodyInfo, color: string): THREE.SkinnedMesh[] {
  const H = A.H, hp = A.J.Hips;
  const hs = slab(A, hp.y - 0.05 * H, hp.y + 0.03 * H, (v) => v.part === 'torso' || v.part === 'leg');
  const side = hs.n ? hs.minX : hp.x - 0.1 * H;
  const t = 0.04 * H, w = 0.15 * H, h = 0.12 * H;
  const c = V(side - 0.025 * H - t / 2, hp.y - 0.02 * H, hp.z + 0.01 * H);
  const bag = rigid(A, rbox(t, h, w, 0.012 * H, c), A.idx.Hips, color);
  const flap = rigid(A, rbox(0.01 * H, h * 0.5, w * 1.02, 0.004 * H, V(c.x - t / 2 - 0.004 * H, c.y + h * 0.22, c.z)), A.idx.Hips, darker(color, 0.85));
  // Sangle : du haut du sac, devant le ventre et la poitrine, par-dessus l'épaule gauche, puis dans le dos.
  const g = 0.014 * H, sx = 0.06 * H, top = shoulderTop(A, sx);
  const across: [number, number][] = [[c.x * 0.75, hp.y + 0.06 * H], [c.x * 0.45, A.waistY + 0.03 * H], [0, A.J.Spine2.y - 0.04 * H], [sx * 0.7, A.J.Spine2.y + 0.05 * H], [sx, top - 0.02 * H]];
  const pts = [V(c.x, c.y + h / 2, c.z), ...across.map(([x, y]) => V(x, y, frontAt(A, x, y) + g)), V(sx, top + g, (frontAt(A, sx, top - 0.01 * H) + backAt(A, sx, top - 0.01 * H)) / 2)];
  const backPts: [number, number][] = [[sx, top - 0.02 * H], [sx * 0.2, A.J.Spine2.y], [c.x * 0.5, A.waistY + 0.03 * H], [c.x * 0.8, hp.y + 0.05 * H]];
  pts.push(...backPts.map(([x, y]) => V(x, y, backAt(A, x, y) - g)), V(c.x, c.y + h / 2, c.z - w * 0.3));
  return [bag, flap, strap(A, pts, 0.005 * H, darker(color), A.idx.Spine2)];
}

// Poing droit en pose de liaison : un peu au-delà du poignet, vers les doigts (−x).
const grip = (A: BodyInfo): THREE.Vector3 => A.J.RightHand.clone().add(V(-0.05 * A.H, 0, 0));

// Mallette : tenue par la poignée, elle pend le long de la jambe quand le bras retombe (hauteur le long de −x,
// largeur le long de z, épaisseur le long de y en pose de liaison).
function mallette(A: BodyInfo, color: string): THREE.SkinnedMesh[] {
  const H = A.H, p = grip(A), bone = A.idx.RightHand;
  const hh = 0.17 * H, th = 0.05 * H, w = 0.24 * H, top = p.x - 0.03 * H;
  const body = rigid(A, rbox(hh, th, w, 0.01 * H, V(top - hh / 2, p.y, p.z)), bone, color);
  // Poignée : demi-anneau dans le plan (x, z), sommet vers le poing.
  const g = new THREE.TorusGeometry(0.03 * H, 0.006 * H, 8, 16, Math.PI);
  g.rotateZ(-Math.PI / 2);
  g.rotateX(Math.PI / 2);
  g.translate(top, p.y, p.z);
  return [body, rigid(A, g, bone, darker(color, 0.6))];
}

// Ballon : tenu au bout des doigts, devant la main.
function ballon(A: BodyInfo, color: string): THREE.SkinnedMesh[] {
  const H = A.H, r = 0.065 * H, h = A.J.RightHand;
  const g = new THREE.SphereGeometry(r, 20, 14);
  g.translate(h.x - 0.05 * H, h.y - 0.01 * H, h.z + r);
  return [rigid(A, g, A.idx.RightHand, color)];
}

// Écharpe : anneau épais autour du cou (lié au cou) et pan qui tombe sur la poitrine (lié au thorax).
function echarpe(A: BodyInfo, color: string): THREE.SkinnedMesh[] {
  const H = A.H, n = A.J.Neck;
  // Tour de cou mesuré sur les seuls sommets du cou, au tiers de sa hauteur (plus bas, on attrape les trapèzes).
  const y = n.y + 0.35 * (A.J.Head.y - n.y);
  let rx = 0, rz = 0;
  for (const v of A.info) {
    if (Math.abs(v.y - y) > 0.015 * H || v.part !== 'neck') continue;
    const dx = v.x - n.x, dz = v.z - n.z;
    if (Math.hypot(dx, dz) > 0.06 * H) continue;
    rx = Math.max(rx, Math.abs(dx)); rz = Math.max(rz, Math.abs(dz));
  }
  rx = Math.max(rx, 0.025 * H); rz = Math.max(rz, 0.025 * H);
  const t = 0.02 * H, gap = t + 0.006 * H;
  const ring: THREE.Vector3[] = [];
  for (let k = 0; k < 16; k++) { const a = (k / 16) * 2 * Math.PI; ring.push(V(n.x + (rx + gap) * Math.sin(a), y, n.z + (rz + gap) * Math.cos(a))); }
  const x0 = n.x + 0.035 * H, g = 0.022 * H;
  const fall: [number, number][] = [[x0 + 0.005 * H, y - 0.06 * H], [x0 + 0.01 * H, A.J.Spine2.y], [x0 + 0.012 * H, A.J.Spine2.y - 0.06 * H]];
  const end = [V(x0, y - 0.01 * H, n.z + rz + gap), ...fall.map(([x, yy]) => V(x, yy, frontAt(A, x, yy) + g))];
  return [strap(A, ring, t, color, A.idx.Neck, true), strap(A, end, 0.016 * H, color, A.idx.Spine2)];
}

// Parapluie fermé : crosse dans le poing, manche et toile roulée qui pendent vers le sol quand le bras retombe.
function parapluie(A: BodyInfo, color: string): THREE.SkinnedMesh[] {
  const H = A.H, p = grip(A), bone = A.idx.RightHand;
  const xs = p.x + 0.03 * H, len = 0.45 * H;
  const shaft = new THREE.CylinderGeometry(0.005 * H, 0.005 * H, len, 8);
  shaft.rotateZ(Math.PI / 2);
  shaft.translate(xs - len / 2, p.y, p.z);
  // Toile roulée : fuseau plus épais vers le haut, autour du manche (profil tourné autour de l'axe y, puis basculé vers −x).
  const prof: THREE.Vector2[] = [];
  const a = 0.1 * H, b = 0.42 * H;
  for (let k = 0; k <= 16; k++) {
    const s = k / 16;
    prof.push(new THREE.Vector2(0.006 * H + 0.024 * H * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.6)), 0.8), a + (b - a) * s));
  }
  const canopy = new THREE.LatheGeometry(prof, 16);
  canopy.rotateZ(Math.PI / 2);
  canopy.translate(xs, p.y, p.z);
  // Crosse : demi-anneau dans le plan (x, z), qui part du haut du manche et revient vers le bas.
  const r = 0.025 * H;
  const crook = new THREE.TorusGeometry(r, 0.006 * H, 8, 16, Math.PI);
  crook.applyMatrix4(new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  crook.translate(xs, p.y, p.z + r);
  return [rigid(A, shaft, bone, '#3A3A3A'), rigid(A, canopy, bone, color), rigid(A, crook, bone, '#6B4A2E')];
}

/** Couleur de la toile quand l'habitant n'a pas de parapluie à lui (celle du pantin 2D). */
export const PARAPLUIE_DEFAUT = '#C0392B';

// Parapluie ouvert (pluie) : PAS lié au squelette — il reste vertical quel que soit le poignet, comme celui du pantin 2D
// (manche de 11 unités au-dessus de la main, toile en dôme de rayon 9,5 pour 37,5 de haut). Origine = poing (bas du
// manche), manche vers +y, en unités du modèle ; l'appelant le pose à la main droite à chaque image. Toile à 8 pans.
export function parapluieOuvert(A: BodyInfo, color: string): THREE.Group {
  const k = A.H / 37.5; // unités du pantin → unités du modèle
  const top = 11 * k;
  const g = new THREE.Group();
  g.name = 'parapluie-ouvert';
  const shaft = new THREE.CylinderGeometry(0.22 * k, 0.22 * k, top + 4.2 * k, 8);
  shaft.translate(0, (top + 4.2 * k) / 2 - 0.6 * k, 0);
  // Profil de la toile (rayon, hauteur au-dessus du haut du manche) : bord, mi-hauteur, haut, sommet — anneaux du 2D.
  const prof = [[9.5, -1.2], [8.8, 0.3], [7.5, 1.6], [4, 3.0], [0.01, 3.6]].map(([r, y]) => new THREE.Vector2(r! * k, top + y! * k));
  const canopy = new THREE.LatheGeometry(prof, 8);
  // Crosse : demi-anneau sous le poing.
  const r = 0.9 * k;
  const crook = new THREE.TorusGeometry(r, 0.25 * k, 6, 12, Math.PI);
  crook.rotateZ(Math.PI);
  crook.translate(r, -0.6 * k, 0);
  g.add(new THREE.Mesh(shaft, toon('#3A3A3A')), new THREE.Mesh(canopy, toon(color)), new THREE.Mesh(crook, toon('#6B4A2E')));
  return g;
}

export function accessory(A: BodyInfo, what: string, color: string): THREE.SkinnedMesh[] {
  switch (what) {
    case 'sac-a-dos': return sacADos(A, color);
    case 'sac': return sac(A, color);
    case 'mallette': return mallette(A, color);
    case 'ballon': return ballon(A, color);
    case 'echarpe': return echarpe(A, color);
    case 'parapluie': return parapluie(A, color);
    default: return [];
  }
}
