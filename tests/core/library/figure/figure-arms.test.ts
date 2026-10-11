import { describe, expect, it } from 'vitest';
import { ARM_POSES, LIMB, armTarget, poseOf } from '../../../../src/core/library/figure/skeleton';

const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const reach = LIMB.upperArm + LIMB.foreArm;

describe('bras du pantin', () => {
  it('chaque pose, chaque orientation : bras de longueur constante, aucune valeur non finie', () => {
    // 'swing' garde le balancement de G3a (décalage latéral de 0,5 aux coudes) : longueurs non rigoureuses, hors cinématique inverse.
    for (const arms of ARM_POSES.filter((x) => x !== 'swing'))
      for (let y = 0; y < 16; y += 3) {
        const p = poseOf((y * Math.PI) / 8, 1, 'stand', { arms });
        for (const a of p.arms) {
          expect(Math.abs(dist(a.sh, a.elb) - LIMB.upperArm)).toBeLessThan(1e-6);
          expect(Math.abs(dist(a.elb, a.hand) - LIMB.foreArm)).toBeLessThan(1e-6);
          expect([...a.sh, ...a.elb, ...a.hand].every(Number.isFinite)).toBe(true);
          expect(dist(a.sh, a.hand)).toBeLessThanOrEqual(reach);
        }
      }
  });
  it('bras levé : main droite au-dessus de la tête, main gauche le long du corps', () => {
    const p = poseOf(0, 0, 'stand', { arms: 'raise' });
    expect(p.arms[1].hand[1]).toBeGreaterThan(p.head[1]);
    expect(p.arms[0].hand[1]).toBeLessThan(p.arms[0].sh[1] - 8);
  });
  it('bras croisés : chaque main passe de l’autre côté du corps, devant le torse', () => {
    // De face (orientation π/2) : le côté droit du corps est vers −x ; croisée, la main droite passe vers +x.
    const p = poseOf(Math.PI / 2, 0, 'stand', { arms: 'crossed' });
    expect(p.arms[1].sh[0]).toBeLessThan(p.pelvis[0]);
    expect(p.arms[1].hand[0]).toBeGreaterThan(p.pelvis[0]);
    expect(p.arms[0].hand[0]).toBeLessThan(p.pelvis[0]);
    expect(p.arms[1].hand[2]).toBeGreaterThan(p.pelvis[2]); // devant (vers le spectateur)
  });
  it('cible hors de portée : la main s’arrête au bout du bras', () => {
    expect(armTarget('raise', 1)).not.toBeNull();
    const p = poseOf(0, 0, 'stand', { arms: 'raise' });
    expect(dist(p.arms[1].sh, p.arms[1].hand)).toBeLessThanOrEqual(reach + 1e-9);
  });
  it('penché : la tête avance avec le niveau', () => {
    const a = poseOf(0, 0, 'stand', { lean: 0 }).head[0];
    const b = poseOf(0, 0, 'stand', { lean: 2 }).head[0];
    expect(b).toBeGreaterThan(a + 2);
  });
  it('escalade : genoux en alternance, mains au-dessus des épaules', () => {
    // Phases π/2 et 3π/2 : aux phases 0 et π les deux cuisses sont à 30° (sin = 0), donc genoux à la même hauteur.
    const a = poseOf(-Math.PI / 2, Math.PI / 2, 'climb');
    const b = poseOf(-Math.PI / 2, (3 * Math.PI) / 2, 'climb');
    expect(Math.sign(a.legs[0].knee[1] - a.legs[1].knee[1])).toBe(-Math.sign(b.legs[0].knee[1] - b.legs[1].knee[1]));
    for (const arm of a.arms) expect(arm.hand[1]).toBeGreaterThan(arm.sh[1]);
  });
  it('swing : comportement inchangé (marche de G3a)', () => {
    const p = poseOf(0, Math.PI / 2, 'walk');
    const q = poseOf(0, Math.PI / 2, 'walk', { arms: 'swing' });
    expect(q.arms[1].hand).toEqual(p.arms[1].hand);
  });
});
