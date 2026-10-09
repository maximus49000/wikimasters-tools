import { describe, expect, it } from 'vitest';
import { SURF, buildSurfaceMap } from '../../../src/core/library/light/surfaces';
import type { Box } from '../../../src/core/library/light/occluders';

// wallH 340, floorH 170 : k = 170 / (340 · 2) = 0.25
const G = { wallH: 340, floorH: 170 };
const W = 340;
const H = 510;
const S = 6;
const at = (m: ReturnType<typeof buildSurfaceMap>, x: number, y: number) => {
  const i = Math.floor(x / S);
  const j = Math.floor(y / S);
  const n = j * m.w + i;
  return { kind: m.kind[n], d: m.d[n], z: m.z[n] };
};
const box = (o: string, d0: number, d1: number, x0 = 100, x1 = 200, z0 = 0, z1 = 100): Box => ({ owner: o, x0, x1, d0, d1, z0, z1 });

describe('buildSurfaceMap', () => {
  it('sans boîte : mur en haut, sol en bas', () => {
    const m = buildSurfaceMap([], W, H, G, S);
    expect(m.w).toBe(Math.ceil(W / S));
    expect(m.h).toBe(Math.ceil(H / S));
    const wall = at(m, 150, 100);
    expect(wall.kind).toBe(SURF.wall);
    expect(wall.d).toBe(0);
    expect(wall.z).toBeCloseTo(340 - 99, 5); // centre du pixel y = 99
    const ground = at(m, 150, 400);
    expect(ground.kind).toBe(SURF.ground);
    expect(ground.z).toBe(0);
    expect(ground.d).toBeCloseTo((399 - 340) / 0.25, 3); // centre y = 399
  });

  it('boîte pleine : face avant, bande du dessus, hors rectangle inchangé', () => {
    // yTop = 340 + 50 − 100 = 290, yBottom = 390, S = min(25, 40) = 25 → bande [290, 315)
    const m = buildSurfaceMap([box('a', 100, 200)], W, H, G, S);
    const front = at(m, 150, 375);
    expect(front.kind).toBe(SURF.front);
    expect(front.d).toBeCloseTo(200, 4);
    expect(front.z).toBeCloseTo(100 - (375 - 315), 4);
    const top = at(m, 150, 297);
    expect(top.kind).toBe(SURF.top);
    expect(top.z).toBeCloseTo(100, 4);
    expect(top.d).toBeGreaterThanOrEqual(100);
    expect(top.d).toBeLessThanOrEqual(200);
    expect(at(m, 50, 375).kind).toBe(SURF.ground);
    expect(at(m, 150, 200).kind).toBe(SURF.wall);
  });

  it('la boîte la plus proche gagne, quel que soit l\'ordre', () => {
    const near = box('near', 150, 220, 100, 200, 0, 60);
    const far = box('far', 100, 160, 100, 200, 0, 60);
    for (const list of [[near, far], [far, near]]) {
      const m = buildSurfaceMap(list, W, H, G, S);
      // near : yBottom = 340 + 55 = 395, yTop = 335 ; pixel y = 375 dans les deux rectangles
      const p = at(m, 150, 375);
      expect(p.kind).toBe(SURF.front);
      expect(p.d).toBeCloseTo(220, 4);
    }
  });

  it('boîte plus étroite qu\'un pixel : ne plante pas', () => {
    const m = buildSurfaceMap([box('f', 100, 200, 100.5, 101.5)], W, H, G, S);
    expect(m.kind.length).toBe(m.w * m.h);
  });
});
