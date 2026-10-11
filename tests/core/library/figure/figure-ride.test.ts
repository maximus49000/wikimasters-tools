import { describe, expect, it } from 'vitest';
import { LIMB, PEDAL, RIDE_HIP, armTarget, poseOf } from '../../../../src/core/library/figure/skeleton';
import { anchorsOf, bakeFigure, type FigureKey } from '../../../../src/core/library/figure/bake';
import { shapeFromSignature } from '../../../../src/core/library/figure/dress';

const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const SIG = 'short.long.pants.none.n.n';
const key = (p: Partial<FigureKey>): FigureKey => ({ sig: SIG, yaw: 0, gait: 'pedal', phase: 0, head: 0, arms: 'handlebar', lean: 0, ...p });

describe('pantin en selle', () => {
  it('pédalier : chaque cheville sur le cercle du pédalier, pieds en opposition, longueurs constantes', () => {
    for (let ph = 0; ph < 12; ph++) {
      const p = poseOf(0, (ph * 2 * Math.PI) / 12, 'pedal', { arms: 'handlebar' });
      expect(p.pelvis[1]).toBeCloseTo(RIDE_HIP, 6);
      const c: number[] = [PEDAL.f, RIDE_HIP - PEDAL.d, 0];
      for (const g of p.legs) {
        expect(Math.abs(dist(g.hip, g.knee) - LIMB.thigh)).toBeLessThan(1e-6);
        expect(Math.abs(dist(g.knee, g.ankle) - LIMB.shin)).toBeLessThan(1e-6);
        // Plan du pédalier : x (devant) et y ; la profondeur reste celle de la hanche.
        expect(Math.hypot(g.ankle[0] - c[0]!, g.ankle[1] - c[1]!)).toBeCloseTo(PEDAL.r, 4);
        expect(g.knee[0]).toBeGreaterThan(g.hip[0]); // genou vers l'avant
        expect([...g.hip, ...g.knee, ...g.ankle, ...g.toe].every(Number.isFinite)).toBe(true);
      }
      const [a, b] = p.legs;
      expect(a.ankle[0] + b.ankle[0]).toBeCloseTo(2 * c[0]!, 4);
      expect(a.ankle[1] + b.ankle[1]).toBeCloseTo(2 * c[1]!, 4);
    }
  });
  it('pédalier : les pieds tournent avec la phase', () => {
    const a = poseOf(0, 0, 'pedal').legs[0].ankle;
    const b = poseOf(0, Math.PI / 2, 'pedal').legs[0].ankle;
    expect(dist(a, b)).toBeGreaterThan(2);
  });
  it('à cheval : pieds immobiles le long du flanc, tibia vertical, jambes écartées', () => {
    const p = poseOf(0, 0, 'mount', { arms: 'handlebar' });
    const q = poseOf(0, 2, 'mount', { arms: 'handlebar' });
    expect(p.legs[0].ankle).toEqual(q.legs[0].ankle);
    for (const g of p.legs) {
      expect(Math.abs(g.knee[0] - g.ankle[0])).toBeLessThan(1e-6);
      expect(g.ankle[1]).toBeGreaterThan(-0.5);
      expect(Math.abs(g.knee[2] - p.pelvis[2])).toBeGreaterThan(2);
    }
  });
  it('guidon : deux mains devant, sous les épaules', () => {
    const p = poseOf(0, 0, 'pedal', { arms: 'handlebar' });
    for (const a of p.arms) {
      expect(a.hand[0]).toBeGreaterThan(a.sh[0] + 5);
      expect(a.hand[1]).toBeLessThan(a.sh[1]);
    }
  });
  it('gestes du cortège : trompette à la bouche, fusil et hampe à droite, bras gauche libre', () => {
    const horn = poseOf(0, 0, 'walk', { arms: 'horn' });
    for (const a of horn.arms) expect(dist(a.hand, horn.head)).toBeLessThan(7.5);
    expect(armTarget('rifle', -1)).toBeNull();
    expect(armTarget('flag', -1)).toBeNull();
    expect(armTarget('rifle', 1)).not.toBeNull();
    const r0 = poseOf(0, 0.5, 'walk', { arms: 'rifle' });
    const r1 = poseOf(0, 0.5 + Math.PI, 'walk', { arms: 'rifle' });
    expect(Math.abs(r0.arms[0].hand[0] - r1.arms[0].hand[0])).toBeGreaterThan(1); // le bras gauche balance
  });
  it('accroche de selle = bassin projeté ; pas d’ombre portée en selle', () => {
    const a = anchorsOf(key({}));
    expect(a.seat[1]).toBeLessThan(-RIDE_HIP + 3);
    expect(a.seat[1]).toBeGreaterThan(-RIDE_HIP - 3);
    expect(anchorsOf(key({ gait: 'mount' })).seat[1]).toBeCloseTo(a.seat[1], 0);
    const baked = bakeFigure(shapeFromSignature(SIG), key({}));
    expect(baked.groups.length).toBeGreaterThan(3);
  });
});
