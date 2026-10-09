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
  it('sans météo : ciel clair', () => {
    expect(createContextTracker().update(0, { ...base, weather: null }).weather).toBe('clear');
    expect(NO_CONTEXT.storm).toBeNull();
  });
});

describe('sunCellsOf', () => {
  const geom = { wallH: 360, floorH: 150, cols: 24 };
  const glass = { x: 120, y: 0, w: 120, h: 150 }; // verre haut : le patch (y 383–400) couvre la rangée 13
  it('donne des cases du sol quand le soleil est levé', () => {
    const cells = sunCellsOf({ glasses: [glass], ...geom, sunFrac: 0.5, sunX: 180, blocked: false });
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) expect(c.row).toBeGreaterThanOrEqual(12);
  });
  it('est vide si le soleil est couché, masqué ou sans fenêtre', () => {
    expect(sunCellsOf({ glasses: [glass], ...geom, sunFrac: null, sunX: null, blocked: false })).toEqual([]);
    expect(sunCellsOf({ glasses: [glass], ...geom, sunFrac: 0.5, sunX: 180, blocked: true })).toEqual([]);
    expect(sunCellsOf({ glasses: [], ...geom, sunFrac: 0.5, sunX: 180, blocked: false })).toEqual([]);
  });
});
