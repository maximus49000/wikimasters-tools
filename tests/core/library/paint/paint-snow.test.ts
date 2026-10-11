// tests/core/library/paint/paint-snow.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cityPaintPlan, hillCrestY } from '../../../../src/core/library/paint/city-plan';
import { tileCount } from '../../../../src/core/library/paint/city-painter';
import { chimneyBox, hillRoofPoints, paintSnowTile, roofLineY } from '../../../../src/core/library/paint/snow-painter';
import { recordingCtx } from './recording-ctx';

afterEach(() => vi.restoreAllMocks());

// Point permis : rue et trottoirs (y ≥ sol), sous la ligne de toit d'un immeuble, dans une cheminée, le long de la crête
// (bande de 4 px sous la ligne) ou sur le toit d'une maison du fond.
function allowed(plan: ReturnType<typeof cityPaintPlan>, x: number, y: number): boolean {
  if (y >= plan.ground - 1e-6) return true;
  if (y >= hillCrestY(plan, x) - 1e-6 && y <= hillCrestY(plan, x) + 4 + 1e-6) return true;
  if (plan.hill.houses.some((h) => hillRoofPoints(h).some(([px, py]) => Math.abs(px - x) < 1e-6 && Math.abs(py + 0.8 * h.s - y) < 1e-6))) return true;
  return plan.buildings.some((b) => {
    if (x >= b.x - 2 && x <= b.x + b.w + 2 && y >= roofLineY(b, x) - 1e-6 && y <= plan.ground) return true;
    const c = chimneyBox(plan, b);
    return c !== null && x >= c.x0 - 1e-6 && x <= c.x1 + 1e-6 && y >= c.y0 - 1e-6;
  });
}

describe('neige posée', () => {
  it('ligne de toit : sommet au haut de l’immeuble, avant-toit à la gouttière, zinc plat', () => {
    const plan = cityPaintPlan(2160, 340, 1);
    for (const b of plan.buildings) {
      expect(roofLineY(b, b.x + b.w / 2)).toBeCloseTo(b.look.roofKind !== 'gable' ? b.top + 1 : b.top, 6);
      expect(roofLineY(b, b.x)).toBeGreaterThan(b.top);
      expect(roofLineY(b, b.x)).toBeLessThanOrEqual(b.top + b.look.roofH + 1e-6);
      if (b.look.roofKind === 'zinc') {
        expect(roofLineY(b, b.x - 1)).toBeCloseTo(b.top + 1, 6);
        expect(roofLineY(b, b.x - 1.5)).toBeCloseTo(b.top + b.look.roofH, 6);
      }
    }
  });

  for (const seed of [1, 7]) {
    it(`graine ${seed} : neige seulement sur toits, cheminées, rebords, trottoirs, rue, crête et maisons du fond`, () => {
      const plan = cityPaintPlan(1080, 340, seed);
      for (let t = 0; t < tileCount(1080); t++) {
        const ctx = recordingCtx();
        paintSnowTile(ctx, plan, t);
        expect(ctx.fills.length).toBeGreaterThan(300);
        expect(ctx.points.filter(([x, y]) => x >= -8 && x <= 1088 && !allowed(plan, x, y)).slice(0, 3)).toEqual([]);
      }
    });
  }

  it('raccord : un immeuble à cheval est enneigé à l’identique depuis ses deux tranches', () => {
    const plan = cityPaintPlan(1080, 340, 3);
    const straddling = plan.buildings.find((x) => !x.far && x.x < 360 && x.x + x.w > 360);
    if (!straddling) return;
    // Neige des immeubles seuls : la tranche complète moins la même tranche sans immeuble (crête, maisons du fond, sol).
    const mine = (tile: number): string[] => {
      const all = recordingCtx();
      const rest = recordingCtx();
      paintSnowTile(all, plan, tile);
      paintSnowTile(rest, { ...plan, buildings: [] }, tile);
      const left = new Map<string, number>();
      for (const [x, y] of rest.points) left.set(`${x.toFixed(3)},${y.toFixed(3)}`, (left.get(`${x.toFixed(3)},${y.toFixed(3)}`) ?? 0) + 1);
      const out: string[] = [];
      for (const [x, y] of all.points) {
        const k = `${x.toFixed(3)},${y.toFixed(3)}`;
        const n = left.get(k) ?? 0;
        if (n > 0) left.set(k, n - 1);
        else if (x >= straddling.x && x <= straddling.x + straddling.w && y < plan.ground) out.push(k);
      }
      return out;
    };
    const a = mine(0);
    expect(a.length).toBeGreaterThan(50);
    expect(a).toEqual(mine(1));
  });

  for (const seed of [1, 4, 7]) {
    it(`graine ${seed} : la neige des toits du fond n’est jamais peinte sur un immeuble du premier plan`, () => {
      const plan = cityPaintPlan(1080, 340, seed);
      // Mêmes générateurs par immeuble et par case : la différence avec un plan sans immeubles du fond = neige des toits du fond.
      const nearOnly = { ...plan, buildings: plan.buildings.filter((b) => !b.far) };
      const near = nearOnly.buildings;
      for (let t = 0; t < tileCount(1080); t++) {
        const all = recordingCtx();
        const mine = recordingCtx();
        paintSnowTile(all, plan, t);
        paintSnowTile(mine, nearOnly, t);
        const left = new Map<string, number>();
        for (const [x, y] of mine.points) left.set(`${x.toFixed(4)},${y.toFixed(4)}`, (left.get(`${x.toFixed(4)},${y.toFixed(4)}`) ?? 0) + 1);
        const far: [number, number][] = [];
        for (const [x, y] of all.points) {
          const k = `${x.toFixed(4)},${y.toFixed(4)}`;
          const n = left.get(k) ?? 0;
          if (n > 0) left.set(k, n - 1);
          else far.push([x, y]);
        }
        expect(far.length).toBeGreaterThan(0);
        const hidden = far.filter(([x, y]) => y < plan.ground && near.some((b) => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= roofLineY(b, x) - 1e-6));
        expect(hidden.slice(0, 3)).toEqual([]);
      }
    });
  }

  it('n’utilise jamais Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random interdit'); });
    paintSnowTile(recordingCtx(), cityPaintPlan(720, 340, 5), 0);
  });
});
