import { useSyncExternalStore } from 'react';

export const LIGHT_KEY = 'wmt:library-light';
const listeners = new Set<() => void>();

// Actif par défaut : seule la valeur « off » l'éteint ; un stockage inaccessible laisse la lumière allumée.
export function readLight(): boolean {
  try {
    return localStorage.getItem(LIGHT_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeLight(on: boolean): void {
  try {
    localStorage.setItem(LIGHT_KEY, on ? 'on' : 'off');
  } catch {
    /* stockage indisponible : réglage non conservé */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useLightEnabled(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, readLight, () => true);
  return [on, writeLight];
}
