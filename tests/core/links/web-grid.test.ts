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

  it('compte exactement les points d\'un rectangle aligné sur les cases', () => {
    const g = buildGrid(new Float32Array([0, 1, 17, 40, 40]), new Float32Array([0, 30, 3, 40, 41]), 16);
    expect(g.count(0, 0, 15.9, 15.9)).toBe(1);
    expect(g.count(0, 0, 31.9, 31.9)).toBe(3);
    expect(g.count(32, 32, 100, 100)).toBe(2);
    expect(g.count(500, 500, 600, 600)).toBe(0);
  });

  it('reste juste avec un point perdu très loin (cases agrandies)', () => {
    const far = new Float32Array([...xs, 1e6]);
    const farY = new Float32Array([...ys, -1e6]);
    const g = buildGrid(far, farY, 16);
    const found: number[] = [];
    g.forEach(-100, -50, 300, 220, (i) => found.push(i));
    const expected = [...xs].map((_, i) => i).filter((i) => xs[i]! >= -100 && xs[i]! <= 300 && ys[i]! >= -50 && ys[i]! <= 220);
    expect(found.sort((a, b) => a - b)).toEqual(expected);
    expect(g.nearest(1e6 + 1, -1e6, 5)).toBe(3000);
    expect(g.count(-1e7, -1e7, 1e7, 1e7)).toBe(3001);
  });

  it('une grille vide ne trouve rien', () => {
    const g = buildGrid(new Float32Array(0), new Float32Array(0), 16);
    expect(g.count(-1e6, -1e6, 1e6, 1e6)).toBe(0);
    expect(g.nearest(0, 0, 10)).toBe(-1);
  });

  it('trouve le point le plus proche dans un rayon, sinon -1', () => {
    const target = 1234;
    expect(grid.nearest(xs[target]! + 0.2, ys[target]! - 0.2, 5)).toBe(target);
    expect(grid.nearest(5000, 5000, 20)).toBe(-1);
  });
});
