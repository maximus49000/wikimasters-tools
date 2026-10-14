import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  describe('heure d une ville, appareil simulé à Paris (UTC+2 en octobre)', () => {
    const now = new Date('2026-10-14T10:00:42Z');
    beforeEach(() => {
      vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-120);
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('avance de 7 h et repasse minuit : 22 h à la scène donne 5 h à Tokyo', () => {
      expect(cityMinutes(22 * 60, 'Asia/Tokyo', now)).toBe(300);
    });

    it('recule en passant minuit : 2 h à la scène donne 20 h à New York', () => {
      expect(cityMinutes(2 * 60, 'America/New_York', now)).toBe(1200);
    });

    it('donne l heure, les minutes et les secondes d une ville', () => {
      expect(cityClock(22 * 60 + 15, { name: 'Tokyo', tz: 'Asia/Tokyo' }, now)).toEqual({ h: 5, m: 15, s: 42, live: false });
    });
  });

  it('sans ville, l horloge donne l heure de la scène et les secondes de l appareil', () => {
    const now = new Date('2026-10-14T10:00:42Z');
    expect(cityClock(13 * 60 + 5, undefined, now)).toEqual({ h: 13, m: 5, s: 42, live: false });
  });

  it('en heure réelle, heures et minutes viennent de l appareil (pas de la minute de la scène)', () => {
    const now = new Date(2026, 9, 14, 10, 11, 5);
    expect(cityClock(10 * 60 + 10, undefined, now, true)).toEqual({ h: 10, m: 11, s: 5, live: true });
    const tokyo = { name: 'Tokyo', tz: 'Asia/Tokyo' };
    expect(cityClock(10 * 60 + 10, tokyo, now, true)).toEqual({ ...cityClock(10 * 60 + 11, tokyo, now), live: true });
  });
});
