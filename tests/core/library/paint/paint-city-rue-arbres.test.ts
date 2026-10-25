import { describe, expect, it } from 'vitest';
import { cityPaintPlan } from '../../../../src/core/library/paint/city-plan';
import { fondMoment, SUNNY } from '../../../../src/core/library/paint/fond-time';
import type { RuePit, RueSpecies } from '../../../../src/core/library/paint/rue-verte-plan';
import { isTwig, paintRueClouds, paintRueSkeleton, rueCloudItems, rueCloudSize, rueTreeModelV5, type RueAxis, type RueTreeModel } from '../../../../src/core/library/paint/rue-trees';
import { recordingCtx } from './recording-ctx';

const H = 340;
const SPECIES: RueSpecies[] = ['platane', 'tilleul', 'robinier', 'frene', 'cerisier'];
const pitOf = (species: RueSpecies, x: number, h = 42, r = 20): RuePit => ({ kind: 'pit', x, x0: x - 7, x1: x + 7, y: 255.4, empty: false, young: false, species, section: 0, slot: 0, finish: 'grille', h, r, lean: 0, flowers: false, flowerSeed: 0 });
// Arbres de rue réels (graines 1-6, 2 880 px) + chaque essence sur 40 positions.
const realPits = (): RuePit[] => {
  const out: RuePit[] = [];
  for (let seed = 1; seed <= 6; seed++) for (const v of cityPaintPlan(2880, H, seed).rue) if (v.kind === 'pit' && !v.empty && !v.young) out.push(v);
  return out;
};
const MODELS: RueTreeModel[] = [...realPits(), ...SPECIES.flatMap((sp) => Array.from({ length: 40 }, (_, i) => pitOf(sp, 30 + i * 61, 42 + ((i * 7) % 7) - 3, 20 + ((i * 3) % 4) - 1.5)))].map(rueTreeModelV5);
const day = (m: number, d: number) => fondMoment({ y: 2026, m, d }, 15 * 60, SUNNY);
const DATES = [day(1, 15), day(3, 20), day(4, 5), day(4, 20), day(5, 10), day(7, 7), day(9, 20), day(10, 10), day(10, 25), day(11, 5), day(11, 15), day(11, 25), day(12, 20)];
const distToAxis = (a: RueAxis, x: number, y: number): number => {
  let best = Infinity;
  for (let i = 0; i + 1 < a.pts.length; i++) {
    const [x0, y0] = a.pts[i]!;
    const [x1, y1] = a.pts[i + 1]!;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2));
    best = Math.min(best, Math.hypot(x - x0 - t * dx, y - y0 - t * dy));
  }
  return best;
};

describe('arbre de rue V5 (rueTreeModelV5)', () => {
  it('déterministe : même fosse, même arbre ; autre position, autre arbre', () => {
    const a = rueTreeModelV5(pitOf('platane', 300));
    expect(JSON.stringify(rueTreeModelV5(pitOf('platane', 300)))).toBe(JSON.stringify(a));
    expect(JSON.stringify(rueTreeModelV5(pitOf('platane', 361)))).not.toBe(JSON.stringify(a));
    expect(a.foot).toEqual({ x: 300, y: 255.4 });
    expect(a.axes[0]!.level).toBe(1);
  });

  it('continuité : demi-largeur décroissante le long de chaque axe, fille ≤ mère au départ, Σ filles ≤ 70 % de la section', () => {
    for (const m of MODELS) {
      expect(m.axes.filter((a) => a.w.some((w, i) => i > 0 && w > a.w[i - 1]! + 1e-9))).toEqual([]);
      m.axes.forEach((a, id) => {
        if (a.parent < 0) return;
        const mother = m.axes[a.parent]!;
        // Au point de la mère pris juste avant le cran du départ (dernier point de la mère à t ≤ t0 − 0,09).
        const i = Math.max(0, Math.floor((a.t0 - 0.09) * (mother.w.length - 1) + 1e-9));
        expect(a.w[0]!).toBeLessThanOrEqual(mother.w[i]! + 1e-9);
        if (!a.cont) return;
        const kids = m.axes.filter((k, j) => j !== id && k.parent === a.parent && !k.cont);
        const ws = mother.level === 1 ? mother.w[0]! / 1.75 : mother.w[0]!;
        expect(kids.reduce((s, k) => s + (k.w[0]! / 0.97) ** 2, 0)).toBeLessThanOrEqual(0.7 * ws * ws + 1e-9);
      });
    }
  });

  it('pointes fines : bout des axes terminaux < 0,2 px', () => {
    for (const m of MODELS)
      for (const a of m.axes)
        if (a.pointed) expect(a.w[a.w.length - 1]!).toBeLessThan(0.2);
  });

  it('chaque nuage à moins de 1,3 r de son axe porteur, rattaché à une charpentière', () => {
    for (const m of MODELS) {
      expect(m.masses).toBeGreaterThanOrEqual(2);
      for (const c of m.clouds) {
        const a = m.axes[c.axis]!;
        expect(a.level).toBeGreaterThanOrEqual(3);
        expect(a.dead).toBeFalsy();
        expect(distToAxis(a, c.x, c.y)).toBeLessThanOrEqual(1.3 * c.r);
        expect(c.mass).toBe(a.mass);
        expect(c.mass).toBeGreaterThanOrEqual(0);
        expect(c.mass).toBeLessThan(m.masses);
      }
      // La charpentière d'un axe est celle de sa mère (sauf les filles du tronc, une masse chacune).
      for (const a of m.axes) if (a.parent > 0) expect(a.mass).toBe(m.axes[a.parent]!.mass);
    }
  });

  // Densité de la maquette V5 validée (max mesuré ≈ 226 axes, ≈ 600 nuages pour un cerisier) + marge.
  it('budget : au plus 240 axes et 620 nuages par arbre', () => {
    for (const m of MODELS) {
      expect(m.axes.length).toBeLessThanOrEqual(240);
      expect(m.clouds.length).toBeLessThanOrEqual(620);
    }
  });

  // d vaut au plus 1 en été : un nuage de rang 1 (rare) n'y est pas visible ; au moins 95 % des nuages le sont.
  it("hiver : aucun nuage dessiné ; été : au moins 95 % des nuages", () => {
    for (const m of MODELS.slice(0, 40)) {
      const ctx = recordingCtx();
      paintRueClouds(ctx, m, day(1, 15));
      paintRueClouds(ctx, m, day(1, 15), { part: 'shadow' });
      expect(ctx.ops).toEqual([]);
      expect(rueCloudItems(m, day(7, 7)).length).toBeGreaterThanOrEqual(0.95 * m.clouds.length);
      const summer = recordingCtx();
      paintRueClouds(summer, m, day(7, 7));
      expect(summer.fills.length).toBeGreaterThan(0);
    }
  });

  it('à toute date, un nuage de taille > 0 a son axe dessiné (squelette complet, indépendant de la date)', () => {
    for (const m of MODELS.slice(0, 60)) {
      const ctx = recordingCtx();
      paintRueSkeleton(ctx, m);
      const starts = ctx.ops.filter((o) => o.op === 'moveTo').map((o) => o.args as [number, number]);
      // Point de départ exact de l'axe : brindille, son premier point ; tube, son contour gauche (premier point + normale ×
      // demi-largeur, comme `tubePath`).
      const startOf = (a: RueAxis): [number, number] => {
        const [x, y] = a.pts[0]!;
        if (isTwig(a)) return [x, y];
        const [x1, y1] = a.pts[1]!;
        const l = Math.hypot(x1 - x, y1 - y) || 1;
        const w = Math.max(0.12, a.w[0]!);
        return [x - ((y1 - y) / l) * w, y + ((x1 - x) / l) * w];
      };
      const drawn = (a: RueAxis): boolean => {
        const [x, y] = startOf(a);
        return starts.some(([sx, sy]) => Math.abs(sx - x) < 1e-9 && Math.abs(sy - y) < 1e-9);
      };
      const drawnAxes = new Set(m.axes.map((a, i) => (drawn(a) ? i : -1)));
      expect(drawnAxes.size - (drawnAxes.has(-1) ? 1 : 0)).toBe(m.axes.length);
      for (const D of DATES) for (const c of m.clouds) if (rueCloudSize(m, c, D) > 0) expect(drawnAxes.has(c.axis)).toBe(true);
    }
  });

  it('automne : les nuages rétrécissent sur place (taille décroissante du 7 juillet au 20 décembre), jaunissement des bouts', () => {
    const m = MODELS[0]!;
    const sizes = [day(7, 7), day(10, 25), day(11, 15), day(12, 20)].map((D) => m.clouds.reduce((s, c) => s + rueCloudSize(m, c, D), 0));
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]!).toBeLessThanOrEqual(sizes[i - 1]!);
    expect(sizes[3]).toBe(0);
    const greenFill = recordingCtx();
    paintRueClouds(greenFill, m, day(7, 7));
    const autumnFill = recordingCtx();
    paintRueClouds(autumnFill, m, day(10, 25));
    expect(new Set(autumnFill.fills)).not.toEqual(new Set(greenFill.fills));
  });

  it('cerisier en fleurs (avril) : nuages roses ; `mass` ne dessine qu’une charpentière ; pluie : tons assombris', () => {
    const m = rueTreeModelV5(pitOf('cerisier', 500));
    const D = day(4, 1);
    const items = rueCloudItems(m, D);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((it) => it.tones[1]![0]! > it.tones[1]![1]!)).toBe(true);
    const one = rueCloudItems(m, day(7, 7), { mass: 0 });
    expect(one.length).toBeGreaterThan(0);
    expect(one.every((it) => it.c.mass === 0)).toBe(true);
    const wet = rueCloudItems(m, day(7, 7), { wet: 1 });
    expect(wet[0]!.tones[0]!.reduce((s, v) => s + v, 0)).toBeLessThan(rueCloudItems(m, day(7, 7))[0]!.tones[0]!.reduce((s, v) => s + v, 0));
  });

  it('boîte : tout ce que le squelette et les nuages touchent y tient (ombre comprise)', () => {
    for (const m of MODELS.slice(0, 40)) {
      const ctx = recordingCtx();
      paintRueSkeleton(ctx, m, { wet: 1 });
      for (const D of [day(4, 1), day(7, 7), day(10, 25)]) {
        paintRueClouds(ctx, m, D, { part: 'shadow' });
        paintRueClouds(ctx, m, D, { wet: 1 });
      }
      const out = ctx.points.filter(([x, y]) => x < m.box.x0 - 1e-6 || x > m.box.x1 + 1e-6 || y < m.box.y0 - 1e-6 || y > m.box.y1 + 1e-6);
      expect(out).toEqual([]);
    }
  });
});
