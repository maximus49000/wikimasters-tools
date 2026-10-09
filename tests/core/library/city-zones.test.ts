import { describe, expect, it } from 'vitest';
import { ZONES, isAlsaceMoselle, zoneOfDepartment } from '../../../src/core/library/city/zones';

describe('zones scolaires', () => {
  it('place des départements connus dans la bonne zone', () => {
    expect(zoneOfDepartment('75')).toBe('C'); // Paris
    expect(zoneOfDepartment('31')).toBe('C'); // Toulouse
    expect(zoneOfDepartment('69')).toBe('A'); // Lyon
    expect(zoneOfDepartment('33')).toBe('A'); // Bordeaux
    expect(zoneOfDepartment('59')).toBe('B'); // Lille
    expect(zoneOfDepartment('13')).toBe('B'); // Marseille
    expect(zoneOfDepartment('2A')).toBe('Corse');
  });
  it('couvre les 96 départements métropolitains et rejette le reste', () => {
    const codes = [...Array.from({ length: 19 }, (_, i) => String(i + 1).padStart(2, '0')), '2A', '2B', ...Array.from({ length: 75 }, (_, i) => String(i + 21))];
    expect(codes).toHaveLength(96);
    for (const code of codes) expect(zoneOfDepartment(code), code).not.toBeNull();
    expect(zoneOfDepartment('971')).toBeNull();
    expect(zoneOfDepartment('xx')).toBeNull();
    expect(ZONES).toEqual(['A', 'B', 'C', 'Corse']);
  });
  it('reconnaît l’Alsace-Moselle', () => {
    for (const code of ['57', '67', '68']) expect(isAlsaceMoselle(code)).toBe(true);
    expect(isAlsaceMoselle('75')).toBe(false);
  });
});
