import { describe, expect, it } from 'vitest';
import { lampsFor } from '../../../../src/core/library/city/lamps';
import { cityMetrics } from '../../../../src/core/library/city/metrics';
import { cityPaintPlan } from '../../../../src/core/library/paint/city-plan';
import { streetVerdure, type RueBox, type RuePit, type RuePots } from '../../../../src/core/library/paint/rue-verte-plan';
import { hashString } from '../../../../src/core/library/scene-world';

const H = 340;
const overlap = (a0: number, a1: number, b0: number, b1: number): boolean => a1 > b0 && a0 < b1;

describe('verdure de la rue (streetVerdure)', () => {
  it('le plan existant ne change pas (empreinte graine 7 relevée avant la verdure)', () => {
    const got = [720, 1440, 2880].map((w) => {
      const p = cityPaintPlan(w, H, 7) as unknown as Record<string, unknown>;
      return `${w}:` + ['trees', 'furniture', 'doors', 'buildings'].map((k) => hashString(JSON.stringify(p[k]))).join(',');
    });
    expect(got).toEqual([
      '720:1947613349,631844375,2050314074,751929030',
      '1440:1947613349,1840000233,3681931032,2270183717',
      '2880:1947613349,154990294,3390600007,497193754',
    ]);
  });

  for (const seed of [1, 7, 42]) {
    for (const width of [720, 1440, 2880]) {
      const plan = cityPaintPlan(width, H, seed);
      const m = cityMetrics(H);
      const rue = plan.rue;
      const pits = rue.filter((v): v is RuePit => v.kind === 'pit');
      const tag = `graine ${seed}, ${width} px`;

      it(`${tag} : déterministe et identique à plan.rue`, () => {
        const { rue: _omit, ...rest } = plan;
        expect(streetVerdure(rest, width)).toEqual(streetVerdure(rest, width));
        expect(streetVerdure(rest, width)).toEqual(rue);
        expect(pits.length).toBeGreaterThanOrEqual(2);
      });

      it(`${tag} : fosses hors des entrées, lampadaires, arbres, mobilier et bouts de locaux`, () => {
        const lamps = lampsFor(width, seed).map((l) => l.x);
        const doorSpans = plan.doors.map((d) => ({ x0: d.x - 4, x1: d.x + 16 }));
        const shops = plan.blocked.filter((s) => !doorSpans.some((d) => Math.abs(d.x0 - s.x0) < 0.5));
        for (const p of pits) {
          const a = p.x - 6;
          const b = p.x + 6;
          for (const d of doorSpans) expect(overlap(a, b, d.x0 - 2, d.x1 + 2)).toBe(false);
          for (const l of lamps) expect(overlap(a, b, l - 9, l + 9)).toBe(false);
          for (const t of plan.trees) expect(overlap(a, b, t.x - t.r - 6, t.x + t.r + 6)).toBe(false);
          for (const f of plan.furniture) expect(overlap(a, b, f.x - 3, f.x + f.w + 3)).toBe(false);
          for (const s of shops) {
            expect(overlap(a, b, s.x0 - 2, s.x0 + 8)).toBe(false);
            expect(overlap(a, b, s.x1 - 8, s.x1 + 2)).toBe(false);
          }
        }
      });

      it(`${tag} : couloir des passants libre (fosses à la bordure, bacs et pots à la façade)`, () => {
        for (const p of pits) {
          expect(p.y).toBeGreaterThanOrEqual(plan.curb - 5);
          expect(p.y).toBeLessThanOrEqual(plan.curb);
          expect(p.y).toBeGreaterThan(m.walkY);
        }
        for (const v of rue.filter((v): v is RueBox => v.kind === 'bac' || v.kind === 'parterre')) {
          expect(v.y).toBeGreaterThanOrEqual(plan.ground);
          expect(v.y).toBeLessThanOrEqual(plan.ground + 3.5);
          expect(v.y).toBeLessThan(m.doorY);
        }
        for (const v of rue.filter((v): v is RuePots => v.kind === 'pots')) expect(plan.doors.some((d) => d.x === v.x)).toBe(true);
      });

      // Pas de 70-110 px, 7 essais décalés jusqu'à ± 21 px : jamais moins de 70 − 2 × 21 = 28 px entre deux fosses ; au-delà
      // de 110 + 42 px, un pas entier a été sauté (rue pleine d'entrées et de locaux : voir le rapport de la tâche 3).
      it(`${tag} : fosses dans l'ordre, espacées d'au moins 28 px`, () => {
        for (let i = 1; i < pits.length; i++) expect(pits[i]!.x - pits[i - 1]!.x).toBeGreaterThanOrEqual(28);
      });

      it(`${tag} : rien hors de [0, largeur]`, () => {
        for (const v of rue) {
          if ('x0' in v) {
            expect(v.x0).toBeGreaterThanOrEqual(0);
            expect(v.x1).toBeLessThanOrEqual(width);
          }
          if ('x' in v) {
            expect(v.x).toBeGreaterThanOrEqual(0);
            expect(v.x).toBeLessThanOrEqual(width);
          }
        }
      });
    }
  }
});
