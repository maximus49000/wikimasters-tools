import { describe, expect, it } from 'vitest';
import { lampField } from '../../../src/core/library/light/lamps';
import { buildLightMap, type LightInput } from '../../../src/core/library/light/light-map';
import { buildSurfaceMap } from '../../../src/core/library/light/surfaces';
import type { Box, LampSource } from '../../../src/core/library/light/occluders';

// Scène fixe (pseudo-aléatoire déterministe) : 96 colonnes de carte = 576 px de pièce.
const W = 576;
const H = 510;
const GEOM = { wallH: 340, floorH: 170 };

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
export function scene(nBoxes: number, nLamps: number): { boxes: Box[]; lamps: LampSource[] } {
  const r = rng(42);
  const boxes: Box[] = [];
  for (let k = 0; k < nBoxes; k++) {
    const x0 = r() * (W - 60);
    const d0 = r() * 250;
    const z0 = r() < 0.5 ? 0 : r() * 60;
    boxes.push({ owner: `m${k % 27}`, x0, x1: x0 + 10 + r() * 50, d0, d1: d0 + 10 + r() * 50, z0, z1: z0 + 10 + r() * 90 });
  }
  const lamps: LampSource[] = [];
  for (let k = 0; k < nLamps; k++) {
    lamps.push({ id: `l${k}`, x: 40 + r() * (W - 80), d: 20 + r() * 200, z: 30 + r() * 120, box: `m${k}` });
  }
  return { boxes, lamps };
}

// Empreinte FNV-1a des octets d'un Float32Array.
export function hash(f: Float32Array | Uint8ClampedArray): string {
  const b = new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) { h ^= b[i]!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}

const sun: LightInput = {
  width: W, height: H, wallH: GEOM.wallH,
  windows: [{ x: 40, y: 60, w: 60, h: 100 }, { x: 160, y: 60, w: 60, h: 100 }, { x: 280, y: 60, w: 60, h: 100 }, { x: 400, y: 60, w: 60, h: 100 }, { x: 480, y: 80, w: 50, h: 80 }, { x: 10, y: 90, w: 20, h: 60 }],
  sunX: 250, sunFrac: 0.35, daylight: 1, twilight: 0, cloud: 0.2, precip: 0, hidden: 0,
};

describe('empreintes de référence (sortie identique après optimisation)', () => {
  it('lampField 3 lampes / 81 boîtes', () => {
    const { boxes, lamps } = scene(81, 3);
    const surf = buildSurfaceMap(boxes, W, H, GEOM, 6);
    expect(hash(lampField(lamps, boxes, surf, 6))).toBe('b75f6e69');
  });
  it('lampField 8 lampes / 81 boîtes', () => {
    const { boxes, lamps } = scene(81, 8);
    const surf = buildSurfaceMap(boxes, W, H, GEOM, 6);
    expect(hash(lampField(lamps, boxes, surf, 6))).toBe('6e0d24f9');
  });
  it('buildLightMap avec meubles, soleil et lampes', () => {
    const { boxes, lamps } = scene(72, 3);
    expect(hash(buildLightMap({ ...sun, boxes, lamps }).rgba)).toBe('8ecce1e9');
  });
  it('buildLightMap avec meubles, soleil bas et nuages variés', () => {
    const { boxes } = scene(40, 0);
    expect(hash(buildLightMap({ ...sun, sunX: 520, sunFrac: 0.6, cloud: 0.6, hidden: 0.3, boxes }).rgba)).toBe('ee98de4a');
  });
});
