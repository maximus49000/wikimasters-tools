// Accessoires portés : objets rigides liés à 100 % à un os (ils suivent le dos, le bassin ou la main sans se déformer),
// sauf la bandoulière, fondue du bassin au thorax. Posés en pose de liaison (en T) : la main droite pointe vers −x, donc
// un objet « tenu » s'allonge vers −x depuis le poing ; quand le bras retombe le long du corps, il pend vers le sol.
// Sangles et pans : tubes qui longent le corps HABILLÉ au repos (ils ne traversent ni le torse ni le tissu).
// Sacs : poches souples (toile qui pend), pas des boîtes.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rigid, skinned, slab, type BodyInfo, type VertexInfo } from './body';
import { toon } from './materials';

export const ACCESSORIES = ['sac-a-dos', 'sac', 'mallette', 'ballon', 'echarpe', 'parapluie'] as const;
export type AccessoryName = (typeof ACCESSORIES)[number];

const darker = (c: string, k = 0.7): string => '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
const trunk = (v: VertexInfo) => v.part === 'torso' || v.part === 'shoulder' || v.part === 'neck';
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// Colonne au repos à la hauteur y (bassin → thorax → cou) : sépare le devant du dos du torse.
function spineZ(A: BodyInfo, y: number): number {
  const { Hips: a, Spine2: b, Neck: c } = A.J;
  if (y <= b.y) return a.z + (b.z - a.z) * Math.min(1, Math.max(0, (y - a.y) / (b.y - a.y)));
  return b.z + (c.z - b.z) * Math.min(1, (y - b.y) / (c.y - b.y));
}
// Devant (side = 1) / dos (side = −1) du torse au repos autour de (x, y) : seuls les sommets de CE côté de la colonne
// comptent (là où le maillage est lâche, un dos sans sommet proche renvoyait le devant et la sangle traversait le
// buste) ; fenêtre élargie s'il n'y en a pas ; à défaut, le repère du thorax.
function surfaceAt(A: BodyInfo, x: number, y: number, side: 1 | -1): number {
  const c = spineZ(A, y);
  for (const k of [1, 2, 3]) {
    const d = 0.03 * A.H * k, s = slab(A, y - d, y + d, (v) => trunk(v) && Math.abs(v.x - x) < d && (v.z - c) * side > 0);
    if (s.n) return side > 0 ? s.maxZ : s.minZ;
  }
  return c + side * 0.06 * A.H;
}
const frontAt = (A: BodyInfo, x: number, y: number): number => surfaceAt(A, x, y, 1);
const backAt = (A: BodyInfo, x: number, y: number): number => surfaceAt(A, x, y, -1);
// Passage par-dessus l'épaule à l'aplomb de x : demi-tour du devant (angle 0) au dos (π) autour d'un centre pris sous le
// haut de l'épaule ; dans chaque secteur, le sommet le plus éloigné du centre (corps et tissu) + l'écart `g`. La sangle
// épouse ainsi l'arrondi de l'épaule au lieu de couper son coin. `y` : hauteur du centre (où s'arrêtent devant et dos).
function overShoulder(A: BodyInfo, x: number, top: number, g: number): { y: number; pts: THREE.Vector3[] } {
  const cy = top - 0.05 * A.H, cz = (frontAt(A, x, cy) + backAt(A, x, cy)) / 2, N = 16;
  const R = new Array<number>(N + 1).fill(0);
  for (const v of A.info) {
    if (Math.abs(v.x - x) > 0.02 * A.H || v.y < cy - 0.01 * A.H || v.y > top + 0.005 * A.H || v.part === 'arm' || v.part === 'hand' || v.part === 'head') continue;
    if ((v.part === 'neck' || v.y > cy + 0.02 * A.H) && !nearShoulder(A, v, x)) continue;
    const dy = v.y - cy, dz = v.z - cz, k = Math.round((Math.atan2(dy, dz) / Math.PI) * N);
    if (k >= 0 && k <= N) R[k] = Math.max(R[k]!, Math.hypot(dy, dz));
  }
  // Secteur vide : le plus grand des voisins.
  for (let k = 0; k <= N; k++) if (!R[k]) R[k] = Math.max(R[k - 1] ?? 0, R[k + 1] ?? 0, 0.03 * A.H);
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= N; k++) {
    const t = (k / N) * Math.PI, r = R[k]! + g;
    pts.push(V(x, cy + r * Math.sin(t), cz + r * Math.cos(t)));
  }
  return { y: cy, pts };
}
// Haut de l'épaule au repos à l'aplomb de x.
// Tissu compris, mais pas l'encolure qui remonte le long du cou : seulement jusqu'à 3 % de H au-dessus de la peau.
// Fenêtre tournée vers l'épaule (un peu côté cou, surtout côté bras) : le trapèze compte (pris par l'os du cou chez
// certains modèles voûtés), le cylindre du cou plus près du milieu non.
const nearShoulder = (A: BodyInfo, v: VertexInfo, x: number): boolean => {
  const dx = (v.x - x) * Math.sign(x || 1);
  return dx > -0.007 * A.H && dx < 0.015 * A.H;
};
function shoulderTop(A: BodyInfo, x: number): number {
  const keep = (v: VertexInfo): boolean => (v.part === 'torso' || v.part === 'shoulder' || v.part === 'neck') && nearShoulder(A, v, x);
  const skin = slab(A, A.J.Spine2.y, A.J.Head.y, (v) => !v.cloth && keep(v));
  if (!skin.n) return A.J.Neck.y;
  return slab(A, A.J.Spine2.y, skin.maxY + 0.03 * A.H, keep).maxY;
}
const strap = (A: BodyInfo, pts: THREE.Vector3[], r: number, color: string, bone: number, closed = false): THREE.SkinnedMesh =>
  rigid(A, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), Math.max(12, pts.length * 8), r, 8, closed), bone, color);

// Boîte aux coins ronds, maillée régulièrement PARTOUT (super-ellipsoïde tirée d'une sphère : chaque coordonnée unité
// élevée à la puissance `round`, 1 = ellipsoïde, → 0 = boîte) : les déformations ci-dessous courbent aussi le milieu des
// faces (une RoundedBoxGeometry n'a de sommets qu'aux arrondis, ses faces restaient planes). Sommets fusionnés : normales
// lisses, pas d'arête de boîte au rendu toon. Dimensions sx, sy, sz centrées sur l'origine.
function softBox(sx: number, sy: number, sz: number, round: number): THREE.BufferGeometry {
  const g0 = new THREE.SphereGeometry(1, 32, 20);
  g0.deleteAttribute('normal');
  g0.deleteAttribute('uv');
  const g = mergeVertices(g0);
  g0.dispose();
  const P = g.attributes.position!;
  const f = (c: number, s: number): number => (Math.sign(c) * Math.pow(Math.abs(c), round) * s) / 2;
  for (let i = 0; i < P.count; i++) P.setXYZ(i, f(P.getX(i), sx), f(P.getY(i), sy), f(P.getZ(i), sz));
  return g;
}

// Poche souple (sac, sac à dos, mallette) : boîte très arrondie puis déformée comme un sac de toile qui pend — plus
// mince en haut, ventrue en bas, coins du bas arrondis, fond affaissé au milieu. Épaisseur le long de x (côté extérieur
// +x), hauteur le long de y, largeur le long de z ; centrée sur l'origine. `taper` : épaisseur du haut / du bas ;
// `sag` : affaissement du fond (fraction de h) ; `round` : arrondi des coins (exposant de softBox).
type PouchOpts = { taper?: number; sag?: number; round?: number };
export function pouch(d: number, h: number, w: number, { taper = 0.5, sag = 0.08, round = 0.35 }: PouchOpts = {}): THREE.BufferGeometry {
  const g = softBox(d, h, w, round);
  const P = g.attributes.position!;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const { fx, fz, dy } = pouchAt(y / h, z / w, taper, sag);
    P.setXYZ(i, x * fx, y - dy * h, z * fz);
  }
  g.computeVertexNormals();
  return g;
}
// Déformation de la poche à la hauteur relative yr (−½ en bas, ½ en haut) et à la largeur relative zr (−½…½) :
// facteurs d'épaisseur et de largeur, descente du fond. Partagée par le rabat, qui épouse ainsi la face extérieure.
// L'épaisseur moyenne est conservée (`d` reste l'épaisseur annoncée), le bas en a plus que le haut.
export function pouchAt(yr: number, zr: number, taper: number, sag: number): { fx: number; fz: number; dy: number } {
  const s = Math.min(1, Math.max(0, 0.5 - yr)); // 0 en haut, 1 en bas
  const z2 = Math.min(1, 4 * zr * zr);
  const low = Math.max(0, (s - 0.55) / 0.45);
  const k = 2 / (1 + taper);
  return { fx: k * (taper + (1 - taper) * Math.sqrt(s)), fz: (0.94 + 0.08 * s) * (1 - 0.22 * low * low), dy: sag * s * s * (1 - z2) };
}
// Rabat : plaque mince posée sur la face extérieure de la poche (mêmes déformations), qui couvre `cover` de sa hauteur
// depuis le haut et s'arrondit en bas (bord en U). Même repère que `pouch` ; `t` = épaisseur du rabat.
function flap(d: number, h: number, w: number, t: number, cover: number, opts: PouchOpts = {}): THREE.BufferGeometry {
  const { taper = 0.5, sag = 0.08 } = opts;
  const hf = h * cover, wf = w * 1.03;
  const g = softBox(t, hf, wf, 0.3);
  const P = g.attributes.position!;
  for (let i = 0; i < P.count; i++) {
    const xl = P.getX(i), yl = P.getY(i), zl = P.getZ(i);
    const sf = Math.min(1, Math.max(0, 0.5 - yl / hf)); // 0 en haut du rabat, 1 en bas
    const y = h / 2 - hf / 2 + yl + t / 2;
    const u = Math.max(0, (sf - 0.35) / 0.65);
    const zr = (zl / wf) * (1 - 0.42 * u * u);
    const { fx, fz, dy } = pouchAt(y / h, zr, taper, sag);
    // Face extérieure de la poche à cette largeur (les bords arrondis rentrent) + demi-épaisseur du rabat.
    const edge = Math.min(1, Math.max(0, (Math.abs(zr) * 2 - 0.8) / 0.2));
    const out = (d / 2) * fx * Math.sqrt(1 - 0.5 * edge * edge);
    P.setXYZ(i, out + t / 2 + xl, y - dy * h, zr * wf * fz);
  }
  g.computeVertexNormals();
  return g;
}
const place = (g: THREE.BufferGeometry, at: THREE.Vector3): THREE.BufferGeometry => g.translate(at.x, at.y, at.z);

// Enveloppe habillée : relevé du corps + sommets au repos des vêtements déjà portés (haut, bas, jupe, manteau…), pour
// que sangles et sacs passent PAR-DESSUS le tissu (un corps à l'aisance forte a des vêtements bien plus larges que la
// peau). Les sommets de vêtement sont rangés tronc / jambe / bras selon leur place en pose de liaison.
export function withCloth(A: BodyInfo, worn: readonly THREE.Mesh[]): BodyInfo {
  if (!worn.length) return A;
  const armX = Math.abs(A.J.RightArm.x), info = A.info.slice();
  for (const m of worn) {
    const P = m.geometry.attributes.position!;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const part = Math.abs(x) > armX && y > A.waistY ? 'arm' : y < A.J.Hips.y - 0.03 * A.H ? 'leg' : 'torso';
      info.push({ x, y, z, part, armT: 0, legT: 0, cloth: true });
    }
  }
  return { ...A, info };
}

// Sangle souple : tube le long des points, lié au bassin en bas et au thorax en haut (fondu entre `y0` et `y1`) : elle
// reste attachée au sac porté par le bassin quand le buste tourne ou se penche.
function band(A: BodyInfo, pts: THREE.Vector3[], r: number, color: string, y0: number, y1: number): THREE.SkinnedMesh {
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(24, pts.length * 10), r, 8, false);
  const P = g.attributes.position!, si: number[] = [], sw: number[] = [];
  for (let i = 0; i < P.count; i++) {
    const t = Math.min(1, Math.max(0, (P.getY(i) - y0) / (y1 - y0)));
    const k = t * t * (3 - 2 * t);
    si.push(A.idx.Spine2, A.idx.Hips, 0, 0);
    sw.push(k, 1 - k, 0, 0);
  }
  const ind = g.index ? Array.from(g.index.array) : Array.from({ length: P.count }, (_, i) => i);
  const m = skinned(A, Array.from(P.array as ArrayLike<number>), null, si, sw, ind, color);
  g.dispose();
  return m;
}

// Sac à dos : poche souple plaquée dans le dos (ventrue en bas), rabat sur le haut, poche avant, deux bretelles qui
// passent sur les épaules. Tout sur Spine2.
function sacADos(A: BodyInfo, color: string): THREE.SkinnedMesh[] {
  const H = A.H, sp = A.J.Spine2, bone = A.idx.Spine2;
  const w = 0.16 * H, h = 0.21 * H, d = 0.075 * H, gap = 0.012 * H, opts = { taper: 0.55, sag: 0.05 };
  const bs = slab(A, sp.y - 0.12 * H, sp.y + 0.04 * H, (v) => trunk(v) && Math.abs(v.x - sp.x) < w / 2);
  const back = bs.n ? bs.minZ : sp.z - 0.06 * H;
  const cy = sp.y - 0.04 * H;
  // Poche : épaisseur vers le dos (quart de tour autour de y : son extérieur +x passe en −z, sa largeur le long de x).
  // Centre écarté du dos de la demi-épaisseur du bas (la plus forte) : rien ne rentre dans le dos.
  const cz = back - gap - (d / 2) * pouchAt(-0.5, 0, opts.taper, opts.sag).fx;
  const out = [rigid(A, place(pouch(d, h, w, opts).rotateY(Math.PI / 2), V(sp.x, cy, cz)), bone, color)];
  out.push(rigid(A, place(flap(d, h, w, 0.008 * H, 0.42, opts).rotateY(Math.PI / 2), V(sp.x, cy, cz)), bone, darker(color, 0.85)));
  // Poche avant : petite poche souple sur la face extérieure, dans le bas.
  const pd = d * 0.32, py = cy - h * 0.2;
  const face = cz - (d / 2) * pouchAt((py - cy) / h, 0, opts.taper, opts.sag).fx;
  out.push(rigid(A, place(pouch(pd, h * 0.36, w * 0.66, { taper: 0.7, sag: 0.04 }).rotateY(Math.PI / 2), V(sp.x, py, face - pd * 0.4)), bone, darker(color, 0.85)));
  // Bretelles : du haut du sac par-dessus l'épaule, descendent devant l'épaule puis passent sous l'aisselle, sur le flanc,
  // et reviennent au coin bas du sac. Elles s'arrêtaient au milieu de la poitrine en deux barres verticales (des
  // bretelles de pantalon vues de face).
  const armY = A.J.LeftArm.y - 0.075 * H;
  for (const s of [1, -1]) {
    const x = sp.x + s * 0.05 * H, top = shoulderTop(A, x), g = 0.012 * H;
    const fl = slab(A, armY - 0.02 * H, armY + 0.02 * H, (v) => trunk(v) && (v.x - sp.x) * s > 0);
    const side = fl.n ? (s > 0 ? fl.maxX : fl.minX) + s * g : x + s * 0.06 * H;
    const xs = x + s * 0.035 * H, zMid = (frontAt(A, side - s * 0.02 * H, armY) + backAt(A, side - s * 0.02 * H, armY)) / 2;
    const pts = [
      V(x, cy + h * 0.42, back - gap),
      V(x, top - 0.01 * H, backAt(A, x, top - 0.01 * H) - g),
      V(x, top + g, (backAt(A, x, top - 0.01 * H) + frontAt(A, x, top - 0.01 * H)) / 2),
      V(x, top - 0.02 * H, frontAt(A, x, top - 0.02 * H) + g),
      V(xs, armY + 0.025 * H, frontAt(A, xs, armY + 0.025 * H) + g),
      V(side - s * 0.01 * H, armY - 0.01 * H, zMid + 0.03 * H),
      V(side - s * 0.015 * H, armY - 0.035 * H, zMid - 0.02 * H),
      V(sp.x + s * w * 0.42, cy - h * 0.38, back - gap - d * 0.3),
    ];
    out.push(strap(A, pts, 0.007 * H, darker(color), bone));
  }
  return out;
}

// Gabarit du sac en bandoulière (fractions de la hauteur du corps : ≈ 25 × 20 × 8 cm pour 1,70 m).
export const SAC = { w: 0.145, h: 0.115, d: 0.045 } as const;
// Sac en bandoulière : poche souple à rabat sur la hanche droite, un peu en arrière (le bras qui balance passe devant),
// liée au bassin ; sangle en travers du buste jusqu'à l'épaule gauche, puis dans le dos, fondue du bassin au thorax.
// Tout est posé sur l'enveloppe HABILLÉE (vêtements compris).
function sac(A: BodyInfo, color: string): THREE.SkinnedMesh[] {
  const H = A.H, hp = A.J.Hips, bone = A.idx.Hips;
  const w = SAC.w * H, h = SAC.h * H, d = SAC.d * H, opts = { taper: 0.45, sag: 0.09 };
  const yTop = hp.y - 0.015 * H, cy = yTop - h / 2, zc = hp.z - 0.05 * H;
  const hs = slab(A, cy - h / 2, yTop + 0.02 * H, (v) => (v.part === 'torso' || v.part === 'leg') && Math.abs(v.z - zc) < w / 2);
  const side = hs.n ? hs.minX : hp.x - 0.1 * H;
  // Côté droit (−x) : la poche (extérieur +x) fait un demi-tour autour de y ; son côté corps frôle le tissu.
  const cx = side - 0.006 * H - (d / 2) * pouchAt(-0.5, 0, opts.taper, opts.sag).fx;
  const c = V(cx, cy, zc);
  const bag = rigid(A, place(pouch(d, h, w, opts).rotateY(Math.PI), c), bone, color);
  const lid = rigid(A, place(flap(d, h, w, 0.006 * H, 0.58, opts).rotateY(Math.PI), c), bone, darker(color, 0.82));
  // Fermoir : petit bouton au bas du rabat.
  const fy = yTop - h * 0.55, fx = cx - (d / 2) * pouchAt((fy - cy) / h, 0, opts.taper, opts.sag).fx - 0.008 * H;
  const clasp = rigid(A, new THREE.SphereGeometry(0.0055 * H, 10, 8).translate(fx, fy, zc), bone, darker(color, 0.55));
  // Sangle : du coin avant du sac, devant le ventre et la poitrine, par-dessus l'épaule gauche, puis dans le dos jusqu'au
  // coin arrière. Points posés sur le devant / le dos de l'enveloppe habillée à leur (x, y).
  // Passage sur l'épaule gauche à mi-chemin du cou et de l'articulation de l'épaule (ni contre le cou, ni au bord), et
  // en dehors d'un col montant (manteau) : la sangle ne traverse pas le col.
  const r = 0.0065 * H, g = 0.004 * H + r, mid = 0.55 * A.J.LeftArm.x;
  const neckTop = shoulderTop(A, mid) + 0.01 * H;
  const col = slab(A, neckTop, A.J.Head.y + 0.05 * H, (v) => !!v.cloth && v.x > 0 && v.x < mid + 0.02 * H);
  const sx = Math.min(0.9 * A.J.LeftArm.x, Math.max(mid, col.n ? col.maxX + r + 0.004 * H : mid));
  const top = shoulderTop(A, sx);
  // Chaque tronçon est échantillonné finement sur l'enveloppe (`side` = 1 devant, −1 dans le dos), puis TENDU : la
  // sangle passe sur les rondeurs (ventre, poitrine, fesses) sans plonger dans les creux (reins, sous la poitrine) —
  // enveloppe convexe du profil, comme une sangle tirée par le poids du sac.
  const run = (way: [number, number][], side: 1 | -1): THREE.Vector3[] => {
    const raw: { s: number; x: number; y: number; z: number }[] = [];
    let len = 0;
    way.forEach(([x, y], i) => {
      const n = i === way.length - 1 ? 1 : 8;
      for (let k = 0; k < n; k++) {
        const [x1, y1] = way[Math.min(i + 1, way.length - 1)]!, t = k / 8;
        const xx = x + (x1 - x) * t, yy = y + (y1 - y) * t, prev = raw[raw.length - 1];
        if (prev) len += Math.hypot(xx - prev.x, yy - prev.y);
        raw.push({ s: len, x: xx, y: yy, z: side * (surfaceAt(A, xx, yy, side) + side * g) });
      }
    });
    // Enveloppe convexe supérieure de (s, side·z) (chaîne monotone), puis interpolation sur chaque échantillon.
    const hull: typeof raw = [];
    for (const q of raw) {
      while (hull.length >= 2) {
        const a = hull[hull.length - 2]!, b = hull[hull.length - 1]!;
        if ((b.s - a.s) * (q.z - a.z) - (b.z - a.z) * (q.s - a.s) >= 0) hull.pop();
        else break;
      }
      hull.push(q);
    }
    let j = 0;
    return raw.map((q) => {
      while (j < hull.length - 2 && hull[j + 1]!.s < q.s) j++;
      const a = hull[j]!, b = hull[Math.min(j + 1, hull.length - 1)]!, t = b.s > a.s ? (q.s - a.s) / (b.s - a.s) : 0;
      return V(q.x, q.y, side * (a.z + (b.z - a.z) * t));
    });
  };
  const a = side * 0.85, arc = overShoulder(A, sx, top, g + r);
  const pts = [
    V(cx, yTop, zc + w * 0.38),
    V(cx * 0.97, yTop + 0.03 * H, Math.max(zc + w * 0.45, frontAt(A, a, yTop + 0.03 * H) - 0.01 * H)),
    ...run([[a * 0.8, A.waistY], [a * 0.45, A.waistY + 0.06 * H], [0, A.J.Spine2.y - 0.03 * H], [sx, arc.y]],
      1).slice(0, -1),
    ...arc.pts,
    ...run([[sx, arc.y], [sx * 0.2, A.J.Spine2.y], [a * 0.5, A.waistY + 0.05 * H], [a * 0.85, A.waistY]], -1).slice(1),
    V(cx * 0.97, yTop + 0.03 * H, Math.min(zc - w * 0.45, backAt(A, a, yTop + 0.03 * H) + 0.01 * H)),
    V(cx, yTop, zc - w * 0.38),
  ];
  // Dernière passe : un point resté dans l'épaisseur du corps habillé (pente de l'épaule, col de manteau) est ressorti
  // vers le plus proche des trois côtés (devant, dos, dessus).
  for (const q of pts.slice(2, -2)) {
    const e = 0.008 * H + r, s = slab(A, q.y - e, q.y + e, (v) => v.part !== 'arm' && v.part !== 'hand' && v.part !== 'head' && Math.abs(v.x - q.x) < e);
    if (!s.n || q.z >= s.maxZ + g || q.z <= s.minZ - g || q.y >= s.maxY + g) continue;
    const dF = s.maxZ + g - q.z, dB = q.z - (s.minZ - g), dT = s.maxY + g - q.y;
    if (dT <= dF && dT <= dB) q.y += dT;
    else if (dF <= dB) q.z += dF;
    else q.z -= dB;
  }
  return [bag, lid, clasp, band(A, pts, r, darker(color), yTop + 0.02 * H, A.waistY + 0.06 * H)];
}

// Poing droit en pose de liaison : un peu au-delà du poignet, vers les doigts (−x).
const grip = (A: BodyInfo): THREE.Vector3 => A.J.RightHand.clone().add(V(-0.05 * A.H, 0, 0));

// Mallette : tenue par la poignée, elle pend le long de la jambe quand le bras retombe (hauteur le long de −x,
// largeur le long de z, épaisseur le long de y en pose de liaison). Cuir souple : bords bien arrondis, un peu ventrue.
function mallette(A: BodyInfo, color: string): THREE.SkinnedMesh[] {
  const H = A.H, p = grip(A), bone = A.idx.RightHand;
  const hh = 0.17 * H, th = 0.05 * H, w = 0.24 * H, top = p.x - 0.03 * H;
  // Poche (hauteur le long de y) tournée d'un quart de tour autour de z : son haut (+y) vers +x (le poing), épaisseur → −y.
  const body = rigid(A, place(pouch(th, hh, w, { taper: 0.8, sag: 0.02, round: 0.22 }).rotateZ(-Math.PI / 2), V(top - hh / 2, p.y, p.z)), bone, color);
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

// `worn` : vêtements déjà construits (sangles et sacs posés par-dessus).
export function accessory(A0: BodyInfo, what: string, color: string, worn: readonly THREE.Mesh[] = []): THREE.SkinnedMesh[] {
  const A = what === 'sac' || what === 'sac-a-dos' || what === 'echarpe' ? withCloth(A0, worn) : A0;
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
