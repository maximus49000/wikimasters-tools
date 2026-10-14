import { describe, expect, it } from 'vitest';
import { CITIES, cityClock, cityMinutes, isKnownTz, searchCities, tzOffsetMinutes } from '../../../src/core/library/clock-cities';

describe('villes des horloges', () => {
  it('couvre au moins 120 villes, toutes à fuseau valide et sans doublon', () => {
    expect(CITIES.length).toBeGreaterThanOrEqual(120);
    for (const c of CITIES) expect(() => new Intl.DateTimeFormat('fr', { timeZone: c.tz })).not.toThrow();
    expect(new Set(CITIES.map((c) => `${c.name}|${c.country}`)).size).toBe(CITIES.length);
  });

  it('cherche sans accents ni majuscules, par ville ou par pays', () => {
    expect(searchCities('seoul').map((c) => c.name)).toContain('Séoul');
    expect(searchCities('JAPON').map((c) => c.name)).toContain('Tokyo');
    expect(searchCities('')).toHaveLength(CITIES.length);
  });

  it('reconnaît les fuseaux de la liste seulement', () => {
    expect(isKnownTz('Asia/Tokyo')).toBe(true);
    expect(isKnownTz('Ocean/Atlantis')).toBe(false);
  });

  it('Tokyo est à +7 h de Paris en octobre et +8 h en janvier', () => {
    const oct = new Date('2026-10-14T10:00:00Z');
    const jan = new Date('2026-01-14T10:00:00Z');
    expect(tzOffsetMinutes('Asia/Tokyo', oct) - tzOffsetMinutes('Europe/Paris', oct)).toBe(7 * 60);
    expect(tzOffsetMinutes('Asia/Tokyo', jan) - tzOffsetMinutes('Europe/Paris', jan)).toBe(8 * 60);
  });

  it('garde l écart quand l heure de la scène est choisie, et repasse minuit', () => {
    const now = new Date('2026-10-14T10:00:00Z');
    const device = -now.getTimezoneOffset();
    const tokyo = tzOffsetMinutes('Asia/Tokyo', now);
    // 22 h dans la scène → 22 h + (Tokyo − appareil), ramené dans 0..1439.
    expect(cityMinutes(22 * 60, 'Asia/Tokyo', now)).toBe((((22 * 60 + tokyo - device) % 1440) + 1440) % 1440);
    expect(cityMinutes(22 * 60, 'Asia/Tokyo', now)).toBeLessThan(1440);
  });

  it('sans ville, l horloge donne l heure de la scène et les secondes de l appareil', () => {
    const now = new Date('2026-10-14T10:00:42Z');
    expect(cityClock(13 * 60 + 5, undefined, now)).toEqual({ h: 13, m: 5, s: 42 });
  });
});
