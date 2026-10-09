import { mixHex } from '../sky';
import { beamGain } from './attenuation';
import { lampNeed, skyLevel, skylightAt } from './ambient';
import { ROOM_DEPTH_FACTOR, beamPatch, type Glass, type Point } from './beam';
import { beamSlope, sunElevation } from './sun-dir';

// Un pixel de la carte = 6 unités de la pièce.
export const LIGHT_SCALE = 6;
export type LightInput = {
  width: number; height: number; wallH: number; windows: readonly Glass[];
  sunX: number | null; sunFrac: number | null;
  daylight: number; twilight: number; cloud: number; precip: number; hidden: number;
};
export type LightMap = { w: number; h: number; rgba: Uint8ClampedArray };

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const WARM = hex('#FFE9A8');

// Point dans un quadrilatère convexe : les quatre produits vectoriels ont le même signe.
function inQuad(q: readonly Point[], x: number, y: number): boolean {
  let sign = 0;
  for (let k = 0; k < 4; k++) {
    const a = q[k]!;
    const b = q[(k + 1) % 4]!;
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

// Lumière du ciel par pixel : indépendante de l'heure, donc gardée d'un appel à l'autre tant que fenêtres et dimensions ne changent pas.
let fieldMemo: { sig: string; field: Float32Array } | null = null;
function skyField(windows: readonly Glass[], width: number, height: number, w: number, h: number): Float32Array {
  const sig = `${width}x${height}|${windows.map((g) => `${g.x},${g.y},${g.w},${g.h}`).join(';')}`;
  if (fieldMemo?.sig === sig) return fieldMemo.field;
  const field = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) field[j * w + i] = skylightAt((i + 0.5) * LIGHT_SCALE, (j + 0.5) * LIGHT_SCALE, windows);
  fieldMemo = { sig, field };
  return field;
}

// Image RGBA (non prémultipliée) posée par-dessus la pièce : une ombre translucide teintée, éclaircie sous les rayons,
// plus une lueur chaude sous chaque rayon. Déterministe pour une entrée donnée.
export function buildLightMap(input: LightInput): LightMap {
  const { width, height, wallH, windows } = input;
  const w = Math.ceil(width / LIGHT_SCALE);
  const h = Math.ceil(height / LIGHT_SCALE);
  const rgba = new Uint8ClampedArray(w * h * 4);
  const field = skyField(windows, width, height, w, h);
  const sky = skyLevel(input.daylight, input.cloud);
  const need = lampNeed(input.daylight, input.cloud, input.precip);
  const shadeGain = 0.6 * (0.45 + 0.55 * need);
  const dark = hex(mixHex(mixHex('#1B2236', '#0A1030', 1 - input.daylight), '#3A2418', input.twilight * 0.7));
  const floorH = height - wallH;
  const depthMax = wallH * ROOM_DEPTH_FACTOR;
  const elev = sunElevation(input.sunFrac);
  const gain = beamGain(elev, input.cloud, input.hidden);
  const patches: Point[][] = [];
  if (input.sunX !== null && gain > 0) {
    for (const g of windows) {
      const patch = beamPatch(g, wallH, floorH, elev, beamSlope(input.sunX, g.x + g.w / 2, wallH));
      if (patch) patches.push(patch);
    }
  }
  for (let j = 0; j < h; j++) {
    const y = (j + 0.5) * LIGHT_SCALE;
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5) * LIGHT_SCALE;
      // La vue à travers le verre n'est jamais assombrie.
      if (windows.some((g) => x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h)) continue;
      const light = clamp01(0.2 + 0.8 * sky * field[j * w + i]!);
      const shade = (1 - light) * shadeGain;
      let b = 0;
      if (y >= wallH) {
        for (const q of patches) {
          if (!inQuad(q, x, y)) continue;
          const depth = ((y - wallH) / floorH) * depthMax;
          b = Math.max(b, gain * (1 - 0.4 * (depth / depthMax)));
        }
      }
      const a1 = shade * (1 - b);
      const a2 = Math.min(0.38 * b, 0.9 * shade * b);
      const a = a2 + a1 * (1 - a2);
      if (a <= 0.001) continue;
      const o = (j * w + i) * 4;
      for (let c = 0; c < 3; c++) rgba[o + c] = (WARM[c]! * a2 + dark[c]! * a1 * (1 - a2)) / a;
      rgba[o + 3] = a * 255;
    }
  }
  return { w, h, rgba };
}
