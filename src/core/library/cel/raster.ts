import { INK } from '../paint/cel';
import { hexRgb, type Rgb } from '../paint/color';
import { viewTransform, type PerspCamera } from './camera';
import { lightVector, type LightSide } from './light';
import { normalize, type CelPart, type Vec3 } from './mesh';

// Rendu cellulo pur (portage de `render` de la maquette G6) : z-buffer logiciel sur tableaux typés, deux tons + rehaut,
// encre épaisse en silhouette et fine sur les arêtes, ombre portée translucide au sol. Ni DOM ni canvas : une image RGBA.
// La lumière est fixe dans la pièce (repère monde) : le meuble tourne de `yaw` sous elle, jamais l'inverse.

export type CelView = {
  cam: PerspCamera;
  yaw: number;
  side: LightSide;
  /** px d'image par px de pièce. */
  px: number;
  /** Suréchantillonnage : rendu interne à px × ss puis réduction par moyenne de blocs. */
  ss: number;
  /** Seuil de l'ombre propre (cosinus normale·lumière). */
  thr?: number;
  /** Saut de profondeur (cm) qui trace une silhouette intérieure. */
  thrD?: number;
  shadow?: { color: string; alpha: number } | null;
  /** Déformation du modèle avant la vue (balancement…) et sa version pour les normales. */
  pre?: (p: Vec3) => Vec3;
  preN?: (n: Vec3) => Vec3;
};

/** (ox, oy) : pixel de l'origine (0, 0, 0). */
export type CelImage = { w: number; h: number; rgba: Uint8ClampedArray; ox: number; oy: number };

const DEFAULT_SHADOW = { color: '#2A1A3C', alpha: 0.22 };
const MARGIN = 3;
const TRIS_PER_UNIT = 32;
const ROWS_PER_UNIT = 4;
const SHADOW_ID = -1;

type Projected = { x: Float64Array; y: Float64Array; z: Float64Array };
type Pass = { pts: Projected; normals: Float64Array | null; tris: readonly [number, number, number][]; id: number };

export function celJob(parts: readonly CelPart[], view: CelView): { step(budgetMs: number, now?: () => number): boolean; image(): CelImage } {
  const { px, ss } = view;
  const thr = view.thr ?? -0.18, thrD = view.thrD ?? 2.2;
  const shadow = view.shadow === undefined ? DEFAULT_SHADOW : view.shadow;
  const pre = view.pre ?? ((p: Vec3) => p), preN = view.preN ?? ((n: Vec3) => n);
  const vt = viewTransform(view.cam, view.yaw);
  const Lw = normalize(lightVector(view.side));
  const Lc = normalize(vt.tilt(Lw));

  // Projection de tous les sommets (en px d'image, relatifs à l'origine) : corps puis ombres.
  const passes: Pass[] = [];
  const project = (pts: Vec3[]): Projected => {
    const out: Projected = { x: new Float64Array(pts.length), y: new Float64Array(pts.length), z: new Float64Array(pts.length) };
    pts.forEach((p, i) => {
      const q = vt.project(vt.tilt(p));
      out.x[i] = q[0] * px;
      out.y[i] = q[1] * px;
      out.z[i] = q[2];
    });
    return out;
  };
  if (shadow)
    for (const P of parts) {
      if (P.noshadow || P.glow) continue;
      // Ombre projetée sur le sol (y = 0) selon la lumière, dans le repère monde (meuble déjà tourné), un peu derrière.
      const pts = P.m.v.map((p): Vec3 => {
        const q = vt.turn(pre(p));
        const k = q[1] / Lw[1];
        return [q[0] - Lw[0] * k, 0, q[2] - Lw[2] * k];
      });
      const pr = project(pts);
      for (let i = 0; i < pr.z.length; i++) pr.z[i]! -= 0.6;
      passes.push({ pts: pr, normals: null, tris: P.m.t, id: SHADOW_ID });
    }
  parts.forEach((P, k) => {
    const pr = project(P.m.v.map((p) => vt.turn(pre(p))));
    const normals = new Float64Array(P.m.n.length * 3);
    P.m.n.forEach((n, i) => normals.set(vt.tilt(vt.turn(preN(n))), i * 3));
    passes.push({ pts: pr, normals, tris: P.m.t, id: k + 1 });
  });

  // Cadre englobant + marge, en px d'image entiers (l'origine tombe sur un pixel entier).
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { pts } of passes)
    for (let i = 0; i < pts.x.length; i++) {
      minX = Math.min(minX, pts.x[i]!);
      maxX = Math.max(maxX, pts.x[i]!);
      minY = Math.min(minY, pts.y[i]!);
      maxY = Math.max(maxY, pts.y[i]!);
    }
  if (minX === Infinity) minX = maxX = minY = maxY = 0;
  const ox = MARGIN - Math.floor(minX), oy = MARGIN - Math.floor(minY);
  const W = Math.ceil(maxX) - Math.floor(minX) + 2 * MARGIN, H = Math.ceil(maxY) - Math.floor(minY) + 2 * MARGIN;
  const w = W * ss, h = H * ss, OX = ox * ss, OY = oy * ss;

  const depth = new Float32Array(w * h).fill(-1e9);
  const id = new Int32Array(w * h);
  const nx = new Float32Array(w * h), ny = new Float32Array(w * h), nz = new Float32Array(w * h);
  const E = new Uint8Array(w * h); // 0 rien, 1 arête, 2 silhouette
  const internal = new Uint8ClampedArray(w * h * 4);
  const tones = parts.map((P) => ({ base: hexRgb(P.col.base), shade: hexRgb(P.col.shade), hi: hexRgb(P.col.hi) }));
  const ink = hexRgb(INK);
  const shadowRgb: Rgb | null = shadow ? hexRgb(shadow.color) : null;
  const shadowA = shadow ? Math.round(shadow.alpha * 255) : 0;

  function tri(pass: Pass, a: number, b: number, c: number): void {
    const { x: X, y: Y, z: Z } = pass.pts;
    const x0 = OX + X[a]! * ss, y0 = OY + Y[a]! * ss, x1 = OX + X[b]! * ss, y1 = OY + Y[b]! * ss, x2 = OX + X[c]! * ss, y2 = OY + Y[c]! * ss;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) return;
    const bx0 = Math.max(0, Math.floor(Math.min(x0, x1, x2))), bx1 = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)));
    const by0 = Math.max(0, Math.floor(Math.min(y0, y1, y2))), by1 = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
    const N = pass.normals;
    for (let y = by0; y <= by1; y++) {
      const py = y + 0.5;
      for (let x = bx0; x <= bx1; x++) {
        const qx = x + 0.5;
        const w0 = ((x1 - qx) * (y2 - py) - (x2 - qx) * (y1 - py)) / area;
        if (w0 < -1e-4) continue;
        const w1 = ((x2 - qx) * (y0 - py) - (x0 - qx) * (y2 - py)) / area;
        if (w1 < -1e-4) continue;
        const w2 = 1 - w0 - w1;
        if (w2 < -1e-4) continue;
        const z = w0 * Z[a]! + w1 * Z[b]! + w2 * Z[c]!;
        const i = y * w + x;
        if (z <= depth[i]!) continue;
        depth[i] = z;
        id[i] = pass.id;
        if (N) {
          nx[i] = w0 * N[a * 3]! + w1 * N[b * 3]! + w2 * N[c * 3]!;
          ny[i] = w0 * N[a * 3 + 1]! + w1 * N[b * 3 + 1]! + w2 * N[c * 3 + 1]!;
          nz[i] = w0 * N[a * 3 + 2]! + w1 * N[b * 3 + 2]! + w2 * N[c * 3 + 2]!;
        }
      }
    }
  }

  const setE = (i: number, v: number): void => {
    if (E[i]! < v) E[i] = v;
  };
  // Encre entre les pixels voisins i et j (j = i + 1 ou i + w).
  function mark(i: number, j: number, horizontal: boolean): void {
    const a = id[i]!, b = id[j]!;
    if (a !== b) {
      if (a > 0 || b > 0) {
        setE(i, 2);
        setE(j, 2);
        // Épaississement du côté du fond (ou du plus loin) : silhouette épaisse.
        const farIsI = a <= 0 || (b > 0 && depth[j]! > depth[i]!);
        let k = -1;
        if (horizontal) {
          const row = Math.floor(i / w) * w;
          k = farIsI ? (i - 1 >= row ? i - 1 : -1) : j + 1 < row + w ? j + 1 : -1;
        } else k = farIsI ? i - w : j + w;
        if (k >= 0 && k < w * h) setE(k, 2);
      }
      return;
    }
    if (a <= 0) return;
    if (Math.abs(depth[i]! - depth[j]!) > thrD) {
      setE(i, 2);
      setE(j, 2);
      return;
    }
    const P = parts[a - 1]!;
    if (P.crease === false) return;
    const dn = nx[i]! * nx[j]! + ny[i]! * ny[j]! + nz[i]! * nz[j]!;
    const l = Math.hypot(nx[i]!, ny[i]!, nz[i]!) * Math.hypot(nx[j]!, ny[j]!, nz[j]!) || 1;
    if (dn / l < (P.creaseThr || 0.62)) {
      setE(i, 1);
      setE(j, 1);
    }
  }

  function colorRow(y: number): void {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = id[i]!;
      let c: Rgb | null = null;
      let alpha = 255;
      if (E[i]) c = ink;
      else if (a === SHADOW_ID) (c = shadowRgb), (alpha = shadowA);
      else if (a > 0) {
        const P = parts[a - 1]!, T = tones[a - 1]!;
        let t = 0; // 0 base, 1 ombre, 2 rehaut
        if (!P.flat && !P.glow) {
          const l = Math.hypot(nx[i]!, ny[i]!, nz[i]!) || 1;
          const ndl = (nx[i]! * Lc[0] + ny[i]! * Lc[1] + nz[i]! * Lc[2]) / l;
          t = ndl > thr ? (ndl > 0.9 && P.hi !== false ? 2 : 0) : 1;
        }
        c = t === 0 ? T.base : t === 1 ? T.shade : T.hi;
      }
      if (c) internal.set([c[0], c[1], c[2], alpha], i * 4);
    }
  }

  // Réduction par moyenne de blocs ss × ss (couleur pondérée par l'opacité).
  const out = ss === 1 ? internal : new Uint8ClampedArray(W * H * 4);
  function downRow(Y: number): void {
    const n = ss * ss;
    for (let X = 0; X < W; X++) {
      let sa = 0, sr = 0, sg = 0, sb = 0;
      for (let dy = 0; dy < ss; dy++)
        for (let dx = 0; dx < ss; dx++) {
          const i = ((Y * ss + dy) * w + X * ss + dx) * 4;
          const al = internal[i + 3]!;
          sa += al;
          sr += internal[i]! * al;
          sg += internal[i + 1]! * al;
          sb += internal[i + 2]! * al;
        }
      if (!sa) continue;
      out.set([Math.round(sr / sa), Math.round(sg / sa), Math.round(sb / sa), Math.round(sa / n)], (Y * W + X) * 4);
    }
  }

  // Tranches : triangles par lots, puis encre, couleurs et réduction ligne à ligne.
  let phase: 'tri' | 'edge' | 'color' | 'down' | 'done' = 'tri';
  let pi = 0, ti = 0, row = 0;
  function unit(): void {
    if (phase === 'tri') {
      for (let n = 0; n < TRIS_PER_UNIT && phase === 'tri'; n++) {
        const pass = passes[pi];
        if (!pass) {
          phase = 'edge';
          break;
        }
        if (ti >= pass.tris.length) {
          pi++;
          ti = 0;
          continue;
        }
        const [a, b, c] = pass.tris[ti++]!;
        tri(pass, a, b, c);
      }
    } else if (phase === 'edge') {
      for (const end = Math.min(h, row + ROWS_PER_UNIT); row < end; row++)
        for (let x = 0; x < w; x++) {
          const i = row * w + x;
          if (x + 1 < w) mark(i, i + 1, true);
          if (row + 1 < h) mark(i, i + w, false);
        }
      if (row >= h) (phase = 'color'), (row = 0);
    } else if (phase === 'color') {
      for (const end = Math.min(h, row + ROWS_PER_UNIT); row < end; row++) colorRow(row);
      if (row >= h) (phase = ss === 1 ? 'done' : 'down'), (row = 0);
    } else if (phase === 'down') {
      for (const end = Math.min(H, row + ROWS_PER_UNIT); row < end; row++) downRow(row);
      if (row >= H) phase = 'done';
    }
  }

  return {
    step(budgetMs, now = () => performance.now()) {
      const t0 = now();
      while (phase !== 'done') {
        unit();
        if (now() - t0 >= budgetMs) break;
      }
      return phase === 'done';
    },
    image() {
      while (phase !== 'done') unit();
      return { w: W, h: H, rgba: out, ox, oy };
    },
  };
}

// Rendu mené à terme d'un coup.
export function renderCel(parts: readonly CelPart[], view: CelView): CelImage {
  return celJob(parts, view).image();
}
