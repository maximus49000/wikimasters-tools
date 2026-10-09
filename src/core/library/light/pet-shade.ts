import type { Glass } from './beam';
import { LAMP_RMAX, irradianceAt } from './lamps';
import type { Box, LampSource } from './occluders';
import { litFraction, sunReaches, type V3 } from './shadow';
import { SURF, type SurfaceMap } from './surfaces';

const DEFAULT_SCALE = 6; // = LIGHT_SCALE (light-map.ts), redéfini pour éviter un import circulaire
const LAMP_SPREAD = 6;

export type SunGlassLike = { g: Glass & { zBottom: number; zTop: number }; slope: number };

const touches = (b: Box, s: LampSource): boolean =>
  s.x >= b.x0 - LAMP_SPREAD && s.x <= b.x1 + LAMP_SPREAD && s.d >= b.d0 - LAMP_SPREAD && s.d <= b.d1 + LAMP_SPREAD &&
  s.z >= b.z0 - LAMP_SPREAD && s.z <= b.z1 + LAMP_SPREAD;

// Part (0..1) de la lumière des lampes qui reste après les animaux : moyenne des transmissions de chaque lampe,
// pondérée par l'éclairement. 1 partout où la carte des lampes est nulle, et sur le mur du fond.
export function lampPetTransmission(
  sources: readonly LampSource[],
  pets: readonly Box[],
  surf: SurfaceMap,
  lamp: Float32Array,
  scale: number = DEFAULT_SCALE,
): Float32Array {
  const out = new Float32Array(surf.w * surf.h).fill(1);
  if (sources.length === 0 || pets.length === 0) return out;
  const num = new Float32Array(surf.w * surf.h);
  const den = new Float32Array(surf.w * surf.h);
  const P: V3 = { x: 0, d: 0, z: 0 };
  for (const s of sources) {
    // Sans animal à portée, la lampe compte quand même (transmission 1) dans la moyenne pondérée.
    // Une boîte qui contient la lampe (chat sur le même bureau) ou la frôle ne l'occulte pas : on l'écarte.
    const gene = pets.filter((b) => b.x1 > s.x - LAMP_RMAX && b.x0 < s.x + LAMP_RMAX && !touches(b, s));
    const i0 = Math.max(0, Math.floor((s.x - LAMP_RMAX) / scale - 0.5));
    const i1 = Math.min(surf.w - 1, Math.ceil((s.x + LAMP_RMAX) / scale - 0.5));
    for (let j = 0; j < surf.h; j++) {
      for (let i = i0; i <= i1; i++) {
        const n = j * surf.w + i;
        if ((lamp[n] ?? 0) <= 0 || surf.kind[n] === SURF.wall) continue;
        const irr = irradianceAt(s, surf, i, j, scale, P);
        if (irr <= 0) continue;
        num[n] = (num[n] ?? 0) + irr * litFraction(P, s, LAMP_SPREAD, gene);
        den[n] = (den[n] ?? 0) + irr;
      }
    }
  }
  for (let n = 0; n < out.length; n++) if ((den[n] ?? 0) > 0) out[n] = (num[n] ?? 0) / den[n]!;
  return out;
}

// Part (0..1) du soleil qui reste après les animaux, aux seuls pixels de sol ou de dessus déjà éclairés (`sun` > 0) :
// pour chaque fenêtre dont la projection contient le pixel, part non occultée par les animaux ; on garde la meilleure.
export function sunPetTransmission(
  glasses: readonly SunGlassLike[],
  pets: readonly Box[],
  surf: SurfaceMap,
  sun: Float64Array,
  tanElev: number,
  scale: number = DEFAULT_SCALE,
): Float32Array {
  const out = new Float32Array(surf.w * surf.h).fill(1);
  if (glasses.length === 0 || pets.length === 0) return out;
  const P: V3 = { x: 0, d: 0, z: 0 };
  for (let j = 0; j < surf.h; j++) {
    for (let i = 0; i < surf.w; i++) {
      const n = j * surf.w + i;
      if ((sun[n] ?? 0) <= 0) continue;
      const kind = surf.kind[n]!;
      if (kind !== SURF.ground && kind !== SURF.top) continue;
      P.x = (i + 0.5) * scale;
      P.d = surf.d[n]!;
      P.z = kind === SURF.top ? surf.z[n]! + 0.5 : 0;
      let best = 0;
      let seen = false;
      for (const { g, slope } of glasses) {
        if (sunReaches(P, g, tanElev, slope, []) <= 0) continue;
        seen = true;
        best = Math.max(best, sunReaches(P, g, tanElev, slope, pets));
      }
      if (seen) out[n] = best;
    }
  }
  return out;
}
