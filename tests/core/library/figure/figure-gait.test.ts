import { describe, expect, it } from 'vitest';
import { YAW_BACK, YAW_FRONT, YAW_LEFT, YAW_RIGHT, facingYaw, phaseIndexOf, turnYaw, yawToward } from '../../../../src/core/library/figure/gait';
import { STRIDE } from '../../../../src/core/library/figure/skeleton';

describe('allure', () => {
  it('sens de marche → profil', () => {
    expect(facingYaw(1)).toBe(YAW_RIGHT);
    expect(facingYaw(-1)).toBe(YAW_LEFT);
  });
  it('une foulée complète = 12 images, puis on recommence', () => {
    expect(phaseIndexOf(0)).toBe(0);
    expect(phaseIndexOf(STRIDE / 2)).toBe(6);
    expect(phaseIndexOf(STRIDE)).toBe(0);
    expect(phaseIndexOf(-STRIDE / 12)).toBe(11);
  });
  it('demi-tour de droite à gauche en passant par la face', () => {
    const seen = new Set<number>();
    for (let i = 0; i <= 20; i++) seen.add(turnYaw(YAW_RIGHT, YAW_LEFT, i / 20, YAW_FRONT));
    expect(seen.has(YAW_FRONT)).toBe(true);
    expect(seen.has(YAW_BACK)).toBe(false);
    expect(turnYaw(YAW_RIGHT, YAW_LEFT, 0, YAW_FRONT)).toBe(YAW_RIGHT);
    expect(turnYaw(YAW_RIGHT, YAW_LEFT, 1, YAW_FRONT)).toBe(YAW_LEFT);
  });
  it('sans passage imposé : le plus court chemin (profil droit → dos)', () => {
    expect(turnYaw(YAW_RIGHT, YAW_BACK, 0.5)).toBe(14);
  });
  it('direction vers la profondeur', () => {
    expect(yawToward(0, -1)).toBe(YAW_BACK);
    expect(yawToward(0, 1)).toBe(YAW_FRONT);
    expect(yawToward(1, 1)).toBe(2);
  });
});
