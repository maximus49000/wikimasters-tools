import { afterEach, describe, expect, it, vi } from 'vitest';
import { cityPaintPlan, hillCrestY, hillTopY, HILL_ROWS } from '../../../../src/core/library/paint/city-plan';
import { paintCityTile, tileCount, tileItems } from '../../../../src/core/library/paint/city-painter';
import { paintHillHouse, paintLandmark } from '../../../../src/core/library/paint/hill-painter';
import { recordingCtx } from './recording-ctx';

afterEach(() => vi.restoreAllMocks());

describe('fond : colline de maisons empilées', () => {
  it('crête entre 0,16 et 0,24 de la hauteur, continue', () => {
    const plan = cityPaintPlan(1080, 340, 1);
    let prev = hillCrestY(plan, 0);
    for (let x = 0; x <= 1080; x += 1) {
      const y = hillCrestY(plan, x);
      expect(y).toBeGreaterThanOrEqual(340 * 0.16);
      expect(y).toBeLessThanOrEqual(340 * 0.24);
      expect(Math.abs(y - prev)).toBeLessThan(0.5);
      prev = y;
    }
  });

  it('trois rangs de maisons posés sur leur sol, déterministes, inchangés au début quand la pièce grandit', () => {
    const small = cityPaintPlan(720, 340, 3);
    const large = cityPaintPlan(1440, 340, 3);
    expect(small.hill).toEqual(cityPaintPlan(720, 340, 3).hill);
    for (const row of [0, 1, 2] as const) {
      const mine = small.hill.houses.filter((h) => h.row === row);
      expect(mine.length).toBeGreaterThan(5);
      for (const h of mine) expect(h.base).toBeCloseTo(340 * HILL_ROWS[row].y, 6);
      expect(large.hill.houses.filter((h) => h.row === row && h.x < 600)).toEqual(mine.filter((h) => h.x < 600));
    }
    expect(large.hill.phase).toEqual(small.hill.phase);
    expect(large.hill.landmarks.slice(0, small.hill.landmarks.length)).toEqual(small.hill.landmarks);
    expect(cityPaintPlan(720, 340, 4).hill.houses).not.toEqual(small.hill.houses);
  });

  it('une tour-horloge et au moins un dôme par bande de 1080 px, jamais au même endroit', () => {
    const plan = cityPaintPlan(2160, 340, 7);
    const towers = plan.hill.landmarks.filter((l) => l.kind === 'tower');
    expect(towers.length).toBe(2);
    expect(towers[0]!.x - 0).not.toBeCloseTo(towers[1]!.x - 1080, 0);
    expect(plan.hill.landmarks.filter((l) => l.kind === 'dome').length).toBeGreaterThanOrEqual(2);
    for (const l of plan.hill.landmarks) expect(l.top).toBeGreaterThan(0);
  });

  it('plus de mouettes figées au-dessus du fond (G5 : volées animées, city/gulls.ts)', () => {
    expect(cityPaintPlan(1080, 340, 1).hill.gulls).toEqual([]);
  });

  it('maison et repère : aucun tirage, dessin identique à chaque appel', () => {
    const plan = cityPaintPlan(720, 340, 2);
    const a = recordingCtx();
    const b = recordingCtx();
    paintHillHouse(a, plan.hill.houses[3]!);
    paintHillHouse(b, plan.hill.houses[3]!);
    expect(a.ops).toEqual(b.ops);
    const c = recordingCtx();
    const d = recordingCtx();
    paintLandmark(c, plan.hill.landmarks[0]!, 0.3);
    paintLandmark(d, plan.hill.landmarks[0]!, 0.3);
    expect(c.ops).toEqual(d.ops);
  });

  it('une maison à cheval sur deux tranches est dans les deux', () => {
    const plan = cityPaintPlan(1080, 340, 5);
    const straddling = plan.hill.houses.find((h) => h.x < 360 && h.x + h.w > 360);
    expect(straddling).toBeDefined();
    expect(tileItems(plan, 0).houses).toContain(straddling);
    expect(tileItems(plan, 1).houses).toContain(straddling);
  });

  for (const seed of [1, 7]) {
    it(`graine ${seed} : rien au-dessus du haut du fond, sauf les mouettes`, () => {
      const plan = cityPaintPlan(1080, 340, seed);
      const gull = (x: number, y: number): boolean => plan.hill.gulls.some((g) => Math.abs(x - g.x) <= 8 * g.s + 1 && Math.abs(y - g.y) <= 6 * g.s + 1);
      // Les immeubles (mur du fond compris) peuvent dépasser la colline : seuls leurs points sont permis au-dessus.
      const building = (x: number, y: number): boolean => plan.buildings.some((b) => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.top - 9 - 1e-6);
      for (let t = 0; t < tileCount(1080); t++) {
        const ctx = recordingCtx();
        paintCityTile(ctx, plan, t);
        const bad = ctx.points.filter(([x, y]) => x >= -8 && x <= 1088 && y < hillTopY(plan, x) - 1e-6 && !gull(x, y) && !building(x, y));
        expect(bad.slice(0, 3)).toEqual([]);
      }
    });
  }
});
