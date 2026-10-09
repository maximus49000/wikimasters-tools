import type { Box, LampSource } from '../../src/core/library/light/occluders';

// Scène fixe (pseudo-aléatoire déterministe) : 96 colonnes de carte = 576 px de pièce.
export const W = 576;
export const H = 510;
export const GEOM = { wallH: 340, floorH: 170 };

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

