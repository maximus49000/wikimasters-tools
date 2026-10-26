import { describe, expect, it } from 'vitest';
import { addDays, dayContext, isoDate, type DayContext, type YMD } from '../../../../src/core/library/city/calendar';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings, type Dwelling } from '../../../../src/core/library/city/households';
import { checkLabourLaw, LAW } from '../../../../src/core/library/city/labour-law';
import { freeWake, householdDays, type HouseholdDays } from '../../../../src/core/library/city/person-day';
import { traitsOf } from '../../../../src/core/library/city/person-traits';
import { approximatePeriods } from '../../../../src/core/library/city/school-calendar';
import { SCHOOL } from '../../../../src/core/library/city/school-run';

// Journée de chaque habitant (tâche 7) : villes de 1440 px, 3 graines, novembre 2026 avec les vacances approchées.
const PERIODS = approximatePeriods(2026);
const ctx = (date: YMD): DayContext => ({ ...dayContext(date, PERIODS), periods: PERIODS });
const NOV1: YMD = { y: 2026, m: 11, d: 1 };
const NOVEMBER: DayContext[] = Array.from({ length: 30 }, (_, i) => ctx(addDays(NOV1, i)));
const SEEDS = [1, 2, 3];
const TOWNS = SEEDS.map((seed) => ({ seed, dwellings: cityDwellings(cityFacades(1440, 340, seed), seed) }));
type Row = { seed: number; d: Dwelling; day: DayContext; hd: HouseholdDays };
const ROWS: Row[] = TOWNS.flatMap(({ seed, dwellings }) =>
  dwellings.flatMap((d) => NOVEMBER.map((day) => ({ seed, d, day, hd: householdDays(d, day, seed) }))));
const home = (r: Row): boolean => r.hd.away.state === 'home';
const status = (r: Row, m: number) => r.d.hh.members[m]!.who.status;
const inside = (out: readonly (readonly [number, number])[], t: number): boolean => out.some(([a, b]) => t >= a && t < b);

describe('journée de chaque habitant', () => {
  it('lever d\'un jour travaillé = début − trajet − préparation, stable à ± 10 min sur la semaine', () => {
    let n = 0;
    const weekly = new Map<string, number[]>();
    for (const r of ROWS) {
      r.hd.people.forEach((p) => {
        // Qui dépose les enfants ou les réveille (lever avancé, même départ) : hors de ce contrôle.
        if (p.duty?.kind !== 'work' || p.duty.w.drop || p.why.startsWith('réveille')) return;
        const w = p.duty.w;
        expect(p.wake, `${r.d.id} ${r.day.iso} ${p.m}`).toBe(w.start - w.commute - w.prep);
        expect(p.prepEnd).toBe(w.start - w.commute);
        n++;
        // Semaine du 9 au 13 novembre, non-cadres (début fixe) : seul le bruit de préparation (± 5) bouge le lever.
        if (r.day.date.d >= 9 && r.day.date.d <= 13 && status(r, p.m) === 'non-cadre') {
          const k = `${r.seed}|${r.d.id}|${p.m}`;
          weekly.set(k, [...(weekly.get(k) ?? []), p.wake]);
        }
      });
    }
    expect(n).toBeGreaterThan(2000);
    expect(weekly.size).toBeGreaterThan(30);
    for (const [k, list] of weekly) expect(Math.max(...list) - Math.min(...list), k).toBeLessThanOrEqual(20);
  });

  it('retraités : une partie debout avant 7 h 30 le dimanche, pas tous, pas les mêmes chaque dimanche', () => {
    const sundays = NOVEMBER.filter((day) => day.weekday === 0).map((day) => day.iso);
    const early = sundays.map((iso) => {
      const set = new Set<string>();
      let all = 0;
      for (const r of ROWS) {
        if (r.day.iso !== iso || !home(r)) continue;
        r.hd.people.forEach((p) => {
          if (status(r, p.m) !== 'retraite') return;
          all++;
          if (p.wake < 450) set.add(`${r.seed}|${r.d.id}|${p.m}`);
        });
      }
      expect(set.size, iso).toBeGreaterThan(0);
      expect(set.size, iso).toBeLessThan(all);
      return set;
    });
    const same = early.every((s) => s.size === early[0]!.size && [...s].every((k) => early[0]!.has(k)));
    expect(same).toBe(false);
  });

  it('rendez-vous → lever plus tôt que le lever libre du même jour sans rendez-vous', () => {
    let n = 0;
    const earlier = { chomeur: 0, retraite: 0 } as Record<string, number>;
    for (const r of ROWS) {
      r.hd.people.forEach((p) => {
        if (!p.appointment || r.hd.run?.drop === p.m) return; // qui dépose les enfants : lever de la dépose
        n++;
        const free = freeWake(r.d.hh, p.m, r.day, p.prevBed).wake;
        const rdv = p.appointment.at - p.appointment.commute - traitsOf(r.d.hh, p.m).prep;
        // Le lever du rendez-vous, ou plus tôt quand ce parent se lève avec les petits.
        if (p.wake !== Math.min(free, rdv)) expect(p.why).toContain('se lève avec');
        expect(p.wake).toBeLessThanOrEqual(Math.min(free, rdv));
        if (p.wake < free) earlier[status(r, p.m)]!++;
      });
    }
    expect(n).toBeGreaterThan(20);
    expect(earlier.chomeur).toBeGreaterThan(5);
    expect(earlier.retraite).toBeGreaterThan(2);
  });

  it('rattrapage : lendemain de boîte sans obligation, lever ≥ coucher + besoin − 30 et ≤ 13 h', () => {
    let n = 0;
    for (const { seed, dwellings } of TOWNS) {
      for (const d of dwellings) {
        for (let i = 1; i < NOVEMBER.length; i++) {
          const prev = householdDays(d, NOVEMBER[i - 1]!, seed);
          const cur = householdDays(d, NOVEMBER[i]!, seed);
          if (cur.away.state !== 'home') continue;
          cur.people.forEach((p) => {
            if (prev.people[p.m]!.outing?.kind !== 'boite') return;
            if (p.prepEnd !== null || p.duty?.kind === 'work' || p.school || p.appointment) return;
            const sleep = traitsOf(d.hh, p.m).sleep;
            expect(p.wake).toBeGreaterThanOrEqual(Math.min(p.prevBed + sleep - 30, 780));
            expect(p.wake).toBeLessThanOrEqual(780);
            n++;
          });
        }
      }
    }
    expect(n).toBeGreaterThan(3);
  });

  it('85 % : veilles de travail sans sortie où l’heure habituelle ne suffit pas, couchées à temps entre 75 et 95 %', () => {
    const byKey = new Map(ROWS.map((r) => [`${r.seed}|${r.d.id}|${r.day.iso}`, r]));
    let eves = 0, breaks = 0, enough = 0, lateQuiet = 0, lateClub = 0, clubEves = 0;
    for (const r of ROWS) {
      const next = byKey.get(`${r.seed}|${r.d.id}|${isoDate(addDays(r.day.date, 1))}`);
      if (!next || !home(r) || !home(next)) continue;
      r.hd.people.forEach((p) => {
        const q = next.hd.people[p.m]!;
        if (q.duty?.kind !== 'work') return;
        eves++;
        const t = traitsOf(r.d.hh, p.m);
        const slept = q.wake - (p.bed - 1440);
        if (slept < t.sleep - 30) { if (p.outing) lateClub += p.outing.kind === 'boite' ? 1 : 0; else lateQuiet++; }
        if (p.outing?.kind === 'boite') clubEves++;
        if (p.outing || 1440 + q.wake - t.bedtime >= t.sleep - 30) return;
        breaks++;
        if (slept >= t.sleep - 30) enough++;
      });
    }
    expect(breaks).toBeGreaterThan(200);
    expect(enough / breaks).toBeGreaterThanOrEqual(0.75);
    expect(enough / breaks).toBeLessThanOrEqual(0.95);
    expect(lateQuiet).toBeGreaterThan(0); // couché tard sans sortie avant un jour travaillé
    expect(lateClub).toBeGreaterThan(0); // boîte la veille d'un jour travaillé, debout quand même
    expect(clubEves / eves).toBeLessThan(0.2);
  });

  it('profondeur 1 : prevBed de J = bed de J − 1 − 1440 pour tous, 60 jours', () => {
    const days = Array.from({ length: 61 }, (_, i) => ctx(addDays({ y: 2026, m: 10, d: 25 }, i)));
    for (const { seed, dwellings } of TOWNS) {
      for (const d of dwellings) {
        let prev = householdDays(d, days[0]!, seed);
        for (let i = 1; i < days.length; i++) {
          const cur = householdDays(d, days[i]!, seed);
          cur.people.forEach((p) => expect(p.prevBed, `${d.id} ${days[i]!.iso} ${p.m}`).toBe(prev.people[p.m]!.bed - 1440));
          prev = cur;
        }
      }
    }
  });

  it('enfants < 11 jamais seuls au logement éveillés (adulte du foyer ou nounou présents à chaque minute)', () => {
    let checked = 0;
    for (const r of ROWS) {
      const { hh } = r.d;
      const adults = r.hd.people.filter((p) => status(r, p.m) !== 'enfant');
      const nanny = r.hd.nanny?.visits ?? [];
      for (const k of r.hd.people) {
        const who = hh.members[k.m]!.who;
        if (who.status !== 'enfant' || who.age >= 11) continue;
        for (let t = Math.max(0, k.wake); t < k.bed; t++) {
          if (inside(k.out, t)) continue;
          checked++;
          const ok = adults.some((a) => !inside(a.out, t)) || nanny.some((v) => t >= v.arrive && t < v.leave);
          if (!ok) expect.fail(`${r.seed} ${r.d.id} ${r.day.iso} : ${who.first} seul à ${t}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(100000);
  });

  it('nounou : arrive à 16 h 05 à pied, rentre à 16 h 40 avec les enfants, repart 5-10 min après le premier parent', () => {
    let n = 0;
    for (const r of ROWS) {
      const pickup = r.hd.run?.pickup;
      if (pickup?.by !== 'nanny') continue;
      n++;
      const visit = r.hd.nanny!.visits.find((v) => v.reason === 'sortie')!;
      expect(visit.arrive).toBe(SCHOOL.nannyHome);
      expect(r.hd.nanny!.shifts[0]![0]).toBe(SCHOOL.pickup);
      expect(SCHOOL.nannyArrive).toBe(965);
      expect(visit.leave).toBe(pickup.until);
      const relay = r.hd.people[pickup.relay]!;
      const back = relay.out.filter(([a]) => a < visit.leave).at(-1)![1];
      expect(visit.leave - back).toBeGreaterThanOrEqual(5);
      expect(visit.leave - back).toBeLessThanOrEqual(10);
      // Les enfants rentrent avec elle à 16 h 40.
      for (const k of r.hd.people) if (k.school && !k.school.autonomous) expect(k.out.some(([, b]) => b === SCHOOL.nannyHome)).toBe(true);
    }
    expect(n).toBeGreaterThan(50);
  });

  it('samedi resto de la famille avec nounou : nounou arrive dep − 10, repart ret + 5-10', () => {
    let n = 0;
    for (const r of ROWS) {
      if (r.d.hh.type !== 'famille' || r.day.weekday !== 6) continue;
      const o = r.hd.people[0]!.outing;
      if (!o) continue;
      n++;
      const v = r.hd.nanny!.visits.find((x) => x.reason === 'soir')!;
      expect(v.arrive).toBe(o.dep - 10);
      expect(v.leave - o.ret).toBeGreaterThanOrEqual(5);
      expect(v.leave - o.ret).toBeLessThanOrEqual(10);
      expect(r.hd.people[1]!.outing).toEqual(o);
    }
    expect(n).toBeGreaterThan(3);
  });

  it('dressAt < premier départ, undressAt < bed, aucun bloc entre dressAt − 1 et dressAt + 1', () => {
    for (const r of ROWS) {
      if (r.hd.away.state === 'away' || r.hd.away.state === 'returns') continue;
      for (const p of r.hd.people) {
        const where = `${r.seed} ${r.d.id} ${r.day.iso} ${p.m}`;
        expect(p.wake, where).toBeGreaterThan(p.prevBed);
        expect(p.dressAt, where).toBeGreaterThanOrEqual(p.wake);
        const firstOut = p.out.find(([a]) => a > 0); // hors retour de nuit de la veille
        if (firstOut) expect(p.dressAt, where).toBeLessThan(firstOut[0]);
        expect(p.undressAt, where).toBeLessThan(p.bed);
        expect(p.blocks.some((b) => b.b > p.dressAt - 1 && b.a < p.dressAt + 1), where).toBe(false);
        if (r.hd.away.state === 'home') expect(inside(p.out, p.undressAt), where).toBe(false);
      }
    }
  });

  it('sortie du soir : départ ≥ fin des obligations commencées avant 19 h 30 + 30, jamais par-dessus un autre bloc', () => {
    let n = 0, pushed = 0;
    for (const r of ROWS) {
      for (const p of r.hd.people) {
        const o = p.outing;
        if (!o) continue;
        n++;
        // Sorties d'obligation (de la porte au retour) commencées avant 19 h 30.
        const duty = p.blocks.filter((b) => b.k !== 'outing' && b.k !== 'out');
        const spans = duty.map((b): [number, number] => [b.a, b.b]).sort((x, y) => x[0] - y[0])
          .reduce<[number, number][]>((acc, x) => { const l = acc.at(-1); if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else acc.push([...x]); return acc; }, []);
        const ends = spans.filter(([a]) => a < 1170).map(([, b]) => b);
        if (ends.length) expect(o.dep).toBeGreaterThanOrEqual(Math.max(...ends) + 30);
        if (ends.length && o.dep === Math.max(...ends) + 30) pushed++;
        expect(p.blocks.filter((b) => b.k !== 'outing' && b.b > o.dep && b.a < o.ret).map((b) => `${r.seed} ${r.d.id} ${r.day.iso} ${p.m} ${b.k} ${b.a}-${b.b} ${o.dep}-${o.ret}`)).toEqual([]);
        expect(o.ret - o.dep).toBeGreaterThanOrEqual(60);
      }
    }
    expect(n).toBeGreaterThan(300);
    expect(pushed).toBeGreaterThan(0); // des départs repoussés par la fin du travail (restauration, cadres tardifs…)
  });

  it('matin sans parent pour la dépose : accueil à 7 h 30 avec le dernier parent, sinon nounou, sinon grands-parents', () => {
    const seen = { accueil: 0, nanny: 0, 'grands-parents': 0 };
    const open = SCHOOL.careOpen - SCHOOL.walk;
    for (const r of ROWS) {
      const kids = r.hd.people.filter((k) => k.school && !k.school.autonomous);
      // Aucun petit ne part avant l'ouverture de l'accueil, sauf chez les grands-parents avec un adulte.
      for (const k of kids) {
        const dep = k.out.find(([a]) => a > 0)![0];
        if (dep >= open) continue;
        expect(k.blocks.find((b) => b.a === dep)!.label, `${r.d.id} ${r.day.iso}`).toContain('chez les grands-parents');
        expect(r.hd.people.some((a) => status(r, a.m) !== 'enfant' && a.out.some(([x]) => x === dep))).toBe(true);
      }
      const mo = r.hd.run?.morning;
      if (!r.hd.run || r.hd.run.drop !== null) continue;
      expect(mo).toBeDefined();
      seen[mo!.by]++;
      const parents = r.hd.people.filter((p) => status(r, p.m) !== 'enfant');
      const lastDep = Math.max(...parents.map((p) => p.out.find(([a]) => a > 0)?.[0] ?? -1));
      for (const k of kids) {
        const dep = k.out.find(([a]) => a > 0)![0];
        expect(k.wake).toBe(dep - 40);
        if (mo!.by === 'accueil') { expect(dep).toBe(lastDep); expect(dep).toBeGreaterThanOrEqual(open); expect(k.why).toContain('accueil du matin'); }
        if (mo!.by === 'grands-parents') { expect(dep).toBe(lastDep); expect(dep).toBeLessThan(open); }
        if (mo!.by === 'nanny') {
          expect(dep).toBe(open);
          const v = r.hd.nanny!.visits.find((x) => x.reason === 'matin')!;
          expect(v).toEqual({ arrive: lastDep - 10, leave: open, reason: 'matin' });
          expect(r.hd.nanny!.shifts[0]).toEqual([lastDep - 10, SCHOOL.careOpen]);
        }
      }
    }
    expect(seen.accueil + seen.nanny + seen['grands-parents']).toBeGreaterThan(0);
  });

  it('retour de nuit : jamais au logement entre minuit et le retour d’une boîte qui finit après minuit', () => {
    let n = 0;
    for (const { seed, dwellings } of TOWNS) {
      for (const d of dwellings) {
        let prev = householdDays(d, NOVEMBER[0]!, seed);
        for (let i = 1; i < NOVEMBER.length; i++) {
          const cur = householdDays(d, NOVEMBER[i]!, seed);
          cur.people.forEach((p) => {
            const o = prev.people[p.m]!.outing;
            if (!o || o.ret <= 1440) return;
            n++;
            expect(p.out[0]![0]).toBe(0);
            expect(p.out[0]![1]).toBeGreaterThanOrEqual(o.ret - 1440);
            expect(p.blocks[0]).toMatchObject({ a: 0, b: o.ret - 1440, k: 'outing' });
          });
          prev = cur;
        }
      }
    }
    expect(n).toBeGreaterThan(20);
  });

  it('jour d’école : un adulte au logement est debout au réveil des petits', () => {
    let n = 0;
    for (const r of ROWS) {
      const kids = r.hd.people.filter((k) => k.school && !k.school.autonomous && r.d.hh.members[k.m]!.who.age < 11);
      if (!kids.length || !home(r)) continue;
      const kw = Math.min(...kids.map((k) => k.wake));
      const adults = r.hd.people.filter((p) => status(r, p.m) !== 'enfant' && !inside(p.out, kw));
      if (!adults.length) continue;
      n++;
      expect(adults.some((a) => a.wake <= kw), `${r.d.id} ${r.day.iso}`).toBe(true);
    }
    expect(n).toBeGreaterThan(200);
  });

  it('jour libre : le parent qui se lève avec les petits est celui qui a le moins de sommeil à rattraper', () => {
    let n = 0;
    for (const r of ROWS) {
      const g = r.hd.people.find((p) => p.why.includes('se lève avec'));
      if (!g) continue;
      n++;
      const need = (p: (typeof r.hd.people)[number]) => p.prevBed + traitsOf(r.d.hh, p.m).sleep;
      const others = r.hd.people.filter((p) => p !== g && status(r, p.m) !== 'enfant' && p.duty?.kind !== 'work' && p.prepEnd === null);
      for (const o of others) expect(need(g) - need(o)).toBeLessThan(30);
    }
    expect(n).toBeGreaterThan(20);
  });

  it('centre de loisirs : jour de vacances, parents au travail → écoliers accompagnés comme un jour d’école', () => {
    let n = 0;
    const july = Array.from({ length: 10 }, (_, i) => ctx(addDays({ y: 2026, m: 7, d: 13 }, i))).filter((day) => day.weekday >= 1 && day.weekday <= 5 && !day.publicHoliday);
    for (const { seed, dwellings } of TOWNS) {
      for (const d of dwellings) {
        for (const day of july) {
          const hd = householdDays(d, day, seed);
          for (const k of hd.people) {
            if (!k.blocks.some((b) => b.label === 'centre de loisirs')) continue;
            n++;
            expect(day.schoolOn).toBe(false);
            expect(k.school?.kind).toBe('ecole');
            const parents = d.hh.members[k.m]!.who.parents;
            expect(parents.every((p) => hd.people[p]!.duty?.kind === 'work')).toBe(true);
            expect(hd.run).not.toBeNull();
            expect(k.out.some(([a, b]) => a <= 500 && b >= SCHOOL.pickup)).toBe(true);
          }
        }
      }
    }
    expect(n).toBeGreaterThan(10);
  });

  it('chez les grands-parents : emmené par l’adulte qui part, ramené par le premier qui rentre (samedis de deux parents en restauration)', () => {
    const seed = 25;
    const d = cityDwellings(cityFacades(1440, 340, seed), seed).find((x) => x.id === '52:3')!;
    let n = 0;
    for (let i = 0; i < 60; i++) {
      const day = ctx(addDays({ y: 2026, m: 1, d: 3 }, i));
      const hd = householdDays(d, day, seed);
      const adults = hd.people.filter((p) => d.hh.members[p.m]!.who.status !== 'enfant');
      for (const k of hd.people) {
        for (const b of k.blocks.filter((x) => x.label.startsWith('chez les grands-parents'))) {
          n++;
          const span = k.out.find(([a, e]) => a <= b.a && e >= b.b)!;
          // Départ avec un adulte qui sort à la même minute ; retour quand le premier adulte est rentré, avant le coucher.
          expect(adults.some((a) => a.out.some(([x]) => x === span[0]))).toBe(true);
          expect(adults.some((a) => a.out.some(([, e]) => e === span[1]))).toBe(true);
          expect(adults.every((a) => inside(a.out, span[1] - 1))).toBe(true);
          expect(span[1]).toBeLessThan(k.bed);
        }
      }
    }
    expect(n).toBeGreaterThan(3);
  });

  it('adultes sans travail malades : ni rendez-vous, ni cours, ni sortie', () => {
    let n = 0;
    for (const r of ROWS) {
      for (const p of r.hd.people) {
        if (!p.sick || p.duty) continue;
        n++;
        expect(p.appointment).toBeNull();
        expect(p.school).toBeNull();
        expect(p.outing).toBeNull();
        expect(p.blocks.filter((b) => b.a > 0 && (b.k === 'out' || b.k === 'rdv' || b.k === 'class' || b.k === 'outing'))).toEqual([]);
      }
    }
    expect(n).toBeGreaterThan(10);
  });

  it('foyer away : out = [[0, 1800]] pour tous ; leaves : départs communs à at', () => {
    const seen = { away: 0, leaves: 0, returns: 0 };
    for (const r of ROWS) {
      const { state, at } = r.hd.away;
      if (state === 'home') continue;
      seen[state]++;
      for (const p of r.hd.people) {
        if (state === 'away') expect(p.out).toEqual([[0, 1800]]);
        if (state === 'leaves') expect(p.out.at(-1)).toEqual([at, 1800]);
        if (state === 'returns') expect(p.out[0]).toEqual([0, at]);
      }
      expect(r.hd.run).toBeNull();
    }
    expect(seen.away).toBeGreaterThan(0);
    expect(seen.leaves).toBeGreaterThan(0);
    expect(seen.returns).toBeGreaterThan(0);
  });

  it('nounou de deux parents en restauration : jamais plus de 6 h sans pause, enfants jamais seuls (graine 25, toute l\'année)', () => {
    const seed = 25;
    const d = cityDwellings(cityFacades(1440, 340, seed), seed).find((x) => x.id === '52:3')!;
    expect(d.hh.members.filter((x) => x.who.contract === 'hcr').length).toBe(2);
    const days: { iso: string; shifts: [number, number][] }[] = [];
    let long = 0;
    for (let i = 0; i < 371; i++) {
      const day = ctx(addDays({ y: 2025, m: 12, d: 29 }, i));
      const hd = householdDays(d, day, seed);
      const shifts = (hd.nanny?.shifts ?? []).map(([a, b]): [number, number] => [a, b]);
      days.push({ iso: day.iso, shifts });
      if (shifts.length > 1) long++;
      for (const [a, b] of shifts) expect(b - a).toBeLessThanOrEqual(LAW.noBreakMax);
      const adults = hd.people.filter((p) => d.hh.members[p.m]!.who.status !== 'enfant');
      for (const k of hd.people) {
        const who = d.hh.members[k.m]!.who;
        if (who.status !== 'enfant' || who.age >= 11) continue;
        for (let t = Math.max(0, k.wake); t < k.bed; t++) {
          if (inside(k.out, t)) continue;
          const ok = adults.some((a) => !inside(a.out, t)) || (hd.nanny?.visits ?? []).some((v) => t >= v.arrive && t < v.leave);
          if (!ok) expect.fail(`${day.iso} : ${who.first} seul à ${t}`);
        }
      }
    }
    expect(long).toBeGreaterThan(20);
    expect(checkLabourLaw(days, false, 'nounou')).toEqual([]);
  });
});
