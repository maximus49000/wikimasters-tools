// tests/core/library/furniture-models.test.ts
import { describe, expect, it } from 'vitest';
import { STANDING_KINDS } from '../../../src/core/library/library-types';
import { FURNITURE_MODELS } from '../../../src/core/library/furniture-models';
import { renderModel } from '../../../src/core/library/furniture-render3d';

const DIMS: Record<string, [number, number, number]> = {
  shelf: [80, 30, 180], desk: [120, 60, 75], chair: [45, 50, 90], sofa: [200, 90, 85], armchair: [80, 80, 90],
  'coffee-table': [100, 55, 45], lamp: [40, 40, 160], plant: [45, 45, 110], rug: [200, 140, 1], basket: [60, 45, 25],
  bowl: [20, 20, 8], kennel: [70, 90, 75], charger: [40, 30, 10], globe: [50, 50, 100], telescope: [60, 60, 130], automaton: [45, 40, 110],
};

describe('modèles', () => {
  it.each(STANDING_KINDS)('%s : dimensions réelles du catalogue', (kind) => {
    const m = FURNITURE_MODELS[kind];
    expect([m.w, m.d, m.h]).toEqual(DIMS[kind]);
  });
  it.each(STANDING_KINDS)('%s : toutes les pièces tiennent dans la boîte du meuble', (kind) => {
    const m = FURNITURE_MODELS[kind];
    for (const p of m.pieces) {
      const [x0, x1, y0, y1, z0, z1] = p.shape === 'box' ? [p.x, p.x + p.w, p.y, p.y + p.h, p.z, p.z + p.d]
        : p.shape === 'cyl' ? [p.cx - p.r, p.cx + p.r, p.y, p.y + p.h, p.cz - p.r, p.cz + p.r]
        : [p.cx - p.rx, p.cx + p.rx, p.cy - p.ry, p.cy + p.ry, p.cz - p.rz, p.cz + p.rz];
      expect(x0).toBeGreaterThanOrEqual(-0.01); expect(x1).toBeLessThanOrEqual(m.w + 0.01);
      expect(y0).toBeGreaterThanOrEqual(-0.01); expect(y1).toBeLessThanOrEqual(m.h + 0.01);
      expect(z0).toBeGreaterThanOrEqual(-0.01); expect(z1).toBeLessThanOrEqual(m.d + 0.01);
    }
  });
  it('tailles de face proches du tableau de la spec (± 1 case)', () => {
    const FACE: Record<string, [number, number]> = { shelf: [4, 9], desk: [6, 4], chair: [2, 4], sofa: [10, 4], armchair: [4, 4], 'coffee-table': [5, 2], lamp: [2, 8], plant: [2, 5], basket: [3, 1], bowl: [1, 1], kennel: [3, 4], charger: [2, 1], globe: [2, 5], telescope: [3, 6], automaton: [2, 5] };
    for (const [kind, [w, h]] of Object.entries(FACE)) {
      const r = renderModel(FURNITURE_MODELS[kind as keyof typeof FURNITURE_MODELS], 0);
      expect(Math.abs(r.cols - w)).toBeLessThanOrEqual(1);
      expect(Math.abs(r.rows - h)).toBeLessThanOrEqual(2); // + la profondeur qui remonte
    }
  });
  it('l’étagère tournée ne grandit pas (± 1 case)', () => {
    const h0 = renderModel(FURNITURE_MODELS.shelf, 0).rows;
    for (const a of [1, 2, 3, 4, 5, 6, 7] as const) expect(Math.abs(renderModel(FURNITURE_MODELS.shelf, a).rows - h0)).toBeLessThanOrEqual(1);
  });
  it('aucune pièce entièrement enfouie dans une autre pièce', () => {
    const bb = (p: any): number[] => (p.shape === 'box' ? [p.x, p.x + p.w, p.y, p.y + p.h, p.z, p.z + p.d]
      : p.shape === 'cyl' ? [p.cx - p.r, p.cx + p.r, p.y, p.y + p.h, p.cz - p.r, p.cz + p.r]
      : [p.cx - p.rx, p.cx + p.rx, p.cy - p.ry, p.cy + p.ry, p.cz - p.rz, p.cz + p.rz]);
    for (const kind of STANDING_KINDS) {
      const boxes = FURNITURE_MODELS[kind].pieces.filter((p) => p.shape === 'box').map(bb);
      FURNITURE_MODELS[kind].pieces.forEach((p, i) => {
        const a = bb(p);
        boxes.forEach((b) => {
          if (b === a || (p.shape === 'box' && b.every((v, k) => v === a[k]))) return;
          const dedans = [0, 2, 4].every((k) => a[k] >= b[k] - 1e-6 && a[k + 1] <= b[k + 1] + 1e-6);
          expect(dedans, kind + ' pièce ' + i + ' enfouie').toBe(false);
        });
      });
    }
  });
  it('les points d’intérêt historiques existent toujours', () => {
    expect(FURNITURE_MODELS.sofa.pois?.filter((p) => p.type === 'seat')).toHaveLength(3);
    expect(FURNITURE_MODELS.sofa.pois?.some((p) => p.type === 'sleep')).toBe(true);
    expect(FURNITURE_MODELS.chair.pois?.[0]?.type).toBe('seat');
    expect(FURNITURE_MODELS.charger.pois?.[0]?.type).toBe('charge');
    expect(FURNITURE_MODELS.kennel.pois?.map((p) => p.type).sort()).toEqual(['enter', 'sleep']);
  });
});
