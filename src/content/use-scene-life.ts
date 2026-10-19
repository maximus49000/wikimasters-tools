import { useMemo } from 'react';
import { addDays, dayContext, type DayContext } from '../core/library/city/calendar';
import type { Facade } from '../core/library/city/facades';
import { gullMinutes } from '../core/library/city/gulls';
import { homeState, type HomeState } from '../core/library/city/home-state';
import { cityDwellings, type Dwelling } from '../core/library/city/households';
import type { CityContext } from '../core/library/city/intensity';
import { dayDraw, sceneDay, type SceneDay } from '../core/library/city/scene-day';
import { buildSchedule, type Schedule } from '../core/library/city/schedules';

// Vie des logements d'une scène Ville (spec 2026-10-19 « vie au-dessus de la rue » §5.1) : foyers des façades, emplois du
// temps du jour et de la veille (la soirée de la veille déborde après minuit), calculés une fois par (façades, graine, jour,
// météo humide, déménagement) ; l'état à la minute (`homeState`) est relu à chaque rendu par les calques (fenêtres allumées,
// vie aux fenêtres). Sans contexte de ville (aperçus) : null, les calques gardent l'allumage du chantier 1.

// byFacadeHome : logement par `${façade}:${logement}` (= `Dwelling.id`, `data-home` du calque des fenêtres).
export type SceneLife = { dwellings: Dwelling[]; today: Map<string, Schedule>; yesterday: Map<string, Schedule>; day: SceneDay; byFacadeHome: Map<string, Dwelling> };
type Weather = { precip: number; snow: boolean; storm: boolean };

const schedulesOf = (dwellings: readonly Dwelling[], day: SceneDay, seed: number): Map<string, Schedule> =>
  new Map(dwellings.map((d) => [d.id, buildSchedule(d, day, dayDraw(d, day, seed))]));

// Calcul pur (tests, hook) : la veille vient de `day.yesterday` (useCityDay, mêmes périodes de vacances), à défaut d'un
// contexte sans périodes ; même météo que le jour (celle de la veille n'est pas connue), aucun déménagement.
export function buildSceneLife(facades: readonly Facade[], day: DayContext, weather: Weather, seed: number, moving: boolean, dwellings = cityDwellings(facades, seed)): SceneLife {
  const today = sceneDay(day, weather, seed, moving, day.holidayWeek);
  const prevCtx = day.yesterday ?? dayContext(addDays(day.date, -1), []);
  const prev = sceneDay(prevCtx, weather, seed, false, prevCtx.holidayWeek);
  return {
    dwellings,
    today: schedulesOf(dwellings, today, seed),
    yesterday: schedulesOf(dwellings, prev, seed),
    day: today,
    byFacadeHome: new Map(dwellings.map((d) => [d.id, d])),
  };
}

const WET_PRECIP = 0.3;

export function useSceneLife(facades: readonly Facade[], city: CityContext | undefined, seed: number, moving: boolean): SceneLife | null {
  const dwellings = useMemo(() => cityDwellings(facades, seed), [facades, seed]);
  const day = city?.day;
  const iso = day?.iso ?? null;
  // Seule la bascule humide / sec change les emplois du temps (sceneDay : même seuil) : pas de recalcul à chaque goutte.
  const wet = city ? city.precip >= WET_PRECIP || city.storm : false;
  const holidayWeek = day?.holidayWeek;
  const prevIso = day?.yesterday?.iso;
  return useMemo(
    () => (day ? buildSceneLife(facades, day, { precip: wet ? 1 : 0, snow: false, storm: false }, seed, moving, dwellings) : null),
    // `day` est lu par sa date (iso) et ce qui en dérive : un nouvel objet du même jour ne recalcule rien.
    [dwellings, seed, iso, wet, moving, holidayWeek, prevIso], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

// État de chaque logement à la minute `m` (nuit de la veille comprise), par `Dwelling.id`.
export function lifeStates(life: SceneLife, m: number): Map<string, HomeState> {
  const out = new Map<string, HomeState>();
  for (const d of life.dwellings) out.set(d.id, homeState(d, life.today.get(d.id)!, life.yesterday.get(d.id) ?? null, m));
  return out;
}

// Minute fractionnaire de la scène qui avance avec l'horloge murale (même en heure fixe) : voir `gullMinutes`.
export const sceneMinute = gullMinutes;
