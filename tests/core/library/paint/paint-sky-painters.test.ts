import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUD_DAY, CLOUD_KINDS, FOG_W, MOON_SIZE, SKY_TEXTURE, SUN_SIZE,
  cloudShape, paintCloud, paintFogBand, paintMoon, paintSkyTexture, paintSun,
} from '../../../../src/core/library/paint/sky-painter';
import { paths } from './paths';
import { recordingCtx } from './recording-ctx';

afterEach(() => vi.restoreAllMocks());
const inBox = (pts: [number, number][], x0: number, y0: number, x1: number, y1: number): [number, number][] =>
  pts.filter(([x, y]) => x < x0 - 1e-6 || x > x1 + 1e-6 || y < y0 - 1e-6 || y > y1 + 1e-6);

describe('peintre de nuage', () => {
  it('toutes les touches restent dans le cadre, beaucoup de touches', () => {
    for (let k = 0; k < CLOUD_KINDS; k++) {
      const shape = cloudShape(5, k);
      const ctx = recordingCtx();
      paintCloud(ctx, shape, CLOUD_DAY, 5);
      expect(ctx.fills.length).toBeGreaterThan(800);
      expect(inBox(ctx.points, 0, 0, shape.w, shape.h).slice(0, 3)).toEqual([]);
    }
  });

  it('déterministe ; la graine change le dessin', () => {
    const shape = cloudShape(1, 0);
    const a = recordingCtx();
    const b = recordingCtx();
    const c = recordingCtx();
    paintCloud(a, shape, CLOUD_DAY, 1);
    paintCloud(b, shape, CLOUD_DAY, 1);
    paintCloud(c, shape, CLOUD_DAY, 2);
    expect(a.ops).toEqual(b.ops);
    expect(a.ops).not.toEqual(c.ops);
  });
});

describe('texture du ciel', () => {
  it('se raccorde : une touche qui déborde à gauche est reportée à droite à l’identique', () => {
    const ctx = recordingCtx();
    paintSkyTexture(ctx, SKY_TEXTURE, 3);
    const all = paths(ctx);
    expect(all.length).toBeGreaterThan(1000);
    const key = (p: [number, number][], dx: number, dy: number): string => p.map(([x, y]) => `${(x + dx).toFixed(4)},${(y + dy).toFixed(4)}`).join(';');
    const set = new Set(all.map((p) => key(p, 0, 0)));
    for (const p of all.filter((q) => Math.min(...q.map(([x]) => x)) < 0).slice(0, 50)) expect(set.has(key(p, SKY_TEXTURE, 0))).toBe(true);
    for (const p of all.filter((q) => Math.min(...q.map(([, y]) => y)) < 0).slice(0, 50)) expect(set.has(key(p, 0, SKY_TEXTURE))).toBe(true);
  });
});

const alphaOf = (fill: string): number => Number(/,([\d.]+)\)$/.exec(fill)![1]);

describe('texture discrète et brume présente', () => {
  it('texture : touches très légères (0,015 à 0,035), trois quarts claires, sombres en #4A5A80', () => {
    const ctx = recordingCtx();
    paintSkyTexture(ctx, SKY_TEXTURE, 2);
    const alphas = ctx.fills.map(alphaOf);
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(0.015);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(0.035);
    const light = ctx.fills.filter((f) => f.startsWith('rgba(255,255,255,')).length;
    const dark = ctx.fills.filter((f) => f.startsWith('rgba(74,90,128,')).length;
    expect(light + dark).toBe(ctx.fills.length);
    expect(light / ctx.fills.length).toBeGreaterThan(0.7);
    expect(light / ctx.fills.length).toBeLessThan(0.8);
  });

  it('brume : bancs plus denses et plus marqués (alpha jusqu’à 0,06, touches de rayon 10 à 20)', () => {
    const ctx = recordingCtx();
    paintFogBand(ctx, FOG_W, 238, 4);
    const alphas = ctx.fills.map(alphaOf);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(0.06);
    expect(Math.max(...alphas)).toBeGreaterThan(0.05);
    expect(ctx.fills.length).toBeGreaterThanOrEqual(3 * 1050);
    // Touche la plus large : rayon 20, allongement 2,6 → largeur bien au-delà de celle des anciennes touches (≤ 11 × 2,6 × 2 × 1,2).
    const widths = paths(ctx).map((q) => Math.max(...q.map(([x]) => x)) - Math.min(...q.map(([x]) => x)));
    expect(Math.max(...widths)).toBeGreaterThan(70);
  });
});

describe('astres et brume', () => {
  it('soleil et lune dans leur cadre', () => {
    for (const dusk of [false, true]) {
      const s = recordingCtx();
      paintSun(s, dusk, 1);
      expect(inBox(s.points, 0, 0, SUN_SIZE, SUN_SIZE).slice(0, 3)).toEqual([]);
    }
    const m = recordingCtx();
    paintMoon(m, 1);
    expect(inBox(m.points, 0, 0, MOON_SIZE, MOON_SIZE).slice(0, 3)).toEqual([]);
  });

  it('brume : bancs dans la hauteur, raccord gauche-droite', () => {
    const ctx = recordingCtx();
    paintFogBand(ctx, FOG_W, 150, 4);
    const all = paths(ctx);
    expect(all.length).toBeGreaterThan(500);
    for (const p of all) {
      for (const [, y] of p) {
        expect(y).toBeGreaterThanOrEqual(-1e-6);
        expect(y).toBeLessThanOrEqual(150 + 1e-6);
      }
    }
    const key = (p: [number, number][], dx: number): string => p.map(([x, y]) => `${(x + dx).toFixed(4)},${y.toFixed(4)}`).join(';');
    const set = new Set(all.map((p) => key(p, 0)));
    for (const p of all.filter((q) => Math.min(...q.map(([x]) => x)) < 0).slice(0, 50)) expect(set.has(key(p, FOG_W))).toBe(true);
  });

  it('n’utilise jamais Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random interdit'); });
    paintCloud(recordingCtx(), cloudShape(1, 1), CLOUD_DAY, 1);
    paintSkyTexture(recordingCtx(), SKY_TEXTURE, 1);
    paintSun(recordingCtx(), false, 1);
    paintMoon(recordingCtx(), 1);
    paintFogBand(recordingCtx(), FOG_W, 120, 1);
  });
});
