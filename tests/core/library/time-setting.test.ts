import { describe, expect, it } from 'vitest';
import { formatMinutes, minutesFor } from '../../../src/core/library/time-setting';

describe('minutesFor', () => {
  const now = new Date(2024, 5, 21, 14, 37);
  it('réelle : heure de l’appareil', () => expect(minutesFor({ mode: 'real' }, now)).toBe(14 * 60 + 37));
  it('jour : midi', () => expect(minutesFor({ mode: 'day' }, now)).toBe(720));
  it('nuit : minuit', () => expect(minutesFor({ mode: 'night' }, now)).toBe(0));
  it('manuelle : la minute choisie', () => expect(minutesFor({ mode: 'manual', minutes: 301 }, now)).toBe(301));
  it('réelle avec un fuseau : l’heure de ce fuseau', () => {
    const at = new Date('2026-10-14T20:00:00Z');
    expect(minutesFor({ mode: 'real' }, at, 'Asia/Tokyo')).toBe(5 * 60);
    expect(minutesFor({ mode: 'manual', minutes: 301 }, at, 'Asia/Tokyo')).toBe(301);
  });
});

describe('formatMinutes', () => {
  it('formate hh:mm', () => {
    expect(formatMinutes(372)).toBe('06:12');
    expect(formatMinutes(0)).toBe('00:00');
    expect(formatMinutes(1439)).toBe('23:59');
  });
});
