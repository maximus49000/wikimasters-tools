import { describe, expect, it } from 'vitest';
import '../../../src/core/library/cel/models/storage';
import { REST_LIFE } from '../../../src/core/library/cel/life-state';
import { lookOf, type CelLook } from '../../../src/core/library/cel/looks';
import { CEL_MODELS, celPartsOf } from '../../../src/core/library/cel/models';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { levelsOf } from '../../../src/core/library/furniture-render3d';
import { STANDING_KINDS, STYLE_IDS } from '../../../src/core/library/library-types';
import { checkCelModel, FLAT_H, SHADE_FLOOR, topAt } from './furniture-cel-checks';

const KINDS = ['shelf', 'desk', 'dresser', 'side-table', 'coffee-table', 'rug'] as const;
const look = lookOf('scandinave');
const fringed: CelLook = { ...look, variant: { ...look.variant, throw: 'fringed' } };

// Plus haute surface sous (x, z) parmi les triangles qui ne dépassent pas `maxY` (pour isoler une tablette sous celles du dessus).
const topBelow = (parts: ReturnType<typeof celPartsOf>, x: number, z: number, maxY: number) =>
  topAt(parts.map((P) => ({ ...P, m: { ...P.m, t: P.m.t.filter(([a, b, c]) => Math.max(P.m.v[a]![1], P.m.v[b]![1], P.m.v[c]![1]) <= maxY) } })), x, z);

describe('rangements, tables et tapis en cellulo', () => {
  for (const k of KINDS) it(`${k} : encombrement, dessus, tons, encre, 8 angles`, () => checkCelModel(k));

  it('chaque meuble a son dessin propre (pas de repli celFromModel)', () => {
    for (const k of KINDS) expect(CEL_MODELS[k], k).toBeDefined();
  });

  it('les niveaux de l’étagère (levelsOf) sont inchangés : les objets rangés gardent leurs tablettes', () => {
    const levels = levelsOf(FURNITURE_MODELS.shelf);
    expect(levels.length).toBe(3);
    const expected = [[0, 56 / 169], [59 / 169, 116 / 169], [119 / 169, 1]];
    levels.forEach(([a, b], i) => {
      expect(a).toBeCloseTo(expected[i]![0]!, 9);
      expect(b).toBeCloseTo(expected[i]![1]!, 9);
    });
  });

  it('chaque tablette de l’étagère est dessinée à ±1 cm de sa hauteur du modèle, sur toute la largeur utile', () => {
    const shelf = FURNITURE_MODELS.shelf, face = shelf.face!;
    const tops = levelsOf(shelf).map(([, bottom]) => face.y + face.h * (1 - bottom)); // 121, 61, 8 (dessus des tablettes, cf. carried-items)
    const parts = celPartsOf('shelf', look, REST_LIFE);
    for (const top of tops)
      for (const x of [-30, -15, 0, 15, 30])
        for (const z of [11, 4, -6]) expect(Math.abs(topBelow(parts, x, z, top + 2) - top), `tablette ${top} en (${x}, ${z})`).toBeLessThanOrEqual(1);
  });

  it('étagère : le fond et le dessus des tablettes sont marqués interior, les montants non', () => {
    const parts = celPartsOf('shelf', look, REST_LIFE);
    const interior = parts.filter((P) => P.interior);
    expect(interior.length).toBeGreaterThanOrEqual(3);
    // Le fond : une pièce interior dont les sommets vont au moins jusqu'à z −13 (le panneau du fond du modèle est à z 28..30).
    expect(interior.some((P) => Math.min(...P.m.v.map((v) => v[2])) <= -13 && Math.max(...P.m.v.map((v) => v[1])) > 150)).toBe(true);
    // Les montants (|x| > 35) ne sont jamais interior.
    for (const P of parts) if (P.m.v.every((v) => Math.abs(v[0]) > 35)) expect(P.interior, 'montant').toBeFalsy();
  });

  it('bureau, table basse, commode, guéridon : le dessus praticable est plan sur toute sa surface (objets posés à plat)', () => {
    for (const k of ['desk', 'coffee-table', 'dresser', 'side-table'] as const) {
      const m = FURNITURE_MODELS[k], p = m.perch!;
      const parts = celPartsOf(k, look, REST_LIFE);
      const cx = p.x + p.w / 2 - m.w / 2, cz = m.d / 2 - (p.z + p.d / 2);
      for (const [dx, dz] of [[0, 0], [p.w * 0.3, 0], [-p.w * 0.3, 0], [0, p.d * 0.3], [0, -p.d * 0.3]] as const)
        expect(Math.abs(topAt(parts, cx + dx, cz + dz) - p.y), `${k} en (${dx}, ${dz})`).toBeLessThanOrEqual(1);
    }
  });

  it('tapis : plat (3 cm au plus), sans ombre portée, franges selon la variante sans sortir de la boîte', () => {
    const plain = celPartsOf('rug', look, REST_LIFE);
    expect(plain.every((P) => P.noshadow)).toBe(true);
    expect(Math.max(...plain.flatMap((P) => P.m.v.map((v) => v[1])))).toBeLessThanOrEqual(3);
    const withFringes = celPartsOf('rug', fringed, REST_LIFE);
    expect(withFringes.length).toBeGreaterThan(plain.length);
    expect(withFringes.every((P) => P.noshadow)).toBe(true);
    const vs = withFringes.flatMap((P) => P.m.v);
    expect(Math.max(...vs.map((v) => Math.abs(v[0])))).toBeLessThanOrEqual(102);
    expect(Math.max(...vs.map((v) => Math.abs(v[2])))).toBeLessThanOrEqual(72);
    expect(Math.min(...vs.map((v) => v[1]))).toBeGreaterThanOrEqual(-0.01);
  });

  it('la règle « meuble plat » du contrôle (plancher d’ombre 1 %) ne concerne que le tapis', () => {
    expect(STANDING_KINDS.filter((k) => FURNITURE_MODELS[k].h <= FLAT_H)).toEqual(['rug']);
  });

  it('le plancher d’ombre abaissé (Ruling 24) ne concerne que l’étagère (6,5 %), la niche (3 %) et le chargeur (2 %), mesures à l’appui', () => {
    expect(SHADE_FLOOR).toEqual({ shelf: 0.065, kennel: 0.03, charger: 0.02 });
  });

  it('commode : trois tiroirs à deux poignées, poignées en métal devant la façade', () => {
    const T = look.tones;
    const parts = celPartsOf('dresser', look, REST_LIFE);
    const knobs = parts.filter((P) => P.col === T.metal);
    expect(knobs.length).toBe(6);
    // Chaque bouton dépasse la façade là où il est posé (sommets du meuble à moins de 3 cm de son centre, en x et y).
    const wood = parts.filter((P) => P.col !== T.metal).flatMap((P) => P.m.v);
    for (const k of knobs) {
      const [kx, ky] = [0, 1].map((i) => k.m.v.reduce((s, v) => s + v[i]!, 0) / k.m.v.length);
      const front = Math.max(...wood.filter((v) => Math.abs(v[0] - kx!) < 3 && Math.abs(v[1] - ky!) < 3).map((v) => v[2]));
      expect(Math.max(...k.m.v.map((v) => v[2]))).toBeGreaterThan(front);
    }
    // Trois hauteurs de poignées distinctes.
    expect(new Set(knobs.map((k) => Math.round(k.m.v.reduce((s, v) => s + v[1], 0) / k.m.v.length / 5))).size).toBe(3);
  });

  it('tous les styles se dessinent (variantes lues sans changer le volume)', () => {
    for (const style of STYLE_IDS)
      for (const k of KINDS) {
        const vs = celPartsOf(k, lookOf(style), REST_LIFE).flatMap((P) => P.m.v);
        const m = FURNITURE_MODELS[k];
        expect(Math.max(...vs.map((v) => v[1])), `${k} ${style}`).toBeLessThanOrEqual(m.h + 2);
        expect(Math.min(...vs.map((v) => v[1])), `${k} ${style}`).toBeGreaterThanOrEqual(-2);
        expect(Math.max(...vs.map((v) => Math.abs(v[0]))), `${k} ${style}`).toBeLessThanOrEqual(m.w / 2 + 2);
        expect(Math.max(...vs.map((v) => Math.abs(v[2]))), `${k} ${style}`).toBeLessThanOrEqual(m.d / 2 + 2);
      }
  });
});
