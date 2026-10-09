import { useSyncExternalStore } from 'react';
import { ZONES, type Zone } from '../core/library/city/zones';

export type ZoneChoice = 'auto' | Zone;

export const ZONE_KEY = 'wmt:library-zone';
const listeners = new Set<() => void>();

// Automatique par défaut : une valeur inconnue ou un stockage inaccessible donnent « auto ».
export function readZone(): ZoneChoice {
  try {
    const raw = localStorage.getItem(ZONE_KEY);
    return (ZONES as readonly string[]).includes(raw ?? '') ? (raw as Zone) : 'auto';
  } catch {
    return 'auto';
  }
}

export function writeZone(choice: ZoneChoice): void {
  try {
    localStorage.setItem(ZONE_KEY, choice);
  } catch {
    /* stockage indisponible : réglage non conservé */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useZoneChoice(): [ZoneChoice, (c: ZoneChoice) => void] {
  const choice = useSyncExternalStore(subscribe, readZone, () => 'auto' as ZoneChoice);
  return [choice, writeZone];
}
