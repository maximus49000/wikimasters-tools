import { describe, expect, it } from 'vitest';
import { LAMP_R0, LAMP_RMAX, lampField, lampIrradiance } from '../../../src/core/library/light/lamps';
import { SURF, buildSurfaceMap } from '../../../src/core/library/light/surfaces';
import type { Box, LampSource } from '../../../src/core/library/light/occluders';

const GEOM = { wallH: 200, floorH: 310 };
const SCALE = 6;
const surf = (boxes: Box[] = []) => buildSurfaceMap(boxes, 2880, 510, GEOM, SCALE);
const lamp: LampSource = { id: 'l', x: 1500, d: 100, z: 30, box: 'l' };

// Pixel de sol le plus proche de (x, d) dans la carte.
function ground(s: ReturnType<typeof surf>, x: number, d: number): number {
  let best = -1;
  let bd = Infinity;
  for (let n = 0; n < s.w * s.h; n++) {
    if (s.kind[n] !== SURF.ground) continue;
    const i = n % s.w;
    const e = Math.abs((i + 0.5) * SCALE - x) + Math.abs((s.d[n] ?? 0) - d);
    if (e < bd) { bd = e; best = n; }
  }
  return best;
}

describe('lampIrradiance', () => {
  it('décroît strictement avec la distance', () => {
    let prev = Infinity;
    for (const r of [0, 30, 60, 120, 200, 300, 400]) {
      const v = lampIrradiance(r, 1);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });
  it('vaut 0 au-delà de la portée et pour cos ≤ 0', () => {
    expect(lampIrradiance(LAMP_RMAX, 1)).toBe(0);
    expect(lampIrradiance(LAMP_RMAX + 50, 1)).toBe(0);
    expect(lampIrradiance(50, 0)).toBe(0);
    expect(lampIrradiance(50, -0.5)).toBe(0);
  });
  it('est divisé par ~2 près de R0', () => {
    const ratio = lampIrradiance(LAMP_R0, 1) / lampIrradiance(0, 1);
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.5);
  });
});

describe('lampField', () => {
  it('sans source, tout est à 0', () => {
    const f = lampField([], [], surf());
    expect(f.length).toBe(480 * 85);
    expect(f.every((v) => v === 0)).toBe(true);
  });
  it('le sol proche est plus éclairé que le sol lointain', () => {
    const s = surf();
    const f = lampField([lamp], [], s);
    const proche = f[ground(s, 1560, 100)] ?? 0;
    expect(proche).toBeGreaterThan(f[ground(s, 1700, 100)] ?? 0);
    expect(proche).toBeGreaterThan(0);
  });
  it('le mur derrière est éclairé', () => {
    const s = surf();
    const f = lampField([lamp], [], s);
    let max = 0;
    for (let n = 0; n < s.w * s.h; n++) if (s.kind[n] === SURF.wall) max = Math.max(max, f[n] ?? 0);
    expect(max).toBeGreaterThan(0);
  });
  it('une boîte entre la lampe et le sol l’assombrit', () => {
    const wall: Box = { owner: 'm', x0: 1560, x1: 1600, d0: 80, d1: 120, z0: 0, z1: 200 };
    const s0 = surf();
    const libre = lampField([lamp], [], s0)[ground(s0, 1650, 100)] ?? 0;
    const s1 = surf([wall]);
    const ombre = lampField([lamp], [wall], s1)[ground(s1, 1650, 100)] ?? 0;
    expect(libre).toBeGreaterThan(0);
    expect(ombre).toBeLessThan(libre);
  });
  it('le corps de la lampe n’occulte pas sa propre lumière', () => {
    const corps: Box = { owner: 'l', x0: 1480, x1: 1520, d0: 80, d1: 120, z0: 0, z1: 40 };
    const s = surf([corps]);
    const avec = lampField([lamp], [corps], s)[ground(s, 1580, 100)] ?? 0;
    const sans = lampField([lamp], [], s)[ground(s, 1580, 100)] ?? 0;
    expect(avec).toBeCloseTo(sans, 6);
  });
  it('2 lampes et ~20 boîtes sur 480×85 produisent un champ borné dans [0,1]', () => {
    const boxes: Box[] = Array.from({ length: 20 }, (_, i) => ({ owner: `b${i}`, x0: 100 + i * 130, x1: 160 + i * 130, d0: 40 + (i % 5) * 30, d1: 80 + (i % 5) * 30, z0: 0, z1: 60 }));
    const s = surf(boxes);
    const f = lampField([lamp, { ...lamp, id: 'm', x: 800, box: 'm' }], boxes, s);
    expect(f.length).toBe(480 * 85);
    expect(f.every((v) => v >= 0 && v <= 1)).toBe(true);
  });
});
