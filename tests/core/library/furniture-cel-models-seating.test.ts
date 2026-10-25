import { describe, expect, it } from 'vitest';
import '../../../src/core/library/cel/models/seating';
import { REST_LIFE } from '../../../src/core/library/cel/life-state';
import { lookOf } from '../../../src/core/library/cel/looks';
import { CEL_MODELS, celPartsOf } from '../../../src/core/library/cel/models';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { STYLE_IDS } from '../../../src/core/library/library-types';
import { checkCelModel, topAt } from './furniture-cel-checks';

const KINDS = ['sofa', 'loveseat', 'armchair', 'club-chair', 'daybed', 'bench', 'pouf', 'square-pouf', 'beanbag'] as const;
const look = lookOf('scandinave');

// Centre du dessus praticable dans le repère centré (x à droite, z vers le spectateur).
function perchCenter(kind: (typeof KINDS)[number]): [number, number, number] {
  const m = FURNITURE_MODELS[kind], p = m.perch!;
  return [p.x + p.w / 2 - m.w / 2, p.y, m.d / 2 - (p.z + p.d / 2)];
}
const extent = (kind: (typeof KINDS)[number], dent: number) => {
  const vs = celPartsOf(kind, look, { ...REST_LIFE, dent }).flatMap((P) => P.m.v);
  return [0, 2].map((k) => [Math.min(...vs.map((v) => v[k]!)), Math.max(...vs.map((v) => v[k]!))]);
};

describe('assises en tissu en cellulo', () => {
  for (const k of KINDS) it(`${k} : encombrement, dessus, tons, encre, 8 angles`, () => checkCelModel(k));

  it('chaque meuble a son dessin propre (pas de repli celFromModel)', () => {
    for (const k of KINDS) expect(CEL_MODELS[k], k).toBeDefined();
  });

  for (const k of KINDS)
    it(`${k} : dent = 1 abaisse le dessus de l'assise de 2,5 à 4 cm sans changer l'encombrement au sol`, () => {
      const [x, y, z] = perchCenter(k);
      const rest = topAt(celPartsOf(k, look, REST_LIFE), x, z);
      const sat = topAt(celPartsOf(k, look, { ...REST_LIFE, dent: 1 }), x, z);
      expect(Math.abs(rest - y), `${k} : dessus au repos`).toBeLessThanOrEqual(1.5);
      expect(rest - sat, `${k} : creux`).toBeGreaterThanOrEqual(2.5);
      expect(rest - sat, `${k} : creux`).toBeLessThanOrEqual(4);
      const [a, b] = [extent(k, 0), extent(k, 1)];
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) expect(Math.abs(a[i]![j]! - b[i]![j]!), `${k} : emprise au sol`).toBeLessThanOrEqual(0.5);
    });

  it('le canapé lit skirt : sa jupe ondule de ±1 cm au plus, sans bouger le reste', () => {
    const still = celPartsOf('sofa', look, REST_LIFE), moved = celPartsOf('sofa', look, { ...REST_LIFE, skirt: 1 });
    expect(moved.length).toBe(still.length);
    let changed = 0, maxShift = 0;
    still.forEach((P, i) => {
      const Q = moved[i]!;
      P.m.v.forEach((v, j) => {
        const d = Math.hypot(v[0] - Q.m.v[j]![0], v[1] - Q.m.v[j]![1], v[2] - Q.m.v[j]![2]);
        if (d > 1e-9) changed++;
        maxShift = Math.max(maxShift, d);
      });
    });
    expect(changed).toBeGreaterThan(0);
    expect(maxShift).toBeLessThanOrEqual(1.0001);
  });

  it('tous les styles se dessinent (variantes lues sans changer le volume)', () => {
    for (const style of STYLE_IDS)
      for (const k of KINDS) {
        const vs = celPartsOf(k, lookOf(style), REST_LIFE).flatMap((P) => P.m.v);
        const m = FURNITURE_MODELS[k];
        expect(Math.max(...vs.map((v) => v[1])), `${k} ${style}`).toBeLessThanOrEqual(m.h + 2);
        expect(Math.max(...vs.map((v) => Math.abs(v[0]))), `${k} ${style}`).toBeLessThanOrEqual(m.w / 2 + 2);
      }
  });
});
