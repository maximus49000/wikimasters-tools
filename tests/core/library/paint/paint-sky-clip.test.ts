// tests/core/library/paint/paint-sky-clip.test.ts
import { describe, expect, it } from 'vitest';
import { cityPaintPlan } from '../../../../src/core/library/paint/city-plan';
import { skylinePath, skylinePoints } from '../../../../src/core/library/paint/sky-clip';
import { roofLineY } from '../../../../src/core/library/paint/snow-painter';

// Haut de la ville peinte en x : la plus haute ligne de toit des immeubles qui couvrent x, le sol sinon.
const top = (plan: ReturnType<typeof cityPaintPlan>, x: number): number => {
  let y = plan.ground;
  for (const b of plan.buildings) if (x >= b.x && x <= b.x + b.w) y = Math.min(y, roofLineY(b, x));
  return y;
};
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
  for (const seed of [1, 7]) {
    it(`graine ${seed} : suit la ligne des toits sans jamais descendre dessous`, () => {
      const plan = cityPaintPlan(1080, 340, seed);
      const pts = skylinePoints(plan);
      expect(pts[0]![0]).toBe(0);
      expect(pts[pts.length - 1]![0]).toBe(1080);
      for (let x = 0.3; x < 1080; x += 0.7) {
        const y = at(pts, x);
        expect(y).toBeLessThanOrEqual(top(plan, x) + 1e-6);
        expect(y).toBeGreaterThan(top(plan, x) - 3);
      }
    });
  }

  it('chemin fermé par le haut du monde', () => {
    const d = skylinePath(cityPaintPlan(720, 340, 1));
    expect(d.startsWith('M0 0L0 ')).toBe(true);
    expect(d.endsWith('L720 0Z')).toBe(true);
  });
});
