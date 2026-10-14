import { describe, expect, it } from 'vitest';
import { localClock } from '../../../src/core/library/scene-clock';

describe('localClock', () => {
  it('Tokyo est à +7 h de Paris en octobre et +8 h en janvier', () => {
    const oct = new Date('2026-10-14T10:00:00Z');
    const jan = new Date('2026-01-14T10:00:00Z');
    expect(localClock(oct, 'Asia/Tokyo').minutes - localClock(oct, 'Europe/Paris').minutes).toBe(7 * 60);
    expect(localClock(jan, 'Asia/Tokyo').minutes - localClock(jan, 'Europe/Paris').minutes).toBe(8 * 60);
  });

  it('passe minuit : 22 h à Paris donne 5 h le lendemain à Tokyo, avec la date du lendemain', () => {
    const now = new Date('2026-10-14T20:00:00Z');
    expect(localClock(now, 'Europe/Paris')).toMatchObject({ minutes: 22 * 60, date: { y: 2026, m: 10, d: 14 }, offsetMin: 120 });
    expect(localClock(now, 'Asia/Tokyo')).toMatchObject({ minutes: 5 * 60, date: { y: 2026, m: 10, d: 15 }, offsetMin: 540 });
  });

  it('fuseau à demi-heure : l’Inde est à UTC+5 h 30', () => {
    const now = new Date('2026-10-14T20:00:00Z');
    expect(localClock(now, 'Asia/Kolkata')).toMatchObject({ minutes: 90, date: { y: 2026, m: 10, d: 15 }, offsetMin: 330 });
  });

  it('les secondes sont les mêmes dans tous les fuseaux', () => {
    const now = new Date('2026-10-14T20:00:42Z');
    for (const tz of ['Asia/Tokyo', 'Asia/Kolkata', 'America/St_Johns', null]) expect(localClock(now, tz).seconds).toBe(42);
  });

  it('changement d’heure : Paris passe de +2 h à +1 h le 25 octobre 2026', () => {
    expect(localClock(new Date('2026-10-25T00:59:00Z'), 'Europe/Paris').offsetMin).toBe(120);
    expect(localClock(new Date('2026-10-25T01:00:00Z'), 'Europe/Paris')).toMatchObject({ minutes: 2 * 60, offsetMin: 60 });
  });

  it('sans fuseau : l’heure, la date et le décalage de l’appareil', () => {
    const now = new Date(2026, 9, 14, 10, 11, 5);
    expect(localClock(now, null)).toEqual({ minutes: 611, seconds: 5, date: { y: 2026, m: 10, d: 14 }, offsetMin: -now.getTimezoneOffset() });
  });
});
