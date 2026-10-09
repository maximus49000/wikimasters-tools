import type { Box, LampSource } from './occluders';
import { litFraction } from './shadow';
import type { V3 } from './shadow';
import { SURF } from './surfaces';
import type { SurfaceMap } from './surfaces';

export const LAMP_R0 = 90; // distance où l'éclairement est divisé par 2
export const LAMP_RMAX = 420; // portée : coupe lissée
const LAMP_GAIN = 1.6;
const LAMP_SPREAD = 6;
// Même valeur que LIGHT_SCALE (light-map.ts) ; redéfinie ici pour éviter un import circulaire.
const DEFAULT_SCALE = 6;

// cos · fade / (1 + (r/R0)²), fade = (1 − (r/RMAX)²)² ; 0 au-delà de la portée ou si la face tourne le dos.
export function lampIrradiance(r: number, cosTheta: number): number {
  if (cosTheta <= 0 || r >= LAMP_RMAX) return 0;
  const q = r / LAMP_RMAX;
  const fade = (1 - q * q) ** 2;
  return (cosTheta * fade) / (1 + (r / LAMP_R0) ** 2);
}

// Une valeur 0..1 par pixel : somme des lampes (occultation incluse), clampée.
// `scale` = taille d'un pixel de la carte en px de la pièce (sert au centre x du pixel).
export function lampField(
  sources: readonly LampSource[],
  boxes: readonly Box[],
  surf: SurfaceMap,
  scale: number = DEFAULT_SCALE,
): Float32Array {
  const out = new Float32Array(surf.w * surf.h);
  if (sources.length === 0) return out;
  const P: V3 = { x: 0, d: 0, z: 0 };
  for (const s of sources) {
    // Une seule fois par lampe : les meubles qui peuvent gêner (hors son propre corps, à portée en x).
    const gene = boxes.filter((b) => b.owner !== s.box && b.x1 > s.x - LAMP_RMAX && b.x0 < s.x + LAMP_RMAX);
    const i0 = Math.max(0, Math.floor((s.x - LAMP_RMAX) / scale - 0.5));
    const i1 = Math.min(surf.w - 1, Math.ceil((s.x + LAMP_RMAX) / scale - 0.5));
    for (let j = 0; j < surf.h; j++) {
      for (let i = i0; i <= i1; i++) {
        const n = j * surf.w + i;
        const kind = surf.kind[n] ?? SURF.ground;
        const x = (i + 0.5) * scale;
        let d = surf.d[n] ?? 0;
        let z = surf.z[n] ?? 0;
        // Normale : sol/dessus vers le haut (+z), mur/face avant vers le spectateur (+d).
        const vertical = kind === SURF.wall || kind === SURF.front;
        if (kind === SURF.top) z += 0.5;
        else if (kind === SURF.front) d += 0.5;
        const vx = s.x - x;
        const vd = s.d - d;
        const vz = s.z - z;
        const r2 = vx * vx + vd * vd + vz * vz;
        if (r2 >= LAMP_RMAX * LAMP_RMAX) continue;
        const r = Math.sqrt(r2);
        if (r === 0) continue;
        const cos = (vertical ? vd : vz) / r;
        const irr = lampIrradiance(r, cos);
        if (irr <= 0) continue;
        P.x = x;
        P.d = d;
        P.z = z;
        const lit = litFraction(P, s, LAMP_SPREAD, gene);
        out[n] = (out[n] ?? 0) + irr * lit;
      }
    }
  }
  for (let n = 0; n < out.length; n++) out[n] = Math.min(1, (out[n] ?? 0) * LAMP_GAIN);
  return out;
}
