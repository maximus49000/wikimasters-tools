import { describe, expect, it } from 'vitest';
import { doorsFor } from '../../../../src/core/library/city/doors';
import { cityFacades, GROUND_FLOOR } from '../../../../src/core/library/city/facades';
import { cityPaintPlan, ROOF_H, silhouetteTop } from '../../../../src/core/library/paint/city-plan';

describe('plan de la ville peinte', () => {
  for (const seed of [1, 7, 42]) {
    const plan = cityPaintPlan(1080, 340, seed);
    const facades = cityFacades(1080, 340, seed);

    it(`graine ${seed} : un immeuble peint par façade, mêmes positions`, () => {
      expect(plan.buildings.length).toBe(facades.length);
      plan.buildings.forEach((b, i) => {
        expect(b.x).toBe(facades[i]!.x);
        expect(b.w).toBe(facades[i]!.w);
        expect(b.top).toBeCloseTo(plan.ground - facades[i]!.h, 6);
        expect(b.far).toBe(facades[i]!.far);
      });
    });

    it(`graine ${seed} : fenêtres = lampes (premier plan) ou fenêtres du fond, lucarnes dans le toit`, () => {
      plan.buildings.forEach((b, i) => {
        const f = facades[i]!;
        expect(b.wins.length).toBe(b.far ? f.farWindows.length : f.lamps.length);
        if (!b.far) for (const w of b.wins) expect(w.dormer).toBe(w.y < b.top + ROOF_H);
      });
    });

    it(`graine ${seed} : arbres hors des entrées et des locaux, couronne sous la silhouette`, () => {
      const doors = doorsFor(1080, 340, seed);
      for (const t of plan.trees) {
        const trunk = { x0: t.x - 2 * plan.unit, x1: t.x + 2 * plan.unit };
        for (const s of plan.blocked) expect(trunk.x1 <= s.x0 || trunk.x0 >= s.x1).toBe(true);
        for (const d of doors) expect(trunk.x1 <= d.x || trunk.x0 >= d.x + 12).toBe(true);
        expect(t.cy + t.r).toBeLessThanOrEqual(plan.ground - GROUND_FLOOR - 1 + 1e-9);
        for (let x = t.x - t.r; x <= t.x + t.r; x += 1) expect(t.cy - t.r).toBeGreaterThanOrEqual(silhouetteTop(plan, x) + 2 - 1e-9);
      }
    });

    it(`graine ${seed} : mobilier hors des entrées, des locaux et des troncs, sans chevauchement, affiches sur un mur`, () => {
      expect(plan.furniture.length).toBeGreaterThan(0);
      const near = plan.buildings.filter((b) => !b.far);
      plan.furniture.forEach((f, i) => {
        const x0 = f.x;
        const x1 = f.x + f.w;
        for (const s of plan.blocked) expect(x1 <= s.x0 || x0 >= s.x1).toBe(true);
        for (const t of plan.trees) expect(x1 <= t.x - 4 * plan.unit || x0 >= t.x + 4 * plan.unit).toBe(true);
        for (const g of plan.furniture.slice(i + 1)) expect(x1 <= g.x || x0 >= g.x + g.w).toBe(true);
        if (f.kind === 'poster') expect(near.some((b) => x0 >= b.x + 2 && x1 <= b.x + b.w - 2)).toBe(true);
      });
    });
  }

  it('toits : pignon, mansarde et zinc au premier plan, jamais de zinc au fond', () => {
    const plan = cityPaintPlan(2160, 340, 1);
    const kinds = new Set(plan.buildings.filter((b) => !b.far).map((b) => b.look.roofKind));
    expect([...kinds].sort()).toEqual(['gable', 'mansard', 'zinc']);
    for (const b of plan.buildings.filter((b) => b.far)) expect(b.look.roofKind).not.toBe('zinc');
  });

  it('déterministe, et dépend de la graine', () => {
    expect(cityPaintPlan(720, 340, 3)).toEqual(cityPaintPlan(720, 340, 3));
    expect(cityPaintPlan(720, 340, 3).buildings.map((b) => b.look)).not.toEqual(cityPaintPlan(720, 340, 4).buildings.map((b) => b.look));
  });

  it('agrandir la pièce garde les immeubles, les arbres et le mobilier du début', () => {
    const small = cityPaintPlan(720, 340, 1);
    const large = cityPaintPlan(1080, 340, 1);
    expect(large.buildings.slice(0, 4)).toEqual(small.buildings.slice(0, 4));
    expect(large.trees.filter((t) => t.x < 300)).toEqual(small.trees.filter((t) => t.x < 300));
    expect(large.furniture.filter((f) => f.x < 300)).toEqual(small.furniture.filter((f) => f.x < 300));
  });

  it('au moins un arbre sur une rue de 2880 px', () => {
    expect(cityPaintPlan(2880, 340, 1).trees.length).toBeGreaterThan(0);
  });
});
