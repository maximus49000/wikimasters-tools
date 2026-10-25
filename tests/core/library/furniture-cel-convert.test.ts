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
  shelf: ['shade'], desk: ['shade'], chair: ['shade'], basket: ['shade'], bowl: ['shade'], kennel: ['shade'], 'coffee-table': ['shade'], rug: ['shade'],
  telescope: ['fill', 'shade'], 'egg-chair': ['fill', 'perch'], 'peacock-chair': ['fill', 'shade'], loveseat: ['perch', 'shade'],
  charger: ['shade'], 'rocking-chair': ['shade'], 'club-chair': ['shade'], daybed: ['shade'], bench: ['shade'], dresser: ['shade'], 'side-table': ['shade'], 'square-pouf': ['shade'],
  globe: ['fill'], monstera: ['fill'], strelitzia: ['fill'], palm: ['fill'], cactus: ['fill'], pampas: ['fill'],
  beanbag: ['perch'],
};

describe('conversion des modèles à boîtes en maillages cellulo', () => {
  it('aucun dessin propre encore : tout passe par la conversion', () => expect(Object.keys(CEL_MODELS)).toEqual([]));

  for (const k of STANDING_KINDS) it(`${k} : encombrement, dessus, déterminisme, ombre et encre, ouverture`, () => checkCelModel(k, look, REST_LIFE, FALLBACK_LIMITS[k]));

  it('les exemptions du repli ne valent plus pour un meuble redessiné : seuils complets', () => {
    // Pouf cube exempté d'ombre en repli ; « redessiné » à l'identique (même conversion), il doit échouer au seuil d'ombre complet.
    expect(() => checkCelModel('square-pouf', look, REST_LIFE, FALLBACK_LIMITS['square-pouf'])).not.toThrow();
    CEL_MODELS['square-pouf'] = (l) => celFromModel(FURNITURE_MODELS['square-pouf'], l);
    try {
      expect(() => checkCelModel('square-pouf', look, REST_LIFE, FALLBACK_LIMITS['square-pouf'])).toThrow(/part d'ombre/);
    } finally {
      delete CEL_MODELS['square-pouf'];
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

  it('étagère : tablettes et fond marqués visibles à travers l’ouverture, montants non', () => {
    const parts = celPartsOf('shelf', look, REST_LIFE);
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
    expect(spriteKey(s)).toMatch(/^cel1\|/);
    expect(spriteKey(s)).toBe(spriteKey({ ...s, res: 2.95 }));
    expect(spriteKey(s)).not.toBe(spriteKey({ ...s, res: 3.25 }));
    expect(spriteKey(s)).not.toBe(spriteKey({ ...s, part: 'base' }));
  });
});
