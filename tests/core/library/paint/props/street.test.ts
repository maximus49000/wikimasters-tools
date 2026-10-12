import { describe, expect, it } from 'vitest';
import { PROPS } from '../../../../../src/core/library/paint/props/index';
import '../../../../../src/core/library/paint/props/street';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { recordingCtx } from '../recording-ctx';

const ARGS: Record<string, Record<string, string | number | boolean>> = {
  lamp: {}, 'traffic-pole': { color: 'green', pressed: true }, 'bus-stop': { name: 'Place du Ralliement', lines: '1,12', served: 'near' }, 'crosswalk-band': { h: 30 },
};

describe('mobilier de rue cellulo', () => {
  for (const [id, a] of Object.entries(ARGS)) {
    it(`${id} : dans son cadre et déterministe`, () => {
      const p = PROPS[id]!;
      const [x, y, w, h] = p.box(a);
      const c1 = recordingCtx();
      const c2 = recordingCtx();
      p.paint(tintedCtx(c1, (c) => c), a, { day: 1, lit: false, dir: 1, frame: 0 });
      p.paint(tintedCtx(c2, (c) => c), a, { day: 1, lit: false, dir: 1, frame: 0 });
      expect(c1.ops).toEqual(c2.ops);
      for (const [px, py] of c1.points) {
        expect(px).toBeGreaterThanOrEqual(x - 1); expect(px).toBeLessThanOrEqual(x + w + 1);
        expect(py).toBeGreaterThanOrEqual(y - 1); expect(py).toBeLessThanOrEqual(y + h + 1);
      }
    });
  }
  it('lampadaire allumé : la lanterne passe par glowing, pas éteint', () => {
    const count = (lit: boolean) => {
      const t = tintedCtx(recordingCtx(), (c) => c);
      let n = 0;
      const g = t.glowing;
      t.glowing = (fn) => { n++; g(fn); };
      PROPS.lamp!.paint(t, {}, { day: 0, lit, dir: 1, frame: 0 });
      return n;
    };
    expect(count(true)).toBeGreaterThan(0);
    expect(count(false)).toBe(0);
  });
});
