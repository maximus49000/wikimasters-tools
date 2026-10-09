import { mixHex } from '../sky';
import { beamGain } from './attenuation';
import { lampNeed, skyLevel, skylightAt } from './ambient';
import { ROOM_DEPTH_FACTOR, beamPatch, type Glass, type Point } from './beam';
import { lampField } from './lamps';
import type { Box, LampSource } from './occluders';
import { sunReaches, type V3 } from './shadow';
import { beamSlope, sunElevation } from './sun-dir';
import { SURF, buildSurfaceMap, type SurfaceMap } from './surfaces';

// Un pixel de la carte = 6 unités de la pièce.
export const LIGHT_SCALE = 6;
export type LightInput = {
  width: number; height: number; wallH: number; windows: readonly Glass[];
  sunX: number | null; sunFrac: number | null;
  daylight: number; twilight: number; cloud: number; precip: number; hidden: number;
  // Meubles (occulteurs) et lampes allumées ; absents = pièce vide, sortie identique à 8a.
  boxes?: readonly Box[]; lamps?: readonly LampSource[];
};
export type LightMap = { w: number; h: number; rgba: Uint8ClampedArray };

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const WARM = hex('#FFE9A8');
const LAMP_WARM = hex('#FFD38A');
const MIN_ELEV = 0.02; // même seuil que beamPatch

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

const round = (v: number): string => v.toFixed(1);
const boxesSig = (boxes: readonly Box[]): string => boxes.map((b) => `${b.owner}:${round(b.x0)},${round(b.x1)},${round(b.d0)},${round(b.d1)},${round(b.z0)},${round(b.z1)}`).join(';');
const lampsSig = (lamps: readonly LampSource[]): string => lamps.map((l) => `${l.id}:${round(l.x)},${round(l.d)},${round(l.z)}:${l.box}`).join(';');

// Carte des surfaces visibles et champ des lampes : ne changent qu'avec les meubles, les lampes ou les dimensions.
let surfMemo: { sig: string; surf: SurfaceMap } | null = null;
function surfaceOf(boxes: readonly Box[], width: number, height: number, wallH: number): SurfaceMap {
  const sig = `${width}x${height}|${wallH}|${boxesSig(boxes)}`;
  if (surfMemo?.sig === sig) return surfMemo.surf;
  const surf = buildSurfaceMap(boxes, width, height, { wallH, floorH: height - wallH }, LIGHT_SCALE);
  surfMemo = { sig, surf };
  return surf;
}
let lampMemo: { sig: string; field: Float32Array } | null = null;
function lampLightOf(lamps: readonly LampSource[], boxes: readonly Box[], surf: SurfaceMap, width: number, height: number, wallH: number): Float32Array {
  const sig = `${width}x${height}|${wallH}|${boxesSig(boxes)}|${lampsSig(lamps)}`;
  if (lampMemo?.sig === sig) return lampMemo.field;
  const field = lampField(lamps, boxes, surf, LIGHT_SCALE);
  lampMemo = { sig, field };
  return field;
}

// Image RGBA (non prémultipliée) posée par-dessus la pièce : une ombre translucide teintée, éclaircie sous les rayons,
// plus une lueur chaude sous chaque rayon. Déterministe pour une entrée donnée.
export function buildLightMap(input: LightInput): LightMap {
  const { width, height, wallH, windows } = input;
  const boxes = input.boxes ?? [];
  const lamps = input.lamps ?? [];
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
  const sunX = input.sunX;
  const sunny = sunX !== null && gain > 0;
  if (sunny && boxes.length === 0) {
    for (const g of windows) {
      const patch = beamPatch(g, wallH, floorH, elev, beamSlope(sunX!, g.x + g.w / 2, wallH));
      if (patch) patches.push(patch);
    }
  }
  // Avec des meubles : le rayon est testé par projection exacte du verre, avec ombres portées (bord doux).
  const glasses = sunny && boxes.length > 0 && elev > MIN_ELEV
    ? windows.map((g) => ({ g: { ...g, zBottom: wallH - (g.y + g.h), zTop: wallH - g.y }, slope: beamSlope(sunX!, g.x + g.w / 2, wallH) }))
    : [];
  const tanElev = Math.tan(elev);
  const surf = surfaceOf(boxes, width, height, wallH);
  const lampLight = lampLightOf(lamps, boxes, surf, width, height, wallH);
  const P: V3 = { x: 0, d: 0, z: 0 };
  for (let j = 0; j < h; j++) {
    const y = (j + 0.5) * LIGHT_SCALE;
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5) * LIGHT_SCALE;
      // La vue à travers le verre n'est jamais assombrie.
      if (windows.some((g) => x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h)) continue;
      const n = j * w + i;
      const lampL = lampLight[n]!;
      const light = clamp01(clamp01(0.2 + 0.8 * sky * field[n]!) + lampL * need);
      const shade = (1 - light) * shadeGain;
      const kind = surf.kind[n]!;
      let b = 0;
      if (boxes.length > 0) {
        // Face avant et mur : pas de soleil direct ; sol et dessus : max des fenêtres, occultation par les meubles.
        if (kind === SURF.ground || kind === SURF.top) {
          const d = surf.d[n]!;
          P.x = x; P.d = d; P.z = kind === SURF.top ? surf.z[n]! + 0.5 : 0;
          const fade = 1 - 0.4 * (d / depthMax);
          for (const { g, slope } of glasses) {
            const reach = sunReaches(P, g, tanElev, slope, boxes);
            if (reach > 0) b = Math.max(b, gain * fade * reach);
          }
        }
      } else if (y >= wallH) {
        for (const q of patches) {
          if (!inQuad(q, x, y)) continue;
          const depth = ((y - wallH) / floorH) * depthMax;
          b = Math.max(b, gain * (1 - 0.4 * (depth / depthMax)));
        }
      }
      const a1 = shade * (1 - b);
      const sunA = Math.min(0.38 * b, 0.9 * shade * b);
      const glow = lampL > 0 ? Math.min(0.34, 0.34 * lampL * (0.08 + 0.92 * need)) : 0;
      const a2 = sunA + glow * (1 - sunA);
      const a = a2 + a1 * (1 - a2);
      if (a <= 0.001) continue;
      const o = n * 4;
      // Teinte chaude = mélange du soleil et de la lampe pondéré par leur alpha.
      for (let c = 0; c < 3; c++) {
        const warmC = glow > 0 ? (WARM[c]! * sunA + LAMP_WARM[c]! * glow * (1 - sunA)) / a2 : WARM[c]!;
        rgba[o + c] = (warmC * a2 + dark[c]! * a1 * (1 - a2)) / a;
      }
      rgba[o + 3] = a * 255;
    }
  }
  return { w, h, rgba };
}
