import { describe, expect, it } from 'vitest';
import { JITTER, litFraction, segmentHitsBox, sunReaches } from '../../../src/core/library/light/shadow';
import type { Box } from '../../../src/core/library/light/occluders';

const box = (o: Partial<Box> = {}): Box => ({ owner: 'b', x0: 0, x1: 100, d0: 0, d1: 100, z0: 0, z1: 50, ...o });

describe('segmentHitsBox', () => {
  it('traverse une boîte', () => {
    expect(segmentHitsBox({ x: -50, d: 50, z: 25 }, { x: 150, d: 50, z: 25 }, box())).toBe(true);
  });
  it('passe à côté', () => {
    expect(segmentHitsBox({ x: -50, d: 150, z: 25 }, { x: 150, d: 150, z: 25 }, box())).toBe(false);
  });
  it('s arrête avant', () => {
    expect(segmentHitsBox({ x: -50, d: 50, z: 25 }, { x: -10, d: 50, z: 25 }, box())).toBe(false);
  });
  it('part de la surface supérieure vers le haut', () => {
    expect(segmentHitsBox({ x: 50, d: 50, z: 50 }, { x: 60, d: 50, z: 120 }, box())).toBe(false);
  });
  it('rasant le long de la surface supérieure : pas de traversée', () => {
    expect(segmentHitsBox({ x: -50, d: 50, z: 50 }, { x: 150, d: 50, z: 50 }, box())).toBe(false);
  });
});

describe('litFraction', () => {
  const from = { x: 0, d: 100, z: 50 };
  const source = { x: 0, d: 0, z: 50 };
  it('vaut 1 sans boîte', () => {
    expect(litFraction(from, source, 10, [])).toBe(1);
  });
  it('vaut 0 avec une grande boîte entre les deux', () => {
    expect(litFraction(from, source, 10, [box({ x0: -100, x1: 100, d0: 40, d1: 60, z0: 0, z1: 200 })])).toBe(0);
  });
  it('est intermédiaire quand une arête coupe une partie des décalages', () => {
    const b = box({ x0: 3, x1: 8, d0: 40, d1: 60, z0: 0, z1: 200 });
    expect(litFraction(from, source, 10, [b])).toBeCloseTo(4 / 5);
  });
  it('ignore le corps de la lampe (skip)', () => {
    const b = box({ owner: 'lampe', x0: -100, x1: 100, d0: 40, d1: 60, z0: 0, z1: 200 });
    expect(litFraction(from, source, 10, [b], 'lampe')).toBe(1);
  });
  it('JITTER a 5 décalages, le premier nul', () => {
    expect(JITTER).toHaveLength(5);
    expect(JITTER[0]).toEqual({ x: 0, d: 0, z: 0 });
  });
});

describe('sunReaches', () => {
  const glass = { x: 250, y: 20, w: 100, h: 100, zBottom: 80, zTop: 180 };
  const p = { x: 300, d: 100, z: 40 }; // impact : xw = 300, zw = 40 + 100·0,5 = 90
  it('éclaire quand l impact est dans le verre', () => {
    expect(sunReaches(p, glass, 0.5, 0, [])).toBe(1);
  });
  it('0 quand l impact est hors du verre', () => {
    expect(sunReaches({ ...p, z: 0 }, glass, 0.5, 0, [])).toBe(0);
    expect(sunReaches({ ...p, x: 600 }, glass, 0.5, 0, [])).toBe(0);
  });
  it('moins de 1 avec une table posée entre', () => {
    const table = box({ x0: 298, x1: 302, d0: 40, d1: 60, z0: 0, z1: 100 });
    const r = sunReaches(p, glass, 0.5, 0, [table]);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(1);
  });
  it('est déterministe', () => {
    const table = box({ x0: 298, x1: 302, d0: 40, d1: 60, z0: 0, z1: 100 });
    expect(sunReaches(p, glass, 0.5, 0, [table])).toBe(sunReaches(p, glass, 0.5, 0, [table]));
  });
});
