// src/core/library/figure/bake.ts
import { add3, capsule, hull, mul3, pathOf, project, shrink, type P2, type V3 } from './geometry';
import { hairField, headRegion } from './head';
import { PEDAL, at, frameOf, poseOf, type ArmPose, type Frame3, type Gait, type Pose } from './skeleton';
import { shapeFromSignature, type Shape } from './dress';

// Cuisson d'une pose quantifiée du pantin en tracés SVG (maquette validée du 2026-10-11). Chaque groupe (jambe, bras,
// tronc, sac, tête) donne un trait d'encre (union de ses pièces, épaissie au dessin) puis, pièce par pièce, l'ombre et la
// partie éclairée. Les couleurs ne sont pas ici : chaque tracé porte une case (`slot`) que le dessin relie à une variable CSS.
// Tenues de travail : `vest` (gilet), `band` (bande claire du gilet), `apron` (tablier).
export type Slot = 'skin' | 'top' | 'bottom' | 'hair' | 'hat' | 'acc' | 'shoe' | 'umb' | 'vest' | 'band' | 'apron';
export type BakedPart = { slot: Slot; shade: string; lit: string | null };
export type BakedGroup = { ink: string; parts: BakedPart[] };
export type Baked = { groups: BakedGroup[]; eyes: P2[] };
// Indices : `yaw` 0–15 (pas de 22,5°), `phase` 0–11, `head` −4…4 (rotation de la tête seule, pas de 22,5°) ; `arms` : geste
// des bras ('swing' = balancement de marche) ; `lean` : penché vers l'avant (0, 1, 2).
export type FigureKey = { sig: string; yaw: number; gait: Gait; phase: number; head: number; arms: ArmPose; lean: number };
export const keyString = (k: FigureKey): string => `${k.sig}|${k.yaw}|${k.gait}|${k.phase}|${k.head}|${k.arms}|${k.lean}`;
// Points d'accroche des objets tenus (repère du sprite : pieds à l'origine, y vers le bas) : mains, centre et haut de la tête,
// nuque (arrière du cou, au-dessus des épaules), selle (bassin : posée par le site sur la selle d'un vélo, d'un cheval, d'une moto).
export type Anchor = 'handR' | 'handL' | 'head' | 'headTop' | 'nape' | 'seat';
// Épaisseur du trait d'encre (unités du pantin), réglée sur les captures pour ≈ 0,5 px à l'écran autour de 24 px de haut.
export const INK_WIDTH = 0.8;

const HEAD_R = 4.4;
// Anneaux de la toile du parapluie (rayon, hauteur au-dessus du haut du manche) : bord, mi-hauteur, haut ; sommet à +3,6.
const UMB_RINGS: readonly (readonly [number, number])[] = [
  [9.5, -1.2],
  [7.5, 1.6],
  [4, 3.0],
];
type Part = { P: P2[]; lit: P2[] | null; slot: Slot; z: number };
type Group = { parts: Part[]; z: number };

function capPart(a3: V3, b3: V3, ra: number, rb: number, slot: Slot): Part {
  const a = project(a3);
  const b = project(b3);
  const d = Math.min(ra, rb) * 0.34;
  const o = d * 0.62;
  return { P: capsule([a[0], a[1]], [b[0], b[1]], ra, rb), lit: capsule([a[0] - o, a[1] - o], [b[0] - o, b[1] - o], ra - d, rb - d), slot, z: (a[2] + b[2]) / 2 };
}
function hullPart(pts3: readonly V3[], slot: Slot, k = 0.86): Part {
  const pr = pts3.map(project);
  const P = hull(pr.map((q) => [q[0], q[1]] as const));
  const xs = P.map((q) => q[0]);
  const w = Math.max(...xs) - Math.min(...xs);
  return { P, lit: shrink(P, k, -w * 0.06, -w * 0.04), slot, z: pr.reduce((s, q) => s + q[2], 0) / pr.length };
}
// Anneau horizontal (section du tronc), tourné de `rot` autour de la verticale.
function ring(c: V3, fr: Frame3, rot: number, wid: number, dep: number, n = 10): V3[] {
  const out: V3[] = [];
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    const lx = (Math.cos(a) * wid) / 2;
    const fx = (Math.sin(a) * dep) / 2;
    out.push(at(c, fr, fx * cr + lx * sr, 0, lx * cr - fx * sr));
  }
  return out;
}
// Moitié avant d'un anneau (du flanc gauche au flanc droit en passant par le devant) : bord du tablier.
const frontArc = (c: V3, fr: Frame3, rot: number, wid: number, dep: number): V3[] => ring(c, fr, rot, wid, dep, 12).slice(0, 7);
const box = (c: V3, fr: Frame3, f: number, u: number, l: number): V3[] => {
  const pts: V3[] = [];
  for (const a of [-f, f]) for (const b of [-u, u]) for (const d of [-l, l]) pts.push(at(c, fr, a, b, d));
  return pts;
};

// Régions de cheveux par (coiffure, orientation de la tête) : ne dépendent pas de la position de la tête.
const headCache = new Map<string, P2[][]>();
function hairPolys(hair: Shape['hair'], headYawIndex: number): P2[][] {
  const k = `${hair}|${headYawIndex}`;
  let r = headCache.get(k);
  if (!r) {
    const field = hairField(hair);
    r = field ? headRegion(HEAD_R, frameOf((headYawIndex * Math.PI) / 8), field) : [];
    headCache.set(k, r);
  }
  return r;
}

// Pose d'une clé : la même pour la cuisson et les accroches (objets tenus posés exactement sur le sprite).
const poseOfKey = (s: Shape, key: FigureKey): Pose =>
  poseOf((key.yaw * Math.PI) / 8, (key.phase * 2 * Math.PI) / 12, key.gait, { headYaw: (key.head * Math.PI) / 8, umbrella: s.umbrella, arms: key.arms, lean: key.lean });

// Accroches mémoïsées par clé (les boucles les relisent à chaque changement de pose) ; vidées au-delà de 4096 clés.
const anchorCache = new Map<string, Record<Anchor, readonly [number, number]>>();
const r2 = (v: number): number => Math.round(v * 100) / 100 || 0;
export function anchorsOf(key: FigureKey): Record<Anchor, readonly [number, number]> {
  const ks = keyString(key);
  const hit = anchorCache.get(ks);
  if (hit) return hit;
  const q = poseOfKey(shapeFromSignature(key.sig), key);
  const pt = (p: V3): readonly [number, number] => {
    const r = project(p);
    return [r2(r[0]), r2(r[1])];
  };
  // Main : le poignet (cible de la cinématique inverse), d'où part la pièce de la main.
  const a = {
    handR: pt(q.arms[1].hand),
    handL: pt(q.arms[0].hand),
    head: pt(q.head),
    headTop: pt(add3(q.head, mul3(q.headFrame.U, HEAD_R))),
    nape: pt(at(q.neck, q.fr, -1, 1, 0)),
    seat: pt(q.pelvis),
  };
  if (anchorCache.size >= 4096) anchorCache.clear();
  anchorCache.set(ks, a);
  return a;
}

export function bakeFigure(s: Shape, key: FigureKey): Baked {
  const q: Pose = poseOfKey(s, key);
  const fr = q.fr;
  const legsG: Group[] = [];
  const midG: Group[] = [];
  const bare = s.bottom === 'skirt' || s.bottom === 'shorts';
  const coat = s.top === 'coat';
  for (const g of q.legs) {
    const parts: Part[] = [];
    const legSlot: Slot = bare ? 'skin' : 'bottom';
    if (s.bottom === 'shorts') {
      const mid = add3(mul3(g.hip, 0.45), mul3(g.knee, 0.55));
      parts.push(capPart(g.hip, mid, 2.5, 2.3, 'bottom'), capPart(mid, g.knee, 1.7, 1.5, 'skin'));
    } else parts.push(capPart(g.hip, g.knee, 2.4, 1.85, legSlot));
    parts.push(capPart(g.knee, g.ankle, bare ? 1.45 : 1.8, bare ? 1.05 : 1.5, legSlot));
    parts.push(capPart(g.ankle, g.toe, 1.15, 1.05, 'shoe'));
    legsG.push({ parts, z: Math.max(...parts.map((p) => p.z)) });
  }
  legsG.sort((a, b) => a.z - b.z);
  // Tronc (jupe, short ou pantalon en haut des cuisses, manteau long).
  const shC = at(q.pelvis, fr, 10.4 * Math.sin(q.lean), 10.4 * Math.cos(q.lean), 0);
  const waist = at(q.pelvis, fr, 4.5 * Math.sin(q.lean), 4.5 * Math.cos(q.lean), 0);
  const torso: Part[] = [];
  if (s.bottom === 'skirt') {
    const kn = q.legs.map((g) => add3(mul3(g.hip, 0.35), mul3(g.knee, 0.65)));
    torso.push(hullPart([...ring(add3(q.pelvis, [0, 0.6, 0]), fr, q.pelvisTurn, 8.2, 4.8), ...ring(mul3(add3(kn[0]!, kn[1]!), 0.5), fr, q.pelvisTurn, 11, 6.5)], 'bottom'));
  } else if (!coat) torso.push(hullPart(ring(add3(q.pelvis, [0, 0.4, 0]), fr, q.pelvisTurn, 9, 6), 'bottom'));
  torso.push(hullPart([...ring(shC, fr, q.shoulderTurn, 10, 6.2), ...ring(waist, fr, (q.shoulderTurn + q.pelvisTurn) / 2, 8.2, 5.6), ...ring(add3(q.pelvis, [0, coat ? -6 : 0.4, 0]), fr, q.pelvisTurn, coat ? 10.4 : 9, coat ? 7.2 : 6)], 'top'));
  // Gilet de chantier : enveloppe du tronc (épaules → bassin) agrandie de 0,4, sans manches ; bande claire à mi-torse.
  if (s.work === 'vest') {
    const mid = (q.shoulderTurn * 3 + q.pelvisTurn) / 4;
    torso.push(hullPart([...ring(shC, fr, q.shoulderTurn, 10.4, 6.6), ...ring(waist, fr, (q.shoulderTurn + q.pelvisTurn) / 2, 8.6, 6), ...ring(add3(q.pelvis, [0, 0.4, 0]), fr, q.pelvisTurn, 9.4, 6.4)], 'vest'));
    const band = (u: number): V3 => at(q.pelvis, fr, u * Math.sin(q.lean), u * Math.cos(q.lean), 0);
    torso.push(hullPart([...ring(band(6.9), fr, mid, 9.3, 6.3), ...ring(band(7.9), fr, mid, 9.6, 6.4)], 'band', 0.8));
  }
  // Tablier : devant seulement, de la taille aux genoux ; caché de dos (il passerait sur le dos et les jambes).
  if (s.work === 'apron' && Math.sin((key.yaw * Math.PI) / 8 + q.pelvisTurn) > -0.25) {
    const kn = q.legs.map((g) => add3(mul3(g.hip, 0.3), mul3(g.knee, 0.7)));
    torso.push(hullPart([...frontArc(waist, fr, (q.shoulderTurn + q.pelvisTurn) / 2, 8.6, 6.2), ...frontArc(mul3(add3(kn[0]!, kn[1]!), 0.5), fr, q.pelvisTurn, 9.6, 6.8)], 'apron'));
  }
  if (s.acc === 'scarf') torso.push(hullPart(ring(at(shC, fr, 0, 0.9, 0), fr, q.shoulderTurn, 6.5, 4.4, 8), 'acc', 0.8));
  midG.push({ parts: torso, z: project(q.pelvis)[2] });
  if (s.acc === 'backpack') {
    const c = at(shC, fr, -3.6, -4.5, 0);
    midG.push({ parts: [hullPart(box(c, fr, 1.4, 3.6, 2.6), 'acc', 0.8)], z: project(c)[2] });
  }
  // Bras (manches courtes : avant-bras nus), sac ou mallette dans la main droite, parapluie.
  for (const g of q.arms) {
    const ps: Part[] = [capPart(g.sh, g.elb, 2.0, 1.6, 'top'), capPart(g.elb, g.hand, 1.55, 1.2, s.top === 'tee' ? 'skin' : 'top'), capPart(g.hand, add3(g.hand, [0, -0.6, 0]), 1.05, 0.95, 'skin')];
    if (g.l > 0 && !s.umbrella && (s.acc === 'bag' || s.acc === 'case')) {
      const c = add3(g.hand, [0, s.acc === 'case' ? -3 : -3.6, 0]);
      ps.push(hullPart(box(c, fr, s.acc === 'case' ? 3.2 : 2.4, s.acc === 'case' ? 2 : 2.4, 0.9), 'acc', 0.8));
    }
    if (g.l > 0 && s.acc === 'ball' && !s.umbrella) ps.push(capPart(add3(g.hand, [0, -2.4, 0]), add3(g.hand, [0.01, -2.4, 0]), 2.2, 2.2, 'acc'));
    if (g.l > 0 && s.umbrella) {
      const top = add3(g.hand, [0, 11, 0]);
      ps.push(capPart(g.hand, top, 0.35, 0.35, 'shoe'));
      // Toile en dôme (un bord et un sommet seuls se lisaient comme un cône) : enveloppe de trois anneaux, du bord au haut.
      const canopy: V3[] = [add3(top, [0, 3.6, 0])];
      for (const [r, dy] of UMB_RINGS) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * 2 * Math.PI;
          canopy.push(add3(top, [Math.cos(a) * r, dy, Math.sin(a) * r]));
        }
      }
      ps.push(hullPart(canopy, 'umb', 0.84));
    }
    midG.push({ parts: ps, z: Math.max(...ps.map((p) => p.z)) });
  }
  // Masse arrière des cheveux longs : triée avec le corps (devant le dos, derrière le visage).
  const hf = q.headFrame;
  if (s.hair === 'long') {
    const pts: V3[] = [];
    for (let i = 0; i < 14; i++) {
      const a = Math.PI / 2 + (i / 13) * Math.PI;
      pts.push(add3(q.head, add3(mul3(hf.F, Math.cos(a) * HEAD_R * 0.9), mul3(hf.R, Math.sin(a) * HEAD_R))));
    }
    pts.push(at(q.head, hf, -2.4, -8.6, -3.6), at(q.head, hf, -2.4, -8.6, 3.6), at(q.head, hf, -3.2, -6, 0));
    midG.push({ parts: [hullPart(pts, 'hair', 0.84)], z: project(at(q.head, hf, -3, 0, 0))[2] });
  }
  midG.sort((a, b) => a.z - b.z);
  // Tête : cou, crâne, cheveux ou couvre-chef, chignon, pompon, visière ; yeux si le visage est tourné vers nous.
  const head: Part[] = [capPart(q.neck, at(q.neck, fr, 0.3, 2.2, 0), 1.35, 1.35, 'skin')];
  const hc = project(q.head);
  const circle = (c: readonly number[], r: number): P2[] => capsule([c[0]!, c[1]!], [c[0]! + 0.01, c[1]!], r, r);
  head.push({ P: circle(hc, HEAD_R), lit: circle([hc[0] - 0.6, hc[1] - 0.6], HEAD_R - 0.85), slot: 'skin', z: hc[2] });
  const capSlot: Slot = s.hair === 'cap' || s.hair === 'beanie' ? 'hat' : 'hair';
  const headIdx = (((key.yaw + key.head) % 16) + 16) % 16;
  for (const P0 of hairPolys(s.hair, headIdx)) {
    const P = P0.map((p) => [p[0] + hc[0], p[1] + hc[1]] as const);
    head.push({ P, lit: shrink(P, 0.84, -0.35, -0.35), slot: capSlot, z: hc[2] });
  }
  const sph = (el: number, az: number): V3 => {
    const ce = Math.cos(el);
    return add3(q.head, add3(add3(mul3(hf.F, ce * Math.cos(az) * HEAD_R), mul3(hf.R, ce * Math.sin(az) * HEAD_R)), mul3(hf.U, Math.sin(el) * HEAD_R)));
  };
  if (s.hair === 'bun') {
    const c = at(q.head, hf, -2.6, 3.6, 0);
    head.push(capPart(c, add3(c, [0.01, 0, 0]), 2.1, 2.1, 'hair'));
  }
  if (s.hair === 'beanie') {
    const c = sph(1.45, 0);
    head.push(capPart(c, add3(c, [0.01, 0, 0]), 1.1, 1.1, 'hat'));
  }
  if (s.hair === 'cap') head.push(capPart(sph(0.35, 0), at(q.head, hf, HEAD_R + 2.6, 1.3, 0), 0.8, 0.7, 'hat'));
  const visible = (el: number, az: number): boolean => {
    const ce = Math.cos(el);
    const n = add3(add3(mul3(hf.F, ce * Math.cos(az)), mul3(hf.R, ce * Math.sin(az))), mul3(hf.U, Math.sin(el)));
    return n[1] * Math.sin((12 * Math.PI) / 180) + n[2] * Math.cos((12 * Math.PI) / 180) > -0.02;
  };
  const eyes: P2[] = [];
  for (const sgn of [-1, 1]) {
    const az = sgn * 0.38;
    if (visible(0.02, az + 0.25 * sgn)) {
      const e = project(sph(0.02, az));
      eyes.push([Math.round(e[0] * 10) / 10, Math.round(e[1] * 10) / 10]);
    }
  }
  const all: Group[] = [...legsG, ...midG, { parts: head, z: Infinity }];
  return {
    groups: all.map((g) => ({ ink: g.parts.map((p) => pathOf(p.P)).join(''), parts: g.parts.map((p) => ({ slot: p.slot, shade: pathOf(p.P), lit: p.lit ? pathOf(p.lit) : null })) })),
    eyes,
  };
}

// Repères d'un pantin à vélo (allure `pedal`, guidon), dans le repère du sprite : selle (bassin), centre du pédalier, milieu
// des mains. Le pédalier ne dépend pas de la phase (centre du cercle des chevilles) : le vélo se dessine autour.
export function rideFrame(sig: string, yaw: number): { seat: readonly [number, number]; crank: readonly [number, number]; hands: readonly [number, number] } {
  const q = poseOfKey(shapeFromSignature(sig), { sig, yaw, gait: 'pedal', phase: 0, head: 0, arms: 'handlebar', lean: 0 });
  const p = (v: V3): readonly [number, number] => {
    const r = project(v);
    return [r2(r[0]), r2(r[1])];
  };
  const h = mul3(add3(q.arms[0].hand, q.arms[1].hand), 0.5);
  return { seat: p(q.pelvis), crank: p(at(q.pelvis, q.fr, PEDAL.f, -PEDAL.d, 0)), hands: p(h) };
}
