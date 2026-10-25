import { describe, expect, it } from 'vitest';
import { REST_LIFE } from '../../../src/core/library/cel/life-state';
import { lookOf } from '../../../src/core/library/cel/looks';
import { CEL_MODELS, celItemPartsOf, celPartsOf } from '../../../src/core/library/cel/models';
import { celFromModel } from '../../../src/core/library/cel/convert';
import { spriteKey } from '../../../src/core/library/cel/sprite-key';
import { WARM_LIT } from '../../../src/core/library/cel/tone';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { overhangOf } from '../../../src/core/library/furniture-render3d';
import { STANDING_KINDS } from '../../../src/core/library/library-types';
import { checkCelModel, type CelCheck } from './furniture-cel-checks';

const look = lookOf('scandinave');

// Limites connues du dessin de repli (modèle à boîtes converti), levées quand le meuble est redessiné (tâches 5 à 10) :
// - 'shade' : boîtes vues de face avec la lumière du haut-gauche : face avant et dessus éclairés, le flanc ombré à peine visible
//   (moins de 8 % d'ombre à l'angle 0, jusqu'à 0 % pour un tapis ou un pouf cube) ;
// - 'fill' : encombrement déclaré du modèle plus large que ses pièces (feuillages bornés par leur demi-largeur sur chaque axe,
//   anneaux du globe non convertis, pot plus étroit que la boîte) ;
// - 'perch' : dessus praticable au-dessus d'un creux non converti (assise du pouf poire) ou d'un jour entre deux coussins (causeuse).
const FALLBACK_LIMITS: Partial<Record<(typeof STANDING_KINDS)[number], CelCheck[]>> = {
  basket: ['shade'], bowl: ['shade'], kennel: ['shade'],
  telescope: ['fill', 'shade'],
  charger: ['shade'],
  globe: ['fill'],
};

describe('conversion des modèles à boîtes en maillages cellulo', () => {
  it('un meuble sans dessin propre passe par la conversion de son modèle, pièce pour pièce', () => {
    const pending = STANDING_KINDS.filter((k) => !CEL_MODELS[k]);
    expect(pending.length).toBeGreaterThan(0);
    for (const k of pending) expect(celPartsOf(k, look, REST_LIFE).length, k).toBe(celFromModel(FURNITURE_MODELS[k], look).length);
  });

  for (const k of STANDING_KINDS) it(`${k} : encombrement, dessus, déterminisme, ombre et encre, ouverture`, () => checkCelModel(k, look, REST_LIFE, FALLBACK_LIMITS[k]));

  it('les exemptions du repli ne valent plus pour un meuble redessiné : seuils complets', () => {
    // Un meuble encore en repli, exempté d'ombre ; « redessiné » à l'identique (même conversion), il doit échouer au seuil d'ombre complet.
    const k = STANDING_KINDS.find((k) => !CEL_MODELS[k] && FALLBACK_LIMITS[k]?.includes('shade'))!;
    expect(k).toBeDefined();
    expect(() => checkCelModel(k, look, REST_LIFE, FALLBACK_LIMITS[k])).not.toThrow();
    CEL_MODELS[k] = (l) => celFromModel(FURNITURE_MODELS[k], l);
    try {
      expect(() => checkCelModel(k, look, REST_LIFE, FALLBACK_LIMITS[k])).toThrow(/part d'ombre/);
    } finally {
      delete CEL_MODELS[k];
    }
  });

  it('lampe allumée : l’abat-jour est lumineux ; éteinte, aucune pièce lumineuse', () => {
    const lit = celPartsOf('lamp', look, REST_LIFE, { lit: true });
    expect(lit.some((P) => P.glow && P.col === WARM_LIT)).toBe(true);
    expect(celPartsOf('lamp', look, REST_LIFE).some((P) => P.glow)).toBe(false);
    // Un meuble sans abat-jour ne s'allume jamais.
    expect(celPartsOf('sofa', look, REST_LIFE, { lit: true }).some((P) => P.glow)).toBe(false);
  });

  it('lampadaire arc : le surplomb ne contient que l’arc et le dôme, le socle le reste', () => {
    const model = FURNITURE_MODELS['arc-lamp'];
    const b = model.base!;
    const over = celPartsOf('arc-lamp', look, REST_LIFE, { part: 'overhang' });
    const base = celPartsOf('arc-lamp', look, REST_LIFE, { part: 'base' });
    expect(over.length).toBe(overhangOf(model)!.pieces.size);
    expect(over.length + base.length).toBe(celPartsOf('arc-lamp', look, REST_LIFE).length);
    // Règle d'overhangOf : une pièce du surplomb est entièrement hors du socle (à gauche, x du modèle) ; une pièce du socle le chevauche.
    const maxX = (P: (typeof over)[number]) => Math.max(...P.m.v.map((v) => v[0] + model.w / 2));
    for (const P of over) expect(maxX(P)).toBeLessThanOrEqual(b.x + 0.5);
    for (const P of base) expect(maxX(P)).toBeGreaterThan(b.x + 0.5);
  });

  it('garniture Steampunk ajoutée dans une pièce Steampunk seulement', () => {
    expect(celPartsOf('desk', lookOf('steampunk'), REST_LIFE).length).toBeGreaterThan(celPartsOf('desk', look, REST_LIFE).length);
  });

  it('conversion de l’étagère : tablettes et fond marqués visibles à travers l’ouverture, montants non', () => {
    const parts = celFromModel(FURNITURE_MODELS.shelf, look);
    expect(parts.filter((P) => P.interior).length).toBe(3); // fond + deux tablettes
  });

  it('objet porté : repère centré sur son point de pose, quelle que soit sa place', () => {
    const at = (x: number) => celItemPartsOf({ key: 'a', shape: 'cd', x, y: 10, z: 3 }, look, false);
    expect(at(5).map((P) => P.m.v)).toEqual(at(40).map((P) => P.m.v));
    const ys = at(5).flatMap((P) => P.m.v.map((v) => v[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-0.01);
  });

  it('clés : version, résolution au quart', () => {
    const s = { kind: 'sofa', angle: 1, style: 'scandinave', side: 'left', cam: 'room', res: 3.1, lit: false, life: '' } as const;
    expect(spriteKey(s)).toMatch(/^cel11\|/);
    expect(spriteKey(s)).toBe(spriteKey({ ...s, res: 2.95 }));
    expect(spriteKey(s)).not.toBe(spriteKey({ ...s, res: 3.25 }));
    expect(spriteKey(s)).not.toBe(spriteKey({ ...s, part: 'base' }));
  });
});
