import { describe, expect, it } from 'vitest';
import { doorsFor } from '../../../../src/core/library/city/doors';
import { cityFacades, GROUND_FLOOR } from '../../../../src/core/library/city/facades';
import { hexRgb } from '../../../../src/core/library/paint/color';
import { TILE, tileItems, tileKey } from '../../../../src/core/library/paint/city-painter';
import { cityPaintPlan, silhouetteTop } from '../../../../src/core/library/paint/city-plan';

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

    it(`graine ${seed} : fenêtres = fenêtres d'étage de la mise en page (premier plan) ou fenêtres du fond`, () => {
      plan.buildings.forEach((b, i) => {
        const f = facades[i]!;
        if (b.far) {
          expect(b.wins.length).toBe(f.farWindows.length);
          expect(b.layout).toBeNull();
          return;
        }
        // Lucarnes peintes par le toit, rangée du socle peinte sur le socle : ni l'une ni l'autre dans les fenêtres de la tour.
        const floors = (f.layout?.windows ?? []).filter((w) => w.kind !== 'dormer');
        expect(b.wins.map((w) => [w.x, w.y, w.w, w.h, w.kind])).toEqual(floors.map((w) => [w.x, w.y, w.w, w.h, w.kind]));
        b.wins.forEach((w, k) => {
          expect(w.dormer).toBe(false);
          const home = floors[k]!.home >= 0 ? f.layout!.homes[floors[k]!.home]! : null;
          expect(w.curtain).toBe(!!home?.curtain);
        });
        if (b.layout) {
          expect(b.look.roofH).toBe(b.layout.roof.h);
          expect(b.homes).toBe(b.layout.homes);
        }
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

  it('toits : mansarde, zinc et tuile au premier plan (mise en page), jamais de zinc au fond', () => {
    const plan = cityPaintPlan(2160, 340, 1);
    const kinds = new Set(plan.buildings.filter((b) => !b.far && b.layout).map((b) => b.layout!.roof.kind));
    expect([...kinds].sort()).toEqual(['mansard', 'tile', 'zinc']);
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
  it('liste un socle par jumeau et la silhouette le couvre (même dans le retrait entre les tours)', () => {
    const plan = cityPaintPlan(1440, 340, 4);
    const twins = plan.buildings.filter((b) => b.podiumTop !== null);
    expect(plan.podiums.length * 2).toBe(twins.length);
    for (const p of plan.podiums) {
      for (let x = p.x + 0.5; x < p.x + p.w; x += 2) expect(silhouetteTop(plan, x)).toBeLessThanOrEqual(p.top);
      // Socle au-delà du bord du monde (moins de 12 px visibles) : pas de mise en page, donc pas de fenêtres.
      if (Math.min(p.x + p.w, 1440) - Math.max(p.x, 0) >= 12) expect(p.wins.length).toBeGreaterThan(0);
      else expect(p.wins).toEqual([]);
    }
  });
  it('fenêtres du socle : celles de podiumLayout, à leur vraie taille et position', () => {
    let n = 0;
    for (const seed of [1, 4, 9]) {
      const plan = cityPaintPlan(1440, 340, seed);
      const facades = cityFacades(1440, 340, seed);
      for (const p of plan.podiums) {
        const f = facades.find((g) => g.podium?.id === p.id && g.x === g.podium.x)!;
        const pl = f.podiumLayout;
        // Socle au-delà du bord du monde : pas de mise en page, pas de fenêtres.
        if (!pl) {
          expect(p.wins).toEqual([]);
          continue;
        }
        expect(p.wins.map((w) => [w.x, w.y, w.w, w.h])).toEqual(pl.windows.map((w) => [w.x, w.y, w.w, w.h]));
        p.wins.forEach((w, k) => expect(w.curtain).toBe(!!pl.homes[pl.windows[k]!.home]!.curtain));
        n += p.wins.length;
      }
    }
    expect(n).toBeGreaterThan(0);
  });
  it("ne pose pas d'arbre dont la couronne descend devant un socle", () => {
    // Compte les couples (arbre, socle) qui se chevauchent : le test ne doit pas passer à vide.
    let n = 0;
    for (let s = 1; s <= 20; s++) {
      const plan = cityPaintPlan(1440, 340, s);
      for (const t of plan.trees) for (const p of plan.podiums) {
        if (t.x + t.r > p.x && t.x - t.r < p.x + p.w) {
          expect(t.cy + t.r).toBeLessThanOrEqual(p.top);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(0);
  });
  it("range les socles dans les tuiles qu'ils touchent", () => {
    const plan = cityPaintPlan(1440, 340, 4);
    const p = plan.podiums[0]!;
    const tile = Math.floor((p.x + p.w / 2) / TILE);
    expect(tileItems(plan, tile).podiums).toContain(p);
  });

  it('les deux tours d’un socle n’ont ni le même mur ni le même toit', () => {
    const roofColor = (b: { layout: { roof: { kind: string; zinc?: string; tile?: string } } | null }): string | undefined => (b.layout!.roof.kind === 'tile' ? b.layout!.roof.tile : b.layout!.roof.zinc);
    let pairs = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const plan = cityPaintPlan(2160, 340, seed);
      for (const p of plan.podiums) {
        const t = plan.buildings.filter((b) => b.podiumTop !== null && b.x >= p.x - 0.01 && b.x + b.w <= p.x + p.w + 0.01);
        expect(t.length).toBe(2);
        if (!t[0]!.layout || !t[1]!.layout) continue;
        expect(t[0]!.layout.wall).not.toBe(t[1]!.layout.wall);
        expect(roofColor(t[0]!)).not.toBe(roofColor(t[1]!));
        // Le mur peint est celui de la mise en page.
        for (const b of t) expect(b.look.wall).toEqual(hexRgb(b.layout!.wall));
        pairs++;
      }
    }
    expect(pairs).toBeGreaterThan(20);
  });

  it('PAINT_VERSION vaut 8 (cache des tranches invalidé)', () => {
    const plan = cityPaintPlan(720, 340, 1);
    expect(tileKey(plan, 0).startsWith('8|')).toBe(true);
  });
});

describe('mouettes du plan peint (G5)', () => {
  it('plus de mouettes figées : elles volent dans leur calque animé', () => {
    for (const seed of [1, 7, 42]) expect(cityPaintPlan(1080, 340, seed).hill.gulls).toEqual([]);
  });
});
