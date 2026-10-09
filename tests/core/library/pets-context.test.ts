import { describe, expect, it } from 'vitest';
import { createContextTracker, isNight, sunCellsOf, weatherKindOf, NO_CONTEXT } from '../../../src/core/library/pets/context';
import { targetOf } from '../../../src/core/library/weather/weather-types';

describe('weatherKindOf', () => {
  it('classe les états', () => {
    expect(weatherKindOf(null)).toBe('clear');
    expect(weatherKindOf(targetOf('sun'))).toBe('clear');
    expect(weatherKindOf(targetOf('drizzle'))).toBe('drizzle');
    expect(weatherKindOf(targetOf('rain'))).toBe('rain');
    expect(weatherKindOf(targetOf('storm'))).toBe('storm');
    expect(weatherKindOf(targetOf('snow'))).toBe('clear');
  });
});

describe('isNight', () => {
  it('suit le ciel quand il y en a un, l’horloge sinon', () => {
    expect(isNight(0.05, 720, true)).toBe(true);
    expect(isNight(0.9, 60, true)).toBe(false);
    expect(isNight(0, 23 * 60, false)).toBe(true);
    expect(isNight(1, 12 * 60, false)).toBe(false);
  });
});

describe('createContextTracker', () => {
  const base = { night: false, moon: false, sunCells: [] };
  it('donne un nouvel id à chaque orage et le garde tant qu’il dure', () => {
    const t = createContextTracker();
    expect(t.update(1000, { ...base, weather: targetOf('sun') }).storm).toBeNull();
    const a = t.update(2000, { ...base, weather: targetOf('storm') });
    expect(a.storm).toEqual({ id: 1, since: 2000 });
    expect(t.update(9000, { ...base, weather: targetOf('storm') }).storm).toEqual({ id: 1, since: 2000 });
    expect(t.update(10_000, { ...base, weather: targetOf('sun') }).storm).toBeNull();
    expect(t.update(20_000, { ...base, weather: targetOf('storm') }).storm).toEqual({ id: 2, since: 20_000 });
  });
  it('note la fin de la pluie', () => {
    const t = createContextTracker();
    expect(t.update(1000, { ...base, weather: targetOf('rain') }).rainEndedAt).toBeNull();
    expect(t.update(5000, { ...base, weather: targetOf('sun') }).rainEndedAt).toBe(5000);
    expect(t.update(9000, { ...base, weather: targetOf('sun') }).rainEndedAt).toBe(5000);
  });
  it('la bruine ne se termine qu’en dessous de 0,05 (hystérésis)', () => {
    const t = createContextTracker();
    const at = (precip: number) => ({ ...base, weather: { ...targetOf('drizzle'), precip } });
    expect(t.update(0, at(0.25)).rainEndedAt).toBeNull();
    expect(t.update(1000, at(0.08)).rainEndedAt).toBeNull();
    expect(t.update(2000, at(0.12)).weather).toBe('drizzle');
    expect(t.update(3000, at(0.07)).rainEndedAt).toBeNull();
    expect(t.update(4000, at(0.04)).rainEndedAt).toBe(4000);
    expect(t.update(5000, at(0.08)).rainEndedAt).toBe(4000);
    expect(t.update(6000, at(0.12)).rainEndedAt).toBeNull();
  });
  it('sans météo : ciel clair', () => {
    expect(createContextTracker().update(0, { ...base, weather: null }).weather).toBe('clear');
    expect(NO_CONTEXT.storm).toBeNull();
  });
});

describe('sunCellsOf', () => {
  const geom = { wallH: 360, floorH: 150, cols: 24 };
  const glass = { x: 120, y: 60, w: 120, h: 150 };
  it('donne des cases du sol quand le soleil est levé', () => {
    for (const sunFrac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const cells = sunCellsOf({ glasses: [glass], ...geom, sunFrac, sunX: 180, blocked: false });
      expect(cells.length, `sunFrac ${sunFrac}`).toBeGreaterThan(0);
      for (const c of cells) expect(c.row).toBeGreaterThanOrEqual(12);
    }
  });
  it('est vide si le soleil est couché, masqué ou sans fenêtre', () => {
    expect(sunCellsOf({ glasses: [glass], ...geom, sunFrac: null, sunX: null, blocked: false })).toEqual([]);
    expect(sunCellsOf({ glasses: [glass], ...geom, sunFrac: 0.5, sunX: 180, blocked: true })).toEqual([]);
    expect(sunCellsOf({ glasses: [], ...geom, sunFrac: 0.5, sunX: 180, blocked: false })).toEqual([]);
  });
});
