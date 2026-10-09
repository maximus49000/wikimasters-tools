import { describe, expect, it } from 'vitest';
import { lampLit, lampsFor, type Lamp } from '../../../src/core/library/city/lamps';

const h = (hours: number): number => Math.round(hours * 60);

describe('lampsFor', () => {
  it('espace régulièrement les lampadaires, de façon déterministe', () => {
    const lamps = lampsFor(1440, 3);
    expect(lamps).toEqual(lampsFor(1440, 3));
    expect(lamps.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < lamps.length; i++) {
      const gap = lamps[i]!.x - lamps[i - 1]!.x;
      expect(gap).toBeGreaterThanOrEqual(120);
      expect(gap).toBeLessThanOrEqual(220);
    }
    for (const lamp of lamps) {
      expect(lamp.offJitter).toBeGreaterThanOrEqual(-15);
      expect(lamp.offJitter).toBeLessThanOrEqual(15);
    }
  });
});

describe('lampLit', () => {
  const early: Lamp = { id: 'a', x: 0, offJitter: -10 }; // s'éteint à 23 h 50
  const late: Lamp = { id: 'b', x: 0, offJitter: 10 }; // s'éteint à 0 h 10
  it('est éteint de jour', () => {
    expect(lampLit(early, h(12), 1)).toBe(false);
  });
  it('est allumé le soir', () => {
    expect(lampLit(early, h(21), 0.1)).toBe(true);
    expect(lampLit(late, h(21), 0.1)).toBe(true);
  });
  it('s’éteint en cascade autour de minuit', () => {
    expect(lampLit(early, h(23) + 45, 0)).toBe(true);
    expect(lampLit(early, h(23) + 55, 0)).toBe(false);
    expect(lampLit(late, h(23) + 55, 0)).toBe(true);
    expect(lampLit(late, 5, 0)).toBe(true); // 0 h 05
    expect(lampLit(late, 20, 0)).toBe(false); // 0 h 20
  });
  it('reste éteint jusqu’à l’aube', () => {
    expect(lampLit(late, h(3), 0)).toBe(false);
    expect(lampLit(early, h(5), 0.2)).toBe(false);
  });
  it('est toujours allumé en mode nuit forcée', () => {
    expect(lampLit(early, 0, 0, true)).toBe(true);
    expect(lampLit(early, h(12), 1, true)).toBe(false); // le jour reste le jour
  });
});
