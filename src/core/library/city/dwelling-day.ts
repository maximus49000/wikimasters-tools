import type { DayContext } from './calendar';
import type { DecorTask } from './halloween';
import type { HouseholdMeals } from './home-rooms';
import type { Dwelling } from './households';
import { householdDays, type HouseholdDays } from './person-day';
import { dayDraw, type DayDraw, type SceneDay } from './scene-day';
import { buildSchedule, mealsOf, type Schedule } from './schedules';
import { dayVisits, type Visit } from './visitors';

// Journée d'un logement (plan 2026-10-25 « journées des habitants », tâche 10) : tirage du jour (invités, scènes
// facultatives, extinctions), journées de chaque habitant, repas du foyer, visites et emploi du temps qui en découle.
// Fonction pure de (logement, jour, graine) : la vie de la scène la calcule une fois par jour et par logement (et pour la
// veille), jamais par image. `ctx` : contexte du calendrier (périodes de vacances comprises, `ctx.periods`) ; `day` : jour
// de scène correspondant (`sceneDay`).
export type DwellingDay = { draw: DayDraw; hd: HouseholdDays; meals: HouseholdMeals; visits: Visit[]; schedule: Schedule };

export function dwellingDay(d: Dwelling, ctx: DayContext, day: SceneDay, seed: number, decor: readonly DecorTask[] = []): DwellingDay {
  const draw = dayDraw(d, day, seed);
  const hd = householdDays(d, ctx, seed);
  const meals = mealsOf(d, hd);
  const visits = dayVisits(d, hd, meals, day, seed, draw.guests);
  return { draw, hd, meals, visits, schedule: buildSchedule(d, day, draw, hd, visits, decor) };
}
