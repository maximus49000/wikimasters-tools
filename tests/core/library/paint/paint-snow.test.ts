// tests/core/library/paint/paint-snow.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cityPaintPlan } from '../../../../src/core/library/paint/city-plan';
import { tileCount } from '../../../../src/core/library/paint/city-painter';
import { chimneyBox, paintSnowTile, roofLineY } from '../../../../src/core/library/paint/snow-painter';
import { recordingCtx } from './recording-ctx';

afterEach(() => vi.restoreAllMocks());

// Point permis : rue et trottoirs (y ≥ sol), sous la ligne de toit d'un immeuble, ou dans une cheminée.
function allowed(plan: ReturnType<typeof cityPaintPlan>, x: number, y: number): boolean {
  if (y >= plan.ground - 1e-6) return true;
  return plan.buildings.some((b) => {
    if (x >= b.x - 1.5 && x <= b.x + b.w + 1.5 && y >= roofLineY(b, x) - 1e-6 && y <= plan.ground) return true;
    const c = chimneyBox(plan, b);
    return c !== null && x >= c.x0 - 1e-6 && x <= c.x1 + 1e-6 && y >= c.y0 - 1e-6;
  });
}

describe('neige posée', () => {
  it('ligne de toit : sommet au haut de l’immeuble, avant-toit à la gouttière', () => {
    const plan = cityPaintPlan(720, 340, 1);
    for (const b of plan.buildings) {
      expect(roofLineY(b, b.x + b.w / 2)).toBeCloseTo(b.look.roofKind === 'mansard' && !b.far ? b.top + 1 : b.top, 6);
      expect(roofLineY(b, b.x)).toBeGreaterThan(b.top);
      expect(roofLineY(b, b.x)).toBeLessThanOrEqual(b.top + b.look.roofH + 1e-6);
    }
  });

  for (const seed of [1, 7]) {
    it(`graine ${seed} : neige seulement sur toits, cheminées, rebords, trottoirs et rue`, () => {
      const plan = cityPaintPlan(1080, 340, seed);
      for (let t = 0; t < tileCount(1080); t++) {
        const ctx = recordingCtx();
        paintSnowTile(ctx, plan, t);
        expect(ctx.fills.length).toBeGreaterThan(300);
        expect(ctx.points.filter(([x, y]) => !allowed(plan, x, y)).slice(0, 3)).toEqual([]);
        // Jamais au-dessus de la silhouette.
        for (const [x, y] of ctx.points) {
          const over = plan.buildings.filter((b) => x >= b.x - 1.5 && x <= b.x + b.w + 1.5);
          if (y < plan.ground) expect(over.some((b) => y >= b.top - 1e-6)).toBe(true);
        }
      }
    });
  }

  it('raccord : un immeuble à cheval est enneigé à l’identique depuis ses deux tranches', () => {
    const plan = cityPaintPlan(1080, 340, 3);
    const a = recordingCtx();
    const b = recordingCtx();
    paintSnowTile(a, plan, 0);
    paintSnowTile(b, plan, 1);
    const straddling = plan.buildings.find((x) => !x.far && x.x < 360 && x.x + x.w > 360);
    if (!straddling) return;
    const mine = (ctx: typeof a): string[] =>
      ctx.points.filter(([x, y]) => x >= straddling.x && x <= straddling.x + straddling.w && y < plan.ground).map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`);
    expect(mine(a)).toEqual(mine(b));
  });

  it('n’utilise jamais Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random interdit'); });
    paintSnowTile(recordingCtx(), cityPaintPlan(720, 340, 5), 0);
  });
});
