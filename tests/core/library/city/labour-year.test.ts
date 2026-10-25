import { describe, expect, it } from 'vitest';
import { addDays, dayContext, publicHolidays, type DayContext } from '../../../../src/core/library/city/calendar';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings } from '../../../../src/core/library/city/households';
import { checkLabourLaw, checkPaidLeave, type Shift } from '../../../../src/core/library/city/labour-law';
import { leavePlanOf, nannyLeavePlan } from '../../../../src/core/library/city/leave-plan';
import { householdDays } from '../../../../src/core/library/city/person-day';
import { traitsOf } from '../../../../src/core/library/city/person-traits';
import { approximatePeriods } from '../../../../src/core/library/city/school-calendar';

// Droit du travail sur l'année ISO 2026 (29 décembre 2025 → 3 janvier 2027), avec les VRAIES journées produites par
// `householdDays` : services des actifs (`duty.w.shifts`) et de la nounou (`NannyDay.shifts`).
const PERIODS = [...approximatePeriods(2026), ...approximatePeriods(2027)];
const DAYS: DayContext[] = Array.from({ length: 371 }, (_, i) => ({ ...dayContext(addDays({ y: 2025, m: 12, d: 29 }, i), PERIODS), periods: PERIODS }));
const HOLIDAYS = { ...publicHolidays(2025), ...publicHolidays(2026), ...publicHolidays(2027) };

describe('droit du travail sur un an', () => {
  it('droit du travail sur 2026 pour 3 graines', { timeout: 180_000 }, () => {
    const errors: string[] = [];
    const alone: string[] = [];
    let actives = 0, nannies = 0, nannyDays = 0;
    for (const seed of [1, 2, 3]) {
      for (const d of cityDwellings(cityFacades(1440, 340, seed), seed)) {
        const { hh } = d;
        const work = hh.members.map(() => [] as { iso: string; shifts: Shift[] }[]);
        const nanny: { iso: string; shifts: Shift[] }[] = [];
        for (const day of DAYS) {
          const hd = householdDays(d, day, seed);
          for (const p of hd.people) {
            const shifts = p.duty?.kind === 'work' ? p.duty.w.shifts : [];
            work[p.m]!.push({ iso: day.iso, shifts });
            if (!shifts.length) continue;
            const who = `${seed}:${d.id}:${p.m}`;
            if (leavePlanOf(hh, p.m, 2026).has(day.iso)) errors.push(`${who} ${day.iso} : service un jour de CP ou de RTT`);
            if (day.weekday === 0 || HOLIDAYS[day.iso]) errors.push(`${who} ${day.iso} : service un dimanche ou un jour férié`);
            if (day.weekday === 6 && hh.members[p.m]!.who.contract !== 'hcr') errors.push(`${who} ${day.iso} : service le samedi hors restauration`);
          }
          // Jeunes enfants jamais seuls au logement éveillés (vacances d'été, samedis des parents en restauration compris).
          const inside = (out: readonly (readonly [number, number])[], t: number) => out.some(([a, b]) => t >= a && t < b);
          for (const k of hd.people) {
            const who = hh.members[k.m]!.who;
            if (who.status !== 'enfant' || who.age >= 11) continue;
            for (let t = Math.max(0, k.wake); t < k.bed; t += 5) {
              if (inside(k.out, t)) continue;
              const ok = hd.people.some((a) => hh.members[a.m]!.who.status !== 'enfant' && !inside(a.out, t))
                || (hd.nanny?.visits ?? []).some((v) => t >= v.arrive && t < v.leave);
              if (!ok) { alone.push(`${seed}:${d.id} ${day.iso} : ${who.first} seul à ${t}`); break; }
            }
          }
          const ns = hd.nanny?.shifts ?? [];
          nanny.push({ iso: day.iso, shifts: ns });
          if (ns.length && nannyLeavePlan(hh, 2026).has(day.iso)) errors.push(`${seed}:${d.id} nounou ${day.iso} : service un jour de congé`);
          if (ns.length) nannyDays++;
          if (ns.length && (day.weekday === 0 || HOLIDAYS[day.iso])) errors.push(`${seed}:${d.id} nounou ${day.iso} : un dimanche ou un jour férié`);
        }
        hh.members.forEach((_, m) => {
          const t = traitsOf(hh, m).work;
          if (!t) return;
          actives++;
          const who = `${seed}:${d.id}:${m}`;
          errors.push(...checkLabourLaw(work[m]!, !!t.split, who));
          errors.push(...checkPaidLeave(leavePlanOf(hh, m, 2026), t.rttPerYear, who));
        });
        if (hh.nanny) {
          nannies++;
          errors.push(...checkLabourLaw(nanny, false, `${seed}:${d.id}:nounou`));
          errors.push(...checkPaidLeave(nannyLeavePlan(hh, 2026), 0, `${seed}:${d.id}:nounou`));
        }
      }
    }
    expect(actives).toBeGreaterThan(300);
    expect(nannies).toBeGreaterThan(20);
    expect(nannyDays).toBeGreaterThan(1000);
    expect(errors.slice(0, 20)).toEqual([]);
    expect(alone.slice(0, 20)).toEqual([]);
  });
});
