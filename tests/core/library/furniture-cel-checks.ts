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
import type { StandingKind } from '../../../src/core/library/library-types';
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

// Contrôles d'un dessin cellulo de meuble : (a) encombrement ⊂ boîte du modèle à 2 cm près, chaque dimension ≥ 85 % ; (b) dessus
// praticable à ±1,5 cm du maillage le plus haut sous son centre ; (c) rendu déterministe aux 8 angles ; (d) à chaque angle, ombre
// propre entre 8 % et 65 % des pixels opaques et encre > 0,5 % ; (e) modèle à face : aucun sommet d'une pièce non `interior` dans
// la boîte d'ouverture (face rétrécie de 2 cm, de z = 0 au fond moins 2 cm).
// `skip` : critères écartés pour ce meuble, chacun avec sa raison chez l'appelant ('fill' : dimensions ≥ 85 % ; 'perch' : (b) ;
// 'shade' : part d'ombre de (d), l'encre restant contrôlée). Le reste est toujours vérifié. Les exemptions ne valent que pour le
// dessin de repli (conversion du modèle à boîtes) : un meuble redessiné (CEL_MODELS) passe toujours les seuils complets.
export type CelCheck = 'fill' | 'perch' | 'shade';
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
    expect(Math.abs(topAt(parts, x, z) - p.y), `${kind} : dessus praticable`).toBeLessThanOrEqual(1.5);
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
      expect(shade / opaque, `${kind} : part d'ombre à l'angle ${angle}`).toBeGreaterThanOrEqual(0.08);
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
