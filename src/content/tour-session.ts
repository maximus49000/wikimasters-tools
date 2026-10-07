import type { TourStep } from '../core/whats-new/types';
import { clearSlot, readSlot, writeSlot, type SlotStorage } from './session-slot';

export type TourSession = { steps: TourStep[]; index: number; origin: string; cardSlug?: string };

const KEY = 'wmt:tour';
const MAX_AGE_MS = 600_000;

export const saveTourSession = (storage: SlotStorage, session: TourSession, now: number): void => writeSlot(storage, KEY, session, now);
export const clearTourSession = (storage: SlotStorage): void => clearSlot(storage, KEY);

// La visite en cours (jamais consommée : elle se poursuit d'une page à l'autre) ; rend null si elle est expirée ou illisible.
export function loadTourSession(storage: SlotStorage, now: number): TourSession | null {
  const value = readSlot<Partial<TourSession>>(storage, KEY, MAX_AGE_MS, now, false);
  if (!value || !Array.isArray(value.steps) || typeof value.index !== 'number' || typeof value.origin !== 'string') return null;
  return { steps: value.steps, index: value.index, origin: value.origin, ...(typeof value.cardSlug === 'string' ? { cardSlug: value.cardSlug } : {}) };
}
