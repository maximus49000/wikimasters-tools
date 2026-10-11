import { afterEach, describe, expect, it, vi } from 'vitest';
import { cityPaintPlan, hillTopY } from '../../../../src/core/library/paint/city-plan';
import { LEFT_GAP, leftOf, paintBuilding, paintCityTile, TILE, tileCount, tileItems, tileKey } from '../../../../src/core/library/paint/city-painter';
import { doorsFor } from '../../../../src/core/library/city/doors';
import { recordingCtx } from './recording-ctx';

afterEach(() => vi.restoreAllMocks());

// Un point est permis s'il est dans la rue (y ≥ sol), dans un immeuble (débord d'avant-toit ≤ 2 px, antenne ≤ 9 px au-dessus),
// dans le fond (sous le haut de la colline, maisons et repères compris) ou dans une mouette.
function allowed(plan: ReturnType<typeof cityPaintPlan>, x: number, y: number): boolean {
  if (y >= plan.ground - 1e-6) return true;
  if (plan.buildings.some((b) => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.top - 9 - 1e-6)) return true;
  if (y >= hillTopY(plan, x) - 1e-6) return true;
  return plan.hill.gulls.some((g) => Math.abs(x - g.x) <= 8 * g.s + 1 && Math.abs(y - g.y) <= 6 * g.s + 1);
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
    it(`graine ${seed} : rien au-dessus de la silhouette ni du fond`, () => {
      const plan = cityPaintPlan(1080, 340, seed);
      for (let t = 0; t < tileCount(1080); t++) {
        const ctx = recordingCtx();
        paintCityTile(ctx, plan, t);
        expect(ctx.fills.length).toBeGreaterThan(500);
        const bad = ctx.points.filter(([x, y]) => x >= -8 && x <= 1088 && !allowed(plan, x, y));
        expect(bad.slice(0, 3)).toEqual([]);
      }
    });
  }

  it('un immeuble est peint à l’identique quelle que soit la tranche', () => {
    const plan = cityPaintPlan(720, 340, 3);
    for (const b of [plan.buildings.find((x) => !x.far)!, plan.buildings.find((x) => x.far)!]) {
      const a = recordingCtx();
      const c = recordingCtx();
      paintBuilding(a, plan, b);
      paintBuilding(c, plan, b);
      expect(a.ops).toEqual(c.ops);
    }
  });

  it('voisin de gauche : même plan, contigu, le plus proche', () => {
    const plan = cityPaintPlan(1080, 340, 1);
    const near = plan.buildings.filter((b) => !b.far);
    expect(leftOf(plan, near[0]!)).toBeNull();
    const l = leftOf(plan, near[1]!);
    expect(l).toBe(near[0]);
    for (const b of plan.buildings) {
      const left = leftOf(plan, b);
      if (left) {
        expect(left.far).toBe(b.far);
        expect(left.x).toBeLessThan(b.x);
        expect(left.x + left.w).toBeGreaterThanOrEqual(b.x - LEFT_GAP);
      }
    }
  });

  it('ombre portée du voisin plus haut : un triangle à bord net depuis son toit', () => {
    const plan = cityPaintPlan(2160, 340, 1);
    const b = plan.buildings.find((x) => !x.far && leftOf(plan, x) !== null && leftOf(plan, x)!.top < x.top)!;
    expect(b).toBeDefined();
    const ctx = recordingCtx();
    paintBuilding(ctx, plan, b);
    const left = leftOf(plan, b)!;
    expect(ctx.ops.some((o) => o.op === 'moveTo' && o.args[0] === b.x && o.args[1] === left.top)).toBe(true);
  });

  it('raccord : un immeuble à cheval est peint des deux côtés avec les mêmes points', () => {
    const full = cityPaintPlan(1080, 340, 3);
    // Premier plan seul (le mur du fond, derrière, a sa propre découpe par tranche).
    const plan = { ...full, buildings: full.buildings.filter((b) => !b.far) };
    const straddling = plan.buildings.find((x) => x.x < 360 && x.x + x.w > 360);
    if (!straddling) return;
    // Points des immeubles seuls : ceux de la tranche complète moins ceux de la même tranche peinte sans immeuble (fond, rue,
    // arbres, mobilier), dont la découpe par tranche diffère pour le fond.
    const mine = (tile: number): string[] => {
      const all = recordingCtx();
      const rest = recordingCtx();
      paintCityTile(all, plan, tile);
      paintCityTile(rest, { ...plan, buildings: [] }, tile);
      const left = new Map<string, number>();
      for (const [x, y] of rest.points) left.set(`${x.toFixed(3)},${y.toFixed(3)}`, (left.get(`${x.toFixed(3)},${y.toFixed(3)}`) ?? 0) + 1);
      const out: string[] = [];
      for (const [x, y] of all.points) {
        const k = `${x.toFixed(3)},${y.toFixed(3)}`;
        const n = left.get(k) ?? 0;
        if (n > 0) left.set(k, n - 1);
        else if (x >= straddling.x - 2 && x <= straddling.x + straddling.w + 2) out.push(k);
      }
      return out;
    };
    const a = mine(0);
    expect(a.length).toBeGreaterThan(50);
    expect(a).toEqual(mine(1));
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

  it('entrées d’immeuble : celles de doorsFor, dans les tranches qu’elles touchent, et dans la clé', () => {
    const plan = cityPaintPlan(1080, 340, 1);
    expect(plan.doors.map((d) => d.x)).toEqual(doorsFor(1080, 340, 1).map((d) => d.x));
    for (const d of plan.doors) {
      for (let t = 0; t < tileCount(1080); t++) {
        const touches = d.cx - 13 * d.s < (t + 1) * TILE + 2 && d.cx + 13 * d.s > t * TILE - 2;
        expect(tileItems(plan, t).doors.includes(d)).toBe(touches);
      }
    }
    const other = cityPaintPlan(1080, 340, 2);
    expect(tileKey(plan, 0).split('|').slice(5)).not.toEqual(tileKey(other, 0).split('|').slice(5));
  });
});

