import { describe, expect, it } from 'vitest';
import { schoolBusArrivals } from '../../../../../src/core/library/city/traffic/school-bus';
import { schoolWindows } from '../../../../../src/core/library/city/intensity';
import { dayContext } from '../../../../../src/core/library/city/calendar';

describe('cars scolaires', () => {
  it('2 à 4 passages par fenêtre, dans la fenêtre, déterministes', () => {
    const o = { seed: 5, day: 20_000, nowS: 1_000_000, minutes: 480, windows: [[470, 510], [996, 1035]] as const };
    const a = schoolBusArrivals(o);
    expect(schoolBusArrivals(o)).toEqual(a);
    for (const w of [0, 1]) {
      const mine = a.filter((x) => x.key.startsWith(`school-20000-${w}-`));
      expect(mine.length).toBeGreaterThanOrEqual(2);
      expect(mine.length).toBeLessThanOrEqual(4);
      for (const x of mine) {
        expect(x.kind).toBe('school-bus');
        const m = 480 + (x.start - 1_000_000) / 60;
        expect(m).toBeGreaterThanOrEqual(o.windows[w]![0]);
        expect(m).toBeLessThanOrEqual(o.windows[w]![1]);
      }
    }
    // Un autre jour : d'autres passages.
    expect(schoolBusArrivals({ ...o, day: 20_001 }).map((x) => x.start)).not.toEqual(a.map((x) => x.start));
  });
  it('fenêtres : aucune le dimanche, aller et sortie un jour d’école, sortie à midi le mercredi', () => {
    expect(schoolWindows(dayContext({ y: 2026, m: 10, d: 11 }, []))).toEqual([]);
    const tue = schoolWindows(dayContext({ y: 2026, m: 10, d: 13 }, []));
    expect(tue).toHaveLength(2);
    expect(tue[0]![0]).toBeLessThan(8 * 60);
    expect(tue[1]![0]).toBeGreaterThan(16 * 60);
    const wed = schoolWindows(dayContext({ y: 2026, m: 10, d: 14 }, []));
    expect(wed[1]![0]).toBeLessThan(12 * 60);
    expect(wed[1]![1]).toBeGreaterThan(12 * 60);
  });
});
