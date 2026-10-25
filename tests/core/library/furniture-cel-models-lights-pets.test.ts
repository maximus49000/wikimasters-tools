import { describe, expect, it } from 'vitest';
import '../../../src/core/library/cel/models/lights-pets';
import { ROOM_CAMERA, yawOf } from '../../../src/core/library/cel/camera';
import { REST_LIFE } from '../../../src/core/library/cel/life-state';
import { lookOf } from '../../../src/core/library/cel/looks';
import { CEL_MODELS, celPartsOf } from '../../../src/core/library/cel/models';
import { PAPER } from '../../../src/core/library/cel/models/lights-pets';
import { renderCel } from '../../../src/core/library/cel/raster';
import { WARM_LIT } from '../../../src/core/library/cel/tone';
import { LIFE_SPECS } from '../../../src/core/library/furniture-life-specs';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { STYLE_IDS } from '../../../src/core/library/library-types';
import { checkCelModel, topAt } from './furniture-cel-checks';

const KINDS = ['lamp', 'arc-lamp', 'paper-lantern', 'basket', 'bowl', 'kennel', 'charger'] as const;
const LAMPS = ['lamp', 'arc-lamp', 'paper-lantern'] as const;
const look = lookOf('scandinave');
const view = (angle: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7) => ({ cam: ROOM_CAMERA, yaw: yawOf(angle), side: 'left' as const, px: 1, ss: 1 });

describe('lampes et coin des animaux en cellulo', () => {
  for (const k of KINDS) it(`${k} : encombrement, dessus, tons, encre, 8 angles`, () => checkCelModel(k));

  it('chaque meuble a son dessin propre (pas de repli celFromModel)', () => {
    for (const k of KINDS) expect(CEL_MODELS[k], k).toBeDefined();
  });

  it('lampadaire arc : socle et surplomb se partagent toutes les pièces, sans doublon ; le surplomb est entièrement hors du socle', () => {
    const model = FURNITURE_MODELS['arc-lamp'], b = model.base!;
    const all = celPartsOf('arc-lamp', look, REST_LIFE);
    const base = celPartsOf('arc-lamp', look, REST_LIFE, { part: 'base' });
    const over = celPartsOf('arc-lamp', look, REST_LIFE, { part: 'overhang' });
    expect(base.length + over.length).toBe(all.length);
    expect(base.length).toBeGreaterThan(0);
    expect(over.length).toBeGreaterThan(0);
    // Chaque pièce est d'un seul côté (chaque appel reconstruit les maillages : comparaison par les sommets).
    const same = (a: (typeof all)[number], b: (typeof all)[number]) => a.m.v.length === b.m.v.length && a.m.v.every((v, i) => v[0] === b.m.v[i]![0] && v[1] === b.m.v[i]![1] && v[2] === b.m.v[i]![2]);
    for (const P of all) expect([...base, ...over].filter((Q) => same(P, Q)).length, 'pièce présente une fois').toBe(1);
    // Règle du surplomb (overhangOf) : hors du socle à 0,5 cm près, en x du modèle ; le socle, lui, chevauche son emprise.
    const maxX = (P: (typeof all)[number]) => Math.max(...P.m.v.map((v) => v[0] + model.w / 2));
    for (const P of over) expect(maxX(P)).toBeLessThanOrEqual(b.x + 0.5);
    for (const P of base) expect(maxX(P)).toBeGreaterThan(b.x + 0.5);
    // Le dôme (autour du point de lueur) et son arc sont dans le surplomb ; le socle au sol est dans la base.
    const g = model.glow!;
    const near = (P: (typeof all)[number]) => P.m.v.some((v) => Math.hypot(v[0] - (g[0] - model.w / 2), v[1] - g[1], v[2] - (model.d / 2 - g[2])) < 20);
    expect(over.some(near)).toBe(true);
    expect(base.some((P) => P.m.v.some((v) => v[1] < 1))).toBe(true);
  });

  for (const k of LAMPS)
    it(`${k} : allumée, l'abat-jour est lumineux (WARM_LIT, sans ombre) ; éteinte, aucune pièce lumineuse et le même volume`, () => {
      const lit = celPartsOf(k, look, REST_LIFE, { lit: true }), off = celPartsOf(k, look, REST_LIFE);
      const glowing = lit.filter((P) => P.glow);
      expect(glowing.length).toBeGreaterThan(0);
      for (const P of glowing) expect(P.col).toBe(WARM_LIT);
      expect(off.some((P) => P.glow)).toBe(false);
      expect(lit.length).toBe(off.length);
      lit.forEach((P, i) => expect(P.m.v).toEqual(off[i]!.m.v));
      // L'image allumée n'est pas l'image éteinte.
      expect(renderCel(lit, view(0)).rgba).not.toEqual(renderCel(off, view(0)).rgba);
    });

  it('lanterne : éteinte, le globe est au ton papier de la maquette ; allumée, tout le globe s’allume', () => {
    const off = celPartsOf('paper-lantern', look, REST_LIFE);
    const paper = off.filter((P) => P.col === PAPER);
    expect(paper.length).toBeGreaterThan(0);
    const lit = celPartsOf('paper-lantern', look, REST_LIFE, { lit: true });
    off.forEach((P, i) => {
      if (P.col === PAPER) expect(lit[i]!.glow).toBe(true);
      else expect(lit[i]!.col).toBe(P.col);
    });
    expect(PAPER).toEqual({ base: '#FBE4A6', shade: '#EACB8A', hi: '#FFF2C8' });
  });

  it('panier : dent = 1 creuse le coussin de 2 à 4 cm sous le point de repos, sans toucher la vannerie ni l’emprise au sol', () => {
    const m = FURNITURE_MODELS.basket, poi = m.pois!.find((p) => p.type === 'curl')!;
    const [x, z] = [poi.x - m.w / 2, m.d / 2 - poi.z];
    const rest = celPartsOf('basket', look, REST_LIFE), sat = celPartsOf('basket', look, { ...REST_LIFE, dent: 1 });
    expect(sat.length).toBe(rest.length);
    const cushion = (parts: typeof rest) => parts.filter((P) => P.col === look.tones.fabricLight);
    expect(cushion(rest).length).toBeGreaterThan(0);
    const drop = topAt(cushion(rest), x, z) - topAt(cushion(sat), x, z);
    expect(drop).toBeGreaterThanOrEqual(2);
    expect(drop).toBeLessThanOrEqual(4);
    // Le coussin au repos affleure le point de repos du modèle (y 11) ; la vannerie est immobile.
    expect(Math.abs(topAt(cushion(rest), x, z) - poi.y)).toBeLessThanOrEqual(1.5);
    rest.forEach((P, i) => {
      if (P.col !== look.tones.fabricLight) expect(sat[i]!.m.v).toEqual(P.m.v);
    });
    const floor = (parts: typeof rest) => parts.flatMap((P) => P.m.v.filter((v) => v[1] < 1)).map((v) => [v[0], v[2]]);
    expect(floor(sat)).toEqual(floor(rest));
    // Données de mouvement déclarées pour la tâche 15.
    expect(LIFE_SPECS.basket?.dent?.[0]).toEqual({ at: [x, poi.y, z], r: 12, depth: 3 });
  });

  it('tous les styles se dessinent dans la boîte du modèle (palette du style, plus le papier de la lanterne)', () => {
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
        for (const P of parts) expect(palette.has(P.col) || P.col === PAPER, `${k} ${style} : teinte hors palette`).toBe(true);
      }
  });
});
