import { describe, expect, it } from 'vitest';
import { ARCHETYPES, ARCH_NAMES, carStream, genCar, nextCar } from '../../../../../src/core/library/city/traffic/cars';

const hueDist = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
};

describe('générateur de voitures', () => {
  it('12 types, proportions dans les plages, déterministe', () => {
    expect(ARCH_NAMES).toHaveLength(12);
    for (const arch of ARCH_NAMES)
      for (let i = 0; i < 40; i++) {
        const c = genCar(i * 31 + 7, arch, (i * 0.37) % 1);
        const A = ARCHETYPES[arch];
        expect(c.L).toBeGreaterThanOrEqual(A.L[0]);
        expect(c.L).toBeLessThanOrEqual(A.L[1]);
        expect(c.H).toBeGreaterThanOrEqual(A.H[0]);
        expect(c.H).toBeLessThanOrEqual(A.H[1]);
        expect(c.belt).toBeLessThan(c.H);
        expect(c.wheelR).toBeGreaterThanOrEqual(A.wheel[0]);
        expect(c.body).toMatch(/^#[0-9a-f]{6}$/);
        expect(c.occupants[0]!.role).toBe('driver');
        expect(c.occupants.length).toBeLessThanOrEqual(3);
      }
    expect(genCar(5, 'berline', 0.2)).toEqual(genCar(5, 'berline', 0.2));
  });
  it('suite : 10 voitures consécutives sans type répété, teintes à plus de 0,08 tour deux à deux', () => {
    for (const seed of [1, 2, 99]) {
      const s = carStream(seed);
      const cars = Array.from({ length: 60 }, () => nextCar(s));
      for (let i = 0; i + 10 <= cars.length; i++) {
        const win = cars.slice(i, i + 10);
        expect(new Set(win.map((c) => c.arch)).size).toBe(10);
        for (let p = 0; p < 10; p++) for (let q = p + 1; q < 10; q++) expect(hueDist(win[p]!.hue, win[q]!.hue)).toBeGreaterThan(0.08);
      }
    }
  });
  it('cabriolet sans toit bicolore ; galerie et roue de secours seulement sur les types prévus', () => {
    for (let i = 0; i < 200; i++) {
      const arch = ARCH_NAMES[i % 12]!;
      const c = genCar(i, arch, 0.5);
      if (arch === 'cabriolet') expect(c.twoTone).toBeNull();
      if (c.rack) expect(['break', '4x4', 'monospace', 'compacte']).toContain(arch);
      if (c.spare) expect(arch).toBe('4x4');
    }
  });
});
