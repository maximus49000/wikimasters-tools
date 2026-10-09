import { useMemo } from 'react';
import { dayContext, type DayContext, type YMD } from '../core/library/city/calendar';

// PROVISOIRE (vague 1a, tâche 7) : jours fériés seulement, sans vacances scolaires.
// Remplacé en tâche 8 par le vrai `useCityDay` (zone scolaire et calendrier lus via le relais, avec cache).
// Renvoie un DayContext stable tant que la date ne change pas.
export function useCityDay(date: YMD): DayContext {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => dayContext(date, []), [date.y, date.m, date.d]);
}
