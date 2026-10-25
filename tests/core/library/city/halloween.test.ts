import { describe, expect, it } from 'vitest';
import { addDays, dayContext, type YMD } from '../../../../src/core/library/city/calendar';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { DECOR_SCENE, decorLit, decorShown, decorSwitch, decorTasks, halloweenPlan, halloweenPlanFor, halloweenYear, type HwItem } from '../../../../src/core/library/city/halloween';
import { cityDwellings } from '../../../../src/core/library/city/households';
import { homeState } from '../../../../src/core/library/city/home-state';
import { awayState } from '../../../../src/core/library/city/leave-plan';
import { dayDraw, sceneDay } from '../../../../src/core/library/city/scene-day';
import { buildSchedule, type Schedule, type Segment } from '../../../../src/core/library/city/schedules';
import { dayNumber } from '../../../../src/core/library/city/shops/hours';
import { windowPose } from '../../../../src/core/library/city/window-choreo';

const dry = { precip: 0, snow: false, storm: false };
const VAC = [{ name: 'Toussaint', start: '2026-10-17', end: '2026-11-02' }];
const cities = [1, 2, 3, 4, 5].map((seed) => {
  const facades = cityFacades(1440, 340, seed);
  return { seed, facades, dwellings: cityDwellings(facades, seed) };
});
const planOf = (i: number, year = 2026) => halloweenPlan(cities[i]!.dwellings, cities[i]!.facades, cities[i]!.seed, year, VAC);
const date = (m: number, d: number, y = 2026): YMD => ({ y, m, d });
type Act = Extract<Segment, { k: 'act' }>;

describe('plan des décors d’Halloween', () => {
  it('n’existe que pendant la période (23 octobre – 16 novembre)', () => {
    expect(halloweenYear(date(10, 22))).toBeNull();
    expect(halloweenYear(date(10, 23))).toBe(2026);
    expect(halloweenYear(date(11, 16))).toBe(2026);
    expect(halloweenYear(date(11, 17))).toBeNull();
    const c = cities[0]!;
    expect(halloweenPlanFor(date(12, 1), c.dwellings, c.facades, c.seed)).toBeNull();
  });

  it('est déterministe, et change d’une année à l’autre', () => {
    expect(planOf(0)).toEqual(planOf(0));
    const a = planOf(0, 2026).items.map((i) => i.id).join();
    const b = planOf(0, 2027).items.map((i) => i.id).join();
    expect(a).not.toBe(b);
  });

  it('une fenêtre sur huit environ porte une citrouille, jamais toutes', () => {
    let windows = 0;
    let pumpkins = 0;
    cities.forEach((c, i) => {
      for (const f of c.facades) windows += f.lamps.filter((w) => w.home >= 0 && w.kind !== 'stair' && w.kind !== 'mezz').length;
      pumpkins += planOf(i).items.filter((it) => it.kind === 'pumpkin').length;
    });
    expect(pumpkins / windows).toBeGreaterThan(1 / 14);
    expect(pumpkins / windows).toBeLessThan(1 / 5);
  });

  it('décors de balcon : seulement sur un balcon filant, à des places différentes', () => {
    cities.forEach((c, i) => {
      const plan = planOf(i);
      const byId = new Map(c.dwellings.map((d) => [d.id, d]));
      for (const it of plan.items) {
        const d = byId.get(it.dwelling)!;
        if (it.gesture === 'balcony') {
          expect(d.balcony && !d.balconnet).toBe(true);
          expect(it.room).toBe('salon');
        }
        if (it.kind !== 'pumpkin') expect(it.gesture).toBe('balcony');
      }
      const balc = plan.items.filter((it) => it.gesture === 'balcony');
      for (const a of balc) for (const b of balc) if (a !== b && a.dwelling === b.dwelling) expect(a.dx).not.toBe(b.dx);
    });
  });

  it('un style par façade', () => {
    const plan = planOf(0);
    for (const it of plan.items) expect(plan.styles.has(it.facade)).toBe(true);
    expect(new Set(planOf(1).styles.values()).size).toBeGreaterThan(1);
  });

  it('pose du 24 au 31 octobre, retrait du 1er au 15 novembre, jamais un jour où le foyer est parti', () => {
    cities.forEach((c, i) => {
      const byId = new Map(c.dwellings.map((d) => [d.id, d]));
      for (const it of planOf(i).items) {
        expect(it.install).toBeGreaterThanOrEqual(dayNumber(date(10, 24)));
        expect(it.install).toBeLessThanOrEqual(dayNumber(date(10, 31)));
        expect(it.remove).toBeGreaterThanOrEqual(dayNumber(date(11, 1)));
        expect(it.remove).toBeLessThanOrEqual(dayNumber(date(11, 15)));
        const d = byId.get(it.dwelling)!;
        for (const n of [it.install, ...(it.remove < dayNumber(date(11, 15)) ? [it.remove] : [])]) {
          const day = new Date(n * 86_400_000);
          const ymd = { y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate() };
          expect(awayState(d, c.seed, ymd, VAC).state).not.toBe('away');
        }
      }
    });
  });

  it('Halloween : aucun décor posé un jour away', () => {
    let checked = 0;
    cities.forEach((c, i) => {
      const byId = new Map(c.dwellings.map((d) => [d.id, d]));
      for (const it of planOf(i).items) {
        const day = new Date(it.install * 86_400_000);
        const ymd = { y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate() };
        expect(awayState(byId.get(it.dwelling)!, c.seed, ymd, VAC).state).not.toBe('away');
        checked++;
      }
    });
    expect(checked).toBeGreaterThan(20);
  });

  it('les tâches d’un jour : poses le jour de pose, retraits le jour de retrait', () => {
    const plan = planOf(0);
    const it = plan.items[0]!;
    const day = new Date(it.install * 86_400_000);
    const ymd = { y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate() };
    expect(decorTasks(plan, it.dwelling, ymd).some((t) => t.item === it && !t.removing)).toBe(true);
    expect(decorTasks(plan, it.dwelling, addDays(ymd, -1)).some((t) => t.item === it)).toBe(false);
    expect(decorTasks(null, it.dwelling, ymd)).toEqual([]);
  });
});

// Emplois du temps des jours de pose et de retrait d'un décor, tels que la vie de la scène les construit.
function scheduleOn(c: (typeof cities)[number], plan: ReturnType<typeof planOf>, it: HwItem, day: number): Schedule {
  const t = new Date(day * 86_400_000);
  const ymd = { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  const ctx = dayContext(ymd, VAC);
  const sd = sceneDay({ ...ctx, holidayWeek: ctx.kind === 'holiday' || ymd.m === 10 }, dry, c.seed);
  const d = c.dwellings.find((x) => x.id === it.dwelling)!;
  return buildSchedule(d, sd, dayDraw(d, sd, c.seed), decorTasks(plan, d.id, ymd));
}

describe('gestes de pose et de retrait', () => {
  const c = cities[0]!;
  const plan = planOf(0);

  it('chaque décor est posé par une scène de l’emploi du temps (ou change d’état à l’heure prévue, sans geste)', () => {
    let scenes = 0;
    for (const it of plan.items) {
      for (const removing of [false, true]) {
        const s = scheduleOn(c, plan, it, removing ? it.remove : it.install);
        const a = s.segments.find((g): g is Act => g.k === 'act' && g.decor?.id === it.id && !!g.reverse === removing);
        if (!a) {
          expect(decorSwitch(it, removing, s)).toBe(removing ? it.rat : it.at);
          continue;
        }
        scenes++;
        expect(a.choreo).toBe(it.gesture === 'balcony' ? 'decorBalcony' : 'decorLean');
        expect(a.t1 - a.t0).toBeCloseTo(DECOR_SCENE[it.gesture].dur, 6);
        expect(a.t0).toBeGreaterThanOrEqual((removing ? it.rat : it.at) - 1e-9);
        expect(decorSwitch(it, removing, s)).toBeCloseTo(a.t0 + DECOR_SCENE[it.gesture].gesture * (a.t1 - a.t0), 6);
        // La fenêtre (porte-fenêtre) s'ouvre pour le geste.
        expect(s.segments.some((g) => g.k === 'win' && g.room === a.room && g.to === 1 && Math.abs(g.t - (a.t0 - 0.1)) < 1e-6)).toBe(true);
      }
    }
    expect(scenes).toBeGreaterThan(plan.items.length);
  });

  it('absent avant la pose, posé à mi-geste, en place jusqu’au retrait, retiré ensuite', () => {
    const it = plan.items[0]!;
    const sIn = scheduleOn(c, plan, it, it.install);
    const sOut = scheduleOn(c, plan, it, it.remove);
    const on = decorSwitch(it, false, sIn);
    const off = decorSwitch(it, true, sOut);
    expect(decorShown(it, it.install - 1, 1200, null)).toBe(false);
    expect(decorShown(it, it.install, on - 0.01, sIn)).toBe(false);
    expect(decorShown(it, it.install, on + 0.01, sIn)).toBe(true);
    expect(decorShown(it, it.install + 1, 0, null)).toBe(true);
    expect(decorShown(it, it.remove, off - 0.01, sOut)).toBe(true);
    expect(decorShown(it, it.remove, off + 0.01, sOut)).toBe(false);
    expect(decorShown(it, it.remove + 1, 600, null)).toBe(false);
  });

  it('l’objet est dans les mains avant le geste (pose), après (retrait)', () => {
    for (const it of plan.items) {
      for (const removing of [false, true]) {
        const s = scheduleOn(c, plan, it, removing ? it.remove : it.install);
        const a = s.segments.find((g): g is Act => g.k === 'act' && g.decor?.id === it.id && !!g.reverse === removing);
        if (!a) continue;
        const d = c.dwellings.find((x) => x.id === it.dwelling)!;
        const sw = decorSwitch(it, removing, s);
        const held = (m: number): boolean => {
          const st = homeState(d, s, null, m);
          const actor = st.actors.find((x) => x.decor?.id === it.id)!;
          return windowPose(actor, d)?.props.includes(it.kind) ?? false;
        };
        expect(held(sw - 0.05)).toBe(!removing);
        expect(held(sw + 0.05)).toBe(removing);
        // En mouvement réduit : pose fixe au milieu, sur place.
        const st = homeState(d, s, null, sw);
        const actor = st.actors.find((x) => x.decor?.id === it.id)!;
        expect(windowPose(actor, d, true)?.still).toBe(true);
      }
    }
  });
});

describe('lumières de fête', () => {
  const pk = { ...planOf(0).items.find((i) => i.kind === 'pumpkin')!, install: dayNumber(date(10, 25)), remove: dayNumber(date(11, 4)), off: 0.5 };
  it('allumée la nuit dès sa pose, éteinte entre 0 h 20 et 1 h 30, jamais le jour', () => {
    const d = dayNumber(date(10, 28));
    expect(decorLit(pk, d, 1200, true, null)).toBe(true);
    expect(decorLit(pk, d, 1200, false, null)).toBe(false);
    expect(decorLit(pk, d + 1, 30, true, null)).toBe(true);
    expect(decorLit(pk, d + 1, 120, true, null)).toBe(false);
  });
  it('plus allumée après la nuit du 31 au 1er novembre', () => {
    const oct31 = dayNumber(date(10, 31));
    expect(decorLit(pk, oct31, 1300, true, null)).toBe(true);
    expect(decorLit(pk, oct31 + 1, 30, true, null)).toBe(true);
    expect(decorLit(pk, oct31 + 1, 1200, true, null)).toBe(false);
    expect(decorLit(pk, oct31 + 2, 1200, true, null)).toBe(false);
  });
  it('seules les citrouilles et les araignées brillent', () => {
    const d = dayNumber(date(10, 28));
    for (const kind of ['witch', 'skeleton', 'crow'] as const) expect(decorLit({ ...pk, kind }, d, 1200, true, null)).toBe(false);
    expect(decorLit({ ...pk, kind: 'spider' }, d, 1200, true, null)).toBe(true);
  });
});
