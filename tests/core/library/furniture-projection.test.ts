import { describe, expect, it } from 'vitest';
import { STANDING_KINDS } from '../../../src/core/library/library-types';
import { VOLUMES } from '../../../src/core/library/furniture-volumes';
import { projectParts } from '../../../src/core/library/furniture-projection';

const rect = { x: 100, y: 50, w: 180, h: 120 };
const ANGLES = [1, 2, 3, 4, 5, 6, 7] as const;

describe('projecteur', () => {
  it.each(STANDING_KINDS)('%s : faces finies, dans le rectangle, à chaque angle', (kind) => {
    for (const a of ANGLES) {
      const faces = projectParts(VOLUMES[kind], a, rect);
      expect(faces.length).toBeGreaterThan(0);
      for (const f of faces) for (const [x, y] of f.points) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(rect.x - 0.001);
        expect(x).toBeLessThanOrEqual(rect.x + rect.w + 0.001);
        expect(y).toBeGreaterThanOrEqual(rect.y - 0.001);
        expect(y).toBeLessThanOrEqual(rect.y + rect.h + 0.001);
      }
    }
  });
  it('7 est le miroir de 1, 3 celui de 5', () => {
    const mirror = (pts: [number, number][]) => pts.map(([x, y]) => [Math.round((2 * rect.x + rect.w - x) * 1000) / 1000, Math.round(y * 1000) / 1000]);
    const round = (pts: [number, number][]) => pts.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
    const one = projectParts(VOLUMES.sofa, 1, rect).map((f) => mirror(f.points));
    const seven = projectParts(VOLUMES.sofa, 7, rect).map((f) => round(f.points));
    expect(seven).toEqual(one);
    const five = projectParts(VOLUMES.sofa, 5, rect).map((f) => mirror(f.points));
    expect(projectParts(VOLUMES.sofa, 3, rect).map((f) => round(f.points))).toEqual(five);
  });
  it('de profil, aucune face avant ; en ¾, la face avant du corps occupe 70 % à gauche', () => {
    expect(projectParts(VOLUMES.shelf, 2, rect).some((f) => f.shade === 1)).toBe(false);
    const box = [{ u0: 0, u1: 1, h0: 0, h1: 1, d0: 0, d1: 1, fill: 'wood' as const }];
    const fronts = projectParts(box, 1, rect).filter((f) => f.shade === 1);
    expect(Math.max(...fronts.flatMap((f) => f.points.map(([x]) => x)))).toBeCloseTo(rect.x + rect.w * 0.7, 3);
  });
});
