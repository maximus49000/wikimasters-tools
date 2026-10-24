import { describe, expect, it } from 'vitest';
import { lampsFor } from '../../../../src/core/library/city/lamps';
import { cityMetrics } from '../../../../src/core/library/city/metrics';
import { shopFrame, shopSlotsFor } from '../../../../src/core/library/city/shops/slots';
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
        // Un arbre tous les 70-110 px (décision du 2026-10-20), moins les pas sautés devant les portes et les lampadaires :
        // mesuré au 2026-10-24 au moins 0,78 × largeur / 90 fosses (vides comprises) ; plancher 0,75.
        expect(pits.length).toBeGreaterThanOrEqual((0.75 * width) / 90);
      });

      it(`${tag} : fosses hors des entrées, portes des locaux, lampadaires, arbres et mobilier`, () => {
        const lamps = lampsFor(width, seed).map((l) => l.x);
        const doorSpans = plan.doors.map((d) => ({ x0: d.x - 4, x1: d.x + 16 }));
        const shopDoors = shopSlotsFor(width, H, seed).map((s) => shopFrame(s, plan.ground).door);
        for (const p of pits) {
          const a = p.x - 6;
          const b = p.x + 6;
          // Entrée (span ± 4 px) contre la grille réelle de la fosse.
          for (const d of doorSpans) expect(overlap(p.x0, p.x1, d.x0, d.x1)).toBe(false);
          for (const l of lamps) expect(overlap(a, b, l - 9, l + 9)).toBe(false);
          for (const t of plan.trees) expect(overlap(a, b, t.x - t.r - 6, t.x + t.r + 6)).toBe(false);
          // Porte vitrée ± 4 px contre la grille réelle de la fosse (x0 … x1). Le mobilier, côté façade, ne compte pas ici.
          for (const d of shopDoors) expect(overlap(p.x0, p.x1, d.x - 4, d.x + d.w + 4)).toBe(false);
        }
        for (const v of rue.filter((v): v is RueBox => v.kind === 'bac')) {
          for (const d of shopDoors) expect(overlap(v.x0, v.x1, d.x - 4, d.x + d.w + 4)).toBe(false);
          for (const f of plan.furniture) expect(overlap(v.x0, v.x1, f.x - 3, f.x + f.w + 3)).toBe(false);
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

      // Pas de 70-110 px, centre libre cherché à ± 21 px : jamais moins de 70 − 2 × 21 = 28 px entre deux fosses ; au
      // moins 65 % des écarts entre 56 et 124 px (mesuré : 67 % au pire) (le reste : essai décalé loin, ou pas sauté devant une suite de portes).
      it(`${tag} : fosses dans l'ordre, au moins 28 px, 65 % des écarts entre 56 et 124 px`, () => {
        const gaps = pits.slice(1).map((p, i) => p.x - pits[i]!.x);
        for (const g of gaps) expect(g).toBeGreaterThanOrEqual(28);
        const inRange = gaps.filter((g) => g >= 56 && g <= 124).length;
        expect(inRange).toBeGreaterThanOrEqual(0.65 * gaps.length);
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
