import { describe, expect, it } from 'vitest';
import { ARCH_NAMES, genCar } from '../../../../../src/core/library/city/traffic/cars';
import { carArt, carProfile, wheelOps } from '../../../../../src/core/library/city/traffic/car-art';

type P = readonly [number, number];
const orient = (p: P, q: P, r: P): number => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const cross = (a: P, b: P, c: P, d: P): boolean => orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
function selfIntersects(pts: readonly P[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (cross(pts[i]!, pts[(i + 1) % n]!, pts[j]!, pts[(j + 1) % n]!)) return true;
    }
  return false;
}

describe('profil et plan de peinture', () => {
  it('silhouette fermée sans auto-intersection, pour les 12 types et 30 tirages chacun', () => {
    for (const arch of ARCH_NAMES)
      for (let i = 0; i < 30; i++) {
        const p = carProfile(genCar(i * 13 + 1, arch, 0.3));
        expect(p.d.trim().endsWith('Z')).toBe(true);
        expect(selfIntersects(p.pts), `${arch} ${i}`).toBe(false);
        expect(p.yRoof).toBeLessThan(p.yBelt);
      }
  });
  it('couches : caisse percée aux vitres, vitrage, deux roues sous la caisse, sièges dans l’habitacle', () => {
    for (const arch of ARCH_NAMES)
      for (let i = 0; i < 20; i++) {
        const c = genCar(i * 7 + 3, arch, 0.6);
        const a = carArt(c);
        expect(a.wheels).toHaveLength(2);
        for (const w of a.wheels) {
          expect(w.x - w.r).toBeGreaterThan(a.x0 - 1);
          expect(w.x + w.r).toBeLessThan(a.x1 + 1);
        }
        expect(a.seats.length).toBe(c.occupants.length);
        if (c.back === 'open') {
          expect(a.cabin).toBeNull();
          for (const s of a.seats) expect(s.headY).toBeLessThan(-c.belt);
        } else {
          expect(a.body.some((o) => o.k === 'hole')).toBe(true);
          expect(a.glazing.some((o) => o.k === 'glass')).toBe(true);
          const cb = a.cabin!;
          for (const s of a.seats) {
            expect(s.x, `${arch} ${i} ${s.role}`).toBeGreaterThan(cb.x - 0.5);
            expect(s.x).toBeLessThan(cb.x + cb.w + 0.5);
            expect(s.headY).toBeGreaterThan(cb.y);
            expect(s.headY).toBeLessThan(cb.y + cb.h);
          }
        }
        expect(a.wheelHand).not.toBeNull();
        expect(a.tail.x).toBeLessThan(0);
        expect(a.head.x).toBeGreaterThan(0);
        expect(a.exhaust.x).toBeLessThan(a.x0 + 2);
        expect(a.top).toBeLessThan(-c.H + 0.01);
      }
  });
  it('roues : plusieurs opérations par style ; plan mémoïsé', () => {
    for (const rim of ['enjoliveur', 'rayons', 'tôle', 'flancs blancs', 'alliage'] as const) expect(wheelOps(rim, '#d9d6cf', 4).length).toBeGreaterThan(2);
    const c = genCar(4, 'break', 0.1);
    expect(carArt(c)).toBe(carArt(c));
  });
});
