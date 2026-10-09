// tests/core/library/light-beam.test.ts
import { describe, expect, it } from 'vitest';
import { beamPatch } from '../../../src/core/library/light/beam';
import { beamSlope, sunElevation } from '../../../src/core/library/light/sun-dir';

const WALL = 340;
const FLOOR = 170;
const glass = { x: 100, y: 60, w: 60, h: 100 };

describe('sunElevation', () => {
  it('est nulle sans soleil, minimale au lever, maximale à midi', () => {
    expect(sunElevation(null)).toBe(0);
    expect(sunElevation(0)).toBeCloseTo((6 * Math.PI) / 180, 5);
    expect(sunElevation(0.5)).toBeCloseTo((62 * Math.PI) / 180, 5);
    expect(sunElevation(0.25)).toBeGreaterThan(sunElevation(0));
  });
});

describe('beamSlope', () => {
  it('pousse la lumière à l’opposé du soleil, et est nulle en face', () => {
    expect(beamSlope(500, 500, WALL)).toBe(0);
    expect(beamSlope(800, 500, WALL)).toBeLessThan(0);
    expect(beamSlope(200, 500, WALL)).toBeGreaterThan(0);
    expect(beamSlope(100000, 0, WALL)).toBe(-1.5);
  });
});

describe('beamPatch', () => {
  it('projette le verre en parallélogramme sur le sol à 45°', () => {
    const p = beamPatch(glass, WALL, FLOOR, Math.PI / 4, 0)!;
    // bas du verre à 180 au-dessus du sol → profondeur 180 ; haut à 280 → profondeur 280 ; 0,25 px d'écran par unité
    expect(p).toHaveLength(4);
    expect(p[0]!.y).toBeCloseTo(WALL + 180 * 0.25, 5);
    expect(p[3]!.y).toBeCloseTo(WALL + 280 * 0.25, 5);
    expect(p[0]!.x).toBe(100);
    expect(p[1]!.x).toBe(160);
  });
  it('décale latéralement selon la pente', () => {
    const p = beamPatch(glass, WALL, FLOOR, Math.PI / 4, 0.5)!;
    expect(p[0]!.x).toBeCloseTo(100 + 0.5 * 180, 5);
    expect(p[3]!.x).toBeCloseTo(100 + 0.5 * 280, 5);
  });
  it('est plus longue quand le soleil est plus bas', () => {
    const high = beamPatch(glass, WALL, FLOOR, (60 * Math.PI) / 180, 0)!;
    const low = beamPatch(glass, WALL, FLOOR, (25 * Math.PI) / 180, 0)!;
    expect(low[0]!.y).toBeGreaterThan(high[0]!.y);
  });
  it('coupe à la profondeur de la pièce et rend null si la tache tombe au-delà ou sans soleil', () => {
    const p = beamPatch(glass, WALL, FLOOR, (30 * Math.PI) / 180, 0)!;
    expect(p[3]!.y).toBeLessThanOrEqual(WALL + FLOOR + 1e-6);
    expect(beamPatch(glass, WALL, FLOOR, (6 * Math.PI) / 180, 0)).toBeNull();
    expect(beamPatch(glass, WALL, FLOOR, 0, 0)).toBeNull();
  });
});
