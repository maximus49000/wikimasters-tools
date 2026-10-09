import { describe, expect, it } from 'vitest';
import { lampField } from '../../../src/core/library/light/lamps';
import { lampPetTransmission, sunPetTransmission } from '../../../src/core/library/light/pet-shade';
import { SURF, buildSurfaceMap } from '../../../src/core/library/light/surfaces';
import type { Box, LampSource } from '../../../src/core/library/light/occluders';

const GEOM = { wallH: 200, floorH: 310 };
const SCALE = 6;
const surf = buildSurfaceMap([], 600, 510, GEOM, SCALE);
const lamp: LampSource = { id: 'l', x: 300, d: 100, z: 60, box: 'l' };
const pixelAt = (x: number, d: number): number => {
  let best = -1; let bd = Infinity;
  for (let n = 0; n < surf.w * surf.h; n++) {
    if (surf.kind[n] !== SURF.ground) continue;
    const e = Math.abs(((n % surf.w) + 0.5) * SCALE - x) + Math.abs((surf.d[n] ?? 0) - d);
    if (e < bd) { bd = e; best = n; }
  }
  return best;
};
// Un animal entre la lampe et un point du sol, sur le segment.
const between: Box = { owner: 'p1', x0: 300, x1: 330, d0: 190, d1: 230, z0: 0, z1: 40 };

describe('lampPetTransmission', () => {
  it('vaut 1 partout sans animal', () => {
    const field = lampField([lamp], [], surf, SCALE);
    const t = lampPetTransmission([lamp], [], surf, field, SCALE);
    expect(Array.from(t).every((v) => v === 1)).toBe(true);
  });
  it('assombrit l’arrière d’un animal vu de la lampe, pas le côté', () => {
    const field = lampField([lamp], [], surf, SCALE);
    const t = lampPetTransmission([lamp], [between], surf, field, SCALE);
    const behind = pixelAt(315, 290);
    const side = pixelAt(150, 290);
    expect(field[behind]!).toBeGreaterThan(0);
    expect(t[behind]!).toBeLessThan(1);
    expect(t[side]!).toBe(1);
  });
  it('ne touche pas les pixels sans lueur', () => {
    const field = new Float32Array(surf.w * surf.h);
    const t = lampPetTransmission([lamp], [between], surf, field, SCALE);
    expect(Array.from(t).every((v) => v === 1)).toBe(true);
  });
});

describe('lampPetTransmission, deux lampes', () => {
  // A (x 560) projette l'ombre de l'animal sur le pixel ; B (x −120) n'a aucun animal dans sa fenêtre en x
  // (b.x0 < B.x + 420 est faux) mais éclaire quand même le pixel.
  const A: LampSource = { id: 'a', x: 560, d: 250, z: 60, box: 'a' };
  const B: LampSource = { id: 'b', x: -120, d: 290, z: 60, box: 'b' };
  const pet: Box = { owner: 'p1', x0: 300, x1: 330, d0: 270, d1: 300, z0: 0, z1: 40 };
  const n = pixelAt(250, 290);
  it('une lampe sans animal à portée garde son poids dans la moyenne', () => {
    const field = new Float32Array(surf.w * surf.h).fill(1);
    const aSeul = lampPetTransmission([A], [pet], surf, field, SCALE)[n]!;
    const bSeul = lampPetTransmission([B], [pet], surf, field, SCALE)[n]!;
    const deux = lampPetTransmission([A, B], [pet], surf, field, SCALE)[n]!;
    expect(aSeul).toBeLessThan(1);
    expect(bSeul).toBe(1);
    expect(deux).toBeGreaterThan(aSeul);
    expect(deux).toBeLessThan(1);
  });
});

describe('sunPetTransmission', () => {
  const glass = { x: 280, y: 40, w: 60, h: 80, zBottom: 80, zTop: 160 };
  const tanElev = Math.tan(0.7);
  it('vaut 1 hors des pixels éclairés et sans animal', () => {
    const sun = new Float64Array(surf.w * surf.h);
    expect(Array.from(sunPetTransmission([{ g: glass, slope: 0 }], [between], surf, sun, tanElev, SCALE)).every((v) => v === 1)).toBe(true);
  });
  it('ombre un pixel éclairé placé juste derrière l’animal le long du rayon', () => {
    const sun = new Float64Array(surf.w * surf.h).fill(1);
    // animal haut en x 300..330 ; son ombre tombe vers l'avant (d plus grand)
    const tall: Box = { owner: 'p1', x0: 300, x1: 330, d0: 100, d1: 130, z0: 0, z1: 40 };
    const t = sunPetTransmission([{ g: glass, slope: 0 }], [tall], surf, sun, tanElev, SCALE);
    const shadowed = pixelAt(315, 130 + 40 / tanElev * 0.5);
    const free = pixelAt(150, 200);
    expect(t[shadowed]!).toBeLessThan(1);
    expect(t[free]!).toBe(1);
  });
});
