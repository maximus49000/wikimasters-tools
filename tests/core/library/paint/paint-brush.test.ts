import { afterEach, describe, expect, it, vi } from 'vitest';
import { cellRng, dab, DAB_SPREAD, washRect } from '../../../../src/core/library/paint/brush';
import { hexRgb, jitter, mixRgb, rgba } from '../../../../src/core/library/paint/color';
import { mulberry32 } from '../../../../src/core/library/scene-world';
import { recordingCtx } from './recording-ctx';

afterEach(() => vi.restoreAllMocks());

describe('couleurs', () => {
  it('convertit, mélange et formate', () => {
    expect(hexRgb('#FF8000')).toEqual([255, 128, 0]);
    expect(mixRgb([0, 0, 0], [200, 100, 50], 0.5)).toEqual([100, 50, 25]);
    expect(mixRgb([0, 0, 0], [200, 100, 50], 2)).toEqual([200, 100, 50]);
    expect(rgba([1, 2, 3], 0.25)).toBe('rgba(1,2,3,0.25)');
  });
  it('la variation reste dans 0..255', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 100; i++) for (const v of jitter([250, 5, 128], 40, rng)) expect(v >= 0 && v <= 255).toBe(true);
  });
});

describe('touche', () => {
  it('même graine → mêmes tracés', () => {
    const a = recordingCtx();
    const b = recordingCtx();
    dab(a, mulberry32(9), 10, 20, 2, [10, 20, 30], 0.5);
    dab(b, mulberry32(9), 10, 20, 2, [10, 20, 30], 0.5);
    expect(a.ops).toEqual(b.ops);
    expect(a.fills).toEqual(['rgba(10,20,30,0.5)']);
  });
  it('reste dans r × allongement × DAB_SPREAD autour du centre', () => {
    const ctx = recordingCtx();
    const rng = mulberry32(4);
    for (let i = 0; i < 200; i++) dab(ctx, rng, 50, 50, 3, [0, 0, 0], 1, 1.6);
    const reach = 3 * 1.6 * DAB_SPREAD + 1e-9;
    for (const [x, y] of ctx.points) expect(Math.hypot(x - 50, y - 50)).toBeLessThanOrEqual(reach);
  });
});

describe('couverture', () => {
  it('aucun point hors du rectangle, densité respectée', () => {
    const ctx = recordingCtx();
    washRect(ctx, mulberry32(1), { x: 10, y: 20, w: 40, h: 30 }, { color: () => [100, 100, 100], density: 0.5, r: [0.5, 1.2], alpha: 0.3 });
    for (const [x, y] of ctx.points) {
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(50);
      expect(y).toBeGreaterThanOrEqual(20);
      expect(y).toBeLessThanOrEqual(50);
    }
    expect(ctx.fills.length).toBe(600);
  });
  it('rectangle plus petit que la touche : rien', () => {
    const ctx = recordingCtx();
    washRect(ctx, mulberry32(1), { x: 0, y: 0, w: 2, h: 2 }, { color: () => [0, 0, 0], density: 1, r: [1, 2], alpha: 1 });
    expect(ctx.ops).toEqual([]);
  });
});

describe('générateur par case', () => {
  it('même case → même suite ; case voisine → autre suite', () => {
    const a = cellRng(7, 'pavé', 3, 4);
    const b = cellRng(7, 'pavé', 3, 4);
    const c = cellRng(7, 'pavé', 3, 5);
    const sa = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(sa);
    expect([c(), c(), c()]).not.toEqual(sa);
  });
});

describe('déterminisme', () => {
  it('n’utilise jamais Math.random', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random interdit'); });
    const ctx = recordingCtx();
    washRect(ctx, mulberry32(2), { x: 0, y: 0, w: 30, h: 30 }, { color: () => [1, 1, 1], density: 0.2, r: [0.5, 1], alpha: 1 });
    expect(ctx.fills.length).toBeGreaterThan(0);
  });
});
