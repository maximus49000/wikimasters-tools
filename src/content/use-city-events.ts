import { useCallback, useMemo, useRef, useState } from 'react';
import {
  HYPER_S, STILL_EVENTS, activeEvents, cityEventSchedule, conditionsKey, eventConditions, type CityEvent,
} from '../core/library/city/events';
import type { CityContext, CityIntensity } from '../core/library/city/intensity';
import { laneSpeeds, type Vehicle } from '../core/library/city/vehicles';

export type CityEventsState = { schedule: CityEvent[]; active: CityEvent[]; yielded: ReadonlySet<string>; ambulances: CityEvent[]; check: (t: number) => void };
type Args = { seed: number; width: number; city: CityContext; intensity: CityIntensity; vehicles: Vehicle[]; still: boolean; frozenT: number };

// Programme des événements du grand créneau en cours (20 min). Recalculé seulement si le grand créneau change ou si une
// condition passe un seuil (nuit, pluie, jour ouvré, circulation, piétons). `clock` = instant du dernier changement de
// l'ensemble des événements actifs : la boucle d'animation appelle `check(t)` à chaque image et ne provoque un re-rendu
// que lorsque cet ensemble change.
export function useCityEvents({ seed, width, city, intensity, vehicles, still, frozenT }: Args): CityEventsState {
  const [clock, setClock] = useState(() => (still ? frozenT : Date.now() / 1000));
  const hyper = Math.floor(clock / HYPER_S);
  const cond = useMemo(() => eventConditions(city, intensity), [city, intensity]);
  const key = conditionsKey(cond);
  // Lus au moment du calcul (la clé suffit à décider quand recalculer).
  const condRef = useRef(cond);
  condRef.current = cond;
  const minutesRef = useRef(city.minutes);
  minutesRef.current = city.minutes;
  const schedule = useMemo(() => {
    const nowS = still ? frozenT : Date.now() / 1000;
    const minutesAtHyperStart = minutesRef.current - (nowS - hyper * HYPER_S) / 60;
    return cityEventSchedule({ seed, width, hyper, minutesAtHyperStart, cond: condRef.current, vehicles, speeds: laneSpeeds(seed) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, width, hyper, key, vehicles, still, frozenT]);
  const active = useMemo(() => {
    const now = activeEvents(schedule, clock);
    return still ? now.filter((e) => STILL_EVENTS.has(e.id)) : now;
  }, [schedule, clock, still]);
  const activeKey = active.map((e) => e.key).join(',');
  const keyRef = useRef(activeKey);
  keyRef.current = activeKey;
  const check = useCallback(
    (t: number): void => {
      if (still) return;
      const next = activeEvents(schedule, t).map((e) => e.key).join(',');
      if (next !== keyRef.current || Math.floor(t / HYPER_S) !== hyper) {
        keyRef.current = next;
        setClock(t);
      }
    },
    [schedule, hyper, still],
  );
  const yielded = useMemo(() => new Set(active.flatMap((e) => e.yields)), [active]);
  const ambulances = useMemo(() => active.filter((e) => e.id === 'ambulance'), [active]);
  return { schedule, active, yielded, ambulances, check };
}
