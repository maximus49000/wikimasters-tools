import { describe, expect, it } from 'vitest';
import { bakeFigure, keyString, type FigureKey } from '../../../../src/core/library/figure/bake';
import { shapeFromSignature, shapeOf, signatureOf } from '../../../../src/core/library/figure/dress';
import { hairField, headRegion } from '../../../../src/core/library/figure/head';
import { frameOf } from '../../../../src/core/library/figure/skeleton';
import type { Outfit } from '../../../../src/core/library/city/people';

const girl: Outfit = { skin: '#F2C9A5', hair: 'short', hairColor: '#4a2e1e', hatColor: '#000000', top: 'sweater', topColor: '#C0463A', bottom: 'skirt', bottomColor: '#3B5E8A', accessory: 'bag', accessoryColor: '#8a5a2b' };
const area = (P: readonly (readonly [number, number])[]): number => Math.abs(P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);

describe('tête', () => {
  const field = hairField('short')!;
  it('de face : les cheveux couvrent le haut, pas le centre du visage', () => {
    const polys = headRegion(4.4, frameOf(Math.PI / 2), field);
    const total = polys.reduce((s, P) => s + area(P), 0);
    expect(total).toBeGreaterThan(3);
    expect(total).toBeLessThan(Math.PI * 4.4 * 4.4 * 0.6);
  });
  it('de dos : la tête est presque entièrement couverte', () => {
    const polys = headRegion(4.4, frameOf(-Math.PI / 2), field);
    const total = polys.reduce((s, P) => s + area(P), 0);
    // la nuque reste dégagée (cheveux courts, maquette validée) : ≈ 77 % du disque
    expect(total).toBeGreaterThan(Math.PI * 4.4 * 4.4 * 0.7);
  });
  it('chauve : aucun champ', () => {
    expect(hairField('bald')).toBeNull();
  });
});

describe('habillage', () => {
  it('signature : seules les formes comptent, aller-retour exact', () => {
    const s = shapeOf(girl, false);
    expect(signatureOf(shapeOf({ ...girl, topColor: '#000000' }, false))).toBe(signatureOf(s));
    expect(shapeFromSignature(signatureOf(s))).toEqual(s);
    expect(s.bottom).toBe('skirt');
    expect(shapeOf({ ...girl, top: 'tee' }, true)).toMatchObject({ top: 'tee', umbrella: true });
  });
});

describe('cuisson', () => {
  const key: FigureKey = { sig: signatureOf(shapeOf(girl, false)), yaw: 0, gait: 'walk', phase: 3, head: 0 };
  it('déterministe', () => {
    expect(JSON.stringify(bakeFigure(shapeOf(girl, false), key))).toBe(JSON.stringify(bakeFigure(shapeOf(girl, false), key)));
  });
  it('tête en dernier, jambes d’abord ; aucune valeur NaN', () => {
    const b = bakeFigure(shapeOf(girl, false), key);
    expect(b.groups.length).toBeGreaterThanOrEqual(5);
    expect(b.groups[b.groups.length - 1]!.parts.some((p) => p.slot === 'hair')).toBe(true);
    expect(b.groups[0]!.parts.some((p) => p.slot === 'shoe')).toBe(true);
    expect(JSON.stringify(b)).not.toContain('NaN');
  });
  it('de dos : pas d’yeux ; de face : deux yeux', () => {
    const shape = shapeOf(girl, false);
    expect(bakeFigure(shape, { ...key, yaw: 12, gait: 'stand', phase: 0 }).eyes).toHaveLength(0);
    expect(bakeFigure(shape, { ...key, yaw: 4, gait: 'stand', phase: 0 }).eyes).toHaveLength(2);
  });
  it('parapluie : une pièce de case « umb »', () => {
    const shape = shapeOf(girl, true);
    const b = bakeFigure(shape, { ...key, sig: signatureOf(shape) });
    expect(b.groups.some((g) => g.parts.some((p) => p.slot === 'umb'))).toBe(true);
  });
  it('clé lisible et stable', () => {
    expect(keyString(key)).toBe(`${key.sig}|0|walk|3|0`);
  });
});
