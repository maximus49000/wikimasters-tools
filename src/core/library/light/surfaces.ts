import { ROOM_DEPTH_FACTOR } from './beam';
import type { Box, Geom } from './occluders';

// Surface visible de chaque pixel de la carte de lumière : sol, mur du fond, face avant ou dessus d'une boîte.
export type SurfaceMap = { w: number; h: number; kind: Uint8Array; d: Float32Array; z: Float32Array };
export const SURF = { ground: 0, wall: 1, front: 2, top: 3 } as const;

// Part maximale du rectangle écran occupée par la bande du dessus.
const TOP_STRIP_MAX = 0.4;

export function buildSurfaceMap(boxes: readonly Box[], width: number, height: number, geom: Geom, scale: number): SurfaceMap {
  const w = Math.ceil(width / scale);
  const h = Math.ceil(height / scale);
  const { wallH, floorH } = geom;
  const k = floorH / (wallH * ROOM_DEPTH_FACTOR);
  const kind = new Uint8Array(w * h);
  const d = new Float32Array(w * h);
  const z = new Float32Array(w * h);

  // Par défaut : mur du fond au-dessus de wallH, sol en dessous.
  for (let j = 0; j < h; j++) {
    const y = (j + 0.5) * scale;
    for (let i = 0; i < w; i++) {
      const n = j * w + i;
      if (y < wallH) {
        kind[n] = SURF.wall;
        d[n] = 0;
        z[n] = wallH - y;
      } else {
        kind[n] = SURF.ground;
        d[n] = (y - wallH) / k;
        z[n] = 0;
      }
    }
  }

  // Boîtes peintes de l'arrière vers l'avant : la plus proche recouvre les autres.
  const sorted = [...boxes].sort((a, b) => a.d1 - b.d1 || a.d0 - b.d0);
  for (const b of sorted) {
    const yTop = wallH + b.d1 * k - b.z1;
    const yBottom = wallH + b.d1 * k - b.z0;
    const strip = Math.min((b.d1 - b.d0) * k, TOP_STRIP_MAX * (yBottom - yTop));
    const stripEnd = yTop + strip;
    const iMin = Math.max(0, Math.ceil(b.x0 / scale - 0.5));
    const iMax = Math.min(w - 1, Math.floor(b.x1 / scale - 0.5));
    const jMin = Math.max(0, Math.ceil(yTop / scale - 0.5));
    const jMax = Math.min(h - 1, Math.floor(yBottom / scale - 0.5));
    for (let j = jMin; j <= jMax; j++) {
      const y = (j + 0.5) * scale;
      if (y < yTop || y > yBottom) continue;
      for (let i = iMin; i <= iMax; i++) {
        const x = (i + 0.5) * scale;
        if (x < b.x0 || x > b.x1) continue;
        const n = j * w + i;
        if (y < stripEnd) {
          kind[n] = SURF.top;
          z[n] = b.z1;
          d[n] = strip > 0 ? b.d0 + ((y - yTop) / strip) * (b.d1 - b.d0) : b.d1;
        } else {
          kind[n] = SURF.front;
          d[n] = b.d1;
          z[n] = b.z1 - (y - stripEnd);
        }
      }
    }
  }
  return { w, h, kind, d, z };
}
