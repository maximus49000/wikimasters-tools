import type { TourStep } from '../core/whats-new/types';
import { clearSlot, readSlot, writeSlot, type SlotStorage } from './session-slot';

// L'interface qui a lancé la visite : on y revient à la fin (WikiHow, ou la liste « Quoi de neuf » avec ses éléments).
export type TourOrigin = { kind: 'wikihow' } | { kind: 'whatsnew'; entries: string[]; fixes: string[] };

export type TourSession = { steps: TourStep[]; index: number; origin: string; cardSlug?: string; from?: TourOrigin };

const KEY = 'wmt:tour';
const RETURN_KEY = 'wmt:tourReturn';
const MAX_AGE_MS = 600_000;

export const saveTourSession = (storage: SlotStorage, session: TourSession, now: number): void => writeSlot(storage, KEY, session, now);
export const clearTourSession = (storage: SlotStorage): void => clearSlot(storage, KEY);

const isIds = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

function parseOrigin(value: unknown): TourOrigin | undefined {
  const origin = value as { kind?: unknown; entries?: unknown; fixes?: unknown } | null | undefined;
  if (origin?.kind === 'wikihow') return { kind: 'wikihow' };
  if (origin?.kind === 'whatsnew' && isIds(origin.entries) && isIds(origin.fixes)) return { kind: 'whatsnew', entries: origin.entries, fixes: origin.fixes };
  return undefined;
}

// La visite en cours (jamais consommée : elle se poursuit d'une page à l'autre) ; rend null si elle est expirée ou illisible.
export function loadTourSession(storage: SlotStorage, now: number): TourSession | null {
  const value = readSlot<Partial<TourSession>>(storage, KEY, MAX_AGE_MS, now, false);
  if (!value || !Array.isArray(value.steps) || typeof value.index !== 'number' || typeof value.origin !== 'string') return null;
  const from = parseOrigin(value.from);
  return {
    steps: value.steps,
    index: value.index,
    origin: value.origin,
    ...(typeof value.cardSlug === 'string' ? { cardSlug: value.cardSlug } : {}),
    ...(from ? { from } : {}),
  };
}

// Retour à l'interface de départ quand la visite a dû quitter la page : il survit au rechargement, puis s'efface.
export const saveTourReturn = (storage: SlotStorage, from: TourOrigin, now: number): void => writeSlot(storage, RETURN_KEY, { from }, now);

export function takeTourReturn(storage: SlotStorage, now: number): TourOrigin | null {
  const value = readSlot<{ from?: unknown }>(storage, RETURN_KEY, MAX_AGE_MS, now, true);
  return parseOrigin(value?.from) ?? null;
}
