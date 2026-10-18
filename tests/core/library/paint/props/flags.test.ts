import { describe, expect, it } from 'vitest';
import { propKey } from '../../../../../src/content/prop/prop-host';
import { PROPS } from '../../../../../src/core/library/paint/props/index';
import { FLAG_CYCLE_S, FLAG_FRAMES } from '../../../../../src/core/library/paint/props/install';
import { FLAG_AMP, flagArt } from '../../../../../src/core/library/paint/props/kit';
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
  it('cadres dérivés de FLAG_AMP : le haut garde le creux maximal de la vague + le trait (0,6) au-dessus du haut du tissu', () => {
    const [, ly] = PROPS['lamp-flag']!.box({});
    expect(ly).toBeLessThanOrEqual(-71 - 7 * FLAG_AMP - 0.6);
    const [, dy] = PROPS['door-flag']!.box({});
    expect(dy).toBeLessThanOrEqual(-45 - 5 * FLAG_AMP - 0.6);
    // Bas : creux × 1,15 sous le tissu (le bas du cadre de la porte est déjà celui de la hampe).
    const [, ly2, , lh] = PROPS['lamp-flag']!.box({});
    expect(ly2 + lh).toBeGreaterThanOrEqual(-64 + 7 * FLAG_AMP * 1.15 + 0.6);
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
  it('le cycle est la période de la vague : à t = T le tissu est celui de t = 0 (pose 8 = pose 0, sans à-coup)', () => {
    expect(FLAG_FRAMES).toBe(8);
    expect(FLAG_CYCLE_S).toBeCloseTo((2 * Math.PI) / 2.5, 12);
    const cloth = (t: number): [number, number][] => {
      const c = recordingCtx();
      flagArt(c, { w: 10, h: 7, t, wave: true, phase: 0 });
      return c.points;
    };
    const p0 = cloth(0);
    const pT = cloth(FLAG_CYCLE_S);
    expect(pT.length).toBe(p0.length);
    pT.forEach(([x, y], i) => { expect(x).toBeCloseTo(p0[i]![0], 9); expect(y).toBeCloseTo(p0[i]![1], 9); });
    // Un huitième de période avant T, le tissu n'est pas celui de t = 0 (la vague bouge bien, la période n'est pas triviale).
    const before = cloth(FLAG_CYCLE_S - FLAG_CYCLE_S / FLAG_FRAMES);
    expect(before.some(([, y], i) => Math.abs(y - p0[i]![1]) > 0.05)).toBe(true);
    // La pose k du peintre = le tissu à k/8 × T : les tranches du tissu (x ≤ −11, bord haut) suivent y(u) à cet instant.
    const k3 = touched(paint('lamp-flag', 3).ops).filter(([x, y]) => x <= -11 && y < -66);
    const c3 = cloth((3 / FLAG_FRAMES) * FLAG_CYCLE_S).filter(([, y]) => y < 5).map(([x, y]) => [-11 - x, -71 + y] as [number, number]);
    for (const [x, y] of c3) expect(k3.some(([px, py]) => Math.abs(px - x) < 1e-6 && Math.abs(py - y) < 1e-6), `(${x}, ${y})`).toBe(true);
  });
  it('la vague se lit (tâche 15) : le bord libre du tissu s’écarte d’au moins 0,15 h au cours du cycle ; `FLAG_AMP` la borne', () => {
    let worst = 0;
    for (let k = 0; k < FLAG_FRAMES; k++) {
      const c = recordingCtx();
      flagArt(c, { w: 10, h: 7, t: (k / FLAG_FRAMES) * FLAG_CYCLE_S, wave: true, phase: 0 });
      for (const [x, y] of c.points) {
        if (x > 9.9 && y < 3.5) worst = Math.max(worst, Math.abs(y));
        if (y < 3.5) expect(Math.abs(y)).toBeLessThanOrEqual(7 * FLAG_AMP + 1e-9);
      }
    }
    expect(worst).toBeGreaterThanOrEqual(7 * 0.15);
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
