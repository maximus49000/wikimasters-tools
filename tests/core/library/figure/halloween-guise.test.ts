// tests/core/library/figure/halloween-guise.test.ts — déguisements d'Halloween du pantin (spec Halloween §5.5)
import { describe, expect, it } from 'vitest';
import { bakeFigure, anchorsOf, type FigureKey, type Slot } from '../../../../src/core/library/figure/bake';
import { GUISE_COLORS, guiseOutfit, shapeFromSignature, shapeOf, signatureOf } from '../../../../src/core/library/figure/dress';
import { COSTUMES, TOUCHES, type Guise, type Outfit } from '../../../../src/core/library/city/people';

const girl: Outfit = { skin: '#F2C9A5', hair: 'short', hairColor: '#4a2e1e', hatColor: '#000000', top: 'sweater', topColor: '#C0463A', bottom: 'skirt', bottomColor: '#3B5E8A', accessory: 'bag', accessoryColor: '#8a5a2b' };
const sigOf = (g: Guise): string => signatureOf(shapeOf(guiseOutfit(girl, g), false, 'none', false, g));
const keyOf = (sig: string, yaw: number, arms: FigureKey['arms'] = 'swing'): FigureKey => ({ sig, yaw, gait: 'walk', phase: 3, head: 0, arms, lean: 0 });
const slotsOf = (g: Guise, yaw: number): Set<Slot> => {
  const sig = sigOf(g);
  return new Set(bakeFigure(shapeFromSignature(sig), keyOf(sig, yaw)).groups.flatMap((x) => x.parts.map((p) => p.slot)));
};
const ALL: readonly Guise[] = [...COSTUMES, ...TOUCHES];

describe('déguisements du pantin', () => {
  it('signature : champ « g: » seulement pour un déguisé, relu à l’identique', () => {
    expect(signatureOf(shapeOf(girl, false))).toBe('short.long.skirt.bag.n.n');
    for (const g of ALL) {
      const s = shapeOf(guiseOutfit(girl, g), false, 'none', false, g);
      expect(signatureOf(s).endsWith(`.g:${g}`)).toBe(true);
      expect(shapeFromSignature(signatureOf(s))).toEqual(s);
    }
    // père Noël et déguisement ne se gênent pas à la relecture
    expect(shapeFromSignature('short.long.pants.none.n.n.s').santa).toBe(true);
  });
  it('chaque déguisement a ses pièces, de face comme de dos, sans case sans couleur', () => {
    for (const g of ALL) for (const yaw of [0, 4, 8, 12]) {
      const slots = slotsOf(g, yaw);
      for (const s of slots) if (s.startsWith('cos') || s === 'bone') expect(GUISE_COLORS[g][s as 'cos'], `${g} ${s}`).toBeDefined();
      if (g !== 'zombie') expect([...slots].some((s) => s.startsWith('cos') || s === 'bone'), `${g} ${yaw}`).toBe(true);
    }
  });
  it('fantôme : un drap et les chaussures, rien d’autre ; les yeux de face, pas de dos', () => {
    const sig = sigOf('ghost');
    expect([...slotsOf('ghost', 4)].sort()).toEqual(['cos', 'shoe']);
    expect(bakeFigure(shapeFromSignature(sig), keyOf(sig, 4)).eyes.length).toBe(2);
    expect(bakeFigure(shapeFromSignature(sig), keyOf(sig, 12)).eyes.length).toBe(0);
  });
  it('squelette : os ; vampire : doublure rouge de face, cape noire de dos ; citrouille sculptée de face seulement', () => {
    expect(slotsOf('skeleton', 4).has('bone')).toBe(true);
    expect(slotsOf('vampire', 4).has('cos2')).toBe(true);
    expect(slotsOf('vampire', 12).has('cos')).toBe(true);
    expect(slotsOf('pumpkin', 4).has('cos3')).toBe(true);
    expect(slotsOf('pumpkin', 12).has('cos3')).toBe(false);
  });
  it('tenue de base : couleurs du déguisement, sans sac ; un accessoire garde la tenue', () => {
    expect(guiseOutfit(girl, 'devil')).toMatchObject({ topColor: '#C8302A', accessory: 'none' });
    expect(guiseOutfit(girl, 'horns')).toEqual(girl);
    expect(guiseOutfit(girl, null)).toEqual(girl);
  });
  it('les accroches des mains suivent la pose (seau tenu)', () => {
    const sig = sigOf('witch');
    expect(anchorsOf(keyOf(sig, 4, 'give')).handR).not.toEqual(anchorsOf(keyOf(sig, 4, 'swing')).handR);
  });
});
