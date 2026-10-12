import { describe, expect, it } from 'vitest';
import { propKey } from '../../../../../src/content/prop/prop-host';
import { PROPS } from '../../../../../src/core/library/paint/props/index';
import '../../../../../src/core/library/paint/props/install';
import { recordingCtx } from '../recording-ctx';
import { tintedCtx } from '../../../../../src/core/library/paint/shop/ctx';
import { touched } from './replay';

const paint = (id: string, frame: number, a: Record<string, string | number | boolean> = {}): ReturnType<typeof recordingCtx> => {
  const c = recordingCtx();
  PROPS[id]!.paint(tintedCtx(c, (x) => x), a, { day: 1, lit: false, dir: 1, frame });
  return c;
};
// Dans le cadre du peintre (à 1 u près), pour chaque pose.
function inFrame(id: string, a: Record<string, string | number | boolean> = {}): void {
  const [x, y, w, h] = PROPS[id]!.box(a);
  for (let frame = 0; frame < 8; frame++) {
    const pts = touched(paint(id, frame, a).ops);
    expect(pts.length).toBeGreaterThan(0);
    for (const [px, py] of pts) {
      expect(px, `${id} x (pose ${frame})`).toBeGreaterThanOrEqual(x - 1); expect(px, `${id} x (pose ${frame})`).toBeLessThanOrEqual(x + w + 1);
      expect(py, `${id} y (pose ${frame})`).toBeGreaterThanOrEqual(y - 1); expect(py, `${id} y (pose ${frame})`).toBeLessThanOrEqual(y + h + 1);
    }
  }
}

describe('drapeaux animés', () => {
  it('8 frames partagées par 30 lampadaires', () => {
    const keys = new Set(Array.from({ length: 30 }, (_, i) => propKey({ id: 'lamp-flag', day: 1, frame: (i * 3 + 7) % 8 })));
    expect(keys.size).toBeLessThanOrEqual(8);
  });
  it('les frames diffèrent (le tissu ondule)', () => {
    const at = (frame: number) => { const c = recordingCtx(); PROPS['lamp-flag']!.paint(tintedCtx(c, (x) => x), {}, { day: 1, lit: false, dir: 1, frame }); return c.points; };
    expect(at(0)).not.toEqual(at(3));
  });
  it('8 poses déclarées, 8 clés exactement pour 30 lampadaires déphasés ; pareil pour la porte', () => {
    for (const id of ['lamp-flag', 'door-flag']) {
      expect(PROPS[id]!.frames, id).toBe(8);
      // Lampadaires tous les ~31 px : pose de la boucle (3) décalée de (x / 37) | 0.
      const keys = new Set(Array.from({ length: 30 }, (_, i) => propKey({ id, day: 1, frame: 3 + (((i * 31) / 37) | 0) })));
      expect(keys.size, id).toBe(8);
      // Pose 8 = pose 0 (réduite modulo frames par l'hôte).
      expect(propKey({ id, day: 1, frame: 8 })).toBe(propKey({ id, day: 1, frame: 0 }));
    }
  });
  it('le tissu de lampadaire pend vers −x depuis (−11, −71), celui de la porte vers +x depuis (7, −45) ; chaque pose dans le cadre', () => {
    const lamp = touched(paint('lamp-flag', 0).ops);
    expect(lamp.some(([x, y]) => x < -11.5 && y < -64)).toBe(true);
    expect(lamp.every(([x]) => x < 1)).toBe(true);
    const door = touched(paint('door-flag', 0).ops);
    expect(door.some(([x, y]) => x > 12 && y < -40)).toBe(true);
    expect(door.every(([x]) => x > 6)).toBe(true);
    inFrame('lamp-flag');
    inFrame('door-flag');
  });
  it('mouvement réduit (still) : tissu plat identique à toutes les poses, différent du tissu qui ondule', () => {
    for (const id of ['lamp-flag', 'door-flag']) {
      const flat0 = paint(id, 0, { still: true });
      const flat3 = paint(id, 3, { still: true });
      expect(flat0.ops, id).toEqual(flat3.ops);
      expect(flat0.points, id).not.toEqual(paint(id, 0).points);
      // La clé distingue le drapeau plat du drapeau qui ondule.
      expect(propKey({ id, args: { still: true }, day: 1 })).not.toBe(propKey({ id, day: 1 }));
    }
  });
  it('rien de lumineux : glowing jamais appelé, même allumé', () => {
    for (const id of ['lamp-flag', 'door-flag']) {
      const t = tintedCtx(recordingCtx(), (c) => c);
      let n = 0;
      const g = t.glowing;
      t.glowing = (fn) => { n++; g(fn); };
      PROPS[id]!.paint(t, {}, { day: 0, lit: true, dir: 1, frame: 2 });
      expect(n, id).toBe(0);
    }
  });
});
