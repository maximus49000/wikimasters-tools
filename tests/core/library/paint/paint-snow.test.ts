// tests/core/library/paint/paint-snow.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { heightOn, roofOutline } from '../../../../src/core/library/city/facade-layout';
import { cityPaintPlan, hillCrestY, type CityPaintPlan, type PaintBuilding } from '../../../../src/core/library/paint/city-plan';
import { TILE, tileCount } from '../../../../src/core/library/paint/city-painter';
import { chimneyBoxes, dormerTopY, hillRoofPoints, paintHillSnow, paintSnowTile, roofLineY, roofSpan } from '../../../../src/core/library/paint/snow-painter';
import { recordingCtx } from './recording-ctx';

afterEach(() => vi.restoreAllMocks());

// Point permis : rue et trottoirs (y ≥ sol), sous la ligne de toit d'un immeuble, dans une cheminée, le long de la crête
// (bande de 4 px sous la ligne), sur le petit toit d'une lucarne ou sur le toit d'une maison du fond.
function allowed(plan: ReturnType<typeof cityPaintPlan>, x: number, y: number): boolean {
  if (y >= plan.ground - 1e-6) return true;
  if (y >= hillCrestY(plan, x) - 1e-6 && y <= hillCrestY(plan, x) + 4 + 1e-6) return true;
  if (plan.hill.houses.some((h) => onPolyline(hillRoofPoints(h).map(([px, py]) => [px, py + 0.8 * h.s]), x, y))) return true;
  return plan.buildings.some((b) => {
    if (x >= b.x - 2 && x <= b.x + b.w + 2 && y >= roofLineY(b, x) - 1e-6 && y <= plan.ground) return true;
    if (chimneyBoxes(plan, b).some((c) => x >= c.x0 - 1e-6 && x <= c.x1 + 1e-6 && y >= c.y0 - 1e-6)) return true;
    return (b.layout?.dormers ?? []).some((d) => {
      const t = dormerTopY(d, x);
      return t !== null && y >= t - 1e-6;
    });
  });
}

// Point sur la ligne brisée (trait de neige d'un toit de maison du fond, découpé en morceaux).
function onPolyline(pts: [number, number][], x: number, y: number): boolean {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]!;
    const [bx, by] = pts[i]!;
    if (x < Math.min(ax, bx) - 1e-6 || x > Math.max(ax, bx) + 1e-6) continue;
    if (Math.abs((bx - ax) * (y - ay) - (by - ay) * (x - ax)) <= 1e-6 * Math.hypot(bx - ax, by - ay)) return true;
  }
  return false;
}

// Haut de ce qui est peint devant la colline en x : ligne de toit des immeubles (fond et premier plan), socles ; Infinity si rien.
function frontTop(plan: CityPaintPlan, x: number): number {
  let y = Infinity;
  for (const b of plan.buildings) if (x >= roofSpan(b).x0 && x <= roofSpan(b).x1) y = Math.min(y, roofLineY(b, x));
  for (const p of plan.podiums) if (x >= p.x && x <= p.x + p.w) y = Math.min(y, p.top);
  return y;
}

// Neige d'un seul immeuble : la tranche avec lui seul moins la même tranche sans immeuble (crête, maisons du fond, sol).
function snowOf(plan: CityPaintPlan, b: PaintBuilding): [number, number][] {
  const tile = Math.floor((b.x + b.w / 2) / TILE);
  const all = recordingCtx();
  const rest = recordingCtx();
  paintSnowTile(all, { ...plan, buildings: [b] }, tile);
  paintSnowTile(rest, { ...plan, buildings: [] }, tile);
  const left = new Map<string, number>();
  for (const [x, y] of rest.points) left.set(`${x.toFixed(4)},${y.toFixed(4)}`, (left.get(`${x.toFixed(4)},${y.toFixed(4)}`) ?? 0) + 1);
  return all.points.filter(([x, y]) => {
    const k = `${x.toFixed(4)},${y.toFixed(4)}`;
    const n = left.get(k) ?? 0;
    if (n > 0) left.set(k, n - 1);
    return n === 0;
  });
}

// Immeubles du premier plan mis en page, entiers dans le monde (graines 1 à 6).
function nearLaidOut(): { plan: CityPaintPlan; b: PaintBuilding }[] {
  const out: { plan: CityPaintPlan; b: PaintBuilding }[] = [];
  for (let seed = 1; seed <= 6; seed++) {
    const plan = cityPaintPlan(1080, 340, seed);
    for (const b of plan.buildings) if (!b.far && b.layout && b.x > 4 && b.x + b.w < 1076) out.push({ plan, b });
  }
  return out;
}

describe('neige posée', () => {
  it('ligne de toit du fond : sommet au haut de l’immeuble, avant-toit à la gouttière, zinc plat', () => {
    const plan = cityPaintPlan(2160, 340, 1);
    for (const b of plan.buildings.filter((x) => x.far)) {
      expect(roofLineY(b, b.x + b.w / 2)).toBeCloseTo(b.look.roofKind !== 'gable' ? b.top + 1 : b.top, 6);
      expect(roofLineY(b, b.x)).toBeGreaterThan(b.top);
      expect(roofLineY(b, b.x)).toBeLessThanOrEqual(b.top + b.look.roofH + 1e-6);
    }
  });

  it('ligne de toit du premier plan : le contour de la mise en page, corniche comprise', () => {
    const cases = nearLaidOut();
    expect(cases.some(({ b }) => b.layout!.roof.kind === 'mansard')).toBe(true);
    expect(cases.some(({ b }) => b.layout!.roof.kind !== 'mansard')).toBe(true);
    for (const { b } of cases) {
      const l = b.layout!;
      const pts = roofOutline(l);
      // Haut : terrasson au milieu de la mansarde, faîtage décalé (42 %) du toit simple.
      expect(roofLineY(b, l.roof.kind === 'mansard' ? b.x + b.w / 2 : b.x + 0.42 * b.w)).toBeCloseTo(b.top + 0.5, 6);
      // Extrémités du contour : l'égout (la corniche, à eave − 0,8 de x − 1,5 à x + w + 1,5, couvre celles de la mansarde).
      for (const [px] of [pts[0]!, pts.at(-1)!]) {
        expect(roofLineY(b, px)).toBeCloseTo(Math.abs(px - (b.x + b.w / 2)) <= b.w / 2 + 1.5 ? l.eave - 0.8 : l.eave, 6);
      }
      // Jamais au-dessus du contour ni de la corniche, jamais dessous.
      for (let x = pts[0]![0]; x <= pts.at(-1)![0]; x += 0.37) {
        const corniche = x >= b.x - 1.5 && x <= b.x + b.w + 1.5 ? l.eave - 0.8 : Infinity;
        expect(roofLineY(b, x)).toBeCloseTo(Math.min(heightOn(pts, x), corniche), 9);
      }
    }
  });

  it('mansarde : neige sur le terrasson et le brisis, jamais au-dessus du contour', () => {
    const cases = nearLaidOut().filter(({ b }) => b.layout!.roof.kind === 'mansard').slice(0, 8);
    expect(cases.length).toBeGreaterThan(3);
    for (const { plan, b } of cases) {
      const l = b.layout!;
      const bt = b.top + (l.roof.kind === 'mansard' ? l.roof.terrasson : 4);
      const pts = snowOf(plan, b).filter(([, y]) => y < l.eave - 0.8);
      // Terrasson : la bande du haut, de top + 0,5 à top + 4.
      expect(pts.filter(([x, y]) => y < bt && x > b.x + 6 && x < b.x + b.w - 6).length).toBeGreaterThan(20);
      // Brisis : sous le terrasson, au-dessus de la corniche.
      expect(pts.filter(([x, y]) => y > bt + 2 && x > b.x + 3 && x < b.x + b.w - 3).length).toBeGreaterThan(10);
      const above = pts.filter(([x, y]) => {
        if (y >= roofLineY(b, x) - 1e-6) return false;
        if (chimneyBoxes(plan, b).some((c) => x >= c.x0 - 1e-6 && x <= c.x1 + 1e-6 && y >= c.y0 - 1e-6)) return false;
        return !l.dormers.some((d) => {
          const t = dormerTopY(d, x);
          return t !== null && y >= t - 1e-6;
        });
      });
      expect(above.slice(0, 3)).toEqual([]);
    }
  });

  it('neige sur les dalles des balcons filants', () => {
    const cases = nearLaidOut().filter(({ b }) => b.layout!.levels.some((lv) => lv.balcony === 'filant')).slice(0, 8);
    expect(cases.length).toBeGreaterThan(3);
    for (const { plan, b } of cases) {
      const pts = snowOf(plan, b);
      for (const lv of b.layout!.levels.filter((v) => v.balcony === 'filant')) {
        // Dalle : de x + 0,7 à x + w − 0,7, haut à lv.y + lv.h − 0,4 ; neige posée dessus, sur toute la longueur.
        const slab = (y: number) => y > lv.y + lv.h - 0.5 && y < lv.y + lv.h + 2;
        const on = pts.filter(([x, y]) => slab(y) && x >= b.x + 0.7 && x <= b.x + b.w - 0.7);
        expect(on.length).toBeGreaterThan(b.w);
        expect(Math.min(...on.map(([x]) => x))).toBeLessThan(b.x + 4);
        expect(Math.max(...on.map(([x]) => x))).toBeGreaterThan(b.x + b.w - 4);
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

  for (const seed of [1, 4, 7]) {
    it(`graine ${seed} : la neige de la colline (crête, toits des maisons) n’est jamais peinte sur un immeuble ni un socle`, () => {
      const plan = cityPaintPlan(1080, 340, seed);
      let seen = 0;
      for (let t = 0; t < tileCount(1080); t++) {
        const ctx = recordingCtx();
        const houses = plan.hill.houses.filter((h) => h.x - 2 < (t + 1) * TILE + 2 && h.x + h.w + 2 > t * TILE - 2);
        paintHillSnow(ctx, plan, t * TILE, Math.min(1080, (t + 1) * TILE), houses);
        seen += ctx.points.length;
        // Sommet d'un morceau de neige : jamais sous le haut de ce qui est devant (à la marge d'arrondi près).
        const under = ctx.points.filter(([x, y]) => y > frontTop(plan, x) + 1e-6);
        expect(under.slice(0, 3)).toEqual([]);
      }
      expect(seen).toBeGreaterThan(200);
    });
  }

  it('n’utilise jamais Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random interdit'); });
    paintSnowTile(recordingCtx(), cityPaintPlan(720, 340, 5), 0);
  });
});
