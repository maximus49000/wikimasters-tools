import { afterEach, describe, expect, it, vi } from 'vitest';
import { cityPaintPlan } from '../../../../src/core/library/paint/city-plan';
import { paintBuilding, paintCityTile, TILE, tileCount, tileItems, tileKey } from '../../../../src/core/library/paint/city-painter';
import { recordingCtx } from './recording-ctx';

afterEach(() => vi.restoreAllMocks());

// Un point est permis s'il est dans la rue (y ≥ sol) ou dans un immeuble (débord d'avant-toit ≤ 1,5 px).
function allowed(plan: ReturnType<typeof cityPaintPlan>, x: number, y: number): boolean {
  if (y >= plan.ground - 1e-6) return true;
  return plan.buildings.some((b) => x >= b.x - 1.5 && x <= b.x + b.w + 1.5 && y >= b.top - 1e-6);
}

describe('peintre de tranche', () => {
  it('tranches : nombre et contenu', () => {
    expect(tileCount(720)).toBe(2);
    expect(tileCount(721)).toBe(3);
    const plan = cityPaintPlan(1080, 340, 1);
    const straddling = plan.buildings.find((b) => b.x < TILE && b.x + b.w > TILE);
    if (straddling) {
      expect(tileItems(plan, 0).buildings).toContain(straddling);
      expect(tileItems(plan, 1).buildings).toContain(straddling);
    }
  });

  for (const seed of [1, 7]) {
    it(`graine ${seed} : rien au-dessus de la silhouette`, () => {
      const plan = cityPaintPlan(1080, 340, seed);
      for (let t = 0; t < tileCount(1080); t++) {
        const ctx = recordingCtx();
        paintCityTile(ctx, plan, t);
        expect(ctx.fills.length).toBeGreaterThan(500);
        const bad = ctx.points.filter(([x, y]) => !allowed(plan, x, y));
        expect(bad.slice(0, 3)).toEqual([]);
      }
    });
  }

  it('un immeuble est peint à l’identique quelle que soit la tranche', () => {
    const plan = cityPaintPlan(720, 340, 3);
    const b = plan.buildings.find((x) => !x.far)!;
    const a = recordingCtx();
    const c = recordingCtx();
    paintBuilding(a, plan, b);
    paintBuilding(c, plan, b);
    expect(a.ops).toEqual(c.ops);
  });

  it('clé : stable, dépend de la graine, inchangée pour la 1re tranche quand la pièce grandit', () => {
    const p1 = cityPaintPlan(720, 340, 1);
    expect(tileKey(p1, 0)).toBe(tileKey(cityPaintPlan(720, 340, 1), 0));
    expect(tileKey(p1, 0)).not.toBe(tileKey(cityPaintPlan(720, 340, 2), 0));
    expect(tileKey(cityPaintPlan(1080, 340, 1), 0)).toBe(tileKey(p1, 0));
  });

  it('n’utilise jamais Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random interdit'); });
    paintCityTile(recordingCtx(), cityPaintPlan(720, 340, 5), 0);
  });
});
