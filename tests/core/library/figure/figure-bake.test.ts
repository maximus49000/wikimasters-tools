import { describe, expect, it } from 'vitest';
import { anchorsOf, bakeFigure, keyString, type FigureKey } from '../../../../src/core/library/figure/bake';
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
  const key: FigureKey = { sig: signatureOf(shapeOf(girl, false)), yaw: 0, gait: 'walk', phase: 3, head: 0, arms: 'swing', lean: 0 };
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
  it('parapluie en dôme : la toile reste large juste sous son sommet (un cône s’y pince)', () => {
    const shape = shapeOf(girl, true);
    for (const yaw of [0, 4, 8, 12]) {
      const b = bakeFigure(shape, { ...key, sig: signatureOf(shape), yaw, gait: 'stand', phase: 0 });
      const umb = b.groups.flatMap((g) => g.parts).find((p) => p.slot === 'umb')!;
      const nums = umb.shade.match(/-?\d+(\.\d+)?/g)!.map(Number);
      const P = Array.from({ length: nums.length / 2 }, (_, i) => [nums[2 * i]!, nums[2 * i + 1]!] as const);
      const top = Math.min(...P.map((q) => q[1]));
      // Largeur du polygone (convexe) à 1 unité sous le sommet : ≈ 4,4 pour l’ancien cône, ≈ 13 pour le dôme.
      const y = top + 1;
      const xs: number[] = [];
      P.forEach((a, i) => {
        const c = P[(i + 1) % P.length]!;
        if ((a[1] - y) * (c[1] - y) <= 0 && a[1] !== c[1]) xs.push(a[0] + ((y - a[1]) / (c[1] - a[1])) * (c[0] - a[0]));
      });
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(9);
    }
  });
  it('clé lisible et stable', () => {
    expect(keyString(key)).toBe(`${key.sig}|0|walk|3|0|swing|0`);
  });
});

describe('tenues de travail et accroches', () => {
  it('signature à 6 champs, relecture des signatures à 5 champs', () => {
    const s = shapeOf(girl, false, 'vest');
    expect(signatureOf(s).split('.')).toHaveLength(6);
    expect(shapeFromSignature(signatureOf(s))).toEqual(s);
    expect(shapeFromSignature('short.long.skirt.bag.n').work).toBe('none');
    expect(shapeOf(girl, false).work).toBe('none');
    expect(shapeFromSignature(signatureOf(shapeOf(girl, true, 'apron')))).toMatchObject({ umbrella: true, work: 'apron' });
  });
  it('gilet : des pièces « vest » et « band » ; tablier : « apron »', () => {
    const k = { sig: '', yaw: 0, gait: 'stand' as const, phase: 0, head: 0, arms: 'swing' as const, lean: 0 };
    const v = shapeOf(girl, false, 'vest');
    const slots = bakeFigure(v, { ...k, sig: signatureOf(v) }).groups.flatMap((g) => g.parts.map((p) => p.slot));
    expect(slots).toContain('vest');
    expect(slots).toContain('band');
    expect(slots).not.toContain('apron');
    const a = shapeOf(girl, false, 'apron');
    expect(bakeFigure(a, { ...k, sig: signatureOf(a) }).groups.flatMap((g) => g.parts.map((p) => p.slot))).toContain('apron');
    const n = shapeOf(girl, false);
    const plain = bakeFigure(n, { ...k, sig: signatureOf(n) }).groups.flatMap((g) => g.parts.map((p) => p.slot));
    for (const sl of ['vest', 'band', 'apron'] as const) expect(plain).not.toContain(sl);
  });
  it('accroches : main droite levée au-dessus de la tête pour « raise » (y vers le bas)', () => {
    const key = { sig: signatureOf(shapeOf(girl, false)), yaw: 0, gait: 'stand' as const, phase: 0, head: 0, arms: 'raise' as const, lean: 0 };
    const a = anchorsOf(key);
    expect(a.handR[1]).toBeLessThan(a.headTop[1]);
    expect(a.nape[1]).toBeGreaterThan(a.head[1]);
    expect(keyString(key)).toBe(`${key.sig}|0|stand|0|0|raise|0`);
    // Mémoïsé par clé ; bras baissés : main sous la taille.
    expect(anchorsOf({ ...key })).toBe(a);
    expect(anchorsOf({ ...key, arms: 'down' }).handR[1]).toBeGreaterThan(-15);
  });
  it('les gestes changent le sprite : bras et penché dans la cuisson', () => {
    const s = shapeOf(girl, false);
    const k: FigureKey = { sig: signatureOf(s), yaw: 4, gait: 'stand', phase: 0, head: 0, arms: 'swing', lean: 0 };
    const base = JSON.stringify(bakeFigure(s, k));
    expect(JSON.stringify(bakeFigure(s, { ...k, arms: 'raise' }))).not.toBe(base);
    expect(JSON.stringify(bakeFigure(s, { ...k, lean: 2 }))).not.toBe(base);
  });
});
