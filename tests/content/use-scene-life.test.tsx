// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as personDay from '../../src/core/library/city/person-day';

vi.mock('../../src/core/library/city/person-day', async (orig) => {
  const actual = await orig<typeof import('../../src/core/library/city/person-day')>();
  return { ...actual, householdDays: vi.fn(actual.householdDays) };
});
import { buildSceneLife, sceneMinute, sharedSceneLife, useSceneLife, type SceneLife } from '../../src/content/use-scene-life';
import { addDays, dayContext, holidayWeekOf, type DayContext, type HolidayPeriod } from '../../src/core/library/city/calendar';
import { cityFacades, type Facade } from '../../src/core/library/city/facades';
import { cityDwellings } from '../../src/core/library/city/households';
import { gullMinutes } from '../../src/core/library/city/gulls';
import type { CityContext } from '../../src/core/library/city/intensity';
import { dwellingDay } from '../../src/core/library/city/dwelling-day';
import { sceneDay } from '../../src/core/library/city/scene-day';
import { homeState } from '../../src/core/library/city/home-state';
import { skyAt, sunTimes } from '../../src/core/library/sky';
import { CityScene } from '../../src/content/scene-city';

// Vie des logements d'une scène Ville (tâche 8) : foyers, emplois du temps du jour et de la veille, mémorisés par jour.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const facades = cityFacades(720, 340, 5);
const DATE = { y: 2026, m: 10, d: 14 };
const cityOf = (day: DayContext, o: Partial<CityContext> = {}): CityContext => ({ minutes: 1200, day, precip: 0, snow: false, storm: false, daylight: 0, ...o });

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

function probe(): { current: SceneLife | null; renders: SceneLife[] } {
  return { current: null, renders: [] };
}
// Un seul composant (même type d'un rendu à l'autre : le hook garde sa mémoire).
type ProbeProps = { out: ReturnType<typeof probe>; f: readonly Facade[]; city: CityContext | undefined; seed: number; moving: boolean };
function Probe({ out, f, city, seed, moving }: ProbeProps) {
  const life = useSceneLife(f, city, seed, moving);
  out.current = life;
  if (life) out.renders.push(life);
  return null;
}
function renderLife(out: ReturnType<typeof probe>, f: readonly Facade[], city: CityContext | undefined, seed = 5, moving = false): void {
  act(() => root.render(<Probe out={out} f={f} city={city} seed={seed} moving={moving} />));
}

describe('vie des logements de la scène', () => {
  it('sans contexte de ville : null (ancien allumage)', () => {
    const out = probe();
    renderLife(out, facades, undefined);
    expect(out.current).toBeNull();
  });

  it('emplois du temps du jour et de la veille, un par logement, identiques au calcul pur', () => {
    const day = dayContext(DATE, []);
    const life = buildSceneLife(facades, day, { precip: 0, snow: false, storm: false }, 5, false);
    const dwellings = cityDwellings(facades, 5);
    expect(life.dwellings.map((d) => d.id)).toEqual(dwellings.map((d) => d.id));
    expect(life.today.size).toBe(dwellings.length);
    expect(life.yesterday.size).toBe(dwellings.length);
    for (const d of dwellings) expect(life.byFacadeHome.get(d.id)!.id).toBe(d.id);
    const sd = sceneDay(day, { precip: 0, snow: false, storm: false }, 5);
    expect(life.day).toEqual(sd);
    const prev = sceneDay(dayContext(addDays(DATE, -1), []), { precip: 0, snow: false, storm: false }, 5);
    const d0 = dwellings[0]!;
    expect(life.today.get(d0.id)).toEqual(dwellingDay(d0, day, sd, 5).schedule);
    expect(life.yesterday.get(d0.id)).toEqual(dwellingDay(d0, dayContext(addDays(DATE, -1), []), prev, 5).schedule);
  });

  it('semaine de vacances : `holidayWeek` du contexte transmis au jour de scène et à la veille', () => {
    const periods: HolidayPeriod[] = [{ name: 'test', start: '2026-10-17', end: '2026-11-02' }];
    // Dimanche 25 octobre : week-end d'une semaine de vacances (mercredi 21 en vacances) ; la veille aussi.
    const date = { y: 2026, m: 10, d: 25 };
    expect(holidayWeekOf(date, periods)).toBe(true);
    // Samedi 17 : 1er jour des vacances, mais le mercredi 14 de sa semaine est un jour d'école.
    expect(holidayWeekOf({ y: 2026, m: 10, d: 17 }, periods)).toBe(false);
    const day: DayContext = { ...dayContext(date, periods), holidayWeek: true, yesterday: { ...dayContext(addDays(date, -1), periods), holidayWeek: true } };
    const life = buildSceneLife(facades, day, { precip: 0, snow: false, storm: false }, 5, false);
    expect(life.day.holidayWeek).toBe(true);
    // Sans l'information : retombe sur le genre du jour (un dimanche n'est pas « holiday »).
    const bare = buildSceneLife(facades, dayContext(date, periods), { precip: 0, snow: false, storm: false }, 5, false);
    expect(bare.day.holidayWeek).toBe(false);
  });

  it('mémorisé par (façades, graine, jour, humide, déménagement) : même objet à la minute suivante', () => {
    const out = probe();
    const day = dayContext(DATE, []);
    renderLife(out, facades, cityOf(day, { minutes: 1200 }));
    renderLife(out, facades, cityOf(day, { minutes: 1201, daylight: 0.1, precip: 0.1 }));
    expect(out.renders.length).toBe(2);
    expect(out.renders[1]).toBe(out.renders[0]);
    // Pluie : nouvel emploi du temps (clé humide).
    renderLife(out, facades, cityOf(day, { precip: 0.7 }));
    expect(out.renders[2]).not.toBe(out.renders[0]);
    expect(out.renders[2]!.day.wet).toBe(true);
    // Nouveau jour.
    renderLife(out, facades, cityOf(dayContext(addDays(DATE, 1), []), { precip: 0.7 }));
    expect(out.renders[3]!.day.iso).toBe('2026-10-15');
    // Déménagement de commerce.
    renderLife(out, facades, cityOf(dayContext(addDays(DATE, 1), []), { precip: 0.7 }), 5, true);
    expect(out.renders[4]!.day.moving).toBe(true);
  });

  it('même jour, autre genre (calendrier scolaire arrivé) : recalcul', () => {
    const out = probe();
    const day = dayContext(DATE, []);
    renderLife(out, facades, cityOf(day));
    renderLife(out, facades, cityOf({ ...day, kind: 'holiday', schoolOn: false }));
    expect(out.renders[1]).not.toBe(out.renders[0]);
    expect(out.renders[1]!.day.kind).toBe('holiday');
    renderLife(out, facades, cityOf({ ...day, yesterday: { ...dayContext(addDays(DATE, -1), []), kind: 'holiday' } }));
    expect(out.renders[2]).not.toBe(out.renders[0]);
  });

  it('soleil du lieu : lever et coucher du contexte jusqu’au jour de scène, dans la clé du cache', () => {
    const out = probe();
    const day = dayContext(addDays(DATE, 60), []);
    const paris = sunTimes(day.date, { lat: 48.85, lon: 2.35 }, 60);
    const oslo = sunTimes(day.date, { lat: 59.91, lon: 10.75 }, 60);
    renderLife(out, facades, cityOf(day));
    renderLife(out, facades, cityOf(day, { sun: paris }));
    renderLife(out, facades, cityOf(day, { minutes: 1201, sun: { ...paris } as typeof paris }));
    renderLife(out, facades, cityOf(day, { sun: oslo }));
    const [none, p1, p2, o] = out.renders;
    // Sans lieu : table de Paris du mois (décembre : 16 h 54).
    expect(none!.day.sunset).toBe(Math.round(16.9 * 60));
    expect(p1!.day.sunset).toBe(Math.round((paris as { sunset: number }).sunset));
    expect(p1).not.toBe(none);
    // Même soleil (nouvel objet à la minute suivante) : même vie.
    expect(p2).toBe(p1);
    expect(o!.day.sunset).toBe(Math.round((oslo as { sunset: number }).sunset));
    expect(o).not.toBe(p1);
    // Le cache partagé reçoit le même soleil : même vie.
    expect(sharedSceneLife(facades, day, false, 5, false, oslo)).toBe(o);
  });

  it('cache partagé : deux calques aux façades identiques (tableaux distincts) reçoivent la même vie', () => {
    const day = dayContext(addDays(DATE, 40), []);
    const a = sharedSceneLife(cityFacades(720, 340, 5), day, false, 5, false);
    const b = sharedSceneLife(cityFacades(720, 340, 5), { ...day }, false, 5, false);
    expect(b).toBe(a);
    // Même résultat que le calcul pur.
    expect(a.today).toEqual(buildSceneLife(facades, day, { precip: 0, snow: false, storm: false }, 5, false).today);
    // Clé différente : autre vie (graine, humide, largeur).
    expect(sharedSceneLife(cityFacades(720, 340, 5), day, true, 5, false)).not.toBe(a);
    expect(sharedSceneLife(cityFacades(1080, 340, 5), day, false, 5, false)).not.toBe(a);
    // Et par le hook : deux composants, une seule vie.
    const out = probe();
    renderLife(out, cityFacades(720, 340, 5), cityOf(day));
    expect(out.current).toBe(a);
  });

  it('sceneMinute = gullMinutes', () => {
    expect(sceneMinute).toBe(gullMinutes);
  });

  it('vue classique : même allumage que la vie des logements (homeState, de nuit seulement)', () => {
    const times = sunTimes(DATE, { lat: 48.85, lon: 2.35 }, 120);
    const f = cityFacades(720, 340, 3);
    const day = dayContext(DATE, []);
    const life = buildSceneLife(f, day, { precip: 0, snow: false, storm: false }, 3, false);
    const slots = f.flatMap((b, i) => (b.far ? [] : b.lamps.flatMap((win) => (win.home < 0 ? [] : [{ win, id: `${i}:${win.home}` }]))));
    let on = 0;
    for (const minutes of [7 * 60, 13 * 60, 21 * 60, 23 * 60 + 30, 45]) {
      const sky = skyAt(minutes, times);
      act(() => root.render(<svg><CityScene width={720} height={340} sky={sky} minutes={minutes} seed={3} city={cityOf(day, { minutes, daylight: sky.daylight })} /></svg>));
      const rects = [...container.querySelectorAll('rect[data-lamp]')];
      expect(rects.length).toBe(slots.length);
      slots.forEach(({ win, id }, k) => {
        const d = life.byFacadeHome.get(id)!;
        const st = homeState(d, life.today.get(id)!, life.yesterday.get(id)!, minutes);
        const want = sky.daylight < 0.7 && !!st.lit[d.roomOfWindow.get(win.bay)!];
        if (want) on++;
        expect(rects[k]!.getAttribute('data-lit'), `${id} ${minutes}`).toBe(want ? 'true' : 'false');
      });
    }
    expect(on).toBeGreaterThan(0);
  });

  it('buildSceneLife : days et visits pour chaque logement, prevDays = journées de la veille', () => {
    const day = dayContext(DATE, []);
    const life = buildSceneLife(facades, day, { precip: 0, snow: false, storm: false }, 5, false);
    const prevCtx = dayContext(addDays(DATE, -1), []);
    expect(life.days.size).toBe(life.dwellings.length);
    expect(life.visits.size).toBe(life.dwellings.length);
    expect(life.prevDays.size).toBe(life.dwellings.length);
    expect(life.prevVisits.size).toBe(life.dwellings.length);
    const prevSd = sceneDay(prevCtx, { precip: 0, snow: false, storm: false }, 5);
    for (const d of life.dwellings.slice(0, 8)) {
      expect(life.days.get(d.id)!.iso).toBe('2026-10-14');
      expect(life.prevDays.get(d.id)!.iso).toBe('2026-10-13');
      expect(life.visits.get(d.id)).toEqual(dwellingDay(d, day, life.day, 5).visits);
      expect(life.prevVisits.get(d.id)).toEqual(dwellingDay(d, prevCtx, prevSd, 5).visits);
    }
  });

  it('deux appels du même jour → même objet (cache), aucun recalcul', () => {
    const day = dayContext(addDays(DATE, 90), []);
    const spy = vi.mocked(personDay.householdDays);
    const a = sharedSceneLife(facades, day, false, 5, false);
    const n = spy.mock.calls.length;
    expect(n).toBeGreaterThan(0);
    expect(sharedSceneLife(facades, { ...day }, false, 5, false)).toBe(a);
    expect(spy.mock.calls.length).toBe(n);
  });

  it('minuit : la veille de la nouvelle vie reprend les journées d’hier déjà calculées (même contenu qu’un calcul à neuf)', () => {
    const day = dayContext(addDays(DATE, 120), []);
    const next = dayContext(addDays(DATE, 121), []);
    const today = sharedSceneLife(facades, day, false, 5, false);
    const spy = vi.mocked(personDay.householdDays);
    const before = spy.mock.calls.length;
    const tomorrow = sharedSceneLife(facades, { ...next, yesterday: day }, false, 5, false);
    // Seul le nouveau jour est calculé : un appel par logement.
    expect(spy.mock.calls.length - before).toBe(today.dwellings.length);
    for (const d of today.dwellings) expect(tomorrow.prevDays.get(d.id)).toBe(today.days.get(d.id));
    const fresh = buildSceneLife(facades, { ...next, yesterday: day }, { precip: 0, snow: false, storm: false }, 5, false);
    expect(tomorrow.yesterday).toEqual(fresh.yesterday);
    expect(tomorrow.prevVisits).toEqual(fresh.prevVisits);
  });

  it('bascule humide / sec ou déménagement : journées des habitants non recalculées, emplois du temps refaits', () => {
    const day = dayContext(addDays(DATE, 150), []);
    const dry = sharedSceneLife(facades, day, false, 5, false);
    const spy = vi.mocked(personDay.householdDays);
    const n = spy.mock.calls.length;
    const wet = sharedSceneLife(facades, day, true, 5, false);
    const moving = sharedSceneLife(facades, day, false, 5, true);
    expect(spy.mock.calls.length).toBe(n);
    expect(wet).not.toBe(dry);
    for (const d of dry.dwellings) { expect(wet.days.get(d.id)).toBe(dry.days.get(d.id)); expect(moving.days.get(d.id)).toBe(dry.days.get(d.id)); }
    const fresh = buildSceneLife(facades, day, { precip: 1, snow: false, storm: false }, 5, false);
    expect(wet.today).toEqual(fresh.today);
  });
});
