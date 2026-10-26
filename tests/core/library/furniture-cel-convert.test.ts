import { describe, expect, it } from 'vitest';
import { REST_LIFE } from '../../../src/core/library/cel/life-state';
import { lookOf } from '../../../src/core/library/cel/looks';
import { CEL_MODELS, celItemPartsOf, celPartsOf } from '../../../src/core/library/cel/models';
import { celFromModel } from '../../../src/core/library/cel/convert';
import { spriteKey } from '../../../src/core/library/cel/sprite-key';
import { WARM_LIT } from '../../../src/core/library/cel/tone';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { STANDING_KINDS } from '../../../src/core/library/library-types';
import { checkCelModel } from './furniture-cel-checks';

const look = lookOf('scandinave');

// Depuis la tâche 10, les 36 meubles ont leur dessin propre : plus aucune limite de repli (FALLBACK_LIMITS vide, Ruling 11). La
// conversion reste le dessin de secours d'un meuble qui n'aurait pas (encore) de dessin : testée en retirant un dessin le temps du test.
describe('conversion des modèles à boîtes en maillages cellulo', () => {
  it('les 36 meubles ont un dessin propre ; un meuble sans dessin passe par la conversion de son modèle, pièce pour pièce', () => {
    expect(STANDING_KINDS.filter((k) => !CEL_MODELS[k])).toEqual([]);
    const k = 'bowl', saved = CEL_MODELS[k]!;
    delete CEL_MODELS[k];
    try {
      expect(celPartsOf(k, look, REST_LIFE).length).toBe(celFromModel(FURNITURE_MODELS[k], look).length);
    } finally {
      CEL_MODELS[k] = saved;
    }
  });

  for (const k of STANDING_KINDS) it(`${k} : encombrement, dessus, déterminisme, ombre et encre, ouverture`, () => checkCelModel(k, look, REST_LIFE));

  it('les exemptions du repli ne valent pas pour un meuble redessiné : seuils complets', () => {
    // Le modèle à boîtes de la lunette, converti, ne remplit pas sa boîte (trépied étroit) : en repli il passait avec 'fill' et 'shade' ;
    // « redessiné » à l'identique (même conversion), les exemptions sont ignorées et le seuil complet tombe.
    const k = 'telescope', saved = CEL_MODELS[k]!;
    delete CEL_MODELS[k];
    try {
      expect(() => checkCelModel(k, look, REST_LIFE, ['fill', 'shade'])).not.toThrow();
      CEL_MODELS[k] = (l) => celFromModel(FURNITURE_MODELS[k], l);
      expect(() => checkCelModel(k, look, REST_LIFE, ['fill', 'shade'])).toThrow(/part d'ombre|dimension/);
    } finally {
      CEL_MODELS[k] = saved;
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
    expect(over.length).toBeGreaterThan(0);
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
    expect(spriteKey(s)).toMatch(/^cel17\|/);
    expect(spriteKey(s)).toBe(spriteKey({ ...s, res: 2.95 }));
    expect(spriteKey(s)).not.toBe(spriteKey({ ...s, res: 3.25 }));
    expect(spriteKey(s)).not.toBe(spriteKey({ ...s, part: 'base' }));
  });
});
