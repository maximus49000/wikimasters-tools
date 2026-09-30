import { readSlot, writeSlot, type SlotStorage } from './session-slot';

export type PendingStorage = SlotStorage;

const KEY = 'wmt:pendingSearch';
const MAX_AGE_MS = 60_000;

// Recherche demandée depuis une fiche : elle survit à la navigation vers la page Marché,
// puis s'efface d'elle-même.
export function setPendingSearch(storage: PendingStorage, slug: string, now: number): void {
  writeSlot(storage, KEY, { slug }, now);
}

export function takePendingSearch(storage: PendingStorage, now: number): string | null {
  const value = readSlot<{ slug?: unknown }>(storage, KEY, MAX_AGE_MS, now, true);
  return typeof value?.slug === 'string' ? value.slug : null;
}
