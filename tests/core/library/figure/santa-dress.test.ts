// tests/core/library/figure/santa-dress.test.ts — tenue du père Noël (G5) : signature à septième champ, pièces cuites
import { describe, expect, it } from 'vitest';
import { bakeFigure, type FigureKey, type Slot } from '../../../../src/core/library/figure/bake';
import { shapeFromSignature, shapeOf, signatureOf } from '../../../../src/core/library/figure/dress';
import type { Outfit } from '../../../../src/core/library/city/people';

// Tenue de santa-layer.tsx (SANTA_OUTFIT) : manteau et pantalon rouges, bonnet.
const santa: Outfit = { skin: '#F0C8A0', hair: 'beanie', hairColor: '#E8E8E8', hatColor: '#C0302B', top: 'coat', topColor: '#C0302B', bottom: 'pants', bottomColor: '#C0302B', accessory: 'none', accessoryColor: '#C0302B' };
const girl: Outfit = { skin: '#F2C9A5', hair: 'short', hairColor: '#4a2e1e', hatColor: '#000000', top: 'sweater', topColor: '#C0463A', bottom: 'skirt', bottomColor: '#3B5E8A', accessory: 'bag', accessoryColor: '#8a5a2b' };
const SANTA_SLOTS: readonly Slot[] = ['beard', 'fur', 'belt', 'buckle', 'glove', 'nose', 'cheek'];
const keyOf = (sig: string, yaw: number, gait: FigureKey['gait'] = 'stand', phase = 0): FigureKey => ({ sig, yaw, gait, phase, head: 0, arms: 'swing', lean: 0 });
const slotsOf = (sig: string, yaw: number, gait: FigureKey['gait'] = 'stand', phase = 0): Set<Slot> => {
  const b = bakeFigure(shapeFromSignature(sig), keyOf(sig, yaw, gait, phase));
  return new Set(b.groups.flatMap((g) => g.parts.map((p) => p.slot)));
};

describe('tenue du père Noël', () => {
  it('signature inchangée hors père Noël (six champs), septième champ « s » relu avec santa', () => {
    const plain = shapeOf(santa, false, 'none');
    expect(signatureOf(plain)).toBe('beanie.coat.pants.none.n.n');
    expect(signatureOf(shapeOf(santa, false, 'none', false))).toBe(signatureOf(plain));
    expect(shapeFromSignature(signatureOf(plain)).santa).toBe(false);
    const s = shapeOf(santa, false, 'none', true);
    expect(signatureOf(s)).toBe('beanie.coat.pants.none.n.n.s');
    expect(shapeFromSignature(signatureOf(s))).toEqual(s);
    expect(shapeFromSignature(signatureOf(s)).santa).toBe(true);
    // Les anciennes signatures (cinq ou six champs) restent lisibles, sans père Noël.
    expect(shapeFromSignature('short.long.pants.none.n').santa).toBe(false);
  });
  it('de face : barbe, fourrure, ceinture, boucle, gants, nez et joues cuits ; bottes en case « shoe »', () => {
    const sig = signatureOf(shapeOf(santa, false, 'none', true));
    const slots = slotsOf(sig, 4);
    for (const s of SANTA_SLOTS) expect(slots.has(s), s).toBe(true);
    expect(slots.has('shoe')).toBe(true);
    expect(slots.has('hat')).toBe(true);
  });
  it('de dos : ni nez, ni joues, ni boucle ; la barbe reste (elle dépasse sur les côtés)', () => {
    const sig = signatureOf(shapeOf(santa, false, 'none', true));
    const slots = slotsOf(sig, 12);
    expect(slots.has('nose')).toBe(false);
    expect(slots.has('cheek')).toBe(false);
    expect(slots.has('buckle')).toBe(false);
    expect(slots.has('beard')).toBe(true);
  });
  it('les pantins ordinaires n’ont aucune case du père Noël et leur cuisson ne change pas', () => {
    const sig = signatureOf(shapeOf(girl, false));
    for (const yaw of [0, 4, 12]) {
      const slots = slotsOf(sig, yaw, 'walk', 3);
      for (const s of SANTA_SLOTS) expect(slots.has(s), s).toBe(false);
    }
    const key = keyOf(sig, 0, 'walk', 3);
    expect(JSON.stringify(bakeFigure(shapeOf(girl, false), key))).toBe(JSON.stringify(bakeFigure(shapeFromSignature(sig), key)));
  });
  it('toutes les orientations et allures du script : déterministe, sans NaN, tête en dernier', () => {
    const sig = signatureOf(shapeOf(santa, false, 'none', true));
    const shape = shapeFromSignature(sig);
    for (const gait of ['stand', 'walk', 'climb', 'seated'] as const)
      for (let yaw = 0; yaw < 16; yaw += 2) {
        const key = keyOf(sig, yaw, gait, 3);
        const b = bakeFigure(shape, key);
        const js = JSON.stringify(b);
        expect(js).not.toContain('NaN');
        expect(js).toBe(JSON.stringify(bakeFigure(shape, key)));
        expect(b.groups[b.groups.length - 1]!.parts.some((p) => p.slot === 'hat')).toBe(true);
      }
  });
});
