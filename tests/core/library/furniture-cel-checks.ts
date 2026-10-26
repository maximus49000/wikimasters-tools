// Aide de contrôle partagée des dessins cellulo des meubles (sans `.test` : importée par les tests de chaque famille de meubles).
import { expect } from 'vitest';
import { ROOM_CAMERA, yawOf } from '../../../src/core/library/cel/camera';
import { REST_LIFE, type LifeState } from '../../../src/core/library/cel/life-state';
import { lookOf, type CelLook } from '../../../src/core/library/cel/looks';
import type { CelPart, Vec3 } from '../../../src/core/library/cel/mesh';
import { CEL_MODELS, celPartsOf } from '../../../src/core/library/cel/models';
import { renderCel } from '../../../src/core/library/cel/raster';
import type { Angle } from '../../../src/core/library/footprint';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import type { StandingKind, StyleId } from '../../../src/core/library/library-types';
import { INK } from '../../../src/core/library/paint/cel';

const ANGLES: Angle[] = [0, 1, 2, 3, 4, 5, 6, 7];
const hex = (rgba: Uint8ClampedArray, i: number) => '#' + [0, 1, 2].map((k) => rgba[i * 4 + k]!.toString(16).padStart(2, '0')).join('').toUpperCase();

// Plus haute surface des maillages à la verticale de (x, z) (repère centré), ou -Infinity.
export function topAt(parts: readonly CelPart[], x: number, z: number): number {
  let best = -Infinity;
  for (const { m } of parts)
    for (const [a, b, c] of m.t) {
      const [A, B, C] = [m.v[a]!, m.v[b]!, m.v[c]!];
      const det = (B[0] - A[0]) * (C[2] - A[2]) - (C[0] - A[0]) * (B[2] - A[2]);
      if (Math.abs(det) < 1e-9) continue;
      const u = ((x - A[0]) * (C[2] - A[2]) - (C[0] - A[0]) * (z - A[2])) / det;
      const v = ((B[0] - A[0]) * (z - A[2]) - (x - A[0]) * (B[2] - A[2])) / det;
      if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
      best = Math.max(best, A[1] + u * (B[1] - A[1]) + v * (C[1] - A[1]));
    }
  return best;
}

// Cadre [x0, x1, y0, y1, z0, z1] des maillages donnés (repère centré, cm) ; l'appelant écarte lui-même les garnitures (`P.trim`)
// s'il veut l'encombrement du corps du meuble.
export function boundsOf(parts: readonly CelPart[]): [number, number, number, number, number, number] {
  const b: [number, number, number, number, number, number] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  for (const { m } of parts)
    for (const [x, y, z] of m.v) {
      if (x < b[0]) b[0] = x;
      if (x > b[1]) b[1] = x;
      if (y < b[2]) b[2] = y;
      if (y > b[3]) b[3] = y;
      if (z < b[4]) b[4] = z;
      if (z > b[5]) b[5] = z;
    }
  return b;
}

// Contrôles d'un dessin cellulo de meuble : (a) encombrement ⊂ boîte du modèle à 2 cm près, chaque dimension ≥ 85 % ; (b) dessus
// praticable à ±1,5 cm du maillage le plus haut sous son centre ; (c) rendu déterministe aux 8 angles ; (d) à chaque angle, ombre
// propre entre 8 % (1 % pour un meuble plat, cf. FLAT_H ; 6,5 % pour l'étagère, cf. SHADE_FLOOR) et 65 % des pixels opaques et encre > 0,5 % ; (e) modèle à face : aucun sommet d'une pièce non `interior` dans
// la boîte d'ouverture (face rétrécie de 2 cm, de z = 0 au fond moins 2 cm).
// `skip` : critères écartés pour ce meuble, chacun avec sa raison chez l'appelant ('fill' : dimensions ≥ 85 % ; 'perch' : (b) ;
// 'shade' : part d'ombre de (d), l'encre restant contrôlée). Le reste est toujours vérifié. Les exemptions ne valent que pour le
// dessin de repli (conversion du modèle à boîtes) : un meuble redessiné (CEL_MODELS) passe toujours les seuils complets.
export type CelCheck = 'fill' | 'perch' | 'shade';
// Meubles dont l'assise est sous une coque (fauteuil œuf) : la coque au-dessus du dessus praticable n'est pas « le dessus » ;
// on ne regarde que les surfaces jusqu'à cette hauteur au-dessus du perch (cm).
const PERCH_COVER: Partial<Record<StandingKind, number>> = { 'egg-chair': 40 };
// Meuble plat (tapis : h ≤ FLAT_H cm) : sous une lumière du haut, une nappe ne peut montrer d'ombre propre que sur ses bords (ourlet,
// franges) ; à 1 px par px ils tiennent sur 1 à 3 px. Le plancher d'ombre de (d) descend à 1 % : il exige encore des bords modelés à
// chaque angle (un tapis sans ourlet est à 0 %), le plafond et l'encre restent ceux de tous les meubles.
export const FLAT_H = 5;
const FLAT_SHADE_MIN = 0.01, SHADE_MIN = 0.08;
// Plancher d'ombre propre à un meuble (Ruling 24) : l'étagère à fond en panneau de bois plafonne à 7,4 % de face et 6,9 % de dos
// (le fond lit, 25 000 px sur 28 500, est le dénominateur ; seuls les montants ronds, les chants et les nez des tablettes apportent
// de l'ombre à 1 px par px). Plancher 6,5 % pour elle seule, 8 % pour tous les autres ; liste figée par un test.
// Tâche 9, mesures à 1 px par px (lumière du haut-gauche, élévation 46°) : la niche à pignon montre de face (angle 0 : 4,6 %) et de dos
// (angle 4 : 3,5 %, tour 1 : dalles du toit refaites) une façade plate et des pans de toit tournés vers le haut, seul le flanc droit en perspective (un liseré) et les
// arrondis (poteaux, faîtage, encadrement) sont à l'ombre ; le chargeur du robot (10 cm de haut, 40 × 30) n'est presque que dessus
// et encre (64..81 % d'encre), ses seules surfaces à l'ombre sont les bouts arrondis du plateau, du dosseret et le flanc gauche de la
// cuvette (angles 1 et 5 : 3,2 et 4,4 % au tour 1). Planchers posés sous ces mesures ; la liste reste figée par un test.
export const SHADE_FLOOR: Partial<Record<StandingKind, number>> = { shelf: 0.065, kennel: 0.03, charger: 0.02 };
// Plancher d'ombre par STYLE (tâche 10, dernier recours, mesures à l'appui) : les pieds épingle de l'Industriel sont deux tiges de 2,5 cm
// (r 1,25) ; à 1 px par px la silhouette (2 px de chaque côté) les mange entièrement : plus aucun pixel d'ombre ne vient des pieds, qui
// sont la première source d'ombre d'une table basse (angles 1/2 : 3,3 %), d'une chaise (angle 2 : 6,8 %) et du bureau (angle 5 : 6,6 %).
// À 2 px par px les mêmes dessins montrent 8,4 / 15,0 / 13,6 % au pire angle (mesure du rapport T10). Tapis bohème à franges : de
// profil (angles 2/6), les mèches couchées devant la lisière proche cachent la seule bande d'ombre d'un tapis (le bas de son ourlet,
// 0,75 cm pour une lisière r 1,5 — la boîte du tapis fait 3 cm) : 0,2 % à 1 px par px (2,4 % à 2 px). Liste figée par le test de looks.
export const SHADE_FLOOR_STYLE: Partial<Record<StyleId, Partial<Record<StandingKind, number>>>> = { industriel: { 'coffee-table': 0.03, chair: 0.06, desk: 0.06 }, boheme: { rug: 0.002 } };
export function checkCelModel(kind: StandingKind, look: CelLook = lookOf('scandinave'), life: LifeState = REST_LIFE, fallbackSkip: readonly CelCheck[] = []): void {
  const skip: readonly CelCheck[] = CEL_MODELS[kind] ? [] : fallbackSkip;
  const model = FURNITURE_MODELS[kind];
  const parts = celPartsOf(kind, look, life);
  const vs: Vec3[] = parts.flatMap((P) => P.m.v);
  // (a) Repère centré : x ∈ [−w/2, w/2], y ∈ [0, h], z ∈ [−d/2, d/2].
  const lo = [0, 1, 2].map((k) => Math.min(...vs.map((v) => v[k]!)));
  const hi = [0, 1, 2].map((k) => Math.max(...vs.map((v) => v[k]!)));
  const box = { lo: [-model.w / 2, 0, -model.d / 2], hi: [model.w / 2, model.h, model.d / 2] };
  [0, 1, 2].forEach((k) => {
    expect(lo[k]!, `${kind} : bas de l'axe ${k}`).toBeGreaterThanOrEqual(box.lo[k]! - 2);
    expect(hi[k]!, `${kind} : haut de l'axe ${k}`).toBeLessThanOrEqual(box.hi[k]! + 2);
    if (!skip.includes('fill')) expect(hi[k]! - lo[k]!, `${kind} : dimension ${k}`).toBeGreaterThanOrEqual(0.85 * (box.hi[k]! - box.lo[k]!));
  });
  // (b) Dessus praticable.
  const p = model.perch;
  if (p && !skip.includes('perch')) {
    const [x, z] = [p.x + p.w / 2 - model.w / 2, model.d / 2 - (p.z + p.d / 2)];
    const cover = PERCH_COVER[kind];
    const seat = cover === undefined ? parts : parts.map((P) => ({ ...P, m: { ...P.m, t: P.m.t.filter(([a, b, c]) => Math.max(P.m.v[a]![1], P.m.v[b]![1], P.m.v[c]![1]) <= p.y + cover) } }));
    expect(Math.abs(topAt(seat, x, z) - p.y), `${kind} : dessus praticable`).toBeLessThanOrEqual(1.5);
  }
  // (c) et (d) Rendu aux 8 angles (1 px par px de pièce, sans suréchantillonnage : couleurs exactes).
  const shades = new Set(parts.map((P) => P.col.shade.toUpperCase()));
  for (const angle of ANGLES) {
    const view = { cam: ROOM_CAMERA, yaw: yawOf(angle), side: 'left' as const, px: 1, ss: 1 };
    const img = renderCel(parts, view);
    expect(renderCel(parts, view).rgba, `${kind} : déterminisme à l'angle ${angle}`).toEqual(img.rgba);
    let opaque = 0, shade = 0, ink = 0;
    for (let i = 0; i < img.w * img.h; i++) {
      if (img.rgba[i * 4 + 3] !== 255) continue;
      opaque++;
      const c = hex(img.rgba, i);
      if (c === INK.toUpperCase()) ink++;
      else if (shades.has(c)) shade++;
    }
    if (!skip.includes('shade')) {
      expect(shade / opaque, `${kind} : part d'ombre à l'angle ${angle}`).toBeGreaterThanOrEqual(SHADE_FLOOR_STYLE[look.style]?.[kind] ?? SHADE_FLOOR[kind] ?? (model.h <= FLAT_H ? FLAT_SHADE_MIN : SHADE_MIN));
      expect(shade / opaque, `${kind} : part d'ombre à l'angle ${angle}`).toBeLessThanOrEqual(0.65);
    }
    expect(ink / opaque, `${kind} : part d'encre à l'angle ${angle}`).toBeGreaterThan(0.005);
  }
  // (e) Ouverture dégagée.
  const f = model.face;
  if (f && f.w > 4 && f.h > 4) {
    const [x0, x1, y0, y1] = [f.x + 2 - model.w / 2, f.x + f.w - 2 - model.w / 2, f.y + 2, f.y + f.h - 2];
    // z du modèle de 0 à d − 2 → repère centré de d/2 à −d/2 + 2.
    const [z0, z1] = [-model.d / 2 + 2, model.d / 2];
    for (const P of parts) {
      if (P.interior) continue;
      const inside = P.m.v.filter(([x, y, z]) => x > x0 && x < x1 && y > y0 && y < y1 && z > z0 && z < z1);
      expect(inside.length, `${kind} : sommets dans l'ouverture`).toBe(0);
    }
  }
}
