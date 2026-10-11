import { describe, expect, it } from 'vitest';
import { capsule, hull, pathOf, project } from '../../../../src/core/library/figure/geometry';
import { PHASES, poseOf } from '../../../../src/core/library/figure/skeleton';

const finite = (v: readonly number[]): boolean => v.every((x) => Number.isFinite(x));

describe('géométrie du pantin', () => {
  it('projette un point plus proche du spectateur plus bas à l’écran', () => {
    expect(project([0, 10, 5])[1]).toBeGreaterThan(project([0, 10, 0])[1]);
  });
  it('enveloppe convexe d’un carré avec un point intérieur', () => {
    expect(hull([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1]])).toHaveLength(4);
  });
  it('capsule fermée et tracé arrondi au dixième', () => {
    const d = pathOf(capsule([0, 0], [0, 10], 2, 1));
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d).not.toMatch(/\d\.\d\d/);
  });
});

describe('squelette', () => {
  it('debout : les deux chevilles à la même hauteur, tête vers y = 33', () => {
    const p = poseOf(0, 0, 'stand');
    expect(Math.abs(p.legs[0].ankle[1] - p.legs[1].ankle[1])).toBeLessThan(0.01);
    expect(p.head[1]).toBeGreaterThan(31);
    expect(p.head[1]).toBeLessThan(35);
  });
  it('en marche, la jambe d’appui touche le sol à chaque image (cheville la plus basse ≈ 1)', () => {
    for (let i = 0; i < PHASES; i++) {
      const p = poseOf(0, (i * 2 * Math.PI) / PHASES, 'walk');
      const low = Math.min(p.legs[0].ankle[1], p.legs[1].ankle[1]);
      expect(low).toBeGreaterThan(0.9);
      expect(low).toBeLessThan(1.1);
    }
  });
  it('bras en opposition des jambes', () => {
    const p = poseOf(0, Math.PI / 2, 'walk');
    // jambe 0 (gauche) en avant : bras gauche (0) en arrière (x plus petit que l’épaule)
    expect(p.legs[0].knee[0]).toBeGreaterThan(p.legs[1].knee[0]);
    expect(p.arms[0].hand[0]).toBeLessThan(p.arms[1].hand[0]);
  });
  it('assis : cuisses horizontales, bassin plus bas que debout', () => {
    const s = poseOf(Math.PI / 4, 0, 'seated');
    expect(Math.abs(s.legs[0].hip[1] - s.legs[0].knee[1])).toBeLessThan(0.5);
    expect(s.pelvis[1]).toBeLessThan(poseOf(0, 0, 'stand').pelvis[1] - 5);
  });
  it('parapluie : la main droite (bras 1) au-dessus de la tête… ou presque', () => {
    const p = poseOf(0, 0, 'walk', { umbrella: true });
    expect(p.arms[1].hand[1]).toBeGreaterThan(p.arms[1].sh[1]);
  });
  it('aucune valeur non finie, toutes orientations', () => {
    for (let y = 0; y < 16; y++) {
      const p = poseOf((y * Math.PI) / 8, 1, 'walk');
      for (const l of p.legs) expect(finite([...l.hip, ...l.knee, ...l.ankle, ...l.toe])).toBe(true);
      for (const a of p.arms) expect(finite([...a.sh, ...a.elb, ...a.hand])).toBe(true);
    }
  });
});
