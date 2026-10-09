import { useCallback, useMemo, useRef, useState } from 'react';
import {
  HYPER_S, STILL_EVENTS, activeEvents, cityEventSchedule, conditionsKey, eventConditions, hyperStartMinute, mergeSchedules, type CityEvent,
} from '../core/library/city/events';
import type { CityContext, CityIntensity } from '../core/library/city/intensity';
import { laneSpeeds, type Vehicle } from '../core/library/city/vehicles';

export type CityEventsState = { schedule: CityEvent[]; active: CityEvent[]; yielded: ReadonlySet<string>; ambulances: CityEvent[]; check: (t: number) => void };
type Args = { seed: number; width: number; city: CityContext; intensity: CityIntensity; vehicles: Vehicle[]; still: boolean; frozenT: number };

// Minute de la scène au début du grand créneau (« ancre ») : le programme est recalculé quand elle change. En heure réelle,
// elle est constante pendant tout le grand créneau ; un changement d'heure à la main la fait sauter. Aux heures fixes
// (jour, nuit, heure choisie), l'heure de la scène ne bouge pas alors que l'horloge avance : l'ancre recule d'une minute
// par minute. Règle : on suit l'ancre quand elle avance (même d'une minute : heure réelle dont la minute, rafraîchie
// toutes les 30 s, était en retard au début du grand créneau, ou heure avancée à la main) ou quand elle recule d'au moins
// ANCHOR_STEP minutes ; la dérive des heures fixes ne provoque donc qu'un recalcul toutes les 5 min, sans saut visible
// grâce à la fusion des programmes.
const ANCHOR_STEP = 5;
// Écart signé sur le cadran de 24 h, dans [-720, 720).
const minuteShift = (from: number, to: number): number => ((((to - from + 720) % 1440) + 1440) % 1440) - 720;

type Kept = { hyper: number; seed: number; width: number; vehicles: Vehicle[]; schedule: CityEvent[] };

// Programme des événements du grand créneau en cours (20 min). Recalculé seulement si le grand créneau change, si une
// condition passe un seuil (nuit, pluie, jour ouvré, circulation, piétons) ou si l'heure de la scène s'écarte de
// l'horloge (changement d'heure à la main). Un recalcul en cours de grand créneau garde les événements déjà partis et ne
// prend du nouveau programme que ceux à venir (`mergeSchedules`) : rien ne disparaît ni n'apparaît en pleine traversée.
// Après un rechargement, la partie passée du grand créneau suit les conditions du moment (le programme n'est pas
// enregistré). `clock` = instant du dernier changement de l'ensemble des événements actifs : la boucle d'animation
// appelle `check(t)` à chaque image et ne provoque un re-rendu que lorsque cet ensemble change.
export function useCityEvents({ seed, width, city, intensity, vehicles, still, frozenT }: Args): CityEventsState {
  const [clock, setClock] = useState(() => (still ? frozenT : Date.now() / 1000));
  const hyper = Math.floor(clock / HYPER_S);
  const cond = useMemo(() => eventConditions(city, intensity), [city, intensity]);
  const key = conditionsKey(cond);
  // Lus au moment du calcul (la clé suffit à décider quand recalculer).
  const condRef = useRef(cond);
  condRef.current = cond;
  // Ancre gardée tant qu'elle ne fait que reculer de moins de ANCHOR_STEP minutes (voir plus haut).
  const nowS = still ? frozenT : Date.now() / 1000;
  const rawAnchor = hyperStartMinute(city.minutes, nowS, hyper);
  const anchorRef = useRef<{ hyper: number; anchor: number } | null>(null);
  const shift = anchorRef.current ? minuteShift(anchorRef.current.anchor, rawAnchor) : 0;
  if (!anchorRef.current || anchorRef.current.hyper !== hyper || shift > 0 || shift <= -ANCHOR_STEP) {
    anchorRef.current = { hyper, anchor: rawAnchor };
  }
  const anchor = anchorRef.current.anchor;
  const keptRef = useRef<Kept | null>(null);
  const schedule = useMemo(() => {
    const next = cityEventSchedule({ seed, width, hyper, minutesAtHyperStart: anchor, cond: condRef.current, vehicles, speeds: laneSpeeds(seed) });
    const prev = keptRef.current;
    const t = still ? frozenT : Date.now() / 1000;
    const same = prev !== null && prev.hyper === hyper && prev.seed === seed && prev.width === width && prev.vehicles === vehicles;
    const merged = same ? mergeSchedules(prev.schedule, next, t) : next;
    keptRef.current = { hyper, seed, width, vehicles, schedule: merged };
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, width, hyper, key, anchor, vehicles, still, frozenT]);
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
