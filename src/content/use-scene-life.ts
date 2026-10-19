import { useMemo, useRef } from 'react';
import { addDays, dayContext, type DayContext } from '../core/library/city/calendar';
import type { Facade } from '../core/library/city/facades';
import { gullMinutes } from '../core/library/city/gulls';
import { homeState, type HomeState } from '../core/library/city/home-state';
import { cityDwellings, type Dwelling } from '../core/library/city/households';
import type { CityContext } from '../core/library/city/intensity';
import { dayDraw, sceneDay, type SceneDay } from '../core/library/city/scene-day';
import { buildSchedule, type LightTone, type Schedule } from '../core/library/city/schedules';

// Vie des logements d'une scène Ville (spec 2026-10-19 « vie au-dessus de la rue » §5.1) : foyers des façades, emplois du
// temps du jour et de la veille (la soirée de la veille déborde après minuit), calculés une fois par (façades, graine, jour,
// météo humide, déménagement) et partagés entre les calques (cache du module, `sharedSceneLife`) ; l'état à la minute
// (`homeState`) est relu par les calques (fenêtres allumées, vie aux fenêtres). Sans contexte de ville (aperçus) : null, les
// calques gardent l'allumage du chantier 1.

// byFacadeHome : logement par `${façade}:${logement}` (= `Dwelling.id`, `data-home` du calque des fenêtres).
export type SceneLife = { dwellings: Dwelling[]; today: Map<string, Schedule>; yesterday: Map<string, Schedule>; day: SceneDay; byFacadeHome: Map<string, Dwelling> };
type Weather = { precip: number; snow: boolean; storm: boolean };

const schedulesOf = (dwellings: readonly Dwelling[], day: SceneDay, seed: number): Map<string, Schedule> =>
  new Map(dwellings.map((d) => [d.id, buildSchedule(d, day, dayDraw(d, day, seed))]));

// Calcul pur (tests, cache) : la veille vient de `day.yesterday` (useCityDay, mêmes périodes de vacances), à défaut d'un
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
// Vies gardées (les plus récentes) : un changement de jour, de largeur ou de météo humide en ajoute une.
const CACHE_MAX = 4;

// Cache partagé du module. CityScene (calque des fenêtres, vue classique) et le calque de la vie aux fenêtres (city-life,
// tâche 9) calculent chacun leurs façades (`cityFacades` : tableaux distincts mais identiques) ; via `useSceneLife` ou
// `sharedSceneLife`, ils obtiennent le MÊME objet SceneLife, sans recalculer les emplois du temps, tant que la clé ne change
// pas : signature des logements (tout ce que les emplois du temps lisent d'un logement ; le foyer vient de la graine et de
// `key`), graine, jour et veille (iso, genre, semaine de vacances), humide, déménagement. Les valeurs sont des fonctions
// pures de la clé : le cache ne change aucun résultat, il évite seulement de les refaire.
const perFacades = new WeakMap<readonly Facade[], Map<number, { dwellings: Dwelling[]; sig: string }>>();
function dwellingsOf(facades: readonly Facade[], seed: number): { dwellings: Dwelling[]; sig: string } {
  let bySeed = perFacades.get(facades);
  if (!bySeed) perFacades.set(facades, (bySeed = new Map()));
  let hit = bySeed.get(seed);
  if (!hit) {
    const dwellings = cityDwellings(facades, seed);
    const sig = dwellings.map((d) => [d.id, d.key, d.floorIdx, d.bays.join(';'), d.rooms.length, d.balcony, d.shutters, d.doorX, d.climb].join(',')).join('|');
    bySeed.set(seed, (hit = { dwellings, sig }));
  }
  return hit;
}
const lives = new Map<string, SceneLife>();
const dayKey = (d: DayContext | undefined): string => (d ? [d.iso, d.kind, d.holidayWeek ?? '-'].join('/') : '-');

export function sharedSceneLife(facades: readonly Facade[], day: DayContext, wet: boolean, seed: number, moving: boolean): SceneLife {
  const { dwellings, sig } = dwellingsOf(facades, seed);
  const key = [sig, seed, dayKey(day), dayKey(day.yesterday), wet, moving].join('#');
  let life = lives.get(key);
  if (life) lives.delete(key); // replacée en dernier : la plus récente
  else {
    // sceneDay ne lit de la météo que l'état humide (même seuil) : précipitations 1 ou 0 suffisent.
    life = buildSceneLife(facades, day, { precip: wet ? 1 : 0, snow: false, storm: false }, seed, moving, dwellings);
    while (lives.size >= CACHE_MAX) lives.delete(lives.keys().next().value!);
  }
  lives.set(key, life);
  return life;
}

export function useSceneLife(facades: readonly Facade[], city: CityContext | undefined, seed: number, moving: boolean): SceneLife | null {
  const day = city?.day;
  // Seule la bascule humide / sec change les emplois du temps (sceneDay : même seuil) : pas de recalcul à chaque goutte.
  const wet = city ? city.precip >= WET_PRECIP || city.storm : false;
  return useMemo(
    () => (day ? sharedSceneLife(facades, day, wet, seed, moving) : null),
    // `day` est lu par ce qui fait le jour de scène (date, genre, semaine de vacances, et de même pour la veille) : un nouvel
    // objet du même jour ne recalcule rien.
    [facades, seed, day?.iso, day?.kind, day?.holidayWeek, day?.yesterday?.iso, day?.yesterday?.kind, day?.yesterday?.holidayWeek, wet, moving], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

// État de chaque logement à la minute `m` (nuit de la veille comprise), par `Dwelling.id`. CityScene le calcule une fois par
// minute et le passe au calque des fenêtres.
export function lifeStates(life: SceneLife, m: number): Map<string, HomeState> {
  const out = new Map<string, HomeState>();
  for (const d of life.dwellings) out.set(d.id, homeState(d, life.today.get(d.id)!, life.yesterday.get(d.id) ?? null, m));
  return out;
}

// Teintes affichées par fenêtre (clé choisie par l'appelant), remises à zéro quand `reset` change (autres façades).
export function useToneMemory(reset: unknown): Map<string, LightTone> {
  const ref = useRef<{ reset: unknown; tones: Map<string, LightTone> } | null>(null);
  if (!ref.current || ref.current.reset !== reset) ref.current = { reset, tones: new Map() };
  return ref.current.tones;
}

// Lumière d'une fenêtre de logement : allumée si sa pièce l'est (`homeState`) et qu'il fait sombre (`dark` : nuit, ou ciel
// de mauvais temps comme au chantier 1 : on allume par temps d'orage en journée ; jamais en plein jour normal). La teinte
// n'est lue que pièce allumée ; éteinte, la fenêtre garde la dernière teinte affichée (`tones`, clé `key`) : une fenêtre
// télé ne vire pas au jaune pendant son fondu de sortie, et rien n'est réécrit. `fallback` : teinte d'une fenêtre jamais
// allumée. null : fenêtre inconnue de la vie (logement ou pièce absents).
export function windowLight(life: SceneLife, states: ReadonlyMap<string, HomeState>, group: string, bay: number, dark: boolean, tones: Map<string, LightTone>, key: string, fallback: LightTone): { lit: boolean; tone: LightTone } | null {
  const st = states.get(group);
  const room = st ? life.byFacadeHome.get(group)?.roomOfWindow.get(bay) : undefined;
  if (!st || !room) return null;
  const lit = dark && !!st.lit[room];
  if (lit) tones.set(key, st.tone[room] ?? fallback);
  return { lit, tone: tones.get(key) ?? fallback };
}

// Minute fractionnaire de la scène qui avance avec l'horloge murale (même en heure fixe) : voir `gullMinutes`.
export const sceneMinute = gullMinutes;
