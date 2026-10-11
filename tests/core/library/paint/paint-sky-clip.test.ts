// tests/core/library/paint/paint-sky-clip.test.ts
import { describe, expect, it } from 'vitest';
import { cityPaintPlan, hillTopY } from '../../../../src/core/library/paint/city-plan';
import { cityTopY, skylinePath, skylinePoints } from '../../../../src/core/library/paint/sky-clip';
import { roofLineY, roofSpan } from '../../../../src/core/library/paint/snow-painter';

// y de la ligne brisée en x (dernier segment qui contient x : les marches verticales prennent la valeur de droite).
const at = (pts: [number, number][], x: number): number => {
  for (let i = pts.length - 1; i > 0; i--) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    if (x >= x0 && x <= x1 && x1 > x0) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return NaN;
};

describe('silhouette du ciel (découpe des nuages peints)', () => {
  it('haut de la ville : le plus haut des toits et du fond', () => {
    const plan = cityPaintPlan(1080, 340, 1);
    for (let x = 0; x < 1080; x += 3) {
      const roofs = Math.min(plan.ground, ...plan.buildings.filter((b) => x >= roofSpan(b).x0 && x <= roofSpan(b).x1).map((b) => roofLineY(b, x)));
      expect(cityTopY(plan, x)).toBeCloseTo(Math.min(roofs, hillTopY(plan, x)), 9);
    }
  });

  for (const seed of [1, 7]) {
    it(`graine ${seed} : suit le haut de la ville sans jamais descendre dessous`, () => {
      const plan = cityPaintPlan(1080, 340, seed);
      const pts = skylinePoints(plan);
      expect(pts[0]![0]).toBe(0);
      expect(pts[pts.length - 1]![0]).toBe(1080);
      for (let x = 0.3; x < 1080; x += 0.7) {
        const y = at(pts, x);
        expect(y).toBeLessThanOrEqual(cityTopY(plan, x) + 0.1);
        expect(y).toBeGreaterThan(cityTopY(plan, x) - 3);
      }
    });
  }

  it('chemin fermé par le haut du monde', () => {
    const d = skylinePath(cityPaintPlan(720, 340, 1));
    expect(d.startsWith('M0 0L0 ')).toBe(true);
    expect(d.endsWith('L720 0Z')).toBe(true);
  });
});
