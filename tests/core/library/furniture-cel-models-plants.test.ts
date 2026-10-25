import { describe, expect, it } from 'vitest';
import '../../../src/core/library/cel/models/plants';
import { ROOM_CAMERA, yawOf } from '../../../src/core/library/cel/camera';
import { REST_LIFE } from '../../../src/core/library/cel/life-state';
import { lookOf } from '../../../src/core/library/cel/looks';
import { CEL_MODELS, celPartsOf } from '../../../src/core/library/cel/models';
import { RUSTLE_MAX, rustleAngle } from '../../../src/core/library/cel/models/plants';
import { renderCel } from '../../../src/core/library/cel/raster';
import { LIFE_SPECS } from '../../../src/core/library/furniture-life-specs';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { STYLE_IDS } from '../../../src/core/library/library-types';
import { checkCelModel } from './furniture-cel-checks';

const KINDS = ['plant', 'monstera', 'strelitzia', 'palm', 'cactus', 'pampas'] as const;
const look = lookOf('scandinave');
// Teintes du feuillage (ce qui frémit) ; tout le reste (pot, terreau, tiges rigides, vase) doit rester immobile.
const FOLIAGE = new Set([look.tones.leaf, look.tones.leafDark, look.tones.shade, look.tones.fabric]);
const view = (angle: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7) => ({ cam: ROOM_CAMERA, yaw: yawOf(angle), side: 'left' as const, px: 1, ss: 1 });

describe('plantes en cellulo', () => {
  for (const k of KINDS) it(`${k} : encombrement, dessus, tons, encre, 8 angles`, () => checkCelModel(k));

  it('chaque meuble a son dessin propre (pas de repli celFromModel)', () => {
    for (const k of KINDS) expect(CEL_MODELS[k], k).toBeDefined();
  });

  for (const k of KINDS)
    it(`${k} : deux valeurs de rustle donnent deux images différentes et le même pot`, () => {
      const rest = celPartsOf(k, look, REST_LIFE), moved = celPartsOf(k, look, { ...REST_LIFE, rustle: 1 });
      expect(moved.length).toBe(rest.length);
      // Même image de départ ? Non : le feuillage a bougé.
      expect(renderCel(moved, view(0)).rgba).not.toEqual(renderCel(rest, view(0)).rgba);
      // Le pot (toute pièce hors feuillage qui ne dépasse pas le plus haut des pots, le vase du pampas à 62,3) est identique, sommet pour sommet.
      const pot = rest.map((P, i) => [P, moved[i]!] as const).filter(([P]) => !FOLIAGE.has(P.col) && Math.max(...P.m.v.map((v) => v[1])) <= 64);
      expect(pot.length, `${k} : pièces de pot`).toBeGreaterThan(0);
      for (const [a, b] of pot) expect(b.m.v).toEqual(a.m.v);
      // Au moins une pièce de feuillage s'est déplacée, d'au plus 6° autour de sa base : aucun sommet ne bouge de plus que ce
      // qu'autorise une rotation de 6° à sa distance du pivot (majorée par la diagonale du meuble).
      const m = FURNITURE_MODELS[k];
      const reach = Math.hypot(m.w, m.h, m.d);
      let maxMove = 0;
      rest.forEach((P, i) => {
        P.m.v.forEach((v, j) => {
          const q = moved[i]!.m.v[j]!;
          maxMove = Math.max(maxMove, Math.hypot(q[0] - v[0], q[1] - v[1], q[2] - v[2]));
        });
      });
      expect(maxMove).toBeGreaterThan(0.3); // la fleur du cactus (4 cm) ne bouge que de 0,4 cm
      expect(maxMove).toBeLessThanOrEqual(2 * reach * Math.sin(RUSTLE_MAX / 2));
    });

  it('quatre poses de bruissement (0,25 ; 0,5 ; 0,75 ; 1) donnent quatre images distinctes du monstera', () => {
    const imgs = [0.25, 0.5, 0.75, 1].map((rustle) => renderCel(celPartsOf('monstera', look, { ...REST_LIFE, rustle }), view(0)).rgba);
    for (let i = 0; i < imgs.length; i++) for (let j = i + 1; j < imgs.length; j++) expect(imgs[i]).not.toEqual(imgs[j]);
  });

  it('la flexion d’une feuille vaut au plus 6°, est nulle au repos et a une phase propre à chaque feuille', () => {
    expect(RUSTLE_MAX).toBeCloseTo((6 * Math.PI) / 180, 10);
    const angles = [0, 1, 2, 3, 4, 5].map((k) => rustleAngle(k, 1));
    for (let k = 0; k < 6; k++) {
      expect(rustleAngle(k, 0)).toBe(0);
      expect(Math.abs(angles[k]!)).toBeLessThanOrEqual(RUSTLE_MAX);
      expect(Math.abs(rustleAngle(k, 0.5))).toBeLessThanOrEqual(RUSTLE_MAX / 2 + 1e-12);
    }
    expect(new Set(angles.map((a) => a.toFixed(6))).size).toBe(6);
    expect(angles.some((a) => a > 0) && angles.some((a) => a < 0)).toBe(true);
  });

  it('le bruissement est déclaré pour les six plantes (données de mouvement)', () => {
    for (const k of KINDS) expect(LIFE_SPECS[k]?.rustle, k).toBe(true);
  });

  it('tous les styles se dessinent dans la boîte du modèle (couleurs de la palette seulement)', () => {
    for (const style of STYLE_IDS)
      for (const k of KINDS) {
        const L = lookOf(style);
        const parts = celPartsOf(k, L, REST_LIFE);
        const vs = parts.flatMap((P) => P.m.v);
        const m = FURNITURE_MODELS[k];
        expect(Math.max(...vs.map((v) => v[1])), `${k} ${style}`).toBeLessThanOrEqual(m.h + 2);
        expect(Math.min(...vs.map((v) => v[1])), `${k} ${style}`).toBeGreaterThanOrEqual(-2);
        expect(Math.max(...vs.map((v) => Math.abs(v[0]))), `${k} ${style}`).toBeLessThanOrEqual(m.w / 2 + 2);
        expect(Math.max(...vs.map((v) => Math.abs(v[2]))), `${k} ${style}`).toBeLessThanOrEqual(m.d / 2 + 2);
        const palette = new Set(Object.values(L.tones));
        for (const P of parts) expect(palette.has(P.col), `${k} ${style} : teinte hors palette`).toBe(true);
      }
  });
});
