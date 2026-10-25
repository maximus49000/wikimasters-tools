import { describe, expect, it } from 'vitest';
import { addDays, dayContext, type YMD } from '../../../../src/core/library/city/calendar';
import { cityFacades } from '../../../../src/core/library/city/facades';
import { cityDwellings, type Dwelling } from '../../../../src/core/library/city/households';
import { cullAnimated, homeState, litShare, MAX_ANIM, trackValue, type HomeState } from '../../../../src/core/library/city/home-state';
import { dwellingDay } from '../../../../src/core/library/city/dwelling-day';
import { sceneDay } from '../../../../src/core/library/city/scene-day';
import type { Schedule, Segment } from '../../../../src/core/library/city/schedules';
import { windowsLitFraction } from '../../../../src/core/library/city/window-lights';

const W = 1440;
const H = 340;
const dry = { precip: 0, snow: false, storm: false };
const VAC = [{ name: 'Toussaint', start: '2026-10-17', end: '2026-11-02' }];
const TUESDAY: YMD = { y: 2026, m: 10, d: 13 };
const dwellingsOf = (seed: number): Dwelling[] => cityDwellings(cityFacades(W, H, seed), seed);
const scheduleOf = (d: Dwelling, date: YMD, seed: number): Schedule => {
  const ctx = dayContext(date, VAC);
  return dwellingDay(d, ctx, sceneDay(ctx, dry, seed), seed).schedule;
};
// Logement fictif à trois pièces (volets au choix) et emplois du temps écrits à la main.
const base = dwellingsOf(3).find((d) => d.rooms.length === 3)!;
const fake = (id: string, shutters: Dwelling['shutters'] = 'persienne'): Dwelling => ({ ...base, id, shutters });
const sch = (dwelling: string, segments: Segment[], shutUser = true): Schedule => ({ dwelling, segments, shutUser, maxActors: 0 });
const act = (t0: number, t1: number, choreo: Extract<Segment, { k: 'act' }>['choreo'], x: Partial<Extract<Segment, { k: 'act' }>> = {}): Segment =>
  ({ k: 'act', t0, t1, room: 'cuisine', where: 'in', choreo, m: 0, ...x });

describe('piste de valeur', () => {
  it('avant le premier événement : valeur initiale ; pendant : glissement ; après : valeur visée', () => {
    const evts = [{ t: 100, to: 1, dur: 2 }, { t: 300, to: 0, dur: 1 }];
    expect(trackValue([], 50, 0.4)).toBe(0.4);
    expect(trackValue(evts, 50, 0)).toBe(0);
    expect(trackValue(evts, 101, 0)).toBeCloseTo(0.5, 9);
    expect(trackValue(evts, 200, 0)).toBe(1);
    expect(trackValue(evts, 400, 0)).toBe(0);
  });
});

describe('état d\'un logement à la minute', () => {
  it('même (logement, minute) → même état', () => {
    const ds = dwellingsOf(5);
    const yest = addDays(TUESDAY, -1);
    for (const d of ds.slice(0, 40)) {
      const today = scheduleOf(d, TUESDAY, 5), y = scheduleOf(d, yest, 5);
      for (const m of [0, 437, 1210.5, 1439]) expect(homeState(d, today, y, m)).toEqual(homeState(d, scheduleOf(d, TUESDAY, 5), scheduleOf(d, yest, 5), m));
    }
  });

  it('minuit : une soirée de la veille qui déborde reste allumée à 0 h 01', () => {
    const d = fake('a');
    const yest = sch('a', [{ k: 'lit', room: 'salon', t0: 1300, t1: 1500, tone: 'tv' }, act(1400, 1480, 'tv', { room: 'salon' })]);
    const today = sch('a', []);
    expect(homeState(d, yest, null, 1439).lit.salon).toBe(true);
    const st = homeState(d, today, yest, 1);
    expect(st.lit.salon).toBe(true);
    expect(st.tone.salon).toBe('tv');
    expect(st.lit.cuisine).toBe(false);
    expect(st.actors).toHaveLength(1);
    expect(st.actors[0]!.t).toBeCloseTo(41, 9);
    expect(st.actors[0]!.p).toBeCloseTo(41 / 80, 9);
    expect(homeState(d, today, yest, 61).lit.salon).toBe(false);
    // Sur la ville réelle : tout logement allumé à 23 h 59 dont la lumière continue après minuit l'est encore à 0 h 01.
    let seen = 0;
    for (const seed of [1, 2, 3]) {
      for (const dw of dwellingsOf(seed)) {
        const y = scheduleOf(dw, addDays(TUESDAY, -1), seed), y2 = scheduleOf(dw, addDays(TUESDAY, -2), seed);
        const t = scheduleOf(dw, TUESDAY, seed);
        const before = homeState(dw, y, y2, 1439), after = homeState(dw, t, y, 1);
        for (const g of y.segments) {
          if (g.k !== 'lit' || g.t0 > 1439 || g.t1 <= 1441) continue;
          if (y.segments.some((s) => s.k === 'dim' && s.t0 <= 1441 && s.t1 > 1439)) continue;
          seen++;
          expect(before.lit[g.room]).toBe(true);
          expect(after.lit[g.room]).toBe(true);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('dim : toutes les pièces éteintes sauf la cuisine ; événement : priorité 5', () => {
    const d = fake('b');
    const st = homeState(d, sch('b', [
      { k: 'lit', room: 'salon', t0: 0, t1: 100, tone: 'warm' }, { k: 'lit', room: 'cuisine', t0: 0, t1: 100, tone: 'warm' },
      { k: 'dim', t0: 10, t1: 50 }, act(10, 50, 'lean', { room: 'salon', where: 'lean', event: true }), act(10, 50, 'cook', { m: 1 }),
    ]), null, 20);
    expect(st.dim).toBe(true);
    expect(st.lit).toEqual({ cuisine: true, chambre: false, salon: false });
    expect(st.actors.map((a) => [a.choreo, a.prio, a.animated])).toEqual([['lean', 5, false], ['cook', 1, true]]);
  });

  it('borne : jamais plus de 8 animés non écartés ; une scène écartée garde sa lumière et ses volets', () => {
    const items = Array.from({ length: 14 }, (_, i) => {
      const d = fake(`c${i}`);
      const s = sch(d.id, [
        { k: 'lit', room: 'cuisine', t0: 0, t1: 100, tone: 'warm' }, { k: 'shut', room: 'cuisine', t: 30, to: 1, dur: 1.3 },
        act(25, 40, 'cook'), act(25, 40, 'openShutters', { m: 1 }),
      ]);
      return { st: homeState(d, s, null, 30.5), x: i * 100 };
    });
    const before = items.map(({ st }) => JSON.stringify({ lit: st.lit, tone: st.tone, shut: st.shut, curt: st.curt, win: st.win }));
    const res = cullAnimated(items, 700);
    expect(res).toEqual({ animated: 28, shown: MAX_ANIM });
    const live = items.flatMap(({ st }) => st.actors).filter((a) => a.animated && !a.culled);
    expect(live).toHaveLength(MAX_ANIM);
    expect(items.flatMap(({ st }) => st.actors).filter((a) => a.culled)).toHaveLength(20);
    items.forEach(({ st }, i) => expect(JSON.stringify({ lit: st.lit, tone: st.tone, shut: st.shut, curt: st.curt, win: st.win })).toBe(before[i]));
    // Ville réelle, soirée et matin : la borne tient (poses fixes non bornées, jamais écartées).
    for (const seed of [1, 2]) {
      const ds = dwellingsOf(seed);
      for (const m of [430, 470, 1150, 1260]) {
        const its = ds.map((d, i) => ({ st: homeState(d, scheduleOf(d, TUESDAY, seed), scheduleOf(d, addDays(TUESDAY, -1), seed), m), x: i * 20 }));
        const r = cullAnimated(its, 720);
        const all = its.flatMap(({ st }) => st.actors);
        expect(all.filter((a) => a.animated && !a.culled).length).toBe(r.shown);
        expect(r.shown).toBeLessThanOrEqual(MAX_ANIM);
        expect(all.filter((a) => !a.animated && a.culled)).toHaveLength(0);
      }
    }
  });

  it('priorité : un retour (cross) passe avant la cuisine ; à égalité, le plus proche du centre', () => {
    const mk = (i: number, choreo: 'cook' | 'cross', x: number): { st: HomeState; x: number } => {
      const d = fake(`p${i}`);
      return { st: homeState(d, sch(d.id, [act(0, 10, choreo, { room: choreo === 'cross' ? 'salon' : 'cuisine' })]), null, 5), x };
    };
    const items = [mk(0, 'cross', 5000), ...Array.from({ length: 9 }, (_, i) => mk(i + 1, 'cook', 500 + (i % 2 ? 1 : -1) * (i + 1) * 10))];
    expect(cullAnimated(items, 500)).toEqual({ animated: 10, shown: 8 });
    expect(items[0]!.st.actors[0]!.culled).toBe(false);
    const culled = items.filter(({ st }) => st.actors[0]!.culled).map(({ x }) => Math.abs(x - 500)).sort((a, b) => a - b);
    expect(culled).toEqual([80, 90]);
    // Un nouvel appel recalcule tout (un acteur gardé n'est plus marqué écarté).
    cullAnimated(items.slice(0, 3), 500);
    expect(items.slice(0, 3).every(({ st }) => !st.actors[0]!.culled)).toBe(true);
  });

  it('volets : valeur continue de la veille à 0 h', () => {
    const d = fake('v');
    const yest = sch('v', [{ k: 'shut', room: 'salon', t: 480, to: 1, dur: 1.3 }, { k: 'shut', room: 'salon', t: 1438.5, to: 0, dur: 3 }, { k: 'curt', room: 'salon', t: 1300, to: 1, dur: 0.5 }]);
    const today = sch('v', [{ k: 'shut', room: 'salon', t: 470, to: 1, dur: 1.3 }]);
    const late = homeState(d, yest, null, 1440 - 1e-9);
    const early = homeState(d, today, yest, 0);
    expect(early.shut.salon).toBeCloseTo(late.shut.salon!, 6);
    expect(early.shut.salon).toBeGreaterThan(0);
    expect(early.shut.salon).toBeLessThan(1);
    expect(early.curt.salon).toBe(1);
    expect(homeState(d, today, yest, 300).shut.salon).toBe(0);
    expect(homeState(d, today, yest, 500).shut.salon).toBe(1);
    // Sans volets : toujours ouverts ; foyer absent qui ferme ses volets : fermés tout le jour.
    expect(homeState(fake('n', null), sch('n', []), null, 600).shut).toEqual({ cuisine: 1, chambre: 1, salon: 1 });
    expect(homeState(d, sch('v', []), yest, 600).shut.salon).toBe(0);
    expect(homeState(d, sch('v', [], false), null, 600).shut.salon).toBe(1);
    // Ville réelle : volets, rideaux et fenêtres continus au passage de minuit.
    for (const seed of [1, 4]) {
      for (const dw of dwellingsOf(seed)) {
        const y2 = scheduleOf(dw, addDays(TUESDAY, -2), seed), y = scheduleOf(dw, addDays(TUESDAY, -1), seed), t = scheduleOf(dw, TUESDAY, seed);
        const a = homeState(dw, y, y2, 1440 - 1e-9), b = homeState(dw, t, y, 0);
        for (const room of dw.rooms) {
          expect(b.shut[room]).toBeCloseTo(a.shut[room]!, 6);
          expect(b.curt[room]).toBeCloseTo(a.curt[room]!, 6);
          expect(b.win[room]).toBeCloseTo(a.win[room]!, 6);
        }
      }
    }
  });

  it('cuisine et chambre : rideaux ouverts à midi pour un foyer réel', () => {
    let seen = 0;
    for (const seed of [1, 2]) {
      for (const dw of dwellingsOf(seed)) {
        const y = scheduleOf(dw, addDays(TUESDAY, -1), seed), t = scheduleOf(dw, TUESDAY, seed);
        const st = homeState(dw, t, y, 720);
        for (const room of ['cuisine', 'chambre'] as const) {
          if (!dw.rooms.includes(room) || [...y.segments, ...t.segments].some((g) => g.k === 'curt' && g.room === room)) continue;
          seen++;
          expect(st.curt[room]).toBe(0);
        }
      }
    }
    expect(seen).toBeGreaterThan(50);
    // Pièce fictive : rideaux de cuisine ouverts sans piste, tirés au salon avant le premier événement.
    const st = homeState(fake('r'), sch('r', []), null, 720);
    expect(st.curt).toEqual({ cuisine: 0, chambre: 0, salon: 1 });
  });

  // Depuis les journées de chacun (tâche 10), une pièce n'est allumée que si quelqu'un y est : la part allumée suit la
  // forme de la courbe horaire (soirée haute, nuit noire) sans la dépasser (une famille à 21 h n'allume que le salon).
  it('part allumée : forme de la courbe horaire, jamais au-dessus', () => {
    const day = { weekday: 2, kind: 'school' as const };
    const rows: string[] = [];
    const share: Record<number, number> = {};
    for (const h of [7, 8, 20, 21, 23, 1, 3]) {
      const m = h * 60;
      let sum = 0;
      for (const seed of [1, 2, 3, 4, 5]) {
        const items = dwellingsOf(seed).map((d) => ({ d, today: scheduleOf(d, TUESDAY, seed), yesterday: scheduleOf(d, addDays(TUESDAY, -1), seed) }));
        const s = litShare(items, m), want = windowsLitFraction(m, day);
        rows.push(`${h} h graine ${seed} : ${s.toFixed(3)} / ${want.toFixed(3)}`);
        expect(s, rows.join('\n')).toBeLessThanOrEqual(want + 0.05);
        sum += s;
      }
      share[h] = sum / 5;
    }
    const msg = rows.join('\n');
    expect(share[20]!, msg).toBeGreaterThan(0.5);
    expect(share[21]!, msg).toBeGreaterThan(0.35);
    expect(share[20]!, msg).toBeGreaterThan(share[8]!);
    expect(share[8]!, msg).toBeGreaterThan(share[7]!);
    expect(share[23]!, msg).toBeGreaterThan(share[1]!);
    expect(share[1]!, msg).toBeGreaterThanOrEqual(share[3]!);
    expect(share[3]!, msg).toBeLessThanOrEqual(0.02);
  });
});

describe('pistes précalculées', () => {
  it('volets, rideaux et fenêtres : même valeur que le calcul direct des pistes, sur un échantillon', () => {
    // Calcul direct (ancien : pistes refaites à chaque appel).
    const direct = (dw: Dwelling, today: Schedule, y: Schedule | null, m: number, k: 'shut' | 'curt' | 'win', room: Dwelling['rooms'][number]) => {
      const days: [Schedule, number][] = y ? [[y, -1440], [today, 0]] : [[today, 0]];
      const evts: { t: number; to: number; dur: number }[] = [];
      for (const [s, off] of days) for (const g of s.segments) if (g.k === k && g.room === room) evts.push({ t: g.t + off, to: g.to, dur: g.dur });
      evts.sort((a, b) => a.t - b.t);
      const init = k === 'shut' ? (dw.shutters !== null && days[0]![0].shutUser ? 0 : 1) : k === 'curt' ? (evts.length || room === 'salon' ? 1 : 0) : 0;
      return k === 'shut' && dw.shutters === null ? 1 : trackValue(evts, m, init);
    };
    let n = 0;
    for (const dw of dwellingsOf(2).slice(0, 40)) {
      const y = scheduleOf(dw, addDays(TUESDAY, -1), 2), t = scheduleOf(dw, TUESDAY, 2);
      for (const m of [0, 300, 455.5, 480, 1080.25, 1200, 1439.9]) {
        for (const eve of [y, null]) {
          const st = homeState(dw, t, eve, m);
          for (const room of dw.rooms) for (const k of ['shut', 'curt', 'win'] as const) {
            n++;
            expect(st[k][room]).toBe(direct(dw, t, eve, m, k, room));
          }
        }
      }
    }
    expect(n).toBeGreaterThan(1000);
  });
});

describe('retraité en hiver', () => {
  it('à la fermeture des volets de la cuisine, la cuisine du retraité présent est allumée', () => {
    const DEC: YMD = { y: 2026, m: 12, d: 15 };
    let checked = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) for (const d of dwellingsOf(seed)) {
      if (d.hh.type !== 'retraite' || !d.shutters) continue;
      const sc = scheduleOf(d, DEC, seed);
      const kitchen = d.rooms.includes('cuisine') ? 'cuisine' : 'salon';
      const close = sc.segments.find((g) => g.k === 'shut' && g.room === kitchen && g.to === 0 && g.t > 900 && g.t < 1300);
      if (!close || close.k !== 'shut') continue;
      checked++;
      expect(sc.segments.some((g) => g.k === 'lit' && g.room === kitchen && g.t0 <= close.t && close.t < g.t1)).toBe(true);
    }
    expect(checked).toBeGreaterThan(3);
  });
});
