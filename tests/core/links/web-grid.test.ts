import { describe, expect, it } from 'vitest';
import { buildGrid } from '../../../src/core/links/web-grid';

const cloud = (n: number) => {
  let s = 11;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = (rnd() - 0.5) * 2000;
    ys[i] = (rnd() - 0.5) * 2000;
  }
  return { xs, ys };
};

describe('buildGrid', () => {
  const { xs, ys } = cloud(3000);
  const grid = buildGrid(xs, ys, 16);

  it('rend exactement les points d\'un rectangle', () => {
    const found: number[] = [];
    grid.forEach(-100, -50, 300, 220, (i) => found.push(i));
    const expected = [...xs].map((_, i) => i).filter((i) => xs[i]! >= -100 && xs[i]! <= 300 && ys[i]! >= -50 && ys[i]! <= 220);
    expect(found.sort((a, b) => a - b)).toEqual(expected);
  });

  it('count est un majorant du nombre de points du rectangle', () => {
    const inside = [...xs].filter((x, i) => x >= 0 && x <= 400 && ys[i]! >= 0 && ys[i]! <= 400).length;
    expect(grid.count(0, 0, 400, 400)).toBeGreaterThanOrEqual(inside);
    expect(grid.count(-1e6, -1e6, 1e6, 1e6)).toBe(3000);
  });

  it('un rectangle immense parcourt les cellules, pas les cases', () => {
    const found: number[] = [];
    grid.forEach(-1e7, -1e7, 1e7, 1e7, (i) => found.push(i));
    expect(found).toHaveLength(3000);
  });

  it('trouve le point le plus proche dans un rayon, sinon -1', () => {
    const target = 1234;
    expect(grid.nearest(xs[target]! + 0.2, ys[target]! - 0.2, 5)).toBe(target);
    expect(grid.nearest(5000, 5000, 20)).toBe(-1);
  });
});
