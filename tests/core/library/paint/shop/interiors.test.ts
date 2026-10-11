import { describe, expect, it } from 'vitest';
import { SHOP_TYPE_IDS, type ShopTypeId } from '../../../../../src/core/library/city/shops/catalog';
import { INTERIORS, interiorPostOf, paintInterior } from '../../../../../src/core/library/paint/shop/interiors';
import { recordingCtx } from '../recording-ctx';

const done = (): ShopTypeId[] => SHOP_TYPE_IDS.filter((t) => t in INTERIORS);

describe('intérieurs des commerces', () => {
  it('déterministes', () => {
    for (const t of done()) {
      const a = recordingCtx();
      const b = recordingCtx();
      paintInterior(a, t, 34, 21, 'back', true, 5);
      paintInterior(b, t, 34, 21, 'back', true, 5);
      expect(a.ops).toEqual(b.ops);
    }
  });

  it('toute largeur : place du vendeur dans la vitrine, du dessin au fond', () => {
    for (const t of done()) {
      for (const w of [8, 10, 12, 17, 26, 34, 45, 60]) {
        const ctx = recordingCtx();
        const post = paintInterior(ctx, t, w, 21, 'back', false, 1);
        expect(post).toBeGreaterThanOrEqual(1);
        expect(post).toBeLessThanOrEqual(w - 1);
        expect(ctx.fills.length).toBeGreaterThan(3);
      }
    }
  });

  it('rogné à la vitrine', () => {
    const ctx = recordingCtx();
    paintInterior(ctx, done()[0]!, 30, 21, 'back', false, 1);
    const i = ctx.ops.findIndex((o) => o.op === 'clip');
    expect(ctx.ops[i - 1]).toEqual({ op: 'rect', args: [0, 0, 30, 21] });
  });

  it('le premier plan ne redessine pas le fond', () => {
    for (const t of done()) {
      const back = recordingCtx();
      const front = recordingCtx();
      paintInterior(back, t, 34, 21, 'back', false, 2);
      paintInterior(front, t, 34, 21, 'front', false, 2);
      expect(front.fills.length).toBeGreaterThan(0);
      // Le mur du fond (aplat de toute la vitrine) n'est peint que par le fond.
      const wall = (o: { op: string; args: number[] }): boolean => o.op === 'fillRect' && o.args.join() === '0,0,34,21';
      expect(back.ops.some(wall)).toBe(true);
      expect(front.ops.some(wall)).toBe(false);
    }
  });

  it('les 32 métiers ont leur intérieur', () => {
    expect(done()).toEqual([...SHOP_TYPE_IDS]);
  });

  it('place du vendeur sans peindre : la même que celle du dessin', () => {
    for (const t of SHOP_TYPE_IDS) for (const w of [12, 30, 47]) expect(interiorPostOf(t, w, 21)).toBe(paintInterior(recordingCtx(), t, w, 21, 'back', false, 1));
  });
});

