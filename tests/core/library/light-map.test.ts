import { describe, expect, it } from 'vitest';
import { LIGHT_SCALE, buildLightMap, type LightInput } from '../../../src/core/library/light/light-map';

const base: LightInput = {
  width: 600, height: 510, wallH: 340,
  windows: [{ x: 100, y: 60, w: 60, h: 100 }],
  sunX: 130, sunFrac: 0.5, daylight: 1, twilight: 0, cloud: 0, precip: 0, hidden: 0,
};
const at = (m: { w: number; rgba: Uint8ClampedArray }, x: number, y: number): number[] => {
  const i = (Math.floor(y / LIGHT_SCALE) * m.w + Math.floor(x / LIGHT_SCALE)) * 4;
  return [m.rgba[i]!, m.rgba[i + 1]!, m.rgba[i + 2]!, m.rgba[i + 3]!];
};

describe('buildLightMap', () => {
  it('a la taille de la pièce réduite et 4 octets par pixel', () => {
    const m = buildLightMap(base);
    expect(m.w).toBe(Math.ceil(600 / LIGHT_SCALE));
    expect(m.h).toBe(Math.ceil(510 / LIGHT_SCALE));
    expect(m.rgba).toHaveLength(m.w * m.h * 4);
  });
  it('est plus sombre loin de la fenêtre que près d’elle (sur le mur)', () => {
    const m = buildLightMap({ ...base, sunFrac: null, sunX: null });
    expect(at(m, 130, 120)[3]!).toBeLessThan(at(m, 560, 120)[3]!);
  });
  it('est plus sombre la nuit que le jour', () => {
    const day = buildLightMap({ ...base, sunFrac: null, sunX: null });
    const night = buildLightMap({ ...base, sunFrac: null, sunX: null, daylight: 0 });
    expect(at(night, 300, 120)[3]!).toBeGreaterThan(at(day, 300, 120)[3]!);
  });
  it('pose un rayon chaud sur le sol quand le soleil est levé, pas sans soleil', () => {
    // le rayon tombe sur le sol (y > 340) ; « chaud » = rouge − bleu nettement plus haut que sans soleil
    const withSun = buildLightMap({ ...base, sunFrac: 0.3 });
    const noSun = buildLightMap({ ...base, sunFrac: null, sunX: null });
    let warm = false;
    for (let y = 345; y < 510 && !warm; y += LIGHT_SCALE) for (let x = 0; x < 600; x += LIGHT_SCALE) {
      const [r, , b] = at(withSun, x, y);
      const [r0, , b0] = at(noSun, x, y);
      if (r! - b! > r0! - b0! + 15) { warm = true; break; }
    }
    expect(warm).toBe(true);
    expect(Array.from(buildLightMap({ ...base, sunFrac: null, sunX: null }).rgba)).toEqual(Array.from(noSun.rgba));
  });
  it('un soleil masqué supprime le rayon', () => {
    const warmCount = (m: { rgba: Uint8ClampedArray }) => { let n = 0; for (let i = 0; i < m.rgba.length; i += 4) if (m.rgba[i]! - m.rgba[i + 2]! > 20) n++; return n; };
    const clear = buildLightMap({ ...base, sunFrac: 0.3 });
    const hidden = buildLightMap({ ...base, sunFrac: 0.3, hidden: 1 });
    expect(warmCount(clear)).toBeGreaterThan(0);
    expect(warmCount(hidden)).toBe(0);
  });
  it('est déterministe', () => {
    expect(Array.from(buildLightMap(base).rgba)).toEqual(Array.from(buildLightMap(base).rgba));
  });
});
