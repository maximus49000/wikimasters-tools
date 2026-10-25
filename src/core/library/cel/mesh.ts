import type { Tone } from './tone';

// Maillages arrondis du moteur cellulo (portage de la maquette G6). Repère « centré » : x à droite, y en haut,
// z vers le spectateur, origine au centre de la base, en cm.
export type Vec3 = [number, number, number];
export type Mesh = { v: Vec3[]; n: Vec3[]; t: [number, number, number][] };
export type Deform = (x: number, y: number, z: number) => Vec3;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

const mk = (): Mesh => ({ v: [], n: [], t: [] });
const sgnpow = (w: number, e: number): number => Math.sign(w) * Math.pow(Math.abs(w), e);
// cos(π/2) vaut 6e-17 en flottant : élevé à une petite puissance (coussin carré, e = 0,15) il donnerait 0,4 % du demi-axe, soit un
// petit trou au pôle et aux coutures. Les zéros de la trigonométrie sont ramenés à 0.
const trig = (v: number): number => (Math.abs(v) < 1e-12 ? 0 : v);
const faceNormal = (m: Mesh, [a, b, c]: [number, number, number]): Vec3 => cross(sub(m.v[b]!, m.v[a]!), sub(m.v[c]!, m.v[a]!));

// Oriente les triangles vers l'extérieur (vu de `center`) et calcule des normales lissées, sommets confondus soudés.
function finish(m: Mesh, center: Vec3): Mesh {
  for (const t of m.t) {
    const [a, b, c] = t;
    const mid = scale(add(add(m.v[a]!, m.v[b]!), m.v[c]!), 1 / 3);
    if (dot(faceNormal(m, t), sub(mid, center)) < 0) {
      t[1] = c;
      t[2] = b;
    }
  }
  const nn: Vec3[] = m.v.map(() => [0, 0, 0]);
  for (const t of m.t) {
    const N = faceNormal(m, t);
    for (const i of t) nn[i] = add(nn[i]!, N);
  }
  // Soude les sommets confondus (pôles, couture) pour des normales continues.
  const groups = new Map<string, number[]>();
  m.v.forEach((p, i) => {
    const k = p.map((v) => Math.round(v * 100)).join(',');
    const g = groups.get(k);
    if (g) g.push(i);
    else groups.set(k, [i]);
  });
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const s = ids.reduce<Vec3>((acc, i) => add(acc, nn[i]!), [0, 0, 0]);
    for (const i of ids) nn[i] = s;
  }
  m.n = nn.map(normalize);
  return m;
}

// Superellipsoïde (demi-axes a, b, c ; e1, e2 = rondeur : 1 = ellipsoïde, < 1 = coussin carré).
export function superEll(a: number, b: number, c: number, e1: number, e2: number, nu = 14, nv = 24, deform?: Deform): Mesh {
  const m = mk();
  for (let i = 0; i <= nu; i++) {
    const eta = -Math.PI / 2 + (Math.PI * i) / nu;
    for (let j = 0; j <= nv; j++) {
      const om = -Math.PI + (2 * Math.PI * j) / nv;
      const x = a * sgnpow(trig(Math.cos(eta)), e1) * sgnpow(trig(Math.cos(om)), e2);
      const y = b * sgnpow(Math.sin(eta), e1);
      const z = c * sgnpow(trig(Math.cos(eta)), e1) * sgnpow(trig(Math.sin(om)), e2);
      m.v.push(deform ? deform(x, y, z) : [x, y, z]);
    }
  }
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a0 = i * (nv + 1) + j, b0 = a0 + 1, c0 = a0 + nv + 1, d0 = c0 + 1;
      m.t.push([a0, c0, b0], [b0, c0, d0]);
    }
  return finish(m, [0, 0, 0]);
}

// Tour (révolution autour de y) d'un profil [[r, y], …] de bas en haut ; caps: false pour une surface ouverte.
export function lathe(profile: [number, number][], nv = 20, deform?: Deform, opt: { caps?: boolean } = {}): Mesh {
  const m = mk();
  const rings: number[][] = profile.map(([r, y]) => {
    const ring: number[] = [];
    for (let j = 0; j <= nv; j++) {
      const a = (2 * Math.PI * j) / nv;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      ring.push(m.v.length);
      m.v.push(deform ? deform(x, y, z) : [x, y, z]);
    }
    return ring;
  });
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < nv; j++) {
      const r0 = rings[i]!, r1 = rings[i + 1]!;
      m.t.push([r0[j]!, r1[j]!, r0[j + 1]!], [r0[j + 1]!, r1[j]!, r1[j + 1]!]);
    }
  if (opt.caps !== false) {
    const first = profile[0]!, L = profile.length - 1, last = profile[L]!;
    if (first[0] > 0) {
      const c = m.v.length;
      m.v.push([0, first[1], 0]);
      for (let j = 0; j < nv; j++) m.t.push([c, rings[0]![j]!, rings[0]![j + 1]!]);
    }
    if (last[0] > 0) {
      const c = m.v.length;
      m.v.push([0, last[1], 0]);
      for (let j = 0; j < nv; j++) m.t.push([c, rings[L]![j + 1]!, rings[L]![j]!]);
    }
  }
  const ys = profile.map((p) => p[1]);
  return finish(m, [0, (Math.min(...ys) + Math.max(...ys)) / 2, 0]);
}

// Tube de rayon r le long d'une polyligne lissée (repère de Frenet transporté), bouché aux deux bouts.
export function tube(pts: Vec3[], r: number, nv = 10): Mesh {
  const path = smooth(pts, 3);
  const m = mk();
  const rings: number[][] = [];
  let N: Vec3 | null = null;
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!, q = path[Math.min(i + 1, path.length - 1)]!, o = path[Math.max(i - 1, 0)]!;
    const T = normalize(sub(q, o));
    if (!N) N = normalize(cross(Math.abs(T[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], T));
    else N = normalize(sub(N, scale(T, dot(N, T))));
    const B = cross(T, N);
    const ring: number[] = [];
    for (let j = 0; j <= nv; j++) {
      const a = (2 * Math.PI * j) / nv;
      const d = add(scale(N, Math.cos(a)), scale(B, Math.sin(a)));
      ring.push(m.v.length);
      m.v.push(add(p, scale(d, r)));
      m.n.push(d);
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < nv; j++) {
      const r0 = rings[i]!, r1 = rings[i + 1]!;
      m.t.push([r0[j]!, r1[j]!, r0[j + 1]!], [r0[j + 1]!, r1[j]!, r1[j + 1]!]);
    }
  // Bouchons.
  for (const [k, s] of [[0, -1], [rings.length - 1, 1]] as const) {
    const T = normalize(sub(path[Math.min(k + 1, path.length - 1)]!, path[Math.max(k - 1, 0)]!));
    const c = m.v.length;
    m.v.push(path[k]!);
    m.n.push(scale(T, s));
    for (let j = 0; j < nv; j++) {
      const a = rings[k]![j]!, b = rings[k]![j + 1]!;
      m.t.push(s < 0 ? [c, b, a] : [c, a, b]);
    }
  }
  return m;
}

// Feuille à double face : contour [[x, z], …] dans le plan y = 0, épaisseur th, en étoile autour de center.
export function leaf(outline: [number, number][], th = 0.5, deform?: Deform, center: [number, number] = [0, 0]): Mesh {
  const m = mk();
  const n = outline.length;
  const [cx, cz] = center;
  const push = (x: number, y: number, z: number, ny: number): number => {
    m.v.push(deform ? deform(x, y, z) : [x, y, z]);
    m.n.push([0, ny, 0]);
    return m.v.length - 1;
  };
  const top = outline.map(([x, z]) => push(x, th / 2, z, 1)), ct = push(cx, th / 2, cz, 1);
  const bot = outline.map(([x, z]) => push(x, -th / 2, z, -1)), cb = push(cx, -th / 2, cz, -1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    m.t.push([ct, top[i]!, top[j]!], [cb, bot[j]!, bot[i]!]);
    m.t.push([top[i]!, bot[i]!, top[j]!], [top[j]!, bot[i]!, bot[j]!]);
  }
  if (deform) {
    const nn: Vec3[] = m.v.map(() => [0, 0, 0]);
    for (const t of m.t) {
      const N = faceNormal(m, t);
      for (const i of t) nn[i] = add(nn[i]!, N);
    }
    m.n = nn.map((v, i) => (Math.hypot(v[0], v[1], v[2]) ? normalize(v) : m.n[i]!));
  }
  return m;
}

// Catmull-Rom : k points par segment, le dernier point gardé.
export function smooth(pts: Vec3[], k: number): Vec3[] {
  if (pts.length < 3) return pts;
  const out: Vec3[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(i + 2, pts.length - 1)]!;
    for (let s = 0; s < k; s++) {
      const t = s / k, t2 = t * t, t3 = t2 * t;
      const at = (d: 0 | 1 | 2): number =>
        0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3);
      out.push([at(0), at(1), at(2)]);
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

export const rotX = (p: Vec3, a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
};
export const rotY = (p: Vec3, a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
};
export const rotZ = (p: Vec3, a: number): Vec3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
};

// Pose d'un maillage : échelle, puis rotations (rad, ordre z, x, y), puis translation. Les normales ne suivent que les rotations.
export type Placement = { rx?: number; ry?: number; rz?: number; s?: number | Vec3; t?: Vec3 };
export function place(m: Mesh, o: Placement): Mesh {
  const f = (p: Vec3, isN: boolean): Vec3 => {
    let q = p;
    if (o.s && !isN) q = Array.isArray(o.s) ? [q[0] * o.s[0], q[1] * o.s[1], q[2] * o.s[2]] : scale(q, o.s);
    if (o.rz) q = rotZ(q, o.rz);
    if (o.rx) q = rotX(q, o.rx);
    if (o.ry) q = rotY(q, o.ry);
    if (o.t && !isN) q = add(q, o.t);
    return q;
  };
  return { v: m.v.map((p) => f(p, false)), n: m.n.map((p) => normalize(f(p, true))), t: m.t };
}

// Une pièce du meuble : maillage + teinte et options de rendu.
// crease : encre des arêtes (false = jamais) ; creaseThr : seuil du cosinus entre normales (0,62) ; flat : aplat sans ombre propre ;
// noshadow : pas d'ombre portée ; hi : rehaut (false = jamais) ; glow : lumineux (base seule, sans ombrage ni ombre portée) ;
// interior : visible à travers une ouverture (fond, dessus des tablettes).
export type CelPart = { m: Mesh; col: Tone; crease?: boolean; creaseThr?: number; flat?: boolean; noshadow?: boolean; hi?: boolean; glow?: boolean; interior?: boolean };
export const part = (m: Mesh, col: Tone, o: Omit<CelPart, 'm' | 'col'> = {}): CelPart => ({ m, col, ...o });
