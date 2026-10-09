import { describe, expect, it } from 'vitest';
import { BY_ZONE, ZONES, isAlsaceMoselle, zoneOfDepartment } from '../../../src/core/library/city/zones';

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
  it('n’a aucun code en double et compte 32, 41, 21 et 2 départements par zone', () => {
    const all = ZONES.flatMap((zone) => BY_ZONE[zone]);
    expect(all).toHaveLength(96);
    expect(new Set(all).size).toBe(96);
    // Chaque code de la table retombe sur sa propre zone : un code présent dans deux zones serait vu ici.
    for (const zone of ZONES) for (const code of BY_ZONE[zone]) expect(zoneOfDepartment(code), code).toBe(zone);
    expect(ZONES.map((zone) => BY_ZONE[zone].length)).toEqual([32, 41, 21, 2]);
    expect(zoneOfDepartment('20')).toBeNull(); // la Corse du Sud et la Haute-Corse remplacent l’ancien 20
  });
  it('reconnaît l’Alsace-Moselle', () => {
    for (const code of ['57', '67', '68']) expect(isAlsaceMoselle(code)).toBe(true);
    expect(isAlsaceMoselle('75')).toBe(false);
  });
});
