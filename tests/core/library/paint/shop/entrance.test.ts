import { describe, expect, it } from 'vitest';
import { paintEntrance } from '../../../../../src/core/library/paint/shop/entrance';
import { recordingCtx } from '../recording-ctx';

describe('entrées d’immeuble', () => {
  for (const variant of [0, 1, 2] as const) {
    it(`modèle ${variant} : déterministe, dans son cadre, sans transformation`, () => {
      const a = recordingCtx();
      const b = recordingCtx();
      paintEntrance(a, 100, 240, 1.2, variant, 7);
      paintEntrance(b, 100, 240, 1.2, variant, 7);
      expect(a.ops).toEqual(b.ops);
      expect(a.fills.length).toBeGreaterThan(8);
      const s = 1.2;
      // Les aplats d'ombre et de rehaut de `cel` débordent de leur boîte (largeur + 1) mais sont rognés au chemin : marge de 8 unités à droite.
      const bad = a.points.filter(([x, y]) => x < 100 - 12 * s - 1e-6 || x > 100 + 20 * s + 1e-6 || y < 240 - 28 * s - 1e-6 || y > 240 + 2 * s + 1e-6);
      expect(bad.slice(0, 3)).toEqual([]);
      expect(a.ops.some((o) => o.op === 'translate' || o.op === 'scale' || o.op === 'rotate')).toBe(false);
    });
  }
  it('numéro de rue sur la plaque émaillée', () => {
    const a = recordingCtx();
    paintEntrance(a, 50, 200, 1, 0, 3);
    expect(a.texts.length).toBe(1);
    expect(Number(a.texts[0])).toBeGreaterThanOrEqual(3);
    expect(Number(a.texts[0])).toBeLessThanOrEqual(42);
  });
});
