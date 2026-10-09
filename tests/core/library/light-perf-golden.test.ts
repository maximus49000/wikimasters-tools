import { describe, expect, it } from 'vitest';
import { lampField } from '../../../src/core/library/light/lamps';
import { buildLightMap, type LightInput } from '../../../src/core/library/light/light-map';
import { buildSurfaceMap } from '../../../src/core/library/light/surfaces';

import { GEOM, H, W, hash, scene } from '../../fixtures/light-scene';

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
  it('reste rapide : 3 lampes / 81 boîtes, 96 colonnes (marge large pour une machine chargée)', () => {
    const { boxes, lamps } = scene(81, 3);
    const surf = buildSurfaceMap(boxes, W, H, GEOM, 6);
    lampField(lamps, boxes, surf, 6);
    const t = performance.now();
    lampField(lamps, boxes, surf, 6);
    expect(performance.now() - t).toBeLessThan(250);
  });
});
