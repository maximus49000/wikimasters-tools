// @vitest-environment jsdom
// tests/content/use-city-events.test.tsx
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCityEvents, type CityEventsState } from '../../src/content/use-city-events';
import { dayContext } from '../../src/core/library/city/calendar';
import { HYPER_S, activeEvents, cityEventSchedule, eventConditions, hyperStartMinute, type CityEvent } from '../../src/core/library/city/events';
import { cityIntensity, type CityContext } from '../../src/core/library/city/intensity';
import { laneSpeeds, vehiclesFor, type Vehicle } from '../../src/core/library/city/vehicles';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: { root: Root; host: HTMLDivElement }[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const VEHICLES: Vehicle[] = vehiclesFor(720, 1);
const DAY = dayContext({ y: 2026, m: 10, d: 5 }, []);
const cityAt = (minutes: number, precip = 0): CityContext => ({ minutes, day: DAY, precip, snow: false, storm: false, daylight: 1 });

function Probe({ city, out }: { city: CityContext; out: { current: CityEventsState | null } }): ReactElement | null {
  out.current = useCityEvents({ seed: 1, width: 720, city, intensity: cityIntensity(city), vehicles: VEHICLES, still: false, frozenT: 0 });
  return null;
}

// Monte la sonde à l'instant T (horloge murale) ; `update` la re-rend avec une autre ville, éventuellement plus tard.
const probe = (T: number, city: CityContext) => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(T * 1000);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  const out: { current: CityEventsState | null } = { current: null };
  act(() => root.render(<Probe city={city} out={out} />));
  return {
    get: () => out.current!,
    update: (next: CityContext, at = T) => {
      now.mockReturnValue(at * 1000);
      act(() => root.render(<Probe city={next} out={out} />));
    },
  };
};

const scheduleFor = (hyper: number, anchor: number, city: CityContext): CityEvent[] =>
  cityEventSchedule({ seed: 1, width: 720, hyper, minutesAtHyperStart: anchor, cond: eventConditions(city, cityIntensity(city)), vehicles: VEHICLES, speeds: laneSpeeds(1) });

describe('useCityEvents', () => {
  it('le même instant donne le même programme, qu’on charge à la seconde 5 ou 55 de la minute', () => {
    // Grand créneau qui commence à 9 h 00 (heure de la scène = heure UTC ici) : à une minute près, le camion-poubelle
    // (jusqu'à 9 h) est permis ou non. On cherche un jour où cette minute change le programme.
    let hyper = -1;
    for (let d = 20_700; d < 21_700 && hyper < 0; d++) {
      const h = (d * 86_400 + 9 * 3600) / HYPER_S;
      const c = cityAt(547);
      if (JSON.stringify(scheduleFor(h, 540, c)) !== JSON.stringify(scheduleFor(h, 539, c))) hyper = h;
    }
    expect(hyper).toBeGreaterThan(0);
    const m0 = hyper * HYPER_S + 7 * 60; // 9 h 07
    const early = probe(m0 + 5, cityAt(547)).get().schedule;
    const late = probe(m0 + 55, cityAt(547)).get().schedule;
    expect(late).toEqual(early);
    expect(early).toEqual(scheduleFor(hyper, 540, cityAt(547)));
  });

  it('changer l’heure à la main (8 h → 14 h) change le programme : plus de camion-poubelle à venir', () => {
    // Même clé de conditions à 8 h et à 14 h (jour, sec, jour ouvré, circulation et piétons au-dessus des seuils).
    let T = -1;
    for (let h = 1_491_000; h < 1_492_000 && T < 0; h++) {
      const t = h * HYPER_S + 60;
      if (scheduleFor(h, hyperStartMinute(480, t, h), cityAt(480)).some((e) => e.id === 'garbage-truck' && e.start > t)) T = t;
    }
    expect(T).toBeGreaterThan(0);
    const p = probe(T, cityAt(480));
    const before = p.get().schedule;
    expect(before.some((e) => e.id === 'garbage-truck' && e.start > T)).toBe(true);
    p.update(cityAt(840));
    const after = p.get().schedule;
    expect(after).not.toBe(before);
    expect(after.some((e) => e.id === 'garbage-truck' && e.start > T)).toBe(false);
  });

  it('heure fixe : pas de recalcul à chaque minute (seulement à partir de 5 min de dérive)', () => {
    const T = 1_491_000 * HYPER_S + 30;
    const p = probe(T, cityAt(480));
    const first = p.get().schedule;
    for (let k = 1; k <= 4; k++) {
      p.update(cityAt(480), T + k * 60);
      expect(p.get().schedule).toBe(first);
    }
  });

  it('heure réelle : une minute en retard au début du grand créneau est rattrapée dès qu’elle est rafraîchie', () => {
    // Grand créneau qui commence à 10 h (cerf-volant et avion à banderole permis à partir de 10 h) : on cherche un créneau
    // où l'ancre 9 h 59 donne un autre avenir que 10 h 00, pour que le test ne passe pas à vide.
    const future = (s: CityEvent[], at: number) => s.filter((e) => e.start > at);
    let hyper = -1;
    for (let h = 1_491_000; h < 1_493_000 && hyper < 0; h++) {
      const at = h * HYPER_S + 20;
      if (JSON.stringify(future(scheduleFor(h, 599, cityAt(600)), at)) !== JSON.stringify(future(scheduleFor(h, 600, cityAt(600)), at))) hyper = h;
    }
    expect(hyper).toBeGreaterThan(0);
    const T = hyper * HYPER_S + 2;
    // 2 s après le début du grand créneau, la minute de la scène (rafraîchie toutes les 30 s) est encore l'ancienne.
    const p = probe(T, cityAt(599));
    expect(future(p.get().schedule, T + 20)).toEqual(future(scheduleFor(hyper, 599, cityAt(600)), T + 20));
    p.update(cityAt(600), T + 20);
    expect(future(p.get().schedule, T + 20)).toEqual(future(scheduleFor(hyper, 600, cityAt(600)), T + 20));
  });

  it('un changement de condition en cours de grand créneau laisse finir les événements déjà partis', () => {
    let T = -1;
    for (let h = 1_491_000; h < 1_492_000 && T < 0; h++) {
      const s = scheduleFor(h, hyperStartMinute(600, h * HYPER_S + 600, h), cityAt(600));
      const sky = activeEvents(s, h * HYPER_S + 600).find((e) => e.id === 'drone' || e.id === 'balloon' || e.id === 'kite');
      if (sky) T = h * HYPER_S + 600;
    }
    expect(T).toBeGreaterThan(0);
    const p = probe(T, cityAt(600));
    const active = p.get().active;
    // La pluie rend drone, montgolfière et cerf-volant inéligibles : ceux déjà partis finissent quand même.
    p.update(cityAt(600, 0.7));
    const schedule = p.get().schedule;
    for (const e of active) expect(schedule).toContain(e);
    expect(activeEvents(schedule, T).map((e) => e.key)).toEqual(active.map((e) => e.key));
    expect(schedule.filter((e) => e.start > T).some((e) => e.id === 'drone' || e.id === 'balloon' || e.id === 'kite')).toBe(false);
  });
});
